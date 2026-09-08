/* RE-IMPORTING A FOLDER REWROTE EVERYTHING IN IT, INCLUDING THE PARTS THE
   FOLDER KNOWS NOTHING ABOUT.

   The question that started this: import a folder where 90% is already here -
   does it duplicate? No, and never did. The id is name + layer + status, so a
   file resolving to a trait already here replaces it. That part was fine.

   What it did instead was quieter. The replacement record was built fresh from
   the file, and a file knows only its pixels, its name and the folders above
   it. Everything the PROJECT had decided sat on the old record and was not
   copied across:

     rarity      the weight from Plan rarity. Gone - and cloudSyncOne uploads
                 `typeof rec.rarity==="number" ? rec.rarity : 1`, so a
                 re-import pushed weight 1 over the plan on the server too.
     shelfOrder  nextShelfOrder returns min - ORDER_STEP, the FRONT of the
                 layer. Every file jumped in front of the last one, so a
                 hand-ordered layer came back reversed.
     rowId       which server row this is. Without it cloudSyncOne matches on
                 name/layer/status, deletes the row and inserts a new one.

   And every file went up again whether or not it had changed: the PNG to
   storage, then a DELETE and a POST of the row. On the real collection that is
   274 uploads to change five files - and since each row is re-inserted, all
   274 appear in What changed as edited by you, burying the real edit under 269
   lines of noise.

   THE FIX IS TO DO NOTHING WHEN NOTHING CHANGED. The bytes are already hashed
   here for the duplicate-name check, so an unchanged file is free to spot.
   Leave the record alone, upload nothing, and say how many were left alone.

   A file that DID change still replaces the trait - that is the whole reason
   a folder gets imported twice - but carries the project's decisions across.
   synced is deliberately not carried: new bytes have not been up yet, and a
   record claiming otherwise is worse than re-uploading everything. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. what was here before, by id ---------------------------------- */
swap(block([
  '  const beforeIds=new Set(shelfItems.filter(i=>i.kind==="trait").map(i=>i.id));',
  '  const beforeTraits=shelfItems.filter(i=>i.kind==="trait");',
]), block([
  '  const beforeIds=new Set(shelfItems.filter(i=>i.kind==="trait").map(i=>i.id));',
  '  const beforeTraits=shelfItems.filter(i=>i.kind==="trait");',
  '  /* The same snapshot, reachable by id. beforeIds already answers "was this',
  '     here", and the record itself is what carries the rarity, the shelf',
  '     position and the server row across a replacement. */',
  '  const beforeById=new Map(beforeTraits.map(i=>[i.id,i]));',
  '  /* Files this folder supplied that were already here, unchanged. Counted',
  '     rather than inferred from fresh and replaced: those two describe writes,',
  '     and the whole point of these is that nothing was written. */',
  '  let unchanged=0;',
]));

/* ---- 2. leave an unchanged file completely alone --------------------- */
swap(block([
  '        const trec={id:"t_"+info.name+"_"+layer+"_"+status, kind:"trait", name:info.name,',
  '                    layer:layer, status:status, w:w, h:h2, blob:f, at:Date.now(),',
  '                    shelfOrder:shelfCore.nextShelfOrder(shelfItems,layer)};',
]), block([
  '        const tid="t_"+info.name+"_"+layer+"_"+status;',
  '        /* THE SAME FILE COMING BACK. A folder gets imported a second time',
  '           because a few files in it changed, and on the real collection "a',
  '           few" is five out of 274. The other 269 are byte-identical to what',
  '           is already here.',
  '',
  '           Skipping them is not an optimisation. REWRITING THE RECORD IS WHAT',
  '           LOSES THINGS - the weight the rarity plan set, the place on the',
  '           shelf somebody dragged it to, the row it holds on the server. A',
  '           file knows its pixels and its name; everything else on that record',
  '           was decided here, and re-reading the file is not new information',
  '           about any of it.',
  '',
  '           Costs nothing: the bytes are hashed just below anyway, for the',
  '           duplicate-name check.',
  '',
  '           Not taken when this batch has already written the id. Two files in',
  '           one folder resolving to the same trait is a replacement, and the',
  '           snapshot compared against here predates both of them. */',
  '        const prev = writtenIds.has(tid) ? null : (beforeById.get(tid)||null);',
  '        const sig=await fileSig(f);',
  '        if(prev && sig && await recSig(prev)===sig){',
  '          unchanged++;',
  '          writtenIds.add(tid);',
  '          /* Still supplied. The move and absent checks below read this list',
  '             to decide what the folder no longer holds, and a file left alone',
  '             is very much a file the folder still holds - leaving it out',
  '             would report every unchanged trait as missing. */',
  '          supplied.push({name:info.name, layer:layer, status:status, id:tid});',
  '          perLayer[layer]=(perLayer[layer]||0)+1;',
  '          ok++;',
  '          continue;',
  '        }',
  '        /* WHAT THE PROJECT DECIDED, carried across the replacement. The',
  '           picture changed; where it sits, how often it is drawn and which',
  '           server row it is did not.',
  '',
  '           synced is deliberately NOT carried. These bytes have not been up',
  '           yet, and a record that claims they have is the one outcome worse',
  '           than uploading too much. */',
  '        const trec={id:tid, kind:"trait", name:info.name,',
  '                    layer:layer, status:status, w:w, h:h2, blob:f, at:Date.now(),',
  '                    shelfOrder:(prev&&typeof prev.shelfOrder==="number")',
  '                      ? prev.shelfOrder : shelfCore.nextShelfOrder(shelfItems,layer)};',
  '        if(prev&&typeof prev.rarity==="number") trec.rarity=prev.rarity;',
  '        if(prev&&prev.rowId) trec.rowId=prev.rowId;',
]));

/* ---- 3. the hash is computed once, above ----------------------------- */
swap(block([
  '        const sig=await fileSig(f);',
  '        if(sig){',
  '          for(const old of beforeTraits){',
]), block([
  '        if(sig){',
  '          for(const old of beforeTraits){',
]));

/* ---- 4. the report says how many were left alone --------------------- */
swap(block([
  '  bits.push("Imported "+ok+" file"+(ok===1?"":"s")',
  '    +(fresh&&replaced ? " ("+fresh+" new, "+replaced+" updated)"',
  '      : replaced&&!fresh ? " (all updates)"',
  '      : ""));',
]), block([
  '  /* THE THREE ANSWERS, because they are three different facts and the reader',
  '     is asking one specific question: did my edit land, and did I add anything',
  '     by accident. "Imported 274 files" is the same sentence whether 274 traits',
  '     changed or none did.',
  '',
  '     The old wording had no way to say "already here" at all - an unchanged',
  '     file counted as an update, because it was one. */',
  '  {',
  '    const kinds=[];',
  '    if(fresh) kinds.push(fresh+" new");',
  '    if(replaced) kinds.push(replaced+" updated");',
  '    if(unchanged) kinds.push(unchanged+" already here");',
  '    bits.push("Imported "+ok+" file"+(ok===1?"":"s")',
  '      +(kinds.length ? " ("+kinds.join(", ")+")" : ""));',
  '  }',
]));

/* ---- CHECKS, then write ---------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  const beforeById=new Map(beforeTraits.map(i=>[i.id,i]));',
  '  let unchanged=0;', '        const tid="t_"+info.name+"_"+layer+"_"+status;',
  '        if(prev && sig && await recSig(prev)===sig){',
  '        if(prev&&typeof prev.rarity==="number") trec.rarity=prev.rarity;',
  '        if(prev&&prev.rowId) trec.rowId=prev.rowId;',
  '    if(unchanged) kinds.push(unchanged+" already here");'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE HASH PER FILE. The point of reading the record's bytes was that they
   were already being read; computing the file's digest twice per file would
   undo that and double the cost of every import. */
const bulkStart = code.indexOf('async function bulkImport(files){');
if (bulkStart < 0) throw new Error('bulkImport went');
const bulkEnd = code.indexOf('\r\nasync function ', bulkStart + 10);
if (bulkEnd < 0) throw new Error('could not find the end of bulkImport');
const bulk = code.slice(bulkStart, bulkEnd);
if (bulk.split('const sig=await fileSig(f);').length !== 2)
  throw new Error('the incoming file is hashed more than once per file');

/* THE SKIP MUST NOT SWALLOW THE FILE. An unchanged file is still a file the
   folder supplied, and the absent-check below reads that list to decide what
   has been deleted on disk - so leaving it out would report every unchanged
   trait as missing from the folder that just supplied it. */
const skipAt = bulk.indexOf('if(prev && sig && await recSig(prev)===sig){');
const skipEnd = bulk.indexOf('continue;', skipAt);
if (skipAt < 0 || skipEnd < 0) throw new Error('could not bound the skip');
const skip = bulk.slice(skipAt, skipEnd);
if (skip.indexOf('supplied.push(') < 0)
  throw new Error('a skipped file is not recorded as supplied, so it would read as deleted');
if (skip.indexOf('writtenIds.add(tid)') < 0)
  throw new Error('a skipped file does not claim its id');
if (skip.indexOf('dbPut') >= 0 || skip.indexOf('cloudSyncOne') >= 0)
  throw new Error('the skip still writes, which is the whole thing it exists not to do');

/* AND IT MUST STILL BE POSSIBLE TO REPLACE. A version that skipped everything
   would pass every "leave it alone" test while making folder re-import
   useless. The write path has to survive, reachable, below the skip. */
const putAt = bulk.indexOf('await dbPut(trec);');
if (putAt < 0 || putAt < skipEnd)
  throw new Error('the write path is gone or unreachable');
if (bulk.indexOf('if(activeWs) await cloudSyncOne(trec);') < 0)
  throw new Error('a changed file no longer reaches the group');

/* synced is not carried across a replacement. */
if (bulk.indexOf('trec.synced') >= 0)
  throw new Error('a replacement claims to already be on the server');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
