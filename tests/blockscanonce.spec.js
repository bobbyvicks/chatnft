/* THE BLOCK SCAN DECODES EACH TRAIT ONCE.

   autoCanvas decodes every trait once to learn its pixel block, and the
   numbers are saved on this device. Every render during the first scan
   started another pass over the same traits (855-924 decodes for 311 on a
   group's cold open, measured by the discovery pass), the saved numbers were
   applied only to the first list asked about, and a scan of a subset
   replaced what was saved with the subset. Each test counts calls to
   createImageBitmap, which is the decode. RUN AGAINST THE PAGE BEFORE THE
   FIX: the first four went red - 205 to 210 decodes for 60 traits, 50 decodes that
   were saved, 50 again after a subset save, and nothing saved at the 45th
   decode. The last three are controls: overlapping scans still give each
   list its own answer, another project does not read this one's saved
   numbers, and a changed picture is still measured again. */
import { test, expect } from '@playwright/test';

/* Traits of side s in flat b-pixel blocks, so pixelBlock measures b. */
const make = (page, specs) => page.evaluate(async (specs) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  const recs = [];
  let i = 0;
  for (const sp of specs) {
    for (let n = 0; n < sp.count; n++) {
      const c = document.createElement('canvas');
      c.width = sp.s; c.height = sp.s;
      const g = c.getContext('2d');
      for (let y = 0; y < sp.s; y += sp.b)
        for (let x = 0; x < sp.s; x += sp.b) {
          g.fillStyle = ((x / sp.b + y / sp.b + n) % 2) ? '#204080' : '#c08040';
          g.fillRect(x, y, sp.b, sp.b);
        }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      recs.push({ id: (sp.tag || 't') + '_' + (i++) + '_x_approved', kind: 'trait', name: 't' + i,
        layer: 'x', status: 'approved', blob, w: sp.s, h: sp.s, rarity: 1, at: 1 });
    }
  }
  window.__recs = (window.__recs || []).concat(recs);
  window.__mine = window.__mine || new Set();
  for (const r of recs) window.__mine.add(r.blob);
  /* Counted where the decode happens, and only for these traits' pictures:
     the page decodes other things of its own while it boots. */
  if (!window.__wrapped) {
    window.__wrapped = true;
    window.__decodes = 0;
    const real = window.createImageBitmap.bind(window);
    window.createImageBitmap = (...a) => { if (!window.__mine.has(a[0])) return real(...a); window.__decodes++; if (window.__onDecode) window.__onDecode(window.__decodes); return real(...a); };
  }
  return recs.length;
}, specs);

/* A new visit: nothing measured in memory, the saved numbers still there. */
const newVisit = (page) => page.evaluate(() => {
  blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; window.__decodes = 0;
});

test.describe('the block scan decodes each trait once', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof autoCanvas === 'function');
    await page.evaluate(() => { try { localStorage.removeItem(blockStoreKey()); } catch (_) {} });
  });

  test('FOUR OVERLAPPING SCANS of 60 traits decode 60, not one set each', async ({ page }) => {
    await make(page, [{ s: 64, b: 4, count: 60 }]);
    const r = await page.evaluate(async () => {
      await (async () => { blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; window.__decodes = 0; })();
      const all = window.__recs, half = all.slice(0, 30);
      const got = await Promise.all([autoCanvas(all), autoCanvas(all), autoCanvas(half), autoCanvas(all)]);
      return { got, decodes: window.__decodes };
    });
    expect(r.decodes).toBe(60);
    expect(r.got).toEqual([64, 64, 64, 64]);
  });

  test('SAVED NUMBERS answer every list, not only the first one asked about', async ({ page }) => {
    await make(page, [{ s: 64, b: 4, count: 60 }]);
    await page.evaluate(() => autoCanvas(window.__recs));
    await newVisit(page);
    const r = await page.evaluate(async () => {
      const all = window.__recs;
      /* The final page asks about the chosen traits first. */
      await autoCanvas(all.slice(0, 10));
      const first = window.__decodes;
      await autoCanvas(all);
      return { first, then: window.__decodes - first };
    });
    expect(r.first).toBe(0);
    expect(r.then, 'every number was saved; none needs decoding').toBe(0);
  });

  test('A SUBSET SCAN that measures one new trait keeps every other saved number', async ({ page }) => {
    await make(page, [{ s: 64, b: 4, count: 60 }]);
    await page.evaluate(() => autoCanvas(window.__recs));
    await newVisit(page);
    await make(page, [{ s: 64, b: 4, count: 1, tag: 'new' }]);
    const r = await page.evaluate(async () => {
      const all = window.__recs, fresh = all[all.length - 1];
      await autoCanvas(all.slice(0, 10).concat([fresh]));
      const subset = window.__decodes;
      blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; window.__decodes = 0;
      await autoCanvas(all);
      return { subset, then: window.__decodes };
    });
    expect(r.subset, 'the new trait is measured').toBe(1);
    expect(r.then, 'and the next visit decodes nothing').toBe(0);
  });

  test('PROGRESS IS SAVED during the first scan, not only at its end', async ({ page }) => {
    await make(page, [{ s: 64, b: 4, count: 100 }]);
    const r = await page.evaluate(async () => {
      blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; window.__decodes = 0;
      let at45 = -1;
      window.__onDecode = (n) => {
        if (n === 45) { try { at45 = Object.keys(JSON.parse(localStorage.getItem(blockStoreKey()) || '{}')).length; } catch (_) { at45 = -2; } }
      };
      try { await autoCanvas(window.__recs); } finally { window.__onDecode = null; }
      return { at45, end: Object.keys(JSON.parse(localStorage.getItem(blockStoreKey()) || '{}')).length };
    });
    expect(r.at45, 'a reload at the 45th trait keeps the first forty').toBeGreaterThanOrEqual(40);
    expect(r.end).toBe(100);
  });

  test('the control: overlapping scans of different lists each get their own answer', async ({ page }) => {
    /* Six at 400 on 5 px blocks, two at 500 on 5: the set says 400, the two
       alone say 500. Sharing decodes must not share answers. */
    await make(page, [{ s: 400, b: 5, count: 6 }, { s: 500, b: 5, count: 2 }]);
    const r = await page.evaluate(async () => {
      blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; window.__decodes = 0;
      const all = window.__recs, big = all.slice(6);
      const got = await Promise.all([autoCanvas(all), autoCanvas(big), autoCanvas(all)]);
      return { got };
    });
    expect(r.got).toEqual([400, 500, 400]);
  });

  test('the control: another project does not borrow this one\'s saved numbers', async ({ page }) => {
    /* The saved numbers are kept per project, and two projects reuse ids.
       The parsed copy now outlives the first read, so it must not be read
       back for the wrong project. */
    await make(page, [{ s: 64, b: 4, count: 20 }]);
    await page.evaluate(() => autoCanvas(window.__recs));
    await newVisit(page);
    const r = await page.evaluate(async () => {
      /* This project's numbers read back, so the page is holding them. */
      await autoCanvas(window.__recs);
      const here = window.__decodes;
      try {
        activeWs = 'team7';
        try { localStorage.removeItem(blockStoreKey()); } catch (_) {}
        blockOf.clear(); autoKey = ''; autoSide = null; window.__decodes = 0;
        await autoCanvas(window.__recs);
        return { here, decodes: window.__decodes };
      } finally { activeWs = null; }
    });
    expect(r.here, 'read back from this project\'s save').toBe(0);
    expect(r.decodes, 'nothing is saved for team7').toBe(20);
  });

  test('the control: a trait whose picture changed is measured again', async ({ page }) => {
    await make(page, [{ s: 64, b: 4, count: 20 }]);
    await page.evaluate(() => autoCanvas(window.__recs));
    await newVisit(page);
    await make(page, [{ s: 64, b: 8, count: 1, tag: 'redrawn' }]);
    const r = await page.evaluate(async () => {
      const all = window.__recs.slice(0, 20), redrawn = window.__recs[20];
      /* The same id as a saved trait, with a different picture. */
      const changed = Object.assign({}, redrawn, { id: all[0].id });
      await autoCanvas([changed].concat(all.slice(1)));
      return { decodes: window.__decodes, blk: blockOf.get(all[0].id) };
    });
    expect(r.decodes, 'only the changed one').toBe(1);
    expect(r.blk).toBe(8);
  });
});
