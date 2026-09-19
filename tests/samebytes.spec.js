/* THE BATCH AND THE SINGLE SAVE PRODUCE THE SAME PICTURE - MEASURED.

   fixergrid.spec.js pins that both go through fixGridCanvas by reading the
   source text of fixDownload and fixBatch. The review pointed out that no
   test ever runs both on one picture and compares what comes out, so a
   batch result that differed from the single one - a second resize, a
   palette applied on one path only, a different cell count - would pass.
   This does: one picture through fixRun and through fixBatch under the
   same settings, decoded back to pixels and compared byte for byte, for a
   picture drawn in blocks and one with no grid, with Save at 1280 on and
   off, palette on. And a control that flips the switch between the two
   paths, so the comparison is shown to be able to fail. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* 96px drawn in 8px blocks of four colours (a measured block), or 320px with
   every pixel varying (no grid, the search decides). */
const blocks = `
  const W = 96, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  const pal = [[46, 34, 47], [139, 95, 191], [242, 166, 90], [232, 213, 183]];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (x < 16 && y < 16) continue;
    const k = (((x >> 3) * 5 + (y >> 3) * 3) % 4), i = (y * W + x) * 4;
    d[i] = pal[k][0]; d[i + 1] = pal[k][1]; d[i + 2] = pal[k][2]; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;
const gridless = `
  const W = 320, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 40; y < 280; y++) for (let x = 30; x < 290; x++) {
    const i = (y * W + x) * 4;
    d[i] = 120 + ((x * 7 + y * 13) & 15); d[i + 1] = 80 + ((x + y) & 7); d[i + 2] = 200 - ((x * 3) & 15); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;

/* Both paths on one picture. `flip` turns Save at 1280 off for the batch
   only - the control. Returns the decoded pixels of both saves. */
const bothWays = (page, src, gridOn, flip) => page.evaluate(async ({ src, gridOn, flip }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const file = () => new File([bytes], 'same.png', { type: 'image/png' });
  const decode = async (u8) => {
    const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
    const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const px = g.getImageData(0, 0, k.width, k.height).data;
    k.width = 1; k.height = 1;
    return { w: bm.width, h: bm.height, px: Array.from(px) };
  };
  const realToast = window.toast; window.toast = () => {};
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = true;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = gridOn;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '0';
  /* the single path: fixRun, then the canvas fixDownload writes */
  await fixLoad(file());
  const out = await fixRun();
  const oc = fixGridCanvas(out);
  const single = new Uint8Array(await (await new Promise(r => oc.toBlob(r, 'image/png'))).arrayBuffer());
  oc.width = 1; oc.height = 1;
  /* the batch path, same settings unless flipped */
  if (flip) document.getElementById('fixgrid').checked = !gridOn;
  await fixBatch([file()]);
  const batch = fixBatchFiles[0].data;
  window.toast = realToast;
  document.getElementById('fixgrid').checked = true; document.getElementById('fixpal').checked = false;
  const a = await decode(single), b = await decode(batch);
  let differ = 0;
  if (a.w === b.w && a.h === b.h) { for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) differ++; }
  return { cells: out.width, single: { w: a.w, h: a.h, bytes: single.length }, batch: { w: b.w, h: b.h, bytes: batch.length },
    sameSize: a.w === b.w && a.h === b.h, differ, sameBytes: single.length === batch.length && single.every((v, i) => v === batch[i]) };
}, { src, gridOn, flip });

test.describe('one picture, two paths', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  for (const [label, src, cells] of [['a picture drawn in 8px blocks', blocks, 12], ['a picture with no grid', gridless, 160]]) {
    test(label + ', Save at 1280 on: the batch save is the single save, pixel for pixel', async ({ page }) => {
      const r = await bothWays(page, src, true, false);
      expect(r.cells).toBe(cells);
      expect(r.single).toEqual({ w: 1280, h: 1280, bytes: r.single.bytes });
      expect(r.sameSize).toBe(true);
      expect(r.differ, 'pixels that differ between the two saves').toBe(0);
      expect(r.sameBytes, 'and the PNG bytes are the same bytes').toBe(true);
    });
    test(label + ', Save at 1280 off: still the same picture', async ({ page }) => {
      const r = await bothWays(page, src, false, false);
      expect(r.cells).toBe(cells);
      expect(r.single.w, 'saved at its own size').toBe(cells);
      expect(r.sameSize).toBe(true);
      expect(r.differ).toBe(0);
      expect(r.sameBytes).toBe(true);
    });
  }

  test('THE CONTROL: with the switch flipped between the two paths they differ', async ({ page }) => {
    const r = await bothWays(page, blocks, true, true);
    expect(r.single.w).toBe(1280);
    expect(r.batch.w, 'the batch saved at its own size instead').toBe(12);
    expect(r.sameSize, 'so the comparison above can fail').toBe(false);
  });
});
