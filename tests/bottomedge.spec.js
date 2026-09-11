/* THE BOTTOM OF THE FRAME IS A CUT, NOT AN EDGE OF THE ART.

   "the outline adds a black line at the bottom of the screen, specifically
   asked for it to not be like that"

   It was not the outline. blackenEdge repaints the outermost opaque pixels
   black on the way out and treated the canvas boundary as empty unless the
   art filled that whole edge - so a hoodie running off the bottom without
   filling its full width had nothing below every pixel of the last row.
   Measured on a trait with no black in it and no outline run at all: 0 black
   on the bottom row before a save, 244 after.

   The tests here are mostly CONTROLS, because turning a rule off is easy and
   turning off exactly one side of it is the thing that needs proving. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

/* Runs off the bottom, narrower than the canvas, so the bottom edge is not
   filled across - and nothing in it is black. */
const cutOff = (set, W, H) => {
  for (let y = Math.floor(H * 0.45); y < H; y++)
    for (let x = Math.round(W * 0.12); x < W - Math.round(W * 0.12); x++)
      set(x, y, [242, 166, 90]);
};
/* Ends above the bottom, so its underside is a real silhouette edge. */
const floating = (set, W, H) => {
  for (let y = Math.floor(H * 0.3); y < Math.floor(H * 0.7); y++)
    for (let x = Math.round(W * 0.2); x < W - Math.round(W * 0.2); x++)
      set(x, y, [242, 166, 90]);
};
/* Fills every edge, the way a background does. */
const full = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    set(x, y, [139, 95, 191]);
};

/* Black on a row of what a SAVE writes - the canvas is not where this rule
   runs. 320 is above projectGrid, which is what makes blackenEdge apply at
   all; below the grid a trait is not a collection trait and the rule is
   deliberately silent. */
/* THE RULE, APPLIED DIRECTLY.

   These used to go through traitCanvas, which applied the collection's
   border rule on every save. It does not any more - saving a finished trait
   was repainting 1163 pixels of it black, an eighth of an art pixel wide on
   1280 art, over an outline the artist had already drawn. The rule still
   runs where it was asked for, in the extraction pipeline that cuts a trait
   out of a rendered character, so what these tests are about - which edges
   it treats as edges of the ART - is asked of the rule itself. */
const ruleRow = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  blackenEdge(d, W, H);
  const row = (y) => {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] >= 128 && d[i] < 20 && d[i + 1] < 20 && d[i + 2] < 20) n++;
    }
    return n;
  };
  return { bottom: row(H - 1), top: row(Math.floor(H * 0.45)),
    firstRow: row(0), grid: projectGrid, W };
});

const savedRow = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const c = traitCanvas({});
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const row = (y) => {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] >= 128 && d[i] < 20 && d[i + 1] < 20 && d[i + 2] < 20) n++;
    }
    return n;
  };
  const out = { bottom: row(H - 1), top: row(Math.floor(H * 0.45)),
    firstRow: row(0), grid: projectGrid, W };
  c.width = 1; c.height = 1;
  return out;
});

test('A TRAIT CUT OFF BY THE FRAME GETS NO LINE ACROSS THE CUT', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: cutOff });
  const r = await savedRow(page);
  expect(r.W).toBeGreaterThanOrEqual(r.grid);
  /* Was 244 of 244. What is left is the two pixels where the left and right
     edges of the shape meet the last row, which are side edges and right. */
  expect(r.bottom).toBeLessThanOrEqual(2);
});

test('but the top of the shape is still outlined - the rule still works', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: cutOff });
  const r = await ruleRow(page);
  /* THE CONTROL. Without this, "no black on the bottom" would also be true of
     a version that turned the whole rule off, and that is the easy mistake.
     Asked of blackenEdge directly: the save stopped calling it, and this file
     is about which edges the RULE treats as edges of the art. */
  expect(r.top, 'the top edge of the shape is blackened').toBeGreaterThan(100);
});

test('and a trait that ends above the bottom keeps its underside', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: floating });
  /* Through the rule rather than through the save, for the reason above. */
  const r = await page.evaluate(() => {
    const W = art.width, H = art.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    blackenEdge(d, W, H);
    const y = Math.floor(H * 0.7) - 1;
    let n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] >= 128 && d[i] < 20 && d[i + 1] < 20 && d[i + 2] < 20) n++;
    }
    return n;
  });
  /* A shape that stops short of the frame has a real underside, and the rule
     outlines it - the bottom clause that was removed was only ever about art
     the FRAME cuts. */
  expect(r, 'the underside of a floating shape is still outlined').toBeGreaterThan(100);
});

test('a trait that fills every edge is untouched either way', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: full });
  const r = await page.evaluate(() => {
    const W = art.width, H = art.height;
    const before = ctx.getImageData(0, 0, W, H).data;
    const c = traitCanvas({});
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4)
      if (d[i] !== before[i] || d[i + 1] !== before[i + 1] || d[i + 2] !== before[i + 2]) changed++;
    c.width = 1; c.height = 1;
    return changed;
  });
  /* Measured on the real 317 when this rule was written: the 58 files that
     fill all four edges are exactly the 58 backgrounds, and drawing a frame
     round one is what the owner objected to. That still holds. */
  expect(r, 'nothing is repainted on a background').toBe(0);
});

test('THE OUTLINE CHOICE SURVIVES THE SAVE, which is the whole point', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: cutOff });
  await openPanel(page, 'ol');
  await page.evaluate(() => {
    document.getElementById('olinward').checked = true;
    const sn = document.getElementById('olsnap');
    sn.value = '1'; sn.dispatchEvent(new Event('change', { bubbles: true }));
    const sd = document.getElementById('olsides');
    sd.value = 'new'; sd.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.getElementById('olthick');
    t.value = '1'; t.dispatchEvent(new Event('input', { bubbles: true }));
    olPick = []; olBuildPal();
  });
  await page.click('#oladd');
  const r = await savedRow(page);
  /* The tool asks which sides count and answers above, left and right. A save
     that drew the fourth side made that answer a suggestion. */
  expect(r.bottom, 'the side the tool was told to leave alone is left alone')
    .toBeLessThanOrEqual(2);
  expect(r.top, 'and the sides it was told to draw are drawn').toBeGreaterThan(100);
});

test('all four sides still reaches the bottom when it is asked to', async ({ page }) => {
  await openTrait(page, { w: 320, h: 320, draw: cutOff });
  await openPanel(page, 'ol');
  await page.evaluate(() => {
    document.getElementById('olinward').checked = true;
    const sn = document.getElementById('olsnap');
    sn.value = '1'; sn.dispatchEvent(new Event('change', { bubbles: true }));
    const sd = document.getElementById('olsides');
    sd.value = 'all'; sd.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.getElementById('olthick');
    t.value = '1'; t.dispatchEvent(new Event('input', { bubbles: true }));
    olPick = []; olBuildPal();
  });
  await page.click('#oladd');
  const r = await savedRow(page);
  /* THE POSITIVE CONTROL for every "the bottom is clear" above: the bottom
     CAN be black, so a clear one means the setting, not a tool that cannot
     reach it. */
  expect(r.bottom, 'asked for, and drawn').toBeGreaterThan(100);
});
