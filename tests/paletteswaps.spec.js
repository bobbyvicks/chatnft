/* THE PALETTE SWAPPED 20 NEAR-COPIES FOR 20 COLOURS THE COLLECTION DRAWS (patch615).

   The owner: the palette had no bright green, cyan or pure red, growing it to
   259 was "a bad number", and then "20 swaps". Measured over the 232 saved
   traits at size 8, 39.7% of painted cells sat more than 8 dE from every
   palette colour; after the swap 15.1%. Each removed colour was one of a
   pair under 2.3 dE apart (the page's "same shade") and keeps a colour that
   close in the new palette.

     (patch617 swapped 8 more - SWAPS_617 below - under the same rules.)
     (patch621 swapped 4 more - SWAPS_621 below - crimson, two violets and hot pink;
       THEIR removed colours keep one within 3.0 dE, the owner's limit for them.)
     TEST 1 what the palette is: 256 distinct colours, the 20 added in, the
       20 removed out, and PALETTE_SOURCE saying so - its hash made the way
       Edition 03's was (sha256 of the upper-case list joined by ","), so the
       record cannot describe a palette the page does not have.
     TEST 2 the three the owner named keep their colour through the palette
       step: green, cyan and red land on themselves.
     TEST 3 every removed colour lands under 2.3 dE from where it was.
     TEST 4 none of the original Resurrect 64 (the first 64 colours) and none
       of the brand's colours was removed. */
import { test, expect } from '@playwright/test';

const SWAPS = [
  ['#7f2b2a', '#009f20'], ['#98322e', '#00e3f4'], ['#aa3630', '#ff0000'], ['#ed5b3b', '#1c27a3'],
  ['#d23239', '#5b5b5c'], ['#a4493a', '#1a4c07'], ['#196752', '#613105'], ['#3e5a51', '#050c30'],
  ['#18bba2', '#8c8b8a'], ['#68edcd', '#2536f6'], ['#3d3e65', '#401402'], ['#3e273a', '#c4c2c2'],
  ['#b089f3', '#954209'], ['#a84e71', '#537521'], ['#b35575', '#f9e7c4'], ['#b85877', '#c4a503'],
  ['#c45e7b', '#121061'], ['#c9627d', '#604438'], ['#d66c85', '#9a8201'], ['#e57992', '#0e6491'],
];

/* patch617: 8 more, under the same rules (every removed colour keeps one under 2.3 dE). */
const SWAPS_617 = [
  ['#762928', '#0d204a'], ['#90302c', '#4c2a18'], ['#ed4936', '#845500'], ['#1c7458', '#036902'],
  ['#21c8aa', '#aeaeae'], ['#7df2d8', '#dbdbdb'], ['#37395c', '#161616'], ['#55a2e9', '#ecc900'],
];

/* patch621: crimson, a dark violet, a bright violet and hot pink - what the collection draws most
   that no palette colour came near (audit classes K1 / K2). To make room the owner widened the
   twin limit for THESE removals only (2026-10-01): "Yes, allow up to 3", and then "Yes, add the
   bright violet". The four removed are near-copies - a dark plum, a dusky plum, a mauve, a coral
   pink - each with a kept colour under 3.0 dE; one of them, #4a2d3d, is drawn by New York Twin Towers
   Skyline and lands 2.3 dE away on #4c2938. */
const SWAPS_621 = [
  ['#3c2d3b', '#5f0084'], ['#4a2d3d', '#b60020'], ['#974768', '#6f01d5'], ['#f36a7d', '#fd66ad'],
];

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function' && typeof paletteList === 'function');
};

test.describe('the palette swap', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('256 distinct colours, the 32 added in, the 32 removed out, and the record says so', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const list = paletteList().map(h => h.toLowerCase());
      const bytes = new TextEncoder().encode(list.map(h => h.toUpperCase()).join(','));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      return { list, distinct: new Set(list).size, hash, source: PALETTE_SOURCE };
    });
    expect(r.list.length).toBe(256);
    expect(r.distinct, 'no colour twice').toBe(256);
    for (const [out, inn] of SWAPS.concat(SWAPS_617, SWAPS_621)) {
      expect(r.list, inn + ' is in').toContain(inn);
      expect(r.list, out + ' is out').not.toContain(out);
    }
    expect(r.source.edition).toBe('Edition 03, 32 colours swapped');
    expect(r.source.swapped).toEqual(SWAPS.concat(SWAPS_617, SWAPS_621).map(s => s.join('>')));
    expect(r.source.colours, 'the hash is of these colours').toBe(r.hash);
  });

  test('the green, cyan and red the owner named keep their colour', async ({ page }) => {
    const r = await page.evaluate(() => ['#009f20', '#00e3f4', '#ff0000'].map(h => {
      const n = 64, d = new Uint8ClampedArray(n * 4), k = parseInt(h.slice(1), 16);
      for (let i = 0; i < n; i++) { d[i * 4] = (k >> 16) & 255; d[i * 4 + 1] = (k >> 8) & 255; d[i * 4 + 2] = k & 255; d[i * 4 + 3] = 255; }
      const rep = snapToPalette(d, n);
      return { h, out: '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''), moved: rep.colours };
    }));
    for (const x of r) {
      expect(x.out, x.h + ' lands on itself').toBe(x.h);
      expect(x.moved, 'and nothing moved').toBe(0);
    }
  });

  /* The twin rule, checked on the FINAL palette (a removal can take away another removed colour's twin -
     round 3 did that). The 28 removed by patch615 / patch617 keep a colour under 2.3 dE; the 4 removed by
     patch621 keep one under 3.0 dE - the owner, asked about crimson, violet and hot pink: "Yes, allow up to 3"
     (2026-10-01), and for the bright violet: "Yes, add the bright violet". Neither limit may creep: the 3.0 is
     for those four colours and the test names them. */
  const nearestOf = (page, removed) => page.evaluate((removed) => removed.map(h => {
    const k = parseInt(h.slice(1), 16), n = nearestPaletteColour((k >> 16) & 255, (k >> 8) & 255, k & 255);
    return { h, to: n.hex, dE: n.dE };
  }), removed);

  test('every colour removed by patch615 / patch617 lands under 2.3 dE from where it was', async ({ page }) => {
    const r = await nearestOf(page, SWAPS.concat(SWAPS_617).map(s => s[0]));
    expect(r.length).toBe(28);
    for (const x of r) expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(2.3);
  });

  test('the four removed by patch621 land under 3.0 dE from where they were (the owner: "Yes, allow up to 3")', async ({ page }) => {
    const r = await nearestOf(page, SWAPS_621.map(s => s[0]));
    expect(r.length).toBe(4);
    for (const x of r) expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(3.0);
    /* and the limit was needed: none of the four has a colour under 2.3 (else 2.3 would have done) */
    for (const x of r) expect(x.dE, x.h + ' needed the 3.0 limit').toBeGreaterThanOrEqual(2.3);
  });

  test('the original Resurrect 64 and the brand colours are all still there', async ({ page }) => {
    const r = await page.evaluate(() => paletteList().map(h => h.toLowerCase()));
    /* Edition 03's first 64 colours, in order, and the library's brandCore + brandAccents */
    const FIRST_64 = '2e222f3e3546625565966c6cab947a694f627f708a9babb2c7dcd0ffffff6e2727b33831ea4f36f57d4aae2334e83b3b'
      + 'fb6b1df79617f9c22b7a30459e4539cd683de6904efbb9544c3e24676633a2a947d5e04bfbff86165a4c2390631ebc73'
      + '91db69cddf6c313638374e4a547e6492a984b2ba900b5e650b8a8f0eaf9b30e1b98ff8e2323353484a774d65b44d9be6'
      + '8fd3ff45293f6b3e75905ea9a884f3eaaded753c54a24b6fcf657fed8099831c5dc32454f04f78f68181fca790fdcbb0';
    for (let i = 0; i < 64; i++) expect(r[i], 'original ' + (i + 1) + ' in its slot').toBe('#' + FIRST_64.slice(i * 6, i * 6 + 6));
    for (const h of ['#000000', '#ffffff', '#3e3546', '#c7dcd0', '#fdcbb0', '#b33831', '#484a77', '#239063', '#f9c22b', '#6b3e75'])
      expect(r, 'brand colour ' + h).toContain(h);
  });
});
