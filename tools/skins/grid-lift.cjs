const {decode}=require('./png.cjs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
const TOL=0.75;
/* Raw "share on a boundary" is meaningless without chance. With a tolerance of
   +-TOL px, a cell of B px catches 2*TOL/B of ALL positions by luck - so a 2px
   cell scores 75% on random noise and always "wins". LIFT is the score divided
   by that chance rate: 1.0 means no better than random, higher means real. */
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
function raw(pos,span,N){
  const B=span/N; let best=0;
  for(let ph=0;ph<B;ph+=0.05){
    let hit=0;
    for(const p of pos){ const k=(p-ph)/B; if(Math.abs(k-Math.round(k))*B<=TOL) hit++; }
    if(hit>best) best=hit;
  }
  return best/pos.length;
}
function lift(im,N){
  const {xs,ys}=changes(im), B=im.width/N;
  const chance=Math.min(1,(2*TOL+1)/B);
  return ((raw(xs,im.width,N)+raw(ys,im.height,N))/2)/chance;
}
const CANDS=[64,80,83,100,120,160,166,209,249,332,418,627];
/* CONTROLS first: art with a grid we know, and pure noise which must score ~1 */
function synth(px,cells,noisy){
  const d=new Uint8ClampedArray(px*px*4), S=px/cells;
  let seed=3; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
  for(let y=0;y<px;y++) for(let x=0;x<px;x++){
    const i=(y*px+x)*4;
    if(noisy){ d[i]=rnd()*255; d[i+1]=rnd()*255; d[i+2]=rnd()*255; }
    else { const c=(Math.floor(y/S)*7+Math.floor(x/S)*13)%5;
      d[i]=30+c*50; d[i+1]=60+c*35; d[i+2]=90+c*25; }
    d[i+3]=255;
  }
  return {width:px,height:px,data:d};
}
const pick=im=>{ let bN=null,bV=-1; for(const N of CANDS){ const v=lift(im,N); if(v>bV){bV=v;bN=N;} } return {N:bN,v:bV}; };
console.log('CONTROLS');
for(const [lab,im,want] of [['a real 83 grid',synth(1254,83,false),83],
                            ['a real 166 grid',synth(1254,166,false),166],
                            ['pure noise, no grid',synth(1254,83,true),null]]){
  const r=pick(im);
  console.log('  '+lab.padEnd(22)+' picks '+String(r.N).padStart(3)+'  lift '+r.v.toFixed(2)
    +(want===null?(r.v<1.3?'   correctly finds nothing convincing':'   *** claims a grid in noise ***')
                 :(r.N===want?'   correct':'   *** WRONG ***')));
}
console.log('\nthe skins, lift over chance (1.0 = no better than random):\n');
const rows=[];
for(const f of ['solana-hue','gold','degods-radiation','light','tanned','dark','mad-lads-galaxy']){
  const im=decode(DIR+'/'+f+'.png');
  const r={skin:f};
  for(const N of CANDS) r[N]=+lift(im,N).toFixed(2);
  r.best=pick(im).N; rows.push(r);
}
console.table(rows);
