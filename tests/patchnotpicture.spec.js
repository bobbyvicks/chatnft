/* A CHANGED WEIGHT OR ORDER IS SENT AS A PATCH, NOT A PICTURE.

   patch525 made a reweight or a reorder on a personal page mark the record
   unsent, so that Load from cloud leaves it alone and Save to cloud sends
   it. Save to cloud knew one way to send a record: upload the picture,
   delete the row, insert a new one. So a reorder of a layer queued every
   picture in it. MEASURED BEFORE THE FIX, through the real setRarity and
   cloudPush against a stubbed server: one reweight on a personal page, one
   Save to cloud, one picture uploaded and the row re-inserted. The first
   test is that measurement and went red on the upload count.

   Now the record keeps its path when the path still describes it, and Save
   to cloud, meeting a record that is unsent but whose row and path stand,
   patches the row's weight and order by id. The third test is the control
   one field over: a status change moves the identity, the path goes, and
   the record takes the upload. The fourth is the row being gone: the patch
   matches nothing and the upload happens as it would have. The fifth is
   the group page, where the live patch failed and Save to cloud finishes
   the job the cheap way. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = o.group ? 'team7' : null; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: ['skins', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const team = o.group ? 'team7' : 'me';
  /* With o.unsentArt the record is the shape stillnotsent.spec.js holds: a
     picture that could not be uploaded, so synced is off, but the path an
     older pull put on it still describes it and there is no word about
     what changed. */
  const put = (name, row, order) => dbPut({ id: 't_' + name + '_skins_approved', kind: 'trait', name, layer: 'skins',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: order,
    rowId: row, rowAt: '2026-01-01T00:00:00Z', path: team + '/c1/trait-' + name + '-skins-approved.png', synced: !o.unsentArt });
  await put('cap', 'row-1', 10);
  if (o.extra) await put('hat', 'row-9', 11);
  await renderShelf();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__log = { uploads: 0, patches: [] };
  window.__realFetch = window.fetch;
  window.fetch = async (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET', log = window.__log;
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json(team);
    if (s.indexOf('/rpc/reorder_traits') >= 0) return json(null);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: team, name: team, personal: !o.group }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') { log.uploads++; return json({ Key: 'ok' }); }
    if (s.indexOf('/storage/') >= 0) return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      const id = decodeURIComponent((s.match(/id=eq\.([^&]+)/) || [])[1] || '');
      log.patches.push(Object.assign({ id }, JSON.parse(opt.body)));
      if (o.failFirstPatch && log.patches.length === 1) return new Response('down', { status: 503 });
      return json(o.patchGone ? [] : [{ id, updated_at: '2026-04-04T00:00:00Z' }]);
    }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/0' });
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row-2', updated_at: '2026-03-03T00:00:00Z' }]);
    return json([]);
  };
}, o);

const summary = (page) => page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait')
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(x => ({ id: x.id, synced: !!x.synced, hasPath: !!x.path, rowId: x.rowId, rowAt: x.rowAt || null, rarity: x.rarity, order: x.shelfOrder })));

const act = (page, what) => page.evaluate(async (what) => {
  const t = (await dbAll()).find(i => i.name === 'cap');
  if (what === 'rarity') await setRarity(t, 3);
  if (what === 'status') await setTraitStatus(t, 'stfp');
  if (what === 'reorder') await commitShelfMove({ recordKey: 'row-9', toLayer: 'skins', beforeKey: 'row-1' });
}, what);

const save = (page) => page.evaluate(async () => {
  const said = [];
  const realToast = window.toast; window.toast = (m) => { said.push(m); };
  try { await cloudPush(); } finally { window.toast = realToast; }
  return { uploads: window.__log.uploads, patches: window.__log.patches, said: said.join(' | ') };
});

test.describe('a changed weight or order is sent as a patch, not a picture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof setRarity === 'function' && typeof commitShelfMove === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('PERSONAL PAGE, A REWEIGHT: the record keeps its path, and Save to cloud patches the row instead of uploading',
    async ({ page }) => {
      await arm(page, {});
      await act(page, 'rarity');
      const before = await summary(page);
      expect(before[0].synced, 'unsent').toBe(false);
      expect(before[0].hasPath, 'but the picture is still where the path says').toBe(true);
      const r = await save(page);
      expect(r.uploads, 'no picture uploaded').toBe(0);
      expect(r.patches.map(p => p.id + ':' + p.rarity + ':' + p.shelf_order)).toEqual(['row-1:3:10']);
      expect(r.said).toContain('1 updated without re-uploading the picture');
      const after = await summary(page);
      expect(after[0].synced, 'and it is synced again').toBe(true);
      expect(after[0].rowAt, 'on the version the patch made').toBe('2026-04-04T00:00:00Z');
      expect(after[0].rowId).toBe('row-1');
    });

  test('PERSONAL PAGE, A REORDER: nothing is uploaded, the rows are patched', async ({ page }) => {
    await arm(page, { extra: true });
    await act(page, 'reorder');
    const r = await save(page);
    expect(r.uploads).toBe(0);
    expect(r.patches.length, 'at least the moved row').toBeGreaterThan(0);
    const hat = r.patches.find(p => p.id === 'row-9');
    expect(typeof (hat && hat.shelf_order), 'with its new order').toBe('number');
    const after = await summary(page);
    for (const x of after) expect(x.synced, x.id + ' synced after the save').toBe(true);
  });

  test('the control, one field over: a status change moves the identity, and the record takes the upload',
    async ({ page }) => {
      await arm(page, {});
      await act(page, 'status');
      const before = await summary(page);
      expect(before[0].id).toBe('t_cap_skins_stfp');
      expect(before[0].hasPath, 'the path named the old object, so it went').toBe(false);
      const r = await save(page);
      expect(r.uploads, 'the picture is uploaded under its new name').toBe(1);
      expect(r.patches, 'and nothing is patched').toEqual([]);
      const after = await summary(page);
      expect(after[0].synced).toBe(true);
      expect(after[0].rowId, 'on the row the upload made').toBe('row-2');
    });

  test('a row that is gone on the server: the patch matches nothing and the upload happens as it would have',
    async ({ page }) => {
      await arm(page, { patchGone: true });
      await act(page, 'rarity');
      const r = await save(page);
      expect(r.patches.length, 'the patch was tried').toBe(1);
      expect(r.uploads, 'and the picture went up').toBe(1);
      expect(r.said).not.toContain('without re-uploading');
      const after = await summary(page);
      expect(after[0].synced).toBe(true);
      expect(after[0].rowId).toBe('row-2');
    });

  test('IN A GROUP, a reweight whose live patch failed is finished by Save to cloud the cheap way',
    async ({ page }) => {
      await arm(page, { group: true, failFirstPatch: true });
      await act(page, 'rarity');
      const before = await summary(page);
      expect(before[0].synced, 'the live patch failed, so unsent').toBe(false);
      expect(before[0].hasPath).toBe(true);
      const r = await save(page);
      expect(r.uploads).toBe(0);
      expect(r.patches.length, 'the failed live patch and the save\'s').toBe(2);
      expect((await summary(page))[0].synced).toBe(true);
    });

  test('AND A PICTURE THAT COULD NOT BE UPLOADED, with a path an older pull left on it, is still uploaded - never patched',
    async ({ page }) => {
      /* The record stillnotsent.spec.js holds, and the one the first draft of
         this change would have patched: unsent, a row, a path that describes
         it, and no word about what changed. Nothing here can tell that its
         picture differs from the server's, so the only honest send is the
         picture. */
      await arm(page, { unsentArt: true });
      const before = await summary(page);
      expect(before[0].synced).toBe(false);
      expect(before[0].hasPath).toBe(true);
      const r = await save(page);
      expect(r.patches, 'nothing patched').toEqual([]);
      expect(r.uploads, 'the picture went up').toBe(1);
      expect((await summary(page))[0].synced).toBe(true);
    });
});
