/* "N possible characters" counted combinations the rules forbid.

   comboStats multiplied the pool sizes together and never mentioned RULES, so
   every Never-together rule left it overstating what the set can make.
   Measured on two skins, one mask and one rule:

                  says   actually
     no rules        4      4        the formula is right without them
     one rule        4      3        tan+veil is gone, the count did not know

   "actually" is not another formula: it draws twenty thousand characters and
   collects the distinct results, which is the same instrument used below.

   The figure matters because it is what tells somebody whether their set can
   mint the collection they are planning. Overstating it means planning one
   that cannot be made, and several rules compound.

   Counting legal combinations exactly is a hard problem and the space is
   routinely far too large to walk, so the surviving share is ESTIMATED by
   uniform sampling and the product scaled by it. The figure says it is an
   estimate, because it is one.

   THE CONTROL RUNS THROUGHOUT: with no rules the answer must stay exactly what
   it was and must NOT be marked estimated. A change that made every figure an
   estimate would pass the interesting tests and make the common case worse.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  // skins is the only ALWAYS_PRESENT layer, so it cannot be empty; masks can.
  // Two skins x (one mask or none) = four combinations, small enough that the
  // exact answer is known by hand AND reachable by enumeration.
  await put('tan', 'skins');
  await put('pale', 'skins');
  await put('veil', 'masks');
  await renderShelf();
});

/* What comboStats says, and what the generator can actually produce. */
const both = (page, rules) => page.evaluate((r) => {
  RULES = r;
  const cs = comboStats(cItems, false);
  const was = emptyChance;
  emptyChance = 0.5;
  distCache = null; distKey = null;
  const pools = cPools();
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    seen.add(randomCombo(pools).map(t => t.layer + '/' + t.name).sort().join('|'));
  }
  emptyChance = was;
  return { says: cs.distinct, estimated: cs.estimated, share: cs.share, actually: seen.size,
           combos: [...seen].sort() };
}, rules);

const RULE = [['masks/veil', 'skins/tan'].sort()];

test.describe('how many characters the set can really make', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof comboStats === 'function');
    await seed(page);
    await page.waitForTimeout(400);
  });

  test('with no rules the count is exact, and says nothing about estimating', async ({ page }) => {
    // THE CONTROL, and it runs first because everything else is a deviation
    // from it. Making every figure an estimate would be a regression here.
    const r = await both(page, []);
    expect(r.says, 'two skins times mask-or-none').toBe(4);
    expect(r.actually, 'and the generator agrees').toBe(4);
    expect(r.estimated, 'nothing was estimated').toBe(false);
  });

  test('a rule removes combinations, and the count follows', async ({ page }) => {
    const r = await both(page, RULE);
    expect(r.actually, 'the generator can make three').toBe(3);
    expect(Math.round(r.says), 'and the figure says three, not four').toBe(3);
    expect(r.estimated, 'and admits it is an estimate').toBe(true);
  });

  test('the combination the rule forbids really is the missing one', async ({ page }) => {
    // Without this, "three instead of four" could be right by accident - some
    // other combination going missing would produce the same count.
    const r = await both(page, RULE);
    expect(r.combos, 'exactly these three, and tan with veil is not among them').toEqual([
      'masks/veil|skins/pale',
      'skins/pale',
      'skins/tan',
    ]);
  });

  test('the estimate is stable, not a different number each time it is asked', async ({ page }) => {
    // A figure on screen that changes when nothing changed reads as a bug in
    // the set. The sampling is seeded for that reason.
    const twice = await page.evaluate((r) => {
      RULES = r;
      return [comboStats(cItems, false).distinct, comboStats(cItems, false).distinct];
    }, RULE);
    expect(twice[0]).toBe(twice[1]);
  });

  test('the estimated share lands near the exact answer', async ({ page }) => {
    // Three of the four combinations survive, so the share is exactly 0.75.
    // Sampling should land close; a wide miss means the sampler is not uniform.
    const r = await both(page, RULE);
    expect(Math.abs(r.share - 0.75), 'within a couple of points of 3/4').toBeLessThan(0.02);
  });

  test('the screen says the figure is estimated, and why', async ({ page }) => {
    const shown = await page.evaluate(async (r) => {
      RULES = r;
      await buildCompose(cItems);
      await new Promise(res => setTimeout(res, 150));
      const el = document.getElementById('ccount');
      return { text: el.textContent, title: el.title };
    }, RULE);
    expect(shown.text).toContain('3 possible characters');
    expect(shown.text, 'and marks it').toContain('estimated');
    expect(shown.title, 'the tooltip explains what was subtracted').toContain('Never-together');
  });

  test('and with no rules the screen makes no such claim', async ({ page }) => {
    const shown = await page.evaluate(async () => {
      RULES = [];
      await buildCompose(cItems);
      await new Promise(res => setTimeout(res, 150));
      const el = document.getElementById('ccount');
      return { text: el.textContent, title: el.title };
    });
    expect(shown.text).toContain('4 possible characters');
    expect(shown.text, 'nothing was estimated').not.toContain('estimated');
    expect(shown.title).not.toContain('Never-together');
  });
});
