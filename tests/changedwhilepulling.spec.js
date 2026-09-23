/* A PULL WRITES NOTHING OVER A RECORD THAT CHANGED WHILE IT RAN.

   cloudPull plans from one snapshot of the store and one of the server's
   rows, then writes hundreds of awaits later; it runs on every page load,
   quietly, while the person is already working. groupCatchUp then read the
   store again and deleted every synced record whose row was not in the
   server snapshot.

   MEASURED BEFORE THE FIX, through the real setTraitStatus, cloudSyncOne,
   groupCatchUp and cloudPull against a stubbed server whose rows request
   takes 800ms: a trait added to the final project while the catch-up was
   loading. The move landed on the server. Then the catch-up finished, wrote
   the old record back from its snapshot, and deleted the new one with "1
   removed by someone else". The first test is that measurement, and it
   went red exactly so. The second is a weight changed in the same window,
   reverted by the repair. The fifth is a teammate's newer picture arriving
   for a record the person moved while it downloaded, which resurrected the
   old record beside the new one.

   The sixth is a weight changed between two of the repair writes
   themselves, with the store made slow: the plan-time check has already
   passed by then, and only the write-time check stops the repair.

   The third and fourth are the controls: a teammate's in-place change still
   arrives when nothing changed here, and a row the server really lost is
   still removed here - so the guard keys on a change during the pull and
   on nothing wider. */
import { test, expect } from '@playwright/test';

/* A group holding one approved skin from server row "row-1" (and, with
   o.extra, a second synced trait on "row-9"), a stub server holding o.rows,
   one request made slow, and something the person does while it is slow. */
const run = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
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
    path: 'team7/c1/trait-cap-skins-approved.png', synced: true });
  if (o.extra) await dbPut({ id: 't_hat_hats_approved', kind: 'trait', name: 'hat', layer: 'hats',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: 11,
    rowId: 'row-9', rowAt: '2026-01-01T00:00:00Z',
    path: 'team7/c1/trait-hat-hats-approved.png', synced: true });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const rows = o.rows;
  const said = [];
  const realToast = window.toast; window.toast = (m) => { said.push(m); };
  let slowOnce = true;
  const delay = async (which) => {
    if (o.slow === which && slowOnce) { slowOnce = false; await new Promise(r => setTimeout(r, 800)); }
  };
  window.__realFetch = window.fetch;
  window.fetch = async (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins', 'hats'] }]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') return json({ Key: 'ok' });
    /* The bucket, listed. A row that is really gone took its picture with it
       (every removal deletes the files of the rows it removed), and since
       patch532 the catch-up asks: a listing it cannot read decides nothing. */
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) return json([]);
    if (s.indexOf('/storage/') >= 0) {
      await delay('storage');
      return new Response(new Blob([new Uint8Array([9, 9, 9])]));
    }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      await delay('rows');
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = rows.slice(off, off + lim);
      return json(batch, { 'Content-Range': off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + rows.length });
    }
    /* A weight PATCH names a row that exists here, so it answers with it -
       an empty answer means the row is gone, which since patch548 is read
       as not delivered. */
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      const id = decodeURIComponent((s.match(/id=eq\.([^&]+)/) || [])[1] || '');
      return json(rows.some(r => r.id === id) ? [{ id }] : []);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([{ id: 'row-1', path: 'x' }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row-2', updated_at: '2026-03-03T00:00:00Z' }]);
    return json([]);
  };
  /* With o.slowPut, every store write takes that long - the shape of a
     three-hundred-trait project, where the repairs alone are hundreds of
     writes and the person can act between two of them. */
  const realPut = dbPut;
  if (o.slowPut) window.dbPut = async (rec) => { const p = realPut(rec); await new Promise(r => setTimeout(r, o.slowPut)); return p; };
  const catchUp = groupCatchUp();
  let moved = null;
  if (o.during) {
    await new Promise(r => setTimeout(r, o.after || 250));
    const t = (await dbAll()).find(i => i.name === (o.which || 'cap'));
    if (o.during === 'status') moved = !!(await setTraitStatus(t, 'stfp')).shared;
    if (o.during === 'rarity') moved = await setRarity(t, 3);
  }
  await catchUp;
  window.dbPut = realPut;
  window.toast = realToast;
  const recs = (await dbAll()).filter(i => i.kind === 'trait')
    .map(x => ({ id: x.id, layer: x.layer, rarity: x.rarity, order: x.shelfOrder, synced: !!x.synced, rowId: x.rowId }));
  return { moved, recs, said, note: document.getElementById('cloudnote').textContent };
}, o);

const ROW1 = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
  path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1, shelf_order: 10,
  updated_at: '2026-01-01T00:00:00Z' };
const ROW9 = { id: 'row-9', kind: 'trait', name: 'hat', layer: 'hats', status: 'approved',
  path: 'team7/c1/trait-hat-hats-approved.png', w: 16, h: 16, rarity: 1, shelf_order: 11,
  updated_at: '2026-01-01T00:00:00Z' };

test.describe('a pull writes nothing over a record that changed while it ran', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function' && typeof groupCatchUp === 'function' && typeof setRarity === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('THE CASE: a trait added to the final project while the catch-up loads is still there when it finishes',
    async ({ page }) => {
      const r = await run(page, { rows: [ROW1], slow: 'rows', during: 'status' });
      expect(r.moved, 'the move landed on the server').toBe(true);
      expect(r.recs.map(x => x.id + ':' + x.rowId), 'one record, the new one, on its new row').toEqual(['t_cap_skins_stfp:row-2']);
      expect(r.said.join(' | '), 'and nobody is told it was removed').not.toContain('removed by someone else');
    });

  test('a weight changed in the same window is not put back by the repair', async ({ page }) => {
    const r = await run(page, { rows: [ROW1], slow: 'rows', during: 'rarity' });
    expect(r.moved).toBe(true);
    expect(r.recs.map(x => x.id + ':' + x.rarity)).toEqual(['t_cap_skins_approved:3']);
    expect(r.note).toContain('1 changed here while loading, kept as changed');
  });

  test('the control: with nothing changed here, a teammate\'s in-place move still arrives', async ({ page }) => {
    const r = await run(page, { rows: [Object.assign({}, ROW1, { layer: 'hats', shelf_order: 3, updated_at: '2026-02-02T00:00:00Z' })], slow: 'rows' });
    expect(r.recs.map(x => x.id + ':' + x.layer + ':' + x.order)).toEqual(['t_cap_hats_approved:hats:3']);
    expect(r.note).not.toContain('changed here while loading');
  });

  test('and the other control: a row the server really lost is still removed here', async ({ page }) => {
    const r = await run(page, { rows: [ROW1], slow: 'rows', extra: true });
    expect(r.recs.map(x => x.id)).toEqual(['t_cap_skins_approved']);
    expect(r.said.join(' | ')).toContain('1 removed by someone else');
  });

  test('A TEAMMATE\'S NEWER PICTURE arriving for a record the person moved while it downloaded does not bring the old record back',
    async ({ page }) => {
      /* The download branch: a teammate's save is a NEW row (a save deletes
         the row and inserts one) with the same name, layer and status and a
         newer stamp, and this device's copy is synced, so the pull fetches
         the picture over it. The person moves the trait while the picture
         is on its way. A first draft of this test kept the row id, which
         goes through the repair and downloads nothing. */
      const r = await run(page, { rows: [Object.assign({}, ROW1, { id: 'row-5', updated_at: '2026-02-02T00:00:00Z' })], slow: 'storage', during: 'status' });
      expect(r.moved).toBe(true);
      expect(r.recs.map(x => x.id + ':' + x.rowId), 'the new record alone; the download did not resurrect the old id')
        .toEqual(['t_cap_skins_stfp:row-2']);
      expect(r.note).toContain('1 changed here while loading, kept as changed');
    });

  test('AND A CHANGE MADE BETWEEN TWO OF THE REPAIRS THEMSELVES is not put back either',
    async ({ page }) => {
      /* Between the plan and each write, on a real project, are hundreds of
         store writes - here made slow. The server has changed both rows in
         place (a repair with nothing to write is skipped since patch527, so
         a first repair that writes needs a change to write): cap's weight,
         and hat's order. The person changes hat's weight while cap's repair
         is being written, so hat's repair meets the write-time check and
         nothing else. Without that check the repair writes the server's
         order together with the snapshot's weight over the new one. */
      const r = await run(page, { rows: [Object.assign({}, ROW1, { rarity: 2, updated_at: '2026-02-02T00:00:00Z' }),
        Object.assign({}, ROW9, { shelf_order: 5, updated_at: '2026-02-02T00:00:00Z' })],
        extra: true, slowPut: 300, after: 100, during: 'rarity', which: 'hat' });
      expect(r.moved).toBe(true);
      expect(r.recs.map(x => x.id + ':' + x.rarity + ':' + x.order), 'cap took the server\'s weight; hat kept its own and its old order')
        .toEqual(['t_cap_skins_approved:2:10', 't_hat_hats_approved:3:11']);
      expect(r.note).toContain('1 changed here while loading, kept as changed');
    });
});
