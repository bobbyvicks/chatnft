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

  test('A STATUS TAP ANSWERS AT ONCE, WITH RULES SAVED', async ({ page }) => {
    /* Measured before this, at 318 traits and 158 never-together rules - the
       shape of the real collection: one status change cost 2,022 ms, of which
       1,780 was a single cold distributionOf. A status change moves the record
       to a new id, which changes the memo key, so EVERY one of them paid it.
       Nothing was on screen for the whole of it, which reads as a dead button.

       ASSERTED AS A MECHANISM, NOT A DEADLINE. The first version of this test
       seeded 40 traits and asserted the render returned inside 900 ms - and it
       PASSED on the page that had the defect, because 40 traits is small enough
       that the simulation fits in the budget. A threshold that only fails at
       one scale is not a guard. What actually changed is WHICH figure the tile
       paints first, and that is true at any size: the weights-alone number
       immediately, the sampled one when it lands. The two have to differ, or
       this proves nothing either - so that is checked too. */
    await open(page);
    await page.evaluate(async () => {
      await dbClear();
      const S = 160;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d');
      const recs = [];
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'hsl(' + (i * 37 % 360) + ' 60% 45%)';
        g.fillRect(0, 0, S, S);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const layer = LAYERS[i % LAYERS.length];
        const rec = { id: 't_r' + i + '_' + layer + '_approved', kind: 'trait', name: 'r' + i,
          layer, w: S, h: S, blob, status: 'approved', synced: true };
        await dbPut(rec); recs.push(rec);
      }
      /* Rules that actually bite, so the sampled figure and the arithmetic one
         are different numbers. Pairs across layers, which is what the rules in
         a real collection are. */
      const keys = recs.map(r => traitKey(r));
      const groups = [];
      for (let i = 0; i + 1 < keys.length; i += 2) groups.push([keys[i], keys[i + 1]]);
      await dbPut({ id: RULES_ID, kind: 'settings', at: Date.now(), groups });
    });
    await page.evaluate(() => { try { showPage('project', false); } catch (_) {} });
    await page.evaluate(() => renderShelf());
    await page.waitForTimeout(1200);

    /* A cold render, which is what a status change is: the memo key moves with
       the record's id, so the simulation cannot be reused. */
    const first = await page.evaluate(async () => {
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const t = items[0];
      const moved = { ...t, id: 't_' + t.name + '_' + t.layer + '_wip', status: 'wip' };
      await dbDel(t.id); await dbPut(moved);
      try { distCache = null; distKey = ''; } catch (_) {}
      await renderShelf();
      const now = (await dbAll()).filter(i => i.kind === 'trait');
      const out = [];
      for (const el of document.querySelectorAll('#projbody .item')) {
        const name = (el.querySelector('b') || {}).textContent;
        const p = el.querySelector('.pct');
        if (!name || !p || p.classList.contains('never')) continue;
        const rec = now.find(i => i.name === name);
        if (!rec) continue;
        const c = traitChance(rec, now, false, 'defer');
        out.push({ name, shown: p.textContent, plain: '~' + pctLabel(c.plain) });
      }
      return { rules: RULES.length, rows: out.slice(0, 10) };
    });
    expect(first.rules, 'the rules really are loaded, or this measures nothing')
      .toBeGreaterThan(10);
    expect(first.rows.length, 'there are tiles with a figure on them').toBeGreaterThan(3);
    for (const r of first.rows)
      expect(r.shown, r.name + ' paints the weights-alone figure first').toBe(r.plain);

    /* And then it settles on the sampled one, which is what the "~" has always
       promised - and which has to be a DIFFERENT number for at least one tile,
       or the check above passed for the wrong reason. */
    await page.waitForTimeout(2500);
    const settled = await page.evaluate(async () => {
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const dist = distributionOf(items, false);
      const out = [];
      for (const el of document.querySelectorAll('#projbody .item')) {
        const name = (el.querySelector('b') || {}).textContent;
        const p = el.querySelector('.pct');
        if (!name || !p || p.classList.contains('never')) continue;
        const rec = items.find(i => i.name === name);
        if (!rec) continue;
        out.push({ name, shown: p.textContent,
          sampled: '~' + pctLabel(traitChance(rec, items, false, dist).pct),
          plain: '~' + pctLabel(traitChance(rec, items, false, 'defer').plain) });
      }
      return out.slice(0, 10);
    });
    expect(settled.length, 'there are tiles to compare').toBeGreaterThan(3);
    for (const r of settled)
      expect(r.shown, r.name + ' settles on the sampled figure').toBe(r.sampled);
    expect(settled.some(r => r.sampled !== r.plain),
      'the two figures differ somewhere, so the first check was not vacuous').toBe(true);
  });

  /* BY LABEL, NOT BY CLASS. The class is part of the change, so a test that
     finds the button by it fails on the old page for the wrong reason - the
     selector, rather than the behaviour. Its label is what a person reads and
     is the same on both. */
  const pickButtons = (page, n) => page.evaluate((n) => {
    const out = [];
    for (const t of document.querySelectorAll('#projbody .item .shelftools')) {
      for (const b of t.querySelectorAll('button')) {
        if (b.textContent === 'pick' || b.textContent === 'picked') { out.push(b); break; }
      }
      if (out.length >= n) break;
    }
    window.__picks = out;
    return out.length;
  }, n);

  test('PICKING A TRAIT DOES NOT REBUILD THE SHELF', async ({ page }) => {
    /* Picking is a selection. It changes a button's label, a border and a
       count - and it went through renderShelf, which rebuilds every tile, both
       panels and every observer. Measured at 318 traits: 51 ms a pick before,
       1 ms after; six picks, which is the whole point of picking, went from
       307 ms to 6. On phone silicon that difference is seconds.

       COUNTED, NOT TIMED. A threshold would pass on a fast machine with a
       small fixture, which is how the status-tap test in this file first
       fooled itself. What changed is that no render happens at all. */
    await open(page);
    await seed(page, 8);
    expect(await pickButtons(page, 4), 'there are four tiles to pick').toBe(4);
    const r = await page.evaluate(async () => {
      let renders = 0;
      const real = window.renderShelf;
      window.renderShelf = function (...a) { renders++; return real.apply(this, a); };
      try {
        for (const b of window.__picks) b.click();
        await new Promise(res => setTimeout(res, 500));
        return {
          renders,
          picked: document.querySelectorAll('#projbody .item.picked').length,
          count: (document.getElementById('shelfpickcount') || {}).textContent,
          moveOn: !document.getElementById('shelfpickmove').disabled,
        };
      } finally { window.renderShelf = real; }
    });
    /* AND IT STILL SHOWS, first: a change that simply stopped rendering would
       satisfy the render count and leave the selection invisible. */
    expect(r.picked, 'every picked tile is marked').toBe(4);
    expect(r.count, 'and the bar counts them').toBe('4 picked');
    expect(r.moveOn, 'and Move is offered').toBe(true);
    expect(r.renders, 'and picking rebuilt the shelf not once').toBe(0);
  });

  test('and clearing the selection does not either', async ({ page }) => {
    await open(page);
    await seed(page, 8);
    expect(await pickButtons(page, 3), 'there are three tiles to pick').toBe(3);
    const ready = await page.evaluate(async () => {
      for (const b of window.__picks) b.click();
      await new Promise(res => setTimeout(res, 500));
      return document.querySelectorAll('#projbody .item.picked').length;
    });
    /* THE PRECONDITION, because without it this passes on a page where nothing
       was ever picked: Clear is disabled, the click does nothing, and every
       assertion below is true of an empty selection. That is exactly how the
       first version of this test passed against the page it was written to
       fail on. */
    expect(ready, 'three traits really are picked before Clear is pressed').toBe(3);
    const r = await page.evaluate(async () => {
      let renders = 0;
      const real = window.renderShelf;
      window.renderShelf = function (...a) { renders++; return real.apply(this, a); };
      try {
        document.getElementById('shelfpicknone').click();
        await new Promise(res => setTimeout(res, 500));
        return { renders, picked: document.querySelectorAll('#projbody .item.picked').length,
          count: (document.getElementById('shelfpickcount') || {}).textContent,
          moveOff: document.getElementById('shelfpickmove').disabled };
      } finally { window.renderShelf = real; }
    });
    expect(r.picked, 'nothing is left marked').toBe(0);
    expect(r.count, 'and the bar says so').toBe('Nothing picked');
    expect(r.moveOff, 'and Move is not offered').toBe(true);
    expect(r.renders, 'and Clear rebuilt the shelf not once').toBe(0);
  });

  test('THE PAGE KEEPS CLEAR OF THE NOTCH AND THE HOME INDICATOR', async ({ page }) => {
    /* The viewport meta says viewport-fit=cover, which takes the space under
       the hardware and hands the page four env(safe-area-inset-*) values to
       stay clear of it. Nothing in the file read one - grep for env( returned
       nothing across 30,000 lines - so in landscape, with the toolbar
       collapsed, or added to the home screen, the close button, the account
       button, the footer's zoom controls and the shelf's move bar sat under the
       hardware.

       ENV() CANNOT BE SET FROM A TEST, which is why the insets go through four
       variables: this gives the page a 34px bottom and 44px left and right, the
       numbers a notched iPhone actually reports, and checks the page moves. */
    await open(page);
    const before = await page.evaluate(() => {
      const px = (el, p) => Math.round(parseFloat(getComputedStyle(el)[p]));
      return {
        footer: px(document.querySelector('footer'), 'paddingBottom'),
        header: px(document.querySelector('header'), 'paddingTop'),
        acct: Math.round(parseFloat(getComputedStyle(document.querySelector('.acct')).right)),
      };
    });
    const after = await page.evaluate(() => {
      const r = document.documentElement.style;
      r.setProperty('--sab', '34px');
      r.setProperty('--sal', '44px');
      r.setProperty('--sar', '44px');
      r.setProperty('--sat', '47px');
      const px = (el, p) => Math.round(parseFloat(getComputedStyle(el)[p]));
      return {
        footer: px(document.querySelector('footer'), 'paddingBottom'),
        header: px(document.querySelector('header'), 'paddingTop'),
        acct: Math.round(parseFloat(getComputedStyle(document.querySelector('.acct')).right)),
      };
    });
    expect(after.footer, 'the footer clears the home indicator').toBe(before.footer + 34);
    expect(after.header, 'the header clears the notch').toBe(before.header + 47);
    expect(after.acct, 'and the account button clears the right edge').toBe(before.acct + 44);
  });

  test('EVERY TRANSFORM HANDLE IS ON SCREEN', async ({ page }) => {
    /* Transform is one of the seven rail buttons a phone can reach without
       swiping, and its tooltip promises resize and rotate. On a 1280 trait at
       the zoom the editor itself picks, every handle was outside the stage -
       and dragging inside the box still moved the art, so the tool half-worked,
       which reads as a rendering fault rather than as something off screen. */
    await open(page);
    await page.evaluate(() => {
      const w = 1280, h = 1280, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 1] = 83; d[i + 2] = 104; d[i + 3] = 255; }
      fileName = 'big.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForFunction(() => !document.getElementById('app').hidden);
    await page.evaluate(() => selectTool('transform'));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const b = document.getElementById('tbox'), st = document.getElementById('stage');
      const sr = st.getBoundingClientRect();
      const out = [];
      for (const h of b.querySelectorAll('.th')) {
        const q = h.getBoundingClientRect();
        if (q.left < sr.left - 0.5 || q.top < sr.top - 0.5
          || q.right > sr.right + 0.5 || q.bottom > sr.bottom + 0.5)
          out.push(h.dataset.h + ' at ' + Math.round(q.left) + ',' + Math.round(q.top));
      }
      return { on: b.classList.contains('on'),
        handles: b.querySelectorAll('.th').length, outside: out, zoom };
    });
    expect(r.on, 'the transform box is showing').toBe(true);
    expect(r.handles, 'and it has its handles').toBeGreaterThan(4);
    expect(r.outside, 'none of them is off the stage').toEqual([]);
  });

  test('A DRAG CAN REACH PAST THE TILES ALREADY ON SCREEN', async ({ page }) => {
    /* The drag captures the pointer, so the shelf did not move under it - and
       six of 318 tiles fit on a phone. A trait could only be dropped among
       those six, or into another layer through the bar at the bottom, which
       makes reordering a real collection impossible. Letting go to scroll does
       not help: it commits the move to wherever the finger was.

       Driven by dispatching the pointer events the handle listens for, rather
       than by page.mouse, because the handle takes a pointer capture and the
       test needs the same event object shape the real handler gets. */
    await open(page);
    await seed(page, 30);
    await page.evaluate(() => window.scrollTo(0, 0));
    const r = await page.evaluate(async () => {
      const handle = document.querySelector('#projbody .item .draghandle');
      if (!handle) return { bad: 'no drag handle' };
      const box = handle.getBoundingClientRect();
      const ev = (type, y) => new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
        clientX: Math.round(box.left + box.width / 2), clientY: y });
      handle.dispatchEvent(ev('pointerdown', Math.round(box.top + box.height / 2)));
      const dragging = !!document.querySelector('.shelfdragghost');
      const startedAt = window.scrollY;
      /* Hold the finger at the bottom edge, where a list that can scroll does. */
      for (let i = 0; i < 40; i++) {
        handle.dispatchEvent(ev('pointermove', window.innerHeight - 20));
        await new Promise(res => requestAnimationFrame(res));
      }
      const movedTo = window.scrollY;
      /* And holding it in the middle must NOT scroll, or the page runs away
         under a finger that is not asking for anything. */
      const middleFrom = window.scrollY;
      for (let i = 0; i < 40; i++) {
        handle.dispatchEvent(ev('pointermove', Math.round(window.innerHeight / 2)));
        await new Promise(res => requestAnimationFrame(res));
      }
      const middleTo = window.scrollY;
      handle.dispatchEvent(ev('pointercancel', Math.round(window.innerHeight / 2)));
      await new Promise(res => setTimeout(res, 200));
      const stoppedFrom = window.scrollY;
      await new Promise(res => setTimeout(res, 300));
      return { dragging, startedAt, movedTo, middleFrom, middleTo,
        stoppedFrom, stoppedTo: window.scrollY,
        ghostGone: !document.querySelector('.shelfdragghost') };
    });
    expect(r.bad).toBeUndefined();
    expect(r.dragging, 'the drag really started').toBe(true);
    expect(r.movedTo, 'holding at the bottom edge scrolls the shelf')
      .toBeGreaterThan(r.startedAt);
    expect(r.middleTo, 'holding in the middle does not').toBe(r.middleFrom);
    expect(r.ghostGone, 'and the drag ended').toBe(true);
    expect(r.stoppedTo, 'and the scrolling stopped with it').toBe(r.stoppedFrom);
  });

  /* An editor open on a small canvas, for the two tool tests below. */
  const editor = async (page) => {
    await page.evaluate(() => {
      const w = 32, h = 32, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = 255; }
      fileName = 'tools.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForFunction(() => !document.getElementById('app').hidden);
  };

  test('THE GRADIENT HAS A FAR END A FINGER CAN SET', async ({ page }) => {
    /* gdColours was [paint colour, rcTo || black] and rcTo is written in
       exactly two places, both oncontextmenu. There is no right-click on a
       phone, so every gradient a finger drew ran to black - while the tool's
       own tooltip told the person to right-click. */
    await open(page);
    await editor(page);
    const r = await page.evaluate(() => {
      const out = {};
      setColor('#ffffff');
      try { rcTo = null; gdTo = null; } catch (_) {}
      out.beforeAnything = gdColours()[1].slice(0, 3).join(',');
      /* The route a phone has: the control in the gradient's own panel. */
      const to = document.getElementById('gdto');
      out.hasControl = !!to;
      if (to) { to.value = '#3fa66a'; to.dispatchEvent(new Event('input', { bubbles: true })); }
      out.afterControl = gdColours()[1].slice(0, 3).join(',');
      /* And the route a mouse has, still working - with the control cleared,
         so this is testing the fallback and not the value set above. */
      document.getElementById('gdtoclear').click();
      try { rcTo = '#c85368'; } catch (_) {}
      out.afterRightClickTarget = gdColours()[1].slice(0, 3).join(',');
      try { rcTo = null; } catch (_) {}
      out.backToBlack = gdColours()[1].slice(0, 3).join(',');
      return out;
    });
    expect(r.hasControl, 'the gradient panel has a far-end control').toBe(true);
    expect(r.beforeAnything, 'with nothing set it is still black').toBe('0,0,0');
    expect(r.afterControl, 'and the control sets it').toBe('63,166,106');
    expect(r.afterRightClickTarget, 'the right-click target still works when the control is clear')
      .toBe('200,83,104');
    expect(r.backToBlack, 'and black is still the last resort').toBe('0,0,0');
  });

  test('AND A COLOUR CAN BE TAKEN OUT OF AN IMPORTED PALETTE WITHOUT A KEYBOARD',
    async ({ page }) => {
      /* Ctrl+click was the only way, and it was written only inside a title
         attribute - which a phone has no key for and does not show. */
      await open(page);
      await editor(page);
      const r = await page.evaluate(() => {
        PIO = pioFill('probe', ['#ff0000', '#00ff00', '#0000ff'], '', 3, []);
        pioRender();
        setColor('#ffffff');
        const sw = () => [...document.querySelectorAll('#piopal .sw')];
        const toggle = document.getElementById('piotake');
        const out = { hasToggle: !!toggle, toggleShown: toggle && !toggle.hidden };
        /* Off: a tap paints, as it always did. */
        sw()[0].click();
        out.paintedWith = color;
        out.stillThree = PIO.colours.filter(Boolean).length;
        /* On: a tap takes it out, and does NOT also paint with it. */
        toggle.click();
        out.pressed = toggle.getAttribute('aria-pressed');
        setColor('#ffffff');
        sw()[1].click();
        out.left = PIO.colours.filter(Boolean).length;
        out.colourAfter = color;
        /* And dropping the palette puts the toggle away with it. */
        pioDrop();
        out.afterDrop = { hidden: toggle.hidden, pressed: toggle.getAttribute('aria-pressed') };
        return out;
      });
      expect(r.hasToggle, 'there is a control for it').toBe(true);
      expect(r.toggleShown, 'and it is on screen while a palette is loaded').toBe(true);
      expect(r.paintedWith, 'with the toggle off a tap still paints').toBe('#ff0000');
      expect(r.stillThree, 'and takes nothing out').toBe(3);
      expect(r.pressed, 'the toggle says it is on').toBe('true');
      expect(r.left, 'with it on, a tap takes the colour out').toBe(2);
      expect(r.colourAfter, 'and does not also paint with it').toBe('#ffffff');
      expect(r.afterDrop.hidden, 'and the toggle goes with the palette').toBe(true);
      expect(r.afterDrop.pressed, 'and does not stay armed for the next one').toBe('false');
    });
});
