/* FOLLOW-UP D: LEAVE AND REMOVE FROM SERVER SAY WHAT HAPPENED (page only).

   Built on stage 0 as shipped (main 91eb861, patches 600-607, which this
   does not edit), from the follow-up plan's batch D and the owner's answers
   of 2026-09-29 (plan1-owner-answers.txt). Each item was shown on
   91eb861's page first (RED), in tests/removefromserversays.spec.js,
   tests/leavesayswhathappened.spec.js and tests/leftcopies.spec.js.

   S12. THE ROLE READ HAS A DEADLINE. clearCloud waited on cloudRole with
     none, and a read that never answers kept Remove from server disabled,
     with nothing said (measured). It is raced against CLOUD_DEADLINE_MS,
     as cloudRender races sbAuthState; past it the answer is "could not
     check" and nothing is sent.

   S15. cloudRole and its constants move above the "ONE AT A TIME" comment,
     so that comment sits on clearingCloud and clearCloud again. A move:
     the comment's text is unchanged (finish() compares it).

   S16. A VERSION-2 REQUEST OR A DELETE LEFT QUEUED IS REMEMBERED. After a
     Leave that a tab from before this update blocked, every later open of
     that store waits until that tab closes (measured, patch605; no page can
     withdraw the request). This tab remembers such stores (s0Queued) until
     the request has run, and db() and wsSwitch say "close or reload that
     tab" instead of waiting; a rejoin says it too (task-14-report Concern
     1, option b). Other tabs do not know. No new indexedDB.open.

   S17. THIS TAB'S OWN CONNECTION, STILL WRITING, IS NOT "OLD". A connection
     closed while one of its transactions runs stays open until it ends, and
     a version-2 request made meanwhile is blocked by it: Leave said "a
     BuildaNFT tab from before this update has it open" when none existed
     (measured). s0Track now counts each handle's transactions; Leave's
     s0CloseAllGone waits, bounded, for this tab's closed handles to finish,
     and a handle still writing past the bound is answered "busy", never
     "old".

   S18. COUNTED AGAIN AFTER THE QUESTION. A save that landed while Leave's
     question was open was named only by the toast: the question had said
     "Your own page is untouched" (measured). Leave waits for the drawing's
     save and counts again after the confirm; if the store now holds what
     the question did not name, it asks again, and Cancel leaves nothing.
     Once a question has said the copy stays, it stays.

   S19. p_team:leaving is shadowed by the move checks (patch605 C7: no test
     could fail on it). Not changed here: pinned by a spec whose failure
     needs it and both move checks after the question removed together
     (the report records each alone staying green).

   OWNER'S ANSWER 1 (P6): A GROUP WITH NO OWNER may be removed from the
     server by any member. A member's press asks one more thing: whether the
     group still has an owner (team_members, role=eq.owner). Measured on the
     repo's SQL harness (the live catalog of 2026-09-28): a member reads the
     owner's row while the owner is in, gets [] once the owner has left
     (leave_team deletes that row), and a non-member gets [] for both reads
     - so "no owner" is concluded only after the member's own row was read.

   OWNER'S ANSWER 2 (P7): the button is "Remove from server", and its hover
     text is the page's own: your page, or a group's.

   OWNER'S ANSWER 3 (P9): COPIES KEPT AFTER LEAVE ARE WRITTEN DOWN, cleared
     by themselves later once nothing in them is unsent and no tab holds
     them (Leave's own s0DeleteIfAlone decides, as it did at the Leave), and
     listed in the account panel - "Projects you have left" (headed
     otherwise since fix round 1, below) - each with its
     size and a Clear button, which never clears a copy with unsent work and
     says so instead.
     Fix round 1 (review of ce6d786): a copy never written down is never
     cleared by itself, and the list's note said above every row that a
     copy with nothing unsent is (measured: one such copy stayed through
     three list reads beside those words). The note now speaks only of
     copies left here since this update, under the heading "Group projects
     kept on this device", and a copy never written down says on its own
     row that it is not cleared by itself (S0_LEFT_UNNOTED).

   X3 (private Safari) is batch E's; this touches no store-error wording. */
const s0 = require('./stage0-common.cjs');
const kit = require(require('path').join(s0.REPO, 'tools', 'patchkit.cjs'));
const doc = s0.start([
  ['async function clearCloudNow(gen){', 'patch607 is not applied (clearCloudNow(gen))'],
  ['async function s0DeleteIfAlone(name){', 'patch605 is not applied (s0DeleteIfAlone)'],
  ['function s0InStore(name){', 'Task 11 fix round 4 is not applied (s0InStore)'],
]);

/* The "ONE AT A TIME" comment, exactly as on 91eb861's page: moved past, never edited (S15). */
const ONE_AT_A_TIME = [
  '/* ONE AT A TIME, taken on the first synchronous line.',
  '',
  '   Disabling the button after the confirmation left the measuring phase open',
  '   - four round trips - so a second press there produced a second dialog for',
  '   the same collection, and answering both started two clears. Same shape as',
  '   renderUpdates: the lock and the button live in the wrapper, the work lives',
  '   underneath, and every early return passes through one finally so a path',
  '   that decided to do nothing cannot leave the button dead. */',
];
const TASK17_COMMENT = [
  '/* TASK 17 (design E3, controller ruling F-04): REMOVE FROM SERVER IS THE',
  '   GROUP OWNER\'S. This account\'s role in the group shown: "owner",',
  '   "member" (a member, or no membership row at all), or null when it could',
  '   not be read - no group, no session, the network, an answer that is not',
  '   2xx or not a list. A plain team_members read, made only by clearCloud',
  '   on a group page and never inside cloudRender. The uid asked about is the',
  '   stored session\'s, whose token the read carries (as s0FlagSet reads it):',
  '   a member may read every member\'s row of the group (members_read), so it',
  '   must be the token\'s own; sbUser would be a request of its own. */',
  'const CLOUD_OWNER_ONLY="Only this project\'s owner can remove it from the server. Your copy on this device is untouched.";',
  'const CLOUD_OWNER_UNKNOWN="Could not check who owns this project, so nothing was changed.";',
  '/* Said by clearCloudNow when the page moved after the press (fix round 1). */',
  'const CLOUD_MOVED="The page moved to another project, so nothing was changed.";',
];
const TITLE_OWN = 'Removes your project from the server. Your copy on this device is kept.';
const TITLE_GROUP = 'Removes this project from the server for everyone in the group. Only its owner can - or any member, once it has no owner. Every device keeps its own copy.';
/* Fix round 1 (P9): the list's note, and the line on the row of a copy never written down. */
const LEFT_NOTE = 'Group projects kept on this device. A copy you left here since this update, with nothing unsent, is cleared by itself once no tab has it open.';
const LEFT_NOTE_OLD = 'Projects you have left, still on this device. A copy with nothing unsent is cleared by itself once no tab has it open.';
const UNNOTED = 'Not cleared by itself: this device has no note of you leaving it - as after a Leave before this update, or on another device - and another account here may be in it. Press Clear to remove it from this device.';

/* ---- 1. near db(): the queued stores (S16), closing handles (S17), and the
        left copies' state (P9) - declared before db(), which runs early ---- */
doc.swap([
  'let dbpName=null;',
  'let dbp=null;',
  'function db(){',
  '  if(dbp && dbpName===wsDbName()) return dbp;',
], [
  '/* FOLLOW-UP D (S16): STORES WHOSE VERSION-2 REQUEST OR DELETE THIS TAB LEFT',
  '   QUEUED. Leave\'s probe (s0OthersOpen) or its delete, blocked by a tab from',
  '   before this update, cannot be withdrawn (measured, patch605): it stays',
  '   queued until that tab closes or reloads, and every later open of the',
  '   store waits behind it - a rejoin in this tab hung with nothing said',
  '   (measured). This tab remembers each such store, name -> how many of its',
  '   requests are still queued, until each has run; db() and wsSwitch say so',
  '   instead of waiting (task-14-report Concern 1, option b). Other tabs do',
  '   not know, and a page loaded later does not either. */',
  'const s0Queued=new Map();',
  'const S0_QUEUED="A BuildaNFT tab from before this update still has this project open, so this device cannot open it yet. Close or reload that tab, then open the project again.";',
  'function s0QueuedAdd(name){ s0Queued.set(name,(s0Queued.get(name)||0)+1); }',
  'function s0QueuedDone(name){ const n=(s0Queued.get(name)||0)-1; if(n>0) s0Queued.set(name,n); else s0Queued.delete(name); }',
  'function s0IsQueued(name){ return s0Queued.has(name); }',
  '/* FOLLOW-UP D (S17): HANDLES THIS TAB CLOSED WHILE ONE OF THEIR TRANSACTIONS',
  '   STILL RAN - database name -> Set of their s0Track entries, until each is',
  '   idle - and how long Leave waits for them (S0_CLOSE_MS). */',
  'const s0ClosingDbs=new Map();',
  'const S0_CLOSE_MS=5000;',
  'function s0Idle(entry){ return entry.busy ? new Promise(r=>entry.onidle.push(r)) : Promise.resolve(); }',
  'function s0Closing(name,entry){',
  '  if(!entry.busy) return;',
  '  if(!s0ClosingDbs.has(name)) s0ClosingDbs.set(name,new Set());',
  '  s0ClosingDbs.get(name).add(entry);',
  '  entry.onidle.push(()=>{ const set=s0ClosingDbs.get(name); if(set&&set.delete(entry)&&!set.size) s0ClosingDbs.delete(name); });',
  '}',
  'function s0StillClosing(name){ const set=s0ClosingDbs.get(name); return !!(set&&set.size); }',
  '/* FOLLOW-UP D (owner\'s answer 3, P9): the copies this browser kept after a',
  '   Leave, in localStorage as {<store>: {team, name, uid, at}}; the stores this',
  '   tab is deciding about now - a Leave, a Clear, a tidy, a size read - which',
  '   nothing else here touches meanwhile; and the team list last read. */',
  'const S0_LEFT_KEY="pb.left";',
  'const s0LeftBusy=new Set();',
  'let s0LeftTeams=null;',
  'let dbpName=null;',
  'let dbp=null;',
  'function db(){',
  '  if(dbp && dbpName===wsDbName()) return dbp;',
  '  /* FOLLOW-UP D (S16): never behind a request this tab left queued - it',
  '     would wait until that other tab closes, with nothing said. Refused at',
  '     once with the reason, and not kept as dbp, so the next call asks again',
  '     (the request runs, and is forgotten, when that tab closes). */',
  '  if(s0IsQueued(wsDbName())) return Promise.reject(new Error(S0_QUEUED));',
]);

/* ---- 2. s0Track counts each handle's transactions (S17) ------------------ */
doc.swap('  const entry={d:d, hold:hold};', '  const entry={d:d, hold:hold, busy:0, onidle:[]};');
doc.swap([
  '  const close=d.close.bind(d);',
  '  d.close=()=>{ try{ close(); } finally{ done(); } };',
], [
  '  /* FOLLOW-UP D (S17): ITS TRANSACTIONS, COUNTED until each completes or',
  '     aborts. A handle closed while one still runs stays open - "close',
  '     pending" - until it ends, and a version-2 request made meanwhile is',
  '     blocked by it: Leave\'s probe answered "old" and Leave named a tab from',
  '     before this update that did not exist (measured). A closed handle',
  '     still at work is now known as this tab\'s own (s0Closing). */',
  '  const tx=d.transaction.bind(d);',
  '  d.transaction=(...a)=>{',
  '    const t=tx(...a);',
  '    entry.busy++;',
  '    let ended=false;',
  '    const end=()=>{',
  '      if(ended) return;',
  '      ended=true; entry.busy--;',
  '      if(!entry.busy){ const w=entry.onidle; entry.onidle=[]; for(const f of w){ try{ f(); }catch(_){ } } }',
  '    };',
  '    t.addEventListener("complete",end); t.addEventListener("abort",end);',
  '    return t;',
  '  };',
  '  const close=d.close.bind(d);',
  '  d.close=()=>{ try{ close(); } finally{ s0Closing(name,entry); done(); } };',
]);

/* ---- 3. s0CloseAllGone waits for this tab's closing handles too (S17) ---- */
doc.swap([
  '  try{ await Promise.all(waits); }catch(_){ }',
  '  return n;',
  '}',
], [
  '  try{ await Promise.all(waits); }catch(_){ }',
  '  /* FOLLOW-UP D (S17): and this tab\'s own handles on it that are closed but',
  '     still finishing a transaction - Leave\'s switch closes the one it used',
  '     - have finished, or S0_CLOSE_MS has passed (s0StillClosing says which). */',
  '  const closing=s0ClosingDbs.get(name);',
  '  if(closing&&closing.size)',
  '    await Promise.race([Promise.all([...closing].map(s0Idle)), new Promise(r=>setTimeout(r,S0_CLOSE_MS))]);',
  '  return n;',
  '}',
]);

/* ---- 4. the probe remembers a queued request (S16) ----------------------- */
doc.swap([
  '    let r=null, verdict=null;',
  '    try{ r=indexedDB.open(name,2); }catch(_){ res("unknown"); return; }',
  '    r.onblocked=()=>res("blocked");',
  '    r.onupgradeneeded=()=>{',
], [
  '    let r=null, verdict=null, queued=false;',
  '    /* FOLLOW-UP D (S16): remembered while it waits, forgotten once it runs. */',
  '    const ran=()=>{ if(queued){ queued=false; s0QueuedDone(name); } };',
  '    try{ r=indexedDB.open(name,2); }catch(_){ res("unknown"); return; }',
  '    r.onblocked=()=>{ if(!queued){ queued=true; s0QueuedAdd(name); } res("blocked"); };',
  '    r.onupgradeneeded=()=>{',
  '      ran();',
]);
doc.swap('    r.onsuccess=()=>{ try{ r.result.close(); }catch(_){ } res("unknown"); };',
  '    r.onsuccess=()=>{ ran(); try{ r.result.close(); }catch(_){ } res("unknown"); };');
doc.swap('    r.onerror=(e)=>{ try{ if(e&&e.preventDefault) e.preventDefault(); }catch(_){ }',
  '    r.onerror=(e)=>{ ran(); try{ if(e&&e.preventDefault) e.preventDefault(); }catch(_){ }');

/* ---- 5. s0DeleteIfAlone: "busy" (S17), and a queued delete (S16) --------- */
doc.swap([
  'async function s0DeleteIfAlone(name){',
  '  await s0CloseAllGone(name);',
  '  const del=()=>new Promise(res=>{',
  '    try{',
  '      const q=indexedDB.deleteDatabase(name);',
  '      q.onsuccess=()=>res(true); q.onerror=()=>res(false); q.onblocked=()=>res("blocked");',
], [
  'async function s0DeleteIfAlone(name){',
  '  await s0CloseAllGone(name);',
  '  /* FOLLOW-UP D (S17): this tab\'s own handle, closed and still writing past',
  '     S0_CLOSE_MS, is this tab\'s - never "old". Nothing is asked: a version-2',
  '     request now would be blocked by it. Kept, and cleared later (P9). */',
  '  if(s0StillClosing(name)) return "busy";',
  '  const del=()=>new Promise(res=>{',
  '    try{',
  '      const q=indexedDB.deleteDatabase(name);',
  '      /* FOLLOW-UP D (S16): a blocked delete is queued too, until it runs. */',
  '      let queued=false;',
  '      const ran=()=>{ if(queued){ queued=false; s0QueuedDone(name); } };',
  '      q.onsuccess=()=>{ ran(); res(true); }; q.onerror=()=>{ ran(); res(false); };',
  '      q.onblocked=()=>{ if(!queued){ queued=true; s0QueuedAdd(name); } res("blocked"); };',
]);

/* ---- 6. P9: the left copies - kept, tidied, listed, cleared -------------- */
doc.swap('const S0_LEAVE_MOVING=', [
  '/* FOLLOW-UP D (owner\'s answer 3, P9): COPIES KEPT AFTER LEAVE.',
  '',
  '   Leave clears the group\'s copy when nothing is unsent (about 66 MB a',
  '   group). It kept it - for good, nothing cleared it later - when another',
  '   tab had it open, a tab from before this update had it, the page still',
  '   showed it, the check failed, this tab was still writing to it, or it',
  '   held unsent work. The owner\'s answer: "Clear safely, plus a list".',
  '   - Every copy Leave keeps is written down (S0_LEFT_KEY), with the',
  '     project, its name and the account that left.',
  '   - s0LeftTidy, run each time the team list is read (wsRender), clears',
  '     each of this account\'s kept copies by s0DeleteIfAlone - the same',
  '     decision Leave made: nothing unsent (drafts included), no stage-0 tab',
  '     holding it, no connection open - and forgets it once gone. A project',
  '     rejoined is forgotten and kept. The copy the page shows, one this tab',
  '     left a request queued on (S16), and one this tab is deciding about',
  '     are not touched.',
  '   - s0LeftRender lists them in the account panel, "Projects you have',
  '     left", with each copy\'s size, and a Clear button that asks',
  '     s0DeleteIfAlone and says what it answered: a copy with unsent work',
  '     is never cleared. A group copy on this device that was not written',
  '     down - kept by a Leave before this update - is listed too, as a',
  '     project this account is not in now, and cleared only by its button:',
  '     another account on this browser may be in it.',
  '     (Fix round 1: AND ITS ROW SAYS SO, S0_LEFT_UNNOTED. The panel\'s note',
  '     said, above every row, "A copy with nothing unsent is cleared by',
  '     itself once no tab has it open" - true only of a copy written down:',
  '     one never written down, nothing unsent and no tab holding it, stayed',
  '     through every list read beside those words (measured, review of',
  '     ce6d786). The note now speaks only of copies left here since this',
  '     update, under a heading that fits every row. Not written down is',
  '     wider than a Leave before this update: a Leave on another device',
  '     and another account\'s project here look the same from this page',
  '     (only wsLeave here writes S0_LEFT_KEY), so the row says what is true',
  '     of each - no note of leaving it - and gives causes only as examples.)',
  '   Sizes are measured only while the panel is open: measuring opens the',
  '   copy (s0InStore, locked and tracked as db() is), briefly. */',
  'function s0LeftLoad(){',
  '  try{ const m=JSON.parse(localStorage.getItem(S0_LEFT_KEY)||"{}"); return (m&&typeof m==="object"&&!Array.isArray(m)) ? m : {}; }',
  '  catch(_){ return {}; }',
  '}',
  'function s0LeftSave(m){ try{ Object.keys(m).length ? localStorage.setItem(S0_LEFT_KEY,JSON.stringify(m)) : localStorage.removeItem(S0_LEFT_KEY); }catch(_){ } }',
  'function s0LeftKeep(db,team,name,uid){ const m=s0LeftLoad(); m[db]={team:team, name:name||null, uid:uid||null, at:Date.now()}; s0LeftSave(m); }',
  'function s0LeftDrop(db){ const m=s0LeftLoad(); if(m[db]){ delete m[db]; s0LeftSave(m); } }',
  '/* The stores on this device, or null where the browser cannot list them. */',
  'async function s0LeftStores(){',
  '  try{ if(!indexedDB.databases) return null; return new Set((await indexedDB.databases()).map(d=>d.name)); }',
  '  catch(_){ return null; }',
  '}',
  'let s0LeftTidying=false;',
  'async function s0LeftTidy(teams){',
  '  if(s0LeftTidying) return;',
  '  s0LeftTidying=true;',
  '  try{',
  '    const uid=s0Uid()||null;',
  '    if(!uid) return;',
  '    /* WHAT IS WRITTEN DOWN AS THIS STARTS. Leave reads the list itself',
  '       (wsRender) before it writes its copy down, so a tidy that read the',
  '       record after its first wait cleared, a moment later, a copy Leave had',
  '       just said it kept (measured: the read-failed Leave). A copy written',
  '       down after this began - or written down again, a new "at" - waits',
  '       for the next read of the list. */',
  '    const m=s0LeftLoad();',
  '    const mine=new Set((teams||[]).map(t=>"chatnft.ws."+t.id));',
  '    const have=await s0LeftStores();',
  '    for(const name of Object.keys(m)){',
  '      const e=m[name]||{};',
  '      if(e.uid!==uid) continue;',
  '      const now=s0LeftLoad()[name];',
  '      if(!now||now.at!==e.at) continue;',
  '      /* Rejoined: the project is this account\'s again, and so is its copy. Gone: nothing to clear. */',
  '      if(mine.has(name)||(have&&!have.has(name))){ s0LeftDrop(name); continue; }',
  '      if(name===wsDbName()||s0IsQueued(name)||s0LeftBusy.has(name)) continue;',
  '      s0LeftBusy.add(name);',
  '      let got=false;',
  '      try{ got=await s0DeleteIfAlone(name); }catch(_){ got=false; }',
  '      finally{ s0LeftBusy.delete(name); }',
  '      if(got===true) s0LeftDrop(name);',
  '    }',
  '  }finally{ s0LeftTidying=false; }',
  '  s0LeftRender();',
  '}',
  '/* How much a copy holds: its pictures\' bytes and the rest as text. null',
  '   when it cannot be opened in S0_SIZE_MS - one a tab from before this',
  '   update holds behind a request queued by an earlier page, say. */',
  'const S0_SIZE_MS=3000;',
  'const s0Sizing=new Map();',
  'function s0RecordBytes(v){',
  '  let n=0;',
  '  try{',
  '    for(const k of Object.keys(v||{})) if(v[k] instanceof Blob) n+=v[k].size;',
  '    n+=JSON.stringify(v,(k,x)=>(x instanceof Blob) ? undefined : x).length;',
  '  }catch(_){ }',
  '  return n;',
  '}',
  'async function s0CopySize(name){',
  '  if(s0IsQueued(name)||s0LeftBusy.has(name)) return null;',
  '  const open=s0InStore(name);',
  '  const d=await Promise.race([open.catch(()=>null), new Promise(r=>setTimeout(()=>r(null),S0_SIZE_MS))]);',
  '  if(!d){ open.then(x=>{ try{ x.close(); }catch(_){ } },()=>{ }); return null; }',
  '  try{',
  '    return await new Promise(res=>{',
  '      let n=0;',
  '      const t=d.transaction(STORE,"readonly"), c=t.objectStore(STORE).openCursor();',
  '      c.onsuccess=()=>{ const cur=c.result; if(!cur) return; n+=s0RecordBytes(cur.value); cur.continue(); };',
  '      t.oncomplete=()=>res(n); t.onerror=()=>res(null); t.onabort=()=>res(null);',
  '    });',
  '  }catch(_){ return null; }',
  '  finally{ try{ d.close(); }catch(_){ } }',
  '}',
  'function s0SizeWords(n){',
  '  if(n===null||n===undefined) return "size not known";',
  '  return n<1048576 ? Math.max(1,Math.round(n/1024))+" KB" : (n/1048576).toFixed(1)+" MB";',
  '}',
  '/* Fix round 1: the line on the row of a copy never written down. */',
  'const S0_LEFT_UNNOTED="' + UNNOTED + '";',
  'let s0LeftDrawn=0;',
  'async function s0LeftRender(){',
  '  const box=$("wsleft"), list=$("wsleftlist"), panel=$("acctpanel");',
  '  if(!box||!list) return;',
  '  const uid=s0Uid()||null;',
  '  if(!uid){ box.hidden=true; list.innerHTML=""; return; }',
  '  if(panel&&panel.hidden) return;',
  '  const gen=++s0LeftDrawn;',
  '  const have=await s0LeftStores();',
  '  if(gen!==s0LeftDrawn) return;',
  '  const m=s0LeftLoad(), rows=[];',
  '  for(const name of Object.keys(m)){',
  '    const e=m[name]||{};',
  '    if(e.uid===uid) rows.push({db:name, name:e.name||"A group project"});',
  '  }',
  '  if(have&&s0LeftTeams){',
  '    const mine=new Set(s0LeftTeams.map(t=>"chatnft.ws."+t.id));',
  '    for(const name of have)',
  '      if(name.indexOf("chatnft.ws.")===0&&!m[name]&&!mine.has(name)) rows.push({db:name, name:"A group project you are not in now", said:S0_LEFT_UNNOTED});',
  '  }',
  '  const shown=rows.filter(r=>(!have||have.has(r.db))&&r.db!==wsDbName()&&!s0LeftBusy.has(r.db));',
  '  list.innerHTML="";',
  '  box.hidden=!shown.length;',
  '  for(const r of shown){',
  '    const li=document.createElement("li");',
  '    li.dataset.db=r.db;',
  '    const nm=document.createElement("span"); nm.className="leftname"; nm.textContent=r.name;',
  '    const sz=document.createElement("span"); sz.className="leftsize"; sz.textContent="measuring...";',
  '    const b=document.createElement("button"); b.type="button"; b.className="mini"; b.textContent="Clear";',
  '    b.title="Clears this copy from this device. A copy holding work the group has not got is never cleared.";',
  '    const said=document.createElement("span"); said.className="leftsaid"; said.textContent=r.said||"";',
  '    b.onclick=()=>s0LeftClear(r.db,b,said);',
  '    li.append(nm,sz,b,said);',
  '    list.appendChild(li);',
  '  }',
  '  for(const r of shown){',
  '    if(gen!==s0LeftDrawn) return;',
  '    const p=s0CopySize(r.db);',
  '    s0Sizing.set(r.db,p);',
  '    let n=null;',
  '    try{ n=await p; }finally{ if(s0Sizing.get(r.db)===p) s0Sizing.delete(r.db); }',
  '    const li=[...list.children].find(x=>x.dataset.db===r.db);',
  '    if(li&&gen===s0LeftDrawn) li.querySelector(".leftsize").textContent=s0SizeWords(n);',
  '  }',
  '}',
  'async function s0LeftClear(name,btn,said){',
  '  const say=m=>{ if(said) said.textContent=m; toast(m); };',
  '  if(s0LeftBusy.has(name)) return;',
  '  if(name===wsDbName()){ say("Not cleared: this page has that project open."); return; }',
  '  if(s0IsQueued(name)){ say(S0_QUEUED); return; }',
  '  s0LeftBusy.add(name);',
  '  if(btn) btn.disabled=true;',
  '  let got=false;',
  '  try{',
  '    /* A size read still open on it would read as another tab. */',
  '    const sizing=s0Sizing.get(name);',
  '    if(sizing){ try{ await sizing; }catch(_){ } }',
  '    got=await s0DeleteIfAlone(name);',
  '  }catch(_){ got=false; }',
  '  finally{ s0LeftBusy.delete(name); if(btn) btn.disabled=false; }',
  '  if(got===true) s0LeftDrop(name);',
  '  say(got===true ? "Cleared from this device."',
  '    : got==="held" ? "Not cleared: this copy holds work the group has not got. Rejoin the project to send it."',
  '    : got==="other" ? "Not cleared: another BuildaNFT tab has it open. Close that tab, then press Clear again."',
  '    : got==="old" ? "Not cleared: a BuildaNFT tab from before this update has it open. Close or reload that tab, then press Clear again."',
  '    : got==="blocked" ? "A BuildaNFT tab from before this update opened it just now; it is cleared when that tab closes."',
  '    : got==="busy" ? "Not cleared: this tab is still writing to it. Press Clear again in a moment."',
  '    : "Could not clear it. Press Clear again.");',
  '  if(got===true) s0LeftRender();',
  '}',
  'const S0_LEAVE_MOVING=',
]);

/* ---- 7. wsLeave: the count again after the question (S18), and P9 -------- */
doc.swap([
  '  let unsent=[], drawings=0, pictures=0, unread=false;',
  '  try{',
  '    const all=await dbAll();',
  '    unsent=all.filter(i=>(i.kind==="trait"||i.kind==="ref")&&!i.synced).map(i=>i.name);',
  '    /* STAGE 0 (Finding 1): EVERY DRAFT. Only those with a traitId counted,',
  '       and the canvas that is not a trait yet (AUTO_ID, traitId null: an',
  '       imported PNG, an extraction) - the only copy of that picture - was',
  '       deleted with "Your own page is untouched" (measured). It is named',
  '       apart, because Save to cloud sends no draft. */',
  '    const drafts=all.filter(i=>i.kind==="autosave");',
  '    pictures=drafts.filter(i=>!i.traitId).length;',
  '    drawings=drafts.length-pictures;',
  '  /* STAGE 0 (D1): a read that fails is "unknown: keep". This said "nothing',
  '     to keep", and the copy it could not read was deleted. */',
  '  }catch(_){ unsent=[]; drawings=0; pictures=0; unread=true; }',
  '  /* STAGE 0 (Finding 3): still on the project counted, with no switch',
  '     waiting and still signed in - or nothing is asked and nothing sent. */',
  '  if(moved()){ toast(S0_LEAVE_MOVED); return; }',
  '  const held=[];',
  '  if(unsent.length) held.push(unsent.length+" change"+(unsent.length===1?"":"s")+" the group has not got ("',
  '    +unsent.slice(0,3).join(", ")+(unsent.length>3?" and "+(unsent.length-3)+" more":"")+")");',
  '  if(drawings) held.push(drawings+" unsaved drawing"+(drawings===1?"":"s"));',
  '  if(pictures) held.push((pictures===1 ? "an unsaved picture" : pictures+" unsaved pictures")',
  '    +" (open it from the restore bar and Save to project)");',
  '  const keeps=held.length>0||unread||unchecked;',
  '  if(!confirm(unread',
  '    ? "Leave this group project? This device could not read what it holds for the group, so its copy stays here -"',
  '      +" it may hold changes the group has not got. The project stays for everyone else."',
  '    : unchecked',
  '    ? "Leave this group project? This device could not check the project with the server, so its copy stays here -"',
  '      +" it may hold changes the group has not got. The project stays for everyone else."',
  '    : keeps',
  '    ? "Leave this group project? This device has "+held.join(" and ")+"."',
  '      +" After leaving you cannot open them unless you rejoin - press Cancel and Save to cloud first,"',
  '      +" or OK to leave anyway (they stay on this device). The project stays for everyone else."',
  '    : "Leave this group project? Your own page is untouched, and the project stays for everyone else.")) return;',
], [
  '  /* FOLLOW-UP D (S18): the count and the question, each a function of what',
  '     the store holds, because both are made again after the question',
  '     (below). Their words are as they were. */',
  '  const count=async()=>{',
  '    let unsent=[], drawings=0, pictures=0, unread=false;',
  '    try{',
  '      const all=await dbAll();',
  '      unsent=all.filter(i=>(i.kind==="trait"||i.kind==="ref")&&!i.synced).map(i=>i.name);',
  '      /* STAGE 0 (Finding 1): EVERY DRAFT. Only those with a traitId counted,',
  '         and the canvas that is not a trait yet (AUTO_ID, traitId null: an',
  '         imported PNG, an extraction) - the only copy of that picture - was',
  '         deleted with "Your own page is untouched" (measured). It is named',
  '         apart, because Save to cloud sends no draft. */',
  '      const drafts=all.filter(i=>i.kind==="autosave");',
  '      pictures=drafts.filter(i=>!i.traitId).length;',
  '      drawings=drafts.length-pictures;',
  '    /* STAGE 0 (D1): a read that fails is "unknown: keep". This said "nothing',
  '       to keep", and the copy it could not read was deleted. */',
  '    }catch(_){ unsent=[]; drawings=0; pictures=0; unread=true; }',
  '    const held=[];',
  '    if(unsent.length) held.push(unsent.length+" change"+(unsent.length===1?"":"s")+" the group has not got ("',
  '      +unsent.slice(0,3).join(", ")+(unsent.length>3?" and "+(unsent.length-3)+" more":"")+")");',
  '    if(drawings) held.push(drawings+" unsaved drawing"+(drawings===1?"":"s"));',
  '    if(pictures) held.push((pictures===1 ? "an unsaved picture" : pictures+" unsaved pictures")',
  '      +" (open it from the restore bar and Save to project)");',
  '    const keeps=held.length>0||unread||unchecked;',
  '    return {unread:unread, keeps:keeps, question:unread',
  '      ? "Leave this group project? This device could not read what it holds for the group, so its copy stays here -"',
  '        +" it may hold changes the group has not got. The project stays for everyone else."',
  '      : unchecked',
  '      ? "Leave this group project? This device could not check the project with the server, so its copy stays here -"',
  '        +" it may hold changes the group has not got. The project stays for everyone else."',
  '      : keeps',
  '      ? "Leave this group project? This device has "+held.join(" and ")+"."',
  '        +" After leaving you cannot open them unless you rejoin - press Cancel and Save to cloud first,"',
  '        +" or OK to leave anyway (they stay on this device). The project stays for everyone else."',
  '      : "Leave this group project? Your own page is untouched, and the project stays for everyone else."};',
  '  };',
  '  let now=await count();',
  '  /* STAGE 0 (Finding 3): still on the project counted, with no switch',
  '     waiting and still signed in - or nothing is asked and nothing sent. */',
  '  if(moved()){ toast(S0_LEAVE_MOVED); return; }',
  '  if(!confirm(now.question)) return;',
  '  /* FOLLOW-UP D (S18): COUNTED AGAIN AFTER THE QUESTION, AND ASKED AGAIN WHEN',
  '     IT HOLDS WHAT THE QUESTION DID NOT SAY. A drawing\'s save that landed',
  '     while the question was open - past the first wait\'s bound, or started',
  '     after the count (a tab hidden) - was named only by the toast: the',
  '     question had said "Your own page is untouched" (measured). The same',
  '     wait and the same count follow the confirm; a store that now holds',
  '     something, told differently, is asked about again in its own words, and',
  '     Cancel leaves nothing. What a question said stays said: once it has',
  '     told the person the copy stays, it stays (so a read that failed and',
  '     then worked is still kept, as it was). At most three questions; the',
  '     delete below still decides on the store as it is then ("held"). */',
  '  let unread=now.unread, keeps=now.keeps;',
  '  for(let asked=1;;asked++){',
  '    { const f=s0FlushAutosave(); if(f) await f; }',
  '    const again=await count();',
  '    if(moved()){ toast(S0_LEAVE_MOVED); return; }',
  '    if(!again.keeps||again.question===now.question) break;',
  '    now=again; keeps=true; unread=unread||again.unread;',
  '    if(asked>=3) break;',
  '    if(!confirm(now.question)) return;',
  '  }',
  '  /* FOLLOW-UP D (P9): the name the project is listed under if its copy is',
  '     kept here, read while the page still shows it. */',
  '  const leftName=(()=>{ try{ const o=[...$("wssel").options].find(x=>x.value===leaving); if(o) return o.textContent; }catch(_){ } return wsNameLoad(); })();',
]);
doc.swap([
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/rpc/leave_team",{method:"POST",headers:h,',
], [
  '  try{',
  '    s0LeftBusy.add(dbName);   /* FOLLOW-UP D (P9): nothing else here touches it meanwhile */',
  '    const r=await fetch(SB_URL+"/rest/v1/rpc/leave_team",{method:"POST",headers:h,',
]);
doc.swap([
  '      : freed==="blocked" ? "Left the project - a BuildaNFT tab from before this update opened it just now; its copy is cleared when that tab closes"',
  '      : "Left the project");',
  '  }catch(_){ toast("Could not reach the server"); }',
  '}',
], [
  '      : freed==="blocked" ? "Left the project - a BuildaNFT tab from before this update opened it just now; its copy is cleared when that tab closes"',
  '      /* FOLLOW-UP D (S17): this tab\'s own write, still running past the wait. */',
  '      : freed==="busy" ? "Left the project - this device was still writing to its copy, so it is kept here for now"',
  '      : "Left the project");',
  '    /* FOLLOW-UP D (owner\'s answer 3, P9): a copy kept here is written down, so',
  '       it is cleared later once nothing holds it, and listed meanwhile. */',
  '    if(freed===true) s0LeftDrop(dbName);',
  '    else if(dbName&&dbName!==DBN) s0LeftKeep(dbName,leaving,leftName,s0Home.uid);',
  '  }catch(_){ toast("Could not reach the server"); }',
  '  finally{ s0LeftBusy.delete(dbName); s0LeftRender(); }',
  '}',
]);

/* ---- 8. wsSwitch: refuses a queued store (S16); the title (P7) ----------- */
doc.swap([
  '  activeWs = id||null;',
  '  s0Show();   /* STAGE 0 (D1): the bar is about the project shown, not the one left. */',
], [
  '  /* FOLLOW-UP D (S16): a store this tab left a request queued on would wait',
  '     until that other tab closes (s0Queued): said now, and the page stays',
  '     where it is, the dropdown with it. Answers false, so a caller that goes',
  '     on only once the page has moved can tell (joinIfPending). */',
  '  if(s0IsQueued(id ? "chatnft.ws."+id : DBN)){',
  '    toast(S0_QUEUED);',
  '    try{ $("wssel").value=activeWs||""; }catch(_){ }',
  '    return false;',
  '  }',
  '  activeWs = id||null;',
  '  cloudClearTitle();   /* FOLLOW-UP D (P7): the button\'s words are the page\'s */',
  '  s0Show();   /* STAGE 0 (D1): the bar is about the project shown, not the one left. */',
]);

/* ---- 9. joinIfPending: joined, and cannot open it yet (S16) -------------- */
doc.swap([
  '    await wsSwitch(joined);',
  '    toast("You have joined the project");',
], [
  '    const went=await wsSwitch(joined);',
  '    /* FOLLOW-UP D (S16): joined, but this device cannot open it until the',
  '       tab from before this update closes - said, not covered by this toast. */',
  '    toast(went===false ? "You have joined the project. "+S0_QUEUED : "You have joined the project");',
]);

/* ---- 10. wsRender: the kept copies are tidied when the list is read (P9) - */
doc.swap([
  '  if(!activeWs){ $("teamrow").hidden=true; $("teamnote").hidden=true; }',
  '}',
  '',
  'async function wsCreate(){',
], [
  '  if(!activeWs){ $("teamrow").hidden=true; $("teamnote").hidden=true; }',
  '  /* FOLLOW-UP D (owner\'s answer 3, P9): with the list read, the copies this',
  '     account left and kept are cleared if nothing holds them now, and the',
  '     list in the account panel is drawn. Not awaited. */',
  '  if(got.ok){ s0LeftTeams=teams; s0LeftTidy(teams); }',
  '}',
  '',
  'async function wsCreate(){',
]);

/* ---- 11. cloudRender: the title where the button is shown (P7) ----------- */
doc.swap('  $("cloudclear").hidden=!inn;', '  $("cloudclear").hidden=!inn; cloudClearTitle();   /* FOLLOW-UP D (P7) */');

/* ---- 12. S15 + S12 + P6 + P7: cloudRole above ONE AT A TIME -------------- */
doc.swap([
  ...ONE_AT_A_TIME,
  'let clearingCloud=false;',
  ...TASK17_COMMENT,
  'async function cloudRole(){',
  '  const team=activeWs;',
  '  if(!team) return null;',
  '  const h=await sbHeaders();',
  '  if(!h) return null;',
  '  const uid=s0SessionUid(sbLoadSession());',
  '  if(!uid) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/team_members?select=role&team_id=eq."+encodeURIComponent(team)',
  '      +"&user_id=eq."+encodeURIComponent(uid),{headers:h});',
  '    if(!r.ok) return null;',
  '    const rows=await r.json();',
  '    if(!Array.isArray(rows)) return null;',
  '    return (rows[0]&&rows[0].role==="owner") ? "owner" : "member";',
  '  }catch(_){ return null; }',
  '}',
  'async function clearCloud(){',
], [
  ...TASK17_COMMENT,
  '/* FOLLOW-UP D (owner\'s answer 1, P6): A GROUP WITH NO OWNER may be removed',
  '   from the server by any member. leave_team lets the owner leave without',
  '   handing the project on, and then nobody could remove it. So a member\'s',
  '   press asks one more thing - whether the group still has an owner - and',
  '   cloudRole answers "ownerless" when it has none. Measured on the repo\'s',
  '   SQL harness, which replays the live catalog of 2026-09-28: a member',
  '   reads the owner\'s row while the owner is in (members_read); once the',
  '   owner has left (leave_team deletes that row) the same read answers [];',
  '   and someone who is not a member gets [] for both reads - so "no owner"',
  '   is concluded only after this account\'s own member row was read. Any',
  '   row answering the owner read counts as an owner: a reply that ignored',
  '   the filter refuses, never grants. */',
  'const CLOUD_OWNERLESS="This project has no owner now, so any member may remove it from the server.";',
  'async function cloudRole(){',
  '  const team=activeWs;',
  '  if(!team) return null;',
  '  const h=await sbHeaders();',
  '  if(!h) return null;',
  '  const uid=s0SessionUid(sbLoadSession());',
  '  if(!uid) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/team_members?select=role&team_id=eq."+encodeURIComponent(team)',
  '      +"&user_id=eq."+encodeURIComponent(uid),{headers:h});',
  '    if(!r.ok) return null;',
  '    const rows=await r.json();',
  '    if(!Array.isArray(rows)) return null;',
  '    if(rows[0]&&rows[0].role==="owner") return "owner";',
  '    if(!rows[0]) return "member";',
  '    const o=await fetch(SB_URL+"/rest/v1/team_members?select=role&team_id=eq."+encodeURIComponent(team)',
  '      +"&role=eq.owner&limit=1",{headers:h});',
  '    if(!o.ok) return null;',
  '    const owners=await o.json();',
  '    if(!Array.isArray(owners)) return null;',
  '    return owners.length ? "member" : "ownerless";',
  '  }catch(_){ return null; }',
  '}',
  '/* FOLLOW-UP D (owner\'s answer 2, P7): WHAT THE BUTTON SAYS ON HOVER IS THE',
  '   PAGE\'S OWN. One text read "for everyone" on your own page, and neither',
  '   said whose copies are kept. Set wherever the page changes project',
  '   (wsSwitch) and wherever the button is shown (cloudRender). */',
  'function cloudClearTitle(){',
  '  const b=$("cloudclear");',
  '  if(!b) return;',
  '  b.title=activeWs',
  '    ? "' + TITLE_GROUP + '"',
  '    : "' + TITLE_OWN + '";',
  '}',
  ...ONE_AT_A_TIME,
  'let clearingCloud=false;',
  'async function clearCloud(){',
]);
doc.swap('      const role=await cloudRole();', [
  '      /* FOLLOW-UP D (S12): A DEADLINE, as cloudRender\'s. A role read that never',
  '         answered kept the button disabled with nothing said (measured). Past',
  '         CLOUD_DEADLINE_MS it is "could not check", and nothing is sent. */',
  '      const role=await Promise.race([cloudRole(), new Promise(r=>setTimeout(()=>r(null),CLOUD_DEADLINE_MS))]);',
]);
doc.swap([
  '      if(role!=="owner"){ say(CLOUD_OWNER_ONLY); return; }',
  '    }',
  '    await clearCloudNow(gen);',
], [
  '      /* FOLLOW-UP D (P6): or a member of a group with no owner. */',
  '      if(role!=="owner"&&role!=="ownerless"){ say(CLOUD_OWNER_ONLY); return; }',
  '      if(role==="ownerless") say(CLOUD_OWNERLESS);',
  '    }',
  '    await clearCloudNow(gen);',
]);

/* ---- 13. the markup: the button's name and title (P7), the list (P9) ---- */
doc.swap([
  '        <button class="mini" id="cloudclear" hidden',
  '          title="Removes this project from the server for everyone. On a group page only the owner can.">Clear the cloud</button>',
], [
  '        <button class="mini" id="cloudclear" hidden',
  '          title="' + TITLE_OWN + '">Remove from server</button>',
]);
doc.swap('        <p class="note" id="teamnote" hidden></p>', [
  '        <p class="note" id="teamnote" hidden></p>',
  '        <!-- FOLLOW-UP D (owner\'s answer 3): the copies kept here after Leave. -->',
  '        <div id="wsleft" hidden>',
  '          <p class="note">' + LEFT_NOTE + '</p>',
  '          <ul id="wsleftlist"></ul>',
  '        </div>',
]);
doc.swap('.wsrow #teamnote{margin:0;}', [
  '.wsrow #teamnote{margin:0;}',
  '.wsrow #wsleft{width:100%;}',
  '#wsleftlist{list-style:none; margin:4px 0 0; padding:0;}',
  '#wsleftlist li{display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; margin:2px 0;}',
  '#wsleftlist .leftsize{color:var(--dim);}',
  '#wsleftlist .leftsaid{width:100%; font-size:11.5px; color:var(--dim);}',
]);

doc.finish(({ text, code, must }) => {
  const NL = s0.NL;
  const lines = kit.lines(code);
  const count = (s) => code.split(s).length - 1;
  /* No new open or delete (stage0-source counts them). */
  if (count('indexedDB.open(') !== 3) throw new Error('expected 3 indexedDB.open( as before, found ' + count('indexedDB.open('));
  if (count('deleteDatabase(') !== 1) throw new Error('expected 1 deleteDatabase( as before, found ' + count('deleteDatabase('));
  /* S15: cloudRole, then the ONE AT A TIME comment, then clearingCloud, then clearCloud. */
  const oneText = ONE_AT_A_TIME.join(NL);
  if (text.split(oneText + NL + 'let clearingCloud=false;' + NL + 'async function clearCloud(){').length - 1 !== 1)
    throw new Error('S15: the ONE AT A TIME comment, unchanged, does not sit directly on clearingCloud and clearCloud');
  if (!(text.indexOf('async function cloudRole(){') < text.indexOf(oneText)))
    throw new Error('S15: cloudRole is not above the ONE AT A TIME comment');
  /* S12. */
  must('      const role=await Promise.race([cloudRole(), new Promise(r=>setTimeout(()=>r(null),CLOUD_DEADLINE_MS))]);', 'S12: the role read has no deadline');
  if (count('await cloudRole()') !== 0) throw new Error('S12: cloudRole is still awaited bare somewhere');
  /* P6. */
  must('+"&role=eq.owner&limit=1",{headers:h});', 'P6: the owner read is not there');
  must('    if(!rows[0]) return "member";', 'P6: a missing membership row is not "member" before the owner read');
  must('    return owners.length ? "member" : "ownerless";', 'P6: an owner row is not what refuses');
  must('      if(role!=="owner"&&role!=="ownerless"){ say(CLOUD_OWNER_ONLY); return; }', 'P6: clearCloud does not let an ownerless group through');
  if (count('/rest/v1/team_members') !== 2) throw new Error('P6: expected the two team_members reads, found ' + count('/rest/v1/team_members'));
  /* P7. */
  if (text.indexOf('>Clear the cloud</button>') >= 0) throw new Error('P7: the button still says Clear the cloud');
  if (text.split('title="' + TITLE_OWN + '">Remove from server</button>').length - 1 !== 1) throw new Error('P7: the button is not named Remove from server');
  must('  activeWs = id||null;' + NL + '  cloudClearTitle();', 'P7: wsSwitch does not set the title as it moves');
  must('  $("cloudclear").hidden=!inn; cloudClearTitle();', 'P7: cloudRender does not set the title');
  /* S16. */
  must('  if(s0IsQueued(wsDbName())) return Promise.reject(new Error(S0_QUEUED));', 'S16: db() waits behind a queued request');
  must('  if(s0IsQueued(id ? "chatnft.ws."+id : DBN)){', 'S16: wsSwitch does not refuse a queued store');
  must('    r.onblocked=()=>{ if(!queued){ queued=true; s0QueuedAdd(name); } res("blocked"); };', 'S16: the probe does not remember a queued request');
  must('      q.onblocked=()=>{ if(!queued){ queued=true; s0QueuedAdd(name); } res("blocked"); };', 'S16: the delete does not remember a queued request');
  const db = kit.inFunction(lines, 'function db(){');
  const dbBody = lines.slice(db.start, db.end + 1);
  const dbQ = dbBody.findIndex(l => l.indexOf('s0IsQueued(wsDbName())') >= 0), dbOpen = dbBody.findIndex(l => l.indexOf('s0Hold(name)') >= 0);
  if (!(dbQ > 0 && dbOpen > dbQ)) throw new Error('S16: db() does not refuse before it asks for the lock');
  /* S17. */
  must('  if(s0StillClosing(name)) return "busy";', 'S17: s0DeleteIfAlone does not answer busy');
  must('  d.close=()=>{ try{ close(); } finally{ s0Closing(name,entry); done(); } };', 'S17: a closing handle is not noted');
  const del = kit.inFunction(lines, 'async function s0DeleteIfAlone(name){');
  const delBody = lines.slice(del.start, del.end + 1).filter(l => l.trim() !== '');
  if (delBody[1] !== '  await s0CloseAllGone(name);' || delBody.findIndex(l => l === '  if(s0StillClosing(name)) return "busy";') !== 2)
    throw new Error('S17: "busy" is not decided right after this tab\'s handles are closed and waited for');
  /* S18: the recount follows the confirm; the move check stays next to the send. */
  const lv = kit.inFunction(lines, 'async function wsLeave(){');
  const lvCode = lines.slice(lv.start, lv.end + 1).join('\n');
  for (const s of [
    '  if(!confirm(now.question)) return;\n',
    '    const again=await count();\n    if(moved()){ toast(S0_LEAVE_MOVED); return; }\n    if(!again.keeps||again.question===now.question) break;',
    '  if(moved()){ toast(S0_LEAVE_MOVED); return; }\n  try{\n    s0LeftBusy.add(dbName);',
    '      body:JSON.stringify({p_team:leaving})});',
  ]) if (lvCode.split(s).length - 1 < 1) throw new Error('wsLeave is missing: ' + s.slice(0, 80));
  if ((lvCode.match(/confirm\(/g) || []).length !== 2) throw new Error('S18: expected two confirms in wsLeave (the question and the question again)');
  /* P9. */
  must('  if(got.ok){ s0LeftTeams=teams; s0LeftTidy(teams); }', 'P9: wsRender does not tidy the kept copies');
  must('    else if(dbName&&dbName!==DBN) s0LeftKeep(dbName,leaving,leftName,s0Home.uid);', 'P9: Leave does not write a kept copy down');
  must('      try{ got=await s0DeleteIfAlone(name); }catch(_){ got=false; }', 'P9: the tidy does not decide by s0DeleteIfAlone');
  must('    got=await s0DeleteIfAlone(name);', 'P9: Clear does not decide by s0DeleteIfAlone');
  if (text.indexOf('<ul id="wsleftlist"></ul>') < 0) throw new Error('P9: the list is not in the panel');
  /* P9, fix round 1: the note claims nothing of a copy never written down, and that copy's row says so. */
  if (text.indexOf(LEFT_NOTE_OLD) >= 0) throw new Error('P9 r1: the old note, true only of copies written down, is still there');
  if (text.split('<p class="note">' + LEFT_NOTE + '</p>' + NL + '          <ul id="wsleftlist"></ul>').length - 1 !== 1)
    throw new Error('P9 r1: the list\'s note is not the one that speaks only of copies left here since this update');
  must('const S0_LEFT_UNNOTED="' + UNNOTED + '";', 'P9 r1: the line for a copy never written down is not there');
  must('rows.push({db:name, name:"A group project you are not in now", said:S0_LEFT_UNNOTED});', 'P9 r1: a copy never written down does not carry its line');
  if (count('said:S0_LEFT_UNNOTED') !== 1) throw new Error('P9 r1: expected the line on one kind of row only, found ' + count('said:S0_LEFT_UNNOTED'));
  must('said.className="leftsaid"; said.textContent=r.said||"";', 'P9 r1: the row\'s line is not shown');
});
