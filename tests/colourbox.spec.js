/* THE COLOURS, ALWAYS OPEN, AND THE RAIL THEY MUST NOT PUSH OFF THE SCREEN.

   "at the moment the colour options are annoying to get too so can you have
   that option always be open in the colour box (make that the top left and
   move buttons below it and make them fit so we dont loose editinng size)"

   Two halves, and the second half is the one that broke. The strip went in
   above the tools and the tools spilled out of their own column: at 1280x900
   the rule, the grid button, the keys button and the pan button all sat
   outside it, unreachable. The page as it shipped had nothing outside the
   rail at any of the nine window shapes below, so that was a regression and
   not a pre-existing overflow the strip revealed.

   THE SPILL TEST HERE FAILS ON THAT PAGE - 4 outside at 1280x900, 5 at
   860x640, 1 at 1280x720 - which is what makes it worth keeping.

   AND "we dont loose editinng size" IS MEASURED AGAINST THE PAGE ITSELF
   rather than a table of numbers written down once. Each shape is fitted
   twice: as it is, and with the box taken out of the document. If the box
   costs a zoom step the two disagree. A recorded constant could not tell a
   regression from a deliberate change to the fit; this can. */
import { test, expect } from '@playwright/test';

/* A trait with enough colours to fill the strip and overflow it. */
const open = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  const S = 96;
  const d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    d[i] = (x * 5) % 256; d[i + 1] = (y * 7) % 256; d[i + 2] = ((x + y) * 11) % 256; d[i + 3] = 255;
  }
  fileName = 'probe';
  startEditor(d, S, S, S, S, palette(d, S * S, 64, 256), false);
  await new Promise(r => setTimeout(r, 300));
  return [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex);
});

const both = (page) => page.evaluate(() => ({
  card: [...document.querySelectorAll('#pal .sw')].map(s => s.dataset.hex),
  strip: [...document.querySelectorAll('#palrail .sw')].map(s => s.dataset.hex),
  cardMarked: [...document.querySelectorAll('#pal .sw[data-rc="1"]')].map(s => s.dataset.hex),
  stripMarked: [...document.querySelectorAll('#palrail .sw[data-rc="1"]')].map(s => s.dataset.hex),
  cardTo: [...document.querySelectorAll('#pal .sw[data-to="1"]')].map(s => s.dataset.hex),
  stripTo: [...document.querySelectorAll('#palrail .sw[data-to="1"]')].map(s => s.dataset.hex),
  current: color,
}));

/* The nine shapes the rail was probed at, wide and narrow, tall and short.
   860x640 and 1280x720 are in here because they are the two that spilled
   worst and neither is an unusual window. */
const SHAPES = [[1280, 900], [1600, 1000], [1024, 768], [900, 1200], [1440, 780],
                [860, 640], [1280, 720], [1024, 700], [1366, 768]];

test('the colours are on screen without opening anything', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  const hexes = await open(page);
  expect(hexes.length).toBeGreaterThan(8);

  const seen = await page.evaluate(() => {
    const box = document.getElementById('colbox');
    const r = box.getBoundingClientRect();
    const sw = box.querySelector('#palrail .sw').getBoundingClientRect();
    return {
      shown: getComputedStyle(box).display !== 'none',
      inWindow: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
      /* NOT BEHIND THE DOOR: no card, no scrim, nothing to press first. */
      cardUp: !document.getElementById('clscrim') || !document.getElementById('clscrim').hidden,
      swatchVisible: sw.width > 0 && sw.height > 0 && sw.top >= r.top - 0.5 && sw.bottom <= r.bottom + 0.5,
    };
  });
  expect(seen.shown).toBe(true);
  expect(seen.inWindow).toBe(true);
  expect(seen.cardUp).toBe(false);
  expect(seen.swatchVisible).toBe(true);
});

test('the strip holds the same colours as the card, in the same order', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  const v = await both(page);
  expect(v.strip).toEqual(v.card);
  expect(v.strip.length).toBeGreaterThan(8);
});

test('a colour picked in the strip is picked in the card', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  /* THE PRECONDITION, ASSERTED. Nothing is marked before the click, or a
     test that finds a mark afterwards has found the state it started in. */
  const before = await both(page);
  expect(before.cardMarked).toEqual([]);
  expect(before.stripMarked).toEqual([]);

  const hex = await page.evaluate(() => {
    const s = document.querySelectorAll('#palrail .sw')[3];
    s.click();
    return s.dataset.hex;
  });
  const after = await both(page);
  expect(after.current).toBe(hex);
  expect(after.cardMarked).toEqual([hex]);
  expect(after.stripMarked).toEqual([hex]);

  /* AND THE MARK PAINTED IN PLACE REACHES BOTH. rcSummary writes data-to onto
     the swatches without rebuilding them, so the strip has to be named in its
     selector - it was not, at first, and the card showed a target the strip
     did not. */
  const to = await page.evaluate(() => {
    const s = document.querySelectorAll('#palrail .sw')[5];
    s.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return s.dataset.hex;
  });
  const marked = await both(page);
  expect(marked.cardTo).toEqual([to]);
  expect(marked.stripTo).toEqual([to]);
});

test('a big palette scrolls in the box instead of growing it', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  const r = await page.evaluate(() => {
    const box = document.getElementById('colbox');
    return { h: Math.round(box.getBoundingClientRect().height),
      overflows: box.scrollHeight > box.clientHeight + 1,
      count: box.querySelectorAll('.sw').length,
      scrollable: getComputedStyle(box).overflowY };
  });
  expect(r.count).toBeGreaterThan(8);
  expect(r.h).toBeLessThanOrEqual(96);
  expect(r.scrollable).toBe('auto');
  /* The cap only means something while there is more than fits. */
  expect(r.overflows).toBe(true);
});

test('no tool sits outside the rail at any of nine window shapes', async ({ page }) => {
  const spilled = [];
  for (const [w, h] of SHAPES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
    await open(page);
    const out = await page.evaluate(() => {
      const rail = document.querySelector('.tools');
      const rr = rail.getBoundingClientRect();
      return [...rail.children].filter(k => {
        const b = k.getBoundingClientRect();
        return b.right > rr.right + 1 || b.bottom > rr.bottom + 1;
      }).map(k => k.id || k.getAttribute('data-tool') || k.className);
    });
    if (out.length) spilled.push(w + 'x' + h + ': ' + out.join(', '));
  }
  expect(spilled).toEqual([]);
});

test('the box costs no zoom step at any of nine window shapes', async ({ page }) => {
  const lost = [];
  for (const [w, h] of SHAPES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
    await open(page);
    const r = await page.evaluate(() => {
      fitZoom();
      const withBox = zoom;
      /* THE CONTROL: the same page with the box taken out. Removed rather
         than hidden, so its grid row collapses exactly as it would if the
         colours had never been put there. */
      const box = document.getElementById('colbox');
      const home = box.nextSibling, parent = box.parentNode;
      box.remove();
      fitZoom();
      const without = zoom;
      parent.insertBefore(box, home);
      fitZoom();
      return { withBox, without };
    });
    if (r.withBox !== r.without)
      lost.push(w + 'x' + h + ': ' + r.without + ' without the box, ' + r.withBox + ' with it');
  }
  expect(lost).toEqual([]);
});

test('the colours sit above the tools and share the column edge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  const g = await page.evaluate(() => {
    const box = document.getElementById('colbox').getBoundingClientRect();
    const rail = document.querySelector('.tools').getBoundingClientRect();
    const stage = document.querySelector('.stage').getBoundingClientRect();
    return { boxTop: box.top, railTop: rail.top, boxBottom: box.bottom,
      boxLeft: box.left, railLeft: rail.left,
      boxRight: box.right, railRight: rail.right,
      stageLeft: stage.left };
  });
  /* Top left, as asked, with the tools under it. */
  expect(g.boxBottom).toBeLessThanOrEqual(g.railTop + 1);
  expect(Math.abs(g.boxLeft - g.railLeft)).toBeLessThan(1.5);
  /* One column, not two: a box narrower or wider than the rail would put a
     step in the edge that runs down the side of the stage. */
  expect(Math.abs(g.boxRight - g.railRight)).toBeLessThan(1.5);
  expect(g.stageLeft).toBeGreaterThanOrEqual(g.railRight - 1);
});

test('the rail is a grid item, which is what stops it spilling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  /* THE MECHANISM, NOT THE SYMPTOM. The rail wraps to the columns its height
     forces, and the track can only be sized for that when the height is the
     row's - definite before the track is measured. Wrapped in anything, it is
     not, and the spill above comes straight back. */
  const r = await page.evaluate(() => {
    const rail = document.querySelector('.tools'), box = document.getElementById('colbox');
    const app = document.querySelector('.app');
    return { railParent: rail.parentElement === app,
      boxParent: box.parentElement === app,
      railArea: getComputedStyle(rail).gridArea.split(' ')[0],
      boxArea: getComputedStyle(box).gridArea.split(' ')[0],
      rows: getComputedStyle(app).gridTemplateRows.split(' ').length };
  });
  expect(r.railParent).toBe(true);
  expect(r.boxParent).toBe(true);
  expect(r.railArea).toBe('tools');
  expect(r.boxArea).toBe('cols');
  /* Five areas want five rows. Four would make the stage's row auto, and the
     stage would stop being the thing that grows. */
  expect(r.rows).toBe(5);
});

test('a phone keeps the door and does not get the box', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startEditor === 'function');
  await open(page);
  const r = await page.evaluate(() => {
    const box = document.getElementById('colbox');
    const rail = document.querySelector('.tools').getBoundingClientRect();
    return { boxShown: getComputedStyle(box).display !== 'none',
      doorThere: !!document.getElementById('clbtn'),
      railLiesDown: rail.width > rail.height,
      sideways: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  /* The rail lies down here and the vertical budget is the scarce one, so
     the colours stay behind their button. */
  expect(r.boxShown).toBe(false);
  expect(r.doorThere).toBe(true);
  expect(r.railLiesDown).toBe(true);
  expect(r.sideways).toBe(false);
});
