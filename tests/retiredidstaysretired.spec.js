/* FOLLOW-UP A (patch608), S7: A RETIRED ID STAYS RETIRED.

   Four writes put a record back under an id without reading, in the same
   transaction, what that id holds now. When another tab has moved the trait
   to a new id (a status change, a move to another layer) or removed it in
   between, the write recreated the old id: two records for one row, and
   removing either removes the row on the server. When another tab changed
   the record, the write put it back over the change.
   - setRarity's write ahead: a read, then a write in another transaction -
     and a card drawn before the other tab moved the trait was written back
     as it was drawn.
   - setRarity's write back, once the group took the weight.
   - setRarityMany's second write, the same; and its first write, which
     wrote the caller's copies of the records (measured here as well: the
     same shape as setRarity's write ahead).
   - commitShelfMove's rollback when the group did not take the move.
   Each now reads and writes in one transaction, writes nothing where the id
   is gone or holds another record (or, for a write back and the rollback, a
   record changed since this tab wrote it), and says when a person's change
   was not made.

   Two tabs of one group share THE SERVER HERE, in node, behind a route on
   the context (t11r3/probe/probe.cjs's stateful server, ported). A request
   it does not name is answered 501 and fails the test. Names, ids, uids and
   tokens are made up. */
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

const NOT_THERE = 'Not changed: this trait was moved or removed since the page showed it. Find it on the shelf and try again.';
const approveIn = (B, id) => B.evaluate(async (id) => { const r = await setTraitStatus(await dbGet(id), 'approved'); return !!(r && r.ok); }, id);
const said = (page) => page.evaluate(() => window.__toasts.slice());
const aSent = (from) => st.log.slice(from).filter(e => e.tab === 'A' && /^(PATCH|POST|DELETE)$/.test(e.m) && e.path.indexOf('/rest/v1/') >= 0 && e.path.indexOf('/rpc/my_team') < 0)
  .map(e => e.m + ' ' + e.path.replace(/&select=.*$/, ''));

test.describe('follow-up A: a retired id stays retired', () => {
  test.beforeEach(async () => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-hats-wip.png', updated_at: '2026-01-01T00:00:00+00:00' });
  });

  /* ---- setRarity's write ahead ---- */
  test('a weight set on a card drawn before another tab moved the trait: nothing is written under the old id, nothing is sent, and it says so', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    await page.evaluate(async () => { window.__card = await dbGet('t_cap_hats_wip'); });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    expect(await traits(B)).toEqual(['t_cap_hats_approved[row-1 hats approved 1 unsent]']);
    const from = st.log.length;
    const ok = await page.evaluate(async () => { window.__toasts = []; return setRarity(window.__card, 5); });
    await page.waitForTimeout(200);
    expect({ ok, said: await said(page), sent: aSent(from), store: await traits(page) })
      .toEqual({ ok: false, said: [NOT_THERE], sent: [], store: ['t_cap_hats_approved[row-1 hats approved 1 unsent]'] });
    await B.close();
  });

  test('a weight set on a card whose id now holds another trait (moved away, and a new one made there): the new one is not reweighted, and it says so', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    await page.evaluate(async () => { window.__card = await dbGet('t_cap_hats_wip'); });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    await seed(B, [{ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 5, rarity: 1, synced: false, lid: 'l_other', by: 'u1', wk: 'person' }]);
    const from = st.log.length;
    const ok = await page.evaluate(async () => { window.__toasts = []; return setRarity(window.__card, 5); });
    await page.waitForTimeout(200);
    expect({ ok, said: await said(page), sent: aSent(from), store: await traits(page) })
      .toEqual({ ok: false, said: [NOT_THERE], sent: [],
        store: ['t_cap_hats_approved[row-1 hats approved 1 unsent]', 't_cap_hats_wip[undefined hats wip 1 unsent]'] });
    await B.close();
  });

  /* ---- setRarity's write back ---- */
  test('a weight the group takes while another tab moves the trait: the write back does not put the old id back', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    st.rules.push({ kind: 'patch', tab: 'A', hold: true, name: 'w' });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    await page.evaluate(async () => { window.__w = setRarity(await dbGet('t_cap_hats_wip'), 5); });
    await until(() => st.held.w, 'the weight\'s PATCH to be out');
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    expect(await traits(B)).toEqual(['t_cap_hats_approved[row-1 hats approved 5 unsent]']);
    st.release.w();
    const ok = await page.evaluate(() => window.__w);
    await page.waitForTimeout(200);
    expect({ ok, store: await traits(page), server: st.server.rows.get('row-1').rarity })
      .toEqual({ ok: true, store: ['t_cap_hats_approved[row-1 hats approved 5 unsent]'], server: 5 });
    await B.close();
  });

  test('the control: a weight the group takes, nobody else acting: written back as sent', async ({ page }) => {
    await seed(page, [CAP]);
    const ok = await page.evaluate(async () => setRarity(await dbGet('t_cap_hats_wip'), 5));
    expect({ ok, store: await traits(page) }).toEqual({ ok: true, store: ['t_cap_hats_wip[row-1 hats wip 5 synced]'] });
  });

  /* ---- setRarityMany ---- */
  test('weights set on many cards, one drawn before another tab moved its trait: nothing is written under the old id, and it says so', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    await page.evaluate(async () => { window.__card = await dbGet('t_cap_hats_wip'); });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    const from = st.log.length;
    const n = await page.evaluate(async () => { window.__toasts = []; return setRarityMany([window.__card], 5); });
    await page.waitForTimeout(200);
    expect({ n, said: await said(page), sent: aSent(from), store: await traits(page) })
      .toEqual({ n: 0, said: ['1 trait was not changed: it was moved or removed since the page showed it'], sent: [],
        store: ['t_cap_hats_approved[row-1 hats approved 1 unsent]'] });
    await B.close();
  });

  test('weights the group takes while another tab moves one of the traits: the second write does not put the old id back', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    st.rules.push({ kind: 'patch', tab: 'A', hold: true, name: 'w' });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    await page.evaluate(async () => { window.__w = setRarityMany([await dbGet('t_cap_hats_wip')], 5); });
    await until(() => st.held.w, 'the weights\' PATCH to be out');
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    expect(await traits(B)).toEqual(['t_cap_hats_approved[row-1 hats approved 5 unsent]']);
    st.release.w();
    const n = await page.evaluate(() => window.__w);
    await page.waitForTimeout(200);
    expect({ n, store: await traits(page), server: st.server.rows.get('row-1').rarity })
      .toEqual({ n: 1, store: ['t_cap_hats_approved[row-1 hats approved 5 unsent]'], server: 5 });
    await B.close();
  });

  test('"set the unplanned to normal", one of them moved in another tab since the list was drawn: the toast says it was not changed', async ({ page, context }) => {
    await seed(page, [CAP]);
    const B = await secondTab(page, context, st);
    await page.evaluate(async () => { window.__card = await dbGet('t_cap_hats_wip'); });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    const n = await page.evaluate(async () => { window.__toasts = []; return seedRarity([window.__card]); });
    await page.waitForTimeout(200);
    const told = await said(page);
    expect({ n, last: told[told.length - 1], store: await traits(page) }).toEqual({ n: 0,
      last: 'Set 0 traits to normal. Nothing about the collection changed. 1 trait was not changed: it was moved or removed since the page showed it.',
      store: ['t_cap_hats_approved[row-1 hats approved 1 unsent]'] });
    await B.close();
  });

  test('the control: weights the group takes, nobody else acting: written back as sent', async ({ page }) => {
    await seed(page, [CAP]);
    const n = await page.evaluate(async () => setRarityMany([await dbGet('t_cap_hats_wip')], 5));
    expect({ n, store: await traits(page) }).toEqual({ n: 1, store: ['t_cap_hats_wip[row-1 hats wip 5 synced]'] });
  });

  /* ---- cloudPatchOne's "sent" write: the same shape, found and measured here ---- */
  test('a weight sent on its own (cloudPatchOne) while another tab moves the trait: its "sent" write does not put the old id back', async ({ page, context }) => {
    await seed(page, [Object.assign({}, CAP, { rarity: 5, synced: false, unsent: 'meta', wk: 'person' })]);
    const B = await secondTab(page, context, st);
    st.rules.push({ kind: 'patch', tab: 'A', hold: true, name: 'p' });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    await page.evaluate(async () => { window.__p = cloudPatchOne(await dbGet('t_cap_hats_wip')); });
    await until(() => st.held.p, 'the PATCH to be out');
    expect(await approveIn(B, 't_cap_hats_wip'), 'the other tab moved it (precondition)').toBe(true);
    expect(await traits(B)).toEqual(['t_cap_hats_approved[row-1 hats approved 5 unsent]']);
    st.release.p();
    const ok = await page.evaluate(() => window.__p);
    await page.waitForTimeout(200);
    expect({ ok, store: await traits(page), server: st.server.rows.get('row-1').rarity })
      .toEqual({ ok: true, store: ['t_cap_hats_approved[row-1 hats approved 5 unsent]'], server: 5 });
    await B.close();
  });

  test('the control: a weight sent on its own, nobody else acting: marked sent', async ({ page }) => {
    await seed(page, [Object.assign({}, CAP, { rarity: 5, synced: false, unsent: 'meta', wk: 'person' })]);
    const ok = await page.evaluate(async () => cloudPatchOne(await dbGet('t_cap_hats_wip')));
    expect({ ok, store: await traits(page) }).toEqual({ ok: true, store: ['t_cap_hats_wip[row-1 hats wip 5 synced]'] });
  });

  /* ---- commitShelfMove's rollback ---- */
  const moveAcross = async (page, context, other) => {
    await seed(page, [CAP]);
    const B = other ? await secondTab(page, context, st) : null;
    st.rules.push({ kind: 'rpc', tab: 'A', hold: true, fail: 'network', name: 'm' });
    st.rules.push({ kind: 'upload', tab: 'B', fail: 'network', once: false });
    st.rules.push({ kind: 'patch', tab: 'B', fail: 'network', once: false });
    await page.evaluate(() => { window.__toasts = []; window.__m = commitShelfMove({ recordKey: 'row-1', toLayer: 'skins', beforeKey: null }); });
    await until(() => st.held.m, 'the move\'s send to be out');
    const moved = await traits(page);
    let otherDid = null;
    if (other === 'approve') otherDid = await approveIn(B, 't_cap_skins_wip');
    if (other === 'weight') otherDid = await B.evaluate(async () => setRarity(await dbGet('t_cap_skins_wip'), 5));
    /* A new trait made at the id the move left (another tab's import, say). */
    if (other === 'taken') { await seed(B, [{ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 7, rarity: 2, synced: false, lid: 'l_other', by: 'u1', wk: 'person' }]); otherDid = true; }
    const afterOther = B ? await traits(B) : null;
    st.release.m();
    const ok = await page.evaluate(() => window.__m);
    await page.waitForTimeout(200);
    const out = { moved, otherDid, afterOther, ok, said: await said(page), store: await traits(page) };
    if (B) await B.close();
    return out;
  };

  test('a move the group did not take, while another tab approved the moved trait: the rollback does not put the old id back, and says so', async ({ page, context }) => {
    const r = await moveAcross(page, context, 'approve');
    expect(r).toEqual({ moved: ['t_cap_skins_wip[row-1 skins wip 1 unsent]'], otherDid: true,
      afterOther: ['t_cap_skins_approved[row-1 skins approved 1 unsent]'], ok: false,
      said: ['Move did not sync. 1 trait was changed since the move and is left as it is now'],
      store: ['t_cap_skins_approved[row-1 skins approved 1 unsent]'] });
  });

  test('a move the group did not take, while another tab reweighted the moved trait: the rollback does not write over the weight, and says so', async ({ page, context }) => {
    const r = await moveAcross(page, context, 'weight');
    expect(r).toEqual({ moved: ['t_cap_skins_wip[row-1 skins wip 1 unsent]'], otherDid: true,
      afterOther: ['t_cap_skins_wip[row-1 skins wip 5 unsent]'], ok: false,
      said: ['Move did not sync. 1 trait was changed since the move and is left as it is now'],
      store: ['t_cap_skins_wip[row-1 skins wip 5 unsent]'] });
  });

  test('a move the group did not take, while another tab made a new trait at the id the move left: the rollback does not write over it, and says so', async ({ page, context }) => {
    const r = await moveAcross(page, context, 'taken');
    expect(r).toEqual({ moved: ['t_cap_skins_wip[row-1 skins wip 1 unsent]'], otherDid: true,
      afterOther: ['t_cap_hats_wip[undefined hats wip 2 unsent]', 't_cap_skins_wip[row-1 skins wip 1 unsent]'], ok: false,
      said: ['Move did not sync. 1 trait was changed since the move and is left as it is now'],
      store: ['t_cap_hats_wip[undefined hats wip 2 unsent]', 't_cap_skins_wip[row-1 skins wip 1 unsent]'] });
  });

  test('the control: a move the group did not take, nobody else acting: the old order is restored', async ({ page, context }) => {
    const r = await moveAcross(page, context, null);
    expect(r).toEqual({ moved: ['t_cap_skins_wip[row-1 skins wip 1 unsent]'], otherDid: null, afterOther: null, ok: false,
      said: ['Move did not sync, so the old order was restored'], store: ['t_cap_hats_wip[row-1 hats wip 1 synced]'] });
  });
});
