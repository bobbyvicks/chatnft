/* A DROP ON YOUR OWN PAGE IS ONE WRITE, AND A REFUSED DRAG SAYS WHY.

   Found 2026-09-22 by the discovery pass, ranked twenty-eighth of 39. A
   drop renumbers the whole layer, and on your own page it then marked every
   renumbered record unsent one at a time - a read and a write each, awaited
   in turn - while still holding shelfMoveBusy. 39 hats was 78 store round
   trips after the shelf had already been redrawn. A drag started in that
   window was refused by startShelfDrag with nothing on screen, so at phone
   speed the handle looked dead for 6-17 s.

   On your own page the records are marked in the same transaction that
   writes the new order (unsentOf, the rule markUnsent applies, taken out so
   both use it), and cloudSaveShelfPlan is told they are marked. In a group
   nothing changes: the move holds the lock until the group has answered,
   because a refusal rolls the move back and a second move must not be
   rolled back with it.

   A drag refused while a move is finishing says so, as the keyboard path
   and the final page's controls already did. */
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

/* ---- the rule, taken out of markUnsent --------------------------------- */
{
  const fn = kit.inFunction(L, 'async function markUnsent(rec){');
  const want0 = [
    'async function markUnsent(rec){',
    '  if(!rec||!rec.id) return;',
    '  let stored=null; try{ stored=await dbGet(rec.id); }catch(_){ stored=null; }',
    '  if(!stored || !(stored.synced||stored.path)) return;',
    '  const honest=Object.assign({},stored,{synced:false});',
  ];
  for (let k = 0; k < want0.length; k++) if (L[fn.start + k] !== want0[k]) throw new Error('markUnsent moved at +' + k);
  const endWant = [
    '  if(stored.path && String(stored.path).slice(-cloudTail(stored).length)===cloudTail(stored)) honest.unsent="meta";',
    '  else { delete honest.path; delete honest.unsent; }',
    '  try{ await dbPut(honest); }catch(_){}',
    '}',
  ];
  for (let k = 0; k < endWant.length; k++) if (L[fn.end - endWant.length + 1 + k] !== endWant[k]) throw new Error('markUnsent end moved at +' + k);
  const comment = L.slice(fn.start + 5, fn.end - 3);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* What a record looks like once it is marked as not yet sent: the rule',
    '   markUnsent applies, without the store round trip, so a caller holding',
    '   fresh records can write them marked in its own transaction. A record',
    '   that was never on the server comes back as it was. */',
    'function unsentOf(stored){',
    '  if(!stored || !(stored.synced||stored.path)) return stored;',
    '  const honest=Object.assign({},stored,{synced:false});',
    ...comment,
    '  if(stored.path && String(stored.path).slice(-cloudTail(stored).length)===cloudTail(stored)) honest.unsent="meta";',
    '  else { delete honest.path; delete honest.unsent; }',
    '  return honest;',
    '}',
    'async function markUnsent(rec){',
    '  if(!rec||!rec.id) return;',
    '  let stored=null; try{ stored=await dbGet(rec.id); }catch(_){ stored=null; }',
    '  if(!stored || !(stored.synced||stored.path)) return;',
    '  try{ await dbPut(unsentOf(stored)); }catch(_){}',
    '}',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudSaveShelfPlan(updates){');
  if (fn.end - fn.start !== 4) throw new Error('cloudSaveShelfPlan changed');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* marked: the caller wrote these records already marked unsent (a drop on',
    '   your own page does, in the same transaction), so nothing is left to do',
    '   here unless a group refused them. */',
    'async function cloudSaveShelfPlan(updates,marked){',
    '  const r=await cloudSendShelfPlan(updates);',
    '  if(marked && !activeWs) return r;',
    '  if(!activeWs || !(r&&r.ok)) for(const u of (updates||[])) await markUnsent(u&&u.record);',
    '  return r;',
    '}',
  ]);
}

/* ---- the drop -------------------------------------------------------------- */
{
  const fnR = () => kit.inFunction(L, 'async function commitShelfMove(spec){');
  swap('    await dbApplyShelfRecords(plan.updates.map(update=>update.oldId),plan.updates.map(update=>update.record));', [
    '    /* ON YOUR OWN PAGE, WRITTEN ALREADY MARKED. They were marked one read',
    '       and one write at a time after the redraw, holding the lock: 78 round',
    '       trips for 39 hats, with every drag refused meanwhile. */',
    '    await dbApplyShelfRecords(plan.updates.map(update=>update.oldId),',
    '      plan.updates.map(update=>activeWs?update.record:unsentOf(update.record)));',
  ], 'the order write', fnR());
  swap('  const shared=await cloudSaveShelfPlan(plan.updates);', [
    '  const shared=await cloudSaveShelfPlan(plan.updates,true);',
  ], 'the save', fnR());
}
swap('  if(shelfMoveBusy||event.button>0) return;', [
  '  if(event.button>0) return;',
  '  /* Said, as the keyboard and the final page say it. A drag refused with',
  '     nothing on screen reads as a handle that is broken. */',
  '  if(shelfMoveBusy){ toast("Still moving the last one"); return; }',
], 'the drag gate');

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('function unsentOf(stored){') !== 1) throw new Error('unsentOf');
  if (times('unsentOf(') !== 3) throw new Error('unsentOf uses: ' + times('unsentOf('));
  if (times('cloudSaveShelfPlan(plan.updates,true)') !== 1) throw new Error('the save is not told');
});

fs.renameSync(TMP, FILE);
console.log('patch555 written, ' + grew + ' bytes');
