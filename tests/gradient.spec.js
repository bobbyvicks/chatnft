/* Pixelorama's gradient tool, ported.

   Every number here is DERIVED from Gradient.gd and Gradient.gdshaderinc,
   not read off the screen, and the derivations are written out so a reader
   can check them against the source rather than against this file:

   - Linear: u = 0.5 - ((x+0.5-cx)*dx + (y+0.5-cy)*(W/H)*dy) / ((|dx|+|dy|)*|d|)
     for a drag d from the press c. Angle-from-pointer-back-to-press,
     negated, and the shader's position left at 0, is what centres the ramp
     on the press with u = 0 on the drag-end side.
   - The colour at u is texel floor(u*64) of a 64-wide GradientTexture2D,
     clamped to the ends; texel t holds round(c0 + (c1-c0)*t/63) per
     channel, Godot's get_r8 rounding.
   - Dither: with two stops the shader picks c0 where u < B[y%N][x%N]/255
     and c1 otherwise, for 0 <= u < 1, B the Bayer bytes.
   - Radial: u = sqrt(((x+0.5-cx)/(dx/2))^2 + ((y+0.5-cy)/(dy/2))^2).
   - Repeat: fract(u); Mirror: the shader's mirror_fract; Truncate: keep
     the original outside 0..1.

   Geometry is chosen so no pixel lands within 1e-6 of a texel boundary,
   where a port and the GPU could legitimately disagree - checked when the
   literals were derived. */
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const BG = [40, 40, 48];
const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};
const pixels = (page) => page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
const undoDepth = (page) => page.evaluate(() => undoStack.length);

/* The pointer, through the same listeners a mouse reaches: the press on the
   art, the drag and the release on the stage. Modifier keys ride on the
   events, and `release:false` leaves the pointer down. Waits a few frames
   after each step because the preview is drawn on requestAnimationFrame. */
const drag = (page, o) => page.evaluate(async (o) => {
  const r = art.getBoundingClientRect();
  const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true,
    shiftKey: !!o.shift, altKey: !!o.alt });
  art.dispatchEvent(new PointerEvent('pointerdown', at(o.from[0], o.from[1])));
  for (const [x, y, mods] of (o.via || [])) {
    const ev = at(x, y); if (mods) Object.assign(ev, mods);
    stage.dispatchEvent(new PointerEvent('pointermove', ev));
    await new Promise(x => setTimeout(x, 40));
  }
  stage.dispatchEvent(new PointerEvent('pointermove', at(o.to[0], o.to[1])));
  await new Promise(x => setTimeout(x, 60));
  if (o.release !== false) {
    stage.dispatchEvent(new PointerEvent('pointerup', at(o.to[0], o.to[1])));
    await new Promise(x => setTimeout(x, 60));
  }
}, o);

/* The tool, the two colours, and the options by Pixelorama's names. */
const prep = (page, o = {}) => page.evaluate((o) => {
  selectTool('gradient');
  setColor(o.colour || '#ffffff');
  rcTo = o.target || null;
  const set = (id, v) => { if (v === undefined) return; const e = $(id); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); };
  set('gdshape', o.shape); set('gddither', o.dither); set('gdrepeat', o.repeat); set('gdarea', o.area); set('gdtol', o.tol);
}, o);

/* Godot's texel table for two stops, and the Bayer recursion - the spec's
   own copies, so they share nothing with the page. */
const texel = (c0, c1, t) => c0.map((v, k) => Math.round((v * 63 + (c1[k] - v) * t) / 63));
const idx = u => Math.max(0, Math.min(63, Math.floor(u * 64)));
const bayer = n => {
  let B = [[0]], s = 1;
  while (s < n) {
    const nb = [];
    for (let y = 0; y < 2 * s; y++) { nb.push([]); for (let x = 0; x < 2 * s; x++) nb[y].push(B[y % s][x % s] * 4 + (y < s ? (x < s ? 0 : 2) : (x < s ? 3 : 1))); }
    B = nb; s *= 2;
  }
  return B.map(r => r.map(v => v * 256 / (n * n)));
};
const WHITE = [255, 255, 255, 255], BLACK = [0, 0, 0, 255];
const px = (d, W, x, y) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2], d[(y * W + x) * 4 + 3]];

test.describe('the gradient tool', () => {
  test('IS IN THE RAIL, ANSWERS TO J, and shows its options only while chosen', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const r = await page.evaluate(async () => {
      const rail = [...document.querySelectorAll('.tools .tool[data-tool]')].map(b => b.dataset.tool);
      selectTool('pencil');
      const hiddenBefore = $('gdrows').hidden;
      /* J, not N: two features written at once both chose N - this and the line
         tool - and Line kept it. Nothing else binds J. */
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
      await new Promise(x => setTimeout(x, 100));
      const afterKey = { tool, rows: $('gdrows').hidden, pressed: document.querySelector('[data-tool="gradient"]').getAttribute('aria-pressed') };
      const titles = ['gdshape', 'gddither', 'gdrepeat', 'gdarea', 'gdtol'].map(id => [id, !!$(id).title]);
      const options = { shape: $('gdshape').options.length, dither: $('gddither').options.length, repeat: $('gdrepeat').options.length, area: $('gdarea').options.length };
      $('gdarea').value = '2'; $('gdarea').dispatchEvent(new Event('change', { bubbles: true }));
      const tolHiddenForSelection = $('gdtolrow').hidden;
      $('gdarea').value = '0'; $('gdarea').dispatchEvent(new Event('change', { bubbles: true }));
      const tolShownForArea = !$('gdtolrow').hidden;
      selectTool('pencil');
      return { rail, hiddenBefore, afterKey, titles, options, tolHiddenForSelection, tolShownForArea,
        hiddenAfter: $('gdrows').hidden, tools: PB.tools(), tolDefault: $('gdtol').value,
        inKeys: SHORTCUTS.some(s => s.desc === 'Gradient' && s.keys && s.keys.indexOf('j') >= 0) };
    });
    /* ORDER, NOT ADJACENCY. Every drawing tool a patch adds goes in before the
       eyedropper, so 'directly before pick' is a place no one tool can own -
       this pinned it and went red the moment Line, Rectangle, Ellipse and
       Select landed beside it. What is this tool's to claim: it sits among the
       drawing tools, after Transform and before the eyedropper. */
    expect(r.rail.indexOf('gradient'), 'after transform').toBeGreaterThan(r.rail.indexOf('transform'));
    expect(r.rail.indexOf('pick'), 'and before the eyedropper').toBeGreaterThan(r.rail.indexOf('gradient'));
    expect(r.hiddenBefore, 'options hidden under the pencil').toBe(true);
    expect(r.afterKey.tool, 'J selects it').toBe('gradient');
    expect(r.afterKey.pressed).toBe('true');
    expect(r.afterKey.rows, 'and its options appear').toBe(false);
    expect(r.hiddenAfter, 'and go when it is left').toBe(true);
    for (const [id, has] of r.titles) expect(has, id + ' has a title').toBe(true);
    /* Pixelorama's enums: Shape 2, Dithering None + 4 matrices, Repeat 4, FillArea 3. */
    expect(r.options).toEqual({ shape: 2, dither: 5, repeat: 4, area: 3 });
    expect(r.tolHiddenForSelection, 'tolerance means nothing to Whole selection').toBe(true);
    expect(r.tolShownForArea).toBe(true);
    /* 0.003*255 = 0.765 into a step-1 Range snaps to 1 in Pixelorama. */
    expect(r.tolDefault, 'the tolerance Pixelorama shows').toBe('1');
    expect(r.tools).toContain('gradient');
    expect(r.inKeys, 'listed in the shortcuts table').toBe(true);
  });

  test('fits the strip at 1280 wide, where the strip is a 274px column', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const r = await page.evaluate(() => {
      selectTool('gradient');
      const opts = $('optsbar').getBoundingClientRect();
      const out = [];
      for (const id of ['gdshape', 'gddither', 'gdrepeat', 'gdarea', 'gdtol']) {
        const b = $(id).getBoundingClientRect();
        out.push({ id, left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) });
      }
      return { opts: { left: Math.round(opts.left), right: Math.round(opts.right) }, out,
        overflow: document.documentElement.scrollWidth > window.innerWidth, vw: window.innerWidth };
    });
    expect(r.vw).toBe(1280);
    for (const c of r.out) {
      expect(c.w, c.id + ' is laid out').toBeGreaterThan(20);
      expect(c.left, c.id + ' starts inside the strip').toBeGreaterThanOrEqual(r.opts.left);
      expect(c.right, c.id + ' ends inside the strip').toBeLessThanOrEqual(r.opts.right + 1);
    }
    expect(r.overflow, 'and the page does not scroll sideways').toBe(false);
  });

  test('A LINEAR RAMP IS 64 TEXELS OF GODOT\'S ROUNDING, centred on the press, paint colour on the drag-end side', async ({ page }) => {
    /* 64 wide, press at 32, drag 64 to the right (off the canvas, as a drag
       may). u = 0.5 - (x+0.5-32)/64 = (63.5-x)/64, so u*64 = 63.5-x: every
       column sits half a texel from a boundary, and texel(x) = 63-x. With
       white as stop 0 and black as stop 1, texel t = round(255*(63-t)/63),
       so column x reads round(255*x/63): 0 at the left edge, 255 under the
       drag end. The paint colour is on the drag-END side - Pixelorama's way
       round, and the reason the title says so. */
    await openTrait(page, { w: 64, h: 8, draw: FLAT });
    const before = await pixels(page);
    await prep(page, { colour: '#ffffff', target: null });
    await drag(page, { from: [32, 4], to: [96, 4] });
    const d = await pixels(page);
    const W = 64;
    for (let x = 0; x < 64; x++) {
      const want = texel(WHITE, BLACK, 63 - x);
      for (let y = 0; y < 8; y++) expect(px(d, W, x, y), 'column ' + x).toEqual(want);
    }
    /* Worked by hand from round(255*x/63): 4.05 -> 4, 125.48 -> 125,
       129.52 -> 130, 250.95 -> 251. A truncating port gives 4, 125, 129, 250. */
    const spots = { 0: 0, 1: 4, 21: 85, 31: 125, 32: 130, 42: 170, 62: 251, 63: 255 };
    for (const x in spots) expect(px(d, W, +x, 0)[0], 'x=' + x).toBe(spots[x]);
    expect(await undoDepth(page), 'one undo step').toBe(1);
    expect(await page.evaluate(() => $('gdpv').style.display), 'the preview layer is down').toBe('none');
    await page.click('#undo');
    await page.waitForTimeout(150);
    expect(await pixels(page), 'and undo puts every byte back').toEqual(before);
  });

  test('DITHERS WITH THE BAYER 4x4 MATRIX, byte for byte', async ({ page }) => {
    /* Same ramp, with the 4x4 matrix. 64 and 8 are multiples of 4, so the
       shader's integer-division tiling puts cell (x%4, y%4) under pixel
       (x,y). White where u < byte/255, black otherwise; nothing in between,
       which is the point of an ordered dither on pixel art. */
    await openTrait(page, { w: 64, h: 8, draw: FLAT });
    await prep(page, { colour: '#ffffff', target: null, dither: 2 });
    await drag(page, { from: [32, 4], to: [96, 4] });
    const d = await pixels(page);
    const B = bayer(4), W = 64;
    expect(B, 'the recursion gives the classic matrix').toEqual([[0, 128, 32, 160], [192, 64, 224, 96], [48, 176, 16, 144], [240, 112, 208, 80]]);
    let white = 0, wrong = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) {
      const u = (63.5 - x) / 64;
      const want = u < B[y % 4][x % 4] / 255 ? WHITE : BLACK;
      if (want === WHITE) white++;
      const got = px(d, W, x, y);
      if (got.join() !== want.join()) wrong.push([x, y, got]);
    }
    expect(wrong, 'every pixel is the colour the threshold picks').toEqual([]);
    /* Counted from the derivation: 240 of 512 come out white. */
    expect(white).toBe(240);
    /* Spots. (60,0) is under threshold byte 0 - cell (0,0) of the matrix,
       since 60%4 = 0 - which nothing is below, so it is black even at
       u = 0.055; (63,0) is under cell (3,0), byte 160, and white at
       u = 0.008; (0,3) at u = 0.992 is not below 240/255 and is black.
       My first derivation of this put (63,0) under byte 0 and was wrong:
       the column, not the pixel, indexes the matrix. */
    expect(px(d, W, 60, 0)).toEqual(BLACK);
    expect(px(d, W, 63, 0)).toEqual(WHITE);
    expect(px(d, W, 63, 1)).toEqual(WHITE);
    expect(px(d, W, 0, 3)).toEqual(BLACK);
    /* Positive controls: rows differ from each other, and no grey exists. */
    expect(d.slice(0, W * 4)).not.toEqual(d.slice(W * 4, W * 8));
    const greys = d.filter((v, i) => i % 4 === 0 && v !== 0 && v !== 255).length;
    expect(greys, 'no intermediate value anywhere').toBe(0);
  });

  test('the radial shape is an ellipse whose semi-axes are HALF the drag', async ({ page }) => {
    /* Press (16,16), drag to (24,20): dx = 8, dy = 4, radius = (8/32, 4/32).
       The shader maps uv to -1..1, so u = sqrt(((x+0.5-16)/4)^2 +
       ((y+0.5-16)/2)^2): u = 1 on the ellipse with semi-axes 4 and 2
       pixels, half the drag in each axis. */
    await openTrait(page, { w: 32, h: 32, draw: FLAT });
    await prep(page, { colour: '#ffffff', target: null, shape: 1 });
    await drag(page, { from: [16, 16], to: [24, 20] });
    const d = await pixels(page), W = 32;
    let wrong = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const u = Math.sqrt(((x + 0.5 - 16) / 4) ** 2 + ((y + 0.5 - 16) / 2) ** 2);
      const want = texel(WHITE, BLACK, idx(u));
      if (px(d, W, x, y).join() !== want.join()) wrong.push([x, y, px(d, W, x, y), want]);
    }
    expect(wrong).toEqual([]);
    /* By hand: (16,16) u = sqrt(1/64 + 1/16) = 0.2795, u*64 = 17.9, texel 17,
       round(255*46/63) = 186. (19,16) and its mirror (12,16): u = 0.910,
       texel 58, 20. (20,16): u = 1.15, clamped to 63, black. */
    expect(px(d, W, 16, 16)[0]).toBe(186);
    expect(px(d, W, 19, 16)[0]).toBe(20);
    expect(px(d, W, 12, 16)[0]).toBe(20);
    expect(px(d, W, 20, 16)).toEqual(BLACK);
    expect(px(d, W, 16, 17)[0]).toBe(61);
    expect(px(d, W, 0, 0)).toEqual(BLACK);
  });

  test('the four repeat modes past the ends of the ramp', async ({ page }) => {
    /* 192 wide, press 96, drag 64: u = (127.5-x)/64, so the ramp runs from
       x = 64 (u just under 1) to x = 127 (u just over 0) and both sides of
       it are outside 0..1. */
    await openTrait(page, { w: 192, h: 4, draw: FLAT });
    const modes = ['none', 'repeat', 'mirror', 'truncate'];
    const fract = u => u - Math.floor(u);
    const mirror = u => { const s = Math.trunc((Math.sign(u) - 1) / 2); return (Math.trunc(u) % 2 === s) ? fract(u) : fract(1 - u); };
    const want = (mode, x) => {
      let u = (127.5 - x) / 64;
      if (mode === 'repeat') u = fract(u); else if (mode === 'mirror') u = mirror(u);
      if (mode === 'truncate' && !(u >= 0 && u <= 1)) return BG.concat(255);
      return texel(WHITE, BLACK, idx(u));
    };
    const got = {};
    for (let m = 0; m < 4; m++) {
      await prep(page, { colour: '#ffffff', target: null, repeat: m });
      await drag(page, { from: [96, 2], to: [160, 2] });
      const d = await pixels(page);
      const wrong = [];
      for (let x = 0; x < 192; x++) for (let y = 0; y < 4; y++)
        if (px(d, 192, x, y).join() !== want(modes[m], x).join()) wrong.push([x, y, px(d, 192, x, y)]);
      expect(wrong, modes[m]).toEqual([]);
      got[modes[m]] = [50, 140, 96, 128, 63].map(x => px(d, 192, x, 0)[0]);
      await page.click('#undo');
      await page.waitForTimeout(120);
    }
    /* By hand, red channel at x = 50 (u = 1.21), 140 (u = -0.195), 96
       (u = 0.492), 128 (u = -0.0078), 63 (u = 1.0078):
       none holds the end colours; repeat wraps 1.21 -> 0.21 (texel 13,
       202) and -0.195 -> 0.805 (texel 51, 49); mirror runs it back, 1.21
       -> 0.79 (53) and -0.195 -> 0.195 (206). Truncate keeps the
       background's 40 outside. */
    expect(got.none).toEqual([0, 255, 130, 255, 0]);
    expect(got.repeat).toEqual([202, 49, 130, 0, 255]);
    expect(got.mirror).toEqual([53, 206, 130, 255, 0]);
    expect(got.truncate).toEqual([40, 40, 130, 40, 40]);
  });

  test('PREVIEWS ON ITS OWN LAYER, commits on release through one undo step, and Escape cancels', async ({ page }) => {
    await openTrait(page, { w: 64, h: 8, draw: FLAT });
    const before = await pixels(page);
    await prep(page, { colour: '#ffffff', target: null });
    await drag(page, { from: [32, 4], to: [96, 4], release: false });
    const mid = await page.evaluate(() => ({ pv: $('gdpv').style.display, pvW: $('gdpv').width, undo: undoStack.length }));
    expect(mid.pv, 'the layer is up while the pointer is down').toBe('block');
    expect(mid.pvW, 'sized to the art').toBe(64);
    expect(await pixels(page), 'and the artwork is untouched').toEqual(before);
    expect(mid.undo, 'with no undo step taken').toBe(0);
    /* The layer shows what the release would commit. */
    const shown = await page.evaluate(() => [...$('gdpv').getContext('2d').getImageData(0, 0, 64, 8).data]);
    expect(px(shown, 64, 63, 0)).toEqual(WHITE);
    expect(px(shown, 64, 0, 0)).toEqual(BLACK);
    /* Escape: cancel_tool. The layer goes, and the release that follows
       commits nothing. */
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => $('gdpv').style.display)).toBe('none');
    await page.evaluate(async () => {
      const r = art.getBoundingClientRect();
      stage.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + 96.5 * zoom, clientY: r.top + 4.5 * zoom, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true }));
      await new Promise(x => setTimeout(x, 60));
    });
    expect(await pixels(page), 'nothing landed').toEqual(before);
    expect(await undoDepth(page)).toBe(0);
    /* And a full drag after that still works - the cancel left no state. */
    await drag(page, { from: [32, 4], to: [96, 4] });
    expect(await pixels(page)).not.toEqual(before);
    expect(await undoDepth(page)).toBe(1);
  });

  test('refuses a gradient that changes nothing, without an undo step', async ({ page }) => {
    await openTrait(page, { w: 32, h: 8, draw: FLAT });
    const before = await pixels(page);
    /* Both stops the background colour: every texel equals every pixel. */
    await prep(page, { colour: '#282830', target: '#282830' });
    await drag(page, { from: [16, 4], to: [30, 4] });
    expect(await pixels(page)).toEqual(before);
    expect(await undoDepth(page)).toBe(0);
  });

  test('stays inside a selection, and a press outside it starts nothing', async ({ page }) => {
    await openTrait(page, { w: 64, h: 8, draw: FLAT });
    const before = await pixels(page);
    await page.evaluate(() => { selMask = new Uint8Array(64 * 8); for (let i = 0; i < 64 * 8; i++) selMask[i] = (i % 64) < 32 ? 1 : 0; });
    await prep(page, { colour: '#ffffff', target: null });
    await drag(page, { from: [16, 4], to: [64, 4] });
    const d = await pixels(page);
    let left = 0, right = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) {
      const same = px(d, 64, x, y).join() === px(before, 64, x, y).join();
      if (x < 32) { if (!same) left++; } else if (!same) right++;
    }
    expect(left, 'the selected half changed').toBe(32 * 8);
    expect(right, 'the other half did not').toBe(0);
    expect(await undoDepth(page)).toBe(1);
    await drag(page, { from: [48, 4], to: [60, 4] });
    expect(await pixels(page), 'a press outside the selection does nothing').toEqual(d);
    expect(await undoDepth(page), 'and costs nothing').toBe(1);
    await page.evaluate(() => { selMask = null; });
  });

  test('the three fill areas: the connected area, every similar pixel, the whole selection', async ({ page }) => {
    /* Columns alternate A and B; a strip of B also walls off the far right
       third. Similar AREA from an A column in the left third reaches only
       the A columns 4-connected to it - which, with B columns between, is
       just its own column. Similar COLOURS reaches every A column. Whole
       selection with no selection reaches everything. */
    const A = [40, 40, 48], B = [200, 30, 30];
    await openTrait(page, { w: 24, h: 6, draw: (set, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, (x % 2 === 0 && x < 16) ? [40, 40, 48] : [200, 30, 30]);
    } });
    const before = await pixels(page);
    const changedColumns = (d) => {
      const cols = new Set();
      for (let y = 0; y < 6; y++) for (let x = 0; x < 24; x++) if (px(d, 24, x, y).join() !== px(before, 24, x, y).join()) cols.add(x);
      return [...cols].sort((a, b) => a - b);
    };
    await prep(page, { colour: '#ffffff', target: null, area: 0 });
    await drag(page, { from: [4, 3], to: [24, 3] });
    expect(changedColumns(await pixels(page)), 'similar area: the column pressed on').toEqual([4]);
    await page.click('#undo'); await page.waitForTimeout(120);
    await prep(page, { colour: '#ffffff', target: null, area: 1 });
    await drag(page, { from: [4, 3], to: [24, 3] });
    expect(changedColumns(await pixels(page)), 'similar colours: every A column').toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    await page.click('#undo'); await page.waitForTimeout(120);
    await prep(page, { colour: '#ffffff', target: null, area: 2 });
    await drag(page, { from: [4, 3], to: [24, 3] });
    expect(changedColumns(await pixels(page)), 'whole selection: everything').toEqual([...Array(24).keys()]);
    void A; void B;
  });

  test('tolerance is a byte distance per channel, alpha included', async ({ page }) => {
    /* Columns alternate [40,40,48] and [41,40,48]. Similar colours at
       tolerance 0 takes the exact ones; at 1 - Pixelorama's default - a
       byte apart counts. */
    await openTrait(page, { w: 16, h: 4, draw: (set, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, x % 2 ? [41, 40, 48] : [40, 40, 48]);
    } });
    const before = await pixels(page);
    const changed = async () => { const d = await pixels(page); let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== before[i] || d[i + 1] !== before[i + 1] || d[i + 2] !== before[i + 2]) n++; return n; };
    await prep(page, { colour: '#ffffff', target: null, area: 1, tol: 0 });
    await drag(page, { from: [0, 2], to: [16, 2] });
    expect(await changed(), 'tolerance 0: the eight exact columns').toBe(8 * 4);
    await page.click('#undo'); await page.waitForTimeout(120);
    await prep(page, { colour: '#ffffff', target: null, area: 1, tol: 1 });
    await drag(page, { from: [0, 2], to: [16, 2] });
    expect(await changed(), 'tolerance 1: all of them').toBe(16 * 4);
  });

  test('Shift snaps the angle to 22.5 degrees; Alt moves the press with the pointer', async ({ page }) => {
    /* Press (16,16), drag to (26,17): the angle is 174.3 degrees, which Shift
       snaps to 180 - an exactly horizontal ramp, so every row is the same -
       while the size stays the true distance sqrt(101)/32, measured after
       the snap from the unsnapped points. u = 0.5 - (x+0.5-16)/sqrt(101). */
    await openTrait(page, { w: 32, h: 32, draw: FLAT });
    await prep(page, { colour: '#ffffff', target: null });
    await drag(page, { from: [16, 16], to: [26, 17], shift: true });
    const d = await pixels(page), W = 32;
    const size = Math.hypot(10, 1);
    for (let x = 0; x < 32; x++) {
      const want = texel(WHITE, BLACK, idx(0.5 - (x + 0.5 - 16) / size));
      for (let y = 0; y < 32; y++) expect(px(d, W, x, y), 'column ' + x + ' row ' + y).toEqual(want);
    }
    /* By hand: x=16 u = 0.4502, texel 28, round(255*35/63) = 142; x=20
       u = 0.0522, texel 3, 243; x=12 u = 0.848, texel 54, 36; x=25 u < 0,
       texel 0, white. */
    expect([16, 20, 12, 25].map(x => px(d, W, x, 0)[0])).toEqual([142, 243, 36, 255]);
    /* The control: the same drag without Shift is not horizontal. */
    await page.click('#undo'); await page.waitForTimeout(120);
    await drag(page, { from: [16, 16], to: [26, 17] });
    const e = await pixels(page);
    expect(e.slice(0, W * 4), 'rows differ when the angle is not snapped').not.toEqual(e.slice(W * 31 * 4, W * 32 * 4));
    /* Alt: the press moves by the pointer's motion. A press at 16 moved by
       4 with Alt held and then dragged to 28 is a drag from 20 to 28. */
    await page.click('#undo'); await page.waitForTimeout(120);
    await drag(page, { from: [16, 16], via: [[20, 16, { altKey: true }]], to: [28, 16] });
    const moved = await pixels(page);
    await page.click('#undo'); await page.waitForTimeout(120);
    await drag(page, { from: [20, 16], to: [28, 16] });
    expect(moved, 'identical to the plain drag from where the press ended up').toEqual(await pixels(page));
  });

  test('PB.gradient drives the same press, drag and release', async ({ page }) => {
    await openTrait(page, { w: 64, h: 8, draw: FLAT });
    const before = await pixels(page);
    await prep(page, { colour: '#ffffff', target: null, dither: 2 });
    await drag(page, { from: [32, 4], to: [96, 4] });
    const byPointer = await pixels(page);
    await page.click('#undo'); await page.waitForTimeout(120);
    expect(await pixels(page)).toEqual(before);
    const r = await page.evaluate(() => PB.gradient({ from: [32, 4], to: [96, 4], colour: '#ffffff', target: null, shape: 'linear', dither: 4, repeat: 'none', area: 'area', apply: true }));
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.from).toEqual([32, 4]);
    expect(r.to).toEqual([96, 4]);
    expect(r.options).toEqual({ shape: 0, dither: 2, repeat: 0, area: 0, tol: 1 });
    expect(r.colours).toEqual(['#ffffff', '#000000']);
    expect(await pixels(page), 'byte for byte what the pointer drew').toEqual(byPointer);
    expect(await undoDepth(page)).toBe(1);
    /* Without apply it is a preview, as a held pointer is. */
    const p = await page.evaluate(() => { const r = PB.gradient({ from: [32, 4], to: [96, 4], apply: false }); return { r, pv: $('gdpv').style.display, undo: undoStack.length }; });
    expect(p.r.applied).toBe(false);
    expect(p.pv).toBe('block');
    expect(p.undo).toBe(1);
    expect(await pixels(page)).toEqual(byPointer);
    /* And it refuses what it cannot do, by name. */
    const bad = await page.evaluate(() => [PB.gradient({ from: [32, 4], to: [96, 4], shape: 'conic' }).ok, PB.gradient({ from: [200, 4], to: [96, 4] }).ok, PB.gradient({}).ok]);
    expect(bad).toEqual([false, false, false]);
  });
});
