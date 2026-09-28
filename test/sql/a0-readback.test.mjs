import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeDb, seedTeam, a0File, applySqlFile, applySqlText, sqlCode, ROOT } from './harness.mjs';
import { preSql, postSql, a0Statements } from '../../tools/a0-readback.mjs';

/* A READ-BACK THAT CANNOT SAY NO IS NOT A READ-BACK.

   The statements Task 7 runs live are run here first, against A0 as written
   (every part true) and against a mutation for every part that decides
   a0_ok. Each mutation names EVERY part it turns false, and every other part
   must stay true, so a mutation that trips the wrong part, or trips more
   than it names, fails too. Each part below is shown false by at least one
   mutation, and every part but collections_rows_ok is shown false ALONE,
   which is what proves a0_ok is the AND of it. collections_rows_ok cannot be
   false alone in any state Postgres allows: its second half follows from a
   validated CHECK and NOT NULL, and a traits row needs a collections row, so
   no collections means no traits either. It stays for the reader of the
   live row.

   The catalog fingerprint (catalog_unchanged) is shown able to say no
   through each kind of row it is made of: a column, a column's own grant, a
   constraint, an index on either table, a policy and a policy's permissive
   flag, a trigger and a trigger disabled, forced RLS, a table grant and a
   new table owner.

   A mutation must change the file, and a from-string must occur in it
   exactly once, or the test fails instead of passing. */

const PARTS = Object.freeze(['fingerprint_ok', 'protocol_ok', 'switching_ok', 'replaces_ok', 'protocol_check_ok',
  'switching_check_ok', 'replaces_free', 'a0_columns_ungranted', 'collections_rows_ok', 'traits_rows_ok',
  'rls_ok', 'privileges_ok', 'catalog_unchanged']);
/* The columns of the post row that are not parts of a0_ok. */
const NOT_PARTS = Object.freeze(['a0_ok', 'quiet', 'n_collections', 'n_traits', 'max_c', 'max_t']);

const U1 = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';

async function seeded(through, { trait = true } = {}) {
  const db = await makeDb({ through });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  if (trait)
    await db.query("insert into public.traits (collection_id, team_id, owner, kind, name, layer, status, w, h, path) values ($1, $2, $3, 'trait', 'cap', 'hats', 'wip', 16, 16, 'p/cap.png')", [C1, T1, U1]);
  return db;
}
const row = async (db, sql) => (await db.query(sql)).rows[0];
/* The parts that are not true, in PARTS order. A null counts as not true. */
const notTrue = (post) => PARTS.filter(p => post[p] !== true);
const exactlyFalse = (post, parts) => {
  assert.deepEqual(notTrue(post), PARTS.filter(p => parts.includes(p)), 'the parts that said no: ' + JSON.stringify(post));
  for (const p of parts) assert.equal(post[p], false, p + ' is false, not null');
  assert.equal(post.a0_ok, false);
};

test('before A0: the pre-read says A0 is absent and this is PixelBench', async () => {
  const db = await seeded('before-a0');
  const pre = await row(db, preSql());
  assert.equal(pre.a0_absent, true);
  assert.equal(pre.fingerprint_ok, true);
  assert.equal(pre.n_collections, 1);
  assert.equal(pre.n_traits, 1);
  assert.match(pre.cat_md5, /^[0-9a-f]{32}$/);
  await db.close();
});

test('A0 as written: every part is true, it is quiet, and the catalog outside A0 is unchanged', async () => {
  const db = await seeded('before-a0');
  const pre = await row(db, preSql());
  await applySqlFile(db, a0File(), 'pb_owner');
  const post = await row(db, postSql(pre));
  assert.deepEqual(Object.keys(post).filter(k => !NOT_PARTS.includes(k)).sort(), [...PARTS].sort(),
    'the parts in the row are exactly the parts this file tests');
  assert.deepEqual(notTrue(post), [], JSON.stringify(post));
  assert.equal(post.a0_ok, true, JSON.stringify(post));
  assert.equal(post.quiet, true, JSON.stringify(post));
  await db.close();
});

test('A0 applied statement by statement - as it will be live - reads the same', async () => {
  const db = await seeded('before-a0');
  const pre = await row(db, preSql());
  const [s1, s2] = a0Statements(readFileSync(a0File(), 'utf8'));
  await applySqlText(db, s1, 'statement 1', 'pb_owner');
  await applySqlText(db, s2, 'statement 2', 'pb_owner');
  const post = await row(db, postSql(pre));
  assert.deepEqual(notTrue(post), [], JSON.stringify(post));
  assert.equal(post.a0_ok, true);
  assert.equal(post.quiet, true);
  await db.close();
});

/* from/to edit the file (from must occur once), append adds a statement
   after it, before runs on the database ahead of the pre-read, role is who
   applies it (pb_owner unless named). parts is every part that must say no. */
const COLS = '\n        constraint collections_switching_at_check check (switching_at is null)';
const MUTATIONS = [
  { name: 'protocol without NOT NULL', from: 'protocol smallint not null default 1', to: 'protocol smallint default 1', parts: ['protocol_ok'] },
  { name: 'protocol as integer', from: 'protocol smallint not null default 1', to: 'protocol integer not null default 1', parts: ['protocol_ok'] },
  /* Has a default that prints 1, and refuses every write to protocol - which Change A must make. */
  { name: 'protocol generated from a constant', from: 'protocol smallint not null default 1', to: 'protocol smallint not null generated always as (1) stored', parts: ['protocol_ok'] },
  { name: 'protocol as an identity column', from: 'protocol smallint not null default 1', to: 'protocol smallint generated always as identity', parts: ['protocol_ok'] },
  { name: 'a check that lets 2 through', from: 'check (protocol = 1)', to: 'check (protocol in (1, 2))', parts: ['protocol_check_ok'] },
  { name: 'switching_at without its time zone', from: 'switching_at timestamptz', to: 'switching_at timestamp', parts: ['switching_ok'] },
  { name: 'a foreign key on replaces', from: 'add column replaces uuid;', to: 'add column replaces uuid references public.traits(id);', parts: ['replaces_free'] },
  { name: 'replaces as text', from: 'add column replaces uuid;', to: 'add column replaces text;', parts: ['replaces_ok'] },
  { name: 'switching_at without its check', from: COLS, to: '', parts: ['switching_check_ok'] },
  { name: 'a project already switching', from: COLS, to: '', append: 'update public.collections set switching_at = now();', parts: ['switching_check_ok', 'collections_rows_ok'] },
  { name: 'a trait already naming a row', append: "update public.traits set replaces = '00000000-0000-4000-8000-0000000000e9';", parts: ['traits_rows_ok'] },
  { name: 'a grant of its own on an A0 column', append: 'grant update (replaces) on public.traits to anon;', parts: ['a0_columns_ungranted'] },
  { name: 'row level security off on traits', append: 'alter table public.traits disable row level security;', parts: ['rls_ok', 'catalog_unchanged'] },
  { name: 'row level security already off on traits before A0', before: 'alter table public.traits disable row level security;', parts: ['rls_ok'] },
  { name: 'members unable to read traits', append: 'revoke select on public.traits from authenticated;', parts: ['privileges_ok', 'catalog_unchanged'] },
  { name: 'members already unable to read traits before A0', before: 'revoke select on public.traits from authenticated;', parts: ['privileges_ok'] },
  { name: 'a posts table appearing (Trellis\'s shape)', append: 'create table public.posts (id int);', parts: ['fingerprint_ok'] },
  { name: 'an index beside A0', append: 'create index collections_extra_idx on public.collections (name);', parts: ['catalog_unchanged'] },
  { name: 'an index on replaces', append: 'create index traits_replaces_idx on public.traits (replaces);', parts: ['catalog_unchanged'] },
  { name: 'a fourth column', append: 'alter table public.traits add column replaced_by uuid;', parts: ['catalog_unchanged'] },
  { name: 'a grant of its own on a column A0 does not add', append: 'grant update (name) on public.traits to anon;', parts: ['catalog_unchanged'] },
  { name: 'a constraint beside A0', append: "alter table public.traits add constraint traits_name_check check (name <> '');", parts: ['catalog_unchanged'] },
  { name: 'a policy beside A0', append: 'create policy traits_anon_read on public.traits for select to anon using (true);', parts: ['catalog_unchanged'] },
  { name: 'a trigger beside A0', append: 'create trigger traits_touch_again before update on public.traits for each row execute function public.touch_updated_at();', parts: ['catalog_unchanged'] },
  { name: 'row level security forced on traits', append: 'alter table public.traits force row level security;', parts: ['catalog_unchanged'] },
  { name: 'a table grant to everyone', append: 'grant select on public.collections to public;', parts: ['catalog_unchanged'] },
  /* The same policy, word for word, but restrictive: only its permissive flag moves. */
  { name: 'the members policy made restrictive', append: 'drop policy traits_team on public.traits;\ncreate policy traits_team on public.traits as restrictive for all to authenticated\n  using (team_id is not null and public.is_team_member(team_id))\n  with check (team_id is not null and public.is_team_member(team_id));', parts: ['catalog_unchanged'] },
  { name: 'the touch trigger disabled', append: 'alter table public.traits disable trigger traits_touch;', parts: ['catalog_unchanged'] },
  /* As the superuser, the only role here that may give a table away. */
  { name: 'traits handed to another owner', append: 'alter table public.traits owner to postgres;', role: null, parts: ['catalog_unchanged'] },
  /* Every cloud-save insert would vanish without an error. */
  { name: 'a rule that discards every trait insert', append: 'create rule traits_discard as on insert to public.traits do instead nothing;', parts: ['catalog_unchanged'] },
  { name: 'a rule on traits disabled', before: 'create rule traits_note as on insert to public.traits do also notify traits_note;', append: 'alter table public.traits disable rule traits_note;', parts: ['catalog_unchanged'] },
  { name: 'traits made unlogged', append: 'alter table public.traits set unlogged;', parts: ['catalog_unchanged'] },
  { name: 'traits given a full replica identity', append: 'alter table public.traits replica identity full;', parts: ['catalog_unchanged'] },
  /* Every project's rules_at back to 0, and the column reads the same as before. */
  { name: 'rules_at dropped and added back', append: 'alter table public.collections drop column rules_at;\nalter table public.collections add column rules_at bigint not null default 0;', parts: ['catalog_unchanged'] },
  { name: 'an identity on a column A0 does not add', append: 'alter table public.traits alter column h add generated by default as identity;', parts: ['catalog_unchanged'] },
  { name: 'a column A0 does not add given another collation', append: 'alter table public.traits alter column name type text collate "C";', parts: ['catalog_unchanged'] },
  /* A select on traits would return the child's rows too. */
  { name: 'a table inheriting from traits', append: 'create table public.traits_more () inherits (public.traits);', parts: ['catalog_unchanged'] },
  { name: 'traits inheriting from another table', append: 'create table public.traits_base ();\nalter table public.traits inherit public.traits_base;', parts: ['catalog_unchanged'] },
  /* As the superuser: creating a publication needs CREATE on the database, which pb_owner lacks. */
  { name: 'traits added to a publication', append: 'create publication traits_pub for table public.traits;', role: null, parts: ['catalog_unchanged'] },
  /* The policy's text is unchanged; what it calls now lets everyone in. */
  { name: 'the policies\' membership function made to say yes', append: "create or replace function public.is_team_member(t uuid) returns boolean language sql stable security definer set search_path = '' as $$ select true $$;", parts: ['catalog_unchanged'] },
  { name: 'members refused the policies\' membership function', append: 'revoke execute on function public.is_team_member(uuid) from authenticated;', parts: ['catalog_unchanged'] },
  /* It is security definer: it runs as its owner. Seen through its ACL's grantors, which follow
     the owner. As the superuser, who may give it away. */
  { name: 'the policies\' membership function handed to another owner', append: 'alter function public.is_team_member(uuid) owner to postgres;', role: null, parts: ['catalog_unchanged'] },
  { name: 'the touch trigger\'s function made a no-op', append: "create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path to '' as $f$ begin return new; end; $f$;", parts: ['catalog_unchanged'] },
];
for (const m of MUTATIONS) {
  test('the post-read says no to ' + m.name, async () => {
    const good = readFileSync(a0File(), 'utf8');
    let bad = good;
    if (m.from !== undefined) {
      assert.equal(good.split(m.from).length, 2, 'the from-string occurs in the A0 file exactly once');
      bad = bad.split(m.from).join(m.to);
    }
    if (m.append) bad = bad + '\n' + m.append + '\n';
    if (!m.before) assert.notEqual(bad, good, 'the mutation changed nothing, so it would test nothing');
    const db = await seeded('before-a0');
    if (m.before) await applySqlText(db, m.before, 'before the pre-read', 'pb_owner');
    const pre = await row(db, preSql());
    await applySqlText(db, bad, 'mutated A0', m.role === undefined ? 'pb_owner' : m.role);
    exactlyFalse(await row(db, postSql(pre)), m.parts);
    await db.close();
  });
}

test('without A0 the post-read raises - it never answers true about columns that are not there', async () => {
  const db = await seeded('before-a0');
  const pre = await row(db, preSql());
  assert.equal(await sqlCode(db.query(postSql(pre))), '42703');
  await db.close();
});

test('after A0 the pre-read says it is there, so it can refuse to run twice', async () => {
  const db = await seeded('a0');
  assert.equal((await row(db, preSql())).a0_absent, false);
  await db.close();
});

test('the fingerprint says no on a database with a posts table (Trellis\'s shape)', async () => {
  const db = await seeded('before-a0');
  await db.exec('create table public.posts (id int)');
  assert.equal((await row(db, preSql())).fingerprint_ok, false);
  await db.close();
});

test('a write after the pre-read is reported as not quiet, with A0 still ok', async () => {
  const db = await seeded('before-a0');
  const pre = await row(db, preSql());
  await applySqlFile(db, a0File(), 'pb_owner');
  await db.query("update public.traits set rarity = 5 where name = 'cap'");
  const post = await row(db, postSql(pre));
  assert.equal(post.a0_ok, true);
  assert.equal(post.quiet, false);
  await db.close();
});

test('an empty project table cannot read as a pass - the row checks need rows', async () => {
  const db = await makeDb({ through: 'before-a0' });
  const pre = await row(db, preSql());
  await applySqlFile(db, a0File(), 'pb_owner');
  exactlyFalse(await row(db, postSql(pre)), ['collections_rows_ok', 'traits_rows_ok']);
  await db.close();
});

test('a project with no traits cannot read as a pass on traits - and its collections row still does', async () => {
  const db = await seeded('before-a0', { trait: false });
  const pre = await row(db, preSql());
  await applySqlFile(db, a0File(), 'pb_owner');
  exactlyFalse(await row(db, postSql(pre)), ['traits_rows_ok']);
  await db.close();
});

test('the CLI prints exactly the statements proven here', () => {
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'tools', 'a0-readback.mjs'), ...args], { encoding: 'utf8' });
  const pre = run('pre');
  assert.equal(pre.status, 0, pre.stderr);
  assert.equal(pre.stdout, preSql() + '\n');
  const dir = mkdtempSync(join(tmpdir(), 'a0-readback-'));
  try {
    const saved = { cat_md5: '0123456789abcdef0123456789abcdef', n_collections: 1, n_traits: '2', max_c: null, max_t: '2026-09-28 03:00:00+00' };
    const f = join(dir, 'pre.json');
    writeFileSync(f, JSON.stringify(saved));
    const post = run('post', f);
    assert.equal(post.status, 0, post.stderr);
    assert.equal(post.stdout, postSql(saved) + '\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const parts = run('parts');
  assert.equal(parts.status, 0, parts.stderr);
  const [s1, s2] = a0Statements(readFileSync(a0File(), 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(parts.stdout, '-- statement 1 of 2\n' + s1 + '\n\n-- statement 2 of 2\n' + s2 + '\n');
  assert.equal(run('neither').status, 2);
});
