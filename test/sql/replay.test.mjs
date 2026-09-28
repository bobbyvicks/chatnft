import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeDb, asUser, asAnon, catalogSnapshot, applySqlFile, MIGRATIONS, ROOT, A0_NAME, seedTeam } from './harness.mjs';
import { loadLiveCatalog, diffCatalog, catalogPartSql, HASHED, INFO_PREFIXES } from './catalog.mjs';

/* Live-catalog differences PGlite cannot reproduce, each with its reason.
   Empty until a run shows one; an entry without a reason is a hole. */
const ALLOWED = {};

const U1 = '00000000-0000-4000-8000-000000000001', U2 = '00000000-0000-4000-8000-000000000002';
const T1 = '00000000-0000-4000-8000-0000000000a1', T2 = '00000000-0000-4000-8000-0000000000a2';
const C1 = '00000000-0000-4000-8000-0000000000c1', C2 = '00000000-0000-4000-8000-0000000000c2';

test('every migration file is listed, in version order, and nothing listed is missing', () => {
  const dir = readdirSync(join(ROOT, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort();
  const others = dir.filter(f => !f.endsWith('_' + A0_NAME + '.sql'));
  assert.deepEqual(others, [...MIGRATIONS].sort());
  assert.deepEqual([...MIGRATIONS], [...MIGRATIONS].sort());
});

/* ADDED to the plan text (Task 3). git holds every SQL file here with LF, but
   a checkout with core.autocrlf=true may write one CRLF, and a function body
   keeps its \r - so the replay would differ from live in that body and
   print-drift.mjs would record a change live never had. The harness reads
   what the repo holds; this proves it with a file written CRLF on purpose. */
test('a SQL file written CRLF by the checkout replays as the LF that git holds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pb-crlf-'));
  const file = join(dir, 'crlf.sql');
  writeFileSync(file, 'create function public.crlf_probe() returns int\r\nlanguage plpgsql\r\nas $$\r\nbegin\r\n  return 1;\r\nend $$;\r\n');
  const db = await makeDb({ through: 'shim' });
  try {
    await applySqlFile(db, file, null);
    const src = (await db.query("select prosrc from pg_proc where proname = 'crlf_probe'")).rows[0].prosrc;
    assert.ok(src.includes('\n'), 'the probe body has no line break, so it cannot show a carriage return: ' + JSON.stringify(src));
    assert.ok(!src.includes('\r'), 'a carriage return reached the function body: ' + JSON.stringify(src));
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the harness: a member\'s write is gone unless committed, and the session is the superuser after', async () => {
  const db = await makeDb({ through: 'before-a0' });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  const name = async () => (await db.query('select name from public.collections where id = $1', [C1])).rows[0].name;
  await asUser(db, U1, tx => tx.query("update public.collections set name = 'rolled back' where id = $1", [C1]));
  assert.equal(await name(), 'My collection');
  await asUser(db, U1, tx => tx.query("update public.collections set name = 'kept' where id = $1", [C1]), { commit: true });
  assert.equal(await name(), 'kept');
  assert.equal((await db.query('select current_user as u')).rows[0].u, 'postgres');
  await db.close();
});

test('row level security is live in the replay: a member sees their project only, anon sees none', async () => {
  const db = await makeDb({ through: 'before-a0' });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  await seedTeam(db, { uid: U2, team: T2, collection: C2 });
  const seen = async (uid) => (await asUser(db, uid, tx => tx.query('select id from public.collections'))).rows.map(r => r.id);
  assert.deepEqual(await seen(U1), [C1]);
  assert.deepEqual(await seen(U2), [C2]);
  assert.equal((await asAnon(db, tx => tx.query('select id from public.collections'))).rows.length, 0);
  await db.close();
});

test('pb_owner owns every public table and function, is not a superuser, and bypasses RLS', async () => {
  const db = await makeDb({ through: 'before-a0' });
  const r = (await db.query(`select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r') as tables,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and pg_get_userbyid(c.relowner) <> 'pb_owner') as tables_other,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and pg_get_userbyid(p.proowner) <> 'pb_owner') as functions_other,
      (select rolsuper from pg_roles where rolname = 'pb_owner') as super,
      (select rolbypassrls from pg_roles where rolname = 'pb_owner') as bypass`)).rows[0];
  assert.ok(r.tables >= 5, 'the replay made ' + r.tables + ' public tables');
  assert.deepEqual({ tables_other: r.tables_other, functions_other: r.functions_other, super: r.super, bypass: r.bypass },
    { tables_other: 0, functions_other: 0, super: false, bypass: true });
  await db.close();
});

test('calibration: the bare replay differs from live in the three columns no migration adds', async () => {
  const db = await makeDb({ through: 'replay' });
  const keys = diffCatalog(loadLiveCatalog().rows, await catalogSnapshot(db)).map(d => d.k);
  await db.close();
  for (const k of ['col|collections|rules', 'col|collections|decisions', 'col|collections|decide_order'])
    assert.ok(keys.includes(k), 'the diff cannot see ' + k + ', so it would call any replay clean');
});

test('live-drift.sql has nothing the printer could not write', () => {
  const t = readFileSync(join(ROOT, 'supabase', 'fixtures', 'live-drift.sql'), 'utf8');
  assert.ok(!t.includes('UNHANDLED'), 'live-drift.sql still holds UNHANDLED lines');
});

test('the replay plus the live drift is the live catalog', async () => {
  for (const [k, why] of Object.entries(ALLOWED)) assert.ok(typeof why === 'string' && why.length > 20, k + ' has no reason');
  const db = await makeDb({ through: 'before-a0' });
  const whole = await catalogSnapshot(db);
  /* ADDED to the plan text (Task 3): the capture's part-wise fallback, run.
     catalogPartSql's rows, one part per kind catalog.mjs declares, joined and
     put in byte order, are CATALOG_SQL's rows exactly. This runs Task 2's
     Fix B (schema| rows from pg_namespace) but does not reach its reason, a
     database with no extensions schema: with the plan's schema| text put
     back, this still passes, because the replay has extensions, as live does. */
  const parts = [];
  for (const p of [...Object.keys(HASHED).map(kind => kind + '|'), ...INFO_PREFIXES]) {
    const v = (await db.query(catalogPartSql(p))).rows[0].catalog;
    parts.push(...((typeof v === 'string' ? JSON.parse(v) : v) || []));
  }
  const d = diffCatalog(loadLiveCatalog().rows, whole).filter(x => !(x.k in ALLOWED));
  await db.close();
  assert.deepEqual(d.map(x => x.k), [], 'differences:\n' + d.map(x => x.k + '\n  live:  ' + JSON.stringify(x.live)
    + '\n  local: ' + JSON.stringify(x.local)).join('\n'));
  parts.sort((a, b) => Buffer.compare(Buffer.from(a.k, 'utf8'), Buffer.from(b.k, 'utf8')));
  assert.deepEqual(parts, whole, 'catalogPartSql\'s parts, joined, are not CATALOG_SQL\'s rows');
});
