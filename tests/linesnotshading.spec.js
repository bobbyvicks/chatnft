/* RESCUE DRAWS LINES, NOT SHADING, AND MOVES A LINE WHOLE (round 7, pf-42-repair8/6).

   Since round 6 the line rules run on every picture (size 8's at a step of 8, size 16's at 16). Round 6's judge
   found what that left worse, all made by RESCUE (a line about one cell thick that straddles two cells is given to
   the cell holding its centre):
   - Red Mushroom Cap at 8: the 4 px dark-red band above the cap's 6 px black outline took the outline's row, so the
     black edge under the cap went dark brown.
   - Wake Me Up Sleep Mask and WAGMI Cap at 8: the letters' 5 px grey drop shadow was drawn as grey cells.
   - Sharingan Eyes at 16: the eye's top outline, refused the one white cell under it (round 5's RIM), was moved
     OUTWARD into a single cell above the white: a black dot over the eye.
   Round 7 tells these apart from the picture, never from a list (the owner: "i dont want specific rules for
   certain traits"):
   STEP  a band whose CIE L* lies between the colours on its two sides, and is a shade (a grey, or the hue of a
         coloured side), is shading, not a line: it is not rescued. A band of its own hue between them is a drawn
         line, and it still is rescued.
   GAP   a rim cell with the line shown on both sides of it in its own row is a gap in that line, not a rim the
         line goes round. The line is not moved outward there.

   Each test measures the page as it is first (the ON side) and asserts that. Then, only when the page's engine text
   (#pfcore, which the worker is built from on every run) has the rule's switch, it runs the same picture with that
   one switch turned off. That control shows the fixture makes the old fault. A page with no switch (base7, the page
   before round 7) does not run the control. Each test logs whether its control ran.

     TEST 1 STEP, size 8: a red field (L* about 36.0), a 4 px dark-red band (38,0,0), a 6 px black line, cream below.
            This is the cap's edge. Row 32 (the black line's row) must be black across all 60 cells, with no dark red.
            The same picture with the band DARK TEAL (0,60,70) must have row 32 teal across all 60 cells. Dark teal
            has L* about 22.6, between red and black by more than STEP_DL (3) on each side; the test asserts that.
            So STEP's lightness clause matches the teal band, and only the shade clause (teal is not the hue of red,
            and black is not coloured) keeps it a drawn line. Control (STEP off): the dark-red band takes row 32.
     TEST 2 STEP, size 8: a cream letter stroke on purple with a 5 px grey drop shadow straddling two cell columns.
            No cell may be grey. Control (STEP off): a grey column of 50 cells.
     TEST 3 GAP, size 16: an eye. A black top line 7 px thick straddles two cell rows over a large eye white, with
            black steps either side of one cell and a red iris under that cell. Nothing may be drawn above the eye
            (row 34 is empty, no dot over the gap), and the top line stays in row 35: 11 black cells, columns 35..46
            less the gap at 40. Control (RUN/GAP off): one black cell in row 34, above the gap, and row 35 the same.

   HOW EACH WAS SHOWN TO FAIL (specs-work, 2026-10-01; mutants are one-line changes of F7.html, made by mkmut.cjs):
   - F7.html: 3 passed, every control ran.
   - NOHUE (STEP's shade clause removed: "return true;" put before "if (Cb < STEP_GREY) return true;"): test 1
     fails on "a band of its own hue (dark teal between red and black) is a drawn line: rescued", Expected 60,
     Received 0 (row 32 is black instead). Tests 2 and 3 pass there, as they should. The spec as it stood before
     used a teal (0,110,120) with L* about 41.9, above the red's, so the clause was never consulted: that version
     passed all 3 tests on NOHUE.
   - base7.html: all 3 fail on the ON side, not on a missing switch (the controls are not run there).
     Test 1 on "with STEP on the outline row is black across the cap" (Received 0), test 2 on "with STEP on: no
     grey cell" (Received { n: 50, col74: 50 }), test 3 on "with GAP on: no dot above the eye" (Received true). */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixRepair8 === 'function' && typeof fixLines16 === 'function');
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
var K = [0, 0, 0], RED = [166, 28, 26], DRED = [38, 0, 0], DTEAL = [0, 60, 70], CREAM = [244, 231, 189];
var PURPLE = [95, 0, 135], WHITE = [250, 240, 230], GREY = [128, 128, 128], IRIS = [220, 20, 20];
/* x 400..879 = cells 50..109 at 8; band y 255..258 (1 px in row 31, 3 in row 32), black y 259..264 */
function paintCap(band) { return paintRects([[400, 160, 480, 95, RED], [400, 255, 480, 4, band], [400, 259, 480, 6, K], [400, 265, 480, 100, CREAM]]); }
/* shadow x 597..601 (3 px in column 74, 2 in 75), stroke x 602..617, y 400..799 = rows 50..99 */
function paintShadow() { return paintRects([[300, 300, 600, 600, PURPLE], [602, 400, 16, 400, WHITE], [597, 400, 5, 400, GREY]]); }
/* at 16: the line y 558..564 (2 px in row 34, 5 in row 35); steps over columns 39 and 41; the iris under column 40 */
function paintEye() { return paintRects([[560, 565, 200, 140, WHITE], [640, 580, 16, 60, IRIS], [560, 558, 200, 7, K], [624, 558, 16, 18, K], [656, 558, 16, 18, K]]); }
window.__p = { paintCap: paintCap, paintShadow: paintShadow, paintEye: paintEye, RED: RED, DRED: DRED, DTEAL: DTEAL };`;

const HELPERS = `
  window.__t = {
    png: async (rgba) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 1280;
      c.getContext('2d').putImageData(new ImageData(rgba, 1280, 1280), 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    set: (step) => {
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = false;
      document.getElementById('fixline').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(step);
    },
    /* does the engine text carry this round-7 switch (exactly once)? */
    has: (name) => (document.getElementById('pfcore').textContent.match(new RegExp('var ' + name + ' = (true|false);', 'g')) || []).length === 1,
    /* one run; off = the name of a round-7 switch to turn off in the engine text for this run only */
    run: async (bytes, rel, step, off) => {
      window.__t.set(step);
      const el = document.getElementById('pfcore'), orig = el.textContent;
      if (off) {
        const re = new RegExp('var ' + off + ' = (true|false);', 'g');
        if ((orig.match(re) || []).length !== 1) throw new Error('the engine has no switch ' + off);
        el.textContent = orig.replace(re, 'var ' + off + ' = false;');
      }
      try {
        await fixLoad(fileWithPath(bytes, rel));
        const out = await fixRun();
        return out ? { w: out.width, data: Array.from(out.data) } : null;
      } finally { el.textContent = orig; }
    },
    is: (d, i, c) => d[i * 4 + 3] >= 128 && d[i * 4] === c[0] && d[i * 4 + 1] === c[1] && d[i * 4 + 2] === c[2],
    near: (d, i, c, tol) => d[i * 4 + 3] >= 128 && Math.abs(d[i * 4] - c[0]) <= tol && Math.abs(d[i * 4 + 1] - c[1]) <= tol && Math.abs(d[i * 4 + 2] - c[2]) <= tol,
  };`;

/* CIE L* of an sRGB colour (D65), for the fixture's own premise in test 1. */
const lstar = ([r, g, b]) => {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : Y * 24389 / 27;
};

/* run the control only when the page's engine has the switch; say which happened */
const control = async (page, name) => {
  const has = await page.evaluate((n) => window.__t.has(n), name);
  console.log(has ? 'control ran: ' + name + ' off' : 'CONTROL NOT RUN: the engine has no switch ' + name);
  test.info().annotations.push({ type: has ? 'control-ran' : 'control-not-run', description: name });
  return has;
};

test.describe('rescue draws lines, not shading, and moves a line whole', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.addScriptTag({ content: PAINTERS }); await page.evaluate(HELPERS); });

  test('STEP at 8: a dark shade between a red cap and its black outline does not take the outline row; a dark teal band does', async ({ page }) => {
    /* the fixture's premise: dark teal lies between red and black in L*, by more than STEP_DL (3) on each side,
       so STEP's lightness clause matches it and only the shade (hue) clause can keep it */
    const Lred = lstar([166, 28, 26]), Lteal = lstar([0, 60, 70]);
    expect(Lteal, 'PRECONDITION: dark teal is lighter than black by more than 3 L*').toBeGreaterThan(3);
    expect(Lteal, 'PRECONDITION: dark teal is darker than the red by more than 3 L*').toBeLessThan(Lred - 3);

    const on = await page.evaluate(async () => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const r = (o, y, c) => { let n = 0; for (let x = 50; x < 110; x++) if (t.is(o.data, y * o.w + x, c)) n++; return n; };
      const cap = await t.png(P.paintCap(P.DRED)), teal = await t.png(P.paintCap(P.DTEAL));
      const a = await t.run(cap, 'hats/cap.png', 8), b = await t.run(teal, 'hats/cap.png', 8);
      window.toast = realToast;
      return { w: a.w, onBlack: r(a, 32, [0, 0, 0]), onDark: r(a, 32, P.DRED), tealTeal: r(b, 32, P.DTEAL), tealBlack: r(b, 32, [0, 0, 0]) };
    });
    console.log('test 1 on: ' + JSON.stringify(on) + ' | L* red ' + Lred.toFixed(1) + ', dark teal ' + Lteal.toFixed(1));
    expect(on.w, 'the grid is 160 cells').toBe(160);
    expect(on.onBlack, 'with STEP on the outline row is black across the cap').toBe(60);
    expect(on.onDark).toBe(0);
    expect(on.tealTeal, 'a band of its own hue (dark teal between red and black) is a drawn line: rescued').toBe(60);
    expect(on.tealBlack).toBe(0);

    if (await control(page, 'STEP_ON')) {
      const off = await page.evaluate(async () => {
        const t = window.__t, P = window.__p;
        const realToast = window.toast; window.toast = () => {};
        const r = (o, y, c) => { let n = 0; for (let x = 50; x < 110; x++) if (t.is(o.data, y * o.w + x, c)) n++; return n; };
        const cap = await t.png(P.paintCap(P.DRED));
        const o = await t.run(cap, 'hats/cap.png', 8, 'STEP_ON');
        window.toast = realToast;
        return { offBlack: r(o, 32, [0, 0, 0]), offDark: r(o, 32, P.DRED) };
      });
      console.log('test 1 off: ' + JSON.stringify(off));
      expect(off.offDark, 'THE CONTROL: with STEP off the dark band takes the black outline\'s row (round 6)').toBe(60);
      expect(off.offBlack).toBe(0);
    }
  });

  test('STEP at 8: a letter\'s 5 px grey drop shadow is not drawn as a column of grey cells', async ({ page }) => {
    const measure = (off) => page.evaluate(async (off) => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintShadow());
      const grey = (o) => { let n = 0, col74 = 0; for (let i = 0; i < o.w * o.w; i++) if (t.near(o.data, i, [128, 128, 128], 12)) { n++; if (i % o.w === 74) col74++; } return { n, col74 }; };
      const o = await t.run(bytes, 'glasses/mask.png', 8, off || undefined);
      window.toast = realToast;
      return grey(o);
    }, off);
    const on = await measure(null);
    console.log('test 2 on: ' + JSON.stringify(on));
    expect(on, 'with STEP on: no grey cell').toEqual({ n: 0, col74: 0 });
    if (await control(page, 'STEP_ON')) {
      const off = await measure('STEP_ON');
      console.log('test 2 off: ' + JSON.stringify(off));
      expect(off, 'THE CONTROL: with STEP off the shadow is a grey column, 50 cells (round 6)').toEqual({ n: 50, col74: 50 });
    }
  });

  test('GAP at 16: an eye\'s top line is not moved out over a one-cell gap (no dot above the eye)', async ({ page }) => {
    const measure = (off) => page.evaluate(async (off) => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintEye());
      const rows = (o) => { const out = { w: o.w }; for (const y of [33, 34, 35]) { let k = 0; for (let x = 30; x < 50; x++) if (t.is(o.data, y * o.w + x, [0, 0, 0])) k++; out['row' + y] = k; } out.dot = t.is(o.data, 34 * o.w + 40, [0, 0, 0]); return out; };
      const o = await t.run(bytes, 'eyes/eye.png', 16, off || undefined);
      window.toast = realToast;
      return rows(o);
    }, off);
    const on = await measure(null);
    console.log('test 3 on: ' + JSON.stringify(on));
    expect(on.w, 'the grid is 80 cells').toBe(80);
    expect(on.dot, 'with GAP on: no dot above the eye').toBe(false);
    expect(on.row34, 'with GAP on: nothing in the row above the eye').toBe(0);
    expect(on.row35, 'the top line stays in its own row: cells 35..46 less the gap at 40 (column 47 is half painted and comes out empty)').toBe(11);
    if (await control(page, 'RUN_ON')) {
      const off = await measure('RUN_ON');
      console.log('test 3 off: ' + JSON.stringify(off));
      expect(off.dot, 'THE CONTROL: with RUN/GAP off the line is moved out into the one cell above the gap (round 6)').toBe(true);
      expect(off.row34).toBe(1);
      expect(on.row35, 'the top line stays in its own row, as the control draws it there').toBe(off.row35);
    }
  });
});
