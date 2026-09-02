const {decode}=require('./png.cjs');
const fs=require('fs');
const P='E:/X content/pixel art_';
console.log('=== normalized/export sizes ===');
const ex=fs.readdirSync(P+'/normalized/export').filter(f=>/\.png$/i.test(f));
const sz=new Map();
for(const f of ex.slice(0,60)){ const im=decode(P+'/normalized/export/'+f);
  const k=im.width+'x'+im.height; sz.set(k,(sz.get(k)||0)+1); }
for(const [k,n] of sz) console.log('  '+k+'  x'+n);

console.log('\n=== the 160 master vs the 1254 base, same artwork ===');
const m=decode(P+'/normalized/masters/light.png');
const b=decode(P+'/traits/base/wip/base-model-v1.png');
console.log('  master  '+m.width+'x'+m.height);
console.log('  base    '+b.width+'x'+b.height);
/* Downscale the big one to the master's size by mode and see how well they agree.
   If the master IS the base at native resolution they should agree almost fully. */
function toGrid(im,cells){
  const {width:w,height:h,data:d}=im;
  const out=new Uint8ClampedArray(cells*cells*4);
  for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){
    const x0=Math.round(cx*w/cells),x1=Math.round((cx+1)*w/cells);
    const y0=Math.round(cy*h/cells),y1=Math.round((cy+1)*h/cells);
    const cnt=new Map(); let on=0,tot=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
      const i=(y*w+x)*4; tot++; if(d[i+3]<128) continue; on++;
      const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; cnt.set(k,(cnt.get(k)||0)+1); }
    const p=cy*cells+cx;
    if(on*2<tot||!cnt.size){ out[p*4+3]=0; continue; }
    let bk=0,bn=-1; for(const [k,n] of cnt) if(n>bn){bn=n;bk=k;}
    out[p*4]=(bk>>16)&255; out[p*4+1]=(bk>>8)&255; out[p*4+2]=bk&255; out[p*4+3]=255;
  }
  return out;
}
for(const N of [83,160,166]){
  const g=toGrid(b,N);
  if(N!==m.width) { console.log('  base at '+N+': (master is '+m.width+', not comparable directly)'); continue; }
  let same=0,tot=0,shape=0;
  for(let p=0;p<N*N;p++){
    const a1=g[p*4+3]>=128, a2=m.data[p*4+3]>=128;
    if(a1!==a2) shape++;
    if(!a1||!a2) continue; tot++;
    if(Math.hypot(g[p*4]-m.data[p*4],g[p*4+1]-m.data[p*4+1],g[p*4+2]-m.data[p*4+2])<=24) same++;
  }
  console.log('  base collapsed to '+N+' vs master: '+(same/tot*100).toFixed(1)
    +'% of cells match within 24, silhouette differs by '+shape+' cells');
}
const mc=new Set(); let mid=0;
for(let p=0;p<m.width*m.height;p++){ const a=m.data[p*4+3];
  if(a===0) continue; if(a<255) mid++;
  mc.add((m.data[p*4]<<16)|(m.data[p*4+1]<<8)|m.data[p*4+2]); }
console.log('\n  master light.png: '+mc.size+' colours, '+mid+' partial-alpha pixels');
