/* A PROJECT FILE DOES NOT DUPLICATE WHAT IS ALREADY HERE.

   Found 2026-09-22 by the discovery pass, ranked sixth of 39, reproduced
   through the real file input. importProject decided "already here" by id
   alone and renamed on every collision, on the recorded premise that "an id
   already in use means a different trait with the same name". For a backup
   of the same collection it means the same trait. Measured: delete one
   trait, restore the backup - 621 traits, 310 of them "-2" copies
   byte-identical to their originals, every layer doubled; a third import
   933 with "-3". The copies get new layer/name keys, so no never-together
   rule covers them, and the generator draws from both.

   bulkImport answered the same question by the bytes (sha256Of) and wrote
   nothing for a file already here. importProject had the decoded picture in
   hand and never compared. It does now: an id already taken by a record
   with the same bytes is already here and nothing is written; different
   bytes under the same name are still a different trait and still renamed,
   as the recorded premise says. The note counts what was already here. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const fnR = () => kit.inFunction(L, 'async function importProject(file){');

swap('  const taken=new Set(existing.map(i=>i.id));', [
  '  const taken=new Set(existing.map(i=>i.id));',
  '  const byId=new Map(existing.map(i=>[i.id,i]));',
  '  /* The same bytes, by SHA-256 - the test bulkImport already uses. A hash',
  '     that cannot be taken is no match, never a false one. */',
  '  const sameBytes=async(a,b)=>{',
  '    try{',
  '      const x=await sha256Of(await a.arrayBuffer()), y=await sha256Of(await b.arrayBuffer());',
  '      return !!x && x===y;',
  '    }catch(_){ return false; }',
  '  };',
], 'the taken set', fnR());
swap('  let added=0, renamed=0, failed=0;', ['  let added=0, renamed=0, failed=0, already=0;'], 'the counters', fnR());
swap('    let k=2;', [
  '    /* ALREADY HERE, NOT A NAMESAKE. An id taken by a record holding the',
  '       same picture is this trait, from a backup of this collection -',
  '       renaming it made a byte-identical "-2" copy outside every rule',
  '       (measured, 310 of them on one restore). Nothing is written. */',
  '    if(taken.has(id) && byId.has(id) && byId.get(id).blob && await sameBytes(byId.get(id).blob,blob)){',
  '      already++; continue;',
  '    }',
  '    let k=2;',
], 'the rename loop', fnR());
swap('  if(renamed) bits.push(renamed+" renamed to avoid replacing something");', [
  '  if(already) bits.push(already+" already here");',
  '  if(renamed) bits.push(renamed+" renamed to avoid replacing something");',
], 'the note', fnR());

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  const a = code.indexOf('async function importProject(file){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  /* bulkImport has its own "already++; continue;", so counted in here only. */
  if (body.split('already++; continue;').length - 1 !== 1) throw new Error('the already-here skip is not in importProject once');
  if (body.split('bits.push(already+" already here")').length - 1 !== 1) throw new Error('importProject does not say what was already here');
  if (body.indexOf('already++; continue;') > body.indexOf('while(taken.has(id)){')) throw new Error('the check is after the rename');
});

fs.renameSync(TMP, FILE);
console.log('patch536 written, ' + grew + ' bytes');
