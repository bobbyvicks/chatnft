/* STAGE 0, PART 7 OF 7: RELOADING WHEN THE PROJECT HAS MOVED ON.

   Design D1: "The message shows on every page ... and the reload behaviour
   is B5's: never while the editor is open or a stroke, drag or select is
   running", and "Reload prompts say that drawings and fixer saves are
   kept." B5: "With the editor open it shows a bar in the editor, "Reload to
   keep saving: your drawing is kept", and reloads on the press, after
   awaiting the draft write."

   For protocol 2 and for this account's migration flag, not for switching
   (that is waited out). By itself only when nothing is in hand - the editor
   closed (#app hidden), no stroke (painting), move (moveBuf, moveFrom),
   select (seDrag, seLift), text drag (textDrag), touch (pendingTouch),
   shelf drag or move (shelfDrag, shelfMoveBusy), layer drag (layerDrag),
   extract drag (exDrag) or gradient drag (gdDrag) running - and no fixer
   results in hand (FIX.out, fixBatchFiles): in stage 0 those live only in
   memory, and a reload would throw them away while the bar says fixes are
   kept. At most once per tab session per store and account
   (sessionStorage), because this page has no newer build to load, and a
   second reload would find the same answer and reload again for ever.
   Otherwise the bar's Reload button, which writes the editor's draft first
   (autosaveNow resolves once it is written, with whether it was). The next
   read - at most two minutes away - tries again once whatever was in hand
   is done.

   Written against the plan's page; Task 10's fix rounds and Tasks 11-14
   and 17 changed the page before this was applied, and the controller's
   audit of this patch (anchor-audit/amend-task15.md) found the following,
   each measured on this page before it was applied here (task-15-report):
   - THE DRAWING'S LAST SAVE AND THE WAITS (Finding 1). closeEditor hides
     #app and then awaits its closing draft write - always so, before Task
     10 too - and Task 10's sign-out and switch wait for that write before
     they move the store, the uid and wsGen. A read landing in any of these
     reloaded the page: the closing write was aborted, and with it every
     stroke since the drawing's last 1.5 s pause (autosave is a trailing
     debounce); a sign-out cut in its wait left chatnft.ws naming the
     leaving account's group and kept its invite; a switch cut in its wait
     came back on the old project. s0Busy reads them now: s0SaveInFlight
     (a draft write being written), autoPending (one waiting - belt and
     braces: autosave() refuses while #app is hidden, and closeEditor's
     autosaveNow clears it), s0SignOutWait, and s0WsWant!==undefined (a
     switch to My page waits with s0WsWant===null, which a truthiness
     test reads as idle). Today each wait exists only while a save is in
     flight, so s0SaveInFlight alone covers the waits; they are named so
     a change to Task 10's wait conditions cannot reopen the gap. With an
     encode that never calls back, s0SaveInFlight stays set and the page
     never reloads by itself; the button still does.
   - THE BUTTON DURING A WAIT, AND A BAR LEFT FROM BEFORE (Finding 2 and
     the verifier's missed item). The bar sits above the sign-in scrim, so
     its Reload is pressable during a sign-out's wait, and a second draft
     write started then lands in the store the page moves to. A press
     during a sign-out or switch wait says to press again in a moment and
     does nothing else (the wait is at most S0_FLUSH_MS). A press when this
     store and account are no longer held redraws the bar and does nothing
     else: the draft it would write belongs to a store or an account that
     has gone (a session ended with the editor open: rewritten with no
     maker over the one sessionEnded's final save kept). With the editor
     closed nothing new is written - closeEditor already wrote the draft
     where it was drawn - and the press waits for that write if it is
     still being written. Asked again after the wait: a press that waited
     through a move does not reload.
   - A WRITE THAT FAILED (Finding 7). autosaveNow resolves false when
     storage refuses the write, and shows "copy it out with Download".
     The press does not reload then: that would wipe the canvas and the
     warning with it.
   - THE WAIT IS NOT BOUNDED (the verifier on Finding 2). With an encode
     that never calls back, the hang is what keeps the only copy on
     screen; a bounded wait would reload over it. The button is disabled
     and says "Saving..." while it waits, as Save and close does.
   - Line numbers are not cited (Finding 8): they were the plan's page's.

   Beyond the audit, measured on this page first:
   - THE KEPT SENTENCE HAS ITS OWN ELEMENT, #s0kept. stage0gate (Task 11,
     Finding 3) pins #s0text as exactly D1's words on a held page; the
     plan wrote the kept sentence into #s0text, which reddened those three
     tests (measured). The bar reads the same: #s0text, then #s0kept.
   - THE FIXER AT WORK IS IN HAND TOO. A folder run starts its list empty
     (fixBatchRun sets fixBatchFiles=[]), so until its first file was done
     the plan's check read nothing in hand, and a reload stopped the run;
     one image being fixed was the same (FIX.worker). Both hold now.
   - A FLAG s0Busy CANNOT READ IS BUSY. A ReferenceError read as idle
     would let a renamed flag reload over what it guards. A reload missed
     costs a press; one made mid-stroke costs the stroke.
     test/stage0-source.test.mjs keeps every name s0Busy reads declared. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([['function s0Show(){', 'patch602 is not applied'], ['async function s0DeleteIfAlone(name){', 'patch605 is not applied']]);

/* ---- 1. the bar: the kept sentence, after D1's words --------------------- */
doc.swap('<span id="s0text"></span> <button type="button" id="s0reload" hidden>Reload</button>',
  '<span id="s0text"></span><span id="s0kept" hidden></span> <button type="button" id="s0reload" hidden>Reload</button>');

/* ---- 2. the rule, applied wherever the bar is drawn ---------------------- */
doc.swap(['    else if(!why&&ours) fx.textContent="";', '  }', '}'], [
  '    else if(!why&&ours) fx.textContent="";',
  '  }',
  '  s0Reload(why);',
  '}',
  '/* STAGE 0: RELOADING INTO THE NEW PAGE (design D1, B5\'s rule). For',
  '   protocol 2 and the migration flag; a switching project is waited out.',
  '   By itself only with nothing in hand and at most once per tab session',
  '   per store and account; otherwise the Reload button, which writes the',
  '   draft first. */',
  'const S0_RELOADED="pb.s0.reloaded.";',
  'const S0_KEPT=". Your drawings and saved fixes are kept.";',
  'const S0_FIXER_FIRST=" Save the fixer\'s results first: unsaved ones are not kept.";',
  'const S0_RELOAD_WAIT="Saving your drawing first - press Reload again in a moment";',
  '/* Per store AND account, like s0State: another account on this browser',
  '   has its own reload to make. */',
  'function s0ReloadKey(){ return S0_RELOADED+wsDbName()+"."+(s0Uid()||""); }',
  '/* IN HAND: the editor open, a gesture running, or the drawing\'s last save',
  '   or a move of the store still under way. closeEditor hides #app before',
  '   its closing draft write lands - s0SaveInFlight covers that write, and',
  '   the sign-out and switch waits (s0SignOutWait, s0WsWant) wait for it',
  '   before they move the store, the uid and wsGen. A switch to My page',
  '   waits with s0WsWant===null, so it is read as "not undefined". A flag',
  '   that cannot be read is busy: a missed reload costs a press, a reload',
  '   over what it guards costs that work (test/stage0-source.test.mjs keeps',
  '   every name here declared). */',
  'function s0Busy(){',
  '  const on=f=>{ try{ return !!f(); }catch(_){ return true; } };',
  '  const app=$("app");',
  '  if(app&&!app.hidden) return true;',
  '  return on(()=>painting) || on(()=>moveBuf) || on(()=>moveFrom)',
  '    || on(()=>seDrag) || on(()=>seLift) || on(()=>textDrag) || on(()=>pendingTouch)',
  '    || on(()=>shelfDrag) || on(()=>shelfMoveBusy) || on(()=>layerDrag) || on(()=>exDrag) || on(()=>gdDrag)',
  '    || on(()=>autoPending) || on(()=>s0SaveInFlight) || on(()=>s0SignOutWait) || on(()=>s0WsWant!==undefined);',
  '}',
  '/* The fixer\'s results live only in memory in stage 0: a single fix\'s',
  '   (FIX.out) and a folder\'s (fixBatchFiles) - and the fixer at work on',
  '   them: one image being fixed (FIX.worker), or a folder run, whose',
  '   list is empty until its first file is done (fixBatchRunning). */',
  'function s0FixerHolds(){',
  '  try{ return !!(FIX&&(FIX.out||FIX.worker)) || !!fixBatchRunning || !!(fixBatchFiles&&fixBatchFiles.length); }catch(_){ return false; }',
  '}',
  'function s0Reload(why){',
  '  const switched=why==="switched"||why==="migrating";',
  '  const btn=$("s0reload"), kept=$("s0kept");',
  '  if(btn) btn.hidden=!switched;',
  '  const fixer=switched&&s0FixerHolds();',
  '  if(kept){ kept.hidden=!switched; kept.textContent=switched ? S0_KEPT+(fixer?S0_FIXER_FIRST:"") : ""; }',
  '  if(!switched) return;',
  '  let done=true;',
  '  try{ done=sessionStorage.getItem(s0ReloadKey())==="1"; }catch(_){ done=true; }',
  '  if(done||fixer||s0Busy()) return;',
  '  try{ sessionStorage.setItem(s0ReloadKey(),"1"); }catch(_){ return; }',
  '  location.reload();',
  '}',
  '/* THE DRAFT WRITE THE PRESS AWAITS (B5). The editor open: its draft,',
  '   written now; false if the write was refused (autosaveNow says so).',
  '   The editor closed: closeEditor wrote it where it was drawn, so nothing',
  '   new is written - the press waits for that write if it is still being',
  '   written (and writes one still waiting, which autosave() does not leave',
  '   while #app is hidden). Not bounded: see s0ReloadNow. */',
  'async function s0DraftLanded(){',
  '  try{',
  '    if(!$("app").hidden) return await autosaveNow();',
  '    if(autoPending) autosaveNow();',
  '    const p=s0SaveInFlight;',
  '    return p ? await p : true;',
  '  }catch(_){ return false; }',
  '}',
  '/* THE BAR\'S RELOAD. Not during a sign-out\'s or a switch\'s wait: a draft',
  '   write started then lands in the store the page moves to - it says to',
  '   press again, the wait being at most S0_FLUSH_MS. Not when this store',
  '   and account are no longer held: the bar is redrawn instead, and',
  '   nothing is written for a store or an account that has gone. The draft',
  '   write is awaited without a bound - with an encode that never calls',
  '   back, the page on screen is the only copy - and the button says so',
  '   meanwhile. A write that failed does not reload: the canvas and the',
  '   warning would go with it. Asked again after the wait. */',
  'let s0Reloading=false;',
  'async function s0ReloadNow(){',
  '  if(s0Reloading) return;',
  '  if(s0SignOutWait||s0WsWant!==undefined){ toast(S0_RELOAD_WAIT); return; }',
  '  if(!s0Held()){ s0Show(); return; }',
  '  const b=$("s0reload"), was=b ? b.textContent : "";',
  '  s0Reloading=true;',
  '  if(b){ b.disabled=true; b.textContent="Saving..."; }',
  '  let ok=false;',
  '  try{ ok=await s0DraftLanded(); }',
  '  finally{ s0Reloading=false; if(b){ b.disabled=false; b.textContent=was; } }',
  '  if(!ok) return;',
  '  if(s0SignOutWait||s0WsWant!==undefined||!s0Held()){ s0Show(); return; }',
  '  try{ sessionStorage.setItem(s0ReloadKey(),"1"); }catch(_){ }',
  '  location.reload();',
  '}',
]);

/* ---- 3. the button ------------------------------------------------------- */
doc.swap('},S0_POLL_MS);', [
  '},S0_POLL_MS);',
  '/* STAGE 0 (D1, B5): the bar\'s Reload writes the editor\'s draft first. */',
  '{ const b=$("s0reload"); if(b) b.onclick=()=>{ s0ReloadNow(); }; }',
]);

doc.finish(({ text, code, must }) => {
  if (text.indexOf('<span id="s0text"></span><span id="s0kept" hidden></span> <button type="button" id="s0reload" hidden>Reload</button>') < 0)
    throw new Error('the bar has no #s0kept after #s0text');
  must('  s0Reload(why);', 's0Show does not apply the reload rule');
  must('if(done||fixer||s0Busy()) return;', 'the reload is not held by the editor, a gesture, the fixer or the once-per-session guard');
  must('!!(FIX&&(FIX.out||FIX.worker)) || !!fixBatchRunning', 'the fixer at work does not hold the reload');
  must('on(()=>s0SaveInFlight)', 's0Busy does not read the draft write in flight');
  must('on(()=>autoPending)', 's0Busy does not read a draft write waiting');
  must('on(()=>s0SignOutWait)', 's0Busy does not read the sign-out wait');
  must('on(()=>s0WsWant!==undefined)', 's0Busy does not read a switch waiting, a switch to My page included');
  must('if(s0SignOutWait||s0WsWant!==undefined){ toast(S0_RELOAD_WAIT); return; }', 'the Reload button acts during a sign-out or switch wait');
  must('if(!s0Held()){ s0Show(); return; }', 'the Reload button acts for a store or account no longer held');
  must('if(!$("app").hidden) return await autosaveNow();', 'the Reload button does not write the open editor\'s draft first');
  must('if(!ok) return;', 'the Reload button reloads over a draft write that failed');
  if ((code.match(/location\.reload\(\)/g) || []).length !== 2) throw new Error('only s0Reload and s0ReloadNow may reload the page');
});
