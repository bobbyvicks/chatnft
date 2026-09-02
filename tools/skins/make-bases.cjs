/* Build the base model, pixel perfect, from the one file that already is.

   normalized/masters/light.png is 160x160, 17 colours, zero semi-transparent
   pixels, every colour change on a cell boundary. That is the artwork. The
   files in traits/base/wip are the same picture at 1254px carrying 13,882
   colours and 576,473 semi-transparent pixels, on a cell of 7.8375 - and 1254
   is not a whole multiple of 160, which is where all of that came from.

   So nothing here resamples anything. The 160 master is copied out as it is and
   scaled by whole numbers with nearest-neighbour, which cannot introduce a
   colour, an alpha value, or an edge that was not already there.

   Also written: the keyed base, for the Make key workflow, using the colours
   measured in tools/key-colours-check.cjs - cyan body, green outline. The old
   greenscreen base holds ONE colour, so it has no outline at all and cannot
   tell the app where the character's own edges are.
*/
const fs=require('fs');
const path=require('path');
const {decode}=require('./png.cjs');
const {write}=require('./pngwrite.cjs');

const MASTER='E:/X content/pixel art_/normalized/masters/light.png';
const OUT=process.argv[2]||path.join(__dirname,'bases-fixed');
fs.mkdirSync(OUT,{recursive:true});

const KEY_FILL=[0,255,255], KEY_INK=[0,255,0];   /* cyan body, green outline */
const DARK_MAX=110;
const lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;

const m=decode(MASTER);
const N=m.width;
if(m.width!==m.height) throw new Error('the master is not square: '+m.width+'x'+m.height);

/* ---- the master must be what it is claimed to be, before anything uses it ---- */
(function(){
  let partial=0; const cols=new Set();
  for(let p=0;p<N*N;p++){ const a=m.data[p*4+3];
    if(a===0) continue;
    if(a!==255) partial++;
    cols.add((m.data[p*4]<<16)|(m.data[p*4+1]<<8)|m.data[p*4+2]); }
  if(partial) throw new Error('the master has '+partial+' semi-transparent pixels; it is not clean');
  console.log('master  '+N+'x'+N+'  '+cols.size+' colours, no semi-transparent pixels');
})();

const scaleBy=(src,n)=>{
  const w=N*n, out=new Uint8ClampedArray(w*w*4);
  for(let y=0;y<w;y++) for(let x=0;x<w;x++){
    const s=((((y/n)|0)*N)+((x/n)|0))*4, d=(y*w+x)*4;
    out[d]=src[s]; out[d+1]=src[s+1]; out[d+2]=src[s+2]; out[d+3]=src[s+3];
  }
  return out;
};
/* A reference wants a real background, not a transparent one: stripBackground
   floods from the corners comparing RGB and ignoring alpha, and the RGB under a
   transparent pixel here is 0,0,0 - the same as the outline. Flat white cannot
   be confused with anything in the artwork. */
const onWhite=src=>{
  const out=new Uint8ClampedArray(src.length);
  for(let p=0;p<src.length/4;p++){
    const i=p*4;
    if(src[i+3]<128){ out[i]=out[i+1]=out[i+2]=255; }
    else { out[i]=src[i]; out[i+1]=src[i+1]; out[i+2]=src[i+2]; }
    out[i+3]=255;
  }
  return out;
};
const keyed=src=>{
  const out=new Uint8ClampedArray(src.length);
  for(let p=0;p<src.length/4;p++){
    const i=p*4;
    if(src[i+3]<128){ out[i]=out[i+1]=out[i+2]=255; out[i+3]=255; continue; }
    const c = lum(src[i],src[i+1],src[i+2])<=DARK_MAX ? KEY_INK : KEY_FILL;
    out[i]=c[0]; out[i+1]=c[1]; out[i+2]=c[2]; out[i+3]=255;
  }
  return out;
};

const made=[];
function emit(name,data,w){ write(path.join(OUT,name),w,w,data); made.push({name,w,data}); }

emit('base-model-'+N+'.png', m.data, N);                       /* as the artwork is */
emit('base-model-'+N+'-white.png', onWhite(m.data), N);
emit('base-model-key-'+N+'.png', keyed(m.data), N);
for(const k of [6,8]){
  emit('base-model-'+(N*k)+'.png', scaleBy(m.data,k), N*k);
  emit('base-model-'+(N*k)+'-white.png', scaleBy(onWhite(m.data),k), N*k);
  emit('base-model-key-'+(N*k)+'.png', scaleBy(keyed(m.data),k), N*k);
}

/* ---- check every file that was written, by reading it back off disk ---- */
console.log('\nwritten to '+OUT+', then read back and checked:\n');
const rows=[];
for(const f of made){
  const im=decode(path.join(OUT,f.name));
  const cell=im.width/N;
  const cols=new Set(); let partial=0;
  for(let p=0;p<im.width*im.height;p++){ const a=im.data[p*4+3];
    if(a===0) continue; if(a!==255) partial++;
    cols.add((im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2]); }
  let off=0,on=0;
  for(let y=1;y<im.height;y+=3) for(let x=1;x<im.width;x++){
    const i=(y*im.width+x)*4, j=(y*im.width+x-1)*4;
    const ch=(im.data[i+3]>=128)!==(im.data[j+3]>=128) ||
      (im.data[i+3]>=128&&(im.data[i]!==im.data[j]||im.data[i+1]!==im.data[j+1]||im.data[i+2]!==im.data[j+2]));
    if(ch){ if(x%cell===0) on++; else off++; }
  }
  const problems=[];
  if(!Number.isInteger(cell)) problems.push('cell size is not whole');
  if(partial) problems.push(partial+' semi-transparent pixels');
  if(off) problems.push(off+' colour changes off the grid');
  rows.push({ file:f.name, size:im.width+'x'+im.height, 'cell':cell, colours:cols.size,
    'semi-transparent':partial, 'off-grid changes':off,
    verdict: problems.length?problems.join('; '):'pixel perfect' });
}
console.table(rows);
if(rows.some(r=>r.verdict!=='pixel perfect')){
  console.log('\nAT LEAST ONE FILE IS NOT CLEAN - see the verdict column.');
  process.exit(1);
}
/* and the keyed one must obey the rule the app checks */
const k=decode(path.join(OUT,'base-model-key-'+N+'.png'));
const seen=new Set();
for(let p=0;p<N*N;p++) seen.add((k.data[p*4]<<16)|(k.data[p*4+1]<<8)|k.data[p*4+2]);
const want=new Set([ (255<<16)|(255<<8)|255, (KEY_FILL[0]<<16)|(KEY_FILL[1]<<8)|KEY_FILL[2],
                     (KEY_INK[0]<<16)|(KEY_INK[1]<<8)|KEY_INK[2] ]);
const extra=[...seen].filter(c=>!want.has(c));
if(extra.length) throw new Error('the keyed base has '+extra.length+' colours beyond white, cyan and green');
console.log('\nthe keyed base holds exactly three colours: white background, cyan body, green outline');
console.log('every file above is a whole-number scale of the '+N+'x'+N+' artwork, nearest neighbour');
