/* A FULL DEVICE SAYS SO INSTEAD OF HANGING.

   A write over the storage quota aborts at commit with QuotaExceededError
   and fires no error event; dbPut waited only for complete or error, so it
   never settled. The quota here is real, set through Chromium's own
   Storage.overrideQuotaForOrigin, so the browser refuses the way a full
   phone does. RUN AGAINST THE PAGE BEFORE THE FIX: the write and the pull
   went red on "still waiting" - they never finished.

   THE IMPORT IS THE EXCEPTION, AND MEASURED AS ONE. A File object made in
   the page is not counted against the override in this Chromium: eight of
   700 KB went in under a 3 MB cap, where eight Blobs hung at the fifth. So
   the import test cannot fill the device through the quota, and injects
   the same refusal the browser raises - QuotaExceededError from dbPut after
   three writes - which is what the page's handling has to answer. Before
   the fix it went red too: the refusal was counted as "could not be read",
   ten times over, and the note said nothing about space. The fourth test
   is the control that an import under the quota imports everything and
   says nothing about space. */
import { test, expect } from '@playwright/test';

const QUOTA = 3 * 1024 * 1024;

/* Clears the store, then caps this origin at QUOTA bytes. */
const cap = async (page) => {
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
    await dbClear();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(page.url()).origin, quotaSize: QUOTA });
  return cdp;
};

/* n noise PNGs of about 700 KB each, made in the page, as import files. */
const noisePngs = `async (n) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = document.createElement('canvas'); c.width = 420; c.height = 420;
    const g = c.getContext('2d'); const im = g.createImageData(420, 420);
    for (let i = 0; i < im.data.length; i++) im.data[i] = (Math.random() * 256) | 0;
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
    g.putImageData(im, 0, 0);
    const png = await new Promise(r => c.toBlob(r, 'image/png'));
    /* Rebuilt from its bytes. A blob straight out of toBlob was stored
       without counting against the quota - measured, ten of them went in
       under a 3 MB cap - which is not what a file read from disk does. */
    out.push(new Blob([new Uint8Array(await png.arrayBuffer())], { type: 'image/png' }));
  }
  return out;
}`;

/* Settles within `ms`, or reports that it was still waiting. */
const within = (ms) => `(p) => Promise.race([p.then(v => ({ settled: true, v }), e => ({ settled: true, err: e && e.name })),
  new Promise(r => setTimeout(() => r({ settled: false }), ${ms}))])`;

test.describe('a full device says so instead of hanging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof bulkImport === 'function' && typeof cloudPull === 'function');
  });

  test('A WRITE OVER THE QUOTA is refused, and says why, rather than waiting for ever', async ({ page }) => {
    await cap(page);
    const r = await page.evaluate(async ([mk, w]) => {
      const blobs = await (eval(mk))(6);
      const all = new Blob(blobs);
      return (eval(w))(dbPut({ id: 't_big_skins_approved', kind: 'trait', name: 'big', layer: 'skins',
        status: 'approved', blob: all, w: 420, h: 420, at: 1 }));
    }, [noisePngs, within(5000)]);
    expect(r.settled, 'the write finished').toBe(true);
    expect(r.err).toBe('QuotaExceededError');
  });

  test('AN IMPORT THAT FILLS THE DEVICE stops, and says how far it got', async ({ page }) => {
    await cap(page);
    const r = await page.evaluate(async ([mk, w]) => {
      const blobs = await (eval(mk))(10);
      const files = blobs.map((b, i) => {
        const f = new File([b], 'n' + i + '.png', { type: 'image/png' });
        Object.defineProperty(f, 'webkitRelativePath', { value: 'UPLOAD/skins/n' + i + '.png' });
        return f;
      });
      /* The refusal a full device gives, after three trait writes. */
      const real = window.dbPut; let n = 0;
      window.dbPut = (rec) => (rec && rec.kind === 'trait' && ++n > 3)
        ? Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')) : real(rec);
      let done;
      try { done = await (eval(w))(bulkImport(files)); } finally { window.dbPut = real; }
      return { done, note: document.getElementById('bulknote').textContent, tried: n };
    }, [noisePngs, within(20000)]);
    expect(r.done.settled, 'the import finished').toBe(true);
    expect(r.tried, 'and stopped at the first refusal').toBe(4);
    expect(r.note).toContain('this device is out of storage space');
    expect(r.note).toContain('3 of 10 imported before it filled');
  });

  test('LOAD FROM CLOUD THAT FILLS THE DEVICE stops, re-enables its button, and says so', async ({ page }) => {
    await cap(page);
    const r = await page.evaluate(async ([mk, w]) => {
      const blobs = await (eval(mk))(10);
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const rows = blobs.map((b, i) => ({ id: 'row' + i, name: 'n' + i, kind: 'trait', layer: 'skins', status: 'approved',
        path: 'me/c1/n' + i + '.png', w: 420, h: 420, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
      const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
      const real = window.fetch;
      window.fetch = async (u) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
        if (s.indexOf('/rpc/my_team') >= 0) return json('me');
        if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
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
      const t = window.toast; window.toast = () => {};
      let done;
      try { done = await (eval(w))(cloudPull({ quiet: true })); } finally { window.fetch = real; window.toast = t; }
      return { done, disabled: document.getElementById('cloudpull').disabled, note: document.getElementById('cloudnote').textContent };
    }, [noisePngs, within(20000)]);
    expect(r.done.settled, 'the pull finished').toBe(true);
    expect(r.disabled, 'and Load from cloud can be pressed again').toBe(false);
    expect(r.note).toContain('this device is out of storage space');
    expect(r.note).toMatch(/\d+ of 10 saved here/);
  });

  test('SAVE on a full device says the device is full, not a bare error name', async ({ page }) => {
    await cap(page);
    const r = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const rec = { id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved', blob, w: 16, h: 16, at: 1 };
      await dbPut(rec);
      await openTraitRecord(rec);
      const said = []; const t = window.toast; window.toast = (m) => said.push(m);
      const real = window.dbPut;
      window.dbPut = (x) => (x && x.kind === 'trait') ? Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')) : real(x);
      let ok;
      try { ok = await saveTrait(); } finally { window.dbPut = real; window.toast = t; }
      return { ok, said: said.join(' | ') };
    });
    expect(r.ok).toBe(false);
    expect(r.said).toContain('Could not save: this device is out of storage space');
  });

  test('the control: an import under the quota imports everything and says nothing about space', async ({ page }) => {
    await cap(page);
    const r = await page.evaluate(async ([mk, w]) => {
      const blobs = await (eval(mk))(2);
      const files = blobs.map((b, i) => {
        const f = new File([b], 'n' + i + '.png', { type: 'image/png' });
        Object.defineProperty(f, 'webkitRelativePath', { value: 'UPLOAD/skins/n' + i + '.png' });
        return f;
      });
      const done = await (eval(w))(bulkImport(files));
      return { done, note: document.getElementById('bulknote').textContent,
        n: (await dbAll()).filter(i => i.kind === 'trait').length };
    }, [noisePngs, within(20000)]);
    expect(r.done.settled).toBe(true);
    expect(r.n).toBe(2);
    expect(r.note).not.toContain('out of storage space');
  });
});
