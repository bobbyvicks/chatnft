/* THE SAME PICTURE UNDER A NEW NAME IS NOW MERGED, BY REQUEST.

   SUPERSEDING A RECORDED DECISION. tests/sameart.spec.js says "AND IT IS
   REPORTED, NOT MERGED", and the reason it gives is real: the first version
   deleted the old record on a byte match and destroyed a trait on its first
   run - re-importing an UNCHANGED folder went from two traits to one, because
   two files in it were byte-identical and each deleted the other's record
   before the loop reached it, leaving whichever wrote last.

   The user has asked for the merge. So the hazard has to be designed out
   rather than argued away, and the fix is WHERE it runs, not how carefully.

   IT RUNS AFTER THE LOOP, like the move-check and the absent-check beside it,
   and it can only ever delete a record THIS IMPORT DID NOT SUPPLY. That is
   what makes the recorded failure impossible rather than unlikely: inside the
   loop the batch's own future writes are unknowable, and afterwards they are
   simply a list. An unchanged folder supplies every record it matches, so
   there is nothing left for the merge to look at - which is the exact case
   that broke last time.

   Two files inside ONE folder that carry the same picture are still only
   reported. Both were supplied, the folder is the source of truth, and
   choosing which of the two names the artist meant is not something an import
   can know. That half of the old decision stands.

   AND A CACHE BUG THAT WAS ALREADY THERE. recSig caches by record id, and a
   replaced record keeps its id while its bytes change - so anything asking
   for that record's signature later in the run got the bytes it used to have.
   Nothing depended on it before the merge did; it does now. */
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

/* ---- 1. the in-loop check is now about THIS FOLDER only --------------- */
swap(block([
  '  const artSoFar=beforeTraits.slice();',
]), block([
  '  const wroteThisRun=[];',
]));

swap(block([
  '     beforeTraits. That one is a snapshot of what the project held before the',
  '     import and is what the absent-check must compare against; this one grows',
  '     as the run writes, because two copies of one PNG inside a single folder',
  '     are exactly as much of a duplicate as one copy against an older record -',
  '     and were reported as nothing at all, filter() having returned a new array',
  '     that nothing ever appended to. */',
]), block([
  '     beforeTraits, and no longer includes it. Two copies of one PNG inside a',
  '     SINGLE folder are all this reports now: both were supplied, so the merge',
  '     below will not touch either, and which of the two names the artist meant',
  '     is not something an import can work out. A picture matching something',
  '     that was already in the project is a different question and is answered',
  '     after the loop, where the batch\'s own writes are a list rather than a',
  '     guess. */',
]));

swap(block([
  '           So it says so. The person importing knows which of the two they',
  '           meant to keep, and the absent-check below already settles this the',
  '           same way: guessing throws away work, being told costs nothing. */',
  '        if(sig){',
  '          for(const old of artSoFar){',
]), block([
  '           SUPERSEDED FOR THE CROSS-BOUNDARY CASE, which is now merged after',
  '           the loop - see the merge block below, which can only delete a',
  '           record this import did not supply and so cannot reach the failure',
  '           described above. What is left here is two files inside ONE folder',
  '           carrying the same picture: both are supplied, the folder is the',
  '           source of truth, and the sentence above still holds for them. */',
  '        if(sig){',
  '          for(const old of wroteThisRun){',
]));

swap(block([
  '        await dbPut(trec);',
  '        supplied.push({name:info.name, layer:layer, status:status, id:trec.id});',
  '        shelfItems.push(trec);',
  '        artSoFar.push(trec);',
]), block([
  '        await dbPut(trec);',
  '        /* THE SIGNATURE OF WHAT IS NOW THERE. recSig caches by id, and a',
  '           replacement keeps the id while the bytes change - so without this',
  '           the merge below would compare this record by the picture it used',
  '           to hold. Set rather than deleted, because the answer is already in',
  '           hand and re-reading the blob would cost a hash. */',
  '        if(sig) sigCache.set(trec.id,sig);',
  '        supplied.push({name:info.name, layer:layer, status:status, id:trec.id});',
  '        shelfItems.push(trec);',
  '        wroteThisRun.push(trec);',
]));

/* ---- 2. the merge, after the loop ------------------------------------- */
swap(block([
  '  /* Traits the project has and this folder did not bring. Usually a file',
]), block([
  '  /* THE SAME PICTURE UNDER A NEW NAME, merged.',
  '',
  '     "cap v2.png" is a new name for artwork already here, and the id carries',
  '     the name, so without this both stay for ever - which is how a project',
  '     ends up holding forty versions of one skin.',
  '',
  '     THIS IS WHY IT RUNS HERE AND NOT IN THE LOOP. An earlier version merged',
  '     inline and destroyed a trait on its first run: two byte-identical files',
  '     in one folder each deleted the other\'s record, and whichever wrote last',
  '     survived alone. Inside the loop the batch\'s own future writes are',
  '     unknowable; afterwards they are just `here`. Nothing this import',
  '     supplied is a candidate, so re-importing an unchanged folder - where',
  '     every record IS supplied - has nothing to look at at all.',
  '',
  '     Same layer only, on the existing reasoning: one drawing legitimately',
  '     serves two layers, and a byte match across them means nothing.',
  '',
  '     The server copy goes too, or the next pull brings the old name back. */',
  '  const mergedAway=[];',
  '  const mergedIds=new Set();',
  '  if(supplied.length){',
  '    let existing=[]; try{ existing=await dbAll(); }catch(_){ existing=[]; }',
  '    const here=new Set(supplied.map(s=>s.id));',
  '    const incoming=existing.filter(r=>r.kind==="trait"&&here.has(r.id));',
  '    for(const rec of existing){',
  '      if(rec.kind!=="trait"||here.has(rec.id)||movedIds.has(rec.id)) continue;',
  '      const s=await recSig(rec);',
  '      if(!s) continue;   /* no hash means no match, never a false one */',
  '      let onto=null;',
  '      for(const t of incoming){',
  '        if((t.layer||"unsorted")!==(rec.layer||"unsorted")) continue;',
  '        if(await recSig(t)!==s) continue;',
  '        onto=t; break;',
  '      }',
  '      if(!onto) continue;',
  '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  '      try{ await cloudDropOne(rec); }catch(_){}',
  '      mergedAway.push(rec.name+" into "+onto.name);',
  '      mergedIds.add(rec.id);',
  '    }',
  '  }',
  '  /* Traits the project has and this folder did not bring. Usually a file',
]));

/* ---- 3. a merged record is not also "missing" -------------------------- */
swap(block([
  '      if(here.has(rec.id)||movedIds.has(rec.id)) continue;',
  '      absent.push(rec.name);',
]), block([
  '      if(here.has(rec.id)||movedIds.has(rec.id)||mergedIds.has(rec.id)) continue;',
  '      absent.push(rec.name);',
]));

/* ---- 4. and it is said ------------------------------------------------- */
swap(block([
  '  if(sameArt.length) bits.push(sameArt.length+" the same picture twice ("',
]), block([
  '  /* NAMED, because it is a DELETION. "3 merged" is a number to worry about',
  '     and "cap into cap v2" is a pair somebody can recognise as right. */',
  '  if(mergedAway.length) bits.push(mergedAway.length+" merged ("',
  '    +mergedAway.slice(0,3).join("; ")',
  '    +(mergedAway.length>3?" and "+(mergedAway.length-3)+" more":"")+")");',
  '  if(sameArt.length) bits.push(sameArt.length+" the same picture twice ("',
]));

/* ---- CHECKS, then write ----------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  const wroteThisRun=[];', '        if(sig) sigCache.set(trec.id,sig);',
  '  const mergedAway=[];', '          for(const old of wroteThisRun){',
  '        wroteThisRun.push(trec);',
  '      if(here.has(rec.id)||movedIds.has(rec.id)||mergedIds.has(rec.id)) continue;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

if (code.indexOf('artSoFar') >= 0)
  throw new Error('the old candidate list is still referenced');

const bulkStart = code.indexOf('async function bulkImport(files){');
const bulkEnd = code.indexOf('\r\nasync function ', bulkStart + 10);
const bulk = code.slice(bulkStart, bulkEnd);

/* THE ONE PROPERTY THAT MAKES THIS SAFE: the merge never deletes a record
   this import supplied. Without that line it is the version that destroyed a
   trait on its first run. */
const mAt = bulk.indexOf('  const mergedAway=[];');
/* Bounded on CODE, not on a comment: kit.code has already stripped the
   comments, so a comment marker returns -1 and the slice runs to the end of
   the file - which is how an earlier check in this repo ended up scanning
   three thousand unrelated lines. */
const mEnd = bulk.indexOf('  const absent=[];', mAt);
if (mAt < 0 || mEnd < 0) throw new Error('could not bound the merge');
const merge = bulk.slice(mAt, mEnd);
if (merge.indexOf('here.has(rec.id)') < 0)
  throw new Error('the merge can delete a record this import just supplied');
if (merge.indexOf('(t.layer||"unsorted")!==(rec.layer||"unsorted")') < 0)
  throw new Error('the merge crosses layers, where a byte match means nothing');
if (merge.indexOf('cloudDropOne') < 0)
  throw new Error('the group keeps the copy this deleted here');

/* AND IT RUNS AFTER THE WRITE LOOP, which is the whole design. If it were
   above dbPut it would be the inline version again. */
const putAt = bulk.indexOf('await dbPut(trec);');
if (putAt < 0 || mAt < putAt)
  throw new Error('the merge runs before the import has finished writing');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
