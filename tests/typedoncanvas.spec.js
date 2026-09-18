/* THE TYPED PIXEL SIZE IS THE BLOCK SIZE ON THE CANVAS.

   "forced 8px, 160-cell grid, 1280 output" is the workflow the library
   records, and the library also records the "Hyperliquid 1254 mistake": a
   1254 source put through it came out with uneven cells. Measured on the
   297 raw sources on 2026-09-18, the tab read the typed 8 as SOURCE pixels
   per cell, so only a 1280 source got 160 cells:

     1254 (86 files)    157 cells, uneven on 1280
     1024 / 2048 (55)   128 cells, 10px blocks
     128 (10)           16 cells, the art destroyed (Gazers Lunar Eyes lost 47%)

   With Save at 1280 on the size now means the block on the 1280 canvas:
   1280 over the size is the count, the source width over that count is the
   step, fractional when it has to be - 1254 is 160 cells at 7.8375 source
   pixels each, which the engine takes exactly. Measured over all 297: 287
   land on 160 cells, none uneven, the 141 at 1280 byte-identical to before,
   the ten 128px sources lossless. A picture narrower than the cells its
   size means is never upsampled: it keeps its own pixels and says so.

   Also here: the readout printed "pixel size NaN, not 12" for every moved
   size, because it read a field the record never had; a result whose cells
   do not divide the canvas opened in the editor with a whole-number grid the
   art was not on; and the folder note advised turning on the two switches
   that were already on. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A picture with no pixel grid at the size asked: every pixel its own
   colour, integer arithmetic, a blob on transparent. */
const render = (W) => `
  const W = ${W}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(W, W), d = im.data;
  let s = 5 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const cx = W / 2, cy = W / 2, r = W * 0.4;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) continue;
    const i = (y * W + x) * 4, n = rnd() & 31;
    d[i] = Math.min(255, 60 + ((x * 150 / W) | 0) + n);
    d[i + 1] = Math.min(255, 40 + ((y * 150 / W) | 0) + (n >> 1));
    d[i + 2] = Math.min(255, 120 + (n >> 2));
    d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
`;
/* One-pixel art: every pixel hashed, so nothing is on any grid but 1. */
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
/* Art drawn in blocks of `cell`. */
const blocks = (W, cell) => `
  const W = ${W}, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const n = W / ${cell};
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
    g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
  }
`;

const controls = (page, force, grid) => page.evaluate(({ force, grid }) => {
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = grid;
  document.getElementById('fixpal').checked = false;
  const f = document.getElementById('fixforce'); f.disabled = false; f.value = String(force);
}, { force, grid });

const load = (page, src, name) => page.evaluate(async ({ src, name }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const realToast = window.toast; window.toast = () => {};
  const ok = await fixLoad(new File([blob], name, { type: 'image/png' }));
  window.toast = realToast;
  fixSizeHint();
  return { ok, hint: document.getElementById('fixsize').textContent };
}, { src, name });

const run = (page) => page.evaluate(async () => {
  const realToast = window.toast; window.toast = () => {};
  const r = await fixRun();
  window.toast = realToast;
  return { cols: r.width, rows: r.height, step: r.stepX, consensus: r.consensus,
    cap: document.getElementById('fixaftercap').textContent, out: document.getElementById('fixout').textContent };
});

/* The saved 1280 file, read back: how many 8x8 blocks hold more than one colour. */
const mixedBlocksOf = (page) => page.evaluate(async () => {
  const c = fixGridCanvas(FIX.out);
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, d = g.getImageData(0, 0, W, W).data;
  c.width = 1; c.height = 1;
  let mixed = 0;
  for (let by = 0; by < W; by += 8) for (let bx = 0; bx < W; bx += 8) {
    const i0 = (by * W + bx) * 4; let m = false;
    for (let y = by; y < by + 8 && !m; y++) for (let x = bx; x < bx + 8; x++) {
      const i = (y * W + x) * 4;
      if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2] || d[i + 3] !== d[i0 + 3]) { m = true; break; }
    }
    if (m) mixed++;
  }
  return { W, mixed };
});

test.describe('the typed pixel size on the canvas', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('A 1254 SOURCE AT 8 IS 160 CELLS, NOT 157', async ({ page }) => {
    await controls(page, 8, true);
    const l = await load(page, render(1254), 'anfield.png');
    expect(l.ok).toBe(true);
    expect(l.hint).toContain('160×160 pixels');
    expect(l.hint).toContain('×8 to 1280');
    expect(l.hint, 'and says how many picture pixels make a cell').toContain('7.84 source pixels per cell');
    expect(l.hint).not.toContain('uneven');
    const r = await run(page);
    expect(r.cols).toBe(160); expect(r.rows).toBe(160);
    expect(r.step).toBeCloseTo(7.8375, 4);
    expect(r.cap, 'the caption names the canvas block, so 7.84 does not read as 8 refused').toContain('8 px on the 1280 canvas');
    const saved = await mixedBlocksOf(page);
    expect(saved.W).toBe(1280);
    expect(saved.mixed, 'every 8x8 block of the saved file is one colour').toBe(0);
  });

  test('and the old meaning, which was the mistake - the control', async ({ page }) => {
    /* With the switch off the typed number is still picture pixels per pixel,
       and the output is its own size: that path is untouched, and it is what
       a copy of the old rule would do with the switch on as well. */
    await controls(page, 8, false);
    const l = await load(page, render(1254), 'anfield.png');
    expect(l.hint).toContain('157×157 pixels');
    expect(l.hint).not.toContain('1280');
    const r = await run(page);
    expect(r.cols).toBe(157);
    expect(r.step).toBe(8);
  });

  test('A 128 SOURCE AT 8 KEEPS ITS OWN PIXELS, and says the size could not be honoured', async ({ page }) => {
    await controls(page, 8, true);
    const l = await load(page, native(128), 'gazers.png');
    expect(l.hint).toContain('128×128 pixels');
    expect(l.hint).toContain('×10 to 1280');
    expect(l.hint).toContain('8 means 160 cells on 1280; 128 across cannot give that');
    expect(l.hint).toContain('so it keeps one pixel per cell');
    const r = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      const out = await fixRun();
      window.toast = realToast;
      const src = FIX.src.data;
      let diff = 0;
      for (let i = 0; i < src.length; i += 4) {
        if (!src[i + 3] && !out.data[i + 3]) continue;
        if (src[i] !== out.data[i] || src[i + 1] !== out.data[i + 1] || src[i + 2] !== out.data[i + 2] || src[i + 3] !== out.data[i + 3]) diff++;
      }
      return { cols: out.width, diff, n: src.length / 4 };
    });
    expect(r.cols).toBe(128);
    expect(r.diff, 'the picture is untouched').toBe(0);
  });

  test('A 1280 SOURCE AT 8 IS WHAT IT ALWAYS WAS', async ({ page }) => {
    await controls(page, 8, true);
    const l = await load(page, blocks(1280, 10), 'tens.png');
    expect(l.hint).toContain('160×160 pixels');
    expect(l.hint).toContain('×8 to 1280');
    expect(l.hint, 'and names the resample of 10px art onto 8px cells').toContain('10px blocks (128 cells) become 1.25 cells each');
    const r = await run(page);
    expect(r.cols).toBe(160);
    expect(r.step).toBe(8);
  });

  test('A MOVED SIZE IS SAID WITH A NUMBER, not NaN', async ({ page }) => {
    await controls(page, 12, true);
    const l = await load(page, blocks(1280, 10), 'tens.png');
    expect(l.hint).toContain('128×128 pixels');
    expect(l.hint).toContain('pixel size 10, not 12: 107 cells does not divide 1280');
    expect(l.hint).not.toContain('NaN');
    /* the same size on a 1024 source moves to the same canvas count */
    await controls(page, 12, true);
    const m = await load(page, render(1024), 'kame.png');
    expect(m.hint).toContain('128×128 pixels');
    expect(m.hint).toContain('pixel size 10, not 12');
    expect(m.hint).toContain('8 source pixels per cell');
  });

  test('A 96 SOURCE DRAWN AT 4PX KEEPS ITS BLOCKS at any typed size, and is offered no size that resamples it', async ({ page }) => {
    await controls(page, 4, true);
    const four = await load(page, blocks(96, 4), 'sprite.png');
    expect(four.hint).toContain('24×24 pixels');
    expect(four.hint).toContain('4 means 320 cells on 1280; 96 across cannot give that, so it keeps its own 4px blocks');
    expect(four.hint, 'no offer of 3, which slices every block').not.toMatch(/3 gives/);
    /* The readout reserves two lines and the narrowest column holds about
       166 characters of this font; the first draft of this sentence ran to
       262 and took a third line (fixerlayout.spec.js is what noticed). */
    expect(four.hint.length, 'and the sentence fits the two lines the readout reserves').toBeLessThan(166);
    await controls(page, 12, true);
    const twelve = await load(page, blocks(96, 4), 'sprite.png');
    expect(twelve.hint, '12 means 107 cells, which 96 pixels cannot give').toContain('24×24 pixels');
    /* a picture with NO block still gets an offer - the control for the silence */
    await controls(page, 3, true);
    const noise = await load(page, render(1020), 'ramp.png');
    expect(noise.hint).toContain('uneven');
    expect(noise.hint).toMatch(/\d+ gives/);
  });

  test('A RESULT WHOSE CELLS DO NOT DIVIDE THE CANVAS OPENS AT A GRID OF 1', async ({ page }) => {
    /* 3 on a 1020 source: 427 cells asked, nothing within a quarter lands,
       so the old meaning holds and 340 cells come back - 3.76px each on
       the 1280 canvas. The editor used to install gridBlock 4. */
    await controls(page, 3, true);
    const l = await load(page, render(1020), 'ramp.png');
    expect(l.hint).toContain('340×340 pixels');
    expect(l.hint).toContain('3.76');
    const r = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      await fixRun();
      fixOpen();
      window.toast = realToast;
      return { block: gridBlock, w: art.width, unit: fixBlockFor(340, 1280), whole: fixBlockFor(128, 1280) };
    });
    expect(r.w).toBe(1280);
    expect(r.unit).toBe(1);
    expect(r.block).toBe(1);
    expect(r.whole, 'a whole one is still whole').toBe(10);
  });

  test('THE FOLDER NOTE NAMES WHAT IT DID', async ({ page }) => {
    const r = await page.evaluate(async ({ a, b, c }) => {
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
      const f = document.getElementById('fixforce'); f.disabled = false; f.value = '12';
      const realToast = window.toast; window.toast = () => {};
      await fixBatch([await file(a, 'anfield.png'), await file(b, 'tens.png'), await file(c, 'sprite.png')]);
      window.toast = realToast;
      return { cells: fixBatchFiles.map(x => x.cells), said: document.getElementById('fixbatchout').textContent };
    }, { a: render(1254), b: blocks(1280, 10), c: blocks(96, 4) });
    /* 12 means 107 cells, moved to 128: the 1254 and the 1280 land there,
       the 96px sprite cannot hold 128 and keeps its 4px blocks. */
    expect(r.cells).toEqual([128, 128, 24]);
    expect(r.said, 'both moved files are counted, not only the last').toContain('pixel size 10 was used, not 12, on 2 files');
    expect(r.said, 'the one that could not take the size is named').toContain('1 narrower than the 128 cells that 12 means on 1280 and kept their own pixels');
    expect(r.said, 'the uneven one names its cause').toContain('12 cannot land on 1280 for them');
    expect(r.said).not.toContain('turn Snap on, or type a size');
    expect(r.said, 'none of the three is on the 160 grid, and the note says so').toContain('3 not on the 160 cell grid');
  });
});
