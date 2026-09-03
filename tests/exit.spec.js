import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* Getting out of the editor.

   Reported by the owner and by an outside audit: you get stuck. Measured
   before the fix - closeEditor was reachable from exactly two places. One was
   #closeed, at the bottom of the collapsible "Save and export" section. The
   other was a Backspace binding that the keydown dispatcher skips whenever
   focus is in an INPUT, which is the brush slider and every number field in
   the panel.

   EVERY KEY PRESS IN THIS FILE IS REAL - page.keyboard.press, driven through
   the browser, landing on whatever actually has focus. An earlier version of
   these tests used dispatchEvent, and that is why a broken feature looked
   fixed: a synthetic event runs the handler but never triggers a default
   action, and dispatching it on document.body ignores focus entirely. It
   proved the handler existed. It could not prove the key worked. */

const flat = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [200, 120, 0]);
};

const editorOpen = page => page.evaluate(() => !document.getElementById('app').hidden);
const focused = page => page.evaluate(() =>
  document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'none');

test.describe('there is always a way out of the editor', () => {
  test('the close button is visible the moment the editor opens', async ({ page }) => {
    /* Visible WITHOUT unfolding anything or scrolling the panel. The old exit
       failed exactly this: it existed, in a collapsed section, below the fold. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    const x = page.locator('#editorclose');
    await expect(x).toBeVisible();
    await expect(x).toBeInViewport();
    expect(await x.getAttribute('aria-label'), 'and it says what it is').toBe('Close the editor');
  });

  test('clicking it closes the editor', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: flat });
    expect(await editorOpen(page)).toBe(true);
    await page.locator('#editorclose').click();
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('Escape closes it', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.keyboard.press('Escape');
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('Escape works from the brush slider, where Backspace does not', async ({ page }) => {
    /* THE case. This is what the owner hit: click any control, press the key
       to leave, nothing happens. Both halves are asserted here, because the
       point is not that Escape works - it is that Escape works WHERE
       Backspace cannot, and Backspace cannot for a good reason. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.locator('#bslider').click();
    expect(await focused(page), 'focus really is in the slider').toBe('bslider');

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);
    expect(await editorOpen(page), 'Backspace is owned by the slider, so it does nothing').toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('and from a number field, in two presses - out of the field, then out', async ({ page }) => {
    /* The first version of this test expected ONE Escape and failed, which is
       how the half-fix was caught: the dispatcher returns for any input that
       is not a range BEFORE consulting a single shortcut, so Escape was landing
       in the same hole as Backspace one line further down.

       Two presses is the right answer, not a concession. Escape in a field
       means "leave this field" - the trait-name input already reverts and
       blurs on it - and closing the editor from under someone mid-edit in a
       text box would be its own bug. What matters is that no focus state
       leaves you stuck, and none does. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.evaluate(() =>
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded')));
    await page.locator('#rsw').click();
    expect(await focused(page)).toBe('rsw');

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);
    expect(await editorOpen(page), 'Backspace edits the number, it does not leave').toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => focused(page), { timeout: 5000 }).not.toBe('rsw');
    expect(await editorOpen(page), 'the first Escape leaves the FIELD, not the editor').toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('Escape in a text field does not tear the editor down mid-edit', async ({ page }) => {
    /* The control for the test above. If Escape closed the editor from inside
       a field, someone renaming a trait would lose the editor on the keystroke
       they use to cancel the rename. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.evaluate(() =>
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded')));
    await page.locator('#tname').click();
    await page.keyboard.type('half-typed');
    expect(await focused(page)).toBe('tname');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await editorOpen(page), 'still open').toBe(true);
    expect(await focused(page), 'and the field has simply been left').not.toBe('tname');
  });

  test('but Escape closes an open panel first, not the editor underneath it', async ({ page }) => {
    /* Precedence. Closing the editor out from under the shortcuts panel would
       leave that panel floating over the landing page. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.locator('#keysbtn').click();
    await expect.poll(() => page.evaluate(() =>
      !document.getElementById('ksscrim').hidden), { timeout: 5000 }).toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('ksscrim').hidden), { timeout: 5000 }).toBe(true);
    expect(await editorOpen(page), 'the editor is still there').toBe(true);

    /* And a second Escape, with nothing layered, does leave. */
    await page.keyboard.press('Escape');
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('and Escape does nothing while the sign-in gate is up', async ({ page }) => {
    /* Reachable: a session that lapses raises the gate over an open editor.
       Escape must not quietly close the editor behind it, or dismissing the
       gate later would drop you on the shelf with your work apparently gone.

       Added because the mutation run caught nothing when the overlay guard was
       broken - the only precedence test was the shortcuts panel, so three of
       the four guarded overlays were unasserted. Two of those three, #scrim
       and #pxscrim, cannot be open with the editor open at all: startEditor
       closes #scrim on its first line and both belong to the landing flow. So
       those two guards are defensive and stay deliberately untested rather
       than tested by contrivance. This one is real. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.evaluate(() => gateShow(true));
    expect(await page.evaluate(() =>
      !document.getElementById('signin').hidden), 'the gate is up').toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await editorOpen(page), 'the editor is untouched behind the gate').toBe(true);
  });

  test('Backspace still works when focus is not in a control - the control', async ({ page }) => {
    /* Without this, the two tests above pass just as well if Backspace had
       been removed entirely, which would be a regression rather than a fix. */
    await openTrait(page, { w: 80, h: 80, draw: flat });
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Backspace');
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);
  });

  test('closing offers back the work you were just doing', async ({ page }) => {
    /* Closing never destroyed anything - autosave had the canvas - but the
       restore bar was only built at page load, so afterwards you saw a shelf
       and no sign of your work. That is what LOOKS like loss.

       The filename is asserted, not just the bar's presence: the previous
       session's autosave is usually sitting there too, so "a bar appeared"
       would pass without the flush having worked at all. */
    await openTrait(page, { w: 80, h: 80, draw: flat, name: 'just-this-one.png' });
    await page.evaluate(() => {
      selectTool('pencil'); setColor('#00ff88'); snapshot(); dab(10, 10, [0, 255, 136], 255);
    });
    await page.waitForTimeout(200);

    await page.locator('#editorclose').click();
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);

    await expect.poll(() => page.evaluate(() =>
      document.getElementById('restore').hidden), { timeout: 8000 }).toBe(false);
    expect(await page.textContent('#restoretext'),
      'and it offers THIS work, not the last session\'s').toContain('just-this-one.png');
  });

  test('the flush beats the debounce', async ({ page }) => {
    /* autosave waits 1500ms. Closing inside that window used to leave the last
       stroke in a timeout that never fired - the one case where work really
       was lost. Closing immediately after a stroke must still store it. */
    await openTrait(page, { w: 80, h: 80, draw: flat, name: 'fast-close.png' });
    await page.evaluate(() => {
      selectTool('pencil'); setColor('#00ff88'); snapshot(); dab(20, 20, [0, 255, 136], 255);
      document.getElementById('editorclose').click();     // no pause at all
    });
    await expect.poll(() => editorOpen(page), { timeout: 5000 }).toBe(false);

    const rec = await page.evaluate(async () => {
      const all = await dbAll();
      const a = all.find(i => i.kind === 'autosave');
      return a ? { name: a.name, w: a.w, h: a.h } : null;
    });
    expect(rec, 'the stroke was stored despite closing inside the debounce window')
      .toEqual({ name: 'fast-close.png', w: 80, h: 80 });
  });
});
