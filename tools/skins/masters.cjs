const {decode}=require('./png.cjs');
const fs=require('fs');
const D='E:/X content/pixel art_/normalized/masters';
const files=fs.readdirSync(D).filter(f=>/\.png$/i.test(f)).sort();
console.log(files.length+' files in normalized/masters\n');
const sizes=new Map(); const rows=[];
for(const f of files){
  let im; try{ im=decode(D+'/'+f); }catch(e){ rows.push({file:f,note:e.message.slice(0,60)}); continue; }
  const k=im.width+'x'+im.height; sizes.set(k,(sizes.get(k)||0)+1);
  const cols=new Set(); let mid=0,full=0,clear=0;
  for(let p=0;p<im.width*im.height;p++){ const a=im.data[p*4+3];
    if(a===0){clear++;continue;} if(a===255)full++; else mid++;
    cols.add((im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2]); }
  if(rows.length<14) rows.push({file:f,size:k,colours:cols.size,'partial alpha':mid,opaque:full});
}
console.table(rows);
console.log('\nall sizes present:');
for(const [k,n] of [...sizes.entries()].sort((a,b)=>b[1]-a[1])) console.log('  '+k+'  x'+n);
