/* A minimal PNG writer. Filter 0 on every row and let zlib do the work - these
   are small images and the point is correctness, not file size. Writes 8-bit
   RGBA, which is the only thing this pipeline needs. */
const zlib=require('zlib');
const fs=require('fs');

function crc32(buf){
  let c, t=crc32.t;
  if(!t){ t=crc32.t=[];
    for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; t[n]=c>>>0; } }
  let r=0xffffffff;
  for(let i=0;i<buf.length;i++) r=t[(r^buf[i])&255]^(r>>>8);
  return (r^0xffffffff)>>>0;
}
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td),0);
  return Buffer.concat([len,td,crc]);
}
function write(file,w,h,rgba){
  const raw=Buffer.alloc(h*(1+w*4));
  for(let y=0;y<h;y++){
    raw[y*(1+w*4)]=0;
    for(let x=0;x<w*4;x++) raw[y*(1+w*4)+1+x]=rgba[y*w*4+x];
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),
    chunk('IEND',Buffer.alloc(0)) ]));
}
module.exports={write};
