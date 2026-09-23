/* A DEAD CONNECTION STOPS THE RUN, SAYS WHY, AND SAVE CAN BE STOPPED.

   Found 2026-09-22 by the discovery pass, ranked sixteenth of 39, measured
   by a finder and two verifiers. Each picture in Save to cloud and Load from
   cloud spent its own three attempts and 0.75 s of backoff, six or eight at
   a time, so a connection that had gone was discovered one picture at a
   time: a push of 311 with the server answering 500 ran 42 s (65 s at 150 ms
   round trips), made 933 upload attempts, and ended "311 failed". The
   reason cloudSyncOne works out for each failure was thrown away. The
   button was disabled for the length of it and nothing stopped it; a
   dropped connection took 22 s from the drop to the toast with the counter
   still climbing.

   Save to cloud now stops starting pictures after three in a row could not
   reach the server, counts the rest as not tried, and says why in words -
   the dominant reason among what failed. Load from cloud does the same on
   three downloads in a row that could not be reached; a picture that is
   simply missing (404) or refused is not a sign the connection went, so it
   does not count towards the three. While a push runs its button reads
   Stop, and pressing it stops the run the same way. A run that stopped
   early does not do the end-of-run cleanup, because that reads the server
   as the whole picture. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const pushR = () => kit.inFunction(L, 'async function cloudPush(){');

/* ---- 1. the push: a breaker, a reason, and a stop ------------------------ */
{
  const fn = pushR();
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* A PUSH IN PROGRESS, and whether its button has been pressed to stop it.',
    '   The button reads Stop while it runs. */',
    'let pushRunning=false, pushStopAsked=false;',
    '/* The dominant reason among what failed, in words for a push. */',
    'function pushWhy(reasons){',
    '  let best=null, n=0;',
    '  for(const k in reasons) if(reasons[k]>n){ n=reasons[k]; best=k; }',
    '  return best==="signedout" ? "you are signed out on this device"',
    '    : best==="notallowed" ? "this account may not write here"',
    '    : best==="refused" ? "the server refused them"',
    '    : best==="collection" ? "the collection on the server could not be opened"',
    '    : "the server could not be reached";',
    '}',
    'async function cloudPush(){',
  ]);
}
swap('  $("cloudpush").disabled=true;', [
  '  pushRunning=true; pushStopAsked=false;',
  '  $("cloudpush").textContent="Stop";',
], 'the button on', pushR());
swap('  let saved=0, failed=0, done=0, patched=0;', ['  let saved=0, failed=0, done=0, patched=0, streak=0, broke=false;', '  const reasons={};'], 'the counters', pushR());
swap('    while(next<fresh.length){', [
  '    /* THREE IN A ROW THAT COULD NOT REACH THE SERVER end the run: every',
  '       picture after them would find the same, three attempts and a backoff',
  '       each (measured: 933 attempts and 42 s to learn that 311 failed). */',
  '    while(next<fresh.length && !broke && !pushStopAsked){',
], 'the pusher loop', pushR());
{
  const fn = pushR();
  const i = at('      if(job.light && await cloudPatchOne(it,ctx)){ okd=true; patched++; }', 'the item', fn);
  const want = [
    '      if(job.light && await cloudPatchOne(it,ctx)){ okd=true; patched++; }',
    '      else if(await cloudSyncOne(it,ctx)){ okd=true; saved++; }',
    '      if(okd) rows.push({path:cloudPath(team,c,it)});',
    '      else failed++;',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the item moved at +' + k);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '      const why={};',
    '      if(job.light && await cloudPatchOne(it,ctx)){ okd=true; patched++; }',
    '      else if(await cloudSyncOne(it,ctx,why)){ okd=true; saved++; }',
    '      if(okd){ rows.push({path:cloudPath(team,c,it)}); streak=0; }',
    '      else {',
    '        failed++;',
    '        const r=why.reason||"unreachable";',
    '        reasons[r]=(reasons[r]||0)+1;',
    '        streak = r==="unreachable" ? streak+1 : 0;',
    '        if(streak>=3) broke=true;',
    '      }',
  ]);
}
swap('  await Promise.all(Array.from({length:Math.min(PUSH_AT_ONCE,fresh.length)},pusher));', [
  '  await Promise.all(Array.from({length:Math.min(PUSH_AT_ONCE,fresh.length)},pusher));',
  '  const notTried=fresh.length-done;',
], 'after the pushers', pushR());
swap('  if(!activeWs && !failed){', [
  '  /* Not after a run that stopped early either: what is left is unknown. */',
  '  if(!activeWs && !failed && !notTried){',
], 'the stale guard', pushR());
swap('  $("cloudpush").disabled=false;', [
  '  pushRunning=false; pushStopAsked=false;',
  '  $("cloudpush").textContent="Save to cloud";',
  '  $("cloudpush").disabled=false;',
], 'the button off', pushR());
swap('  if(failed) bits.push(failed+" failed");', [
  '  if(failed) bits.push(failed+" failed - "+pushWhy(reasons));',
  '  if(notTried) bits.push(notTried+" not tried - "+(broke ? "the server stopped answering, so the rest wait for the next press" : "stopped"));',
], 'the failed note', pushR());

/* ---- 2. the button stops a run in progress ------------------------------ */
{
  const i = at("$('cloudpush').onclick=()=>{", 'the button handler');
  if (L[i + 1] !== '  Promise.resolve().then(cloudPush).catch(e=>{' || L[i + 2] !== '    try{ $("cloudpush").disabled=false; }catch(_){ }') throw new Error('the handler moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    "$('cloudpush').onclick=()=>{",
    '  /* WHILE A PUSH RUNS, THIS IS ITS STOP. Pictures already on their way',
    '     finish; no new one starts. */',
    '  if(pushRunning){ pushStopAsked=true; $("cloudpush").textContent="Stopping"; $("cloudpush").disabled=true; return; }',
    '  Promise.resolve().then(cloudPush).catch(e=>{',
    '    pushRunning=false; pushStopAsked=false;',
    '    try{ $("cloudpush").textContent="Save to cloud"; $("cloudpush").disabled=false; }catch(_){ }',
  ]);
}

/* ---- 3. the pull: the same breaker, on downloads that could not be reached - */
{
  const fn = kit.inFunction(L, 'async function pullBlob(path,h){');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* why, when given, is told whether a null meant the picture is missing or',
    '   refused (an answer) or that the server could not be reached. */',
    'async function pullBlob(path,h,why){',
    '  for(let attempt=0; attempt<PULL_TRIES; attempt++){',
    '    try{',
    '      const g=await fetch(SB_URL+"/storage/v1/object/traits/"+path,{headers:h});',
    '      if(g.ok) return await g.blob();',
    '      if(g.status===404||g.status===401||g.status===403){ if(why) why.reason="answered"; return null; }',
    '    }catch(_){ }',
    '    if(attempt<PULL_TRIES-1) await new Promise(r=>setTimeout(r,250*(attempt+1)));',
    '  }',
    '  if(why) why.reason="unreachable";',
    '  return null;',
    '}',
  ]);
}
{
  const pullR = () => kit.inFunction(L, 'async function cloudPull(opts){');
  swap('  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false;', ['  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false, streak=0, broke=false;'], 'the pull counters', pullR());
  swap('    while(next<wanted.length && !full){', ['    while(next<wanted.length && !full && !broke){'], 'the puller loop', pullR());
  swap('        const blob=await pullBlob(w.row.path,(await sbHeaders())||h);', [
    '        const bwhy={};',
    '        const blob=await pullBlob(w.row.path,(await sbHeaders())||h,bwhy);',
    '        /* Three downloads in a row that could not reach the server end the',
    '           pull. A missing or refused picture is an answer, not a dead line. */',
    '        if(!blob){ streak = bwhy.reason==="unreachable" ? streak+1 : 0; if(streak>=3) broke=true; }',
    '        else streak=0;',
  ], 'the download', pullR());
  swap('  if(failed) bits.push(failed+" could not be read");', [
    '  if(failed) bits.push(failed+" could not be read");',
    '  if(broke) bits.push("the server stopped answering, so "+(wanted.length-done)+" were left for the next Load");',
  ], 'the pull note', pullR());
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('let pushRunning=false, pushStopAsked=false;');
  once('if(streak>=3) broke=true;', 2);
  once('if(pushRunning){ pushStopAsked=true;');
  once('async function pullBlob(path,h,why){');
  once('if(!activeWs && !failed && !notTried){');
  once('bits.push(failed+" failed - "+pushWhy(reasons))');
  const p = code.indexOf('async function cloudPush(){'), pe = code.indexOf('\n}', p);
  if (code.slice(p, pe).indexOf('$("cloudpush").disabled=true;') >= 0) throw new Error('the push still disables its own stop');
});

fs.renameSync(TMP, FILE);
console.log('patch545 written, ' + grew + ' bytes');
