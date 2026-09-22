/* A CHANGE THE SERVER HAS NOT GOT STOPS CLAIMING IT HAS.

   patch522 made the pull keep a record with unsent work. That protection
   is keyed on synced:false, and only one path ever wrote it after a change
   that did not reach the server: setTraitStatus, inside a group, after a
   failed upload. Measured 2026-09-22 on a personal page: change a trait's
   status, press Load from cloud, and the status is back to what the server
   had, with "Loaded 0 items". The record still said synced:true, because
   cloudMoveOne answers null on a personal page before doing anything, and
   the honesty block in setTraitStatus was guarded on activeWs. The same
   holds for a layer rename (retagLayer), Sort by inventory (sortApply), a
   rarity change (setRarity: "nogroup clears nothing either: there was
   never anything to be behind" - there was, the personal collection on
   the server), a shelf move and a bulk move (cloudSaveShelfPlan answers
   ok:true on a personal page having sent nothing).

   The rule, in one place per chokepoint: a record that claims to be on the
   server, changed here and not sent - because there is no group, or
   because the send failed - is marked unsent, and its stored path goes
   with it because that path describes the server's old object. Save to
   cloud then sends it and the pull leaves it alone until then. On a
   personal page that means Save to cloud re-uploads a trait whose only
   change was its order or its weight; that is what a personal page has
   always done for an edit, and it is the honest cost of not losing the
   change to the next Load.

   cloudMoveOne marks on both of its null paths, which covers
   setTraitStatus, retagLayer, sortApply and the editor's move. The block
   in setTraitStatus is superseded by it. setRarity marks on "nogroup" as
   it did on "unreachable"; "refused" still does not, for the reason its
   comment gives. cloudSaveShelfPlan marks every record in the plan when
   there is no group or the send failed; commitShelfMove rolls its records
   back to the originals on failure, which overwrites the mark with the
   truth, and bulkMoveToLayer keeps them, marked. */
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

/* ---- 1. the helper, and the cloud move marks on both null paths --------- */
{
  const fn = kit.inFunction(L, 'async function cloudMoveOne(oldRec,newRec,why){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* A RECORD THAT CLAIMS TO BE ON THE SERVER AND IS NOT. Changed here and',
    '   not sent - no group, or the send failed - it drops the claim, and the',
    '   stored path with it, because that path describes the server\'s old',
    '   object. The pull then leaves it alone (patch522) and Save to cloud',
    '   sends it. Nothing to do for a record that never claimed. */',
    'async function markUnsent(rec){',
    '  if(!rec||!rec.id) return;',
    '  let stored=null; try{ stored=await dbGet(rec.id); }catch(_){ stored=null; }',
    '  if(!stored || !(stored.synced||stored.path)) return;',
    '  const honest=Object.assign({},stored,{synced:false});',
    '  delete honest.path;',
    '  try{ await dbPut(honest); }catch(_){}',
    '}',
    'async function cloudMoveOne(oldRec,newRec,why){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudMoveOne(oldRec,newRec,why){');
  swap('  if(!activeWs) return null;', [
    '  /* No group means nothing was sent, and on a personal page the record',
    '     still describes a row the personal collection holds the old way. */',
    '  if(!activeWs){ await markUnsent(newRec); return null; }',
  ], 'no group', fn);
  swap('  if(!arrived) return null;', [
    '  if(!arrived){ await markUnsent(newRec); return null; }',
  ], 'not arrived', fn);
}

/* ---- 2. setTraitStatus\'s own block is superseded ------------------------ */
{
  const fn = kit.inFunction(L, 'async function setTraitStatus(t,next){');
  const i = at('  if(activeWs && !shared){', 'the honesty block', fn);
  const want = [
    '  if(activeWs && !shared){',
    '    let stored=null; try{ stored=await dbGet(moved.id); }catch(_){}',
    '    if(stored && (stored.synced||stored.path)){',
    '      const honest=Object.assign({},stored,{synced:false});',
    '      delete honest.path;',
    '      try{ await dbPut(honest); }catch(_){}',
    '    }',
    '  }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the honesty block is not as expected at +' + k);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '  /* SUPERSEDED (patch525): cloudMoveOne does this itself, on both of its',
    '     null paths, for every caller - and for a personal page, which the',
    '     guard on activeWs here left out. Measured: a status change on a',
    '     personal page kept synced:true and Load from cloud put it back. */',
  ]);
}

/* ---- 3. a rarity change with no group to send it to ---------------------- */
{
  const fn = kit.inFunction(L, 'async function setRarity(rec,w){');
  swap('  if(sent==="unreachable" && next.rowId && next.synced) await dbPut({...next, synced:false});', [
    '  /* AND "nogroup" TOO, superseding the sentence above: on a personal page',
    '     there IS something to be behind - the personal collection on the',
    '     server - and Load from cloud took its weight back over this one',
    '     (measured 2026-09-22). A record with no rowId was never up there and',
    '     synced is already false on it. "refused" stays as it is. */',
    '  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced) await dbPut({...next, synced:false});',
  ], 'the rarity mark', fn);
}

/* ---- 4. a shelf plan that was not sent ------------------------------------ */
swap('async function cloudSaveShelfPlan(updates){', ['async function cloudSendShelfPlan(updates){'], 'the plan sender');
{
  const fn = kit.inFunction(L, 'async function cloudSendShelfPlan(updates){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* THE SEND, AND THEN THE TRUTH ABOUT IT. On a personal page the send is',
    '   skipped and answers ok - nothing was meant to go - but the records now',
    '   describe an order the personal collection on the server does not have,',
    '   and Load from cloud took the server\'s back over them (measured',
    '   2026-09-22). Marked unsent then, and on a failed send. commitShelfMove',
    '   rolls its records back to the originals on failure, which overwrites',
    '   the mark with the truth; bulkMoveToLayer keeps them, marked. */',
    'async function cloudSaveShelfPlan(updates){',
    '  const r=await cloudSendShelfPlan(updates);',
    '  if(!activeWs || !(r&&r.ok)) for(const u of (updates||[])) await markUnsent(u&&u.record);',
    '  return r;',
    '}',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('async function markUnsent(rec){');
  once('if(!activeWs){ await markUnsent(newRec); return null; }');
  once('if(!arrived){ await markUnsent(newRec); return null; }');
  once('await markUnsent(u&&u.record);');
  once('markUnsent(', 4);
  once('async function cloudSendShelfPlan(updates){');
  once('async function cloudSaveShelfPlan(updates){');
  once('const r=await cloudSendShelfPlan(updates);');
  once('cloudSendShelfPlan(', 2);
  once('(sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced');
  /* The old block is gone from setTraitStatus, and its one remaining
     dbGet(moved.id) is the freshKey read. */
  const a = code.indexOf('async function setTraitStatus(t,next){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  if (body.indexOf('synced:false') >= 0) throw new Error('setTraitStatus still marks on its own');
  if ((body.match(/dbGet\(moved\.id\)/g) || []).length !== 1) throw new Error('setTraitStatus reads moved.id an unexpected number of times');
  /* The two callers of the plan still call the wrapper by its old name. */
  once('await cloudSaveShelfPlan(', 2);
});

fs.renameSync(TMP, FILE);
console.log('patch525 written, ' + grew + ' bytes');
