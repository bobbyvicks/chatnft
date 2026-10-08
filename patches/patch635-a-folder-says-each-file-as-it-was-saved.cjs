/* patch635: A FOLDER SAYS EACH FILE AS IT WAS SAVED.

   Each file of a folder run is saved by the Save at 1280 switch as it stands when that file finishes: fixGridPixels
   reads #fixgrid then, and fixGateOf, in the same step, judges the file by it ("it is not saved at 1280"). The
   summary's three grid clauses - the uneven clause ("came back on a pixel count that does not divide 1280"), the
   stray clause (patch634) and the off-grid clause ("N not on the 160 cell grid") - read the switch once, when the
   run ends (const gridOn). Nothing locks the switch during a run, so one flipped part way described every file by
   the last setting: turned on, a file saved at its own size was counted as uneven, off the grid, or as having strays
   "in blocks that land on 1280", while the gate in the same line named it "not saved at 1280"; turned off, a file
   saved at 1280 went unsaid. Found by the last review of patch634 (session 95a77113, round 7), reproduced on df3a344
   for the uneven clause, so older than patch634; the owner was told it would be fixed next and said "go for all of
   it and ask me questions with choices".

   WHAT CHANGES: each file records whether Save at 1280 was on for its save (onCanvas, read beside fixGridPixels in
   finish(), in the same turn as the gate), and the three clauses count the files with onCanvas, instead of reading
   the switch at the end. With the switch left alone the clauses say exactly what they said (every file has the same
   onCanvas as the end state). (A picture already 1280 square is the same size either way; with the switch off it
   is not counted, as before.) On the engine path the switch can also decide the CUT, and only when a size is typed
   and that size has a count that lands on 1280 (fixCanvasCells): with it on, a picture that holds that count is cut
   to it, and a picture too small for it keeps its own block (fixStepFor's never-upsample); with it off, the size is
   source pixels per cell. With no size, or a size with no landing count, the cut is the same either way. So each
   job records the switch its cut read (cutOnCanvas, beside fixStepFor) and whether its cut WOULD LAND on 1280 with
   the switch on (cutLands: the landing count when the picture holds it, else whether its own block count divides
   1280), and a file the uneven clause counts that was cut with the switch off where the cut would have landed is
   said as such ("Save at 1280 was turned on after they were cut", or ", and 1 of them was cut with Save at 1280 off
   and saved with it on" beside the other reason, which then names only the rest - as the size box stands when the
   run ends, see KNOWN AND LEFT) instead of blaming the size (found by review of round 1: "16 cannot land on 1280"
   for a size that lands).
   SUPERSEDED, round 3's: cutLands was true only for a picture at least as big as the count, and said a picture too
   small for it "cuts the same either way" - false: with the switch on it keeps its own block, which can land where
   the off cut does not (found by review of round 3).
   SUPERSEDED, round 2's: any uneven file cut with the switch off was said as turned on after it was cut - false
   where the switch could not have changed the cut, and it replaced the advice that would help ("turn Snap on, or
   type a size"; found by review of round 2). The gate, the save and the single run are unchanged. NOT CHANGED: the
   resample note's fixCoarseNote still reads the switch when the run ends; it advises the next run, and is left.
   KNOWN AND LEFT (older than this patch): for a picture too small for the cells its typed size means whose own
   blocks do not land on 1280 either, the uneven clause's reason is "N cannot land on 1280", where the truth is that
   the picture is too small for that size and its own blocks do not land. And the clause's reasons read the size box
   and Snap when the run ends, so a size changed part way through a run is described by its last value - with the box
   cleared and only some of the uneven files flipped, the Snap reason is given to all of them, a flipped one included,
   before the flip is counted (when all of them flipped, the flip is the only cause given).

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function fixScaleBlock(data,w,h){', 'patch634 is not applied'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('onCanvas:onCanvas,') >= 0) throw new Error('patch635 is already applied');
}

/* ---- the file records the switch its save read ---- */
doc.swap(
  [
    '      const sv=fixGridPixels(out);',
  ],
  [
    '      /* patch635: whether Save at 1280 is on for this file\'s save, read in the',
    '         same turn as the save and the gate - the summary\'s grid clauses count',
    '         this, not the switch when the run ends, which a switch flipped part way',
    '         would make wrong for the files before it. */',
    '      const onCanvas=!!($("fixgrid")&&$("fixgrid").checked);',
    '      const sv=fixGridPixels(out);',
  ]);
doc.swap(
  [
    '      fixBatchFiles.push({name:fixZipName(rel,name),',
    '        rel:rel, sized:!!job.sized,',
  ],
  [
    '      fixBatchFiles.push({name:fixZipName(rel,name),',
    '        rel:rel, sized:!!job.sized, onCanvas:onCanvas, cutOnCanvas:job.cutOnCanvas, cutLands:job.cutLands,',
  ]);

/* ---- and the switch the cut read, beside fixStepFor ---- */
/* SUPERSEDED note, round 2: "The spec's engine flip found that wrong: fixAsk is
   awaited between fixStepFor and the return". False (review of round 2):
   prepare() calls fixAsk without await and finish() awaits it, so from this
   read to prepare's return is one turn and no click lands in between. Reading
   at the return differed only under the spec's hook, which flips the switch
   synchronously inside the fixAsk call. The read sits beside fixStepFor so it
   is the value the cut used, by construction rather than by timing. */
doc.swap(
  [
    '      const forceStep=scale ? null : (()=>{ const s=fixStepFor(sw,px,sh);',
  ],
  [
    '      /* patch635: the Save at 1280 switch as the cut reads it - fixStepFor,',
    '         below, reads the same switch - and whether this cut WOULD LAND',
    '         on 1280 with the switch on, fixStepFor\'s own way: a typed size whose',
    '         count lands (fixCanvasCells) gives that count to a picture that holds',
    '         it, and a picture too small for it keeps its own block (fixScaleBlock,',
    '         the never-upsample keep, measured without leaving a trace); with no',
    '         size or no landing count the switch decides nothing. A file that is',
    '         uneven at 1280 although its cut would have landed was made uneven by',
    '         the switch being off when it was cut. */',
    '      const cutOnCanvas=!!($("fixgrid")&&$("fixgrid").checked);',
    '      const cutAsked=scale ? 0 : (+$("fixforce").value||0), cutCanvas=cutAsked>0 ? fixCanvasCells(cutAsked) : null;',
    '      const cutLands=!!(cutCanvas&&cutCanvas.cells&&((sw>=cutCanvas.cells&&sh>=cutCanvas.cells)',
    '        ||CANVAS_SIDE%Math.max(1,fixRint(sw/fixScaleBlock(px,sw,sh).block))===0));',
    '      const forceStep=scale ? null : (()=>{ const s=fixStepFor(sw,px,sh);',
  ]);
doc.swap(
  [
    '    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending, sized:!scale&&fixSizeSet(), cut:cut};',
  ],
  [
    '    /* patch635: and the switch the cut read, and whether the cut would have',
    '       landed with it on (taken beside fixStepFor above). */',
    '    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending, sized:!scale&&fixSizeSet(), cut:cut,',
    '      cutOnCanvas:cutOnCanvas, cutLands:cutLands};',
  ]);

/* ---- the uneven clause's cause: a flip between cut and save, said as such ---- */
doc.swap(
  [
    '      +(scale ? " - scale only keeps each picture\'s own count"',
    '        : (+$("fixforce").value||0)>0 ? " - "+(+$("fixforce").value)+" cannot land on "+CANVAS_SIDE+" for them"',
  ],
  [
    '      /* patch635: an uneven file cut with Save at 1280 off whose cut would have',
    '         landed with it on (cutLands), then saved with it on, is uneven because',
    '         the switch moved - said as such. When only some are, the size reason',
    '         names the rest ("for 2 of them") and the flipped ones are counted after. */',
    '      +(scale ? " - scale only keeps each picture\'s own count"',
    '        : raggedFlipped===ragged ? " - Save at 1280 was turned on after they were cut"',
    '        : (+$("fixforce").value||0)>0 ? " - "+(+$("fixforce").value)+" cannot land on "+CANVAS_SIDE+" for "+(raggedFlipped ? (ragged-raggedFlipped)+" of them" : "them")',
  ]);
doc.swap(
  [
    '        : " - turn Snap on, or type a size")',
    '    : "";',
  ],
  [
    '        : " - turn Snap on, or type a size")',
    '      +(!scale&&raggedFlipped>0&&raggedFlipped<ragged ? ", and "+raggedFlipped+" of them "+(raggedFlipped===1?"was":"were")+" cut with Save at 1280 off and saved with it on" : "")',
    '    : "";',
  ]);

/* ---- the three clauses count the files saved at 1280 ---- */
doc.swap(
  [
    '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    '  const ragged = gridOn ? fixBatchFiles.filter(f=>f.cells&&CANVAS_SIDE%f.cells!==0).length : 0;',
  ],
  [
    '  /* SUPERSEDED (patch635): const gridOn=$("fixgrid")&&$("fixgrid").checked, read',
    '     when the run ends, decided all three grid clauses below; each file now says',
    '     whether Save at 1280 was on for its own save (onCanvas), which a switch',
    '     flipped part way makes differ from the end state. */',
    '  const ragged = fixBatchFiles.filter(f=>f.onCanvas&&f.cells&&CANVAS_SIDE%f.cells!==0).length;',
    '  /* the uneven files cut with the switch off whose cut would have landed with it on (cutLands) - round 2 counted every',
    '     cut with the switch off (SUPERSEDED: ...&&f.cutOnCanvas===false).length), round 3 only pictures that hold the',
    '     count. A file cut with the switch ON whose cut lands is never uneven, so for an uneven file cutLands already',
    '     implies the off cut; both are kept, as the clause names the cause. */',
    '  const raggedFlipped = scale ? 0 : fixBatchFiles.filter(f=>f.onCanvas&&f.cells&&CANVAS_SIDE%f.cells!==0&&f.cutOnCanvas===false&&f.cutLands).length;',
  ]);
doc.swap(
  [
    '  const strayOf = k => gridOn ? fixBatchFiles.filter(f=>f.strays===k&&!(f.cells&&CANVAS_SIDE%f.cells!==0)) : [];',
  ],
  [
    '  const strayOf = k => fixBatchFiles.filter(f=>f.onCanvas&&f.strays===k&&!(f.cells&&CANVAS_SIDE%f.cells!==0));   /* patch635 */',
  ]);
doc.swap(
  [
    '  const offGrid = gridOn ? fixBatchFiles.filter(f=>!f.sized&&f.cells&&(scale ? fixGridCells().cells%f.cells!==0 : f.cells!==fixGridCells().cells)) : [];',
  ],
  [
    '  const offGrid = fixBatchFiles.filter(f=>f.onCanvas&&!f.sized&&f.cells&&(scale ? fixGridCells().cells%f.cells!==0 : f.cells!==fixGridCells().cells));   /* patch635 */',
  ]);

doc.finish(({ text, must }) => {
  must('      const onCanvas=!!($("fixgrid")&&$("fixgrid").checked);', 'the switch recorded');
  must('        rel:rel, sized:!!job.sized, onCanvas:onCanvas,', 'on the file');
  must('  const ragged = fixBatchFiles.filter(f=>f.onCanvas&&f.cells&&CANVAS_SIDE%f.cells!==0).length;', 'the uneven clause');
  must('fixBatchFiles.filter(f=>f.onCanvas&&f.strays===k', 'the stray clause');
  must('  const offGrid = fixBatchFiles.filter(f=>f.onCanvas&&!f.sized', 'the off-grid clause');
  must('      const cutOnCanvas=!!($("fixgrid")&&$("fixgrid").checked);', 'the cut\'s switch, read beside fixStepFor');
  must('      cutOnCanvas:cutOnCanvas, cutLands:cutLands};', 'the cut\'s switch on the job');
  must('        ||CANVAS_SIDE%Math.max(1,fixRint(sw/fixScaleBlock(px,sw,sh).block))===0));', 'a picture too small for the count keeps its own block');
  must('f.cutOnCanvas===false&&f.cutLands).length;', 'the flipped count needs a cut that would have landed');
  must('(raggedFlipped===1?"was":"were")', 'one of them was');
  /* the read is in the same turn as the cut: no await between it and fixStepFor */
  { const a = text.indexOf('      const cutOnCanvas=!!($("fixgrid")&&$("fixgrid").checked);');
    const b = text.indexOf('const s=fixStepFor(sw,px,sh);', a);
    if (a < 0 || b < 0 || /\bawait\b/.test(text.slice(a, b))) throw new Error('the cut\'s switch is not read in the same turn as fixStepFor'); }
  must('onCanvas:onCanvas, cutOnCanvas:job.cutOnCanvas, cutLands:job.cutLands,', 'the cut\'s switch on the file');
  must(': raggedFlipped===ragged ? " - Save at 1280 was turned on after they were cut"', 'the flip as the cause');
  /* no read of the gridOn const remains in the summary (fixCoarseNote's own read of the switch is left: it advises
     the next run); a stray gridOn would now throw a ReferenceError out of fixBatchRun */
  const s = text.indexOf('  /* SUPERSEDED (patch635): const gridOn=');
  const e = text.indexOf('fixBatchSay(fixBatchFiles.length+" of "', s);
  if (s < 0 || e < 0) throw new Error('summary not found');
  const rest = text.slice(s, e).replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bgridOn\b/.test(rest)) throw new Error('gridOn is still read in the summary');
});
