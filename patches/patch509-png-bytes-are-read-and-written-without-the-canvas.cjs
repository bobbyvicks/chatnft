/* PNG BYTES ARE READ AND WRITTEN WITHOUT THE BROWSER'S CANVAS.

   The fixer took its pixels from createImageBitmap + drawImage +
   getImageData. That path premultiplies alpha and rounds it back, so a
   translucent pixel's colour comes out changed - the review measured 4,230
   of skins/Solana Hue Skin's 569,572 in headless Chromium - and scale
   mode, whose whole promise is "the bytes that came in are the bytes that
   go out", could not keep it for a translucent picture; patch506 said so
   in the sentence. This makes it true.

   The collection is all 8-bit non-interlaced PNG (311 of 311 working
   traits colour type 6; the 297 raw sources 276 type 6 and 21 type 2,
   measured 2026-09-19), so a reader for it is small and exact: chunks,
   zlib through the browser's own DecompressionStream, the five filters,
   every non-interlaced colour type and bit depth unpacked to RGBA (16-bit
   by its high byte, as browsers do). Interlaced files, anything that is
   not a PNG, and any PNG the reader refuses go to the browser as before.

   RGB UNDER ALPHA 0 IS ZEROED, on purpose. It is what the browser always
   handed over and what everything downstream was measured against; the
   block measurement compares all four channels, so a transparent block
   carrying generator noise in its invisible colour would otherwise stop
   reading as flat. The engine never reads those bytes (patch500).

   AND THE BROWSER CHECKS THE READER. Wherever the browser is exact -
   every alpha, and the colour of every pixel at alpha 255 - the two
   decodes must agree, or the browser's bytes are used and the run says
   so. A reader that went wrong would otherwise present as a picture.

   Scale-mode saves (download, save to project, the folder run, the
   recent rail) are encoded from the raw pixels by pngEncode, enlarged to
   the canvas by nearest neighbour under the browser's own rule (each
   output pixel takes the source pixel under its centre,
   floor((x+0.5)*w/W), measured for the harness), so every visible pixel
   goes out as the byte it came in. The engine path is untouched: its
   output has no translucency, and the canvas is exact for it.

   CHECK FIRST, WRITE LAST: the reader and writer are exercised in node on
   PNGs of every colour type before the file is written, and the file is
   not written if they fail. */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const swap = (from, to, name) => { const at = kit.only(L, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };
const block = (start, want, name) => { for (let i = 0; i < want.length; i++) if (L[start + i] !== want[i]) throw new Error(name + ': line ' + i + ' is not what this expects: ' + JSON.stringify(L[start + i])); };
/* Anchors inside one function: the same line can exist elsewhere in the page
   (the shelf has its own `g.drawImage(bm,0,0)`), so a range is computed
   fresh, after every edit, from the function's signature to its closing
   brace at column 0. */
const rangeOf = (sig) => { const s = kit.only(L, l => l === sig, sig); let e = s + 1; while (L[e] !== '}') e++; return { start: s, end: e }; };
const onlyIn = (sig, pred, name) => kit.only(L, pred, name, rangeOf(sig));
const swapIn = (sig, from, to, name) => { const at = onlyIn(sig, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };
const LOAD = 'async function fixLoad(file){', BATCH = 'async function fixBatchRun(files){';

/* ---- 1. the reader, the writer, the decode with its check ------------------ */
{
  const at = kit.only(L, l => l === 'async function fixLoad(file){', 'fixLoad');
  kit.replace(L, { start: at, end: at }, [
    '/* PNG BYTES, READ AND WRITTEN WITHOUT THE BROWSER\'S CANVAS.',
    '',
    '   The fixer took its pixels from createImageBitmap + drawImage +',
    '   getImageData. That path premultiplies alpha and rounds it back, so a',
    '   translucent pixel\'s colour comes out changed (4,230 of Solana Hue',
    '   Skin\'s 569,572, measured by the review), and scale mode could not keep',
    '   its promise for a translucent picture. The collection is all 8-bit',
    '   non-interlaced PNG (measured 2026-09-19: 311 of 311 working traits and',
    '   297 of 297 raw sources), so a reader for it is small and exact: chunks,',
    '   zlib through the browser\'s DecompressionStream, the five filters, the',
    '   colour types unpacked to RGBA. Interlaced files and anything else go to',
    '   the browser as before, and the run says so.',
    '',
    '   RGB UNDER ALPHA 0 IS ZEROED, on purpose: it is what the browser always',
    '   handed over and what everything here was measured against, and the',
    '   block measurement compares all four channels - a transparent block',
    '   with generator noise in its invisible colour would otherwise stop',
    '   reading as flat. The engine never reads those bytes. */',
    'const PNG_SIG=[137,80,78,71,13,10,26,10];',
    'function pngIs(u8){',
    '  if(!u8||u8.length<33) return false;',
    '  for(let i=0;i<8;i++) if(u8[i]!==PNG_SIG[i]) return false;',
    '  return true;',
    '}',
    'async function pngZlib(parts,dir){',
    '  const s=new Blob(parts).stream().pipeThrough(dir==="in"?new DecompressionStream("deflate"):new CompressionStream("deflate"));',
    '  return new Uint8Array(await new Response(s).arrayBuffer());',
    '}',
    'async function pngDecode(u8){',
    '  if(!pngIs(u8)) throw new Error("not a PNG");',
    '  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);',
    '  let p=8, width=0, height=0, depth=0, ctype=0, interlace=0, plte=null, trns=null;',
    '  const idat=[];',
    '  while(p+8<=u8.length){',
    '    const len=dv.getUint32(p);',
    '    const type=String.fromCharCode(u8[p+4],u8[p+5],u8[p+6],u8[p+7]);',
    '    const a=p+8, b=a+len;',
    '    if(b+4>u8.length) throw new Error("truncated");',
    '    if(type==="IHDR"){ width=dv.getUint32(a); height=dv.getUint32(a+4); depth=u8[a+8]; ctype=u8[a+9]; interlace=u8[a+12]; }',
    '    else if(type==="PLTE") plte=u8.subarray(a,b);',
    '    else if(type==="tRNS") trns=u8.subarray(a,b);',
    '    else if(type==="IDAT") idat.push(u8.subarray(a,b));',
    '    else if(type==="IEND") break;',
    '    p=b+4;',
    '  }',
    '  if(!width||!height) throw new Error("no IHDR");',
    '  if(interlace) throw new Error("interlaced");',
    '  const chans={0:1,2:3,3:1,4:2,6:4}[ctype];',
    '  if(!chans||[1,2,4,8,16].indexOf(depth)<0||(depth<8&&ctype!==0&&ctype!==3)) throw new Error("type "+ctype+" at "+depth+" bits");',
    '  const raw=await pngZlib(idat,"in");',
    '  const bpp=Math.max(1,(chans*depth)>>3);',
    '  const stride=Math.ceil(width*chans*depth/8);',
    '  if(raw.length<(stride+1)*height) throw new Error("short data");',
    '  /* THE FIVE FILTERS, undone row by row against the row above. */',
    '  const rows=new Uint8Array(stride*height);',
    '  let prev=null;',
    '  for(let y=0;y<height;y++){',
    '    const f=raw[y*(stride+1)], src=y*(stride+1)+1;',
    '    const cur=rows.subarray(y*stride,(y+1)*stride);',
    '    if(f>4) throw new Error("filter "+f);',
    '    for(let i=0;i<stride;i++){',
    '      const x=raw[src+i];',
    '      const a=i>=bpp?cur[i-bpp]:0, b=prev?prev[i]:0, c=(prev&&i>=bpp)?prev[i-bpp]:0;',
    '      let v=x;',
    '      if(f===1) v=x+a;',
    '      else if(f===2) v=x+b;',
    '      else if(f===3) v=x+((a+b)>>1);',
    '      else if(f===4){ const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); v=x+((pa<=pb&&pa<=pc)?a:(pb<=pc?b:c)); }',
    '      cur[i]=v&255;',
    '    }',
    '    prev=cur;',
    '  }',
    '  /* SAMPLES TO RGBA. A sample is read at its depth and scaled to eight',
    '     bits; 16-bit by its high byte, which is what browsers do. */',
    '  const max=(1<<depth)-1;',
    '  const sample=(row,i)=>{',
    '    if(depth===8) return rows[row*stride+i];',
    '    if(depth===16) return rows[row*stride+i*2];',
    '    const bit=i*depth; return (rows[row*stride+(bit>>3)]>>(8-depth-(bit&7)))&max;',
    '  };',
    '  const wide=(row,i)=> depth===16 ? (rows[row*stride+i*2]<<8)|rows[row*stride+i*2+1] : sample(row,i);',
    '  const eight=(v)=> depth<8 ? Math.round(v*255/max) : v;',
    '  const key=(trns&&trns.length>=2)?((trns[0]<<8)|trns[1]):-1;',
    '  const keyRGB=(trns&&trns.length>=6)?[(trns[0]<<8)|trns[1],(trns[2]<<8)|trns[3],(trns[4]<<8)|trns[5]]:null;',
    '  const out=new Uint8ClampedArray(width*height*4);',
    '  for(let y=0;y<height;y++) for(let x=0;x<width;x++){',
    '    const o=(y*width+x)*4;',
    '    let r,g,b,a=255;',
    '    if(ctype===0){ const v=sample(y,x); r=g=b=eight(v); if(key>=0&&wide(y,x)===key) a=0; }',
    '    else if(ctype===2){ r=sample(y,x*3); g=sample(y,x*3+1); b=sample(y,x*3+2);',
    '      if(keyRGB&&wide(y,x*3)===keyRGB[0]&&wide(y,x*3+1)===keyRGB[1]&&wide(y,x*3+2)===keyRGB[2]) a=0; }',
    '    else if(ctype===3){ const k=sample(y,x); if(!plte||k*3+2>=plte.length) throw new Error("palette index "+k);',
    '      r=plte[k*3]; g=plte[k*3+1]; b=plte[k*3+2]; if(trns&&k<trns.length) a=trns[k]; }',
    '    else if(ctype===4){ r=g=b=sample(y,x*2); a=sample(y,x*2+1); }',
    '    else { r=sample(y,x*4); g=sample(y,x*4+1); b=sample(y,x*4+2); a=sample(y,x*4+3); }',
    '    if(a===0){ r=0; g=0; b=0; }',
    '    out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=a;',
    '  }',
    '  return {width:width, height:height, data:out, type:ctype, depth:depth};',
    '}',
    '/* RGBA TO PNG BYTES: 8-bit RGBA, no filtering (the pixels are pixel art',
    '   and the file is small either way), zlib through CompressionStream. */',
    'async function pngEncode(rgba,W,H){',
    '  const stride=W*4+1, raw=new Uint8Array(stride*H);',
    '  for(let y=0;y<H;y++){ raw[y*stride]=0; raw.set(rgba.subarray(y*W*4,(y+1)*W*4),y*stride+1); }',
    '  const z=await pngZlib([raw],"out");',
    '  const chunk=(type,body)=>{',
    '    const c=new Uint8Array(12+body.length), v=new DataView(c.buffer);',
    '    v.setUint32(0,body.length); for(let i=0;i<4;i++) c[4+i]=type.charCodeAt(i);',
    '    c.set(body,8); v.setUint32(8+body.length,crc32(c.subarray(4,8+body.length)));',
    '    return c;',
    '  };',
    '  const ihdr=new Uint8Array(13), v=new DataView(ihdr.buffer);',
    '  v.setUint32(0,W); v.setUint32(4,H); ihdr[8]=8; ihdr[9]=6;',
    '  const parts=[new Uint8Array(PNG_SIG),chunk("IHDR",ihdr),chunk("IDAT",z),chunk("IEND",new Uint8Array(0))];',
    '  let n=0; for(const q of parts) n+=q.length;',
    '  const out=new Uint8Array(n); let at=0; for(const q of parts){ out.set(q,at); at+=q.length; }',
    '  return out;',
    '}',
    '/* THE PICTURE\'S PIXELS, FROM THE FILE. A PNG through pngDecode, checked',
    '   against the browser wherever the browser is exact - every alpha, and',
    '   the colour of every pixel at alpha 255 - or the browser\'s bytes and a',
    '   reason. `how` says which, and the run repeats it where it matters. */',
    'async function fixDecodeFile(file){',
    '  let bm;',
    '  try{ bm=await createImageBitmap(file); }catch(_){ return null; }',
    '  const W=bm.width, H=bm.height;',
    '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '  const g=c.getContext("2d",{willReadFrequently:true});',
    '  g.drawImage(bm,0,0); if(bm.close) bm.close();',
    '  const browser=g.getImageData(0,0,W,H).data;',
    '  c.width=1; c.height=1;',
    '  const via=(why)=>({data:browser, width:W, height:H, how:"browser", why:why});',
    '  let bytes=null;',
    '  try{ bytes=new Uint8Array(await file.arrayBuffer()); }catch(_){ bytes=null; }',
    '  if(!bytes||!pngIs(bytes)) return via("not a PNG");',
    '  let d;',
    '  try{ d=await pngDecode(bytes); }catch(e){ return via(String((e&&e.message)||e)); }',
    '  if(d.width!==W||d.height!==H) return via("size "+d.width+"\\u00d7"+d.height+" against the browser\'s "+W+"\\u00d7"+H);',
    '  let off=0;',
    '  for(let i=0,n=W*H;i<n;i++){',
    '    const o=i*4, a=d.data[o+3];',
    '    if(a!==browser[o+3]){ off++; continue; }',
    '    if(a===255&&(d.data[o]!==browser[o]||d.data[o+1]!==browser[o+1]||d.data[o+2]!==browser[o+2])) off++;',
    '  }',
    '  if(off) return via("the reader disagreed with the browser on "+off+" pixel"+(off===1?"":"s"));',
    '  return {data:d.data, width:W, height:H, how:"png", why:""};',
    '}',
    '/* A SCALE-ONLY RESULT AS BYTES, without the canvas: the picture\'s own',
    '   pixels, enlarged to the collection canvas when the switch is on by',
    '   nearest neighbour under the browser\'s rule (each output pixel takes',
    '   the source pixel under its centre, floor((x+0.5)*w/W), measured for',
    '   the harness), then pngEncode. Every visible pixel goes out as the byte',
    '   it came in; the canvas path rounded translucent ones. */',
    'async function fixScaledBytes(r){',
    '  const on=$("fixgrid")&&$("fixgrid").checked;',
    '  let data=r.data, W=r.width, H=r.height;',
    '  if(on&&(W!==CANVAS_SIDE||H!==CANVAS_SIDE)){',
    '    const S=CANVAS_SIDE, out=new Uint8ClampedArray(S*S*4);',
    '    const mx=new Int32Array(S), my=new Int32Array(S);',
    '    for(let x=0;x<S;x++) mx[x]=Math.min(W-1,Math.floor((x+0.5)*W/S));',
    '    for(let y=0;y<S;y++) my[y]=Math.min(H-1,Math.floor((y+0.5)*H/S));',
    '    for(let y=0;y<S;y++){',
    '      const sy=my[y]*W, dy=y*S;',
    '      for(let x=0;x<S;x++){ const s=(sy+mx[x])*4, d=(dy+x)*4; out[d]=data[s]; out[d+1]=data[s+1]; out[d+2]=data[s+2]; out[d+3]=data[s+3]; }',
    '    }',
    '    data=out; W=S; H=S;',
    '  }',
    '  return pngEncode(data,W,H);',
    '}',
    'async function fixLoad(file){',
  ]);
}

/* ---- 2. fixLoad reads through it ------------------------------------------- */
{
  const a = onlyIn(LOAD, l => l === '  try{ bm=await createImageBitmap(file); }', 'fixLoad decode');
  block(a - 1, [
    '  let bm;',
    '  try{ bm=await createImageBitmap(file); }',
    '  catch(_){ fixSay("That file is not an image this browser can read."); return false; }',
    '  const W=bm.width, H=bm.height;',
  ], 'fixLoad decode');
  kit.replace(L, { start: a - 1, end: a + 2 }, [
    '  const dec=await fixDecodeFile(file);',
    '  if(!dec){ fixSay("That file is not an image this browser can read."); return false; }',
    '  const W=dec.width, H=dec.height;',
  ]);
  const b = onlyIn(LOAD, l => l === '  const g=c.getContext("2d"); g.drawImage(bm,0,0);', 'fixLoad canvas');
  block(b - 1, [
    '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '  const g=c.getContext("2d"); g.drawImage(bm,0,0);',
    '  let sd=g.getImageData(0,0,W,H).data, sw=W, sh=H, shrank=null;',
  ], 'fixLoad pixels');
  kit.replace(L, { start: b - 1, end: b + 1 }, [
    '  let sd=dec.data, sw=W, sh=H, shrank=null;',
  ]);
  const c0 = onlyIn(LOAD, (l, i) => l === '    c.width=1; c.height=1;' && /fixSay\("Too big - "\+\(W\*H\/1e6\)/.test(L[i + 1] || ''), 'fixLoad megapixel refusal');
  kit.replace(L, { start: c0, end: c0 }, []);
  swap('  FIX.translucent=fixTranslucent(sd,sw*sh);', [
    '  FIX.translucent=fixTranslucent(sd,sw*sh);',
    '  FIX.decode=dec.how; FIX.decodeWhy=dec.why;',
  ], 'fixLoad translucency line');
  /* the before-preview was drawn from the bitmap; it is the decoded pixels now */
  swapIn(LOAD, '  const b=$("fixbefore"); b.width=W; b.height=H; b.getContext("2d").drawImage(bm,0,0);', [
    '  const b=$("fixbefore"); b.width=W; b.height=H;',
    '  { const bg=b.getContext("2d"), im=bg.createImageData(W,H); im.data.set(dec.data); bg.putImageData(im,0,0); }',
  ], 'fixLoad before-preview');
}

/* ---- 3. the batch reads through it ------------------------------------------ */
{
  const a = onlyIn(BATCH, l => l === '    try{ bm=await createImageBitmap(file); }', 'batch decode');
  block(a - 1, [
    '    let bm=null;',
    '    try{ bm=await createImageBitmap(file); }',
    '    catch(_){ failed.push(name+" (not an image this browser can read)"); continue; }',
    '    const W=bm.width, H=bm.height;',
  ], 'batch decode');
  kit.replace(L, { start: a - 1, end: a + 2 }, [
    '    const dec=await fixDecodeFile(file);',
    '    if(!dec){ failed.push(name+" (not an image this browser can read)"); continue; }',
    '    if(dec.how==="browser"&&pngIs(new Uint8Array(await file.slice(0,33).arrayBuffer()))) fixBrowserRead.push(name+" ("+dec.why+")");',
    '    const W=dec.width, H=dec.height;',
  ]);
  const b = onlyIn(BATCH, (l, i) => l === '      if(bm.close) bm.close();' && (L[i + 1] || '').indexOf('outside what this can take') >= 0, 'batch size refusal closes the bitmap');
  kit.replace(L, { start: b, end: b }, []);
  const c = onlyIn(BATCH, l => l === '    g.drawImage(bm,0,0);', 'batch draw');
  block(c - 2, [
    '    const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '    const g=c.getContext("2d",{willReadFrequently:true});',
    '    g.drawImage(bm,0,0);',
    '    if(bm.close) bm.close();',
  ], 'batch canvas');
  kit.replace(L, { start: c - 2, end: c + 1 }, []);
  swapIn(BATCH, '    let px=g.getImageData(0,0,W,H).data, sw=W, sh=H;', '    let px=dec.data, sw=W, sh=H;', 'batch pixels');
  const d = onlyIn(BATCH, (l, i) => l === '      c.width=1; c.height=1;' && (L[i + 1] || '').indexOf('no whole factor brings it under') >= 0, 'batch megapixel refusal');
  kit.replace(L, { start: d, end: d }, []);
  swapIn(BATCH, '    oc.width=1; oc.height=1; c.width=1; c.height=1;', '    oc.width=1; oc.height=1;', 'batch release');
  /* the saved bytes in scale mode come from the raw pixels */
  swapIn(BATCH, '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));',
       '    const blob=scale ? null : await new Promise(res=>oc.toBlob(res,"image/png"));', 'batch blob');
  const e = onlyIn(BATCH, (l, i) => l === '      data:new Uint8Array(await blob.arrayBuffer()),' && (L[i + 1] || '').indexOf('thumb:URL.createObjectURL(tb)') >= 0, 'batch data');
  kit.replace(L, { start: e, end: e }, ['      data:scale ? await fixScaledBytes(out) : new Uint8Array(await blob.arrayBuffer()),']);
  /* the counter, declared and reset with the others */
  swap('let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0;',
       'let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[];', 'batch counters');
  swap('  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0;',
       '  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[];', 'batch reset');
  /* the folder note: translucent pixels kept exactly, and any file the browser read */
  swap('      +(scale ? "kept translucent - the browser rounds their colour on the way in" : "counted as paint or clear - the results have none")',
       '      +(scale ? (fixBrowserRead.length ? "kept translucent - read by the browser, which rounds their colour" : "kept exactly, byte for byte") : "counted as paint or clear - the results have none")', 'batch alpha note');
  swap('  const shrunkNote = shrunk.length', [
    '  /* A PNG THE PAGE\'S OWN READER DID NOT TAKE, or disagreed with the',
    '     browser on: read by the browser instead, and named. */',
    '  const readNote = fixBrowserRead.length',
    '    ? " \\u00b7 "+fixBrowserRead.length+" read by the browser, not the page\'s PNG reader: "+fixBrowserRead.slice(0,3).join(", ")',
    '      +(fixBrowserRead.length>3?" and "+(fixBrowserRead.length-3)+" more":"")',
    '    : "";',
    '  const shrunkNote = shrunk.length',
  ], 'shrunk note');
  const s = kit.only(L, l => l.startsWith('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "') && l.endsWith('+offNote+alphaNote+shrunkNote+palNote'), 'the folder sentence');
  kit.replace(L, { start: s, end: s }, [L[s].replace('+offNote+alphaNote+shrunkNote+palNote', '+offNote+alphaNote+readNote+shrunkNote+palNote')]);
}

/* ---- 4. the single run's scale-mode sentence and saves ---------------------- */
{
  const a = kit.only(L, l => l === '      +(tl.count ? " \\u00b7 "+tl.count.toLocaleString()+" translucent pixel"+(tl.count===1?" is":"s are")', 'scale sentence');
  block(a, [
    '      +(tl.count ? " \\u00b7 "+tl.count.toLocaleString()+" translucent pixel"+(tl.count===1?" is":"s are")',
    '        +" kept translucent; the browser rounds their colour on the way in, so those are not byte-exact" : ""));',
  ], 'scale sentence');
  kit.replace(L, { start: a, end: a + 1 }, [
    '      +(tl.count ? " \\u00b7 "+tl.count.toLocaleString()+" translucent pixel"+(tl.count===1?" is":"s are")',
    '        +(FIX.decode==="png" ? " kept exactly, byte for byte" : " kept translucent; this file was read by the browser ("+FIX.decodeWhy+"), which rounds their colour") : ""));',
  ]);
  /* download */
  const d = kit.only(L, (l, i) => l === '  const r=FIX.out; if(!r){ fixSay("Nothing fixed yet."); return; }' && L[i - 1] === 'function fixDownload(){', 'fixDownload head');
  kit.replace(L, { start: d, end: d }, [
    '  const r=FIX.out; if(!r){ fixSay("Nothing fixed yet."); return; }',
    '  /* A SCALED RESULT GOES OUT AS ITS OWN BYTES, not through the canvas, so',
    '     a translucent pixel is the byte it came in as. */',
    '  if(r.consensus==="scaled"){',
    '    fixScaledBytes(r).then(bytes=>{',
    '      const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));',
    '      a.download=FIX.name+"-fixed.png"; a.click();',
    '      setTimeout(()=>URL.revokeObjectURL(a.href),1000);',
    '    });',
    '    return;',
    '  }',
  ]);
  /* save to project */
  const s = kit.only(L, l => l === '  const r=FIX.out; if(!r){ fixSaveSay("Nothing fixed yet."); return; }', 'fixSaveOne head');
  block(s, [
    '  const r=FIX.out; if(!r){ fixSaveSay("Nothing fixed yet."); return; }',
    '  const c=fixGridCanvas(r);',
    '  const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
    '  c.width=1; c.height=1;',
    '  const bytes=new Uint8Array(await blob.arrayBuffer());',
  ], 'fixSaveOne');
  kit.replace(L, { start: s, end: s + 4 }, [
    '  const r=FIX.out; if(!r){ fixSaveSay("Nothing fixed yet."); return; }',
    '  const bytes=await fixResultBytes(r);',
  ]);
  /* The recent rail is not touched: a single scale-only run never reaches
     fixRecentFromRun (only the engine path calls it), so a scaled branch
     there would be a line nothing runs; whether scaled pictures belong on
     the rail is a product question, not this patch's. The folder run's
     rail entries carry the batch's `data`, which is handled above. */
  /* one function for "a result as bytes", for the project save */
  const g = kit.only(L, l => l === 'async function fixSaveOne(){', 'fixSaveOne');
  kit.replace(L, { start: g, end: g }, [
    '/* A RESULT AS THE BYTES A SAVE WRITES: a scaled result as its own pixels',
    '   (fixScaledBytes), anything the engine made through fixGridCanvas. */',
    'async function fixResultBytes(r){',
    '  if(r.consensus==="scaled") return fixScaledBytes(r);',
    '  const c=fixGridCanvas(r);',
    '  const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
    '  c.width=1; c.height=1;',
    '  return new Uint8Array(await blob.arrayBuffer());',
    '}',
    'async function fixSaveOne(){',
  ]);
}

/* ---- 5. the reader and writer, exercised in node BEFORE anything is written --- */
const PNG_SIG_N = [137, 80, 78, 71, 13, 10, 26, 10];
const CRCT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (u8) => { let c = -1; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
/* build a PNG of any type/depth in node, with the five filters in turn */
const build = (W, H, ctype, depth, pixel, plte, trns) => {
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const stride = Math.ceil(W * chans * depth / 8), bpp = Math.max(1, (chans * depth) >> 3);
  const rows = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = pixel(x, y);
    for (let k = 0; k < chans; k++) {
      const v = s[k], i = x * chans + k;
      if (depth === 8) rows[y * stride + i] = v;
      else if (depth === 16) { rows[y * stride + i * 2] = v >> 8; rows[y * stride + i * 2 + 1] = v & 255; }
      else { const bit = i * depth; rows[y * stride + (bit >> 3)] |= v << (8 - depth - (bit & 7)); }
    }
  }
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const f = y % 5; raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = rows[y * stride + i], a = i >= bpp ? rows[y * stride + i - bpp] : 0, b = y ? rows[(y - 1) * stride + i] : 0, c = (y && i >= bpp) ? rows[(y - 1) * stride + i - bpp] : 0;
      let p; if (f === 0) p = 0; else if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      raw[y * (stride + 1) + 1 + i] = (x - p) & 255;
    }
  }
  const chunk = (type, body) => { const c = Buffer.alloc(12 + body.length); c.writeUInt32BE(body.length, 0); c.write(type, 4, 'ascii'); body.copy(c, 8); c.writeUInt32BE(crc32(c.subarray(4, 8 + body.length)), 8 + body.length); return c; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = depth; ihdr[9] = ctype;
  const parts = [Buffer.from(PNG_SIG_N), chunk('IHDR', ihdr)];
  if (plte) parts.push(chunk('PLTE', Buffer.from(plte)));
  if (trns) parts.push(chunk('tRNS', Buffer.from(trns)));
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
};
const same = (a, b, what) => { if (a.length !== b.length) throw new Error(what + ': length ' + a.length + ' vs ' + b.length); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(what + ': byte ' + i + ' is ' + a[i] + ', want ' + b[i]); };

async function exercise(lines) {
  const carve = (sig) => { const a = lines.findIndex(l => l === sig); if (a < 0) throw new Error('cannot carve ' + sig); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const src = 'const PNG_SIG=[137,80,78,71,13,10,26,10];\n'
    + carve('function pngIs(u8){') + '\n'
    + 'async function pngZlib(parts,dir){ const all=Buffer.concat(parts.map(p=>Buffer.from(p))); return new Uint8Array(dir==="in"?zlib.inflateSync(all):zlib.deflateSync(all)); }\n'
    + carve('async function pngDecode(u8){') + '\n' + carve('async function pngEncode(rgba,W,H){') + '\n'
    + 'return {pngIs, pngDecode, pngEncode};';
  const T = new Function('zlib', 'crc32', src)(zlib, crc32);
  const W = 23, H = 17;
  /* RGBA 8-bit with every filter; colour under alpha 0 must come back as 0 */
  const px = (x, y) => [(x * 37 + y * 11) & 255, (x * 7 + y * 91) & 255, (x * y) & 255, (x + y) % 6 === 0 ? 0 : ((x + y) % 5 === 0 ? 100 + ((x * 3) & 63) : 255)];
  const want = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = px(x, y), o = (y * W + x) * 4; want.set(p[3] === 0 ? [0, 0, 0, 0] : p, o); }
  same((await T.pngDecode(build(W, H, 6, 8, px))).data, want, 'RGBA 8-bit');
  /* RGB 8-bit with a tRNS colour key */
  const rgb = (x, y) => [(x * 5) & 255, (y * 9) & 255, ((x ^ y) * 3) & 255];
  const key = rgb(2, 3);
  const d2 = await T.pngDecode(build(W, H, 2, 8, rgb, null, [0, key[0], 0, key[1], 0, key[2]]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, c = rgb(x, y), hit = c[0] === key[0] && c[1] === key[1] && c[2] === key[2]; const w = hit ? [0, 0, 0, 0] : [c[0], c[1], c[2], 255]; for (let k = 0; k < 4; k++) if (d2.data[o + k] !== w[k]) throw new Error('RGB keyed at ' + x + ',' + y); }
  /* palette 4-bit with tRNS alphas, gray 1-bit, gray+alpha 16-bit */
  const plte = []; for (let i = 0; i < 16; i++) plte.push(i * 16, 255 - i * 16, (i * 37) & 255);
  const d3 = await T.pngDecode(build(W, H, 3, 4, (x, y) => [(x + y) & 15], plte, [0, 40, 255]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (x + y) & 15, o = (y * W + x) * 4, a = k === 0 ? 0 : k === 1 ? 40 : 255; const w = a === 0 ? [0, 0, 0, 0] : [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], a]; for (let q = 0; q < 4; q++) if (d3.data[o + q] !== w[q]) throw new Error('palette 4-bit at ' + x + ',' + y); }
  const d0 = await T.pngDecode(build(W, H, 0, 1, (x, y) => [(x + y) & 1]));
  for (let i = 0; i < W * H; i++) { const v = ((i % W) + Math.floor(i / W)) & 1 ? 255 : 0; if (d0.data[i * 4] !== v || d0.data[i * 4 + 3] !== 255) throw new Error('gray 1-bit at ' + i); }
  const d4 = await T.pngDecode(build(W, H, 4, 16, (x, y) => [(x * 1000 + y) & 65535, (y * 3000 + x) & 65535]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, g = ((x * 1000 + y) & 65535) >> 8, a = ((y * 3000 + x) & 65535) >> 8; const w = a === 0 ? [0, 0, 0, 0] : [g, g, g, a]; for (let q = 0; q < 4; q++) if (d4.data[o + q] !== w[q]) throw new Error('gray+alpha 16-bit at ' + x + ',' + y); }
  /* the writer round-trips through the reader, and through pngjs */
  const enc = await T.pngEncode(want, W, H);
  if (!T.pngIs(enc)) throw new Error('pngEncode did not write a PNG');
  same((await T.pngDecode(enc)).data, want, 'encode/decode round trip');
  const { PNG } = require('E:/X content/sprout-github/node_modules/pngjs');
  same(new Uint8Array(PNG.sync.read(Buffer.from(enc)).data), want, 'pngjs reads what pngEncode wrote');
  /* an interlaced file is refused (the browser takes it) */
  const il = build(W, H, 6, 8, px); il[28] = 1;
  let refused = false; try { await T.pngDecode(il); } catch (e) { refused = /interlaced/.test(String(e.message)); }
  if (!refused) throw new Error('an interlaced PNG should be refused to the browser');
}

(async () => {
  await exercise(L);
  const grew = kit.save(doc, ({ code, lines }) => {
    const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
    const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
    for (const s of ['async function pngDecode(u8){', 'async function pngEncode(rgba,W,H){', 'async function fixDecodeFile(file){',
      'async function fixScaledBytes(r){', 'async function fixResultBytes(r){', '  const dec=await fixDecodeFile(file);', '    const dec=await fixDecodeFile(file);',
      '  FIX.decode=dec.how; FIX.decodeWhy=dec.why;', '      data:scale ? await fixScaledBytes(out) : new Uint8Array(await blob.arrayBuffer()),',
      '+offNote+alphaNote+readNote+shrunkNote+palNote', ' kept exactly, byte for byte', '  const bytes=await fixResultBytes(r);']) need(s);
    /* the old decode lines are gone as whole lines (fixDecodeFile's own
       `try{ bm=await createImageBitmap(file); }catch(_){ return null; }` shares
       their prefix, so a substring check would fire on the replacement) */
    const within = (sig) => { const s = lines.indexOf(sig); if (s < 0) throw new Error('no ' + sig); let e = s + 1; while (lines[e] !== '}') e++; return lines.slice(s, e); };
    for (const old of ['  try{ bm=await createImageBitmap(file); }', '  let bm;']) if (within(LOAD).indexOf(old) >= 0) throw new Error('fixLoad still has: ' + JSON.stringify(old));
    for (const old of ['    try{ bm=await createImageBitmap(file); }', '    let bm=null;']) if (within(BATCH).indexOf(old) >= 0) throw new Error('fixBatchRun still has: ' + JSON.stringify(old));
    never('    let px=g.getImageData(0,0,W,H).data, sw=W, sh=H;');
    never('  let sd=g.getImageData(0,0,W,H).data, sw=W, sh=H, shrank=null;');
    never('so those are not byte-exact');
    /* the only createImageBitmap left in the fixer's input path is the browser decode inside fixDecodeFile */
    const fixerStart = lines.findIndex(l => l === 'async function fixDecodeFile(file){');
    const batchEnd = lines.findIndex((l, i) => i > fixerStart && l === 'function fixZipName(rel,name){');
    if (fixerStart < 0 || batchEnd < 0) throw new Error('cannot find the fixer input path');
    const bitmaps = lines.slice(fixerStart, batchEnd).filter(l => l.indexOf('createImageBitmap(') >= 0);
    if (bitmaps.length !== 1) throw new Error('expected one createImageBitmap between fixDecodeFile and the zip naming, found ' + bitmaps.length + ':\n' + bitmaps.join('\n'));
    /* no line in fixLoad or the batch loop still touches the canvas that is gone */
    const loadStart = lines.findIndex(l => l === 'async function fixLoad(file){');
    let loadEnd = loadStart; while (lines[loadEnd] !== '}') loadEnd++;
    const stray = lines.slice(loadStart, loadEnd).filter(l => /\bc\.(width|height|getContext)\b|\bbm\b/.test(l));
    if (stray.length) throw new Error('fixLoad still touches the canvas or bitmap:\n' + stray.join('\n'));
  });
  fs.renameSync(TMP, FILE);
  console.log('patch509 written, ' + grew + ' bytes');
})().catch(e => { console.error(e && e.stack || e); try { fs.unlinkSync(TMP); } catch (_) {} process.exit(1); });
