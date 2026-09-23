/* A SORT ON YOUR OWN PAGE SURVIVES LOAD FROM CLOUD.

   Found 2026-09-22 by the discovery pass, ranked eighth of 39, reproduced
   by a finder and a verifier. sortApply moves traits to the layers a sort
   file names by spreading the old record into a new one - synced:true,
   rowId and the old path come with it - and called cloudMoveOne only
   inside a group: `if(activeWs&&!await cloudMoveOne(old,rec)) stranded++`.
   cloudMoveOne is where patch525 marks a move the server has not got as
   unsent, and it does so precisely when there is no group. So on your own
   page a sorted trait still claimed to be on the server, the next Load
   from cloud matched its row by id and took the server's layer back, and
   the following Save had nothing to send: the sort was gone for good. The
   other three callers of cloudMoveOne carry no such guard; this was the
   one that did.

   It is called unconditionally now, as retagLayer does, and only a failure
   inside a group counts as stranded.

   Two more lines on the same path. A sort stamped every moved trait's `at`
   with the moment of the sort, and `at` is what the final project page's
   "edited ..." strip and the Last edited list read - filing a trait is not
   editing it, the rule patch523 states for the final page's own moves. The
   old stamp is kept. And the pull's note said "changed in place by the
   group" on a page with no group; it says "on the server" there. */
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
const fnR = () => kit.inFunction(L, 'async function sortApply(plan){');

swap('    const rec={...old, id:id, name:r.toName, layer:r.toLayer, at:Date.now()};', [
  '    /* `at` is kept: it is when the trait was last EDITED, which the final',
  '       page and the Last edited list read, and a sort is filing. */',
  '    const rec={...old, id:id, name:r.toName, layer:r.toLayer};',
], 'the moved record', fnR());
swap('      if(activeWs&&!await cloudMoveOne(old,rec)) stranded++;', [
  '      /* ALWAYS, as retagLayer calls it: on your own page this is what marks',
  '         the move as not yet sent (patch525), and skipping it let the next',
  '         Load from cloud put the old layer back (measured). */',
  '      const shared=await cloudMoveOne(old,rec);',
  '      if(activeWs&&!shared) stranded++;',
], 'the move', fnR());
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('  if(repaired) bits.push(repaired+" changed in place by the group");', [
    '  if(repaired) bits.push(repaired+" changed in place "+(activeWs?"by the group":"on the server"));',
  ], 'the pull note', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const a = code.indexOf('async function sortApply(plan){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  if (body.indexOf('activeWs&&!await cloudMoveOne') >= 0) throw new Error('the guard is still there');
  if (body.indexOf('const shared=await cloudMoveOne(old,rec);') < 0) throw new Error('the move is not sent');
  if (body.indexOf('at:Date.now()') >= 0) throw new Error('a sort still restamps the edit time');
  if (code.indexOf('changed in place "+(activeWs?"by the group":"on the server")') < 0) throw new Error('the note still says group');
});

fs.renameSync(TMP, FILE);
console.log('patch537 written, ' + grew + ' bytes');
