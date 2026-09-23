/* GENERATE SET KEEPS MORE PICTURES DECODED, WHERE THERE IS ROOM.

   The decoded-picture cache holds 96 MB, about fifteen 1280 pictures, so a
   Generate run over a bigger final set decoded most traits again for most
   characters. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red
   with most lookups decoding again. The second is the control that a phone
   keeps the 96 MB the budget was set for, and the third that the run gives
   the room back when it ends. */
import { test, expect } from '@playwright/test';

const seedAndGenerate = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['a', 'b', 'c', 'd', 'unsorted'];
  if (o.phone) Object.defineProperty(navigator, 'userAgentData', { value: { mobile: true }, configurable: true });
  const S = 1280, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  let k = 0;
  for (const l of ['a', 'b', 'c', 'd']) for (let i = 0; i < 10; i++) {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'hsl(' + (k * 9) + ' 60% 50%)'; g.fillRect(k * 8, k * 8, 320, 320);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await dbPut({ id: 't_x' + i + '_' + l + '_stfp', kind: 'trait', name: 'x' + i, layer: l, status: 'stfp',
      blob, w: S, h: S, rarity: 1, at: 1 });
    k++;
  }
  emptyChance = 0;
  await renderShelf();
  for (const bm of cBitmaps.values()) if (bm.close) bm.close();
  cBitmaps.clear();
  let lookups = 0, misses = 0;
  const real = cBitmap;
  cBitmap = async (rec) => { lookups++; if (!cBitmaps.has(rec.id)) misses++; return real(rec); };
  const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = () => 'blob:probe';
  HTMLAnchorElement.prototype.click = function () {};
  const t = window.toast; window.toast = () => {};
  $('cgen').value = '60';
  try { await $('cgenzip').onclick(); }
  finally { cBitmap = real; URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = t; }
  return { lookups, misses, note: $('cnote').textContent,
    budgetAfter: typeof cBitmapBudget === 'number' ? cBitmapBudget : CBITMAP_BUDGET, budget: CBITMAP_BUDGET,
    held: cBitmapBytes() };
}, o || {});

test.describe('Generate set and the decoded pictures', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCollection === 'function');
  });

  test('SIXTY CHARACTERS FROM FORTY FULL-SIZE TRAITS decode each trait about once', async ({ page }) => {
    const r = await seedAndGenerate(page);
    console.log('desktop: ' + JSON.stringify({ lookups: r.lookups, misses: r.misses }));
    expect(r.note).toContain('Built 60');
    expect(r.misses).toBeLessThanOrEqual(40);
  });

  test('the control: on a phone the run keeps the 96 MB budget', async ({ page }) => {
    const r = await seedAndGenerate(page, { phone: true });
    console.log('phone: ' + JSON.stringify({ lookups: r.lookups, misses: r.misses }));
    expect(r.misses).toBeGreaterThan(100);
  });

  test('the control: the room is given back when the run ends', async ({ page }) => {
    const r = await seedAndGenerate(page);
    expect(r.budgetAfter).toBe(r.budget);
    expect(r.held).toBeLessThanOrEqual(r.budget);
  });
});
