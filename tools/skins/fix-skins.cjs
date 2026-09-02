/* Rebuild the skins on the grid they were drawn on.

   Every problem measured in these files is the same problem wearing different
   clothes: the artwork is 83 cells, the file is 1254 pixels, and 1254/83 is
   15.108 - so nothing lands where it should and everything between cells is
   noise. Collapsing each cell to one colour fixes the lot at once: the colour
   count, the off-grid detail, the alpha, and the silhouette.

   The operator is the MODE - the colour that appears most often in the cell -
   not a mean or a median. A mean invents colours that were never there, and the
   app's own recover() takes each channel's median independently, which can also
   emit a triple that appears nowhere in the source. The mode can only ever
   return a colour the artist actually used.

   Nothing is written over the originals. Output goes to a separate folder.

   Usage: node fix-skins.cjs [outDir]
*/
const fs=require('fs');
const path=require('path');
const {decode}=require('./png.cjs');
const {write}=require('./pngwrite.cjs');

const DIR='E:/X content/pixel art_/traits/skins/approved';
const OUT=process.argv[2]||path.join(__dirname,'skins-fixed');
const CELLS=83;
const SCALE=16;                 /* 83 x 16 = 1328, an exact multiple */

fs.mkdirSync(OUT,{recursive:true});
fs.mkdirSync(path.join(OUT,'grid'),{recursive:true});
fs.mkdirSync(path.join(OUT,'export'),{recursive:true});

/* One cell -> one colour, by mode, plus whether the cell is part of the figure. */
function toGrid(im,cells){
  const {width:w,height:h,data:d}=im;
  const out=new Uint8ClampedArray(cells*cells*4);
  const solid=new Uint8Array(cells*cells);
  for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){
    const x0=Math.round(cx*w/cells), x1=Math.round((cx+1)*w/cells);
    const y0=Math.round(cy*h/cells), y1=Math.round((cy+1)*h/cells);
    const cnt=new Map(); let on=0, tot=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
      const i=(y*w+x)*4; tot++;
      if(d[i+3]<128) continue;
      on++;
      const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
      cnt.set(k,(cnt.get(k)||0)+1);
    }
    const p=cy*cells+cx;
    if(on*2<tot || !cnt.size){ out[p*4+3]=0; continue; }
    let bk=0,bn=-1;
    for(const [k,n] of cnt) if(n>bn){ bn=n; bk=k; }
    out[p*4]=(bk>>16)&255; out[p*4+1]=(bk>>8)&255; out[p*4+2]=bk&255; out[p*4+3]=255;
    solid[p]=1;
  }
  return {data:out, solid};
}

/* The silhouette every skin must share. Taken from the six that already agree
   pixel for pixel, so it is the collection's own shape and not something new. */
function canonical(){
  const im=decode(path.join(DIR,'light.png'));
  return toGrid(im,CELLS).solid;
}

/* Cells the skin is missing get the colour of the nearest cell it does have,
   rather than a guess. Cells outside the shared silhouette are dropped. */
function conform(g,want,cells){
  let added=0, removed=0;
  const have=[];
  for(let p=0;p<cells*cells;p++) if(g.solid[p]) have.push(p);
  for(let p=0;p<cells*cells;p++){
    if(want[p]&&!g.solid[p]){
      const x=p%cells, y=(p/cells)|0;
      let bd=Infinity, bq=-1;
      for(const q of have){ const qx=q%cells, qy=(q/cells)|0;
        const dd=(qx-x)*(qx-x)+(qy-y)*(qy-y);
        if(dd<bd){ bd=dd; bq=q; } }
      if(bq>=0){ g.data[p*4]=g.data[bq*4]; g.data[p*4+1]=g.data[bq*4+1];
        g.data[p*4+2]=g.data[bq*4+2]; g.data[p*4+3]=255; g.solid[p]=1; added++; }
    } else if(!want[p]&&g.solid[p]){
      g.data[p*4+3]=0; g.solid[p]=0; removed++;
    }
  }
  return {added,removed};
}

function upscale(src,cells,n){
  const w=cells*n, out=new Uint8ClampedArray(w*w*4);
  for(let y=0;y<w;y++) for(let x=0;x<w;x++){
    const s=(((y/n)|0)*cells+((x/n)|0))*4, d=(y*w+x)*4;
    out[d]=src[s]; out[d+1]=src[s+1]; out[d+2]=src[s+2]; out[d+3]=src[s+3];
  }
  return out;
}
const colours=(a,n)=>{ const s=new Set();
  for(let p=0;p<n;p++) if(a[p*4+3]>=128) s.add((a[p*4]<<16)|(a[p*4+1]<<8)|a[p*4+2]);
  return s.size; };

const want=canonical();
const files=fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)).sort();
const rows=[];
for(const f of files){
  const im=decode(path.join(DIR,f));
  const before=colours(im.data,im.width*im.height);
  const g=toGrid(im,CELLS);
  const beforeCells=g.solid.reduce((a,b)=>a+b,0);
  const {added,removed}=conform(g,want,CELLS);
  const after=colours(g.data,CELLS*CELLS);
  const name=f.replace(/\.png$/,'');
  write(path.join(OUT,'grid',name+'.png'),CELLS,CELLS,g.data);
  const big=upscale(g.data,CELLS,SCALE);
  write(path.join(OUT,'export',name+'.png'),CELLS*SCALE,CELLS*SCALE,big);
  /* what did the collapse cost? how many cells were NOT a clear majority */
  rows.push({ skin:name, 'colours before':before, 'colours after':after,
    'cells drawn':beforeCells, 'cells added':added, 'cells dropped':removed });
}
console.log('rebuilt on '+CELLS+'x'+CELLS+', exported at '+(CELLS*SCALE)+'px ('+SCALE+'x)');
console.log('written to '+OUT+'\n');
console.table(rows);
