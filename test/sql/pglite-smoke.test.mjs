import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/* THE INSTRUMENT, CALIBRATED BEFORE ANYTHING LEANS ON IT.

   Every SQL test in this directory reads an error's SQLSTATE from `.code`,
   rolls a transaction back by throwing out of `transaction()`, and switches
   role with SET LOCAL ROLE. Each of those is checked here against a case that
   must succeed and a case that must not, so a harness that silently cannot
   see a refusal is caught before it reports one. */

test('PGlite starts, and says which Postgres it is', async () => {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  const v = (await db.query("select current_setting('server_version_num')::int as v")).rows[0].v;
  console.log('PGlite server_version_num ' + v);
  assert.ok(v >= 150000, 'Postgres 15 or later, got ' + v);
  await db.close();
});

test('an error carries its SQLSTATE in .code, and a statement that works throws nothing', async () => {
  const db = await PGlite.create();
  await db.exec('create table t (id int primary key)');
  await db.query('insert into t values (1)');
  let code = null;
  try { await db.query('insert into t values (1)'); } catch (e) { code = e.code; }
  assert.equal(code, '23505');
  await db.query('insert into t values (2)');
  assert.equal((await db.query('select count(*)::int as n from t')).rows[0].n, 2);
  await db.close();
});

test('pgcrypto loads into a schema called extensions, as on Supabase', async () => {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec('create schema extensions; create extension pgcrypto with schema extensions;');
  const n = (await db.query('select length(extensions.gen_random_bytes(24))::int as n')).rows[0].n;
  assert.equal(n, 24);
  await db.close();
});

test('a value thrown out of transaction() rolls it back and comes out; a resolved one commits', async () => {
  const db = await PGlite.create();
  await db.exec('create table t (id int)');
  const MARK = Symbol('rollback');
  let caught = null;
  try { await db.transaction(async tx => { await tx.query('insert into t values (1)'); throw MARK; }); }
  catch (e) { caught = e; }
  assert.equal(caught, MARK);
  assert.equal((await db.query('select count(*)::int as n from t')).rows[0].n, 0);
  await db.transaction(async tx => { await tx.query('insert into t values (2)'); });
  assert.equal((await db.query('select count(*)::int as n from t')).rows[0].n, 1);
  await db.close();
});

test('SET LOCAL ROLE holds inside its transaction and ends with it', async () => {
  const db = await PGlite.create();
  await db.exec('create role probe_role nologin');
  const inside = await db.transaction(async tx => {
    await tx.exec('set local role probe_role');
    return (await tx.query('select current_user as u')).rows[0].u;
  });
  assert.equal(inside, 'probe_role');
  assert.equal((await db.query('select current_user as u')).rows[0].u, 'postgres');
  await db.close();
});
