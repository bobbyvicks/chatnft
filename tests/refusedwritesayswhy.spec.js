/* A REFUSED WRITE SAYS WHY (follow-up X3, patch609).

   dbPut, dbDel and dbClear rejected with the transaction's error from its
   error handler. That handler runs when a request fails, before the
   transaction aborts, and the transaction's error is still null then - so
   every refusal a request raised reached its caller as null, and each
   caller's message said "storage error", "could not be read" or nothing.
   The request's own error is in hand at that moment: it is the event's
   target. Now they reject with it.

   A refusal the browser raises on a REQUEST is made here the way the
   browser itself raises one: the store's put, delete and clear are pointed
   at add() of a key that exists, which IndexedDB refuses on the request
   with ConstraintError and then aborts the transaction - the same event
   order as any request error. RUN AGAINST 91eb861'S PAGE FIRST: each of
   the three went red with null.

   AND THE ONE A PERSON MEETS (owner's answer to question 5: say clearly
   that pictures cannot be kept in a private window, and suggest a normal
   one). WebKit's private-style storage refuses every picture with
   UnknownError "Error preparing Blob/File data to be stored in object
   store" (Task 16 Step 2b, measured). A device that is full and a window
   that cannot keep pictures are the two refusals every later picture
   write meets the same way, so the import, the project-file import and
   Load from cloud stop at the first one, as they already did for a full
   device, and every message that names a full device names this too. In
   Chromium the refusal is handed to the page's own dbPut, as devicefull
   does for a full one; the real one is the last test, whose WebKit run
   (local, pw.webkit.config.js, a dead-proxy guard) is where the browser
   raises it. RUN AGAINST 91eb861'S PAGE FIRST: every message test went
   red - "could not be read", "UnknownError" or no reason at all.

   The controls: after the fault is lifted every write goes through (so the
   fault is what refused), a full device still reads as a full device, and
   in a window that can keep pictures (Chromium) nothing is refused and
   nothing is said. */
import { test, expect } from '@playwright/test';

const BLOB_REFUSED = 'Error preparing Blob/File data to be stored in object store';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof dbPut === 'function' && typeof autosaveNow === 'function'
    && typeof bulkImport === 'function' && typeof importProject === 'function' && typeof cloudPull === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
    await dbClear();
    LAYERS = ['hats', 'unsorted'];
  });
};

/* In the page: refusals raised on the request, by the store itself. */
const FAULT = `(() => {
  const P = IDBObjectStore.prototype, add = P.add;
  window.__real = { put: P.put, delete: P.delete, clear: P.clear };
  window.__refuse = () => {
    P.put = function (v, k) { return add.call(this, v, k); };
    P.delete = function (k) { return add.call(this, { id: k }); };
    P.clear = function () { return add.call(this, { id: 'probe.exists' }); };
  };
  window.__allow = () => { P.put = window.__real.put; P.delete = window.__real.delete; P.clear = window.__real.clear; };
  window.__how = (p) => p.then(() => 'resolved', e => e === null ? 'null' : e === undefined ? 'undefined'
    : { name: String(e.name), message: String(e.message || '') });
})()`;

test.describe('a refused write says why', () => {
  test.beforeEach(async ({ page }) => {
    await ready(page);
  });

  test('dbPut refused on the request rejects with the refusal, not null - each of its three ways of writing', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      eval(F);
      /* No pictures: what is tested is dbPut's three paths (a plain put, a
         trait's read-then-put, a person's draft), and a window that cannot
         keep pictures (the WebKit run) can still keep these. */
      const recs = {
        settings: { id: 'settings.probe', kind: 'settings', v: 1, at: 1 },
        trait: { id: 't_x_hats_wip', kind: 'trait', name: 'x', layer: 'hats', status: 'wip', w: 4, h: 4, at: 1 },
        draft: { id: draftKey('t_x_hats_wip'), kind: 'autosave', traitId: 't_x_hats_wip', name: 'x.png', w: 4, h: 4, at: 2 },
      };
      for (const k in recs) await dbPut(Object.assign({}, recs[k]));
      const out = {};
      __refuse();
      try { for (const k in recs) out[k] = await __how(dbPut(Object.assign({}, recs[k]))); }
      finally { __allow(); }
      /* The control: the same writes, the store's own put. */
      out.control = [];
      for (const k in recs) out.control.push(await __how(dbPut(Object.assign({}, recs[k]))));
      return out;
    }, FAULT);
    for (const k of ['settings', 'trait', 'draft']) {
      expect(r[k], k + ': the request\'s own error').toEqual({ name: 'ConstraintError', message: expect.stringMatching(/./) });
    }
    expect(r.control, 'the fault is what refused').toEqual(['resolved', 'resolved', 'resolved']);
  });

  test('dbDel and dbClear refused on the request reject with the refusal, not null', async ({ page }) => {
    const r = await page.evaluate(async (F) => {
      eval(F);
      await dbPut({ id: 'probe.exists', kind: 'probe', at: 1 });
      await dbPut({ id: 'settings.probe', kind: 'settings', v: 1, at: 1 });
      const out = {};
      __refuse();
      try {
        out.del = await __how(dbDel('settings.probe'));
        out.clear = await __how(dbClear());
      } finally { __allow(); }
      out.kept = (await dbAll()).map(x => x.id).sort();
      out.control = [await __how(dbDel('settings.probe')), await __how(dbClear())];
      out.after = (await dbAll()).length;
      return out;
    }, FAULT);
    expect(r.del).toEqual({ name: 'ConstraintError', message: expect.stringMatching(/./) });
    expect(r.clear).toEqual({ name: 'ConstraintError', message: expect.stringMatching(/./) });
    expect(r.kept, 'nothing was removed by the refused writes').toEqual(['probe.exists', 'settings.probe']);
    expect(r.control, 'the fault is what refused').toEqual(['resolved', 'resolved']);
    expect(r.after).toBe(0);
  });

  test('Save names the refusal the store gave, instead of "storage error"', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'its setup stores a picture, which this window refuses (the last test is the case for this run)');
    const r = await page.evaluate(async (F) => {
      eval(F);
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const rec = { id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob, w: 16, h: 16, at: 1 };
      await dbPut(rec);
      await openTraitRecord(await dbGet(rec.id));
      const said = []; const t = window.toast; window.toast = (m) => said.push(String(m));
      let ok;
      __refuse();
      try { ok = await saveTrait(); } finally { __allow(); window.toast = t; }
      return { ok, said: said.join(' | ') };
    }, FAULT);
    expect(r.ok).toBe(false);
    expect(r.said).toContain('Could not save: ConstraintError');
    expect(r.said).not.toContain('storage error');
  });

  test('an autosave the store refuses because it is full says the device is full', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const n = 8, d = new Uint8ClampedArray(n * n * 4).fill(255);
      fileName = 'p.png'; startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
      const said = []; const t = window.toast; window.toast = (m) => said.push(String(m));
      const real = window.dbPut;
      window.dbPut = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
      let saved;
      try { saved = await autosaveNow(); } finally { window.dbPut = real; window.toast = t; }
      return { saved, said };
    });
    expect(r.saved).toBe(false);
    expect(r.said).toEqual(['Could not save your work to this browser: this device is out of storage space.'
      + ' Copy it out with Download before closing the tab.']);
  });

  test('an autosave in a window that cannot keep pictures says so, and says to use a normal window', async ({ page }) => {
    const r = await page.evaluate(async (why) => {
      const n = 8, d = new Uint8ClampedArray(n * n * 4).fill(255);
      fileName = 'p.png'; startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
      const said = []; const t = window.toast; window.toast = (m) => said.push(String(m));
      const real = window.dbPut;
      window.dbPut = () => Promise.reject(new DOMException(why, 'UnknownError'));
      let saved;
      try { saved = await autosaveNow(); } finally { window.dbPut = real; window.toast = t; }
      return { saved, said };
    }, BLOB_REFUSED);
    expect(r.saved).toBe(false);
    expect(r.said).toEqual(['Could not save your work to this browser: this window cannot keep pictures, as a private window'
      + ' cannot - open PixelBench in a normal window. Copy it out with Download before closing the tab.']);
  });

  test('Save in a window that cannot keep pictures says so', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'its setup stores a picture, which this window refuses (the last test is the case for this run)');
    const r = await page.evaluate(async (why) => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const rec = { id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob, w: 16, h: 16, at: 1 };
      await dbPut(rec);
      await openTraitRecord(await dbGet(rec.id));
      const said = []; const t = window.toast; window.toast = (m) => said.push(String(m));
      const real = window.dbPut;
      window.dbPut = (x) => (x && x.kind === 'trait') ? Promise.reject(new DOMException(why, 'UnknownError')) : real(x);
      let ok;
      try { ok = await saveTrait(); } finally { window.dbPut = real; window.toast = t; }
      return { ok, said: said.join(' | ') };
    }, BLOB_REFUSED);
    expect(r.ok).toBe(false);
    expect(r.said).toContain('Could not save: this window cannot keep pictures, as a private window cannot'
      + ' - open PixelBench in a normal window. Download it to keep it');
  });

  test('an import in a window that cannot keep pictures stops at the first refusal and says why', async ({ page }) => {
    const r = await page.evaluate(async (why) => {
      const files = [];
      for (let i = 0; i < 4; i++) {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(' + (i * 40) + ',10,10)'; g.fillRect(0, 0, 16, 16);
        const b = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = new File([b], 'n' + i + '.png', { type: 'image/png' });
        Object.defineProperty(f, 'webkitRelativePath', { value: 'UPLOAD/hats/n' + i + '.png' });
        files.push(f);
      }
      const real = window.dbPut; let n = 0;
      window.dbPut = (rec) => (rec && rec.kind === 'trait' && ++n) ? Promise.reject(new DOMException(why, 'UnknownError')) : real(rec);
      const t = window.toast; window.toast = () => {};
      try { await bulkImport(files); } finally { window.dbPut = real; window.toast = t; }
      return { note: document.getElementById('bulknote').textContent, tried: n };
    }, BLOB_REFUSED);
    expect(r.tried, 'stopped at the first refusal').toBe(1);
    expect(r.note).toContain('this window cannot keep pictures, as a private window cannot - open PixelBench in a normal window - 0 of 4 imported');
    expect(r.note).not.toContain('could not be read');
  });

  test('a project file imported in a window that cannot keep pictures stops at the first refusal and says why', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'its setup stores a picture, which this window refuses (the last test is the case for this run)');
    const r = await page.evaluate(async (why) => {
      for (let i = 0; i < 3; i++) await dbPut({ id: 't_k' + i + '_hats_approved', kind: 'trait', name: 'k' + i, layer: 'hats',
        status: 'approved', blob: new Blob([new Uint8Array([i, 1, 2])]), w: 16, h: 16, rarity: 1, at: 1700000000000 + i, shelfOrder: i });
      let got = null;
      const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (b) => { got = b; return 'blob:probe'; };
      HTMLAnchorElement.prototype.click = function () {};
      const t = window.toast; const said = []; window.toast = () => {};
      try { await exportProject(); } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
      const text = await got.text();
      await dbClear();
      window.toast = (m) => said.push(String(m));
      const real = window.dbPut; let n = 0;
      window.dbPut = (rec) => (rec && rec.kind === 'trait' && ++n) ? Promise.reject(new DOMException(why, 'UnknownError')) : real(rec);
      try { await importProject(new File([text], 'p.json', { type: 'application/json' })); }
      finally { window.dbPut = real; window.toast = t; }
      return { said: said.join(' | '), tried: n };
    }, BLOB_REFUSED);
    expect(r.tried, 'stopped at the first refusal').toBe(1);
    expect(r.said).toContain('this window cannot keep pictures, as a private window cannot - open PixelBench in a normal window - 0 of 3 imported');
    expect(r.said).not.toContain('could not be read');
  });

  test('Load from cloud in a window that cannot keep pictures stops at the first refusal and says why', async ({ page }) => {
    const r = await page.evaluate(async (why) => {
      const blobs = [];
      for (let i = 0; i < 20; i++) {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(' + (i * 10) + ',10,10)'; g.fillRect(0, 0, 16, 16);
        blobs.push(await new Promise(r => c.toBlob(r, 'image/png')));
      }
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const rows = blobs.map((b, i) => ({ id: 'row' + i, name: 'n' + i, kind: 'trait', layer: 'hats', status: 'approved',
        path: 'me/c1/n' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
      const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
      const realFetch = window.fetch;
      window.fetch = async (u) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
        if (s.indexOf('/rpc/my_team') >= 0) return json('me');
        if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
        if (s.indexOf('/storage/v1/object/traits/') >= 0) {
          const i = parseInt(s.match(/n(\d+)\.png/)[1], 10); return new Response(blobs[i]);
        }
        if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
        if (s.indexOf('/rest/v1/traits') >= 0) {
          const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
          return json(rows.slice(off, off + 1000));
        }
        return json([]);
      };
      const real = window.dbPut; let n = 0;
      window.dbPut = (rec, wk, uid) => (rec && rec.kind === 'trait' && ++n) ? Promise.reject(new DOMException(why, 'UnknownError')) : real(rec, wk, uid);
      const t = window.toast; window.toast = () => {};
      try { await cloudPull({ quiet: true }); } finally { window.fetch = realFetch; window.dbPut = real; window.toast = t; localStorage.removeItem('chatnft.session'); }
      return { note: document.getElementById('cloudnote').textContent, tried: n };
    }, BLOB_REFUSED);
    /* Eight downloads run at once (PULL_AT_ONCE), and those already out
       each try their write once; none starts after the first refusal. */
    expect(r.tried, 'stopped at the first refusal, not all 20').toBeLessThanOrEqual(8);
    expect(r.note).toContain('this window cannot keep pictures, as a private window cannot - open PixelBench in a normal window - 0 of 20 saved here');
    expect(r.note).not.toContain('could not be read');
  });

  /* THE REAL ONE. Under WebKit (a local run with pw.webkit.config.js, whose
     default context is private-style) the browser refuses the picture
     itself; under Chromium this is the control, and the picture is kept. */
  test('a picture write: refused with the browser\'s own reason where the window cannot keep pictures, and kept where it can', async ({ page, browserName }) => {
    const r = await page.evaluate(async () => {
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 4; c.height = 4;
        c.getContext('2d').fillRect(0, 0, 4, 4); c.toBlob(r, 'image/png'); });
      const put = await dbPut({ id: 't_x_hats_wip', kind: 'trait', name: 'x', layer: 'hats', status: 'wip', blob: png, w: 4, h: 4, at: 1 })
        .then(() => 'kept', e => e === null ? 'null' : { name: String(e.name), message: String(e.message || '') });
      const said = []; const t = window.toast; window.toast = (m) => said.push(String(m));
      const n = 8, d = new Uint8ClampedArray(n * n * 4).fill(255);
      fileName = 'p.png'; startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
      let saved;
      try { saved = await autosaveNow(); } finally { window.toast = t; }
      /* And an import, as a person's first visit would make one. */
      const files = [];
      for (let i = 0; i < 3; i++) {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(' + (i * 60) + ',10,10)'; g.fillRect(0, 0, 16, 16);
        const b = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = new File([b], 'n' + i + '.png', { type: 'image/png' });
        Object.defineProperty(f, 'webkitRelativePath', { value: 'UPLOAD/hats/n' + i + '.png' });
        files.push(f);
      }
      window.toast = () => {};
      try { await bulkImport(files); } finally { window.toast = t; }
      const note = document.getElementById('bulknote').textContent;
      const traits = (await dbAll()).filter(x => x.kind === 'trait').length;
      return { put, saved, said, note, traits };
    });
    console.log(browserName + ': ' + JSON.stringify(r));
    if (browserName === 'webkit') {
      expect(r.put).toEqual({ name: 'UnknownError', message: expect.stringContaining('Blob/File data') });
      expect(r.saved).toBe(false);
      expect(r.said).toEqual(['Could not save your work to this browser: this window cannot keep pictures, as a private window'
        + ' cannot - open PixelBench in a normal window. Copy it out with Download before closing the tab.']);
      expect(r.note).toContain('this window cannot keep pictures, as a private window cannot - open PixelBench in a normal window - 0 of 3 imported');
      expect(r.note).not.toContain('could not be read');
      expect(r.traits).toBe(0);
    } else {
      expect(r.put).toBe('kept');
      expect(r.saved).toBe(true);
      expect(r.said).toEqual([]);
      expect(r.note).not.toContain('cannot keep pictures');
      expect(r.traits, 'the picture written first, and the three imported').toBe(4);
    }
  });
});
