/* FOLLOW-UP A (patch608), S9: A FOLDER IMPORT AND A PROJECT FILE KNOW A
   TRAIT BY ITS NAME, LAYER AND STATUS, NOT BY THE ID THEY SPELL.

   A trait is filed under t_<name>_<layer>_<status>. The parts are joined
   with "_", which names and layers contain, so "cap" on top_hats and
   "cap_top" on hats are both t_cap_top_hats_wip, and the store can hold
   only one of them.

   A folder import took the record at the id a file's path spells as that
   file's trait. Measured on 91eb861's page (the follow-up A report's probe,
   fa-work/probe.cjs s9_import_collide): importing top_hats/wip/cap.png
   beside this device's "cap_top" on hats replaced it - the record became
   "cap" on top_hats with the imported picture, kept cap_top's weight and
   local id, and the page said "Imported 1 file". Two files in one folder
   that spell one id did the same to each other. In a group the file was
   sent carrying cap_top's row id.

   Now the record at the id is the file's trait only when its name, layer
   and status are the file's. Otherwise the file is not imported, and the
   note names it and the trait it would have replaced. It is not renamed,
   as a pull's clash is: a pull cannot refuse a teammate's row, and an
   import can refuse a file. A renamed file would not find its trait again
   on the next import of the same folder - that looks for it by the id its
   path spells - and would arrive again under the next free name each time.
   The person names the file, and can rename it.

   A project file's restore took a record at the item's id holding the
   same picture as "already here", and wrote nothing. With the collision,
   the item's trait was not restored anywhere. Now "already here" is the
   same trait only, and another trait's id is a namesake: the item is
   renamed, as a restore always renames one.

   The controls: the same trait by its parts is still replaced by the
   import (and keeps its weight and local id), and is still "already here"
   to a restore; a trait whose id does not collide is imported beside.

   Names, ids, uids and tokens are made up. */
import { test, expect } from '@playwright/test';

/* ---- the page ------------------------------------------------------------- */
const personal = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function' && typeof importProject === 'function' && typeof fileWithPath === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
    await dbClear();
    LAYERS = ['hats', 'top_hats', 'unsorted'];
    window.__toasts = []; const tt = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { tt(m); } catch (_) {} };
    /* Pictures that differ by their pixels: MINE, THEIRS and OTHER. */
    const pic = async (f) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(f, f, 8, 8);
      return new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer()); };
    window.__pics = { MINE: await pic(1), THEIRS: await pic(5), OTHER: await pic(3) };
  });
};
/* The traits as id name layer status rarity lid picture. */
const store = (page) => page.evaluate(async () => {
  const which = async (b) => { if (!b) return 'none'; const x = new Uint8Array(await b.arrayBuffer()).join(',');
    for (const [k, v] of Object.entries(window.__pics)) if (v.join(',') === x) return k; return 'unknown'; };
  const out = [];
  for (const i of (await dbAll()).filter(i => i.kind === 'trait'))
    out.push(i.id + ' ' + i.name + ' ' + i.layer + ' ' + i.status + ' r' + i.rarity + ' ' + (i.lid || '-') + ' ' + await which(i.blob));
  return out.sort();
});
const seedMine = (page, extra) => page.evaluate(async (extra) => {
  await dbPut(Object.assign({ id: 't_cap_top_hats_wip', kind: 'trait', name: 'cap_top', layer: 'hats', status: 'wip', w: 16, h: 16, rarity: 9, at: 1,
    synced: false, lid: 'l_mine', blob: new Blob([window.__pics.MINE], { type: 'image/png' }) }, extra || {}));
}, extra);
/* files: [[path, picture name]] */
const importFolder = (page, files) => page.evaluate(async (files) => {
  window.__toasts = [];
  const rc = window.confirm; window.confirm = () => true;
  try { await bulkImport(files.map(([p, k]) => fileWithPath(window.__pics[k], p))); } finally { window.confirm = rc; }
  return { toasts: window.__toasts.slice(), note: $('bulknote').textContent };
}, files);
/* items: [{name, layer, status, picture}] */
const restore = (page, items) => page.evaluate(async (items) => {
  window.__toasts = [];
  const url = (b) => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(new Blob([b], { type: 'image/png' })); });
  const doc = { format: PROJECT_FORMAT, version: PROJECT_VERSION, items: [] };
  for (const it of items) doc.items.push({ kind: 'trait', name: it.name, layer: it.layer, status: it.status, w: 16, h: 16, at: 5, png: await url(window.__pics[it.picture]) });
  await importProject(new File([JSON.stringify(doc)], 'backup.json', { type: 'application/json' }));
  return window.__toasts.slice();
}, items);

test.describe('follow-up A, S9: a folder import knows a trait by its name, layer and status', () => {
  test.beforeEach(async ({ page }) => { await personal(page); });

  test('a file "cap" on top_hats beside this project\'s "cap_top" on hats (both t_cap_top_hats_wip): cap_top is untouched, the file is not imported, and the note names both', async ({ page }) => {
    await seedMine(page);
    const r = await importFolder(page, [['col/top_hats/wip/cap.png', 'THEIRS']]);
    expect(await store(page), 'cap_top, its weight, its local id and its picture').toEqual(['t_cap_top_hats_wip cap_top hats wip r9 l_mine MINE']);
    expect(r.toasts).toEqual(['Imported 0 files']);
    expect(r.note).toContain('1 not imported: cap on top_hats would replace cap_top on hats');
  });

  test('the same two in one folder: the first is imported, and the second does not replace it', async ({ page }) => {
    const r = await importFolder(page, [['col/hats/wip/cap_top.png', 'MINE'], ['col/top_hats/wip/cap.png', 'THEIRS']]);
    expect((await store(page)).map(s => s.replace(/ r\S+ \S+ /, ' ')), 'cap_top, with its own picture').toEqual(['t_cap_top_hats_wip cap_top hats wip MINE']);
    expect(r.toasts).toEqual(['Imported 1 file']);
    expect(r.note).toContain('1 not imported: cap on top_hats would replace cap_top on hats');
  });

  test('the control: a file of the same trait ("cap_top" on hats) still replaces it, keeping its weight and local id', async ({ page }) => {
    await seedMine(page);
    const r = await importFolder(page, [['col/hats/wip/cap_top.png', 'THEIRS']]);
    expect(await store(page)).toEqual(['t_cap_top_hats_wip cap_top hats wip r9 l_mine THEIRS']);
    expect(r.toasts).toEqual(['Imported 1 file']);
    expect(r.note).toContain('1 updated');
    expect(r.note).not.toContain('not imported');
  });

  /* A file named from its picture (a uuid) is named <layer>-<n>. On
     top_hats that is top_hats-1, t_top_hats-1_top_hats_wip, which is also
     the id of "top_hats-1_top" on hats. */
  test('a file the import names for you, whose name\'s id another trait holds: not imported, said, and not counted as named', async ({ page }) => {
    await seedMine(page, { id: 't_top_hats-1_top_hats_wip', name: 'top_hats-1_top' });
    const r = await importFolder(page, [['col/top_hats/wip/0b7c6f1e-2d3a-4c5b-8e9f-1a2b3c4d5e6f.png', 'THEIRS']]);
    expect(await store(page)).toEqual(['t_top_hats-1_top_hats_wip top_hats-1_top hats wip r9 l_mine MINE']);
    expect(r.note).toContain('1 not imported: top_hats-1 on top_hats would replace top_hats-1_top on hats');
    expect(r.note).not.toContain('named for you');
  });

  test('the control: "cap" on top_hats beside "cap_top" on top_hats (t_cap_top_top_hats_wip, no collision) is imported beside it', async ({ page }) => {
    await seedMine(page, { id: 't_cap_top_top_hats_wip', layer: 'top_hats' });
    const r = await importFolder(page, [['col/top_hats/wip/cap.png', 'THEIRS']]);
    expect((await store(page)).map(s => s.replace(/ r\S+ \S+ /, ' '))).toEqual(['t_cap_top_hats_wip cap top_hats wip THEIRS', 't_cap_top_top_hats_wip cap_top top_hats wip MINE']);
    expect(r.toasts).toEqual(['Imported 1 file']);
    expect(r.note).not.toContain('not imported');
  });
});

test.describe('follow-up A, S9: a project file\'s restore knows a trait by its name, layer and status', () => {
  test.beforeEach(async ({ page }) => { await personal(page); });

  test('an item "cap" on top_hats with the same picture as this project\'s "cap_top" on hats: it is restored beside it under a free name, not taken as already here', async ({ page }) => {
    await seedMine(page);
    const toasts = await restore(page, [{ name: 'cap', layer: 'top_hats', status: 'wip', picture: 'MINE' }]);
    expect((await store(page)).map(s => s.replace(/ r\S+ \S+ /, ' ')))
      .toEqual(['t_cap-2_top_hats_wip cap-2 top_hats wip MINE', 't_cap_top_hats_wip cap_top hats wip MINE']);
    expect(await store(page), 'cap_top untouched').toContain('t_cap_top_hats_wip cap_top hats wip r9 l_mine MINE');
    expect(toasts).toEqual(['Imported 1 item, 1 renamed to avoid replacing something']);
  });

  test('the control: an item of the same trait ("cap_top" on hats) with the same picture is already here, and nothing is written', async ({ page }) => {
    await seedMine(page);
    const toasts = await restore(page, [{ name: 'cap_top', layer: 'hats', status: 'wip', picture: 'MINE' }]);
    expect(await store(page)).toEqual(['t_cap_top_hats_wip cap_top hats wip r9 l_mine MINE']);
    expect(toasts).toEqual(['Imported 0 items, 1 already here']);
  });
});

/* ---- a group: the file's send ------------------------------------------------
   THE SERVER HERE is a stateful route in node (pullidentitybyname's). */
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGM4wcX1nxLMMGrAqAGjBgwXAwDCDNsQBGseLgAAAABJRU5ErkJggg==', 'base64');
function newServer() {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 8, 29, 12, 0, 0) + (++clock) * 1000).toISOString();
  const S = { rows: new Map(), files: new Set(), newN: 0, now, layers: ['hats', 'top_hats', 'unsorted'] };
  S.addRow = (r) => {
    const row = Object.assign({ kind: 'trait', rarity: 1, shelf_order: null, w: 16, h: 16, collection_id: 'c1', updated_at: '2026-01-01T00:00:00+00:00' }, r);
    S.rows.set(row.id, row); if (row.path) S.files.add(row.path); return row;
  };
  return S;
}
function router(st) {
  const S = st.server;
  return async (route) => {
    const req = route.request(), u = req.url(), m = req.method(), p = u.replace(/^https?:\/\/[^/]+/, '');
    const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const e = { m, path: decodeURIComponent(p) };
    st.log.push(e);
    const json = (x, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(x) });
    const qp = (k) => { const mm = u.match(new RegExp('[?&]' + k + '=([^&]+)')); return mm ? decodeURIComponent(mm[1]) : null; };
    if (u.indexOf('select=id,protocol,switching_at') >= 0) return json([{ id: 'c1', protocol: 1, switching_at: null }]);
    if (u.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (u.indexOf('/rest/v1/rpc/my_team') >= 0) return json('me');
    if (u.indexOf('/rest/v1/rpc/team_member_names') >= 0) return json([]);
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
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) { Object.assign(r, b); r.updated_at = S.now(); }
        return json(hit.map(r => Object.assign({}, r)));
      }
      if (m === 'DELETE') {
        const hit = [...S.rows.values()].filter(sel);
        for (const r of hit) S.rows.delete(r.id);
        return json(hit.map(r => ({ id: r.id, path: r.path })));
      }
      if (m === 'POST') {
        const x = JSON.parse(req.postData())[0];
        const clash = [...S.rows.values()].find(r => r.collection_id === x.collection_id && r.kind === x.kind && r.name === x.name && r.layer === x.layer && r.status === x.status);
        if (clash) return json({ code: '23505', details: null, hint: null, message: 'duplicate key value violates unique constraint "traits_identity"' }, 409);
        return json([S.addRow(Object.assign({}, x, { id: 'row-new-' + (++S.newN), updated_at: S.now() }))], 201);
      }
    }
    st.unknown.push(m + ' ' + p.slice(0, 160));
    return json({ code: 'UNROUTED' }, 501);
  };
}

test.describe('follow-up A, S9: a group folder import does not send a file as another trait', () => {
  let st = null;
  test.beforeEach(async ({ page, context }) => {
    st = { server: newServer(), log: [], unknown: [] };
    await context.route(/supabase\.co/, router(st));
    await personal(page);
    await page.evaluate(async () => {
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      try { sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1'); } catch (_) {}
      s0SeenUid = null; groupCaughtUp = true;
      activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
      s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
      await dbClear();
    });
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); }).catch(() => {});
    expect(st.unknown, 'every request had a named answer').toEqual([]);
  });
  const rows = () => [...st.server.rows.values()].map(r => r.id + ' ' + r.name + ' ' + r.layer + ' ' + r.status).sort();
  const writes = () => st.log.filter(e => e.m !== 'GET' && e.m !== 'OPTIONS' && e.path.indexOf('/auth/') < 0 && e.path.indexOf('/rpc/') < 0 && e.path.indexOf('/object/list/') < 0).map(e => e.m + ' ' + e.path.split('?')[0]);

  test('a file "cap" on top_hats beside this device\'s synced "cap_top" on hats: nothing is sent, and the group keeps cap_top', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 9, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    await seedMine(page, { synced: true, rowId: 'row-0', rowAt: '2026-06-01T00:00:00+00:00', path: 'team7/c1/trait-cap_top-hats-wip.png', by: 'u1', wk: 'pull' });
    const r = await importFolder(page, [['col/top_hats/wip/cap.png', 'THEIRS']]);
    expect(await store(page)).toEqual(['t_cap_top_hats_wip cap_top hats wip r9 l_mine MINE']);
    expect(rows(), 'the group\'s rows').toEqual(['row-0 cap_top hats wip']);
    expect(writes(), 'nothing sent').toEqual([]);
    expect(r.note).toContain('1 not imported: cap on top_hats would replace cap_top on hats');
  });

  /* The import notes its sends' attempts together, before its loop: the
     first send notes itself and those still to go (s0AttemptRun). The
     refused file was in that plan carrying cap_top's row and local id. */
  test('with another file sent first: the attempts noted name that file, and nothing of cap_top\'s', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 9, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    await seedMine(page, { synced: true, rowId: 'row-0', rowAt: '2026-06-01T00:00:00+00:00', path: 'team7/c1/trait-cap_top-hats-wip.png', by: 'u1', wk: 'pull' });
    await importFolder(page, [['col/hats/wip/other.png', 'OTHER'], ['col/top_hats/wip/cap.png', 'THEIRS']]);
    const noted = await page.evaluate(async () => { const r = await dbGet(S0_ATTEMPTS_ID); return r ? r.entries.map(e => e.id + ' ' + (e.rowId || '-') + ' ' + (e.lid || '-')) : null; });
    expect(noted.map(e => e.replace(/ l_\S+$/, ' l_new')), 'the send of other.png noted its attempt (its local id is the store\'s: l_new)').toContain('t_other_hats_wip - l_new');
    expect(noted.filter(e => e.indexOf('t_cap_top_hats_wip') >= 0 || e.indexOf('row-0') >= 0 || e.indexOf('l_mine') >= 0), 'nothing of cap_top\'s').toEqual([]);
    expect(rows(), 'the group\'s rows').toEqual(['row-0 cap_top hats wip', 'row-new-1 other hats wip']);
  });

  test('the two in one folder, in a group: cap_top is sent, cap is not, and no attempt is noted for cap', async ({ page }) => {
    const r = await importFolder(page, [['col/hats/wip/cap_top.png', 'MINE'], ['col/top_hats/wip/cap.png', 'THEIRS']]);
    const noted = await page.evaluate(async () => { const r = await dbGet(S0_ATTEMPTS_ID); return r ? r.entries.map(e => e.id + ' ' + (e.ident ? e.ident.name + '/' + e.ident.layer : '-')) : null; });
    expect(noted, 'cap_top\'s attempt, and nothing for cap').toEqual(['t_cap_top_hats_wip cap_top/hats']);
    expect(rows()).toEqual(['row-new-1 cap_top hats wip']);
    expect(r.note).toContain('1 not imported: cap on top_hats would replace cap_top on hats');
  });

  test('the control: a file of the same trait ("cap_top" on hats) is sent as that trait', async ({ page }) => {
    st.server.addRow({ id: 'row-0', name: 'cap_top', layer: 'hats', status: 'wip', rarity: 9, path: 'team7/c1/trait-cap_top-hats-wip.png', updated_at: '2026-06-01T00:00:00+00:00' });
    await seedMine(page, { synced: true, rowId: 'row-0', rowAt: '2026-06-01T00:00:00+00:00', path: 'team7/c1/trait-cap_top-hats-wip.png', by: 'u1', wk: 'pull' });
    const r = await importFolder(page, [['col/hats/wip/cap_top.png', 'THEIRS']]);
    expect((await store(page)).map(s => s.replace(/ l_mine /, ' '))).toEqual(['t_cap_top_hats_wip cap_top hats wip r9 THEIRS']);
    expect(rows().map(x => x.replace(/^\S+ /, '')), 'the group has cap_top, sent again').toEqual(['cap_top hats wip']);
    expect(writes().length, 'it was sent').toBeGreaterThan(0);
    expect(r.note).not.toContain('not imported');
  });
});
