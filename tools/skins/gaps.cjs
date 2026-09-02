const {decode}=require('./png.cjs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
/* Every position where the colour changes along a row. The gaps between
   consecutive changes are whole numbers of cells, so the smallest common gap is
   one cell. Robust to noise in a way a lattice fit is not, because it never
   assumes where the grid starts. */
function gaps(im,tolNoise){
  const {width:w,height:h,data:d}=im, out=[];
  const near=(i,j)=>Math.abs(d[i]-d[j])<=tolNoise&&Math.abs(d[i+1]-d[j+1])<=tolNoise&&Math.abs(d[i+2]-d[j+2])<=tolNoise;
  for(let y=250;y<1150;y+=2){
    let last=null;
    for(let x=1;x<w;x++){
      const i=(y*w+x)*4, j=(y*w+x-1)*4;
      const a=d[i+3]>=128, b=d[j+3]>=128;
      const change = (a!==b) || (a&&b&&!near(i,j));
      if(change){ if(last!==null){ const g=x-last; if(g>=3&&g<=60) out.push(g); } last=x; }
    }
  }
  return out;
}
const hist=a=>{ const m=new Map(); for(const v of a) m.set(v,(m.get(v)||0)+1);
  return [...m.entries()].sort((x,y)=>y[1]-x[1]); };
console.log('Gaps between colour changes. Noise tolerance 6 per channel, so');
console.log('dithering does not register as a change.\n');
for(const f of ['solana-hue','gold','degods-radiation','light','tanned','dark']){
  const im=decode(DIR+'/'+f+'.png');
  const g=gaps(im,6);
  const H=hist(g), tot=g.length;
  const top=H.slice(0,8);
  console.log(f.padEnd(18)+' '+tot+' gaps   commonest: '
    +top.map(e=>e[0]+'px '+(e[1]/tot*100).toFixed(0)+'%').join('  '));
  /* If one cell is C, gaps cluster on C, 2C, 3C... score each candidate C */
  let best=null;
  for(let C=8;C<=30;C+=0.02){
    let s=0;
    for(const [v,n] of H){ const k=v/C, e=Math.abs(k-Math.round(k)); if(Math.round(k)>=1&&e<0.12) s+=n; }
    if(!best||s>best.s) best={C,s};
  }
  console.log(' '.repeat(18)+' best cell '+best.C.toFixed(2)+'px  ('+(best.s/tot*100).toFixed(0)
    +'% of gaps are whole multiples)  -> '+(im.width/best.C).toFixed(1)+' cells');
}
