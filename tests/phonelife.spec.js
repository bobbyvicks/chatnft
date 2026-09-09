/* SURVIVING THE CONDITIONS A PHONE IS ACTUALLY IN.

   mobile.spec.js is about what the page LOOKS like and what a finger can
   reach. This is about the other half: a load that has to be cheap, a network
   that is not there, and storage that can refuse.

   Run at a phone viewport for the same reason - these are phone problems - but
   nothing here depends on the width, and they would all be true on a desktop
   with a bad connection. */
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

const seed = async (page, n) => {
  await page.evaluate(async (n) => {
    await dbClear();
    const S = 160;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      /* Each trait a different picture, so their PNG lengths differ and the
         cache below is keyed on something that actually varies. */
      g.fillStyle = '#2e222f'; g.fillRect(0, 0, S, S);
      g.fillStyle = 'hsl(' + (i * 41 % 360) + ' 62% 48%)';
      for (let k = 0; k <= i; k++) g.fillRect((k * 16) % S, (k * 24) % S, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const layer = LAYERS[i % LAYERS.length];
      await dbPut({ id: 't_p' + i + '_' + layer + '_approved', kind: 'trait',
        name: 'p' + i, layer, w: S, h: S, blob, status: 'approved', synced: true });
    }
  }, n);
  await page.evaluate(() => { try { showPage('project', false); } catch (_) {} });
  await page.evaluate(() => renderShelf());
  await page.waitForTimeout(500);
};

/* Counts decodes rather than milliseconds: wall-clock moves under a busy
   machine, and what changed is the amount of work, not how fast it runs. */
const countDecodes = (page) => page.evaluate(() => {
  window.__decodes = 0;
  const real = window.createImageBitmap;
  window.createImageBitmap = function (...a) { window.__decodes++; return real.apply(this, a); };
});

test.describe('what a phone puts the page through', () => {
  test('THE PIXEL GRID IS MEASURED ONCE, NOT ONCE A VISIT', async ({ page }) => {
    /* autoCanvas asks every trait what size its pixels are drawn at, which
       means decoding it and scanning up to 1.6 million pixels. Measured at the
       real collection's size: 3,401 ms here and about 14,800 at a sixth of this
       CPU, on every load, for numbers that do not change while the artwork does
       not. */
    await open(page);
    await seed(page, 10);

    await countDecodes(page);
    const first = await page.evaluate(async () => {
      try { blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; } catch (_) {}
      try { localStorage.removeItem(blockStoreKey()); } catch (_) {}
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const side = await autoCanvas(items);
      return { side, decodes: window.__decodes, stored: !!localStorage.getItem(blockStoreKey()) };
    });
    expect(first.decodes, 'the first sweep really does decode every trait').toBe(10);
    expect(first.stored, 'and writes down what it found').toBe(true);

    /* A fresh page in the same browser: IndexedDB and localStorage both live. */
    await page.reload();
    await page.waitForFunction(() => typeof autoCanvas === 'function');
    await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
    await countDecodes(page);
    const second = await page.evaluate(async () => {
      try { blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; } catch (_) {}
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const side = await autoCanvas(items);
      return { side, decodes: window.__decodes };
    });
    expect(second.decodes, 'the next visit decodes nothing at all').toBe(0);
    expect(second.side, 'and reaches the same canvas').toBe(first.side);
  });

  test('and a re-cut trait is measured again rather than remembered wrong',
    async ({ page }) => {
      /* The whole risk of remembering is an entry outliving the picture it
         describes, so a test that only proved the cache HITS would be equally
         happy with one that never misses. The guard is the blob's length. */
      await open(page);
      await seed(page, 6);
      await page.evaluate(async () => {
        try { blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; } catch (_) {}
        try { localStorage.removeItem(blockStoreKey()); } catch (_) {}
        await autoCanvas((await dbAll()).filter(i => i.kind === 'trait'));
      });
      const r = await page.evaluate(async () => {
        const items = (await dbAll()).filter(i => i.kind === 'trait');
        const t = items[0];
        const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
        const g = c.getContext('2d');
        for (let i = 0; i < 400; i++) {
          g.fillStyle = 'hsl(' + (i * 7 % 360) + ' 70% 50%)';
          g.fillRect((i * 37) % t.w, (i * 53) % t.h, 9, 9);
        }
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        const changedLength = blob.size !== t.blob.size;
        await dbPut({ ...t, blob });
        window.__decodes = 0;
        const real = window.createImageBitmap;
        window.createImageBitmap = function (...a) { window.__decodes++; return real.apply(this, a); };
        try { blockOf.clear(); autoKey = ''; autoSide = null; blockStoreRead = false; } catch (_) {}
        await autoCanvas((await dbAll()).filter(i => i.kind === 'trait'));
        return { changedLength, decodes: window.__decodes };
      });
      expect(r.changedLength, 'the replacement really is a different length').toBe(true);
      expect(r.decodes, 'exactly the changed trait is measured again').toBe(1);
    });

  test('WITH NO SIGNAL, YOUR OWN COLLECTION IS STILL THERE', async ({ page }) => {
    /* Everything that puts this device's work on screen used to sit below the
       "cannot reach the server" return, so a cold load on the underground gave
       the sign-in wall over an empty page - with the traits in IndexedDB and a
       session in localStorage. */
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = (u, o) => String(u).indexOf('/auth/v1/user') >= 0
        ? Promise.reject(new TypeError('Failed to fetch')) : real(u, o);
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'stored-token', refresh_token: 'stored-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    });
    await open(page);
    await seed(page, 5);
    /* Boot again with the stub in place, which is the cold load this is about. */
    await page.reload();
    await page.waitForFunction(() => typeof cloudRender === 'function');
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({
      gateUp: !document.getElementById('signin').hidden,
      note: (document.getElementById('cloudnote') || {}).textContent || '',
      tiles: document.querySelectorAll('#projbody .item').length,
    }));
    expect(r.note, 'it still says it cannot reach the server').toContain('Cannot reach');
    expect(r.gateUp, 'and does not hide your own work behind a wall').toBe(false);
    expect(r.tiles, 'the shelf is there').toBeGreaterThan(0);
  });

  test('and with no session at all the wall is still the wall', async ({ page }) => {
    /* THE CONTROL. "Open the local view when the server cannot be reached"
       must not quietly become "open it for anybody who loads the page
       offline". */
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = (u, o) => String(u).indexOf('/auth/v1/user') >= 0
        ? Promise.reject(new TypeError('Failed to fetch')) : real(u, o);
      localStorage.removeItem('chatnft.session');
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudRender === 'function');
    await page.waitForTimeout(1500);
    const gateUp = await page.evaluate(() => !document.getElementById('signin').hidden);
    expect(gateUp, 'no session, no way in').toBe(true);
  });

  test('A SAVE THE BROWSER REFUSES IS SAID OUT LOUD', async ({ page }) => {
    /* It was .then(done, done) - one callback for kept and for lost - so a
       write refused by a full or evicted store finished exactly like one that
       worked, and the editor closed over it without a word. */
    await open(page);
    await page.evaluate(() => {
      const w = 24, h = 24, d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) { d[i] = 90; d[i + 1] = 160; d[i + 2] = 220; d[i + 3] = 255; }
      fileName = 'refused.png';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
    });
    await page.waitForFunction(() => !document.getElementById('app').hidden);
    const r = await page.evaluate(async () => {
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(String(m)); };
      const realPut = window.dbPut;
      window.dbPut = () => Promise.reject(new Error('QuotaExceededError'));
      try {
        const ok = await autosaveNow();
        return { ok, said };
      } finally { window.dbPut = realPut; window.toast = realToast; }
    });
    expect(r.ok, 'the write reports that it failed').toBe(false);
    expect(r.said.join(' '), 'and says so in words somebody can act on')
      .toContain('Could not save');
  });
});
