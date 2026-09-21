/* THE PALETTE ANSWER FOR A PICTURE DOES NOT DEPEND ON WHAT ELSE IS IN THE RUN.

   snapToPalette groups colours within 2.3 dE before the lookup, over one
   file's own census. That is the whole of the page's answer to a question the
   collection asks constantly - 311 traits stacked into one avatar, and 3,557
   colours drawn in more than one of them landing on more than one palette
   colour. The decision is that a trait's colours are decided by that trait;
   the reason and its cost are recorded above SNAP_GROUP_DE in index.html.

   Nothing enforced it. orderfree.spec.js:118 asserts a batch result "equals
   its own single-image run", which a run-scoped map would break - but that
   fixture was built for the engine's k-means RNG and nothing shows it
   sensitive to a pooled census. So this spec carries its own proof of
   sensitivity first, and only then asserts the thing it is guarding:

     TEST 1 the precondition. #585858 alone lands on #625565. Pooled with
       #585856, 1.28 dE away, both land on #344241 - 20.4 dE from where the
       first one was. A fixture whose two arms cannot differ can never fail.
     TEST 2 the guard. That same file, run alone and run in a batch beside
       the other one, comes out the same colour - in both batch orders.

   The fixtures are flat 1280 canvases, so the engine is the identity on them
   (one cell colour, whatever the block size) and the only thing that can
   change the output is the palette step. */
import { test, expect } from '@playwright/test';

const A = '#585858', B = '#585856';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof snapToPalette === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A flat 1280 square of one colour. */
const flat = (hex) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '${hex}'; g.fillRect(0, 0, W, W);
`;

test.describe('the palette map is per picture', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE PRECONDITION: pooling these two censuses moves the first one 20 dE',
    async ({ page }) => {
      /* The page's own snapToPalette, on buffers built here: one colour alone,
         the other alone, and the two together. If the third answer matched the
         first, test 2 below would pass whatever the code did. */
      const r = await page.evaluate(({ A, B }) => {
        const key = h => parseInt(h.slice(1), 16);
        const hex = k => '#' + ((k >>> 0) & 0xffffff).toString(16).padStart(6, '0');
        const run = (cols) => {
          let n = 0; for (const c of cols) n += c[1];
          const d = new Uint8ClampedArray(n * 4);
          const where = []; let o = 0;
          for (const [k, count] of cols) {
            where.push([k, o / 4]);
            for (let i = 0; i < count; i++) {
              d[o] = (k >> 16) & 255; d[o + 1] = (k >> 8) & 255; d[o + 2] = k & 255; d[o + 3] = 255; o += 4;
            }
          }
          snapToPalette(d, n);
          return where.map(([k, at]) => hex((d[at * 4] << 16) | (d[at * 4 + 1] << 8) | d[at * 4 + 2]));
        };
        const a = key(A), b = key(B);
        const la = labOf((a >> 16) & 255, (a >> 8) & 255, a & 255);
        const lb = labOf((b >> 16) & 255, (b >> 8) & 255, b & 255);
        const dE = (p, q) => deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]);
        const alone = run([[a, 4096]])[0], other = run([[b, 4096]])[0];
        const pooled = run([[a, 4096], [b, 4096]]);
        const lab = h => { const k = key(h); return labOf((k >> 16) & 255, (k >> 8) & 255, k & 255); };
        return { alone, other, pooled, src: dE(la, lb), moved: dE(lab(alone), lab(pooled[0])),
          threshold: SNAP_GROUP_DE, cap: SNAP_GROUP_MAX };
      }, { A, B });
      expect(r.src, 'the two sources are inside the grouping threshold')
        .toBeLessThan(r.threshold);
      expect(r.alone, 'alone it goes here').toBe('#625565');
      expect(r.other, 'and the other one goes somewhere else').toBe('#344241');
      expect(r.pooled, 'pooled, the first follows the second').toEqual(['#344241', '#344241']);
      expect(r.moved, 'which is a different colour by any measure').toBeGreaterThan(20);
    });

  test('THE GUARD: a file comes out the same colour alone and in a batch',
    async ({ page }) => {
      /* Both orders, because a map built as the run goes would give a
         different answer depending on which census was seen first. */
      const r = await page.evaluate(async ({ a, b }) => {
        const file = async (src, name) => {
          // eslint-disable-next-line no-new-func
          const c = new Function(src + '\nreturn c;')();
          const blob = await new Promise(res => c.toBlob(res, 'image/png'));
          c.width = 1; c.height = 1;
          return new File([blob], name, { type: 'image/png' });
        };
        const colourOf = async (bytes) => {
          const bm = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
          const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
          const d = g.getImageData(0, 0, k.width, k.height).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4)
            seen.add('#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
          k.width = 1; k.height = 1;
          return [...seen];
        };
        const realToast = window.toast; window.toast = () => {};
        document.getElementById('fixmode').value = 'fast';
        document.getElementById('fixsnap').checked = true;
        document.getElementById('fixgrid').checked = true;
        document.getElementById('fixpal').checked = true;
        const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';

        await fixLoad(await file(a, 'a.png'));
        const out = await fixRun();
        const oc = fixGridCanvas(out);
        const single = await colourOf(new Uint8Array(await (await new Promise(res => oc.toBlob(res, 'image/png'))).arrayBuffer()));
        oc.width = 1; oc.height = 1;

        const order = async (first) => {
          const fa = await file(a, 'a.png'), fb = await file(b, 'b.png');
          await fixBatch(first ? [fa, fb] : [fb, fa]);
          const out = {};
          /* Keyed by the path the file arrived on, not the name the zip gives
             it - fixZipName rewrites that. */
          for (const r of fixBatchFiles) out[r.rel] = await colourOf(r.data);
          return out;
        };
        const fwd = await order(true), rev = await order(false);
        window.toast = realToast;
        document.getElementById('fixpal').checked = false; f.value = '0';
        return { single, fwd, rev };
      }, { a: flat(A), b: flat(B) });

      expect(r.single, 'the single run puts it where it goes alone').toEqual(['#625565']);
      expect(r.fwd['a.png'], 'and a batch does not move it').toEqual(['#625565']);
      expect(r.rev['a.png'], 'whichever census was seen first').toEqual(['#625565']);
      /* The other file is in the same run and keeps its own answer, so the
         assertion above is not passing because the batch did nothing. */
      expect(r.fwd['b.png'], 'the other file is there and is snapped too').toEqual(['#344241']);
      expect(r.rev['b.png']).toEqual(['#344241']);
    });
});
