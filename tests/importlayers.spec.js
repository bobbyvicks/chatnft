/* "Import a folder of traits" could not read a layer it had not heard of.

   The button's title says it "Reads the layer and the wip / approved /
   rejected state out of the folder names". It read the STATE that way, from a
   fixed list of three. It did not read the LAYER that way: readPath matched a
   path segment against LAYERS, the list the project already has, so a folder
   named after a layer the project does not have matched nothing and every file
   in it fell through to unsorted.

   MEASURED on the collection this came up for: thirteen folders, and hats,
   hair and glasses are not in DEFAULT_LAYERS - they are one merged
   "hair-headwear" there. So 63 of 233 files, every hat and hairstyle and pair
   of glasses, would import onto one layer. And unsorted is not neutral: it
   sits last in the draw order by convention, so those 63 would also paint on
   top of everything.

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

test.describe('importing a folder whose layers are new', () => {
  test.beforeEach(start);

  test('the default layer list really is missing these three', async ({ page }) => {
    /* THE PRECONDITION, asserted rather than assumed. If hats were already a
       default layer the tests below would pass without the fix. */
    const d = await page.evaluate(() => DEFAULT_LAYERS.slice());
    for (const l of ['hats', 'hair', 'glasses'])
      expect(d, l + ' is not a default layer').not.toContain(l);
    expect(d, 'they are one merged layer instead').toContain('hair-headwear');
  });

  test('a folder named after a layer becomes that layer', async ({ page }) => {
    const r = await files(page, [
      'UPLOAD/hats/BTC Cap.png',
      'UPLOAD/hair/Unc Hair.png',
      'UPLOAD/glasses/Pit Vipers.png',
    ]);
    expect(r.placed, 'each on the layer its folder named').toEqual([
      'glasses/Pit Vipers', 'hair/Unc Hair', 'hats/BTC Cap',
    ]);
    for (const l of ['hats', 'hair', 'glasses'])
      expect(r.layers, l + ' is a layer now').toContain(l);
  });

  test('and unsorted stays last, so nothing new paints on top of everything', async ({ page }) => {
    const r = await files(page, ['UPLOAD/hats/BTC Cap.png']);
    expect(r.layers[r.layers.length - 1], 'unsorted is still the catch-all at the end')
      .toBe('unsorted');
    expect(r.layers.indexOf('hats'), 'and the new layer sits before it')
      .toBeLessThan(r.layers.indexOf('unsorted'));
  });

  test('creating a layer is reported, not slipped in', async ({ page }) => {
    /* Adding a layer changes the draw order of the whole collection. It
       arrives alphabetically, which has nothing to do with what should paint
       over what, so the report has to say so. */
    const r = await files(page, ['UPLOAD/hats/BTC Cap.png', 'UPLOAD/hair/Unc Hair.png']);
    expect(r.note, 'it says it made them').toContain('new layers');
    expect(r.note, 'and which').toContain('hats');
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

  test('and the whole thirteen-folder collection lands where it should', async ({ page }) => {
    /* The real shape of the job, in miniature: one file per folder. */
    const folders = ['backgrounds', 'chains', 'clothing', 'costumes', 'ears', 'extras',
      'eyes', 'glasses', 'hair', 'hats', 'masks', 'mouth', 'skins'];
    const r = await files(page, folders.map(f => 'UPLOAD/' + f + '/thing.png'));
    const unsorted = r.placed.filter(p => p.indexOf('unsorted/') === 0);
    expect(unsorted, 'nothing fell through to unsorted').toEqual([]);
    for (const f of folders)
      expect(r.placed.some(p => p.indexOf(f + '/') === 0), f + ' got its own layer').toBe(true);
  });
});
