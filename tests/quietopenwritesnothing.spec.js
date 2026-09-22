/* AN ORDINARY OPEN WRITES NOTHING.

   The comment above cloudPull's repair loop said "Only the ones actually
   missing it, so an ordinary open writes nothing." The loop wrote every
   matched row back. MEASURED BEFORE THE FIX, 311 traits on the device and
   the same 311 on the server: 311 record writes per catch-up, which runs on
   every page load, each write a full record with its picture. The first
   test is that measurement and went red with 311.

   The others say what a repair still has to write: a teammate's in-place
   move, which is the whole point of the repair; a row whose only change is
   a newer stamp, because the next pull measures "has the server moved on"
   against it; a teammate's reweight. And the count of in-place changes is
   now in the note, which it never was - a reorder by a teammate arrived in
   silence while a re-uploaded picture was announced. */
import { test, expect } from '@playwright/test';

/* N synced traits from rows row-0..row-N-1, and a server holding the same
   rows with `change` applied to row-0. Counts every store write of a trait
   record during one real groupCatchUp. */
const open = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: LAYERS.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const rows = [];
  for (let i = 0; i < o.n; i++) {
    await dbPut({ id: 't_t' + i + '_skins_approved', kind: 'trait', name: 't' + i, layer: 'skins', status: 'approved',
      blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: i, rowId: 'row-' + i, rowAt: '2026-01-01T00:00:00Z',
      path: 'team7/c1/trait-t' + i + '-skins-approved.png', synced: true });
    rows.push({ id: 'row-' + i, kind: 'trait', name: 't' + i, layer: 'skins', status: 'approved',
      path: 'team7/c1/trait-t' + i + '-skins-approved.png', w: 16, h: 16, rarity: 1, shelf_order: i,
      updated_at: '2026-01-01T00:00:00Z' });
  }
  Object.assign(rows[0], o.change || {});
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins', 'hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = rows.slice(off, off + lim);
      return json(batch, { 'Content-Range': off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + rows.length });
    }
    return json([]);
  };
  let puts = 0, dels = 0;
  const realPut = dbPut, realDel = dbDel;
  window.dbPut = (r) => { if (r && String(r.id).indexOf('t_') === 0) puts++; return realPut(r); };
  window.dbDel = (id) => { if (String(id).indexOf('t_') === 0) dels++; return realDel(id); };
  try { await groupCatchUp(); } finally { window.dbPut = realPut; window.dbDel = realDel; }
  const first = (await dbAll()).find(i => i.kind === 'trait' && i.rowId === 'row-0');
  return { puts, dels, note: document.getElementById('cloudnote').textContent,
    first: first ? { id: first.id, layer: first.layer, order: first.shelfOrder, rarity: first.rarity, rowAt: first.rowAt } : null };
}, o);

test.describe('an ordinary open writes nothing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('311 traits, nothing changed on the server: no record is written', async ({ page }) => {
    const r = await open(page, { n: 311 });
    expect(r.puts, 'writes').toBe(0);
    expect(r.dels).toBe(0);
    expect(r.note).not.toContain('changed in place');
  });

  test('a teammate\'s move to another layer is still written, once, and said', async ({ page }) => {
    const r = await open(page, { n: 20, change: { layer: 'hats', shelf_order: 3, updated_at: '2026-02-02T00:00:00Z' } });
    expect(r.puts).toBe(1);
    expect(r.first).toEqual({ id: 't_t0_hats_approved', layer: 'hats', order: 3, rarity: 1, rowAt: '2026-02-02T00:00:00Z' });
    expect(r.note).toContain('1 changed in place by the group');
  });

  test('a row whose only change is a newer stamp is still written, so the next pull can tell', async ({ page }) => {
    const r = await open(page, { n: 20, change: { updated_at: '2026-02-02T00:00:00Z' } });
    expect(r.puts).toBe(1);
    expect(r.first.rowAt).toBe('2026-02-02T00:00:00Z');
  });

  test('and a teammate\'s reweight is still written', async ({ page }) => {
    const r = await open(page, { n: 20, change: { rarity: 4, updated_at: '2026-02-02T00:00:00Z' } });
    expect(r.puts).toBe(1);
    expect(r.first.rarity).toBe(4);
  });
});
