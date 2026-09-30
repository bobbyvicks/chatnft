/* FOLLOW-UP A (patch608), S20: THIS DEVICE'S OWN SEND IS NOT SOMEBODY ELSE'S
   CHANGE.

   A pull tells a teammate's change from this device's by the row's
   updated_at, which the server moves on every write: newer than the
   version the record last saw (rowAt) is somebody else's. A record with
   unsent work keeps rowAt where it was - its unsent work is based on that
   version - so a send of this device's own that lands while the record
   still holds unsent work moved the row past rowAt, and the next pull read
   the device's own send as a teammate's change made underneath unsent work:
   "1 you have unsaved changes to, kept", and a clash in the mail. Measured
   on 91eb861 (fa-work/probe.cjs), both ways the plan reasoned:
   - a folder import in a group whose carried weight could not be sent
     (carryDecided's PATCH failed): s0StandsIn's replaces PATCH then landed;
   - a weight or order sent on its own (cloudPatchOne) while the person
     edited the trait: the edit stays unsent, and the PATCH landed.
   Now each records the version its own send produced, as s0Sent = {row,
   at}, and the pull's clash tests take a row carrying exactly that as this
   device's own. rowAt keeps its meaning: a teammate's later change still
   counts (the controls).

   And the same false word on the synced path, measured on 91eb861 beside
   them (not in the plan's list): a weight the group took, set live in a
   group (setRarity, setRarityMany), left rowAt at the version before the
   PATCH, so the next pull said "1 changed in place by the group" and wrote
   the record again. The write back now takes the answered row's
   updated_at as rowAt, as cloudPatchOne's does.

   One tab; THE SERVER HERE is a stateful route in node (t11r3's, ported),
   moving updated_at on every write as the touch trigger does. Names, ids,
   uids and tokens are made up. */
import { test, expect } from '@playwright/test';

const ROW0 = '00000000-0000-4000-8000-0000000000e1';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGM4wcX1nxLMMGrAqAGjBgwXAwDCDNsQBGseLgAAAABJRU5ErkJggg==', 'base64');

/* ---- the server ----------------------------------------------------------- */
function newServer() {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 8, 29, 12, 0, 0) + (++clock) * 1000).toISOString();
  const S = { rows: new Map(), files: new Set(), newN: 0, now, layers: ['hats', 'hair', 'skins', 'unsorted'] };
  S.addRow = (r) => {
    const row = Object.assign({ kind: 'trait', rarity: 1, shelf_order: null, w: 16, h: 16, collection_id: 'c1', updated_at: '2026-01-01T00:00:00+00:00' }, r);
    S.rows.set(row.id, row); if (row.path) S.files.add(row.path); return row;
  };
  return S;
}
/* st.rules: [{kind, tab, match(e, body), hold, fail, once}] - the first rule
   that fits a request holds it (until st.release[name]()) and/or fails it
   ('network' aborts, a number answers that status). kind: patch, post,
   delete, upload, rpc. tab: 'A' or 'B', the page that asked. */
function router(st) {
  const S = st.server;
  const gate = async (kind, e, body) => {
    for (const r of st.rules) {
      if (r.done || r.kind !== kind || (r.tab && r.tab !== e.tab) || (r.match && !r.match(e, body))) continue;
      if (r.once !== false) r.done = true;
      e.rule = r.name || kind;
      if (r.hold) { st.held[r.name] = true; await new Promise(res => { st.release[r.name] = res; }); }
      return r.fail || null;
    }
    return null;
  };
  return async (route) => {
    const req = route.request(), u = req.url(), m = req.method(), p = u.replace(/^https?:\/\/[^/]+/, '');
    const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    let tab = '?'; try { tab = st.tabs.get(req.frame().page()) || '?'; } catch (_) {}
    const e = { tab, m, path: decodeURIComponent(p) };
    if (m !== 'GET' && req.postData()) e.body = String(req.postData()).slice(0, 400);
    st.log.push(e);
    const json = (x, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(x) });
    const failed = (f) => (f === 'network' ? route.abort('failed') : json({ message: 'down' }, f));
    const qp = (k) => { const mm = u.match(new RegExp('[?&]' + k + '=([^&]+)')); return mm ? decodeURIComponent(mm[1]) : null; };
    if (u.indexOf('select=id,protocol,switching_at') >= 0) return json([{ id: 'c1', protocol: 1, switching_at: null }]);
    if (u.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (u.indexOf('/rest/v1/rpc/my_team') >= 0) return json('me');
    if (u.indexOf('/rest/v1/rpc/team_member_names') >= 0) return json([]);
    if (u.indexOf('/rest/v1/rpc/reorder_traits') >= 0) {
      const b = JSON.parse(req.postData() || '{}');
      const f = await gate('rpc', e, b); if (f) return failed(f);
      for (const x of (b.p_items || [])) { const r = S.rows.get(x.id); if (!r) continue; if (x.layer) r.layer = x.layer; if (x.shelf_order !== undefined) r.shelf_order = x.shelf_order; r.updated_at = S.now(); }
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    }
    if (u.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }]);
    if (u.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', team_id: 'team7', layers: S.layers, rules: [], decisions: [], decide_order: [], empty_chance: null, rules_at: null, protocol: 1, switching_at: null, updated_at: '2026-09-28T00:00:00Z' }]);
    if (u.indexOf('/storage/v1/object/list/') >= 0) {
      const b = JSON.parse(req.postData() || '{}'); const pre = (b.prefix || '') + '/';
      const names = [...S.files].filter(f => f.indexOf(pre) === 0).map(f => f.slice(pre.length)).sort();
      return json(names.slice(b.offset || 0, (b.offset || 0) + (b.limit || 100)).map(name => ({ name })));
    }
    if (u.indexOf('/storage/v1/object/') >= 0) {
      if (m === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PX });
      if (m === 'DELETE') { try { const b = JSON.parse(req.postData()); for (const x of (b.prefixes || [])) S.files.delete(x); } catch (_) {} return json([]); }
      const f = await gate('upload', e, null); if (f) return failed(f);
      const pth = decodeURIComponent(p.replace(/^\/storage\/v1\/object\/traits\//, '').split('?')[0]);
      S.files.add(pth); return json({ Key: 'traits/' + pth });
    }
    if (u.indexOf('/rest/v1/traits') >= 0) {
      const one = qp('id'), coll = qp('collection_id');
      const sel = (r) => {
        if (one) { const v = one.replace(/^eq\./, ''); if (one.indexOf('in.(') === 0) return one.slice(4, -1).split(',').indexOf(r.id) >= 0; return r.id === v; }
        if (coll && r.collection_id !== coll.replace(/^eq\./, '')) return false;
        for (const k of ['kind', 'name', 'layer', 'status']) { const v = qp(k); if (v && r[k] !== v.replace(/^eq\./, '')) return false; }
        return !!coll;
      };
      if (m === 'GET') {
        const all = [...S.rows.values()].filter(sel).sort((a, b) => a.id < b.id ? -1 : 1);
        const off = +(qp('offset') || 0), lim = +(qp('limit') || 1000);
        return json(all.slice(off, off + lim));
      }
      if (m === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}');
        const f = await gate('patch', e, b); if (f) return failed(f);
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) { Object.assign(r, b); r.updated_at = S.now(); }
        return json(hit.map(r => Object.assign({}, r)));
      }
      if (m === 'DELETE') {
        const f = await gate('delete', e, null); if (f) return failed(f);
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) S.rows.delete(r.id);
        return json(hit.map(r => ({ id: r.id, path: r.path })));
      }
      if (m === 'POST') {
        const x = JSON.parse(req.postData())[0];
        const f = await gate('post', e, x); if (f) return failed(f);
        const clash = [...S.rows.values()].find(r => r.collection_id === x.collection_id && r.kind === x.kind && r.name === x.name && r.layer === x.layer && r.status === x.status);
        if (clash) return json({ code: '23505', details: null, hint: null, message: 'duplicate key value violates unique constraint "traits_identity"' }, 409);
        return json([S.addRow(Object.assign({}, x, { id: 'row-new-' + (++S.newN), updated_at: S.now() }))], 201);
      }
    }
    st.unknown.push(tab + ' ' + m + ' ' + p.slice(0, 160));
    return json({ code: 'UNROUTED' }, 501);
  };
}
async function serve(context) {
  const st = { server: newServer(), log: [], unknown: [], rules: [], held: {}, release: {}, tabs: new Map() };
  await context.route(/supabase\.co/, router(st));
  return st;
}
const until = async (f, what) => { for (let i = 0; i < 500; i++) { if (await f()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('never: ' + what); };

/* ---- the tabs ------------------------------------------------------------- */
const arm = (page) => page.evaluate(() => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  try { sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1'); } catch (_) {}
  s0SeenUid = null; groupCaughtUp = true;
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
  LAYERS = ['hats', 'hair', 'skins', 'unsorted'];
  window.__toasts = []; const tt = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { tt(m); } catch (_) {} };
});
/* The other tab opens signed out, so its start asks nothing (the stored
   session is shared); it is armed once it is up (stage0stamps' two tabs). */
async function secondTab(page, context, st) {
  const B = await context.newPage();
  st.tabs.set(B, 'B');
  const session = await page.evaluate(() => { const s = localStorage.getItem('chatnft.session'); localStorage.removeItem('chatnft.session'); return s; });
  await B.goto('/index.html');
  await B.waitForFunction(() => typeof cloudPull === 'function' && typeof setTraitStatus === 'function' && typeof setRarity === 'function');
  await page.evaluate((s) => localStorage.setItem('chatnft.session', s), session);
  await arm(B);
  return B;
}
const seed = (page, recs) => page.evaluate(async (recs) => {
  activeWs = 'team7'; dbp = null; dbpName = null;
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite'), s = t.objectStore('items');
    for (const r of recs) s.put(Object.assign({ blob: new Blob([new Uint8Array(16)], { type: 'image/png' }) }, r));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}, recs);
const traits = (page) => page.evaluate(async () => {
  activeWs = 'team7'; dbp = null; dbpName = null;
  return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' ' + i.layer + ' ' + i.status + ' ' + i.rarity
    + (i.synced ? ' synced' : ' unsent') + (i.s0Replaces ? ' replaces=' + i.s0Replaces : '') + ']').sort();
});
const CAP = { id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1,
  synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'pull' };

let st = null;
test.beforeEach(async ({ page, context }) => {
  st = await serve(context);
  st.tabs.set(page, 'A');
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof cloudPull === 'function' && typeof s0SameAsPlanned === 'function');
  await arm(page);
  await page.evaluate(async () => { await dbClear(); });
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); }).catch(() => {});
  expect(st.unknown, 'every request had a named answer').toEqual([]);
});


const pull = (page) => page.evaluate(async () => {
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  s0State = Object.assign({}, s0State, { at: 0 });
  window.__writes = 0;
  const put = dbPut; dbPut = (r, ...a) => { if (r && String(r.id).indexOf('t_') === 0) window.__writes++; return put(r, ...a); };
  try { await cloudPull({ quiet: true }); } finally { dbPut = put; }
  activeWs = 'team7'; dbp = null; dbpName = null;
  const mail = await dbGet('settings.mail');
  return { note: $('cloudnote').textContent, writes: window.__writes,
    clashes: mail && Array.isArray(mail.mail) ? mail.mail.filter(m => m.kind === 'clash').map(m => m.name) : [] };
});
/* A group folder import that moves cap.png from wip to approved: the new
   row is made, the old trait's weight (7) carried onto it and PATCHed, the
   new row told which row it replaces (PATCH), and the old row dropped. */
const importMoved = (page) => page.evaluate(async (ROW0) => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(2, 2, 12, 12);
  const bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
  await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, rarity: 7, at: 1, synced: true,
    rowId: ROW0, rowAt: '2026-01-02T00:00:00+00:00', path: 'team7/c1/trait-cap-hats-wip.png', blob: new Blob([bytes], { type: 'image/png' }) }, 'pull');
  const rc = window.confirm; window.confirm = () => true;
  try { await bulkImport([fileWithPath(bytes, 'col/hats/approved/cap.png')]); } finally { window.confirm = rc; }
}, ROW0);
const sentBodies = () => st.log.filter(e => e.m === 'PATCH' && e.path.indexOf('/rest/v1/traits') === 0).map(e => (e.rule ? e.rule + ' ' : '') + e.body);

test.describe('follow-up A: this device\'s own send is not somebody else\'s change', () => {
  test.beforeEach(async ({ page }) => {
    st.server.layers = ['hats', 'unsorted'];
    await page.evaluate(() => { LAYERS = ['hats', 'unsorted']; });
  });

  test('S20: a group folder import whose carried weight could not be sent, then told which row it replaces: the next pull calls nothing a clash', async ({ page }) => {
    st.server.addRow({ id: ROW0, name: 'cap', layer: 'hats', status: 'wip', rarity: 7, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
    st.rules.push({ kind: 'patch', match: (e, b) => 'rarity' in b, fail: 503, once: false });
    await importMoved(page);
    expect(await traits(page), 'the carried weight is unsent (precondition)').toEqual(['t_cap_hats_approved[row-new-1 hats approved 7 unsent]']);
    expect(sentBodies(), 'the weight was refused and the pairing landed (precondition)').toEqual(['patch {"rarity":7,"shelf_order":0}', '{"replaces":"' + ROW0 + '"}']);
    const r = await pull(page);
    expect(r.note).not.toContain('you have unsaved changes');
    expect(r.clashes).toEqual([]);
    expect(await traits(page), 'and the unsent weight is kept').toEqual(['t_cap_hats_approved[row-new-1 hats approved 7 unsent]']);
  });

  test('S20, the control: the same, then a teammate changes the row: the next pull still calls that a clash', async ({ page }) => {
    st.server.addRow({ id: ROW0, name: 'cap', layer: 'hats', status: 'wip', rarity: 7, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
    st.rules.push({ kind: 'patch', match: (e, b) => 'rarity' in b, fail: 503, once: false });
    await importMoved(page);
    const row = st.server.rows.get('row-new-1');
    row.rarity = 2; row.updated_at = st.server.now();   /* a teammate's reweight, after this device's own PATCH */
    const r = await pull(page);
    expect(r.note).toContain('1 you have unsaved changes to, kept');
    expect(r.clashes).toEqual(['cap']);
    expect(await traits(page)).toEqual(['t_cap_hats_approved[row-new-1 hats approved 7 unsent]']);
  });

  test('S20, the control: the import\'s carried weight sent as well: nothing to call a clash, as before', async ({ page }) => {
    st.server.addRow({ id: ROW0, name: 'cap', layer: 'hats', status: 'wip', rarity: 7, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
    await importMoved(page);
    expect(await traits(page)).toEqual(['t_cap_hats_approved[row-new-1 hats approved 7 synced]']);
    const r = await pull(page);
    expect([r.note.indexOf('you have unsaved changes') < 0, r.note.indexOf('changed in place') < 0, r.clashes, r.writes]).toEqual([true, true, [], 0]);
  });

  test('S20: a weight sent on its own (cloudPatchOne) while the person edits the trait: the next pull does not call the landed send a clash', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
    await seed(page, [Object.assign({}, CAP, { rarity: 5, synced: false, unsent: 'meta', rowAt: '2026-01-02T00:00:00+00:00', wk: 'person' })]);
    st.rules.push({ kind: 'patch', hold: true, name: 'p' });
    await page.evaluate(async () => { window.__p = cloudPatchOne(await dbGet('t_cap_hats_wip')); });
    await until(() => st.held.p, 'the PATCH to be out');
    /* The person's edit, while the PATCH is out. */
    await page.evaluate(async () => { const r = await dbGet('t_cap_hats_wip'); await dbPut(Object.assign({}, r, { rarity: 6 })); });
    st.release.p();
    expect(await page.evaluate(() => window.__p), 'the group took the PATCH (precondition)').toBe(true);
    expect(await traits(page), 'the edit is unsent (precondition)').toEqual(['t_cap_hats_wip[row-1 hats wip 6 unsent]']);
    const r = await pull(page);
    expect(r.note).not.toContain('you have unsaved changes');
    expect(r.clashes).toEqual([]);
    expect(await traits(page)).toEqual(['t_cap_hats_wip[row-1 hats wip 6 unsent]']);
  });

  /* ---- beside S20, found reproducing S3: s0StandsIn's own promise ---- */
  test('s0StandsIn on a dropped connection keeps the pairing, as it does when the server refuses', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
    await seed(page, [CAP]);
    st.rules.push({ kind: 'patch', fail: 'network', once: false });
    const told = await page.evaluate(async (ROW0) => s0StandsIn({ rowId: ROW0 }, 't_cap_hats_wip'), ROW0);
    expect({ told, store: await traits(page) }).toEqual({ told: false, store: ['t_cap_hats_wip[row-1 hats wip 1 synced replaces=' + ROW0 + ']'] });
  });

  test('the control: s0StandsIn refused by the server keeps the pairing', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
    await seed(page, [CAP]);
    st.rules.push({ kind: 'patch', fail: 503, once: false });
    const told = await page.evaluate(async (ROW0) => s0StandsIn({ rowId: ROW0 }, 't_cap_hats_wip'), ROW0);
    expect({ told, store: await traits(page) }).toEqual({ told: false, store: ['t_cap_hats_wip[row-1 hats wip 1 synced replaces=' + ROW0 + ']'] });
  });

  /* ---- beyond the plan's list: the synced path's false word ---- */
  test('a weight set in a group and taken by the group: the next pull does not say the group changed it, and writes nothing', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
    await seed(page, [CAP]);
    expect(await page.evaluate(async () => setRarity(await dbGet('t_cap_hats_wip'), 5))).toBe(true);
    const r = await pull(page);
    expect([r.note.indexOf('changed in place') < 0 ? 'not said' : r.note, r.writes]).toEqual(['not said', 0]);
    expect(await traits(page)).toEqual(['t_cap_hats_wip[row-1 hats wip 5 synced]']);
  });

  test('weights set on many traits in a group and taken by the group: the next pull does not say the group changed them, and writes nothing', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
    await seed(page, [CAP]);
    expect(await page.evaluate(async () => setRarityMany([await dbGet('t_cap_hats_wip')], 5))).toBe(1);
    const r = await pull(page);
    expect([r.note.indexOf('changed in place') < 0 ? 'not said' : r.note, r.writes]).toEqual(['not said', 0]);
    expect(await traits(page)).toEqual(['t_cap_hats_wip[row-1 hats wip 5 synced]']);
  });

  test('the control: a weight set in a group, then a teammate reweights it: the next pull still says so and takes theirs', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
    await seed(page, [CAP]);
    expect(await page.evaluate(async () => setRarity(await dbGet('t_cap_hats_wip'), 5))).toBe(true);
    const row = st.server.rows.get('row-1'); row.rarity = 9; row.updated_at = st.server.now();
    const r = await pull(page);
    expect([r.note.indexOf('1 changed in place by the group') >= 0, r.writes]).toEqual([true, 1]);
    expect(await traits(page)).toEqual(['t_cap_hats_wip[row-1 hats wip 9 synced]']);
  });
});
