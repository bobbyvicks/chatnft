/* ONE PALETTE STEP PER DISTINCT PICTURE, AND A BAR THAT MOVES WHILE THE GUARD WORKS (speed625, pf-42-repair8/9).

   Patch622's palette guard snapped the whole picture with the page's palette step 4 to 8 times per picture, about
   half of them on bytes it had already snapped, and the worker then snapped the final cells once more - always the
   guard's last cells. A folder of 47 backgrounds went from 24 s to 55-76 s, and a single picture's bar sat at 70%
   with no movement for up to 13 s. Speed625 changes no output (the 311 at 4, 8, 10 and 16, palette on and off, saved
   cells, cells after the palette and the engine's own cells, are round 9b's byte for byte); these tests pin the speed.

   THE INSTRUMENT is the test's own, not the page's: the page's worker text (what fixWorker() puts in its Blob) with
   an appendix that wraps the global snapToPalette - every real execution logged with a hash of its input bytes and
   whether it ran inside PF.process (the guard) or after it (the worker's own palette step) - and the worker's
   postMessage, to collect the progress messages. The message is the one fixBatchRun sends.
     TEST 1 size 16, palette on, gapfixtures' GAPS picture (HUG changes cells, so the guard runs):
            - the guard ran (at least one snap inside PF.process) - the precondition that makes the rest mean anything;
            - no input is snapped twice; the worker's own step runs no snap of its own; at most GUARD_ROUNDS + 3 snaps;
            - CONTROL: the same page with the memo defeated (snapOnce = the step itself) snaps more, with repeats -
              the instrument can see a repeat - and gives the same cells and the same palette counts.
     TEST 2 the same at size 8 on gapfixtures' THIN picture (size 8's rules).
     TEST 3 the bar: one Fix run through the page's own controls (fixLoad, fixRun) at 16, palette on, on GAPS: the
            bar's width takes at least three values strictly between 70% and 100%, never goes back, and the label
            names the palette check.
   On round 9b's page (gate9b.html) TEST 1 fails (5 snaps on 2 inputs: today's vote and the no-rule vote are the same
   cells at 16, each round's cells are snapped twice, and the worker's step repeats the last), TEST 2 likewise, and
   TEST 3 fails (the bar goes 0%, 70%, 100%). */
import { test, expect } from '@playwright/test';
import { FIX } from './gapfixtures.js';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixWorker === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
  await page.addScriptTag({ content: FIX });
};

/* one picture through an instrumented copy of the page's worker; defeat: the memo replaced by the step itself */
async function counted(page, which, step, defeat) {
  return page.evaluate(async ({ which, step, defeat }) => {
    const t = window.__g;
    t.set(step, true);
    const w0 = fixWorker(), text = await (await fetch(w0._url)).text();
    w0.terminate();
    const APPX = '\n;(function(){\n' +
      '  var S0 = snapToPalette, log = [], prog = [], ph = "glue";\n' +
      '  function hh(d, n){ var a = 0x811c9dc5 | 0, b = 0x9747b28c | 0, len = n * 4;\n' +
      '    for (var i = 0; i < len; i++){ a = Math.imul(a ^ d[i], 16777619); b = Math.imul(b ^ d[i], 0x5bd1e995) ^ (b >>> 15); }\n' +
      '    return (a >>> 0).toString(16) + "." + (b >>> 0).toString(16) + ":" + n; }\n' +
      '  snapToPalette = function(d, n, w, o){ log.push([ph, hh(d, n)]); return S0.apply(this, arguments); };\n' +
      '  var P0 = PF.process; PF.process = function(){ ph = "engine"; try { return P0.apply(this, arguments); } finally { ph = "glue"; } };\n' +
      '  var pm = postMessage;\n' +
      '  postMessage = function(m, tr){ if (m && m.progress != null) prog.push([m.progress, String(m.label)]);\n' +
      '    if (m && m.done) { m.done.__snaps = log; m.done.__prog = prog; log = []; prog = []; } return tr ? pm.call(self, m, tr) : pm.call(self, m); };\n' +
      (defeat ? '  if (typeof snapOnce === "function") snapOnce = function(step){ return step; };\n' : '') +
      '})();\n';
    const url = URL.createObjectURL(new Blob([text, APPX], { type: 'text/javascript' }));
    const w = new Worker(url);
    const rgba = which === 'thin' ? t.paintThin() : t.paintGaps();
    const msg = { data: new Uint8ClampedArray(rgba), width: 1280, height: 1280, palette: fixPalWanted() ? paletteRGB() : null,
      mode: fixMode(), forceStep: step, repair8: fixRepair8(step), lines16: fixLines16(step), rulesgate: fixLines16Gate() };
    const got = await new Promise(res => { w.onmessage = ev => { if (ev.data.done || ev.data.error) res(ev.data); }; w.postMessage(msg); });
    w.terminate(); URL.revokeObjectURL(url);
    if (!got.done) return { error: got.error || 'no answer' };
    const rounds = +((document.getElementById('pfcore').textContent.match(/var GUARD_ROUNDS = (\d+)/) || [])[1]);
    const s = got.done.__snaps, eng = s.filter(x => x[0] === 'engine'), glue = s.filter(x => x[0] === 'glue');
    const distinct = new Set(s.map(x => x[1])).size;
    let h = 0; const d = got.done.data; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return { palette: !!msg.palette, rounds, all: s.length, engine: eng.length, glue: glue.length, distinct,
      cells: (h >>> 0).toString(16) + ':' + d.length, pal: JSON.stringify(got.done.pal), prog: got.done.__prog };
  }, { which, step, defeat });
}

async function bounded(page, which, step) {
  const r = await counted(page, which, step, false);
  const c = await counted(page, which, step, true);
  console.log(which + ' at ' + step + ': ' + JSON.stringify({ all: r.all, engine: r.engine, glue: r.glue, distinct: r.distinct, rounds: r.rounds }) +
    '; memo defeated: ' + JSON.stringify({ all: c.all, engine: c.engine, glue: c.glue, distinct: c.distinct }));
  expect(r.error).toBeUndefined(); expect(c.error).toBeUndefined();
  expect(r.palette, 'the palette is on').toBe(true);
  expect(r.rounds, 'the page has a palette guard (GUARD_ROUNDS)').toBeGreaterThan(0);
  expect(r.engine, 'precondition: the guard ran (a snap inside PF.process)').toBeGreaterThan(0);
  expect(r.all, 'no input is snapped twice').toBe(r.distinct);
  expect(r.glue, 'the worker\'s own palette step reuses the guard\'s answer').toBe(0);
  expect(r.all, 'at most GUARD_ROUNDS + 3 snaps').toBeLessThanOrEqual(r.rounds + 3);
  /* the control: without the memo the instrument sees repeats, and the answer is the same */
  expect(c.all, 'CONTROL: with the memo defeated there are repeats to see').toBeGreaterThan(c.distinct);
  expect(c.cells, 'CONTROL: same cells with the memo defeated').toBe(r.cells);
  expect(c.pal, 'CONTROL: same palette counts with the memo defeated').toBe(r.pal);
  return r;
}

test.describe('one palette step per distinct picture', () => {
  test.setTimeout(240000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TEST 1 size 16, palette on: no picture snapped twice, the final step reuses the guard\'s answer', async ({ page }) => {
    await bounded(page, 'gaps', 16);
  });

  test('TEST 2 size 8, palette on: the same for size 8\'s rules', async ({ page }) => {
    await bounded(page, 'thin', 8);
  });

  test('TEST 3 the bar moves while the guard works', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = window.__g; const realToast = window.toast; window.toast = () => {};
      const bytes = await t.png(t.paintGaps());
      t.set(16, true);
      await fixLoad(fileWithPath(bytes, 'clothing/gaps.png'));
      const bar = $('fixbar'), label = $('fixlabel'), widths = [], labels = [];
      const mo = new MutationObserver(() => { widths.push(bar.style.width); labels.push(label.textContent); });
      mo.observe(bar, { attributes: true }); mo.observe(label, { childList: true, characterData: true, subtree: true });
      const out = await fixRun();
      mo.disconnect(); window.toast = realToast;
      return { ok: !!out, widths, labels };
    });
    console.log('bar: ' + r.widths.join(' ') + ' | labels: ' + [...new Set(r.labels)].join(' / '));
    expect(r.ok).toBe(true);
    const pc = r.widths.map(w => parseFloat(w)).filter(v => !isNaN(v));
    const mid = [...new Set(pc.filter(v => v > 70 && v < 100))];
    expect(mid.length, 'the bar takes at least three values between 70% and 100%').toBeGreaterThanOrEqual(3);
    /* up to its highest value: after the run the page hides the bar and sets it to 0 (fixProgress(null)) */
    const top = pc.lastIndexOf(Math.max(...pc));
    for (let i = 1; i <= top; i++) expect(pc[i], 'the bar never goes back').toBeGreaterThanOrEqual(pc[i - 1]);
    expect(r.labels.some(l => /palette/.test(l)), 'the label names the palette check').toBe(true);
  });
});
