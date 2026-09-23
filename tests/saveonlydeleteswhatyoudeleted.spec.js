/* SAVE TO CLOUD DELETES ONLY WHAT YOU DELETED.

   On your own page cloudPush used to delete every server row, and sweep
   every picture, that this device did not hold. Nothing recorded a
   deletion, so a trait removed on purpose looked exactly like one that never
   arrived. MEASURED BEFORE THE FIX through the real cloudPush against a
   stubbed server: a device holding 1 new trait against 311 on the server
   deleted all 311 rows and all 311 pictures; a device holding 51 of the 311
   deleted the other 260. The first two tests are those measurements and
   went red with exactly those numbers.

   The third is the control that the feature still works: a trait removed
   with the tile's remove button is removed from the server - that row and
   its picture, nothing else - and the record of it is forgotten once done.
   The fourth: Load from cloud does not bring a removed trait back before the
   Save that removes it, and the status line counts it as not yet sent. The
   fifth: an import that replaces an old copy removes the old row the same
   way. */
import { test, expect } from '@playwright/test';

const P = (n) => 'me/c1/trait-' + n + '-skins-approved.png';

/* A personal page, a stubbed server holding `server` names as rows and
   pictures, and `local` names on this device - `synced` ones as copies that
   came from those rows, the rest as new. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  const P = (n) => 'me/c1/trait-' + n + '-skins-approved.png';
  const blob = new Blob([new Uint8Array(16)]);
  const S = { rows: [], files: new Set(), rowDeletes: [], fileDeletes: [], next: 1 };
  for (const n of o.server) { S.rows.push({ id: 'row-' + n, path: P(n), name: n }); S.files.add(P(n)); }
  for (const n of o.synced || []) await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n,
    layer: 'skins', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-' + n,
    rowAt: '2026-01-01T00:00:00Z', path: P(n), synced: true });
  for (const n of o.fresh || []) await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n,
    layer: 'skins', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1 });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0)
      return json(m === 'GET' ? [{ id: 'c1', layers: ['skins'], updated_at: '2026-01-01T00:00:00Z' }] : []);
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      const b = JSON.parse(io.body);
      const names = [...S.files].filter(p => p.indexOf(b.prefix + '/') === 0).map(p => p.slice(b.prefix.length + 1)).sort();
      return json(names.slice(b.offset, b.offset + b.limit).map(n => ({ name: n })));
    }
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') {
      for (const p of JSON.parse(io.body).prefixes) { S.fileDeletes.push(p); S.files.delete(p); }
      return json([]);
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') {
      S.files.add(decodeURIComponent(s.split('/object/traits/')[1].split('?')[0])); return json({ Key: 'ok' });
    }
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9, 9, 9])]));
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      const id = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      const nm = (s.match(/[?&]name=eq\.([^&]+)/) || [])[1];
      const hit = S.rows.filter(r => id ? r.id === decodeURIComponent(id) : (nm && r.name === decodeURIComponent(nm)));
      for (const r of hit) { S.rowDeletes.push(r.id); S.rows.splice(S.rows.indexOf(r), 1); }
      return json(hit.map(r => ({ id: r.id, path: r.path })));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const b = JSON.parse(io.body)[0];
      const r = { id: 'new-' + (S.next++), path: b.path, name: b.name };
      S.rows.push(r);
      return json([{ id: r.id, updated_at: '2026-03-03T00:00:00Z' }]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const rows = S.rows.map(r => ({ id: r.id, path: r.path, kind: 'trait', name: r.name, layer: 'skins',
        status: 'approved', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
      return json(rows.slice(off, off + lim), { 'Content-Range': '0-0/' + rows.length });
    }
    return json([]);
  };
}, o);

const push = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (m) => said.push(m);
  try { await cloudPush(); } finally { window.toast = t; }
  const S = window.__S;
  return { rows: S.rows.length, files: S.files.size, rowDeletes: S.rowDeletes.slice(),
    fileDeletes: S.fileDeletes.slice(), said: said.join(' | ') };
});

const names = (k, from) => Array.from({ length: k }, (_, i) => 't' + (from + i));

test.describe('Save to cloud deletes only what you deleted', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof dbDelShared === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; });
  });

  test('A PHONE WITH ONE NEW TRAIT against 311 on the server deletes nothing, and says what it kept', async ({ page }) => {
    await arm(page, { server: names(311, 0), fresh: ['phone1'] });
    const r = await push(page);
    expect(r.rowDeletes, 'no row deleted').toEqual([]);
    expect(r.fileDeletes, 'no picture deleted').toEqual([]);
    expect(r.rows, 'the 311 and the new one').toBe(312);
    expect(r.files).toBe(312);
    expect(r.said).toContain('311 on the server are not on this device, kept - Load from cloud brings them here');
  });

  test('A LOAD CUT SHORT after 51: the next Save deletes none of the other 260', async ({ page }) => {
    await arm(page, { server: names(311, 0), synced: names(51, 0) });
    const r = await push(page);
    expect(r.rowDeletes).toEqual([]);
    expect(r.fileDeletes).toEqual([]);
    expect(r.rows).toBe(311);
    expect(r.said).toContain('260 on the server are not on this device, kept');
  });

  test('the control: a trait removed with its remove button is removed there - that row and picture only - and forgotten once done',
    async ({ page }) => {
      await arm(page, { server: names(20, 0), synced: names(20, 0) });
      await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 't7'); await dbDelShared(t); });
      const r = await push(page);
      expect(r.rowDeletes, 'exactly that row').toEqual(['row-t7']);
      expect(r.fileDeletes, 'and exactly its picture').toEqual([P('t7')]);
      expect(r.rows).toBe(19);
      expect(r.said).toContain('removed 1 you deleted here');
      expect(r.said).not.toContain('not on this device');
      const again = await push(page);
      expect(again.rowDeletes, 'a second press has nothing more to remove').toEqual(['row-t7']);
      expect(await page.evaluate(async () => (await goneLoad()).length), 'the record of it is gone').toBe(0);
    });

  test('Load from cloud does not bring a removed trait back before the Save, and the status counts it as not yet sent',
    async ({ page }) => {
      await arm(page, { server: names(5, 0), synced: names(5, 0) });
      const r = await page.evaluate(async () => {
        const t = (await dbAll()).find(i => i.name === 't2'); await dbDelShared(t);
        const tt = window.toast; window.toast = () => {};
        try { await cloudPull({ quiet: true }); await cloudStatus({ id: 'u1' }); } finally { window.toast = tt; }
        return { names: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort(),
          note: document.getElementById('cloudnote').textContent };
      });
      expect(r.names, 't2 stays removed').toEqual(['t0', 't1', 't3', 't4']);
      expect(r.note).toContain('1 changed here and not yet sent');
      expect(r.note).not.toContain('Load from cloud to fetch');
    });

  test('an import replacing an old copy removes the old row the same way', async ({ page }) => {
    await arm(page, { server: names(3, 0), synced: names(3, 0) });
    await page.evaluate(async () => {
      const t = (await dbAll()).find(i => i.name === 't1');
      await dbDel(t.id); await cloudDropOne(t);
    });
    const r = await push(page);
    expect(r.rowDeletes).toEqual(['row-t1']);
    expect(r.rows).toBe(2);
  });
});
