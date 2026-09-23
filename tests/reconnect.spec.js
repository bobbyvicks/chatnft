/* A GROUP RESENDS WHAT IT OWES WHEN THE CONNECTION COMES BACK, AND AN
   ANSWER GIVEN OFFLINE SAYS SO.

   Nothing listened for the connection returning, so unsent work in a group
   waited for somebody to press Save to cloud, and a review answer given
   offline was kept in silence. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first test went red (no upload after the online event), the second went
   red (the rules never sent), and the fourth went red (nothing said about
   the answer). The third is the control that your own page sends nothing
   on a reconnect - there nothing is sent without a press. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.group ? 'team7' : null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  sharedRuleSig = null;
  await dbClear();
  LAYERS = ['hats', 'masks', 'unsorted'];
  RULES = []; DECISIONS = [];
  for (const n of ['cap', 'veil']) await dbPut({ id: 't_' + n + '_hats_approved', kind: 'trait', name: n, layer: 'hats',
    status: 'approved', blob: new Blob([new Uint8Array(16)]), w: 16, h: 16, rarity: 1, at: 1, synced: !o.unsent });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const S = { uploads: 0, rulePatches: 0, offline: !!o.offline };
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (S.offline) throw new TypeError('Failed to fetch');
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json(activeWs || 'me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections?select=decisions') >= 0) return json([{ decisions: [] }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'PATCH') { if (JSON.parse(io.body).rules) S.rulePatches++; return json([]); }
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') { S.uploads++; return json({ Key: 'ok' }); }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row' + S.uploads, updated_at: '2026-03-03T00:00:00Z' }]);
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    return json([]);
  };
}, o);

const online = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (x) => said.push(x);
  window.dispatchEvent(new Event('online'));
  await new Promise(r => setTimeout(r, 1500));
  window.toast = t;
  const synced = (await dbAll()).filter(i => i.kind === 'trait' && i.synced).length;
  return { uploads: window.__S.uploads, rulePatches: window.__S.rulePatches, synced, said: said.join(' | ') };
});

test.describe('a group resends what it owes when the connection comes back', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof decidePair === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('IN A GROUP, UNSENT TRAITS are sent when the connection comes back', async ({ page }) => {
    await arm(page, { group: true, unsent: true });
    const r = await online(page);
    expect(r.uploads).toBe(2);
    expect(r.synced).toBe(2);
  });

  test('and rules that never reached the server are sent too', async ({ page }) => {
    await arm(page, { group: true, unsent: false });
    await page.evaluate(() => { RULES = [['hats/cap', 'masks/veil']]; DECISIONS = [{ a: 'hats/cap', b: 'masks/veil', ok: false, at: 5, src: 'you' }]; sharedRuleSig = null; });
    const r = await online(page);
    expect(r.rulePatches).toBe(1);
    expect(r.uploads, 'nothing unsent, nothing uploaded').toBe(0);
  });

  test('the control: on your own page a reconnect sends nothing', async ({ page }) => {
    await arm(page, { group: false, unsent: true });
    const r = await online(page);
    expect(r.uploads).toBe(0);
    expect(r.synced).toBe(0);
  });

  test('AN ANSWER GIVEN OFFLINE says it is being kept here, once, not once per answer', async ({ page }) => {
    await arm(page, { group: true, unsent: false, offline: true });
    const r = await page.evaluate(async () => {
      const said = []; const t = window.toast; window.toast = (x) => said.push(x);
      const a = await decidePair('hats/cap', 'masks/veil', false);
      await decidePair('hats/veil', 'masks/cap', true);
      window.toast = t;
      return { sent: a, said };
    });
    expect(r.sent).toBe(false);
    expect(r.said.filter(x => x.indexOf('Answers are being kept on this device') === 0).length).toBe(1);
  });
});
