import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function loadContract(rootDir = projectRoot) {
  const resolvedRoot = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const config = await readJson(join(resolvedRoot, "pixel-agent.config.json"));
  if (config.schemaVersion !== 1) throw new Error("Unsupported pixel-agent contract schemaVersion");
  if (JSON.stringify(config.grid.allowed) !== JSON.stringify([32, 64, 128, 256])) {
    throw new Error("Invalid pixel-agent contract grids");
  }
  if (config.canvas.width !== 1024 || config.canvas.height !== 1024) {
    throw new Error("Invalid pixel-agent contract canvas");
  }
  if (config.palette.maxOpaqueColors !== 16 || config.outline.color !== "#000000") {
    throw new Error("Invalid pixel-agent contract palette or outline");
  }
  const palette = await readJson(join(resolvedRoot, config.palette.file));
  const paletteHex = palette.colors.map((color) => String(color.hex).toUpperCase());
  if (paletteHex.length !== 128 || new Set(paletteHex).size !== 128) {
    throw new Error("Invalid pixel-agent palette");
  }
  const instructions = await readFile(join(resolvedRoot, "agent", "vivid-pixel-instructions.md"), "utf8");
  if (!instructions.trim()) throw new Error("Pixel-agent instructions are empty");
  return Object.freeze({
    config: Object.freeze(config),
    palette: Object.freeze(palette),
    paletteHex: Object.freeze(paletteHex),
    instructions,
    workflowPath: join(resolvedRoot, config.comfy.workflow),
  });
}
