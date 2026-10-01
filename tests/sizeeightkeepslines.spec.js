/* AT PIXEL SIZE 8, A PICTURE KEEPS ITS LINES WHOLE (patch614; every picture
   since round 6).

   The owner, on the size-8 results for mouths, eyes and chains: "even when
   using 8 its not good but fix it for 8 then". One fault was a line about
   one cell wide falling across two cells: neither cell was over half
   covered, so the line vanished (Mouth 05's left teeth bar). At a step of
   exactly 8 px the engine runs PF.repair8_pack, which gives such a line to
   the cell holding its centre. Since round 6 on every picture, from any
   folder or none - the owner, 2026-10-01: "i dont want specific rules for
   certain traits, i just want it to funnction so that those rules dont need
   to be in place". This file used to pin the opposite ("mouth, eyes or
   chains, and nothing else"; the bar vanishing on a hat).

   The fixture is that fault in its plainest form: a red bar 6 px wide, 4 px
   in one cell and 2 in the next, on transparency. With the rules off it
   vanishes - the controls switch fixRepair8 off in the page and show it, so
   the fixture can tell the two apart.

     TEST 1 the decision: a step of exactly 8, whatever the path says.
     TEST 2 a single run: the bar is one column of cells on a mouth, a hat
       and a file with no folder; with the rules off it vanishes (control).
     TEST 3 a folder run asks the same way, per file; the control again.
     TEST 4 art already drawn on the 8 grid comes back exactly as it went in.
     TEST 5 (round 6 judge) THE PALETTE GUARD: a repair may not move the palette's
       answer for cells it did not touch. The page's palette step groups colours by
       count, so a few repaired cells can move hundreds of others (Walnut Chessboard
       Skin at 8: 4 cells repaired, 201 dark-grain cells merged into the brown).
       The fixture makes that happen on purpose: the page's snapToPalette is replaced,
       for these runs only, by a stand-in that turns every blue cell green once more
       than 30 cells are pure red - the worker carries the page's snapToPalette as
       its text, so the stand-in is what the rules' guard and the palette step both
       run. The straddling red bar (60 cells when repaired) beside a 25 x 25-cell
       blue block: with the guard the repair is taken back and the blue stays blue -
       the picture is the rules-off picture, cell for cell. Controls: the same bar
       drawn ON the grid (no rule makes it) does turn the blue green - the stand-in
       moves cells; and with a stand-in that moves nothing, the repair stands
       (60 red cells) - the guard is not refusing everything. RUN AGAINST a page
       whose worker glue does not send the snap (round 6's Xnosnap) this test fails:
       60 red cells and 625 green. */
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

test.describe('size 8 keeps a picture\'s lines whole', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.evaluate(HELPERS); });

  test('the decision: a step of exactly 8, on every picture', async ({ page }) => {
    const r = await page.evaluate(() => ({
      mouth: fixRepair8(8, 'mouth/approved/a.png'), eyes: fixRepair8(8, 'eyes/a.png'), chains: fixRepair8(8, 'x/chains/wip/a.png'),
      hats: fixRepair8(8, 'hats/approved/a.png'), backgrounds: fixRepair8(8, 'backgrounds/a.png'), noLayer: fixRepair8(8, 'a.png'), bare: fixRepair8(8),
      at16: fixRepair8(16, 'mouth/a.png'), fractional: fixRepair8(7.8375, 'hats/a.png'), none: fixRepair8(null, 'hats/a.png'),
      noList: typeof FIX_REPAIR8_LAYERS === 'undefined',
    }));
    expect(r).toEqual({ mouth: true, eyes: true, chains: true, hats: true, backgrounds: true, noLayer: true, bare: true,
      at16: false, fractional: false, none: false, noList: true });
  });

  test('a single run: the straddling bar is one column on a mouth, a hat and a file with no folder', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(t.bar);
      const realToast = window.toast; window.toast = () => {};
      const run = async (rel) => {
        t.set8();
        await fixLoad(fileWithPath(bytes, rel));
        const out = await fixRun();
        return out ? Object.assign({ w: out.width }, t.painted(out.data, out.width)) : { error: 'no result' };
      };
      const mouth = await run('mouth/approved/bar.png'), hat = await run('hats/approved/bar.png'), bare = await run('bar.png');
      /* THE CONTROL: the same run with the rules switched off in the page */
      const real = window.fixRepair8; window.fixRepair8 = () => false;
      const off = await run('hats/approved/bar.png');
      window.fixRepair8 = real;
      window.toast = realToast;
      return { mouth, hat, bare, off };
    });
    expect(r.mouth.w, 'the grid is 160 cells').toBe(160);
    expect(r.off.n, 'THE CONTROL: with the rules off the bar vanishes').toBe(0);
    expect(r.mouth.cols, 'on a mouth it is one column, the cell holding its centre').toEqual([76]);
    expect(r.mouth.rows, 'the whole bar, 480 px = 60 cells').toBe(60);
    expect(r.hat, 'on a hat the same').toEqual(r.mouth);
    expect(r.bare, 'and on a file with no folder').toEqual(r.mouth);
  });

  test('a folder run asks per file, on every picture', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(t.bar);
      const realToast = window.toast; window.toast = () => {};
      const batch = async () => {
        t.set8();
        await fixBatch([fileWithPath(bytes, 'mouth/bar.png'), fileWithPath(bytes, 'hats/bar.png'), fileWithPath(bytes, 'bar.png')]);
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
        return out;
      };
      const on = await batch();
      const real = window.fixRepair8; window.fixRepair8 = () => false;
      const off = await batch();
      window.fixRepair8 = real;
      window.toast = realToast;
      return { on, off };
    });
    expect(r.on['mouth/bar.png'].w).toBe(1280);
    expect(r.off['hats/bar.png'].n, 'THE CONTROL: with the rules off the hat loses its bar').toBe(0);
    expect(r.on['mouth/bar.png'].cols, 'the mouth keeps its bar').toEqual([76]);
    expect(r.on['hats/bar.png'].cols, 'the hat in the same run too').toEqual([76]);
    expect(r.on['bar.png'].cols, 'and the file with no folder').toEqual([76]);
  });

  test('THE PALETTE GUARD: a repair that would move the palette for cells it did not touch is taken back', async ({ page }) => {
    await page.addScriptTag({ content: `
      window.__stubs = {
        knock: function snapToPalette(d, n, w) {
          var red = 0, i, o;
          for (i = 0; i < n; i++) { o = i * 4; if (d[o + 3] >= 128 && d[o] === 255 && d[o + 1] === 0 && d[o + 2] === 0) red++; }
          if (red > 30) for (i = 0; i < n; i++) { o = i * 4; if (d[o + 3] >= 128 && d[o] === 0 && d[o + 1] === 0 && d[o + 2] === 255) { d[o + 1] = 255; d[o + 2] = 0; } }
          return { colours: 0, pixels: 0, worst: 0, merged: 0 };
        },
        quiet: function snapToPalette(d, n, w) { return { colours: 0, pixels: 0, worst: 0, merged: 0 }; }
      };` });
    const r = await page.evaluate(async () => {
      const t = window.__t;
      const blue = (g) => { g.fillStyle = '#0000ff'; g.fillRect(160, 160, 200, 200); };
      const straddle = await t.png((g) => { blue(g); t.bar(g); });
      const onGrid = await t.png((g) => { blue(g); g.fillStyle = '#ff0000'; g.fillRect(608, 400, 8, 480); });
      const realToast = window.toast; window.toast = () => {};
      const realSnap = window.snapToPalette, realR8 = window.fixRepair8;
      const run = async (bytes, stub, rulesOff) => {
        t.set8(); document.getElementById('fixpal').checked = true; document.getElementById('fixline').checked = false;
        window.snapToPalette = window.__stubs[stub];
        if (rulesOff) window.fixRepair8 = () => false;
        try {
          await fixLoad(fileWithPath(bytes, 'skins/guard.png'));
          const out = await fixRun();
          const d = out.data; let red = 0, bl = 0, gr = 0, h = 2166136261;
          for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
          for (let i = 0; i < d.length / 4; i++) {
            if (d[i * 4 + 3] < 128) continue;
            const c = d[i * 4] + ',' + d[i * 4 + 1] + ',' + d[i * 4 + 2];
            if (c === '255,0,0') red++; else if (c === '0,0,255') bl++; else if (c === '0,255,0') gr++;
          }
          return { w: out.width, red, blue: bl, green: gr, hash: h };
        } finally { window.snapToPalette = realSnap; window.fixRepair8 = realR8; }
      };
      const guarded = await run(straddle, 'knock'), off = await run(straddle, 'knock', true);
      const drawn = await run(onGrid, 'knock'), quiet = await run(straddle, 'quiet');
      window.toast = realToast;
      return { guarded, off, drawn, quiet };
    });
    expect(r.guarded.w, 'the grid is 160 cells').toBe(160);
    expect(r.drawn, 'PRECONDITION: red drawn on the grid (no rule) turns the blue green - the stand-in moves cells').toMatchObject({ red: 60, blue: 0, green: 625 });
    expect(r.quiet, 'CONTROL: with a palette that moves nothing the bar is repaired, 60 cells').toMatchObject({ red: 60, blue: 625, green: 0 });
    expect(r.off, 'CONTROL: with the rules off the bar is gone and the blue stays').toMatchObject({ red: 0, blue: 625, green: 0 });
    expect(r.guarded, 'THE GUARD: the repair is taken back, the blue stays blue').toMatchObject({ red: 0, blue: 625, green: 0 });
    expect(r.guarded.hash, 'cell for cell the rules-off picture').toBe(r.off.hash);
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
