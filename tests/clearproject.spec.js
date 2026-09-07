/* Clearing the project, and the difference between the two things that means.

   Clear removed traits and the reference and deliberately kept everything
   else. Its comment gives the reason and the reason is good:

     "a stranded rule is SHOWN as stranded rather than dropped, because
      dropping it throws away an instruction somebody gave"

   That is right when you are clearing traits to re-import a corrected folder -
   the rules still describe the same collection. It is wrong when you are
   starting a DIFFERENT collection, and there was no way to say which you
   meant: the only clean browser was DevTools, which also throws away the
   sign-in.

   So there is a second question now, asked only when there is something to
   lose. Cancel is the old behaviour exactly. OK removes the rules, the answers
   behind them, the draw order, the grid, the base colour and the autosave.

   BOTH ANSWERS GET A TEST, and that is the point of this file rather than an
   afterthought. A destructive change tested only on the destructive path
   passes just as happily when it has become unconditional - and the recorded
   decision it must not break is the CANCEL side. */
import { test, expect } from '@playwright/test';

/* A project with traits and something in every settings record. */
const fill = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const blob = new Blob([new Uint8Array([0])]);
  const put = (name, layer) => dbPut({ id: 't_' + name + '_' + layer + '_approved',
    kind: 'trait', name, layer, status: 'approved', blob, w: 160, h: 160, rarity: 1, at: 1 });
  await put('cap', 'hats');
  await put('bob', 'hair');
  LAYERS = ['skins', 'hair', 'hats', 'unsorted'];
  await saveLayers();
  projectGrid = 128;
  await saveGrid();
  RULES = [['hats/cap', 'hair/bob']];
  DECISIONS = [{ a: 'hair/bob', b: 'hats/cap', ok: false, at: 5, src: 'you' }];
  await saveRules();
  DECIDE_ORDER = ['hats', 'hair'];
  await saveDecideOrder();
  await saveBaseColours([{ r: 230, g: 3, b: 124 }]);
  await renderShelf();
});

/* Press Clear, answering the first question yes and the second as told. Both
   answers are recorded, so a test can prove the second question was ASKED -
   a build that never asks it would otherwise look identical to one that asked
   and was told no. */
const clearWith = (page, second) => page.evaluate(async (secondAnswer) => {
  const asked = [];
  const realConfirm = window.confirm;
  window.confirm = (m) => { asked.push(String(m)); return asked.length === 1 ? true : secondAnswer; };
  try {
    await document.getElementById('clearproj').onclick();
    await new Promise(r => setTimeout(r, 150));
  } finally { window.confirm = realConfirm; }
  const rows = await dbAll();
  return {
    asked,
    traits: rows.filter(i => i.kind === 'trait').length,
    settingsRows: rows.filter(i => i.kind === 'settings').length,
    rules: RULES.length,
    decisions: DECISIONS.length,
    order: DECIDE_ORDER.slice(),
    grid: projectGrid,
    base: BASE_KEEP.length,
    layers: LAYERS.slice(),
  };
}, second);

test.describe('clearing the project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof saveRules === 'function');
    await fill(page);
  });

  test('always takes the traits', async ({ page }) => {
    const r = await clearWith(page, false);
    expect(r.traits, 'the traits went').toBe(0);
    expect(r.asked[0], 'and it said what it was about to do')
      .toContain('Remove every saved trait');
  });

  test('and asks a second time before touching the rules', async ({ page }) => {
    /* The question has to be ASKED, not merely answerable. A build that
       stopped asking and defaulted to keeping would pass every assertion in
       the test below this one. */
    const r = await clearWith(page, false);
    expect(r.asked.length, 'two questions, not one').toBe(2);
    expect(r.asked[1], 'and the second one counts what it would take')
      .toContain('1 rule');
    expect(r.asked[1]).toContain('1 answer');
  });

  test('says no, and the rules stay - which is the recorded decision',
    async ({ page }) => {
      /* THE ONE THAT PROTECTS WHAT WAS ALREADY DECIDED. Clearing traits to
         re-import a corrected folder must leave the rules exactly where they
         were: they still describe this collection, and a rule exists nowhere
         else once it is gone. If this reds, the second question stopped being
         a question. */
      const r = await clearWith(page, false);
      expect(r.rules, 'the rule is still here').toBe(1);
      expect(r.decisions, 'and the answer behind it').toBe(1);
      expect(r.order, 'and the draw order').toEqual(['hats', 'hair']);
      expect(r.grid, 'and the grid').toBe(128);
      expect(r.base, 'and the base colour').toBe(1);
      expect(r.layers, 'and the layer list').toEqual(['skins', 'hair', 'hats', 'unsorted']);
    });

  test('says yes, and there is genuinely nothing left', async ({ page }) => {
    /* What "start fresh" has to mean. Anything surviving here is something a
       new collection inherits from an old one without being told. */
    const r = await clearWith(page, true);
    expect(r.traits).toBe(0);
    expect(r.rules, 'no rules').toBe(0);
    expect(r.decisions, 'no answers').toBe(0);
    expect(r.order, 'no draw order').toEqual([]);
    expect(r.base, 'no base colour').toBe(0);
    expect(r.grid, 'the grid back to the default').toBe(160);
    expect(r.settingsRows, 'and nothing left in the store to reload from').toBe(0);
  });

  test('and it survives a reload, rather than coming back', async ({ page }) => {
    /* THE ASSERTION THAT MATTERS MOST HERE, because clearing the variables in
       memory looks exactly like clearing the records until the page is opened
       again. Measured on the version this replaces: the layer list came back
       to the 13 defaults with Cells at 160 after a reload, because the records
       had never gone. */
    await clearWith(page, true);
    await page.reload();
    await page.waitForFunction(() => typeof saveRules === 'function');
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => ({
      rules: RULES.length, decisions: DECISIONS.length,
      order: DECIDE_ORDER.length, base: BASE_KEEP.length, grid: projectGrid,
      settingsRows: (await dbAll()).filter(i => i.kind === 'settings').length,
    }));
    expect(r.settingsRows, 'no settings record came back').toBe(0);
    expect(r.rules, 'and no rules with it').toBe(0);
    expect(r.decisions).toBe(0);
    expect(r.order).toBe(0);
    expect(r.base).toBe(0);
    expect(r.grid).toBe(160);
  });

  test('and asks nothing extra when there is nothing to lose', async ({ page }) => {
    /* A project with no rules, no grid of its own and no base gets one
       question, as it always did. A second dialog that always appears is a
       second dialog people learn to dismiss. */
    await page.evaluate(async () => {
      RULES = []; DECISIONS = []; DECIDE_ORDER = []; BASE_KEEP = [];
      projectGrid = 160;
      await saveRules(); await saveDecideOrder(); await saveGrid();
    });
    const r = await clearWith(page, false);
    expect(r.asked.length, 'one question only').toBe(1);
    expect(r.traits, 'and the traits still went').toBe(0);
  });
});
