/* AN AUTO-NAMED FILE WAS IDENTIFIED BY ITS POSITION IN THE RUN.

   A PNG named after a UUID gets called "backgrounds-1", "backgrounds-2" and so
   on. The counter is declared empty per import:

     const nextNum={};                       // 7502
     nextNum[lay]=(nextNum[lay]||0)+1;       // 7586
     info.name=lay+"-"+nextNum[lay];         // 7587

   and consults nothing that already exists. So the number a file receives
   depends on where it falls in this run - which shifts the moment one file is
   added, removed, or skipped by the decode, size or palette-strip guards
   above it.

   The name is the id. Add one background to a folder of nine UUID-named ones
   and every later file re-keys onto the record BEFORE it: backgrounds-3 is
   overwritten with what used to be backgrounds-4, and so on down, with one
   stale record left at the end. The real collection has thirteen files in
   this shape - nine backgrounds and four unsorted - so this is not
   hypothetical, and nothing about it is visible in the report: it says
   "13 named for you" both times.

   THE PICTURE DECIDES INSTEAD. If the bytes already belong to a trait on that
   layer, the file IS that trait and takes its name back - so it lands on its
   own record whatever order the folder is read in, and being unchanged, is
   then left alone entirely. Only genuinely new artwork takes a number, and it
   takes one above the highest already in that layer rather than starting from
   one and colliding.

   AND THE SAME-PICTURE CHECK COULD NOT SEE THE CURRENT RUN. beforeTraits is a
   snapshot taken with filter(), which returns a new array; records written by
   this import were pushed onto shelfItems and never onto it. Two copies of one
   PNG in a single folder were therefore both written with no "same picture
   twice" warning at all - and that warning is the ONLY thing standing between
   a renamed file and a silently duplicated trait, since the check deliberately
   reports rather than deletes. */
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

/* ---- 1. candidates for the same-picture check include this run --------- */
swap(block([
  '  const beforeById=new Map(beforeTraits.map(i=>[i.id,i]));',
]), block([
  '  const beforeById=new Map(beforeTraits.map(i=>[i.id,i]));',
  '  /* Candidates for the same-picture check, which is NOT the same list as',
  '     beforeTraits. That one is a snapshot of what the project held before the',
  '     import and is what the absent-check must compare against; this one grows',
  '     as the run writes, because two copies of one PNG inside a single folder',
  '     are exactly as much of a duplicate as one copy against an older record -',
  '     and were reported as nothing at all, filter() having returned a new array',
  '     that nothing ever appended to. */',
  '  const artSoFar=beforeTraits.slice();',
]));

/* ---- 2. the picture decides the name, not the position ---------------- */
swap(block([
  '        if(looksUnnamed(info.name)){',
  '          const lay=info.layer||"unsorted";',
  '          nextNum[lay]=(nextNum[lay]||0)+1;',
  '          info.name=lay+"-"+nextNum[lay];',
  '          renamed++;',
  '        }',
]), block([
  '        /* Hashed BEFORE the name is worked out, because for an auto-named',
  '           file the bytes are the only thing that says which trait it is. */',
  '        const sig=await fileSig(f);',
  '        if(looksUnnamed(info.name)){',
  '          const lay=info.layer||"unsorted";',
  '          /* THE PICTURE, NOT THE POSITION. The number used to come from a',
  '             counter that restarted every import, so adding one file to the',
  '             folder shifted every later name by one and re-keyed each file',
  '             onto the record before it. The name is the id, so that",',
  '             overwrote real artwork and reported "13 named for you" either',
  '             way.',
  '',
  '             If these bytes are already a trait on this layer, this file IS',
  '             that trait: it takes its name back and lands on its own record',
  '             whatever order the folder is read in. */',
  '          let known=null;',
  '          if(sig){',
  '            for(const old of beforeTraits){',
  '              if((old.layer||"unsorted")!==lay) continue;',
  '              if(await recSig(old)!==sig) continue;',
  '              known=old.name; break;',
  '            }',
  '          }',
  '          if(known!==null) info.name=known;',
  '          else{',
  '            /* New artwork, so it needs a number nothing else holds. Starting',
  '               from one would land on backgrounds-1, which already exists. */',
  '            if(nextNum[lay]===undefined){',
  '              let top=0;',
  '              for(const old of beforeTraits){',
  '                if((old.layer||"unsorted")!==lay) continue;',
  '                const m=/^(.*)-([0-9]+)$/.exec(String(old.name||""));',
  '                if(m&&m[1]===lay) top=Math.max(top,parseInt(m[2],10)||0);',
  '              }',
  '              nextNum[lay]=top;',
  '            }',
  '            nextNum[lay]=nextNum[lay]+1;',
  '            info.name=lay+"-"+nextNum[lay];',
  '          }',
  '          renamed++;',
  '        }',
]));

/* ---- 3. the hash is now computed above -------------------------------- */
swap(block([
  '        const prev = writtenIds.has(tid) ? null : (beforeById.get(tid)||null);',
  '        const sig=await fileSig(f);',
]), block([
  '        const prev = writtenIds.has(tid) ? null : (beforeById.get(tid)||null);',
]));

/* ---- 4. the same-picture check sees this run too ----------------------- */
swap(block([
  '          for(const old of beforeTraits){',
  '            if(old.id===trec.id) continue;',
  '            if((old.layer||"unsorted")!==layer) continue;',
  '            if(await recSig(old)!==sig) continue;',
  '            sameArt.push(old.name+" and "+info.name);',
  '            break;',
  '          }',
]), block([
  '          for(const old of artSoFar){',
  '            if(old.id===trec.id) continue;',
  '            if((old.layer||"unsorted")!==layer) continue;',
  '            if(await recSig(old)!==sig) continue;',
  '            sameArt.push(old.name+" and "+info.name);',
  '            break;',
  '          }',
]));

swap(block([
  '        shelfItems.push(trec);',
]), block([
  '        shelfItems.push(trec);',
  '        artSoFar.push(trec);',
]));

/* ---- CHECKS, then write ----------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  const artSoFar=beforeTraits.slice();',
  '          let known=null;', '          if(known!==null) info.name=known;',
  '            if(nextNum[lay]===undefined){',
  '          for(const old of artSoFar){',
  '        artSoFar.push(trec);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const bulkStart = code.indexOf('async function bulkImport(files){');
const bulkEnd = code.indexOf('\r\nasync function ', bulkStart + 10);
const bulk = code.slice(bulkStart, bulkEnd);

/* STILL ONE HASH PER INCOMING FILE. Moving it earlier is only safe if it did
   not also get left behind where it was. */
if (bulk.split('const sig=await fileSig(f);').length !== 2)
  throw new Error('the incoming file is hashed more than once per file');

/* AND IT IS HASHED BEFORE THE NAME IS DECIDED, or the name cannot depend on
   it and this whole patch is inert. */
const sigAt = bulk.indexOf('const sig=await fileSig(f);');
const nameAt = bulk.indexOf('if(looksUnnamed(info.name)){');
if (sigAt < 0 || nameAt < 0 || sigAt > nameAt)
  throw new Error('the file is named before it is hashed');

/* The absent-check must still read the SNAPSHOT. If it were pointed at the
   growing list it would compare the project against itself and never report
   anything as missing. */
const absentAt = bulk.indexOf('for(const rec of beforeTraits){');
if (absentAt < 0)
  throw new Error('the absent-check no longer reads what was here before');

/* The counter must consult what exists. A version that kept restarting at one
   would collide with backgrounds-1 on every import. */
if (bulk.indexOf('nextNum[lay]=top;') < 0)
  throw new Error('the number does not start above what is already there');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
