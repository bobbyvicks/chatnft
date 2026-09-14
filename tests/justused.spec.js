/* THE COLOURS YOU JUST USED, AND ALL 256 AT ONCE.

   "at the moment we cant see all the colours on the pallete without having to
   annoyingly use a scroll bar to see stuff. I want to be able to see all of
   the colours. when you open that colour button but allso underneith colours
   now i want to to show your most recently used colours"

   Two things in one panel. The project palette had its own scroller inside a
   card that is also a scroller - you scrolled the card, reached the palette,
   and it took the wheel off you - and there was no colour history anywhere.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

/* Few colours, which is what a trait has. */
const FEW = (set, W, H) => {
  const c = [[46, 34, 47], [139, 95, 191], [242, 166, 90], [232, 213, 183]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    set(x, y, c[(x + y) % 4]);
};

const open = (page) => page.evaluate(async () => {
  railPanel('cl', true);
  await new Promise(r => setTimeout(r, 350));
});

const strip = (page) => page.$$eval('#palrecent .sw', els => els.map(e => e.dataset.hex));

/* Opening a trait preselects a colour through the same one writer, so by the
   time a test starts the strip already holds it - the test at the bottom is
   about exactly that. These clear it first so each one starts from a known
   list rather than from whatever the fixture happened to be drawn in. */
const clear = (page) => page.evaluate(() => {
  recentColours.length = 0; buildRecentColours();
});

test('A COLOUR YOU USE GOES INTO THE STRIP, NEWEST FIRST', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  await clear(page);
  await page.evaluate(() => {
    setColor('#112233'); setColor('#445566'); setColor('#778899');
  });
  expect(await strip(page)).toEqual(['#778899', '#445566', '#112233']);
});

test('and using one again moves it rather than repeating it', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  await clear(page);
  await page.evaluate(() => {
    setColor('#112233'); setColor('#445566'); setColor('#112233');
  });
  /* Going back and forth between two colours would otherwise fill the whole
     strip with those two, which is the failure this shape avoids. */
  expect(await strip(page)).toEqual(['#112233', '#445566']);
});

test('and it stops at sixteen', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  await clear(page);
  const r = await page.evaluate(() => {
    for (let i = 0; i < 30; i++)
      setColor('#' + (0x110000 + i * 0x000101).toString(16).padStart(6, '0'));
    return { n: recentColours.length, max: RECENT_COLOURS_MAX,
      first: recentColours[0] };
  });
  expect(r.n).toBe(16);
  expect(r.max).toBe(16);
  /* The newest of the thirty, so it dropped from the far end. */
  expect(r.first).toBe('#' + (0x110000 + 29 * 0x000101).toString(16).padStart(6, '0'));
});

test('THE LIVE PICKER DOES NOT FILL IT WITH COLOURS YOU SWEPT PAST',
  async ({ page }) => {
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    await clear(page);
    const r = await page.evaluate(async () => {
      const p = document.getElementById('picker');
      /* THE WHOLE DIFFICULTY. input fires continuously while the OS picker is
         dragged - that is what makes the canvas follow it live - so every
         colour passed over on the way to the one you wanted would land in the
         list and push the real entries out. */
      for (const v of ['#ff0000', '#ee0000', '#dd0000', '#cc0000']) {
        p.value = v;
        p.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const whileDragging = recentColours.slice();
      const painting = color;
      /* change fires once, when the picker is finished. */
      p.dispatchEvent(new Event('change', { bubbles: true }));
      return { whileDragging, painting, after: recentColours.slice() };
    });
    expect(r.whileDragging, 'nothing recorded while it was being dragged').toEqual([]);
    /* THE POSITIVE CONTROL beside it: the drag really was reaching setColor,
       so the emptiness above is the rule working and not the events failing
       to arrive. */
    expect(r.painting, 'but the colour did follow the drag').toBe('#cc0000');
    expect(r.after, 'and the one it settled on is the one recorded')
      .toEqual(['#cc0000']);
  });

test('IT SITS UNDER THE PICTURE COLOURS AND ABOVE THE PALETTE', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  const r = await page.evaluate(() => {
    /* DOCUMENT ORDER, not the card's direct children. The panel is two
       columns now and these live inside the column wrappers, so a
       direct-child list sees the wrappers and none of the three. Reading
       order is what "underneath" means here, and it is what a screen reader
       and the tab order follow. */
    const ids = [...document.querySelectorAll('#clscrim [id]')].map(e => e.id);
    return { ids,
      pal: ids.indexOf('pal'), rec: ids.indexOf('palrecent'),
      proj: ids.indexOf('projpal'),
      /* .swatches means "a view of the colours in the picture" and
         recolour.spec.js holds every one of them to the same set. A colour
         used an hour ago need not be in the artwork at all. */
      isSwatchView: document.getElementById('palrecent').classList.contains('swatches'),
    };
  });
  expect(r.pal).toBeGreaterThanOrEqual(0);
  expect(r.rec, 'under the colours in the picture').toBeGreaterThan(r.pal);
  expect(r.proj, 'and above the project palette').toBeGreaterThan(r.rec);
  expect(r.isSwatchView, 'not a second view of the picture colours').toBe(false);
});

test('and it is not there at all until something has been used', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  const before = await page.evaluate(() => {
    recentColours.length = 0; buildRecentColours();
    return { strip: document.getElementById('palrecent').hidden,
      label: document.getElementById('palrecentlab').hidden };
  });
  /* An empty row with a heading over it on a trait nobody has painted is
     worse than nothing there. */
  expect(before.strip).toBe(true);
  expect(before.label).toBe(true);
  const after = await page.evaluate(() => {
    setColor('#123456');
    return { strip: document.getElementById('palrecent').hidden,
      label: document.getElementById('palrecentlab').hidden };
  });
  expect(after.strip).toBe(false);
  expect(after.label).toBe(false);
});

test('THE PANEL DOES NOT SCROLL AT ALL', async ({ page }) => {
  /* "There is still an outer scroll bar in the menu so now its just a scroll
     bar in a different spot, i want to be able to eliminate that scroll bar
     completely."

     Removing the palette's own scroller moved the bar rather than losing it:
     1,046px of controls in a card that can be 940. Two columns with each
     set's tools underneath it brings that to 673. */
  for (const [w, h] of [[1600, 1000], [1500, 900], [1366, 660], [1024, 650], [860, 700], [821, 650]]) {
    await page.setViewportSize({ width: w, height: h });
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    const r = await page.evaluate(() => {
      const card = document.querySelector('#clscrim .card');
      const sw = document.querySelectorAll('#projpal .sw');
      const cb = card.getBoundingClientRect();
      const last = sw[sw.length - 1].getBoundingClientRect();
      return { scrolls: card.scrollHeight > card.clientHeight + 1,
        content: card.scrollHeight, box: Math.round(cb.height),
        onScreen: cb.left >= -0.5 && cb.right <= innerWidth + 0.5
          && cb.top >= -0.5 && cb.bottom <= innerHeight + 0.5,
        all256: last.bottom <= cb.bottom + 0.5 };
    });
    expect(r.scrolls, 'no scrollbar at ' + w + 'x' + h
      + ' (' + r.content + 'px of content in ' + r.box + ')').toBe(false);
    expect(r.all256, 'and every colour is in view at ' + w + 'x' + h).toBe(true);
    /* A 760px panel that runs off the edge of a 1280 window would be a worse
       problem than the scrollbar. popAt clamps to the right edge now. */
    expect(r.onScreen, 'and the whole panel is on screen at ' + w + 'x' + h).toBe(true);
  }
});

test('and it goes back to one column, and scrolls, when there is no room',
  async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    const r = await page.evaluate(() => {
      const card = document.querySelector('#clscrim .card');
      return { scrolls: card.scrollHeight > card.clientHeight + 1,
        cols: getComputedStyle(card).gridTemplateColumns,
        w: Math.round(card.getBoundingClientRect().width) };
    });
    /* THE CONTROL. Without it, "no scrollbar" would also pass on a panel that
       had quietly stopped showing most of its contents, and the claim above
       would be about nothing. Two columns need 760px of card; below that the
       panel is the single column it always was, and it scrolls. */
    expect(r.w, 'one column').toBe(560);
    expect(r.scrolls, 'which does scroll').toBe(true);
  });

test('ALL 256 COLOURS, WITH NO SCROLLER INSIDE THE SCROLLER', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  const r = await page.evaluate(() => {
    const card = document.querySelector('#clscrim .card');
    const pp = document.getElementById('projpal');
    const sw = pp.querySelectorAll('.sw');
    const cb = card.getBoundingClientRect();
    const last = sw[sw.length - 1].getBoundingClientRect();
    const one = sw[0].getBoundingClientRect();
    return {
      n: sw.length,
      innerScroller: pp.scrollHeight > pp.clientHeight + 1,
      lastVisible: last.bottom <= cb.bottom + 0.5 && last.top >= cb.top - 0.5,
      swH: Math.round(one.height),
      cols: getComputedStyle(pp).gridTemplateColumns.split(' ').length,
    };
  });
  expect(r.n).toBe(256);
  /* THE THING BEING COMPLAINED ABOUT. The palette had max-height:38dvh and
     overflow-y:auto inside a card that also scrolls. */
  expect(r.innerScroller, 'the palette no longer scrolls inside the card').toBe(false);
  /* And the last of the 256 is on screen when the panel opens, on a trait
     with the handful of colours a trait has. */
  expect(r.lastVisible, 'the 256th colour is visible without scrolling').toBe(true);
  /* NEITHER OF THE TWO THINGS THAT MAKE THE ARITHMETIC WORK MOVED. Sixteen is
     the grid the palette is published on - its rows are ramps, and any other
     width cuts the families in half - and 22px is the floor every target in
     this app is held to. */
  expect(r.cols, 'still the 16-wide grid it is published on').toBe(16);
  expect(r.swH, 'still clears the 22px target floor').toBeGreaterThanOrEqual(22);
});

test('ON A TOUCH SCREEN THE TOOL BLOCKS FOLD', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrait(page, { w: 32, h: 32, draw: FEW });
  await open(page);
  const shut = await page.evaluate(() => ({
    rc: document.getElementById('clrcbody').getBoundingClientRect().height,
    file: document.getElementById('clfilebody').getBoundingClientRect().height,
    tog: getComputedStyle(document.querySelector('#clrc .clsectog')).display,
    said: document.querySelector('#clrc .clsectog').getAttribute('aria-expanded'),
    /* The two things the panel is FOR are not folded. */
    pal: document.getElementById('pal').getBoundingClientRect().height,
    proj: document.getElementById('projpal').getBoundingClientRect().height,
  }));
  /* 1,234px of content in an 810px card, and two columns are not available
     here: the sheet floors targets at 30px for touch and the palette is 16
     wide, so splitting it would put them under that floor. Folding the two
     tool blocks is what is left. */
  expect(shut.rc, 'the recolour tools start folded').toBe(0);
  expect(shut.file, 'and so does the palette file block').toBe(0);
  expect(shut.tog, 'with a toggle you can see').toBe('flex');
  expect(shut.said).toBe('false');
  /* THE CONTROL. Folding the colours themselves would be a worse panel than
     one that scrolls - "can you make the colours that are in the current
     artwork always visible" was an earlier ask and this must not undo it. */
  expect(shut.pal, 'the trait colours are still there').toBeGreaterThan(0);
  expect(shut.proj, 'and so is the palette').toBeGreaterThan(0);

  await page.click('#clrc .clsectog');
  await page.waitForTimeout(150);
  const open2 = await page.evaluate(() => ({
    rc: document.getElementById('clrcbody').getBoundingClientRect().height,
    said: document.querySelector('#clrc .clsectog').getAttribute('aria-expanded'),
    clean: document.getElementById('rcclean').getBoundingClientRect().height > 0,
  }));
  expect(open2.rc, 'a tap opens it').toBeGreaterThan(100);
  expect(open2.said).toBe('true');
  expect(open2.clean, 'and the buttons inside really are reachable').toBe(true);
});

test('and on a wider screen there is no toggle and nothing is folded',
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    const r = await page.evaluate(() => ({
      tog: getComputedStyle(document.querySelector('#clrc .clsectog')).display,
      rc: document.getElementById('clrcbody').getBoundingClientRect().height,
      file: document.getElementById('clfilebody').getBoundingClientRect().height,
    }));
    /* THE REASON NOTHING IS REMEMBERED. The rule that hides a body lives
       inside the touch query, so a block folded on a phone cannot follow
       anybody onto a desktop and sit there shut with a toggle that is not
       rendered to open it again. */
    expect(r.tog, 'no toggle where there is room').toBe('none');
    expect(r.rc, 'and the tools are simply there').toBeGreaterThan(100);
    expect(r.file).toBeGreaterThan(50);
  });

test('EVERY COLOUR IS REACHABLE ON A PHONE', async ({ page }) => {
  /* Found by measuring, and confirmed against the committed version so it was
     not new: the palette is 16 columns and the touch sheet floors targets at
     30px, so one row wanted 16*30 + 15*3 = 525px in a box of 321. The last
     six columns of all sixteen rows ran off the side - not clipped, not
     scrollable, simply unreachable. About 40% of the palette, on every phone.

     Sixteen tappable swatches do not fit a phone, so the grid asks for as
     many 30px columns as the box holds instead. The ramps break up here and
     the palette gets taller; both were the trade chosen over swatches too
     small to hit. */
  for (const [w, h, want] of [[390, 844, 9], [414, 896, 10], [600, 900, 15]]) {
    await page.setViewportSize({ width: w, height: h });
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    const r = await page.evaluate(() => {
      const pp = document.getElementById('projpal');
      const sw = [...pp.querySelectorAll('.sw')];
      const box = pp.getBoundingClientRect();
      let minSide = 1e9, past = -1e9;
      for (const s of sw) {
        const b = s.getBoundingClientRect();
        minSide = Math.min(minSide, b.width, b.height);
        past = Math.max(past, b.right - box.right);
      }
      return { n: sw.length, minSide: Math.round(minSide),
        past: Math.round(past),
        overflowX: pp.scrollWidth > pp.clientWidth + 1,
        cols: getComputedStyle(pp).gridTemplateColumns.split(' ').length };
    });
    expect(r.n, 'all 256 are there at ' + w).toBe(256);
    /* THE DEFECT ITSELF. */
    expect(r.overflowX, 'nothing runs off the side at ' + w).toBe(false);
    expect(r.past, 'and no swatch is past the right edge at ' + w)
      .toBeLessThanOrEqual(0);
    /* AND THEY ARE STILL BIG ENOUGH TO HIT, which is the whole reason the
       column count had to come down rather than the swatches. */
    expect(r.minSide, 'every target clears 30px at ' + w).toBeGreaterThanOrEqual(30);
    expect(r.cols, 'as many as fit at ' + w).toBe(want);
  }
});

test('and the published 16-wide grid is what every screen with room still shows',
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openTrait(page, { w: 32, h: 32, draw: FEW });
    await open(page);
    const r = await page.evaluate(() => {
      const pp = document.getElementById('projpal');
      const sw = pp.querySelector('.sw').getBoundingClientRect();
      return { cols: getComputedStyle(pp).gridTemplateColumns.split(' ').length,
        side: Math.round(sw.width),
        overflowX: pp.scrollWidth > pp.clientWidth + 1 };
    });
    /* THE CONTROL. The phone rule must not reach a screen that has room:
       sixteen is the width the palette is published at and its rows are
       ramps, so any other count cuts the families in half. */
    expect(r.cols, 'sixteen where there is room for sixteen').toBe(16);
    expect(r.side, 'at the 22px floor a mouse is held to').toBeGreaterThanOrEqual(22);
    expect(r.overflowX).toBe(false);
  });
