/* patch633: A STROKE COUNTS WHEN IT STANDS OUT FROM WHAT IS ACROSS IT.

   fixThinStrokes counts the blocks of a picture that are a stroke one block wide - the detail a cut across the
   blocks can lose - and a run says the count ("557 strokes one block wide may not survive it"), lists the files
   that hold some, and names a size that keeps them. Its test for a stroke is a block whose two neighbours along it
   are its colour and whose two neighbours across it are one other colour. ANY other colour: a shade one step off
   the ground, which nobody can see or barely can, is a stroke, and the run warns about losing it.

   Measured at 645dbfe (session 95a77113, scratchpad/p633/contrast.cjs and alpha.cjs, the page's own fixNativeBlock,
   fixThinStrokes, labOf and deltaE2000 carved from the live page) over the 311 saved traits: 8,251 strokes counted,
   2,650 of them under 2.3 apart by CIEDE2000 from the colour across them - 1,740 under 1 ("invisible" in deltaWord's
   words) and 910 "barely visible" - and every one of the 2,650 opaque, with both blocks across it opaque too. Utopia
   557 of 557 (greys a step apart in the sky and wall), Dark Skin 208 of 208, Black and White Rays 1,547 of 1,627,
   Ruins Selfie 47 of 47. Seven traits count nothing once those go; Backrooms Hallway keeps all 615 and the Make
   Solana Great Again Hat its 243. The 910 "barely visible" (scratchpad/p633/barely.cjs) are near-black shades
   (Black and White Rays: 588 of #0a0a0a on #000000, 1.59 apart), skin tones a shade apart (Dark Skin: 115 at 1.02)
   and, in six traits, black lines on #0d0d0d, 2.11 apart - 48 strokes, 34 of them Skull Mask Charcoal's (it keeps
   7 of 41). Those are drawn, and a cut can break them; what it breaks is as faint as the line.
   NOT SEEN, BEFORE OR AFTER, and measured while reviewing this: Utopia's orange line-work. 77 of its orange blocks
   are in straight runs one block wide (more run diagonally), and the count has never seen one - it needs the same
   colour exactly along a line and on both sides, and Utopia's orange varies by a shade from block to block (0 of
   the 77 pass either test; scratchpad/p633/utopia.cjs). Left for its own patch. The owner, told that the count "treats colours
   you can't tell apart as separate lines" and that Ruins Selfie's 47 "are really invisible noise": "yes go ahead".

   WHAT CHANGES: fixThinStrokes counts a stroke only when it stands out from what is across it - the colour across
   is clear, or the paint differs (either block across has a different alpha from the stroke), or the two colours
   are at least 2.3 apart by CIEDE2000, deltaWord's line between "barely visible" and "slight". All of this is asked
   only of a block whose colour already differs from the colour across: the structural test compares colours
   without alpha, so a line in the colour beside it, at any alpha, was never a stroke and is not now (0 such
   candidates on the 311, measured by review). Every reader
   of the count reads it through this one function - the single run's cut and merge clauses, the folder's lists and
   advice, and the worker's fixStrokesKept, which visits the same strokes - so they all agree. The 2.3 is written in
   the function rather than read from deltaWord, because the worker carries fixThinStrokes as its text (with labOf
   and deltaE2000, already there for fixStrokesKept) and not deltaWord; tests/strokesseen.spec.js holds the two
   together (it finds deltaWord's line and reads this one out of the function). No stroke on the 311 is between
   2.290 and 2.517 apart, so the counts would be the same anywhere in that range (measured by review). The alpha
   condition changes nothing on the 311 (all 2,650 are opaque on both sides); it is there so a see-through line in
   another colour, which shows whatever is under it, is not dropped for how close its colour is.

   Superseded comments are kept with a note: fixThinStrokes' "one other colour" and its counts, and the count in
   tests/thinstrokes.spec.js's stems test.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function fixStrokesKept(', 'patch629 is not applied'],
  ['function fixAlphaKeptWords(files,browser){', 'patch632 is not applied'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('SUPERSEDED IN PART (patch633)') >= 0) throw new Error('patch633 is already applied');
}

/* ---- the count: a stroke the eye can tell from what is across it ---- */
doc.swap(
  [
    '   block, its colour, the colour across it, whether it runs down (its',
    '   across neighbours are left and right), and its alpha. The count is the',
    '   same with or without it. */',
    'function fixThinStrokes(data,W,H,block,visit){',
    '  block=block|0; if(block<2||!data) return 0;',
    '  const w=Math.floor(W/block), h=Math.floor(H/block), half=Math.floor(block/2);',
    '  if(w<3||h<3) return 0;',
    '  const a=new Int32Array(w*h);',
    '  for(let by=0;by<h;by++) for(let bx=0;bx<w;bx++){',
    '    const i=((by*block+half)*W+bx*block+half)*4;',
    '    a[by*w+bx]=data[i+3]===0 ? -1 : ((data[i]<<16)|(data[i+1]<<8)|data[i+2]);',
    '  }',
    '  const atb=(x,y)=>(x<0||y<0||x>=w||y>=h) ? -2 : a[y*w+x];',
    '  let n=0;',
    '  for(let y=0;y<h;y++) for(let x=0;x<w;x++){',
    '    const me=a[y*w+x]; if(me===-1) continue;',
    '    const Lf=atb(x-1,y), Rt=atb(x+1,y), Up=atb(x,y-1), Dn=atb(x,y+1);',
    '    if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me){ n++; if(visit) visit(x,y,me,Lf,true,data[((y*block+half)*W+x*block+half)*4+3]); }',
    '    if(Lf===me&&Rt===me&&Up===Dn&&Up!==me){ n++; if(visit) visit(x,y,me,Up,false,data[((y*block+half)*W+x*block+half)*4+3]); }',
    '  }',
    '  return n;',
    '}',
  ],
  [
    '   block, its colour, the colour across it, whether it runs down (its',
    '   across neighbours are left and right), and its alpha. The count is the',
    '   same with or without it. */',
    '/* SUPERSEDED IN PART (patch633): "one other colour" above. A stroke now',
    '   counts when it stands out from what is across it: the colour across is',
    '   clear, or its paint differs (either block across has another alpha than',
    '   the stroke), or the two colours are at least 2.3 apart by CIEDE2000 -',
    '   deltaWord\'s line between "barely visible" and "slight". Asked only of a',
    '   block whose colour already differs from the colour across: the test',
    '   above compares colours without alpha, so a line in the colour beside it,',
    '   at any alpha, is not a stroke, as before. Below 2.3 the run warned about',
    '   shades: at 645dbfe, 2,650 of the 8,251 strokes counted on the 311 saved',
    '   traits were under 2.3, every one opaque on both sides - 1,740 under 1',
    '   (Utopia 557 of 557, Ruins Selfie 47 of 47), and 910 "barely visible":',
    '   near-black shades, skin tones a shade apart (Dark Skin 208 of 208 in',
    '   all), and in six traits black lines on #0d0d0d, 2.11 apart (Skull Mask',
    '   Charcoal keeps 7 of 41) - drawn, but what a cut breaks there is as faint',
    '   as the line. Backrooms Hallway keeps all 615 and the hat its 243. The',
    '   counts in the comments above and in fixStrokesKept\'s (2,623 strokes on',
    '   the 89 traits drawn at 10px) were taken before this, when every shade',
    '   counted.',
    '   The 2.3 is written here, not read from deltaWord: the worker carries this',
    '   function as its text, with labOf and deltaE2000 but not deltaWord.',
    '   tests/strokesseen.spec.js holds the two together. */',
    'function fixThinStrokes(data,W,H,block,visit){',
    '  block=block|0; if(block<2||!data) return 0;',
    '  const w=Math.floor(W/block), h=Math.floor(H/block), half=Math.floor(block/2);',
    '  if(w<3||h<3) return 0;',
    '  const a=new Int32Array(w*h), al=new Uint8Array(w*h);',
    '  for(let by=0;by<h;by++) for(let bx=0;bx<w;bx++){',
    '    const i=((by*block+half)*W+bx*block+half)*4;',
    '    a[by*w+bx]=data[i+3]===0 ? -1 : ((data[i]<<16)|(data[i+1]<<8)|data[i+2]);',
    '    al[by*w+bx]=data[i+3];',
    '  }',
    '  const atb=(x,y)=>(x<0||y<0||x>=w||y>=h) ? -2 : a[y*w+x];',
    '  /* patch633: the block at i, its colour me, the colour across it, and the',
    '     two blocks across, j and k - which are in the picture whenever the',
    '     colour across is not clear (they are one colour, so both exist). */',
    '  const labs=new Map(), lab=c=>{ let v=labs.get(c); if(!v){ v=labOf((c>>16)&255,(c>>8)&255,c&255); labs.set(c,v); } return v; };',
    '  const seen=(i,me,other,j,k)=>{',
    '    if(other<0||al[j]!==al[i]||al[k]!==al[i]) return true;',
    '    const p=lab(me), q=lab(other);',
    '    return !(deltaE2000(p[0],p[1],p[2],q[0],q[1],q[2])<2.3);',
    '  };',
    '  let n=0;',
    '  for(let y=0;y<h;y++) for(let x=0;x<w;x++){',
    '    const me=a[y*w+x]; if(me===-1) continue;',
    '    const Lf=atb(x-1,y), Rt=atb(x+1,y), Up=atb(x,y-1), Dn=atb(x,y+1), i=y*w+x;',
    '    if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me&&seen(i,me,Lf,i-1,i+1)){ n++; if(visit) visit(x,y,me,Lf,true,data[((y*block+half)*W+x*block+half)*4+3]); }',
    '    if(Lf===me&&Rt===me&&Up===Dn&&Up!==me&&seen(i,me,Up,i-w,i+w)){ n++; if(visit) visit(x,y,me,Up,false,data[((y*block+half)*W+x*block+half)*4+3]); }',
    '  }',
    '  return n;',
    '}',
  ]);

doc.finish(({ text, must }) => {
  /* must reads the code with its comments taken out, so the note is looked for in the text */
  if (text.split('SUPERSEDED IN PART (patch633): "one other colour" above.').length !== 2) throw new Error('the supersede note is not in the page exactly once');
  must('if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me&&seen(i,me,Lf,i-1,i+1)){', 'the down stroke seen');
  must('if(Lf===me&&Rt===me&&Up===Dn&&Up!==me&&seen(i,me,Up,i-w,i+w)){', 'the across stroke seen');
  must('return !(deltaE2000(p[0],p[1],p[2],q[0],q[1],q[2])<2.3);', 'the threshold');
  must('labOf.toString(), deltaE2000.toString(), snapToPalette.toString()', 'the worker carries labOf and deltaE2000');
  must('fixThinStrokes.toString(), fixStrokesKept.toString()].join("\\n");', 'the worker carries fixThinStrokes');
});
