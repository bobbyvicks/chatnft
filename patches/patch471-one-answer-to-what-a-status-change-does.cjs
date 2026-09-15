/* ONE ANSWER TO WHAT A STATUS CHANGE DOES.

   Changing a trait's status rewrites its local id, and by now six things have
   to follow it: the record itself, the unsaved draft, the hidden key, the
   picked key, the group's copy, and then BOTH keys again because the upload
   gives the record a new row id. Three commits went into getting that right -
   463 for the draft, 469 for the pick and the hidden set - and all of it lives
   inline in one shelf tile's onclick.

   A second caller is about to exist. Written twice, the two copies would agree
   today and drift on the next thing that has to follow a trait, which is
   exactly the failure those three commits were about. So it moves into a
   function and the tile calls it.

   A PURE EXTRACTION. The body is the same statements in the same order; what
   changes is that the answer is returned rather than toasted, because the tile
   and the page that is coming want to say different things about it. The tile
   says what it always said.

   `visibility` inside the tile was a local from currentShelfVisibility(); the
   function calls that itself, which returns the same object for the same
   project - it is a per-project map, not a per-render value. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the function, next to the other things that move a trait ---- */
{
  /* BEFORE the note on pickTransfer, not ten lines up from the function -
     that landed inside the comment and split it in half, and kit.save caught
     the result refusing to parse. */
  const at = kit.only(L, l => l === '/* THE PICK FOLLOWS THE TRAIT. shelfPick holds record keys, and the render',
    'the note on the pick transfer');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT HAPPENS WHEN THE STATUS OF A TRAIT CHANGES.',
    '',
    '   The id is built from name, layer and status, so a status change is an id',
    '   change, and by now six things have to follow it. Written out at the one',
    '   call site it used to have, a second caller would mean two copies that',
    '   agree today and drift on the next thing added to the list.',
    '',
    '   RETURNS rather than says. The shelf tile and the final-set page want to',
    '   report different things about the same event, and a function that toasts',
    '   is a function only one of them can use. */',
    'async function setTraitStatus(t,next){',
    '  if(!t||!next) return {ok:false};',
    '  if(String(t.status||"wip")===String(next)) return {ok:true, moved:t, shared:null, same:true};',
    '  const moved={...t, id:"t_"+t.name+"_"+t.layer+"_"+next, status:next};',
    '  /* REFUSE, do not overwrite. This used to dbDel the old record and dbPut',
    '     over whatever held the new id, destroying its artwork and rarity and',
    '     reporting success. planShelfMove already refuses a clash and names it;',
    '     this does the same rather than renaming, because the person is setting a',
    '     status deliberately and gold-2 is not what they asked for. */',
    '  if(await idHolder(moved.id,t.id)) return {ok:false, clash:true};',
    '  const visibility=currentShelfVisibility();',
    '  const key=shelfCore.recordKey(t);',
    '  await dbDel(t.id);',
    '  await dbPut(moved);',
    '  const movedKey=shelfCore.recordKey(moved);',
    '  visibility.transfer(key,movedKey);',
    '  /* And the selection, for the same reason and at the same moment. */',
    '  pickTransfer(key,movedKey);',
    '  /* And the unsaved work, which used to be the one id-keyed thing this did',
    '     not carry - the line above has always carried the other. */',
    '  await draftsFollow([{from:t.id, to:moved.id}]);',
    '  const shared=await cloudMoveOne(t,moved);',
    '  /* AND AGAIN, BECAUSE THE ROW ID MOVED UNDERNEATH BOTH KEYS. A move inside',
    '     a group uploads the trait as a NEW row and writes the id the insert',
    '     returned back onto the local record - so for a synced trait the key just',
    '     transferred TO is already stale, and the next render drops both entries',
    '     as naming nothing. Hide a trait, press its chip, and it came back. */',
    '  if(shared){',
    '    let now=null; try{ now=await dbGet(moved.id); }catch(_){}',
    '    const freshKey=now?shelfCore.recordKey(now):null;',
    '    if(freshKey&&freshKey!==movedKey){',
    '      visibility.transfer(movedKey,freshKey);',
    '      pickTransfer(movedKey,freshKey);',
    '    }',
    '  }',
    '  return {ok:true, moved, shared};',
    '}',
    '/* The order the states happen in, and the one place that says so. */',
    'const STATUS_CYCLE=["wip","approved","stfp","rejected"];',
    'function nextStatus(st){',
    '  /* STATUS_CYCLE.length, not 3: a fifth state with a hard-coded number is a',
    '     state the cycle can never reach. */',
    '  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(String(st||"wip"))+1)%STATUS_CYCLE.length];',
    '}',
    '',
    L[at],
  ]);
}

/* ---- and the tile calls it ---- */
{
  const at = kit.only(L, l => l === "      cyc.onclick=async ev=>{ ev.stopPropagation();", 'the status chip handler');
  const end = kit.only(L, l => l === "          : t.name+' -> '+next); };", 'the status chip tail');
  if (end <= at) throw new Error('the status chip is not shaped the way this expects');
  kit.replace(L, { start: at, end: end }, [
    '      cyc.onclick=async ev=>{ ev.stopPropagation();',
    '        const next=nextStatus(t.status);',
    '        /* EVERYTHING THIS USED TO DO IS IN setTraitStatus, unchanged and in',
    '           the same order - the record, the draft, the hidden key, the picked',
    '           key, the group, and both keys again after the upload. It is a',
    '           function because the final-set page calls it too, and two copies',
    '           of that list would drift on the next thing added to it. */',
    '        const r=await setTraitStatus(t,next);',
    '        if(r.clash){',
    '          toast("There is already "+article(next)+" "+t.name+" in "+(t.layer||"unsorted")',
    '            +" - rename one of them first");',
    '          return;',
    '        }',
    '        if(!r.ok) return;',
    '        renderShelf();',
    '        /* The result was discarded once, so a move the group never received',
    '           still said "hat -> approved". */',
    '        toast(activeWs && !r.shared',
    "          ? t.name+' -> '+next+' here only - the group still has the old one'",
    "          : t.name+' -> '+next); };",
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE FUNCTION DOES EVERY STEP, named one at a time. A count would pass with
     one step written twice and another missing, and the missing one is
     somebody's unsaved drawing. */
  const ss = kit.inFunction(codeLines, 'async function setTraitStatus(t,next){');
  const ssb = codeLines.slice(ss.start, ss.end + 1).join('\n');
  for (const [needle, why] of [
    ['if(await idHolder(moved.id,t.id)) return {ok:false, clash:true};', 'it would overwrite a clash'],
    ['await dbDel(t.id);', 'the old record stays'],
    ['await dbPut(moved);', 'the new record is never written'],
    ['visibility.transfer(key,movedKey);', 'a hidden trait comes back'],
    ['pickTransfer(key,movedKey);', 'a picked trait is dropped from the selection'],
    ['await draftsFollow([{from:t.id, to:moved.id}]);', 'the unsaved drawing is orphaned'],
    ['const shared=await cloudMoveOne(t,moved);', 'the group never hears about it'],
    ['visibility.transfer(movedKey,freshKey);', 'a hidden synced trait comes back after the upload'],
    ['pickTransfer(movedKey,freshKey);', 'a picked synced trait is dropped after the upload'],
  ]) {
    if (ssb.indexOf(needle) < 0)
      throw new Error('setTraitStatus is missing a step, so ' + why + ' (' + needle + ')');
  }
  /* AND THE ORDER IS THE ORDER IT WAS. The re-transfer must come after the
     upload that invalidates the key, and the draft must move while the old id
     still names something. */
  if (ssb.indexOf('await draftsFollow(') > ssb.indexOf('const shared=await cloudMoveOne('))
    throw new Error('the draft is carried after the upload rather than before');
  if (ssb.indexOf('visibility.transfer(movedKey,freshKey);') < ssb.indexOf('const shared=await cloudMoveOne('))
    throw new Error('the keys are re-carried before the upload that moves them');

  /* AND THE TILE HAS NO SECOND COPY OF IT. */
  if ((code.match(/await draftsFollow\(\[\{from:t\.id, to:moved\.id\}\]\);/g) || []).length !== 1)
    throw new Error('there are two copies of the status-change steps again');
  if (!/const r=await setTraitStatus\(t,next\);/.test(code))
    throw new Error('the status chip does not go through the one function');
  if (!/const next=nextStatus\(t\.status\);/.test(code))
    throw new Error('the chip works out the next status its own way');
  /* The cycle is named once. */
  if ((code.match(/"wip","approved","stfp","rejected"/g) || []).length !== 1)
    throw new Error('the order of the statuses is written down in more than one place');
  /* And the chip still says what it always said, including the group half. */
  if (!/toast\(activeWs && !r\.shared/.test(code))
    throw new Error('a move the group never received no longer says so');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
