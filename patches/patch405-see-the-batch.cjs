/* A BATCH SHOWED A SENTENCE AND A ZIP BUTTON.

   "theres no preview when i import more than one image so i cant actually see
   how it went make that like when im working on it in project"

   One image gives you before and after side by side. Several gave you
   "6 of 6 done in 4.2s" and a download - so the only way to find out whether
   the fixer got the grid right on any of them was to unpack the zip and open
   them. On a run of 320 that is the difference between seeing a bad detection
   immediately and finding it after everything is filed.

   So the results appear as they are made, as a grid of tiles, the way the
   shelf shows traits. Progressive on purpose: the tile is there the moment
   its image is done, so a long run is something you watch rather than wait
   on, and a wrong pixel size shows up on tile three instead of at the end.

   THE TILE IS A THUMBNAIL, AND THAT IS NOT A DETAIL. A result is
   1280x1280 now, which is 6.5 MB of decoded image each; 500 of those is
   3.2 GB and is exactly the shape of the crash the shelf already had - see
   pixelbench-shelf-canvas-oom and the note above SHELF_THUMB. The thumbnail
   is built from the output canvas while it is still in hand, at the same
   fitSize cap the shelf uses, and it is the ONLY copy the grid holds: a
   1280 result comes down to 160x160, so five hundred tiles is about 51 MB
   rather than 3.2 GB. fitSize picks a whole divisor where one exists - 1280
   over 8 - so the tile is still true pixel art and not a resampled blur.

   The full bytes are never decoded for the grid. Clicking a tile opens that
   one in the editor, which decodes exactly one, the same way the single
   result's Open in the editor already does.

   OBJECT URLS ARE REVOKED, not left to the page's lifetime. A second batch
   would otherwise hold the first one's five hundred blobs with nothing
   pointing at them. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- where they go ------------------------------------------------ */
{
  const at = kit.only(L, l => l === '    <p class="note mono" id="fixsaveout"></p>', 'the save line');
  kit.replace(L, { start: at, end: at }, [
    '    <p class="note mono" id="fixsaveout"></p>',
    '    <!-- Filled as each one finishes, so a long run is watched rather than',
    '         waited on. Tiles are thumbnails: see patch405. -->',
    '    <div class="fixgridout" id="fixresults" hidden></div>',
  ]);
}

/* ---- the tiles ---------------------------------------------------- */
{
  const at = kit.only(L, l => l === '.fixpair{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:10px;}',
    'the pair rule');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE BATCH, SEEN. Same shape as the shelf: a grid that fills the width',
    '   with whatever tiles fit, capped in height so a run of five hundred does',
    '   not push the buttons off the screen. */',
    '.fixgridout{display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr));',
    '  gap:9px; margin-top:10px; max-height:52dvh; overflow-y:auto; padding:2px;}',
    '.fixtile{display:flex; flex-direction:column; gap:4px; padding:0; border:0;',
    '  background:transparent; font:inherit; color:inherit; cursor:pointer; text-align:center;}',
    '/* Pixelated, and on the same chequer the pair uses, or transparency in a',
    '   trait reads as white and a white trait reads as empty. */',
    '/* height:auto MATTERS HERE. The tile carries width= and height= attributes',
    '   so the grid does not jump as each image loads, and those map to real CSS',
    '   declarations that beat aspect-ratio - measured on the page, the tile came',
    '   out 105 wide and 160 tall, stretched. auto hands the sizing back. */',
    '.fixtile img{width:100%; height:auto; aspect-ratio:1; object-fit:contain;',
    '  image-rendering:pixelated;',
    '  background:repeating-conic-gradient(#ffffff10 0 25%,transparent 0 50%) 0 0/12px 12px;',
    '  border:1px solid var(--line); border-radius:8px;}',
    '.fixtile:hover img{border-color:var(--accent);}',
    '.fixtile:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:8px;}',
    '.fixtile b{font-weight:600; font-size:11px; overflow:hidden; text-overflow:ellipsis;',
    '  white-space:nowrap;}',
    '.fixtile span{font-size:10px; color:var(--dim);}',
  ]);
}

/* ---- built while the output canvas is still in hand ---------------- */
{
  const at = kit.only(L, l => l === '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));',
    'where the result is encoded');
  kit.replace(L, { start: at, end: at }, [
    '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));',
    '    /* THE TILE, TAKEN HERE because oc is about to be released and this is',
    '       the only moment the picture exists as a canvas. A 1280 result is',
    '       6.5 MB decoded and five hundred of them is the shelf crash again,',
    '       so what the grid keeps is 160x160 - fitSize at the shelf cap, whole',
    '       divisor where there is one, so it stays true pixel art. */',
    '    const t=fitSize(oc.width,oc.height,SHELF_THUMB);',
    '    const tc=document.createElement("canvas"); tc.width=t.w; tc.height=t.h;',
    '    const tg=tc.getContext("2d"); tg.imageSmoothingEnabled=false;',
    '    tg.drawImage(oc,0,0,t.w,t.h);',
    '    const tb=await new Promise(res=>tc.toBlob(res,"image/png"));',
    '    tc.width=1; tc.height=1;',
  ]);
  const push = kit.only(L, l => l === '    fixBatchFiles.push({name:fixZipName(rel,name),', 'where a result is kept');
  if (L[push + 3].indexOf('w:oc.width, h:oc.height});') < 0)
    throw new Error('the kept result is not shaped the way this expects');
  kit.replace(L, { start: push + 3, end: push + 3 }, [
    '      thumb:URL.createObjectURL(tb), tw:t.w, th:t.h,',
    '      w:oc.width, h:oc.height});',
  ]);
  /* And it appears the moment it exists, rather than at the end. */
  const after = kit.only(L, l => l === '    oc.width=1; oc.height=1; c.width=1; c.height=1;',
    'where the canvases are released');
  kit.replace(L, { start: after, end: after }, [
    '    oc.width=1; oc.height=1; c.width=1; c.height=1;',
    '    fixTile(fixBatchFiles[fixBatchFiles.length-1]);',
  ]);
}

/* ---- the grid ----------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixBatchDownload(){', 'the zip button');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* ONE TILE. Appended as its image finishes, so the grid fills while the run',
    '   is still going and a wrong pixel size is visible on tile three rather',
    '   than after three hundred. */',
    'function fixTile(f){',
    '  const grid=$("fixresults"); if(!grid||!f) return;',
    '  grid.hidden=false;',
    '  const b=document.createElement("button");',
    '  b.className="fixtile"; b.type="button";',
    '  b.title="Open "+f.name+" in the editor";',
    '  const im=document.createElement("img");',
    '  im.src=f.thumb; im.alt=f.name; im.loading="lazy";',
    '  im.width=f.tw; im.height=f.th;',
    '  const nm=document.createElement("b"); nm.textContent=f.name.split("/").pop();',
    '  const sz=document.createElement("span"); sz.textContent=f.w+"\\u00d7"+f.h;',
    '  b.append(im,nm,sz);',
    '  b.onclick=()=>fixOpenOne(f);',
    '  grid.appendChild(b);',
    '}',
    '/* THE ONLY PLACE A RESULT IS DECODED AT FULL SIZE, and one at a time. The',
    '   grid never does this - it would be five hundred decodes of 1280x1280. */',
    'async function fixOpenOne(f){',
    '  if(!f||!f.data) return;',
    '  if(typeof mayUse==="function"&&!mayUse()) return;',
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
    '  startEditor(new Uint8ClampedArray(d),W,H,W,H,palette(d,W*H,24,64),false);',
    '}',
    '/* A SECOND RUN MUST NOT KEEP THE FIRST ONE\'S BLOBS. Nothing points at them',
    '   once the grid is emptied, and an object URL is not collected on its own. */',
    'function fixTilesClear(){',
    '  for(const f of (fixBatchFiles||[])) if(f&&f.thumb) try{ URL.revokeObjectURL(f.thumb); }catch(_){ }',
    '  const grid=$("fixresults");',
    '  if(grid){ grid.innerHTML=""; grid.hidden=true; }',
    '}',
  ]);
  /* Cleared at the start of a run, before the list it reads is replaced. */
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const reset = kit.only(L, l => l === '  fixBatchFiles=[]; fixBatchStop=false;', 'where the batch resets', r);
  kit.replace(L, { start: reset, end: reset }, [
    '  /* BEFORE the list is replaced: it is what holds the urls to revoke. */',
    '  fixTilesClear();',
    '  fixBatchFiles=[]; fixBatchStop=false;',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  if (text.indexOf('id="fixresults"') < 0) throw new Error('there is nowhere for the tiles to go');

  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  /* THE THUMBNAIL IS THE ONLY COPY THE GRID HOLDS. A tile pointed at the full
     bytes would be five hundred decodes of 1280x1280 - the shelf crash. */
  if (!/fitSize\(oc\.width,oc\.height,SHELF_THUMB\)/.test(bb))
    throw new Error('the tile is not built at the thumbnail cap');
  if (!/thumb:URL\.createObjectURL\(tb\)/.test(bb))
    throw new Error('the tile does not get its own small image');
  const tile = kit.inFunction(codeLines, 'function fixTile(f){');
  const tb = codeLines.slice(tile.start, tile.end + 1).join('\n');
  if (/f\.data/.test(tb))
    throw new Error('a tile reaches for the full-size bytes, which is the crash this avoids');
  if (!/im\.src=f\.thumb;/.test(tb))
    throw new Error('the tile is not showing the thumbnail');
  /* AND IT APPEARS AS IT IS MADE, not at the end. */
  if (!/fixTile\(fixBatchFiles\[fixBatchFiles\.length-1\]\);/.test(bb))
    throw new Error('the tiles are not added as each result finishes');
  /* Cleared before the list that holds the urls is replaced, or they leak. */
  const clearAt = bb.indexOf('fixTilesClear();');
  const resetAt = bb.indexOf('fixBatchFiles=[];');
  if (clearAt < 0 || resetAt < 0 || clearAt > resetAt)
    throw new Error('the old tiles are cleared after the list they need is gone');
  const cl = kit.inFunction(codeLines, 'function fixTilesClear(){');
  if (!/revokeObjectURL\(f\.thumb\)/.test(codeLines.slice(cl.start, cl.end + 1).join('\n')))
    throw new Error('the old blobs are not released');
  /* One decode at a time, and only on a click. */
  const one = kit.inFunction(codeLines, 'async function fixOpenOne(f){');
  const ob = codeLines.slice(one.start, one.end + 1).join('\n');
  if (!/createImageBitmap/.test(ob)) throw new Error('opening one does not decode it');
  if (!/if\(bm\.close\) bm\.close\(\);/.test(ob))
    throw new Error('opening one leaves the bitmap open');
  const decodes = (code.match(/createImageBitmap/g) || []).length;
  if (decodes < 2) throw new Error('the decode sites changed unexpectedly: ' + decodes);
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
