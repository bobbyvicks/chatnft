/* ONE COLLECTION EXPORT, ASSEMBLED FROM WHAT IS ALREADY HERE.

   The handoff asks for a versioned, verifiable package: the exact approved
   PNGs in layer folders, a manifest with ids, names, hashes and canvas sizes,
   the paint order, matching rule exports, a name mapping, and review progress -
   and it must report incomplete review rather than implying approval.

   Every mechanical part existed and none of them talked to each other. zip()
   writes a store-only archive, Download all folders PNGs by layer, the project
   export is versioned and round-trips, exportRules writes the LaunchMyNFT
   shape, and bulkImport has had a SHA-256 all along. Four buttons making four
   unrelated files, not one of which carried a hash, a revision, a name mapping
   or a word about whether the review was finished.

   THE HASH MOVES OUT OF bulkImport rather than being written twice. It was a
   closure in there; two spellings of "what is the SHA-256 of these bytes" is
   two chances for the manifest and the importer to disagree about whether a
   file changed.

   INCOMPLETE REVIEW IS SAID THREE TIMES, because the one thing this must not
   do is look finished when it is not: in the manifest as a boolean and the
   counts behind it, in a plain-words file beside it, and in the message on
   screen. Somebody opening the zip should not have to parse JSON to find out.

   APPROVED ONLY IN traits/. A wip or rejected trait is not part of a launch,
   so it does not go in the image tree - but it IS listed in the manifest with
   its status, because silently dropping it is how a collection ships nineteen
   traits short with nothing to point at. And the manifest, rules and mapping
   sit at the root: the handoff asks for the image tree to stay clean. */
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

/* ---- 1. one hash, not two --------------------------------------------- */
swap('function zip(files){', block([
  '/* The SHA-256 of some bytes, as hex. Lifted out of bulkImport, where it was',
  '   a closure: two spellings of this is two chances for the manifest and the',
  '   importer to disagree about whether a file has changed. Null on failure,',
  '   never a wrong answer - the same rule the import already followed. */',
  'async function sha256Of(buf){',
  '  try{',
  '    const h=await crypto.subtle.digest("SHA-256",buf);',
  '    return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,"0")).join("");',
  '  }catch(_){ return null; }',
  '}',
  'function zip(files){',
]));

swap(block([
  '  async function fileSig(b){',
  '    try{',
  '      const buf=await b.arrayBuffer();',
  '      const h=await crypto.subtle.digest("SHA-256",buf);',
  '      return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,"0")).join("");',
  '    }catch(_){ return null; }   /* no hash means no match, never a false one */',
  '  }',
]), block([
  '  /* Through the shared one, so the number in the manifest and the number',
  '     this compares against are the same number. */',
  '  async function fileSig(b){',
  '    try{ return await sha256Of(await b.arrayBuffer()); }',
  '    catch(_){ return null; }   /* no hash means no match, never a false one */',
  '  }',
]));

/* ---- 2. the export ----------------------------------------------------- */
swap(block([
  'async function importReviewQueue(f){',
]), block([
  '/* THE COLLECTION, PACKAGED.',
  '',
  '   traits/<layer>/<name>.png    approved only, exact bytes, nothing else',
  '   manifest.json                ids, names, hashes, sizes, order, progress',
  '   rules/launchmynft.json       the conditions, as LaunchMyNFT reads them',
  '   rules/never-together.json    the same rules in this app\'s own shape',
  '   names.csv                    original to final, for everything renamed',
  '   review-status.txt            whether this is finished, in words',
  '',
  '   The image tree holds images. Everything else sits beside it, which is what',
  '   the handoff means by keeping the launch tree clean. */',
  'const COLLECTION_FORMAT="chatnft-collection", COLLECTION_VERSION=1;',
  'async function exportCollection(){',
  '  const note=$("reviewnote");',
  '  const say=m=>{ if(note){ note.hidden=false; note.textContent=m; } };',
  '  let all=[]; try{ all=await dbAll(); }catch(_){ }',
  '  const traits=all.filter(i=>i.kind==="trait");',
  '  if(!traits.length){ say("There is nothing here to export."); return false; }',
  '  const approved=traits.filter(t=>(t.status||"wip")==="approved");',
  '  if(!approved.length){',
  '    say("No trait is approved, so there is no collection to package. Set a"',
  '      +" status on the shelf first.");',
  '    return false;',
  '  }',
  '  const safe=s=>String(s||"").replace(/[^a-z0-9._ -]+/gi,"-").trim()||"trait";',
  '  const files=[], rows=[], seen=new Set();',
  '  let unhashed=0;',
  '  for(const t of approved){',
  '    let bytes=null;',
  '    try{ bytes=new Uint8Array(await t.blob.arrayBuffer()); }catch(_){ continue; }',
  '    const dir="traits/"+safe(t.layer||"unsorted")+"/";',
  '    let path=dir+safe(t.name)+".png", k=2;',
  '    while(seen.has(path)) path=dir+safe(t.name)+"-"+(k++)+".png";',
  '    seen.add(path);',
  '    files.push({name:path, data:bytes});',
  '    const sha=await sha256Of(bytes.buffer);',
  '    if(!sha) unhashed++;',
  '    const e=entryForTrait(t);',
  '    rows.push({id:t.reviewId||null, name:t.name, layer:t.layer||"unsorted",',
  '      status:t.status||"wip", w:t.w||null, h:t.h||null, sha256:sha, path:path,',
  '      originalName:e?reviewBase(e.originalName):null,',
  '      artworkAccepted:!!(e&&e.artworkAccepted), nameAccepted:!!(e&&e.nameAccepted)});',
  '  }',
  '  /* EVERY TRAIT IS ACCOUNTED FOR, including the ones that did not go in the',
  '     image tree. Dropping them silently is how a collection ships short with',
  '     nothing to point at. */',
  '  const held=traits.filter(t=>(t.status||"wip")!=="approved")',
  '    .map(t=>({name:t.name, layer:t.layer||"unsorted", status:t.status||"wip"}));',
  '  /* Progress, from the queue when there is one. Without a pass started this',
  '     is not "finished", it is "never begun", and the manifest says which. */',
  '  const rev=REVIEW?{',
  '    started:true, revision:REVIEW.revision||null, total:REVIEW.entries.length,',
  '    finished:REVIEW.entries.filter(e=>e.artworkAccepted&&e.nameAccepted).length,',
  '    artworkOnly:REVIEW.entries.filter(e=>e.artworkAccepted&&!e.nameAccepted).length,',
  '    nameOnly:REVIEW.entries.filter(e=>!e.artworkAccepted&&e.nameAccepted).length,',
  '    skipped:REVIEW.entries.filter(e=>e.skipped).length,',
  '  }:{started:false, total:0, finished:0};',
  '  rev.complete = !!(rev.started && rev.total && rev.finished===rev.total);',
  '  const manifest={format:COLLECTION_FORMAT, version:COLLECTION_VERSION,',
  '    createdAt:new Date().toISOString(),',
  '    revision:(REVIEW&&REVIEW.revision)||null,',
  '    order:LAYERS.slice(), grid:projectGrid, emptyChance:emptyChance,',
  '    reviewComplete:rev.complete, review:rev,',
  '    counts:{packaged:rows.length, notPackaged:held.length, layers:',
  '      [...new Set(rows.map(r=>r.layer))].length},',
  '    traits:rows, notPackaged:held};',
  '  const enc=s=>new TextEncoder().encode(s);',
  '  files.push({name:"manifest.json", data:enc(JSON.stringify(manifest,null,2))});',
  '  /* Both rule shapes: the one LaunchMyNFT imports, and this app\'s own, so a',
  '     package can be read back without going through a converter. */',
  '  const rx=exportRules(traits);',
  '  if(rx.rules.length)',
  '    files.push({name:"rules/launchmynft.json", data:enc(JSON.stringify(rx.rules,null,2))});',
  '  if(RULES.length)',
  '    files.push({name:"rules/never-together.json",',
  '      data:enc(JSON.stringify(RULES.map(g=>g.slice()),null,2))});',
  '  /* The mapping, for everything whose name moved during the pass. */',
  '  const renamed=rows.filter(r=>r.originalName&&r.originalName!==r.name);',
  '  files.push({name:"names.csv", data:enc("layer,original,final\\n"',
  '    +renamed.map(r=>[r.layer,r.originalName,r.name]',
  '      .map(v=>\'"\'+String(v).replace(/"/g,\'""\')+\'"\').join(","))\.join("\\n")+"\\n")});',
  '  /* IN WORDS, beside the manifest. Somebody opening this zip should not have',
  '     to read JSON to find out whether it is finished. */',
  '  const status = rev.complete',
  '    ? "REVIEW COMPLETE. All "+rev.total+" entries have both the artwork and the name accepted."',
  '    : rev.started',
  '      ? "REVIEW INCOMPLETE. "+rev.finished+" of "+rev.total+" entries are finished."',
  '        +" These files are NOT a finally approved collection."',
  '      : "NO REVIEW PASS HAS BEEN STARTED. Nothing here has been through the"',
  '        +" final pass, so no file in it is finally approved.";',
  '  files.push({name:"review-status.txt", data:enc(status+"\\n"',
  '    +"Packaged: "+rows.length+" approved trait(s).\\n"',
  '    +"Not packaged: "+held.length+" trait(s) that are not approved.\\n")});',
  '  const b=zip(files), u=URL.createObjectURL(b), a=document.createElement("a");',
  '  a.href=u;',
  '  a.download="chatnft-collection"+((REVIEW&&REVIEW.revision)?"-"+safe(REVIEW.revision):"")+".zip";',
  '  document.body.appendChild(a); a.click(); a.remove();',
  '  setTimeout(()=>URL.revokeObjectURL(u),1500);',
  '  const bits=["Packaged "+rows.length+" approved trait"+(rows.length===1?"":"s")];',
  '  if(held.length) bits.push(held.length+" not approved "+(held.length===1?"was":"were")',
  '    +" listed but not included");',
  '  if(unhashed) bits.push(unhashed+" could not be hashed");',
  '  bits.push(rev.complete?"the review is complete"',
  '    :rev.started?("the review is NOT complete - "+rev.finished+" of "+rev.total+" finished")',
  '    :"no review pass has been started, so nothing here is finally approved");',
  '  say(bits.join(". ")+".");',
  '  return true;',
  '}',
  'async function importReviewQueue(f){',
]));

/* ---- 3. the button ----------------------------------------------------- */
swap(block([
  '        <button class="mini" id="reviewload">Load a review queue</button>',
]), block([
  '        <button class="mini" id="reviewload">Load a review queue</button>',
  '        <button class="mini" id="colexport"',
  '          title="Package the approved traits with a manifest of ids, names, hashes and canvas sizes, the paint order, both rule formats, the name mapping, and a plain statement of whether the review is finished.">Export the collection</button>',
]));

swap("$('reviewload').onclick=()=>$('reviewfile').click();", block([
  "$('reviewload').onclick=()=>$('reviewfile').click();",
  "$('colexport').onclick=async()=>{",
  "  const b=$('colexport');",
  "  b.disabled=true; b.textContent='Packaging\\u2026';",
  "  try{ await exportCollection(); }",
  "  finally{ b.disabled=false; b.textContent='Export the collection'; }",
  "};",
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function sha256Of(buf){', 'async function exportCollection(){',
  'const COLLECTION_FORMAT="chatnft-collection", COLLECTION_VERSION=1;',
  "$('colexport').onclick=async()=>{"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="colexport"').length !== 2)
  throw new Error('the button is not in the markup exactly once');

/* ONE HASH IN THE FILE. Two would let the manifest and the importer disagree
   about whether a file changed. */
if (code.split('crypto.subtle.digest("SHA-256"').length !== 2)
  throw new Error('the SHA-256 is computed in more than one place');

const eStart = code.indexOf('async function exportCollection(){');
const eEnd = code.indexOf('\r\nasync function importReviewQueue(', eStart);
if (eStart < 0 || eEnd < 0) throw new Error('could not bound exportCollection');
const fn = code.slice(eStart, eEnd);

/* IT MUST NOT LOOK FINISHED WHEN IT IS NOT. Three places, because somebody
   opening a zip should not have to read JSON to find out. */
if (fn.indexOf('reviewComplete:rev.complete') < 0)
  throw new Error('the manifest does not state whether the review is complete');
if (fn.indexOf('review-status.txt') < 0)
  throw new Error('the package does not say in words whether it is finished');
if (fn.indexOf('NO REVIEW PASS HAS BEEN STARTED') < 0)
  throw new Error('a package made before any review claims nothing about it');
/* And "never started" is not "complete". */
if (fn.indexOf('rev.complete = !!(rev.started && rev.total && rev.finished===rev.total);') < 0)
  throw new Error('an unstarted review could report itself as complete');

/* THE IMAGE TREE HOLDS IMAGES. The handoff asks for it to stay clean. */
if (!/name:"manifest\.json"/.test(fn) || fn.indexOf('name:"traits/manifest') >= 0)
  throw new Error('the manifest is inside the launch image tree');

/* A TRAIT THAT IS NOT PACKAGED IS STILL NAMED, or a collection ships short
   with nothing to point at. */
if (fn.indexOf('notPackaged:held') < 0)
  throw new Error('traits left out of the package are not recorded anywhere');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
