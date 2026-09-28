/* ONE CATALOG QUERY, for the live project and for PGlite alike.

   The migrations folder does not rebuild the live database: no file adds
   collections.rules, .decisions or .decide_order, which index.html:18375
   selects and index.html:14770-14772 writes (eb2a466 names the missing
   migration, 20260907020408). So the harness is checked against the live
   catalog itself, captured once, schema only, and diffed.

   Keys, one row each:
     col|<table>|<column>        public columns: type, not null, default
     con|<table>|<name>          public constraints (not Postgres 18's NOT NULL rows)
     idx|<name>                  public indexes
     pol|<schema.table>|<name>   policies on public and storage
     trg|<table>|<name>          public triggers
     rls|<table>                 row level security on, forced
     priv|<table>|<role>|<priv>  table privileges of anon, authenticated, service_role
     fn|<schema.name(args)>      public functions, auth.uid, storage.foldername: body and EXECUTE for anon and authenticated
     schema|<schema>|<role>      USAGE
   Informational, never compared (the roles differ by design - PGlite's
   owner is pb_owner where live's is postgres):
     own|, role|, defacl|, meta|
   NOT CAPTURED, so never checked: the columns, constraints and triggers of
   auth.users, storage.buckets and storage.objects, and row level security
   on storage.objects. shim.sql's stand-ins for those are unchecked; plan
   2's storage fake (design A4, E4) captures and checks them.
   No rows of any table are read.

   HOW A HAND-COPIED CAPTURE IS CHECKED. The capture reaches disk by being
   copied out of a connector's answer, which can drop or change a row with
   nobody seeing. So every compared row carries h, an md5 of its key and
   fields computed in SQL, and CATALOG_CHECK_SQL returns the row count, an
   md5 of every key and an md5 of every compared key with its h. The
   capture file keeps that check beside the rows, and verifyCapture
   recomputes all of it in Node: a dropped row, a changed character in a
   function body or a flipped boolean each fail it. Run live again later,
   CATALOG_CHECK_SQL's rows_md5 says whether live still matches the capture
   without copying it again (Task 7). Order is byte order on both sides:
   COLLATE "C" in SQL, Buffer.compare in Node (design E4). */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_REF = 'dpracoavrcqyenfieksi';
export const INFO_PREFIXES = Object.freeze(['meta|', 'defacl|', 'own|', 'role|']);
/* The fields h covers, per kind, in this order, after the key. */
export const HASHED = Object.freeze({
  col: ['type', 'notnull', 'default'], con: ['def'], idx: ['def'],
  pol: ['permissive', 'cmd', 'roles', 'qual', 'check'], trg: ['def'], rls: ['on', 'forced'],
  priv: ['has'], fn: ['def', 'anon', 'authenticated'], schema: ['usage'],
});

/* h in SQL: md5 of the key and the fields, each as text ('' for a null),
   joined by newlines - exactly what rowHash does in Node. */
const H = (...cols) => `md5(concat_ws(E'\\n', ${cols.map(c => `coalesce((${c})::text, '')`).join(', ')}))`;

const ROWS_SQL = `
  select json_build_object('k', k, 'type', typ, 'notnull', nn, 'default', dflt, 'h', ${H('k', 'typ', 'nn', 'dflt')}) as r
    from (select 'col|' || c.relname || '|' || a.attname as k, format_type(a.atttypid, a.atttypmod) as typ,
                 a.attnotnull as nn, pg_get_expr(d.adbin, d.adrelid) as dflt
            from pg_catalog.pg_attribute a
            join pg_catalog.pg_class c on c.oid = a.attrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped) s
  union all
  select json_build_object('k', k, 'def', def, 'h', ${H('k', 'def')})
    from (select 'con|' || c.relname || '|' || ct.conname as k, pg_get_constraintdef(ct.oid) as def
            from pg_catalog.pg_constraint ct
            join pg_catalog.pg_class c on c.oid = ct.conrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and ct.contype <> 'n') s
  union all
  select json_build_object('k', k, 'def', def, 'h', ${H('k', 'def')})
    from (select 'idx|' || i.indexname as k, i.indexdef as def
            from pg_catalog.pg_indexes i where i.schemaname = 'public') s
  union all
  select json_build_object('k', k, 'permissive', permissive, 'cmd', cmd, 'roles', roles, 'qual', qual, 'check', chk,
           'h', ${H('k', 'permissive', 'cmd', 'roles', 'qual', 'chk')})
    from (select 'pol|' || p.schemaname || '.' || p.tablename || '|' || p.policyname as k, p.permissive, p.cmd,
                 p.roles::text as roles, p.qual, p.with_check as chk
            from pg_catalog.pg_policies p where p.schemaname in ('public', 'storage')) s
  union all
  select json_build_object('k', k, 'def', def, 'h', ${H('k', 'def')})
    from (select 'trg|' || c.relname || '|' || t.tgname as k, pg_get_triggerdef(t.oid) as def
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and not t.tgisinternal) s
  union all
  select json_build_object('k', k, 'on', rls_on, 'forced', forced, 'h', ${H('k', 'rls_on', 'forced')})
    from (select 'rls|' || c.relname as k, c.relrowsecurity as rls_on, c.relforcerowsecurity as forced
            from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r') s
  union all
  select json_build_object('k', k, 'has', has_it, 'h', ${H('k', 'has_it')})
    from (select 'priv|' || c.relname || '|' || ro.r || '|' || pv.p as k, has_table_privilege(ro.r, c.oid, pv.p) as has_it
            from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           cross join (values ('anon'), ('authenticated'), ('service_role')) ro(r)
           cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) pv(p)
           where n.nspname = 'public' and c.relkind = 'r') s
  union all
  select json_build_object('k', k, 'def', def, 'anon', anon_x, 'authenticated', auth_x, 'h', ${H('k', 'def', 'anon_x', 'auth_x')})
    from (select 'fn|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
                 pg_get_functiondef(p.oid) as def,
                 has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x
            from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where p.prokind = 'f'
             and (n.nspname = 'public' or (n.nspname, p.proname) in (('auth', 'uid'), ('storage', 'foldername')))) s
  union all
  -- CHANGED from the plan text (Task 2, controller ruling): schema| rows come from pg_namespace
  -- and USAGE is asked by oid. The planned VALUES list behind an exists guard failed in PGlite under
  -- catalogPartSql, whose filter on k runs before the guard: ERROR 3F000: schema "extensions" does
  -- not exist. Shown in PGlite to give byte-identical CATALOG_SQL output, every h included.
  select json_build_object('k', k, 'usage', use_ok, 'h', ${H('k', 'use_ok')})
    from (select 'schema|' || ns.nspname || '|' || ro.r as k, has_schema_privilege(ro.r, ns.oid, 'USAGE') as use_ok
            from pg_catalog.pg_namespace ns
           cross join (values ('anon'), ('authenticated'), ('service_role')) ro(r)
           where ns.nspname in ('public', 'auth', 'storage', 'extensions')) s
  union all
  select json_build_object('k', 'own|' || n.nspname || '.' || c.relname, 'owner', pg_get_userbyid(c.relowner))
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname in ('objects', 'buckets')))
  union all
  select json_build_object('k', 'role|' || r.rolname, 'super', r.rolsuper, 'bypassrls', r.rolbypassrls,
           'member_of', (select coalesce(json_agg(g.rolname order by g.rolname collate "C"), '[]'::json)
                           from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                          where m.member = r.oid))
    from pg_catalog.pg_roles r where r.rolname in ('postgres', 'anon', 'authenticated', 'service_role', 'pb_owner')
  union all
  -- CHANGED from the plan text (Task 2, controller ruling): d.defaclobjtype is cast ::text. As
  -- written, live and PGlite both refused the whole statement: ERROR 42725: operator is not unique:
  -- text || "char". The cast yields the same one character, so every key is unchanged.
  select json_build_object('k', 'defacl|' || pg_get_userbyid(d.defaclrole) || '|' || coalesce(n.nspname, '') || '|' || d.defaclobjtype::text,
           'acl', d.defaclacl::text)
    from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  union all
  select json_build_object('k', 'meta|server_version_num', 'v', current_setting('server_version_num'))
  union all
  select json_build_object('k', 'meta|collation', 'collate', d.datcollate, 'ctype', d.datctype)
    from pg_catalog.pg_database d where d.datname = current_database()
`;

export const CATALOG_SQL = `select json_agg(r order by (r->>'k') collate "C") as catalog from (${ROWS_SQL}) x`;

export const CATALOG_CHECK_SQL = `select count(*)::int as n,
  md5(string_agg(r->>'k', E'\\n' order by (r->>'k') collate "C")) as keys_md5,
  md5(string_agg((r->>'k') || E'\\t' || (r->>'h'), E'\\n' order by (r->>'k') collate "C")
      filter (where r->>'h' is not null)) as rows_md5
  from (${ROWS_SQL}) x`;

/* One kind of row, for a capture too long for one answer. */
export function catalogPartSql(prefix) {
  if (!/^[a-z]+\|$/.test(prefix)) throw new Error('a part is one key prefix, such as col|');
  return `select json_agg(r order by (r->>'k') collate "C") as catalog from (${ROWS_SQL}) x where r->>'k' like '${prefix}%'`;
}

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const byteOrder = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

export function rowHash(r) {
  const f = HASHED[String(r && r.k).split('|')[0]];
  if (!f) return null;
  return md5([r.k, ...f.map(x => (r[x] === null || r[x] === undefined) ? '' : String(r[x]))].join('\n'));
}

export function captureCheck(rows) {
  const keys = rows.map(r => r.k).sort(byteOrder);
  const hashed = rows.filter(r => rowHash(r) !== null).sort((a, b) => byteOrder(a.k, b.k));
  return { n: rows.length, keys_md5: md5(keys.join('\n')), rows_md5: md5(hashed.map(r => r.k + '\t' + r.h).join('\n')) };
}

/* Everything that says the rows in a capture are not what live returned. */
export function verifyCapture(doc) {
  if (!doc || !Array.isArray(doc.rows) || !doc.check) return ['no rows, or no check beside them'];
  const out = [];
  for (const r of doc.rows) {
    const want = rowHash(r);
    if (want !== null && r.h !== want) out.push('row ' + r.k + ' does not match its own hash: copied wrong');
  }
  const got = captureCheck(doc.rows);
  for (const k of ['n', 'keys_md5', 'rows_md5'])
    if (doc.check[k] !== got[k]) out.push(k + ': live said ' + JSON.stringify(doc.check[k]) + ', the rows give ' + JSON.stringify(got[k]));
  return out;
}

/* Exactly one capture file, or a clear refusal: two would mean the tests
   compare against whichever sorted first. */
export function loadLiveCatalog() {
  const dir = join(ROOT, 'supabase', 'fixtures');
  const files = readdirSync(dir).filter(f => /^live-catalog-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (files.length !== 1) throw new Error('need exactly one supabase/fixtures/live-catalog-<date>.json, found ' + files.length);
  const doc = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  if (!doc || doc.project !== PROJECT_REF || !Array.isArray(doc.rows) || !doc.captured || !doc.check)
    throw new Error(files[0] + ' is not a PixelBench catalog capture');
  return { file: files[0], captured: doc.captured, project: doc.project, check: doc.check, rows: doc.rows };
}

export function byKey(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r || typeof r.k !== 'string') throw new Error('a catalog row without a key: ' + JSON.stringify(r));
    if (m.has(r.k)) throw new Error('two catalog rows share the key ' + r.k);
    m.set(r.k, r);
  }
  return m;
}

const canon = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}));

/* Every compared key present on one side only, or different on the two. */
export function diffCatalog(liveRows, localRows) {
  const a = byKey(liveRows), b = byKey(localRows), out = [];
  const keys = [...new Set([...a.keys(), ...b.keys()])]
    .filter(k => !INFO_PREFIXES.some(p => k.startsWith(p))).sort(byteOrder);
  for (const k of keys) {
    const L = a.get(k) || null, R = b.get(k) || null;
    if (!L || !R || canon(L) !== canon(R)) out.push({ k, live: L, local: R });
  }
  return out;
}
