/* STAGE 0, PART 6 OF 7: LEAVE KEEPS WHAT IT CANNOT READ, AND NEVER DELETES A
   STORE ANOTHER TAB HOLDS.

   Design D1: "Leave: a failed read counts as "unknown: keep", and it never
   deletes while another tab holds the database."

   wsLeave read the store to count what the group has not got, and on a
   failed read its catch set the count to nothing (`unsent=[]; drawings=0`)
   - so a store it could not read was "nothing to keep", and its inline
   `indexedDB.deleteDatabase(dbName)` deleted it. A failed read now keeps
   the copy, and so does a protocol read that did not answer: the project
   may be switching, and this copy may be the only one of what it holds
   (Decision 21). The question and the toast say which.

   And the delete. "Another tab" is two kinds. A stage-0 tab holds the
   store's open lock (patch600). A tab from before stage 0 - on the day this
   ships, every other open tab - holds only a connection, and a delete it
   blocks cannot be withdrawn: it is queued, and runs when that tab closes,
   destroying whatever that tab saved in the meantime. So:
     1. this tab closes its own handles and waits until their locks have
        gone (s0CloseAllGone - a lock released but not yet gone would read
        as another tab);
     2. it takes the store's open lock exclusively, without waiting;
        refused ("other"): a stage-0 tab has the store, and it stays;
     3. holding the lock, it asks for the store at version 2. If another
        connection is open the request is "blocked" ("old"), and the store
        stays. Otherwise the upgrade starts: no other connection is open
        and none can open while it runs, so the store is read there, as it
        is now, and the upgrade is aborted, so it stays at version 1;
     4. only then does it delete, still holding the lock. A delete blocked
        all the same (a tab from before stage 0 opening the store in the
        moment between) is said as what it is ("blocked").
   Leave also reads the protocol afresh first, and does nothing while the
   project is held (D1: "refuses ... Leave").

   THE VERSION-2 REQUEST, WHEN BLOCKED, CANNOT BE WITHDRAWN (ruling F-14,
   measured 2026-09-28 in this suite's Chromium before it was accepted). It
   stays queued until that tab closes or reloads, and every later open of
   the store - in this tab, in any other - waits behind it: a third open
   did not answer in 2 s, in the same tab or another. Nothing a page can do
   withdrew it: removing an iframe that made it, terminating a worker that
   made it, and closing or reloading the page that made it each left the
   third open waiting. What ends it is that tab closing (measured: the open
   then went ahead at once, at version 1, with the request aborted - and
   with the page that made it already gone, closed or reloaded, the store
   stayed at version 1 too). So the toast asks the person to close or
   reload that tab. The delete it replaces had the same queue and ended
   in a delete; this ends in nothing.

   What the controller's audit of this task (anchor-audit/amend-task14.md)
   found on the page Task 10 left, each measured on it first (Step 0):
   - Finding 1: the count took only drafts with a traitId, so the canvas
     that is not a trait yet (AUTO_ID: an imported PNG, an extraction) -
     the only copy of that picture - was deleted under "Your own page is
     untouched". Every draft counts now, and that one is named apart:
     Save to cloud sends no draft.
   - Finding 2: a drawing's save still being written when Leave was pressed
     landed in the group's store after the count - wsSwitch waits for it
     before it moves (Task 10) - and was deleted. Leave waits for it too,
     bounded the same, before the count (a); and, since one can still land
     later (past the bound, or started after the count by a tab hidden),
     the delete is decided on the store as it is then, inside the
     version-2 request, before its abort: anything the question would
     have named keeps it ("held") (b).
   - Finding 3: a switch that finished during Leave's awaits had it ask
     about one project and send leave_team for another (measured: it asked
     about team7, left team8, and deleted team7's copy). The project is
     taken first; a switch still waiting stops Leave at once; after the
     count, a move to another project or account, or a switch waiting,
     stops it before the question; leave_team names the project taken.
   - Finding 5: Leave's own move off the project, overtaken by a move back
     to it, left the page on the project whose copy was then deleted. It
     is deleted only when the page is off it.
   - Finding 7: see the version-2 request, above.

   INTEGRATED OVER TASK 11'S FIX ROUNDS 3 AND 4 (patch602 at cloud-save/
   t11f3): every anchor matched as written. One page-wide count moved:
   fix 4's F1 added a third IndexedDB open, s0InStore, which opens the
   store a send was for by name - locked and tracked as db() is - so the
   finish check counts three and pins the third (below). */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['async function s0CloseAllGone(name){', 'patch600 is not applied'], ['async function s0Refuse(', 'patch602 is not applied'], ['let s0WsWant', 'Task 10\'s switch wait is not in the page']]);

doc.swap(['async function wsLeave(){', '  if(!activeWs) return;', '  const h=await sbHeaders({"Content-Type":"application/json"});', '  if(!h) return;'], [
  '/* STAGE 0 (D1): IS ANY OTHER CONNECTION OPEN ON THIS STORE, AND IS THERE',
  '   ANYTHING IN IT THE QUESTION WOULD HAVE NAMED? Asks for version 2. A',
  '   connection that does not close - a tab from before stage 0, which takes',
  '   no lock - makes the request "blocked". Otherwise the upgrade starts,',
  '   with no other connection open and none able to open while it runs, and',
  '   the store is read there as it is now: a draft, or a trait or reference',
  '   the group has not got, is "held". The upgrade is then aborted, so the',
  '   store stays at version 1.',
  '   A BLOCKED REQUEST CANNOT BE WITHDRAWN (measured, see patch605): it stays',
  '   queued until that tab closes or reloads, every later open of the store',
  '   waits behind it, and then it runs and is aborted here, or, if this page',
  '   has gone, by the browser - the store stayed at version 1 both ways. */',
  'function s0OthersOpen(name){',
  '  return new Promise(res=>{',
  '    let r=null, verdict=null;',
  '    try{ r=indexedDB.open(name,2); }catch(_){ res("unknown"); return; }',
  '    r.onblocked=()=>res("blocked");',
  '    r.onupgradeneeded=()=>{',
  '      const t=r.transaction;',
  '      const stop=()=>{ try{ t.abort(); }catch(_){ } };',
  '      try{',
  '        if(!r.result.objectStoreNames.contains(STORE)){ verdict="alone"; stop(); return; }',
  '        const c=t.objectStore(STORE).openCursor();',
  '        c.onsuccess=()=>{',
  '          const cur=c.result;',
  '          if(!cur){ verdict="alone"; stop(); return; }',
  '          const v=cur.value;',
  '          if(v&&(v.kind==="autosave"||((v.kind==="trait"||v.kind==="ref")&&!v.synced))){ verdict="held"; stop(); return; }',
  '          cur.continue();',
  '        };',
  '        c.onerror=()=>stop();',
  '      }catch(_){ stop(); }',
  '    };',
  '    r.onsuccess=()=>{ try{ r.result.close(); }catch(_){ } res("unknown"); };',
  '    /* Aborted is the answer read (verdict); anything else, or a read that',
  '       failed and aborted it, is "unknown": keep. */',
  '    r.onerror=(e)=>{ try{ if(e&&e.preventDefault) e.preventDefault(); }catch(_){ }',
  '      res(r.error&&r.error.name==="AbortError"&&verdict ? verdict : "unknown"); };',
  '  });',
  '}',
  '/* STAGE 0 (D1): LEAVE NEVER DELETES A STORE ANOTHER TAB HOLDS. This tab',
  '   closes its own handles and waits for their locks to go; takes the',
  '   store\'s open lock exclusively without waiting ("other" if a stage-0',
  '   tab has it); asks whether any connection is still open ("old" if a tab',
  '   from before stage 0 has it) and reads the store ("held" if anything',
  '   the question would have named is in it now); and only then deletes,',
  '   holding the lock. */',
  'async function s0DeleteIfAlone(name){',
  '  await s0CloseAllGone(name);',
  '  const del=()=>new Promise(res=>{',
  '    try{',
  '      const q=indexedDB.deleteDatabase(name);',
  '      q.onsuccess=()=>res(true); q.onerror=()=>res(false); q.onblocked=()=>res("blocked");',
  '    }catch(_){ res(false); }',
  '  });',
  '  const probeThenDelete=async()=>{',
  '    const p=await s0OthersOpen(name);',
  '    if(p==="blocked") return "old";',
  '    if(p==="held") return "held";',
  '    if(p!=="alone") return false;',
  '    return del();',
  '  };',
  '  if(!(navigator.locks&&typeof navigator.locks.request==="function")) return probeThenDelete();',
  '  try{',
  '    return await navigator.locks.request(S0_LOCK_PREFIX+name,{mode:"exclusive",ifAvailable:true},',
  '      lock=>lock ? probeThenDelete() : "other");',
  '  }catch(_){ return false; }',
  '}',
  'const S0_LEAVE_MOVING="Did not leave - the page is still moving to another project";',
  'const S0_LEAVE_MOVED="Did not leave - the page moved to another project, or signed out, while Leave was checking";',
  'async function wsLeave(){',
  '  if(!activeWs) return;',
  '  /* STAGE 0 (the controller\'s audit, Finding 3): THE PROJECT THIS LEAVE IS',
  '     FOR, taken before anything is awaited. A switch waits, bounded, for',
  '     the drawing\'s save before it moves (Task 10), and one that finished',
  '     during these awaits had Leave count and ask about one project and',
  '     send leave_team for the other (measured). A switch still waiting',
  '     stops Leave at once; the count is checked again below. */',
  '  const leaving=activeWs, dbName=wsDbName();',
  '  const moved=()=>activeWs!==leaving||s0WsWant!==undefined||!sbLoadSession();',
  '  if(s0WsWant!==undefined){ toast(S0_LEAVE_MOVING); return; }',
  '  const h=await sbHeaders({"Content-Type":"application/json"});',
  '  if(!h) return;',
  '  /* STAGE 0 (D1): Leave reads afresh, and does nothing while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  /* And a read that did not answer is "unknown: keep": the project may be',
  '     switching, and this copy may be the only one of what it holds. */',
  '  const unchecked=!s0State.ok||!s0Mine(dbName,s0Uid()||null);',
  '  /* STAGE 0 (Finding 2a): a drawing\'s save still being written lands in',
  '     this store - the switch off it waits for it - so it is waited for,',
  '     bounded the same, before the count, and the question can name it. */',
  '  { const f=s0FlushAutosave(); if(f) await f; }',
]);
doc.swap('  const leaving=activeWs, dbName=wsDbName();' + s0.NL + '  let unsent=[], drawings=0;', [
  '  /* (leaving and dbName are taken at the top: STAGE 0, Finding 3.) */',
  '  let unsent=[], drawings=0, pictures=0, unread=false;',
]);
doc.swap([
  '    drawings=all.filter(i=>i.kind==="autosave"&&i.traitId).length;',
  '  }catch(_){ unsent=[]; drawings=0; }',
], [
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
]);
doc.swap('  if(drawings) held.push(drawings+" unsaved drawing"+(drawings===1?"":"s"));', [
  '  if(drawings) held.push(drawings+" unsaved drawing"+(drawings===1?"":"s"));',
  '  if(pictures) held.push((pictures===1 ? "an unsaved picture" : pictures+" unsaved pictures")',
  '    +" (open it from the restore bar and Save to project)");',
]);
doc.swap('  const keeps=held.length>0;', '  const keeps=held.length>0||unread||unchecked;');
doc.swap(['  if(!confirm(keeps', '    ? "Leave this group project? This device has "+held.join(" and ")+"."'], [
  '  if(!confirm(unread',
  '    ? "Leave this group project? This device could not read what it holds for the group, so its copy stays here -"',
  '      +" it may hold changes the group has not got. The project stays for everyone else."',
  '    : unchecked',
  '    ? "Leave this group project? This device could not check the project with the server, so its copy stays here -"',
  '      +" it may hold changes the group has not got. The project stays for everyone else."',
  '    : keeps',
  '    ? "Leave this group project? This device has "+held.join(" and ")+"."',
]);
doc.swap('      body:JSON.stringify({p_team:activeWs})});', '      body:JSON.stringify({p_team:leaving})});');
doc.swap([
  '    if(!keeps && leaving && dbName && dbName!==DBN){',
  '      freed=await new Promise(res=>{',
  '        try{',
  '          const q=indexedDB.deleteDatabase(dbName);',
  '          q.onsuccess=()=>res(true); q.onerror=()=>res(false); q.onblocked=()=>res(false);',
  '        }catch(_){ res(false); }',
  '      });',
  '    }',
  '    toast(keeps ? "Left the project - what the group has not got is kept on this device"',
  '      : freed ? "Left the project, and cleared its copy from this device" : "Left the project");',
], [
  '    /* STAGE 0 (Finding 5): only when the page is off it. The switch above',
  '       can be overtaken, while it waits for a save, by a switch away and',
  '       back; with the team list unreadable, wsRender leaves the page on',
  '       the project it has left, and this deleted the store it showed. */',
  '    const showing=wsDbName()===dbName;',
  '    if(!keeps && !showing && leaving && dbName && dbName!==DBN) freed=await s0DeleteIfAlone(dbName);',
  '    toast(unread ? "Left the project - this device could not read its copy, so it is kept here"',
  '      : unchecked ? "Left the project - this device could not check the project, so its copy is kept here"',
  '      : keeps ? "Left the project - what the group has not got is kept on this device"',
  '      : showing ? "Left the project - the page is still showing it, so its copy is kept on this device"',
  '      : freed===true ? "Left the project, and cleared its copy from this device"',
  '      : freed==="other" ? "Left the project - another BuildaNFT tab has it open, so its copy is kept on this device"',
  '      : freed==="old" ? "Left the project - a BuildaNFT tab from before this update has it open, so its copy is kept on this device."',
  '        +" Close or reload that tab: until then this device cannot open the project again"',
  '      : freed==="held" ? "Left the project - something was saved to its copy while leaving, so it is kept on this device"',
  '      : freed==="blocked" ? "Left the project - a BuildaNFT tab from before this update opened it just now; its copy is cleared when that tab closes"',
  '      : "Left the project");',
]);

doc.finish(({ code, must }) => {
  must('if(!keeps && !showing && leaving && dbName && dbName!==DBN) freed=await s0DeleteIfAlone(dbName);', 'Leave does not check for other tabs, or deletes the store it shows');
  must('const showing=wsDbName()===dbName;', 'Leave could delete the store the page shows');
  must('}catch(_){ unsent=[]; drawings=0; pictures=0; unread=true; }', 'a failed read does not keep the copy');
  must('const keeps=held.length>0||unread||unchecked;', 'a failed read does not keep the copy');
  must('const unchecked=!s0State.ok||!s0Mine(dbName,s0Uid()||null);', 'a protocol read that did not answer does not keep the copy');
  must('const drafts=all.filter(i=>i.kind==="autosave");', 'the count skips a draft');
  must('{ const f=s0FlushAutosave(); if(f) await f; }', 'the count misses a save still being written');
  must('const leaving=activeWs, dbName=wsDbName();' + s0.NL + '  const moved=()=>activeWs!==leaving||s0WsWant!==undefined||!sbLoadSession();', 'Leave does not take its project first');
  must('if(s0WsWant!==undefined){ toast(S0_LEAVE_MOVING); return; }', 'Leave goes on while a switch waits');
  must('if(moved()){ toast(S0_LEAVE_MOVED); return; }', 'Leave asks after the page moved');
  must('body:JSON.stringify({p_team:leaving})', 'leave_team can name another project');
  must('await s0CloseAllGone(name);', 'Leave could meet its own tab\'s lock');
  must('if(v&&(v.kind==="autosave"||((v.kind==="trait"||v.kind==="ref")&&!v.synced))){ verdict="held"; stop(); return; }', 'the delete is not decided on the store as it is');
  must('res(r.error&&r.error.name==="AbortError"&&verdict ? verdict : "unknown"); };', 'an aborted read reads as alone');
  if ((code.match(/const leaving=activeWs, dbName=wsDbName\(\);/g) || []).length !== 1) throw new Error('wsLeave takes its project twice');
  if ((code.match(/indexedDB\.deleteDatabase\(/g) || []).length !== 1) throw new Error('s0DeleteIfAlone should be the only delete of a store');
  /* INTEGRATED OVER TASK 11 FIX ROUND 4: its F1 opens the store a send was
     for by name (s0InStore, for s0ClearAhead). It takes the store's open
     lock first and is tracked, as db() is, so Leave's lock and its
     s0CloseAllGone see it; it is the one other open, and it may not create
     a store (its upgrade is aborted). Counted as three, and the third
     pinned to those terms. */
  if ((code.match(/indexedDB\.open\(/g) || []).length !== 3) throw new Error('db(), s0InStore (fix 4) and the Leave probe should be the only opens');
  {
    const f = code.indexOf('function s0InStore(name){'), e = code.indexOf('\n}', f), b = f >= 0 && e > f ? code.slice(f, e) : '';
    if (!b || b.indexOf('indexedDB.open(name,1)') < 0 || b.indexOf('s0Hold(name).then(') < 0 || b.indexOf('s0Track(name,r.result,hold)') < 0
      || b.indexOf('r.transaction.abort()') < 0)
      throw new Error('the third open is not s0InStore\'s, locked and tracked as db() is, and unable to create a store');
  }
});
