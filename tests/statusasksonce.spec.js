/* A STATUS PRESS IN A GROUP ASKS WHO AND WHERE ONCE.

   The press moves the trait to a new identity on the server: the new copy
   up, then the old row down, and each half asked who is signed in and
   which collection this is. RUN AGAINST THE PAGE BEFORE THE FIX: the first
   test went red with the sign-in check and the collection read twice each.
   The second is the control that the move still happens - the new row
   exists and the old one is gone - and the third that a press whose
   sign-in cannot be checked changes nothing on the server and does not
   claim it did. */
import { test, expect } from '@playwright/test';

const press = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'ws1'; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const t = { id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip',
    blob: new Blob([new Uint8Array(64)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 1, rowId: 'row_hat', synced: true,
    path: 'ws1/c1/hats/wip/hat.png' };
  await dbPut(t);
  const S = { rows: [{ id: 'row_hat', name: 'hat', layer: 'hats', status: 'wip' }], log: [] };
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) { S.log.push('user'); return o.authDown ? Promise.reject(new TypeError('Failed to fetch')) : json({ id: 'u1' }); }
    if (s.indexOf('/rest/v1/collections') >= 0) { S.log.push('collection'); return json([{ id: 'c1', layers: ['hats'] }]); }
    if (s.indexOf('/storage/v1/object/traits') >= 0) { S.log.push('storage-' + m); return json({}); }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      S.log.push('row-create');
      const b = JSON.parse(io.body)[0]; const rec = { id: 'row_new', name: b.name, layer: b.layer, status: b.status };
      S.rows.push(rec); return json([rec]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      S.log.push('row-delete');
      const rowId = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      const gone = [];
      if (rowId) { const at = S.rows.findIndex(r => r.id === decodeURIComponent(rowId)); if (at >= 0) gone.push(S.rows.splice(at, 1)[0]); }
      return json(gone);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) { S.log.push('rows'); return json(S.rows); }
    S.log.push('other ' + m + ' ' + s.split('/').slice(3).join('/'));
    return json([]);
  };
  const said = []; const tt = window.toast; window.toast = (x) => said.push(String(x));
  let r, now;
  try {
    r = await setTraitStatus(t, 'approved');
    /* Read while the group is still the open project. */
    now = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + ':' + i.status + ':' + (i.synced ? 'sent' : 'unsent'));
  }
  finally { window.fetch = real; window.toast = tt; activeWs = null; }
  return { log: S.log, rows: S.rows.map(x => x.id + ':' + x.status), shared: !!(r && r.shared), said: said.join(' | '),
    now, why: r && r.why };
}, o || {});

test.describe('a status press in a group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function');
  });

  test('ASKS WHO IS SIGNED IN, AND WHICH COLLECTION, ONCE EACH', async ({ page }) => {
    const r = await press(page);
    console.log('requests: ' + r.log.join(', '));
    expect(r.log.filter(x => x === 'user').length).toBe(1);
    expect(r.log.filter(x => x === 'collection').length).toBe(1);
  });

  test('the control: the move still happens - the new row is there and the old one gone', async ({ page }) => {
    const r = await press(page);
    expect(r.rows).toEqual(['row_new:approved']);
    expect(r.shared).toBe(true);
  });

  test('the control: a press whose sign-in cannot be checked still says why', async ({ page }) => {
    const r = await press(page, { authDown: true });
    console.log('auth down: ' + JSON.stringify({ now: r.now, why: r.why, said: r.said }));
    expect(r.rows, 'nothing changed on the server').toEqual(['row_hat:wip']);
    expect(r.shared, 'and the press does not claim it did').toBe(false);
    expect(r.now.length, 'the trait is still here').toBe(1);
    expect(r.now[0], 'and knows it has not been sent').toMatch(/:unsent$/);
  });
});
