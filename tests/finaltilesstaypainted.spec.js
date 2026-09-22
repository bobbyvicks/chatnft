/* THE FINAL PROJECT'S TILES STAY PAINTED.

   Reported: "in final project i added a skin and then it made it so that i
   couldnt see any previews of the other traits".

   Every tile canvas is painted lazily: shelfTile registers it on an
   IntersectionObserver and the picture is decoded when the observer reports
   the tile on screen - at the browser's next rendering step, never on the
   next line of code. renderShelf rebuilds the shelf's observer
   (shelfWatchReset disconnects the old one), and the final project page used
   to register its tiles on that same observer. A canvas whose observer is
   disconnected before it has reported is never painted by anything.

   So every shelf redraw was a race against the frame clock for every final
   tile still waiting. finalMove lost it: this page redrawn, the shelf redrawn
   a few milliseconds later. Whether the observer reported in between is why
   it usually looked fine and did not for the person reporting it.

   RUN AGAINST THE PAGE BEFORE THE FIX: the second test went red with all
   four tiles blank (the preview is made instant there, because the time the
   preview takes is exactly what hid the race - measured, four tiles waiting
   at the moment of the reset, four blank afterwards), and the third went red
   with every tile below the fold blank after scrolling to it. The first test
   is the precondition that makes the other two mean something: the probe can
   see a painted tile and can say a blank one is blank, and the tiles ARE on
   an observer rather than painted at once. Recorded here because once fixed
   the broken page cannot be recovered. */
import { test, expect } from '@playwright/test';

/* n traits in the final project, all in skins, plus one approved skin to add.
   The shelf is rendered first so the shelf's observer exists, the way it does
   on any page a person has actually opened - without that the tiles paint at
   once and nothing here is exercised. */
const seed = (page, n) => page.evaluate(async (count) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  const layers = ['backgrounds', 'skins', 'unsorted'];
  LAYERS = layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: layers.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const put = (nm, layer, st, i) => dbPut({ id: 't_' + nm + '_' + layer + '_' + st, kind: 'trait',
    name: nm, layer, status: st, blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: i });
  for (let i = 0; i < count; i++) await put('s' + i, 'skins', 'stfp', i);
  await put('extra', 'skins', 'approved', count);
  await renderShelf();
  showPage('final', false);
  await renderFinal();
  return { observed: !!shelfWatch };
}, n);

/* Which tiles on the page hold a picture, and how many are still waiting on
   an observer. A tile is painted when any pixel has alpha - the seed fills
   the whole 16x16, so a decoded tile is opaque everywhere and an undecoded
   one is transparent everywhere. */
const painted = (page) => page.evaluate(() => {
  const isPainted = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
    return false;
  };
  const blank = document.createElement('canvas'); blank.width = 16; blank.height = 16;
  const tiles = {};
  let waiting = 0;
  for (const el of document.querySelectorAll('#finallayers .item[data-key]')) {
    const cv = el.querySelector('canvas');
    tiles[el.dataset.key] = isPainted(cv);
    if (cv.pbPaint) waiting++;
  }
  const n = Object.keys(tiles).length;
  const yes = Object.values(tiles).filter(Boolean).length;
  return { tiles, n, yes, waiting, blankReadsBlank: !isPainted(blank) };
});

test.describe('the final project keeps its pictures', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function' && typeof finalMove === 'function');
  });

  test('THE PRECONDITION: on arrival every chosen tile is painted through an observer, and the probe can say blank',
    async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      const s = await seed(page, 3);
      expect(s.observed, 'the tiles are on an observer, not painted at once').toBe(true);
      await page.waitForSelector('#finallayers .item[data-key]');
      await page.waitForTimeout(500);
      const r = await painted(page);
      expect(r.blankReadsBlank, 'a canvas nothing drew on reads as blank').toBe(true);
      expect(r.n, 'the three chosen tiles are on the page').toBe(3);
      expect(r.yes, 'and all three are painted').toBe(3);
    });

  test('AFTER ADDING ONE THROUGH THE PAGE, every tile is painted - the ones that were there and the new one',
    async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await seed(page, 3);
      await page.waitForSelector('#finallayers .item[data-key]');
      await page.waitForTimeout(500);
      const r = await page.evaluate(async () => {
        /* The preview made instant. Its decoding is what usually let the
           observer report before the shelf redraw threw it away; with it
           gone the race is lost every time, which is the case reported. */
        window.finalPreview = async () => 0;
        const rec = (await dbAll()).find(i => i.id === 't_extra_skins_approved');
        await finalMove(rec, 'stfp');
        return (await dbAll()).filter(i => i.kind === 'trait' && i.status === 'stfp').length;
      });
      expect(r, 'four chosen now').toBe(4);
      await page.waitForTimeout(600);
      const p = await painted(page);
      expect(p.n, 'four tiles on the page').toBe(4);
      expect(Object.keys(p.tiles), 'including the one just added').toContain('t_extra_skins_stfp');
      expect(p.yes, 'and every one of them is painted').toBe(4);
    });

  test('AND A SHELF REDRAW FROM ANYWHERE does not strand the tiles below the fold',
    async ({ page }) => {
      /* The class, not the instance. The shelf is redrawn by a pull finishing,
         a rarity change, a hide, a rule - none of which is this page's
         business - and a project of three hundred traits has most of its
         final tiles below the fold, waiting. */
      await page.setViewportSize({ width: 1600, height: 700 });
      await seed(page, 120);
      await page.waitForSelector('#finallayers .item[data-key]');
      await page.waitForTimeout(500);
      const before = await painted(page);
      expect(before.n).toBe(120);
      expect(before.yes, 'the ones on screen are painted').toBeGreaterThan(0);
      expect(before.waiting, 'and the ones below the fold are waiting on an observer').toBeGreaterThan(0);
      await page.evaluate(async () => { await renderShelf(); });
      /* Down the whole page in steps, the way a person scrolls: the page is
         four tiles wide and thirty rows tall, and a jump to the bottom shows
         the observer only the last few. */
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += 500) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(600);
      const after = await painted(page);
      expect(after.yes, 'every tile scrolled to is painted').toBe(120);
      expect(after.waiting, 'and none is left waiting on an observer that is gone').toBe(0);
    });
});
