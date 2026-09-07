/* Putting every trait on the layer and under the name its collection records.

   Asked for as an auto sorter that detects a trait's layer "by either the
   name, location of the trait or something else". It turns out not to need
   detecting: the collection carries current-trait-inventory.json, a list of
   every approved trait with its layer, its PREVIOUS name and a hash. So this
   is a lookup, and a lookup fails by being out of date - visibly - rather than
   by being confidently wrong.

   MEASURED on the live server: 116 approved traits stranded on "unsorted".
   111 are placed by the inventory, 71 of those need renaming as well, and 5
   are not in it. Four of those five are in trait-archive - traits deliberately
   deleted - and the fifth is a proof render. A keyword guesser would have
   filed Ape Head under hats and put removed artwork back into the drawing set.

   THE RENAME IS THE HALF THAT IS EASY TO MISS. 212 of 251 traits were renamed,
   and a rule names a trait as layer/name - so moving "BTC Cap" to hats leaves
   its rule pointing at hats/Bitcoin Cap and still dead. The move and the
   rename have to be one operation, with the rules retargeted.
*/
import { test, expect } from '@playwright/test';

/* A miniature of the real thing: a renamed trait, a plain move, one already
   right, and one the inventory has never heard of. */
const INVENTORY = [
  { layer: 'hats', trait: 'Bitcoin Cap.png', previousName: 'BTC Cap.png' },
  { layer: 'hair', trait: 'Dark Fringe.png', previousName: 'Dark Fringe.png' },
  { layer: 'skins', trait: 'Tanned Skin.png', previousName: 'tanned.png' },
  { layer: 'backgrounds', trait: 'Ball Pit.png' },
];

const seed = (page, rows) => page.evaluate(async (list) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  LAYERS = ['backgrounds', 'skins', 'hair', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: LAYERS, hidden: [], at: 1 });
  for (const r of list) {
    await dbPut({ id: 't_' + r.name + '_' + r.layer + '_' + r.status, kind: 'trait',
      name: r.name, layer: r.layer, status: r.status,
      blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  }
  RULES = []; DECISIONS = [];
  await saveRules();
  await renderShelf();
}, rows);

const plan = (page, inv) => page.evaluate(async (i) => {
  const items = (await dbAll()).filter(x => x.kind === 'trait');
  const p = planSort(items, i);
  return { both: p.both.map(r => r.name + '>' + r.toLayer + '/' + r.toName),
    move: p.move.map(r => r.name + '>' + r.toLayer),
    rename: p.rename.map(r => r.name + '>' + r.toName),
    unknown: p.unknown.map(r => r.name),
    settled: p.settled.map(r => r.name),
    layers: p.layers, collisions: p.collisions };
}, inv);

test.describe('sorting by the inventory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof planSort === 'function');
  });

  test('a renamed trait is moved and renamed as one thing', async ({ page }) => {
    /* The 71-of-111 case. Moving alone leaves the rule pointing at the new
       name and still dead. */
    await seed(page, [{ name: 'BTC Cap', layer: 'unsorted', status: 'approved' }]);
    const p = await plan(page, INVENTORY);
    expect(p.both, 'one operation, not two').toEqual(['BTC Cap>hats/Bitcoin Cap']);
    expect(p.move, 'and not counted as a plain move').toEqual([]);
  });

  test('a trait that only needs a layer is just moved', async ({ page }) => {
    await seed(page, [{ name: 'Dark Fringe', layer: 'unsorted', status: 'approved' }]);
    const p = await plan(page, INVENTORY);
    expect(p.move).toEqual(['Dark Fringe>hair']);
    expect(p.both).toEqual([]);
  });

  test('a trait already where the inventory says is left alone', async ({ page }) => {
    await seed(page, [{ name: 'Dark Fringe', layer: 'hair', status: 'approved' }]);
    const p = await plan(page, INVENTORY);
    expect(p.settled).toEqual(['Dark Fringe']);
    expect(p.both.concat(p.move, p.rename), 'no work at all').toEqual([]);
  });

  test('and one the inventory never mentions is not guessed at', async ({ page }) => {
    /* THE ONE THAT MATTERS MOST. Four of the five real cases are traits that
       were deliberately deleted, and a name-guesser would put them back. */
    await seed(page, [{ name: 'Ape Head', layer: 'unsorted', status: 'approved' }]);
    const p = await plan(page, INVENTORY);
    expect(p.unknown, 'named, and left where it is').toEqual(['Ape Head']);
    expect(p.both.concat(p.move, p.rename), 'nothing proposed for it').toEqual([]);
  });

  test('it names the layers that would have to be created', async ({ page }) => {
    /* Layer order is paint order. Creating hats silently would move the traits
       from painting over everything at unsorted to painting over everything
       somewhere else. */
    await seed(page, [{ name: 'BTC Cap', layer: 'unsorted', status: 'approved' }]);
    const p = await plan(page, INVENTORY);
    expect(p.layers, 'hats does not exist in this project').toEqual(['hats']);
  });

  test('two inventory rows pointing one name at two layers are refused', async ({ page }) => {
    /* There is no answer, and picking one would be a coin toss dressed as a
       lookup. Measured on the real file: 462 keys, zero collisions. */
    await seed(page, [{ name: 'Cap', layer: 'unsorted', status: 'approved' }]);
    const p = await plan(page, [
      { layer: 'hats', trait: 'Cap.png' },
      { layer: 'extras', trait: 'Cap.png' },
    ]);
    expect(p.collisions, 'the ambiguous name is named').toEqual(['cap']);
    expect(p.unknown, 'and the trait is left alone').toEqual(['Cap']);
  });

  test('applying it moves the trait and takes its rules with it', async ({ page }) => {
    /* The whole point. If the rule did not follow, a sort would silently kill
       every rule about the traits it tidied. */
    await seed(page, [
      { name: 'BTC Cap', layer: 'unsorted', status: 'approved' },
      { name: 'Dark Fringe', layer: 'hair', status: 'approved' },
    ]);
    const r = await page.evaluate(async (inv) => {
      RULES = [['unsorted/BTC Cap', 'hair/Dark Fringe']];
      await saveRules();
      const items = (await dbAll()).filter(x => x.kind === 'trait');
      const p = planSort(items, inv);
      const out = await sortApply(p);
      const after = (await dbAll()).filter(x => x.kind === 'trait')
        .map(t => t.layer + '/' + t.name).sort();
      return { out, after, rules: RULES.map(g => g.slice().sort().join('|')), layers: LAYERS };
    }, INVENTORY);
    expect(r.after, 'the trait is on hats under its current name')
      .toEqual(['hair/Dark Fringe', 'hats/Bitcoin Cap']);
    expect(r.rules, 'and the rule followed it').toEqual(['hair/Dark Fringe|hats/Bitcoin Cap']);
    expect(r.out.made, 'the hats layer was created').toBe(1);
    expect(r.layers.indexOf('hats'), 'before unsorted, so it is not last')
      .toBeLessThan(r.layers.indexOf('unsorted'));
  });

  test('and it refuses to overwrite a trait already at the destination', async ({ page }) => {
    /* dbPut overwrites. Without this the move would destroy the trait already
       there and the count would still look right. */
    await seed(page, [
      { name: 'BTC Cap', layer: 'unsorted', status: 'approved' },
      { name: 'Bitcoin Cap', layer: 'hats', status: 'approved' },
    ]);
    const r = await page.evaluate(async (inv) => {
      LAYERS = ['backgrounds', 'skins', 'hair', 'hats', 'unsorted'];
      const items = (await dbAll()).filter(x => x.kind === 'trait');
      const out = await sortApply(planSort(items, inv));
      const after = (await dbAll()).filter(x => x.kind === 'trait')
        .map(t => t.layer + '/' + t.name).sort();
      return { out, after };
    }, INVENTORY);
    expect(r.out.moved, 'nothing was moved').toBe(0);
    expect(r.out.refused.length, 'and it said why').toBe(1);
    expect(r.after, 'both traits are still here').toEqual(['hats/Bitcoin Cap', 'unsorted/BTC Cap']);
  });

  test('planning writes nothing', async ({ page }) => {
    /* The property that lets the plan be shown before it is agreed to. */
    await seed(page, [{ name: 'BTC Cap', layer: 'unsorted', status: 'approved' }]);
    const before = await page.evaluate(async () =>
      (await dbAll()).filter(x => x.kind === 'trait').map(t => t.id).sort());
    await plan(page, INVENTORY);
    const after = await page.evaluate(async () =>
      (await dbAll()).filter(x => x.kind === 'trait').map(t => t.id).sort());
    expect(after, 'nothing moved just by looking').toEqual(before);
  });
});
