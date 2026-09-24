/* A FINAL-PROJECT TRAIT OPENS ON A DOUBLE-CLICK AND HAS A FIX BUTTON, AND A
   DOUBLE-CLICK ON THE SHELF OPENS ONCE.

   Asked for: "i want to be able to edit the final project traits by double
   clicking them or with the fix button we have in the rough draft traits,
   also make it so i can edit by double clicking those too". RUN AGAINST THE
   PAGE BEFORE THE FIX: the first three went red - a double-click on a final
   tile opened nothing, the final tile had no fix button, and a double-click
   on a shelf tile opened the trait twice. The controls: a double-click on a
   final tile's own button is not an open, and a single click on the shelf
   still opens, before and after. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_crown_hats_stfp', kind: 'trait', name: 'crown', layer: 'hats', status: 'stfp', blob, w: 16, h: 16, rarity: 1, at: 1 });
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1 });
  /* Counted, and slow enough that a second click lands while the first is still opening. */
  window.opens = [];
  const real = openTraitRecord;
  openTraitRecord = async (t, o) => { window.opens.push(t.id); await new Promise(r => setTimeout(r, 150)); return real(t, o); };
  window.fixed = [];
  fixFromRecords = async (recs) => { window.fixed.push(...recs.map(r => r.id)); return true; };
  window.toast = () => {};
});
const finalTileOf = (id) => `#land [data-key]`;

test.describe('editing from the final project and the shelf', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function' && typeof openTraitRecord === 'function');
    await seed(page);
  });

  const onFinal = async (page) => {
    await page.evaluate(async () => { showPage('final', false); await renderFinal(); });
    const tile = page.locator('.item', { has: page.locator('b', { hasText: /^crown$/ }) }).first();
    await tile.scrollIntoViewIfNeeded();
    return tile;
  };

  test('A DOUBLE-CLICK ON A FINAL-PROJECT TRAIT opens it in the editor', async ({ page }) => {
    const tile = await onFinal(page);
    await tile.locator('canvas').first().dblclick();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ opens: window.opens, open: openRec && openRec.id }));
    console.log('final dblclick: ' + JSON.stringify(r));
    expect(r.opens).toEqual(['t_crown_hats_stfp']);
    expect(r.open).toBe('t_crown_hats_stfp');
  });

  test('A FINAL-PROJECT TRAIT HAS THE FIX BUTTON, and it sends that trait to Fix pixels', async ({ page }) => {
    const tile = await onFinal(page);
    await tile.hover();
    const fx = tile.locator('button.fx');
    expect(await fx.count()).toBe(1);
    await fx.click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => ({ fixed: window.fixed, opens: window.opens }))).toEqual({ fixed: ['t_crown_hats_stfp'], opens: [] });
  });

  test('A DOUBLE-CLICK ON A SHELF TRAIT opens it once, not twice', async ({ page }) => {
    await page.evaluate(async () => { showPage('project', false); await renderShelf(); });
    const tile = page.locator('#projbody .item', { has: page.locator('b', { hasText: /^cap$/ }) }).first();
    await tile.scrollIntoViewIfNeeded();
    await tile.locator('canvas').first().dblclick();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.opens)).toEqual(['t_cap_hats_approved']);
  });

  test('the control: a double-click on the final tile\'s own button is not an open', async ({ page }) => {
    const tile = await onFinal(page);
    await page.evaluate(() => { finalMove = async () => {}; });
    await tile.locator('button', { hasText: 'take out' }).dblclick();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.opens)).toEqual([]);
  });

  test('the control: a single click on a shelf trait still opens it', async ({ page }) => {
    await page.evaluate(async () => { showPage('project', false); await renderShelf(); });
    const tile = page.locator('#projbody .item', { has: page.locator('b', { hasText: /^cap$/ }) }).first();
    await tile.scrollIntoViewIfNeeded();
    await tile.locator('canvas').first().click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.opens)).toEqual(['t_cap_hats_approved']);
  });
});
