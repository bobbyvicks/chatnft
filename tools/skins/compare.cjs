const {decode}=require('./png.cjs');
const {write}=require('./pngwrite.cjs');
const path=require('path');
const OLD='E:/X content/pixel art_/traits/skins/approved';
const NEW=path.join(__dirname,'skins-fixed','export');
const PICK=['gold','light','okay-bears-coral','water','zombie','rainbow'];
const T=300, PAD=8;
const W=PICK.length*(T+PAD)+PAD, H=2*(T+PAD)+PAD;
const out=new Uint8ClampedArray(W*H*4);
for(let p=0;p<W*H;p++){ out[p*4]=24; out[p*4+1]=22; out[p*4+2]=30; out[p*4+3]=255; }
/* nearest-neighbour, so the comparison itself does not soften anything */
function blit(im,ox,oy){
  for(let y=0;y<T;y++) for(let x=0;x<T;x++){
    const sx=Math.floor(x*im.width/T), sy=Math.floor(y*im.height/T);
    const s=(sy*im.width+sx)*4, d=((oy+y)*W+(ox+x))*4;
    const a=im.data[s+3]/255;
    /* over a light ground so a transparent background is visible as light grey */
    out[d]  =im.data[s]  *a+232*(1-a);
    out[d+1]=im.data[s+1]*a+232*(1-a);
    out[d+2]=im.data[s+2]*a+232*(1-a);
    out[d+3]=255;
  }
}
PICK.forEach((n,i)=>{
  blit(decode(path.join(OLD,n+'.png')), PAD+i*(T+PAD), PAD);
  blit(decode(path.join(NEW,n+'.png')), PAD+i*(T+PAD), PAD+T+PAD);
});
write(path.join(__dirname,'skins-before-after.png'),W,H,out);
console.log('top row = as delivered (1254px), bottom row = rebuilt on the 83 grid (1328px)');
console.log('order: '+PICK.join(', '));
console.log('written skins-before-after.png  '+W+'x'+H);
