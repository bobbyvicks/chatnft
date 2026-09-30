/* FOLLOW-UP A (patch608), S9: A PULL KNOWS A TRAIT BY ITS NAME, LAYER AND
   STATUS, NOT BY THE ID THEY SPELL.

   A pull matches a row it has not seen (a teammate's edit arrives as a new
   row) to the local record of the same trait by the id that name, layer
   and status spell: t_<name>_<layer>_<status>. The id is not a key - the
   parts are joined with "_", which names and layers contain - so "cap" on
   top_hats and "cap_top" on hats are both t_cap_top_hats_wip. Before this, a
   teammate's new "cap" on top_hats was taken for this device's "cap_top" on
   hats: downloaded over it (a newer row) or merged into it and moved to
   top_hats (an older one), and this device's own trait was gone from its
   layer. Measured by the Task 10 reviewer (ledger 192/194) and here.

   Now the record the id finds is taken only when its kind, name, layer and
   status are the row's; otherwise the row is a clash, and arrives beside it
   under a free name. The control: a teammate's edit of the same trait still
   arrives over it.

   THE FREE NAME WAS NEW. Before this, no pull ever gave one: the clash was
   reached only with the row's id free, because every path in branch 2
   continued. Giving one exposed four things, each measured on the page with
   the same-trait test alone (fa-work/s9/scratch-*.txt), each fixed and
   tested below:
   - a teammate's own "cap-2", arriving in a later pull, was taken for the
     record renamed cap-2 (its parts match): merged into it, and this
     device's unsent weight for the renamed trait was then sent to the
     teammate's row, which lost its weight 7. A record whose own row the
     listing still has is that row's trait;
   - in one pull, "cap" renamed to cap-2 took the id the group's own "cap-2"
     spells, and that row was dropped (the skip when nothing here holds the
     id) until the next pull;
   - two new rows that spell one id: the second was dropped by that skip,
     and when it fell through to the clash, the first one's download in the
     same pull touched the id the second's name spells, and it was skipped
     as "changed here while loading";
   - so a row listed twice is now taken once, as the skip used to do.

   One tab; THE SERVER HERE is a stateful route in node (t11r3's, ported).
   Names, ids, uids and tokens are made up. */
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
        /* S.twice: a row the collection's listing gives twice. */
        if (coll && S.twice) all.push(...all.filter(r => r.id === S.twice));
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


const MINE = { id: 't_cap_top_hats_wip', kind: 'trait', name: 'cap_top', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 3,
  synced: true, rowId: 'row-0', rowAt: '2026-06-01T00:00:00+00:00', path: 'team7/c1/trait-cap_top-hats-wip.png', lid: 'l_mine', by: 'u1', wk: 'pull' };
const pull = (page) => page.evaluate(async () => {
  LAYERS = ['hats', 'top_hats', 'unsorted'];
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  await cloudPull({ quiet: true });
  activeWs = 'team7'; dbp = null; dbpName = null;
  return { note: $('cloudnote').textContent,
    /* A local id this pull made is random: read as l_new. */
    store: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' ' + i.name + ' ' + i.layer + ' ' + i.status + ' ' + i.rarity + ' ' + (i.lid === 'l_mine' ? i.lid : 'l_new') + ']').sort() };
});

test.describe('follow-up A: a pull knows a trait by its name, layer and status', () => {
  test.beforeEach(async () => { st.server.layers = ['hats', 'top_hats', 'unsorted']; });

  test('a teammate\'s new "cap" on top_hats, newer than this device\'s "cap_top" on hats (both t_cap_top_hats_wip): this device\'s trait is untouched, and theirs arrives beside it', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 3, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    await seed(page, [MINE]);
    const r = await pull(page);
    expect(r.store, 'this device\'s trait is where it was, and theirs beside it under a free name')
      .toEqual(['t_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 1 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_mine]']);
    expect(r.note).toContain('1 renamed so nothing here was replaced');
  });

  test('the same, the teammate\'s row older than this device\'s copy: this device\'s trait is not merged into theirs and moved', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 3, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-02-01T00:00:00+00:00' });
    await seed(page, [MINE]);
    const r = await pull(page);
    expect(r.store, 'this device\'s trait is where it was, and theirs beside it under a free name')
      .toEqual(['t_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 1 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_mine]']);
  });

  /* The case stage0marks.spec.js and stage0stamps.spec.js made "a re-id of
     unsent work" from (their repairCases.unsent, superseded there): this
     device's "cap_top" on hats was never sent, so it holds no row. It was
     merged into the teammate's row and re-id'd to top_hats. */
  test('this device\'s "cap_top" on hats, never sent (no row), and a teammate\'s new "cap" on top_hats: cap_top stays where it is, unsent, and theirs arrives beside it', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    await seed(page, [{ id: 't_cap_top_hats_wip', kind: 'trait', name: 'cap_top', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 3,
      synced: false, lid: 'l_mine', by: 'u1', wk: 'person' }]);
    const r = await pull(page);
    expect(r.store).toEqual(['t_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 1 l_new]', 't_cap_top_hats_wip[undefined cap_top hats wip 3 l_mine]']);
    expect(await traits(page), 'and still unsent').toContain('t_cap_top_hats_wip[undefined hats wip 3 unsent]');
    expect(r.note).not.toContain('unsaved changes');
  });

  test('the control: a teammate\'s edit of this device\'s own "cap_top" on hats (a new row, newer) still arrives over it', async ({ page }) => {
    st.server.addRow({ id: 'row-2', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 4, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    await seed(page, [MINE]);
    const r = await pull(page);
    expect(r.store).toEqual(['t_cap_top_hats_wip[row-2 cap_top hats wip 4 l_mine]']);
    expect(r.note).toContain('1 updated by the group');
  });

  test('a record the clash renamed (cap-2, row-1) is its own row\'s trait: the group\'s own "cap-2" (row-2), arriving later, lands beside it, and this device\'s unsent weight goes to row-1', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 3, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    await seed(page, [MINE]);
    expect((await pull(page)).store, 'the precondition: row-1 renamed to cap-2')
      .toEqual(['t_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 1 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_mine]']);
    /* This device reweights the renamed trait, and its send fails. */
    st.rules.push({ kind: 'patch', fail: 503 });
    expect(await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; return await setRarity(await dbGet('t_cap-2_top_hats_wip'), 5); })).toBe(true);
    st.server.addRow({ id: 'row-2', name: 'cap-2', layer: 'top_hats', status: 'wip', rarity: 7, path: 'team7/c1/trait-cap-2-top_hats-wip.png', updated_at: '2026-09-28T12:00:00+00:00' });
    const r = await pull(page);
    expect(r.store, 'row-1\'s trait keeps its row and weight; row-2 arrives beside it')
      .toEqual(['t_cap-2-2_top_hats_wip[row-2 cap-2-2 top_hats wip 7 l_new]', 't_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 5 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_mine]']);
    expect(r.note).not.toContain('unsaved changes');
    /* The next send of the weight. */
    expect(await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; return await cloudPatchOne(await dbGet('t_cap-2_top_hats_wip')); })).toBe(true);
    expect([...st.server.rows.values()].map(x => x.id + ' ' + x.name + ' r' + x.rarity).sort(), 'the weight went to row-1; row-2 keeps its own')
      .toEqual(['row-0 cap_top r3', 'row-1 cap r5', 'row-2 cap-2 r7']);
  });

  test('a clash\'s free name is not one another row of the listing spells: "cap" arrives as cap-3 beside the group\'s own "cap-2", in one pull', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 3, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    st.server.addRow({ id: 'row-2', name: 'cap-2', layer: 'top_hats', status: 'wip', rarity: 7, path: 'team7/c1/trait-cap-2-top_hats-wip.png', updated_at: '2026-09-28T12:00:00+00:00' });
    await seed(page, [MINE]);
    const r = await pull(page);
    expect(r.store).toEqual(['t_cap-2_top_hats_wip[row-2 cap-2 top_hats wip 7 l_new]', 't_cap-3_top_hats_wip[row-1 cap-3 top_hats wip 1 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_mine]']);
    expect(r.note).toContain('Loaded 2 items, 1 renamed so nothing here was replaced');
    const again = await pull(page);
    expect(again.store, 'and it stays so').toEqual(r.store);
    expect(again.note).toContain('Loaded 0 items');
  });

  test('two rows new here that spell one id ("cap_top" on hats and "cap" on top_hats): both arrive in one pull, the second under a free name', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 3, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await pull(page);
    expect(r.store).toEqual(['t_cap-2_top_hats_wip[row-1 cap-2 top_hats wip 1 l_new]', 't_cap_top_hats_wip[row-0 cap_top hats wip 3 l_new]']);
    expect(r.note).toContain('Loaded 2 items, 1 renamed so nothing here was replaced');
    expect(r.note).not.toContain('changed here while loading');
  });

  test('the control: a row the listing gives twice arrives once', async ({ page }) => {
    st.server.addRow({ id: 'row-1', name: 'cap', layer: 'top_hats', status: 'wip', rarity: 1, path: 'team7/c1/trait-cap-top_hats-wip.png', updated_at: '2026-09-27T12:00:00+00:00' });
    st.server.twice = 'row-1';
    const r = await pull(page);
    expect(r.store).toEqual(['t_cap_top_hats_wip[row-1 cap top_hats wip 1 l_new]']);
    expect(r.note).toContain('Loaded 1 item');
    expect(r.note).not.toContain('renamed');
  });
});
