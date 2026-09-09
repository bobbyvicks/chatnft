/* Pixelorama's colour effects - HSV, brightness/contrast, invert, desaturate,
   posterize - registered into the Adjust panel.

   Every expected byte here was DERIVED from the .gdshaderinc arithmetic by
   hand (the working is beside each one), never read off a run, and the
   pixels were chosen so that no derived value lands exactly between two
   bytes - the one place the GPU and this port are allowed to disagree. The
   effects are driven through PB.adjust, the same path the panel's Apply
   takes, so what is measured is what a person would get.

   Some of the numbers look wrong on purpose. HSV at a shift of +120 turns a
   grey 100 into 99: the shader rounds every pixel onto a 360/100/100 grid
   before shifting, and 100/255 is 39.2%, which comes back as 39% = 99.45.
   Brightness +20 leaves a transparent black pixel black: the offset sits in
   the fourth matrix column and is multiplied by alpha. Those are
   Pixelorama's results, and a port that "fixed" them would fail here. */
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* One row per test colour, eight wide. */
const ROWS = [
  [255, 0, 0, 255],       // 0 pure red: h0 s100 v100
  [100, 150, 200, 255],   // 1 a mid blue: h210 s50 v78 on the HSV grid
  [100, 100, 100, 255],   // 2 grey 100: no hue, v 39.2%
  [0, 0, 0, 255],         // 3 opaque black
  [0, 0, 0, 0],           // 4 transparent
  [40, 40, 48, 255],      // 5 the dusk the other specs paint
  [0, 255, 0, 255],       // 6 pure green
  [128, 128, 128, 255],   // 7 mid grey: rides the sRGB round trip unchanged
];
/* The rows are repeated INSIDE the draw function: openTrait ships it to the
   page as source text, so it can close over nothing. */
const SCENE = (set, W, H) => {
  const ROWS = [[255, 0, 0, 255], [100, 150, 200, 255], [100, 100, 100, 255], [0, 0, 0, 255],
    [0, 0, 0, 0], [40, 40, 48, 255], [0, 255, 0, 255], [128, 128, 128, 255]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, ROWS[y % ROWS.length]);
};

const px = (page, x, y) => page.evaluate(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data], [x, y]);
const row = (page, y) => page.evaluate(y => [...ctx.getImageData(0, y, art.width, 1).data], y);
const undoDepth = page => page.evaluate(() => undoStack.length);
/* The agent path: opens the panel, selects the effect, sets its controls and
   presses Apply - through fxApply, so snapshot() and the no-op refusal run. */
const adjust = (page, id, values) => page.evaluate(([id, values]) => PB.adjust(id, values, true), [id, values]);
const undo = async page => { await page.click('#undo'); await page.waitForTimeout(150); };

test.describe('the five Pixelorama colour effects', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 8, h: 8, draw: SCENE });
    /* The scene is what the derivations assume - checked, because a canvas
       stores premultiplied alpha and could have altered a row. */
    for (let y = 0; y < ROWS.length; y++) expect(await px(page, 0, y), 'row ' + y).toEqual(ROWS[y]);
  });

  test('ARE REGISTERED, WITH THE DIALOGS\' CONTROLS AND DEFAULTS', async ({ page }) => {
    const fx = await page.evaluate(() => PB.effects());
    const byId = Object.fromEntries(fx.map(e => [e.id, e]));
    for (const id of ['hsv', 'brightness-contrast', 'invert', 'desaturate', 'posterize'])
      expect(byId[id], id + ' is registered').toBeTruthy();
    const params = id => byId[id].params.map(p => p.id);
    /* HSVDialog.tscn: three sliders and the overflow box. */
    expect(params('hsv')).toEqual(['hue', 'saturation', 'value', 'wrap']);
    expect(byId.hsv.params.map(p => [p.min, p.max, p.value])).toEqual([[-180, 180, 0], [-100, 100, 0], [-100, 100, 0], [undefined, undefined, false]]);
    /* BrightnessContrastDialog.tscn, in its order, with contrast and
       saturation resting at 100 and the channel values at 100%. */
    expect(params('brightness-contrast')).toEqual(['red_shift', 'green_shift', 'blue_shift', 'brightness', 'contrast',
      'saturation', 'red_value', 'green_value', 'blue_value', 'tint_color', 'tint_effect_factor', 'wrap']);
    const bc = Object.fromEntries(byId['brightness-contrast'].params.map(p => [p.id, p.value]));
    expect(bc).toEqual({ red_shift: 0, green_shift: 0, blue_shift: 0, brightness: 0, contrast: 100, saturation: 100,
      red_value: 100, green_value: 100, blue_value: 100, tint_color: '#ffffff', tint_effect_factor: 0, wrap: false });
    expect(byId['brightness-contrast'].params.map(p => [p.min, p.max]).slice(0, 9)).toEqual(
      [[-255, 255], [-255, 255], [-255, 255], [-100, 100], [0, 300], [0, 300], [0, 100], [0, 100], [0, 100]]);
    /* Invert and Desaturate: R G B on, A off, as the dialogs' toggle buttons start. */
    for (const id of ['invert', 'desaturate']) {
      expect(params(id), id).toEqual(['red', 'green', 'blue', 'alpha']);
      expect(byId[id].params.map(p => p.value), id).toEqual([true, true, true, false]);
    }
    /* Posterize: levels 2..256 resting at 3, dither 0..0.5. */
    expect(byId.posterize.params.map(p => [p.id, p.min, p.max, p.value])).toEqual([['levels', 2, 256, 3], ['dither', 0, 0.5, 0]]);
    /* And every control has a label, which is what the panel titles it with. */
    for (const e of fx) for (const p of e.params) expect(typeof p.label, e.id + '.' + p.id).toBe('string');
    /* The panel drew them: opening it on HSV shows the four controls. */
    await page.evaluate(() => { railPanel('fx', true); $('fxsel').value = 'hsv'; fxParams(); });
    expect(await page.evaluate(() => ['hue', 'saturation', 'value', 'wrap'].map(id => !!$('fxp_' + id)))).toEqual([true, true, true, true]);
    expect(await page.evaluate(() => $('fxp_wrap').type)).toBe('checkbox');
    expect(await page.evaluate(() => $('fxp_hue').type)).toBe('range');
  });

  test('HSV SHIFTS HUE BY WHOLE DEGREES ON THE 360/100/100 GRID', async ({ page }) => {
    /* Red is h0 s100 v100. +120 -> 120 -> hsv2rgb: h*6 = 2, i=2, f=0, so
       (p, v, t) = (0, 1, 0): pure green.
       (100,150,200): max is b, h = 4 + (r-g)/d = 4 - 50/100 = 3.5, /6 -> 210;
       s = 100/200 -> 50; v = 200/255 = 78.4 -> 78. +120 -> 330: h*6 = 5.5,
       i=5, f=.5, p = .78*.5 = .39, q = .78*(1-.25) = .585, (v, p, q) ->
       (198.9, 99.45, 149.2) -> (199, 99, 149).
       Grey 100 has no hue to shift, but its value goes through the grid:
       100/255 = 39.2% -> 39% -> .39*255 = 99.45 -> 99. Pixelorama's result. */
    const r = await adjust(page, 'hsv', { hue: 120 });
    expect(r.ok && r.applied).toBe(true);
    expect(await px(page, 0, 0), 'red +120 is green').toEqual([0, 255, 0, 255]);
    expect(await px(page, 3, 1), 'the mid blue').toEqual([199, 99, 149, 255]);
    expect(await px(page, 0, 2), 'grey 100 is re-quantised to 99').toEqual([99, 99, 99, 255]);
    expect(await px(page, 0, 4), 'transparent stays transparent').toEqual([0, 0, 0, 0]);
    /* Grey 128 is v 50% -> 127.5, the one tie in this scene; 128 under
       half-even and half-up alike. */
    expect(await px(page, 0, 7), 'grey 128 sits on a tie and stays 128').toEqual([128, 128, 128, 255]);
    expect(await undoDepth(page), 'one undo step').toBe(1);
  });

  test('hsv holds at the ends unless asked to wrap', async ({ page }) => {
    /* Red -120: 0-120 < 0 and no wrap -> clamp to 0 -> still red. The apply
       is not a no-op because (100,150,200) goes 210-120 = 90 -> h*6 = 1.5,
       i=1, f=.5, (q, v, p) = (.585, .78, .39) -> (149, 199, 99). */
    await adjust(page, 'hsv', { hue: -120 });
    expect(await px(page, 0, 0), 'clamped at 0').toEqual([255, 0, 0, 255]);
    expect(await px(page, 0, 1)).toEqual([149, 199, 99, 255]);
    await undo(page);
    expect(await px(page, 0, 1), 'undo puts it back').toEqual([100, 150, 200, 255]);
    /* Wrapped: GLSL mod(-120, 360) = 240 -> h*6 = 4, i=4, (t, p, v) = (0, 0, 1): blue. */
    await adjust(page, 'hsv', { hue: -120, wrap: true });
    expect(await px(page, 0, 0), 'wrapped to 240').toEqual([0, 0, 255, 255]);
  });

  test('hsv saturation and value move by whole percent, wrapping on 100', async ({ page }) => {
    /* Red, s -60 -> 40%: p = 1*(1-.4) = .6 -> 153, so (255,153,153). */
    await adjust(page, 'hsv', { saturation: -60 });
    expect(await px(page, 0, 0)).toEqual([255, 153, 153, 255]);
    await undo(page);
    /* v -60 -> 40%: (v, t, p) = (.4, 0, 0) -> 102. */
    await adjust(page, 'hsv', { value: -60 });
    expect(await px(page, 0, 0)).toEqual([102, 0, 0, 255]);
    await undo(page);
    /* s 100 + 20 wraps: mod(120, 100) = 20 -> p = .8 -> 204. */
    await adjust(page, 'hsv', { saturation: 20, wrap: true });
    expect(await px(page, 0, 0), 'wrapped on 100, not 360').toEqual([255, 204, 204, 255]);
    await undo(page);
    /* And held without wrap: 100 + 20 -> clamp 100 -> red unchanged. The
       apply still lands because grey 100 re-quantises to 99. */
    await adjust(page, 'hsv', { saturation: 20 });
    expect(await px(page, 0, 0), 'held at 100').toEqual([255, 0, 0, 255]);
  });

  test('BRIGHTNESS IS AN OFFSET SCALED BY ALPHA, CONTRAST PIVOTS ON THE MIDDLE', async ({ page }) => {
    /* Brightness +20 is +0.2 * alpha: 100/255 + .2 = .592 -> 151, 201, 251.
       Opaque black -> 0.2*255 = 51. Transparent black: offset * 0 -> stays 0. */
    await adjust(page, 'brightness-contrast', { brightness: 20 });
    expect(await px(page, 0, 1)).toEqual([151, 201, 251, 255]);
    expect(await px(page, 0, 3), 'opaque black lifts to 51').toEqual([51, 51, 51, 255]);
    /* The canvas discards the colour of an alpha-0 pixel, so the line below
       can only show the alpha stayed 0 - a port that lifted transparent
       black to 51 would read back (0,0,0,0) too (a mutation did, and this
       line let it through). The alpha scaling is measured on the effect
       itself: half alpha halves the offset, 0.2*128/255 = .1004 -> +25.6 ->
       125.6, 175.6, 225.6, and alpha 0 gets none of it. */
    expect(await px(page, 0, 4), 'transparent black keeps alpha 0').toEqual([0, 0, 0, 0]);
    const scaled = await page.evaluate(() => {
      const fx = EFFECTS.find(e => e.id === 'brightness-contrast');
      const v = Object.fromEntries(fx.params.map(p => [p.id, p.value])); v.brightness = 20;
      return [...fx.run(new Uint8ClampedArray([100, 150, 200, 128, 0, 0, 0, 0, 0, 0, 0, 255]), 3, 1, v)];
    });
    expect(scaled, 'offset scales with alpha: half, none, full').toEqual([126, 176, 226, 128, 0, 0, 0, 0, 51, 51, 51, 255]);
    await undo(page);
    /* Contrast 150: c = 1.5, t = (1-1.5)/2 = -.25, so 1.5k/255 - .25, times
       255 is 1.5k - 63.75: 86.25, 161.25, 236.25. */
    await adjust(page, 'brightness-contrast', { contrast: 150 });
    expect(await px(page, 0, 1)).toEqual([86, 161, 236, 255]);
    expect(await undoDepth(page)).toBe(1);
  });

  test('brightness/contrast saturation, shifts and tint follow the matrices', async ({ page }) => {
    /* Saturation 0 is the luminance row alone: .3086*100 + .6094*150 +
       .0820*200 = 30.86 + 91.41 + 16.4 = 138.67 -> 139 on every channel. */
    await adjust(page, 'brightness-contrast', { saturation: 0 });
    expect(await px(page, 0, 1)).toEqual([139, 139, 139, 255]);
    await undo(page);
    /* Red shift +100 with wrap is mod on the float: (255+100)/255 = 1.392
       -> .392 -> 100. Modulo 255 bytes, not 256. Below the top it just adds. */
    await adjust(page, 'brightness-contrast', { red_shift: 100, wrap: true });
    expect(await px(page, 0, 0), 'wrapped').toEqual([100, 0, 0, 255]);
    expect(await px(page, 0, 1), 'added').toEqual([200, 150, 200, 255]);
    await undo(page);
    await adjust(page, 'brightness-contrast', { red_shift: 100 });
    expect(await px(page, 0, 0), 'clamped').toEqual([255, 0, 0, 255]);
    await undo(page);
    /* Tint red at 100%: mix(c, c*tint, 1) = (100, 0, 0). */
    await adjust(page, 'brightness-contrast', { tint_color: '#ff0000', tint_effect_factor: 100 });
    expect(await px(page, 0, 1)).toEqual([100, 0, 0, 255]);
  });

  test('brightness/contrast at its defaults is refused as a no-op', async ({ page }) => {
    /* Contrast 1, saturation 1, values 1, tint 0, shifts 0: the identity
       matrix. The panel must see identical bytes and take no undo step.
       r.ok is the positive control: with no such effect registered, undo
       would be empty and the pixel unchanged for the wrong reason. */
    const r = await adjust(page, 'brightness-contrast', {});
    expect(r.ok, 'the effect exists').toBe(true);
    expect(await undoDepth(page)).toBe(0);
    expect(await px(page, 0, 1)).toEqual([100, 150, 200, 255]);
  });

  test('INVERT IS 255 MINUS EACH TOGGLED CHANNEL', async ({ page }) => {
    await adjust(page, 'invert', {});
    expect(await px(page, 0, 5)).toEqual([215, 215, 207, 255]);
    expect(await px(page, 0, 0)).toEqual([0, 255, 255, 255]);
    expect(await px(page, 0, 4), 'alpha is off by default').toEqual([0, 0, 0, 0]);
    await undo(page);
    /* Alpha alone: opaque becomes transparent (and the canvas drops its
       colour, which is the canvas), transparent black becomes opaque black. */
    await adjust(page, 'invert', { red: false, green: false, blue: false, alpha: true });
    expect((await px(page, 0, 5))[3], 'opaque to transparent').toBe(0);
    expect(await px(page, 0, 4), 'transparent to opaque black').toEqual([0, 0, 0, 255]);
    await undo(page);
    /* Nothing toggled is nothing to do. */
    await adjust(page, 'invert', { red: false, green: false, blue: false });
    expect(await undoDepth(page)).toBe(0);
  });

  test('DESATURATE IS LINEAR-LIGHT LUMINANCE, BACK THROUGH THE sRGB CURVE', async ({ page }) => {
    /* Red: linear (1,0,0), Y = .21264935; back to sRGB: .21264935^(1/2.4) =
       e^(-1.54809/2.4) = .52463, *1.055 - .055 = .49848 -> 127.1 -> 127.
       Green: Y = .71516913 -> .71516913^(1/2.4) = .86989, *1.055-.055 = .8627 -> 220.
       Grey 128: the weights sum to 1, so Y is its own linear value and the
       round trip gives 128 back. (100,150,200): linear (.1274,.3050,.5776),
       Y = .0271+.2181+.0417 = .2869; .2869^(1/2.4) = e^(-1.2486/2.4) =
       .5944, *1.055 - .055 = .5721 -> 145.9 -> 146. A plain average would
       have given 150 and a Rec. 601 weighting of the sRGB bytes 138: both
       fail here. */
    await adjust(page, 'desaturate', {});
    expect(await px(page, 0, 0), 'red').toEqual([127, 127, 127, 255]);
    expect(await px(page, 0, 6), 'green').toEqual([220, 220, 220, 255]);
    expect(await px(page, 0, 7), 'mid grey unchanged').toEqual([128, 128, 128, 255]);
    expect(await px(page, 0, 1), 'the mid blue').toEqual([146, 146, 146, 255]);
    expect(await px(page, 0, 4), 'transparent untouched').toEqual([0, 0, 0, 0]);
    await undo(page);
    /* Green channel only: red's own linear 1 rides back to 255, green
       becomes Y -> 127, blue stays 0. */
    await adjust(page, 'desaturate', { red: false, blue: false });
    expect(await px(page, 0, 0)).toEqual([255, 127, 0, 255]);
    await undo(page);
    /* Alpha toggled: alpha BECOMES the sRGB lightness of Y, 127 for red. */
    await adjust(page, 'desaturate', { alpha: true });
    expect((await px(page, 0, 0))[3]).toBe(127);
  });

  test('POSTERIZE ROUNDS ONTO levels-1 STEPS AND DITHERS ON A CHECKERBOARD', async ({ page }) => {
    /* 3 levels is colors = 2: round(k*2/255)/2. 100 -> .78 -> 1 -> .5 ->
       127.5 -> 128 (the one tie here, and half-even and half-up agree on it);
       150 -> 1.18 -> 1 -> 128; 200 -> 1.57 -> 2 -> 255. 40 and 48 -> 0.
       255 -> 2 -> 255 and 0 -> 0, so pure red is a fixed point. */
    await adjust(page, 'posterize', { levels: 3 });
    expect(await px(page, 0, 1)).toEqual([128, 128, 255, 255]);
    expect(await px(page, 0, 5)).toEqual([0, 0, 0, 255]);
    expect(await px(page, 0, 0)).toEqual([255, 0, 0, 255]);
    await undo(page);
    /* 2 levels is colors = 1: 100/255 = .39 -> 0, 150/255 = .59 -> 1. */
    await adjust(page, 'posterize', { levels: 2 });
    expect(await px(page, 0, 1)).toEqual([0, 255, 255, 255]);
    await undo(page);
    /* Dither .3 at 2 levels on grey 100 (row 2): the shader's parity is
       (x+y) mod 2, odd rounds up: .39+.3 = .69 -> 1 -> 255; even rounds
       down: .39-.3 = .09 -> 0. Row 2 alternates 0,255 from x=0. */
    await adjust(page, 'posterize', { levels: 2, dither: 0.3 });
    const r2 = await row(page, 2);
    const want = [];
    for (let x = 0; x < 8; x++) { const v = ((x + 2) & 1) ? 255 : 0; want.push(v, v, v, 255); }
    expect(r2).toEqual(want);
    /* And the row below it is the other phase. */
    expect((await px(page, 0, 3)), 'black rounds to 0 either way').toEqual([0, 0, 0, 255]);
    expect(await undoDepth(page)).toBe(1);
  });

  test('inside a selection only the selected pixels change - alpha included, which Pixelorama does not do', async ({ page }) => {
    /* The Adjust panel confines every byte of the result to the mask. The
       Desaturate shader confines only RGB through mix() and writes the new
       alpha everywhere; here the alpha outside the selection stays too.
       That is a stated deviation, pinned so it is a decision and not a
       surprise: the panel's confinement is the one thing this port did not
       reimplement. Columns 0-3 selected. */
    await page.evaluate(() => {
      const W = art.width, H = art.height; selMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) selMask[i] = (i % W) < 4 ? 1 : 0;
    });
    /* What the effect returns for red is (127,127,127,127) - the patch runs
       it in node and pins that. What the CANVAS holds afterwards is not: a
       2D canvas stores premultiplied alpha, so 127 at alpha 127 becomes
       127*127/255 = 63.25 -> 63, and reads back as 63*255/127 = 126.5 ->
       126. The alpha survives exactly. The same storage loss is why the
       'desaturate alpha' test above checks only the alpha byte. */
    const run = await page.evaluate(() => [...EFFECTS.find(e => e.id === 'desaturate').run(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1,
      { red: true, green: true, blue: true, alpha: true })]);
    expect(run, 'the effect itself').toEqual([127, 127, 127, 127]);
    await adjust(page, 'desaturate', { alpha: true });
    const inside = await px(page, 0, 0), outside = await px(page, 5, 0);
    await page.evaluate(() => { selMask = null; });
    expect(inside, 'red inside: luminance 127 into alpha, colour through premultiplied storage').toEqual([126, 126, 126, 127]);
    expect(outside, 'red outside: every byte as it was').toEqual([255, 0, 0, 255]);
  });

  test('every effect previews on its own layer and leaves the artwork alone until Apply', async ({ page }) => {
    const before = await row(page, 1);
    for (const [id, values] of [['hsv', { hue: 90 }], ['brightness-contrast', { contrast: 200 }], ['invert', {}], ['desaturate', {}], ['posterize', { levels: 2 }]]) {
      const r = await page.evaluate(([id, values]) => PB.adjust(id, values, false), [id, values]);
      expect(r.ok, id).toBe(true);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => $('fxpv').style.display), id + ' preview is up').toBe('block');
      expect(await row(page, 1), id + ' touched nothing').toEqual(before);
    }
    expect(await undoDepth(page)).toBe(0);
  });
});
