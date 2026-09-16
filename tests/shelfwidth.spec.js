/* The shelf's width and the size of a trait tile, measured rather than
   derived.

   The shelf was a 760px card in a 1280px page, showing a 160x160 trait in a
   99px canvas, six to a row - while .extract, the other panel where a render
   gets judged, had already been widened to 1180px for exactly that reason.
   This is the same fix for the same complaint, so the numbers it produces are
   worth pinning.

   .extract IS NO LONGER ONE OF THEM. The Trait Factory put it in the middle
   column of a three-column page, so its width is that grid's answer rather
   than the panel rule these share - 709 against the shelf's 1178. What it was
   standing in for is asserted between #proj, #compose and #layers, which are
   still sized the same way.

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
import { gotoPage } from './helpers.js';

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

/* MEASURED ONE PAGE AT A TIME.

   The landing page became three - the main page where you pull a trait off a
   character, the project, and its settings - so these panels are no longer on
   screen together and a single pass would read a width of zero for whichever
   two were not showing. Each is measured where it lives, which is where a
   person sees it.

   THE CLAIM THE FILE MAKES IS UNCHANGED: the three named panels share one
   width. Being on different pages is exactly when that matters most, because
   nothing on screen shows the mismatch any more. Ends on the project page,
   since most of what follows reads the tiles. */
const measure = async (page) => {
  const widthOf = async (sel, pg) => {
    await gotoPage(page, pg);
    return page.evaluate((s) => {
      const el = s[0] === '#' ? document.getElementById(s.slice(1))
        : document.querySelector(s);
      if (!el) throw new Error('nothing matches ' + s);
      return Math.round(el.getBoundingClientRect().width);
    }, sel);
  };
  const cloud = await widthOf('#cloud', 'home');
  const layers = await widthOf('#layers', 'settings');
  await gotoPage(page, 'project');
  const rest = await page.evaluate(() => {
    const items = document.querySelector('.items');
    const canvas = document.querySelector('.item canvas');
    const w = el => Math.round(el.getBoundingClientRect().width);
    return {
      tiles: document.querySelectorAll('.item').length,
      perRow: getComputedStyle(items).gridTemplateColumns.split(' ').length,
      tile: w(canvas),
      proj: w(document.getElementById('proj')),
      compose: w(document.getElementById('compose')),
      docWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  return Object.assign(rest, { cloud: cloud, layers: layers });
};

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
    /* SUPERSEDES "the shelf matches .extract rather than inventing a width".

       .extract was the other panel where a render gets judged, widened to
       1180 for this same complaint, so matching it said the shelf was sized
       by a shared rule rather than by a number somebody typed. The Trait
       Factory made it the middle column of a three-column page: its width is
       that grid's answer now, 709 where the shelf is 1178, and the assertion
       stopped being about a shared rule and became a claim that two different
       layouts happen to agree.

       IT WAS THE ONE RED IN THE SUITE WHEN THAT PAGE SHIPPED. I ran every
       spec that names either page; this file names neither, it names a class.
       A panel identified by its class travels to whatever layout that class
       ends up in, and nothing about the name says which page it is on.

       WHAT THE COMPARISON WAS FOR IS ONE TEST DOWN, where #proj, #compose and
       #layers are matched against each other - three panels still sized by
       the same rule, with #cloud as the control that wears the same class and
       does not share the width. What stays here is the complaint that started
       the file, and a floor that a typed number cannot quietly satisfy: the
       shelf takes the page it is on. */
    const r = await measure(page);
    expect(r.tiles, 'the shelf actually has traits in it').toBe(24);
    expect(r.proj, 'and is wider than the 760 it was').toBeGreaterThan(760);
    expect(r.proj / r.viewport, 'and takes the page rather than a number somebody typed')
      .toBeGreaterThan(0.85);
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
    /* THE LAYER LIST IS NOT IN THIS COMPARISON ANY MORE, and the reason is a
       stronger version of the same request. It used to be asserted between
       Build a character and the traits; it is now on the project settings
       page, so it cannot be scrolled past on the way to the shelf at all.
       Build a character still comes first on the project page, which is the
       half of the original ask that still has two things to order. */
    await gotoPage(page, 'project');
    const tops = await page.evaluate(() => {
      const y = id => document.getElementById(id).getBoundingClientRect().top;
      return { compose: y('compose'), proj: y('proj') };
    });
    expect(tops.compose, 'Build a character comes first').toBeLessThan(tops.proj);
    const where = await page.evaluate(() => ({
      layers: document.getElementById('layers').className,
      proj: document.getElementById('proj').className,
    }));
    expect(where.layers, 'and the layer list moved to the settings page')
      .toContain('pg-settings');
    expect(where.proj, 'while the traits are on the project page')
      .toContain('pg-project');
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
