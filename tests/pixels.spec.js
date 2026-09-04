/* Traits of different sizes on one canvas, without wrecking the art.

   Traits are painted onto a canvas sized to the largest of them, and a smaller
   one used to be stretched to fill it. 160/48 is 3.333, so nearest-neighbour
   has to make some source pixels 3 screen pixels wide and some 4. Measured on
   a 48x48 source striped every 2px:

     stretched to 160    stripe widths 3 and 4    <- uneven
     3x and centred      stripe widths 3          <- uniform
     stretched to 96     stripe widths 2          <- already exact, unchanged

   Uneven pixel widths are the one thing pixel art cannot survive, which is the
   same reason the editor zooms in whole steps.

   The tests measure PIXELS rather than checking the function was called. A
   scale of the wrong size, an off-by-one in the centring, or smoothing left on
   would each pass an assertion about the call and show up in the stripes.
*/
import { test, expect } from '@playwright/test';

/* A square striped one pixel on, one off - the pattern that makes an uneven
   scale visible as two different run lengths in one row. */
const striped = async (page, size) => page.evaluate(async (n) => {
  const src = document.createElement('canvas'); src.width = n; src.height = n;
  const g = src.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#000';
  for (let x = 0; x < n; x += 2) g.fillRect(x, 0, 1, n);
  window.__probe = await createImageBitmap(src);
  return true;
}, size);

/* Paints through the app's own helper and reports the run lengths of black
   along the middle row, plus where the art starts and ends. */
const paint = (page, boxW, boxH) => page.evaluate(([W, H]) => {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  paintTrait(g, window.__probe, 0, 0, W, H);
  const d = g.getImageData(0, Math.floor(H / 2), W, 1).data;
  const runs = []; let cur = null, n = 0, first = -1, last = -1;
  for (let x = 0; x < W; x++) {
    const black = d[x * 4] < 128;
    if (black) { if (first < 0) first = x; last = x; }
    if (black === cur) n++; else { if (cur === true) runs.push(n); cur = black; n = 1; }
  }
  if (cur === true) runs.push(n);
  return { widths: [...new Set(runs)].sort((a, b) => a - b), count: runs.length, first, last };
}, [boxW, boxH]);

test.describe('traits of different sizes on one canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(600);
  });

  test('a fractional ratio is scaled by a whole number, so every pixel is equal', async ({ page }) => {
    await striped(page, 48);
    const r = await paint(page, 160, 160);
    expect(r.widths, 'one width, not two').toEqual([3]);
    expect(r.count, 'and all 24 stripes are still there').toBe(24);
  });

  test('and it is centred, with the margin on both sides', async ({ page }) => {
    // 48 at 3x is 144 in a 160 box, so 8 either side. Checked because a scale
    // that is right and an origin that is not still puts the art in the wrong
    // place, and the stripe widths alone would not notice.
    await striped(page, 48);
    const r = await paint(page, 160, 160);
    expect(r.first, 'the art starts 8px in').toBe(8);
    // Derived, not guessed at: the source is 48 wide with a black column every
    // second pixel, so the LAST black column is 46. At 3x from an origin of 8
    // that is 8 + 46*3 = 146, three wide, ending at 148. The first version of
    // this line reasoned backwards from the right-hand margin and expected 149.
    expect(r.last, 'the last stripe ends where the arithmetic says').toBe(8 + 46 * 3 + 3 - 1);
  });

  test('a ratio that was already whole is left exactly as it was', async ({ page }) => {
    // The control, and the reason this change is safe to apply everywhere: at
    // 2x, stretching was already correct, and this must not have altered it.
    await striped(page, 48);
    const r = await paint(page, 96, 96);
    expect(r.widths).toEqual([2]);
    expect(r.count).toBe(24);
    expect(r.first, 'filling the box exactly leaves no margin').toBe(0);
  });

  test('a trait already at full size is not touched', async ({ page }) => {
    await striped(page, 160);
    const r = await paint(page, 160, 160);
    expect(r.widths, 'one source pixel to one canvas pixel').toEqual([1]);
    expect(r.count).toBe(80);
    expect(r.first).toBe(0);
  });

  test('a trait bigger than the box is drawn, not scaled to nothing', async ({ page }) => {
    // Math.floor of a ratio below one is zero, and a zero scale is an invisible
    // trait - the failure would be a blank character with nothing to explain it.
    await striped(page, 200);
    const r = await paint(page, 160, 160);
    expect(r.count, 'something was drawn').toBeGreaterThan(0);
    expect(r.widths, 'at native size').toEqual([1]);
  });

  test('the tighter side decides, so nothing overflows the box', async ({ page }) => {
    // A tall source in a square box: scaling to fit the width would run off the
    // bottom. Measured by painting a 40x80 source into 160x160 - the height
    // allows 2x, the width would allow 4.
    await page.evaluate(async () => {
      const src = document.createElement('canvas'); src.width = 40; src.height = 80;
      const g = src.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 40, 80);
      g.fillStyle = '#000';
      for (let x = 0; x < 40; x += 2) g.fillRect(x, 0, 1, 80);
      window.__probe = await createImageBitmap(src);
    });
    const r = await paint(page, 160, 160);
    expect(r.widths, 'the height decided: 2x, not 4x').toEqual([2]);
    // 40 at 2x is 80 wide in a 160 box, so 40 either side.
    expect(r.first, 'centred on the wider axis too').toBe(40);
  });
});
