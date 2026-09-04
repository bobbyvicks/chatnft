import { test, expect } from '@playwright/test';
import { openTrait, openAllSections, art, setField, setSelect, pressed } from './helpers.js';

/* Snap ships ON. Every test that touches resize must leave it alone unless it
   is deliberately testing the other setting - the defect that got through was
   found only in the default, because every check written at the time turned
   snap off first. */

test.describe('resize', () => {
  test('snap is on by default', async ({ page }) => {
    await openTrait(page, { draw: () => {} });
    expect(await pressed(page, 'rssnap')).toBe('true');
  });

  test('shrinking the trait inside a fixed canvas works with snap untouched', async ({ page }) => {
    // A 160 canvas is the collection's own size, and the size the defect hid on:
    // every shrink snapped back to 160 and the app answered "Already 160 by 160".
    //
    // This used to ask for 128 and check the trait came out at 0.80 of its width,
    // because 128/160 was the ratio the CANVAS was being scaled by. The number is
    // the trait's own size now, so it asks for a size and checks it got that size -
    // a stronger claim than the band, which passed on anything roughly three
    // quarters as wide however it got there.
    const errors = await openTrait(page, {
      w: 160, h: 160,
      draw: (set, W, H) => {
        for (let y = 16; y < 72; y++) for (let x = 24; x < 136; x++) set(x, y, [226, 146, 116]);
      },
    });
    await openAllSections(page);

    const before = await art.bounds(page);
    expect(before.w, 'the fixture draws a 112-wide trait').toBe(112);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 80);
    // The height is left alone deliberately: keep-shape is on by default and
    // derives it, and that derivation is what the aspect test below pins.
    await page.click('#rsgo');
    await page.waitForTimeout(300);

    const after = await art.bounds(page);
    expect(await art.size(page), 'the canvas must not move in this mode').toBe('160x160');
    // Within a pixel: the factor goes through the canvas and back, so the two
    // roundings can leave it one off. Anything more is a different answer.
    expect(Math.abs(after.w - 80), 'asked for an 80-wide trait, got ' + after.w).toBeLessThanOrEqual(1);
    expect(Math.abs(after.h - 40), 'and 40 tall by its own shape, got ' + after.h).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('shrinking works on a canvas that is not a multiple of the cell count', async ({ page }) => {
    // 120 was the second half of the same defect: 96 snapped UP to 160, so the
    // trait was blown up and cropped when the user asked to shrink it.
    //
    // The exact size rules that out, and harder than the old ratio band did. A
    // centre-crop of a blow-up can have a bounding box SMALLER than the original -
    // which is how the loose version of this test went green on the very defect it
    // exists for - but it cannot have the bounding box that was asked for.
    await openTrait(page, {
      w: 120, h: 120,
      draw: (set) => { for (let y = 12; y < 54; y++) for (let x = 18; x < 102; x++) set(x, y, [226, 146, 116]); },
    });
    await openAllSections(page);
    const before = await art.bounds(page);
    expect(before.w, 'the fixture draws an 84-wide trait').toBe(84);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 42);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await art.bounds(page);
    expect(await art.size(page)).toBe('120x120');
    expect(Math.abs(after.w - 42), 'asked for a 42-wide trait, got ' + after.w).toBeLessThanOrEqual(1);
    expect(Math.abs(after.h - 21), 'and 21 tall by its own shape, got ' + after.h).toBeLessThanOrEqual(1);
  });

  /* The three below are each a thing that broke when the number in Trait mode
     stopped meaning the canvas and started meaning the trait. None was found by
     reading the code - all three were measured in the browser, and the first two
     were invisible to the check that came before them, which used a square trait
     on a square canvas. There the canvas and the trait have the same shape, so
     nothing can tell which of the two a factor was taken from. */

  test("keep-shape keeps the TRAIT's shape, not the canvas's", async ({ page }) => {
    // Measured before the fix: a 112x56 trait on a 160x160 canvas, asked for a
    // width of 56, came back 56x56. A 2:1 trait squashed square, because the
    // height was derived from nw*H/W and H/W is the canvas.
    await openTrait(page, {
      w: 160, h: 160,
      draw: (set) => { for (let y = 16; y < 72; y++) for (let x = 24; x < 136; x++) set(x, y, [226, 146, 116]); },
    });
    await openAllSections(page);
    const before = await art.bounds(page);
    expect(before.w / before.h, 'the fixture is 2:1 - a square trait cannot detect this').toBeCloseTo(2, 1);
    expect(await page.evaluate(() => pressed('rslock')), 'keep-shape is on by default').toBe(true);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 56);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await art.bounds(page);
    expect(Math.abs(after.h - 28), 'the canvas aspect would give 56 tall; got ' + after.h).toBeLessThanOrEqual(1);
    expect(after.w / after.h, 'the shape is what keep-shape keeps').toBeCloseTo(2, 1);
  });

  test('"already that size" is about the trait, not the canvas', async ({ page }) => {
    // Wrong in both directions at once before the fix: typing the CANVAS size was
    // refused as a no-op though the trait was smaller and the request was real,
    // and typing the trait's own size was NOT refused, so it rescaled it to itself.
    await openTrait(page, {
      w: 160, h: 160,
      draw: (set) => { for (let y = 16; y < 72; y++) for (let x = 24; x < 136; x++) set(x, y, [226, 146, 116]); },
    });
    await openAllSections(page);
    await setSelect(page, 'rsmode', 'inside');

    // Typing the trait's own size IS a no-op, and must be refused as one.
    await setField(page, 'rsw', 112);
    await page.click('#rsgo');
    await page.waitForTimeout(250);
    expect((await page.evaluate(() => (($('toast') || {}).textContent) || '')).toLowerCase(),
      'asking for the size it already is must say so').toContain('already');

    // Typing the canvas size is a real request - grow the trait to fill it.
    await setField(page, 'rsw', 160);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await art.bounds(page);
    expect(Math.abs(after.w - 160), 'the canvas size is a legitimate trait size; got ' + after.w).toBeLessThanOrEqual(1);
    expect(await art.size(page), 'and the canvas still must not move').toBe('160x160');
  });

  test('a trait grows to a size that is not a whole multiple', async ({ page }) => {
    // scaleArt enlarged only at whole multiples and sent everything else to
    // resample, a DOWNSCALER - so the art kept its old pixel size inside a bigger
    // canvas and walked off the edge once recanvas centred it. Measured on a 40x40
    // opaque canvas: 80 (exact 2x) gave 6400 opaque and was right; 60 (x1.5) gave
    // 1600 and 100 (x2.5) gave 1600, both the ORIGINAL count. 45 from 30 is x1.5,
    // the first ratio that was wrong.
    await openTrait(page, {
      w: 160, h: 160,
      draw: (set) => { for (let y = 60; y < 90; y++) for (let x = 60; x < 90; x++) set(x, y, [226, 146, 116]); },
    });
    await openAllSections(page);
    const before = await art.bounds(page);
    expect(before.w, 'the fixture draws a 30-wide trait').toBe(30);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 45);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await art.bounds(page);
    // The defect left it at 30 - the size it started - not merely short of 45.
    expect(after.w, 'x1.5 used to leave the trait at its original size').toBeGreaterThan(30);
    expect(Math.abs(after.w - 45), 'asked for 45, got ' + after.w).toBeLessThanOrEqual(1);
    expect(await art.size(page)).toBe('160x160');
  });

  test('the canvas rule is unchanged - "the art" still snaps to whole cell counts', async ({ page }) => {
    // The control for the two above. Loosening the art rule must not have
    // loosened the canvas rule, or trait canvases stop landing on the grid.
    await openTrait(page, { w: 120, h: 120, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await openAllSections(page);
    await setSelect(page, 'rsmode', 'art');
    await setField(page, 'rsw', 128);
    await setField(page, 'rsh', 128);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    expect(await art.size(page), '128 must snap up to a whole 160').toBe('160x160');
  });

  /* Below one cell. The four above and the 128 test above them are the same
     rule read in opposite directions, and only one direction was ever tested -
     which is why a snap that mapped EVERY request from 1 to 239 onto 160 sat
     green in this file. Measured before the fix: 24, 32, 40, 64, 80, 96, 120,
     159, 200 and 239 all came back 160, so shrinking was not expressible at
     all in Canvas or Art mode without turning snap off. */

  test('the snap ladder goes down as well as up', async ({ page }) => {
    await openTrait(page, { w: 160, h: 160, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    const g = await page.evaluate(() => projectGrid);
    expect(g, 'this test is written against the default grid').toBe(160);
    const ladder = await page.evaluate(() => {
      const out = {};
      for (let v = 1; v < 400; v++) out[v] = snapToGrid(v);
      return out;
    });
    // The defect, stated as the property it violated: something below a cell
    // has to be reachable. It was zero sizes, not few.
    const below = new Set(Object.values(ladder).filter(v => v < 160));
    expect(below.size, 'no size below one cell was reachable at all').toBeGreaterThan(4);
    // And the constraint the old floor existed to protect, asserted directly
    // rather than being satisfied vacuously by there being no sizes.
    for (const v of below) expect(160 % v, v + ' does not tile the cell').toBe(0);
    // The ladder must never invert - a smaller request giving a larger size.
    for (let v = 2; v < 400; v++)
      expect(ladder[v], 'not monotonic at ' + v).toBeGreaterThanOrEqual(ladder[v - 1]);
    // At and above a cell, unchanged.
    expect(ladder[128], '128 still snaps up').toBe(160);
    expect(ladder[240], '240 still snaps to two cells').toBe(320);
  });

  for (const mode of ['canvas', 'art']) {
    test('a shrink in ' + mode + ' mode works with snap left alone', async ({ page }) => {
      // Snap is on by default and is not touched here, which is the point: the
      // old behaviour was reachable by anyone who never found that control.
      await openTrait(page, {
        w: 160, h: 160,
        draw: (set) => { for (let y = 20; y < 140; y++) for (let x = 20; x < 140; x++) set(x, y, [226, 146, 116]); },
      });
      await openAllSections(page);
      expect(await page.evaluate(() => pressed('rssnap')), 'snap is on and stays on').toBe(true);
      await setSelect(page, 'rsmode', mode);
      await setField(page, 'rsw', 40);
      await setField(page, 'rsh', 40);
      await page.click('#rsgo');
      await page.waitForTimeout(300);
      expect(await art.size(page), 'asking for 40 used to give back 160').toBe('40x40');
    });
  }

  test('a refusal caused by snap says it was snap', async ({ page }) => {
    // "Already 160 by 160" to someone who typed 159 is true of the value that
    // got used and silent about the request that was made, which sends them
    // looking for a bug in the resize instead of at a control three rows up.
    await openTrait(page, { w: 160, h: 160, draw: (set) => { set(1, 1, [1, 2, 3]); } });
    await openAllSections(page);
    await setSelect(page, 'rsmode', 'art');
    await setField(page, 'rsw', 159);
    await setField(page, 'rsh', 159);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const said = await page.evaluate(() => (($('toast') || {}).textContent) || '');
    expect(said, 'the message must name snap').toMatch(/snap/i);
    expect(said, 'and quote the number that was typed').toContain('159');
    expect(said, 'and the number it became').toContain('160');
    expect(await art.size(page), 'and nothing should have happened to the canvas').toBe('160x160');
  });
});

test.describe('downscaling', () => {
  /* Twenty one-pixel lines. Through the old resampler these came out as 28 at
     136, 32 at 128 and ZERO at 64 and below - duplicated by overlapping windows,
     then deleted outright by the under-half coverage rule. */
  const lines = (set) => {
    for (let k = 0; k < 20; k++) {
      const x = k * 8 + 2;
      for (let y = 20; y < 140; y++) set(x, y, [20, 20, 24]);
    }
  };

  for (const target of [136, 128, 96, 80, 64, 48, 40]) {
    test(`twenty one-pixel lines survive as twenty at ${target}`, async ({ page }) => {
      await openTrait(page, { w: 160, h: 160, draw: lines });
      await openAllSections(page);
      expect(await art.litColumns(page), 'the fixture itself must have 20 lines').toBe(20);
      await setSelect(page, 'rsmode', 'art');
      await page.evaluate(() => document.getElementById('rssnap').setAttribute('aria-pressed', 'false'));
      await setField(page, 'rsw', target);
      await setField(page, 'rsh', target);
      await page.click('#rsgo');
      await page.waitForTimeout(400);
      expect(await art.size(page)).toBe(`${target}x${target}`);
      expect(await art.litColumns(page)).toBe(20);
    });
  }

  test('a one-pixel outline survives a shrink as a closed ring', async ({ page }) => {
    // Before the carry-over fix, every one of the four edges came out with zero
    // outline cells: the window holding the border is 1/16 covered, so it was
    // dropped and took the colour with it.
    await openTrait(page, {
      w: 160, h: 160,
      draw: (set) => {
        for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) set(x, y, [226, 146, 116]);
        for (let x = 39; x <= 120; x++) { set(x, 39, [20, 20, 24]); set(x, 120, [20, 20, 24]); }
        for (let y = 39; y <= 120; y++) { set(39, y, [20, 20, 24]); set(120, y, [20, 20, 24]); }
      },
    });
    await openAllSections(page);
    await setSelect(page, 'rsmode', 'art');
    await page.evaluate(() => document.getElementById('rssnap').setAttribute('aria-pressed', 'false'));
    await setField(page, 'rsw', 40);
    await setField(page, 'rsh', 40);
    await page.click('#rsgo');
    await page.waitForTimeout(400);

    const edges = await page.evaluate(() => {
      const W = art.width, H = art.height;
      const d = ctx.getImageData(0, 0, W, H).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (d[(y * W + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      const dark = p => d[p * 4 + 3] > 0 && d[p * 4] === 20;
      let top = 0, bot = 0, left = 0, right = 0;
      for (let x = x0; x <= x1; x++) { if (dark(y0 * W + x)) top++; if (dark(y1 * W + x)) bot++; }
      for (let y = y0; y <= y1; y++) { if (dark(y * W + x0)) left++; if (dark(y * W + x1)) right++; }
      return { top, bot, left, right, across: x1 - x0 + 1, down: y1 - y0 + 1 };
    });
    expect(edges.top).toBeGreaterThanOrEqual(edges.across * 0.9);
    expect(edges.bot).toBeGreaterThanOrEqual(edges.across * 0.9);
    expect(edges.left).toBeGreaterThanOrEqual(edges.down * 0.9);
    expect(edges.right).toBeGreaterThanOrEqual(edges.down * 0.9);
  });

  test('no colour is invented', async ({ page }) => {
    await openTrait(page, {
      w: 160, h: 160,
      draw: (set, W, H) => {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const c = x < 50 ? [226, 146, 116] : x < 110 ? [60, 90, 200] : [240, 220, 80];
          set(x, y, x % 16 === 0 ? [20, 20, 24] : c);
        }
      },
    });
    await openAllSections(page);
    const before = await page.evaluate(() => {
      const d = ctx.getImageData(0, 0, 160, 160).data;
      const s = new Set();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return [...s];
    });
    await setSelect(page, 'rsmode', 'art');
    await page.evaluate(() => document.getElementById('rssnap').setAttribute('aria-pressed', 'false'));
    await setField(page, 'rsw', 53);
    await setField(page, 'rsh', 53);
    await page.click('#rsgo');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const W = art.width;
      const d = ctx.getImageData(0, 0, W, W).data;
      const s = new Set();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return [...s];
    });
    const invented = after.filter(c => !before.includes(c));
    expect(invented, 'a downscale must not blend new colours into existence').toEqual([]);
  });
});
