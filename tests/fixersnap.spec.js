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

/* THIN ART: single 5px blocks with transparent ground between them, which is
   what a stroke, an outline or an eyelash looks like. Solid fields survive
   the wrong grid - only the thin parts show what it costs, and the traits
   that were coming back wrecked were the thin ones. */
const thin = (page) => page.evaluate(async () => {
  const W = 1280, cell = 5;
  const c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d');
  const n = W / cell;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if ((x * 7 + y * 11) % 3) continue;
    g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a'][(x + y) % 3];
    g.fillRect(x * cell, y * cell, cell, cell);
  }
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  return await fixLoad(new File([b], 'thin.png', { type: 'image/png' }));
});

const setSnap = (page, on) => page.evaluate((v) => {
  const b = document.getElementById('fixsnap');
  b.checked = v;
  b.dispatchEvent(new Event('change', { bubbles: true }));
  return b.checked;
}, on);

/* How many grid squares of the saved canvas hold more than one colour. This
   is what "on the grid" means, and a cell count that merely divides the
   canvas does not imply it. */
/* How many blocks of the saved canvas hold more than one colour, measured at
   the size the ANSWER chose rather than a number written here. Passing 8 in
   asked whether the output sat on the DECLARED grid; what makes pixel art
   right is that it sits on its OWN, so the block size is read back off the
   result. Also returns what the source lost, because a picture can be
   perfectly uniform and still be missing half of itself. */
const impure = (page) => page.evaluate(async () => {
  const out = FIX.out;
  document.getElementById('fixgrid').checked = true;
  const sv = fixGridCanvas(out);
  const d = sv.getContext('2d').getImageData(0, 0, sv.width, sv.height).data;
  const W = sv.width;
  const N = W / out.width;
  let bad = -1;
  if (Number.isInteger(N)) {
    bad = 0;
    for (let by = 0; by + N <= W; by += N) for (let bx = 0; bx + N <= W; bx += N) {
      const i0 = (by * W + bx) * 4;
      let mixed = false;
      for (let y = by; y < by + N && !mixed; y++)
        for (let x = bx; x < bx + N; x++) {
          const i = (y * W + x) * 4;
          if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1]
            || d[i + 2] !== d[i0 + 2] || d[i + 3] !== d[i0 + 3]) { mixed = true; break; }
        }
      if (mixed) bad++;
    }
  }
  /* Source pixels with nothing opaque left in the same place. */
  let lost = 0, srcN = 0, s = FIX.src;
  if (s && s.width === W && s.height === W) {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (s.data[i + 3] <= 8) continue;
      srcN++;
      if (d[i + 3] <= 8) lost++;
    }
  }
  const w = sv.width, h = sv.height;
  sv.width = 1; sv.height = 1;
  return { bad, N, saved: w + 'x' + h, cells: out.width + 'x' + out.height,
    lostPct: srcN ? Math.round(lost / srcN * 1000) / 10 : -1 };
});

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

test('SNAPPED, EVERY BLOCK OF THE GRID THE PICTURE IS ON IS ONE COLOUR', async ({ page }) => {
  await ready(page);
  await load(page);
  await setSnap(page, true);
  await page.evaluate(() => fixRun());
  const r = await impure(page);
  /* WAS 160x160, measured with 8 written into the test. That number was the
     bug: this fixture is drawn in 5px blocks on 1280, which is 256 cells,
     and 8px cells cut straight through 5px blocks. Measured across the 319
     approved traits, forcing 160 cost 202 of them a percent or more of their
     pixels and 24 of them a tenth; following the picture, 26 and 4 - and
     those 26 are the ones with no grid at all, where there is nothing to
     follow. */
  expect(r.cells, 'the picture own grid, not the declared one').toBe('256x256');
  expect(r.N, 'which is 5px blocks on the collection canvas').toBe(5);
  expect(r.saved).toBe('1280x1280');
  /* THE WHOLE POINT. Not one block holds two colours. */
  expect(r.bad, 'blocks holding more than one colour').toBe(0);
  /* Uniform is guaranteed once the count divides 1280 - the save upscales by
     a whole number - so what that pair really pins is that the count IS a
     divisor. What it costs to be on the wrong one is measured in the test
     below, on art thin enough to lose. */
});

test('AND THE GRID IT WAS BEING FORCED ONTO DELETES THIN ART', async ({ page }) => {
  await ready(page);
  /* WAS "and detected, it does not" - snap off, and count the mixed squares.
     That control is dead twice over: the detectors find 256 on this fixture
     too now, so the two paths agree, and mixed squares cannot be nonzero once
     the count divides 1280. It was a real control when the snap forced 160
     and the detectors did not.

     This is what it was standing in for. Same picture, two grids. */
  const at = async (snap, force) => {
    await thin(page);
    await page.evaluate(async ({ snap, force }) => {
      const sn = document.getElementById('fixsnap');
      sn.checked = snap; sn.dispatchEvent(new Event('change', { bubbles: true }));
      const f = document.getElementById('fixforce');
      f.disabled = false; f.value = String(force);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      await fixRun();
    }, { snap, force });
    return await impure(page);
  };
  const own = await at(true, 0);
  const forced = await at(false, 8);
  expect(own.cells, 'the grid the art is on').toBe('256x256');
  expect(forced.cells, 'and the grid it was being put on').toBe('160x160');
  /* 8px cells over 5px blocks with gaps between them: the transparent ground
     wins nearly every vote and the art is gone. This is the number behind
     "it saves small" and "half the trait is missing". */
  expect(forced.lostPct, 'source pixels with nothing left in their place')
    .toBeGreaterThan(50);
  expect(own.lostPct, 'and on its own grid, none of them').toBe(0);
});

test('EVERY SOURCE SIZE COMES OUT ON A WHOLE GRID AT 1280', async ({ page }) => {
  await ready(page);
  /* WAS "any source size lands on the same grid", asserting 160 cells for
     all three. Landing everything on one number was the defect, not the
     property: the fixture is 5px art and 160 cells put 8px boundaries
     through it. What has to hold is that the result is 1280 square, on a
     count that divides 1280, with every block one colour.

     1280 is 5px art exactly, so it keeps its own 256. 1254 and 1024 are not
     divisible by 5, so there is no grid to measure and both fall back to the
     declared 160 - which is the fallback doing its job, and the reason it
     was kept. */
  const got = [];
  for (const W of [1280, 1254, 1024]) {
    await load(page, W, 5);
    await setSnap(page, true);
    await page.evaluate(() => fixRun());
    const r = await impure(page);
    got.push(W + ': ' + r.cells + ' blocks=' + r.N + ' mixed=' + r.bad
      + ' saved=' + r.saved);
  }
  expect(got).toEqual([
    '1280: 256x256 blocks=5 mixed=0 saved=1280x1280',
    '1254: 160x160 blocks=8 mixed=0 saved=1280x1280',
    '1024: 160x160 blocks=8 mixed=0 saved=1280x1280',
  ]);
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

test('THE PIXEL SIZE BOX DECIDES, SNAP OR NO SNAP', async ({ page }) => {
  await ready(page);
  await load(page);
  await setSnap(page, true);
  /* REVERSED. This was called "the pixel size box stops pretending it decides
     anything" and asserted it is greyed out while the snap is on, for the
     honest reason that "a live box that changes no answer is a control that
     lies". It was true: the measured block beat the typed size, so the box
     changed nothing.

     Asking sixteen glasses for 4 pixels gave 5, 8 and 10 and never 4, with
     no way to say 4 at all without giving up the snap. A measurement should
     beat a SETTING - projectGrid says 160 and the art is drawn at 128 cells -
     and it has no business beating an INSTRUCTION. So the box decides when it
     holds a number, and the fix for that sentence is to make it decide
     something rather than to keep it switched off. */
  const on = await page.evaluate(() => ({
    disabled: document.getElementById('fixforce').disabled,
    title: document.getElementById('fixforce').title,
    hint: (fixSizeHint(), document.getElementById('fixsize').textContent),
  }));
  expect(on.disabled, 'live, because it changes the answer').toBe(false);
  expect(on.title, 'and says so').toContain('even with Snap on');
  /* WAS 160x160 and x8. The readout asks the run now, and the run measures
     the picture - this fixture is 5px art, which is 256 cells. */
  expect(on.hint).toContain('256×256 pixels');
  expect(on.hint).toContain('×5 to 1280');

  await setSnap(page, false);
  const off = await page.evaluate(() => document.getElementById('fixforce').disabled);
  expect(off, 'and it stays live with the snap off').toBe(false);
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
