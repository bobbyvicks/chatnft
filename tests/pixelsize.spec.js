/* What this art is drawn at, and putting it back on that grid.

   THE FEATURE EXISTS BECAUSE THE MEASUREMENT SAID THE ASK COULD NOT BE DONE.
   "Resize everything to 4x4 or 8x8 so the collection lines up" met 317 real
   files: 151 are drawn at 10px blocks, 34 at 8px (every skin), 42 have no
   block structure at all. 4 and 8 do not divide 10, so moving those 151 onto
   an 8 grid rescales 128 blocks across to 160 and each drawn pixel becomes one
   and a quarter pixels.

   What IS needed, and what these tests pin, is the repair: 31 of the 317 sit
   between 90% and 98% flat at their own block size - drawn on a grid, with
   hand-edit strays breaking it. Tidy flattens each block to the colour most of
   it already is.

   THE TWO THAT MATTER:
     - it says what the repair would cost BEFORE the repair happens, and
     - one press of undo puts every stray back.

   THE FIXTURE IS GREY ON PURPOSE. A saturated fixture is two colour balls
   covering the whole picture, which basePlan calls a RENDER, so startEditor
   hides the base and erases the canvas before the test begins - and every
   pixel assertion then passes by comparing nothing to nothing. fitgrid.spec
   paid for that once; the guard below makes it loud rather than green.
*/
import { test, expect } from '@playwright/test';
import { setSelect } from './helpers.js';

/* Art drawn at 10px blocks on a 160 canvas, with `strays` pixels deliberately
   off the grid inside otherwise-flat blocks. Returns nothing - the tests read
   the page. */
const open = (page, opts) => page.evaluate(async (o) => {
  const { block, strays, size } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  const w = size, h = size;
  const d = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, v) => { const i = (y * w + x) * 4;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; };
  /* Grey, and a different grey per block so the art has real structure to
     measure rather than one flat field. */
  const across = Math.floor(w / block);
  for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
    const v = 40 + ((bx * 7 + by * 13) % 12) * 8;
    for (let y = by * block; y < (by + 1) * block; y++)
      for (let x = bx * block; x < (bx + 1) * block; x++) put(x, y, v);
  }
  /* The strays: one pixel each, in the top-left corner of the first `strays`
     blocks along the diagonal, set to a grey no block uses. */
  const hit = [];
  for (let k = 0; k < strays; k++) {
    const bx = k % across, by = k % across;
    put(bx * block + 1, by * block + 1, 232);
    hit.push([bx * block + 1, by * block + 1]);
  }
  fileName = 'probe';
  startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
  await new Promise(r => setTimeout(r, 200));
  /* The real trait-open path: startEditor resets gridBlock to 1 by design and
     the caller sets it afterwards. */
  adoptBlock(measuredBlock(d, w, h));
  await new Promise(r => setTimeout(r, 120));
  const px = ctx.getImageData(0, 0, art.width, art.height).data;
  let opaque = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) opaque++;
  /* AN INSTRUMENT FAILURE MUST NOT LOOK LIKE A MEASUREMENT. */
  if (!opaque) throw new Error('the fixture was erased before the test began');
  return { strayAt: hit, gridBlock: gridBlock, opaque: opaque };
}, opts);

const shown = (page) => page.evaluate(() => ({
  note: document.getElementById('blknow').textContent,
  why: document.getElementById('blknow').title,
  sizes: [...document.getElementById('blksize').options].map(o => o.textContent),
  chosen: document.getElementById('blksize').value,
  canvas: art.width + 'x' + art.height,
}));

const colourAt = (page, x, y) => page.evaluate(([px, py]) => {
  const d = ctx.getImageData(px, py, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [x, y]);

test.describe('the pixel size of the art', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof blockPlan === 'function');
  });

  test('IT SAYS WHAT THE ART IS DRAWN AT, AND HOW WELL IT KEEPS TO IT',
    async ({ page }) => {
      const r = await open(page, { block: 10, strays: 6, size: 160 });
      expect(r.gridBlock, 'the measurement found the 10px grid').toBe(10);
      const s = await shown(page);
      expect(s.note).toContain('Drawn at 10px');
      /* 6 blocks of 256 are broken, so 97.7% are one colour - a number that
         says "on the grid, with edits" rather than "off the grid". */
      expect(s.note).toMatch(/9[0-9]\.\d% of 10px blocks are one colour/);
      expect(s.chosen, 'and the size it is drawn at is what is selected').toBe('10');
    });

  test('AND WHAT THE REPAIR WOULD COST, BEFORE IT HAPPENS', async ({ page }) => {
    /* A repair that reports only afterwards is one you agree to blind. */
    await open(page, { block: 10, strays: 6, size: 160 });
    const s = await shown(page);
    expect(s.note).toContain('Tidy would change 6 pixels in 6 blocks');
  });

  test('and tidying flattens exactly those blocks and nothing else',
    async ({ page }) => {
      const r = await open(page, { block: 10, strays: 4, size: 160 });
      const [sx, sy] = r.strayAt[0];
      expect(await colourAt(page, sx, sy), 'the stray is there to begin with')
        .toEqual([232, 232, 232, 255]);
      /* Its neighbour is the colour the block mostly is. */
      const was = await colourAt(page, sx + 2, sy + 2);
      const said = await page.evaluate(async () => {
        const out = []; const real = window.toast;
        window.toast = m => out.push(String(m));
        document.getElementById('blktidy').click();
        await new Promise(r => setTimeout(r, 400));
        window.toast = real;
        return out.join(' | ');
      });
      expect(said).toContain('Tidied 4 blocks to the 10px grid: 4 pixels changed');
      expect(await colourAt(page, sx, sy), 'the stray took the block colour')
        .toEqual(was);
      expect((await shown(page)).canvas, 'and the canvas did not move')
        .toBe('160x160');
      expect((await shown(page)).note, 'nothing left to tidy')
        .toContain('nothing to tidy');
    });

  test('ONE PRESS OF UNDO PUTS THE STRAYS BACK', async ({ page }) => {
    /* THE ONE THAT MATTERS MOST. This rewrites pixels across the whole canvas
       in one go; if it did not snapshot first, a wrong press would be
       unrecoverable. */
    const r = await open(page, { block: 10, strays: 4, size: 160 });
    const [sx, sy] = r.strayAt[0];
    await page.evaluate(() => document.getElementById('blktidy').click());
    await page.waitForTimeout(350);
    expect(await colourAt(page, sx, sy)).not.toEqual([232, 232, 232, 255]);
    await page.click('#undo');
    await page.waitForTimeout(350);
    expect(await colourAt(page, sx, sy), 'back, in one press')
      .toEqual([232, 232, 232, 255]);
  });

  test('and a tidy with nothing to do does not land in the history',
    async ({ page }) => {
      /* An undo step that undoes nothing is a press of undo that appears to
         do nothing, which is how somebody concludes undo is broken. */
      await open(page, { block: 10, strays: 0, size: 160 });
      const depth = () => page.evaluate(() => undoStack.length);
      const was = await depth();
      const said = await page.evaluate(async () => {
        const out = []; const real = window.toast;
        window.toast = m => out.push(String(m));
        document.getElementById('blktidy').click();
        await new Promise(r => setTimeout(r, 300));
        window.toast = real;
        return out.join(' | ');
      });
      expect(said).toContain('already one colour');
      expect(await depth(), 'the history is where it was').toBe(was);
    });

  test('4 AND 8 ARE OFFERED, AND SAY SO WHEN THEY DO NOT FIT THE ART',
    async ({ page }) => {
      /* The ask was 4 and 8. The art is 10. Both are offered, and choosing one
         explains itself before it is pressed rather than after. */
      await open(page, { block: 10, strays: 6, size: 160 });
      const s = await shown(page);
      expect(s.sizes.some(t => t.startsWith('4px'))).toBe(true);
      expect(s.sizes.some(t => t.startsWith('8px'))).toBe(true);
      expect(s.sizes.some(t => t === '10px (this art)'), 'and the art\'s own is named')
        .toBe(true);
      await setSelect(page, 'blksize', '8');
      await page.waitForTimeout(250);
      const after = await shown(page);
      expect(after.why, 'it says 8 does not divide 10')
        .toContain('does not divide the 10px this art is drawn at');
      expect(after.note, 'and still gives the honest cost').toContain('Tidy would change');
    });

  test('and a FINER size says nothing of the sort', async ({ page }) => {
    /* The control. Without it, "always warn" passes the test above while
       warning about 5, which is a perfectly clean half of 10: a finer grid
       holds 10px art exactly, so the tidy can only take strays out. */
    await open(page, { block: 10, strays: 6, size: 160 });
    await setSelect(page, 'blksize', '5');
    await page.waitForTimeout(250);
    expect((await shown(page)).why, 'five halves ten').toBe('');
  });

  test('A COARSER SIZE IS WARNED ABOUT TOO, WHICH SILENCE USED TO READ AS FINE',
    async ({ page }) => {
      /* FOUND BY OPENING A REAL TRAIT INSTEAD OF A FIXTURE. Exit Liquidity
         Blue Hoodie is drawn at 5px; choosing 10 warned about nothing and
         offered to change 38,739 pixels. 10 divides evenly into 5px art, so
         the "neither divides the other" test had nothing to say - but merging
         four cells into one is not a tidy, it is throwing detail away. */
      await open(page, { block: 5, strays: 6, size: 160 });
      await setSelect(page, 'blksize', '10');
      await page.waitForTimeout(250);
      const s = await shown(page);
      expect(s.why).toContain('is coarser than the 5px this art is drawn at');
      expect(s.why, 'and says how much it merges').toContain('merges 4 cells into one');
    });

  test('art with no grid at all is called that, not given a made-up one',
    async ({ page }) => {
      /* 42 of the 317 are like this - mostly backgrounds. Telling somebody
         their photograph is drawn at 10px would send them to tidy it. */
      await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        gateShow(false);
        const w = 160, h = 160;
        const d = new Uint8ClampedArray(w * h * 4);
        /* A smooth grey ramp: no repeat for a period to find. */
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, v = 30 + Math.round((x + y) * 0.6);
          d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
        }
        fileName = 'ramp';
        startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
        await new Promise(r => setTimeout(r, 200));
        adoptBlock(measuredBlock(d, w, h));
        await new Promise(r => setTimeout(r, 120));
      });
      expect((await shown(page)).note).toContain('one pixel per pixel');
    });
});
