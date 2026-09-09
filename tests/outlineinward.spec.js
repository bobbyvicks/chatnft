/* CHANGE THE TRAIT'S OWN OUTER PIXELS, RATHER THAN ADDING ANY.

   "change outer pixels to black and itll change the pixels that are touching
   the N E W outside grid to the size of our fixed grid size (easier outline,
   instead of us adding pixels"

   The tool grew the silhouette by the thickness. This takes the trait's own
   outermost pixels and recolours them, so the trait is exactly the size it
   was. The test that carries the whole ask is the bounding box one: same box
   before and after.

   N, E and W as written - empty space above, left or right makes a pixel
   outer, and below does not, because a hoodie runs off the bottom of the
   frame and outlining that cut draws a line across the character. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

/* A block that does NOT touch any edge, so every side is a real silhouette
   edge and the difference between three sides and four is visible. */
const block = (set, W, H) => {
  const bands = [[46, 34, 47], [139, 95, 191], [242, 166, 90], [232, 213, 183]];
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++)
    set(x, y, bands[Math.floor((y - 20) / 5)]);
};

const open = async (page, sides = 'new') => {
  await openTrait(page, { w: 60, h: 60, draw: block });
  await openPanel(page, 'ol');
  await page.evaluate((s) => {
    const sn = document.getElementById('olsnap');
    sn.value = '1'; sn.dispatchEvent(new Event('change', { bubbles: true }));
    const sd = document.getElementById('olsides');
    sd.value = s; sd.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('olinward').checked = true;
    const t = document.getElementById('olthick');
    t.value = '1'; t.dispatchEvent(new Event('input', { bubbles: true }));
  }, sides);
};

const shot = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] < 128) continue;
    n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]]
      .map(v => v.toString(16).padStart(2, '0')).join('');
  };
  return { box: [x0, y0, x1, y1].join(','), opaque: n,
    top: at(30, 20), bottom: at(30, 39), left: at(20, 30), right: at(39, 30),
    inTop: at(30, 21), inBottom: at(30, 38) };
});

test('NOTHING IS ADDED: the trait is the same size afterwards', async ({ page }) => {
  await open(page);
  const before = await shot(page);
  await page.evaluate(() => { olPick = []; olBuildPal(); });
  await page.click('#oladd');
  const after = await shot(page);
  /* The whole ask in one line. Growing a ring would move all four numbers. */
  expect(after.box, 'the bounding box does not move').toBe(before.box);
  expect(after.opaque, 'and no pixel is added').toBe(before.opaque);
});

test('the outer pixels became the colour, and the ones behind them did not', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { olPick = []; olBuildPal(); });
  const before = await shot(page);
  await page.click('#oladd');
  const after = await shot(page);
  expect(after.top, 'the top row is black now').toBe('#000000');
  expect(after.left).toBe('#000000');
  expect(after.right).toBe('#000000');
  /* One cell thick: the row behind the edge keeps the artwork. */
  expect(after.inTop, 'the pixel behind the edge is untouched').toBe(before.inTop);
});

test('ABOVE, LEFT AND RIGHT - AND NOT BELOW', async ({ page }) => {
  await open(page, 'new');
  await page.evaluate(() => { olPick = []; olBuildPal(); });
  const before = await shot(page);
  await page.click('#oladd');
  const after = await shot(page);
  expect(after.top).toBe('#000000');
  /* THE POINT OF THE DEFAULT. A trait cut off by the frame must not get a
     line drawn across the cut. */
  expect(after.bottom, 'the bottom edge is left alone').toBe(before.bottom);
});

test('and all four sides is one click away', async ({ page }) => {
  await open(page, 'all');
  await page.evaluate(() => { olPick = []; olBuildPal(); });
  const before = await shot(page);
  await page.click('#oladd');
  const after = await shot(page);
  /* The positive control for the test above: the bottom CAN be outlined, so
     "the bottom is untouched" there means the sides setting, not a tool that
     cannot reach it. */
  expect(after.bottom, 'the bottom edge is outlined too').toBe('#000000');
  expect(after.bottom).not.toBe(before.bottom);
});

test('the thickness is a grid cell, taken from the project', async ({ page }) => {
  await openTrait(page, { w: 60, h: 60, draw: block });
  await openPanel(page, 'ol');
  const r = await page.evaluate(() => {
    const sn = document.getElementById('olsnap');
    /* The shipped default. */
    const wasDefault = sn.value;
    projectGrid = 30;
    const at30 = (sn.value = 'grid', snapValue());
    projectGrid = 60;
    const at60 = snapValue();
    projectGrid = 160;
    return { wasDefault, at30, at60, artW: art.width };
  });
  expect(r.wasDefault, 'the grid is what the panel opens on').toBe('grid');
  /* 60 wide over a 30 cell grid is 2 pixels a cell; over 60 it is 1. */
  expect(r.at30).toBe(2);
  expect(r.at60).toBe(1);
});

test('adding a ring outside is still there, unticked', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    document.getElementById('olinward').checked = false;
    document.getElementById('olinward').dispatchEvent(new Event('change', { bubbles: true }));
    olPick = []; olBuildPal();
  });
  const before = await shot(page);
  await page.click('#oladd');
  const after = await shot(page);
  /* The old operation, unchanged: this one DOES grow the trait. */
  expect(after.box, 'the ring sits outside, so the box grows').not.toBe(before.box);
  expect(after.opaque).toBeGreaterThan(before.opaque);
});

test('the button says which of the two it will do', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(150);
  const inward = await page.evaluate(() => document.getElementById('oladd').textContent);
  expect(inward).toContain('Change outer pixels');
  const outward = await page.evaluate(async () => {
    const b = document.getElementById('olinward');
    b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    return document.getElementById('oladd').textContent;
  });
  expect(outward).toContain('Add outline');
});

test('several colours run outside in', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const t = document.getElementById('olthick');
    t.value = '2'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const hexes = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#pal .sw')].slice(0, 2).map(s => s.dataset.hex);
    olPick = []; for (const x of h) olToggle(x);
    return h;
  });
  await page.click('#oladd');
  const r = await page.evaluate(() => {
    const W = art.width;
    const d = ctx.getImageData(0, 0, W, art.height).data;
    const at = (x, y) => {
      const i = (y * W + x) * 4;
      return d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]]
        .map(v => v.toString(16).padStart(2, '0')).join('');
    };
    /* Walking IN from the top edge of the block. */
    return [at(30, 20), at(30, 21)];
  });
  /* Colour 1 is the outermost pixel here, which is the other way round from
     the ring version - and follows from the band being the trait's own edge. */
  expect(r).toEqual(hexes);
});
