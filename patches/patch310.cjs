/* THE MERGE ONLY FOLLOWS A NEW NAME.

   Caught by tests/import.spec.js, which imports three skins and then two of
   them and asserts the third is REPORTED, not deleted. That fixture fills
   every canvas with one flat colour, so all three files are byte-identical -
   and the merge as first written deleted olive, because a picture already in
   the project matched a picture this import supplied.

   The fixture made it obvious, but the rule was wrong, not the fixture.
   "Merge them when it is the same picture" is about a file RENAMED on disk:
   the old name goes because a NEW name arrived carrying that artwork.
   Importing a subset of a folder brings no new name at all - every file in it
   was already here - and a trait sitting outside that subset is not being
   renamed by it. Deleting it would mean importing two skins could take a third
   with them.

   So an old record is merged only into a name this import BROUGHT: a file that
   was not in the project before. Everything else falls through to the
   absent-check, which names it and leaves it alone.

   Measured on the real collection there are no byte-identical pairs at all -
   272 approved files and 419 in the working folder - so this changes nothing
   there. It changes what happens the first time somebody imports one subfolder
   of a collection that does have a repeated picture, which is a thing that
   costs artwork and would have been found by the person it happened to. */
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

/* ---- 1. remember which ids this import BROUGHT ------------------------- */
swap(block([
  '  const writtenIds=new Set();',
  '  let fresh=0, replaced=0;',
]), block([
  '  const writtenIds=new Set();',
  '  /* Ids this import brought that were NOT in the project before. Only these',
  '     can absorb an older record under the merge below: a rename means a new',
  '     name arrived carrying artwork that is already here, and a file that was',
  '     already here under its own name renames nothing. */',
  '  const freshIds=new Set();',
  '  let fresh=0, replaced=0;',
]));

swap(block([
  '        if(beforeIds.has(trec.id)||writtenIds.has(trec.id)) replaced++; else fresh++;',
]), block([
  '        if(beforeIds.has(trec.id)||writtenIds.has(trec.id)) replaced++;',
  '        else { fresh++; freshIds.add(trec.id); }',
]));

/* ---- 2. the merge follows only those ----------------------------------- */
swap(block([
  '    const incoming=existing.filter(r=>r.kind==="trait"&&here.has(r.id));',
]), block([
  '    /* NEW NAMES ONLY. Importing a subset of a folder supplies files that',
  '       were all already here, so it renames nothing - and a trait outside',
  '       that subset which happens to carry the same picture is not being',
  '       merged by it, it is simply not in this import. That case belongs to',
  '       the absent-check below, which names it and leaves it alone. */',
  '    const incoming=existing.filter(r=>r.kind==="trait"&&freshIds.has(r.id));',
]));

swap(block([
  '     Same layer only, on the existing reasoning: one drawing legitimately',
  '     serves two layers, and a byte match across them means nothing.',
]), block([
  '     Same layer only, on the existing reasoning: one drawing legitimately',
  '     serves two layers, and a byte match across them means nothing.',
  '',
  '     And only into a name this import BROUGHT. A rename is a new name',
  '     carrying old artwork; importing two of a folder\'s three skins brings no',
  '     new name and must not take the third with it. tests/import.spec.js',
  '     caught exactly that, because its fixture fills every file with one',
  '     colour and so makes all three the same picture.',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  const freshIds=new Set();',
  '        else { fresh++; freshIds.add(trec.id); }',
  '    const incoming=existing.filter(r=>r.kind==="trait"&&freshIds.has(r.id));'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* freshIds and the fresh COUNT must move together, or the report and the
   merge disagree about what arrived. One statement, so they cannot. */
if (code.indexOf('else { fresh++; freshIds.add(trec.id); }') < 0)
  throw new Error('the count and the set are written apart');
if (code.split('freshIds.add(').length !== 2)
  throw new Error('freshIds is filled in more than one place');

/* And the merge no longer looks at everything the import supplied. */
const bulkStart = code.indexOf('async function bulkImport(files){');
const bulkEnd = code.indexOf('\r\nasync function ', bulkStart + 10);
const bulk = code.slice(bulkStart, bulkEnd);
if (bulk.indexOf('const incoming=existing.filter(r=>r.kind==="trait"&&here.has(r.id));') >= 0)
  throw new Error('the merge still absorbs into names that were already here');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
