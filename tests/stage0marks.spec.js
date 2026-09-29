/* STAGE 0: EVERY REMOVAL AND EVERY MOVE'S DROP, RECORDED (design D1:
   "Deletes and moves: each is recorded ... marked as a person's removal or a
   move's drop, with the row it moved to").

   In settings.gonemarks - a record of its own. settings.gone is today's
   personal-page queue of rows to delete at the next Save to cloud, and the
   page before stage 0 (the rollback, E1) reads it as exactly that and
   rewrites it whole. The controls: that queue is unchanged, and Clear -
   local only - records nothing.

   And the record stays small: it is rewritten whole on every append and
   read by every redraw, so a Sort appends once however many traits it
   moves, and the marks keep 30 days and the newest 1,000 (Decision 20).

   Beyond the plan's ten, from the controller's audit of this task against
   Task 10's page (anchor-audit/amend-task13.md, Findings 1-8), each premise
   measured on the page first:
   - A pull's re-id is one transaction (Task 10, fix round 5). Its mark is
     collected once that transaction has committed, and appended after the
     loop into the store the re-ids were made in, or nowhere. The two
     repair cases stage0stamps.spec.js stops a re-id in - a synced trait the
     server moved to another layer, and unsent work whose id collides with
     the server's row - are stopped here just before and just after the
     transaction, with a no-stop control (Finding 5). A stop that leaves the
     page on another store records none of the re-ids already made (the
     stated trade: lost, never misfiled); one that leaves it on the same
     store - your own page, signed out - keeps them.
   - The catch-up's "removed by someone else" goes to the group's store or
     nowhere (Finding 3), and carries the uid it began with even when the
     session ends under it (Finding 8).
   - A record from before stage 0 has no local id: the marks carry the one
     the store gave it, for a pull's re-id and for a drag on your own page,
     which writes a copy (Finding 7).
   - The editor's rename is recorded, and only when the old id went.
   And from the review of this task (fix round 1): a person's operation
   names the store it began in too, and whose it is, taken before its first
   wait, as the pull does. The drag, Sort, a layer rename or removal and a
   folder import append after a send; every person site appends after a
   write the page can move off the store under. A switch there filed the
   group's marks in the personal store, where the same ids are other
   traits (measured by review, for the drag and a layer rename).
   Read in both stores by id: settings.gonemarks, where a record that is
   missing reads as null - not through a trait filter, which cannot see a
   misfiled one (the audit's note on stage0stamps' reads).

   The stand-ins answer only what they name, through armStage0's, which
   records anything else and fails the test (design E2); and a request that
   gets past every stand-in is stopped before the network and fails the
   test too, as in stage0stamps.spec.js. */
import { test, expect } from '@playwright/test';
import { armStage0, seedTrait, seedSettings, seedDraft } from './helpers.js';

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

const marks = (page) => page.evaluate(async () => {
  const r = await dbGet('settings.gonemarks');
  return (r ? r.marks : []).map(m => ({ what: m.what, wk: m.wk, by: m.by, from: m.from.id, fromRow: m.from.rowId || null,
    fromLid: m.from.lid || null, to: m.to ? m.to.id : null, toLid: m.to ? m.to.lid || null : null }));
});
/* The marks in one store (ws: a group id, or null for your own page), or
   null when that store holds no settings.gonemarks record at all. */
const marksIn = (page, ws) => page.evaluate(async (ws) => {
  activeWs = ws; dbp = null; dbpName = null;
  const r = await dbGet('settings.gonemarks');
  return r ? r.marks.map(m => ({ what: m.what, wk: m.wk, by: m.by, from: m.from.id, fromRow: m.from.rowId || null,
    fromLid: m.from.lid || null, to: m.to ? m.to.id : null, toLid: m.to ? m.to.lid || null : null })) : null;
}, ws);

test.describe('stage 0: removal and move marks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Moved === 'function');
    await page.evaluate(async () => { activeWs = null; dbp = null; dbpName = null; await dbClear(); });
    await armStage0(page, { ws: null });
    await page.evaluate(() => { LAYERS = ['hats', 'skins', 'unsorted']; });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; localStorage.removeItem('chatnft.session'); });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  test('a status change records the move, from the old id to the new, with the local id', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'me/c1/trait-cap-hats-wip.png', lid: 'l_cap' });
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    expect(await marks(page)).toEqual([{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: 'l_cap', to: 't_cap_hats_approved', toLid: 'l_cap' }]);
  });

  test('a drag to another layer records the move', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', lid: 'l_cap', shelfOrder: 1 });
    await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_wip');
      await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'skins', beforeKey: null });
    });
    const m = await marks(page);
    expect(m.map(x => [x.what, x.from, x.to, x.toLid])).toEqual([['moved', 't_cap_hats_wip', 't_cap_skins_wip', 'l_cap']]);
  });

  test('a picked batch moved at once records each move', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', lid: 'l_cap' });
    await seedTrait(page, { name: 'bow', layer: 'hats', lid: 'l_bow' });
    await page.evaluate(async () => {
      shelfPick.clear();
      for (const r of (await dbAll()).filter(x => x.kind === 'trait')) shelfPick.add(shelfCore.recordKey(r));
      await bulkMoveToLayer('skins');
    });
    expect((await marks(page)).map(x => x.from + '>' + x.to).sort()).toEqual(['t_bow_hats_wip>t_bow_skins_wip', 't_cap_hats_wip>t_cap_skins_wip']);
  });

  test('renaming a layer records each trait it moves', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', lid: 'l_cap' });
    await page.evaluate(async () => { await renameLayer('hats', 'headwear'); });
    expect((await marks(page)).map(x => x.from + '>' + x.to)).toEqual(['t_cap_hats_wip>t_cap_headwear_wip']);
  });

  test('a folder import that moves a file from wip to approved records the move', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', lid: 'l_cap' });
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16);
      const bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
      const rc = window.confirm; window.confirm = () => true;
      try { await bulkImport([fileWithPath(bytes, 'col/hats/approved/cap.png')]); } finally { window.confirm = rc; }
    });
    const m = await marks(page);
    expect(m.map(x => [x.what, x.wk, x.from, x.to])).toEqual([['moved', 'person', 't_cap_hats_wip', 't_cap_hats_approved']]);
    expect(m[0].toLid, 'the record it landed on, read from the store: its local id').toMatch(/^l_/);
  });

  test('a Sort of forty traits records forty moves in one write', async ({ page }) => {
    for (let i = 0; i < 40; i++) await seedTrait(page, { name: 'c' + i, layer: 'hats', lid: 'l_' + i });
    const calls = await page.evaluate(async () => {
      let n = 0; const real = window.s0Append;
      window.s0Append = (...a) => { if (a[0] === 'settings.gonemarks') n++; return real(...a); };
      try {
        const move = [];
        for (let i = 0; i < 40; i++) move.push({ id: 't_c' + i + '_hats_wip', name: 'c' + i, toName: 'c' + i, toLayer: 'skins', status: 'wip' });
        await sortApply({ layers: [], both: [], move, rename: [] });
      } finally { window.s0Append = real; }
      return n;
    });
    expect(calls, 'one append for the whole sort, not one per trait').toBe(1);
    expect((await marks(page)).length).toBe(40);
  });

  test('the marks keep 30 days and the newest 1,000', async ({ page }) => {
    const now = Date.now();
    const old = [{ what: 'removed', wk: 'person', at: now - 31 * 24 * 3600 * 1000, from: { id: 'old' } }];
    const many = Array.from({ length: 1100 }, (_, i) => ({ what: 'removed', wk: 'person', at: now - 5000 + i, from: { id: 'm' + i } }));
    await seedSettings(page, 'settings.gonemarks', { marks: old.concat(many) });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'me/c1/trait-cap-hats-wip.png', lid: 'l_cap' });
    await page.evaluate(async () => { await dbDelShared(await dbGet('t_cap_hats_wip')); });
    const ids = await page.evaluate(async () => (await dbGet('settings.gonemarks')).marks.map(m => m.from.id));
    expect(ids.length).toBe(1000);
    expect([ids[0], ids[ids.length - 1]]).toEqual(['m101', 't_cap_hats_wip']);
    expect(ids).not.toContain('old');
  });

  test('a removal is recorded as a person\'s - and settings.gone, today\'s queue, is exactly as before', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'me/c1/trait-cap-hats-wip.png', lid: 'l_cap' });
    await page.evaluate(async () => { await dbDelShared(await dbGet('t_cap_hats_wip')); });
    expect(await marks(page)).toEqual([{ what: 'removed', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: 'l_cap', to: null, toLid: null }]);
    const gone = await page.evaluate(async () => { const g = await dbGet('settings.gone'); return { keys: Object.keys(g).sort(), rows: g.rows.map(r => r.rowId) }; });
    expect(gone).toEqual({ keys: ['at', 'id', 'kind', 'rows'], rows: ['row-1'] });
  });

  test('THE CONTROL: Clear removes locally and records nothing', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', lid: 'l_cap' });
    await page.evaluate(async () => {
      /* Yes to "remove every saved trait", no to "also remove the settings". */
      let asked = 0;
      const rc = window.confirm; window.confirm = () => (++asked === 1);
      try { await document.getElementById('clearproj').onclick(); } finally { window.confirm = rc; }
    });
    expect(await page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').length), 'Clear did run').toBe(0);
    expect(await marks(page)).toEqual([]);
  });

  /* The row is listed on the first page only (offset=0), as a server lists
     it: answering every page, the plan's stand-in made the pull see it once
     per page, 500 times (stage0stamps.spec.js, round 5). */
  test('a pull that moves a trait to another layer records it as the pull\'s', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', synced: true,
      path: 'me/c1/trait-cap-hats-wip.png', lid: 'l_cap' });
    await page.evaluate(async () => {
      const row = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'wip', path: 'me/c1/trait-cap-hats-wip.png', w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
      const json = (o, x) => new Response(JSON.stringify(o), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
      const before = window.fetch;
      window.fetch = async (u, io) => {
        const s = String(u);
        if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
        if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [row] : [], { 'Content-Range': '0-0/1' });
        return before(u, io);
      };
      try { await cloudPull({ quiet: true }); } finally { window.fetch = before; }
    });
    expect((await marks(page)).map(x => [x.what, x.wk, x.from, x.to])).toEqual([['moved', 'pull', 't_cap_hats_wip', 't_cap_skins_wip']]);
  });

  /* ---- beyond the plan's ten (the audit's Findings 5 and 7, and the editor) ---- */

  test('renaming a trait in the editor records the move, with the row and local id it carries', async ({ page }) => {
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(2, 2, 12, 12);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', lid: 'l_cap', bytes: png });
    const ok = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_wip'));
      if ($('tlayer').value !== 'hats') throw new Error('the editor opened the trait on ' + $('tlayer').value);
      $('tname').value = 'hat';
      return saveTraitNow();
    });
    expect(ok, 'the save went through').toBe(true);
    expect(await marks(page)).toEqual([{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: 'l_cap', to: 't_hat_hats_wip', toLid: 'l_cap' }]);
  });

  /* INTEGRATED OVER TASK 11'S FIX ROUND 4, which writes the renamed record
     and removes the old id in ONE transaction (dbApplyShelfRecords), so a
     move between two writes cannot leave the trait removed and not written
     back, or written twice. The removal of the old id no longer goes
     through dbDel, and it cannot fail on its own: it fails with the write,
     and then nothing is saved. So the refusal is made where the removal now
     is - the transaction that removes t_cap_hats_wip - and its precondition
     is what that failure leaves: the save did not go through, and the old
     id is still there (was: the save went through, and both ids are there,
     a state the one transaction makes impossible). What this test is for
     is unchanged: a removal that failed dropped nothing, and nothing is
     recorded. */
  test('the editor\'s rename whose removal of the old id fails records nothing: nothing was dropped', async ({ page }) => {
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(2, 2, 12, 12);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await seedTrait(page, { name: 'cap', layer: 'hats', status: 'wip', rowId: 'row-1', lid: 'l_cap', bytes: png });
    const r = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_wip'));
      $('tname').value = 'hat';
      const real = dbApplyShelfRecords;
      let refused = 0;
      dbApplyShelfRecords = (dels, ...rest) => (Array.isArray(dels) && dels.indexOf('t_cap_hats_wip') >= 0)
        ? (refused++, Promise.reject(new Error('refused'))) : real(dels, ...rest);
      let ok;
      try { ok = await saveTraitNow(); } finally { dbApplyShelfRecords = real; }
      return { ok, refused, both: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id).sort() };
    });
    expect(r, 'the removal was refused once, so the save did not go through, and the old id is still there')
      .toEqual({ ok: false, refused: 1, both: ['t_cap_hats_wip'] });
    expect(await marks(page)).toEqual([]);
  });

  test('a drag, on your own page, of a synced trait from before stage 0: the mark carries the local id the store gave it', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'me/c1/trait-cap-hats-wip.png', shelfOrder: 1 });
    await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_wip');
      if (rec.lid) throw new Error('seeded with a local id');
      const ok = await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'skins', beforeKey: null });
      if (!ok) throw new Error('the drag did not go through');
    });
    const stored = await page.evaluate(async () => { const r = await dbGet('t_cap_skins_wip'); return { lid: r.lid, synced: !!r.synced }; });
    expect(stored.lid, 'the store gave it a local id').toMatch(/^l_/);
    expect(stored.synced, 'what was written is the unsent copy').toBe(false);
    expect(await marks(page)).toEqual([{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: null, to: 't_cap_skins_wip', toLid: stored.lid }]);
  });

  test('a status change of a synced trait from before stage 0: the mark carries the local id the store gave it', async ({ page }) => {
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'me/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => {
      const r = await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      if (!r.ok) throw new Error('the status change did not go through');
    });
    const lid = await page.evaluate(async () => (await dbGet('t_cap_hats_approved')).lid);
    expect(lid, 'the store gave it a local id').toMatch(/^l_/);
    expect(await marks(page)).toEqual([{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: null, to: 't_cap_hats_approved', toLid: lid }]);
  });

  test('a batch move, in a group, of a synced trait from before stage 0: the mark carries the local id the store gave it', async ({ page }) => {
    await armStage0(page, { ws: 'team7' });
    await page.evaluate(() => { LAYERS = ['hats', 'skins', 'unsorted']; });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png', shelfOrder: 1 });
    await page.evaluate(async () => {
      shelfPick.clear();
      for (const r of (await dbAll()).filter(x => x.kind === 'trait')) shelfPick.add(shelfCore.recordKey(r));
      await bulkMoveToLayer('skins');
    });
    const lid = await page.evaluate(async () => { const r = await dbGet('t_cap_skins_wip'); return r ? r.lid : '(no record)'; });
    expect(lid, 'the store gave it a local id').toMatch(/^l_/);
    expect(await marks(page)).toEqual([{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1',
      fromLid: null, to: 't_cap_skins_wip', toLid: lid }]);
  });
});

/* ==== A PULL'S RE-ID: after its transaction commits, into its own store ====

   The cases are stage0stamps.spec.js's. `unsent` is a trait this device
   never sent whose id collides with the server's row across the name/layer
   boundary ("cap" on "top_hats" and "cap_top" on "hats" are both
   t_cap_top_hats_wip). `synced` is a synced trait the server moved from
   hats to hair. The personal store holds a trait and a drawing of its own
   under the same old id, so anything done in the wrong store shows there.
   `where` the stop comes, as there:
     'before' - the repair's db() is held (armed by its sameRepair call, the
                last thing before it) and the stop comes while it is held;
     'after'  - from the complete event of the first readwrite transaction
                the repair makes in the pull's store: the re-id itself.
   `stop` signs out, or not (the control). With `nextPull` the page signs
   back in and pulls again, nothing held. */
const repairCases = {
  unsent: { layers: ['hats', 'top_hats'], oldId: 't_cap_top_hats_wip', newId: 't_cap_top_top_hats_wip',
    row: { id: 'row-9', kind: 'trait', name: 'cap', layer: 'top_hats', status: 'wip', path: 'team1/c1/trait-cap-top_hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' },
    mine: { name: 'cap_top', layer: 'hats', status: 'wip', synced: false, lid: 'l_mine', by: 'u1', wk: 'person' } },
  synced: { layers: ['hats', 'hair'], oldId: 't_cap_hats_wip', newId: 't_cap_hair_wip',
    row: { id: 'row-1', kind: 'trait', name: 'cap', layer: 'hair', status: 'wip', path: 'team1/c1/trait-cap-hats-wip.png',
      w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' },
    mine: { name: 'cap', layer: 'hats', status: 'wip', synced: true, rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00',
      path: 'team1/c1/trait-cap-hats-wip.png', lid: 'l_seed', by: 'u1', wk: 'pull' } },
};
const seedRepairCase = async (page, c, mine) => {
  await seedTrait(page, { id: c.oldId, name: c.mine.name, layer: c.mine.layer, status: 'wip', synced: false, lid: 'l_personal', by: 'u9', wk: 'person' });
  await seedDraft(page, { traitId: c.oldId, at: 7, by: 'u9', wk: 'person' });   /* the personal store's own */
  await page.evaluate(() => { activeWs = 'team1'; dbp = null; dbpName = null; });
  await seedTrait(page, Object.assign({ id: c.oldId }, mine || c.mine));
  await seedDraft(page, { traitId: c.oldId, at: 9, by: 'u1', wk: 'person' });
  await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
};
/* c.ws: the store the pull is for ('team1' when left out; null: your own page). */
const pullStopped = (page, c, where, stop, nextPull) => page.evaluate(async ([c, where, stop, nextPull]) => {
  const ws = c.ws === undefined ? 'team1' : c.ws, dbName = ws ? 'chatnft.ws.' + ws : 'pixelbench';
  const json = (o, x) => new Response(JSON.stringify(o), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const base = window.fetch;   /* armStage0's: it answers the rest, and records what it cannot */
  window.fetch = async (u, io) => {
    const s = String(u);
    if (s.indexOf('/rest/v1/collections') >= 0 && s.indexOf('protocol') < 0) return json([{ id: 'c1', layers: c.layers }]);
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [c.row] : [], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team1', name: 'One', personal: false }]);
    return base(u, io);
  };
  const read = async (w) => { activeWs = w; dbp = null; dbpName = null;
    const r = await dbGet('settings.gonemarks');
    return r ? r.marks.map(m => ({ what: m.what, wk: m.wk, by: m.by, from: m.from.id, fromRow: m.from.rowId || null,
      fromLid: m.from.lid || null, to: m.to ? m.to.id : null, toLid: m.to ? m.to.lid || null : null })) : null; };
  let open; const gate = new Promise(r => { open = r; });
  let armed = false, reached = false;
  const same = sameRepair, getDb = db, tx = IDBDatabase.prototype.transaction;
  sameRepair = (a, b) => { armed = true; return same(a, b); };
  if (where === 'before') db = () => { const p = getDb(); if (armed) { armed = false; reached = true; return gate.then(() => p); } return p; };
  if (where === 'after') IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
    const t = tx.call(this, names, mode, ...rest);
    if (armed && mode === 'readwrite' && this.name === dbName) {
      armed = false; reached = true;
      t.addEventListener('complete', () => { if (stop) cloudSignOut(); });
    }
    return t;
  };
  activeWs = ws; cloudTeamId = null; dbp = null; dbpName = null;
  const gen0 = wsGen;
  const p = cloudPull({ quiet: true });
  if (where === 'before') {
    for (let i = 0; i < 500 && !reached; i++) await new Promise(r => setTimeout(r, 10));
    if (reached && stop) cloudSignOut();
    open();
  }
  try { await p; } catch (_) {}
  sameRepair = same; db = getDb; IDBDatabase.prototype.transaction = tx;
  const out = { reached, stopped: wsGen !== gen0, group: ws ? await read(ws) : undefined, personal: await read(null) };
  { activeWs = ws; dbp = null; dbpName = null; const x = await dbGet(c.newId); out.newLid = x ? x.lid || null : '(no record)'; }
  if (nextPull) {
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    authed = true; gateShow(false);
    activeWs = ws; cloudTeamId = null; dbp = null; dbpName = null;
    try { await cloudPull({ quiet: true }); } catch (_) {}
    out.afterNextPull = await read(ws);
  }
  window.fetch = base;
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, [c, where, stop, !!nextPull]);

test.describe('stage 0: a pull\'s marks go to the store its re-ids were made in, or nowhere', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Moved === 'function');
    await page.evaluate(async () => { activeWs = null; dbp = null; dbpName = null; await dbClear();
      activeWs = 'team1'; dbp = null; dbpName = null; await dbClear(); activeWs = null; dbp = null; dbpName = null; });
    await armStage0(page, { ws: null });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; localStorage.removeItem('chatnft.session'); });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  const moved = (c, fromRow, fromLid, toLid) => [{ what: 'moved', wk: 'pull', by: 'u1', from: c.oldId, fromRow, fromLid, to: c.newId, toLid }];
  for (const [key, what] of [['unsent', 'unsent work whose id collides with the server\'s row'], ['synced', 'a synced trait the server moved to another layer']]) {
    const c = repairCases[key];
    const fromRow = c.mine.rowId || null;

    test('the control: a re-id of ' + what + ', nobody stopping: one mark, the pull\'s, in the group\'s store, to the local id stored', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await pullStopped(page, c, 'after', false);
      expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal })
        .toEqual({ reached: true, stopped: false, group: moved(c, fromRow, c.mine.lid, r.newLid), personal: null });
      expect(r.newLid, 'the record at the new id keeps the local id').toBe(c.mine.lid);
    });

    test('a re-id of ' + what + ', a sign-out just after its transaction: no mark filed in the personal store - and none in the group\'s, the stated trade', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await pullStopped(page, c, 'after', true);
      expect({ reached: r.reached, stopped: r.stopped, newLid: r.newLid, group: r.group, personal: r.personal })
        .toEqual({ reached: true, stopped: true, newLid: c.mine.lid, group: null, personal: null });
    });

    test('a re-id of ' + what + ', a sign-out just before its transaction: no mark in either store, and the next pull records exactly one', async ({ page }) => {
      await seedRepairCase(page, c);
      const r = await pullStopped(page, c, 'before', true, true);
      expect({ reached: r.reached, stopped: r.stopped, group: r.group, personal: r.personal, afterNextPull: r.afterNextPull })
        .toEqual({ reached: true, stopped: true, group: null, personal: null, afterNextPull: moved(c, fromRow, c.mine.lid, c.mine.lid) });
    });
  }

  /* Finding 7's guard: a record with no local id, so "the local id stored"
     is one the re-id gave it, and a mark that did not read it would say null. */
  test('the control: a re-id of a synced trait from before stage 0, nobody stopping: the mark carries the local id the re-id gave it', async ({ page }) => {
    const c = repairCases.synced;
    await seedRepairCase(page, c, Object.assign({}, c.mine, { lid: undefined }));
    const r = await pullStopped(page, c, 'after', false);
    expect(r.newLid, 'the re-id gave it a local id').toMatch(/^l_/);
    expect({ group: r.group, personal: r.personal }).toEqual({ group: moved(c, 'row-1', null, r.newLid), personal: null });
  });

  /* The positive control for where: the check is "the store the re-ids
     were made in", not "the pull ran to its end". On your own page a
     sign-out leaves the personal store current, and the committed re-id's
     mark is filed there, the puller's. */
  test('a pull on your own page, a sign-out just after its re-id: the mark is kept, the puller\'s, in the store it was made in', async ({ page }) => {
    const c = { ws: null, layers: ['hats', 'skins'], oldId: 't_cap_hats_wip', newId: 't_cap_skins_wip',
      row: { id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'wip', path: 'me/c1/trait-cap-hats-wip.png',
        w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' } };
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', rowAt: '2026-01-01T00:00:00+00:00', synced: true,
      path: 'me/c1/trait-cap-hats-wip.png', lid: 'l_cap', by: 'u1', wk: 'pull' });
    const r = await pullStopped(page, c, 'after', true);
    expect({ reached: r.reached, stopped: r.stopped, personal: r.personal })
      .toEqual({ reached: true, stopped: true, personal: moved(c, 'row-1', 'l_cap', 'l_cap') });
  });
});

/* ==== THE CATCH-UP'S "REMOVED BY SOMEONE ELSE", INTO ITS OWN STORE ====

   team1 holds three synced traits; the server lists only keep, and the
   pictures of g1 and g2 are gone from its folder, so the catch-up removes
   both, one after the other. The second removal is held once its store is
   chosen, and while it is held:
     'switch'  - the page switches to your own page (a stop);
     'session' - the session ends (sessionEnded, as a refused renewal does),
                 which does not stop the catch-up;
     'none'    - nothing (the control; nothing is held). */
const catchUp = (page, how) => page.evaluate(async (how) => {
  const json = (o, x) => new Response(JSON.stringify(o), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const keepRow = { id: 'row-k', kind: 'trait', name: 'keep', layer: 'hats', status: 'wip', path: 'team1/c1/trait-keep-hats-wip.png',
    w: 16, h: 16, rarity: 1, updated_at: '2026-09-27T12:00:00+00:00' };
  const base = window.fetch;   /* armStage0's: it answers the rest (the folder lists empty), and records what it cannot */
  window.fetch = async (u, io) => {
    const s = String(u);
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return json(/[?&]offset=0(&|$)/.test(s) ? [keepRow] : [], { 'Content-Range': '0-0/1' });
    /* team1 listed: a group missing from the list is left for your own page (wsRender). */
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team1', name: 'One', personal: false }]);
    return base(u, io);
  };
  const read = async (w) => { activeWs = w; dbp = null; dbpName = null;
    const r = await dbGet('settings.gonemarks');
    return r ? r.marks.map(m => ({ what: m.what, wk: m.wk, by: m.by, from: m.from.id, fromRow: m.from.rowId || null, to: m.to ? m.to.id : null })) : null; };
  const realDel = dbDel;
  let open; const gate = new Promise(r => { open = r; }); let reached = false;
  /* Held after dbDel has chosen its store: the removal lands where it was made. */
  if (how !== 'none') dbDel = (id) => { const p = realDel(id); if (id === 't_g2_hats_wip') { reached = true; return gate.then(() => p); } return p; };
  activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
  const gen0 = wsGen;
  const run = groupCatchUpRun();
  let sw = null;
  if (how !== 'none') {
    for (let i = 0; i < 500 && !reached; i++) await new Promise(r => setTimeout(r, 10));
    if (reached && how === 'switch') sw = wsSwitch(null);
    if (reached && how === 'session') { sbSaveSession(null); sessionEnded(); }
    open();
  }
  try { await run; } catch (_) {}
  if (sw) { try { await sw; } catch (_) {} }
  dbDel = realDel;
  window.fetch = base;
  const out = { reached, stopped: wsGen !== gen0, group: await read('team1'),
    left: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id).sort(), personal: await read(null) };
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, how);

test.describe('stage 0: a catch-up\'s removals go to the group\'s store, or nowhere, and keep their uid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Moved === 'function');
    await page.evaluate(async () => { activeWs = null; dbp = null; dbpName = null; await dbClear();
      activeWs = 'team1'; dbp = null; dbpName = null; await dbClear(); });
    for (const [name, row] of [['keep', 'row-k'], ['g1', 'row-g1'], ['g2', 'row-g2']])
      await seedTrait(page, { name, layer: 'hats', rowId: row, rowAt: '2026-09-27T12:00:00+00:00', synced: true,
        path: 'team1/c1/trait-' + name + '-hats-wip.png', lid: 'l_' + name, by: 'u1', wk: 'pull' });
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    await armStage0(page, { ws: null });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; localStorage.removeItem('chatnft.session'); });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  const removed = (by) => [{ what: 'removed', wk: 'pull', by, from: 't_g1_hats_wip', fromRow: 'row-g1', to: null },
    { what: 'removed', wk: 'pull', by, from: 't_g2_hats_wip', fromRow: 'row-g2', to: null }];

  test('the control: nothing stopping it, both removals are recorded as the pull\'s, in the group\'s store', async ({ page }) => {
    const r = await catchUp(page, 'none');
    expect(r).toEqual({ reached: false, stopped: false, group: removed('u1'), left: ['t_keep_hats_wip'], personal: null });
  });

  test('a switch to your own page while it removes: nothing filed in the store switched to - and none in the group\'s, the stated trade', async ({ page }) => {
    const r = await catchUp(page, 'switch');
    expect(r).toEqual({ reached: true, stopped: true, group: null, left: ['t_keep_hats_wip'], personal: null });
  });

  test('a session that ends while it removes does not stop it: both removals recorded, with the uid it began with', async ({ page }) => {
    const r = await catchUp(page, 'session');
    expect(r).toEqual({ reached: true, stopped: false, group: removed('u1'), left: ['t_keep_hats_wip'], personal: null });
  });
});

/* ==== A PERSON'S MARKS: INTO THE STORE THE OPERATION BEGAN IN, OR NOWHERE ====

   Fix round 1 (the review's finding). team7 holds a synced cap on hats. The
   personal store holds traits of its own under every id the group's
   operations leave or land on, so a mark filed there would name that
   store's own, unrelated records. Each operation is held at the last wait
   before its append, after its writes to the group's store have landed:
     drag        - its reorder send (rpc/reorder_traits), the review's case;
     chip        - its write of the new id (a status change);
     batch       - its drafts following (a picked batch moved);
     sort        - the trait's send (cloudMoveOne's insert);
     rename      - the trait's send (a layer rename), the review's case;
     removeLayer - the trait's send (a layer removed: its traits to unsorted);
     editor      - its removal of the old id (the editor's rename);
     import      - its drop of the old row (a folder import's moved file);
     removal     - its removal from the store (dbDelShared);
   and two held earlier, at their read of the project, before any write:
   the store a layer rename or removal began in is taken by its caller and
   handed to retagLayer (renameRead, removeLayerRead).
   `how`: 'none' (the control: the hold point is reached, nothing is held),
   'switch' (to your own page, finished before the hold is let go), or
   'session' (the session ends while held, which stops nothing). */
const personOp = (page, site, how) => page.evaluate(async ([site, how]) => {
  let open; const gate = new Promise(r => { open = r; });
  let armed = true, reached = false;
  const undo = [];
  /* Held once the request is under way: it is sent, and answered after the gate. */
  const onFetch = (match) => {
    const base = window.fetch;
    window.fetch = async (u, io) => {
      if (armed && match(String(u), (io && io.method) || 'GET')) { armed = false; reached = true; if (how !== 'none') await gate; }
      return base(u, io);
    };
    undo.push(() => { window.fetch = base; });
  };
  /* Held once the page's own function has finished: what it wrote has landed. */
  const after = (name, match) => {
    const real = window[name];
    window[name] = (...a) => {
      const p = real(...a);
      if (armed && match(...a)) { armed = false; reached = true; return how === 'none' ? p : p.then(v => gate.then(() => v)); }
      return p;
    };
    undo.push(() => { window[name] = real; });
  };
  const traitInsert = (s, m) => s.indexOf('/rest/v1/traits') >= 0 && m === 'POST';
  const rc = window.confirm; window.confirm = () => true; undo.push(() => { window.confirm = rc; });
  let run;
  if (site === 'drag') {
    onFetch(s => s.indexOf('/rest/v1/rpc/reorder_traits') >= 0);
    run = async () => commitShelfMove({ recordKey: shelfCore.recordKey(await dbGet('t_cap_hats_wip')), toLayer: 'skins', beforeKey: null });
  } else if (site === 'chip') {
    /* The write of the new id is one transaction with the old id's removal
       since Task 11's fix round 4 (dbApplyShelfRecords); a dbPut of the new
       id now is only the upload's later "sent" write, after the mark. */
    after('dbApplyShelfRecords', (dels, recs) => Array.isArray(recs) && recs.some(r => !!r && r.id === 't_cap_hats_approved'));
    run = async () => setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
  } else if (site === 'batch') {
    after('draftsFollow', () => true);
    run = async () => { shelfPick.clear(); shelfPick.add(shelfCore.recordKey(await dbGet('t_cap_hats_wip'))); return bulkMoveToLayer('skins'); };
  } else if (site === 'sort') {
    onFetch(traitInsert);
    run = () => sortApply({ layers: [], both: [], move: [{ id: 't_cap_hats_wip', name: 'cap', toName: 'cap', toLayer: 'skins', status: 'wip' }], rename: [] });
  } else if (site === 'rename' || site === 'renameRead') {
    if (site === 'rename') onFetch(traitInsert); else after('dbAll', () => true);
    run = () => renameLayer('hats', 'headwear');
  } else if (site === 'removeLayer' || site === 'removeLayerRead') {
    if (site === 'removeLayer') onFetch(traitInsert); else after('dbAll', () => true);
    run = () => removeLayer('hats');
  } else if (site === 'editor') {
    await openTraitRecord(await dbGet('t_cap_hats_wip'));
    if ($('tlayer').value !== 'hats') throw new Error('the editor opened the trait on ' + $('tlayer').value);
    $('tname').value = 'hat';
    /* The old id's removal is one transaction with the renamed record's
       write since Task 11's fix round 4 (dbApplyShelfRecords), not a dbDel. */
    after('dbApplyShelfRecords', dels => Array.isArray(dels) && dels.indexOf('t_cap_hats_wip') >= 0);
    run = () => saveTraitNow();
  } else if (site === 'import') {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16);
    const bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
    after('cloudDropOne', r => !!r && r.id === 't_cap_hats_wip');
    run = () => bulkImport([fileWithPath(bytes, 'col/hats/approved/cap.png')]);
  } else if (site === 'removal') {
    after('dbDel', id => id === 't_cap_hats_wip');
    run = async () => dbDelShared(await dbGet('t_cap_hats_wip'));
  } else throw new Error('no such site: ' + site);
  const gen0 = wsGen;
  const p = run();
  if (how !== 'none') {
    for (let i = 0; i < 500 && !reached; i++) await new Promise(r => setTimeout(r, 10));
    if (reached && how === 'switch') await wsSwitch(null);
    if (reached && how === 'session') { sbSaveSession(null); sessionEnded(); }
    open();
  }
  let threw = null; try { await p; } catch (e) { threw = String((e && e.message) || e); }
  for (const u of undo.reverse()) u();
  const switched = activeWs === null && wsGen !== gen0;
  const read = async (w) => { activeWs = w; dbp = null; dbpName = null;
    const r = await dbGet('settings.gonemarks');
    return r ? r.marks.map(m => ({ what: m.what, wk: m.wk, by: m.by, from: m.from.id, fromRow: m.from.rowId || null,
      fromLid: m.from.lid || null, to: m.to ? m.to.id : null, toLid: m.to ? m.to.lid || null : null })) : null; };
  const out = { reached, switched, threw, group: await read('team7'), personal: await read(null) };
  activeWs = 'team7'; dbp = null; dbpName = null;
  const held = (await dbAll()).filter(x => x.kind === 'trait');
  out.groupTraits = held.map(x => x.id).sort();
  out.groupLids = Object.fromEntries(held.map(x => [x.id, x.lid || null]));
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, [site, how]);

test.describe('stage 0: a person\'s marks go to the store the operation began in, or nowhere', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Moved === 'function');
    await page.evaluate(async () => { activeWs = null; dbp = null; dbpName = null; await dbClear();
      activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); activeWs = null; dbp = null; dbpName = null; });
    /* The personal store's own traits, under every id the group's operations leave or land on. */
    for (const [name, layer, status] of [['cap', 'hats', 'wip'], ['cap', 'skins', 'wip'], ['cap', 'headwear', 'wip'],
      ['cap', 'unsorted', 'wip'], ['cap', 'hats', 'approved'], ['hat', 'hats', 'wip']])
      await seedTrait(page, { name, layer, status, lid: 'l_personal_' + name + '_' + layer + '_' + status, shelfOrder: 1 });
    await armStage0(page, { ws: 'team7' });
    await page.evaluate(() => { LAYERS = ['hats', 'skins', 'unsorted']; });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_group_cap', shelfOrder: 1 });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; localStorage.removeItem('chatnft.session'); });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  /* The editor needs a picture it can open. */
  const editorArt = async (page) => {
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(2, 2, 12, 12);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_group_cap', shelfOrder: 1, bytes: png });
  };
  const moved = (to, toLid) => [{ what: 'moved', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1', fromLid: 'l_group_cap', to, toLid }];
  const removed = [{ what: 'removed', wk: 'person', by: 'u1', from: 't_cap_hats_wip', fromRow: 'row-1', fromLid: 'l_group_cap', to: null, toLid: null }];
  const sites = [
    ['drag', 'a drag to another layer', 'its reorder send', 't_cap_skins_wip'],
    ['chip', 'a status change', 'its write of the new id', 't_cap_hats_approved'],
    ['batch', 'a picked batch moved', 'its drafts following', 't_cap_skins_wip'],
    ['sort', 'a Sort', 'the trait\'s send', 't_cap_skins_wip'],
    ['rename', 'a layer rename', 'the trait\'s send', 't_cap_headwear_wip'],
    ['removeLayer', 'a layer removal', 'the trait\'s send', 't_cap_unsorted_wip'],
    ['editor', 'the editor\'s rename', 'its removal of the old id', 't_hat_hats_wip'],
    ['import', 'a folder import\'s moved file', 'its drop of the old row', 't_cap_hats_approved'],
    ['removal', 'a person\'s removal', 'its removal from the store', null],
    ['renameRead', 'a layer rename', 'its read of the project', 't_cap_headwear_wip'],
    ['removeLayerRead', 'a layer removal', 'its read of the project', 't_cap_unsorted_wip'],
  ];
  for (const [site, what, where, to] of sites) {
    test('the control: ' + what + ' in a group, nobody switching (' + where + ' reached, not held): its mark, in the group\'s store [' + site + ']', async ({ page }) => {
      if (site === 'editor') await editorArt(page);
      const r = await personOp(page, site, 'none');
      /* A folder import lands on a new record: the mark carries that record's local id. */
      const toLid = site === 'import' ? r.groupLids[to] : 'l_group_cap';
      expect({ reached: r.reached, switched: r.switched, threw: r.threw, group: r.group, personal: r.personal, groupTraits: r.groupTraits })
        .toEqual({ reached: true, switched: false, threw: null, group: to ? moved(to, toLid) : removed, personal: null, groupTraits: to ? [to] : [] });
      if (to) expect(r.groupLids[to], 'the record it landed on has a local id').toMatch(/^l_/);
    });

    test(what + ' in a group, a switch to your own page while ' + where + ' is held: no mark filed in the personal store - and none in the group\'s, the stated trade [' + site + ']', async ({ page }) => {
      if (site === 'editor') await editorArt(page);
      const r = await personOp(page, site, 'switch');
      /* Held after its writes, the move was made in the group's store; held at its read, before any. */
      const groupTraits = /Read$/.test(site) ? ['t_cap_hats_wip'] : to ? [to] : [];
      expect({ reached: r.reached, switched: r.switched, threw: r.threw, group: r.group, personal: r.personal, groupTraits: r.groupTraits })
        .toEqual({ reached: true, switched: true, threw: null, group: null, personal: null, groupTraits });
    });
  }

  test('a drag in a group, the session ending while its send is held, which stops nothing: its mark carries the uid it began with', async ({ page }) => {
    const r = await personOp(page, 'drag', 'session');
    expect({ reached: r.reached, switched: r.switched, threw: r.threw, group: r.group, personal: r.personal })
      .toEqual({ reached: true, switched: false, threw: null, group: moved('t_cap_skins_wip', 'l_group_cap'), personal: null });
  });
});
