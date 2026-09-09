/* Making a trait bigger, at every multiple that fits.

   Two things were in the way and only one of them was the list.

   The Jump-to menu offered nine hand-picked multiples of the cell grid -
   1, 2, 3, 4, 6, 8, 10, 12, 16 - so 5x, 7x, 9x, 11x, 13x, 14x and 15x were
   not there at all, while the ceiling allows 25 of them on a 160 cell grid.

   AND THE THING NOBODY SAID, WHICH MATTERS MORE. Enlarging stays crisp only
   at a whole multiple of the canvas you are enlarging FROM. 1280 to 2560
   duplicates every pixel exactly twice; 1280 to 1600 is 1.25x, and nearest
   neighbour doubles some rows and not others - a one-pixel line becomes one
   pixel in places and two in others. The resampler is right, that is what
   nearest neighbour is. The panel said nothing, and the difference between
   those two presses is the difference between a trait you can still work on
   and one you cannot.

   THE PAIR AT THE END IS THE POINT: a whole multiple must read as exact and
   a fractional one must not, and a version that called everything exact would
   pass the first test alone.
*/
import { test, expect } from '@playwright/test';
import { setField, setSelect } from './helpers.js';

/* Opens a square trait of the given size in a 160-cell project. Grey, so the
   open path does not read it as a base render and clean it away. */
const open = (page, size) => page.evaluate(async (S) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  projectGrid = 160;
  $('rsgrid').value = '160';
  const d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const v = 60 + ((x / 10 | 0) + (y / 10 | 0)) % 3 * 40;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  fileName = 'grow';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(r => setTimeout(r, 250));
  resizeBoxes();
  await new Promise(r => setTimeout(r, 80));
  return { presets: [...$('rspreset').options].map(o => o.value).filter(Boolean) };
}, size);

const note = (page) => page.evaluate(() =>
  document.getElementById('rsnow').textContent);

test.describe('making a trait bigger', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof growNote === 'function');
  });

  test('EVERY WHOLE MULTIPLE THAT FITS IS OFFERED, not nine of them',
    async ({ page }) => {
      const r = await open(page, 320);
      const up = r.presets.map(Number).filter(v => v % 160 === 0 && v >= 160);
      const ks = up.map(v => v / 160).sort((a, b) => a - b);
      /* The seven the old list simply did not have. */
      for (const k of [5, 7, 9, 11, 13, 14, 15])
        expect(ks, k + 'x was missing before').toContain(k);
      expect(Math.max(...ks), 'up to the ceiling, which is 4096')
        .toBe(Math.floor(4096 / 160));
      expect(up.every(v => v <= 4096), 'and nothing past it').toBe(true);
    });

  test('A WHOLE MULTIPLE SAYS SO, AND WHAT IT DOES TO EACH PIXEL',
    async ({ page }) => {
      /* 640 from 320 is exactly 2x: every pixel becomes 2x2 and the artwork is
         untouched. That is the press somebody wants. */
      await open(page, 320);
      await setSelect(page, 'rsmode', 'art');
      await setField(page, 'rsw', 640);
      await setField(page, 'rsh', 640);
      await page.waitForTimeout(150);
      const n = await note(page);
      expect(n).toContain('×2 exactly');
      expect(n, 'and what that means for a pixel').toContain('every pixel becomes 2×2');
    });

  test('AND A FRACTIONAL ONE SAYS THAT INSTEAD, WITH A WAY OUT',
    async ({ page }) => {
      /* THE OTHER HALF. 800 from 320 is 2.5x - nearest neighbour doubles some
         rows and triples others, and nothing about pressing it looked
         different from the 2x above. */
      await open(page, 320);
      await setSelect(page, 'rsmode', 'art');
      await page.evaluate(() => {
        if ($('rssnap').getAttribute('aria-pressed') === 'true') $('rssnap').click();
      });
      await setField(page, 'rsw', 800);
      await setField(page, 'rsh', 800);
      await page.waitForTimeout(150);
      const n = await note(page);
      expect(n).toContain('uneven');
      expect(n, 'the ratio it really is').toContain('×2.5');
      expect(n, 'and the sizes either side that are not')
        .toContain('whole multiples near it');
      expect(n, 'named, so it is help rather than a complaint').toContain('640');
      expect(n).toContain('960');
    });

  test('and shrinking is left alone, because it cannot duplicate anything',
    async ({ page }) => {
      /* The note is about what enlarging does to a pixel. Shrinking has its
         own trade-offs and they are somebody else's message. */
      await open(page, 640);
      await setSelect(page, 'rsmode', 'art');
      await page.evaluate(() => {
        if ($('rssnap').getAttribute('aria-pressed') === 'true') $('rssnap').click();
      });
      await setField(page, 'rsw', 320);
      await setField(page, 'rsh', 320);
      await page.waitForTimeout(150);
      const n = await note(page);
      expect(n).not.toContain('exactly');
      expect(n).not.toContain('uneven');
    });

  test('AND THE PIXELS BACK IT UP: a whole multiple really is every pixel doubled',
    async ({ page }) => {
      /* The note is a claim about the artwork, so the artwork is checked. A
         2x nearest-neighbour enlargement makes every source pixel a 2x2 block,
         which means the four pixels of each block are identical. */
      await open(page, 160);
      await setSelect(page, 'rsmode', 'art');
      await setField(page, 'rsw', 320);
      await setField(page, 'rsh', 320);
      await page.waitForTimeout(120);
      /* Through the element: the panel is folded like every section in that
         column, and a folded control is not clickable. */
      await page.evaluate(() => document.getElementById('rsgo').click());
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const d = ctx.getImageData(0, 0, art.width, art.height).data;
        const at = (x, y) => { const i = (y * art.width + x) * 4;
          return d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]; };
        let broken = 0;
        for (let y = 0; y < art.height; y += 2) for (let x = 0; x < art.width; x += 2) {
          const a = at(x, y);
          if (at(x + 1, y) !== a || at(x, y + 1) !== a || at(x + 1, y + 1) !== a) broken++;
        }
        return { size: art.width + 'x' + art.height, broken };
      });
      expect(r.size).toBe('320x320');
      expect(r.broken, 'every 2x2 block is one colour, so nothing was interpolated')
        .toBe(0);
    });
});
