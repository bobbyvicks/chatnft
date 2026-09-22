/* THE DEFAULT LAYER LIST IS THE COLLECTION'S.

   The page shipped with backgrounds, skins, clothing, costumes, chains,
   accessories, extras, ears, mouth, eyes, hair-headwear, masks, unsorted. The
   collection has thirteen folders and they are not those: it has glasses,
   hair and hats, and it has never had accessories or hair-headwear. The page
   already knew the right thirteen - PLACEMENT_REF is keyed by exactly them -
   so one file held one vocabulary in one table and contradicted it in another.

   Measured on a fresh page over the 311 working traits, before: 84 printed a
   colour count with no guideline, 3 of 13 categories had no placement
   reference reachable from the layer select, and 13 of the 26 rule edges in
   a shipped rules file were dropped because a rule cannot name a layer the
   page has not got.

   THE TEST THAT CARRIES INFORMATION is the second one. A list asserted
   against a literal pins what somebody typed. Pinning the list against
   PLACEMENT_REF's keys makes the two in-file tables each other's check, so
   neither can drift on its own - that is what turns a decision into a guard. */
import { test, expect } from '@playwright/test';

const COLLECTION = ['backgrounds', 'skins', 'mouth', 'eyes', 'glasses', 'clothing', 'chains',
  'hair', 'hats', 'ears', 'costumes', 'masks', 'extras'];

test.describe('the default vocabulary is the collection\'s', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof ruleColourBudget === 'function');
  });

  test('the default list is the collection\'s thirteen, in its recorded paint order, then the catch-all',
    async ({ page }) => {
      const d = await page.evaluate(() => DEFAULT_LAYERS.slice());
      expect(d).toEqual(COLLECTION.concat(['unsorted']));
    });

  test('AND EVERY ONE OF THEM HAS A PLACEMENT REFERENCE, which the catch-all does not',
    async ({ page }) => {
      const r = await page.evaluate(() => ({
        keys: Object.keys(PLACEMENT_REF).sort(),
        list: DEFAULT_LAYERS.filter(l => l !== 'unsorted').sort(),
      }));
      expect(r.list, 'the two tables name the same categories').toEqual(r.keys);
      expect(r.keys, 'and unsorted is not a category').not.toContain('unsorted');
    });

  test('and every one has a colour guideline, which the catch-all does not', async ({ page }) => {
    const b = await page.evaluate(() => DEFAULT_LAYERS.map(l => [l, ruleColourBudget(l)]));
    for (const [l, n] of b)
      expect(n, l).toBe(l === 'unsorted' ? 0 : (l === 'clothing' ? 8 : 16));
  });

  test('the retired names are gone from every table, not just from the list', async ({ page }) => {
    /* If either name survived in a rule, a placement box or a default, a
       project could still be steered onto a layer the collection does not
       have. Checked table by table rather than by grepping the page text: the
       first draft grepped outerHTML and counted the comments that record the
       retirement, which is prose about the change and not the change. The
       write-time check in patch516 is the one that reads the code with the
       comments stripped. */
    const r = await page.evaluate(() => {
      const tables = {
        DEFAULT_LAYERS: DEFAULT_LAYERS,
        PLACEMENT_REF: Object.keys(PLACEMENT_REF),
        gridExempt: AGRULES_DEFAULT.gridExempt,
        cleanupExcluded: AGRULES_DEFAULT.cleanupExcluded,
        colourBudgetBy: Object.keys(AGRULES_DEFAULT.colourBudgetBy),
        ALWAYS_PRESENT: ALWAYS_PRESENT,
      };
      const out = {};
      for (const k of Object.keys(tables))
        out[k] = tables[k].filter(n => n === 'accessories' || n === 'hair-headwear');
      return out;
    });
    for (const k of Object.keys(r)) expect(r[k], k).toEqual([]);
  });
});
