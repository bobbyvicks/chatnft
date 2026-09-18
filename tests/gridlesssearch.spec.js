/* THE SEARCH FOR A GRID ON A PICTURE THAT HAS NONE.

   With Pixel size 0 a picture with no block structure is put on the
   coarsest of 160, 256, 320 and 640 cells that keeps its shape and 95% of
   its paint. Four defects in that search, measured on 2026-09-18:

   - it counted pixels twice whenever the source width did not divide the
     candidate (every 1254 source: kept/total came to 1.27), so the 95% rule
     could not fail and 16 of 86 raw sources landed on a grid the engine
     keeps 88% on;
   - when nothing passed it returned the finest count (640, 2px pixels)
     even where a coarser one kept more (10 of the 15 working traits that
     fell through);
   - the shape test was the raw bounding box, so one stray 2x2 dot far from
     the art failed every candidate and sent a hoodie that kept 99% at 8px
     to 2px cells;
   - and none of that was said: passed and fallen-through pictures got the
     same sentence, and marks smaller than a cell were dropped silently.

   Every fixture here was run in node under the old rule and the new one
   before it was written down, so each test is known to give the old answer
   on the old code. Also here: one stray pixel a block no longer reads as
   "no grid", and a drawn line across a boundary still does. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A: 1254 - a 20px frame at the extremes (so the box survives), a solid
   square, and 13 lines 6px thick every 16px. At 160 cells (7.84px) the
   lines mostly lose the vote: 92% kept. At 256 (4.9px) they mostly win:
   96%. The old double count read 160 as passing.

   EVERY PAINTED PIXEL VARIES A LITTLE, here and in C, because a flat
   picture whose edges all fall on even coordinates IS 2px art: the block
   measurement takes it before the search runs (measured: the first draft
   of these fixtures came back at 640 and 160 cells for that reason and
   never reached the code under test). Real gridless traits vary per pixel. */
const A = `
  const W = 1254, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  const put = (x, y) => { const i = (y * W + x) * 4; d[i] = 200 + ((x * 7 + y * 13) & 3); d[i + 1] = 60 + ((x + y) & 1); d[i + 2] = 60; d[i + 3] = 255; };
  for (let y = 100; y < 1100; y++) for (let x = 100; x < 1100; x++) if (x < 120 || x >= 1080 || y < 120 || y >= 1080) put(x, y);
  for (let y = 400; y < 900; y++) for (let x = 300; x < 900; x++) put(x, y);
  for (let k = 0; k < 13; k++) { const y = 150 + k * 16; for (let x = 300; x < 900; x++) for (let q = 0; q < 6; q++) put(x, y + q); }
  g.putImageData(im, 0, 0);
`;
/* B: 1280 - 3px stripes with 1px gaps (256 and 320 keep them whole, 640
   halves them) plus a 1px line 100 long far away, so every candidate is
   "FAR" and the search falls through. Old answer 640; the count that kept
   the most is 256. */
const B = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  const put = (x, y) => { const i = (y * W + x) * 4; d[i] = 30; d[i + 1] = 30; d[i + 2] = 200; d[i + 3] = 255; };
  for (let y = 400; y < 800; y++) for (let x = 300; x < 900; x++) if ((x - 300) % 4 !== 3) put(x, y);
  for (let x = 1100; x < 1200; x++) put(x, 100);
  g.putImageData(im, 0, 0);
`;
/* C: 1280 - a solid block and one 2x2 dot 600px away. Old answer 640
   (the dot moved the box at every coarser count); now 160, and the dot is
   reported as a dropped mark. */
const C = `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  const put = (x, y) => { const i = (y * W + x) * 4; d[i] = 30 + ((x * 7 + y * 13) & 3); d[i + 1] = 200 + ((x + y) & 1); d[i + 2] = 60; d[i + 3] = 255; };
  for (let y = 400; y < 800; y++) for (let x = 300; x < 900; x++) put(x, y);
  put(1200, 100); put(1201, 100); put(1200, 101); put(1201, 101);
  g.putImageData(im, 0, 0);
`;
/* D: 1280 8px art in four colours; `noisy` puts one pixel a channel off in
   one block of every hundred; `line` draws a 2px line across boundaries. */
const D = (noisy, line) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (x < 320 && y < 320) continue;
    const k = ((x >> 3) * 5 + (y >> 3) * 3) % 4, i = (y * W + x) * 4;
    d[i] = [46, 139, 242, 232][k]; d[i + 1] = [34, 95, 166, 213][k]; d[i + 2] = [47, 191, 90, 183][k]; d[i + 3] = 255;
  }
  if (${noisy ? 'true' : 'false'}) { let n = 0; for (let by = 320; by < W; by += 8) for (let bx = 0; bx < W; bx += 8) { if (++n % 100) continue; const i = ((by + 3) * W + bx + 4) * 4; d[i + 1] = (d[i + 1] + 1) & 255; } }
  if (${line ? 'true' : 'false'}) { for (let x = 400; x < 800; x++) for (let y = 603; y < 605; y++) { const i = (y * W + x) * 4; d[i] = 7; d[i + 1] = 7; d[i + 2] = 7; d[i + 3] = 255; } }
  g.putImageData(im, 0, 0);
`;

const batch = (page, srcs) => page.evaluate(async (srcs) => {
  const files = [];
  for (let k = 0; k < srcs.length; k++) {
    // eslint-disable-next-line no-new-func
    const c = new Function(srcs[k] + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    files.push(new File([blob], 'f' + k + '.png', { type: 'image/png' }));
  }
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  document.getElementById('fixpal').checked = false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = '0';
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  return { cells: fixBatchFiles.map(x => x.cells), said: document.getElementById('fixbatchout').textContent };
}, srcs);

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
  await fixLoad(new File([blob], 'one.png', { type: 'image/png' }));
  const r = await fixRun();
  window.toast = realToast;
  return { cols: r.width, consensus: r.consensus, said: document.getElementById('fixout').textContent, noisy: fixNativeNoisy };
}, src);

test.describe('the search for a grid', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('COUNTS EACH PIXEL ONCE, so a 1254 source that keeps 92% at 160 is not put there', async ({ page }) => {
    const r = await batch(page, [A]);
    expect(r.cells, 'the first count that really keeps 95% is 256').toEqual([256]);
    expect(r.said).toContain('1 are not drawn on any pixel grid: 1 put on the coarsest grid that kept its shape and 95% of its paint (256 cells)');
  });

  test('WHEN NOTHING PASSES, KEEPS THE COUNT THAT KEPT THE MOST, not the finest', async ({ page }) => {
    const r = await batch(page, [B]);
    expect(r.cells, 'stripes with 1px gaps: 256 keeps 99.9%, 640 keeps 67%').toEqual([256]);
    expect(r.said).toContain('kept no more than');
    expect(r.said).toContain('put on the count that kept the most (256 cells)');
    expect(r.said).not.toContain('kept its shape');
  });

  test('LEAVES A STRAY OUT OF THE SHAPE, and says it was dropped', async ({ page }) => {
    const r = await batch(page, [C]);
    expect(r.cells, 'the block keeps everything at 160; the dot no longer decides').toEqual([160]);
    expect(r.said).toContain('1 mark smaller than a cell was dropped on 1 picture');
    expect(r.said).toContain('kept its shape and 95% of its paint (160 cells)');
  });

  test('and the single run says what the search found, with no advice to try a size it measured as worse', async ({ page }) => {
    const r = await single(page, C);
    expect(r.cols).toBe(160);
    expect(r.said).toContain('no pixel grid found; put on 160 cells, which kept');
    expect(r.said).toContain('1 mark smaller than a cell was dropped');
    expect(r.said).not.toContain('Try ');
    const b = await single(page, B);
    expect(b.cols).toBe(256);
    expect(b.said).toContain('the count that kept the most');
    expect(b.said).toContain('none kept 95%');
  });

  test('ONE STRAY PIXEL A BLOCK STILL MEASURES AS THE BLOCK, and a drawn line across a boundary does not', async ({ page }) => {
    const exact = await single(page, D(false, false));
    expect(exact.cols).toBe(160);
    expect(exact.consensus).toBe('measured');
    expect(exact.said).toContain('measured 8px blocks off the picture');
    expect(exact.said).not.toContain('stray pixel');
    const noisy = await single(page, D(true, false));
    expect(noisy.cols, 'still 8px art').toBe(160);
    expect(noisy.consensus).toBe('measured');
    expect(noisy.noisy).toBeGreaterThan(0);
    expect(noisy.said).toMatch(/measured 8px blocks off the picture \(\d+ blocks had one stray pixel\)/);
    /* THE CONTROL: two pixels a block is a drawing, not noise */
    const line = await single(page, D(true, true));
    expect(line.consensus, 'a line across the boundary is not one stray pixel').not.toBe('measured');
  });
});
