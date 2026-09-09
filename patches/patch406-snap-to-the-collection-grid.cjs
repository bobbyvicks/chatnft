/* THE FIXER WAS GUESSING A GRID THE COLLECTION ALREADY KNOWS.

   "the grid output now shrinks the traits where as before it made it to the
   grid, i want it to be back to what it was in the sense where saves the trait
   in 1280x1280" and "im resizing all traits to 1280x1280 so optimize for that"

   WHAT WAS ACTUALLY WRONG, measured on the real library rather than guessed.
   The 1280 save keeps position and size exactly - the content's bounding box
   as a fraction of the canvas is identical in the source and in the save, on
   every trait tried. Nothing shrinks in that sense. What was wrong is the CELL
   COUNT the detectors landed on:

     trait                     detected     px per cell at 1280
     Full Send Green Hoodie    212x211      6.04   (and not square)
     Dogecoin Polo             256x256      5
     Binance Bucket Hat        128x128      10
     Supreme Hoodie (1254)     83x84        15.42  (and not square)
     Wall Street Suit (1254)   113x107      11.33  (and not square)

   The collection's grid is 160 cells on a 1280 canvas - 8 real pixels each.
   An answer of 212 cells writes 6.04-pixel blocks onto a canvas whose grid is
   8, so the art's pixels come out SMALLER than the grid squares and land
   between them. Same overall size, finer blocks, off the grid. That is the
   shrinking, and counting the blocks says it plainly: of the 160x160 grid
   squares in the saved file, 1871 held more than one colour. On the grid,
   that number is zero.

   SO IT STOPS GUESSING. The source is 1280 and the grid is known, so the
   pixel size is not something to detect - it is 1280/160. Snap is a switch,
   on by default, and it forces the step instead of running the detectors.

   MEASURED, on real traits, snapped against detected:

     grid squares holding more than one colour   1871, 1228, 1047, 174  ->  0, 0, 0, 0
     time per trait                              3791, 1246, 1084, 1131 ms
                                                 ->  389, 399, 246, 361 ms

   Three to ten times faster, because detection is the expensive part and
   there is nothing left to detect. Over 320 traits that is about ten minutes
   down to two, which is the "optimize for that".

   WHY 160 AND NOT 80. The collection declares 80 (scripts/ingest.mjs, SIZE
   1254, C = SIZE/80) and a memory note records native ~80-82 measured on the
   1254 files. That was true of the 1254 originals and is NOT true of the
   library as it stands now: resized to 1280, the art carries finer detail,
   and forcing 80 destroys it. Measured, source colours against the result:

     Full Send Green Hoodie   26 source  ->  31 at 160,   5 at 80
     Dogecoin Polo            16 source  ->  16 at 160,  14 at 80
     Bad Time Eyes             8 source  ->   8 at 160,   5 at 80

   Five colours out of twenty-six is a flattened trait. So the target is the
   project's own cell count - projectGrid, which is 160 - and not a number
   from a note about the files as they used to be. It is read from the
   setting, so changing the project's grid changes this, and a grid that does
   not divide 1280 is SAID rather than quietly producing uneven blocks.

   ANY SOURCE SIZE, not only 1280. The step is width/cells, so a 1254 file
   still lands on exactly 160 cells and still saves as 8-pixel blocks - the
   snap normalises the size difference rather than depending on it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the switch --------------------------------------------------- */
{
  const at = kit.only(L, l => l === '      <span>Save at 1280×1280</span></label>', 'the save switch');
  kit.replace(L, { start: at, end: at }, [
    '      <span>Save at 1280×1280</span></label>',
    '    <!-- THE GRID IS KNOWN, so it is not detected. See patch406 for what',
    '         the detectors landed on instead and what that cost. -->',
    '    <label class="olrow" style="gap:6px"',
    '      title="Use the collection\'s own cell grid instead of working it out. Every pixel comes out the same size and lands on the grid, and it is several times faster because nothing has to be detected.">',
    '      <input type="checkbox" id="fixsnap" checked>',
    '      <span id="fixsnaplab">Snap to the grid</span></label>',
  ]);
}

/* ---- one place that decides the pixel size ------------------------ */
{
  const at = kit.only(L, l => l === 'function fixMode(){', 'the mode reader');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE COLLECTION\'S CELL COUNT, and whether it can be honoured on this',
    '   canvas. A grid that does not divide CANVAS_SIDE cannot give equal',
    '   blocks, and saying so is better than writing uneven ones and calling it',
    '   snapped. */',
    'function fixGridCells(){',
    '  const g=Math.max(1,projectGrid|0);',
    '  return {cells:g, exact:Number.isInteger(CANVAS_SIDE/g), per:CANVAS_SIDE/g};',
    '}',
    'function fixSnapping(){',
    '  const b=$("fixsnap");',
    '  return !!(b&&b.checked)&&fixMode()==="fast";',
    '}',
    '/* HOW MUCH SOURCE ONE CELL NEEDS BEFORE SNAPPING MEANS ANYTHING.',
    '',
    '   Snapping says "this picture is a trait drawn on the collection grid".',
    '   That is a statement about the SOURCE, and it stops being true when the',
    '   source is too small to carry the grid: 160 cells out of a 48-pixel',
    '   image is a step of 0.3, which is not a pixel size at all, and out of a',
    '   512 it is 3.2 - fine enough to slice the real blocks in half and invent',
    '   detail that is not there. Four real pixels a cell is the floor, so the',
    '   collection canvas at 1280 gives 8 and the old 1254 gives 7.8, while',
    '   anything under 640 falls through to the detectors, which is what they',
    '   are for. */',
    'const SNAP_MIN_STEP=4;',
    '/* THE STEP FOR ONE PICTURE. Snapped, it is the width over the cell count -',
    '   so any source size lands on exactly that many cells and the size',
    '   difference is normalised rather than depended on. Not snapped, it is',
    '   whatever was typed, and 0 still means "work it out". */',
    'function fixSnapStep(w){',
    '  if(!w||w<=0) return 0;',
    '  const g=fixGridCells();',
    '  if(!g.exact) return 0;',
    '  const s=w/g.cells;',
    '  return s>=SNAP_MIN_STEP ? s : 0;',
    '}',
    'function fixStepFor(w){',
    '  if(fixSnapping()){',
    '    const s=fixSnapStep(w);',
    '    if(s>0) return s;',
    '    /* Too small for the grid: fall through to what was typed, which is',
    '       usually 0 and means the detectors answer it. */',
    '  }',
    '  return +$("fixforce").value||0;',
    '}',
  ]);
}

/* ---- the single run ----------------------------------------------- */
{
  const r = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l === '  const forced=+$("fixforce").value||0;', 'the forced step in the run', r);
  kit.replace(L, { start: at, end: at }, [
    '  const forced=fixStepFor(FIX.src?FIX.src.width:0);',
  ]);
}

/* ---- and the batch, per file -------------------------------------- */
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '  const forced=+$("fixforce").value||0;', 'the forced step in the batch', r);
  /* SUPERSEDES a single read before the loop: snapped, the step is a function
     of each picture's width, so a batch of mixed sizes needs it per file. */
  kit.replace(L, { start: at, end: at }, [
    '  /* Read per file below, not once here: snapped, the step is the width',
    '     over the cell count, so a batch of mixed sizes has a different step',
    '     for each one and still lands them all on the same grid. */',
  ]);
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const ask = kit.only(L, l => l === '    const r=scale ? {ok:{data:px, width:W, height:H, stepX:1, stepY:1}}',
    'where the batch asks', r2);
  if (L[ask + 2].indexOf('mode:mode, forceStep:forced>0?forced:null});') < 0)
    throw new Error('the batch question is not shaped the way this expects');
  kit.replace(L, { start: ask + 2, end: ask + 2 }, [
    '        mode:mode, forceStep:(()=>{ const s=fixStepFor(W); return s>0?s:null; })()});',
  ]);
}

/* ---- what the readout says ---------------------------------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  const scale=fixMode()==="scale";', 'the readout mode', r);
  kit.replace(L, { start: at, end: at }, [
    '  const scale=fixMode()==="scale";',
    '  /* THE READOUT FOLLOWS THE SAME RULE AS THE RUN. Saying 160 while the run',
    '     falls through to the detectors - because the picture is too small to',
    '     carry the grid - would describe a different answer than the one about',
    '     to be produced. */',
    '  const wantSnap=fixSnapping();',
    '  const snap=wantSnap&&fixSnapStep(FIX.src?FIX.src.width:0)>0;',
    '  const g=fixGridCells();',
    '  /* BEFORE THE BAIL-OUT BELOW, and that is the whole reason it sits here.',
    '     An impossible grid produces no step, so the "nothing to say" line',
    '     further down returns an empty readout and the warning never runs -',
    '     silence in exactly the case that most needs a sentence. */',
    '  if(FIX.src&&wantSnap&&!g.exact){',
    '    el.textContent="\\u2192 the "+g.cells+" cell grid does not divide "+CANVAS_SIDE',
    '      +" evenly, so blocks would come out uneven - turn Snap off, or set a grid that divides it";',
    '    return;',
    '  }',
  ]);
  const r2 = kit.inFunction(L, 'function fixSizeHint(){');
  const step = kit.only(L, l => l === '  if(!FIX.src||(!scale&&step<=0)){ el.textContent=""; return; }',
    'the readout bail-out', r2);
  kit.replace(L, { start: step, end: step }, [
    '  if(!FIX.src||(!scale&&!snap&&step<=0)){ el.textContent=""; return; }',
  ]);
  const r3 = kit.inFunction(L, 'function fixSizeHint(){');
  const cols = kit.only(L, l => l === '  const cols=scale?FIX.src.width:Math.max(1,Math.round(FIX.src.width/step));',
    'the column count', r3);
  if (L[cols + 1] !== '  const rows=scale?FIX.src.height:Math.max(1,Math.round(FIX.src.height/step));')
    throw new Error('the row count is not where this expects');
  kit.replace(L, { start: cols, end: cols + 1 }, [
    '  /* SNAPPED, THE COUNT IS THE GRID, whatever the source measures - that is',
    '     the whole point of it. g is declared above, with the check that has to',
    '     run before the bail-out. */',
    '  const cols=scale?FIX.src.width:(snap?g.cells:Math.max(1,Math.round(FIX.src.width/step)));',
    '  const rows=scale?FIX.src.height:(snap?g.cells:Math.max(1,Math.round(FIX.src.height/step)));',
  ]);
}

/* ---- the controls follow the switch -------------------------------- */
{
  const r = kit.inFunction(L, 'function fixModeUI(){');
  const at = kit.only(L, l => l === '  const scale=fixMode()==="scale";', 'the mode ui', r);
  if (L[at + 2].indexOf('const f=$("fixforce"); if(f){ f.disabled=scale;') < 0)
    throw new Error('the mode ui does not disable the field where this expects');
  kit.replace(L, { start: at, end: at }, [
    '  const scale=fixMode()==="scale";',
    '  /* SNAPPED, THE FIELD DECIDES NOTHING EITHER. A live box that changes no',
    '     answer is a control that lies, which is why scale already turns it',
    '     off and why this has to as well. */',
    '  const snap=fixSnapping()&&fixSnapStep(FIX.src?FIX.src.width:0)>0;',
    '  const g=fixGridCells();',
    '  const lab=$("fixsnaplab");',
    '  if(lab) lab.textContent="Snap to the "+g.cells+" cell grid";',
  ]);
  const r2 = kit.inFunction(L, 'function fixModeUI(){');
  const f = kit.only(L, l => l.indexOf('  const f=$("fixforce"); if(f){ f.disabled=scale;') === 0,
    'where the field is disabled', r2);
  /* The tail of this line opens the ternary that the next two lines close.
     A replacement that kept only the first half left `? ...` dangling and the
     save refused it - which is what new Function() in kit.save is for. */
  kit.replace(L, { start: f, end: f }, [
    '  const f=$("fixforce"); if(f){ f.disabled=scale||snap; f.title=scale',
  ]);
  const r3 = kit.inFunction(L, 'function fixModeUI(){');
  const t = kit.only(L, l => l === '    ? "Not used in scale only - the picture is already one pixel per cell."',
    'the field title', r3);
  kit.replace(L, { start: t, end: t }, [
    '    ? "Not used in scale only - the picture is already one pixel per cell."',
    '    : snap',
    '    ? "Not used while Snap is on - the pixel size comes from the "+g.cells+" cell grid."',
  ]);
  /* And the switch itself has to redraw both. */
  const wire = kit.only(L, l => l === '  $("fixmode").addEventListener("change",()=>{ fixModeUI(); fixSizeHint(); });',
    'the mode wiring');
  kit.replace(L, { start: wire, end: wire }, [
    '  $("fixmode").addEventListener("change",()=>{ fixModeUI(); fixSizeHint(); });',
    '  $("fixsnap").addEventListener("change",()=>{ fixModeUI(); fixSizeHint(); });',
    '  /* ONCE AT THE START TOO. Everything fixModeUI writes - the button, the',
    '     disabled box, the grid in the label - was only ever written when',
    '     something CHANGED, so on a fresh page the switch read "Snap to the',
    '     grid" without saying which and the box looked live while snapping',
    '     decided the size. The state has to be drawn before it is touched. */',
    '  fixModeUI();',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  if (text.indexOf('id="fixsnap"') < 0) throw new Error('there is no switch');
  if (!/<input type="checkbox" id="fixsnap" checked>/.test(text))
    throw new Error('the switch is not on by default, which is the stated workflow');

  /* ONE PLACE DECIDES THE STEP. Two would drift, and the batch is the one
     that matters for 320 traits. */
  const sn2 = kit.inFunction(codeLines, 'function fixSnapStep(w){');
  const snb = codeLines.slice(sn2.start, sn2.end + 1).join('\n');
  if (!/const s=w\/g\.cells;/.test(snb))
    throw new Error('the snapped step is not the width over the cell count');
  /* A PICTURE TOO SMALL TO CARRY THE GRID MUST NOT BE FORCED ONTO IT. 160
     cells out of a 48-pixel image is a step of 0.3, which is not a pixel
     size; out of 512 it is 3.2, fine enough to slice the real blocks and
     invent detail. Below the floor it falls through to the detectors. */
  if (!/return s>=SNAP_MIN_STEP \? s : 0;/.test(snb))
    throw new Error('there is no floor under the snapped step');
  if (!/const SNAP_MIN_STEP=4;/.test(code))
    throw new Error('the floor is not named');
  if (!/if\(!g\.exact\) return 0;/.test(snb))
    throw new Error('a grid that cannot divide the canvas still snaps');
  const st = kit.inFunction(codeLines, 'function fixStepFor(w){');
  const sb = codeLines.slice(st.start, st.end + 1).join('\n');
  if (!/const s=fixSnapStep\(w\);/.test(sb))
    throw new Error('the step decider does not go through the snap');
  /* AND THE READOUT SAYS WHAT THE RUN WILL DO, not what the switch says. */
  const hint2 = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb2 = codeLines.slice(hint2.start, hint2.end + 1).join('\n');
  if (!/const snap=wantSnap&&fixSnapStep\(FIX\.src\?FIX\.src\.width:0\)>0;/.test(hb2))
    throw new Error('the readout can claim a grid the run will not use');
  if (!/if\(FIX\.src&&wantSnap&&!g\.exact\)\{/.test(hb2))
    throw new Error('an impossible grid is silenced by the flag that narrows it');
  /* AND IT RUNS BEFORE THE BAIL-OUT. An impossible grid produces no step, so
     the "nothing to say" line returns an empty readout - putting the warning
     after it means silence in exactly the case that needs a sentence, which
     is how it was written the first time. */
  const warnAt = hb2.indexOf('does not divide "+CANVAS_SIDE');
  const bailAt = hb2.indexOf('el.textContent=""; return;');
  if (warnAt < 0 || bailAt < 0 || warnAt > bailAt)
    throw new Error('the impossible-grid warning sits after the bail-out that swallows it');
  const run = kit.inFunction(codeLines, 'function fixRun(){');
  if (!/const forced=fixStepFor\(FIX\.src\?FIX\.src\.width:0\);/
    .test(codeLines.slice(run.start, run.end + 1).join('\n')))
    throw new Error('the single run does not go through the one decider');
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/forceStep:\(\(\)=>\{ const s=fixStepFor\(W\); return s>0\?s:null; \}\)\(\)/.test(bb))
    throw new Error('the batch does not take the step per file');
  /* PER FILE, not once: a batch of mixed sizes must still land on one grid. */
  if (/const forced=\+\$\("fixforce"\)\.value\|\|0;/.test(bb))
    throw new Error('the batch still reads one step for every file');

  /* THE GRID COMES FROM THE PROJECT, not from a number written here. */
  const gc = kit.inFunction(codeLines, 'function fixGridCells(){');
  const gb = codeLines.slice(gc.start, gc.end + 1).join('\n');
  if (!/projectGrid/.test(gb))
    throw new Error('the cell count is not read from the project');
  if (/\b(80|160)\b/.test(gb.replace(/CANVAS_SIDE/g, '')))
    throw new Error('the cell count is hard coded somewhere it should be read');
  /* AND A GRID THAT CANNOT DIVIDE THE CANVAS IS SAID. */
  const hint = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb = codeLines.slice(hint.start, hint.end + 1).join('\n');
  if (!/does not divide "\+CANVAS_SIDE/.test(hb))
    throw new Error('an impossible grid is not reported');
  if (!/const cols=scale\?FIX\.src\.width:\(snap\?g\.cells:/.test(hb))
    throw new Error('the readout does not use the grid when snapping');

  /* Snapping is a fast-mode thing: scale never reaches the engine at all. */
  const sn = kit.inFunction(codeLines, 'function fixSnapping(){');
  if (!/fixMode\(\)==="fast"/.test(codeLines.slice(sn.start, sn.end + 1).join('\n')))
    throw new Error('snapping is not limited to the mode that detects');

  /* A field that decides nothing must not look live. */
  const ui = kit.inFunction(codeLines, 'function fixModeUI(){');
  const ub = codeLines.slice(ui.start, ui.end + 1).join('\n');
  if (!/f\.disabled=scale\|\|snap;/.test(ub))
    throw new Error('the pixel size box stays live while snapping decides it');
  if (!/lab\.textContent="Snap to the "\+g\.cells\+" cell grid"/.test(ub))
    throw new Error('the switch does not name the grid it snaps to');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
