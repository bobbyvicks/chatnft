/* Prints the SQL that makes a replay of supabase/migrations match the live
   capture in supabase/fixtures/live-catalog-*.json:

     node test/sql/print-drift.mjs > supabase/fixtures/live-drift.sql

   READ THE OUTPUT BEFORE COMMITTING IT. It lists what the live database has
   that no migration file says, and each line is a fact about the live
   project. A difference it cannot write as SQL is printed as an
   "-- UNHANDLED" line, and test/sql/replay.test.mjs fails while any is left:
   handle each by hand - in shim.sql if it is a Supabase object, in the drift
   file if it is the project's - or, only when PGlite cannot reproduce it, add
   it to ALLOWED in replay.test.mjs with its reason. */
import { makeDb, catalogSnapshot } from './harness.mjs';
import { loadLiveCatalog, diffCatalog } from './catalog.mjs';

const live = loadLiveCatalog();
const db = await makeDb({ through: 'replay' });
const local = await catalogSnapshot(db);
await db.close();

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const localTables = new Set(local.filter(r => r.k.startsWith('col|')).map(r => r.k.split('|')[1]));
const pub = [], sys = [], unhandled = [];
for (const d of diffCatalog(live.rows, local)) {
  const parts = d.k.split('|'), kind = parts[0], L = d.live, R = d.local;
  if (kind === 'col' && L && !R && localTables.has(parts[1])) {
    pub.push('alter table public.' + q(parts[1]) + ' add column if not exists ' + q(parts[2]) + ' ' + L.type
      + (L.default != null ? ' default ' + L.default : '') + (L.notnull ? ' not null' : '') + ';');
  } else if (kind === 'con' && L && localTables.has(parts[1])) {
    pub.push((R ? 'alter table public.' + q(parts[1]) + ' drop constraint ' + q(parts[2]) + ';\n' : '')
      + 'alter table public.' + q(parts[1]) + ' add constraint ' + q(parts[2]) + ' ' + L.def + ';');
  } else if (kind === 'idx' && L) {
    pub.push((R ? 'drop index public.' + q(parts[1]) + ';\n' : '') + L.def + ';');
  } else if (kind === 'fn' && L) {
    const sig = d.k.slice(3);
    const block = [L.def.trim().replace(/;?\s*$/, '') + ';'];
    if (sig.startsWith('public.')) {
      block.push('revoke all on function ' + sig + ' from public, anon, authenticated;');
      if (L.anon) block.push('grant execute on function ' + sig + ' to anon;');
      if (L.authenticated) block.push('grant execute on function ' + sig + ' to authenticated;');
      pub.push(block.join('\n'));
    } else sys.push(block.join('\n'));
  } else if (kind === 'pol' && L) {
    const roles = String(L.roles).replace(/^\{|\}$/g, '').split(',').filter(Boolean).join(', ');
    pub.push('drop policy if exists ' + q(parts[2]) + ' on ' + parts[1] + ';\n'
      + 'create policy ' + q(parts[2]) + ' on ' + parts[1] + ' as ' + L.permissive + ' for ' + L.cmd + ' to ' + roles
      + (L.qual != null ? ' using (' + L.qual + ')' : '') + (L.check != null ? ' with check (' + L.check + ')' : '') + ';');
  } else {
    unhandled.push('-- UNHANDLED ' + d.k + '  live=' + JSON.stringify(L) + '  replay=' + JSON.stringify(R));
  }
}
console.log([
  '-- What the live PixelBench database has that replaying supabase/migrations does not.',
  '-- Printed by test/sql/print-drift.mjs from supabase/fixtures/' + live.file + ',',
  '-- captured ' + live.captured + ', before Change A0. Schema only. test/sql/harness.mjs',
  '-- applies it after the migrations and before A0.',
  '',
  ...unhandled,
  'set role pb_owner;',
  ...pub,
  'reset role;',
  ...sys,
  '',
].join('\n'));
