/* A small stand-in for PostgREST, Supabase Auth and Supabase Storage over a
   PGlite database, so page specs reach real SQL (design E4: "Page specs route
   the functions to the real SQL in PGlite").

   It answers only what plan 1's specs send. Anything else goes into
   `unrouted` and is answered 501; a SQL error whose code has no entry in the
   status table goes into `unmapped` and is answered 500. Each spec asserts
   both lists are empty, so a request this does not understand is a failure,
   never a silent []. Storage is a Map: no buckets, policies or eTags (plan
   2's storage fake, design A4, replaces it). No Content-Range or counts.
   `order=` sorts as PostgREST does, by each column's own collation, with
   no COLLATE added: it stands in for the live API. A SQL test whose result
   depends on text order says COLLATE "C" itself (design E4).

   CHANGED from the plan text (Task 6): "everything else" now includes what
   the plan's code dropped without a word - a Prefer other than return=, a
   Range header, an Accept other than JSON, nullsfirst/nullslast, a quoted
   in.() item, any query string on a POST or an rpc, and select/order/limit/
   offset on a PATCH or DELETE (a DELETE's limit was dropped, so every
   matching row went). The page's Clear cloud sends count=exact with a Range;
   here it is unrouted, where the plan's code answered rows and no count.
   The errors this makes itself - an unknown table (42P01), column
   (PGRST204) or function (PGRST202) - take their status from the table like
   any SQL error; PGRST202 has no entry, so an rpc the replay lacks is
   unmapped, not a guessed 404. Anything handle() throws is answered 500 and
   recorded as unmapped. */
import { POSTGREST_STATUS } from './postgrest-status.mjs';
import { asUser, asAnon } from './harness.mjs';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = s => '"' + s + '"';
const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset']);
const PREFER_OK = new Set(['return=representation', 'return=minimal']);
const ACCEPT_OK = new Set(['*/*', 'application/json']);

export function makePostgrest(db, { users = {}, statuses = POSTGREST_STATUS } = {}) {
  const unrouted = [], unmapped = [], storage = new Map(), cols = new Map();

  async function columns(table) {
    if (!cols.has(table)) {
      const r = await db.query("select column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1", [table]);
      cols.set(table, new Map(r.rows.map(x => [x.column_name, x.udt_name])));
    }
    return cols.get(table);
  }
  const uidOf = (h) => {
    const a = String(h['authorization'] || '');
    const tok = a.startsWith('Bearer ') ? a.slice(7) : null;
    return tok && Object.prototype.hasOwnProperty.call(users, tok) ? users[tok] : null;
  };
  const json = (status, value, extra) => ({ status, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}),
    body: value === undefined ? '' : JSON.stringify(value) });
  const empty = (status) => ({ status, headers: {}, body: '' });
  const fail = (e, role) => {
    const code = e && e.code, entry = code && statuses[code];
    if (!entry) { unmapped.push(code || String((e && e.message) || e)); return json(500, { code: code || null, message: String((e && e.message) || e) }); }
    const status = typeof entry.status === 'number' ? entry.status : entry.status[role];
    return json(status, { code, message: String(e.message || ''), details: null, hint: null });
  };
  const run = (uid, fn) => uid ? asUser(db, uid, fn, { commit: true }) : asAnon(db, fn, { commit: true });
  /* CHANGED from the plan text: every query below selects its json as text,
     parsed once here. PGlite parses a json column itself, so the plan's
     "parse it if it is a string" parsed a scalar twice: my_team's uuid came
     back as a bare string and JSON.parse threw on it. */
  const value = (r) => JSON.parse(r.rows[0].j);
  const unknownKey = (table, k, role) => fail({ code: 'PGRST204',
    message: "Could not find the '" + k + "' column of '" + table + "' in the schema cache" }, role);

  function where(params, known, args, alias) {
    const parts = [];
    for (const [k, v] of params) {
      if (NOT_FILTERS.has(k)) continue;
      if (!IDENT.test(k)) throw Object.assign(new Error('filter column ' + k), { code: 'UNROUTED' });
      const col = (alias ? alias + '.' : '') + q(k), cast = known.has(k) ? '::' + known.get(k) : '';
      const m = /^(eq|neq|is|in)\.([\s\S]*)$/.exec(v);
      if (!m) throw Object.assign(new Error('filter ' + k + '=' + v), { code: 'UNROUTED' });
      if (m[1] === 'is') { if (m[2] !== 'null') throw Object.assign(new Error('filter ' + v), { code: 'UNROUTED' }); parts.push(col + ' is null'); continue; }
      if (m[1] === 'in') {
        const items = m[2].replace(/^\(|\)$/g, '').split(',').filter(x => x !== '');
        if (items.some(x => x.includes('"'))) throw Object.assign(new Error('filter ' + k + '=' + v), { code: 'UNROUTED' });
        parts.push(col + ' in (' + items.map(x => { args.push(x); return '$' + args.length + cast; }).join(', ') + ')');
        continue;
      }
      args.push(m[2]);
      parts.push(col + (m[1] === 'eq' ? ' = ' : ' <> ') + '$' + args.length + cast);
    }
    return parts.length ? ' where ' + parts.join(' and ') : '';
  }
  function orderBy(params) {
    const o = params.get('order');
    if (!o) return '';
    return ' order by ' + o.split(',').map(p => {
      const [c, dir, nulls] = p.split('.');
      if (nulls !== undefined || !IDENT.test(c) || (dir && dir !== 'asc' && dir !== 'desc')) throw Object.assign(new Error('order ' + o), { code: 'UNROUTED' });
      return q(c) + (dir ? ' ' + dir : '');
    }).join(', ');
  }
  function page(params) {
    let s = '';
    const l = params.get('limit'), f = params.get('offset');
    if (l !== null) { if (!/^\d+$/.test(l)) throw Object.assign(new Error('limit'), { code: 'UNROUTED' }); s += ' limit ' + l; }
    if (f !== null) { if (!/^\d+$/.test(f)) throw Object.assign(new Error('offset'), { code: 'UNROUTED' }); s += ' offset ' + f; }
    return s;
  }
  const parse = (b) => { const t = b == null ? '' : Buffer.isBuffer(b) ? b.toString('utf8') : String(b); return t ? JSON.parse(t) : null; };

  async function rest(method, table, params, h, bodyBuf, uid) {
    const role = uid ? 'authenticated' : 'anon';
    const known = await columns(table);
    if (!known.size) return fail({ code: '42P01', message: 'relation "public.' + table + '" does not exist' }, role);
    const rep = /return=representation/.test(h['prefer'] || '');
    const given = [...params.keys()];
    if (method === 'POST' && given.length) return unroute(method, table + '?' + params);
    if ((method === 'PATCH' || method === 'DELETE') && given.some(k => NOT_FILTERS.has(k))) return unroute(method, table + '?' + params);
    try {
      if (method === 'GET') {
        const sel = (params.get('select') || '*').split(',').map(s => s.trim()).filter(Boolean);
        for (const c of sel) if (c !== '*' && !IDENT.test(c)) return unroute(method, 'select ' + c);
        const args = [];
        const inner = 'select ' + sel.map(c => c === '*' ? '*' : q(c)).join(', ') + ' from public.' + q(table)
          + where(params, known, args) + orderBy(params) + page(params);
        return json(200, value(await run(uid, tx => tx.query("select coalesce(json_agg(t), '[]'::json)::text as j from (" + inner + ') t', args))));
      }
      if (method === 'POST') {
        const b = parse(bodyBuf), rows = Array.isArray(b) ? b : [b];
        const keys = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
        for (const k of keys) if (!known.has(k)) return unknownKey(table, k, role);
        const list = keys.map(q).join(', ');
        const sql = 'with r as (insert into public.' + q(table) + ' (' + list + ') select ' + list
          + ' from json_populate_recordset(null::public.' + q(table) + ", $1::json) returning *) select coalesce(json_agg(r), '[]'::json)::text as j from r";
        const out = value(await run(uid, tx => tx.query(sql, [JSON.stringify(rows)])));
        return rep ? json(201, out) : empty(201);
      }
      if (method === 'PATCH') {
        const b = parse(bodyBuf) || {};
        const keys = Object.keys(b);
        for (const k of keys) if (!known.has(k)) return unknownKey(table, k, role);
        const args = [JSON.stringify(b)];
        const sql = 'with r as (update public.' + q(table) + ' t set ' + keys.map(k => q(k) + ' = j.' + q(k)).join(', ')
          + ' from json_populate_record(null::public.' + q(table) + ', $1::json) j' + where(params, known, args, 't')
          + " returning t.*) select coalesce(json_agg(r), '[]'::json)::text as j from r";
        const out = value(await run(uid, tx => tx.query(sql, args)));
        return rep ? json(200, out) : empty(204);
      }
      if (method === 'DELETE') {
        const args = [];
        const sql = 'with r as (delete from public.' + q(table) + where(params, known, args)
          + " returning *) select coalesce(json_agg(r), '[]'::json)::text as j from r";
        const out = value(await run(uid, tx => tx.query(sql, args)));
        return rep ? json(200, out) : empty(204);
      }
      return unroute(method, table);
    } catch (e) {
      if (e && e.code === 'UNROUTED') return unroute(method, e.message);
      return fail(e, role);
    }
  }
  async function rpc(fn, params, bodyBuf, uid) {
    if (!IDENT.test(fn) || [...params.keys()].length) return unroute('POST', 'rpc ' + fn + (params.size ? '?' + params : ''));
    const meta = await db.query("select p.proretset as set from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [fn]);
    if (!meta.rows.length) return fail({ code: 'PGRST202', message: 'Could not find the function public.' + fn }, uid ? 'authenticated' : 'anon');
    const b = parse(bodyBuf) || {};
    const keys = Object.keys(b);
    for (const k of keys) if (!IDENT.test(k)) return unroute('POST', 'rpc arg ' + k);
    const args = keys.map(k => (b[k] !== null && typeof b[k] === 'object') ? JSON.stringify(b[k]) : b[k]);
    const call = 'public.' + q(fn) + '(' + keys.map((k, i) => q(k) + ' => $' + (i + 1)).join(', ') + ')';
    const sql = meta.rows[0].set ? "select coalesce(json_agg(x), '[]'::json)::text as j from " + call + ' x' : 'select to_json(' + call + ')::text as j';
    try { return json(200, value(await run(uid, tx => tx.query(sql, args)))); }
    catch (e) { return fail(e, uid ? 'authenticated' : 'anon'); }
  }
  function unroute(method, what) { unrouted.push(method + ' ' + what); return json(501, { code: 'UNROUTED', message: String(what) }); }

  /* A Prefer, Range or Accept that changes what PostgREST sends back - a
     count, an upsert, one object instead of an array - is not ignored. */
  function outOfScope(h) {
    for (const t of String(h['prefer'] || '').split(',').map(s => s.trim()).filter(Boolean)) if (!PREFER_OK.has(t)) return 'prefer ' + t;
    if (h['range'] != null) return 'range ' + h['range'];
    for (const t of String(h['accept'] || '').split(',').map(s => s.split(';')[0].trim()).filter(Boolean)) if (!ACCEPT_OK.has(t)) return 'accept ' + t;
    return null;
  }

  /* Nothing thrown in here escapes: a rejected promise would leave the
     page's request hanging in page.route, recorded nowhere. */
  async function handle({ method, url, headers, body }) {
    const h = {};
    for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v;
    const uid = uidOf(h);
    try { return await route(method, url, h, body, uid); }
    catch (e) { return fail(e, uid ? 'authenticated' : 'anon'); }
  }
  async function route(method, url, h, body, uid) {
    const u = new URL(url), path = u.pathname;
    let m;
    if (method === 'GET' && path === '/auth/v1/user') return uid ? json(200, { id: uid }) : json(401, { code: 401, msg: 'invalid JWT' });
    if (path.startsWith('/rest/v1/')) { const bad = outOfScope(h); if (bad) return unroute(method, path + ' ' + bad); }
    if ((m = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(path)) && method === 'POST') return rpc(m[1], u.searchParams, body, uid);
    if ((m = /^\/rest\/v1\/([^/]+)$/.exec(path)) && IDENT.test(m[1])) return rest(method, m[1], u.searchParams, h, body, uid);
    if ((m = /^\/storage\/v1\/object\/traits\/(.+)$/.exec(path)) && method === 'POST') {
      if (!uid) return json(403, { statusCode: '403', error: 'Unauthorized' });
      storage.set(decodeURIComponent(m[1]), Buffer.isBuffer(body) ? body : Buffer.from(body || ''));
      return json(200, { Key: 'traits/' + decodeURIComponent(m[1]) });
    }
    if (path === '/storage/v1/object/traits' && method === 'DELETE') {
      const b = parse(body) || {};
      for (const p of b.prefixes || []) storage.delete(p);
      return json(200, []);
    }
    return unroute(method, path);
  }
  return { handle, unrouted, unmapped, storage };
}
