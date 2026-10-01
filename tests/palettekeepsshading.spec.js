/* "COLOURS TO PALETTE" KEEPS DRAWN SHADES APART (patch617).

   The owner, on patch615's swap: "the shading on the gate is bad". Two drawn
   shades landed on one palette colour - GATE Hoodie's fold onto its fabric,
   Water Skin's four teals onto one cyan. snapToPalette now gives such shades
   colours again, together, within guards (hue, lightness, light/dark order
   where colours touch, no pure white or black unless drawn so); with
   {shades:false} it is the step as it was, which each test uses as its
   precondition: the merge is really there to be undone.

     TEST 1 GATE's three navies: fabric, shadow and fold. Without the rule the
       fold lands on the fabric's colour; with it, three colours, in the drawn
       light/dark order.
     TEST 2 Water Skin's four teals: without the rule one colour; with it at
       least three, lightness never reversed.
     TEST 3 a picture with no merged shades comes out exactly as without the
       rule - it is not touched.
     TEST 4 the fixer's worker runs it: GATE's navies through Fix pixels keep
       three colours. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function' && typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

const GATE = [['#0e214b', 20], ['#031133', 10], ['#1a3262', 10]];   // fabric, shadow, fold
const WATER = [['#32b2cb', 10], ['#55d4dd', 10], ['#69e5e7', 10], ['#86f6f7', 10]];
const APART = [['#66402d', 20], ['#2a7de1', 20]];

/* vertical bands of the given colours and widths, 40 x 20, through snapToPalette with the row width */
const bands = (page, list, opts) => page.evaluate(({ list, opts }) => {
  const W = 40, H = 20, d = new Uint8ClampedArray(W * H * 4), at = [];
  let x0 = 0;
  for (const [h, w] of list) {
    const k = parseInt(h.slice(1), 16);
    for (let y = 0; y < H; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 4; d[o] = k >> 16; d[o + 1] = (k >> 8) & 255; d[o + 2] = k & 255; d[o + 3] = 255; }
    at.push(x0); x0 += w;
  }
  const before = Array.from(d);
  const rep = snapToPalette(d, W * H, W, opts || undefined);
  const out = at.map(x => '#' + [d[x * 4], d[x * 4 + 1], d[x * 4 + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  const L = h => { const k = parseInt(h.slice(1), 16); return labOf(k >> 16, (k >> 8) & 255, k & 255)[0]; };
  return { out, L: out.map(L), srcL: list.map(([h]) => L(h)), merged: rep.merged, bytes: Array.from(d).join(), before: before.join() };
}, { list, opts });

test.describe('the palette keeps drawn shades apart', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('GATE\'s navies: the fold no longer lands on the fabric, and the order is kept', async ({ page }) => {
    const off = await bands(page, GATE, { shades: false }), on = await bands(page, GATE);
    expect(off.out[2], 'THE PRECONDITION: without the rule the fold takes the fabric\'s colour').toBe(off.out[0]);
    expect(off.merged).toBeGreaterThanOrEqual(1);
    expect(new Set(on.out).size, 'with it, three colours').toBe(3);
    expect(on.L[1], 'the shadow stays darker than the fabric').toBeLessThan(on.L[0]);
    expect(on.L[2], 'and the fold lighter').toBeGreaterThan(on.L[0]);
  });

  test('Water Skin\'s four teals come out as more than one colour, never reversed', async ({ page }) => {
    const off = await bands(page, WATER, { shades: false }), on = await bands(page, WATER);
    expect(new Set(off.out).size, 'THE PRECONDITION: without the rule, one colour').toBe(1);
    expect(new Set(on.out).size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < on.L.length; i++) expect(on.L[i], 'drawn lighter, never comes out darker').toBeGreaterThanOrEqual(on.L[i - 1]);
  });

  test('a picture with no merged shades is not touched', async ({ page }) => {
    const off = await bands(page, APART, { shades: false }), on = await bands(page, APART);
    expect(off.merged, 'nothing merged to begin with').toBe(0);
    expect(on.bytes).toBe(off.bytes);
    expect(on.bytes, 'and the palette did move it - so the comparison can differ').not.toBe(on.before);
  });

  test('the fixer\'s worker runs it: GATE\'s navies keep three colours at size 16', async ({ page }) => {
    const r = await page.evaluate(async (list) => {
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d');
      let x0 = 0; for (const [h, w] of list) { g.fillStyle = h; g.fillRect(x0 * 32, 0, w * 32, W); x0 += w; }
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixpal').checked = true;
      const f = document.getElementById('fixforce'); f.value = '16'; f.dispatchEvent(new Event('input', { bubbles: true }));
      await fixLoad(fileWithPath(new Uint8Array(await blob.arrayBuffer()), 'backgrounds/gate-navies.png'));
      const out = await fixRun();
      window.toast = realToast;
      const seen = new Set();
      for (let i = 0; i < out.data.length; i += 4) seen.add([out.data[i], out.data[i + 1], out.data[i + 2]].join());
      return { colours: seen.size };
    }, GATE);
    expect(r.colours).toBe(3);
  });
});
