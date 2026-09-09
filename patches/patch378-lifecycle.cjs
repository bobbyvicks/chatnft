/* THE FOUR THINGS THAT ONLY HAPPEN TO A PHONE.

   A phone tab is frozen when you switch apps, discarded under memory pressure,
   resized every time the URL bar collapses, and attached to a network that
   stalls rather than fails. This page assumes none of that.

   1. NOTHING FLUSHES THE AUTOSAVE WHEN THE TAB GOES AWAY. autosave() debounces
      by 1500 ms and there is no visibilitychange, pagehide, beforeunload or
      freeze listener anywhere in the file - grep gives zero. Put a stroke down,
      get a notification, switch to it, and the write is still sitting in a
      setTimeout. A frozen tab runs no timers and a discarded one never thaws,
      so the stroke is gone; and offerRestore only looks for the unattached
      draft, so if you were editing a SAVED trait there is not even a restore
      bar to say something was missed.

      autosaveNow already exists for exactly this - it is what the debounce
      eventually calls - so this is two listeners, not a mechanism.

   2. THE ONLY COPY OF THE COLLECTION IS IN BEST-EFFORT STORAGE AND NOBODY EVER
      ASKED FOR BETTER. navigator.storage.persist is not mentioned anywhere in
      the file. iOS Safari deletes all script-writable storage for an origin
      after seven days without a visit, and any browser may evict a best-effort
      origin under pressure. Somebody who works on their phone, does not open
      the site for a fortnight and has never pressed Save to cloud comes back to
      an empty shelf with nothing said. Asking is one line and is free; it is a
      request rather than a guarantee, which is why the answer is written into
      the console rather than promised to anyone.

   3. EVERY RESIZE RUNS A FULL-CANVAS getImageData. The listener calls fitZoom,
      which calls contentBox, which is `ctx.getImageData(0,0,W,H)` over the
      whole trait - 6.25 MB read and 1.6 million pixels scanned at the
      collection size. The layout is measured in dvh, so the height genuinely
      changes as the URL bar collapses and expands during an ordinary scroll,
      and the keyboard opening is another one. A burst of those was a burst of
      full-canvas reads. Coalescing them into one frame does not make the scan
      cheaper; it makes twelve of them into one.

   4. AND NO REQUEST HAS A DEADLINE. There is no AbortController and no signal:
      anywhere. The boot handshake awaits sbAuthState with nothing to stop it,
      and a phone's ordinary network failure is not a refused request - it is
      hotel wifi you are associated with that passes no traffic, where the
      request neither succeeds nor fails for minutes. For all of that time the
      page is a sign-in wall with no shelf and no explanation.

      The deadline resolves to {state:"unknown"}, which is a state this code
      already handles and already has a message for. So this adds no new
      behaviour at all - it just stops the wait being unbounded. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 3 and 1: the resize, and the two listeners beside it ------- */
{
  const at = kit.only(L, l => l === "addEventListener('resize',()=>{ if(!$('app').hidden&&zoom<=1) fitZoom(); });",
    'the resize listener');
  kit.replace(L, { start: at, end: at }, [
    '/* COALESCED INTO A FRAME. fitZoom reaches contentBox, which reads the whole',
    '   canvas with getImageData - 6.25 MB and 1.6 million pixels at the',
    '   collection size. The layout is in dvh, so a phone fires resize repeatedly',
    '   as the URL bar collapses during an ordinary scroll, and again when the',
    '   keyboard opens. This does not make the scan cheaper, it makes a dozen of',
    "   them one. Same condition as before, evaluated when the frame runs. */",
    'let fitPending=0;',
    "addEventListener('resize',()=>{",
    '  cancelAnimationFrame(fitPending);',
    "  fitPending=requestAnimationFrame(()=>{ if(!$('app').hidden&&zoom<=1) fitZoom(); });",
    '});',
    '/* THE WRITE THAT WAS STILL IN A TIMER WHEN THE TAB WENT AWAY.',
    '',
    '   autosave() debounces by 1500 ms and nothing in this file listened for the',
    '   tab leaving, so a stroke put down and followed by switching apps was lost:',
    '   a frozen tab runs no timers and a discarded one never comes back. Both',
    '   events, because they answer different questions - visibilitychange fires',
    '   when you switch away and is the one a phone actually delivers, pagehide',
    '   covers the navigation case. autosaveNow clears the pending timer itself,',
    '   so firing twice writes once.',
    '',
    '   This is a best effort and worth saying so: the encode is asynchronous, and',
    '   a tab can be killed before toBlob comes back. It is strictly more than a',
    '   1500 ms timer that will never run. */',
    "addEventListener('pagehide',()=>{ try{ autosaveNow(); }catch(_){} });",
    "document.addEventListener('visibilitychange',()=>{",
    "  if(document.visibilityState==='hidden'){ try{ autosaveNow(); }catch(_){} }",
    '});',
    '/* AND ASK TO KEEP THE COLLECTION. Everything is in IndexedDB, which is',
    '   best-effort by default: iOS Safari clears script-writable storage after',
    '   seven days without a visit, and any browser may evict under pressure. This',
    '   asks for the durable kind. It is a request - Chromium grants it on',
    '   engagement, Safari on a bookmark or Add to Home Screen - so the answer is',
    '   recorded rather than relied on, and Save to cloud remains the real',
    '   backup. */',
    'try{',
    '  if(navigator.storage&&navigator.storage.persist)',
    '    navigator.storage.persist().then(ok=>{',
    '      if(!ok) console.info("Storage is best-effort here: the browser may clear this collection. Save to cloud is the backup.");',
    '    }).catch(()=>{});',
    '}catch(_){}',
  ]);
}

/* ---- 4: a deadline on the boot handshake ------------------------ */
{
  const r = kit.inFunction(L, 'async function cloudRender(){');
  const at = kit.only(L, l => l === '  const a=await sbAuthState();', 'the boot handshake', r);
  kit.replace(L, { start: at, end: at }, [
    '  /* A DEADLINE. Nothing in this file has one - no AbortController, no',
    '     signal: anywhere - and a phone\'s ordinary network failure is a request',
    '     that never answers rather than one that is refused. Without this the',
    '     page is a sign-in wall for as long as the browser is willing to wait,',
    '     which is minutes, with no shelf and nothing said.',
    '',
    '     It resolves to the state this function already handles and already has',
    '     a message for, so a timeout is not a new outcome - it is the existing',
    '     one, arriving in six seconds instead of never. */',
    '  const a=await Promise.race([sbAuthState(),',
    '    new Promise(r=>setTimeout(()=>r({state:"unknown"}),CLOUD_DEADLINE_MS))]);',
  ]);
  /* The number, beside the message it produces. */
  const note = kit.only(L, l => l.indexOf('const CLOUD_UNREACHABLE=') === 0, 'the unreachable message');
  kit.replace(L, { start: note, end: note }, [
    '/* How long the boot handshake may take before it is treated as unreachable.',
    '   Six seconds is long enough that a slow-but-working connection is not cut',
    '   off, and short enough that somebody on a phone is not looking at a wall',
    '   wondering whether to reload. */',
    'const CLOUD_DEADLINE_MS=6000;',
    L[note],
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ script, code, codeLines }) => {
  for (const [re, why] of [
    [/addEventListener\('pagehide',/, 'nothing saves when the page is navigated away from'],
    [/visibilityState==='hidden'/, 'nothing saves when the tab is switched away from'],
    [/navigator\.storage\.persist\(\)/, 'the page never asks to keep the collection'],
    [/requestAnimationFrame\(\(\)=>\{ if\(!\$\('app'\)\.hidden&&zoom<=1\) fitZoom\(\); \}\)/,
      'the resize is still uncoalesced'],
    [/const CLOUD_DEADLINE_MS=6000;/, 'the boot handshake has no deadline'],
  ]) if (!re.test(code)) throw new Error(why);

  /* The deadline is ON the handshake, not merely declared. */
  const cr = kit.inFunction(codeLines, 'async function cloudRender(){');
  const crBody = codeLines.slice(cr.start, cr.end + 1).join('\n');
  if (!/Promise\.race\(\[sbAuthState\(\)/.test(crBody))
    throw new Error('the boot handshake does not race its deadline');
  if (/^\s*const a=await sbAuthState\(\);\s*$/m.test(crBody))
    throw new Error('the unbounded await is still there');
  /* And it resolves to a state the function already handles, or the deadline
     invents an outcome nothing downstream knows about. */
  if (!/a\.state==="unknown"/.test(crBody))
    throw new Error('cloudRender no longer handles the state the deadline produces');

  /* The old single-line listener is gone, not duplicated. */
  const olds = codeLines.filter(l => l === "addEventListener('resize',()=>{ if(!$('app').hidden&&zoom<=1) fitZoom(); });");
  if (olds.length) throw new Error('the uncoalesced resize listener is still registered');
  const resizes = codeLines.filter(l => /addEventListener\('resize'/.test(l));
  if (resizes.length !== 1) throw new Error('there are ' + resizes.length + ' resize listeners');
  void script;
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
