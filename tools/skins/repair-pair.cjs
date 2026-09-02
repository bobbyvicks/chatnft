const fs=require('fs');
const P=JSON.parse(fs.readFileSync('real-trait-palette.json','utf8'));
const MINE=new Set(['0,255,255','0,255,0','255,255,255']);
const cl=v=>Math.min(255,Math.round(v/6)*6);
const q=new Map();
for(const {rgb,px} of P){
  if(MINE.has(rgb.join(','))) continue;
  const k=[cl(rgb[0]),cl(rgb[1]),cl(rgb[2])].join(',');
  q.set(k,(q.get(k)||0)+px);
}
const FLOOR=500;
const pop=[...q.entries()].map(([k,px])=>({c:k.split(',').map(Number),px}))
  .filter(e=>e.px>=FLOOR);
console.log(pop.length+' real collection colours (>= '+FLOOR+' px)\n');

const lum=c=>0.299*c[0]+0.587*c[1]+0.114*c[2];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
const sat=c=>Math.max(...c)-Math.min(...c);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const WHITE=[255,255,255];
const DARK_MAX=110,HALO=150,NEU=18,TRACE=150,LM=20,BM=20;

function valid(f,i){
  if(cheb(f,i)<TRACE) return false;
  for(let t=0;t<=24;t++){ const u=t/24;
    const c=[f[0]+(i[0]-f[0])*u, f[1]+(i[1]-f[1])*u, f[2]+(i[2]-f[2])*u];
    if(lum(c)<=DARK_MAX+LM) return false;
    if(cheb(c,WHITE)<=HALO+BM) return false;
    if(sat(c)<=NEU) return false;
  }
  return true;
}
function nearest(f,i){
  let m=Infinity,w=null;
  for(let t=0;t<=10;t++){ const u=t/10;
    const c=[f[0]+(i[0]-f[0])*u, f[1]+(i[1]-f[1])*u, f[2]+(i[2]-f[2])*u];
    for(const e of pop){ const d=dist(c,e.c); if(d<m){ m=d; w=e; } } }
  return {d:m,w};
}
/* endpoints that are individually viable, then every pair of them */
const ends=[];
for(let r=0;r<=255;r+=15) for(let g=0;g<=255;g+=15) for(let b=0;b<=255;b+=15){
  const c=[r,g,b];
  if(lum(c)>DARK_MAX+LM && cheb(c,WHITE)>HALO+BM && sat(c)>NEU) ends.push(c);
}
const out=[];
for(let a=0;a<ends.length;a++) for(let b=a+1;b<ends.length;b++){
  if(!valid(ends[a],ends[b])) continue;
  const n=nearest(ends[a],ends[b]);
  out.push({f:ends[a], i:ends[b], d:n.d, w:n.w});
}
out.sort((x,y)=>y.d-x.d);
const hx=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join('');
/* keep the list diverse rather than 12 shades of one answer */
const div=[];
for(const p of out){
  if(div.some(q2=>Math.min(dist(q2.f,p.f)+dist(q2.i,p.i), dist(q2.f,p.i)+dist(q2.i,p.f))<100)) continue;
  div.push(p); if(div.length>=8) break;
}
console.log(out.length+' valid pairs. Best, ranked by distance from real collection colours:\n');
console.table(div.map(p=>({
  fill:hx(p.f), ink:hx(p.i),
  'inkLum':+lum(p.i).toFixed(0), 'fillLum':+lum(p.f).toFixed(0),
  'nearest real colour':+p.d.toFixed(1),
  'which':hx(p.w.c)+' ('+p.w.px.toLocaleString()+' px)' })));
console.log('\nwhat is currently shipped:');
for(const [f,i,lab] of [[[0,255,255],[0,255,0],'cyan / green (current)'],
                        [[0,255,0],[255,0,255],'green / magenta (before that)']]){
  if(!valid(f,i)){ console.log('  '+lab+': INVALID against the structural rules'); continue; }
  const n=nearest(f,i);
  console.log('  '+lab+': nearest real colour '+n.d.toFixed(1)+' ('+hx(n.w.c)+', '+n.w.px.toLocaleString()+' px)');
}
