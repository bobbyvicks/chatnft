/* AN UNSAVED DRAWING OUTLIVES A TEAMMATE'S NEWER SAVE.

   Found 2026-09-22 by the discovery pass, ranked eleventh of 39, reproduced
   by a finder and two verifiers. A draft is offered when a trait opens only
   if it is strictly newer than the record (openTraitRecord). A teammate's
   save, pulled after you drew, rewrites the record with the server's
   updated_at - newer than your draft - so the next open showed their
   pixels, no draft bar, and your drawing sat in the store unreachable until
   the next stroke overwrote it. The pull's clash rule counts saved-but-
   unsent changes (synced:false); a drawing still in its autosave leaves the
   record synced, so it was neither kept nor mentioned.

   When the pull replaces a trait that has a draft, the draft is kept and
   stamped past the record it now sits on - the rule draftsFollow uses,
   max(now, record + 1) - so the next open offers it, with the draft bar
   that lets it be discarded. The note says so: somebody deciding between
   their drawing and a teammate's new version has to know there are two. */
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
const pullR = () => kit.inFunction(L, 'async function cloudPull(opts){');

swap('  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false;', [
  '  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false;',
  '  const draftsKept=[];',
], 'the counters', pullR());
swap('        await dbPut(rec); added++;', [
  '        await dbPut(rec); added++;',
  '        /* A DRAWING HERE, NOT YET SAVED, of the trait just replaced. It was',
  '           older than the new record, so the next open would not offer it -',
  '           measured, the teammate\'s pixels and no draft bar. Kept, stamped',
  '           past the record the way draftsFollow does, and said. */',
  '        if(w.replaces){',
  '          try{',
  '            const dr=await dbGet(draftKey(w.id));',
  '            if(dr && dr.blob){',
  '              await dbPut(Object.assign({},dr,{at:Math.max(Date.now(),(rec.at||0)+1)}));',
  '              draftsKept.push(w.name);',
  '            }',
  '          }catch(_){ }',
  '        }',
], 'the replacing write', pullR());
swap('  if(clashed.length) bits.push(clashed.length+" you have unsaved changes to, kept");', [
  '  if(clashed.length) bits.push(clashed.length+" you have unsaved changes to, kept");',
  '  if(draftsKept.length) bits.push(draftsKept.length+" updated by the group while you had an unsaved drawing of "',
  '    +(draftsKept.length===1?"it":"them")+" - your drawing is kept as a draft ("+draftsKept.join(", ")+")");',
], 'the note', pullR());

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('draftsKept.push(w.name);') !== 1) throw new Error('drafts are not kept once');
  if (times('if(draftsKept.length) bits.push(') !== 1) throw new Error('the note is missing');
  const a = code.indexOf('draftsKept.push(w.name);'), b = code.indexOf('await dbPut(rec); added++;');
  if (!(b >= 0 && a > b)) throw new Error('the draft is not restamped after the record is written');
});

fs.renameSync(TMP, FILE);
console.log('patch539 written, ' + grew + ' bytes');
