# Local Vivid Pixel Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local ChatNFT image-to-image workflow that sends creative edits to ComfyUI, then deterministically returns a validated 1024×1024 pixel-art PNG without moving the trait.

**Architecture:** Versioned JSON and Markdown files own the permanent art contract and creative instructions. A browser-safe pixel core normalizes, repairs, validates, and exports artwork; a loopback-only Node server owns ComfyUI upload, workflow submission, polling, and output retrieval. ChatNFT's existing converter gains a Vivid Agent path while its generic path remains unchanged.

**Tech Stack:** Static HTML/CSS/JavaScript, Canvas 2D, Node.js 22+ core HTTP/fetch APIs, ComfyUI HTTP API at `127.0.0.1:8188`, `pngjs` for fixture checks, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-local-pixel-agent-design.md`

## Global Constraints

- Accept PNG, JPEG/JPG, and WebP inputs.
- Always export exactly 1024×1024 pixels.
- Resize a non-1024 full canvas with nearest-neighbor sampling; never crop, recenter, or content-aware reposition it.
- Preserve the trait's relative position on the complete canvas.
- Allow only 32, 64, 128, and 256 working grids; default to 128.
- Use only the exact 128 colors in `Vivid Fixed 128`, including its eight greys.
- Use no more than 16 opaque colors per trait, including pure black.
- Permit alpha values 0 and 255 only.
- Never dither, antialias, blur, or use interpolated scaling.
- Make the one-cell pure-black outline the exterior boundary; remove isolated white or colored exterior artifacts.
- Preserve connected interior white art such as the globe and `NEET` lettering unless the current request explicitly changes it.
- Never overwrite the uploaded source.
- Listen on `127.0.0.1` only and call ComfyUI at `http://127.0.0.1:8188`; do not use external image APIs or API tokens.
- Keep ChatNFT's existing generic converter, editor, project, authentication, and export behavior unchanged when Vivid mode is off.

---

## File map

- Create `pixel-agent.config.json`: schema-versioned machine-readable contract and exact Comfy model settings.
- Create `palette/vivid-fixed-128.json`: repository copy of the already-approved 128-color palette.
- Create `agent/vivid-pixel-instructions.md`: permanent creative and invariant instructions appended to each Comfy prompt.
- Create `pixel-agent-core.js`: browser-loadable deterministic normalization, palette, outline, cleanup, verification, and swatch functions.
- Create `workflows/vivid-pixel-img2img.json`: saved Z-Image Turbo image-to-image API graph.
- Create `server/contract.mjs`: validated loading of configuration, palette, prompt, and workflow assets.
- Create `server/workflow.mjs`: prompt composition and per-request workflow materialization.
- Create `server/comfy-client.mjs`: ComfyUI health, upload, queue, poll, and output operations.
- Create `server/pixel-agent-service.mjs`: one orchestration boundary from uploaded data URL to generated draft.
- Create `server/local-server.mjs`: loopback-only static server and local JSON API.
- Create `test/fixtures/neet-bucket-hat.png`: non-destructive copy of the user's approved first fixture.
- Create `test/contract.test.mjs`, `test/pixel-agent-core.test.mjs`, `test/workflow.test.mjs`, `test/comfy-client.test.mjs`, `test/local-server.test.mjs`, and `test/ui-integration.test.mjs`.
- Modify `index.html`: Vivid Agent controls, before/after preview, local generation, verification, and downloads.
- Modify `package.json`: repeatable local start and test commands plus `pngjs` development dependency.
- Modify `README.md`: local startup and user workflow.

### Task 1: Versioned art contract and asset loader

**Files:**
- Create: `pixel-agent.config.json`
- Create: `palette/vivid-fixed-128.json`
- Create: `agent/vivid-pixel-instructions.md`
- Create: `server/contract.mjs`
- Create: `test/contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the approved source palette at `../vivid-fixed-128-palette/vivid-fixed-128-palette.json`.
- Produces: `loadContract(rootDir?) -> Promise<{ config, palette, paletteHex, instructions, workflowPath }>`.

- [ ] **Step 1: Add the Node test command and PNG fixture dependency**

Run:

```powershell
npm install --save-dev pngjs
npm pkg set scripts.test="node --test test/*.test.mjs"
npm pkg set scripts.start:local="node server/local-server.mjs"
```

Expected: `package.json` contains `test`, `start:local`, and `pngjs`, with no production image API package.

- [ ] **Step 2: Write the failing contract test**

Create `test/contract.test.mjs`:

```js
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
  assert.deepEqual(contract.config.grid.allowed, [32, 64, 128, 256]);
  assert.equal(contract.config.grid.default, 128);
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
```

- [ ] **Step 3: Run the contract test and verify RED**

Run: `npm test -- --test-name-pattern="permanent Vivid contract"`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/contract.mjs`.

- [ ] **Step 4: Copy the exact approved palette and write the fixed configuration**

Run:

```powershell
New-Item -ItemType Directory -Force -Path palette,agent,server | Out-Null
Copy-Item -LiteralPath '..\vivid-fixed-128-palette\vivid-fixed-128-palette.json' -Destination 'palette\vivid-fixed-128.json'
```

Create `pixel-agent.config.json` with exactly:

```json
{
  "schemaVersion": 1,
  "canvas": { "width": 1024, "height": 1024, "fit": "full-canvas", "sampling": "nearest-neighbor" },
  "input": { "mimeTypes": ["image/png", "image/jpeg", "image/webp"], "maxBytes": 25165824 },
  "grid": { "allowed": [32, 64, 128, 256], "default": 128 },
  "palette": { "file": "palette/vivid-fixed-128.json", "maxOpaqueColors": 16 },
  "alpha": { "allowed": [0, 255], "threshold": 128 },
  "outline": { "color": "#000000", "placement": "exterior", "thicknessCells": 1 },
  "cleanup": { "removeExteriorSpecks": true, "minimumComponentCells": 2, "preserveInteriorDetails": true },
  "source": { "overwrite": false },
  "comfy": {
    "baseUrl": "http://127.0.0.1:8188",
    "inputDirectory": "C:/Users/vicke/AppData/Local/Comfy-Desktop/ComfyUI-Shared/input",
    "workflow": "workflows/vivid-pixel-img2img.json",
    "model": "z_image_turbo_int8_convrot.safetensors",
    "textEncoder": "qwen_3_4b_fp8_mixed.safetensors",
    "vae": "ae.safetensors",
    "steps": 8,
    "cfg": 1,
    "denoise": 0.25,
    "sampler": "res_multistep",
    "scheduler": "simple",
    "pollMilliseconds": 500,
    "timeoutMilliseconds": 300000
  }
}
```

Create `agent/vivid-pixel-instructions.md` with these durable instructions:

```markdown
Create a faithful pixel-art revision of the supplied trait.

Keep the complete canvas and the trait in the exact same relative position. Never crop, recenter, rotate, mirror, enlarge, shrink, or move the subject. Preserve its silhouette and recognizable design unless the user explicitly requests a silhouette change.

Use crisp square pixels, hard edges, hard transparency, a small fixed-looking palette, and no blur, antialiasing, dithering, glow, soft shadow, texture noise, or gradients. Lighting is vivid cel shading with two to four deliberate tones.

The black exterior outline belongs only around the outside silhouette. Do not place white or colored dots outside it. Preserve intentional interior white artwork and lettering, including the NEET emblem, unless the user explicitly requests a text change.

Return one trait on the original full-canvas alignment. Do not add a background, watermark, caption, frame, signature, or unrelated object.
```

- [ ] **Step 5: Implement strict contract loading**

Create `server/contract.mjs` with:

```js
import { readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function loadContract(rootDir = projectRoot) {
  const config = await readJson(join(rootDir, "pixel-agent.config.json"));
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
  const palette = await readJson(join(rootDir, config.palette.file));
  const paletteHex = palette.colors.map((color) => String(color.hex).toUpperCase());
  if (paletteHex.length !== 128 || new Set(paletteHex).size !== 128) {
    throw new Error("Invalid pixel-agent palette");
  }
  const instructions = await readFile(join(rootDir, "agent", "vivid-pixel-instructions.md"), "utf8");
  if (!instructions.trim()) throw new Error("Pixel-agent instructions are empty");
  return Object.freeze({
    config: Object.freeze(config),
    palette: Object.freeze(palette),
    paletteHex: Object.freeze(paletteHex),
    instructions,
    workflowPath: join(rootDir, config.comfy.workflow),
  });
}
```

Add `test/fixtures/invalid-contract/pixel-agent.config.json` containing `{}` so the rejection test exercises the loader.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test`

Expected: both contract tests PASS and the palette hash matches.

- [ ] **Step 7: Commit the durable contract**

```powershell
git add package.json package-lock.json pixel-agent.config.json palette agent server/contract.mjs test/contract.test.mjs test/fixtures/invalid-contract
git commit -m "feat: save the vivid pixel art contract"
```

### Task 2: Deterministic pixel repair and bucket-hat regression

**Files:**
- Create: `pixel-agent-core.js`
- Create: `test/pixel-agent-core.test.mjs`
- Create: `test/fixtures/neet-bucket-hat.png`

**Interfaces:**
- Consumes: `createPixelAgent(config, paletteHex)` with the Task 1 contract.
- Produces: `{ resizeNearest, recoverToGrid, renderGridToCanvas, hardenAlpha, applyVividPalette, enforceExteriorOutline, removeExteriorSpecks, repair, verify, usedColors, renderSwatch }`.

- [ ] **Step 1: Copy the user's fixture without changing the source**

Run:

```powershell
New-Item -ItemType Directory -Force -Path test\fixtures | Out-Null
Copy-Item -LiteralPath 'E:\X content\pixel art_\traits\hair-headwear\approved\neet-bucket-hat.png' -Destination 'test\fixtures\neet-bucket-hat.png'
```

Expected: the source remains at its original path and the repository contains a separate fixture copy.

- [ ] **Step 2: Write failing core tests**

Create `test/pixel-agent-core.test.mjs`. Load `pixel-agent-core.js` with `node:vm`, call `window.ChatNftPixelAgent.create(config, paletteHex)`, and assert these behaviors:

```js
test("hardens alpha and clears invisible RGB", () => {
  const rgba = new Uint8ClampedArray([9, 8, 7, 127, 30, 40, 50, 128]);
  core.hardenAlpha(rgba);
  assert.deepEqual([...rgba], [0, 0, 0, 0, 30, 40, 50, 255]);
});

test("makes every exterior boundary pixel black but preserves enclosed white", () => {
  const rgba = fixtureWithBlackBoxWhiteCenterAndOutsideWhiteDot();
  const repaired = core.repair(rgba, 9, 9, { grid: 32 });
  assert.equal(pixelHex(repaired.data, 4, 4, 9), "#FFFFFF");
  assert.equal(alphaAt(repaired.data, 8, 0, 9), 0);
  for (const [x, y] of opaquePixelsTouchingExterior(repaired.data, 9, 9)) {
    assert.equal(pixelHex(repaired.data, x, y, 9), "#000000");
  }
});

test("normalizes the whole canvas with nearest-neighbor and without recentering", () => {
  const source = oneOpaquePixel(5, 5, 4, 1);
  const normalized = core.resizeNearest(source, 5, 5, 10, 10);
  assert.equal(normalized.width, 10);
  assert.equal(normalized.height, 10);
  assert.deepEqual(opaqueBounds(normalized.data, 10, 10), { x0: 8, y0: 2, x1: 9, y1: 3 });
});

test("keeps the bucket hat aligned and removes exterior non-black artifacts", async () => {
  const source = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  assert.equal(source.width, 1254);
  assert.equal(source.height, 1254);
  const canvas = core.resizeNearest(source.data, source.width, source.height, 1024, 1024);
  const grid = core.recoverToGrid(canvas.data, canvas.width, canvas.height, 128);
  const repaired = core.repair(grid.data, 128, 128, { grid: 128 });
  assert.deepEqual(core.verify(repaired.data, 128, 128, { grid: 128 }), []);
  assert.ok(countColor(repaired.data, "#FFFFFF") > 20, "interior white NEET art remains");
  assert.equal(findExteriorNonBlack(repaired.data, 128, 128).length, 0);
  assertBoundsWithinOneCell(
    opaqueBounds(repaired.data, 128, 128),
    scaledBounds(opaqueBounds(source.data, source.width, source.height), 1254, 128),
  );
});
```

Define the test helpers in the same file so the assertions are executable and independent of production internals:

```js
function setPixel(data, width, x, y, [r, g, b, a = 255]) {
  const i = (y * width + x) * 4;
  data.set([r, g, b, a], i);
}

function fixtureWithBlackBoxWhiteCenterAndOutsideWhiteDot() {
  const data = new Uint8ClampedArray(9 * 9 * 4);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    const edge = x === 2 || x === 6 || y === 2 || y === 6;
    setPixel(data, 9, x, y, edge ? [0, 0, 0, 255] : [88, 88, 88, 255]);
  }
  setPixel(data, 9, 4, 4, [255, 255, 255, 255]);
  setPixel(data, 9, 8, 0, [255, 255, 255, 255]);
  return data;
}

function oneOpaquePixel(width, height, x, y) {
  const data = new Uint8ClampedArray(width * height * 4);
  setPixel(data, width, x, y, [255, 255, 255, 255]);
  return data;
}

function pixelHex(data, x, y, width) {
  const i = (y * width + x) * 4;
  return `#${[data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function alphaAt(data, x, y, width) {
  return data[(y * width + x) * 4 + 3];
}

function opaqueBounds(data, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alphaAt(data, x, y, width) === 0) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

function opaquePixelsTouchingExterior(data, width, height) {
  const exterior = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (p < 0 || p >= width * height || exterior[p]) continue;
    const x = p % width, y = Math.floor(p / width);
    if (alphaAt(data, x, y, width) !== 0) continue;
    exterior[p] = 1;
    if (x > 0) queue.push(p - 1);
    if (x + 1 < width) queue.push(p + 1);
    if (y > 0) queue.push(p - width);
    if (y + 1 < height) queue.push(p + width);
  }
  const result = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alphaAt(data, x, y, width) === 0) continue;
    let touches = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    for (let dy = -1; !touches && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && exterior[ny * width + nx]) touches = true;
    }
    if (touches) result.push([x, y]);
  }
  return result;
}

function findExteriorNonBlack(data, width, height) {
  return opaquePixelsTouchingExterior(data, width, height)
    .filter(([x, y]) => pixelHex(data, x, y, width) !== "#000000");
}

function countColor(data, hex) {
  const rgb = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] && data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2]) count++;
  }
  return count;
}

function scaledBounds(bounds, sourceSize, targetSize) {
  return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.floor(value * targetSize / sourceSize)]));
}

function assertBoundsWithinOneCell(actual, expected) {
  for (const key of ["x0", "y0", "x1", "y1"]) assert.ok(Math.abs(actual[key] - expected[key]) <= 1, `${key} moved`);
}
```

- [ ] **Step 3: Run core tests and verify RED**

Run: `node --test test/pixel-agent-core.test.mjs`

Expected: FAIL because `pixel-agent-core.js` does not exist.

- [ ] **Step 4: Implement the browser core with a stable public API**

Create `pixel-agent-core.js` as a strict classic script:

```js
(function (root) {
  "use strict";

  function createPixelAgent(config, paletteHex) {
    if (!config || !Array.isArray(paletteHex) || paletteHex.length !== 128) {
      throw new Error("A valid pixel-agent contract is required");
    }
    const palette = paletteHex.map((hex) => hex.toUpperCase());
    const paletteRgb = palette.map(hexToRgb);

    function resizeNearest(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
      const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
      for (let y = 0; y < targetHeight; y++) {
        const sy = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
        for (let x = 0; x < targetWidth; x++) {
          const sx = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
          const sourceIndex = (sy * sourceWidth + sx) * 4;
          out.set(source.subarray(sourceIndex, sourceIndex + 4), (y * targetWidth + x) * 4);
        }
      }
      return { data: out, width: targetWidth, height: targetHeight };
    }

    function recoverToGrid(source, sourceWidth, sourceHeight, grid) {
      if (!config.grid.allowed.includes(grid)) throw new Error("Unsupported working grid");
      const out = new Uint8ClampedArray(grid * grid * 4);
      for (let y = 0; y < grid; y++) {
        const sy0 = Math.floor(y * sourceHeight / grid);
        const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * sourceHeight / grid));
        for (let x = 0; x < grid; x++) {
          const sx0 = Math.floor(x * sourceWidth / grid);
          const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sourceWidth / grid));
          writeMedianRgba(out, (y * grid + x) * 4, source, sourceWidth, sx0, sy0, sx1, sy1);
        }
      }
      return { data: out, width: grid, height: grid };
    }

    function repair(input, width, height, options = {}) {
      const data = new Uint8ClampedArray(input);
      hardenAlpha(data, config.alpha.threshold);
      applyVividPalette(data, palette, paletteRgb, config.palette.maxOpaqueColors);
      removeExteriorSpecks(data, width, height, config.cleanup.minimumComponentCells);
      enforceExteriorOutline(data, width, height);
      hardenAlpha(data, config.alpha.threshold);
      return { data, width, height, colors: usedColors(data, palette) };
    }

    return Object.freeze({
      resizeNearest,
      recoverToGrid,
      renderGridToCanvas: (data, grid) => resizeNearest(data, grid, grid, 1024, 1024),
      hardenAlpha: (data) => hardenAlpha(data, config.alpha.threshold),
      applyVividPalette: (data) => applyVividPalette(data, palette, paletteRgb, config.palette.maxOpaqueColors),
      enforceExteriorOutline,
      removeExteriorSpecks,
      repair,
      verify: (data, width, height, options) => verify(data, width, height, options, config, palette),
      usedColors: (data) => usedColors(data, palette),
      renderSwatch,
    });
  }

  root.ChatNftPixelAgent = Object.freeze({ create: createPixelAgent });
})(typeof window === "object" ? window : globalThis);
```

Implement the named helpers in the same file with these exact rules:

- `resizeNearest` is the only full-canvas resize and never interpolates, crops, or changes the coordinate origin.
- `writeMedianRgba` is used only by `recoverToGrid` to choose a representative color for each working-grid cell after the complete canvas is already normalized to 1024.
- `hardenAlpha` writes `[0,0,0,0]` below alpha 128 and alpha 255 otherwise.
- `applyVividPalette` maps opaque pixels to OKLab-nearest approved colors, ranks colors by pixel count with palette-index tie breaking, always includes `#000000`, and remaps to at most 16 selected colors.
- `removeExteriorSpecks` flood-fills 8-connected opaque components and clears components smaller than two working cells only when they touch the exterior transparent region; enclosed interior components remain.
- `enforceExteriorOutline` flood-fills transparent pixels from all four canvas edges, then changes each opaque 8-neighbor of that exterior region to `[0,0,0,255]`.
- `verify` returns actionable strings for invalid dimensions, unsupported grid, non-binary alpha, off-palette colors, more than 16 colors, or a non-black exterior boundary.
- `renderSwatch(colors, 1024, 128)` creates sixteen 64-pixel slots in palette order and leaves unused slots transparent.

- [ ] **Step 5: Run core tests and verify GREEN**

Run: `node --test test/pixel-agent-core.test.mjs`

Expected: all unit and bucket-hat fixture tests PASS.

- [ ] **Step 6: Run the complete suite and commit**

Run: `npm test`

Expected: contract and core tests PASS.

```powershell
git add pixel-agent-core.js test/pixel-agent-core.test.mjs test/fixtures/neet-bucket-hat.png
git commit -m "feat: enforce durable vivid pixel rules"
```

### Task 3: Saved ComfyUI workflow and client

**Files:**
- Create: `workflows/vivid-pixel-img2img.json`
- Create: `server/workflow.mjs`
- Create: `server/comfy-client.mjs`
- Create: `test/workflow.test.mjs`
- Create: `test/comfy-client.test.mjs`

**Interfaces:**
- Consumes: Task 1 `loadContract()`.
- Produces: `composePrompt(instructions, userInstruction)`, `materializeWorkflow(template, request)`, and `createComfyClient(options)`.

- [ ] **Step 1: Write failing workflow tests**

Create `test/workflow.test.mjs`:

```js
test("materializes the saved workflow without changing its template", async () => {
  const contract = await loadContract();
  const template = JSON.parse(await readFile(contract.workflowPath, "utf8"));
  const before = JSON.stringify(template);
  const prompt = composePrompt(contract.instructions, "Remove the small white dot outside the hat.");
  const graph = materializeWorkflow(template, {
    inputName: "chatnft/request-1.png",
    prompt,
    requestId: "request-1",
    seed: 12345,
    config: contract.config,
  });
  assert.equal(JSON.stringify(template), before);
  assert.equal(graph["1"].inputs.image, "chatnft/request-1.png");
  assert.equal(graph["27"].inputs.text, prompt);
  assert.equal(graph["3"].inputs.seed, 12345);
  assert.equal(graph["3"].inputs.denoise, 0.25);
  assert.equal(graph["9"].inputs.filename_prefix, "ChatNFT/request-1");
  assert.match(prompt, /User request:\nRemove the small white dot outside the hat\./);
});
```

- [ ] **Step 2: Write a failing Comfy client test against a real fake HTTP server**

Create `test/comfy-client.test.mjs` using `node:http.createServer`. The fake server must return:

- `/system_stats` -> `{ "system": { "comfyui_version": "0.34.2" } }`;
- `/upload/image` -> `{ "name": "request-1.png", "subfolder": "chatnft", "type": "input" }`;
- `/prompt` -> `{ "prompt_id": "prompt-1" }`;
- first `/history/prompt-1` -> `{}`;
- second `/history/prompt-1` -> an output record containing `result.png`;
- `/view?...` -> a four-byte fake PNG buffer.

Assert that `health()`, `uploadImage()`, `queue()`, `waitForOutput()`, and `fetchOutput()` traverse those real HTTP routes and that the uploaded request is multipart form data.

- [ ] **Step 3: Run both tests and verify RED**

Run: `node --test test/workflow.test.mjs test/comfy-client.test.mjs`

Expected: FAIL with missing `server/workflow.mjs` and `server/comfy-client.mjs`.

- [ ] **Step 4: Save the image-to-image API workflow**

Create `workflows/vivid-pixel-img2img.json` with these nodes and links:

```json
{
  "1": { "class_type": "LoadImage", "inputs": { "image": "__INPUT_IMAGE__" } },
  "2": { "class_type": "VAEEncode", "inputs": { "pixels": ["1", 0], "vae": ["29", 0] } },
  "3": { "class_type": "KSampler", "inputs": { "seed": 1, "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 0.25, "model": ["11", 0], "positive": ["27", 0], "negative": ["33", 0], "latent_image": ["2", 0] } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["29", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "ChatNFT/__REQUEST_ID__", "images": ["8", 0] } },
  "11": { "class_type": "ModelSamplingAuraFlow", "inputs": { "shift": 3.0, "model": ["28", 0] } },
  "27": { "class_type": "CLIPTextEncode", "inputs": { "text": "__PROMPT__", "clip": ["30", 0] } },
  "28": { "class_type": "UNETLoader", "inputs": { "unet_name": "z_image_turbo_int8_convrot.safetensors", "weight_dtype": "default" } },
  "29": { "class_type": "VAELoader", "inputs": { "vae_name": "ae.safetensors" } },
  "30": { "class_type": "CLIPLoader", "inputs": { "clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default" } },
  "33": { "class_type": "ConditioningZeroOut", "inputs": { "conditioning": ["27", 0] } }
}
```

- [ ] **Step 5: Implement prompt and graph materialization**

Create `server/workflow.mjs`:

```js
export function composePrompt(instructions, userInstruction) {
  const request = String(userInstruction || "Faithful cleanup only.").trim().slice(0, 2000);
  return `${instructions.trim()}\n\nUser request:\n${request}`;
}

export function materializeWorkflow(template, request) {
  const graph = structuredClone(template);
  graph["1"].inputs.image = request.inputName;
  graph["27"].inputs.text = request.prompt;
  graph["3"].inputs.seed = request.seed;
  graph["3"].inputs.steps = request.config.comfy.steps;
  graph["3"].inputs.cfg = request.config.comfy.cfg;
  graph["3"].inputs.denoise = request.config.comfy.denoise;
  graph["3"].inputs.sampler_name = request.config.comfy.sampler;
  graph["3"].inputs.scheduler = request.config.comfy.scheduler;
  graph["9"].inputs.filename_prefix = `ChatNFT/${request.requestId}`;
  return graph;
}
```

- [ ] **Step 6: Implement the Comfy HTTP client**

Create `server/comfy-client.mjs` with `createComfyClient({ baseUrl, pollMilliseconds, timeoutMilliseconds, fetchImpl = fetch })`. Implement:

```js
async function health() {
  const response = await fetchImpl(`${baseUrl}/system_stats`);
  if (!response.ok) throw new Error(`ComfyUI health failed (${response.status})`);
  return response.json();
}

async function uploadImage(bytes, fileName) {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), fileName);
  form.append("subfolder", "chatnft");
  form.append("type", "input");
  const response = await fetchImpl(`${baseUrl}/upload/image`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`ComfyUI upload failed (${response.status})`);
  const uploaded = await response.json();
  return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
}
```

Add `queue(graph)` as `POST /prompt` with `{ prompt: graph }`, `waitForOutput(promptId)` as a bounded poll of `/history/{promptId}`, and `fetchOutput(imageRecord)` as `/view?filename=...&subfolder=...&type=output`. On timeout, throw `ComfyUI generation timed out after 300000 ms`. Return only the first `SaveImage` PNG record for the queued prompt.

- [ ] **Step 7: Run tests and commit**

Run: `node --test test/workflow.test.mjs test/comfy-client.test.mjs`

Expected: all workflow and HTTP client tests PASS.

```powershell
git add workflows server/workflow.mjs server/comfy-client.mjs test/workflow.test.mjs test/comfy-client.test.mjs
git commit -m "feat: add local ComfyUI image workflow"
```

### Task 4: Loopback-only generation service and local server

**Files:**
- Create: `server/pixel-agent-service.mjs`
- Create: `server/local-server.mjs`
- Create: `test/local-server.test.mjs`

**Interfaces:**
- Consumes: `loadContract`, `composePrompt`, `materializeWorkflow`, and `createComfyClient`.
- Produces: `createPixelAgentService(options).generate(request)` and `createLocalServer(options)`.

- [ ] **Step 1: Write failing service/server tests**

Create `test/local-server.test.mjs` using an actual server on port `0`. Assert:

```js
test("serves health and a generated PNG only on the local API", async () => {
  const fakeService = {
    health: async () => ({ ok: true, version: "0.34.2" }),
    generate: async ({ instruction, grid }) => ({
      pngDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      promptId: "prompt-1",
      outputName: "result.png",
      instruction,
      grid,
    }),
  };
  const server = createLocalServer({ service: fakeService, rootDir: projectRoot });
  await listen(server, "127.0.0.1", 0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/api/pixel-agent/health`)).status, 200);
  const response = await fetch(`${origin}/api/pixel-agent/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: VALID_TINY_PNG, instruction: "faithful cleanup", grid: 128 }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).promptId, "prompt-1");
  await close(server);
});
```

Define the network helpers directly in the test:

```js
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const VALID_TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwL8WQAAAABJRU5ErkJggg==";
const listen = (server, host, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
const close = (server) => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
```

Add a service-level test using `mkdtemp`, a fake Comfy client that writes the received filename into its temporary `input/chatnft` directory, and the real `createPixelAgentService`. After `generate()` resolves, assert that the created input file no longer exists and that a sibling sentinel file remains. This proves cleanup removes only the request file created by the agent.

Add separate tests for malformed JSON (400), unsupported MIME type (415), a grid outside `[32,64,128,256]` (400), payload over 24 MiB (413), static path traversal (404), and a service error mentioning connection refusal (503 with `ComfyUI is not running`).

- [ ] **Step 2: Run server tests and verify RED**

Run: `node --test test/local-server.test.mjs`

Expected: FAIL because the service and local server modules do not exist.

- [ ] **Step 3: Implement generation orchestration**

Create `server/pixel-agent-service.mjs` with:

```js
import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadContract } from "./contract.mjs";
import { createComfyClient } from "./comfy-client.mjs";
import { composePrompt, materializeWorkflow } from "./workflow.mjs";

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
    async generate({ imageDataUrl, instruction, grid }) {
      if (!contract.config.grid.allowed.includes(grid)) throw new TypeError("Unsupported working grid");
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl || "");
      if (!match) throw new TypeError("Unsupported or malformed image");
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > contract.config.input.maxBytes) throw new RangeError("Image exceeds 24 MiB");
      const requestId = randomUUID();
      let inputName = "";
      try {
        inputName = await client.uploadImage(bytes, `${requestId}.png`);
        const prompt = composePrompt(contract.instructions, instruction);
        const graph = materializeWorkflow(template, {
          inputName,
          prompt,
          requestId,
          seed: randomInt(1, 2 ** 31),
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
        };
      } finally {
        if (inputName) {
          const root = resolve(contract.config.comfy.inputDirectory);
          const target = resolve(root, ...inputName.split("/"));
          if (target.startsWith(root + sep)) await rm(target, { force: true });
        }
      }
    },
  };
}
```

- [ ] **Step 4: Implement the loopback-only static/API server**

Create `server/local-server.mjs`. Export `createLocalServer({ service, rootDir })`, use a 25 MiB bounded JSON reader, and serve only files whose resolved path remains under `rootDir`. Routes:

- `GET /api/pixel-agent/health` -> `service.health()`;
- `POST /api/pixel-agent/generate` -> `service.generate(body)`;
- `GET /` and local asset paths -> repository static files;
- all other API routes -> 404 JSON.

Map `TypeError` to 400/415, `RangeError` to 413, connection failures to 503, and all other generation failures to 502 without echoing stack traces. In direct execution, create the real service and call:

```js
server.listen(4173, "127.0.0.1", () => {
  console.log("ChatNFT local pixel agent: http://127.0.0.1:4173/");
});
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/local-server.test.mjs`

Expected: all network, validation, and error tests PASS.

Run: `npm test`

Expected: the complete suite PASS.

```powershell
git add server/pixel-agent-service.mjs server/local-server.mjs test/local-server.test.mjs
git commit -m "feat: serve the pixel agent on loopback"
```

### Task 5: ChatNFT Vivid Agent interface and verified downloads

**Files:**
- Modify: `index.html:714-747`
- Modify: `index.html:899`
- Modify: `index.html:3814-3868`
- Modify: `index.html:5239-5262`
- Create: `test/ui-integration.test.mjs`

**Interfaces:**
- Consumes: `/api/pixel-agent/health`, `/api/pixel-agent/generate`, and `window.ChatNftPixelAgent.create(config, paletteHex)`.
- Produces: a Vivid preview/result session with `vividResult`, `Download 1024×1024`, and `Download used colors`.

- [ ] **Step 1: Write failing static integration checks**

Create `test/ui-integration.test.mjs`:

```js
test("wires the Vivid Agent controls without removing the generic converter", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\.\/pixel-agent-core\.js"><\/script>/);
  assert.match(html, /id="pxvivid"/);
  assert.match(html, /id="pxvividgrid"/);
  assert.match(html, /id="pxinstruction"/);
  assert.match(html, /id="pxgenerate"/);
  assert.match(html, /id="pxagentstatus"/);
  assert.match(html, /id="pxswatches"/);
  assert.match(html, /id="dlVivid"/);
  assert.match(html, /id="dlVividSwatch"/);
  assert.match(html, /\/api\/pixel-agent\/generate/);
  assert.match(html, /ChatNftPixelAgent\.create/);
  assert.match(html, /id="pxsize"/);
  assert.match(html, /function pixelate\(/);
});
```

- [ ] **Step 2: Run the UI check and verify RED**

Run: `node --test test/ui-integration.test.mjs`

Expected: FAIL because the Vivid controls and script reference are absent.

- [ ] **Step 3: Add Vivid controls alongside the generic controls**

Immediately before the existing Grid slider in `pxscrim`, add:

```html
<label class="olchk"><input type="checkbox" id="pxvivid" checked> Use the saved Vivid Pixel Agent rules</label>
<div class="olrow" id="pxvividgridrow"><label for="pxvividgrid">Working grid</label>
  <select id="pxvividgrid"><option>32</option><option>64</option><option selected>128</option><option>256</option></select>
</div>
<label for="pxinstruction">Instruction</label>
<textarea id="pxinstruction" rows="3" maxlength="2000" placeholder="Example: remove the small white dot outside the hat"></textarea>
<button class="btn" id="pxgenerate">Generate locally with ComfyUI</button>
<p class="note" id="pxagentstatus">Checking local ComfyUI…</p>
<div class="swatches" id="pxswatches" aria-label="Used color swatches"></div>
```

Add the fixed summary `1024×1024 · 16 colors max · black exterior outline · hard transparency`. When Vivid is checked, hide the generic size/color/match/outline controls but preserve their current values; when unchecked, restore them unchanged.

- [ ] **Step 4: Load and initialize the saved contract/core**

Load `<script src="./pixel-agent-core.js"></script>` immediately before the existing inline application script. Add:

```js
let vividContract=null, vividCore=null, vividResult=null, editorVivid=false;

async function initVividAgent(){
  const [config,palette]=await Promise.all([
    fetch('./pixel-agent.config.json').then(r=>r.json()),
    fetch('./palette/vivid-fixed-128.json').then(r=>r.json()),
  ]);
  vividContract=config;
  vividCore=ChatNftPixelAgent.create(config,palette.colors.map(c=>c.hex));
  try{
    const health=await fetch('/api/pixel-agent/health').then(r=>r.json());
    $('pxagentstatus').textContent=health.ok?'ComfyUI ready locally':'ComfyUI is not ready';
  }catch(_){ $('pxagentstatus').textContent='Open ComfyUI, then reload this local page.'; }
}
initVividAgent();
```

Do not make the generic converter depend on this promise.

- [ ] **Step 5: Route local generation through ComfyUI and deterministic repair**

On `pxgenerate`:

1. normalize the complete `pxSrc` canvas to 1024×1024 with `vividCore.resizeNearest`;
2. recover that normalized canvas to the selected working grid with `vividCore.recoverToGrid`, then return it to 1024×1024 with `vividCore.renderGridToCanvas` for ComfyUI;
3. encode the offscreen canvas as PNG data URL;
4. POST `{ imageDataUrl, instruction, grid }` to `/api/pixel-agent/generate`;
5. decode the returned draft;
6. recover the returned 1024×1024 draft to the same grid with `vividCore.recoverToGrid`;
7. call `vividCore.repair` and `vividCore.verify`;
8. block preview/download if violations remain;
9. store `{ data, size, colors, originalWidth: pxSrc.width, originalHeight: pxSrc.height }` in `vividResult`;
10. render the repaired grid in `pxout` and the used colors in `pxswatches`.

Use `try/finally` so the button always re-enables. Convert a 503 into `Open ComfyUI and try again.` and leave the previous preview untouched after any failure.

- [ ] **Step 6: Keep the existing local cleanup preview deterministic**

When Vivid is enabled but Comfy has not run, make `pxRender()` call:

```js
const canvas=vividCore.resizeNearest(pxSrc.data,pxSrc.width,pxSrc.height,1024,1024);
const normalized=vividCore.recoverToGrid(canvas.data,canvas.width,canvas.height,o.size);
const repaired=vividCore.repair(normalized.data,o.size,o.size,{grid:o.size});
const violations=vividCore.verify(repaired.data,o.size,o.size,{grid:o.size});
```

This gives the bucket hat an immediate faithful cleanup preview and removes the outside artifact without asking the generative model to redraw the emblem. `Generate locally with ComfyUI` remains available for creative instructions.

- [ ] **Step 7: Add verified 1024 and swatch exports**

Track Vivid editor sessions by extending `startEditor(..., meta = {})` and setting `editorVivid = meta.vivid === true`. Add `dlVivid` and `dlVividSwatch` buttons to the Export section and show them only for Vivid sessions.

For `dlVivid`, verify the current repaired grid, draw the complete grid onto a 1024×1024 canvas with smoothing disabled, and download `<base>-1024.png`.

For `dlVividSwatch`, call `vividCore.renderSwatch(vividCore.usedColors(data),1024,128)`, place the RGBA result in a 1024×128 canvas, and download `<base>-used-colors.png`. A failed verification must display the exact violation and produce no file.

- [ ] **Step 8: Run tests and commit**

Run: `node --test test/ui-integration.test.mjs`

Expected: UI integration checks PASS.

Run: `npm test`

Expected: all tests PASS.

```powershell
git add index.html test/ui-integration.test.mjs
git commit -m "feat: connect ChatNFT to the local pixel agent"
```

### Task 6: Real ComfyUI and bucket-hat end-to-end verification

**Files:**
- Create: `tools/local-agent-check.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: the running local server, installed ComfyUI, and the checked-in bucket-hat fixture.
- Produces: an executable health/generation check and documented user workflow.

- [ ] **Step 1: Write the failing end-to-end checker test contract**

Create `tools/local-agent-check.mjs` so it:

1. fetches `http://127.0.0.1:4173/api/pixel-agent/health` and requires `{ ok: true }`;
2. reads `test/fixtures/neet-bucket-hat.png` and posts it with grid 128 and the instruction `Remove the small white dot outside the hat; preserve everything else.`;
3. requires an image data URL response and saves it only under `.probe/local-agent-draft.png`;
4. prints the prompt id and output filename;
5. exits nonzero on HTTP, timeout, or malformed-image failure.

Use this executable implementation:

```js
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
```

Add this package script. Do not include it in `npm test`, because it requires a running GPU service:

```json
"test:local-agent": "node tools/local-agent-check.mjs"
```

- [ ] **Step 2: Run the checker before the local server and verify RED**

Run: `npm run test:local-agent`

Expected: FAIL with `ECONNREFUSED 127.0.0.1:4173`.

- [ ] **Step 3: Start the local server and run the real generation check**

Run in one terminal:

```powershell
npm run start:local
```

Run in another:

```powershell
npm run test:local-agent
```

Expected: ComfyUI accepts the saved workflow, the checker reports a prompt id, and `.probe/local-agent-draft.png` is created without any API token.

- [ ] **Step 4: Verify the browser workflow with the fixture**

Open `http://127.0.0.1:4173/` and use `test/fixtures/neet-bucket-hat.png`. Verify:

- the source is reported as 1254×1254;
- Vivid defaults to grid 128;
- the immediate faithful preview has no exterior white dot;
- the hat remains in the same relative location;
- the interior globe and `NEET` text remain visible;
- local Comfy status says ready;
- creative generation completes without a token prompt;
- final validation reports 1024×1024, binary alpha, approved palette, at most 16 colors, and a black exterior boundary;
- artwork and swatch downloads work;
- disabling Vivid restores the original generic controls.

- [ ] **Step 5: Document exact user steps**

Add `Local Vivid Pixel Agent` to `README.md`:

```markdown
## Local Vivid Pixel Agent

1. Open ComfyUI Desktop and wait until its local server is ready.
2. In this repository, run `npm install` once and then `npm run start:local`.
3. Open http://127.0.0.1:4173/.
4. Drop a PNG, JPEG, or WebP and choose **Turn this into a trait**.
5. Keep **Use the saved Vivid Pixel Agent rules** enabled.
6. Use the immediate preview for faithful cleanup, or enter an instruction and choose **Generate locally with ComfyUI** for a creative revision.
7. Open the verified result in the editor and download the 1024×1024 PNG and used-color swatch.

The art contract is stored in `pixel-agent.config.json`, the palette is stored in `palette/vivid-fixed-128.json`, and creative rules are stored in `agent/vivid-pixel-instructions.md`. Tests enforce these files; the workflow does not rely on chat memory.
```

- [ ] **Step 6: Run final verification**

Run:

```powershell
npm test
npm run test:local-agent
git diff --check
git status --short
```

Expected: automated tests PASS, real local generation PASS, no whitespace errors, and only intended files are changed.

- [ ] **Step 7: Commit the checker and documentation**

```powershell
git add tools/local-agent-check.mjs README.md package.json package-lock.json
git commit -m "docs: verify the local vivid pixel workflow"
```

## Final acceptance checklist

- The user never needs to open or edit a ComfyUI graph.
- No image-generation API key or cloud model is used.
- Every fixed parameter is stored in a versioned file and tested.
- A new conversation cannot change the contract silently.
- The bucket-hat fixture becomes 1024×1024 without cropping or recentering.
- The outside white artifact is absent and every exterior boundary pixel is black.
- Interior white NEET artwork remains.
- Final alpha is binary, palette membership is exact, and opaque colors are at most 16.
- Source images are never overwritten.
- The existing generic ChatNFT workflow remains functional when Vivid mode is off.
