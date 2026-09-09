/* Selections, ported from Pixelorama.

   Every number here was DERIVED from the GDScript before the test ran, not
   read off the screen and pasted back:

   - RectSelect._get_result_rect adds Vector2i.ONE to the drag, so a drag from
     (3,4) to (7,9) is 5x6 = 30 cells, inclusive of both ends. Shift is the
     largest square that fits (min leg 4, +1 = 5x5 = 25). Ctrl mirrors the
     drag about the origin: (3,4)-(4,5) = (-1,-1) to (7,9), 9x11, clipped to
     the canvas as 8x10 = 80.
   - DrawingAlgos.get_ellipse_points(size 5x5) by hand: a=b=4, b1=0,
     dx=-192, dy=64, err=-128; the loop emits (4,2)(0,2)(4,3)(0,3)(0,1)(4,1)
     (3,4)(1,4)(1,0)(3,0)(2,4)(2,0) - twelve border cells, a ring - and
     get_ellipse_points_filled adds the nine inside: 21. A 3x3 is the plus
     of five, a 4x4 the square less its corners, twelve.
   - Lasso: a diamond with corners (10,2) (18,10) (10,18) (2,10) is every
     cell with |x-10|+|y-10| <= 8, which is 2*8*8+2*8+1 = 145. The path is
     drawn back to its start so every boundary cell is on the polyline and
     only the interior depends on the even-odd rule, where the port and
     Godot's is_point_in_polygon agree.
   - The wand is FloodFillObject: a 4-connected flood of "similar to the
     SEED", per channel, alpha included. The scene has a 6x6 red block (36),
     a 4x4 red block touching it at ONE CORNER (16), and a 4x2 near-red block
     (8) beside it whose red channel is 10 off. Tolerance 0 gives 36; 9 gives
     36; 10 gives 44 and never the corner block. Select-by-colour is the
     shader: every pixel within tolerance anywhere, so 52 at 0 and 60 at 10.
   - The modes reduce to set algebra: 10x10 at (0,0) and 10x10 at (5,5)
     overlap in 25, so add is 175, subtract 75, intersect 25.
   - A move lifts the selected pixels, clears where they were, and puts them
     down through their own alpha: a 6x6 block moved (-10,-4) is 36 pixels at
     (20,26), 36 transparent cells at (30,30), and ONE undo step.

   The pointer path is a real press on #art and moves and a release on the
   stage, the same listeners a mouse reaches; the rest goes through
   PB.select, which drives the same chips a person clicks. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel, resizeGo, setField } from './helpers.js';

const BG = [40, 40, 48], RED = [200, 30, 30], NEAR = [210, 30, 30], GREEN = [30, 200, 30];
const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};
/* Islands on a flat ground, each placed so the flood, the colour pick and
   the move have a countable answer. */
const SCENE = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
  for (let y = 2; y <= 7; y++) for (let x = 2; x <= 7; x++) set(x, y, [200, 30, 30]);     /* R1: 36 */
  for (let y = 8; y <= 11; y++) for (let x = 8; x <= 11; x++) set(x, y, [200, 30, 30]);   /* R2: 16, corner-touching R1 at (7,7)/(8,8) only */
  for (let y = 8; y <= 9; y++) for (let x = 2; x <= 5; x++) set(x, y, [210, 30, 30]);     /* near-red: 8, side-touching R1, red 10 off */
  for (let y = 20; y <= 23; y++) for (let x = 20; x <= 23; x++) set(x, y, [0, 0, 0, 0]);  /* a transparent hole: 16 */
  for (let y = 30; y <= 35; y++) for (let x = 30; x <= 35; x++) set(x, y, [30, 200, 30]); /* green: 36 */
};

const pixels = (page) => page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
const count = (page, rgb) => page.evaluate(c => {
  const d = ctx.getImageData(0, 0, art.width, art.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) n++;
  return n;
}, rgb);
const clear = (page) => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, art.width, art.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) n++;
  return n;
});
const sel = (page) => page.evaluate(() => PB.selection());
const undoDepth = (page) => page.evaluate(() => undoStack.length);
/* A press INSIDE the selection with no modifier is a move, not a new
   selection - BaseSelectionTool.draw_start sets _move and draw_end then
   skips apply_selection - so a replace that would begin on the old
   selection drops it first, as a person does with Ctrl+D. */
const none = (page) => page.evaluate(() => PB.select({ none: true }));

/* A press on the art, moves and a release on the stage, with the modifier
   keys a real event would carry. `keys` is a list of [afterMoveIndex, key,
   down|up] for keys pressed DURING the drag, which is how Shift and Ctrl
   reach RectSelect._input once the rect has area. */
const drag = (page, path, { shift = false, ctrl = false, alt = false, keys = [] } = {}) =>
  page.evaluate(async ({ path, shift, ctrl, alt, keys }) => {
    const r = art.getBoundingClientRect();
    const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
      pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true,
      shiftKey: shift, ctrlKey: ctrl, altKey: alt });
    art.dispatchEvent(new PointerEvent('pointerdown', at(path[0][0], path[0][1])));
    for (let i = 1; i < path.length; i++) {
      stage.dispatchEvent(new PointerEvent('pointermove', at(path[i][0], path[i][1])));
      for (const [after, key, dir] of keys) if (after === i)
        window.dispatchEvent(new KeyboardEvent(dir === 'up' ? 'keyup' : 'keydown', { key, bubbles: true }));
    }
    const last = path[path.length - 1];
    stage.dispatchEvent(new PointerEvent('pointerup', at(last[0], last[1])));
    await new Promise(x => setTimeout(x, 60));
  }, { path, shift, ctrl, alt, keys });

test.describe('the Select tool, by pointer', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openTrait(page, { w: 40, h: 40, draw: SCENE });
    await page.evaluate(() => selectTool('select'));
  });

  test('A RECTANGLE IS THE DRAG PLUS ONE, INCLUSIVE, AND CHANGES NO PIXEL', async ({ page }) => {
    const before = await pixels(page);
    await drag(page, [[3, 4], [5, 6], [7, 9]]);
    const s = await sel(page);
    expect(s.count, '5x6 inclusive').toBe(30);
    expect(s.bounds).toEqual({ x0: 3, y0: 4, x1: 7, y1: 9, w: 5, h: 6 });
    expect(await pixels(page), 'selecting is not painting').toEqual(before);
    expect(await undoDepth(page), 'and takes no undo step').toBe(0);
    expect(errors, 'no console errors on the way').toEqual([]);
  });

  test('Shift during the drag makes it square, Ctrl grows it from the origin', async ({ page }) => {
    /* RectSelect._input only listens once the rect has area, so the key
       goes down after the first move. */
    await drag(page, [[3, 4], [5, 6], [7, 9]], { keys: [[1, 'Shift', 'down']] });
    let s = await sel(page);
    expect(s.count, 'min leg 4, plus one').toBe(25);
    expect(s.bounds).toEqual({ x0: 3, y0: 4, x1: 7, y1: 8, w: 5, h: 5 });
    await none(page);
    await drag(page, [[3, 4], [5, 6], [7, 9]], { keys: [[1, 'Control', 'down']] });
    s = await sel(page);
    expect(s.count, '(-1,-1) to (7,9) is 9x11, clipped to 8x10').toBe(80);
    expect(s.bounds).toEqual({ x0: 0, y0: 0, x1: 7, y1: 9, w: 8, h: 10 });
  });

  test('the modifiers at the press pick the mode: Shift adds, Ctrl subtracts, both intersect', async ({ page }) => {
    await drag(page, [[0, 0], [5, 5], [9, 9]]);
    expect((await sel(page)).count).toBe(100);
    await drag(page, [[5, 5], [9, 9], [14, 14]], { shift: true });
    expect((await sel(page)).count, '100 + 100 - 25 overlap').toBe(175);
    await none(page);
    await drag(page, [[0, 0], [5, 5], [9, 9]]);
    await drag(page, [[5, 5], [9, 9], [14, 14]], { ctrl: true });
    expect((await sel(page)).count, '100 less the 25 overlap').toBe(75);
    await none(page);
    await drag(page, [[0, 0], [5, 5], [9, 9]]);
    await drag(page, [[5, 5], [9, 9], [14, 14]], { shift: true, ctrl: true });
    expect((await sel(page)).count, 'only the overlap').toBe(25);
  });

  test('a click without a drag deselects in replace mode and is nothing in add mode', async ({ page }) => {
    await drag(page, [[0, 0], [5, 5], [9, 9]]);
    await drag(page, [[20, 20]], { shift: true });
    expect((await sel(page)).count, 'add: a zero rect is nothing').toBe(100);
    await drag(page, [[20, 20]]);
    expect((await sel(page)).count, 'replace: a zero rect clears').toBe(0);
  });

  test('THE LASSO FILLS ITS LOOP, EVEN-ODD: A DIAMOND OF 145', async ({ page }) => {
    await page.evaluate(() => setChip('seshape', 'lasso'));
    await drag(page, [[10, 2], [18, 10], [10, 18], [2, 10], [10, 2]]);
    const s = await sel(page);
    expect(s.count).toBe(145);
    expect(s.bounds).toEqual({ x0: 2, y0: 2, x1: 18, y1: 18, w: 17, h: 17 });
    /* And it is the diamond, not some other 145 cells. */
    const m = (await page.evaluate(() => PB.selection({ mask: true }))).mask;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++)
      expect(m[y * 40 + x], 'cell ' + x + ',' + y).toBe(Math.abs(x - 10) + Math.abs(y - 10) <= 8 ? 1 : 0);
  });

  test('a lasso of three points or fewer leaves nothing selected', async ({ page }) => {
    await drag(page, [[0, 0], [5, 5], [9, 9]]);
    await page.evaluate(() => setChip('seshape', 'lasso'));
    await drag(page, [[20, 20]], { shift: true });
    expect((await sel(page)).count, 'Lasso.apply_selection clears even in add mode').toBe(0);
  });

  test('THE WAND IS A 4-CONNECTED FLOOD WITHIN TOLERANCE OF THE SEED', async ({ page }) => {
    await page.evaluate(() => setChip('seshape', 'wand'));
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, 'the 6x6 block; the corner-touching block is not 4-connected').toBe(36);
    await setField(page, 'setol', 9); await none(page);
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, '9 is one short of the near-red block').toBe(36);
    await setField(page, 'setol', 10); await none(page);
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, 'at 10 the near-red block joins, the corner block still does not').toBe(44);
    /* And a click INSIDE the selection is a move, not a re-select: the
       count is what the last click left, wherever the wand would flood. */
    await setField(page, 'setol', 0);
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, 'a press inside the selection re-selects nothing').toBe(44);
    await drag(page, [[0, 0]]);
    expect((await sel(page)).count, 'the ground: 1600 less every island (36+16+8+16+36)').toBe(1488);
  });

  test('select by colour takes the colour everywhere', async ({ page }) => {
    await page.evaluate(() => setChip('seshape', 'colour'));
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, 'both red blocks').toBe(52);
    await setField(page, 'setol', 10); await none(page);
    await drag(page, [[3, 3]]);
    expect((await sel(page)).count, 'and the near-red at 10').toBe(60);
  });

  test('DRAGGING INSIDE THE SELECTION MOVES ITS PIXELS, ONE UNDO STEP', async ({ page }) => {
    await page.evaluate(() => PB.select({ shape: 'rect', x: 30, y: 30, w: 6, h: 6 }));
    const before = await pixels(page), depth = await undoDepth(page);
    await drag(page, [[32, 32], [27, 30], [22, 28]]);
    expect(await count(page, GREEN), 'all 36 green pixels survive').toBe(36);
    expect(await page.evaluate(() => { const d = ctx.getImageData(20, 26, 6, 6).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++; return n; }), 'at (20,26)').toBe(36);
    expect(await clear(page), 'the hole, plus the 36 cells they left').toBe(52);
    const s = await sel(page);
    expect(s.count, 'the selection went with them').toBe(36);
    expect(s.bounds).toEqual({ x0: 20, y0: 26, x1: 25, y1: 31, w: 6, h: 6 });
    expect(await undoDepth(page), 'one undo step').toBe(depth + 1);
    await page.click('#undo');
    expect(await pixels(page), 'and undo puts every byte back').toEqual(before);
  });

  test('a move that ends where it began is not an edit', async ({ page }) => {
    await page.evaluate(() => PB.select({ shape: 'rect', x: 30, y: 30, w: 6, h: 6 }));
    const before = await pixels(page), depth = await undoDepth(page);
    await drag(page, [[32, 32], [33, 33], [32, 32]]);
    expect(await pixels(page)).toEqual(before);
    expect(await undoDepth(page)).toBe(depth);
    expect((await sel(page)).count, 'and the selection is still there').toBe(36);
  });

  test('Ctrl+Alt at the press moves a copy and leaves the original', async ({ page }) => {
    await page.evaluate(() => PB.select({ shape: 'rect', x: 30, y: 30, w: 6, h: 6 }));
    await drag(page, [[32, 32], [27, 30], [22, 28]], { ctrl: true, alt: true });
    expect(await count(page, GREEN), 'twice the green').toBe(72);
    expect(await clear(page), 'nothing cleared but the hole that was there').toBe(16);
  });

  test('a moved selection puts down pixels through their own alpha: no holes punched', async ({ page }) => {
    /* 8x8 round the 4x4 hole: 48 opaque cells and 16 clear ones. Moved ten
       to the right onto flat ground, the clear ones must NOT overwrite it. */
    await page.evaluate(() => PB.select({ shape: 'rect', x: 18, y: 18, w: 8, h: 8 }));
    await drag(page, [[19, 19], [24, 19], [29, 19]]);
    expect(await clear(page), 'only the 64 cells they left').toBe(64);
    expect(await page.evaluate(() => { const d = ctx.getImageData(30, 20, 4, 4).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] === 40 && d[i + 1] === 40 && d[i + 2] === 48) n++; return n; }), 'the ground under the moved hole is untouched').toBe(16);
    expect((await sel(page)).bounds).toEqual({ x0: 28, y0: 18, x1: 35, y1: 25, w: 8, h: 8 });
  });

  test('the ants are on their own layer, never on the artwork', async ({ page }) => {
    const before = await pixels(page);
    await drag(page, [[3, 4], [5, 6], [7, 9]]);
    await page.waitForTimeout(300);
    const ants = await page.evaluate(() => {
      const c = document.getElementById('sepv');
      if (c.style.display === 'none') return { shown: false };
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) ink++;
      return { shown: true, ink, moving: document.getElementById('semv').style.display };
    });
    expect(ants.shown, 'shown while there is a selection').toBe(true);
    expect(ants.ink, 'and drawn').toBeGreaterThan(0);
    expect(await pixels(page), 'while the art is untouched').toEqual(before);
    await page.evaluate(() => PB.select({ none: true }));
    expect(await page.evaluate(() => document.getElementById('sepv').style.display), 'and gone with it').toBe('none');
  });
});

test.describe('the operations', () => {
  test.beforeEach(async ({ page }) => { await openTrait(page, { w: 40, h: 40, draw: FLAT }); });

  test('THE ELLIPSE IS PIXELORAMA\'S: 5 IN A 3x3, 12 IN A 4x4, 21 IN A 5x5', async ({ page }) => {
    const shape = (w, h) => page.evaluate(({ w, h }) => PB.select({ shape: 'ellipse', x: 10, y: 10, w, h, mode: 'replace' }).count, { w, h });
    expect(await shape(3, 3), 'the plus').toBe(5);
    expect(await shape(4, 4), 'the square less its corners').toBe(12);
    expect(await shape(5, 5), 'the ring of twelve and the nine inside').toBe(21);
    /* The 5x5 is exactly the derived set: a square less its four corners. */
    const m = (await page.evaluate(() => PB.selection({ mask: true }))).mask;
    for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) {
      const corner = (x === 10 || x === 14) && (y === 10 || y === 14);
      expect(m[y * 40 + x], 'cell ' + x + ',' + y).toBe(corner ? 0 : 1);
    }
  });

  test('all, none, invert - and inverting nothing is everything', async ({ page }) => {
    expect(await page.evaluate(() => PB.select({ all: true }).count)).toBe(1600);
    expect(await page.evaluate(() => PB.select({ none: true }).count)).toBe(0);
    expect(await page.evaluate(() => PB.select({ invert: true }).count), 'SelectionMap.invert flips every pixel').toBe(1600);
    await page.evaluate(() => PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10 }));
    expect(await page.evaluate(() => PB.select({ invert: true }).count)).toBe(1500);
  });

  test('the modes through the panel chips', async ({ page }) => {
    const r = await page.evaluate(() => {
      const a = () => PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10, mode: 'replace' });
      const b = m => PB.select({ shape: 'rect', x: 5, y: 5, w: 10, h: 10, mode: m }).count;
      a(); const add = b('add'); a(); const sub = b('subtract'); a(); const inter = b('intersect');
      return { add, sub, inter, mode: chipVal('semode') };
    });
    expect(r).toEqual({ add: 175, sub: 75, inter: 25, mode: 'intersect' });
  });

  test('DELETE CLEARS THE SELECTED PIXELS AND DROPS THE SELECTION, ONE UNDO STEP', async ({ page }) => {
    const before = await pixels(page);
    await page.evaluate(() => PB.select({ shape: 'rect', x: 2, y: 2, w: 6, h: 6 }));
    await page.evaluate(() => selDelete());
    expect(await clear(page)).toBe(36);
    expect((await sel(page)).count, 'Selection.delete ends with clear_selection').toBe(0);
    expect(await undoDepth(page)).toBe(1);
    await page.click('#undo');
    expect(await pixels(page)).toEqual(before);
    expect(await page.evaluate(() => selDelete()), 'with nothing selected it refuses').toBe(false);
    expect(await undoDepth(page), 'and costs nothing').toBe(0);
  });

  test('fill paints every selected pixel the painting colour and keeps the selection', async ({ page }) => {
    await page.evaluate(() => { setColor('#ff0000'); PB.select({ shape: 'rect', x: 2, y: 2, w: 6, h: 6 }); selFill(); });
    expect(await count(page, [255, 0, 0])).toBe(36);
    expect((await sel(page)).count).toBe(36);
    expect(await undoDepth(page)).toBe(1);
    expect(await page.evaluate(() => selFill()), 'already that colour: refused').toBe(false);
    expect(await undoDepth(page)).toBe(1);
  });

  test('THE BUCKET CANNOT CROSS THE SELECTION', async ({ page }) => {
    await page.evaluate(() => { PB.select({ shape: 'rect', x: 0, y: 0, w: 20, h: 40 }); selectTool('fill'); setColor('#ff0000'); });
    await drag(page, [[5, 5]]);
    expect(await count(page, [255, 0, 0]), 'the flat ground is one region; the wall is the selection').toBe(800);
    const depth = await undoDepth(page);
    await drag(page, [[30, 5]]);
    expect(await count(page, [255, 0, 0]), 'a seed outside it fills nothing').toBe(800);
    expect(await undoDepth(page), 'and is not an edit').toBe(depth);
  });

  test('the mask dies with the canvas it was made on', async ({ page }) => {
    await page.evaluate(() => { PB.select({ all: true }); setChip('rsmode', 'canvas'); });
    await setField(page, 'rsw', 20); await setField(page, 'rsh', 20);
    await resizeGo(page);
    expect(await page.evaluate(() => art.width + 'x' + art.height)).toBe('20x20');
    expect((await sel(page)).count, 'a 40x40 mask over a 20x20 canvas is no mask').toBe(0);
    expect(await page.evaluate(() => selMask)).toBeNull();
    await page.evaluate(() => { selectTool('pencil'); setColor('#ff0000'); });
    await drag(page, [[5, 5]]);
    expect(await count(page, [255, 0, 0]), 'and painting works').toBeGreaterThan(0);
  });

  test('PB.selection reports the panel and PB.select refuses what it cannot do', async ({ page }) => {
    const r = await page.evaluate(() => ({
      empty: PB.selection(),
      badShape: PB.select({ shape: 'hexagon' }),
      badRect: PB.select({ shape: 'rect', x: 1, y: 1 }),
      off: PB.select({ shape: 'wand', x: 99, y: 99 }),
      noMove: PB.select({ none: true, move: { dx: 1, dy: 1 } }),
      tol: PB.select({ tolerance: 300 }).tolerance,
    }));
    expect(r.empty).toMatchObject({ ok: true, count: 0, bounds: null, width: 40, height: 40, shape: 'rect', mode: 'replace' });
    expect(r.badShape.ok).toBe(false);
    expect(r.badRect.ok).toBe(false);
    expect(r.off.ok).toBe(false);
    expect(r.noMove.ok).toBe(false);
    expect(r.tol, 'clamped to a byte').toBe(255);
    expect(await page.evaluate(() => PB.tools())).toContain('select');
  });
});

test.describe('the keys', () => {
  test.beforeEach(async ({ page }) => { await openTrait(page, { w: 40, h: 40, draw: FLAT }); });

  test('W is the tool, K the panel, Ctrl+A all, Ctrl+I invert, Ctrl+D none, Delete clears', async ({ page }) => {
    await page.keyboard.press('w');
    expect(await page.evaluate(() => document.querySelector('[data-tool="select"]').getAttribute('aria-pressed'))).toBe('true');
    await page.keyboard.press('k');
    expect(await page.evaluate(() => document.getElementById('sescrim').hidden)).toBe(false);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('sescrim').hidden), 'Escape closes it').toBe(true);
    await page.keyboard.press('Control+a');
    expect((await sel(page)).count).toBe(1600);
    await page.keyboard.press('Control+i');
    expect((await sel(page)).count, 'everything inverted is nothing').toBe(0);
    await page.evaluate(() => PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10 }));
    await page.keyboard.press('Control+d');
    expect((await sel(page)).count).toBe(0);
    await page.evaluate(() => PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10 }));
    await page.keyboard.press('Delete');
    expect(await clear(page)).toBe(100);
    expect((await sel(page)).count).toBe(0);
  });

  test('ESCAPE CLOSES A PANEL FIRST, THEN DESELECTS, AND ONLY WHILE SELECT IS THE TOOL', async ({ page }) => {
    await page.evaluate(() => { selectTool('select'); PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10 }); });
    await openPanel(page, 'se');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('sescrim').hidden), 'the panel went').toBe(true);
    expect((await sel(page)).count, 'the selection did not').toBe(100);
    await page.keyboard.press('Escape');
    expect((await sel(page)).count, 'now the selection goes').toBe(0);
    expect(await page.evaluate(() => document.getElementById('app').hidden), 'and the editor stays').toBe(false);
    /* With the pencil, Escape is not the selection's. It falls through to the
       editor's own row; the selection is left alone either way. */
    await page.evaluate(() => { PB.select({ shape: 'rect', x: 0, y: 0, w: 10, h: 10 }); selectTool('pencil'); });
    page.once('dialog', d => d.dismiss());
    await page.keyboard.press('Escape');
    /* Read the mask itself: that Escape may have closed the editor, and
       PB.selection refuses with no canvas open. */
    expect(await page.evaluate(() => selMask ? selCount(selMask) : 0), 'the selection is not touched').toBe(100);
  });
});
