import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { PNG } from "pngjs";

const config = JSON.parse(await readFile(new URL("../pixel-agent.config.json", import.meta.url)));
const palette = JSON.parse(await readFile(new URL("../palette/vivid-fixed-128.json", import.meta.url)));
const source = await readFile(new URL("../pixel-agent-core.js", import.meta.url), "utf8");
const sandbox = { Uint8Array, Uint8ClampedArray, window: {} };
vm.runInNewContext(source, sandbox, { filename: "pixel-agent-core.js" });
const core = sandbox.window.ChatNftPixelAgent.create(config, palette.colors.map((color) => color.hex));

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
  const sourcePixel = oneOpaquePixel(5, 5, 4, 1);
  const normalized = core.resizeNearest(sourcePixel, 5, 5, 10, 10);
  assert.equal(normalized.width, 10);
  assert.equal(normalized.height, 10);
  assert.deepEqual(opaqueBounds(normalized.data, 10, 10), { x0: 8, y0: 2, x1: 9, y1: 3 });
});

test("preserves sparse enclosed white while reducing a crowded palette", () => {
  const data = crowdedPaletteWithEnclosedWhiteDetail();
  const repaired = core.repair(data, 32, 32, { grid: 32 });
  assert.equal(pixelHex(repaired.data, 16, 16, 32), "#FFFFFF");
});

test("keeps the bucket hat aligned and removes exterior non-black artifacts", async () => {
  const sourcePng = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  assert.equal(sourcePng.width, 1254);
  assert.equal(sourcePng.height, 1254);
  const canvas = core.resizeNearest(sourcePng.data, sourcePng.width, sourcePng.height, 1024, 1024);
  const grid = core.recoverToGrid(canvas.data, canvas.width, canvas.height, 128);
  const repaired = core.repair(grid.data, 128, 128, { grid: 128 });
  assert.deepEqual([...core.verify(repaired.data, 128, 128, { grid: 128 })], []);
  assert.ok(countColor(repaired.data, "#FFFFFF") > 20, "interior white NEET art remains");
  assert.equal(
    whiteMask(repaired.data, 128, 64, 20, 84, 41),
    "72,21;73,21;74,21;78,22;72,23;73,23;74,23;74,24;76,24;77,24;74,25;75,25;76,25;72,26;73,26;74,26;75,26;67,36;74,36;75,36;76,36;80,36;68,37;72,37;73,37;74,37;75,37;79,37;69,38;72,38;73,38;74,38;75,38;77,38;71,39;72,39;73,39;74,39;76,39;77,39",
    "NEET globe white-detail mask moved or changed",
  );
  assert.equal(findExteriorNonBlack(repaired.data, 128, 128).length, 0);
  assertBoundsWithinOneCell(
    opaqueBounds(repaired.data, 128, 128),
    scaledBounds(opaqueBounds(sourcePng.data, sourcePng.width, sourcePng.height), 1254, 128),
  );
});

test("rejects a generated result whose alpha differs from the repaired source silhouette", async () => {
  const sourcePng = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  const sourceGrid = normalizedGrid(sourcePng, 128);
  const faithful = core.repair(sourceGrid.data, 128, 128, { grid: 128 });
  const opaqueDraft = forceOpaque(sourceGrid.data);
  const naive = core.repair(opaqueDraft, 128, 128, { grid: 128 });

  assert.deepEqual(
    [...core.verify(naive.data, 128, 128, { grid: 128, alphaMask: faithful.data })],
    ["Source silhouette mismatch at pixel 0"],
  );
});

test("finalizes an opaque creative draft with the repaired bucket-hat silhouette", async () => {
  const sourcePng = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  const sourceGrid = normalizedGrid(sourcePng, 128);
  const faithful = core.repair(sourceGrid.data, 128, 128, { grid: 128 });
  const opaqueDraft = forceOpaque(sourceGrid.data);

  assert.equal(typeof core.finalizeCreative, "function", "creative finalization API is missing");
  const finalized = core.finalizeCreative(opaqueDraft, sourceGrid.data, 128, 128, { grid: 128 });

  assert.equal(alphaAt(finalized.data, 87, 19, 128), 0, "outside white cell remains");
  assert.equal(
    whiteMask(finalized.data, 128, 64, 20, 84, 41),
    whiteMask(faithful.data, 128, 64, 20, 84, 41),
    "interior NEET white detail changed",
  );
  assert.deepEqual(alphaMask(finalized.data), alphaMask(faithful.data), "source silhouette changed");
  assert.deepEqual(opaqueBounds(finalized.data, 128, 128), opaqueBounds(faithful.data, 128, 128));
  assert.deepEqual(
    [...core.verify(finalized.data, 128, 128, {
      grid: 128,
      alphaMask: faithful.data,
      anchoredWhiteMask: finalized.anchoredWhiteMask,
    })],
    [],
  );
});

test("restores the real fixture's anchored white NEET cells while keeping creative RGB elsewhere", async () => {
  const sourcePng = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  const sourceGrid = normalizedGrid(sourcePng, 128);
  const faithful = core.repair(sourceGrid.data, 128, 128, { grid: 128 });
  const draft = new Uint8ClampedArray(faithful.data);
  const anchorCells = whiteCells(faithful.data, 128, 64, 20, 84, 41);
  assert.ok(anchorCells.length > 20, "fixture no longer contains the anchored NEET art");
  for (const point of anchorCells) draft.set([128, 128, 128, 255], point * 4);

  const creativeRgb = mostCommonInteriorRgb(faithful.data, 128, -1);
  const creativePoint = findInteriorColorCell(faithful.data, 128, anchorCells, creativeRgb);
  assert.notEqual(creativePoint, -1, "fixture has no differently colored creative cell");
  assert.notDeepEqual(Array.from(faithful.data.slice(creativePoint * 4, creativePoint * 4 + 3)), creativeRgb);
  draft.set([...creativeRgb, 255], creativePoint * 4);

  const finalized = core.finalizeCreative(draft, sourceGrid.data, 128, 128, { grid: 128 });
  assert.equal(
    whiteMask(finalized.data, 128, 64, 20, 84, 41),
    whiteMask(faithful.data, 128, 64, 20, 84, 41),
    "anchored NEET whites were not restored",
  );
  assert.deepEqual(
    Array.from(finalized.data.slice(creativePoint * 4, creativePoint * 4 + 3)),
    creativeRgb,
    "creative RGB outside the anchored white art was frozen to the source",
  );

  const drifted = new Uint8ClampedArray(finalized.data);
  drifted.set([131, 131, 131, 255], anchorCells[0] * 4);
  assert.deepEqual(
    [...core.verify(drifted, 128, 128, {
      grid: 128,
      alphaMask: finalized.alphaMask,
      anchoredWhiteMask: finalized.anchoredWhiteMask,
    })],
    [`Anchored white detail mismatch at pixel ${anchorCells[0]}`],
  );
  assert.deepEqual(
    [...core.verify(finalized.data, 128, 128, {
      grid: 128,
      alphaMask: finalized.alphaMask,
      anchoredWhiteMask: finalized.anchoredWhiteMask,
    })],
    [],
  );
});

test("authorizes anchored-white recolor only for conservative explicit artwork instructions", () => {
  assert.equal(typeof core.allowsAnchoredWhiteRecolor, "function");
  for (const instruction of [
    "Make the T the same colour as the NEE.",
    "Recolour the NEET text gray.",
    "Change the color of the white emblem artwork to gray.",
    "Darken the lettering inside the logo.",
  ]) assert.equal(core.allowsAnchoredWhiteRecolor(instruction), true, instruction);

  for (const instruction of [
    "Faithful cleanup only.",
    "Remove the small white dot outside the hat.",
    "Make the hat lighter and preserve the NEET text.",
    "Lighten the hat and keep the lettering intact.",
    "Lighten the hat without changing the NEET text.",
    "Do not recolor the NEET emblem.",
    "Change the outline color to black.",
    "Make the hat the same colour as the reference.",
    "Recolor the hat artwork blue.",
  ]) assert.equal(core.allowsAnchoredWhiteRecolor(instruction), false, instruction);
});

test("retains explicitly authorized fixture recolors and validates only the remaining white anchors", async () => {
  const sourcePng = PNG.sync.read(await readFile(new URL("./fixtures/neet-bucket-hat.png", import.meta.url)));
  const sourceGrid = normalizedGrid(sourcePng, 128);
  const faithful = core.repair(sourceGrid.data, 128, 128, { grid: 128 });
  const draft = forceOpaque(faithful.data);
  const anchorCells = whiteCells(faithful.data, 128, 64, 20, 84, 41);
  const retainedWhitePoint = anchorCells.at(-1);
  for (const point of anchorCells.slice(0, -1)) draft.set([131, 131, 131, 255], point * 4);

  const finalized = core.finalizeCreative(draft, sourceGrid.data, 128, 128, {
    grid: 128,
    instruction: "Recolour the NEET emblem's white artwork to gray.",
  });

  assert.equal(finalized.anchorAuthorization.allowed, true);
  assert.equal(finalized.anchorAuthorization.authorizedCells, anchorCells.length - 1);
  for (const point of anchorCells.slice(0, -1)) {
    assert.equal(pixelHexAtPoint(finalized.data, point), "#838383", `authorized cell ${point} was restored to white`);
    assert.equal(finalized.anchoredWhiteMask[point], 0, `authorized cell ${point} remains download-protected`);
  }
  assert.equal(pixelHexAtPoint(finalized.data, retainedWhitePoint), "#FFFFFF");
  assert.equal(finalized.anchoredWhiteMask[retainedWhitePoint], 1);
  assert.deepEqual(alphaMask(finalized.data), alphaMask(faithful.data), "explicit recolor changed source alpha");
  assert.equal(alphaAt(finalized.data, 87, 19, 128), 0, "explicit recolor retained the outside artifact");
  assert.equal(findExteriorNonBlack(finalized.data, 128, 128).length, 0);
  assert.ok(finalized.colors.length <= 16);
  assert.deepEqual(
    [...core.verify(finalized.data, 128, 128, {
      grid: 128,
      alphaMask: finalized.alphaMask,
      anchoredWhiteMask: finalized.anchoredWhiteMask,
    })],
    [],
  );
});

test("an unrelated creative instruction cannot authorize white-anchor drift", () => {
  const source = whiteAnchorFixture32();
  const draft = new Uint8ClampedArray(source);
  setPixel(draft, 32, 16, 16, [131, 131, 131, 255]);

  const finalized = core.finalizeCreative(draft, source, 32, 32, {
    grid: 32,
    instruction: "Make the hat vivid blue and remove the small white dot outside it.",
  });

  assert.equal(finalized.anchorAuthorization.allowed, false);
  assert.equal(pixelHex(finalized.data, 16, 16, 32), "#FFFFFF");
  assert.deepEqual(
    [...core.verify(finalized.data, 32, 32, {
      grid: 32,
      alphaMask: finalized.alphaMask,
      anchoredWhiteMask: finalized.anchoredWhiteMask,
    })],
    [],
  );
});

test("removes one-cell and two-cell detached exterior components but keeps connected details", () => {
  const data = fixtureWithDetachedExteriorComponents();
  const repaired = core.repair(data, 12, 12, { grid: 32 });

  assert.equal(alphaAt(repaired.data, 0, 0, 12), 0, "one-cell artifact survived");
  assert.equal(alphaAt(repaired.data, 9, 1, 12), 0, "first cell of two-cell artifact survived");
  assert.equal(alphaAt(repaired.data, 10, 1, 12), 0, "second cell of two-cell artifact survived");
  assert.equal(alphaAt(repaired.data, 8, 6, 12), 255, "connected one-cell subject detail was deleted");
});

function setPixel(data, width, x, y, [r, g, b, a = 255]) {
  data.set([r, g, b, a], (y * width + x) * 4);
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

function whiteAnchorFixture32() {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 8; y <= 23; y++) for (let x = 8; x <= 23; x++) {
    const edge = x === 8 || x === 23 || y === 8 || y === 23;
    setPixel(data, 32, x, y, edge ? [0, 0, 0, 255] : [88, 88, 88, 255]);
  }
  setPixel(data, 32, 16, 16, [255, 255, 255, 255]);
  setPixel(data, 32, 31, 0, [255, 255, 255, 255]);
  return data;
}

function fixtureWithDetachedExteriorComponents() {
  const data = new Uint8ClampedArray(12 * 12 * 4);
  for (let y = 4; y <= 8; y++) for (let x = 4; x <= 7; x++) {
    setPixel(data, 12, x, y, [64, 96, 128, 255]);
  }
  setPixel(data, 12, 8, 6, [64, 96, 128, 255]);
  setPixel(data, 12, 0, 0, [255, 255, 255, 255]);
  setPixel(data, 12, 9, 1, [255, 255, 255, 255]);
  setPixel(data, 12, 10, 1, [255, 255, 255, 255]);
  return data;
}

function crowdedPaletteWithEnclosedWhiteDetail() {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) setPixel(data, 32, x, y, [0, 0, 0, 255]);
  const colors = palette.colors.slice(1, 17).map((color) => color.rgb);
  for (let color = 0; color < colors.length; color++) {
    const x0 = 3 + (color % 8) * 3;
    const y0 = 3 + Math.floor(color / 8) * 3;
    setPixel(data, 32, x0, y0, [...colors[color], 255]);
    setPixel(data, 32, x0 + 1, y0, [...colors[color], 255]);
    setPixel(data, 32, x0, y0 + 1, [...colors[color], 255]);
    setPixel(data, 32, x0 + 1, y0 + 1, [...colors[color], 255]);
  }
  setPixel(data, 32, 16, 16, [255, 255, 255, 255]);
  return data;
}

function oneOpaquePixel(width, height, x, y) {
  const data = new Uint8ClampedArray(width * height * 4);
  setPixel(data, width, x, y, [255, 255, 255, 255]);
  return data;
}

function normalizedGrid(png, grid) {
  const canvas = core.resizeNearest(png.data, png.width, png.height, 1024, 1024);
  return core.recoverToGrid(canvas.data, canvas.width, canvas.height, grid);
}

function forceOpaque(data) {
  const copy = new Uint8ClampedArray(data);
  for (let offset = 3; offset < copy.length; offset += 4) copy[offset] = 255;
  return copy;
}

function alphaMask(data) {
  const mask = [];
  for (let offset = 3; offset < data.length; offset += 4) mask.push(data[offset]);
  return mask;
}

function pixelHex(data, x, y, width) {
  const i = (y * width + x) * 4;
  return `#${[data[i], data[i + 1], data[i + 2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function pixelHexAtPoint(data, point) {
  const offset = point * 4;
  return `#${[data[offset], data[offset + 1], data[offset + 2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
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
    const point = queue[head];
    if (point < 0 || point >= width * height || exterior[point]) continue;
    const x = point % width, y = Math.floor(point / width);
    if (alphaAt(data, x, y, width) !== 0) continue;
    exterior[point] = 1;
    if (x > 0) queue.push(point - 1);
    if (x + 1 < width) queue.push(point + 1);
    if (y > 0) queue.push(point - width);
    if (y + 1 < height) queue.push(point + width);
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
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] && data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2]) count++;
  }
  return count;
}

function whiteMask(data, width, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (pixelHex(data, x, y, width) === "#FFFFFF" && alphaAt(data, x, y, width) === 255) cells.push(`${x},${y}`);
  }
  return cells.join(";");
}

function whiteCells(data, width, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (pixelHex(data, x, y, width) === "#FFFFFF" && alphaAt(data, x, y, width) === 255) cells.push(y * width + x);
  }
  return cells;
}

function findInteriorColorCell(data, width, excluded, replacementRgb) {
  const excludedSet = new Set(excluded);
  for (let y = 1; y < width - 1; y++) for (let x = 1; x < width - 1; x++) {
    const point = y * width + x;
    if (excludedSet.has(point) || alphaAt(data, x, y, width) !== 255) continue;
    const hex = pixelHex(data, x, y, width);
    const currentRgb = [data[point * 4], data[point * 4 + 1], data[point * 4 + 2]];
    if (hex !== "#000000" && hex !== "#FFFFFF" && currentRgb.some((value, index) => value !== replacementRgb[index])) return point;
  }
  return -1;
}

function mostCommonInteriorRgb(data, width, excludedPoint) {
  const counts = new Map();
  for (let point = 0; point < width * width; point++) {
    if (point === excludedPoint || data[point * 4 + 3] !== 255) continue;
    const rgb = `${data[point * 4]},${data[point * 4 + 1]},${data[point * 4 + 2]}`;
    if (rgb === "0,0,0" || rgb === "255,255,255") continue;
    counts.set(rgb, (counts.get(rgb) || 0) + 1);
  }
  const [rgb] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return rgb.split(",").map(Number);
}

function scaledBounds(bounds, sourceSize, targetSize) {
  return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.floor(value * targetSize / sourceSize)]));
}

function assertBoundsWithinOneCell(actual, expected) {
  for (const key of ["x0", "y0", "x1", "y1"]) assert.ok(Math.abs(actual[key] - expected[key]) <= 1, `${key} moved`);
}
