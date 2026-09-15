/* THE STROKE KEEPS ITS PATH, AND THE SNAP HOLDS BOTH ENDS.

   Two tools that lost the pointer's real path, in opposite directions.

   THE PENCIL discarded every position made off the canvas - not clipped,
   dropped - without recording it. lastCell kept the last ON-canvas cell, so
   coming back onto the art somewhere else interpolated from there to the new
   cell and painted a straight chord the pointer never travelled. Measured on a
   40x40 canvas: press at (39,0), drag well off the art, come back at (0,39) -
   40 pixels painted, a clean diagonal corner to corner.

   The file already states the rule, on the shade tool: "Off the art the stroke
   keeps its path, as Pixelorama's does: each pixel is clipped, not the line."
   Pencil and eraser were the only stroke tools that dropped the path instead.

   GRID SNAP snapped the start of a line, rectangle or ellipse and not the end.
   The press goes through cellFrom, which snaps; the move and up hooks called
   rawCell. Measured on 10px block art with Snap on, which is the default: the
   painted box ran [30,40,102,109] - left and top on the grid, right edge
   running 93..102 straight through the boundary at 99/100.

   EVERY ASSERTION HERE IS THE PAINTED RECTANGLE OR A PAINTED PIXEL, the rule
   gridsnap.spec.js already sets: a snap that returns a tidy cell and paints
   half a block out of place passes any check on coordinates.
*/
import { test, expect } from '@playwright/test';

/* A blank canvas of a given size, opened in the editor. */
const openBlank = (page, S) => page.evaluate(async (side) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = side; c.height = side;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, side, side);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_Probe_eyes_approved', kind: 'trait', name: 'Probe',
    layer: 'eyes', status: 'approved', blob, w: side, h: side, at: Date.now() });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  const rec = (await dbAll()).find(r => r.kind === 'trait');
  await openTraitRecord(rec);
  await new Promise(r => setTimeout(r, 200));
  return { block: gridBlock, brush, zoom };
}, S);

/* Art genuinely drawn in b x b blocks, so gridBlock measures b and the brush
   follows it. Copied in shape from gridsnap.spec.js. */
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
  return { block: gridBlock, brush, size: S, snapOn: pressed('gsnap') };
}, { b, cells });

/* Press, drag through a list of points, release - through the same listeners a
   mouse reaches. The press goes to #art and the rest to the stage, which is
   what a real drag does. Points are ART CELLS, and may be outside the canvas:
   that is the whole subject here. */
const drag = (page, pts) => page.evaluate(async (list) => {
  const r = art.getBoundingClientRect();
  const at = (c) => ({ clientX: r.left + (c[0] + 0.5) * zoom, clientY: r.top + (c[1] + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true });
  art.dispatchEvent(new PointerEvent('pointerdown', at(list[0])));
  for (let i = 1; i < list.length; i++)
    stage.dispatchEvent(new PointerEvent('pointermove', at(list[i])));
  stage.dispatchEvent(new PointerEvent('pointerup', at(list[list.length - 1])));
  await new Promise(x => setTimeout(x, 100));
}, pts);

/* Which pixels changed, as a set of "x,y", plus the bounding box of the change.
   Taken against a snapshot rather than against a colour, so it does not matter
   what was underneath. */
const changed = (page) => page.evaluate(() => {
  const W = art.width, H = art.height;
  const now = ctx.getImageData(0, 0, W, H).data;
  const was = window.__before;
  const hit = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    if (now[p] === was[p] && now[p + 1] === was[p + 1]
      && now[p + 2] === was[p + 2] && now[p + 3] === was[p + 3]) continue;
    hit.push(x + ',' + y);
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { n: hit.length, set: hit, box: x1 < 0 ? null : [x0, y0, x1, y1] };
});

const snapshot = (page) => page.evaluate(() => {
  window.__before = ctx.getImageData(0, 0, art.width, art.height).data.slice();
});

test.describe('a stroke keeps the path the pointer took', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await openBlank(page, 40);
    await page.evaluate(() => {
      selectTool('pencil');
      brush = 1;
      /* Snap off: this half is about the path, and a grid snap on a blank
         40x40 would move the cells and say nothing about it. */
      if (pressed('gsnap')) $('gsnap').click();
      color = '#ff0000';
    });
    await snapshot(page);
  });

  test('LEAVING THE CANVAS AND COMING BACK DOES NOT DRAW THE CHORD',
    async ({ page }) => {
      /* Out at the top-left, well clear of the art, and back in at the far
         corner. The false chord runs (39,0),(38,1)...(0,39); its midpoint is
         (19,20) and the pointer was nowhere near it. */
      await drag(page, [[39, 0], [-200, -200], [0, 39]]);
      const c = await changed(page);
      expect(c.set, 'the middle of the chord is untouched').not.toContain('19,20');
      expect(c.set).not.toContain('20,19');
      expect(c.n, 'and far fewer than the 40 the chord painted').toBeLessThan(15);
      expect(c.set, 'the press still painted where it landed').toContain('39,0');
    });

  test('but a drag that stays on the art still joins up - the control',
    async ({ page }) => {
      /* The fix must not have bought that by breaking interpolation. Two
         pointermoves 39 cells apart have to fill everything between them. */
      await drag(page, [[0, 0], [39, 39]]);
      const c = await changed(page);
      expect(c.set, 'the middle of a real drag is painted').toContain('19,19');
      expect(c.n, 'and the whole diagonal is there').toBe(40);
    });

  test('and an eraser does the same thing', async ({ page }) => {
    /* Pencil and eraser were the two tools sharing this, so both are pinned. */
    await page.evaluate(() => selectTool('eraser'));
    await snapshot(page);
    await drag(page, [[39, 0], [-200, -200], [0, 39]]);
    const c = await changed(page);
    expect(c.set).not.toContain('19,20');
    expect(c.n).toBeLessThan(15);
  });
});

test.describe('Grid Snap holds both ends of a shape', () => {
  test('A RECTANGLE LANDS ON THE GRID AT EVERY EDGE', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    const opened = await openBlockArt(page, 10, 20);
    /* The preconditions. Without a measured block, a brush that followed it
       and Snap actually on, this measures nothing. */
    expect(opened.block, 'the block was measured').toBe(10);
    expect(opened.brush, 'and the brush followed it').toBe(10);
    expect(opened.snapOn, 'and Snap is on, which is the default').toBe(true);
    await page.evaluate(() => { selectTool('rect'); color = '#ff0000'; });
    await snapshot(page);
    /* Inside the cell whose corner is (30,40), out to inside the cell whose
       corner is (90,100). Both presses are deliberately off-corner. */
    await drag(page, [[37, 44], [97, 104]]);
    const c = await changed(page);
    expect(c.box, 'every edge sits on a block boundary').toEqual([30, 40, 99, 109]);
  });

  test('and so does a line', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await openBlockArt(page, 10, 20);
    await page.evaluate(() => { selectTool('line'); color = '#ff0000'; });
    await snapshot(page);
    await drag(page, [[37, 44], [97, 44]]);
    const c = await changed(page);
    expect(c.box).toEqual([30, 40, 99, 49]);
  });

  test('and turning Snap off puts the pointer back in charge - the control',
    async ({ page }) => {
      /* The other direction. If Snap did nothing, or if the ends were snapped
         whatever the button says, this would look the same as the test above. */
      await page.goto('/index.html');
      await page.waitForFunction(() => typeof openTraitRecord === 'function');
      await openBlockArt(page, 10, 20);
      await page.evaluate(() => {
        selectTool('rect'); color = '#ff0000';
        if (pressed('gsnap')) $('gsnap').click();
      });
      await snapshot(page);
      await drag(page, [[37, 44], [97, 104]]);
      const c = await changed(page);
      expect(c.box, 'unsnapped, the box follows the pointer exactly')
        .toEqual([33, 40, 102, 109]);
    });
});
