const {decode}=require('./png.cjs');
const fs=require('fs'), path=require('path');
const OUT=path.join(__dirname,'skins-fixed');

/* --- control: can the silhouette repair actually repair? --- */
const src=fs.readFileSync('fix-skins.cjs','utf8');
const conformSrc=src.slice(src.indexOf('function conform('), src.indexOf('function upscale('));
const conform=new Function(conformSrc+'; return conform;')();
const N=9;
const g={ data:new Uint8ClampedArray(N*N*4), solid:new Uint8Array(N*N) };
const want=new Uint8Array(N*N);
for(let p=0;p<N*N;p++){ want[p]=1; }                 /* want everything */
for(let p=0;p<N*N;p++){                              /* have only the top half */
  if(p<N*4){ g.solid[p]=1; g.data[p*4]=200; g.data[p*4+1]=30; g.data[p*4+2]=30; g.data[p*4+3]=255; }
}
g.solid[N*N-1]=1; g.data[(N*N-1)*4+3]=255;           /* one stray outside... */
want[N*N-1]=0;                                        /* ...that must be dropped */
const r=conform(g,want,N);
const filled=g.solid.reduce((a,b)=>a+b,0);
console.log('CONTROL of the silhouette repair on a 9x9 stand-in:');
console.log('  wanted '+want.reduce((a,b)=>a+b,0)+' cells, started with '+(N*4+1));
console.log('  added '+r.added+', dropped '+r.removed+', ends with '+filled+' solid cells');
const ok = r.added===(N*N-1)-(N*4) && r.removed===1 && filled===N*N-1
  && g.data[(N*N-1)*4+3]===0;
console.log('  '+(ok?'PASS - it fills what is missing and drops what is outside'
                 :'FAIL - the repair does not work, so "0 added, 0 dropped" meant nothing'));
if(!ok) process.exit(1);

/* --- the fixed files --- */
console.log('\nthe rebuilt exports:');
const files=fs.readdirSync(path.join(OUT,'export')).filter(f=>/\.png$/.test(f)).sort();
const rows=[];
for(const f of files){
  const im=decode(path.join(OUT,'export',f));
  let a0=0,a255=0,mid=0; const cols=new Set();
  for(let p=0;p<im.width*im.height;p++){ const a=im.data[p*4+3];
    if(a===0){a0++;continue;} if(a===255)a255++; else mid++;
    cols.add((im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2]); }
  /* every colour change must land on a 16px boundary now */
  let onGrid=0, off=0;
  for(let y=200;y<im.height-200;y+=3) for(let x=1;x<im.width;x++){
    const i=(y*im.width+x)*4, j=(y*im.width+x-1)*4;
    const ch=(im.data[i+3]>=128)!==(im.data[j+3]>=128) ||
      (im.data[i+3]>=128&&(im.data[i]!==im.data[j]||im.data[i+1]!==im.data[j+1]||im.data[i+2]!==im.data[j+2]));
    if(ch){ if(x%16===0) onGrid++; else off++; }
  }
  rows.push({ skin:f.replace(/\.png$/,''), size:im.width+'x'+im.height, colours:cols.size,
    'partial alpha':mid, 'changes on grid':onGrid, 'changes OFF grid':off,
    'on-grid %':+(onGrid/(onGrid+off)*100).toFixed(1) });
}
console.table(rows);
