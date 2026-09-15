/* TWO PLACES WHERE A SLOW ANSWER LANDED AGAINST WHATEVER WAS THERE WHEN IT
   ARRIVED, RATHER THAN WHAT IT WAS ABOUT.

   ONE: SWITCHING PROJECT MID-PULL WRITES ONE PROJECT'S TRAITS INTO ANOTHER'S
   DATABASE.

   Each project is a SEPARATE IndexedDB - the note on db() says why, and it is
   right - and db() re-derives which one from the module-level activeWs on every
   single call:

     function wsDbName(){ return activeWs ? 'chatnft.ws.'+activeWs : DBN; }
     function db(){ if(dbp && dbpName===wsDbName()) return dbp; ... }

   dbPut calls db() fresh each time. cloudPull runs eight concurrent pullers,
   each awaiting a network download per trait and then writing. It captures no
   database handle up front - its only snapshot is the record list. wsSwitch
   reassigns activeWs as its second statement and drops the cached handle, and
   it is reachable from the "Working in" dropdown at any moment.

   So: open a group project with a few hundred traits, watch the banner say
   "Loading 12 of 310 from the group...", and use the dropdown again. Every
   remaining download lands in whichever project is now selected, marked
   synced:true and carrying the SOURCE project's rowId and path. Nothing
   removes them: the destination's own pull matches on rowId and leaves them,
   and pressing Save to cloud there uploads them into that collection. In a
   group tool that is one team's artwork copied into another team's.

   THE FIX IS A GENERATION, not a captured handle, because the writes are
   spread over four loops and a dozen individual awaits. wsSwitch bumps it; a
   long-running writer captures it and stops when it no longer matches. Each
   check sits with no await between it and the write it guards, so there is no
   window between deciding and doing.

   AND THE BAIL RE-ENABLES THE BUTTON. cloudPull disables "Load from cloud" at
   the top and re-enables it 300 lines later, so a new early return would leave
   it dead until a reload - which is the defect patch460 fixed on the push side.
   Adding one here without that would have rebuilt it.

   TWO: DROPPING A SECOND IMAGE INTO THE FIXER LANDS THE FIRST ONE'S ANSWER
   AGAINST THE SECOND ONE'S NAME.

   fixRun opens a worker whose onmessage writes the result straight into module
   state, and every consumer reads FIX.name and FIX.rel LIVE. fixLoad replaces
   all of that - FIX.src, FIX.name, FIX.rel, FIX.out - and never touches the
   running worker. fixRun itself opens with fixStop(); the guard exists one
   function away and is missing here.

   Detection takes several seconds on a 1024px image, by this file's own note,
   and the drop zone stays live throughout. Drop A, press Fix it, drop B while
   the bar moves: the before-pane becomes B, then A's worker answers into the
   after-pane. Save to project then writes A's pixels under B's name into the
   folder B came from. Download writes A's pixels to B's filename. Nothing on
   screen says the two panes are different pictures.

   Both halves are fixed because they answer different questions. Stopping the
   worker means a run nobody wants stops burning CPU and moving a progress bar;
   the identity check in onmessage is the correctness half, because a message
   already dispatched arrives whatever the worker is doing afterwards. fixRun
   ALREADY captures `const src=FIX.src;` - the value needed to tell was there
   the whole time and nothing compared it back. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- A1. which project the writes belong to ---- */
{
  const at = kit.only(L, l => l === 'function wsDbName(){ return activeWs ? \'chatnft.ws.\'+activeWs : DBN; }',
    'the database name');
  kit.replace(L, { start: at, end: at }, [
    'function wsDbName(){ return activeWs ? \'chatnft.ws.\'+activeWs : DBN; }',
    '/* WHICH PROJECT A LONG WRITE BELONGS TO.',
    '',
    '   db() reads activeWs on every call, so anything that awaits between',
    '   deciding what to write and writing it lands in whatever project is',
    '   selected by then. A pull of 310 traits awaits a network download per',
    '   trait, eight at a time, and the project dropdown is live throughout -',
    '   so switching mid-pull wrote one project\'s traits into another\'s',
    '   database, marked as synced and carrying the source project\'s rowId.',
    '',
    '   A generation rather than a captured handle, because those writes are',
    '   spread across four loops. Capture it, and check it with no await',
    '   between the check and the write - dbPut reads wsDbName() synchronously',
    '   before its first await, so there is no window in between. */',
    'let wsGen=0;',
    'function wsStill(g){ return g===wsGen; }',
  ]);
}
{
  const at = kit.only(L, l => l === '  activeWs = id||null;', 'the project switch');
  kit.replace(L, { start: at, end: at }, [
    '  activeWs = id||null;',
    '  /* Anything already in flight for the old project stops here. */',
    '  wsGen++;',
  ]);
}

/* ---- A2. the pull stops when the project moves ---- */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  const at = kit.only(L, l => l === '  $("cloudpull").disabled=true;', 'the pull button disable', fn);
  kit.replace(L, { start: at, end: at }, [
    '  /* THE PROJECT THIS PULL IS FOR. Everything below writes to whichever',
    '     database activeWs names AT THE MOMENT OF THE WRITE, and there are',
    '     hundreds of awaits between here and the last one. */',
    '  const gen=wsGen;',
    '  $("cloudpull").disabled=true;',
  ]);
}
{
  const at = kit.only(L, l => l === '  for(const rp of repair){', 'the repair loop');
  kit.replace(L, { start: at, end: at }, [
    '  for(const rp of repair){',
    '    if(!wsStill(gen)) break;',
  ]);
}
{
  const at = kit.only(L, l => l === '    while(next<wanted.length){', 'the puller loop');
  kit.replace(L, { start: at, end: at }, [
    '    while(next<wanted.length){',
    '      /* Before the download as well as before the write: a pull nobody is',
    '         waiting for should stop asking the server for pictures too. */',
    '      if(!wsStill(gen)) return;',
  ]);
}
{
  const at = kit.only(L, l => l === '        await dbPut(rec); added++;', 'the puller write');
  kit.replace(L, { start: at, end: at }, [
    '        /* The download above is the long await, so this is re-checked',
    '           rather than trusted from the top of the loop. */',
    '        if(!wsStill(gen)) return;',
    '        await dbPut(rec); added++;',
  ]);
}
{
  const at = kit.only(L, l => l === '  await Promise.all(Array.from({length:Math.min(PULL_AT_ONCE,wanted.length)},puller));',
    'the puller join');
  kit.replace(L, { start: at, end: at }, [
    '  await Promise.all(Array.from({length:Math.min(PULL_AT_ONCE,wanted.length)},puller));',
    '  /* AND EVERYTHING AFTER THIS POINT IN ONE CHECK - the layer list, the',
    '     rules, the decisions, the mailbox and the note all write or say',
    '     something about a project the person has left.',
    '',
    '     The button is re-enabled on the way out. It is disabled at the top of',
    '     this function and re-enabled three hundred lines below, so a bail that',
    '     just returned would leave Load from cloud dead until a reload - which',
    '     is the defect patch460 fixed on the push side, rebuilt here. */',
    '  if(!wsStill(gen)){',
    '    try{ $("cloudpull").disabled=false; }catch(_){}',
    '    try{ if(banner) banner.hidden=true; }catch(_){}',
    '    return null;',
    '  }',
  ]);
}

/* ---- A3. and so does the catch-up that removes what the group dropped ---- */
{
  const at = kit.only(L, l => l === 'async function groupCatchUp(){', 'the group catch-up');
  kit.replace(L, { start: at, end: at }, [
    'async function groupCatchUp(){',
    '  /* Same reason as the pull: this deletes local records, and it runs on',
    '     every page load and every switch. Deleting them out of the project the',
    '     person moved to would be the worst version of this. */',
    '  const gen=wsGen;',
  ]);
  const loop = kit.only(L, l => l === '        for(const it of mine){', 'the catch-up delete loop');
  kit.replace(L, { start: loop, end: loop }, [
    '        for(const it of mine){',
    '          if(!wsStill(gen)) break;',
  ]);
}

/* ---- B. the fixer's answer belongs to the picture that asked ---- */
{
  const at = kit.only(L, l => l === '  FIX.src={data:sd, width:sw, height:sh};', 'the fixer load');
  kit.replace(L, { start: at, end: at }, [
    '  /* A RUN IN FLIGHT IS FOR THE PICTURE BEING REPLACED. fixRun opens with',
    '     fixStop() for exactly this reason and this had nothing, so dropping a',
    '     second image left the first one\'s worker running - still burning CPU,',
    '     still moving the progress bar, and still about to answer.',
    '',
    '     fixDone rather than fixStop, because fixStop says "Stopped." and',
    '     nobody stopped anything - they opened another picture. Placed after',
    '     every refusal above, so a file that is too big or not an image does',
    '     not kill a run that is going fine. */',
    '  if(FIX.worker) fixDone(FIX.worker);',
    '  FIX.src={data:sd, width:sw, height:sh};',
  ]);
}
{
  /* SCOPED TO fixRun. There is a second `w.onmessage=ev=>{` in the batch
     path, which has its own shape - a sequential loop with a worker per
     image - and is not what this is about. */
  const fn = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l === '    w.onmessage=ev=>{', 'the worker handler', fn);
  if (L[at + 1] !== '      const m=ev.data;')
    throw new Error('the worker handler is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    w.onmessage=ev=>{',
    '      const m=ev.data;',
    '      /* THE ANSWER IS FOR THE PICTURE THAT ASKED. src was captured above',
    '         and nothing ever compared it back, so a result arriving after',
    '         another image was loaded wrote itself into FIX.out - and every',
    '         consumer reads FIX.name and FIX.rel LIVE. Save to project then',
    '         wrote the first picture\'s artwork into the project under the',
    '         second one\'s name, in the folder the second one came from.',
    '',
    '         Above the progress branch, not below it, because a stale progress',
    '         message moves the bar for a run that is not happening.',
    '',
    '         Identity, not equality: fixLoad assigns a brand new object, so',
    '         this is exact and costs nothing. */',
    '      if(FIX.src!==src){ fixDone(w); resolve(null); return; }',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE GENERATION EXISTS AND MOVES. A counter nothing bumps is a guard that
     never fires, which is worse than none because it reads as covered. */
  if (!/let wsGen=0;/.test(code) || !/function wsStill\(g\)\{ return g===wsGen; \}/.test(code))
    throw new Error('there is no project generation to check against');
  const ws = kit.inFunction(codeLines, 'async function wsSwitch(id){');
  if (!/wsGen\+\+;/.test(codeLines.slice(ws.start, ws.end + 1).join('\n')))
    throw new Error('switching project does not move the generation, so no check can ever fire');
  if ((code.match(/wsGen\+\+;/g) || []).length !== 1)
    throw new Error('the generation moves somewhere other than the switch');

  /* AND THE PULL CHECKS IT AT EVERY WRITE PHASE. Named one at a time rather
     than counted: a count passes with one loop guarded twice and another not
     at all. */
  const cp = kit.inFunction(codeLines, 'async function cloudPull(opts){');
  const cpb = codeLines.slice(cp.start, cp.end + 1).join('\n');
  if (!/const gen=wsGen;/.test(cpb))
    throw new Error('the pull does not capture which project it is for');
  if (!/for\(const rp of repair\)\{\n    if\(!wsStill\(gen\)\) break;/.test(cpb))
    throw new Error('the repair pass can still write into another project');
  if (!/while\(next<wanted\.length\)\{\n(.*\n)*?      if\(!wsStill\(gen\)\) return;/.test(cpb))
    throw new Error('the download loop can still run for a project nobody is in');
  if (!/if\(!wsStill\(gen\)\) return;\n        await dbPut\(rec\); added\+\+;/.test(cpb))
    throw new Error('the trait write is not guarded, which is the whole defect');
  if (!/if\(!wsStill\(gen\)\)\{\n    try\{ \$\("cloudpull"\)\.disabled=false; \}catch\(_\)\{\}/.test(cpb))
    throw new Error('the tail of the pull is unguarded, or its bail leaves the button dead');
  /* The bail must RE-ENABLE. cloudPull disables the button at the top and
     re-enables it far below; a bare return rebuilds patch460's defect. */
  if (!/try\{ \$\("cloudpull"\)\.disabled=false; \}catch\(_\)\{\}\n    try\{ if\(banner\) banner\.hidden=true; \}catch\(_\)\{\}\n    return null;/.test(cpb))
    throw new Error('the bail does not put the button and the banner back');

  const gc = kit.inFunction(codeLines, 'async function groupCatchUp(){');
  const gcb = codeLines.slice(gc.start, gc.end + 1).join('\n');
  if (!/const gen=wsGen;/.test(gcb) || !/if\(!wsStill\(gen\)\) break;/.test(gcb))
    throw new Error('the catch-up can still delete out of the wrong project');

  /* THE FIXER STOPS THE OLD RUN AND REFUSES ITS ANSWER. Both, because they
     answer different questions - one saves the CPU, one is the correctness. */
  const fl = kit.inFunction(codeLines, 'async function fixLoad(file){');
  const flb = codeLines.slice(fl.start, fl.end + 1).join('\n');
  if (!/if\(FIX\.worker\) fixDone\(FIX\.worker\);\n  FIX\.src=\{data:sd, width:sw, height:sh\};/.test(flb))
    throw new Error('loading another image leaves the previous run going');
  /* fixDone, not fixStop: fixStop says "Stopped." and nobody stopped. */
  if (/fixStop\(\);/.test(flb))
    throw new Error('the load says Stopped when somebody merely opened another picture');
  const fr = kit.inFunction(codeLines, 'function fixRun(){');
  const frb = codeLines.slice(fr.start, fr.end + 1).join('\n');
  if (!/const src=FIX\.src;/.test(frb))
    throw new Error('the run no longer captures the picture it is about');
  if (!/w\.onmessage=ev=>\{\n      const m=ev\.data;\n(.*\n)*?      if\(FIX\.src!==src\)\{ fixDone\(w\); resolve\(null\); return; \}/.test(frb))
    throw new Error('the worker answer is not checked against the picture that asked');
  /* Above the progress branch, or a stale run still moves the bar. */
  const handler = frb.slice(frb.indexOf('w.onmessage=ev=>{'));
  if (handler.indexOf('if(FIX.src!==src)') > handler.indexOf('if(m.progress!=null)'))
    throw new Error('the check sits below the progress branch, so a stale run still moves the bar');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
