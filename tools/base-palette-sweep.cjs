/* Which colours should the base model be made of?

   Answered by measurement, not taste. A candidate palette is a (fill, ink)
   pair. For each one this builds scenes where every trait pixel is known
   exactly, runs the REAL pipeline carved out of index.html, and counts:

     recall     - trait pixels the extraction kept
     precision  - kept pixels that are actually trait
     leak       - kept pixels close enough to a base colour to be base bleed,
                  which is the thing the collection must never ship
     pieces     - connected components; a trait cut in half scores 2

   Run with no arguments to sweep the built-in candidates, or pass
   --palette "#RRGGBB,#RRGGBB[,label]" (repeatable) to measure your own.

   The instrument has to be able to say NO, so a deliberately terrible
   palette is always measured alongside and asserted to score worse. */
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
  'function despeckle(','function extractTrait('];
let src='';
for(const sig of NEEDED){
  if(sig.startsWith('const ')){ const a=SCRIPT.indexOf(sig); src+=SCRIPT.slice(a,SCRIPT.indexOf(';',a)+1)+'\n'; }
  else src+=carve(sig)+'\n';
}
class ImageData{ constructor(w,h){ this.width=w; this.height=h; this.data=new Uint8ClampedArray(w*h*4); } }
const API=new Function('ImageData', src+'\nreturn {extractTrait, lum, BASE_TOL};')(ImageData);
const LUM=API.lum, BASE_TOL=API.BASE_TOL;

/* The thresholds the shipping page uses, read out of it rather than retyped. */
const READ=n=>{ const m=SCRIPT.match(new RegExp(n+'\\s*:\\s*([0-9]+)')); if(!m) throw new Error('cannot read '+n); return +m[1]; };
const DARK_MAX=READ('darkMax'), EDGE_LUM=READ('edgeLum'), NEUTRAL_MAX=READ('neutralMax');
const SENS=+(HTML.match(/id="sens"[^>]*value="([0-9]+)"/)||[])[1];
const CLEAN_TOL=+(SCRIPT.match(/const CLEAN_TOL=([0-9]+)/)||[])[1];

const hex=h=>{ const s=h.replace('#','').trim();
  return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]; };
const hx=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const sat=c=>Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]);

const W=200,H=200;

/* Traits an artist would really submit. A base palette that scores well on one
   trait and collides with the next has not solved anything, so every palette is
   measured against all of them and reported on its WORST. */
const TRAITS=[
  {name:'black-framed glasses', parts:[['frame',[8,8,8]],['lens',[64,74,73]],['glare',[114,126,126]]]},
  {name:'brown hair',           parts:[['frame',[8,8,8]],['lens',[92,58,32]],['glare',[140,96,58]]]},
  {name:'red cap',              parts:[['frame',[8,8,8]],['lens',[176,32,38]],['glare',[224,86,86]]]},
  {name:'grey headphones',      parts:[['frame',[8,8,8]],['lens',[128,128,128]],['glare',[196,196,196]]]},
  {name:'gold chain',           parts:[['frame',[8,8,8]],['lens',[198,160,52]],['glare',[248,224,140]]]},
];

/* A character in the candidate palette, with a trait drawn over it whose arm
   crosses the character's own outline - the case that used to lose the arm. */
function scene(fill, ink, trait, aa){
  const S=aa?3:1, BW=W*S, BH=H*S;
  const blank=()=>{ const d=new Uint8ClampedArray(BW*BH*4);
    for(let p=0;p<BW*BH;p++){ d[p*4]=255;d[p*4+1]=255;d[p*4+2]=255;d[p*4+3]=255; } return d; };
  const bput=(d,x,y,c)=>{ if(x<0||y<0||x>=BW||y>=BH) return; const i=(y*BW+x)*4;
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255; };
  const R=blank(), cx=100*S, cy=95*S, r=58*S;
  for(let y=0;y<BH;y++) for(let x=0;x<BW;x++){
    const dd=Math.hypot(x-cx,y-cy);
    if(dd<=r-2*S) bput(R,x,y,fill); else if(dd<=r) bput(R,x,y,ink);
  }
  const Sd=new Uint8ClampedArray(R), tag=new Set();
  const brect=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    bput(Sd,x,y,c); tag.add(y*BW+x); } };
  const P={}; for(const [k,v] of trait.parts) P[k]=v;
  for(const x0 of [64*S,108*S]){
    brect(x0,80*S,x0+30*S,104*S,P.frame);
    brect(x0+3*S,83*S,x0+27*S,101*S,P.lens);
    brect(x0+5*S,85*S,x0+9*S,95*S,P.glare);
  }
  brect(94*S,88*S,108*S,93*S,P.frame);
  brect(28*S,86*S,64*S,91*S,P.frame);      /* the arm, across the character outline */
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

const OPTS=t=>({ thresh:t, align:false, band:[0,1], strip:true, haloTol:150, haloPasses:6,
  reclaim:true, darkMax:DARK_MAX, reclaimPasses:40, maxOutline:6, bridgeReach:6,
  defringe:true, fringeThresh:t*2.1, fringePasses:4, neutralMax:NEUTRAL_MAX,
  edgeLum:EDGE_LUM, edgeStep:25, hardPasses:6,
  open:true, openR:3, minRemove:150, despeckle:true, minBlob:48, relative:0.02 });

function components(d,W,H){
  const seen=new Uint8Array(W*H); let n=0;
  for(let p=0;p<W*H;p++){
    if(seen[p]||d[p*4+3]<128) continue;
    n++; const st=[p]; seen[p]=1;
    while(st.length){ const q=st.pop(), x=q%W, y=(q/W)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const m=ny*W+nx; if(seen[m]||d[m*4+3]<128) continue; seen[m]=1; st.push(m); } }
  }
  return n;
}

function measure(fill, ink, trait, aa){
  const sc=scene(fill,ink,trait,aa);
  const res=API.extractTrait(sc.sub, sc.ref, OPTS(SENS));
  const d=res.data;
  let hit=0, kept=0, leak=0;
  for(let p=0;p<W*H;p++){
    if(d[p*4+3]<128) continue;
    kept++;
    if(sc.truth.has(p)) hit++;
    /* Base bleed: a kept pixel near enough to a base colour to have come from
       the character rather than the trait. This is what must be zero. */
    const c=[d[p*4],d[p*4+1],d[p*4+2]];
    if(dist(c,fill)<=BASE_TOL || dist(c,ink)<=BASE_TOL) leak++;
  }
  const recall=hit/sc.truth.size*100, precision=hit/Math.max(1,kept)*100;
  return { recall:+recall.toFixed(2), precision:+precision.toFixed(2),
    leak:leak, pieces:components(d,W,H), missed:sc.truth.size-hit };
}

function grade(fill, ink){
  const rows=[];
  for(const t of TRAITS) for(const aa of [false,true])
    rows.push(Object.assign({trait:t.name, aa:aa}, measure(fill,ink,t,aa)));
  const worst=rows.reduce((a,b)=>(b.recall<a.recall?b:a));
  return {
    rows:rows,
    worstRecall:worst.recall, worstOn:worst.trait+(worst.aa?' (anti-aliased)':''),
    minPrecision:Math.min.apply(null,rows.map(r=>r.precision)),
    totalLeak:rows.reduce((s,r)=>s+r.leak,0),
    maxPieces:Math.max.apply(null,rows.map(r=>r.pieces)),
    /* Structural facts, true regardless of any scene */
    fillLum:+LUM(fill[0],fill[1],fill[2]).toFixed(1),
    inkLum:+LUM(ink[0],ink[1],ink[2]).toFixed(1),
    inkReadsAsOutline: LUM(ink[0],ink[1],ink[2])<=DARK_MAX,
    fillSat:sat(fill), inkSat:sat(ink),
    fillIsNeutral: sat(fill)<=NEUTRAL_MAX, inkIsNeutral: sat(ink)<=NEUTRAL_MAX,
    nearestTraitColour:+Math.min.apply(null,
      TRAITS.flatMap(t=>t.parts.flatMap(p=>[dist(fill,p[1]),dist(ink,p[1])]))).toFixed(1),
    fillToInk:+dist(fill,ink).toFixed(1)
  };
}

/* ---- the candidates ---- */
const CANDIDATES=[
  ['current key (green / magenta)',        '#00FF00','#FF00FF'],
  ['CONTROL - skin tones (must be worse)', '#E9A885','#8A5A3C'],
];
for(const a of process.argv.slice(2)){
  const m=/^--palette=?(.+)$/.exec(a); if(!m) continue;
  const bits=m[1].split(',');
  CANDIDATES.push([bits[2]||bits[0]+' / '+bits[1], bits[0], bits[1]]);
}

console.log('pipeline read from index.html   threshold '+SENS
  +'   darkMax '+DARK_MAX+'   edgeLum '+EDGE_LUM+'   neutralMax '+NEUTRAL_MAX
  +'   BASE_TOL '+BASE_TOL+'   CLEAN_TOL '+CLEAN_TOL);
console.log(TRAITS.length+' traits x 2 renders = '+(TRAITS.length*2)+' scenes per palette\n');

const results=[];
for(const [label,fh,ih] of CANDIDATES){
  const fill=hex(fh), ink=hex(ih);
  const g=grade(fill,ink);
  results.push(Object.assign({label:label, fill:hx(fill), ink:hx(ink)}, g));
}
console.table(results.map(r=>({
  palette:r.label, fill:r.fill, ink:r.ink,
  worstRecall:r.worstRecall, minPrecision:r.minPrecision, leak:r.totalLeak,
  maxPieces:r.maxPieces, inkLum:r.inkLum, inkReadsAsOutline:r.inkReadsAsOutline,
  nearestTraitColour:r.nearestTraitColour })));
for(const r of results) console.log('  '+r.label+'  worst on: '+r.worstOn);

/* ---- the instrument must be able to fail something ---- */
const key=results.find(r=>r.label.indexOf('current key')===0);
const ctl=results.find(r=>r.label.indexOf('CONTROL')===0);
let bad=0;
if(!(ctl.worstRecall<key.worstRecall || ctl.totalLeak>key.totalLeak || ctl.minPrecision<key.minPrecision)){
  console.log('\nINSTRUMENT FAILURE: the deliberately bad palette did not score worse than the key palette.');
  console.log('  control: recall '+ctl.worstRecall+' precision '+ctl.minPrecision+' leak '+ctl.totalLeak);
  console.log('  key    : recall '+key.worstRecall+' precision '+key.minPrecision+' leak '+key.totalLeak);
  bad=1;
} else {
  console.log('\nCONTROL  the skin-toned base scores worse than the key palette, so this can discriminate.');
}
if(process.argv.indexOf('--json')>=0)
  fs.writeFileSync(path.join(__dirname,'base-palette-results.json'),JSON.stringify(results,null,1));
process.exit(bad);
