/* A PICTURE NO BIGGER THAN THE GRID IS ALREADY AT ITS OWN SIZE.

   With Pixel size 0 and Snap on, a source narrower than the 160-cell grid
   with no block structure fell through every branch to the fast detector.
   Measured on the ten 128px raw sources on 2026-09-18: the detector
   answered 5 to 39 cells, two eyes traits came out completely empty (iou 0,
   100% of the silhouette lost), a 128-cell pixel-art scene came out as nine
   blocks. And the folder note counted them as "put on the coarsest grid
   that kept its shape ( cells)", with an empty list.

   Such a picture is native art at one pixel per cell. Measured: the
   identity, byte for byte, on all twelve sources at or below the grid. A
   picture that HAS a block keeps that block instead, even when its count
   cannot land on 1280 (the 96px fixture drawn at 4px: 24 cells), rather
   than being detected.

   THE CONTROL is the rule's edge: a 128px picture drawn in 8px blocks takes
   the measured branch as before and comes out at 16 cells, so a rule that
   kept everything small at one pixel per cell would fail it. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* One-pixel art with a transparent corner: no grid but 1. */
const native = (W) => `
  const W = ${W}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (x < 8 && y < 8) continue;
    const k = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const i = (y * W + x) * 4;
    d[i] = (k & 255); d[i + 1] = ((k >> 8) & 255); d[i + 2] = ((k >> 16) & 255); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;
const blocks = (W, cell) => `
  const W = ${W}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const n = W / ${cell};
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
  }
`;

const single = (page, src) => page.evaluate(async (src) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixpal').checked = false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '0';
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(new File([blob], 'small.png', { type: 'image/png' }));
  fixSizeHint();
  const hint = document.getElementById('fixsize').textContent;
  const out = await fixRun();
  window.toast = realToast;
  const src2 = FIX.src.data;
  let diff = -1;
  if (out.width === FIX.src.width) {
    diff = 0;
    for (let i = 0; i < src2.length; i += 4) {
      if (!src2[i + 3] && !out.data[i + 3]) continue;
      if (src2[i] !== out.data[i] || src2[i + 1] !== out.data[i + 1] || src2[i + 2] !== out.data[i + 2] || src2[i + 3] !== out.data[i + 3]) diff++;
    }
  }
  return { hint, cols: out.width, consensus: out.consensus, diff, said: document.getElementById('fixout').textContent };
}, src);

test.describe('a picture no bigger than the grid', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('IS KEPT AT ONE PIXEL PER CELL, byte for byte', async ({ page }) => {
    const r = await single(page, native(128));
    expect(r.cols).toBe(128);
    expect(r.diff, 'nothing changed').toBe(0);
    expect(r.consensus, 'and it is stamped as a measurement, not a guess').toBe('measured');
    expect(r.hint).toContain('128×128 pixels');
    expect(r.hint).toContain('cannot be snapped to 160 cells');
    expect(r.hint).toContain('so it is kept at one pixel per cell');
    expect(r.said).toContain('kept at one pixel per cell');
    expect(r.said, 'no advice to try a size that would destroy it').not.toContain('too small');
  });

  test('and one drawn in blocks keeps its blocks - the control', async ({ page }) => {
    const r = await single(page, blocks(128, 8));
    expect(r.cols, 'the measured branch, as before').toBe(16);
    expect(r.said).toContain('measured 8px blocks off the picture');
    expect(r.hint).toContain('so it keeps its own 8px blocks');
  });

  test('and the 96px sprite drawn at 4px keeps its 24 cells rather than being detected', async ({ page }) => {
    const r = await single(page, blocks(96, 4));
    expect(r.cols).toBe(24);
    expect(r.consensus).toBe('measured');
    expect(r.hint).toContain('24×24 pixels');
    expect(r.hint, 'uneven on the canvas, and said').toContain('uneven');
  });

  test('THE FOLDER NOTE COUNTS THEM AS KEPT, not as put on a grid', async ({ page }) => {
    const r = await page.evaluate(async ({ a, b }) => {
      const file = async (src, name) => {
        // eslint-disable-next-line no-new-func
        const cv = new Function(src + '\nreturn c;')();
        const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
        cv.width = 1; cv.height = 1;
        return new File([blob], name, { type: 'image/png' });
      };
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixsnap').checked = true;
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = false;
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '0';
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([await file(a, 'gazers.png'), await file(b, 'sprite.png')]);
      window.toast = realToast;
      return { cells: fixBatchFiles.map(x => x.cells), said: document.getElementById('fixbatchout').textContent, noGrid: fixNoGrid };
    }, { a: native(128), b: blocks(96, 4) });
    expect(r.cells).toEqual([128, 24]);
    expect(r.said).toContain('2 narrower than the 160 cell grid, so the snap could not be used on them: 1 kept at one pixel per cell, 1 kept on their own blocks');
    expect(r.noGrid, 'neither was put on a gridless count').toBe(0);
    expect(r.said).not.toContain('not drawn on any pixel grid');
    expect(r.said).not.toContain('( cells)');
    expect(r.said, 'the 96px one is uneven on the canvas and the cause is named').toContain('drawn in blocks the grid cannot hold');
  });
});
