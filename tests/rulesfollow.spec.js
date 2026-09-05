/* Moving a trait silently stopped enforcing every rule that named it.

   A Never-together rule names its traits by layer/name - traitKey. Five
   gestures change one or both, and none of them told the rules: renaming a
   layer, removing a layer (its traits go to unsorted), dragging a card to
   another layer, moving a whole selection, and renaming a trait in the editor.

   MEASURED. One rule, "skins/tan never with hats/cap", then renaming the layer
   hats to headwear:

     traits after            headwear/cap, skins/tan
     RULES after             [["hats/cap","skins/tan"]]
     conflictsWith(cap,tan)  FALSE
     said                    "Renamed to headwear, 1 trait moved"

   The rule stopped binding, so the generator was free to put the two together,
   and the only thing said was that a trait moved. The panel does show the
   member as "(no longer in the set)" - the state is displayed honestly, but
   the state is wrong. Nothing was removed: the app moved the trait itself and
   knew exactly where it went.

   Rules are the part of this project that cannot come back. Traits re-import
   from the folder they came from; a Never-together rule exists nowhere else
   and is not derivable from the PNGs.

   THE ASSERTION THAT MATTERS IS conflictsWith, NOT THE CONTENTS OF RULES. A
   rewritten array that no longer binds would look fixed and generate the
   forbidden pair anyway, so every site here is checked through the function the
   generator actually calls.
*/
import { test, expect } from '@playwright/test';

/* One rule, two traits on different layers. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  for (const [n, l, o] of [['tan', 'skins', 1], ['cap', 'hats', 2]]) {
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l,
      status: 'approved', blob: new Blob([new Uint8Array(16)]), w: 160, h: 160,
      rarity: 1, at: 1, shelfOrder: o });
  }
  RULES = [['hats/cap', 'skins/tan'].sort()];
  await saveRules();
  await renderShelf();
  await new Promise(r => setTimeout(r, 350));
  /* The precondition, asserted rather than assumed: without a rule that binds
     to begin with, every check below passes on an empty rule set. */
  const cap = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
  if (!conflictsWith(cap, [{ layer: 'skins', name: 'tan' }]))
    throw new Error('the rule does not bind before the move, so nothing below means anything');
  return true;
});

/* Reads the state through the function the GENERATOR uses, not through RULES. */
const after = (page, movedName) => page.evaluate(async (name) => {
  await new Promise(r => setTimeout(r, 350));
  const rows = await dbAll();
  const moved = rows.filter(r => r.kind === 'trait').find(t => t.name === name);
  const saved = rows.find(r => r.id === 'settings.rules');
  return {
    binds: moved ? conflictsWith(moved, [{ layer: 'skins', name: 'tan' }]) : 'the trait is gone',
    where: moved ? moved.layer + '/' + moved.name : null,
    rules: JSON.parse(JSON.stringify(RULES)),
    onDisk: saved ? saved.groups : null,
  };
}, movedName);

/* Like quietly, but counts writes to the rules record.

   The two controls below assert that a move "leaves the rules alone", and
   comparing RULES before and after cannot see the difference between not
   rewriting them and rewriting them to the same value - a mutant that dropped
   either guard survived both. saveRules is the only thing that writes the
   record, so counting it is the assertion those tests were reaching for. */
const countingSaves = (page, fn) => page.evaluate(async (src) => {
  const realToast = window.toast, realConfirm = window.confirm, realSave = saveRules;
  let saves = 0;
  window.toast = () => {};
  window.confirm = () => true;
  saveRules = async function(){ saves++; return realSave.apply(null, arguments); };
  try { await eval('(' + src + ')()'); }
  finally { window.toast = realToast; window.confirm = realConfirm; saveRules = realSave; }
  return saves;
}, fn);

const quietly = (page, fn) => page.evaluate(async (src) => {
  const realToast = window.toast, realConfirm = window.confirm;
  window.toast = () => {};
  window.confirm = () => true;
  try { await eval('(' + src + ')()'); }
  finally { window.toast = realToast; window.confirm = realConfirm; }
}, fn);

test.describe('a rule follows the trait it names', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof saveRules === 'function');
    await seed(page);
  });

  test('when its layer is renamed', async ({ page }) => {
    await quietly(page, `async () => { await renameLayer('hats','headwear'); }`);
    const r = await after(page, 'cap');
    expect(r.where, 'the trait moved').toBe('headwear/cap');
    expect(r.binds, 'and the rule still binds').toBe(true);
    expect(r.onDisk, 'and survives a reload').toEqual([['headwear/cap', 'skins/tan']]);
  });

  test('when its layer is removed and it lands in unsorted', async ({ page }) => {
    await quietly(page, `async () => { await removeLayer('hats'); }`);
    const r = await after(page, 'cap');
    expect(r.where).toBe('unsorted/cap');
    expect(r.binds).toBe(true);
  });

  test('when its card is dragged to another layer', async ({ page }) => {
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'skins', beforeKey: null });
    }`);
    const r = await after(page, 'cap');
    expect(r.where).toBe('skins/cap');
    expect(r.binds).toBe(true);
  });

  test('when it is part of a selection moved at once', async ({ page }) => {
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      shelfPick.clear();
      shelfPick.add(shelfCore.recordKey(rec));
      await bulkMoveToLayer('skins');
    }`);
    const r = await after(page, 'cap');
    expect(r.where).toBe('skins/cap');
    expect(r.binds).toBe(true);
  });

  test('and when it is renamed in the editor', async ({ page }) => {
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      const d = new Uint8ClampedArray(16*16*4);
      fileName = 'cap';
      startEditor(d,16,16,16,16,palette(d,256,24,64),false);
      openRec = rec;                       // AFTER startEditor, which resets it
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      $('tname').value = 'beanie'; $('tlayer').value = 'hats';
      await saveTrait();
    }`);
    const r = await after(page, 'beanie');
    expect(r.where).toBe('hats/beanie');
    expect(r.binds).toBe(true);
  });

  test('a rule naming nothing that moved is left exactly as it was', async ({ page }) => {
    /* A CONTROL. "Rewrite every rule on every move" would pass all five tests
       above and churn the record on every drag. */
    await page.evaluate(async () => {
      RULES = [['eyes/wide', 'mouth/grin'].sort()];
      await saveRules();
    });
    const saves = await countingSaves(page, `async () => { await renameLayer('hats','headwear'); }`);
    const r = await after(page, 'cap');
    expect(r.rules, 'untouched').toEqual([['eyes/wide', 'mouth/grin']]);
    expect(saves, 'and the record was never written').toBe(0);
  });

  test('a status change moves nothing, because a rule ignores status', async ({ page }) => {
    /* A CONTROL. saveTrait treats a status change as a move - the id contains
       the status - but traitKey does not, so this is a pair whose two ends are
       equal and rewriting on it would mean rewriting on nothing.

       THROUGH saveTrait, NOT THE SHELF CHIP. The first draft clicked the chip,
       which changes the status by writing the records directly and never calls
       retargetRules at all - so the test passed because nothing ran, and the
       mutant that removes the from===to guard survived it. The chip needs no
       call: it changes only the status, and a rule key has no status in it. */
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(RULES)));
    const saves = await countingSaves(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      const d = new Uint8ClampedArray(16*16*4);
      fileName = 'cap';
      startEditor(d,16,16,16,16,palette(d,256,24,64),false);
      openRec = rec;
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      $('tname').value = 'cap'; $('tlayer').value = 'hats';
      setChip('tstatus','wip');            // the same trait, a different status
      await saveTrait();
      const now = (await dbAll()).filter(x => x.name === 'cap').map(x => x.id);
      if (now.join() !== 't_cap_hats_wip') throw new Error('the status never changed: ' + now.join());
    }`);
    const r = await after(page, 'cap');
    expect(r.rules, 'the rule is unchanged').toEqual(before);
    expect(saves, 'and the record was never written').toBe(0);
    expect(r.binds, 'and still binds').toBe(true);
  });

  test('a rule left naming one trait is kept, not thrown away', async ({ page }) => {
    /* Renaming one member of a rule to the other merges them, and the rule
       stops saying anything. Dropping it would throw away an instruction
       somebody gave, which is what this file refuses to do everywhere else -
       so it stays as it was and shows as stranded, which the panel has words
       for. */
    /* A SECOND RULE THAT REALLY DOES MOVE. With only the collapsing rule in
       the set, nothing is touched, the !touched guard returns early and the
       whole set survives whatever the collapse branch does - two guards
       covering each other, and the mutant that drops the branch survived. */
    await page.evaluate(async () => {
      RULES = [['hats/beanie', 'hats/cap'].sort(), ['hats/cap', 'skins/tan'].sort()];
      await saveRules();
    });
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      const d = new Uint8ClampedArray(16*16*4);
      fileName = 'cap';
      startEditor(d,16,16,16,16,palette(d,256,24,64),false);
      openRec = rec;
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      $('tname').value = 'beanie'; $('tlayer').value = 'hats';
      await saveTrait();
    }`);
    const r = await after(page, 'beanie');
    expect(r.rules, 'the collapsed rule is kept as it was, and the other one moved')
      .toEqual([['hats/beanie', 'hats/cap'], ['hats/beanie', 'skins/tan']]);
  });

  test('two rules that become the same rule collapse into one', async ({ page }) => {
    // Nothing is lost: they now say the same thing, and adding the second by
    // hand would have been refused as a duplicate.
    await page.evaluate(async () => {
      RULES = [['hats/cap', 'skins/tan'].sort(), ['headwear/cap', 'skins/tan'].sort()];
      await saveRules();
    });
    await quietly(page, `async () => { await renameLayer('hats','headwear'); }`);
    const r = await after(page, 'cap');
    /* ON DISK. applyRules de-dupes RULES on every render, so a duplicate
       written to the record is invisible in memory a moment later - which is
       why the in-memory assertion could not see the mutant that keeps both.
       The record is where duplicates would pile up. */
    expect(r.onDisk, 'one rule in the record, not two identical ones')
      .toEqual([['headwear/cap', 'skins/tan']]);
    expect(r.binds).toBe(true);
  });
});
