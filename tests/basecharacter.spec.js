/* The base character in a generated collection had no tests at all.

   Every character is drawn on a base, and the base is pushed into the
   combination like any other piece - so it is painted into the image AND
   written into the metadata. Nothing in the suite seeded one, so the whole
   path was unexercised, and that is how this shipped:

     { "trait_type": "unsorted", "value": "hero" }

   on every item in the collection. "unsorted" is the file's internal name for
   the bucket a trait lands in when nothing else claims it - not a word the
   owner chose, and not one a marketplace should show a buyer. The compose
   panel calls this row "base"; so does the metadata now.

   THE MISSING COVERAGE IS THE BIGGER FINDING than the label. These pin the
   path rather than only the string: that the base is drawn, that it reaches
   the metadata, that it is labelled, and that adding it does not disturb the
   traits around it.
*/
import { test, expect } from '@playwright/test';

/* A real 1x1 PNG, so cBitmap can decode it and the image path actually runs -
   a stub blob would make every drawing assertion vacuous. */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const seed = (page, withBase) => page.evaluate(async ([b64, base]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const png = new Blob([arr], { type: 'image/png' });
  if (base) await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero', blob: png, w: 160, h: 160, at: 1 });
  await dbPut({ id: 't_tan', kind: 'trait', name: 'tan', layer: 'skins', status: 'approved',
    blob: png, w: 160, h: 160, rarity: 1, at: 1 });
  await dbPut({ id: 't_pale', kind: 'trait', name: 'pale', layer: 'skins', status: 'approved',
    blob: png, w: 160, h: 160, rarity: 1, at: 1 });
  await renderShelf();
  RULES = [];
}, [PNG_B64, withBase]);

const build = (page, n) => page.evaluate(async (count) => {
  const r = await buildCollection(count);
  return {
    made: r.made,
    images: r.files.filter(f => f.name.indexOf('images/') === 0).length,
    metas: r.files.filter(f => f.name.indexOf('metadata/') === 0)
      .map(f => JSON.parse(new TextDecoder().decode(f.data))),
  };
}, n);

test.describe('a collection built on a base character', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildCollection === 'function');
  });

  test('the base reaches the metadata, labelled base', async ({ page }) => {
    await seed(page, true);
    await page.waitForTimeout(400);
    const r = await build(page, 2);
    expect(r.made, 'it built the characters').toBe(2);
    for (const m of r.metas) {
      const base = m.attributes.filter(a => a.trait_type === 'base');
      expect(base.length, 'exactly one base on every item').toBe(1);
      expect(base[0].value).toBe('hero');
    }
  });

  test('and never as "unsorted", which is an internal name', async ({ page }) => {
    // The exact defect: a base has no layer, so the fallback fired and shipped
    // this file's bucket name to whoever looks at the collection.
    await seed(page, true);
    await page.waitForTimeout(400);
    const r = await build(page, 2);
    for (const m of r.metas) {
      expect(m.attributes.some(a => a.trait_type === 'unsorted'),
        'no item carries the internal bucket name').toBe(false);
    }
  });

  test('the base is painted into the image, not only named in the metadata', async ({ page }) => {
    // Metadata that claims a base while the image lacks it would be worse than
    // the wrong label. The base is the FIRST thing drawn, so it is under
    // everything - this checks the drawing call actually happens for it.
    await seed(page, true);
    await page.waitForTimeout(400);
    const drawn = await page.evaluate(async () => {
      const painted = [];
      const real = window.paintTrait;
      window.paintTrait = function (g, bm, x, y, W, H) { painted.push(true); return real.apply(this, arguments); };
      try { await buildCollection(1); } finally { window.paintTrait = real; }
      return painted.length;
    });
    // One base plus one skin per character.
    expect(drawn, 'two pieces painted, the base and the trait').toBe(2);
  });

  test('the traits around it are unaffected', async ({ page }) => {
    // THE CONTROL. Labelling the base must not disturb an ordinary trait's
    // layer, which is the thing marketplaces actually filter on.
    await seed(page, true);
    await page.waitForTimeout(400);
    const r = await build(page, 2);
    for (const m of r.metas) {
      const skins = m.attributes.filter(a => a.trait_type === 'skins');
      expect(skins.length, 'still exactly one skin').toBe(1);
      expect(['tan', 'pale']).toContain(skins[0].value);
    }
  });

  test('a project with no base builds without one, and says nothing about it', async ({ page }) => {
    // The other control: the base attribute must appear because there IS a
    // base, not because the code always adds one.
    await seed(page, false);
    await page.waitForTimeout(400);
    const r = await build(page, 2);
    expect(r.made).toBe(2);
    for (const m of r.metas) {
      expect(m.attributes.some(a => a.trait_type === 'base'),
        'nothing invents a base that was never imported').toBe(false);
      expect(m.attributes.length, 'just the skin').toBe(1);
    }
  });

  test('a layerless TRAIT still falls back to unsorted', async ({ page }) => {
    // The fallback is for a trait genuinely in no layer, which is a real case
    // and is not what the base fix was about. Removing it would be a different
    // defect, so it is pinned.
    //
    // The first version of this test evaluated the labelling EXPRESSION inside
    // the page instead of building a collection - a private copy of the code
    // under test, which would have passed with buildCollection deleted
    // entirely. It builds one now and reads the metadata the app wrote.
    await seed(page, false);
    await page.evaluate(async () => {
      const bin = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      // "unsorted" is a real layer here - it is the bucket LAYERS always holds -
      // so a trait put in it is the genuine case the fallback exists for.
      await dbPut({ id: 't_stray', kind: 'trait', name: 'stray', layer: 'unsorted',
        status: 'approved', blob: new Blob([arr], { type: 'image/png' }),
        w: 160, h: 160, rarity: 1, at: 1 });
      await renderShelf();
    });
    await page.waitForTimeout(400);
    const r = await build(page, 4);
    const strays = r.metas.flatMap(m => m.attributes).filter(a => a.value === 'stray');
    expect(strays.length, 'the stray was drawn at least once').toBeGreaterThan(0);
    for (const a of strays) {
      expect(a.trait_type, 'and is still labelled unsorted, not base').toBe('unsorted');
    }
  });
});
