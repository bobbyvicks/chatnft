/* THE SHAPE IS THE SAME SHAPE WHATEVER THE TRAIT IS SIZED AT.

   A base is saved big - 1280 is ordinary - and the trait being drawn is
   usually smaller. Working the shape out AFTER scaling the source onto the
   canvas gives the right answer only when the two happen to match:

     1280 base onto 1280      583,539 pixels, 36% - the body
     1280 base onto  320          403 pixels     - pieces of stroke
     1280 base onto  160           93 pixels

   Nearest-neighbour is what a pixel editor has to downscale with, and a 1px
   line taken 4:1 by nearest-neighbour is a dotted line. A dotted outline
   encloses nothing, so the flood walks through the gaps and what comes back is
   whatever survived.

   The shape is worked out at the size it was drawn now, and the finished solid
   mask is what gets scaled. So every canvas size gets the same 36%.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 40]);
};

/* A character in 1px linework on white, at 1280 - the shape and the size a
   real base is. Head, neck, and shoulders running off the bottom edge. */
const bigBase = () => `
  const S = 1280, k = S / 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#000'; g.lineWidth = 1; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(52*k, 92*k);
  g.bezierCurveTo(38*k, 84*k, 35*k, 72*k, 35*k, 62*k);
  g.lineTo(35*k, 46*k);
  g.bezierCurveTo(36*k, 28*k, 48*k, 20*k, 62*k, 20*k);
  g.bezierCurveTo(80*k, 20*k, 94*k, 32*k, 94*k, 50*k);
  g.bezierCurveTo(94*k, 68*k, 90*k, 84*k, 76*k, 92*k);
  g.bezierCurveTo(66*k, 96*k, 58*k, 96*k, 52*k, 92*k);
  g.stroke();
  g.beginPath(); g.moveTo(51*k, 82*k); g.lineTo(51*k, 99*k); g.stroke();
  g.beginPath(); g.moveTo(74*k, 93*k); g.lineTo(74*k, 99*k); g.stroke();
  g.beginPath(); g.moveTo(51*k, 99*k); g.bezierCurveTo(40*k, 104*k, 20*k, 112*k, 14*k, 128*k); g.stroke();
  g.beginPath(); g.moveTo(74*k, 99*k); g.bezierCurveTo(90*k, 104*k, 104*k, 112*k, 112*k, 128*k); g.stroke();
  return new Promise(r => c.toBlob(r, 'image/png'));
`;

const shapeOn = (page, side) => page.evaluate(async ({ src, S }) => {
  const blob = await new Function(src)();
  const rec = { id: 'ref_big', kind: 'ref', name: 'big', blob, w: 1280, h: 1280, at: 1 };
  await dbPut(rec);
  const g = await seShapeRegion(rec);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < S * S; i++) if (g.region[i]) {
    const x = i % S, y = (i / S) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { n: g.n, pct: g.n / (S * S), ground: g.ground,
    /* The box as a FRACTION of the canvas, so the three sizes are comparable. */
    box: [x0 / S, y0 / S, (x1 - x0 + 1) / S, (y1 - y0 + 1) / S],
    /* The chest: between the shoulders, hard against the bottom. */
    chest: !!g.region[(S - 2) * S + Math.floor(S * 0.48)] };
}, { src: bigBase(), S: side });

test.describe('a big base on a smaller trait', () => {
  test('A 1280 LINE-ART BASE GIVES THE SAME SHAPE AT EVERY TRAIT SIZE',
    async ({ page }) => {
      /* One test rather than three, because the claim is that the three AGREE -
         and a claim about agreement cannot be made one case at a time. */
      const got = {};
      for (const side of [1280, 320, 160]) {
        await openTrait(page, { w: side, h: side, draw: FLAT });
        got[side] = await shapeOn(page, side);
      }
      for (const side of [1280, 320, 160]) {
        expect(got[side].ground, side + ': the white page comes out').toBe(true);
        /* The part a broken outline loses first, and the part that matters
           most. Before this, 320 and 160 lost the whole torso. */
        expect(got[side].chest, side + ': the chest is inside the character').toBe(true);
      }
      /* THE ASSERTION THAT COULD NOT BE MADE ONE AT A TIME. The same drawing is
         the same share of the canvas whatever the canvas is, and sits in the
         same place on it, to within the rounding of a single pixel. Before the
         shape was worked out at the source size: 36% at 1280, 0.4% at 320 and
         0.36% at 160. */
      const ref = got[1280];
      for (const side of [320, 160]) {
        expect(Math.abs(got[side].pct - ref.pct), side + ': the same share of the canvas')
          .toBeLessThan(0.01);
        for (let k = 0; k < 4; k++)
          expect(Math.abs(got[side].box[k] - ref.box[k]), side + ': the same box, part ' + k)
            .toBeLessThan(0.01);
      }
      /* And it is the body rather than the whole canvas or a handful of
         fragments - which is what makes the agreement worth having. */
      expect(ref.pct, 'the body, as a share of the canvas').toBeGreaterThan(0.30);
      expect(ref.pct, 'and not the whole thing').toBeLessThan(0.45);
      expect(ref.n, 'the 583,539 it gave when the sizes matched').toBeGreaterThan(560000);
      expect(ref.n).toBeLessThan(610000);
    });
});
