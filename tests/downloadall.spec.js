/* "Download all" left out the base character, and dropped the status folder
   off any file it had to rename.

   THE BASE CHARACTER IS NOT A TRAIT AND WAS NOT DOWNLOADED. It is drawn under
   every generated character and named in every metadata file as trait_type
   "base". Export project keeps kind "trait" OR "ref"; this handler filtered to
   traits alone, so a project downloaded as a folder and re-imported came back
   without its base, and every character changed.

   THE RENAME DROPPED THE STATUS FOLDER. Files are named layer/status/name.png,
   and when two traits sanitise to the same string the second was rebuilt as
   layer/name-2.png with no status segment. readPath reads status out of a
   WHOLE path segment, finds none, and bulkImport makes it wip - so the trait
   quietly changed status on a round trip.

   MEASURED. A base character called hero and two traits named "gold star" and
   "gold-star", both skins/approved:

     files in the zip   skins/approved/gold-star.png
                        skins/gold-star-2.png
     said               "Downloaded 2 traits"
     in the project     ref:hero, trait:gold star, trait:gold-star

   THE ROUND TRIP IS THE ASSERTION, not the file list. A zip whose names look
   right and that readPath classifies wrongly would be no better than before,
   so every path this writes is fed back through readPath - the function
   bulkImport actually uses - rather than being eyeballed.
*/
import { test, expect } from '@playwright/test';

/* Seeds a project and presses the real button with the zip writer stubbed, so
   nothing is written to disk and the file list can be read. */
const download = (page, opts) => page.evaluate(async (o) => {
  const { withBase, clashing } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  const png = () => new Blob([new Uint8Array(16)]);
  await dbPut({ id: 't_gold star_skins_approved', kind: 'trait', name: 'gold star',
    layer: 'skins', status: 'approved', blob: png(), w: 160, h: 160, rarity: 1, at: 1 });
  /* The same name in a DIFFERENT status: a different trait in a different
     folder, and renaming it would be wrong. */
  await dbPut({ id: 't_gold star_skins_wip', kind: 'trait', name: 'gold star',
    layer: 'skins', status: 'wip', blob: png(), w: 160, h: 160, rarity: 1, at: 1 });
  if (clashing) {
    /* Sanitises to the same string as "gold star" in the same folder. */
    await dbPut({ id: 't_gold-star_skins_approved', kind: 'trait', name: 'gold-star',
      layer: 'skins', status: 'approved', blob: png(), w: 160, h: 160, rarity: 1, at: 1 });
  }
  if (withBase) {
    await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero', blob: png(),
      w: 160, h: 160, at: 1 });
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 350));

  const realZip = zip, realCreate = URL.createObjectURL;
  const realClick = HTMLAnchorElement.prototype.click;
  const realToast = window.toast;
  const said = [];
  let captured = null;
  zip = (files) => { captured = files.map(f => f.name); return new Blob([]); };
  URL.createObjectURL = () => 'blob:stub';
  HTMLAnchorElement.prototype.click = function () {};   // no real download
  window.toast = (m) => { said.push(m); };
  try {
    await document.getElementById('dlzip').onclick();
    await new Promise(r => setTimeout(r, 300));
  } finally {
    zip = realZip; URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick; window.toast = realToast;
  }
  if (!captured) throw new Error('the zip writer was never called, so there is nothing to read');
  /* Every path fed back through the function bulkImport uses. */
  return {
    files: captured.slice().sort(),
    said: said.join(' | '),
    readBack: captured.map(p => { const i = readPath(p); return p + ' -> ' +
      (i.isRef ? 'base' : (i.layer || 'no layer') + '/' + (i.status || 'no status')); }).sort(),
    disabled: document.getElementById('dlzip').disabled,
  };
}, opts);

test.describe('what Download all downloads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof readPath === 'function');
  });

  test('the base character goes too, in a folder that reads back as one', async ({ page }) => {
    const r = await download(page, { withBase: true });
    expect(r.files, 'it is in the zip').toContain('base/hero.png');
    expect(r.readBack, 'and bulkImport would read it as a base, not a trait')
      .toContain('base/hero.png -> base');
  });

  test('and the traits are all still there', async ({ page }) => {
    // The counterweight. "Includes the base" would be satisfied by a download
    // that had lost everything else.
    const r = await download(page, { withBase: true });
    expect(r.files).toEqual([
      'base/hero.png', 'skins/approved/gold-star.png', 'skins/wip/gold-star.png']);
  });

  test('a renamed file keeps the folder it belongs in', async ({ page }) => {
    const r = await download(page, { withBase: true, clashing: true });
    expect(r.files, 'beside its twin, not one level up')
      .toContain('skins/approved/gold-star-2.png');
    expect(r.files.join(' '), 'and not in the layer folder')
      .not.toContain('skins/gold-star-2.png');
  });

  test('so it comes back with the status it left with', async ({ page }) => {
    /* The reason the folder matters. readPath reads status out of a whole
       segment; without one bulkImport calls it wip, so the trait changed
       status by being downloaded and re-imported. */
    const r = await download(page, { withBase: true, clashing: true });
    expect(r.readBack).toContain('skins/approved/gold-star-2.png -> skins/approved');
  });

  test('the same name in another status is not a clash', async ({ page }) => {
    /* A CONTROL. They are different traits in different folders; renaming one
       would be a second defect wearing the first one's fix. */
    const r = await download(page, { withBase: true });
    expect(r.files).toContain('skins/approved/gold-star.png');
    expect(r.files).toContain('skins/wip/gold-star.png');
  });

  test('the message names the base separately from the traits', async ({ page }) => {
    const r = await download(page, { withBase: true });
    expect(r.said).toContain('2 traits');
    expect(r.said).toContain('1 base character');
  });

  test('and says nothing about one when there is none', async ({ page }) => {
    // A CONTROL. A message that always mentioned a base would be wrong on
    // every project that has not got one.
    const r = await download(page, { withBase: false });
    expect(r.said).toContain('2 traits');
    expect(r.said, 'no base is mentioned').not.toContain('base character');
    expect(r.files.join(' '), 'and none is in the zip').not.toContain('base/');
  });
});
