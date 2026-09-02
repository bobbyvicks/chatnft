/* Guards KEY_FILL and KEY_INK.

   The two colours a keyed character is made of are not free choices - the rest
   of the pipeline compares against thresholds that a badly chosen pair walks
   straight into, and the failures are quiet ones: a base that gets peeled as
   background, or a base blend that reads as a trait outline, does not raise an
   error, it just extracts slightly wrong for ever.

   Every threshold here is read out of index.html rather than retyped, so
   changing a threshold moves this check with it instead of leaving it asserting
   yesterday's numbers.

   Run: node tools/key-colours-check.cjs      (exit 0 pass, 1 fail)
*/
const fs=require('fs');
const path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const M=HTML.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];

const rd=n=>{ const x=new RegExp(n+'=\\[(\\d+),(\\d+),(\\d+)\\]').exec(M);
  if(!x) throw new Error('cannot find '+n+' in index.html'); return [+x[1],+x[2],+x[3]]; };
const num=(re,what)=>{ const x=re.exec(M); if(!x) throw new Error('cannot read '+what); return +x[1]; };
const DARK_MAX=num(/darkMax:(\d+)/,'darkMax');
const HALO    =num(/haloTol:(\d+)/,'haloTol');
const NEUTRAL =num(/neutralMax:(\d+)/,'neutralMax');
const TRACE   =num(/const TRACE_EDGE=(\d+)/,'TRACE_EDGE');

const lum=c=>0.299*c[0]+0.587*c[1]+0.114*c[2];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
const sat=c=>Math.max.apply(null,c)-Math.min.apply(null,c);
const hx=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0').toUpperCase()).join('');

/* Anti-aliasing puts every colour between fill and ink into the image as real
   pixels, so the checks run on the whole line, not just its two ends. */
function check(fill,ink){
  const fail=[];
  const line=[];
  for(let i=0;i<=32;i++){ const t=i/32;
    line.push([fill[0]+(ink[0]-fill[0])*t, fill[1]+(ink[1]-fill[1])*t, fill[2]+(ink[2]-fill[2])*t]); }
  const minLum=Math.min.apply(null,line.map(lum));
  const minBg =Math.min.apply(null,line.map(c=>cheb(c,[255,255,255])));
  const minSat=Math.min.apply(null,line.map(sat));
  if(minLum<=DARK_MAX)
    fail.push('a blend reads as a trait outline: luminance '+minLum.toFixed(1)+' is not above darkMax '+DARK_MAX);
  if(minBg<=HALO)
    fail.push('a blend is peeled as background: it comes within '+minBg+' of white, and haloTol is '+HALO);
  if(minSat<=NEUTRAL)
    fail.push('a blend is neutral so defringe will not peel it: saturation '+minSat+' is not above neutralMax '+NEUTRAL);
  if(cheb(fill,ink)<=TRACE)
    fail.push('the base outline is invisible to refEdges: step '+cheb(fill,ink)+' is not above TRACE_EDGE '+TRACE);
  if(lum(ink)>=lum(fill))
    fail.push('the outline is not darker than the body: ink '+lum(ink).toFixed(1)+' vs fill '+lum(fill).toFixed(1)
      +' - keyCharacter puts the ink where the character was dark, so it should read as an outline');
  return {fail:fail, minLum:minLum, minBg:minBg, minSat:minSat, step:cheb(fill,ink)};
}

const FILL=rd('KEY_FILL'), INK=rd('KEY_INK');
console.log('thresholds read from index.html: darkMax '+DARK_MAX+'  haloTol '+HALO
  +'  neutralMax '+NEUTRAL+'  TRACE_EDGE '+TRACE);
console.log('KEY_FILL '+hx(FILL)+' (body, luminance '+lum(FILL).toFixed(1)+')');
console.log('KEY_INK  '+hx(INK)+' (outline, luminance '+lum(INK).toFixed(1)+')\n');

const r=check(FILL,INK);
if(r.fail.length){
  console.log('FAIL');
  r.fail.forEach(f=>console.log('  - '+f));
} else {
  console.log('PASS');
  console.log('  darkest blend luminance   '+r.minLum.toFixed(1)+'  (must exceed '+DARK_MAX+')');
  console.log('  closest blend gets to white '+r.minBg+'  (must exceed '+HALO+')');
  console.log('  least saturated blend      '+r.minSat+'  (must exceed '+NEUTRAL+')');
  console.log('  outline step               '+r.step+'  (must exceed '+TRACE+')');
}

/* Positive controls. A check that passes everything is not a check, so each of
   these must fail, and must fail for the stated reason - a control that trips
   the wrong assertion proves nothing about the one it was built to exercise. */
const CONTROLS=[
  { name:'green + magenta (what this used to be)', fill:[0,255,0], ink:[255,0,255],
    expect:'peeled as background' },
  { name:'green + near-black ink',  fill:[0,255,0], ink:[10,10,10],
    expect:'reads as a trait outline' },
  { name:'two mid greys',           fill:[128,128,128], ink:[90,90,90],
    expect:'invisible to refEdges' },
  { name:'cyan body, WHITE outline',fill:[0,255,255], ink:[255,255,255],
    expect:'peeled as background' },
];
let broken=[];
console.log('\ncontrols (each must fail, for its own reason):');
for(const c of CONTROLS){
  const got=check(c.fill,c.ink);
  if(!got.fail.length){ broken.push(c.name+' was ACCEPTED'); console.log('  '+c.name+': ACCEPTED - this check is not working'); continue; }
  const hit=got.fail.some(f=>f.indexOf(c.expect)>=0);
  console.log('  '+c.name+': '+(hit?'rejected - '+c.expect:'rejected, but for the WRONG reason: '+got.fail[0]));
  if(!hit) broken.push(c.name+' failed on the wrong assertion');
}
if(broken.length){
  console.log('\nCHECK FAILURE: '+broken.join('; '));
  process.exit(1);
}
if(r.fail.length){
  console.log('\nThe key colours in index.html do not satisfy the pipeline. See');
  console.log('tools/base-palette-search.cjs for the space of pairs that do.');
  process.exit(1);
}
console.log('\nkey colours OK, and all four controls were rejected for the right reason');
