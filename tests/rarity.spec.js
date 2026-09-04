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