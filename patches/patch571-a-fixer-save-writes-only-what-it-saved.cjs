/* A FIX PIXELS SAVE WRITES WHAT IT SAVED AND TOUCHES NOTHING ELSE.

   fixSaveFiles saves through bulkImport, so a fixed trait is filed by the
   same rules as a folder import. Three of those rules are about a FOLDER
   being the source of truth, and a save from the fixer is not a folder:

   - The moved-file check deletes a record with the same name and layer
     and another status. Fix an approved hat while a wip hat sits beside it
     - bulkImport's own comment says a folder with both keeps both, and
     saveTrait allows it - and Save to project deleted the wip hat here and
     its row on the server, copied its shelf place onto the approved one,
     and said "1 sent to the project".
   - The same-picture merge deletes a trait whose picture matches a new
     name. A fixer save is not a rename.
   - The absent report listed every other trait in the layer as "not in
     this folder".

   A save from the fixer passes inPlace and skips all three.

   AND AN IMPORT THAT BRINGS NO NEW NAME HASHES NOTHING. The merge read and
   SHA-256'd every trait not in the import before asking whether a new name
   had arrived to merge into - a re-import of one subfolder, or any
   fixer save, hashed the whole project for nothing. It hashes only traits
   in a layer a new name landed in, which with no new name is none. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

swap('async function bulkImport(files){', [
  '/* opts.inPlace: a save from Fix pixels, which writes the files it is given',
  '   and nothing else - no moved-file deletion, no same-picture merge, no',
  '   report of what the "folder" did not bring. Those three read a folder as',
  '   the whole truth about the layers it touches, and a fixer save is not one. */',
  'async function bulkImport(files,opts){',
  '  const inPlace=!!(opts&&opts.inPlace);',
], 'bulkImport head');

const fn = kit.inFunction(L, 'async function bulkImport(files,opts){');
const blocks = [];
L.forEach((l, i) => { if (l === '  if(supplied.length){' && i > fn.start && i < fn.end) blocks.push(i); });
if (blocks.length !== 3) throw new Error('expected three supplied blocks, found ' + blocks.length);
const [moveAt, mergeAt, absentAt] = blocks;
if (!/moves=supplied\.some/.test(L.slice(moveAt, moveAt + 8).join('\n'))) throw new Error('first block is not the move check');
if (!L.slice(mergeAt, mergeAt + 12).some(l => l.indexOf('const incoming=') >= 0)) throw new Error('second block is not the merge');
if (!L.slice(absentAt, absentAt + 8).some(l => l.indexOf('absent.push') >= 0)) throw new Error('third block is not the absent report');
L[moveAt] = '  if(supplied.length && !inPlace){';
L[mergeAt] = '  if(supplied.length && !inPlace){';
L[absentAt] = '  if(supplied.length && !inPlace){';

{
  const i = kit.only(L, l => l === '    const incoming=existing.filter(r=>r.kind==="trait"&&freshIds.has(r.id));', 'incoming', fn);
  if (L[i + 1] !== '    for(const rec of existing){') throw new Error('merge loop moved');
  if (L[i + 2] !== '      if(rec.kind!=="trait"||here.has(rec.id)||movedIds.has(rec.id)) continue;') throw new Error('merge skip moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '    const incoming=existing.filter(r=>r.kind==="trait"&&freshIds.has(r.id));',
    '    /* Hashed only in a layer a new name landed in: a trait in any other',
    '       cannot match, and with no new name there is no such layer. Every',
    '       trait was read and hashed first, on every import. */',
    '    const intoLayers=new Set(incoming.map(t=>t.layer||"unsorted"));',
    '    for(const rec of existing){',
    '      if(rec.kind!=="trait"||here.has(rec.id)||movedIds.has(rec.id)) continue;',
    '      if(!intoLayers.has(rec.layer||"unsorted")) continue;',
  ]);
}

swap('  try{ r=await bulkImport(files); }', [
  '  /* In place: see bulkImport. A fixed trait replaces itself and nothing',
  '     else - it had deleted a same-named trait of another status. */',
  '  try{ r=await bulkImport(files,{inPlace:true}); }',
], 'the fixer save');

kit.save(doc, ({ code }) => {
  if (code.split('&& !inPlace){').length - 1 !== 3) throw new Error('three guards');
});

fs.renameSync(TMP, FILE);
console.log('patch571 written');
