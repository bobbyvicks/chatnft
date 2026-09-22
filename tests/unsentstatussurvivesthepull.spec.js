/* A STATUS CHANGE THAT COULD NOT BE SENT SURVIVES THE NEXT OPEN.

   Reported: "i refreshed and it didnt actually save it" - a skin added to the
   final project was back out of it after a reload.

   Adding to the final project moves the trait to a new record and uploads
   it as a new row; if that upload fails the record is marked synced:false
   and keeps the rowId of the row it came from, because that is still the
   row a later Save to cloud has to replace. The page load that follows runs
   a quiet pull, and the pull matches the server's old row to that record by
   rowId and hands it to mergeRemoteShelfRecord - which takes the row's layer
   and status. So the stfp record was deleted and an approved one written in
   its place, and nothing said so. The pull's own rule in the other branch is
   "Taking theirs would destroy work this device never sent, which is the one
   thing pulling must not do"; the row-id branch never asked whether the
   record had unsent work.

   A row with this id can only differ from the record on the server's side
   through an in-place change (a rarity PATCH, a shelf move): a saved edit
   always makes a new row. So: a record with unsent work is left alone on a
   row-id match. If the row is newer than the version this device last saw,
   somebody changed it in place underneath the unsent work, and that is a
   clash - kept, and named, the way the other branch names its clashes.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with the
   record back to approved, and the third with the record back to approved
   and nothing in the note. The second and fourth are the controls: an upload
   that landed, and a record with nothing unsent, which still takes the
   server's word - so the keep is keyed on unsent work and on nothing wider.

   Everything drives the real setTraitStatus, cloudSyncOne, groupCatchUp and
   cloudPull against a stubbed fetch, the way stillnotsent.spec.js does. */
import { test, expect } from '@playwright/test';

/* A group project holding one approved skin that came from server row
   "row-1", and a stub server. uploadStatus is what the storage upload
   answers; the row insert always works and answers with row-2. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut(Object.assign({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000,
    rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z',
    path: 'team7/c1/trait-cap-skins-approved.png', synced: true }, o.record || {}));
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__server = {
    rows: [{ id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
      path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1,
      updated_at: '2026-01-01T00:00:00Z' }],
    uploadStatus: o.uploadStatus || 200, posts: [], deletes: [],
  };
  window.__realFetch = window.fetch;
  window.fetch = (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET', sv = window.__server;
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team7'));
    if (s.indexOf('/rest/v1/teams') >= 0)
      return Promise.resolve(json([{ id: 'team7', name: 'Seven', personal: false }]));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST')
      return Promise.resolve(sv.uploadStatus === 200 ? json({ Key: 'ok' })
        : new Response('down', { status: sv.uploadStatus }));
    if (s.indexOf('/storage/') >= 0)
      return Promise.resolve(new Response(new Blob([new Uint8Array([9, 9, 9])])));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + sv.rows.length }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      /* offset honoured, as groupcatchup.spec.js warns: the pull pages until
         the server answers empty, and a stub that always answers the row
         hands it five hundred copies renamed cap-2 .. cap-500. */
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = sv.rows.slice(off, off + lim);
      return Promise.resolve(json(batch, { 'Content-Range':
        off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + sv.rows.length }));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') { sv.deletes.push(s); return Promise.resolve(json([])); }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      sv.posts.push(JSON.parse(opt.body)[0]);
      return Promise.resolve(json([{ id: 'row-2', updated_at: '2026-03-03T00:00:00Z' }]));
    }
    return Promise.resolve(json([]));
  };
}, o);

/* The press: cap goes into the final project. */
const add = (page) => page.evaluate(async () => {
  const t = (await dbAll()).find(i => i.name === 'cap');
  const r = await setTraitStatus(t, 'stfp');
  const recs = await (async () => (await dbAll()).filter(i => i.kind === 'trait')
    .map(x => ({ id: x.id, status: x.status, rarity: x.rarity, synced: !!x.synced,
      rowId: x.rowId || null, rowAt: x.rowAt || null })))();
  return { ok: r.ok, shared: !!r.shared, why: r.why && r.why.reason, posts: window.__server.posts.length, recs };
});

/* The reload: the quiet pull a page load runs, with the server holding
   `rows` (or still holding what it had). */
const reopen = (page, rows) => page.evaluate(async (rows) => {
  if (rows) window.__server.rows = rows;
  await groupCatchUp();
  const recs = (await dbAll()).filter(i => i.kind === 'trait')
    .map(x => ({ id: x.id, status: x.status, rarity: x.rarity, synced: !!x.synced,
      rowId: x.rowId || null, rowAt: x.rowAt || null }));
  return { recs, note: document.getElementById('cloudnote').textContent };
}, rows || null);

test.describe('a status change that could not be sent survives the next open', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function' && typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('THE CASE: the upload fails, the page is reopened, and the trait is still in the final project',
    async ({ page }) => {
      await arm(page, { uploadStatus: 503 });
      const a = await add(page);
      expect(a.ok).toBe(true);
      expect(a.shared, 'the upload did not land').toBe(false);
      expect(a.why).toBe('unreachable');
      expect(a.recs, 'so the record says so, and keeps the row it came from').toEqual([
        { id: 't_cap_skins_stfp', status: 'stfp', rarity: 1, synced: false, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z' }]);
      const r = await reopen(page);
      expect(r.recs, 'after the reload it is still in the final project, once').toEqual([
        { id: 't_cap_skins_stfp', status: 'stfp', rarity: 1, synced: false, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z' }]);
      expect(r.note, 'and nothing changed underneath it, so nothing is called a clash').not.toContain('unsaved changes');
    });

  test('the control: an upload that landed records which row it made, and the reload finds it there',
    async ({ page }) => {
      await arm(page, { uploadStatus: 200 });
      const a = await add(page);
      expect(a.shared).toBe(true);
      expect(a.posts, 'one row inserted').toBe(1);
      expect(a.recs, 'the record is synced, on the new row, and knows which version of it').toEqual([
        { id: 't_cap_skins_stfp', status: 'stfp', rarity: 1, synced: true, rowId: 'row-2', rowAt: '2026-03-03T00:00:00Z' }]);
      const r = await reopen(page, [{ id: 'row-2', kind: 'trait', name: 'cap', layer: 'skins', status: 'stfp',
        path: 'team7/c1/trait-cap-skins-stfp.png', w: 16, h: 16, rarity: 1, updated_at: '2026-03-03T00:00:00Z' }]);
      expect(r.recs.map(x => x.id + ':' + x.status)).toEqual(['t_cap_skins_stfp:stfp']);
    });

  test('AND A ROW CHANGED IN PLACE underneath the unsent work is kept and named, not taken',
    async ({ page }) => {
      /* A teammate changed the rarity on the server while this device holds
         a status change it could not send. Neither side can be applied over
         the other quietly; the other branch of the pull already says what
         happens - kept, and counted in the note. */
      await arm(page, { uploadStatus: 503 });
      await add(page);
      const r = await reopen(page, [{ id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
        path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 3, updated_at: '2026-05-05T00:00:00Z' }]);
      expect(r.recs, 'still in the final project, still this device\'s rarity').toEqual([
        { id: 't_cap_skins_stfp', status: 'stfp', rarity: 1, synced: false, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z' }]);
      expect(r.note).toContain('1 you have unsaved changes to, kept');
    });

  test('and a record with nothing unsent still takes the server\'s word for its row',
    async ({ page }) => {
      /* The one-field control. The same record, on the same row, but synced:
         whatever the server says about that row is the truth. */
      await arm(page, { record: { id: 't_cap_skins_stfp', status: 'stfp', synced: true } });
      const r = await reopen(page);
      expect(r.recs.map(x => x.id + ':' + x.status + ':' + x.synced)).toEqual(['t_cap_skins_approved:approved:true']);
      expect(r.note).not.toContain('unsaved changes');
    });
});
