/* THE SNAP THAT DID NOTHING, AND THE BRUSH THAT LOST THE GRID.

   "its the snap button" / "when we used to open in editor it used the brush
   size and there was grid snapping. it works 1/10 of the time when im trying
   to edit a skin"

   Two defects, both mine, both silent.

   The snap refused anything under 640px wide and fell through to the
   detectors without saying so - box ticked, label reading "Snap to the 160
   cell grid", detector deciding. Measured with that floor in place:

     source   applied   cells
       160      NO        20
       320      NO        40
       512      NO        64
       640      yes      160

   And opening a result in the editor at 1280 left gridBlock at 1, so the
   brush painted an eighth of a collection pixel and strokes landed between
   cells. At the old 160 canvas that was right by accident: one art pixel WAS
   one cell. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Pixel art at any width, blocks dividing it so the picture is never the
   reason an answer is odd. */
const make = (W) => `
  const cell = (${W} % 8 === 0) ? 8 : 1;
  const c = document.createElement('canvas');
  c.width = ${W}; c.height = ${W};
  const g = c.getContext('2d');
  const n = Math.floor(${W} / cell);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (x * 5 + y * 3) % 4;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][k];
    g.fillRect(x * cell, y * cell, cell, cell);
  }
`;

const runAt = (page, W) => page.evaluate(async ({ src, W }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixsnap').dispatchEvent(new Event('change', { bubbles: true }));
  const ff = document.getElementById('fixforce');
  ff.disabled = false; ff.value = '0';
  ff.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  const applied = fixSnapStep(W) > 0;
  await fixBatch([new File([b], 'w.png', { type: 'image/png' })]);
  const got = fixBatchFiles[0];
  /* Read the blocks back off the saved file rather than trusting the count. */
  const bm = await createImageBitmap(new Blob([got.data], { type: 'image/png' }));
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
  const gg = cv.getContext('2d', { willReadFrequently: true });
  gg.drawImage(bm, 0, 0); if (bm.close) bm.close();
  const d = gg.getImageData(0, 0, cv.width, cv.height).data;
  const OW = cv.width; cv.width = 1; cv.height = 1;
  const N = OW / got.cells;
  let ragged = -1;
  if (Number.isInteger(N)) {
    ragged = 0;
    for (let by = 0; by + N <= OW; by += N) for (let bx = 0; bx + N <= OW; bx += N) {
      const i0 = (by * OW + bx) * 4;
      let m = false;
      for (let y = by; y < by + N && !m; y++) for (let x = bx; x < bx + N; x++) {
        const i = (y * OW + x) * 4;
        if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1]
          || d[i + 2] !== d[i0 + 2] || d[i + 3] !== d[i0 + 3]) { m = true; break; }
      }
      if (m) ragged++;
    }
  }
  return { applied, cells: got.cells, saved: got.w + 'x' + got.h, N, ragged,
    said: document.getElementById('fixbatchout').textContent };
}, { src: make(W), W });

test('THE SNAP DECIDES AT EVERY SIZE, AND THE BLOCKS COME OUT SQUARE', async ({ page }) => {
  await ready(page);
  const bad = [];
  for (const W of [160, 320, 512, 640, 768, 1024, 1254, 1280]) {
    const r = await runAt(page, W);
    /* WAS cells === 160 at every size. That assertion outlived what it was
       for: it was written to catch a floor that let sizes under 640 fall
       through to the detectors while the box read "Snap to the 160 cell
       grid", and it pinned the forced count as a side effect. The snap now
       measures the picture, so a 1024 drawn in 8px blocks lands on 128 cells
       and keeps every one of them - flattening that onto 160 is the thing
       that was deleting art.

       What still has to hold at every size is what the floor broke: the snap
       decides rather than the detectors, the count divides 1280, and the
       blocks are square on the canvas. */
    if (!r.applied) bad.push(W + ': the snap did not decide');
    else if (r.saved !== '1280x1280') bad.push(W + ': saved ' + r.saved);
    else if (!Number.isInteger(1280 / r.cells))
      bad.push(W + ': ' + r.cells + ' cells do not divide 1280');
    else if (r.ragged !== 0) bad.push(W + ': ' + r.ragged + ' ragged blocks');
  }
  expect(bad).toEqual([]);
});

test('and refuses only where it would have to invent detail', async ({ page }) => {
  await ready(page);
  const r = await runAt(page, 128);
  /* THE CONTROL. A snap that applied to everything would pass the test above
     and would be upsampling a 128px picture into 160 cells - inventing
     thirty-two cells nobody drew. */
  expect(r.applied, '128 is narrower than the grid').toBe(false);
  expect(r.cells).not.toBe(160);
});

test('and when it cannot, it says so instead of quietly not doing it', async ({ page }) => {
  await ready(page);
  const r = await runAt(page, 128);
  /* Falling through to the detectors while the box reads "Snap to the 160
     cell grid" is worse than refusing: the run looked identical to one that
     honoured the setting. */
  expect(r.said).toContain('could not be used');
});

test('the readout says it too, before anything runs', async ({ page }) => {
  await ready(page);
  const said = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    document.getElementById('fixsnap').checked = true;
    document.getElementById('fixgrid').checked = true;
    await fixLoad(new File([b], 'small.png', { type: 'image/png' }));
    fixSizeHint();
    return document.getElementById('fixsize').textContent;
  }, make(128));
  expect(said).toContain('cannot be snapped');
  expect(said).toContain('160');
});

test('OPENING IN THE EDITOR KEEPS THE BRUSH ON THE GRID', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
    document.getElementById('fixgrid').checked = true;
    const out = await fixRun();
    fixOpen();
    await new Promise(res => setTimeout(res, 250));
    return { cells: out.width, canvas: art.width, block: gridBlock,
      brush: document.getElementById('bslab').textContent };
  }, make(1280));
  /* 160 cells written onto 1280 makes one collection pixel eight across, so
     that is what a stroke has to be. A canvas of 1280 with a block of 1 is
     an eighth of a pixel per stroke, which is what editing a skin felt like. */
  expect(r.cells).toBe(160);
  expect(r.canvas).toBe(1280);
  expect(r.block, 'the editor knows what the art is drawn in').toBe(8);
  expect(r.brush).toBe('8 × 8');
});

test('and a native-size open is still one pixel, as it always was', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
    document.getElementById('fixgrid').checked = false;
    await fixRun();
    fixOpen();
    await new Promise(res => setTimeout(res, 250));
    return { canvas: art.width, block: gridBlock,
      brush: document.getElementById('bslab').textContent };
  }, make(1280));
  /* THE CONTROL. A version that always said 8 would pass the test above and
     be wrong here, where one art pixel really is one cell. */
  expect(r.canvas).toBe(160);
  expect(r.block).toBe(1);
  expect(r.brush).toBe('1 × 1');
});

test('the block is arithmetic, not a measurement', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => ({
    at1280from160: fixBlockFor(160, 1280),
    at1280from128: fixBlockFor(128, 1280),
    native: fixBlockFor(160, 160),
    silly: fixBlockFor(0, 1280),
  }));
  /* Known from the two numbers the save already has, so it cannot disagree
     with what was written. */
  expect(r.at1280from160).toBe(8);
  expect(r.at1280from128).toBe(10);
  expect(r.native, 'one art pixel is one cell').toBe(1);
  expect(r.silly, 'and nonsense is 1 rather than NaN').toBe(1);
});
