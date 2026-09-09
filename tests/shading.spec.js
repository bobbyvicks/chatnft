/* The shading brush, ported from Pixelorama's Tools/DesignTools/Shading.gd.

   EVERY EXPECTED BYTE HERE IS DERIVED, NOT OBSERVED. The simple mode is
   Godot's Color.lightened / darkened - channel + (1-channel)*amount, or
   channel*(1-amount) - and a pixel is read as byte/255 and written back as
   trunc(clamp(v*255+0.5)) (Image._set_color_at_ofs in the Godot this
   Pixelorama builds on, features "4.7"; 4.6 and earlier truncated). So on a
   flat (46,92,137):
     lighten 10   46+(255-46)*.1 = 66.9 -> 67   92+16.3=108.3 -> 108   137+11.8=148.8 -> 149
     darken 10    46*.9 = 41.4 -> 41           92*.9=82.8 -> 83        137*.9=123.3 -> 123
     lighten -10  46-20.9 = 25.1 -> 25         92-16.3=75.7 -> 76      137-11.8=125.2 -> 125
     and again    67+18.8 = 85.8 -> 86         108+14.7=122.7 -> 123   149+10.6=159.6 -> 160
   The channels are chosen off multiples of 5, so nothing sits on a half
   where float32 and double could disagree; the one case ON a half is the
   rounding test, which pins 4.7's rule. The hue-shifting numbers come from
   tools/shading-ref.cjs, a reference written from Shading.gd and color.cpp
   that shares no text with the page, run under three float models that all
   agree on every case used here (its output is in REPORT.md).

   THE TESTS DRIVE THE PAGE, not the maths: pointer events on the canvas,
   the panel's own controls, the same key a person presses. A stroke that
   crosses a pixel twice must shade it once; a preview must leave the
   artwork alone; a stroke that changed nothing must cost no undo step. */
import { test, expect } from '@playwright/test';
import { openTrait, setSelect, setField } from './helpers.js';

/* A flat blue-grey with a transparent hole at 40..49 x 40..49 and a row of
   named colours along y=2, one every two cells from x=2. The function is
   stringified by openTrait, so the table lives inside it. */
const ART = (set, W, H) => {
  const named = [[255, 0, 0], [0, 255, 0], [255, 230, 0], [30, 0, 255], [120, 110, 100], [20, 10, 30], [128, 128, 128], [40, 40, 48]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= 40 && x < 50 && y >= 40 && y < 50) set(x, y, [0, 0, 0, 0]);
    else set(x, y, [46, 92, 137]);
  }
  named.forEach((c, i) => set(2 + i * 2, 2, c));
};
/* Where those named colours are. */
const RED = [2, 2], GREEN = [4, 2], NEARYELLOW = [6, 2], NEARBLUE = [8, 2], LOWSAT = [10, 2], DARK = [12, 2], GREY = [14, 2], HALF = [16, 2];
const FLAT = [46, 92, 137];

const px = (page, x, y) => page.evaluate(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data], [x, y]);
const pixels = page => page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
const undoDepth = page => page.evaluate(() => undoStack.length);
const toast = page => page.evaluate(() => document.getElementById('toast').textContent);

/* A press on the canvas, moves on the stage, a release - through the same
   listeners a mouse reaches, with the modifier keys a mouse would carry.
   hold:true leaves the button down so the preview can be looked at. */
const drag = (page, pts, mods = {}) => page.evaluate(async ({ pts, mods }) => {
  const r = art.getBoundingClientRect();
  const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, isPrimary: true,
    ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift });
  art.dispatchEvent(new PointerEvent('pointerdown', at(pts[0][0], pts[0][1])));
  for (const p of pts.slice(1)) stage.dispatchEvent(new PointerEvent('pointermove', at(p[0], p[1])));
  if (mods.hold) return;
  const last = pts[pts.length - 1];
  stage.dispatchEvent(new PointerEvent('pointerup', at(last[0], last[1])));
  await new Promise(x => setTimeout(x, 60));
}, { pts, mods });
const release = (page, p, mods = {}) => page.evaluate(async ({ p, mods }) => {
  const r = art.getBoundingClientRect();
  stage.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + (p[0] + 0.5) * zoom, clientY: r.top + (p[1] + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift }));
  await new Promise(x => setTimeout(x, 60));
}, { p, mods });

/* Godot's Geometry2D.bresenham_line, which draw_fill_gap joins positions
   with - written here from the C++ so the cells a drag must cover are
   derived, not read back. */
function bresenham(a, b) {
  const out = [];
  const dx = Math.abs(b[0] - a[0]) * 2, dy = Math.abs(b[1] - a[1]) * 2;
  const sx = Math.sign(b[0] - a[0]), sy = Math.sign(b[1] - a[1]);
  let x = a[0], y = a[1];
  if (dx > dy) {
    let err = dx / 2;
    while (x !== b[0]) { out.push([x, y]); err -= dy; if (err < 0) { y += sy; err += dx; } x += sx; }
  } else {
    let err = dy / 2;
    while (y !== b[1]) { out.push([x, y]); err -= dx; if (err < 0) { x += sx; err += dy; } y += sy; }
  }
  out.push([x, y]);
  return out;
}
/* Which cells differ from the original, as "x,y" strings. */
async function changed(page, before) {
  const after = await pixels(page);
  const W = await page.evaluate(() => art.width);
  const out = new Set();
  for (let i = 0; i < after.length; i += 4)
    if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2] || after[i + 3] !== before[i + 3])
      out.add(((i / 4) % W) + ',' + Math.floor(i / 4 / W));
  return out;
}

test.describe('the shading tool is wired like a tool', () => {
  test.beforeEach(async ({ page }) => { await openTrait(page, { w: 60, h: 60, draw: ART }); });

  test('SITS BEFORE THE EYEDROPPER, IS REGISTERED, AND X CHOOSES IT', async ({ page }) => {
    const r = await page.evaluate(() => {
      const rail = [...document.querySelectorAll('.tools button')].map(b => b.id || b.dataset.tool);
      return { rail, tools: PB.tools(), panels: RAIL_PANELS.slice(),
        rowsBefore: document.getElementById('shrows').hidden };
    });
    /* BEFORE the eyedropper, not directly before it: every drawing tool a
       patch adds goes in at the same marker, so adjacency is a place no one
       tool can own. It happened to hold here because shading landed last. */
    expect(r.rail.indexOf('shade'), 'before the eyedropper').toBeLessThan(r.rail.indexOf('pick'));
    expect(r.rail.indexOf('shade'), 'and after transform').toBeGreaterThan(r.rail.indexOf('transform'));
    expect(r.rail.indexOf('olbtn'), 'and the outline is still right after it').toBe(r.rail.indexOf('pick') + 1);
    expect(r.tools).toContain('shade');
    expect(r.panels).toContain('sh');
    expect(r.rowsBefore, 'its strip row is hidden while another tool is chosen').toBe(true);
    await page.keyboard.press('x');
    const s = await page.evaluate(() => ({
      pressed: document.querySelector('.tool[data-tool="shade"]').getAttribute('aria-pressed'),
      rows: document.getElementById('shrows').hidden,
      brushRows: document.getElementById('brushrows').hidden,
      summary: document.getElementById('shsum').textContent }));
    expect(s.pressed).toBe('true');
    expect(s.rows, 'the row appears').toBe(false);
    expect(s.brushRows, 'and the brush size stays, because it asked for the brush').toBe(false);
    expect(s.summary).toContain('Lighten');
    expect(s.summary).toContain('amount 10');
    await page.evaluate(() => selectTool('pencil'));
    expect(await page.evaluate(() => document.getElementById('shrows').hidden), 'and goes when the tool does').toBe(true);
  });

  test('the Options button opens the panel; Close and Escape shut it', async ({ page }) => {
    await page.evaluate(() => selectTool('shade'));
    await page.click('#shbtn');
    let r = await page.evaluate(() => ({ hidden: document.getElementById('shscrim').hidden,
      expanded: document.getElementById('shbtn').getAttribute('aria-expanded'),
      cardLeft: document.getElementById('shscrim').firstElementChild.getBoundingClientRect().left,
      railRight: document.querySelector('nav.tools').getBoundingClientRect().right }));
    expect(r.hidden).toBe(false);
    expect(r.expanded).toBe('true');
    expect(r.cardLeft, 'and the card clears the rail, as every pop-out must').toBeGreaterThanOrEqual(r.railRight);
    await page.click('#shclose');
    expect(await page.evaluate(() => document.getElementById('shscrim').hidden)).toBe(true);
    await page.click('#shbtn');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('shscrim').hidden), 'Escape too').toBe(true);
  });

  test('every control in the panel has a title, and the mode shows only its own rows', async ({ page }) => {
    const r = await page.evaluate(() => {
      const card = document.getElementById('shscrim');
      const bare = [...card.querySelectorAll('button,input,select')].filter(e => !e.title).map(e => e.id || e.textContent);
      setChip('shmode', 'hue'); shControls();
      const hue = { simple: document.getElementById('shsimple').hidden, hue: document.getElementById('shhuebox').hidden };
      setChip('shmode', 'simple'); shControls();
      const simple = { simple: document.getElementById('shsimple').hidden, hue: document.getElementById('shhuebox').hidden };
      return { bare, hue, simple };
    });
    expect(r.bare, 'controls without a title').toEqual([]);
    expect(r.hue).toEqual({ simple: true, hue: false });
    expect(r.simple).toEqual({ simple: false, hue: true });
  });
});

test.describe('simple shading', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: ART });
    await page.evaluate(() => { selectTool('shade'); setBrush(1); });
  });

  test('LIGHTENS BY A TENTH OF WHAT IS LEFT, AND ONE UNDO TAKES IT BACK', async ({ page }) => {
    const before = await pixels(page);
    await drag(page, [[5, 5]]);
    expect(await px(page, 5, 5)).toEqual([67, 108, 149, 255]);
    expect(await px(page, 6, 5), 'the neighbour is untouched').toEqual([...FLAT, 255]);
    expect(await changed(page, before), 'exactly one cell').toEqual(new Set(['5,5']));
    expect(await undoDepth(page)).toBe(1);
    await page.click('#undo');
    expect(await px(page, 5, 5)).toEqual([...FLAT, 255]);
  });

  test('darkens by a tenth', async ({ page }) => {
    await setSelect(page, 'shdir', 'darken');
    await drag(page, [[5, 5]]);
    expect(await px(page, 5, 5)).toEqual([41, 83, 123, 255]);
  });

  test('a second stroke starts from what the first left', async ({ page }) => {
    await drag(page, [[5, 5]]);
    await drag(page, [[5, 5]]);
    expect(await px(page, 5, 5)).toEqual([86, 123, 160, 255]);
    expect(await undoDepth(page), 'two strokes, two steps').toBe(2);
  });

  test('a negative amount lightens the other way, as the slider allows', async ({ page }) => {
    await setField(page, 'shamt', -10);
    expect(await page.evaluate(() => document.getElementById('shamtv').textContent), 'the readout follows').toBe('-10');
    await drag(page, [[5, 5]]);
    expect(await px(page, 5, 5)).toEqual([25, 76, 125, 255]);
  });

  test('an amount of zero changes nothing and costs no undo step', async ({ page }) => {
    await setField(page, 'shamt', 0);
    const before = await pixels(page);
    await drag(page, [[5, 5], [9, 9]]);
    expect(await pixels(page)).toEqual(before);
    expect(await undoDepth(page)).toBe(0);
    expect(await toast(page)).toContain('Nothing to shade');
  });

  test('the byte is rounded as Godot 4.7 writes it: 61.5 goes to 62, not 61', async ({ page }) => {
    /* (40,40,48) lightened by a tenth is 61.5, 61.5, 68.7. Godot master's
       _set_color_at_ofs adds 0.5 before the cast; 4.6 and earlier did not
       and would have written 61. This pins which one the port follows. */
    await drag(page, [HALF]);
    expect(await px(page, ...HALF)).toEqual([62, 62, 69, 255]);
  });

  test('transparent pixels are left alone, and a stroke over nothing but them takes no step', async ({ page }) => {
    const before = await pixels(page);
    await drag(page, [[44, 44], [47, 46]]);
    expect(await pixels(page), 'inside the hole nothing changed').toEqual(before);
    expect(await undoDepth(page)).toBe(0);
    expect(await toast(page)).toContain('Nothing to shade');
    /* A brush straddling the hole's edge shades the opaque half only. */
    await page.evaluate(() => setBrush(3));
    await drag(page, [[40, 45]]);
    const c = await changed(page, before);
    expect(c, 'the column outside the hole, three cells').toEqual(new Set(['39,44', '39,45', '39,46']));
    expect(await px(page, 40, 45), 'the hole is still a hole').toEqual([0, 0, 0, 0]);
    expect(await px(page, 39, 45)).toEqual([67, 108, 149, 255]);
  });
});

test.describe('once per stroke', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: ART });
    await page.evaluate(() => { selectTool('shade'); });
  });

  test('A BRUSH THAT CROSSES A PIXEL TWICE IN ONE DRAG SHADES IT ONCE', async ({ page }) => {
    /* Out along y=5 and back again with a 3-wide brush. Every footprint
       overlaps the last, and the return pass covers the whole band a second
       time. Pixelorama's per-stroke mask makes that one shading, so the
       band is uniformly (67,108,149) - a port that re-shaded overlaps would
       show (86,123,160) in the overlaps and the return pass. */
    await page.evaluate(() => setBrush(3));
    const before = await pixels(page);
    await drag(page, [[3, 5], [12, 5], [3, 5]]);
    const want = new Set();
    for (let y = 4; y <= 6; y++) for (let x = 2; x <= 13; x++) want.add(x + ',' + y);
    expect(await changed(page, before)).toEqual(want);
    for (const [x, y] of [[2, 4], [7, 5], [13, 6], [3, 5], [12, 5]])
      expect(await px(page, x, y), x + ',' + y).toEqual([67, 108, 149, 255]);
    expect(await undoDepth(page), 'one stroke, one step').toBe(1);
  });

  test('and a drag covers exactly the Bresenham line between its positions', async ({ page }) => {
    await page.evaluate(() => setBrush(1));
    const before = await pixels(page);
    await drag(page, [[20, 20], [31, 26]]);
    const want = new Set(bresenham([20, 20], [31, 26]).map(p => p.join(',')));
    expect(want.size, 'the line is the long axis plus one').toBe(12);
    expect(await changed(page, before)).toEqual(want);
    for (const p of want) { const [x, y] = p.split(',').map(Number); expect(await px(page, x, y), p).toEqual([67, 108, 149, 255]); }
  });

  test('the footprint is the square the cursor shows, and a selection confines it', async ({ page }) => {
    await page.evaluate(() => setBrush(3));
    let before = await pixels(page);
    await drag(page, [[20, 20]]);
    const want = new Set();
    for (let y = 19; y <= 21; y++) for (let x = 19; x <= 21; x++) want.add(x + ',' + y);
    expect(await changed(page, before)).toEqual(want);
    /* Now only one cell is allowed. */
    before = await pixels(page);
    await page.evaluate(() => { selMask = new Uint8Array(art.width * art.height); selMask[30 * art.width + 30] = 1; });
    try {
      await drag(page, [[30, 30]]);
      expect(await changed(page, before)).toEqual(new Set(['30,30']));
      expect(await px(page, 30, 30)).toEqual([67, 108, 149, 255]);
    } finally { await page.evaluate(() => { selMask = null; }); }
  });
});

test.describe('Ctrl and Shift', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: ART });
    await page.evaluate(() => { selectTool('shade'); setBrush(1); });
  });

  test('CTRL AT THE PRESS DOES THE OTHER ONE, as change_tool_mode does', async ({ page }) => {
    await drag(page, [[5, 5]], { ctrl: true });
    expect(await px(page, 5, 5), 'lighten mode, but darkened').toEqual([41, 83, 123, 255]);
    await setSelect(page, 'shdir', 'darken');
    await drag(page, [[6, 5]], { ctrl: true });
    expect(await px(page, 6, 5), 'darken mode, but lightened').toEqual([67, 108, 149, 255]);
  });

  test('SHIFT MAKES A STRAIGHT LINE, previewed on its own layer and landed on release', async ({ page }) => {
    const before = await pixels(page);
    await drag(page, [[20, 20], [31, 26]], { shift: true, hold: true });
    const mid = await page.evaluate(() => ({ pv: document.getElementById('sdpv').style.display, undo: undoStack.length }));
    expect(await pixels(page), 'while the button is down the artwork is untouched').toEqual(before);
    expect(mid.pv, 'and the preview layer is showing').toBe('block');
    await release(page, [31, 26], { shift: true });
    const want = new Set(bresenham([20, 20], [31, 26]).map(p => p.join(',')));
    expect(await changed(page, before)).toEqual(want);
    expect(await page.evaluate(() => document.getElementById('sdpv').style.display), 'the preview is gone').toBe('none');
    expect(await undoDepth(page)).toBe(1);
  });

  test('and Ctrl on the line snaps it to fifteen degrees, as draw_snap_angle does', async ({ page }) => {
    /* From (10,10) toward (20,12): atan2(2,10) is 11.31 degrees, which
       snaps to 15. The end is start + (cos 15, sin 15) * sqrt(104) =
       (19.85, 12.64), rounded to (20,13). The unsnapped line would have
       ended on (20,12), which is not on the snapped one. Ctrl also flips
       the direction, so the line is darkened. */
    const before = await pixels(page);
    await drag(page, [[10, 10], [20, 12]], { shift: true, ctrl: true });
    const want = new Set(bresenham([10, 10], [20, 13]).map(p => p.join(',')));
    expect(want.has('20,12'), 'the control: the unsnapped end is off the snapped line').toBe(false);
    expect(await changed(page, before)).toEqual(want);
    expect(await px(page, 20, 13)).toEqual([41, 83, 123, 255]);
  });
});

test.describe('hue shifting', () => {
  /* Derived by tools/shading-ref.cjs from Shading.gd's LightenDarkenOp and
     Godot's Color; three float models agree on every one. Value is 0 in the
     cap tests so the +value cannot push two channels to 255 and hide
     whether the hue stopped where it should. */
  const hue = async (page, dir, h, s, v) => {
    await setSelect(page, 'shmode', 'hue');
    await setSelect(page, 'shdir', dir);
    await setField(page, 'shhue', h); await setField(page, 'shsat', s); await setField(page, 'shval', v);
  };
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: ART });
    await page.evaluate(() => { selectTool('shade'); setBrush(1); });
  });

  test('RED LIGHTENS TOWARD YELLOW: hue up, saturation down, value up', async ({ page }) => {
    /* h 0 -> 10/360; s 1 -> 0.9; v 1 -> 1.1. set_hsv gives (1.1, 0.275,
       0.11): 255 clamped, 70.125 -> 70, 28.05 -> 28. */
    await hue(page, 'lighten', 10, 10, 10);
    await drag(page, [RED]);
    expect(await px(page, ...RED)).toEqual([255, 70, 28, 255]);
  });

  test('green lightens toward yellow too, which is DOWN the wheel from it', async ({ page }) => {
    /* Between yellow and blue hue_range reverses the shift: h 1/3 -> 0.3056,
       not 0.3611. A port without the reversal would head for cyan. */
    await hue(page, 'lighten', 10, 10, 10);
    await drag(page, [GREEN]);
    expect(await px(page, ...GREEN)).toEqual([70, 255, 28, 255]);
  });

  test('lightening stops AT yellow', async ({ page }) => {
    /* (255,230,0) is 54 degrees; 20 more would pass yellow (60), so the shift
       is cut to land on it: set_hsv(1/6, 0.8, 1) = (255,255,51). Five degrees
       stays under it and gives (255,252,51). */
    await hue(page, 'lighten', 20, 20, 0);
    await drag(page, [NEARYELLOW]);
    expect(await px(page, ...NEARYELLOW)).toEqual([255, 255, 51, 255]);
    await page.click('#undo');
    await hue(page, 'lighten', 5, 20, 0);
    await drag(page, [NEARYELLOW]);
    expect(await px(page, ...NEARYELLOW), 'under the cap the hue moves by what was asked').toEqual([255, 252, 51, 255]);
  });

  test('darkening stops AT blue', async ({ page }) => {
    /* (30,0,255) is 247 degrees; darkening turns hue toward blue (240) and
       20 degrees would pass it, so it lands on it: (0,0,255). Five degrees
       stays short: (9,0,255). */
    await hue(page, 'darken', 20, 0, 0);
    await drag(page, [NEARBLUE]);
    expect(await px(page, ...NEARBLUE)).toEqual([0, 0, 255, 255]);
    await page.click('#undo');
    await hue(page, 'darken', 5, 0, 0);
    await drag(page, [NEARBLUE]);
    expect(await px(page, ...NEARBLUE)).toEqual([9, 0, 255, 255]);
  });

  test('saturation is never lightened below a tenth', async ({ page }) => {
    /* (120,110,100): s = 20/120 = 0.1667; taking 0.3 away would go to 0, and
       the floor holds it at 0.1: (133,126,119), not a grey. */
    await hue(page, 'lighten', 0, 30, 5);
    await drag(page, [LOWSAT]);
    expect(await px(page, ...LOWSAT)).toEqual([133, 126, 119, 255]);
  });

  test('value is never darkened below a tenth', async ({ page }) => {
    /* (20,10,30): v = 30/255 = 0.118; taking 0.3 away would go to 0, and the
       floor holds it at 0.1: the blue channel is 0.1*255 = 25.5 -> 26. */
    await hue(page, 'darken', 0, 10, 30);
    await drag(page, [DARK]);
    expect(await px(page, ...DARK)).toEqual([16, 6, 26, 255]);
  });

  test('a grey stays a grey: no hue, no saturation, only value', async ({ page }) => {
    /* s is 0, so set_hsv leaves r=g=b and the +0.12 is all that happens:
       128/255+0.12 = 0.622 -> 158.6 -> 159. */
    await hue(page, 'lighten', 10, 10, 12);
    await drag(page, [GREY]);
    expect(await px(page, ...GREY)).toEqual([159, 159, 159, 255]);
  });
});

test.describe('PB.shade drives the same tool', () => {
  test.beforeEach(async ({ page }) => { await openTrait(page, { w: 60, h: 60, draw: ART }); });

  test('SETS THE PANEL, SELECTS THE TOOL, AND SHADES THROUGH THE HOOKS', async ({ page }) => {
    const r = await page.evaluate(() => PB.shade({ dir: 'darken', mode: 'simple', amount: 10, size: 1, points: [[3, 3]] }));
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(1);
    expect(r.undo).toBe(true);
    expect(await px(page, 3, 3)).toEqual([41, 83, 123, 255]);
    const s = await page.evaluate(() => ({ tool: document.querySelector('.tool[data-tool="shade"]').getAttribute('aria-pressed'),
      chip: chipVal('shdir'), shading: PB.shading() }));
    expect(s.tool, 'the tool is chosen, as a person would see').toBe('true');
    expect(s.chip, 'and the panel shows what was asked').toBe('darken');
    expect(s.shading.lighten).toBe(false);
    expect(s.shading.amount).toBe(10);
  });

  test('a path is once per pixel here too, and a line is a line', async ({ page }) => {
    const before = await pixels(page);
    const r = await page.evaluate(() => PB.shade({ dir: 'lighten', mode: 'simple', amount: 10, size: 3, points: [[3, 5], [12, 5], [3, 5]] }));
    expect(r.changed, '12 by 3 cells').toBe(36);
    expect(await px(page, 7, 5)).toEqual([67, 108, 149, 255]);
    await page.click('#undo');
    expect(await pixels(page)).toEqual(before);
    const l = await page.evaluate(() => PB.shade({ size: 1, line: true, points: [[20, 20], [31, 26]] }));
    expect(l.changed).toBe(12);
    expect(await changed(page, before)).toEqual(new Set(bresenham([20, 20], [31, 26]).map(p => p.join(','))));
  });

  test('over nothing it says so and takes no step', async ({ page }) => {
    const r = await page.evaluate(() => PB.shade({ size: 1, points: [[44, 44]] }));
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(0);
    expect(r.undo).toBe(false);
    expect(await undoDepth(page)).toBe(0);
    const bad = await page.evaluate(() => PB.shade({}));
    expect(bad.ok).toBe(false);
  });
});
