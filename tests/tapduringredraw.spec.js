/* A TAP ON A TILE SURVIVES A REDRAW THAT LANDS DURING IT.

   A full render rebuilt every tile, and one landing between a tile's press
   and its release replaced the tile under the finger, so the click never
   fired. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with
   nothing opened. The rest are controls: a render with nothing pressed
   rebuilds in the task that asked, as before, and a press the page never
   hears the end of holds the shelf for a bounded time only. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    c.getContext('2d').fillRect(2, 2, 12, 12);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await dbPut({ id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'h' + i, layer: 'hats', status: 'approved',
      blob, w: 16, h: 16, rarity: 1, at: 1000 + i });
  }
  showPage('project', false);
  await renderShelf();
  window.opened = [];
  openTraitRecord = async (t) => { window.opened.push(t.name); return true; };
  const cv = document.querySelector('#projbody .item canvas');
  cv.scrollIntoView({ block: 'center' });
  window.firstTile = cv.closest('.item');
  const r = cv.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: window.firstTile.title };
});

test.describe('a redraw during a tap', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function' && typeof openTraitRecord === 'function');
  });

  test('A TAP ON A TILE STILL OPENS IT when a full render lands mid-press', async ({ page }) => {
    const at = await seed(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.evaluate(() => { window.done = false; renderShelf().then(() => { window.done = true; }); });
    /* Long enough for the render to have rebuilt the shelf had it not waited. */
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForFunction(() => window.done === true);
    const r = await page.evaluate(() => ({ opened: window.opened, rebuilt: !window.firstTile.isConnected }));
    console.log('tap: ' + JSON.stringify(r));
    expect(r.opened, 'the tile pressed was opened').toEqual([at.name]);
    expect(r.rebuilt, 'and the render still happened, after the tap').toBe(true);
  });

  test('the control: with nothing pressed a render rebuilds in the task that asked', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(() => {
      const old = window.firstTile;
      renderShelf(true); /* not awaited: a view-only render builds before it returns */
      return { rebuilt: !old.isConnected, tiles: document.querySelectorAll('#projbody .item').length };
    });
    expect(r).toEqual({ rebuilt: true, tiles: 3 });
  });

  test('the control: a press never released holds the shelf for a bounded time only', async ({ page }) => {
    const at = await seed(page);
    await page.evaluate(() => { SHELF_PRESS_MAX_MS = 300; });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const t0 = Date.now();
    await page.evaluate(() => { window.done = false; renderShelf().then(() => { window.done = true; }); });
    await page.waitForFunction(() => window.done === true, null, { timeout: 5000 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(await page.evaluate(() => !window.firstTile.isConnected)).toBe(true);
    await page.mouse.up();
  });
});
