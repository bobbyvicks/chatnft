/* Clear promised traits and the reference; it also took the rules.

   The confirmation reads "Remove every saved trait and the reference from this
   browser?" and the handler then emptied the WHOLE store - and four settings
   records live in it: the rules, the layer list, the grid and the autosave.

   MEASURED, on a project with one rule, a custom layer, a turned-off set and
   Cells at 64:

     immediately after   rules 1 -> 0, sets off ['backgrounds'] -> []
                         all three settings records deleted
     after a reload      custom layer GONE, 13 default layers back,
                         Cells 64 -> 160

   None of that is a trait or the reference.

   THE RULES ARE THE PART THAT CANNOT COME BACK. Traits re-import from the
   folder they came from; a Never-together rule exists nowhere but here and is
   not derivable from the PNGs.

   The kept rules will name traits that are gone. That is deliberate, and is
   what this file already does everywhere else: a stranded rule is SHOWN as
   stranded rather than dropped, because dropping it throws away an instruction
   somebody gave.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  const png = new Blob([new Uint8Array([0])]);
  await dbPut({ id: 't_tan', kind: 'trait', name: 'tan', layer: 'skins', status: 'approved',
    blob: png, w: 160, h: 160, rarity: 1, at: 1 });
  await dbPut({ id: 't_pale', kind: 'trait', name: 'pale', layer: 'skins', status: 'approved',
    blob: png, w: 160, h: 160, rarity: 1, at: 1 });
  await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero', blob: png, w: 160, h: 160, at: 1 });
  await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
    groups: [['skins/tan', 'masks/veil'].sort()] });
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['backgrounds', 'skins', 'my-custom-layer', 'unsorted'], hidden: ['backgrounds'] });
  await dbPut({ id: 'settings.grid', kind: 'settings', cells: 64, at: 1 });
  await renderShelf();
});

/* Presses the real button, with confirm() answered yes. */
const clear = (page) => page.evaluate(async () => {
  const said = [];
  const realToast = window.toast, realConfirm = window.confirm;
  window.toast = (m) => { said.push(m); };
  window.confirm = () => true;
  document.getElementById('clearproj').click();
  await new Promise(r => setTimeout(r, 700));
  window.toast = realToast; window.confirm = realConfirm;
  const rows = await dbAll();
  return {
    said,
    traitsAndRefs: rows.filter(r => r.kind === 'trait' || r.kind === 'ref').length,
    settings: rows.filter(r => String(r.id).indexOf('settings.') === 0).map(r => r.id).sort(),
    rulesInMemory: RULES.length,
  };
});

test.describe('what Clear clears', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    await page.waitForTimeout(400);
  });

  test('it removes the traits and the reference, which is what it asked about', async ({ page }) => {
    // The positive half. Without it, "keeps the settings" would be satisfied by
    // a button that does nothing at all.
    const r = await clear(page);
    expect(r.traitsAndRefs, 'both traits and the reference are gone').toBe(0);
    expect(r.said.join(' ')).toContain('removed');
  });

  test('and keeps the rules, which it never mentioned', async ({ page }) => {
    const r = await clear(page);
    expect(r.settings, 'all three settings records survive').toEqual(
      ['settings.grid', 'settings.layers', 'settings.rules']);
    expect(r.rulesInMemory, 'and the rule is still loaded').toBe(1);
  });

  test('it says what it kept, so nobody finds out later', async ({ page }) => {
    const r = await clear(page);
    expect(r.said.join(' ')).toContain('rules, layers and grid are still here');
  });

  test('the custom layer and the grid survive a reload', async ({ page }) => {
    // The settings only reload from their records, so an in-memory check would
    // pass even with the records deleted - this is where the old behaviour
    // actually showed itself.
    await clear(page);
    await page.reload();
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
    await page.waitForTimeout(400);
    const after = await page.evaluate(async () => {
      await renderShelf();
      await new Promise(r => setTimeout(r, 300));
      return { layers: LAYERS.slice(), grid: projectGrid, rules: RULES.length };
    });
    expect(after.layers, 'the custom layer is still there').toContain('my-custom-layer');
    expect(after.grid, 'and the grid is still 64').toBe(64);
    expect(after.rules, 'and the rule survived too').toBe(1);
  });
});
