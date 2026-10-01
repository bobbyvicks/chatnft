/* "COLOURS TO PALETTE" DOES NOT SEND A COLOURFUL COLOUR TO GREY (patch613).

   The owner, looking at the size-8 results: "even when using 8 its not
   good". Part of it was colour: navy #001165 went to the near-grey #2c3a44
   at 14.15 dE while the blue #323353 was 14.17, because CIEDE2000's rotation
   term, a small-difference correction for blues, cancels most of the
   distance at that range. Gazers Lunar Eyes' iris came out charcoal.

   palettePick keeps the nearest colour except in that fault: a colourful
   colour (C* >= 40), a near-grey nearest (C* under a quarter of it), an
   alternative among the near-ties that keeps more colour and that Oklab also
   calls nearer. The button (snapToPalette) and the agent panel
   (nearestPaletteColour) both go through it, so they name one colour.

     TEST 1 the precondition, then the rule, on the page's own snapToPalette:
       the plain nearest for navy IS the grey (so the rule has something to
       change), navy and royal blue now land on blues, and a grey, a colour
       whose nearest is already colourful, and a near match land exactly
       where the plain nearest puts them.
     TEST 2 the panel names what the button writes.
     TEST 3 deltaE2000 with six arguments is the CIE formula unchanged
       (Sharma's published pairs in the blue region, where the rotation term
       is large), and the seventh argument really drops that term.
     TEST 4 the fixer's worker: a flat navy picture through Fix pixels at
       size 8 comes out #323353. The worker carries its own copy of the
       palette step as text, so a helper left out of that text would break
       only here.

   ON EDITION 03, THE PALETTE THE FAULT WAS MEASURED ON. patch615 then swapped
   20 near-copies for colours the collection draws - a navy among them - and
   on the swapped palette the rule changes no colour of a 32,768-colour sweep
   (scratchpad/fix8/judge/fixtures615.cjs): navy now has a navy to go to. The
   rule stays, as the guard for a palette that loses a colour again, so these
   tests put Edition 03 back for the page (PALETTE_RGB, the cache paletteRGB
   answers from, which is also what the fixer hands its worker) and test the
   rule where it fires. The last test says what the swapped palette does. */
import { test, expect } from '@playwright/test';

/* Mrkt Mkrs 256 - Resurrect Expansion, Edition 03, as it was before patch615. */
const EDITION_03 =
  '2e222f3e3546625565966c6cab947a694f627f708a9babb2c7dcd0ffffff6e2727b33831ea4f36f57d4aae2334e83b3b'
  +'fb6b1df79617f9c22b7a30459e4539cd683de6904efbb9544c3e24676633a2a947d5e04bfbff86165a4c2390631ebc73'
  +'91db69cddf6c313638374e4a547e6492a984b2ba900b5e650b8a8f0eaf9b30e1b98ff8e2323353484a774d65b44d9be6'
  +'8fd3ff45293f6b3e75905ea9a884f3eaaded753c54a24b6fcf657fed8099831c5dc32454f04f78f68181fca790fdcbb0'
  +'0000000b070c1c131d3c2d3b4b38485045555a43557f5d67706277a180738d8d9eb3a68fbab8a4b1c3c1c1cabae3ede7'
  +'47262d5b272b7629287f2b2a872d2b90302c98322ea1342faa3630c03e32ce4334dc4935ed5b3bf06740f37245fa966e'
  +'602933862935bc2936cb2f38d23239d93539ed4936f25530f66028fa771cfa811bf88c19f8a11cf9ac22f9b726face64'
  +'4c2938632d3e8335438c3b4095403da4493aaa4e3ab5563cc15f3cd37241da7c45e0864aeb9a50f1a451f6af53fcc679'
  +'3a2d2c4336295348285a522c605c2f6e6e367576387d7e3b84873d9398429aa045afb648bbc44ac8d24ae8ef6afbffa8'
  +'2c383b26494318614f1967521b6e551c74581e7b5b20825d229b6722a66b20b16f49c47164cc6f7cd36cb1dd6bd6e58a'
  +'302a33303035333c3c3442413648453b544d3e5a514260544566574d725e50786164896c739374829e7ca2b18abfc6a4'
  +'2c3a44244c540b696f0c747a0b7f840b93920c9c950da69818bba21dc1a621c8aa29d4b151e7c368edcd7df2d8a7fae7'
  +'30293d312e4837395c3d3e6542446e4a51864b57954c5ea44e72c04f80cd4e8dd955a2e95ea9ec6eb7f37fc5f9a5dbff'
  +'3725353e273a4e2e4c5833596139677446827d4e8f87569c9667bb9c71cda27ae0b089f3b88ff2c899f1d9a3efeebcf1'
  +'4a2d3d5f344980405b8b4461974768a84e71ad5173b35575b85877be5b79c45e7bc9627dd66c85de728ce57992f398ab'
  +'50244169224f921f5ca2215ab32357ce305dd93b66e5456ff25d7af36a7df5767ff88b85f99488fb9e8cfdb9a0fed4be';
const onEdition03 = (page) => page.evaluate((hex) => {
  PALETTE_RGB = [];
  for (let i = 0; i < hex.length; i += 6) PALETTE_RGB.push({ h: '#' + hex.slice(i, i + 6),
    r: parseInt(hex.slice(i, i + 2), 16), g: parseInt(hex.slice(i + 2, i + 4), 16), b: parseInt(hex.slice(i + 4, i + 6), 16) });
  return PALETTE_RGB.length;
}, EDITION_03);

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof palettePick === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

test.describe('the palette keeps a colourful colour colourful', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); expect(await onEdition03(page), 'Edition 03 is the palette for these').toBe(256); });

  test('the plain nearest sends navy to grey; palettePick sends it to a blue and leaves the rest alone',
    async ({ page }) => {
      const r = await page.evaluate(() => {
        const pal = paletteRGB(), palLab = pal.map(p => labOf(p.r, p.g, p.b));
        const key = h => parseInt(h.slice(1), 16);
        const rgb = h => { const k = key(h); return [(k >> 16) & 255, (k >> 8) & 255, k & 255]; };
        const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        /* the plain nearest by CIEDE2000, computed here, not by the page */
        const plain = h => {
          const c = labOf(...rgb(h)); let best = null, bd = Infinity;
          for (let k = 0; k < pal.length; k++) {
            const q = palLab[k], d = deltaE2000(c[0], c[1], c[2], q[0], q[1], q[2]);
            if (d < bd) { bd = d; best = pal[k].h; }
          }
          return { hex: best, dE: bd };
        };
        const chroma = h => { const c = labOf(...rgb(h)); return Math.hypot(c[1], c[2]); };
        /* the button: one flat colour through snapToPalette */
        const snap = h => {
          const n = 4096, d = new Uint8ClampedArray(n * 4), [R, G, B] = rgb(h);
          for (let i = 0; i < n; i++) { d[i * 4] = R; d[i * 4 + 1] = G; d[i * 4 + 2] = B; d[i * 4 + 3] = 255; }
          snapToPalette(d, n);
          return hex(d[0], d[1], d[2]);
        };
        const out = {};
        for (const h of ['#001165', '#0024ae', '#585858', '#009f20', '#23a76c', '#c7c2ff'])
          out[h] = { plain: plain(h), snap: snap(h), chroma: chroma(h), plainChroma: chroma(plain(h).hex) };
        return out;
      });
      /* THE PRECONDITION: without the rule, navy and royal blue go to grey. */
      expect(r['#001165'].plain.hex, 'the plain nearest for navy').toBe('#2c3a44');
      expect(r['#001165'].plainChroma, 'and it is a near-grey').toBeLessThan(10);
      expect(r['#0024ae'].plain.hex, 'the plain nearest for royal blue').toBe('#2c3a44');
      /* THE RULE */
      expect(r['#001165'].snap, 'navy lands on a blue').toBe('#323353');
      expect(r['#0024ae'].snap, 'royal blue lands on a blue').toBe('#42446e');
      /* AND NOTHING ELSE MOVES: a grey (no colour to keep), a colour whose
         nearest is already colourful, and a near match. */
      expect(r['#585858'].snap, 'a grey goes where it always went').toBe(r['#585858'].plain.hex);
      expect(r['#009f20'].plainChroma, 'the green\'s nearest is colourful').toBeGreaterThan(r['#009f20'].chroma / 4);
      expect(r['#009f20'].snap, 'so the green goes where it always went').toBe(r['#009f20'].plain.hex);
      expect(r['#23a76c'].plain.dE, 'a near match, one step off the palette colour #22a66b').toBeLessThan(5);
      expect(r['#23a76c'].snap).toBe(r['#23a76c'].plain.hex);
      /* THE GATE. Periwinkle #c7c2ff is far from the palette (its nearest,
         #d9a3ef, is 11.7 away) and the second look without RT would move it to
         #eebcf1 - but it is not a colourful colour sent to grey (C* 33, and its
         nearest has more colour than it), so it stays. A rule without the gate
         moved Future City's sky and Ruins Selfie's white the same way. */
      expect(r['#c7c2ff'].plain.dE, 'periwinkle has no near match').toBeGreaterThan(5);
      expect(r['#c7c2ff'].snap, 'and still goes where it always went').toBe(r['#c7c2ff'].plain.hex);
    });

  test('the agent panel names the colour the button writes', async ({ page }) => {
    const r = await page.evaluate(() => {
      const n = nearestPaletteColour(0x00, 0x11, 0x65);
      return { hex: n.hex, dE: n.dE };
    });
    expect(r.hex).toBe('#323353');
    expect(r.dE, 'and the distance it reports is to that colour').toBeCloseTo(14.17, 1);
  });

  test('deltaE2000 with six arguments is unchanged, and noRT drops the rotation term', async ({ page }) => {
    const r = await page.evaluate(() => {
      /* Sharma, Wu and Dalal (2005), pairs 1-3: the blue region, where RT is large. */
      const pairs = [[50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
        [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
        [50, 2.8361, -74.0200, 50, 0, -82.7485, 3.4412]];
      return pairs.map(p => ({ want: p[6], six: deltaE2000(...p.slice(0, 6)), noRT: deltaE2000(...p.slice(0, 6), true) }));
    });
    for (const p of r) {
      expect(p.six).toBeCloseTo(p.want, 4);
      expect(Math.abs(p.noRT - p.want), 'without RT the answer moves').toBeGreaterThan(0.05);
    }
  });

  test('the fixer\'s worker uses it: flat navy at size 8 comes out #323353', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#001165'; g.fillRect(0, 0, W, W);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixsnap').checked = true;
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
      await fixLoad(new File([blob], 'navy.png', { type: 'image/png' }));
      const out = await fixRun();
      window.toast = realToast;
      if (!out) return { error: document.getElementById('fixsay') ? document.getElementById('fixsay').textContent : 'no result' };
      const seen = new Set();
      for (let i = 0; i < out.data.length; i += 4)
        seen.add('#' + [out.data[i], out.data[i + 1], out.data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
      document.getElementById('fixpal').checked = false; f.value = '0';
      return { colours: [...seen] };
    });
    expect(r.error, 'the fixer ran').toBeUndefined();
    expect(r.colours).toEqual(['#323353']);
  });

  test('on the swapped palette navy has a navy of its own', async ({ page }) => {
    /* PALETTE_RGB back to the page's own: paletteRGB rebuilds it from PALETTE_HEX. */
    const r = await page.evaluate(() => {
      PALETTE_RGB = null;
      const n = nearestPaletteColour(0x00, 0x11, 0x65), q = labOf(n.r, n.g, n.b);
      return { hex: n.hex, dE: n.dE, chroma: Math.hypot(q[1], q[2]), size: paletteRGB().length };
    });
    expect(r.size).toBe(256);
    expect(r.hex, 'patch615 added #121061').toBe('#121061');
    expect(r.dE, 'which is close').toBeLessThan(5);
    expect(r.chroma, 'and a blue, not a grey').toBeGreaterThan(40);
  });
});
