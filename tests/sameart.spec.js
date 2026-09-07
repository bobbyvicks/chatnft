/* Importing the same picture under a new name.

   "i have new trait rules i want added but itll duplicate rules ... same goes
   for images. so we dont have 40 versions of the same skin saved."

   MEASURED BEFORE ANYTHING WAS BUILT, and two thirds of the worry was already
   handled - which is worth a file of its own, because the fix for a problem
   you do not have is a new problem:

     the v6 rules file imported twice   156 rules, then 0 added
     the same folder imported twice     replaced, not added
     a trait whose status moved         moved, not copied
     THE SAME PICTURE, NEW NAME         added as a third trait

   Only the last is real, and it is the skin case exactly: a file that comes
   back as "... v2.png" is a new name for artwork already here, and the id
   carries the name, so both stay for ever.

   AND IT IS REPORTED, NOT MERGED. The first version deleted the old record on
   a byte match and destroyed a trait on its first run - re-importing an
   UNCHANGED folder went from two traits to one, because two files in it were
   byte-identical and the first deleted the second before the loop reached it.
   Measured over the real collection there is nothing to merge anyway: 272
   approved files and 419 in the working folder, zero byte-identical pairs. So
   these tests pin BOTH halves - that the duplicate is noticed, and that
   nothing is removed for it. */
import { test, expect } from '@playwright/test';

/* Two genuinely different pictures, DRAWN rather than pasted in as base64.
   The first attempt hard-coded two strings and the second was not a valid PNG:
   createImageBitmap threw, bulkImport counted it as failed, and the control
   test reported one trait where it wanted two - which reads exactly like the
   defect it was written to rule out. A fixture that cannot be decoded is not a
   fixture. */
const RED = '#c02020', BLUE = '#2040c0';

const run = (page, files) => page.evaluate(async (specs) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  const made = [];
  for (const sp of specs) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d'); g.fillStyle = sp.b64; g.fillRect(0, 0, 8, 8);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([blob], sp.path.split('/').pop(), { type: 'image/png' });
    try { Object.defineProperty(f, 'webkitRelativePath', { value: sp.path }); } catch (_) {}
    made.push(f);
  }
  await bulkImport(made);
  const rows = (await dbAll()).filter(i => i.kind === 'trait');
  return { count: rows.length, ids: rows.map(r => r.id).sort(),
    note: document.getElementById('bulknote').textContent };
}, files);

const fresh = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  await renderShelf();
});

test.describe('the same picture arriving twice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof bulkImport === 'function');
    await fresh(page);
  });

  test('is noticed, and named', async ({ page }) => {
    /* THE ASK. cap and cap v2 are the same bytes, so one of them is a version
       of the other - and the report names the pair rather than counting it,
       because a pair can be judged at a glance and a count cannot. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/cap v2.png', b64: RED }]);
    expect(r.note, 'the report says the picture is here twice')
      .toContain('the same picture twice');
    expect(r.note, 'and names both of them').toContain('cap');
  });

  test('and nothing is deleted for it', async ({ page }) => {
    /* THE HALF THAT MATTERS MORE. The first version of this merged them, and
       merging is how an import loses artwork. Both are still here; which to
       keep is a decision for the person who knows which they meant. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/cap v2.png', b64: RED }]);
    expect(r.count, 'both are still in the project').toBe(2);
    expect(r.ids).toEqual(['t_cap v2_hats_approved', 't_cap_hats_approved']);
  });

  test('two different pictures are not called the same', async ({ page }) => {
    /* THE CONTROL. Without it "always report a duplicate" passes the test
       above, and every import would claim every trait was a copy. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/visor.png', b64: BLUE }]);
    expect(r.note, 'nothing is claimed').not.toContain('the same picture twice');
    expect(r.count).toBe(2);
  });

  test('and the same picture on a different layer is left alone',
    async ({ page }) => {
      /* One drawing legitimately serves two layers - a chain used as both a
         chain and an extra - so a byte match across layers means nothing, and
         saying it does would train people to ignore the message. */
      await run(page, [{ path: 'chains/approved/cross.png', b64: RED }]);
      const r = await run(page, [{ path: 'extras/approved/cross.png', b64: RED }]);
      expect(r.note, 'across layers it is not a duplicate')
        .not.toContain('the same picture twice');
      expect(r.count, 'and both are kept').toBe(2);
    });

  test('re-importing an unchanged folder still replaces rather than deleting',
    async ({ page }) => {
      /* THE REGRESSION THIS FILE EXISTS FOR. The merging version took a folder
         of two byte-identical files from two traits to ONE, because the first
         deleted the second before the loop reached it. Two identical pictures
         under different names in ONE batch is exactly that shape. */
      const both = [{ path: 'hats/approved/cap.png', b64: RED },
        { path: 'hats/approved/visor.png', b64: RED }];
      const first = await run(page, both);
      expect(first.count, 'two traits in').toBe(2);
      const again = await run(page, both);
      expect(again.count, 'and two still there after importing it again').toBe(2);
    });
});
