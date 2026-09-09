/* Pixel perfect and symmetry, ported from Pixelorama.

   Every expected pixel set here is DERIVED from the rule in Classes/Drawers.gd
   and Tools.gd get_mirrored_positions by walking it on paper - the traces are
   in the comments - not read off a run and pasted back. Three of the cases
   exist to tell Pixelorama's rule from the obvious near-miss: the 2:1 line,
   which a drawer that forgets `last_pixels[0] = corner` thins to nothing; the
   even-brush mirror, which a "mirror the centre" port puts one cell out; and
   the axis column of an odd canvas, where a port that de-duplicated a mirror
   landing on its own source would come out cleaner than Pixelorama does.

   Strokes go in as the pointer events a drag is made of - the press on #art,
   the moves and the release on #stage - one cell per move, so the sequence
   stroke() sees is exactly the one written here and nothing depends on the
   line rasteriser. */
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const W = 40, H = 30;
const EMPTY = () => {};
const FLAT = (set, W, H) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 90]); };
const RED = [255, 0, 0];

const drag = (page, cells) => page.evaluate(async (cells) => {
  const r = art.getBoundingClientRect();
  const ev = (type, c) => new PointerEvent(type, {
    clientX: r.left + (c[0] + 0.5) * zoom, clientY: r.top + (c[1] + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    isPrimary: true, bubbles: true });
  art.dispatchEvent(ev('pointerdown', cells[0]));
  for (const c of cells.slice(1)) stage.dispatchEvent(ev('pointermove', c));
  stage.dispatchEvent(ev('pointerup', cells[cells.length - 1]));
  await new Promise(x => setTimeout(x, 60));
}, cells);

/* Every opaque pixel of exactly this colour, as [x,y], sorted by x then y. */
const where = (page, rgb) => page.evaluate((c) => {
  const W = art.width, H = art.height, d = ctx.getImageData(0, 0, W, H).data, out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] === 255 && d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) out.push([x, y]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}, rgb);
const px = (page, x, y) => page.evaluate(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data], [x, y]);
const pixels = (page) => page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
const on = (page, ids) => page.evaluate((ids) => {
  for (const id of ids) if (document.getElementById(id).getAttribute('aria-pressed') !== 'true') document.getElementById(id).click();
  return { pp: pressed('ppbtn'), h: pressed('symh'), v: pressed('symv') };
}, ids);
const sortXY = a => a.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);

test.describe('pixel perfect', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: EMPTY });
    await page.evaluate(() => { selectTool('pencil'); setColor('#ff0000'); setBrush(1); });
  });

  test('A STAIRCASE COMES OUT ONE PIXEL WIDE, and the control does not', async ({ page }) => {
    /* Drawers.gd, walked: history [null,null].
       (2,2) -> [null,(2,2)]  (3,2) -> [(2,2),(3,2)]
       (3,3): corner (2,2) diff (1,1) CORNER, neighbour (3,2) diff (0,1) NEIGHBOUR
              -> (3,2) restored, history [(2,2),(3,3)]
       (4,3): corner (2,2) diff (2,1) not a corner        -> [(3,3),(4,3)]
       (4,4): corner (3,3) (1,1), neighbour (4,3) (0,1)   -> (4,3) restored, [(3,3),(4,4)]
       (5,4): corner (3,3) (2,1)                          -> [(4,4),(5,4)]
       (5,5): corner (4,4) (1,1), neighbour (5,4) (0,1)   -> (5,4) restored
       Left: the diagonal, four pixels. */
    const path = [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [5, 5]];
    expect(await on(page, ['ppbtn'])).toEqual({ pp: true, h: false, v: false });
    await drag(page, path);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 3], [4, 4], [5, 5]]);
    /* The control: the same drag with it off paints every cell. A port that
       dropped corners whatever the button said would pass the half above. */
    await page.evaluate(() => { document.getElementById('ppbtn').click(); });
    await drag(page, path.map(([x, y]) => [x + 10, y]));
    expect(await where(page, RED)).toEqual(sortXY([[2, 2], [3, 3], [4, 4], [5, 5]].concat(path.map(([x, y]) => [x + 10, y]))));
  });

  test('A 2:1 LINE KEEPS THE ELBOW THE CORNER REPLACED', async ({ page }) => {
    /* The case that tells Pixelorama's rule from "remove every elbow".
       (2,2),(3,2) -> [(2,2),(3,2)]
       (4,2): corner (2,2) diff (2,0)                          -> [(3,2),(4,2)]
       (4,3): corner (3,2) (1,1), neighbour (4,2) (0,1)        -> (4,2) restored,
              and the corner takes its slot: [(3,2),(4,3)]
       (5,3): corner (3,2) diff (2,1) NOT a corner             -> [(4,3),(5,3)]
              A drawer that kept [(4,2),(4,3)] would see corner (4,2) diff (1,1)
              and neighbour (4,3) diff (1,0) here, and take (4,3) out as well -
              leaving (2,2),(3,2),(5,3): a line with a hole in it.
       (6,3): corner (4,3) (2,0)                               -> [(5,3),(6,3)]
       (6,4): corner (5,3) (1,1), neighbour (6,3) (0,1)        -> (6,3) restored. */
    await on(page, ['ppbtn']);
    await drag(page, [[2, 2], [3, 2], [4, 2], [4, 3], [5, 3], [6, 3], [6, 4]]);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 2], [4, 3], [5, 3], [6, 4]]);
  });

  test('the elbow goes back to what was under it, not to nothing', async ({ page }) => {
    /* last_pixels carries the colour that was read BEFORE the dab, and the
       restore writes that colour - so over paint the elbow comes back painted. */
    await page.evaluate(() => { dab(3, 2, [0, 0, 255], 255); });
    await on(page, ['ppbtn']);
    await drag(page, [[2, 2], [3, 2], [3, 3]]);
    expect(await px(page, 3, 2), 'the blue that was there').toEqual([0, 0, 255, 255]);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 3]]);
  });

  test('THE HISTORY IS EMPTIED BETWEEN STROKES', async ({ page }) => {
    /* Pencil.gd draw_start calls _drawer.reset(). Stroke A leaves the history
       at [(2,2),(3,2)]; stroke B's first dab (3,3) would then see corner (2,2)
       diff (1,1) and neighbour (3,2) diff (0,1) and take (3,2) out - an elbow
       between two strokes that were never one line. With the reset, B starts
       at [null,null] and its two dabs never reach a corner: four pixels. */
    await on(page, ['ppbtn']);
    await drag(page, [[2, 2], [3, 2]]);
    await drag(page, [[3, 3], [4, 3]]);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 2], [3, 3], [4, 3]]);
  });

  test('only while the brush is 1', async ({ page }) => {
    /* _prepare_tool: pixel_perfect only when _brush_size == 1. At 2 every
       cell is a 2x2 block hanging right and down of it: (3,2) covers 3..4 x
       2..3, (2,2) covers 2..3 x 2..3, (2,3) covers 2..3 x 3..4 - eight pixels.
       The L turns LEFT on purpose. A rule wrongly applied at brush 2 records
       what was under the elbow CELL (2,2) before its own dab, and with a
       left turn that cell lies outside the corner's block, so it reads clear
       and the restore would take (2,2) out: seven pixels. With a right turn
       the elbow cell sits inside the corner's block, reads paint, and the
       wrong rule restores paint over paint - invisible. Measured: the
       right-turn form of this test stayed green with the guard removed. */
    await on(page, ['ppbtn']);
    await page.evaluate(() => setBrush(2));
    await drag(page, [[3, 2], [2, 2], [2, 3]]);
    expect(await where(page, RED)).toEqual([[2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3]]);
  });

  test('ONE STROKE IS ONE UNDO STEP, elbows included', async ({ page }) => {
    await page.evaluate(() => { dab(3, 2, [0, 0, 255], 255); });
    const before = await pixels(page);
    await on(page, ['ppbtn']);
    await drag(page, [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]]);
    expect(await page.evaluate(() => undoStack.length)).toBe(1);
    expect(await pixels(page)).not.toEqual(before);
    await page.click('#undo');
    await page.waitForTimeout(150);
    expect(await pixels(page), 'every byte back, including the elbow that was restored mid-stroke').toEqual(before);
  });
});

test('THE ERASER FOLLOWS THE SAME RULE, and its elbows come back as paint', async ({ page }) => {
  /* EraseOp reads the old colour like any other op, so the restored elbow is
     the paint the eraser had taken, not a transparent pixel. */
  await openTrait(page, { w: W, h: H, draw: FLAT });
  await page.evaluate(() => { selectTool('eraser'); setBrush(1); });
  await on(page, ['ppbtn']);
  await drag(page, [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]]);
  const gone = await page.evaluate(() => {
    const W = art.width, H = art.height, d = ctx.getImageData(0, 0, W, H).data, out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] === 0) out.push([x, y]);
    return out;
  });
  expect(gone).toEqual([[2, 2], [3, 3], [4, 4]]);
  expect(await px(page, 3, 2)).toEqual([200, 120, 90, 255]);
  expect(await px(page, 4, 3)).toEqual([200, 120, 90, 255]);
});

test.describe('symmetry', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: EMPTY });
    await page.evaluate(() => { selectTool('pencil'); setColor('#ff0000'); setBrush(1); });
  });

  test('THE HORIZONTAL MIRROR REFLECTS THE BLOCK, not the centre', async ({ page }) => {
    /* x_symmetry_point = W-1 = 39, so x mirrors to 39-x. dab hangs an even
       brush right and down of its cell, so the 2-brush at (5,12) covers
       5..6 and its reflection is 33..34 - a port that dabbed at 39-5 = 34
       would cover 34..35 and paint (35,12). The 3-brush is centred: 4..6
       reflects to 33..35. */
    await on(page, ['symh']);
    await drag(page, [[5, 7]]);
    await page.evaluate(() => setBrush(2));
    await drag(page, [[5, 12]]);
    await page.evaluate(() => setBrush(3));
    await drag(page, [[5, 17]]);
    const want = [[5, 7], [34, 7]];
    for (const y of [12, 13]) for (const x of [5, 6, 33, 34]) want.push([x, y]);
    for (const y of [16, 17, 18]) for (const x of [4, 5, 6, 33, 34, 35]) want.push([x, y]);
    expect(await where(page, RED)).toEqual(sortXY(want));
  });

  test('the vertical mirror, and both at once', async ({ page }) => {
    /* y_symmetry_point = H-1 = 29. Both on: h, then the h-of-v corner, then v
       - four quarters. A 2-brush at (8,10) covers 8..9 x 10..11; reflected in
       y it covers 18..19 (29-11 .. 29-10), in x 30..31. */
    await on(page, ['symv']);
    await drag(page, [[5, 7]]);
    expect(await where(page, RED)).toEqual([[5, 7], [5, 22]]);
    await on(page, ['symh']);
    await drag(page, [[8, 4]]);
    await page.evaluate(() => setBrush(2));
    await drag(page, [[8, 10]]);
    const want = [[5, 7], [5, 22], [8, 4], [31, 4], [31, 25], [8, 25]];
    for (const y of [10, 11, 18, 19]) for (const x of [8, 9, 30, 31]) want.push([x, y]);
    expect(await where(page, RED)).toEqual(sortXY(want));
  });

  test('EACH MIRROR KEEPS ITS OWN PIXEL-PERFECT HISTORY', async ({ page }) => {
    /* Drawers.gd gives drawers[i+1] to the i-th mirror. The staircase from the
       first test on the left, and its reflection on the right - (37,2),(36,3),
       (35,4) with (36,2),(35,3) taken out by the mirror's own history. One
       shared history would interleave (2,2),(37,2),(3,2),(36,2),... and never
       see a corner: ten pixels instead of six. */
    await on(page, ['ppbtn', 'symh']);
    await drag(page, [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]]);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 3], [4, 4], [35, 4], [36, 3], [37, 2]]);
  });

  test('ON THE AXIS COLUMN OF AN ODD CANVAS the mirror reads what its source just laid, as Pixelorama does', async ({ page }) => {
    /* W = 41: x mirrors to 40-x, and column 20 mirrors onto itself.
       get_mirrored_positions does not drop a mirror equal to its source, and
       drawers[1] reads color_old AFTER drawers[0] painted. Walked, per dab
       stream 0 then stream 1:
       (19,2): s0 paints (19,2); s1 paints (21,2).
       (20,2): s0 records clear, paints; s1 records RED (s0's), paints again.
       (20,3): s0 corner (19,2) diff (1,1), neighbour (20,2) diff (0,1)
               -> puts (20,2) back to CLEAR;
               s1 corner (21,2) diff (-1,1), neighbour (20,2) diff (0,1)
               -> puts (20,2) back to what IT recorded: RED.
       So the elbow on the axis stays: (19,2),(20,2),(20,3),(21,2).
       The control is the same L one column further left, off the axis, where
       both elbows go: (9,2),(10,3) and (30,3),(31,2). */
    await openTrait(page, { w: 41, h: H, draw: EMPTY });
    await page.evaluate(() => { selectTool('pencil'); setColor('#ff0000'); setBrush(1); });
    await on(page, ['ppbtn', 'symh']);
    await drag(page, [[19, 2], [20, 2], [20, 3]]);
    expect(await where(page, RED)).toEqual([[19, 2], [20, 2], [20, 3], [21, 2]]);
    await drag(page, [[9, 2], [10, 2], [10, 3]]);
    expect(await where(page, RED)).toEqual([[9, 2], [10, 3], [19, 2], [20, 2], [20, 3], [21, 2], [30, 3], [31, 2]]);
  });

  test('a selection refuses a mirror it does not reach, and the whole dab when the pointer is outside', async ({ page }) => {
    /* _set_pixel_no_cache returns before the drawer when the pointer's own
       pixel cannot be drawn, so the mirrors go with it; Drawer.set_pixel
       skips each mirror that cannot be drawn on its own. */
    await on(page, ['symh']);
    await page.evaluate(() => {
      selMask = new Uint8Array(art.width * art.height);
      for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width / 2; x++) selMask[y * art.width + x] = 1;
    });
    await drag(page, [[5, 7]]);
    expect(await where(page, RED), 'inside: painted, its mirror outside: not').toEqual([[5, 7]]);
    await drag(page, [[34, 9]]);
    expect(await where(page, RED), 'outside: nothing, not even the mirror that would have been inside').toEqual([[5, 7]]);
    /* And with pixel perfect, the same refusals, by the other branch. */
    await on(page, ['ppbtn']);
    await drag(page, [[6, 12]]);
    await drag(page, [[33, 14]]);
    expect(await where(page, RED)).toEqual([[5, 7], [6, 12]]);
    await page.evaluate(() => { selMask = null; });
  });

  test('THE GUIDES ARE ON THEIR OWN LAYER, follow the zoom, and go away', async ({ page }) => {
    const art0 = await pixels(page);
    expect(await page.evaluate(() => document.getElementById('symgd').style.display || 'none')).toBe('none');
    await on(page, ['symh']);
    let g = await page.evaluate(() => {
      const g = document.getElementById('symgd'), c = g.getContext('2d');
      const at = (x, y) => [...c.getImageData(x, y, 1, 1).data];
      const cx = Math.round(art.width / 2 * zoom);
      return { display: g.style.display, w: g.width, want: Math.round(art.width * zoom), zoom,
        /* A 2px line centred on cx fills columns cx-1 and cx and nothing
           else; a 4px one would also fill cx-2 and cx+1. */
        onLine: at(cx, 2), leftOfLine: at(cx - 1, 2), rightOff: at(cx + 1, 2), leftOff: at(cx - 2, 2),
        farLeft: at(2, 2), midRow: at(2, Math.round(art.height / 2 * zoom)) };
    });
    expect(g.display).toBe('block');
    expect(g.w, 'sized to the art on screen').toBe(g.want);
    /* PURPLE (160,32,240) lerped 0.6 toward (.2,.2,.65): (95,43,195). */
    expect(g.onLine, 'the vertical centre line, in the guide colour').toEqual([95, 43, 195, 255]);
    expect(g.leftOfLine, 'and the column to its left').toEqual([95, 43, 195, 255]);
    expect(g.rightOff[3], 'two pixels wide, not four: nothing at cx+1').toBe(0);
    expect(g.leftOff[3], 'nor at cx-2').toBe(0);
    expect(g.farLeft[3]).toBe(0);
    expect(g.midRow[3], 'no horizontal line for the horizontal mirror').toBe(0);
    expect(await pixels(page), 'and not a pixel of art').toEqual(art0);
    await page.evaluate(() => setZoom(zoom > 4 ? zoom - 2 : zoom + 2));
    g = await page.evaluate(() => ({ w: document.getElementById('symgd').width, want: Math.round(art.width * zoom) }));
    expect(g.w, 'follows the zoom').toBe(g.want);
    await on(page, ['symv']);
    g = await page.evaluate(() => {
      const c = document.getElementById('symgd').getContext('2d');
      return [...c.getImageData(2, Math.round(art.height / 2 * zoom), 1, 1).data];
    });
    expect(g, 'the horizontal centre line for the vertical mirror').toEqual([95, 43, 195, 255]);
    await page.evaluate(() => { document.getElementById('symh').click(); document.getElementById('symv').click(); });
    expect(await page.evaluate(() => document.getElementById('symgd').style.display)).toBe('none');
  });

  test('PB drives the same buttons and the same path', async ({ page }) => {
    const r = await page.evaluate(() => PB.strokeOpts({ pixelPerfect: true, mirrorH: true }));
    expect(r).toEqual({ pixelPerfect: true, mirrorH: true, mirrorV: false });
    expect(await page.evaluate(() => [pressed('ppbtn'), pressed('symh'), pressed('symv')])).toEqual([true, true, false]);
    const s = await page.evaluate(() => PB.stroke([[2, 2], [3, 2], [3, 3]]));
    expect(s.ok).toBe(true);
    expect(await where(page, RED)).toEqual([[2, 2], [3, 3], [36, 3], [37, 2]]);
    expect(await page.evaluate(() => undoStack.length), 'one undo step, like a drag').toBe(1);
    expect((await page.evaluate(() => PB.stroke([]))).ok).toBe(false);
    expect((await page.evaluate(() => PB.stroke([[1, 1]], { tool: 'fill' }))).ok, 'only the pencil and the eraser stroke').toBe(false);
    const off = await page.evaluate(() => PB.strokeOpts({ pixelPerfect: false, mirrorH: false, mirrorV: false }));
    expect(off).toEqual({ pixelPerfect: false, mirrorH: false, mirrorV: false });
    expect(await page.evaluate(() => document.getElementById('symgd').style.display)).toBe('none');
  });

  test('THE STRIP STAYS A STRIP: the toggles share the colour\'s line and hide with the brush rows', async ({ page }) => {
    /* At 1280 wide .opts is a 274px column and Snap's row is full, so the
       three sit beside the colour on the line above - measured: the strip
       was 79px without them and 113px with them under Snap. panel.spec.js
       pins a 90px ceiling; this pins the placement that keeps it. */
    const m = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const s = document.querySelector('.opts').getBoundingClientRect();
      const top = r('clbtn').top;
      return { height: Math.round(s.height), viewport: innerWidth,
        sameLine: ['ppbtn', 'symh', 'symv'].every(id => Math.abs(r(id).top - top) < 8 && r(id).right <= s.right + 1),
        aboveSnap: r('gsnap').top > r('ppbtn').bottom - 1 };
    });
    expect(m.viewport).toBe(1280);
    expect(m.height, 'no taller than a strip').toBeLessThan(90);
    expect(m.sameLine, 'on the colour\'s line, inside the strip').toBe(true);
    expect(m.aboveSnap, 'and above Snap, not beside it').toBe(true);
    /* Hidden with Snap for a tool they do not apply to, back with the pencil. */
    await page.evaluate(() => selectTool('fill'));
    expect(await page.evaluate(() => document.getElementById('strokeopts').hidden)).toBe(true);
    await page.evaluate(() => selectTool('pencil'));
    expect(await page.evaluate(() => document.getElementById('strokeopts').hidden)).toBe(false);
  });

  test('the controls have a title, light up, and are remembered', async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (const id of ['ppbtn', 'symh', 'symv']) {
        const b = document.getElementById(id);
        const off = getComputedStyle(b).backgroundColor;
        b.click();
        out[id] = { title: b.title.length > 20, pressed: b.getAttribute('aria-pressed'),
          lights: getComputedStyle(b).backgroundColor !== off, inStrip: !!b.closest('#optsbar') };
      }
      return out;
    });
    for (const id of ['ppbtn', 'symh', 'symv'])
      expect(r[id], id).toEqual({ title: true, pressed: 'true', lights: true, inStrip: true });
    /* Tools.gd reads the three back from config_cache at startup. */
    await openTrait(page, { w: W, h: H, draw: EMPTY });
    expect(await page.evaluate(() => [pressed('ppbtn'), pressed('symh'), pressed('symv')])).toEqual([true, true, true]);
    expect(await page.evaluate(() => document.getElementById('symgd').style.display), 'and the guides come up with them').toBe('block');
  });
});
