/* A GROUP SAVE THAT DROPS ITS ROW DOES NOT COST THE GROUP THE TRAIT.

   Saving an edit in a group deletes the old row and inserts the new one,
   and the insert had one attempt. A 503 there left the group with no row,
   and every teammate's next open deleted the trait as "removed by someone
   else" - measured, 3 rows became 2 on the server and on the teammate.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red (one
   attempt, the row gone), the second went red (an insert whose answer was
   lost reported as a failure), and the fourth went red (the teammate
   deleted the trait although its picture was still in storage). The third
   and fifth are the controls: a definite refusal is not retried, and a
   trait whose picture is gone too is still removed from the teammate. */
import { test, expect } from '@playwright/test';

const P = (n) => 'team7/c1/trait-' + n + '-skins-approved.png';

/* A group, one local synced trait `cap` on row-1 (plus `hat` on row-5 so the
   server never reads as empty), and a stub server. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  const P = (n) => 'team7/c1/trait-' + n + '-skins-approved.png';
  const blob = new Blob([new Uint8Array(16)]);
  for (const [n, row] of [['cap', 'row-1'], ['hat', 'row-5']])
    await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n, layer: 'skins', status: 'approved',
      blob, w: 16, h: 16, rarity: 1, at: 1, rowId: row, rowAt: '2026-01-01T00:00:00Z', path: P(n), synced: true });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const S = { rows: o.rows.map(r => Object.assign({}, r)), files: new Set(o.files), posts: 0, next: 2 };
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      if (o.listFails) return json({}, 500);
      const b = JSON.parse(io.body);
      const names = [...S.files].filter(p => p.indexOf(b.prefix + '/') === 0).map(p => p.slice(b.prefix.length + 1)).sort();
      return json(names.slice(b.offset, b.offset + b.limit).map(n => ({ name: n })));
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') { S.files.add(decodeURIComponent(s.split('/object/traits/')[1])); return json({ Key: 'ok' }); }
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9, 9, 9])]));
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      const id = decodeURIComponent((s.match(/[?&]id=eq\.([^&]+)/) || [])[1] || '');
      const hit = S.rows.filter(r => r.id === id);
      for (const r of hit) S.rows.splice(S.rows.indexOf(r), 1);
      return json(hit);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      S.posts++;
      const b = JSON.parse(io.body)[0];
      const clash = S.rows.find(r => r.name === b.name && r.layer === b.layer && r.status === b.status);
      if (clash) return json({ code: '23505' }, 409);
      if (o.insert === '503once' && S.posts === 1) return json({}, 503);
      if (o.insert === 'forbid') return json({}, 403);
      const r = { id: 'row-' + (S.next++ + 10), name: b.name, layer: b.layer, status: b.status, path: b.path,
        kind: 'trait', w: 16, h: 16, rarity: 1, updated_at: '2026-03-03T00:00:00Z' };
      S.rows.push(r);
      if (o.insert === 'lostOnce' && S.posts === 1) throw new TypeError('Failed to fetch');
      return json([{ id: r.id, updated_at: r.updated_at }]);
    }
    if (s.indexOf('/rest/v1/traits?select=id,updated_at&') >= 0) {
      const nm = decodeURIComponent((s.match(/[?&]name=eq\.([^&]+)/) || [])[1] || '');
      return json(S.rows.filter(r => r.name === nm).map(r => ({ id: r.id, updated_at: r.updated_at })));
    }
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return json(S.rows.slice(off, off + lim));
    }
    return json([]);
  };
}, o);

const ROWS = [
  { id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved', path: P('cap'), w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-5', kind: 'trait', name: 'hat', layer: 'skins', status: 'approved', path: P('hat'), w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' },
];

/* Device A saves its edit of cap. */
const save = (page) => page.evaluate(async () => {
  const rec = (await dbAll()).find(i => i.name === 'cap');
  const why = {};
  const ok = await cloudSyncOne(Object.assign({}, rec, { synced: false }), null, why);
  const now = await dbGet(rec.id);
  const S = window.__S;
  return { ok: !!ok, reason: why.reason || null, posts: S.posts, serverCaps: S.rows.filter(r => r.name === 'cap').map(r => r.id),
    synced: !!now.synced, rowId: now.rowId };
});

/* Device B opens the project. */
const open = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (m) => said.push(m);
  try { await groupCatchUp(); } finally { window.toast = t; }
  return { names: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort(), said: said.join(' | ') };
});

test.describe('a group save that drops its row does not cost the group the trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudSyncOne === 'function' && typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('THE SAVER: a 503 on the row insert is retried, and the group still has the trait', async ({ page }) => {
    await arm(page, { rows: ROWS, files: [P('cap'), P('hat')], insert: '503once' });
    const r = await save(page);
    expect(r.ok, 'the save landed').toBe(true);
    expect(r.posts, 'on the second attempt').toBe(2);
    expect(r.serverCaps.length, 'one row for cap on the server').toBe(1);
    expect(r.synced).toBe(true);
    expect(r.rowId).toBe(r.serverCaps[0]);
  });

  test('an insert that landed but whose answer was lost is adopted, not refused', async ({ page }) => {
    await arm(page, { rows: ROWS, files: [P('cap'), P('hat')], insert: 'lostOnce' });
    const r = await save(page);
    expect(r.ok).toBe(true);
    expect(r.serverCaps.length, 'still one row, not two').toBe(1);
    expect(r.synced).toBe(true);
    expect(r.rowId, 'the record points at the row that exists').toBe(r.serverCaps[0]);
  });

  test('the control: a definite refusal is said at once, not retried', async ({ page }) => {
    await arm(page, { rows: ROWS, files: [P('cap'), P('hat')], insert: 'forbid' });
    const r = await save(page);
    expect(r.ok).toBe(false);
    expect(r.posts, 'one attempt').toBe(1);
    expect(r.reason).toBe('notallowed');
  });

  test('THE TEAMMATE: a trait whose row is missing but whose picture is still stored is kept, and said', async ({ page }) => {
    await arm(page, { rows: [ROWS[1]], files: [P('cap'), P('hat')] });
    const r = await open(page);
    expect(r.names, 'cap is still here').toEqual(['cap', 'hat']);
    expect(r.said).not.toContain('removed by someone else');
    expect(r.said).toContain("1 kept - missing from the group's list, but its picture is still there");
  });

  test('and a storage listing that fails decides nothing: the trait is kept, not deleted', async ({ page }) => {
    await arm(page, { rows: [ROWS[1]], files: [P('hat')], listFails: true });
    const r = await open(page);
    expect(r.names).toEqual(['cap', 'hat']);
    expect(r.said).not.toContain('removed by someone else');
  });

  test('the control: a trait whose row and picture are both gone is still removed', async ({ page }) => {
    await arm(page, { rows: [ROWS[1]], files: [P('hat')] });
    const r = await open(page);
    expect(r.names).toEqual(['hat']);
    expect(r.said).toContain('1 removed by someone else');
  });
});
