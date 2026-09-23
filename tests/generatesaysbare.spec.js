/* GENERATE SET SAYS HOW MANY CHARACTERS CAME OUT WITH NO TRAIT.

   A base and three hats in the final project, and hats left empty half the
   time, so some characters are the base alone. RUN AGAINST THE PAGE BEFORE
   THE FIX: the first test went red with the set's note silent about them.
   The second is the control that a set where every character has a trait
   says nothing of the kind, and the third checks the sheet's count, which
   counted a one-trait character as "nothing but a base" when there was no
   base. */
import { test, expect } from '@playwright/test';

const seed = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  const png = async (fill) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(2, 2, 12, 12);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const recs = [];
  if (o.base) recs.push({ id: 'ref_hero', kind: 'ref', name: 'hero', blob: await png('#888'), w: 16, h: 16, at: 1 });
  for (let i = 0; i < 3; i++) recs.push({ id: 't_h' + i + '_hats_stfp', kind: 'trait', name: 'h' + i, layer: 'hats',
    status: 'stfp', blob: await png('hsl(' + i * 90 + ' 70% 50%)'), w: 16, h: 16, rarity: 1, at: 1 });
  await dbApplyShelfRecords([], recs);
  emptyChance = o.empty;
  await renderShelf();
}, o);

const generate = (page, n) => page.evaluate(async (n) => {
  const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click, realToast = window.toast;
  URL.createObjectURL = () => 'blob:probe'; HTMLAnchorElement.prototype.click = function () {}; window.toast = () => {};
  try {
    document.getElementById('cgen').value = String(n);
    await document.getElementById('cgenzip').onclick();
  } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = realToast; }
  return document.getElementById('cnote').textContent;
}, n);

test.describe('what Generate set says about bare characters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCollection === 'function');
  });

  test('A SET WITH BARE BASES IN IT says how many', async ({ page }) => {
    await seed(page, { base: true, empty: 0.5 });
    const said = await generate(page, 4);
    console.log('said: ' + said);
    expect(said).toMatch(/[1-9]\d* of them came out with no trait on them, only the base/);
  });

  test('the control: a set where every character has a trait says nothing of it', async ({ page }) => {
    await seed(page, { base: true, empty: 0 });
    const said = await generate(page, 3);
    expect(said).toContain('Built 3 different characters');
    expect(said).not.toContain('no trait on them');
  });

  test('THE SHEET, with no base in the project, does not call a one-trait character bare', async ({ page }) => {
    await seed(page, { base: false, empty: 0 });
    const n = await page.evaluate(() => bareCount([[{ kind: 'trait' }], [], [{ kind: 'ref' }]]));
    expect(n, 'the empty one and the base-only one').toBe(2);
  });
});
