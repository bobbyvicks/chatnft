/* FOLLOW-UP C (after stage 0): THE SIGN-IN SHOWN IS THE ONE STORED.

   Batch C of the follow-ups (scratchpad followups/plan.md, section 3). Built
   on 91eb861's page, after patch600-607 (the frozen stage-0 build), with
   stage0-common's start/swap/finish.

   S1. A START'S ANSWER IS ABOUT THE SESSION IT ASKED OF. cloudRender asks
   the server whether the stored session is good and renders what it hears.
   When the stored session changed while the question was out - a sign-out
   and another account signing in, or another tab of the account renewing
   first - it rendered an answer about a session that had gone. Measured on
   91eb861 (tests/switchmidrenewal.spec.js, 6 red, plus 1 on the same
   family):
     - "Cannot reach the server just now" over u2's working session, after
       u1's held renewal answered 400 or 200 (sbToken answers null for a
       renewal whose session has gone, and sbAuthState reads that null as
       "could not ask"), inside the 6 s deadline or past it (past it, the
       deadline itself wrote the note, after u2's own start had rendered);
     - the second of two tabs of one account, its renewal refused because
       the first had renewed, shown offline and signed out of its panel
       over the first's valid session;
     - u1's account check answering "yes, u1" late: u1's name and uid drawn
       over u2's stored session, or over none after a plain sign-out.
   Now sbAuthState notes the token its answer is about (q.about), and
   cloudRender shows an "in" or "unknown" answer - its own deadline
   included - only while that token is still the one stored; otherwise it
   asks again, once, of the session stored now, and shows that answer as
   before. The fix first proposed (t10fin/refute-tokennull) asked again
   inside sbAuthState: the deadline's note stayed, and an action pressed by
   the leaving account (Save to cloud) asked again too and ran on as the
   new account. Actions are unchanged here: they still read "unknown"
   (the switchmidrenewal push cases pin that nothing is sent after the
   release).

   S2 is tests only (tests/renewalguards.spec.js): sbToken's three guards
   for a session stored meanwhile, as behaviour. No page change.

   S6. ANOTHER TAB ENDED THE SIGN-IN. A storage listener, beside the sign-in
   hashchange listener: when another tab clears the session (or the whole
   store) and nothing is stored now, sessionEnded(). A session another tab
   stored is left alone (plan 2's cross-tab uid work).

   S8. A SIGN-IN LINK OPENED DURING SIGN-OUT'S WAIT. The hashchange handler
   stored the link's session at once and started the page as the link's
   account on the leaving account's group store (measured). Now its tokens
   leave the address bar at once, and it is stored and started once the
   wait is over. sbCaptureFromHash takes the fragment it is given, so the
   one parse serves both.

   D2 (follow-through). cloudSignOutNow's comment said a push's "sent" write
   lands in the personal store after a sign-out. Superseded, not deleted:
   fix round 4's 8b check stops it (measured by a probe on stage0moves'
   harness, both ways; follow-up C report).

   PB_REPO and PB_INDEX name the worktree and its page (stage0-common). */
'use strict';
const s0 = require('./stage0-common.cjs');
const kit = require(require('path').join(s0.REPO, 'tools', 'patchkit.cjs'));
const NL = s0.NL;
const doc = s0.start([
  ['async function s0Refuse(after){', 'patch602 is not applied (s0Refuse)'],
  ['function s0SessionUid(s){', 'patch601 is not applied (s0SessionUid)'],
  ['let s0SignOutWait=null;', 'the stage-0 sign-out wait is not in the page (s0SignOutWait)'],
]);

/* ---- S1: sbAuthState notes the token its answer is about ----------------- */
doc.swap([
  'async function sbAuthState(again){',
  '  const s=sbLoadSession();',
  '  if(!s||!s.access_token) return {state:"out"};',
  '  const t=await sbToken();',
  '  if(!t) return sbLoadSession() ? {state:"unknown"} : {state:"out"};',
], [
  'async function sbAuthState(again,q){',
  '  const s=sbLoadSession();',
  '  if(!s||!s.access_token) return {state:"out"};',
  '  /* FOLLOW-UP C (S1): THE TOKEN THIS ANSWER IS ABOUT, for cloudRender (q),',
  '     which shows an answer only while that token is still the one stored:',
  '     the stored session\'s as the question goes out, then the one sbToken',
  '     hands back - the renewed one when this renewed it. sbToken\'s null',
  '     leaves it at the first. */',
  '  if(q) q.about=s.access_token;',
  '  const t=await sbToken();',
  '  if(q&&t) q.about=t;',
  '  if(!t) return sbLoadSession() ? {state:"unknown"} : {state:"out"};',
]);
doc.swap('      return again ? {state:"unknown"} : sbAuthState(true);',
  '      return again ? {state:"unknown"} : sbAuthState(true,q);');

/* ---- S1: cloudRender shows an answer only about the session stored now --- */
doc.swap('async function cloudRender(){', 'async function cloudRender(again){');
doc.swap([
  '  const a=await Promise.race([sbAuthState(),',
  '    new Promise(r=>setTimeout(()=>r({state:"unknown"}),CLOUD_DEADLINE_MS))]);',
], [
  '  const q={about:null};',
  '  const a=await Promise.race([sbAuthState(false,q),',
  '    new Promise(r=>setTimeout(()=>r({state:"unknown"}),CLOUD_DEADLINE_MS))]);',
  '  /* FOLLOW-UP C (S1): AN ANSWER IS ABOUT THE SESSION IT WAS ASKED OF, and',
  '     is shown only while that session is still the one stored. q.about is',
  '     the token the question went out with (sbAuthState sets it). When the',
  '     session stored now is another - the person signed out and another',
  '     account signed in, or another tab of the account renewed first - the',
  '     answer, or this deadline, is about a session that has gone, and',
  '     shown it was false (all measured, tests/switchmidrenewal.spec.js):',
  '       - "unknown" wrote "Cannot reach the server just now" over a working',
  '         connection. sbToken answers null for a renewal whose session has',
  '         gone; and past the deadline, the deadline wrote the same note',
  '         after the new account\'s own start had shown it signed in;',
  '       - "in" drew the leaving account\'s name and uid over the new',
  '         account\'s session, or over none after a plain sign-out.',
  '     So it is not shown: the question is asked again, once, of the',
  '     session stored now, and that answer is shown as before - a second',
  '     change during the second question is not chased. "out" is not asked',
  '     again: sbAuthState answers it only when nothing is stored, or when it',
  '     has just cleared the session it was asked of.',
  '     ONLY A START ASKS AGAIN. An action (Save to cloud, Load from cloud, a',
  '     save) still reads "unknown" as before. Asked again, an action pressed',
  '     by the leaving account ran on as the account signed in since, sending',
  '     the leaving account\'s trait under the new one\'s token (the fix first',
  '     proposed, measured on its own page, 53e7c7a plus that fix, in',
  '     t10fin/refute-tokennull). A start renders whoever is stored; an',
  '     action is the account that pressed it. */',
  '  if(!again && (a.state==="unknown"||a.state==="in")){',
  '    const now=sbLoadSession();',
  '    if(((now&&now.access_token)||null)!==q.about) return cloudRender(true);',
  '  }',
]);

/* ---- S8: the fragment can be one taken earlier --------------------------- */
doc.swap([
  'function sbCaptureFromHash(){',
  '  const h=location.hash||"";',
], [
  'function sbCaptureFromHash(from){',
  '  /* FOLLOW-UP C (S8): or a fragment taken out of the address bar earlier',
  '     and kept until sign-out\'s wait was over (the hashchange handler).',
  '     The address bar was cleaned then and is not touched now: by now it',
  '     may hold the page the person has gone to. */',
  '  const h=(from===undefined) ? (location.hash||"") : from;',
]);
doc.swap([
  '    expires_at:Math.floor(Date.now()/1000)+(parseInt(p.get("expires_in"),10)||3600), user:null});',
  '  history.replaceState(null,"",location.pathname+location.search);',
  '  return true;',
], [
  '    expires_at:Math.floor(Date.now()/1000)+(parseInt(p.get("expires_in"),10)||3600), user:null});',
  '  if(from===undefined) history.replaceState(null,"",location.pathname+location.search);',
  '  return true;',
]);

/* ---- S8 and S6: the sign-in hashchange listener, and a storage listener -- */
doc.swap([
  'addEventListener("hashchange",()=>{',
  '  const joined=joinFromHash();',
  '  const signedIn=sbCaptureFromHash();',
  '  if(!joined && !signedIn) return;',
  '  if(joined) joinShowPending();',
  '  cloudRender().then(()=>{ if(signedIn && sbRecovery) enterResetMode(); });',
  '});',
], [
  'addEventListener("hashchange",()=>{',
  '  const joined=joinFromHash();',
  '  /* FOLLOW-UP C (S8): A SIGN-IN LINK OPENED WHILE SIGN-OUT WAITS for the',
  '     drawing\'s last save (s0SignOutWait). Until the wait ends the page is',
  '     still the leaving account\'s - its project, its store, its wsGen -',
  '     which is why the sign-in card takes no sign-in then (fix round 4).',
  '     The link\'s session was stored here at once, and the page started as',
  '     the link\'s account on the leaving account\'s group store (measured,',
  '     tests/signinelsewhere.spec.js). Refused as the card is, the person',
  '     would need another email. So its tokens leave the address bar now,',
  '     and the session is stored and the page started once the wait is over',
  '     - after cloudSignOutNow has taken the page off the group and said',
  '     "Signed out" - and then "Signed in", once the start has verified the',
  '     session (the boot path says it for a link before its check). The',
  '     person has just been told "Signed out"; the handler says nothing on',
  '     a link with no wait, as before. The wait ends by the save landing',
  '     or by its bound (S0_FLUSH_MS); either is the end of it. The session\'s',
  '     expiry is counted from then, up to that bound late; sbToken renews a',
  '     minute early. */',
  '  if(s0SignOutWait && (location.hash||"").indexOf("access_token=")>=0){',
  '    const h=location.hash;',
  '    history.replaceState(null,"",location.pathname+location.search);',
  '    const later=()=>{ if(!sbCaptureFromHash(h)) return;',
  '      cloudRender().then(u=>{ if(sbRecovery) enterResetMode(); else if(u) toast("Signed in"); }); };',
  '    s0SignOutWait.then(later,later);',
  '    return;',
  '  }',
  '  const signedIn=sbCaptureFromHash();',
  '  if(!joined && !signedIn) return;',
  '  if(joined) joinShowPending();',
  '  cloudRender().then(()=>{ if(signedIn && sbRecovery) enterResetMode(); });',
  '});',
  '/* FOLLOW-UP C (S6): ANOTHER TAB ENDED THE SIGN-IN. The session is in',
  '   localStorage, which every tab of this site shares, and a tab whose',
  '   session another tab cleared - Sign out there, a refusal there, the',
  '   site\'s storage cleared - kept its panel signed in (the name, Save to',
  '   cloud, no wall to sign in through) over a device with no session',
  '   stored, until something started it again (measured,',
  '   tests/signinelsewhere.spec.js).',
  '   It ends here as a refusal ends it (sessionEnded: the drawing saved,',
  '   the wall up, "signed out on this device"), and only when nothing is',
  '   stored now. A session another tab stored - the same account renewed,',
  '   or another account signed in - is not acted on: which account a tab',
  '   runs as, across tabs, is plan 2\'s cross-tab uid work.',
  '   ONLY THE SESSION\'S OWN KEY, or a clear of the whole store (key null).',
  '   This tab\'s own sign-out clears the session before it waits for the',
  '   drawing\'s save, and no storage event reaches the tab that made the',
  '   change, so for that wait it is signed in with nothing stored: another',
  '   tab writing any other key then is not a sign-in ending (measured, the',
  '   same spec). */',
  'addEventListener("storage",e=>{',
  '  if(e.key!==SB_SESSION && e.key!==null) return;',
  '  if(sbLoadSession()) return;',
  '  sessionEnded();',
  '});',
]);

/* ---- D2: cloudSignOutNow's comment, superseded --------------------------- */
doc.swap([
  '     store. Nothing else asks wsStill(). A push still in flight carries on,',
  '     and its confirmation - cloudSyncOne\'s "sent" write - lands in the',
  '     personal store, marked synced and with no owner, while the group\'s',
  '     own record stays unsent (measured, fix round 1). */',
], [
  '     store. Nothing else asks wsStill(). A push still in flight carries on,',
  '     and its confirmation - cloudSyncOne\'s "sent" write - lands in the',
  '     personal store, marked synced and with no owner, while the group\'s',
  '     own record stays unsent (measured, fix round 1). */',
  '  /* (Follow-up C, D2: SUPERSEDED. That "sent" write no longer lands. Since',
  '     fix round 4 (8b), cloudSyncOne writes it, and cloudPatchOne its own,',
  '     only past `if(!s0AtHome(s0Home)) return true;`, which asks wsGen and',
  '     the store; the wsGen bump below and activeWs=null above fail it. A',
  '     save whose row insert was out when the person signed out on a group',
  '     page: the insert lands, the personal store is untouched and the',
  '     group\'s record stays unsent; with cloudSyncOne\'s check removed, the',
  '     "sent" copy overwrote My page\'s record of the same id, its row and',
  '     weight replaced by the group\'s (both measured on 91eb861, a probe on',
  '     stage0moves\' stateful server; follow-up C report). cloudPatchOne\'s',
  '     check was read, not measured here. What still carries on is the',
  '     insert itself - it was sent before the sign-out.) */',
]);

doc.finish(({ text, code }) => {
  /* Checked on the page's code, comments removed (kit.code): a comment
     collapses to a blank line there, so "next" below skips blank lines. */
  const lines = kit.lines(code);
  const count = (s) => code.split(s).length - 1;
  const at = (pred, r) => { for (let i = r.start; i <= r.end; i++) if (pred(lines[i])) return i; return -1; };
  const next = (i) => { let j = i + 1; while (j < lines.length && lines[j].trim() === '') j++; return j; };
  /* A top-level listener: its first line, and the first "});" after it. */
  const listener = (first) => {
    const starts = lines.map((l, i) => (l === first ? i : -1)).filter(i => i >= 0);
    if (starts.length !== 1) throw new Error('expected one "' + first + '", found ' + starts.length);
    for (let i = starts[0] + 1; i < lines.length; i++) if (lines[i] === '});') return { start: starts[0], end: i };
    throw new Error('"' + first + '" does not close');
  };

  /* S1, sbAuthState: q.about is the stored token before sbToken, and the
     token sbToken handed back straight after it, before the null answer is
     read; the 401 re-ask carries q. */
  const sa = kit.inFunction(lines, 'async function sbAuthState(again,q){');
  const aboutS = at(l => l === '  if(q) q.about=s.access_token;', sa);
  const tokAt = at(l => l === '  const t=await sbToken();', sa);
  const aboutT = at(l => l === '  if(q&&t) q.about=t;', sa);
  const nullAt = at(l => l === '  if(!t) return sbLoadSession() ? {state:"unknown"} : {state:"out"};', sa);
  if (!(aboutS >= 0 && next(aboutS) === tokAt && next(tokAt) === aboutT && next(aboutT) === nullAt))
    throw new Error('sbAuthState does not note the token its answer is about, around sbToken');
  if (at(l => l === '      return again ? {state:"unknown"} : sbAuthState(true,q);', sa) < 0)
    throw new Error('sbAuthState\'s re-ask does not carry q');
  if (count('sbAuthState(true,q)') !== 1 || count('sbAuthState(false,q)') !== 1)
    throw new Error('expected one re-ask and one start that pass q');

  /* S1, cloudRender: the check follows the race at once, before either
     answer is used, and asks again only on the first pass. */
  const cr = kit.inFunction(lines, 'async function cloudRender(again){');
  const qAt = at(l => l === '  const q={about:null};', cr);
  const raceAt = at(l => l === '  const a=await Promise.race([sbAuthState(false,q),', cr);
  const chk = at(l => l === '  if(!again && (a.state==="unknown"||a.state==="in")){', cr);
  const unk = at(l => l === '  if(a.state==="unknown"){', cr);
  const inn = at(l => l === '  const inn=a.state==="in";', cr);
  if (!(qAt >= 0 && next(qAt) === raceAt && next(next(raceAt)) === chk && chk < unk && unk < inn))
    throw new Error('cloudRender does not check the answer against the session stored now, straight after its race and before using it');
  if (lines[chk + 1] !== '    const now=sbLoadSession();'
    || lines[chk + 2] !== '    if(((now&&now.access_token)||null)!==q.about) return cloudRender(true);'
    || lines[chk + 3] !== '  }')
    throw new Error('cloudRender\'s check is not the one written');
  if (count('cloudRender(true)') !== 1) throw new Error('expected one re-ask of cloudRender, found ' + count('cloudRender(true)'));
  /* Every other call starts a first pass: no caller hands cloudRender a
     value (a .then(cloudRender) would hand it the answer as `again`). The
     only openings with something inside are its own signature and the
     re-ask. */
  if (/\bthen\(\s*cloudRender\s*[,)]/.test(code) ||(code.match(/cloudRender\((?!\))/g) || []).length !== 2)
    throw new Error('a caller hands cloudRender a value');

  /* S8: sbCaptureFromHash takes a fragment, and cleans the address bar only
     for the one it read there itself. */
  const cap = kit.inFunction(lines, 'function sbCaptureFromHash(from){');
  const own = '  if(from===undefined) history.replaceState(null,"",location.pathname+location.search);';
  if (at(l => l === '  const h=(from===undefined) ? (location.hash||"") : from;', cap) < 0 || at(l => l === own, cap) < 0
    || at(l => l.indexOf('history.replaceState') >= 0, cap) !== at(l => l === own, cap))
    throw new Error('sbCaptureFromHash does not take a fragment, or cleans the address bar for one it was handed');
  if (count('sbCaptureFromHash(') !== 4)
    throw new Error('expected sbCaptureFromHash defined once and called at boot, in the handler and after the wait: ' + count('sbCaptureFromHash('));

  /* S8: in the sign-in hashchange handler, the wait's branch comes after the
     invite and before the fragment is stored, cleans the address bar at
     once, stores nothing itself, and returns. */
  const hc = listener('addEventListener("hashchange",()=>{');
  const hJoin = at(l => l === '  const joined=joinFromHash();', hc);
  const hWait = at(l => l === '  if(s0SignOutWait && (location.hash||"").indexOf("access_token=")>=0){', hc);
  const hNow = at(l => l === '  const signedIn=sbCaptureFromHash();', hc);
  if (!(hJoin >= 0 && hJoin < hWait && hWait < hNow)) throw new Error('the sign-out wait is not asked before the link is stored');
  const branch = lines.slice(hWait, hNow).join('\n');
  for (const s of ['  if(s0SignOutWait && (location.hash||"").indexOf("access_token=")>=0){\n    const h=location.hash;\n    history.replaceState(null,"",location.pathname+location.search);',
    '    const later=()=>{ if(!sbCaptureFromHash(h)) return;',
    '    s0SignOutWait.then(later,later);\n    return;\n  }'])
    if (branch.indexOf(s) < 0) throw new Error('the wait\'s branch does not clean the address bar at once, and store after the wait: ' + s.slice(0, 60));
  if (branch.indexOf('sbSaveSession') >= 0 || branch.indexOf('sbCaptureFromHash()') >= 0)
    throw new Error('the wait\'s branch stores the session before the wait');
  /* The other hashchange listener, page navigation, is untouched. */
  if (count('addEventListener("hashchange",()=>showPage(pageFromHash(),false));') !== 1)
    throw new Error('the page-navigation hashchange listener is not as it was');

  /* S6: one storage listener, beside the sign-in hashchange handler, reading
     only the session's key or a clear, and ending only when nothing is
     stored. */
  if (count('addEventListener("storage"') !== 1) throw new Error('expected one storage listener, found ' + count('addEventListener("storage"'));
  const st = listener('addEventListener("storage",e=>{');
  if (lines.slice(st.start, st.end + 1).join('\n') !== [
    'addEventListener("storage",e=>{',
    '  if(e.key!==SB_SESSION && e.key!==null) return;',
    '  if(sbLoadSession()) return;',
    '  sessionEnded();',
    '});'].join('\n')) throw new Error('the storage listener is not the one written');
  if (next(hc.end) !== st.start) throw new Error('the storage listener is not beside the sign-in hashchange listener');

  /* D2: the superseding note sits under the comment it supersedes, and the
     two facts it names stand - cloudSignOutNow bumps wsGen, and both "sent"
     writes sit behind 8b's check. */
  if (text.indexOf('     own record stays unsent (measured, fix round 1). */' + NL + '  /* (Follow-up C, D2: SUPERSEDED.') < 0)
    throw new Error('D2\'s superseding note is not under the comment it supersedes');
  const so = kit.inFunction(lines, 'function cloudSignOutNow(){');
  if (at(l => l === '  wsGen++; s0SeenUid=null;', so) < 0) throw new Error('cloudSignOutNow no longer bumps wsGen, which the D2 note relies on');
  if (count('    if(!s0AtHome(s0Home)) return true;' + NL + '    if((adopted||r.ok) && rec.id && touchedSince(rec.id,readAt)){') !== 1
    || count('    if(!s0AtHome(s0Home)) return true;   ' + NL + '    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;') !== 1)
    throw new Error('the 8b checks the D2 note names are not where it says');
});
