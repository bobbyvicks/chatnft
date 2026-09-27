/* WHAT THE 16 DEFAULT DOES, SAID EVERYWHERE IT HAPPENS. On top of patch596.

   An independent review of patch596 (three readers - page, tests, reach -
   each finding checked by a separate skeptic) confirmed these, and each is
   fixed here:

   - A PICTURE WITH NO BLOCK GRID - 53% of SAVED TRAITS, 13 of the 20 mouths,
     and any sprite at one pixel per cell, which the block measure cannot
     tell from a render - is resampled onto 80 cells at 16, and the run said
     "medium confidence (forced)". The merge sentence only covered art drawn
     in blocks. Said now, the single run with the width it came from and how
     much of the paint the new cells kept; the folder counts them.
   - The flags a run reports were read when the worker ANSWERED, not when the
     run decided; typing in the box mid-run re-ran fixStepFor from the
     readout and wiped them. Captured with the decision now, as `measured`
     always was.
   - The editor's Fix pixels button merged an 8px trait to 16 and left the
     editor's grid, brush and "drawn at" readout on 8. It adopts the result's
     block now, exactly as opening a fixed picture always has.
   - A NON-SQUARE picture's readout said "1280/80 is 16, so pixels come out
     uneven" - 1280/80 is not the uneven part - and then offered sizes that
     "divide evenly" and did not: the canvas is square, so every size stretches
     a non-square picture's pixels. It now says the picture is not square and
     how wide and tall its pixels come out, and offers nothing a size cannot
     fix. Offers for square pictures are square, and never the size typed.
   - The folder summary named the grid from the box's value at the END, while
     each file used the value at its own turn; and its off-grid note was
     skipped by the box's end value too. Each file carries its own grid and
     whether a size decided it.
   - The greyed Snap switch promised "set Pixel size to 0 to snap"; with the
     switch unticked 0 works the grid out instead. It says it hands the choice
     back now.
   - The tab's heading and the Mode menu described looking for the grid, which
     the default no longer does first.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf(NL) < 0) throw new Error('index.html is not CRLF');
if (text.indexOf('function fixSizeSet(){') < 0) throw new Error('patch596 is not applied');

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 80) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the resample, recorded where the step is known ------------------ */
swap('let fixTypedRecut=null, fixTypedMerge=null;', 'let fixTypedRecut=null, fixTypedMerge=null, fixTypedResample=null;');
swap('fixTypedRecut=null; fixTypedMerge=null;', 'fixTypedRecut=null; fixTypedMerge=null; fixTypedResample=null;');
swap(block([
  '      fixTypedMerge={block:drawn, cells:Math.max(1,fixRint(w/drawn)), by:Math.round(step/drawn), grid:cells,',
  '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  '    return step;',
]), block([
  '      fixTypedMerge={block:drawn, cells:Math.max(1,fixRint(w/drawn)), by:Math.round(step/drawn), grid:cells,',
  '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  '    /* AND A PICTURE WITH NO BLOCKS TO MERGE: fixNativeBlock measured nothing',
  '       (it answers a block of 2 or more, or 0). A render, a blur - 53% of',
  '       SAVED TRAITS, 13 of the 20 mouths - or a sprite at one pixel per cell,',
  '       which it cannot tell from them. RESAMPLED when the step is over one,',
  '       and the run said "medium confidence (forced)" about it. */',
  '    else if(drawn<2&&step>1+1e-9)',
  '      fixTypedResample={grid:cells, w:w};',
  '    return step;',
]));

/* ---- 2. the single run: flags taken with the decision, and said ---------- */
swap('  const measured=fixMeasuredBlock;', block([
  '  const measured=fixMeasuredBlock;',
  '  /* AND WHAT THE TYPED PATH NOTED, for the same reason: typing in the box',
  '     while this runs redraws the readout, which asks fixStepFor again and',
  '     resets every flag before the worker answers. */',
  '  const typedAt=fixTypedRecut, mergedAt=fixTypedMerge, resampledAt=fixTypedResample;',
]));
swap(block([
  '        const typedBy=fixTypedRecut;',
  '        const mergedBy=fixTypedMerge;',
]), block([
  '        const typedBy=typedAt;',
  '        const mergedBy=mergedAt;',
  '        const resampledBy=resampledAt;',
]));
swap(block([
  '              +(mergedBy.strokes===1?"":"s")+" one block wide may not survive it" : "")',
  '          : r.consensus==="measured"',
]), block([
  '              +(mergedBy.strokes===1?"":"s")+" one block wide may not survive it" : "")',
  '          : resampledBy',
  '          ? "no block grid found; resampled from "+resampledBy.w+" across onto the "+resampledBy.grid+" cell grid"',
  '            /* HOW MUCH OF THE PAINT THE NEW CELLS KEPT, the measure the gridless',
  '               search and the size offers already use - square only, because',
  '               it counts cells both ways. */',
  '            +((src.width===src.height)?(()=>{ const k=fixCellsKept(src.data,src.width,src.height,resampledBy.grid);',
  '              return k.srcN?", which kept "+Math.round(k.kept/k.srcN*100)+"% of the paint":""; })():"")',
  '          : r.consensus==="measured"',
]));

/* ---- 3. the folder: each file's own grid and its own sizing -------------- */
swap('fixTypedMergeAt=[], fixTypedMergeStrokesAt=[];', 'fixTypedMergeAt=[], fixTypedMergeStrokesAt=[], fixTypedResampleAt=[], fixTypedGrids=new Set();');
swap('fixTypedMergeAt=[]; fixTypedMergeStrokesAt=[];', 'fixTypedMergeAt=[]; fixTypedMergeStrokesAt=[]; fixTypedResampleAt=[]; fixTypedGrids=new Set();');
swap(block([
  '            if(fixTypedMerge){ fixTypedMergeAt.push(fixTypedMerge.block);',
  '              if(fixTypedMerge.strokes) fixTypedMergeStrokesAt.push({name:name, strokes:fixTypedMerge.strokes}); }',
]), block([
  '            if(fixTypedMerge){ fixTypedMergeAt.push(fixTypedMerge.block);',
  '              if(fixTypedMerge.strokes) fixTypedMergeStrokesAt.push({name:name, strokes:fixTypedMerge.strokes}); }',
  '            if(fixTypedResample) fixTypedResampleAt.push(fixTypedResample.w);',
  '            /* THE GRID THIS FILE WAS CUT TO, from its own decision - the box can',
  '               change between files, and the summary is written at the end. */',
  '            for(const t of [fixTypedRecut,fixTypedMerge,fixTypedResample]) if(t) fixTypedGrids.add(t.grid);',
]));
swap('    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending};',
  block([
    '    /* WHETHER A SIZE DECIDED THIS FILE, read in the same turn as its step. */',
    '    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending, sized:!scale&&fixSizeSet()};',
  ]));
swap(block([
  '      fixBatchFiles.push({name:fixZipName(rel,name),',
  '        rel:rel,',
]), block([
  '      fixBatchFiles.push({name:fixZipName(rel,name),',
  '        rel:rel, sized:!!job.sized,',
]));
swap('  const sizedCells=(()=>{ const t=scale?0:(+$("fixforce").value||0); return t>0?fixCanvasCells(t).cells:0; })();',
  block([
    '  /* The grids the files were cut to, as they were decided. One is the ordinary',
    '     case; more than one means the box changed during the run. */',
    '  const gridNums=fixTypedGrids.size ? [...fixTypedGrids].sort((a,b)=>a-b).join(" and ") : String(fixGridCells().cells);',
    '  const gridMany=fixTypedGrids.size>1;',
  ]));
swap('      +(sizedCells||fixGridCells().cells)+" cell grid cuts across ("',
  '      +gridNums+(gridMany?" cell grids cut across (":" cell grid cuts across (")');
swap('      +(sizedCells||fixGridCells().cells)+" cell grid"',
  '      +gridNums+(gridMany?" cell grids":" cell grid")');
swap(block([
  '  const unfitNote = fixUnfitAt.length',
  '    ? " \\u00b7 "+fixUnfitAt.length+" drawn in blocks the grid cannot hold ("',
]), block([
  '  /* AND THE RESAMPLED ONES: no block grid measured in them. */',
  '  const resampleNote = fixTypedResampleAt.length',
  '    ? " \\u00b7 "+fixTypedResampleAt.length+" with no block grid "+(fixTypedResampleAt.length===1?"was":"were")',
  '      +" resampled onto the "+gridNums+(gridMany?" cell grids":" cell grid")',
  '    : "";',
  '  const unfitNote = fixUnfitAt.length',
  '    ? " \\u00b7 "+fixUnfitAt.length+" drawn in blocks the grid cannot hold ("',
]));
swap('  const offGrid = (gridOn&&!sizedCells) ? fixBatchFiles.filter(f=>f.cells&&f.cells!==fixGridCells().cells) : [];',
  block([
    '  /* Per file: only the ones no size decided. */',
    '  const offGrid = gridOn ? fixBatchFiles.filter(f=>!f.sized&&f.cells&&f.cells!==fixGridCells().cells) : [];',
  ]));
swap('+recutNote+typedRecutNote+mergeNote+unfitNote+', '+recutNote+typedRecutNote+mergeNote+resampleNote+unfitNote+');

/* ---- 4. the editor's Fix button adopts the result's block ---------------- */
swap(block([
  '    restoreImage(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height));',
  '    refreshStats(); resizeBoxes(); repalette();',
]), block([
  '    restoreImage(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height));',
  '    /* THE BLOCK THE RESULT IS DRAWN IN, as fixOpen sets it: without this an 8px',
  '       trait merged to 16 kept an 8px grid, brush and "drawn at" readout. */',
  '    adoptBlock(r.width===r.height ? fixBlockFor(r.width,out.width) : 1);',
  '    refreshStats(); resizeBoxes(); repalette();',
]));

/* ---- 5. the readout: a picture that is not square ------------------------ */
swap(block([
  '    note = (cols===rows && Number.isInteger(k))',
  '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
  '      : " \\u00b7 "+CANVAS_SIDE+"/"+cols+" is "+(Math.round(k*100)/100)',
]), block([
  '    note = (cols===rows && Number.isInteger(k))',
  '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
  '      /* NOT SQUARE. The canvas is, so its pixels are stretched at any size:',
  '         this said "1280/80 is 16, so pixels come out uneven" - 16 is the even',
  '         part - and then offered sizes that were no more even. It says what',
  '         happens, and offers nothing a size cannot fix. */',
  '      : cols!==rows',
  '      ? " \\u00b7 not square, so on the "+CANVAS_SIDE+" canvas each pixel comes out "+(Math.round(k*100)/100)',
  '        +" wide and "+(Math.round(CANVAS_SIDE/rows*100)/100)+" tall"',
  '      : " \\u00b7 "+CANVAS_SIDE+"/"+cols+" is "+(Math.round(k*100)/100)',
]));
swap(block([
  '  for(const p of out){ p.k=CANVAS_SIDE/p.cols; p.rows=Math.max(1,fixRint(H/p.s)); }',
  '  out.sort((a,b)=>Math.abs(a.k-want)-Math.abs(b.k-want));',
  '  const pick=out.slice(0,3).sort((a,b)=>a.k-b.k);',
]), block([
  '  for(const p of out){ p.k=CANVAS_SIDE/p.cols; p.rows=Math.max(1,fixRint(H/p.s)); }',
  '  /* SQUARE ONLY, and never the size already typed: the canvas is square, so',
  '     "divides evenly" is only true of an offer whose rows equal its columns. */',
  '  const typedNow=+($("fixforce")&&$("fixforce").value)||0;',
  '  const even=out.filter(p=>p.rows===p.cols&&p.k!==typedNow);',
  '  if(!even.length) return ". Nothing divides this image evenly onto the "+CANVAS_SIDE+" canvas.";',
  '  even.sort((a,b)=>Math.abs(a.k-want)-Math.abs(b.k-want));',
  '  const pick=even.slice(0,3).sort((a,b)=>a.k-b.k);',
]));

/* ---- 6. the words ---------------------------------------------------------- */
swap('      : sized ? "Not used while a pixel size is set - the size decides. Set Pixel size to 0 to snap to the "+g.cells+" cell grid instead."',
  '      : sized ? "Not used while a pixel size is set - the size decides. Set Pixel size to 0 to hand the choice back to this switch (ticked, it snaps to the "+g.cells+" cell grid)."');
swap('into real pixel art at the size it was drawn at. Four independent detectors find the grid; each cell becomes one true pixel.',
  'into real pixel art: at the Pixel size in the box, which starts at 16, or - with the box at 0 - at the size it was drawn at, where the detectors find the grid. Each cell becomes one true pixel.');
swap('title="Quick looks for the grid and rebuilds the picture at one pixel per cell.',
  'title="Quick rebuilds the picture at the Pixel size, or looks for the grid itself when the size is 0.');

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const must = (s, why) => { if (code.indexOf(s) < 0 && text.indexOf(s) < 0) throw new Error(why + ' - missing: ' + s); };
must('fixTypedResample={grid:cells, w:w};', 'the resample is not recorded');
must('const typedAt=fixTypedRecut, mergedAt=fixTypedMerge, resampledAt=fixTypedResample;', 'the flags are not taken with the decision');
if (/const (typedBy|mergedBy|resampledBy)=fixTyped/.test(code)) throw new Error('the single run still reads the live flags');
must('adoptBlock(r.width===r.height ? fixBlockFor(r.width,out.width) : 1);', 'the editor fix does not adopt the block');
must('sized:!scale&&fixSizeSet()', 'a folder file does not carry whether a size decided it');
if (code.indexOf('sizedCells') >= 0) throw new Error('the folder still reads the box at the end');
if ((code.match(/fixTypedResample=null/g) || []).length !== 2) throw new Error('fixTypedResample is not declared and reset exactly once each');
must('+recutNote+typedRecutNote+mergeNote+resampleNote+unfitNote+', 'the resample note is not in the folder summary');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' chars');
