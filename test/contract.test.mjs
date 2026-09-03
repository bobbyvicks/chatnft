import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadContract } from "../server/contract.mjs";

test("loads the permanent Vivid contract and exact palette", async () => {
  const contract = await loadContract();
  assert.equal(contract.config.schemaVersion, 1);
  assert.deepEqual(contract.config.canvas, {
    width: 1024,
    height: 1024,
    fit: "full-canvas",
    sampling: "nearest-neighbor",
  });
  assert.deepEqual(contract.config.grid.allowed, [32, 64, 128, 160, 256]);
  assert.equal(contract.config.grid.default, 128);
  assert.deepEqual(contract.config.profiles, {
    standard: {
      label: "Standard traits (128 → 1024)",
      canvas: { width: 1024, height: 1024 },
      grid: { allowed: [32, 64, 128, 256], default: 128 },
      palette: { mode: "fixed", maxOpaqueColors: 16 },
    },
    clothing: {
      label: "Clothing — fixed project palette + locked black ink (128/256 → 1024)",
      canvas: { width: 1024, height: 1024 },
      grid: { allowed: [128, 256], default: 128 },
      palette: { mode: "clothing", maxOpaqueColors: 8 },
      comfy: { denoise: 0.4 },
    },
    skins: {
      label: "Skins (160 → 1280)",
      canvas: { width: 1280, height: 1280 },
      grid: { allowed: [160], default: 160 },
      palette: { mode: "source", maxOpaqueColors: 16 },
      canonicalMask: "assets/canonical-skin-mask-160.png",
    },
  });
  assert.equal(contract.config.palette.maxOpaqueColors, 16);
  assert.equal(contract.config.outline.color, "#000000");
  assert.equal(contract.config.outline.placement, "exterior");
  assert.equal(contract.config.source.overwrite, false);
  assert.equal(contract.config.comfy.baseUrl, "http://127.0.0.1:8188");
  assert.match(contract.config.comfy.inputDirectory, /ComfyUI-Shared[\\/]input$/);
  assert.equal(contract.palette.colors.length, 128);
  assert.equal(contract.palette.colors[0].hex, "#000000");
  assert.equal(contract.palette.colors[112].hex, "#FFFFFF");
  const paletteBytes = await readFile(new URL("../palette/vivid-fixed-128.json", import.meta.url));
  assert.equal(
    createHash("sha256").update(paletteBytes).digest("hex").toUpperCase(),
    "AAFA56807EEC58A64220DB8CD60DC26528C8F0C5168FCDB8AB98B17903BF182E",
  );
  assert.match(contract.instructions, /never crop, recenter, or move/i);
  assert.match(contract.instructions, /black exterior outline/i);
  assert.match(contract.instructions, /NEET/i);
});

test("rejects a changed contract instead of silently accepting it", async () => {
  await assert.rejects(
    () => loadContract(new URL("./fixtures/invalid-contract", import.meta.url)),
    /schemaVersion|contract/i,
  );
});
