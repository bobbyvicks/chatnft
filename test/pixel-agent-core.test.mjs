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

test("renders the skin grid at an exact integer 160 to 1280 scale without changing the legacy default", () => {
  const skinGrid = new Uint8ClampedArray(160 * 160 * 4);
  skinGrid.set([23, 45, 67, 255], (3 * 160 + 2) * 4);

  const skin = core.renderGridToCanvas(skinGrid, 160, 1280);
  assert.equal(skin.width, 1280);
  assert.equal(skin.height, 1280);
  assert.deepEqual([...skin.data.slice((24 * 1280 + 16) * 4, (24 * 1280 + 16) * 4 + 4)], [23, 45, 67, 255]);
  assert.deepEqual([...skin.data.slice((31 * 1280 + 23) * 4, (31 * 1280 + 23) * 4 + 4)], [23, 45, 67, 255]);
  assert.deepEqual([...skin.data.slice((32 * 1280 + 24) * 4, (32 * 1280 + 24) * 4 + 4)], [0, 0, 0, 0]);

  const legacyGrid = new Uint8ClampedArray(128 * 128 * 4);
  const legacy = core.renderGridToCanvas(legacyGrid, 128);
  assert.equal(legacy.width, 1024);
  assert.equal(legacy.height, 1024);
});

test("locks skin repair to a deterministic source-derived palette instead of the hats palette", () => {
  const source = new Uint8ClampedArray(32 * 32 * 4);
  const draft = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
    const edge = x === 1 || x === 30 || y === 1 || y === 30;
    setPixel(source, 32, x, y, edge ? [2, 1, 1, 255] : [103, 64, 46, 255]);
    setPixel(draft, 32, x, y, edge ? [89, 56, 0, 255] : [89, 56, 0, 255]);
  }
  setPixel(source, 32, 3, 3, [87, 48, 34, 255]);

  const sourcePalette = core.deriveSourcePalette(source, 16);
  assert.deepEqual([...sourcePalette], ["#000000", "#67402E", "#020101", "#573022"]);
  assert.equal(sourcePalette.includes("#593800"), false, "orange hats color leaked into the skin palette");

  const finalized = core.finalizeCreative(draft, source, 32, 32, {
    grid: 32,
    paletteHex: sourcePalette,
    maxOpaqueColors: 16,
  });
  assert.equal(finalized.colors.includes("#593800"), false);
  assert.ok(finalized.colors.some((hex) => ["#67402E", "#573022"].includes(hex)), "source brown was not retained");
  assert.deepEqual([...core.verify(finalized.data, 32, 32, {
    grid: 32,
    paletteHex: sourcePalette,
    maxOpaqueColors: 16,
    alphaMask: finalized.alphaMask,
  })], []);
});

test("skin source palette keeps sparse coral motif color families instead of filling every slot with blue variants", () => {
  const source = new Uint8ClampedArray(32 * 32 * 4);
  let point = 0;
  const paint = (count, rgba) => {
    for (let n = 0; n < count; n++, point++) source.set(rgba, point * 4);
  };
  paint(53, [0, 0, 0, 255]);
  for (let shade = 0; shade < 25; shade++) {
    paint(35, [40 + shade % 8, 32 + Math.floor(shade / 8), 128 + shade % 12, 255]);
  }
  paint(24, [244, 216, 73, 255]);
  paint(24, [233, 60, 55, 255]);
  paint(24, [25, 155, 150, 255]);
  paint(24, [139, 100, 184, 255]);

  const selected = core.deriveSourcePalette(source, 16);

  assert.equal(selected[0], "#000000");
  for (const motif of ["#F4D849", "#E93C37", "#199B96", "#8B64B8"]) {
    assert.ok(selected.includes(motif), `${motif} motif family was discarded`);
  }
  assert.ok(selected.length <= 16);
});

test("locks skin finalization to the canonical body silhouette instead of a damaged source mask", () => {
  const width = 32;
  const canonicalMask = new Uint8ClampedArray(width * width * 4);
  const source = new Uint8ClampedArray(width * width * 4);
  const draft = new Uint8ClampedArray(width * width * 4);
  for (let y = 3; y <= 28; y++) for (let x = 3; x <= 28; x++) {
    setPixel(canonicalMask, width, x, y, [110, 80, 60, 255]);
    setPixel(draft, width, x, y, [103, 64, 46, 255]);
    if (x !== 3) setPixel(source, width, x, y, [103, 64, 46, 255]);
  }
  for (let y = 12; y <= 18; y++) {
    setPixel(source, width, 29, y, [103, 64, 46, 255]);
    setPixel(draft, width, 29, y, [103, 64, 46, 255]);
  }
  const sourcePalette = core.deriveSourcePalette(source, 16);

  const finalized = core.finalizeCreative(draft, source, width, width, {
    grid: width,
    canonicalAlphaMask: canonicalMask,
    paletteHex: sourcePalette,
    maxOpaqueColors: 16,
  });

  for (let point = 0; point < width * width; point++) {
    assert.equal(
      finalized.data[point * 4 + 3],
      canonicalMask[point * 4 + 3],
      `alpha mismatch at cell ${point}`,
    );
  }
  assert.equal(pixelHex(finalized.data, 3, 15, width), "#000000", "restored canonical edge is not black");
  assert.equal(alphaAt(finalized.data, 29, 15, width), 0, "source-only edge survived outside the canonical silhouette");
  assert.equal(pixelHex(finalized.data, 10, 10, width), "#67402E", "interior skin artwork changed");
});

test("builds a clothing palette that keeps sparse light text and collapses near-duplicate neutral shading", () => {
  assert.equal(typeof core.deriveClothingPalette, "function");
  const shirt = new Uint8ClampedArray(32 * 32 * 4);
  let point = 0;
  const paint = (count, rgba) => {
    for (let n = 0; n < count; n++, point++) shirt.set(rgba, point * 4);
  };
  paint(540, [57, 62, 66, 255]);
  paint(180, [58, 63, 67, 255]);
  paint(120, [24, 28, 32, 255]);
  paint(70, [245, 246, 247, 255]);
  paint(60, [220, 20, 30, 255]);
  paint(54, [0, 0, 0, 255]);

  const clothing = core.deriveClothingPalette(shirt, 16);
  const projectColors = new Set(palette.colors.map((color) => color.hex.toUpperCase()));
  assert.equal(clothing[0], "#000000");
  assert.ok(clothing.includes("#FFFFFF"), "near-white lettering was not reserved");
  assert.ok(clothing.some((hex) => ["#B60020", "#F4002E", "#FF7873"].includes(hex)), "small red accent was discarded");
  assert.ok(clothing.every((hex) => projectColors.has(hex)), "clothing cleanup left the fixed project palette");
  assert.equal(clothing.some((hex) => ["#004A48", "#006F6D", "#009793"].includes(hex)), false,
    "neutral shirt shading was incorrectly mapped to teal");
  assert.ok(clothing.length <= 16);
});

test("locks source-black clothing ink across exterior borders and interior arm seams", () => {
  const shirt = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 8; y < 30; y++) for (let x = 5; x < 27; x++) {
    const edge = x === 5 || x === 26 || y === 8 || y === 29;
    setPixel(shirt, 32, x, y, edge ? [8, 8, 8, 255] : [62, 62, 62, 255]);
  }
  for (let y = 16; y < 29; y++) setPixel(shirt, 32, 10, y, [14, 14, 14, 255]);
  const draft = new Uint8ClampedArray(shirt);
  for (let y = 8; y < 30; y++) for (let x = 5; x < 27; x++) {
    if (pixelHex(shirt, x, y, 32) !== "#3E3E3E") setPixel(draft, 32, x, y, [48, 48, 48, 255]);
  }

  const clothing = core.deriveClothingPalette(shirt, 8);
  const finalized = core.finalizeCreative(draft, shirt, 32, 32, {
    grid: 32,
    paletteHex: clothing,
    maxOpaqueColors: 8,
    preserveSourceBlack: true,
  });

  assert.equal(pixelHex(finalized.data, 10, 20, 32), "#000000", "black arm seam was recolored");
  assert.equal(pixelHex(finalized.data, 5, 12, 32), "#000000", "black exterior border was recolored");
  assert.equal(finalized.anchoredBlackMask[20 * 32 + 10], 1, "interior black ink was not anchored");
  assert.deepEqual([...core.verify(finalized.data, 32, 32, {
    grid: 32,
    paletteHex: clothing,
    maxOpaqueColors: 8,
    alphaMask: finalized.alphaMask,
    anchoredBlackMask: finalized.anchoredBlackMask,
  })], []);
});

test("focuses a small clothing trait for generation and restores its exact grid position", () => {
  const source = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 20; y < 24; y++) for (let x = 10; x < 18; x++) {
    setPixel(source, 32, x, y, x === 10 || x === 17 ? [0, 0, 0, 255] : [48, 48, 48, 255]);
  }

  const focused = core.focusOpaqueRegion(source, 32, 32, { padding: 4, targetSize: 64 });
  assert.deepEqual({ width: focused.width, height: focused.height }, { width: 64, height: 64 });
  assert.equal(focused.transform.sourceWidth, 32);
  assert.equal(focused.transform.sourceHeight, 32);
  assert.ok(focused.transform.x <= 10 && focused.transform.x + focused.transform.width > 17);
  assert.ok(focused.transform.y <= 20 && focused.transform.y + focused.transform.height > 23);
  assert.ok(focused.transform.height < focused.transform.width, "the short shirt crop was forced back into a square");

  const restored = core.restoreFocusedRegion(focused.data, 64, 64, focused.transform);
  assert.deepEqual([...restored.data], [...source]);
  assert.deepEqual({ width: restored.width, height: restored.height }, { width: 32, height: 32 });
});

test("removes isolated neutral clothing specks without flattening text edge pixels", () => {
  const shirt = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 8; y < 30; y++) for (let x = 5; x < 27; x++) {
    const edge = x === 5 || x === 26 || y === 8 || y === 29;
    setPixel(shirt, 32, x, y, edge ? [0, 0, 0, 255] : [48, 48, 48, 255]);
  }
  setPixel(shirt, 32, 9, 14, [88, 88, 88, 255]);
  setPixel(shirt, 32, 18, 20, [255, 255, 255, 255]);
  setPixel(shirt, 32, 17, 20, [88, 88, 88, 255]);

  const clothing = core.deriveClothingPalette(shirt, 8);
  const finalized = core.finalizeCreative(shirt, shirt, 32, 32, {
    grid: 32,
    paletteHex: clothing,
    maxOpaqueColors: 8,
    preserveSourceBlack: true,
    cleanClothingShading: true,
  });

  assert.equal(pixelHex(finalized.data, 9, 14, 32), "#303030", "isolated chest speck survived");
  assert.equal(pixelHex(finalized.data, 17, 20, 32), "#585858", "text edge shading was flattened");
  assert.equal(pixelHex(finalized.data, 18, 20, 32), "#FFFFFF", "text anchor changed");
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
    "Change the NEET lettering to red",
    "Change NEET letters to blue.",
    "Change the emblem to #838383.",
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
    "No recolor of the NEET text",
    "No change to the NEET lettering color.",
    "Don't change the NEET lettering to red.",
    "Change the outline color to black.",
    "Make the hat the same colour as the reference.",
    "Recolor the hat artwork blue.",
    "Recolor the logo background blue",
    "Recolor the NEET logo's background blue.",
    "Recolor the text box blue",
    "Recolor the artwork blue.",
    "Recolor the hat blue behind the NEET text.",
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
