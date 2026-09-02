/* Search rather than guess.

   Every constraint on a base palette that does not need a rendered scene is pure
   geometry, so the whole space can be enumerated instead of sampled by hand. The
   thresholds are read out of index.html, never retyped here.

   A pair (fill, ink) is VALID when, for the two colours AND for every blend
   between them - anti-aliasing puts those blends in the image as real pixels:

     lum > darkMax            or part of the base reads as a trait outline
     Chebyshev(white) > 150   or stripBackground peels it as background
     saturation > neutralMax  or defringe refuses to peel base fringe

   and the pair is separated by more than TRACE_EDGE on some channel, or
   refEdges cannot see the character's own outline.

   Valid pairs are then ranked on the two things that matter to an artist:
   how far the base sits from colours traits actually use, and how much of the
   colour space the base makes unusable.
*/
const fs=require('fs');
const path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const SCRIPT=HTML.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
const READ=n=>{ const m=SCRIPT.match(new RegExp(n+'\\s*:\\s*([0-9]+)')); if(!m) throw new Error('cannot read '+n); return +m[1]; };
const DARK_MAX=READ('darkMax'), NEUTRAL_MAX=READ('neutralMax'), HALO_TOL=READ('haloTol');
const TRACE_EDGE=+(SCRIPT.match(/const TRACE_EDGE=([0-9]+)/)||[])[1];
const CLEAN_TOL=+(SCRIPT.match(/const CLEAN_TOL=([0-9]+)/)||[])[1];
const BASE_TOL=+(SCRIPT.match(/const BASE_TOL=([0-9]+)/)||[])[1];
const lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;

const WHITE=[255,255,255];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const sat=c=>Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]);
const hx=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0').toUpperCase()).join('');

/* Colours a trait plausibly uses. Deliberately WIDER than the five traits the
   scene harness draws, so the ranking is not fitted to those five. Saturated
   green and cyan are absent on purpose - that is the empirical claim being made,
   that character art almost never needs them, and it is the claim to attack if
   this recommendation is wrong. */
const TRAIT_COLOURS=[
  [0,0,0],[8,8,8],[26,26,26],[45,45,45],[64,64,64],[96,96,96],[128,128,128],
  [160,160,160],[196,196,196],[224,224,224],[255,255,255],
  [255,220,177],[241,194,125],[224,172,105],[198,134,66],[141,85,36],[92,58,32],[59,36,20],
  [255,229,180],[233,168,133],[190,120,90],
  [176,32,38],[220,50,50],[224,86,86],[140,20,25],[255,120,120],
  [30,60,140],[45,90,190],[90,140,220],[20,35,80],[140,180,235],
  [198,160,52],[248,224,140],[212,175,55],[150,110,30],
  [120,60,160],[160,110,200],[70,35,100],
  [255,140,40],[210,105,30],[255,190,120],
  [64,74,73],[114,126,126],[40,50,50],
  [245,245,220],[250,240,230],[210,200,180],
  [110,60,20],[35,25,15],[180,140,100],
];

function blends(a,b,n){ const o=[];
  for(let i=0;i<=n;i++){ const t=i/n; o.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]); }
  return o; }

/* Margins above the bare threshold. A colour that clears a threshold by one is
   one rounding error from failing, and anti-aliasing rounds constantly. */
const LUM_MARGIN=+(process.env.LUM_MARGIN||20);
const BG_MARGIN=+(process.env.BG_MARGIN||20);

const SEP_MIN=+(process.env.SEP_MIN||150);
function valid(f,i){
  /* TRACE_EDGE=60 is the bare floor for refEdges to see the step at all. Ranking
     on distance-from-trait-colours alone walks straight to it, because two nearly
     identical greens are maximally far from everything a trait uses - and produce
     a character whose outline the artist can barely see and the aligner can barely
     find. A base outline is meant to READ as an outline, so require a real step. */
  if(cheb(f,i)<SEP_MIN) return 'fill and ink are too close to read as an outline ('+cheb(f,i)+' < '+SEP_MIN+')';
  if(cheb(f,i)<=TRACE_EDGE) return 'the base outline is invisible to refEdges';
  for(const c of blends(f,i,24)){
    if(lum(c[0],c[1],c[2])<=DARK_MAX+LUM_MARGIN) return 'a blend reads as a trait outline';
    if(cheb(c,WHITE)<=HALO_TOL+BG_MARGIN) return 'a blend is peeled as background';
    if(sat(c)<=NEUTRAL_MAX) return 'a blend is neutral, so defringe will not peel it';
  }
  return null;
}
function nearestTrait(f,i){
  let m=Infinity;
  for(const c of blends(f,i,24)) for(const t of TRAIT_COLOURS){ const d=dist(c,t); if(d<m) m=d; }
  return m;
}
function forbidden(f,i){
  let n=0,tot=0;
  const line=blends(f,i,8);
  for(let r=0;r<256;r+=8) for(let g=0;g<256;g+=8) for(let b=0;b<256;b+=8){
    tot++; if(line.some(c=>dist([r,g,b],c)<=CLEAN_TOL)) n++;
  }
  return n/tot*100;
}

const STEP=+(process.env.STEP||17);   /* 17 divides 255 into 16 steps exactly */
const grid=[];
for(let r=0;r<=255;r+=STEP) for(let g=0;g<=255;g+=STEP) for(let b=0;b<=255;b+=STEP) grid.push([r,g,b]);
/* Pre-filter the endpoints, which is most of the work */
const ends=grid.filter(c=>lum(c[0],c[1],c[2])>DARK_MAX+LUM_MARGIN
  && cheb(c,WHITE)>HALO_TOL+BG_MARGIN && sat(c)>NEUTRAL_MAX);
console.log('thresholds from index.html: darkMax '+DARK_MAX+'  haloTol '+HALO_TOL
  +'  neutralMax '+NEUTRAL_MAX+'  TRACE_EDGE '+TRACE_EDGE+'  CLEAN_TOL '+CLEAN_TOL
  +'  BASE_TOL '+BASE_TOL);
console.log('margins: luminance +'+LUM_MARGIN+', background +'+BG_MARGIN);
console.log('grid step '+STEP+' -> '+grid.length+' colours, '+ends.length+' usable as an endpoint\n');
if(!ends.length){ console.log('NO COLOUR AT ALL satisfies the endpoint constraints - check the margins.'); process.exit(1); }

const out=[];
for(let a=0;a<ends.length;a++) for(let b=a+1;b<ends.length;b++){
  if(valid(ends[a],ends[b])) continue;
  out.push({f:ends[a], i:ends[b], near:nearestTrait(ends[a],ends[b])});
}
console.log(out.length+' valid pairs\n');
out.sort((x,y)=>y.near-x.near);
/* Twelve variants of one green is not twelve options. Keep a pair only when it
   is genuinely unlike everything already kept, so the list shows the shape of
   the space rather than the neighbourhood of its single best point. */
const SPREAD=+(process.env.SPREAD||90);
const diverse=[];
for(const p of out){
  if(diverse.some(q=>Math.min(dist(q.f,p.f)+dist(q.i,p.i), dist(q.f,p.i)+dist(q.i,p.f))<SPREAD)) continue;
  diverse.push(p);
  if(diverse.length>=12) break;
}
const TOP=12;
const top=diverse.map(p=>({
  fill:hx(p.f), ink:hx(p.i),
  nearestTraitColour:+p.near.toFixed(1),
  forbiddenPct:+forbidden(p.f,p.i).toFixed(3),
  fillLum:+lum(p.f[0],p.f[1],p.f[2]).toFixed(1),
  inkLum:+lum(p.i[0],p.i[1],p.i[2]).toFixed(1),
  separation:+dist(p.f,p.i).toFixed(0),
}));
console.log('best in each region of the space, ranked by distance from colours traits use:');
console.table(top);

/* Where do the palettes already in the code, and the obvious ones, land? */
const named=[['current KEY_FILL/KEY_INK',[0,255,0],[255,0,255]],
             ['green + cyan',[0,255,0],[0,255,255]],
             ['green + yellow',[0,255,0],[255,255,0]],
             ['yellow + cyan',[255,255,0],[0,255,255]]];
console.log('\nnamed palettes, for comparison:');
console.table(named.map(([n,f,i])=>({ palette:n, fill:hx(f), ink:hx(i),
  valid:valid(f,i)||'yes', nearestTraitColour:+nearestTrait(f,i).toFixed(1),
  forbiddenPct:+forbidden(f,i).toFixed(3),
  rank:(()=>{ const k=out.findIndex(p=>hx(p.f)===hx(f)&&hx(p.i)===hx(i)||hx(p.f)===hx(i)&&hx(p.i)===hx(f));
    return k<0?'not on the grid':(k+1)+' of '+out.length; })() })));

/* The search must be able to reject. If nothing is rejected the filter is off. */
const rejected=[[ 'mid grey',[128,128,128],[90,90,90] ],
                [ 'near-black ink',[0,255,0],[10,10,10] ],
                [ 'pale skin',[233,168,133],[190,120,90] ]];
console.log('\nrejections (the filter must be able to say no):');
for(const [n,f,i] of rejected){ const why=valid(f,i); console.log('  '+n+': '+(why||'ACCEPTED - the filter is not working')); }
if(rejected.some(([n,f,i])=>!valid(f,i))){ console.log('\nSEARCH FAILURE: a palette that should be rejected was accepted.'); process.exit(1); }
