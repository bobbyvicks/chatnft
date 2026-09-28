import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb, asUser, asAnon, asOwner, sqlCode, seedTeam, a0File, applySqlFile, catalogSnapshot } from './harness.mjs';
import { loadLiveCatalog, byKey } from './catalog.mjs';
import { a0Statements } from '../../tools/a0-readback.mjs';

/* CHANGE A0 (design A8), EVERY REFUSAL BESIDE A SUCCESS (E4).

   A member may write any column of their project (the collections_team and
   traits_team policies check membership only, 20260901181557:11-19), so the
   checks and NOT NULL are all that keep a project on protocol 1 until Change
   A pins it. And A0 must change nothing today's page does: each write the
   page makes is replayed here after A0, quoting where the page makes it. */

const U1 = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const T2 = '00000000-0000-4000-8000-0000000000a2';   // a second group of U1's, with no project yet
const GONE = '00000000-0000-4000-8000-0000000000e9'; // a row id nothing holds

let db;
test.before(async () => {
  db = await makeDb({ through: 'a0' });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  await seedTeam(db, { uid: U1, team: T2, name: 'Second' });
});
test.after(async () => { await db.close(); });

const one = async (p) => { const r = await p; assert.equal(r.rows.length, 1, 'expected exactly one row back'); return r.rows[0]; };
/* The page's trait insert, key for key: index.html:18925-18930 (cloudSyncOne). */
const pageRow = (over = {}) => Object.assign({ collection_id: C1, team_id: T1, owner: U1, kind: 'trait', name: 'cap',
  layer: 'hats', status: 'wip', rarity: 1, shelf_order: null, w: 16, h: 16,
  path: T1 + '/' + C1 + '/trait-cap-hats-wip.png' }, over);
/* Inserted the way PostgREST inserts a JSON body: the named columns, from
   json_populate_recordset, so absent columns take their defaults. */
const insertAsPage = (tx, row) => {
  const keys = Object.keys(row);
  return tx.query('insert into public.traits (' + keys.join(', ') + ') select ' + keys.join(', ')
    + ' from json_populate_recordset(null::public.traits, $1::json) returning *', [JSON.stringify([row])]);
};

test('the file is two statements, one table each, each setting its own 3s lock_timeout', () => {
  const sql = readFileSync(a0File(), 'utf8');
  /* Split by a0Statements, the file's only splitter, so this checks the
     statements exactly as anything sending them one at a time will see
     them; it throws unless there are exactly two. */
  const blocks = a0Statements(sql);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /alter table public\.traits add column replaces uuid;/);
  assert.doesNotMatch(blocks[0], /public\.collections/);
  assert.match(blocks[1], /alter table public\.collections/);
  assert.doesNotMatch(blocks[1], /alter table public\.traits/);
  for (const b of blocks) assert.match(b, /perform set_config\('lock_timeout', '3s', true\);/);
  const rest = blocks.reduce((s, b) => s.split(b).join(''), sql).replace(/--[^\n]*\n?/g, '').trim();
  assert.equal(rest, '', 'the file holds something besides the two statements and comments');
});

test('the lock_timeout it sets lasts for its own transaction only', async () => {
  const inside = await db.transaction(async tx => {
    await tx.query("select set_config('lock_timeout', '3s', true)");
    return (await tx.query('show lock_timeout')).rows[0].lock_timeout;
  });
  assert.equal(inside, '3s', 'the control: inside its transaction it is 3s');
  assert.equal((await db.query('show lock_timeout')).rows[0].lock_timeout, '0');
});

test('applied a second time it raises nothing and changes nothing', async () => {
  const before = await catalogSnapshot(db);
  await applySqlFile(db, a0File(), 'pb_owner');
  assert.deepEqual(await catalogSnapshot(db), before);
});

/* The file's header says a second run "takes no lock at all". Changing
   nothing does not show that: without its count guard the collections
   statement still changes nothing (add column if not exists skips), yet
   takes ACCESS EXCLUSIVE on collections to find that out. PGlite is one
   connection, so nothing here waits on a lock, but a transaction can read
   its own locks in pg_locks, and the first run is the control that the
   read sees them. */
test('applied a second time it takes no lock on either table - where the first run locks both', async () => {
  const LOCKS = `select c.relname || ' ' || l.mode as held
      from pg_catalog.pg_locks l join pg_catalog.pg_class c on c.oid = l.relation
     where l.relation in ('public.collections'::regclass, 'public.traits'::regclass)
       and l.pid = pg_backend_pid() order by 1`;
  const locksHeldBy = async (d, sql) => {
    let held;
    await d.transaction(async tx => {
      await tx.exec('set local role pb_owner');
      await tx.exec(sql);
      held = (await tx.query(LOCKS)).rows.map(r => r.held);
    });
    return held;
  };
  const sql = readFileSync(a0File(), 'utf8');
  assert.deepEqual(await locksHeldBy(db, sql), []);
  const fresh = await makeDb({ through: 'before-a0' });
  try {
    assert.deepEqual(await locksHeldBy(fresh, sql), ['collections AccessExclusiveLock', 'traits AccessExclusiveLock'],
      'the control: the first run\'s ALTERs are seen by the same read');
  } finally { await fresh.close(); }
});

test('a member cannot set protocol 2 - and can still write the layers', async () => {
  assert.equal(await sqlCode(asUser(db, U1, tx => tx.query('update public.collections set protocol = 2 where id = $1', [C1]))), '23514');
  const r = await one(asUser(db, U1, tx => tx.query(`update public.collections set layers = '["hats"]'::jsonb where id = $1 returning protocol`, [C1])));
  assert.equal(r.protocol, 1);
});

test('a member cannot null the protocol - which a CHECK alone would let through - and can set it to 1, as it is', async () => {
  assert.equal(await sqlCode(asUser(db, U1, tx => tx.query('update public.collections set protocol = null where id = $1', [C1]))), '23502');
  const r = await one(asUser(db, U1, tx => tx.query('update public.collections set protocol = 1 where id = $1 returning protocol', [C1])));
  assert.equal(r.protocol, 1);
});

test('a member cannot set switching_at - and can set it to null, as it is', async () => {
  assert.equal(await sqlCode(asUser(db, U1, tx => tx.query('update public.collections set switching_at = now() where id = $1', [C1]))), '23514');
  await one(asUser(db, U1, tx => tx.query('update public.collections set switching_at = null where id = $1 returning id', [C1])));
});

test('a new project cannot start on protocol 2 - and the page\'s own new-project insert lands on 1', async () => {
  assert.equal(await sqlCode(asUser(db, U1, tx => tx.query(
    "insert into public.collections (team_id, owner, name, layers, protocol) values ($1, $2, 'My collection', '[]', 2)", [T2, U1]))), '23514');
  /* index.html:18395-18397: {team_id, owner, name, layers}. */
  const r = await one(asUser(db, U1, tx => tx.query(
    "insert into public.collections (team_id, owner, name, layers) values ($1, $2, 'My collection', '[\"hats\"]') returning protocol, switching_at", [T2, U1])));
  assert.equal(r.protocol, 1);
  assert.equal(r.switching_at, null);
});

test('today\'s trait insert, key for key, lands with replaces null', async () => {
  const r = await one(asUser(db, U1, tx => insertAsPage(tx, pageRow())));
  assert.equal(r.replaces, null);
});

test('replaces takes the id of a row that is gone - there is no foreign key - and refuses a local id', async () => {
  const r = await one(asUser(db, U1, tx => insertAsPage(tx, pageRow({ replaces: GONE }))));
  assert.equal(r.replaces, GONE);
  assert.equal(await sqlCode(asUser(db, U1, tx => insertAsPage(tx, pageRow({ replaces: 't_cap_hats_wip' })))), '22P02');
});

test('every other write today\'s page makes still succeeds', async () => {
  await asUser(db, U1, async tx => {
    const t = (await insertAsPage(tx, pageRow({ name: 'hat', path: T1 + '/' + C1 + '/trait-hat-hats-wip.png' }))).rows[0];
    /* A weight: index.html:16401-16402. */
    assert.equal((await tx.query('update public.traits set rarity = 50 where id = $1 returning id', [t.id])).rows.length, 1);
    /* A weight and an order: index.html:16437-16439. */
    assert.equal((await tx.query('update public.traits set rarity = 2, shelf_order = 7 where id = $1 returning id', [t.id])).rows.length, 1);
    /* Many weights at once, by id in (...): index.html:16518-16519. */
    assert.equal((await tx.query('update public.traits set rarity = 3 where id in ($1) returning id', [t.id])).rows.length, 1);
    /* A drag: index.html:19236. */
    await tx.query('select public.reorder_traits($1, $2::jsonb)', [C1, JSON.stringify([{ id: t.id, layer: 'hats', shelf_order: 1 }])]);
    /* The rules and answers: index.html:14770-14772. The layers: 15992-15993. */
    assert.equal((await tx.query('update public.collections set rules = rules, decide_order = decide_order, decisions = decisions, empty_chance = 0.2, rules_at = 5 where id = $1 returning id', [C1])).rows.length, 1);
    assert.equal((await tx.query(`update public.collections set layers = '["hats","unsorted"]' where id = $1 returning id`, [C1])).rows.length, 1);
    /* A removal by row id: index.html:19054-19055. */
    assert.equal((await tx.query('delete from public.traits where id = $1 returning id', [t.id])).rows.length, 1);
  });
});

test('the touch trigger still moves updated_at when a member writes', async () => {
  const t = await one(asUser(db, U1, tx => insertAsPage(tx, pageRow({ name: 'bow', path: T1 + '/' + C1 + '/trait-bow-hats-wip.png' })), { commit: true }));
  await db.query('select pg_sleep(0.01)');
  const u = await one(asUser(db, U1, tx => tx.query('update public.traits set rarity = 9 where id = $1 returning updated_at', [t.id]), { commit: true }));
  assert.ok(new Date(u.updated_at) > new Date(t.updated_at));
  await db.query('delete from public.traits where id = $1', [t.id]);
});

test('the table\'s owner cannot set protocol 2 either - Change A must drop the check, not work round it', async () => {
  assert.equal(await sqlCode(asOwner(db, tx => tx.query('update public.collections set protocol = 2 where id = $1', [C1]))), '23514');
  await one(asOwner(db, tx => tx.query('update public.collections set name = name where id = $1 returning id', [C1])));
});

test('anon sees no project, yet may name the new columns - what the REST probe reads as 200 []', async () => {
  const r = await asAnon(db, tx => tx.query('select id, protocol, switching_at from public.collections'));
  assert.equal(r.rows.length, 0);
  const live = byKey(loadLiveCatalog().rows);
  const p = (await db.query("select has_column_privilege('anon', 'public.collections', 'protocol', 'SELECT') as sel, has_column_privilege('anon', 'public.traits', 'replaces', 'INSERT') as ins")).rows[0];
  assert.equal(p.sel, live.get('priv|collections|anon|SELECT').has, 'anon may read the new column exactly as it may read the table live');
  assert.equal(p.ins, live.get('priv|traits|anon|INSERT').has, 'anon may insert into it exactly as it may insert into the table live');
  const control = await one(asUser(db, U1, tx => tx.query('select protocol from public.collections where id = $1', [C1])));
  assert.equal(control.protocol, 1);
});
