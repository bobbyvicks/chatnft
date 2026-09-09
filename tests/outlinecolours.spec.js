/* MAKE ALL THE OUTER PIXELS A COLOUR - OR TWELVE.

   "can we change the ouline function so its 'make all outer pixels _ colour'
   and have them be able to chose a colour or even up to 12 colours and have
   the colour pallete be the colours to chose from"

   The colours come from the trait's own palette. Thickness is rings, so the
   chosen colours map onto them from the inside out: the first colour touches
   the art, the last is the outermost. One colour is what the tool always did.

   The test that matters most is the one that reads the rings back off the
   canvas by distance from the art - a version that painted the whole outline
   in the first colour, or in the last, would pass a "the outline is coloured"
   check and fail this one. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

/* A block in the middle, so the rings around it are unambiguous and every
   ring is reachable from the outside - in four bands, because the colours to
   outline with come from the trait's own palette and a solid block offers
   exactly one of them to choose from. */
const block = (set, W, H) => {
  const bands = [[46, 34, 47], [139, 95, 191], [242, 166, 90], [232, 213, 183]];
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++)
    set(x, y, bands[Math.floor((y - 20) / 5)]);
};

const openOutline = async (page) => {
  await openTrait(page, { w: 60, h: 60, draw: block });
  await openPanel(page, 'ol');
  await page.evaluate(() => {
    document.getElementById('olsnap').value = '1';
    document.getElementById('olsnap').dispatchEvent(new Event('change', { bubbles: true }));
    /* THE RING, ADDED OUTSIDE. This file is about how the chosen colours map
       onto rings, and the rings it reads are the ones drawn AROUND the art -
       so it turns the newer operation off explicitly rather than relying on
       which of the two happens to be the default. Changing the trait's own
       outer pixels is a different band, and outlineinward.spec.js is where it
       is checked. */
    document.getElementById('olinward').checked = false;
    document.getElementById('olinward').dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const setThick = (page, t) => page.evaluate((v) => {
  const el = document.getElementById('olthick');
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return +el.value;
}, t);

/* Every colour on the canvas, by how far out it sits from the block. Ring 1
   is the layer touching the art. */
const rings = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const hexAt = (x, y) => {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 128) return null;
    return '#' + [d[i], d[i + 1], d[i + 2]]
      .map(v => v.toString(16).padStart(2, '0')).join('');
  };
  /* Walk out from the block's left edge along its middle row. */
  const out = [];
  for (let k = 1; k <= 14; k++) out.push(hexAt(20 - k, 30));
  return out;
});

const pick = (page, hexes) => page.evaluate((list) => {
  olPick = [];
  for (const h of list) olToggle(h);
  return olPick.slice();
}, hexes);

test('the choices are the trait own colours, not a colour picker', async ({ page }) => {
  await openOutline(page);
  const r = await page.evaluate(() => ({
    hasPicker: !!document.getElementById('olcol'),
    grid: [...document.querySelectorAll('#olpal .olchip')].map(s => s.dataset.hex),
    palette: [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex),
  }));
  expect(r.hasPicker, 'the single colour input is gone').toBe(false);
  expect(r.grid.length).toBeGreaterThan(0);
  /* The same colours the trait has, in the same order - one source. */
  expect(r.grid).toEqual(r.palette);
});

test('ONE COLOUR MAKES ALL THE OUTER PIXELS THAT COLOUR', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 3);
  const hex = await page.evaluate(() =>
    document.querySelector('#pal .sw').dataset.hex);
  await pick(page, [hex]);
  await page.click('#oladd');
  const r = await rings(page);
  /* Three rings, all of them the chosen colour, then nothing. */
  expect(r.slice(0, 3)).toEqual([hex, hex, hex]);
  expect(r[3]).toBeNull();
});

test('SEVERAL COLOURS RUN FROM THE INSIDE OUT, ONE TO EACH RING', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 3);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 3).map(s => s.dataset.hex));
  expect(new Set(hexes).size, 'three distinct colours to tell apart').toBe(3);
  await pick(page, hexes);
  await page.click('#oladd');
  const r = await rings(page);
  /* THE ORDER IS THE POINT. Painting the whole outline in hexes[0], or in
     hexes[2], would pass a "the outline is coloured" check and fail this. */
  expect(r.slice(0, 3)).toEqual(hexes);
  expect(r[3]).toBeNull();
});

test('fewer colours than rings: the last one fills the rest', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 4);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 2).map(s => s.dataset.hex));
  await pick(page, hexes);
  await page.click('#oladd');
  const r = await rings(page);
  /* Not stopping short of the thickness that was asked for. */
  expect(r.slice(0, 4)).toEqual([hexes[0], hexes[1], hexes[1], hexes[1]]);
  expect(r[4]).toBeNull();
});

test('twelve is the cap, and twelve rings can all be used', async ({ page }) => {
  await openOutline(page);
  const max = await page.evaluate(() => +document.getElementById('olthick').max);
  expect(max, 'twelve colours need twelve rings to land on').toBe(12);
  const r = await page.evaluate(() => {
    olPick = [];
    const all = [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex);
    /* More distinct colours than the cap, so the cap is what stops it. */
    const many = [];
    for (let i = 0; i < 20; i++) many.push(all[i % all.length]);
    const distinct = [...new Set(many)];
    for (const h of distinct) olToggle(h);
    return { asked: distinct.length, kept: olPick.length, cap: OL_MAX_COLOURS };
  });
  expect(r.cap).toBe(12);
  expect(r.kept).toBeLessThanOrEqual(12);
  if (r.asked > 12) expect(r.kept).toBe(12);
});

test('clicking a chosen colour again takes it out, and order survives', async ({ page }) => {
  await openOutline(page);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 3).map(s => s.dataset.hex));
  await pick(page, hexes);
  const after = await page.evaluate((h) => { olToggle(h); return olPick.slice(); }, hexes[1]);
  expect(after, 'the middle one goes and the others keep their order')
    .toEqual([hexes[0], hexes[2]]);
  /* And the grid shows the positions, so the order is visible not remembered. */
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('#olpal .olchip[data-n]')]
      .map(s => s.dataset.n + ':' + s.dataset.hex).sort());
  expect(shown).toEqual(['1:' + hexes[0], '2:' + hexes[2]]);
});

test('nothing chosen is still a black outline, as it always was', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 2);
  await page.evaluate(() => { olPick = []; olBuildPal(); });
  await page.click('#oladd');
  const r = await rings(page);
  expect(r.slice(0, 2)).toEqual(['#000000', '#000000']);
});

test('the panel says which ring gets what before the button is pressed', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 4);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 2).map(s => s.dataset.hex));
  await pick(page, hexes);
  const said = await page.evaluate(() => {
    olSaid();
    return document.getElementById('olpicked').textContent;
  });
  /* Two colours over four rings is not a surprise if it is written down. */
  expect(said).toContain(hexes[0]);
  expect(said).toContain(hexes[1]);
  expect(said).toContain('×3');
});

test('the preview and the outline it adds are the same picture', async ({ page }) => {
  await openOutline(page);
  await setThick(page, 3);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 3).map(s => s.dataset.hex));
  await pick(page, hexes);
  await page.waitForTimeout(120);
  /* A preview showing one thing and an apply writing another would be the
     worst version of this, so they are compared pixel for pixel on the ring. */
  const before = await page.evaluate(() => {
    const pv = document.getElementById('olpv');
    const g = pv.getContext('2d');
    const d = g.getImageData(0, 0, pv.width, pv.height).data;
    const W = pv.width;
    const at = (x, y) => {
      const i = (y * W + x) * 4;
      return d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]]
        .map(v => v.toString(16).padStart(2, '0')).join('');
    };
    return [1, 2, 3].map(k => at(20 - k, 30));
  });
  await page.click('#oladd');
  const after = await rings(page);
  expect(before).toEqual(after.slice(0, 3));
});

test('PAINTING A COLOUR DOES NOT REWRITE THE OUTLINE CHOICES', async ({ page }) => {
  await openOutline(page);
  const hexes = await page.evaluate(() =>
    [...document.querySelectorAll('#pal .sw')].slice(0, 2).map(s => s.dataset.hex));
  await pick(page, hexes);
  /* THE COLLISION THIS EXISTS FOR. The chooser first used the palette's own
     .sw class, and setColor sweeps every .sw on the page writing aria-pressed
     to show the painting colour - the same attribute that marks a colour as
     chosen here. So picking up the brush silently rewrote the outline
     selection, and nothing caught it until the full suite ran.

     Driven through setColor rather than by clicking a swatch, because that is
     the sweep itself: whatever else changes, this is the line that used to
     reach across. */
  const after = await page.evaluate((h) => {
    setColor(h);
    return { picked: olPick.slice(),
      marked: [...document.querySelectorAll('#olpal .olchip[aria-pressed="true"]')]
        .map(s => s.dataset.hex),
      numbered: [...document.querySelectorAll('#olpal .olchip[data-n]')]
        .map(s => s.dataset.hex) };
  }, '#123456');
  expect(after.picked, 'the list is untouched').toEqual(hexes);
  expect(after.marked, 'and so is what the grid shows').toEqual(hexes);
  expect(after.numbered).toEqual(hexes);
});
