/* THE HIDE THAT RUNS BY ITSELF WHEN A TRAIT IS OPENED.

   A picture whose base pair covers 88% or more is treated as a render rather
   than a trait and has its base removed on open. The threshold is measured and
   the gap is real - sixteen renders reach 94.5% at the lowest, 264 approved
   traits 79.1% at the highest.

   But a picture made ENTIRELY of the pair is 100% covered, and removing the
   base from it removes all of it. Measured before this guard, a 12x12 block in
   two flat colours on a 40x60 canvas:

     painted after opening   0
     said                    "Hid the base - 144 pixels. Undo brings it back."

   The whole trait, gone. Announced and one undo away, so nothing was lost -
   but "hide the base" cannot have meant "empty the canvas".

   FOUND SIDEWAYS, which is why this file exists at all: every multi-colour
   fixture written that day came back blank, and the answer was this firing on
   test artwork that is by construction exactly two flat colours.

   BOTH DIRECTIONS ARE HERE. A guard that simply stopped the automatic hide
   would pass the first test and turn the feature off, so the second one is a
   render that must still be cleared - and it is the same two colours, with a
   third on top, so the two differ by exactly the thing the guard tests.
*/
import { test, expect } from '@playwright/test';

/* Seeded through startEditor directly rather than openTrait, because what is
   being measured happens INSIDE startEditor and the helper's own draw would
   sit between this and it. */
const open = (page, extra) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  const said = []; const realToast = window.toast;
  window.toast = m => said.push(String(m));
  const W = 40, H = 60;
  const d = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, c) => { const i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  /* The pair: 144 cells in two flat colours. */
  for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++)
    put(x, y, (x < 10) ? [224, 64, 64] : [40, 90, 220]);
  /* And, for the render case, nine cells of something else - so the pair is
     144 of 153, which is 94% and past the 88% the hide fires at. */
  if (o.survivor) for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++)
    put(x, y, [20, 200, 90]);

  startEditor(d, W, H, W, H, palette(d, W * H, 24, 64), false);
  await new Promise(x => setTimeout(x, 400));
  window.toast = realToast;

  const dd = ctx.getImageData(0, 0, art.width, art.height).data;
  let painted = 0, survivor = 0;
  for (let i = 0; i < art.width * art.height; i++) if (dd[i * 4 + 3]) { painted++;
    if (dd[i * 4 + 1] > 150 && dd[i * 4] < 100) survivor++; }
  return { painted, survivor, said: said.join(' | '), undoDepth: undoStack.length };
}, extra || {});

test.describe('the base-hide that runs on opening a trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
  });

  test('DOES NOT EMPTY THE CANVAS', async ({ page }) => {
    /* Every opaque cell is one of the pair, so hiding the base would take all
       144 and leave nothing. */
    const r = await open(page, { survivor: false });
    expect(r.painted, 'the trait is still there').toBe(144);
    expect(r.said, 'and nothing was said about hiding anything')
      .not.toContain('Hid the base');
    expect(r.undoDepth, 'and no undo step for a change nobody made').toBe(0);
  });

  test('BUT STILL CLEARS A RENDER - the control', async ({ page }) => {
    /* The same two colours with nine cells of a third on top: the pair is 144
       of 153, past the threshold, and something survives it. Without this a
       guard that just disabled the automatic hide would pass the test above. */
    const r = await open(page, { survivor: true });
    expect(r.said, 'the hide ran').toContain('Hid the base - 144 pixels');
    expect(r.painted, 'and took the pair with it').toBe(9);
    expect(r.survivor, 'leaving the part that was not base').toBe(9);
  });

  test('and the message still says it can be undone', async ({ page }) => {
    /* The hide is a change to somebody artwork made without being asked, so
       the way back is part of the message rather than something to discover. */
    const r = await open(page, { survivor: true });
    expect(r.said).toContain('Undo brings it back');
    expect(r.undoDepth, 'and the step is really there').toBeGreaterThan(0);
  });
});
