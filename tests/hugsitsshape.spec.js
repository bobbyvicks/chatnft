/* A THIN LINE ROUND A SHAPE IS DRAWN ROUND IT (round 8, pf-42-repair8/7: HUG).

   The owner, on GATE Hoodie at Pixel size 16: "like the white outline for ghate, would there be something that could
   be fxed?" The source draws a 6-7 px white outline round yellow letters on a navy hoodie. At 16 that is under half a
   cell, so the vote gives every cell it crosses to the letter or to the navy, and RESCUE (which draws only a line that
   STRADDLES two cells) cannot bring it back: the outline came out as scattered white cells. HUG draws such a line as
   a ring of navy cells just outside the shape - told from the picture: a thin line between a shape and the fill
   round it, that goes ROUND the shape (the shape is edged by it nearly all round) and not round the fill. It never
   takes a shape cell.

     TEST 1 size 16: two yellow blocks with a 6 px white outline on navy, every edge falling inside a cell; one block
            has a window lined in white. Every yellow cell is where the control has it (the letters keep their
            shape), and no yellow cell touches a navy cell except the window's own (2 edges). Control (HUG off):
            the yellow cells are the same and 66 yellow-navy edges show the outline's gaps.
     TEST 2 the same at 16 with the palette ON: the same answer (yellow kept, 2 edges), the palette's colours.
     TEST 3 a stripe: a 6 px white line between a navy field above and a yellow field below (neither is a shape
            the line goes round) is left exactly as the vote made it - the output equals the control's cell for
            cell.
     TEST 4 GUARD, size 8: the fixture's outline is already whole (6 px is most of an 8 px cell): no cell changes.
            It cannot fail on HUG's own behaviour: with HUG off the fixture has 0 yellow-navy edges at 8, so HUG has no
            cell to take there (round 8's numbers verifier: it failed under none of 6 mutants of the rule). It guards
            that a whole outline at 8 is left alone - what GATE Hoodie at 8 needs (0 cells changed on the 311).
   Round 9 (pf-42-repair8/8): test 4 labelled a guard, and the control of every test is HUG off where the page has
   the switch HUG_ON and the page as it is where it has none (base-623, which has no HUG): before, on base-623 all
   four tests failed only because the control could not find the switch, not on behaviour. Now on base-623 tests 1
   and 2 fail on behaviour (66 edges, not 2) and tests 3 and 4 pass (guards).
   Each control runs the same picture with HUG_ON = false (or as it is - see round 9 above) in the page's own engine text (#pfcore, which the worker is
   built from on every run). */
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
var NAVY = [13, 32, 74], YEL = [252, 189, 7], WH = [250, 250, 248];
/* block 1: yellow x 405..520, y 405..600 (edges inside cells 25 and 32 / 25 and 37 at 16), a white window lining;
   block 2: yellow x 662..771, y 661..811. Each with a 6 px white outline. */
function paintLetters() {
  return paintRects([[200, 200, 880, 880, NAVY],
    [399, 399, 128, 208, WH], [405, 405, 116, 196, YEL], [445, 470, 36, 52, WH], [451, 476, 24, 40, NAVY],
    [656, 655, 122, 163, WH], [662, 661, 110, 151, YEL]]);
}
/* a stripe: navy above, a 6 px white line, yellow below - across the whole field */
function paintStripe() { return paintRects([[200, 200, 880, 405, NAVY], [200, 605, 880, 6, WH], [200, 611, 880, 469, YEL]]); }
window.__p = { paintLetters: paintLetters, paintStripe: paintStripe };`;

const HELPERS = `
  window.__t = {
    png: async (rgba) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 1280;
      c.getContext('2d').putImageData(new ImageData(rgba, 1280, 1280), 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    set: (step, pal) => {
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = !!pal;
      document.getElementById('fixline').checked = true;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(step);
    },
    /* one run; off = the name of an engine switch to turn off in the engine text for this run only */
    run: async (bytes, rel, step, off, pal) => {
      window.__t.set(step, pal);
      const el = document.getElementById('pfcore'), orig = el.textContent;
      /* round 9: a page with no switch HUG_ON and no hug() at all has no HUG (base-623): its control is the page as it is */
      if (off === 'HUG_ON' && !/var HUG_ON = (true|false);/.test(orig) && orig.indexOf('function hug(') < 0) off = null;
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
    /* cell classes by colour: Y yellow, W white, N navy, . clear, ? other */
    cls: (d, i) => {
      if (d[i * 4 + 3] < 128) return '.';
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (r > 170 && g > 110 && b < 100) return 'Y';
      if (r > 190 && g > 190 && b > 190) return 'W';
      if (b > r + 20 && r < 80) return 'N';
      return '?';
    },
    /* yellow cells (as indices), and 4-neighbour edges from a yellow cell to a navy one */
    count: (o) => {
      const t = window.__t, w = o.w, Y = [], cls = [];
      for (let i = 0; i < w * w; i++) cls.push(t.cls(o.data, i));
      let edges = 0, white = 0, other = 0;
      for (let i = 0; i < w * w; i++) {
        if (cls[i] === 'W') white++; if (cls[i] === '?') other++;
        if (cls[i] !== 'Y') continue; Y.push(i);
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < w && cls[yy * w + xx] === 'N') edges++; }
      }
      return { yellow: Y.length, Y: Y.join(','), edges, white, other };
    },
  };`;

test.describe('a thin line round a shape is drawn round it', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); await page.addScriptTag({ content: PAINTERS }); await page.evaluate(HELPERS); });

  test('HUG at 16: the white outline is a closed ring outside the yellow blocks; no yellow cell changes', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintLetters());
      const on = await t.run(bytes, 'clothing/letters.png', 16), off = await t.run(bytes, 'clothing/letters.png', 16, 'HUG_ON');
      window.toast = realToast;
      return { w: on.w, on: t.count(on), off: t.count(off) };
    });
    console.log('test 1 on:', JSON.stringify({ yellow: r.on.yellow, edges: r.on.edges, white: r.on.white }), 'off:', JSON.stringify({ yellow: r.off.yellow, edges: r.off.edges, white: r.off.white }));
    expect(r.w, 'the grid is 80 cells').toBe(80);
    expect(r.off.edges, 'THE CONTROL: with HUG off the outline has gaps - yellow touches navy (round 7)').toBe(66);
    expect(r.on.Y, 'every yellow cell is where the vote put it: the blocks keep their shape').toBe(r.off.Y);
    expect(r.on.yellow).toBe(163);
    expect(r.on.edges, 'with HUG on only the white-lined window touches the yellow (2 edges): the ring is closed').toBe(2);
    expect(r.on.white, 'the ring is drawn in white cells').toBeGreaterThan(r.off.white + 50);
    expect(r.on.other, 'no other colour appears').toBe(0);
  });

  test('HUG at 16 with the palette on: the same ring, the same yellow cells', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintLetters());
      const on = await t.run(bytes, 'clothing/letters.png', 16, null, true), off = await t.run(bytes, 'clothing/letters.png', 16, 'HUG_ON', true);
      window.toast = realToast;
      return { on: t.count(on), off: t.count(off) };
    });
    console.log('test 2 on:', JSON.stringify({ yellow: r.on.yellow, edges: r.on.edges, white: r.on.white, other: r.on.other }), 'off:', JSON.stringify({ yellow: r.off.yellow, edges: r.off.edges }));
    expect(r.off.edges, 'THE CONTROL: gaps with HUG off').toBe(66);
    expect(r.on.Y).toBe(r.off.Y);
    expect(r.on.edges).toBe(2);
    expect(r.on.other).toBe(0);
  });

  test('a stripe between two fills is not a hug: the cells are the vote\'s, exactly', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintStripe());
      const on = await t.run(bytes, 'clothing/stripe.png', 16), off = await t.run(bytes, 'clothing/stripe.png', 16, 'HUG_ON');
      window.toast = realToast;
      let diff = 0; for (let i = 0; i < on.data.length; i++) if (on.data[i] !== off.data[i]) diff++;
      return { diff, n: on.data.length, c: t.count(on) };
    });
    expect(r.n, 'a whole 80 x 80 result').toBe(80 * 80 * 4);
    expect(r.c.yellow, 'the picture has its yellow field').toBeGreaterThan(1000);
    expect(r.diff, 'HUG on and off give the same bytes').toBe(0);
  });

  test('GUARD - size 8: the fixture\'s outline is already whole; HUG changes nothing', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__t, P = window.__p;
      const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(P.paintLetters());
      const on = await t.run(bytes, 'clothing/letters.png', 8), off = await t.run(bytes, 'clothing/letters.png', 8, 'HUG_ON');
      window.toast = realToast;
      let diff = 0; for (let i = 0; i < on.data.length; i++) if (on.data[i] !== off.data[i]) diff++;
      return { w: on.w, diff, on: t.count(on) };
    });
    expect(r.w, 'the grid is 160 cells').toBe(160);
    expect(r.on.edges, 'no yellow cell touches navy').toBe(0);
    expect(r.diff, 'HUG on and off give the same bytes at 8').toBe(0);
  });
});
