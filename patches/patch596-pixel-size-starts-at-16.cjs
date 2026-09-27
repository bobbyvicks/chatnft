/* THE PIXEL SIZE BOX STARTS AT 16.

   "ignore the rules fix, id rather default be 16 now pls" - the owner,
   2026-09-27, answering "for traits other than backgrounds, the site's
   default is still 8px ... tell me if you want traits at 16 too", after
   "i shouldnt need rules tho if i want to chang it to 2x2 i should be able
   too". So no per-layer rule: one visible number in the box, 16, which
   anybody can change, and 0 still works it out. It replaces the unpushed
   backgrounds-only rule (tag superseded/backgrounds-rule-at-16).

   WHAT 16 DOES, AUDITED BEFORE WRITING (a reader over the page, ten over
   the 53 fixer-reaching specs, each checked by an adversarial second
   reader; 370 tests predicted before anything ran):

   - fixStepFor's typed branch returns on every path, so with a number in
     the box the snap machinery is never reached. The Snap switch was
     therefore a live control deciding nothing - the thing this tab greys
     a control out for. It is greyed out while a size is set (and in scale
     only, where it never did anything either), says why on its label, and
     fixSnapping() answers false while a size is set, so no readout or
     folder sentence describes a snap that is not happening. Its decision
     caller is reached only when the box is 0, where it answers as before.
   - Art drawn at 8px on 1280 - most finished traits - is MERGED 2 to 1 at
     16. The typed-recut note fires only when neither size divides the
     other, and its comment said a whole-ratio merge was "covered by the
     marks-dropped clause"; that clause counts alpha-connected marks sized
     to the project grid, so a pupil or a mouth line painted on opaque art
     is never one. The owner, the same afternoon: "for the mouth traits i
     had to basically remake them all bc they got made so bad and the eyes
     are near impossible". Measured through the page's own code on the 20
     mouths and 20 eyes in SAVED TRAITS: at 16 mouths lose a median 23% of
     their shape (4.8% today) and two vanish entirely; eyes 9.3% (3.4%).
     The run now SAYS it merged, and how many one-block strokes are at
     risk, single file and folder alike.
   - Sentences that named "the 160 cell grid" where the typed size's grid
     applies now name the grid the size means. The folder run's "N not on
     the 160 cell grid" note is not given while a size is set: every
     default folder would have ended by calling all its files off-grid,
     and files that could not take the size are already named by the
     "narrower than the N cells" clause.
   - Scale only: the box is disabled there but still holds 16, and two
     sentences read it anyway - the readout printed a stale "16 means 80
     cells" left by an earlier fast decision, and the folder summary
     blamed 16 for counts scale only kept. Neither reads it in scale now.
   - fixEvenSizes offered sizes in SOURCE pixels on a path that only runs
     with Save at 1280 on ("16 gives 64x64" straight after "80x60"), and
     "Type 8 to keep its 8px blocks (128 cells)" on 1024 art, where 8
     means 160. Both were already wrong; 16 makes them the common case for
     non-square pictures. Offered on the canvas now, rows and all.
   - PB.fix, the rounding on change, and the box's own input now redraw
     the switches, so the Snap switch cannot be left greyed beside a 0.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf(NL) < 0) throw new Error('index.html is not CRLF - every multi-line anchor below would miss');

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 80) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the box, and its first description ----------------------------- */
swap('    <label for="fixforce">Pixel size</label>', block([
  '    <!-- STARTS AT 16. The owner, 2026-09-27: "id rather default be 16 now pls".',
  '         Anyone can type another number, and 0 still works it out. While a',
  '         number is set the Snap switch is greyed out, because it decides',
  '         nothing then - see fixModeUI. -->',
  '    <label for="fixforce">Pixel size</label>',
]));
swap('<input type="number" id="fixforce" min="0" step="1" value="0" style="width:84px"',
  '<input type="number" id="fixforce" min="0" step="1" value="16" style="width:84px"');
swap('title="The pixel size of the result, in whole numbers. With Save at 1280 on that is the block on the 1280 canvas - 8 means 160 cells whatever size the picture is; with it off, how many picture pixels make one pixel. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">',
  'title="The pixel size of the result, in whole numbers. It starts at 16. With Save at 1280 on that is the block on the 1280 canvas - 16 means 80 cells and 8 means 160, whatever size the picture is; with it off, how many picture pixels make one pixel. While a size is set Snap is not used; 0 works it out instead.">');

/* ---- 2. a greyed switch looks greyed ------------------------------------ */
swap('.olrow select{min-width:0;}', block([
  '.olrow select{min-width:0;}',
  '/* A SWITCH THAT DECIDES NOTHING LOOKS IT. The checkbox alone greys to a few',
  '   pixels; its words stayed full contrast beside it. */',
  '.olrow input[type=checkbox]:disabled+span{opacity:.45;}',
]));

/* ---- 3. snapping is what happens when no size is set -------------------- */
swap(block([
  'function fixSnapping(){',
  '  const b=$("fixsnap");',
  '  return !!(b&&b.checked)&&fixMode()==="fast";',
  '}',
]), block([
  '/* A NUMBER IN THE PIXEL SIZE BOX, read exactly as fixStepFor reads it -',
  '   `+value||0`, over 0 - so the switch and the decision cannot disagree about',
  '   whether a size is set. */',
  'function fixSizeSet(){ const f=$("fixforce"); return (+(f&&f.value)||0)>0; }',
  'function fixSnapping(){',
  '  const b=$("fixsnap");',
  '  /* NOT WHILE A SIZE IS SET. fixStepFor\'s typed branch returns on every path',
  '     before it asks this, so a size already beat the snap; the box starts at',
  '     16 now, so that is the ordinary case, and the switch is greyed out for',
  '     it. The readout and the folder summary also ask this, to describe a',
  '     snap - they must hear the answer the switch shows. */',
  '  if(fixSizeSet()) return false;',
  '  return !!(b&&b.checked)&&fixMode()==="fast";',
  '}',
]));

/* ---- 4. fixModeUI: the switch, and the box's words ---------------------- */
swap('     pixel per cell and there is nothing for a size to do. */', block([
  '     pixel per cell and there is nothing for a size to do. */',
  '  /* AND NOW THE OTHER WAY ROUND (2026-09-27). The box starts at 16, and while',
  '     it holds a number the SNAP switch is the live control that changes no',
  '     answer, so that is the one greyed out - with its reason on its label,',
  '     where the hover lands. Scale only greys it too: nothing is detected or',
  '     snapped there, and it was live and inert. */',
]));
swap('  if(lab) lab.textContent="Snap to the "+g.cells+" cell grid";', block([
  '  if(lab) lab.textContent="Snap to the "+g.cells+" cell grid";',
  '  const sn=$("fixsnap");',
  '  if(sn){',
  '    const sized=fixSizeSet();',
  '    const wrap=sn.closest("label");',
  '    /* The words it has when it is live are the markup\'s, kept the first time',
  '       this runs so there is one copy of them. */',
  '    if(wrap&&wrap.dataset.live===undefined) wrap.dataset.live=wrap.title;',
  '    sn.disabled=scale||sized;',
  '    const t=scale ? "Not used in scale only - nothing is detected or snapped."',
  '      : sized ? "Not used while a pixel size is set - the size decides. Set Pixel size to 0 to snap to the "+g.cells+" cell grid instead."',
  '      : (wrap?wrap.dataset.live:"");',
  '    if(wrap) wrap.title=t;',
  '  }',
]));
swap(block([
  '    : "The pixel size of the result. With Save at 1280 on that is the block on the "+CANVAS_SIDE',
  '      +" canvas - 8 means "+(CANVAS_SIDE/8)+" cells whatever size the picture is; with it off, how many"',
  '      +" picture pixels make one pixel."',
  '      +" A number here decides, even with Snap on. 0 works it out:"',
]), block([
  '    /* The starting size is the markup\'s own value, so these words cannot name',
  '       a different number from the one the page opens with. */',
  '    : "The pixel size of the result. It starts at "+f.defaultValue+". With Save at 1280 on that is the block on the "+CANVAS_SIDE',
  '      +" canvas - "+f.defaultValue+" means "+(CANVAS_SIDE/(+f.defaultValue||16))+" cells and 8 means "+(CANVAS_SIDE/8)+", whatever size the picture is; with it off, how many"',
  '      +" picture pixels make one pixel."',
  '      +" A number here decides, and Snap is not used while one is set. 0 works it out:"',
]));

/* ---- 5. everything that changes the box redraws the switches ------------ */
swap('  $("fixforce").addEventListener("input",fixSizeHint);',
  '  $("fixforce").addEventListener("input",()=>{ fixModeUI(); fixSizeHint(); });');
swap('    if(String(w)!==f.value){ f.value=String(w); fixSizeHint(); }',
  '    if(String(w)!==f.value){ f.value=String(w); fixModeUI(); fixSizeHint(); }');
swap('  if(o.forceStep!=null) $("fixforce").value=o.forceStep;', block([
  '  if(o.forceStep!=null) $("fixforce").value=o.forceStep;',
  '  /* Set without events, so the switches are redrawn here: PB.fix({forceStep:0})',
  '     snaps, and must not leave the Snap switch greyed beside the 0. */',
  '  fixModeUI(); fixSizeHint();',
]));

/* ---- 6. the readout, in scale only -------------------------------------- */
swap('  const moved=fixMoved, unhon=fixUnhonoured, unfit=fixBlockUnfit, meas=fixMeasuredBlock, recut=fixBlockRecut;',
  block([
    '  /* NOT IN SCALE ONLY, which never called fixStepFor above: these would be left',
    '     over from the last fast decision, and with the box at 16 that printed',
    '     "16 means 80 cells" in a mode whose box is greyed out. */',
    '  const moved=scale?null:fixMoved, unhon=scale?null:fixUnhonoured, unfit=scale?null:fixBlockUnfit,',
    '    meas=scale?0:fixMeasuredBlock, recut=scale?null:fixBlockRecut;',
  ]));

/* ---- 7. fixEvenSizes offers sizes on the canvas ------------------------- */
swap('      ? ". Type "+nat+" to keep its "+nat+"px blocks ("+own+" cells)."',
  block([
    '      /* THE CANVAS SIZE THAT KEEPS THEM. This only runs with Save at 1280 on,',
    '         where a typed number is the block on the canvas; it offered the',
    '         SOURCE block, so 1024 art at 8px was told "Type 8" - which means 160',
    '         cells there, not its 128. */',
    '      ? ". Type "+(CANVAS_SIDE/own)+" to keep its "+nat+"px blocks ("+own+" cells)."',
  ]));
swap(block([
  '  out.sort((a,b)=>Math.abs(a.s-want)-Math.abs(b.s-want));',
  '  const pick=out.slice(0,3).sort((a,b)=>a.s-b.s);',
  '  return ". "+pick.map(p=>p.s+" gives "+p.cols+"\\u00d7"+p.cols).join(", ")',
]), block([
  '  /* ON THE CANVAS, rows and all. Each offer was the SOURCE step, printed as',
  '     square: "16 gives 64x64" on a 1024x768 picture, right after the readout',
  '     said 16 gives 80x60. The number to type for `cols` cells on the canvas',
  '     is the canvas over it, and its rows are what that step makes of H. */',
  '  for(const p of out){ p.k=CANVAS_SIDE/p.cols; p.rows=Math.max(1,fixRint(H/p.s)); }',
  '  out.sort((a,b)=>Math.abs(a.k-want)-Math.abs(b.k-want));',
  '  const pick=out.slice(0,3).sort((a,b)=>a.k-b.k);',
  '  return ". "+pick.map(p=>p.k+" gives "+p.cols+"\\u00d7"+p.rows).join(", ")',
]));

/* ---- 8. fixStepFor: the merge is recorded ------------------------------- */
swap('let fixTypedRecut=null;', 'let fixTypedRecut=null, fixTypedMerge=null;');
swap('fixBlockUnfit=null; fixBlockRecut=null; fixTypedRecut=null;',
  'fixBlockUnfit=null; fixBlockRecut=null; fixTypedRecut=null; fixTypedMerge=null;');
swap('     0 still means work it out, which is what the box has always said. */', block([
  '     0 still means work it out, which is what the box has always said.',
  '',
  '     SUPERSEDED IN PART, 2026-09-27: the box STARTS at 16 now ("id rather',
  '     default be 16 now pls"), so this branch is the ordinary path, not the',
  '     exception. 0 still means work it out. */',
]));
swap(block([
  '    if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn))',
  '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step,',
  '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  '    return step;',
]), block([
  '    if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn))',
  '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step, grid:cells,',
  '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  '    /* AND A WHOLE MERGE, SAID TOO. The comment above let "2px art typed at 8"',
  '       go unsaid as "a merge the marks-dropped clause already covers". It does',
  '       not: fixSmallMarks counts alpha-connected marks, sized to the project',
  '       grid, so a pupil or a mouth line painted on opaque art is never one.',
  '       With the box at 16 this is every trait drawn at 8px - most finished',
  '       ones - merged 2 to 1, and the owner\'s mouths and eyes are exactly the',
  '       detail one block wide that a merge can drop (measured on the 20 of',
  '       each: at 16 mouths lose a median 23% of their shape, two entirely).',
  '       The size still wins; the run just stops being silent about it. */',
  '    else if(drawn>1&&step>0&&whole(step/drawn)&&Math.round(step/drawn)>=2)',
  '      fixTypedMerge={block:drawn, cells:Math.max(1,fixRint(w/drawn)), by:Math.round(step/drawn), grid:cells,',
  '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  '    return step;',
]));

/* ---- 9. the single run says what it did --------------------------------- */
swap('           question has already been answered by hand. */', block([
  '           question has already been answered by hand.',
  '',
  '           SUPERSEDED IN PART, 2026-09-27: the box starts at 16, so a forced',
  '           size is the default rather than a hand\'s answer. Still quiet -',
  '           the size is on screen in the box - and what forcing it did to',
  '           the picture is said below, as a re-cut or a merge. */',
]));
swap('        const typedBy=fixTypedRecut;', block([
  '        const typedBy=fixTypedRecut;',
  '        const mergedBy=fixTypedMerge;',
]));
swap(block([
  '          ? "drawn at "+typedBy.block+"px blocks ("+typedBy.cells+" cells), which the "',
  '            +fixGridCells().cells+" cell grid cuts across"',
]), block([
  '          ? "drawn at "+typedBy.block+"px blocks ("+typedBy.cells+" cells), which the "',
  '            /* The grid the SIZE means, not the project\'s: at 16 that is 80 cells,',
  '               and "the 160 cell grid cuts across" named one nobody used. */',
  '            +(typedBy.grid||fixGridCells().cells)+" cell grid cuts across"',
]));
swap('          : r.consensus==="measured"', block([
  '          : mergedBy',
  '          ? "drawn at "+mergedBy.block+"px blocks ("+mergedBy.cells+" cells), merged "+mergedBy.by+" to 1 onto the "',
  '            +mergedBy.grid+" cell grid"',
  '            +(mergedBy.strokes ? " - "+mergedBy.strokes.toLocaleString()+" stroke"',
  '              +(mergedBy.strokes===1?"":"s")+" one block wide may not survive it" : "")',
  '          : r.consensus==="measured"',
]));

/* ---- 10. the folder run ------------------------------------------------- */
swap('fixTypedRecutAt=[], fixTypedStrokesAt=[];', 'fixTypedRecutAt=[], fixTypedStrokesAt=[], fixTypedMergeAt=[], fixTypedMergeStrokesAt=[];');
swap('fixTypedRecutAt=[]; fixTypedStrokesAt=[];', 'fixTypedRecutAt=[]; fixTypedStrokesAt=[]; fixTypedMergeAt=[]; fixTypedMergeStrokesAt=[];');
swap('              if(fixTypedRecut.strokes) fixTypedStrokesAt.push({name:name, strokes:fixTypedRecut.strokes}); }',
  block([
    '              if(fixTypedRecut.strokes) fixTypedStrokesAt.push({name:name, strokes:fixTypedRecut.strokes}); }',
    '            if(fixTypedMerge){ fixTypedMergeAt.push(fixTypedMerge.block);',
    '              if(fixTypedMerge.strokes) fixTypedMergeStrokesAt.push({name:name, strokes:fixTypedMerge.strokes}); }',
  ]));
swap('      +((+$("fixforce").value||0)>0 ? " - "+(+$("fixforce").value)+" cannot land on "+CANVAS_SIDE+" for them"',
  block([
    '      /* SCALE FIRST: the box is greyed out there but still holds its number,',
    '         and scale only keeps each picture\'s own count - nothing was typed at it. */',
    '      +(scale ? " - scale only keeps each picture\'s own count"',
    '        : (+$("fixforce").value||0)>0 ? " - "+(+$("fixforce").value)+" cannot land on "+CANVAS_SIDE+" for them"',
  ]));
swap(block([
  '  const typedRecutNote = fixTypedRecutAt.length',
  '    ? " \\u00b7 "+fixTypedRecutAt.length+" were drawn at a block size the "',
  '      +fixGridCells().cells+" cell grid cuts across ("',
]), block([
  '  /* SUPERSEDED IN PART, 2026-09-27: "the collection wants 8" above. The box',
  '     starts at 16 now, and the grid a typed size cuts across is the one THAT',
  '     size means - 80 cells at 16 - not the project\'s 160. */',
  '  const sizedCells=(()=>{ const t=scale?0:(+$("fixforce").value||0); return t>0?fixCanvasCells(t).cells:0; })();',
  '  const typedRecutNote = fixTypedRecutAt.length',
  '    ? " \\u00b7 "+fixTypedRecutAt.length+" were drawn at a block size the "',
  '      +(sizedCells||fixGridCells().cells)+" cell grid cuts across ("',
]));
swap('  const unfitNote = fixUnfitAt.length' + NL + '    ? " \\u00b7 "+fixUnfitAt.length+" drawn in blocks the grid cannot hold ("',
  block([
    '  /* THE WHOLE MERGES, counted the same way, with the files holding one-block',
    '     detail named first - at 16 this is every trait drawn at 8px. */',
    '  const mergeNote = fixTypedMergeAt.length',
    '    ? " \\u00b7 "+fixTypedMergeAt.length+" drawn in finer blocks ("',
    '      +[...new Set(fixTypedMergeAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+") were merged onto the "',
    '      +(sizedCells||fixGridCells().cells)+" cell grid"',
    '      +(fixTypedMergeStrokesAt.length',
    '        ? ", "+fixTypedMergeStrokesAt.length+" of them holding detail one block wide that may not survive it (most in "',
    '          +fixTypedMergeStrokesAt.slice().sort((a,b)=>b.strokes-a.strokes).slice(0,3).map(s=>s.name).join(", ")+")"',
    '        : "")',
    '    : "";',
    '  const unfitNote = fixUnfitAt.length',
    '    ? " \\u00b7 "+fixUnfitAt.length+" drawn in blocks the grid cannot hold ("',
  ]));
swap('  const offGrid = gridOn ? fixBatchFiles.filter(f=>f.cells&&f.cells!==fixGridCells().cells) : [];',
  block([
    '  /* NOT WHILE A SIZE IS SET (2026-09-27). This counts files off the project\'s',
    '     grid to inform a default nobody had chosen; the owner chose it - the box',
    '     starts at 16 - and at 16 every default folder ended "N not on the 160',
    '     cell grid" for all N. Files that could not take the size are named by',
    '     the "narrower than the N cells" clause. Scale only keeps it: nothing is',
    '     typed there, and its counts are the pictures\' own. */',
    '  const offGrid = (gridOn&&!sizedCells) ? fixBatchFiles.filter(f=>f.cells&&f.cells!==fixGridCells().cells) : [];',
  ]));
swap('+recutNote+typedRecutNote+unfitNote+', '+recutNote+typedRecutNote+mergeNote+unfitNote+');

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const must = (s, why) => { if (code.indexOf(s) < 0 && text.indexOf(s) < 0) throw new Error(why + ' - missing: ' + s); };
must('id="fixforce" min="0" step="1" value="16"', 'the box does not start at 16');
must('if(fixSizeSet()) return false;', 'snapping still answers while a size is set');
must('sn.disabled=scale||sized;', 'the snap switch is not greyed while a size is set');
must('$("fixforce").addEventListener("input",()=>{ fixModeUI(); fixSizeHint(); });', 'typing does not redraw the switch');
/* ONE PARSE. fixSizeSet and fixStepFor must read the box the same way, or the
   switch and the decision disagree about whether a size is set. */
must('const asked=+$("fixforce").value||0;', 'fixStepFor no longer reads the box as `+value||0`');
must('function fixSizeSet(){ const f=$("fixforce"); return (+(f&&f.value)||0)>0; }', 'fixSizeSet reads the box differently');
/* THE DECISION CALLER OF fixSnapping IS STILL BELOW THE TYPED RETURN. */
const sf = code.slice(code.indexOf('function fixStepFor('), code.indexOf('\nfunction ', code.indexOf('function fixStepFor(') + 10));
if (!(sf.indexOf('if(asked>0){') >= 0 && sf.indexOf('if(fixSnapping()){') > sf.indexOf('if(asked>0){')))
  throw new Error('fixSnapping is asked before the typed branch - a size would no longer win');
/* EVERY SENTENCE THAT NAMES A GRID FOR A TYPED CUT NAMES THE SIZE'S GRID. */
if (code.indexOf('+fixGridCells().cells+" cell grid cuts across"') >= 0) throw new Error('a typed cut still names the project grid');
/* NO SOURCE-PIXEL OFFER LEFT on the canvas path. */
if (code.indexOf('p.s+" gives "') >= 0 || code.indexOf('". Type "+nat+" to keep its "') >= 0) throw new Error('fixEvenSizes still offers source pixels');
/* The merge is reported where the recut is. */
for (const s of ['fixTypedMerge={block:drawn', 'const mergedBy=fixTypedMerge;', 'fixTypedMergeAt.push(fixTypedMerge.block)', '+typedRecutNote+mergeNote+unfitNote+'])
  must(s, 'the merge is not carried through');
if ((code.match(/fixTypedMerge=null/g) || []).length !== 2) throw new Error('fixTypedMerge is not declared and reset exactly once each');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' chars');
