/* THE WORK IS IN THE SMALL PNG, AND THE FIXER WOULD CHANGE IT.

   "these are the saved traits that ive edited and worked on but they saved
   super small"

   They saved at the fixer's native size because that is all there was before
   the 1280 switch. The switch fixes what happens NEXT time; it does nothing
   for the four traits already done, because those files are not sources to be
   fixed - they are finished artwork with hand edits in them, one pixel per
   cell already.

   PUTTING ONE BACK THROUGH THE FIXER DOES NOT RETURN IT. Measured, on a 37x41
   finished image with the pixel size forced to 1, which is the closest thing
   to "do nothing" the tool currently offers:

     size out    37x41, correct
     bytes differing from the input   487 of 6068

   The dimensions come back right and the pixels do not: the engine still
   quantises colour and decides alpha, which is its job and is exactly wrong
   for a picture that is already finished. So "just force pixel size 1" is not
   a recovery path, and offering it would have quietly rewritten the edits.

   SO THERE IS A MODE THAT DOES NOTHING BUT SCALE. Already fixed - scale only:
   no detectors, no quantising, no worker at all. The source pixels go straight
   to the same canvas the 1280 switch writes through, nearest neighbour, so a
   85x85 hand-edited trait becomes 1280x1280 with every pixel it had and
   nothing else. It works in a batch exactly as the fixing mode does, which is
   what makes the four already saved into a drag-and-drop rather than an
   evening.

   WHAT THE READOUT SAYS HERE IS DIFFERENT, and it has to be. In fixing mode
   an uneven division can be answered by choosing another pixel size, so the
   readout offers the sizes that would divide. In scale mode there is nothing
   to choose - the image is the size it is - so it says the division and stops
   rather than offering a choice that does not exist. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the mode, and one place that reads it ----------------------- */
{
  const at = kit.only(L, l => l.indexOf('    <select id="fixmode"') === 0, 'the mode select');
  kit.replace(L, { start: at, end: at }, [
    '    <select id="fixmode" title="Quick looks for the grid and rebuilds the picture at one pixel per cell. Scale only does not look at all - it takes an already-finished piece up to the collection size with its pixels untouched.">' +
      '<option value="fast">Quick - three detectors</option>' +
      '<option value="scale">Already fixed - scale only</option></select>',
  ]);
}
{
  /* ONE READER. Two call sites had the same ternary written out, which is
     two places to forget the new value in. */
  const fn = kit.only(L, l => l === 'function fixSizeHint(){', 'the readout');
  kit.replace(L, { start: fn, end: fn - 1 }, [
    '/* WHICH OF THE THREE THIS IS. "full" is still unbuilt and the select does',
    '   not offer it; it stays here because the worker takes it and a saved',
    '   settings file may carry it. */',
    'function fixMode(){',
    '  const v=$("fixmode")?$("fixmode").value:"fast";',
    '  return v==="scale"?"scale":(v==="full"?"full":"fast");',
    '}',
  ]);
}

/* ---- the readout, which cannot offer a choice that is not there --- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const head = kit.only(L, l => l === '  const step=+$("fixforce").value||0;', 'the step it reads', r);
  if (L[head + 1] !== '  if(!FIX.src||step<=0){ el.textContent=""; return; }')
    throw new Error('the readout does not bail out the way this expects');
  kit.replace(L, { start: head, end: head + 3 }, [
    '  /* SCALE MODE HAS NO PIXEL SIZE. The count is the image itself, so the',
    '     readout works without the field and says the same thing about the',
    '     grid that it says for a fixed result. */',
    '  const scale=fixMode()==="scale";',
    '  const step=+$("fixforce").value||0;',
    '  if(!FIX.src||(!scale&&step<=0)){ el.textContent=""; return; }',
    '  const cols=scale?FIX.src.width:Math.max(1,Math.round(FIX.src.width/step));',
    '  const rows=scale?FIX.src.height:Math.max(1,Math.round(FIX.src.height/step));',
  ]);
  const r2 = kit.inFunction(L, 'function fixSizeHint(){');
  const offer = kit.only(L, l => l.indexOf('        +", so pixels come out uneven"+fixEvenSizes();') === 0,
    'the offer of other sizes', r2);
  kit.replace(L, { start: offer, end: offer }, [
    '        /* NOT IN SCALE MODE: there is no other size to pick, because',
    '           nothing is being detected. Offering one would read as advice',
    '           to go and re-fix a finished picture. */',
    '        +", so pixels come out uneven"+(scale?"":fixEvenSizes());',
  ]);
}

/* ---- the single run ---------------------------------------------- */
{
  const at = kit.only(L, l => l === '  const mode=$("fixmode").value==="fast"?"fast":"full";'
    && true, 'the mode read in the single run', kit.inFunction(L, 'function fixRun(){'));
  kit.replace(L, { start: at, end: at }, ['  const mode=fixMode();']);

  const r = kit.inFunction(L, 'function fixRun(){');
  const after = kit.only(L, l => l === '  $("fixrun").disabled=true; $("fixstop").hidden=false; $("fixacts").hidden=true;', 'the run setup', r);
  kit.replace(L, { start: after, end: after - 1 }, [
    '  /* NOTHING TO ASK. The picture is already one pixel per cell, so there is',
    '     no worker, no detector and no quantiser between it and the save - the',
    '     bytes that came in are the bytes that go out, and the 1280 switch does',
    '     the only thing that happens to them. */',
    '  if(mode==="scale"){',
    '    const r={data:new Uint8ClampedArray(src.data), width:src.width, height:src.height,',
    '      stepX:1, stepY:1, confidence:"none", consensus:"scaled"};',
    '    fixShow(r);',
    '    $("fixaftercap").textContent=r.width+"\\u00d7"+r.height+" real pixels \\u00b7 taken as it is";',
    '    fixSay("Nothing was detected or recoloured. "+fixSaveSize(r));',
    '    $("fixacts").hidden=false; $("fixpair").hidden=false;',
    '    return Promise.resolve(r);',
    '  }',
  ]);
}

/* ---- one place that puts a result on screen ---------------------- */
{
  const at = kit.only(L, l => l === 'function fixDone(w){', 'the tidy-up');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE RESULT, ON SCREEN. Both the detected answer and the scaled-only one',
    '   land here, so there is one place that decides what a result looks like',
    '   and FIX.out cannot be set by one path and drawn by another. */',
    'function fixShow(r){',
    '  FIX.out=r;',
    '  const a=$("fixafter"); a.width=r.width; a.height=r.height;',
    '  const g=a.getContext("2d");',
    '  const im=g.createImageData(r.width,r.height); im.data.set(r.data);',
    '  g.putImageData(im,0,0);',
    '  return a;',
    '}',
    '/* What the save will actually write, said before it is pressed. */',
    'function fixSaveSize(r){',
    '  const on=$("fixgrid")&&$("fixgrid").checked;',
    '  if(!on) return "It will save at "+r.width+"\\u00d7"+r.height+".";',
    '  const k=CANVAS_SIDE/r.width;',
    '  return "It will save at "+CANVAS_SIDE+"\\u00d7"+CANVAS_SIDE',
    '    +(r.width===r.height&&Number.isInteger(k)',
    '      ? " ("+"\\u00d7"+k+", every pixel the same size)."',
    '      : " (pixels come out uneven at this size).");',
    '}',
  ]);
  /* The detected path uses the same writer rather than its own three lines. */
  const r = kit.inFunction(L, 'function fixRun(){');
  const draw = kit.only(L, l => l === '        const r=m.done; FIX.out=r;', 'where the result is taken', r);
  if (L[draw + 1].indexOf('const a=$("fixafter")') < 0 || L[draw + 2].indexOf('createImageData') < 0)
    throw new Error('the result is not drawn where this expects');
  kit.replace(L, { start: draw, end: draw + 2 }, [
    '        const r=m.done; fixShow(r);',
  ]);
}

/* ---- and the batch ------------------------------------------------ */
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const build = kit.only(L, l => l === '  let w=null;', 'where the batch worker is built', r);
  if (L[build + 1].indexOf('try{ w=fixWorker(); }') < 0)
    throw new Error('the batch does not build its worker where this expects');
  kit.replace(L, { start: build, end: build + 2 }, [
    '  /* SCALE MODE BUILDS NO WORKER AT ALL. Parsing 380 KB of engine to then',
    '     ask it nothing would be the one avoidable cost in a run of 500. */',
    '  const mode=fixMode();',
    '  const scale=mode==="scale";',
    '  let w=null;',
    '  if(!scale){',
    '    try{ w=fixWorker(); }catch(e){ fixBatchSay(e.message); $("fixbatchstop").hidden=true; return; }',
    '    fixBatchWorker=w;',
    '  }',
  ]);
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const dup = kit.only(L, l => l === '  const mode=$("fixmode").value==="fast"?"fast":"full";',
    'the second mode read', r2);
  kit.replace(L, { start: dup, end: dup }, []);
  const r3 = kit.inFunction(L, 'async function fixBatch(files){');
  const ask = kit.only(L, l => l === '    const r=await fixAsk(w,{data:new Uint8ClampedArray(px), width:W, height:H,',
    'where the batch asks', r3);
  if (L[ask + 1].indexOf('mode:mode, forceStep:') < 0)
    throw new Error('the batch question is not shaped the way this expects');
  kit.replace(L, { start: ask, end: ask + 1 }, [
    '    /* The same bytes, untouched, when there is nothing to ask. */',
    '    const r=scale ? {ok:{data:px, width:W, height:H, stepX:1, stepY:1}}',
    '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:W, height:H,',
    '        mode:mode, forceStep:forced>0?forced:null});',
  ]);
  const r4 = kit.inFunction(L, 'async function fixBatch(files){');
  const kill = kit.only(L, l => l === '  try{ w.terminate(); }catch(_){}', 'where the batch worker is dropped', r4);
  kit.replace(L, { start: kill, end: kill }, [
    '  if(w) try{ w.terminate(); }catch(_){}',
  ]);
}

/* ---- the controls have to answer the mode ------------------------ */
{
  const at = kit.only(L, l => l === '  $("fixgrid").addEventListener("change",fixSizeHint);', 'the readout wiring');
  kit.replace(L, { start: at, end: at }, [
    '  $("fixgrid").addEventListener("change",fixSizeHint);',
    '  /* The mode decides what the readout means and what the button does, so',
    '     both follow it rather than being set once at load. */',
    '  $("fixmode").addEventListener("change",()=>{ fixModeUI(); fixSizeHint(); });',
  ]);
  const fn = kit.only(L, l => l === 'function fixSizeHint(){', 'the readout again');
  kit.replace(L, { start: fn, end: fn - 1 }, [
    '/* THE BUTTON SAYS WHAT IT DOES, and the pixel size field is put out of the',
    '   way when nothing reads it - a live field that changes nothing is a',
    '   control that lies. */',
    'function fixModeUI(){',
    '  const scale=fixMode()==="scale";',
    '  const b=$("fixrun"); if(b) b.textContent=scale?"Scale it":"Fix it";',
    '  const f=$("fixforce"); if(f){ f.disabled=scale; f.title=scale',
    '    ? "Not used in scale only - the picture is already one pixel per cell."',
    '    : f.title; }',
    '}',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  if (text.indexOf('<option value="scale">') < 0) throw new Error('the mode is not offered');
  /* ONE READER OF THE MODE. The ternary must not survive anywhere. */
  const dup = code.split('\n').filter(l => /\$\("fixmode"\)\.value==="fast"/.test(l));
  if (dup.length) throw new Error(dup.length + ' places still read the mode by hand');

  /* THE SCALE PATH MUST NOT REACH THE ENGINE. That is the whole point: a
     finished picture goes to the canvas with nothing in between. */
  const run = kit.inFunction(codeLines, 'function fixRun(){');
  const body = codeLines.slice(run.start, run.end + 1).join('\n');
  const branch = body.slice(body.indexOf('if(mode==="scale"){'));
  const end = branch.indexOf('return Promise.resolve(r);');
  if (end < 0) throw new Error('the scale branch does not return its own result');
  const inside = branch.slice(0, end);
  if (/fixWorker|postMessage|fixAsk/.test(inside))
    throw new Error('the scale branch still goes to the engine');
  if (!/new Uint8ClampedArray\(src\.data\)/.test(inside))
    throw new Error('the scale branch does not carry the source pixels through');

  /* AND NEITHER MUST THE BATCH, or four hundred finished traits get requantised. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/const scale=mode==="scale";/.test(bb))
    throw new Error('the batch does not know about the mode');
  if (!/scale \? \{ok:\{data:px, width:W, height:H/.test(bb))
    throw new Error('the batch does not pass the pixels straight through');
  if (!/if\(!scale\)\{\n\s+try\{ w=fixWorker\(\); \}/.test(bb))
    throw new Error('the batch builds an engine it will not use');
  if (!/if\(w\) try\{ w\.terminate\(\); \}/.test(bb))
    throw new Error('the batch terminates a worker it may not have built');

  /* ONE WRITER FOR A RESULT ON SCREEN. */
  const show = kit.inFunction(codeLines, 'function fixShow(r){');
  if (!show) throw new Error('there is no one place that shows a result');
  /* DRAWING a result, not sizing the canvas. fixLoad also touches #fixafter -
     it clears it when a new file is chosen - and a bare match on the canvas
     counted that as a second writer. The thing that must be unique is
     putImageData onto it, which is what actually decides what is shown. */
  const drawn = (code.match(/putImageData/g) || []).length;
  const inShow = /g\.putImageData\(im,0,0\);/.test(
    codeLines.slice(show.start, show.end + 1).join('\n'));
  if (!inShow) throw new Error('fixShow does not draw the result');
  const runDraws = /putImageData/.test(body);
  if (runDraws) throw new Error('fixRun still draws the result itself');
  if (drawn < 1) throw new Error('nothing draws a result at all');

  /* THE READOUT MUST NOT OFFER SIZES IN A MODE WITH NO CHOICE. */
  const hint = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb = codeLines.slice(hint.start, hint.end + 1).join('\n');
  if (!/\(scale\?"":fixEvenSizes\(\)\)/.test(hb))
    throw new Error('the readout still offers other pixel sizes in scale mode');
  if (!/const cols=scale\?FIX\.src\.width:/.test(hb))
    throw new Error('the readout still needs a pixel size in scale mode');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
