/* THE PAGE ROUNDS A CELL COUNT THE WAY THE ENGINE DOES.

   The engine turns a forced step into a count with PF.rint - half to even,
   numpy's rule, matched to the Python reference in patch500. The page
   predicted the same count with Math.round, half up, so on an exact .5 the
   readout and the file disagreed: a 324px picture at Pixel size 8 with
   Save at 1280 off read "41x41 pixels" and came out 40 across (measured
   2026-09-18 on the one 324 source in the raw archive). Half-to-even is not
   "round down": 108 at 8 is 13.5 and both rules say 14, which is why that
   case is here as well - a fix that floored would fail it.

   The rule lives in fixRint, once; the last test loads the engine's own
   text and checks the two functions agree on 40,001 values, with a control
   showing the comparison can fail. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixRint === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A picture with no block structure (every painted pixel varies), W across,
   run at a typed 8 with Snap off and Save at 1280 off - the path where the
   typed number is source pixels per cell and W/8 is the count. Returns
   what the readout predicted and what the engine produced. */
const predictAndRun = (page, W) => page.evaluate(async (W) => {
  const c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    d[i] = 120 + ((x * 7 + y * 13) & 15); d[i + 1] = 80 + ((x + y) & 7); d[i + 2] = 200 - ((x * 3) & 15); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'w' + W + '.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = false;
  const sn = document.getElementById('fixsnap'); sn.checked = false; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = false; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '8'; f.dispatchEvent(new Event('input', { bubbles: true }));
  fixSizeHint();
  const said = document.getElementById('fixsize').textContent;
  const r = await fixRun();
  window.toast = realToast;
  gr.checked = true; sn.checked = true; f.value = '0';
  return { said, cols: r && r.width, rows: r && r.height };
}, W);

test.describe('the readout and the engine round alike', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('324 AT 8 IS 40.5, AND BOTH SAY 40', async ({ page }) => {
    const r = await predictAndRun(page, 324);
    expect(r.cols, 'the engine rounds half to even').toBe(40);
    expect(r.said, 'and the readout said the same before the run').toContain('→ 40×40 pixels');
    expect(r.said).not.toContain('41');
  });

  test('108 at 8 is 13.5, and both say 14 - half to EVEN, not down', async ({ page }) => {
    const r = await predictAndRun(page, 108);
    expect(r.cols).toBe(14);
    expect(r.said).toContain('→ 14×14 pixels');
  });

  test('and 320 at 8 is exactly 40 - the control, where no rounding happens', async ({ page }) => {
    const r = await predictAndRun(page, 320);
    expect(r.cols).toBe(40);
    expect(r.said).toContain('→ 40×40 pixels');
  });

  test('FIXRINT IS THE ENGINE\'S RINT: 40,001 values agree, and Math.round does not', async ({ page }) => {
    const r = await page.evaluate(() => {
      const text = document.getElementById('pfcore').textContent;
      // eslint-disable-next-line no-new-func
      const P = new Function('globalThis', text + '\nreturn globalThis.PF;')({});
      let diff = 0, roundDiff = 0, n = 0;
      for (let k = 0; k <= 40000; k++) {
        const x = k / 8; n++;
        if (P.rint(x) !== fixRint(x)) diff++;
        if (Math.round(x) !== P.rint(x)) roundDiff++;
      }
      return { n, diff, roundDiff, samples: [40.5, 13.5, 12.5, 0.5].map(x => [x, fixRint(x), P.rint(x)]) };
    });
    expect(r.n).toBe(40001);
    expect(r.diff, 'fixRint and PF.rint agree everywhere').toBe(0);
    /* THE CONTROL: the same loop can tell two rules apart. */
    expect(r.roundDiff, 'Math.round differs from the engine on every odd .5').toBeGreaterThan(1000);
    expect(r.samples).toEqual([[40.5, 40, 40], [13.5, 14, 14], [12.5, 12, 12], [0.5, 0, 0]]);
  });
});
