/* patch626: THE RUN SAYS WHAT CHANGED, AND NOTHING IT CANNOT KNOW.

   The owner, 2026-09-25: "the backrounds arent going great in fix pallete". Measured on the 47 saved
   backgrounds at a6d9799 (session 95a77113, scratchpad/bg2, a harness that runs the page's own code and
   matches the served page byte for byte on all 47 at 16 and 8), every background's run said it "kept 100% of
   the paint" and was "ready for the collection", whatever had happened to it. Three reasons, each fixed here
   in the sentence only - no picture changes:

   1. "which kept N% of the paint" counts alpha (fixCellsKept: a pixel is paint when alpha > 8). On a picture
      painted edge to edge every count keeps all of it, so the figure is 100 by construction and says
      nothing. It is now left out when nothing in the source is clear - in the gridless sentence, the
      resampled sentence and the size advice - and still given, measured, where something is.
   2. The palette clause gave the share of the picture moved and the single furthest move, a maximum over
      distinct colours with no area: 34% of a lawn moving by 8.5 and one speck moving by 18 read alike.
      snapToPalette already works out every colour's distance; it now also adds up the pixels that moved by
      10 or more - deltaWord's "a clear change" - and the run says that share. A folder says the total and
      the file with the largest share. The owner: "5 yes" to "say how much of the picture plainly changed
      colour".
   3. At 16 a gridless picture is resampled onto 80 cells, and detail smaller than a cell - small text,
      thin lines, stars - may not survive the vote: about 16 of the 47 backgrounds lost their text, pattern
      or faces at 16 and kept them at 8. The box stays at 16 (the owner, 2026-09-27: "id rather default be 16
      now pls"; asked again 2026-10-02 whether scenes ship at 8: "idk"), so the run says it and names 8.
   And "type 10 to keep them" now says the collection's 8px blocks will not take 10: typing it keeps the
   drawing and fails the gate's 8px-block check, which the advice never said.

   NO OUTPUT CHANGES: snapToPalette's colour choices are untouched (two counters added beside the existing
   ones); the saved pixels are byte-identical before and after on the 47 backgrounds at 16 and 8.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function snapOnce', 'patch625 is not applied'],
  ['function fixPalApply(out,rel){', 'the page has no fixPalApply'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('function fixAllPainted') >= 0) throw new Error('patch626 is already applied');
}

/* ---- 1. snapToPalette: the pixels that moved by a clear change ---------- */
doc.swap('  let moved=0, pixels=0, worst=0;',
  [
    '  let moved=0, pixels=0, worst=0;',
    '  /* THE PIXELS THAT MOVED BY A CLEAR CHANGE (patch626): 10 or more, deltaWord\'s',
    '     "a clear change". `worst` above is a maximum over distinct colours and',
    '     knows nothing of area - a speck and a whole lawn read alike - so the',
    '     area is added up here, from the distance already worked out. */',
    '  let clear=0;',
  ]);
doc.swap('      if(far>worst) worst=far;',
  [
    '      if(far>worst) worst=far;',
    '      if(far>=10) clear+=mm.c.px;',
  ]);
doc.swap('share:opaque?pixels/opaque:0, apart:apart};',
  'share:opaque?pixels/opaque:0, apart:apart, clear:clear, clearShare:opaque?clear/opaque:0};');

/* ---- 2. the folder's counters ------------------------------------------ */
doc.swap('let fixPalWorst=0, fixPalMerged=0, fixPalWorstFile="";',
  [
    'let fixPalWorst=0, fixPalMerged=0, fixPalWorstFile="";',
    '/* AND HOW MUCH OF IT WAS A CLEAR CHANGE (patch626): the pixels moved by 10 or',
    '   more across the run, and the file with the largest share of them. */',
    'let fixPalClear=0, fixPalOpaque=0, fixPalMostShare=0, fixPalMostFile="";',
  ]);
doc.swap('fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile="";',
  'fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile=""; fixPalClear=0; fixPalOpaque=0; fixPalMostShare=0; fixPalMostFile="";');
doc.swap('  const r=(out.pal!==undefined && out.pal!==null) ? out.pal : snapToPalette(out.data,out.width*out.height,out.width);',
  [
    '  const r=(out.pal!==undefined && out.pal!==null) ? out.pal : snapToPalette(out.data,out.width*out.height,out.width);',
    '  fixPalOpaque+=r.opaque||0;',
  ]);
doc.swap('    fixPalMerged+=r.merged||0;',
  [
    '    fixPalMerged+=r.merged||0;',
    '    fixPalClear+=r.clear||0;',
    '    if((r.clearShare||0)>fixPalMostShare){ fixPalMostShare=r.clearShare; fixPalMostFile=String(rel||""); }',
  ]);

/* ---- 3. the helpers ------------------------------------------------------ */
doc.swap('function fixPalApply(out,rel){',
  [
    '/* PAINTED EDGE TO EDGE (patch626): no pixel clear by the cell rule\'s own test',
    '   (fixCellsKept: paint is alpha > 8). On such a picture every count keeps',
    '   all the paint, so "which kept N% of the paint" is 100 by construction and',
    '   is left out rather than said. */',
    'function fixAllPainted(img){',
    '  if(!img||!img.data) return false;',
    '  const d=img.data;',
    '  for(let i=3;i<d.length;i+=4) if(d[i]<=8) return false;',
    '  return true;',
    '}',
    '/* COARSER THAN THE COLLECTION GRID (patch626). At 16 a picture with no block',
    '   grid is voted onto 80 cells, and detail smaller than a cell loses the vote:',
    '   measured on the 47 saved backgrounds, about 16 lost their text, pattern or',
    '   faces at 16 and kept them at 8. The box stays the person\'s; the run says it. */',
    'function fixCoarseNote(cells){',
    '  const g=fixGridCells();',
    '  if(!(cells>0)||!g.exact||cells>=g.cells) return "";',
    '  /* Only on the canvas. With Save at 1280 off a cell count is picture pixels',
    '     per cell, and the collection\'s 160 is not what typing 8 gives. On the',
    '     canvas a picture is resampled only when it is wider than the cells, so',
    '     8 always gives it more of them: min(its width, 160). A review found the',
    '     first wording, "8 gives the collection\'s own 160", false for a 128px',
    '     source, where 8 keeps 128. */',
    '  if(!($("fixgrid")&&$("fixgrid").checked)) return "";',
    '  return " - small details (text, thin lines, stars) may be lost at "+cells+" cells; "+(CANVAS_SIDE/g.cells)+" keeps more";',
    '}',
    '/* THE SHARE THAT PLAINLY CHANGED COLOUR (patch626), in the owner\'s words:',
    '   pixels moved 10 or more - deltaWord\'s "a clear change" - over the painted',
    '   area. Under 1% is said as such rather than as 0. */',
    'function fixClearWords(clear,opaque){',
    '  if(!(clear>0)||!(opaque>0)) return "";',
    '  const p=Math.round(clear/opaque*100);',
    '  return (p<1?"under 1%":p+"%")+" plainly changed colour";',
    '}',
    '/* A BLOCK THE GATE WILL NOT TAKE (patch626). "type 10 to keep them" keeps the',
    '   drawing, and fixGateOf then refuses it: its blocks are checked at 8px. */',
    'function fixRecutCaveat(block){',
    '  return (block>0&&block%8) ? ", though the collection\'s 8px blocks will not take "+block : "";',
    '}',
    'function fixPalApply(out,rel){',
  ]);

/* ---- 4. the single run's sentence --------------------------------------- */
doc.swap('            +Math.round(pal.share*100)+"% of the picture - the furthest by "',
  [
    '            +Math.round(pal.share*100)+"% of the picture"',
    '            +(pal.clear ? ", "+fixClearWords(pal.clear,pal.opaque) : "")',
    '            +" - the furthest by "',
  ]);
doc.swap('              return k.srcN?", which kept "+Math.round(k.kept/k.srcN*100)+"% of the paint":""; })():"")',
  [
    '              return (k.srcN&&!fixAllPainted(src))?", which kept "+Math.round(k.kept/k.srcN*100)+"% of the paint":""; })():"")',
    '            +fixCoarseNote(resampledBy.grid)',
  ]);
doc.swap(
  [
    '            ? "no pixel grid found; put on "+gridless.pick+" cells, "',
    '              +(gridless.passed ? "which kept "+Math.round(gridless.kept*100)+"% of the paint"',
    '                : "the count that kept the most ("+Math.round(gridless.kept*100)+"%) - none kept 95%")',
  ],
  [
    '            ? "no pixel grid found; put on "+gridless.pick+" cells"',
    '              +(gridless.passed&&fixAllPainted(src) ? ""',
    '                : ", "+(gridless.passed ? "which kept "+Math.round(gridless.kept*100)+"% of the paint"',
    '                : "the count that kept the most ("+Math.round(gridless.kept*100)+"%) - none kept 95%"))',
  ]);
doc.swap('            +fixGridCells().cells+" cell grid - type "+recutBy.canvasBlock+" to keep them"',
  '            +fixGridCells().cells+" cell grid - type "+recutBy.canvasBlock+" to keep them"+fixRecutCaveat(recutBy.canvasBlock)');

/* ---- 5. the readout before the run, and the size advice ------------------ */
doc.swap('      +recut.canvasBlock+" to keep them"',
  '      +recut.canvasBlock+" to keep them"+fixRecutCaveat(recut.canvasBlock)');
doc.swap('    return k.srcN ? " (keeps "+Math.round(k.kept/k.srcN*100)+"% of the paint)" : "";',
  '    return (k.srcN&&!fixAllPainted(FIX.src)) ? " (keeps "+Math.round(k.kept/k.srcN*100)+"% of the paint)" : "";');

/* ---- 6. the folder's sentence -------------------------------------------- */
doc.swap('      +fixPalPixels.toLocaleString()+" pixels - the furthest by "',
  [
    '      +fixPalPixels.toLocaleString()+" pixels"',
    '      +(fixPalClear ? ", and "+fixClearWords(fixPalClear,fixPalOpaque).replace(" plainly"," of the painted area plainly") : "")',
    '      +" - the furthest by "',
  ]);
doc.swap('      +(fixPalFiles>1&&fixPalWorstFile?"; furthest in "+fixPalWorstFile:"")',
  [
    '      +(fixPalFiles>1&&fixPalWorstFile?"; furthest in "+fixPalWorstFile:"")',
    '      +(fixPalFiles>1&&fixPalMostFile&&fixPalMostShare>0',
    '        ? "; most changed: "+fixPalMostFile+" ("+fixClearWords(fixPalMostShare,1)+")" : "")',
  ]);
/* THE FOLDER'S GRIDLESS CLAUSE, the same fact the single run no longer says:
   on a picture painted edge to edge the coarsest grid always "kept its shape
   and 95% of its paint", because every count keeps all of it. Found by the
   review of this patch. Those files are counted apart. */
doc.swap('let fixGridlessAt=[];',
  [
    'let fixGridlessAt=[];',
    '/* The gridless picks whose source was painted edge to edge (patch626). */',
    'let fixGridlessPaintedAt=[];',
  ]);
doc.swap('  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];',
  '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[]; fixGridlessPaintedAt=[];');
doc.swap('            if(fixGridlessPick){ fixGridlessAt.push(fixGridlessPick);',
  [
    '            if(fixGridlessPick){ fixGridlessAt.push(fixGridlessPick);',
    '              if(fixGridlessPassed&&fixAllPainted({data:px})) fixGridlessPaintedAt.push(fixGridlessPick);',
  ]);
doc.swap('      +(passed ? passed+" put on the coarsest grid that kept its shape and 95% of its paint ("+cellsOf(passedCells)+")" : "")',
  [
    '      +(passed>fixGridlessPaintedAt.length ? (passed-fixGridlessPaintedAt.length)+" put on the coarsest grid that kept its shape and 95% of its paint ("',
    '        +cellsOf((()=>{ const left=passedCells.slice(); for(const c of fixGridlessPaintedAt){ const i=left.indexOf(c); if(i>=0) left.splice(i,1); } return left; })())+")" : "")',
    '      +(passed>fixGridlessPaintedAt.length&&fixGridlessPaintedAt.length ? ", " : "")',
    '      +(fixGridlessPaintedAt.length ? fixGridlessPaintedAt.length+" painted edge to edge put on "+cellsOf(fixGridlessPaintedAt) : "")',
  ]);
doc.swap('      +fixGridCells().cells+" cell grid - type "+[...new Set(fixRecutAt)].sort((a,b)=>a-b)[0]+" to keep them"',
  '      +fixGridCells().cells+" cell grid - type "+[...new Set(fixRecutAt)].sort((a,b)=>a-b)[0]+" to keep them"+fixRecutCaveat([...new Set(fixRecutAt)].sort((a,b)=>a-b)[0])');
doc.swap('      +" resampled onto the "+gS.words+(gS.many?" cell grids":" cell grid")',
  [
    '      +" resampled onto the "+gS.words+(gS.many?" cell grids":" cell grid")',
    '      +fixCoarseNote(Math.min.apply(null,fixTypedResampleAt.map(c=>c.grid)))',
  ]);

doc.finish(({ must }) => {
  must('function fixAllPainted(img){', 'the opaque test');
  must('function fixCoarseNote(cells){', 'the coarse note');
  must('function fixRecutCaveat(block){', 'the gate caveat');
  must('if(far>=10) clear+=mm.c.px;', 'the clear-change count');
  must('clearShare:opaque?clear/opaque:0}', 'the share returned');
  must('fixPalClear+=r.clear||0;', 'the folder total');
  must('fixClearWords(pal.clear,pal.opaque)', 'the single sentence');
  must('" of the painted area plainly"', 'the folder sentence');
  must('fixGridlessPaintedAt.push(fixGridlessPick)', 'the folder gridless count');
  must('fixPalOpaque+=r.opaque||0;', 'the folder area');
  must('fixCoarseNote(resampledBy.grid)', 'the single coarse note');
  must('fixCoarseNote(Math.min.apply(null,fixTypedResampleAt.map(c=>c.grid)))', 'the folder coarse note');
});
