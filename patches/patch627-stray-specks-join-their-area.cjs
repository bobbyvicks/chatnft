/* patch627: STRAY SPECKS JOIN THEIR AREA, WHERE THE DRAWING AGREES.

   The owner, on Colours to palette: "flat patches but try ur best w all our colours" - fewer stray specks and
   fewer hard steps the drawing did not have. snapToPalette maps COLOURS, not cells: two colours drawn 2.7 dE
   apart in one flat area can sit either side of a split between palette colours and come out 14 dE apart, so
   a cell of the second colour comes out as a speck the drawing never had. After every colour has its palette
   colour, such a cell now takes the colour its area came out as - round 2's speck pass (p627), with round 3's
   source veto: the move is refused when the PICTURE says it crosses a drawn edge (5 dE), or takes the cell more
   than 3 dE further from its own drawn colour than the colour it had. A join can still leave a cell up to 3 dE
   further from its drawn colour, and many do. The rules and why each is there are in the comment in
   snapToPalette.

   WHAT IS NOT IN THIS PATCH, decided after three measured rounds: the colour-family pick (on the shipped 256
   colours it almost never fires safely, and palette swaps are being studied instead); any change to
   palettePick; any change to the agent panel's distance (round 3's trap-proof distance made the panel
   disagree with the button on 123 colours). palettekeepscolour.spec.js is unchanged and passes.

   WHAT CHANGES, each an exact swap:
   1. snapToPalette: the speck pass, and `specks` in its answer. Its code is copied line for line from round 3's
      text (p627r3/speck/final/speck3-live.js, sha256 ec71a1af...) except two fixes from review:
      a. A cell's picture colour is read from the pixels the ENGINE put in the cell. The engine puts pixel x in
         cell floor(x*cols/W), so the box runs from ceil(cx*W/cols) to before ceil((cx+1)*W/cols), and the same
         down. Round 3 took floor(cx*W/cols): one pixel left of and above the engine's cell wherever W/cols is not
         whole (1254 px over 104 cells: 102 of the 1254 columns), so a 1px line on a cell's last column was missed
         and the join went ahead. The new box is the engine's partition, cell for cell, on every picture width
         from 1 to 512 at every cell count up to the width (twice the width up to 64) and on widths 1000, 1023,
         1024, 1025, 1080, 1254, 1279, 1280, 1281, 1920 and 2048 at every cell count up to the width: 147,622
         width-count pairs, across and down, 64,966,894 cells, checked by running the page's own srcOf on a
         picture that records what it reads. Round 3's box fails the same check on 288,362 of the 295,244.
         At a whole multiple the two boxes are one, so on the 311 traits (all 1280 square, 160 or 80 cells) this
         changes no cell; tests/specksjoin.spec.js pins it on a 30px picture of 7 cells.
      b. A picture that is d itself, or another view of d's bytes, is copied before the palette colours are written
         into d. A folder run in Scale only hands its engine's answer, which is the bytes that came in, as the
         picture, so the pass read the palette's colours as the drawing and refused every join.
   2. The picture reaches every palette step: the worker glue hands {src:{data,width,height}} (the bytes the
      engine was sent) to every step - the line-repair guards' rounds and the last; fixPalApply(out,rel,img)
      hands it to its main-thread fallback, and its two callers pass the picture the outline pass gets.
   3. The editor's Colours to palette hands over a copy of the canvas as it was before the step. There each
      cell is one pixel of that picture, so the source tests are the cell tests again and refuse nothing more:
      measured on the 311 traits at 1280, byte-identical pixels and report with and without it.
   4. The run says it: ", N stray specks joined their area" (", 1 stray speck joined its area") after the
      palette clause, single and folder, only when some did - built from the answer's `specks`. The count is
      the palette step's; the outline pass after it can still paint a joined cell (1 of the 523 counted on the
      311 traits at 8 and 16: Dark Hooded Cloak 8, cell 69,16, saved as outline black as live saves it).

   MEASURED (session 95a77113, scratchpad/p627impl/r2), the 311 saved traits at 8 and 16 through the rig's own
   prep.cjs on this page (the worker path):
   - The cells equal patch627's first version (bb68e68) and round 3's fork run (p627r3/speck/runs/
     speck3-live-final) byte for byte on 622 of 622 file-sizes: engine cells, palette cells, final cells and the
     palette report. The two review fixes change nothing there: every trait is a whole multiple, and the worker
     never hands the step its own buffer. (Control: against live, final cells equal on 268/311 and 291/311.)
   - A file the pass does not touch is byte-identical to live: 268 of 268 at 8, 291 of 291 at 16. On the 42 and
     20 it touches, exactly the reported specks differ. The engine moved 1 cell, New York Twin Towers 8 (98,113).
   - Final cells against the source, live > patched (worse/better files), at 8: lone 15221 > 14938 (0/40),
     inventedSteps 60250 > 59343 (0/43), srcLost 151691 > 151680 (0/10), srcInv 76923 > 76855 (6/19),
     famLeave 329197 > 329057 (0/29), chromaOver 148643 > 148587 (1/12). At 16: lone 7390 > 7350 (0/16),
     inventedSteps 20276 > 20204 (0/19), srcLost 54874 both, srcInv 30283 > 30266 (1/8), famLeave 98879 > 98868
     (0/6), chromaOver 45146 > 45144 (0/2).
   - The rig's "old" inversion count, against the run's OWN engine cells (invE), goes the other way: 18360 >
     18373 at 8 (13 files worse, 6 better) and 5303 > 5308 at 16 (2 worse, 0 better), while the end-to-end
     srcInv above falls at both sizes.
   - Protected eight: 14 of 16 byte-identical. Teal Galaxy 8 changes 26 cells (aqua specks in the mint cloud go
     mint, the stars stay; sha256 03fb8bf2...) and Circuit Board 16 one (an orange dot on a gold trace goes gold;
     ff58bf5e...). Both were looked at and judged slightly better; neither is in the rig's checks-allow.json, so
     its checks.cjs passes 21 of 23.
   - THE JUDGE AND THE VETO READ THE SAME THING. The source veto reads the same alpha-weighted cell mean the
     end-to-end counts read, so "0 moves 5+ dE further from the source" holds by construction, and srcLost and
     the like cannot see a move the veto lets through. Pixel by pixel - each pixel of a changed cell voting for
     the nearer of its old and new colour - 199 of the 521 final cells this patch changes went against most of
     their own pixels, in 36 files. Round 3's review named about 20 such cells in 7 files; re-measured, those 7
     files hold 48 (none in Portal Test Chamber), and the worst of them is Retro Skin 8 (10 of its 14 changed
     cells: teal specks gone bright cyan).
     The worst of all is Walnut Chessboard Skin 8 (15 of 28: grain fragments shrink). The vote leans to the old
     colour, which the palette gave to the label most of the pixels carry. No file has been judged worse by eye.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function snapOnce', 'patch625 is not applied'],
  ['function fixClearWords(clear,opaque){', 'patch626 is not applied'],
  ['function fixCropLine(', 'patch628 is not applied'],
  ['function snapToPalette(d,n,w,opts){', 'snapToPalette has no opts'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('SPECK_OUT=10') >= 0 || t.indexOf('function fixSpeckWords') >= 0) throw new Error('patch627 is already applied');
}

/* ---- 1. snapToPalette: the speck pass (round 3's text; code copied, comment edited) ---- */
/* 1a. Its comment, constants and tables go before the loop that writes the palette colours, and the loop records
   each cell's drawn colour and palette index as it writes them. */
doc.swap([
  '  for(let i=0;i<n;i++){',
  '    const o=i*4;',
  '    if(d[o+3]===0) continue;',
  '    const t=hit.get((d[o]<<16)|(d[o+1]<<8)|d[o+2]);',
],
  [
    '  /* NO SPECKS THE DRAWING DID NOT HAVE (patch627; designed in p627 rounds 2 and 3).',
    '',
    '     Everything above maps COLOURS, not cells: each colour goes where its group',
    '     goes, wherever its cells are. So where an area\'s colours sit either side of',
    '     a split between palette colours, a cell can come out plainly another colour',
    '     (SPECK_OUT dE, deltaWord\'s "a clear change") from the cells round it although',
    '     the drawing had it within SPECK_IN dE of them: a speck the palette made.',
    '     Once every colour has its palette colour, such a cell takes the colour its',
    '     area took. Each condition below is there because something measured broke',
    '     without it (p627r2/specks2, the 311 traits at 8 and 16):',
    '       - LONE: SPECK_OUT dE or more from every opaque 4-neighbour but at most one.',
    '         "Every" made the decision hang on one neighbour, and a repaired line',
    '         cell is exactly that neighbour: Utopia at 16, cell 53,23, came out like',
    '         the vote\'s cell beside it and unlike the restored rust there, so the',
    '         palette guard counted one more cell knocked: 13, exactly its limit.',
    '       - AN AREA, NOT A NEIGHBOUR: at least SPECK_AGREE neighbours drawn within',
    '         SPECK_IN dE of it came out one colour, and that is the colour it takes.',
    '         One such neighbour was round 1\'s rule; a line the rules restore next to',
    '         a cell drawn in the line\'s colour is then that one neighbour, the cell',
    '         joins the line in the repaired picture and not in the vote, and the',
    '         palette guard rolls the repair back (Utopia 16: 19 knocked against a',
    '         limit of 13). A cell drawn SPECK_IN dE or more from every',
    '         neighbour - a star, an eye glint, a one-cell highlight - has no such',
    '         neighbour and is never moved.',
    '       - NOT ACROSS A DRAWN EDGE: not the colour of a neighbour drawn SPECK_EDGE',
    '         dE or more from it (patch617\'s 5 dE; round 1 chose it for Walnut',
    '         Chessboard Skin\'s dark grain at 8).',
    '       - IT SUITS THE CELL: the colour is at most SPECK_MARGIN dE further from the',
    '         cell\'s own drawn colour than the colour its group gave it.',
    '       - ITS OWN FAMILY (the owner, 2026-10-02: grass stays green, sky stays',
    '         blue): read against the cell\'s drawn colour as p627\'s family pick read',
    '         one (that pick is not on this page; only this test is) - Oklab hue within SPECK_FAM_TOL degrees (widened below',
    '         SPECK_FAM_CFULL C*) and chroma within SPECK_FAM_X times - for any drawn',
    '         colour of L* SPECK_FAM_L and C* SPECK_FAM_C or more (lower than that',
    '         pick\'s 8 and 10: Colourful Orbits\' near-black navy specks went to the',
    '         dark plum round them); no further out of family than the colour the',
    '         cell had (below SPECK_FAM_FLOOR); never more colourful than both the',
    '         colour it had and SPECK_CCAP times its drawn chroma (without it the',
    '         pass made more cells over-saturated, not fewer); and a',
    '         drawn colour under C* 10 never gains more than SPECK_GREY_C of chroma',
    '         over the colour it had.',
    '       - NO NEW SPECK: a move that leaves the cell itself, or any opaque',
    '         neighbour that was not, SPECK_OUT dE from all its neighbours is taken',
    '         back (round 1\'s candidate made 696 such cells by moving their',
    '         neighbours; without this check this pass makes 60 at 8).',
    '       - a colour the picture draws exactly never moves (as above).',
    '       - THE DRAWING AS DRAWN, NOT ONLY AS THE ENGINE SAW IT (p627 round 3).',
    '         Every "drawn" above reads the ENGINE\'s cell: one colour per cell, the',
    '         weighted MODE of the exact visible colours carrying the winning label',
    '         (two_stage_pack and repair8_pack). Where a thin line',
    '         covers less of a cell than the colour beside it, the engine\'s cell',
    '         has already lost the line, so a cell the palette happened to put in',
    '         the line\'s colour reads as a speck in a flat area, and round 2\'s pass',
    '         took it out: Bikini Bottom 8\'s road edge lost 99,75, 100,75 and the',
    '         step at 19,111, Always Has Been Pixels 8 the crack cells 152,104 and',
    '         88,132 (round 2\'s verifier, against the picture). So when the caller',
    '         hands over the picture the engine was given (opts.src, {data, width,',
    '         height}, RGBA - the worker passes it to every palette step, the',
    '         line-repair guards\' and the last, so the guards still read the',
    '         output\'s own mapping), each cell also has a SOURCE colour, the',
    '         alpha-weighted mean of the picture\'s pixels the ENGINE put in the',
    '         cell. Pixel x is in cell floor(x*cols/W), as two_stage_pack,',
    '         repair8_pack and fixOutlineSource put it, so the box runs from',
    '         ceil(cx*W/cols) to before ceil((cx+1)*W/cols), and the same down. (A',
    '         first version took floor(cx*W/cols): one pixel left of and above the',
    '         engine\'s cell wherever W/cols is not whole, so a 1px line on a cell\'s',
    '         last column was missed. At a whole multiple, as on the 311 traits at',
    '         8 and 16, the two are one box, the one the rig\'s end-to-end counts',
    '         use.) A move must pass two',
    '         of the tests above read on it as well:',
    '           NOT ACROSS A DRAWN EDGE: no neighbour that came out in the colour',
    '           is SPECK_EDGE dE or more from the cell in the source;',
    '           IT SUITS THE CELL: the colour is at most SPECK_MARGIN dE further',
    '           from the cell\'s source colour than the colour it had.',
    '         The source only refuses; the engine\'s cells still decide what is a',
    '         speck and where it goes. Measured on the 311 traits at 8 and 16, the',
    '         page\'s worker path, final cells against the source, on the live',
    '         pick at 8: edges the source draws 12 dE or more apart that come out',
    '         as one colour fall by 11 and rise on no file (round 2\'s pass: up 83,',
    '         on 25 files); lone specks fall by 283 (round 2\'s: 448); round 2\'s',
    '         verifier\'s pixel-level hunt finds no drawn edge merged at 8 or 16',
    '         (round 2\'s pass: 181). Most of the light/dark inversions round 2\'s',
    '         pass removed it removed by merging the two cells into one colour (346',
    '         of 368, on its palette cells), which this pass refuses across a',
    '         drawn edge. Those counts and this test read the same cell mean, so they',
    '         cannot see a move it lets through, and "0 moves 5+ dE further from',
    '         the source" holds by construction (SPECK_MARGIN). Pixel by pixel -',
    '         each pixel of a changed cell voting for the nearer of its old and new',
    '         colour - of the 521 final cells the patch changes on the',
    '         311 traits at 8 and 16, 199 went against most of their own pixels, in',
    '         36 files; the worst is Walnut Chessboard Skin 8, 15 of 28',
    '         (a vote that leans to the old colour, the palette\'s for the label most',
    '         of the pixels carry). Round 3\'s review named about 20 such cells in 7',
    '         files; nobody has judged a file worse by eye.',
    '         Deciding "drawn" on the source ALONE (option a as first worded)',
    '         was measured and is worse: a cell mean cannot see what the engine\'s',
    '         label colours keep - a highlight or a line under half a cell - and it',
    '         moved 2,569 cells, 841 of them against most of the cell\'s own pixels,',
    '         on 237 file-sizes, 7 of them protected (round 2\'s pass: 925, on 75).',
    '         Nor does either source-free alternative do it: a move that may not',
    '         go further from its ENGINE colour keeps 391 of the 925 moves and still',
    '         takes 19,111, 152,104 and 88,132, which the engine\'s cells do not',
    '         draw; protecting thin strokes in the engine\'s cells changes almost',
    '         nothing (an engine stroke\'s cells are never "drawn within SPECK_IN"',
    '         of the cells across it, so they never vote). The source\'s family is',
    '         not read: it refused 44 more moves, of which by the rig\'s family',
    '         count 2 would have left the drawn family and 3 come back into it.',
    '         The editor\'s Colours to palette hands over the picture as it was',
    '         before the step (patch627), so the button runs the pass as the fixer',
    '         does. There the cells ARE the picture: each box is the cell\'s own',
    '         pixel, its source colour is its own drawn colour, and the two tests',
    '         above are the engine-cell tests again, so they refuse nothing more',
    '         (a translucent pixel\'s mean can differ in the last bit). Measured on',
    '         the 311 traits at 1280: the button\'s pixels and report are',
    '         byte-identical with and without the picture; the pass joins 68,274',
    '         pixels there, on 57 of them; and a picture that disagrees with the',
    '         cells (every colour inverted) changes the result on 52, so the',
    '         picture is read. Without opts.src (a caller with no picture) the',
    '         engine\'s cells alone decide. A cell whose box has no alpha has no',
    '         source colour and the engine alone decides it. A picture that is d',
    '         itself, or shares its bytes, is copied before the palette colours',
    '         are written into d (see SRC_IN below).',
    '     Up to SPECK_PASSES rounds. A round\'s proposals read the cells as the',
    '     round began, so they do not depend on scan order; all of a round\'s moves',
    '     are made together, then the ones that leave a new speck are taken back',
    '     until none does. THE TAKE-BACK DOES DEPEND ON SCAN ORDER: it takes moves',
    '     back one at a time in scan order, and taking one back can settle',
    '     another, so where two moves unsettle each other the first met goes',
    '     back. Measured on the engine cells of the 63 file-sizes the pass',
    '     changes on the 311 traits at 8 and 16, no picture handed over, where',
    '     live\'s step is mirror-exact on every one: a mirrored drawing\'s',
    '     answer is not the mirror of the drawing\'s on 3 of them (Utopia 8, 2',
    '     cells left-right and 1 top-bottom; Castle Crossroads 8 and Obsidian',
    '     Lava 8, 2 top-bottom each), and taking back in reverse scan order',
    '     changes the same 3: Utopia 8 by 3 cells, and its specks from 52 to 53,',
    '     the other two by 2 cells each.',
    '     Left so: an order-free take-back changes cells that round 3 measured',
    '     and reviewed. Only with',
    '     the row length w, and not with opts.shades===false (the step as it was',
    '     before patch617: palettenocap.spec.js holds that step to a written-out',
    '     scan). The palette is indexed so the per-cell work is table lookups: the',
    '     editor\'s Colours to palette runs this on all 1,638,400 pixels. The answer\'s',
    '     specks is the number of cells moved, and the run says it (fixSpeckWords). */',
    '  const SPECK_OUT=10, SPECK_IN=3, SPECK_AGREE=2, SPECK_EDGE=5, SPECK_MARGIN=3, SPECK_PASSES=3,',
    '    SPECK_FAM_L=3, SPECK_FAM_C=5, SPECK_FAM_TOL=12, SPECK_FAM_CFULL=25, SPECK_FAM_X=2, SPECK_FAM_FLOOR=0.5, SPECK_CCAP=1.4, SPECK_GREY_C=4;',
    '  const SPECK=SHADE_APART && w>0 && n%w===0 && groups.length>0;',
    '  /* THE PICTURE AS IT WAS, NOT AS THIS STEP LEAVES IT (patch627 review). The loop below writes the palette',
    '     colours into d, and the speck pass reads opts.src after it. A caller that hands d itself as the picture -',
    '     a folder run in Scale only does, since its engine\'s answer is the bytes that came in - would have the pass',
    '     read the palette\'s colours as the drawing and refuse every join. So a picture that is d, or another view',
    '     of d\'s bytes, is copied here, before the loop: once, at the one place every caller passes through. */',
    '  const SRC_IN=(SPECK && opts && opts.src && opts.src.data && (opts.src.data===d || (d.buffer!==undefined && opts.src.data.buffer===d.buffer)))',
    '    ? {data:new Uint8ClampedArray(opts.src.data), width:opts.src.width, height:opts.src.height} : (opts ? opts.src : undefined);',
    '  let inK=null, cur=null, palIdx=null;',
    '  if(SPECK){',
    '    inK=new Int32Array(n); cur=new Int16Array(n);',
    '    palIdx=new Map(); for(let k=0;k<pal.length;k++) palIdx.set((pal[k].r<<16)|(pal[k].g<<8)|pal[k].b,k);',
    '  }',
    '  for(let i=0;i<n;i++){',
    '    const o=i*4;',
    '    if(d[o+3]===0){ if(SPECK){ inK[i]=-1; cur[i]=-1; } continue; }',
    '    const key=(d[o]<<16)|(d[o+1]<<8)|d[o+2];',
    '    const t=hit.get(key);',
    '    if(SPECK){ inK[i]=key; cur[i]=t ? palIdx.get((t.r<<16)|(t.g<<8)|t.b) : palIdx.get(key); }',
  ]);
/* 1b. The pass itself runs after that loop, and the answer carries specks. */
doc.swap('  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst, opaque:opaque, share:opaque?pixels/opaque:0, apart:apart, clear:clear, clearShare:opaque?clear/opaque:0};',
  [
    '  let specks=0;',
    '  if(SPECK){',
    '    const P=pal.length;',
    '    /* distances, each worked out once: palette to palette (a table), drawn to drawn, drawn to palette */',
    '    const pd=new Float64Array(P*P).fill(-1);',
    '    const dPP=(a,b)=>{ if(a===b) return 0; const x=a*P+b; let v=pd[x]; if(v<0){ const A=palLab[a], B=palLab[b]; v=deltaE2000(A[0],A[1],A[2],B[0],B[1],B[2]); pd[x]=v; pd[b*P+a]=v; } return v; };',
    '    const labC=new Map();',
    '    const labK=k=>{ let v=labC.get(k); if(!v){ v=labOf((k>>16)&255,(k>>8)&255,k&255); labC.set(k,v); } return v; };',
    '    const iiC=new Map();',
    '    const dII=(a,b)=>{ if(a===b) return 0; const kk=a<b ? a*16777216+b : b*16777216+a; let v=iiC.get(kk); if(v===undefined){ const x=labK(a), y=labK(b); v=deltaE2000(x[0],x[1],x[2],y[0],y[1],y[2]); iiC.set(kk,v); } return v; };',
    '    const ipC=new Map();',
    '    const dIP=(a,p)=>{ const kk=a*P+p; let v=ipC.get(kk); if(v===undefined){ const x=labK(a), y=palLab[p]; v=deltaE2000(x[0],x[1],x[2],y[0],y[1],y[2]); ipC.set(kk,v); } return v; };',
    '    /* a palette colour\'s Oklab chroma and hue, and its CIELAB chroma */',
    '    const palOk=new Array(P);',
    '    const okP=p=>{ let v=palOk[p]; if(!v){ const q=palLab[p], o=labToOklab(q[0],q[1],q[2]); v=[Math.hypot(o[1],o[2]), Math.atan2(o[2],o[1]), Math.hypot(q[1],q[2])]; palOk[p]=v; } return v; };',
    '    /* a drawn colour\'s family (Ca undefined: too dark or too grey to have one) */',
    '    const famC=new Map();',
    '    const famOf=k=>{ let v=famC.get(k); if(v===undefined){ const L=labK(k), C=Math.hypot(L[1],L[2]); if(L[0]>=SPECK_FAM_L && C>=SPECK_FAM_C){ const o=labToOklab(L[0],L[1],L[2]); v={Ca:Math.hypot(o[1],o[2]), ha:Math.atan2(o[2],o[1]), tol:SPECK_FAM_TOL*Math.max(1,SPECK_FAM_CFULL/C), C:C}; } else v={C:C}; famC.set(k,v); } return v; };',
    '    const famS=(f,q)=>{ let dh=Math.abs(q[1]-f.ha)*180/Math.PI; if(dh>180) dh=360-dh; return Math.max(dh/f.tol, Math.abs(Math.log(Math.max(q[0],1e-9)/f.Ca))/Math.log(SPECK_FAM_X)); };',
    '    /* may cell i, whose group gave it palette colour o, take palette colour p */',
    '    const famOK=(i,p,o)=>{',
    '      const f=famOf(inK[i]), q=okP(p);',
    '      if(q[2]>Math.max(okP(o)[2], SPECK_CCAP*f.C)) return false;',
    '      if((f.Ca===undefined || f.C<10) && q[2]>Math.max(okP(o)[2], f.C+SPECK_GREY_C)) return false;',
    '      if(f.Ca===undefined) return true;',
    '      const s=famS(f,q);',
    '      return s<=1 && s<=Math.max(famS(f,okP(o)),SPECK_FAM_FLOOR);',
    '    };',
    '    /* a speck: SPECK_OUT dE or more from every opaque 4-neighbour but at most one, and from at least two */',
    '    const loneIn=i=>{',
    '      const a=cur[i], x=i%w; let c=0, nearC=0;',
    '      if(x+1<w && inK[i+1]>=0){ c++; if(dPP(a,cur[i+1])<SPECK_OUT && ++nearC>1) return false; }',
    '      if(x>0 && inK[i-1]>=0){ c++; if(dPP(a,cur[i-1])<SPECK_OUT && ++nearC>1) return false; }',
    '      if(i+w<n && inK[i+w]>=0){ c++; if(dPP(a,cur[i+w])<SPECK_OUT && ++nearC>1) return false; }',
    '      if(i>=w && inK[i-w]>=0){ c++; if(dPP(a,cur[i-w])<SPECK_OUT && ++nearC>1) return false; }',
    '      return c-nearC>=2;',
    '    };',
    '    /* lone: SPECK_OUT dE or more from every opaque 4-neighbour */',
    '    const lone1=i=>{',
    '      const a=cur[i], x=i%w; let c=0;',
    '      if(x+1<w && inK[i+1]>=0){ c++; if(dPP(a,cur[i+1])<SPECK_OUT) return false; }',
    '      if(x>0 && inK[i-1]>=0){ c++; if(dPP(a,cur[i-1])<SPECK_OUT) return false; }',
    '      if(i+w<n && inK[i+w]>=0){ c++; if(dPP(a,cur[i+w])<SPECK_OUT) return false; }',
    '      if(i>=w && inK[i-w]>=0){ c++; if(dPP(a,cur[i-w])<SPECK_OUT) return false; }',
    '      return c>0;',
    '    };',
    '    const nbs=i=>{ const r=[], x=i%w; if(x+1<w && inK[i+1]>=0) r.push(i+1); if(x>0 && inK[i-1]>=0) r.push(i-1); if(i+w<n && inK[i+w]>=0) r.push(i+w); if(i>=w && inK[i-w]>=0) r.push(i-w); return r; };',
    '    /* a cell\'s SOURCE colour (Lab), worked out the first time it is asked for: only the cells the pass looks at */',
    '    const SRC=(SRC_IN && SRC_IN.data && SRC_IN.width>0 && SRC_IN.height>0 && SRC_IN.data.length>=SRC_IN.width*SRC_IN.height*4) ? SRC_IN : null;',
    '    const srcC=SRC ? new Array(n) : null;',
    '    const srcOf=i=>{',
    '      let v=srcC[i]; if(v!==undefined) return v;',
    '      const sd=SRC.data, SW=SRC.width, SH=SRC.height, nr=n/w, cx=i%w, cy=(i-cx)/w;',
    '      let r=0, g=0, b=0, al=0;',
    '      /* the pixels the engine put in this cell: x with floor(x*w/SW)===cx, and y likewise */',
    '      for(let y=Math.ceil(cy*SH/nr), y1=Math.ceil((cy+1)*SH/nr); y<y1; y++) for(let x=Math.ceil(cx*SW/w), x1=Math.ceil((cx+1)*SW/w); x<x1; x++){ const o=(y*SW+x)*4, a=sd[o+3]/255; r+=sd[o]*a; g+=sd[o+1]*a; b+=sd[o+2]*a; al+=a; }',
    '      v=al>0 ? labOf(r/al,g/al,b/al) : null; srcC[i]=v; return v;',
    '    };',
    '    const orig=cur.slice();',
    '    for(let pass=0;pass<SPECK_PASSES;pass++){',
    '      const prop=[];',
    '      for(let i=0;i<n;i++){',
    '        if(inK[i]<0 || !loneIn(i)) continue;',
    '        if(hit.get(inK[i])===null) continue;',
    '        const N=nbs(i);',
    '        /* the colour most of its drawn-near neighbours came out as (ties: the one nearest its drawn colour) */',
    '        let B=-1, sB=0, eB=Infinity;',
    '        for(const j of N){',
    '          if(dII(inK[i],inK[j])>SPECK_IN) continue;',
    '          const b=cur[j]; if(b===cur[i]) continue;',
    '          let s=0; for(const j2 of N) if(cur[j2]===b && dII(inK[i],inK[j2])<=SPECK_IN) s++;',
    '          const e=dIP(inK[i],b);',
    '          if(s>sB || (s===sB && (e<eB || (e===eB && b<B)))){ B=b; sB=s; eB=e; }',
    '        }',
    '        if(B<0 || sB<SPECK_AGREE) continue;',
    '        if(eB>dIP(inK[i],orig[i])+SPECK_MARGIN) continue;',
    '        let edge=false; for(const j of N) if(cur[j]===B && dII(inK[i],inK[j])>=SPECK_EDGE){ edge=true; break; }',
    '        if(edge) continue;',
    '        if(!famOK(i,B,orig[i])) continue;',
    '        if(SRC){',
    '          const sc=srcOf(i);',
    '          if(sc){',
    '            const pB=palLab[B], pO=palLab[orig[i]];',
    '            if(deltaE2000(sc[0],sc[1],sc[2],pB[0],pB[1],pB[2])>deltaE2000(sc[0],sc[1],sc[2],pO[0],pO[1],pO[2])+SPECK_MARGIN) continue;',
    '            let across=false;',
    '            for(const j of N){ if(cur[j]!==B) continue; const t=srcOf(j); if(t && deltaE2000(sc[0],sc[1],sc[2],t[0],t[1],t[2])>=SPECK_EDGE){ across=true; break; } }',
    '            if(across) continue;',
    '          }',
    '        }',
    '        prop.push(i,B);',
    '      }',
    '      if(!prop.length) break;',
    '      const act=new Map(), was=new Map(), preLone=new Map();',
    '      for(let t=0;t<prop.length;t+=2){ act.set(prop[t],prop[t+1]); was.set(prop[t],cur[prop[t]]); }',
    '      for(const i of act.keys()){ for(const j of nbs(i)) if(!preLone.has(j)) preLone.set(j,lone1(j)); }',
    '      for(const [i,b] of act) cur[i]=b;',
    '      for(let changed=true; changed;){',
    '        changed=false;',
    '        for(const [i] of act){',
    '          let bad=lone1(i);',
    '          if(!bad) for(const j of nbs(i)){ if(act.has(j) || preLone.get(j)) continue; if(lone1(j)){ bad=true; break; } }',
    '          if(bad){ cur[i]=was.get(i); act.delete(i); changed=true; }',
    '        }',
    '      }',
    '      if(!act.size) break;',
    '    }',
    '    /* the report as the cells now stand: clear-change pixels recounted for the moved cells, and the furthest',
    '       move taken over the moved cells and over every colour that still has a cell where its group put it */',
    '    let mv=0, cl=0, wo=0;',
    '    const mvK=new Map();',
    '    for(let i=0;i<n;i++){',
    '      if(inK[i]<0 || cur[i]===orig[i]) continue;',
    '      mv++;',
    '      const f0=dIP(inK[i],orig[i]), f1=dIP(inK[i],cur[i]);',
    '      if(f0>=10) cl--;',
    '      if(f1>=10) cl++;',
    '      if(f1>wo) wo=f1;',
    '      mvK.set(inK[i],(mvK.get(inK[i])||0)+1);',
    '    }',
    '    if(mv){',
    '      for(const g of groups){',
    '        const tl=labOf(g.target.r,g.target.g,g.target.b);',
    '        for(const mm of g.members){',
    '          if((mvK.get(mm.c.key)||0)>=mm.c.px) continue;',
    '          const f=deltaE2000(mm.lab[0],mm.lab[1],mm.lab[2],tl[0],tl[1],tl[2]);',
    '          if(f>wo) wo=f;',
    '        }',
    '      }',
    '      clear+=cl; worst=wo; specks=mv;',
    '      for(let i=0;i<n;i++){',
    '        if(inK[i]<0 || cur[i]===orig[i]) continue;',
    '        const o=i*4, p=pal[cur[i]];',
    '        d[o]=p.r; d[o+1]=p.g; d[o+2]=p.b;',
    '      }',
    '    }',
    '  }',
    '  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst, opaque:opaque, share:opaque?pixels/opaque:0, apart:apart, clear:clear, clearShare:opaque?clear/opaque:0, specks:specks};',
  ]);

/* ---- 2. the picture reaches every palette step ---------------------------------------- */
/* 2a. The worker: every palette step - the line-repair guards' rounds and the last - gets the picture the engine was
   sent. */
doc.swap('    "    const snap=m.palette?snapOnce(function(d,n,w){ paletteRGB=function(){ return m.palette; }; return snapToPalette(d,n,w); }):null;",',
  [
    '    /* patch627: every palette step here - the line-repair guards\' rounds and the last - is handed the picture',
    '       the engine was sent (opts.src); the speck pass reads each cell\'s colour as drawn from it as well as from the',
    '       engine\'s cell (see snapToPalette). The engine does not write into m.data (measured on four traits at 8 and',
    '       16 in p627 round 3, and the 311 at 8 and 16 give the same cells here as on the main thread with the picture',
    '       the outline pass gets), so every step reads the same picture and snapOnce\'s one answer per bytes stays one',
    '       answer. */',
    '    "    const snap=m.palette?snapOnce(function(d,n,w){ paletteRGB=function(){ return m.palette; }; return snapToPalette(d,n,w,{src:{data:m.data,width:m.width,height:m.height}}); }):null;",',
  ]);
/* 2b. The main-thread step (no answer from the worker) reads the same picture. */
doc.swap('function fixPalApply(out,rel){',
  [
    '/* img (patch627): the picture the engine was sent, {data, width, height}. The main-thread step reads it as the',
    '   worker\'s does (snapToPalette\'s opts.src), so the two give the same cells. Without it the engine\'s cells alone',
    '   decide which stray specks join their area. */',
    'function fixPalApply(out,rel,img){',
  ]);
doc.swap('  const r=(out.pal!==undefined && out.pal!==null) ? out.pal : snapToPalette(out.data,out.width*out.height,out.width);',
  '  const r=(out.pal!==undefined && out.pal!==null) ? out.pal : snapToPalette(out.data,out.width*out.height,out.width,img&&img.data?{src:img}:undefined);');
/* 2c. Its two callers pass the picture the outline pass gets, which is the one the worker was sent. */
doc.swap('        const pal=fixPalApply(r,FIX.rel);', '        const pal=fixPalApply(r,FIX.rel,given);');
doc.swap('      fixPalApply(out,rel);', '      fixPalApply(out,rel,{data:px,width:sw,height:sh});');
/* 2d. The editor's Colours to palette hands over the picture as it was before the step. */
doc.swap('  const r=snapToPalette(im.data,W*H,W);',
  [
    '  /* THE PICTURE AS IT WAS (patch627), so the button runs the speck pass with the same inputs as the fixer. A',
    '     copy: snapToPalette writes the palette colours into im.data before the speck pass reads the picture. Here',
    '     each cell is one pixel of this picture, so its source colour is its own colour and the source tests refuse',
    '     nothing the cell tests have not (see snapToPalette); measured, the button\'s pixels and report are the same',
    '     with and without it. */',
    '  const before=new Uint8ClampedArray(im.data);',
    '  const r=snapToPalette(im.data,W*H,W,{src:{data:before,width:W,height:H}});',
  ]);

/* ---- 3. the run says it ----------------------------------------------------------------- */
doc.swap('let fixPalClear=0, fixPalOpaque=0, fixPalMostShare=0, fixPalMostFile="";',
  [
    'let fixPalClear=0, fixPalOpaque=0, fixPalMostShare=0, fixPalMostFile="";',
    '/* AND THE STRAY SPECKS THAT JOINED THEIR AREA across the run (patch627). */',
    'let fixPalSpecks=0;',
  ]);
doc.swap('fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile=""; fixPalClear=0; fixPalOpaque=0; fixPalMostShare=0; fixPalMostFile="";',
  'fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile=""; fixPalClear=0; fixPalOpaque=0; fixPalMostShare=0; fixPalMostFile=""; fixPalSpecks=0;');
doc.swap('    fixPalClear+=r.clear||0;',
  [
    '    fixPalClear+=r.clear||0;',
    '    fixPalSpecks+=r.specks||0;',
  ]);
/* Above patch626's comment for fixClearWords, so each comment heads its own function (patch627 review). */
doc.swap('/* THE SHARE THAT PLAINLY CHANGED COLOUR (patch626), in the owner\'s words:',
  [
    '/* STRAY SPECKS THAT JOINED THEIR AREA (patch627): cells the palette left as a lone speck in an area drawn',
    '   one colour, which took the colour that area came out as (snapToPalette\'s specks). */',
    'function fixSpeckWords(n){',
    '  if(!(n>0)) return "";',
    '  return n.toLocaleString()+" stray speck"+(n===1?" joined its":"s joined their")+" area";',
    '}',
    '/* THE SHARE THAT PLAINLY CHANGED COLOUR (patch626), in the owner\'s words:',
  ]);
doc.swap('            +(pal.merged?", "+pal.merged+" shade"+(pal.merged===1?"":"s")+" merged into a neighbour":"")',
  [
    '            +(pal.merged?", "+pal.merged+" shade"+(pal.merged===1?"":"s")+" merged into a neighbour":"")',
    '            +(pal.specks?", "+fixSpeckWords(pal.specks):"")',
  ]);
doc.swap('      +(fixPalMerged?", "+fixPalMerged+" shade"+(fixPalMerged===1?"":"s")+" merged into a neighbour":"")',
  [
    '      +(fixPalMerged?", "+fixPalMerged+" shade"+(fixPalMerged===1?"":"s")+" merged into a neighbour":"")',
    '      +(fixPalSpecks?", "+fixSpeckWords(fixPalSpecks):"")',
  ]);

doc.finish(({ must, code, text }) => {
  must('const SPECK_OUT=10, SPECK_IN=3, SPECK_AGREE=2, SPECK_EDGE=5, SPECK_MARGIN=3, SPECK_PASSES=3,', 'the speck constants');
  must('clear+=cl; worst=wo; specks=mv;', 'the recount after the pass');
  /* the review fixes (gen-blocks.cjs CODE_EDITS) */
  must('(opts.src.data===d || (d.buffer!==undefined && opts.src.data.buffer===d.buffer)))', 'a picture that is d is copied');
  must('{data:new Uint8ClampedArray(opts.src.data), width:opts.src.width, height:opts.src.height}', 'the copy');
  must('const SRC=(SRC_IN && SRC_IN.data &&', 'the pass reads the copy');
  must('for(let y=Math.ceil(cy*SH/nr), y1=Math.ceil((cy+1)*SH/nr); y<y1; y++) for(let x=Math.ceil(cx*SW/w), x1=Math.ceil((cx+1)*SW/w); x<x1; x++){', "the source box is the engine's cell");
  if (code.indexOf('Math.floor(cx*sx)') >= 0 || code.indexOf('Math.floor(cy*sy)') >= 0) throw new Error("the first version's source box is still there");
  /* each comment heads its own function */
  if (text.indexOf('area. Under 1% is said as such rather than as 0. */' + s0.NL + 'function fixClearWords(clear,opaque){') < 0) throw new Error("patch626's comment does not head fixClearWords");
  if (text.indexOf("(snapToPalette's specks). */" + s0.NL + 'function fixSpeckWords(n){') < 0) throw new Error("patch627's comment does not head fixSpeckWords");
  must('clearShare:opaque?clear/opaque:0, specks:specks};', 'specks in the answer');
  must('return snapToPalette(d,n,w,{src:{data:m.data,width:m.width,height:m.height}}); }):null;', 'the worker glue');
  must('snapToPalette(out.data,out.width*out.height,out.width,img&&img.data?{src:img}:undefined)', 'the main-thread step');
  must('const pal=fixPalApply(r,FIX.rel,given);', 'the single run passes its picture');
  must('fixPalApply(out,rel,{data:px,width:sw,height:sh});', 'the folder passes its picture');
  must('const r=snapToPalette(im.data,W*H,W,{src:{data:before,width:W,height:H}});', 'the editor passes its picture');
  must('fixPalSpecks+=r.specks||0;', 'the folder total');
  must('+(pal.specks?", "+fixSpeckWords(pal.specks):"")', 'the single sentence');
  must('+(fixPalSpecks?", "+fixSpeckWords(fixPalSpecks):"")', 'the folder sentence');
  /* EVERY CALLER OF snapToPalette HANDS OVER A PICTURE. fe59939's code has four snapToPalette( - the definition,
     the editor button, the worker glue and fixPalApply's fallback; a new caller added later without one would run
     the pass on the engine's cells alone, so this counts them rather than trusting the three swaps above. */
  const parts = code.split('snapToPalette(');
  if (parts.length - 1 !== 4) throw new Error('expected 4 snapToPalette( in the code, found ' + (parts.length - 1));
  for (const p of parts.slice(1)) {
    let dep = 1, k = 0;
    while (k < p.length && dep > 0) { if (p[k] === '(') dep++; else if (p[k] === ')') dep--; k++; }
    const args = p.slice(0, k - 1);
    if (args === 'd,n,w,opts') continue;
    if (args.indexOf('src') < 0) throw new Error('a snapToPalette call hands over no picture: (' + args + ')');
  }
});
