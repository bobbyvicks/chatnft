/* The REST read-backs for Change A0 (design A8), against the live project,
   signed out, with the publishable key only - the key index.html serves to
   every visitor (its const SB_KEY), sent the way the page's signed-out
   invite_info request sends it: apikey alone. No service key, no token.

     node tools/a0-rest-probe.mjs before    expected before A0 is applied
     node tools/a0-rest-probe.mjs after     expected once it is

   The URL and key are read from index.html's own declarations each time
   this runs (pageSupabase), so there is no copy here to fall behind a
   rotated key, and the page must name the project the live catalog capture
   is of (catalog.mjs PROJECT_REF) - the capture is what allows the POSTs.

   Four requests. Two are controls that must answer the same way in both
   states, so a probe that cannot tell the states apart is caught:
     select-a0       GET  collections?select=id,protocol,switching_at&limit=1
     select-control  GET  collections?select=id,protocol_x&limit=1     (never a column)
     insert-a0       POST traits [{"replaces":"not-a-uuid"}]          (can never make a row: not a uuid, and no required column)
     insert-control  POST traits [{"replaces_x":null}]                (never a column)
   PostgREST checks a POST body's keys against its schema cache before any
   SQL runs (PGRST204); a select's columns go to Postgres (42703). So after
   A0 the select parses (200 [] signed out, or a privilege refusal - never
   42703) and insert-a0 fails for a reason other than PGRST204, which is what
   says the schema cache has the column. PGRST204 there after A0 means the
   cache is stale: Task 7 Step 13.

   Its statuses and codes are measurements: Task 7 copies them into
   test/sql/postgrest-status.mjs.

   THE POSTS WRITE NOTHING, BY CONSTRUCTION: insert-control names a column
   PostgREST refuses before any SQL runs, and insert-a0 sends a value no
   uuid column can hold, and none of the columns a row must have. And they are not
   sent at all if the live capture shows that anon may insert into traits
   through a permissive policy (anonMayInsert), or cannot say whether it
   may: then a refusal would rest on the body alone. Nothing is sent for a
   stage other than before or after. The owner's approval names them (Task 7
   Step 5). */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT_REF, loadLiveCatalog } from '../test/sql/catalog.mjs';

/* true when the capture shows anon holding INSERT on traits AND a
   permissive INSERT or ALL policy on traits naming anon or public. A
   capture with no row for the privilege cannot say, so it throws. */
export function anonMayInsert(rows) {
  const priv = rows.find(r => r.k === 'priv|traits|anon|INSERT');
  if (!priv || typeof priv.has !== 'boolean')
    throw new Error('the capture has no priv|traits|anon|INSERT row, so it cannot say whether anon may insert into traits');
  const open = rows.some(r => r.k.startsWith('pol|public.traits|') && r.permissive === 'PERMISSIVE'
    && (r.cmd === 'INSERT' || r.cmd === 'ALL') && /(^|[{,])(anon|public)([,}]|$)/.test(String(r.roles)));
  return priv.has && open;
}

/* The page's URL and key, from its one declaration of each. Refuses a page
   that declares either twice or not at all, names another project, or
   holds a key that is not a publishable one. */
export function pageSupabase(html) {
  const one = (name) => {
    const all = String(html).match(new RegExp('\\b(?:const|let|var)\\s+' + name + '\\b', 'g')) || [];
    const shaped = [...String(html).matchAll(new RegExp('^const ' + name + '="([^"\\r\\n]*)";', 'gm'))];
    if (all.length !== 1 || shaped.length !== 1)
      throw new Error('index.html should declare ' + name + ' once, as const ' + name + '="...";, found ' + all.length + ' declarations');
    return shaped[0][1];
  };
  const url = one('SB_URL'), key = one('SB_KEY');
  if (url !== 'https://' + PROJECT_REF + '.supabase.co')
    throw new Error('index.html\'s SB_URL is not the project the catalog capture is of (' + PROJECT_REF + ')');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('index.html\'s SB_KEY is not a publishable key');
  return { SB_URL: url, SB_KEY: key };
}

export const { SB_URL, SB_KEY } = pageSupabase(readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8'));
export const PROBES = Object.freeze([
  { name: 'select-a0', method: 'GET', path: '/rest/v1/collections?select=id,protocol,switching_at&limit=1' },
  { name: 'select-control', method: 'GET', path: '/rest/v1/collections?select=id,protocol_x&limit=1' },
  { name: 'insert-a0', method: 'POST', path: '/rest/v1/traits', body: [{ replaces: 'not-a-uuid' }] },
  { name: 'insert-control', method: 'POST', path: '/rest/v1/traits', body: [{ replaces_x: null }] },
]);

export async function probe(fetchImpl = fetch) {
  const out = [];
  for (const p of PROBES) {
    const headers = { apikey: SB_KEY };
    if (p.body) headers['Content-Type'] = 'application/json';
    const r = await fetchImpl(SB_URL + p.path, { method: p.method, headers, body: p.body ? JSON.stringify(p.body) : undefined });
    let body = null; try { body = await r.json(); } catch (_) { body = null; }
    out.push({ name: p.name, status: r.status,
      code: body && !Array.isArray(body) ? (body.code || null) : null,
      rows: Array.isArray(body) ? body.length : null });
  }
  return out;
}

export function verdict(results, stage) {
  if (stage !== 'before' && stage !== 'after') throw new Error('stage must be before or after');
  const by = Object.fromEntries(results.map(r => [r.name, r]));
  const lines = [];
  const check = (ok, name, what) => lines.push((ok ? 'ok   ' : 'FAIL ') + name + ': ' + what + ' - got ' + JSON.stringify(by[name] || null));
  const is = (name, status, code) => !!by[name] && by[name].status === status && by[name].code === code;
  check(is('select-control', 400, '42703'), 'select-control', '400 42703 in both states');
  check(is('insert-control', 400, 'PGRST204'), 'insert-control', '400 PGRST204 in both states');
  if (stage === 'before') {
    check(is('select-a0', 400, '42703'), 'select-a0', '400 42703: the columns are not there');
    check(is('insert-a0', 400, 'PGRST204'), 'insert-a0', '400 PGRST204: replaces is not in the schema cache');
  } else {
    const s = by['select-a0'];
    check(!!s && ((s.status === 200 && s.rows === 0) || s.code === '42501'), 'select-a0', '200 [] or a privilege refusal, never 42703');
    const i = by['insert-a0'];
    check(!!i && i.status >= 400 && !!i.code && i.code !== 'PGRST204', 'insert-a0', 'refused, but not with PGRST204');
  }
  return { ok: !lines.some(l => l.startsWith('FAIL')), lines };
}

/* The CLI, as a function the test can hand a stand-in fetch and capture.
   Returns the exit code: 0 the stage reads as expected, 1 it does not, 2
   nothing was sent. The stage is checked before anything else, so a typo
   sends nothing. */
export async function main(argv, { fetchImpl = fetch, captureRows = () => loadLiveCatalog().rows,
  log = console.log, warn = console.error } = {}) {
  const stage = argv[0];
  if (stage !== 'before' && stage !== 'after') { warn('usage: node tools/a0-rest-probe.mjs before|after'); return 2; }
  let may;
  try { may = anonMayInsert(captureRows()); }
  catch (e) { warn('refused: ' + ((e && e.message) || e) + '. Nothing was sent.'); return 2; }
  if (may) {
    warn('refused: the capture shows anon may insert into traits, so the POST probes are not sent. Tell the owner.');
    return 2;
  }
  const results = await probe(fetchImpl);
  log(JSON.stringify(results));
  const v = verdict(results, stage);
  for (const l of v.lines) log(l);
  return v.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
