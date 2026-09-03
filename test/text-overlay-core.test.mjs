import test from "node:test";
import assert from "node:assert/strict";

await import("../text-overlay-core.js");
const {
  applyTextOverlay,
  applyTextOverlays,
  clearNonMatchingPixelsInBox,
  hitTestTextPatches,
  listPixelFonts,
  renderPixelText,
} = globalThis.ChatNftTextOverlay;

const px = (...pixels) => new Uint8ClampedArray(pixels.flat());

test("transparent sprite pixels leave the v1 artwork byte-for-byte unchanged", () => {
  const base = px(
    [10, 20, 30, 255], [40, 50, 60, 255],
    [70, 80, 90, 255], [100, 110, 120, 128],
  );
  const sprite = px(
    [255, 255, 255, 0], [250, 240, 230, 0],
    [1, 2, 3, 0],       [4, 5, 6, 0],
  );

  const result = applyTextOverlay(base, 2, 2, sprite, 2, 2, 0, 0);

  assert.deepEqual([...result], [...base]);
  assert.notEqual(result, base, "the editor must receive a new output buffer");
});

test("opaque text replaces only the covered artwork pixel", () => {
  const base = px(
    [10, 20, 30, 255], [40, 50, 60, 255], [70, 80, 90, 255],
  );
  const sprite = px([240, 230, 220, 255]);

  const result = applyTextOverlay(base, 3, 1, sprite, 1, 1, 1, 0);

  assert.deepEqual([...result], [
    10, 20, 30, 255,
    240, 230, 220, 255,
    70, 80, 90, 255,
  ]);
});

test("semi-transparent text uses source-over blending without touching neighbours", () => {
  const base = px(
    [20, 40, 60, 255], [100, 120, 140, 255],
  );
  const sprite = px([220, 200, 180, 128]);

  const result = applyTextOverlay(base, 2, 1, sprite, 1, 1, 0, 0);

  assert.deepEqual([...result], [
    120, 120, 120, 255,
    100, 120, 140, 255,
  ]);
});

test("a partly off-canvas text sprite is clipped instead of shifting or resizing the base", () => {
  const base = px(
    [1, 1, 1, 255], [2, 2, 2, 255],
    [3, 3, 3, 255], [4, 4, 4, 255],
  );
  const sprite = px(
    [10, 0, 0, 255], [20, 0, 0, 255],
    [30, 0, 0, 255], [40, 0, 0, 255],
  );

  const result = applyTextOverlay(base, 2, 2, sprite, 2, 2, -1, 1);

  assert.deepEqual([...result], [
    1, 1, 1, 255, 2, 2, 2, 255,
    20, 0, 0, 255, 4, 4, 4, 255,
  ]);
});

test("invalid buffer sizes are rejected before artwork can be changed", () => {
  assert.throws(
    () => applyTextOverlay(px([0, 0, 0, 255]), 2, 1, px([0, 0, 0, 255]), 1, 1, 0, 0),
    /base buffer length/i,
  );
});

test("text cleanup changes only non-background pixels inside its exact box", () => {
  const base = px(
    [5, 5, 5, 255], [9, 9, 9, 255], [5, 5, 5, 255],
    [7, 7, 7, 255], [8, 8, 8, 255], [6, 6, 6, 0],
  );

  const result = clearNonMatchingPixelsInBox(
    base, 3, 2, 1, 0, 2, 2, [5, 5, 5, 255],
  );

  assert.deepEqual([...result], [
    5, 5, 5, 255, 5, 5, 5, 255, 5, 5, 5, 255,
    7, 7, 7, 255, 5, 5, 5, 255, 6, 6, 6, 0,
  ]);
});

test("text cleanup clips at the canvas edge without moving the protected art", () => {
  const base = px([1, 2, 3, 255], [9, 9, 9, 255]);
  const result = clearNonMatchingPixelsInBox(
    base, 2, 1, 1, 0, 5, 3, [1, 2, 3, 255],
  );
  assert.deepEqual([...result], [1, 2, 3, 255, 1, 2, 3, 255]);
});

test("pixel text renders two lines on a transparent sprite at an exact integer scale", () => {
  const sprite = renderPixelText("A\nB", [12, 34, 56, 255], 2, 1);

  assert.equal(sprite.width, 10);
  assert.equal(sprite.height, 30);
  assert.deepEqual([...sprite.data.slice(0, 8)], [
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const firstInk = (0 * sprite.width + 4) * 4;
  assert.deepEqual([...sprite.data.slice(firstInk, firstInk + 4)], [12, 34, 56, 255]);
  const lineGap = 14 * sprite.width * 4;
  assert.deepEqual([...sprite.data.slice(lineGap, lineGap + 4)], [0, 0, 0, 0]);
});

test("pixel text preserves supported lower-case letterforms instead of forcing uppercase", () => {
  const lower = renderPixelText("i", [255, 255, 255, 255], 1, 1);
  const upper = renderPixelText("I", [255, 255, 255, 255], 1, 1);

  assert.notDeepEqual([...lower.data], [...upper.data]);
  assert.equal(lower.width, 5);
  assert.equal(lower.height, 7);
});

test("pixel text rejects non-integer scaling so it can never blur the grid", () => {
  assert.throws(
    () => renderPixelText("EXIT", [255, 255, 255, 255], 1.5, 1),
    /scale.*whole/i,
  );
});

test("advanced text sizing and centering use exact whole-pixel dimensions", () => {
  const sprite = renderPixelText("I\nII", [9, 8, 7, 255], {
    pixelWidth: 2,
    pixelHeight: 3,
    letterSpacing: 4,
    lineSpacing: 5,
    align: "center",
  });

  assert.equal(sprite.width, 24);
  assert.equal(sprite.height, 47);
  const beforeCenteredInk = (0 * sprite.width + 6) * 4 + 3;
  const firstCenteredInk = (0 * sprite.width + 7) * 4 + 3;
  assert.equal(sprite.data[beforeCenteredInk], 0);
  assert.equal(sprite.data[firstCenteredInk], 255);
});

test("fractional text sizing distributes whole cells without antialiasing", () => {
  const sprite = renderPixelText("I", [90, 120, 150, 255], {
    pixelWidth: 1.1,
    pixelHeight: 1.1,
    letterSpacing: 0.1,
    lineSpacing: 0.1,
  });

  assert.equal(sprite.width, 6);
  assert.equal(sprite.height, 8);
  for (let i = 3; i < sprite.data.length; i += 4) {
    assert.ok(sprite.data[i] === 0 || sprite.data[i] === 255);
  }
});

test("whole-box wrap transforms the completed text outline and shadow together", () => {
  const base = renderPixelText("I", [200, 210, 220, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    outlineSize: 1,
    outlineColor: [10, 20, 30, 255],
    shadowEnabled: true,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowColor: [90, 80, 70, 255],
  });
  const wrapped = renderPixelText("I", [200, 210, 220, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    outlineSize: 1,
    outlineColor: [10, 20, 30, 255],
    shadowEnabled: true,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowColor: [90, 80, 70, 255],
    wrapX: 2,
  });

  const opaque = data => {
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) count += 1;
    return count;
  };
  assert.equal(wrapped.width, base.width + 2);
  assert.equal(wrapped.height, base.height);
  assert.equal(opaque(wrapped.data), opaque(base.data));
  assert.deepEqual(
    new Set([...wrapped.data].filter((_, index) => index % 4 === 3)),
    new Set([0, 255]),
  );
});

test("bold text thickens glyphs without introducing translucent pixels", () => {
  const normal = renderPixelText("I", [40, 50, 60, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    bold: 0,
  });
  const bold = renderPixelText("I", [40, 50, 60, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    bold: 1,
  });

  assert.equal(normal.width, 5);
  assert.equal(bold.width, 6);
  assert.equal(bold.height, 8);
  assert.equal(normal.data[(1 * normal.width + 3) * 4 + 3], 0);
  assert.equal(bold.data[(1 * bold.width + 3) * 4 + 3], 255);
  for (let i = 3; i < bold.data.length; i += 4) {
    assert.ok(bold.data[i] === 0 || bold.data[i] === 255);
  }
});

test("horizontal lean shifts the top while keeping the bottom on the pixel grid", () => {
  const sprite = renderPixelText("I", [255, 255, 255, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    lean: 2,
  });

  assert.equal(sprite.width, 7);
  assert.equal(sprite.height, 7);
  assert.equal(sprite.data[(0 * sprite.width + 2) * 4 + 3], 255);
  assert.equal(sprite.data[(6 * sprite.width + 0) * 4 + 3], 255);
});

test("baseline slope can lower the right side without clipping either edge", () => {
  const sprite = renderPixelText("I", [255, 255, 255, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    slope: 2,
  });

  assert.equal(sprite.width, 5);
  assert.equal(sprite.height, 9);
  assert.equal(sprite.data[(0 * sprite.width + 0) * 4 + 3], 255);
  assert.equal(sprite.data[(2 * sprite.width + 4) * 4 + 3], 255);
});

test("pixel text outline expands around every edge without covering the letters", () => {
  const sprite = renderPixelText("I", [200, 210, 220, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    outlineSize: 1,
    outlineColor: [10, 20, 30, 255],
  });

  assert.equal(sprite.width, 7);
  assert.equal(sprite.height, 9);
  assert.deepEqual(
    [...sprite.data.slice((0 * sprite.width + 0) * 4, (0 * sprite.width + 0) * 4 + 4)],
    [10, 20, 30, 255],
  );
  assert.deepEqual(
    [...sprite.data.slice((1 * sprite.width + 1) * 4, (1 * sprite.width + 1) * 4 + 4)],
    [200, 210, 220, 255],
  );
  assert.deepEqual(
    [...sprite.data.slice((4 * sprite.width + 0) * 4, (4 * sprite.width + 0) * 4 + 4)],
    [0, 0, 0, 0],
  );
});

test("pixel text accepts larger crisp outlines and rejects fractional outline sizes", () => {
  const sprite = renderPixelText("I", [255, 255, 255, 255], {
    outlineSize: 2,
    outlineColor: [255, 0, 120, 255],
  });

  assert.equal(sprite.width, 9);
  assert.equal(sprite.height, 11);
  assert.deepEqual(
    [...sprite.data.slice((0 * sprite.width + 0) * 4, (0 * sprite.width + 0) * 4 + 4)],
    [255, 0, 120, 255],
  );
  for (let i = 3; i < sprite.data.length; i += 4) {
    assert.ok(sprite.data[i] === 0 || sprite.data[i] === 255);
  }
  assert.throws(
    () => renderPixelText("I", [255, 255, 255, 255], { outlineSize: 1.5 }),
    /outlineSize.*whole/i,
  );
});

test("pixel text shadow follows the completed outline silhouette", () => {
  const sprite = renderPixelText("I", [200, 210, 220, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    outlineSize: 1,
    outlineColor: [10, 20, 30, 255],
    shadowEnabled: true,
    shadowOffsetX: 2,
    shadowOffsetY: 1,
    shadowColor: [90, 80, 70, 255],
  });

  assert.equal(sprite.width, 9);
  assert.equal(sprite.height, 10);
  assert.equal(sprite.contentOffsetX, 0);
  assert.equal(sprite.contentOffsetY, 0);
  assert.deepEqual(
    [...sprite.data.slice((0 * sprite.width + 0) * 4, (0 * sprite.width + 0) * 4 + 4)],
    [10, 20, 30, 255],
    "the original outline must remain above the shadow",
  );
  assert.deepEqual(
    [...sprite.data.slice((9 * sprite.width + 8) * 4, (9 * sprite.width + 8) * 4 + 4)],
    [90, 80, 70, 255],
    "the outline's far corner must cast a shadow too",
  );
});

test("pixel text shadow can move left and up without clipping or moving the text anchor", () => {
  const sprite = renderPixelText("I", [200, 210, 220, 255], {
    pixelWidth: 1,
    pixelHeight: 1,
    shadowEnabled: true,
    shadowOffsetX: -2,
    shadowOffsetY: -3,
    shadowColor: [1, 2, 3, 255],
  });

  assert.equal(sprite.width, 7);
  assert.equal(sprite.height, 10);
  assert.equal(sprite.contentOffsetX, 2);
  assert.equal(sprite.contentOffsetY, 3);
  assert.deepEqual([...sprite.data.slice(0, 4)], [1, 2, 3, 255]);
  assert.deepEqual(
    [...sprite.data.slice((3 * sprite.width + 2) * 4, (3 * sprite.width + 2) * 4 + 4)],
    [200, 210, 220, 255],
  );
});

test("pixel text shadow accepts fractional movement without antialiasing", () => {
  const sprite = renderPixelText("I", [255, 255, 255, 255], {
    shadowEnabled: true,
    shadowOffsetX: 1.5,
    shadowOffsetY: 0.5,
    shadowColor: [20, 30, 40, 255],
  });

  for (let i = 3; i < sprite.data.length; i += 4) {
    assert.ok(sprite.data[i] === 0 || sprite.data[i] === 255);
  }
});

test("pixel text shadow still rejects invalid colours", () => {
  assert.throws(
    () => renderPixelText("I", [255, 255, 255, 255], {
      shadowEnabled: true,
      shadowColor: [0, 0, 0],
    }),
    /shadow colour.*four byte/i,
  );
});

test("pixel text exposes five complete selectable font styles", () => {
  assert.deepEqual(listPixelFonts(), [
    { id: "classic", name: "Classic 5×7", width: 5, height: 7 },
    { id: "compact", name: "Compact 3×5", width: 3, height: 5 },
    { id: "arcade", name: "Arcade 5×7", width: 5, height: 7 },
    { id: "rounded", name: "Rounded 5×7", width: 5, height: 7 },
    { id: "stencil", name: "Stencil 5×7", width: 5, height: 7 },
  ]);
});

test("each selectable font renders a distinct hard-edged glyph sprite", () => {
  const fontIds = ["classic", "compact", "arcade", "rounded", "stencil"];
  const sprites = fontIds.map(font => renderPixelText("HAT 09", [8, 9, 10, 255], {
    font,
    pixelWidth: 1,
    pixelHeight: 1,
    letterSpacing: 1,
  }));
  const signatures = sprites.map(sprite => `${sprite.width}x${sprite.height}:${[...sprite.data].join(",")}`);

  assert.equal(new Set(signatures).size, 5);
  assert.equal(sprites[0].height, 7);
  assert.equal(sprites[1].height, 5);
  for (const sprite of sprites) {
    for (let i = 3; i < sprite.data.length; i += 4) {
      assert.ok(sprite.data[i] === 0 || sprite.data[i] === 255);
    }
  }
});

test("pixel text rejects unknown fonts instead of silently changing its appearance", () => {
  assert.throws(
    () => renderPixelText("TEXT", [255, 255, 255, 255], { font: "missing" }),
    /font.*unknown/i,
  );
});

test("multiple text boxes composite independently in their listed order", () => {
  const base = px(
    [1, 1, 1, 255], [2, 2, 2, 255], [3, 3, 3, 255],
  );
  const patches = [
    { data: px([200, 0, 0, 255]), width: 1, height: 1, x: 0, y: 0 },
    { data: px([0, 0, 200, 255]), width: 1, height: 1, x: 2, y: 0 },
  ];

  const result = applyTextOverlays(base, 3, 1, patches);

  assert.deepEqual([...result], [
    200, 0, 0, 255,
    2, 2, 2, 255,
    0, 0, 200, 255,
  ]);
});

test("click hit-testing selects the topmost visible text pixel only", () => {
  const transparent = px([0, 0, 0, 0], [255, 255, 255, 255]);
  const opaque = px([255, 0, 0, 255]);
  const patches = [
    { id: "bottom", data: transparent, width: 2, height: 1, x: 4, y: 3 },
    { id: "top", data: opaque, width: 1, height: 1, x: 5, y: 3 },
  ];

  assert.equal(hitTestTextPatches(patches, 5, 3)?.id, "top");
  assert.equal(hitTestTextPatches(patches, 4, 3), null);
});
