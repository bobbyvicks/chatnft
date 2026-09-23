/* THE COLLECTION'S PALETTE IS WORKED OUT ONCE, FROM ACROSS THE COLLECTION.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with forty
   decodes on the second open as on the first, and the second with only
   the first forty names looked at - every one a red skin, so the blue
   hats were not in the palette at all. The third is the control that a
   trait changing is noticed. */
import { test, expect } from '@playwright/test';

/* Forty-five red skins, named first, then fifteen blue hats. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  const png = async (colour, shade) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) { g.fillStyle = colour(y * 4 + shade); g.fillRect(0, y, 8, 1); }
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const recs = [];
  for (let i = 0; i < 45; i++) recs.push({ id: 't_a' + String(i).padStart(2, '0') + '_skins_approved', kind: 'trait',
    name: 'a' + i, layer: 'skins', status: 'approved', blob: await png(v => 'rgb(' + (200 + v % 50) + ',20,20)', i), w: 8, h: 8, at: 1 });
  for (let i = 0; i < 15; i++) recs.push({ id: 't_z' + String(i).padStart(2, '0') + '_hats_approved', kind: 'trait',
    name: 'z' + i, layer: 'hats', status: 'approved', blob: await png(v => 'rgb(20,20,' + (200 + v % 50) + ')', i), w: 8, h: 8, at: 1 });
  await dbApplyShelfRecords([], recs);
  window.decodes = 0;
  const real = window.createImageBitmap;
  window.createImageBitmap = (...a) => { window.decodes++; return real(...a); };
});

test.describe('the colours of your collection, for Pixelate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof collectionPalette === 'function');
    await seed(page);
  });

  test('A SECOND OPEN decodes nothing', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const a = await collectionPalette(24); const first = window.decodes;
      const b = await collectionPalette(24);
      return { first, second: window.decodes - first, same: JSON.stringify(a) === JSON.stringify(b) };
    });
    expect(r.first).toBe(40);
    expect(r.second).toBe(0);
    expect(r.same, 'the same answer').toBe(true);
  });

  test('THE HATS ARE LOOKED AT TOO, not only the first forty names', async ({ page }) => {
    const blue = await page.evaluate(async () => (await collectionPalette(24)).filter(c => c[2] > 150 && c[0] < 100).length);
    expect(blue, 'blue colours in the palette').toBeGreaterThan(0);
  });

  test('the control: a trait that changes is looked at again', async ({ page }) => {
    const r = await page.evaluate(async () => {
      await collectionPalette(24); const first = window.decodes;
      const t = await dbGet('t_a00_skins_approved');
      await dbPut(Object.assign({}, t, { at: 2 }));
      await collectionPalette(24);
      return window.decodes - first;
    });
    expect(r).toBe(40);
  });
});
