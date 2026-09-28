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
     before it lets the uid go, as sessionEnded does. */
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
  '/* The account signed in: the one cloudRender verified; else the stored',
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

doc.swap(['  authed=inn;', '  gateShow(!inn);'], [
  '  authed=inn;',
  '  /* STAGE 0 (B1): the account signed in, for the stamps, and added to the',
  '     browser\'s list of accounts. "Could not ask" returned above, leaving',
  '     whatever was known. */',
  '  s0SeenUid=(inn&&u&&u.id) ? String(u.id) : null;',
  '  if(s0SeenUid) s0Register(s0SeenUid);',
  '  gateShow(!inn);',
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
  'function cloudSignOut(){',
  '  /* STAGE 0: AN AUTOSAVE STILL WAITING IS SAVED NOW, while the person who',
  '     drew it is the one signed in - autosaveNow takes the uid as it starts -',
  '     rather than when its timer fires, after the lines below have let the',
  '     uid go, stamped with nobody (measured, fix round 1). sessionEnded saves',
  '     the same way. Only one that is waiting: saving unconditionally would',
  '     add a write that does not happen today. Like the timer\'s, this write',
  '     lands in the store activeWs names when it lands, which is after the',
  '     line below that clears it. */',
  '  if(autoPending){ try{ autosaveNow(); }catch(_){} }',
  '  sbSaveSession(null);',
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
  if ((code.match(/,"pull"\)/g) || []).length !== 3) throw new Error('exactly three writes should pass "pull", found ' + (code.match(/,"pull"\)/g) || []).length);
  if ((code.match(/dbPut\([^)]*,"sent"\)/g) || []).length !== 2) throw new Error('exactly two writes should be stamped "sent"');
  /* Fix round 1. */
  must('const u=keep ? (rec.by||(stored&&stored.by)||null) : (uid!==undefined ? uid : s0Uid());', 'a uid the caller took is not what its write is stamped with');
  must('if(autoPending){ try{ autosaveNow(); }catch(_){} }', 'sign-out lets the uid go before a waiting autosave is saved');
  const body = (sig) => { const a = code.indexOf(sig); if (a < 0) throw new Error('missing: ' + sig);
    const b = code.slice(a + sig.length).search(/\n(async )?function /); return code.slice(a, b < 0 ? undefined : a + sig.length + b); };
  const pull = body('async function cloudPull(opts){');
  if ((pull.match(/const gen=wsGen;/g) || []).length !== 1) throw new Error('cloudPull should note its generation exactly once');
  if (!(pull.indexOf('const gen=wsGen;') < pull.indexOf('await '))) throw new Error('cloudPull notes its generation after a wait');
  const save = body('function autosaveNow(){');
  if (!(save.indexOf('const by=s0Uid();') >= 0 && save.indexOf('const by=s0Uid();') < save.indexOf('art.toBlob('))) throw new Error('autosaveNow does not take the uid before the encode');
  if (save.indexOf('at:Date.now()},"person",by)') < 0) throw new Error('the autosave is not stamped with the uid it took');
});
