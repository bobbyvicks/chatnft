const {decode}=require('./png.cjs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
/* For each candidate cell count, try every sub-pixel phase and report the best
   share of colour changes that land within half a pixel of a cell boundary.
   Phase is searched, not assumed, and noise below 6 per channel is ignored. */
function changes(im){
  const {width:w,height:h,data:d}=im, xs=[], ys=[];
  const diff=(i,j)=>Math.abs(d[i]-d[j])>6||Math.abs(d[i+1]-d[j+1])>6||Math.abs(d[i+2]-d[j+2])>6;
  for(let y=250;y<1150;y+=2) for(let x=1;x<w;x++){
    const i=(y*w+x)*4,j=(y*w+x-1)*4, a=d[i+3]>=128,b=d[j+3]>=128;
    if((a!==b)||(a&&b&&diff(i,j))) xs.push(x);
  }
  for(let x=250;x<w-150;x+=2) for(let y=1;y<h;y++){
    const i=(y*w+x)*4,j=((y-1)*w+x)*4, a=d[i+3]>=128,b=d[j+3]>=128;
    if((a!==b)||(a&&b&&diff(i,j))) ys.push(y);
  }
  return {xs,ys};
}
function score(pos,span,N){
  const B=span/N; let best=0;
  for(let ph=0;ph<B;ph+=0.05){
    let hit=0;
    for(const p of pos){ const k=(p-ph)/B; if(Math.abs(k-Math.round(k))*B<=0.75) hit++; }
    if(hit>best) best=hit;
  }
  return best/pos.length;
}
const CANDS=[64,76,77,80,82,83,84,85,88,96];
console.log('share of colour changes landing on a cell boundary, best phase:\n');
const rows=[];
for(const f of ['solana-hue','gold','light','tanned']){
  const im=decode(DIR+'/'+f+'.png');
  const {xs,ys}=changes(im);
  const r={skin:f};
  for(const N of CANDS) r[N]=+(((score(xs,im.width,N)+score(ys,im.height,N))/2)*100).toFixed(1);
  rows.push(r);
}
console.table(rows);
/* a control: the same test on art with a KNOWN 83 grid must pick 83 */
function synth(px,cells){
  const d=new Uint8ClampedArray(px*px*4), S=px/cells;
  for(let y=0;y<px;y++) for(let x=0;x<px;x++){
    const c=(Math.floor(y/S)*7+Math.floor(x/S)*13)%5, i=(y*px+x)*4;
    d[i]=30+c*50; d[i+1]=60+c*35; d[i+2]=90+c*25; d[i+3]=255;
  }
  return {width:px,height:px,data:d};
}
const c=synth(1254,83), {xs,ys}=changes(c);
const sc=CANDS.map(N=>[N,+(((score(xs,1254,N)+score(ys,1254,N))/2)*100).toFixed(1)]);
sc.sort((a,b)=>b[1]-a[1]);
console.log('CONTROL, a synthetic 83-cell image at 1254px: best is '+sc[0][0]
  +' at '+sc[0][1]+'%   '+(sc[0][0]===83?'correct':'*** WRONG ***'));
