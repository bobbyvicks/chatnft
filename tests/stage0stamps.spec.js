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

/* A stand-in server for a pull: one row, and its picture. The row is listed
   on the first page only (offset=0), as a server lists it. Every stand-in
   here that lists rows does the same (adjudication after round 5): they
   answered every page with the row, so a pull saw it once per page, 500
   times, and wrote it once only because its first write marked the old id
   touched and the pull then skipped the other 499 copies (measured). */
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
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
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
    /* Added (adjudication after round 5): the move leaves one trait, not the
       old copy beside the new one. */
    expect(await page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').length), 'the store holds exactly one trait after the pull').toBe(1);
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
        /* Stage 0 part 3 (patch602): cloudPatchOne reads the project's
           protocol before it patches. No row: protocol 1, nothing held. */
        if (s.indexOf('select=id,protocol,switching_at') >= 0) return json([]);
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
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
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
      return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
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

/* SUPERSEDED (round 5): round 3's repairHeldMaybeSignOut and seedForRepair,
   which held the repair at draftsFollow or at dbDel. A re-id no longer
   calls either - it is one transaction now - so those holds reach nothing.
   What their three tests asserted is asserted by round 5's, below. */

/* THE REPAIR'S RE-ID IS ONE TRANSACTION (fix round 5). A record the server
   files under another id is deleted under its old id, put under the new one
   and its drawing moved, in one IndexedDB transaction, so a stop lands
   before it (nothing changed) or after it (all of it done).
   SUPERSEDED (round 5): round 4's repairStepHeld held each of three
   separate writes - the new id, the drawing, the old id - and its tests
   pinned the record under both ids after a stop. Separate writes left a
   permanent duplicate: the next pull turned it into a second trait, "cap-2",
   or never settled it (measured, round 4).
   The cases are round 4's. `unsent` is a trait this device never sent whose
   id collides with the server's row across the name/layer boundary - "cap"
   on "top_hats" (the server's) and "cap_top" on "hats" (this device's) are
   both t_cap_top_hats_wip (measured, re-review of round 3). `synced` is a
   synced trait the server moved from hats to hair. The personal store holds
   a trait and a drawing of its own under the same old id, so anything done
   in the wrong store shows there.
   `where` the stop comes:
     'before' - the repair's db() is held (armed by its sameRepair call, the
                last thing before it) and the stop comes while it is held;
     'after'  - from the complete event of the first readwrite transaction
                the repair makes in the group's store, so a stop between
                separate writes would land between them;
     'editor' - the editor holds the trait, and editorFollows is held before
                it runs, the stop coming while it is held;
     'during' - the moment that transaction is created, before any of its
                requests run (adjudication C1);
     'after20' - 20 ms after it completes, inside the tell's 150 ms
                (adjudication B).
   `newBy` is whose the record at the new id is.
   `stop` signs out, or not (the control). With `nextPull` the page signs
   back in and pulls again, nothing held. The stand-in lists the row on the
   first page only, as a server does: answering every page, it made a pull
   see the row once per page, 500 times (measured, round 5). Records read as
   id[lid synced|unsent], drawings as id@at ('moved' once re-stamped);
   `told` is what the other tabs were told, on the page's BroadcastChannel.

   SUPERSEDED (follow-up A, S9): was built on the id collision S9 removes.
   The `unsent` case and its three tests - "a re-id of unsent work whose id
   collides with the server's row, stopped just before its transaction:
   ...", "..., stopped just after its transaction: ..." and "the control:
   a re-id of unsent work ..., nobody stopping: ..." - are removed, not
   rebuilt: on the page with S9, no path re-ids unsent work. The pull
   merged the server's "cap" on top_hats into this device's other trait,
   "cap_top" on hats, and moved it to t_cap_top_top_hats_wip: that was S9's
   defect. Now "cap" arrives beside it as cap-2, and cap_top stays where it
   is, unsent (tests/pullidentitybyname.spec.js). Measured:
   - read: a pull's re-id is s0ReidTx, called from one place, cloudPull's
     repair loop, for a repair whose record id is not its old id. Repairs
     are planned in two places: the held branch, only for a synced record,
     and branch 2, now only for the same trait by its parts, whose merge
     keeps its id (localTraitId of the same name, layer and status). The
     re-id's plan check refuses a record changed since, synced included;
   - an instrument that reports every re-id s0ReidTx commits, and whether
     the record was synced (follow-up A's fa-work/s9/instrument.cjs). On
     the page before S9 (65b6baa) it reported 6 re-ids of unsent work,
     exactly from these three tests and stage0marks.spec.js's three. On
     the page with S9, over the 92 spec files that pull, import or open a
     group (998 tests), it reported 26 re-ids, every one of a synced
     copy, and none of unsent work. */
const repairCases = {
  synced: { layers: ['hats', 'hair'], oldId: 't_cap_hats_wip', newId: 't_cap_hair_wip',
    row: { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hair', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' },
    mine: { name: 'cap', layer: 'hats', status: 'wip', synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00',
      path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'pull' } },
};
const seedRepairCase = async (page, c) => {
  await seedTrait(page, { id: c.oldId, name: c.mine.name, layer: c.mine.layer, status: 'wip', synced: false, lid: 'l_personal', by: 'u9', wk: 'person' });
  await seedDraft(page, { traitId: c.oldId, at: 7, by: 'u9', wk: 'person' });   /* the personal store's own */
  await page.evaluate(() => { activeWs = 'team1'; dbp = null; dbpName = null; });
  await seedTrait(page, Object.assign({ id: c.oldId }, c.mine));
  await seedDraft(page, { traitId: c.oldId, at: 9, by: 'u1', wk: 'person' });
  await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
};
const reidStopped = (page, c, where, stop, nextPull) => page.evaluate(async ([c, where, stop, nextPull]) => {
  const json = (o, x) => new Response(JSON.stringify(o), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: c.layers }]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [c.row] : [], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return new Response(JSON.stringify({ code: 'UNROUTED' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
  };
  const read = async (ws) => { activeWs = ws; dbp = null; dbpName = null;
    return (await dbAll()).filter(i => i.kind === 'trait' || i.kind === 'autosave')
      .map(i => i.kind === 'autosave' ? i.id + '@' + (i.at > 1e9 ? 'moved' : i.at) : i.id + '[' + i.lid + (i.synced ? ' synced' : ' unsent') + ']').sort(); };
  const before = await read('team1');
  /* The setup's own tell goes first: the dbClear before each test arms
     tabsTell's 150 ms timer, which named the store current when it fired -
     the personal one, after a stop - and read as the repair's (measured). */
  for (let i = 0; i < 100 && tabTellTimer; i++) await new Promise(r => setTimeout(r, 10));
  if (tabTellTimer) throw new Error('a tell from the setup is still pending');
  const told = [];
  const post = tabChan.postMessage.bind(tabChan);
  tabChan.postMessage = (m) => { told.push(JSON.parse(JSON.stringify(m))); return post(m); };
  let open; const gate = new Promise(r => { open = r; });
  let armed = false, reached = false;
  const same = sameRepair, getDb = db, follows = editorFollows, tx = IDBDatabase.prototype.transaction;
  sameRepair = (a, b) => { armed = true; return same(a, b); };
  if (where === 'before') db = () => { const p = getDb(); if (armed) { armed = false; reached = true; return gate.then(() => p); } return p; };
  /* 'during': the stop comes the moment the transaction is created, before
     any of its requests run; 'after20': 20 ms after it completes, inside
     the tell's 150 ms (adjudication after round 5). */
  if (where === 'after' || where === 'during' || where === 'after20') IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
    const t = tx.call(this, names, mode, ...rest);
    if (armed && mode === 'readwrite' && this.name === 'chatnft.ws.team1') {
      armed = false; reached = true;
      if (where === 'during') { if (stop) cloudSignOut(); }
      else t.addEventListener('complete', () => { if (!stop) return; if (where === 'after20') setTimeout(() => cloudSignOut(), 20); else cloudSignOut(); });
    }
    return t;
  };
  if (where === 'editor') {
    activeWs = 'team1'; dbp = null; dbpName = null;
    openRec = await dbGet(c.oldId);
    if (!openRec) throw new Error('the editor holds nothing');
    editorFollows = async (was, to) => { reached = true; await gate; return follows(was, to); };
  }
  activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
  const gen0 = wsGen;
  const p = cloudPull({ quiet: true });
  if (where === 'before' || where === 'editor') {
    for (let i = 0; i < 500 && !reached; i++) await new Promise(r => setTimeout(r, 10));
    if (reached && stop) cloudSignOut();
    open();
  }
  try { await p; } catch (_) {}
  await new Promise(r => setTimeout(r, 400));   /* past tabsTell's 150 ms */
  sameRepair = same; db = getDb; editorFollows = follows; IDBDatabase.prototype.transaction = tx; tabChan.postMessage = post;
  const out = { reached, stopped: wsGen !== gen0, before, group: await read('team1'), personal: await read(null), told };
  { activeWs = 'team1'; dbp = null; dbpName = null; const x = await dbGet(c.newId); out.newBy = x ? (x.by === undefined ? '(none)' : x.by) : '(no record)'; }
  if (where === 'editor') out.editorOn = openRec && openRec.id;
  if (nextPull) {
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    authed = true; gateShow(false);
    activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
    try { await cloudPull({ quiet: true }); } catch (_) {}
    out.afterNextPull = await read('team1');
  }
  window.fetch = real;
  activeWs = null;
  return out;
}, [c, where, stop, !!nextPull]);

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

  /* SUPERSEDED (round 5), round 3's three repair tests - "signing out while
     a pull's repair moves a trait to another layer: the group's record does
     not land in the personal store", "signing out while the repair is
     removing the old copy: the personal store's own draft is not moved
     either", and their control. They held draftsFollow and dbDel, which a
     re-id no longer calls. What they asserted - nothing of the group's in
     the personal store, and the personal store's own drawing left alone - is
     asserted below for every stop.
     SUPERSEDED (round 5), round 4's eight - "a repair that re-ids unsent
     work ..., stopped after it writes the new id / moves the drawing /
     removes the old id: nothing is lost ...", the synced stop after the
     write, and their four controls. They pinned the record under both ids
     after a stop: separate writes left a permanent duplicate (measured,
     round 4). */
  const personalUntouched = (c) => ['autosave.' + c.oldId + '@7', c.oldId + '[l_personal unsent]'];
  const asSeeded = (c) => ['autosave.' + c.oldId + '@9', c.oldId + '[' + c.mine.lid + (c.mine.synced ? ' synced' : ' unsent') + ']'];
  const whole = (c) => ['autosave.' + c.newId + '@moved', c.newId + '[' + c.mine.lid + (c.mine.synced ? ' synced' : ' unsent') + ']'];
  /* SUPERSEDED (follow-up A, S9): the `unsent` case's three tests, removed
     (see repairCases). */
  for (const [key, what] of [['synced', 'a synced trait the server moved to another layer']]) {
    const c = repairCases[key];

    test('a re-id of ' + what + ', stopped just before its transaction: the store exactly as it was, and the next pull makes it whole', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await reidStopped(page, c, 'before', true, true);
      expect({ reached: r.reached, before: r.before, group: r.group, personal: r.personal, told: r.told, afterNextPull: r.afterNextPull })
        .toEqual({ reached: true, before: asSeeded(c), group: asSeeded(c), personal: personalUntouched(c), told: [], afterNextPull: whole(c) });
    });

    /* SUPERSEDED (adjudication B): round 5's "... stopped just after its
       transaction: whole, in the group's store only, and told to no tab",
       which asserted told: []. Ruled: a committed move is told to its own
       store's tabs even after a stop - left untold, the group's other tabs
       never learned of it. The stores are asserted as before. */
    test('a re-id of ' + what + ', stopped just after its transaction: whole, in the group\'s store only, and told to the group\'s tabs only', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await reidStopped(page, c, 'after', true);
      /* (Final adjudication touch: `stopped` asserted, so this test and its
         control differ by one asserted field.) */
      expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal, told: r.told })
        .toEqual({ reached: true, stopped: true, group: whole(c), personal: personalUntouched(c), told: [{ db: 'chatnft.ws.team1', moved: [{ from: c.oldId, to: c.newId }] }] });
    });

    test('the control: a re-id of ' + what + ', nobody stopping: whole, and told to this project\'s tabs', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await reidStopped(page, c, 'after', false);
      expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal, told: r.told })
        .toEqual({ reached: true, stopped: false, group: whole(c), personal: personalUntouched(c), told: [{ db: 'chatnft.ws.team1', moved: [{ from: c.oldId, to: c.newId }] }] });
    });
  }

  /* The editor holding the trait. Its drawing used to move only after the
     editor had followed, in whatever store was named by then, so a stop
     during the follow moved the personal store's own drawing away from its
     trait (measured, rounds 3 and 4). It moves inside the transaction now,
     and the editor follows after. */
  test('the editor holding the trait, a stop while it follows the re-id: the personal store\'s own drawing stays with its trait, and the group\'s drawing is at the new id', async ({ page }) => {
    const c = repairCases.synced;
    await seedRepairCase(page, c);
    const r = await reidStopped(page, c, 'editor', true);
    expect({ reached: r.reached, group: r.group, personal: r.personal, editorOn: r.editorOn })
      .toEqual({ reached: true, group: whole(c), personal: personalUntouched(c), editorOn: c.oldId });
    /* Added (adjudication B): it captured told and never asserted it. The
       stop comes after the move was told, inside the tell's 150 ms. */
    expect(r.told, 'the move is told to the group\'s store, and nothing to the personal one').toEqual([{ db: 'chatnft.ws.team1', moved: [{ from: c.oldId, to: c.newId }] }]);
  });

  test('the control: the editor holding the trait, nobody stopping: it follows the re-id to the new id', async ({ page }) => {
    const c = repairCases.synced;
    await seedRepairCase(page, c);
    const r = await reidStopped(page, c, 'editor', false);
    expect({ reached: r.reached, group: r.group, personal: r.personal, editorOn: r.editorOn })
      .toEqual({ reached: true, group: whole(c), personal: personalUntouched(c), editorOn: c.newId });
  });

  /* Adjudication B. A STOP INSIDE THE TELL'S 150 MS. The tell named the
     store current when its timer fired, so a sign-out 20 ms after the
     commit told the personal store's tabs of the group's move - an editor
     there jumped, and a drawing was lost - and never told the group's
     (measured, re-review of rounds 4-5). */
  test('a re-id of a synced trait, a sign-out 20 ms after its transaction: the move is told to the group\'s store, and nothing to the personal one', async ({ page }) => {
    const c = repairCases.synced;
    await seedRepairCase(page, c);
    const r = await reidStopped(page, c, 'after20', true);
    expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal, told: r.told })
      .toEqual({ reached: true, stopped: true, group: whole(c), personal: personalUntouched(c), told: [{ db: 'chatnft.ws.team1', moved: [{ from: c.oldId, to: c.newId }] }] });
  });

  /* Adjudication C1. WHOSE COPY, TAKEN WITH THE ASK. The re-id stamped the
     record in its get's handler, which read the uid then: a sign-out after
     the transaction was created left the group's synced copy with no owner
     (measured). */
  test('a re-id of a synced trait, a sign-out the moment its transaction is created: the copy is still its puller\'s', async ({ page }) => {
    const c = repairCases.synced;
    await seedRepairCase(page, c);
    const r = await reidStopped(page, c, 'during', true);
    expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal, newBy: r.newBy })
      .toEqual({ reached: true, stopped: true, group: whole(c), personal: personalUntouched(c), newBy: 'u1' });
  });

  /* Adjudication C2. TWO TABS OF ONE GROUP. This tab's pull plans a re-id
     (the server moved row-1 from hats to hair) and is held just before its
     transaction; meanwhile another tab of the same group approves the trait
     (a new id, unsent) or reweights it with its send failing (unsent). The
     re-id deleted the old id and put its plan regardless: two records for
     one row, or the unsent weight silently gone (measured). It now does
     nothing when the old id is no longer what it planned from, and the
     next pull decides again. */
  const twoTabs = async (page, context, what) => {
    const B = await context.newPage();
    await B.route(/\.supabase\.co\//, (route) => {
      pastTheStandIns.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
      return route.abort();
    });
    /* The other tab opens signed out, so its start asks nothing: the stored
       session is shared, and with it the start asked /auth/v1/user before
       any stand-in was in place (measured). It is put back once B is up. */
    const session = await page.evaluate(() => { const s = localStorage.getItem('chatnft.session'); localStorage.removeItem('chatnft.session'); return s; });
    await B.goto('/index.html');
    await B.waitForFunction(() => typeof cloudPull === 'function' && typeof setTraitStatus === 'function' && typeof setRarity === 'function');
    await page.evaluate((s) => localStorage.setItem('chatnft.session', s), session);
    const standIn = () => {
      /* (Final adjudication touch: the row is window.__row, so a test can have
         the server hold a new weight for the next pull; and a PATCH can be
         answered - the weight sent - or held and then failed.) */
      window.__row = window.__row || { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hair', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png', w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
      const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
      window.__unknown = window.__unknown || [];
      window.fetch = async (u, io) => {
        const s = String(u), m = (io && io.method) || 'GET';
        if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
        if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats', 'hair'] }]);
        if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
        if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [window.__row] : [], { 'Content-Range': '0-0/1' });
        if (m === 'PATCH' && s.indexOf('/rest/v1/traits?id=eq.row-1') >= 0 && window.__patchMode === 'sent')
          return json([Object.assign({}, window.__row, { rarity: 5, updated_at: '2026-09-27T13:00:00+00:00' })]);
        if (m === 'PATCH' && s.indexOf('/rest/v1/traits?id=eq.row-1') >= 0 && window.__patchMode === 'held') {
          window.__patchHeld = true; await window.__patchGate; throw new TypeError('Failed to fetch');
        }
        if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
        /* The other tab's sends fail, as on a dropped connection, so its change
           stays unsent: its reweight's PATCH, and its approval's upload. */
        if (window.__patchFails && m === 'PATCH') throw new TypeError('Failed to fetch');
        if (window.__uploadFails && m === 'POST' && s.indexOf('/storage/v1/object/') >= 0) throw new TypeError('Failed to fetch');
        window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
        return new Response('{}', { status: 501, headers: { 'Content-Type': 'application/json' } });
      };
    };
    await page.evaluate(async () => {
      activeWs = 'team1'; dbp = null; dbpName = null; groupCaughtUp = true;
      const d = await db();
      await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite');
        t.objectStore('items').put({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1,
          blob: new Blob([new Uint8Array(16)]), synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team1/c1/trait-cap-hats-wip.png',
          lid: 'l_seed', by: 'u1', wk: 'pull' });
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    });
    await B.evaluate(() => { window.__unknown = []; authed = true; groupCaughtUp = true; activeWs = 'team1'; dbp = null; dbpName = null; });
    await page.evaluate(standIn); await B.evaluate(standIn);
    /* This tab's pull, held just before its re-id's transaction. */
    await page.evaluate(() => {
      window.__held = false;
      let open; const gate = new Promise(r => { open = r; }); window.__open = open;
      const same = sameRepair, getDb = db; let armed = false;
      window.__restore = () => { sameRepair = same; db = getDb; };
      sameRepair = (x, y) => { armed = true; return same(x, y); };
      db = () => { const p = getDb(); if (armed) { armed = false; window.__held = true; return gate.then(() => p); } return p; };
      activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
      window.__pull = cloudPull({ quiet: true }).catch(e => 'pull error ' + e);
    });
    await page.waitForFunction(() => window.__held, null, { timeout: 10000 });
    const other = what === 'none' ? null : await B.evaluate(async (what) => {
      const r = await dbGet('t_cap_hats_wip');
      if (what === 'approve') { window.__uploadFails = true; await setTraitStatus(r, 'approved'); }
      if (what === 'weight') { window.__patchFails = true; await setRarity(r, 5); }
      if (what === 'weight-sent') { window.__patchMode = 'sent'; await setRarity(r, 5); }
      if (what === 'weight-late') {
        window.__patchMode = 'held'; let o; window.__patchGate = new Promise(res => { o = res; }); window.__patchOpen = o;
        window.__b = setRarity(r, 5);
        for (let i = 0; i < 300 && !window.__patchHeld; i++) await new Promise(res => setTimeout(res, 10));
        if (!window.__patchHeld) throw new Error('the other tab\'s PATCH is not held');
      }
      return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + (i.synced ? '' : ' unsent')).sort();
    }, what);
    const read = () => page.evaluate(async () => { activeWs = 'team1'; dbp = null; dbpName = null;
      return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' ' + i.status + ' ' + i.rarity + (i.synced ? ' synced' : ' unsent') + ' ' + i.lid + ']').sort(); });
    await page.evaluate(async () => { window.__open(); await window.__pull; window.__restore(); await new Promise(r => setTimeout(r, 300)); });
    const afterThisPull = await read();
    let afterTheOtherFailed;
    if (what === 'weight-late') {
      await B.evaluate(async () => { window.__patchOpen(); await window.__b; await new Promise(r => setTimeout(r, 200)); });
      afterTheOtherFailed = await read();
    }
    /* The server holds the weight the other tab sent, for the next pull. */
    if (what === 'weight-sent') await page.evaluate(() => { window.__row = Object.assign({}, window.__row, { rarity: 5, updated_at: '2026-09-27T13:00:00+00:00' }); });
    await page.evaluate(async () => { activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null; await cloudPull({ quiet: true }); });
    const afterTheNext = await read();
    const otherUnknown = await B.evaluate(() => window.__unknown.slice());
    await page.evaluate(() => { activeWs = null; });
    await B.close();
    return afterTheOtherFailed === undefined ? { other, afterThisPull, afterTheNext, otherUnknown }
      : { other, afterThisPull, afterTheOtherFailed, afterTheNext, otherUnknown };
  };

  test('another tab of the group approves the trait while this tab\'s pull is about to re-id it: nothing lost, nothing duplicated', async ({ page, context }) => {
    const r = await twoTabs(page, context, 'approve');
    expect(r).toEqual({ other: ['t_cap_hats_approved unsent'], otherUnknown: [],
      afterThisPull: ['t_cap_hats_approved[row-1 approved 1 unsent l_seed]'], afterTheNext: ['t_cap_hats_approved[row-1 approved 1 unsent l_seed]'] });
  });

  test('another tab of the group reweights the trait, unsent, while this tab\'s pull is about to re-id it: the weight is kept', async ({ page, context }) => {
    const r = await twoTabs(page, context, 'weight');
    expect(r).toEqual({ other: ['t_cap_hats_wip unsent'], otherUnknown: [],
      afterThisPull: ['t_cap_hats_wip[row-1 wip 5 unsent l_seed]'], afterTheNext: ['t_cap_hats_wip[row-1 wip 5 unsent l_seed]'] });
  });

  /* Final adjudication touch. THE ORDERINGS THE PLAN CHECK MISSED. It
     compared rowAt, synced and at, and a reweight's first write changes
     none of them: the re-id wrote the plan's weight over it (measured). It
     compares every field a merge compares, and at, now. */
  test('another tab reweights the trait and its send is answered before this tab\'s re-id: the re-id is skipped, and the next pull settles it at that weight', async ({ page, context }) => {
    const r = await twoTabs(page, context, 'weight-sent');
    expect(r).toEqual({ other: ['t_cap_hats_wip'], otherUnknown: [],
      afterThisPull: ['t_cap_hats_wip[row-1 wip 5 synced l_seed]'], afterTheNext: ['t_cap_hair_wip[row-1 wip 5 synced l_seed]'] });
  });

  test('another tab reweights the trait and its send, held across this tab\'s re-id, then fails: one record for the row, unsent at that weight', async ({ page, context }) => {
    const r = await twoTabs(page, context, 'weight-late');
    /* Task 11 fix round 3, ruling 3 (the unsent mark is written ahead of the send): other and afterThisPull read unsent while the PATCH is in flight; were ['t_cap_hats_wip'] and '...5 synced...', which return with the ahead mark removed (measured). */
    expect(r).toEqual({ other: ['t_cap_hats_wip unsent'], otherUnknown: [],
      afterThisPull: ['t_cap_hats_wip[row-1 wip 5 unsent l_seed]'], afterTheOtherFailed: ['t_cap_hats_wip[row-1 wip 5 unsent l_seed]'],
      afterTheNext: ['t_cap_hats_wip[row-1 wip 5 unsent l_seed]'] });
  });

  test('the control: two tabs, the other doing nothing: the re-id goes ahead', async ({ page, context }) => {
    const r = await twoTabs(page, context, 'none');
    expect(r).toEqual({ other: null, otherUnknown: [],
      afterThisPull: ['t_cap_hair_wip[row-1 wip 1 synced l_seed]'], afterTheNext: ['t_cap_hair_wip[row-1 wip 1 synced l_seed]'] });
  });

  /* Adjudication C3. A CLOSING SAVE OF THE TRAIT BEING RE-ID'D, STILL IN
     FLIGHT. autosaveNow fixes its key, the old id's, before its encode; one
     landing after the move wrote the latest strokes under an id no trait
     has (measured). The re-id waits for it now, bounded. The save here
     lands 200 ms into the pull, as a real encode lands while a pull runs;
     the control lets it land before the pull.
     SUPERSEDED (final adjudication touch): drawings were read as id@new|@9,
     by their at alone, and the re-id re-stamps any drawing it moves, so a
     closing save lost with the seed drawing moved in its place still read
     '@new'. They read by their content now: id@name - 'g.png' the seed,
     'cap.png' the closing save - and ' - NO TRAIT' when no trait has their
     id; traits as id[weight]. `inFlightAtReid` is whether the closing save
     was still in flight when the pull reached the re-id (its sameRepair
     call). With `reweight`, this tab reweights the trait while the re-id
     waits for the save (final adjudication touch). */
  const closingSaveAcrossPull = (page, inFlight, reweight) => page.evaluate(async ([inFlight, reweight]) => {
    s0SeenUid = 'u1'; groupCaughtUp = true;
    activeWs = 'team1'; dbp = null; dbpName = null;
    const d = await db();
    await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite'), s = t.objectStore('items');
      s.put({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1, blob: new Blob([new Uint8Array(16)]),
        synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'pull' });
      s.put({ id: 'autosave.t_cap_hats_wip', kind: 'autosave', traitId: 't_cap_hats_wip', name: 'g.png', w: 16, h: 16, at: 9, by: 'u1', wk: 'person', blob: new Blob([new Uint8Array(16)]) });
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    const row = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hair', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png', w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
    const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
    const real = window.fetch;
    window.fetch = async (u, io) => {
      const s = String(u), m = (io && io.method) || 'GET';
      if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
      if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats', 'hair'] }]);
      if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
      if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
      if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
      if (m === 'PATCH' && s.indexOf('/rest/v1/traits?id=eq.row-1') >= 0) return json([Object.assign({}, row, { rarity: 5, updated_at: '2026-09-27T13:00:00+00:00' })]);
      window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
      return new Response('{}', { status: 501, headers: { 'Content-Type': 'application/json' } });
    };
    /* The editor holds the group's trait, drawn on since it was opened. */
    const n = 16, dd = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
    fileName = 'cap.png';
    startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
    openRec = await dbGet('t_cap_hats_wip');
    savedSig = 'drawn on since it was opened';
    let release = null;
    if (inFlight) {
      const encode = art.toBlob.bind(art);
      const gate = new Promise(r => { release = r; });
      art.toBlob = (cb, t) => encode(b => { gate.then(() => cb(b)); }, t);
    }
    const key = draftId();
    const closing = closeEditor();   /* its closing save starts now, keyed to the old id */
    const savingAtClose = !!s0SaveInFlight;
    if (!inFlight) await closing;
    /* The pull's re-id is reached at its sameRepair call; whether the closing
       save is still in flight is noted there. The re-id's wait for it is seen
       at s0SaveOf. */
    let inFlightAtReid = null, waiting = false;
    const same = sameRepair, saveOf = s0SaveOf;
    sameRepair = (a, b) => { if (inFlightAtReid === null) inFlightAtReid = !!s0SaveInFlight; return same(a, b); };
    s0SaveOf = (k) => { const p = saveOf(k); if (p) waiting = true; return p; };
    activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
    const pulling = cloudPull({ quiet: true });
    if (inFlight && !reweight) setTimeout(() => release(), 200);
    if (inFlight && reweight) {
      for (let i = 0; i < 300 && !waiting; i++) await new Promise(r => setTimeout(r, 10));
      if (!waiting) throw new Error('the re-id never waited for the save');
      await setRarity(await dbGet('t_cap_hats_wip'), 5);   /* this tab's own change, during the wait */
      release();
    }
    await pulling;
    await closing;
    await new Promise(r => setTimeout(r, 300));
    sameRepair = same; s0SaveOf = saveOf;
    window.fetch = real;
    activeWs = 'team1'; dbp = null; dbpName = null;
    const all = await dbAll();
    activeWs = null;
    return { key, savingAtClose, inFlightAtReid, group: all.filter(i => i.kind === 'trait' || i.kind === 'autosave')
      .map(i => i.kind === 'autosave' ? i.id + '@' + i.name + (all.some(t => t.kind === 'trait' && t.id === i.traitId) ? '' : ' - NO TRAIT') : i.id + '[' + i.rarity + ']').sort() };
  }, [inFlight, !!reweight]);

  test('a closing save of the trait being re-id\'d, still in flight when the pull moves it: the latest drawing goes with it', async ({ page }) => {
    expect(await closingSaveAcrossPull(page, true)).toEqual({ key: 'autosave.t_cap_hats_wip', savingAtClose: true, inFlightAtReid: true, group: ['autosave.t_cap_hair_wip@cap.png', 't_cap_hair_wip[1]'] });
  });

  test('the control: the same closing save, landed before the pull: the drawing goes with the trait', async ({ page }) => {
    expect(await closingSaveAcrossPull(page, false)).toEqual({ key: 'autosave.t_cap_hats_wip', savingAtClose: true, inFlightAtReid: false, group: ['autosave.t_cap_hair_wip@cap.png', 't_cap_hair_wip[1]'] });
  });

  /* Final adjudication touch. THIS TAB'S OWN CHANGE DURING THE WAIT. The re-id
     waits for the closing save after the loop asked touchedSince, and did not
     ask again: a reweight made here during the wait was written over
     (measured). It asks again after the wait now. (The plan check - every
     field a merge compares - sees this reweight too.) Its control is the
     in-flight test above: the same wait, no reweight, the re-id goes ahead. */
  test('this tab reweights the trait while the re-id waits for its closing save: the weight survives', async ({ page }) => {
    expect(await closingSaveAcrossPull(page, true, true)).toEqual({ key: 'autosave.t_cap_hats_wip', savingAtClose: true, inFlightAtReid: true, group: ['autosave.t_cap_hats_wip@cap.png', 't_cap_hats_wip[5]'] });
  });

  /* Final adjudication touch. WHOSE COPY, ON THE PULL'S OTHER WRITES. C1
     passed the uid taken with the ask to the same-id repair and to a
     download too, and no spec failed without it. A sign-out right after the
     write is called - before its stamp is taken in its get's handler - must
     leave the copy its puller's. */
  const pullWriteSignedOut = (page, which) => page.evaluate(async (which) => {
    activeWs = 'team1'; dbp = null; dbpName = null; groupCaughtUp = true;
    if (which === 'repair') {
      const d = await db();
      await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite');
        t.objectStore('items').put({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1, blob: new Blob([new Uint8Array(16)]),
          synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'pull' });
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    }
    /* repair: the same trait, reweighted on the server (same id); download: a trait new here. */
    const row = which === 'repair'
      ? { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png', w: 16, h: 16, rarity: 4, updated_at: '2026-09-27T12:00:00+00:00' }
      : { id: 'row-2', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip', path: 'team1/c1/trait-hat-hats-wip.png', w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
    const id = which === 'repair' ? 't_cap_hats_wip' : 't_hat_hats_wip';
    const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
    const real = window.fetch;
    window.fetch = async (u, io) => {
      const s = String(u), m = (io && io.method) || 'GET';
      if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
      if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
      if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
      if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
      if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
      if (s.indexOf('/storage/v1/object/') >= 0 && m === 'GET') return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
      window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
      return new Response('{}', { status: 501, headers: { 'Content-Type': 'application/json' } });
    };
    let signedOutAt = false;
    const put = dbPut;
    dbPut = (rec, wk, uid) => { const p = put(rec, wk, uid); if (!signedOutAt && wk === 'pull' && rec && rec.id === id) { signedOutAt = true; cloudSignOut(); } return p; };
    const gen0 = wsGen;
    activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
    try { await cloudPull({ quiet: true }); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
    dbPut = put; window.fetch = real;
    activeWs = 'team1'; dbp = null; dbpName = null;
    const x = await dbGet(id);
    activeWs = null;
    return { signedOutAtTheWrite: signedOutAt, stopped: wsGen !== gen0, by: x ? (x.by === undefined ? '(none)' : x.by) : '(no record)', wk: x && x.wk };
  }, which);

  test('a pull\'s repair of a synced trait under its own id, a sign-out at the write: the copy is still its puller\'s', async ({ page }) => {
    expect(await pullWriteSignedOut(page, 'repair')).toEqual({ signedOutAtTheWrite: true, stopped: true, by: 'u1', wk: 'pull' });
  });

  test('a pull\'s download of a trait new here, a sign-out at the write: the copy is still its puller\'s', async ({ page }) => {
    expect(await pullWriteSignedOut(page, 'download')).toEqual({ signedOutAtTheWrite: true, stopped: true, by: 'u1', wk: 'pull' });
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

  /* Sign-out waits for a drawing's last save (fix round 2, below). These two
     hold it to its limits: with nothing to save it is as immediate as it
     always was, and a save that never finishes holds it up only so long. */
  test('signing out with nothing waiting is immediate, as it always was: no write and no wait', async ({ page }) => {
    const r = await page.evaluate(async () => {
      /* Opening a drawing schedules its first autosave, so this one is let
         land first: a drawing already saved, which is the common case. */
      await autosaveNow();
      if (autoPending) throw new Error('an autosave is still waiting');
      const before = (await dbGet(AUTO_ID)).at;
      const gen = wsGen;
      cloudSignOut();
      /* Read in the same task: nothing was waited for. */
      const now = { session: localStorage.getItem('chatnft.session'), gen: wsGen - gen, uid: s0SeenUid };
      await new Promise(res => setTimeout(res, 2000));
      return { now, wroteAgain: (await dbGet(AUTO_ID)).at !== before };
    });
    expect(r).toEqual({ now: { session: null, gen: 1, uid: null }, wroteAgain: false });
  });

  test('a save that never finishes holds sign-out up for its bound, not for ever', async ({ page }) => {
    const r = await page.evaluate(async () => {
      art.toBlob = () => {};   /* an encode that never calls back */
      autosave(); if (!autoPending) throw new Error('no autosave was waiting');
      const t0 = performance.now(), gen = wsGen;
      cloudSignOut();
      /* Watched by wsGen, which waits for the save. Not by the stored
         session: since fix round 4 that goes before the wait, so this read
         as signed out at once and could no longer fail. */
      while (wsGen === gen && performance.now() - t0 < 10000) await new Promise(res => setTimeout(res, 25));
      return { signedOut: wsGen !== gen && !localStorage.getItem('chatnft.session'), ms: Math.round(performance.now() - t0) };
    });
    console.log('a stalled save held sign-out for ' + r.ms + ' ms');
    expect(r.signedOut, 'sign-out went ahead').toBe(true);
    expect(r.ms, 'within the 3 s bound and a margin').toBeLessThan(4500);
    /* Added (adjudication after round 5), so the title's first half can fail
       too: it did hold sign-out up for the bound. */
    expect(r.ms, 'held for the bound').toBeGreaterThanOrEqual(2900);
  });
});

/* A DRAWING'S LAST SAVE LANDS IN THE STORE IT WAS DRAWN IN (fix round 2). The
   store an autosave writes to is chosen when the write lands, a task after it
   starts, and a sign-out or a project switch in between moved activeWs
   first: a group's drawing was filed in the personal store, or in the group
   switched to (measured). sessionEnded changes no store, and its save
   already lands right (measured), so it has no test here. A drawing on the
   page of project `ws` (null: the personal page), its autosave left waiting -
   or, with `saving`, already started - then `act`. After the autosave
   timer's 1.5 s and a margin, answers whose draft each store holds. */
const lastSaveLandsIn = (page, ws, act, saving) => page.evaluate(async ([ws, act, saving]) => {
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  /* Left in place: what a switch starts runs on after it returns. */
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true },
      { id: 'team1', name: 'One', personal: false }, { id: 'team2', name: 'Two', personal: false }]);
    /* The group switched to: a collection, and nothing in it yet. */
    if (s.indexOf('/rest/v1/collections?') >= 0 && m === 'GET') return json([{ id: 'c2', layers: ['hats'], updated_at: '2026-09-27T12:00:00+00:00' }]);
    if (s.indexOf('/rest/v1/traits?select=') >= 0 && s.indexOf('collection_id=eq.c2') >= 0 && m === 'GET')
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return new Response(JSON.stringify({ code: 'UNROUTED' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
  };
  for (const s of [null, 'team1', 'team2']) { activeWs = s; dbp = null; dbpName = null; await dbClear(); }
  activeWs = ws; dbp = null; dbpName = null;
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  if (saving) autosaveNow();
  else { autosave(); if (!autoPending) throw new Error('no autosave was waiting'); }
  if (act === 'signOut') await cloudSignOut();
  if (act === 'switch') await wsSwitch('team2');
  await new Promise(res => setTimeout(res, 2500));
  const read = async (s) => { activeWs = s; dbp = null; dbpName = null; const x = await dbGet(AUTO_ID); return x ? (x.by === undefined ? '(none)' : x.by) : null; };
  const out = { team1: await read('team1'), team2: await read('team2'), personal: await read(null) };
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, [ws, act, !!saving]);

test.describe('stage 0: a drawing\'s last save lands in the store it was drawn in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Stamp === 'function' && typeof autosaveNow === 'function' && typeof wsSwitch === 'function');
    await page.evaluate(() => { window.__unknown = []; activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; });
    await session(page, 'u1');
    await page.evaluate(() => { s0SeenUid = 'u1'; });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => window.__unknown || []);
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
    expect(unknown, 'every request had a named answer').toEqual([]);
  });

  test('signing out on a group page with an autosave waiting: the draft lands in the group\'s store, its maker\'s, and the personal store gets nothing', async ({ page }) => {
    expect(await lastSaveLandsIn(page, 'team1', 'signOut')).toEqual({ team1: 'u1', team2: null, personal: null });
  });

  test('the control: the same on the personal page lands in the personal store, its maker\'s', async ({ page }) => {
    expect(await lastSaveLandsIn(page, null, 'signOut')).toEqual({ team1: null, team2: null, personal: 'u1' });
  });

  test('signing out on a group page while an autosave is being written: it lands in the group\'s store too', async ({ page }) => {
    expect(await lastSaveLandsIn(page, 'team1', 'signOut', true)).toEqual({ team1: 'u1', team2: null, personal: null });
  });

  test('the control: the same autosave being written, signing out on the personal page, lands in the personal store', async ({ page }) => {
    expect(await lastSaveLandsIn(page, null, 'signOut', true)).toEqual({ team1: null, team2: null, personal: 'u1' });
  });

  test('switching from a group to another group with an autosave waiting: the draft lands in the group it was drawn in', async ({ page }) => {
    expect(await lastSaveLandsIn(page, 'team1', 'switch')).toEqual({ team1: 'u1', team2: null, personal: null });
  });

  test('the control: the same waiting autosave on the group page, with no switch, lands in that group\'s store', async ({ page }) => {
    expect(await lastSaveLandsIn(page, 'team1', 'none')).toEqual({ team1: 'u1', team2: null, personal: null });
  });
});

/* A SESSION THE PAGE COULD NOT CHECK STILL HAS ITS UID (fix round 3). A page
   that opens with no signal treats the stored session as signed in
   (cloudRender's offline and deadline branch) but never learned whose it
   was, so the uid came only from the stored session - which every refusal
   clears before sessionEnded saves the drawing: that draft was written with
   no owner (measured). The same drawing and refusal after a verified boot
   is the control. Also pinned: the uid is on this browser's list of
   accounts either way. */
const bootDrawThenRefuse = (page, verified) => page.evaluate(async (verified) => {
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  /* Left in place: what the signed-in start leaves running asks after it returns. */
  window.fetch = verified
    ? async (u, io) => {
      const s = String(u), m = (io && io.method) || 'GET';
      if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
      if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }]);
      if (s.indexOf('/rpc/my_team') >= 0) return json('me');
      if (s.indexOf('/rest/v1/collections?') >= 0 && m === 'GET') return json([{ id: 'c1', updated_at: '2026-09-27T12:00:00+00:00' }]);
      if (s.indexOf('/rest/v1/traits?select=') >= 0 && m === 'GET')
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
      window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
      return new Response(JSON.stringify({ code: 'UNROUTED' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
    }
    : async () => { throw new TypeError('Failed to fetch'); };   /* no signal */
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await cloudRender();
  if (!authed) throw new Error('the page did not treat the session as signed in');
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  await autosaveNow();
  const before = await dbGet(AUTO_ID);
  if (!before || before.by !== 'u1') throw new Error('the drawing was not its maker\'s before the refusal: ' + (before && before.by));
  /* The refusal, as every caller of sessionEnded makes it: the stored session first. */
  sbSaveSession(null); sessionEnded();
  let after = null;
  for (let i = 0; i < 400; i++) { const x = await dbGet(AUTO_ID); if (x && x.at !== before.at) { after = x; break; } await new Promise(r => setTimeout(r, 10)); }
  let listed = []; try { listed = Object.keys(JSON.parse(localStorage.getItem('pb.uids') || '{}')); } catch (_) {}
  return { by: after ? (after.by === undefined ? '(none)' : after.by) : 'not saved again', listed };
}, verified);

test.describe('stage 0: a session the page could not check still has its uid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Stamp === 'function' && typeof cloudRender === 'function');
    await page.evaluate(async () => { window.__unknown = []; activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
      localStorage.removeItem('pb.uids'); await dbClear(); if (authed || s0SeenUid) throw new Error('the page started signed in'); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => window.__unknown || []);
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
    expect(unknown, 'every request had a named answer').toEqual([]);
  });

  test('opened with no signal, then refused: the drawing saved on the way out keeps its maker', async ({ page }) => {
    expect(await bootDrawThenRefuse(page, false)).toEqual({ by: 'u1', listed: ['u1'] });
  });

  test('the control: the same after a verified start', async ({ page }) => {
    expect(await bootDrawThenRefuse(page, true)).toEqual({ by: 'u1', listed: ['u1'] });
  });
});

/* WHILE SIGN-OUT OR A SWITCH WAITS FOR THE DRAWING'S SAVE (fix round 3). The
   wait is only for what the save depends on - the store, the uid, wsGen. The
   account panel comes down at once, as it does with nothing to wait for, a
   second press does nothing more, and a switch compares with where the page
   is going, not where it still is (all measured before the fix). A group
   page on team1 with its account panel open, and - with `saving` - a
   drawing whose closing save is being written, its encode HELD until the
   test calls releaseTheSave; with nothing saving, the drawing was saved and
   closed first.
   HELD, NOT SLOWED (fix round 4). The encode was slowed to 1.5 s or 0.8 s,
   and each test's action had to arrive before it ended - a 100 ms sleep and
   a round trip later - which nothing asserted: with the save landed first,
   two tests failed as if the page had regressed and two passed testing
   nothing (measured, re-review of round 3). So the save is held on a gate,
   and each test asserts, in the same evaluate as its action, that the save
   is still in flight and that the page is waiting for it. The stand-in also
   answers a password sign-in, as account u2, counted in __tokenAsked. */
const groupPageWithDrawing = (page, saving) => page.evaluate(async (saving) => {
  window.__toasts = []; window.__who = 'u1'; window.__tokenAsked = 0;
  const shown = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { shown(m); } catch (_) {} };
  const json = (o, x) => new Response(JSON.stringify(o), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  /* Left in place: a switch runs on after it returns. */
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    /* A token renewal, held on __refreshGate when a test sets it (adjudication A). */
    if (s.indexOf('/auth/v1/token?grant_type=refresh_token') >= 0 && m === 'POST') {
      window.__refreshAsked = (window.__refreshAsked || 0) + 1;
      await (window.__refreshGate || null);
      /* Refused when a test sets __refreshStatus (final fixes, B4). */
      if (window.__refreshStatus && window.__refreshStatus !== 200)
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: window.__refreshStatus, headers: { 'Content-Type': 'application/json' } });
      return json({ access_token: 'not-a-real-token-renewed', refresh_token: 'not-a-real-refresh-renewed', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } });
    }
    if (s.indexOf('/auth/v1/token?grant_type=password') >= 0 && m === 'POST') {
      window.__tokenAsked++; window.__who = 'u2';
      return json({ access_token: 'not-a-real-token-2', refresh_token: 'not-a-real-refresh-2', expires_in: 3600, user: { id: 'u2' } });
    }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: window.__who });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true },
      { id: 'team1', name: 'One', personal: false }, { id: 'team2', name: 'Two', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=') >= 0 && m === 'GET')
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return new Response(JSON.stringify({ code: 'UNROUTED' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
  };
  for (const s of [null, 'team1', 'team2']) { activeWs = s; dbp = null; dbpName = null; await dbClear(); }
  activeWs = 'team1'; wsSave('team1'); dbp = null; dbpName = null; groupCaughtUp = true;
  await cloudRender();
  await new Promise(r => setTimeout(r, 300));
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  await autosaveNow();
  if (saving) {
    const encode = art.toBlob.bind(art);
    let open; const gate = new Promise(r => { open = r; });
    window.__releaseSave = open;
    art.toBlob = (cb, t) => encode(b => { gate.then(() => cb(b)); }, t);
    closeEditor();   /* its closing save is now being written, and held */
    if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
  } else await closeEditor();
  $('acctpanel').hidden = true; acctToggle();
  await new Promise(r => setTimeout(r, 100));
  if ($('acctpanel').hidden || [...$('wssel').options].every(o => o.value !== 'team2')) throw new Error('the account panel is not open on a list with team2');
  window.__gen0 = wsGen;
}, !!saving);
/* Lets the held save land. Asked in the same evaluate: the page must still
   be waiting for it - sign-out (`signOut`) or a switch (`switch`) - or the
   3 s bound ended the wait first and the test would measure that instead. */
const releaseTheSave = (page, waiting) => page.evaluate((waiting) => {
  if (!s0SaveInFlight) throw new Error('the save landed before it was released');
  if (waiting === 'signOut' && !s0SignOutWait) throw new Error('sign-out stopped waiting before the save was released');
  if (waiting === 'switch' && s0WsWant === undefined) throw new Error('the switch stopped waiting before the save was released');
  window.__releaseSave();
}, waiting);
/* A sign-in on the card, as a person makes one: the fields typed in, then
   the button; if the button cannot be pressed, Enter in the password field,
   which signs in without it. Short timeouts, so the attempt ends well inside
   the 3 s bound. Whether it reached the server is __tokenAsked. */
const signInOnTheCard = async (page) => {
  try { await page.fill('#gateuser', 'u2user', { timeout: 300 }); } catch (_) {}
  try { await page.fill('#gatepass', 'not-a-real-password', { timeout: 300 }); } catch (_) {}
  try { await page.click('#gatein', { timeout: 300 }); return; } catch (_) {}
  try { await page.press('#gatepass', 'Enter', { timeout: 300 }); } catch (_) {}
};
/* Past the held save's release and whatever a switch starts. */
const afterTheWait = (page) => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 3000));
  return { session: !!localStorage.getItem('chatnft.session'), activeWs, storedWs: localStorage.getItem('chatnft.ws'), gen: wsGen - window.__gen0,
    signedOut: window.__toasts.filter(t => t === 'Signed out').length, opened: window.__toasts.filter(t => t === 'Opened the group project').length,
    authed, uid: s0SeenUid, cardBack: !$('signin').inert && !$('gatein').disabled };
});

test.describe('stage 0: while sign-out or a switch waits for the drawing\'s save', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Stamp === 'function' && typeof wsSwitch === 'function' && typeof closeEditor === 'function');
    await page.evaluate(() => { window.__unknown = []; activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; });
    await session(page, 'u1');
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => window.__unknown || []);
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('chatnft.ws'); localStorage.removeItem('pb.uids'); });
    expect(unknown, 'every request had a named answer').toEqual([]);
  });
  const pickTeam2 = async (page) => {
    try { await page.selectOption('#wssel', 'team2', { timeout: 800 }); return 'picked'; } catch (_) { return 'refused'; }
  };

  test('signing out while the drawing\'s save is being written: the account panel comes down at once, a pick in it is refused, and it ends on no group', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      $('cloudout').click();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
    });
    const picked = await pickTeam2(page);
    await releaseTheSave(page, 'signOut');
    const r = await afterTheWait(page);
    expect({ picked, session: r.session, activeWs: r.activeWs, storedWs: r.storedWs }).toEqual({ picked: 'refused', session: false, activeWs: null, storedWs: null });
  });

  test('the control: the same with nothing being saved', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    await page.evaluate(() => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      $('cloudout').click();
    });
    const picked = await pickTeam2(page);
    const r = await afterTheWait(page);
    expect({ picked, session: r.session, activeWs: r.activeWs, storedWs: r.storedWs }).toEqual({ picked: 'refused', session: false, activeWs: null, storedWs: null });
  });

  test('a second sign-out during the wait does nothing more: one sign-out, one wsGen bump', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      cloudSignOut(); cloudSignOut();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
    });
    await releaseTheSave(page, 'signOut');
    const r = await afterTheWait(page);
    expect({ signedOut: r.signedOut, gen: r.gen, activeWs: r.activeWs }).toEqual({ signedOut: 1, gen: 1, activeWs: null });
  });

  test('the control: one press, with the same save being written, is one sign-out', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      cloudSignOut();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
    });
    await releaseTheSave(page, 'signOut');
    const r = await afterTheWait(page);
    expect({ signedOut: r.signedOut, gen: r.gen, activeWs: r.activeWs }).toEqual({ signedOut: 1, gen: 1, activeWs: null });
  });

  test('switching away and straight back while the drawing\'s save is being written ends on the last choice, having never left', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      wsSwitch('team2'); wsSwitch('team1');
      if (s0WsWant !== 'team1') throw new Error('the switches are not waiting for the save');
    });
    await releaseTheSave(page, 'switch');
    const r = await afterTheWait(page);
    expect({ activeWs: r.activeWs, storedWs: r.storedWs, gen: r.gen, opened: r.opened }).toEqual({ activeWs: 'team1', storedWs: 'team1', gen: 0, opened: 0 });
  });

  test('the control: away and back with nothing being saved ends on the last choice too, having switched twice', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    await page.evaluate(() => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      wsSwitch('team2'); wsSwitch('team1');
    });
    const r = await afterTheWait(page);
    expect({ activeWs: r.activeWs, storedWs: r.storedWs, gen: r.gen, opened: r.opened }).toEqual({ activeWs: 'team1', storedWs: 'team1', gen: 2, opened: 2 });
  });

  test('two switches to one project while the save is being written run the switch once', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      wsSwitch('team2'); wsSwitch('team2');
      if (s0WsWant !== 'team2') throw new Error('the switches are not waiting for the save');
    });
    await releaseTheSave(page, 'switch');
    const r = await afterTheWait(page);
    expect({ activeWs: r.activeWs, gen: r.gen, opened: r.opened }).toEqual({ activeWs: 'team2', gen: 1, opened: 1 });
  });

  test('the control: the same two switches with nothing being saved run it once', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    await page.evaluate(() => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      wsSwitch('team2'); wsSwitch('team2');
    });
    const r = await afterTheWait(page);
    expect({ activeWs: r.activeWs, gen: r.gen, opened: r.opened }).toEqual({ activeWs: 'team2', gen: 1, opened: 1 });
  });

  /* Fix round 4. SIGN-OUT CLEARS THE STORED SESSION BEFORE IT WAITS, AND THE
     CARD TAKES NO SIGN-IN UNTIL THE WAIT IS OVER. Kept through the wait, the
     session outlived a tab closed in it, and the clear after the wait undid
     a sign-in made during it (measured, re-review of round 3). The attempt
     is made on the card itself, as a person makes it. */
  test('signing out while the drawing\'s save is being written: the session is gone at once, and a sign-in on the card during the wait is refused, not undone', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    const during = await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      $('cloudout').click();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
      return !!localStorage.getItem('chatnft.session');
    });
    await signInOnTheCard(page);
    const asked = await page.evaluate(() => window.__tokenAsked > 0);
    await releaseTheSave(page, 'signOut');
    const r = await afterTheWait(page);
    expect({ sessionDuringTheWait: during, signInReachedTheServer: asked, session: r.session, authed: r.authed, uid: r.uid, cardBack: r.cardBack })
      .toEqual({ sessionDuringTheWait: false, signInReachedTheServer: false, session: false, authed: false, uid: null, cardBack: true });
  });

  test('the control: with nothing being saved, sign-out is at once, and a sign-in on the card straight after it is taken and kept', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const during = await page.evaluate(() => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      $('cloudout').click();
      if (s0SignOutWait) throw new Error('sign-out waited');
      return !!localStorage.getItem('chatnft.session');
    });
    await signInOnTheCard(page);
    const asked = await page.evaluate(() => window.__tokenAsked > 0);
    const r = await afterTheWait(page);
    expect({ sessionDuringTheWait: during, signInReachedTheServer: asked, session: r.session, authed: r.authed, uid: r.uid, cardBack: r.cardBack })
      .toEqual({ sessionDuringTheWait: false, signInReachedTheServer: true, session: true, authed: true, uid: 'u2', cardBack: true });
  });

  /* Fix round 4. A SWITCH TO WHERE A WAITING SWITCH IS GOING IS THAT SWITCH.
     The second returned at once, 0 ms, with activeWs still team1, and the
     first finished later (measured, re-review of round 3); every caller
     that awaits a switch acts on its having happened. Each records activeWs
     at the moment its promise settles. */
  test('two awaited switches to one project while the save is being written both go on only once the store has moved, and the switch runs once', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    const seen = await page.evaluate(async () => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      const seen = [];
      const a = wsSwitch('team2').then(() => { seen.push(activeWs); });
      const b = wsSwitch('team2').then(() => { seen.push(activeWs); });
      if (s0WsWant !== 'team2') throw new Error('the switch is not waiting for the save');
      await new Promise(r => setTimeout(r, 200));
      if (!s0SaveInFlight || s0WsWant !== 'team2') throw new Error('the wait ended before the save was released');
      window.__releaseSave();
      await Promise.all([a, b]);
      return seen;
    });
    const r = await afterTheWait(page);
    expect({ seen, gen: r.gen, opened: r.opened }).toEqual({ seen: ['team2', 'team2'], gen: 1, opened: 1 });
  });

  test('the control: the same two awaited switches with nothing being saved both go on with the store moved, and the switch runs once', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const seen = await page.evaluate(async () => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      const seen = [];
      const a = wsSwitch('team2').then(() => { seen.push(activeWs); });
      const b = wsSwitch('team2').then(() => { seen.push(activeWs); });
      await Promise.all([a, b]);
      return seen;
    });
    const r = await afterTheWait(page);
    expect({ seen, gen: r.gen, opened: r.opened }).toEqual({ seen: ['team2', 'team2'], gen: 1, opened: 1 });
  });

  /* Fix round 5 (round 4's probe, made a spec). A SWITCH WHOSE DRAWING'S
     SAVE NEVER FINISHES GOES AHEAD AFTER ITS 3 S BOUND. The switch that goes
     on after the wait runs wsSwitch again, told it has waited; asked to
     flush again, it found the same stuck save and waited again, and was
     still waiting after 10 s (measured, round 4). The save here is held and
     never released. */
  test('a switch whose drawing\'s save never finishes goes ahead after its 3 s bound', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    const r = await page.evaluate(async () => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      const t0 = performance.now();
      const p = wsSwitch('team2');
      if (s0WsWant !== 'team2') throw new Error('the switch is not waiting for the save');
      const out = await Promise.race([p.then(() => 'went'), new Promise(res => setTimeout(() => res('still waiting'), 10000))]);
      return { out, activeWs, ms: Math.round(performance.now() - t0) };
    });
    console.log('a stalled save held a switch for ' + r.ms + ' ms');
    expect({ out: r.out, activeWs: r.activeWs, heldForTheBound: r.ms >= 2900, withinIt: r.ms < 4500 })
      .toEqual({ out: 'went', activeWs: 'team2', heldForTheBound: true, withinIt: true });
  });

  test('the control: with no save waiting, the same switch goes ahead at once', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const r = await page.evaluate(async () => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      const t0 = performance.now();
      const p = wsSwitch('team2');
      const out = await Promise.race([p.then(() => 'went'), new Promise(res => setTimeout(() => res('still waiting'), 10000))]);
      return { out, activeWs, ms: Math.round(performance.now() - t0) };
    });
    expect({ out: r.out, activeWs: r.activeWs, heldForTheBound: r.ms >= 2900, withinIt: r.ms < 4500 })
      .toEqual({ out: 'went', activeWs: 'team2', heldForTheBound: false, withinIt: true });
  });

  /* Adjudication A. A TOKEN RENEWAL IN FLIGHT ACROSS A SIGN-OUT. Round 4
     cleared the stored session before sign-out's wait and not after it, and
     sbToken stored a renewal whatever was stored by then: a renewal in
     flight when the person pressed Sign out stored the leaving account's
     session again, and the page signed back in as that account while it
     said "Signed out" - or, with nothing waiting, the next load did
     (measured, re-review of rounds 4-5). sbToken now stores a renewal only
     over the session it renewed. The stored token is made to expire within
     the minute, so sbToken renews it, and the renewal is held until the
     sign-out has begun. */
  const renewalAcrossSignOut = (page, signOut) => page.evaluate(async (signOut) => {
    let open; window.__refreshGate = new Promise(r => { open = r; });
    window.__refreshAsked = 0;
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } }));
    const renewal = sbToken();
    for (let i = 0; i < 100 && !window.__refreshAsked; i++) await new Promise(r => setTimeout(r, 10));
    const inFlight = window.__refreshAsked === 1;
    if (signOut) cloudSignOut();
    const waiting = !!s0SignOutWait;
    open();
    const got = await renewal;
    let stored = null; try { stored = JSON.parse(localStorage.getItem('chatnft.session') || 'null'); } catch (_) {}
    return { inFlight, waiting, got, storedAfterIt: stored && stored.access_token };
  }, signOut);

  test('a token renewal in flight across a sign-out waiting for the drawing\'s save: it ends signed out, with nothing stored', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    const r = await renewalAcrossSignOut(page, true);
    await releaseTheSave(page, 'signOut');
    const after = await afterTheWait(page);
    expect({ inFlight: r.inFlight, waiting: r.waiting, got: r.got, storedAfterIt: r.storedAfterIt, session: after.session, authed: after.authed, uid: after.uid })
      .toEqual({ inFlight: true, waiting: true, got: null, storedAfterIt: null, session: false, authed: false, uid: null });
  });

  test('a token renewal in flight across a sign-out with nothing waiting: nothing is stored after it', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const r = await renewalAcrossSignOut(page, true);
    const after = await afterTheWait(page);
    expect({ inFlight: r.inFlight, waiting: r.waiting, got: r.got, storedAfterIt: r.storedAfterIt, session: after.session, authed: after.authed })
      .toEqual({ inFlight: true, waiting: false, got: null, storedAfterIt: null, session: false, authed: false });
  });

  /* Final fixes, B4, and sign-out's wait. A refusal that lands when nothing
     is stored now ends the sign-in (B4), and sign-out stores nothing from
     its first moment - so a renewal refused during its wait for the
     drawing's save now ends the sign-in there, before the wait does. What
     the wait keeps is kept: it ends signed out, once, with nothing stored,
     and the drawing lands in the group's store as its maker's. */
  test('a token renewal refused across a sign-out waiting for the drawing\'s save: it ends signed out, nothing stored, and the drawing keeps its maker', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(() => { window.__refreshStatus = 400; });
    const r = await renewalAcrossSignOut(page, true);
    await releaseTheSave(page, 'signOut');
    const after = await afterTheWait(page);
    const maker = await page.evaluate(async () => {
      const d = await new Promise((res, rej) => { const q = indexedDB.open('chatnft.ws.team1', 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const x = await new Promise((res, rej) => { const t = d.transaction('items', 'readonly'); const q = t.objectStore('items').get('autosave.working'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      d.close();
      return x ? (x.by || '(none)') : null;
    });
    const endedToast = await page.evaluate(() => window.__toasts.filter(t => /signed out on this device/.test(t)).length);
    console.log('B4 across sign-out\'s wait: "signed out on this device" toasts ' + endedToast + ', "Signed out" toasts ' + after.signedOut);
    expect({ inFlight: r.inFlight, waiting: r.waiting, got: r.got, storedAfterIt: r.storedAfterIt, session: after.session, authed: after.authed, uid: after.uid,
      activeWs: after.activeWs, signedOut: after.signedOut, maker })
      .toEqual({ inFlight: true, waiting: true, got: null, storedAfterIt: null, session: false, authed: false, uid: null, activeWs: null, signedOut: 1, maker: 'u1' });
  });

  test('the control: a token renewal with no sign-out stores the renewed session', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const r = await renewalAcrossSignOut(page, false);
    const after = await afterTheWait(page);
    expect({ inFlight: r.inFlight, got: r.got, storedAfterIt: r.storedAfterIt, session: after.session, authed: after.authed })
      .toEqual({ inFlight: true, got: 'not-a-real-token-renewed', storedAfterIt: 'not-a-real-token-renewed', session: true, authed: true });
  });

  /* Final adjudication touch. A WRITE TELLS ITS OWN STORE. touch() notes the
     store a write was for as it happens; the tell goes 150 ms later, and
     named whatever store was current by then - so a write followed at once
     by a switch told the store switched to. No spec failed without the note
     (re-review of the adjudication fix). */
  test('a write, then a switch within the tell\'s 150 ms: the write is told to its own store', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const r = await page.evaluate(async () => {
      if (s0SaveInFlight || autoPending) throw new Error('a save is waiting or in flight');
      for (let i = 0; i < 100 && tabTellTimer; i++) await new Promise(res => setTimeout(res, 10));
      if (tabTellTimer) throw new Error('a tell from the setup is still pending');
      const told = [];
      const post = tabChan.postMessage.bind(tabChan);
      tabChan.postMessage = (m) => { told.push(JSON.parse(JSON.stringify(m))); return post(m); };
      const from = activeWs;
      await dbPut({ id: 't_note_hats_wip', kind: 'trait', name: 'note', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(4)]) });
      const t0 = performance.now();
      const switching = wsSwitch(null);
      const switchedWithin = activeWs === null && performance.now() - t0 < 150;
      await switching;
      await new Promise(res => setTimeout(res, 400));
      tabChan.postMessage = post;
      return { from, switchedWithin, told };
    });
    expect(r).toEqual({ from: 'team1', switchedWithin: true, told: [{ db: 'chatnft.ws.team1' }] });
  });
});

/* Final adjudication touch. A RENEWAL OR A REFUSAL THAT ANSWERS AFTER THE
   STORED SESSION CHANGED. Its own describe: both pages open with nothing
   stored, so neither's start asks anything before its stand-in is in place.
   The stand-in names each token, holds a renewal on __renewGate and the
   account check of u1's token on __userGate when asked to, and signs u2 in
   on the card. */
const authStandIn = () => {
  window.__unknown = []; window.__toasts = []; window.__renewAsked = 0; window.__userAsked = 0;
  const shown = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { shown(m); } catch (_) {} };
  let open; window.__renewGate = new Promise(r => { open = r; }); window.__renewOpen = open;
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const auth = (io && io.headers && (io.headers.Authorization || io.headers.authorization)) || '';
    if (s.indexOf('/auth/v1/token?grant_type=refresh_token') >= 0 && m === 'POST') {
      window.__renewAsked++; await window.__renewGate;
      if (window.__renewStatus && window.__renewStatus !== 200) return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }, null, window.__renewStatus);
      return json({ access_token: window.__renewAT, refresh_token: window.__renewRT, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } });
    }
    if (s.indexOf('/auth/v1/token?grant_type=password') >= 0 && m === 'POST')
      return json({ access_token: 'tok-u2', refresh_token: 'rt-u2', expires_in: 3600, user: { id: 'u2' } });
    if (s.indexOf('/auth/v1/user') >= 0) {
      if (window.__userGate && auth.indexOf('tok-u1') >= 0) { window.__userAsked++; const st = await window.__userGate; if (st !== 200) return json({ msg: 'invalid JWT' }, null, st); }
      return json({ id: auth.indexOf('tok-u2') >= 0 ? 'u2' : 'u1' });
    }
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=') >= 0 && m === 'GET') return json([], { 'Content-Range': '*/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
};
/* Where the page ends: signed in as whom, what is stored, and whether it
   shows itself offline or signed out. */
const authState = () => {
  let st = null; try { st = JSON.parse(localStorage.getItem('chatnft.session') || 'null'); } catch (_) {}
  return { authed, uid: s0SeenUid, stored: st && st.access_token, offline: $('cloudnote').textContent === CLOUD_UNREACHABLE,
    pushShown: !$('cloudpush').hidden, gateShown: !$('signin').hidden };
};
/* One tab: u1 signed in; then the late answer - a renewal (`what` 'renew')
   or u1's account check ('user') held - and, with `newSignIn`, a sign-out
   and u2 signing in on the card while it is held; then it answers
   `status`. */
const lateAnswer = (page, what, status, newSignIn) => page.evaluate(async ([what, status, newSignIn, authStandInSrc, authStateSrc]) => {
  (new Function('return (' + authStandInSrc + ')'))()();
  const state = new Function('return (' + authStateSrc + ')')();
  window.__renewAT = 'tok-u1-renewed'; window.__renewRT = 'rt-u1-renewed'; window.__renewStatus = status;
  activeWs = null; wsSave(null);
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await cloudRender();
  const first = { authed, uid: s0SeenUid };
  let pending;
  if (what === 'renew') {
    /* Within a minute of expiry: the next request renews, and it is held. */
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } }));
    pending = sbToken();
    for (let i = 0; i < 100 && !window.__renewAsked; i++) await new Promise(r => setTimeout(r, 10));
  } else {
    /* The account check inside a start of the page (cloudRender), as the
       account panel's toggle or a reload makes it: what it answers is what
       the page then shows. */
    let open; window.__userGate = new Promise(r => { open = r; }); window.__userOpen = open;
    pending = cloudRender();
    for (let i = 0; i < 100 && !window.__userAsked; i++) await new Promise(r => setTimeout(r, 10));
  }
  const held = what === 'renew' ? window.__renewAsked === 1 : window.__userAsked === 1;
  let afterSignIn = null;
  if (newSignIn) {
    cloudSignOut();
    $('gateuser').value = 'someone2@example.invalid'; $('gatepass').value = 'not-a-real-pass';
    await gateSignIn();
    afterSignIn = { authed, uid: s0SeenUid };
  }
  if (what === 'renew') window.__renewOpen(); else window.__userOpen(status);
  let got; try { got = await pending; } catch (_) {}
  await new Promise(r => setTimeout(r, 300));
  /* got: the renewal's answer, or whom the start that held the account check
     rendered (null when it rendered nobody). */
  return { first, held, afterSignIn, got: what === 'renew' ? got : (got && got.id ? got.id : null), end: state(), signedOutToast: window.__toasts.some(t => /signed out on this device/.test(t)), unknown: window.__unknown.slice() };
}, [what, status, !!newSignIn, authStandIn.toString(), authState.toString()]);

test.describe('stage 0: a renewal or a refusal that answers after the session changed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudRender === 'function' && typeof sbToken === 'function' && typeof gateSignIn === 'function' && typeof s0Stamp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
  });

  /* ANOTHER TAB OF THE SAME ACCOUNT RENEWED FIRST. Two tabs restored together
     with the stored token in its last minute each renew it; one answer lands
     first and is stored. sbToken (adjudication A) dropped the second tab's
     answer and returned nothing, so that tab said "Cannot reach the server
     just now" and hid Save to cloud over a valid session (measured). It now
     answers the stored session's token when it is the same account's. */
  test('two tabs of one account renew together: the second ends signed in, not offline', async ({ page, context }) => {
    const B = await context.newPage();
    await B.route(/\.supabase\.co\//, (route) => {
      pastTheStandIns.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
      return route.abort();
    });
    await B.goto('/index.html');
    await B.waitForFunction(() => typeof cloudRender === 'function' && typeof sbToken === 'function');
    for (const [p, at, rt] of [[page, 'tok-A', 'rt-1'], [B, 'tok-B', 'rt-1b']])
      await p.evaluate(([src, at, rt]) => { (new Function('return (' + src + ')'))()(); window.__renewAT = at; window.__renewRT = rt; activeWs = null; }, [authStandIn.toString(), at, rt]);
    await page.evaluate(() => { wsSave(null);
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-0', refresh_token: 'rt-0', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } })); });
    /* Both start at once, as two restored tabs do; this one's renewal answers first. */
    await page.evaluate(() => { window.__render = cloudRender().then(u => u ? u.id : null, e => 'threw ' + e); });
    await B.evaluate(() => { window.__render = cloudRender().then(u => u ? u.id : null, e => 'threw ' + e); });
    await page.waitForFunction(() => window.__renewAsked === 1, null, { timeout: 5000 });
    await B.waitForFunction(() => window.__renewAsked === 1, null, { timeout: 5000 });
    const first = await page.evaluate(async () => { window.__renewOpen(); return await window.__render; });
    const second = await B.evaluate(async () => { window.__renewOpen(); return await window.__render; });
    await B.waitForTimeout(300);
    const end = await B.evaluate(new Function('return (' + authState.toString() + ')')());
    const unknown = await B.evaluate(() => window.__unknown.slice());
    await B.close();
    expect({ first, second, end, unknown })
      .toEqual({ first: 'u1', second: 'u1', end: { authed: true, uid: 'u1', stored: 'tok-A', offline: false, pushShown: true, gateShown: false }, unknown: [] });
  });

  /* And another account's session stored meanwhile is never answered for this
     one: the leaving account's renewal, answering after u2 signed in, is
     dropped - nothing stored over u2's, and u2's token not handed to u1's
     request. */
  test('the leaving account\'s renewal answering after another account signed in: dropped, and the new account stays', async ({ page }) => {
    const r = await lateAnswer(page, 'renew', 200, true);
    expect({ held: r.held, afterSignIn: r.afterSignIn, got: r.got === undefined ? '(undefined)' : r.got, end: r.end, unknown: r.unknown })
      .toEqual({ held: true, afterSignIn: { authed: true, uid: 'u2' }, got: null,
        end: { authed: true, uid: 'u2', stored: 'tok-u2', offline: false, pushShown: true, gateShown: false }, unknown: [] });
  });

  /* A REFUSAL CLEARS ONLY THE SESSION IT REFUSED (the mirror of A). A late
     400 on the leaving account's renewal, or a late 401 on its account
     check, cleared whatever was stored - after a newer sign-in, the new
     account's session - and signed that account out (measured). */
  test('a late refusal of the leaving account\'s renewal, after a new sign-in: the new account stays signed in', async ({ page }) => {
    const r = await lateAnswer(page, 'renew', 400, true);
    expect({ first: r.first, held: r.held, afterSignIn: r.afterSignIn, end: r.end, signedOutToast: r.signedOutToast, unknown: r.unknown })
      .toEqual({ first: { authed: true, uid: 'u1' }, held: true, afterSignIn: { authed: true, uid: 'u2' },
        end: { authed: true, uid: 'u2', stored: 'tok-u2', offline: false, pushShown: true, gateShown: false }, signedOutToast: false, unknown: [] });
  });

  test('the control: the same refused renewal, with no new sign-in, still signs out', async ({ page }) => {
    const r = await lateAnswer(page, 'renew', 400, false);
    expect({ held: r.held, end: { authed: r.end.authed, stored: r.end.stored, gateShown: r.end.gateShown }, signedOutToast: r.signedOutToast, unknown: r.unknown })
      .toEqual({ held: true, end: { authed: false, stored: null, gateShown: true }, signedOutToast: true, unknown: [] });
  });

  test('a late refusal of the leaving account\'s account check, after a new sign-in: the new account stays signed in', async ({ page }) => {
    const r = await lateAnswer(page, 'user', 401, true);
    /* got: the start that held the check renders the account stored now (it
       asks again), rather than "could not ask". */
    expect({ first: r.first, held: r.held, afterSignIn: r.afterSignIn, got: r.got, end: r.end, signedOutToast: r.signedOutToast, unknown: r.unknown })
      .toEqual({ first: { authed: true, uid: 'u1' }, held: true, afterSignIn: { authed: true, uid: 'u2' }, got: 'u2',
        end: { authed: true, uid: 'u2', stored: 'tok-u2', offline: false, pushShown: true, gateShown: false }, signedOutToast: false, unknown: [] });
  });

  test('the control: the same refused account check, with no new sign-in, still signs out', async ({ page }) => {
    const r = await lateAnswer(page, 'user', 401, false);
    expect({ held: r.held, end: { authed: r.end.authed, stored: r.end.stored, gateShown: r.end.gateShown }, signedOutToast: r.signedOutToast, unknown: r.unknown })
      .toEqual({ held: true, end: { authed: false, stored: null, gateShown: true }, signedOutToast: true, unknown: [] });
  });

  /* Final fixes, B4 (the parked list's first item; H6 in the Task 10 final
     review's auth hunt). A REFUSAL THAT LANDS WHEN NOTHING IS STORED. Two
     tabs of one account, both signed in, both asking the server at once
     from an action (Load from cloud); the server refuses both - the
     session was revoked. The first refusal clears the stored session and
     signs its tab out. The second lands with nothing stored, and the
     condition "the stored session is still the one refused" was false for
     it, so that tab kept claiming a sign-in storage no longer held: its
     panel said signed in and every cloud action said "Sign in first",
     with no wall to sign in again through (measured at afff755; e43fdfc
     and the live page signed it out). Nothing stored is the refused
     session gone, so it signs out too; a different session stored - a
     newer sign-in - is still left alone (the tests above). `what`:
     'renew' holds both renewals of the token in its last minute, 'user'
     holds both account checks of a fresh token; `bVia`: the second tab's
     'action' (cloudPull) or 'start' (cloudRender). */
  const bothRefused = async (page, context, what, bVia) => {
    const B = await context.newPage();
    await B.route(/\.supabase\.co\//, (route) => {
      pastTheStandIns.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
      return route.abort();
    });
    await B.goto('/index.html');
    await B.waitForFunction(() => typeof cloudRender === 'function' && typeof sbToken === 'function');
    for (const p of [page, B])
      await p.evaluate((src) => { (new Function('return (' + src + ')'))()(); window.__renewStatus = 400; activeWs = null; groupCaughtUp = true; }, authStandIn.toString());
    /* Both signed in for real first, their panels drawn, with a fresh token. */
    await page.evaluate(() => { wsSave(null);
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } })); });
    for (const p of [page, B]) await p.evaluate(async () => { await cloudRender(); await new Promise(r => setTimeout(r, 300)); });
    const before = await B.evaluate(new Function('return (' + authState.toString() + ')')());
    if (what === 'renew')
      await page.evaluate(() => localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } })));
    for (const p of [page, B]) await p.evaluate((what) => {
      window.__toasts = []; window.__renewAsked = 0; window.__userAsked = 0;
      if (what === 'user') { let open; window.__userGate = new Promise(r => { open = r; }); window.__userOpen = open; }
    }, what);
    await page.evaluate(() => { window.__p = cloudPull({}).then(() => 'done', e => 'threw ' + e); });
    await B.evaluate((bVia) => { window.__p = (bVia === 'start' ? cloudRender() : cloudPull({})).then(() => 'done', e => 'threw ' + e); }, bVia);
    const asked = what === 'renew' ? () => window.__renewAsked === 1 : () => window.__userAsked === 1;
    await page.waitForFunction(asked, null, { timeout: 5000 });
    await B.waitForFunction(asked, null, { timeout: 5000 });
    const release = (what) => { if (what === 'renew') window.__renewOpen(); else window.__userOpen(401); return window.__p; };
    const aGot = await page.evaluate(release, what);
    const storedBetween = await B.evaluate(() => localStorage.getItem('chatnft.session'));
    const bGot = await B.evaluate(release, what);
    await B.waitForTimeout(300);
    const end = async (p) => Object.assign(await p.evaluate(new Function('return (' + authState.toString() + ')')()),
      await p.evaluate(() => ({ who: $('cloudwho').textContent, signedOutToast: window.__toasts.some(t => /signed out on this device/.test(t)) })));
    const aEnd = await end(page), bEnd = await end(B);
    const unknown = [...await page.evaluate(() => window.__unknown.slice()), ...await B.evaluate(() => window.__unknown.slice())];
    await B.close();
    return { before: { authed: before.authed, uid: before.uid, stored: before.stored }, aGot, bGot, storedBetween, aEnd, bEnd, unknown };
  };
  const signedOut = { authed: false, uid: null, stored: null, offline: false, pushShown: false, gateShown: true, who: 'not signed in', signedOutToast: true };

  test('two tabs of one account, both renewals refused, each from Load from cloud: both end signed out', async ({ page, context }) => {
    const r = await bothRefused(page, context, 'renew', 'action');
    expect(r).toEqual({ before: { authed: true, uid: 'u1', stored: 'tok-u1' }, aGot: 'done', bGot: 'done', storedBetween: null,
      aEnd: signedOut, bEnd: signedOut, unknown: [] });
  });

  /* The start draws the wall itself when it finds nobody signed in, so this
     one shows the harness can see the second tab signed out whichever way
     the refusal is handled: its toast is not asked (measured at d9eb714:
     the start signed it out with no toast). */
  test('the control: the same two refused renewals, the second tab\'s through a start of the page, both end signed out', async ({ page, context }) => {
    const r = await bothRefused(page, context, 'renew', 'start');
    const { signedOutToast, ...bState } = r.bEnd;
    const { signedOutToast: _, ...signedOutState } = signedOut;
    expect({ ...r, bEnd: bState }).toEqual({ before: { authed: true, uid: 'u1', stored: 'tok-u1' }, aGot: 'done', bGot: 'done', storedBetween: null,
      aEnd: signedOut, bEnd: signedOutState, unknown: [] });
  });

  test('two tabs of one account, both account checks refused, each from Load from cloud: both end signed out', async ({ page, context }) => {
    const r = await bothRefused(page, context, 'user', 'action');
    expect(r).toEqual({ before: { authed: true, uid: 'u1', stored: 'tok-u1' }, aGot: 'done', bGot: 'done', storedBetween: null,
      aEnd: signedOut, bEnd: signedOut, unknown: [] });
  });
});
