import { mkdir, readFile, writeFile } from "node:fs/promises";

const origin = "http://127.0.0.1:4173";
const healthResponse = await fetch(`${origin}/api/pixel-agent/health`);
if (!healthResponse.ok) throw new Error(`Local agent health failed (${healthResponse.status})`);
const health = await healthResponse.json();
if (!health.ok) throw new Error("Local agent is not ready");

const input = await readFile(new URL("../test/fixtures/neet-bucket-hat.png", import.meta.url));
const response = await fetch(`${origin}/api/pixel-agent/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    imageDataUrl: `data:image/png;base64,${input.toString("base64")}`,
    instruction: "Remove the small white dot outside the hat; preserve everything else.",
    grid: 128,
  }),
  signal: AbortSignal.timeout(320000),
});
if (!response.ok) throw new Error(`Local generation failed (${response.status}): ${await response.text()}`);
const result = await response.json();
const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(result.pngDataUrl || "");
if (!match) throw new Error("Local agent returned no PNG");
const probeDir = new URL("../.probe/", import.meta.url);
await mkdir(probeDir, { recursive: true });
await writeFile(new URL("local-agent-draft.png", probeDir), Buffer.from(match[1], "base64"));
console.log(`Local agent passed: ${result.promptId} ${result.outputName}`);
