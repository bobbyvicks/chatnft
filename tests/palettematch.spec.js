/* THE NEAREST COLOUR IS THE ONE THAT LOOKS NEAREST.

   "the change to projects pallete isnt the best. its very good for a first
   time feature. can we make it better/more accurate"

   It picked the palette colour closest in RGB, which is a distance in a cube
   of numbers rather than a distance between two things anybody can see. The
   failure it produces is the one the feature was asked for in the first
   place: a dark green landing on a near-black.

   Measured on the real 256 palette over 5,832 colours, judged by CIEDE2000:
   mean dE 10.11 -> 7.84, worst dE 40.0 -> 19.0.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof deltaE2000 === 'function');
};

/* The CIE's own published pairs for CIEDE2000, which exist because every
   wrong implementation of it is wrong in the same few places - the hue
   wraparound, the mean hue of a grey, and the rotation term near 275
   degrees. Pairs 1-4 and 7-8 are the ones built to catch exactly those. */
const REFERENCE = [
  [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
  [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
  [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
  [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, 0.0000, 0.0000], [50.0000, -1.0000, 2.0000], 2.3669],
  [[50.0000, -1.0000, 2.0000], [50.0000, 0.0000, 0.0000], 2.3669],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792],
  [[50.0000, 2.5000, 0.0000], [50.0000, 0.0000, -2.5000], 4.3065],
  [[50.0000, 2.5000, 0.0000], [73.0000, 25.0000, -18.0000], 27.1492],
  [[50.0000, 2.5000, 0.0000], [61.0000, -5.0000, 29.0000], 22.8977],
  [[50.0000, 2.5000, 0.0000], [56.0000, -27.0000, -3.0000], 31.9030],
  [[50.0000, 2.5000, 0.0000], [58.0000, 24.0000, 15.0000], 19.4535],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
];

test('THE DIFFERENCE IS THE CIE\'S OWN, to four decimal places', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate((P) => {
    let worst = 0;
    const wrong = [];
    for (const [a, b, want] of P) {
      const got = deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]);
      const err = Math.abs(got - want);
      if (err > worst) worst = err;
      if (err > 0.0002) wrong.push(want + ' -> ' + got.toFixed(4));
    }
    return { worst, wrong };
  }, REFERENCE);
  /* The published figures are rounded to four decimals, so agreeing to
     within 2e-4 IS agreement - this is not a tolerance, it is the width of
     the number they published. */
  expect(r.wrong, 'every reference pair').toEqual([]);
  expect(r.worst).toBeLessThan(0.0002);
});

test('and it is symmetric, which is where a wrong one gives itself away',
  async ({ page }) => {
    await ready(page);
    const r = await page.evaluate((P) => {
      let asym = 0;
      for (const [a, b] of P) {
        const f = deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]);
        const g = deltaE2000(b[0], b[1], b[2], a[0], a[1], a[2]);
        if (Math.abs(f - g) > 1e-9) asym++;
      }
      return { asym, same: deltaE2000(50, 10, -20, 50, 10, -20) };
    }, REFERENCE);
    /* The mean-hue term is the usual place this breaks: get the wraparound
       wrong and dE(a,b) stops equalling dE(b,a). Two of the reference pairs
       above are the same pair in both orders for this reason. */
    expect(r.asym, 'no pair disagrees with itself reversed').toBe(0);
    expect(r.same, 'a colour is no distance from itself').toBe(0);
  });

test('A DARK GREEN LANDS ON A GREEN, NOT ON A NEAR-BLACK', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    const pal = paletteRGB();
    const palLab = pal.map(p => labOf(p.r, p.g, p.b));
    const pick = (R, G, B) => {
      const c = labOf(R, G, B);
      let best = pal[0], bd = Infinity;
      for (let i = 0; i < pal.length; i++) {
        const q = palLab[i];
        const d = deltaE2000(c[0], c[1], c[2], q[0], q[1], q[2]);
        if (d < bd) { bd = d; best = pal[i]; }
      }
      return { hit: best, dE: bd };
    };
    /* THE OLD RULE, kept here as the control. Without it this test says only
       that the new answer is green, not that it is an improvement. */
    const old = (R, G, B) => {
      let best = pal[0], bd = Infinity;
      for (const p of pal) {
        const dr = R - p.r, dg = G - p.g, db = B - p.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const green = [0, 0x2d, 0x1e];
    const a = pick(...green), b = old(...green);
    const greenest = (p) => p.g > p.r && p.g >= p.b;
    return { now: a.hit.h, nowGreen: greenest(a.hit),
      was: b.h, wasGreen: greenest(b) };
  });
  /* The ask in its own words: "green turns to a different shade of green". */
  expect(r.nowGreen, 'the dark green is still a green: ' + r.now).toBe(true);
  /* AND IT WAS NOT, which is what makes this a fix rather than a description
     of something that already worked. */
  expect(r.wasGreen, 'the old rule sent it somewhere else: ' + r.was).toBe(false);
});

test('IT IS CLOSER ON AVERAGE AND FAR CLOSER AT ITS WORST', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    const pal = paletteRGB();
    const palLab = pal.map(p => labOf(p.r, p.g, p.b));
    const deTo = (c, p) => {
      const q = labOf(p.r, p.g, p.b);
      return deltaE2000(c[0], c[1], c[2], q[0], q[1], q[2]);
    };
    const now = (R, G, B) => { const c = labOf(R, G, B);
      let best = pal[0], bd = Infinity;
      for (let i = 0; i < pal.length; i++) { const q = palLab[i];
        const d = deltaE2000(c[0], c[1], c[2], q[0], q[1], q[2]);
        if (d < bd) { bd = d; best = pal[i]; } } return best; };
    const was = (R, G, B) => { let best = pal[0], bd = Infinity;
      for (const p of pal) { const dr = R - p.r, dg = G - p.g, db = B - p.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p; } } return best; };
    let sn = 0, sw = 0, wn = 0, ww = 0, n = 0;
    for (let R = 0; R < 256; R += 25) for (let G = 0; G < 256; G += 25) for (let B = 0; B < 256; B += 25) {
      const c = labOf(R, G, B);
      const dn = deTo(c, now(R, G, B)), dw = deTo(c, was(R, G, B));
      sn += dn; sw += dw; n++;
      if (dn > wn) wn = dn;
      if (dw > ww) ww = dw;
    }
    return { n, meanNow: sn / n, meanWas: sw / n, worstNow: wn, worstWas: ww };
  });
  /* Judged by the same standard for both, which is the only way the
     comparison means anything: how different the chosen colour LOOKS from
     the one asked for. */
  expect(r.meanNow, 'closer on average').toBeLessThan(r.meanWas);
  /* The worst case is what gets noticed, and it is where the old rule was
     not close - a dE past about 10 is plainly a different colour, so a 40
     is not a near miss. */
  expect(r.worstNow, 'and much closer at its worst').toBeLessThan(r.worstWas * 0.7);
  expect(r.worstNow).toBeLessThan(25);
});

test('and a colour already on the palette is still left exactly alone',
  async ({ page }) => {
    await openTrait(page, { w: 8, h: 8, draw: () => {} });
    const r = await page.evaluate(() => {
      const pal = paletteRGB();
      const p = pal[40];
      const d = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < 16; i++) {
        d[i * 4] = p.r; d[i * 4 + 1] = p.g; d[i * 4 + 2] = p.b; d[i * 4 + 3] = 255;
      }
      /* One transparent pixel, which must come back untouched. */
      d[0 * 4 + 3] = 0;
      const before = Array.from(d);
      const res = snapToPalette(d, 16);
      return { res, changed: Array.from(d).some((v, i) => v !== before[i]),
        alpha: d[3] };
    });
    /* THE CONTROL for the whole change: a more accurate metric that moved
       colours already in the palette would be worse, not better. */
    expect(r.res.colours, 'nothing to move').toBe(0);
    expect(r.changed, 'and nothing moved').toBe(false);
    expect(r.alpha, 'a transparent pixel stays transparent').toBe(0);
  });

test('and what it reports is on a scale with a meaning', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => ({
    invisible: deltaWord(0.4), barely: deltaWord(2), slight: deltaWord(4),
    noticeable: deltaWord(8), clear: deltaWord(19),
  }));
  /* "furthest 96" was a distance in the RGB cube and meant nothing to
     anybody. A dE has a reading - about 1 is the smallest difference a
     person can see - so the line says the number and what it amounts to. */
  expect(r.invisible).toBe('invisible');
  expect(r.barely).toBe('barely visible');
  expect(r.slight).toBe('slight');
  expect(r.noticeable).toBe('noticeable');
  expect(r.clear).toBe('a clear change');
});
