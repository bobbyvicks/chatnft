/* THE RUN SAYS WHETHER THE RESULT IS READY FOR THE COLLECTION.

   The gate is four facts: 1280 square, the collection's cells (160), every
   colour in the project palette, no part-transparent pixel. The tab computed
   all four and said none of them, so the one question the tab is opened for -
   can this file go in - had to be worked out from the clauses beside it.

   Each test below drives a real run and reads the sentence. The fixtures are
   built so that exactly one fact fails at a time, and the first test is the
   control where none does: a test that only ever saw failures could not tell
   "never ready" from "ready when it should be". */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixGateOf === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A 1280 picture drawn in whole 8px blocks, in colours taken from the project
   palette, so the engine measures 160 cells and every colour is already on
   the palette: the gate's four facts all hold. `offPalette` swaps one block
   colour for one the palette does not hold. */
const art = (offPalette) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pal = paletteRGB();
  const pick = [pal[3], pal[17], pal[80], pal[200]].map(p => [p.r, p.g, p.b]);
  if (${offPalette ? 'true' : 'false'}) pick[1] = [1, 2, 3];
  const im = g.createImageData(W, W), d = im.data;
  for (let by = 0; by < 160; by++) for (let bx = 0; bx < 160; bx++) {
    if (bx < 20 && by < 20) continue;                 /* a transparent corner */
    const k = pick[(bx * 5 + by * 3) % pick.length];
    for (let y = by * 8; y < by * 8 + 8; y++) for (let x = bx * 8; x < bx * 8 + 8; x++) {
      const i = (y * W + x) * 4; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
`;

const single = (page, src, opts) => page.evaluate(async ({ src, opts }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'g.png', { type: 'image/png' }));
  document.getElementById('fixmode').value = opts.mode || 'fast';
  document.getElementById('fixpal').checked = !!opts.pal;
  const sn = document.getElementById('fixsnap'); sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = opts.grid !== false; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(opts.typed || 0);
  const r = await fixRun();
  window.toast = realToast;
  gr.checked = true; f.value = '0'; document.getElementById('fixmode').value = 'fast';
  return { said: document.getElementById('fixout').textContent, cells: r && r.width, gate: fixGateOf(r) };
}, { src, opts });

const batch = (page, srcs, opts) => page.evaluate(async ({ srcs, opts }) => {
  const files = [];
  for (let k = 0; k < srcs.length; k++) {
    // eslint-disable-next-line no-new-func
    const c = new Function(srcs[k] + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    files.push(new File([blob], 'b' + k + '.png', { type: 'image/png' }));
  }
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = !!opts.pal;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = opts.grid !== false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(opts.typed || 0);
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  document.getElementById('fixgrid').checked = true; f.value = '0';
  return document.getElementById('fixbatchout').textContent;
}, { srcs, opts });

test.describe('ready for the collection', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE CONTROL: art already on the grid and on the palette comes back ready', async ({ page }) => {
    const r = await single(page, art(false), { pal: false });
    expect(r.cells).toBe(160);
    expect(r.gate).toMatchObject({ ready: true, offPalette: 0, partial: 0 });
    expect(r.said).toContain('ready for the collection');
    expect(r.said).not.toContain('not ready');
  });

  test('AN OFF-PALETTE COLOUR STOPS IT, and the palette switch clears it', async ({ page }) => {
    const off = await single(page, art(true), { pal: false });
    expect(off.gate.ready).toBe(false);
    expect(off.gate.offPalette).toBe(1);
    expect(off.said).toMatch(/not ready for the collection: 1 colour off the palette/);
    /* the same picture with the switch on: the snap puts it on the palette */
    const on = await single(page, art(true), { pal: true });
    expect(on.gate).toMatchObject({ ready: true, offPalette: 0 });
    expect(on.said).toContain('ready for the collection');
    expect(on.said, 'and the palette clause and the gate agree').toContain('moved to the palette');
  });

  test('BLOCKS THAT ARE NOT 8px STOP IT', async ({ page }) => {
    /* typed 10 is 128 cells, so the saved canvas is 10px blocks and an 8px
       block straddles two of them */
    const r = await single(page, art(false), { pal: false, typed: 10 });
    expect(r.cells).toBe(128);
    expect(r.said).toMatch(/not ready for the collection: its 8px blocks are not one colour/);
  });

  test('and a finished 1280 trait through scale only is ready, untouched', async ({ page }) => {
    /* THE CASE THE FIRST DRAFT OF THE CHECK GOT WRONG: it asked whether the
       result was 160 cells, and this one is 1280 one-pixel cells - while
       being exactly what the collection holds. */
    const r = await single(page, art(false), { pal: false, mode: 'scale' });
    expect(r.cells).toBe(1280);
    expect(r.gate.ready).toBe(true);
    expect(r.said).toContain('ready for the collection');
    expect(r.said).not.toContain('not ready');
  });

  test('AND SO DOES NOT SAVING AT 1280', async ({ page }) => {
    const r = await single(page, art(false), { pal: false, grid: false, typed: 8 });
    expect(r.said).toMatch(/not ready for the collection: it is not saved at 1280/);
  });

  test('A PART-TRANSPARENT PIXEL STOPS IT - scale mode keeps them now', async ({ page }) => {
    /* ONE FACT AT A TIME: the half-transparent pixels fill whole 8px blocks,
       so the blocks stay flat and only the alpha fact fails. A first draft
       sprinkled them every 977th pixel, which broke the blocks as well and
       the sentence correctly gave two reasons. */
    const translucent = `
      const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      const pal = paletteRGB(); const k = pal[3];
      const im = g.createImageData(W, W), d = im.data;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, block = ((x >> 3) + (y >> 3)) % 37 === 0;
        d[i] = k.r; d[i + 1] = k.g; d[i + 2] = k.b; d[i + 3] = block ? 200 : 255;
      }
      g.putImageData(im, 0, 0);
    `;
    const r = await single(page, translucent, { pal: false, mode: 'scale' });
    expect(r.gate.partial).toBeGreaterThan(0);
    expect(r.said).toMatch(/not ready for the collection: [\d,]+ part-transparent pixels/);
  });

  test('THE FOLDER RUN COUNTS THEM, and names what held the rest back', async ({ page }) => {
    const note = await batch(page, [art(false), art(false), art(true)], { pal: false });
    expect(note).toMatch(/2 of 3 ready for the collection \(1 because it has colours off the palette\)/);
    const all = await batch(page, [art(false), art(false)], { pal: false });
    expect(all).toMatch(/2 of 2 ready for the collection/);
    expect(all).not.toContain('(');
  });
});
