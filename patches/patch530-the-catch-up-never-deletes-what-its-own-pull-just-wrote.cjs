/* THE CATCH-UP NEVER DELETES WHAT ITS OWN PULL JUST WROTE.

   A regression from ec67915, found 2026-09-22 by a finder in the discovery
   pass and confirmed here before the fix.

   ec67915 moved groupCatchUp's read of the store to BEFORE the pull, so the
   deletion pass would not delete a record the person made while the pull
   ran. Right about that, and wrong about the other thing that happens while
   the pull runs: the pull itself rewrites records. A teammate's save always
   arrives as a NEW server row (cloudSyncOne deletes the row and inserts
   one), and the pull downloads it over the same local id with the new
   rowId. The deletion pass then walked the pre-pull snapshot, asked whether
   the OLD rowId was on the server - it is not, it was replaced - and deleted
   the record the pull had just written. The note said "1 updated by the
   group", the toast said "1 removed by someone else", the trait was gone
   from the shelf and the final page, and the next reload downloaded it
   again as new. Every trait a teammate re-saved, on every open.

   The rule the deletion pass needs is the one patch526 gave the pull: act
   only on what you saw. The sequence of the touch log is taken before the
   store is read, and a record touched since - by the pull (it matched a
   server row, so it is on the server) or by the person (it is theirs, sent
   or not) - is never deleted. What is left is exactly what the pull did not
   touch and the server did not name: removed by somebody. */
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
const fnR = () => kit.inFunction(L, 'async function groupCatchUp(){');

swap('    const mine=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&i.synced);', [
  '    /* AND NOTHING THE PULL ITSELF WROTE. A teammate\'s save arrives as a new',
  '       row, and the pull downloads it over the same local id with the new',
  '       rowId - so the snapshot\'s copy still names the old row, which the',
  '       server no longer has. Judged on that, the record the pull had just',
  '       written was deleted as "removed by someone else" (measured, a',
  '       regression from ec67915). Anything touched after this point - by',
  '       the pull, which only writes rows the server holds, or by the',
  '       person - is left alone. */',
  '    const seq0=touchSeq;',
  '    const mine=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&i.synced);',
], 'the snapshot', fnR());
swap('          if(onServer.has(shelfCore.recordKey(it))) continue;', [
  '          if(touchedSince(it.id,seq0)) continue;',
  '          if(onServer.has(shelfCore.recordKey(it))) continue;',
], 'the deletion test', fnR());

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('const seq0=touchSeq;');
  once('if(touchedSince(it.id,seq0)) continue;');
  const g = code.indexOf('async function groupCatchUp(){'), ge = code.indexOf('\n}', g);
  const body = code.slice(g, ge);
  if (!(body.indexOf('const seq0=touchSeq;') < body.indexOf('const mine=') && body.indexOf('const mine=') < body.indexOf('await cloudPull('))) throw new Error('the sequence is not taken before the snapshot, before the pull');
  if (body.indexOf('touchedSince(it.id,seq0)') > body.indexOf('await dbDel(it.id)')) throw new Error('the guard is after the delete');
});

fs.renameSync(TMP, FILE);
console.log('patch530 written, ' + grew + ' bytes');
