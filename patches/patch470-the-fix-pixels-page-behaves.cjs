/* THREE THINGS ON THE FIX PIXELS PAGE.

   ONE: A SECOND BATCH STARTED MID-RUN SHARES THE FIRST ONE'S STATE.

   fixBatch has no re-entrancy guard and owns three module-level variables. Its
   preamble does

     fixTilesClear(); fixBatchFiles=[]; fixBatchStop=false;

   so a second call while the first loop is still awaiting: clears
   fixBatchStop, which the first loop re-reads at the top of every iteration -
   so a Stop somebody already pressed is cancelled; replaces the array the
   first loop keeps pushing into BY NAME, so the two runs pile into one list;
   and revokes the first run's thumbnails. Then whichever loop finishes first
   runs the tail unconditionally, hiding the Stop button and enabling "Download
   all" and "Save all to project" while the other is still going - so the two
   buttons act on a list that is still being written.

   A folder of 300 is minutes of work by this file's own note, and the controls
   that start a second run are live the whole time: "Import a folder" sits
   inside the still-visible drop zone, and the zone itself opens a multi-file
   picker.

   fixLoad IS THE OTHER HALF OF THE SAME HOLE. A single image opened mid-run
   does `$("fixbatch").hidden=true`, which takes away the running batch's panel
   AND its Stop button, leaving a run nobody can stop or see.

   So both refuse while a batch is running, with the same sentence, and the
   sentence says what to do. Refusing rather than replacing: fixRun replaces
   because one image is a second of work, and throwing away minutes of a
   three-hundred-image run because somebody clicked the wrong control is not
   the same trade.

   TWO: "IMPORT A FOLDER" CANNOT BE USED FROM THE KEYBOARD.

   #fixfolderbtn is a real button nested inside #fixdrop, which is a div with
   tabindex=0 and role=button. The CLICK path is guarded - the button's onclick
   calls stopPropagation - but the keyboard path is not:

     d.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); f.click(); } };

   A key press on the inner button bubbles to the zone, which opens the plain
   image picker AND calls preventDefault, cancelling the button's own
   activation - so the folder picker is never opened at all. Measured in
   Chromium: Enter on the button opens fixfile, Space opens fixfile, and the
   button's own handler never runs; a mouse click on the same button opens
   fixfolder.

   That matters more than a wrong dialog. The folder picker is where the trait
   CATEGORY comes from - the markup says so two lines up, "the ordinary picker
   hands over bare filenames, so a pile chosen that way has no category to read
   and every trait would land in unsorted."

   THREE: AND ON A PHONE, SIX DROPDOWNS ARE 21 PIXELS TALL.

   The phone block gives controls a 30px floor, but only through selectors
   scoped to .opts, .card and .crow. #fixmode sits in .agjob, and the four rule
   and review pickers sit in .olrow, so none of them matches - measured at
   375x812: #fixmode 21px, #rulea 21px, #ruleb 21px, #revtrait 21px, #revlayer
   21px, #fixforce 24px, against every other select on that viewport at 30 or
   more.

   The fix is a bare `select` floor rather than two more container names, and
   that is the point of it: a container list is a list of the places somebody
   remembered, and this is the second time it has come up short. A bare
   selector is weaker than every existing one, so the rules that already size a
   select still win where they apply. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. one batch at a time ---- */
{
  const at = kit.only(L, l => l === 'async function fixBatch(files){', 'the batch');
  kit.replace(L, { start: at, end: at }, [
    '/* WHETHER A BATCH IS RUNNING. fixBatch owns three module-level variables and',
    '   had no re-entrancy guard, so a second run cleared the Stop flag of the',
    '   first, took over the array it was pushing into, revoked its thumbnails,',
    '   and let whichever loop finished first enable Download all over a list the',
    '   other was still writing. */',
    'let fixBatchRunning=false;',
    '/* Said in one place, because two controls reach it and the answer is the',
    '   same from both. */',
    'const FIX_BATCH_BUSY="A folder is still being fixed. Press Stop first.";',
    'async function fixBatch(files){',
    '  if(fixBatchRunning){ fixSay(FIX_BATCH_BUSY); return; }',
    '  fixBatchRunning=true;',
    '  try{ return await fixBatchRun(files); }',
    '  finally{ fixBatchRunning=false; }',
    '}',
    '/* The run itself, unchanged. Split out so the flag is cleared on every way',
    '   out of it, including a throw - a flag left set by an error would refuse',
    '   every later folder for the rest of the session. */',
    'async function fixBatchRun(files){',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(FIX.worker) fixDone(FIX.worker);', 'the fixer load worker stop');
  kit.replace(L, { start: at, end: at }, [
    '  /* AND NOT DURING A BATCH. Opening one image does $("fixbatch").hidden=true,',
    '     which takes the panel and the Stop button away from a running batch - a',
    '     run nobody can see or stop. The same sentence fixBatch gives, because',
    '     it is the same answer. */',
    '  if(fixBatchRunning){ fixSay(FIX_BATCH_BUSY); return false; }',
    '  if(FIX.worker) fixDone(FIX.worker);',
  ]);
}

/* ---- 2. the folder button answers to the keyboard ---- */
{
  const at = kit.only(L, l => l === '  d.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); f.click(); } };',
    'the dropzone keydown');
  kit.replace(L, { start: at, end: at }, [
    '  /* ONLY WHEN THE ZONE ITSELF HAS THE KEY. #fixfolderbtn is a real button',
    '     nested inside this div, and its CLICK is guarded by a stopPropagation',
    '     that this had no equivalent of - so Enter on the button bubbled here,',
    '     opened the plain image picker, and preventDefault cancelled the',
    '     activation of the button itself, so the folder picker never opened.',
    '',
    '     Which matters because the folder is where the trait category comes from:',
    '     a pile chosen the other way has no category to read and lands in',
    '     unsorted. */',
    '  d.onkeydown=e=>{',
    '    if(e.target!==d) return;',
    '    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); f.click(); }',
    '  };',
  ]);
}

/* ---- 3. and a dropdown on a phone is big enough to press ---- */
{
  const at = kit.only(L, l => l === '  .opts select,.opts input[type=number],.opts input[type=text],',
    'the phone control sizing');
  kit.replace(L, { start: at, end: at }, [
    '  /* EVERY SELECT, not another list of containers. The rules below size the',
    '     ones inside .opts, .card and .crow, and six were outside all three -',
    '     #fixmode in .agjob and the rule and review pickers in .olrow - so they',
    '     took the browser default: measured 21px at 375x812, against 30 or more',
    '     for every other select on that viewport.',
    '',
    '     A container list is a list of the places somebody remembered, and this',
    '     is the second time it has come up short. A bare selector is weaker than',
    '     every rule below it, so anything already sized stays exactly as it was. */',
    '  select{min-height:30px; padding:6px 7px;}',
    '  .opts select,.opts input[type=number],.opts input[type=text],',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* ONE BATCH AT A TIME, and the flag clears on every way out. */
  if (!/let fixBatchRunning=false;/.test(code))
    throw new Error('there is nothing saying a batch is running');
  if (!/if\(fixBatchRunning\)\{ fixSay\(FIX_BATCH_BUSY\); return; \}/.test(code))
    throw new Error('a second folder still takes over the first run');
  if (!/finally\{ fixBatchRunning=false; \}/.test(code))
    throw new Error('a throw would leave the flag set and refuse every later folder');
  const fl = kit.inFunction(codeLines, 'async function fixLoad(file){');
  if (!/if\(fixBatchRunning\)\{ fixSay\(FIX_BATCH_BUSY\); return false; \}/
    .test(codeLines.slice(fl.start, fl.end + 1).join('\n')))
    throw new Error('one image opened mid-run still hides the batch Stop button');
  /* The guard has to come BEFORE the run touches anything it shares. */
  const fb = kit.inFunction(codeLines, 'async function fixBatchRun(files){');
  const fbb = codeLines.slice(fb.start, fb.end + 1).join('\n');
  if (/fixBatchRunning/.test(fbb))
    throw new Error('the guard moved inside the run, where it cannot refuse anything');
  if (!/fixBatchFiles=\[\]; fixBatchStop=false;/.test(fbb))
    throw new Error('the run no longer resets the state the guard protects');

  /* THE FOLDER BUTTON ANSWERS TO THE KEYBOARD. */
  if (!/d\.onkeydown=e=>\{\n    if\(e\.target!==d\) return;/.test(code))
    throw new Error('a key on the inner button is still hijacked by the dropzone');
  if (!/if\(e\.key==="Enter"\|\|e\.key===" "\)\{ e\.preventDefault\(\); f\.click\(\); \}/.test(code))
    throw new Error('the dropzone no longer answers to the keyboard at all');

  /* AND A SELECT IS BIG ENOUGH TO PRESS. A bare selector, so it is weaker than
     everything below it and changes nothing that was already sized. */
  /* \r?\n, because this file is CRLF and a bare \n matches nothing after a
     carriage return - the kind of no-op that reads as a passing check. It read
     as one here, and the assertion caught it. */
  if (!/\r?\n  select\{min-height:30px; padding:6px 7px;\}\r?\n/.test(text))
    throw new Error('the selects outside .opts, .card and .crow are still 21px');
  if (text.indexOf('  select{min-height:30px; padding:6px 7px;}')
      > text.indexOf('  .opts select,.opts input[type=number],.opts input[type=text],'))
    throw new Error('the floor sits after the specific rules, where order stops mattering');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
