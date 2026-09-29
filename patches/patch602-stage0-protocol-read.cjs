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
   - The stale-row DELETEs ask on each row, not once on entry.

   Fix round 3 (the re-review of eaa3f75; each measured red on eaa3f75
   first):
   - Fix round 2's "judged for its own store, the send goes to its own
     target" holds only for a sender whose target and body are both fixed
     before its read - cloudRarity and setRarityMany. The other seven read
     their body or target, or write, after it, from the store shown: a move
     during the read deleted My page's own trait, sent My page's layer
     order and rules to the group, filed the group's row in My page's
     removal list, wrote a phantom synced copy into My page, and sent a
     shelf order with My page's collection. A sender the page moved away
     from during its read is held now, unless it says it is addressed.
   - Every write a sender makes after its read or its send asks whether
     the page is still on the store the send was for (8b, 8c); Save to cloud
     sends no item past a move, and its end of run stops after one. A shelf
     move leaves the rules of the project moved to alone.
   - A held send the page moved away from no longer loses the change: a
     weight, a weight on many, a shelf move, a batch move and a status
     change are written marked unsent before the send, and the mark is
     cleared after a send that landed.

   Fix round 4 (the re-review of f5a23b8, with a server of its own that
   keeps state; each measured red on f5a23b8 first, tests/stage0moves):
   - One mechanism, the action's home (s0HomeNow: store, account, wsGen),
     noted when the person acts; every local write after a wait asks
     s0AtHome, every send s0SendHome, and s0Blocked asks before its read as
     well as after. Rounds 1 to 3 noted a store where a sender happened to
     be reached, and missed a removal that looked its collection up after
     the read (My page's row deleted), a save that checked sign-in before
     it (My page's picture overwritten), the layer list (no home at all),
     and a shelf move that noted it after draftsFollow (the rules
     retargeted into My page). Every action was enumerated by call site
     (the table in the Task 11 report), not patched by example.
   - cloudTeamId is set and trusted only for the store and account it was
     read for: a my_team answer that arrived after the page left and came
     back was kept as the group's team.
   - An addressed send that landed after a move clears its mark in the
     store it was for, by name, compare-and-set (s0ClearAhead): left
     unsent, the next Save to cloud undid a teammate's removal.
   - A status change moved during its row insert says the old copy is
     kept; every sender that is not addressed says the page left; Save to
     cloud says it stopped; protocol 2 from a moved read is remembered. */
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
  '/* FINAL FIXES, B3: A REFUSED ACTION\'S OWN WORDS. D1\'s two sentences above',
  '   describe what is kept here and sent after: drawings, saves, weights,',
  '   status changes. Shown for an action stage 0 refuses - Clear, an',
  '   import, a removal, Leave, Remove from server, Load from cloud, a drag',
  '   put back - they said it was kept and would be sent after, and nothing',
  '   of it was: the final review called a switch off after each, and none',
  '   of them happened (measured). A refusal says so, in this sentence,',
  '   whatever holds the project; the bar, the fixer\'s line and every kept',
  '   change keep D1\'s words. */',
  'const S0_REFUSED="This project is being updated, so this was not done. Try again once it has finished.";',
  '/* A shelf move whose send the page moved away from (fix round 3, 8b). */',
  'const S0_LEFT="Not sent: you left the project first. The move is kept there, and its next Save to cloud sends it";',
  '/* The same for every other sender that is not addressed (fix round 4): what',
  '   was changed is kept, marked unsent, in the project it was made in. */',
  'const S0_LEFT_SENT="Not sent: you left the project first. The change is kept there, and its next Save to cloud sends it";',
  '/* Fix round 4: a change the page moved away from before anything of it was',
  '   written; a removal made here whose send the page moved away from; a Save',
  '   to cloud the page moved away from; a Remove from server likewise. */',
  'const S0_LEFT_UNMADE="Not saved: you left the project before it was written";',
  'const S0_LEFT_PART="Stopped part way: you left the project. What was done is kept there";',
  'const S0_LEFT_REMOVED="you left the project before the removal was sent, so it will come back";',
  'const S0_LEFT_UNREMOVED="Not removed: you left the project first";',
  'const S0_LEFT_PUSH="Save to cloud stopped: you left the project. What it had not finished is kept there, marked unsent, and its next Save to cloud sends it";',
  'const S0_LEFT_CLEAR="Nothing was removed from the server: you left the project first.";',
  'const S0_LEFT_IMPORT="stopped: you left the project first - import the rest there";',
  'const S0_LEFT_CLEAR_PART="Stopped part way: you left the project. Press Remove from server again there - it is safe to repeat.";',
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
  '  /* (Fix round 4: cloudTeamId is trusted only for the store it was read',
  '     for - cloudTeam answers it, or reads it again.) */',
  '  try{ team=activeWs||await cloudTeam(); }catch(_){ team=null; }',
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
  '       sender can judge the store its send is for (fix round 2). Protocol 2',
  '       is still remembered for the key it was read for: the switch is one',
  '       way, whichever store the page shows now (fix round 4, measured: it',
  '       returned before the line below). */',
  '    if(wsDbName()!==dbn||(s0Uid()||null)!==uid){ if(got&&got.protocol>=2) s0Seen2.add(key); return {db:dbn, uid:uid, moved:true, got:got}; }',
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
  '   held there, the send goes to its own target, as 60ecb5d sent it.',
  '   MOVED MEANS HELD, UNLESS THE SEND IS ADDRESSED (fix round 3). Fix round',
  '   2 let every send go to "its own target", and that is true only of a',
  '   sender whose target AND body are both fixed before its read: the rest',
  '   read their body or their target, or write, after it, from the store',
  '   shown - the layer list and the rules the move reloaded, the collection',
  '   looked up after the read, the record read again to delete it - and',
  '   acted on the project moved to (measured by the review of eaa3f75).',
  '   addressed: the caller fixed its row ids and its body before the read',
  '   (cloudRarity, setRarityMany); judged for its own store, as above. Any',
  '   other sender the page moved away from during its read is held, and',
  '   sends nothing.',
  '   HOME, BEFORE THE READ AS WELL AS DURING IT (fix round 4). home is the',
  '   store, account and wsGen the ACTION was begun in (s0HomeNow, below),',
  '   not the store shown when this is reached: a sender that looked up the',
  '   user, the team or the collection first, or a caller that read the',
  '   store first, can reach here after a move, and judged "moved" from',
  '   here it read and sent for the project moved to (measured: a removal',
  '   deleted My page\'s row, a save uploaded over My page\'s picture, the',
  '   layer list was sent to the wrong project). A sender that is not',
  '   addressed answers "left" (truthy) once the page has left home, before',
  '   or during the read; an addressed one is judged for home. */',
  'async function s0Blocked(addressed,home){',
  '  home=home||s0HomeNow();',
  '  const dbn=home.db, uid=home.uid, sid=s0SessionUid(sbLoadSession());',
  '  if(!s0SendHome(home)) return addressed ? s0HeldFor(dbn,uid,sid,null) : "left";',
  '  let r=null;',
  '  try{ r=await s0Check(false); }catch(_){ r=null; }',
  '  if(!s0SendHome(home)) return addressed ? s0HeldFor(dbn,uid,sid,r) : "left";',
  '  return !!s0Held();',
  '}',
  '/* THE ACTION\'S HOME (fix round 4). Rounds 1 to 3 closed the move race one',
  '   sender at a time, each noting its store where it happened to be',
  '   reached, and each round the review found a neighbour open (measured).',
  '   One mechanism now: every action that ends in a local write or a send',
  '   notes, when the person acts, the store, the account and wsGen',
  '   (s0HomeNow), and every write or send after any await asks first, with',
  '   no await between the asking and the write:',
  '     - s0AtHome: still on that store, and never left it since (wsGen',
  '       moves on every switch and sign-out, so away and straight back is',
  '       away). A local write does nothing once this is false.',
  '     - s0SendHome: and the same account, whose token the send carries. A',
  '       send is held once this is false, except by the two addressed',
  '       senders (s0Blocked).',
  '   A call to a function that notes its own home first is a write or send',
  '   too: its caller asks just before calling, so the callee\'s home is the',
  '   caller\'s. */',
  'function s0HomeNow(){ return {db:wsDbName(), uid:s0Uid()||null, gen:wsGen}; }',
  'function s0AtHome(h){ return !!h&&h.gen===wsGen&&h.db===wsDbName(); }',
  'function s0SendHome(h){ return s0AtHome(h)&&h.uid===(s0Uid()||null); }',
  '/* Why s0SendHome answered no, as a sender\'s reason: "left" when the page',
  '   left the store (or another account is signed in), "signedout" when the',
  '   session ended under the action - a revoked sign-in clears it with no',
  '   wsGen move, and "you left the project" was said for it (measured,',
  '   whyitdidnotreach.spec.js). */',
  'function s0LeftReason(h){ return (!s0AtHome(h)||s0Uid()) ? "left" : "signedout"; }',
  '/* The words for a send the page left: inside another sentence, on its',
  '   own, and for a removal (dbDelShared\'s why.left). */',
  'function s0LeftInline(w){ w=w||S0_LEFT_SENT; return w.charAt(0).toLowerCase()+w.slice(1); }',
  'function s0LeftSaid(){ toast(S0_LEFT_SENT); }',
  'function s0LeftRemoval(gone,name){ return gone==="held" ? S0_LEFT_UNREMOVED : "Removed "+name+" here, but "+S0_LEFT_REMOVED; }',
  '/* F1 (fix round 4): AN ADDRESSED SEND THAT LANDED AFTER THE PAGE MOVED.',
  '   setRarity and setRarityMany write the weight marked unsent ahead of the',
  '   send (fix round 3), and cleared the mark only while the page was still',
  '   on its store - so a send that landed after a move left the group\'s',
  '   record falsely unsent, and the next Save to cloud undid a teammate\'s',
  '   removal of the row, filed a false clash, and could write this weight',
  '   over a teammate\'s newer one (measured by the review of f5a23b8). The',
  '   mark is cleared in the store the send was FOR, opened by name, never',
  '   through db() (which resolves the store shown), and only if the record',
  '   there still holds what was written ahead: read and put in one',
  '   readwrite transaction. A store that no longer exists is not made again',
  '   (the upgrade is aborted). Answers how many it cleared. */',
  'function s0InStore(name){',
  '  return new Promise((res,rej)=>{',
  '    s0Hold(name).then(hold=>{',
  '      const let_go=()=>{ if(hold&&hold.release){ try{ hold.release(); }catch(_){} } };',
  '      try{',
  '        const r=indexedDB.open(name,1);',
  '        r.onupgradeneeded=()=>{ try{ r.transaction.abort(); }catch(_){ } };',
  '        r.onsuccess=()=>res(s0Track(name,r.result,hold));',
  '        r.onerror=()=>{ let_go(); rej(r.error); };',
  '      }catch(e){ let_go(); rej(e); }',
  '    });',
  '  });',
  '}',
  'function s0StillAhead(cur,want){',
  '  return !!cur&&!!want&&!cur.synced&&cur.unsent==="meta"&&cur.kind===want.kind&&cur.rowId===want.rowId',
  '    &&cur.rarity===want.rarity&&cur.shelfOrder===want.shelfOrder&&cur.name===want.name',
  '    &&(cur.layer||"")===(want.layer||"")&&(cur.status||"wip")===(want.status||"wip")&&(cur.at||0)===(want.at||0);',
  '}',
  'async function s0ClearAhead(home,ahead){',
  '  if(!home||!ahead||!ahead.length) return 0;',
  '  let d=null;',
  '  try{ d=await s0InStore(home.db); }catch(_){ return 0; }',
  '  try{',
  '    return await new Promise((res,rej)=>{',
  '      const t=d.transaction(STORE,"readwrite"), s=t.objectStore(STORE);',
  '      let n=0;',
  '      for(const want of ahead){',
  '        const q=s.get(want.id);',
  '        q.onsuccess=()=>{',
  '          const cur=q.result;',
  '          if(!s0StillAhead(cur,want)) return;',
  '          const clean=Object.assign({},cur,{synced:true}); delete clean.unsent;',
  '          s.put(s0Stamps(clean) ? s0Stamp(clean,cur,undefined,home.uid) : clean);',
  '          touchedAt.set(String(want.id),++touchSeq);',
  '          n++;',
  '        };',
  '      }',
  '      t.oncomplete=()=>{ if(n){ tabStores.add(home.db); tabsTell(); } res(n); };',
  '      t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t));',
  '    });',
  '  }catch(_){ return 0; }',
  '  finally{ try{ d.close(); }catch(_){ } }',
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
  '       written for the store moved to (fix round 2).',
  '     - The page moved BEFORE the read (fix round 4): home is the store and',
  '       account the refused send was for; no read of it can be made from',
  '       here, so it is judged as a read that cannot answer. */',
  'async function s0Recheck(err,home){',
  '  home=home||s0HomeNow();',
  '  const dbn=home.db, uid=home.uid, sid=s0SessionUid(sbLoadSession()), guard=s0Guard(err);',
  '  if(!s0SendHome(home)) return s0HeldFor(dbn,uid,sid,null)||guard;',
  '  const r=await s0Fresh();',
  '  if(!s0SendHome(home)) return s0HeldFor(dbn,uid,sid,r)||(guard&&!s0AnsweredFor(dbn,uid,r));',
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
  '  toast(S0_REFUSED);   /* final fixes, B3: refused, not kept */',
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
  '  /* STAGE 0: held back on purpose, and kept here (D1). Held because the',
  '     page left the project first, it says that (fix round 4): "BuildaNFT',
  '     was updated" was said for a move. */',
  '  if(r==="left") return s0LeftInline()+".";',
  '  if(r==="held") return s0Inline(s0Held()||"switched")+".";',
]);
doc.swap('  return best==="signedout" ? "you are signed out on this device"', [
  '  return best==="left" ? "you left the project first"',
  '    : best==="held" ? s0Inline(s0Held()||"switched")',
  '    : best==="signedout" ? "you are signed out on this device"',
]);

/* ---- 5. cloudSyncOne ------------------------------------------------------ */
/* Fix round 4: every wait before the read (the sign-in check, the team, the
   collection) and every send after it asks whether the page is still home
   (s0SendHome) - with no ctx, a move during the sign-in check uploaded the
   group's picture over My page's (measured). "left" says why. */
doc.swap('    if(who.state!=="in") return say(who.state==="out"?"signedout":"unreachable");', [
  '    if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));   /* STAGE 0 (fix round 4) */',
  '    if(who.state!=="in") return say(who.state==="out"?"signedout":"unreachable");',
]);
doc.swap('  const team=ctx.team||await cloudTeam(); if(!team) return outOrOffline();',
  '  const team=ctx.team||await cloudTeam(); if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home)); if(!team) return outOrOffline();');
doc.swap('  const c=ctx.c||await cloudCollection(u); if(!c) return say("collection");', [
  '  const c=ctx.c||await cloudCollection(u); if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home)); if(!c) return say("collection");',
  '  /* STAGE 0 (D1): nothing is sent while this project is held. Every caller',
  '     already keeps a record that did not go up as unsent. Nor once the page',
  '     has left the project this save was for (fix round 4). */',
  '  { const s0b=await s0Blocked(false,s0Home); if(s0b) return say(s0b==="left"?s0LeftReason(s0Home):"held"); }',
]);
doc.swap('        up=await fetch(SB_URL+"/storage/v1/object/traits/"+p,', [
  '        if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));   /* STAGE 0 (fix round 4) */',
  '        up=await fetch(SB_URL+"/storage/v1/object/traits/"+p,',
]);
doc.swap('        if(up.status===403) return say("notallowed",up.status);',
  '        if(up.status===403) return (await s0Recheck(null,s0Home)) ? say("held",up.status) : say("notallowed",up.status);');
doc.swap('    if(!up.ok) return say(cloudLater(up.status)?"unreachable":"refused",up.status);', [
  '    if(!up.ok){',
  '      /* STAGE 0 (D1): a refusal is read again before it is reported. */',
  '      if(up.status!==401&&await s0Recheck(null,s0Home)) return say("held",up.status);',
  '      return say(cloudLater(up.status)?"unreachable":"refused",up.status);',
  '    }',
]);
doc.swap('    await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",headers:h});', [
  '    if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));   /* STAGE 0 (fix round 4) */',
  '    await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",headers:h});',
]);
doc.swap('        r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",', [
  '        if(!s0SendHome(s0Home)) return say(s0LeftReason(s0Home));   /* STAGE 0 (fix round 4) */',
  '        r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",',
]);
doc.swap('    if(!adopted && !r.ok) return say(r.status===403 ? "notallowed"', [
  '    if(!adopted && !r.ok && r.status!==401){',
  '      /* STAGE 0 (D1): read again before saying what happened. */',
  '      let err=null; try{ err=await r.clone().json(); }catch(_){ err=null; }',
  '      if(await s0Recheck(err,s0Home)) return say("held",r.status);',
  '    }',
  '    if(!adopted && !r.ok) return say(r.status===403 ? "notallowed"',
]);

/* ---- 6. cloudDropOne, cloudPatchOne, cloudRarity, setRarityMany ---------- */
doc.swap(['  if(!activeWs){ await goneAdd(rec); return null; }', '  /* ctx: the user, team and collection the caller already has - see'], [
  '  /* STAGE 0: the action\'s home (fix round 4) - the caller\'s, in ctx, else',
  '     this call\'s. A caller that waited first asks it before calling. */',
  '  const s0Home=(ctx&&ctx.home)||s0HomeNow();',
  '  if(!s0AtHome(s0Home)) return null;',
  '  if(!activeWs){ await goneAdd(rec,s0Home); return null; }',
  '  /* STAGE 0 (D1): a removal is not sent while this project is held. */',
  '  if(await s0Blocked(false,s0Home)) return null;',
  '  /* ctx: the user, team and collection the caller already has - see',
]);
/* Fix round 4: the user, team and collection are looked up AFTER the read;
   a never-sent group trait's removal, moved during that lookup, sent
   DELETE traits?collection_id=eq.cme and removed My page's row and picture
   (measured). Each send asks home first. */
doc.swap('        r=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",', [
  '        if(!s0SendHome(s0Home)) return null;   /* STAGE 0 (fix round 4) */',
  '        r=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",',
]);
doc.swap(['    if(!r||!r.ok) return null;', '    let removed=[];'], [
  '    if(!r||!r.ok){ if(r&&r.status!==401) await s0Recheck(null,s0Home); return null; }',
  '    let removed=[];',
]);
doc.swap('      try{ await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",', [
  '      /* STAGE 0 (fix round 4): the row is gone; its picture waits for the',
  '         sweep if the page has left. */',
  '      if(s0SendHome(s0Home)) try{ await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",',
]);
doc.swap(['  const readAt=(typeof seq==="number")?seq:touchSeq;', '  if(!rec||!rec.rowId) return false;'], [
  '  const readAt=(typeof seq==="number")?seq:touchSeq;',
  '  if(!rec||!rec.rowId) return false;',
  '  /* STAGE 0 (D1): held, nothing is patched; the caller\'s upload is held too. */',
  '  if(await s0Blocked(false,s0Home)) return false;',
]);
doc.swap(['    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),', '      {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h),'], [
  '    if(!s0SendHome(s0Home)) return false;   /* STAGE 0 (fix round 4) */',
  '    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
  '      {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h),',
]);
doc.swap(['    if(!r.ok) return false;', '    let rows=[]; try{ rows=await r.json(); }catch(_){ rows=[]; }'], [
  '    if(!r.ok){ if(r.status!==401) await s0Recheck(null,s0Home); return false; }',
  '    let rows=[]; try{ rows=await r.json(); }catch(_){ rows=[]; }',
]);
doc.swap(['async function cloudRarity(rec){', '  if(!activeWs || !rec || !rec.rowId) return "nogroup";'], [
  'async function cloudRarity(rec,home){',
  '  /* STAGE 0 (fix round 4): the store the weight was written in - setRarity\'s',
  '     home - decides whether it has a group, not the store shown by now. */',
  '  const s0Home=home||s0HomeNow();',
  '  if(s0Home.db===DBN || !rec || !rec.rowId) return "nogroup";',
  '  /* STAGE 0 (D1): held, the weight stays here, and setRarity marks it unsent.',
  '     Addressed (fix round 3): the row id and the weight are rec\'s, fixed',
  '     before the read, so a move during it does not change where or what. */',
  '  if(await s0Blocked(true,s0Home)) return "unreachable";',
]);
doc.swap('    let why=""; try{ why=await r.text(); }catch(_){ }', [
  '    if(r && r.status!==401 && await s0Recheck(null,s0Home)) return "unreachable";',
  '    let why=""; try{ why=await r.text(); }catch(_){ }',
]);
doc.swap(['    let refused=false;', '    for(let i=0;i<onServer.length;i+=RARITY_BATCH){'], [
  '    let refused=false;',
  '    /* STAGE 0 (D1): held, nothing is patched, and every synced row is behind.',
  '       Addressed (fix round 3): the row ids and the weight were fixed above,',
  '       before the read. */',
  '    const s0h=await s0Blocked(true,s0Home);',
  '    if(s0h) for(const r of onServer) if(r.synced) behind.push(r);',
  '    for(let i=0;!s0h&&i<onServer.length;i+=RARITY_BATCH){',
]);
doc.swap('  if(!activeWs){ for(const r of onServer) if(r.synced) behind.push(r); }',
  '  if(s0Home.db===DBN){ for(const r of onServer) if(r.synced) behind.push(r); }   /* STAGE 0 (fix round 4): home decides */');
doc.swap('      if(status===400 && /rarity/i.test(body)){ refused=true; continue; }', [
  '      if(status>=400&&status!==401&&await s0Recheck(null,s0Home)){ for(const r of part) if(r.synced) behind.push(r); continue; }',
  '      if(status===400 && /rarity/i.test(body)){ refused=true; continue; }',
]);

/* ---- 7. the shelf order, the layers, the rules --------------------------- */
doc.swap('  if(!activeWs) return {ok:true};', [
  '  if(!activeWs) return {ok:true};',
  '  /* STAGE 0 (D1): held, the order is not sent; commitShelfMove puts the old one back.',
  '     Held because the page left the project first (fix round 4), it says so:',
  '     left:true, and the caller says S0_LEFT. */',
  '  { const s0b=await s0Blocked(false,s0Home); if(s0b) return {ok:false,reason:"held",left:s0b==="left"}; }',
]);
doc.swap('    let detail={}; try{ detail=await r.json(); }catch(_){}', [
  '    let detail={}; try{ detail=await r.json(); }catch(_){}',
  '    if(r.status!==401&&await s0Recheck(detail,s0Home)) return {ok:false,reason:"held"};',
]);
doc.swap("      : 'Move did not sync, so the old order was restored');", [
  "      : shared.reason==='held' ? S0_REFUSED   /* final fixes, B3: put back, so not done */",
  "      : 'Move did not sync, so the old order was restored');",
]);
doc.swap([
  '    if(c&&h){',
  '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
  '        headers:h, body:JSON.stringify({layers:LAYERS})});',
  '      shared=r.ok;',
], [
  '    if(c&&h){',
  '      /* STAGE 0 (D1): held, the list stays here and "not shared yet" says so.',
  '         Held because the page left the project, it says that (fix round 4). */',
  '      { const s0b=await s0Blocked(false,s0Home); if(s0b){ if(s0b==="left") s0LeftSaid(); throw new Error("held"); } }',
  '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
  '        headers:h, body:JSON.stringify({layers:LAYERS})});',
  '      shared=r.ok;',
  '      if(!r.ok&&r.status!==401) await s0Recheck(null,s0Home);',
]);
doc.swap(['    if(c&&h){', '      /* READ, MERGE, THEN WRITE. The PATCH below writes the whole list of'], [
  '    if(c&&h){',
  '      /* STAGE 0 (D1): held, the rules and answers stay here. Held because the',
  '         page left the project, it says that (fix round 4). */',
  '      { const s0b=await s0Blocked(false,s0Home); if(s0b){ if(s0b==="left") s0LeftSaid(); throw new Error("held"); } }',
  '      /* READ, MERGE, THEN WRITE. The PATCH below writes the whole list of',
]);
doc.swap(['          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});', '      shared=r.ok;'], [
  '          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});',
  '      shared=r.ok;',
  '      if(!r.ok&&r.status!==401) await s0Recheck(null,s0Home);',
]);

/* ---- 8. the batches: Save to cloud, a pull, Remove from server ----------- */
doc.swap('async function cloudPush(){', [
  'async function cloudPush(){',
  '  /* STAGE 0: the project this push is for, noted before its first wait (the',
  '     controller\'s audit, Finding 5; used after the protocol read below).',
  '     The action\'s home since fix round 4 (s0HomeNow): every item\'s send, and',
  '     every write and send at the end of the run, asks it. */',
  '  const s0Home=s0HomeNow();',
]);
/* Fix round 4: a move during the sign-in check or the lookups is said, not
   reported as a collection or a team that could not be opened. */
doc.swap(['  const c=await cloudCollection(u);', '  if(!c){ toast("Could not open your collection on the server"); return; }'], [
  '  const c=await cloudCollection(u);',
  '  if(!s0SendHome(s0Home)){ toast(S0_LEFT_PUSH); return; }   /* STAGE 0 (fix round 4) */',
  '  if(!c){ toast("Could not open your collection on the server"); return; }',
]);
doc.swap(['  const team=await cloudTeam();', '  if(!team){ toast("Could not open your team"); return; }', '  let items=[];'], [
  '  const team=await cloudTeam();',
  '  if(!s0SendHome(s0Home)){ toast(S0_LEFT_PUSH); return; }   /* STAGE 0 (fix round 4) */',
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
  '     push-in-flight class Task 10 left open. (Closed in fix round 4: every',
  '     item and every end-of-run write asks s0Home, and the move is said.) */',
  '  if(!s0SendHome(s0Home)){ toast(S0_LEFT_PUSH); return; }',
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
  '     The layer list stays unshared here, as saveLayers leaves it.',
  '     AND WHEN THE PAGE HAS MOVED since the push began (fix round 3): the',
  '     three read activeWs and LAYERS late, and the removal list from the',
  '     store shown - the project moved to\'s - so a push that a move overtook',
  '     sent that project\'s layers to this one, or ran the personal page\'s',
  '     stale-row removal against a group. */',
  '  const s0End=()=>!s0SendHome(s0Home)||!!s0Held()||!!reasons.held;',
  '  let stale=0, notHere=0, serverPaths=null;',
]);
doc.swap('  if(!activeWs && !failed && !notTried && !changed){',
  '  if(!s0End() && !activeWs && !failed && !notTried && !changed){');
doc.swap('    if(!activeWs && !failed && !changed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);',
  '    if(!s0End() && !activeWs && !failed && !changed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))],s0Home);');
doc.swap(['  try{', '    h=(await sbHeaders({"Content-Type":"application/json"}))||h;', '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,'], [
  '  if(!s0End()) try{',
  '    h=(await sbHeaders({"Content-Type":"application/json"}))||h;',
  '    if(s0End()) throw new Error("held");   /* STAGE 0 (fix round 4): after the wait above */',
  '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,',
]);
/* Fix round 4: every item carries the push's home to its sender; the loop
   stops at a move; the removal list is forgotten for home only; and a push
   the page left says so - it said "Saved 6 to the cloud, 1 not tried -
   stopped" while all seven stayed unsent (measured). */
doc.swap('  const ctx={u:u, team:team, c:c};', '  const ctx={u:u, team:team, c:c, home:s0Home};');
doc.swap('    while(next<fresh.length && !broke && !pushStopAsked){', [
  '    /* STAGE 0 (8b): and not past a move. The items were read from the project',
  '       the push began in; sent after a move, each one\'s "sent" write, and its',
  '       fresh read, would resolve the project moved to (fix round 3). */',
  '    while(next<fresh.length && !broke && !pushStopAsked && s0SendHome(s0Home)){',
]);
doc.swap('        await goneForget(done);', '        await goneForget(done,s0Home);');
doc.swap(['  const bits=[];', '  if(saved) bits.push("Saved "+saved+" to the cloud");'], [
  '  /* STAGE 0 (fix round 4): what happened, when the page left mid-run. */',
  '  if(!s0SendHome(s0Home)){ toast(S0_LEFT_PUSH); return; }',
  '  const bits=[];',
  '  if(saved) bits.push("Saved "+saved+" to the cloud");',
]);
doc.swap(['  const u=who.user;', '  const c=await cloudCollection(u);', '  if(!c){ toast("Nothing on the server yet"); return; }'], [
  '  const u=who.user;',
  '  /* STAGE 0 (D1): a pull reads afresh first, and a held project pulls nothing. */',
  '  await s0Check(true);',
  '  /* (Final fixes, B3: a pull is refused, not kept - its own words.) */',
  '  { const why=s0Held(); if(why){ s0Show(); if(!opts.quiet) toast(S0_REFUSED); return; } }',
  '  const c=await cloudCollection(u);',
  '  if(!c){ toast("Nothing on the server yet"); return; }',
]);
doc.swap(['async function clearCloudNow(){', '  const note=$("cloudnote");'], [
  'async function clearCloudNow(){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  /* STAGE 0 (D1): removing from the server waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  const note=$("cloudnote");',
]);
doc.swap('  if(!team||!c){ say("Could not reach the server, so nothing was changed."); return; }', [
  '  if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }   /* STAGE 0 (fix round 4) */',
  '  if(!team||!c){ say("Could not reach the server, so nothing was changed."); return; }',
]);
doc.swap('  const rows=await cloudRowCount(c);', [
  '  const rows=await cloudRowCount(c);',
  '  if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }   /* STAGE 0 (fix round 4) */',
]);
doc.swap('      const relit=await relightUnsynced();', [
  '      if(!s0AtHome(s0Home)){ say(S0_LEFT_CLEAR); return; }   /* STAGE 0 (fix round 4) */',
  '      const relit=await relightUnsynced(s0Home);',
]);
/* THE RELIGHT GOES FIRST NOW (fix round 4). It came after the row DELETE,
   and a move during that DELETE would skip it (a local write does nothing
   once the page has left) - leaving this project's records claiming a
   server copy that was just removed, which Save to cloud skips as up to
   date. Marked first, a move anywhere after costs a resend, never a loss. */
doc.swap(['    const relit=await relightUnsynced();', '    await renderShelf();'], [
  '    const relit=s0Relit;   /* STAGE 0 (fix round 4): marked before the removal, below */',
  '    await renderShelf();',
]);
doc.swap('    files=await cloudSweep(team,c,[]);', '    files=await cloudSweep(team,c,[],s0Home);');
doc.swap(['    const h=await sbHeaders({"Content-Type":"application/json"});', '    if(h){', '      const d=await fetch(SB_URL+"/rest/v1/traits?collection_id=eq."+c.id,'], [
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR_PART); return; }   /* STAGE 0 (fix round 4) */',
  '    if(h){',
  '      const d=await fetch(SB_URL+"/rest/v1/traits?collection_id=eq."+c.id,',
]);
doc.swap('  say("Clearing the server\\u2026");', [
  '  /* STAGE 0 (D1): and again after the confirm, which can sit open for as long',
  '     as the person thinks. What follows removes every picture and every row',
  '     of the project, and it went on a verdict as old as that pause (fix',
  '     round 1, measured); the tile removals read again after theirs too.',
  '     A read that began after the confirm closed (fix round 2): one already',
  '     running - the two-minute read, say - can answer from before it. */',
  '  if(await s0Refuse(true)) return;',
  '  if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }   /* STAGE 0 (fix round 4) */',
  '  let s0Relit=0;',
  '  try{ s0Relit=await relightUnsynced(s0Home); }',
  '  catch(_){ say("Something went wrong part way through. Press it again - it is safe to repeat."); return; }',
  '  if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }',
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

/* ---- 8b. nothing written into a store the page moved to; the change kept ---
   Fix round 2: a send held for its own store while the page moved during
   its read is not sent, and the callers below then wrote an unsent mark,
   or rolled back, through db(), which resolves the store moved to - over
   or beside a record of that store with the same id. Each notes the store
   before its send (s0Home) and writes nothing once the page has moved off
   it.
   Fix round 3 (the re-review of eaa3f75): that kept the store moved to
   clean, but the store left kept the change marked synced, so nothing
   ever sent it. setRarity, setRarityMany, a shelf move, a batch move and
   a status change now write the change ALREADY MARKED UNSENT, in the write
   they make before the send, and clear the mark after a send that landed
   - still under s0Home, and not over an edit made since (touchedSince). A
   send dropped because the page moved costs a resend of the change, never
   the change. A status change is cleared by its upload's own "sent" write
   (cloudSyncOne). And every write a sender makes after its read or its
   send asks s0Home first: cloudSyncOne's and cloudPatchOne's "sent"
   writes, cloudMoveOne before its upload and before its removal,
   shareRules' merged rules, dbDelShared's read and removal (8c).
   Fix round 4 (the re-review of f5a23b8): s0Home is the ACTION's home now
   (s0HomeNow), noted when the person acts, before the first wait - not
   where the send happens to be reached, which was after draftsFollow and
   the redraw in a shelf move, and after the read of the record in a
   weight. The ahead write itself comes after a wait, so it asks too, and
   a change the page left before it was written is not written at all
   (S0_LEFT_UNMADE). An addressed send that landed after a move has its
   mark cleared in its own store (s0ClearAhead, F1). */
doc.swap(['async function setRarity(rec,w){', '  if(!rec) return false;'], [
  'async function setRarity(rec,w,home){',
  '  if(!rec) return false;',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['  const next={...rec, rarity:v};', '  await dbPut(next);', '  const sent=await cloudRarity(next);'], [
  '  const next={...rec, rarity:v};',
  '  /* STAGE 0 (8b in patch602): a synced weight is written marked unsent, and',
  '     the mark cleared once the group took it. The read of the record above',
  '     waited: left since, nothing is written (fix round 4). */',
  '  const s0Ahead=!!(next.rowId&&next.synced);',
  '  const s0Want=s0Ahead ? {...next, synced:false, unsent:"meta"} : next;',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }',
  '  await dbPut(s0Want);',
  '  const s0Seq=touchSeq;',
  '  const sent=await cloudRarity(next,s0Home);',
]);
doc.swap('  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced) await dbPut({...next, synced:false, unsent:"meta"});', [
  '  /* (STAGE 0: "unreachable" and "nogroup" keep the mark written above - what',
  '     this line used to write after the send. Anything else - the group took',
  '     it, or refused it and will refuse it again - is the record as it was.',
  '     Still home: written back, unless edited since. Left (F1, fix round 4):',
  '     cleared in the store the weight was written in, by name, and only if',
  '     it still holds s0Want.) */',
  '  if(s0Ahead && !(sent==="unreachable"||sent==="nogroup")){',
  '    if(s0AtHome(s0Home)){ if(!touchedSince(next.id,s0Seq)) await dbPut(next); }',
  '    else await s0ClearAhead(s0Home,[s0Want]);',
  '  }',
]);
doc.swap('  await dbApplyShelfRecords([],changed);', [
  '  /* STAGE 0 (8b in patch602): a synced row is written marked unsent, and the',
  '     mark cleared below for each row the group took. Home is noted here,',
  '     before this function\'s first wait (fix round 4). */',
  '  const s0Home=home||s0HomeNow();',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return 0; }',
  '  await dbApplyShelfRecords([],changed.map(r=>(r.rowId&&r.synced) ? Object.assign({},r,{synced:false, unsent:"meta"}) : r));',
  '  const s0Seq=touchSeq;',
]);
doc.swap('  if(behind.length) await dbApplyShelfRecords([],behind.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));', [
  '  /* (STAGE 0: what is behind keeps the mark written above - what this line',
  '     used to write. The rest landed, or was refused as before, and is',
  '     written back as it was: here while still home, unless edited since;',
  '     in its own store, by name, after a move (F1, fix round 4).) */',
  '  const s0Landed=changed.filter(r=>r.rowId&&r.synced&&behind.indexOf(r)<0);',
  '  if(s0Landed.length){',
  '    if(s0AtHome(s0Home)){ const s0Here=s0Landed.filter(r=>!touchedSince(r.id,s0Seq)); if(s0Here.length) await dbApplyShelfRecords([],s0Here); }',
  '    else await s0ClearAhead(s0Home,s0Landed.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));',
  '  }',
]);
doc.swap(['async function cloudSaveShelfPlan(updates,marked){', '  const r=await cloudSendShelfPlan(updates);', '  if(marked && !activeWs) return r;',
  '  if(!activeWs || !(r&&r.ok)) for(const u of (updates||[])) await markUnsent(u&&u.record);'], [
  'async function cloudSaveShelfPlan(updates,marked,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0: see 8b in patch602, and s0HomeNow */',
  '  const r=await cloudSendShelfPlan(updates,s0Home);',
  '  if(!s0AtHome(s0Home)) return r;',
  '  if(marked && !activeWs) return r;',
  '  if(!activeWs || !(r&&r.ok)) for(const u of (updates||[])) await markUnsent(u&&u.record,s0Home);',
]);
/* A shelf move: home when the person dropped the card, before its first
   read of the store (fix round 4; it was noted after draftsFollow and the
   redraw, so a move during draftsFollow let the rules retarget into My
   page and the toast said "Moved cap to hats" with nothing sent). */
doc.swap(['async function commitShelfMove(spec){', '  /* SAID, NOT SILENT. This returned false without a word, which was fine'], [
  'async function commitShelfMove(spec,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  /* SAID, NOT SILENT. This returned false without a word, which was fine',
]);
doc.swap('    const rr=free ? await setTraitStatus(moving,moving.status,free) : {ok:false};',
  '    const rr=free ? await setTraitStatus(moving,moving.status,free,s0Home) : {ok:false};');
doc.swap(['  if(!plan.ok){', '', "    toast(plan.reason==='duplicate'"], [
  '  /* STAGE 0 (fix round 4): every read above waited. Left since, nothing is',
  '     written, moved or sent, and that is said. */',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }',
  '  if(!plan.ok){',
  '',
  "    toast(plan.reason==='duplicate'",
]);
doc.swap('      plan.updates.map(update=>activeWs?update.record:unsentOf(update.record)));', [
  '      /* STAGE 0 (8b in patch602): in a group too, a synced record is written',
  '         marked unsent, and the mark cleared once the group took the order. */',
  '      plan.updates.map(update=>(activeWs&&!update.record.synced)?update.record:unsentOf(update.record)));',
]);
doc.swap('  try{ await draftsFollow(plan.updates.map(u=>({from:u.oldId, to:u.record.id}))); }catch(_){}',
  '  try{ await draftsFollow(plan.updates.map(u=>({from:u.oldId, to:u.record.id})),s0Home); }catch(_){}');
doc.swap(['  const shared=await cloudSaveShelfPlan(plan.updates,true);', '  if(!shared.ok){'], [
  '  const s0Seq=touchSeq, s0Group=s0Home.db!==DBN;   /* STAGE 0: see 8b in patch602 */',
  '  const shared=await cloudSaveShelfPlan(plan.updates,true,s0Home);',
  '  if(shared.ok&&s0Group&&s0AtHome(s0Home)){',
  '    const s0Took=plan.updates.filter(u=>u.record.synced&&!touchedSince(u.record.id,s0Seq)).map(u=>u.record);',
  '    if(s0Took.length){ try{ await dbApplyShelfRecords([],s0Took); }catch(_){ } }',
  '  }',
  '  if(!shared.ok){',
  '    /* STAGE 0: the page moved off this project during the send. The rollback',
  '       would write this project\'s records into the store moved to; the move',
  '       stays in the project left, marked unsent, and is said (fix round 3). */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT); return false; }',
]);
doc.swap('  await retargetRules(plan.updates.map(u=>', [
  '  /* STAGE 0 (8b): the rules are the project moved to\'s now; retargeting them',
  '     would rewrite and save that project\'s rules. The project left keeps its',
  '     own rules naming the trait\'s old place (fix round 3). */',
  '  if(s0AtHome(s0Home)) await retargetRules(plan.updates.map(u=>',
]);
/* The toast: "for the group" when the move's home is one, not the page
   shown by now (fix round 4). */
doc.swap("      +(activeWs?' for the group':'')+keptBothWords(keptAs)", "      +(s0Group?' for the group':'')+keptBothWords(keptAs)");
doc.swap("    : (activeWs?'Order saved for the group':'Order saved'));", "    : (s0Group?'Order saved for the group':'Order saved'));");
/* A batch move: the same, and its retargetRules (fix round 4, measured). */
doc.swap(['async function bulkMoveToLayer(toLayer){', '  if(!toLayer) return;'], [
  'async function bulkMoveToLayer(toLayer){',
  '  if(!toLayer) return;',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('        const rr=free ? await setTraitStatus(rec,rec.status,free) : {ok:false};',
  '        const rr=free ? await setTraitStatus(rec,rec.status,free,s0Home) : {ok:false};');
doc.swap('    if(!moved){', [
  '    /* STAGE 0 (fix round 4): every read above waited. Left since, nothing is',
  '       written, moved or sent, and that is said - before the words below,',
  '       which would describe what the loop read after the move. No wait',
  '       comes between this and the write. */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }',
  '    if(!moved){',
]);
doc.swap(['    const state=currentShelfVisibility();', '    try{', '      await dbApplyShelfRecords(gone,updates);', '    }catch(_){ toast("Could not save the move"); return; }'], [
  '    const state=currentShelfVisibility();',
  '    try{',
  '      /* STAGE 0 (8b in patch602): marked unsent in a group too, and cleared',
  '         below once the group took the order. And on your own page, ahead',
  '         of cloudSaveShelfPlan\'s marks, which a move before them skips (fix',
  '         round 4): the renumbered records keep their path, so Save to cloud',
  '         would skip them as up to date. */',
  '      await dbApplyShelfRecords(gone,updates.map(r=>r.synced?unsentOf(r):r));',
  '    }catch(_){ toast("Could not save the move"); return; }',
]);
doc.swap(['    try{ await draftsFollow(draftMoves); }catch(_){}', '    await retargetRules(ruleMoves);'], [
  '    try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
  '    /* STAGE 0 (fix round 4): the rules are the project moved to\'s after a',
  '       move during draftsFollow (measured for the single move). */',
  '    if(s0AtHome(s0Home)) await retargetRules(ruleMoves);',
]);
doc.swap('    const shared=await cloudSaveShelfPlan(updates.map(r=>({record:r})));', [
  '    const s0Seq=touchSeq, s0Group=s0Home.db!==DBN;   /* STAGE 0: see 8b in patch602 */',
  '    const shared=await cloudSaveShelfPlan(updates.map(r=>({record:r})),undefined,s0Home);',
  '    if(shared&&shared.ok&&s0Group&&s0AtHome(s0Home)){',
  '      const s0Took=updates.filter(r=>r.synced&&!touchedSince(r.id,s0Seq));',
  '      if(s0Took.length){ try{ await dbApplyShelfRecords([],s0Took); }catch(_){ } }',
  '    }',
]);
doc.swap('      +(shared&&shared.ok===false ? " here only - the group did not get it" : "")', [
  '      +(shared&&shared.left ? " - "+s0LeftInline(S0_LEFT)   /* STAGE 0 (fix round 4) */',
  '        : shared&&shared.ok===false ? " here only - the group did not get it" : "")',
]);
/* A status change: home from its caller, or its own; one write for the
   removal and the new record, so a move between them cannot leave the
   trait removed and not written back. */
doc.swap(['async function setTraitStatus(t,next,asName){', '  if(!t||!next) return {ok:false};'], [
  'async function setTraitStatus(t,next,asName,home){',
  '  if(!t||!next) return {ok:false};',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
/* The read of the record and the clash test read the store shown: after a
   move they answer for the project moved to, and a "changed in another
   tab" or "there is already one" would be said of it (measured: a clash
   with My page's own approved cap). The move is said instead. */
doc.swap('    try{ now=await dbGet(t.id); }catch(_){ now=null; }', [
  '    try{ now=await dbGet(t.id); }catch(_){ now=null; }',
  '    if(!s0AtHome(s0Home)) return {ok:false, left:true};   /* STAGE 0 (fix round 4) */',
]);
doc.swap('  if(await idHolder(moved.id,t.id)){', [
  '  const s0Clash=await idHolder(moved.id,t.id);',
  '  if(!s0AtHome(s0Home)) return {ok:false, left:true};   /* STAGE 0 (fix round 4) */',
  '  if(s0Clash){',
]);
doc.swap(['  await dbDel(t.id);', '  await dbPut(moved);'], [
  '  /* STAGE 0 (fix round 4): the reads above waited. Left since, nothing is',
  '     written (left:true says why). */',
  '  if(!s0AtHome(s0Home)) return {ok:false, left:true};',
  '  /* STAGE 0 (8b in patch602): written marked unsent; the upload\'s own "sent"',
  '     write clears it once the group has the new row. The removal and the',
  '     new record in ONE transaction (fix round 4): two writes with a wait',
  '     between, and a move in it would leave the trait removed and not',
  '     written back. */',
  '  await dbApplyShelfRecords([t.id],[moved.synced ? unsentOf(moved) : moved]);',
]);
doc.swap('  await draftsFollow([{from:t.id, to:moved.id}]);', '  await draftsFollow([{from:t.id, to:moved.id}],s0Home);');
doc.swap('  if(renamed) await carryRules(traitKey(t),traitKey(moved));', '  if(renamed) await carryRules(traitKey(t),traitKey(moved),s0Home);');
doc.swap('  const shared=await cloudMoveOne(now,moved,why);', '  const shared=await cloudMoveOne(now,moved,why,s0Home);');
doc.swap(['  if(shared){', '    let now=null; try{ now=await dbGet(moved.id); }catch(_){}'], [
  '  if(shared&&s0AtHome(s0Home)){   /* STAGE 0 (fix round 4) */',
  '    let now=null; try{ now=await dbGet(moved.id); }catch(_){}',
]);
doc.swap(['async function cloudMoveOne(oldRec,newRec,why){', '  /* No group means nothing was sent, and on a personal page the record',
  '     still describes a row the personal collection holds the old way. */', '  if(!activeWs){ await markUnsent(newRec); return null; }'], [
  'async function cloudMoveOne(oldRec,newRec,why,home){',
  '  /* STAGE 0: see 8b in patch602. The action\'s home (fix round 4): the',
  '     caller\'s - setTraitStatus\', after its writes - else this call\'s. */',
  '  const s0Home=home||s0HomeNow();',
  '  if(!s0AtHome(s0Home)){ if(why) why.reason="left"; return null; }',
  '  /* No group means nothing was sent, and on a personal page the record',
  '     still describes a row the personal collection holds the old way. */',
  '  if(!activeWs){ await markUnsent(newRec,s0Home); return null; }',
]);
doc.swap('      if(team&&c) ctx={u:who.user, team:team, c:c};', '      if(team&&c) ctx={u:who.user, team:team, c:c, home:s0Home};');
doc.swap(['  const arrived=await cloudSyncOne(fresh,ctx,why);', '  if(!arrived){ await markUnsent(newRec); return null; }'], [
  '  /* STAGE 0 (8b): moved before the upload - ctx may name the project moved',
  '     to. Nothing is sent, and the record stays unsent where it was made. */',
  '  if(!s0AtHome(s0Home)){ if(why) why.reason="left"; return null; }',
  '  const arrived=await cloudSyncOne(fresh,ctx||{home:s0Home},why);',
  '  if(!arrived){ await markUnsent(newRec,s0Home); return null; }',
  '  /* STAGE 0 (8b): moved during the upload. The old row is not removed from',
  '     here: cloudDropOne would read activeWs, now the project moved to, and',
  '     file the group\'s row in that store\'s removal list. Both rows stay, which',
  '     the comment above calls recoverable, and the record stays unsent - and',
  '     the person is told the old copy is still there (fix round 4). */',
  '  if(!s0AtHome(s0Home)){ if(why) why.oldKept=true; return arrived; }',
]);
doc.swap('  const dropped=await cloudDropOne(oldRec,ctx);', '  const dropped=await cloudDropOne(oldRec,ctx||{home:s0Home});');

/* ---- 8c. every write after a sender's read or send (fix round 3) ---------- */
doc.swap('async function cloudSyncOne(rec,ctx,why,seq){', [
  'async function cloudSyncOne(rec,ctx,why,seq){',
  '  /* STAGE 0: see 8b in patch602. The action\'s home (fix round 4): the',
  '     caller\'s, handed in ctx, else this call\'s own, noted before any wait. */',
  '  const s0Home=(ctx&&ctx.home)||s0HomeNow();',
]);
doc.swap('    if((adopted||r.ok) && rec.id && touchedSince(rec.id,readAt)){', [
  '    /* STAGE 0 (8b): moved during the send. The "sent" write below would land',
  '       in the store moved to, over its own record with this id; the record',
  '       stays unsent where it was made, and the next push replaces the row. */',
  '    if(!s0AtHome(s0Home)) return true;',
  '    if((adopted||r.ok) && rec.id && touchedSince(rec.id,readAt)){',
]);
doc.swap('      if(cur && !cur.synced){ try{ await dbPut(Object.assign({},cur,{rowId:madeId, rowAt:madeAt})); }catch(_){} }',
  '      if(cur && !cur.synced && s0AtHome(s0Home)){ try{ await dbPut(Object.assign({},cur,{rowId:madeId, rowAt:madeAt})); }catch(_){} }');
doc.swap(['async function cloudPatchOne(rec,ctx,seq){', '  const readAt=(typeof seq==="number")?seq:touchSeq;'], [
  'async function cloudPatchOne(rec,ctx,seq){',
  '  const readAt=(typeof seq==="number")?seq:touchSeq;',
  '  const s0Home=(ctx&&ctx.home)||s0HomeNow();   /* STAGE 0: see 8b in patch602, and s0HomeNow */',
]);
doc.swap('    if(rec.id && touchedSince(rec.id,readAt)) return true;', [
  '    if(rec.id && touchedSince(rec.id,readAt)) return true;',
  '    if(!s0AtHome(s0Home)) return true;   /* STAGE 0 (8b): moved during the send */',
]);
doc.swap(['async function cloudSendShelfPlan(updates){', '  if(!activeWs) return {ok:true};'], [
  'async function cloudSendShelfPlan(updates,home){',
  '  /* STAGE 0: see 8b in patch602. The action\'s home (fix round 4): the',
  '     shelf move\'s, noted when the card was dropped. Its store decides',
  '     whether there is a group to send to, not the page shown by now. */',
  '  const s0Home=home||s0HomeNow();',
  '  if(s0Home.db===DBN) return {ok:true};',
]);
doc.swap(['  const c=await cloudCollection(u);', '  if(!c) return {ok:false,reason:"collection"};'], [
  '  const c=await cloudCollection(u);',
  '  /* STAGE 0 (fix round 4): a move during the lookups is said as one - the',
  '     collection it finds is the project moved to\'s, or none. */',
  '  if(!s0SendHome(s0Home)) return {ok:false,reason:"held",left:true};',
  '  if(!c) return {ok:false,reason:"collection"};',
]);
doc.swap('    const r=await fetch(SB_URL+"/rest/v1/rpc/reorder_traits",{', [
  '    /* STAGE 0 (8b): the collection is looked up after the read; moved since,',
  '       it names the project moved to, which refuses every row. */',
  '    if(!s0SendHome(s0Home)) return {ok:false,reason:"held",left:true};',
  '    const r=await fetch(SB_URL+"/rest/v1/rpc/reorder_traits",{',
]);
doc.swap(['async function shareRules(){', '  if(!activeWs){ sharedRuleSig=null; return false; }'], [
  'async function shareRules(home){',
  '  /* STAGE 0: see 8b in patch602. The action\'s home (fix round 4): the',
  '     caller\'s - saveRules\', after its writes here - else this call\'s. Left,',
  '     RULES and DECISIONS are the project moved to\'s: nothing is sent, and',
  '     sharedRuleSig, which is about the project shown, is not touched. */',
  '  const s0Home=home||s0HomeNow();',
  '  if(!s0AtHome(s0Home)){ if(s0Home.db!==DBN) s0LeftSaid(); return false; }',
  '  if(!activeWs){ sharedRuleSig=null; return false; }',
]);
doc.swap('      const got=await g.json();', [
  '      const got=await g.json();',
  '      /* STAGE 0 (8b): moved during the read of the answers. RULES and',
  '         DECISIONS are the project moved to\'s now: nothing is merged into',
  '         them, written or sent. */',
  '      if(!s0AtHome(s0Home)){ s0LeftSaid(); throw new Error("moved"); }',
]);
doc.swap(['      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",', '        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,'], [
  '      if(!s0AtHome(s0Home)){ s0LeftSaid(); throw new Error("moved"); }   /* STAGE 0 (8b) */',
  '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
  '        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,',
]);

/* ---- 9. removals, Clear, imports, the fixer's line ----------------------- */
doc.swap('async function dbDelShared(rec){', [
  'async function dbDelShared(rec,home,why){',
  '  /* STAGE 0: see 8b in patch602. The action\'s home (fix round 4): the',
  '     tile\'s, noted at the press, before its read and its confirm - else',
  '     this call\'s. why.left says the page left the project first. */',
  '  const s0Home=home||s0HomeNow();',
  '  /* STAGE 0 (D1): a removal waits while this project is held. Nothing leaves',
  '     this device\'s store either, and the tile says why. */',
  '  { const s0b=await s0Blocked(false,s0Home); if(s0b){ if(s0b==="left"&&why) why.left=true; return "held"; } }',
]);
doc.swap(['  /* Or the character preview keeps compositing a trait that is gone. */', '  try{ cBitmapDrop(rec.id); }catch(_){}'], [
  '  /* STAGE 0 (8b): moved during the read of the record - it is the project',
  '     moved to\'s own record with this id now. Nothing is removed. */',
  '  if(!s0AtHome(s0Home)){ if(why) why.left=true; return "held"; }',
  '  /* Or the character preview keeps compositing a trait that is gone. */',
  '  try{ cBitmapDrop(rec.id); }catch(_){}',
]);
doc.swap(['  await dbDel(rec.id);', '  /* Your own page: removed here, and remembered, so the next Save to'], [
  '  await dbDel(rec.id);',
  '  /* STAGE 0 (8b): moved during the removal here. activeWs below is the',
  '     project moved to\'s: nothing is filed or sent for it. Removed here only. */',
  '  if(!s0AtHome(s0Home)){ if(why) why.left=true; return false; }',
  '  /* Your own page: removed here, and remembered, so the next Save to',
]);
doc.swap(['  if(!activeWs){ await goneAdd(rec); return true; }', '  return (await cloudDropOne(rec))===true;'], [
  '  /* STAGE 0 (fix round 4): filed, and sent, for home only - goneAdd and',
  '     cloudDropOne ask it after each of their own waits. */',
  '  if(!activeWs){ if(await goneAdd(rec,s0Home)) return true; if(why) why.left=true; return false; }',
  '  const s0Dropped=await cloudDropOne(rec,{home:s0Home});',
  '  if(s0Dropped!==true&&!s0AtHome(s0Home)&&why) why.left=true;',
  '  return s0Dropped===true;',
]);
/* The tiles: home at the press, before the read and the confirm, and the
   words for a removal the page left (fix round 4). */
doc.swap("const gone=await dbDelShared(t); renderShelf(); toast(gone ?",
  "const s0Why={}; const gone=await dbDelShared(t,s0Home,s0Why); renderShelf(); toast(s0Why.left ? s0LeftRemoval(gone,t.name) : gone===\"held\" ? S0_REFUSED : gone ?");
doc.swap("const gone=await dbDelShared(t); visibility.show(key); renderShelf(); toast(gone ?",
  "const s0Why={}; const gone=await dbDelShared(t,s0Home,s0Why); visibility.show(key); renderShelf(); toast(s0Why.left ? s0LeftRemoval(gone,t.name) : gone===\"held\" ? S0_REFUSED : gone ?");
doc.swap("        if(!confirm('Remove the reference \"'+t.name+'\"?')) return;", [
  '        const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '        if(await s0Refuse()) return;',
  "        if(!confirm('Remove the reference \"'+t.name+'\"?')) return;",
]);
doc.swap("        if(!confirm('Remove \"'+t.name+'\" from '+(t.layer||\"unsorted\")+'?')) return;", [
  '        const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
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
  '  /* STAGE 0 (fix round 4): the import\'s home - every write and send in it',
  '     asks, and one the page left stops, and says so (s0Left). */',
  '  const s0Home=s0HomeNow();',
  '  let s0Left=false;',
  '  /* STAGE 0 (D1): a folder import waits while this project is held. A fixer',
  '     save comes through here in place and is kept: its sends are held one',
  '     by one, and its records stay unsent. */',
  '  if(!inPlace&&await s0Refuse()) return;',
  '  /* (The layers below are adopted into LAYERS, the project shown.) */',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }',
]);
doc.swap(['async function importProject(file){', '  let doc=null;'], [
  'async function importProject(file){',
  '  /* STAGE 0 (fix round 4): the import\'s home. s0Go() asks it before each',
  '     write, and once it has answered no, keeps answering no (s0Left). */',
  '  const s0Home=s0HomeNow();',
  '  let s0Left=false;',
  '  const s0Go=()=>{ if(!s0AtHome(s0Home)) s0Left=true; return !s0Left; };',
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

/* ---- 12. the action's home: the helpers (fix round 4) -------------------- */
doc.swap(['let cloudTeamId=null;', '/* my_team() creates the team AND the membership row in one server-side step.'], [
  'let cloudTeamId=null;',
  '/* STAGE 0 (fix round 4): the store and account cloudTeamId was read for',
  '   ("<store>|<uid>"). It is set, and',
  '   trusted, only for that store: a my_team answer that arrived after the',
  '   page had left for My page and come straight back was kept as the',
  '   group\'s team, and the group\'s catch-up pulled My page\'s rows into its',
  '   store, and Save to cloud PATCHed My page\'s collection with the group\'s',
  '   layers (measured, 2 of 3 runs on f5a23b8, 3 of 3 on eaa3f75). */',
  'let cloudTeamFor=null;',
  '/* my_team() creates the team AND the membership row in one server-side step.',
]);
doc.swap(['async function cloudTeam(){', '  if(cloudTeamId) return cloudTeamId;', '  const h=await sbHeaders({"Content-Type":"application/json"});', '  if(!h) return null;', '  try{',
  '    if(activeWs){ cloudTeamId=activeWs; return cloudTeamId; }', '    const r=await fetch(SB_URL+"/rest/v1/rpc/my_team",{method:"POST",headers:h,body:"{}"});', '    if(!r.ok) return null;', '    cloudTeamId=await r.json();', '    return cloudTeamId;'], [
  'async function cloudTeam(){',
  '  /* STAGE 0 (fix round 4): noted before the first wait, and asked after',
  '     each - a move, or a move and back, answers nothing (null), as a',
  '     team that could not be opened. */',
  '  const s0Home=s0HomeNow();',
  '  const s0Key=s0Home.db+"|"+(s0Home.uid||"");',
  '  if(cloudTeamId&&cloudTeamFor===s0Key) return cloudTeamId;',
  '  const h=await sbHeaders({"Content-Type":"application/json"});',
  '  if(!h) return null;',
  '  if(!s0SendHome(s0Home)) return null;',
  '  try{',
  '    if(activeWs){ cloudTeamId=activeWs; cloudTeamFor=s0Key; return cloudTeamId; }',
  '    const r=await fetch(SB_URL+"/rest/v1/rpc/my_team",{method:"POST",headers:h,body:"{}"});',
  '    if(!r.ok) return null;',
  '    const got=await r.json();',
  '    if(!s0SendHome(s0Home)) return null;',
  '    cloudTeamId=got; cloudTeamFor=s0Key;',
  '    return cloudTeamId;',
]);
doc.swap(['  try{', '  const team=await cloudTeam();', '  if(!team) return null;', '  let h=await sbHeaders({"Content-Type":"application/json"});'], [
  '  try{',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  const team=await cloudTeam();',
  '  if(!team) return null;',
  '  let h=await sbHeaders({"Content-Type":"application/json"});',
]);
doc.swap(['  if(rows.length) return rows[0];', '  r=await fetch(SB_URL+"/rest/v1/collections",{method:"POST",'], [
  '  if(rows.length) return rows[0];',
  '  /* STAGE 0 (fix round 4): the insert carries LAYERS, read now - the',
  '     project moved to\'s after a move. Nothing is made then. */',
  '  if(!s0SendHome(s0Home)) return null;',
  '  r=await fetch(SB_URL+"/rest/v1/collections",{method:"POST",',
]);
/* The layer list: no home at all before (measured - a move during its
   collection lookup PATCHed the group with My page's layers). */
doc.swap(['async function saveLayers(){', '  /* In the layers record rather than a fourth settings row: a set being off is'], [
  'async function saveLayers(){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  /* In the layers record rather than a fourth settings row: a set being off is',
]);
doc.swap(['  await renderShelf();', '  if(!activeWs){ sharedLayerSig=null; return true; }'], [
  '  await renderShelf();',
  '  /* STAGE 0 (fix round 4): left during the redraw - LAYERS and',
  '     sharedLayerSig are the project moved to\'s. The list is written above,',
  '     in its own store; in a group it is not sent, and that is said. */',
  '  if(!s0AtHome(s0Home)){ if(s0Home.db!==DBN) s0LeftSaid(); return false; }',
  '  if(!activeWs){ sharedLayerSig=null; return true; }',
]);
doc.swap('  sharedLayerSig = shared ? sig : null;',
  '  if(s0AtHome(s0Home)) sharedLayerSig = shared ? sig : null;   /* STAGE 0 (fix round 4): about the project shown */');
/* The rules: two writes here, then the send, each after a wait. */
doc.swap(['async function saveRulesHere(){', '  await dbPut({id:RULES_ID, kind:"settings", at:Date.now(),'], [
  'async function saveRulesHere(home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  await dbPut({id:RULES_ID, kind:"settings", at:Date.now(),',
]);
doc.swap(['      return acc; },[])});', '  await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(),'], [
  '      return acc; },[])});',
  '  if(!s0AtHome(s0Home)) return false;   /* STAGE 0 (fix round 4) */',
  '  await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(),',
]);
doc.swap(['async function saveRules(){', '  /* Stamped here rather than in shareRules, so the copy in this browser and'], [
  'async function saveRules(home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  /* Stamped here rather than in shareRules, so the copy in this browser and',
]);
doc.swap(['  await saveRulesHere();', '  /* AND THE GROUP. Same shape as saveLayers: sent when it changed, and the'], [
  '  await saveRulesHere(s0Home);',
  '  /* AND THE GROUP. Same shape as saveLayers: sent when it changed, and the',
]);
doc.swap('  return await shareRules();', '  return await shareRules(s0Home);');
doc.swap('        await saveRulesHere();', '        await saveRulesHere(s0Home);');
doc.swap('  sharedRuleSig = shared ? JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]) : null;',
  '  if(s0AtHome(s0Home)) sharedRuleSig = shared ? JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]) : null;   /* STAGE 0 (fix round 4) */');
/* The rules carried to a new name: after a read of the store. */
doc.swap(['async function carryRules(fromKey,toKey){', '  if(!fromKey||!toKey||fromKey===toKey) return;', '  let still=true;',
  '  try{ still=(await dbAll()).some(i=>i&&i.kind==="trait"&&traitKey(i)===fromKey); }catch(_){ still=true; }'], [
  'async function carryRules(fromKey,toKey,home){',
  '  if(!fromKey||!toKey||fromKey===toKey) return;',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  let still=true;',
  '  try{ still=(await dbAll()).some(i=>i&&i.kind==="trait"&&traitKey(i)===fromKey); }catch(_){ still=true; }',
  '  /* RULES are the project moved to\'s after a move: nothing is copied or',
  '     retargeted in them, and nothing saved. */',
  '  if(!s0AtHome(s0Home)) return;',
]);
/* A drawing follows its trait: the editor first, then one transaction. */
doc.swap('async function draftsFollow(pairs){', [
  'async function draftsFollow(pairs,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['    if(end){ try{ await editorFollows(openRec,end.to); }catch(_){} }', '  }', '  const d=await db();'], [
  '    if(end){ try{ await editorFollows(openRec,end.to); }catch(_){} }',
  '  }',
  '  if(!s0AtHome(s0Home)) return 0;   /* STAGE 0 (fix round 4) */',
  '  const d=await db();',
]);
/* The removal list, the relight, the unsent mark, the sweep. */
doc.swap(['async function goneAdd(rec){', '  /* Nothing to remove from the server for a trait that never reached it. */', '  if(!rec||!(rec.rowId||rec.path)) return;'], [
  'async function goneAdd(rec,home){',
  '  /* Nothing to remove from the server for a trait that never reached it. */',
  '  if(!rec||!(rec.rowId||rec.path)) return true;',
  '  /* STAGE 0 (fix round 4): false when the page left before it was filed. */',
  '  const s0Home=home||s0HomeNow();',
]);
doc.swap(['  if(list.some(x=>goneKey(x)===goneKey(g))) return;', '  list.push(g);', '  try{ await dbPut({id:GONE_ID, kind:"settings", rows:list, at:Date.now()}); }catch(_){}', '}'], [
  '  if(list.some(x=>goneKey(x)===goneKey(g))) return true;',
  '  list.push(g);',
  '  if(!s0AtHome(s0Home)) return false;',
  '  try{ await dbPut({id:GONE_ID, kind:"settings", rows:list, at:Date.now()}); }catch(_){}',
  '  return true;',
  '}',
]);
doc.swap(['async function goneForget(keys){', '  if(!keys.length) return;', '  const drop=new Set(keys);', '  const list=(await goneLoad()).filter(g=>!drop.has(goneKey(g)));'], [
  'async function goneForget(keys,home){',
  '  if(!keys.length) return;',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  const drop=new Set(keys);',
  '  const list=(await goneLoad()).filter(g=>!drop.has(goneKey(g)));',
  '  if(!s0AtHome(s0Home)) return;',
]);
doc.swap(['async function markUnsent(rec){', '  if(!rec||!rec.id) return;', '  let stored=null; try{ stored=await dbGet(rec.id); }catch(_){ stored=null; }'], [
  'async function markUnsent(rec,home){',
  '  if(!rec||!rec.id) return;',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  let stored=null; try{ stored=await dbGet(rec.id); }catch(_){ stored=null; }',
  '  if(!s0AtHome(s0Home)) return;',
]);
doc.swap(['async function relightUnsynced(){', '  let n=0;', '  for(const rec of await dbAll()){'], [
  'async function relightUnsynced(home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  let n=0;',
  '  for(const rec of await dbAll()){',
  '    if(!s0AtHome(s0Home)) break;',
]);
doc.swap(['async function cloudSweep(team,c,keepPaths){', '  const h=await sbHeaders({"Content-Type":"application/json"});'], [
  'async function cloudSweep(team,c,keepPaths,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  const h=await sbHeaders({"Content-Type":"application/json"});',
]);
doc.swap('  const d=await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",headers:h,', [
  '  if(!s0SendHome(s0Home)) return 0;   /* STAGE 0 (fix round 4) */',
  '  const d=await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",headers:h,',
]);

/* A pull's end of run (fix round 4). cloudPull asks wsStill(gen) - its home,
   noted before its first wait, as Task 10 made it - once, after the rows;
   the layer list, the empty chance, the rules and the mail after it each
   waited and then wrote: a move during the read of the layer list wrote the
   group's layers into the store moved to. Each asks now. */
const S0_PULL_LEFT = 'if(!wsStill(gen)){ try{ $("cloudpull").disabled=false; }catch(_){} try{ if(banner) banner.hidden=true; }catch(_){} return null; }';
doc.swap('    let mine=null; try{ mine=await dbGet(LAYERS_ID); }catch(_){ mine=null; }', [
  '    let mine=null; try{ mine=await dbGet(LAYERS_ID); }catch(_){ mine=null; }',
  '    ' + S0_PULL_LEFT + '   /* STAGE 0 (fix round 4) */',
]);
doc.swap('    sharedLayerSig=declared.join("\\u0000");', '    if(wsStill(gen)) sharedLayerSig=declared.join("\\u0000");   /* STAGE 0 (fix round 4) */');
doc.swap('  await takeEmptyChance(c);', [
  '  ' + S0_PULL_LEFT + '   /* STAGE 0 (fix round 4) */',
  '  await takeEmptyChance(c);',
  '  ' + S0_PULL_LEFT + '   /* STAGE 0 (fix round 4): the rules below */',
]);
doc.swap('      await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(), decisions:[]});', [
  '      ' + S0_PULL_LEFT + '   /* STAGE 0 (fix round 4) */',
  '      await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(), decisions:[]});',
]);
doc.swap('  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){', [
  '  ' + S0_PULL_LEFT + '   /* STAGE 0 (fix round 4) */',
  '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
]);
doc.swap('  if(incoming.length||clashed.length){ await mailAdd(incoming, clashed); mailShow(); }',
  '  if(wsStill(gen)&&(incoming.length||clashed.length)){ await mailAdd(incoming, clashed); mailShow(); }   /* STAGE 0 (fix round 4) */');
doc.swap('async function takeEmptyChance(c){', [
  'async function takeEmptyChance(c){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('    if(!(mine&&mine.chance===theirs)) await saveEmptyChance();', '    if(!(mine&&mine.chance===theirs)&&s0AtHome(s0Home)) await saveEmptyChance();');

/* ---- 13. the action's home: every other caller that waits first ---------
   (Fix round 4.) Found by listing every call of a sender, of a function
   that calls one, and of a write helper, and reading what each caller
   waits for before it: each of these waited, then wrote or sent, with no
   home. Each notes it when the person acts and passes it on, or asks it
   just before a call to a function that notes its own. */
/* bulkImport */
doc.swap('      pushCtx={u:u, team:await cloudTeam(), c:u?await cloudCollection(u):null};',
  '      pushCtx={u:u, team:await cloudTeam(), c:u?await cloudCollection(u):null, home:s0Home};');
doc.swap(['        const rrec={id:"ref_"+info.name, kind:"ref", name:info.name, w:w, h:h2, blob:f, at:Date.now()};', '        await dbPut(rrec);'], [
  '        const rrec={id:"ref_"+info.name, kind:"ref", name:info.name, w:w, h:h2, blob:f, at:Date.now()};',
  '        if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '        await dbPut(rrec);',
]);
doc.swap('        if(activeWs&&!await cloudSyncOne(rrec, await uploadCtx())) notShared++;',
  '        if(s0Home.db!==DBN&&!await cloudSyncOne(rrec, await uploadCtx())) notShared++;');
doc.swap('        await dbPut(trec);', [
  '        if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '        await dbPut(trec);',
]);
doc.swap('        if(activeWs&&!await cloudSyncOne(trec, await uploadCtx())) notShared++;',
  '        if(s0Home.db!==DBN&&!await cloudSyncOne(trec, await uploadCtx())) notShared++;');
doc.swap(['      if(to) await carryDecided(rec,to.id);', '      try{ await dbDel(rec.id); }catch(_){ continue; }', '      /* The server copy too, or the next pull brings it back. */', '      try{ await cloudDropOne(rec); }catch(_){}'], [
  '      if(to) await carryDecided(rec,to.id,s0Home);',
  '      if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  '      /* The server copy too, or the next pull brings it back. */',
  '      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}',
]);
doc.swap(['      await carryDecided(rec,onto.id);', '      try{ await dbDel(rec.id); }catch(_){ continue; }', '      try{ await cloudDropOne(rec); }catch(_){}'], [
  '      await carryDecided(rec,onto.id,s0Home);',
  '      if(!s0AtHome(s0Home)){ s0Left=true; break; }   /* STAGE 0 (fix round 4) */',
  '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  '      try{ await cloudDropOne(rec,{home:s0Home}); }catch(_){}',
]);
doc.swap('  if(adopted.length){ try{ await saveLayers(); }catch(_){ } }', [
  '  if(!s0AtHome(s0Home)) s0Left=true;   /* STAGE 0 (fix round 4) */',
  '  if(adopted.length&&!s0Left){ try{ await saveLayers(); }catch(_){ } }',
  '  if(s0Left) bits.push("S"+S0_LEFT_IMPORT.slice(1));',
]);
doc.swap('  return {ok, failed, oversized, strips, refs, notShared,', '  return {ok, failed, oversized, strips, refs, notShared, left:s0Left,');
doc.swap('    +(r&&r.notShared?" \\u00b7 "+r.notShared+" here only, not sent to the group":"")', [
  '    +(r&&r.left?" \\u00b7 "+S0_LEFT_IMPORT:"")   /* STAGE 0 (fix round 4) */',
  '    +(r&&r.notShared?" \\u00b7 "+r.notShared+" here only, not sent to the group":"")',
]);
/* carryDecided: a read, a write, a send. */
doc.swap('async function carryDecided(from,toId){', [
  'async function carryDecided(from,toId,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['  try{ await dbPut(next); }catch(_){ return false; }', '  if(activeWs && next.rowId && next.unsent==="meta"){ try{ await cloudPatchOne(next); }catch(_){} }'], [
  '  if(!s0AtHome(s0Home)) return false;   /* STAGE 0 (fix round 4) */',
  '  try{ await dbPut(next); }catch(_){ return false; }',
  '  if(s0Home.db!==DBN && next.rowId && next.unsent==="meta"){ try{ await cloudPatchOne(next,{home:s0Home}); }catch(_){} }',
]);
/* importProject */
doc.swap('    try{ await dbPut(rec); added++; }catch(e){ if(storeFull(e)){ full=true; break; } failed++; }', [
  '    if(!s0Go()) break;   /* STAGE 0 (fix round 4) */',
  '    try{ await dbPut(rec); added++; }catch(e){ if(storeFull(e)){ full=true; break; } failed++; }',
]);
doc.swap('  if(Array.isArray(doc.rules)&&doc.rules.length){', '  if(s0Go()&&Array.isArray(doc.rules)&&doc.rules.length){');
doc.swap('  if(Array.isArray(doc.decisions)&&doc.decisions.length){', '  if(s0Go()&&Array.isArray(doc.decisions)&&doc.decisions.length){');
doc.swap('  if(restored.length) await saveRules();', '  if(restored.length&&s0Go()) await saveRules();');
doc.swap('  if(wasEmpty && Array.isArray(doc.decideOrder) && doc.decideOrder.length){', '  if(s0Go() && wasEmpty && Array.isArray(doc.decideOrder) && doc.decideOrder.length){');
doc.swap('  if(wasEmpty && Array.isArray(doc.baseColours) && doc.baseColours.length){', '  if(s0Go() && wasEmpty && Array.isArray(doc.baseColours) && doc.baseColours.length){');
doc.swap('  if(wasEmpty && typeof doc.grid==="number" && doc.grid>=4 && doc.grid<=1024){', '  if(s0Go() && wasEmpty && typeof doc.grid==="number" && doc.grid>=4 && doc.grid<=1024){');
doc.swap('  if(wasEmpty && typeof doc.emptyChance==="number"', '  if(s0Go() && wasEmpty && typeof doc.emptyChance==="number"');
doc.swap('  if(Array.isArray(doc.layers)){', '  if(s0Go()&&Array.isArray(doc.layers)){');
doc.swap('  if(wasEmpty && Array.isArray(doc.hidden)){', '  if(s0Go() && wasEmpty && Array.isArray(doc.hidden)){');
doc.swap('  if(newLayers||hid) await saveLayers();', '  if((newLayers||hid)&&s0Go()) await saveLayers();');
doc.swap(['  toast(bits.join(", "));', '}'], [
  '  if(s0Left) bits.push(S0_LEFT_IMPORT);   /* STAGE 0 (fix round 4) */',
  '  toast(bits.join(", "));',
  '}',
]);
/* The editor's save: a picture, a record, a review, the old record, the
   rules, the drafts, the send - each after a wait. */
doc.swap(['async function saveTraitNow(){', '  if(!ctx) return;'], [
  'async function saveTraitNow(){',
  '  if(!ctx) return;',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('    const clash=await idHolder(id, openRec&&openRec.id);', [
  '    const clash=await idHolder(id, openRec&&openRec.id);',
  '    /* STAGE 0 (fix round 4): the clash was read from the store shown. */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }',
]);
doc.swap(['    const moved = openWas && openWas.id!==id;', '    await dbPut(rec);'], [
  '    const moved = openWas && openWas.id!==id;',
  '    /* STAGE 0 (fix round 4): the reads above waited. Left since, nothing is',
  '       written: the drawing is kept where it was drawn, by the switch\'s own',
  '       last save of it. A renamed or refiled trait is written and its old',
  '       record removed in ONE transaction, so a move between them cannot',
  '       leave both. */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }',
  '    if(moved) await dbApplyShelfRecords([openWas.id],[rec]); else await dbPut(rec);',
]);
doc.swap('          if(fp&&fp.hash){ e.artHashNow=fp.hash; await saveReview(); }',
  '          if(fp&&fp.hash&&s0AtHome(s0Home)){ e.artHashNow=fp.hash; await saveReview(); }');
doc.swap('      try{ await dbDel(openWas.id); }catch(_){}',
  '      /* (STAGE 0, fix round 4: removed above, with the new record.) */');
doc.swap(['      if(keptAs) await carryRules(traitKey(openWas), traitKey(rec));', '      else await retargetRules([{from:traitKey(openWas), to:traitKey(rec)}]);'], [
  '      if(keptAs) await carryRules(traitKey(openWas), traitKey(rec), s0Home);',
  '      else if(s0AtHome(s0Home)) await retargetRules([{from:traitKey(openWas), to:traitKey(rec)}]);',
]);
doc.swap('      if(k){ try{ await dbDel(k); }catch(_){} }', '      if(k&&s0AtHome(s0Home)){ try{ await dbDel(k); }catch(_){} }');
doc.swap(['    await renderShelf();', '    if(activeWs){'], [
  '    await renderShelf();',
  '    if(s0Home.db!==DBN){   /* STAGE 0 (fix round 4): the save\'s project, not the one shown now */',
]);
doc.swap(['      const shared = moved ? await cloudMoveOne(base||openWas,rec,why)', '        : await cloudSyncOne(rec,null,why);'], [
  '      const shared = moved ? await cloudMoveOne(base||openWas,rec,why,s0Home)',
  '        : await cloudSyncOne(rec,{home:s0Home},why);',
]);
/* Sorting from a plan, and a layer removed or renamed: records rewritten
   one at a time after a read of the store. */
doc.swap('async function sortApply(plan){', [
  'async function sortApply(plan){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['      await dbPut(rec);', '      await dbDel(old.id);'], [
  '      if(!s0AtHome(s0Home)){ failed++; break; }   /* STAGE 0 (fix round 4) */',
  '      await dbApplyShelfRecords([old.id],[rec]);   /* one write: a move between two left both */',
]);
doc.swap('      await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);', '      if(s0AtHome(s0Home)) await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);');
doc.swap('      const shared=await cloudMoveOne(old,rec);', '      const shared=await cloudMoveOne(old,rec,undefined,s0Home);');
doc.swap(['  try{ await draftsFollow(draftMoves); }catch(_){}', '  return {made, moved, refused, failed, stranded};'], [
  '  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
  '  return {made, moved, refused, failed, stranded};',
]);
doc.swap('async function retagLayer(items,from,to){', [
  'async function retagLayer(items,from,to,home){',
  '  const s0Home=home||s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['    await dbDel(t.id);', '    await dbPut(rec);'], [
  '    if(!s0AtHome(s0Home)) break;   /* STAGE 0 (fix round 4) */',
  '    await dbApplyShelfRecords([t.id],[rec]);   /* one write: a move between two lost the trait */',
]);
doc.swap('    const shared=await cloudMoveOne(t,rec);', '    const shared=await cloudMoveOne(t,rec,undefined,s0Home);');
doc.swap(['  await retargetRules(ruleMoves);', '  try{ await draftsFollow(draftMoves); }catch(_){}'], [
  '  if(s0AtHome(s0Home)) await retargetRules(ruleMoves);',
  '  try{ await draftsFollow(draftMoves,s0Home); }catch(_){}',
]);
doc.swap('async function removeLayer(name){', [
  'async function removeLayer(name){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['  const items=await dbAll();', '  const n=items.filter(i=>i.kind==="trait"&&i.layer===name).length;'], [
  '  const items=await dbAll();',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */',
  '  const n=items.filter(i=>i.kind==="trait"&&i.layer===name).length;',
]);
doc.swap('  const r=n?await retagLayer(items,name,"unsorted"):{moved:0,renamed:0};', [
  '  const r=n?await retagLayer(items,name,"unsorted",s0Home):{moved:0,renamed:0};',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_PART); return; }   /* STAGE 0 (fix round 4): LAYERS is the project shown */',
]);
doc.swap('async function renameLayer(oldName,raw){', [
  'async function renameLayer(oldName,raw){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['  const items=await dbAll();', '  const r=await retagLayer(items,oldName,nw);'], [
  '  const items=await dbAll();',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */',
  '  const r=await retagLayer(items,oldName,nw,s0Home);',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_PART); return; }   /* STAGE 0 (fix round 4): LAYERS is the project shown */',
]);
/* A status for every picked trait, and the status chip and the final page. */
doc.swap('async function bulkSetStatus(next){', [
  'async function bulkSetStatus(next){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['      const r=await setTraitStatus(t,next);', '      if(r.same) same++;'], [
  '      const r=await setTraitStatus(t,next,undefined,s0Home);',
  '      if(r.left) break;   /* STAGE 0 (fix round 4): said below */',
  '      if(r.same) same++;',
]);
doc.swap('      else if(r.ok){ changed++; if(r.renamed) kept.push(r.renamed); if(activeWs && !r.shared) notShared++; }',
  '      else if(r.ok){ changed++; if(r.renamed) kept.push(r.renamed); if(s0Home.db!==DBN && !r.shared) notShared++; }');
doc.swap('    if(notShared) bits.push(notShared+" here only - press Save to cloud");', [
  '    if(notShared) bits.push(notShared+" here only - press Save to cloud");',
  '    if(!s0AtHome(s0Home)) bits.push(s0LeftInline(S0_LEFT_UNMADE));   /* STAGE 0 (fix round 4) */',
]);
doc.swap(['      cyc.onclick=async ev=>{ ev.stopPropagation();', '        const next=nextStatus(t.status);'], [
  '      cyc.onclick=async ev=>{ ev.stopPropagation();',
  '        const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '        const next=nextStatus(t.status);',
]);
doc.swap(['        const r=await setTraitStatus(t,next);', '        if(r.stale){ toast(t.name+" changed in another tab - the shelf has been redrawn"); renderShelf(); return; }'], [
  '        const r=await setTraitStatus(t,next,undefined,s0Home);',
  '        if(r.left){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */',
  '        if(r.stale){ toast(t.name+" changed in another tab - the shelf has been redrawn"); renderShelf(); return; }',
]);
doc.swap(["        toast((activeWs && !r.shared", "          ? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)"], [
  "        toast((s0Home.db!==DBN && !r.shared   /* STAGE 0 (fix round 4): the change's project */",
  "          ? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)",
]);
doc.swap(['async function finalMove(t,next){', '  const r=await setTraitStatus(t,next);'], [
  'async function finalMove(t,next){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  const r=await setTraitStatus(t,next,undefined,s0Home);',
  '  if(r.left){ toast(S0_LEFT_UNMADE); return; }',
]);
doc.swap('  toast((activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what)+cloudAlsoOld(r.why));',
  '  toast((s0Home.db!==DBN && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what)+cloudAlsoOld(r.why));');
/* A shelf move from the keyboard reads the store first. */
doc.swap('async function keyboardShelfMove(recordKey,direction,betweenLayers){', [
  'async function keyboardShelfMove(recordKey,direction,betweenLayers){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('    await commitShelfMove({recordKey,toLayer:LAYERS[to],beforeKey:null});', '    await commitShelfMove({recordKey,toLayer:LAYERS[to],beforeKey:null},s0Home);');
doc.swap('  await commitShelfMove({recordKey,toLayer:source.layer,beforeKey});', '  await commitShelfMove({recordKey,toLayer:source.layer,beforeKey},s0Home);');
/* Weights from the plan: many, then one, then the set. */
doc.swap('async function setRarityMany(recs,w){', 'async function setRarityMany(recs,w,home){');
doc.swap(['      sl.onchange=async()=>{'], [
  '      sl.onchange=async()=>{',
  '        const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['        also=await setRarityMany(g.rows.filter(r=>r.id!==t.id && !rarityPlanned(r)),RAR_NORMAL);', '        await setRarity(t,nw);'], [
  '        also=await setRarityMany(g.rows.filter(r=>r.id!==t.id && !rarityPlanned(r)),RAR_NORMAL,s0Home);',
  '        await setRarity(t,nw,s0Home);',
]);
doc.swap('async function seedRarity(list){', 'async function seedRarity(list,home){');
doc.swap('  done=await setRarityMany(want,RAR_NORMAL);', '  done=await setRarityMany(want,RAR_NORMAL,home);');
doc.swap(['  if(seed) seed.onclick=async()=>{', '    const items=await dbAll();'], [
  '  if(seed) seed.onclick=async()=>{',
  '    const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '    const items=await dbAll();',
]);
doc.swap('    await seedRarity(all);', '    await seedRarity(all,s0Home);');
/* The group's resend: the rules, a read, then Save to cloud. */
doc.swap('  groupResending=(async()=>{', [
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  '  groupResending=(async()=>{',
]);
doc.swap('      if(unsent.length) await cloudPush();', '      if(unsent.length&&s0SendHome(s0Home)) await cloudPush();   /* STAGE 0 (fix round 4) */');
/* A rules file: a read of the file and the store, then rules and a layer order. */
doc.swap('async function importRuleFile(f){', [
  'async function importRuleFile(f){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('      try{ painted=await applyPaintOrder(order); }catch(_){ painted=null; }', [
  '      if(!s0AtHome(s0Home)){ note.textContent=S0_LEFT_UNMADE+"."; return; }   /* STAGE 0 (fix round 4) */',
  '      try{ painted=await applyPaintOrder(order); }catch(_){ painted=null; }',
]);
doc.swap('  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }', [
  '  if(!s0AtHome(s0Home)){ note.textContent=S0_LEFT_UNMADE+"."; return; }   /* STAGE 0 (fix round 4) */',
  '  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }',
]);
doc.swap('  const before=RULES.length;', [
  '  if(!s0AtHome(s0Home)){ note.textContent=S0_LEFT_UNMADE+"."; return; }   /* STAGE 0 (fix round 4) */',
  '  const before=RULES.length;',
]);
doc.swap(['    await saveRules();', '    if(ordered) await saveDecideOrder();'], [
  '    await saveRules(s0Home);',
  '    if(ordered&&s0AtHome(s0Home)) await saveDecideOrder();',
]);

/* ---- 14. the action's home: the local writers the enumeration found -----
   (Fix round 4.) Not senders and not their callers, so outside the
   ruling's list - but each writes the store after a wait, and a mechanical
   pass over every function (a write or send after an await, and whether a
   home check or a home lies between) found them: Clear, a copy of a
   trait, a review queue and its answers, the sort's layer order, a saved
   reference image, the editor following a moved trait, and a pull's
   kept drawing. Each notes its home when the person acts and asks it
   before each write. */
doc.swap("$('clearproj').onclick=async()=>{", [
  "$('clearproj').onclick=async()=>{",
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['    for(const rec of await dbAll()){', '      if(rec.kind==="trait"||rec.kind==="ref"){ await dbDel(rec.id); removed++; }'], [
  '    for(const rec of await dbAll()){',
  '      /* STAGE 0 (fix round 4): Clear removes this project\'s records, never the',
  '         project moved to\'s (the read above and every removal waited). */',
  '      if(!s0AtHome(s0Home)) break;',
  '      if(rec.kind==="trait"||rec.kind==="ref"){ await dbDel(rec.id); removed++; }',
]);
doc.swap(['    for(const id of [RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID,EMPTY_ID]){', '      try{ await dbDel(id); kept--; }catch(_){}', '    }'], [
  '    for(const id of [RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID,EMPTY_ID]){',
  '      if(!s0AtHome(s0Home)) break;   /* STAGE 0 (fix round 4) */',
  '      try{ await dbDel(id); kept--; }catch(_){}',
  '    }',
  '    /* STAGE 0 (fix round 4): the settings below are the project shown. */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT_PART); return; }',
]);
doc.swap('async function duplicateTrait(t){', [
  'async function duplicateTrait(t){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('  try{ await dbPut(rec); }catch(_){ toast("Could not save the copy"); return null; }', [
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return null; }   /* STAGE 0 (fix round 4) */',
  '  try{ await dbPut(rec); }catch(_){ toast("Could not save the copy"); return null; }',
]);
doc.swap('async function importReviewQueue(f){', [
  'async function importReviewQueue(f){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('      try{ await dbPut(Object.assign({},t,{reviewId:e.id})); stamped++; }catch(_){}',
  '      if(s0AtHome(s0Home)) try{ await dbPut(Object.assign({},t,{reviewId:e.id})); stamped++; }catch(_){}   /* STAGE 0 (fix round 4) */');
doc.swap('  entries.sort((a,b)=>(a.sequence||0)-(b.sequence||0));', [
  '  /* STAGE 0 (fix round 4): REVIEW is the project shown. */',
  '  if(!s0AtHome(s0Home)){ say(S0_LEFT_UNMADE+"."); return false; }',
  '  entries.sort((a,b)=>(a.sequence||0)-(b.sequence||0));',
]);
doc.swap('    try{ painted=await applyPaintOrder(doc.order.map(String)); }catch(_){ painted=null; }',
  '    if(s0AtHome(s0Home)) try{ painted=await applyPaintOrder(doc.order.map(String)); }catch(_){ painted=null; }   /* STAGE 0 (fix round 4) */');
doc.swap(["$('sortgo').onclick=async()=>{", '  if(!sortPlan) return;'], [
  "$('sortgo').onclick=async()=>{",
  '  if(!sortPlan) return;',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('  try{ painted=await applyPaintOrder(sortOrder); }catch(_){ painted=null; }',
  '  if(s0AtHome(s0Home)) try{ painted=await applyPaintOrder(sortOrder); }catch(_){ painted=null; }   /* STAGE 0 (fix round 4) */');
doc.swap(["      (async()=>{ try{", "        const c=document.createElement('canvas'); c.width=d.width; c.height=d.height;"], [
  '      const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
  "      (async()=>{ try{",
  "        const c=document.createElement('canvas'); c.width=d.width; c.height=d.height;",
]);
doc.swap("        await dbPut({id:'ref_'+nm, kind:'ref', name:nm, blob, w:d.width, h:d.height, at:Date.now()});", [
  "        if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */",
  "        await dbPut({id:'ref_'+nm, kind:'ref', name:nm, blob, w:d.width, h:d.height, at:Date.now()});",
]);
doc.swap(["$('revart').onclick=async()=>{", '  if(!REVIEW) return;'], [
  "$('revart').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(['  }else{ e.artHash=null; e.artHashNow=null; e.artAt=null; }', '  await saveReview(); await renderReview();'], [
  '  }else{ e.artHash=null; e.artHashNow=null; e.artAt=null; }',
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */',
  '  await saveReview(); await renderReview();',
]);
doc.swap(["$('revnamed').onclick=async()=>{", '  if(!REVIEW) return;'], [
  "$('revnamed').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap(["    $('tname').value=want;", '    const ok=await saveTrait();'], [
  '    /* STAGE 0 (fix round 4): the open above waited; the editor\'s save notes',
  '       its own home when it starts, which would be the project moved to. */',
  '    if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }',
  "    $('tname').value=want;",
  '    const ok=await saveTrait();',
]);
doc.swap(["  cur.finalName=want; cur.currentName=want+'.png'; cur.nameAccepted=true;", '  await saveReview();'], [
  '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }   /* STAGE 0 (fix round 4) */',
  "  cur.finalName=want; cur.currentName=want+'.png'; cur.nameAccepted=true;",
  '  await saveReview();',
]);
doc.swap('async function editorFollowsElsewhere(moved){', [
  'async function editorFollowsElsewhere(moved){',
  '  const s0Home=s0HomeNow();   /* STAGE 0 (fix round 4): see s0HomeNow */',
]);
doc.swap('  try{ await draftsFollow([{from:was.id, to:to}]); }catch(_){}', '  try{ await draftsFollow([{from:was.id, to:to}],s0Home); }catch(_){}');
doc.swap('            if(dr && dr.blob){', '            if(dr && dr.blob && wsStill(gen)){   /* STAGE 0 (fix round 4): the read above waited */');

/* Fix round 4: the number of checks of the home, counted on the page this
   builds (s0AtHome before a local write, s0SendHome before a send). Not
   counted: the definitions, and s0LeftReason's own use. A
   check removed, or one added, fails the build until this is changed with
   it. */
const S0_AT_HOME = 79, S0_SEND_HOME = 31;
doc.finish(({ code, must }) => {
  must('"/rest/v1/collections?select=id,protocol,switching_at&team_id=eq."', 'the protocol read is not there');
  must('{ const s0b=await s0Blocked(false,s0Home); if(s0b) return say(s0b==="left"?s0LeftReason(s0Home):"held"); }', 'cloudSyncOne is not held');
  must('function s0LeftReason(h){ return (!s0AtHome(h)||s0Uid()) ? "left" : "signedout"; }', 'a session that ended is said as the page leaving');
  must('{ const s0b=await s0Blocked(false,s0Home); if(s0b){ if(s0b==="left"&&why) why.left=true; return "held"; } }', 'dbDelShared is not held');
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
  must('async function cloudPush(){' + NL + '  ' + NL + '  const s0Home=s0HomeNow();', 'Save to cloud does not note its project first');
  must('  await s0Check(true);' + NL + '  ' + NL + '  if(!s0SendHome(s0Home)){ toast(S0_LEFT_PUSH); return; }', 'Save to cloud goes on after a move during its read');
  /* Fix round 1. */
  must('if(s0State.protocol>=2) s0Seen2.add(key);', 'protocol 2 is not remembered past the one slot');
  must('if(s0Seen2.has(dbn+"|"+(uid||""))) return "switched";', 'protocol 2 remembered is not held');
  must('function s0Guard(err){ return !!err&&err.code==="P0001"&&typeof err.message==="string"&&err.message.indexOf("project switched")===0; }', 'any P0001 is taken for the guard');
  must('if(guard&&!(s0Mine(dbn,uid)&&s0State.ok)){', 'the guard\'s refusal overrides a read that answered');
  /* Fix round 2 (superseding fix round 1's "a move answers held"). */
  must('return {db:dbn, uid:uid, moved:true, got:got}; }', 'a read the page moved away from is thrown away');
  /* Fix round 3: moved means held, unless the send is addressed. Fix round
     4: judged against the action's home, before the read and after it. */
  must('  if(!s0SendHome(home)) return addressed ? s0HeldFor(dbn,uid,sid,null) : "left";' + NL + '  let r=null;', 'a sender whose home was left before its read is not held');
  must('  if(!s0SendHome(home)) return addressed ? s0HeldFor(dbn,uid,sid,r) : "left";' + NL + '  return !!s0Held();', 'a sender whose home was left during its read is not held');
  must('if(await s0Blocked(true,s0Home)) return "unreachable";', 'cloudRarity is not addressed');
  must('const s0h=await s0Blocked(true,s0Home);', 'setRarityMany is not addressed');
  if ((code.match(/await s0Blocked\(true,/g) || []).length !== 2) throw new Error('expected 2 addressed senders, found ' + (code.match(/await s0Blocked\(true,/g) || []).length);
  if ((code.match(/await s0Blocked\(false,s0Home\)/g) || []).length !== 7) throw new Error('expected 7 senders held for their home, found ' + (code.match(/await s0Blocked\(false,s0Home\)/g) || []).length);
  must('const s0Want=s0Ahead ? {...next, synced:false, unsent:"meta"} : next;', 'a weight is not marked unsent ahead of its send');
  must('await dbApplyShelfRecords([t.id],[moved.synced ? unsentOf(moved) : moved]);', 'a status change is not marked unsent ahead of its send, in one write');
  must('if(!s0AtHome(s0Home)){ toast(S0_LEFT); return false; }', 'a shelf move the page left says nothing');
  must('while(next<fresh.length && !broke && !pushStopAsked && s0SendHome(s0Home)){', 'Save to cloud sends past a move');
  must('  if(!s0SendHome(home)) return s0HeldFor(dbn,uid,sid,r)||(guard&&!s0AnsweredFor(dbn,uid,r));', 'a refusal is judged for the store moved to');
  must('if(s0Flight){ try{ await s0Flight; }catch(_){ } }', 'a read already running is trusted after a refusal or a confirm');
  must('  const r=await s0Fresh();', 'the read after a refusal can be one that began before it');
  must('if(s0End()){ s0Cut=true; break; }', 'the stale-row DELETEs are checked once, on entry');
  must('serverPaths=s0Cut ? null : kept.map(r=>r.path).filter(Boolean);', 'the sweep can run on a list cut short');
  /* Fix round 4: the action's home. Every check is a call of s0AtHome
     (a local write) or s0SendHome (a send); none compares the store alone. */
  must('function s0HomeNow(){ return {db:wsDbName(), uid:s0Uid()||null, gen:wsGen}; }', 'the home has no wsGen');
  must('function s0AtHome(h){ return !!h&&h.gen===wsGen&&h.db===wsDbName(); }', 'a move and straight back reads as home');
  must('function s0SendHome(h){ return s0AtHome(h)&&h.uid===(s0Uid()||null); }', 'a send is not judged for its account');
  if (/wsDbName\(\)[!=]==s0Home/.test(code)) throw new Error('a check compares the store alone, not the home');
  {
    const at = (code.match(/s0AtHome\(/g) || []).length - 3, send = (code.match(/s0SendHome\(/g) || []).length - 1;
    if (at !== S0_AT_HOME || send !== S0_SEND_HOME) throw new Error('expected ' + S0_AT_HOME + ' local-write and ' + S0_SEND_HOME + ' send checks of the home, found ' + at + ' and ' + send);
  }
  must('if(cloudTeamId&&cloudTeamFor===s0Key) return cloudTeamId;', 'the team is trusted for a project it was not read for');
  must('    if(!s0SendHome(s0Home)) return null;' + NL + '    cloudTeamId=got; cloudTeamFor=s0Key;', 'the team is kept for a project the page left');
  must('if(got&&got.protocol>=2) s0Seen2.add(key); return {db:dbn, uid:uid, moved:true, got:got}; }', 'protocol 2 from a read the page left is forgotten');
  must('    else await s0ClearAhead(s0Home,[s0Want]);', 'a weight that landed after a move stays unsent');
  must('    else await s0ClearAhead(s0Home,s0Landed.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));', 'weights that landed after a move stay unsent');
  must('  if(!s0AtHome(s0Home)){ if(why) why.oldKept=true; return arrived; }', 'a status change the page left during its upload says nothing of the old copy');
  must('const s0End=()=>!s0SendHome(s0Home)||!!s0Held()||!!reasons.held;', 'Save to cloud\'s end of run is not held');
  must('if(!s0End()) try{', 'Save to cloud\'s layers PATCH is not held');
  must('if(await s0Refuse(true)) return;' + NL + '  if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }', 'Remove from server does not read, afresh, after its confirm');
  must('  try{ s0Relit=await relightUnsynced(s0Home); }', 'Remove from server marks this device\'s copy unsent only after the removal, which a move skips');
  if ((code.match(/if\(!s0End\(\)/g) || []).length !== 3) throw new Error('expected Save to cloud\'s 3 end-of-run writes held, found ' + (code.match(/if\(!s0End\(\)/g) || []).length);
  /* Nine senders read before they send (await s0Blocked): cloudSyncOne,
     cloudDropOne, cloudPatchOne, cloudRarity, setRarityMany,
     cloudSendShelfPlan, saveLayers, shareRules, dbDelShared. Save to cloud
     reads afresh at its start and holds its end of run on what the run saw
     (s0End). Seven refusals read afresh (await s0Refuse): Remove from
     server, before its confirm and after it (a read begun after it); the
     two tile removals; Clear; a folder import; a project file. */
  if ((code.match(/await s0Blocked\(/g) || []).length !== 9) throw new Error('expected 9 held senders, found ' + (code.match(/await s0Blocked\(/g) || []).length);
  if ((code.match(/await s0Refuse\(/g) || []).length !== 7) throw new Error('expected 7 refused actions, found ' + (code.match(/await s0Refuse\(/g) || []).length);
  if (/setItem\(\s*["']pb\.migrating/.test(code)) throw new Error('stage 0 must never set the migration flag (B1)');
  /* Final fixes, B3: every refusal says it was not done, in its own words;
     D1's sentences are left to what is kept. */
  must('const S0_REFUSED="This project is being updated, so this was not done. Try again once it has finished.";', 'a refused action has no words of its own');
  if ((code.match(/gone==="held" \? S0_REFUSED : gone \?/g) || []).length !== 2) throw new Error('a tile\'s held removal says it is kept');
  must("shared.reason==='held' ? S0_REFUSED", 'a drag put back says it is kept');
  must('if(!opts.quiet) toast(S0_REFUSED); return;', 'a refused pull says a change is kept');
  {
    const f = code.indexOf('async function s0Refuse('), e = code.indexOf('\n}', f), b = f >= 0 && e > f ? code.slice(f, e) : '';
    if (!b || b.indexOf('s0Words(') >= 0 || b.indexOf('toast(S0_REFUSED);') < 0) throw new Error('s0Refuse does not say it refused, or still says D1\'s kept words');
  }
});
