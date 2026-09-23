/* BUILD A CHARACTER FOLDS, SO THE TRAITS ARE ON THE FIRST SCREEN.

   The panel is first on the project page by request and its preview is
   900 px wide by request, so the first screen was the preview alone and
   the traits began about 1,700 px down. RUN AGAINST THE PAGE BEFORE THE
   FIX: the first test went red with the first tile at 1,709 px. The
   others: Randomize opens the preview at its full size without changing
   what is remembered, a fold opened by hand is remembered across a
   reload, and - the control - the panel is still above the traits. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const recs = [];
  for (let i = 0; i < 30; i++) recs.push({ id: 't_t' + i + '_' + (i % 2 ? 'hats' : 'skins') + '_approved', kind: 'trait',
    name: 't' + i, layer: i % 2 ? 'hats' : 'skins', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1 });
  await dbApplyShelfRecords([], recs);
  showPage('project', false); await renderShelf();
  window.scrollTo(0, 0);
});
const tops = (page) => page.evaluate(() => ({
  tile: Math.round(document.querySelector('#projbody .item').getBoundingClientRect().top),
  compose: Math.round(document.getElementById('compose').getBoundingClientRect().top),
  preview: Math.round(document.getElementById('ccanvas').getBoundingClientRect().width),
}));

test.describe('the project page', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
  });

  test('OPENS WITH THE TRAITS ON THE FIRST SCREEN', async ({ page }) => {
    const r = await tops(page);
    console.log('first: ' + JSON.stringify(r));
    expect(r.tile).toBeLessThan(900);
  });

  test('RANDOMIZE OPENS THE PREVIEW at its full size, and does not change how the page opens', async ({ page }) => {
    await page.click('#crand');
    expect((await tops(page)).preview).toBe(900);
    await page.reload();
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    expect((await tops(page)).tile).toBeLessThan(900);
  });

  test('A FOLD OPENED BY HAND is remembered', async ({ page }) => {
    await page.click('#composefold');
    await page.reload();
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    expect((await tops(page)).preview).toBe(900);
  });

  test('the control: Build a character is still above the traits', async ({ page }) => {
    const r = await tops(page);
    expect(r.compose).toBeLessThan(r.tile);
  });
});
