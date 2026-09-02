const fs=require('fs');
const P=JSON.parse(fs.readFileSync('real-trait-palette.json','utf8'));
/* Collapse the collection's 1.3M colours (they carry the same noise the skins
   did) onto a /6 lattice, weighted by pixels, and drop anything that is only my
   own key files. That is the population a key colour must stay away from. */
const KEY=new Set(['0,255,255','0,255,0','255,255,255']);
const q=new Map();
for(const {rgb,px} of P){
  if(KEY.has(rgb.join(','))) continue;
  /* clamp: Math.round(255/6)*6 is 258, which produced 7-digit hex and colours
     outside the cube */
  const cl=v=>Math.min(255,Math.round(v/6)*6);
  const k=[cl(rgb[0]),cl(rgb[1]),cl(rgb[2])].join(',');
  q.set(k,(q.get(k)||0)+px);
}
/* A colour carried by a handful of pixels is dithering noise, not a colour the
   collection uses. Keeping them made every point in RGB space look occupied and
   the ranking meaningless - the top answer was 15 away from a ONE-pixel colour.
   Floor at 500 pixels across the whole collection. */
const FLOOR=500;
const pop=[...q.entries()].map(([k,px])=>({c:k.split(',').map(Number),px}))
  .filter(e=>e.px>=FLOOR).sort((a,b)=>b.px-a.px);
const total=pop.reduce((s,e)=>s+e.px,0);
console.log('collection palette: '+pop.length+' colour groups, '+total.toLocaleString()+' pixels\n');

const lum=c=>0.299*c[0]+0.587*c[1]+0.114*c[2];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
const sat=c=>Math.max(...c)-Math.min(...c);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const WHITE=[255,255,255], INK=[0,255,0];
const DARK_MAX=110, HALO=150, NEU=18, TRACE=60, LM=20, BM=20;

function ok(fill){
  for(let i=0;i<=24;i++){ const t=i/24;
    const c=[fill[0]+(INK[0]-fill[0])*t, fill[1]+(INK[1]-fill[1])*t, fill[2]+(INK[2]-fill[2])*t];
    if(lum(c)<=DARK_MAX+LM) return 'a blend reads as a trait outline';
    if(cheb(c,WHITE)<=HALO+BM) return 'a blend is peeled as background';
    if(sat(c)<=NEU) return 'a blend is neutral';
  }
  if(cheb(fill,INK)<150) return 'too close to the ink to read as an outline';
  return null;
}
/* nearest collection colour to the fill AND to its blends with the ink */
function nearest(fill){
  let m=Infinity, worst=null;
  const line=[]; for(let i=0;i<=12;i++){ const t=i/12;
    line.push([fill[0]+(INK[0]-fill[0])*t, fill[1]+(INK[1]-fill[1])*t, fill[2]+(INK[2]-fill[2])*t]); }
  for(const c of line) for(const e of pop){ const d=dist(c,e.c); if(d<m){ m=d; worst=e; } }
  return {d:m, worst};
}
const cands=[];
for(let r=0;r<=255;r+=15) for(let g=0;g<=255;g+=15) for(let b=0;b<=255;b+=15){
  const f=[r,g,b];
  if(ok(f)) continue;
  const n=nearest(f);
  cands.push({f, d:n.d, worst:n.worst});
}
cands.sort((a,b)=>b.d-a.d);
const hx=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join('');
console.log('best fills to pair with green #00FF00, ranked by distance from the');
console.log('colours the collection ACTUALLY uses:\n');
console.table(cands.slice(0,10).map(x=>({
  fill:hx(x.f), 'nearest collection colour':+x.d.toFixed(1),
  'which':hx(x.worst.c)+' ('+x.worst.px.toLocaleString()+' px)' })));
console.log('\nfor comparison:');
for(const f of [[0,255,255],[255,0,255],[255,255,0]]){
  const why=ok(f); const n=why?null:nearest(f);
  console.log('  '+hx(f)+' -> '+(why?('INVALID: '+why):(n.d.toFixed(1)+' from '+hx(n.worst.c)+' ('+n.worst.px.toLocaleString()+' px)')));
}
