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
     (patch631 swapped 9 more - SWAPS_631 below - royal blue, crimson, green, sage,
       tan, orange, two magentas and a near-black purple; the owner chose them
       2026-10-04 under the rule that EVERY removed colour keeps one within 3.0.)
     TEST 1 what the palette is: 256 distinct colours, all 41 added in, all
       41 removed out, and PALETTE_SOURCE saying so - its hash made the way
       Edition 03's was (sha256 of the upper-case list joined by ","), so the
       record cannot describe a palette the page does not have.
     TEST 2 the three the owner named keep their colour through the palette
       step: green, cyan and red land on themselves. And the nine patch631
       adds land on themselves, each in the slot of the colour it replaced.
     TEST 3 every removed colour lands near where it was: the 28 of patch615 /
       patch617 under 2.3 (but one, named), patch621's four under 3.0, and all
       of them, counted off the page's own record, under 3.0.
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

/* patch631: nine more, chosen by the owner 2026-10-04 from the measured options (all six of option A, "Two magentas,
   Orbits near-black"), in that order, each new colour in the slot of the one it replaced (the third field). The
   crimson is #7c0313, not the #7c0012 Red Bandit Turban draws: #7c0012's luma (39.1) is under the outline pass's
   JUNK_LUM (40), so a small patch of it was repainted as debris; #7c0313 is 41.0. */
const SWAPS_631 = [
  ['#f37245', '#3f78ff', 94],  ['#8b4461', '#7c0313', 227], ['#602933', '#00cb2b', 96],
  ['#f88b85', '#6cb688', 251], ['#fb9e8c', '#d1c69a', 253], ['#18614f', '#cf5c00', 146],
  ['#507861', '#d810d3', 170], ['#426054', '#f956f6', 167], ['#344241', '#14021c', 163],
];
const ALL_SWAPS = SWAPS.concat(SWAPS_617, SWAPS_621, SWAPS_631.map(s => [s[0], s[1]]));

/* The one earlier removal that patch631 takes over 2.3: #196752 (patch615) held #18614f at 2.18 dE, and patch631
   removes #18614f for the orange. Its nearest is now #1b6e55, 2.61 dE - inside the 3.0 every removal has under the
   rule the owner chose patch631 by, outside the 2.3 the other 27 still keep. Reported before the choice
   (scratchpad/fix8/swaps33/verify-report.txt 2(a): "27 of the 32 old removals are now under 2.3, not 28"). Named,
   so the 2.3 cannot widen for anything else, and pinned as needed, so it goes when it stops being true. */
const OVER_23 = { '#196752': { to: '#1b6e55', lost: '#18614f' } };

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof snapToPalette === 'function' && typeof paletteList === 'function');
};

test.describe('the palette swap', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('256 distinct colours, the 41 added in, the 41 removed out, and the record says so', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const list = paletteList().map(h => h.toLowerCase());
      const bytes = new TextEncoder().encode(list.map(h => h.toUpperCase()).join(','));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      return { list, distinct: new Set(list).size, hash, source: PALETTE_SOURCE };
    });
    expect(r.list.length).toBe(256);
    expect(r.distinct, 'no colour twice').toBe(256);
    expect(ALL_SWAPS.length).toBe(41);
    for (const [out, inn] of ALL_SWAPS) {
      expect(r.list, inn + ' is in').toContain(inn);
      expect(r.list, out + ' is out').not.toContain(out);
    }
    expect(r.source.edition).toBe('Edition 03, 41 colours swapped');
    expect(r.source.swapped).toEqual(ALL_SWAPS.map(s => s.join('>')));
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

  test('the nine patch631 adds land on themselves, each in the slot of the colour it replaced', async ({ page }) => {
    const r = await page.evaluate((adds) => {
      const list = paletteList().map(h => h.toLowerCase());
      return adds.map(([out, h, slot]) => {
        const n = 64, d = new Uint8ClampedArray(n * 4), k = parseInt(h.slice(1), 16);
        for (let i = 0; i < n; i++) { d[i * 4] = (k >> 16) & 255; d[i * 4 + 1] = (k >> 8) & 255; d[i * 4 + 2] = k & 255; d[i * 4 + 3] = 255; }
        const rep = snapToPalette(d, n);
        let same = true;
        for (let i = 0; i < n; i++) if (d[i * 4] !== d[0] || d[i * 4 + 1] !== d[1] || d[i * 4 + 2] !== d[2]) same = false;
        return { h, slot, at: list.indexOf(h), out: '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''), same, moved: rep.colours };
      });
    }, SWAPS_631);
    expect(r.length).toBe(9);
    for (const x of r) {
      expect(x.at, x.h + ' sits in slot ' + x.slot).toBe(x.slot);
      expect(x.out, x.h + ' lands on itself').toBe(x.h);
      expect(x.same, x.h + ': every pixel the same').toBe(true);
      expect(x.moved, x.h + ': nothing moved').toBe(0);
    }
  });

  /* The twin rule, checked on the FINAL palette (a removal can take away another removed colour's twin -
     round 3 did that). The 28 removed by patch615 / patch617 keep a colour under 2.3 dE; the 4 removed by
     patch621 keep one under 3.0 dE - the owner, asked about crimson, violet and hot pink: "Yes, allow up to 3"
     (2026-10-01), and for the bright violet: "Yes, add the bright violet". Neither limit may creep: the 3.0 is
     for those four colours and the test names them.
     SUPERSEDED IN PART by patch631 (2026-10-04): the owner chose its nine swaps under 3.0 for EVERY removed colour,
     old and new (scratchpad/fix8/swaps33/r2/options.txt), and the last test below checks that over the page's own
     record. The 2.3 still holds for 27 of the 28 earlier removals; the one it no longer holds for, #196752, is named
     in OVER_23 with its reason, so the 2.3 cannot creep either. */
  const nearestOf = (page, removed) => page.evaluate((removed) => removed.map(h => {
    const k = parseInt(h.slice(1), 16), n = nearestPaletteColour((k >> 16) & 255, (k >> 8) & 255, k & 255);
    return { h, to: n.hex, dE: n.dE };
  }), removed);

  /* patch631: 27 of these 28 still keep 2.3; #196752 is OVER_23's one, and the test says which and why. */
  test('every colour removed by patch615 / patch617 lands under 2.3 dE from where it was, but #196752, named', async ({ page }) => {
    const r = await nearestOf(page, SWAPS.concat(SWAPS_617).map(s => s[0]));
    expect(r.length).toBe(28);
    for (const x of r) if (!OVER_23[x.h]) expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(2.3);
    const named = r.filter(x => OVER_23[x.h]);
    expect(named.map(x => x.h)).toEqual(Object.keys(OVER_23));
    for (const x of named) {
      expect(x.to, x.h + ' lost ' + OVER_23[x.h].lost + ' and holds ' + OVER_23[x.h].to).toBe(OVER_23[x.h].to);
      expect(x.dE, x.h + ' is still over 2.3 (else drop it from OVER_23)').toBeGreaterThanOrEqual(2.3);
      expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(3.0);
    }
    const lost = await page.evaluate(() => paletteList().map(h => h.toLowerCase()));
    for (const h of Object.keys(OVER_23)) expect(lost, OVER_23[h].lost + ' (the twin ' + h + ' lost) is out').not.toContain(OVER_23[h].lost);
  });

  test('the four removed by patch621 land under 3.0 dE from where they were (the owner: "Yes, allow up to 3")', async ({ page }) => {
    const r = await nearestOf(page, SWAPS_621.map(s => s[0]));
    expect(r.length).toBe(4);
    for (const x of r) expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(3.0);
    /* and the limit was needed: none of the four has a colour under 2.3 (else 2.3 would have done) */
    for (const x of r) expect(x.dE, x.h + ' needed the 3.0 limit').toBeGreaterThanOrEqual(2.3);
  });

  /* patch631, the rule the owner chose the nine by: EVERY removed colour, old and new, keeps a colour under 3.0. The
     removed colours are read off the page's own PALETTE_SOURCE.swapped, so the count is the page's, not this file's:
     a swap recorded there and left out here (or the reverse) fails, and so does any one of them at 3.0 or over. */
  test('every removed colour the page records, all of them, lands under 3.0 dE from where it was', async ({ page }) => {
    const removed = await page.evaluate(() => PALETTE_SOURCE.swapped.map(s => s.split('>')[0]));
    expect(removed, 'the page records the removals this file knows').toEqual(ALL_SWAPS.map(s => s[0]));
    const r = await nearestOf(page, removed);
    const under = r.filter(x => x.dE < 3.0);
    for (const x of r) expect(x.dE, x.h + ' -> ' + x.to).toBeLessThan(3.0);
    expect(under.length, 'removed colours under 3.0, of the ' + removed.length + ' the page records').toBe(removed.length);
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
