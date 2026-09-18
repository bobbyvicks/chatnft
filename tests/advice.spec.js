/* THE ADVICE IS MEASURED, AND SPEAKS THE SWITCH'S UNITS.

   After a run that came out bigger than pixel art gets, the sentence
   offers sizes to try. It offered them in picture pixels per cell even
   with Save at 1280 on, where a typed 8 means 160 cells whatever the
   picture is - "8 gives 157x157" on a 1254 picture - and it said nothing
   about what each size would keep, though the gridless search has a rule
   for exactly that. Now each offered size is the count the run would use
   (fixCanvasCells, the same function the run calls) and carries the paint
   it would keep (fixCellsKept, the search's own rule).

   Two fixtures with different answers, so a constant would show: a solid
   square keeps 100% at every size; a square plus a field of sparse dots
   keeps less, and the sentence has to match what fixCellsKept says. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixCellsKept === 'function' && typeof fixCanvasCells === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* 1254 across: a 600px solid square, and with `dots` a 600x600 field beside
   it holding a 2x2 dot every 8px (a minority in every 7.84px cell, so those
   cells come out empty and the dots are paint the size would lose). Every
   painted pixel varies so no block is measured. */
const fixture = (dots) => `
  const W = 1254, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  const put = (x, y) => { const i = (y * W + x) * 4; d[i] = 200 + ((x * 7 + y * 13) & 3); d[i + 1] = 60 + ((x + y) & 1); d[i + 2] = 60; d[i + 3] = 255; };
  for (let y = 100; y < 700; y++) for (let x = 20; x < 620; x++) put(x, y);
  if (${dots ? 'true' : 'false'}) for (let y = 100; y < 700; y += 8) for (let x = 640; x < 1240; x += 8) { put(x, y); put(x + 1, y); put(x, y + 1); put(x + 1, y + 1); }
  g.putImageData(im, 0, 0);
`;

const run = (page, src, gridOn, typed, counts) => page.evaluate(async ({ src, gridOn, typed, counts }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'adv.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  const sn = document.getElementById('fixsnap'); sn.checked = false; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = gridOn; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(typed);
  const r = await fixRun();
  const measured = {};
  for (const cells of counts) { const k = fixCellsKept(FIX.src.data, FIX.src.width, FIX.src.height, cells); measured[cells] = Math.round(k.kept / k.srcN * 100); }
  window.toast = realToast;
  gr.checked = true; sn.checked = true; f.value = '0';
  return { width: r && r.width, said: document.getElementById('fixout').textContent, measured };
}, { src, gridOn, typed, counts });

test.describe('the sizes the run offers', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('WITH SAVE AT 1280 ON THEY ARE CELL COUNTS ON THE CANVAS, each with what it keeps', async ({ page }) => {
    const r = await run(page, fixture(true), true, 2, [160, 128, 80]);
    expect(r.width, 'typed 2 on the canvas is 640 cells, which is big').toBe(640);
    expect(r.said).toContain('too small');
    expect(r.said, 'the run\'s own arithmetic: 8 is 160 cells, 12 moves to 10 (128), 16 is 80')
      .toMatch(/Try 8 \(160 cells, keeps \d+% of the paint\), 10 \(128 cells, keeps \d+% of the paint\), 16 \(80 cells, keeps \d+% of the paint\)\./);
    expect(r.said, 'not picture pixels per cell').not.toMatch(/157|gives/);
    /* THE NUMBERS ARE THE SEARCH'S OWN MEASUREMENT of this picture. */
    const said = {}; for (const m of r.said.matchAll(/\((\d+) cells, keeps (\d+)%/g)) said[m[1]] = +m[2];
    expect(said).toEqual({ 160: r.measured[160], 128: r.measured[128], 80: r.measured[80] });
    expect(r.measured[160], 'and the dots really are lost at 160 cells').toBeLessThan(100);
    expect(r.measured[160]).toBeGreaterThan(80);
  });

  test('and a solid picture keeps nearly all of it at every size - the control against a constant', async ({ page }) => {
    /* Not exactly 100: 7.84px cells do not line up with a square drawn on
       whole pixels, and an edge cell that is less than half paint is
       dropped. The first draft of this test expected 100 and measured 99
       at 160 cells - the number is whatever the rule says, which is the
       point; the sentence has to print that number. */
    const r = await run(page, fixture(false), true, 2, [160, 128, 80]);
    expect(r.width).toBe(640);
    const said = {}; for (const m of r.said.matchAll(/\((\d+) cells, keeps (\d+)%/g)) said[m[1]] = +m[2];
    expect(said).toEqual({ 160: r.measured[160], 128: r.measured[128], 80: r.measured[80] });
    for (const cells of [160, 128, 80]) expect(r.measured[cells], 'a solid square keeps nearly everything').toBeGreaterThanOrEqual(99);
  });

  test('WITH THE SWITCH OFF THEY ARE PICTURE PIXELS PER CELL, still measured', async ({ page }) => {
    /* typed 1 with the switch off: the result is the picture itself, 1254
       across, which is big; the divisors of 1254 nearest 8, 12 and 16 are
       6, 11 and 19 (1254 = 2 x 3 x 11 x 19), giving 209, 114 and 66 cells. */
    const r = await run(page, fixture(true), false, 1, [209, 114, 66]);
    expect(r.width).toBe(1254);
    expect(r.said).toMatch(/Try 6 gives 209×209 \(keeps \d+% of the paint\), 11 gives 114×114 \(keeps \d+% of the paint\), 19 gives 66×66 \(keeps \d+% of the paint\)\./);
    const pct = [...r.said.matchAll(/keeps (\d+)%/g)].map(m => +m[1]);
    expect(pct, 'the numbers are the rule\'s own, at those counts').toEqual([r.measured[209], r.measured[114], r.measured[66]]);
    /* The dots are a minority in every cell at every offered size, so all
       three lose them; how much is not monotone in the count (the first
       draft assumed it was and measured 93 at 114 cells against 94 at 66). */
    for (const p of pct) { expect(p).toBeLessThan(100); expect(p).toBeGreaterThan(80); }
  });

  test('THE RUN AND THE ADVICE USE ONE ARITHMETIC: fixCanvasCells is what fixStepFor uses', async ({ page }) => {
    const r = await page.evaluate(() => {
      const on = [1, 2, 4, 8, 10, 12, 16, 20, 40, 3, 7].map(s => [s, fixCanvasCells(s)]);
      return { on, src: String(fixStepFor).indexOf('fixCanvasCells(asked)') >= 0 };
    });
    expect(r.src, 'the decision calls it').toBe(true);
    const by = Object.fromEntries(r.on.map(([s, c]) => [s, c.cells + (c.moved ? '<-' + c.moved.from : '')]));
    /* 3 means 427 cells and nothing within a quarter of that divides 1280;
       7 means 183 and 160 is within a quarter, so it moves to 8. */
    expect(by).toEqual({ 1: '1280', 2: '640', 4: '320', 8: '160', 10: '128', 12: '128<-12', 16: '80', 20: '64', 40: '32', 3: '0', 7: '160<-7' });
  });
});
