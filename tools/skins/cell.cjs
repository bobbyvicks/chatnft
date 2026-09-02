const {decode}=require('./png.cjs');
const DIR='E:/X content/pixel art_/traits/skins/approved';
const lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;
function single(im){
  const {width:w,data:d}=im, out=[];
  for(let y=260;y<1100;y+=2){
    let run=0;
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const dark=d[i+3]>=128 && lum(d[i],d[i+1],d[i+2])<60;
      if(dark) run++; else { if(run>=10&&run<=25) out.push(run); run=0; }
    }
  }
  return out;
}
console.log('Mean width of a ONE-cell outline run (runs of 10-25px only, so two-cell');
console.log('corners are excluded). That mean IS the cell size in file pixels.\n');
const rows=[];
for(const f of ['light','gold','degods-radiation','solana-hue','tanned','mad-lads-galaxy']){
  const im=decode(DIR+'/'+f+'.png');
  const r=single(im);
  const mean=r.reduce((a,b)=>a+b,0)/r.length;
  const cells=im.width/mean;
  rows.push({ skin:f, samples:r.length, 'mean cell px':+mean.toFixed(3),
    'implied cells':+cells.toFixed(2),
    'nearest whole':Math.round(cells),
    'exact size for that':Math.round(cells)+' x '+Math.round(mean)+' = '+(Math.round(cells)*Math.round(mean)) });
}
console.table(rows);
const cands=[74,75,76,77,78,79,80,81,82,83,84];
console.log('\nif the grid were N cells, the cell size in a 1254px file would be:');
console.log('  '+cands.map(n=>n+':'+(1254/n).toFixed(3)).join('   '));
console.log('\nand a clean export for each N (at 16x and 17x):');
console.log('  '+cands.map(n=>n+' -> '+(n*16)+' or '+(n*17)).join('   '));
