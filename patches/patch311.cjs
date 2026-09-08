/* CLEARING THE SERVER COPY, FROM INSIDE THE APP.

   "i want to clear the cloud, also make a button to do that so we dont have to
   keep doing it" - and the second half is the part that had to be built,
   because the first half CANNOT be done from anywhere else. Measured against
   the live project:

     ERROR: 42501: Direct deletion from storage tables is not allowed.
            Use the Storage API instead.

   A database trigger refuses it. So every previous clear removed the rows and
   left the pictures, and the bucket is now 2,178 files where the rows account
   for 302 - 1.14 GB of images belonging to nothing. This runs as the signed-in
   person, through the Storage API, which is the only thing that can.

   IT SWEEPS BEFORE IT DELETES THE ROWS, and that order is the whole point. The
   rows are what name the files; remove them first and the pictures are
   unreachable for ever, which is exactly how the bucket got into its current
   state.

   cloudSweep already lists a collection's prefix and deletes everything not in
   a keep-list, with the page-exhaustion guard it was given after a silent
   ceiling at 2,000 files. Clearing is that same operation with an empty
   keep-list, so it is reused rather than rewritten.

   AND THE RESULT IS VERIFIED, NOT ASSUMED. cloudSweep returns 0 both for
   "nothing to delete" and for "the list failed", which is fine for a
   background tidy after a push and not fine for the thing somebody pressed on
   purpose. The prefix is listed once more afterwards and the report says what
   is actually left.

   THE LOCAL COPY IS NOT TOUCHED - but the flags on it are. Every record
   carrying synced, rowId or path is claiming to be on a server that no longer
   has it, and cloudPush skips anything already synced: without clearing those,
   Save to cloud would look like it worked and upload nothing. */
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

/* ---- 1. the button ----------------------------------------------------- */
swap(block([
  '        <button class="mini" id="cloudpull" hidden>Load from cloud</button>',
]), block([
  '        <button class="mini" id="cloudpull" hidden>Load from cloud</button>',
  '        <button class="mini" id="cloudclear" hidden',
  '          title="Remove this project from the server: every trait row and every picture in storage. Your own copy on this device is kept, and every other member of the group keeps theirs. It only clears what is on the server.">Clear the cloud</button>',
]));

swap(block([
  '  $("cloudpush").hidden=!inn; $("cloudpull").hidden=!inn; $("cloudout").hidden=!inn;',
]), block([
  '  $("cloudpush").hidden=!inn; $("cloudpull").hidden=!inn; $("cloudout").hidden=!inn;',
  '  $("cloudclear").hidden=!inn;',
]));

/* ---- 2. the clear ------------------------------------------------------ */
swap(block([
  '/* Save to cloud is a shot in the dark without this: it says what is here, what',
]), block([
  '/* How many rows this collection has on the server, asked for as a count',
  '   rather than as rows. PostgREST answers it in a header, so 302 traits cost',
  '   one request and no bytes of image. */',
  'async function cloudRowCount(c){',
  '  const h=await sbHeaders({Prefer:"count=exact", Range:"0-0"});',
  '  if(!h||!c) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/traits?select=id&collection_id=eq."+c.id,{headers:h});',
  '    if(!r.ok) return null;',
  '    const cr=r.headers.get("Content-Range")||"";',
  '    const n=parseInt(String(cr).split("/")[1],10);',
  '    return isFinite(n) ? n : null;',
  '  }catch(_){ return null; }',
  '}',
  '',
  '/* What is still in the bucket under this collection, so the report can say',
  '   what happened rather than what was attempted. One page is enough: the',
  '   question is "is anything left", not "how many". */',
  'async function cloudFilesLeft(team,c){',
  '  const h=await sbHeaders({"Content-Type":"application/json"});',
  '  if(!h) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/storage/v1/object/list/traits",{method:"POST",headers:h,',
  '      body:JSON.stringify({prefix:team+"/"+c.id, limit:SWEEP_PAGE, offset:0})});',
  '    if(!r.ok) return null;',
  '    const batch=await r.json();',
  '    return Array.isArray(batch) ? batch.length : null;',
  '  }catch(_){ return null; }',
  '}',
  '',
  '/* CLEARING THE SERVER COPY OF THIS PROJECT.',
  '',
  '   Every previous clear was done by hand against the database, which removes',
  '   the rows and CANNOT remove the pictures - storage refuses direct deletion',
  '   and says so. That is why the bucket holds 1.14 GB of images belonging to',
  '   no row. This goes through the Storage API, as the person pressing it,',
  '   which is the only thing that can.',
  '',
  '   PICTURES FIRST, THEN ROWS. The rows are what name the files; deleting them',
  '   first strands the pictures for ever, which is precisely how the bucket got',
  '   into the state it is in. */',
  'async function clearCloud(){',
  '  const note=$("cloudnote");',
  '  const say=m=>{ if(note) note.textContent=m; };',
  '  const u=await sbUser();',
  '  if(!u){ toast("Sign in first"); return; }',
  '  const team=await cloudTeam();',
  '  const c=team?await cloudCollection(u):null;',
  '  if(!team||!c){ say("Could not reach the server, so nothing was changed."); return; }',
  '  const rows=await cloudRowCount(c);',
  '  if(rows===null){ say("Could not ask the server what it has, so nothing was changed."); return; }',
  '  if(!rows){',
  '    /* Files can outlive their rows - that is the whole reason this exists -',
  '       so an empty row count is not an empty collection. */',
  '    const left=await cloudFilesLeft(team,c);',
  '    if(!left){ say("There is nothing on the server for this project."); return; }',
  '  }',
  '  /* NAMED, and the group is named too. This is the only destructive action',
  '     here that reaches other people\'s screens. */',
  '  if(!confirm("Remove this project from the server?"',
  '    +"\\n\\n"+rows+" trait"+(rows===1?"":"s")+" and every picture stored with them."',
  '    +(activeWs?"\\n\\nThis is a group project, so it clears the server for"',
  '      +" everyone. Their own copies on their own devices are not touched.":"")',
  '    +"\\n\\nYour copy on this device is kept. Save to cloud puts it back.")) return;',
  '  const btn=$("cloudclear");',
  '  if(btn){ btn.disabled=true; }',
  '  say("Clearing the server\\u2026");',
  '  let files=0, rowsGone=false;',
  '  try{',
  '    /* An empty keep-list: everything under this collection goes. The sweep',
  '       already refuses to delete on a partial listing, which is the guard',
  '       that matters here too. */',
  '    files=await cloudSweep(team,c,[]);',
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(h){',
  '      const d=await fetch(SB_URL+"/rest/v1/traits?collection_id=eq."+c.id,',
  '        {method:"DELETE",headers:h});',
  '      rowsGone=d.ok;',
  '    }',
  '    /* THE FLAGS ON THE LOCAL COPY ARE NOW LIES. cloudPush skips anything',
  '       already synced, so leaving them would make Save to cloud report',
  '       success and upload nothing at all. */',
  '    let relit=0;',
  '    for(const rec of await dbAll()){',
  '      if(rec.kind!=="trait"&&rec.kind!=="ref") continue;',
  '      if(!rec.synced&&!rec.rowId&&!rec.path) continue;',
  '      const next=Object.assign({},rec);',
  '      delete next.synced; delete next.rowId; delete next.path;',
  '      try{ await dbPut(next); relit++; }catch(_){}',
  '    }',
  '    await renderShelf();',
  '    await cloudStatus(u);',
  '    /* ASKED AGAIN RATHER THAN ASSUMED. cloudSweep returns 0 for "nothing to',
  '       delete" and for "the listing failed" alike - tolerable for a tidy',
  '       after a push, not for the thing somebody pressed on purpose. */',
  '    const leftRows=await cloudRowCount(c);',
  '    const leftFiles=await cloudFilesLeft(team,c);',
  '    const bits=[];',
  '    bits.push(rowsGone&&leftRows===0 ? "The server copy is gone"',
  '      : leftRows ? "The server still has "+leftRows+" trait"+(leftRows===1?"":"s")',
  '      : "The rows were removed");',
  '    if(files) bits.push(files+" picture"+(files===1?"":"s")+" removed from storage");',
  '    if(leftFiles) bits.push(leftFiles+" still in storage - press it again");',
  '    else if(!files) bits.push("no pictures were found to remove");',
  '    if(relit) bits.push(relit+" here are marked as not uploaded, so Save to cloud will send them again");',
  '    say(bits.join(". ")+".");',
  '  }catch(_){',
  '    say("Something went wrong part way through. Press it again - it is safe to repeat.");',
  '  }finally{ if(btn) btn.disabled=false; }',
  '}',
  '',
  '/* Save to cloud is a shot in the dark without this: it says what is here, what',
]));

swap("$('setname').onclick=setDisplayName;", block([
  "$('setname').onclick=setDisplayName;",
  "$('cloudclear').onclick=clearCloud;",
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function clearCloud(){', 'async function cloudRowCount(c){',
  'async function cloudFilesLeft(team,c){', "$('cloudclear').onclick=clearCloud;",
  '  $("cloudclear").hidden=!inn;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="cloudclear"').length !== 2)
  throw new Error('the button is not in the markup exactly once');

const cStart = code.indexOf('async function clearCloud(){');
const cEnd = code.indexOf('\r\nasync function cloudStatus(', cStart);
if (cStart < 0 || cEnd < 0) throw new Error('could not bound clearCloud');
const fn = code.slice(cStart, cEnd);

/* PICTURES BEFORE ROWS. Reversing these strands 1.14 GB with nothing left to
   name it - which is the state the bucket is already in, from every previous
   clear done against the database. */
const sweepAt = fn.indexOf('await cloudSweep(team,c,[]);');
const rowDelAt = fn.indexOf('method:"DELETE",headers:h}');
if (sweepAt < 0 || rowDelAt < 0 || sweepAt > rowDelAt)
  throw new Error('the rows are deleted before the pictures they name');

/* AND THE KEEP-LIST IS EMPTY, or this is a tidy rather than a clear. */
if (fn.indexOf('cloudSweep(team,c,[])') < 0)
  throw new Error('the sweep keeps something');

/* IT ASKS BEFORE IT DELETES. */
if (fn.indexOf('confirm(') < 0) throw new Error('a destructive action with no confirmation');
const confirmAt = fn.indexOf('confirm(');
if (confirmAt > sweepAt) throw new Error('it deletes before it asks');

/* THE LOCAL COPY IS KEPT. Only the flags go - a dbDel here would make "your
   copy on this device is kept" a lie in the confirmation the user just read. */
if (fn.indexOf('dbDel') >= 0 || fn.indexOf('dbClear') >= 0)
  throw new Error('the clear deletes local work, which the confirmation says it does not');
for (const flag of ['delete next.synced;', 'delete next.rowId;', 'delete next.path;'])
  if (fn.indexOf(flag) < 0)
    throw new Error('a stale flag survives, so Save to cloud would upload nothing: ' + flag);

/* THE REPORT IS MEASURED. Claiming success from the absence of an exception is
   what every other cloud path here refuses to do. */
if (fn.indexOf('const leftRows=await cloudRowCount(c);') < 0)
  throw new Error('the result is claimed rather than checked');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
