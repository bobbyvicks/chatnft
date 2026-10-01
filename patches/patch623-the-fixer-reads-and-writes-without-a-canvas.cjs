/* patch623: THE FIXER READS SOURCES AND WRITES RESULTS WITHOUT A CANVAS.

   THE MEASUREMENT (2026-10-01, the controlling session, in the owner's Chrome
   on the live page 65ecad7; the functions are unchanged in 004c0d8):

   READING. fixDecodeFile decoded every file with createImageBitmap + canvas
   getImageData. For a "plain" PNG with no translucent pixel (pngPlain: 8-bit,
   not interlaced, no gAMA/iCCP/sRGB/cHRM) it RETURNED THE BROWSER'S PIXELS
   ("READ ONCE when reading twice could change nothing"); for other PNGs it ran
   the page's own pngDecode but REFUSED it when the browser disagreed ("checked
   against the browser wherever the browser is exact"). The browser is not
   exact there: for 8-bit RGBA non-interlaced PNGs with no colour chunk the
   canvas pixels differ from pngDecode's by one unit in one channel on a few
   hundred OPAQUE pixels per picture (Tesseract Bookshelves 250 of 1,638,400;
   Dark Skin 98; Blue Party Hat 34; alpha identical). The engine's input was
   off by one, and on busy pictures the k-means ties flipped: the page's
   result differed from an exact offline run (pngjs decode, the same page
   functions, the same worker text) on 12 of 75 final-project traits
   (Tesseract 564 of 6,400 cells, Suburban Sidewalk 192, Market Makers Sakura
   124, Blue Camo Skin 70, others 2-42) and was identical on 63. The page
   itself is deterministic (one file in three batch orders: identical).

   WRITING. Every save went through a canvas too: fixBatchRun's finish(),
   fixResultBytes (Save to project), fixDownload and fixRecentFromRun drew the
   cells with fixGridCanvas (drawImage, smoothing off) and toBlob. Measured
   with the page's own pngDecode on the saved bytes: 2-8 pixels per picture
   off by one from their cell colour (#000001 beside #000000, #ec8099 beside
   #ed8099). putImageData + convertToBlob in a worker ALSO leaves pixels off
   by one, so no canvas path is exact there; a pure encode is.

   HEADLESS CHROMIUM UNDER PLAYWRIGHT MAY NOT SHOW THIS NOISE (a GPU/driver
   effect on the owner's machine): the owner's Chrome is where the controls
   fail. The specs say so in their headers.

   WHAT THIS DOES.
   1. fixDecodeFile: a PNG pngDecode can read is pngDecode's pixels, how:"png";
      the browser is asked for its size only (a reader size that differs is
      still a reason to fall back) and no canvas is drawn. Not a PNG, or a PNG
      the reader cannot read (interlaced, a throw): the browser's pixels,
      how:"browser", with the why - as before. The inverted authority is gone
      and the comments that assumed the browser exact are superseded with the
      measurement; pngPlain goes with the rule it served. Every caller keeps
      its meaning: fixBrowserRead and the folder note's "read by the browser"
      still name the files the browser read, and the single readout's "read
      by the browser (why)" is still that case.
   2. fixGridPixels(r): the saved picture as pixels - r's own, or the 1280
      canvas filled by nearest mapping floor((x+0.5)*W/S), exactly what
      fixGridCanvas's drawImage decided - and fixGridBytes(r): those pixels
      through pngEncode. Every save path uses them: finish() (fixBatchFiles[]
      .data, so the zip and Save all to project are exact through it),
      fixResultBytes (Save to project), fixDownload, fixRecentFromRun. The
      editor hand-offs read the same pixels: fixOpen takes fixGridPixels
      instead of getImageData off the canvas, and fixOpenOne (a tile or a
      rail entry) decodes the saved bytes with pngDecode first. fixScaledBytes
      stays as scale mode's name for the same bytes. fixGridCanvas remains,
      drawn FROM fixGridPixels (putImageData, no scaling draw), for what is
      shown: the tile thumbnails. fixShow and the before-preview are display.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const page = fs.readFileSync(s0.FILE, 'utf8');
if (page.indexOf('function pngPlain(bytes){') < 0) throw new Error('pngPlain is not in this page (patch623 already applied, or the page is not 004c0d8)');
const doc = s0.start([
  ['async function pngDecode(u8){', 'pngDecode is not in this page'],
  ['async function pngEncode(rgba,W,H){', 'pngEncode is not in this page'],
  ['function fixGridCanvas(r){', 'fixGridCanvas is not in this page'],
]);
/* A region from one exact-once start to the end of the function that follows
   `endFrom` (its closing brace at column 0), as patch618 does. */
const region = (startText, endFrom) => {
  const a = page.indexOf(startText); if (a < 0 || page.indexOf(startText, a + 1) >= 0) throw new Error('expected one ' + startText.slice(0, 60));
  const f = page.indexOf(endFrom, a); if (f < 0) throw new Error('no ' + endFrom);
  const e = page.indexOf(NL + '}' + NL, f); return page.slice(a, e + NL.length + 1);
};

/* 1. the decode: comment, pngPlain and fixDecodeFile -> the reader as the authority */
doc.swap(region('/* THE PICTURE\'S PIXELS, FROM THE FILE. A PNG through pngDecode, checked', 'async function fixDecodeFile(file){'), [
  '/* THE PICTURE\'S PIXELS, FROM THE FILE. A PNG the page\'s reader can read is',
  '   pngDecode\'s pixels - exact by construction - and how:"png". Anything else',
  '   (not a PNG; interlaced; a reader throw; a reader size that is not the',
  '   browser\'s) is the browser\'s canvas pixels, how:"browser", with the why,',
  '   and the run repeats it where it matters.',
  '',
  '   SUPERSEDED (patch623, 2026-10-01). Until then the browser was the judge:',
  '   pngDecode was "checked against the browser wherever the browser is exact -',
  '   every alpha, and the colour of every pixel at alpha 255" and refused when',
  '   they disagreed; and for "A PNG THE BROWSER READS EXACTLY, where it has no',
  '   translucent pixel: 8-bit, not interlaced, and no colour-management chunk',
  '   before the pixels" (pngPlain) the page returned the BROWSER\'S pixels -',
  '   "READ ONCE when reading twice could change nothing". Measured 2026-10-01',
  '   in the owner\'s Chrome on the live page (65ecad7): for exactly those PNGs',
  '   the canvas pixels differed from pngDecode\'s by one unit in one channel on',
  '   a few hundred OPAQUE pixels per picture - Tesseract Bookshelves 250 of',
  '   1,638,400, Dark Skin 98, Blue Party Hat 34; alpha identical - so the',
  '   engine\'s input was off by one, and on busy pictures the k-means ties',
  '   flipped: 12 of 75 final-project traits differed from an exact offline run',
  '   (Tesseract 564 of 6,400 cells, Suburban Sidewalk 192, Market Makers Sakura',
  '   124, Blue Camo Skin 70). Headless Chromium may not show the noise; the',
  '   owner\'s Chrome is where it was measured. So the reader is the authority',
  '   and the browser is asked for its size alone - no canvas is drawn for a',
  `   readable PNG. pngPlain is gone with the rule it served. The old prose`,
  `   also said "A 16-bit, interlaced or colour-managed file is one where the`,
  `   browser and the page's reader can disagree, and that disagreement is`,
  `   disclosed, so those are still read both ways": now a 16-bit PNG is the`,
  `   reader's (its high byte, as before), a colour-managed one the reader's`,
  `   bytes as written, and only an interlaced one the browser's, named. */`,
  'async function fixDecodeFile(file){',
  '  let bm;',
  '  try{ bm=await createImageBitmap(file); }catch(_){ return null; }',
  '  const W=bm.width, H=bm.height;',
  '  /* THE FALLBACK, drawn only when it is needed. */',
  '  const via=(why)=>{',
  '    const c=document.createElement("canvas"); c.width=W; c.height=H;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.drawImage(bm,0,0); if(bm.close) bm.close();',
  '    const browser=g.getImageData(0,0,W,H).data;',
  '    c.width=1; c.height=1;',
  '    return {data:browser, width:W, height:H, how:"browser", why:why};',
  '  };',
  '  let bytes=null;',
  '  try{ bytes=new Uint8Array(await file.arrayBuffer()); }catch(_){ bytes=null; }',
  '  if(!bytes||!pngIs(bytes)) return via("not a PNG");',
  '  let d;',
  '  try{ d=await pngDecode(bytes); }catch(e){ return via(String((e&&e.message)||e)); }',
  '  if(d.width!==W||d.height!==H) return via("size "+d.width+"\\u00d7"+d.height+" against the browser\'s "+W+"\\u00d7"+H);',
  '  if(bm.close) bm.close();',
  '  return {data:d.data, width:W, height:H, how:"png", why:""};',
  '}',
  '',
]);

/* 2. the saved picture as pixels and as bytes: fixGridPixels, fixGridBytes; fixScaledBytes stays as a name */
doc.swap(region('/* A SCALE-ONLY RESULT AS BYTES, without the canvas: the picture\'s own', 'async function fixScaledBytes(r){'), [
  '/* THE SAVED PICTURE AS PIXELS, WITHOUT A CANVAS (patch623): the result\'s own',
  '   pixels, or - when Save at 1280 is on and the result is not already that',
  '   size - the collection canvas filled by nearest neighbour under the',
  '   browser\'s rule (each output pixel takes the source pixel under its centre,',
  '   floor((x+0.5)*w/W), measured for the harness), which is exactly what',
  '   fixGridCanvas\'s drawImage decided; a fresh buffer either way. One rule for',
  '   every way out - the folder run, Save to project, the download, the recent',
  '   rail, the editor - so the switch means one thing. */',
  'function fixGridPixels(r){',
  '  const on=$("fixgrid")&&$("fixgrid").checked;',
  '  const W=r.width, H=r.height, S=CANVAS_SIDE;',
  '  if(!on||(W===S&&H===S)) return {data:new Uint8ClampedArray(r.data), width:W, height:H};',
  '  const data=r.data, out=new Uint8ClampedArray(S*S*4);',
  '  const mx=new Int32Array(S), my=new Int32Array(S);',
  '  for(let x=0;x<S;x++) mx[x]=Math.min(W-1,Math.floor((x+0.5)*W/S));',
  '  for(let y=0;y<S;y++) my[y]=Math.min(H-1,Math.floor((y+0.5)*H/S));',
  '  for(let y=0;y<S;y++){',
  '    const sy=my[y]*W, dy=y*S;',
  '    for(let x=0;x<S;x++){ const s=(sy+mx[x])*4, d=(dy+x)*4; out[d]=data[s]; out[d+1]=data[s+1]; out[d+2]=data[s+2]; out[d+3]=data[s+3]; }',
  '  }',
  '  return {data:out, width:S, height:S};',
  '}',
  '/* AND AS PNG BYTES, by the page\'s own pngEncode. SUPERSEDED (patch623,',
  '   2026-10-01): until then only a scale-only result was written this way',
  '   (fixScaledBytes, patch509 - "every visible pixel goes out as the byte it',
  '   came in; the canvas path rounded translucent ones") and the engine path',
  '   was left on the canvas, "exact for it" because its output has no',
  '   translucency. Measured 2026-10-01 in the owner\'s Chrome with the page\'s own',
  '   pngDecode on the saved bytes: the canvas path (fixGridCanvas + toBlob) left',
  '   2 to 8 OPAQUE pixels per picture off by one from their cell\'s colour',
  '   (#000001 beside #000000, #ec8099 beside #ed8099); putImageData +',
  '   convertToBlob in a worker did the same; a pure encode is exact. Headless',
  '   Chromium may not show it; the owner\'s Chrome is where it was measured. */',
  'async function fixGridBytes(r){',
  '  const p=fixGridPixels(r);',
  '  return pngEncode(p.data,p.width,p.height);',
  '}',
  '/* Scale mode\'s name for the same bytes, kept for its callers. */',
  'async function fixScaledBytes(r){ return fixGridBytes(r); }',
  '',
]);

/* 3. Save to project: fixResultBytes */
doc.swap([
  '/* A RESULT AS THE BYTES A SAVE WRITES: a scaled result as its own pixels',
  '   (fixScaledBytes), anything the engine made through fixGridCanvas. */',
  'async function fixResultBytes(r){',
  '  if(r.consensus==="scaled") return fixScaledBytes(r);',
  '  const c=fixGridCanvas(r);',
  '  const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
  '  c.width=1; c.height=1;',
  '  return new Uint8Array(await blob.arrayBuffer());',
  '}',
], [
  '/* A RESULT AS THE BYTES A SAVE WRITES: fixGridBytes, for every kind of',
  '   result. (Until patch623: "a scaled result as its own pixels',
  '   (fixScaledBytes), anything the engine made through fixGridCanvas" - see',
  '   fixGridBytes for the measurement that ended the canvas path.) */',
  'async function fixResultBytes(r){ return fixGridBytes(r); }',
]);

/* 4. the folder run's finish(): the bytes first, the tile from the same pixels */
doc.swap([
  '      /* The same canvas the single save uses, so the switch means one thing. */',
  '      const oc=fixGridCanvas(out);',
  '      const blob=scale ? null : await new Promise(res=>oc.toBlob(res,"image/png"));',
], [
  '      /* THE SAVED PICTURE, as pixels and as bytes, by the same rule the single',
  '         save uses (fixGridPixels, pngEncode), so the switch means one thing -',
  '         and no canvas between the cells and the file; see fixGridBytes',
  '         (patch623). oc is the same pixels on a canvas, for the tile only. */',
  '      const sv=fixGridPixels(out);',
  '      const data=await pngEncode(sv.data,sv.width,sv.height);',
  '      const oc=fixCanvasOf(sv);',
]);
doc.swap('        data:scale ? await fixScaledBytes(out) : new Uint8Array(await blob.arrayBuffer()),',
  '        data:data,');

/* 5. the recent rail's copy of a single run */
doc.swap([
  '    const c=fixGridCanvas(r);',
  '    const W=c.width, H=c.height;',
  '    const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
  '    const t=fitSize(W,H,SHELF_THUMB);',
], [
  '    /* The bytes the save writes, and the same pixels on a canvas for the',
  '       thumbnail only (patch623). */',
  '    const sv=fixGridPixels(r);',
  '    const W=sv.width, H=sv.height;',
  '    const data=await pngEncode(sv.data,W,H);',
  '    const c=fixCanvasOf(sv);',
  '    const t=fitSize(W,H,SHELF_THUMB);',
]);
doc.swap([
  '      data:new Uint8Array(await blob.arrayBuffer()),',
  '      cells:r.width, w:W, h:H, tw:t.w, th:t.h}, tb);',
], [
  '      data:data,',
  '      cells:r.width, w:W, h:H, tw:t.w, th:t.h}, tb);',
]);

/* 6. the display canvas, drawn from the saved pixels */
doc.swap([
  '   Nearest neighbour, because this is a resize of pixel art. Where the side',
  '   divides evenly every pixel comes out the same width; where it does not',
  '   they differ by one, which is what the readout warns about before the run',
  '   rather than after 320 of them. */',
  'function fixGridCanvas(r){',
  '  const c=document.createElement("canvas");',
  '  const on=$("fixgrid")&&$("fixgrid").checked;',
  '  c.width=on?CANVAS_SIDE:r.width; c.height=on?CANVAS_SIDE:r.height;',
  '  const g=c.getContext("2d");',
  '  g.imageSmoothingEnabled=false;',
  '  const src=document.createElement("canvas"); src.width=r.width; src.height=r.height;',
  '  const im=src.getContext("2d").createImageData(r.width,r.height);',
  '  im.data.set(r.data);',
  '  src.getContext("2d").putImageData(im,0,0);',
  '  g.drawImage(src,0,0,c.width,c.height);',
  '  src.width=1; src.height=1;',
  '  return c;',
  '}',
], [
  '   Nearest neighbour, because this is a resize of pixel art. Where the side',
  '   divides evenly every pixel comes out the same width; where it does not',
  '   they differ by one, which is what the readout warns about before the run',
  '   rather than after 320 of them.',
  '',
  '   SUPERSEDED IN PART (patch623, 2026-10-01): this was the canvas every save',
  '   was encoded from (toBlob), by a scaling drawImage. The resize is',
  '   fixGridPixels now - the same nearest-neighbour answer, in arithmetic - and',
  '   this canvas is drawn from those pixels (putImageData, no scaling draw) for',
  '   what is SHOWN: the tile thumbnails. The saved bytes are fixGridBytes; see',
  '   there for the measurement. */',
  'function fixCanvasOf(p){',
  '  const c=document.createElement("canvas"); c.width=p.width; c.height=p.height;',
  '  const g=c.getContext("2d");',
  '  const im=g.createImageData(p.width,p.height); im.data.set(p.data); g.putImageData(im,0,0);',
  '  return c;',
  '}',
  'function fixGridCanvas(r){ return fixCanvasOf(fixGridPixels(r)); }',
]);

/* 7. the download: one path, the bytes a save writes */
doc.swap([
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
  '  /* Through the same canvas the batch writes, so one switch decides both',
  '     and there is no second answer to what a save is. */',
  '  const c=fixGridCanvas(r);',
  '  c.toBlob(b=>{',
  '    const a=document.createElement("a"); a.href=URL.createObjectURL(b);',
  '    a.download=FIX.name+"-fixed.png"; a.click();',
  '    setTimeout(()=>URL.revokeObjectURL(a.href),1000);',
  '    c.width=1; c.height=1;',
  '  },"image/png");',
  '}',
], [
  '  /* EVERY RESULT GOES OUT AS ITS OWN BYTES - the bytes the batch and Save',
  '     to project write (fixResultBytes) - so one switch decides all three and',
  '     there is no second answer to what a save is. Until patch623 only a',
  '     scaled result went this way ("so a translucent pixel is the byte it',
  '     came in as") and the rest "through the same canvas the batch writes";',
  '     see fixGridBytes for the measurement that ended that. */',
  '  fixResultBytes(r).then(bytes=>{',
  '    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));',
  '    a.download=FIX.name+"-fixed.png"; a.click();',
  '    setTimeout(()=>URL.revokeObjectURL(a.href),1000);',
  '  });',
  '}',
]);

/* 8. the editor, from a single run: the save pixels, not a read back off the canvas */
doc.swap([
  '  /* THROUGH THE SAVE CANVAS, not the raw result. The switch says what a',
  '     save is, and the editor is the third way out - it used to be handed',
  '     the fixer\'s own 160px answer while the Download button wrote 1280, so',
  '     an evening of editing saved at 160. See patch410. */',
  '  const c=fixGridCanvas(r);',
  '  const W=c.width, H=c.height;',
  '  const d=new Uint8ClampedArray(c.getContext("2d",{willReadFrequently:true})',
  '    .getImageData(0,0,W,H).data);',
  '  /* Released before the editor takes over: at 1280 this is 6.5 MB and the',
  '     bytes have already been copied out of it. */',
  '  c.width=1; c.height=1;',
  '  fileName=FIX.name+"-fixed.png";',
], [
  '  /* THROUGH THE SAVE PIXELS, not the raw result. The switch says what a',
  '     save is, and the editor is the third way out - it used to be handed',
  '     the fixer\'s own 160px answer while the Download button wrote 1280, so',
  '     an evening of editing saved at 160. See patch410. (Until patch623 they',
  '     were read back off the save canvas with getImageData; fixGridPixels is',
  '     that answer in arithmetic, and already a fresh buffer.) */',
  '  const sv=fixGridPixels(r);',
  '  const W=sv.width, H=sv.height, d=sv.data;',
  '  fileName=FIX.name+"-fixed.png";',
]);

/* 9. the editor, from a tile or the rail: the page's reader on the saved bytes */
doc.swap([
  '  let bm;',
  '  try{ bm=await createImageBitmap(new Blob([f.data],{type:"image/png"})); }',
  '  catch(_){ fixBatchSay("That one could not be opened."); return; }',
  '  const W=bm.width, H=bm.height;',
  '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
  '  const g=c.getContext("2d",{willReadFrequently:true});',
  '  g.drawImage(bm,0,0);',
  '  if(bm.close) bm.close();',
  '  const d=g.getImageData(0,0,W,H).data;',
  '  c.width=1; c.height=1;',
  '  fileName=f.name.split("/").pop();',
], [
  '  /* THE PAGE\'S OWN READER FIRST (patch623): the bytes are pngEncode\'s, so',
  '     pngDecode gives back exactly the cells that were saved. The browser\'s',
  '     canvas - which rounds opaque pixels by one on the owner\'s machine, see',
  '     fixDecodeFile - is the fallback for bytes the reader cannot read. */',
  '  let W,H,d;',
  '  try{ const p=await pngDecode(f.data); W=p.width; H=p.height; d=p.data; }',
  '  catch(_){',
  '    let bm;',
  '    try{ bm=await createImageBitmap(new Blob([f.data],{type:"image/png"})); }',
  '    catch(_2){ fixBatchSay("That one could not be opened."); return; }',
  '    W=bm.width; H=bm.height;',
  '    const c=document.createElement("canvas"); c.width=W; c.height=H;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.drawImage(bm,0,0);',
  '    if(bm.close) bm.close();',
  '    d=g.getImageData(0,0,W,H).data;',
  '    c.width=1; c.height=1;',
  '  }',
  '  fileName=f.name.split("/").pop();',
]);
doc.swap([
  '  /* The saved bytes are the same canvas, so the same arithmetic. The count',
  '     is kept on the result for exactly this. */',
], [
  '  /* The saved bytes are fixGridPixels\' answer under the same switch, so the',
  '     same arithmetic (until patch623: "the same canvas"). The count is kept on',
  '     the result for exactly this. */',
]);

/* 10. the gate's comment names the rule where it lives now */
doc.swap('   made from the result by the same nearest-neighbour rule fixGridCanvas',
  '   made from the result by the same nearest-neighbour rule fixGridPixels');

/* 9. the folder note's comment: the browser no longer judges the reader */
doc.swap([`  /* A PNG THE PAGE'S OWN READER DID NOT TAKE, or disagreed with the`, `     browser on: read by the browser instead, and named. */`].join(NL),
  [`  /* A PNG THE PAGE'S OWN READER DID NOT TAKE - not a PNG, interlaced, a`, `     reader throw, or a size the browser disagrees with - read by the`, `     browser instead, and named. (patch623: "or disagreed with the browser`, `     on" is gone - the reader is the authority; see fixDecodeFile.) */`].join(NL));
doc.finish(({ code, must }) => {
  must('async function fixDecodeFile(file){', 'fixDecodeFile');
  must('return {data:d.data, width:W, height:H, how:"png", why:""};', 'the reader\'s pixels are the answer');
  if (code.indexOf('return {data:browser, width:W, height:H, how:"png"') >= 0) throw new Error('fixDecodeFile still returns the browser\'s pixels as how:"png"');
  if (code.indexOf('the reader disagreed with the browser') >= 0) throw new Error('the browser still judges the reader');
  if (/\bpngPlain\b/.test(code)) throw new Error('pngPlain is still referenced');
  must('function fixGridPixels(r){', 'the pixels helper');
  must('async function fixGridBytes(r){', 'the bytes helper');
  must('async function fixScaledBytes(r){ return fixGridBytes(r); }', 'scale mode\'s name stays');
  must('async function fixResultBytes(r){ return fixGridBytes(r); }', 'Save to project');
  must('function fixCanvasOf(p){', 'the display canvas');
  must('function fixGridCanvas(r){ return fixCanvasOf(fixGridPixels(r)); }', 'fixGridCanvas draws from the pixels');
  must('const sv=fixGridPixels(out);', 'the folder run maps');
  must('const data=await pngEncode(sv.data,sv.width,sv.height);', 'the folder run encodes');
  must('  fixResultBytes(r).then(bytes=>{', 'the download');
  must('  try{ const p=await pngDecode(f.data); W=p.width; H=p.height; d=p.data; }', 'the tile/rail opens through the reader');
  /* NO FIXER SAVE PATH CALLS toBlob ON THE GRID CANVAS: between fixDecodeFile
     and PB.fix the only toBlob is the thumbnail's (tc). */
  const a = code.indexOf('async function fixDecodeFile(file){'), b = code.indexOf('PB.fix=async function(o){');
  if (a < 0 || b < a) throw new Error('the fixer region is not where it was');
  const fixer = code.slice(a, b);
  const blobs = [...fixer.matchAll(/(\w+)\.toBlob\(/g)].map(m => m[1]);
  if (blobs.length !== 2 || blobs.some(n => n !== 'tc')) throw new Error('toBlob in the fixer on: ' + JSON.stringify(blobs) + ' (only the two thumbnail canvases, tc, may)');
  if (/fixGridCanvas\([^)]*\)[\s\S]{0,200}?toBlob/.test(fixer)) throw new Error('a toBlob follows a fixGridCanvas');
  if (/\.drawImage\(src,0,0,c\.width,c\.height\)/.test(fixer)) throw new Error('the scaling drawImage is still there');
});
