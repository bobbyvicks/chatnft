import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PNG } from "pngjs";

const checker = new URL("../tools/local-agent-check.mjs", import.meta.url);
const probe = new URL("../.probe/local-agent-draft.png", import.meta.url);
const finalProbe = new URL("../.probe/local-agent-final.png", import.meta.url);

test("rejects a data URL whose decoded bytes are not a PNG", async () => {
  const previous = await readFile(probe).catch(() => null);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/pixel-agent/health") response.end(JSON.stringify({ ok: true }));
    else response.end(JSON.stringify({
      pngDataUrl: `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`,
      promptId: "malformed-prompt",
      outputName: "malformed.png",
    }));
  });
  await new Promise((resolve, reject) => server.listen(4173, "127.0.0.1", resolve).once("error", reject));
  try {
    const result = await runChecker();
    assert.notEqual(result.code, 0, `checker accepted corrupt PNG bytes:\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /PNG|png/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous) await writeFile(probe, previous);
    else await rm(probe, { force: true });
  }
});

test("writes a verified final probe using the repaired source silhouette", async () => {
  const previousDraft = await readFile(probe).catch(() => null);
  const previousFinal = await readFile(finalProbe).catch(() => null);
  const source = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  for (let offset = 3; offset < source.data.length; offset += 4) source.data[offset] = 255;
  const opaqueDraft = PNG.sync.write(source);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/pixel-agent/health") response.end(JSON.stringify({ ok: true }));
    else response.end(JSON.stringify({
      pngDataUrl: `data:image/png;base64,${opaqueDraft.toString("base64")}`,
      promptId: "opaque-prompt",
      outputName: "opaque.png",
    }));
  });
  await new Promise((resolve, reject) => server.listen(4173, "127.0.0.1", resolve).once("error", reject));
  try {
    await rm(finalProbe, { force: true });
    const result = await runChecker();
    assert.equal(result.code, 0, result.stderr);
    const finalBytes = await readFile(finalProbe).catch(() => null);
    assert.ok(finalBytes, "checker did not write a final probe");
    const final = PNG.sync.read(finalBytes);
    assert.equal(final.width, 1024);
    assert.equal(final.height, 1024);
    assert.equal(alphaAt(final, 87 * 8 + 4, 19 * 8 + 4), 0, "outside white cell remains opaque");
    assert.ok(countOpaqueWhite(final, 64 * 8, 20 * 8, 85 * 8, 42 * 8) > 20 * 64, "NEET white detail was lost");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await restore(probe, previousDraft);
    await restore(finalProbe, previousFinal);
  }
});

test("times out a stalled health request without hanging", async () => {
  const server = createServer(() => {});
  await new Promise((resolve, reject) => server.listen(4173, "127.0.0.1", resolve).once("error", reject));
  try {
    const result = await runChecker({ LOCAL_AGENT_HEALTH_TIMEOUT_MS: "50" }, 500);
    assert.equal(result.signal, null, "checker had to be killed instead of timing itself out");
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /timeout|aborted/i);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

function runChecker(env = {}, maxWaitMilliseconds = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(checker)], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    const timer = setTimeout(() => child.kill(), maxWaitMilliseconds);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3];
}

function countOpaqueWhite(png, x0, y0, x1, y1) {
  let count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * png.width + x) * 4;
    if (png.data[offset] === 255 && png.data[offset + 1] === 255 && png.data[offset + 2] === 255 && png.data[offset + 3] === 255) count++;
  }
  return count;
}

async function restore(url, bytes) {
  if (bytes) await writeFile(url, bytes);
  else await rm(url, { force: true });
}
