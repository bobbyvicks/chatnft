/* Stage 0, Task 11 fix round 4: THE ACTION'S HOME.

   The page can leave a project - for My page, another group, or a sign-out -
   while an action it began there is still waiting: for a read of the store,
   the sign-in check, the team or the collection lookup, a redraw, or its
   own send. Rounds 1 to 3 closed that one sender at a time, and each review
   found a neighbour open. Fix round 4 closes it with one mechanism: the
   action notes its home (store, account, wsGen) when the person acts, and
   every write or send after any wait asks it first (s0HomeNow, s0AtHome,
   s0SendHome in patch602).

   THE SERVER HERE KEEPS STATE, in node, behind a route on the context (the
   review of f5a23b8's harness, scratchpad t11r3/probe/probe.cjs, ported):
   rows, pictures and two collections - c1 for team7, cme for My page (team
   "me"). reorder_traits refuses a row outside p_collection as the live
   function does, and a row insert that takes an identity already taken is
   refused 409, as the unique index does. The in-page stand-in the other
   stage 0 specs use answers 200 to a send aimed at the wrong collection;
   this one keeps what each send did, so a send that reached My page shows
   as a row of My page's that is gone or a picture overwritten.

   Each test that moves the page is beside its control, the same action with
   no move. Every moved test here was measured red on f5a23b8 (the page
   before fix round 4); the controls pass on both. The names and ids are
   made up; no request leaves the page (the route answers every
   *.supabase.co request, and one it does not know is answered 501 and
   fails the test). */
import { test, expect } from '@playwright/test';

/* ---- the server ----------------------------------------------------------- */
function newServer() {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 8, 28, 12, 0, 0) + (++clock) * 1000).toISOString();
  const S = {
    rows: new Map(), files: new Set(), newN: 0, now,
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
    const json = (x, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(x) });
    const hold = async (kind, ok) => {
      const h = st.hold;
      if (!h || h.kind !== kind || h.done || !ok()) return false;
      if (h.after && !h.after()) return false;
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
    if (u.indexOf('/rest/v1/team_members') >= 0) return json([]);
    if (u.indexOf('/rest/v1/collections') >= 0) {
      if (m === 'GET') {
        const byId = qp('id'), teamQ = (qp('team_id') || '').replace(/^eq\./, '');
        if (byId && u.indexOf('select=decisions') >= 0) await hold('answers', () => true);
        const id = byId ? byId.replace(/^eq\./, '') : collOfTeam(teamQ || 'team7');
        if (!byId) await hold('coll', () => (teamQ || 'team7') === (st.hold.team || 'team7'));
        const c = S.colls[id];
        return json([{ id, team_id: c.team, layers: c.layers, rules: c.rules, decisions: c.decisions, decide_order: [], empty_chance: null, rules_at: null, protocol: 1, switching_at: null, updated_at: '2026-09-28T00:00:00Z' }]);
      }
      if (m === 'PATCH') {
        const id = (qp('id') || '').replace(/^eq\./, '');
        try { const b = JSON.parse(req.postData()); if (S.colls[id]) { if (b.layers) S.colls[id].layers = b.layers; if (b.rules) S.colls[id].rules = b.rules; } } catch (_) {}
        return json([], 200);
      }
    }
    if (u.indexOf('/storage/v1/object/list/') >= 0) {
      const b = JSON.parse(req.postData() || '{}'); const pre = (b.prefix || '') + '/';
      const names = [...S.files].filter(f => f.indexOf(pre) === 0).map(f => f.slice(pre.length)).sort();
      return json(names.slice(b.offset || 0, (b.offset || 0) + (b.limit || 100)).map(name => ({ name })));
    }
    if (u.indexOf('/storage/v1/object/') >= 0) {
      if (m === 'GET') return route.fulfill({ status: 404, headers: CORS, body: '' });
      if (m === 'DELETE') { try { const b = JSON.parse(req.postData()); for (const x of (b.prefixes || [])) S.files.delete(x); } catch (_) {} return json([]); }
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
        /* (Close fixes: 'rowdel' holds the answer to a row DELETE - by
           st.hold.id when given - after the rows are gone, as the server
           removes them when the request arrives.) */
        await hold('rowdel', () => !st.hold.id || one === 'eq.' + st.hold.id);
        /* (Close fix 3: st.rowdelAnswer answers the first row DELETE, the
           rows already gone, with a 502 ('bad') or a 200 that is not JSON
           ('garbled') - an answer that cannot say what it took.) */
        if (st.rowdelAnswer && !st.rowdelAnswered) {
          st.rowdelAnswered = true;
          if (st.rowdelAnswer === 'bad') return json({ message: 'bad gateway' }, 502);
          return route.fulfill({ status: 200, contentType: 'text/plain', headers: CORS, body: 'not json' });
        }
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
  for (const rec of recs) if (rec.kind === 'trait') { const c = document.createElement('canvas'); c.width = rec.w; c.height = rec.h; c.getContext('2d').fillRect(0, 0, rec.w, rec.h); rec.blob = await new Promise(res => c.toBlob(res, 'image/png')); }
  const d = await new Promise((res, rej) => { const r = indexedDB.open(store, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); for (const rec of recs) t.objectStore(STORE).put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); });
  d.close();
}, [store, recs]);
const DUMP = (page, store) => page.evaluate(async (store) => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open(store, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const t = d.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
  d.close();
  return all.filter(i => i.kind !== 'autosave').map(i => i.kind === 'trait'
    ? i.id + '[' + (i.rowId || null) + ' ' + i.rarity + ' ' + (i.layer || null) + (i.synced ? ' synced' : ' unsent') + ']'
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
const T7NEW = Object.assign({}, BASE, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, synced: false });
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* The words fix round 4 says them with (patch602, section 1). */
const S0_LEFT = 'Not sent: you left the project first. The move is kept there, and its next Save to cloud sends it';
const S0_LEFT_UNMADE = 'Not saved: you left the project before it was written';
const S0_LEFT_SENT = 'Not sent: you left the project first. The change is kept there, and its next Save to cloud sends it';
const S0_LEFT_PUSH = 'Save to cloud stopped: you left the project. What it had not finished is kept there, marked unsent, and its next Save to cloud sends it';

/* One action on team7, a request of sc.hold's kind held (or the page's own
   gate, window.__gate), the page moved to My page there if sc.move, then
   released. What every request did, both stores and the server after. */
async function run(page, sc) {
  const st = { log: [], reads: [], unknown: [], proto: () => 1, server: newServer(), hold: null, release: null };
  const S = st.server;
  S.addRow({ id: 'row-me-1', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'hats', status: 'wip', rarity: 7, path: 'me/cme/trait-cap-hats-wip.png', updated_at: '2026-01-02T00:00:00+00:00' });
  S.addRow({ id: 'row-me-2', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'hats', status: 'approved', rarity: 7, path: 'me/cme/trait-cap-hats-approved.png', updated_at: '2026-01-02T00:00:00+00:00' });
  S.addRow({ id: 'row-me-3', collection_id: 'cme', team_id: 'me', name: 'cap', layer: 'skins', status: 'approved', rarity: 7, path: 'me/cme/trait-cap-skins-approved.png', updated_at: '2026-01-02T00:00:00+00:00' });
  if (sc.c1Decisions) S.colls.c1.decisions = sc.c1Decisions;
  st.refuseSend = !!sc.refuseSend;
  st.rowdelAnswer = sc.rowdelAnswer || null;
  for (const r of (sc.t7 || [])) if (r.rowId) S.addRow({ id: r.rowId, collection_id: 'c1', team_id: 'team7', name: r.name, layer: r.layer, status: r.status, rarity: r.rarity, shelf_order: r.shelfOrder == null ? null : r.shelfOrder, path: r.path, updated_at: r.rowAt });
  await page.context().route(/supabase\.co/, router(st));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof s0Check === 'function' && typeof wsSwitch === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'made-up-token', refresh_token: 'made-up-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    /* Task 15's reload rule (patch606), integrated after this spec was
       written: a read that holds team7 on protocol 2 with nothing in hand
       reloads the page once per tab session per store and account. The
       reload guard for team7 and u1 is set, as armStage0 sets it for the
       store it arms, so no spec but stage0reload.spec.js reloads the page. */
    try { sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1'); } catch (_) {}
    groupCaughtUp = true;
    activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; await dbClear();
    activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; await dbClear();
  });
  await PUT(page, 'pixelbench', MINE.map(r => Object.assign({}, r)));
  await PUT(page, 'chatnft.ws.team7', [{ id: 'settings.layers', kind: 'settings', layers: ['hats', 'skins', 'unsorted'], hidden: [], at: 1000 }].concat((sc.t7 || []).map(r => Object.assign({}, r))));
  await page.evaluate(async () => { LAYERS = ['hats', 'skins', 'unsorted']; await renderShelf(); s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 }; s0Flight = null; s0FlightKey = null; s0Seen2.clear(); });
  /* Started on My page, and let settle: the switch's own status line reads
     the removal list too (goneLoad), in the background. */
  if (sc.startMe) { await page.evaluate(() => wsSwitch(null)); await sleep(800); }
  const meBefore = await DUMP(page, 'pixelbench');
  const from = st.log.length, readsFrom = st.reads.length;
  st.hold = sc.hold ? Object.assign({}, sc.hold) : null;
  if (st.hold && st.hold.afterRead) { const n0 = st.reads.length; st.hold.after = () => st.reads.length > n0; }
  await page.evaluate((src) => {
    window.__toasts = []; const tt = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { tt(m); } catch (_) {} };
    window.__done = (0, eval)('(async () => {' + src + '})')();
  }, sc.act);
  for (let i = 0; i < 600 && !st.release && !(await page.evaluate(() => !!window.__gate)); i++) await sleep(10);
  const heldAt = st.release ? st.hold.kind : (await page.evaluate(() => !!window.__gate)) ? 'gate' : 'never';
  if (sc.move) await page.evaluate(() => wsSwitch(null));
  if (sc.during) await sc.during(page, st);
  const moved = await page.evaluate(() => activeWs === null);
  if (st.release) st.release();
  await page.evaluate(() => { if (window.__gate) window.__gate(); });
  const ret = await page.evaluate(async () => { try { const r = await window.__done; return r === undefined ? '(undefined)' : r; } catch (e) { return 'threw ' + e; } });
  await sleep(400);
  const out = {
    heldAt, moved, ret, reads: st.reads.slice(readsFrom),
    toasts: await page.evaluate(() => window.__toasts.filter(t => t !== 'Back on your page' && t !== 'Opened the group project')),
    writes: st.log.slice(from).filter(e => /^(POST|PATCH|DELETE)$/.test(e.m) && e.path.indexOf('/rpc/my_team') < 0 && e.path.indexOf('/rpc/team_member_names') < 0 && e.path.indexOf('/object/list/') < 0)
      .map(e => e.m + ' ' + e.path.replace(/&select=.*$/, '') + (e.rpc ? ' @' + e.rpc : '')),
    bodies: st.log.slice(from).filter(e => e.m === 'PATCH' && e.path.indexOf('/rest/v1/collections') >= 0).map(e => e.body),
    meSame: JSON.stringify(meBefore) === JSON.stringify(await DUMP(page, 'pixelbench')),
    team7: (await DUMP(page, 'chatnft.ws.team7')).filter(l => l.indexOf('t_') === 0),
    server: S.snap(),
    files: [...S.files].sort(),
    layers: { c1: S.colls.c1.layers, cme: S.colls.cme.layers },
  };
  st.out = out;
  return { st, out };
}
/* No request of the action names My page's collection or its pictures. */
const namesMe = (out) => out.writes.filter(w => /cme|\/me\//.test(w));
const ME_ROWS = ['row-me-1{cme cap/hats/wip r7}', 'row-me-2{cme cap/hats/approved r7}', 'row-me-3{cme cap/skins/approved r7}'];

test.describe('stage 0, fix round 4: the action\'s home', () => {
  test.afterEach(async ({ page }, info) => {
    void info;
    await page.evaluate(() => { try { activeWs = null; localStorage.removeItem('chatnft.session'); } catch (_) {} }).catch(() => {});
  });

  /* 1. A REMOVAL OF A NEVER-SENT GROUP TRAIT. cloudDropOne reads, then looks
     up the user, the team and the collection - by then My page's. Measured on
     f5a23b8: DELETE traits?collection_id=eq.cme&...name=eq.cap... removed My
     page's row, and the person was told "Removed cap". */
  test('a removal of a never-sent group trait, the page moving during the lookup after its read: nothing names My page, My page\'s row stays, and it says the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7NEW], hold: { kind: 'auth', afterRead: true }, move: true,
      act: "const why={}; const r=await dbDelShared(await dbGet('t_cap_hats_wip'),undefined,why); return {r, left:!!why.left};" });
    expect([out.heldAt, out.moved]).toEqual(['auth', true]);
    expect(namesMe(out)).toEqual([]);
    expect(out.writes).toEqual([]);
    expect(out.server).toEqual(ME_ROWS);
    expect(out.meSame).toBe(true);
    expect(out.ret).toEqual({ r: false, left: true });
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same removal with no move: the removal by name goes to team7\'s collection', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7NEW], hold: { kind: 'auth', afterRead: true }, move: false,
      act: "const why={}; const r=await dbDelShared(await dbGet('t_cap_hats_wip'),undefined,why); return {r, left:!!why.left};" });
    expect([out.heldAt, out.moved]).toEqual(['auth', false]);
    expect(out.writes).toEqual(['DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.hats&status=eq.wip']);
    expect(out.server).toEqual(ME_ROWS);
    expect(out.ret).toEqual({ r: false, left: false });
    expect(out.team7).toEqual([]);
    expect(st.unknown).toEqual([]);
  });

  /* 2. A GROUP SAVE WITH NO CONTEXT (cloudSyncOne). It resolves the team and
     the collection before its read; the page moved during its sign-in check.
     Measured on f5a23b8: team7's picture uploaded over My page's, team7's row
     removed, and the insert into cme refused 409. */
  test('a group save with no context, the page moving during its sign-in check: nothing is sent, and it says the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { synced: false })], hold: { kind: 'auth' }, move: true,
      act: "const why={}; const ok=await cloudSyncOne(await dbGet('t_cap_hats_wip'),null,why); return {ok:!!ok, reason:why.reason||null};" });
    expect([out.heldAt, out.moved]).toEqual(['auth', true]);
    expect(namesMe(out)).toEqual([]);
    expect(out.writes).toEqual([]);
    expect(out.server).toEqual(ME_ROWS.concat(['row-1{c1 cap/hats/wip r1}']).sort());
    expect(out.files.filter(f => f.indexOf('me/') === 0)).toEqual(['me/cme/trait-cap-hats-approved.png', 'me/cme/trait-cap-hats-wip.png', 'me/cme/trait-cap-skins-approved.png']);
    expect(out.ret).toEqual({ ok: false, reason: 'left' });
    expect(out.meSame).toBe(true);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same save with no move goes to team7: the picture, the old row out, the new row in', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { synced: false })], hold: { kind: 'auth' }, move: false,
      act: "const why={}; const ok=await cloudSyncOne(await dbGet('t_cap_hats_wip'),null,why); return {ok:!!ok, reason:why.reason||null};" });
    expect(out.writes).toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-wip.png', 'DELETE /rest/v1/traits?id=eq.row-1', 'POST /rest/v1/traits']);
    expect(out.ret).toEqual({ ok: true, reason: null });
    expect(out.team7).toEqual(['t_cap_hats_wip[row-new-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });

  /* 3. THE LAYER LIST (saveLayers), which had no home at all. Measured on
     f5a23b8: a move during its collection lookup PATCHed team7 with My
     page's layers. */
  test('the layer list, the page moving during its collection lookup: no PATCH, and team7\'s layers on the server stay', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'coll', team: 'team7' }, move: true,
      act: "LAYERS=['hats','team7-new','unsorted']; sharedLayerSig=null; return saveLayers();" });
    expect([out.heldAt, out.moved]).toEqual(['coll', true]);
    expect(out.writes).toEqual([]);
    expect(out.layers).toEqual({ c1: ['hats', 'skins', 'unsorted'], cme: ['mine-a', 'mine-b', 'hats', 'skins'] });
    expect(out.ret).toBe(false);
    expect(out.toasts).toEqual([S0_LEFT_SENT]);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same layer list with no move is sent to team7', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'coll', team: 'team7' }, move: false,
      act: "LAYERS=['hats','team7-new','unsorted']; sharedLayerSig=null; return saveLayers();" });
    expect(out.writes).toEqual(['PATCH /rest/v1/collections?id=eq.c1']);
    expect(out.layers.c1).toEqual(['hats', 'team7-new', 'unsorted']);
    expect(out.ret).toBe(true);
    expect(st.unknown).toEqual([]);
  });

  /* 4. A SHELF MOVE, the page moving during draftsFollow - before f5a23b8
     noted its s0Home. Measured on f5a23b8: the rules retargeted into My
     page (settings.decisions written there) and the toast said "Moved cap
     to hats", with nothing sent. */
  const gated = (fn) => "const real=draftsFollow; draftsFollow=async (...a)=>{ const r=await real(...a); await new Promise(res=>{ window.__gate=res; }); draftsFollow=real; return r; }; " + fn;
  test('a shelf move, the page moving during draftsFollow: nothing written into My page, nothing sent, and it says the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: gated("return commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT);
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same shelf move with no move is sent to team7, and says so', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: false,
      act: gated("return commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });") });
    expect(out.writes).toEqual(['POST /rest/v1/rpc/reorder_traits @c1']);
    expect(out.ret).toBe(true);
    expect(out.toasts[out.toasts.length - 1]).toBe('Moved cap to hats for the group');
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  /* bulkMoveToLayer's retargetRules is in the same class. */
  test('a batch move, the page moving during draftsFollow: nothing written into My page, nothing sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true,
      act: gated("shelfPick.clear(); shelfPick.add('row-1'); return bulkMoveToLayer('hats');") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same batch move with no move is sent to team7', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: false,
      act: gated("shelfPick.clear(); shelfPick.add('row-1'); return bulkMoveToLayer('hats');") });
    expect(out.writes).toEqual(['POST /rest/v1/rpc/reorder_traits @c1']);
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  /* And a status change, whose draftsFollow comes before cloudMoveOne. */
  test('a status change, the page moving during draftsFollow: nothing written into My page, nothing sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: gated("const r=await setTraitStatus(await dbGet('t_cap_hats_wip'),'approved'); return {ok:r.ok, shared:r.shared===undefined?null:r.shared, reason:(r.why&&r.why.reason)||null};") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toEqual({ ok: true, shared: null, reason: 'left' });
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same status change with no move reaches team7', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false,
      act: gated("const r=await setTraitStatus(await dbGet('t_cap_hats_wip'),'approved'); return {ok:r.ok, shared:r.shared===undefined?null:r.shared, reason:(r.why&&r.why.reason)||null};") });
    expect(out.writes).toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-approved.png',
      'DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.hats&status=eq.approved', 'POST /rest/v1/traits',
      'DELETE /rest/v1/traits?id=eq.row-1', 'DELETE /storage/v1/object/traits']);
    expect(out.ret).toEqual({ ok: true, shared: true, reason: null });
    expect(st.unknown).toEqual([]);
  });

  /* 5. cloudTeam. The my_team answer that arrives after the page left for My
     page and came straight back was kept as the group's team. Measured on
     f5a23b8 (2 of 3 runs) and eaa3f75 (3 of 3): cloudTeamId "me" with
     activeWs "team7", the group's catch-up pulled My page's rows into its
     store, and Save to cloud PATCHed cme with the group's layers. Here the
     answer is held until the page is back, so the order is the same every
     run; run ten times, as the ruling asks. */
  /* Away: the page leaves for My page and asks its team there (my_team, held
     by the server); it comes back to team7 while that is still out, and only
     then does the answer ("me") arrive. */
  const awayAndBack = async (page, away) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: away ? { kind: 'myteam' } : null, move: false,
      act: away
        ? "cloudTeamId=null; const leaving=wsSwitch(null); const asking=cloudTeam(); await leaving; await asking; return 'asked';"
        : "cloudTeamId=null; const team=await cloudTeam(); return {team, cloudTeamId, activeWs};",
      during: away ? async (page) => { await page.evaluate(() => wsSwitch('team7')); } : null });
    return { st, out };
  };
  for (let i = 1; i <= 10; i++) {
    test('cloudTeam, run ' + i + ' of 10: away to My page and straight back while my_team is out - team7\'s store takes nothing of My page\'s, and no request names cme', async ({ page }) => {
      const { st, out } = await awayAndBack(page, true);
      expect(out.heldAt).toBe('myteam');
      await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
      /* only SET for the project it was read for: the late "me" is not kept */
      expect(await page.evaluate(() => ({ cloudTeamId, activeWs }))).not.toEqual({ cloudTeamId: 'me', activeWs: 'team7' });
      const mark = st.log.length;
      await page.evaluate(async () => { s0State = Object.assign({}, s0State, { at: 0 }); await cloudPush(); await cloudPull({ quiet: true }); });
      const after = st.log.slice(mark).map(e => e.m + ' ' + e.path);
      expect(after.filter(l => /cme|team_id=eq\.me\b|\/me\//.test(l))).toEqual([]);
      expect((await DUMP(page, 'chatnft.ws.team7')).filter(l => /row-me|mine-a/.test(l))).toEqual([]);
      expect(st.server.colls.cme.layers).toEqual(['mine-a', 'mine-b', 'hats', 'skins']);
      expect(await page.evaluate(async () => { const team = await cloudTeam(); return { team, cloudTeamId, activeWs }; }))
        .toEqual({ team: 'team7', cloudTeamId: 'team7', activeWs: 'team7' });
      expect(st.unknown).toEqual([]);
    });
  }
  test('THE CONTROL: cloudTeam on team7 with no move answers team7, and Save to cloud and a pull name c1', async ({ page }) => {
    const { st, out } = await awayAndBack(page, false);
    expect(out.ret).toEqual({ team: 'team7', cloudTeamId: 'team7', activeWs: 'team7' });
    const mark = st.log.length;
    await page.evaluate(async () => { s0State = Object.assign({}, s0State, { at: 0 }); await cloudPush(); await cloudPull({ quiet: true }); });
    const after = st.log.slice(mark).map(e => e.m + ' ' + e.path);
    expect(after.some(l => l.indexOf('PATCH /rest/v1/collections?id=eq.c1') === 0)).toBe(true);
    expect(after.filter(l => /cme/.test(l))).toEqual([]);
    expect(st.unknown).toEqual([]);
  });

  /* F1: A WEIGHT WHOSE SEND LANDED AFTER THE PAGE MOVED. Its mark was left
     in team7, so a teammate's removal of the row was undone by the next
     Save to cloud: the PATCH matched nothing, the picture was uploaded
     again and a new row posted (measured on f5a23b8). The mark is cleared
     in team7 now, by name, only if the record still holds what was written
     ahead of the send. */
  const weightLandsAway = (page, move, during) => run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'send' }, move, during,
    act: "return setRarity(await dbGet('t_cap_hats_wip'),50);" });
  const teammateRemovesThenPush = async (page, st) => {
    st.server.rows.delete('row-1'); st.server.files.delete('team7/c1/trait-cap-hats-wip.png');
    await page.evaluate(async () => { if (activeWs !== 'team7') await wsSwitch('team7'); await new Promise(r => setTimeout(r, 300)); });
    const mark = st.log.length;
    await page.evaluate(async () => { s0State = Object.assign({}, s0State, { at: 0 }); await cloudPush(); });
    return st.log.slice(mark).filter(e => /^(POST|PATCH|DELETE)$/.test(e.m) && e.path.indexOf('/rpc/') < 0 && e.path.indexOf('/object/list/') < 0).map(e => e.m + ' ' + e.path);
  };
  test('a weight whose send lands after the page moved, then a teammate removes the row: Save to cloud back in team7 does not bring it back', async ({ page }) => {
    const { st, out } = await weightLandsAway(page, true);
    expect([out.heldAt, out.moved, out.writes]).toEqual(['send', true, ['PATCH /rest/v1/traits?id=eq.row-1']]);
    const pushed = await teammateRemovesThenPush(page, st);
    expect(pushed.filter(l => /cap/.test(l) || l === 'POST /rest/v1/traits' || l.indexOf('row-1') >= 0)).toEqual([]);
    expect(st.server.snap().filter(r => r.indexOf('c1 cap') >= 0)).toEqual([]);
    /* why: the mark was cleared in team7 when the send landed */
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 50 hats synced]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same weight with no move, the same removal: Save to cloud does not bring it back', async ({ page }) => {
    const { st, out } = await weightLandsAway(page, false);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 50 hats synced]', 't_hat_hats_wip[row-2 1 hats synced]']);
    const pushed = await teammateRemovesThenPush(page, st);
    expect(pushed.filter(l => /cap/.test(l) || l === 'POST /rest/v1/traits' || l.indexOf('row-1') >= 0)).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  /* The compare-and-set can refuse: another tab reweights team7's cap while
     this send is out, and the mark it wrote is not cleared over. */
  test('THE CAS CAN REFUSE: team7\'s cap reweighted elsewhere while the moved weight\'s send is out - its mark is not cleared', async ({ page }) => {
    const { st, out } = await weightLandsAway(page, true, async (page) => {
      await page.evaluate(async () => {
        const d = await new Promise((res, rej) => { const r = indexedDB.open('chatnft.ws.team7', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE); const q = s.get('t_cap_hats_wip');
          q.onsuccess = () => s.put(Object.assign({}, q.result, { rarity: 60, synced: false, unsent: 'meta' })); t.oncomplete = res; t.onerror = () => rej(t.error); });
        d.close();
      });
    });
    expect([out.heldAt, out.moved, out.writes]).toEqual(['send', true, ['PATCH /rest/v1/traits?id=eq.row-1']]);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 60 hats unsent]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });

  /* A STATUS CHANGE THE PAGE LEFT DURING ITS SEND. During the row insert:
     the new row lands, the old one is not removed from here (cloudDropOne
     would file it in My page), and the person is told the old copy is still
     there (why.oldKept) - f5a23b8 said nothing. During the picture's upload:
     the row insert after it is held (a send after a wait), so there is no
     second row, and the reason is the move. */
  const statusAct = "const r=await setTraitStatus(await dbGet('t_cap_hats_wip'),'approved'); return {shared:r.shared===undefined?null:!!r.shared, oldKept:!!(r.why&&r.why.oldKept), reason:(r.why&&r.why.reason)||null};";
  test('a status change, the page moving during its row insert: the old copy is said to be still there', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'send' }, move: true, act: statusAct });
    expect([out.heldAt, out.moved]).toEqual(['send', true]);
    expect(out.ret).toEqual({ shared: true, oldKept: true, reason: null });
    expect(out.meSame).toBe(true);
    expect(namesMe(out)).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('a status change, the page moving during its picture\'s upload: no row insert after it, and the reason is the move', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'upload' }, move: true, act: statusAct });
    expect([out.heldAt, out.moved]).toEqual(['upload', true]);
    expect(out.writes).toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-approved.png']);
    expect(out.ret).toEqual({ shared: false, oldKept: false, reason: 'left' });
    expect(out.team7).toEqual(['t_cap_hats_approved[row-1 1 hats unsent]']);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same status change with no move: the new row in, the old one out, nothing kept', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'upload' }, move: false, act: statusAct });
    expect(out.ret).toEqual({ shared: true, oldKept: false, reason: null });
    expect(out.writes.filter(w => w.indexOf('POST /rest/v1/traits') === 0 || w.indexOf('DELETE /rest/v1/traits?id=eq.row-1') === 0))
      .toEqual(['POST /rest/v1/traits', 'DELETE /rest/v1/traits?id=eq.row-1']);
    expect(st.unknown).toEqual([]);
  });

  /* SAVE TO CLOUD THE PAGE LEFT. f5a23b8 said "Saved 6 to the cloud, 1 not
     tried - stopped" while all seven stayed unsent (measured). */
  const seven = [0, 1, 2, 3, 4, 5, 6].map(i => Object.assign({}, BASE, { id: 't_t' + i + '_hats_wip', name: 't' + i, layer: 'hats', status: 'wip', rarity: 1, synced: false }));
  test('Save to cloud, the page moving to My page during its first upload: it says it stopped because the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: seven, hold: { kind: 'upload' }, move: true, act: "s0State=Object.assign({},s0State,{at:0}); await cloudPush(); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['upload', true]);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_PUSH);
    expect(namesMe(out)).toEqual([]);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same Save to cloud with no move says what it saved', async ({ page }) => {
    const { st, out } = await run(page, { t7: seven, hold: { kind: 'upload' }, move: false, act: "s0State=Object.assign({},s0State,{at:0}); await cloudPush(); return 'done';" });
    expect(out.toasts[out.toasts.length - 1]).toBe('Saved 7 to the cloud');
    expect(out.team7.every(l => / synced\]$/.test(l))).toBe(true);
    expect(st.unknown).toEqual([]);
  });

  /* PROTOCOL 2 FROM A READ THE PAGE LEFT is remembered for the key it was
     read for - f5a23b8 returned before it was added. */
  test('a read that answers protocol 2 for team7, the page moving during it: team7 is remembered on protocol 2', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'read', answer: 2 }, move: true, act: "await s0Check(true); return [...s0Seen2];" });
    expect([out.heldAt, out.moved]).toEqual(['read', true]);
    expect(out.ret).toEqual(['chatnft.ws.team7|u1']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same read with no move is remembered too', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'read', answer: 2 }, move: false, act: "await s0Check(true); return [...s0Seen2];" });
    expect(out.ret).toEqual(['chatnft.ws.team7|u1']);
    expect(st.unknown).toEqual([]);
  });

  /* THE OTHER WAITS. The tests above move the page where the review
     measured it; these move it at the other waits a guard of fix round 4
     sits after - a read of the store, the redraw, the sign-in headers, the
     removal list - by holding the n-th call of that function made after the
     action starts (window.__gate), then moving. Each guard here survived
     its removal before these were added (the calibration). */
  /* via: count only the calls made from that function (its name in the call's
     stack), so a background call of the same helper cannot take the hold. */
  const at = (fn, nth, act, via) => "(()=>{ const real=" + fn + "; let n=0; " + fn + "=async (...a)=>{ " + (via ? "if(String(new Error().stack).indexOf('" + via + "')<0) return real(...a); " : "") + "const r=await real(...a); if(++n===" + nth + "){ " + fn + "=real; await new Promise(res=>{ window.__gate=res; }); } return r; }; })(); " + act;
  test('a shelf move, the page moving during its read of the store: nothing written into My page, nothing sent, and it says so', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true, act: at('dbAll', 1, "return commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_UNMADE);
    expect(out.team7).toEqual(['t_cap_skins_approved[row-1 1 skins synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same shelf move, its read held with no move, is sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: false, act: at('dbAll', 1, "return commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });") });
    expect(out.writes).toEqual(['POST /rest/v1/rpc/reorder_traits @c1']);
    expect(out.ret).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('a batch move, the page moving during its read of the store: nothing written into My page, nothing sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7SKIN], move: true, act: at('dbAll', 1, "shelfPick.clear(); shelfPick.add('row-1'); return bulkMoveToLayer('hats');") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_UNMADE);
    expect(st.unknown).toEqual([]);
  });
  test('a weight, the page moving during its read of the record: nothing written into My page\'s cap, nothing sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true, act: at('dbGet', 1, "return setRarity(await (async()=>({ ...(" + JSON.stringify({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, rowId: 'row-1', synced: true }) + ") }))(), 50);") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_UNMADE);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same weight, its read held with no move, is written and sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false, act: at('dbGet', 1, "return setRarity(await (async()=>({ ...(" + JSON.stringify({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, rowId: 'row-1', synced: true }) + ") }))(), 50);") });
    expect(out.writes).toEqual(['PATCH /rest/v1/traits?id=eq.row-1']);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 50 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('a status change, the page moving during its read of the record: nothing written into My page, nothing sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true, act: at('dbGet', 1, "const r=await setTraitStatus(" + JSON.stringify(Object.assign({}, { id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip' })) + ",'approved'); return {ok:r.ok, left:!!r.left};") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toEqual({ ok: false, left: true });
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('the layer list, the page moving during its redraw: not sent, it says so, and it answers not shared', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true, act: at('renderShelf', 1, "LAYERS=['hats','team7-new','unsorted']; sharedLayerSig=null; return saveLayers();") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.toasts).toEqual([S0_LEFT_SENT]);
    expect(st.unknown).toEqual([]);
  });
  test('the rules, the page moving during their read of the answers, which brings a teammate\'s: My page\'s answers are not written', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'answers' }, move: true, c1Decisions: [{ a: 'hats/x', b: 'hats/y', ok: true, at: 5, by: 'u9', src: 'them' }],
      act: "RULES=[['hats/cap','hats/team7']]; sharedRuleSig=null; return shareRules();" });
    expect([out.heldAt, out.moved]).toEqual(['answers', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same rules with no move take the teammate\'s answer and are sent', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'answers' }, move: false, c1Decisions: [{ a: 'hats/x', b: 'hats/y', ok: true, at: 5, by: 'u9', src: 'them' }],
      act: "RULES=[['hats/cap','hats/team7']]; sharedRuleSig=null; return shareRules();" });
    expect(out.writes).toEqual(['PATCH /rest/v1/collections?id=eq.c1']);
    expect(out.ret).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('cloudTeam, the page moving to My page during its sign-in headers: nothing is kept, and team7 answers team7 on return', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true, act: at('sbHeaders', 1, "cloudTeamId=null; const t=await cloudTeam(); return t;") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.ret).toBe(null);
    expect(await page.evaluate(async () => { await wsSwitch('team7'); const team = await cloudTeam(); return { team, cloudTeamId }; })).toEqual({ team: 'team7', cloudTeamId: 'team7' });
    expect(st.unknown).toEqual([]);
  });
  /* The other half of "only set, and only trusted, for the project it was
     read for": a team kept for My page is not trusted on team7. */
  test('cloudTeam does not trust a team kept for another store: on team7, a kept "me" answers team7', async ({ page }) => {
    const { st } = await run(page, { t7: [T7CAP], move: false, act: "window.__gate=()=>{}; return 'set up';" });
    expect(await page.evaluate(async () => { cloudTeamId = 'me'; try { cloudTeamFor = 'pixelbench|u1'; } catch (_) {} return cloudTeam(); })).toBe('team7');
    expect(st.unknown).toEqual([]);
  });
  test('a weight sent on its own, the page moving during its headers after the read: no PATCH', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { rarity: 5, synced: false, unsent: 'meta' })], move: true,
      act: at('sbHeaders', 2, "return cloudPatchOne(await dbGet('t_cap_hats_wip'));") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('a group save, the page moving during its upload headers after the read: nothing uploaded', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { synced: false })], move: true,
      act: at('sbHeaders', 2, "const why={}; const ok=await cloudSyncOne(await dbGet('t_cap_hats_wip'),{u:{id:'u1'},team:'team7',c:{id:'c1'}},why); return {ok:!!ok, reason:why.reason||null};") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.writes).toEqual([]);
    expect(out.ret).toEqual({ ok: false, reason: 'left' });
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('a removal on My page, the page moving to team7 during its read of the removal list: nothing filed in team7, and it says so', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false, startMe: true,
      during: async (page) => { await page.evaluate(() => wsSwitch('team7')); },
      act: at('goneLoad', 1, "const why={}; const r=await dbDelShared(await dbGet('t_cap_skins_approved'),undefined,why); return {r, left:!!why.left};", 'goneAdd') });
    expect(out.heldAt).toBe('gate');
    expect(out.ret).toEqual({ r: false, left: true });
    expect((await DUMP(page, 'chatnft.ws.team7')).filter(l => l.indexOf('settings.gone') === 0)).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  /* s0Blocked and s0Recheck ask home BEFORE their read as well: once the page
     has left, no read is made of the store moved to (My page, team "me"). */
  test('the layer list, the page moving during its collection lookup: no protocol read of My page is made for it', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'coll', team: 'team7' }, move: true,
      act: "LAYERS=['hats','team7-new','unsorted']; sharedLayerSig=null; return saveLayers();" });
    expect([out.heldAt, out.moved, out.ret]).toEqual(['coll', true, false]);
    expect(out.reads.filter(t => t === 'me')).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('a weight refused after the page moved during its send: judged for team7, with no protocol read of My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], hold: { kind: 'send' }, move: true, refuseSend: true,
      act: "return setRarity(await dbGet('t_cap_hats_wip'),50);" });
    expect([out.heldAt, out.moved]).toEqual(['send', true]);
    expect(out.reads.filter(t => t === 'me')).toEqual([]);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 50 hats unsent]', ]);
    expect(st.unknown).toEqual([]);
  });

  /* The editor's save: the reads before its write (the store, the record,
     the clash test) each wait. */
  const editorSave = (gate) => "await openTraitRecord(await dbGet('t_cap_hats_wip')); " + gate + " return saveTraitNow();";
  test('the editor\'s save, the page moving during its read of the store: nothing written into My page, nothing sent, and it says so', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: true,
      act: editorSave("(()=>{ const real=dbAll; dbAll=async (...a)=>{ const r=await real(...a); dbAll=real; await new Promise(res=>{ window.__gate=res; }); return r; }; })();") });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.meSame).toBe(true);
    expect(out.writes).toEqual([]);
    expect(out.ret).toBe(false);
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_UNMADE);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same editor save, its read held with no move, is written and sent to team7', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP], move: false,
      act: editorSave("(()=>{ const real=dbAll; dbAll=async (...a)=>{ const r=await real(...a); dbAll=real; await new Promise(res=>{ window.__gate=res; }); return r; }; })();") });
    expect(out.ret).toBe(true);
    expect(out.writes.some(w => w.indexOf('POST /storage/v1/object/traits/team7/c1/') === 0)).toBe(true);
    expect(st.unknown).toEqual([]);
  });

  /* CLEAR (fix round 4, found by the enumeration, not by the review): it
     reads the protocol, asks, then removes every trait of the store shown.
     The page moving to My page during that read removed My page's traits
     on f5a23b8 (measured by this test). */
  const clearAct = "window.confirm=()=>true; await document.getElementById('clearproj').onclick(); return 'done';";
  test('Clear, the page moving to My page during its read: nothing is removed from My page', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'read' }, move: true, act: clearAct });
    expect([out.heldAt, out.moved]).toEqual(['read', true]);
    expect(out.meSame).toBe(true);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-1 1 hats synced]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(out.writes).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same Clear with no move removes team7\'s traits here, and nothing of My page\'s', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP, T7HAT], hold: { kind: 'read' }, move: false, act: clearAct });
    expect(out.meSame).toBe(true);
    expect(out.team7).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
});

/* Close fixes: AN INSERT IS ITS DELETE'S OTHER HALF. cloudSyncOne sends
   DELETE (the record's row) and then the insert that puts the row back.
   Fix round 4 asked for the whole home before the insert as before every
   send after a wait, so a move while the DELETE (or a retry's wait) was out
   held the insert: the group was left with no row for the trait, and the
   person was told the change was not sent (measured by the final review,
   probe save_del_m, 3 of 3). The insert's target and body were all fixed
   before the DELETE - an addressed send - so a move no longer stops it. The
   record's "sent" write still does not follow the page (Ruling 2 of fix
   round 3): it stays unsent where it was made, and its next Save to cloud
   replaces the row. The checks before the upload and before the DELETE stay:
   a move during the attempt note sends no DELETE. team7's cap is edited
   here, unsent, on the row U1 the server holds; the ids are made up. */
const U1 = '00000000-0000-4000-8000-00000000c0f1';
const T7EDIT = Object.assign({}, T7CAP, { rowId: U1, synced: false, at: 2000 });
const insertOf = (st) => st.log.filter(e => e.m === 'POST' && e.path === '/rest/v1/traits')
  .map(e => { const x = JSON.parse(e.body)[0]; return { collection_id: x.collection_id, team_id: x.team_id, name: x.name, replaces: x.replaces || null }; });
const saveAct = "const why={}; const ok=await cloudSyncOne(await dbGet('t_cap_hats_wip'),{home:s0HomeNow()},why); return {ok:!!ok, reason:why.reason||null};";
const SAVED = ['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-wip.png', 'DELETE /rest/v1/traits?id=eq.' + U1, 'POST /rest/v1/traits'];
const INTO_C1 = [{ collection_id: 'c1', team_id: 'team7', name: 'cap', replaces: U1 }];

test.describe('stage 0 (close fixes): an insert is its DELETE\'s other half', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { try { activeWs = null; localStorage.removeItem('chatnft.session'); } catch (_) {} }).catch(() => {});
  });

  test('a group save, the page moving to My page while its row DELETE is out: the insert still goes into team7, naming the row it replaces', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT], hold: { kind: 'rowdel', id: U1 }, move: true, act: saveAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', true]);
    expect(out.writes).toEqual(SAVED);
    expect(insertOf(st)).toEqual(INTO_C1);
    expect(out.server, 'the group has the trait').toEqual(ME_ROWS.concat(['row-new-1{c1 cap/hats/wip r1}']).sort());
    expect(out.ret).toEqual({ ok: true, reason: null });
    expect(namesMe(out)).toEqual([]);
    expect(out.meSame).toBe(true);
    /* Ruling 2 of fix round 3: the "sent" write does not follow the page. */
    expect(out.team7).toEqual(['t_cap_hats_wip[' + U1 + ' 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same save, its row DELETE held and released with no move: the insert goes, and the record is synced to the new row', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT], hold: { kind: 'rowdel', id: U1 }, move: false, act: saveAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', false]);
    expect(out.writes).toEqual(SAVED);
    expect(insertOf(st)).toEqual(INTO_C1);
    expect(out.server).toEqual(ME_ROWS.concat(['row-new-1{c1 cap/hats/wip r1}']).sort());
    expect(out.ret).toEqual({ ok: true, reason: null });
    expect(out.team7).toEqual(['t_cap_hats_wip[row-new-1 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('the page moving to My page during the attempt note: no row DELETE and no insert - the group keeps its row, and it says the page left', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT], move: true,
      act: "(()=>{ const real=s0Attempted; s0Attempted=async (...a)=>{ const r=await real(...a); s0Attempted=real; await new Promise(res=>{ window.__gate=res; }); return r; }; })(); " + saveAct });
    expect([out.heldAt, out.moved]).toEqual(['gate', true]);
    expect(out.writes).toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-wip.png']);
    expect(out.server).toEqual(ME_ROWS.concat([U1 + '{c1 cap/hats/wip r1}']).sort());
    expect(out.ret).toEqual({ ok: false, reason: 'left' });
    expect(out.meSame).toBe(true);
    expect(out.team7).toEqual(['t_cap_hats_wip[' + U1 + ' 1 hats unsent]']);
    expect(st.unknown).toEqual([]);
  });
  test('the editor\'s save, the page moving to My page while its row DELETE is out: it says the save reached the group, and the group has it', async ({ page }) => {
    const { st, out } = await run(page, { t7: [Object.assign({}, T7CAP, { rowId: U1 })], hold: { kind: 'rowdel', id: U1 }, move: true,
      act: "await openTraitRecord(await dbGet('t_cap_hats_wip')); return saveTraitNow();" });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', true]);
    expect(out.ret).toBe(true);
    expect(insertOf(st)).toEqual(INTO_C1);
    expect(out.server).toEqual(ME_ROWS.concat(['row-new-1{c1 cap/hats/wip r1}']).sort());
    const said = out.toasts.filter(t => /^Saved cap/.test(t));
    expect(said.length, JSON.stringify(out.toasts)).toBe(1);
    expect(said[0]).toMatch(/^Saved cap and shared it with the group/);
    expect(out.toasts.filter(t => /not sent/i.test(t)), 'no "not sent" words').toEqual([]);
    expect(out.meSame).toBe(true);
    expect(namesMe(out)).toEqual([]);
    expect(st.unknown).toEqual([]);
  });
  test('Save to cloud, the page moving to My page while its row DELETE is out: the insert still goes into team7, and it says the push stopped', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT, T7HAT], hold: { kind: 'rowdel', id: U1 }, move: true,
      act: "s0State=Object.assign({},s0State,{at:0}); await cloudPush(); return 'done';" });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', true]);
    expect(insertOf(st)).toEqual(INTO_C1);
    expect(out.server).toEqual(ME_ROWS.concat(['row-2{c1 hat/hats/wip r1}', 'row-new-1{c1 cap/hats/wip r1}']).sort());
    expect(out.toasts[out.toasts.length - 1]).toBe(S0_LEFT_PUSH);
    expect(out.meSame).toBe(true);
    expect(namesMe(out)).toEqual([]);
    expect(out.team7).toEqual(['t_cap_hats_wip[' + U1 + ' 1 hats unsent]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same Save to cloud with no move saves it, and the record is synced to the new row', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT, T7HAT], hold: { kind: 'rowdel', id: U1 }, move: false,
      act: "s0State=Object.assign({},s0State,{at:0}); await cloudPush(); return 'done';" });
    expect(insertOf(st)).toEqual(INTO_C1);
    expect(out.toasts[out.toasts.length - 1]).toMatch(/^Saved 1 to the cloud/);
    expect(out.team7).toEqual(['t_cap_hats_wip[row-new-1 1 hats synced]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(st.unknown).toEqual([]);
  });
  /* THE ACCOUNT STILL STOPS IT. The insert's headers carry the session that
     signed out; sending with them is not decided here, so a sign-out while
     the DELETE is out holds the insert as before - the group has no row for
     cap until the next Save to cloud. Pinned so a ruling that changes it
     changes this test with it. */
  test('a sign-out while the row DELETE is out: the insert is not sent with the session that ended (kept as before, for a ruling)', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7EDIT], hold: { kind: 'rowdel', id: U1 }, move: false,
      during: (pg) => pg.evaluate(() => cloudSignOut()), act: saveAct });
    expect(out.heldAt).toBe('rowdel');
    expect(out.writes).toEqual(SAVED.slice(0, 2));
    expect(out.server).toEqual(ME_ROWS);
    expect(out.ret).toEqual({ ok: false, reason: 'left' });
    expect(st.unknown).toEqual([]);
  });
});

/* Close fix 3: AN INSERT IS ITS DELETE'S OTHER HALF ONLY WHEN THE DELETE
   TOOK A ROW. Close fix 1's premise is false for every move made through
   cloudMoveOne - a layer rename or removal, a batch move, a sort, an editor
   save that changes the status or the name. Its copy carries no row id, so
   its DELETE is by the destination's name, layer and status and usually
   removes nothing; the old row is removed afterwards by cloudDropOne, which
   a move skips. So a move while that DELETE was out let the insert land,
   the group kept both rows, and Save to cloud never removed the old one
   (measured by the close-fix review at 512a9ce: a rename hats to caps ended
   with cap on both layers; an editor status change wip to approved ended
   with both rows and said "so the group has it twice"). The insert now asks
   for the account only when its DELETE took a row, and for the whole home
   when it took none; an answer that cannot say what it took counts as
   taken. Here team7's cap is on row U1 and hat on row-2; the DELETE held is
   the first row DELETE the action sends - the destination's, by name. After
   the move, the page goes back to team7 (the catch-up) and Save to cloud is
   pressed: the group must end with one row for cap, where the action put
   it, and nothing of My page's touched. */
const T7CAP_U1 = Object.assign({}, T7CAP, { rowId: U1 });
const renameAct = "window.confirm=()=>true; await renameLayer('hats','caps'); return 'done';";
const statusEditAct = "await openTraitRecord(await dbGet('t_cap_hats_wip')); await new Promise(r=>setTimeout(r,300));"
  + " setChip('tstatus','approved'); return saveTraitNow();";
const capRows = (server) => server.filter(r => r.indexOf('{c1 cap/') >= 0);
/* Back to team7, its catch-up let finish, then Save to cloud: what each
   request did, the server, both stores. */
const backAndPush = async (page, st) => {
  const mark = st.log.length;
  await page.evaluate(async () => {
    window.__toasts = [];
    await wsSwitch('team7');
    if (typeof catchUpFlight !== 'undefined' && catchUpFlight) { try { await catchUpFlight; } catch (_) {} }
  });
  await sleep(500);
  const returned = { server: st.server.snap(), team7: (await DUMP(page, 'chatnft.ws.team7')).filter(l => l.indexOf('t_') === 0) };
  await page.evaluate(async () => { s0State = Object.assign({}, s0State, { at: 0 }); await cloudPush(); });
  await sleep(300);
  return {
    returned,
    writes: st.log.slice(mark).filter(e => /^(POST|PATCH|DELETE)$/.test(e.m) && e.path.indexOf('/rpc/') < 0 && e.path.indexOf('/object/list/') < 0)
      .map(e => e.m + ' ' + e.path.replace(/&select=.*$/, '')),
    toasts: await page.evaluate(() => window.__toasts.slice()),
    server: st.server.snap(),
    team7: (await DUMP(page, 'chatnft.ws.team7')).filter(l => l.indexOf('t_') === 0),
    me: await DUMP(page, 'pixelbench'),
  };
};

test.describe('stage 0 (close fix 3): an insert is its DELETE\'s other half only when the DELETE took a row', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { try { activeWs = null; localStorage.removeItem('chatnft.session'); } catch (_) {} }).catch(() => {});
  });

  test('a layer rename, the page moving to My page while cap\'s destination DELETE is out: no insert, and after the return and a Save to cloud the group has one row for cap, on caps', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_U1, T7HAT], hold: { kind: 'rowdel' }, move: true, act: renameAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', true]);
    /* The action: cap's picture, its destination DELETE (which took
       nothing), and no insert - the group keeps the row it had. */
    expect.soft(out.writes, 'the insert is held').toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-caps-wip.png',
      'DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.caps&status=eq.wip']);
    expect.soft(out.server, 'the group keeps its rows').toEqual(ME_ROWS.concat([U1 + '{c1 cap/hats/wip r1}', 'row-2{c1 hat/hats/wip r1}']).sort());
    expect.soft(out.toasts[out.toasts.length - 1]).toBe('Stopped part way: you left the project. What was done is kept there');
    expect(out.meSame).toBe(true);
    expect(namesMe(out)).toEqual([]);
    const me = await DUMP(page, 'pixelbench');
    const after = await backAndPush(page, st);
    /* Save to cloud removes the old row and puts cap on caps. */
    expect.soft(after.writes, 'the push replaces the old row').toContain('DELETE /rest/v1/traits?id=eq.' + U1);
    expect(capRows(after.server), 'one row for cap').toEqual(['row-new-1{c1 cap/caps/wip r1}']);
    expect(after.server).toEqual(ME_ROWS.concat(['row-2{c1 hat/hats/wip r1}', 'row-new-1{c1 cap/caps/wip r1}']).sort());
    expect(after.team7).toEqual(['t_cap_caps_wip[row-new-1 1 caps synced]', 't_hat_hats_wip[row-2 1 hats synced]']);
    expect(after.writes.filter(w => /cme|\/me\//.test(w)), 'nothing sent to My page').toEqual([]);
    expect(after.me, 'nothing written in My page').toEqual(me);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same rename, cap\'s destination DELETE held and released with no move: both traits move, one row each', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_U1, T7HAT], hold: { kind: 'rowdel' }, move: false, act: renameAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', false]);
    expect(out.toasts[out.toasts.length - 1]).toBe('Renamed to caps, 2 traits moved');
    expect(capRows(out.server)).toEqual(['row-new-1{c1 cap/caps/wip r1}']);
    expect(out.server).toEqual(ME_ROWS.concat(['row-new-1{c1 cap/caps/wip r1}', 'row-new-2{c1 hat/caps/wip r1}']).sort());
    expect(out.team7).toEqual(['t_cap_caps_wip[row-new-1 1 caps synced]', 't_hat_caps_wip[row-new-2 1 caps synced]']);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  test('the editor\'s save of a status change wip to approved, the page moving to My page while its destination DELETE is out: no insert, it says not sent, and after the return and a Save to cloud the group has one row for cap, approved', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_U1], hold: { kind: 'rowdel' }, move: true, act: statusEditAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', true]);
    expect.soft(out.writes, 'the insert is held').toEqual(['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-approved.png',
      'DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.hats&status=eq.approved']);
    expect.soft(out.server, 'the group keeps its row').toEqual(ME_ROWS.concat([U1 + '{c1 cap/hats/wip r1}']).sort());
    const said = out.toasts.filter(t => /^Saved cap/.test(t));
    expect.soft(said, JSON.stringify(out.toasts)).toEqual(['Saved cap here only - not sent: you left the project first. The change is kept there, and its next Save to cloud sends it.']);
    expect(out.meSame).toBe(true);
    expect(namesMe(out)).toEqual([]);
    const me = await DUMP(page, 'pixelbench');
    const after = await backAndPush(page, st);
    expect.soft(after.writes, 'the push replaces the old row').toContain('DELETE /rest/v1/traits?id=eq.' + U1);
    expect(capRows(after.server), 'one row for cap').toEqual(['row-new-1{c1 cap/hats/approved r1}']);
    expect(after.team7).toEqual(['t_cap_hats_approved[row-new-1 1 hats synced]']);
    expect(after.writes.filter(w => /cme|\/me\//.test(w)), 'nothing sent to My page').toEqual([]);
    expect(after.me, 'nothing written in My page').toEqual(me);
    expect(st.unknown).toEqual([]);
  });
  test('THE CONTROL: the same status change, its destination DELETE held and released with no move: the new row in, the old one out, one row', async ({ page }) => {
    const { st, out } = await run(page, { t7: [T7CAP_U1], hold: { kind: 'rowdel' }, move: false, act: statusEditAct });
    expect([out.heldAt, out.moved]).toEqual(['rowdel', false]);
    expect(out.ret).toBe(true);
    expect(capRows(out.server)).toEqual(['row-new-1{c1 cap/hats/approved r1}']);
    const said = out.toasts.filter(t => /^Saved cap/.test(t));
    expect(said.length, JSON.stringify(out.toasts)).toBe(1);
    expect(said[0]).toMatch(/^Saved cap and shared it with the group/);
    expect(said[0]).not.toMatch(/twice/);
    expect(out.team7).toEqual(['t_cap_hats_approved[row-new-1 1 hats synced]']);
    expect(out.meSame).toBe(true);
    expect(st.unknown).toEqual([]);
  });
  /* WHAT CANNOT SAY WHAT IT TOOK COUNTS AS TAKEN. The row DELETE of a group
     save removes the row and its answer is lost - a 502, or a 200 that is
     not JSON - while the page moves: the row may be gone, so the insert
     still goes, as close fix 1 has it, and the group has the trait. */
  for (const [answer, words] of [['bad', 'a 502'], ['garbled', 'a 200 that is not JSON']]) {
    test('a group save whose row DELETE answers ' + words + ' while the page moves to My page: counted as taken - the insert still goes into team7, and the group has the trait', async ({ page }) => {
      const { st, out } = await run(page, { t7: [T7EDIT], hold: { kind: 'rowdel', id: U1 }, move: true, rowdelAnswer: answer, act: saveAct });
      expect([out.heldAt, out.moved, st.rowdelAnswered]).toEqual(['rowdel', true, true]);
      expect(out.writes).toEqual(SAVED);
      expect(insertOf(st)).toEqual(INTO_C1);
      expect(out.server).toEqual(ME_ROWS.concat(['row-new-1{c1 cap/hats/wip r1}']).sort());
      expect(out.ret).toEqual({ ok: true, reason: null });
      expect(namesMe(out)).toEqual([]);
      expect(out.meSame).toBe(true);
      expect(st.unknown).toEqual([]);
    });
  }
});
