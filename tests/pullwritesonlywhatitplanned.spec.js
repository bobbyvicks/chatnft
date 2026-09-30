/* FOLLOW-UP A (patch608): A PULL WRITES ONLY WHAT IT PLANNED.

   A pull plans from one read of the store (dbAll) and writes hundreds of
   awaits later. Another tab of the same group can change a record in
   between. Stage 0 checks the plan before a re-id (s0ReidTx asks
   s0SameAsPlanned), but:
   - S3 / I7: s0SameAsPlanned compared only sameRepair's eleven fields and
     `at`. Another tab's write of a field outside them - s0Replaces, the
     pairing a folder import's s0StandsIn writes when the server cannot be
     told - was written over by the re-id.
   - S5: the same-id repair write (a teammate reweighted the row, no move)
     had no plan check at all: another tab's unsent weight made during the
     pull was written over, and a trait another tab moved to a new id was
     written back under the old one - two records for one row.
   - S4: the touchedSince re-ask after the C3 wait (the re-id waits for a
     closing save) had no spec that fails without it. The widened plan check
     sees every write that has LANDED; the re-ask is what sees a write this
     tab has begun (touched) and not yet landed. The spec below is that case:
     a status change started during the wait, its write landing after the
     re-id asked.
   Fix round 1 (the review of 3dd65bb; both older than stage 0):
   - P1: the pull's DOWNLOAD of a teammate's edit over this device's synced
     copy (a new row with the trait's name, layer and status) was planned
     from that copy and written after the picture download - the longest
     wait in a pull - with no plan check. Another tab's unsent weight made
     during the download was written over and marked synced, and nothing
     said a clash.
   - F2: when such a teammate's row finds the copy holding unsent work, the
     pull counts a clash and says "kept" - and its merge took the row's
     rarity and shelf_order over the unsent ones. The weight was lost under a
     message saying it was kept.

   Two tabs of one group share THE SERVER HERE, in node, behind a route on
   the context (t11r3/probe/probe.cjs's stateful server, ported): rows,
   pictures and one collection (c1, team7); every write moves the row's
   updated_at; a row insert that takes an identity already taken is refused
   409, as the unique index does. A request it does not name is answered 501
   and fails the test. Names, ids, uids and tokens are made up. */
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
   delete, upload, rpc, download (a picture's GET; fix round 1). tab: 'A' or
   'B', the page that asked. */
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
      if (m === 'GET') { const f = await gate('download', e, null); if (f) return failed(f); return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PX }); }
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

/* This tab's pull, held at the write it planned: the loop's sameRepair call
   arms it, and the next db() - the re-id's, or the same-id write's - waits
   (stage0stamps' two-tab harness). */
const holdPull = (page) => page.evaluate(() => {
  window.__held = false;
  let open; const gate = new Promise(r => { open = r; }); window.__open = open;
  const same = sameRepair, getDb = db; let armed = false;
  window.__restore = () => { sameRepair = same; db = getDb; };
  sameRepair = (x, y) => { armed = true; return same(x, y); };
  db = () => { const p = getDb(); if (armed) { armed = false; window.__held = true; return gate.then(() => p); } return p; };
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  window.__pull = cloudPull({ quiet: true }).catch(e => 'pull error ' + e);
});
const releasePull = (page) => page.evaluate(async () => { window.__open(); const r = await window.__pull; window.__restore(); await new Promise(res => setTimeout(res, 300)); return r === undefined || r instanceof Set ? 'done' : String(r); });
const pullAgain = (page) => page.evaluate(async () => { activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; await cloudPull({ quiet: true }); });

/* The other tab's change, while this tab's pull is held at its write. */
async function acrossHeldPull(page, context, what) {
  await seed(page, [CAP]);
  const B = await secondTab(page, context, st);
  await holdPull(page);
  await until(() => page.evaluate(() => window.__held), 'this tab\'s pull to reach its write');
  let other = null;
  if (what === 'pairing') {
    /* A folder import's moved file names the row it stands in for; the
       server cannot be told (the PATCH is answered 503), so the record
       keeps it. (A dropped connection is not used here: s0StandsIn's fetch
       throws past its write, and nothing is kept - measured on 91eb861,
       reported with this batch.) */
    st.rules.push({ kind: 'patch', tab: 'B', fail: 503, once: false });
    other = await B.evaluate(async (ROW0) => String(await s0StandsIn({ rowId: ROW0 }, 't_cap_hats_wip')), ROW0);
  }
  if (what === 'weight') {
    st.rules.push({ kind: 'patch', tab: 'B', fail: 'network', once: false });
    other = await B.evaluate(async () => String(await setRarity(await dbGet('t_cap_hats_wip'), 5)));
  }
  if (what === 'approve') {
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    other = await B.evaluate(async () => { const r = await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); return !!(r && r.ok); });
  }
  const afterOther = await traits(B);
  const pulled = await releasePull(page);
  const afterThisPull = await traits(page);
  await pullAgain(page);
  const afterTheNext = await traits(page);
  await B.close();
  return { other, afterOther, pulled, afterThisPull, afterTheNext };
}

test.describe('follow-up A: a pull writes only what it planned', () => {
  /* S3 / I7. The server moved row-1 from hats to hair, so the pull re-ids
     the trait; the other tab's pairing lands first. */
  test('S3: another tab\'s pairing (s0Replaces), written while this tab\'s pull is about to re-id the trait, is kept', async ({ page, context }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hair', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await acrossHeldPull(page, context, 'pairing');
    expect(r.afterOther, 'the other tab kept the pairing (precondition)').toEqual(['t_cap_hats_wip[row-1 hats wip 1 synced replaces=' + ROW0 + ']']);
    expect(r).toEqual({ other: 'false', afterOther: r.afterOther, pulled: 'done',
      afterThisPull: ['t_cap_hats_wip[row-1 hats wip 1 synced replaces=' + ROW0 + ']'],
      afterTheNext: ['t_cap_hair_wip[row-1 hair wip 1 synced replaces=' + ROW0 + ']'] });
  });

  test('S3, the control: the other tab doing nothing, the re-id goes ahead', async ({ page, context }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hair', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await acrossHeldPull(page, context, 'none');
    expect(r).toEqual({ other: null, afterOther: ['t_cap_hats_wip[row-1 hats wip 1 synced]'], pulled: 'done',
      afterThisPull: ['t_cap_hair_wip[row-1 hair wip 1 synced]'], afterTheNext: ['t_cap_hair_wip[row-1 hair wip 1 synced]'] });
  });

  /* S5. The server reweighted row-1 (4) and moved nothing, so the pull
     writes the trait under its own id. */
  test('S5: another tab\'s unsent weight, made while this tab\'s pull is about to write the trait under its own id, is kept', async ({ page, context }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 4, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await acrossHeldPull(page, context, 'weight');
    expect(r.afterOther, 'the other tab\'s weight is unsent (precondition)').toEqual(['t_cap_hats_wip[row-1 hats wip 5 unsent]']);
    expect(r).toEqual({ other: 'true', afterOther: r.afterOther, pulled: 'done',
      afterThisPull: ['t_cap_hats_wip[row-1 hats wip 5 unsent]'], afterTheNext: ['t_cap_hats_wip[row-1 hats wip 5 unsent]'] });
  });

  test('S5: another tab approves the trait (unsent) while this tab\'s pull is about to write it under its old id: one record for the row', async ({ page, context }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 4, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await acrossHeldPull(page, context, 'approve');
    expect(r.afterOther, 'the other tab moved it, unsent (precondition)').toEqual(['t_cap_hats_approved[row-1 hats approved 1 unsent]']);
    expect(r).toEqual({ other: true, afterOther: r.afterOther, pulled: 'done',
      afterThisPull: ['t_cap_hats_approved[row-1 hats approved 1 unsent]'], afterTheNext: ['t_cap_hats_approved[row-1 hats approved 1 unsent]'] });
  });

  test('S5, the control: the other tab doing nothing, the same-id write goes ahead', async ({ page, context }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 4, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await acrossHeldPull(page, context, 'none');
    expect(r).toEqual({ other: null, afterOther: ['t_cap_hats_wip[row-1 hats wip 1 synced]'], pulled: 'done',
      afterThisPull: ['t_cap_hats_wip[row-1 hats wip 4 synced]'], afterTheNext: ['t_cap_hats_wip[row-1 hats wip 4 synced]'] });
  });

  /* S3's rule, one comparison at a time: the picture by size and type (two
     reads of one record never hold the same Blob object), every other field
     by value, absent and null alike. */
  test('S3: the plan check compares every stored field, and the picture by size and type, never by object', async ({ page }) => {
    await seed(page, [Object.assign({}, CAP, { s0Replaces: ROW0 })]);
    const r = await page.evaluate(async () => {
      const a = await dbGet('t_cap_hats_wip'), b = await dbGet('t_cap_hats_wip');
      const w = (o) => Object.assign({}, a, o);
      return {
        twoReads: a.blob !== b.blob && s0SameAsPlanned(a, b),
        nullIsAbsent: s0SameAsPlanned(w({ note: null }), b),
        pairing: s0SameAsPlanned(w({ s0Replaces: 'another' }), b),
        stamp: s0SameAsPlanned(w({ wk: 'person' }), b),
        owner: s0SameAsPlanned(w({ by: 'u2' }), b),
        localId: s0SameAsPlanned(w({ lid: 'l_other' }), b),
        size: s0SameAsPlanned(w({ w: 17 }), b),
        unsentWord: s0SameAsPlanned(w({ unsent: 'meta' }), b),
        pictureBytes: s0SameAsPlanned(w({ blob: new Blob([new Uint8Array(17)], { type: 'image/png' }) }), b),
        pictureType: s0SameAsPlanned(w({ blob: new Blob([new Uint8Array(16)], { type: 'image/webp' }) }), b),
        noPicture: s0SameAsPlanned(w({ blob: null }), b),
        gone: s0SameAsPlanned(null, b),
      };
    });
    expect(r).toEqual({ twoReads: true, nullIsAbsent: true, pairing: false, stamp: false, owner: false, localId: false, size: false,
      unsentWord: false, pictureBytes: false, pictureType: false, noPicture: false, gone: false });
  });

  /* S4. THE RE-ASK AFTER THE C3 WAIT. The re-id waits for a closing save of
     the trait's drawing (adjudication C3). During that wait this tab starts
     a status change of the trait: it has touched the old id, and its write
     waits (here, for its store connection) until after the re-id has asked.
     The plan check cannot see a write that has not landed; the re-ask can.
     Without it the re-id goes ahead, the status change then lands under the
     new status, and the store holds two records for row-1. */
  test('S4: a status change begun during the re-id\'s wait for the closing save, landing after the re-id asked: the re-id is skipped, one record for the row', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hair', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    st.rules.push({ kind: 'upload', fail: 'network', once: false });   /* the status change's upload fails: it stays unsent */
    await seed(page, [CAP, { id: 'autosave.t_cap_hats_wip', kind: 'autosave', traitId: 't_cap_hats_wip', name: 'g.png', w: 16, h: 16, at: 9, by: 'u1', wk: 'person' }]);
    const r = await page.evaluate(async () => {
      /* The editor holds the trait, drawn on since it was opened; its closing save is held in its encode. */
      const n = 16, dd = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
      fileName = 'cap.png';
      startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
      openRec = await dbGet('t_cap_hats_wip');
      savedSig = 'drawn on since it was opened';
      const encode = art.toBlob.bind(art);
      let release; const saveGate = new Promise(res => { release = res; });
      art.toBlob = (cb, t) => encode(b => { saveGate.then(() => cb(b)); }, t);
      const closing = closeEditor();
      /* The re-id's wait for the save, seen at s0SaveOf. */
      let waiting = false; const saveOf = s0SaveOf;
      s0SaveOf = (k) => { const p = saveOf(k); if (p) waiting = true; return p; };
      activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
      const pulling = cloudPull({ quiet: true });
      for (let i = 0; i < 300 && !waiting; i++) await new Promise(res => setTimeout(res, 10));
      if (!waiting) throw new Error('the re-id never waited for the save');
      /* The status change: its write touches the old id, then waits for its connection. */
      const realTouch = touch, getDb = db; let armed = false, reached = false, go; const dbGate = new Promise(res => { go = res; });
      touch = (id) => { realTouch(id); if (id === 't_cap_hats_approved') armed = true; };
      db = () => { const p = getDb(); if (armed) { armed = false; reached = true; return dbGate.then(() => p); } return p; };
      const status = setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      for (let i = 0; i < 300 && !reached; i++) await new Promise(res => setTimeout(res, 10));
      if (!reached) throw new Error('the status change never reached its write');
      const touchedBeforeTheAsk = touchedSince('t_cap_hats_wip', 0);
      release();
      await pulling;
      await closing;
      touch = realTouch;
      go();
      const moved = await status;
      db = getDb; s0SaveOf = saveOf;
      await new Promise(res => setTimeout(res, 300));
      activeWs = 'team7'; dbp = null; dbpName = null;
      const all = await dbAll();
      return { touchedBeforeTheAsk, statusOk: !!(moved && moved.ok),
        group: all.filter(i => i.kind === 'trait' || i.kind === 'autosave').map(i => i.kind === 'autosave'
          ? i.id + '@' + i.name + (all.some(t => t.kind === 'trait' && t.id === i.traitId) ? '' : ' - NO TRAIT')
          : i.id + '[' + i.rowId + ' ' + i.layer + (i.synced ? ' synced' : ' unsent') + ']').sort() };
    });
    expect(r.touchedBeforeTheAsk, 'the status change had touched the old id before the re-id asked (precondition)').toBe(true);
    expect(r).toEqual({ touchedBeforeTheAsk: true, statusOk: true,
      group: ['autosave.t_cap_hats_approved@cap.png', 't_cap_hats_approved[row-1 hats unsent]'] });
  });
});

/* ---- fix round 1: the download, and branch 2's merge ---------------------- */

/* A teammate's edit of cap: saving an edit DELETEs the row and inserts a new
   one, so the server holds row-2 (cap, hats, wip) and no row-1. It is newer
   than this device's copy, and carries its own weight, order and path. */
const ROW2 = { id: 'row-2', name: 'cap', layer: 'hats', status: 'wip', rarity: 4, shelf_order: 1000,
  path: 'team7/c1/trait-cap-hats-wip-v2.png', updated_at: '2026-09-27T12:00:00+00:00' };
/* What a pull says, without the layer-order clause every pull of a new
   store adds (not this spec's subject). */
const bitsOf = (toasts) => toasts.map(t => t.replace(/, the group's paint order \(\d+ layers?\)/, '').replace(/, \d+ new layers?/, ''));
const detail = (page) => page.evaluate(async () => {
  activeWs = 'team7'; dbp = null; dbpName = null;
  return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' r' + i.rarity + ' o' + (i.shelfOrder === undefined ? '-' : i.shelfOrder)
    + (i.synced ? ' synced' : ' unsent' + (i.unsent ? ':' + i.unsent : '')) + ' path=' + i.path + ' rowAt=' + i.rowAt + ']').sort();
});
/* One pull, said out loud (quiet: false), with what the mailbox holds after it. */
const pullSaying = (page) => page.evaluate(async () => {
  window.__toasts = []; activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  const r = await cloudPull({ quiet: false }).catch(e => 'pull error ' + e);
  await new Promise(res => setTimeout(res, 300));
  return { pulled: r === undefined || r instanceof Set ? 'done' : String(r), toasts: window.__toasts.slice(),
    mail: (typeof MAIL !== 'undefined' && Array.isArray(MAIL) ? MAIL : []).map(m => m.kind + ':' + m.name) };
});

/* This tab's pull, held at its picture download (the longest wait in a
   pull); the other tab's change made during it; then the next pull. */
async function acrossHeldDownload(page, context, what) {
  st.server.addRow(Object.assign({}, ROW2));
  await seed(page, [CAP]);
  const B = await secondTab(page, context, st);
  st.rules.push({ kind: 'download', tab: 'A', hold: true, name: 'dl' });
  await page.evaluate(() => {
    window.__toasts = []; activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
    window.__pull = cloudPull({ quiet: false }).catch(e => 'pull error ' + e);
  });
  await until(() => !!st.held.dl, 'this tab\'s download to be out');
  let other = null;
  if (what === 'weight') {
    /* The other tab reweights the trait; its PATCH cannot reach the server,
       so the weight is written marked unsent (setRarity's write ahead). */
    st.rules.push({ kind: 'patch', tab: 'B', fail: 'network', once: false });
    other = await B.evaluate(async () => String(await setRarity(await dbGet('t_cap_hats_wip'), 5)));
  }
  const afterOther = await traits(B);
  st.release.dl();
  const first = await page.evaluate(async () => {
    const r = await window.__pull; await new Promise(res => setTimeout(res, 300));
    return { pulled: r === undefined || r instanceof Set ? 'done' : String(r), toasts: window.__toasts.slice(),
      mail: (typeof MAIL !== 'undefined' && Array.isArray(MAIL) ? MAIL : []).map(m => m.kind + ':' + m.name) };
  });
  const afterThisPull = await traits(page);
  const next = await pullSaying(page);
  const afterTheNext = await traits(page);
  await B.close();
  return { other, afterOther, pulled: first.pulled, said: bitsOf(first.toasts), mail: first.mail, afterThisPull,
    saidNext: bitsOf(next.toasts), mailNext: next.mail, afterTheNext };
}

test.describe('follow-up A, fix round 1: a download and a merge write only what they planned', () => {
  test('P1: another tab\'s unsent weight, made while this tab\'s pull downloads a teammate\'s edit over the trait, is kept; the next pull names the clash and keeps it', async ({ page, context }) => {
    const r = await acrossHeldDownload(page, context, 'weight');
    expect(r.afterOther, 'the other tab\'s weight is unsent (precondition)').toEqual(['t_cap_hats_wip[row-1 hats wip 5 unsent]']);
    expect(r).toEqual({ other: 'true', afterOther: r.afterOther, pulled: 'done',
      /* The download is not written over the weight, and the pull says so. */
      said: ['Loaded 0 items, 1 changed here while loading, kept as changed'], mail: [],
      afterThisPull: ['t_cap_hats_wip[row-1 hats wip 5 unsent]'],
      /* The next pull sees the unsent weight under a newer row: a clash, kept. */
      saidNext: ['Loaded 0 items, 1 changed in place by the group, 1 you have unsaved changes to, kept'], mailNext: ['clash:cap'],
      afterTheNext: ['t_cap_hats_wip[row-2 hats wip 5 unsent]'] });
  });

  test('P1, the control: nobody else acting, the teammate\'s edit is downloaded over the copy', async ({ page, context }) => {
    const r = await acrossHeldDownload(page, context, 'none');
    expect(r).toEqual({ other: null, afterOther: ['t_cap_hats_wip[row-1 hats wip 1 synced]'], pulled: 'done',
      said: ['Loaded 1 item, 1 updated by the group'], mail: ['updated:cap'],
      afterThisPull: ['t_cap_hats_wip[row-2 hats wip 4 synced]'],
      saidNext: ['Loaded 0 items'], mailNext: ['updated:cap'],
      afterTheNext: ['t_cap_hats_wip[row-2 hats wip 4 synced]'] });
  });

  /* F2, the unsent-weight variant of teammateedit's "never overwrites work
     you have not saved yet" (which compares only the picture). */
  test('F2: a teammate\'s edit (a new row) of a trait whose weight this device set and could not send: the pull says the weight is kept, and it is, and a send of it gives the group that weight', async ({ page }) => {
    st.server.addRow(Object.assign({}, ROW2));
    await seed(page, [CAP]);
    st.rules.push({ kind: 'patch', tab: 'A', fail: 'network' });   /* this one PATCH only */
    const set = await page.evaluate(async () => String(await setRarity(await dbGet('t_cap_hats_wip'), 5)));
    const before = await detail(page);
    expect(before, 'the weight is unsent (precondition)').toEqual(['t_cap_hats_wip[row-1 r5 o- unsent:meta path=team7/c1/trait-cap-hats-wip.png rowAt=2026-01-01T00:00:00+00:00]']);
    const pull = await pullSaying(page);
    const after = await detail(page);
    /* The light send Save to cloud makes of an unsent weight. */
    const sent = await page.evaluate(async () => cloudPatchOne(await dbGet('t_cap_hats_wip')));
    const onServer = st.server.rows.get('row-2').rarity;
    expect({ set, pulled: pull.pulled, said: bitsOf(pull.toasts), mail: pull.mail, after, sent, onServer }).toEqual({ set: 'true', pulled: 'done',
      said: ['Loaded 0 items, 1 changed in place by the group, 1 you have unsaved changes to, kept'], mail: ['clash:cap'],
      /* The new row id and path are taken, so the next save replaces the
         teammate's row; the weight, the order and rowAt are this device's. */
      after: ['t_cap_hats_wip[row-2 r5 o- unsent:meta path=team7/c1/trait-cap-hats-wip-v2.png rowAt=2026-01-01T00:00:00+00:00]'],
      sent: true, onServer: 5 });
  });

  for (const [when, at, said, mail] of [
    ['newer than this device\'s copy', ROW2.updated_at, 'Loaded 0 items, 1 changed in place by the group, 1 you have unsaved changes to, kept', ['clash:cap']],
    ['with no updated_at (the page cannot date it)', null, 'Loaded 0 items, 1 changed in place by the group', []],
  ]) {
    test('F2: a new row of a trait holding an unsent weight and order, ' + when + ': the weight and order are kept, the row id and path taken', async ({ page }) => {
      st.server.addRow(Object.assign({}, ROW2, { updated_at: at }));
      await seed(page, [Object.assign({}, CAP, { rarity: 5, shelfOrder: 3000, synced: false, unsent: 'meta' })]);
      const pull = await pullSaying(page);
      expect({ pulled: pull.pulled, said: bitsOf(pull.toasts), mail: pull.mail, after: await detail(page) }).toEqual({ pulled: 'done', said: [said], mail,
        after: ['t_cap_hats_wip[row-2 r5 o3000 unsent:meta path=team7/c1/trait-cap-hats-wip-v2.png rowAt=' + (at ? '2026-01-01T00:00:00+00:00' : 'null') + ']'] });
    });
  }
});
