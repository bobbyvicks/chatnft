/* THE SHELF STOPS REBUILDING WHAT HAS NOT CHANGED.

   Two things ran in full on every shelf gesture and both get worse with the
   number of rules. Measured at 324 traits over the 13 default layers, timing a
   second renderShelf():

     rules     per gesture     DOM nodes     <option> in #rulelist
        0          24 ms           9,381                  0
      158         242 ms          61,205             51,034
      298         408 ms         107,125             96,254

   and after: 23 ms, 55 ms, 97 ms. buildRules and legalFraction themselves drop
   to 0.1 ms and 0.2 ms when nothing has moved; what is left is the shelf
   drawing 324 tiles.

   THE ASSERTIONS HERE ARE NOT TIMINGS. A wall clock in a test is a flake
   waiting to happen, and worse, a fast-but-wrong cache passes one. So the work
   is counted instead - rows built, and draws taken from the random source -
   and every "it was skipped" test is paired with one that says it still
   happens when it should, plus a control that the numbers on screen did not
   change.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'eyes', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'eyes', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  let n = 0;
  for (const l of ['skins', 'hats', 'eyes']) {
    for (let i = 0; i < 4; i++, n++) {
      await dbPut({ id: 't_' + l + i + '_' + l + '_approved', kind: 'trait',
        name: l + i, layer: l, status: 'approved', blob, w: 16, h: 16,
        rarity: 1, at: 1000, shelfOrder: n });
    }
  }
  RULES = [['hats/hats0', 'skins/skins0'].sort(), ['eyes/eyes1', 'hats/hats1'].sort()];
  await saveRules();
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

/* How many rule rows were BUILT during fn, rather than how many exist. The
   rows are rebuilt from scratch when they are rebuilt at all, so a fresh
   element in the same place is the signal. */
const rowsBuilt = (page, fn) => page.evaluate(async (src) => {
  const before = [...$('rulelist').children];
  await eval('(' + src + ')()');
  const after = [...$('rulelist').children];
  let fresh = 0;
  for (const el of after) if (before.indexOf(el) < 0) fresh++;
  return fresh;
}, fn);

/* How many draws the simulation took. legalFraction is the only thing in a
   shelf render that pulls thousands of numbers out of the seeded source, so
   counting them says whether it ran without timing anything. */
const drawsDuring = (page, fn) => page.evaluate(async (src) => {
  const real = window.rnd;
  let n = 0;
  window.rnd = function () { n++; return real.apply(this, arguments); };
  try { await eval('(' + src + ')()'); } finally { window.rnd = real; }
  return n;
}, fn);

test.describe('the shelf stops rebuilding what has not changed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
  });

  test('A SECOND RENDER BUILDS NO RULE ROWS', async ({ page }) => {
    expect(await rowsBuilt(page, `async () => { await renderShelf(); }`)).toBe(0);
  });

  test('but adding a rule rebuilds them', async ({ page }) => {
    /* Without this the test above is satisfied by a buildRules that never
       builds anything at all. */
    const fresh = await rowsBuilt(page, `async () => {
      RULES = RULES.concat([['eyes/eyes2','skins/skins2'].sort()]);
      await saveRules();
      await renderShelf();
    }`);
    expect(fresh).toBe(3);
  });

  test('and so does renaming a trait the rules can name', async ({ page }) => {
    /* The other half of the signature. The rows carry a picker holding every
       trait key in the project, so a changed set of traits changes what they
       should show even when RULES is untouched. */
    const fresh = await rowsBuilt(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_eyes3_eyes_approved');
      await dbDel(rec.id);
      await dbPut(Object.assign({}, rec, { id: 't_eyes9_eyes_approved', name: 'eyes9' }));
      await renderShelf();
    }`);
    expect(fresh).toBe(2);
  });

  test('AND A LIST EMPTIED BEHIND ITS BACK IS BUILT AGAIN', async ({ page }) => {
    /* The skip has to be able to notice it is wrong. A signature that outlived
       the DOM it describes would leave the rules panel blank for good, and
       nothing else on the page would say why. */
    const fresh = await rowsBuilt(page, `async () => {
      $('rulelist').innerHTML = '';
      await renderShelf();
    }`);
    expect(fresh).toBe(2);
  });

  test('A SECOND RENDER TAKES NO DRAWS', async ({ page }) => {
    expect(await drawsDuring(page, `async () => { await renderShelf(); }`)).toBe(0);
  });

  test('but a changed rule set is simulated again', async ({ page }) => {
    const n = await drawsDuring(page, `async () => {
      RULES = RULES.concat([['eyes/eyes2','skins/skins2'].sort()]);
      await saveRules();
      await renderShelf();
    }`);
    expect(n).toBeGreaterThan(1000);
  });

  test('and so is a changed set of traits', async ({ page }) => {
    /* The pools are the other input. A memo keyed on RULES alone would answer
       for a collection that no longer exists. */
    const n = await drawsDuring(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_eyes3_eyes_approved');
      await dbDel(rec.id);
      await renderShelf();
    }`);
    expect(n).toBeGreaterThan(1000);
  });

  test('and the number on screen is the same either way - the control',
    async ({ page }) => {
      /* Speed traded for a wrong answer would pass every test above. The count
         is read from the panel after a cold run and after a cached one. */
      const out = await page.evaluate(async () => {
        const read = () => $('cpossible') ? $('cpossible').textContent
          : $('compose').textContent.replace(/\s+/g, ' ');
        legalCache = null; legalKey = '';
        await renderShelf();
        const cold = read();
        await renderShelf();
        const cached = read();
        /* And once more with the memo deliberately dropped, to be sure the
           cold reading above was not itself served from one. */
        legalCache = null; legalKey = '';
        await renderShelf();
        return { cold, cached, again: read() };
      });
      expect(out.cached).toBe(out.cold);
      expect(out.again).toBe(out.cold);
      expect(out.cold.length, 'and it says something').toBeGreaterThan(0);
    });
});
