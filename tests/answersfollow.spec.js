/* The reviewed ANSWERS have to follow a rename, exactly as the rules do.

   tests/rulesfollow.spec.js exists because moving a trait stopped enforcing
   every rule that named it. It fixed the rules. It did not fix the answers -
   and the answers are rules:

     applyDecision(a,b,false) -> RULES=RULES.concat([ruleGroup([A,B])])

   A "no" is not a note ABOUT a rule, it mints one on every load; clearRules
   already relies on that and says so. DECISIONS are keyed by the same
   "layer/name" traitKey as RULES, and retargetRules rewrote RULES only.

   SO A RENAME USED TO DO THIS, silently:

     rules       retargeted to the new keys, correct
     answers     still naming the old keys, unreachable
     next load   every "no" re-mints its OLD rule under a dead key
     every "yes" gone, because ok:true only REMOVES a rule and is stored
                 nowhere else, so the pair reads as never reviewed

   On the live collection that is 2,603 answers, and the v11 migration renames
   or empties four layers.

   THE TEST THAT MATTERS IS THE REPLAY. Rewriting DECISIONS is not the point;
   the point is that reloading them afterwards does not resurrect a rule the
   rename just retargeted away. Checking the array would pass on a build that
   rewrote it into something the replay still mishandles.
*/
import { test, expect } from '@playwright/test';

/* Two traits, one rule, and one answer about the same pair. */
const ready = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  for (const [n, l, o] of [['tan', 'skins', 1], ['cap', 'hats', 2]])
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n,
      layer: l, status: 'approved', blob: new Blob([new Uint8Array(16)]),
      w: 160, h: 160, rarity: 1, at: 1, shelfOrder: o });
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
});

const withState = (page, rules, decisions) => page.evaluate(async (s) => {
  RULES = s.rules.map(g => g.slice().sort());
  DECISIONS = s.decisions.map(d => ({ a: d.a, b: d.b, ok: d.ok, at: 5, by: null, src: 'you' }));
  await saveRules();
}, { rules, decisions });

const read = (page) => page.evaluate(async () => {
  const saved = (await dbAll()).find(r => r.id === 'settings.decisions');
  return {
    decisions: DECISIONS.map(d => d.a + '|' + d.b + '|' + (d.ok ? 'yes' : 'no')).sort(),
    onDisk: (saved && saved.decisions || []).map(d => d.a + '|' + d.b).sort(),
    rules: JSON.parse(JSON.stringify(RULES)),
  };
});

/* What the app does on every load and every cloud pull: replay the answers
   over the rules. This is where a stranded answer does its damage. */
const replay = (page) => page.evaluate(async () => {
  for (const d of DECISIONS) applyDecision(d.a, d.b, d.ok);
  return JSON.parse(JSON.stringify(RULES));
});

test.describe('the answers follow a rename', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof retargetRules === 'function');
    await ready(page);
  });

  test('a NO answer is rewritten to the new key', async ({ page }) => {
    await withState(page, [['hats/cap', 'skins/tan']],
      [{ a: 'hats/cap', b: 'skins/tan', ok: false }]);
    await page.evaluate(() =>
      retargetRules([{ from: 'hats/cap', to: 'headwear/cap' }]));
    const r = await read(page);
    expect(r.decisions).toEqual(['headwear/cap|skins/tan|no']);
    expect(r.onDisk, 'and written, not just held in memory')
      .toEqual(['headwear/cap|skins/tan']);
  });

  test('AND REPLAYING IT DOES NOT RESURRECT THE OLD RULE', async ({ page }) => {
    /* THE ONE THAT MATTERS. Every load and every cloud pull replays the
       answers through applyDecision, and a "no" under a dead key concats a
       fresh group naming traits that no longer exist - undoing the retarget
       the rename just did, one page load later, with nothing said. */
    await withState(page, [['hats/cap', 'skins/tan']],
      [{ a: 'hats/cap', b: 'skins/tan', ok: false }]);
    await page.evaluate(() =>
      retargetRules([{ from: 'hats/cap', to: 'headwear/cap' }]));
    const rules = await replay(page);
    expect(rules.length, 'still one rule, not one plus a ghost').toBe(1);
    expect(rules[0].sort()).toEqual(['headwear/cap', 'skins/tan']);
    expect(JSON.stringify(rules), 'nothing still names the old layer')
      .not.toContain('hats/cap');
  });

  test('a YES answer survives, which nothing else records', async ({ page }) => {
    /* A yes is only ever the ABSENCE of a rule, so a stranded one is not
       merely wrong, it is gone - the pair reads as never reviewed and the
       reviewer is asked it again. */
    await withState(page, [], [{ a: 'hats/cap', b: 'skins/tan', ok: true }]);
    await page.evaluate(() =>
      retargetRules([{ from: 'hats/cap', to: 'headwear/cap' }]));
    const r = await read(page);
    expect(r.decisions).toEqual(['headwear/cap|skins/tan|yes']);
  });

  test('and it is remapped even when there are no rules at all',
    async ({ page }) => {
      /* retargetRules used to open with `if(!RULES.length) return 0;`. Every
         yes is an answer with no rule, so that guard skipped exactly the
         answers that have nothing else keeping them reachable - and a project
         part-way through a review is full of them. */
      await withState(page, [], [
        { a: 'hats/cap', b: 'skins/tan', ok: true },
        { a: 'hats/cap', b: 'skins/pale', ok: true },
      ]);
      await page.evaluate(() =>
        retargetRules([{ from: 'hats/cap', to: 'headwear/cap' }]));
      const r = await read(page);
      expect(r.decisions.every(d => d.indexOf('headwear/cap') === 0),
        'both moved').toBe(true);
      expect(r.onDisk.length, 'and both were saved').toBe(2);
    });

  test('an answer naming nothing that moved is left exactly alone',
    async ({ page }) => {
      /* The control. Without it, "rewrite every answer" passes the tests above.

         Asserted in the order it was WRITTEN, a before b, which is the sharper
         check: a remapped answer goes through mergeDecisions and comes back
         normalised by pairOf, so an untouched one keeping its original field
         order is evidence it was genuinely passed over rather than rebuilt
         into the same value. */
      await withState(page, [], [{ a: 'skins/tan', b: 'skins/pale', ok: false }]);
      await page.evaluate(() =>
        retargetRules([{ from: 'hats/cap', to: 'headwear/cap' }]));
      const r = await read(page);
      expect(r.decisions).toEqual(['skins/tan|skins/pale|no']);
    });

  test('an answer whose two ends become one trait is dropped',
    async ({ page }) => {
      /* It no longer names two things. Same reasoning the rules already use
         for a group that collapses below two members - except a rule is kept
         and shown as stranded, while a pair that is one trait cannot be
         displayed or answered at all. */
      await withState(page, [], [{ a: 'hats/cap', b: 'skins/cap', ok: false }]);
      await page.evaluate(() => retargetRules([
        { from: 'hats/cap', to: 'headwear/cap' },
        { from: 'skins/cap', to: 'headwear/cap' },
      ]));
      const r = await read(page);
      expect(r.decisions, 'nothing left to be about').toEqual([]);
    });

  test('two answers that land on one pair become one', async ({ page }) => {
    await withState(page, [], [
      { a: 'hats/cap', b: 'skins/tan', ok: false },
      { a: 'hats/cap2', b: 'skins/tan', ok: false },
    ]);
    await page.evaluate(() => retargetRules([
      { from: 'hats/cap', to: 'headwear/cap' },
      { from: 'hats/cap2', to: 'headwear/cap' },
    ]));
    const r = await read(page);
    expect(r.decisions).toEqual(['headwear/cap|skins/tan|no']);
  });

  test('and a real layer rename carries the answer with the rule',
    async ({ page }) => {
      /* End to end through the gesture rather than through retargetRules
         directly - renameLayer is what somebody actually presses, and it is
         the path the v11 migration will take fourteen times. */
      await withState(page, [['hats/cap', 'skins/tan']],
        [{ a: 'hats/cap', b: 'skins/tan', ok: false }]);
      await page.evaluate(async () => { await renameLayer('hats', 'headwear'); });
      await page.waitForTimeout(400);
      const r = await read(page);
      expect(r.decisions, 'the answer moved with its trait')
        .toEqual(['headwear/cap|skins/tan|no']);
      const rules = await replay(page);
      expect(JSON.stringify(rules), 'and the replay adds no ghost')
        .not.toContain('hats/cap');
      expect(rules.length).toBe(1);
    });
});
