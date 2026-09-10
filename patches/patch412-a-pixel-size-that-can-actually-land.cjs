/* A PIXEL SIZE OF 12 ON A 1280 CANVAS CANNOT PRODUCE A PIXEL.

   "when i imput a folder it just makes it 1x1 every time no matter what i put
   into the pixel sizing" / "it only keeps pixels 1x1 did you even try turning
   it to 12x12 and checking?"

   Turning it to 12 and checking is exactly what was missing. Measured, three
   real skins through the folder import, reading the BLOCK SIZE of what comes
   out rather than the canvas size - 1280x1280 is 1280x1280 whether its pixels
   are eight across or one:

     snap on, field 0 (the shipped default)   canvas 1280   pixel size 8
     snap off, field 12                       canvas 1280   pixel size 1
     snap off, field 8                        canvas 1280   pixel size 8
     snap off, field 0 (detect)               canvas 1280   pixel size 1

   1280/12 is 106.67, so 12 gives 106 or 107 cells, and scaling 107 cells onto
   a 1280 canvas makes blocks 11.96 pixels wide - which is not a block, it is a
   ragged edge every twelfth pixel. The picture comes back at full resolution
   with nothing square in it. Same for a detected count that happens not to
   divide 1280.

   The old readout said this - "1280/85 is 15.06, so pixels come out uneven" -
   and it never appeared here, because it is written by fixSizeHint off
   FIX.src, and a folder import never sets FIX.src. So the one path where a
   size is applied to three hundred files at once was the one path with no
   warning at all.

   SO A SIZE THAT CANNOT LAND IS MOVED TO ONE THAT CAN. Asked for 12 on a 1280
   source, this uses 10: the nearest cell count that divides 1280 is 128, and
   1280/128 is 10 exactly. The number actually used is SAID, per run, rather
   than the request being silently honoured into mush.

   ONLY WHEN THE 1280 SWITCH IS ON, because that is the only time a cell count
   has to divide anything. With the switch off the output is its own size and
   every step is whole by construction.

   THE SNAP IS UNAFFECTED and still the default: it lands on the project's
   grid, which already divides the canvas. This is for the case where somebody
   turns the snap off and types a size, which is the case that produced a
   folder of ruined skins. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- a step that gives whole blocks -------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixStepFor(w){', 'the step decider');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE CELL COUNTS THAT CAN LAND ON THE COLLECTION CANVAS.',
    '',
    '   A count only gives square pixels at CANVAS_SIDE if it divides it, so',
    '   these are the divisors and there are eighteen of them. Computed rather',
    '   than listed, so changing CANVAS_SIDE cannot leave a stale table behind. */',
    'function fixCanvasCounts(){',
    '  const out=[];',
    '  for(let n=1;n<=CANVAS_SIDE;n++) if(CANVAS_SIDE%n===0) out.push(n);',
    '  return out;',
    '}',
    '/* THE NEAREST SIZE THAT ACTUALLY WORKS, and whether it moved.',
    '',
    '   Asked for 12 on a 1280 source: 1280/12 is 106.67, the nearest count',
    '   that divides 1280 is 128, and 1280/128 is 10. So 12 becomes 10 and the',
    '   blocks are square. Nearest by COUNT rather than by pixel size, because',
    '   the count is what has to divide the canvas.',
    '',
    '   TWO THINGS HAVE TO HOLD OR THE MOVE IS WORSE THAN THE PROBLEM.',
    '',
    '   The new step must be a WHOLE number of source pixels. A first version',
    '   only required the count to divide the canvas, and on a 96px source it',
    '   turned a request for 4 into 4.8 - a fractional step on a picture drawn',
    '   in whole 4px blocks, which slices every one of them. Requiring the',
    '   source to divide by the count is what keeps the sampling clean at both',
    '   ends.',
    '',
    '   And it must be NEAR what was asked. 1020 at 12 wants 85 cells, and the',
    '   only counts dividing both 1020 and 1280 are 1, 2, 4, 5, 10 and 20 - so',
    '   the nearest is 20, which is not a correction, it is a different',
    '   picture. Past a quarter off, nothing is moved and the readout goes back',
    '   to naming the sizes that would work, which is what it did before.',
    '',
    '   Returns null when nothing needs doing or nothing sensible is available,',
    '   so a caller can tell "fine" from "moved" without comparing floats. */',
    'const WHOLE_STEP_NEAR=0.25;',
    'function fixWholeStep(w,step){',
    '  if(!(w>0)||!(step>0)) return null;',
    '  const want=Math.max(1,Math.round(w/step));',
    '  if(CANVAS_SIDE%want===0) return null;',
    '  let best=null;',
    '  for(const n of fixCanvasCounts()){',
    '    if(w%n!==0) continue;',
    '    const d=Math.abs(n-want);',
    '    if(!best||d<best.d||(d===best.d&&n>best.n)) best={n:n,d:d};',
    '  }',
    '  if(!best) return null;',
    '  if(best.d>want*WHOLE_STEP_NEAR) return null;',
    '  return {cols:best.n, step:w/best.n, was:want};',
    '}',
  ]);
  const r = kit.inFunction(L, 'function fixStepFor(w){');
  const ret = kit.only(L, l => l === '  return +$("fixforce").value||0;', 'what a typed size gives', r);
  kit.replace(L, { start: ret, end: ret }, [
    '  const typed=+$("fixforce").value||0;',
    '  /* A TYPED SIZE THAT CANNOT LAND IS MOVED, and only while the result is',
    '     going onto the collection canvas - with the switch off the output is',
    '     its own size and every step is whole already. See patch412. */',
    '  const grid=$("fixgrid")&&$("fixgrid").checked;',
    '  if(grid&&typed>0){',
    '    const fix=fixWholeStep(w,typed);',
    '    if(fix){ fixMoved={from:typed, to:fix.step, cols:fix.cols, was:fix.was}; return fix.step; }',
    '  }',
    '  return typed;',
  ]);
  /* Somewhere to remember it, beside the thing that sets it. */
  const decl = kit.only(L, l => l === 'const SNAP_MIN_STEP=4;', 'the snap floor');
  kit.replace(L, { start: decl, end: decl }, [
    'const SNAP_MIN_STEP=4;',
    '/* What the last step decision had to change, so the run can say so. Set by',
    '   fixStepFor and read by whoever reports; cleared at the start of a run so',
    '   it cannot describe the one before. */',
    'let fixMoved=null;',
  ]);
}

/* ---- and every run says which size it used ------------------------- */
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '  fixTilesClear();', 'where a batch resets', r);
  kit.replace(L, { start: at, end: at }, [
    '  fixMoved=null;',
    '  fixTilesClear();',
  ]);
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const say = kit.only(L, l => l.indexOf('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"') === 0,
    'what a batch says at the end', r2);
  kit.replace(L, { start: say, end: say }, [
    '  /* THE SIZE ACTUALLY USED, when it is not the one that was asked for. A',
    '     folder import is the one path with no readout - fixSizeHint writes off',
    '     FIX.src and a batch never sets it - so three hundred files could take a',
    '     size that cannot land and say nothing at all. */',
    '  const movedNote = fixMoved',
    '    ? " \\u00b7 pixel size "+(Math.round(fixMoved.to*100)/100)+" was used, not "',
    '      +fixMoved.from+": "+fixMoved.was+" cells does not divide "+CANVAS_SIDE',
    '      +", and "+fixMoved.cols+" does"',
    '    : "";',
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote',
  ]);
}

/* ---- the single run too -------------------------------------------- */
{
  const r = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l === '  const forced=fixStepFor(FIX.src?FIX.src.width:0);', 'the single step', r);
  kit.replace(L, { start: at, end: at }, [
    '  fixMoved=null;',
    '  const forced=fixStepFor(FIX.src?FIX.src.width:0);',
  ]);
}

/* ---- and the readout, before the button is pressed ----------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  const cols=scale?FIX.src.width:(snap?g.cells:Math.max(1,Math.round(FIX.src.width/step)));',
    'the column count', r);
  if (L[at + 1].indexOf('const rows=scale?FIX.src.height:') < 0)
    throw new Error('the row count is not where this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* THE COUNT THE RUN WILL ACTUALLY USE, moved size and all - a readout',
    '     that describes the request rather than the answer is worse than none. */',
    '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    '  const moved=(!scale&&!snap&&gridOn&&step>0)?fixWholeStep(FIX.src.width,step):null;',
    '  const cols=scale?FIX.src.width:(snap?g.cells:(moved?moved.cols',
    '    :Math.max(1,Math.round(FIX.src.width/step))));',
    '  const rows=scale?FIX.src.height:(snap?g.cells:(moved?moved.cols',
    '    :Math.max(1,Math.round(FIX.src.height/step))));',
  ]);
  const r2 = kit.inFunction(L, 'function fixSizeHint(){');
  const out = kit.only(L, l => l === '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note;',
    'what the readout writes', r2);
  kit.replace(L, { start: out, end: out }, [
    '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note',
    '    +(moved?" \\u00b7 pixel size "+(Math.round(moved.step*100)/100)+", not "+step',
    '      +": "+moved.was+" cells does not divide "+CANVAS_SIDE:"");',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE COUNTS ARE DERIVED, so changing the canvas cannot strand a table. */
  const cc = kit.inFunction(codeLines, 'function fixCanvasCounts(){');
  const ccb = codeLines.slice(cc.start, cc.end + 1).join('\n');
  if (!/CANVAS_SIDE%n===0/.test(ccb))
    throw new Error('the valid counts are not derived from the canvas');
  if (/\[1,2,4,5,8/.test(ccb)) throw new Error('the counts are a written-down list');

  /* THE MOVE ONLY HAPPENS WHEN IT HAS TO. A size that already lands must be
     left exactly alone, or every run quietly changes what was asked for. */
  const ws = kit.inFunction(codeLines, 'function fixWholeStep(w,step){');
  const wsb = codeLines.slice(ws.start, ws.end + 1).join('\n');
  if (!/if\(CANVAS_SIDE%want===0\) return null;/.test(wsb))
    throw new Error('a size that already lands is still moved');
  if (!/return \{cols:best\.n, step:w\/best\.n, was:want\};/.test(wsb))
    throw new Error('the moved step is not the width over a whole count');
  /* A WHOLE STEP AT BOTH ENDS. Requiring only that the count divide the canvas
     turned a request for 4 into 4.8 on a 96px source - a fractional step on a
     picture drawn in whole 4px blocks, which slices every one of them. */
  if (!/if\(w%n!==0\) continue;/.test(wsb))
    throw new Error('the moved step can be a fraction of a source pixel');
  /* AND NEAR WHAT WAS ASKED. Without this, 1020 at 12 jumps from 85 cells to
     20 - not a correction, a different picture. */
  if (!/if\(best\.d>want\*WHOLE_STEP_NEAR\) return null;/.test(wsb))
    throw new Error('a move of any distance is accepted');
  if (!/const WHOLE_STEP_NEAR=0\.25;/.test(code))
    throw new Error('how near a move has to be is not named');

  /* AND ONLY WHILE THE RESULT GOES ONTO THE COLLECTION CANVAS. */
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w){');
  const sfb = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/const grid=\$\("fixgrid"\)&&\$\("fixgrid"\)\.checked;/.test(sfb))
    throw new Error('the move ignores whether the save is going to the canvas');
  if (!/if\(grid&&typed>0\)\{/.test(sfb))
    throw new Error('the move is not gated on the switch and a typed size');
  /* The snap is untouched - it already lands on the project grid. */
  if (!/const s=fixSnapStep\(w\);/.test(sfb))
    throw new Error('the snap path changed');

  /* IT IS SAID. A folder import was the one path with no readout at all. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/const movedNote = fixMoved/.test(bb))
    throw new Error('a batch does not say which size it used');
  if (!/fixMoved=null;/.test(bb))
    throw new Error('a batch can report the size the previous run moved');
  const run = kit.inFunction(codeLines, 'function fixRun(){');
  if (!/fixMoved=null;/.test(codeLines.slice(run.start, run.end + 1).join('\n')))
    throw new Error('a single run can report a stale move');
  /* And before the button, not only after. */
  const hint = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb = codeLines.slice(hint.start, hint.end + 1).join('\n');
  if (!/const moved=\(!scale&&!snap&&gridOn&&step>0\)\?fixWholeStep\(FIX\.src\.width,step\):null;/.test(hb))
    throw new Error('the readout does not work out what the run will use');
  if (!/moved\?moved\.cols/.test(hb))
    throw new Error('the readout still describes the request rather than the answer');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
