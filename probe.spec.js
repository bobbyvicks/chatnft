import { test, expect } from '@playwright/test';

test('measure the ruleMisses leak', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    await dbClear();
    const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
      status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
    await put('tan', 'skins');
    await put('sky', 'backgrounds');
    await renderShelf();
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const pools = cPools();
    const poolShape = Object.keys(pools).map(k => k + ':' + (pools[k] || []).length).join(',');
    const was = emptyChance;
    emptyChance = 0;
    RULES = [['backgrounds/sky', 'skins/tan'].sort()];
    distCache = null; distKey = null;
    ruleMisses = 0;
    const combos = uniqueCombos(cPools(), 2);
    const afterGenerate = ruleMisses;
    const d = distributionOf(cItems, false);
    const afterEstimate = ruleMisses;
    distributionOf(cItems, false);
    const afterCached = ruleMisses;
    // what the owner would actually be shown, verbatim shape
    const shown = ruleMisses ? 'The Never-together rules could not be met on '
      + ruleMisses + ' draw' + (ruleMisses === 1 ? '' : 's') : '(nothing said)';
    emptyChance = was;
    return { poolShape, built: combos.length, afterGenerate, afterEstimate, afterCached,
             entries: d ? d.size : 0, draws: DIST_DRAWS, shown, items: cItems.length };
  });
  console.log('PROBE ' + JSON.stringify(r, null, 1));
  expect(r.entries, 'CONTROL: the estimator ran at all').toBeGreaterThan(0);
});
