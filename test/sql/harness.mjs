/* THE SQL TEST HARNESS (auto cloud save design, E4).

   PGlite, with supabase/fixtures/shim.sql for the Supabase pieces the
   migrations reach, the migrations replayed in order as pb_owner, the
   live-only drift on top, and then - when asked - Change A0.

   What it is for: Change A0's tests, the read-back statements proven before
   they run live, and page specs that route PostgREST requests to real SQL.
   What it is not: Postgres under load. PGlite is one connection, so nothing
   here ever waits on a lock; A8's lock_timeout and its retry on 55P03 are
   not exercised by anything in this directory.

   Roles: a test's query as a member runs inside a transaction with SET LOCAL
   ROLE authenticated and the JWT claims set locally, so neither can leak into
   the next query. The session stays the PGlite superuser. */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_SQL } from './catalog.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const FIX = join(ROOT, 'supabase', 'fixtures');
const PENDING = join(ROOT, 'supabase', 'pending');
export const A0_NAME = 'collections_protocol_and_traits_replaces';
export const STAGES = Object.freeze(['shim', 'replay', 'before-a0', 'a0']);

/* THE MIGRATIONS, NAMED. replay.test.mjs fails if the folder holds a file
   that is not listed here (A0 apart), so a new one cannot be skipped. */
export const MIGRATIONS = Object.freeze([
  '20260901165719_chatnft_collections_and_traits.sql',
  '20260901165734_chatnft_traits_storage_bucket.sql',
  '20260901181529_chatnft_teams.sql',
  '20260901181557_chatnft_team_scoped_policies_and_rpcs.sql',
  '20260901181731_chatnft_storage_path_cast_cannot_raise.sql',
  '20260901183254_chatnft_personal_and_group_teams.sql',
  '20260901183426_chatnft_backfill_existing_teams_as_personal.sql',
  '20260901185234_chatnft_invite_preview.sql',
  '20260901185837_chatnft_no_invites_to_personal_pages.sql',
  '20260903110136_chatnft_trait_shelf_order.sql',
  '20260907214954_widen_traits_rarity_check_to_5000.sql',
  '20260907230000_add_empty_chance_to_collections.sql',
  '20260907234500_team_member_names_rpc.sql',
  '20260908011500_team_member_names_returns_the_chosen_name.sql',
  '20260908030000_add_rules_at_to_collections.sql',
  '20260924120000_traits_status_accepts_final_project.sql',
  '20260925121000_collections_one_per_team.sql',
]);

export function a0File() {
  const inMig = readdirSync(MIG).filter(f => f.endsWith('_' + A0_NAME + '.sql'));
  if (inMig.length > 1) throw new Error('two A0 files in supabase/migrations: ' + inMig.join(', '));
  if (inMig.length === 1) return join(MIG, inMig[0]);
  const p = join(PENDING, A0_NAME + '.sql');
  if (!existsSync(p)) throw new Error('A0 is neither in supabase/migrations nor at ' + p);
  return p;
}

/* CHANGED from the plan text (Task 3): every SQL file is read with CRLF made
   LF. git holds them with LF, but a checkout with core.autocrlf=true may write
   one CRLF (the checkout this was written in held 20260903110136 so), and a
   function body keeps its \r: the replay then differs from live in
   reorder_traits' body, and print-drift.mjs records a change live never had.
   The replay runs what the repo holds, whatever the checkout wrote.
   replay.test.mjs proves it with a file written CRLF on purpose. */
const readSql = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const ROLES = new Set(['pb_owner', 'authenticated', 'anon']);

export async function applySqlText(db, sql, label, role) {
  if (role !== null && !ROLES.has(role)) throw new Error('applySqlText: unknown role ' + role);
  try {
    await db.transaction(async tx => {
      if (role) await tx.exec('set local role ' + role);
      await tx.exec(sql);
    });
  } catch (e) {
    const err = new Error(label + ': ' + ((e && e.message) || e) + (e && e.code ? ' (' + e.code + ')' : ''));
    err.code = e && e.code;
    throw err;
  }
}
export function applySqlFile(db, file, role) {
  return applySqlText(db, readSql(file), basename(file), role);
}

export async function makeDb({ through = 'a0' } = {}) {
  if (!STAGES.includes(through)) throw new Error('makeDb: unknown stage ' + through);
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readSql(join(FIX, 'shim.sql')));
  if (through === 'shim') return db;
  for (const f of MIGRATIONS) await applySqlFile(db, join(MIG, f), 'pb_owner');
  if (through === 'replay') return db;
  // The drift file switches role itself (print-drift.mjs writes set role and reset role).
  await applySqlFile(db, join(FIX, 'live-drift.sql'), null);
  if (through === 'before-a0') return db;
  await applySqlFile(db, a0File(), 'pb_owner');
  return db;
}

const ROLLBACK = Symbol('rollback');
export async function asRole(db, role, claims, fn, { commit = false } = {}) {
  if (!ROLES.has(role)) throw new Error('asRole: unknown role ' + role);
  let out;
  try {
    await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await tx.exec('set local role ' + role);
      out = await fn(tx);
      if (!commit) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return out;
}
export const asUser = (db, uid, fn, o) => asRole(db, 'authenticated', { sub: uid, role: 'authenticated' }, fn, o);
export const asAnon = (db, fn, o) => asRole(db, 'anon', { role: 'anon' }, fn, o);
export const asOwner = (db, fn, o) => asRole(db, 'pb_owner', {}, fn, o);

/* The SQLSTATE a statement ended with, or null when it worked. An error with
   no code is not a SQL refusal and is thrown, never counted as one. */
export async function sqlCode(p) {
  try { await p; return null; }
  catch (e) { if (e && e.code) return e.code; throw e; }
}

export async function catalogSnapshot(db) {
  const r = await db.query(CATALOG_SQL);
  const v = r.rows[0].catalog;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

/* A team, its owner, and (optionally) its project - as the superuser, which
   is how the rows came to exist live too: through definer functions. */
export async function seedTeam(db, { uid, team, collection = null, personal = false, name = 'Group' }) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.teams (id, name, created_by, personal) values ($1, $2, $3, $4)', [team, name, uid, personal]);
  await db.query("insert into public.team_members (team_id, user_id, role) values ($1, $2, 'owner')", [team, uid]);
  if (collection)
    await db.query("insert into public.collections (id, team_id, owner, name) values ($1, $2, $3, 'My collection')", [collection, team, uid]);
}
export async function addMember(db, { uid, team }) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query("insert into public.team_members (team_id, user_id, role) values ($1, $2, 'member')", [team, uid]);
}
