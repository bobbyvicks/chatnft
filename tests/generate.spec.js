/* The sheet draws different characters, and says so when it cannot.

   It used to take n independent draws with no memory, so on a small or skewed
   set the same character turned up two or three times in one sheet - on the
   screen whose whole job is showing what the set produces. It read as bad
   luck rather than as the set having fewer combinations than expected.

   The control here is the LAST test. Randomise draws one character at a time
   and must still be free to repeat itself - a person pressing it twice and
   getting the same character is a set being small, not a bug, and giving that
   path memory would make it silently refuse to show a common combination
   twice. It would be easy to apply the dedup one layer too high and nothing
   else would notice.
*/
import { test, expect } from '@playwright/test';
import { openTrait, openAllSections } from './helpers.js';

const BLOCK = new Function('set', 'W', 'H',
  'for (let y = 20; y < 140; y++) for (let x = 20; x < 140; x++) set(x, y, [226, 146, 116]);');

/* REAL PNGs. A one-byte placeholder is enough for arithmetic over records, but
   the sheet decodes every blob to draw it, and a fake one fails with "The
   source image could not be decoded" - which is the fixture breaking, not the
   code, and reads exactly like the code breaking. */
const put = (page, rows) => page.evaluate(async list => {
  const png = async (hue) => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + hue + ',70%,55%)';
    g.fillRect(20, 20, 120, 120);
    return await new Promise(res => c.toBlob(res, 'image/png'));
  };
  let i = 0;
  for (const r of list) {
    await dbPut({ id: 't_' + r.n, kind: 'trait', name: r.n, layer: r.l, status: 'approved',
                  blob: await png((i++ * 47) % 360), w: 160, h: 160, rarity: r.r || 1, at: 1 });
  }
  await renderShelf();
}, rows);

/* Two skins and three eyes, the eyes able to be left empty: 2 x 4 = 8. Small
   enough to ask for more than exists, and hand-checkable. */
const EIGHT = [
  { n: 's1', l: 'skins' }, { n: 's2', l: 'skins' },
  { n: 'e1', l: 'eyes' }, { n: 'e2', l: 'eyes' }, { n: 'e3', l: 'eyes' },
];

const note = (page) => page.evaluate(() => $('cnote').textContent);

test.describe('generating a sheet', () => {
  test('asks for twelve, draws every different character there is, and says why', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, EIGHT);
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => {
      const c = uniqueCombos(cPools(), 12);
      return { n: c.length, distinct: new Set(c.map(comboKey)).size };
    });
    expect(got.n, 'the set holds exactly eight characters').toBe(8);
    expect(got.distinct, 'and every one drawn is different').toBe(8);

    await page.evaluate(() => drawSheet(12));
    await page.waitForTimeout(700);
    const said = await note(page);
    expect(said, 'it reports what it drew, not what was asked').toMatch(/^8 different characters/);
    expect(said, 'and says the set was the limit').toContain('could only give 8');
    expect(said, 'with the reason beside it').toContain('8 combinations exist');
  });

  test('a set that can supply twelve gets twelve, with nothing to explain', async ({ page }) => {
    // The silence case. A shortfall note on a healthy set is noise, and noise
    // is how the real one comes to be ignored.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, [...EIGHT, ...Array.from({ length: 12 }, (_, i) => ({ n: 'c' + i, l: 'clothing' }))]);
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => {
      const c = uniqueCombos(cPools(), 12);
      return { n: c.length, distinct: new Set(c.map(comboKey)).size };
    });
    expect(got.n).toBe(12);
    expect(got.distinct, 'all twelve differ').toBe(12);

    await page.evaluate(() => drawSheet(12));
    await page.waitForTimeout(700);
    const said = await note(page);
    expect(said).toMatch(/^12 different characters/);
    expect(said, 'nothing to apologise for').not.toContain('could only give');
  });

  test('a heavily skewed set still returns different characters, not the same one repeatedly', async ({ page }) => {
    // Where the old draw was worst. One eye at weight 99 means nearly every
    // independent draw picks it, so twelve memoryless draws produced a handful
    // of characters over and over.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, [
      { n: 's1', l: 'skins', r: 99 }, { n: 's2', l: 'skins', r: 1 },
      { n: 'e1', l: 'eyes', r: 99 }, { n: 'e2', l: 'eyes', r: 1 }, { n: 'e3', l: 'eyes', r: 1 },
    ]);
    await page.waitForTimeout(300);
    const got = await page.evaluate(() => {
      const c = uniqueCombos(cPools(), 8);
      return { n: c.length, distinct: new Set(c.map(comboKey)).size };
    });
    expect(got.distinct, 'no repeats however unlikely the rest are').toBe(got.n);
    // It finds about as many as the set BEHAVES like, not as many as exist, and
    // that is right rather than a shortfall. With 99 against 1 in both layers the
    // rarest combination has a probability around 6 in 100,000, so a bounded
    // sampler will not reach it - and a sheet showing the characters this set
    // will actually produce is what the sheet is for. I predicted more than four
    // here and got exactly four; the number was a guess, the behaviour was not.
    expect(got.n, 'it still finds several, not one').toBeGreaterThanOrEqual(2);
    const cs = await page.evaluate(async () =>
      comboStats((await dbAll()).filter(i => i.kind === 'trait'), false));
    expect(got.n, 'and lands near what the weights say it behaves like')
      .toBeLessThanOrEqual(Math.ceil(cs.distinct));
  });

  test('one character at a time is still allowed to repeat', async ({ page }) => {
    // THE CONTROL. randomCombo backs Randomise, which draws one character; a
    // person pressing it twice on a small set SHOULD sometimes see the same
    // one, because that is the set being small. Giving that path memory would
    // make it quietly refuse to show a common combination twice, and nothing
    // else in the suite would notice.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, [{ n: 's1', l: 'skins' }]);   // exactly one character exists
    await page.waitForTimeout(300);
    const keys = await page.evaluate(() => {
      const pools = cPools();
      return Array.from({ length: 6 }, () => comboKey(randomCombo(pools)));
    });
    expect(new Set(keys).size, 'one character drawn six times is the same one six times').toBe(1);
    expect(keys.every(k => k.length > 0), 'and it really did draw something each time').toBe(true);
  });
});

/* THE GENERATED COLLECTION.

   Everything needed had been here a while and none of it was joined up: the
   only things that came out of this app were one composed character or a
   picture of twelve side by side. The set a mint actually consumes - the
   images AND the metadata saying which traits each one carries - could not be
   produced at all.

   The metadata is what to test hardest. A wrong image is visible; wrong
   metadata is a folder that looks perfect and describes the wrong characters,
   and nobody finds out until a marketplace renders the traits. */
test.describe('the generated collection', () => {
  const build = (page, n) => page.evaluate(async count => {
    const res = await buildCollection(count, null);
    const dec = new TextDecoder();
    return {
      made: res.made, asked: res.asked,
      names: res.files.map(f => f.name),
      metas: res.files.filter(f => f.name.startsWith('metadata/'))
        .map(f => JSON.parse(dec.decode(f.data))),
      pngHeaders: res.files.filter(f => f.name.startsWith('images/'))
        .map(f => f.data[0] === 0x89 && f.data[1] === 0x50 && f.data[2] === 0x4e && f.data[3] === 0x47),
      imageBytes: res.files.filter(f => f.name.startsWith('images/')).map(f => f.data.length),
    };
  }, n);

  const SET = [
    { n: 'tan', l: 'skins' }, { n: 'pale', l: 'skins' },
    { n: 'crown', l: 'hair-headwear' }, { n: 'cap', l: 'hair-headwear' }, { n: 'wig', l: 'hair-headwear' },
    { n: 'tee', l: 'clothing' }, { n: 'coat', l: 'clothing' },
  ];

  test('every image has its metadata, and nothing is orphaned', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, SET);
    await page.waitForTimeout(300);
    const r = await build(page, 12);
    expect(r.made, 'this set holds far more than twelve').toBe(12);
    expect(r.names.length, 'one image and one metadata file each').toBe(24);
    const imgs = r.names.filter(n => n.startsWith('images/')).map(n => n.slice(7, -4));
    const meta = r.names.filter(n => n.startsWith('metadata/')).map(n => n.slice(9, -5));
    expect(imgs, 'the two folders use the same indices').toEqual(meta);
    expect(new Set(r.names).size, 'no name is written twice').toBe(r.names.length);
  });

  test('the images are real PNGs with something drawn in them', async ({ page }) => {
    // A zip of empty or malformed files would pass every naming check above.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, SET);
    await page.waitForTimeout(300);
    const r = await build(page, 6);
    expect(r.pngHeaders.every(Boolean), 'every file starts with the PNG signature').toBe(true);
    expect(Math.min(...r.imageBytes), 'and none is an empty stub').toBeGreaterThan(100);
  });

  test('the metadata names the layer and the trait', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, SET);
    await page.waitForTimeout(300);
    const r = await build(page, 12);
    const names = new Set(SET.map(s => s.n));
    const layers = new Set(SET.map(s => s.l));
    for (const m of r.metas) {
      expect(Array.isArray(m.attributes), 'attributes is a list').toBe(true);
      expect(m.image, 'the image names the file beside it').toMatch(/^\d+\.png$/);
      for (const a of m.attributes) {
        expect(layers.has(a.trait_type), 'trait_type is a layer: ' + a.trait_type).toBe(true);
        expect(names.has(a.value), 'value is a trait name: ' + a.value).toBe(true);
      }
    }
    // Skins is always present, so every character must carry one.
    for (const m of r.metas) {
      expect(m.attributes.some(a => a.trait_type === 'skins'), 'every character has a skin').toBe(true);
    }
  });

  test('a layer left empty is absent, not an attribute with no value', async ({ page }) => {
    // "Hair: " on four hundred items is worse than showing nothing at all, and
    // an empty layer is common - it is what makes characters differ.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, SET);
    await page.waitForTimeout(300);
    const r = await build(page, 12);
    for (const m of r.metas) {
      for (const a of m.attributes) {
        expect(a.value, 'no attribute may carry an empty value').toBeTruthy();
        expect(a.trait_type, 'nor an empty layer').toBeTruthy();
      }
    }
    // And the fixture really does produce some - otherwise this proves nothing.
    const counts = r.metas.map(m => m.attributes.length);
    expect(Math.min(...counts), 'some character came out with a layer empty')
      .toBeLessThan(Math.max(...counts));
  });

  test('the indices are padded so a listing sorts in order', async ({ page }) => {
    // Unpadded, a directory sorts 1, 10, 11, 2 - and the file a person opens
    // first is not the character they think it is.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, SET);
    await page.waitForTimeout(300);
    const r = await build(page, 12);
    const imgs = r.names.filter(n => n.startsWith('images/'));
    expect(imgs.slice().sort(), 'sorted order is generation order').toEqual(imgs);
    expect(imgs[0], 'and the first is padded to the width of the last').toBe('images/01.png');
  });

  test('asking for more than the set holds returns what exists', async ({ page }) => {
    // The same fact the sheet reports: a limit of the set, not a failure.
    await openTrait(page, { w: 160, h: 160, draw: BLOCK });
    await openAllSections(page);
    await put(page, [{ n: 'tan', l: 'skins' }, { n: 'pale', l: 'skins' }]);
    await page.waitForTimeout(300);
    const r = await build(page, 50);
    expect(r.asked, 'it remembers what was asked').toBe(50);
    expect(r.made, 'two skins and nothing else is two characters').toBe(2);
    expect(r.names.length, 'and the files match what was made').toBe(4);
  });
});