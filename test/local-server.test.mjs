import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
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
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.once("end", () => resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
  });
  request.once("error", reject);
  request.end();
});

const withServer = async (t, service, rootDir = projectRoot, options = {}) => {
  const server = createLocalServer({ service, rootDir, ...options });
  await listen(server, "127.0.0.1", 0);
  t.after(() => close(server));
  return `http://127.0.0.1:${server.address().port}`;
};

const exactEditorPng = () => {
  const image = new PNG({ width: 1280, height: 1280 });
  image.data.set([232, 244, 66, 255], (240 * 1280 + 320) * 4);
  image.data.set([40, 55, 15, 255], (241 * 1280 + 320) * 4);
  return PNG.sync.write(image);
};

const sizedEditorPng = (width, height, alpha = 255) => {
  const image = new PNG({ width, height });
  image.data.set([232, 244, 66, alpha], 0);
  return PNG.sync.write(image);
};

const canonicalMaskPng = () => {
  const image = new PNG({ width: 160, height: 160 });
  for (let y = 24; y < 150; y++) for (let x = 18; x < 140; x++) {
    image.data.set([180, 120, 80, 255], (y * 160 + x) * 4);
  }
  return PNG.sync.write(image);
};

const skinFromCanonicalMask = (maskBytes) => {
  const mask = PNG.sync.read(maskBytes);
  const image = new PNG({ width: 1280, height: 1280 });
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    if (mask.data[(y * 160 + x) * 4 + 3] === 0) continue;
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
      image.data.set([103, 64, 46, 255], ((y * 8 + dy) * 1280 + x * 8 + dx) * 4);
    }
  }
  return image;
};

const succeedingService = {
  health: async () => ({ ok: true, version: "0.34.2" }),
  generate: async ({ instruction, grid, profile }) => ({
    pngDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    promptId: "prompt-1",
    outputName: "result.png",
    instruction,
    grid,
    profile,
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

test("serves local app files without caching stale workflow code", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("saves the exact editor PNG under the selected new-traits layer and status", async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), "chatnft-exact-save-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const origin = await withServer(t, succeedingService, projectRoot, { outputRoot });
  const bytes = exactEditorPng();
  const response = await fetch(`${origin}/api/pixel-agent/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      name: "degods-radiation",
      layer: "test-layer",
      status: "approved",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  const savedPath = join(outputRoot, "test-layer", "approved", "degods-radiation.png");
  assert.deepEqual(await readFile(savedPath), bytes);
  assert.equal(body.path, "test-layer/approved/degods-radiation.png");
  assert.equal(body.width, 1280);
  assert.equal(body.height, 1280);
  assert.equal(body.sha256, createHash("sha256").update(bytes).digest("hex"));
});

test("accepts an exact 1280 skin only when every 8x8 cell matches the canonical 160 mask", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "chatnft-canonical-skin-save-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const outputRoot = join(sandbox, "output");
  const skinMaskPath = join(sandbox, "canonical-mask.png");
  const maskBytes = canonicalMaskPng();
  await mkdir(outputRoot);
  await writeFile(skinMaskPath, maskBytes);
  const origin = await withServer(t, succeedingService, projectRoot, { outputRoot, skinMaskPath });
  const skin = skinFromCanonicalMask(maskBytes);
  const bytes = PNG.sync.write(skin);

  const response = await fetch(`${origin}/api/pixel-agent/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      name: "uniform-skin",
      layer: "skins",
      status: "wip",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await readFile(join(outputRoot, "skins", "wip", "uniform-skin.png")), bytes);
});

test("rejects a skin save when one 8x8 cell differs from the canonical body silhouette", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "chatnft-noncanonical-skin-save-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const outputRoot = join(sandbox, "output");
  const skinMaskPath = join(sandbox, "canonical-mask.png");
  const maskBytes = canonicalMaskPng();
  await mkdir(outputRoot);
  await writeFile(skinMaskPath, maskBytes);
  const origin = await withServer(t, succeedingService, projectRoot, { outputRoot, skinMaskPath });
  const skin = skinFromCanonicalMask(maskBytes);
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
    skin.data.fill(0, ((24 * 8 + dy) * 1280 + 18 * 8 + dx) * 4, ((24 * 8 + dy) * 1280 + 18 * 8 + dx) * 4 + 4);
  }
  const bytes = PNG.sync.write(skin);

  const response = await fetch(`${origin}/api/pixel-agent/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      name: "broken-skin",
      layer: "skins",
      status: "approved",
    }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /canonical 160x160 body silhouette/i);
});

test("rejects disk-save paths that could leave new-traits", async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), "chatnft-contained-save-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const origin = await withServer(t, succeedingService, projectRoot, { outputRoot });
  const bytes = exactEditorPng();
  for (const request of [
    { name: "../escape", layer: "skins", status: "approved" },
    { name: "radiation", layer: "../outside", status: "approved" },
    { name: "radiation", layer: "skins", status: "../../approved" },
  ]) {
    const response = await fetch(`${origin}/api/pixel-agent/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        ...request,
      }),
    });
    assert.equal(response.status, 400, JSON.stringify(request));
  }
});

test("rejects disk saves with unsupported dimensions or partial alpha", async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), "chatnft-invalid-save-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const origin = await withServer(t, succeedingService, projectRoot, { outputRoot });
  for (const bytes of [
    sizedEditorPng(16, 16),
    sizedEditorPng(1024, 1024, 128),
  ]) {
    const response = await fetch(`${origin}/api/pixel-agent/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        name: "invalid-editor-output",
        layer: "skins",
        status: "wip",
      }),
    });
    assert.equal(response.status, 400);
  }
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
  let queuedGraph;
  const client = {
    health: async () => ({ system: { comfyui_version: "0.34.2" } }),
    uploadImage: async (bytes, name) => {
      uploadedPath = join(chatnftDirectory, name);
      await writeFile(uploadedPath, bytes);
      return `chatnft/${name}`;
    },
    queue: async (graph) => { queuedGraph = graph; return "prompt-1"; },
    waitForOutput: async () => ({ filename: "result.png", subfolder: "chatnft", type: "output" }),
    fetchOutput: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  };
  const contract = {
    config: {
      grid: { allowed: [32, 64, 128, 256] },
      profiles: {
        clothing: {
          grid: { allowed: [128, 256] },
          comfy: { denoise: 0.4 },
        },
      },
      input: { maxBytes: 24 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
      comfy: { inputDirectory, steps: 8, cfg: 1, denoise: 0.25, sampler: "res_multistep", scheduler: "simple" },
    },
    instructions: "Preserve the pixel art.",
    workflowPath: templatePath,
  };
  const service = await createPixelAgentService({ contract, client });
  await service.generate({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 256, profile: "clothing" });
  assert.equal(queuedGraph["3"].inputs.denoise, 0.4);

  await assert.rejects(access(uploadedPath, constants.F_OK));
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  client.queue = async () => { throw new Error("queue failed"); };
  await assert.rejects(
    service.generate({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 256, profile: "clothing" }),
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

test("rejects noncanonical and zero-byte base64 before invoking ComfyUI", async (t) => {
  let generateCalls = 0;
  const origin = await withServer(t, {
    ...succeedingService,
    generate: async () => { generateCalls += 1; return succeedingService.generate({ instruction: "", grid: 128 }); },
  });
  for (const imageDataUrl of ["data:image/png;base64,A", "data:image/png;base64,"]) {
    const response = await fetch(`${origin}/api/pixel-agent/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl, instruction: "cleanup", grid: 128 }),
    });
    assert.equal(response.status, 400, imageDataUrl);
  }
  assert.equal(generateCalls, 0, "invalid image bytes reached the generation service");
});

test("rejects working grids outside the contract with 400", async (t) => {
  const origin = await withServer(t, succeedingService);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 96 }),
  });
  assert.equal(response.status, 400);
});

test("accepts the 160 grid only under the 1280 skin profile", async (t) => {
  const origin = await withServer(t, succeedingService);
  const skin = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: VALID_TINY_PNG, instruction: "faithful skin cleanup", profile: "skins", grid: 160,
    }),
  });
  assert.equal(skin.status, 200);
  assert.equal((await skin.json()).profile, "skins");

  for (const request of [
    { profile: "standard", grid: 160 },
    { profile: "skins", grid: 128 },
  ]) {
    const response = await fetch(`${origin}/api/pixel-agent/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", ...request }),
    });
    assert.equal(response.status, 400, JSON.stringify(request));
  }
});

test("accepts only the approved 128 and 256 clothing grids", async (t) => {
  const origin = await withServer(t, succeedingService);
  for (const grid of [128, 256]) {
    const response = await fetch(`${origin}/api/pixel-agent/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "clean clothing", profile: "clothing", grid }),
    });
    assert.equal(response.status, 200, `clothing ${grid}`);
  }
  const rejected = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "clean clothing", profile: "clothing", grid: 32 }),
  });
  assert.equal(rejected.status, 400);
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

test("does not serve a static file through a symlink that escapes its root", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "pixel-agent-static-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const staticRoot = join(sandbox, "static");
  const outside = join(sandbox, "outside");
  await mkdir(staticRoot);
  await mkdir(outside);
  await writeFile(join(outside, "secret.txt"), "outside contents must not be served");
  await symlink(outside, join(staticRoot, "escape"), process.platform === "win32" ? "junction" : "dir");

  const origin = await withServer(t, succeedingService, staticRoot);
  const response = await rawGet(origin, "/escape/secret.txt");
  assert.equal(response.statusCode, 404);
  assert.doesNotMatch(response.body, /outside contents/);
});

test("reports fetch-style refused ComfyUI connections as safe 503 responses", async (t) => {
  const refused = () => new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8188"), { code: "ECONNREFUSED" }),
  });
  const origin = await withServer(t, {
    ...succeedingService,
    health: async () => { throw refused(); },
    generate: async () => { throw refused(); },
  });
  const health = await fetch(`${origin}/api/pixel-agent/health`);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).error, "ComfyUI is not running");
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 128 }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "ComfyUI is not running");
});

test("maps unrelated internal TypeErrors to a stack-free 502", async (t) => {
  const origin = await withServer(t, {
    ...succeedingService,
    generate: async () => { throw new TypeError("cannot read properties of undefined"); },
  });
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "cleanup", grid: 128 }),
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "Generation failed");
  assert.doesNotMatch(JSON.stringify(body), /undefined/);
});
