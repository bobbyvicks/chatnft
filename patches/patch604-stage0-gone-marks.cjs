/* STAGE 0, PART 5 OF 7: EVERY REMOVAL AND EVERY MOVE'S DROP, RECORDED.

   Design D1: "Deletes and moves: each is recorded in settings.gone, marked
   as a person's removal or a move's drop, with the row it moved to." B1's
   straggler pass pairs an old tab's renames "through the move marks stage 0
   writes", and D2's table asks about a person's removal of a live row.

   RECORDED IN settings.gonemarks, NOT IN settings.gone - a deliberate
   reading (Decision 1; the owner said yes, 2026-09-28). settings.gone is
   today's personal-page queue of rows to delete at the next Save to cloud:
   the pull skips rows it names (goneMatch), cloudStatus counts them and
   cloudPush deletes and forgets them, and goneAdd and goneForget rewrite it
   whole. Group removals written there would stop pulls restoring rows whose
   server delete failed - and the page before stage 0, the rollback (E1),
   would inherit that; a field beside `rows` would be lost on the rollback
   page's next write. So: a record of its own, appended to with s0Append
   (patch603), which the new page reads beside settings.gone.

   Where: a person's removal in dbDelShared (the only removal a person
   makes); a move's drop wherever a trait leaves an id for another - the
   status chip (setTraitStatus), a drag across layers (commitShelfMove,
   past its rollback, so an undone drag is not recorded), a batch move
   (bulkMoveToLayer), Sort (sortApply), a layer rename or removal
   (retagLayer), the editor's rename (saveTraitNow), and a folder import's
   moved file and merge (bulkImport); and, marked as the pull's, a pull's
   re-id (cloudPull's repair loop) and a catch-up's "removed by someone
   else" (groupCatchUpRun). Not Clear: it is local only, and recording it
   as removals would turn a clear into project removals in D2's table
   (Decision 8).

   ONE APPEND PER OPERATION. The record is rewritten whole on every append
   and read by every redraw (renderShelf's dbAll), so the loops - Sort, a
   layer rename, a folder import, a pull, a catch-up - collect their moves
   and append once, as their own ruleMoves and draftMoves already do. And it
   keeps 30 days and the newest 1,000 marks (Decision 20; the owner's answer
   of 2026-09-28): neither the page before stage 0 (the rollback) nor Clear
   (a fixed list of settings) would ever remove it.

   `to` carries no row id (Decision 16): until it is sent, a moved record
   still holds its old row id (setTraitStatus spreads it). The row it moved
   to is the rowId the record with `to.lid` holds once sent, and that row's
   replaces names the old one (patch603). A `to` given as an id is read from
   the store here, so the mark carries its local id. An endpoint the caller
   has only an id for is recorded as {id} alone (Ruling F-16).

   Beyond the plan's text, from the controller's audit of this task against
   Task 10's page (anchor-audit/amend-task13.md), each premise measured on
   this page (7ac5dfb, Task 12's head) before it was applied:
   - Finding 1: the plan's pull anchor, a dbPut of the new id followed by
     repaired++, no longer exists on the re-id path (found 0 times): Task
     10's fix round 5 made the re-id one transaction, s0ReidTx. The pull's
     move is collected right after that transaction commits, and only when
     it did something - s0ReidTx answers null when its plan check skips -
     before the loop's post-commit wsStill check, because a committed move
     is a move even if the pull stops next. The same-id repair write moves
     nothing and records nothing.
   - Findings 2 and 3: the pull's and the catch-up's appends after their
     loops ran after a stop (a sign-out, a switch) had moved db() to another
     store, and filed that project's marks there - into the personal store,
     where the same ids are other traits. Each operation now names the
     store it wrote in (`home`, taken beside gen at its start), and its
     marks are written there or not at all. THE TRADE, STATED: a group pull
     or catch-up stopped by leaving its project records none of the moves
     or removals it had already made - they are done, and no later pull
     redoes them, so those marks are lost for good. They are never filed in
     the wrong store. The one way to keep them, writing each mark inside
     s0ReidTx's transaction, is one rewrite of this record per re-id, which
     the controller's ruling for this task (the mark goes after the
     transaction commits) and Decision 20 rule out. A stop that leaves the
     page on the same store - a pull on your own page stopped by signing
     out, which leaves the personal store current - keeps its marks, filed
     where the moves were made.
   - Finding 4: the checks below place the pull's collection between the
     transaction and the post-commit check, keep the same-id write
     untouched, and require both appends to name their store and uid.
   - Finding 8: whose the pull's and catch-up's marks are is taken at their
     start, beside gen, as autosaveNow takes its uid (Task 10 fix round 1):
     a session ending during them (sessionEnded) does not stop them, and
     their marks were left with nobody's uid.
   - Finding 7 (refuted for the pull: s0ReidTx stamps the record in place,
     so it carries its local id) holds for a drag on your own page, which
     writes a copy (unsentOf): the drag's marks read the record it landed on
     from the store, as a folder import's moved file does. So do the
     status chip and a batch move, whose records are stamped in place here,
     because Task 11's fix round 3 (not yet on this page) writes them as
     unsentOf's copies too; the chip's anchor is the line after the write,
     which both pages have.
   - Not in the audit: the editor's rename recorded its move even when the
     old id's removal failed, which is no drop. It records it only when the
     removal went through.

   Fix round 1, from the review of this task (measured by the reviewer on a
   copy of this page, and again here before the change): the person sites
   left `home` out, so their marks went to whatever store was current when
   the append ran. The drag appends after its reorder send, a network round
   trip, and cloudSaveShelfPlan answers ok for a send that landed even when
   the page has moved meanwhile; Sort, a layer rename or removal and a
   folder import append after loops that wait on a send per trait. A switch
   to your own page there filed the group's move in the personal store, and
   the drag read its `to` there too: the mark said the group's trait had
   moved onto the personal store's own, unrelated trait's local id - the
   misfile Findings 2 and 3 were about, which B1's straggler pass would
   pair through. Every person site - the four above, and the status chip,
   a batch move, the editor's rename and a person's removal, which append
   after an IndexedDB write the page can move off the store under - now
   takes where and whose its marks are as it begins, before its first wait
   (s0MarkStart), as the pull and the catch-up do, and hands it to its one
   append. A layer rename or removal takes it in renameLayer or removeLayer,
   before their read of the project, and hands it to retagLayer. THE SAME
   TRADE: a person's operation that the page leaves its project during
   records nothing, never a mark in the store switched to.

   INTEGRATED OVER TASK 11'S FIX ROUNDS 3 AND 4 (patch602 at cloud-save/
   t11f3, "the action's home"). Re-anchored where patch602 changed the text
   this patch matched, with the same meaning: dbDelShared(rec,home,why),
   setTraitStatus(t,next,asName,home), commitShelfMove(spec,home) and
   retagLayer(items,from,to,home) take the action's home, so retagLayer's
   s0MarkAt is its fifth parameter and removeLayer and renameLayer pass
   both; fix 4 made Sort's, a layer rename's and the editor's rename's two
   writes one transaction (dbApplyShelfRecords), so the pair is collected
   after that one write, and the editor's rename is recorded once it has
   gone through; the batch move's and the import's lines carry the home.
   Both intents kept where both guard one write: each person's append is
   still named by s0MarkAt, taken before the operation's first wait, and
   still checked for its store inside s0Moved and s0Removed (Task 13); and
   each is made only while the action is at home, asked with no wait
   between (fix 4: every local write after a wait asks s0AtHome). A
   person's removal is recorded after dbDelShared's own home check, not
   between the removal and that check. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['function s0Attempt(entry){', 'patch603 is not applied'],
  ['function s0ReidTx(d,oldId,rec,was,by){', 'Task 10\'s fix round 5 (s0ReidTx) is not on this page']]);
const NL = s0.NL;

/* ---- 1. the module, before dbDelShared ---------------------------------- */
doc.swap('async function dbDelShared(rec,home,why){', [
  '/* STAGE 0 (D1): settings.gonemarks - every removal and every move\'s drop',
  '   this page makes, marked as a person\'s or a pull\'s. A record of its own:',
  '   settings.gone is today\'s queue of rows for Save to cloud to delete, and',
  '   the page before stage 0 reads it as exactly that and rewrites it whole.',
  '   Appended to with s0Append (above) once per operation, however many',
  '   traits it moves, and kept 30 days and the newest 1,000 (Decision 20):',
  '   it is rewritten whole on every append and read by every redraw.',
  '   A MARK: {what:"removed"|"moved", wk:"person"|"pull", by, at, from, to}.',
  '   from is the record as it was: {id, lid, kind, name, layer, status,',
  '   rowId}. to, on a move only, is the record it landed on: {id, lid, kind,',
  '   name, layer, status} - never a row (Decision 16): until it is sent that',
  '   record still holds the old row id; the row it moved to is the rowId the',
  '   record with to.lid holds once sent, and that row\'s replaces names',
  '   from.rowId (patch603). AN END MAY BE {id} ALONE (Ruling F-16): when the',
  '   caller has only an id for it and, for a to, the store no longer holds',
  '   that id either. A to given as an id is read from the store first, so',
  '   it carries its local id.',
  '   o: {by, home}, taken as the operation began, before its first wait -',
  '   s0MarkStart() for a person\'s operation (fix round 1); a pull and a',
  '   catch-up take theirs beside gen. by is the uid the marks carry: a',
  '   session can end under an operation without stopping it. home is the',
  '   store the operation wrote in (its wsDbName()), and the marks go there',
  '   or nowhere: a page that has moved to another store by the append drops',
  '   them, rather than filing them where the same ids are other traits.',
  '   Every caller passes it. Left out, it is whoever is signed in and the',
  '   store current when this is called - which also covers this function\'s',
  '   own reads - and so is blind to a move made before the call. */',
  'const S0_MARKS_ID="settings.gonemarks", S0_MARKS_KEEP={ms:30*24*60*60*1000, max:1000};',
  'function s0MarkStart(){ return {home:wsDbName(), by:s0Uid()}; }',
  'function s0Ref(r,withRow){',
  '  if(!r) return null;',
  '  if(typeof r!=="object") return {id:String(r)};',
  '  const o={id:r.id||null, lid:r.lid||null, kind:r.kind||null, name:r.name||null, layer:r.layer||null, status:r.status||null};',
  '  if(withRow) o.rowId=r.rowId||null;',
  '  return o;',
  '}',
  'async function s0Removed(recs,wk,o){',
  '  o=o||{};',
  '  const home=o.home||wsDbName(), by=(o.by!==undefined) ? o.by : s0Uid(), at=Date.now(), kind=wk==="pull"?"pull":"person";',
  '  const out=(Array.isArray(recs)?recs:[recs]).filter(r=>r&&(typeof r!=="object"||r.id))',
  '    .map(r=>({what:"removed", wk:kind, by:by, at:at, from:s0Ref(r,true)}));',
  '  if(wsDbName()!==home) return false;',
  '  return s0Append(S0_MARKS_ID,"marks",out,S0_MARKS_KEEP);',
  '}',
  'async function s0Moved(pairs,wk,o){',
  '  o=o||{};',
  '  const home=o.home||wsDbName(), by=(o.by!==undefined) ? o.by : s0Uid(), at=Date.now(), kind=wk==="pull"?"pull":"person", out=[];',
  '  const idOf=x=>(x&&typeof x==="object") ? x.id : x;',
  '  for(const p of pairs||[]){',
  '    if(!p) continue;',
  '    const fromId=idOf(p.from), toId=idOf(p.to);',
  '    /* Same id: a reorder or a rewrite, not a move - nothing dropped. */',
  '    if(!fromId||!toId||String(fromId)===String(toId)) continue;',
  '    let to=p.to;',
  '    if(typeof to!=="object"){ try{ to=(await dbGet(String(to)))||to; }catch(_){ } }',
  '    out.push({what:"moved", wk:kind, by:by, at:at, from:s0Ref(p.from,true), to:s0Ref(to,false)});',
  '  }',
  '  /* Checked after the reads above, with no wait before s0Append, which',
  '     picks its store as it is called. */',
  '  if(wsDbName()!==home) return false;',
  '  return s0Append(S0_MARKS_ID,"marks",out,S0_MARKS_KEEP);',
  '}',
  'async function dbDelShared(rec,home,why){',
  '  const s0MarkAt=s0MarkStart();   /* STAGE 0 (D1): where and whose its mark is, before its first wait */',
]);

/* ---- 2. a person's removal ------------------------------------------------ */
/* After fix 4's home check, which follows the removal with no wait between. */
doc.swap(['  await dbDel(rec.id);',
  '  /* STAGE 0 (8b): moved during the removal here. activeWs below is the',
  '     project moved to\'s: nothing is filed or sent for it. Removed here only. */',
  '  if(!s0AtHome(s0Home)){ if(why) why.left=true; return false; }'], [
  '  await dbDel(rec.id);',
  '  /* STAGE 0 (8b): moved during the removal here. activeWs below is the',
  '     project moved to\'s: nothing is filed or sent for it. Removed here only. */',
  '  if(!s0AtHome(s0Home)){ if(why) why.left=true; return false; }',
  '  await s0Removed(rec,"person",s0MarkAt);   /* STAGE 0 (D1): a person\'s removal */',
]);

/* ---- 3a. where and whose, as each person's operation begins (fix round 1) -- */
/* Before each one's first wait, so a switch anywhere in it - a send, a loop,
   a write - leaves its marks unfiled rather than filed in the store moved to. */
const MARK_AT = '  const s0MarkAt=s0MarkStart();   /* STAGE 0 (D1): where and whose its marks are, before its first wait */';
for (const fn of ['async function setTraitStatus(t,next,asName,home){', 'async function commitShelfMove(spec,home){',
  'async function bulkMoveToLayer(toLayer){', 'async function sortApply(plan){', 'async function saveTraitNow(){',
  'async function bulkImport(files,opts){', 'async function removeLayer(name){', 'async function renameLayer(oldName,raw){'])
  doc.swap(fn, [fn, MARK_AT]);
/* A layer rename or removal: taken by the caller, before its read of the
   project, and handed on; called without it, retagLayer takes its own.
   After the home (Task 11 fix round 4), which its callers pass too. */
doc.swap('async function retagLayer(items,from,to,home){', [
  'async function retagLayer(items,from,to,home,s0MarkAt){',
  '  s0MarkAt=s0MarkAt||s0MarkStart();   /* STAGE 0 (D1): where and whose its marks are - its caller\'s, taken before the caller read the project */',
]);
doc.swap('  const r=n?await retagLayer(items,name,"unsorted",s0Home):{moved:0,renamed:0};',
  '  const r=n?await retagLayer(items,name,"unsorted",s0Home,s0MarkAt):{moved:0,renamed:0};');
doc.swap('  const r=await retagLayer(items,oldName,nw,s0Home);', '  const r=await retagLayer(items,oldName,nw,s0Home,s0MarkAt);');

/* ---- 3. the moves' drops, a person's ------------------------------------- */
/* Every person's append below is made only while the action is at home,
   asked with no wait between (Task 11 fix round 4, integrated): each
   follows a wait - a write, a send, a redraw. */
/* The status chip, once the new id is written. The record it landed on is
   read from the store, as a drag's is: a write that puts a copy (unsentOf,
   as the drag's does on your own page) stamps the copy, not `moved`. */
doc.swap('  const movedKey=shelfCore.recordKey(moved);', [
  '  if(s0AtHome(s0Home)) await s0Moved([{from:now, to:moved.id}],"person",s0MarkAt);   /* STAGE 0 (D1): the old id is gone, the new one written */',
  '  const movedKey=shelfCore.recordKey(moved);',
]);
/* A drag: the moves that stuck. By id, because on your own page the record
   written is unsentOf's copy, stamped with a local id the plan's record
   does not carry (Finding 7). */
doc.swap('  /* Only here, past the rollback above: a move that did not stick must not', [
  '  /* STAGE 0 (D1): the moves that stuck - past the rollback, so an undone',
  '     drag is not one. The record each landed on is read from the store: on',
  '     your own page what was written is a copy (unsentOf), and it is the',
  '     copy that was given the local id. */',
  '  if(s0AtHome(s0Home)) await s0Moved(plan.updates.filter(u=>u.oldId!==u.record.id)',
  '    .map(u=>({from:items.find(i=>i.id===u.oldId)||u.oldId, to:u.record.id})),"person",s0MarkAt);',
  '  /* Only here, past the rollback above: a move that did not stick must not',
]);
/* A batch move. The records it landed on are read from the store too: a
   write of unsentOf's copies (Task 11's fix round 3 writes them in a group)
   stamps the copies, not `after`'s records. */
doc.swap(['    for(const t of transfers) state.transfer(t.from,t.to);', '    try{ await draftsFollow(draftMoves,s0Home); }catch(_){}'], [
  '    for(const t of transfers) state.transfer(t.from,t.to);',
  '    try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
  '    if(s0AtHome(s0Home)) await s0Moved(draftMoves.map(m=>({from:before.get(m.from)||m.from, to:m.to})),"person",s0MarkAt);   /* STAGE 0 (D1): one append for the batch, each read from the store */',
]);
/* Sort: collected in the loop, appended once after it. */
doc.swap(['  const draftMoves=[];', '  for(const l of plan.layers){'], [
  '  const draftMoves=[];',
  '  const s0Pairs=[];   /* STAGE 0 (D1): the moves, recorded once after the loop */',
  '  for(const l of plan.layers){',
]);
/* After fix 4's one write, which puts the new record and removes the old. */
doc.swap(['      await dbApplyShelfRecords([old.id],[rec]);   /* one write: a move between two left both */', '      taken.delete(old.id); taken.add(id);'], [
  '      await dbApplyShelfRecords([old.id],[rec]);   /* one write: a move between two left both */',
  '      s0Pairs.push({from:old, to:rec});',
  '      taken.delete(old.id); taken.add(id);',
]);
doc.swap(['  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}', '  return {made, moved, refused, failed, stranded};'], [
  '  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
  '  if(s0AtHome(s0Home)) await s0Moved(s0Pairs,"person",s0MarkAt);   /* STAGE 0 (D1): one append for the whole sort */',
  '  return {made, moved, refused, failed, stranded};',
]);
/* A layer rename or removal: collected in the loop, appended once after it. */
doc.swap(['  const draftMoves=[];', '  for(const t of mine){'], [
  '  const draftMoves=[];',
  '  const s0Pairs=[];   /* STAGE 0 (D1): the moves, recorded once after the loop */',
  '  for(const t of mine){',
]);
doc.swap(['    await dbApplyShelfRecords([t.id],[rec]);   /* one write: a move between two lost the trait */', '    ruleMoves.push({from:traitKey(t), to:traitKey(rec)});'], [
  '    await dbApplyShelfRecords([t.id],[rec]);   /* one write: a move between two lost the trait */',
  '    s0Pairs.push({from:t, to:rec});',
  '    ruleMoves.push({from:traitKey(t), to:traitKey(rec)});',
]);
doc.swap(['  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}', '  return {moved:moved,renamed:renamed,stranded:stranded};'], [
  '  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
  '  if(s0AtHome(s0Home)) await s0Moved(s0Pairs,"person",s0MarkAt);   /* STAGE 0 (D1): one append for the whole layer */',
  '  return {moved:moved,renamed:renamed,stranded:stranded};',
]);
/* The editor's rename: a drop only when the old id's removal went through.
   Fix 4 removes the old id in the same transaction that writes the new one
   (dbApplyShelfRecords, which throws past this when it fails), so reaching
   this line means it went through. */
doc.swap('      /* (STAGE 0, fix round 4: removed above, with the new record.) */', [
  '      /* (STAGE 0, fix round 4: removed above, with the new record.) */',
  '      /* STAGE 0 (D1): recorded once the old id is gone - a removal that failed',
  '         left it, and dropped nothing. */',
  '      if(s0AtHome(s0Home)){ try{ await s0Moved([{from:base||openWas, to:rec}],"person",s0MarkAt); }catch(_){} }',
]);
/* A folder import: its moved files and merged renames, appended once after both loops. */
doc.swap(['  if(supplied.length && !inPlace){', '    let existing=[]; try{ existing=await dbAll(); }catch(_){ existing=[]; }',
  '    const here=new Set(supplied.map(s=>s.id));', '    for(const rec of existing){'], [
  '  const s0ImportPairs=[];   /* STAGE 0 (D1): the moves below, recorded once, after both loops */',
  '  if(supplied.length && !inPlace){',
  '    let existing=[]; try{ existing=await dbAll(); }catch(_){ existing=[]; }',
  '    const here=new Set(supplied.map(s=>s.id));',
  '    for(const rec of existing){',
]);
doc.swap(['      try{ await dbDel(rec.id); }catch(_){ continue; }', '      /* The server copy too, or the next pull brings it back. */'], [
  '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  '      if(to) s0ImportPairs.push({from:rec, to:to.id});',
  '      /* The server copy too, or the next pull brings it back. */',
]);
doc.swap(['      await carryDecided(rec,onto.id,s0Home);', '      if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '      try{ await dbDel(rec.id); }catch(_){ continue; }'], [
  '      await carryDecided(rec,onto.id,s0Home);',
  '      if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  '      s0ImportPairs.push({from:rec, to:onto});',
]);
doc.swap('  /* Traits the project has and this folder did not bring. Usually a file', [
  '  if(s0AtHome(s0Home)) await s0Moved(s0ImportPairs,"person",s0MarkAt);   /* STAGE 0 (D1): one append for the whole import */',
  '  /* Traits the project has and this folder did not bring. Usually a file',
]);

/* ---- 4. the pull's re-ids ------------------------------------------------- */
/* Where and whose, beside gen, before the pull's first wait (Findings 2, 8). */
doc.swap(['     stops a pull on its own. */', '  const gen=wsGen;'], [
  '     stops a pull on its own. */',
  '  const gen=wsGen;',
  '  /* STAGE 0 (D1): and where and whose its move marks are - the store its',
  '     writes go to while gen holds, and who was signed in as it began. */',
  '  const s0PullDb=wsDbName(), s0PullBy=s0Uid();',
]);
doc.swap(['  let repaired=0;', '  for(const rp of repair){'], [
  '  let repaired=0;',
  '  const s0PullPairs=[];   /* STAGE 0 (D1): the re-ids that committed, recorded once after the loop */',
  '  for(const rp of repair){',
]);
/* After s0ReidTx has committed, and only when it did something; before the
   post-commit check, because a committed move is a move (Finding 1). */
doc.swap(['        if(moved===null){ skipped++; continue; }', '        repaired++;'], [
  '        if(moved===null){ skipped++; continue; }',
  '        repaired++;',
  '        s0PullPairs.push({from:rp.was, to:rp.record});   /* STAGE 0 (D1): committed - a move, whatever comes next */',
]);
doc.swap('  const PULL_AT_ONCE=8;', [
  '  /* STAGE 0 (D1): one append for the whole pull, into the store the re-ids',
  '     were made in or nowhere. A group pull stopped by leaving its project',
  '     records none of the re-ids it made - they are done and no later pull',
  '     redoes them, so those marks are lost - but never files them in the',
  '     store moved to, where the same ids are other traits. */',
  '  await s0Moved(s0PullPairs,"pull",{by:s0PullBy, home:s0PullDb});',
  '  const PULL_AT_ONCE=8;',
]);

/* ---- 5. the catch-up's "removed by someone else" ------------------------ */
doc.swap(['     person moved to would be the worst version of this. */', '  const gen=wsGen;'], [
  '     person moved to would be the worst version of this. */',
  '  const gen=wsGen;',
  '  const s0CatchDb=wsDbName(), s0CatchBy=s0Uid();   /* STAGE 0 (D1): where and whose its removal marks are */',
]);
doc.swap('        let gone=0, kept=0;', [
  '        let gone=0, kept=0;',
  '        const s0Gone=[];   /* STAGE 0 (D1): recorded once after the loop */',
]);
doc.swap('          await dbDel(it.id); gone++;', '          await dbDel(it.id); gone++; s0Gone.push(it);');
doc.swap(['        const said=[];', '        if(gone) said.push(gone+" removed by someone else");'], [
  '        /* STAGE 0 (D1): removed by someone else - into the group\'s store or',
  '           nowhere: a catch-up stopped by leaving the project records none. */',
  '        await s0Removed(s0Gone,"pull",{by:s0CatchBy, home:s0CatchDb});',
  '        const said=[];',
  '        if(gone) said.push(gone+" removed by someone else");',
]);

doc.finish(({ code }) => {
  const n = (s) => code.split(s).length - 1;
  const at = (s, from) => code.indexOf(s, from || 0);
  const one = (s, why) => { if (n(s) !== 1) throw new Error(why + ': expected exactly 1 of ' + s + ', found ' + n(s)); return at(s); };
  if (n('await s0Moved(') !== 8) throw new Error('expected 8 recorded move sites, found ' + n('await s0Moved('));
  if (n('await s0Removed(') !== 2) throw new Error('expected 2 recorded removal sites, found ' + n('await s0Removed('));
  for (const s of ['s0Pairs.push({from:old, to:rec});', 's0Pairs.push({from:t, to:rec});', 's0ImportPairs.push({from:rec, to:to.id});',
    's0ImportPairs.push({from:rec, to:onto});', 's0PullPairs.push({from:rp.was, to:rp.record});', 's0Gone.push(it);'])
    one(s, 'a loop does not collect its marks');
  /* The pull's collection: after the re-id transaction has answered, past
     its "did nothing" skip, and before the post-commit check (Findings 1, 4). */
  const tx = one('const moved=await s0ReidTx(d,rp.oldId,rp.record,rp.was,by);', 'the re-id transaction');
  const skip = at('if(moved===null){ skipped++; continue; }', tx);
  const push = one('s0PullPairs.push(', 'the pull\'s collection');
  const stop = at('if(!wsStill(gen)) break;', tx);
  if (!(tx < skip && skip < push && push < stop)) throw new Error('the pull\'s move is not collected between its committed transaction and the post-commit check');
  /* The same-id repair write moves nothing and is left as it was. */
  one('await dbPut(rp.record,"pull",s0Uid());' + NL + '      repaired++;' + NL + '    }catch(_){}', 'the same-id repair write');
  /* Both appends name their store and uid, taken at their start (Findings 2, 3, 8). */
  const pullAppend = one('await s0Moved(s0PullPairs,"pull",{by:s0PullBy, home:s0PullDb});', 'the pull\'s append');
  if (!(stop < pullAppend && pullAppend < at('const PULL_AT_ONCE=8;'))) throw new Error('the pull\'s append is not after its repair loop');
  one('await s0Removed(s0Gone,"pull",{by:s0CatchBy, home:s0CatchDb});', 'the catch-up\'s append');
  const startOf = (fn, decl, firstWait) => {
    const f = one(fn, fn), d = at(decl, f), w = at(firstWait, f);
    if (!(f < d && d < w)) throw new Error(decl + ' is not taken before the first wait of ' + fn);
  };
  startOf('async function cloudPull(opts){', 'const s0PullDb=wsDbName(), s0PullBy=s0Uid();', 'await sbAuthState()');
  startOf('async function groupCatchUpRun(){', 'const s0CatchDb=wsDbName(), s0CatchBy=s0Uid();', 'await dbAll()');
  /* Fix round 1 (the review's finding): every append names where and whose
     its marks are. Each call, read to the end of its statement, passes a
     person's s0MarkAt or the pull's or catch-up's own {by, home}; none is
     left to the store current at the append. */
  let person = 0;
  for (const call of ['await s0Moved(', 'await s0Removed(']) {
    for (let i = at(call); i >= 0; i = at(call, i + 1)) {
      const stmt = code.slice(i, code.indexOf(';', i));
      if (/,"person",s0MarkAt\)$/.test(stmt)) person++;
      else if (!/,"pull",\{by:s0(Pull|Catch)By, home:s0(Pull|Catch)Db\}\)$/.test(stmt))
        throw new Error('an append does not name where and whose its marks are: ' + stmt.slice(0, 140));
    }
  }
  if (person !== 8) throw new Error('expected 8 person appends naming s0MarkAt, found ' + person);
  /* Integrated over Task 11 fix round 4: each person's append is made only
     while its action is at home - the last s0AtHome(s0Home) before it lies
     in the same function, with no wait between the two. */
  let homed = 0;
  for (const call of ['await s0Moved(', 'await s0Removed(']) {
    for (let i = at(call); i >= 0; i = at(call, i + 1)) {
      const stmt = code.slice(i, code.indexOf(';', i));
      if (!/,"person",s0MarkAt\)$/.test(stmt)) continue;
      const h = code.lastIndexOf('s0AtHome(s0Home)', i), gap = h >= 0 ? code.slice(h, i) : '';
      if (h < 0 || /\bawait\b/.test(gap) || /\bfunction\b/.test(gap))
        throw new Error('a person\'s append is not asked for its action\'s home, with no wait between: ' + stmt.slice(0, 140));
      homed++;
    }
  }
  if (homed !== 8) throw new Error('expected 8 person appends behind a home check, found ' + homed);
  /* ... each taken as its operation begins: one capture in each function
     that appends, before that function's first wait, and its one append
     inside that function. A body runs to the first "}" in column 0. */
  const body = (fn) => { const f = one(fn, fn), e = code.slice(f).search(/\n\}/); if (e < 0) throw new Error('no end found for ' + fn); return code.slice(f, f + e); };
  const firstWait = (b) => b.search(/\bawait\b/);
  const count = (b, s) => b.split(s).length - 1;
  const CAP = 'const s0MarkAt=s0MarkStart();';
  for (const fn of ['async function dbDelShared(rec,home,why){', 'async function setTraitStatus(t,next,asName,home){', 'async function commitShelfMove(spec,home){',
    'async function bulkMoveToLayer(toLayer){', 'async function sortApply(plan){', 'async function saveTraitNow(){', 'async function bulkImport(files,opts){']) {
    const b = body(fn);
    if (count(b, CAP) !== 1 || !(b.indexOf(CAP) < firstWait(b))) throw new Error(fn + ' does not take where and whose its marks are, once, before its first wait');
    if (count(b, '"person",s0MarkAt)') !== 1) throw new Error(fn + ' does not make exactly one append of its own with it');
  }
  /* A layer rename or removal: taken in renameLayer and removeLayer before
     their read of the project, handed to retagLayer, which appends once. */
  const rb = body('async function retagLayer(items,from,to,home,s0MarkAt){'), RCAP = 's0MarkAt=s0MarkAt||s0MarkStart();';
  if (count(rb, RCAP) !== 1 || !(rb.indexOf(RCAP) < firstWait(rb)) || count(rb, '"person",s0MarkAt)') !== 1)
    throw new Error('retagLayer does not append once with where and whose its caller took');
  for (const [fn, call] of [['async function removeLayer(name){', 'retagLayer(items,name,"unsorted",s0Home,s0MarkAt)'],
    ['async function renameLayer(oldName,raw){', 'retagLayer(items,oldName,nw,s0Home,s0MarkAt)']]) {
    const b = body(fn);
    if (count(b, CAP) !== 1 || !(b.indexOf(CAP) < firstWait(b)) || count(b, call) !== 1)
      throw new Error(fn + ' does not take where and whose before its read and hand them to retagLayer');
  }
  if (n('retagLayer(') !== 3) throw new Error('retagLayer has a caller this patch does not know, which must decide where its marks go: found ' + n('retagLayer('));
  /* The store is checked with no wait before s0Append, in both. */
  for (const fn of ['async function s0Removed(recs,wk,o){', 'async function s0Moved(pairs,wk,o){']) {
    const f = one(fn, fn), c = at('if(wsDbName()!==home) return false;', f), a = at('return s0Append(S0_MARKS_ID,"marks",out,S0_MARKS_KEEP);', f);
    if (!(f < c && c < a) || /await/.test(code.slice(c, a))) throw new Error(fn + ' does not check its store just before appending');
  }
  if (/goneAdd\([^)]*\)[^\n]*s0Moved|S0_MARKS_ID[^\n]*GONE_ID|GONE_ID[^\n]*S0_MARKS_ID/.test(code)) throw new Error('the marks must stay out of settings.gone');
  const from = code.indexOf("$('clearproj').onclick=async()=>{"), to = code.indexOf('const CRCT=(()=>{');
  if (from < 0 || to < from) throw new Error('could not find Clear\'s handler to check it');
  if (/s0Removed|s0Moved/.test(code.slice(from, to))) throw new Error('Clear must record nothing');
});
