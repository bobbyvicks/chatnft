/* GENERATE SET WRITES IN PARTS, AND NEVER WRITES A CORRUPT ZIP.

   Generate set held every character's picture until the end and zipped the
   lot in one pass: 1000 characters held about 650 MB, 3000 grew the browser
   by 2.2 GB, and the input allows 10,000. zip() wrote offsets with
   setUint32, which wraps past 4 GiB. RUN AGAINST THE PAGE BEFORE THE FIX:
   the first test went red with one download where the budget called for
   parts, and the third timed out - zip() began checksumming an archive it
   could not write instead of refusing it. The second is the control that a
   set within one part downloads exactly as it did. */
import { test, expect } from '@playwright/test';

const READER = `async (blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer), out = [];
  let i = 0;
  while (i < buf.length - 4 && dv.getUint32(i, true) === 0x04034b50) {
    const n = dv.getUint16(i + 26, true), sz = dv.getUint32(i + 18, true);
    out.push(new TextDecoder().decode(buf.subarray(i + 30, i + 30 + n)));
    i += 30 + n + sz;
  }
  return out;
}`;

/* A final project of three backgrounds and three hats: nine characters. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['backgrounds', 'hats', 'unsorted'];
  const png = async (v, box) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + (255 - v) + ',90)';
    if (box) g.fillRect(4, 0, 8, 6); else g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png')); };
  for (let i = 0; i < 3; i++) {
    await dbPut({ id: 't_bg' + i + '_backgrounds_stfp', kind: 'trait', name: 'bg' + i, layer: 'backgrounds', status: 'stfp',
      blob: await png(40 * i, false), w: 16, h: 16, rarity: 1, at: 1 });
    await dbPut({ id: 't_hat' + i + '_hats_stfp', kind: 'trait', name: 'hat' + i, layer: 'hats', status: 'stfp',
      blob: await png(80 + 50 * i, true), w: 16, h: 16, rarity: 1, at: 1 });
  }
  emptyChance = 0;
  await renderShelf();
});

/* Presses Generate set for n, catching every download: its name and its entries. */
const generate = (page, n, budget) => page.evaluate(async ([n, budget, reader]) => {
  const read = eval(reader);
  if (budget) GEN_PART_BYTES = budget;
  const got = [];
  const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
  const blobs = new Map();
  URL.createObjectURL = (b) => { const u = 'blob:probe' + blobs.size; blobs.set(u, b); return u; };
  HTMLAnchorElement.prototype.click = function () { got.push({ name: this.download, blob: blobs.get(this.href) }); };
  const t = window.toast; window.toast = () => {};
  $('cgen').value = String(n);
  try { await $('cgenzip').onclick(); }
  finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = t; }
  const out = [];
  for (const d of got) out.push({ name: d.name, entries: await read(d.blob) });
  return { downloads: out, note: $('cnote').textContent };
}, [n, budget || 0, READER]);

test.describe('Generate set writes in parts, and never writes a corrupt zip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCollection === 'function' && typeof zip === 'function');
    await seed(page);
  });

  test('A SET PAST THE BUDGET arrives in parts, each a whole zip, numbered as one set', async ({ page }) => {
    const r = await generate(page, 9, 1);
    expect(r.downloads.length, 'one part per character on a one-byte budget').toBe(9);
    expect(r.downloads.map(d => d.name)).toEqual(Array.from({ length: 9 }, (_, i) => 'buildanft-collection-part-' + (i + 1) + '.zip'));
    const images = r.downloads.flatMap(d => d.entries.filter(e => e.indexOf('images/') === 0)).sort();
    expect(images, 'every character once, numbered across the parts').toEqual(Array.from({ length: 9 }, (_, i) => 'images/' + (i + 1) + '.png'));
    for (const d of r.downloads) expect(d.entries.length, d.name + ' holds a picture and its metadata').toBe(2);
    expect(r.note).toContain('in 9 zip files');
  });

  test('the control: a set within one part downloads as one zip, under the name it always had', async ({ page }) => {
    const r = await generate(page, 9, 0);
    expect(r.downloads.map(d => d.name)).toEqual(['buildanft-collection-9.zip']);
    expect(r.downloads[0].entries.length).toBe(18);
    expect(r.note).not.toContain('zip files');
  });

  test('ZIP REFUSES AN ARCHIVE PAST 4 GiB, rather than writing corrupt offsets', async ({ page }) => {
    test.setTimeout(20000);
    const r = await page.evaluate(() => {
      /* Two entries claiming 3 GB each. Refused before a byte is read. */
      const fake = { length: 3e9 };
      try { zip([{ name: 'a.png', data: fake }, { name: 'b.png', data: fake }]); return 'wrote'; }
      catch (e) { return String(e && e.message); }
    });
    expect(r).toContain('too large for one zip');
  });
});
