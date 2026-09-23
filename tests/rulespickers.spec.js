/* THE RULES LIST BUILDS ITS PICKERS WHEN THEY ARE REACHED FOR.

   Every rule row's "add a trait" picker held every trait the rule did not,
   so the list was rules times traits options - 105,182 at 349 rules, 92% of
   the page, rebuilt on every rule edit and every status press that moves a
   trait in or out of the set. Here: 311 traits over 13 layers and 188
   rules, the size of the collection's own rules file. RUN AGAINST THE PAGE
   BEFORE THE FIX: the first test went red with 59,220 nodes in the list,
   58,092 of them options, and a rebuild of 121 ms; after it, 1,316 nodes and
   8 ms. The second went red too, on the picker being full before anyone
   reached for it; it pins that a picker, once reached for, offers every
   trait the rule does not hold and still widens the rule. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['backgrounds', 'skins', 'mouth', 'eyes', 'clothing', 'chains', 'hair', 'glasses', 'hats', 'ears', 'costumes', 'masks', 'extras'];
  LAYERS = layers.concat(['unsorted']);
  const blob = new Blob([new Uint8Array(8)]);
  const keys = [];
  for (let i = 0; i < 311; i++) {
    const l = layers[i % 13], n = 't' + i;
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l, status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1 });
    keys.push(l + '/' + n);
  }
  RULES = [];
  for (let r = 0; r < 188; r++) RULES.push(ruleGroup([keys[(r * 7) % 311], keys[(r * 7 + 1) % 311], keys[(r * 7 + 2) % 311]]));
  RULES = RULES.filter((g, i, a) => a.findIndex(q => ruleId(q) === ruleId(g)) === i);
  await saveRules();
  rulesBuiltSig = null;
  await renderShelf();
  return { rules: RULES.length, keys: keys.length };
});

test.describe('the rules list builds its pickers when they are reached for', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildRules === 'function');
  });

  test('188 RULES OVER 311 TRAITS draw a list of a few thousand nodes, not tens of thousands', async ({ page }) => {
    const s = await seed(page);
    expect(s.rules).toBeGreaterThan(150);
    const r = await page.evaluate(() => {
      const nodes = document.querySelectorAll('#rulelist *').length;
      const options = document.querySelectorAll('#rulelist option').length;
      rulesBuiltSig = null;
      const t0 = performance.now();
      buildRules(cItems.filter(i => i.kind === 'trait'));
      return { nodes, options, rows: $('rulelist').childElementCount, ms: Math.round(performance.now() - t0) };
    });
    console.log('rules list: ' + JSON.stringify(r));
    expect(r.rows).toBe(s.rules);
    expect(r.options, 'one "add a trait" line a row until it is reached for').toBe(s.rules);
    expect(r.nodes).toBeLessThan(10000);
  });

  test('a picker, once reached for, offers every trait its rule does not hold, and widens it', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(async () => {
      const row = $('rulelist').firstElementChild;
      const sel = row.querySelector('select');
      const before = sel.options.length;
      sel.dispatchEvent(new Event('mousedown'));
      const after = sel.options.length;
      const g = RULES[0];
      const pick = [...sel.options].map(o => o.value).find(v => v && g.indexOf(v) < 0);
      const t = window.toast; window.toast = () => {};
      sel.value = pick; await sel.onchange();
      window.toast = t;
      return { before, after, held: g.length, pick, widened: RULES.some(q => q.indexOf(pick) >= 0 && g.every(m => q.indexOf(m) >= 0)) };
    });
    expect(r.before).toBe(1);
    expect(r.after, 'every trait but the rule\'s own, plus the prompt').toBe(311 - r.held + 1);
    expect(r.widened).toBe(true);
  });
});
