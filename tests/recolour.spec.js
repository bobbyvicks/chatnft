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
