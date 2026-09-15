/* TWO MORE THINGS KEYED TO A TRAIT THAT DID NOT FOLLOW IT.

   Same family as 463, which made the unsaved draft follow. The key here is
   recordKey - rowId || id - and two sets are keyed by it: the hidden set and
   the pick set.

   ONE: THE STATUS CHIP DROPS THE TILE OUT OF THE SELECTION, AND THE NEXT BULK
   MOVE QUIETLY SKIPS IT.

   The chip rewrites the local id, and the render that follows deletes any pick
   whose key names no live trait:

     for(const k of [...shelfPick]) if(!live.has(k)) shelfPick.delete(k);

   That purge is right for a trait that is gone. A status change is the same
   trait under a new key, and the file already tells those two apart for the
   HIDDEN set - there is a transfer at every id-changing site, and a comment at
   the one in saveTrait saying "The status chip, the drag and the bulk move all
   transfer it; this did not." The pick set had a transfer at none of them.

   Measured: pick two tiles, press the chip on one. The bar drops to "1 picked"
   and Move moves one trait. In the pass this feature exists for - pick a batch
   out of unsorted, fix a status you noticed on the way, then Move - one trait
   is left behind. bulkMoveToLayer goes out of its way to NAME the traits it
   refuses ("Moving thirty and quietly keeping four is how a collection ships
   four traits short"), but a trait dropped from the selection before the move
   never reaches that path: not refused, not named, not moved.

   SCOPED, because recordKey is rowId || id: a trait backed by a server row
   keeps its key when the local id changes, so the pick survives already. This
   is every trait in a personal project, and every unsynced trait in a group.

   TWO: AND IN A GROUP PROJECT, THE CHIP UN-HIDES A HIDDEN TRAIT.

   The mirror image, in the case the first one excludes. For a synced trait the
   key IS the rowId, so the transfer on the chip is a no-op from the old rowId
   to itself - correct at that instant. Then cloudMoveOne uploads the trait as
   a NEW row and cloudSyncOne writes the record back with the id the insert
   returned. By the time renderShelf runs, the record's key is a rowId the
   hidden set has never heard of, and the same kind of purge discards it:

     for(const key of visibility.hiddenKeys()) if(!liveTraitKeys.has(key)) visibility.show(key);

   So: hide a synced trait, press Show hidden, press its chip - and once the
   upload lands the card is back on the shelf and the Show hidden count has
   fallen, with nothing having asked for it. It is the exact defect
   hiddenrename.spec.js was written to prevent, surviving in the case that
   file's seed excludes.

   Both keys are moved again after the upload, from what the record said then
   to what it says now. Read with a keyed get rather than dbAll, which would
   read every picture in the project to find one record.

   NOT IN bulkMoveToLayer, which transfers the hidden key and then calls
   shelfPick.clear() - the selection is deliberately spent by the move it just
   performed, so a pick transfer there would be re-adding something the user is
   done with. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- one record by key, without reading the project ---- */
{
  const at = kit.only(L, l => l === 'async function dbAll(){ const d=await db(); return new Promise((res,rej)=>{',
    'the read-everything helper');
  kit.replace(L, { start: at - 1, end: at - 1 }, [
    L[at - 1],
    '/* ONE RECORD, BY KEY. dbAll reads every row in the project including every',
    '   picture, and several places wanted a single record and paid that price -',
    '   which at 324 traits and 1.5 GB of blobs is the whole collection to answer',
    '   a question about one of them. */',
    'async function dbGet(id){ const d=await db(); return new Promise((res,rej)=>{',
    '  const t=d.transaction(STORE,\'readonly\'), q=t.objectStore(STORE).get(id);',
    '  q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); }',
  ]);
}

/* ---- the pick follows the trait, the way the hidden set already does ---- */
{
  const at = kit.only(L, l => l === 'let shelfPick=new Set();', 'the pick set');
  kit.replace(L, { start: at, end: at }, [
    'let shelfPick=new Set();',
    '/* THE PICK FOLLOWS THE TRAIT. shelfPick holds record keys, and the render',
    '   deletes any key with no live trait behind it - which is right for a trait',
    '   that is gone and wrong for the same trait under a new key. The hidden set',
    '   has a transfer at every site that re-ids a record; this had none, so',
    '   pressing a status chip on a picked tile dropped it from the selection and',
    '   the next Move skipped it without naming it.',
    '',
    '   Mirrors visibility.transfer, including returning early when there is',
    '   nothing at the old key - a trait that was not picked must not become',
    '   picked by being moved. */',
    'function pickTransfer(from,to){',
    '  if(!from||!to||from===to) return false;',
    '  if(!shelfPick.has(from)) return false;',
    '  shelfPick.delete(from); shelfPick.add(to);',
    '  return true;',
    '}',
  ]);
}
{
  const at = kit.only(L, l => l === '        visibility.transfer(key,shelfCore.recordKey(moved));',
    'the chip visibility transfer');
  kit.replace(L, { start: at, end: at }, [
    '        const movedKey=shelfCore.recordKey(moved);',
    '        visibility.transfer(key,movedKey);',
    '        /* And the selection, for the same reason and at the same moment. */',
    '        pickTransfer(key,movedKey);',
  ]);
}
{
  const at = kit.only(L, l => l === '        const shared=await cloudMoveOne(t,moved);',
    'the chip cloud move');
  if (L[at + 1] !== '        renderShelf();')
    throw new Error('the chip is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '        const shared=await cloudMoveOne(t,moved);',
    '        /* AND AGAIN, BECAUSE THE ROW ID MOVED UNDERNEATH BOTH KEYS. A move',
    '           inside a group uploads the trait as a NEW row and writes the id',
    '           the insert returned back onto the local record - so for a synced',
    '           trait the key this just transferred TO is already stale, and the',
    '           render below drops both entries as naming nothing. Hide a trait,',
    '           press its chip, and it came back onto the shelf. */',
    '        if(shared){',
    '          let now=null; try{ now=await dbGet(moved.id); }catch(_){}',
    '          const freshKey=now?shelfCore.recordKey(now):null;',
    '          if(freshKey&&freshKey!==movedKey){',
    '            visibility.transfer(movedKey,freshKey);',
    '            pickTransfer(movedKey,freshKey);',
    '          }',
    '        }',
  ]);
}
{
  const at = kit.only(L, l => l === '  for(const update of plan.updates) state.transfer(update.oldKey,shelfCore.recordKey(update.record));',
    'the shelf move visibility transfer');
  kit.replace(L, { start: at, end: at }, [
    '  for(const update of plan.updates) state.transfer(update.oldKey,shelfCore.recordKey(update.record));',
    '  /* The selection survives a drag too: a cross-layer move rewrites the local',
    '     id, and dragging one card out of a picked batch used to unpick it. */',
    '  for(const update of plan.updates) pickTransfer(update.oldKey,shelfCore.recordKey(update.record));',
  ]);
}
{
  const at = kit.only(L, l => l === '      try{ currentShelfVisibility().transfer(',
    'the editor save visibility transfer');
  if (L[at + 1] !== '        shelfCore.recordKey(openWas), shelfCore.recordKey(rec)); }catch(_){}')
    throw new Error('the editor save transfer is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '      try{ currentShelfVisibility().transfer(',
    '        shelfCore.recordKey(openWas), shelfCore.recordKey(rec)); }catch(_){}',
    '      /* And the pick, which the note above is about too - renaming an open',
    '         trait re-ids it exactly as the chip does. */',
    '      pickTransfer(shelfCore.recordKey(openWas), shelfCore.recordKey(rec));',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE PICK MOVES AT EVERY SITE THE HIDDEN SET DOES, except the one that
     spends the selection. Named one at a time: a count would pass with one
     site covered twice. */
  if (!/function pickTransfer\(from,to\)\{/.test(code))
    throw new Error('there is nothing to carry a pick across an id change');
  /* It must REFUSE when nothing was picked, or moving a trait would select it. */
  if (!/if\(!shelfPick\.has\(from\)\) return false;/.test(code))
    throw new Error('moving an unpicked trait would pick it');
  const cy = code.indexOf('pickTransfer(key,movedKey);');
  if (cy < 0) throw new Error('the status chip does not carry the pick');
  const cs = kit.inFunction(codeLines, 'async function commitShelfMove(spec){');
  if (!/pickTransfer\(update\.oldKey,shelfCore\.recordKey\(update\.record\)\)/
    .test(codeLines.slice(cs.start, cs.end + 1).join('\n')))
    throw new Error('a cross-layer drag does not carry the pick');
  const st = kit.inFunction(codeLines, 'async function saveTrait(){');
  if (!/pickTransfer\(shelfCore\.recordKey\(openWas\), shelfCore\.recordKey\(rec\)\);/
    .test(codeLines.slice(st.start, st.end + 1).join('\n')))
    throw new Error('renaming a trait in the editor does not carry the pick');
  /* AND NOT in the bulk move, which clears the selection on purpose. */
  const bm = kit.inFunction(codeLines, 'async function bulkMoveToLayer(toLayer){');
  const bmb = codeLines.slice(bm.start, bm.end + 1).join('\n');
  if (/pickTransfer\(/.test(bmb))
    throw new Error('the bulk move re-adds a selection it deliberately spends');
  if (!/shelfPick\.clear\(\);/.test(bmb))
    throw new Error('the bulk move no longer spends the selection, so the rule above changed');

  /* AND BOTH KEYS MOVE AGAIN AFTER AN UPLOAD, which is the group half. */
  if (!/if\(shared\)\{\n          let now=null; try\{ now=await dbGet\(moved\.id\); \}catch\(_\)\{\}/.test(code))
    throw new Error('a move inside a group still leaves both keys on a dead row id');
  if (!/visibility\.transfer\(movedKey,freshKey\);\n            pickTransfer\(movedKey,freshKey\);/.test(code))
    throw new Error('only one of the two sets is carried across the new row id');
  /* By key, not by reading the project: dbAll here is 324 pictures to answer a
     question about one record. */
  if (!/async function dbGet\(id\)\{/.test(code))
    throw new Error('there is no keyed read, so this had to scan the project');
  const chip = code.slice(code.indexOf('const shared=await cloudMoveOne(t,moved);'));
  if (/dbAll\(\)/.test(chip.slice(0, 600)))
    throw new Error('the chip reads every picture in the project to find one record');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
