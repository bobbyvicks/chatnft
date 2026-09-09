/* THE PAGE ON A PHONE.

   Everything here was found by looking at the site at 375 by 812 with touch on,
   and every one of these went the other way before the change it guards.

   THE VIEWPORT IS THE FIXTURE. These run in their own emulated phone rather
   than the suite's 1280x900 desktop, because most of what they assert is
   decided by a media query and would be vacuously true at the default size -
   which is the shape of the mistake this file is for. Each test that depends on
   the emulation asserts the emulation first: a run where (hover:none) does not
   match is a broken instrument, not a passing page, and has to say so. */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3,
  hasTouch: true, isMobile: true });

const open = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) { /* older build without the lock */ }
    try { gateShow(false); } catch (_) {}
  });
};

/* A small collection of real-sized traits, so the memory assertions are about
   the artwork this was built for rather than about sprites. */
const seed = async (page, n = 12) => {
  await page.evaluate(async (n) => {
    await dbClear();
    const S = 1280;
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
  }, n);
  await page.evaluate(() => { try { showPage('project', false); } catch (_) {} });
  await page.evaluate(() => renderShelf());
  await page.waitForTimeout(500);
};

test.describe('the page on a phone', () => {
  test('NO FIELD IS SMALL ENOUGH TO ZOOM THE PAGE IN', async ({ page }) => {
    /* iOS Safari zooms the layout when a focused field is under 16px and does
       not zoom back out. Measured before the fix: 69 of 69 were under, starting
       with the username box on the sign-in card. */
    await open(page);
    const r = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input,select,textarea')) {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        if (['color', 'range', 'checkbox', 'radio', 'file', 'hidden'].indexOf(t) >= 0) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 16) out.push((el.id || t) + ' ' + px + 'px');
      }
      return { small: out, total: document.querySelectorAll('input,select,textarea').length };
    });
    expect(r.total, 'there are fields on the page to check at all').toBeGreaterThan(40);
    expect(r.small, 'every field a caret can enter is at least 16px').toEqual([]);
  });

  test('and the sign-in field, which is the first one anybody touches',
    async ({ page }) => {
      /* Named on its own because it is the one that decides whether the page is
         zoomed for the whole of the rest of the session. */
      await page.goto('/index.html');
      const px = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.getElementById('gateuser')).fontSize));
      expect(px).toBeGreaterThanOrEqual(16);
    });

  test('A TRAIT CAN BE REMOVED WITHOUT A MOUSE, AND IT ASKS FIRST', async ({ page }) => {
    await open(page);
    await seed(page, 6);
    const hoverless = await page.evaluate(() => matchMedia('(hover:none)').matches);
    expect(hoverless, 'the phone emulation is real, or this test proves nothing').toBe(true);

    const shown = await page.evaluate(() => {
      const x = document.querySelector('#projbody .item .x');
      if (!x) return null;
      const b = x.getBoundingClientRect();
      return { display: getComputedStyle(x).display, w: Math.round(b.width), h: Math.round(b.height) };
    });
    expect(shown, 'the tile has a remove button at all').not.toBeNull();
    expect(shown.display, 'and it is on screen with nothing to hover with').not.toBe('none');
    expect(Math.min(shown.w, shown.h), 'at a size a thumb can hit').toBeGreaterThanOrEqual(28);

    /* It asks. Playwright dismisses a dialog by default, so a remove that goes
       ahead anyway shows up as a trait that disappeared. */
    let asked = '';
    page.on('dialog', d => { asked = d.message(); d.dismiss(); });
    const before = await page.evaluate(() => document.querySelectorAll('#projbody .item').length);
    await page.evaluate(() => document.querySelector('#projbody .item .x').click());
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.querySelectorAll('#projbody .item').length);
    expect(asked, 'it says what it is about to remove').toContain('Remove');
    expect(after, 'and saying no removes nothing').toBe(before);
  });

  test('the controls under a tile are big enough to tell apart', async ({ page }) => {
    await open(page);
    await seed(page, 6);
    const r = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#projbody .item .shelftools button')];
      const box = btns.map(b => b.getBoundingClientRect());
      return {
        count: btns.length,
        minW: Math.round(Math.min(...box.map(b => b.width))),
        minH: Math.round(Math.min(...box.map(b => b.height))),
      };
    });
    expect(r.count, 'the five per-tile controls are there').toBeGreaterThanOrEqual(5);
    expect(r.minW, 'and are wider than the 24px they were').toBeGreaterThanOrEqual(34);
    expect(r.minH, 'and taller than the 20px they were').toBeGreaterThanOrEqual(30);
  });

  test('and so is the one door to every colour operation', async ({ page }) => {
    /* MEASURED WITH THE EDITOR OPEN. #clbtn lives in the options strip, so on
       the project page it has no box at all - a first version of this test
       measured a hidden element and read 0, which is not a small button. */
    await open(page);
    await page.evaluate(() => {
      const w = 32, h = 32, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 3] = 255; }
      fileName = 'phone.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForFunction(() => !document.getElementById('app').hidden);
    const c = await page.evaluate(() => {
      const el = document.getElementById('clbtn');
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    });
    expect(Math.min(c.w, c.h), 'the colour button is a target, not a dot')
      .toBeGreaterThanOrEqual(30);
  });

  test('NOTHING ON ANY PAGE STICKS OUT PAST THE SCREEN', async ({ page }) => {
    /* THE DOCUMENT WIDTH IS NOT THE MEASUREMENT. A first version of this
       compared documentElement.scrollWidth with innerWidth and passed on the
       page that had the defect - body carries overflow:hidden auto, so a child
       wider than the screen is CLIPPED rather than scrolled to, and the check
       could never see it. What a person sees is an element with its right-hand
       border cut off, so that is what is measured: any visible element whose
       right edge is past the viewport.

       Anything inside a deliberately side-scrolling ancestor is excluded by
       reading its ancestors' computed overflow-x rather than by naming the tool
       rail, so a second scroller added later is covered too. */
    await open(page);
    await seed(page, 6);
    const pages = await page.evaluate(() =>
      [...document.querySelectorAll('.pgtab')].map(b => b.dataset.page));
    const over = [];
    for (const p of pages) {
      await page.evaluate((p) => showPage(p, false), p);
      await page.waitForTimeout(150);
      const bad = await page.evaluate(() => {
        const scrolls = (el) => {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const ox = getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
          }
          return false;
        };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.right <= window.innerWidth + 1) continue;
          if (scrolls(el)) continue;
          out.push((el.id ? '#' + el.id : el.tagName.toLowerCase()
            + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
            + ' right=' + Math.round(r.right) + ' of ' + window.innerWidth);
        }
        return out;
      });
      for (const x of bad) over.push(p + ': ' + x);
    }
    expect(over, 'nothing hangs past the right edge at 375px').toEqual([]);
  });

  test("and the Fix pixels dropzone fits the panel it lives in", async ({ page }) => {
    /* .drop is width:min(560px,92vw), which is right on the home page where it
       is a centred child of .land and wrong inside a .panelbox that is itself
       92vw and padded - the box was 345px in a 309px content box and its
       borders were cut off on both sides.

       WHAT THIS DOES NOT SAY. The finding that sent me here called it "the only
       horizontal overflow anywhere on the site" and said the page rendered
       wider than the screen. Measured on the page before the fix: the dropzone
       ran to exactly the viewport edge, not past it, because body carries
       overflow-x:hidden. It overflowed its PANEL, not the screen, so that is
       what is asserted. */
    await open(page);
    await page.evaluate(() => showPage('fixer', false));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const d = document.getElementById('fixdrop'), p = d.closest('.panelbox');
      const b = d.getBoundingClientRect(), q = p.getBoundingClientRect();
      return { dl: b.left, dr: b.right, pl: q.left, pr: q.right };
    });
    expect(r.dl >= r.pl - 1, 'the dropzone starts inside its panel').toBe(true);
    expect(r.dr <= r.pr + 1, 'and ends inside it').toBe(true);
  });

  test('a review tile is a thumbnail, not the whole collection canvas',
    async ({ page }) => {
      /* revPaint used to size every tile to the collection canvas - 1280x1280,
         6.25 MB each - and revBuild fired one per candidate without awaiting. */
      await open(page);
      await seed(page, 8);
      const r = await page.evaluate(async () => {
        const t = (await dbAll()).filter(i => i.kind === 'trait');
        if (t.length < 2) return null;
        revCond = traitKey(t[0]);
        revLayer = t[1].layer;
        await revBuild();
        const cv = [...document.querySelectorAll('#revgrid .revtile canvas')];
        let bytes = 0;
        for (const c of cv) bytes += c.width * c.height * 4;
        return { tiles: cv.length,
          biggest: cv.reduce((m, c) => Math.max(m, c.width, c.height), 0),
          mb: +(bytes / 1048576).toFixed(2) };
      });
      test.skip(!r || !r.tiles, 'this collection produced no review tiles');
      expect(r.biggest, 'no tile takes the collection canvas').toBeLessThanOrEqual(192);
      expect(r.mb, 'and the whole grid is a fraction of one full-size tile')
        .toBeLessThan(2);
    });

  test('AND THE BITMAP CACHE SURVIVES BEING ASKED FOR ONE TRAIT TWICE AT ONCE',
    async ({ page }) => {
      /* The regression that a running total caused: two calls for one record in
         flight together both decode, the second replaces the first in the Map,
         and a counter credited twice and debited once climbs until the budget
         evicts the cache to a single entry and keeps it there. */
      await open(page);
      await seed(page, 10);
      const r = await page.evaluate(async () => {
        const recs = (await dbAll()).filter(i => i.kind === 'trait').slice(0, 6);
        /* Every record asked for three times at once, twice over. */
        for (let round = 0; round < 2; round++) {
          const jobs = [];
          for (const rec of recs) for (let k = 0; k < 3; k++) jobs.push(cBitmap(rec));
          const got = await Promise.all(jobs);
          if (got.some(b => !b || !b.width)) return { broken: 'a decode came back closed or empty' };
        }
        let bytes = 0;
        for (const b of cBitmaps.values()) bytes += b.width * b.height * 4;
        return { size: cBitmaps.size, mb: +(bytes / 1048576).toFixed(1),
          accounted: +(cBitmapBytes() / 1048576).toFixed(1), asked: recs.length };
      });
      expect(r.broken, 'every concurrent caller got a usable bitmap').toBeUndefined();
      expect(r.accounted, 'the cache knows its own size').toBe(r.mb);
      expect(r.size, 'and it did not evict itself down to one entry')
        .toBeGreaterThan(1);
    });

  test('switching away from the tab writes the drawing down', async ({ page }) => {
    /* autosave debounces by 1500ms and nothing used to flush it, so a stroke
       followed by switching apps was lost to a timer that never ran. */
    await open(page);
    await page.evaluate(() => {
      const w = 32, h = 32, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 1] = 80; d[i + 2] = 90; d[i + 3] = 255; }
      fileName = 'phone.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForFunction(() => !document.getElementById('app').hidden);
    await page.evaluate(async () => {
      await dbDel(draftId());
      /* No dab() here on purpose: it reads the tool state a real stroke sets
         up, and what this test is about is the FLUSH. An unattached canvas is
         the case autosaveNow always keeps - it is the only copy of a picture
         that has never been saved anywhere - so scheduling one is enough. */
      autosave();
    });
    const beforeFlush = await page.evaluate(async () => !!(await dbAll()).find(i => i.id === draftId()));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    const afterFlush = await page.evaluate(async () => !!(await dbAll()).find(i => i.id === draftId()));
    expect(beforeFlush, 'the debounce really was still pending').toBe(false);
    expect(afterFlush, 'and going away wrote it down').toBe(true);
  });
});
