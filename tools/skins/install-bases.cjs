/* Put the verified bases into the collection as v2.

   Refuses to overwrite anything. v1 is left exactly where it is - it is the
   only record of what the collection shipped with, and a base is the file every
   extraction is measured against, so losing the old one would make it
   impossible to tell later whether a trait was cut against v1 or v2.

   Every file is re-verified AFTER it lands, by reading it back off disk, not by
   trusting that the copy worked.
*/
const fs=require('fs');
const path=require('path');
const {decode}=require('./png.cjs');

const SRC=path.join(__dirname,'bases-fixed');
const DEST='E:/X content/pixel art_/traits/base/approved';
const N=160;

const PLAN=[
  ['base-model-160.png',        'base-model-v2-160.png',        'the artwork itself, one pixel per cell'],
  ['base-model-960.png',        'base-model-v2-960.png',        '6x, whole multiple'],
  ['base-model-1280.png',       'base-model-v2-1280.png',       '8x, whole multiple'],
  ['base-model-1280-white.png', 'base-model-v2-1280-white.png', '8x on white - load THIS as the reference'],
  ['base-model-key-160.png',    'base-model-key-v2-160.png',    'keyed, one pixel per cell'],
  ['base-model-key-1280.png',   'base-model-key-v2-1280.png',   'keyed 8x - send THIS to whoever draws traits'],
];

function inspect(file){
  const im=decode(file);
  const cell=im.width/N;
  const cols=new Set(); let partial=0;
  for(let p=0;p<im.width*im.height;p++){ const a=im.data[p*4+3];
    if(a===0) continue; if(a!==255) partial++;
    cols.add((im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2]); }
  let off=0;
  for(let y=1;y<im.height;y+=3) for(let x=1;x<im.width;x++){
    const i=(y*im.width+x)*4, j=(y*im.width+x-1)*4;
    const ch=(im.data[i+3]>=128)!==(im.data[j+3]>=128) ||
      (im.data[i+3]>=128&&(im.data[i]!==im.data[j]||im.data[i+1]!==im.data[j+1]||im.data[i+2]!==im.data[j+2]));
    if(ch && x%cell!==0) off++;
  }
  return { size:im.width+'x'+im.height, cell, colours:cols.size, partial, off,
    clean: Number.isInteger(cell) && partial===0 && off===0 };
}

/* ---- nothing is copied until every source is verified and every target is free ---- */
const refuse=[];
for(const [from,to] of PLAN){
  const s=path.join(SRC,from);
  if(!fs.existsSync(s)) refuse.push('missing source: '+from);
  else { const r=inspect(s); if(!r.clean) refuse.push(from+' is not clean: '+JSON.stringify(r)); }
  if(fs.existsSync(path.join(DEST,to))) refuse.push('target already exists, will not overwrite: '+to);
}
if(refuse.length){
  console.log('NOTHING WAS COPIED:'); refuse.forEach(r=>console.log('  - '+r)); process.exit(1);
}
fs.mkdirSync(DEST,{recursive:true});

const rows=[];
for(const [from,to,note] of PLAN){
  fs.copyFileSync(path.join(SRC,from), path.join(DEST,to));
  const r=inspect(path.join(DEST,to));          /* read back from where it landed */
  rows.push({ file:to, size:r.size, cell:r.cell, colours:r.colours,
    'semi-transparent':r.partial, 'off-grid':r.off,
    verdict:r.clean?'pixel perfect':'*** NOT CLEAN ***', note });
}
console.log('copied into '+DEST+'\n');
console.table(rows);

const README=`# Base model v2

Built from normalized/masters/light.png, which is the artwork at its native
resolution: 160x160, 17 colours, no semi-transparent pixels.

Nothing here is resampled. Each file is a whole-number nearest-neighbour scale
of that 160x160 master, so no colour, alpha value or edge appears that was not
already in the artwork.

| file | use |
|---|---|
${PLAN.map(([,to,note])=>'| `'+to+'` | '+note+' |').join('\n')}

## Sizes

The grid is 160 cells. Only whole multiples are safe:

  960 (6x)   1120 (7x)   1280 (8x)   1440 (9x)   1600 (10x)   1920 (12x)

1024 is NOT one of them - 1024/160 is 6.4 - and TRAIT-STORAGE.md currently
specifies 1024x1024 for new traits. Traits approved at that size do not land on
the grid. normalized/export already uses 1280.

## What was wrong with v1

traits/base/wip/base-model-v1.png is the same picture at 1254x1254. 1254 is not
a whole multiple of 160 (it gives 7.8375 pixels per cell), and that one fact
produced all of the following, measured:

- 13,882 distinct colours where the artwork has 17
- 576,473 semi-transparent pixels; only 1,085 pixels fully opaque
- colour changes landing between cells rather than on them

base-model-greenscreen-v1.png holds a single colour, so it has no outline and
cannot show the app where the character's own edges are. The v2 keyed file holds
exactly three: white background, cyan body (#00FFFF), green outline (#00FF00).
Those two were chosen by measurement - see tools/key-colours-check.cjs in the
ChatNFT repo. Green and magenta, the obvious choice, is wrong: being
complementary, their anti-aliased blend passes through mid grey, which is a
colour traits actually use.

v1 is deliberately left in place. It is the record of what the collection
shipped with, and a base is what every extraction is measured against.
`;
fs.writeFileSync(path.join(DEST,'README.md'),README);
console.log('\nalso wrote README.md alongside them');
if(rows.some(r=>r.verdict!=='pixel perfect')) process.exit(1);
