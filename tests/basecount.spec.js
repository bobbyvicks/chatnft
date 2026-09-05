/* "N possible characters" left the base characters out of the multiplication.

   buildCombo puts a base FIRST in every character - cPools builds a __base
   pool and weightedPick chooses from it - so three base characters make three
   times as many different characters as one. comboStats never saw them: it
   walks items through traitEligible, which opens with
   `if(!t||t.kind!=="trait") return false;`.

   MEASURED. Three base characters, two skins, emptyChance 0:

     the base pool          3
     uniqueCombos produced  6 distinct characters
     comboStats said        2

   All six exist, all six are different, and the screen said two. Ask for six
   and the note reads "Asked for 6 - 2 combinations exist" over a zip holding
   six of them.

   Same defect as the rules one fixed on 09-04, one factor along: the number
   answers a narrower question than the one being asked.

   THE NUMBER IS CHECKED AGAINST THE GENERATOR, not against a constant. A count
   and a generator that are wrong in the same direction would agree with each
   other and with any constant either of them was written from, so the first
   test asserts both the figure and what uniqueCombos actually produces.
*/
import { test, expect } from '@playwright/test';

/* `bases` base characters and two skins, with nothing left empty. Returns what
   the count says and what the generator can actually make. */
const project = (page, bases, opts) => page.evaluate(async (o) => {
  const { baseNames, weights, noTraits, optionalLayer } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = optionalLayer ? ['hats', 'unsorted'] : ['skins', 'unsorted'];
  projectGrid = 160;
  emptyChance = 0;
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: LAYERS.slice(), hidden: [] });
  await dbPut({ id: 'settings.grid', kind: 'settings', cells: 160, at: 1 });
  const mk = async (rgb) => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 160;
    const g = c.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, 160, 160);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  };
  for (let i = 0; i < baseNames.length; i++) {
    const rec = { id: 'ref_' + baseNames[i], kind: 'ref', name: baseNames[i],
      blob: await mk('#204060'), w: 160, h: 160, at: 1 };
    if (weights) rec.rarity = weights[i];
    await dbPut(rec);
  }
  if (!noTraits) {
    /* skins is in ALWAYS_PRESENT and is never left out; hats is optional, which
       is what adds the "+1 for empty" the base must NOT get. */
    const layer = optionalLayer ? 'hats' : 'skins';
    const names = optionalLayer ? ['cap'] : ['tan', 'pale'];
    for (const n of names) {
      await dbPut({ id: 't_' + n + '_' + layer + '_approved', kind: 'trait', name: n,
        layer: layer, status: 'approved', blob: await mk('#c08040'),
        w: 160, h: 160, rarity: 1, at: 1 });
    }
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 700));
  const items = await dbAll();
  const cs = comboStats(items, false);
  const combos = uniqueCombos(cPools(), 40);
  const seen = new Set(combos.map(c => c.map(r => r.id).sort().join('+')));
  return {
    says: cs.distinct,
    effective: cs.effective,
    layers: cs.layers,
    actually: seen.size,
    onScreen: document.getElementById('ccount').textContent.trim(),
    tip: document.getElementById('ccount').title,
  };
}, Object.assign({ baseNames: bases }, opts || {}));

test.describe('how many different characters a set can make', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof comboStats === 'function');
  });

  test('three base characters times two skins is six, and six is what it makes',
    async ({ page }) => {
      const r = await project(page, ['hero', 'villain', 'ghost']);
      expect(r.actually, 'the generator really can make six').toBe(6);
      expect(r.says, 'and the count agrees with it').toBe(6);
      expect(r.onScreen, 'on screen, beside the trait count').toContain('6 possible characters');
    });

  test('one base leaves the count exactly where it was', async ({ page }) => {
    /* A CONTROL. Almost every project has one base, so a fix that moved this
       number would be wrong for nearly everybody. */
    const r = await project(page, ['hero']);
    expect(r.says).toBe(2);
    expect(r.actually).toBe(2);
  });

  test('and so does having none at all', async ({ page }) => {
    const r = await project(page, []);
    expect(r.says).toBe(2);
    expect(r.actually).toBe(2);
  });

  test('a base is never skipped, so it does not gain an empty option', async ({ page }) => {
    /* An optional layer counts pool.length + 1, the +1 being "this layer is
       left out". A character always gets a base, so three bases and one
       optional hat is 3 x 2, not 3 x 2 + 3.

       Only `says` is asserted: the +1 is structural and is counted whatever
       emptyChance is, so what the generator makes at emptyChance 0 is
       deliberately a smaller number and comparing them would be wrong. */
    const r = await project(page, ['hero', 'villain', 'ghost'], { optionalLayer: true });
    expect(r.says).toBe(6);
  });

  test('a project of nothing but base characters still generates', async ({ page }) => {
    // The old guard returned zero when no trait layer had candidates, which
    // reads as "nothing to draw from" over a set that draws three things.
    const r = await project(page, ['hero', 'villain', 'ghost'], { noTraits: true });
    expect(r.says).toBe(3);
    expect(r.actually).toBe(3);
    expect(r.layers, 'and counts as something to draw').toBeGreaterThan(0);
  });

  test('a lopsided base makes characters more alike', async ({ page }) => {
    /* "Behaving like" is the honest figure when the weights are uneven, and it
       would have ignored a whole factor of the draw. */
    const even = await project(page, ['hero', 'villain'], { noTraits: true });
    const skew = await project(page, ['hero', 'villain'],
      { noTraits: true, weights: [99, 1] });
    expect(even.effective, 'two equally likely bases behave like two').toBeCloseTo(2, 5);
    expect(skew.effective, 'and a 99-to-1 split behaves like barely one')
      .toBeLessThan(1.1);
  });

  test('the tooltip says the base is part of the count', async ({ page }) => {
    const r = await project(page, ['hero', 'villain', 'ghost']);
    expect(r.tip).toContain('one base character');
    expect(r.tip, 'the old, narrower sentence is gone')
      .not.toContain('Every combination of one trait per layer, counting');
  });
});
