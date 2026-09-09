/* Every trait in a collection has to sit on the collection's cell grid.

   SUPERSEDES THE OPENING LINE THIS FILE WAS WRITTEN WITH, which was "every
   trait has to share one canvas size". That was true when the canvas was the
   biggest trait in the draw and paintTrait could only grow by whole numbers.
   autoCanvas picks a canvas now and scales everything into it, so two sizes
   is two sizes. What cannot work is a trait whose size does not divide the
   canvas it is drawn onto by a whole number, because that is what smears it.

   AND THE FIXTURES MOVED FROM 40 TO 100, which is the second correction. 40
   IS on the grid of a 160-cell collection - it is a whole division of it, so
   it draws at exactly x32 onto a 1280 canvas and lands perfectly. Measured, by
   reading the scale drawImage is actually given. The rule is a whole MULTIPLE
   of the cell count or a whole DIVISION of it, which is also exactly the
   ladder snapToGrid offers, so the control and the warning agree. 100 is
   neither, and is what every case below now uses.

   They layer over each other and a mint lays them out on a grid, so a 100x100
   PNG in a folder of 160x160 ones is broken output rather than a preference.
   The app knew this in exactly ONE place - the character preview's note - and
   nowhere else: the shelf counted traits without mentioning their sizes, the
   twelve-character sheet computed the same max and said nothing, saveTrait
   recorded w and h verbatim with no check, and the zip download - the thing
   you hand to a mint - wrote every blob at whatever size it happened to be
   and reported "Downloaded 12 traits".

   None of that was reachable by accident until this week. The snap floor
   mapped every request from 1 to 239 onto 160, so a shrink was inexpressible
   in Canvas and Art mode and almost nobody could produce an off-size trait.
   Making shrinking work is what armed this, which is why the guard belongs
   with it.

   The case that matters most here is the LAST one: a collection where every
   trait agrees with every other and none of them agrees with the collection.
   A check written as "are these all the same size" calls that clean. It is
   the reason the census compares against the project grid rather than against
   the first record it sees.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openAllSections, setSelect, setField, resizeGo, openPanel } from './helpers.js';

const BLOCK = new Function('set', 'W', 'H',
  'for (let y = 20; y < 140; y++) for (let x = 20; x < 140; x++) set(x, y, [226, 146, 116]);');

const shelf = (page) => page.evaluate(() => ({
  text: ($('projcount') || {}).textContent || '',
  title: ($('projcount') || {}).title || '',
}));
const toastOf = (page) => page.evaluate(() => (($('toast') || {}).textContent) || '');

/* Opens fresh art, optionally shrinks it, and saves it under a name. Fresh art
   each time on purpose: saving under a new name with the same record open is a
   RENAME - the id is built from the name, so the old record is deleted - and a
   test that did that would be checking one trait twice. */
async function addTrait(page, name, size) {
  await openTrait(page, { w: 160, h: 160, draw: BLOCK });
  await openAllSections(page);
  if (size !== 160) {
    await page.evaluate(() => { const b = $('rssnap'); if (b.getAttribute('aria-pressed') === 'true') b.click(); });
    await setSelect(page, 'rsmode', 'art');
    await setField(page, 'rsw', size);
    await setField(page, 'rsh', size);
    await resizeGo(page);
    await page.waitForTimeout(300);
  }
  /* Naming and saving moved into the Save panel, so it is opened first -
     the same order a person works in, and the only order in which the
     button can be clicked at all. */
  await openPanel(page, 'sv');
  await page.evaluate((n) => { $('tname').value = n; }, name);
  await page.click('#saveproj');
  await page.waitForTimeout(500);
}

/* The download button lives in a panel these tests never open, so its handler
   is driven directly. Clicking it times out on an element that is not visible,
   which reads as a broken feature rather than a test reaching for the wrong
   thing - it already did once. */
async function downloadAll(page) {
  const dl = page.waitForEvent('download').catch(() => null);
  await page.evaluate(() => $('dlzip').onclick());
  await dl;
  await page.waitForTimeout(500);
}

test.use({ acceptDownloads: true });

test.describe('collection size consistency', () => {
  test('a consistent collection says nothing at all', async ({ page }) => {
    // This has to be silent or the warning is noise, and noise is how a real
    // warning gets ignored.
    await addTrait(page, 'body', 160);
    expect(await toastOf(page), 'a full-size save must not mention size').not.toMatch(/not the collection/i);
    const s = await shelf(page);
    expect(s.text, 'the count alone').toBe('1 trait');
    expect(s.title, 'and nothing on hover').toBe('');
    await downloadAll(page);
    /* Re-aimed at the sentence that exists. "mint needs one size" is not in
       the app any more, so a negative assertion against it could no longer
       fail - it would have passed over a download that warned about every
       trait in the project. The two tests below assert the same phrase
       positively, which is what makes this one mean something. */
    expect(await toastOf(page), 'nor should the download').not.toMatch(/cell grid/i);
  });

  test('a save at eight pixels per cell is silent', async ({ page }) => {
    /* THE CONTROL THAT WAS MISSING, and the reason this defect lived: every
       fixture in this file is at one pixel per cell, where a count of cells
       and a count of pixels are the same number. saveTrait asked
       art.width!==projectGrid, so on the real collection - 160 cells of 8
       pixels - every single save said it was off-grid. 1280 IS 160 cells. */
    await addTrait(page, 'body', 1280);
    expect(await toastOf(page), 'a trait on the grid must not be warned about')
      .not.toMatch(/cell grid/i);
  });

  test('an off-size trait is named when it is saved', async ({ page }) => {
    // At the moment it happens, while it is fresh and one undo away, rather
    // than only at the download when the reason has been forgotten.
    await addTrait(page, 'hat', 100);
    const said = await toastOf(page);
    expect(said, 'the save must say the size').toContain('100');
    expect(said, 'and what it should have been').toContain('160');
  });

  test('the shelf names which traits are the wrong size', async ({ page }) => {
    await addTrait(page, 'body', 160);
    await addTrait(page, 'hat', 100);
    const s = await shelf(page);
    expect(s.text, 'the count is still there').toContain('2 traits');
    expect(s.text, 'and the problem beside it').toContain('1 not');
    expect(s.title, 'the offender is named on hover').toContain('hat');
    expect(s.title, 'with its actual size').toContain('100');
  });

  test('the download names them, because it is the last moment before a mint', async ({ page }) => {
    await addTrait(page, 'body', 160);
    await addTrait(page, 'hat', 100);
    await downloadAll(page);
    const said = await toastOf(page);
    expect(said, 'it still reports the download').toContain('2 traits');
    expect(said, 'and names the odd one').toContain('hat');
    expect(said, 'and says why it matters').toMatch(/whole division of it/i);
  });

  test('a collection that agrees with itself but not with the grid is still wrong', async ({ page }) => {
    // The case a "are these all the same size" check calls clean, and the
    // reason the census compares against the project grid rather than against
    // the first record. Two traits, both 40x40, agreeing perfectly - and the
    // collection is 160.
    await addTrait(page, 'body', 100);
    await addTrait(page, 'hat', 100);
    const s = await shelf(page);
    expect(s.text, 'BOTH are wrong, not neither').toContain('2 not');
    expect(s.title, 'and both are named').toContain('body');
    expect(s.title).toContain('hat');
    await downloadAll(page);
    expect(await toastOf(page), 'and the download says so too')
      .toMatch(/whole division of it/i);
  });
});
