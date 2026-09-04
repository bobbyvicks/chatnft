import { test, expect } from '@playwright/test';
import { openTrait, openAllSections, art, picked, pickSwatch, setField } from './helpers.js';

/* Three bands of flat colour. Distinct enough that palette() keeps them apart -
   it merges anything closer than about 40 - so the swatches are predictable. */
const bands = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    set(x, y, y < H / 3 ? [255, 0, 0] : y < (2 * H) / 3 ? [0, 255, 0] : [0, 0, 255]);
};

test.describe('erase a colour', () => {
  test('removes it completely and leaves nothing behind', async ({ page }) => {
    const errors = await openTrait(page, { w: 60, h: 60, draw: bands });
    await openAllSections(page);
    const greenBefore = await art.colour(page, [0, 255, 0]);
    const redBefore = await art.colour(page, [255, 0, 0]);
    expect(greenBefore).toBeGreaterThan(0);

    await pickSwatch(page, 1);            // the green band
    await page.click('#rcerase');
    await page.waitForTimeout(300);

    expect(await art.colour(page, [0, 255, 0]), 'the colour must be gone').toBe(0);
    expect(await art.empty(page), 'exactly that many cells become empty').toBe(greenBefore);
    expect(await art.colour(page, [255, 0, 0]), 'other colours untouched').toBe(redBefore);
    expect(await art.stale(page), 'no colour left behind the transparency').toBe(0);
    expect(errors).toEqual([]);
  });

  test('Replace still fills opaque - the control', async ({ page }) => {
    /* Without this, "erase leaves nothing" could equally mean recolour is
       broken and writes nothing at all. */
    await openTrait(page, { w: 60, h: 60, draw: bands });
    await openAllSections(page);
    const greenBefore = await art.colour(page, [0, 255, 0]);
    await page.evaluate(() => setColor('#ffcc00'));
    await pickSwatch(page, 1);
    await page.click('#rcgo');
    await page.waitForTimeout(300);
    expect(await art.colour(page, [0, 255, 0])).toBe(0);
    expect(await art.colour(page, [255, 204, 0]), 'became the new colour').toBe(greenBefore);
    expect(await art.empty(page), 'Replace must not punch holes').toBe(0);
  });

  test('include near shades reaches a soft edge that exact matching cannot', async ({ page }) => {
    /* Canvas stores premultiplied alpha, so a semi-transparent pixel's RGB does
       not survive a round trip and an exact match can never find it again. The
       tolerance is the answer, and this pins that it still works. */
    await openTrait(page, {
      w: 80, h: 80,
      draw: (set) => {
        for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
          const r = Math.hypot(x - 40, y - 40);
          if (r < 24) set(x, y, [0, 200, 0]);
          else if (r < 28) set(x, y, [0, 200, 0, Math.round(255 * (28 - r) / 4)]);
        }
      },
    });
    await openAllSections(page);
    await pickSwatch(page, 0);
    await page.click('#rcnear');
    await setField(page, 'rctol', 24);
    await page.click('#rcerase');
    await page.waitForTimeout(300);
    const left = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, art.width, art.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++;
      return n;
    });
    expect(left, 'the soft edge goes too').toBe(0);
  });
});

test.describe('the recolour selection', () => {
  test('survives an undo of something unrelated', async ({ page }) => {
    /* Adding a palette rebuild to undo quietly cleared the selection, and the
       swatches stayed on screen looking normal while rcPick was empty. */
    await openTrait(page, { w: 60, h: 60, draw: bands });
    await openAllSections(page);
    await pickSwatch(page, 0);
    await pickSwatch(page, 1);
    expect(await picked(page)).toHaveLength(2);

    await page.evaluate(() => { selectTool('pencil'); setColor('#ffcc00'); snapshot(); dab(30, 30, [255, 204, 0], 255); });
    await page.waitForTimeout(150);
    await page.click('#undo');
    await page.waitForTimeout(350);

    expect(await picked(page), 'an unrelated undo must not unpick anything').toHaveLength(2);
    expect(await page.evaluate(() => document.getElementById('rcerase').disabled)).toBe(false);
  });

  test('is cleared by an erase, which really does change the colours', async ({ page }) => {
    /* The control for the test above: keeping a selection across undo must not
       have made it survive an operation that removes the colour it names. */
    await openTrait(page, { w: 60, h: 60, draw: bands });
    await openAllSections(page);
    await pickSwatch(page, 1);
    expect(await picked(page)).toHaveLength(1);
    await page.click('#rcerase');
    await page.waitForTimeout(300);
    expect(await picked(page)).toHaveLength(0);
  });
});

/* ONE PALETTE, TWO JOBS.

   #pal and #rcpal used to render the same 64 colours - about 243px of sidebar,
   twice - because the two interactions differ: drawing takes ONE colour and
   replacing takes SEVERAL. One grid now, with a chip pair saying what a click
   does, and both states drawn at once: aria-pressed for the drawing colour,
   data-rc for marked-for-replace.

   Every test above passes unchanged, which is the point - the behaviour did not
   move. But they reach the selection through pickSwatch, which sets the mode
   itself, so all of them would still pass if the mode were ignored and a click
   always marked. None of them can see the Draw half. */
test.describe('the merged palette', () => {
  const bands3 = (set, W, H) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      set(x, y, y < H / 3 ? [255, 0, 0] : y < (2 * H) / 3 ? [0, 255, 0] : [0, 0, 255]);
  };
  const swatch = (page, i) => page.evaluate((n) => {
    const s = [...document.querySelectorAll('#pal .sw')][n];
    if (!s) throw new Error('no swatch at ' + n);
    s.click();
    return s.dataset.hex;
  }, i);
  const mode = (page, v) => page.evaluate((m) => setChip('palmode', m), v);
  const state = (page) => page.evaluate(() => ({
    colour: color,
    marks: [...document.querySelectorAll('#pal .sw')].filter(s => s.dataset.rc === '1').length,
    ring: [...document.querySelectorAll('#pal .sw')].filter(s => s.getAttribute('aria-pressed') === 'true').length,
    picked: rcPick.size,
  }));

  test('there is one swatch grid, not two', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: bands3 });
    await openAllSections(page);
    const n = await page.evaluate(() => ({
      grids: document.querySelectorAll('.swatches').length,
      rcpal: !!document.getElementById('rcpal'),
      pal: document.querySelectorAll('#pal .sw').length,
    }));
    expect(n.grids, 'the same colours were drawn twice').toBe(1);
    expect(n.rcpal, 'the duplicate grid is gone').toBe(false);
    expect(n.pal, 'and the remaining one has the colours').toBeGreaterThan(1);
  });

  test('in Draw mode a click sets the colour and marks nothing', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: bands3 });
    await openAllSections(page);
    await mode(page, 'draw');
    const hex = await swatch(page, 1);
    const s = await state(page);
    expect(s.colour, 'the drawing colour follows the click').toBe(hex);
    expect(s.picked, 'and nothing is marked for replacing').toBe(0);
    expect(s.ring, 'exactly one swatch carries the ring').toBe(1);
  });

  test('in Replace mode a click marks and leaves the drawing colour alone', async ({ page }) => {
    // If marking changed the drawing colour, the colour you are replacing WITH
    // would move every time you picked a target - the recolour could not be
    // expressed at all.
    await openTrait(page, { w: 60, h: 60, draw: bands3 });
    await openAllSections(page);
    await mode(page, 'draw');
    const drawing = await swatch(page, 0);
    await mode(page, 'replace');
    await swatch(page, 1);
    await swatch(page, 2);
    const s = await state(page);
    expect(s.picked, 'both marked').toBe(2);
    expect(s.marks, 'and both shown').toBe(2);
    expect(s.colour, 'the drawing colour must not move while picking targets').toBe(drawing);
  });

  test('a second click unmarks, so a misclick is fixable', async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: bands3 });
    await openAllSections(page);
    await mode(page, 'replace');
    await swatch(page, 1);
    expect((await state(page)).picked).toBe(1);
    await swatch(page, 1);
    expect((await state(page)).picked, 'clicking it again takes it out').toBe(0);
  });

  test('marks survive the switch to Draw, which is what makes the flow work', async ({ page }) => {
    // Mark the targets, switch, choose the colour to replace them with. If the
    // marks did not survive the switch, one grid could not do a recolour at all
    // and the merge would have cost the feature.
    //
    // This also pins a real defect: while both selections lived on aria-pressed,
    // setColor's sweep over every .sw wiped the marks - measured as 2 -> 0 with
    // the panel still naming the colours. rcSummary carried a repair for it.
    //
    // That repair is STILL THERE and still load-bearing, which an earlier version
    // of this comment denied. Measured: restoring the collision inside setColor
    // broke no test, because setColor ends by calling rcSummary and the marks come
    // straight back. Nothing here can catch that change - the behaviour under it
    // is correct - so this test pins the BEHAVIOUR, that changing the drawing
    // colour never costs you the selection, by whichever mechanism holds.
    await openTrait(page, { w: 60, h: 60, draw: bands3 });
    await openAllSections(page);
    await mode(page, 'replace');
    await swatch(page, 0);
    await swatch(page, 1);
    expect((await state(page)).marks).toBe(2);

    await mode(page, 'draw');
    const dest = await swatch(page, 2);
    const s = await state(page);
    expect(s.picked, 'the selection survives the mode switch').toBe(2);
    expect(s.marks, 'and so do the marks on screen').toBe(2);
    expect(s.colour, 'while the destination colour is set').toBe(dest);
    expect(await page.evaluate(() => document.getElementById('rcgo').disabled),
      'and Replace is ready to run').toBe(false);
  });
});