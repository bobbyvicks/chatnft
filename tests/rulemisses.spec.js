/* The rarity estimator must not count its own draws as the collection's.

   distributionOf runs DIST_DRAWS=20,000 draws through randomCombo to estimate
   what the generator does when a rule is in play, and randomCombo increments
   ruleMisses for every draw that cannot satisfy the rules. Nothing put it back.

   ruleMisses is shown to the owner as "N characters could not satisfy the
   Never-together rules". Measured before the fix, on one skin and one
   background with a rule between them and emptyChance 0 so every draw corners:

     after generating a 1-character collection   ruleMisses = 200
     after the shelf asked one trait's chance    ruleMisses = 20,200

   Twenty thousand two hundred failures reported for a collection of one.

   The control in the first test is the part that matters. "The counter did not
   move" is also what you get from an estimator that never ran, and that is not
   a hypothetical: the first probe written for this pointed distributionOf at
   records assigned straight to cItems, but cPools reads the DOM compose rows
   rather than that array, so every draw produced nothing and the leak measured
   as zero. So the test asserts the distribution came back non-empty.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  // backgrounds is drawn BEFORE skins, and skins is the only layer every
  // character must have - so a rule between them corners the draw outright.
  await put('tan', 'skins');
  await put('sky', 'backgrounds');
  await renderShelf();
});

test.describe('what the miss counter counts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    await page.waitForTimeout(400);
  });

  test('asking a trait its chance does not add 20,000 failures', async ({ page }) => {
    const r = await page.evaluate(() => {
      const was = emptyChance;
      emptyChance = 0;                 // every layer fills, so every draw corners
      RULES = [['backgrounds/sky', 'skins/tan'].sort()];
      distCache = null; distKey = null;
      ruleMisses = 0;
      const combos = uniqueCombos(cPools(), 2);
      const afterGenerate = ruleMisses;
      const d = distributionOf(cItems, false);
      const afterEstimate = ruleMisses;
      distributionOf(cItems, false);   // the cached path must be quiet too
      const afterCached = ruleMisses;
      emptyChance = was;
      return { built: combos.length, afterGenerate, afterEstimate, afterCached,
               entries: d ? d.size : 0, draws: DIST_DRAWS };
    });
    // THE CONTROL, first: an estimator that drew nothing would also leave the
    // counter alone, and would pass every assertion below.
    expect(r.entries, 'the estimator actually ran and produced a distribution').toBeGreaterThan(0);
    expect(r.draws, 'and it is the 20,000-draw one').toBe(20000);

    expect(r.afterGenerate, 'generating a cornered set does count misses').toBeGreaterThan(0);
    expect(r.afterEstimate, 'and the estimate adds none of its own').toBe(r.afterGenerate);
    expect(r.afterCached, 'nor does answering from the cache').toBe(r.afterGenerate);
  });

  test('a genuine miss during generation is still counted', async ({ page }) => {
    // The other side. A fix that simply zeroed the counter would pass the test
    // above and silently delete the thing it exists to report.
    const r = await page.evaluate(() => {
      const was = emptyChance;
      emptyChance = 0;
      RULES = [['backgrounds/sky', 'skins/tan'].sort()];
      distCache = null; distKey = null;
      ruleMisses = 0;
      uniqueCombos(cPools(), 2);
      const counted = ruleMisses;
      emptyChance = was;
      return { counted };
    });
    expect(r.counted, 'an over-constrained set still reports itself').toBeGreaterThan(0);
  });

  test('and a set with no rule at all reports nothing', async ({ page }) => {
    const r = await page.evaluate(() => {
      const was = emptyChance;
      emptyChance = 0;
      RULES = [];
      distCache = null; distKey = null;
      ruleMisses = 0;
      const combos = uniqueCombos(cPools(), 4);
      const counted = ruleMisses;
      emptyChance = was;
      return { counted, built: combos.length };
    });
    expect(r.built, 'it built something').toBeGreaterThan(0);
    expect(r.counted, 'with nothing to violate').toBe(0);
  });
});
