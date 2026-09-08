/* The black outline, and the frame it used to draw round a background.

   blackenEdge outlines every opaque pixel that touches empty space, and counts
   off-canvas as empty on purpose: a hat cropped at the top of the frame still
   wants its outline there. For a background - which covers the whole canvas by
   definition - that found a boundary on all four sides and drew a black
   rectangle round the picture. The user objected to exactly that during the
   final review.

   MEASURED ON THE REAL 317 BEFORE THE RULE CHANGED: 58 files fill all four
   canvas edges and they are exactly the 58 backgrounds; not one file fills
   some edges but not all; the other 259 are untouched, 94 of which keep
   perimeter black where the art really does run off the side.

   THE TWO THAT MATTER ARE THE PAIR: the full-bleed one loses its frame and the
   cropped one keeps its outline. Either alone passes for a rule that is wrong
   in the other direction.
*/
import { test, expect } from '@playwright/test';

/* Runs blackenEdge over a canvas the test describes, and reports where the
   black landed. Works on the function directly: this is a pixel rule, and
   going through save/export would put four other transforms in the way. */
const run = (page, opts) => page.evaluate((o) => {
  const { w, h, fill } = o;
  const t = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, v, a) => { const i = (y * w + x) * 4;
    t[i] = v; t[i + 1] = v; t[i + 2] = v; t[i + 3] = a; };
  /* eslint-disable no-new-func */
  const inside = new Function('x', 'y', 'w', 'h', 'return (' + fill + ');');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    inside(x, y, w, h) ? set(x, y, 128, 255) : set(x, y, 0, 0);
  const ring = blackenEdge(t, w, h);
  const isBlack = (x, y) => { const i = (y * w + x) * 4;
    return t[i] === 0 && t[i + 1] === 0 && t[i + 2] === 0 && t[i + 3] === 255; };
  /* How much black landed on each side of the canvas, and in the middle. */
  let top = 0, bot = 0, left = 0, right = 0, interior = 0;
  for (let x = 0; x < w; x++) { if (isBlack(x, 0)) top++; if (isBlack(x, h - 1)) bot++; }
  for (let y = 0; y < h; y++) { if (isBlack(0, y)) left++; if (isBlack(w - 1, y)) right++; }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
    if (isBlack(x, y)) interior++;
  return { ring, top, bot, left, right, interior };
}, opts);

test.describe('the outline at the edge of the canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof blackenEdge === 'function');
  });

  test('A BACKGROUND THAT FILLS THE CANVAS GETS NO FRAME', async ({ page }) => {
    /* THE ONE THE USER OBJECTED TO. Every pixel opaque, so there is no edge of
       the art anywhere - and 58 of the 317 real traits are exactly this. */
    const r = await run(page, { w: 40, h: 40, fill: 'true' });
    expect(r.ring, 'not one pixel outlined').toBe(0);
    expect([r.top, r.bot, r.left, r.right], 'no black on any side')
      .toEqual([0, 0, 0, 0]);
  });

  test('AND A TRAIT CROPPED AT THE FRAME KEEPS ITS OUTLINE THERE',
    async ({ page }) => {
      /* THE OTHER HALF OF THE PAIR, and the reason the rule is about a FILLED
         edge rather than about the canvas edge. 94 real traits run off a side
         like this and must still be outlined. Without this test, "never
         outline at the canvas edge" passes the one above.

         A hat cut off at the top: twenty pixels wide, touching the top of the
         frame but nowhere near filling it. */
      const r = await run(page,
        { w: 40, h: 40, fill: 'x >= 10 && x < 30 && y < 20' });
      expect(r.top, 'the cropped side is outlined right across the art').toBe(20);
      expect(r.bot, 'the empty side has nothing on it').toBe(0);
      expect([r.left, r.right], 'and the art is nowhere near the sides')
        .toEqual([0, 0]);
    });

  test('a shape in the middle is outlined exactly as before', async ({ page }) => {
    /* The rule that was already there, unchanged: this is what the collection
       actually wants and none of it should move. */
    const r = await run(page,
      { w: 40, h: 40, fill: 'x>=10 && x<30 && y>=10 && y<30' });
    /* A 20x20 block: the outline is its perimeter, 20*4 - 4 corners. */
    expect(r.ring).toBe(76);
    expect([r.top, r.bot, r.left, r.right], 'and nothing at the canvas edge')
      .toEqual([0, 0, 0, 0]);
    expect(r.interior).toBe(76);
  });

  test('ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE', async ({ page }) => {
    /* The rule is per edge, not "does the art touch the frame at all", and the
       arithmetic that gets that wrong is easy to write. Art filling the top
       thirty rows bleeds off the TOP only: its left and right run off the side
       without filling those edges, and its bottom is a real boundary.

       The corners are the tell. (0,0) has a neighbour off the left, which is
       not a filled edge, so it is outlined - while (1,0) has neighbours off
       only the filled top and is not. */
    const r = await run(page, { w: 40, h: 40, fill: 'y < 30' });
    expect(r.top, 'only the two corners, where the art also runs off a side')
      .toBe(2);
    expect(r.bot, 'nothing on the empty bottom row').toBe(0);
    expect(r.left, 'the whole left run of the art, which is not a filled edge')
      .toBe(30);
    expect(r.right, 'and the same on the right').toBe(30);
      /* The art's own bottom boundary, at y = 29. */
      const bottomRow = await page.evaluate(() => {
        const w = 40, h = 40;
        const t = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (y < 30) { t[i] = 128; t[i + 1] = 128; t[i + 2] = 128; t[i + 3] = 255; }
        }
        blackenEdge(t, w, h);
        let n = 0;
        for (let x = 0; x < w; x++) { const i = (29 * w + x) * 4;
          if (t[i] === 0 && t[i + 3] === 255) n++; }
        return n;
      });
      expect(bottomRow, 'the art\'s real bottom edge is outlined').toBe(40);
    });

  test('AND THE CORNER, where a diagonal neighbour is off two edges at once',
    async ({ page }) => {
      /* The case the arithmetic can get wrong. Art filling the left column and
         the top row only: the pixel at 0,0 has a diagonal neighbour off BOTH
         edges, and it counts as covered only because both are filled. */
      const r = await run(page, { w: 40, h: 40, fill: 'x === 0 || y === 0' });
      /* Every pixel of that thin cross touches empty space on canvas, so the
         whole thing outlines - what matters is that it does not throw. */
      expect(r.ring, 'the thin arms are all edge').toBe(79);
    });

  test('an empty canvas outlines nothing', async ({ page }) => {
    /* The degenerate case. With every edge unfilled the guard must not decide
       the whole canvas is covered. */
    const r = await run(page, { w: 20, h: 20, fill: 'false' });
    expect(r.ring).toBe(0);
  });
});
