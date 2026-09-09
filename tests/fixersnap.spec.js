/* SNAPPING TO THE COLLECTION'S GRID INSTEAD OF DETECTING IT.

   "the grid output now shrinks the traits where as before it made it to the
   grid" and "im resizing all traits to 1280x1280 so optimize for that".

   The 1280 save keeps position and size exactly - measured on the real
   library, the content's bounding box as a fraction of the canvas is the same
   before and after. What was wrong was the CELL COUNT: the detectors landed
   on 212, 256, 128, 83, 113, so the art's blocks came out 6.04 or 15.42 real
   pixels on a canvas whose grid is 8. Same size, finer blocks, off the grid.

   The measurement that says it plainly, and the one this file pins: of the
   grid squares in the saved file, how many hold more than one colour. On real
   traits that was 1871, 1228, 1047 and 174 detected, and 0 snapped.

   The source is 1280 and the grid is known, so there is nothing to detect. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A picture drawn on a grid the fixer will NOT naturally land on, so a test
   that passes cannot be passing by luck. 1280 at 5px blocks is 256 cells;
   the collection grid is 160. */
const load = (page, W = 1280, cell = 5) => page.evaluate(async ({ W, cell }) => {
  const c = document.createElement('canvas');
  c.width = W; c.height = W;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, W);
  const n = Math.floor(W / cell);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (y < n * 0.4) continue;
    const k = (x * 7 + y * 13) % 5;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7', '#7b6a58'][k];
    g.fillRect(x * cell, y * cell, cell, cell);
  }
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  return await fixLoad(new File([b], 'grid.png', { type: 'image/png' }));
}, { W, cell });

const setSnap = (page, on) => page.evaluate((v) => {
  const b = document.getElementById('fixsnap');
  b.checked = v;
  b.dispatchEvent(new Event('change', { bubbles: true }));
  return b.checked;
}, on);

/* How many grid squares of the saved canvas hold more than one colour. This
   is what "on the grid" means, and a cell count that merely divides the
   canvas does not imply it. */
const impure = (page, cellPx) => page.evaluate(async (N) => {
  const out = FIX.out;
  document.getElementById('fixgrid').checked = true;
  const sv = fixGridCanvas(out);
  const d = sv.getContext('2d').getImageData(0, 0, sv.width, sv.height).data;
  const W = sv.width;
  let bad = 0;
  for (let by = 0; by < W; by += N) for (let bx = 0; bx < W; bx += N) {
    const i0 = (by * W + bx) * 4;
    const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    let mixed = false;
    for (let y = by; y < by + N && !mixed; y++)
      for (let x = bx; x < bx + N; x++) {
        const i = (y * W + x) * 4;
        if (d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0 || d[i + 3] !== a0) {
          mixed = true; break;
        }
      }
    if (mixed) bad++;
  }
  const w = sv.width, h = sv.height;
  sv.width = 1; sv.height = 1;
  return { bad, saved: w + 'x' + h, cells: out.width + 'x' + out.height };
}, cellPx);

test('the switch is on, and names the grid it snaps to', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => ({
    on: document.getElementById('fixsnap').checked,
    label: document.getElementById('fixsnaplab').textContent,
    grid: projectGrid,
  }));
  expect(r.on, 'on by default - it is the stated workflow').toBe(true);
  expect(r.grid).toBe(160);
  expect(r.label).toBe('Snap to the 160 cell grid');
});

test('SNAPPED, EVERY GRID SQUARE IS ONE COLOUR', async ({ page }) => {
  await ready(page);
  await load(page);
  await setSnap(page, true);
  await page.evaluate(() => fixRun());
  const r = await impure(page, 8);
  expect(r.cells, 'exactly the collection grid').toBe('160x160');
  expect(r.saved).toBe('1280x1280');
  /* THE WHOLE POINT. Not one of the 160x160 squares holds two colours. */
  expect(r.bad, 'grid squares holding more than one colour').toBe(0);
});

test('and detected, it does not - which is what was being seen', async ({ page }) => {
  await ready(page);
  await load(page);
  /* THE POSITIVE CONTROL. Without this, "0 mixed squares" could mean the
     measurement cannot find any, rather than the snap working. */
  await setSnap(page, false);
  await page.evaluate(() => {
    const f = document.getElementById('fixforce');
    f.value = '0'; f.dispatchEvent(new Event('input', { bubbles: true }));
    return fixRun();
  });
  const r = await impure(page, 8);
  expect(r.cells, 'the detectors do not land on the collection grid here')
    .not.toBe('160x160');
  expect(r.bad, 'squares holding more than one colour, off the grid')
    .toBeGreaterThan(0);
});

test('any source size lands on the same grid', async ({ page }) => {
  await ready(page);
  /* 1254 is the old canvas and does not divide 160 evenly - the step is
     7.8375 - and it still has to come out at exactly 160 cells and save as
     8-pixel blocks. The snap normalises the size difference rather than
     depending on it, which matters while the library is half converted. */
  for (const W of [1280, 1254, 1024]) {
    await load(page, W, 5);
    await setSnap(page, true);
    await page.evaluate(() => fixRun());
    const r = await impure(page, 8);
    expect(r.cells, W + ' lands on the grid').toBe('160x160');
    expect(r.saved, W + ' saves at the collection size').toBe('1280x1280');
  }
});

test('the batch takes the step per file, not once for all of them', async ({ page }) => {
  await ready(page);
  /* A batch of mixed sizes has a different step for each picture and must
     still land them all on one grid. Read once before the loop, a 1254 file
     in a run of 1280s would be fixed at the wrong step. */
  const r = await page.evaluate(async () => {
    document.getElementById('fixsnap').checked = true;
    const files = [];
    for (const W of [1280, 1254, 1024]) {
      const c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d');
      const n = Math.floor(W / 5);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf';
        g.fillRect(x * 5, y * 5, 5, 5);
      }
      const b = await new Promise(res => c.toBlob(res, 'image/png'));
      c.width = 1; c.height = 1;
      files.push(new File([b], W + '.png', { type: 'image/png' }));
    }
    await fixBatch(files);
    return { n: fixBatchFiles.length,
      sizes: [...new Set(fixBatchFiles.map(f => f.w + 'x' + f.h))] };
  });
  expect(r.n).toBe(3);
  expect(r.sizes, 'all three at the collection size').toEqual(['1280x1280']);
});

test('the pixel size box stops pretending it decides anything', async ({ page }) => {
  await ready(page);
  await load(page);
  await setSnap(page, true);
  const on = await page.evaluate(() => ({
    disabled: document.getElementById('fixforce').disabled,
    title: document.getElementById('fixforce').title,
    hint: (fixSizeHint(), document.getElementById('fixsize').textContent),
  }));
  expect(on.disabled, 'a live box that changes no answer is a control that lies').toBe(true);
  expect(on.title).toContain('160 cell grid');
  /* The readout says the grid count and the block size, without a size typed. */
  expect(on.hint).toContain('160×160 pixels');
  expect(on.hint).toContain('×8 to 1280');

  await setSnap(page, false);
  const off = await page.evaluate(() => document.getElementById('fixforce').disabled);
  expect(off, 'and it comes back when it matters again').toBe(false);
});

test('a grid that cannot divide the canvas is said, not faked', async ({ page }) => {
  await ready(page);
  await load(page);
  const said = await page.evaluate(() => {
    projectGrid = 150;
    document.getElementById('fixsnap').checked = true;
    fixModeUI();
    fixSizeHint();
    const t = document.getElementById('fixsize').textContent;
    projectGrid = 160;
    return t;
  });
  /* 1280/150 is 8.53. Writing that and calling it snapped would be a lie
     about the one thing the switch is for. */
  expect(said).toContain('does not divide 1280');
  expect(said).not.toContain('×8');
});

test('snapping is off in scale only, where nothing is detected at all', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    document.getElementById('fixsnap').checked = true;
    const s = document.getElementById('fixmode');
    s.value = 'scale';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { snapping: fixSnapping(), step: fixStepFor(1280) };
  });
  /* Scale only never reaches the engine, so there is no step to force. */
  expect(r.snapping).toBe(false);
  expect(r.step).toBe(0);
});
