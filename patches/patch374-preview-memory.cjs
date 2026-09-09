/* THE CHARACTER VIEWS HOLD THE COLLECTION TOO, AND THE SHEET IS 75 MB.

   patch372 fixed the shelf's tiles and patch373 stopped autoCanvas keeping what
   it decodes. Two things are left on the same road, both measured:

     drawSheet(12)   #ccanvas becomes 5126x3844 = 75.2 MB, on a canvas the CSS
                     shows at min(900px,72vw) - 270 px on a phone.
     cBitmaps        a Map from record id to a full-size ImageBitmap with no
                     bound at all. Every trait ever composited into a character
                     stays. Twelve characters is up to ~120 traits, which at
                     1280x1280 is 780 MB, and it only grows.

   WHAT CHANGES.

   1. THE SHEET IS AN OVERVIEW AND IS DRAWN AT OVERVIEW SIZE. Each character is
      still composited at the full canvas size into one reused scratch tile, so
      paintTrait gets exactly the canvas it got before and every whole-number
      scale it computes is unchanged - only the copy onto the sheet is smaller.
      A cell caps at 320, and 1280 divides by 4 to reach it exactly, so the cell
      is a whole division like the shelf's thumbnails. Twelve cells is 5.0 MB
      against 75.2, and at the 900px the sheet is shown at, a 320px cell is
      still being scaled DOWN - so nothing is lost on the screen it is judged on
      either.

   2. THE BITMAP CACHE GETS A BUDGET. 96 MB, evicting least-recently-used and
      CLOSING what it evicts. A Map iterates in insertion order and a hit
      re-inserts, which is the whole of the LRU. Every existing use fetches a
      bitmap and draws it with no await in between, so nothing can be holding
      one when it is evicted - that is why a budget is safe here and would not
      be somewhere else.

   3. AND WHAT INVALIDATION ALREADY MEANT, PROPERLY. Three places delete one
      record from the cache when its artwork changes. They now go through
      cBitmapDrop, which keeps the byte count honest, closes the bitmap, and
      also drops that record's cached PIXEL BLOCK and the memoised canvas side.
      That last part fixes something that was already wrong: blockOf was never
      cleared, and autoKey is built from ids and SIZES, so re-saving a trait
      with different artwork at the same size left autoCanvas answering from the
      old picture forever. Nobody was going to see that until they did.

   fitSize is thumbSize generalised over its cap. thumbSize keeps its name, its
   signature and its answers - the patch runs both to prove it.

   WRITTEN THROUGH A RENAME, because agents are reading this file. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1: fitSize, and thumbSize on top of it ---------------------- */
{
  const r = kit.inFunction(L, 'function thumbSize(w,h){');
  const body = L.slice(r.start, r.end + 1);
  if (!/SHELF_THUMB/.test(body.join('\n')))
    throw new Error('thumbSize does not mention the cap it is being generalised over');
  kit.replace(L, r, [
    '/* THE SAME RULE AT A DIFFERENT CAP. thumbSize was written for the shelf and',
    '   the sheet wants exactly its arithmetic at 320 rather than 192, so the cap',
    '   became an argument. thumbSize keeps its name and its answers. */',
    'const SHEET_CELL=320;',
    'function fitSize(w,h,cap){',
    '  w=Math.max(1,Math.round(w)||1); h=Math.max(1,Math.round(h)||1);',
    '  const long=Math.max(w,h);',
    '  if(long<=cap) return {w:w,h:h};',
    '  const lo=Math.ceil(long/cap), hi=Math.floor(long/Math.round(cap*0.6));',
    '  for(let n=lo;n<=hi;n++) if(w%n===0&&h%n===0) return {w:w/n,h:h/n};',
    '  const k=cap/long;',
    '  return {w:Math.max(1,Math.round(w*k)),h:Math.max(1,Math.round(h*k))};',
    '}',
    'function thumbSize(w,h){ return fitSize(w,h,SHELF_THUMB); }',
  ]);
}

/* ---- 2: the bitmap cache gets a budget --------------------------- */
{
  const r = kit.inFunction(L, 'async function cBitmap(rec){');
  if (L[r.start + 1] !== '  if(cBitmaps.has(rec.id)) return cBitmaps.get(rec.id);')
    throw new Error('cBitmap does not open with the lookup this expects');
  kit.replace(L, r, [
    '/* HOW MUCH DECODED ARTWORK THE CHARACTER VIEWS MAY HOLD.',
    '',
    '   This Map had no bound. Every trait ever composited into a character was',
    '   kept at full size for the life of the page, and a twelve-character sheet',
    '   reaches about 120 of them - 780 MB at 1280x1280, measured by size rather',
    '   than guessed. On a phone that is the tab.',
    '',
    '   96 MB is roughly fourteen traits at the collection size, and a single',
    '   character is about ten, so the view that matters most never evicts',
    '   anything mid-draw. The sheet will evict and re-decode as it goes, which',
    '   is the trade this exists to make.',
    '',
    '   LEAST RECENTLY USED, and the Map is the queue: it iterates in insertion',
    '   order, and a hit below deletes and re-inserts so the oldest key really is',
    '   the first one out. Safe only because every caller fetches a bitmap and',
    '   draws it with no await in between, so nothing can be holding one that',
    '   gets closed underneath it. */',
    'const CBITMAP_BUDGET=96*1048576;',
    'let cBitmapBytes=0;',
    'async function cBitmap(rec){',
    '  const had=cBitmaps.get(rec.id);',
    '  if(had){ cBitmaps.delete(rec.id); cBitmaps.set(rec.id,had); return had; }',
    '  const bm=await createImageBitmap(rec.blob);',
    '  cBitmaps.set(rec.id,bm);',
    '  cBitmapBytes+=bm.width*bm.height*4;',
    '  while(cBitmapBytes>CBITMAP_BUDGET && cBitmaps.size>1){',
    '    const oldest=cBitmaps.keys().next().value;',
    '    const gone=cBitmaps.get(oldest);',
    '    cBitmaps.delete(oldest);',
    '    cBitmapBytes-=gone.width*gone.height*4;',
    '    if(gone.close) gone.close();',
    '  }',
    '  return bm;',
    '}',
    '/* ONE RECORD OUT, when its artwork has changed or it is gone.',
    '',
    '   Three places did this with cBitmaps.delete, which since the budget above',
    '   would leave the byte count claiming memory that had been released and',
    '   quietly shrink the cache to nothing. It also does the two things those',
    '   places always meant and never said: the record\'s cached PIXEL BLOCK is',
    '   dropped, and the memoised canvas side is forced to recompute. blockOf was',
    '   never cleared by any of them, and autoKey is built from ids and SIZES -',
    '   so re-saving a trait with different artwork at the same size left',
    '   autoCanvas answering from the picture before the edit, for the rest of',
    '   the session. */',
    'function cBitmapDrop(id){',
    '  const bm=cBitmaps.get(id);',
    '  if(bm){',
    '    cBitmaps.delete(id);',
    '    cBitmapBytes-=bm.width*bm.height*4;',
    '    if(bm.close) bm.close();',
    '  }',
    '  try{ blockOf.delete(id); autoKey=""; autoSide=null; }catch(_){}',
    '}',
  ]);
}

/* ---- 3: the three invalidation sites go through it --------------- */
{
  const a = kit.only(L, l => l === '      cBitmaps.delete(openWas.id);', 'the rename invalidation');
  kit.replace(L, { start: a, end: a }, ['      cBitmapDrop(openWas.id);']);

  /* By its neighbour: cBitmapDrop, inserted above, contains this same line. */
  const b = kit.near(L, '    cBitmaps.delete(id);', -1,
    'without this it goes on compositing the version from before the edit',
    'the save invalidation');
  /* SUPERSEDED, NOT DELETED. The comment above it says the cache keeps every
     trait forever, which was true and is why it had to say this. */
  if (L[b - 1] !== '       without this it goes on compositing the version from before the edit. */')
    throw new Error('the save invalidation does not carry the comment this expects');
  kit.replace(L, { start: b - 2, end: b }, [
    '    /* The character preview decodes each trait once and keeps it forever, so',
    '       without this it goes on compositing the version from before the edit.',
    '       SUPERSEDED IN PART: the cache has a budget now, so "forever" is only',
    '       true up to 96 MB - but a record whose artwork just changed has to go',
    '       whatever the budget says, and its pixel block with it. */',
    '    cBitmapDrop(id);',
  ]);

  const c = kit.only(L, l => l === '  try{ cBitmaps.delete(rec.id); }catch(_){}', 'the delete invalidation');
  kit.replace(L, { start: c, end: c }, ['  try{ cBitmapDrop(rec.id); }catch(_){}']);
}

/* ---- 4: the sheet is drawn at overview size ---------------------- */
{
  const r = kit.inFunction(L, 'async function drawSheet(count){');
  const cols = kit.only(L, l => l === '  const cols=Math.min(4,got), rows=Math.ceil(got/cols), GAP=2;',
    'the sheet layout', r);
  if (L[cols + 1] !== '  const cv=$("ccanvas");')
    throw new Error('the sheet canvas is not taken on the line after the layout');
  if (L[cols + 2] !== '  cv.width=cols*(W+GAP)-GAP; cv.height=rows*(H+GAP)-GAP;')
    throw new Error('the sheet canvas is not sized where this expects');
  const loopEnd = kit.only(L, (l, i) => l === '  }' && i > cols && i < cols + 16
    && L[i - 1] === '    }', 'the end of the sheet loop', r);
  if (L[cols + 6] !== '  for(let i=0;i<combos.length;i++){')
    throw new Error('the sheet loop does not start where this expects');
  kit.replace(L, { start: cols + 2, end: loopEnd }, [
    '  /* THE SHEET IS AN OVERVIEW, SO IT IS DRAWN AT OVERVIEW SIZE. This sized',
    '     the canvas to twelve full traits and reached 5126x3844 - 75.2 MB,',
    '     measured - for a picture the CSS shows at min(900px,72vw). A 320 cell',
    '     is 5.0 MB and is still being scaled DOWN at 900px, so the screen this',
    '     set is judged on loses nothing.',
    '',
    '     Each character is still composited at the FULL canvas size, into one',
    '     scratch tile reused across the sheet, so paintTrait is handed exactly',
    '     the canvas it was handed before and every whole-number scale it works',
    '     out is unchanged. Only the copy onto the sheet is smaller. */',
    '  const cell=fitSize(W,H,SHEET_CELL);',
    '  cv.width=cols*(cell.w+GAP)-GAP; cv.height=rows*(cell.h+GAP)-GAP;',
    '  const g=cv.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  g.clearRect(0,0,cv.width,cv.height);',
    '  const tile=document.createElement("canvas"); tile.width=W; tile.height=H;',
    '  const tg=tile.getContext("2d"); tg.imageSmoothingEnabled=false;',
    '  for(let i=0;i<combos.length;i++){',
    '    tg.clearRect(0,0,W,H);',
    '    for(const r of combos[i]){',
    '      const bm=await cBitmap(r);',
    '      paintTrait(tg,bm,0,0,W,H);',
    '    }',
    '    const ox=(i%cols)*(cell.w+GAP), oy=Math.floor(i/cols)*(cell.h+GAP);',
    '    g.drawImage(tile,ox,oy,cell.w,cell.h);',
    '  }',
    '  /* Handed back rather than left at the collection size. */',
    '  tile.width=1; tile.height=1;',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ code, codeLines }) => {
  /* Nothing reaches into the Map behind cBitmapDrop's back, or the budget
     starts lying about how much has been released. */
  const strays = codeLines
    .map((l, i) => ({ l, i }))
    .filter(x => /cBitmaps\.delete\(/.test(x.l));
  const drop = kit.inFunction(codeLines, 'function cBitmapDrop(id){');
  const cb = kit.inFunction(codeLines, 'async function cBitmap(rec){');
  for (const s of strays) {
    const inDrop = s.i >= drop.start && s.i <= drop.end;
    const inCache = s.i >= cb.start && s.i <= cb.end;
    if (!inDrop && !inCache)
      throw new Error('line ' + (s.i + 1) + ' still deletes from the cache directly');
  }
  const cbBody = codeLines.slice(cb.start, cb.end + 1).join('\n');
  if (!/gone\.close\(\)/.test(cbBody)) throw new Error('the cache evicts without closing');
  if (!/CBITMAP_BUDGET/.test(cbBody)) throw new Error('the cache has no budget');

  const dropBody = codeLines.slice(drop.start, drop.end + 1).join('\n');
  if (!/blockOf\.delete\(id\)/.test(dropBody))
    throw new Error('dropping a record leaves its stale pixel block behind');
  if (!/autoKey=""/.test(dropBody))
    throw new Error('dropping a record leaves the memoised canvas side stale');

  const ds = kit.inFunction(codeLines, 'async function drawSheet(count){');
  const dsBody = codeLines.slice(ds.start, ds.end + 1).join('\n');
  if (/cv\.width=cols\*\(W\+GAP\)/.test(dsBody))
    throw new Error('the sheet is still sized to full traits');
  if (!/fitSize\(W,H,SHEET_CELL\)/.test(dsBody))
    throw new Error('the sheet does not use a cell size');
  if (!/paintTrait\(tg,bm,0,0,W,H\)/.test(dsBody))
    throw new Error('the sheet no longer composites at the full canvas size, which changes what paintTrait computes');

  /* THE ARITHMETIC, RUN. Sliced out of what was just written. */
  const from = code.indexOf('const SHEET_CELL=320;');
  const to = code.indexOf('function thumbSize(w,h){ return fitSize');
  if (from < 0 || to < 0 || to < from) throw new Error('cannot find the size helpers to exercise them');
  // eslint-disable-next-line no-new-func
  const F = new Function(code.slice(from, to)
    + '\nconst SHELF_THUMB=192;\nfunction thumbSize(w,h){ return fitSize(w,h,SHELF_THUMB); }'
    + '\nreturn {fitSize:fitSize, thumbSize:thumbSize, SHEET_CELL:SHEET_CELL};')();

  /* thumbSize's answers are the ones patch372 pinned, unchanged. */
  const same = [[1280, 1280, 160, 160], [2048, 2048, 128, 128], [160, 160, 160, 160],
    [80, 80, 80, 80], [16, 16, 16, 16], [192, 192, 192, 192], [1279, 1279, 192, 192],
    [640, 320, 160, 80]];
  for (const [w, h, ew, eh] of same) {
    const g = F.thumbSize(w, h);
    if (g.w !== ew || g.h !== eh)
      throw new Error('thumbSize(' + w + ',' + h + ') moved to ' + g.w + 'x' + g.h);
  }
  /* And the cell the sheet will actually use. */
  const cell = F.fitSize(1280, 1280, F.SHEET_CELL);
  if (cell.w !== 320 || cell.h !== 320)
    throw new Error('a 1280 trait gives a ' + cell.w + ' cell, expected a whole quarter');
  if (F.fitSize(160, 160, F.SHEET_CELL).w !== 160)
    throw new Error('a trait below the cell size must not be blown up');
  const sheet = (4 * (cell.w + 2) - 2) * (3 * (cell.h + 2) - 2) * 4;
  if (sheet > 8 * 1048576)
    throw new Error('a twelve-character sheet is still ' + Math.round(sheet / 1048576) + ' MB');
  const was = (4 * 1282 - 2) * (3 * 1282 - 2) * 4;
  if (was < 60 * 1048576)
    throw new Error('the before figure does not reproduce, so the after figure means nothing');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
