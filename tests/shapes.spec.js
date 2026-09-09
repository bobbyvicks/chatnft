/* Pixelorama's line, rectangle and ellipse, ported.

   EVERY EXPECTED CELL HERE WAS DERIVED, NOT OBSERVED. The line cells are
   Godot's Geometry2D::bresenham_line traced by hand (delta doubled, error
   starting at half the major delta, minor axis stepping when it goes
   negative); the ellipse cells are DrawingAlgos.get_ellipse_points traced
   step by step; the rectangles are counted from _get_result_rect and
   get_rounded_rect_points. A port that drew a circle that was "nearly"
   Pixelorama's - one cell out at a tip, say - fails here by name.

   Drags go through the same listeners a mouse reaches: the press on #art so
   it bubbles to the stage's pointerdown and into beginStroke, the moves and
   the release on the stage. Modifiers ride on the events the way they do
   from a real keyboard, and Alt is a key event during the drag, because that
   is the only way upstream ever sees it. */
import { test, expect } from '@playwright/test';
/* helpers.js also exports `art`; it is NOT imported here on purpose. A spec
   that imports it and then says art.width inside page.evaluate has the
   import rewritten to _helpers.art in the serialised function, which the
   page has never heard of - text.spec.js and panel.spec.js do exactly that
   and go red with "ReferenceError: _helpers is not defined", patched or
   not. The bare `art` below is the page's canvas. */
import { openTrait } from './helpers.js';

/* One seed pixel in the far corner, in a colour nothing here paints with,
   so the palette has an entry and the counts below are of the paint colour
   alone. */
const SEED = (set, W, H) => { set(W - 1, H - 1, [10, 10, 10]); };
const RED = [255, 0, 0];

/* A press, a drag through `via` (each [x, y] or {to, altDown, altUp}), and
   a release, with the modifiers given. */
const drag = (page, from, to, o = {}) => page.evaluate(async ({ from, to, o }) => {
  const r = art.getBoundingClientRect();
  const at = (cx, cy, m) => Object.assign({
    clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true,
    shiftKey: !!o.shift, ctrlKey: !!o.ctrl, altKey: !!o.altHeld }, m || {});
  const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true,
    shiftKey: k === 'Shift' ? type === 'keydown' : !!o.shift, ctrlKey: k === 'Control' ? type === 'keydown' : !!o.ctrl }));
  if (o.altHeld) key('keydown', 'Alt');
  art.dispatchEvent(new PointerEvent('pointerdown', at(from[0], from[1])));
  for (const step of (o.via || [])) {
    if (step.altDown) key('keydown', 'Alt');
    if (step.altUp) key('keyup', 'Alt');
    if (step.shiftDown) key('keydown', 'Shift');
    if (step.to) stage.dispatchEvent(new PointerEvent('pointermove', at(step.to[0], step.to[1], step.mods)));
  }
  /* noFinalMove leaves the last `via` step as the last thing the pointer
     did, so a key pressed after it is the only thing that can change the
     shape - which is what makes the mid-drag tests test the key path. */
  if (!o.noFinalMove) stage.dispatchEvent(new PointerEvent('pointermove', at(to[0], to[1])));
  const mid = { pos: $('pos').textContent, preview: $('shpv').style.display,
    painted: (() => { const d = ctx.getImageData(0, 0, art.width, art.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) n++; return n; })() };
  if (o.cancel) stage.dispatchEvent(new PointerEvent('pointercancel', at(to[0], to[1])));
  else stage.dispatchEvent(new PointerEvent('pointerup', at(to[0], to[1])));
  if (o.altHeld) key('keyup', 'Alt');
  await new Promise(x => setTimeout(x, 60));
  return mid;
}, { from, to, o });

/* The cells carrying exactly the paint colour, as sorted "x,y" strings. */
const cells = (page, rgb = RED) => page.evaluate(c => {
  const W = art.width, H = art.height, d = ctx.getImageData(0, 0, W, H).data, out = [];
  for (let i = 0; i < W * H; i++) { const p = i * 4;
    if (d[p + 3] === 255 && d[p] === c[0] && d[p + 1] === c[1] && d[p + 2] === c[2]) out.push((i % W) + ',' + ((i / W) | 0)); }
  return out.sort();
}, rgb);
const sorted = pts => pts.map(p => p[0] + ',' + p[1]).sort();
const shift = (pts, dx, dy) => pts.map(p => [p[0] + dx, p[1] + dy]);
const undoDepth = page => page.evaluate(() => undoStack.length);

/* Traced from get_ellipse_points on a 6x4 box at (0,0): a=5, b=3, b1=1,
   dx=-144, dy=200, err=81; y0 starts at 2 and y1 at 1; three passes of
   the x loop push (5,2)(0,2)(0,1)(5,1), (4,3)(1,3)(1,0)(4,0), (3,3)(2,3)
   (2,0)(3,0), and the tip loop has nothing left to do. */
const ELLIPSE_6x4 = [[1,0],[2,0],[3,0],[4,0],[0,1],[5,1],[0,2],[5,2],[1,3],[2,3],[3,3],[4,3]];
/* get_ellipse_points_filled adds the interior by scanning each column of
   the top-left quarter: columns 1 and 2, row 1, mirrored four ways. */
const ELLIPSE_6x4_FILL = ELLIPSE_6x4.concat([[1,1],[2,1],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2]]);
/* 5x5: a=4, b=4, b1=0, dx=-192, dy=64, err=-128; the first pass does not
   step x (e2=-256 is below dx and 2*err=128 is not above dy=192), so the
   sides get two rows each before the corners come in. */
const CIRCLE_5 = [[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[1,4],[2,4],[3,4]];
/* Godot's Bresenham (0,0)->(10,4): delta (20,8), err 10, y steps at
   x=2,4,7,9. */
const LINE_10_4 = [[0,0],[1,0],[2,1],[3,1],[4,2],[5,2],[6,2],[7,3],[8,3],[9,4],[10,4]];
/* And (0,0)->(10,3): delta (20,6), err 10, y steps at x=2,6,9. */
const LINE_10_3 = [[0,0],[1,0],[2,1],[3,1],[4,1],[5,1],[6,2],[7,2],[8,2],[9,3],[10,3]];
/* get_rounded_rect_points on 8x6 radius 2: rows 4,6,8,8,6,4 wide, minus
   the radius-1 6x4 inset by one (rows 4,6,6,4). */
const ROUND_8x6_R2 = [[2,0],[3,0],[4,0],[5,0],[1,1],[6,1],[0,2],[7,2],[0,3],[7,3],[1,4],[6,4],[2,5],[3,5],[4,5],[5,5]];

const rectOutline = (x, y, w, h) => { const o = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
    if (xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1) o.push([xx, yy]);
  return o; };
const rectFilled = (x, y, w, h) => { const o = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) o.push([xx, yy]);
  return o; };

test.describe('the shape tools', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 40, h: 30, draw: SEED });
    await page.evaluate(() => { setColor('#ff0000'); brushAuto = false; setBrush(1); });
  });

  test('ARE ON THE RAIL, HAVE KEYS, AND KEEP THE BRUSH SLIDER', async ({ page }) => {
    for (const t of ['line', 'rect', 'ellipse']) {
      const title = await page.getAttribute('.tool[data-tool="' + t + '"]', 'title');
      expect(title, t + ' has a title').toBeTruthy();
    }
    expect(await page.evaluate(() => PB.tools())).toEqual(expect.arrayContaining(['line', 'rect', 'ellipse']));
    for (const [k, t] of [['n', 'line'], ['u', 'rect'], ['p', 'ellipse']]) {
      await page.keyboard.press(k);
      expect(await page.getAttribute('.tool[data-tool="' + t + '"]', 'aria-pressed')).toBe('true');
      expect(await page.evaluate(() => $('brushrows').hidden), 'the size slider stays for ' + t).toBe(false);
      expect(await page.evaluate(() => $('shprows').hidden), 'the option strip shows for ' + t).toBe(false);
      /* Fill belongs to the closed shapes only; the line has nothing to fill. */
      expect(await page.evaluate(() => $('shpfill').hidden)).toBe(t === 'line');
      expect(await page.evaluate(() => $('shprad').hidden), 'corners are the rectangle\'s').toBe(t !== 'rect');
    }
    await page.keyboard.press('b');
    expect(await page.evaluate(() => $('shprows').hidden), 'and goes away with the pencil').toBe(true);
    /* The shortcut list names them. */
    expect(await page.evaluate(() => SHORTCUTS.filter(s => /^(Line|Rectangle|Ellipse)$/.test(s.desc)).map(s => s.show).join(''))).toBe('NUP');
  });

  test('LINE: GODOT\'S BRESENHAM, CELL FOR CELL', async ({ page }) => {
    await page.keyboard.press('n');
    const mid = await drag(page, [0, 0], [10, 4]);
    expect(mid.painted, 'nothing on the artwork while dragging').toBe(0);
    expect(mid.preview, 'the preview layer is up while dragging').toBe('block');
    expect(mid.pos, 'the readout is the angle, clockwise-positive').toBe('338.2°');
    expect(await cells(page)).toEqual(sorted(LINE_10_4));
    expect(await page.evaluate(() => $('shpv').style.display), 'the preview goes down on release').toBe('none');
    /* Direction does not change the set: the same eleven cells back. */
    await page.click('#undo');
    await drag(page, [10, 4], [0, 0]);
    expect(await cells(page)).toEqual(sorted(LINE_10_4));
  });

  test('line: Shift snaps the angle to 15-degree steps', async ({ page }) => {
    await page.keyboard.press('n');
    /* atan2(4,10) is 21.8 degrees; snapped to 15 the end goes back out along
       15 degrees at the same distance, sqrt(116): (10.40, 2.79) rounds to
       (10,3). */
    const mid = await drag(page, [0, 0], [10, 4], { shift: true });
    expect(mid.pos).toBe('345°');
    expect(await cells(page)).toEqual(sorted(LINE_10_3));
  });

  test('line: Shift pressed mid-drag takes effect without the pointer moving', async ({ page }) => {
    await page.keyboard.press('n');
    /* The pointer goes to (10,4) unmodified, then Shift goes down, and
       nothing else happens before the release - which for the line carries
       no modifier and is ignored anyway, since LineTool commits the state
       the last move left. Only the key event can have moved the end to
       (10,3). */
    await drag(page, [0, 0], [10, 4], { via: [{ to: [10, 4] }, { shiftDown: true }], noFinalMove: true });
    expect(await cells(page)).toEqual(sorted(LINE_10_3));
  });

  test('line: Ctrl grows it from both ends', async ({ page }) => {
    await page.keyboard.press('n');
    /* Anchor (10,10), pointer (13,12): the start mirrors to (7,8), and
       Bresenham (7,8)->(13,12) is delta (12,8), err 6, y stepping at
       x=7,9,10,12. */
    await drag(page, [10, 10], [13, 12], { ctrl: true });
    expect(await cells(page)).toEqual(sorted([[7,8],[8,9],[9,9],[10,10],[11,11],[12,11],[13,12]]));
  });

  test('line: thickness is the brush, centred the way the pencil centres', async ({ page }) => {
    await page.keyboard.press('n');
    await page.evaluate(() => setBrush(3));
    /* A 3-wide horizontal line from x=2 to 12 on row 5. Every one of the
       eleven cells becomes a 3x3 block covering p-1..p+1 on both axes -
       get_coords_to_draw expands the END cells too, so the blocks at 2 and
       12 reach out to 1 and 13: rows 4..6, THIRTEEN wide, 39 cells. (The
       first draft of this test said 11 wide and 33, forgetting the ends;
       the run caught it, and this is the re-derivation, not the reading.) */
    await drag(page, [2, 5], [12, 5]);
    expect(await cells(page)).toEqual(sorted(rectFilled(1, 4, 13, 3)));
    await page.click('#undo');
    /* An EVEN brush pins the editor's centring, floor((n-1)/2), which is
       dab's and the cursor box's: a 4-wide block on cell x covers x-1..x+2.
       Pixelorama would put it at x-2..x+1. Deliberate, and recorded here so
       a change to either side fails loudly. */
    await page.evaluate(() => setBrush(4));
    await drag(page, [5, 5], [9, 5]);
    expect(await cells(page)).toEqual(sorted(rectFilled(4, 4, 8, 4)));
  });

  test('RECTANGLE: outline, then filled, exact cells', async ({ page }) => {
    await page.keyboard.press('u');
    const mid = await drag(page, [3, 4], [10, 9]);
    expect(mid.pos, '_set_cursor_text: corners inclusive, then the size').toBe('3, 4 -> 10, 9 (8, 6)');
    expect(await cells(page)).toEqual(sorted(rectOutline(3, 4, 8, 6)));
    await page.click('#undo');
    await page.click('#shpfill');
    expect(await page.getAttribute('#shpfill', 'aria-pressed')).toBe('true');
    await drag(page, [10, 9], [3, 4]);
    expect(await cells(page), 'dragged the other way, the same box').toEqual(sorted(rectFilled(3, 4, 8, 6)));
    /* Fill is remembered per tool, as upstream keeps it in each tool's config. */
    await page.keyboard.press('p');
    expect(await page.getAttribute('#shpfill', 'aria-pressed'), 'the ellipse has its own').toBe('false');
    await page.keyboard.press('u');
    expect(await page.getAttribute('#shpfill', 'aria-pressed')).toBe('true');
  });

  test('rectangle: rounded corners are get_rounded_rect_points', async ({ page }) => {
    await page.keyboard.press('u');
    await page.evaluate(() => { const r = $('shprad'); r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await drag(page, [3, 4], [10, 9]);
    expect(await cells(page)).toEqual(sorted(shift(ROUND_8x6_R2, 3, 4)));
    await page.click('#undo');
    await page.click('#shpfill');
    await drag(page, [3, 4], [10, 9]);
    /* Rows 4,6,8,8,6,4 wide. */
    expect((await cells(page)).length).toBe(36);
  });

  test('rectangle: Shift squares off the shorter side, Ctrl grows from the centre', async ({ page }) => {
    await page.keyboard.press('u');
    /* (5,5)->(12,9): sides 7 and 4, the square takes 4, anchored at the
       origin: 5x5 at (5,5). */
    await drag(page, [5, 5], [12, 9], { shift: true });
    expect(await cells(page)).toEqual(sorted(rectOutline(5, 5, 5, 5)));
    await page.click('#undo');
    /* Centre: origin (10,10), pointer (13,12), size (3,2) mirrored through
       the origin gives (7,8)..(13,12), 7 by 5. */
    await drag(page, [10, 10], [13, 12], { ctrl: true });
    expect(await cells(page)).toEqual(sorted(rectOutline(7, 8, 7, 5)));
    await page.click('#undo');
    /* Both: the LONGER side, 3, squared and mirrored: (7,7)..(13,13). */
    await drag(page, [10, 10], [13, 12], { ctrl: true, shift: true });
    expect(await cells(page)).toEqual(sorted(rectOutline(7, 7, 7, 7)));
  });

  test('rectangle: Alt pressed DURING the drag moves the start by the travel; held before, it does nothing', async ({ page }) => {
    await page.keyboard.press('u');
    /* Press at (5,5), out to (8,8), then Alt, then on to (10,10): the start
       follows the last leg, (5,5)+(2,2), and the box is (7,7)..(10,10). */
    await drag(page, [5, 5], [10, 10], { via: [{ to: [8, 8] }, { altDown: true }, { to: [10, 10] }, { altUp: true }] });
    expect(await cells(page)).toEqual(sorted(rectOutline(7, 7, 4, 4)));
    await page.click('#undo');
    /* Alt down before the press: upstream reads the key EVENT while drawing,
       and there is none, so the box is the plain (5,5)..(8,8). */
    await drag(page, [5, 5], [8, 8], { altHeld: true });
    expect(await cells(page)).toEqual(sorted(rectOutline(5, 5, 4, 4)));
  });

  test('ELLIPSE: PIXELORAMA\'S POINT SET, outline and filled, and a circle with Shift', async ({ page }) => {
    await page.keyboard.press('p');
    await drag(page, [2, 2], [7, 5]);
    expect(await cells(page)).toEqual(sorted(shift(ELLIPSE_6x4, 2, 2)));
    await page.click('#undo');
    await page.click('#shpfill');
    await drag(page, [2, 2], [7, 5]);
    expect(await cells(page)).toEqual(sorted(shift(ELLIPSE_6x4_FILL, 2, 2)));
    await page.click('#undo');
    await page.click('#shpfill');
    /* (10,10)->(14,16): sides 5 and 7, the circle takes 5, at (10,10). */
    await drag(page, [10, 10], [14, 16], { shift: true });
    expect(await cells(page)).toEqual(sorted(shift(CIRCLE_5, 10, 10)));
  });

  test('ellipse: thickness expands every point by the brush', async ({ page }) => {
    await page.keyboard.press('p');
    await page.evaluate(() => setBrush(3));
    await drag(page, [4, 4], [9, 7]);
    /* Every border cell of the 6x4 at (4,4) grown to 3x3 - the union, which
       is the 8x6 box around it minus the four corners no block reaches:
       the corners of the box are (3,3),(10,3),(3,8),(10,8), and the nearest
       border cells (1,0)/(0,1) shifted are (5,4)/(4,5), whose blocks reach
       (4..6,3..5)/(3..5,4..6) - neither covers (3,3). 48 - 4 = 44. */
    const got = await cells(page);
    expect(got.length).toBe(44);
    for (const c of ['3,3', '10,3', '3,8', '10,8']) expect(got, c + ' is outside every block').not.toContain(c);
  });

  test('COMMITS THROUGH ONE UNDO STEP, AND A NO-OP COSTS NONE', async ({ page }) => {
    await page.keyboard.press('u');
    const before = await page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
    const depth = await undoDepth(page);
    await drag(page, [3, 4], [10, 9]);
    expect(await undoDepth(page)).toBe(depth + 1);
    /* The same shape again changes nothing, and is refused before it can
       take an entry. */
    await drag(page, [3, 4], [10, 9]);
    expect(await undoDepth(page), 'no entry for a shape that drew nothing').toBe(depth + 1);
    expect(await page.evaluate(() => $('toast').textContent)).toBe('That drew nothing new');
    await page.click('#undo');
    expect(await page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data])).toEqual(before);
  });

  test('a cancelled pointer lands nothing', async ({ page }) => {
    await page.keyboard.press('u');
    const depth = await undoDepth(page);
    await drag(page, [3, 4], [10, 9], { cancel: true });
    expect(await cells(page)).toEqual([]);
    expect(await undoDepth(page)).toBe(depth);
    expect(await page.evaluate(() => $('shpv').style.display)).toBe('none');
  });

  test('stays inside a selection, preview and commit alike', async ({ page }) => {
    await page.keyboard.press('u');
    /* Only the left eight columns may be painted. Of the 8x6 outline at
       (3,4): five of the top row, five of the bottom, four of the left
       column, none of the right - 14. */
    await page.evaluate(() => { selMask = new Uint8Array(art.width * art.height); for (let y = 0; y < art.height; y++) for (let x = 0; x < 8; x++) selMask[y * art.width + x] = 1; });
    await drag(page, [3, 4], [10, 9]);
    expect(await cells(page)).toEqual(sorted(rectOutline(3, 4, 8, 6).filter(p => p[0] < 8)));
    expect((await cells(page)).length).toBe(14);
    await page.evaluate(() => { selMask = null; });
  });

  test('PB.shape DRIVES THE SAME MACHINE WITHOUT A POINTER', async ({ page }) => {
    const dry = await page.evaluate(() => PB.shape({ tool: 'ellipse', from: [2, 2], to: [7, 5], points: true }));
    expect(dry.ok).toBe(true);
    expect(dry.cells, 'twelve cells of border, from the algorithm').toBe(12);
    expect(dry.applied).toBe(false);
    expect([...new Set(dry.points.map(p => p.join(',')))].sort()).toEqual(sorted(shift(ELLIPSE_6x4, 2, 2)));
    expect(await cells(page), 'a dry run paints nothing').toEqual([]);
    expect(await page.evaluate(() => $('shpv').style.display), 'and leaves no preview').toBe('none');
    const wet = await page.evaluate(() => PB.shape({ tool: 'ellipse', from: [2, 2], to: [7, 5], apply: true }));
    expect(wet.painted).toBe(12);
    expect(await cells(page)).toEqual(sorted(shift(ELLIPSE_6x4, 2, 2)));
    const again = await page.evaluate(() => PB.shape({ tool: 'ellipse', from: [2, 2], to: [7, 5], apply: true }));
    expect(again.painted, 'the same shape again is nothing').toBe(0);
    expect(again.applied).toBe(false);
    /* Options: fill per tool, thickness through the brush, a bad tool refused. */
    expect(await page.evaluate(() => PB.shapeOptions({ fill: { ellipse: true } }).fill)).toEqual({ rect: false, ellipse: true });
    const filled = await page.evaluate(() => PB.shape({ tool: 'ellipse', from: [12, 2], to: [17, 5], apply: true }));
    expect(filled.painted).toBe(20);
    expect(await page.evaluate(() => PB.shape({ tool: 'star' }).ok)).toBe(false);
    /* Eleven cells, each a 3x3 block, the end blocks reaching one past each
       end: 13 by 3, 39 - the same count the drag test derives. */
    const thick = await page.evaluate(() => PB.shape({ tool: 'line', from: [2, 20], to: [12, 20], thickness: 3 }));
    expect(thick.thickness).toBe(3);
    expect(thick.cells).toBe(39);
    expect(await page.evaluate(() => $('bslab').textContent)).toBe('3 × 3');
  });

  test('pixelPerfect turns the Shift snap into 22.5 degrees with the 2:1 correction', async ({ page }) => {
    /* 21.8 degrees snaps to 22.5, a half step, so the end is put on an exact
       2:1 stair: project (10,4) on (2,1), round to (10,5), f=5, end
       (2*5-1, 1*5-1) = (9,4), and the readout is atan2(1,2) = 26.57 read
       clockwise. This is what LineTool.gd itself always does. */
    await page.evaluate(() => PB.shapeOptions({ pixelPerfect: true }));
    const pp = await page.evaluate(() => PB.shape({ tool: 'line', from: [0, 0], to: [10, 4], shift: true }));
    expect(pp.to).toEqual([9, 4]);
    expect(pp.text).toBe('333.43°');
    await page.evaluate(() => PB.shapeOptions({ pixelPerfect: false }));
    const plain = await page.evaluate(() => PB.shape({ tool: 'line', from: [0, 0], to: [10, 4], shift: true }));
    expect(plain.to).toEqual([10, 3]);
    expect(plain.text).toBe('345°');
  });

  test('the pencil still paints once a shape tool is left', async ({ page }) => {
    await page.keyboard.press('p');
    await drag(page, [2, 2], [7, 5]);
    await page.keyboard.press('b');
    /* Grid snap off: it is a pencil-only block snap, and whether it is inert
       on this art depends on the measured block size, which this test is not
       about. */
    await page.evaluate(() => { if (pressed('gsnap')) toggle('gsnap'); });
    await drag(page, [20, 20], [22, 20]);
    expect(await cells(page)).toEqual(sorted(shift(ELLIPSE_6x4, 2, 2).concat([[20,20],[21,20],[22,20]])));
  });
});
