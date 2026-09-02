/* The harder instrument.

   base-palette-sweep.cjs gives 100% recall to every palette, which means recall
   there discriminates nothing - it only separates palettes on base-colour leak.
   A metric that cannot come out differently is not measuring the thing it is
   named after, so this adds the cases where palettes actually diverge:

     framed   - a thick trait whose arm crosses the character's own outline
     wire     - a one-pixel frame, which despeckle and openMask can eat whole
     floating - a trait entirely inside the body, touching no edge
     buried   - a trait drawn over the character's OUTLINE, not its fill

   times five realistic trait palettes, times hard-edged and anti-aliased, times
   three sensitivities. Plus one thing no scene can show: how much of the colour
   space this base forbids to artists, since every trait colour within CLEAN_TOL
   of a base colour is rewritten by cleanColours and every one within BASE_TOL is
   a dropBaseBleed candidate.

   Usage:
     node tools/base-palette-stress.cjs                       sweep the built-ins
     node tools/base-palette-stress.cjs "--palette=#00FF00,#FF00FF,label"
     node tools/base-palette-stress.cjs --json                also write results
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
  'function despeckle(','function extractTrait('];
let src='';
for(const sig of NEEDED){
  if(sig.startsWith('const ')){ const a=SCRIPT.indexOf(sig); src+=SCRIPT.slice(a,SCRIPT.indexOf(';',a)+1)+'\n'; }
  else src+=carve(sig)+'\n';
}
class ImageData{ constructor(w,h){ this.width=w; this.height=h; this.data=new Uint8ClampedArray(w*h*4); } }
const API=new Function('ImageData', src+'\nreturn {extractTrait, lum, BASE_TOL, TRACE_EDGE};')(ImageData);
const LUM=API.lum, BASE_TOL=API.BASE_TOL, TRACE_EDGE=API.TRACE_EDGE;
const READ=n=>{ const m=SCRIPT.match(new RegExp(n+'\\s*:\\s*([0-9]+)')); if(!m) throw new Error('cannot read '+n); return +m[1]; };
const DARK_MAX=READ('darkMax'), EDGE_LUM=READ('edgeLum'), NEUTRAL_MAX=READ('neutralMax');
const MIN_BLOB=+(HTML.match(/id="minblob"[^>]*value="([0-9]+)"/)||[])[1];
const SENS=+(HTML.match(/id="sens"[^>]*value="([0-9]+)"/)||[])[1];
const CLEAN_TOL=+(SCRIPT.match(/const CLEAN_TOL=([0-9]+)/)||[])[1];

const hex=h=>{ const s=h.replace('#','').trim();
  return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]; };
const hx=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const sat=c=>Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]);

const W=200,H=200;
const TRAITS=[
  {name:'black glasses', frame:[8,8,8],  body:[64,74,73],   hi:[114,126,126]},
  {name:'brown hair',    frame:[8,8,8],  body:[92,58,32],   hi:[140,96,58]},
  {name:'red cap',       frame:[8,8,8],  body:[176,32,38],  hi:[224,86,86]},
  {name:'grey cans',     frame:[8,8,8],  body:[128,128,128],hi:[196,196,196]},
  {name:'gold chain',    frame:[8,8,8],  body:[198,160,52], hi:[248,224,140]},
];
const SHAPES=['framed','wire','floating','buried'];

function scene(fill, ink, tr, shape, aa){
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
  const rect=(x0,y0,x1,y1,c)=>{ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    bput(Sd,x,y,c); tag.add(y*BW+x); } };
  const F=tr.frame, B=tr.body, HI=tr.hi;
  if(shape==='framed'){
    for(const x0 of [64*S,108*S]){
      rect(x0,80*S,x0+30*S,104*S,F); rect(x0+3*S,83*S,x0+27*S,101*S,B);
      rect(x0+5*S,85*S,x0+9*S,95*S,HI); }
    rect(94*S,88*S,108*S,93*S,F);
    rect(28*S,86*S,64*S,91*S,F);              /* arm crosses the outline */
  } else if(shape==='wire'){
    /* one pixel of frame, the case despeckle and openMask can eat entirely */
    for(const x0 of [64*S,108*S]){
      rect(x0,80*S,x0+30*S,80*S+S-1,F); rect(x0,104*S,x0+30*S,104*S+S-1,F);
      rect(x0,80*S,x0+S-1,104*S,F);     rect(x0+30*S,80*S,x0+30*S+S-1,104*S,F); }
    rect(94*S,88*S,108*S,88*S+S-1,F);
    rect(28*S,88*S,64*S,88*S+S-1,F);
  } else if(shape==='floating'){
    /* wholly inside the body: nothing touches the character outline */
    rect(78*S,70*S,122*S,86*S,F); rect(81*S,73*S,119*S,83*S,B);
    rect(84*S,75*S,92*S,80*S,HI);
  } else {                                     /* buried: drawn over the outline */
    for(let a=-0.9;a<=0.9;a+=0.004){
      const x=Math.round(cx+Math.cos(a-Math.PI/2)*r), y=Math.round(cy+Math.sin(a-Math.PI/2)*r);
      for(let j=-3*S;j<=3*S;j++) for(let i2=-3*S;i2<=3*S;i2++){
        bput(Sd,x+i2,y+j,F); tag.add((y+j)*BW+(x+i2)); }
    }
  }
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
  open:true, openR:3, minRemove:150, despeckle:true, minBlob:MIN_BLOB, relative:0.02 });

function components(d){
  const seen=new Uint8Array(W*H); let n=0;
  for(let p=0;p<W*H;p++){
    if(seen[p]||d[p*4+3]<128) continue;
    n++; const st=[p]; seen[p]=1;
    while(st.length){ const q=st.pop(), x=q%W, y=(q/W)|0;
      for(const dd of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dd[0], ny=y+dd[1]; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const m=ny*W+nx; if(seen[m]||d[m*4+3]<128) continue; seen[m]=1; st.push(m); } }
  }
  return n;
}
function one(fill,ink,tr,shape,aa,th){
  const sc=scene(fill,ink,tr,shape,aa);
  const d=API.extractTrait(sc.sub,sc.ref,OPTS(th)).data;
  let hit=0,kept=0,leak=0;
  for(let p=0;p<W*H;p++){
    if(d[p*4+3]<128) continue; kept++;
    if(sc.truth.has(p)) hit++;
    const c=[d[p*4],d[p*4+1],d[p*4+2]];
    if(dist(c,fill)<=BASE_TOL||dist(c,ink)<=BASE_TOL) leak++;
  }
  return { recall:hit/sc.truth.size*100, precision:hit/Math.max(1,kept)*100,
    leak:leak, pieces:components(d) };
}

/* How much of the colour space does this base take away from artists? Every
   colour within CLEAN_TOL of a base colour is rewritten by cleanColours, and
   every one within BASE_TOL is a dropBaseBleed candidate. Sampled on a grid
   rather than derived, because the two rules use different distances. */
function forbidden(cols){
  let n=0, tot=0;
  for(let r=0;r<256;r+=8) for(let g=0;g<256;g+=8) for(let b=0;b<256;b+=8){
    tot++;
    if(cols.some(c=>dist([r,g,b],c)<=CLEAN_TOL)) n++;
  }
  return +(n/tot*100).toFixed(3);
}


/* Two constraints no scene in this file can show, because every scene here uses
   the same white background and the same two base colours.

   bgMargin  - stripBackground peels a pixel next to the background when EVERY
               channel is within haloTol=150 of the corner colour (index.html:1646,
               Chebyshev, not euclidean). A base colour with no channel further
               than 150 from white is eaten as background. Measured as the largest
               per-channel gap; it must exceed 150.
   blendLum  - anti-aliasing puts every colour on the line between fill and ink
               into the image. Those blends are pixels too, so the darkest one
               must still clear darkMax or part of the base reads as trait outline.
   Both are reported for the blends as well as the endpoints, since the endpoints
   passing tells you nothing about the middle. */
const WHITE=[255,255,255];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
function blendLine(a,b){ const out=[];
  for(let t=0;t<=1.0001;t+=1/32) out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]);
  return out; }
function structural(fill,ink,extras){
  const ends=[fill,ink].concat(extras||[]);
  const line=blendLine(fill,ink);
  const all=ends.concat(line);
  return {
    bgMarginEnds:Math.min.apply(null,ends.map(c=>cheb(c,WHITE))),
    bgMarginBlends:Math.min.apply(null,all.map(c=>cheb(c,WHITE))),
    blendMinLum:+Math.min.apply(null,all.map(c=>LUM(c[0],c[1],c[2]))).toFixed(1),
    blendMaxLum:+Math.max.apply(null,all.map(c=>LUM(c[0],c[1],c[2]))).toFixed(1),
  };
}

function grade(fill,ink,extras){
  const cols=[fill,ink].concat(extras||[]);
  const rows=[];
  for(const tr of TRAITS) for(const shape of SHAPES) for(const aa of [false,true])
    rows.push(Object.assign({trait:tr.name,shape:shape,aa:aa},one(fill,ink,tr,shape,aa,SENS)));
  /* robustness: the default sensitivity is one setting, not the only one */
  for(const th of [20,60,90]) for(const tr of TRAITS)
    rows.push(Object.assign({trait:tr.name,shape:'framed@'+th,aa:false},one(fill,ink,tr,'framed',false,th)));
  const worst=rows.reduce((a,b)=>b.recall<a.recall?b:a);
  const worstP=rows.reduce((a,b)=>b.precision<a.precision?b:a);
  const st=structural(fill,ink,extras);
  return Object.assign({
    scenes:rows.length,
    worstRecall:+worst.recall.toFixed(2),
    worstRecallOn:worst.shape+' / '+worst.trait+(worst.aa?' aa':''),
    worstPrecision:+worstP.precision.toFixed(2),
    worstPrecisionOn:worstP.shape+' / '+worstP.trait+(worstP.aa?' aa':''),
    meanRecall:+(rows.reduce((s,r)=>s+r.recall,0)/rows.length).toFixed(2),
    totalLeak:rows.reduce((s,r)=>s+r.leak,0),
    scenesLeaking:rows.filter(r=>r.leak>0).length,
    maxPieces:Math.max.apply(null,rows.map(r=>r.pieces)),
    inkLum:+LUM(ink[0],ink[1],ink[2]).toFixed(1),
    fillLum:+LUM(fill[0],fill[1],fill[2]).toFixed(1),
    inkReadsAsOutline:LUM(ink[0],ink[1],ink[2])<=DARK_MAX,
    fillReadsAsOutline:LUM(fill[0],fill[1],fill[2])<=DARK_MAX,
    fillInkStep:+dist(fill,ink).toFixed(1),
    fillInkVisibleToRefEdges:Math.max(Math.abs(fill[0]-ink[0]),Math.abs(fill[1]-ink[1]),Math.abs(fill[2]-ink[2]))>TRACE_EDGE,
    nearestTraitColour:+Math.min.apply(null,
      TRAITS.flatMap(t=>[t.frame,t.body,t.hi].flatMap(c=>cols.map(b=>dist(b,c))))).toFixed(1),
    forbiddenPct:forbidden(cols),
    rows:rows,
  }, st,
  { bgSafe: st.bgMarginBlends>150, blendNeverOutline: st.blendMinLum>DARK_MAX });
}

const CANDIDATES=[
  ['current key (green / magenta)','#00FF00','#FF00FF'],
  ['CONTROL skin tones','#E9A885','#8A5A3C'],
  ['CONTROL near-black ink','#00FF00','#0A0A0A'],
  ['CONTROL pale grey (background-unsafe)','#C8C8C8','#9A9A9A'],
  ['CONTROL one-axis pair (background-safe)','#00FF00','#00FFFF'],
];
for(const a of process.argv.slice(2)){
  const m=/^--palette=?(.+)$/.exec(a); if(!m) continue;
  const b=m[1].split(',');
  CANDIDATES.push([b[2]||b[0]+' / '+b[1], b[0], b[1]]);
}

console.log('read from index.html   sens '+SENS+'  darkMax '+DARK_MAX+'  edgeLum '+EDGE_LUM
  +'  neutralMax '+NEUTRAL_MAX+'  minBlob '+MIN_BLOB+'  BASE_TOL '+BASE_TOL
  +'  CLEAN_TOL '+CLEAN_TOL+'  TRACE_EDGE '+TRACE_EDGE);
const out=[];
for(const [label,f,i] of CANDIDATES){
  const fill=hex(f), ink=hex(i);
  out.push(Object.assign({label:label,fill:hx(fill),ink:hx(ink)},grade(fill,ink)));
}
console.log(out[0].scenes+' scenes per palette\n');
console.table(out.map(r=>({ palette:r.label, fill:r.fill, ink:r.ink,
  worstRecall:r.worstRecall, meanRecall:r.meanRecall, worstPrec:r.worstPrecision,
  leak:r.totalLeak, leakScenes:r.scenesLeaking, maxPieces:r.maxPieces,
  inkLum:r.inkLum, inkAsOutline:r.inkReadsAsOutline,
  nearTrait:r.nearestTraitColour, forbiddenPct:r.forbiddenPct,
  bgMargin:r.bgMarginBlends, bgSafe:r.bgSafe, blendMinLum:r.blendMinLum, blendOK:r.blendNeverOutline })));
for(const r of out) console.log('  '+r.label+'\n      worst recall on '+r.worstRecallOn
  +' ('+r.worstRecall+'%)   worst precision on '+r.worstPrecisionOn+' ('+r.worstPrecision+'%)');

/* The instrument must be able to fail things, and on the axis each control
   targets - a control that fails for the wrong reason proves nothing. */
const key=out[0], skin=out[1], dark=out[2], pale=out[3], axis=out[4];
const problems=[];
if(!(skin.totalLeak>key.totalLeak)) problems.push('the skin-toned base did not leak more than the key palette');
if(!(skin.nearestTraitColour<key.nearestTraitColour)) problems.push('the skin-toned base is not closer to trait colours');
if(!(dark.worstRecall<key.worstRecall||dark.maxPieces>key.maxPieces||dark.worstPrecision<key.worstPrecision))
  problems.push('a near-black ink, which every dark-pixel stage should confuse for a trait outline, cost nothing');
if(pale.bgSafe) problems.push('a pale grey base was not flagged as background-unsafe, so bgMargin cannot detect it');
if(!axis.bgSafe) problems.push('a pair whose blends never leave one axis was flagged background-unsafe');
if(key.bgSafe) problems.push('green/magenta was NOT flagged, but its blends pass through mid grey - the check is not working');
if(problems.length){ console.log('\nINSTRUMENT FAILURE:'); problems.forEach(p=>console.log('  - '+p)); }
else console.log('\nCONTROLS  both bad palettes are punished, each on the axis it was built to fail.');
if(process.argv.indexOf('--json')>=0)
  fs.writeFileSync(path.join(__dirname,'base-palette-stress.json'),
    JSON.stringify(out.map(r=>Object.assign({},r,{rows:undefined})),null,1));
process.exit(problems.length?1:0);
