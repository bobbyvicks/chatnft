/* THE RULES THAT DISAGREE ARE NAMED.

   A rule "hats/X only pick from masks [...]" says hats decide before masks;
   "masks/Y hide hats" says masks decide before hats. Both at once is a cycle,
   decideOrderFor returns nothing rather than a made-up order, and the import
   said "the rules disagree about which layer decides first, so the decide
   order was left alone". True, and useless: it never said which layers, so
   a collection with 181 rules had nothing to look at.

   The collection's own v14 rules file does this on six layer pairs - five new
   hairs and one hat restrict layers whose older rules restrict hair and hats
   the other way. The note names the pairs now, and when a cycle has no direct
   pair it names the layers it could not place. The control is a file with
   the same rules one way round, which orders and says nothing of the kind. */
import { test, expect } from '@playwright/test';

const seed = (page, layers) => page.evaluate(async (ls) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const l of ls) {
    if (l === 'unsorted') continue;
    await dbPut({ id: 't_a-' + l + '_' + l + '_approved', kind: 'trait',
      name: 'a-' + l, layer: l, status: 'approved', blob, w: 8, h: 8, at: 1 });
  }
  LAYERS = ls.slice();
  RULES = []; DECISIONS = []; DECIDE_ORDER = [];
  await saveLayers(); await saveRules(); await saveDecideOrder();
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
  return LAYERS.slice();
}, layers);

/* One rule: the trait on `from` hides the whole of `to`, so `from` decides
   before `to`. */
const hides = (from, to) => ({ layer: from, operation: 'is', trait: ['a-' + from + '.png'],
  thenStatements: [{ action: 'hide layer', targetLayer: to, targetTrait: [] }] });

const importRules = (page, rules) => page.evaluate(async (rs) => {
  const f = new File([JSON.stringify(rs)], 'rules.json', { type: 'application/json' });
  await importRuleFile(f);
  return { note: document.getElementById('ruleimportnote').textContent, order: DECIDE_ORDER.slice() };
}, rules);

test.describe('the rules that disagree are named', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importRuleFile === 'function' && typeof decideOrderFor === 'function');
    await seed(page, ['backgrounds', 'hair', 'hats', 'masks', 'unsorted']);
  });

  test('A PAIR OF LAYERS WHOSE RULES RUN BOTH WAYS IS NAMED', async ({ page }) => {
    const r = await importRules(page, [hides('hats', 'masks'), hides('masks', 'hats')]);
    expect(r.note).toContain('the rules disagree about which layer decides first (hats and masks), so the decide order was left alone');
    expect(r.order, 'and no order was invented').toEqual([]);
  });

  test('and the same rules one way round order the layers and say nothing of the kind',
    async ({ page }) => {
      /* The control, one rule fewer. */
      const r = await importRules(page, [hides('hats', 'masks'), hides('hair', 'hats')]);
      expect(r.note).toContain('layers now decide in the order hair, hats, masks');
      expect(r.note).not.toContain('disagree');
    });

  test('a cycle with no direct pair names the layers it could not place', async ({ page }) => {
    /* hair before hats before masks before hair: no two of them disagree
       directly, and together they cannot be ordered at all. */
    const r = await importRules(page, [hides('hair', 'hats'), hides('hats', 'masks'), hides('masks', 'hair')]);
    expect(r.note).toContain('the rules disagree about which layer decides first (among hair, hats, masks), so the decide order was left alone');
    expect(r.order).toEqual([]);
  });

  test('two disagreeing pairs are both named, each once', async ({ page }) => {
    const r = await importRules(page, [hides('hats', 'masks'), hides('masks', 'hats'),
      hides('hair', 'hats'), hides('hats', 'hair')]);
    expect(r.note).toContain('(hair and hats, hats and masks)');
  });
});
