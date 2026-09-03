import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* An undo entry is a full copy of the canvas: width * height * 4 bytes. At the
   collection's 1280 that is 6.25MB each and 375MB for a full stack of 60. How
   entries are STORED is a separate question; these tests are about not taking
   ones that describe nothing. */

const flat = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 0]);
};

const depth = page => page.evaluate(() => ({
  entries: undoStack.length,
  bytes: undoStack.reduce((n, e) => n + e.data.length, 0),
}));

const key = (page, repeat) => page.evaluate(r =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: r, bubbles: true })), repeat);

test.describe('the undo history', () => {
  test('a held arrow key is one edit, not one per repeat', async ({ page }) => {
    /* nudge() snapshotted on every call and the binding fires once per keydown,
       auto-repeats included. Measured before the fix: twelve repeats on a 1280
       canvas made twelve entries and 75MB, and undoing the run took twelve
       presses. */
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await page.evaluate(() => selectTool('move'));
    await key(page, false);
    for (let i = 0; i < 11; i++) await key(page, true);
    const d = await depth(page);
    expect(d.entries, 'one press plus eleven repeats is one edit').toBe(1);
  });

  test('but separate taps stay separately undoable - the control', async ({ page }) => {
    /* Coalescing a held key must not coalesce deliberate presses. Without this,
       "one entry" passes just as well if nudge stopped recording entirely. */
    await openTrait(page, { w: 240, h: 240, draw: flat });
    await page.evaluate(() => selectTool('move'));
    for (let i = 0; i < 12; i++) await key(page, false);
    expect((await depth(page)).entries, 'twelve deliberate taps are twelve edits').toBe(12);
  });

  test('a fill that fills nothing costs no history', async ({ page }) => {
    /* beginStroke used to snapshot before it knew which tool it was dispatching
       to, so a fill on the colour already there recorded 6.25MB of "nothing
       happened" while the toast said the opposite. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    const before = await depth(page);
    await page.evaluate(() => {
      selectTool('fill');
      setColor('#c87800');                     // exactly what is already there
      const a = document.getElementById('art'), r = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        bubbles: true, cancelable: true, pointerId: 11, isPrimary: true, button: 0, buttons: 1 }));
    });
    await page.waitForTimeout(300);
    expect(await depth(page), 'nothing changed, so nothing is recorded').toEqual(before);
  });

  test('a fill that DOES something is recorded and undoes - the control', async ({ page }) => {
    /* The test above passes equally well if fill stopped recording at all,
       which would be far worse than the bug it guards. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    const green = () => page.evaluate(() => {
      const q = ctx.getImageData(0, 0, art.width, art.height).data;
      let n = 0;
      for (let i = 0; i < q.length; i += 4) if (q[i + 1] > 200 && q[i] < 60) n++;
      return n;
    });
    expect(await green()).toBe(0);

    await page.evaluate(() => {
      selectTool('fill');
      setColor('#00ff88');
      const a = document.getElementById('art'), r = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, button: 0, buttons: 1 }));
    });
    await page.waitForTimeout(400);
    expect((await depth(page)).entries, 'a real fill is one edit').toBe(1);
    expect(await green(), 'and it actually filled').toBeGreaterThan(0);

    await page.click('#undo');
    await page.waitForTimeout(400);
    expect(await green(), 'and undo puts it back').toBe(0);
    expect((await depth(page)).entries).toBe(0);
  });

  test('an operation that changes nothing does not throw away a redo', async ({ page }) => {
    /* snapshot() clears the redo stack on the way in, so an operation that
       turned out to be a no-op was destroying a redo as well as wasting an
       entry. Draw, undo, then do nothing - redo must survive. */
    await openTrait(page, { w: 200, h: 200, draw: flat });
    await page.evaluate(() => {
      selectTool('fill'); setColor('#00ff88');
      const a = document.getElementById('art'), r = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        bubbles: true, cancelable: true, pointerId: 3, isPrimary: true, button: 0, buttons: 1 }));
    });
    await page.waitForTimeout(400);
    await page.click('#undo');
    await page.waitForTimeout(300);
    const redoBefore = await page.evaluate(() => redoStack.length);
    expect(redoBefore, 'there is something to redo').toBe(1);

    await page.evaluate(() => {
      setColor('#c87800');                     // the colour already there again
      const a = document.getElementById('art'), r = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + 20, clientY: r.top + 20,
        bubbles: true, cancelable: true, pointerId: 4, isPrimary: true, button: 0, buttons: 1 }));
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => redoStack.length),
      'a fill that did nothing must not destroy the redo').toBe(redoBefore);
  });
});
