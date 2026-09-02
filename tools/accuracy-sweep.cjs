/* Measures how accurate the extraction actually is, on scenes where every
 trait pixel is known exactly, and compares an ordinary character against a
 key-coloured one.

     node tools/accuracy-sweep.cjs

   Reports recall and precision at nine thresholds for four scenes. Prints
   numbers rather than passing or failing - it is for deciding, not gating.
   tools/extraction-check.cjs is the one that gates. */
/* How accurate is the extraction, and would a key-coloured character be better?
   Both answered on scenes where every trait pixel is known exactly, so recall
   and precision are counted rather than judged. The pipeline is carved out of
   index.html so this measures what ships. */
const fs=require('fs');
const HTML=fs.readFileSync(process.argv[2]||(__dirname+'/../index.html'),'utf8');
const SCRIPT=HTML.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
function carve(sig){
  const a=SCRIPT.indexOf(sig); if(a<0) throw new Error('cannot find '+sig);
  let i=SCRIPT.indexOf('{',a), d=0;
  for(; i<SCRIPT.length; i++){ if(SCRIPT[i]==='{') d++; else if(SCRIPT[i]==='}'){ d--; if(d===0) return SCRIPT.slice(a,i+1); } }
  throw new Error('unbalanced '+sig);
}
let NEEDED=['const lum =','const TRAIT_BLACK','const BASE_TOL','const BLEED_BLOB','const TRACE_EDGE','const TRACE_SHARE','function refEdges(','function palette(',
  'function maskOfImg(','function bodyDistance(','function fitTo(','function stripBackground(',
  'function alignToRef(','function reclaimOutline(','function bridgeOutline(','function dropBaseBleed(',
  'function defringe(','function hardenEdge(','function blackenEdge(','function openMask(',
  'function despeckle(','function extractTrait('];
let src='';
for(const sig of NEEDED){
  if(sig.startsWith('const ')){ const a=SCRIPT.indexOf(sig); src+=SCRIPT.slice(a,SCRIPT.indexOf(';',a)+1)+'\n'; }
  else src+=carve(sig)+'\n';
}
class ImageData{ constructor(w,h){ this.width=w; this.height=h; this.data=new Uint8ClampedArray(w*h*4); } }
const API=new Function('ImageData', src+'\nreturn {extractTrait};')(ImageData);

const W=200,H=200;
const put=(d,x,y,c)=>{ if(x<0||y<0||x>=W||y>=H) return; const i=(y*W+x)*4;
  d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255; };

/* A scene is: a character drawn in `skin` with an outline in `ink`, and a trait
   of black-framed dark glasses whose arm crosses that outline. The only thing
   that changes between the two scenes is what the character is made of. */
function scene(skin, ink, aa){
  const S=aa?3:1, BW=W*S, BH=H*S;
  const big=()=>{ const d=new Uint8ClampedArray(BW*BH*4);
    for(let p=0;p<BW*BH;p++){ d[p*4]=255;d[p*4+1]=255;d[p*4+2]=255;d[p*4+3]=255; } return d; };
  const bput=(d,x,y,c)=>{ if(x<0||y<0||x>=BW||y>=BH) return; const i=(y*BW+x)*4;
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255; };
  const R=big(), cx=100*S, cy=95*S, r=58*S;
  for(let y=0;y<BH;y++) for(let x=0;x<BW;x++){
    const dd=Math.hypot(x-cx,y-cy);
    if(dd<=r-2*S) bput(R,x,y,skin); else if(dd<=r) bput(R,x,y,ink);
  }
  const Sd=new Uint8ClampedArray(R), tag=new Set();
  const brect=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    bput(Sd,x,y,c); tag.add(y*BW+x); } };
  const BLACK=[8,8,8], LENS=[64,74,73], HI=[114,126,126];
  for(const x0 of [64*S,108*S]){
    brect(x0,80*S,x0+30*S,104*S,BLACK);
    brect(x0+3*S,83*S,x0+27*S,101*S,LENS);
    brect(x0+5*S,85*S,x0+9*S,95*S,HI);
  }
  brect(94*S,88*S,108*S,93*S,BLACK);
  brect(28*S,86*S,64*S,91*S,BLACK);      /* the arm, across the outline */
  const down=d=>{ if(S===1) return d.slice();
    const o=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let r2=0,g2=0,b2=0;
      for(let j=0;j<S;j++) for(let i2=0;i2<S;i2++){ const q=((y*S+j)*BW+(x*S+i2))*4;
        r2+=d[q]; g2+=d[q+1]; b2+=d[q+2]; }
      const n=S*S, o2=(y*W+x)*4; o[o2]=r2/n; o[o2+1]=g2/n; o[o2+2]=b2/n; o[o2+3]=255; }
    return o; };
  const truth=new Set();
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    let c=0; for(let j=0;j<S;j++) for(let i2=0;i2<S;i2++) if(tag.has((y*S+j)*BW+(x*S+i2))) c++;
    if(c>S*S/2) truth.add(y*W+x);
  }
  const ref=new ImageData(W,H); ref.data.set(down(R));
  const sub=new ImageData(W,H); sub.data.set(down(Sd));
  return {ref,sub,truth};
}

function score(res,truth){
  let hit=0,kept=0,wrong=0;
  for(let p=0;p<W*H;p++){
    const on=res.data[p*4+3]>127;
    if(on) kept++;
    if(truth.has(p)){ if(on) hit++; }
    else if(on) wrong++;
  }
  const recall=hit/truth.size*100, precision=hit/Math.max(1,kept)*100;
  return { recall:+recall.toFixed(2), precision:+precision.toFixed(2),
    f1:+(2*recall*precision/Math.max(0.0001,recall+precision)).toFixed(2),
    missed:truth.size-hit, extra:wrong };
}
const OPTS=t=>({ thresh:t, align:false, band:[0,1], strip:true, haloTol:150, haloPasses:6,
  reclaim:true, darkMax:110, reclaimPasses:40, maxOutline:6, bridgeReach:6,
  defringe:true, fringeThresh:t*2.1, fringePasses:4, neutralMax:18,
  edgeLum:110, edgeStep:25, hardPasses:6,
  open:true, openR:3, minRemove:150, despeckle:true, minBlob:48, relative:0.02 });

const SKIN=[233,168,133], INK=[0,0,0];
const KEY_SKIN=[0,255,0], KEY_INK=[255,0,255];   /* chroma green and magenta */

const scenes=[
  ['ordinary character, hard edges',      scene(SKIN,INK,false)],
  ['ordinary character, anti-aliased',    scene(SKIN,INK,true)],
  ['KEY-COLOURED character, hard edges',  scene(KEY_SKIN,KEY_INK,false)],
  ['KEY-COLOURED character, anti-aliased',scene(KEY_SKIN,KEY_INK,true)],
];

for(const [label,sc] of scenes){
  const rows=[];
  for(const t of [10,20,30,40,60,90,120,160,200]){
    rows.push(Object.assign({threshold:t}, score(API.extractTrait(sc.sub,sc.ref,OPTS(t)), sc.truth)));
  }
  console.log('\n=== '+label+'  ('+sc.truth.size+' trait pixels) ===');
  console.table(rows);
  const best=rows.slice().sort((a,b)=>b.f1-a.f1)[0];
  const dflt=rows.find(r=>r.threshold===40);
  console.log('  at the default 40 : recall '+dflt.recall+'%  precision '+dflt.precision+'%  ('
    +dflt.missed+' missed, '+dflt.extra+' extra)');
  console.log('  best of the sweep : threshold '+best.threshold+'  recall '+best.recall
    +'%  precision '+best.precision+'%');
}
