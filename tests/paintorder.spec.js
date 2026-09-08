/* Importing a collection file, and taking its paint order from it.

   The v11 handoff ships the same rules in two shapes:

     UPLOAD-TO-PIXELBENCH-v11-317-traits.json   a bare array of 158 rules
     strict-fit-v11-collection.json             { revision, order, names, rules }

   planRuleImport opens with `if(!Array.isArray(docIn)) throw`, so the second
   was refused outright. The only thing that ever read it was the v7 shortcut
   button, and removing that took the last reader with it.

   AND THE ORDER IN IT IS THE PAINT ORDER, which the file says in as many words
   - "Pixelbench layer order (back to front)". The import already sets a DECIDE
   order, but that one is computed from the rules by decideOrderFor(edges) and
   answers a different question: which layer picks first. LAYERS is the paint
   order, nothing had ever set it from a file, and arranging fourteen layers by
   hand is about forty presses of the up and down buttons.

   THE TWO TESTS THAT MATTER are the ones about not losing anything: a layer
   the file does not mention must survive, and a name the file lists that this
   project does not have must not be invented. Getting the first wrong strands
   every trait on that layer.
*/
import { test, expect } from '@playwright/test';

/* The real v11 order, back to front. */
const V11 = ['backgrounds', 'back-extras', 'skins', 'mouth', 'eyes', 'glasses',
  'ears', 'clothing', 'chains', 'costumes', 'extras', 'masks', 'hair', 'hats'];

/* A project whose layers are in the WRONG order on purpose, so a pass cannot
   come from the order already being right.

   RETURNS THE LAYER LIST IT ACTUALLY PRODUCED rather than the one asked for.
   The app keeps an `unsorted` catch-all whatever the seed says, and the first
   version of this file predicted the list instead of reading it - so three
   tests failed against perfectly correct code because the fixture was wrong
   about an existing invariant. */
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
  await saveLayers();
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
  return LAYERS.slice();
}, layers);

/* Hands a parsed document to the importer the way the file input does. */
const importDoc = (page, doc) => page.evaluate(async (d) => {
  const f = new File([JSON.stringify(d)], 'rules.json', { type: 'application/json' });
  await importRuleFile(f);
  return { layers: LAYERS.slice(),
    note: document.getElementById('ruleimportnote').textContent };
}, doc);

/* One real rule, so the import has something to do besides the order. */
const RULES = [{ layer: 'hats', operation: 'is', trait: ['a-hats.png'],
  thenStatements: [{ action: 'hide layer', targetLayer: 'hair', targetTrait: [] }] }];

test.describe('a collection file sets the paint order', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof applyPaintOrder === 'function');
  });

  test('the collection object is read at all', async ({ page }) => {
    /* It was not. "That file is not a list of rules" was the whole response to
       the file the trait records actually ship. */
    await seed(page, V11.slice().reverse());
    const r = await importDoc(page, { revision: 'strict-fit-v11',
      order: V11, names: {}, rules: RULES });
    expect(r.note, 'it did not refuse the shape').not.toContain('not a list of rules');
    expect(r.note).toContain('Added 1 rule');
  });

  test('AND THE LAYERS END UP IN THE FILE ORDER', async ({ page }) => {
    // Seeded reversed, so this cannot pass by the order already being right.
    const was = await seed(page, V11.slice().reverse());
    const r = await importDoc(page, { revision: 'strict-fit-v11',
      order: V11, names: {}, rules: RULES });
    const extra = was.filter(l => V11.indexOf(l) < 0);
    expect(r.layers, 'the file order, then whatever the app keeps beyond it')
      .toEqual(V11.concat(extra));
    expect(r.note).toContain('the paint order is now the file');
  });

  test('a layer the file does not mention is kept, and painted last',
    async ({ page }) => {
      /* THE ONE THAT MATTERS. Dropping it would take every trait on it out of
         the paint, and the project still holds accessories, hair-headwear and
         unsorted from before the v11 taxonomy. */
      const mine = V11.slice().reverse().concat(['accessories', 'unsorted']);
      await seed(page, mine);
      const r = await importDoc(page, { order: V11, rules: RULES });
      expect(r.layers.length, 'nothing was lost').toBe(mine.length);
      expect(r.layers.slice(0, 14), 'the file order comes first').toEqual(V11);
      expect(r.layers.slice(14).sort(), 'and the rest survive')
        .toEqual(['accessories', 'unsorted']);
      expect(r.note).toContain('painted last');
      expect(r.note).toContain('accessories');
    });

  test('and a layer the file names that this project lacks is not invented',
    async ({ page }) => {
      /* The rules import already refuses rules for a missing layer and says to
         import the trait folders first. Creating an empty one here would
         contradict that in the same breath. */
      const was = await seed(page, ['backgrounds', 'skins', 'hats']);
      const r = await importDoc(page, { order: V11, rules: RULES });
      const extra = was.filter(l => V11.indexOf(l) < 0);
      expect(r.layers, 'only what was here, in the file order')
        .toEqual(['backgrounds', 'skins', 'hats'].concat(extra));
      expect(r.layers.length, 'nothing appeared').toBe(was.length);
      expect(r.layers).not.toContain('glasses');
    });

  test('AND THE ORDER APPLIES WHEN NOT ONE RULE DOES', async ({ page }) => {
    /* FOUND BY RUNNING THE REAL FILE, not by reading the code. Importing
       strict-fit-v11-collection.json into a project with the right layers but
       different trait names reported

         "Nothing to import. The file named 0 restrictions and none of them
          applied to a trait in this project."

       and left the layers untouched - because planRuleImport matches rules by
       trait name, so no groups form, and importRuleFile used to return before
       reaching the reorder.

       That return is right about the rules and wrong about the order, and the
       case is not exotic: it is exactly what happens when somebody follows the
       message's own advice and imports the rules before the trait folders. */
    const was = await seed(page, V11.slice().reverse());
    const extra = was.filter(l => V11.indexOf(l) < 0);
    /* Rules naming traits this project does not have, so nothing can match. */
    const foreign = [{ layer: 'hats', operation: 'is', trait: ['SMB Bandana.png'],
      thenStatements: [{ action: 'hide layer', targetLayer: 'hair', targetTrait: [] }] }];
    const r = await importDoc(page, { revision: 'strict-fit-v11',
      order: V11, names: {}, rules: foreign });
    expect(r.note, 'it still says no rule applied').toContain('Nothing to import');
    expect(r.layers, 'and the order was set anyway').toEqual(V11.concat(extra));
    expect(r.note, 'and says so in the same breath').toContain('back to front');
  });

  test('a file with no order leaves the paint order alone', async ({ page }) => {
    /* The control. Without it, "always reorder" passes every test above while
       rearranging a project whose file said nothing about layers. */
    const was = await seed(page, ['hats', 'backgrounds', 'skins']);
    const r = await importDoc(page, RULES);
    expect(r.layers, 'untouched').toEqual(was);
    expect(r.note).not.toContain('the paint order is now');
  });

  test('and importing the same file twice reports the reorder once',
    async ({ page }) => {
      // A no-op that announces itself is a report nobody can trust.
      const was = await seed(page, V11.slice().reverse());
      const extra = was.filter(l => V11.indexOf(l) < 0);
      const first = await importDoc(page, { order: V11, rules: RULES });
      expect(first.note, 'the first one did reorder').toContain('the paint order is now');
      const again = await importDoc(page, { order: V11, rules: RULES });
      expect(again.layers, 'still in the file order').toEqual(V11.concat(extra));
      expect(again.note, 'nothing moved the second time')
        .not.toContain('the paint order is now');
    });

  test('the bare array of rules still imports exactly as it did',
    async ({ page }) => {
      /* The other half of "two shapes, one import". The array form is what the
         Pixelbench upload file uses and it must be untouched by this. */
      await seed(page, ['backgrounds', 'hair', 'hats']);
      const r = await importDoc(page, RULES);
      expect(r.note).toContain('Added 1 rule');
      expect(r.note).not.toContain('not a list of rules');
    });

  test('and something that is neither shape still says what is wrong',
    async ({ page }) => {
      await seed(page, ['backgrounds', 'hats']);
      const r = await importDoc(page, { revision: 'v11', order: V11 });
      expect(r.note, 'the original message, naming the real problem')
        .toContain('not a list of rules');
    });

  test('the real v11 collection file orders a real project', async ({ page }) => {
    /* Against the actual 14 names and the actual order from the handoff,
       rather than a fixture that happens to agree with the code. */
    const was = await seed(page, ['hats', 'hair', 'masks', 'extras', 'costumes',
      'chains', 'clothing', 'ears', 'glasses', 'eyes', 'mouth', 'skins',
      'back-extras', 'backgrounds']);
    const extra = was.filter(l => V11.indexOf(l) < 0);
    const r = await importDoc(page, { revision: 'strict-fit-v11',
      order: V11, names: {}, rules: RULES });
    expect(r.layers, 'the fourteen in the file order').toEqual(V11.concat(extra));
    expect(r.layers[0], 'backgrounds at the back').toBe('backgrounds');
    expect(r.layers[13], 'and hats at the front of the fourteen').toBe('hats');
    expect(r.layers.indexOf('glasses'), 'glasses between eyes and ears')
      .toBe(r.layers.indexOf('eyes') + 1);
  });
});
