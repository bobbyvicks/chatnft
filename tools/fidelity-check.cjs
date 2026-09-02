/* Does a trait come out of this app blurrier than it went in?

   Three different questions get confused under the word "blurry", so they are
   measured separately:

     1. does extraction ADD softness to a crisp submission?
     2. does it PRESERVE softness that was already in the submission?
     3. does the app end up editing and saving at the resolution the art was
        actually drawn at, or at whatever resolution the file happened to be?

   A trait drawn on an 83-cell grid and exported at 1024px has cells 12.34px
   wide. If the app keeps all 1024 rows, every soft ramp the exporter produced
   survives as real pixels, one logical pixel becomes 152 canvas pixels, and the
   result is a soft picture of pixel art rather than pixel art.

   Everything is measured through the real pipeline carved out of index.html.

   Run: node tools/fidelity-check.cjs
*/
const fs=require('fs');
const path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const SCRIPT=HTML.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
function carve(sig){
  const a=SCRIPT.indexOf(sig); if(a<0) throw new Error('cannot find '+sig);
  let i=SCRIPT.indexOf('{',a), d=0;
  for(; i<SCRIPT.length; i++){ if(SCRIPT[i]==='{') d++; else if(SCRIPT[i]==='}'){ d--; if(d===0) return SCRIPT.slice(a,i+1); } }
  throw new Error('unbalanced '+sig);
}
const NEEDED=['const lum =','const TRAIT_BLACK','const BASE_TOL','const BLEED_BLOB',
  'const TRACE_EDGE','const TRACE_SHARE','function refEdges(','function palette(',
  'function maskOfImg(','function bodyDistance(','function fitTo(','function stripBackground(',
  'function alignToRef(','function reclaimOutline(','function bridgeOutline(','function dropBaseBleed(',
  'function defringe(','function hardenEdge(','function blackenEdge(','function openMask(',
  'function despeckle(','function extractTrait(',
  'function transitions(','function strength(','function period(','function recover('];
let src='';
for(const sig of NEEDED){
  if(sig.startsWith('const ')){ const a=SCRIPT.indexOf(sig); src+=SCRIPT.slice(a,SCRIPT.indexOf(';',a)+1)+'\n'; }
  else { try{ src+=carve(sig)+'\n'; }catch(e){ console.log('note: '+e.message+' (skipped)'); } }
}
class ImageData{ constructor(a,w,h){ if(typeof a==='number'){ this.width=a; this.height=w;
    this.data=new Uint8ClampedArray(a*w*4); } else { this.data=a; this.width=w; this.height=h; } } }
const API=new Function('ImageData', src+
  '\nreturn {extractTrait, recover:(typeof recover==="function"?recover:null),'+
  ' transitions:(typeof transitions==="function"?transitions:null),'+
  ' period:(typeof period==="function"?period:null), palette};')(ImageData);

const SENS=+(HTML.match(/id="sens"[^>]*value="([0-9]+)"/)||[])[1];
const MIN_BLOB=+(HTML.match(/id="minblob"[^>]*value="([0-9]+)"/)||[])[1];
const OPTS={ thresh:SENS, align:false, band:[0,1], strip:true, haloTol:150, haloPasses:6,
  reclaim:true, darkMax:110, reclaimPasses:40, maxOutline:6, bridgeReach:6,
  defringe:true, fringeThresh:SENS*2.1, fringePasses:4, neutralMax:18,
  edgeLum:110, edgeStep:25, hardPasses:6,
  open:true, openR:3, minRemove:150, despeckle:true, minBlob:MIN_BLOB, relative:0.02 };

/* ---------- the art, defined on the grid it was actually drawn on ---------- */
const CELLS=83;                 /* the collection's real grid */
const BASE_FILL=[0,255,255], BASE_INK=[0,255,0];
const T_FRAME=[8,8,8], T_LENS=[64,74,73], T_GLARE=[114,126,126];

/* One logical cell = one entry. This is the ground truth: the artwork has
   exactly these colours and exactly these hard edges, by construction. */
function logical(){
  const base=new Array(CELLS*CELLS).fill(null);
  const trait=new Array(CELLS*CELLS).fill(null);
  const cx=41, cy=40, r=25;
  for(let y=0;y<CELLS;y++) for(let x=0;x<CELLS;x++){
    const d=Math.hypot(x-cx,y-cy);
    if(d<=r-1) base[y*CELLS+x]=BASE_FILL; else if(d<=r) base[y*CELLS+x]=BASE_INK;
  }
  const put=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++)
    if(x>=0&&y>=0&&x<CELLS&&y<CELLS) trait[y*CELLS+x]=c; };
  for(const x0 of [24,46]){
    put(x0,33,x0+13,44,T_FRAME); put(x0+2,35,x0+11,42,T_LENS); put(x0+3,36,x0+5,39,T_GLARE);
  }
  put(38,37,46,39,T_FRAME);
  put(10,36,24,38,T_FRAME);            /* arm, crossing the character outline */
  return {base,trait};
}

/* Render the logical art at PX pixels. `soft` decides whether cell boundaries
   are hard (a careful nearest-neighbour export) or ramped (what an AI render or
   a smoothed export actually delivers). */
function render(cellsArr, PX, soft, bg){
  const d=new Uint8ClampedArray(PX*PX*4);
  const S=PX/CELLS;
  const at=(cx,cy)=>{ if(cx<0||cy<0||cx>=CELLS||cy>=CELLS) return null; return cellsArr[cy*CELLS+cx]; };
  for(let y=0;y<PX;y++) for(let x=0;x<PX;x++){
    const i=(y*PX+x)*4;
    let col;
    if(!soft){
      col=at(Math.floor(x/S),Math.floor(y/S))||bg;
    } else {
      /* bilinear across cell centres: the classic smooth upscale */
      const fx=x/S-0.5, fy=y/S-0.5;
      const x0=Math.floor(fx), y0=Math.floor(fy), tx=fx-x0, ty=fy-y0;
      const g=(cx,cy)=>at(cx,cy)||bg;
      const c00=g(x0,y0),c10=g(x0+1,y0),c01=g(x0,y0+1),c11=g(x0+1,y0+1);
      col=[0,1,2].map(k=>
        (c00[k]*(1-tx)+c10[k]*tx)*(1-ty) + (c01[k]*(1-tx)+c11[k]*tx)*ty);
    }
    d[i]=col[0]; d[i+1]=col[1]; d[i+2]=col[2]; d[i+3]=255;
  }
  return new ImageData(d,PX,PX);
}
function overlay(baseArr,traitArr){
  const o=baseArr.slice();
  for(let i=0;i<o.length;i++) if(traitArr[i]) o[i]=traitArr[i];
  return o;
}

/* ---------- what "blurry" means, in numbers ---------- */
function sharpness(im){
  const d=im.data, W=im.width, H=im.height;
  const seen=new Map();
  let soft=0, hard=0, opaque=0;
  const dist=(i,j)=>Math.hypot(d[i]-d[j],d[i+1]-d[j+1],d[i+2]-d[j+2]);
  for(let p=0;p<W*H;p++){
    const i=p*4; if(d[i+3]<128) continue;
    opaque++;
    const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
    seen.set(k,(seen.get(k)||0)+1);
    const x=p%W;
    if(x<W-1 && d[i+7]>=128){
      const s=dist(i,i+4);
      /* A ramp step: a real change, too small to be a colour boundary.
         The floor is 24, not 6. At 6 this counted the join between the forced
         pure-black outer border (0,0,0) and a near-black frame colour (8,8,8),
         a step of 13.9, as if it were blur - and then reported 46% "soft steps"
         on an input measured at 0%, which reads exactly like the app blurring
         crisp art. It is not blur, it is the border rule, and the number was
         answering a different question than its name. Colour count and the
         share of flat cells are the honest measures here; this one is kept
         only because it separates a smooth export from a crisp one. */
      if(s>24 && s<70) soft++; else if(s>=70) hard++;
    }
  }
  /* how many colours carry 99% of the picture, versus how many exist at all */
  const counts=[...seen.values()].sort((a,b)=>b-a);
  let acc=0, core=0;
  for(const c of counts){ acc+=c; core++; if(acc>=opaque*0.99) break; }
  return { opaque:opaque, colours:seen.size, coreColours:core,
    softSteps:soft, hardSteps:hard,
    softShare:+(soft/Math.max(1,soft+hard)*100).toFixed(1) };
}
/* Of the cells the art is really drawn on, how many are a single flat colour? */
function cleanCells(im, cells){
  const d=im.data, W=im.width, S=W/cells;
  let flat=0, total=0;
  for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){
    const x0=Math.floor(cx*S), x1=Math.max(x0,Math.ceil((cx+1)*S)-1);
    const y0=Math.floor(cy*S), y1=Math.max(y0,Math.ceil((cy+1)*S)-1);
    let first=null, uniform=true, any=false;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      const i=(y*W+x)*4; if(d[i+3]<128) continue;
      any=true; const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
      if(first===null) first=k; else if(k!==first) uniform=false;
    }
    if(!any) continue;
    total++; if(uniform) flat++;
  }
  return { cells:total, flat:flat, flatPct:+(flat/Math.max(1,total)*100).toFixed(1) };
}

const L=logical();
const rows=[];
function run(label, PX, soft){
  const ref=render(L.base,PX,soft,[255,255,255]);
  const sub=render(overlay(L.base,L.trait),PX,soft,[255,255,255]);
  const inn=sharpness(sub);
  const r=API.extractTrait(sub,ref,OPTS);
  const out=sharpness(new ImageData(r.data,r.W,r.H));
  const cellsOut=cleanCells(new ImageData(r.data,r.W,r.H),CELLS);
  rows.push({ scenario:label, px:PX+'x'+PX,
    inColours:inn.colours, outColours:out.colours,
    inSoftPct:inn.softShare, outSoftPct:out.softShare,
    outEditedAt:r.W+'x'+r.H, cellsFlatPct:cellsOut.flatPct, kept:r.kept });
  return {r, sub, ref};
}

console.log('The artwork is '+CELLS+'x'+CELLS+' logical cells with 5 colours, by construction.');
console.log('extraction threshold '+SENS+', minBlob '+MIN_BLOB+'\n');

run('crisp export, exact multiple',   CELLS*6, false);   /* 498, cell = 6.00px */
run('crisp export, awkward size',     1024,    false);   /* cell = 12.337px   */
const softCase=run('SMOOTH export (what a render actually sends)', 1024, true);

console.table(rows);

/* ---------- would putting it back on the grid fix it? ---------- */
if(API.recover){
  const r=softCase.r;
  const rebuilt=API.recover(r.data, r.W, r.H, CELLS);
  const after=sharpness(new ImageData(rebuilt,CELLS,CELLS));
  const before=sharpness(new ImageData(r.data,r.W,r.H));
  console.log('\nthe smooth 1024 case, before and after recover() onto '+CELLS+' cells:');
  console.table([
    { state:'as the editor opens it', size:r.W+'x'+r.H, colours:before.colours,
      coreColours:before.coreColours, softStepsPct:before.softShare },
    { state:'rebuilt on the real grid', size:CELLS+'x'+CELLS, colours:after.colours,
      coreColours:after.coreColours, softStepsPct:after.softShare },
  ]);
} else {
  console.log('\nrecover() could not be carved out, so the rebuild comparison was skipped.');
}

/* ---------- does the app even know the grid is there? ---------- */
if(API.transitions && API.period){
  const sub=render(overlay(L.base,L.trait),1024,true,[255,255,255]);
  const t=API.transitions(sub.data,1024,1024);
  const px=API.period(t.x.p,t.x.q,1024);
  console.log('\nwhat analyse() would measure on that smooth 1024 submission:');
  console.log('  block size  '+(px?px.B.toFixed(3)+' px  (true value '+(1024/CELLS).toFixed(3)+')':'not detected'));
  console.log('  confidence  '+(px?(px.R*100).toFixed(0)+'%':'-'));
  console.log('  implied grid '+(px?Math.round(1024/px.B)+' cells  (true value '+CELLS+')':'-'));
  console.log('  -> the measurement exists and works; the extract route just never runs it.');
}

/* ---------- controls ---------- */
console.log('\ncontrols:');
const ref0=render(L.base,498,false,[255,255,255]);
const same=API.extractTrait(ref0,ref0,OPTS);
console.log('  identical images extract '+same.kept+' pixels (must be 0)');
const crisp=sharpness(render(overlay(L.base,L.trait),498,false,[255,255,255]));
const smooth=sharpness(render(overlay(L.base,L.trait),1024,true,[255,255,255]));
console.log('  a crisp render has '+crisp.colours+' colours and '+crisp.softShare+'% soft steps');
console.log('  a smooth render has '+smooth.colours+' colours and '+smooth.softShare+'% soft steps');
let bad=0;
if(same.kept!==0){ console.log('  FAIL identical images produced pixels'); bad=1; }
if(!(smooth.colours>crisp.colours*10)){
  console.log('  FAIL the smooth render is not measurably softer than the crisp one, so this cannot tell them apart'); bad=1; }
if(!bad) console.log('  both controls pass: nothing from nothing, and the two renders are distinguishable');
process.exit(bad);
