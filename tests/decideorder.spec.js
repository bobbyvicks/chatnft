/* Layers are DECIDED in one order and PAINTED in another.

   LAYERS is the paint order: buildCombo returns records in it and the paint
   loop draws the array front to back. It was also the order picks were made
   in, and those two jobs disagree.

   buildCombo commits each pick and filters the NEXT layer against what is
   already taken, so the EARLIER layer wins. Hair is painted under a hat, so
   hair sits earlier in LAYERS - which made hair decide first and the hat give
   way. The curated rules this was built for mean the opposite: the hat is the
   choice and the hair yields to it.

   MEASURED on the 51 curated head traits: 41 allow some hair and are unharmed
   either way, but 10 require NO hair at all - an ape head, an exposed brain, a
   hazmat hood. Under the old order those ten could only appear on a character
   that happened to draw no hair, which at the default 35% empty chance is
   about a third of the frequency they were curated for.

   The fixture below is that situation with the noise removed: emptyChance 0,
   so under the paint order the no-hair hat can NEVER be chosen, and under the
   decide order it is chosen freely and the hair is what goes.

   THE CONTROL IS THE FIRST TEST. An empty decide order has to mean the paint
   order exactly - same layers, same sequence, same random draw - or every
   project that has never set one would generate a different collection.
*/
import { test, expect } from '@playwright/test';

/* hair before hats, which is the PAINT order the art requires and the pick
   order that gets it wrong. */
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
  /* The one that needs a bare head - the shape of the ten real ones. */
  await put('apehead', 'hats');
  /* And one that goes with anything, so the hats layer is never empty for a
     reason that has nothing to do with the rule. */
  await put('cap', 'hats');
  await renderShelf();
  /* "At most one of these": the ape head, or a hairstyle, never both. */
  RULES = [['hair/bob', 'hair/curls', 'hats/apehead']];
  await saveRules();
  await renderShelf();
  return LAYERS.join();
}, LAYERS);

const setOrder = (page, order) => page.evaluate(async (o) => {
  DECIDE_ORDER = o.slice();
  await saveDecideOrder();
  await renderShelf();
  return decideOrder().join();
}, order);

/* Draws N characters with every layer forced to fill, and reports what came
   out: how often the bare-head hat was chosen, and whether anything ever
   carried it together with hair. */
const draw = (page, n) => page.evaluate((N) => {
  const was = emptyChance;
  emptyChance = 0;
  distCache = null; distKey = null;
  const pools = cPools();
  let apehead = 0, cap = 0, withHair = 0, bothAtOnce = 0, hairOnly = 0;
  const paintOrders = new Set();
  for (let i = 0; i < N; i++) {
    const combo = randomCombo(pools) || [];
    const keys = combo.filter(r => r && r.kind === 'trait').map(r => r.layer + '/' + r.name);
    const ape = keys.indexOf('hats/apehead') >= 0;
    const hair = keys.some(k => k.indexOf('hair/') === 0);
    if (ape) apehead++;
    if (keys.indexOf('hats/cap') >= 0) cap++;
    if (hair) withHair++;
    if (ape && hair) bothAtOnce++;
    if (hair && keys.indexOf('hats/apehead') < 0 && keys.indexOf('hats/cap') < 0) hairOnly++;
    /* What order the record array actually came back in, by layer. This is the
       paint order and it must never follow the decide order. */
    paintOrders.add(combo.filter(r => r && r.kind === 'trait').map(r => r.layer).join('>'));
  }
  emptyChance = was;
  return { apehead, cap, withHair, bothAtOnce, hairOnly, paintOrders: [...paintOrders] };
}, n);

test.describe('deciding in one order and painting in another', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCombo === 'function');
    await seed(page);
  });

  test('an unset decide order is exactly the paint order', async ({ page }) => {
    /* THE CONTROL. Every project that existed before this has no decide order,
       and must keep generating precisely the collection it did. rnd() is drawn
       once per layer in sequence, so an unchanged order also means an
       unchanged sequence of random numbers, not just an unchanged set. */
    const r = await page.evaluate(() => ({
      decide: decideOrder().join(),
      layers: LAYERS.join(),
      stored: DECIDE_ORDER.length,
    }));
    expect(r.stored, 'nothing has set one').toBe(0);
    expect(r.decide, 'so deciding is painting').toBe(r.layers);
  });

  test('and in that order the bare-head hat can never be chosen', async ({ page }) => {
    /* The defect, at full strength. Hair decides first and always fills, so
       every hair excludes the ape head and the hats layer is left with only
       the cap. The trait is in the collection and cannot come out of it. */
    const r = await draw(page, 400);
    expect(r.withHair, 'hair fills every character here').toBe(400);
    expect(r.apehead, 'and the hat that needs a bare head never appears').toBe(0);
    expect(r.cap, 'while the hat that goes with anything always does').toBe(400);
  });

  test('deciding hats before hair is what lets it appear', async ({ page }) => {
    const order = await setOrder(page, ['skins', 'hats', 'hair', 'unsorted']);
    expect(order, 'the order took').toBe('skins,hats,hair,unsorted');
    const r = await draw(page, 400);
    expect(r.apehead, 'the bare-head hat is now drawn at its own weight').toBeGreaterThan(120);
    expect(r.apehead, 'about half of two hats, not all of them').toBeLessThan(280);
    expect(r.bothAtOnce, 'and never with hair, which is the rule').toBe(0);
  });

  test('the rule holds under both orders, which is the point of the pair above', async ({ page }) => {
    /* Neither order may put the ape head on a head with hair. The orders
       differ in WHICH side yields, never in whether the rule is kept - if this
       failed, the test above would be measuring a broken rule rather than a
       changed one. */
    const before = await draw(page, 300);
    expect(before.bothAtOnce, 'paint order keeps the rule').toBe(0);
    await setOrder(page, ['skins', 'hats', 'hair', 'unsorted']);
    const after = await draw(page, 300);
    expect(after.bothAtOnce, 'decide order keeps it too').toBe(0);
  });

  test('and the character is still PAINTED hair under hat', async ({ page }) => {
    /* THE REGRESSION THIS COULD EASILY CAUSE. buildCombo now chooses in one
       order and must hand the records back in the other: the paint loop draws
       the array front to back, and comboKey joins the ids positionally, so a
       combo returned in decide order would both paint a hat under the hair and
       make one character key as two. */
    await setOrder(page, ['skins', 'hats', 'hair', 'unsorted']);
    const r = await draw(page, 200);
    for (const o of r.paintOrders) {
      const parts = o.split('>');
      const h = parts.indexOf('hair'), t = parts.indexOf('hats');
      if (h >= 0 && t >= 0)
        expect(h, 'hair is painted before the hat in ' + o).toBeLessThan(t);
      expect(parts.indexOf('skins'), 'and skins before both in ' + o).toBe(0);
    }
    expect(r.paintOrders.length, 'the fixture really produced several shapes')
      .toBeGreaterThan(1);
  });

  test('a layer named twice in the order is still visited once', async ({ page }) => {
    /* THE BUG THIS ALMOST SHIPPED WITH, and it had no test until a mutation
       run showed the one below could not catch it - that fixture supplies a
       stale name, not a repeated one.

       decideOrder() used to filter DECIDE_ORDER without de-duplicating, so
       ['hats','hats'] made buildCombo walk the hats layer twice and push a
       second hat onto the same character. That is not a cosmetic bug: "one
       trait per layer" is the premise the whole rule translation rests on. A
       group of one hat and fifteen hairstyles only means "that hat forbids
       those fifteen" BECAUSE two hairstyles can never co-occur. */
    const r = await page.evaluate(async () => {
      DECIDE_ORDER = ['hats', 'hats', 'hair'];
      await saveDecideOrder();
      const order = decideOrder();
      const was = emptyChance;
      emptyChance = 0;
      distCache = null; distKey = null;
      const pools = cPools();
      let worst = 0;
      for (let i = 0; i < 100; i++) {
        const combo = (randomCombo(pools) || []).filter(x => x && x.kind === 'trait');
        const perLayer = {};
        for (const rec of combo) perLayer[rec.layer] = (perLayer[rec.layer] || 0) + 1;
        worst = Math.max(worst, ...Object.values(perLayer));
      }
      emptyChance = was;
      return { order, counts: order.filter(l => l === 'hats').length, worst };
    });
    expect(r.counts, 'hats is walked once, not twice').toBe(1);
    expect(r.order.slice().sort(), 'and the order is still every layer exactly once')
      .toEqual(LAYERS.slice().sort());
    expect(r.worst, 'so no character ever carries two traits of one layer').toBe(1);
  });

  test('a decide order naming a layer that is gone is ignored, not obeyed', async ({ page }) => {
    // Layers are renamed and removed, and a stored order that outlived one must
    // not drop the layers it still names or resurrect the one it does not.
    const r = await page.evaluate(async () => {
      DECIDE_ORDER = ['hats', 'trousers', 'hair'];
      await saveDecideOrder();
      return { order: decideOrder(), layers: LAYERS.slice() };
    });
    expect(r.order, 'the dead name is gone').not.toContain('trousers');
    expect(r.order.slice().sort(), 'and every live layer is still there exactly once')
      .toEqual(r.layers.slice().sort());
    expect(r.order.indexOf('hats'), 'while the order it did name is kept')
      .toBeLessThan(r.order.indexOf('hair'));
  });
});
