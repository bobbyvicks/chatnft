/* AT PIXEL SIZE 16 A LINE THINNER THAN A CELL STAYS A LINE (LINES16, with the
   outline gate guard; every picture since round 6).

   At a step of 16 px a drawn line thinner than a cell loses the vote to the
   fill on either side: Dogecoin Polo's collar, GATE Hoodie's white letter
   outline, Mouth 06's whole line. The engine now runs PF.lines16_pack on
   every picture, from any folder or none (the owner, 2026-10-01: "i dont
   want specific rules for certain traits"). Each "today" control runs the
   same picture on the same path with fixLines16 switched off in the page.

     TEST 1 the decisions: fixLines16 (a step of 16, nothing else);
            fixLines16Gate() (the page's own OUTLINE_GATE when fixOutlineRuns()
            says the outline pass will run - the switch, since round 6 never
            the folder - else null); and OUTLINE_GATE holds the pass's numbers
            in one place. (Round 6 judge: fixLines16Gate and fixOutlineRuns take
            no file; outline6's fixOutlineRuns(gridW,gridH) is the one answer.)
     TEST 2 a black line 6 px tall on a grey fill, 4 px in one row of cells and 2
            in the next: one row of 36 cells on a hat, a mouth and a file with no
            folder; with the rules off it is gone - the control.
     TEST 3 GATE-style letters: yellow blocks outlined in white 4-10 px, at every
            phase against the grid. Not one yellow cell changes; the white outline
            and the black lines on the grey below are repaired.
     TEST 4 the outline gate: a grey square under half outlined in black, with a
            straddling black line down its right edge. Repairing that line would
            tip the square over the outline pass's "half the edge is black" test, so
            with the pass on the line is refused (column 49 stays as with the rules
            off: 1 black cell); with the pass switched off the same line IS
            repaired (30 cells) - the refusal is the guard, not a line the rules miss.
     TEST 5 the same with the outline drawn in a dark GREY (20,20,20): the pass's
            gate counts it as near-black since patch620 (nearG), so the guard must
            too. The guard reads the page's OUTLINE_GATE; given the old private
            copy's numbers (dark grey not counted) it lets the line through and
            the pass then repaints the square's edge - the can-fail arm.
     TEST 6 a thin rim under a silhouette outline (round 5, Eight Lines Specs): a
            black outline 9 px, a cream rim 13 px, a black lens, on transparency.
            The rim keeps row 30 (28 cream cells) and the outline goes outside it,
            to row 29 (28 black cells; with the rules off none).
     TEST 7 a folder run asks per file, as a single run does. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixLines16 === 'function' && typeof fixLines16Gate === 'function' && typeof fixOutlineRuns === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

const PAINTERS = `
function paintRects(rects) {
  var W = 1280, d = new Uint8ClampedArray(W * W * 4);
  rects.forEach(function (r) {
    for (var y = r[1]; y < r[1] + r[3]; y++) for (var x = r[0]; x < r[0] + r[2]; x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      var o = (y * W + x) * 4; d[o] = r[4][0]; d[o + 1] = r[4][1]; d[o + 2] = r[4][2]; d[o + 3] = 255;
    }
  });
  return d;
}
var SPEC_GREY = [150, 150, 158], SPEC_BLACK = [0, 0, 0], SPEC_NAVY = [13, 32, 74], SPEC_YEL = [249, 183, 38], SPEC_WHITE = [255, 255, 255];
function paintLine() { return paintRects([[320, 320, 640, 320, SPEC_GREY], [352, 412, 576, 6, SPEC_BLACK]]); }
function paintLetters() {
  var rects = [[0, 0, 1280, 960, SPEC_NAVY], [0, 960, 1280, 320, SPEC_GREY]], widths = [4, 6, 8, 10], phases = [0, 3, 5, 8, 11, 13], k = 0, seed = 0;
  for (var gy = 0; gy < 5; gy++) for (var gx = 0; gx < 6; gx++) {
    var w = widths[(gx + gy + seed) % 4], ox = 32 + gx * 208 + phases[(k++) % 6], oy = 32 + gy * 184 + phases[(k * 5 + 1) % 6];
    var bw = 96 + ((gx * 7 + gy * 3 + seed) % 4) * 8, bh = 120;
    rects.push([ox - w, oy - w, bw + 2 * w, bh + 2 * w, SPEC_WHITE]);
    rects.push([ox, oy, bw, bh, SPEC_YEL]);
    var nx = ox + bw - 40, ny = oy + 44;
    rects.push([nx - w, ny - w, ox + bw + w - (nx - w), 32 + 2 * w, SPEC_WHITE]);
    rects.push([nx, ny, ox + bw + w - nx, 32, SPEC_NAVY]);
  }
  for (var j = 0; j < 8; j++) {
    var y0 = 990 + j * 34 + (j * 5) % 16; rects.push([40 + j * 20, y0, 600 - (40 + j * 20), 6, [10, 10, 10]]);
    var x0 = 700 + j * 70 + (j * 3) % 16; for (var t = 0; t < 260; t++) rects.push([x0 + Math.floor(t * 0.5), 1000 + t, 6, 1, [10, 10, 10]]);
  }
  return paintRects(rects);
}
function paintGate(ink) { ink = ink || SPEC_BLACK; return paintRects([[320, 320, 480, 480, SPEC_GREY], [320, 320, 480, 16, ink], [320, 320, 16, 400, ink], [796, 320, 6, 480, ink]]); }
var SPEC_CREAM = [253, 240, 202], SPEC_DGREY = [20, 20, 20];
function paintRim() { return paintRects([[400, 478, 480, 300, SPEC_BLACK], [409, 487, 462, 282, SPEC_CREAM], [422, 500, 436, 256, SPEC_BLACK]]); }
window.__p = { paintLine: paintLine, paintLetters: paintLetters, paintGate: paintGate, paintRim: paintRim, DGREY: SPEC_DGREY };`;

const HELPERS = `
  window.__t = {
    /* PNG bytes of a 1280 RGBA painter */
    png: async (rgba) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 1280;
      c.getContext('2d').putImageData(new ImageData(rgba, 1280, 1280), 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    set16: (outline) => {
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = false;
      document.getElementById('fixline').checked = outline !== false;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '16';
    },
    /* one run on a path; the 80-cell answer. rules === false: fixLines16 switched off for this run (the control) */
    run: async (bytes, rel, outline, rules) => {
      window.__t.set16(outline);
      const real = window.fixLines16;
      if (rules === false) window.fixLines16 = () => false;
      try {
        await fixLoad(fileWithPath(bytes, rel));
        const out = await fixRun();
        return out ? { w: out.width, data: Array.from(out.data) } : null;
      } finally { window.fixLines16 = real; }
    },
    is: (d, i, c) => d[i * 4 + 3] >= 128 && d[i * 4] === c[0] && d[i * 4 + 1] === c[1] && d[i * 4 + 2] === c[2],
  };`;

test.describe('size 16 keeps a thin line a line', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.addScriptTag({ content: PAINTERS }); await page.evaluate(HELPERS); });

  test('the decisions: step 16 on every picture; the gate where the outline pass runs, from one place', async ({ page }) => {
    const r = await page.evaluate(() => {
      const line = document.getElementById('fixline'), was = line.checked;
      line.checked = true;
      const g = () => { const v = fixLines16Gate(); return v === OUTLINE_GATE ? 'OUTLINE_GATE' : v; };
      const on = { gate: g(), arity: fixLines16Gate.length, runs: fixOutlineRuns(), runs80: fixOutlineRuns(80, 80) };
      line.checked = false;
      const off = { gate: g(), runs: fixOutlineRuns() };
      line.checked = was;
      return { on, off, gate: Object.assign({}, OUTLINE_GATE), frozen: Object.isFrozen(OUTLINE_GATE),
        l16: { skins: fixLines16(16, 'skins/a.png'), hats: fixLines16(16, 'hats/approved/a.png'), mouth: fixLines16(16, 'mouth/a.png'),
          chains: fixLines16(16, 'chains/a.png'), eyes: fixLines16(16, 'eyes/a.png'), backgrounds: fixLines16(16, 'backgrounds/a.png'),
          noLayer: fixLines16(16, 'a.png'), bare: fixLines16(16), at8: fixLines16(8, 'hats/a.png'),
          fractional: fixLines16(15.675, 'hats/a.png'), none: fixLines16(null, 'hats/a.png') },
        noList: typeof FIX_LINES16_LAYERS === 'undefined' };
    });
    expect(r.l16).toEqual({ skins: true, hats: true, mouth: true, chains: true, eyes: true, backgrounds: true, noLayer: true, bare: true,
      at8: false, fractional: false, none: false });
    expect(r.noList).toBe(true);
    /* SUPERSEDED (round 6): the pass skipped five folders and fixOutlineRuns(rel) said so per file. No folder decides
       now: with the switch on the gate goes with every picture, with it off with none. */
    expect(r.on).toEqual({ gate: 'OUTLINE_GATE', arity: 0, runs: true, runs80: true });
    expect(r.off).toEqual({ gate: null, runs: false });
    expect(r.gate, 'the pass\'s gate numbers, one object').toEqual({ OUTLINED_FRAC: 0.5, OUTLINED_NEAR_FRAC: 0.6, MIN_AREA: 200, MIN_RING: 6,
      NEAR_BLACK_LUM: 16, NEAR_GATE_LUM: 22.5, NEAR_GATE_SPREAD: 6 });
    expect(r.frozen).toBe(true);
  });

  test('a thin line on a fill is one row of cells on a hat, a mouth and a file with no folder', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(window.__p.paintLine());
      const realToast = window.toast; window.toast = () => {};
      const count = (o) => { let row25 = 0, black = 0; for (let i = 0; i < o.w * o.w; i++) if (t.is(o.data, i, [0, 0, 0])) { black++; if (Math.floor(i / o.w) === 25) row25++; } return { w: o.w, black, row25 }; };
      const hat = count(await t.run(bytes, 'hats/line.png')), mouth = count(await t.run(bytes, 'mouth/line.png')), bare = count(await t.run(bytes, 'line.png'));
      const off = count(await t.run(bytes, 'hats/line.png', true, false));
      window.toast = realToast;
      return { hat, mouth, bare, off };
    });
    expect(r.hat.w, 'the grid is 80 cells').toBe(80);
    expect(r.off.black, 'THE CONTROL: with the rules off the line is gone').toBe(0);
    expect(r.hat.row25, 'on a hat the line is one row of cells, the row holding its centre').toBe(36);
    expect(r.hat.black, 'and nothing else turned black').toBe(36);
    expect(r.mouth, 'on a mouth the same').toEqual(r.hat);
    expect(r.bare, 'and on a file with no folder').toEqual(r.hat);
  });

  test('GATE-style letters keep every yellow cell; the white outline and the black lines are repaired', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(window.__p.paintLetters());
      const realToast = window.toast; window.toast = () => {};
      const today = await t.run(bytes, 'clothing/letters.png', true, false), mine = await t.run(bytes, 'clothing/letters.png');
      window.toast = realToast;
      const Y = [249, 183, 38], W = [255, 255, 255], K = [10, 10, 10];
      let yT = 0, yN = 0, yLost = 0, wT = 0, wN = 0, kT = 0, kN = 0;
      for (let i = 0; i < 80 * 80; i++) {
        if (t.is(today.data, i, Y)) { yT++; if (!t.is(mine.data, i, Y)) yLost++; }
        if (t.is(mine.data, i, Y)) yN++;
        if (t.is(today.data, i, W)) wT++; if (t.is(mine.data, i, W)) wN++;
        if (t.is(today.data, i, K)) kT++; if (t.is(mine.data, i, K)) kN++;
      }
      return { yT, yN, yLost, wT, wN, kT, kN };
    });
    expect(r.yT, 'the control run has the letters').toBe(1299);
    expect(r.yLost, 'not one yellow letter cell is taken by its outline').toBe(0);
    expect(r.yN).toBe(1299);
    expect(r.wT).toBe(438);
    expect(r.wN, 'the white outline is repaired: 103 more cells').toBe(541);
    expect(r.kT).toBe(93);
    expect(r.kN, 'the black lines on the grey are repaired: 118 more cells').toBe(211);
  });

  test('a line that would switch the outline pass on for a shape is refused; with the pass off it is repaired', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(window.__p.paintGate());
      const realToast = window.toast; window.toast = () => {};
      const col49 = (o) => { let n = 0; for (let y = 0; y < o.w; y++) if (t.is(o.data, y * o.w + 49, [0, 0, 0])) n++; return n; };
      const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
      const today = await t.run(bytes, 'hats/gate.png', true, false), on = await t.run(bytes, 'hats/gate.png', true), off = await t.run(bytes, 'hats/gate.png', false);
      window.toast = realToast;
      return { today: col49(today), on: col49(on), off: col49(off), onIsToday: same(on, today) };
    });
    expect(r.today, 'with the rules off the right-edge line is gone: column 49 holds only the top border').toBe(1);
    expect(r.off, 'THE CONTROL: with the outline pass off the rules repair the line - 30 cells').toBe(30);
    expect(r.on, 'with the pass on the repair is refused').toBe(1);
    expect(r.onIsToday, 'and the whole picture is as with the rules off').toBe(true);
  });

  test('the guard counts a dark grey outline as the pass does (nearG), from the page\'s own numbers', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, DG = window.__p.DGREY, bytes = await t.png(window.__p.paintGate(DG));
      const realToast = window.toast; window.toast = () => {};
      const col49 = (o) => { let n = 0; for (let y = 0; y < o.w; y++) { const i = y * o.w + 49; if (o.data[i * 4 + 3] >= 128 && o.data[i * 4] <= 20 && o.data[i * 4 + 1] <= 20 && o.data[i * 4 + 2] <= 20) n++; } return n; };
      const ringBlack = (o) => { let n = 0; for (let i = 0; i < o.w * o.w; i++) if (t.is(o.data, i, [0, 0, 0])) n++; return n; };
      const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
      const today = await t.run(bytes, 'hats/dgate.png', true, false), on = await t.run(bytes, 'hats/dgate.png', true), off = await t.run(bytes, 'hats/dgate.png', false);
      /* THE CAN-FAIL ARM: the guard given the old private copy's numbers (near-black = luminance <= 16 only) */
      const real = window.fixLines16Gate;
      window.fixLines16Gate = () => { const g = real(); return g ? Object.assign({}, g, { NEAR_GATE_LUM: g.NEAR_BLACK_LUM }) : g; };
      let old; try { old = await t.run(bytes, 'hats/dgate.png', true); } finally { window.fixLines16Gate = real; }
      window.toast = realToast;
      return { today: col49(today), on: col49(on), off: col49(off), onIsToday: same(on, today), oldIsToday: same(old, today), oldBlack: ringBlack(old), todayBlack: ringBlack(today) };
    });
    expect(r.today, 'with the rules off the dark grey right-edge line is gone').toBe(1);
    expect(r.off, 'with the pass off the rules repair it: 30 cells').toBe(30);
    expect(r.on, 'with the pass on the guard refuses it').toBe(1);
    expect(r.onIsToday).toBe(true);
    expect(r.oldIsToday, 'THE CAN-FAIL ARM: with the old copy\'s numbers the line goes through').toBe(false);
    expect(r.oldBlack, 'and the pass, switched on by it, paints the square\'s edge black').toBeGreaterThan(r.todayBlack);
  });

  test('a thin rim keeps its cells; the silhouette outline goes outside it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(window.__p.paintRim());
      const realToast = window.toast; window.toast = () => {};
      const C = [253, 240, 202];
      const rows = (o) => { let k29 = 0, c30 = 0, cAll = 0; for (let x = 0; x < o.w; x++) { if (t.is(o.data, 29 * o.w + x, [0, 0, 0])) k29++; if (t.is(o.data, 30 * o.w + x, C)) c30++; }
        for (let i = 0; i < o.w * o.w; i++) if (t.is(o.data, i, C)) cAll++; return { k29, c30, cAll }; };
      const today = rows(await t.run(bytes, 'glasses/rim.png', true, false)), mine = rows(await t.run(bytes, 'glasses/rim.png', true)), off = rows(await t.run(bytes, 'glasses/rim.png', false));
      window.toast = realToast;
      return { today, mine, off };
    });
    expect(r.today.k29, 'THE CONTROL: with the rules off the outline above the rim is lost').toBe(0);
    expect(r.today.c30).toBe(28);
    expect(r.mine.c30, 'the rim keeps every cell of row 30 (round 4 blackened all 28)').toBe(28);
    expect(r.mine.cAll, 'and not one cream cell is lost anywhere').toBe(r.today.cAll);
    expect(r.mine.k29, 'the outline is drawn outside the rim, in row 29').toBe(28);
    expect(r.off, 'the same with the outline pass off: it is the rules, not the pass').toEqual({ k29: 28, c30: 28, cAll: 56 });
  });

  test('a folder run asks per file', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, bytes = await t.png(window.__p.paintLine());
      const realToast = window.toast; window.toast = () => {};
      const batch = async () => {
        t.set16(true);
        await fixBatch([fileWithPath(bytes, 'hats/line.png'), fileWithPath(bytes, 'mouth/line.png'), fileWithPath(bytes, 'line.png')]);
        const out = {};
        for (const f of fixBatchFiles) {
          const bm = await createImageBitmap(new Blob([f.data], { type: 'image/png' }));
          const k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
          const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
          const d = g.getImageData(0, 0, k.width, k.height).data;
          /* black 16 px rows of the saved 1280 canvas */
          const rows = new Set(); let n = 0;
          for (let i = 0; i < d.length / 4; i++) if (d[i * 4 + 3] && !d[i * 4] && !d[i * 4 + 1] && !d[i * 4 + 2]) { n++; rows.add(Math.floor(Math.floor(i / k.width) / 16)); }
          out[f.rel] = { w: k.width, n, rows: [...rows].sort((a, b) => a - b) };
          k.width = 1; k.height = 1;
        }
        return out;
      };
      const on = await batch();
      const real = window.fixLines16; window.fixLines16 = () => false;
      let off; try { off = await batch(); } finally { window.fixLines16 = real; }
      window.toast = realToast;
      return { on, off };
    });
    expect(r.on['hats/line.png'].w).toBe(1280);
    expect(r.off['hats/line.png'].n, 'THE CONTROL: with the rules off the hat loses its line').toBe(0);
    for (const rel of ['hats/line.png', 'mouth/line.png', 'line.png']) {
      expect(r.on[rel].rows, rel + ' keeps its line, one row of cells').toEqual([25]);
      expect(r.on[rel].n, rel + ': 36 cells of 16 x 16 px').toBe(36 * 256);
    }
  });
});
