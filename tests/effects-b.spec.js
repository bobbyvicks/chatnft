/* Pixelorama image effects, part B: gradient map, drop shadow, pixelize,
   offset and the inside half of outline ("Inline"), registered behind the
   Adjust panel.

   EVERY NUMBER HERE IS WORKED OUT FROM THE SHADER, not read off a run, and
   the working sits beside it. Pixelorama's blit shader samples with
   filter_nearest at pixel centres, uv=(x+0.5)/W, so each texture() read is
   an integer texel and each expected byte follows by arithmetic. A test
   that pinned observed output would pass a port that was wrong in the same
   way twice.

   Two ways in. PB.adjust drives the panel's own controls and its Apply -
   the path a person's click takes - and the artwork is read back through
   ctx, which is the end-to-end proof. Where the expected pixel is
   semi-transparent, the effect's pure run() is called instead: a 2D canvas
   stores premultiplied alpha, so a value put down and read back can move a
   level, and that is the canvas's arithmetic, not the port's. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

const IDS = ['gradmap', 'dropshadow', 'pixelize', 'offset', 'inline'];
const W = 16, H = 16;

const pixels = page => page.evaluate(() => [...ctx.getImageData(0, 0, art.width, art.height).data]);
const at = (d, x, y) => d.slice((y * W + x) * 4, (y * W + x) * 4 + 4);
const undoDepth = page => page.evaluate(() => undoStack.length);
const apply = (page, id, values) => page.evaluate(([id, values]) => PB.adjust(id, values, true), [id, values]);
const undo = async page => {
  await page.evaluate(() => railPanel('fx', false));
  await page.click('#undo');
  await page.waitForTimeout(120);
};
/* run() alone, on pixels built here, with the effect's own defaults under
   the values given - the same merge the panel does. */
const run = (page, id, src, w, h, values) => page.evaluate(([id, src, w, h, values]) => {
  const fx = EFFECTS.find(e => e.id === id);
  if (!fx) throw new Error('not registered: ' + id);
  const v = {}; for (const p of fx.params) v[p.id] = p.value;
  return [...fx.run(new Uint8ClampedArray(src), w, h, Object.assign(v, values))];
}, [id, src, w, h, values]);
const blank = (w, h) => new Array(w * h * 4).fill(0);
const put = (d, w, x, y, c) => { d.splice((y * w + x) * 4, 4, c[0], c[1], c[2], c.length > 3 ? c[3] : 255); return d; };

/* The artworks. Self-contained: openTrait stringifies these. */
/* Every pixel its own colour, (x*16, y*16, 0), so a sample from the wrong
   texel is a wrong byte, not a coincidence. */
const UNIQUE = (set, W, H) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [x * 16, y * 16, 0]); };
/* Seven swatches on a clear ground. */
const SWATCHES = (set, W, H) => {
  set(0, 0, [255, 255, 255]); set(1, 0, [0, 0, 0]); set(2, 0, [255, 0, 0]);
  set(3, 0, [0, 255, 0]); set(4, 0, [0, 0, 255]); set(5, 0, [128, 128, 128]); set(6, 0, [84, 84, 84]);
};
/* One red pixel. */
const DOT = (set, W, H) => { set(4, 4, [255, 0, 0]); };
/* Solid red with one clear pixel in the middle. */
const HOLE = (set, W, H) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!(x === 8 && y === 8)) set(x, y, [255, 0, 0]); };

test.describe('the five effects', () => {
  test('ARE REGISTERED, GET LABELLED CONTROLS, AND PREVIEW OFF THE ARTWORK', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    await openPanel(page, 'fx');
    const listed = await page.evaluate(() => PB.effects());
    for (const id of IDS) {
      const e = listed.find(e => e.id === id);
      expect(e, id + ' is listed').toBeTruthy();
      expect(e.params.length, id + ' has controls').toBeGreaterThan(0);
      for (const p of e.params) expect(p.label, id + '.' + p.id + ' is labelled').toBeTruthy();
    }
    expect(listed.map(e => e.id), 'the outside outline is NOT registered here - the O panel owns it').not.toContain('outline');
    for (const id of IDS) {
      const r = await page.evaluate(async id => {
        const s = document.getElementById('fxsel'); s.value = id; s.dispatchEvent(new Event('change'));
        await new Promise(x => setTimeout(x, 200));
        const e = EFFECTS.find(e => e.id === id);
        return { controls: e.params.map(p => !!document.getElementById('fxp_' + p.id)),
          preview: document.getElementById('fxpv').style.display, note: document.getElementById('fxnote').textContent };
      }, id);
      expect(r.controls.every(Boolean), id + ': every param drew a control').toBe(true);
      expect(r.note.length, id + ': the note says something').toBeGreaterThan(0);
      expect(r.preview, id + ': the preview is up').toBe('block');
    }
    expect(await pixels(page), 'and the artwork is untouched').toEqual(before);
    expect(await undoDepth(page)).toBe(0);
  });
});

test.describe('gradient map', () => {
  /* GradientMap.gdshaderinc: value = 0.2126 r + 0.7152 g + 0.0722 b on the
     sampled bytes, read from a 64-wide GradientTexture2D with filter_nearest
     - column floor(value*64) clamped to 63 - whose column i is
     Gradient.get_color_at_offset(i/63) built in float32 and stored with
     uint8_t(CLAMP(c*255.0,0,255)), a TRUNCATION. Black to white, linear,
     column i is trunc(255*float32(i/63)).
       white  1.0    -> 64 -> 63 -> 255
       black  0      ->  0 ->   0
       red    0.2126*64 = 13.61 -> 13 -> trunc(52.62)  = 52   (a rounding store: 53)
       green  0.7152*64 = 45.77 -> 45 -> trunc(182.14) = 182
       blue   0.0722*64 =  4.62 ->  4 -> trunc(16.19)  = 16
       128    (128/255)*64 = 32.13 -> 32 -> trunc(129.52) = 129  (rounding: 130) */
  test('MAPS LUMA THROUGH 64 COLUMNS ONTO THE TWO COLOURS, IN ONE UNDO STEP', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: SWATCHES });
    const before = await pixels(page);
    const r = await apply(page, 'gradmap', { c0: '#000000', a0: 255, c1: '#ffffff', a1: 255, interp: 'linear' });
    expect(r.ok).toBe(true);
    const d = await pixels(page);
    expect(at(d, 0, 0), 'white').toEqual([255, 255, 255, 255]);
    expect(at(d, 1, 0), 'black').toEqual([0, 0, 0, 255]);
    expect(at(d, 2, 0), 'red -> column 13, truncated').toEqual([52, 52, 52, 255]);
    expect(at(d, 3, 0), 'green -> column 45').toEqual([182, 182, 182, 255]);
    expect(at(d, 4, 0), 'blue -> column 4').toEqual([16, 16, 16, 255]);
    expect(at(d, 5, 0), 'grey 128 -> column 32, truncated').toEqual([129, 129, 129, 255]);
    expect(at(d, 8, 8), 'clear stays clear: alpha is multiplied, and 0 times anything is 0').toEqual([0, 0, 0, 0]);
    expect(await undoDepth(page), 'one step').toBe(1);
    await undo(page);
    expect(await pixels(page), 'and undo puts every byte back').toEqual(before);
  });

  /* Godot builds the column in float32 and truncates. Grey 84 is column 21
     (84/255*64 = 21.08), t = 1/3; black to #450000 puts 69/255 * 1/3 * 255
     = 23 exactly there. float32 arrives at 23.0000016 and truncates to 23;
     float64 arrives at 22.999999999999996 and truncates to 22. So 23 is
     both the exact answer and Godot's, and a float64 port is one level
     dark at that column. */
  test('builds the table in float32, as Godot does, and truncates it', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: SWATCHES });
    const r = await apply(page, 'gradmap', { c0: '#000000', c1: '#450000' });
    expect(r.ok).toBe(true);
    const d = await pixels(page);
    expect(at(d, 6, 0), 'grey 84 -> column 21 -> 23, not 22').toEqual([23, 0, 0, 255]);
    expect(at(d, 0, 0), 'white -> column 63 -> the stop itself').toEqual([69, 0, 0, 255]);
  });

  /* Three stops - red 0, green 0.5, blue 1 - through PB.gradientMap.
     Grey 128 is column 32, t = 32/63 = 0.507937, in the green-blue segment,
     w = (0.507937-0.5)/0.5 = 0.015873.
       constant: the segment's first colour, green.
       linear:   g = trunc(255*(1-w)) = trunc(250.95) = 250,
                 b = trunc(255*w)     = trunc(4.05)   = 4.
     Red is column 13, t = 0.206349, red-green segment, w = 0.412698:
       linear:   r = trunc(255*0.587302) = trunc(149.76) = 149,
                 g = trunc(255*0.412698) = trunc(105.24) = 105.
     Black is t = 0 and white t = 1, both exact hits on a stop. */
  test('takes N stops through PB.gradientMap and shows the ends in the wells', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: SWATCHES });
    const before = await pixels(page);
    const stops = [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#00ff00' }, { at: 1, color: '#0000ff' }];
    let r = await page.evaluate(s => PB.gradientMap({ stops: s, interp: 'constant', apply: true }), stops);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    let d = await pixels(page);
    expect(at(d, 5, 0), 'grey: constant takes the segment start').toEqual([0, 255, 0, 255]);
    expect(at(d, 1, 0), 'black: exact hit on the first stop').toEqual([255, 0, 0, 255]);
    expect(at(d, 0, 0), 'white: exact hit on the last stop').toEqual([0, 0, 255, 255]);
    expect(await page.evaluate(() => [$('fxp_c0').value, $('fxp_c1').value]), 'the wells show the ends').toEqual(['#ff0000', '#0000ff']);
    expect(await undoDepth(page)).toBe(1);
    await undo(page);
    expect(await pixels(page)).toEqual(before);

    r = await page.evaluate(s => PB.gradientMap({ stops: s, interp: 'linear', apply: true }), stops);
    expect(r.ok).toBe(true);
    d = await pixels(page);
    expect(at(d, 5, 0), 'grey: 1.6% of the way from green to blue').toEqual([0, 250, 4, 255]);
    expect(at(d, 2, 0), 'red swatch: 41% of the way from red to green').toEqual([149, 105, 0, 255]);
    expect(await undoDepth(page)).toBe(1);

    const bad = await page.evaluate(() => [PB.gradientMap({ stops: [{ at: 0, color: '#000000' }] }).ok,
      PB.gradientMap({ stops: [{ at: 0, color: 'red' }, { at: 1, color: '#ffffff' }] }).ok,
      PB.gradientMap({ stops: [{ at: 2, color: '#000000' }, { at: 1, color: '#ffffff' }] }).ok]);
    expect(bad, 'one stop, a named colour, an offset past 1: all refused').toEqual([false, false, false]);
    expect(await undoDepth(page), 'and none of them cost a step').toBe(1);
  });

  /* Alpha rides on the stops: output.a *= gradient_color.a. Black at alpha
     0 to white at alpha 255: grey 128 is column 32 whose alpha is
     trunc(255*32/63) = 129, so the pixel's alpha is round(255*129/255) =
     129; white keeps 255; black goes to 0.
     Cubic, three stops, grey 128: t=0.507937 in green->blue with red before
     and blue (clamped) after, w=0.015873. Godot's cubic_interpolate per
     channel, 0.5*(2a + (b-p)w + (2p-5a+4b-q)w^2 + (3a-3b+q-p)w^3):
       r: p=1,a=0,b=0,q=0 -> 0.5*(-w+2w^2-w^3) < 0 -> 0
       g: p=0,a=1,b=0,q=0 -> 0.5*(2-5w^2+3w^3) = 0.999376 -> trunc(254.84) = 254
       b: p=0,a=0,b=1,q=1 -> 0.5*(w+3w^2-2w^3) = 0.008310 -> trunc(2.12) = 2
     and red, column 13, t=0.206349 in red->green with red (clamped) before
     and blue after, w=0.412698:
       r: p=1,a=1,b=0,q=0 -> 1-0.5w-1.5w^2+w^3 = 0.608462 -> trunc(155.16) = 155
       g: p=0,a=0,b=1,q=0 -> 0.5*(w+4w^2-3w^3) = 0.441553 -> trunc(112.60) = 112
       b: p=0,a=0,b=0,q=1 -> 0.5*(-w^2+w^3) < 0 -> 0 */
  test('carries stop alpha and cubic interpolation (run() alone, past the canvas)', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: SWATCHES });
    const src = [128, 128, 128, 255, 255, 255, 255, 255, 0, 0, 0, 255];
    const a = await run(page, 'gradmap', src, 3, 1, { stops: [{ at: 0, color: '#000000', alpha: 0 }, { at: 1, color: '#ffffff', alpha: 255 }] });
    expect(a, 'grey 129/129, white stays, black vanishes').toEqual([129, 129, 129, 129, 255, 255, 255, 255, 0, 0, 0, 0]);
    const c = await run(page, 'gradmap', [128, 128, 128, 255, 255, 0, 0, 255], 2, 1,
      { stops: [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#00ff00' }, { at: 1, color: '#0000ff' }], interp: 'cubic' });
    expect(c.slice(0, 4), 'cubic overshoots and is clamped').toEqual([0, 254, 2, 255]);
    expect(c.slice(4, 8), 'cubic with the first neighbour clamped').toEqual([155, 112, 0, 255]);
  });
});

test.describe('drop shadow', () => {
  /* DropShadow.gdshaderinc: sh = alpha at (x-ox, y-oy) * shadow.a * (1 -
     original.a); rgb = mix(original, shadow, sh); a = mix(original.a, 1,
     sh). Opaque shadow, one red pixel at (4,4), offset 2,3: the shadow is
     (21,21,21,255) at (6,7), the pixel itself is unchanged (original.a = 1
     erases the shadow), nothing else is touched, the canvas is still 16x16. */
  test('LANDS UNDER THE ART, OFFSET, WITHOUT GROWING THE CANVAS', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: DOT });
    const before = await pixels(page);
    const r = await apply(page, 'dropshadow', { ox: 2, oy: 3, color: '#151515', alpha: 255 });
    expect(r.ok).toBe(true);
    const d = await pixels(page);
    expect(at(d, 6, 7), 'the shadow').toEqual([21, 21, 21, 255]);
    expect(at(d, 4, 4), 'the art').toEqual([255, 0, 0, 255]);
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    expect(n, 'two pixels in all').toBe(2);
    expect(await page.evaluate(() => [art.width, art.height])).toEqual([16, 16]);
    expect(await undoDepth(page)).toBe(1);
    await undo(page);
    expect(await pixels(page)).toEqual(before);
  });

  /* The dialog's default, alpha 160 = 0.627451. Over a clear pixel, whose
     rgb is 0: rgb = round(0*(1-sh) + 21*sh) = round(13.18) = 13, a =
     round(0 + sh*255) = 160. The shader darkens the colour by its own
     alpha - kept, because that is what Pixelorama draws.
     Over a half-blue pixel (0,0,255,128): sh = 0.627451 * (1 - 128/255) =
     0.312495; a = round(128 + 0.312495*127) = round(167.69) = 168;
     b = round(255*0.687505 + 21*0.312495) = round(181.88) = 182;
     r = g = round(21*0.312495) = round(6.56) = 7. */
  test('blends by its alpha, and is erased under the art (run() alone)', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: DOT });
    const src = put(put(put(blank(W, H), W, 4, 4, [255, 0, 0]), W, 6, 7, [0, 0, 255, 128]), W, 8, 8, [0, 255, 0]);
    const d = await run(page, 'dropshadow', src, W, H, { ox: 2, oy: 3 });
    expect(at(d, 6, 7), 'over the half-blue pixel').toEqual([7, 7, 182, 168]);
    expect(at(d, 10, 11), 'the green pixel\'s shadow on clear ground').toEqual([13, 13, 13, 160]);
    const e = await run(page, 'dropshadow', put(put(blank(W, H), W, 4, 4, [255, 0, 0]), W, 6, 7, [0, 255, 0]), W, H, { ox: 2, oy: 3 });
    expect(at(e, 6, 7), 'an opaque pixel takes no shadow at all').toEqual([0, 255, 0, 255]);
  });

  /* The shader's border term. Red at (15,15), offset -1,-1: (14,14) samples
     (15,15) and gets the shadow; (15,14) samples (16,15), which is off the
     texture - clamp sampling would read (15,15) and smear a shadow there,
     and the border term is what stops it. */
  test('never smears the edge texel', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: DOT });
    const d = await run(page, 'dropshadow', put(blank(W, H), W, 15, 15, [255, 0, 0]), W, H, { ox: -1, oy: -1, alpha: 255 });
    expect(at(d, 14, 14), 'the legitimate shadow').toEqual([21, 21, 21, 255]);
    expect(at(d, 15, 14)[3], 'off the texture across').toBe(0);
    expect(at(d, 14, 15)[3], 'off the texture down').toBe(0);
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    expect(n).toBe(2);
  });
});

test.describe('pixelize', () => {
  /* Pixelize.gdshaderinc: sample round(uv*W/ps)*ps/W with uv=(x+0.5)/W, so
     the texel is ps*round((2x+1)/(2ps)), clamped to W-1. Block 4:
       x 0,1 -> round(.125,.375) = 0 -> 0
       x 2..5 -> round(.625 .. 1.375) = 1 -> 4
       x 6..9 -> 8, 10..13 -> 12, 14,15 -> 16 -> clamped 15. */
  const gx = (x, ps) => Math.min(W - 1, ps * Math.floor((2 * x + 1 + ps) / (2 * ps)));
  test('SAMPLES THE TEXEL EACH BLOCK IS CENTRED ON, CLAMPED AT THE EDGE', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    const r = await apply(page, 'pixelize', { px: 4, py: 4 });
    expect(r.ok).toBe(true);
    const d = await pixels(page);
    expect(at(d, 2, 5), '(2,5) -> texel (4,4)').toEqual([64, 64, 0, 255]);
    expect(at(d, 14, 15), '(14,15) -> texel (16,16) clamped to (15,15)').toEqual([240, 240, 0, 255]);
    expect(at(d, 0, 0)).toEqual([0, 0, 0, 255]);
    const want = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) want.push(...at(before, gx(x, 4), gx(y, 4)));
    expect(d, 'every pixel').toEqual(want);
    expect(await undoDepth(page)).toBe(1);
  });

  /* Odd sizes put a pixel on an exact half: block 3, x=1 is (2+1)/6 = 0.5.
     GLSL round() leaves that to the GPU; the port rounds it up, to texel 3.
     x=4 is 9/6 = 1.5 -> 2 -> texel 6. Pinned so the choice is visible. */
  test('rounds the exact half of an odd block up, and says so', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const d = await run(page, 'pixelize', await pixels(page), W, H, { px: 3, py: 3 });
    expect(at(d, 1, 0), 'x=1 -> texel 3').toEqual([48, 0, 0, 255]);
    expect(at(d, 4, 0), 'x=4 -> texel 6').toEqual([96, 0, 0, 255]);
    expect(at(d, 0, 0), 'x=0 -> texel 0').toEqual([0, 0, 0, 255]);
  });
});

test.describe('offset', () => {
  /* OffsetPixels.gdshaderinc at scale 1: uv=(x+0.5-ox)/W, fract() when
     wrapping, texel floor(uv*W) = (x-ox) mod W. */
  test('WRAPS WHAT LEAVES ONE EDGE IN AT THE OTHER', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    const r = await apply(page, 'offset', { ox: 3, oy: -2, scale: 100, wrap: true });
    expect(r.ok).toBe(true);
    const d = await pixels(page);
    const want = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) want.push(...at(before, (x - 3 + W) % W, (y + 2) % H));
    expect(d).toEqual(want);
    expect(await undoDepth(page)).toBe(1);
    await undo(page);
    expect(await pixels(page)).toEqual(before);
  });

  /* Without wrap the two step()s zero the alpha where the sample uv leaves
     [0,1]: x<3 samples left of the texture, y>=14 samples below it. */
  test('loses what leaves an edge when not wrapping', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    await apply(page, 'offset', { ox: 3, oy: -2, scale: 100, wrap: false });
    const d = await pixels(page);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const got = at(d, x, y);
      if (x < 3 || y >= 14) expect(got[3], 'clear at ' + x + ',' + y).toBe(0);
      else expect(got, 'moved at ' + x + ',' + y).toEqual(at(before, x - 3, y + 2));
    }
  });

  /* Scale 200%: zoomed = ((x+0.5)/16 - 0.5)/2 + 0.5, texel floor(16*zoomed)
     = floor((x+0.5-8)/2 + 8): x=8 -> 8.25 -> 8, x=9 -> 8.75 -> 8, x=0 ->
     4.25 -> 4, x=15 -> 11.75 -> 11. Exact in binary at a width of 16. */
  test('scales about the centre', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    await apply(page, 'offset', { ox: 0, oy: 0, scale: 200, wrap: false });
    const d = await pixels(page);
    expect(at(d, 8, 8)).toEqual(at(before, 8, 8));
    expect(at(d, 9, 9)).toEqual(at(before, 8, 8));
    expect(at(d, 0, 0)).toEqual(at(before, 4, 4));
    expect(at(d, 15, 15)).toEqual(at(before, 11, 11));
    const z = x => Math.floor((x + 0.5 - 8) / 2 + 8);
    const want = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) want.push(...at(before, z(x), z(y)));
    expect(d).toEqual(want);
  });

  /* The call has to be ACCEPTED for this to mean anything: with the effect
     absent PB.adjust says ok:false, nothing changes and the depth is 0 too,
     and the test would pass on a page with no offset in it. */
  test('at rest it changes nothing, and the panel refuses it without an undo step', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: UNIQUE });
    const before = await pixels(page);
    const r = await apply(page, 'offset', { ox: 0, oy: 0, scale: 100, wrap: true });
    expect(r.ok, 'the effect exists and the panel took the values').toBe(true);
    expect(r.values, 'as given').toEqual({ ox: 0, oy: 0, scale: 100, wrap: true });
    expect(await pixels(page)).toEqual(before);
    expect(await undoDepth(page)).toBe(0);
  });
});

test.describe('inline', () => {
  /* OutlineInline.gdshaderinc, inside=true: an opaque pixel is coloured
     when its brush neighbourhood holds a clear pixel or a point off the
     canvas. Solid 16x16 red with a clear pixel at (8,8):
       a pixel within reach r of an edge is coloured: 16^2 - (16-2r)^2 =
       60 for r=1, 112 for r=2 (every brush here reaches r along the axes)
       the hole colours its neighbourhood less itself:
         diamond |i|+|j|<=w: 4 at w=1, 12 at w=2
         circle  |j|<=floor(sqrt((w+.5)^2-i^2)): the full 3x3 at w=1 -> 8;
                 at w=2 rows i=0,+-1 reach 2 and i=+-2 reach 1 -> 21-1 = 20
         square  8 at w=1, 24 at w=2
       so: diamond 1 = 64, circle 1 = 68, square 1 = 68,
           diamond 2 = 124, circle 2 = 132, square 2 = 136. */
  const CASES = [['diamond', 1, 64], ['circle', 1, 68], ['square', 1, 68], ['diamond', 2, 124], ['circle', 2, 132], ['square', 2, 136]];
  test('COLOURS THE INSIDE EDGE, SHAPED BY THE BRUSH', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: HOLE });
    const before = await pixels(page);
    for (const [brush, width, want] of CASES) {
      const r = await apply(page, 'inline', { width, color: '#000000', alpha: 255, brush });
      expect(r.ok).toBe(true);
      const d = await pixels(page);
      let black = 0, red = 0, other = 0;
      for (let i = 0; i < d.length; i += 4) {
        const px = d.slice(i, i + 4).join();
        if (px === '0,0,0,255') black++; else if (px === '255,0,0,255') red++; else if (px !== '0,0,0,0') other++;
      }
      expect(black, brush + ' ' + width + ': coloured').toBe(want);
      expect(red, brush + ' ' + width + ': left alone').toBe(255 - want);
      expect(other, 'nothing half done').toBe(0);
      expect(at(d, 8, 8), 'the hole is still a hole').toEqual([0, 0, 0, 0]);
      expect(await undoDepth(page)).toBe(1);
      await undo(page);
      expect(await pixels(page)).toEqual(before);
    }
  });

  /* rgb = mix(rgb, colour, ca), a += (1-a)*ca: black at alpha 128 on red
     gives round(255*127/255) = 127, alpha stays 255. At alpha 0 the shader
     sets a = colour.a = 0, erasing the edge - kept. */
  test('blends by alpha and erases at alpha 0 (run() alone)', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: HOLE });
    const src = blank(5, 5);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) put(src, 5, x, y, [255, 0, 0]);
    const half = await run(page, 'inline', src, 5, 5, { width: 1, alpha: 128 });
    expect(half.slice((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4), 'a corner').toEqual([127, 0, 0, 255]);
    expect(half.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4), 'the centre').toEqual([255, 0, 0, 255]);
    const gone = await run(page, 'inline', src, 5, 5, { width: 1, alpha: 0 });
    expect(gone.slice((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)[3], 'the edge erased').toBe(0);
    expect(gone.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4), 'the centre kept').toEqual([255, 0, 0, 255]);
  });

  test('and the outside Outline panel is what it was', async ({ page }) => {
    await openTrait(page, { w: W, h: H, draw: HOLE });
    const r = await page.evaluate(() => ({ fn: typeof applyOutline, scrim: !!document.getElementById('olscrim'),
      add: !!document.getElementById('oladd'), btn: !!document.getElementById('olbtn') }));
    expect(r).toEqual({ fn: 'function', scrim: true, add: true, btn: true });
  });
});
