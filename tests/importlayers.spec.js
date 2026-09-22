/* "Import a folder of traits" could not read a layer it had not heard of.

   The button's title says it "Reads the layer and the wip / approved /
   rejected state out of the folder names". It read the STATE that way, from a
   fixed list of three. It did not read the LAYER that way: readPath matched a
   path segment against LAYERS, the list the project already has, so a folder
   named after a layer the project does not have matched nothing and every file
   in it fell through to unsorted.

   MEASURED on the collection this came up for, when the default list still
   lacked them: thirteen folders, and hats, hair and glasses were not in
   DEFAULT_LAYERS - they were one merged "hair-headwear" there. So 63 of 233
   files, every hat and hairstyle and pair of glasses, would import onto one
   layer. And unsorted is not neutral: it sits last in the draw order by
   convention, so those 63 would also paint on top of everything.

   SUPERSEDED IN PART BY patch516. hats, hair and glasses ARE default layers
   now - the default list is the collection's own thirteen - so they can no
   longer be the fixture for "a folder the project has no layer for". The
   adoption mechanism is still what makes the default list a starting point
   rather than a cage, and it is exercised here on three names that are
   genuinely not layers under the new list and are real folders in the library
   today: accessories, hair-headwear and back-extras. The thirteen-folder test
   at the end now asserts the OTHER thing: that on the real collection nothing
   needs adopting at all.

   It matters twice over here, because a rule names a trait as layer/name. A
   collection whose hats all landed in unsorted cannot have a rule about hats,
   and every rule in an imported file would name a trait that does not exist.
*/
import { test, expect } from '@playwright/test';

/* A real one-pixel PNG, because bulkImport decodes every file to read its
   size and a fake blob is skipped as unreadable. */
const files = (page, paths) => page.evaluate(async (list) => {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  c.getContext('2d').fillStyle = '#c83c3c';
  c.getContext('2d').fillRect(0, 0, 1, 1);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const out = [];
  for (const p of list) {
    const f = new File([blob], p.split('/').pop(), { type: 'image/png' });
    /* webkitRelativePath is read-only on a File, and it is what readPath
       reads - the same thing a directory picker supplies. */
    Object.defineProperty(f, 'webkitRelativePath', { value: p });
    out.push(f);
  }
  await bulkImport(out);
  const items = (await dbAll()).filter(i => i.kind === 'trait');
  return {
    layers: LAYERS.slice(),
    note: document.getElementById('bulknote').textContent,
    placed: items.map(t => (t.layer || 'unsorted') + '/' + t.name).sort(),
    refs: (await dbAll()).filter(i => i.kind === 'ref').map(i => i.name),
  };
}, paths);

const start = async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    await dbClear();
    LAYERS = DEFAULT_LAYERS.slice();
    await renderShelf();
  });
};

/* Three folder names that are not layers under the collection's list. WAS
   hats, hair and glasses, which are default layers since patch516 - a fixture
   the page already knows cannot show that adoption works. */
const NEW = ['accessories', 'hair-headwear', 'back-extras'];

test.describe('importing a folder whose layers are new', () => {
  test.beforeEach(start);

  test('the default layer list really is missing these three', async ({ page }) => {
    /* THE PRECONDITION, asserted rather than assumed. If accessories were
       already a default layer the tests below would pass without adoption. */
    const d = await page.evaluate(() => DEFAULT_LAYERS.slice());
    for (const l of NEW)
      expect(d, l + ' is not a default layer').not.toContain(l);
    expect(d, 'the collection uses hats, hair and glasses instead').toContain('hats');
    expect(d).toContain('hair');
    expect(d).toContain('glasses');
  });

  test('a folder named after a layer becomes that layer', async ({ page }) => {
    const r = await files(page, [
      'UPLOAD/accessories/Gold Chain.png',
      'UPLOAD/hair-headwear/Unc Hair.png',
      'UPLOAD/back-extras/Wings.png',
    ]);
    expect(r.placed, 'each on the layer its folder named').toEqual([
      'accessories/Gold Chain', 'back-extras/Wings', 'hair-headwear/Unc Hair',
    ]);
    for (const l of NEW)
      expect(r.layers, l + ' is a layer now').toContain(l);
  });

  test('and unsorted stays last, so nothing new paints on top of everything', async ({ page }) => {
    const r = await files(page, ['UPLOAD/accessories/Gold Chain.png']);
    /* ASSERTED FIRST, and a mutation run is why. Without this line the test
       passed when adoption was removed altogether: indexOf returns -1 for a
       layer that does not exist, and -1 is less than any real index, so
       "the new layer sits before unsorted" was true of a layer that was never
       created. An ordering assertion is satisfied by absence unless something
       proves the thing is there. */
    expect(r.layers, 'the layer was actually created').toContain('accessories');
    expect(r.layers[r.layers.length - 1], 'unsorted is still the catch-all at the end')
      .toBe('unsorted');
    expect(r.layers.indexOf('accessories'), 'and the new layer sits before it')
      .toBeLessThan(r.layers.indexOf('unsorted'));
  });

  test('creating a layer is reported, not slipped in', async ({ page }) => {
    /* Adding a layer changes the draw order of the whole collection. It
       arrives alphabetically, which has nothing to do with what should paint
       over what, so the report has to say so. */
    const r = await files(page, ['UPLOAD/accessories/Gold Chain.png', 'UPLOAD/hair-headwear/Unc Hair.png']);
    expect(r.note, 'it says it made them').toContain('new layers');
    expect(r.note, 'and which').toContain('accessories');
    expect(r.note, 'and to go and look').toContain('draw order');
  });

  test('a status folder never becomes a layer', async ({ page }) => {
    /* approved/wip/rejected already mean something else. Reading them as
       layers would put every approved trait on a layer called approved. */
    const r = await files(page, ['UPLOAD/hats/approved/BTC Cap.png']);
    expect(r.layers, 'no layer called approved').not.toContain('approved');
    expect(r.placed, 'and the hat is on hats, from the folder above it')
      .toEqual(['hats/BTC Cap']);
  });

  test('nor does a base folder, which means something else again', async ({ page }) => {
    const r = await files(page, ['UPLOAD/base/_reference.png']);
    expect(r.layers, 'no layer called base').not.toContain('base');
    expect(r.refs.length, 'it is kept as a base character').toBe(1);
    expect(r.placed, 'and is not a trait at all').toEqual([]);
  });

  test('a layer the project already has is used, not duplicated', async ({ page }) => {
    const r = await files(page, ['UPLOAD/masks/Jason Mask.png']);
    expect(r.placed).toEqual(['masks/Jason Mask']);
    expect(r.layers.filter(l => l === 'masks').length, 'masks appears once').toBe(1);
  });

  test('it says everything came in as wip, and how to change that', async ({ page }) => {
    /* THE WALL A PERSON HITS FIRST. readPath reads a status only from a WHOLE
       path segment - approved, wip or rejected - and the real upload folder is
       called "APPROVED TRAITS - WEBSITE UPLOAD", which correctly does not
       count: the whole-segment rule exists because "approved-drafts" contains
       the word and means the opposite. So every file imports as wip, and
       traitEligible refuses a wip trait unless "include wip" is ticked - an
       empty Sheet of 12, zero percentages, and a possible-character count of
       zero, from an import that said "Imported 233 files".

       The behaviour is right and stays. The silence was the defect. */
    const r = await files(page, ['UPLOAD/hats/BTC Cap.png', 'UPLOAD/hair/Unc Hair.png']);
    expect(r.note, 'it says how many').toContain('2 had no wip / approved / rejected folder');
    expect(r.note, 'and what they became').toContain('came in as wip');
    expect(r.note, 'and the first way out').toContain('approved');
    expect(r.note, 'and the second').toContain('include wip');
  });

  test('and says nothing about status when the path did carry one', async ({ page }) => {
    /* The control. A version that always printed the line would pass the test
       above while describing files whose status was read correctly from their
       folder - which is the ordinary case for anyone using the convention the
       button documents. */
    const r = await files(page, ['UPLOAD/hats/approved/BTC Cap.png']);
    expect(r.note, 'no complaint about a status that was there')
      .not.toContain('came in as wip');
    expect(r.placed, 'and it still imported').toEqual(['hats/BTC Cap']);
  });

  test('AND THE WHOLE THIRTEEN-FOLDER COLLECTION LANDS WITHOUT INVENTING A LAYER', async ({ page }) => {
    /* The real shape of the job, in miniature: one file per folder. Every one
       of these is a default layer now, so nothing falls through to unsorted
       AND nothing needs adopting - the second assertion is the one patch516
       added, and it goes red if any of the thirteen leaves the default list. */
    const folders = ['backgrounds', 'chains', 'clothing', 'costumes', 'ears', 'extras',
      'eyes', 'glasses', 'hair', 'hats', 'masks', 'mouth', 'skins'];
    const r = await files(page, folders.map(f => 'UPLOAD/' + f + '/thing.png'));
    const unsorted = r.placed.filter(p => p.indexOf('unsorted/') === 0);
    expect(unsorted, 'nothing fell through to unsorted').toEqual([]);
    for (const f of folders)
      expect(r.placed.some(p => p.indexOf(f + '/') === 0), f + ' got its own layer').toBe(true);
    expect(r.note, 'and invented nothing').not.toContain('new layer');
    expect(r.layers, 'the list is still the fourteen it started with').toHaveLength(14);
  });

  test('and a project carrying layers the collection does not use is told which ones it left empty', async ({ page }) => {
    /* The other half of a vocabulary change, at the door somebody actually
       uses. The real case is a project carrying accessories and hair-headwear
       from before patch516, importing the collection: those two then hold
       nothing and the note says so, with where to remove them. The fixture
       uses two names that are not defaults under EITHER vocabulary, so this
       test means the same thing on the commit before the list changed and
       the commit after. The default layers that are empty are NOT named - a
       fresh project's are empty by design. */
    await page.evaluate(async () => {
      LAYERS = ['backgrounds', 'visors', 'capes', 'unsorted'];
      await saveLayers();
      await renderShelf();
    });
    const r = await files(page, ['UPLOAD/hats/BTC Cap.png', 'UPLOAD/backgrounds/Sky.png']);
    expect(r.placed).toEqual(['backgrounds/Sky', 'hats/BTC Cap']);
    expect(r.note).toContain('2 layers now hold nothing (visors, capes) and can be removed in Layers');
  });

  test('and a fresh project is not nagged about its own empty defaults', async ({ page }) => {
    /* The control: eleven default layers hold nothing after this import, and
       none of them is named. */
    const r = await files(page, ['UPLOAD/hats/BTC Cap.png', 'UPLOAD/backgrounds/Sky.png']);
    expect(r.placed).toEqual(['backgrounds/Sky', 'hats/BTC Cap']);
    expect(r.note).not.toContain('hold nothing');
  });
});
