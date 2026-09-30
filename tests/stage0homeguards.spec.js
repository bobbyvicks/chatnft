/* Stage 0, Task 11 fix round 4: THE HOME GUARDS NO SPEC HELD (follow-up X4).

   Fix round 4 gave every action a home (s0HomeNow) and put a check after
   each wait before a write or a send (s0AtHome, s0SendHome). Each check was
   calibrated by removing it and running stage0moves and stage0gate
   (scratchpad t11/f4/calib-final13.txt): 76 survived, most of them because
   no spec held the wait they sit after. These hold it, for the checks at
   Clear, the imports, Remove from server, the sort, the layer list and the
   review pass: the n-th call of the function the check waits on is held
   (window.__gate, or the stand-in server's hold), the page moves to My page
   there, and then it is let go. Each test names its check by function and
   what it guards, and tools/mutate-homeguards.cjs removes each check in
   turn and runs this file.

   THE SERVER HERE KEEPS STATE, in node, behind a route on the context:
   stage0moves.spec.js's stand-in, copied (Ruling F-15), with rows, pictures
   and two collections (c1 for team7, cme for My page), and four more holds:
   'count' (a count=exact read of the rows, answered with Content-Range as
   PostgREST does), 'list' (the storage listing), 'filedel' (the storage
   DELETE) and 'patch' (a collection's PATCH); a hold may name its n-th
   request (nth), and team7 may have no project yet (noColl). The group
   role read answers owner. The names and ids are made up; no request
   leaves the page (the route answers every *.supabase.co request, and one
   it does not know is answered 501 and fails the test).

   ONE CHECK, ONE TEST. Where one wait is followed by two checks, each test
   asserts only what its own check stops, so removing the other check does
   not redden it: the mutation tool predicts exactly one red per check, and
   a red anywhere else is reported as a failed prediction.

   WHAT NO TEST HERE CAN HOLD: clearCloudNow's check after the protocol read
   that follows the confirm. Removing it lets the clear go on to
   relightUnsynced, whose own check stops before any write, and to the next
   check, which says the same words: the same clear, stopped at the same
   point (measured - the test for that wait passes without it). And
   clearCloudNow's check on the empty-server repair is reached only by a
   call with no press generation, as stage0gate's: on the press, moved()
   asks the same question first (its test calls it that way, and says so).
   Two tests below move no page: another account signing in during the row
   count is the only way to fail s0SendHome there while moved() - which asks
   wsGen alone - still passes, so that test changes s0SeenUid, as
   cloudRender does when it reads another account for the stored session. */
import { test, expect } from '@playwright/test';

/* ---- the server (stage0moves.spec.js's, copied) --------------------------- */
function newServer() {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 8, 28, 12, 0, 0) + (++clock) * 1000).toISOString();
  const S = {
    rows: new Map(), files: new Set(), newN: 0, now, made: [],
    colls: {
      c1: { team: 'team7', layers: ['hats', 'skins', 'unsorted'], rules: [], decisions: [] },
      cme: { team: 'me', layers: ['mine-a', 'mine-b', 'hats', 'skins'], rules: [['hats/mine', 'skins/cap']], decisions: [] },
    },
  };
  S.addRow = (r) => {
    const row = Object.assign({ kind: 'trait', rarity: 1, shelf_order: null, w: 16, h: 16, updated_at: '2026-01-01T00:00:00+00:00' }, r);
    S.rows.set(row.id, row); if (row.path) S.files.add(row.path); return row;
  };
  S.snap = () => [...S.rows.values()].map(r => r.id + '{' + r.collection_id + ' ' + r.name + '/' + r.layer + '/' + r.status + ' r' + r.rarity + '}').sort();
  return S;
}
const collOfTeam = (t) => t === 'me' ? 'cme' : 'c1';

/* st.hold: {kind, ...} - the first request of that kind waits for st.release(). */
function router(st) {
  const S = st.server;
  return async (route) => {
    const req = route.request(), u = req.url(), m = req.method(), p = u.replace(/^https?:\/\/[^/]+/, '');
    const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const e = { m, path: decodeURIComponent(p) };
    if (m !== 'GET' && req.postData()) e.body = String(req.postData()).slice(0, 400);
    st.log.push(e);
    const json = (x, status, headers) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: Object.assign({}, CORS, headers || {}), body: JSON.stringify(x) });
    const hold = async (kind, ok) => {
      const h = st.hold;
      if (!h || h.kind !== kind || h.done || !ok()) return false;
      if (h.after && !h.after()) return false;
      if (h.nth && (h.seen = (h.seen || 0) + 1) < h.nth) return false;
      h.done = true; e.held = true;
      await new Promise(r => { st.release = r; });
      return true;
    };
    const qp = (k) => { const mm = u.match(new RegExp('[?&]' + k + '=([^&]+)')); return mm ? decodeURIComponent(mm[1]) : null; };
    if (u.indexOf('select=id,protocol,switching_at') >= 0) {
      const team = decodeURIComponent((u.match(/team_id=eq\.([^&]+)/) || [])[1] || '?');
      st.reads.push(team);
      let proto = st.proto(team);
      if (await hold('read', () => team === (st.hold.team || 'team7'))) proto = st.hold.answer || 1;
      return json([{ id: collOfTeam(team), protocol: proto, switching_at: null }]);
    }
    if (u.indexOf('/auth/v1/user') >= 0) { await hold('auth', () => true); return json({ id: 'u1' }); }
    if (u.indexOf('/rest/v1/rpc/my_team') >= 0) { await hold('myteam', () => true); return json('me'); }
    if (u.indexOf('/rest/v1/rpc/team_member_names') >= 0) return json([]);
    if (u.indexOf('/rest/v1/rpc/reorder_traits') >= 0) {
      await hold('send', () => true);
      const b = JSON.parse(req.postData() || '{}');
      const ok = Array.isArray(b.p_items) && b.p_items.length && b.p_items.every(x => S.rows.has(x.id) && S.rows.get(x.id).collection_id === b.p_collection);
      e.rpc = b.p_collection;
      if (!ok) return json({ code: 'P0001', details: null, hint: null, message: 'trait outside project' }, 400);
      for (const x of b.p_items) { const r = S.rows.get(x.id); if (x.layer) r.layer = x.layer; if (x.shelf_order !== undefined) r.shelf_order = x.shelf_order; r.updated_at = S.now(); }
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    }
    if (u.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }]);
    /* The role read (Remove from server): u1 owns team7. */
    if (u.indexOf('/rest/v1/team_members?select=role&') >= 0) return json([{ role: 'owner' }]);
    if (u.indexOf('/rest/v1/team_members') >= 0) return json([]);
    if (u.indexOf('/rest/v1/collections') >= 0) {
      if (m === 'GET') {
        const byId = qp('id'), teamQ = (qp('team_id') || '').replace(/^eq\./, '');
        if (byId && u.indexOf('select=decisions') >= 0) await hold('answers', () => true);
        const id = byId ? byId.replace(/^eq\./, '') : collOfTeam(teamQ || 'team7');
        if (!byId) await hold('coll', () => (teamQ || 'team7') === (st.hold.team || 'team7'));
        /* st.noColl: team7 has no project on the server yet. */
        if (st.noColl && id === 'c1' && !S.colls.c1.made) return json([]);
        const c = S.colls[id];
        return json([{ id, team_id: c.team, layers: c.layers, rules: c.rules, decisions: c.decisions, decide_order: [], empty_chance: null, rules_at: null, protocol: 1, switching_at: null, updated_at: '2026-09-28T00:00:00Z' }]);
      }
      if (m === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        S.made.push(b);
        if (b.team_id === 'team7') S.colls.c1.made = true;
        return json([{ id: collOfTeam(b.team_id), team_id: b.team_id, layers: b.layers }], 201);
      }
      if (m === 'PATCH') {
        await hold('patch', () => true);
        const id = (qp('id') || '').replace(/^eq\./, '');
        try { const b = JSON.parse(req.postData()); if (S.colls[id]) { if (b.layers) S.colls[id].layers = b.layers; if (b.rules) S.colls[id].rules = b.rules; } } catch (_) {}
        return json([], 200);
      }
    }
    if (u.indexOf('/storage/v1/object/list/') >= 0) {
      await hold('list', () => true);
      const b = JSON.parse(req.postData() || '{}'); const pre = (b.prefix || '') + '/';
      const names = [...S.files].filter(f => f.indexOf(pre) === 0).map(f => f.slice(pre.length)).sort();
      return json(names.slice(b.offset || 0, (b.offset || 0) + (b.limit || 100)).map(name => ({ name })));
    }
    if (u.indexOf('/storage/v1/object/') >= 0) {
      if (m === 'GET') return route.fulfill({ status: 404, headers: CORS, body: '' });
      if (m === 'DELETE') {
        let gone = [];
        try { const b = JSON.parse(req.postData()); gone = b.prefixes || []; for (const x of gone) S.files.delete(x); } catch (_) {}
        await hold('filedel', () => true);
        return json(gone.map(name => ({ name })));
      }
      await hold('upload', () => true);
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
        /* A count (Remove from server's cloudRowCount): Prefer count=exact,
           answered in Content-Range as PostgREST does. */
        if (u.indexOf('/rest/v1/traits?select=id&') >= 0) {
          await hold('count', () => true);
          return json([], 200, { 'Content-Range': '0-0/' + all.length });
        }
        const off = +(qp('offset') || 0), lim = +(qp('limit') || 1000);
        return json(all.slice(off, off + lim));
      }
      if (m === 'PATCH') {
        await hold('send', () => true);
        if (st.refuseSend) return json({ code: '22000', details: null, hint: null, message: 'refused here' }, 400);
        const b = JSON.parse(req.postData() || '{}');
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) { Object.assign(r, b); r.updated_at = S.now(); }
        return json(hit.map(r => ({ id: r.id, updated_at: r.updated_at })));
      }
      if (m === 'DELETE') {
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) S.rows.delete(r.id);
        await hold('rowdel', () => !st.hold.id || one === 'eq.' + st.hold.id);
        return json(hit.map(r => ({ id: r.id, path: r.path })));
      }
      if (m === 'POST') {
        await hold('send', () => true);
        const x = JSON.parse(req.postData())[0];
        const clash = [...S.rows.values()].find(r => r.collection_id === x.collection_id && r.kind === x.kind && r.name === x.name && r.layer === x.layer && r.status === x.status);
        if (clash) return json({ code: '23505', details: null, hint: null, message: 'duplicate key value violates unique constraint "traits_identity"' }, 409);
        const id = 'row-new-' + (++S.newN);
        return json([S.addRow(Object.assign({}, x, { id, updated_at: S.now() }))], 201);
      }
    }
    st.unknown.push(m + ' ' + p.slice(0, 140));
    return json({ code: 'UNROUTED' }, 501);
  };
}

/* ---- the page's stores, by name ------------------------------------------ */
const PUT = (page, store, recs) => page.evaluate(async ([store, recs]) => {
  for (const rec of recs) if (rec.kind === 'trait' || rec.kind === 'ref') { const c = document.createElement('canvas'); c.width = rec.w; c.height = rec.h; c.getContext('2d').fillRect(0, 0, rec.w, rec.h); rec.blob = await new Promise(res => c.toBlob(res, 'image/png')); }
  const d = await new Promise((res, rej) => { const r = indexedDB.open(store, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); for (const rec of recs) t.objectStore(STORE).put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); });
  d.close();
}, [store, recs]);
/* Every record but the working draft, one line each; a settings record by
   its content without its time. */
const DUMP = (page, store) => page.evaluate(async (store) => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open(store, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const t = d.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
  d.close();
  return all.filter(i => i.kind !== 'autosave').map(i => i.kind === 'trait' || i.kind === 'ref'
    ? i.id + '[' + (i.rowId || null) + ' ' + i.rarity + ' ' + (i.layer || null) + (i.synced ? ' synced' : ' unsent') + (i.reviewId ? ' review:' + i.reviewId : '') + ']'
    : i.id + ' ' + JSON.stringify(Object.assign({}, i, { at: undefined }))).sort();
}, store);

const BASE = { kind: 'trait', w: 16, h: 16, at: 1000, synced: true };
const MINE = [
  Object.assign({}, BASE, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', w: 24, h: 24, rarity: 7, rowId: 'row-me-1', rowAt: '2026-01-02T00:00:00+00:00', path: 'me/cme/trait-cap-hats-wip.png' }),
  Object.assign({}, BASE, { id: 't_cap_hats_approved', name: 'cap', layer: 'hats', status: 'approved', w: 24, h: 24, rarity: 7, rowId: 'row-me-2', rowAt: '2026-01-02T00:00:00+00:00', path: 'me/cme/trait-cap-hats-approved.png' }),
  Object.assign({}, BASE, { id: 't_cap_skins_approved', name: 'cap', layer: 'skins', status: 'approved', w: 24, h: 24, rarity: 7, rowId: 'row-me-3', rowAt: '2026-01-02T00:00:00+00:00', path: 'me/cme/trait-cap-skins-approved.png' }),
  { id: 'settings.layers', kind: 'settings', layers: ['mine-a', 'mine-b', 'hats', 'skins'], hidden: [], at: 5 },
  { id: 'settings.rules', kind: 'settings', at: 5, groups: [['hats/mine', 'skins/cap']], rulesAt: 1, pairs: [['hats/mine', 'skins/cap']] },
];
const T7CAP = Object.assign({}, BASE, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-cap-hats-wip.png' });
const T7SKIN = Object.assign({}, BASE, { id: 't_cap_skins_approved', name: 'cap', layer: 'skins', status: 'approved', rarity: 1, shelfOrder: 10, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-cap-skins-approved.png' });
const T7HAT = Object.assign({}, BASE, { id: 't_hat_hats_wip', name: 'hat', layer: 'hats', status: 'wip', rarity: 1, rowId: 'row-2', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-hat-hats-wip.png' });
/* A trait whose key (hats/mine) My page's rules name. */
const T7MINE = Object.assign({}, BASE, { id: 't_mine_hats_wip', name: 'mine', layer: 'hats', status: 'wip', rarity: 1, rowId: 'row-3', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-mine-hats-wip.png' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* The words fix round 4 says them with (patch602, section 1). */
const S0_LEFT_UNMADE = 'Not saved: you left the project before it was written';
const S0_LEFT_PART = 'Stopped part way: you left the project. What was done is kept there';
const S0_LEFT_SENT = 'Not sent: you left the project first. The change is kept there, and its next Save to cloud sends it';

/* One action on team7, a request of sc.hold's kind held (or the page's own
   gate, window.__gate), the page moved to My page there if sc.move, then
   released. What every request did, both stores and the server after.
   (stage0moves.spec.js's run, copied; sc.me adds records to My page's store,
   sc.noColl takes team7's project off the server, and out.me and out.meWas
   are My page's store after and before, for the tests that name one
   record.) */
async function run(page, sc) {
  const st = { log: [], reads: [], unknown: [], proto: () => 1, server: newServer(), hold: null, release: null };
  const S = st.server;
  S.addRow({ id: 'row-me-1', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'hats', status: 'wip', rarity: 7, path: 'me/cme/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
  S.addRow({ id: 'row-me-2', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'hats', status: 'approved', rarity: 7, path: 'me/cme/trait-cap-hats-approved.png', updated_at: '2026-01-02T00:00:00+00:00' });
  S.addRow({ id: 'row-me-3', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'skins', status: 'approved', rarity: 7, path: 'me/cme/trait-cap-skins-approved.png', updated_at: '2026-01-02T00:00:00+00:00' });
  st.refuseSend = !!sc.refuseSend;
  st.noColl = !!sc.noColl;
  for (const r of (sc.t7 || [])) if (r.rowId) S.addRow({ id: r.rowId, collection_id: 'c1', team_id: 'team7', name: r.name, layer: r.layer, status: r.status, rarity: r.rarity, shelf_order: r.shelfOrder == null ? null : r.shelfOrder, path: r.path, updated_at: r.rowAt });
  await page.context().route(/supabase\.co/, router(st));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof s0Check === 'function' && typeof wsSwitch === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'made-up-token', refresh_token: 'made-up-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    try { sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1'); } catch (_) {}
    groupCaughtUp = true;
    activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; await dbClear();
    activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; await dbClear();
  });
  await PUT(page, 'pixelbench', MINE.map(r => Object.assign({}, r)).concat((sc.me || []).map(r => Object.assign({}, r))));
  await PUT(page, 'chatnft.ws.team7', [{ id: 'settings.layers', kind: 'settings', layers: ['hats', 'skins', 'unsorted'], hidden: [], at: 1000 }].concat((sc.t7 || []).map(r => Object.assign({}, r))));
  await page.evaluate(async () => { LAYERS = ['hats', 'skins', 'unsorted']; await renderShelf(); s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 }; s0Flight = null; s0FlightKey = null; s0Seen2.clear(); });
  const meBefore = await DUMP(page, 'pixelbench');
  const from = st.log.length, readsFrom = st.reads.length;
  st.hold = sc.hold ? Object.assign({}, sc.hold) : null;
  await page.evaluate((src) => {
    window.__toasts = []; const tt = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { tt(m); } catch (_) {} };
    window.__asked = []; window.confirm = (m) => { window.__asked.push(String(m)); return true; };
    window.__done = (0, eval)('(async () => {' + src + '})')();
  }, sc.act);
  for (let i = 0; i < 600 && !st.release && !(await page.evaluate(() => !!window.__gate)); i++) await sleep(10);
  const heldAt = st.release ? st.hold.kind : (await page.evaluate(() => !!window.__gate)) ? 'gate' : 'never';
  const at = st.log.length;
  if (sc.move) await page.evaluate(() => wsSwitch(null));
  if (sc.during) await sc.during(page, st);
  const moved = await page.evaluate(() => activeWs === null);
  const afterMove = st.log.length;
  if (st.release) st.release();
  await page.evaluate(() => { if (window.__gate) window.__gate(); });
  const ret = await page.evaluate(async () => { try { const r = await window.__done; return r === undefined ? '(undefined)' : r; } catch (e) { return 'threw ' + e; } });
  await sleep(400);
  const me = await DUMP(page, 'pixelbench');
  const writesOf = (log) => log.filter(e => /^(POST|PATCH|DELETE)$/.test(e.m) && e.path.indexOf('/rpc/my_team') < 0 && e.path.indexOf('/rpc/team_member_names') < 0 && e.path.indexOf('/object/list/') < 0)
    .map(e => e.m + ' ' + e.path.replace(/&select=.*$/, '') + (e.rpc ? ' @' + e.rpc : ''));
  const out = {
    heldAt, moved, ret, reads: st.reads.slice(readsFrom),
    toasts: await page.evaluate(() => window.__toasts.filter(t => t !== 'Back on your page' && t !== 'Opened the group project')),
    asked: await page.evaluate(() => window.__asked.slice()),
    writes: writesOf(st.log.slice(from)),
    /* what went out once the page had moved (the move's own requests left out) */
    after: st.log.slice(afterMove).map(e => e.m + ' ' + e.path.replace(/&select=.*$/, '')),
    writesAfter: writesOf(st.log.slice(afterMove)),
    meSame: JSON.stringify(meBefore) === JSON.stringify(me),
    me, meWas: meBefore,
    team7: (await DUMP(page, 'chatnft.ws.team7')).filter(l => l.indexOf('t_') === 0 || l.indexOf('ref_') === 0),
    server: S.snap(),
    files: [...S.files].sort(),
    made: S.made.slice(),
    layers: { c1: S.colls.c1.layers, cme: S.colls.cme.layers },
    note: await page.evaluate(() => { const n = document.getElementById('cloudnote'); return n ? n.textContent : null; }),
  };
  void at;
  st.out = out;
  return { st, out };
}
/* A page-side hold: the call of global function `fn` for which `when(args,
   n, stack)` is true is held, after it has answered, on window.__gate. The
   function is put back as soon as it has held once. */
const hold = (fn, when) => "(()=>{ const real=" + fn + "; let n=0; " + fn + "=async function(...a){ const r=await real.apply(this,a); if((" + when + ")(a,++n,String(new Error().stack))){ " + fn + "=real; await new Promise(res=>{ window.__gate=res; }); } return r; }; })(); ";
/* What changed in My page's store: lines gone, lines new. */
const meDiff = (out) => ({ gone: out.meWas.filter(l => out.me.indexOf(l) < 0), added: out.me.filter(l => out.meWas.indexOf(l) < 0) });
const NO_CHANGE = { gone: [], added: [] };
const traitsOf = (d) => ({ gone: d.gone.filter(l => /^(t|ref)_/.test(l)), added: d.added.filter(l => /^(t|ref)_/.test(l)) });
const settingOf = (d, id) => ({ gone: d.gone.filter(l => l.indexOf(id + ' ') === 0), added: d.added.filter(l => l.indexOf(id + ' ') === 0) });
/* A folder of PNGs for bulkImport, each a File carrying the path it arrived
   at. */
const FILES = "const png=async(w,h)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').fillRect(0,0,w,h); return await new Promise(r=>c.toBlob(r,'image/png')); }; "
  + "const file=async(rel,blob)=>{ const f=new File([blob||await png(16,16)], rel.split('/').pop(), {type:'image/png'}); Object.defineProperty(f,'webkitRelativePath',{value:rel}); return f; }; ";
const S0_LEFT_CLEAR = 'Nothing was removed from the server: you left the project first.';
const S0_LEFT_CLEAR_PART = 'Stopped part way: you left the project. Press Remove from server again there - it is safe to repeat.';
const S0_LEFT_IMPORT = 'stopped: you left the project first - import the rest there';
const MY_LAYERS = ['mine-a', 'mine-b', 'hats', 'skins'];
/* The same list as the page holds it once loaded: unsorted is always last. */
const MY_LAYERS_SHOWN = MY_LAYERS.concat(['unsorted']);
/* An order naming My page's layers, reversed: applied there, it would move
   every one of them. */
const MY_ORDER = ['skins', 'hats', 'mine-b', 'mine-a'];

test.describe('stage 0, fix round 4: the home guards no spec held (follow-up X4)', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { try { activeWs = null; localStorage.removeItem('chatnft.session'); } catch (_) {} }).catch(() => {});
  });

  /* ---- THE LAYER LIST ------------------------------------------------------
     saveLayers, retagLayer, and the removal and rename that call them. My
     page's list is mine-a, mine-b, hats, skins; its rules name hats/mine and
     skins/cap. */
  test('layers: saveLayers, the page moving during its PATCH: what the group was sent is not remembered for the page moved to', async ({ page }) => {
    /* sharedLayerSig is "the list the group of the page shown has": the next
       saveLayers there compares against it and sends nothing on a match. */
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'patch' }, move: true,
      act: "LAYERS=['hats','skins','team7-new','unsorted']; sharedLayerSig=null; const r=await saveLayers(); return {r, sig:sharedLayerSig};" });
    expect([out.heldAt, out.moved]).toEqual(['patch', true]);
    expect(out.writes).toEqual(['PATCH /rest/v1/collections?id=eq.c1']);
    expect(out.ret.sig, 'the page moved to has been told nothing').toBe(null);
    expect(st.unknown).toEqual([]);
  });
  test('layers: retagLayer, the page moving during the first trait\'s send: the second is not moved into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], move: true,
      act: hold('cloudMoveOne', '(a,n)=>n===1') + "window.confirm=()=>true; await renameLayer('hats','caps'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out)), 'nothing of team7\'s written into My page').toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('layers: retagLayer, the page moving during the last trait\'s send: My page\'s rules are not retargeted', async ({ page }) => {
    /* skins/cap is in My page's rules; a rename of team7's skins would
       retarget it. */
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: hold('cloudMoveOne', '(a,n)=>n===1') + "window.confirm=()=>true; await renameLayer('skins','caps'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(meDiff(out).added.filter(l => l.indexOf('settings.rules') === 0), 'My page\'s rules as they were').toEqual([]);
    expect(out.writesAfter.filter(w => w.indexOf('cme') >= 0), 'nor sent to My page\'s collection').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('layers: removal, the page moving during its read of the store: it says it was not made, and asks nothing', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('s0RemoveLayer')>=0") + "await removeLayer('skins'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(out.asked, 'no question about a layer of the project left').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('layers: removal, the page moving during the move of its traits: My page\'s list keeps its layer', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: hold('cloudMoveOne', '(a,n)=>n===1') + "await removeLayer('skins'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_PART);
    expect(meDiff(out).added.filter(l => l.indexOf('settings.layers') === 0), 'My page\'s layer list as it was').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('layers: rename, the page moving during its read of the store: it says it was not made', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('s0RenameLayer')>=0") + "await renameLayer('skins','caps'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(st.unknown).toEqual([]);
  });
  test('layers: rename, the page moving during the move of its traits: My page\'s list keeps its layer\'s name', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: hold('cloudMoveOne', '(a,n)=>n===1') + "await renameLayer('skins','caps'); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_PART);
    expect(meDiff(out).added.filter(l => l.indexOf('settings.layers') === 0), 'My page\'s layer list as it was').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('layers: THE CONTROL: the same rename with no move renames team7\'s layer, moves its trait, and leaves My page alone', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: false,
      act: hold('cloudMoveOne', '(a,n)=>n===1') + "await renameLayer('skins','caps'); return 'done';" });
    expect(out.heldAt).toBe('gate');
    expect(out.toasts[out.toasts.length - 1]).toContain('Renamed to caps');
    expect(out.team7).toEqual([expect.stringMatching(/^t_cap_caps_approved\[row-\S+ 1 caps synced\]$/)]);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  /* ---- CLEAR -----------------------------------------------------------------
     The settings half of Clear: with "also remove" answered, each settings
     record is removed, then the settings in memory are reset. */
  test('Clear: the page moving during the last settings removal: My page\'s settings in memory are not reset', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], move: true,
      act: "RULES=[['hats/cap','hats/hat']]; " + hold('dbDel', '(a)=>a[0]===EMPTY_ID') + "window.confirm=()=>true; await document.getElementById('clearproj').onclick(); return {layers:LAYERS.slice(), rules:RULES.map(g=>g.slice())};" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_PART);
    expect(out.ret, 'My page\'s layers and rules, as it loaded them').toEqual({ layers: MY_LAYERS_SHOWN, rules: [['hats/mine', 'skins/cap']] });
    expect(st.unknown).toEqual([]);
  });

  /* ---- THE SORT ----------------------------------------------------------------
     Sort unsorted's apply (sortApply), and the paint order the sort file
     stated, applied after it (the Move them button). */
  const SORT_CAP = "return sortApply({layers:[], both:[], move:[{id:'t_cap_hats_wip', name:'cap', toName:'cap', toLayer:'skins', status:'wip'}], rename:[]});";
  test('sort: the page moving during its read of the store: nothing is moved in My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('s0SortApply')>=0") + SORT_CAP });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(out.ret).toEqual({ made: 0, moved: 0, refused: [], failed: 1, stranded: 0 });
    expect(st.unknown).toEqual([]);
  });
  test('sort: the page moving during a trait\'s move: My page\'s rules are not retargeted', async ({ page }) => {
    /* hats/mine is in My page's rules; team7's mine moves to skins. */
    const { st, out } = await run(page, { t7: [T7MINE], move: true,
      act: hold('dbApplyShelfRecords', "(a,n,s)=>s.indexOf('s0SortApply')>=0") + "return sortApply({layers:[], both:[], move:[{id:'t_mine_hats_wip', name:'mine', toName:'mine', toLayer:'skins', status:'wip'}], rename:[]});" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(settingOf(meDiff(out), 'settings.rules')).toEqual(NO_CHANGE);
    expect(out.writesAfter.filter(w => w.indexOf('cme') >= 0)).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('sort: THE CONTROL: the same sort with no move moves team7\'s cap, and nothing of My page\'s', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('s0SortApply')>=0") + SORT_CAP });
    expect(out.heldAt).toBe('gate');
    expect(out.ret).toEqual({ made: 0, moved: 1, refused: [], failed: 0, stranded: 0 });
    expect(out.team7).toEqual([expect.stringMatching(/^t_cap_skins_wip\[/)]);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('sort: Move them, the page moving during the move: the file\'s paint order is not applied to My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: "sortPlan={layers:[], both:[], move:[], rename:[]}; sortOrder=" + JSON.stringify(MY_ORDER) + "; " + hold('sortApply', '(a,n)=>n===1') + "await document.getElementById('sortgo').onclick(); return LAYERS.slice();" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.ret, 'My page\'s order as it was').toEqual(MY_LAYERS_SHOWN);
    expect(settingOf(meDiff(out), 'settings.layers')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });

  /* ---- THE REVIEW PASS -------------------------------------------------------
     A review queue loaded from a file (importReviewQueue), and the pass's two
     accept buttons. team7's queue names its cap. */
  const QUEUE = { collectionRevision: 'r1', traits: [{ id: 'q1', sequence: 1, layer: 'hats', currentName: 'cap.png' }] };
  const loadQueue = (doc) => "return importReviewQueue({name:'queue.json', text:async()=>" + JSON.stringify(JSON.stringify(doc)) + "});";
  test('review: loading a queue, the page moving during its read of the store: no trait of My page is stamped', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('importReviewQueue')>=0") + loadQueue(QUEUE) });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    /* (What it answers is the next test's check.) */
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('review: loading a queue, the page moving during its last stamp: My page gets no review pass', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: hold('dbPut', "(a,n,s)=>s.indexOf('importReviewQueue')>=0") + loadQueue(QUEUE) });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.ret).toBe(false);
    expect(settingOf(meDiff(out), 'settings.review')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('review: loading a queue with an order, the page moving while the pass is saved: the order is not applied to My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: hold('saveReview', "(a,n,s)=>s.indexOf('importReviewQueue')>=0") + loadQueue(Object.assign({ order: MY_ORDER }, QUEUE)) });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(settingOf(meDiff(out), 'settings.layers')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('review: THE CONTROL: the same queue with no move is loaded, and team7\'s cap is stamped', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('importReviewQueue')>=0") + loadQueue(QUEUE) });
    expect(out.heldAt).toBe('gate');
    expect(out.ret).toBe(true);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 1 hats synced review:q1]']);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  /* The pass itself: team7 has one, on its cap, stamped. */
  const T7CAP_Q = Object.assign({}, T7CAP, { reviewId: 'q1' });
  const PASS = (entry) => ({ id: 'settings.review', kind: 'settings', at: 5, revision: 'r1', activeId: 'q1',
    entries: [Object.assign({ id: 'q1', sequence: 1, layer: 'hats', originalName: 'cap.png', currentName: 'cap.png', finalName: null, artworkAccepted: false, nameAccepted: false, skipped: false }, entry || {})] });
  test('review: accepting the artwork, the page moving while it is fingerprinted: it says it was not saved', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_Q, PASS()], move: true,
      act: "await renderShelf(); " + hold('traitFingerprint', '(a,n)=>n===1') + "await document.getElementById('revart').onclick(); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(st.unknown).toEqual([]);
  });
  test('review: accepting a new name, the page moving while the trait opens: nothing is renamed or written in My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_Q, PASS()], move: true,
      act: "await renderShelf(); document.getElementById('revname').value='cap2'; " + hold('openTraitRecord', '(a,n)=>n===1') + "await document.getElementById('revnamed').onclick(); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('review: accepting the name as it is, the page moving while the trait is found: My page\'s pass is not marked', async ({ page }) => {
    /* My page holds a pass from the same queue file (the same entry id). */
    const { st, out } = await run(page, { t7: [T7CAP_Q, PASS()], me: [PASS()], move: true,
      act: "await renderShelf(); document.getElementById('revname').value='cap'; " + hold('traitForEntry', '(a,n)=>n===1') + "await document.getElementById('revnamed').onclick(); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(settingOf(meDiff(out), 'settings.review')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });

  /* ---- THE IMPORTS -------------------------------------------------------------
     A folder (bulkImport), the pieces it runs after its loop (the status and
     rename reconciles, carryDecided), a project file (importProject) and a
     rules file (importRuleFile). */
  test('folder import: the page moving during its protocol read: it says it was not made, and My page\'s layers take nothing', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'read' }, move: true,
      act: FILES + "await bulkImport([await file('UP/newlayer/wip/zed.png')]); return LAYERS.slice();" });
    expect([out.heldAt, out.moved]).toEqual(['read', true]);
    expect(out.toasts).toEqual([S0_LEFT_UNMADE]);
    expect(out.ret).toEqual(MY_LAYERS_SHOWN);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: a reference, the page moving while it is decoded: it is not written into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: FILES + "const f=await file('UP/base/body.png'); " + hold('createImageBitmap', '(a,n)=>n===1') + "await bulkImport([f]); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: a trait, the page moving while it is decoded: it is not written into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: FILES + "const f=await file('UP/hats/wip/zed.png'); " + hold('createImageBitmap', '(a,n)=>n===1') + "await bulkImport([f]); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: THE CONTROL: the same trait with no move is written into team7 and nowhere else', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false,
      act: FILES + "const f=await file('UP/hats/wip/zed.png'); " + hold('createImageBitmap', '(a,n)=>n===1') + "await bulkImport([f]); return 'done';" });
    expect(out.heldAt).toBe('gate');
    expect(out.team7.some(l => l.indexOf('t_zed_hats_wip[') === 0)).toBe(true);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: a file moved to another status, the page moving while its weight is carried: My page\'s record of the old one is not removed', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: FILES + "const f=await file('UP/hats/approved/cap.png'); " + hold('carryDecided', "(a)=>a[0]&&a[0].id==='t_cap_hats_wip'") + "await bulkImport([f]); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: a file moved to another status, the page moving during carryDecided\'s read: the carried weight is not written into My page', async ({ page }) => {
    /* Only the record carryDecided writes (the new id, t_cap_hats_approved):
       the removal of the old one after it is the test above's check. */
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { rarity: 5 })], move: true,
      act: FILES + "const f=await file('UP/hats/approved/cap.png'); " + hold('dbGet', "(a,n,s)=>s.indexOf('carryDecided')>=0") + "await bulkImport([f]); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    const d = traitsOf(meDiff(out)), mine = (l) => l.indexOf('t_cap_hats_approved[') === 0;
    expect({ gone: d.gone.filter(mine), added: d.added.filter(mine) }).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: a file renamed with the same picture, the page moving while its weight is carried: My page\'s record of the old name is not removed', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: FILES + "const was=await dbGet('t_cap_hats_wip'); const f=await file('UP/hats/wip/capv2.png', was.blob); " + hold('carryDecided', "(a)=>a[0]&&a[0].id==='t_cap_hats_wip'") + "await bulkImport([f]); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('folder import: the page moving during its redraw after the loop: the note says it stopped because the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: FILES + "const f=await file('UP/newlayer/wip/zed.png'); " + hold('renderShelf', "(a,n,s)=>s.indexOf('s0BulkImport')>=0") + "await bulkImport([f]); return document.getElementById('bulknote').textContent;" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.ret).toContain('S' + S0_LEFT_IMPORT.slice(1));
    expect(st.unknown).toEqual([]);
  });
  test('project import: the page moving during its read of the store: nothing of the file is written into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: "const c=document.createElement('canvas'); c.width=16; c.height=16; c.getContext('2d').fillRect(0,0,16,16); "
        + "const doc={format:PROJECT_FORMAT, version:PROJECT_VERSION, items:[{kind:'trait', name:'zed', layer:'hats', status:'wip', w:16, h:16, png:c.toDataURL('image/png')}]}; "
        + "const f=new File([JSON.stringify(doc)], 'p.json', {type:'application/json'}); "
        + hold('dbAll', "(a,n,s)=>s.indexOf('s0ImportProject')>=0") + "await importProject(f); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  /* A rules file, read by its text: as a layer order when it is not JSON,
     and as rules and an order when it is. The text is held (window.__gate)
     until the page has moved. */
  const RULES_DOC = { order: MY_ORDER, rules: [{ layer: 'hats', operation: 'is', trait: ['cap.png'],
    thenStatements: [{ action: 'hide layer', targetLayer: 'skins', targetTrait: [] }] }] };
  const T7BOOT = Object.assign({}, BASE, { id: 't_boot_skins_wip', name: 'boot', layer: 'skins', status: 'wip', rarity: 1, rowId: 'row-4', rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-boot-skins-wip.png' });
  const textGate = (text) => "const f={name:'rules.txt', text:async()=>{ await new Promise(res=>{ window.__gate=res; }); return " + JSON.stringify(text) + "; }}; return importRuleFile(f);";
  test('rules file: a layer order, the page moving while it is read: the order is not applied to My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true, act: textGate(MY_ORDER.join('\n')) });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(settingOf(meDiff(out), 'settings.layers')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('rules file: rules and an order, the page moving while it is read: the order is not applied to My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7BOOT], move: true, act: textGate(JSON.stringify(RULES_DOC)) });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(settingOf(meDiff(out), 'settings.layers')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('rules file: rules, the page moving while the order is applied: the rules are not written into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7BOOT], move: true,
      act: hold('applyPaintOrder', "(a,n,s)=>s.indexOf('importRuleFile')>=0") + "const f={name:'rules.json', text:async()=>" + JSON.stringify(JSON.stringify(RULES_DOC)) + "}; return importRuleFile(f);" });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(settingOf(meDiff(out), 'settings.rules')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('rules file: rules with an order, the page moving while they are shared: My page gets no draw order', async ({ page }) => {
    /* The rule (hats decides skins) gives the file a draw order of its own
       (planRuleImport's order), written after the rules are saved. */
    const { st, out } = await run(page, { t7: [T7CAP, T7BOOT], hold: { kind: 'answers' }, move: true,
      act: "const f={name:'rules.json', text:async()=>" + JSON.stringify(JSON.stringify(RULES_DOC)) + "}; return importRuleFile(f);" });
    expect([out.heldAt, out.moved]).toEqual(['answers', true]);
    expect(settingOf(meDiff(out), 'settings.decideorder')).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('rules file: THE CONTROL: the same rules with no move are written into team7 and shared', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7BOOT], move: false,
      act: hold('applyPaintOrder', "(a,n,s)=>s.indexOf('importRuleFile')>=0") + "const f={name:'rules.json', text:async()=>" + JSON.stringify(JSON.stringify(RULES_DOC)) + "}; await importRuleFile(f); return RULES.map(g=>g.slice());" });
    expect(out.heldAt).toBe('gate');
    expect(out.ret.length).toBe(1);
    expect(out.writes).toContain('PATCH /rest/v1/collections?id=eq.c1');
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });

  /* ---- REMOVE FROM SERVER ------------------------------------------------------
     The owner's press (clearCloud, then clearCloudNow), on team7: two rows
     and two pictures on the server, and the two records here marked sent. */
  const PRESS = "await clearCloud(); return document.getElementById('cloudnote').textContent;";
  test('Remove from server: the collection lookup of a group with no project, the page moving during it: none is made there', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], noColl: true, hold: { kind: 'coll' }, move: true,
      act: "return await cloudCollection({id:'u1'});" });
    expect([out.heldAt, out.moved]).toEqual(['coll', true]);
    expect(out.ret).toBe(null);
    expect(out.made, 'no project made').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving during the collection lookup: it says the page left, and asks nothing more', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'coll' }, move: true, act: PRESS });
    expect([out.heldAt, out.moved]).toEqual(['coll', true]);
    expect(out.ret).toBe(S0_LEFT_CLEAR);
    expect(out.after.filter(l => l.indexOf('/rest/v1/traits?select=id&collection_id=eq.c1') >= 0), 'no count read').toEqual([]);
    expect(out.asked).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: another account signed in during the row count: no question, and nothing removed', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'count' }, move: false,
      during: async (page) => { await page.evaluate(() => { s0SeenUid = 'u2'; }); },
      act: PRESS });
    expect(out.heldAt).toBe('count');
    expect(out.asked, 'no confirm').toEqual([]);
    expect(out.ret).toBe(S0_LEFT_CLEAR);
    expect(out.writes).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server, called with no press (as stage0gate calls it): nothing on the server, the page moving during the pictures read: no repair, and it says the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { rowId: null, path: null })], hold: { kind: 'list' }, move: true,
      act: "await clearCloudNow(); return document.getElementById('cloudnote').textContent;" });
    expect([out.heldAt, out.moved]).toEqual(['list', true]);
    expect(out.ret).toBe(S0_LEFT_CLEAR);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving during the relight\'s read: nothing of team7\'s is written into My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('relightUnsynced')>=0") + PRESS });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(traitsOf(meDiff(out))).toEqual(NO_CHANGE);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving during the relight\'s read: it stops there, says so, and reads nothing more', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], move: true,
      act: hold('dbAll', "(a,n,s)=>s.indexOf('relightUnsynced')>=0") + PRESS });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.ret).toBe(S0_LEFT_CLEAR);
    expect(out.after.filter(l => l.indexOf('/storage/') >= 0), 'no listing, no removal').toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving during the second protocol read, after the confirm: nothing removed', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'read', nth: 2 }, move: true, act: PRESS });
    expect([out.heldAt, out.moved]).toEqual(['read', true]);
    expect(out.ret).toBe(S0_LEFT_CLEAR);
    expect(out.writesAfter).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving during the pictures listing: no picture is removed', async ({ page }) => {
    /* The pictures only: the rows, and the words, are the next test's check. */
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'list' }, move: true, act: PRESS });
    expect([out.heldAt, out.moved]).toEqual(['list', true]);
    expect(out.writesAfter.filter(w => w.indexOf('/storage/') >= 0)).toEqual([]);
    expect(out.files.filter(f => f.indexOf('team7/') === 0)).toEqual(['team7/c1/trait-cap-hats-wip.png', 'team7/c1/trait-hat-hats-wip.png']);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: the page moving while the pictures are removed: the rows are not', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'filedel' }, move: true, act: PRESS });
    expect([out.heldAt, out.moved]).toEqual(['filedel', true]);
    expect(out.writesAfter).toEqual([]);
    expect(out.server.filter(r => r.indexOf('{c1 ') > 0)).toEqual(['row-1{c1 cap/hats/wip r1}', 'row-2{c1 hat/hats/wip r1}']);
    expect(out.ret).toBe(S0_LEFT_CLEAR_PART);
    expect(st.unknown).toEqual([]);
  });
  test('Remove from server: THE CONTROL: the same press with no move removes team7\'s pictures and rows, and nothing of My page\'s', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'list' }, move: false, act: PRESS });
    expect(out.heldAt).toBe('list');
    expect(out.ret).toContain('The server copy is gone');
    expect(out.server).toEqual(['row-me-1{cme cap/hats/wip r7}', 'row-me-2{cme cap/hats/approved r7}', 'row-me-3{cme cap/skins/approved r7}']);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
});
