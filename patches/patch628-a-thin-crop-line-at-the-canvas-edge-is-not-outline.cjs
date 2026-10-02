/* patch628: A THIN DARK LINE HUGGING A CANVAS EDGE IS A CROP, NOT OUTLINE.

   THE DEFECT (measured 2026-10-02 on the clothing library, RR/wip/edges.cjs and rows.cjs). Many clothing sources end
   in a pure-black run along the bottom canvas edge where the garment was cut off by the crop: 23 of 32 files. CHUD
   Shirt rows 1270-1279 are #000000 for all 980 opaque pixels of the row (10 px); Dogecoin Polo rows 1275-1279 (5 px);
   Wall Street Power Suit row 1279 (1 px); Mario Overalls row 1279 (1 px). Per column the dark run is longer where a
   drawn black stroke stands on the line (edges.cjs: up to 10 / 10 / 12 / 15 px). At pixel size 16 the engine votes
   the bottom cell row of CHUD black right across the garment - the page's path run offline (run623 on before-628.html,
   bottomrow.cjs on the 1280 output): CHUD 976 of 976 opaque bottom-row pixels near-black, the bottom 16 rows 100%
   near-black; Wall Street 352 of 1024 (34%); Dogecoin 112 (11%); Mario 96 (10%). The owner rejected every shirt with
   that line ("the ones with the black line at the bottom are no bueno"). Replacing the run with the colour just
   inside it before the engine saw the picture (RR/wip/cleanedge.cjs, batch 4b) gave the output the owner approved.

   THE RULE, in the page, on every picture, at every size, with no folder or layer rule (fixCropLine): before the
   engine sees the pixels, a near-black run (alpha > 0, r g b all < 40) that (a) starts at a canvas edge, (b) is
   thinner than the step the run will use, and (c) has not-transparent, not-dark art immediately inside it, is a crop
   artefact: it is replaced, column by column (row by row at the left and right edges), with the pixel just inside
   it. Kept as drawn: a dark run as thick as the step or thicker (a real black band), a dark run with transparency
   inside it (a border round a cut-out, a black shape standing on the edge), a dark line anywhere not at the canvas
   edge, and a picture whose bottom is black with nothing inside. "Immediately inside" is alpha > 0, as cleanedge.cjs
   measured it, so a garment's soft 1 px edge pixel counts as the garment. The step is the one the run uses - the
   size box (fixStepFor's answer, in source pixels; 1280 at 16 is 16, 1254 at 16 is 15.675), or, with the box at 0,
   the engine's auto step, which is not known before the engine runs: then 16 is the ceiling (FIX_CROP_AUTO_STEP),
   the largest step the box offers.

   BOTH PATHS THAT HAND DECODED PIXELS TO THE WORKER take it, so they cannot drift: fixBatchRun's prepare (the
   folder run) and fixRun (the single run). In both the cleaned picture is also what fixSmallMarks counts and what
   fixOutlineApply reads as the source, exactly as cleanedge's pre-pass did for the measured output. Scale mode is
   untouched: "the bytes that came in are the bytes that go out". fixLoad is not the place - the step is not known
   there, and the before-preview shows the file as it came in. Each run says what it did (a clause in the single
   readout, a count in the folder note).

   MEASURED (measure628/run628.cjs = run623 + the page's pre-pass, at 16, the four named files; bottomcells.cjs =
   near-black share of the opaque pixels in the bottom 16 rows of the 1280 output). Before: CHUD 100%, Dogecoin 11%,
   Wall Street 34%, Mario 10%. After: CHUD 27.9%, Dogecoin 6.5%, Wall Street 25.0%, Mario 8.2%, against the cleaned
   source's own 30.6 / 7.9 / 24.5 / 7.7 - at or below it for three; Wall Street's 16 near-black bottom-row cells of
   64 are half a point above its source, the vote's rounding. All four outputs are, cell for cell, the batch 4b
   outputs the owner approved (RR/wip/batch4b/cells). Cells that differ from before-628: CHUD 56 (44 in the bottom
   row; 12 in rows 76-78 moved by the outline pass, which now sees a fill-coloured bottom row - with the outline
   off, 0), Dogecoin 4 (3 + one at 57,77), Wall Street 9 (6 + 45,65 45,70 44,75), Mario 3 (2 + 56,75): the odd
   cells are the engine's own vote on cells whose labels shifted once the black run was gone, and they are the
   same in the approved output. All 311 library files at 16 and at 8 (measure628/changed-16.txt, changed-8.txt): 59
   outputs change at 16 (21 clothing, 18 backgrounds, 9 costumes, 6 extras, 5 skins) and 45 at 8, every one a file edges.cjs
   reports a thin dark edge run on; no other output changed (0 of 311 at either size).

   FIX ROUND (2026-10-02, after review; code unchanged, comments extended with what was measured). Reviewers held three
   brief conditions against the build: Wall Street's bottom 16 rows at 25.00% against the cleaned source's 24.49%; cells
   outside the bottom row moving on all four files; and FIX_CROP_MIN_COLS, which the brief does not name. Measured
   (measure628/fixround/): the cleaned source's own bottom cell row, quantized by majority, holds 16 near-black cells of
   65 - the output's 16 of 64 - and 24.49% lies between 15 and 16 cells of a 64-cell row, so no output row can meet "at or
   below" without dropping a drawn stroke; the other-row cells re-isolated (outline off: CHUD's 12 go; palette and outline
   off: Dogecoin/Wall Street/Mario's 1-3 stay - the engine's vote) and identical to the approved batch 4b cells; and the
   qualifying-column counts of every edge of all 311 sources (colcount.cjs, equal to edges.cjs's on every edge it prints):
   clothing lines start at 147 columns, specks end at 50, so for clothing any cut from 51 to 146 is the same rule; for
   backgrounds the counts run 45, 49, 50 | 54, 55, 56 through the cut, and 50 is edges.cjs's - the brief's acceptance
   instrument - not a mark in the pictures. The threshold stands as a decision for the owner to ratify; it is said so in
   the page.

   ROUND 2 (2026-10-02, the module owner's review of the edge-band sheets, RR/wip/review628/pages). Garments are right:
   Beige MM Hoodie, Coinbase Blue Jacket, Hawaiian Shirt and Lakers 24 Jersey lose only the black run at the canvas edge
   and the drawn hem strokes stay. Full-bleed pictures are wrong: Black and White Waves' stripe ends at every edge are
   art, not a crop line, and round 1 rewrote them (11,349 pixels at 16); White Couch Group's thin black frame along all
   four edges is drawn too (10,587 pixels). DECISION: the rule applies only to a CUT-OUT - a picture with at least one
   transparent pixel (alpha === 0 anywhere) - never to a full-bleed picture. It decides from the picture, not the folder.
   Round 1's "on every picture" is superseded by this; its reasoning is kept above and in the page comment. Measured
   (measure628/round2/alpha0-311.txt): of the 311 library sources exactly the 47 backgrounds have no transparent pixel;
   every file of the other twelve layers has one, so the condition keeps every garment, costume, extra and skin case
   round 1 changed and drops all 18 backgrounds at 16 and all 12 at 8. fixCropLine counts alpha === 0 once over the
   picture and returns {pixels: 0, edges: [], holes: 0} when there is none, so both callers share the one decision and
   say nothing. PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const page = fs.readFileSync(s0.FILE, 'utf8');
if (page.indexOf('function fixCropLine(') >= 0) throw new Error('fixCropLine is already in this page - patch628 applied twice?');
const doc = s0.start([
  ['async function fixDecodeFile(file){', 'fixDecodeFile is not in this page (patch623 not applied?)'],
  ['async function fixBatchRun(files){', 'fixBatchRun is not in this page'],
  ['function fixRun(){', 'fixRun is not in this page'],
]);
/* The page text from one exact-once start through one exact-once end (inclusive), as patch623's region(). */
const span = (startText, endText) => {
  const a = page.indexOf(startText); if (a < 0 || page.indexOf(startText, a + 1) >= 0) throw new Error('expected one ' + startText.slice(0, 60));
  const b = page.indexOf(endText, a); if (b < 0 || page.indexOf(endText, b + 1) >= 0) throw new Error('expected one ' + endText.slice(0, 60));
  return page.slice(a, b + endText.length);
};

/* 1. the rule itself, beside the decode it follows */
doc.swap([
  "/* Scale mode's name for the same bytes, kept for its callers. */",
  'async function fixScaledBytes(r){ return fixGridBytes(r); }',
  '',
  'async function fixLoad(file){',
], [
  "/* Scale mode's name for the same bytes, kept for its callers. */",
  'async function fixScaledBytes(r){ return fixGridBytes(r); }',
  '',
  '/* A THIN DARK LINE HUGGING A CANVAS EDGE IS A CROP, NOT OUTLINE (patch628).',
  '',
  '   Many clothing sources end in a pure-black run along the bottom canvas edge',
  '   where the garment was cut off: 23 of 32 library files (measured 2026-10-02,',
  '   RR/wip/edges.cjs). CHUD Shirt rows 1270-1279 are #000000 across all 980',
  '   opaque pixels of the row (10 px thick), Dogecoin Polo 5 px, Wall Street',
  '   Power Suit and Mario Overalls 1 px. At pixel size 16 the engine voted the',
  '   bottom cell row black right across the garment (CHUD: 976 of 976 opaque',
  '   bottom-row pixels of the 1280 output near-black, the bottom 16 rows 100%;',
  '   Wall Street 34%) with the outline switch on or off - the cell decision, not',
  '   fixOutlineApply. The owner rejected every shirt with that line.',
  '',
  '   THE RULE, on every picture (round 1; round 2 narrows this to cut-outs,',
  '   see CUT-OUTS ONLY below), at every size, with no folder or layer rule:',
  '   a near-black run (alpha > 0, r g b all < 40) that starts at a canvas edge,',
  '   is THINNER THAN THE STEP the run will use, and has not-transparent,',
  '   not-dark art immediately inside it, is a crop artefact: each column (row,',
  '   at the left and right edges) of it is replaced with the pixel just inside',
  '   it. Kept as drawn: a dark run as thick as the step or thicker, a dark run',
  '   with transparency inside it (a black shape standing on the edge, a border',
  '   round a cut-out), a dark line anywhere not at the canvas edge, and a',
  '   picture whose bottom is black with nothing inside. "Immediately inside"',
  '   is alpha > 0 - a garment\'s soft 1 px edge pixel is the garment - as',
  '   cleanedge.cjs, whose output the owner approved (batch 4b), measured it.',
  '',
  '   THE STEP is fixStepFor\'s answer in source pixels (1280 at 16: 16; 1254 at',
  '   16: 15.675). With the box at 0 the engine chooses the step itself and it',
  '   is not known before the engine runs, so 16 - the largest step the box',
  '   offers - is the ceiling then (FIX_CROP_AUTO_STEP). Both paths that hand',
  '   decoded pixels to the worker apply this (fixBatchRun\'s prepare and',
  '   fixRun), before the engine and before the pixels are copied for it, and',
  '   the cleaned picture is also what fixSmallMarks counts and fixOutlineApply',
  '   reads as the source. In place on `data`; returns the pixels replaced and,',
  '   per edge, how many columns and the thickest run. Measured on the four',
  '   named files at 16 (run628.cjs, bottomcells.cjs on the 1280 output): the',
  '   bottom 16 rows\' near-black share went CHUD 100% -> 28%, Dogecoin 11% ->',
  '   6%, Wall Street 34% -> 25%, Mario 10% -> 8%, against the cleaned',
  '   source\'s own 31 / 8 / 24 / 8 (Wall Street half a point above it: 16',
  '   near-black cells of 64, the vote\'s rounding); all four outputs are, cell',
  '   for cell, the cleanedge outputs the owner approved. Beyond the bottom row',
  '   a few cells move with it - CHUD 12 by the outline pass, which now sees a',
  '   fill-coloured bottom row; Dogecoin, Mario, Wall Street 1-3 by the',
  '   engine\'s own vote once the black is gone - as in the approved output.',
  '   Fix round (measure628/fixround/quant.cjs): Wall Street\'s cleaned source',
  '   has 24.49% near-black in its bottom 16 rows, which lies between 15 cells',
  '   (23.44%) and 16 cells (25.00%) of a 64-cell row; its own bottom cell row,',
  '   quantized by majority, holds 16 near-black cells - the output\'s count.',
  '   A 64-cell row at or below 24.49% would have to drop a cell that is a',
  '   drawn stroke. The other-row cells were isolated with run628 (PB_LINE=0,',
  '   PB_PAL=0): CHUD\'s 12 vanish with the outline pass off; the 1-3 on the',
  '   other three stay with the outline and the palette both off.',
  '',
  '   A LINE RUNS ALONG THE EDGE. The per-column test alone also fires on a',
  '   speck: a dark pixel block at the edge of a background with lighter art',
  '   behind it. Measured over the 311 library files (run628.cjs, before and',
  '   after): with no length test 23 outputs at 16 and 10 at 8 changed on edges',
  '   where at most 50 columns qualified, in stretches of 1 to 20 columns',
  '   (Anfield Tunnel, Omegle, Ruins Selfie, Supreme Hoodie 15 columns...) -',
  '   none of them a file edges.cjs reports a crop line on. So an edge is a',
  '   crop line only when MORE THAN FIX_CROP_MIN_COLS (50) of its columns',
  '   qualify: the count the measurement that found the defect used',
  '   (edges.cjs), so the rule\'s population is the measured one, and small',
  '   against any garment - the narrowest clothing line measured spans 147',
  '   columns (Slim Grey Suit), the four named files 680 to 925.',
  '',
  '   WHERE THE CUT FALLS (fix round, 2026-10-02; measure628/fixround/',
  '   colcount.cjs: this function carved from the page with the length test',
  '   off, every edge of all 311 library sources counted on the untouched',
  '   picture, each count equal to edges.cjs\'s on the 107 edges it prints).',
  '   At step 16, 163 edges on 95 files carry a qualifying column: 56 edges',
  '   on 34 files have at most 50 (Omegle\'s bottom edge has exactly 50,',
  '   Suburban Sidewalk\'s left 49, Portal Test Chamber\'s top 45; 26 of the',
  '   56 have 1 to 10) and 107 edges on 68 files have more (the smallest',
  '   Golf Game\'s right 54, Alien Hat Forest\'s right 55, Tesseract',
  '   Bookshelves\' left 56; the smallest on clothing 147). At step 8 the',
  '   largest kept is 48, the smallest cleared 56. So for clothing - the',
  '   owner\'s complaint - any threshold from 51 to 146 picks the same lines;',
  '   for backgrounds the counts run through the cut without a gap (... 45, 49,',
  '   50 | 54, 55, 56, 57, 63 ...) and 50 is edges.cjs\'s cut, chosen because the',
  '   brief\'s acceptance test ("any change on a file edges.cjs does not',
  '   report is a defect") is defined by it, not because the pictures mark',
  '   it. A different cut for backgrounds is the owner\'s to make. The sweeps',
  '   run bottom, top, left, right in place, as cleanedge.cjs did, so a',
  '   left/right count can differ by a few corner pixels from the untouched',
  '   count (23 edges, all backgrounds, none crossing 50).',
  '',
  '   CUT-OUTS ONLY (round 2, 2026-10-02; supersedes "on every picture" above,',
  '   whose reasoning is kept). The module owner reviewed the edge-band sheets',
  '   of every output round 1 changed (RR/wip/review628/pages): the garments',
  '   are right - Beige MM Hoodie, Coinbase Blue Jacket, Hawaiian Shirt and',
  '   Lakers 24 Jersey lose only the black run at the canvas edge and their',
  '   drawn hem strokes stay - and the full-bleed pictures are wrong: Black',
  '   and White Waves\' stripes end at every edge as art, not a crop line, and',
  '   round 1 rewrote them (11,349 pixels at 16); White Couch Group\'s thin',
  '   black frame along all four edges is drawn too (10,587 pixels). A crop',
  '   line is what is left when a cut-out was cut; a picture that fills its',
  '   canvas was not cut. So the rule applies only to a CUT-OUT - a picture',
  '   with at least one transparent pixel (alpha === 0 anywhere) - and never',
  '   to a full-bleed picture, decided from the picture, not the folder:',
  '   fixCropLine counts alpha === 0 once and returns {pixels: 0, edges: [],',
  '   holes: 0} when there is none, so both callers share the decision and',
  '   say nothing. Measured (measure628/round2/alpha0-311.txt): of the 311',
  '   library sources exactly the 47 backgrounds have no transparent pixel',
  '   and every file of the other twelve layers has one, so this keeps every',
  '   garment, costume, extra and skin case round 1 changed and returns all',
  '   18 backgrounds at 16 and all 12 at 8 to the output they had before. */',
  'const FIX_CROP_AUTO_STEP=16;',
  'const FIX_CROP_MIN_COLS=50;',
  'let fixCropFiles=0, fixCropPixels=0;',
  'function fixCropLine(data,W,H,step){',
  '  const lim=step>0?step:FIX_CROP_AUTO_STEP;',
  '  const dark=i=>data[i+3]>0&&data[i]<40&&data[i+1]<40&&data[i+2]<40;',
  '  const res={pixels:0, edges:[]};',
  '  /* CUT-OUTS ONLY (round 2, see above): a picture with no transparent pixel',
  '     is full-bleed art and its dark edge runs are drawn (Black and White',
  '     Waves, White Couch Group). Counted once, here, so both callers share',
  '     the one decision; `holes` is the count, reported for the reader. */',
  '  let holes=0; for(let i=3;i<data.length;i+=4) if(data[i]===0) holes++;',
  '  res.holes=holes;',
  '  if(!holes) return res;',
  '  /* count = columns (rows) along this edge, depth = pixels available going',
  '     inward. Two passes: which columns carry a run, then - only when the edge',
  '     has more than FIX_CROP_MIN_COLS of them - the replacement. */',
  '  const sweep=(edge,count,depth,at)=>{',
  '    const run=new Int32Array(count); let n=0, thick=0;',
  '    for(let k=0;k<count;k++){',
  '      let r=0;',
  '      while(r<lim&&r<depth-1&&dark(at(k,r))) r++;',
  '      if(r===0||r>=lim) continue;',
  '      const s=at(k,r);',
  '      if(data[s+3]===0||dark(s)) continue;',
  '      run[k]=r; n++; if(r>thick) thick=r;',
  '    }',
  '    if(n<=FIX_CROP_MIN_COLS) return;',
  '    for(let k=0;k<count;k++){',
  '      const r=run[k]; if(!r) continue;',
  '      const s=at(k,r);',
  '      for(let t=0;t<r;t++){ const i=at(k,t); data[i]=data[s]; data[i+1]=data[s+1]; data[i+2]=data[s+2]; data[i+3]=data[s+3]; }',
  '      res.pixels+=r;',
  '    }',
  '    res.edges.push({edge:edge, n:n, thick:thick});',
  '  };',
  '  sweep("bottom",W,H,(x,t)=>((H-1-t)*W+x)*4);',
  '  sweep("top",W,H,(x,t)=>(t*W+x)*4);',
  '  sweep("left",H,W,(y,t)=>(y*W+t)*4);',
  '  sweep("right",H,W,(y,t)=>(y*W+(W-1-t))*4);',
  '  return res;',
  '}',
  '/* WHAT IT DID, in the run\'s sentence: nothing when nothing was replaced. */',
  'function fixCropSaid(c){',
  '  if(!c||!c.pixels) return "";',
  '  return " \\u00b7 a thin dark line hugging the "+c.edges.map(e=>e.edge+" edge ("+e.thick+" px, "+e.n+(e.edge==="left"||e.edge==="right"?" rows":" columns")+")").join(" and the ")',
  '    +" was read as a crop line and cleared before the run";',
  '}',
  '',
  'async function fixLoad(file){',
]);

/* 2. the folder run: the step first, then the crop line off the pixels, then the engine's copy.
   THE MOVED TEXT IS TAKEN FROM THE PAGE, NOT TYPED HERE (fix after the r628 full run, 2026-10-02): the first version
   replaced this region with a block written against e8cb3f8, which silently dropped the line patch626 had added
   inside the step decision (fixGridlessPaintedAt.push) - the full suite caught it (runsayswhatchanged.spec.js:296).
   So the step decision's IIFE is cut out of the message literal exactly as it stands, whatever lines it holds, and
   put before the literal; only the crop line and the forceStep reference are new text. */
{
  const region = span('      /* The same bytes, untouched, when there is nothing to ask. */', 'repair8:fixRepair8(stepAsked), lines16:fixLines16(stepAsked), rulesgate:fixLines16Gate()});');
  const once = (hay, needle) => { const a = hay.indexOf(needle); if (a < 0 || hay.indexOf(needle, a + 1) >= 0) throw new Error('expected exactly one ' + needle.slice(0, 50)); return a; };
  const cutLine = '      let cut=null, stepAsked=0;' + NL;
  const head = 'forceStep:(()=>{ const s=fixStepFor(sw,px,sh);', tail = 'return s>0?s:null; })(),';
  const a = once(region, head), b = once(region, tail) + tail.length;
  const iife = region.slice(a + 'forceStep:'.length, b - 1);   /* '(()=>{ ... })()' - the page's own lines, 626's included */
  if (iife.indexOf('fixGridlessPaintedAt.push') < 0) throw new Error("the step decision no longer holds the painted line patch626 added - re-read before re-anchoring");
  const moved = [
    '      /* THE STEP BEFORE THE PIXELS ARE COPIED (patch628): the crop-line rule',
    '         needs it, so the decision that used to sit inside the message literal',
    '         is taken first; nothing between here and there asks fixStepFor again. */',
    '      const forceStep=scale ? null : ' + iife + ';',
    '      /* A THIN DARK CROP LINE AT A CANVAS EDGE COMES OFF FIRST (patch628, see',
    '         fixCropLine): in place on px, so the engine, the marks count and the',
    '         outline pass in finish() all see the same picture - the one the',
    '         single run (fixRun) hands them. Not in scale mode, whose promise is the',
    '         bytes that came in. */',
    '      if(!scale){ const crop=fixCropLine(px,sw,sh,stepAsked); if(crop.pixels){ fixCropFiles++; fixCropPixels+=crop.pixels; } }',
  ].join(NL) + NL;
  const c = once(region, cutLine) + cutLine.length;
  const rep = region.slice(0, c) + moved + region.slice(c, a) + 'forceStep:forceStep,' + region.slice(b);
  if (rep.indexOf('fixGridlessPaintedAt.push') < 0 || rep.indexOf('forceStep:forceStep,') < 0) throw new Error('moved text lost');
  doc.swap(region, rep);
}
doc.swap('  fixOutlined=0; fixOutlineCells=0; fixOutlinedThick=0;',
  '  fixOutlined=0; fixOutlineCells=0; fixOutlinedThick=0; fixCropFiles=0; fixCropPixels=0;');

/* 3. the folder note counts it */
doc.swap([
  '  /* THE ANSWER THE TAB IS OPENED FOR. Every clause above says what the run',
], [
  '  /* CROP LINES CLEARED (patch628): a thin dark run hugging a canvas edge with',
  '     art inside it, replaced with that art before the engine ran. */',
  '  const cropNote = fixCropFiles',
  '    ? " \\u00b7 "+fixCropFiles+" had a thin dark crop line at a canvas edge, cleared before the run ("+fixCropPixels.toLocaleString()+" pixels)"',
  '    : "";',
  '  /* THE ANSWER THE TAB IS OPENED FOR. Every clause above says what the run',
]);
doc.swap('+palNote+fixOutlineBatchSaid()+gateNote+pastNote', '+palNote+cropNote+fixOutlineBatchSaid()+gateNote+pastNote');

/* 4. the single run: the same rule, on a copy, before the engine; the cleaned picture to the marks count and the outline */
doc.swap([
  '  $("fixrun").disabled=true; $("fixstop").hidden=false; $("fixacts").hidden=true;',
], [
  '  $("fixrun").disabled=true; $("fixstop").hidden=false; $("fixacts").hidden=true;',
  '  /* A THIN DARK CROP LINE AT A CANVAS EDGE COMES OFF FIRST (patch628, see',
  '     fixCropLine), on a copy: FIX.src stays the file as it came in (the',
  '     before-preview, scale mode, a second run). `given` is the picture the',
  '     engine, the marks count and the outline pass all get - the folder run',
  '     hands them the same one. With nothing to clear, `clean` is simply the',
  '     copy the worker is sent (it was always sent a copy, see below). */',
  '  const clean={data:new Uint8ClampedArray(src.data), width:src.width, height:src.height};',
  '  const crop=fixCropLine(clean.data,src.width,src.height,forced);',
  '  const given=crop.pixels?clean:src;',
]);
doc.swap('        const oln=fixOutlineApply(r,FIX.rel,src);', '        const oln=fixOutlineApply(r,FIX.rel,given);');
doc.swap([
  '        const marks=fixSmallMarks(src.data,src.width,src.height);',
  '        const dropped=marks.count?fixMarksDropped(marks,r,src.width,src.height):0;',
], [
  '        const marks=fixSmallMarks(given.data,given.width,given.height);',
  '        const dropped=marks.count?fixMarksDropped(marks,r,given.width,given.height):0;',
]);
doc.swap('          +fixOutlineSaid(oln)' + NL, '          +fixOutlineSaid(oln)' + NL + '          +fixCropSaid(crop)' + NL);
doc.swap([
  '    const copy=new Uint8ClampedArray(src.data);',
  '    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null, repair8:fixRepair8(forced), lines16:fixLines16(forced), rulesgate:fixLines16Gate(),',
], [
  '    /* (patch628: the copy is `clean` - already a copy of src.data, with the',
  '       crop line off - unless something was cleared, when `clean` stays with',
  '       the outline pass and the worker gets a copy of IT.) */',
  '    const copy=crop.pixels?new Uint8ClampedArray(clean.data):clean.data;',
  '    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null, repair8:fixRepair8(forced), lines16:fixLines16(forced), rulesgate:fixLines16Gate(),',
]);

doc.finish(({ code, must }) => {
  must('function fixCropLine(data,W,H,step){', 'the rule');
  must('const FIX_CROP_AUTO_STEP=16;', 'the auto ceiling');
  must('const lim=step>0?step:FIX_CROP_AUTO_STEP;', 'the step decides, 16 when the engine chooses');
  must('const FIX_CROP_MIN_COLS=50;', 'the length test');
  must('if(n<=FIX_CROP_MIN_COLS) return;', 'an edge is a crop line only with more than FIX_CROP_MIN_COLS columns');
  must('let holes=0; for(let i=3;i<data.length;i+=4) if(data[i]===0) holes++;', 'round 2: the transparent pixels are counted once');
  must('if(!holes) return res;', 'round 2: a full-bleed picture (no transparent pixel) is left untouched');
  must('if(r===0||r>=lim) continue;', 'thinner than the step, strictly');
  must('if(data[s+3]===0||dark(s)) continue;', 'art inside, not transparency or more dark');
  must('if(!scale){ const crop=fixCropLine(px,sw,sh,stepAsked); if(crop.pixels){ fixCropFiles++; fixCropPixels+=crop.pixels; } }', 'the folder run applies it');
  must('const crop=fixCropLine(clean.data,src.width,src.height,forced);', 'the single run applies it');
  must('const oln=fixOutlineApply(r,FIX.rel,given);', 'the outline pass reads the cleaned picture');
  must('const marks=fixSmallMarks(given.data,given.width,given.height);', 'the marks count reads the cleaned picture');
  must('const copy=crop.pixels?new Uint8ClampedArray(clean.data):clean.data;', 'the worker gets the cleaned copy');
  must('+palNote+cropNote+fixOutlineBatchSaid()', 'the folder note says it');
  must('+fixCropSaid(crop)', 'the single readout says it');
  if (code.indexOf('const oln=fixOutlineApply(r,FIX.rel,src);') >= 0) throw new Error('the outline pass still reads the raw source');
  /* fixDecodeFile's two callers hand pixels to the worker on exactly these two paths, and both apply the rule. */
  const calls = (code.match(/fixCropLine\(/g) || []).length;
  if (calls !== 3) throw new Error('fixCropLine is referenced ' + calls + ' times (the definition and two callers expected)');
  /* The folder run's message literal still carries every field it did, in order. */
  const lit = code.indexOf('fixAsk(wk,{data:new Uint8ClampedArray(px), width:sw, height:sh,');
  if (lit < 0) throw new Error('the folder run\'s message literal moved');
  for (const f of ['palette:fixPalWanted()?paletteRGB():null,', 'mode:mode, forceStep:forceStep,', 'repair8:fixRepair8(stepAsked), lines16:fixLines16(stepAsked), rulesgate:fixLines16Gate()});'])
    if (code.indexOf(f, lit) < 0 || code.indexOf(f, lit) - lit > 400) throw new Error('the folder run\'s message lost ' + f);
  /* The engine text is untouched: the rule is the page's, before the engine. */
  const OPEN = '<script id="pfcore" type="text/plain">';
  const inlineOf = t => { const a = t.indexOf(OPEN), s = a + OPEN.length; return t.slice(s, t.indexOf('</script>', s)); };
  if (inlineOf(fs.readFileSync(s0.FILE, 'utf8')) !== inlineOf(page)) throw new Error('the engine text changed');
});
