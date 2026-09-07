/* The Randomise button ignored every rule.

   Sheet of 12 and Generate set both go through buildCombo and were enforced.
   composeRandom walked the compose rows and called weightedPick on each one
   independently - it never mentioned RULES and never called conflictsWith.

   So the Never-together list was honoured everywhere EXCEPT the one button a
   person presses while they are deciding whether the rules are right, and the
   character it drew is on the canvas and downloadable through #cdl. The Add
   button's own tooltip promises "These two will not appear on the same
   character", and the fastest way to check that promise showed the opposite.

   THE CONTROL IS THE FIRST TEST. "The pair never appeared" is also what you
   get from a fixture that could never produce it, so the same fixture with the
   rule removed has to produce it constantly.
*/
import { test, expect } from '@playwright/test';

const LAYERS = ['skins', 'hair', 'hats', 'unsorted'];

const seed = (page, withRule) => page.evaluate(async ([layers, rule]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('mop', 'hair');
  await put('cap', 'hats');
  RULES = rule ? [['hair/mop', 'hats/cap']] : [];
  await saveRules();
  await renderShelf();
  return RULES.length;
}, [LAYERS, withRule]);

/* Presses Randomise N times and reports what the rows ended up holding. */
const press = (page, n) => page.evaluate((N) => {
  const was = emptyChance;
  emptyChance = 0;
  let both = 0, cap = 0, mop = 0, neither = 0;
  const read = () => [...$('crows').querySelectorAll('select')]
    .filter(s => !s.disabled && s.value)
    .map(s => { const r = cItems.find(i => i.id === s.value); return r ? r.layer + '/' + r.name : ''; });
  for (let i = 0; i < N; i++) {
    composeRandom();
    const keys = read();
    const c = keys.indexOf('hats/cap') >= 0, m = keys.indexOf('hair/mop') >= 0;
    if (c && m) both++;
    if (c) cap++;
    if (m) mop++;
    if (!c && !m) neither++;
  }
  emptyChance = was;
  return { both, cap, mop, neither };
}, n);

test.describe('the Randomise button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof composeRandom === 'function');
  });

  test('the fixture really does put both on a character, with no rule', async ({ page }) => {
    /* THE CONTROL. Without it, the test below passes on a fixture where the
       pair could never have appeared in the first place. */
    await seed(page, false);
    const r = await press(page, 60);
    expect(r.both, 'with no rule, every press stacks them').toBe(60);
  });

  test('and with a rule, it never does', async ({ page }) => {
    await seed(page, true);
    const r = await press(page, 60);
    expect(r.both, 'the rule is honoured here too now').toBe(0);
  });

  test('while still filling the layers it can', async ({ page }) => {
    /* A button that obeyed the rule by drawing nothing would pass the test
       above. One of the two has to come out every time, because each layer has
       exactly one trait and neither may be left empty at emptyChance 0 unless
       the rule forces it. */
    await seed(page, true);
    const r = await press(page, 60);
    expect(r.neither, 'never an empty head').toBe(0);
    expect(r.cap + r.mop, 'exactly one of them, every press').toBe(60);
  });

  test('and the hat is the one that survives, because hats decide first', async ({ page }) => {
    /* The decide order is what says which side yields, and Randomise reads the
       same order the generator does - otherwise the button and the sheet would
       disagree about the same rules. */
    await seed(page, true);
    await page.evaluate(async () => {
      DECIDE_ORDER = ['skins', 'hats', 'hair', 'unsorted'];
      await saveDecideOrder();
      await renderShelf();
    });
    const r = await press(page, 60);
    expect(r.cap, 'the hat is chosen first and keeps its place').toBe(60);
    expect(r.mop, 'and the hair yields to it').toBe(0);
  });

  test('reversing the decide order reverses which one yields', async ({ page }) => {
    // The pair to the test above: if the hat won under BOTH orders, Randomise
    // would not be reading the order at all and the test above would be
    // measuring a coincidence.
    await seed(page, true);
    await page.evaluate(async () => {
      DECIDE_ORDER = ['skins', 'hair', 'hats', 'unsorted'];
      await saveDecideOrder();
      await renderShelf();
    });
    const r = await press(page, 60);
    expect(r.mop, 'now the hair is chosen first').toBe(60);
    expect(r.cap, 'and the hat is the one that goes').toBe(0);
  });
});
