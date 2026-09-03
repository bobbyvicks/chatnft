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
    const errors = await openTrait(page, {
      w: 160, h: 160,
      draw: (set, W, H) => {
        for (let y = 16; y < 72; y++) for (let x = 24; x < 136; x++) set(x, y, [226, 146, 116]);
      },
    });
    await openAllSections(page);

    const before = await art.bounds(page);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 128);
    await setField(page, 'rsh', 128);
    await page.click('#rsgo');
    await page.waitForTimeout(300);

    const after = await art.bounds(page);
    expect(await art.size(page), 'the canvas must not move in this mode').toBe('160x160');
    expect(after.w, 'the trait must actually get smaller').toBeLessThan(before.w);
    // 128/160 = 0.80, give it a cell of slack either way
    expect(after.w / before.w).toBeGreaterThan(0.74);
    expect(after.w / before.w).toBeLessThan(0.86);
    expect(errors).toEqual([]);
  });

  test('shrinking works on a canvas that is not a multiple of the cell count', async ({ page }) => {
    // 120 was the second half of the same defect: 96 snapped UP to 160, so the
    // trait was blown up and cropped when the user asked to shrink it.
    await openTrait(page, {
      w: 120, h: 120,
      draw: (set) => { for (let y = 12; y < 54; y++) for (let x = 18; x < 102; x++) set(x, y, [226, 146, 116]); },
    });
    await openAllSections(page);
    const before = await art.bounds(page);
    await setSelect(page, 'rsmode', 'inside');
    await setField(page, 'rsw', 96);
    await setField(page, 'rsh', 96);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await art.bounds(page);
    expect(await art.size(page)).toBe('120x120');
    /* The RATIO, not merely "smaller". Asking for 96 on a 120 canvas is 0.80,
       and a mutation test showed why the loose version was not enough: with the
       old snap rule this became a scale UP to 160 followed by a centre-crop back
       to 120, and the visible bounding box of a cropped blow-up can be smaller
       than the original too. The test went green on the defect it exists for. */
    expect(after.w / before.w, 'asked for 0.80 of the width').toBeGreaterThan(0.72);
    expect(after.w / before.w, 'and it must not have been blown up and cropped').toBeLessThan(0.88);
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
