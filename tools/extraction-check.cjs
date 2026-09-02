/* Regression check for the trait extraction pipeline.

     node tools/extraction-check.cjs              checks the index.html next door
     node tools/extraction-check.cjs --write      also drops the scenes and results as PNGs
     node tools/extraction-check.cjs other.html   checks some other build

   Exits non-zero when a scene regresses. The scenes are synthetic on purpose:
   the trait pixels are known exactly, so recall and precision are measured
   rather than judged by eye.
*/
/* Runs the SHIPPED extraction pipeline against a scene whose trait pixels are
   known exactly, so recall and precision are measured rather than eyeballed.
   The functions are carved out of index.html by name - not retyped - or this
   would be testing a copy that can drift from what people actually run. */
const fs=require('fs'), zlib=require('zlib');
/* --write drops the scenes and results next to you, for looking at rather than
   counting. Off by default so a plain run leaves nothing behind. */
const SHOW=process.argv.includes('--write');
const ARG=process.argv.slice(2).find(a=>a[0]!=='-');
const HTML=fs.readFileSync(ARG||(__dirname+'/../index.html'),'utf8');
const SCRIPT=HTML.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];

function carve(sig){
  const a=SCRIPT.indexOf(sig);
  if(a<0) throw new Error('cannot find '+sig);
  let i=SCRIPT.indexOf('{',a), d=0;
  for(; i<SCRIPT.length; i++){
    if(SCRIPT[i]==='{') d++;
    else if(SCRIPT[i]==='}'){ d--; if(d===0) return SCRIPT.slice(a,i+1); }
  }
  throw new Error('unbalanced '+sig);
}
let NEEDED=['const lum =','const TRAIT_BLACK','const BASE_TOL','const BLEED_BLOB','const TRACE_EDGE','const TRACE_SHARE','function refEdges(','function palette(','function maskOfImg(','function bodyDistance(','function fitTo(',
  'function stripBackground(','function alignToRef(','function reclaimOutline(','function defringe(',
  'function hardenEdge(','function blackenEdge(','function openMask(','function despeckle(',
  'function extractTrait('];
if(SCRIPT.indexOf('function bridgeOutline(')>=0) NEEDED.splice(NEEDED.length-1,0,'function bridgeOutline(');
if(SCRIPT.indexOf('function dropBaseBleed(')>=0) NEEDED.splice(NEEDED.length-1,0,'function dropBaseBleed(');
let src='';
for(const sig of NEEDED){
  if(sig.startsWith('const ')){
    const a=SCRIPT.indexOf(sig), e=SCRIPT.indexOf(';',a);
    src+=SCRIPT.slice(a,e+1)+'\n';
  } else src+=carve(sig)+'\n';
}
class ImageData{
  constructor(w,h){ this.width=w; this.height=h; this.data=new Uint8ClampedArray(w*h*4); }
}
const API=new Function('ImageData', src+'\nreturn {extractTrait,despeckle,lum,maskOfImg};')(ImageData);

/* ---------- a scene where the answer is known ---------- */
const W=200,H=200;
const WHITE=[255,255,255], SKIN=[233,168,133], BLACK=[8,8,8];
const LENS=[38,48,46], HILITE=[120,140,138];

function blank(){ const d=new Uint8ClampedArray(W*H*4);
  for(let p=0;p<W*H;p++){ d[p*4]=255; d[p*4+1]=255; d[p*4+2]=255; d[p*4+3]=255; } return d; }
const put=(d,x,y,c)=>{ if(x<0||y<0||x>=W||y>=H) return;
  const i=(y*W+x)*4; d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255; };
const rect=(d,x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) put(d,x,y,c); };

/* the character: a round head, black outline, skin fill */
function drawHead(d){
  const cx=100, cy=95, r=58;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const dd=Math.hypot(x-cx,y-cy);
    if(dd<=r-2) put(d,x,y,SKIN);
    else if(dd<=r) put(d,x,y,BLACK);   /* 2px black outline */
  }
}
/* the trait: black-framed dark glasses, with an arm that runs LEFT and crosses
   the head's own black outline on its way to the ear - which is the case that
   broke. Returns the exact set of trait pixels. */
function drawGlasses(d){
  const truth=new Set();
  const mark=(x,y,c)=>{ put(d,x,y,c); if(x>=0&&y>=0&&x<W&&y<H) truth.add(y*W+x); };
  const mrect=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) mark(x,y,c); };
  /* two lenses */
  for(const x0 of [64,108]){
    mrect(x0,80,x0+30,104,BLACK);              /* frame */
    mrect(x0+3,83,x0+27,101,LENS);             /* dark glass */
    mrect(x0+5,85,x0+9,95,HILITE);             /* the only light pixels in the whole trait */
  }
  mrect(94,88,108,93,BLACK);                   /* nose bridge */
  /* the arm: a long black bar running left, straight THROUGH the head outline
     at x roughly 44, and on past it. Every pixel of it is black. */
  mrect(28,86,64,91,BLACK);
  return truth;
}

const ref=new ImageData(W,H); ref.data.set(blank()); drawHead(ref.data);
const sub=new ImageData(W,H); sub.data.set(ref.data); const TRUTH=drawGlasses(sub.data);

/* Which trait pixels sit on top of a black reference pixel? A difference is
   blind to exactly these, so they are the ones the later stages must recover. */
const HIDDEN=new Set();
for(const p of TRUTH){
  const i=p*4;
  if(API.lum(ref.data[i],ref.data[i+1],ref.data[i+2])<=60
     && API.lum(sub.data[i],sub.data[i+1],sub.data[i+2])<=60) HIDDEN.add(p);
}


/* ---------- the same scene, anti-aliased ---------- */
function buildAA(){
  const S=3, BW=W*S, BH=H*S;
  const big=(fill)=>{ const d=new Uint8ClampedArray(BW*BH*4);
    for(let p=0;p<BW*BH;p++){ d[p*4]=fill[0]; d[p*4+1]=fill[1]; d[p*4+2]=fill[2]; d[p*4+3]=255; } return d; };
  const bput=(d,x,y,c)=>{ if(x<0||y<0||x>=BW||y>=BH) return;
    const i=(y*BW+x)*4; d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255; };
  const brect=(d,x0,y0,x1,y1,c,tag)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    bput(d,x,y,c); if(tag) tag.add(y*BW+x); } };
  const R=big(WHITE), cx=100*S, cy=95*S, r=58*S;
  for(let y=0;y<BH;y++) for(let x=0;x<BW;x++){
    const dd=Math.hypot(x-cx,y-cy);
    if(dd<=r-2*S) bput(R,x,y,SKIN); else if(dd<=r) bput(R,x,y,BLACK);
  }
  const Sd=new Uint8ClampedArray(R); const tag=new Set();
  for(const x0 of [64*S,108*S]){
    brect(Sd,x0,80*S,x0+30*S,104*S,BLACK,tag);
    brect(Sd,x0+3*S,83*S,x0+27*S,101*S,LENS,tag);
    brect(Sd,x0+5*S,85*S,x0+9*S,95*S,HILITE,tag);
  }
  brect(Sd,94*S,88*S,108*S,93*S,BLACK,tag);
  brect(Sd,28*S,86*S,64*S,91*S,BLACK,tag);
  /* box-downsample both, and call a pixel trait when the block was mostly trait */
  const down=(d)=>{ const o=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let r=0,g=0,b=0;
      for(let j=0;j<S;j++) for(let i2=0;i2<S;i2++){
        const q=((y*S+j)*BW+(x*S+i2))*4; r+=d[q]; g+=d[q+1]; b+=d[q+2]; }
      const n=S*S, o2=(y*W+x)*4;
      o[o2]=r/n; o[o2+1]=g/n; o[o2+2]=b/n; o[o2+3]=255; }
    return o; };
  const truth=new Set();
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    let c=0; for(let j=0;j<S;j++) for(let i2=0;i2<S;i2++)
      if(tag.has((y*S+j)*BW+(x*S+i2))) c++;
    if(c>S*S/2) truth.add(y*W+x);
  }
  const refA=new ImageData(W,H); refA.data.set(down(R));
  const subA=new ImageData(W,H); subA.data.set(down(Sd));
  return {ref:refA, sub:subA, truth};
}


/* ---------- CONTROL: nothing was added, so nothing may be found ----------
   If the bridge can invent trait out of a character's own dark pixels, this is
   where it shows: the two images are identical, so the only honest answer is
   an empty result. A stage that adds pixels needs a case where it must add
   none, or "it added some" is not evidence of anything. */
function controlNoTrait(){
  const r2=new ImageData(W,H); r2.data.set(ref.data);
  const s2=new ImageData(W,H); s2.data.set(ref.data);
  const out=API.extractTrait(s2,r2,Object.assign({},OPTS));
  let kept=0; for(let p=0;p<W*H;p++) if(out.data[p*4+3]>127) kept++;
  return {kept, bridged:out.stats.bridged||0};
}
/* ---------- a trait that overlaps the outline on BOTH sides, over a face
   that has its own dark features. If bridging reaches too far it will join the
   glasses to the eyebrows, or drag in the head outline it is crossing. ---- */
function buildCrowded(){
  const r2=new ImageData(W,H); r2.data.set(blank());
  drawHead(r2.data);
  /* the character's own dark bits, close to where the trait will sit */
  const rd=r2.data;
  rect(rd,72,74,92,77,BLACK);     /* left eyebrow, just above the lens */
  rect(rd,112,74,132,77,BLACK);   /* right eyebrow */
  rect(rd,88,150,112,158,BLACK);  /* a dark mouth well below */
  const s2=new ImageData(W,H); s2.data.set(rd);
  const truth=new Set();
  const mark=(x,y,c)=>{ put(s2.data,x,y,c); truth.add(y*W+x); };
  const mrect=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) mark(x,y,c); };
  for(const x0 of [60,110]){
    mrect(x0,82,x0+32,106,BLACK);
    mrect(x0+3,85,x0+29,103,LENS);
    mrect(x0+5,87,x0+9,97,HILITE);
  }
  mrect(92,90,110,95,BLACK);
  mrect(24,88,60,93,BLACK);        /* left arm, crosses the outline */
  mrect(142,88,178,93,BLACK);      /* right arm, crosses the outline the other side */
  return {ref:r2, sub:s2, truth};
}

/* ---------- measuring ---------- */
function components(t){
  const n=W*H, m=new Uint8Array(n), lab=new Int32Array(n).fill(-1), out=[];
  for(let p=0;p<n;p++) m[p]=t[p*4+3]>127?1:0;
  for(let p=0;p<n;p++){
    if(!m[p]||lab[p]>=0) continue;
    const q=[p], comp=[]; lab[p]=out.length;
    while(q.length){ const c=q.pop(); comp.push(c);
      const x=c%W,y=(c/W)|0;
      for(const nb of [x>0?c-1:-1,x<W-1?c+1:-1,y>0?c-W:-1,y<H-1?c+W:-1])
        if(nb>=0&&m[nb]&&lab[nb]<0){ lab[nb]=out.length; q.push(nb); } }
    out.push(comp);
  }
  return out.sort((a,b)=>b.length-a.length);
}
function score(res,label,TRUTH,HIDDEN,refD){
  const kept=new Set();
  for(let p=0;p<W*H;p++) if(res.data[p*4+3]>127) kept.add(p);
  let hit=0; for(const p of TRUTH) if(kept.has(p)) hit++;
  let hidHit=0; for(const p of HIDDEN) if(kept.has(p)) hidHit++;
  const comps=components(res.data);
  const strays=comps.slice(1).reduce((a,c)=>a+c.length,0);
  /* light pixels kept that are NOT trait - the "mixing" complaint */
  let mixed=0;
  for(const p of kept){ if(TRUTH.has(p)) continue;
    const i=p*4; if(API.lum(res.data[i],res.data[i+1],res.data[i+2])>150) mixed++; }
  let stole=0;
  for(const p of kept){ if(TRUTH.has(p)) continue;
    const i=p*4;
    if(refD[i+3]>=128 && API.lum(refD[i],refD[i+1],refD[i+2])<=60) stole++; }
  return { label, stoleOutline:stole,
    recall:+(hit/TRUTH.size*100).toFixed(1),
    precision:+(hit/Math.max(1,kept.size)*100).toFixed(1),
    hiddenRecall:+(hidHit/Math.max(1,HIDDEN.size)*100).toFixed(1),
    pieces:comps.length, strayPx:strays, lightNonTrait:mixed, kept:kept.size };
}

const OPTS={
  thresh:40, align:false, band:[0,1], strip:true, haloTol:150, haloPasses:6,
  reclaim:true, darkMax:110, reclaimPasses:40, maxOutline:6,
  defringe:true, fringeThresh:40*2.1, fringePasses:4, neutralMax:18,
  snap:true, edgeLum:110, edgeStep:25, hardPasses:6,
  open:true, openR:3, minRemove:150,
  despeckle:true, minBlob:48, relative:0.02, bridgeReach:6,
};
console.log('scene: '+TRUTH.size+' trait pixels, of which '+HIDDEN.size+
            ' sit on the character\'s own black outline and a difference cannot see them');
const res=API.extractTrait(sub,ref,Object.assign({},OPTS));

function hiddenOf(truth,refD,subD){
  const h=new Set();
  for(const p of truth){ const i=p*4;
    if(API.lum(refD[i],refD[i+1],refD[i+2])<=60 && API.lum(subD[i],subD[i+1],subD[i+2])<=60) h.add(p); }
  return h;
}
const rows=[];
rows.push(score(res,'hard edges',TRUTH,HIDDEN,ref.data));
const A=buildAA();
const Ahidden=hiddenOf(A.truth,A.ref.data,A.sub.data);
const resA=API.extractTrait(A.sub,A.ref,Object.assign({},OPTS));
rows.push(score(resA,'anti-aliased',A.truth,Ahidden,A.ref.data));
console.log('anti-aliased scene: '+A.truth.size+' trait pixels, '+Ahidden.size+' of them hidden under black');

const C=buildCrowded();
const Chidden=hiddenOf(C.truth,C.ref.data,C.sub.data);
const resC=API.extractTrait(C.sub,C.ref,Object.assign({},OPTS));
rows.push(score(resC,'both sides + face',C.truth,Chidden,C.ref.data));
console.log('crowded scene: '+C.truth.size+' trait pixels, '+Chidden.size+' hidden under black');
console.table(rows);
const ctl=controlNoTrait();
console.log('CONTROL identical images -> kept '+ctl.kept+', bridged '+ctl.bridged+
            (ctl.kept===0 ? '   PASS' : '   FAIL, it found a trait that is not there'));
if(SHOW) png('out-crowded.png',resC.data);
if(SHOW) png('scene-crowded.png',C.sub.data);

console.log("stage counts, hard edges:", JSON.stringify(res.stats));
console.log("stage counts, anti-aliased:", JSON.stringify(resA.stats));
if(SHOW) png('out-aa.png',resA.data);
if(SHOW) png('scene-aa-drop.png',A.sub.data);


/* Save what came out so it can be looked at, not just counted. */
function png(file,data){
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*4+1)]=0;
    for(let x=0;x<W*4;x++) raw[y*(W*4+1)+1+x]=data[y*W*4+x]; }
  const chunk=(type,body)=>{
    const len=Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td=Buffer.concat([Buffer.from(type),body]);
    const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td)>>>0);
    return Buffer.concat([len,td,crc]);
  };
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  fs.writeFileSync(file,Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}
var TBL=null;
function crc32(buf){
  if(!TBL){ TBL=new Int32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; TBL[n]=c; } }
  let c=-1; for(const b of buf) c=TBL[(c^b)&0xFF]^(c>>>8); return c^-1;
}
if(SHOW) png('scene-drop.png',sub.data);
if(SHOW) png('scene-ref.png',ref.data);
if(SHOW) png('out-shipped.png',res.data);
if(SHOW) console.log('wrote the scenes and results as PNGs');

/* ---- the verdict ----------------------------------------------------------
   Every one of these lines was red before the bridge stage existed, so none of
   them is decoration. hiddenRecall matters most: it is the share of the trait
   sitting on top of the black outline the character already had, which is
   exactly where a difference sees nothing whatsoever. */
const fails=[];
for(const r of rows){
  if(r.hiddenRecall<100) fails.push(r.label+": only "+r.hiddenRecall+"% of the pixels hidden under the outline came back");
  if(r.pieces!==1) fails.push(r.label+": came back in "+r.pieces+" pieces, so something is severed");
  if(r.recall<99.5) fails.push(r.label+": recall "+r.recall+"%");
  if(r.precision<99) fails.push(r.label+": precision "+r.precision+"%");
  if(r.stoleOutline>0) fails.push(r.label+": took "+r.stoleOutline+" pixels that belong to the character");
}
if(ctl.kept!==0) fails.push("CONTROL: found "+ctl.kept+" pixels of trait between two identical images");
if(fails.length){
  console.error("\nFAILED:");
  for(const f of fails) console.error("  "+f);
  process.exit(1);
}
console.log("\nall three scenes pass, and the control found nothing where there is nothing");
