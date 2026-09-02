const {decode}=require('./png.cjs');
const fs=require('fs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
const files=fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)).sort();
console.log('stripBackground bails out when more than 2% of the image has alpha < 250');
console.log('(index.html:1642-1643) - and then NOTHING is stripped and the halo stays.\n');
const rows=[];
for(const f of files){
  const im=decode(DIR+'/'+f);
  const N=im.width*im.height;
  let a0=0,lo=0,band=0,full=0;
  for(let p=0;p<N;p++){ const a=im.data[p*4+3];
    if(a===0) a0++;
    else if(a<250) lo++;
    else if(a<255) band++;
    else full++; }
  const semiPct=lo/N*100;
  rows.push({ skin:f.replace(/\.png$/,''),
    clear:a0, 'alpha 1-249':lo, 'alpha 250-254':band, 'alpha 255':full,
    'semi %':+semiPct.toFixed(2), 'strip bails?':semiPct>2 ? 'YES - no stripping' : 'no' });
}
console.table(rows);
