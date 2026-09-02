const {decode}=require('./png.cjs');
const fs=require('fs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
const CELLS=83, TOL=24;   /* 24 is the app's own palette-clustering tolerance */
/* How much of each cell is VISIBLY different from the colour the rebuild picks?
   The previous version compared exact RGB, so a cell that is one flat colour
   carrying +-1 noise scored as near-total disagreement - it reported "light
   must be redrawn" while the rendered comparison showed light unchanged. It was
   measuring noise, not lost detail. Within TOL, a shade is the same shade. */
const rows=[];
for(const f of fs.readdirSync(DIR).filter(x=>/\.png$/i.test(x)).sort()){
  const im=decode(DIR+'/'+f);
  const {width:w,height:h,data:d}=im;
  let sum=0,n=0,poor=0;
  for(let cy=0;cy<CELLS;cy++) for(let cx=0;cx<CELLS;cx++){
    const x0=Math.round(cx*w/CELLS), x1=Math.round((cx+1)*w/CELLS);
    const y0=Math.round(cy*h/CELLS), y1=Math.round((cy+1)*h/CELLS);
    const px=[]; const cnt=new Map();
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
      const i=(y*w+x)*4; if(d[i+3]<128) continue;
      px.push(i); const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; cnt.set(k,(cnt.get(k)||0)+1);
    }
    if(px.length<20) continue;
    let bk=0,bn=-1; for(const [k,v] of cnt) if(v>bn){bn=v;bk=k;}
    const C=[(bk>>16)&255,(bk>>8)&255,bk&255];
    let near=0;
    for(const i of px) if(Math.hypot(d[i]-C[0],d[i+1]-C[1],d[i+2]-C[2])<=TOL) near++;
    const cov=near/px.length; sum+=cov; n++; if(cov<0.5) poor++;
  }
  const mean=sum/n;
  rows.push({ skin:f.replace(/\.png$/,''),
    'cell agrees within 24':+(mean*100).toFixed(1)+'%',
    'cells losing over half':poor, 'of':n,
    verdict: mean>0.9 ? 'rebuild is safe' : mean>0.75 ? 'rebuild loses a little' : 'real detail is finer than a cell' });
}
console.table(rows);
