/* RE-IMPORTING THE FOLDER YOU ALREADY IMPORTED.

   The question that produced this file: "if I import a whole folder with 90%
   of stuff already on it, will it import duplicates, or just the new traits?"

   Duplicates: no, and never did. The id is name + layer + status, so a file
   that resolves to a trait already here REPLACES it. That part was right.

   What it did instead was quieter and worse. The replacement record is built
   fresh from the file, and a file knows only what a file knows - its pixels,
   its name and the folders above it. Everything the PROJECT had decided about
   that trait was on the old record and simply not copied over:

     rarity      the weight set in Plan rarity. Absent from the new record, and
                 cloudSyncOne uploads `typeof rec.rarity==="number" ? ... : 1`,
                 so re-importing pushed weight 1 over every plan on the server.
     shelfOrder  where it sits on the shelf. nextShelfOrder returns
                 min - ORDER_STEP, i.e. the FRONT of the layer, so every
                 re-imported file jumped to the front - a hand-ordered layer
                 came back reversed.
     rowId       which server row it is. Without it cloudSyncOne falls back to
                 matching on name/layer/status, deletes and re-inserts.

   And every file was re-uploaded whether or not it had changed: the PNG to
   storage, then a DELETE and a POST of the row. On the real collection that is
   274 uploads to change five files, and because the row is re-inserted, all
   274 land in "What changed" as edited by you - burying the actual edit under
   269 lines of noise.

   THE FIX IS TO DO NOTHING when nothing changed. The bytes are already hashed
   here for the duplicate-name check, so an unchanged file is recognisable for
   free: leave the record exactly as it stands, upload nothing, and count it.
   A changed file still replaces, but carries the project's decisions forward.

   FIXTURES CARRY REAL PIXELS. tests/import.spec.js fills every canvas with one
   flat colour, which makes every same-sized file byte-identical to every
   other - fine for what that file asks, and fatal here, where the whole
   subject is whether two files are the same. Each fixture below is seeded from
   its own name.
*/
import { test, expect } from '@playwright/test';

const landing = async page => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null;
  });
  await page.evaluate(async () => { try { await dbClear(); } catch (_) {} });
};

/* Files whose pixels depend on the seed, so "the same file" and "a different
   file" are actually different things. */
const importFiles = (page, specs) => page.evaluate(async list => {
  const files = [];
  for (const s of list) {
    const c = document.createElement('canvas');
    c.width = s.w || 8; c.height = s.h || 8;
    const g = c.getContext('2d');
    /* Seeded from the string, so a changed seed is a changed picture and an
       unchanged one is byte-identical. */
    let n = 0;
    for (const ch of String(s.seed === undefined ? s.path : s.seed)) n = (n * 31 + ch.charCodeAt(0)) & 0xffff;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        n = (n * 1103515245 + 12345) & 0x7fffffff;
        g.fillStyle = 'rgb(' + (n & 255) + ',' + ((n >> 8) & 255) + ',' + ((n >> 16) & 255) + ')';
        g.fillRect(x, y, 1, 1);
      }
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([blob], s.path.split('/').pop(), { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath', { value: s.path });
    files.push(f);
  }
  await bulkImport(files);
  return document.getElementById('bulknote').textContent;
}, specs);

/* THE WHOLE BLOB. The first version of this sliced the first 24 bytes, which
   for two 8x8 PNGs is the signature and the IHDR - identical whatever the
   picture is. It reported "unchanged" for a file that had certainly changed,
   and a check that cannot return the other answer is not a check. */
const pictureOf = (page, name) => page.evaluate(async (n) => {
  const r = (await dbAll()).find(x => x.kind === 'trait' && x.name === n);
  if (!r || !r.blob) return null;
  const h = await crypto.subtle.digest('SHA-256', await r.blob.arrayBuffer());
  return [...new Uint8Array(h)].map(v => v.toString(16).padStart(2, '0')).join('');
}, name);

const traits = (page) => page.evaluate(async () => {
  const rows = (await dbAll()).filter(r => r.kind === 'trait');
  rows.sort((a, b) => a.id < b.id ? -1 : 1);
  return rows.map(r => ({
    id: r.id, name: r.name, layer: r.layer, status: r.status,
    rarity: r.rarity, shelfOrder: r.shelfOrder, rowId: r.rowId, synced: r.synced,
  }));
});

/* The folder, as it stands after the first import. Three traits on one layer,
   each with its own picture. */
const FOLDER = [
  { path: 'col/eyes/approved/Blue Eyes.png' },
  { path: 'col/eyes/approved/Punk Eyes.png' },
  { path: 'col/eyes/approved/Sleepy Eyes.png' },
];

test.describe('re-importing a folder you already imported', () => {
  test.beforeEach(async ({ page }) => { await landing(page); });

  test('brings in the new one and does not duplicate the old ones',
    async ({ page }) => {
      /* The question as it was asked. Three in, one added, four out - not
         seven, and not three with the new one missed. */
      await importFiles(page, FOLDER);
      expect((await traits(page)).length, 'the first import').toBe(3);
      const note = await importFiles(page, FOLDER.concat(
        [{ path: 'col/eyes/approved/Laser Eyes.png' }]));
      const rows = await traits(page);
      expect(rows.length, 'one more, not four more').toBe(4);
      expect(rows.map(r => r.name).sort())
        .toEqual(['Blue Eyes', 'Laser Eyes', 'Punk Eyes', 'Sleepy Eyes']);
      expect(note, 'and it says which were actually new').toContain('1 new');
      /* AND IT DOES NOT REPORT THE UNTOUCHED ONES AS GONE. A file left alone
         is still a file the folder supplied; the absent-check reads that list
         to work out what has been deleted on disk, so a skip that forgot to
         record itself would announce every unchanged trait as missing from the
         folder that had just handed it over. */
      expect(note, 'nothing went missing').not.toContain('not in this folder');
    });

  test('and it still notices a file the folder really has stopped carrying',
    async ({ page }) => {
      /* THE POSITIVE CONTROL for the line above. "not in this folder" is
         absent from a report that never mentions it - including one produced
         by a build where the check has been removed entirely - so the negative
         assertion means nothing on its own. This differs by one file. */
      await importFiles(page, FOLDER);
      const note = await importFiles(page, [
        { path: 'col/eyes/approved/Blue Eyes.png' },
        { path: 'col/eyes/approved/Punk Eyes.png' },
      ]);
      expect(note, 'the one left out on disk is named').toContain('not in this folder');
      expect(note).toContain('Sleepy Eyes');
    });

  test('AND IT KEEPS THE RARITY YOU PLANNED', async ({ page }) => {
    /* The expensive one. Plan rarity is per trait and lives only on the
       record; the file knows nothing about it. Re-importing built the record
       fresh, so every weight went back to nothing - and cloudSyncOne uploads
       1 for a record with no rarity, so the plan went on the server too. */
    await importFiles(page, FOLDER);
    await page.evaluate(async () => {
      for (const r of (await dbAll()).filter(x => x.kind === 'trait'))
        await dbPut(Object.assign({}, r, { rarity: 40 }));
    });
    await importFiles(page, FOLDER);
    const rows = await traits(page);
    expect(rows.length).toBe(3);
    expect(rows.map(r => r.rarity), 'every weight survived the re-import')
      .toEqual([40, 40, 40]);
  });

  test('and it keeps the order they were put in', async ({ page }) => {
    /* nextShelfOrder returns min - ORDER_STEP: the FRONT of the layer. So a
       re-import walked the folder in order and put each file in front of the
       last, handing back a hand-ordered layer in reverse. */
    await importFiles(page, FOLDER);
    const before = (await traits(page)).map(r => [r.id, r.shelfOrder]);
    await importFiles(page, FOLDER);
    const after = (await traits(page)).map(r => [r.id, r.shelfOrder]);
    expect(after, 'nobody moved').toEqual(before);
  });

  test('and a file that really did change still replaces the trait',
    async ({ page }) => {
      /* THE CONTROL. Everything above is about leaving things alone, and a
         version of this that left EVERYTHING alone would pass all of it while
         making the feature useless - editing a PNG on disk and re-importing is
         the whole reason the folder gets imported twice. */
      await importFiles(page, FOLDER);
      const punkBefore = await pictureOf(page, 'Punk Eyes');
      const blueBefore = await pictureOf(page, 'Blue Eyes');
      /* Same path, different pixels: the artist edited the file. */
      const note = await importFiles(page, [
        { path: 'col/eyes/approved/Blue Eyes.png' },
        { path: 'col/eyes/approved/Punk Eyes.png', seed: 'edited on disk' },
        { path: 'col/eyes/approved/Sleepy Eyes.png' },
      ]);
      expect(await pictureOf(page, 'Punk Eyes'),
        'the edited picture actually landed').not.toBe(punkBefore);
      expect(await pictureOf(page, 'Blue Eyes'),
        'and the two beside it did not change').toBe(blueBefore);
      expect((await traits(page)).length, 'still three traits').toBe(3);
      expect(note, 'and the one that changed is reported as an update')
        .toMatch(/1 updated|all updates/);
    });

  test('and the edited one keeps its place on the shelf', async ({ page }) => {
    /* WRITTEN BECAUSE THE MUTANT SURVIVED. "it keeps the order they were put
       in" re-imports identical files, which now take the skip - so it passes
       whether or not the replacement carries shelfOrder across, and the carry
       had no cover at all. This is the only test that reaches it: one file,
       changed, so the write path runs. */
    await importFiles(page, FOLDER);
    const was = (await traits(page)).find(r => r.name === 'Punk Eyes').shelfOrder;
    await importFiles(page, [
      { path: 'col/eyes/approved/Punk Eyes.png', seed: 'edited on disk' }]);
    const now = (await traits(page)).find(r => r.name === 'Punk Eyes').shelfOrder;
    expect(now, 'a new picture is not a new position').toBe(was);
  });

  test('and the edited one keeps its rarity too', async ({ page }) => {
    /* A replacement is still the same trait. The weight was a decision about
       the trait, not about the pixels that were in it at the time. */
    await importFiles(page, FOLDER);
    await page.evaluate(async () => {
      const r = (await dbAll()).find(x => x.name === 'Punk Eyes');
      await dbPut(Object.assign({}, r, { rarity: 250 }));
    });
    await importFiles(page, [
      { path: 'col/eyes/approved/Punk Eyes.png', seed: 'edited on disk' }]);
    const r = await page.evaluate(async () =>
      (await dbAll()).find(x => x.name === 'Punk Eyes').rarity);
    expect(r).toBe(250);
  });

  test('the report says how many it left alone', async ({ page }) => {
    /* "Imported 274 files" over an import that changed nothing reads exactly
       like the first import did, and the person cannot tell whether their edit
       landed. The count that answers the question is how many were untouched. */
    await importFiles(page, FOLDER);
    const note = await importFiles(page, FOLDER.concat(
      [{ path: 'col/eyes/approved/Laser Eyes.png' }]));
    expect(note).toContain('3 already here');
    expect(note).toContain('1 new');
  });

  /* FILES NAMED AFTER A UUID, which the real collection has thirteen of - nine
     backgrounds and four unsorted. They are auto-named "backgrounds-1",
     "backgrounds-2" and so on, and the number used to come from a counter that
     restarted every import and consulted nothing that already existed. The name
     is the id, so the number was the trait's identity, and it moved whenever
     the folder did. */
  const uuid = n => 'aaaaaaaa-bbbb-cccc-dddd-' + String(n).padStart(12, '0');
  const UUIDS = [
    { path: 'col/backgrounds/approved/' + uuid(1) + '.png', seed: 'one' },
    { path: 'col/backgrounds/approved/' + uuid(2) + '.png', seed: 'two' },
    { path: 'col/backgrounds/approved/' + uuid(3) + '.png', seed: 'three' },
  ];

  test('AN AUTO-NAMED FILE LANDS ON ITS OWN RECORD WHEN THE FOLDER GROWS',
    async ({ page }) => {
      /* THE CORRUPTION. Add one file that sorts first and every later name
         shifts down one: backgrounds-2 gets overwritten with what was
         backgrounds-1's picture, and so on, with a stale record left at the
         end. Nothing said so - the report read "named for you" both times. */
      await importFiles(page, UUIDS);
      const first = await traits(page);
      expect(first.map(r => r.name).sort())
        .toEqual(['backgrounds-1', 'backgrounds-2', 'backgrounds-3']);
      const pics = {};
      for (const r of first) pics[r.name] = await pictureOf(page, r.name);

      /* The same three files, plus a new one read before them. */
      await importFiles(page, [
        { path: 'col/backgrounds/approved/' + uuid(0) + '.png', seed: 'brand new' },
      ].concat(UUIDS));

      for (const name of ['backgrounds-1', 'backgrounds-2', 'backgrounds-3'])
        expect(await pictureOf(page, name),
          name + ' still holds its own picture').toBe(pics[name]);
      const now = await traits(page);
      expect(now.length, 'and the new one was added, not swapped in').toBe(4);
    });

  test('and a genuinely new one takes a number nothing else holds',
    async ({ page }) => {
      /* The control. Reusing an existing name for everything would pass the
         test above and quietly merge every new background into one trait. */
      await importFiles(page, UUIDS);
      await importFiles(page, [
        { path: 'col/backgrounds/approved/' + uuid(9) + '.png', seed: 'brand new' }]);
      const names = (await traits(page)).map(r => r.name).sort();
      expect(names, 'four traits, four names')
        .toEqual(['backgrounds-1', 'backgrounds-2', 'backgrounds-3', 'backgrounds-4']);
    });

  test('two copies of one picture in a single folder are reported',
    async ({ page }) => {
      /* The same-picture check compared against a snapshot taken before the
         import, and filter() returns a new array - so nothing this run wrote
         was ever a candidate, and two copies inside one folder were both
         written with no warning at all. That warning is the only thing between
         a renamed file and a silently duplicated trait, because the check
         deliberately reports rather than deletes. */
      const note = await importFiles(page, [
        { path: 'col/eyes/approved/Punk Eyes.png', seed: 'same picture' },
        { path: 'col/eyes/approved/Punk Eyes v2.png', seed: 'same picture' },
      ]);
      expect(note, 'said out loud').toContain('the same picture twice');
      expect(note).toContain('Punk Eyes');
      expect((await traits(page)).length, 'and both are kept, as it says').toBe(2);
    });

  test('and two different pictures are not', async ({ page }) => {
    // The positive control's opposite: differing by one field, the seed.
    const note = await importFiles(page, [
      { path: 'col/eyes/approved/Punk Eyes.png', seed: 'one picture' },
      { path: 'col/eyes/approved/Punk Eyes v2.png', seed: 'another picture' },
    ]);
    expect(note).not.toContain('the same picture twice');
  });

  test('and in a group, an unchanged file is not uploaded again',
    async ({ page }) => {
      /* THE ONE THE GROUP FEELS. Every file was re-uploaded whether or not it
         had changed - the PNG to storage, then a DELETE and a POST of the row.
         274 uploads to change five files, and because each row is re-inserted
         they all land in What changed as edited by you, burying the real edit
         under 269 lines of noise. */
      /* THE GROUP IS JOINED FIRST, not halfway through. wsDbName() returns
         'chatnft.ws.<team>' when activeWs is set and the personal store
         otherwise, so each project has its own IndexedDB. Switching between
         the two imports - which is what the first version of this test did -
         re-imported into an empty store, every file read as new, and the test
         failed while the code was right. */
      await page.evaluate(async () => { activeWs = 'team1'; await dbClear(); });
      await importFiles(page, FOLDER);
      await page.evaluate(async () => {
        /* Marked the way a successful push marks them, then count what a
           second import asks of the server. */
        for (const r of (await dbAll()).filter(x => x.kind === 'trait'))
          await dbPut(Object.assign({}, r, { synced: true, rowId: 'row-' + r.name }));
        window.__uploads = 0;
        cloudSyncOne = async () => { window.__uploads++; return null; };
      });
      await importFiles(page, FOLDER.concat(
        [{ path: 'col/eyes/approved/Laser Eyes.png' }]));
      const n = await page.evaluate(() => window.__uploads);
      expect(n, 'only the new one went up').toBe(1);
    });

  test('and an unchanged file keeps the server row it was already on',
    async ({ page }) => {
      // Losing rowId makes the next push delete and re-insert rather than
      // replace, which is what puts an untouched trait in What changed.
      await importFiles(page, FOLDER);
      await page.evaluate(async () => {
        for (const r of (await dbAll()).filter(x => x.kind === 'trait'))
          await dbPut(Object.assign({}, r, { synced: true, rowId: 'row-' + r.name }));
      });
      await importFiles(page, FOLDER);
      const rows = await traits(page);
      expect(rows.map(r => r.rowId), 'still pointing at their own rows')
        .toEqual(['row-Blue Eyes', 'row-Punk Eyes', 'row-Sleepy Eyes']);
      expect(rows.every(r => r.synced === true),
        'and still counted as on the server').toBe(true);
    });

  test('but an edited file is marked as needing to go up again',
    async ({ page }) => {
      /* The control for the two above. A replacement that kept synced:true
         would leave a changed picture sitting on this device claiming to be
         on the server, which is the one outcome worse than re-uploading
         everything. */
      await importFiles(page, FOLDER);
      await page.evaluate(async () => {
        for (const r of (await dbAll()).filter(x => x.kind === 'trait'))
          await dbPut(Object.assign({}, r, { synced: true, rowId: 'row-' + r.name }));
      });
      await importFiles(page, [
        { path: 'col/eyes/approved/Punk Eyes.png', seed: 'edited on disk' }]);
      const punk = (await traits(page)).find(r => r.name === 'Punk Eyes');
      expect(punk.synced, 'not claiming to be up to date').toBeFalsy();
      expect(punk.rowId, 'but still aimed at the row it replaces')
        .toBe('row-Punk Eyes');
    });
});
