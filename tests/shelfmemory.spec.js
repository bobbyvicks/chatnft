/* THE SHELF USED TO ASK FOR TWO GIGABYTES OF CANVAS, AND THAT IS WHY THE SITE
   CRASHED ON A PHONE.

   The collection this app was built for is 318 PNGs at 1280x1280, measured off
   the files on disk. renderShelf gave every tile a canvas at the trait's own
   size and decoded every blob the moment the shelf was built:

     318 x 1280 x 1280 x 4 = 2,053 MB of backing store, plus one live
     ImageBitmap per trait at the same size, never closed.

   Measured on the shipped page before the fix, seeded with that collection:
   2,053 MB across 349 canvases. Desktop Chrome survives it. A phone does not -
   the renderer is killed, the phone reloads the page, the shelf renders again
   and it is killed again, which is what "it crashes every two seconds" is.

   Nothing here measures a phone. What it measures is the thing that made the
   phone die, which is a number this page decides and can be checked anywhere:
   how much canvas one trait is given, and how many traits are decoded at once.

   THE TILE IS 150 CSS PIXELS WIDE. None of that resolution was ever on screen.
*/
import { test, expect } from '@playwright/test';

/* Enough tiles that the shelf runs past the bottom of the window, which is
   what makes the lazy half of this measurable at all. */
const N = 60;
const TRAIT = 1280;

/* One blob, shared by every record - each one is structured-cloned into
   IndexedDB and decoded separately, so this measures the same work as 60
   different pictures without spending 60 encodes on it. The picture is drawn
   in 80px blocks, which is one cell of a 160-cell trait at 8 pixels a cell,
   so a correct thumbnail keeps every block and a broken one is obvious. */
async function seed(page, n = N) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) { /* older build without the lock */ }
    try { gateShow(false); } catch (_) {}
  });
  await page.evaluate(async ({ n, S }) => {
    await dbClear();
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    for (let y = 0; y < S; y += 80) for (let x = 0; x < S; x += 80) {
      g.fillStyle = ((x + y) / 80) % 2 ? '#c85368' : '#2e222f';
      g.fillRect(x, y, 80, 80);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    for (let i = 0; i < n; i++) {
      const layer = LAYERS[i % LAYERS.length];
      await dbPut({ id: 't_m' + i + '_' + layer + '_approved', kind: 'trait',
        name: 'm' + i, layer, w: S, h: S, blob, status: 'approved', synced: true });
    }
  }, { n, S: TRAIT });
  await page.evaluate(() => { try { showPage('project', false); } catch (_) {} });
  await page.evaluate(() => renderShelf());
  await page.waitForTimeout(600);
}

/* Every canvas in the document, and how many tiles have actually been decoded
   - read off the pixels, not off a flag, so a tile that claims to be painted
   and is empty counts as empty. */
const shot = (page) => page.evaluate(() => {
  let all = 0;
  for (const c of document.querySelectorAll('canvas')) all += c.width * c.height * 4;
  const tiles = [...document.querySelectorAll('#projbody .item canvas')];
  let bytes = 0;
  for (const c of tiles) bytes += c.width * c.height * 4;
  let drawn = 0;
  for (const c of tiles) {
    try {
      const d = c.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, Math.min(8, c.width), Math.min(8, c.height)).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { drawn++; break; }
    } catch (_) { /* a tainted or zero-sized canvas is not a drawn one */ }
  }
  return { bytes, all, drawn, tiles: tiles.length,
    biggest: tiles.reduce((m, c) => Math.max(m, c.width, c.height), 0) };
});

test.describe('what the shelf asks the browser for', () => {
  test('A TILE IS A THUMBNAIL, NOT THE TRAIT', async ({ page }) => {
    await seed(page);
    const r = await shot(page);
    expect(r.tiles, 'the shelf has the seeded traits on it').toBe(N);
    expect(r.biggest, 'no tile canvas is larger than the cap, whatever the trait is')
      .toBeLessThanOrEqual(192);
    /* 1280 divides by 8, so the thumbnail is the trait's own art size: these
       are drawn on a 160-cell grid at 8 pixels a cell. Not an approximation of
       the number - the whole division is the rule, so the number is exact. */
    const sizes = await page.evaluate(() => [...new Set(
      [...document.querySelectorAll('#projbody .item canvas')].map(c => c.width + 'x' + c.height))]);
    expect(sizes, 'a 1280 trait is shown at its own art size').toEqual(['160x160']);
  });

  test('AND THE WHOLE SHELF FITS IN A BUDGET A PHONE HAS', async ({ page }) => {
    await seed(page);
    const r = await shot(page);
    const was = N * TRAIT * TRAIT * 4;
    expect(was / 1048576, 'what this used to cost, stated so the number below means something')
      .toBeGreaterThan(300);
    expect(r.bytes / 1048576, 'and what the same tiles cost now').toBeLessThan(8);
    /* The whole page, not just the tiles, because a saving on one canvas that
       reappears on another is not a saving. The character composite is a
       legitimate 1280x1280 and is most of what is left. */
    expect(r.all / 1048576, 'and the whole document with it').toBeLessThan(24);
  });

  test('TILES DECODE WHEN THEY REACH THE SCREEN, NOT ALL AT ONCE', async ({ page }) => {
    /* The other half, and the one that survives a bigger screen: renderShelf
       runs again on every status change, pick, hide and rarity edit, and each
       run used to decode the entire collection. */
    await seed(page);
    const start = await shot(page);
    expect(start.drawn, 'nothing off screen has been decoded').toBeLessThan(N);

    await page.evaluate(() => {
      const el = document.querySelector('#projbody .item');
      if (el) el.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(900);
    const seen = await shot(page);
    expect(seen.drawn, 'and scrolling to the shelf decodes what is on it')
      .toBeGreaterThan(start.drawn);
    expect(seen.drawn, 'but still not the whole collection').toBeLessThan(N);
  });

  test('and a decoded tile is the trait, at the trait\'s colours', async ({ page }) => {
    /* Cheap to shrink a picture into nothing and call it a saving. The tile
       has to still be the picture. */
    await seed(page);
    await page.evaluate(() => {
      const el = document.querySelector('#projbody .item');
      if (el) el.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(900);
    const seen = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#projbody .item canvas')];
      for (const c of tiles) {
        const g = c.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let opaque = 0; const seen = new Set();
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          opaque++; seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        }
        if (opaque) return { w: c.width, h: c.height, opaque, colours: [...seen].sort() };
      }
      return null;
    });
    expect(seen, 'at least one tile has been drawn on').not.toBeNull();
    expect(seen.opaque, 'and it is filled edge to edge, as the fixture is')
      .toBe(seen.w * seen.h);
    /* The two colours the fixture is painted in, and nothing between them:
       the thumbnail is a whole division drawn with smoothing off, so no
       blend of the two can appear. */
    expect(seen.colours).toEqual(['200,83,104', '46,34,47']);
  });

  test('and rendering again does not leave the last render behind', async ({ page }) => {
    /* The observer holds what it watches. One that outlived a rebuild would be
       holding N detached canvases per render, which over a session of clicking
       status buttons is the same leak one level up. */
    await seed(page);
    await page.evaluate(() => { for (let i = 0; i < 8; i++) renderShelf(); });
    await page.waitForTimeout(800);
    const r = await shot(page);
    expect(r.tiles, 'still one shelf').toBe(N);
    expect(r.bytes / 1048576, 'and still one shelf worth of canvas').toBeLessThan(8);
    expect(r.all / 1048576, 'with nothing of the other seven left over').toBeLessThan(24);
  });
});
