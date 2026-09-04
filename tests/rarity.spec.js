/* What a rarity weight actually comes to.

   Each trait carries a weight, weightedPick uses it correctly, and both
   Randomise and the sheet go through the same function. All of that already
   worked. None of it was READABLE: the box says 5 and its tooltip says "five
   times as likely", which is true against a sibling weighted 1 and says
   nothing about how often the trait turns up.

   Three numbers decide that and only one is on the tile - the weight, the
   other weights in the layer, and whether the layer appears at all. So the
   share is shown beside the weight.

   The tests that matter here are the ones about WHICH TRAITS COUNT. A share
   computed over a population the generator would not draw from is a
   confident wrong answer, and it would be wrong by exactly the traits someone
   is most likely to be staring at: the rejected one they forgot about, and
   the wip one they have not approved yet.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openAllSections } from './helpers.js';

const BLOCK = new Function('set', 'W', 'H',
  'for (let y = 20; y < 140; y++) for (let x = 20; x < 140; x++) set(x, y, [226, 146, 116]);');

/* Written straight to the shelf store rather than saved through the editor:
   this is about the arithmetic over a set of traits, and driving the editor
   seven times to produce them would be testing the editor. */
async function shelf(page, rows) {
  await page.evaluate(async (list) => {
    for (const r of list) {
      await dbPut({ id: 't_' + r.name, kind: 'trait', name: r.name, layer: r.layer,
                    status: r.status, blob: new Blob([new Uint8Array([0])]),
                    w: 160, h: 160, rarity: r.rarity, at: 1 });
    }
    await renderShelf();
  }, rows);
  await page.waitForTimeout(400);
}

const read = (page) => page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.item')) {
    const n = (el.querySelector('b') || {}).textContent;
    const p = el.querySelector('.pct');
    if (n && p) out[n] = p.textContent;
  }
  return out;
});
const num = (s) => parseFloat(String(s).replace('%', ''));

const HATS = 'hair-headwear';   /* a real layer - an unknown one never renders */

test.describe('what a rarity weight comes to', () => {
  test('a layer sums to its own chance of appearing', async ({ page }) => {
    // The property that makes these a distribution rather than four independent
    // guesses. Weights 5,1,1,1 in a layer left empty 35% of the time.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'gold', layer: HATS, rarity: 5, status: 'approved' },
      { name: 'red', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'blue', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'grey', layer: HATS, rarity: 1, status: 'approved' },
    ]);
    const p = await read(page);
    expect(num(p.gold), 'five of the eight weight, on a layer present 65% of the time').toBeCloseTo(40.6, 0);
    for (const n of ['red', 'blue', 'grey']) expect(num(p[n]), n).toBeCloseTo(8.1, 0);
    const sum = ['gold', 'red', 'blue', 'grey'].reduce((a, n) => a + num(p[n]), 0);
    expect(sum, 'the layer sums to the 65% chance it appears at all').toBeCloseTo(65, 0);
  });

  test('a layer every character has sums to 100%', async ({ page }) => {
    // skins is in ALWAYS_PRESENT, so the empty chance does not apply to it. If
    // this read 65% the empty chance would be being applied to every layer.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'tan', layer: 'skins', rarity: 1, status: 'approved' },
      { name: 'pale', layer: 'skins', rarity: 3, status: 'approved' },
    ]);
    const p = await read(page);
    expect(num(p.tan) + num(p.pale), 'every character has a skin').toBeCloseTo(100, 0);
    expect(num(p.pale), 'three of the four weight').toBeCloseTo(75, 0);
  });

  test('a rejected trait says never, and dilutes nobody', async ({ page }) => {
    // Its weight is the highest in the layer, so if the pool were "every trait
    // in this layer" it would take more than half the share and quietly shrink
    // everything else. It is not a candidate, so it takes none.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'gold', layer: HATS, rarity: 5, status: 'approved' },
      { name: 'red', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'blue', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'grey', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'scrap', layer: HATS, rarity: 9, status: 'rejected' },
    ]);
    const p = await read(page);
    expect(p.scrap, 'rejected is never drawn').toBe('never');
    expect(num(p.gold), 'and the weight of 9 changes nothing').toBeCloseTo(40.6, 0);
  });

  test('a wip trait follows the include-wip box, both ways', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'gold', layer: HATS, rarity: 5, status: 'approved' },
      { name: 'red', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'blue', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'grey', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'draft', layer: HATS, rarity: 1, status: 'wip' },
    ]);
    const off = await read(page);
    expect(off.draft, 'not a candidate while the box is clear').toBe('never');
    expect(num(off.gold), 'and it takes no share from anyone').toBeCloseTo(40.6, 0);

    await page.evaluate(() => { $('cwip').checked = true; $('cwip').dispatchEvent(new Event('change')); });
    await page.waitForTimeout(400);
    const on = await read(page);
    expect(on.draft, 'a candidate now').not.toBe('never');
    // And the answer changes for a real reason: one more candidate in the layer.
    expect(num(on.gold), 'five of nine now, not five of eight').toBeLessThan(num(off.gold));
    expect(num(on.gold)).toBeCloseTo(36.1, 0);
  });

  test('changing how often a layer is empty changes every figure', async ({ page }) => {
    // The empty chance decides all of these and used to redraw none of them.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'gold', layer: HATS, rarity: 5, status: 'approved' },
      { name: 'red', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'blue', layer: HATS, rarity: 1, status: 'approved' },
      { name: 'grey', layer: HATS, rarity: 1, status: 'approved' },
    ]);
    expect(num((await read(page)).gold)).toBeCloseTo(40.6, 0);

    await page.evaluate(() => {
      $('cempty').value = '0';
      $('cempty').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const p = await read(page);
    // 5/8 is 62.5%, and the label rounds anything at or above 10% to a whole
    // number, so it reads 63. Asserting 62.5 here failed by exactly the half
    // percent the rounding introduces - the display is right and the
    // expectation was written against the arithmetic rather than against what
    // the tile promises to show.
    expect(num(p.gold), 'a layer that is never empty gives the raw share').toBe(63);
    // And the rounded figures cannot sum exactly: four values each rounded by
    // up to half a percent. Within three is what the display can promise; the
    // exact identity is asserted in the 35% test above, where the numbers keep
    // their decimals.
    const sum = ['gold', 'red', 'blue', 'grey'].reduce((a, n) => a + num(p[n]), 0);
    expect(Math.abs(sum - 100), 'the layer now fills every character').toBeLessThanOrEqual(3);
  });

  test('a rare trait does not round away to zero', async ({ page }) => {
    // 1 against 99 is 0.65% of characters. Rounding to whole percents would
    // print 1%, and rounding down would print 0% - and "0%" and "never" are
    // different things a rarity system exists to keep apart.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, [
      { name: 'common', layer: HATS, rarity: 99, status: 'approved' },
      { name: 'rare', layer: HATS, rarity: 1, status: 'approved' },
    ]);
    const p = await read(page);
    expect(p.rare, 'a rare trait keeps its decimals').toBe('0.65%');
    expect(p.rare, 'and is not confused with never').not.toBe('never');
  });
});

/* HOW MANY CHARACTERS THE SET CAN MAKE.

   The per-trait shares answer "how often does this one turn up". The question
   that follows is whether there is enough here at all - a set supporting 2,000
   distinct characters cannot mint 10,000, and nothing in the app said so.

   Two numbers: how many are possible, and how many it BEHAVES like once the
   weights are uneven. The second is one over the chance two generated
   characters come out identical - the count of evenly-likely characters that
   would repeat as often as this set does.

   The uniform case is the control. If the second number is not really measuring
   evenly-likely outcomes then it has no reason to land exactly on the first, so
   that equality is what makes the skewed figure worth believing. The fixture is
   built to be checkable by hand: two skins, a layer every character has, and
   three eyes in a layer that can be empty - at a 25% empty chance the four eye
   outcomes are 25% each, so everything is uniform and both numbers are 8. */
test.describe('how many characters the set can make', () => {
  const put = (page, rows) => page.evaluate(async list => {
    for (const r of list) {
      await dbPut({ id: 't_' + r.n, kind: 'trait', name: r.n, layer: r.l, status: r.s || 'approved',
                    blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: r.r, at: 1 });
    }
    await renderShelf();
  }, rows);
  const stats = (page) => page.evaluate(async () => {
    const items = (await dbAll()).filter(i => i.kind === 'trait');
    return comboStats(items, $('cwip').checked);
  });
  const setEmpty = async (page, pct) => {
    await page.evaluate(v => {
      $('cempty').value = String(v);
      $('cempty').dispatchEvent(new Event('input', { bubbles: true }));
    }, pct);
    await page.waitForTimeout(300);
  };
  const UNIFORM = [
    { n: 's1', l: 'skins', r: 1 }, { n: 's2', l: 'skins', r: 1 },
    { n: 'e1', l: 'eyes', r: 1 }, { n: 'e2', l: 'eyes', r: 1 }, { n: 'e3', l: 'eyes', r: 1 },
  ];

  test('with even weights, possible and effective are the same number', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, UNIFORM);
    await setEmpty(page, 25);   // makes the four eye outcomes 25% each
    const s = await stats(page);
    expect(s.distinct, '2 skins x (3 eyes + empty)').toBe(8);
    expect(s.effective, 'evenly likely outcomes behave like their own count').toBeCloseTo(8, 6);
  });

  test('an empty layer is an outcome of its own', async ({ page }) => {
    // Three eyes in a layer that can be empty is four outcomes, not three. A
    // count that ignored it would say 6 here.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, UNIFORM);
    expect((await stats(page)).distinct).toBe(8);
  });

  test('skewing the weights lowers what it behaves like, and says so', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, UNIFORM);
    await setEmpty(page, 25);
    const even = await stats(page);

    await put(page, [{ n: 'e1', l: 'eyes', r: 99 }]);   // one eye takes nearly everything
    await page.waitForTimeout(300);
    const skew = await stats(page);
    expect(skew.distinct, 'the same combinations are still possible').toBe(even.distinct);
    expect(skew.effective, 'but far fewer of them actually happen').toBeLessThan(even.effective / 2);
    // And it is said on screen, which the even case must NOT be - two numbers
    // where there is one fact is how a real warning gets ignored.
    expect(await page.evaluate(() => $('ccount').textContent)).toMatch(/behaving like/);
  });

  test('an even set does not print a second number', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, UNIFORM);
    await setEmpty(page, 25);
    const text = await page.evaluate(() => $('ccount').textContent);
    expect(text, 'the count is there').toMatch(/8 possible characters/);
    expect(text, 'and nothing to explain away').not.toMatch(/behaving like/);
  });

  test('what it behaves like never exceeds what is possible', async ({ page }) => {
    // An impossible claim, and the one an inverted formula would make. Checked
    // across empty chances, because that term enters both numbers differently.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, [...UNIFORM, { n: 'e4', l: 'eyes', r: 40 }, { n: 's3', l: 'skins', r: 7 }]);
    for (const pct of [0, 20, 35, 60, 90]) {
      await setEmpty(page, pct);
      const s = await stats(page);
      expect(s.effective, 'at ' + pct + '% empty').toBeLessThanOrEqual(s.distinct + 1e-9);
      expect(s.effective, 'and at least one character exists').toBeGreaterThanOrEqual(1);
    }
  });

  test('a rejected trait adds no combinations', async ({ page }) => {
    // The same population rule as the shares and the generator. A rejected trait
    // counted here would promise combinations that can never be generated.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, UNIFORM);
    const before = await stats(page);
    await put(page, [{ n: 'junk', l: 'eyes', r: 5, s: 'rejected' }]);
    await page.waitForTimeout(300);
    const after = await stats(page);
    expect(after.distinct, 'rejected work is not part of the collection').toBe(before.distinct);
  });
});

/* THE PREDICTION AND THE GENERATOR, WITH RULES IN PLAY.

   traitChance divided a weight by its layer-mates' weights. randomCombo filters
   each layer against the Never-together rules at pick time. Neither knew about
   the other, so from the first rule onward every printed percentage was wrong.

   Measured over 8000 draws with one rule between crown and mask: the tile said
   43.3% for a trait the generator emitted on 23.3% of characters, and 21.7% for
   one it emitted on 41.8%. The error in points is exactly the product of the two
   printed percentages, so a trait banned against a layer every character carries
   loses ALL of its share while the tile still prints a confident number.

   THE CONTROL IS WHAT MAKES THESE WORTH RUNNING. "The prediction is close to what
   the generator does" passes trivially when the prediction IS the generator, so
   each test also pins that the figure is not the weight-only one - otherwise a
   version that quietly reverted to arithmetic would satisfy every closeness
   assertion and fail nothing. */
test.describe('the prediction agrees with the generator', () => {
  /* The shape shelf() takes: name, layer, status, rarity. I first wrote
     {n,l,r} and every record went in with name and layer undefined, which
     surfaced as "cannot read properties of undefined" rather than as anything
     to do with the question being asked. */
  const A = 'approved';
  const SET = [
    { name: 'tan', layer: 'skins', rarity: 1, status: A },
    { name: 'pale', layer: 'skins', rarity: 3, status: A },
    { name: 'crown', layer: 'hair-headwear', rarity: 5, status: A },
    { name: 'cap', layer: 'hair-headwear', rarity: 1, status: A },
    { name: 'wig', layer: 'hair-headwear', rarity: 1, status: A },
    { name: 'mask', layer: 'masks', rarity: 2, status: A },
    { name: 'veil', layer: 'masks', rarity: 1, status: A },
  ];
  const CROWN = 'hair-headwear/crown', MASK = 'masks/mask', VEIL = 'masks/veil';

  /* Predicted share against the share the generator actually produces. */
  const compare = (page, draws) => page.evaluate(async (n) => {
    const items = (await dbAll()).filter(i => i.kind === 'trait');
    const wip = $('cwip').checked;
    const pred = {};
    for (const t of items) {
      const c = traitChance(t, items, wip);
      if (c.pct !== null) pred[traitKey(t)] = { p: c.pct, est: !!c.estimated };
    }
    const pools = cPools();
    const count = {};
    for (let i = 0; i < n; i++)
      for (const r of randomCombo(pools)) { const k = traitKey(r); count[k] = (count[k] || 0) + 1; }
    const out = {};
    for (const k of Object.keys(pred))
      out[k] = { pred: pred[k].p * 100, act: (count[k] || 0) / n * 100, est: pred[k].est };
    return out;
  }, draws);

  const addRule = async (page, a, b) => {
    await page.evaluate(({ a, b }) => {
      $('rulea').value = a; $('ruleb').value = b;
      return $('ruleadd').onclick();
    }, { a, b });
    await page.waitForTimeout(500);
  };
  const ready = async (page, rows) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await shelf(page, rows);
  };

  test('with no rules it is exact, and says it is not an estimate', async ({ page }) => {
    await ready(page, SET);
    const c = await compare(page, 6000);
    // 2 of 3 in masks, on a layer present 65% of the time.
    expect(c[MASK].pred, 'the arithmetic is exact here').toBeCloseTo(43.33, 1);
    expect(c[MASK].est, 'and no simulation was needed').toBe(false);
    expect(Math.abs(c[MASK].act - c[MASK].pred), 'and the generator agrees').toBeLessThan(2.5);
  });

  test('one rule, and the figure follows the generator instead of the weights', async ({ page }) => {
    await ready(page, SET);
    const before = await compare(page, 6000);
    await addRule(page, CROWN, MASK);
    const after = await compare(page, 6000);

    // THE CONTROL: the weight-only answer has not changed - the weights did not.
    // If the prediction still printed it, this would be 43.3 and the test below
    // would be measuring nothing.
    expect(before[MASK].pred, 'the weight-only figure').toBeCloseTo(43.33, 1);
    expect(after[MASK].pred, 'must not still be the weight-only figure')
      .toBeLessThan(before[MASK].pred - 10);

    // And it must land on what the generator actually does.
    expect(Math.abs(after[MASK].act - after[MASK].pred), 'mask').toBeLessThan(3);
    expect(Math.abs(after[VEIL].act - after[VEIL].pred), 'veil').toBeLessThan(3);
    expect(after[MASK].est, 'and it says it is an estimate').toBe(true);
  });

  test('the trait that gains is right too, not only the one that loses', async ({ page }) => {
    // veil is named in no rule at all, and inherits the banned trait's weight
    // because weightedPick renormalises over whatever list it is handed. A fix
    // that only corrected the banned trait would leave this one wrong by as much.
    await ready(page, SET);
    const before = await compare(page, 4000);
    await addRule(page, CROWN, MASK);
    const after = await compare(page, 6000);
    expect(after[VEIL].pred, 'veil takes the share mask cannot have')
      .toBeGreaterThan(before[VEIL].pred + 10);
    expect(Math.abs(after[VEIL].act - after[VEIL].pred)).toBeLessThan(3);
  });

  test('banned against a layer every character has means zero, and says zero', async ({ page }) => {
    // skins is always present. With one skin, a rule against it removes the
    // partner from every character the generator makes. The old arithmetic
    // printed a confident 33% for a trait that can never appear.
    await ready(page, [
      { name: 'tan', layer: 'skins', rarity: 1, status: 'approved' },
      { name: 'mask', layer: 'masks', rarity: 1, status: 'approved' },
      { name: 'veil', layer: 'masks', rarity: 1, status: 'approved' },
    ]);
    await addRule(page, 'skins/tan', MASK);
    const c = await compare(page, 4000);
    expect(c[MASK].act, 'the generator never emits it').toBe(0);
    expect(c[MASK].pred, 'and the tile agrees').toBeLessThan(0.5);
  });

  test('the same project gives the same figure twice', async ({ page }) => {
    // A simulation redrawn per render would print a different percentage each
    // time nothing changed, which is worse than a wrong number that holds still.
    await ready(page, SET);
    await addRule(page, CROWN, MASK);
    const same = await page.evaluate(async () => {
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const one = items.map(t => traitChance(t, items, false).pct);
      distCache = null;   // force it to run again rather than read the cache
      const two = items.map(t => traitChance(t, items, false).pct);
      return one.every((v, i) => v === two[i]);
    });
    expect(same, 'a seeded estimate does not wander between renders').toBe(true);
  });

  test('reordering the layers changes the figure, because it changes the answer', async ({ page }) => {
    // randomCombo walks LAYERS in order and a rule bites whichever of its pair
    // comes LATER, so moving a layer moves the whole error from one trait to the
    // other. The estimate is cached, and the layer order is part of the cache
    // key for exactly this reason - without it the shelf would keep showing the
    // figures for an order that no longer applies, which is the case where the
    // number moves most and the user is least likely to suspect it.
    await ready(page, SET);
    await addRule(page, CROWN, MASK);
    const before = await compare(page, 2000);

    await page.evaluate(async () => {
      const i = LAYERS.indexOf('masks'), j = LAYERS.indexOf('hair-headwear');
      LAYERS.splice(i, 1); LAYERS.splice(j, 0, 'masks');   // masks now drawn first
      await renderShelf();
    });
    await page.waitForTimeout(400);
    const after = await compare(page, 2000);

    // mask is drawn first now, so it keeps its full share and crown loses instead.
    expect(after[MASK].pred, 'the trait that used to lose now does not')
      .toBeGreaterThan(before[MASK].pred + 10);
    expect(after[CROWN].pred, 'and the one that was exact now pays')
      .toBeLessThan(before[CROWN].pred - 5);
  });

  test('an estimate is marked, an exact figure is not', async ({ page }) => {
    await ready(page, SET);
    const plain = await page.evaluate(() =>
      [...document.querySelectorAll('.item .pct')].map(e => e.textContent).join(' '));
    expect(plain, 'nothing to qualify without a rule').not.toContain('~');
    await addRule(page, CROWN, MASK);
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('.item .pct')].map(e => e.textContent).join(' '));
    expect(marked, 'an estimate says so').toContain('~');
  });
});