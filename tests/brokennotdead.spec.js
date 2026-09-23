/* A FEW BROKEN PICTURES ARE NOT A DEAD LINE.

   A pull or a push stops after three transfers in a row that could not
   reach the server. With eight downloads (six uploads) at once, pictures
   that fail on their own can finish back to back, and the run stopped with
   the line fine. The fixtures put ten unreadable pictures together, so
   every worker lands on one at the same time. RUN AGAINST THE PAGE BEFORE
   THE FIX: the first two went red - the pull stopped short of 190 and the
   push short of 50, each saying the server had stopped answering. The last
   is the control that a line that really goes dead partway still stops the
   run. */
import { test, expect } from '@playwright/test';

const run = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const N = o.n;
  if (o.push) for (let i = 0; i < N; i++) await dbPut({ id: 't_x' + i + '_hats_approved', kind: 'trait', name: 'x' + i,
    layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(32)]), w: 16, h: 16, rarity: 1, at: 1 });
  const rows = o.push ? [] : Array.from({ length: N }, (_, i) => ({ id: 'row' + i, kind: 'trait', name: 'x' + i, layer: 'hats',
    status: 'approved', path: 'me/c1/x' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st, extra) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const bad = (i) => i >= o.badFrom && i < o.badTo;
  let transfers = 0;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/collections') >= 0) return json(m === 'GET' ? [{ id: 'c1', layers: ['hats'] }] : []);
    if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      transfers++;
      /* x12.png on a download, trait-x12-hats-approved.png on an upload. */
      const i = parseInt((s.match(/[^a-z]x(\d+)[-.]/) || [0, '-1'])[1], 10);
      if (o.deadAfter && transfers > o.deadAfter) throw new TypeError('Failed to fetch');
      if (bad(i)) { await new Promise(r => setTimeout(r, 5)); throw new TypeError('Failed to fetch'); }
      await new Promise(r => setTimeout(r, 15));
      return m === 'POST' ? json({ Key: 'ok' }) : new Response(new Blob([new Uint8Array([7])]));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'new' + transfers, updated_at: '2026-03-03T00:00:00Z' }]);
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
  finally { window.toast = t; window.fetch = window.__realFetch; }
  const all = (await dbAll()).filter(i => i.kind === 'trait');
  return { stored: all.length, sent: all.filter(i => i.synced).length, said: said.join(' | '),
    note: document.getElementById('cloudnote').textContent };
}, o);

test.describe('a few broken pictures are not a dead line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
  });

  test('A PULL WITH TEN UNREADABLE PICTURES TOGETHER loads every other one', async ({ page }) => {
    const r = await run(page, { n: 200, badFrom: 100, badTo: 110 });
    console.log('pull: ' + JSON.stringify(r));
    expect(r.stored).toBe(190);
    expect(r.note).not.toContain('stopped answering');
  });

  test('A PUSH WITH TEN UNSENDABLE PICTURES TOGETHER sends every other one', async ({ page }) => {
    const r = await run(page, { push: true, n: 60, badFrom: 20, badTo: 30 });
    console.log('push: ' + JSON.stringify(r));
    expect(r.sent).toBe(50);
    expect(r.said + ' ' + r.note).not.toContain('stopped answering');
  });

  test('the control: a line that goes dead partway still stops the pull', async ({ page }) => {
    const r = await run(page, { n: 200, badFrom: -1, badTo: -1, deadAfter: 60 });
    console.log('dead: ' + JSON.stringify(r));
    expect(r.stored).toBeLessThan(100);
    expect(r.note).toContain('stopped answering');
  });
});
