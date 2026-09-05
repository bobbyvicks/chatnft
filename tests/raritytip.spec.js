/* The rarity tooltip explained a sampled estimate as arithmetic.

   traitChance has two paths. Without rules it works the share out from the
   weights. With a rule anywhere in the project the arithmetic is wrong - the
   generator filters each layer against the rules at pick time - so it runs the
   generator instead, DIST_DRAWS draws through distributionOf, and marks the
   answer estimated.

   The tile respects that and prints "~" in front of the number. The TOOLTIP
   said, in both cases:

     "Worked out from this weight against the others in skins, a layer every
      character has."

   a description of the path that was not taken.

   MEASURED. Two skins of equal weight, two hair pieces, one rule between crown
   and olive:

     the tile said        tan 49.15%   olive 50.85%
     the generator emits  tan 50.21%   olive 49.79%   (40,000 fresh draws)

   The tile is right to about a point, which is what 20,000 draws buys. But two
   traits of IDENTICAL weight read 49% and 51% under a sentence crediting their
   weights, so the obvious conclusion is that the weights differ - and because
   distributionOf runs on a fixed seed, that impression is the same every time
   rather than a wobble somebody might catch.

   THE NUMBER MUST STAY SAMPLED. Carrying the arithmetic figure so the tooltip
   can show it is one line away from returning it, which would reinstate the
   defect the sampling exists to fix - crown's weights say 21% and the
   generator puts it on 11% of characters. The last test here runs the real
   generator and holds the tile to it.
*/
import { test, expect } from '@playwright/test';

/* Two skins of equal weight, two hair pieces of unequal weight, and a rule -
   or not. */
const project = (page, withRule) => page.evaluate(async (rule) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'hair-headwear', 'unsorted'];
  projectGrid = 160;
  emptyChance = 0.15;
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hair-headwear', 'unsorted'], hidden: [] });
  const png = new Blob([new Uint8Array(16)]);
  for (const [n, l, rar] of [['tan', 'skins', 3], ['olive', 'skins', 3],
    ['crown', 'hair-headwear', 1], ['cap', 'hair-headwear', 3]]) {
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l,
      status: 'approved', blob: png, w: 160, h: 160, rarity: rar, at: 1 });
  }
  RULES = rule ? [['hair-headwear/crown', 'skins/olive'].sort()] : [];
  await saveRules();
  await renderShelf();
  await new Promise(r => setTimeout(r, 900));
  const tiles = {};
  for (const el of document.querySelectorAll('#projbody .item')) {
    const p = el.querySelector('.pct');
    const name = (el.textContent || '').trim().split(/\s+/)[0].replace(/(approved|wip).*$/, '');
    tiles[name] = { text: p ? p.textContent : null, title: p ? p.title : null };
  }
  return tiles;
}, withRule);

test.describe('what the rarity tile says about where its number came from', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof traitChance === 'function');
  });

  test('with a rule, it says the number was sampled', async ({ page }) => {
    const t = await project(page, true);
    expect(t.tan.title, 'names how it was made').toContain('Estimated by drawing');
    expect(t.tan.title, 'and that the tail of it is noise').toContain('sampling noise');
    expect(t.tan.title, 'and does not credit the weights')
      .not.toContain('Worked out from this weight');
  });

  test('and shows what the weights alone would have said', async ({ page }) => {
    /* The fact the reader is reaching for. Two equal-weight skins reading 49%
       and 51% is the sampling; crown at 11% against weights of 21% is the
       rule. Those are different problems and the tooltip now tells them
       apart. */
    const t = await project(page, true);
    expect(t.tan.title, 'the equal-weight skin').toContain('The weights alone would say 50%');
    expect(t.crown.title, 'and the trait a rule actually holds down')
      .toContain('The weights alone would say 21%');
    expect(t.crown.text, 'which is well away from what it shows').toBe('~11%');
  });

  test('the tile itself still marks it with a tilde', async ({ page }) => {
    // The part visible without hovering, and the reason this defect was only
    // in the tooltip rather than in the number.
    const t = await project(page, true);
    expect(t.tan.text).toBe('~49%');
    expect(t.olive.text).toBe('~51%');
  });

  test('with no rule the sentence is the arithmetic one, unchanged', async ({ page }) => {
    /* A CONTROL. Most projects have no rules, and the exact path really is
       worked out from the weights - so that sentence has to survive intact. */
    const t = await project(page, false);
    expect(t.tan.title).toBe('About 50% of generated characters would carry tan.'
      + ' Worked out from this weight against the others in skins,'
      + ' a layer every character has.');
    expect(t.tan.text, 'and carries no tilde').toBe('50%');
  });

  test('and an optional layer still names its empty chance', async ({ page }) => {
    // A CONTROL. hair-headwear is not in ALWAYS_PRESENT, so the exact sentence
    // has a second half that must not have been lost in the rewrite.
    const t = await project(page, false);
    expect(t.cap.title).toContain('15% chance that layer is left empty');
  });

  test('the number is still the sampled one, not the arithmetic one', async ({ page }) => {
    /* THE ONE THAT MATTERS MOST. Carrying the weights figure so the tooltip
       can show it sits one line from returning it, which would put back the
       exact defect the sampling exists to fix. Held against the real
       generator, unseeded, on a different number of draws - a different
       instrument from the distributionOf the tile uses. */
    await project(page, true);
    const r = await page.evaluate(async () => {
      const pools = cPools();
      const N = 40000, count = {};
      for (let i = 0; i < N; i++) {
        const c = randomCombo(pools);
        if (!c) continue;
        for (const rec of new Set(c)) count[rec.name] = (count[rec.name] || 0) + 1;
      }
      const items = await dbAll();
      const crown = items.find(x => x.name === 'crown');
      return { emitted: count.crown / N, shown: traitChance(crown, items, false).pct,
        weights: traitChance(crown, items, false).plain };
    });
    expect(r.emitted, 'the generator really does hold crown down').toBeLessThan(0.15);
    expect(Math.abs(r.shown - r.emitted), 'and the tile is within a point of it')
      .toBeLessThan(0.01);
    expect(r.weights, 'while the weights alone say something quite different')
      .toBeGreaterThan(0.2);
  });
});
