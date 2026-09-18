/* TRANSLUCENT PIXELS ARE SAID.

   The engine counts a pixel as paint when its alpha is over half and as
   clear otherwise, and writes every cell solid or empty - the collection
   has no translucency. That was silent: skins/Solana Hue Skin, a
   near-opaque overlay with 569,572 translucent pixels, came out a solid
   skin and the run said nothing (measured 2026-09-18). The sentence now
   says how many there were and how they were treated, the folder note
   counts the pictures, and scale mode - which keeps them - says the one
   true caveat, that the browser rounds their colour on the way in.

   The fixture puts alpha 127 on a row on purpose: the engine's line is
   "over half", so 127 counts as clear and 128 would count as paint. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixTranslucent === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* 64x64 in 8px rows of blocks: rows 0-1 opaque red; rows 2-3 green at alpha
   200 (1,024 px, paint); row 4 blue at alpha 127 (512 px, clear); row 5 blue
   at alpha 60 (512 px, clear); rows 6-7 empty. `opaque` makes rows 2-5 solid
   instead, for the control. */
const fixture = (opaque) => `
  const W = 64, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, row = y >> 3;
    if (row <= 1) { d[i] = 220; d[i + 1] = 40; d[i + 2] = 40; d[i + 3] = 255; }
    else if (row <= 3) { d[i] = 40; d[i + 1] = 200; d[i + 2] = 60; d[i + 3] = ${opaque ? 255 : 200}; }
    else if (row === 4) { d[i] = 40; d[i + 1] = 60; d[i + 2] = 220; d[i + 3] = ${opaque ? 255 : 127}; }
    else if (row === 5) { d[i] = 40; d[i + 1] = 60; d[i + 2] = 220; d[i + 3] = ${opaque ? 255 : 60}; }
  }
  g.putImageData(im, 0, 0);
`;

const single = (page, src, mode) => page.evaluate(async ({ src, mode }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'tl.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = mode;
  document.getElementById('fixpal').checked = false;
  const sn = document.getElementById('fixsnap'); sn.checked = false; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = false; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = mode === 'scale' ? '0' : '8';
  const r = await fixRun();
  window.toast = realToast;
  gr.checked = true; sn.checked = true; f.value = '0';
  const alphaAt = (x, y) => r.data[(y * r.width + x) * 4 + 3];
  return { said: document.getElementById('fixout').textContent, width: r.width, counted: FIX.translucent,
    alpha: mode === 'scale'
      ? { paint: alphaAt(3, 20), half: alphaAt(3, 36), faint: alphaAt(3, 44), solid: alphaAt(3, 4), empty: alphaAt(3, 60) }
      : { paint: alphaAt(0, 2), half: alphaAt(0, 4), faint: alphaAt(0, 5), solid: alphaAt(0, 0), empty: alphaAt(0, 7) } };
}, { src, mode });

const batch = (page, srcs, mode) => page.evaluate(async ({ srcs, mode }) => {
  const files = [];
  for (let k = 0; k < srcs.length; k++) {
    // eslint-disable-next-line no-new-func
    const c = new Function(srcs[k] + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    files.push(new File([blob], 'b' + k + '.png', { type: 'image/png' }));
  }
  document.getElementById('fixmode').value = mode;
  document.getElementById('fixpal').checked = false;
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  return document.getElementById('fixbatchout').textContent;
}, { srcs, mode });

test.describe('translucent pixels', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE RUN SAYS HOW MANY THERE WERE AND WHAT BECAME OF THEM', async ({ page }) => {
    const r = await single(page, fixture(false), 'fast');
    expect(r.counted).toEqual({ count: 2048, solid: 1024, clear: 1024 });
    expect(r.said).toMatch(/2,?048 translucent pixels: 1,?024 counted as paint, 1,?024 as clear - the result has none/);
    /* and that is what the engine did: over half became solid, half and under became clear */
    expect(r.width).toBe(8);
    expect(r.alpha).toEqual({ paint: 255, half: 0, faint: 0, solid: 255, empty: 0 });
  });

  test('and an opaque picture says nothing about translucency - the control', async ({ page }) => {
    const r = await single(page, fixture(true), 'fast');
    expect(r.counted).toEqual({ count: 0, solid: 0, clear: 0 });
    expect(r.said).not.toContain('translucent');
    expect(r.alpha).toEqual({ paint: 255, half: 255, faint: 255, solid: 255, empty: 0 });
  });

  test('SCALE MODE KEEPS THEM, and says they are not byte-exact', async ({ page }) => {
    const r = await single(page, fixture(false), 'scale');
    expect(r.width).toBe(64);
    expect(r.alpha, 'alpha comes through the canvas exactly').toEqual({ paint: 200, half: 127, faint: 60, solid: 255, empty: 0 });
    expect(r.said).toMatch(/2,?048 translucent pixels are kept translucent; the browser rounds their colour on the way in, so those are not byte-exact/);
    const o = await single(page, fixture(true), 'scale');
    expect(o.said).not.toContain('translucent');
  });

  test('THE FOLDER NOTE COUNTS THE PICTURES, in both modes', async ({ page }) => {
    const fixed = await batch(page, [fixture(false), fixture(true)], 'fast');
    expect(fixed).toMatch(/1 had translucent pixels \(2,?048 in all\), counted as paint or clear - the results have none/);
    const scaled = await batch(page, [fixture(false), fixture(true)], 'scale');
    expect(scaled).toMatch(/1 had translucent pixels \(2,?048 in all\), kept translucent - the browser rounds their colour on the way in/);
    const none = await batch(page, [fixture(true), fixture(true)], 'fast');
    expect(none).not.toContain('translucent');
  });
});
