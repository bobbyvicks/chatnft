/* A WEIGHT CARRIED ACROSS A MOVE REACHES THE GROUP.

   A folder import inside a group that moves hat from wip to approved
   uploads the new record at the default weight, then carries the old
   weight onto it here. RUN AGAINST THE PAGE BEFORE THE FIX: no patch was
   sent, the server row kept weight 1, and the record said it was synced.
   The second test is the patch failing: the record must then say it is
   not sent. The third is the control on a personal page, where nothing is
   uploaded and nothing is patched. Placeholder token only. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.group ? 'team7' : null; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = true;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  window.hatPng = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  const team = o.group ? 'team7' : 'me';
  await dbPut({ id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip',
    blob: new Blob([window.hatPng], { type: 'image/png' }), w: 16, h: 16, rarity: 4, at: 1000, shelfOrder: 3,
    rowId: 'row-old', rowAt: '2026-01-01T00:00:00Z', path: team + '/c1/trait-hat-hats-wip.png', synced: !!o.group });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__log = { rows: [], patches: [] };
  window.fetch = async (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET', log = window.__log;
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json(team);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: team, name: team, personal: !o.group }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') return json({ Key: 'ok' });
    if (s.indexOf('/storage/') >= 0) return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      log.patches.push(JSON.parse(opt.body));
      if (o.patchFails) return new Response('down', { status: 503 });
      return json([{ id: 'row-new', updated_at: '2026-04-04T00:00:00Z' }]);
    }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/0' });
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      log.rows.push(JSON.parse(opt.body)[0]);
      return json([{ id: 'row-new', updated_at: '2026-03-03T00:00:00Z' }]);
    }
    return json([]);
  };
}, o);

const importMoved = (page) => page.evaluate(async () => {
  await bulkImport([fileWithPath(window.hatPng, 'hats/approved/hat.png')]);
  const r = await dbGet('t_hat_hats_approved');
  return { rows: window.__log.rows.map(x => x.rarity), patches: window.__log.patches.map(x => x.rarity),
    rarity: r.rarity, order: r.shelfOrder, synced: !!r.synced, unsent: r.unsent || null,
    wipGone: !(await dbGet('t_hat_hats_wip')) };
});

test.describe('a trait moved by a folder import keeps its weight in the group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof bulkImport === 'function' && typeof fileWithPath === 'function');
  });

  test('IN A GROUP the carried weight is sent to the row, and the record is synced with it', async ({ page }) => {
    await arm(page, { group: true });
    const r = await importMoved(page);
    console.log('group: ' + JSON.stringify(r));
    expect(r.wipGone, 'the move happened').toBe(true);
    expect(r.rarity).toBe(4);
    expect(r.patches, 'the weight went to the group').toEqual([4]);
    expect(r.synced).toBe(true);
  });

  test('IN A GROUP WITH THE PATCH FAILING the record says it is not sent', async ({ page }) => {
    await arm(page, { group: true, patchFails: true });
    const r = await importMoved(page);
    expect(r.rarity).toBe(4);
    expect(r.synced).toBe(false);
    expect(r.unsent, 'a weight-only change, for Save to cloud to patch').toBe('meta');
  });

  test('the control: on a personal page nothing is uploaded or patched, and the weight is carried', async ({ page }) => {
    await arm(page, { group: false });
    const r = await importMoved(page);
    expect(r).toMatchObject({ rows: [], patches: [], rarity: 4, order: 3, wipGone: true, synced: false });
  });
});
