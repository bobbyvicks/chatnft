/* The paint order when it arrives as a text file.

   The art side's newest upload file - UPLOAD-TO-PIXELBENCH-v12-318-traits.json,
   written the same day as this test - is a bare array of 161 rules with no
   order in it at all. The order ships beside it as a text file, and the app
   answered that file with "Could not read that file: it is not valid JSON".

   The fixture below is the real file, byte for byte, header line and blank
   line included. v12 moves layers against the v11 this project was built on:
   back-extras is gone from the list and ears, costumes, masks and extras have
   all shifted, so this is not a file whose order is already right.

   THE TWO THAT MATTER are the refusals. A list of bare words on their own
   lines is the shape of a great many text files, and one that quietly
   rearranged somebody's layers because they opened the wrong file would be
   worse than the error message it replaces.
*/
import { test, expect } from '@playwright/test';

/* Byte for byte from LAYER-ORDER-v12-318-traits.txt. */
const V12_TEXT = 'Pixelbench layer order (back to front)\n\n'
  + 'backgrounds\nskins\nmouth\neyes\nglasses\nclothing\nchains\nhair\nhats\n'
  + 'ears\ncostumes\nmasks\nextras\n';
const V12 = ['backgrounds', 'skins', 'mouth', 'eyes', 'glasses', 'clothing',
  'chains', 'hair', 'hats', 'ears', 'costumes', 'masks', 'extras'];

/* The v11 order this project is on, which v12 rearranges. */
const V11 = ['backgrounds', 'back-extras', 'skins', 'mouth', 'eyes', 'glasses',
  'ears', 'clothing', 'chains', 'costumes', 'extras', 'masks', 'hair', 'hats'];

/* Returns the layer list it actually produced: the app keeps an `unsorted`
   catch-all whatever the seed says, and predicting the list instead of
   reading it is how an earlier fixture failed three tests against correct
   code. */
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

/* Hands a text file to the same import the file input feeds. */
const importText = (page, body, name) => page.evaluate(async ([b, n]) => {
  const f = new File([b], n, { type: 'text/plain' });
  await importRuleFile(f);
  return { layers: LAYERS.slice(),
    note: document.getElementById('ruleimportnote').textContent,
    /* What the shelf is showing, which is a different question from what
       LAYERS holds. */
    shelf: [...document.querySelectorAll('#proj .layer h3')]
      .map(h => h.firstChild.textContent) };
}, [body, name || 'LAYER-ORDER-v12-318-traits.txt']);

test.describe('a layer order that arrives as a text file', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importRuleFile === 'function');
  });

  test('THE REAL v12 FILE ORDERS A v11 PROJECT', async ({ page }) => {
    const was = await seed(page, V11);
    const r = await importText(page, V12_TEXT);
    expect(r.note, 'it was not refused for not being JSON')
      .not.toContain('Could not read');
    expect(r.layers.slice(0, 13), 'the thirteen in the file order').toEqual(V12);
    expect(r.layers.length, 'nothing was lost').toBe(was.length);
  });

  test('and back-extras, which v12 drops, is kept and painted last',
    async ({ page }) => {
      /* THE ONE THAT MATTERS. This project holds traits on back-extras;
         dropping the layer would take every one of them out of the paint. */
      await seed(page, V11);
      const r = await importText(page, V12_TEXT);
      expect(r.layers.slice(13), 'the ones the file does not mention, last')
        .toEqual(['back-extras', 'unsorted']);
      expect(r.note).toContain('painted last');
      expect(r.note).toContain('back-extras');
    });

  test('AND THE SHELF IS SHOWING THE NEW ORDER, not the old one',
    async ({ page }) => {
      /* The order applying and the screen showing it are two different
         things, and this path used to do only the first. */
      await seed(page, V11);
      const r = await importText(page, V12_TEXT);
      expect(r.shelf.length, 'a heading per layer that has traits').toBe(14);
      expect(r.shelf.slice(0, 13), 'on screen, in the file order').toEqual(V12);
      expect(r.shelf[13]).toBe('back-extras');
    });

  test('a file that is not a layer list still gets the error that names the problem',
    async ({ page }) => {
      /* THE CONTROL. Without it, "try the text path" passes every test above
         while accepting anything at all. */
      const was = await seed(page, V11);
      const r = await importText(page,
        'These are the rules for the collection.\nSee the JSON next to it.\n',
        'README.txt');
      expect(r.note, 'the original message').toContain('Could not read that file');
      expect(r.layers, 'and nothing moved').toEqual(was);
    });

  test('nor does a list that is mostly names this project does not have',
    async ({ page }) => {
      /* Two known names out of five is somebody else's collection, or a text
         file that happens to have some words in it. Half is the line. */
      const was = await seed(page, V11);
      const r = await importText(page,
        'backgrounds\nskins\nalpha\nbeta\ngamma\n', 'other.txt');
      expect(r.note).toContain('Could not read that file');
      expect(r.layers, 'untouched').toEqual(was);
    });

  test('nor is one layer name among strangers, in a project with few layers',
    async ({ page }) => {
      /* WRITTEN TO MAKE A GUARD KILLABLE. In a project holding two layers,
         "most of the project" is one name - so the share tests alone would
         read a file with a single accidental match as a layer order and
         answer a README with "Read notes.txt as a layer order". One name is
         never an order; two is the floor. */
      const was = await seed(page, ['backgrounds']);
      const r = await importText(page,
        'backgrounds\nalpha\nbeta\ngamma\n', 'notes.txt');
      expect(r.note).toContain('Could not read that file');
      expect(r.layers, 'untouched').toEqual(was);
    });

  test('and the same file twice says nothing moved the second time',
    async ({ page }) => {
      // A no-op that announces a change is a report nobody can trust.
      await seed(page, V11);
      const first = await importText(page, V12_TEXT);
      expect(first.note).toContain('The paint order is now');
      const again = await importText(page, V12_TEXT);
      expect(again.note).toContain('Nothing moved');
      expect(again.layers, 'still the file order').toEqual(first.layers);
    });

  test('A PROJECT WITH ONLY SOME OF THE LAYERS IS STILL ORDERED',
    async ({ page }) => {
      /* THE ONE THAT CHANGED THE CODE. The first guard asked that most of the
         FILE be layers this project has, and this project has four of the
         thirteen - so the order was refused until the work it saves had
         already been done by hand. The JSON path accepts this same project
         without complaint, and one order in two formats behaving differently
         is not a rule anybody could hold in their head.

         The other half still holds: the rules import refuses rules for a
         layer this project lacks and says to import the trait folders first,
         so inventing an empty one here would contradict that in the same
         breath. */
      const was = await seed(page, ['backgrounds', 'skins', 'hats', 'eyes']);
      const r = await importText(page, V12_TEXT);
      expect(r.note, 'it was read').not.toContain('Could not read');
      expect(r.layers.length, 'nothing appeared').toBe(was.length);
      expect(r.layers).not.toContain('costumes');
      expect(r.layers.slice(0, 4), 'the four it has, in the file order')
        .toEqual(['backgrounds', 'skins', 'eyes', 'hats']);
    });

  test('but two layer words in a long file is not a layer order',
    async ({ page }) => {
      /* The other side of that line, and the reason it is two tests rather
         than one relaxed guard: this file names a small share of itself AND a
         small share of the project, so neither test passes. */
      const was = await seed(page, V11);
      const r = await importText(page,
        'backgrounds\nskins\nalpha\nbeta\ngamma\ndelta\nepsilon\n', 'notes.txt');
      expect(r.note).toContain('Could not read that file');
      expect(r.layers, 'untouched').toEqual(was);
    });
});
