/* STAGE 0, PART 3 OF 7: THE PROTOCOL READ, AND WHAT IT HOLDS BACK.

   Design D1. The page reads this project's protocol and switching_at (Change
   A0's columns) in a request of its own - before every pull and every send
   batch, before Clear, an import, Leave and Remove from server, after any
   refused write before reporting it, and every two minutes while visible -
   and while the account's migration flag is set, the project is switching,
   or it is on protocol 2, it saves on the device only. Every sender keeps
   its own failure path, so what is held is marked unsent exactly as a failed
   send marks it today; a new reason, "held", carries the words.

   Reads: Save to cloud, a pull, Clear, an import, Leave and Remove from
   server always read afresh; a single save, weight, move or removal reads
   unless a read finished in the last two seconds, so one status change (an
   upload, then a removal) is one read, and a long Save to cloud reads
   again about every two seconds. A read gives up after five seconds and
   counts as an error. The state is per store AND account: a store read as
   protocol 2 stays there for that account for the life of the tab (the
   switch is one way, E1), and pixelbench, every account's personal store,
   never holds account B because account A's project switched. When a read
   that answered finds a group project no longer held for switching, what
   was kept here is sent (groupResend), as the bar promised - unless the
   page is moving off that project (below).

   A refusal is Change B's guard only when it is P0001 AND its message
   starts "project switched" (the design's "project switched: reload");
   P0001 is also PostgreSQL's code for any bare RAISE, and the live
   reorder_traits raises three, so any other P0001 is an ordinary refusal.
   The guard's refusal is read again like any other: a read that answers is
   trusted (protocol 2 or switching: held; neither: the switch has just
   ended, and it is reported refused so the next send goes). Only when that
   read cannot answer is the guard's refusal taken as switching.

   Not held: cloudCollection's insert of a project that has no row (a
   project with no row cannot be switched); reads that are not pulls
   (cloudStatus, the updates list). Leave is patch605's, the reload rule
   patch606's.

   Written against the plan's page (4f1bc2d plus patch600 and patch601);
   Task 10's five fix rounds changed patch601 before this was applied, and
   the controller's audit of this patch against the page they left
   (anchor-audit/amend-task11.md) found five things, each measured red on
   this patch as the plan wrote it before it was changed here:
   - The stage0stamps.spec.js stand-in for cloudPatchOne answers only its
     PATCH, and the read cloudPatchOne now makes first was recorded there
     as unknown. That spec's stand-in names the read now (Finding 1).
   - Sign-out and a switch wait, bounded, for the drawing's last save
     before they move the store, the uid and wsGen, so a read landing in
     that wait passed s0Check's "same store, same account" check, and a
     switch it found called off was resent for the project being left.
     The resend waits for the page to stay (Finding 2).
   - Nothing hid the bar when the page left the account or project it was
     about: sign-out, a refused session and a move to another project
     each redraw it now (Finding 3).
   - This tab's uid can be pinned to account A while another tab has
     stored B's session, which is the token its sends carry. B's migration
     flag holds them, and B's flag heard on the channel shows the bar
     (Finding 4).
   - Save to cloud took its collection and team, then read; a switch during
     the read left the hold judged for the store switched to, with no read,
     and sent that store's traits into the first project. It stops when
     the project moved during its read (Finding 5).

   Fix round 1 (the three-lens review of 60ecb5d; each measured red on
   60ecb5d before it was changed here):
   - Protocol 2 was sticky only while the one-slot s0State still held that
     store: a read on My page, another group or another account evicted
     it, and coming back a failed read counted as protocol 1 again - the
     catch-up pulled, a save sent, Clear deleted. Every (store, account)
     pair read on protocol 2 is kept in s0Seen2 for the life of the tab,
     and s0Check and s0Held answer from it.
   - Any P0001 was taken as Change B's guard (above).
   - Save to cloud's end-of-run writes - the stale-row DELETE, the sweep
     and the layers PATCH - went out after a mid-push read found the
     project held. They are skipped when it is held or any item was.
   - Remove from server read only before its confirm; it reads again after.
   - A sender whose re-read the page moved away from judged the store
     moved to, and sent to the one it left. s0Blocked answers held when
     the store or account moved during its read. (SUPERSEDED by fix round
     2, below: that answer was measured to lose the change.)
   - The inline message lowercased the brand: only "This project..." is
     lowercased now.

   Fix round 2 (the re-review of 443a022; each measured red on 443a022
   first):
   - Fix round 1's "a move during the read answers held" was wrong: the
     callers that write on a held answer wrote their unsent marks and
     rollbacks through db(), into the store moved to - over My page's own
     record with the same id - while the store the send was for kept the
     change marked synced, so nothing sent it; 60ecb5d had sent it. A send
     is judged for the store and account it is FOR now (s0HeldFor): the
     flag, protocol 2 remembered, or what that read answered - s0Check
     hands back its answer, keyed, when the page moved. Not held there, the
     send goes to its own target. Held there, it is not sent, and the five
     callers that write on a held answer write nothing into a store the
     page moved to (8b).
   - s0Recheck and Remove from server's read after its confirm joined a
     read already running, which can answer from before the refusal or the
     confirm (a poll read, measured). Each waits for it and reads again
     (s0Fresh).
   - The stale-row DELETEs ask on each row, not once on entry. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['function s0Uid(){', 'patch601 is not applied']]);

/* ---- 1. the module ------------------------------------------------------- */
doc.swap('const TEAM_PROJECT_PICK="&order=created_at.asc,id.asc&limit=1";', [
  'const TEAM_PROJECT_PICK="&order=created_at.asc,id.asc&limit=1";',
  '/* ==== stage 0: the protocol read (auto cloud save design, D1) ====',
  '',
  '   Today\'s page, well ahead of the switch. It reads two small columns of',
  '   this project\'s collection - protocol and switching_at, added by Change',
  '   A0 - in a request of its own, a few bytes where the whole row holds the',
  '   rules and answers:',
  '     - before every pull and every send batch. Save to cloud, a pull, Clear,',
  '       an import, Leave and Remove from server always read afresh; one save,',
  '       weight, move or removal reads unless a read finished in the last',
  '       S0_REUSE_MS, so one status change (an upload, then a removal) is one;',
  '     - after any refused upload or row write, before saying what happened;',
  '     - every two minutes while the page is visible and signed in, on a',
  '       token that needs no renewal.',
  '   An error, a missing field, no project row or no answer within',
  '   S0_READ_MS counts as protocol 1 and not switching. One exception: a',
  '   store this tab has read as protocol 2, for the account signed in, stays',
  '   on 2 for the life of the tab, because the switch is one way (design',
  '   E1) - remembered in s0Seen2, apart from the one-slot s0State, so a read',
  '   of another store or account in between does not undo it. Keyed by',
  '   store AND account: pixelbench is every account\'s personal store (B1).',
  '',
  '   It saves on the device only - sending, pulling, removing, clearing,',
  '   importing and leaving nothing - in three cases (D1):',
  '     - this account\'s migration flag is set for this store (B1);',
  '     - switching_at is set;',
  '     - protocol is 2.',
  '   Drawings, trait saves, fixer saves, weights and status changes are kept',
  '   here, marked unsent by the failure paths this page already has, and the',
  '   new page\'s straggler pass sends them after the reload. */',
  'const S0_POLL_MS=120000, S0_REUSE_MS=2000;',
  'let S0_READ_MS=5000;   /* a let, so a spec can shorten it */',
  'const S0_SWITCHING="This project is being updated: your change is kept here and will be sent after it";',
  'const S0_SWITCHED="BuildaNFT was updated: reload to send what you saved";',
  'let s0State={db:null, uid:null, protocol:1, switching:false, ok:false, at:0};',
  '/* Every store and account ("<store>|<uid>") this tab has read on protocol 2',
  '   or above. Never cleared: the switch is one way (E1). s0State is one slot,',
  '   and a read on My page, another group or another account took it, so',
  '   coming back a failed read counted as protocol 1 again: the catch-up',
  '   pulled, a save sent and Clear deleted (fix round 1, measured). */',
  'const s0Seen2=new Set();',
  'let s0Flight=null, s0FlightKey=null;',
  'function s0Mine(dbn,uid){ return s0State.db===dbn&&s0State.uid===uid; }',
  'async function s0ReadNow(signal){',
  '  let team=null;',
  '  try{ team=activeWs||cloudTeamId||await cloudTeam(); }catch(_){ team=null; }',
  '  if(!team) return null;',
  '  const h=await sbHeaders();',
  '  if(!h) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/collections?select=id,protocol,switching_at&team_id=eq."',
  '      +encodeURIComponent(team)+TEAM_PROJECT_PICK,{headers:h, signal:signal});',
  '    if(!r.ok) return null;',
  '    const rows=await r.json();',
  '    if(!Array.isArray(rows)) return null;',
  '    const row=rows[0];',
  '    if(!row) return {protocol:1, switching:false};',
  '    return {protocol:(typeof row.protocol==="number"&&row.protocol>=2) ? row.protocol : 1,',
  '      switching:typeof row.switching_at==="string"&&row.switching_at!==""};',
  '  }catch(_){ return null; }',
  '}',
  '/* A read that hangs - a captive portal, bad Wi-Fi - would hold every save,',
  '   Clear and import behind it. The whole read gives up after S0_READ_MS,',
  '   counts as an error, and its request is cancelled. */',
  'function s0Read(){',
  '  const ctl=(typeof AbortController==="function") ? new AbortController() : null;',
  '  let timer=null;',
  '  const late=new Promise(res=>{ timer=setTimeout(()=>res(null),S0_READ_MS); });',
  '  return Promise.race([s0ReadNow(ctl?ctl.signal:undefined),late]).then(got=>{',
  '    clearTimeout(timer);',
  '    if(got===null&&ctl){ try{ ctl.abort(); }catch(_){ } }',
  '    return got;',
  '  });',
  '}',
  'async function s0Check(force){',
  '  const dbn=wsDbName(), uid=s0Uid()||null, key=dbn+"|"+(uid||"");',
  '  if(s0Flight&&s0FlightKey===key) return s0Flight;',
  '  if(!force&&s0Mine(dbn,uid)&&Date.now()-s0State.at<S0_REUSE_MS) return s0State;',
  '  if(!sbLoadSession()) return s0State;',
  '  s0FlightKey=key;',
  '  const p=(async()=>{',
  '    const got=await s0Read();',
  '    /* The page moved during the read: the state is not written for a store',
  '       or account no longer shown, but the answer is handed back, keyed, so a',
  '       sender can judge the store its send is for (fix round 2). */',
  '    if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return {db:dbn, uid:uid, moved:true, got:got};',
  '    const mine=s0Mine(dbn,uid);',
  '    const wasHeld=mine&&(s0State.protocol>=2||s0State.switching);',
  '    const seen=Math.max((mine&&s0State.protocol>=2) ? s0State.protocol : 1, s0Seen2.has(key) ? 2 : 1);',
  '    s0State={db:dbn, uid:uid, protocol:Math.max(seen, got?got.protocol:1), switching:!!(got&&got.switching), ok:!!got, at:Date.now()};',
  '    if(s0State.protocol>=2) s0Seen2.add(key);',
  '    s0Show();',
  '    /* A switch called off (abort_switch clears switching_at): what was kept',
  '       here while it ran is sent now, in a group, as the bar promised - the',
  '       way the online event sends it. Only on a read that answered, and',
  '       never under a flag (s0Held reads it).',
  '       NOT WHILE THE PAGE IS LEAVING (the controller\'s audit, Finding 2).',
  '       Sign-out and a switch wait, bounded, for the drawing\'s last save',
  '       before they move the store, the uid and wsGen (s0SignOutWait,',
  '       s0WsWant), and a read that lands in that wait passes the check',
  '       above. Resent then, it pushed for the project being left while the',
  '       move waited, and on a sign-out it said "Sign in first" over it',
  '       (both measured); a push the move overtakes writes its',
  '       confirmations into the store moved to (reasoned, the push-in-',
  '       flight class).',
  '       The state is still written - a sender in the wait needs it. What',
  '       was kept stays unsent, and no later read sends it: s0State is one',
  '       slot, keyed by store and account, so after the move, and after a',
  '       move back, nothing reads as having been held. The online event or',
  '       a Save to cloud press sends it. */',
  '    if(wasHeld&&got&&!s0Held()&&activeWs&&s0WsWant===undefined&&!s0SignOutWait) Promise.resolve().then(()=>groupResend()).catch(()=>{});',
  '    return s0State;',
  '  })();',
  '  s0Flight=p;',
  '  try{ return await p; } finally{ if(s0Flight===p) s0Flight=null; }',
  '}',
  '/* This account\'s migration flag, for this store (B1). "This account" is',
  '   two uids when they differ (the controller\'s audit, Finding 4): the one',
  '   this tab is pinned to (s0Uid: a verified start, or an unchecked one),',
  '   and the stored session\'s, whose token every send carries. The page has',
  '   no storage listener, so another tab that signs A out and B in leaves',
  '   this tab on A while it sends with B\'s token; B\'s flag holds it. */',
  'function s0FlagOn(dbn,uids){',
  '  for(const u of uids){',
  '    if(!u) continue;',
  '    try{ if(localStorage.getItem("pb.migrating."+dbn+"."+u)!==null) return true; }catch(_){ }',
  '  }',
  '  return false;',
  '}',
  'function s0FlagSet(){ return s0FlagOn(wsDbName(), [s0Uid(), s0SessionUid(sbLoadSession())]); }',
  'function s0Held(){',
  '  if(s0FlagSet()) return "migrating";',
  '  const dbn=wsDbName(), uid=s0Uid()||null;',
  '  if(s0Seen2.has(dbn+"|"+(uid||""))) return "switched";',
  '  if(!s0Mine(dbn,uid)) return null;',
  '  if(s0State.protocol>=2) return "switched";',
  '  if(s0State.switching) return "switching";',
  '  return null;',
  '}',
  'function s0Words(why){ return why==="switching" ? S0_SWITCHING : S0_SWITCHED; }',
  '/* D1\'s sentence inside another one ("Saved cap here only - ..."). Only',
  '   "This project..." takes a small letter there: the other begins with the',
  '   brand, which is always "BuildaNFT" (fix round 1). */',
  'function s0Inline(why){ return why==="switching" ? S0_SWITCHING.charAt(0).toLowerCase()+S0_SWITCHING.slice(1) : S0_SWITCHED; }',
  '/* Whether the store and account a send is FOR are held, judged when the',
  '   page has moved off them during the send\'s read: this account\'s flag',
  '   for that store (the pinned uid or the session\'s, noted before the',
  '   read), protocol 2 remembered for it, or what that read answered - r is',
  '   s0Check\'s answer, the keyed {moved, got} a move leaves, or the state',
  '   it wrote for that key. */',
  'function s0HeldFor(dbn,uid,sid,r){',
  '  if(s0FlagOn(dbn,[uid,sid])) return true;',
  '  if(s0Seen2.has(dbn+"|"+(uid||""))) return true;',
  '  const got=(r&&r.moved) ? r.got : (r&&r.db===dbn&&r.uid===uid ? r : null);',
  '  return !!got&&(got.protocol>=2||!!got.switching);',
  '}',
  '/* Whether the read after a refusal answered, for the store and account it',
  '   was for (see s0HeldFor for r). */',
  'function s0AnsweredFor(dbn,uid,r){ return (r&&r.moved) ? !!r.got : !!(r&&r.db===dbn&&r.uid===uid&&r.ok); }',
  '/* Before a send: held, or not - for the store and account the send is FOR,',
  '   noted before the read. When the page has not moved, that is s0Held().',
  '   When it moved during the read, s0Held() would judge the store moved to:',
  '   fix round 1 answered "held" then, and was wrong (measured by the review',
  '   of 443a022). A held answer makes setRarity, setRarityMany and a shelf',
  '   move\'s rollback write their unsent marks through db(), which resolves',
  '   the store moved to - over a record of My page\'s with the same id -',
  '   while the store the send was for kept the change marked synced, so',
  '   nothing ever sent it. Judged for its own store now (fix round 2): not',
  '   held there, the send goes to its own target, as 60ecb5d sent it - a row',
  '   id PATCH, a delete or the rpc names its row, and reaches its project. */',
  'async function s0Blocked(){',
  '  const dbn=wsDbName(), uid=s0Uid()||null, sid=s0SessionUid(sbLoadSession());',
  '  let r=null;',
  '  try{ r=await s0Check(false); }catch(_){ r=null; }',
  '  if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return s0HeldFor(dbn,uid,sid,r);',
  '  return !!s0Held();',
  '}',
  '/* A read that begins after now. s0Check joins a read already running for',
  '   the same store and account, and one that began before a refusal, or',
  '   before a confirm closed, can answer from before the switch: the',
  '   guard\'s P0001 was trusted away on it (fix round 2, measured). Any read',
  '   running is let finish first, then a new one is made. */',
  'async function s0Fresh(){',
  '  if(s0Flight){ try{ await s0Flight; }catch(_){ } }',
  '  try{ return await s0Check(true); }catch(_){ return null; }',
  '}',
  '/* Change B\'s guard: P0001 with the design\'s message, "project switched:',
  '   reload". P0001 alone is PostgreSQL\'s code for any bare RAISE, and the',
  '   live reorder_traits raises three ("trait outside project", "not your',
  '   project", "invalid shelf order"): each is an ordinary refusal (fix',
  '   round 1, measured). */',
  'function s0Guard(err){ return !!err&&err.code==="P0001"&&typeof err.message==="string"&&err.message.indexOf("project switched")===0; }',
  '/* After a refusal, before it is reported: read again - a read that began',
  '   after the refusal (s0Fresh). err is the refusal\'s body where the sender',
  '   has it. true: report it as held.',
  '     - The read answers: it is trusted. Protocol 2 or switching is held;',
  '       neither, after the guard\'s refusal, means the switch has just ended,',
  '       and it is reported as refused, so the next send goes.',
  '     - The read cannot answer: only the guard\'s refusal is taken as',
  '       switching - kept here and sent after. s0State.ok stays false, as',
  '       the read reported; it is never written over a read that answered.',
  '     - The page moved during the read: the same, judged for the store and',
  '       account the refused send was for (s0HeldFor), and nothing is',
  '       written for the store moved to (fix round 2). */',
  'async function s0Recheck(err){',
  '  const dbn=wsDbName(), uid=s0Uid()||null, sid=s0SessionUid(sbLoadSession()), guard=s0Guard(err);',
  '  const r=await s0Fresh();',
  '  if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return s0HeldFor(dbn,uid,sid,r)||(guard&&!s0AnsweredFor(dbn,uid,r));',
  '  if(s0Held()) return true;',
  '  if(guard&&!(s0Mine(dbn,uid)&&s0State.ok)){',
  '    s0State={db:dbn, uid:uid, protocol:(s0Mine(dbn,uid) ? s0State.protocol : 1), switching:true, ok:false, at:Date.now()};',
  '    s0Show();',
  '    return true;',
  '  }',
  '  return false;',
  '}',
  '/* Before Clear, an import, Leave and Remove from server: a fresh read; if',
  '   held, it says so and the action does nothing. true when refused. after:',
  '   the read must begin now, not be one already running (Remove from',
  '   server\'s read after its confirm; see s0Fresh). */',
  'async function s0Refuse(after){',
  '  if(after) await s0Fresh();',
  '  else{ try{ await s0Check(true); }catch(_){ } }',
  '  const why=s0Held();',
  '  if(!why) return false;',
  '  s0Show();',
  '  toast(s0Words(why));',
  '  return true;',
  '}',
  '/* The bar, on every page and over the editor; and the fixer\'s save line. */',
  'function s0Show(){',
  '  const why=s0Held(), text=why ? s0Words(why) : "";',
  '  const bar=$("s0bar"), t=$("s0text");',
  '  if(bar) bar.hidden=!why;',
  '  if(t) t.textContent=text;',
  '  const fx=$("fixsaveout");',
  '  if(fx){',
  '    const ours=fx.textContent===S0_SWITCHING||fx.textContent===S0_SWITCHED;',
  '    if(why&&(!fx.textContent||ours)) fx.textContent=text;',
  '    else if(!why&&ours) fx.textContent="";',
  '  }',
  '}',
]);

/* ---- 2. the bar ---------------------------------------------------------- */
doc.swap('<div class="toast" id="toast" role="status" aria-live="polite"></div>', [
  '<div class="toast" id="toast" role="status" aria-live="polite"></div>',
  '<!-- STAGE 0 (auto cloud save design, D1): why this page is saving on the device',
  '     only. On every page and over the editor; hidden while nothing is held.',
  '     The Reload button shows only when reloading is the answer. -->',
  '<div class="s0bar" id="s0bar" role="alert" hidden><span id="s0text"></span> <button type="button" id="s0reload" hidden>Reload</button></div>',
]);
doc.swap('.toast.show{opacity:1; transform:translateX(-50%) translateY(0);}', [
  '.toast.show{opacity:1; transform:translateX(-50%) translateY(0);}',
  '/* STAGE 0: above everything, the editor included - it says why nothing is being sent. */',
  '.s0bar{position:fixed; left:0; right:0; top:0; z-index:60; padding:calc(8px + var(--sat)) calc(16px + var(--sar)) 8px calc(16px + var(--sal));',
  '  background:var(--bad); color:#fff; font-weight:600; font-size:13px; line-height:1.4; text-align:center;}',
  '.s0bar[hidden]{display:none;}',
  '.s0bar button{margin-left:10px; font:inherit; padding:3px 12px; border-radius:999px; border:1px solid #fff; background:transparent; color:#fff; cursor:pointer;}',
]);

/* ---- 3. the flag heard from another tab ----------------------------------- */
doc.swap(['if(tabChan) tabChan.onmessage=(e)=>{', '  if(!e||!e.data||e.data.db!==wsDbName()) return;'], [
  'if(tabChan) tabChan.onmessage=(e)=>{',
  '  /* STAGE 0 (B1): the new page\'s migration flag, {db, uid, migrating:true}.',
  '     Only the account signed in here obeys it (s0FlagSet reads the flag',
  '     itself), and it is never a redraw. "Signed in here" is the uid this',
  '     tab is pinned to or the stored session\'s, whose token its sends',
  '     carry (the controller\'s audit, Finding 4; see s0FlagSet). */',
  '  if(e&&e.data&&e.data.migrating){ if(e.data.db===wsDbName()&&(e.data.uid===s0Uid()||e.data.uid===s0SessionUid(sbLoadSession()))) s0Show(); return; }',
  '  if(!e||!e.data||e.data.db!==wsDbName()) return;',
]);

/* ---- 4. the words -------------------------------------------------------- */
doc.swap(['function cloudWhyNot(why){', '  const r=why&&why.reason;'], [
  'function cloudWhyNot(why){',
  '  const r=why&&why.reason;',
  '  /* STAGE 0: held back on purpose, and kept here (D1). */',
  '  if(r==="held") return s0Inline(s0Held()||"switched")+".";',
]);
doc.swap('  return best==="signedout" ? "you are signed out on this device"', [
  '  return best==="held" ? s0Inline(s0Held()||"switched")',
  '    : best==="signedout" ? "you are signed out on this device"',
]);

/* ---- 5. cloudSyncOne ------------------------------------------------------ */
doc.swap('  const c=ctx.c||await cloudCollection(u); if(!c) return say("collection");', [
  '  const c=ctx.c||await cloudCollection(u); if(!c) return say("collection");',
  '  /* STAGE 0 (D1): nothing is sent while this project is held. Every caller',
  '     already keeps a record that did not go up as unsent. */',
  '  if(await s0Blocked()) return say("held");',
]);
doc.swap('        if(up.status===403) return say("notallowed",up.status);',
  '        if(up.status===403) return (await s0Recheck()) ? say("held",up.status) : say("notallowed",up.status);');
doc.swap('    if(!up.ok) return say(cloudLater(up.status)?"unreachable":"refused",up.status);', [
  '    if(!up.ok){',
  '      /* STAGE 0 (D1): a refusal is read again before it is reported. */',
  '      if(up.status!==401&&await s0Recheck()) return say("held",up.status);',
  '      return say(cloudLater(up.status)?"unreachable":"refused",up.status);',
  '    }',
]);
doc.swap('    if(!adopted && !r.ok) return say(r.status===403 ? "notallowed"', [
  '    if(!adopted && !r.ok && r.status!==401){',
  '      /* STAGE 0 (D1): read again before saying what happened. */',
  '      let err=null; try{ err=await r.clone().json(); }catch(_){ err=null; }',
  '      if(await s0Recheck(err)) return say("held",r.status);',
  '    }',
  '    if(!adopted && !r.ok) return say(r.status===403 ? "notallowed"',
]);

/* ---- 6. cloudDropOne, cloudPatchOne, cloudRarity, setRarityMany ---------- */
doc.swap(['  if(!activeWs){ await goneAdd(rec); return null; }', '  /* ctx: the user, team and collection the caller already has - see'], [
  '  if(!activeWs){ await goneAdd(rec); return null; }',
  '  /* STAGE 0 (D1): a removal is not sent while this project is held. */',
  '  if(await s0Blocked()) return null;',
  '  /* ctx: the user, team and collection the caller already has - see',
]);
doc.swap(['    if(!r||!r.ok) return null;', '    let removed=[];'], [
  '    if(!r||!r.ok){ if(r&&r.status!==401) await s0Recheck(); return null; }',
  '    let removed=[];',
]);
doc.swap(['  const readAt=(typeof seq==="number")?seq:touchSeq;', '  if(!rec||!rec.rowId) return false;'], [
  '  const readAt=(typeof seq==="number")?seq:touchSeq;',
  '  if(!rec||!rec.rowId) return false;',
  '  /* STAGE 0 (D1): held, nothing is patched; the caller\'s upload is held too. */',
  '  if(await s0Blocked()) return false;',
]);
doc.swap(['    if(!r.ok) return false;', '    let rows=[]; try{ rows=await r.json(); }catch(_){ rows=[]; }'], [
  '    if(!r.ok){ if(r.status!==401) await s0Recheck(); return false; }',
  '    let rows=[]; try{ rows=await r.json(); }catch(_){ rows=[]; }',
]);
doc.swap('  if(!activeWs || !rec || !rec.rowId) return "nogroup";', [
  '  if(!activeWs || !rec || !rec.rowId) return "nogroup";',
  '  /* STAGE 0 (D1): held, the weight stays here, and setRarity marks it unsent. */',
  '  if(await s0Blocked()) return "unreachable";',
]);
doc.swap('    let why=""; try{ why=await r.text(); }catch(_){ }', [
  '    if(r && r.status!==401 && await s0Recheck()) return "unreachable";',
  '    let why=""; try{ why=await r.text(); }catch(_){ }',
]);
doc.swap(['    let refused=false;', '    for(let i=0;i<onServer.length;i+=RARITY_BATCH){'], [
  '    let refused=false;',
  '    /* STAGE 0 (D1): held, nothing is patched, and every synced row is behind. */',
  '    const s0h=await s0Blocked();',
  '    if(s0h) for(const r of onServer) if(r.synced) behind.push(r);',
  '    for(let i=0;!s0h&&i<onServer.length;i+=RARITY_BATCH){',
]);
doc.swap('      if(status===400 && /rarity/i.test(body)){ refused=true; continue; }', [
  '      if(status>=400&&status!==401&&await s0Recheck()){ for(const r of part) if(r.synced) behind.push(r); continue; }',
  '      if(status===400 && /rarity/i.test(body)){ refused=true; continue; }',
]);

/* ---- 7. the shelf order, the layers, the rules --------------------------- */
doc.swap('  if(!activeWs) return {ok:true};', [
  '  if(!activeWs) return {ok:true};',
  '  /* STAGE 0 (D1): held, the order is not sent; commitShelfMove puts the old one back. */',
  '  if(await s0Blocked()) return {ok:false,reason:"held"};',
]);
doc.swap('    let detail={}; try{ detail=await r.json(); }catch(_){}', [
  '    let detail={}; try{ detail=await r.json(); }catch(_){}',
  '    if(r.status!==401&&await s0Recheck(detail)) return {ok:false,reason:"held"};',
]);
doc.swap("      : 'Move did not sync, so the old order was restored');", [
  "      : shared.reason==='held' ? s0Words(s0Held()||'switched')+' - the old order is back'",
  "      : 'Move did not sync, so the old order was restored');",
]);
doc.swap([
  '    if(c&&h){',
  '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
  '        headers:h, body:JSON.stringify({layers:LAYERS})});',
  '      shared=r.ok;',
], [
  '    if(c&&h){',
  '      /* STAGE 0 (D1): held, the list stays here and "not shared yet" says so. */',
  '      if(await s0Blocked()) throw new Error("held");',
  '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
  '        headers:h, body:JSON.stringify({layers:LAYERS})});',
  '      shared=r.ok;',
  '      if(!r.ok&&r.status!==401) await s0Recheck();',
]);
doc.swap(['    if(c&&h){', '      /* READ, MERGE, THEN WRITE. The PATCH below writes the whole list of'], [
  '    if(c&&h){',
  '      /* STAGE 0 (D1): held, the rules and answers stay here. */',
  '      if(await s0Blocked()) throw new Error("held");',
  '      /* READ, MERGE, THEN WRITE. The PATCH below writes the whole list of',
]);
doc.swap(['          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});', '      shared=r.ok;'], [
  '          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});',
  '      shared=r.ok;',
  '      if(!r.ok&&r.status!==401) await s0Recheck();',
]);

/* ---- 8. the batches: Save to cloud, a pull, Remove from server ----------- */
doc.swap('async function cloudPush(){', [
  'async function cloudPush(){',
  '  /* STAGE 0: the project this push is for, noted before its first wait (the',
  '     controller\'s audit, Finding 5; used after the protocol read below). */',
  '  const s0PushGen=wsGen;',
]);
doc.swap(['  const team=await cloudTeam();', '  if(!team){ toast("Could not open your team"); return; }', '  let items=[];'], [
  '  const team=await cloudTeam();',
  '  if(!team){ toast("Could not open your team"); return; }',
  '  /* STAGE 0 (D1): a batch reads afresh before it sends anything; a held',
  '     project sends nothing, and what is unsent stays marked so. */',
  '  await s0Check(true);',
  '  /* A MOVE BEFORE OR DURING THE READ (the controller\'s audit, Finding 5).',
  '     c and team above are the project this push began in. A switch with',
  '     nothing waiting moves the store at once, s0Check leaves the state',
  '     alone when the store changed under its read, and the hold below was',
  '     then judged for the store switched to, with no read: its traits were',
  '     sent into this project\'s collection (measured). The push stops here,',
  '     before pushRunning is set, so nothing needs undoing. It covers a',
  '     sign-out too (cloudSignOutNow bumps wsGen), and the end of the run,',
  '     which reads activeWs late: the personal page\'s stale-row DELETE,',
  '     cloudSweep and the layers PATCH would otherwise run against the',
  '     project left. A move after this line, mid-upload, stays with the',
  '     push-in-flight class Task 10 left open. */',
  '  if(!wsStill(s0PushGen)) return;',
  '  { const why=s0Held(); if(why){ s0Show(); toast(s0Words(why)); return; } }',
  '  let items=[];',
]);
/* The end of the run (fix round 1). Every item reads for itself, but the
   three writes after them read nothing: they went out after a read in the
   run had found the project held. */
doc.swap('  let stale=0, notHere=0, serverPaths=null;', [
  '  /* STAGE 0 (D1): THE END OF THE RUN IS HELD TOO. The stale-row DELETE, the',
  '     sweep and the layers PATCH below read nothing of their own, and went',
  '     out after a read during the run had found the project switching, or',
  '     with the migration flag set during the last upload (fix round 1,',
  '     measured). Each is skipped while the project is held, or when any',
  '     item was held - a hold the run saw is not undone by a read after it.',
  '     The layer list stays unshared here, as saveLayers leaves it. */',
  '  const s0End=()=>!!s0Held()||!!reasons.held;',
  '  let stale=0, notHere=0, serverPaths=null;',
]);
doc.swap('  if(!activeWs && !failed && !notTried && !changed){',
  '  if(!s0End() && !activeWs && !failed && !notTried && !changed){');
doc.swap('    if(!activeWs && !failed && !changed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);',
  '    if(!s0End() && !activeWs && !failed && !changed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);');
doc.swap(['  try{', '    h=(await sbHeaders({"Content-Type":"application/json"}))||h;', '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,'], [
  '  if(!s0End()) try{',
  '    h=(await sbHeaders({"Content-Type":"application/json"}))||h;',
  '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,',
]);
doc.swap(['  const u=who.user;', '  const c=await cloudCollection(u);', '  if(!c){ toast("Nothing on the server yet"); return; }'], [
  '  const u=who.user;',
  '  /* STAGE 0 (D1): a pull reads afresh first, and a held project pulls nothing. */',
  '  await s0Check(true);',
  '  { const why=s0Held(); if(why){ s0Show(); if(!opts.quiet) toast(s0Words(why)); return; } }',
  '  const c=await cloudCollection(u);',
  '  if(!c){ toast("Nothing on the server yet"); return; }',
]);
doc.swap(['async function clearCloudNow(){', '  const note=$("cloudnote");'], [
  'async function clearCloudNow(){',
  '  /* STAGE 0 (D1): removing from the server waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  const note=$("cloudnote");',
]);
doc.swap('  say("Clearing the server\\u2026");', [
  '  /* STAGE 0 (D1): and again after the confirm, which can sit open for as long',
  '     as the person thinks. What follows removes every picture and every row',
  '     of the project, and it went on a verdict as old as that pause (fix',
  '     round 1, measured); the tile removals read again after theirs too.',
  '     A read that began after the confirm closed (fix round 2): one already',
  '     running - the two-minute read, say - can answer from before it. */',
  '  if(await s0Refuse(true)) return;',
  '  say("Clearing the server\\u2026");',
]);
/* The stale-row DELETEs, each (fix round 2): a hold that arrives during the
   block - the flag is read live - stops the rest, and the sweep after them. */
doc.swap('        const kept=[], done=[];', [
  '        const kept=[], done=[];',
  '        let s0Cut=false;',
]);
doc.swap('            const q="id=eq."+encodeURIComponent(r.id);', [
  '            /* STAGE 0 (D1): each stale-row DELETE asks again; a hold that came',
  '               during the block stops the rest, and serverPaths stays null so',
  '               the sweep does not run on a partial list (fix round 2). */',
  '            if(s0End()){ s0Cut=true; break; }',
  '            const q="id=eq."+encodeURIComponent(r.id);',
]);
doc.swap('        serverPaths=kept.map(r=>r.path).filter(Boolean);',
  '        serverPaths=s0Cut ? null : kept.map(r=>r.path).filter(Boolean);');

/* ---- 8b. no unsent mark in a store the page moved to (fix round 2) --------
   A send held for its own store while the page moved during its read (see
   s0Blocked) is not sent; the callers below then write an unsent mark, or
   roll back, through db(), which resolves the store moved to - over or
   beside a record of that store with the same id. Each notes the store
   before its send and writes nothing when the page has moved off it. What
   the store left keeps is the push-in-flight class Task 10 left open: a
   write addressed to a store other than the one shown. */
doc.swap('  const sent=await cloudRarity(next);', [
  '  const s0Home=wsDbName();   /* STAGE 0 (fix round 2): see 8b in patch602 */',
  '  const sent=await cloudRarity(next);',
]);
doc.swap('  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced) await dbPut({...next, synced:false, unsent:"meta"});',
  '  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced && wsDbName()===s0Home) await dbPut({...next, synced:false, unsent:"meta"});');
doc.swap('  await dbApplyShelfRecords([],changed);', [
  '  await dbApplyShelfRecords([],changed);',
  '  const s0Home=wsDbName();   /* STAGE 0 (fix round 2): see 8b in patch602 */',
]);
doc.swap('  if(behind.length) await dbApplyShelfRecords([],behind.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));',
  '  if(behind.length && wsDbName()===s0Home) await dbApplyShelfRecords([],behind.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));');
doc.swap('  const r=await cloudSendShelfPlan(updates);', [
  '  const s0Home=wsDbName();   /* STAGE 0 (fix round 2): see 8b in patch602 */',
  '  const r=await cloudSendShelfPlan(updates);',
  '  if(wsDbName()!==s0Home) return r;',
]);
doc.swap(['  const shared=await cloudSaveShelfPlan(plan.updates,true);', '  if(!shared.ok){'], [
  '  const s0Home=wsDbName();   /* STAGE 0 (fix round 2): see 8b in patch602 */',
  '  const shared=await cloudSaveShelfPlan(plan.updates,true);',
  '  if(!shared.ok){',
  '    /* STAGE 0: the page moved off this project during the send; the rollback',
  '       would write this project\'s records into the store moved to. */',
  '    if(wsDbName()!==s0Home) return false;',
]);
doc.swap('async function cloudMoveOne(oldRec,newRec,why){', [
  'async function cloudMoveOne(oldRec,newRec,why){',
  '  const s0Home=wsDbName();   /* STAGE 0 (fix round 2): see 8b in patch602 */',
]);
doc.swap('  if(!arrived){ await markUnsent(newRec); return null; }',
  '  if(!arrived){ if(wsDbName()===s0Home) await markUnsent(newRec); return null; }');

/* ---- 9. removals, Clear, imports, the fixer's line ----------------------- */
doc.swap('async function dbDelShared(rec){', [
  'async function dbDelShared(rec){',
  '  /* STAGE 0 (D1): a removal waits while this project is held. Nothing leaves',
  '     this device\'s store either, and the tile says why. */',
  '  if(await s0Blocked()) return "held";',
]);
doc.swap("const gone=await dbDelShared(t); renderShelf(); toast(gone ?",
  "const gone=await dbDelShared(t); renderShelf(); toast(gone===\"held\" ? s0Words(s0Held()||\"switched\") : gone ?");
doc.swap("const gone=await dbDelShared(t); visibility.show(key); renderShelf(); toast(gone ?",
  "const gone=await dbDelShared(t); visibility.show(key); renderShelf(); toast(gone===\"held\" ? s0Words(s0Held()||\"switched\") : gone ?");
doc.swap("        if(!confirm('Remove the reference \"'+t.name+'\"?')) return;", [
  '        if(await s0Refuse()) return;',
  "        if(!confirm('Remove the reference \"'+t.name+'\"?')) return;",
]);
doc.swap("        if(!confirm('Remove \"'+t.name+'\" from '+(t.layer||\"unsorted\")+'?')) return;", [
  '        if(await s0Refuse()) return;',
  "        if(!confirm('Remove \"'+t.name+'\" from '+(t.layer||\"unsorted\")+'?')) return;",
]);
doc.swap(["$('clearproj').onclick=async()=>{", "  if(!confirm('Remove every saved trait and the reference from this browser?')) return;"], [
  "$('clearproj').onclick=async()=>{",
  '  /* STAGE 0 (D1): Clear waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  "  if(!confirm('Remove every saved trait and the reference from this browser?')) return;",
]);
doc.swap(['async function bulkImport(files,opts){', '  const inPlace=!!(opts&&opts.inPlace);'], [
  'async function bulkImport(files,opts){',
  '  const inPlace=!!(opts&&opts.inPlace);',
  '  /* STAGE 0 (D1): a folder import waits while this project is held. A fixer',
  '     save comes through here in place and is kept: its sends are held one',
  '     by one, and its records stay unsent. */',
  '  if(!inPlace&&await s0Refuse()) return;',
]);
doc.swap(['async function importProject(file){', '  let doc=null;'], [
  'async function importProject(file){',
  '  /* STAGE 0 (D1): importing a project file waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  let doc=null;',
]);
doc.swap('    +(r&&r.notShared?" \\u00b7 "+r.notShared+" here only, not sent to the group":"")', [
  '    +(r&&r.notShared?" \\u00b7 "+r.notShared+" here only, not sent to the group":"")',
  '    /* STAGE 0 (D1): and why, while the project is held. */',
  '    +(s0Held()?" \\u00b7 "+s0Words(s0Held()):"")',
]);

/* ---- 10. every two minutes ------------------------------------------------ */
doc.swap("addEventListener('online',()=>{ groupResend(); });", [
  "addEventListener('online',()=>{ groupResend(); });",
  '/* STAGE 0 (D1): the protocol, every two minutes while this page is visible',
  '   and signed in. Nothing without a session: a signed-out page talks to',
  '   nobody (privacy.spec.js). And only on a token that needs no renewal',
  '   (sbToken renews within 60 s of expiry): a renewal refused here would put',
  '   the sign-in wall over whatever the person is doing, for a check they did',
  '   not ask for. Their next action renews it, as today, and reads first. */',
  'setInterval(()=>{',
  '  try{',
  '    const s=sbLoadSession();',
  '    if(document.visibilityState!=="visible"||!authed||!s) return;',
  '    if(!(s.expires_at&&Date.now()<s.expires_at*1000-60000)) return;',
  '    s0Check(true).catch(()=>{});',
  '  }catch(_){ }',
  '},S0_POLL_MS);',
]);

/* ---- 11. the bar follows the account and the project shown --------------- */
/* The controller's audit, Finding 3. Each of these leaves the page where
   s0Held() is null for the account or store it moved to, and nothing else
   redraws the bar: the 2-minute read skips without a session, and a move
   to My page reads nothing. Left up, "BuildaNFT was updated: reload" stayed
   over the sign-in card and over the next account's page (measured). Each
   is where the store or the uid actually moves - in cloudSignOutNow, not
   in cloudSignOut before its wait, when the page is still the leaving
   account's; in the run of wsSwitch that moves activeWs. */
doc.swap('  wsGen++; s0SeenUid=null;', [
  '  wsGen++; s0SeenUid=null;',
  '  s0Show();   /* STAGE 0 (D1): the bar was the account\'s that just left. */',
]);
doc.swap('  s0SeenUid=null;   /* STAGE 0: nobody verified is signed in now */', [
  '  s0SeenUid=null;   /* STAGE 0: nobody verified is signed in now */',
  '  s0Show();   /* STAGE 0 (D1): and the bar, which was theirs, goes. */',
]);
doc.swap('  activeWs = id||null;', [
  '  activeWs = id||null;',
  '  s0Show();   /* STAGE 0 (D1): the bar is about the project shown, not the one left. */',
]);

doc.finish(({ code, must }) => {
  must('"/rest/v1/collections?select=id,protocol,switching_at&team_id=eq."', 'the protocol read is not there');
  must('if(await s0Blocked()) return say("held");', 'cloudSyncOne is not held');
  must('if(await s0Blocked()) return "held";', 'dbDelShared is not held');
  must('if(!inPlace&&await s0Refuse()) return;', 'a folder import is not held');
  must('},S0_POLL_MS);', 'the two-minute read is not there');
  must('if(!(s.expires_at&&Date.now()<s.expires_at*1000-60000)) return;', 'the two-minute read could renew a token');
  must('return Promise.race([s0ReadNow(ctl?ctl.signal:undefined),late])', 'the read can hang');
  must('if(wasHeld&&got&&!s0Held()&&activeWs&&s0WsWant===undefined&&!s0SignOutWait) Promise.resolve().then(()=>groupResend())', 'a switch called off sends nothing, or sends while the page is leaving');
  must('function s0Mine(dbn,uid){ return s0State.db===dbn&&s0State.uid===uid; }', 'the state is not per account');
  /* The controller's audit, Findings 3 to 5. */
  const NL = s0.NL;
  must('wsGen++; s0SeenUid=null;' + NL + '  s0Show();', 'sign-out leaves the bar up');
  must('authed=false;' + NL + '  s0SeenUid=null;   ' + NL + '  s0Show();', 'a refused session leaves the bar up');
  must('activeWs = id||null;' + NL + '  s0Show();', 'a switch leaves the bar up');
  must('function s0FlagSet(){ return s0FlagOn(wsDbName(), [s0Uid(), s0SessionUid(sbLoadSession())]); }', 'the flag is read for the pinned uid only');
  must('e.data.uid===s0Uid()||e.data.uid===s0SessionUid(sbLoadSession())', 'a flag heard for the stored session is ignored');
  must('async function cloudPush(){' + NL + '  ' + NL + '  const s0PushGen=wsGen;', 'Save to cloud does not note its project first');
  must('  await s0Check(true);' + NL + '  ' + NL + '  if(!wsStill(s0PushGen)) return;', 'Save to cloud goes on after a move during its read');
  /* Fix round 1. */
  must('if(s0State.protocol>=2) s0Seen2.add(key);', 'protocol 2 is not remembered past the one slot');
  must('if(s0Seen2.has(dbn+"|"+(uid||""))) return "switched";', 'protocol 2 remembered is not held');
  must('function s0Guard(err){ return !!err&&err.code==="P0001"&&typeof err.message==="string"&&err.message.indexOf("project switched")===0; }', 'any P0001 is taken for the guard');
  must('if(guard&&!(s0Mine(dbn,uid)&&s0State.ok)){', 'the guard\'s refusal overrides a read that answered');
  /* Fix round 2 (superseding fix round 1's "a move answers held"). */
  must('if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return {db:dbn, uid:uid, moved:true, got:got};', 'a read the page moved away from is thrown away');
  must('if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return s0HeldFor(dbn,uid,sid,r);', 'a sender judges the store moved to');
  must('if(wsDbName()!==dbn||(s0Uid()||null)!==uid) return s0HeldFor(dbn,uid,sid,r)||(guard&&!s0AnsweredFor(dbn,uid,r));', 'a refusal is judged for the store moved to');
  must('if(s0Flight){ try{ await s0Flight; }catch(_){ } }', 'a read already running is trusted after a refusal or a confirm');
  must('  const r=await s0Fresh();', 'the read after a refusal can be one that began before it');
  must('if(s0End()){ s0Cut=true; break; }', 'the stale-row DELETEs are checked once, on entry');
  must('serverPaths=s0Cut ? null : kept.map(r=>r.path).filter(Boolean);', 'the sweep can run on a list cut short');
  {
    const homes = (code.match(/wsDbName\(\)===s0Home|wsDbName\(\)!==s0Home/g) || []).length;
    if (homes !== 5) throw new Error('expected 5 writes that stay out of a store the page moved to, found ' + homes);
  }
  must('const s0End=()=>!!s0Held()||!!reasons.held;', 'Save to cloud\'s end of run is not held');
  must('if(!s0End()) try{', 'Save to cloud\'s layers PATCH is not held');
  must('if(await s0Refuse(true)) return;' + NL + '  say("Clearing the server\\u2026");', 'Remove from server does not read, afresh, after its confirm');
  if ((code.match(/if\(!s0End\(\)/g) || []).length !== 3) throw new Error('expected Save to cloud\'s 3 end-of-run writes held, found ' + (code.match(/if\(!s0End\(\)/g) || []).length);
  /* Nine senders read before they send (await s0Blocked): cloudSyncOne,
     cloudDropOne, cloudPatchOne, cloudRarity, setRarityMany,
     cloudSendShelfPlan, saveLayers, shareRules, dbDelShared. Save to cloud
     reads afresh at its start and holds its end of run on what the run saw
     (s0End). Seven refusals read afresh (await s0Refuse): Remove from
     server, before its confirm and after it (a read begun after it); the
     two tile removals; Clear; a folder import; a project file. */
  if ((code.match(/await s0Blocked\(\)/g) || []).length !== 9) throw new Error('expected 9 held senders, found ' + (code.match(/await s0Blocked\(\)/g) || []).length);
  if ((code.match(/await s0Refuse\(/g) || []).length !== 7) throw new Error('expected 7 refused actions, found ' + (code.match(/await s0Refuse\(/g) || []).length);
  if (/setItem\(\s*["']pb\.migrating/.test(code)) throw new Error('stage 0 must never set the migration flag (B1)');
});
