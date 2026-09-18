/* THE TWO BUTTONS THAT DESCRIBE THE ARTWORK FOLLOW IT.

   "Clean up colours (N -> M)" and "Hide the base colour (pair, %)" are both
   computed by walking the canvas. Eight routes replace that canvas - three
   turns, two resizes, undo, redo and reset - and none of them refreshed either
   label, so both described the artwork that had just been replaced.

   Hide the base is the one that shows: it is DISABLED when there is no base
   and enabled with a percentage when there is, so a Reset that brings a base
   back leaves a dead button on artwork that has one.

   DEFERRED ON PURPOSE. Measured on a 1280 trait of twelve colours: one undo
   costs 57ms, cleanLabel 85ms and baseLabel 34ms. Doing them inside undo makes
   the most-pressed control in the editor three times slower for two captions.
   So the refresh is scheduled for the next frame and coalesced - which is why
   every test here waits a frame before reading, and why one of them presses
   undo repeatedly and checks the work was done once.
*/
import { test, expect } from '@playwright/test';

/* TWO STEPS, WHICH IS THE REAL FLOW. Hide the base is only enabled when the
   browser KNOWS the base colours, and it learns them by having a render opened:
   a picture whose base pair covers 88% or more is cleared on open and its
   colours remembered.

   So the first image here is that render. The second is an ordinary trait
   carrying some of the same colours - below the threshold, so it is left alone
   - and that is the state where the button has something to say and a number
   to say it with.

   A one-step fixture does not work, and finding that out is what the first
   version of this test did: the render is auto-cleared on open, which leaves
   no base in it, which leaves the button disabled and the test asserting a
   change that could not happen. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  const realToast = window.toast; window.toast = () => {};
  const W = 60, H = 60;
  const mk = () => new Uint8ClampedArray(W * H * 4);
  const putter = (d) => (x, y, c) => { const i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };

  /* THE RENDER, and it has to be one the machinery actually accepts. A big
     two-tone field with a trait on it is NOT accepted - measured, it opens
     untouched - so this is the shape that is: a small area which is 94% two
     flat colours, with a few cells of a third so something survives the hide
     and the pair gets remembered. */
  const r = mk(); const pr = putter(r);
  for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++)
    pr(x, y, (x < 10) ? [224, 64, 64] : [40, 90, 220]);
  for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) pr(x, y, [20, 200, 90]);
  startEditor(r, W, H, W, H, palette(r, W * H, 24, 64), false);
  await new Promise(x => setTimeout(x, 400));

  /* The trait: mostly its own colour, with a corner of the remembered pair -
     enough for the button to offer something, far short of the 88% that would
     have it cleared on arrival. */
  /* MANY NEAR-IDENTICAL GREENS, so Clean up colours has a reduction to offer
     and its label carries numbers. With one flat green it reads "Clean up
     colours" with nothing after it, the same before and after any edit - and
     then every assertion about that label is true of a caption that never
     moves, which is exactly the hole a mutation found here. */
  const t = mk(); const pt = putter(t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    pt(x, y, [20 + ((x * 3) % 14), 200 - ((y * 2) % 12), 90 + ((x + y) % 10)]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    pt(x, y, (x < 8) ? [224, 64, 64] : [40, 90, 220]);
  startEditor(t, W, H, W, H, palette(t, W * H, 24, 64), false);
  await new Promise(x => setTimeout(x, 400));
  window.toast = realToast;
});

const frame = (page) => page.evaluate(() => new Promise(r =>
  requestAnimationFrame(() => requestAnimationFrame(r))));

const labels = (page) => page.evaluate(() => ({
  clean: document.getElementById('rcclean').textContent,
  base: document.getElementById('hidebase').textContent,
  baseOff: document.getElementById('hidebase').disabled,
}));

test.describe('the buttons that describe the artwork', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
    await seed(page);
    await frame(page);
  });

  test('FOLLOW A RESET', async ({ page }) => {
    const before = await labels(page);
    /* Take the base out, which is what leaves Hide the base with nothing to
       offer - then put it back with Reset. */
    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      hideBaseClicked();
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
    });
    await frame(page);
    const hidden = await labels(page);
    /* THE PRECONDITION, FOR BOTH LABELS. "it came back to what it was" is
       satisfied by a label that never moved at all - measured: a mutation that
       stopped refreshing the colour count left every one of those equality
       checks passing, and only the call-counting test noticed. So each label
       is required to CHANGE here before it is required to change back. */
    expect(hidden.base, 'hiding the base changes that button').not.toBe(before.base);
    expect(hidden.clean, 'and takes two colours out, which the other one counts')
      .not.toBe(before.clean);

    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      document.getElementById('reset').click();
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
    });
    await frame(page);
    const after = await labels(page);
    expect(after.base, 'and Reset puts it back').toBe(before.base);
    expect(after.baseOff, 'not left dead on artwork that has a base').toBe(before.baseOff);
    expect(after.clean, 'and the colour counts are the original ones again')
      .toBe(before.clean);
  });

  test('AND AN UNDO, which had the same gap', async ({ page }) => {
    /* The review only noticed Reset. undo and redo replace the canvas the same
       way and were equally stale - fixing Reset alone would have been the same
       single-point remedy that left this gap in the first place. */
    const before = await labels(page);
    await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      hideBaseClicked();
      await new Promise(x => setTimeout(x, 300));
      document.getElementById('undo').click();
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
    });
    await frame(page);
    const after = await labels(page);
    expect(after.base).toBe(before.base);
    expect(after.clean).toBe(before.clean);
  });

  test('and a redo, for the same reason', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const realToast = window.toast; window.toast = () => {};
      hideBaseClicked();
      await new Promise(x => setTimeout(x, 300));
      const hidden = document.getElementById('hidebase').textContent;
      document.getElementById('undo').click();
      await new Promise(x => setTimeout(x, 300));
      document.getElementById('redo').click();
      await new Promise(x => setTimeout(x, 300));
      window.toast = realToast;
      return { hidden };
    });
    await frame(page);
    const after = await labels(page);
    expect(after.base, 'redo lands back on the hidden state and says so')
      .toBe(r.hidden);
  });

  test('IT IS DONE ONCE FOR A RUN OF UNDOS - the coalescing', async ({ page }) => {
    /* The cost argument only holds if holding undo down does not run this per
       step. Counted by watching how many times the label is actually
       recomputed, rather than by timing, which would be a flake. */
    const n = await page.evaluate(async () => {
      let calls = 0;
      const real = window.cleanLabel;
      window.cleanLabel = function () { calls++; return real.apply(this, arguments); };
      try {
        const realToast = window.toast; window.toast = () => {};
        /* Five changes in one go, with no frame in between. */
        for (let i = 0; i < 5; i++) {
          snapshot();
          ctx.fillStyle = 'rgb(' + (i * 30) + ',10,10)';
          ctx.fillRect(i, 0, 3, 3);
        }
        for (let i = 0; i < 5; i++) document.getElementById('undo').click();
        window.toast = realToast;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      } finally { window.cleanLabel = real; }
      return calls;
    });
    expect(n, 'five undos, one recompute').toBe(1);
  });

  test('and it is not computed inside the undo itself - the control',
    async ({ page }) => {
      /* What the deferral is FOR. If the refresh were synchronous this would
         see it before any frame had passed. */
      const during = await page.evaluate(async () => {
        let calls = 0;
        const real = window.cleanLabel;
        window.cleanLabel = function () { calls++; return real.apply(this, arguments); };
        try {
          snapshot();
          ctx.fillStyle = '#ff00aa'; ctx.fillRect(0, 0, 8, 8);
          const realToast = window.toast; window.toast = () => {};
          document.getElementById('undo').click();
          window.toast = realToast;
          return calls;            /* read before yielding to a frame */
        } finally { window.cleanLabel = real; }
      });
      expect(during, 'undo returns without paying for the label').toBe(0);
    });
});
