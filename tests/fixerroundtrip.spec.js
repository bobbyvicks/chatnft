/* A TRAIT SENT TO THE FIXER COMES BACK AS WHAT IT WAS.

   "the path seems broken when i try to save"

   The file the fixer is handed carries the trait's category in its path,
   because the Save to project goes in through bulkImport and bulkImport
   reads a trait's layer and status out of the path it arrived on. The layer
   was in that path. The status was not, so an approved trait came back wip.

   And a trait's id is t_<name>_<layer>_<status>, so that was not a
   replacement - it was a new record, and then bulkImport's move check saw
   the same name on the same layer under a status this import did not supply,
   decided the file had moved on disk, and deleted the approved one. The
   rarity weight went with it, because everything the project decided about a
   trait is carried across a replacement BY ID.

   Measured before the fix, one approved Hoodie with a rarity of 7:
     before  t_Hoodie_clothing_approved | approved | rarity=7
     after   t_Hoodie_clothing_wip      | wip      | rarity=undefined

   shelftofixer.spec.js pinned the path this is about and did not catch it:
   it asserted the file carries "clothing/Hoodie.png" and stopped there,
   never saving one back. A path is only right if what comes out the far end
   is right, so these go all the way round.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixFromRecords === 'function');
};

/* MESSY ON PURPOSE. The fixer has to CHANGE this picture, or the save takes
   bulkImport's unchanged-bytes path and skips the write - and a test that
   cannot tell a replacement from a skip is not testing the replacement. */
const seed = (page, traits) => page.evaluate(async (traits) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  for (const t of traits) {
    const S = 320, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    /* Blocks of 5 with a stray pixel in each, which is the thing the fixer
       is for and the thing that makes the saved bytes differ. */
    for (let y = 0; y < S; y += 5) for (let x = 0; x < S; x += 5) {
      g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][((x + y) / 5) % 4];
      g.fillRect(x, y, 5, 5);
      g.fillStyle = '#ff0044';
      g.fillRect(x + 2, y + 2, 1, 1);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    await dbPut({ id: 't_' + t.name + '_' + t.layer + '_' + t.status, kind: 'trait',
      name: t.name, layer: t.layer, status: t.status, blob, w: S, h: S,
      rarity: t.rarity, at: Date.now() });
  }
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['clothing', 'glasses', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 400));
}, traits);

/* One trait, all the way round: shelf -> fixer -> run -> Save to project. */
const roundTrip = (page) => page.evaluate(async () => {
  const items = (await dbAll()).filter(r => r.kind === 'trait');
  const wasBytes = items[0].blob.size;
  await fixFromRecords(items);
  const rel = FIX.rel;
  await fixRun();
  const real = window.toast; window.toast = () => {};
  try { await fixSaveOne(); } finally { window.toast = real; }
  await new Promise(r => setTimeout(r, 500));
  const after = (await dbAll()).filter(r => r.kind === 'trait');
  return { rel, wasBytes,
    rows: after.map(r => ({ id: r.id, status: r.status, rarity: r.rarity,
      bytes: r.blob ? r.blob.size : 0 })) };
});

test('AN APPROVED TRAIT COMES BACK APPROVED, ON ITS OWN RECORD', async ({ page }) => {
  await ready(page);
  await seed(page, [{ name: 'Hoodie', layer: 'clothing', status: 'approved', rarity: 7 }]);
  const r = await roundTrip(page);
  /* The path is what carries it, and it carries all three parts now. */
  expect(r.rel).toBe('clothing/approved/Hoodie.png');
  /* ONE record, not the new one beside the old one - and not the new one
     with the old one deleted either, which is what was happening. */
  expect(r.rows.length, 'one trait went out and one came back').toBe(1);
  expect(r.rows[0].id).toBe('t_Hoodie_clothing_approved');
  expect(r.rows[0].status, 'still approved').toBe('approved');
  /* THE HALF THAT IS NOT THE STATUS. Rarity, shelf order and the server row
     are carried across a replacement by id, so a new id loses the weight
     somebody set in the rarity plan. */
  expect(r.rows[0].rarity, 'and still weighted 7').toBe(7);
  /* AND THE FIXED PICTURE IS WHAT IS STORED. Without this the test passes on
     a save that did nothing at all - bulkImport skips a file whose bytes
     match what is already there. */
  expect(r.rows[0].bytes, 'the fixed artwork replaced the old').not.toBe(r.wasBytes);
});

test('and so does an stfp one', async ({ page }) => {
  await ready(page);
  await seed(page, [{ name: 'Crown', layer: 'clothing', status: 'stfp', rarity: 3 }]);
  const r = await roundTrip(page);
  expect(r.rel).toBe('clothing/stfp/Crown.png');
  expect(r.rows.length).toBe(1);
  expect(r.rows[0].id).toBe('t_Crown_clothing_stfp');
  /* The worst version of this one: a trait in the final set silently stopped
     being in the collection at all. */
  expect(r.rows[0].status, 'the final set is still the final set').toBe('stfp');
  expect(r.rows[0].rarity).toBe(3);
  expect(r.rows[0].bytes).not.toBe(r.wasBytes);
});

test('EACH OF A PICKED BATCH CARRIES ITS OWN', async ({ page }) => {
  await ready(page);
  await seed(page, [
    { name: 'Hoodie', layer: 'clothing', status: 'approved', rarity: 7 },
    { name: 'Shades', layer: 'glasses', status: 'stfp', rarity: 2 },
  ]);
  const r = await page.evaluate(async () => {
    const items = await dbAll();
    for (const i of items) if (i.kind === 'trait') shelfPick.add(shelfCore.recordKey(i));
    shelfPickPaint();
    const real = window.toast; window.toast = () => {};
    try {
      document.getElementById('shelfpickfix').click();
      await new Promise(r2 => setTimeout(r2, 2500));
    } finally { window.toast = real; }
    return { rels: fixBatchFiles.map(f => f.rel || f.name).sort() };
  });
  /* Two traits, two layers, two statuses - and nothing shared between them. */
  expect(r.rels).toEqual(['clothing/approved/Hoodie.png', 'glasses/stfp/Shades.png']);
});

test('and a status nothing recognises means wip, not a new folder', async ({ page }) => {
  await ready(page);
  await seed(page, [{ name: 'Odd', layer: 'clothing', status: 'sideways', rarity: 1 }]);
  const r = await page.evaluate(async () => {
    const items = (await dbAll()).filter(r => r.kind === 'trait');
    await fixFromRecords(items);
    return { rel: FIX.rel, read: readPath(FIX.rel) };
  });
  /* THE CONTROL for passing the record's status straight through. readPath
     matches whole segments against STATUSES, so an unrecognised one is not a
     status to it - it is the FOLDER, and the trait would be filed under a
     category nobody made. */
  expect(r.rel, 'wip, the same thing no status folder has always meant')
    .toBe('clothing/wip/Odd.png');
  expect(r.read.status).toBe('wip');
  expect(r.read.folder, 'the folder is still the layer').toBe('clothing');
  expect(r.read.layer).toBe('clothing');
});
