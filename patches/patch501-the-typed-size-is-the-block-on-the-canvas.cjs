/* THE TYPED PIXEL SIZE IS THE BLOCK SIZE ON THE CANVAS, AND A PICTURE TOO
   SMALL FOR THE GRID IS KEPT AS IT IS.

   Measured on the 297 raw sources on 2026-09-18 and verified twice through
   the real page. The user's documented workflow is Pixel size 8 typed,
   Save at 1280 on: "forced 8px, 160-cell grid, 1280 output". The tab read
   that 8 as SOURCE pixels per cell, so only a 1280 source got 160 cells:

     source size   files   cells today   on the gate
     1280          141     160           yes
     1254           86     157, uneven   no  - the library's "Hyperliquid 1254 mistake"
     1024 / 2048    55     128           no  (10px blocks)
     128            10     16            destroyed (Gazers Lunar Eyes lost 47%)
     160             2     20            no
     640/324/256     3     80/41/32      no

   And with nothing typed, a source narrower than the grid with no block
   structure fell through every branch to the fast detector, which on the
   ten 128px sources returned 5 to 39 cells: two eyes traits came out
   completely empty, a 128-cell pixel-art scene came out as nine blocks.

   NOW. With Save at 1280 on, the typed size means the block on the 1280
   canvas: cells = 1280 / size, moved to the nearest count that divides
   1280 within a quarter (the band fixWholeStep always used, applied to the
   canvas instead of the source - the source-divisor requirement is what
   refused 1254, which shares only 1 and 2 with 1280). The step is the
   source width over that count, fractional when it has to be: 1254 is 160
   cells at 7.8375 source pixels each, which the engine takes exactly
   (pf-40-reconstruct.js maps pixels by floor(x*cols/w), so every cell holds
   7 or 8 whole pixels and nothing is sliced). Measured over all 297:

     287 of 297 land on 160 cells, none uneven (was 141 and 87 uneven)
     the ten 128px sources come out lossless at 128 cells
     the 141 sources at 1280 are byte-identical to before

   NEVER UPSAMPLED. A picture narrower than the cells its size means keeps
   its own pixels - one per cell, or its measured block when it has one -
   and the run says the size could not be honoured. The alternative, a
   0.8px step, leaves 32 empty columns and rows: measured, a lattice of
   transparent gaps through the eyes.

   THE COST, STATED. The 14 sources at 1024 drawn in whole 8px blocks are
   today lossless at 128 cells (10px on the canvas, off the gate) and are
   re-cut at 6.4 source pixels per cell under this rule: mean 4.08% of
   their pixels, Loading Spinner Eyes 13.5%. That is what strict 8 costs
   art drawn at 128 cells, and the readout names it: "drawn in 8px blocks
   (128 cells), so each drawn pixel becomes 1.25 cells". With the switch
   off the typed number keeps its old meaning - picture pixels per pixel,
   output at its own size - and the box's title now says both.

   WITH NOTHING TYPED, a source at or below the grid with no block is
   native art at one pixel per cell. Measured: the identity on all twelve
   such sources, byte for byte. A source narrower than the grid that HAS a
   block keeps that block even when its count cannot land on 1280 (the
   repo's own 96px fixture drawn at 4px: 24 cells, uneven on the canvas,
   nothing invented) rather than going to a detector. A source wider than
   the grid whose measured block cannot land on 1280 (two 1024 backgrounds
   drawn at 2px: 512 cells) is re-cut on the grid as before, and now says
   so instead of going quietly.

   WHAT THE RUN SAYS, verified twice each:
   - the single-tab readout printed "pixel size NaN, not 12" for every moved
     size: it read a field the record never had (moved.step; the record
     holds `to`). One token.
   - the folder note advised "turn Snap on, or type a size" on runs where
     both were on. It names the cause it counted now.
   - only the last moved file's size was reported; every moved file
     overwrote one variable. Counted now.
   - pictures the search never placed were counted as "put on the coarsest
     grid that kept its shape ( cells)" with an empty list; fixNoGrid is
     counted only when a gridless count is used.
   - the readout, the after-run caption and the box title say cells, canvas
     block and source pixels per cell, so "pixel size 7.84 px" on a 1254
     source cannot read as 8 not honoured.
   - a source narrower than the grid is reported as kept, not "worked out".
   - the note counts the files that are not on the collection grid, by
     block size, so Pixel size 0 following the picture's own grid is a
     stated fact rather than a silent one. Which default the collection
     wants is the user's decision; the count is the same either way.
   - the offered "even" sizes for a picture drawn in blocks all resampled
     it (3, 6 and 12 on the 96px/4 fixture changed 25.7%, 46.2% and 66.3%
     of its pixels while the readout called them "divide evenly"); a
     picture with a measured block gets no offer, and a sentence instead.
   - "Open in the editor" installed a whole-number grid on a result whose
     cells were not whole (gridBlock 8 on 157 cells: 24 of them 9px wide),
     so the brush straddled cells. A result that does not divide the canvas
     opens at 1.

   Tests: typedoncanvas.spec.js, nativekept.spec.js. Rewritten with the new
   meaning: fixergrid.spec.js (three), fixerscale.spec.js (two),
   fixer.spec.js (one assertion), each saying what it replaced.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 0. the state the decisions leave behind ------------------------- */
{
  const at = kit.only(L, l => l === 'let fixGridlessPick=0;', 'the gridless pick');
  kit.replace(L, { start: at, end: at }, [
    'let fixGridlessPick=0;',
    '/* A TYPED SIZE THAT COULD NOT BE HONOURED, because the picture is narrower',
    '   than the cells it means on the canvas, and what was kept instead: one',
    '   pixel per cell, or the block the picture is drawn in. Set per decision',
    '   by fixStepFor; read by the readout and the folder note. */',
    'let fixUnhonoured=null;',
    '/* A MEASURED BLOCK WHOSE COUNT CANNOT LAND ON THE CANVAS (1024 drawn at',
    '   2px is 512 cells), so the grid re-cut it. Said rather than silent. */',
    'let fixBlockUnfit=null;',
    '/* THE FOLDER RUN\'S TALLIES, kept per file inside the loop because only',
    '   the cell count survives it, and a count cannot say why. */',
    'let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[];',
  ]);
}

/* ---- 1. the decision ------------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  kit.replace(L, fn, [
    'function fixStepFor(w,data,h){',
    '  /* THIS DECISION, NOT THE LAST ONE. Every flag below describes the step',
    '     about to be returned; left over from a previous call, any of them',
    '     puts that label on a different answer. */',
    '  fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null;',
    '  const asked=+$("fixforce").value||0;',
    '  const onGrid=$("fixgrid")&&$("fixgrid").checked;',
    '  const px=data||(FIX.src&&FIX.src.data);',
    '  const ph=h||(FIX.src&&FIX.src.height)||0;',
    '  const g=fixGridCells();',
    '  /* A NUMBER IN THE BOX IS AN INSTRUCTION, AND IT WINS.',
    '',
    '     This used to sit below the snap, so while the snap was on the',
    '     measured block answered and the box was ignored - asking sixteen',
    '     glasses for 4 gave 5, 8 and 10 and never 4. The measurement is there',
    '     to beat the declared grid, which is a setting nobody chose for this',
    '     picture; it has no business beating a size somebody typed for it.',
    '',
    '     0 still means work it out, which is what the box has always said. */',
    '  if(asked>0){',
    '    /* WITH THE SWITCH OFF it is what it always was: how many picture',
    '       pixels make one pixel, and the output is its own size. */',
    '    if(!onGrid) return asked;',
    '    /* ON THE 1280 CANVAS THE TYPED SIZE IS THE BLOCK SIZE THERE. It used',
    '       to be source pixels per cell here too, so 8 on a 1254 source gave',
    '       157 cells and uneven pixels (86 of the 297 raw sources - the',
    '       library\'s "Hyperliquid 1254 mistake"), 128 cells on 1024 and',
    '       2048 sources (10px blocks, 55 files) and 16 cells on the ten 128px',
    '       ones, which destroyed them. The count is worked out on the canvas',
    '       now - 1280 over the size, moved to the nearest count that divides',
    '       1280 within a quarter, the same band fixWholeStep always used but',
    '       applied to the canvas rather than the source, whose divisors are',
    '       what refused 1254 - and the step is whatever the source width',
    '       makes of that count. 1254 over 160 is 7.8375, and the engine takes',
    '       it exactly: it maps pixels by floor(x*cols/w), so every cell holds',
    '       seven or eight whole source pixels and nothing is sliced.',
    '       Measured over all 297: 287 land on 160 cells, none uneven, the',
    '       141 at 1280 byte-identical to before. A source drawn in blocks',
    '       the size did not ask for IS re-cut (the 14 at 1024 drawn at 8px:',
    '       mean 4.08% of their pixels), which is what strict 8 costs art',
    '       drawn at 128 cells; the readout names it. */',
    '    const want=Math.max(1,Math.round(CANVAS_SIDE/asked));',
    '    let cells=0;',
    '    if(CANVAS_SIDE%want===0) cells=want;',
    '    else{',
    '      const fix=fixWholeStep(CANVAS_SIDE,asked);',
    '      if(fix){ cells=fix.cols; fixMoved={from:asked, to:fix.step, cols:fix.cols, was:fix.was}; }',
    '    }',
    '    /* Nothing within a quarter of what was asked - 3 means 427 cells and',
    '       the nearest that lands is 320 - so it keeps the old meaning and',
    '       the readout says the pixels come out uneven. */',
    '    if(!cells) return asked;',
    '    if(w<cells||ph<cells){',
    '      /* NEVER UPSAMPLE. A picture narrower than the cells its size means',
    '         cannot answer them without inventing pixels: a 0.8px step on a',
    '         128px source leaves 32 empty columns and rows, measured as a',
    '         lattice of transparent gaps through the eyes. It keeps its own',
    '         pixels - one per cell, or the block it is drawn in - and the run',
    '         says the size could not be honoured. A move to a count the',
    '         picture cannot hold is not a move, so that note is cleared. */',
    '      const nat=px?fixNativeBlockFor(px,w,ph):0;',
    '      const keep=nat>1?nat:1;',
    '      fixMoved=null;',
    '      fixUnhonoured={asked:asked, cells:cells, w:w, step:keep, cols:Math.max(1,Math.round(w/keep))};',
    '      return keep;',
    '    }',
    '    return w/cells;',
    '  }',
    '  if(fixSnapping()){',
    '    /* THE PICTURE FIRST, THE SETTING SECOND. projectGrid says 160 and the',
    '       art is mostly drawn at 128 cells; forcing the setting cut 8px cells',
    '       through 10px blocks and deleted up to 23% of a trait. A measured',
    '       block is exact, so reducing on its boundaries loses nothing. */',
    '    const nat=px?fixNativeBlockFor(px,w,ph):0;',
    '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){ fixMeasuredBlock=nat; return nat; }',
    '    /* AT OR BELOW THE GRID, THE PICTURE IS ALREADY AT ITS OWN SIZE. With',
    '       no block it is one pixel per cell - measured the identity, byte for',
    '       byte, on all twelve such sources - and with a block it keeps that',
    '       block even when its count cannot land on 1280 (a 96px picture',
    '       drawn at 4px is 24 cells, uneven on the canvas, nothing invented).',
    '       Both used to fall through to the fast detector, which on the ten',
    '       128px sources answered 5 to 39 cells and emptied two of them. */',
    '    if(g.exact&&w>0&&ph>0&&w<=g.cells&&ph<=g.cells){',
    '      fixMeasuredBlock=nat>1?nat:1;',
    '      return fixMeasuredBlock;',
    '    }',
    '    if(nat>1){',
    '      /* A BLOCK THE CANVAS CANNOT HOLD: 1024 drawn at 2px is 512 cells and',
    '         1280/512 is not whole. The grid re-cuts it, as it always did, and',
    '         now says so. */',
    '      fixBlockUnfit={block:nat, cells:Math.round(w/nat)};',
    '    }else{',
    '      /* NO BLOCK STRUCTURE. Letting the detectors answer here was tried',
    '         and is worse: their counts are things like 510 and 127, which do',
    '         not divide the canvas, so the blocks come out ragged - 48 traits',
    '         of 319 against 3. A picture with no grid loses detail under any',
    '         reduction, so the declared grid at least keeps the pixels square,',
    '         and fixNoGrid is how the run says which ones these were - counted',
    '         only when a gridless count is actually used, so a picture the',
    '         search could not place is not reported as placed. */',
    '      /* NO GRID TO KEEP, so keep the shape instead. Forcing the declared',
    '         count on these moved two traits by a fifth of the canvas and cost',
    '         one of them 27.5% of its pixels. */',
    '      const cells=px?fixGridlessCells(px,w,ph||w):0;',
    '      if(cells>0&&w>0){ fixNoGrid++; fixGridlessPick=cells; return w/cells; }',
    '    }',
    '    const s=fixSnapStep(w);',
    '    if(s>0) return s;',
    '  }',
    '  /* Nothing decided it: 0, which means the detectors answer. */',
    '  return asked;',
    '}',
  ]);
}

/* ---- 2. the whole-step rule's comment, superseded in part ------------- */
{
  const at = kit.only(L, l => l === 'const WHOLE_STEP_NEAR=0.25;', 'the whole-step band');
  kit.replace(L, { start: at, end: at }, [
    '/* SUPERSEDED IN PART (2026-09-18). The rule above is still what decides',
    '   whether a count within a quarter of the one asked for divides 1280,',
    '   and fixStepFor now asks it about the CANVAS (fixWholeStep(1280, size))',
    '   rather than the source, so the source-divisor requirement below no',
    '   longer refuses 1254. The 96px picture drawn in 4px blocks is handled',
    '   before this is reached: narrower than the cells its size means, it',
    '   keeps its own blocks. The requirement stays for the switch-off path,',
    '   where the output is its own size and a whole step is the whole point. */',
    'const WHOLE_STEP_NEAR=0.25;',
  ]);
}

/* ---- 3. the readout -------------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function fixSizeHint(){');
  kit.replace(L, fn, [
    'function fixSizeHint(){',
    '  const el=$("fixsize"); if(!el) return;',
    '  /* SCALE MODE HAS NO PIXEL SIZE. The count is the image itself, so the',
    '     readout works without the field and says the same thing about the',
    '     grid that it says for a fixed result. */',
    '  const scale=fixMode()==="scale";',
    '  const wantSnap=fixSnapping();',
    '  const g=fixGridCells();',
    '  const typed=+$("fixforce").value||0;',
    '  /* BEFORE THE BAIL-OUT BELOW. An impossible grid produces no step, so the',
    '     "nothing to say" line further down would return an empty readout and',
    '     the warning never runs - silence in exactly the case that most needs',
    '     a sentence. */',
    '  if(FIX.src&&wantSnap&&!g.exact){',
    '    el.textContent="\\u2192 the "+g.cells+" cell grid does not divide "+CANVAS_SIDE',
    '      +" evenly, so blocks would come out uneven - turn Snap off, or set a grid that divides it";',
    '    return;',
    '  }',
    '  const snap=wantSnap&&fixSnapStep(FIX.src?FIX.src.width:0)>0;',
    '  /* NARROWER THAN THE GRID. The snap cannot apply, and what happens',
    '     instead - kept at its own pixels, or the typed size - is said below',
    '     as part of the answer rather than instead of it. A first version',
    '     returned here with only the refusal, which hid the one thing the',
    '     readout is for: what is about to be produced. */',
    '  const narrow=!!(FIX.src&&wantSnap&&g.exact&&FIX.src.width<g.cells);',
    '  if(!FIX.src||(!scale&&!snap&&!narrow&&typed<=0)){ el.textContent=""; return; }',
    '  /* THE COUNT THE RUN WILL ACTUALLY USE, moved size and all. This used to',
    '     decide for itself that a snapped run lands on the declared grid',
    '     "whatever the source measures", and then the run started measuring',
    '     the source - so the line said 160 on a picture about to come out at',
    '     256. A readout that describes a different answer than the one about',
    '     to be produced is worse than no readout, and the only way it can be',
    '     right for good is to stop being a second opinion: fixStepFor decides,',
    '     and leaves its notes in the module flags read here. */',
    '  const W=FIX.src.width, H=FIX.src.height;',
    '  const nat=FIX.src.data?fixNativeBlockFor(FIX.src.data,W,H):0;',
    '  const decided=scale?0:fixStepFor(W,FIX.src.data,H);',
    '  const moved=fixMoved, unhon=fixUnhonoured, unfit=fixBlockUnfit, meas=fixMeasuredBlock;',
    '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    '  const cols=scale?W:(decided>0?Math.max(1,Math.round(W/decided)):g.cells);',
    '  const rows=scale?H:(decided>0?Math.max(1,Math.round(H/decided)):g.cells);',
    '  /* AND WHETHER IT LANDS ON THE COLLECTION GRID. 1280/128 is 10 and every',
    '     pixel comes out identical; 1280/85 is 15.06 and they differ by one.',
    '     That is the difference between a trait that sits on the grid and one',
    '     that does not, and it is worth knowing before 320 of them rather than',
    '     after. Only said when the switch is on, because it is only true then. */',
    '  /* TWO LINES, MEASURED. The readout reserves two lines so nothing below',
    '     it moves when the sentence changes (fixerlayout.spec.js pins that),',
    '     and the narrowest column holds about 166 characters of this font.',
    '     Every sentence built here fits that; the first draft ran to 262 and',
    '     took a third line, which is why each clause is as short as it is',
    '     and why the offer of other sizes is left out when a size could not',
    '     be honoured - the sentence that says why already covers it. */',
    '  let note="";',
    '  if(gridOn){',
    '    const k=CANVAS_SIDE/cols;',
    '    note = (cols===rows && Number.isInteger(k))',
    '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
    '      : " \\u00b7 "+CANVAS_SIDE+"/"+cols+" is "+(Math.round(k*100)/100)',
    '        /* NOT IN SCALE MODE: there is no other size to pick, because',
    '           nothing is being detected. Offering one would read as advice',
    '           to go and re-fix a finished picture. */',
    '        +", so pixels come out uneven"+((scale||unhon||narrow)?"":fixEvenSizes(nat));',
    '  }',
    '  /* HOW MANY PICTURE PIXELS MAKE ONE CELL, whenever that is not the plain',
    '     answer: a 1254 picture on 160 cells is 7.84 source pixels per cell,',
    '     and "x8 to 1280" alone would read as if 8 had not been honoured. */',
    '  let per="";',
    '  if(!scale&&gridOn&&decided>0&&W!==CANVAS_SIDE&&!unhon)',
    '    per=" \\u00b7 "+(Math.round(decided*100)/100)+" source pixel"+(decided===1?"":"s")+" per cell";',
    '  /* AND WHAT THAT DOES TO ART DRAWN IN BLOCKS the size did not ask for:',
    '     10px art on 8px cells is a resample, and no rule avoids it. */',
    '  let recut="";',
    '  if(!scale&&typed>0&&gridOn&&nat>1&&decided>0&&Math.abs(decided-nat)>1e-9&&!unhon)',
    '    recut=" \\u00b7 "+nat+"px blocks ("+Math.round(W/nat)+" cells) become "',
    '      +(Math.round(cols/(W/nat)*100)/100)+" cells each";',
    '  let snapNote="";',
    '  if(narrow&&typed<=0){',
    '    snapNote=" \\u00b7 "+W+" across cannot be snapped to "+g.cells+" cells, so it "',
    '      +(meas===1?"is kept at one pixel per cell":meas>1?"keeps its own "+meas+"px blocks":"is being worked out instead");',
    '  }else if(narrow&&typed>0&&!gridOn){',
    '    snapNote=" \\u00b7 "+W+" across cannot be snapped to "+g.cells+" cells, so the pixel size is used instead";',
    '  }',
    '  const unhonNote = unhon',
    '    ? " \\u00b7 "+typed+" means "+unhon.cells+" cells on "+CANVAS_SIDE+"; "+W+" across cannot give that, so it keeps "',
    '      +(unhon.step===1?"one pixel per cell":"its own "+unhon.step+"px blocks")',
    '    : "";',
    '  const unfitNote = unfit',
    '    ? " \\u00b7 "+unfit.block+"px blocks ("+unfit.cells+" cells) cannot land on "+CANVAS_SIDE+"; the "+g.cells+" cell grid re-cuts them"',
    '    : "";',
    '  /* `to`, the field the record has. This read `.step`, which it never had,',
    '     and printed "pixel size NaN, not 12" on every moved size. */',
    '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note+per+recut+snapNote+unhonNote+unfitNote',
    '    +(moved?" \\u00b7 pixel size "+(Math.round(moved.to*100)/100)+", not "+typed',
    '      +": "+moved.was+" cells does not divide "+CANVAS_SIDE:"");',
    '}',
  ]);
}

/* ---- 4. the offers: none that resample a picture drawn in blocks ------ */
{
  const at = kit.only(L, l => l === 'function fixEvenSizes(){', 'fixEvenSizes');
  if (L[at + 1] !== '  if(!FIX.src) return "";') throw new Error('fixEvenSizes does not open the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    'function fixEvenSizes(nat){',
    '  if(!FIX.src) return "";',
    '  /* A PICTURE DRAWN IN BLOCKS has exactly one count that keeps them whole,',
    '     its own, so the only size worth offering is that one, when it lands;',
    '     when it does not, there is no size to offer that is not a resample.',
    '     Measured on the 96px fixture drawn at 4px: the 3, 6 and 12 this used',
    '     to offer changed 25.7%, 46.2% and 66.3% of its pixels, while the',
    '     readout called them "divide evenly". */',
    '  if(nat>1){',
    '    const own=Math.round(FIX.src.width/nat);',
    '    return CANVAS_SIDE%own===0',
    '      ? ". Type "+nat+" to keep its "+nat+"px blocks ("+own+" cells)."',
    '      : ". No size lands its "+nat+"px blocks on "+CANVAS_SIDE+" without resampling.";',
    '  }',
  ]);
}
{
  const at = kit.only(L, l => l === 'function fixTryThese(){', 'fixTryThese');
  if (L[at + 1] !== '  if(!FIX.src) return "";' || L[at + 2] !== '  const W=FIX.src.width, H=FIX.src.height, long=Math.max(W,H);')
    throw new Error('fixTryThese does not open the way this expects');
  kit.replace(L, { start: at + 2, end: at + 2 }, [
    '  const W=FIX.src.width, H=FIX.src.height, long=Math.max(W,H);',
    '  /* A PICTURE NO BIGGER THAN THE GRID is already at its own size; the one',
    '     size worth trying is 1, which the divisor search below never names. */',
    '  if(W<=fixGridCells().cells&&H<=fixGridCells().cells) return "Try 1, which keeps it as it is ("+W+"\\u00d7"+H+").";',
  ]);
}

/* ---- 5. the after-run caption and sentence --------------------------- */
{
  const at = kit.only(L, l => l.startsWith('        $("fixaftercap").textContent=r.width+"\\u00d7"+r.height+" real pixels \\u00b7 pixel size "'), 'the after-run caption');
  kit.replace(L, { start: at, end: at }, [
    '        /* AND THE BLOCK ON THE CANVAS, when there is one: "pixel size 7.84 px"',
    '           on a 1254 source reads as if 8 had not been honoured. */',
    '        const onCanvas=(()=>{ const on=$("fixgrid")&&$("fixgrid").checked; const k=CANVAS_SIDE/r.width;',
    '          return (on&&r.width===r.height&&Number.isInteger(k)) ? " \\u00b7 "+k+" px on the "+CANVAS_SIDE+" canvas" : ""; })();',
    L[at].replace(/;\s*$/, '') + '+onCanvas;',
  ]);
}
{
  const at = kit.only(L, l => l === '          ? "measured "+r.measuredBlock+"px blocks off the picture"', 'the measured sentence');
  kit.replace(L, { start: at, end: at }, [
    '          ? (r.measuredBlock===1',
    '            ? "kept at one pixel per cell - the picture is already at its native size"',
    '            : "measured "+r.measuredBlock+"px blocks off the picture")',
  ]);
}

/* ---- 6. the editor hand-off ------------------------------------------ */
{
  const fn = kit.inFunction(L, 'function fixBlockFor(cells,side){');
  kit.replace(L, fn, [
    'function fixBlockFor(cells,side){',
    '  if(!(cells>0)||!(side>0)) return 1;',
    '  const b=side/cells;',
    '  /* WHOLE, OR ONE. This rounded, so a 157-cell result opened with',
    '     gridBlock 8 while 24 of its cells were 9px wide and only 19 of 157',
    '     cell edges sat on the 8 grid: the brush straddled cells. A result',
    '     that does not divide the canvas has no block the brush can use. */',
    '  return (b>=1.5&&Number.isInteger(b)) ? b : 1;',
    '}',
  ]);
  const at = kit.only(L, l => l === '  adoptBlock(fixBlockFor(r.width,W));', 'fixOpen adopt');
  kit.replace(L, { start: at, end: at }, [
    '  adoptBlock(r.width===r.height ? fixBlockFor(r.width,W) : 1);',
  ]);
}

/* ---- 7. the folder run: tallies and the note ------------------------- */
{
  const at = kit.only(L, l => l === '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];', 'the batch reset');
  kit.replace(L, { start: at, end: at }, [
    '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];',
    '  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[];',
  ]);
  const c0 = kit.only(L, l => l === '        mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);', 'the batch decision');
  if (L[c0 + 1] !== '          if(fixGridlessPick) fixGridlessAt.push(fixGridlessPick);' || L[c0 + 2] !== '          return s>0?s:null; })()});')
    throw new Error('the batch decision closure does not read the way this expects');
  kit.replace(L, { start: c0, end: c0 + 2 }, [
    '        mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);',
    '          if(fixGridlessPick) fixGridlessAt.push(fixGridlessPick);',
    '          /* THE DECISION, RECORDED PER FILE. Only the cell count survives',
    '             the loop, and a count cannot say why; and one variable for',
    '             "the move" was every moved file overwriting the last. */',
    '          if(fixMoved){ fixMovedCount++; fixMovedLast=fixMoved; }',
    '          if(fixUnhonoured) fixUnhonouredAt.push(fixUnhonoured);',
    '          if(fixMeasuredBlock===1) fixNativeKept++;',
    '          else if(fixMeasuredBlock>1&&(sw<fixGridCells().cells||sh<fixGridCells().cells)) fixOwnBlocks++;',
    '          if(fixBlockUnfit) fixUnfitAt.push(fixBlockUnfit.block);',
    '          return s>0?s:null; })()});',
  ]);
  /* the small note says what happened instead */
  const s0 = kit.only(L, l => l === '  const smallNote = tooSmall', 'the small note');
  if (L[s0 + 1] !== '    ? " \\u00b7 "+tooSmall+" narrower than the "+fixGridCells().cells' || L[s0 + 2] !== '      +" cell grid, so the snap could not be used on them"')
    throw new Error('the small note does not read the way this expects');
  kit.replace(L, { start: s0 + 2, end: s0 + 2 }, [
    '      +" cell grid, so the snap could not be used on them"',
    '      +((fixNativeKept||fixOwnBlocks) ? ": "+[fixNativeKept?fixNativeKept+" kept at one pixel per cell":"",',
    '        fixOwnBlocks?fixOwnBlocks+" kept on their own blocks":""].filter(Boolean).join(", ") : "")',
  ]);
  /* the ragged note names the cause it counted */
  const r0 = kit.only(L, l => l === '  const raggedNote = ragged', 'the ragged note');
  if (L[r0 + 2] !== '      +CANVAS_SIDE+", so their pixels are uneven - turn Snap on, or type a size"')
    throw new Error('the ragged note does not read the way this expects');
  kit.replace(L, { start: r0 + 2, end: r0 + 2 }, [
    '      +CANVAS_SIDE+", so their pixels are uneven"',
    '      /* THE CAUSE IT COUNTED. This said "turn Snap on, or type a size" on',
    '         runs where both were on - advice already followed. */',
    '      +((+$("fixforce").value||0)>0 ? " - "+(+$("fixforce").value)+" cannot land on "+CANVAS_SIDE+" for them"',
    '        : wantedSnap ? " - they are drawn in blocks the grid cannot hold"',
    '        : " - turn Snap on, or type a size")',
  ]);
  /* the moved note counts */
  const m0 = kit.only(L, l => l === '  const movedNote = fixMoved', 'the moved note');
  if (L[m0 + 3] !== '      +", and "+fixMoved.cols+" does"' || L[m0 + 4] !== '    : "";')
    throw new Error('the moved note does not read the way this expects');
  kit.replace(L, { start: m0, end: m0 + 4 }, [
    '  const movedNote = fixMovedLast',
    '    ? " \\u00b7 pixel size "+(Math.round(fixMovedLast.to*100)/100)+" was used, not "',
    '      +fixMovedLast.from+(fixMovedCount>1?", on "+fixMovedCount+" files":"")+": "+fixMovedLast.was',
    '      +" cells does not divide "+CANVAS_SIDE+", and "+fixMovedLast.cols+" does"',
    '    : "";',
    '  /* A TYPED SIZE THE PICTURE COULD NOT HOLD, and what it kept instead. */',
    '  const unhonNote = fixUnhonouredAt.length',
    '    ? " \\u00b7 "+fixUnhonouredAt.length+" narrower than the "+fixUnhonouredAt[0].cells+" cells that "',
    '      +fixUnhonouredAt[0].asked+" means on "+CANVAS_SIDE+" and kept their own pixels instead"',
    '    : "";',
    '  /* A MEASURED BLOCK THE GRID RE-CUT, because its count cannot land. */',
    '  const unfitNote = fixUnfitAt.length',
    '    ? " \\u00b7 "+fixUnfitAt.length+" drawn in blocks the grid cannot hold ("',
    '      +[...new Set(fixUnfitAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+") and re-cut on the "',
    '      +fixGridCells().cells+" cell grid"',
    '    : "";',
    '  /* HOW MANY ARE NOT ON THE COLLECTION GRID, by the block they came out',
    '     at. With nothing typed the tab follows the picture\'s own grid, which',
    '     is a stated design; whether the collection wants that as its default',
    '     is a decision, and this count is what the decision is about. */',
    '  const offGrid = gridOn ? fixBatchFiles.filter(f=>f.cells&&f.cells!==fixGridCells().cells) : [];',
    '  const offNote = offGrid.length',
    '    ? (()=>{ const by=new Map(); for(const f of offGrid){ const k=Math.round(CANVAS_SIDE/f.cells*100)/100; by.set(k,(by.get(k)||0)+1); }',
    '        return " \\u00b7 "+offGrid.length+" not on the "+fixGridCells().cells+" cell grid ("',
    '          +[...by.entries()].sort((a,b)=>b[1]-a[1]).map(([k,n])=>n+" at "+k+"px").join(", ")+")"',
    '          +((+$("fixforce").value||0)>0 ? "" : " - type "+(CANVAS_SIDE/fixGridCells().cells)+" to force it, which re-cuts art drawn at another size"); })()',
    '    : "";',
  ]);
  const say = kit.only(L, l => l === '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+raggedNote+smallNote+noGridNote+shrunkNote+palNote', 'the note line');
  kit.replace(L, { start: say, end: say }, [
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+unfitNote+offNote+shrunkNote+palNote',
  ]);
}

/* ---- 8. the box says both meanings ----------------------------------- */
{
  const at = kit.only(L, l => l === '      title="How many pixels of the picture make one pixel of the artwork, in whole numbers. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">', 'the box title markup');
  kit.replace(L, { start: at, end: at }, [
    '      title="The pixel size of the result, in whole numbers. With Save at 1280 on that is the block on the 1280 canvas - 8 means 160 cells whatever size the picture is; with it off, how many picture pixels make one pixel. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">',
  ]);
  const t0 = kit.only(L, l => l === '    : "How many pixels of the picture make one pixel of the artwork."', 'the box title in fixModeUI');
  kit.replace(L, { start: t0, end: t0 }, [
    '    : "The pixel size of the result. With Save at 1280 on that is the block on the "+CANVAS_SIDE',
    '      +" canvas - 8 means "+(CANVAS_SIDE/8)+" cells whatever size the picture is; with it off, how many"',
    '      +" picture pixels make one pixel."',
  ]);
}

/* ---- 9. checks, then the write --------------------------------------- */
const grew = kit.save(doc, ({ code, codeLines, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  need('const fix=fixWholeStep(CANVAS_SIDE,asked);');
  need('fixUnhonoured={asked:asked, cells:cells, w:w, step:keep, cols:Math.max(1,Math.round(w/keep))};');
  need('fixMeasuredBlock=nat>1?nat:1;');
  need('fixBlockUnfit={block:nat, cells:Math.round(w/nat)};');
  need('if(cells>0&&w>0){ fixNoGrid++; fixGridlessPick=cells; return w/cells; }');
  need('(Math.round(moved.to*100)/100)');
  never('moved.step');
  never('const typed=+$("fixforce").value||0;\n  /* A TYPED SIZE THAT CANNOT LAND IS MOVED');
  need('return (b>=1.5&&Number.isInteger(b)) ? b : 1;');
  need('adoptBlock(r.width===r.height ? fixBlockFor(r.width,W) : 1);');
  need('const movedNote = fixMovedLast');
  never('const movedNote = fixMoved\n');
  need('+movedNote+unhonNote+raggedNote+smallNote+noGridNote+unfitNote+offNote+shrunkNote+palNote');
  need('kept at one pixel per cell - the picture is already at its native size');

  /* THE DECISION, EXERCISED. The tab\'s functions carved out of the new text',
     run against a shim of the controls, on the cases the numbers came from. */
  const carve = (name) => {
    const a = lines.findIndex(l => l === 'function ' + name || l.startsWith('function ' + name + '('));
    if (a < 0) throw new Error('cannot carve ' + name);
    for (let i = a + 1; i < lines.length; i++) if (lines[i] === '}') return lines.slice(a, i + 1).join('\n');
    throw new Error('unterminated ' + name);
  };
  const constOf = (sig) => { const a = lines.findIndex(l => l.startsWith(sig)); if (a < 0) throw new Error('no ' + sig); let i = a; while (!/;\s*$/.test(lines[i])) i++; return lines.slice(a, i + 1).join('\n'); };
  const FNS = ['fixGridCells', 'fixSnapping', 'fixSnapStep', 'fixCanvasCounts', 'fixWholeStep', 'fixNativeBlock', 'fixNativeBlockFor', 'fixGridlessCells', 'fixStepFor', 'fixMode', 'fixBlockFor'];
  let src = 'let fixMoved=null, fixNoGrid=0, fixGridlessAt=[], fixMeasuredBlock=0, fixGridlessPick=0, fixUnhonoured=null, fixBlockUnfit=null;\nconst FIX={src:null};\n';
  for (const c of ['const CANVAS_SIDE=', 'let projectGrid=', 'const WHOLE_STEP_NEAR=', 'const FIX_GRIDLESS_KEEP=']) src += constOf(c) + '\n';
  for (const f of FNS) src += carve(f) + '\n';
  src += 'return {' + FNS.join(',') + ', state:()=>({fixMoved,fixMeasuredBlock,fixGridlessPick,fixUnhonoured,fixBlockUnfit,fixNoGrid})};';
  const DOM = { fixforce: { value: '0' }, fixgrid: { checked: true }, fixsnap: { checked: true }, fixmode: { value: 'fast' } };
  const T = new Function('$', src)(id => DOM[id] || null);
  const flat = (W, cell, transparentQuadrant) => { const d = new Uint8ClampedArray(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); if (transparentQuadrant && cx < 2 && cy < 2) continue; const k = (cx * 5 + cy * 3) % 4; const i = (y * W + x) * 4; d[i] = [46, 139, 242, 232][k]; d[i + 1] = [34, 95, 166, 213][k]; d[i + 2] = [47, 191, 90, 183][k]; d[i + 3] = 255; } return d; };
  const noisy = (W) => { const d = new Uint8ClampedArray(W * W * 4); let s = 99; for (let i = 0; i < W * W; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; d[i * 4] = s & 255; d[i * 4 + 1] = (s >> 8) & 255; d[i * 4 + 2] = (s >> 16) & 255; d[i * 4 + 3] = 255; } return d; };
  const decide = (force, grid, snap, w, data) => { DOM.fixforce.value = String(force); DOM.fixgrid.checked = grid; DOM.fixsnap.checked = snap; return { step: T.fixStepFor(w, data, w), ...T.state() }; };
  const expectEq = (what, got, want) => { if (got !== want) throw new Error(what + ': got ' + got + ', wanted ' + want); };

  let r = decide(8, true, true, 1254, noisy(1254));
  expectEq('1254 typed 8: step', r.step, 1254 / 160); expectEq('1254 typed 8: moved', r.fixMoved, null);
  r = decide(8, true, true, 1280, flat(1280, 10));
  expectEq('1280 typed 8: step', r.step, 8);
  r = decide(12, true, true, 1280, flat(1280, 10));
  expectEq('1280 typed 12: step', r.step, 10); expectEq('1280 typed 12: moved to', r.fixMoved && r.fixMoved.to, 10); expectEq('1280 typed 12: was', r.fixMoved && r.fixMoved.was, 107);
  r = decide(8, true, true, 1024, flat(1024, 8));
  expectEq('1024 typed 8: step', r.step, 6.4);
  r = decide(8, true, true, 128, noisy(128));
  expectEq('128 typed 8: step', r.step, 1); expectEq('128 typed 8: unhonoured cells', r.fixUnhonoured && r.fixUnhonoured.cells, 160); expectEq('128 typed 8: moved cleared', r.fixMoved, null);
  r = decide(4, true, true, 96, flat(96, 4));
  expectEq('96/4 typed 4: keeps its block', r.step, 4); expectEq('96/4 typed 4: unhonoured', !!r.fixUnhonoured, true);
  r = decide(12, true, true, 96, flat(96, 4));
  expectEq('96/4 typed 12: keeps its block', r.step, 4);
  r = decide(3, true, true, 1280, flat(1280, 10));
  expectEq('1280 typed 3: the old meaning', r.step, 3); expectEq('1280 typed 3: not moved', r.fixMoved, null);
  r = decide(8, false, true, 1254, noisy(1254));
  expectEq('1254 typed 8, switch off: source pixels', r.step, 8);
  r = decide(0, true, true, 128, noisy(128));
  expectEq('128 snap 0: native', r.step, 1); expectEq('128 snap 0: stamped', r.fixMeasuredBlock, 1); expectEq('128 snap 0: not gridless', r.fixNoGrid, 0);
  r = decide(0, true, true, 128, flat(128, 8));
  expectEq('128 8px snap 0: measured', r.step, 8); expectEq('128 8px: stamp', r.fixMeasuredBlock, 8);
  r = decide(0, true, true, 96, flat(96, 4));
  expectEq('96/4 snap 0: its own block', r.step, 4); expectEq('96/4 snap 0: stamped', r.fixMeasuredBlock, 4);
  r = decide(0, true, true, 1280, flat(1280, 10));
  expectEq('1280 10px snap 0: measured', r.step, 10);
  r = decide(0, true, true, 1024, flat(1024, 2));
  expectEq('1024 2px snap 0: the grid', r.step, 6.4); expectEq('1024 2px: said unfit', r.fixBlockUnfit && r.fixBlockUnfit.cells, 512);
  r = decide(0, true, true, 48, flat(48, 3));
  expectEq('48 at 3x: measured 3', r.step, 3); expectEq('48 at 3x: stamp', r.fixMeasuredBlock, 3);
  r = decide(0, true, true, 1280, noisy(1280));
  expectEq('1280 noise snap 0: gridless counted once used', r.fixNoGrid, 1); expectEq('1280 noise: a gridless pick', r.fixGridlessPick > 0, true);
  expectEq('fixBlockFor 157', T.fixBlockFor(157, 1280), 1);
  expectEq('fixBlockFor 128', T.fixBlockFor(128, 1280), 10);
  expectEq('fixBlockFor 640', T.fixBlockFor(640, 1280), 2);
  expectEq('fixBlockFor off', T.fixBlockFor(157, 157), 1);
});

fs.renameSync(TMP, FILE);
console.log('patch501 written, ' + grew + ' bytes');
