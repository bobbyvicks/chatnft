/* AT PIXEL SIZE 8, A MOUTH, EYES OR CHAIN KEEPS ITS LINES WHOLE (patch614).

   The owner, on the size-8 results for mouths, eyes and chains: "even when
   using 8 its not good but fix it for 8 then". One fault was a line about
   one cell wide falling across two cells: neither cell was over half
   covered, so the line vanished (Mouth 05's left teeth bar). At a step of
   exactly 8 px on those three layers the engine now runs PF.repair8_pack,
   which gives such a line to the cell holding its centre.

   The fixture is that fault in its plainest form: a red bar 6 px wide, 4 px
   in one cell and 2 in the next, on transparency. Under today's rule it
   vanishes - the controls show it, so the fixture can tell the two apart.

     TEST 1 the decision: size 8 and one of the three layers, nothing else.
     TEST 2 a single run: the bar is one column of cells on a mouth, and
       still vanishes on a hat (today's rule, kept for other layers).
     TEST 3 a folder run asks the same way, per file.
     TEST 4 art already drawn on the 8 grid comes back exactly as it went in. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixRepair8 === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Page-side helpers, defined once per test in the page. */
const HELPERS = `
  window.__t = {
    /* a 1280 PNG from a painter function */
    png: async (paint) => {
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      paint(g);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    /* the red bar: x 612..617, so 4 px in cell 76 (608-615) and 2 in cell 77 */
    bar: (g) => { g.fillStyle = '#ff0000'; g.fillRect(612, 400, 6, 480); },
    set8: () => {
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = false;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8';
    },
    /* opaque cell columns and rows of a 160-cell answer */
    painted: (data, w) => {
      const cols = new Set(), rows = new Set(); let n = 0;
      for (let i = 0; i < data.length / 4; i++) if (data[i * 4 + 3]) { n++; cols.add(i % w); rows.add(Math.floor(i / w)); }
      return { n, cols: [...cols].sort((a, b) => a - b), rows: rows.size };
    },
  };`;

test.describe('size 8 keeps a mouth, eyes or chain\'s lines whole', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.evaluate(HELPERS); });

  test('the decision: a step of exactly 8 on mouth, eyes or chains, and nothing else', async ({ page }) => {
    const r = await page.evaluate(() => ({
      mouth: fixRepair8(8, 'mouth/approved/a.png'), eyes: fixRepair8(8, 'eyes/a.png'), chains: fixRepair8(8, 'x/chains/wip/a.png'),
      hats: fixRepair8(8, 'hats/approved/a.png'), noLayer: fixRepair8(8, 'a.png'),
      at16: fixRepair8(16, 'mouth/a.png'), fractional: fixRepair8(7.8375, 'mouth/a.png'), none: fixRepair8(null, 'mouth/a.png'),
    }));
    expect(r).toEqual({ mouth: true, eyes: true, chains: true, hats: false, noLayer: false, at16: false, fractional: false, none: false });
  });

  test('a single run: the straddling bar is one column on a mouth, and vanishes on a hat as it does today', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(t.bar);
      const realToast = window.toast; window.toast = () => {};
      const run = async (rel) => {
        t.set8();
        await fixLoad(fileWithPath(bytes, rel));
        const out = await fixRun();
        return out ? Object.assign({ w: out.width }, t.painted(out.data, out.width)) : { error: 'no result' };
      };
      const mouth = await run('mouth/approved/bar.png'), hat = await run('hats/approved/bar.png');
      window.toast = realToast;
      return { mouth, hat };
    });
    expect(r.mouth.w, 'the grid is 160 cells').toBe(160);
    expect(r.hat.n, 'THE CONTROL: on a hat the bar vanishes, today\'s rule').toBe(0);
    expect(r.mouth.cols, 'on a mouth it is one column, the cell holding its centre').toEqual([76]);
    expect(r.mouth.rows, 'the whole bar, 480 px = 60 cells').toBe(60);
  });

  test('a folder run asks per file', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(t.bar);
      const realToast = window.toast; window.toast = () => {};
      t.set8();
      await fixBatch([fileWithPath(bytes, 'mouth/bar.png'), fileWithPath(bytes, 'hats/bar.png')]);
      const out = {};
      for (const f of fixBatchFiles) {
        const bm = await createImageBitmap(new Blob([f.data], { type: 'image/png' }));
        const k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
        const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
        const d = g.getImageData(0, 0, k.width, k.height).data;
        /* opaque 8 px columns of the saved 1280 canvas */
        const cols = new Set(); let n = 0;
        for (let i = 0; i < d.length / 4; i++) if (d[i * 4 + 3]) { n++; cols.add(Math.floor((i % k.width) / 8)); }
        out[f.rel] = { w: k.width, n, cols: [...cols].sort((a, b) => a - b) };
        k.width = 1; k.height = 1;
      }
      window.toast = realToast;
      return out;
    });
    expect(r['mouth/bar.png'].w).toBe(1280);
    expect(r['mouth/bar.png'].cols, 'the mouth keeps its bar').toEqual([76]);
    expect(r['hats/bar.png'].n, 'the hat in the same run does not').toBe(0);
  });

  test('art already on the 8 grid comes back exactly as it went in', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t;
      /* 8 px blocks, varied colours, a transparent quarter and thin one-cell lines */
      const want = [];
      const bytes = await t.png((g) => {
        for (let cy = 40; cy < 120; cy++) for (let cx = 40; cx < 120; cx++) {
          if (cx < 80 && cy < 80 && (cx + cy) % 3) continue;
          const line = cx === 90 || cy === 100;
          const c = line ? [0, 0, 0] : [(cx * 37 + cy * 91) & 255, (cx * 53 + 7) & 255, (cy * 71 + 3) & 255];
          g.fillStyle = 'rgb(' + c.join(',') + ')'; g.fillRect(cx * 8, cy * 8, 8, 8);
          want.push([cx, cy, c]);
        }
      });
      const realToast = window.toast; window.toast = () => {};
      t.set8();
      await fixLoad(fileWithPath(bytes, 'eyes/grid.png'));
      const out = await fixRun();
      window.toast = realToast;
      let wrong = 0, painted = 0;
      const at = new Map(want.map(([x, y, c]) => [y * 160 + x, c]));
      for (let i = 0; i < 160 * 160; i++) {
        const a = out.data[i * 4 + 3], c = at.get(i);
        if (a) painted++;
        if (!c) { if (a) wrong++; continue; }
        if (!a || out.data[i * 4] !== c[0] || out.data[i * 4 + 1] !== c[1] || out.data[i * 4 + 2] !== c[2]) wrong++;
      }
      return { wrong, painted, drawn: want.length };
    });
    expect(r.painted, 'every drawn cell is there').toBe(r.drawn);
    expect(r.wrong, 'and each is the colour it was drawn').toBe(0);
  });
});
