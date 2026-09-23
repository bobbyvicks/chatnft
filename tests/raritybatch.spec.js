/* MANY WEIGHTS SET AT ONCE ARE ONE WRITE AND ONE REQUEST, NOT ONE EACH.

   "Set the rest to normal" and the first slider release on a set gave every
   unplanned trait the normal weight one at a time, a request each, one in
   flight: 5.2 s for 47 backgrounds and 29 s for 264 at 100 ms round trips.
   Here the stub answers in 100 ms. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first test went red with 47 requests and 5.2 s; after it, 1 request and
   about 120 ms. The second went red too, and for a reason worth keeping: a
   PATCH that matched no row answers 200, and one at a time read that as
   sent. The batch reads back which rows answered, so a row the group did
   not answer for is marked unsent. The third is the control that on your
   own page nothing is sent and a trait that was on the server is marked
   unsent, as it always was. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.group ? 'team7' : null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['backgrounds', 'unsorted'];
  for (let i = 0; i < 47; i++) await dbPut({ id: 't_b' + i + '_backgrounds_approved', kind: 'trait', name: 'b' + i, layer: 'backgrounds',
    status: 'approved', blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, at: 1, rowId: 'row' + i,
    path: (o.group ? 'team7' : 'me') + '/c1/trait-b' + i + '-backgrounds-approved.png', synced: true });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const S = { patches: 0 };
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      S.patches++;
      await new Promise(r => setTimeout(r, 100));
      const ids = s.indexOf('id=in.(') >= 0 ? decodeURIComponent(s.split('id=in.(')[1].split(')')[0]).split(',')
        : [decodeURIComponent((s.match(/id=eq\.([^&]+)/) || [])[1] || '')];
      return json(ids.filter(id => id !== o.dropRow).map(id => ({ id })));
    }
    return json([]);
  };
  const t = window.toast; window.toast = () => {};
  const t0 = performance.now();
  try { await $('planseedall').onclick(); } finally { window.toast = t; window.fetch = window.__realFetch; }
  const ms = Math.round(performance.now() - t0);
  const all = (await dbAll()).filter(i => i.kind === 'trait');
  return { ms, patches: S.patches, normal: all.filter(i => i.rarity === RAR_NORMAL).length,
    unsent: all.filter(i => !i.synced).map(i => i.name).sort() };
}, o);

test.describe('many weights set at once are one write and one request', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof seedRarity === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; });
  });

  test('SET THE REST TO NORMAL on 47 backgrounds is one request, not 47', async ({ page }) => {
    const r = await arm(page, { group: true });
    console.log('47 weights: ' + r.ms + ' ms, ' + r.patches + ' request(s)');
    expect(r.normal).toBe(47);
    expect(r.patches).toBe(1);
    expect(r.unsent).toEqual([]);
    expect(r.ms).toBeLessThan(1500);
  });

  test('a row the group did not answer for is marked unsent', async ({ page }) => {
    const r = await arm(page, { group: true, dropRow: 'row5' });
    expect(r.normal).toBe(47);
    expect(r.unsent).toEqual(['b5']);
  });

  test('the control: on your own page nothing is sent, and what was on the server waits for Save to cloud', async ({ page }) => {
    const r = await arm(page, { group: false });
    expect(r.patches).toBe(0);
    expect(r.normal).toBe(47);
    expect(r.unsent.length).toBe(47);
  });

  test('ONE WEIGHT whose row is gone on the server is not counted as sent', async ({ page }) => {
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
      await dbClear();
      await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
        blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-gone',
        path: 'team7/c1/trait-cap-hats-approved.png', synced: true });
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const real = window.fetch;
      window.fetch = async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      try { await setRarity(await dbGet('t_cap_hats_approved'), 4); } finally { window.fetch = real; }
      const rec = await dbGet('t_cap_hats_approved');
      return { rarity: rec.rarity, synced: rec.synced, unsent: rec.unsent };
    });
    expect(r.rarity).toBe(4);
    expect(r.synced, 'the group has no row for it, so it waits for Save to cloud').toBe(false);
    expect(r.unsent).toBe('meta');
  });
});
