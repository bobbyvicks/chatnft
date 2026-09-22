/* A CHANGE THE SERVER HAS NOT GOT STOPS CLAIMING IT HAS - WHEREVER IT WAS MADE.

   patch522 made the pull keep a record with unsent work, keyed on
   synced:false. Only one path wrote that after a change that did not reach
   the server: setTraitStatus, inside a group, after a failed upload. On a
   personal page nothing is sent live at all - Save to cloud and Load from
   cloud are the only two exchanges - and every change left the record
   saying synced:true. So Load from cloud took the server's old status,
   weight, layer and order back over the change, with "Loaded 0 items".

   Measured 2026-09-22 before this change, through the real functions
   against a stubbed server: a status change on a personal page, then Load
   from cloud, and the trait was approved again. The first three tests went
   red the same way, one per kind of change; the fifth went red in a group,
   through a path that is not setTraitStatus. The fourth and sixth are the
   controls: a record nobody touched still takes the server's word, and a
   shelf move whose send failed in a group is still rolled back to what the
   server has, which is a different way of telling the truth. */
import { test, expect } from '@playwright/test';

/* One approved skin that came from server row "row-1", on a personal page
   unless o.group, and a stub server holding that row. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.group ? 'team7' : null; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: 10,
    rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z',
    path: 'me/c1/trait-cap-skins-approved.png', synced: true });
  await renderShelf();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const team = o.group ? 'team7' : 'me';
  const rows = [{ id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    path: 'me/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: o.serverRarity || 1,
    shelf_order: 10, updated_at: o.serverAt || '2026-01-01T00:00:00Z' }];
  window.__realFetch = window.fetch;
  window.fetch = (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json(team));
    if (s.indexOf('/rpc/reorder_traits') >= 0)
      return Promise.resolve(o.rpcStatus ? new Response('{}', { status: o.rpcStatus }) : json(null));
    if (s.indexOf('/rest/v1/teams') >= 0)
      return Promise.resolve(json([{ id: team, name: team, personal: !o.group }]));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['skins', 'hats'] }]));
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST')
      return Promise.resolve((o.uploadStatus || 200) === 200 ? json({ Key: 'ok' })
        : new Response('down', { status: o.uploadStatus }));
    if (s.indexOf('/storage/') >= 0)
      return Promise.resolve(new Response(new Blob([new Uint8Array([9, 9, 9])])));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + rows.length }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = rows.slice(off, off + lim);
      return Promise.resolve(json(batch, { 'Content-Range':
        off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + rows.length }));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return Promise.resolve(json([]));
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST')
      return Promise.resolve(json([{ id: 'row-2', updated_at: '2026-03-03T00:00:00Z' }]));
    return Promise.resolve(json([]));
  };
}, o);

/* The one trait, summarised. */
const one = (page) => page.evaluate(async () => {
  const t = (await dbAll()).filter(i => i.kind === 'trait');
  if (t.length !== 1) return { count: t.length };
  const x = t[0];
  return { count: 1, id: x.id, status: x.status, layer: x.layer, rarity: x.rarity,
    order: x.shelfOrder, synced: !!x.synced, hasPath: !!x.path, rowId: x.rowId };
});

/* Load from cloud, the press. */
const load = (page) => page.evaluate(async () => {
  await cloudPull({ quiet: true });
  return document.getElementById('cloudnote').textContent;
});

test.describe('a change the server has not got stops claiming it has', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function' && typeof cloudPull === 'function'
      && typeof setRarity === 'function' && typeof commitShelfMove === 'function' && typeof retagLayer === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('PERSONAL PAGE, A STATUS CHANGE: marked unsent, and Load from cloud leaves it', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setTraitStatus(t, 'stfp'); });
    const a = await one(page);
    expect(a.status).toBe('stfp');
    expect(a.synced, 'it no longer claims to be on the server').toBe(false);
    expect(a.hasPath, 'nor to be at the server\'s old path').toBe(false);
    expect(a.rowId, 'but still knows which row it will replace').toBe('row-1');
    await load(page);
    const b = await one(page);
    expect(b.count).toBe(1);
    expect(b.status, 'still in the final project after Load from cloud').toBe('stfp');
  });

  test('PERSONAL PAGE, A WEIGHT: marked unsent, and Load from cloud leaves it', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setRarity(t, 3); });
    const a = await one(page);
    expect(a.rarity).toBe(3);
    expect(a.synced).toBe(false);
    await load(page);
    expect((await one(page)).rarity, 'still 3 after Load from cloud').toBe(3);
  });

  test('PERSONAL PAGE, A SHELF MOVE TO ANOTHER LAYER: marked unsent, and Load from cloud leaves it', async ({ page }) => {
    await arm(page, {});
    const ok = await page.evaluate(() => commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null }));
    expect(ok).toBe(true);
    const a = await one(page);
    expect(a.layer).toBe('hats');
    expect(a.synced).toBe(false);
    await load(page);
    expect((await one(page)).layer, 'still on hats after Load from cloud').toBe('hats');
  });

  test('and the control: a record nobody touched still takes the server\'s word', async ({ page }) => {
    await arm(page, { serverRarity: 4, serverAt: '2026-02-02T00:00:00Z' });
    await load(page);
    const r = await one(page);
    expect(r.rarity, 'the server\'s weight arrived').toBe(4);
    expect(r.synced).toBe(true);
  });

  test('IN A GROUP, A LAYER RENAME WHOSE UPLOAD FAILED: marked unsent through the shared path, not setTraitStatus',
    async ({ page }) => {
      await arm(page, { group: true, uploadStatus: 503 });
      const r = await page.evaluate(async () => retagLayer(await dbAll(), 'skins', 'hats'));
      expect(r.moved).toBe(1);
      expect(r.stranded, 'and it says the group did not get it').toBe(1);
      const a = await one(page);
      expect(a.layer).toBe('hats');
      expect(a.synced, 'marked unsent by cloudMoveOne itself').toBe(false);
      await load(page);
      expect((await one(page)).layer, 'kept through the pull').toBe('hats');
    });

  test('and a shelf move whose send failed in a group is rolled back, which is the other way of telling the truth',
    async ({ page }) => {
      await arm(page, { group: true, rpcStatus: 500 });
      const ok = await page.evaluate(() => commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null }));
      expect(ok).toBe(false);
      const a = await one(page);
      expect(a.layer, 'back where the server has it').toBe('skins');
      expect(a.synced, 'and rightly still synced').toBe(true);
    });
});
