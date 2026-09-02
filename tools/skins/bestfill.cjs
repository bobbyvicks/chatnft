const {decode}=require('./png.cjs');
const fs=require('fs'), path=require('path');
const ROOT='E:/X content/pixel art_';
/* the real collection, as colours with pixel counts, excluding my own base files */
const files=[];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){ if(!/rejected|wip|previews|backups/i.test(e.name)) walk(p); }
  else if(/\.png$/i.test(e.name) && !p.includes('base')) files.push(p);
} })(path.join(ROOT,'traits'));
const pal=new Map();
for(const f of files){ let im; try{ im=decode(f); }catch(e){ continue; }
  for(let p=0;p<im.width*im.height;p++){ const i=p*4; if(im.data[i+3]<128) continue;
    const k=(im.data[i]<<16)|(im.data[i+1]<<8)|im.data[i+2]; pal.set(k,(pal.get(k)||0)+1); } }
/* quantise the collection palette to /8 before searching: 20k near-identical
   shades make the inner loop 20k long and change no answer */
const qq=new Map();
for(const [k,n] of pal){ if(n<20) continue;
  const c=[(k>>16)&255,(k>>8)&255,k&255];
  const kk=[c[0]>>3,c[1]>>3,c[2]>>3].join(",");
  const cur=qq.get(kk); if(cur) cur.n+=n; else qq.set(kk,{c,n}); }
const real=[...qq.values()];
console.log(files.length+' trait files, '+real.length+' colours used on 20+ pixels\n');

const lum=c=>0.299*c[0]+0.587*c[1]+0.114*c[2];
const cheb=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
const sat=c=>Math.max(...c)-Math.min(...c);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const W=[255,255,255], INK=[0,255,0];
const near=c=>{ let m=Infinity,w=null; for(const e of real){ const d=dist(c,e.c); if(d<m){m=d;w=e;} } return {d:m,w}; };
function pairOK(f){
  if(cheb(f,INK)<150) return false;
  for(let t=0;t<=24;t++){ const u=t/24;
    const c=[f[0]+(INK[0]-f[0])*u, f[1]+(INK[1]-f[1])*u, f[2]+(INK[2]-f[2])*u];
    if(lum(c)<=130||cheb(c,W)<=170||sat(c)<=18) return false; }
  return true;
}
const cands=[];
for(let r=0;r<=255;r+=15) for(let g=0;g<=255;g+=15) for(let b=0;b<=255;b+=15){
  const f=[r,g,b];
  if(!pairOK(f)) continue;
  /* the whole blend line must stay clear, not just the endpoint */
  let worst=Infinity, ww=null;
  for(let t=0;t<=10;t++){ const u=t/10;
    const c=[f[0]+(INK[0]-f[0])*u, f[1]+(INK[1]-f[1])*u, f[2]+(INK[2]-f[2])*u];
    const n=near(c); if(n.d<worst){ worst=n.d; ww=n.w; } }
  cands.push({f,d:worst,w:ww});
}
cands.sort((a,b)=>b.d-a.d);
const hx=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join('');
const div=[]; for(const p of cands){ if(div.some(q=>dist(q.f,p.f)<60)) continue; div.push(p); if(div.length>=6) break; }
console.log('best fills to pair with green ink #00FF00, whole blend line measured\n');
console.table(div.map(p=>({ fill:hx(p.f), 'fill lum':+lum(p.f).toFixed(0),
  'separation from ink':cheb(p.f,INK),
  'nearest real colour on the line':+p.d.toFixed(1),
  which:hx(p.w.c)+' ('+p.w.n.toLocaleString()+' px)' })));
const cy=cands.find(p=>p.f[0]===0&&p.f[1]===255&&p.f[2]===255);
console.log('\ncyan #00FFFF for comparison: '+(cy?cy.d.toFixed(1)+' from '+hx(cy.w.c):'n/a'));
console.log('the ink #00FF00 itself: '+near(INK).d.toFixed(1)+' from '+hx(near(INK).w.c)+' ('+near(INK).w.n.toLocaleString()+' px)');
