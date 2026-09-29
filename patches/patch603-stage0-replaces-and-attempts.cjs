/* STAGE 0, PART 4 OF 7: AN INSERT THAT STANDS IN FOR A ROW SAYS WHICH, AND
   EVERY DELETE-THEN-INSERT IS NOTED.

   Design A2: "Stage 0 sends replaces: <old row id> on every insert that
   stands in for an existing row." D1: "Save attempts: recorded in
   settings.attempts, keeping 7 days."

   There is one trait insert, in cloudSyncOne. It stands in for a row when:
     - a move sends it: cloudMoveOne now passes the row the old copy is on
       as ctx.replaces;
     - the record holds a row id: the delete before the insert removes that
       row;
     - a folder import moved a file between status folders, or merged a
       renamed file into the artwork it renames (bulkImport, after its
       loop): both are found after the loop has sent the new record, so
       s0StandsIn PATCHes replaces onto a row already made, and an unsent
       record carries the old row as s0Replaces into its insert;
     - none of these, and the delete by name, layer and status removes
       exactly one row: that delete now asks for the rows back to learn
       its id.
   Only a uuid is sent - a row id is whatever a server once answered, and a
   non-uuid would make every save of that record fail with 22P02. With no
   predecessor the body is byte for byte today's. Before Change A0 is live a
   body carrying replaces is refused (PGRST204), which is why A0 is applied
   and read back first (A8, E1); stage0replaces-sql.spec.js pins both.

   Each attempt is noted before its delete is sent, so a page closed between
   the delete and the insert still has it: time, record id, local id, and the
   row id or the identity deleted by. settings.attempts is appended to in one
   IndexedDB transaction - two tabs at once keep both entries - keeping 7
   days and at most the newest 1,000 (Decision 20; the owner's answer of
   2026-09-28), and it tells no other tab to redraw (D1: "settings.* writes
   do not tell other tabs to rebuild"; Decision 2, answered yes). A failed
   note never fails the save.

   Ruling F-18 (Decision 20: "Loops ... append once per operation, not once
   per trait"): Save to cloud, a group folder import (and a fixer save in a
   group), a layer rename and a sort work out first what they will send
   (s0AttemptRun) and note it together - the first send notes itself and
   what is still to go, at most S0_ATTEMPT_CHUNK entries, in one append. The
   controller's audit (Finding 7) measured the cost of taking that
   literally: the new page's proof matches a failed attempt to a tombstone
   within a minute (design D2), and one append before a run longer than a
   minute would stamp its later deletes too early. So a note is good for
   S0_ATTEMPT_FRESH_MS (30 s); a send whose note is older notes again, with
   what is still to go.

   Beyond the plan's text, from that audit (anchor-audit/amend-task12.md),
   each premise measured on this page (eaa3f75) before it was applied:
   - Finding 1: saveTraitNow and a folder import's same-id replacement
     rebuild a trait record field by field and dropped s0Replaces; both
     carry it now, as they carry rowId and lid.
   - The audit's missed item: s0StandsIn looked only at the old record's
     row id, so a file moved twice before Save to cloud lost the pairing;
     a record never sent passes on the row it already stands in for.
   - Finding 4: s0StandsIn's local write took the owner off a record when
     nobody was signed in by then (a sign-out, or a session refused during
     its own waits); it writes the record's own owner.
   - Finding 5: a sign-out or switch during s0StandsIn's waits moved db()
     to another store, where the same id is another trait; nothing is
     written there now.
   - Finding 6: comments name functions, not line numbers.
   And beyond the audit, from its note on the sent write: once an insert
   carrying the record's own s0Replaces lands, the record stops holding it
   (both writes after the insert); left, it outlived the row it paired.

   Fix round 1 (the review of Task 12, its premise measured again here
   against PGlite with A0 before it was applied): s0StandsIn's PATCH moved
   the new row's updated_at (the traits_touch trigger) and the record kept
   the time from before it, so the next Load from cloud or catch-up said
   the person's own folder import was "changed in place by the group". The
   PATCH now asks for its row back, counts as told only when exactly one
   row comes back, and writes that row's time into the record's rowAt,
   while the record still holds that row, synced, in the store it read.

   INTEGRATED OVER TASK 11'S FIX ROUNDS 3 AND 4 (patch602 at cloud-save/
   t11f3, "the action's home": an action notes its store, account and wsGen
   when the person acts - s0HomeNow - and asks s0AtHome before every local
   write and s0SendHome before every send after a wait). Re-anchored where
   patch602 changed the text this patch matched, with the same meaning:
   s0Blocked(addressed,home); dbDelShared(rec,home,why); cloudMoveOne's
   fourth parameter is now the home, so s0Run is the fifth; the sent-write
   guard after an edit in flight carries s0AtHome(s0Home); cloudSyncOne's
   ctx is ctx||{home:s0Home}; the import's cloudDropOne calls and the
   sort's, the layer rename's and Save to cloud's contexts carry the home.
   Both intents kept where both change one behaviour:
     - s0StandsIn keeps Task 12's own wsStill(gen) check (Finding 5) and
       takes the import's home: its read asks s0Blocked for that home,
       its PATCH asks s0SendHome after the headers' wait, and its writes
       ask s0AtHome too - a move before the call (during the import's
       dbDel) left wsGen as s0StandsIn found it, so gen alone missed it.
     - cloudSyncOne notes the attempt (Task 12) after fix 4's s0SendHome
       check and before the DELETE, and the note is a wait: the DELETE
       asks s0SendHome again after it. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['async function s0Blocked(addressed,home){', 'patch602 is not applied']]);

/* ---- 1. the module, before dbDelShared ---------------------------------- */
doc.swap('async function dbDelShared(rec,home,why){', [
  '/* STAGE 0 (D1): A BOOKKEEPING RECORD, APPENDED TO IN ONE TRANSACTION.',
  '   settings.attempts (below) and settings.gonemarks are read by the new',
  '   page\'s migration and by nothing in this one, so they are written on',
  '   their own: not through dbPut, so they tell no other tab to redraw and',
  '   carry no stamp; and read and written in one readwrite transaction,',
  '   which IndexedDB runs one at a time per store, so two tabs appending at',
  '   once keep both. keep = {ms, max}: entries older than ms go, then all but',
  '   the newest max, as it writes - each record is rewritten whole on every',
  '   append and read by every redraw, so it must stay small (Decision 20).',
  '   Answers false on failure and never throws: a note must not fail what',
  '   it notes. */',
  'async function s0Append(id,field,entries,keep){',
  '  const add=(Array.isArray(entries)?entries:[entries]).filter(Boolean);',
  '  if(!add.length) return true;',
  '  let d=null; try{ d=await db(); }catch(_){ return false; }',
  '  return new Promise(res=>{',
  '    try{',
  '      const t=d.transaction(STORE,"readwrite"), s=t.objectStore(STORE), q=s.get(id);',
  '      q.onsuccess=()=>{',
  '        const cur=(q.result&&typeof q.result==="object") ? q.result : {id:id, kind:"settings"};',
  '        const now=Date.now();',
  '        let list=Array.isArray(cur[field]) ? cur[field] : [];',
  '        if(keep&&keep.ms) list=list.filter(x=>x&&typeof x.at==="number"&&now-x.at<keep.ms);',
  '        list=list.concat(add);',
  '        if(keep&&keep.max&&list.length>keep.max) list=list.slice(list.length-keep.max);',
  '        s.put(Object.assign({},cur,{[field]:list, at:now}));',
  '      };',
  '      t.oncomplete=()=>res(true); t.onerror=()=>res(false); t.onabort=()=>res(false);',
  '    }catch(_){ res(false); }',
  '  });',
  '}',
  '/* settings.attempts (D1): one entry per delete-then-insert this device',
  '   began, kept 7 days and at most 1,000, so the new page can put back a',
  '   row whose insert never landed (design D2: a tombstone of this',
  '   account\'s within a minute of one of these, just before the switch -',
  '   the newest ones, which a cap keeps). */',
  'const S0_ATTEMPTS_ID="settings.attempts", S0_ATTEMPTS_KEEP={ms:7*24*60*60*1000, max:1000};',
  'function s0Attempt(entry){',
  '  const u=s0Uid(); if(u) entry.by=u;',
  '  return s0Append(S0_ATTEMPTS_ID,"entries",entry,S0_ATTEMPTS_KEEP);',
  '}',
  '/* What one attempt names: the record, its local id, and the row its',
  '   delete removes - by row id, or, when the record holds none, by the',
  '   identity cloudSyncOne\'s delete matches. */',
  'function s0AttemptOf(rec){',
  '  return {id:rec.id||null, lid:rec.lid||null, rowId:rec.rowId||null,',
  '    ident:rec.rowId ? null : {kind:rec.kind||"trait", name:rec.name, layer:rec.layer||"unsorted", status:rec.status||"wip"}};',
  '}',
  'function s0AttemptKey(e){ return JSON.stringify([e.id, e.rowId, e.ident]); }',
  '/* A LOOP\'S ATTEMPTS, NOTED TOGETHER (Decision 20, Ruling F-18). Save to',
  '   cloud, a group folder import, a layer rename and a sort send trait',
  '   after trait, and settings.attempts is rewritten whole on every append:',
  '   noted one by one, it was rewritten once per trait. Such a loop works',
  '   out first what it will send (s0AttemptRun) and hands that to each send',
  '   (ctx.s0Run); the first send notes itself and what is still to go, at',
  '   most S0_ATTEMPT_CHUNK entries, in one append, and the rest go by that',
  '   note.',
  '   A NOTE GOES STALE. The new page pairs a failed attempt with a tombstone',
  '   within a minute of it (design D2), and a push of a few hundred traits',
  '   runs longer than that (the controller\'s audit, Finding 7). So a send',
  '   whose note is S0_ATTEMPT_FRESH_MS old notes again, with what is still',
  '   to go: no entry is older than that when its delete goes.',
  '   A send the loop did not foresee - a record changed since, a file the',
  '   import names from its picture - notes itself, with what comes after',
  '   it. An entry noted for a send that then deletes nothing (a file that',
  '   would not decode, a send held) names a row that was not removed, which',
  '   the proof never pairs. An entry foreseen for a record not yet written',
  '   carries no local id; its id and identity name it. */',
  'let S0_ATTEMPT_FRESH_MS=30000, S0_ATTEMPT_CHUNK=100;   /* lets, so a spec can shorten them */',
  'function s0AttemptRun(recs){',
  '  const queue=[], index=new Map();',
  '  for(const r of (recs||[])){',
  '    if(!r||!r.id) continue;',
  '    const e=s0AttemptOf(r), k=s0AttemptKey(e);',
  '    if(!index.has(k)){ index.set(k,queue.length); queue.push({e:e, k:k}); }',
  '  }',
  '  return {queue:queue, index:index, noted:new Map(), done:new Set(), next:0, flight:null};',
  '}',
  '/* Before a delete-then-insert: its attempt noted, and fresh. run is the',
  '   loop\'s (s0AttemptRun), or nothing: a single save notes itself. */',
  'async function s0Attempted(rec,run){',
  '  const e=s0AttemptOf(rec);',
  '  if(!run) return s0Attempt(Object.assign({at:Date.now()},e));',
  '  const k=s0AttemptKey(e), qi=run.index.get(k);',
  '  const fresh=(x,now)=>{ const at=run.noted.get(x); return at!==undefined&&now-at<S0_ATTEMPT_FRESH_MS; };',
  '  const done=()=>{ run.done.add(k); if(qi!==undefined&&qi+1>run.next) run.next=qi+1; };',
  '  for(;;){',
  '    if(fresh(k,Date.now())){ done(); return true; }',
  '    if(!run.flight) break;',
  '    try{ await run.flight; }catch(_){ }',
  '  }',
  '  /* This one, then what is still to go after it: foreseen, and neither',
  '     sent nor noted fresh. No wait from the check above to run.flight. */',
  '  const now=Date.now(), add=[Object.assign({at:now},e)], keys=[k];',
  '  for(let j=(qi!==undefined ? qi+1 : run.next); j<run.queue.length&&add.length<S0_ATTEMPT_CHUNK; j++){',
  '    const q=run.queue[j];',
  '    if(q.k===k||run.done.has(q.k)||fresh(q.k,now)) continue;',
  '    add.push(Object.assign({at:now},q.e)); keys.push(q.k);',
  '  }',
  '  const u=s0Uid(); if(u) for(const a of add) a.by=u;',
  '  const p=s0Append(S0_ATTEMPTS_ID,"entries",add,S0_ATTEMPTS_KEEP).then(ok=>{',
  '    if(ok) for(const x of keys) run.noted.set(x,now);',
  '    return ok;',
  '  });',
  '  run.flight=p;',
  '  let ok=false;',
  '  try{ ok=await p; }catch(_){ ok=false; }',
  '  if(run.flight===p) run.flight=null;',
  '  done();',
  '  return ok;',
  '}',
  'const S0_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;',
  '/* STAGE 0 (A2): A FOLDER IMPORT\'S MOVED FILE OR MERGED RENAME STANDS IN',
  '   FOR THE OLD ROW. Both are found after bulkImport\'s loop has already',
  '   sent the new record (in a group it sends each file as it goes), so:',
  '   if the new record\'s row is made, that row is told which row it',
  '   replaces, before the old one is dropped. If the server cannot be told',
  '   - not sent yet (your own page sends at Save to cloud), held, or',
  '   refused - the record keeps the old row id as s0Replaces: the insert',
  '   that sends it uses it, and the new page\'s migration reads it. A row',
  '   id on a fresh record can only be this import\'s, so it is told whether',
  '   or not a later weight is still unsent (carryDecided can leave it so).',
  '   The old row is the old record\'s own, or, for one never sent, the row',
  '   it already stands in for: a file moved twice before Save to cloud',
  '   still names the first (the controller\'s audit). Only a uuid.',
  '   Written as its owner\'s: a sign-out, or a session refused during the',
  '   waits above, leaves nobody signed in, and dbPut would take the owner',
  '   off the record (Finding 4). And only into the store it read: a',
  '   sign-out or a switch during those waits moves db() to another store,',
  '   where the same id is another trait (Finding 5). Never throws: a',
  '   pairing that cannot be written leaves Change A\'s other pairing, never',
  '   a failed import.',
  '   TOLD MEANS THE ROW CAME BACK, AND THE RECORD LEARNS ITS NEW TIME (fix',
  '   round 1, the review of Task 12). The PATCH is an update, so the',
  '   server\'s touch trigger moves the row\'s updated_at; the record kept',
  '   the time of the write before, and the next Load from cloud or',
  '   catch-up found the row newer than it: the person\'s own import was',
  '   counted "changed in place by the group" and the record rewritten',
  '   (measured against PGlite with A0). So the PATCH asks for its row',
  '   back; it has told the server only when exactly one row comes back -',
  '   a 204, or [] for a row gone, told nobody - and the record then takes',
  '   that row\'s updated_at as rowAt, as cloudPatchOne does for the',
  '   weight. Only while it still holds that row and has nothing unsent:',
  '   unsent work is based on the row as it was at rowAt, and moving that',
  '   past a change nobody here saw would hide it from the pull\'s clash',
  '   check.',
  '   AND ONLY FOR THE IMPORT\'S HOME (Task 11 fix round 4, integrated):',
  '   home is the store, account and wsGen the import began in. gen is',
  '   this call\'s own, so a move before the call - during the import\'s',
  '   removal of the old record - left it unmoved; the read asks s0Blocked',
  '   for home, the PATCH asks s0SendHome after the headers\' wait, and',
  '   the writes ask s0AtHome as well as wsStill(gen). */',
  'async function s0StandsIn(old,newId,home){',
  '  const gen=wsGen;',
  '  const s0Home=home||s0HomeNow();',
  '  const was=(old&&old.rowId)||(old&&old.s0Replaces);',
  '  if(!(typeof was==="string"&&S0_UUID.test(was))) return false;',
  '  try{',
  '    const rec=await dbGet(newId);',
  '    if(!rec||rec.rowId===was) return false;',
  '    let told=false, at=null;',
  '    if(rec.rowId&&activeWs&&!(await s0Blocked(false,s0Home))){',
  '      const h=await sbHeaders({"Content-Type":"application/json"});',
  '      if(h&&s0SendHome(s0Home)){',
  '        const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
  '          {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h), body:JSON.stringify({replaces:was})});',
  '        let rows=[];',
  '        if(r&&r.ok){ try{ rows=await r.json(); }catch(_){ rows=[]; } }',
  '        told=Array.isArray(rows)&&rows.length===1&&!!rows[0];',
  '        if(told) at=rows[0].updated_at||null;',
  '      }',
  '    }',
  '    const cur=await dbGet(newId);',
  '    /* No wait from here to dbPut, which picks its store as it is called. */',
  '    if(!s0AtHome(s0Home)) return told;',
  '    if(!wsStill(gen)) return told;',
  '    if(told){',
  '      if(at&&cur&&cur.rowId===rec.rowId&&cur.synced){ try{ await dbPut(Object.assign({},cur,{rowAt:at}),"sent",cur.by===undefined?null:cur.by); }catch(_){} }',
  '    }else if(cur&&cur.s0Replaces!==was){ cur.s0Replaces=was; await dbPut(cur,undefined,cur.by===undefined?null:cur.by); }',
  '    return told;',
  '  }catch(_){ return false; }',
  '}',
  'async function dbDelShared(rec,home,why){',
]);

/* ---- 2. cloudSyncOne: noted, then the delete, then the insert ----------- */
doc.swap('    await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",headers:h});', [
  '    /* STAGE 0 (D1, A2): THE ROW THIS INSERT STANDS IN FOR, sent as replaces',
  '       so Change A can pair the two exactly: a move\'s source (cloudMoveOne',
  '       passes ctx.replaces), else the row the record holds, else the row a',
  '       folder import found it replaces (s0Replaces), else the one row this',
  '       delete removes - it now asks for the removed rows back. Noted first',
  '       in settings.attempts, so a page closed between the delete and the',
  '       insert still has it: on its own for a single save, with the rest of',
  '       its loop for Save to cloud, an import, a layer rename or a sort',
  '       (ctx.s0Run, Decision 20). */',
  '    let replaces=ctx.replaces||rec.rowId||rec.s0Replaces||null;',
  '    await s0Attempted(rec,ctx.s0Run);',
  '    /* The note is a wait: the DELETE asks for the save\'s home again after',
  '       it (Task 11 fix round 4, integrated). */',
  '    if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));',
  '    const dr=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",',
  '      headers:Object.assign({Prefer:"return=representation"},h)});',
  '    if(!replaces && dr && dr.ok){',
  '      try{ const gone=await dr.json(); if(Array.isArray(gone)&&gone.length===1&&gone[0]&&gone[0].id) replaces=gone[0].id; }catch(_){ }',
  '    }',
  '    /* A uuid or nothing: anything else would fail the insert (22P02). */',
  '    if(!(typeof replaces==="string"&&S0_UUID.test(replaces))) replaces=null;',
]);

doc.swap([
  '    const rowBody=JSON.stringify([{collection_id:c.id, team_id:team, owner:u.id,',
  '        kind:rec.kind, name:rec.name,',
  '        layer:rec.layer||"unsorted", status:rec.status||"wip",',
  '        rarity:(typeof rec.rarity==="number"?rec.rarity:1),',
  '        shelf_order:(typeof rec.shelfOrder==="number"?rec.shelfOrder:null),',
  '        w:rec.w||1, h:rec.h||1, path:p}]);',
], [
  '    const row={collection_id:c.id, team_id:team, owner:u.id,',
  '        kind:rec.kind, name:rec.name,',
  '        layer:rec.layer||"unsorted", status:rec.status||"wip",',
  '        rarity:(typeof rec.rarity==="number"?rec.rarity:1),',
  '        shelf_order:(typeof rec.shelfOrder==="number"?rec.shelfOrder:null),',
  '        w:rec.w||1, h:rec.h||1, path:p};',
  '    /* STAGE 0: only with a predecessor, so a first insert is today\'s body. */',
  '    if(replaces) row.replaces=replaces;',
  '    const rowBody=JSON.stringify([row]);',
]);

/* ---- 3. cloudSyncOne: a pairing told stops being kept ------------------- */
doc.swap('    let madeId=null, madeAt=null;', [
  '    let madeId=null, madeAt=null;',
  '    /* STAGE 0 (A2): THIS INSERT MADE A ROW THAT NAMES WHAT IT REPLACES, so',
  '       a pairing the record kept for its insert (s0Replaces) has been told,',
  '       and the two writes below stop keeping it: left, it outlived the row',
  '       it paired and read as the predecessor of every later one (the',
  '       controller\'s audit, its note on the sent write). Only when this',
  '       insert made the row - an adopted row was found by its identity, not',
  '       known to carry it - and only the pairing the insert carried: when',
  '       the record\'s own row went first, the older pairing is the only',
  '       note of that one, and stays. */',
  '    const s0Told=!adopted&&!!r&&r.ok&&!!replaces;',
]);
doc.swap('      if(cur && !cur.synced && s0AtHome(s0Home)){ try{ await dbPut(Object.assign({},cur,{rowId:madeId, rowAt:madeAt})); }catch(_){} }', [
  '      if(cur && !cur.synced && s0AtHome(s0Home)){',
  '        const nx=Object.assign({},cur,{rowId:madeId, rowAt:madeAt});',
  '        if(s0Told&&nx.s0Replaces===replaces) delete nx.s0Replaces;   /* STAGE 0 (A2), above */',
  '        try{ await dbPut(nx); }catch(_){}',
  '      }',
]);
doc.swap('      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;', [
  '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;',
  '      if(s0Told&&up.s0Replaces===replaces) delete up.s0Replaces;   /* STAGE 0 (A2), above */',
]);

/* ---- 4. cloudMoveOne: the old copy's row, and the loop's run ------------ */
doc.swap('async function cloudMoveOne(oldRec,newRec,why,home){', [
  '/* s0Run: the attempts of the loop this move is one of (s0AttemptRun), when',
  '   a loop calls it - a layer rename, a sort. After home (Task 11 fix',
  '   round 4), which every caller that passes s0Run also passes. */',
  'async function cloudMoveOne(oldRec,newRec,why,home,s0Run){',
]);
doc.swap('  const arrived=await cloudSyncOne(fresh,ctx||{home:s0Home},why);', [
  '  /* STAGE 0 (A2): this insert stands in for the row the old copy is on. */',
  '  const arrived=await cloudSyncOne(fresh,Object.assign({},ctx||{home:s0Home},{replaces:(oldRec&&oldRec.rowId)||null, s0Run:s0Run||null}),why);',
]);

/* ---- 5. bulkImport: the moved file and the merged rename ---------------- */
/* Both calls hand s0StandsIn the import's home: the removal just above is
   a wait (Task 11 fix round 4, integrated). */
doc.swap(['      /* The server copy too, or the next pull brings it back. */', '      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}', '      moved++; movedIds.add(rec.id);'], [
  '      /* The server copy too, or the next pull brings it back. */',
  '      /* STAGE 0 (A2): first, the moved file\'s record names the row it replaces. */',
  '      if(to&&freshIds.has(to.id)) await s0StandsIn(rec,to.id,s0Home);',
  '      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}',
  '      moved++; movedIds.add(rec.id);',
]);
doc.swap(['      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}', '      mergedAway.push(rec.name+" into "+onto.name);'], [
  '      await s0StandsIn(rec,onto.id,s0Home);   /* STAGE 0 (A2): the renamed file stands in for this row */',
  '      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}',
  '      mergedAway.push(rec.name+" into "+onto.name);',
]);

/* ---- 6. the two rebuilds keep the pairing (Finding 1) ------------------- */
doc.swap('      if(base.lid) rec.lid=base.lid;', [
  '      if(base.lid) rec.lid=base.lid;',
  '      /* STAGE 0 (A2): and the row it stands in for, until it is sent. */',
  '      if(base.s0Replaces) rec.s0Replaces=base.s0Replaces;',
]);
doc.swap('        if(prev&&prev.lid) trec.lid=prev.lid;   /* STAGE 0: as rowId (B1) */', [
  '        if(prev&&prev.lid) trec.lid=prev.lid;   /* STAGE 0: as rowId (B1) */',
  '        if(prev&&prev.s0Replaces) trec.s0Replaces=prev.s0Replaces;   /* STAGE 0 (A2): as rowId */',
]);

/* ---- 7. the loops note together (Ruling F-18) --------------------------- */
doc.swap('  async function pusher(){', [
  '  /* STAGE 0 (Decision 20, Ruling F-18): this run\'s attempts, noted',
  '     together (s0AttemptRun). A light one is patched, not deleted; if its',
  '     row is gone and it falls through to the upload, it notes itself. */',
  '  ctx.s0Run=s0AttemptRun(fresh.filter(j=>!j.light).map(j=>j.it));',
  '  async function pusher(){',
]);
doc.swap('      pushCtx={u:u, team:await cloudTeam(), c:u?await cloudCollection(u):null, home:s0Home};', [
  '      pushCtx={u:u, team:await cloudTeam(), c:u?await cloudCollection(u):null, home:s0Home, s0Run:s0Run};',
]);
doc.swap('  const sameArt=[];', [
  '  const sameArt=[];',
  '  /* STAGE 0 (Decision 20, Ruling F-18): WHAT THIS IMPORT WILL SEND, worked',
  '     out before the loop, so its attempts are noted together (uploadCtx',
  '     hands them to each send). In a group each file is sent as the loop',
  '     reaches it, and noted one by one that rewrote settings.attempts once',
  '     per file. From the path: the id, and the row a same-id replacement',
  '     deletes. A file already here and unchanged sends nothing and is left',
  '     out - its picture is hashed here, and the loop takes that hash rather',
  '     than hashing it again. A file the import names from its picture',
  '     (looksUnnamed) is named only by the loop, and notes itself when sent. */',
  '  const s0Sigs=new Map();',
  '  let s0Run=null;',
  '  if(activeWs){',
  '    try{',
  '      const plan=[], seen=new Set();',
  '      for(const f of list){',
  '        const info=readPath(f.webkitRelativePath||f.name);',
  '        if(info.isRef&&!info.layer){ plan.push({id:"ref_"+info.name, kind:"ref", name:info.name}); continue; }',
  '        if(looksUnnamed(info.name)) continue;',
  '        const layer=info.layer||"unsorted", status=info.status||"wip";',
  '        const tid="t_"+info.name+"_"+layer+"_"+status;',
  '        const prev=seen.has(tid) ? null : (beforeById.get(tid)||null);',
  '        seen.add(tid);',
  '        const pic=await fileSig(f);',
  '        s0Sigs.set(f,pic);',
  '        if(prev&&pic&&await recSig(prev)===pic) continue;',
  '        plan.push({id:tid, kind:"trait", name:info.name, layer:layer, status:status,',
  '          rowId:(prev&&prev.rowId)||null, lid:(prev&&prev.lid)||null});',
  '      }',
  '      s0Run=s0AttemptRun(plan);',
  '    }catch(_){ s0Run=null; }',
  '  }',
]);
doc.swap('        const sig=await fileSig(f);', [
  '        const sig=s0Sigs.has(f) ? s0Sigs.get(f) : await fileSig(f);   /* STAGE 0: hashed above, in a group */',
]);
doc.swap('  const rows=plan.both.concat(plan.move,plan.rename);', [
  '  const rows=plan.both.concat(plan.move,plan.rename);',
  '  /* STAGE 0 (Decision 20, Ruling F-18): the moves\' attempts, noted together. */',
  '  const s0Run=s0AttemptRun(rows.map(r=>{ const old=items.find(i=>i.id===r.id);',
  '    return old ? Object.assign({},old,{id:"t_"+r.toName+"_"+r.toLayer+"_"+(r.status||"wip"), name:r.toName, layer:r.toLayer, rowId:null}) : null; }));',
]);
doc.swap('      const shared=await cloudMoveOne(old,rec,undefined,s0Home);', [
  '      const shared=await cloudMoveOne(old,rec,undefined,s0Home,s0Run);',
]);
doc.swap('  const mine=items.filter(i=>i.kind==="trait"&&i.layer===from);', [
  '  const mine=items.filter(i=>i.kind==="trait"&&i.layer===from);',
  '  /* STAGE 0 (Decision 20, Ruling F-18): the moves\' attempts, noted together.',
  '     A name taken on the new layer is renamed below and notes itself. */',
  '  const s0Run=s0AttemptRun(mine.map(t=>Object.assign({},t,{id:"t_"+t.name+"_"+to+"_"+(t.status||"wip"), layer:to, rowId:null})));',
]);
doc.swap('    const shared=await cloudMoveOne(t,rec,undefined,s0Home);', [
  '    const shared=await cloudMoveOne(t,rec,undefined,s0Home,s0Run);',
]);

doc.finish(({ code, must }) => {
  must('if(replaces) row.replaces=replaces;', 'the insert does not carry replaces');
  must('if(!(typeof replaces==="string"&&S0_UUID.test(replaces))) replaces=null;', 'a non-uuid could be sent as replaces');
  must('let replaces=ctx.replaces||rec.rowId||rec.s0Replaces||null;', 'an import\'s moved file would not carry its predecessor');
  must('await s0Attempted(rec,ctx.s0Run);', 'the attempt is not noted before the delete');
  must('if(to&&freshIds.has(to.id)) await s0StandsIn(rec,to.id,s0Home);', 'a moved file does not name its row, for the import\'s home');
  must('await s0StandsIn(rec,onto.id,s0Home);', 'a merged rename does not name its row, for the import\'s home');
  must('const was=(old&&old.rowId)||(old&&old.s0Replaces);', 'a record moved twice before it is sent loses the pairing');
  must('await dbPut(cur,undefined,cur.by===undefined?null:cur.by);', 'the pairing could take the owner off the record (Finding 4)');
  must('if(base.s0Replaces) rec.s0Replaces=base.s0Replaces;', 'saveTraitNow drops the pairing (Finding 1)');
  must('if(prev&&prev.s0Replaces) trec.s0Replaces=prev.s0Replaces;', 'a same-id replacement drops the pairing (Finding 1)');
  must('const s0Told=!adopted&&!!r&&r.ok&&!!replaces;', 'a pairing told is kept for ever');
  must('if(s0Told&&nx.s0Replaces===replaces) delete nx.s0Replaces;', 'an edit during the insert keeps a pairing told');
  must('if(s0Told&&up.s0Replaces===replaces) delete up.s0Replaces;', 'the sent write keeps a pairing told');
  must('ctx.s0Run=s0AttemptRun(fresh.filter(j=>!j.light).map(j=>j.it));', 'Save to cloud notes each trait on its own (F-18)');
  must('c:u?await cloudCollection(u):null, home:s0Home, s0Run:s0Run};', 'a group import notes each file on its own (F-18)');
  must('const sig=s0Sigs.has(f) ? s0Sigs.get(f) : await fileSig(f);', 'the import hashes each file twice');
  must('const shared=await cloudMoveOne(old,rec,undefined,s0Home,s0Run);', 'a sort notes each move on its own (F-18)');
  must('const shared=await cloudMoveOne(t,rec,undefined,s0Home,s0Run);', 'a layer rename notes each move on its own (F-18)');
  must('async function cloudMoveOne(oldRec,newRec,why,home,s0Run){', 'cloudMoveOne does not take its loop\'s run after the home');
  must('s0Run:s0Run||null}),why);', 'cloudMoveOne does not pass its loop\'s run');
  const at = code.indexOf('await s0Attempted(rec,ctx.s0Run);'), del = code.indexOf('const dr=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",');
  if (!(at >= 0 && del > at)) throw new Error('the attempt must be noted before its delete is sent');
  /* Integrated over Task 11 fix round 4: both guards stand around the note -
     fix 4's s0SendHome before it, and one after it, with no wait between
     that one and the DELETE. */
  const shBefore = code.lastIndexOf('if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));', at);
  const between = code.slice(at + 'await s0Attempted(rec,ctx.s0Run);'.length, del);
  if (!(shBefore >= 0 && at - shBefore < 400)) throw new Error('fix 4\'s check before the attempt\'s note is gone');
  if (between.indexOf('if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));') < 0 || /await /.test(between))
    throw new Error('the DELETE does not ask for its home after the attempt\'s note, with no wait between');
  /* s0StandsIn: the import's home for its read, its PATCH and its writes,
     and Task 12's own gen check still there. */
  must('if(rec.rowId&&activeWs&&!(await s0Blocked(false,s0Home))){', 's0StandsIn\'s read is not judged for the import\'s home');
  must('if(h&&s0SendHome(s0Home)){', 's0StandsIn\'s PATCH does not ask for the import\'s home after the headers\' wait');
  must('if(!s0AtHome(s0Home)) return told;', 's0StandsIn writes after a move the import began before');
  if ((code.match(/fetch\(SB_URL\+"\/rest\/v1\/traits",\{method:"POST"/g) || []).length !== 1) throw new Error('there should still be exactly one trait insert');
  /* Fix round 1: the PATCH asks for its row back, told means one row came
     back, and the record learns that row's time. */
  must('headers:Object.assign({Prefer:"return=representation"},h), body:JSON.stringify({replaces:was})});', 'the pairing PATCH does not ask for its row back');
  must('told=Array.isArray(rows)&&rows.length===1&&!!rows[0];', 'a PATCH that came back with no row counts as told');
  must('if(at&&cur&&cur.rowId===rec.rowId&&cur.synced){ try{ await dbPut(Object.assign({},cur,{rowAt:at}),"sent",cur.by===undefined?null:cur.by); }catch(_){} }',
    'the record keeps a time the PATCH moved on (fix round 1)');
  /* Finding 5, and fix round 1's write: the store check comes after the
     second read and before both dbPuts, and nothing else waits after it. */
  const f = code.indexOf('async function s0StandsIn(old,newId,home){'), end = code.indexOf('async function dbDelShared(rec,home,why){', f);
  const rd = code.indexOf('const cur=await dbGet(newId);', f), gd = code.indexOf('if(!wsStill(gen)) return told;', f);
  if (!(f >= 0 && end > f && rd > f && gd > rd && gd < end)) throw new Error('s0StandsIn must check the store after its second read');
  const tail = code.slice(gd, end);
  if ((tail.match(/await /g) || []).length !== 2 || (tail.match(/await dbPut\(/g) || []).length !== 2)
    throw new Error('s0StandsIn must write only after its store check, and wait for nothing else there');
});
