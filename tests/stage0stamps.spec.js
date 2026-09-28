/* STAGE 0: WHOSE RECORD, AND WHAT KIND OF WRITE (design B1, D1).

   Every trait, reference and draft the page writes is stamped with the
   signed-in account (by), the kind of write (wk: person, pull or sent), and,
   for traits and references, a local id (lid) that survives every change of
   id exactly as the row id does. The new page's straggler pass drops pulls
   and turns a person's unsent changes into ops, so anything unsent that is
   labelled a pull - a draft, or a record whose picture never went up - is
   lost work (Review Focus 2); a record that takes the puller's uid moves
   with the wrong account; and a sign-out that lets a pull write on is a
   record in the wrong account's store (Review Focus 4).

   The stand-in servers here answer only what they name; anything else is
   recorded in window.__unknown, answered 501, and fails the test (design
   E2: unknown fetches throw). One test does not: "every account that signs
   in here is recorded" answers /auth/v1/user with the account and every
   other request with [], recording none. It drives cloudRender's whole
   signed-in start, whose other requests - the project list during it, and
   the status line's my_team and collection after it returns (measured) -
   this spec does not enumerate; what it asserts, pb.uids, is written from
   the /auth/v1/user answer alone, before any of them is made. And a
   request that gets past every stand-in is stopped before the network and
   fails the test (below). */
import { test, expect } from '@playwright/test';
import { seedTrait, seedDraft, findTrait } from './helpers.js';

/* NOTHING GOES TO THE NETWORK. The stand-ins replace window.fetch, and a
   request the page makes after one is put back - work it started and did
   not await - would go to the real project. So every request for the
   Supabase host is stopped here, as design E2 stops an unknown fetch, and
   the test that made it fails. Measured when this was written: with its
   stand-in put back, "every account that signs in here is recorded" made
   four (the status line's my_team and collection, once per sign-in). */
let pastTheStandIns = [];
test.beforeEach(async ({ page }) => {
  const seen = pastTheStandIns = [];
  await page.route(/\.supabase\.co\//, (route) => {
    seen.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
    return route.abort();
  });
});
test.afterEach(async () => {
  expect(pastTheStandIns, 'no request got past the stand-ins to the network').toEqual([]);
});

const session = (page, uid, token) => page.evaluate(([uid, token]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: token || 'not-a-real-token',
    refresh_token: 'not-a-real-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: uid ? { id: uid } : null }));
}, [uid, token || null]);

/* A stand-in server for a pull: one row, and its picture. */
const pullOne = (page, row, ws) => page.evaluate(async ([row, ws]) => {
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team1');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team1', name: 'One', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats', 'hair', 'unsorted'] }]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json([row], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/') >= 0 && m === 'GET') return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
  activeWs = ws; cloudTeamId = null; dbp = null; dbpName = null;
  try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }
}, [row, ws || null]);

test.describe('stage 0: stamps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Stamp === 'function');
    await page.evaluate(async () => { window.__unknown = []; activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; s0SeenUid = null; groupCaughtUp = true; await dbClear(); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => window.__unknown || []);
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
    expect(unknown, 'every request had a named answer').toEqual([]);
  });

  test('a person\'s save carries the signed-in uid, "person", and a local id', async ({ page }) => {
    await session(page, 'u1');
    await page.evaluate(() => dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(4)]) }));
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.by, r.wk]).toEqual(['u1', 'person']);
    expect(r.lid).toMatch(/^l_/);
  });

  test('written again under the same id, it keeps its local id', async ({ page }) => {
    await session(page, 'u1');
    await seedTrait(page, { name: 'cap', layer: 'hats', lid: 'l_seed' });
    await page.evaluate(() => dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 2, blob: new Blob([new Uint8Array(4)]) }));
    expect((await findTrait(page, 'trait', 'cap', 'hats', 'wip')).lid).toBe('l_seed');
  });

  test('a status change gives the trait a new id and carries the local id, as it carries the row id', async ({ page }) => {
    await session(page, 'u1');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', synced: true, path: 'p/cap.png', lid: 'l_seed' });
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'approved');
    expect([r.lid, r.rowId, r.wk, r.by]).toEqual(['l_seed', 'row-1', 'person', 'u1']);
  });

  test('nobody signed in: no uid, and nothing made up', async ({ page }) => {
    await page.evaluate(() => dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(4)]) }));
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect(r.by).toBeUndefined();
    expect(r.wk).toBe('person');
  });

  test('a session from the sign-in link carries no user; the uid comes from its token', async ({ page }) => {
    const token = await page.evaluate(() => 'x.' + btoa(JSON.stringify({ sub: 'u9' })).replace(/=+$/, '') + '.y');
    await session(page, null, token);
    await page.evaluate(() => dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(4)]) }));
    expect((await findTrait(page, 'trait', 'cap', 'hats', 'wip')).by).toBe('u9');
  });

  test('a pull\'s copy is stamped "pull"; a drawing the pull re-stamps stays the person\'s', async ({ page }) => {
    await session(page, 'u1');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-old', rowAt: '2026-01-01T00:00:00+00:00',
      synced: true, path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'person' });
    await seedDraft(page, { traitId: 't_cap_hats_wip', at: 5, by: 'u1', wk: 'person' });
    await pullOne(page, { id: 'row-new', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect(r.rowId, 'the pull wrote this copy').toBe('row-new');
    expect([r.wk, r.by, r.lid]).toEqual(['pull', 'u1', 'l_seed']);
    const d = await page.evaluate(async () => { const x = await dbGet('autosave.t_cap_hats_wip'); return x && { wk: x.wk, by: x.by, at: x.at }; });
    expect(d.wk, 'a drawing is never stamped as a pull').toBe('person');
    expect(d.at, 'and the pull did re-stamp it').toBeGreaterThan(5);
  });

  test('a pull by another account on this browser: its copy is that account\'s, the drawing stays its maker\'s', async ({ page }) => {
    await session(page, 'u2');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-old', rowAt: '2026-01-01T00:00:00+00:00',
      synced: true, path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'person' });
    await seedDraft(page, { traitId: 't_cap_hats_wip', at: 5, by: 'u1', wk: 'person' });
    await pullOne(page, { id: 'row-new', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rowId, r.wk, r.by], 'a synced copy belongs to the account that pulled it (B1)').toEqual(['row-new', 'pull', 'u2']);
    const d = await page.evaluate(async () => { const x = await dbGet('autosave.t_cap_hats_wip'); return x && { wk: x.wk, by: x.by, at: x.at }; });
    expect(d.at, 'the pull did re-time the drawing').toBeGreaterThan(5);
    expect([d.wk, d.by], 'and did not make it the puller\'s').toEqual(['person', 'u1']);
  });

  test('a pull that merges the server\'s row into a picture never sent: still the person\'s, and still its maker\'s', async ({ page }) => {
    await session(page, 'u2');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00',
      synced: false, path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'person' });
    await pullOne(page, { id: 'row-new', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect(r.rowId, 'the pull did write this record (its repair, through shelfCore.mergeRemoteShelfRecord)').toBe('row-new');
    expect([r.synced, r.wk, r.by, r.lid]).toEqual([false, 'person', 'u1', 'l_seed']);
  });

  test('a pull that moves a trait to another layer is stamped "pull" and keeps its local id', async ({ page }) => {
    await session(page, 'u1');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00',
      synced: true, path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed' });
    await pullOne(page, { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hair', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' });
    const r = await findTrait(page, 'trait', 'cap', 'hair', 'wip');
    expect([r.wk, r.lid]).toEqual(['pull', 'l_seed']);
  });

  test('a send confirmation is stamped "sent"', async ({ page }) => {
    await session(page, 'u1');
    /* Seeded in the group's store, where the send below runs: dbGet and the
       confirmation's dbPut both use the store activeWs names. Seeded in the
       personal store, dbGet in team1 found nothing and cloudSyncOne threw on
       null before it sent anything (measured). */
    await page.evaluate(() => { activeWs = 'team1'; dbp = null; dbpName = null; });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', lid: 'l_seed' });
    const ok = await page.evaluate(async () => {
      const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
      const real = window.fetch;
      window.fetch = async (u, io) => {
        const s = String(u), m = (io && io.method) || 'GET';
        if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
        if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
        if (s.indexOf('/storage/v1/object/') >= 0 && m === 'POST') return json({ Key: 'x' });
        if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
        if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row-new', updated_at: '2026-09-27T12:00:00+00:00' }], 201);
        window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
        return json({ code: 'UNROUTED' }, 501);
      };
      activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
      try { return !!(await cloudSyncOne(await dbGet('t_cap_hats_wip'), null, {})); } finally { window.fetch = real; }
    });
    expect(ok).toBe(true);
    const r = await page.evaluate(async () => { const x = await dbGet('t_cap_hats_wip'); return { wk: x.wk, lid: x.lid, synced: x.synced }; });
    expect(r).toEqual({ wk: 'sent', lid: 'l_seed', synced: true });
  });

  test('every account that signs in here is recorded', async ({ page }) => {
    /* This drives cloudRender's whole signed-in start, whose other requests
       this spec does not enumerate: they are answered [] and not asserted. */
    const seen = await page.evaluate(async () => {
      const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      let who = 'u1';
      /* Left in place, never put back: cloudRender does not await the status
         line, which asks my_team and the collection after it returns
         (measured, four requests over the two sign-ins). They meet this, not
         the network. The page goes with the test. */
      window.fetch = async (u) => String(u).indexOf('/auth/v1/user') >= 0 ? json({ id: who }) : json([]);
      const signIn = async (uid) => {
        who = uid;
        localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'r',
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid } }));
        await cloudRender();
      };
      await signIn('u1'); await signIn('u2');
      const m = JSON.parse(localStorage.getItem('pb.uids'));
      return Object.keys(m).sort().map(k => k + ':' + (m[k].first <= m[k].last));
    });
    expect(seen).toEqual(['u1:true', 'u2:true']);
  });

  /* The three stamps below were covered by nothing: each could be removed
     with every test above still green (fix round 1). Each is calibrated by
     removing that one stamp or carry, which fails this test alone. */
  test('a weight or order sent on its own (cloudPatchOne) is stamped "sent" when the group confirms it', async ({ page }) => {
    await session(page, 'u1');
    await page.evaluate(() => { activeWs = 'team1'; dbp = null; dbpName = null; });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', synced: false, unsent: 'meta', rarity: 3,
      lid: 'l_seed', by: 'u1', wk: 'person' });
    const ok = await page.evaluate(async () => {
      const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
      const real = window.fetch;
      window.fetch = async (u, io) => {
        const s = String(u), m = (io && io.method) || 'GET';
        if (s.indexOf('/rest/v1/traits?id=eq.row-1') >= 0 && m === 'PATCH') return json([{ id: 'row-1', updated_at: '2026-09-27T12:00:00+00:00' }]);
        window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
        return json({ code: 'UNROUTED' }, 501);
      };
      try { return await cloudPatchOne(await dbGet('t_cap_hats_wip')); } finally { window.fetch = real; }
    });
    expect(ok, 'the group confirmed the patch').toBe(true);
    const r = await page.evaluate(async () => { const x = await dbGet('t_cap_hats_wip');
      return { wk: x.wk, lid: x.lid, synced: x.synced, unsent: x.unsent === undefined ? '(none)' : x.unsent }; });
    expect(r).toEqual({ wk: 'sent', lid: 'l_seed', synced: true, unsent: '(none)' });
  });

  test('a weight set on many traits at once (one shelf write, dbApplyShelfRecords) is the person\'s, and keeps the local id', async ({ page }) => {
    await session(page, 'u1');
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rarity: 1, lid: 'l_seed' });
    const n = await page.evaluate(async () => setRarityMany([await dbGet('t_cap_hats_wip')], 5));
    expect(n, 'one trait changed').toBe(1);
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rarity, r.wk, r.by, r.lid]).toEqual([5, 'person', 'u1', 'l_seed']);
  });

  test('renaming a trait in the editor gives it a new id and carries the local id, as it carries the row id', async ({ page }) => {
    await session(page, 'u1');
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(2, 2, 12, 12);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', lid: 'l_seed', bytes: png });
    const ok = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_wip'));
      if ($('tlayer').value !== 'hats') throw new Error('the editor opened the trait on ' + $('tlayer').value);
      $('tname').value = 'hat';
      return saveTraitNow();
    });
    expect(ok, 'the save went through').toBe(true);
    expect(await findTrait(page, 'trait', 'cap', 'hats', 'wip'), 'the old id is gone').toBeNull();
    const r = await findTrait(page, 'trait', 'hat', 'hats', 'wip');
    expect([r.lid, r.rowId, r.wk, r.by]).toEqual(['l_seed', 'row-1', 'person', 'u1']);
  });
});

/* SIGNING OUT DURING A PULL. Its own describe, waiting only for cloudPull,
   so it runs against the page BEFORE patch601 too: that is how its red is
   measured (Step 2), rather than claimed. */
const pullThenMaybeSignOut = (page, signOut) => page.evaluate(async (signOut) => {
  const row = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
    w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  let open; const gate = new Promise(r => { open = r; });
  window.__asked = false;
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team1', name: 'One', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json([row], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/') >= 0 && m === 'GET') { window.__asked = true; await gate; return new Response(new Blob([new Uint8Array([1])]), { status: 200 }); }
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
  activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
  const p = cloudPull({ quiet: true });
  while (!window.__asked) await new Promise(r => setTimeout(r, 10));
  if (signOut) cloudSignOut();
  open();
  try { await p; } catch (_) {}
  window.fetch = real;
  const names = async (ws) => { activeWs = ws; dbp = null; dbpName = null; return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name); };
  const out = { group: await names('team1'), personal: await names(null) };
  activeWs = null;
  return out;
}, signOut);

/* The same pull, held earlier: while the server is still listing its rows.
   cloudPull noted which project it was for only after that listing, so a
   sign-out during it was noted as the project, and the pull wrote on into
   the personal store (fix round 1, measured). The picture is not held. */
const pullRowsHeldMaybeSignOut = (page, signOut) => page.evaluate(async (signOut) => {
  const row = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
    w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  let open; const gate = new Promise(r => { open = r; });
  window.__asked = false;
  let held = false;
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team1', name: 'One', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      if (!held) { held = true; window.__asked = true; await gate; }
      return json([row], { 'Content-Range': '0-0/1' });
    }
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/') >= 0 && m === 'GET') return new Response(new Blob([new Uint8Array([1])]), { status: 200 });
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
  activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
  const p = cloudPull({ quiet: true });
  while (!window.__asked) await new Promise(r => setTimeout(r, 10));
  if (signOut) cloudSignOut();
  open();
  try { await p; } catch (_) {}
  window.fetch = real;
  const names = async (ws) => { activeWs = ws; dbp = null; dbpName = null; return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name); };
  const out = { group: await names('team1'), personal: await names(null) };
  activeWs = null;
  return out;
}, signOut);

test.describe('stage 0: signing out stops a running pull', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function' && typeof cloudSignOut === 'function');
    await page.evaluate(async () => { window.__unknown = []; activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; await dbClear(); });
    await session(page, 'u1');
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => window.__unknown || []);
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); });
    expect(unknown, 'every request had a named answer').toEqual([]);
  });

  test('signing out while a group pull is downloading stops it: nothing lands in the personal store', async ({ page }) => {
    const r = await pullThenMaybeSignOut(page, true);
    expect(r.personal).toEqual([]);
  });

  test('the control: the same pull, not interrupted, lands in the group\'s store', async ({ page }) => {
    const r = await pullThenMaybeSignOut(page, false);
    expect(r.group).toEqual(['cap']);
    expect(r.personal).toEqual([]);
  });

  test('signing out while a group pull is still listing its rows stops it: nothing lands in either store', async ({ page }) => {
    const r = await pullRowsHeldMaybeSignOut(page, true);
    expect(r.personal).toEqual([]);
    expect(r.group).toEqual([]);
  });

  test('the control: the same pull, its rows held and released with nobody signing out, lands in the group\'s store', async ({ page }) => {
    const r = await pullRowsHeldMaybeSignOut(page, false);
    expect(r.group).toEqual(['cap']);
    expect(r.personal).toEqual([]);
  });
});

/* THE DRAWING SAVED AS A SESSION ENDS KEEPS ITS MAKER (fix round 1, Review
   Focus 2). A session that ends - refused by the server, or signed out with
   an autosave still waiting - saves the drawing on its way out. That save is
   encoded first and written a task later, and by then nobody is signed in:
   the draft was written with no owner, over one that had an owner (measured).
   Each case has a control that differs only in the session ending. */
const openDrawing = (page) => page.evaluate(() => {
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  if (!ctx || draftId() !== AUTO_ID) throw new Error('the editor did not open a new drawing');
});
/* The drawing's draft once one has been written: polled, because the write
   lands after an encode the page does not hand back. */
const draftWhenWritten = (page) => page.evaluate(async () => {
  for (let i = 0; i < 400; i++) {
    const x = await dbGet(AUTO_ID);
    if (x) return { by: x.by === undefined ? '(none)' : x.by, wk: x.wk };
    await new Promise(r => setTimeout(r, 10));
  }
  return null;
});

test.describe('stage 0: the drawing saved as a session ends keeps its maker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Stamp === 'function' && typeof autosaveNow === 'function' && typeof sessionEnded === 'function');
    await page.evaluate(async () => { activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; await dbClear(); });
    await session(page, 'u1');
    await page.evaluate(() => { s0SeenUid = 'u1'; });   /* as cloudRender leaves a verified sign-in */
    await openDrawing(page);
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
  });

  test('a session the server refuses: the drawing saved on the way out keeps its maker', async ({ page }) => {
    /* As every caller of sessionEnded does: the stored session is cleared first. */
    await page.evaluate(() => { sbSaveSession(null); sessionEnded(); });
    expect(await draftWhenWritten(page)).toEqual({ by: 'u1', wk: 'person' });
  });

  test('the control: the same drawing, saved while still signed in, is its maker\'s', async ({ page }) => {
    await page.evaluate(() => { autosaveNow(); });
    expect(await draftWhenWritten(page)).toEqual({ by: 'u1', wk: 'person' });
  });

  test('signing out with an autosave still waiting: the drawing keeps its maker', async ({ page }) => {
    await page.evaluate(() => { autosave(); if (!autoPending) throw new Error('no autosave was waiting'); cloudSignOut(); });
    expect(await draftWhenWritten(page)).toEqual({ by: 'u1', wk: 'person' });
  });

  test('the control: the same waiting autosave, landing while still signed in, is its maker\'s', async ({ page }) => {
    await page.evaluate(() => { autosave(); if (!autoPending) throw new Error('no autosave was waiting'); });
    expect(await draftWhenWritten(page)).toEqual({ by: 'u1', wk: 'person' });
  });
});
