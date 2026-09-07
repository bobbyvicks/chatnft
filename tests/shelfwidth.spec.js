/* The shelf's width and the size of a trait tile, measured rather than
   derived.

   The shelf was a 760px card in a 1280px page, showing a 160x160 trait in a
   99px canvas, six to a row - while .extract, the other panel where a render
   gets judged, had already been widened to 1180px for exactly that reason.
   This is the same fix for the same complaint, so the numbers it produces are
   worth pinning.

   THEY ARE PINNED BECAUSE THE FIRST VERSION OF THIS CHANGE WAS BROKEN AND THE
   COMMENT EXPLAINING IT WAS WRONG. A flat minmax(150px,1fr) needs 309px of
   content box for two columns; a 375px phone has 307, because the 1px border
   is on each side and I had counted only the padding. It gave ONE column and
   a 293px tile. The arithmetic said two. Nothing in the suite would have
   noticed, so these are measurements at six widths instead of a comment.

   The column count is asserted EXACTLY, not as "more than one". The rule is
   repeat(auto-fill,minmax(min(150px,47%),1fr)) - a min() inside a minmax()
   inside a repeat() - and a browser that rejects any part of that expression
   drops the whole declaration, leaving .items a single-column grid. That
   failure looks like a tidy page, so a range assertion would pass through it. */
import { test, expect } from '@playwright/test';

/* One layer, deliberately more traits than fit on any row at any width here,
   so the column count is always the grid's answer and never the supply's. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const blob = new Blob([new Uint8Array([0])]);
  for (let i = 0; i < 24; i++)
    await dbPut({ id: 't_bg_' + i, kind: 'trait', name: 'background ' + i,
      layer: 'backgrounds', status: 'approved', blob, w: 160, h: 160, rarity: 1, at: i + 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['backgrounds', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
});

const measure = (page) => page.evaluate(() => {
  const items = document.querySelector('.items');
  const canvas = document.querySelector('.item canvas');
  const w = el => Math.round(el.getBoundingClientRect().width);
  return {
    tiles: document.querySelectorAll('.item').length,
    perRow: getComputedStyle(items).gridTemplateColumns.split(' ').length,
    tile: w(canvas),
    proj: w(document.getElementById('proj')),
    compose: w(document.getElementById('compose')),
    layers: w(document.getElementById('layers')),
    extract: w(document.querySelector('.extract')),
    cloud: w(document.getElementById('cloud')),
    docWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  };
});

const at = async (page, width, height) => {
  await page.setViewportSize({ width, height });
  return measure(page);
};

test.describe('the trait shelf', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
  });

  test('takes the width the page already gives a panel you judge work in', async ({ page }) => {
    const r = await measure(page);
    expect(r.tiles, 'the shelf actually has traits in it').toBe(24);
    expect(r.proj, 'the shelf matches .extract rather than inventing a width').toBe(r.extract);
    expect(r.proj, 'and is wider than it was').toBeGreaterThan(760);
  });

  test('and Build a character and the layer list match it', async ({ page }) => {
    /* SUPERSEDED, and kept rather than deleted so the file still records that
       this width was a choice and who made it.

       This used to assert 760 for both. I had left them narrow when the shelf
       was widened, reasoning that a form stretched wide leaves its controls
       hugging the left - and the person whose page it is asked for all three
       to match, because three panels at two widths is a ragged edge and the
       narrow one reads as unfinished rather than as considered. Their reason
       is better than mine was.

       Still a control, and still against the same mistake: the width belongs
       to three named panels, not to .proj, which #cloud also wears. */
    const r = await measure(page);
    expect(r.compose, 'Build a character matches the shelf').toBe(r.proj);
    expect(r.layers, 'and so does the layer list').toBe(r.proj);
    expect(r.cloud, 'but the cloud panel, which shares the class, does not')
      .not.toBe(r.proj);
  });

  test('and they sit above the traits', async ({ page }) => {
    /* Asked for, and worth pinning: the shelf is 259 tiles tall, so having it
       first meant scrolling past all of them to reach the panel that tells you
       whether any of them work. */
    const order = await page.evaluate(() => ['compose', 'layers', 'proj']
      .map(id => document.getElementById(id).compareDocumentPosition(
        document.getElementById('proj'))));
    const tops = await page.evaluate(() => {
      const y = id => document.getElementById(id).getBoundingClientRect().top;
      return { compose: y('compose'), layers: y('layers'), proj: y('proj') };
    });
    expect(tops.compose, 'Build a character comes first').toBeLessThan(tops.layers);
    expect(tops.layers, 'then the layers').toBeLessThan(tops.proj);
  });

  test('shows a trait far bigger than the 99px it used to get', async ({ page }) => {
    const r = await measure(page);
    expect(r.perRow, 'seven to a row in the wider panel').toBe(7);
    expect(r.tile, 'a 160x160 trait gets a 141px canvas, not 99').toBeGreaterThan(130);
  });

  test('keeps two columns on a phone, which the first attempt did not', async ({ page }) => {
    /* 375 is where it broke: 307px of content box against the 309 that two
       flat 150px columns need. 320 is the narrowest phone worth having and
       is the real test of the percentage. */
    const small = await at(page, 375, 812);
    expect(small.perRow, 'two columns at 375, not one 293px tile').toBe(2);
    const tiny = await at(page, 320, 700);
    expect(tiny.perRow, 'and still two at 320').toBe(2);
    expect(tiny.tile, 'each one still big enough to judge').toBeGreaterThan(90);
  });

  test('and nothing anywhere pushes the page sideways', async ({ page }) => {
    /* The shelf head did this once - .projhead .acts was 568px wide in a
       375px page and every page scrolled sideways. Nothing guarded it.

       The tile count is asserted at every width for a reason: "the document
       is no wider than the window" is trivially true of a page with nothing
       on it, and a seeding failure would present as six passes. */
    for (const [w, h] of [[320, 700], [375, 812], [620, 900], [820, 900], [1024, 900], [1280, 900]]) {
      const r = await at(page, w, h);
      expect(r.tiles, 'traits are on screen at ' + w).toBe(24);
      expect(r.docWidth, 'no sideways scroll at ' + w).toBeLessThanOrEqual(r.viewport);
    }
  });

  test('and the shelf never overflows the panel holding it', async ({ page }) => {
    /* A column minimum wider than the panel would overflow rather than
       reflow, and the grid would look right in a screenshot taken at one
       width. This asks the row itself. */
    for (const [w, h] of [[320, 700], [375, 812], [1280, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      const over = await page.evaluate(() => {
        const items = document.querySelector('.items');
        return { row: Math.round(items.scrollWidth), box: Math.round(items.clientWidth) };
      });
      expect(over.row, 'the tile row fits its panel at ' + w).toBeLessThanOrEqual(over.box + 1);
    }
  });
});
