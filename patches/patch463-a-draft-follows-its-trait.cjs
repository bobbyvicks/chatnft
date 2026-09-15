/* AN UNSAVED DRAFT WAS KEYED TO THE TRAIT'S ID, AND SIX THINGS CHANGE THAT ID.

   A per-trait draft lives under `draftKey(id)` - "autosave." + the trait's
   local id - and openTraitRecord finds it by exact key:

     const got=(await dbAll()).find(i=>i.id===draftKey(t.id));

   The id is `"t_"+name+"_"+layer+"_"+status`. So the moment anything changes a
   trait's name, layer or status, the draft is filed under an id nothing will
   ever ask for again. It is offered by nothing - offerRestore reads only
   AUTO_ID - and swept by nothing. The work is simply not there any more.

   PRESS THE STATUS CHIP ON THE SHELF and that is what happens. Paint a trait,
   close without saving, click the chip once: wip becomes approved, the record
   becomes t_hat_hats_approved, and the strokes are still under
   autosave.t_hat_hats_wip. Open the trait again and it shows the saved pixels,
   with no draft bar and nothing said. Measured in Chromium: drafts
   ['autosave.t_hat_hats_wip'], traits ['t_hat_hats_approved'], corner 90 rather
   than 20.

   The handler carries the OTHER id-keyed thing across on the very next line -
   `visibility.transfer(key,shelfCore.recordKey(moved))` - and saveTrait, the one
   id-changing path that does think about drafts, deliberately deletes both keys
   because there the canvas has just become the record. So the class was
   understood; the draft was just not on the list of things that follow a trait.

   SIX PATHS, and they are the population rather than the ones I happened to
   notice - every place in the file that retires an existing trait id:

     the status chip          t_name_layer_wip -> ..._approved
     Sort unsorted            name and layer at once
     renaming or removing a layer (retagLayer)   every trait on it
     dragging a card across layers (commitShelfMove)
     pick-several-and-move (bulkMoveToLayer)
     the cloud pull's repair pass, which re-ids a record to match the server

   Duplicate is NOT one of them: it builds a new record from the original's
   SAVED blob, and the original keeps its id and its draft. A copy inheriting
   somebody else's unsaved work would be a different bug.

   THE MOVED DRAFT IS RE-STAMPED, which is not bookkeeping tidiness. The open
   path only accepts a draft NEWER than its record - `(got.at||0)>(t.at||0)`,
   and rightly, because an older one is a leftover from before the last save.
   Sort unsorted writes `at:Date.now()` onto the record it moves, so a draft
   carried across with its original timestamp would arrive correctly keyed and
   then be thrown away as stale. The draft's pixels genuinely do postdate the
   record's: none of these six paths touches the artwork, they move it. So the
   stamp says what is true.

   ONE TRANSACTION, AND CHAINS COLLAPSED FIRST. Every get in an IndexedDB
   transaction is issued before any handler runs, so A->B and B->C applied as
   written would have the second read a draft the first has not put yet.
   bulkMoveToLayer chains plans exactly like that - it moves several traits and
   each plan renormalises the order of every record in the affected layers - so
   this is the ordinary case, not a corner. They are walked to their end first
   and only A->C is applied. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the helper, beside the key it is about ---- */
{
  const at = kit.only(L, l => l === 'function draftId(){ return openRec&&openRec.id ? draftKey(openRec.id) : AUTO_ID; }',
    'the draft key helpers');
  kit.replace(L, { start: at, end: at }, [
    'function draftId(){ return openRec&&openRec.id ? draftKey(openRec.id) : AUTO_ID; }',
    '/* A DRAFT FOLLOWS ITS TRAIT. Six paths retire a trait id - the status chip,',
    '   Sort unsorted, retagLayer, commitShelfMove, bulkMoveToLayer and the cloud',
    '   pull repair pass - and every one of them used to leave the draft under',
    '   the dead key, where openTraitRecord can never ask for it again and nothing',
    '   sweeps it. The work was gone with no warning before and no message after.',
    '',
    '   RE-STAMPED, because the open path only accepts a draft newer than its',
    '   record, and Sort unsorted bumps the `at` on the record as it moves it.',
    '   None of these six touches the artwork, so the draft pixels really are the',
    '   newer ones and the stamp says something true.',
    '',
    '   CHAINS COLLAPSED FIRST. Every get in one transaction is issued before any',
    '   handler runs, so applying A->B and B->C as written would have the second',
    '   read a draft the first has not written yet. bulkMoveToLayer chains plans',
    '   as a matter of course, so this is the ordinary case.',
    '',
    '   Keyed gets, not dbAll: a bulk move of forty traits would otherwise read',
    '   every blob in the project forty times to find the nought or one draft',
    '   that exists. */',
    'async function draftsFollow(pairs){',
    '  const next=new Map();',
    '  for(const p of (pairs||[])) if(p&&p.from&&p.to&&p.from!==p.to) next.set(p.from,p.to);',
    '  if(!next.size) return 0;',
    '  const isTarget=new Set(next.values());',
    '  const ends=[];',
    '  for(const from of next.keys()){',
    '    if(isTarget.has(from)) continue;  /* not the start of a chain */',
    '    let to=next.get(from); const seen=new Set([from]);',
    '    /* seen, because a cycle of moves would otherwise walk forever. */',
    '    while(next.has(to)&&!seen.has(to)){ seen.add(to); to=next.get(to); }',
    '    if(to!==from) ends.push({from:from, to:to});',
    '  }',
    '  if(!ends.length) return 0;',
    '  const d=await db();',
    '  return new Promise((res,rej)=>{',
    '    const t=d.transaction(STORE,"readwrite"), s=t.objectStore(STORE);',
    '    let n=0;',
    '    for(const m of ends){',
    '      const q=s.get(draftKey(m.from));',
    '      q.onsuccess=()=>{',
    '        const got=q.result;',
    '        if(!got) return;',
    '        s.put(Object.assign({},got,{id:draftKey(m.to), traitId:m.to, at:Date.now()}));',
    '        s.delete(draftKey(m.from));',
    '        n++;',
    '      };',
    '    }',
    '    t.oncomplete=()=>res(n); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);',
    '  });',
    '}',
  ]);
}

/* ---- 1. the status chip ---- */
{
  const at = kit.only(L, l => l === '        visibility.transfer(key,shelfCore.recordKey(moved));',
    'the status chip visibility transfer');
  kit.replace(L, { start: at, end: at }, [
    '        visibility.transfer(key,shelfCore.recordKey(moved));',
    '        /* And the unsaved work, which used to be the one id-keyed thing this',
    '           did not carry - the line above has always carried the other. */',
    '        await draftsFollow([{from:t.id, to:moved.id}]);',
  ]);
}

/* ---- 2. Sort unsorted ---- */
{
  const at = kit.only(L, l => l === '  let stranded=0;', 'the sort counters');
  kit.replace(L, { start: at, end: at }, [
    '  let stranded=0;',
    '  /* Collected and applied in one transaction after the loop, rather than a',
    '     transaction per trait across a sort of three hundred. */',
    '  const draftMoves=[];',
  ]);
  const fn = kit.inFunction(L, 'async function sortApply(plan){');
  const mv = kit.only(L, l => l === '      await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);',
    'the sort rule retarget', fn);
  kit.replace(L, { start: mv, end: mv }, [
    '      await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);',
    '      draftMoves.push({from:old.id, to:id});',
  ]);
  const fn2 = kit.inFunction(L, 'async function sortApply(plan){');
  const ret = kit.only(L, l => l === '  return {made, moved, refused, failed, stranded};',
    'what the sort returns', fn2);
  kit.replace(L, { start: ret, end: ret }, [
    '  try{ await draftsFollow(draftMoves); }catch(_){}',
    '  return {made, moved, refused, failed, stranded};',
  ]);
}

/* ---- 3. renaming or removing a layer ---- */
{
  const at = kit.only(L, l => l === '  const ruleMoves=[];', 'the retag rule moves');
  kit.replace(L, { start: at, end: at }, [
    '  const ruleMoves=[];',
    '  /* Same shape as ruleMoves above, and for the same reason: one write at',
    '     the end rather than one per trait on the layer. */',
    '  const draftMoves=[];',
  ]);
  const push = kit.only(L, l => l === '    ruleMoves.push({from:traitKey(t), to:traitKey(rec)});',
    'the retag rule push');
  kit.replace(L, { start: push, end: push }, [
    '    ruleMoves.push({from:traitKey(t), to:traitKey(rec)});',
    '    draftMoves.push({from:t.id, to:rec.id});',
  ]);
  const apply = kit.only(L, l => l === '  await retargetRules(ruleMoves);', 'the retag rule apply');
  kit.replace(L, { start: apply, end: apply }, [
    '  await retargetRules(ruleMoves);',
    '  try{ await draftsFollow(draftMoves); }catch(_){}',
  ]);
}

/* ---- 4. dragging one card across layers ---- */
{
  const at = kit.only(L, l => l === '  for(const update of plan.updates) state.transfer(update.oldKey,shelfCore.recordKey(update.record));',
    'the shelf move visibility transfer');
  kit.replace(L, { start: at, end: at }, [
    '  for(const update of plan.updates) state.transfer(update.oldKey,shelfCore.recordKey(update.record));',
    '  /* A cross-layer drag rewrites the local id, so the draft moves with it. */',
    '  try{ await draftsFollow(plan.updates.map(u=>({from:u.oldId, to:u.record.id}))); }catch(_){}',
  ]);
}

/* ---- 5. pick several and move ---- */
{
  const at = kit.only(L, l => l === '      for(const u of plan.updates) transfers.push({from:u.oldKey,to:shelfCore.recordKey(u.record)});',
    'the bulk move transfers');
  kit.replace(L, { start: at, end: at }, [
    '      for(const u of plan.updates) transfers.push({from:u.oldKey,to:shelfCore.recordKey(u.record)});',
    '      /* Ids rather than record keys, because a draft is filed under the id.',
    '         Pushed per plan and in order, so a record two plans touched arrives',
    '         as A->B and B->C - draftsFollow walks those to their end. */',
    '      for(const u of plan.updates) draftMoves.push({from:u.oldId, to:u.record.id});',
  ]);
  const decl = kit.only(L, l => l === '    const transfers=[];', 'the bulk move transfer list');
  kit.replace(L, { start: decl, end: decl }, [
    '    const transfers=[];',
    '    const draftMoves=[];',
  ]);
  const fn = kit.inFunction(L, 'async function bulkMoveToLayer(toLayer){');
  const after = kit.only(L, l => l === '    for(const t of transfers) state.transfer(t.from,t.to);',
    'the bulk move visibility transfer', fn);
  kit.replace(L, { start: after, end: after }, [
    '    for(const t of transfers) state.transfer(t.from,t.to);',
    '    try{ await draftsFollow(draftMoves); }catch(_){}',
  ]);
}

/* ---- 6. the cloud pull's repair pass ---- */
{
  const at = kit.only(L, l => l === '      if(rp.oldId!==rp.record.id) await dbDel(rp.oldId);',
    'the pull repair re-id');
  kit.replace(L, { start: at, end: at }, [
    '      /* The server can name a trait something this browser filed',
    '         differently, and the repair re-ids the local record to match. The',
    '         draft goes with it, or a pull silently costs somebody their',
    '         unsaved work. */',
    '      if(rp.oldId!==rp.record.id){',
    '        await dbDel(rp.oldId);',
    '        try{ await draftsFollow([{from:rp.oldId, to:rp.record.id}]); }catch(_){}',
    '      }',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');
  /* ALL SIX, named one at a time. A count alone would pass with one site
     covered twice and another not at all. */
  if (!/await draftsFollow\(\[\{from:t\.id, to:moved\.id\}\]\);/.test(code))
    throw new Error('the status chip does not carry the draft');
  const sa = kit.inFunction(codeLines, 'async function sortApply(plan){');
  const sab = codeLines.slice(sa.start, sa.end + 1).join('\n');
  if (!/draftMoves\.push\(\{from:old\.id, to:id\}\);/.test(sab) || !/await draftsFollow\(draftMoves\);/.test(sab))
    throw new Error('Sort unsorted does not carry the draft');
  const rt = kit.inFunction(codeLines, 'async function retagLayer(items,from,to){');
  const rtb = codeLines.slice(rt.start, rt.end + 1).join('\n');
  if (!/draftMoves\.push\(\{from:t\.id, to:rec\.id\}\);/.test(rtb))
    throw new Error('renaming a layer does not carry the drafts on it');
  /* COLLECTING IS NOT APPLYING, and this is not a hypothetical: the first
     version of this patch pushed the pairs here and never called the helper,
     and three tests went red saying so. Every site that batches needs both
     halves checked. */
  if (!/await draftsFollow\(draftMoves\);/.test(rtb))
    throw new Error('renaming a layer collects the draft moves and never applies them');
  const cm = kit.inFunction(codeLines, 'async function commitShelfMove(spec){');
  const cmb = codeLines.slice(cm.start, cm.end + 1).join('\n');
  if (!/draftsFollow\(plan\.updates\.map\(u=>\(\{from:u\.oldId, to:u\.record\.id\}\)\)\)/.test(cmb))
    throw new Error('dragging a card across layers does not carry the draft');
  const bm = kit.inFunction(codeLines, 'async function bulkMoveToLayer(toLayer){');
  const bmb = codeLines.slice(bm.start, bm.end + 1).join('\n');
  if (!/for\(const u of plan\.updates\) draftMoves\.push\(\{from:u\.oldId, to:u\.record\.id\}\);/.test(bmb))
    throw new Error('a bulk move does not carry the drafts');
  if (!/await draftsFollow\(draftMoves\);/.test(bmb))
    throw new Error('a bulk move collects the draft moves and never applies them');
  if (!/await draftsFollow\(\[\{from:rp\.oldId, to:rp\.record\.id\}\]\);/.test(code))
    throw new Error('the pull repair does not carry the draft');

  /* AND THE HELPER DOES THE TWO THINGS THAT MAKE IT CORRECT. */
  const df = kit.inFunction(codeLines, 'async function draftsFollow(pairs){');
  const dfb = codeLines.slice(df.start, df.end + 1).join('\n');
  /* Chains, or bulkMoveToLayer - which chains plans as a matter of course -
     reads a draft the previous move has not written yet. */
  if (!/while\(next\.has\(to\)&&!seen\.has\(to\)\)\{ seen\.add\(to\); to=next\.get\(to\); \}/.test(dfb))
    throw new Error('the helper does not walk a chain of moves to its end');
  if (!/const seen=new Set\(\[from\]\);/.test(dfb))
    throw new Error('a cycle of moves would walk forever');
  /* Re-stamped, or Sort unsorted's own `at:Date.now()` on the record makes the
     correctly-moved draft read as stale and it is discarded on open anyway. */
  if (!/at:Date\.now\(\)\}\)\);/.test(dfb))
    throw new Error('the moved draft is not re-stamped, so a sort still discards it');
  /* Keyed gets. dbAll here would read every blob in the project once per
     trait moved. */
  if (/dbAll\(\)/.test(dfb))
    throw new Error('the helper reads the whole project to find one draft');
  if (!/const q=s\.get\(draftKey\(m\.from\)\);/.test(dfb))
    throw new Error('the helper does not look the draft up by key');
  /* Duplicate must NOT carry the draft - it copies the SAVED blob, and a copy
     inheriting somebody else's unsaved work is a different bug. */
  const du = kit.inFunction(codeLines, 'async function duplicateTrait(t){');
  if (/draftsFollow/.test(codeLines.slice(du.start, du.end + 1).join('\n')))
    throw new Error('a duplicate steals the original\'s unsaved draft');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
