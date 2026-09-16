/* THE SHAPE IS WORKED OUT AT THE SIZE IT WAS DRAWN.

   "i want it to be 1:1 the base why tf would i want it to be close but not the
   exact same, that makes 0 sense"

   Right, and not about wording. 478 scaled the source onto the canvas FIRST and
   then decided what the shape was, which works while the two are the same size
   and falls apart the moment they are not. Measured, a 1280 line-art base of a
   character:

     onto 1280      583,539 pixels - the body, 36% of the canvas
     onto  320          403 pixels - broken pieces of stroke
     onto  160           93 pixels

   Nearest-neighbour is what a pixel editor must downscale with, and a 1px line
   downscaled 4:1 by nearest-neighbour is not a line any more - it is a dotted
   one. A dotted outline encloses nothing, so the flood walks through the gaps,
   nothing is inside, and what comes back is the fragments that survived. Every
   trait smaller than the base - which is most of them - got that.

   SO THE ORDER IS THE OTHER WAY ROUND NOW. Drop the ground and fill the inside
   at the source's OWN resolution, where the lines are still lines and still
   meet, and scale the finished mask down afterwards. A solid region survives
   nearest-neighbour: its edge moves by at most a pixel. A one-pixel outline
   does not survive it at all.

   PLACED BY THE SAME RULE, still. The finished mask is put onto the canvas
   through paintTrait, exactly as the pixels were before, so where the shape
   lands is unchanged and still agrees with where the base sits behind the art.
   Only WHEN the thinking happens moved.

   IT COSTS A FULL-SIZE PASS. A 1280 source is 1.6 million pixels through three
   loops and a flood. That is the size of the thing being asked about, and the
   answer at any other size is wrong - so it is not a trade, it is the price.
   The scratch canvases are handed back at 1x1 the moment they are done with,
   the way every other full-size scratch in this file is. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function seShapeRegion(rec){');
const from = kit.only(L, l => l === '  const W=art.width, H=art.height;', 'the canvas size', fn);
const to = kit.only(L, l => l === '  return {region,n,ground};', 'what the shape hands back', fn);

kit.replace(L, { start: from, end: to }, [
  '  const W=art.width, H=art.height;',
  '  const bm=await cBitmap(rec);',
  '  /* AT THE SIZE IT WAS DRAWN, not at the size of the canvas.',
  '',
  '     This used to scale the source on first and decide what the shape was',
  '     afterwards, which is the same answer while the two sizes match and',
  '     rubbish as soon as they do not. Nearest-neighbour is what a pixel editor',
  '     has to downscale with, and a 1px line taken 4:1 by nearest-neighbour is a',
  '     dotted line. A dotted outline encloses nothing, the flood walks through',
  '     the gaps, and what comes back is the pieces that survived: measured on a',
  '     1280 line-art base, 583,539 pixels onto a 1280 canvas and 403 onto a 320',
  '     one. */',
  '  const bw=Math.max(1,bm.width|0), bh=Math.max(1,bm.height|0);',
  '  const sc=document.createElement("canvas"); sc.width=bw; sc.height=bh;',
  '  const sg=sc.getContext("2d",{willReadFrequently:true});',
  '  sg.imageSmoothingEnabled=false;',
  '  sg.drawImage(bm,0,0);',
  '  const d=sg.getImageData(0,0,bw,bh).data;',
  '  sc.width=1; sc.height=1;',
  '  const N=bw*bh;',
  '  /* ANY INK AT ALL. A threshold - floodFill uses 128 for "is this pixel on" -',
  '     would leave a soft or anti-aliased edge outside the shape, so clearing',
  '     everything outside it would shave off the edge somebody is keeping. */',
  '  let mask=new Uint8Array(N);',
  '  let n=0;',
  '  for(let i=0;i<N;i++) if(d[i*4+3]>0){ mask[i]=1; n++; }',
  '  /* A SOLID GROUND IS NOT PART OF THE SHAPE.',
  '',
  '     A base drawn as linework on white is opaque everywhere, so "what this',
  '     covers" is the whole picture and selecting it does nothing - measured,',
  '     4,096 of 4,096. If the four corners are opaque and agree on a colour,',
  '     that colour is the page and it comes out.',
  '',
  '     ONLY IF SOMETHING IS LEFT. A background trait IS one flat colour, and its',
  '     shape really is the whole canvas, so a rule that emptied it would be wrong',
  '     about the one case it is easiest to hit.',
  '',
  '     The corners rather than the darkness test drawBase uses for showing a',
  '     base: that one is right for showing linework and wrong here, because it',
  '     would throw away every dark trait somebody asks for the shape of. */',
  '  const cor=[0,bw-1,(bh-1)*bw,(bh-1)*bw+bw-1].map(p=>p*4);',
  '  const flat=cor.every(q=>d[q+3]>=250)',
  '    && cor.every(q=>Math.abs(d[q]-d[cor[0]])<=SHAPE_GROUND_TOL',
  '      && Math.abs(d[q+1]-d[cor[0]+1])<=SHAPE_GROUND_TOL',
  '      && Math.abs(d[q+2]-d[cor[0]+2])<=SHAPE_GROUND_TOL);',
  '  let ground=false;',
  '  if(flat&&n){',
  '    const keep=new Uint8Array(N); let m=0;',
  '    for(let i=0;i<N;i++){',
  '      if(!mask[i]) continue;',
  '      const q=i*4;',
  '      const same=d[q+3]>=250',
  '        && Math.abs(d[q]-d[cor[0]])<=SHAPE_GROUND_TOL',
  '        && Math.abs(d[q+1]-d[cor[0]+1])<=SHAPE_GROUND_TOL',
  '        && Math.abs(d[q+2]-d[cor[0]+2])<=SHAPE_GROUND_TOL;',
  '      if(!same){ keep[i]=1; m++; }',
  '    }',
  '    if(m){ mask=keep; n=m; ground=true; }',
  '  }',
  '  /* AND THE AREA THE LINES ENCLOSE, seeded from the four CORNERS: anything a',
  '     corner cannot reach is inside. A border flood walks straight into the',
  '     chest of any character whose shoulders run off the bottom of the picture. */',
  '  const box=$("seshapefill");',
  '  const inside=!box||box.checked;',
  '  if(inside&&n){',
  '    mask=seFillInside(mask,bw,bh);',
  '    n=0; for(let i=0;i<N;i++) if(mask[i]) n++;',
  '  }',
  '  /* NOW IT IS SOLID, SO NOW IT CAN BE SCALED. Through paintTrait, exactly as',
  '     the pixels were before, so where the shape lands on the canvas is',
  '     unchanged and still agrees with where the base sits behind the art. A',
  '     solid region survives nearest-neighbour - its edge moves by at most a',
  '     pixel - which is the whole reason the thinking happens first. */',
  '  const mc=document.createElement("canvas"); mc.width=bw; mc.height=bh;',
  '  const mg=mc.getContext("2d",{willReadFrequently:true});',
  '  const mi=mg.createImageData(bw,bh);',
  '  for(let i=0;i<N;i++) if(mask[i]){ mi.data[i*4+3]=255; }',
  '  mg.putImageData(mi,0,0);',
  '  const oc=document.createElement("canvas"); oc.width=W; oc.height=H;',
  '  const og=oc.getContext("2d",{willReadFrequently:true});',
  '  og.imageSmoothingEnabled=false;',
  '  paintTrait(og,mc,0,0,W,H);',
  '  const od=og.getImageData(0,0,W,H).data;',
  '  /* Handed back rather than left at the size of the art. */',
  '  mc.width=1; mc.height=1; oc.width=1; oc.height=1;',
  '  const region=new Uint8Array(W*H);',
  '  let out=0;',
  '  for(let i=0;i<W*H;i++) if(od[i*4+3]>0){ region[i]=1; out++; }',
  '  return {region,n:out,ground};',
]);

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const sr = kit.inFunction(codeLines, 'async function seShapeRegion(rec){');
  const srb = codeLines.slice(sr.start, sr.end + 1).join('\n');

  /* THE THINKING HAPPENS AT THE SOURCE SIZE. This is the whole patch: a 1px
     outline does not survive being downscaled, so nothing that depends on the
     outline being closed may run after the scale. */
  if (!/const bw=Math\.max\(1,bm\.width\|0\), bh=Math\.max\(1,bm\.height\|0\);/.test(srb))
    throw new Error('the source is not read at its own size');
  if (!/mask=seFillInside\(mask,bw,bh\);/.test(srb))
    throw new Error('the inside is filled after the scale, where the outline is already broken');
  if (!/const cor=\[0,bw-1,\(bh-1\)\*bw,\(bh-1\)\*bw\+bw-1\]\.map\(p=>p\*4\);/.test(srb))
    throw new Error('the ground is read from the corners of the canvas rather than of the source');
  /* AND NOTHING READS THE CANVAS-SIZED PIXELS BEFORE THE MASK IS SOLID. The
     order is what this fixes, so the order is what is checked. */
  const at = (s) => srb.indexOf(s);
  if (!(at('mask=seFillInside(mask,bw,bh);') < at('paintTrait(og,mc,0,0,W,H);')))
    throw new Error('the fill still runs after the scale');
  if (!(at('if(m){ mask=keep; n=m; ground=true; }') < at('paintTrait(og,mc,0,0,W,H);')))
    throw new Error('the ground is still dropped after the scale');

  /* PLACED BY THE SAME RULE. Where the shape lands must not have moved. */
  if (!/paintTrait\(og,mc,0,0,W,H\);/.test(srb))
    throw new Error('the mask is placed by some rule other than the one the character uses');
  if (!/const region=new Uint8Array\(W\*H\);/.test(srb))
    throw new Error('the mask handed back is not the size of the canvas it has to fit');

  /* THE ALPHA RULE IS UNCHANGED, and it now runs on the source. */
  if (!/for\(let i=0;i<N;i\+\+\) if\(d\[i\*4\+3\]>0\)\{ mask\[i\]=1; n\+\+; \}/.test(srb))
    throw new Error('the ink test changed, so a soft edge is no longer in the shape');
  /* AND THE COUNT IS OF WHAT WAS SELECTED, not of what was thought about: at a
     different size those are different numbers, and the refusal and the message
     both read it. */
  if (!/return \{region,n:out,ground\};/.test(srb))
    throw new Error('the count is the source count rather than the count on the canvas');
  if (!/for\(let i=0;i<W\*H;i\+\+\) if\(od\[i\*4\+3\]>0\)\{ region\[i\]=1; out\+\+; \}/.test(srb))
    throw new Error('the region and its count do not come from the same pass');

  /* EVERY FULL-SIZE SCRATCH IS HANDED BACK. Three of them now, and one can be a
     1280 square. */
  if ((srb.match(/\.width=1; [a-z]{2}\.height=1;/g) || []).length < 2)
    throw new Error('a full-size scratch canvas is left behind');
  if (!/mc\.width=1; mc\.height=1; oc\.width=1; oc\.height=1;/.test(srb))
    throw new Error('the mask and output scratches are not handed back');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
