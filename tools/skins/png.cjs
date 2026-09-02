/* A minimal PNG reader, so the skins can be measured with node and no
   dependencies. Handles 8-bit greyscale, RGB, indexed and their alpha variants,
   which covers anything an art tool exports. Anything it cannot read it REFUSES
   loudly rather than returning something plausible - a decoder that quietly
   mangles 16-bit or interlaced data would produce colour counts and grid
   measurements that look completely normal and are entirely wrong. */
const zlib=require('zlib');
const fs=require('fs');

const SIG=Buffer.from([137,80,78,71,13,10,26,10]);

function decode(file){
  const b=fs.readFileSync(file);
  if(!b.slice(0,8).equals(SIG)) throw new Error(file+': not a PNG');
  let p=8, ihdr=null, plte=null, trns=null;
  const idat=[];
  while(p<b.length){
    const len=b.readUInt32BE(p), type=b.toString('ascii',p+4,p+8);
    const data=b.slice(p+8,p+8+len);
    if(type==='IHDR') ihdr={ w:data.readUInt32BE(0), h:data.readUInt32BE(4),
      depth:data[8], colour:data[9], comp:data[10], filter:data[11], interlace:data[12] };
    else if(type==='PLTE') plte=data;
    else if(type==='tRNS') trns=data;
    else if(type==='IDAT') idat.push(data);
    else if(type==='IEND') break;
    p+=12+len;
  }
  if(!ihdr) throw new Error(file+': no IHDR');
  if(ihdr.interlace) throw new Error(file+': interlaced PNGs are not supported by this reader');
  if(ihdr.depth!==8) throw new Error(file+': bit depth '+ihdr.depth+' is not supported by this reader');
  const CH={0:1,2:3,3:1,4:2,6:4}[ihdr.colour];
  if(!CH) throw new Error(file+': colour type '+ihdr.colour+' is not supported by this reader');

  const raw=zlib.inflateSync(Buffer.concat(idat));
  const {w,h}=ihdr, stride=w*CH;
  const lines=Buffer.alloc(h*stride);
  let q=0;
  for(let y=0;y<h;y++){
    const f=raw[q++];
    const cur=lines.slice(y*stride,(y+1)*stride);
    raw.copy(cur,0,q,q+stride); q+=stride;
    const prev=y?lines.slice((y-1)*stride,y*stride):null;
    for(let i=0;i<stride;i++){
      const a=i>=CH?cur[i-CH]:0, bb=prev?prev[i]:0, c=(prev&&i>=CH)?prev[i-CH]:0;
      let v=cur[i];
      if(f===1) v=(v+a)&255;
      else if(f===2) v=(v+bb)&255;
      else if(f===3) v=(v+((a+bb)>>1))&255;
      else if(f===4){ const pa=Math.abs(bb-c), pb=Math.abs(a-c), pc=Math.abs(a+bb-2*c);
        v=(v+(pa<=pb&&pa<=pc?a:(pb<=pc?bb:c)))&255; }
      else if(f!==0) throw new Error(file+': unknown filter '+f+' on row '+y);
      cur[i]=v;
    }
  }
  const out=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const s=y*stride+x*CH, d=(y*w+x)*4;
    if(ihdr.colour===0){ out[d]=out[d+1]=out[d+2]=lines[s]; out[d+3]=255; }
    else if(ihdr.colour===4){ out[d]=out[d+1]=out[d+2]=lines[s]; out[d+3]=lines[s+1]; }
    else if(ihdr.colour===2){ out[d]=lines[s]; out[d+1]=lines[s+1]; out[d+2]=lines[s+2]; out[d+3]=255; }
    else if(ihdr.colour===6){ out[d]=lines[s]; out[d+1]=lines[s+1]; out[d+2]=lines[s+2]; out[d+3]=lines[s+3]; }
    else { const i=lines[s]*3; out[d]=plte[i]; out[d+1]=plte[i+1]; out[d+2]=plte[i+2];
      out[d+3]=(trns&&lines[s]<trns.length)?trns[lines[s]]:255; }
  }
  return { width:w, height:h, data:out, colourType:ihdr.colour, depth:ihdr.depth };
}
module.exports={decode};
