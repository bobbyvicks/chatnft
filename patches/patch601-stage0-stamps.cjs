/* STAGE 0, PART 2 OF 7: WHOSE RECORD, AND WHAT KIND OF WRITE.

   Design B1: "Stage 0 records every uid that signs in on the browser, and
   stamps the records and drafts it writes with the signed-in uid", and
   "stamps every record with a stable local id at its first write, carried by
   every re-id path exactly as the row id is"; D1: "Every write stage 0 makes
   is stamped with its kind, a person's change or a pull".

   Stamped where records are written - dbPut (index.html:4322) and
   dbApplyShelfRecords (4373), each in the same transaction as a read of what
   the write replaces, so a record written again under its own id keeps its
   local id. draftsFollow (10962-10989) is the third write path: it moves a
   draft by spreading the stored one, so it keeps whatever stamps it had and
   adds none. A record from before stage 0 has no stamp, which is how the
   new page tells the two apart.

   The kind defaults to "person"; the pull's three writes (the repair
   19785, the download 19845, the draft re-time 19854) pass "pull", and the
   two writes that mark a change as sent (16447, 19003) pass "sent". But a
   pull's write is stamped "pull" only when what it writes is a copy the
   server has (synced). Two of its writes are not: the repair merges the
   server's row into a record whose picture was never sent (19729-19737,
   synced carried at 3597), and the re-time touches a person's unsaved
   drawing. Both stay "person", and keep the uid they carried - a pull by
   account B must not make account A's unsent work B's (B1: "Records
   stamped with another uid wait for that account"). A draft is always
   "person".

   The local id is carried by hand on the two paths that build a fresh record
   under a new id and carry the row id by hand (saveTraitNow 6100, bulkImport
   12417); every other re-id path spreads the record, so it carries itself.

   And one fix the stamps need: cloudSignOut (18326) left wsGen alone, so a
   group pull still downloading when the person signed out wrote the group's
   rows into the personal store, stamped with nobody. It bumps wsGen now, as
   wsSwitch does (20199).

   Fix round 1 (review, 2026-09-28); each was measured red on 1e026db first.
   - cloudPull noted its generation only after four waits (the sign-in
     check, the collection, the headers, the row listing), so a sign-out
     during them was taken for the pull's own generation and the group's
     rows still landed in the personal store. It is noted before the first
     await now. Nothing on that path bumps wsGen itself, so a pull never
     stops itself (checked by call closure: neither wsSwitch nor
     cloudSignOut is reachable from it).
   - The drawing saved as a session ends lost its owner. autosaveNow encodes
     first and writes a task later, by which time sessionEnded and
     cloudSignOut have let the uid go, and the draft was written with no
     owner, over one that had one. autosaveNow now takes the uid as it
     starts, with the key, the trait and the size, and dbPut stamps the
     draft with it (dbPut's third argument; every other caller passes none
     and is stamped as before). cloudSignOut saves an autosave still waiting
     before it lets the uid go, as sessionEnded does.

   Fix round 2 (review, 2026-09-28), measured red on 7dc05fc first. An
   autosave chooses its store when its write lands, a task after it starts,
   so a sign-out or a project switch in between filed a group's drawing in
   the store it moved to: the personal one, or the other group. It did so
   for an autosave still waiting and for one already being written.
   sessionEnded changes no store, and its save already landed right
   (measured), so it is unchanged. s0FlushAutosave writes an autosave still
   waiting and answers a promise for the write in flight, bounded by
   S0_FLUSH_MS; cloudSignOut and wsSwitch wait for it before they change
   activeWs, the uid or wsGen. With nothing waiting and nothing being
   written, both go on at once, with no write and no wait, as before.

   Fix round 3 (re-review, 2026-09-28), each measured red on 807d746 first.
   - cloudRender's offline and deadline branch treated the stored session as
     signed in but never set s0SeenUid, so a drawing saved by a later
     refusal had no owner. It sets it from that session now, and registers
     it.
   - Sign-out takes the page down before its wait. Only the store, the uid
     and wsGen wait, and a second press during the wait is the same
     sign-out.
   - wsSwitch compares with the latest project asked for, so a switch back
     during the wait is not dropped and two to one project run once.
   - cloudPull's repair asks wsStill again after dbDel and after
     draftsFollow, just before the next write. (Superseded by round 4.)

   Fix round 4 (re-review of round 3, 2026-09-28), each measured first.
   - The repair writes the new id first, moves the drafts second and
     removes the old id last, asking wsStill before each, so a stop between
     two steps leaves the record twice, never nowhere. Round 3's order,
     delete first, lost an unsent trait whose id collided with the server's
     row (the comment it carried said a re-id repair was only ever of a
     synced copy, and that was false). The next pull does not settle the
     pair it leaves (measured). (Superseded by round 5.)
   - Sign-out clears the stored session before its wait, not after, and
     the sign-in card takes no sign-in during the wait.
   - A second switch to where a waiting switch is going is handed that
     switch's own promise, so its caller goes on once the store has moved.
   - The offline branch's comment no longer says its session is the auth
     server's answer: a sign-in link's fragment is stored unchecked, so the
     uid it registers is unverified.

   Fix round 5 (ruling on round 4's open question, 2026-09-28). The pull's
   re-id is one IndexedDB transaction, s0ReidTx (beside
   dbApplyShelfRecords): the old id deleted, the record put under the new
   one stamped as a pull's write, and the drawing moved by draftsFollow's
   rule. It is created in the same run as the ask before it, on the
   connection db() gave; only after it commits, and a second ask, are the
   other tabs told and the editor let follow. A stop now leaves nothing
   changed or everything done: round 4's ordered writes left a pair that
   the next pull turned into a second trait, "cap-2", or never settled
   (measured). The drawing no longer waits on the editor before its store
   is chosen. draftsFollow is unchanged for its other callers. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['function s0CloseAll(name){', 'patch600 is not applied']]);

doc.swap([
  "async function dbPut(rec){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{",
  "  const t=d.transaction(STORE,'readwrite'); t.objectStore(STORE).put(rec);",
  "  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }",
], [
  '/* STAGE 0 (design B1 and D1): WHOSE RECORD, AND WHAT KIND OF WRITE.',
  '   Every trait, reference and draft this page writes carries:',
  '     by   the uid it belongs to: the one signed in when a person wrote it,',
  '          left off when none is known; a pull\'s write of something unsent',
  '          keeps the uid it already had;',
  '     wk   "person" for a change a person made, "pull" for a copy a pull wrote',
  '          that the server has (synced), "sent" for the write that marks a',
  '          change as having reached the server;',
  '     lid  (traits and references) a local id given at the first write and',
  '          carried by every path that gives the record a new id, as rowId is.',
  '   The new page reads them: a pull is dropped, a person\'s unsent change',
  '   becomes an op, and a record stamped with another account waits for that',
  '   account. A record from before stage 0 has none of the three. A draft is',
  '   always "person": it is somebody\'s drawing, whoever re-stamped it. */',
  'const S0_UIDS="pb.uids";',
  'let s0SeenUid=null;',
  '/* The account signed in: the one cloudRender verified, or took from the',
  '   stored session when it could not ask (fix round 3); else the stored',
  '   session\'s user; else the subject of its access token, which a session',
  '   from the sign-in link carries before anything has been verified. */',
  'function s0Uid(){',
  '  if(s0SeenUid) return s0SeenUid;',
  '  try{',
  '    const s=sbLoadSession();',
  '    if(s&&s.user&&s.user.id) return String(s.user.id);',
  '    const p=(s&&s.access_token) ? String(s.access_token).split(".") : [];',
  '    if(p.length===3){',
  '      const b=p[1].replace(/-/g,"+").replace(/_/g,"/");',
  '      const claims=JSON.parse(atob(b+"===".slice((b.length+3)%4)));',
  '      if(claims&&claims.sub) return String(claims.sub);',
  '    }',
  '  }catch(_){ }',
  '  return null;',
  '}',
  '/* Every uid that signs in on this browser (B1), with when it first and',
  '   last did, in localStorage. */',
  'function s0Register(uid){',
  '  if(!uid) return;',
  '  try{',
  '    let m={}; try{ m=JSON.parse(localStorage.getItem(S0_UIDS)||"{}")||{}; }catch(_){ m={}; }',
  '    if(typeof m!=="object"||Array.isArray(m)) m={};',
  '    const now=Date.now(), e=(m[uid]&&typeof m[uid]==="object") ? m[uid] : {first:now};',
  '    e.last=now; m[uid]=e;',
  '    localStorage.setItem(S0_UIDS,JSON.stringify(m));',
  '  }catch(_){ }',
  '}',
  'function s0NewLid(){',
  '  try{ if(typeof crypto==="object"&&typeof crypto.randomUUID==="function") return "l_"+crypto.randomUUID(); }catch(_){ }',
  '  return "l_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12);',
  '}',
  'function s0Stamps(rec){ return !!rec && (rec.kind==="trait"||rec.kind==="ref"||rec.kind==="autosave"); }',
  '/* stored: what the store held under this id, read in the same transaction',
  '   (null when the caller did not need it read). uid: the account a',
  '   person\'s write is stamped with, when the caller took it before this',
  '   ran - null meaning nobody was signed in then. Left out, it is whoever',
  '   is signed in now; only autosaveNow passes it (fix round 1). */',
  'function s0Stamp(rec,stored,wk,uid){',
  '  const draft=rec.kind==="autosave";',
  '  if(!draft && !rec.lid) rec.lid=(stored&&stored.lid)||s0NewLid();',
  '  /* A pull writing something unsent - a draft it re-times, or the server\'s',
  '     row merged into a record whose picture never went up - is neither a',
  '     pull\'s copy nor the signed-in account\'s act: it keeps whose it was. */',
  '  const keep=wk==="pull" && (draft||!rec.synced);',
  '  const u=keep ? (rec.by||(stored&&stored.by)||null) : (uid!==undefined ? uid : s0Uid());',
  '  if(u) rec.by=u; else delete rec.by;',
  '  rec.wk=(!draft&&!keep&&(wk==="pull"||wk==="sent")) ? wk : "person";',
  '  return rec;',
  '}',
  "async function dbPut(rec,wk,uid){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{",
  "  const t=d.transaction(STORE,'readwrite'), s=t.objectStore(STORE);",
  '  /* A person\'s draft needs nothing from what it replaces: stamped as it goes. */',
  '  if(s0Stamps(rec)&&rec.kind==="autosave"&&wk!=="pull") s.put(s0Stamp(rec,null,wk,uid));',
  '  else if(s0Stamps(rec)){ const q=s.get(rec.id); q.onsuccess=()=>{ s.put(s0Stamp(rec,q.result,wk,uid)); }; }',
  '  else s.put(rec);',
  "  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }",
]);

doc.swap([
  'async function dbApplyShelfRecords(deleteIds,records){',
  '  for(const id of deleteIds) touch(id);',
  '  for(const r of records) touch(r&&r.id);',
  '  const d=await db();',
  '  return new Promise((res,rej)=>{',
  "    const t=d.transaction(STORE,'readwrite'), s=t.objectStore(STORE);",
  '    for(const id of new Set(deleteIds.filter(Boolean))) s.delete(id);',
  '    for(const record of records) s.put(record);',
], [
  'async function dbApplyShelfRecords(deleteIds,records,wk){',
  '  for(const id of deleteIds) touch(id);',
  '  for(const r of records) touch(r&&r.id);',
  '  const d=await db();',
  '  return new Promise((res,rej)=>{',
  "    const t=d.transaction(STORE,'readwrite'), s=t.objectStore(STORE);",
  '    for(const id of new Set(deleteIds.filter(Boolean))) s.delete(id);',
  '    /* STAGE 0: stamped as dbPut stamps. Read after the deletes above, so a',
  '       record put back under its own id reads as absent - and keeps the',
  '       local id it carries, because every caller builds it by spreading',
  '       the record it read. */',
  '    for(const record of records){',
  '      if(s0Stamps(record)){ const q=s.get(record.id); q.onsuccess=()=>{ s.put(s0Stamp(record,q.result,wk)); }; }',
  '      else s.put(record);',
  '    }',
]);

/* Fix round 5: the pull's re-id, as one transaction (used in cloudPull's
   repair loop, below). */
doc.swap('let shelfMoveBusy=false;', [
  '/* STAGE 0 (fix round 5): ONE RE-ID, ONE TRANSACTION. cloudPull\'s repair',
  '   gives a record a new id: the old id deleted, the record put under the',
  '   new one, stamped as dbPut stamps a pull\'s write, and the old id\'s',
  '   drawing moved to the new id by draftsFollow\'s rule - its at past the',
  '   record it lands on, read in this same transaction, and traitId the new',
  '   id; spread, so it keeps its stamps. All in one readwrite transaction on',
  '   STORE, as dbApplyShelfRecords does a shelf move, so it happens whole or',
  '   not at all. d is a connection the caller already holds, and the',
  '   transaction is created here synchronously: the caller asks whether the',
  '   pull still owns the store and creates it in the same run. A fourth',
  '   write path beside dbPut, dbApplyShelfRecords and draftsFollow. Answers',
  '   whether a drawing moved. */',
  'function s0ReidTx(d,oldId,rec){',
  '  return new Promise((res,rej)=>{',
  '    const t=d.transaction(STORE,"readwrite"), s=t.objectStore(STORE);',
  '    let moved=false;',
  '    s.delete(oldId);',
  '    const q=s.get(rec.id);',
  '    q.onsuccess=()=>{ s.put(s0Stamp(rec,q.result,"pull")); };',
  '    const dq=s.get(draftKey(oldId));',
  '    dq.onsuccess=()=>{',
  '      const got=dq.result;',
  '      if(!got) return;',
  '      /* Issued after the put above, so it reads the record just written. */',
  '      const rq=s.get(rec.id);',
  '      rq.onsuccess=()=>{',
  '        const now=rq.result;',
  '        const at=Math.max(Date.now(), (((now&&now.at)||0)+1));',
  '        s.put(Object.assign({},got,{id:draftKey(rec.id), traitId:rec.id, at:at}));',
  '        s.delete(draftKey(oldId));',
  '        moved=true;',
  '      };',
  '    };',
  '    t.oncomplete=()=>res(moved); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t));',
  '  });',
  '}',
  '',
  'let shelfMoveBusy=false;',
]);

doc.swap(['  authed=inn;', '  gateShow(!inn);'], [
  '  authed=inn;',
  '  /* STAGE 0 (B1): the account signed in, for the stamps, and added to the',
  '     browser\'s list of accounts. "Could not ask" returned above, leaving',
  '     whatever was known. */',
  '  s0SeenUid=(inn&&u&&u.id) ? String(u.id) : null;',
  '  if(s0SeenUid) s0Register(s0SeenUid);',
  '  gateShow(!inn);',
]);

/* Fix round 3: the uid of a session the page acts on without having asked. */
doc.swap([
  '    if(!authed && sbLoadSession()){',
  '      authed=true;',
  '      gateShow(false);',
  '      bootLocal();',
  '    }',
  '    return null;',
], [
  '    if(!authed && sbLoadSession()){',
  '      authed=true;',
  '      gateShow(false);',
  '      bootLocal();',
  '    }',
  '    /* STAGE 0 (fix round 3): WHOSE SESSION THIS IS, when the page treats',
  '       itself as signed in without having asked - opened with no signal, or',
  '       past the deadline. The uid was known only from the stored session,',
  '       which a refusal clears before sessionEnded saves the drawing, and',
  '       that draft was written with no owner (measured). Taken from the same',
  '       session the page is acting on, and put on this browser\'s list of',
  '       accounts, because the stamps already carry it and every uid a record',
  '       carries must be on the list the new page reads (B1).',
  '       THAT UID IS UNVERIFIED (fix round 4). The stored session is not',
  '       always the auth server\'s answer: a sign-in link\'s #access_token=',
  '       fragment is stored unchecked (sbCaptureFromHash), and a made-up',
  '       token whose subject is "someone-else", opened with no signal, put',
  '       "someone-else" on the list (measured). Nothing reads pb.uids in',
  '       stage 0; the next plan must treat a uid registered here, offline,',
  '       as unverified. */',
  '    if(authed && !s0SeenUid){ s0SeenUid=s0Uid(); if(s0SeenUid) s0Register(s0SeenUid); }',
  '    return null;',
]);

doc.swap('  activeWs=null; wsSave(null); cloudTeamId=null; sharedLayerSig=null;', [
  '  activeWs=null; wsSave(null); cloudTeamId=null; sharedLayerSig=null;',
  '  /* STAGE 0: nobody is signed in now. A pull still running for the project',
  '     just left - cloudPull, or the catch-up that runs one - stops: wsStill()',
  '     is how their writes ask, and only wsSwitch bumped this before, so a',
  '     pull that outlived a sign-out wrote the group\'s rows into the personal',
  '     store. Nothing else asks wsStill(). A push still in flight carries on,',
  '     and its confirmation - cloudSyncOne\'s "sent" write - lands in the',
  '     personal store, marked synced and with no owner, while the group\'s',
  '     own record stays unsent (measured, fix round 1). */',
  '  wsGen++; s0SeenUid=null;',
]);

doc.swap(['function cloudSignOut(){', '  sbSaveSession(null);'], [
  '/* A sign-out waiting for the drawing\'s last save (fix round 3). */',
  'let s0SignOutWait=null;',
  'function cloudSignOut(){',
  '  /* STAGE 0: A DRAWING\'S LAST SAVE LANDS WHERE IT WAS DRAWN, WITH ITS MAKER.',
  '     An autosave still waiting is written now, and one being written is',
  '     waited for, before anything below changes the store, the uid or wsGen.',
  '     autosaveNow takes the uid as it starts: saved after the uid went, the',
  '     drawing was stamped with nobody (fix round 1). A write lands in the',
  '     store activeWs names when it lands: without the wait, a group\'s',
  '     drawing was filed in the personal store (fix round 2). Both measured.',
  '     Only a save that is waiting or being written: saving unconditionally',
  '     would add a write that does not happen today. The wait is bounded',
  '     (S0_FLUSH_MS, at s0FlushAutosave): an encode that never calls back',
  '     holds sign-out up for 3 s, not for ever, and its write, if it ever',
  '     lands, lands in the personal store as before. With nothing waiting and',
  '     nothing being written - the common case - it signs out at once, with',
  '     no write and no wait, as it always did.',
  '     ONLY WHAT THE SAVE DEPENDS ON WAITS (fix round 3): the store, the uid',
  '     and wsGen. The account panel and the rest of the page come down at',
  '     once, as they do with nothing to wait for - left up, a project picked',
  '     during the wait was switched to after the sign-out and carried to the',
  '     next account on this device (measured). A second press during the',
  '     wait is the same sign-out, not another: it ran the sign-out twice.',
  '     THE STORED SESSION GOES AT ONCE TOO (fix round 4), after the flush',
  '     has started the waiting save (which took its uid then) and before',
  '     any wait. Kept through the wait, it was still stored for a tab',
  '     closed during it, while the page already showed it signed out, and',
  '     the clear after the wait undid a sign-in made during it (both',
  '     measured, re-review of round 3). Not cleared again after the wait: a session',
  '     stored meanwhile - a sign-in link, another tab - is someone signing',
  '     in, and cloudRender, below, finds it.',
  '     AND THE SIGN-IN CARD TAKES NO SIGN-IN UNTIL THE WAIT IS OVER (fix',
  '     round 4). It is refused rather than let through and kept: until the',
  '     wait ends the page is still the leaving account\'s - its project, its',
  '     uid, its wsGen - so a sign-in then would start the next account on',
  '     the leaving one\'s project, and the end of the wait would move it',
  '     off it and say "Signed out" over it. Refusing costs the person at',
  '     most S0_FLUSH_MS. inert takes the card out of reach of the pointer',
  '     and the keyboard, whose Enter signs in without its button; gateBusy',
  '     disables the buttons, as a sign-in in progress does, which also',
  '     shows it and stops a scripted click. */',
  '  if(s0SignOutWait) return s0SignOutWait;',
  '  const f=s0FlushAutosave();',
  '  sbSaveSession(null);',
  '  if(f){',
  '    gateShow(true);',
  '    const card=$("signin");',
  '    card.inert=true; gateBusy(true);',
  '    s0SignOutWait=f.then(()=>{ s0SignOutWait=null; try{ cloudSignOutNow(); }finally{ card.inert=false; gateBusy(false); } });',
  '    return s0SignOutWait;',
  '  }',
  '  cloudSignOutNow();',
  '}',
  '/* The rest of the sign-out, which waits for the drawing\'s last save. The',
  '   stored session is cleared before it, in cloudSignOut (fix round 4). */',
  'function cloudSignOutNow(){',
]);

/* Fix round 2: the store a drawing's last save lands in. */
doc.swap('function autosaveNow(){', [
  '/* STAGE 0 (fix round 2): THE DRAWING\'S LAST SAVE, WRITTEN BEFORE THE STORE',
  '   CHANGES. An autosave chooses its store when its write lands - dbPut reads',
  '   activeWs then, a task after autosaveNow starts - so what is about to',
  '   change activeWs waits for it first: cloudSignOut and wsSwitch.',
  '   s0FlushAutosave writes an autosave still waiting, and answers a promise',
  '   that settles once the write in flight has landed, or after S0_FLUSH_MS,',
  '   so nothing waiting on it can hang on an encode that never calls back.',
  '   It answers null when nothing is waiting or being written: the caller',
  '   goes on at once, with no write and no wait. */',
  'const S0_FLUSH_MS=3000;',
  'let s0SaveInFlight=null;',
  'function s0Saving(executor){',
  '  const p=new Promise(executor);',
  '  s0SaveInFlight=p;',
  '  const clear=()=>{ if(s0SaveInFlight===p) s0SaveInFlight=null; };',
  '  p.then(clear,clear);',
  '  return p;',
  '}',
  'function s0FlushAutosave(){',
  '  if(autoPending){ try{ autosaveNow(); }catch(_){ } }',
  '  const p=s0SaveInFlight;',
  '  if(!p) return null;',
  '  return Promise.race([p, new Promise(r=>setTimeout(r,S0_FLUSH_MS))]).then(()=>{},()=>{});',
  '}',
  'function autosaveNow(){',
]);
doc.swap(['  return new Promise(done=>{', '    art.toBlob(b=>{'], [
  '  /* STAGE 0: tracked while it is in flight (s0Saving, above). */',
  '  return s0Saving(done=>{',
  '    art.toBlob(b=>{',
]);
doc.swap(['async function wsSwitch(id){', '  if((id||null)===(activeWs||null)) return;', '  activeWs = id||null;'], [
  '/* The project the latest switch asked for, while switches wait for the',
  '   drawing\'s last save (fix round 3), and that switch\'s own promise (fix',
  '   round 4); undefined and null when none is waiting. */',
  'let s0WsWant, s0WsWanted=null;',
  '/* s0Waited: only this function passes it, when it runs itself again after',
  '   the wait (fix round 4); every other caller passes one argument. */',
  'async function wsSwitch(id,s0Waited){',
  '  id=id||null;',
  '  /* STAGE 0 (fix round 3): already there, or already asked for. A switch',
  '     waiting below has not moved activeWs yet, so comparing with activeWs',
  '     dropped a switch back to it - away and straight back ended away - and',
  '     let two switches to one project both run (both measured).',
  '     ALREADY ASKED FOR IS THE SAME SWITCH (fix round 4): its caller is',
  '     handed that switch\'s own promise, so it goes on only once the store',
  '     has moved. Returned at once, a second switch to where a waiting one',
  '     was going resolved in 0 ms with activeWs still the old project, and',
  '     the first finished later (measured) - and the callers that await a',
  '     switch act on its having happened: wsLeave deletes the database it',
  '     left, wsCreate and joinIfPending go on in the new project. */',
  '  if(s0WsWant!==undefined){ if(id===s0WsWant) return s0WsWanted; }',
  '  else if(id===(activeWs||null)) return;',
  '  /* STAGE 0: the drawing\'s last save lands in the project it was drawn in,',
  '     not the one switched to (fix round 2, measured): written, and waited',
  '     for, before activeWs moves. Nothing waiting: no write and no wait. Of',
  '     the switches that waited, only the latest goes on; one that ends where',
  '     the page already is does nothing. The one that goes on runs this',
  '     function again, told it has waited (fix round 4), so that it has one',
  '     promise for its whole run, which a duplicate is handed. */',
  '  const f=s0Waited ? null : s0FlushAutosave();',
  '  if(f){',
  '    s0WsWant=id;',
  '    const mine=f.then(()=>{',
  '      if(s0WsWant!==id) return;',
  '      s0WsWant=undefined; s0WsWanted=null;',
  '      if(id===(activeWs||null)) return;',
  '      return wsSwitch(id,true);',
  '    });',
  '    s0WsWanted=mine;',
  '    return mine;',
  '  }',
  '  activeWs = id||null;',
]);

doc.swap(['  try{ autosaveNow(); }catch(_){}', '  authed=false;'], [
  '  try{ autosaveNow(); }catch(_){}',
  '  authed=false;',
  '  s0SeenUid=null;   /* STAGE 0: nobody verified is signed in now */',
]);

doc.swap([
  '    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;',
  '    try{ await dbPut(up); }catch(_){}',
], [
  '    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;',
  '    try{ await dbPut(up,"sent"); }catch(_){}',
]);
doc.swap([
  '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;',
  '      try{ await dbPut(up); }catch(_){} }',
], [
  '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;',
  '      try{ await dbPut(up,"sent"); }catch(_){} }',
]);
doc.swap('      await dbPut(rp.record);', '      await dbPut(rp.record,"pull");');
/* Fix round 5 (it supersedes round 4's order - write, move the drawing,
   remove - and round 3's asks after the delete): a re-id is one
   transaction, s0ReidTx, created in the same run as the ask before it; the
   other tabs and the editor are told only after it commits, and only if
   the pull is still for this project. */
doc.swap([
  '      if(rp.oldId!==rp.record.id){',
  '        await dbDel(rp.oldId);',
  '        try{ await draftsFollow([{from:rp.oldId, to:rp.record.id}]); }catch(_){}',
  '      }',
  '      await dbPut(rp.record,"pull");',
  '      repaired++;',
], [
  '      /* STAGE 0 (fix round 5): A RE-ID IS ONE TRANSACTION (s0ReidTx): the',
  '         old id deleted, the record put under the new one and the old id\'s',
  '         drawing moved to it, together. A stop lands before it - nothing',
  '         changed, and the next pull repairs from the same state - or after',
  '         it - done. There is no pair to settle and nothing lost.',
  '         Round 4 made these three writes in an order, and a stop between',
  '         two left the record under both ids: the next pull re-id\'d the old',
  '         copy again as "cap-2" - two records for one row, and removing',
  '         either removes the row on the server - or left it (measured).',
  '         Round 3 deleted first, and a stop after the delete lost unsent',
  '         work: a re-id repair is not only of a synced copy, because ids',
  '         collide across the name/layer boundary ("cap" on "top_hats" and',
  '         "cap_top" on "hats" are both t_cap_top_hats_wip).',
  '         THE STORE IS THE PULL\'S. db() gives the connection; then, with no',
  '         wait between, the pull asks whether it is still for this project',
  '         and s0ReidTx creates the transaction on that connection. Only once',
  '         it has committed, and the pull is still for this project, are the',
  '         other tabs told of the move and the editor let follow it: told',
  '         after a stop, they were told of the wrong store. And the drawing',
  '         no longer waits on the editor before its store is chosen, which',
  '         left a window where a stop moved the personal store\'s own drawing',
  '         (measured, rounds 3 and 4). */',
  '      if(rp.oldId!==rp.record.id){',
  '        const d=await db();',
  '        if(!wsStill(gen)) break;',
  '        await s0ReidTx(d,rp.oldId,rp.record);',
  '        repaired++;',
  '        if(!wsStill(gen)) break;',
  '        touch(rp.oldId); touch(rp.record.id);',
  '        tabMoves.push({from:rp.oldId, to:rp.record.id}); tabsTell();',
  '        if(openRec&&openRec.id===rp.oldId){ try{ await editorFollows(openRec,rp.record.id); }catch(_){} }',
  '        continue;',
  '      }',
  '      await dbPut(rp.record,"pull");',
  '      repaired++;',
]);
doc.swap('        await dbPut(rec); added++;', '        await dbPut(rec,"pull"); added++;');
doc.swap('              await dbPut(Object.assign({},dr,{at:Math.max(Date.now(),(rec.at||0)+1)}));',
  '              await dbPut(Object.assign({},dr,{at:Math.max(Date.now(),(rec.at||0)+1)}),"pull");   /* STAGE 0: keeps its maker */');

/* Fix round 1: the pull notes its project before its first wait. */
doc.swap(['async function cloudPull(opts){', '  opts=opts||{};'], [
  'async function cloudPull(opts){',
  '  opts=opts||{};',
  '  /* STAGE 0: THE PROJECT THIS PULL IS FOR, noted before the first wait. It',
  '     was noted further down, after the sign-in check, the collection, the',
  '     headers and the row listing, and a sign-out during those bumped wsGen',
  '     before it was read: the pull took the signed-out generation for its',
  '     own and wrote the group\'s rows into the personal store (measured, fix',
  '     round 1). Nothing on the way there bumps wsGen itself, so this never',
  '     stops a pull on its own. */',
  '  const gen=wsGen;',
]);
doc.swap(['  const gen=wsGen;', '  $("cloudpull").disabled=true;'], [
  '  /* (gen: noted at the top of this function since stage 0 - see there.) */',
  '  $("cloudpull").disabled=true;',
]);

/* Fix round 1: the drawing a session saves on its way out keeps its maker. */
doc.swap('  const W=art.width, H=art.height, nm=fileName||"untitled.png";', [
  '  const W=art.width, H=art.height, nm=fileName||"untitled.png";',
  '  /* STAGE 0: AND WHOSE DRAWING IT IS, for the same reason. sessionEnded and',
  '     cloudSignOut save the drawing and let the uid go in the same run, so',
  '     the uid read when the write landed a task later was nobody\'s, and the',
  '     draft was written with no owner over one that had one (measured, fix',
  '     round 1). */',
  '  const by=s0Uid();',
]);
doc.swap('             w:W, h:H, blob:b, at:Date.now()})', '             w:W, h:H, blob:b, at:Date.now()},"person",by)');

doc.swap('      if(base.rowId) rec.rowId=base.rowId;', [
  '      if(base.rowId) rec.rowId=base.rowId;',
  '      /* STAGE 0: the local id goes wherever the row id goes (design B1). */',
  '      if(base.lid) rec.lid=base.lid;',
]);
doc.swap('        if(prev&&prev.rowId) trec.rowId=prev.rowId;', [
  '        if(prev&&prev.rowId) trec.rowId=prev.rowId;',
  '        if(prev&&prev.lid) trec.lid=prev.lid;   /* STAGE 0: as rowId (B1) */',
]);

doc.finish(({ code, must }) => {
  must('async function dbPut(rec,wk,uid){', 'dbPut does not take the kind of write and the uid');
  must('async function dbApplyShelfRecords(deleteIds,records,wk){', 'dbApplyShelfRecords does not take the kind');
  must('rec.wk=(!draft&&!keep&&(wk==="pull"||wk==="sent")) ? wk : "person";', 'a draft or unsent work could be stamped as a pull');
  must('const keep=wk==="pull" && (draft||!rec.synced);', 'a pull\'s write of unsent work would take the puller\'s uid');
  must('wsGen++; s0SeenUid=null;', 'sign-out does not stop a running pull');
  /* (Round 5: the pull's re-id is now a fourth write stamped "pull", in
     s0ReidTx, so the brief's count of every ',"pull")' is taken over by a
     count of dbPut's and a check on that one.) */
  if ((code.match(/dbPut\([^;]*,"pull"\)/g) || []).length !== 3) throw new Error('exactly three dbPut writes should pass "pull", found ' + (code.match(/dbPut\([^;]*,"pull"\)/g) || []).length);
  if ((code.match(/,"pull"\)/g) || []).length !== 4) throw new Error('exactly four writes should be stamped "pull" (three dbPut, one re-id)');
  must('q.onsuccess=()=>{ s.put(s0Stamp(rec,q.result,"pull")); };', 'the re-id\'s record is not stamped as a pull\'s write');
  if ((code.match(/dbPut\([^)]*,"sent"\)/g) || []).length !== 2) throw new Error('exactly two writes should be stamped "sent"');
  /* Fix round 1. */
  must('const u=keep ? (rec.by||(stored&&stored.by)||null) : (uid!==undefined ? uid : s0Uid());', 'a uid the caller took is not what its write is stamped with');
  /* Fix round 2 (it supersedes round 1's flush check). */
  must('if(autoPending){ try{ autosaveNow(); }catch(_){ } }', 'a waiting autosave is not written before the store changes');
  must('return Promise.race([p, new Promise(r=>setTimeout(r,S0_FLUSH_MS))])', 'the wait for a drawing\'s last save is not bounded');
  must('  return s0Saving(done=>{', 'autosaveNow\'s write is not tracked while it is in flight');
  const body = (sig) => { const a = code.indexOf(sig); if (a < 0) throw new Error('missing: ' + sig);
    const b = code.slice(a + sig.length).search(/\n(async )?function /); return code.slice(a, b < 0 ? undefined : a + sig.length + b); };
  const pull = body('async function cloudPull(opts){');
  if ((pull.match(/const gen=wsGen;/g) || []).length !== 1) throw new Error('cloudPull should note its generation exactly once');
  if (!(pull.indexOf('const gen=wsGen;') < pull.indexOf('await '))) throw new Error('cloudPull notes its generation after a wait');
  const save = body('function autosaveNow(){');
  if (!(save.indexOf('const by=s0Uid();') >= 0 && save.indexOf('const by=s0Uid();') < save.indexOf('art.toBlob('))) throw new Error('autosaveNow does not take the uid before the encode');
  if (save.indexOf('at:Date.now()},"person",by)') < 0) throw new Error('the autosave is not stamped with the uid it took');
  /* Fix round 2: what changes the store waits for the drawing's last save
     first, and with nothing to wait for goes on at once. */
  /* (Rounds 3 and 4 changed cloudSignOut's shape; this check is round 4's:
     the session cleared before the wait, and the card refusing a sign-in
     during it.) */
  if (!/if\(s0SignOutWait\) return s0SignOutWait;\s*const f=s0FlushAutosave\(\);\s*sbSaveSession\(null\);\s*if\(f\)\{\s*gateShow\(true\);\s*const card=\$\("signin"\);\s*card\.inert=true; gateBusy\(true\);\s*s0SignOutWait=f\.then\(\(\)=>\{ s0SignOutWait=null; try\{ cloudSignOutNow\(\); \}finally\{ card\.inert=false; gateBusy\(false\); \} \}\);\s*return s0SignOutWait;\s*\}\s*cloudSignOutNow\(\);\s*\}/.test(body('function cloudSignOut(){')))
    throw new Error('cloudSignOut does not clear the session first, take the page down and the card out of use, wait for the last save once, or go on at once with none');
  const now = body('function cloudSignOutNow(){');
  /* (Round 4: the session is no longer cleared here, after the wait.) */
  if (!(now.indexOf('sbSaveSession(') < 0 && now.indexOf('activeWs=null;') >= 0 && now.indexOf('activeWs=null;') < now.indexOf('wsGen++;')))
    throw new Error('the sign-out itself is not what cloudSignOut runs after the wait, or it clears the session again');
  const sw = body('async function wsSwitch(id,s0Waited){');
  /* (Rounds 3 and 4 changed wsSwitch's shape; this check is round 4's: a
     duplicate is handed the waiting switch's own promise, and the switch
     that goes on after the wait runs this same function again, told it has
     waited. The body stays in wsSwitch: groupcatchup.spec.js reads its
     source for the catch-up call, and a first try at this round, which moved
     the body out to its own function, failed that guard in the full run.) */
  if (!/if\(s0WsWant!==undefined\)\{ if\(id===s0WsWant\) return s0WsWanted; \}\s*else if\(id===\(activeWs\|\|null\)\) return;\s*const f=s0Waited \? null : s0FlushAutosave\(\);\s*if\(f\)\{\s*s0WsWant=id;\s*const mine=f\.then\(\(\)=>\{\s*if\(s0WsWant!==id\) return;\s*s0WsWant=undefined; s0WsWanted=null;\s*if\(id===\(activeWs\|\|null\)\) return;\s*return wsSwitch\(id,true\);\s*\}\);\s*s0WsWanted=mine;\s*return mine;\s*\}\s*activeWs = id\|\|null;\s*wsGen\+\+;/.test(sw))
    throw new Error('wsSwitch moves the store before the drawing\'s last save, does not go by the latest switch asked for, or does not hand a duplicate the switch in flight');
  if (sw.indexOf('groupCatchUp()') < 0) throw new Error('wsSwitch no longer runs the catch-up itself');
  const calls2 = code.replace('async function wsSwitch(id,s0Waited){', '').match(/wsSwitch\([^()]*,/g) || [];
  if (calls2.length !== 1 || calls2[0] !== 'wsSwitch(id,') throw new Error('only wsSwitch itself may say a switch has waited: ' + calls2.join(' | '));
  /* Fix round 3: the offline and deadline branch knows its uid, and the
     repair asks again just before each of its writes. */
  must('if(authed && !s0SeenUid){ s0SeenUid=s0Uid(); if(s0SeenUid) s0Register(s0SeenUid); }', 'a session the page could not check has no uid');
  /* (Round 3's two repair checks, and round 4's order - write, move the
     drafts, remove - are superseded by round 5's single transaction,
     checked here.) Fix round 5: a re-id is s0ReidTx, created in the same
     run as the ask before it; tabs and the editor only after it commits and
     a second ask; a same-id repair is the plain write it was, with no wait
     between the loop's first ask and it. */
  const loop = pull.slice(pull.indexOf('for(const rp of repair){'), pull.indexOf('const PULL_AT_ONCE=8;'));
  if (!/^for\(const rp of repair\)\{\s*if\(!wsStill\(gen\)\) break;/.test(loop)) throw new Error('the repair loop does not ask first');
  if (!/if\(rp\.oldId!==rp\.record\.id\)\{\s*const d=await db\(\);\s*if\(!wsStill\(gen\)\) break;\s*await s0ReidTx\(d,rp\.oldId,rp\.record\);\s*repaired\+\+;\s*if\(!wsStill\(gen\)\) break;\s*touch\(rp\.oldId\); touch\(rp\.record\.id\);\s*tabMoves\.push\(\{from:rp\.oldId, to:rp\.record\.id\}\); tabsTell\(\);\s*if\(openRec&&openRec\.id===rp\.oldId\)\{ try\{ await editorFollows\(openRec,rp\.record\.id\); \}catch\(_\)\{\} \}\s*continue;\s*\}\s*await dbPut\(rp\.record,"pull"\);\s*repaired\+\+;/.test(loop))
    throw new Error('a re-id is not one transaction created in the same run as its ask, told only after a second ask');
  if (/draftsFollow\(|dbDel\(/.test(loop)) throw new Error('the repair still moves drafts or removes ids outside its transaction');
  const firstAsk = loop.indexOf('if(!wsStill(gen)) break;'), reid = loop.indexOf('if(rp.oldId!==rp.record.id){');
  if (reid < 0 || /\bawait\b/.test(loop.slice(firstAsk, reid))) throw new Error('the repair waits between its first ask and its write');
  const tx = body('function s0ReidTx(d,oldId,rec){');
  if (!/^function s0ReidTx\(d,oldId,rec\)\{\s*return new Promise\(\(res,rej\)=>\{\s*const t=d\.transaction\(STORE,"readwrite"\)/.test(tx)) throw new Error('s0ReidTx does not create its transaction synchronously, first');
  if ((tx.match(/\.transaction\(/g) || []).length !== 1 || /\bawait\b|\.then\(/.test(tx)) throw new Error('s0ReidTx is not exactly one transaction with no wait');
  for (const s of ['s.delete(oldId);', 'const dq=s.get(draftKey(oldId));', 'const at=Math.max(Date.now(), (((now&&now.at)||0)+1));',
    's.put(Object.assign({},got,{id:draftKey(rec.id), traitId:rec.id, at:at}));', 's.delete(draftKey(oldId));'])
    if (tx.indexOf(s) < 0) throw new Error('s0ReidTx does not ' + s);
});
