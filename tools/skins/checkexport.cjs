const {decode}=require('./png.cjs');
const P='E:/X content/pixel art_';
const rows=[];
for(const [lab,f] of [
  ['master 160',        P+'/normalized/masters/light.png'],
  ['export 1280',       P+'/normalized/export/light.png'],
  ['base-model-v1 1254',P+'/traits/base/wip/base-model-v1.png'],
  ['greenscreen base',  P+'/traits/base/wip/base-model-greenscreen-v1.png'],
]){
  let im; try{ im=decode(f); }catch(e){ rows.push({file:lab,note:e.message.slice(0,50)}); continue; }
  const cols=new Set(); let mid=0,full=0;
  for(let p=0;p<im.width*im.height;p++){ const a=im.data[p*4+3];
    if(a===0) continue; if(a===255) full++; else mid++;
    cols.add((im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2]); }
  /* the cell size this file implies, if any: every change must sit on it */
  const cell=im.width/160;
  let on=0,off=0;
  if(Number.isInteger(cell)){
    for(let y=100;y<im.height-100;y+=3) for(let x=1;x<im.width;x++){
      const i=(y*im.width+x)*4, j=(y*im.width+x-1)*4;
      const ch=(im.data[i+3]>=128)!==(im.data[j+3]>=128) ||
        (im.data[i+3]>=128&&(im.data[i]!==im.data[j]||im.data[i+1]!==im.data[j+1]||im.data[i+2]!==im.data[j+2]));
      if(ch){ if(x%cell===0) on++; else off++; }
    }
  }
  rows.push({ file:lab, size:im.width+'x'+im.height, colours:cols.size,
    'partial alpha':mid, opaque:full,
    'cell for 160':Number.isInteger(cell)?cell:(+cell.toFixed(4)+'  NOT WHOLE'),
    'changes on grid':Number.isInteger(cell)?(off===0?'all of them':on+' on / '+off+' off'):'n/a' });
}
console.table(rows);
console.log('\nexact export sizes for a 160 grid: '+[6,7,8,9,10,12].map(m=>160*m+' ('+m+'x)').join('   '));
console.log('1024 / 160 = '+(1024/160)+'   <-- the size TRAIT-STORAGE.md specifies for new traits');
