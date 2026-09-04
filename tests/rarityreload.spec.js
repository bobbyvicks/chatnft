/* Every rarity percentage read 0.00% after a reload, once any rule existed.

   Measured on a project with two skins, two hats and one SAVED rule, straight
   after a page load:

     traitChance for every trait     pct 0
     the cached distribution         0 entries
     clear ONLY the cache and ask again:
       tan 0.5   pale 0.5   cap 0.5   crown 0.2

   Nothing else changed between those two lines - same records, same rules,
   same pools - and crown is correctly the low one because the rule suppresses
   it. So everything was right and the answer was still zero.

   THE ORDER INSIDE renderShelf WAS THE CAUSE:

     2153  applyRules(items)       rules loaded
     2387  traitChance(t, ...)     per tile; simulates, and calls cPools()
     2471  buildCompose(items)     the only thing that fills #crows

   cPools builds its pools from the #crows options, which at line 2387 on a
   fresh load do not exist yet. Every draw produced nothing and the EMPTY
   result was cached, so no later action ever repaired it. It also silenced the
   drift warning, which cannot report a drifting collection when every share
   reads zero.

   On a second render #crows still holds the previous render's rows, which is
   why this only ever bit after a reload and never while working - and why no
   test caught it: they all render more than once.

   THE FIRST TEST IS THE ONE THAT MATTERS. It renders ONCE, the way a load
   does. Anything that renders twice first cannot see this at all.
*/
import { test, expect } from '@playwright/test';

/* Seeds a project with a SAVED rule, then reloads so the next render is a
   genuine first render. */
const seedAndReload = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    await dbClear();
    cloudTeamId = null; activeWs = null;
    const png = new Blob([new Uint8Array([0])]);
    const put = (n, l) => dbPut({ id: 't_' + n, kind: 'trait', name: n, layer: l,
      status: 'approved', blob: png, w: 160, h: 160, rarity: 1, at: 1 });
    await put('tan', 'skins');
    await put('pale', 'skins');
    await put('crown', 'hair-headwear');
    await put('cap', 'hair-headwear');
    // Saved, so it comes back through applyRules on the next load - a rule
    // added in this session would not reproduce the boot path.
    await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
      groups: [['hair-headwear/crown', 'skins/tan'].sort()] });
  });
  await page.reload();
  await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
};

test.describe('rarity after a reload, with a rule saved', () => {
  test('the shares are real on the FIRST render, not zero', async ({ page }) => {
    /* READ OFF THE TILES, not by calling traitChance afterwards.
       The first version of this test did the latter and was VACUOUS: reverting
       the fix left it green. renderShelf builds the compose rows at its end, so
       by the time a test calls traitChance the pools exist and the old code
       works. The defect is what the tile loop computed DURING that render, and
       the only witness to it is the ".pct" text the tile is left showing. */
    await seedAndReload(page);
    const r = await page.evaluate(async () => {
      await renderShelf();
      await new Promise(res => setTimeout(res, 400));
      return {
        rules: RULES.length,
        tiles: [...document.querySelectorAll('#projbody .item')].map(el => ({
          name: (el.title || '').trim(),
          shown: (el.querySelector('.pct') || {}).textContent || null,
        })),
      };
    });
    expect(r.rules, 'the saved rule came back').toBe(1);
    expect(r.tiles.length, 'the shelf rendered its traits').toBe(4);
    for (const t of r.tiles) {
      expect(t.shown, t.name + ' shows a share at all').toBeTruthy();
      expect(t.shown, t.name + ' does not read zero: ' + t.shown).not.toMatch(/^~?0(\.0+)?%$/);
    }
  });

  test('and the cached answer is the right one', async ({ page }) => {
    // The control that names the mechanism: an EMPTY distribution used to be
    // cached, so clearing the cache changed every number. Now it changes none.
    await seedAndReload(page);
    const r = await page.evaluate(async () => {
      await renderShelf();
      await new Promise(res => setTimeout(res, 400));
      const items = await dbAll();
      const traits = items.filter(t => t.kind === 'trait');
      const before = traits.map(t => [t.name, +(traitChance(t, items, false).pct || 0).toFixed(1)]);
      const cachedEntries = distCache ? distCache.size : 0;
      distCache = null; distKey = null;
      const after = traits.map(t => [t.name, +(traitChance(t, items, false).pct || 0).toFixed(1)]);
      return { before, after, cachedEntries };
    });
    expect(r.cachedEntries, 'a real distribution was cached, not an empty one').toBeGreaterThan(0);
    expect(r.before, 'and clearing the cache changes nothing').toEqual(r.after);
  });

  test('the rule still bites - the suppressed trait is the low one', async ({ page }) => {
    // Otherwise "not zero" could be satisfied by ignoring the rules entirely,
    // which is the defect this morning's fix was for.
    await seedAndReload(page);
    const shares = await page.evaluate(async () => {
      await renderShelf();
      await new Promise(res => setTimeout(res, 400));
      const items = await dbAll();
      const by = {};
      for (const t of items.filter(x => x.kind === 'trait')) by[t.name] = traitChance(t, items, false).pct;
      return by;
    });
    expect(shares.crown, 'crown is held down by the rule').toBeLessThan(shares.cap);
    expect(shares.cap, 'while its layer-mate is not').toBeGreaterThan(0);
  });

  test('with no rule at all the first render is fine too', async ({ page }) => {
    // The control at the other end: this must not have traded a zero-with-rules
    // for a wrong answer without them.
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const png = new Blob([new Uint8Array([0])]);
      const put = (n, l) => dbPut({ id: 't_' + n, kind: 'trait', name: n, layer: l,
        status: 'approved', blob: png, w: 160, h: 160, rarity: 1, at: 1 });
      await put('tan', 'skins');
      await put('pale', 'skins');
    });
    await page.reload();
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
    const shares = await page.evaluate(async () => {
      await renderShelf();
      await new Promise(res => setTimeout(res, 400));
      const items = await dbAll();
      return items.filter(t => t.kind === 'trait').map(t => [t.name, traitChance(t, items, false).pct]);
    });
    for (const [name, pct] of shares) {
      expect(pct, name + ' has a real share with no rules either').toBeGreaterThan(0);
    }
  });
});
