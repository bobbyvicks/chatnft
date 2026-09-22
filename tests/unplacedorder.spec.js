/* A LAYER ORDER SAYS WHAT IT COULD NOT PLACE.

   applyPaintOrder only orders layers the project already has; a name in the
   file that is not a layer here is dropped. That refusal is right - a paint
   order must not invent layers - and it was silent. Handed the file that ships
   with the collection, LAYER-ORDER-v14-311-traits.txt, a fresh page on the old
   default list printed:

     "The paint order is now the file's (10 layers, back to front). 3 layers it
      does not mention are painted last (accessories, hair-headwear, unsorted)."

   The paint order was NOT the file's: glasses, hair and hats - three of the
   thirteen names the file gave - had been thrown away. Worse than plain
   silence, because the sentence already reports the OTHER direction of the
   same mismatch, so a precise-looking clause about layers hid a dropped one.

   The report names them now, and says what to do. The control is one field
   different: an order naming only layers the project has must not print the
   clause, or a version that always printed it would pass the first test. */
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
  await saveLayers();
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
  return LAYERS.slice();
}, layers);

/* The plain-text order file, one name a line, through the rule-file input -
   the door the collection's own LAYER-ORDER file comes through. */
const orderText = (page, names) => page.evaluate(async (ns) => {
  const f = new File(['Pixelbench layer order (back to front)\n\n' + ns.join('\n') + '\n'],
    'LAYER-ORDER.txt', { type: 'text/plain' });
  await importRuleFile(f);
  return { layers: LAYERS.slice(), note: document.getElementById('ruleimportnote').textContent };
}, names);

/* And the collection-object shape, through the same input. */
const orderDoc = (page, names) => page.evaluate(async (ns) => {
  const doc = { revision: 'x', order: ns, names: {}, rules: [] };
  const f = new File([JSON.stringify(doc)], 'rules.json', { type: 'application/json' });
  await importRuleFile(f);
  return { layers: LAYERS.slice(), note: document.getElementById('ruleimportnote').textContent };
}, names);

test.describe('a paint order names what it could not place', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importRuleFile === 'function' && typeof applyPaintOrder === 'function');
  });

  test('THE TEXT FILE: two names the project has not got are named, with the way out',
    async ({ page }) => {
      await seed(page, ['skins', 'backgrounds', 'eyes', 'unsorted']);
      const r = await orderText(page, ['backgrounds', 'skins', 'eyes', 'glasses', 'hats']);
      expect(r.layers, 'the three it has were ordered').toEqual(['backgrounds', 'skins', 'eyes', 'unsorted']);
      expect(r.note).toContain('3 layers, back to front');
      expect(r.note, 'and the two it dropped are said').toContain('2 names the file gives are not a layer of this project');
      expect(r.note).toContain('glasses, hats');
      expect(r.note, 'with what to do about it').toContain('import the trait folders first');
    });

  test('and the control: an order naming only what the project has says nothing of the kind',
    async ({ page }) => {
      await seed(page, ['skins', 'backgrounds', 'eyes', 'unsorted']);
      const r = await orderText(page, ['backgrounds', 'skins', 'eyes']);
      expect(r.layers).toEqual(['backgrounds', 'skins', 'eyes', 'unsorted']);
      expect(r.note).toContain('3 layers, back to front');
      expect(r.note, 'nothing was dropped, so nothing is said').not.toContain('not a layer of this project');
    });

  test('the collection file says it too, in the same words', async ({ page }) => {
    /* One wording from one function, whichever door. A second phrasing of the
       same fact is how a page comes to hold two verdicts. */
    await seed(page, ['skins', 'backgrounds', 'unsorted']);
    const r = await orderDoc(page, ['backgrounds', 'skins', 'visors']);
    expect(r.layers).toEqual(['backgrounds', 'skins', 'unsorted']);
    expect(r.note).toContain('1 name the file gives is not a layer of this project');
    expect(r.note).toContain('(visors)');
  });

  test('AND NOTHING MOVING DOES NOT HIDE THEM: a file already in the project\'s order still names what it dropped',
    async ({ page }) => {
      /* The case the first draft missed. The two names the project has are
         already in the file's order, so applyPaintOrder used to return null
         before it looked at the third name, and the note said "Nothing moved:
         that is the order this project already has" - about a file naming a
         layer this project has not got. */
      await seed(page, ['skins', 'backgrounds', 'unsorted']);
      const r = await orderText(page, ['skins', 'backgrounds', 'visors']);
      expect(r.layers, 'nothing was invented').toEqual(['skins', 'backgrounds', 'unsorted']);
      expect(r.note, 'it says the order did not move').toContain('The paint order was not changed.');
      expect(r.note, 'and in the singular, what it dropped')
        .toContain('1 name the file gives is not a layer of this project, so it was not created (visors)');
      expect(r.note, 'and not the sentence that hid it').not.toContain('Nothing moved');
    });

  test('and a file that already matches and drops nothing still says nothing moved', async ({ page }) => {
    /* The control for the test above, one name different. */
    await seed(page, ['skins', 'backgrounds', 'unsorted']);
    const r = await orderText(page, ['skins', 'backgrounds']);
    expect(r.note).toContain('Nothing moved: that is the order this project already has.');
    expect(r.note).not.toContain('not a layer of this project');
  });
});
