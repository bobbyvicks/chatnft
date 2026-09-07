/* Reading a curated rules file, instead of building it by hand 1,138 times.

   The file is a LaunchMyNFT export: a condition naming one trait, and actions
   that either hide a target layer or restrict it to a list. Measured on the
   real one (2026-09-07): 54 conditions, 127 actions, 92 traits over five
   layers, which becomes 103 groups and 1,138 members in this app's own rule
   model. By hand that is about 1,138 trips through a dropdown of every trait
   in the collection.

   THE TRANSLATION IS EXACT, and the reason is worth stating because it looks
   like an over-constraint. An action forbids, on the target layer, everything
   it does not allow - all of it, for "hide layer". The group is the condition
   trait plus those. A group of {one hat, fifteen hairstyles} also says no two
   of those fifteen may appear together, which is not an extra rule: buildCombo
   takes at most one trait per layer, so two hairstyles could never co-occur.
   The only pairs the group can forbid are hat-against-hairstyle.

   AND THE DIRECTION, which a symmetric group cannot carry. An action names a
   condition layer and a target layer, and the target is the side that yields.
   Here the side that yields is whichever layer is decided later, so the import
   also writes a decide order - see decideorder.spec.js for what that buys.

   planRuleImport is separated from the button so it can be tested without a
   file dialogue, and so nothing is written until every problem with the file
   is known. Half an import is worse than none, because the half that landed
   looks exactly like a whole one.
*/
import { test, expect } from '@playwright/test';

/* Small enough to check by hand, and it exercises every branch: a hide, a
   restriction, a restriction that allows everything, a trait this project does
   not have, a layer it does not have, and an operation this cannot read. */
const DOC = [
  { layer: 'hats', operation: 'is', trait: ['apehead.png'],
    thenStatements: [{ action: 'hide layer', targetLayer: 'hair', targetTrait: [] }] },
  { layer: 'hats', operation: 'is', trait: ['cap.png'],
    thenStatements: [{ action: 'only pick from', targetLayer: 'hair', targetTrait: ['bob.png'] }] },
  { layer: 'hats', operation: 'is', trait: ['beret.png'],
    thenStatements: [{ action: 'only pick from', targetLayer: 'hair',
      targetTrait: ['bob.png', 'curls.png', 'mop.png'] }] },
  { layer: 'hats', operation: 'is', trait: ['ghost.png'],
    thenStatements: [{ action: 'hide layer', targetLayer: 'hair', targetTrait: [] }] },
  { layer: 'hats', operation: 'is', trait: ['cap.png'],
    thenStatements: [{ action: 'hide layer', targetLayer: 'trousers', targetTrait: [] }] },
  { layer: 'hats', operation: 'is not', trait: ['cap.png'],
    thenStatements: [{ action: 'hide layer', targetLayer: 'hair', targetTrait: [] }] },
];

const LAYERS = ['skins', 'hair', 'hats', 'unsorted'];

const seed = (page) => page.evaluate(async (layers) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('bob', 'hair');
  await put('curls', 'hair');
  await put('mop', 'hair');
  await put('apehead', 'hats');
  await put('cap', 'hats');
  await put('beret', 'hats');
  /* ghost.png is deliberately NOT here - the file names a trait this project
     does not have, which must be reported and never invented. */
  await renderShelf();
}, LAYERS);

const plan = (page, doc) => page.evaluate(async (d) => {
  const items = (await dbAll()).filter(i => i.kind === 'trait');
  const p = planRuleImport(d, items);
  return { groups: p.groups.map(g => g.join('|')), order: p.order, actions: p.actions,
    restrictNothing: p.restrictNothing, missingTraits: p.missingTraits,
    missingLayers: p.missingLayers, badOps: p.badOps, edges: p.edges };
}, doc);

/* The gesture: choose a file. */
const importFile = async (page, doc) => {
  await page.setInputFiles('#rulefile', {
    name: 'rules.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.waitForFunction(() => {
    const n = document.getElementById('ruleimportnote');
    return n && !n.hidden && n.textContent && n.textContent.indexOf('Reading') !== 0;
  }, null, { timeout: 15000 });
  return page.evaluate(() => ({
    note: document.getElementById('ruleimportnote').textContent,
    rules: RULES.map(g => g.join('|')),
    order: DECIDE_ORDER.slice(),
  }));
};

test.describe('importing a curated rules file', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof planRuleImport === 'function');
    await seed(page);
  });

  test('a hide becomes a rule against every trait on that layer', async ({ page }) => {
    const p = await plan(page, [DOC[0]]);
    expect(p.groups, 'the ape head against all three hairstyles')
      .toEqual(['hair/bob|hair/curls|hair/mop|hats/apehead']);
  });

  test('and an allow-list becomes a rule against what it leaves out', async ({ page }) => {
    /* The complement, not the list. "only pick from bob" over three hairstyles
       forbids the other two. */
    const p = await plan(page, [DOC[1]]);
    expect(p.groups).toEqual(['hair/curls|hair/mop|hats/cap']);
  });

  test('an allow-list naming everything is not a rule at all', async ({ page }) => {
    /* 24 of the real file's 127 actions are this. A group of one would be
       meaningless, and a group of two would forbid something nobody asked to
       forbid. */
    const p = await plan(page, [DOC[2]]);
    expect(p.groups, 'nothing is forbidden').toEqual([]);
    expect(p.restrictNothing, 'and it is counted rather than lost').toBe(1);
  });

  test('a trait the project does not have is reported, never invented', async ({ page }) => {
    const p = await plan(page, [DOC[3]]);
    expect(p.groups, 'no rule is made for it').toEqual([]);
    expect(p.missingTraits, 'and it is named').toContain('hats/ghost.png');
  });

  test('so is a layer it does not have', async ({ page }) => {
    const p = await plan(page, [DOC[4]]);
    expect(p.groups).toEqual([]);
    expect(p.missingLayers, 'named, because this is usually the whole problem')
      .toContain('trousers');
  });

  test('and a test this cannot read is skipped rather than guessed at', async ({ page }) => {
    /* "is not" means the condition holds for every OTHER trait on the layer,
       which is a different and much larger expansion. Refusing it by name beats
       importing something that is nearly right. */
    const p = await plan(page, [DOC[5]]);
    expect(p.groups).toEqual([]);
    expect(p.badOps.join(' '), 'and says which').toContain('is not');
  });

  test('the decide order puts the condition layer before its target', async ({ page }) => {
    /* Without this the rules are still kept, but the wrong side yields: hair
       is painted under a hat so it sits earlier in LAYERS, and the earlier
       layer wins. */
    const p = await plan(page, DOC);
    expect(p.order.indexOf('hats'), 'hats decides before hair')
      .toBeLessThan(p.order.indexOf('hair'));
    expect(p.order.slice().sort(), 'and every layer is in it exactly once')
      .toEqual(LAYERS.slice().sort());
  });

  test('planning writes nothing at all', async ({ page }) => {
    /* THE PROPERTY THAT LETS THE REST OF THIS FILE EXIST. If planning had side
       effects, every test above would be leaving rules behind for the next. */
    const before = await page.evaluate(() => RULES.length);
    await plan(page, DOC);
    const after = await page.evaluate(() => ({ rules: RULES.length, order: DECIDE_ORDER.length }));
    expect(after.rules, 'no rule was added by planning').toBe(before);
    expect(after.order, 'and no order was set').toBe(0);
  });

  test('choosing the file is what actually adds them', async ({ page }) => {
    const r = await importFile(page, DOC);
    expect(r.rules.sort(), 'the two real rules, and nothing else').toEqual([
      'hair/bob|hair/curls|hair/mop|hats/apehead',
      'hair/curls|hair/mop|hats/cap',
    ].sort());
    expect(r.order.indexOf('hats'), 'and the order came with them')
      .toBeLessThan(r.order.indexOf('hair'));
  });

  test('and the report says what it could not do, not just what it did', async ({ page }) => {
    const r = await importFile(page, DOC);
    expect(r.note, 'how many landed').toContain('Added 2 rules');
    expect(r.note, 'the one that allowed everything').toContain('needed no rule');
    expect(r.note, 'the trait that is not here').toContain('hats/ghost.png');
    expect(r.note, 'the layer that is not here').toContain('trousers');
    expect(r.note, 'and the condition it refused to guess at').toContain('skipped');
  });

  test('importing the same file twice adds nothing and says so', async ({ page }) => {
    await importFile(page, DOC);
    const again = await importFile(page, DOC);
    expect(again.rules.length, 'still two rules').toBe(2);
    expect(again.note, 'and it says they were already here').toContain('already here');
    expect(again.note).toContain('Added 0 rules');
  });

  test('a rule made by hand is not destroyed by an import', async ({ page }) => {
    /* LaunchMyNFT's own note says importing REPLACES the rule list. Here that
       would silently throw away work done in this app, so it merges. */
    await page.evaluate(async () => {
      RULES = [['skins/tan', 'hats/beret']];
      await saveRules();
      await renderShelf();
    });
    const r = await importFile(page, DOC);
    expect(r.rules, 'the hand-made rule is still there').toContain('hats/beret|skins/tan');
    expect(r.rules.length, 'alongside the two imported ones').toBe(3);
  });

  test('it matches traits that are still wip, because a rule ignores status', async ({ page }) => {
    /* THE ORDER A PERSON ACTUALLY DOES THIS IN. Importing a folder with no
       approved/ subfolders leaves every trait wip, and approving 233 of them
       is the job you do AFTER checking the rules are right. If the import
       matched only approved traits it would find nothing at the exact moment
       somebody first tries it, and the report would say the layers were
       missing - which would be a lie.

       A rule key is layer/name and carries no status, which is also why a rule
       survives approving the trait it names. */
    await page.evaluate(async () => {
      const traits = (await dbAll()).filter(i => i.kind === 'trait');
      for (const t of traits) {
        await dbDel(t.id);
        await dbPut({ ...t, id: 't_' + t.name + '_' + t.layer + '_wip', status: 'wip' });
      }
      await renderShelf();
    });
    const wip = await page.evaluate(async () =>
      (await dbAll()).filter(i => i.kind === 'trait' && i.status === 'wip').length);
    expect(wip, 'the fixture really is all wip now').toBeGreaterThan(0);
    const r = await importFile(page, [DOC[0]]);
    expect(r.rules, 'the rule was made against the wip traits')
      .toEqual(['hair/bob|hair/curls|hair/mop|hats/apehead']);
  });

  test('a file that is not a rules file is refused, and nothing changes', async ({ page }) => {
    const before = await page.evaluate(() => RULES.length);
    await page.setInputFiles('#rulefile', { name: 'x.json', mimeType: 'application/json',
      buffer: Buffer.from('{"not":"a list"}') });
    await page.waitForFunction(() => {
      const n = document.getElementById('ruleimportnote');
      return n && n.textContent && n.textContent.indexOf('Could not read') === 0;
    }, null, { timeout: 15000 });
    const after = await page.evaluate(() => RULES.length);
    expect(after, 'no rules were added').toBe(before);
  });

  test('a file that matches nothing is not reported as a success', async ({ page }) => {
    /* The likeliest real failure: the right file, a project whose layers are
       not the ones it names. "Added 0 rules" would read as "there was nothing
       to do"; the truth is that the layers are missing. */
    const r = await importFile(page, [DOC[4]]);
    expect(r.note, 'it says nothing was imported').toContain('Nothing to import');
    expect(r.note, 'and which layer is missing').toContain('trousers');
    expect(r.rules.length).toBe(0);
  });
});
