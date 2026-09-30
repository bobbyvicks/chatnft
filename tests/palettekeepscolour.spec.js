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
       only here. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof palettePick === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

test.describe('the palette keeps a colourful colour colourful', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

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
});
