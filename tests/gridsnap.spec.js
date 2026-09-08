/* Snapping the brush to the grid the art was drawn on.

   "make a grid snapping button that you can toggle that will jump on the grid
   dots."

   The brush already takes its SIZE from the measured block. Its position did
   not, so a 10x10 brush on 10x10 art landed wherever the pointer was and
   painted a block straddling four real ones - getting one cell right meant
   hitting one pixel in a hundred.

   THE ASSERTION THAT MATTERS IS THE PAINTED RECTANGLE, not the cell number.
   A snap that returns a tidy-looking cell and then paints half a block out of
   place would pass any check on coordinates: dab CENTRES the brush on the cell
   it is handed, so the snapped cell has to be the block corner plus that same
   offset. Every test here clicks and then reads the pixels.
*/
import { test, expect } from '@playwright/test';

/* Art genuinely drawn in b x b blocks, opened in the editor. */
const openBlockArt = (page, b, cells) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const S = o.b * o.cells;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  let n = 7;
  for (let cy = 0; cy < o.cells; cy++) for (let cx = 0; cx < o.cells; cx++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    const v = 40 + (n % 170);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect(cx * o.b, cy * o.b, o.b, o.b);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Probe_eyes_approved', kind: 'trait', name: 'Probe',
    layer: 'eyes', status: 'approved', blob, w: S, h: S, at: Date.now() });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  const rec = (await dbAll()).find(r => r.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 200));
  return { block: gridBlock, brush, size: S };
}, { b, cells });

/* Paints one dab at the cell the app would derive from a pointer over pixel
   (px,py), then reports the exact rectangle of pixels that changed colour. */
const dabAtPixel = (page, px, py) => page.evaluate((p) => {
  const W = art.width, H = art.height;
  const beforeData = ctx.getImageData(0, 0, W, H).data.slice();
  /* Through cellFrom, so the snap under test is the one a real pointer gets.
     A fake rect keeps it independent of layout and zoom. */
  const r = art.getBoundingClientRect();
  const cell = cellFrom({ clientX: r.left + (p.px + 0.5) * zoom,
    clientY: r.top + (p.py + 0.5) * zoom });
  if (!cell) return { cell: null };
  dab(cell.x, cell.y, [255, 0, 0], 255);
  const after = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (beforeData[i] !== after[i] || beforeData[i+1] !== after[i+1] ||
        beforeData[i+2] !== after[i+2]) {
      n++; if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  return { cell, painted: n ? { x0, y0, x1, y1, n } : null };
}, { px, py });

test.describe('the brush snaps to the grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof snapCell === 'function');
  });

  test('A DAB ANYWHERE IN A CELL PAINTS THAT WHOLE CELL', async ({ page }) => {
    /* The ask. On 10x10 art with a 10x10 brush, a pointer at pixel (37,44) is
       inside the cell starting at (30,40) - so the painted rectangle must be
       exactly that cell, not a 10x10 block centred on 37,44. */
    const s = await openBlockArt(page, 10, 20);
    expect([s.block, s.brush], 'the brush already matches the art').toEqual([10, 10]);
    const r = await dabAtPixel(page, 37, 44);
    expect(r.painted, 'it painted something').not.toBe(null);
    expect([r.painted.x0, r.painted.y0, r.painted.x1, r.painted.y1])
      .toEqual([30, 40, 39, 49]);
    expect(r.painted.n, 'exactly one cell').toBe(100);
  });

  test('and the far corner of a cell paints the same cell', async ({ page }) => {
    /* The half that catches an off-by-one anchor: 39,49 is the last pixel of
       the same cell and must not spill into the next one. */
    await openBlockArt(page, 10, 20);
    const r = await dabAtPixel(page, 39, 49);
    expect([r.painted.x0, r.painted.y0, r.painted.x1, r.painted.y1])
      .toEqual([30, 40, 39, 49]);
  });

  test('and the next pixel over jumps to the next cell', async ({ page }) => {
    await openBlockArt(page, 10, 20);
    const r = await dabAtPixel(page, 40, 50);
    expect([r.painted.x0, r.painted.y0, r.painted.x1, r.painted.y1])
      .toEqual([40, 50, 49, 59]);
  });

  test('WITH SNAP OFF IT PAINTS WHERE YOU POINT', async ({ page }) => {
    /* The control, and the reason it is a toggle. Without it, "always snap"
       passes every test above and there is no way to touch a single pixel. */
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => { document.getElementById('gsnap').click(); });
    const r = await dabAtPixel(page, 37, 44);
    expect(r.cell, 'the cell is the pointer, unrounded').toEqual({ x: 37, y: 44 });
    /* brush 10, off = floor(9/2) = 4, so the block runs 33..42 / 40..49. */
    expect([r.painted.x0, r.painted.y0, r.painted.x1, r.painted.y1])
      .toEqual([33, 40, 42, 49]);
  });

  test('and on art drawn pixel by pixel it changes nothing', async ({ page }) => {
    /* A block of one is a pixel. Snapping there is arithmetic that cannot
       move anything, and claiming otherwise would be a lie in the UI. */
    const s = await openBlockArt(page, 1, 40);
    expect(s.block).toBe(1);
    const r = await dabAtPixel(page, 17, 23);
    expect(r.cell).toEqual({ x: 17, y: 23 });
  });

  test('and a smaller brush still lands on the cell corner', async ({ page }) => {
    /* Snapping decides WHERE, the brush decides how much. A 1px brush with
       snap on touches the corner pixel of the cell, not the pixel clicked. */
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => { brushAuto = false; setBrush(1); });
    const r = await dabAtPixel(page, 37, 44);
    expect(r.painted.n, 'one pixel').toBe(1);
    expect([r.painted.x0, r.painted.y0]).toEqual([30, 40]);
  });

  test('and a pointer off the art is still off the art', async ({ page }) => {
    /* The bounds check reads the real pointer. Snapping first would round a
       pointer just past the edge back on and paint from outside the canvas. */
    const s = await openBlockArt(page, 10, 20);
    const r = await dabAtPixel(page, s.size + 5, 10);
    expect(r.cell).toBe(null);
  });

  test('and the fill tool is not snapped', async ({ page }) => {
    /* Only brush strokes. A fill seeded from a rounded pixel is a different
       fill from the one that was clicked. */
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => { tool = 'fill'; });
    const r = await dabAtPixel(page, 37, 44);
    expect(r.cell).toEqual({ x: 37, y: 44 });
  });
});
