import { test, expect } from '@playwright/test';

/* What folder import lets into the collection.

   Both of these are already in the live collection, which is why they are
   guarded now rather than in principle:

   - 3 palette swatch strips at 1024x128, filed as hair-headwear traits. They
     are the only non-square rows in 602.
   - 13 traits named after a UUID - 9 in backgrounds, 4 in unsorted.

   Deliberately NOT guarded: duplicates. The audit reported near-complete
   duplication in hair-headwear; the database says there are zero duplicate
   traits inside any collection once status and collection are grouped
   properly. The apparent copies are wip/approved pairs and cross-collection
   repeats. A guard here would imply a problem that does not exist. */

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
  });
  /* A clean store, so counts are about this import and nothing else. */
  await page.evaluate(async () => { try { await dbClear(); } catch (_) {} });
};

/* Real PNGs handed to bulkImport the way a folder drop would, with the
   relative path that carries the layer and status. */
const importFiles = (page, specs) => page.evaluate(async list => {
  const files = [];
  for (const s of list) {
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d');
    g.fillStyle = '#c87800'; g.fillRect(0, 0, s.w, s.h);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([blob], s.path.split('/').pop(), { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath', { value: s.path });
    files.push(f);
  }
  await bulkImport(files);
  const rows = (await dbAll()).filter(r => r.kind === 'trait');
  return {
    note: document.getElementById('bulknote').textContent,
    names: rows.map(r => r.name).sort(),
    layers: rows.map(r => r.layer).sort(),
    count: rows.length,
  };
}, specs);

test.describe('folder import keeps out what is not a trait', () => {
  test('a palette strip is skipped and said so', async ({ page }) => {
    await landing(page);
    const r = await importFiles(page, [
      { path: 'coll/hair-headwear/wip/SMB Bandana.png', w: 1024, h: 1024 },
      { path: 'coll/hair-headwear/wip/SMB Bandana-swatch.png', w: 1024, h: 128 },
    ]);
    expect(r.count, 'only the real trait was stored').toBe(1);
    expect(r.names).toEqual(['SMB Bandana']);
    expect(r.note, 'and the strip is named in the report, not hidden in the total')
      .toContain('1 palette strip skipped');
  });

  test('shape decides it, not the filename', async ({ page }) => {
    /* Two of the three real strips are only identifiable by their shape - a
       swatch does not have to be called one. */
    await landing(page);
    const r = await importFiles(page, [
      { path: 'coll/backgrounds/wip/perfectly-normal-name.png', w: 1024, h: 128 },
    ]);
    expect(r.count).toBe(0);
    expect(r.note).toContain('1 palette strip skipped');
  });

  test('but real trait art is untouched, at every size the collection holds',
    async ({ page }) => {
      /* The control. A filter that rejects too much is worse than the mess it
         cleans, and these are the exact sizes in the live collection. */
      await landing(page);
      const r = await importFiles(page, [
        { path: 'coll/eyes/wip/a.png', w: 160, h: 160 },
        { path: 'coll/eyes/wip/b.png', w: 83, h: 83 },
        { path: 'coll/skins/wip/c.png', w: 1254, h: 1254 },
        { path: 'coll/clothing/wip/d.png', w: 1024, h: 1024 },
        { path: 'coll/backgrounds/wip/wide-but-legitimate.png', w: 1600, h: 400 },
      ]);
      expect(r.count, 'all five stored, including the 4:1 one').toBe(5);
      expect(r.note, 'and nothing was reported as a strip').not.toContain('palette strip');
    });

  test('a UUID filename is given a real name', async ({ page }) => {
    await landing(page);
    const r = await importFiles(page, [
      { path: 'coll/backgrounds/wip/BC99A276-D224-4898-9922-5C8B1234ABCD.png', w: 512, h: 512 },
      { path: 'coll/backgrounds/wip/8856B038-B810-4318-A8A2-20CB99887766-trait.png', w: 512, h: 512 },
      { path: 'coll/unsorted/wip/46D586D1-E782-4497-8A01-853A11223344.png', w: 512, h: 512 },
    ]);
    expect(r.count).toBe(3);
    expect(r.names, 'numbered per layer, not one running sequence')
      .toEqual(['backgrounds-1', 'backgrounds-2', 'unsorted-1']);
    expect(r.note, 'and it says it did that').toContain('3 named for you');
  });

  test('and a real name is never rewritten - the control', async ({ page }) => {
    /* Without this, the test above passes just as well if EVERY import were
       renamed, which would be far worse than the UUIDs. These are real names
       from the live collection. */
    await landing(page);
    const r = await importFiles(page, [
      { path: 'coll/backgrounds/wip/ftx-arena-lot.png', w: 512, h: 512 },
      { path: 'coll/backgrounds/wip/jupiter-terminal.png', w: 512, h: 512 },
      { path: 'coll/hair-headwear/wip/WIF Hat Messy Hair.png', w: 512, h: 512 },
    ]);
    expect(r.names).toEqual(['WIF Hat Messy Hair', 'ftx-arena-lot', 'jupiter-terminal']);
    expect(r.note, 'nothing was renamed').not.toContain('named for you');
  });

  test('the same trait at two statuses is two records, not a duplicate',
    async ({ page }) => {
      /* The audit called this duplication. It is how the app versions a trait:
         wip and approved are different rows on purpose, and the database has
         no true duplicates inside a collection. This pins that it stays that
         way rather than being "cleaned up". */
      await landing(page);
      const r = await importFiles(page, [
        { path: 'coll/skins/wip/rainbow.png', w: 512, h: 512 },
        { path: 'coll/skins/approved/rainbow.png', w: 512, h: 512 },
      ]);
      expect(r.count, 'both kept').toBe(2);
      expect(r.names).toEqual(['rainbow', 'rainbow']);
      const statuses = await page.evaluate(async () =>
        (await dbAll()).filter(x => x.kind === 'trait').map(x => x.status).sort());
      expect(statuses, 'and they are distinguished by status').toEqual(['approved', 'wip']);
    });
});
