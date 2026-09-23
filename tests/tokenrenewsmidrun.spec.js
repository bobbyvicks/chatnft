/* A SIGN-IN THAT EXPIRES MID-RUN IS RENEWED, NOT FATAL.

   Save to cloud and Load from cloud built their headers once and carried
   the same token to the end, so a run that outlived the token failed every
   request after it expired. Here the clock is virtual: every picture moved
   advances it three seconds, and the token expires 70 s after the start.
   The stub accepts a token only while it is live. RUN AGAINST THE PAGE
   BEFORE THE FIX: the push and the pull went red with the pictures after
   the expiry failing. The third test pins that the renewal happened once,
   however many requests reached the expiry together. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const base = Date.now(); let skew = 0;
  window.__realNow = Date.now; Date.now = () => base + skew;
  const exp1 = Math.floor(base / 1000) + 70;
  const S = { live: { 'tok-1': exp1 }, refreshes: 0, ok: 0, rejected: 0 };
  window.__S = S;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'tok-1', refresh_token: 'r1', expires_at: exp1, user: { id: 'u1' } }));
  const N = 40;
  if (o.push) for (let i = 0; i < N; i++) await dbPut({ id: 't_x' + i + '_hats_approved', kind: 'trait', name: 'x' + i,
    layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(32)]), w: 16, h: 16, rarity: 1, at: 1 });
  const rows = o.push ? [] : Array.from({ length: N }, (_, i) => ({ id: 'row' + i, kind: 'trait', name: 'x' + i, layer: 'hats',
    status: 'approved', path: 'me/c1/x' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
  const json = (x, st, extra) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const liveTok = (io) => {
    const a = io && io.headers && io.headers.Authorization;
    const t = a ? String(a).replace('Bearer ', '') : null;
    return t && S.live[t] && (Date.now() / 1000) < S.live[t];
  };
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/token') >= 0) {
      S.refreshes++; await new Promise(r => setTimeout(r, 30));
      const e = Math.floor(Date.now() / 1000) + 3600; S.live['tok-2'] = e;
      return json({ access_token: 'tok-2', refresh_token: 'r2', expires_at: e, user: { id: 'u1' } });
    }
    if (!liveTok(io)) { S.rejected++; return json({ message: 'JWT expired' }, 401); }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/collections') >= 0) return json(m === 'GET' ? [{ id: 'c1', layers: ['hats'] }] : []);
    if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      skew += 3000; S.ok++;
      return m === 'POST' ? json({ Key: 'ok' }) : new Response(new Blob([new Uint8Array([7])]));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'new' + S.ok, updated_at: '2026-03-03T00:00:00Z' }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(rows.slice(off, off + 1000));
    }
    return json([]);
  };
  const said = []; const t = window.toast; window.toast = (x) => said.push(x);
  try { if (o.push) await cloudPush(); else await cloudPull({ quiet: true }); }
  finally { window.toast = t; window.fetch = window.__realFetch; Date.now = window.__realNow; }
  return { said: said.join(' | '), note: document.getElementById('cloudnote').textContent,
    traits: (await dbAll()).filter(i => i.kind === 'trait' && i.synced).length, refreshes: S.refreshes, rejected: S.rejected };
}, o);

test.describe('a sign-in that expires mid-run is renewed, not fatal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof sbToken === 'function');
  });

  test('SAVE TO CLOUD that outlives its token saves every trait', async ({ page }) => {
    const r = await arm(page, { push: true });
    expect(r.said).toContain('Saved 40 to the cloud');
    expect(r.said).not.toContain('failed');
  });

  test('LOAD FROM CLOUD that outlives its token loads every trait', async ({ page }) => {
    const r = await arm(page, { push: false });
    expect(r.traits).toBe(40);
    expect(r.note).not.toContain('could not be read');
  });

  test('and the token is renewed once, not once per request that reached the expiry', async ({ page }) => {
    const r = await arm(page, { push: true });
    expect(r.refreshes).toBe(1);
    expect(r.rejected, 'nothing was sent with a dead token').toBe(0);
  });
});
