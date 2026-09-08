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

   IT WAS REPORTED, NOT MERGED, AND NOW IT IS MERGED. That earlier decision is
   kept here rather than deleted, because the reason behind it has not stopped
   being true: the first merging version destroyed a trait on its first run -
   re-importing an UNCHANGED folder went from two traits to one, because two
   files in it were byte-identical and each deleted the other's record before
   the loop reached it, leaving whichever wrote last.

   "yes merge them when its the same picture" - so the hazard had to be
   designed out rather than argued away, and what changed is WHERE the merge
   runs. It is now a pass AFTER the write loop, beside the move-check and the
   absent-check, and it can only delete a record THIS IMPORT DID NOT SUPPLY.
   Inside the loop the batch's own future writes are unknowable; afterwards
   they are a list. An unchanged folder supplies every record it would match,
   so the merge has nothing to look at - which is the exact case that broke
   last time, and is the last test in this file.

   ONE HALF OF THE OLD DECISION STANDS. Two files inside a SINGLE folder
   carrying the same picture are still only reported. Both were supplied, the
   folder is the source of truth, and which of the two names the artist meant
   is not something an import can know. */
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

  test('the old name is merged away, and the new one kept', async ({ page }) => {
    /* THE ASK. cap and cap v2 are the same bytes, so one is a version of the
       other, and the folder is the newer statement about what this trait is
       called. The old record goes; the name the file arrived under stays. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/cap v2.png', b64: RED }]);
    expect(r.count, 'one trait, not two versions of one picture').toBe(1);
    expect(r.ids, 'under the name the file brought').toEqual(['t_cap v2_hats_approved']);
  });

  test('and it says so, naming both', async ({ page }) => {
    /* A DELETION IS NOT ALLOWED TO BE SILENT. The pair is named rather than
       counted: "cap into cap v2" can be recognised as right or wrong at a
       glance, and "1 merged" cannot. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/cap v2.png', b64: RED }]);
    expect(r.note, 'said out loud').toContain('merged');
    expect(r.note, 'the name that went').toContain('cap into');
    expect(r.note, 'and the one it went into').toContain('cap v2');
  });

  test('and it is not reported as missing on top of that', async ({ page }) => {
    /* The absent-check names traits the folder did not bring, and a merged
       record is one of those by construction - it was in the project and this
       import did not supply it. Reporting the same deletion twice, once as a
       merge and once as a file gone astray, reads as two problems. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/cap v2.png', b64: RED }]);
    expect(r.note).not.toContain('not in this folder');
  });

  test('but importing part of a folder does not merge away the rest',
    async ({ page }) => {
      /* THE SHARP EDGE, and it was in the first version. A merge that follows
         any picture this import supplied will delete a trait that merely
         happens to match one - so importing two of a folder's three skins took
         the third with it. tests/import.spec.js caught it, because its fixture
         fills every file with one colour and so makes all three identical.

         A rename is a NEW NAME carrying old artwork. Importing files that were
         already here renames nothing, so nothing is merged and the missing one
         is reported by the absent-check instead. */
      await run(page, [{ path: 'hats/approved/cap.png', b64: RED },
        { path: 'hats/approved/visor.png', b64: RED },
        { path: 'hats/approved/beanie.png', b64: RED }]);
      const r = await run(page, [{ path: 'hats/approved/cap.png', b64: RED },
        { path: 'hats/approved/visor.png', b64: RED }]);
      expect(r.count, 'the one left out of this import is still here').toBe(3);
      expect(r.note, 'and nothing was merged').not.toContain('merged');
      expect(r.note, 'it is reported as absent, which is a different thing')
        .toContain('beanie');
    });

  test('two different pictures are not called the same', async ({ page }) => {
    /* THE CONTROL, and it now guards a deletion rather than a sentence.
       Without it, "always merge" passes the test above and every import
       swallows a trait. */
    await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
    const r = await run(page, [{ path: 'hats/approved/visor.png', b64: BLUE }]);
    expect(r.count, 'both kept').toBe(2);
    expect(r.note, 'nothing is claimed').not.toContain('merged');
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

  test('a picture that arrived DURING this import is compared by its new bytes',
    async ({ page }) => {
      /* A CACHE BUG THAT WAS ALREADY THERE, and only this shape reaches it.
         recSig caches a record's signature by id, and a replacement keeps its
         id while its bytes change - so the first thing to ask for that
         record's signature afterwards got the picture it used to hold.

         Here cap is replaced with BLUE and visor arrives as BLUE in the same
         batch. Without the cache being updated at the write, visor is compared
         against cap's OLD red bytes, finds no match, and the duplicate goes
         unmentioned. */
      await run(page, [{ path: 'hats/approved/cap.png', b64: RED }]);
      const r = await run(page, [
        { path: 'hats/approved/cap.png', b64: BLUE },
        { path: 'hats/approved/visor.png', b64: BLUE },
      ]);
      expect(r.note, 'the pair inside this folder is noticed')
        .toContain('the same picture twice');
      expect(r.count, 'and both are kept, as a within-folder pair always is').toBe(2);
    });

  test('and in a group the merged record is dropped from the server too',
    async ({ page }) => {
      /* Otherwise the next pull brings the old name straight back and the
         merge reads as a bug rather than a deletion. */
      /* THE GROUP IS JOINED FIRST. wsDbName() returns a different IndexedDB
         per project, so importing cap on the personal page and then switching
         to a team would merge inside an empty store - the test would fail with
         the code perfectly correct. run() sets activeWs = null, so both imports
         happen here instead. */
      const dropped = await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        try { gateShow(false); } catch (_) {}
        activeWs = 'team1';
        await dbClear();
        window.__dropped = [];
        cloudDropOne = async (rec) => { window.__dropped.push(rec.name); };
        cloudSyncOne = async () => null;
        const png = async () => {
          const c = document.createElement('canvas'); c.width = 8; c.height = 8;
          const g = c.getContext('2d'); g.fillStyle = '#c02020'; g.fillRect(0, 0, 8, 8);
          return new Promise(r => c.toBlob(r, 'image/png'));
        };
        const file = async (path) => {
          const f = new File([await png()], path.split('/').pop(), { type: 'image/png' });
          Object.defineProperty(f, 'webkitRelativePath', { value: path });
          return f;
        };
        await bulkImport([await file('hats/approved/cap.png')]);
        window.__dropped = [];
        await bulkImport([await file('hats/approved/cap v2.png')]);
        return { dropped: window.__dropped,
          left: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name) };
      });
      expect(dropped.dropped, 'the old name was taken off the server').toEqual(['cap']);
      expect(dropped.left, 'and off this device').toEqual(['cap v2']);
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
