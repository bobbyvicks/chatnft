/* A PROJECT OF ANY SIZE EXPORTS, AND COMES BACK.

   Export project was one JSON string, and a string cannot pass 2^29-24
   characters: past about 384 MiB of pictures it threw and the press did
   nothing. Import read with file.text(), which is empty past the same size.
   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red - see the
   commit body. The second runs the piecewise reader a file past 400 MB
   takes, at 6 MB, by lowering its threshold; the page before the fix has
   no threshold and reads the small file whole, so it passes there too.
   The last two are controls: the file is byte for byte what one whole
   string would have been, and a small project goes out and back
   unchanged. */
import { test, expect } from '@playwright/test';

/* n pictures of `mib` MiB of noise, and a way to catch the download. */
const seed = (page, n, mib, odd) => page.evaluate(async ([n, mib, odd]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(mib * 1048576);
    for (let o = 0; o < bytes.length; o += 65536) crypto.getRandomValues(bytes.subarray(o, Math.min(bytes.length, o + 65536)));
    /* odd: the first name carries a quote, braces and a backslash, which a
       reader that scans for braces has to step over inside the string. */
    const name = (odd && i === 0) ? 'n"}{' + String.fromCharCode(92) + '0' : 'n' + i;
    await dbPut({ id: 't_n' + i + '_hats_approved', kind: 'trait', name, layer: 'hats', status: 'approved',
      blob: new Blob([bytes], { type: 'image/png' }), w: 16, h: 16, rarity: 1 + (i % 3), at: 1000 + i, shelfOrder: i });
  }
  window.__got = null;
  const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
  const blobs = new Map();
  URL.createObjectURL = (b) => { const u = 'blob:probe' + blobs.size; blobs.set(u, b); return u; };
  HTMLAnchorElement.prototype.click = function () { window.__got = blobs.get(this.href) || null; };
  window.__restore = () => { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; };
}, [n, mib, !!odd]);

const exportNow = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
  let threw = null;
  try { await exportProject(); } catch (e) { threw = String(e && e.message || e); }
  finally { window.toast = t; }
  return { size: window.__got ? window.__got.size : 0, said: said.join(' | '), threw };
});

/* The exported file, imported into an emptied project. */
const importBack = (page) => page.evaluate(async () => {
  const f = new File([window.__got], 'buildanft-project.json', { type: 'application/json' });
  window.__got = null;
  await dbClear();
  const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
  try { await importProject(f); } finally { window.toast = t; }
  const all = (await dbAll()).filter(i => i.kind === 'trait');
  return { said: said.join(' | '), n: all.length, sizes: all.map(i => i.blob.size) };
});

test.describe('a project of any size', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportProject === 'function');
  });

  test('24 PICTURES OF 16 MiB export as a file, say so, and import back whole', async ({ page }) => {
    test.setTimeout(300000);
    await seed(page, 24, 16);
    const r = await exportNow(page);
    console.log('24 x 16 MiB: ' + JSON.stringify(r));
    expect(r.size, 'a file was written, larger than one string can hold').toBeGreaterThan(512 * 1048576);
    expect(r.said).toContain('Exported 24 items');
    const back = await importBack(page);
    console.log('and back: ' + JSON.stringify({ said: back.said, n: back.n }));
    expect(back.said).not.toContain('not a project file');
    expect(back.n).toBe(24);
    expect(back.sizes.every(s => s === 16 * 1048576)).toBe(true);
  });

  test('the piecewise read, at a size small enough to run anywhere, brings every item back', async ({ page }) => {
    test.setTimeout(240000);
    /* Read the streaming way at a small size, which is the same code a
       file past 400 MB takes, without holding a gigabyte to prove it. */
    await seed(page, 6, 1, true);
    await exportNow(page);
    await page.evaluate(() => { try { PROJECT_TEXT_MAX = 1024; } catch (_) {} });
    const r = await importBack(page);
    const names = await page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort());
    expect(names, 'a name with a quote, braces and a backslash comes back as it was')
      .toContain('n"}{' + String.fromCharCode(92) + '0');
    console.log('streamed import: ' + JSON.stringify({ said: r.said, n: r.n }));
    expect(r.said).not.toContain('not a project file');
    expect(r.n).toBe(6);
    expect(r.sizes.every(s => s === 1048576)).toBe(true);
  });

  test('the control: the file is byte for byte one whole-project string', async ({ page }) => {
    await seed(page, 3, 1);
    const r = await page.evaluate(async () => {
      const order = (await dbAll()).filter(i => i.kind === 'trait' || i.kind === 'ref').map(i => i.name);
      await exportProject();
      const text = await window.__got.text();
      const doc = JSON.parse(text);
      return { same: JSON.stringify(doc) === text, keys: Object.keys(doc).join(','),
        order: doc.items.map(i => i.name).join(',') === order.join(',') };
    });
    expect(r.same).toBe(true);
    expect(r.order, 'the items in the order the project holds them').toBe(true);
    expect(r.keys.split(',').pop(), 'items last').toBe('items');
  });

  test('the control: a small project goes out and back unchanged', async ({ page }) => {
    await seed(page, 3, 1);
    await exportNow(page);
    const r = await importBack(page);
    expect(r.n).toBe(3);
    expect(r.sizes).toEqual([1048576, 1048576, 1048576]);
  });
});
