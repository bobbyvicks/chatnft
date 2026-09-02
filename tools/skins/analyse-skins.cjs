/* Measure the finished skins. Every grid figure comes from the app's OWN
   transitions()/period(), carved out of index.html, so what is reported here is
   what the app will actually see when these files are loaded. */
const fs=require('fs');
const path=require('path');
const {decode}=require('./png.cjs');

const APP='C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const S=fs.readFileSync(APP,'utf8').match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
function carve(sig){ const a=S.indexOf(sig); if(a<0) throw new Error('cannot find '+sig);
  let i=S.indexOf('{',a),d=0; for(;i<S.length;i++){ if(S[i]==='{')d++; else if(S[i]==='}'){d--; if(!d) return S.slice(a,i+1);} }
  throw new Error('unbalanced '+sig); }
let src='';
for(const g of ['function transitions(','function strength(','function period(','function palette(']) src+=carve(g)+'\n';
const API=new Function(src+'\nreturn {transitions,period,palette};')();

const DIR=process.argv[2]||'E:/X content/pixel art_/traits/skins/approved';
const files=fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)).sort();

const key=(d,i)=>(d[i]<<16)|(d[i+1]<<8)|d[i+2];
const hx=(d,i)=>'#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();

function facts(im){
  const {width:w,height:h,data:d}=im;
  const cols=new Map(); let partialAlpha=0, fullyClear=0, opaque=0;
  for(let p=0;p<w*h;p++){
    const i=p*4, a=d[i+3];
    if(a===0){ fullyClear++; continue; }
    if(a<255) partialAlpha++;
    opaque++;
    const k=key(d,i); cols.set(k,(cols.get(k)||0)+1);
  }
  /* what the app treats as background: the four corners */
  const corners=[0,(w-1)*4,(h-1)*w*4,((h-1)*w+w-1)*4].map(i=>hx(d,i));
  const bgUniform=new Set(corners).size===1;

  /* the grid, measured the way the app measures it */
  const t=API.transitions(d,w,h);
  const px=API.period(t.x.p,t.x.q,w), py=API.period(t.y.p,t.y.q,h);
  const B=px?px.B:(py?py.B:null);
  const cells=B?w/B:null;

  return { w,h, colours:cols.size, opaque, partialAlpha, fullyClear,
    corner:corners[0], bgUniform,
    blockX:px?+px.B.toFixed(3):null, confX:px?+(px.R*100).toFixed(0):null,
    blockY:py?+py.B.toFixed(3):null, confY:py?+(py.R*100).toFixed(0):null,
    impliedCells:cells?Math.round(cells):null,
    cols };
}

/* Of the cells implied by the measured block, how many are one flat colour?
   This is the number that says "pixel art" or "a picture of pixel art". */
function flatCells(im,cells){
  const {width:w,data:d}=im, Sc=w/cells;
  let flat=0,total=0;
  for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){
    const x0=Math.floor(cx*Sc), x1=Math.max(x0,Math.ceil((cx+1)*Sc)-1);
    const y0=Math.floor(cy*Sc), y1=Math.max(y0,Math.ceil((cy+1)*Sc)-1);
    let first=null, uni=true, any=false;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      const i=(y*w+x)*4; if(d[i+3]<128) continue;
      any=true; const k=key(d,i);
      if(first===null) first=k; else if(k!==first) uni=false;
    }
    if(!any) continue; total++; if(uni) flat++;
  }
  return total?+(flat/total*100).toFixed(1):null;
}

/* The silhouette: everything that is not the background colour. Two skins that
   are the same character must have the same one, or traits will not line up. */
function silhouette(im){
  const {width:w,height:h,data:d}=im;
  const bg=[d[0],d[1],d[2]];
  const m=new Uint8Array(w*h);
  let n=0, minX=w, maxX=-1, minY=h, maxY=-1;
  for(let p=0;p<w*h;p++){
    const i=p*4;
    const off = d[i+3]<128 ? false
      : (Math.abs(d[i]-bg[0])>26 || Math.abs(d[i+1]-bg[1])>26 || Math.abs(d[i+2]-bg[2])>26);
    if(off){ m[p]=1; n++; const x=p%w, y=(p/w)|0;
      if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  return { mask:m, n, box:[minX,minY,maxX,maxY] };
}

const rows=[], loaded={};
for(const f of files){
  let im;
  try{ im=decode(path.join(DIR,f)); }
  catch(e){ rows.push({ skin:f, note:'COULD NOT READ: '+e.message }); continue; }
  loaded[f]=im;
  const F=facts(im);
  const flat=F.impliedCells?flatCells(im,F.impliedCells):null;
  rows.push({ skin:f.replace(/\.png$/,''), size:F.w+'x'+F.h, colours:F.colours,
    block:F.blockX!==null?F.blockX:'-', conf:F.confX!==null?F.confX+'%':'-',
    cells:F.impliedCells||'-', flatCellsPct:flat===null?'-':flat,
    softAlpha:F.partialAlpha, bg:F.corner, bgSame:F.bgUniform });
}
console.log('reading from '+DIR+'\n');
console.table(rows);

/* ---- do they all share one silhouette? ---- */
const names=Object.keys(loaded);
if(names.length){
  const sizes=new Set(names.map(n=>loaded[n].width+'x'+loaded[n].height));
  console.log('\ndistinct canvas sizes: '+[...sizes].join(', ')
    +(sizes.size===1?'   (all the same - good)':'   *** NOT ALL THE SAME ***'));
  const ref=names.includes('light.png')?'light.png':names[0];
  const R=silhouette(loaded[ref]);
  const cmp=[];
  for(const n of names){
    if(loaded[n].width!==loaded[ref].width||loaded[n].height!==loaded[ref].height){
      cmp.push({ skin:n.replace(/\.png$/,''), note:'different canvas size, not comparable' }); continue; }
    const A=silhouette(loaded[n]);
    let diff=0; for(let p=0;p<A.mask.length;p++) if(A.mask[p]!==R.mask[p]) diff++;
    cmp.push({ skin:n.replace(/\.png$/,''), pixels:A.n,
      vsRef:diff, pctOff:+(diff/Math.max(1,R.n)*100).toFixed(2),
      box:A.box.join(',') });
  }
  console.log('\nsilhouette compared against '+ref+' (how many pixels differ):');
  console.table(cmp);
}
