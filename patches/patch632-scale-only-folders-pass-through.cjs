/* patch632: A FOLDER IN SCALE ONLY PASSES ITS PICTURES THROUGH, AS A SINGLE RUN DOES.

   Scale only promises the bytes that came in. 040d639 (patch438, "SCALE ONLY MEANS UNTOUCHED") took the palette out
   of the single run's Scale only branch, which has no worker, greyed the palette switch with the title "Not used in
   scale only - that mode passes the picture through untouched", and left the folder's fixPalApply(out), in fixBatch,
   with no mode check. be6adc7 (2026-09-23) moved that call into finish(). 3d9f75d (2026-09-24) added fixOutlineApply
   beside it, gated from the start by fixOutlineWanted, which excludes Scale only but reads the mode live (D2).
   fixPalWanted reads only .checked, and the switch starts ticked and cannot be unticked while greyed, so every
   folder run in Scale only recoloured every picture off the palette (and ran the speck pass) by default - unless
   the switch had been unticked in another mode first. patch627 found it and pinned it as an older defect (specksjoin test 13); the owner, told
   on 2026-10-05 that "a folder run in Scale only still recolours your pictures to the palette" and that it is a bug,
   said "yes go ahead". Measured on live 645dbfe (session 95a77113, scratchpad/p632; a read-only map by four agents
   and a design pass, every load-bearing line re-read):

   D1  finish() calls fixPalApply unconditionally; a Scale only folder recolours, translucent pixels included, and
       the "ready for the collection" count is judged after the recolour, so it disagrees with the single run.
   D2  #fixmode stays live during a folder run. Switched to Quick or Thorough part way, the remaining scale files
       went through the outline pass, since fixOutlineWanted reads the mode live (on pictures no larger than 512 a
       side - fixOutlineRuns refuses bigger ones). The palette step ran on every file anyway (D1); the switch only
       made the palette switch live again.
   D3  The folder's translucency clause chose one wording for the whole folder from fixBrowserRead, which lists only
       browser-read PNGs: a translucent WEBP or GIF, read by the browser, was said to be "kept exactly, byte for
       byte", and one browser-read PNG made every file "rounded".
   D4  The outline switch stayed live and ticked in Scale only, with its "Clean up the black outline" title, and the
       palette switch's label kept its "Change every colour" title (fixModeUI greyed the input only).
   D5  With the size box at 0, a Scale only folder's off-grid clause ended "- type 8 to force it", and a size does
       nothing in Scale only.

   WHAT CHANGES:
   - finish() runs the palette step and the outline pass only when the run is not Scale only, decided by the mode
     captured when the run started (as the crop line beside it already is). fixPalWanted is not made mode-aware: the
     worker's palette is read from it at prepare time, and a Quick folder switched to Scale only part way would then
     send palette:null and lose the count of work the worker already did.
   - A folder counts its translucent files read by the browser, file by file, and says "kept exactly, byte for byte",
     "kept translucent - read by the browser, which rounds their colour", or "kept exactly, byte for byte, except N
     read by the browser, which rounds their colour".
   - fixModeUI greys the outline switch in Scale only and gives both switches' labels a Scale only title, keeping the
     live title the first time it runs (the snap switch's pattern). Neither is unticked: switching back keeps the
     person's setting.
   - The "type 8 to force it" advice is left off in Scale only.
   Superseded comments are kept with a note: snapToPalette's SRC_IN note (no page caller aliases now; the copy stays
   as a guard, and specksjoin test 14 still pins it) and the gate's "after the palette" note.

   NOT CHANGED, measured and left for the owner or another patch: pictures over the engine limit are still reduced
   by a whole factor in Scale only (both paths, and named in the run); with Save at 1280 on, a picture wider than
   1280 or not square is still scaled by the nearest-neighbour rule (both paths); a Quick or Thorough folder switched
   to Scale only part way still loses the outline on its later files (fixOutlineWanted reads the mode live). A
   16-bit PNG is read by the page's own reader at the high byte of each sample and saved at 8 bits, and "kept
   exactly, byte for byte" does not say so (the wording is older than this patch). Found by review, and older than
   this patch (645dbfe says the same): with Save at 1280 on, a Scale only folder counts a finished 1280 picture as
   "not on the 160 cell grid (1 at 1px)" - its cells are its pixels there - while the same line calls it ready for
   the collection.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function fixStrokesKept(', 'patch629 is not applied'],
  ['function fixSpeckWords(n){', 'patch627 is not applied'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('function fixAlphaKeptWords') >= 0) throw new Error('patch632 is already applied');
}

/* ---- D1, D2: the folder's palette step and outline pass, not in Scale only ---- */
doc.swap(
  [
    '      /* Before the canvas is made from it, so the file and the tile agree. */',
    '      fixPalApply(out,rel,{data:px,width:sw,height:sh});',
    '      fixOutlineApply(out,rel,{data:px,width:sw,height:sh});',
    '      /* READY FOR THE COLLECTION, counted here: after the palette, which is',
    '         what decides the colour question, and before the canvas, which',
    '         cannot change any of the four facts. */',
  ],
  [
    '      /* Before the canvas is made from it, so the file and the tile agree. */',
    '      /* SCALE ONLY PASSES THE PICTURE THROUGH (patch632), as the single run does.',
    '         040d639 (patch438, "SCALE ONLY MEANS UNTOUCHED") took the palette out of',
    '         fixRun\'s Scale only branch and left the folder\'s call unguarded;',
    '         be6adc7 moved it here. The palette switch is greyed in Scale only and',
    '         ticked by default, and fixPalWanted reads only .checked, so a Scale only',
    '         folder was recoloured unless the switch had been unticked in another',
    '         mode first. Decided by the mode this run started in, like the crop line',
    '         above: #fixmode stays live during a run, and a switch part way must not',
    '         send the files still to come through either step. Not the other way:',
    '         in a Quick or Thorough folder the outline pass in here still reads the',
    '         mode live (fixOutlineWanted, since 3d9f75d), so a switch to Scale only',
    '         part way drops it from the later files - known, and left. */',
    '      if(!scale){',
    '        fixPalApply(out,rel,{data:px,width:sw,height:sh});',
    '        fixOutlineApply(out,rel,{data:px,width:sw,height:sh});',
    '      }',
    '      /* READY FOR THE COLLECTION, counted here: after the palette, which is',
    '         what decides the colour question, and before the canvas, which',
    '         cannot change any of the four facts. */',
    '      /* (patch632: in Scale only there is no palette step, so the colours',
    '         judged are the ones that came in - as fixGateNote judges them in a',
    '         single run.) */',
  ]);

/* ---- D3: the translucency clause, file by file ---- */
doc.swap('fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[],',
  'fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixAlphaBrowser=0, fixBrowserRead=[],');
doc.swap('fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[];',
  'fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixAlphaBrowser=0; fixBrowserRead=[];');
doc.swap('      { const tl=fixTranslucent(px,sw*sh); if(tl.count){ fixAlphaFiles++; fixAlphaPixels+=tl.count; } }',
  [
    '      /* patch632: and which of them the browser read (any file the page\'s own PNG',
    '         reader did not take - fixDecodeFile\'s how), so the note can say which are',
    '         kept exactly and which have the browser\'s rounding. */',
    '      { const tl=fixTranslucent(px,sw*sh); if(tl.count){ fixAlphaFiles++; fixAlphaPixels+=tl.count; if(dec.how!=="png") fixAlphaBrowser++; } }',
  ]);
doc.swap('      +(scale ? (fixBrowserRead.length ? "kept translucent - read by the browser, which rounds their colour" : "kept exactly, byte for byte") : "counted as paint or clear - the results have none")',
  [
    '      /* SUPERSEDED (patch632): one wording for the whole folder, chosen from',
    '         fixBrowserRead, which lists only browser-read PNGs. See fixAlphaKeptWords. */',
    '      +(scale ? fixAlphaKeptWords(fixAlphaFiles,fixAlphaBrowser) : "counted as paint or clear - the results have none")',
  ]);
doc.swap(
  [
    'function fixRecutCaveat(block){',
  ],
  [
    '/* TRANSLUCENT PIXELS IN A SCALE ONLY FOLDER, file by file (patch632). The page\'s',
    '   own PNG reader keeps them exactly, as 8 bits: a 16-bit file keeps the high',
    '   byte of each sample, and these words do not say so (older than patch632,',
    '   and left - see its header). A file the browser read (fixDecodeFile\'s how',
    '   is not "png") has its colour rounded by the browser\'s premultiplied alpha.',
    '   files and browser are counts of translucent files. */',
    'function fixAlphaKeptWords(files,browser){',
    '  if(!(browser>0)) return "kept exactly, byte for byte";',
    '  if(browser>=files) return "kept translucent - read by the browser, which rounds their colour";',
    '  return "kept exactly, byte for byte, except "+browser+" read by the browser, which rounds their colour";',
    '}',
    'function fixRecutCaveat(block){',
  ]);

/* ---- D5: no "type 8" advice in Scale only ---- */
doc.swap('          +((+$("fixforce").value||0)>0 ? "" : " - type "+(CANVAS_SIDE/fixGridCells().cells)+" to force it, which re-cuts art drawn at another size"); })()',
  [
    '          /* patch632: not in Scale only, where a size does nothing. */',
    '          +((scale||(+$("fixforce").value||0)>0) ? "" : " - type "+(CANVAS_SIDE/fixGridCells().cells)+" to force it, which re-cuts art drawn at another size"); })()',
  ]);

/* ---- D4: the outline switch, and both switches' labels, in Scale only ---- */
doc.swap(
  [
    '  const p=$("fixpal"); if(p){ p.disabled=scale;',
  ],
  [
    '  /* THE LABELS TOO (patch632). The words a hover shows are the label\'s, and',
    '     greying the input left them saying what the switch would do. The live',
    '     words are the markup\'s, kept the first time this runs (the snap',
    '     switch\'s pattern). Neither switch is unticked: switching back keeps the',
    '     person\'s setting. The outline switch is greyed as the palette one is - a',
    '     Scale only run rebuilds nothing, so there is no outline to clean. */',
    '  const scaleLabel=(id,words)=>{ const el=$(id); const lab=el&&el.closest("label"); if(!lab) return;',
    '    if(lab.dataset.live===undefined) lab.dataset.live=lab.title;',
    '    lab.title=scale ? words : lab.dataset.live; };',
    '  scaleLabel("fixpal","Not used in scale only - that mode passes the picture through untouched.");',
    '  scaleLabel("fixline","Not used in scale only - nothing is rebuilt, so there is no outline to clean.");',
    '  const ln=$("fixline"); if(ln) ln.disabled=scale;',
    '  const p=$("fixpal"); if(p){ p.disabled=scale;',
  ]);

/* ---- the comments the fix makes stale ---- */
doc.swap(
  [
    '     a folder run in Scale only does, since its engine\'s answer is the bytes that came in - would have the pass',
    '     read the palette\'s colours as the drawing and refuse every join. So a picture that is d, or another view',
    '     of d\'s bytes, is copied here, before the loop: once, at the one place every caller passes through. */',
  ],
  [
    '     a folder run in Scale only does, since its engine\'s answer is the bytes that came in - would have the pass',
    '     read the palette\'s colours as the drawing and refuse every join. So a picture that is d, or another view',
    '     of d\'s bytes, is copied here, before the loop: once, at the one place every caller passes through.',
    '     SUPERSEDED IN PART (patch632): a Scale only folder no longer runs the palette step, so no page caller hands',
    '     d over now. The copy stays, as the guard at the one place every caller passes through (specksjoin test 14',
    '     still pins it). */',
  ]);

doc.finish(({ text, must }) => {
  const guard = ['      if(!scale){', '        fixPalApply(out,rel,{data:px,width:sw,height:sh});', '        fixOutlineApply(out,rel,{data:px,width:sw,height:sh});', '      }'].join(s0.NL);
  if (text.split(guard).length !== 2) throw new Error('the folder guard is not in the page exactly once');
  if (text.split('\n      fixPalApply(out,rel,{data:px,width:sw,height:sh});').length !== 1) throw new Error('an unguarded folder palette call is left');
  must('function fixAlphaKeptWords(files,browser){', 'the translucency words');
  must('if(dec.how!=="png") fixAlphaBrowser++;', 'the browser count');
  must('fixAlphaPixels=0; fixAlphaBrowser=0; fixBrowserRead=[];', 'the reset');
  must('+(scale ? fixAlphaKeptWords(fixAlphaFiles,fixAlphaBrowser) :', 'the folder clause');
  must('+((scale||(+$("fixforce").value||0)>0) ? "" :', 'the advice left off');
  must('const ln=$("fixline"); if(ln) ln.disabled=scale;', 'the outline switch greyed');
  must('scaleLabel("fixpal",', 'the palette label');
  must('scaleLabel("fixline",', 'the outline label');
});
