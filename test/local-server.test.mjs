import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalServer } from "../server/local-server.mjs";
import { createPixelAgentService } from "../server/pixel-agent-service.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const VALID_TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwL8WQAAAABJRU5ErkJggg==";
const listen = (server, host, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
const rawGet = (origin, path) => new Promise((resolve, reject) => {
  const target = new URL(origin);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path }, (response) => {
    response.resume();
    response.once("end", () => resolve(response));
  });
  request.once("error", reject);
  request.end();
});

const withServer = async (t, service) => {
  const server = createLocalServer({ service, rootDir: projectRoot });
  await listen(server, "127.0.0.1", 0);
  t.after(() => close(server));
  return `http://127.0.0.1:${server.address().port}`;
};

const succeedingService = {
  health: async () => ({ ok: true, version: "0.34.2" }),
  generate: async ({ instruction, grid }) => ({
    pngDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    promptId: "prompt-1",
    outputName: "result.png",
    instruction,
    grid,
  }),
};

test("serves health and a generated PNG only on the local API", async (t) => {
  const origin = await withServer(t, succeedingService);
  assert.equal((await fetch(`${origin}/api/pixel-agent/health`)).status, 200);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "faithful cleanup", grid: 128 }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).promptId, "prompt-1");
});

test("generation deletes only its uploaded Comfy input file", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "pixel-agent-service-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const inputDirectory = join(rootDir, "input");
  const chatnftDirectory = join(inputDirectory, "chatnft");
  const sentinel = join(chatnftDirectory, "sentinel.png");
  await mkdir(chatnftDirectory, { recursive: true });
  await writeFile(sentinel, "keep");
  const templatePath = join(rootDir, "workflow.json");
  await writeFile(templatePath, JSON.stringify({
    "1": { inputs: {} }, "3": { inputs: {} }, "9": { inputs: {} }, "27": { inputs: {} },
  }));
  let uploadedPath;
  const client = {
    health: async () => ({ system: { comfyui_version: "0.34.2" } }),
    uploadImage: async (bytes, name) => {
      uploadedPath = join(chatnftDirectory, name);
      await writeFile(uploadedPath, bytes);
      return `chatnft/${name}`;
    },
    queue: async () => "prompt-1",
    waitForOutput: async () => ({ filename: "result.png", subfolder: "chatnft", type: "output" }),
    fetchOutput: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  };
  const contract = {
    config: {
      grid: { allowed: [32, 64, 128, 256] },
      input: { maxBytes: 24 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
      comfy: { inputDirectory, steps: 8, cfg: 1, denoise: 0.25, sampler: "res_multistep", scheduler: "simple" },
    },
    instructions: "Preserve the pixel art.",
    workflowPath: templatePath,
  };
  const service = await createPixelAgentService({ contract, client });
  await service.generate({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 128 });

  await assert.rejects(access(uploadedPath, constants.F_OK));
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  client.queue = async () => { throw new Error("queue failed"); };
  await assert.rejects(
    service.generate({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 128 }),
    /queue failed/,
  );
  await assert.rejects(access(uploadedPath, constants.F_OK));
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  t.diagnostic(`cleaned request input: ${uploadedPath}; sentinel retained: ${sentinel}`);
});

test("rejects malformed JSON with 400", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  });
  assert.equal(response.status, 400);
});

test("rejects unsupported image MIME types with 415", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: "data:image/gif;base64,R0lGODlh", instruction: "cleanup", grid: 128 }),
  });
  assert.equal(response.status, 415);
});

test("rejects working grids outside the contract with 400", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 96 }),
  });
  assert.equal(response.status, 400);
});

test("rejects requests whose JSON payload exceeds 24 MiB with 413", async (t) => {
  const origin = await withServer(t, succeedingService);
  const oversized = "A".repeat(25 * 1024 * 1024);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${oversized}`, instruction: "cleanup", grid: 128 }),
  });
  assert.equal(response.status, 413);
});

test("does not resolve encoded static paths outside the repository root", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await rawGet(origin, "/%2e%2e/%2e%2e/package.json");
  assert.equal(response.statusCode, 404);
});

test("reports a refused ComfyUI connection as a safe 503", async (t) => {
  const origin = await withServer(t, {
    ...succeedingService,
    generate: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:8188"); },
  });
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 128 }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "ComfyUI is not running");
});
