/* FOLDER IMPORT ASKED WHO WAS SIGNED IN ONCE PER FILE.

   cloudSyncOne takes a ctx precisely so that a caller holding the user, team
   and collection does not make it derive them again. Its own comment records
   what skipping that costs:

     "measured at 61 and 62 requests for a 60-trait push, 40% of the whole
      operation spent re-deriving two answers that cannot change while it runs"

   cloudPush passes one. Folder import never did - both its calls were
   cloudSyncOne(rec) with nothing - so every file uploaded into a group paid for
   an sbUser() and a cloudCollection() of its own. cloudTeam caches; those two
   do not. On the 317-trait v11 folder that is 634 round trips spent asking two
   questions whose answers cannot change during the import.

   ONLY u AND c ARE HELD, which is a smaller ctx than cloudPush builds and
   deliberately so. sbHeaders is not worth caching: sbToken returns the stored
   token with no request at all unless it is within a minute of expiry, so
   letting cloudSyncOne ask for headers each time is free AND keeps a long
   import from carrying a header that went stale halfway through. cloudPush
   caches its headers and has that exposure; this does not need to copy it.

   DERIVED ON FIRST USE, not up front. A re-import where every file is
   unchanged now uploads nothing, and paying for the lookups in that case would
   be two requests to discover there was nothing to do. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. worked out once ------------------------------------------------ */
swap(block([
  '  const writtenIds=new Set();',
]), block([
  '  const writtenIds=new Set();',
  '  /* WHO AND WHERE, worked out ONCE for the whole import.',
  '',
  '     cloudSyncOne accepts a ctx so that a caller already holding these does',
  '     not make it derive them per record; its own comment measures the cost of',
  '     not passing one at 40% of a 60-trait push. This path passed nothing, so',
  '     every uploaded file bought its own sbUser() and cloudCollection() -',
  '     cloudTeam caches, those two do not. On a 317-trait folder that is 634',
  '     round trips asking two questions that cannot change while it runs.',
  '',
  '     u and c only. sbHeaders is deliberately left out: sbToken returns the',
  '     stored token with no request unless it is within a minute of expiring,',
  '     so asking each time is free and a long import cannot end up carrying a',
  '     header that went stale halfway through.',
  '',
  '     On first use rather than up front, because a re-import of an unchanged',
  '     folder uploads nothing and should not pay to find that out. */',
  '  let pushCtx=null;',
  '  async function uploadCtx(){',
  '    if(!pushCtx){',
  '      const u=await sbUser();',
  '      pushCtx={u:u, team:await cloudTeam(), c:u?await cloudCollection(u):null};',
  '    }',
  '    return pushCtx;',
  '  }',
]));

/* ---- 2. both call sites use it ---------------------------------------- */
swap('        if(activeWs) await cloudSyncOne(rrec);',
  '        if(activeWs) await cloudSyncOne(rrec, await uploadCtx());');

swap('        if(activeWs) await cloudSyncOne(trec);',
  '        if(activeWs) await cloudSyncOne(trec, await uploadCtx());');

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  async function uploadCtx(){',
  '        if(activeWs) await cloudSyncOne(rrec, await uploadCtx());',
  '        if(activeWs) await cloudSyncOne(trec, await uploadCtx());'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const bulkStart = code.indexOf('async function bulkImport(files){');
const bulkEnd = code.indexOf('\r\nasync function ', bulkStart + 10);
if (bulkStart < 0 || bulkEnd < 0) throw new Error('could not bound bulkImport');
const bulk = code.slice(bulkStart, bulkEnd);

/* NO CALL LEFT WITHOUT A CONTEXT, or one of the two paths keeps paying per
   file and the fix looks done from the other one. */
const bare = bulk.split('cloudSyncOne(').length - 1;
const withCtx = bulk.split('await uploadCtx())').length - 1;
if (bare !== withCtx)
  throw new Error('a cloudSyncOne call in bulkImport still has no context (' + bare + ' calls, ' + withCtx + ' with ctx)');

/* DERIVED ONCE. Without the guard this is the defect again with more code. */
if (bulk.indexOf('if(!pushCtx){') < 0)
  throw new Error('the context is rebuilt on every call');

/* AND HEADERS ARE NOT HELD. Caching them buys nothing and can only go stale. */
const ctxStart = bulk.indexOf('  async function uploadCtx(){');
const ctxEnd = bulk.indexOf('    return pushCtx;', ctxStart);
if (ctxStart < 0 || ctxEnd < 0) throw new Error('could not bound uploadCtx');
if (bulk.slice(ctxStart, ctxEnd).indexOf('sbHeaders') >= 0)
  throw new Error('headers are cached, which buys nothing and can go stale mid-import');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
