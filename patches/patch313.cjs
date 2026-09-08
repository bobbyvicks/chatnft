/* AN ALREADY-EMPTY SERVER STILL LEAVES THIS BROWSER LYING.

   clearCloud returned early when the server had no rows and no files - "there
   is nothing on the server for this project" - and returning there skips the
   one repair that is still needed.

   Every local record carries synced, rowId and path from the last time it went
   up. If the server was emptied by anything other than this button - and every
   clear before this one was done by hand against the database - those flags are
   claims about a server that no longer holds them. cloudPush skips whatever is
   already synced:

     if(it.synced && it.rowId && it.path===p)

   so Save to cloud would report success and upload nothing at all. The
   collection would be gone from the server, the browser would insist it was
   there, and nothing would ever say otherwise.

   So the flags are put right whether or not there was anything to delete. It
   costs one pass over the store and it is the only thing that repairs a
   browser whose server copy went away behind its back - which is the state
   this project is in right now. */
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

/* ---- 1. the repair is its own thing, so both paths can use it ---------- */
swap(block([
  'async function clearCloudNow(){',
]), block([
  '/* Records here that claim to be on a server which no longer has them.',
  '',
  '   Returns how many it put right. Separate from the clear because it is',
  '   needed on BOTH paths: after emptying the server, and when the server was',
  '   already empty because something else emptied it. The second is the one',
  '   that bites - cloudPush skips anything already synced, so a browser left',
  '   in that state reports a successful upload of nothing. */',
  'async function relightUnsynced(){',
  '  let n=0;',
  '  for(const rec of await dbAll()){',
  '    if(rec.kind!=="trait"&&rec.kind!=="ref") continue;',
  '    if(!rec.synced&&!rec.rowId&&!rec.path) continue;',
  '    const next=Object.assign({},rec);',
  '    delete next.synced; delete next.rowId; delete next.path;',
  '    try{ await dbPut(next); n++; }catch(_){}',
  '  }',
  '  return n;',
  '}',
  'async function clearCloudNow(){',
]));

/* ---- 2. an empty server still gets the repair -------------------------- */
swap(block([
  '    const left=await cloudFilesLeft(team,c);',
  '    if(!left){ say("There is nothing on the server for this project."); return; }',
]), block([
  '    const left=await cloudFilesLeft(team,c);',
  '    if(!left){',
  '      /* Nothing to delete, and still something to fix: this browser may be',
  '         insisting it uploaded work to a server that was emptied behind its',
  '         back, in which case Save to cloud silently sends nothing. */',
  '      const relit=await relightUnsynced();',
  '      if(relit){ await renderShelf(); await cloudStatus(u); }',
  '      say("There is nothing on the server for this project."',
  '        +(relit?" "+relit+" here had been marked as uploaded and no longer are,"',
  '          +" so Save to cloud will send them.":""));',
  '      return;',
  '    }',
]));

/* ---- 3. the clear path uses the same helper ---------------------------- */
swap(block([
  '    let relit=0;',
  '    for(const rec of await dbAll()){',
  '      if(rec.kind!=="trait"&&rec.kind!=="ref") continue;',
  '      if(!rec.synced&&!rec.rowId&&!rec.path) continue;',
  '      const next=Object.assign({},rec);',
  '      delete next.synced; delete next.rowId; delete next.path;',
  '      try{ await dbPut(next); relit++; }catch(_){}',
  '    }',
]), block([
  '    const relit=await relightUnsynced();',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function relightUnsynced(){',
  '    const relit=await relightUnsynced();',
  '      const relit=await relightUnsynced();'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE DEFINITION, TWO CALLERS. The whole point of pulling it out is that the
   two paths cannot drift into repairing different things. */
if (code.split('delete next.synced; delete next.rowId; delete next.path;').length !== 2)
  throw new Error('the repair is written out more than once');
if (code.split('await relightUnsynced();').length !== 3)
  throw new Error('expected exactly two callers of the repair');

/* AND THE EMPTY PATH STILL RETURNS WITHOUT DELETING ANYTHING. It is a repair,
   not a clear - there is nothing there to clear. */
const nStart = code.indexOf('async function clearCloudNow(){');
const nEnd = code.indexOf('\r\nasync function cloudStatus(', nStart);
const body = code.slice(nStart, nEnd);
const emptyAt = body.indexOf('const relit=await relightUnsynced();');
const sweepAt = body.indexOf('await cloudSweep(team,c,[]);');
if (emptyAt < 0 || sweepAt < 0 || emptyAt > sweepAt)
  throw new Error('the empty-server repair is not before the sweep it must not reach');
const emptyBranch = body.slice(emptyAt, body.indexOf('return;', emptyAt));
if (emptyBranch.indexOf('cloudSweep') >= 0 || emptyBranch.indexOf('DELETE') >= 0)
  throw new Error('the empty-server path deletes something');

/* The local records are still kept, on both paths. */
if (body.indexOf('dbDel') >= 0 || body.indexOf('dbClear') >= 0)
  throw new Error('the clear deletes local work');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
