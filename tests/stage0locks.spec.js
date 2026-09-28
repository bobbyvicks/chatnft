/* STAGE 0: EACH TAB HOLDS open:<database> WHILE IT HAS IT OPEN (design D1,
   B1). The new page's Leave and Reset, and this page's own Leave (patch605),
   read these locks to know another tab is using a store. The controls: a
   closed store holds nothing, and a browser without Web Locks still opens. */
import { test, expect } from '@playwright/test';

const held = (page, name) => page.evaluate(async (name) =>
  (await navigator.locks.query()).held.filter(l => l.name === 'open:' + name).map(l => l.mode), name);
const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof s0CloseAll === 'function');
  await page.evaluate(() => { s0CloseAll('pixelbench'); s0CloseAll('chatnft.ws.team7'); activeWs = null; dbp = null; dbpName = null; });
};

test.describe('stage 0: the open lock', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('opening a store takes a shared open lock, and closing it lets the lock go', async ({ page }) => {
    await page.evaluate(async () => { await dbAll(); });
    expect(await held(page, 'pixelbench')).toEqual(['shared']);
    await page.evaluate(async () => { (await dbp).close(); dbp = null; dbpName = null; });
    await expect.poll(() => held(page, 'pixelbench')).toEqual([]);
  });

  test('a second tab on the same store holds its own lock beside this one', async ({ page, context }) => {
    await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbAll(); });
    const other = await context.newPage();
    await ready(other);
    await other.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbAll(); });
    expect(await held(page, 'chatnft.ws.team7')).toEqual(['shared', 'shared']);
    await other.close();
    await expect.poll(() => held(page, 'chatnft.ws.team7')).toEqual(['shared']);
    await page.evaluate(() => { s0CloseAll('chatnft.ws.team7'); activeWs = null; });
  });

  test('s0CloseAll closes the handle db() left open when the project changed under it', async ({ page }) => {
    const n = await page.evaluate(async () => {
      activeWs = 'team7'; await dbAll();
      activeWs = null; await dbAll();
      return s0CloseAll('chatnft.ws.team7');
    });
    expect(n).toBe(1);
    await expect.poll(() => held(page, 'chatnft.ws.team7')).toEqual([]);
    expect(await held(page, 'pixelbench'), 'the control: the store in use is still held').toEqual(['shared']);
  });

  test('once s0CloseAllGone settles, the store\'s lock is free for an exclusive request at once', async ({ page }) => {
    const free = await page.evaluate(async () => {
      await dbAll();
      await s0CloseAllGone('pixelbench');
      dbp = null; dbpName = null;
      return navigator.locks.request('open:pixelbench', { mode: 'exclusive', ifAvailable: true }, (l) => !!l);
    });
    expect(free, 'this tab\'s own lock is gone, not merely released').toBe(true);
  });

  test('the store is still version 1', async ({ page }) => {
    const v = await page.evaluate(async () => { await dbAll(); return (await indexedDB.databases()).find(d => d.name === 'pixelbench').version; });
    expect(v).toBe(1);
  });

  test('without Web Locks the store still opens, holding nothing', async ({ page }) => {
    const got = await page.evaluate(async () => {
      /* Dropped here, in the same evaluate, so the open below is really made
         without Web Locks - never a handle something opened earlier with
         them. The record read alone cannot tell those apart; the tracked
         entry's hold can. */
      dbp = null; dbpName = null;
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await dbPut({ id: 'settings.probe', kind: 'settings', at: 1 });
      const r = await dbGet('settings.probe');
      const d = await dbp;
      const entry = [...(s0OpenDbs.get('pixelbench') || [])].find(e => e.d === d);
      return { id: r && r.id, tracked: !!entry, holdIsNull: !!entry && entry.hold === null };
    });
    expect(got.id, 'the store opened, and the record reads back').toBe('settings.probe');
    expect(got.tracked, 'the handle it read through is tracked').toBe(true);
    expect(got.holdIsNull, 'and that handle holds no lock').toBe(true);
  });
});
