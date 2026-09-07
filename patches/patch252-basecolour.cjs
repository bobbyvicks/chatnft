/* HIDE THE BASE A TRAIT WAS DRAWN ON.

   The complaint: "when im cropping now the image i send isnt always perfect
   and i always have to cut out the green and pink (its what i usually use as
   a base)".

   MEASURED FIRST, because every number below came out of the real files and
   two of them contradicted what the code already assumed.

   1. THE BASE IS NOT THE PAIR THIS FILE PRODUCES. keyCharacter draws
      #00FF00 and #3CFFB4. The renders on disk - sixteen of them, named
      "... - pink base.png" - are #00FF00-ish green with a deep pink around
      #E6037C. So nothing can key off KEY_FILL and KEY_INK; the base has to be
      found in the picture.

   2. THE BASE IS A CLOUD, NOT A COLOUR. One render holds 36,070 distinct
      colours and its commonest single shade is 4.7% of the picture, while the
      base covers 63%. That is the whole reason cutting it out by hand is
      slow: an eyedropper takes one shade out of several thousand. Within
      radius 12 of its centre the pink reaches 63.5%; going all the way out to
      radius 24 adds 0.4. So the cloud is tight and complete by 12.

   3. INSIDE ONE RENDER THERE IS AN ENORMOUS GAP. The nearest colour of any
      substance lying beyond radius 12 of the base centre is 261 away at
      worst over the sixteen - usually black, or the other base colour. So a
      tolerance anywhere from 12 to about 100 takes the base out and touches
      nothing else.

   4. BUT A FIXED WIDE TOLERANCE IS STILL WRONG, and this is the measurement
      that shaped the code. Across the 264 approved traits, the nearest colour
      to that same base pink is 6.8 away - #EC007D on 1984 pixels of
      backgrounds/Casino Floor.png. That trait is not drawn on a base, and a
      tool that removed "anything pink" would gut it. The tolerance is
      therefore derived from each picture: 40% of the way to the nearest real
      colour, floored at the cloud's own width and capped at 60.

   AND WHETHER IT MAY FIRE BY ITSELF. A base render is two saturated balls
   covering nearly all of the picture. Measured over both populations:

        the sixteen renders         94.5% at the lowest
        the 264 approved traits     79.1% at the highest
                                    (hats/Coinbase Cap, blue on blue)

   Separated by 15.3 points, so 88 sits in the middle of a gap rather than on
   the edge of a guess, and opening a picture with a base on it clears it
   without being asked. Everything else keeps the button.

   THE FRINGE IS A SEPARATE PROBLEM AND IS WHY A BALL IS NOT ENOUGH. Between
   base pink and a black outline every intermediate colour is a real pixel,
   and the ones in the middle are 130 from either end - outside any safe ball,
   and exactly the halo that gets cut by hand. So after the balls are taken
   out, the edge is peeled: a pixel that still touches a hole and sits nearer
   a base colour than to anything the artwork actually uses is part of the
   base's edge, not the trait's. Three passes, which is what the blend is
   wide. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS, all of them, before anything is written ------------- */

/* The helpers this leans on exist and are the ones meant. */
for (const sig of ['function palette(d,n,tol,cap){', 'function snapshot(){',
  'function cleanLabel(){', 'function repalette(){']) {
  kit.only(L, l => l === sig, 'the helper ' + sig.slice(9, 30));
}

/* Where the JS goes: straight after cleanColours, with the other operations
   that rewrite the whole canvas. Found by the toast that closes it, which is
   unique, rather than by a brace. */
const cleanEnd = kit.only(L,
  l => l === '  toast(pl.before.toLocaleString()+" colours down to "+pl.after);',
  'the last line of cleanColours');
if (L[cleanEnd + 1] !== '}') throw new Error('cleanColours does not close where expected');

/* Where the button goes: the Edges and holes section, under Clear
   background, which is the neighbouring idea. */
const bgtolLine = kit.only(L,
  l => l.indexOf('          aria-label="Background tolerance"></div>') === 0,
  'the background tolerance row');

/* Where the label is refreshed on open. */
const labelOnOpen = kit.only(L, l => l === '  cleanLabel();', 'cleanLabel in startEditor');

/* ---- WRITE ------------------------------------------------------- */

const JS = `
/* ---------- the base a trait was drawn on ------------------------ */
/* A trait is drawn on top of a flat two-colour character and then cropped
   out of the render, so whatever the crop did not catch arrives as base.
   Taking it out by hand is the slowest part of making one, and it is slow for
   a reason worth writing down: the base is not a colour but a CLOUD. One real
   render holds 36,070 distinct colours; its commonest single shade is 4.7% of
   the picture while the base covers 63%. An eyedropper removes one shade of
   several thousand, which is why this has to work on a ball in colour space
   rather than on a value.

   Measured on the sixteen "pink base" renders on disk: within radius 12 of
   its centre the base reaches 63.5% of the picture, and radius 24 reaches
   63.9 - so the cloud is complete by 12 and nothing is gained by opening it
   wider. The base is found in the PICTURE rather than assumed, because the
   real renders are green and pink and this file's own keyCharacter draws
   green and mint - a tool keyed to KEY_FILL would have missed every one. */
const BASE_BALL=12;    /* the cloud around one base colour, measured */
const BASE_SAT=120;    /* chroma; no skin, metal or shadow reaches this */
const BASE_APART=60;   /* two base colours, not two shades of one */
const BASE_COVER=88;   /* percent of the picture a real base pair covers */
const BASE_REACH=60;   /* the widest a derived tolerance may open */
const BASE_PEEL=3;     /* passes of the blended edge between base and art */
const chroma=(r,g,b)=>Math.max(r,g,b)-Math.min(r,g,b);
/* WHAT THE BASE IS, HOW SURE, AND HOW WIDE TO CUT - all read off the canvas
   and none of it applied. Separated from the button so the answer can be put
   ON the button before anybody commits to changing the artwork, the way
   cleanLabel already does for the palette. */
function basePlan(){
  if(!ctx) return null;
  const W=art.width, H=art.height, n=W*H;
  const im=ctx.getImageData(0,0,W,H), d=im.data;
  /* tol 8 rather than 1: the cloud has to arrive as one entry, or its
     commonest shade competes with its own neighbours for a place in the list
     and the base looks like forty small colours instead of one big one. */
  const pal=palette(d,n,8,64).list;
  if(!pal.length) return null;
  let opaque=0;
  for(let p=0;p<n;p++) if(d[p*4+3]>=128) opaque++;
  if(!opaque) return null;
  /* The candidates: saturated, and far enough apart to be different colours
     rather than two shades of the same one. */
  const balls=[];
  for(const q of pal){
    if(chroma(q.r,q.g,q.b)<BASE_SAT) continue;
    if(balls.some(b=>(b.r-q.r)**2+(b.g-q.g)**2+(b.b-q.b)**2<=BASE_APART*BASE_APART) ) continue;
    let hit=0;
    for(const c of pal){
      if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2<=BASE_BALL*BASE_BALL) hit+=c.n;
    }
    balls.push({r:q.r,g:q.g,b:q.b,n:hit});
    if(balls.length>=4) break;
  }
  if(!balls.length) return null;
  balls.sort((a,b)=>b.n-a.n);
  const list=balls.slice(0,2);
  const cover=list.reduce((a,b)=>a+b.n,0)/opaque*100;
  /* HOW FAR THE NEAREST REAL COLOUR IS. This is what sets the tolerance, and
     it is measured per picture rather than fixed, because a fixed one cannot
     be both wide enough for these renders and safe on a trait that is
     genuinely pink. Across the 264 approved traits the nearest colour to this
     base pink is 6.8 away - Casino Floor's #EC007D, on 1984 pixels - so a
     tool that took out "anything pink" would gut a real background. */
  let gap=Infinity;
  for(const c of pal){
    if(c.n<opaque*0.002) continue;   /* an edge blend is not a colour in use */
    let near=Infinity;
    for(const q of list){
      const dd=Math.sqrt((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2);
      if(dd<near) near=dd;
    }
    if(near>BASE_BALL && near<gap) gap=near;
  }
  const tol=Math.min(BASE_REACH, Math.max(BASE_BALL, (gap===Infinity?BASE_REACH*2.5:gap)*0.4));
  return {im,d,n,W,H,opaque,list,cover,gap,tol,pal};
}
/* Every pixel wearing the base goes, and then the edge it blended into.

   The ball alone is not enough and the reason is arithmetic: between base
   pink and a black outline every intermediate colour is a real pixel, and the
   ones in the middle sit about 130 from either end - far outside any
   tolerance that is safe to apply, and exactly the halo that gets cut by
   hand. So the artwork's own colours are collected first, from pixels well
   clear of the base, and then any pixel that still touches a hole and is
   nearer the base than to anything the artwork uses is peeled. */
function hideBase(){
  const pl=basePlan();
  if(!pl) return null;
  const {d,n,W,H,list,tol}=pl;
  const t2=tol*tol;
  const isBase=(i)=>{
    for(const q of list){
      const dr=d[i]-q.r, dg=d[i+1]-q.g, db=d[i+2]-q.b;
      if(dr*dr+dg*dg+db*db<=t2) return true;
    }
    return false;
  };
  let gone=0;
  for(let p=0;p<n;p++){
    const i=p*4;
    if(d[i+3]<128) continue;
    if(isBase(i)){ d[i+3]=0; gone++; }
  }
  /* What the trait is actually made of, taken from what survived and from
     well clear of the base, so the peel below has something true to compare
     against rather than the blend it is trying to remove. */
  const keep=[];
  {
    const c=new Map();
    for(let p=0;p<n;p++){
      const i=p*4;
      if(d[i+3]<128) continue;
      let near=Infinity;
      for(const q of list){
        const dd=(d[i]-q.r)**2+(d[i+1]-q.g)**2+(d[i+2]-q.b)**2;
        if(dd<near) near=dd;
      }
      if(Math.sqrt(near)<tol*2) continue;
      const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
      c.set(k,(c.get(k)||0)+1);
    }
    for(const [k,v] of c) if(v>=8) keep.push({r:(k>>16)&255,g:(k>>8)&255,b:k&255});
  }
  /* Nothing survived far enough from the base to say what the trait is, so
     there is no honest comparison to peel against and it stops here. */
  let peeled=0;
  if(keep.length){
    for(let pass=0;pass<BASE_PEEL;pass++){
      const doomed=[];
      for(let p=0;p<n;p++){
        const i=p*4;
        if(d[i+3]<128) continue;
        const x=p%W, y=(p/W)|0;
        const edge=(x>0&&d[(p-1)*4+3]<128)||(x<W-1&&d[(p+1)*4+3]<128)
          ||(y>0&&d[(p-W)*4+3]<128)||(y<H-1&&d[(p+W)*4+3]<128);
        if(!edge) continue;
        let db2=Infinity;
        for(const q of list){
          const dd=(d[i]-q.r)**2+(d[i+1]-q.g)**2+(d[i+2]-q.b)**2;
          if(dd<db2) db2=dd;
        }
        let da2=Infinity;
        for(const q of keep){
          const dd=(d[i]-q.r)**2+(d[i+1]-q.g)**2+(d[i+2]-q.b)**2;
          if(dd<da2) da2=dd;
        }
        if(db2<da2) doomed.push(p);
      }
      if(!doomed.length) break;
      for(const p of doomed){ d[p*4+3]=0; peeled++; }
    }
  }
  return {plan:pl, gone, peeled};
}
/* The button says what it found before it is pressed, so the size of what is
   about to happen is visible rather than promised. */
function baseLabel(){
  const b=$("hidebase"); if(!b) return;
  const pl=basePlan();
  if(!pl){ b.textContent="Hide the base colour"; b.disabled=true; return; }
  b.disabled=false;
  const names=pl.list.map(q=>hex(q.r,q.g,q.b)).join(" + ");
  b.textContent="Hide the base colour ("+names+", "+Math.round(pl.cover)+"%)";
}
function hideBaseClicked(){
  const pl=basePlan();
  if(!pl){ toast("No flat base colour here"); return; }
  const redoWas=redoStack.slice(), dropped=snapshot();
  const r=hideBase();
  if(!r || !(r.gone+r.peeled)){
    dropSnapshot(redoWas,dropped);
    toast("Nothing here matches a base colour");
    return;
  }
  ctx.putImageData(r.plan.im,0,0);
  refreshStats(); repalette(); cleanLabel(); baseLabel();
  toast("Hid "+(r.gone+r.peeled).toLocaleString()+" base pixels"
    +(r.peeled?" ("+r.peeled.toLocaleString()+" of them the blended edge)":""));
}`.split('\n');

/* MARKUP FIRST, THEN THE SCRIPT, AND EVERY ANCHOR RE-FOUND RATHER THAN
   OFFSET. The first attempt added the script's line count to the markup
   anchor - but the markup sits ABOVE the script, so it does not move when the
   script grows, and the button was spliced into the middle of a function.
   patchkit refused to write it, which is what it is for. An offset is a
   second copy of the file's shape, kept by hand; re-finding is not. */

/* The button, next to Clear background, which is the neighbouring idea. */
kit.replace(L, { start: bgtolLine, end: bgtolLine }, [
  '          aria-label="Background tolerance"></div>',
  '      <!-- Clear background floods in from the border, so it cannot reach',
  '           base showing THROUGH a trait - between the teeth of a grin, say.',
  '           This goes by colour instead and reaches both. -->',
  '      <button class="btn ghost" id="hidebase" disabled',
  '        title="Finds the flat colours the character underneath was drawn in and takes them out, including the blended edge around them">Hide the base colour</button>',
]);

/* Re-found, because the markup above moved everything below it. */
const cleanEndNow = kit.only(L,
  l => l === '  toast(pl.before.toLocaleString()+" colours down to "+pl.after);',
  'the last line of cleanColours, after the markup insert');
if (L[cleanEndNow + 1] !== '}') throw new Error('cleanColours does not close where expected');
kit.replace(L, { start: cleanEndNow + 1, end: cleanEndNow + 1 }, ['}'].concat(JS));

/* Refreshed wherever the palette label is, so the two never disagree about
   what is on the canvas. */
const openNow = kit.only(L, l => l === '  cleanLabel();', 'cleanLabel in startEditor');
kit.replace(L, { start: openNow, end: openNow }, [
  '  cleanLabel();',
  '  /* A picture whose base pair covers nearly all of it is a render, not a',
  '     trait, and clearing it is the whole point of the feature. Measured over',
  '     both populations before this was allowed to happen by itself: the',
  '     sixteen real renders reach 94.5% at the lowest, the 264 approved traits',
  '     79.1% at the highest, so 88 sits in a 15-point gap rather than on the',
  '     edge of a guess. Undoable, and it says so. */',
  '  baseLabel();',
  '  const bp=basePlan();',
  '  if(bp && bp.list.length>=2 && bp.cover>=BASE_COVER){',
  '    snapshot();',
  '    const r=hideBase();',
  '    if(r && (r.gone+r.peeled)){',
  '      ctx.putImageData(r.plan.im,0,0);',
  '      refreshStats(); repalette(); cleanLabel(); baseLabel();',
  '      toast("Hid the base - "+(r.gone+r.peeled).toLocaleString()+" pixels. Undo brings it back.");',
  '    } else undoStack.pop();',
  '  }',
]);

const grew = kit.save(doc, ({ text, lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('function basePlan(){') !== 1) throw new Error('basePlan did not land');
  if (has('function hideBase(){') !== 1) throw new Error('hideBase did not land');
  if (has('function baseLabel(){') !== 1) throw new Error('baseLabel did not land');
  if (has('function hideBaseClicked(){') !== 1) throw new Error('hideBaseClicked did not land');
  /* The button exists exactly once and the id matches what baseLabel reads. */
  if ((text.match(/id="hidebase"/g) || []).length !== 1) throw new Error('the button is not there exactly once');
  /* The constants are CODE, not just described in the comment above them. */
  for (const c of ['const BASE_BALL=12;', 'const BASE_COVER=88;', 'const BASE_PEEL=3;'])
    if (code.indexOf(c) < 0) throw new Error('missing constant in code: ' + c);
  /* cleanColours still closes properly - the JS was spliced at its brace. */
  if (has('  toast(pl.before.toLocaleString()+" colours down to "+pl.after);') !== 1)
    throw new Error('cleanColours was disturbed');
});

console.log('index.html grew by ' + grew + ' bytes');
