const {decode}=require('./png.cjs');
const fs=require('fs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
const files=fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)).sort();

/* How many colours does the art really use, versus how many are in the file?
   Rounding each channel to the nearest N collapses colours that differ only by
   dithering or compression noise. If the count barely moves, the colours are
   real; if it collapses, the file is carrying noise the artist never drew. */
function count(im,step){
  const s=new Set();
  for(let p=0;p<im.width*im.height;p++){
    const i=p*4; if(im.data[i+3]<128) continue;
    s.add((Math.round(im.data[i]/step)<<16)|(Math.round(im.data[i+1]/step)<<8)|Math.round(im.data[i+2]/step));
  }
  return s.size;
}
const rows=[];
for(const f of files){
  const im=decode(DIR+'/'+f);
  const raw=count(im,1), q4=count(im,4), q8=count(im,8), q16=count(im,16);
  rows.push({ skin:f.replace(/\.png$/,''), 'colours in file':raw,
    'ignoring +-2':q4, 'ignoring +-4':q8, 'ignoring +-8':q16,
    'noise share': +(100-q8/raw*100).toFixed(1)+'%',
    verdict: raw<=64 ? 'clean pixel art' : (q8<=64 ? 'clean art buried in noise' : 'genuinely many colours') });
}
console.log('"colours in file" is every distinct RGB. The rest collapse near-identical');
console.log('shades. A clean 16-colour sprite should barely change across the row.\n');
console.table(rows);
