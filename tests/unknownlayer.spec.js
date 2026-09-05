/* A trait on a layer this browser has never heard of was downloaded, counted,
   and then shown nowhere.

   The shelf groups by layer and only draws the layers in LAYERS. A record
   whose layer is not in that list belongs to no group, so it gets no card -
   and with no card there is nothing to open, move or delete. cPools builds its
   pools from LAYERS too, so it could not be drawn into a character either.

   THE PATH IS ORDINARY. LAYERS grows from `c.layers` on a pull and
   `doc.layers` on an import - the list the collection or file DECLARES - never
   from the layers the traits are actually on. Those come apart the moment
   somebody renames a layer inside a group: retagLayer moves every trait's row
   to the new name at once, while collections.layers is only rewritten by a
   push. In between, the server holds rows on a layer the collection does not
   list.

   MEASURED, pulling two rows into a browser with the default layer list where
   the collection still declares the old one:

     said               "Loaded 2 items"
     in the store       brim/helmets, tan/skins
     LAYERS has helmets false
     cards on the shelf 1          ("tan")

   The fix is in applyLayers, which runs at the top of every renderShelf with
   every record in hand - so it covers the pull, the import, and anything
   written later. A fix in cloudPull would have covered cloudPull.

   THE CONTROLS ARE MOST OF THIS FILE, because "adopt every layer you see" is
   easy to get too enthusiastic about: a reference has no layer, a trait can
   have a blank one, and the saved draw order is the owner's and must not be
   rewritten by anything arriving.
*/
import { test, expect } from '@playwright/test';

/* Seeds records directly. `layer` is written as given, including nonsense,
   because that is the state being tested. */
const seed = (page, records) => page.evaluate(async (recs) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['backgrounds', 'skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['backgrounds', 'skins', 'unsorted'], hidden: [] });
  for (const r of recs) {
    await dbPut(Object.assign({
      kind: 'trait', blob: new Blob([new Uint8Array(16)]), w: 160, h: 160,
      rarity: 1, at: 1, status: 'approved',
    }, r));
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 400));
  return {
    layers: LAYERS.slice(),
    groups: [...document.querySelectorAll('#projbody .layer h3')]
      .map(h => h.childNodes[0] && h.childNodes[0].textContent),
    cards: document.querySelectorAll('#projbody .item').length,
    poolLayers: Object.keys(cPools()),
  };
}, records);

test.describe('a trait on a layer this browser does not know', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
  });

  test('is on the shelf, in a group of its own', async ({ page }) => {
    const r = await seed(page, [
      { id: 't_tan_skins_approved', name: 'tan', layer: 'skins' },
      { id: 't_brim_helmets_approved', name: 'brim', layer: 'helmets' },
    ]);
    expect(r.cards, 'both traits have a card').toBe(2);
    expect(r.groups, 'and helmets is a heading').toContain('helmets');
  });

  test('and can be drawn into a character', async ({ page }) => {
    // The other half of being invisible: cPools reads LAYERS, so an unadopted
    // layer had no pool and its traits could never come out of Generate.
    const r = await seed(page, [
      { id: 't_tan_skins_approved', name: 'tan', layer: 'skins' },
      { id: 't_brim_helmets_approved', name: 'brim', layer: 'helmets' },
    ]);
    expect(r.poolLayers, 'the compose panel has a row for it').toContain('helmets');
  });

  test('and lands before unsorted, which stays last', async ({ page }) => {
    // unsorted is where loose traits land and is last by convention; an
    // adopted layer after it would make the catch-all draw underneath a real
    // layer.
    const r = await seed(page, [
      { id: 't_brim_helmets_approved', name: 'brim', layer: 'helmets' },
    ]);
    expect(r.layers).toEqual(['backgrounds', 'skins', 'helmets', 'unsorted']);
  });

  test('a layer with several traits on it is added once', async ({ page }) => {
    const r = await seed(page, [
      { id: 't_brim_helmets_approved', name: 'brim', layer: 'helmets' },
      { id: 't_crest_helmets_approved', name: 'crest', layer: 'helmets' },
      { id: 't_visor_helmets_approved', name: 'visor', layer: 'helmets' },
    ]);
    expect(r.layers.filter(l => l === 'helmets').length, 'once, not once per trait').toBe(1);
    expect(r.cards).toBe(3);
  });

  test('the base character does not invent a layer', async ({ page }) => {
    /* A CONTROL. Refs carry no layer, and anything left on one by an older
       write must not turn into a heading with nothing under it. */
    const r = await seed(page, [
      { id: 'ref_hero', kind: 'ref', name: 'hero', layer: 'nonsense' },
      { id: 't_tan_skins_approved', name: 'tan', layer: 'skins' },
    ]);
    expect(r.layers, 'nothing was adopted from the reference')
      .toEqual(['backgrounds', 'skins', 'unsorted']);
  });

  test('and neither does a trait with no layer at all', async ({ page }) => {
    // A CONTROL. A blank layer would become a heading with no name.
    const r = await seed(page, [
      { id: 't_a_blank', name: 'a', layer: '' },
      { id: 't_b_missing', name: 'b' },
    ]);
    expect(r.layers, 'the list is untouched').toEqual(['backgrounds', 'skins', 'unsorted']);
    expect(r.layers.some(l => !l), 'and there is no nameless layer').toBe(false);
  });

  test('the saved draw order is not rewritten by what arrives', async ({ page }) => {
    /* A CONTROL, and the one that would be worst to get wrong: the order is
       the owner's, and a pull rearranging it would silently change how every
       character composites. */
    const r = await seed(page, [
      { id: 't_sky_backgrounds_approved', name: 'sky', layer: 'backgrounds' },
      { id: 't_tan_skins_approved', name: 'tan', layer: 'skins' },
    ]);
    expect(r.layers).toEqual(['backgrounds', 'skins', 'unsorted']);
  });
});
