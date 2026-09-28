/* CHANGE A0'S STATEMENTS, SPLIT ONE WAY (auto cloud save design, A8).

   The A0 file is two DO statements, sent one at a time. This is the only
   place that splits it, so the test that checks the file's shape
   (test/sql/a0.test.mjs) and anything that sends the statements one by one
   read the same two statements.

   AND THE SQL READ-BACKS FOR CHANGE A0 (design A8: "read back (through SQL
   and through a REST select)"), composed here, so the statement proven in
   PGlite (test/sql/a0-readback.test.mjs) is the statement Task 7 runs live.

     node tools/a0-readback.mjs pre               the read before applying
     node tools/a0-readback.mjs post <pre.json>   the read after, against the pre row saved as JSON
     node tools/a0-readback.mjs parts             A0's two statements, as they are sent

   Each prints ONE statement. The Supabase connector's execute_sql returns
   only the last non-empty result set, so every figure is a column of one row
   and every check is a boolean printed beside the parts it is made of.
   Nothing here writes. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TABLES = "('public.collections'::regclass, 'public.traits'::regclass)";
const A0_PAIRS = "(('collections', 'protocol'), ('collections', 'switching_at'), ('traits', 'replaces'))";

/* The catalog of the two tables outside A0's own objects - columns (with
   any grant of a column's own), constraints (by the columns they cover, so
   Postgres 18's named NOT NULL rows are left out too), indexes, policies
   (with their permissive flag, which pg_policies keeps apart from the
   rest), triggers (with whether they are enabled, which pg_get_triggerdef
   does not print), RLS flags and table ACLs - as one md5, so the post-read
   can say nothing else moved. Indexes are not filtered: A0 adds none, so an
   index on one of its columns moves this too. A new owner moves it through
   the ACL, whose grantors change with the owner.
   NOT COVERED: anything outside these two tables (a posts table apart,
   which fingerprint_ok names), publication membership, reloptions, replica
   identity, and a column's storage, collation and options. */
export const FINGERPRINT_SQL = `(select md5(string_agg(x, E'\\n' order by x collate "C")) from (
  select 'col|' || c.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
         || '|' || a.attnotnull || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
         || '|' || coalesce(a.attacl::text, '') as x
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in ${TABLES} and a.attnum > 0 and not a.attisdropped
     and (c.relname, a.attname::text) not in ${A0_PAIRS}
  union all
  select 'con|' || c.relname || '|' || k.conname || '|' || pg_get_constraintdef(k.oid)
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid = k.conrelid
   where k.conrelid in ${TABLES} and k.contype <> 'n'
     and not exists (select 1 from pg_catalog.pg_attribute a2
                      where a2.attrelid = k.conrelid and a2.attnum = any(k.conkey)
                        and (c.relname, a2.attname::text) in ${A0_PAIRS})
  union all
  select 'idx|' || pg_get_indexdef(i.indexrelid) from pg_catalog.pg_index i where i.indrelid in ${TABLES}
  union all
  select 'pol|' || p.tablename || '|' || p.policyname || '|' || p.permissive || '|' || p.cmd || '|' || p.roles::text || '|'
         || coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')
    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('collections', 'traits')
  union all
  select 'trg|' || pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text from pg_catalog.pg_trigger t
   where t.tgrelid in ${TABLES} and not t.tgisinternal
  union all
  select 'rel|' || c.relname || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity || '|' || coalesce(c.relacl::text, '')
    from pg_catalog.pg_class c where c.oid in ${TABLES}
) f)`;

export function preSql() {
  return `select
  (select count(*) = 0 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
     where a.attrelid in ${TABLES} and not a.attisdropped and (c.relname, a.attname::text) in ${A0_PAIRS})
  and (select count(*) = 0 from pg_catalog.pg_constraint
         where conname in ('collections_protocol_check', 'collections_switching_at_check')) as a0_absent,
  (to_regclass('public.team_members') is not null and to_regclass('public.posts') is null
   and exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.collections'::regclass
                 and attname = 'rules_at' and not attisdropped)) as fingerprint_ok,
  (select count(*)::int from public.collections) as n_collections,
  (select count(*)::int from public.traits) as n_traits,
  (select max(updated_at)::text from public.collections) as max_c,
  (select max(updated_at)::text from public.traits) as max_t,
  current_setting('server_version_num') as server_version_num,
  ${FINGERPRINT_SQL} as cat_md5`;
}

const lit = v => (v === null || v === undefined) ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const count = x => { const v = Number(x); if (!Number.isInteger(v) || v < 0) throw new Error('not a count: ' + x); return v; };

/* protocol_ok, switching_ok, replaces_ok: each column exactly as A0 writes
   it, and neither generated nor an identity - a generated protocol has a
   default that prints 1 and refuses every write to protocol, which Change A
   must make. (An identity protocol has no default, so hasdef already refuses
   it; the other two types cannot be identities.)
   a0_columns_ungranted: A0 grants nothing, so none of its three columns
   carries an ACL of its own (a table's grants live in relacl, which the
   fingerprint covers; a column's own grant lives in attacl). */
export function postSql(pre) {
  if (!pre || !/^[0-9a-f]{32}$/.test(String(pre.cat_md5))) throw new Error('the pre row has no cat_md5');
  return `with
col as (
  select c.relname, a.attname::text as attname, format_type(a.atttypid, a.atttypmod) as typ,
         a.attnotnull as nn, a.atthasdef as hasdef, pg_get_expr(d.adbin, d.adrelid) as def,
         a.attacl::text as acl, a.attgenerated::text as gen, a.attidentity::text as ident
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in ${TABLES} and a.attnum > 0 and not a.attisdropped
),
con as (
  select c.relname, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) as def,
         array(select a.attname::text from pg_catalog.pg_attribute a
                where a.attrelid = k.conrelid and a.attnum = any(k.conkey) order by 1) as cols
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid = k.conrelid
   where k.conrelid in ${TABLES} and k.contype <> 'n'
),
chk as (
  select
    (to_regclass('public.team_members') is not null and to_regclass('public.posts') is null) as fingerprint_ok,
    (select count(*) = 1 from col where relname = 'collections' and attname = 'protocol'
       and typ = 'smallint' and nn and hasdef and def = '1' and gen = '' and ident = '') as protocol_ok,
    (select count(*) = 1 from col where relname = 'collections' and attname = 'switching_at'
       and typ = 'timestamp with time zone' and not nn and not hasdef and gen = '' and ident = '') as switching_ok,
    (select count(*) = 1 from col where relname = 'traits' and attname = 'replaces'
       and typ = 'uuid' and not nn and not hasdef and gen = '' and ident = '') as replaces_ok,
    ((select count(*) = 1 from con where relname = 'collections' and 'protocol' = any(cols))
      and (select count(*) = 1 from con where relname = 'collections' and cols = array['protocol']
             and conname = 'collections_protocol_check' and contype = 'c' and convalidated
             and def = 'CHECK ((protocol = 1))')) as protocol_check_ok,
    ((select count(*) = 1 from con where relname = 'collections' and 'switching_at' = any(cols))
      and (select count(*) = 1 from con where relname = 'collections' and cols = array['switching_at']
             and conname = 'collections_switching_at_check' and contype = 'c' and convalidated
             and def = 'CHECK ((switching_at IS NULL))')) as switching_check_ok,
    (select count(*) = 0 from con where relname = 'traits' and 'replaces' = any(cols)) as replaces_free,
    (select count(*) = 3 from col where (relname, attname) in ${A0_PAIRS} and acl is null) as a0_columns_ungranted,
    ((select count(*) from public.collections) > 0
      and (select count(*) from public.collections where protocol is distinct from 1 or switching_at is not null) = 0) as collections_rows_ok,
    ((select count(*) from public.traits) > 0
      and (select count(*) from public.traits where replaces is not null) = 0) as traits_rows_ok,
    (select bool_and(relrowsecurity) from pg_catalog.pg_class where oid in ${TABLES}) as rls_ok,
    (has_column_privilege('authenticated', 'public.collections', 'protocol', 'SELECT')
      and has_column_privilege('authenticated', 'public.collections', 'switching_at', 'SELECT')
      and has_column_privilege('authenticated', 'public.traits', 'replaces', 'SELECT')
      and has_column_privilege('authenticated', 'public.traits', 'replaces', 'INSERT')) as privileges_ok,
    (${FINGERPRINT_SQL} = ${lit(pre.cat_md5)}) as catalog_unchanged,
    (select count(*)::int from public.collections) as n_collections,
    (select count(*)::int from public.traits) as n_traits,
    (select max(updated_at)::text from public.collections) as max_c,
    (select max(updated_at)::text from public.traits) as max_t
)
select coalesce(fingerprint_ok and protocol_ok and switching_ok and replaces_ok and protocol_check_ok
         and switching_check_ok and replaces_free and a0_columns_ungranted and collections_rows_ok
         and traits_rows_ok and rls_ok and privileges_ok and catalog_unchanged, false) as a0_ok,
       coalesce(n_collections = ${count(pre.n_collections)} and n_traits = ${count(pre.n_traits)}
         and max_c is not distinct from ${lit(pre.max_c)} and max_t is not distinct from ${lit(pre.max_t)}, false) as quiet,
       chk.*
  from chk`;
}

/* The two statements of the A0 file, exactly as they appear in it. */
export function a0Statements(text) {
  const blocks = String(text).match(/do \$a0_[a-z]+\$[\s\S]*?\$a0_[a-z]+\$;/g) || [];
  if (blocks.length !== 2) throw new Error('the A0 file should hold exactly two statements, found ' + blocks.length);
  return blocks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'pre') process.stdout.write(preSql() + '\n');
  else if (cmd === 'post') process.stdout.write(postSql(JSON.parse(readFileSync(arg, 'utf8'))) + '\n');
  else if (cmd === 'parts') {
    /* CRLF made LF, as the harness reads it: what is sent is the bytes git
       holds, whose sha256 the owner approves, whatever the checkout wrote. */
    const { a0File } = await import('../test/sql/harness.mjs');
    const [s1, s2] = a0Statements(readFileSync(a0File(), 'utf8').replace(/\r\n/g, '\n'));
    process.stdout.write('-- statement 1 of 2\n' + s1 + '\n\n-- statement 2 of 2\n' + s2 + '\n');
  } else { console.error('usage: node tools/a0-readback.mjs pre | post <pre.json> | parts'); process.exitCode = 2; }
}
