/* ONE RECORD IS READ AS ONE RECORD.

   Three places read the whole store to find a record by id: opening a
   trait, to ask whether it has a newer draft - on every open; the restore
   offer at start-up; and picking a saved base. dbGet asks the store for
   the one id and answers null for a missing one, which is what the find
   answered, so each is the same question at the cost of one record.

   With those gone, an open still read the whole store once: startEditor
   refills the base picker from it. That list is refilled now only when
   something has been written since. */
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

swap('      const got=(await dbAll()).find(i=>i.id===draftKey(t.id));', [
  '      /* The one record: this read the whole project on every open. */',
  '      const got=await dbGet(draftKey(t.id));',
], 'the draft on open');
swap('  try{ rec=(await dbAll()).find(i=>i.id===AUTO_ID); }catch(_){}', [
  '  try{ rec=await dbGet(AUTO_ID); }catch(_){}',
], 'the restore offer');
swap('  try{ rec=(await dbAll()).find(i=>i.id===id); }catch(_){}', [
  '  try{ rec=await dbGet(id); }catch(_){}',
], 'the base picker');

/* AND THE BASE LIST, which startEditor refills on every open by reading
   the whole store for the bases in it. The list changes only when the
   store does, so it is refilled only when something has been written - in
   this project: a switch to another project's store writes nothing here. */
{
  const i = at('async function fillBasePicker(){', 'the base list');
  if (L[i + 1] !== '  const sel=$("basepick"); const keep=sel.value;') throw new Error('the base list moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '/* What the list was filled from: the project and its last write. */',
    'let basePickerFrom="";',
    'async function fillBasePicker(){',
    '  const sel=$("basepick"); const keep=sel.value;',
    '  /* Nothing written since the last fill: the list is what it was, and this',
    '     read the whole project on every trait open to find that out. */',
    '  const from=wsDbName()+"|"+touchSeq;',
    '  if(from===basePickerFrom && sel.options.length) return;',
    '  basePickerFrom=from;',
  ]);
}

kit.save(doc, ({ code }) => {
  if (/\(await dbAll\(\)\)\.find\(i=>i\.id===/.test(code)) throw new Error('a whole-store read for one id is left');
});
fs.renameSync(TMP, FILE);
console.log('patch577 written');
