/* A PIXEL SIZE THAT CAN ACTUALLY PRODUCE A PIXEL.

   "when i imput a folder it just makes it 1x1 every time no matter what i put
   into the pixel sizing" / "it only keeps pixels 1x1 did you even try turning
   it to 12x12 and checking?"

   Turning it to 12 and checking was exactly what was missing, and checking
   means reading the BLOCK size of the output - 1280x1280 is 1280x1280 whether
   its pixels are eight across or one. Measured before the fix, three real
   skins through the folder import:

     snap on, field 0     pixel size 8
     snap off, field 12   pixel size 1
     snap off, field 8    pixel size 8

   1280/12 is 106.67, so 12 gives 107 cells, and 107 cells on a 1280 canvas
   makes blocks 11.96 wide - a ragged edge every twelfth pixel rather than a
   pixel. Every test here measures the block, never the canvas. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* Pixel art at 1280 on an 8px grid, which is what the library is. */
const source = () => `
  const W = 1280, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d');
  const cell = 8, n = W / cell;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (x * 5 + y * 3) % 4;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][k];
    g.fillRect(x * cell, y * cell, cell, cell);
  }
`;

/* The largest N dividing the width for which every NxN square is one colour -
   the pixel size a person actually sees. */
const BLOCK_FN = `
  const blockOf = async (bytes) => {
    const bm = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const W = bm.width, H = bm.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const gg = cv.getContext('2d', { willReadFrequently: true });
    gg.drawImage(bm, 0, 0); if (bm.close) bm.close();
    const d = gg.getImageData(0, 0, W, H).data;
    cv.width = 1; cv.height = 1;
    const uniform = (N) => {
      for (let by = 0; by < H; by += N) for (let bx = 0; bx < W; bx += N) {
        const i0 = (by * W + bx) * 4;
        for (let y = by; y < by + N && y < H; y++)
          for (let x = bx; x < bx + N && x < W; x++) {
            const i = (y * W + x) * 4;
            if (d[i] !== d[i0] || d[i+1] !== d[i0+1]
              || d[i+2] !== d[i0+2] || d[i+3] !== d[i0+3]) return false;
          }
      }
      return true;
    };
    let best = 1;
    for (let N = 2; N <= 64; N++) if (W % N === 0 && uniform(N)) best = N;
    return best;
  };
`;

const batchAt = (page, { snap, force }) => page.evaluate(async ({ snap, force, src, blk }) => {
  // eslint-disable-next-line no-new-func
  const make = new Function(src + '\nreturn c;');
  const c = make();
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  document.getElementById('fixsnap').checked = snap;
  document.getElementById('fixsnap').dispatchEvent(new Event('change', { bubbles: true }));
  const ff = document.getElementById('fixforce');
  ff.disabled = false; ff.value = String(force);
  ff.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('fixgrid').checked = true;
  await fixBatch([new File([b], 'trait.png', { type: 'image/png' })]);
  // eslint-disable-next-line no-new-func
  const blockOf = new Function(blk + '\nreturn blockOf;')();
  return { block: await blockOf(fixBatchFiles[0].data),
    saved: fixBatchFiles[0].w + 'x' + fixBatchFiles[0].h,
    cells: fixBatchFiles[0].cells,
    said: document.getElementById('fixbatchout').textContent };
}, { snap, force, src: source(), blk: BLOCK_FN });

test('A SIZE THAT CANNOT LAND IS MOVED TO ONE THAT CAN', async ({ page }) => {
  await ready(page);
  const r = await batchAt(page, { snap: false, force: 12 });
  /* 12 gave a block of 1 before this. The nearest count that divides 1280 is
     128, and 1280/128 is 10. */
  expect(r.block, 'the pixels are square and 10 across').toBe(10);
  expect(r.saved).toBe('1280x1280');
  expect(r.cells).toBe(128);
});

test('and it says so, because the batch had no readout at all', async ({ page }) => {
  await ready(page);
  const r = await batchAt(page, { snap: false, force: 12 });
  /* fixSizeHint writes off FIX.src and a folder import never sets it, so the
     one path that applies a size to three hundred files was the one path that
     said nothing. Silently honouring 12 into mush is the thing to avoid. */
  expect(r.said).toContain('pixel size 10');
  expect(r.said).toContain('not 12');
});

test('a size that already lands is left exactly alone', async ({ page }) => {
  await ready(page);
  const r = await batchAt(page, { snap: false, force: 8 });
  /* THE CONTROL. Moving every size would also make the test above pass, and
     would quietly change what was asked for on the sizes that were fine. */
  expect(r.block).toBe(8);
  expect(r.cells).toBe(160);
  expect(r.said, 'nothing was moved, so nothing is said about moving')
    .not.toContain('not 8');
});

test('the snap still wins, and still lands on the grid', async ({ page }) => {
  await ready(page);
  const r = await batchAt(page, { snap: true, force: 12 });
  /* Snap is the default and decides the count; the typed 12 is not consulted,
     which is exactly why the box must not look live. */
  expect(r.block).toBe(8);
  expect(r.cells).toBe(160);
});

test('THE PIXEL SIZE BOX DOES NOT LOOK LIVE WHILE THE SNAP DECIDES', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    const atStart = document.getElementById('fixforce').disabled;
    await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
    return { atStart, afterLoad: document.getElementById('fixforce').disabled,
      snap: document.getElementById('fixsnap').checked };
  }, source());
  expect(r.snap, 'the snap is on by default').toBe(true);
  /* fixModeUI decides this and only ran when a CONTROL moved. A picture
     arriving changes whether the snap applies, and nobody asked again - so
     the box invited a number and nothing read it. */
  expect(r.afterLoad, 'greyed out once a picture makes the snap apply').toBe(true);
});

test('and it comes back the moment the snap stops deciding', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-new-func
    const c = new Function(src + '\nreturn c;')();
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    c.width = 1; c.height = 1;
    await fixLoad(new File([b], 'trait.png', { type: 'image/png' }));
    const on = document.getElementById('fixforce').disabled;
    const s = document.getElementById('fixsnap');
    s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true }));
    return { on, off: document.getElementById('fixforce').disabled };
  }, source());
  /* THE POSITIVE CONTROL. A box that is always disabled would pass the test
     above and be worse than the defect. */
  expect(r.on).toBe(true);
  expect(r.off, 'live again when it decides something').toBe(false);
});

test('a detected count that cannot land is reported, not passed off as fine',
  async ({ page }) => {
    await ready(page);
    /* Nothing typed, no snap: the detectors answer whatever the picture says,
       and nothing makes that divide 1280. It is not moved - that would mean
       detecting twice - but a run that produced ragged pixels must not look
       like a run that worked. */
    const r = await page.evaluate(async ({ src, blk }) => {
      // eslint-disable-next-line no-new-func
      const c = new Function(src + '\nreturn c;')();
      const b = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      const s = document.getElementById('fixsnap');
      s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true }));
      const ff = document.getElementById('fixforce');
      ff.disabled = false; ff.value = '0';
      ff.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('fixgrid').checked = true;
      await fixBatch([new File([b], 'trait.png', { type: 'image/png' })]);
      // eslint-disable-next-line no-new-func
      const blockOf = new Function(blk + '\nreturn blockOf;')();
      const cells = fixBatchFiles[0].cells;
      return { cells, divides: 1280 % cells === 0,
        block: await blockOf(fixBatchFiles[0].data),
        said: document.getElementById('fixbatchout').textContent };
    }, { src: source(), blk: BLOCK_FN });
    if (!r.divides) {
      expect(r.said, 'a count that cannot land is named').toContain('does not divide 1280');
    } else {
      /* If the detector happened to land on a divisor there is nothing to
         report, and saying so anyway would be the false warning that poisons
         the true ones beside it. */
      expect(r.said).not.toContain('does not divide');
      expect(1280 % r.block).toBe(0);
    }
  });

test('a move that would be a fraction of a source pixel is refused', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    /* A 96px source drawn in whole 4px blocks: 24 cells. 24 does not divide
       1280, and the nearest count that does is 20 - a step of 4.8, which
       slices every block the picture is made of. A first version did exactly
       that, which is worse than the ragged edge it was fixing. */
    const bad = fixWholeStep(96, 4);
    /* And a move that is not a fraction but IS a different picture: 1020 at
       12 wants 85 cells, and the only counts dividing both 1020 and 1280 are
       1, 2, 4, 5, 10 and 20. */
    const far = fixWholeStep(1020, 12);
    /* The case this exists for, which must still move. */
    const good = fixWholeStep(1280, 12);
    /* And one that already lands must be left alone. */
    const fine = fixWholeStep(1280, 8);
    return { bad, far, good, fine };
  });
  expect(r.bad, 'no fractional step on a 96px source').toBeNull();
  expect(r.far, 'no jump from 85 cells to 20').toBeNull();
  expect(r.good, 'but 1280 at 12 still moves').not.toBeNull();
  expect(r.good.cols).toBe(128);
  expect(r.good.step, 'to a whole 10 pixels').toBe(10);
  expect(r.fine, 'and 8 already lands, so nothing happens').toBeNull();
});
