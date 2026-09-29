/* STAGE 0: AN INSERT THAT STANDS IN FOR A ROW SAYS WHICH ONE (design A2,
   D1), AND EVERY DELETE-THEN-INSERT IS NOTED (settings.attempts, D1), in
   the page, against armStage0's stand-in server (which refuses any request
   it does not name). stage0replaces-sql.spec.js runs the same save against
   real SQL.

   "Stands in" covers four routes: a re-save (the record's own row), a
   status or layer move (cloudMoveOne passes the old copy's row), a folder
   import that moves a file between status folders, and one that merges a
   renamed file into the artwork it renames. The last two are decided
   after the import has sent the new record, so a made row is PATCHed with
   replaces, and an unsent record carries it (s0Replaces) into its insert.

   Beyond the plan's eleven (the controller's audit, anchor-audit/
   amend-task12.md, each premise measured on this page first):
   - the pairing survives the two places that rebuild a trait record field
     by field, saveTraitNow and a folder import's same-id replacement
     (Finding 1), and a second move of a record never sent (the audit's
     "missed" item);
   - the pairing is written as the record's owner's even when nobody is
     signed in by then (Finding 4), and never into a store the page moved
     to meanwhile (Finding 5);
   - the redraw test counts by difference: the beforeEach's dbClear posts
     its own message 150 ms later (Finding 3).
   And, beyond the audit: once an insert carrying the record's s0Replaces
   lands, the record stops holding it (the audit's note on the sent write:
   left, it went stale at the next re-save).

   The second describe is Ruling F-18 (Decision 20): a loop - Save to
   cloud, a group folder import, a layer rename, a sort - notes its
   attempts in one append, not one per trait, and notes again only what is
   still to go once its note is S0_ATTEMPT_FRESH_MS old, so every delete
   has an entry from just before it (design D2's proof: a tombstone within
   a minute of an attempt). */
import { test, expect } from '@playwright/test';
import { armStage0, seedTrait, seedSettings } from './helpers.js';

const ROW0 = '00000000-0000-4000-8000-0000000000e1';
const ROW1 = '00000000-0000-4000-8000-0000000000e2';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof s0Attempt === 'function');
  await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); });
});
test.afterEach(async ({ page }) => {
  const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
  await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; localStorage.removeItem('chatnft.session'); });
  expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
});
const insertBody = async (page) => {
  const b = (await page.evaluate(() => window.__s0.bodies)).filter(x => x.m === 'POST' && x.path === '/rest/v1/traits');
  return b.length ? JSON.parse(b[b.length - 1].body)[0] : null;
};
const patchBodies = async (page) => (await page.evaluate(() => window.__s0.bodies))
  .filter(x => x.m === 'PATCH' && x.path.indexOf('/rest/v1/traits?id=eq.') === 0).map(x => ({ path: x.path, body: JSON.parse(x.body) }));
const syncCap = (page) => page.evaluate(async () => { await cloudSyncOne(await dbGet('t_cap_hats_wip'), null, {}); });
const syncOne = (page, id) => page.evaluate(async (id) => { await cloudSyncOne(await dbGet(id), null, {}); }, id);
/* A real picture, so a folder import accepts it, and (when seed is given) a
   trait holding the same bytes, so a renamed file is recognised as the same
   artwork. fill is the rectangle drawn: another fill is another picture. */
const importOver = (page, seed, rel, fill) => page.evaluate(async ([seed, rel, fill]) => {
  LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const f = fill || [2, 2, 12, 12];
  c.getContext('2d').fillRect(f[0], f[1], f[2], f[3]);
  const bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
  if (seed) await dbPut(Object.assign({ kind: 'trait', w: 16, h: 16, rarity: 1, at: 1, synced: true,
    blob: new Blob([bytes], { type: 'image/png' }) }, seed));
  const rc = window.confirm; window.confirm = () => true;
  try { await bulkImport([fileWithPath(bytes, rel)]); } finally { window.confirm = rc; }
}, [seed || null, rel, fill || null]);
/* The stored record, without its picture, for comparing. */
const stored = (page, id) => page.evaluate(async (id) => { const r = await dbGet(id); if (r) delete r.blob; return r; }, id);
/* A record exactly as given, not through dbPut (which stamps it), for a
   field seedTrait does not carry. */
const putRaw = (page, rec) => page.evaluate(async (rec) => {
  rec.blob = new Blob([new Uint8Array(16)], { type: 'image/png' });
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite'); t.objectStore('items').put(rec);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}, rec);
/* Every append to settings.attempts, by how many entries it carried, and
   where in the request log it happened. */
const countAppends = (page) => page.evaluate(() => {
  const real = s0Append;
  window.__appends = [];
  window.__appendReal = real;
  s0Append = (id, field, entries, keep) => {
    if (id === 'settings.attempts') {
      const n = Array.isArray(entries) ? entries.length : 1;
      window.__appends.push(n);
      if (window.__s0) window.__s0.log.push('APPEND ' + n);
    }
    return real(id, field, entries, keep);
  };
});
const appendsDone = (page) => page.evaluate(() => { if (window.__appendReal) s0Append = window.__appendReal; return window.__appends; });
const attempts = (page) => page.evaluate(async () => { const a = await dbGet('settings.attempts'); return a ? a.entries : []; });

test.describe('stage 0: replaces and settings.attempts, in the page', () => {
  test('a move names the row it came from', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: ROW0, synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    const b = await insertBody(page);
    expect([b.status, b.replaces]).toEqual(['approved', ROW0]);
  });

  test('a folder import that moves a file from wip to approved: the new row is told the old one', async ({ page }) => {
    await armStage0(page, {});
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'team7/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    expect((await insertBody(page)).status, 'the approved file was sent first, as today').toBe('approved');
    /* carryDecided may PATCH the new row's weight first; only one PATCH names replaces. */
    expect((await patchBodies(page)).filter(p => 'replaces' in p.body)).toEqual([{ path: '/rest/v1/traits?id=eq.row-new', body: { replaces: ROW0 } }]);
    expect((await page.evaluate(() => window.__s0.log)).some(l => l === 'DELETE /rest/v1/traits?id=eq.' + ROW0), 'and the old row still goes').toBe(true);
  });

  test('a folder import that merges a renamed file: the new row is told the old one', async ({ page }) => {
    await armStage0(page, {});
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'team7/c1/trait-cap-hats-wip.png' }, 'col/hats/wip/cap v2.png');
    expect((await insertBody(page)).name).toBe('cap v2');
    expect((await patchBodies(page)).filter(p => 'replaces' in p.body)).toEqual([{ path: '/rest/v1/traits?id=eq.row-new', body: { replaces: ROW0 } }]);
  });

  test('on your own page the moved file is sent later, and its insert carries the old row', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    expect((await patchBodies(page)).filter(p => 'replaces' in p.body), 'nothing was sent yet, so nothing to patch').toEqual([]);
    expect(await page.evaluate(async () => (await dbGet('t_cap_hats_approved')).s0Replaces)).toBe(ROW0);
    await page.evaluate(async () => { await cloudSyncOne(await dbGet('t_cap_hats_approved'), null, {}); });
    expect((await insertBody(page)).replaces).toBe(ROW0);
  });

  test('a row id that is not a uuid is never sent as replaces', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await syncCap(page);
    expect(Object.keys(await insertBody(page))).not.toContain('replaces');
  });

  test('a first insert\'s body has exactly today\'s keys', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await syncCap(page);
    expect(Object.keys(await insertBody(page))).toEqual(['collection_id', 'team_id', 'owner', 'kind', 'name', 'layer', 'status', 'rarity', 'shelf_order', 'w', 'h', 'path']);
  });

  test('a record with no row id learns the row it replaced from its delete', async ({ page }) => {
    await armStage0(page, { deleted: [{ id: ROW0, path: 'team7/c1/trait-cap-hats-wip.png' }] });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await syncCap(page);
    expect((await insertBody(page)).replaces).toBe(ROW0);
  });

  test('attempts are kept 7 days: an older entry goes when a new one comes', async ({ page }) => {
    await armStage0(page, {});
    const now = Date.now();
    await seedSettings(page, 'settings.attempts', { entries: [{ at: now - 8 * 24 * 3600 * 1000, rowId: 'old' }, { at: now - 3600 * 1000, rowId: 'recent' }] });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: ROW0 });
    await syncCap(page);
    const e = await page.evaluate(async () => (await dbGet('settings.attempts')).entries.map(x => ({ rowId: x.rowId, by: x.by || null })));
    expect(e).toEqual([{ rowId: 'recent', by: null }, { rowId: ROW0, by: 'u1' }]);
  });

  test('attempts keep at most the newest 1,000', async ({ page }) => {
    await armStage0(page, {});
    const now = Date.now();
    await seedSettings(page, 'settings.attempts', { entries: Array.from({ length: 1000 }, (_, i) => ({ at: now - 5000 + i, rowId: 'e' + i })) });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: ROW0 });
    await syncCap(page);
    const ids = await page.evaluate(async () => (await dbGet('settings.attempts')).entries.map(x => x.rowId));
    expect(ids.length).toBe(1000);
    expect([ids[0], ids[ids.length - 1]]).toEqual(['e1', ROW0]);
  });

  test('two saves at once keep both attempts', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: ROW0 });
    await seedTrait(page, { name: 'hat', layer: 'hats', rowId: ROW1 });
    await page.evaluate(async () => {
      const a = await dbGet('t_cap_hats_wip'), b = await dbGet('t_hat_hats_wip');
      await Promise.all([cloudSyncOne(a, null, {}), cloudSyncOne(b, null, {})]);
    });
    const ids = await page.evaluate(async () => (await dbGet('settings.attempts')).entries.map(x => x.rowId).sort());
    expect(ids).toEqual([ROW0, ROW1].sort());
  });

  test('an attempt tells no other tab to redraw; a trait write does', async ({ page }) => {
    /* By difference (Finding 3): the beforeEach's dbClear posts its own
       message 150 ms after it, so the count starts from a quiet moment. */
    const n = await page.evaluate(async () => {
      let posted = 0;
      const real = tabChan.postMessage.bind(tabChan);
      tabChan.postMessage = (m) => { posted++; return real(m); };
      try {
        await new Promise(r => setTimeout(r, 400));
        const base = posted;
        await s0Attempt({ at: Date.now(), id: 'x', rowId: null });
        await new Promise(r => setTimeout(r, 400));
        const afterAttempt = posted;
        await dbPut({ id: 't_z_hats_wip', kind: 'trait', name: 'z', layer: 'hats', status: 'wip', w: 1, h: 1, at: 1, blob: new Blob([new Uint8Array(1)]) });
        await new Promise(r => setTimeout(r, 400));
        return [afterAttempt - base, posted - afterAttempt];
      } finally { tabChan.postMessage = real; }
    });
    expect(n).toEqual([0, 1]);
  });

  /* ---- Finding 1: the two places that rebuild a record keep the pairing ---- */
  test('on your own page, a moved file saved in the editor still carries the old row into its insert', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    expect((await stored(page, 't_cap_hats_approved')).s0Replaces, 'the import noted the pairing (precondition)').toBe(ROW0);
    const ok = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_approved'));
      return saveTraitNow();
    });
    expect(ok, 'the save went through').toBe(true);
    expect((await stored(page, 't_cap_hats_approved')).s0Replaces, 'saveTraitNow rebuilt the record and kept it').toBe(ROW0);
    await syncOne(page, 't_cap_hats_approved');
    expect((await insertBody(page)).replaces).toBe(ROW0);
  });

  test('on your own page, a moved file renamed in the editor carries the pairing to its new id', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    const ok = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_approved'));
      $('tname').value = 'cap2';
      return saveTraitNow();
    });
    expect(ok, 'the save went through').toBe(true);
    expect(await stored(page, 't_cap_hats_approved'), 'the old id is gone').toBeNull();
    expect((await stored(page, 't_cap2_hats_approved')).s0Replaces).toBe(ROW0);
  });

  test('on your own page, a moved file re-imported with new pixels still carries the old row into its insert', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    await importOver(page, null, 'col/hats/approved/cap.png', [3, 3, 10, 10]);
    const r = await stored(page, 't_cap_hats_approved');
    expect(r.w, 'the second import replaced the record (precondition)').toBe(16);
    expect(r.s0Replaces, 'the same-id replacement kept the pairing').toBe(ROW0);
    await syncOne(page, 't_cap_hats_approved');
    expect((await insertBody(page)).replaces).toBe(ROW0);
  });

  /* ---- the audit's missed item: a record never sent, moved again ---- */
  test('on your own page, a file moved twice (wip, approved, rejected) still names the first row', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    await importOver(page, null, 'col/hats/rejected/cap.png');
    expect(await stored(page, 't_cap_hats_approved'), 'the second import moved it on (precondition)').toBeNull();
    expect((await stored(page, 't_cap_hats_rejected')).s0Replaces).toBe(ROW0);
    await syncOne(page, 't_cap_hats_rejected');
    expect((await insertBody(page)).replaces).toBe(ROW0);
  });

  /* ---- Finding 4: whose record it stays ---- */
  test('the pairing written with nobody signed in any more keeps whose record it is', async ({ page }) => {
    await armStage0(page, { ws: null });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', by: 'u1', wk: 'person', lid: 'l_cap' });
    const told = await page.evaluate(async (ROW0) => {
      localStorage.removeItem('chatnft.session'); s0SeenUid = null;
      if (s0Uid() !== null) throw new Error('somebody is still signed in (precondition)');
      return s0StandsIn({ rowId: ROW0 }, 't_cap_hats_approved');
    }, ROW0);
    expect(told, 'nothing to tell on your own page').toBe(false);
    const r = await stored(page, 't_cap_hats_approved');
    expect([r.s0Replaces, r.by, r.lid]).toEqual([ROW0, 'u1', 'l_cap']);
  });

  test('the pairing written after the session was refused mid-way keeps whose record it is', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-a', synced: true, by: 'u1', wk: 'sent', lid: 'l_cap' });
    const r = await page.evaluate(async (ROW0) => {
      /* A token inside its last minute: sbToken renews it, and the renewal
         is refused - sbToken clears the session and calls sessionEnded. */
      const s = JSON.parse(localStorage.getItem('chatnft.session'));
      s.expires_at = Math.floor(Date.now() / 1000) + 10;
      localStorage.setItem('chatnft.session', JSON.stringify(s));
      const inner = window.fetch;
      window.fetch = async (u, io) => {
        if (String(u).indexOf('/auth/v1/token') >= 0) {
          window.__s0.log.push('POST /auth/v1/token (refused)');
          return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return inner(u, io);
      };
      const told = await s0StandsIn({ rowId: ROW0 }, 't_cap_hats_approved');
      return { told, session: localStorage.getItem('chatnft.session'), uid: s0Uid(), log: window.__s0.log.slice() };
    }, ROW0);
    expect(r.log, 'the renewal was asked and refused (precondition)').toContain('POST /auth/v1/token (refused)');
    expect([r.session, r.uid], 'nobody is signed in now (precondition)').toEqual([null, null]);
    expect(r.told, 'the server could not be told').toBe(false);
    expect(r.log.filter(l => l.indexOf('PATCH') === 0), 'nothing was patched').toEqual([]);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.s0Replaces, x.by, x.lid]).toEqual([ROW0, 'u1', 'l_cap']);
  });

  /* ---- Finding 5: never into a store the page moved to ---- */
  test('a pairing that could not be told writes nothing into a store the page moved to meanwhile', async ({ page }) => {
    await armStage0(page, {});
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-a', synced: true, path: 'team7/c1/trait-cap-hats-approved.png' });
    /* My page holds an unrelated trait under the same id. */
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-mine', synced: true });
    await page.evaluate(() => { activeWs = 'team7'; dbp = null; dbpName = null; });
    const r = await page.evaluate(async (ROW0) => {
      const inner = window.fetch;
      window.fetch = async (u, io) => {
        const m = (io && io.method) || 'GET';
        if (String(u).indexOf('/rest/v1/traits?id=eq.row-a') >= 0 && m === 'PATCH') {
          window.__s0.log.push('PATCH (the page moved to My page while it was out)');
          /* As a sign-out does (cloudSignOutNow): the store and wsGen move. */
          activeWs = null; wsGen++; dbp = null; dbpName = null;
          return new Response(JSON.stringify({ message: 'down' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
        return inner(u, io);
      };
      const told = await s0StandsIn({ rowId: ROW0 }, 't_cap_hats_approved');
      return { told, log: window.__s0.log.slice(), ws: activeWs };
    }, ROW0);
    expect(r.log, 'the PATCH was sent and the page moved during it (precondition)').toContain('PATCH (the page moved to My page while it was out)');
    expect([r.told, r.ws]).toEqual([false, null]);
    const mine = await stored(page, 't_cap_hats_approved');
    expect(mine.rowId, 'this is My page\'s record (precondition)').toBe('row-mine');
    expect(mine.s0Replaces, 'My page\'s record was not given the group\'s pairing').toBeUndefined();
  });

  /* ---- beyond the audit: the record stops holding a pairing once it is told ---- */
  test('once the insert that carried the record\'s pairing lands, the record stops holding it', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    await syncOne(page, 't_cap_hats_approved');
    expect((await insertBody(page)).replaces, 'the insert carried it (precondition)').toBe(ROW0);
    const r = await stored(page, 't_cap_hats_approved');
    expect([r.rowId, r.synced, r.wk]).toEqual(['row-new', true, 'sent']);
    expect(r.s0Replaces).toBeUndefined();
  });

  test('an insert that carried the record\'s own row leaves the older pairing on it', async ({ page }) => {
    await armStage0(page, {});
    await putRaw(page, { id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1,
      rowId: ROW1, s0Replaces: ROW0 });
    await syncCap(page);
    expect((await insertBody(page)).replaces, 'the row the record holds went first').toBe(ROW1);
    const r = await stored(page, 't_cap_hats_wip');
    expect([r.rowId, r.synced]).toEqual(['row-new', true]);
    expect(r.s0Replaces, 'the only note of the ROW0 pairing stays').toBe(ROW0);
  });

  test('an edit made while the insert was out keeps the record unsent, and stops it holding the pairing it carried', async ({ page }) => {
    await armStage0(page, { ws: null });
    await importOver(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0,
      path: 'me/c1/trait-cap-hats-wip.png' }, 'col/hats/approved/cap.png');
    await page.evaluate(async () => {
      const inner = window.fetch;
      window.fetch = async (u, io) => {
        const m = (io && io.method) || 'GET';
        if (String(u).indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
          const cur = await dbGet('t_cap_hats_approved');
          await dbPut(Object.assign({}, cur, { rarity: 7 }));
        }
        return inner(u, io);
      };
      await cloudSyncOne(await dbGet('t_cap_hats_approved'), null, {});
    });
    expect((await insertBody(page)).replaces, 'the insert carried it (precondition)').toBe(ROW0);
    const r = await stored(page, 't_cap_hats_approved');
    expect([r.rowId, !!r.synced, r.rarity], 'the edit stays, unsent, on the row just made').toEqual(['row-new', false, 7]);
    expect(r.s0Replaces).toBeUndefined();
  });

  /* ---- fix round 1 (the review of Task 12): the PATCH that tells a row ----
     The PATCH moves the row's updated_at (the touch trigger), so it asks
     for its row back: told only when exactly one row comes back, and the
     record then learns the row's new time, as cloudPatchOne's does - only
     while it still holds that row, unedited, in the store it was read
     from. stage0replaces-sql.spec.js shows the pull that miscounted the
     import; here the stand-in answers the PATCH with a later time than the
     insert's (T1 after T0), which armStage0 alone never does. */
  const T0 = '2026-09-27T12:00:00+00:00', T1 = '2026-09-27T12:00:07+00:00', T3 = '2026-09-27T12:00:03+00:00';
  const seedRowA = (page) => seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-a', rowAt: T0, synced: true,
    by: 'u1', wk: 'sent', lid: 'l_cap', path: 'team7/c1/trait-cap-hats-approved.png' });
  /* s0StandsIn for row-a. `during` runs while the PATCH is out; the PATCH
     then answers the row at T1, or, with rows 'none', no row. */
  const tellRowA = (page, during, rows) => page.evaluate(async ([ROW0, T1, T3, during, rows]) => {
    const inner = window.fetch, seen = [];
    window.fetch = async (u, io) => {
      const m = (io && io.method) || 'GET';
      if (String(u).indexOf('/rest/v1/traits?id=eq.row-a') >= 0 && m === 'PATCH') {
        seen.push({ prefer: (io.headers && io.headers.Prefer) || null, body: JSON.parse(io.body) });
        const cur = await dbGet('t_cap_hats_approved');
        if (during === 'edit') await dbPut(Object.assign({}, cur, { rarity: 7, synced: false, unsent: 'meta' }));
        if (during === 'resaved') await dbPut(Object.assign({}, cur, { rowId: 'row-b', rowAt: T3 }), 'sent');
        /* As a sign-out does (cloudSignOutNow): the store and wsGen move. */
        if (during === 'moved') { activeWs = null; wsGen++; dbp = null; dbpName = null; }
        /* As a refused renewal does (sessionEnded): nobody signed in, the store stays. */
        if (during === 'signedout') { localStorage.removeItem('chatnft.session'); s0SeenUid = null; }
        const answer = rows === 'none' ? [] : rows === 'bare' ? [{ id: 'row-a' }] : [{ id: 'row-a', replaces: ROW0, updated_at: T1 }];
        return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return inner(u, io);
    };
    try { return { told: await s0StandsIn({ rowId: ROW0 }, 't_cap_hats_approved'), seen, ws: activeWs }; }
    finally { window.fetch = inner; }
  }, [ROW0, T1, T3, during || null, rows || null]);

  test('told: the record learns the time the PATCH gave its row, as its own sender does', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page);
    expect(r.seen, 'one PATCH, asking for its row back').toEqual([{ prefer: 'return=representation', body: { replaces: ROW0 } }]);
    expect(r.told).toBe(true);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.rowId, x.rowAt, !!x.synced, x.wk, x.by, x.lid]).toEqual(['row-a', T1, true, 'sent', 'u1', 'l_cap']);
    expect(x.s0Replaces, 'told, so nothing is kept for later').toBeUndefined();
  });

  test('a PATCH that comes back with no row has told nobody: the record keeps the pairing, and its time', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page, null, 'none');
    expect(r.seen.length, 'the PATCH was sent (precondition)').toBe(1);
    expect(r.told).toBe(false);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.s0Replaces, x.rowAt, x.by, x.lid]).toEqual([ROW0, T0, 'u1', 'l_cap']);
  });

  /* Unsent work is based on the row as it was at rowAt. The PATCH's answer
     cannot say whether anybody else changed the row since, and moving
     rowAt past a change nobody here saw would hide it from the pull's
     clash check; so an edited record keeps its time (as cloudPatchOne
     leaves a record edited while its own PATCH was out). */
  test('an edit made while the PATCH was out keeps the time its unsent work is based on', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page, 'edit');
    expect(r.told, 'told (precondition)').toBe(true);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.rarity, !!x.synced, x.rowId, x.rowAt]).toEqual([7, false, 'row-a', T0]);
  });

  test('a re-save that replaced the row while the PATCH was out is not given the old row\'s time', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page, 'resaved');
    expect(r.told, 'told (precondition)').toBe(true);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.rowId, x.rowAt, !!x.synced]).toEqual(['row-b', T3, true]);
  });

  test('told after the session ended meanwhile: the time is written as the record owner\'s', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page, 'signedout');
    expect(r.told, 'told (precondition)').toBe(true);
    expect(await page.evaluate(() => s0Uid()), 'nobody is signed in now (precondition)').toBeNull();
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.rowAt, x.by, x.wk, x.lid]).toEqual([T1, 'u1', 'sent', 'l_cap']);
  });

  test('a row that comes back without its time leaves the record\'s time as it was', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    const r = await tellRowA(page, null, 'bare');
    expect(r.told, 'one row came back: told').toBe(true);
    const x = await stored(page, 't_cap_hats_approved');
    expect([x.rowAt, !!x.synced, x.s0Replaces]).toEqual([T0, true, undefined]);
  });

  test('told, but the page moved to another store meanwhile: nothing is written there', async ({ page }) => {
    await armStage0(page, {});
    await seedRowA(page);
    /* My page holds a record under the same id and - so that only the store
       check stands between the write and it - the same row id. */
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-a', rowAt: T0, synced: true, lid: 'l_mine' });
    await page.evaluate(() => { activeWs = 'team7'; dbp = null; dbpName = null; });
    const r = await tellRowA(page, 'moved');
    expect([r.told, r.ws], 'told, and the page moved during it (precondition)').toEqual([true, null]);
    const mine = await stored(page, 't_cap_hats_approved');
    expect(mine.lid, 'this is My page\'s record (precondition)').toBe('l_mine');
    expect([mine.rowAt, mine.wk || null], 'My page\'s record was not given the group row\'s time').toEqual([T0, null]);
  });
});

test.describe('stage 0: a loop notes its attempts together (Decision 20, Ruling F-18)', () => {
  test('Save to cloud notes every attempt of its run in one append, before its first delete', async ({ page }) => {
    await armStage0(page, {});
    for (const [n, row] of [['cap', 'row-a'], ['hat', 'row-b'], ['top', 'row-c']]) await seedTrait(page, { name: n, layer: 'hats', rowId: row });
    await countAppends(page);
    await page.evaluate(async () => { await cloudPush(); });
    expect(await appendsDone(page), 'one append, carrying all three').toEqual([3]);
    const e = await attempts(page);
    expect(e.map(x => x.rowId).sort()).toEqual(['row-a', 'row-b', 'row-c']);
    expect(e.map(x => x.by)).toEqual(['u1', 'u1', 'u1']);
    const log = await page.evaluate(() => window.__s0.log);
    const del = log.findIndex(l => l.indexOf('DELETE /rest/v1/traits?') === 0);
    expect(del, 'the push deleted (precondition)').toBeGreaterThan(-1);
    expect(log.indexOf('APPEND 3'), 'noted before the first delete').toBeLessThan(del);
    expect(log.filter(l => l.indexOf('DELETE /rest/v1/traits?') === 0).length, 'three deletes').toBe(3);
  });

  test('a run older than S0_ATTEMPT_FRESH_MS notes again what is still to go, so each delete has an entry from just before it', async ({ page }) => {
    await armStage0(page, {});
    for (const [n, row] of [['cap', 'row-a'], ['hat', 'row-b'], ['top', 'row-c']]) await seedTrait(page, { name: n, layer: 'hats', rowId: row });
    const r = await page.evaluate(async () => {
      S0_ATTEMPT_FRESH_MS = 1000;
      const late = { cap: 0, hat: 1500, top: 3000 }, deleted = {};
      const inner = window.fetch;
      window.fetch = async (u, io) => {
        const s = String(u), m = (io && io.method) || 'GET';
        const up = /\/storage\/v1\/object\/traits\/.*trait-([a-z]+)-hats-wip\.png/.exec(s);
        if (up && m === 'POST') await new Promise(res => setTimeout(res, late[up[1]] || 0));
        const del = /\/rest\/v1\/traits\?id=eq\.([^&]+)/.exec(s);
        if (del && m === 'DELETE') deleted[decodeURIComponent(del[1])] = Date.now();
        return inner(u, io);
      };
      try { await cloudPush(); } finally { S0_ATTEMPT_FRESH_MS = 30000; }
      const e = (await dbGet('settings.attempts')).entries;
      const gap = {};
      for (const row of Object.keys(deleted)) {
        const before = e.filter(x => x.rowId === row && x.at <= deleted[row]).map(x => x.at);
        gap[row] = before.length ? deleted[row] - Math.max(...before) : null;
      }
      return { gap, spread: Math.max(...Object.values(deleted)) - Math.min(...Object.values(deleted)) };
    });
    expect(r.spread, 'the deletes were spread over more than the window (precondition)').toBeGreaterThan(2000);
    for (const row of ['row-a', 'row-b', 'row-c']) {
      expect(r.gap[row], row + ' has an entry noted before its delete').not.toBeNull();
      expect(r.gap[row], row + '\'s newest entry is from inside the window').toBeLessThan(1000);
    }
  });

  test('a run notes at most S0_ATTEMPT_CHUNK entries at once', async ({ page }) => {
    await armStage0(page, {});
    for (const [n, row] of [['cap', 'row-a'], ['hat', 'row-b'], ['top', 'row-c']]) await seedTrait(page, { name: n, layer: 'hats', rowId: row });
    await countAppends(page);
    await page.evaluate(async () => { S0_ATTEMPT_CHUNK = 2; try { await cloudPush(); } finally { S0_ATTEMPT_CHUNK = 100; } });
    expect(await appendsDone(page)).toEqual([2, 1]);
    expect((await attempts(page)).map(x => x.rowId).sort()).toEqual(['row-a', 'row-b', 'row-c']);
  });

  test('a send the run did not foresee is noted on its own, with what is still to go; a foreseen one is not noted twice', async ({ page }) => {
    await armStage0(page, {});
    await countAppends(page);
    const ids = await page.evaluate(async () => {
      const run = s0AttemptRun([{ id: 't_a_hats_wip', kind: 'trait', name: 'a', layer: 'hats', status: 'wip', rowId: 'row-a' }]);
      await s0Attempted({ id: 't_z_hats_wip', kind: 'trait', name: 'z', layer: 'hats', status: 'wip' }, run);
      await s0Attempted({ id: 't_a_hats_wip', kind: 'trait', name: 'a', layer: 'hats', status: 'wip', rowId: 'row-a' }, run);
      return (await dbGet('settings.attempts')).entries.map(x => x.id + ':' + (x.rowId || (x.ident && x.ident.name)));
    });
    expect(await appendsDone(page)).toEqual([2]);
    expect(ids).toEqual(['t_z_hats_wip:z', 't_a_hats_wip:row-a']);
  });

  test('a group folder import notes its sends in one append, and leaves out a file already here unchanged', async ({ page }) => {
    await armStage0(page, {});
    await countAppends(page);
    const r = await page.evaluate(async () => {
      LAYERS = ['hats', 'unsorted'];
      const pic = async (f) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        c.getContext('2d').fillRect(f[0], f[1], f[2], f[3]);
        return new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
      };
      const A = await pic([1, 1, 4, 4]), B = await pic([5, 5, 6, 6]), C = await pic([2, 2, 12, 12]);
      await dbPut({ id: 't_c_hats_wip', kind: 'trait', name: 'c', layer: 'hats', status: 'wip', w: 16, h: 16, rarity: 1, at: 1,
        synced: true, rowId: 'row-c', path: 'team7/c1/trait-c-hats-wip.png', blob: new Blob([C], { type: 'image/png' }) });
      const rc = window.confirm; window.confirm = () => true;
      try { await bulkImport([fileWithPath(A, 'col/hats/wip/a.png'), fileWithPath(B, 'col/hats/wip/b.png'), fileWithPath(C, 'col/hats/wip/c.png')]); }
      finally { window.confirm = rc; }
      return { note: $('bulknote').textContent, posts: window.__s0.log.filter(l => l === 'POST /rest/v1/traits').length };
    });
    expect(r.posts, 'a and b were sent, c was not (precondition)').toBe(2);
    expect(r.note).toContain('1 already here');
    expect(await appendsDone(page), 'one append for the import').toEqual([2]);
    expect((await attempts(page)).map(x => x.id).sort()).toEqual(['t_a_hats_wip', 't_b_hats_wip']);
  });

  test('a layer rename in a group notes its moves in one append', async ({ page }) => {
    await armStage0(page, {});
    for (const [n, row] of [['cap', 'row-a'], ['hat', 'row-b'], ['top', 'row-c']])
      await seedTrait(page, { name: n, layer: 'hats', rowId: row, synced: true, path: 'team7/c1/trait-' + n + '-hats-wip.png' });
    await countAppends(page);
    const r = await page.evaluate(async () => retagLayer(await dbAll(), 'hats', 'caps'));
    expect([r.moved, r.stranded], 'all three moved and reached the group (precondition)').toEqual([3, 0]);
    expect(await appendsDone(page)).toEqual([3]);
    expect((await attempts(page)).map(x => x.ident && (x.ident.layer + '/' + x.ident.name)).sort()).toEqual(['caps/cap', 'caps/hat', 'caps/top']);
  });

  test('a sort in a group notes its moves in one append', async ({ page }) => {
    await armStage0(page, {});
    for (const [n, row] of [['cap', 'row-a'], ['hat', 'row-b'], ['top', 'row-c']])
      await seedTrait(page, { name: n, layer: 'unsorted', rowId: row, synced: true, path: 'team7/c1/trait-' + n + '-unsorted-wip.png' });
    await countAppends(page);
    const r = await page.evaluate(async () => {
      LAYERS = ['hats', 'unsorted'];
      const move = ['cap', 'hat', 'top'].map(n => ({ id: 't_' + n + '_unsorted_wip', name: n, toName: n, toLayer: 'hats', status: 'wip' }));
      return sortApply({ layers: [], both: [], move, rename: [] });
    });
    expect([r.moved, r.stranded], 'all three moved and reached the group (precondition)').toEqual([3, 0]);
    expect(await appendsDone(page)).toEqual([3]);
    expect((await attempts(page)).map(x => x.ident && (x.ident.layer + '/' + x.ident.name)).sort()).toEqual(['hats/cap', 'hats/hat', 'hats/top']);
  });
});
