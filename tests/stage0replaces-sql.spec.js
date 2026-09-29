/* STAGE 0 AGAINST REAL SQL: AN INSERT THAT STANDS IN FOR A ROW SAYS WHICH
   ONE (design A2, D1), with and without Change A0 (design E2: "stage 0
   before and after Change A0").

   With A0, a re-save lands with replaces naming the row it replaced.
   Without it, PostgREST refuses the unknown key and the save is reported
   refused - with its old row already deleted, which is exactly why A0 is
   applied and read back before stage 0 ships. A first insert carries no
   replaces key and lands either way.

   A file of its own, apart from stage0replaces.spec.js, because it needs
   the SQL harness (test/sql, tests/pg): if the owner keeps the harness
   unpublished, the page change ships without this file (Task 16 Step 3). */
import { test, expect } from '@playwright/test';
import { makeDb, seedTeam } from '../test/sql/harness.mjs';
import { routeSupabase } from './pg/route.js';

const UID = '00000000-0000-4000-8000-000000000001';
const TEAM = '00000000-0000-4000-8000-0000000000a1';
const COLL = '00000000-0000-4000-8000-0000000000c1';
const ROW0 = '00000000-0000-4000-8000-0000000000e1';

for (const through of ['before-a0', 'a0']) {
  test.describe('stage 0 against the database ' + (through === 'a0' ? 'with' : 'without') + ' Change A0', () => {
    let db, pg;
    test.beforeEach(async ({ page }) => {
      db = await makeDb({ through });
      await seedTeam(db, { uid: UID, team: TEAM, collection: COLL });
      await db.query("insert into public.traits (id, collection_id, team_id, owner, kind, name, layer, status, w, h, path) values ($1, $2, $3, $4, 'trait', 'cap', 'hats', 'wip', 16, 16, $5)",
        [ROW0, COLL, TEAM, UID, TEAM + '/' + COLL + '/trait-cap-hats-wip.png']);
      pg = await routeSupabase(page, db, { users: { 'tok-1': UID } });
      await page.goto('/index.html');
      await page.waitForFunction(() => typeof s0Attempt === 'function');
      await page.evaluate(async ({ UID, TEAM }) => {
        try { authed = true; } catch (_) {}
        gateShow(false);
        localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-1', refresh_token: 'r',
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: UID } }));
        activeWs = TEAM; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
        s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
        await dbClear();
      }, { UID, TEAM });
    });
    test.afterEach(async ({ page }) => {
      await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); });
      expect(pg.unrouted, 'every request had a route').toEqual([]);
      expect(pg.unmapped, 'every SQL error had a status').toEqual([]);
      await db.close();
    });

    const save = (page, rec) => page.evaluate(async (rec) => {
      await dbPut(Object.assign({ kind: 'trait', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(8)], { type: 'image/png' }) }, rec));
      const why = {};
      const ok = await cloudSyncOne(await dbGet(rec.id), null, why);
      const stored = await dbGet(rec.id), att = await dbGet('settings.attempts');
      return { ok: !!ok, reason: why.reason || null, status: why.status || null, rowId: stored.rowId || null,
        synced: !!stored.synced, attempts: att ? att.entries : [] };
    }, rec);

    test('a re-save of a trait that has a row', async ({ page }) => {
      const r = await save(page, { id: 't_cap_hats_wip', name: 'cap', layer: 'hats', status: 'wip', rowId: ROW0 });
      /* replaces is A0's column: before A0 there is none to select (measured:
         the plan's "select id, replaces" failed there with 42703). */
      const rows = (await db.query('select id' + (through === 'a0' ? ', replaces' : '') + ' from public.traits')).rows;
      expect(r.attempts.map(a => a.rowId), 'the delete-then-insert was noted first').toEqual([ROW0]);
      if (through === 'a0') {
        expect([r.ok, r.synced]).toEqual([true, true]);
        expect(rows.length).toBe(1);
        expect(rows[0].replaces, 'the new row names the row it stands in for').toBe(ROW0);
        expect(r.rowId).toBe(rows[0].id);
      } else {
        expect([r.ok, r.reason, r.status]).toEqual([false, 'refused', 400]);
        expect(rows.length, 'deleted, then refused: the hazard A0 comes first to prevent').toBe(0);
        expect(r.synced).toBe(false);
      }
    });

    test('a first insert carries no replaces key, and lands either way', async ({ page }) => {
      const r = await save(page, { id: 't_hat_hats_wip', name: 'hat', layer: 'hats', status: 'wip' });
      expect([r.ok, r.synced]).toEqual([true, true]);
      const row = (await db.query("select * from public.traits where name = 'hat'")).rows[0];
      expect(row.id).toBe(r.rowId);
      if (through === 'a0') expect(row.replaces).toBeNull();
    });

    /* FIX ROUND 1 (the review of Task 12): A FOLDER IMPORT'S OWN MOVE OR
       MERGE IS NOT A CHANGE BY THE GROUP. s0StandsIn PATCHes the new row
       with replaces after the import has sent it, and the touch trigger
       (traits_touch) moves that row's updated_at. The record kept the
       insert's time as rowAt, so the next Load from cloud or catch-up found
       the row newer than the record, rewrote it with a pull stamp and said
       "1 changed in place by the group" (measured by the reviewer, and here
       before the fix). The PATCH now asks for its row back, and the record
       learns the row's new time, as cloudPatchOne's does. Before A0 the
       PATCH is refused (replaces is A0's column): nothing moves, and the
       record keeps the pairing (s0Replaces) for the new page instead.
       armStage0's stand-in answers every write with one time, so only real
       SQL can show this. */
    for (const route of [
      { what: 'moves a file from wip to approved', file: 'col/hats/approved/cap.png', id: 't_cap_hats_approved', said: 'moved' },
      { what: 'merges a renamed file', file: 'col/hats/wip/cap v2.png', id: 't_cap v2_hats_wip', said: 'merged' },
    ]) {
      test('a group folder import that ' + route.what + ', then Load from cloud: the import is not counted as the group\'s change', async ({ page }) => {
        const r = await page.evaluate(async ({ ROW0, TEAM, COLL, file, id }) => {
          LAYERS = ['hats', 'unsorted'];
          const c = document.createElement('canvas'); c.width = 16; c.height = 16;
          c.getContext('2d').fillRect(2, 2, 12, 12);
          const bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
          /* The wip trait as a pull left it: its row and its path. */
          await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, rarity: 1, at: 1,
            synced: true, rowId: ROW0, path: TEAM + '/' + COLL + '/trait-cap-hats-wip.png',
            blob: new Blob([bytes], { type: 'image/png' }) }, 'pull');
          /* Every write to a trait row, with the time it answered: the insert,
             carryDecided's weight PATCH (it too moves the row's time, and
             writes it into rowAt), then the PATCH that carries replaces. */
          const inner = window.fetch, writes = [];
          window.fetch = async (u, io) => {
            const res = await inner(u, io);
            const m = io && io.method;
            if (/\/rest\/v1\/traits(\?id=eq\.[^&]+)?$/.test(String(u)) && (m === 'POST' || m === 'PATCH')) {
              let at = null;
              try { const b = await res.clone().json(); if (Array.isArray(b) && b[0]) at = b[0].updated_at || null; } catch (_) { }
              writes.push({ m, replaces: typeof io.body === 'string' && io.body.indexOf('"replaces"') >= 0, status: res.status, at });
            }
            return res;
          };
          const rc = window.confirm; window.confirm = () => true;
          try { await bulkImport([fileWithPath(bytes, file)]); } finally { window.confirm = rc; window.fetch = inner; }
          const imported = await dbGet(id);
          const importNote = $('bulknote').textContent;
          await cloudPull();
          const pulled = await dbGet(id);
          const pick = (x) => x ? { rowId: x.rowId || null, rowAt: x.rowAt || null, synced: !!x.synced, s0Replaces: x.s0Replaces || null, wk: x.wk || null } : null;
          return { writes, importNote, imported: pick(imported), pullNote: $('cloudnote').textContent, pulled: pick(pulled),
            traits: (await dbAll()).filter(x => x.kind === 'trait').map(x => x.id) };
        }, { ROW0, TEAM, COLL, file: route.file, id: route.id });
        const rows = (await db.query('select id, updated_at' + (through === 'a0' ? ', replaces' : '') + ' from public.traits')).rows;
        expect(r.importNote, 'the import ' + route.said + ' it (precondition)').toContain('1 ' + route.said);
        expect(r.traits, 'one record, the new one (precondition)').toEqual([route.id]);
        expect(rows.map(x => x.id), 'one row, the new one: the old row was dropped (precondition)').toEqual([r.imported.rowId]);
        expect(r.writes.filter(w => w.m === 'POST').length, 'the import sent the new record before the ' + route.said.replace(/d$/, '') + ' was found (precondition)').toBe(1);
        expect(r.writes.filter(w => w.replaces).length, 'one PATCH carried replaces (precondition)').toBe(1);
        expect(r.imported.synced, 'sent (precondition)').toBe(true);
        const at = (s) => (s ? new Date(s).getTime() : null);
        /* The row's time as the writes before the replaces PATCH left it. */
        const before = Math.max(...r.writes.filter(w => !w.replaces && w.at).map(w => at(w.at)));
        if (through === 'a0') {
          expect(rows[0].replaces, 'the new row was told the row it replaces').toBe(ROW0);
          expect(rows[0].updated_at.getTime(), 'the replaces PATCH moved the row\'s time (precondition: this test can fail)').toBeGreaterThan(before);
          expect(r.imported.s0Replaces, 'told, so nothing is kept for later').toBeNull();
        } else {
          expect(r.writes.filter(w => w.replaces).map(w => w.status), 'refused: replaces is A0\'s column').toEqual([400]);
          expect(rows[0].updated_at.getTime(), 'so the row\'s time is as the writes before it left it').toBe(before);
          expect(r.imported.s0Replaces, 'not told, so the record keeps the pairing').toBe(ROW0);
        }
        /* Soft, so a red also shows what the pull made of it. */
        expect.soft(at(r.imported.rowAt), 'the record knows the row\'s time').toBe(rows[0].updated_at.getTime());
        expect(r.pullNote, 'the pull found nothing the group changed').toBe('Loaded 0 items.');
        expect(r.pulled.rowAt, 'and did not rewrite the record').toBe(r.imported.rowAt);
        expect(r.pulled.wk).toBe(r.imported.wk);
      });
    }
  });
}
