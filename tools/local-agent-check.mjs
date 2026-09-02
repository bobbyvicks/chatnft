import { mkdir, readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { PNG } from "pngjs";

const origin = "http://127.0.0.1:4173";
const grid = 128;
const healthTimeoutMilliseconds = timeoutFromEnv("LOCAL_AGENT_HEALTH_TIMEOUT_MS", 10000);
const healthResponse = await fetch(`${origin}/api/pixel-agent/health`, {
  signal: AbortSignal.timeout(healthTimeoutMilliseconds),
});
if (!healthResponse.ok) throw new Error(`Local agent health failed (${healthResponse.status})`);
const health = await healthResponse.json();
if (!health.ok) throw new Error("Local agent is not ready");

const [input, config, palette, coreSource] = await Promise.all([
  readFile(new URL("../test/fixtures/neet-bucket-hat.png", import.meta.url)),
  readFile(new URL("../pixel-agent.config.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../palette/vivid-fixed-128.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../pixel-agent-core.js", import.meta.url), "utf8"),
]);
const response = await fetch(`${origin}/api/pixel-agent/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    imageDataUrl: `data:image/png;base64,${input.toString("base64")}`,
    instruction: "Remove the small white dot outside the hat; preserve everything else.",
    grid,
  }),
  signal: AbortSignal.timeout(320000),
});
if (!response.ok) throw new Error(`Local generation failed (${response.status}): ${await response.text()}`);
const result = await response.json();
const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(result.pngDataUrl || "");
if (!match) throw new Error("Local agent returned no PNG");
const draftBytes = Buffer.from(match[1], "base64");
let sourcePng;
let draftPng;
try {
  sourcePng = PNG.sync.read(input);
  draftPng = PNG.sync.read(draftBytes);
} catch {
  throw new Error("Local agent returned an unreadable PNG");
}
const sandbox = { Uint8Array, Uint8ClampedArray, window: {} };
vm.runInNewContext(coreSource, sandbox, { filename: "pixel-agent-core.js" });
const core = sandbox.window.ChatNftPixelAgent.create(config, palette.colors.map((color) => color.hex));
const sourceCanvas = core.resizeNearest(sourcePng.data, sourcePng.width, sourcePng.height, 1024, 1024);
const sourceGrid = core.recoverToGrid(sourceCanvas.data, sourceCanvas.width, sourceCanvas.height, grid);
const draftGrid = core.recoverToGrid(draftPng.data, draftPng.width, draftPng.height, grid);
const finalGrid = core.finalizeCreative(draftGrid.data, sourceGrid.data, grid, grid, { grid });
const violations = core.verify(finalGrid.data, grid, grid, { grid, alphaMask: finalGrid.alphaMask });
if (violations.length) throw new Error(`Local agent validation failed: ${violations.join("; ")}`);
if (alphaAt(finalGrid.data, grid, 87, 19) !== 0) throw new Error("Local agent retained the exterior white artifact");
if (countWhite(finalGrid.data, grid, 64, 20, 85, 42) <= 20) throw new Error("Local agent lost the interior NEET artwork");
const rendered = core.renderGridToCanvas(finalGrid.data, grid);
const finalBytes = PNG.sync.write({ width: rendered.width, height: rendered.height, data: Buffer.from(rendered.data) });
const probeDir = new URL("../.probe/", import.meta.url);
await mkdir(probeDir, { recursive: true });
await Promise.all([
  writeFile(new URL("local-agent-draft.png", probeDir), draftBytes),
  writeFile(new URL("local-agent-final.png", probeDir), finalBytes),
]);
console.log(`Local agent passed: ${result.promptId} ${result.outputName}`);

function alphaAt(data, width, x, y) {
  return data[(y * width + x) * 4 + 3];
}

function countWhite(data, width, x0, y0, x1, y1) {
  let count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * width + x) * 4;
    if (data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255 && data[offset + 3] === 255) count++;
  }
  return count;
}

function timeoutFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
