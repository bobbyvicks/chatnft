import { test, expect } from '@playwright/test';
import { openTrait, setField } from './helpers.js';

/* The history is bounded by BYTES as well as by a count of steps.

   The 60-entry cap bounds the count and says nothing about the bytes. An entry
   is width*height*4, and resizeTo clamps at 4096 with the size fields accepting
   it, so one legal entry is 67MB and a legal 60-deep stack was 3.75GB.

   Worth saying plainly: no out-of-memory, GC stall or tab kill was ever
   reproduced at any size. This closes an unbounded quantity; it is not a crash
   fix, and these tests assert the bound, not a rescue. */

const flat = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 0]);
};

const openSize = (page, n) => page.evaluate(s => {
  try { gateShow(false); } catch (_) {}
  const d = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < s * s; i++) { d[i * 4] = 200; d[i * 4 + 1] = 120; d[i * 4 + 3] = 255; }
  fileName = 'b.png';
  startEditor(d, s, s, s, s, palette(d, s * s, 24, 64), false);
}, n);

const saturate = (page, times) => page.evaluate(t => {
  for (let i = 0; i < t; i++) snapshot();
  return {
    entries: undoStack.length,
    bytes: undoStack.reduce((n, e) => n + e.data.byteLength, 0),
    budget: HISTORY_BYTES,
  };
}, times);

test.describe('the history is bounded in bytes', () => {
  test('a big canvas is capped by the budget, not by the count', async ({ page }) => {
    await openTrait(page, { w: 200, h: 200, draw: flat });
    await openSize(page, 1280);
    await page.waitForTimeout(700);
    const r = await saturate(page, 80);
    expect(r.bytes, 'inside the budget').toBeLessThanOrEqual(r.budget);
    // both directions - an always-empty stack passes the line above on its own
    expect(r.entries, 'and still a usable history').toBeGreaterThanOrEqual(25);
    expect(r.entries, 'fewer than the count cap, so the BYTE cap is what bound it').toBeLessThan(60);
  });

  test('a small canvas still keeps sixty steps - the control', async ({ page }) => {
    /* This is what proves the number above came from the byte cap. If 512 came
       back short too, the budget would be binding everywhere and the constant
       would be wrong rather than the design. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    await openSize(page, 512);
    await page.waitForTimeout(500);
    const r = await saturate(page, 80);
    expect(r.entries, '512 is untouched by the budget').toBe(60);
    expect(r.bytes).toBeLessThanOrEqual(r.budget);
  });

  test('pressing undo cannot push the pair past the bound', async ({ page }) => {
    /* Undo pushes a copy of the LIVE canvas onto redo, which can be larger than
       the entry it pops. A budget enforced only inside snapshot() is not a
       bound at all. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    await openSize(page, 1280);
    await page.waitForTimeout(700);
    await saturate(page, 80);
    await page.click('#undo');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      pair: undoStack.reduce((n, e) => n + e.data.byteLength, 0)
          + redoStack.reduce((n, e) => n + e.data.byteLength, 0),
      budget: HISTORY_BYTES,
      redo: redoStack.length,
    }));
    expect(after.pair).toBeLessThanOrEqual(after.budget);
    expect(after.redo, 'and the redo it just created survives').toBe(1);
  });

  test('the trim never takes from the redo stack', async ({ page }) => {
    await openTrait(page, { w: 200, h: 200, draw: flat });
    await openSize(page, 1280);
    await page.waitForTimeout(700);
    await saturate(page, 80);
    for (let i = 0; i < 10; i++) { await page.click('#undo'); await page.waitForTimeout(120); }
    expect(await page.evaluate(() => redoStack.length),
      'ten undos make exactly ten redos, however much trimming happened').toBe(10);
  });

  test('a stroke can be undone pixel for pixel', async ({ page }) => {
    /* The regression net that did not exist. An earlier check proved the
       pre-existing undo tests passed unchanged against an undo handler with
       restoreImage deleted entirely. */
    await openTrait(page, { w: 120, h: 120, draw: flat });
    const px = () => page.evaluate(() => {
      const d = ctx.getImageData(60, 60, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    });
    const before = await px();
    await page.evaluate(() => {
      selectTool('pencil'); setColor('#00ff88');
      snapshot(); dab(60, 60, [0, 255, 136], 255);
    });
    await page.waitForTimeout(200);
    expect(await px(), 'the stroke landed').not.toEqual(before);
    await page.click('#undo');
    await page.waitForTimeout(300);
    expect(await px(), 'and undo restores the exact pixel').toEqual(before);
  });

  test('undo across a resize restores the old dimensions', async ({ page }) => {
    await openTrait(page, { w: 120, h: 120, draw: flat });
    await page.evaluate(() => {
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      document.getElementById('rssnap').setAttribute('aria-pressed', 'false');
      document.getElementById('rsmode').value = 'art';
    });
    await setField(page, 'rsw', 60);
    await setField(page, 'rsh', 60);
    await page.click('#rsgo');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => art.width + 'x' + art.height)).toBe('60x60');
    await page.click('#undo');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => art.width + 'x' + art.height),
      'the canvas goes back to the size it was').toBe('120x120');
  });

  test('a move drag that ends where it started keeps the redo', async ({ page }) => {
    /* Measured broken before the fix: the fill path handed its saved redo back
       and the move path called dropSnapshot with no argument at all, so the
       restore never ran. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    /* Getting this test to actually TEST anything took four attempts, and the
       first three passed while exercising nothing:

         1. A synthetic pointerdown never reaches the handler at all - it is
            bound on the stage and guarded, so beginStroke never ran.
         2. A pointerup on window does not reach a listener bound on the stage.
         3. Calling dropSnapshot from the test instead of letting the app call
            it tests the helper's signature, not the call site - reverting the
            fix left the test green.

       So: drive the ENTRY and the RELEASE through the app's own functions,
       beginStroke and endPointer, and bypass only the DOM plumbing, which is
       not what is under test. And make the redo WITHOUT a pointer event - a
       pointerdown leaves its id in the pointer map, and endPointer's move
       branch is guarded on that map being empty, so a stray id silently skips
       the whole branch. `bufCleared` is the assertion that the branch ran. */
    /* The undo click's work is asynchronous - restoreImage, refreshStats,
       repalette, and an autosave behind them. This used to sleep 300ms and
       hope, which held alone and lost about one full-suite run in three: the
       assertions below then read a redo stack that had not been built yet.
       Waited for, not timed. */
    await page.evaluate(() => {
      selectTool('pencil'); setColor('#00ff88');
      snapshot(); dab(50, 50, [0, 255, 136], 255);
      document.getElementById('undo').click();
    });
    await expect.poll(() => page.evaluate(() => redoStack.length), { timeout: 8000 }).toBe(1);

    const r = await page.evaluate(async () => {
      const redoBefore = redoStack.length, ptsSize = pts.size;

      selectTool('move');
      const a = document.getElementById('art'), rr = a.getBoundingClientRect();
      beginStroke({ clientX: rr.left + 40, clientY: rr.top + 40, pointerId: 99 });
      const ranTheBranch = !!moveBuf;
      const midRedo = redoStack.length;
      endPointer({ pointerId: 99 });
      await new Promise(x => setTimeout(x, 250));
      return { redoBefore, ptsSize, ranTheBranch, midRedo,
               bufCleared: !moveBuf, redoAfter: redoStack.length };
    });
    expect(r.ptsSize, 'no stray pointer, or the release branch is skipped').toBe(0);
    expect(r.ranTheBranch, 'the move branch actually ran').toBe(true);
    expect(r.bufCleared, 'and the release branch actually ran').toBe(true);
    expect(r.redoBefore).toBe(1);
    expect(r.midRedo, 'the snapshot cleared it on the way in').toBe(0);
    expect(r.redoAfter, 'a drag that went nowhere hands the redo back').toBe(1);
  });

  test('dropping a snapshot at the cap does not eat the oldest step', async ({ page }) => {
    /* snapshot() shifts index 0 at 60 and dropSnapshot popped the top: net 59,
       and the oldest entry gone for good. Measured at 160 before the fix. */
    await openTrait(page, { w: 160, h: 160, draw: flat });
    /* The fill runs through floodFill and a toast before it gives the entry
       back, so the state this asserts on does not exist yet when the
       pointerdown returns. Sleeping 300ms for it held alone and lost about one
       full-suite run in three. */
    const before = await page.evaluate(() => {
      for (let i = 0; i < 62; i++) snapshot();
      window.__oldest = undoStack[0];
      selectTool('fill'); setColor('#c87800');        // already that colour: a no-op
      const a = document.getElementById('art'), rr = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rr.left + rr.width / 2, clientY: rr.top + rr.height / 2,
        bubbles: true, cancelable: true, pointerId: 61, isPrimary: true, button: 0, buttons: 1 }));
      return undoStack.length;
    });
    /* The no-op fill takes an entry and gives it straight back, so the length
       returns to 60 rather than staying there - waiting for "still 60" would
       pass before anything happened. The toast is the observable end of it. */
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('toast').textContent), { timeout: 8000 })
      .toContain('Nothing to fill');
    const r = await page.evaluate(() => ({
      lenBefore: 60,
      lenAfter: undoStack.length,
      oldestStillThere: undoStack[0] === window.__oldest,
    }));
    expect(before, 'the stack was full before the fill').toBe(60);
    expect(r.lenBefore).toBe(60);
    expect(r.lenAfter, 'the stack is the length it was').toBe(60);
    expect(r.oldestStillThere, 'and the oldest step is still reachable').toBe(true);
  });
});
