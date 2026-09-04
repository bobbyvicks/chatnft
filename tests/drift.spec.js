/* What the collection contains, against what the tile promised.

   Every rarity figure in this app is a per-character probability and is
   correct as one: drawn 2,000 times, a trait weighted 1 against 100 came out
   on 0.95% of characters. A collection is not 2,000 draws - it is a set of
   DISTINCT characters, and distinctness ignores weights. Once the likely
   combinations are used up, the only way to make another different character
   is to reach for a rare trait.

   Measured on skins(common 100, rare 1) x hair-headwear(a, b):

     asked  built  share carrying "rare"    tile said
       6      6            50%                0.99%

   Both numbers are right about their own question. Only one was ever shown,
   and it was the one that does not describe the thing being downloaded.

   The control matters as much as the finding here. A warning that fires on
   every collection is noise nobody reads, so the even-set test is not padding:
   it is the reason the skewed-set test means anything.
*/
import { test, expect } from '@playwright/test';

async function shelf(page, rows) {
  await page.evaluate(async (list) => {
    for (const r of list) {
      await dbPut({ id: 't_' + r.name, kind: 'trait', name: r.name, layer: r.layer,
                    status: 'approved', blob: new Blob([new Uint8Array([0])]),
                    w: 160, h: 160, rarity: r.rarity, at: 1 });
    }
    await renderShelf();
  }, rows);
  await page.waitForTimeout(300);
}

const fresh = async (page) => {
  await page.goto('/index.html');
  await page.waitForTimeout(600);
  await page.evaluate(async () => { await dbClear(); });
};

/* Runs the real generator and the real report, and hands back both. */
const build = (page, n) => page.evaluate(async (count) => {
  const combos = uniqueCombos(cPools(), count);
  const drift = shareDrift(combos, cItems, false);
  return { built: combos.length,
           named: drift.map(d => d.name),
           got: drift.map(d => d.got),
           said: drift.map(d => d.said),
           line: driftLine(drift, combos.length) };
}, n);

test.describe('what the collection actually contains', () => {
  test('a weight the set is too small to carry is named, with both numbers', async ({ page }) => {
    await fresh(page);
    await shelf(page, [
      { name: 'common', layer: 'skins', rarity: 100 },
      { name: 'rare',   layer: 'skins', rarity: 1 },
      { name: 'hats_a', layer: 'hair-headwear', rarity: 1 },
      { name: 'hats_b', layer: 'hair-headwear', rarity: 1 },
    ]);
    const r = await build(page, 60);
    expect(r.built, 'six combinations exist').toBe(6);
    expect(r.named, 'the rare trait is the one that drifted').toEqual(['rare']);
    /* The numbers, not just the name: a sentence naming the right trait and
       printing the wrong share would pass a name-only assertion. */
    expect(r.got[0], 'it is on half the characters').toBeCloseTo(0.5, 5);
    expect(r.said[0], 'and its tile says about 1%').toBeCloseTo(1 / 101, 3);
    expect(r.line).toContain('rare on 50% of them');
    expect(r.line).toContain('though its tile says 0.99%');
  });

  test('and an even set across a roomy space is reported as nothing at all', async ({ page }) => {
    // The control, and the reason the test above means anything: without it,
    // that test passes just as well against a report that fires on every
    // collection ever built.
    //
    // It is run over 60 SEEDED collections rather than one. The first version
    // used a single unseeded draw and was red on 2 runs in 6 - and that flake
    // was the product defect showing through: the rule as first written named a
    // trait in 90 of 300 healthy collections. A control that is itself a coin
    // flip cannot tell anyone that.
    await fresh(page);
    const even = [];
    for (const l of ['skins', 'hair-headwear', 'eyes', 'mouth'])
      for (const n of ['a', 'b', 'c', 'd']) even.push({ name: l + '_' + n, layer: l, rarity: 1 });
    await shelf(page, even);
    const r = await page.evaluate(async () => {
      const bad = [];
      let built = 0;
      for (let s = 0; s < 60; s++) {
        const combos = withSeed(0x1000 + s, () => uniqueCombos(cPools(), 40));
        built = combos.length;
        const drift = shareDrift(combos, cItems, false);
        if (drift.length) bad.push(s + ':' + drift.map(d => d.name).join(','));
      }
      return { built, bad };
    });
    expect(r.built, 'the space is roomy enough to fill the order').toBe(40);
    expect(r.bad, 'no healthy collection is warned about').toEqual([]);
  });

  test('a trait that never made it into the collection is named too', async ({ page }) => {
    // The other direction. A trait promised half the collection and absent
    // from all of it is the same defect seen from the other side, and a
    // ratio computed as got/said would divide by zero and skip it.
    await fresh(page);
    // Two layers, not one: with a single layer of two, removing every combo
    // carrying "gone" leaves ONE character, and the report refuses a sample of
    // one - correctly. The first version of this test had that fixture and
    // failed for that reason rather than for the reason it was written.
    await shelf(page, [
      { name: 'kept', layer: 'skins', rarity: 1 },
      { name: 'gone', layer: 'skins', rarity: 1 },
      { name: 'eye_a', layer: 'eyes', rarity: 1 },
      { name: 'eye_b', layer: 'eyes', rarity: 1 },
      { name: 'mouth_a', layer: 'mouth', rarity: 1 },
      { name: 'mouth_b', layer: 'mouth', rarity: 1 },
      { name: 'hat_a', layer: 'hair-headwear', rarity: 1 },
      { name: 'hat_b', layer: 'hair-headwear', rarity: 1 },
    ]);
    const r = await page.evaluate(async () => {
      // One combination held back, standing in for a trait the draw never
      // reached - built by hand so the case is exact rather than hoped for.
      const pools = cPools();
      const all = withSeed(7, () => uniqueCombos(pools, 60));
      const kept = all.filter(c => !c.some(t => t.name === 'gone'));
      const drift = shareDrift(kept, cItems, false);
      return { n: kept.length, named: drift.map(d => d.name), got: drift.map(d => d.got) };
    });
    expect(r.n, 'something was kept to measure').toBeGreaterThan(1);
    expect(r.named, 'the absent trait is the one named').toEqual(['gone']);
    expect(r.got[0], 'at nothing at all').toBe(0);
  });

  test('a gap too small to act on stays quiet however certain it is', async ({ page }) => {
    // The floor, which nothing else here covers. Sigma shrinks as a collection
    // grows, so on a big enough set a one-point difference is many standard
    // deviations out and still one point - certain and useless. Without the
    // floor the report would start naming those.
    //
    // The first version of this test did the arithmetic in the spec instead of
    // calling the page, so it would have passed just as happily against a page
    // that dropped the floor entirely. A private copy of a formula tests the
    // copy. This drives the real shareDrift.
    await fresh(page);
    await shelf(page, [
      { name: 'plain', layer: 'skins', rarity: 97 },
      { name: 'scarce', layer: 'skins', rarity: 3 },
    ]);
    const r = await page.evaluate(async () => {
      // Ten thousand characters built by hand rather than drawn: the point is a
      // known share over a large n, and drawing it would take a minute and give
      // a number that moves.
      const plain = cItems.find(t => t.name === 'plain');
      const scarce = cItems.find(t => t.name === 'scarce');
      const said = traitChance(scarce, cItems, false).pct;
      const N = 10000, carrying = 1200;   // 12% built against 3% promised
      const combos = [];
      for (let i = 0; i < N; i++) combos.push([i < carrying ? scarce : plain]);
      const drift = shareDrift(combos, cItems, false);
      return { said, got: carrying / N, named: drift.map(d => d.name) };
    });
    expect(r.said, 'scarce is promised 3%').toBeCloseTo(0.03, 4);
    expect(r.got, 'and built at 12%').toBeCloseTo(0.12, 6);
    // Four times over and about sixteen sigma out - certain, and nine points.
    expect(r.named, 'so the floor keeps it quiet').toEqual([]);
  });

  test('but the same ratio with real substance behind it is named', async ({ page }) => {
    // The positive control for the test above, differing in ONE thing: the size
    // of the gap. Without it, that test passes against a report that says
    // nothing at all about a ten-thousand character collection.
    await fresh(page);
    await shelf(page, [
      { name: 'plain', layer: 'skins', rarity: 95 },
      { name: 'scarce', layer: 'skins', rarity: 5 },
    ]);
    const r = await page.evaluate(async () => {
      const plain = cItems.find(t => t.name === 'plain');
      const scarce = cItems.find(t => t.name === 'scarce');
      const said = traitChance(scarce, cItems, false).pct;
      const N = 10000, carrying = 2000;   // 20% built against 5% promised
      const combos = [];
      for (let i = 0; i < N; i++) combos.push([i < carrying ? scarce : plain]);
      return { said, named: shareDrift(combos, cItems, false).map(d => d.name) };
    });
    expect(r.said, 'scarce is promised 5%').toBeCloseTo(0.05, 4);
    expect(r.named, 'fifteen points is worth saying').toContain('scarce');
  });

  test('the report is quiet when there is nothing to compare', async ({ page }) => {
    // One character has no distribution, and a report that divides by it would
    // print a confident figure about a sample of one.
    await fresh(page);
    await shelf(page, [{ name: 'only', layer: 'skins', rarity: 1 }]);
    const r = await build(page, 1);
    expect(r.named).toEqual([]);
    expect(r.line).toBe('');
  });
});
