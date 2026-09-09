/* FROM FIX PIXELS INTO THE PROJECT, IN THE RIGHT TRAIT CATEGORY.

   "make it tie into the project in the way where it will actually save to
   project (dead save path)"

   The tab could open a result in the editor or hand back a PNG, and that was
   all: putting 320 fixed traits into the project meant opening each one,
   retyping its name and choosing its layer by hand. What these check is the
   whole way through - a folder goes in, the category is read off the folder,
   and a record comes out on the shelf under that layer with the trait's own
   name on it.

   THE ONE THAT MATTERS MOST is the path surviving the round trip. A File's
   webkitRelativePath is read only and a new File() has none, so if it is not
   put back deliberately every trait in the run lands in unsorted - which is
   last in the draw order, and looks like the save working. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function' && typeof bulkImport === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A folder of small pixel-art files, each in a category folder, handed over
   the way the folder picker hands them over. */
const folderRun = (page, paths) => page.evaluate(async (rels) => {
  const files = [];
  for (const rel of rels) {
    const S = 16, c = document.createElement('canvas');
    c.width = S * 3; c.height = S * 3;
    const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf';
      g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    const leaf = rel.split('/').pop();
    const f = new File([b], leaf, { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath', { value: rel });
    files.push(f);
  }
  await fixBatch(files);
  return { done: fixBatchFiles.length,
    zipNames: fixBatchFiles.map(f => f.name),
    rels: fixBatchFiles.map(f => f.rel) };
}, paths);

const shelf = (page) => page.evaluate(async () => {
  const items = await dbAll();
  return items.filter(r => r.kind === 'trait')
    .map(r => ({ name: r.name, layer: r.layer, w: r.w, h: r.h }))
    .sort((a, b) => (a.layer + a.name).localeCompare(b.layer + b.name));
});

test('the buttons are there and do not act on nothing', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => ({
    single: !!document.getElementById('fixsave'),
    batch: !!document.getElementById('fixbatchsave'),
    batchOff: document.getElementById('fixbatchsave').disabled,
    folder: !!document.getElementById('fixfolder'),
    asksFolder: document.getElementById('fixfolder').hasAttribute('webkitdirectory'),
    folderButton: !!document.getElementById('fixfolderbtn'),
  }));
  expect(r.single).toBe(true);
  expect(r.batch).toBe(true);
  /* Nothing has been fixed, so there is nothing to save. */
  expect(r.batchOff).toBe(true);
  expect(r.folder).toBe(true);
  expect(r.asksFolder).toBe(true);
  expect(r.folderButton).toBe(true);
});

test('a folder of traits lands in the project under its folder name', async ({ page }) => {
  await ready(page);
  /* THE PRECONDITION. An empty shelf, or a record found afterwards is a
     record that was already there. */
  await page.evaluate(async () => {
    for (const r of await dbAll()) { try { await dbDel(r.id); } catch (_) {} }
  });
  expect(await shelf(page)).toEqual([]);

  const run = await folderRun(page, [
    'TRAITS/hats/cap.png',
    'TRAITS/hats/beanie.png',
    'TRAITS/eyes/wide.png',
  ]);
  expect(run.done).toBe(3);

  const saved = await page.evaluate(async () => {
    await fixSaveBatch();
    return document.getElementById('fixbatchout').textContent;
  });
  const items = await shelf(page);
  expect(items.map(i => i.layer + '/' + i.name)).toEqual([
    'eyes/wide', 'hats/beanie', 'hats/cap',
  ]);
  /* AND AT THE COLLECTION SIZE, because that is what the switch wrote. */
  expect([...new Set(items.map(i => i.w + 'x' + i.h))]).toEqual(['1280x1280']);
  expect(saved).toContain('3');
});

test('the trait keeps its own name, not the download name', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    for (const r of await dbAll()) { try { await dbDel(r.id); } catch (_) {} }
  });
  const run = await folderRun(page, ['TRAITS/hats/cap.png']);
  /* Two names on purpose: the zip says what it is, the record does not. */
  expect(run.zipNames).toEqual(['TRAITS/hats/cap-fixed.png']);
  expect(run.rels).toEqual(['TRAITS/hats/cap.png']);
  await page.evaluate(() => fixSaveBatch());
  const items = await shelf(page);
  expect(items.map(i => i.name)).toEqual(['cap']);
  expect(items[0].name).not.toContain('fixed');
});

test('the zip mirrors the folders it was given', async ({ page }) => {
  await ready(page);
  const names = (await folderRun(page, [
    'TRAITS/hats/cap.png', 'TRAITS/eyes/wide.png',
  ])).zipNames;
  expect(names).toEqual(['TRAITS/hats/cap-fixed.png', 'TRAITS/eyes/wide-fixed.png']);
  /* A file with no folder is left alone - it never had a tree to mirror. */
  const flat = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf'; g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    await fixBatch([new File([b], 'loose.png', { type: 'image/png' })]);
    return fixBatchFiles.map(f => f.name);
  });
  expect(flat).toEqual(['loose-fixed.png']);
});

test('a file with no folder is said to be unsorted rather than filed wrongly', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    for (const r of await dbAll()) { try { await dbDel(r.id); } catch (_) {} }
  });
  const said = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf'; g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    await fixBatch([new File([b], 'loose.png', { type: 'image/png' })]);
    await fixSaveBatch();
    return document.getElementById('fixbatchout').textContent;
  });
  expect(said).toContain('unsorted');
  const items = await shelf(page);
  expect(items.map(i => i.layer)).toEqual(['unsorted']);
});

test('the single save goes the same way and carries its folder', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    for (const r of await dbAll()) { try { await dbDel(r.id); } catch (_) {} }
  });
  await page.evaluate(async () => {
    const S = 16, c = document.createElement('canvas');
    c.width = S * 3; c.height = S * 3;
    const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      g.fillStyle = ((x + y) % 2) ? '#2e222f' : '#8b5fbf'; g.fillRect(x * 3, y * 3, 3, 3);
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([b], 'cap.png', { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath', { value: 'TRAITS/hats/cap.png' });
    await fixLoad(f);
    await fixRun();
    await fixSaveOne();
  });
  const items = await shelf(page);
  expect(items.map(i => i.layer + '/' + i.name)).toEqual(['hats/cap']);
  expect(items[0].w + 'x' + items[0].h).toBe('1280x1280');
});

test('the save goes through the import rather than writing its own record', async ({ page }) => {
  await ready(page);
  /* ONE WRITER. bulkImport decides what a trait's layer is - adopting a
     folder the project has never seen, carrying a status folder, numbering
     unnamed files, spotting one that moved. A save that built its own record
     would be a second answer to all of that, and the two would drift. */
  const src = await page.evaluate(() => String(fixSaveFiles));
  expect(src).toContain('bulkImport(files)');
  expect(src).not.toMatch(/dbPut|readPath|shelfOrder/);
});
