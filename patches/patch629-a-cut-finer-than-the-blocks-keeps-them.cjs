/* patch629: A CUT FINER THAN THE BLOCKS KEEPS THEM, AND THE RUN SAYS SO.

   The number 629 was given earlier to a proposal that was withdrawn on 2026-10-02 and never landed (a
   size-8 straddle line in pf-42-repair8). Nothing of it reached the repo; this is the only patch629.

   The owner, 2026-10-02, asked whether the 7 backgrounds drawn on a 10-pixel grid should be redrawn on 8 or
   whether the uneven cut at 8 is okay: "shoulld be whats best". Measured on fe59939 for all 7 (session
   95a77113, scratchpad/n10), against the source blocks:
     - at 8 every one of their 25,600 cells takes the colour of a block it covers, and none is invented.
       Where one block holds the majority of a cell, the cell takes that block in all but 114 of the
       47,974 cases. Next to a perfectly regular re-cut (every cell the block under its centre) the
       pictures look the same, so redrawing them on 8 would not improve them.
     - at 16 they lose their small detail: the code-rain glyphs, the sunflower ring, the slot machines.
   So 8 is the best size for them. The box stays at 16 (the owner, 2026-09-27), and the run is what tells
   the person. It said the opposite. At 8 a run on Backrooms Hallway said "615 strokes one block wide
   will not survive it", and every one of them survives.

   WHY. A cell narrower than the block it is cut from always keeps that block: some 8px cell has at least 6
   of a 10px block's 10 columns, and 6 of its 10 rows, so the block holds the majority there. The sentence
   came from patch515's Make Solana Great Again Hat, drawn at 5px, where the cell is the wider one (1.6
   blocks) and the lettering does come out as rubble. It was written for "10px or 5px art on 8px cells",
   and the 10px half was never measured. Over the 311 working traits at fe59939 (worker path, engine cells
   before the palette), by this patch's own fixStrokesKept:
       10px art at 8    89 files, 76 with strokes   2,623 strokes     0 lost   1,101 now 2 cells wide
       10px art at 16   89 files, 76 with strokes   2,623 strokes   504 lost
        5px art at 8    12 files, 12 with strokes   1,220 strokes   154 lost
        5px art at 16   12 files, 12 with strokes   1,220 strokes   496 lost
   (lost = no cell over the block nearer its colour than the colour beside it, CIEDE2000.) A count written
   apart from it, the same test in RGB distance (scratchpad/n10/strokes.cjs), gives 0 / 505 / 153 / 510:
   the same everywhere the page uses the count (the cut finer than the blocks) and within 14 elsewhere.

   WHAT CHANGES, the sentence only. No cell changes:
   1. When the cells are finer than the blocks, the worker counts what the cut did on the engine's own
      cells, before the palette step writes over them (fixStrokesKept, using fixThinStrokes' own strokes).
      The run says "the cut keeps all N strokes one block wide, M now 2 cells wide", or "the cut loses K of
      its N ..." if the engine ever drops one. It does not predict. It says "the cut" because that is what
      was measured: with the palette on, the palette step and the outline pass can still take a stroke
      afterwards (reviewer B: 12 visible strokes in 5 of the 89 traits at 8), and each says what it did.
   2. When the cells are coarser, "will not survive it" becomes "may not survive it", the words a whole
      merge already uses. Some of the strokes are lost there and most are not: 504 of 2,623 on the 10px
      traits at 16, 154 of 1,220 on the 5px ones at 8. A count is not given instead, because it misleads
      in the other direction. By the same test the hat at 8 loses 41 of its 243 strokes while its
      lettering is unreadable, since a blob of white keeps every stroke "present".
   3. When the cut is coarser and the collection grid would cut finer than the blocks, as with 10px art
      at 16, the run adds "; at 8 the cut keeps them" - the cut, as in 1, because with the palette on the
      palette step can still merge a stroke into its ground at any size (reviewer C: 2 of Green Hill
      Loop's 132, 4 of Miami Beach Clubhouse's 223, 6 of Green Code Rain's 75, at 8 and at 16). This
      is decided with the size, on the canvas only, for
      fixCoarseNote's reason. It is not said when any of the strokes is fainter than the engine's paint
      (alpha 127 or less): those come out clear at every size.
   4. A folder stops listing a finer-cut file as holding detail at risk when the cut kept all of it. It
      says "the cut keeping every stroke one block wide" instead ("... in N of them" beside the files it
      does list). The files it lists hold "detail one block wide that may not survive it", as the merge
      clause beside it already says, since the kept ones hold such detail too. It names 8 the same way.
   Strokes fainter than the engine's paint are left out of the measure. The engine counts a pixel as
   paint when its alpha is over 127, so such a stroke is clear at any size, and the run's translucency
   note already says so; it is not the cut's to keep or lose.

   Reviewed before this version by two agents that did not write it (scratchpad/p629/rev-A, rev-B). Both
   said push after fixes, and their findings are in this version:
   - both: the coarse words were a definite "will not survive" where most strokes survive. On the 89 10px
     traits at 16, 504 of 2,623 are lost; the moved thinstrokes test's picture loses 0 of its 504.
   - A: "8 keeps them" was said for strokes at alpha 100, and at 8 all of them are lost to the alpha rule.
   - B: two branches of fixStrokesKept that real pictures use were not tested - a clear cell is skipped,
     and beside a clear ground any painted cell counts (112 strokes in 22 of the 89 traits). t6 could not
     fail on either; it now can, and two runs on a clear ground use the second.
   - B: "kept" was measured before the palette and the outline pass and did not say so; it says "the cut".
   - smaller, both: the folder ranked lost counts and totals together; "504 of its 504 lost"; "1 stroke
     ... keeps them"; "its stroke ... kept, 1 now 2 cells wide"; "them" pointing at the wrong group after
     the kept clause; the switch and grid read when the answer came back rather than when the size was
     decided; "8 keeps them" against the page's own "type 10 to keep them".
   Then a third agent reviewed that revision (rev-C): push after fixes, and these are in too:
   - strokes that run across were untested (614 of the 7 backgrounds' 1,318); there are tests for them
     now, and the measure on t6's hand-made cells is pinned for a stroke across as well as down;
   - "type 8 to keep them" overclaimed with the palette on (above, 3); it says "at 8 the cut keeps them";
   - the folder's "N of them holding detail one block wide" read as if the kept files held none;
   - untested by any mutant-killing test: a picture with faint and solid strokes together, the alpha
     boundary (127 is faint, 128 is paint), and the folder's "N of them". Each has a test now.
   Left, as rev-C measured: a finer cut that loses a stroke is listed by its total, as coarse files are,
   but no picture reaches that branch (no finer cut lost a stroke on any trait), so no test pins it; and
   fixThinStrokes counts strokes by exact colour, so on Ruins Selfie its 47 strokes differ from their
   ground by under 1 dE - "the cut keeps all 47" is true and about lines nobody can see. That count is
   older than this patch and wants its own.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function fixThinStrokes(data,W,H,block){', 'the page has no fixThinStrokes'],
  ['function fixCropLine(', 'patch628 is not applied'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('function fixStrokesKept') >= 0) throw new Error('patch629 is already applied');
}

/* ---- 1. fixThinStrokes hands each stroke to a caller that wants them --- */
doc.swap('function fixThinStrokes(data,W,H,block){',
  [
    '/* SUPERSEDED IN PART (patch629): "or 10px" above. A 10px block is 1.25 of',
    '   an 8px cell, and a cell narrower than its block keeps the block: some 8px',
    '   cell holds at least 6 of its 10 columns and 6 of its 10 rows. Over the 311',
    '   working traits at fe59939 the 89 drawn at 10px and typed 8 kept all 2,623',
    '   of their strokes. A cut finer than the blocks is now measured on the',
    '   result, not predicted (fixStrokesKept); "cannot hold" stands, as "may',
    '   not hold", for the coarser cut - 5px art at 8, 10px art at 16.',
    '',
    '   visit (patch629), optional: called once per stroke counted, with its',
    '   block, its colour, the colour across it, whether it runs down (its',
    '   across neighbours are left and right), and its alpha. The count is the',
    '   same with or without it. */',
    'function fixThinStrokes(data,W,H,block,visit){',
  ]);
doc.swap(
  [
    '    if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me) n++;',
    '    if(Lf===me&&Rt===me&&Up===Dn&&Up!==me) n++;',
  ],
  [
    '    if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me){ n++; if(visit) visit(x,y,me,Lf,true,data[((y*block+half)*W+x*block+half)*4+3]); }',
    '    if(Lf===me&&Rt===me&&Up===Dn&&Up!==me){ n++; if(visit) visit(x,y,me,Up,false,data[((y*block+half)*W+x*block+half)*4+3]); }',
  ]);

/* ---- 2. fixStrokesKept: what the cut did, on the engine's cells --------- */
doc.swap(
  [
    '  return n;',
    '}',
    '/* THE GRID FOR A PICTURE THAT HAS NONE.',
  ],
  [
    '  return n;',
    '}',
    '/* WHAT A CUT FINER THAN THE BLOCKS DID TO THE STROKES ONE BLOCK WIDE',
    '   (patch629), measured on the engine\'s cells before the palette step - so in',
    '   the worker, the one place those cells exist (the palette step writes over',
    '   them). See fixThinStrokes for why such a cut keeps them: measured, the 89',
    '   traits drawn at 10px and typed 8 lost none of 2,623, and about four in ten',
    '   came out 2 cells wide, where the cut gives a block a second cell. Measured',
    '   here rather than assumed, so a picture the engine treats otherwise says so.',
    '',
    '   The strokes are fixThinStrokes\' own, block by block, but only the ones the',
    '   engine paints: a pixel is paint when its alpha is over 127, so a fainter',
    '   stroke is clear at every size (the run\'s translucency note says so) and',
    '   is not the cut\'s to keep or lose. One is KEPT when a cell over its pixels',
    '   - the engine\'s partition, pixel x in cell floor(x*cols/W) - is nearer its',
    '   colour than the colour beside it (any painted cell, when beside it is',
    '   clear); WIDE when such cells take more columns across it (rows, for a',
    '   stroke that runs across) than the block\'s own width in cells, rounded',
    '   down. {strokes, lost, wide}, or null when there are no cells to look at. */',
    'function fixStrokesKept(data,W,H,block,cells,cols,rows){',
    '  if(!data||!cells||!(cols>0)||!(rows>0)||cells.length<cols*rows*4) return null;',
    '  const lab=k=>labOf((k>>16)&255,(k>>8)&255,k&255);',
    '  const narrow=Math.floor(block*cols/W+1e-9);',
    '  let strokes=0, lost=0, wide=0;',
    '  fixThinStrokes(data,W,H,block,(bx,by,me,other,down,alpha)=>{',
    '    if(!(alpha>127)) return;',
    '    strokes++;',
    '    const L=lab(me), O=other>=0?lab(other):null;',
    '    const x0=Math.floor(bx*block*cols/W), x1=Math.floor(Math.min(W-1,bx*block+block-1)*cols/W);',
    '    const y0=Math.floor(by*block*rows/H), y1=Math.floor(Math.min(H-1,by*block+block-1)*rows/H);',
    '    const at=new Set();',
    '    for(let cy=y0;cy<=y1;cy++) for(let cx=x0;cx<=x1;cx++){',
    '      const i=(cy*cols+cx)*4; if(!cells[i+3]) continue;',
    '      const c=labOf(cells[i],cells[i+1],cells[i+2]);',
    '      if(!O||deltaE2000(c[0],c[1],c[2],L[0],L[1],L[2])<deltaE2000(c[0],c[1],c[2],O[0],O[1],O[2])) at.add(down?cx:cy);',
    '    }',
    '    if(!at.size) lost++; else if(at.size>narrow) wide++;',
    '  });',
    '  return {strokes:strokes, lost:lost, wide:wide};',
    '}',
    '/* THE GRID FOR A PICTURE THAT HAS NONE.',
  ]);

/* ---- 3. the size decision: the size that keeps them, decided with it --- */
doc.swap(
  [
    '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
    '    const whole=x=>Math.abs(x-Math.round(x))<1e-9;',
    '    if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn))',
    '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step, grid:grid,',
    '        strokes:fixThinStrokes(px,w,ph,drawn)};',
  ],
  [
    '    /* SUPERSEDED IN PART (patch629): "10px or 5px art on 8px cells" above.',
    '       Only the cut coarser than the blocks breaks lettering (5px art at 8).',
    '       10px art at 8 is cut finer, keeps every block, and the worker measures',
    '       that it did (fixStrokesAsked, fixStrokesKept). */',
    '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
    '    const whole=x=>Math.abs(x-Math.round(x))<1e-9;',
    '    if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn)){',
    '      /* patch629: and the strokes fainter than the engine\'s paint, which no',
    '         size keeps - so the size that keeps the rest is not named for them. */',
    '      let faint=0;',
    '      const strokes=fixThinStrokes(px,w,ph,drawn,(x,y,me,o,down,alpha)=>{ if(!(alpha>127)) faint++; });',
    '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step, grid:grid,',
    '        strokes:strokes, keepsAt:fixStrokesKeptAt(drawn,step,grid,onGrid,faint)};',
    '    }',
  ]);

/* ---- 4. the worker: measure before the palette step, send it back ------- */
doc.swap('    "    let pal=null;",',
  [
    '    /* patch629: a cut finer than the blocks the picture was drawn in - the',
    '       page sends the block (fixStrokesAsked) - is measured here, on the',
    '       engine\'s cells, before the palette step below writes over them. */',
    '    "    const kept=m.strokeBlock?fixStrokesKept(m.data,m.width,m.height,m.strokeBlock,r.data,r.width,r.height):null;",',
    '    "    let pal=null;",',
  ]);
doc.swap('"      confidence:r.confidence,width:r.width,height:r.height,data:r.data}},[r.data.buffer]);",',
  '"      confidence:r.confidence,width:r.width,height:r.height,kept:kept,data:r.data}},[r.data.buffer]);",');
doc.swap('labOf.toString(), deltaE2000.toString(), snapToPalette.toString(), snapOnce.toString()].join("\\n");',
  [
    'labOf.toString(), deltaE2000.toString(), snapToPalette.toString(), snapOnce.toString(),',
    '    /* patch629: the strokes and what the cut did to them, measured beside the engine. */',
    '    fixThinStrokes.toString(), fixStrokesKept.toString()].join("\\n");',
  ]);

/* ---- 5. the words, on the page ----------------------------------------- */
doc.swap(
  [
    'function fixRecutCaveat(block){',
    '  return (block>0&&block%8) ? ", though the collection\'s 8px blocks will not take "+block : "";',
    '}',
  ],
  [
    'function fixRecutCaveat(block){',
    '  return (block>0&&block%8) ? ", though the collection\'s 8px blocks will not take "+block : "";',
    '}',
    '/* A CUT FINER THAN THE BLOCKS (patch629): the cells are narrower than the',
    '   blocks the picture was drawn in - 10px art typed 8 - so the worker is asked',
    '   to measure what the cut did (fixStrokesKept) instead of the run predicting',
    '   a loss. The block, which is what the message carries, or 0. */',
    'function fixStrokesAsked(cut){',
    '  return (cut&&cut.strokes>0&&cut.block>cut.to) ? cut.block : 0;',
    '}',
    '/* THE SIZE THAT WOULD CUT FINER THAN THESE BLOCKS (patch629), or 0. A cut',
    '   coarser than the blocks - 10px art at 16 - may lose what one cut finer',
    '   keeps, and the box stays the person\'s, so the run names the size. Asked',
    '   by fixStepFor with its own decision, so the switch and the grid are the',
    '   ones the size was decided with. On the canvas only, for the reason',
    '   fixCoarseNote gives; step x grid is the picture\'s width there. Not when',
    '   any stroke is fainter than the engine\'s paint: no size keeps those. */',
    'function fixStrokesKeptAt(block,step,grid,onGrid,faint){',
    '  const g=fixGridCells();',
    '  if(!onGrid||!g.exact||!(grid<g.cells)||faint>0) return 0;',
    '  return block>step*grid/g.cells ? CANVAS_SIDE/g.cells : 0;',
    '}',
    '/* THE STROKES ONE BLOCK WIDE, AS A CLAUSE (patch629). Finer than the blocks:',
    '   what the worker measured the cut did, or nothing when it measured nothing.',
    '   "The cut", because that is what was measured: the palette step and the',
    '   outline pass come after it and say what they did. Coarser: that they may',
    '   not survive it - some do and some do not, and a count would mislead (the',
    '   hat\'s lettering) - and the size that keeps them when there is one. */',
    'function fixStrokeWords(cut,kept){',
    '  if(!cut||!(cut.strokes>0)) return "";',
    '  if(fixStrokesAsked(cut)){',
    '    if(!kept||!(kept.strokes>0)) return "";',
    '    const n=kept.strokes, all=n===1?"its stroke":"all "+n.toLocaleString()+" strokes";',
    '    if(kept.lost) return " - the cut loses "+(kept.lost===n?all:kept.lost.toLocaleString()+" of its "+n.toLocaleString()+" strokes")+" one block wide";',
    '    const cells=(Math.floor(cut.block/cut.to)+1)+" cells wide";',
    '    return " - the cut keeps "+all+" one block wide"',
    '      +(kept.wide?(n===1?", now "+cells:", "+kept.wide.toLocaleString()+" now "+cells):"");',
    '  }',
    '  return " - "+cut.strokes.toLocaleString()+" stroke"+(cut.strokes===1?"":"s")+" one block wide may not survive it"',
    '    +(cut.keepsAt?"; at "+cut.keepsAt+" the cut keeps "+(cut.strokes===1?"it":"them"):"");',
    '}',
    '/* AND FOR A FOLDER: the size that keeps the files listed - all of them, the',
    '   ones at the block sizes it keeps, or how many - when there is one. */',
    'function fixStrokesAdvice(list){',
    '  const at=list.filter(s=>s.keepsAt>0); if(!at.length) return "";',
    '  const blocks=[...new Set(at.map(s=>s.block))].sort((a,b)=>a-b);',
    '  const byBlock=list.every(s=>(s.keepsAt>0)===(blocks.indexOf(s.block)>=0));',
    '  return "; at "+[...new Set(at.map(s=>s.keepsAt))].join(" or ")+" the cut keeps "+(at.length===list.length ? "them"',
    '    : byBlock ? "the "+blocks.map(b=>b+"px").join(", ")+" ones" : at.length+" of them");',
    '}',
  ]);

/* ---- 6. the single run: ask for it, say it ------------------------------ */
doc.swap('repair8:fixRepair8(forced), lines16:fixLines16(forced), rulesgate:fixLines16Gate(),',
  'repair8:fixRepair8(forced), lines16:fixLines16(forced), rulesgate:fixLines16Gate(), strokeBlock:fixStrokesAsked(typedAt),');
doc.swap(
  [
    '            +(typedBy.strokes ? " - "+typedBy.strokes.toLocaleString()+" stroke"',
    '              +(typedBy.strokes===1?"":"s")+" one block wide will not survive it" : "")',
  ],
  [
    '            /* SUPERSEDED (patch629): "will not survive it" for every cut across.',
    '               A cut finer than the blocks keeps them and says what the worker',
    '               measured; a coarser one says they may not survive it, and names',
    '               the size that keeps them. See fixStrokeWords. */',
    '            +fixStrokeWords(typedBy,r.kept)',
  ]);

/* ---- 7. the folder ------------------------------------------------------ */
doc.swap('repair8:fixRepair8(stepAsked), lines16:fixLines16(stepAsked), rulesgate:fixLines16Gate()});',
  'repair8:fixRepair8(stepAsked), lines16:fixLines16(stepAsked), rulesgate:fixLines16Gate(), strokeBlock:fixStrokesAsked(cut&&cut.recut)});');
doc.swap('          if(c.recut.strokes) fixTypedStrokesAt.push({name:name, strokes:c.recut.strokes}); }',
  [
    '          /* patch629: a cut finer than the blocks is listed only when the worker',
    '             measured a stroke lost, and counted apart when it kept them all. A',
    '             listed file is ranked by the strokes it holds either way, so the',
    '             ranking compares like with like. A coarser cut is listed as before,',
    '             with the size that keeps it, decided with its size. */',
    '          if(fixStrokesAsked(c.recut)){ const k=out.kept;',
    '            if(k&&k.strokes>0){ if(k.lost) fixTypedStrokesAt.push({name:name, strokes:k.strokes, block:c.recut.block, keepsAt:0}); else fixTypedKeptFiles++; } }',
    '          else if(c.recut.strokes) fixTypedStrokesAt.push({name:name, strokes:c.recut.strokes, block:c.recut.block, keepsAt:c.recut.keepsAt||0}); }',
  ]);
doc.swap('fixTypedMergeStrokesAt=[], fixTypedResampleAt=[];',
  'fixTypedMergeStrokesAt=[], fixTypedResampleAt=[], fixTypedKeptFiles=0;');
doc.swap('fixTypedMergeStrokesAt=[]; fixTypedResampleAt=[];',
  'fixTypedMergeStrokesAt=[]; fixTypedResampleAt=[]; fixTypedKeptFiles=0;');
doc.swap(
  [
    '      +blocksOf(fixTypedRecutAt)+")"',
    '      /* AND HOW MANY OF THOSE WILL LOSE SOMETHING, with the worst named so',
    '         a folder of 311 says which three to open first. */',
  ],
  [
    '      +blocksOf(fixTypedRecutAt)+")"',
    '      /* patch629: first the cuts finer than their blocks that kept every',
    '         stroke, so the size named after the list below is about the list. */',
    '      +(fixTypedKeptFiles',
    '        ? ", the cut keeping every stroke one block wide"+(fixTypedStrokesAt.length ? " in "+fixTypedKeptFiles+" of them" : "")',
    '        : "")',
    '      /* AND HOW MANY OF THOSE WILL LOSE SOMETHING, with the worst named so',
    '         a folder of 311 says which three to open first. */',
    '      /* SUPERSEDED IN PART (patch629): "WILL LOSE". A coarser cut may lose',
    '         some of it; a finer one is listed only when it measurably did. */',
  ]);
doc.swap('        ? ", "+fixTypedStrokesAt.length+" of them holding detail one block wide (most in "',
  [
    '        /* patch629: "that may not survive it", as the merge clause says: the',
    '           kept files above hold detail one block wide too. */',
    '        ? ", "+fixTypedStrokesAt.length+" of them holding detail one block wide that may not survive it (most in "',
  ]);
doc.swap(
  [
    '          +fixTypedStrokesAt.slice().sort((a,b)=>b.strokes-a.strokes).slice(0,3).map(s=>s.name).join(", ")+")"',
    '        : "")',
  ],
  [
    '          +fixTypedStrokesAt.slice().sort((a,b)=>b.strokes-a.strokes).slice(0,3).map(s=>s.name).join(", ")+")"',
    '        : "")',
    '      /* patch629: the size that keeps the listed ones, where there is one. */',
    '      +fixStrokesAdvice(fixTypedStrokesAt)',
  ]);

doc.finish(({ must }) => {
  must('function fixStrokesKept(data,W,H,block,cells,cols,rows){', 'the measure');
  must('function fixStrokesAsked(cut){', 'the ask');
  must('function fixStrokesKeptAt(block,step,grid,onGrid,faint){', 'the size that keeps them');
  must('function fixStrokeWords(cut,kept){', 'the words');
  must('function fixStrokesAdvice(list){', 'the folder advice');
  must('if(visit) visit(x,y,me,Lf,true,', 'the visitor, down');
  must('if(visit) visit(x,y,me,Up,false,', 'the visitor, across');
  must('if(!(alpha>127)) return;', 'faint strokes left out of the measure');
  must('keepsAt:fixStrokesKeptAt(drawn,step,grid,onGrid,faint)', 'the size decided with the size');
  must('fixStrokesKept(m.data,m.width,m.height,m.strokeBlock,r.data,r.width,r.height)', 'the worker measure');
  must('kept:kept,data:r.data', 'the worker answer');
  must('fixThinStrokes.toString(), fixStrokesKept.toString()', 'the worker text');
  must('strokeBlock:fixStrokesAsked(typedAt)', 'the single ask');
  must('strokeBlock:fixStrokesAsked(cut&&cut.recut)', 'the folder ask');
  must('+fixStrokeWords(typedBy,r.kept)', 'the single sentence');
  must('(cut.strokes===1?"":"s")+" one block wide may not survive it"', 'the coarse words');
  must('fixTypedKeptFiles++', 'the folder count');
  must('+fixStrokesAdvice(fixTypedStrokesAt)', 'the folder sentence');
  must('", "+fixTypedStrokesAt.length+" of them holding detail one block wide that may not survive it (most in "', 'the folder list');
  must('"; at "+cut.keepsAt+" the cut keeps "', 'the advice, scoped to the cut');
});
