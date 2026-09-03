import { randomInt, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { loadContract } from "./contract.mjs";
import { createComfyClient } from "./comfy-client.mjs";
import { composePrompt, materializeWorkflow } from "./workflow.mjs";

const dataUrlPattern = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/;

export async function createPixelAgentService(options = {}) {
  const contract = options.contract || await loadContract(options.rootDir);
  const client = options.client || createComfyClient({
    baseUrl: contract.config.comfy.baseUrl,
    pollMilliseconds: contract.config.comfy.pollMilliseconds,
    timeoutMilliseconds: contract.config.comfy.timeoutMilliseconds,
  });
  const template = JSON.parse(await readFile(contract.workflowPath, "utf8"));

  return {
    async health() {
      const stats = await client.health();
      return { ok: true, version: stats.system?.comfyui_version || "unknown" };
    },
    async generate({ imageDataUrl, instruction, grid, profile = "standard" }) {
      const selectedProfile = contract.config.profiles?.[profile]
        || (profile === "standard" ? { grid: contract.config.grid } : null);
      if (!selectedProfile || !selectedProfile.grid.allowed.includes(grid)) {
        throw new TypeError("Unsupported profile or working grid");
      }
      const match = dataUrlPattern.exec(imageDataUrl || "");
      if (!match) throw new TypeError("Malformed image data");
      if (!contract.config.input.mimeTypes.includes(match[1])) throw new TypeError("Unsupported image MIME type");
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > contract.config.input.maxBytes) throw new RangeError("Image exceeds 24 MiB");

      const requestId = randomUUID();
      const requestFile = `${requestId}.png`;
      let inputName = "";
      try {
        inputName = await client.uploadImage(bytes, requestFile);
        const prompt = composePrompt(contract.instructions, instruction);
        const graph = materializeWorkflow(template, {
          inputName,
          prompt,
          requestId,
          seed: randomInt(1, 2 ** 31),
          denoise: selectedProfile.comfy?.denoise,
          config: contract.config,
        });
        const promptId = await client.queue(graph);
        const output = await client.waitForOutput(promptId);
        const png = await client.fetchOutput(output);
        return {
          pngDataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
          promptId,
          outputName: output.filename,
          instruction: String(instruction || ""),
          grid,
          profile,
        };
      } finally {
        // Comfy's upload route returns this exact subfolder for our request. Refuse
        // unexpected names so a bad response can never remove a sibling input.
        if (inputName === `chatnft/${requestFile}`) {
          const root = resolve(contract.config.comfy.inputDirectory);
          const target = resolve(root, "chatnft", requestFile);
          if (target.startsWith(root + sep)) await rm(target, { force: true });
        }
      }
    },
  };
}
