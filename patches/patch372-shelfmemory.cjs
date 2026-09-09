/* THE SHELF ASKED THE BROWSER FOR TWO GIGABYTES OF CANVAS, AND ON A PHONE
   THAT IS THE WHOLE BUG.

   Measured, not inferred. The owner's collection on disk is 318 PNGs at
   1280x1280 and one at 2048. renderShelf gave every tile a canvas at the
   trait's own size and decoded every blob at once:

     318 x 1280 x 1280 x 4 = 2,053 MB of backing store
     plus one live ImageBitmap per trait, never closed, at the same size

   Seeded into IndexedDB and rendered, desktop Chrome reports 2,053 MB across
   349 canvases. A phone does not have that, so the tab is killed, the phone
   reloads it, the shelf renders again and it is killed again - which is
   exactly "the mobile site crashes every 2 seconds", and why it was crashing
   before this week's commits too. Nothing in the page loops on a timer; there
   is no setInterval anywhere in it and no reload path. The renderer is dying.

   None of that resolution was ever on screen. The tile is 150 CSS px wide,
   the recent row is 34, the review shot is 88 - so the compositor was already
   throwing away 98% of every picture it was handed.

   THREE CHANGES, AND THE FIRST IS THE ONE THAT MATTERS:

   1. Tiles get a THUMBNAIL, capped at 192 px on the long edge. Where the size
      divides cleanly it takes a whole division, so a 1280 trait becomes 160 -
      which for this collection is the trait's own art size at one canvas
      pixel per art pixel, drawn on a 160-cell grid. Nothing is lost. Smaller
      traits are untouched: below the cap the canvas stays exactly as it was.

   2. Tiles DECODE WHEN THEY COME NEAR THE SCREEN, not all at once. One
      IntersectionObserver for the shelf, rebuilt with it, so a rebuild cannot
      leave 318 detached canvases held by the old one. renderShelf runs again
      on every status change, pick and hide, and each of those was re-decoding
      the entire collection.

   3. Every ImageBitmap this file opens for a tile is CLOSED after it is
      drawn. A decoded 1280x1280 bitmap is 6.5 MB held until the collector
      feels like it, and none of these were released.

   The same thumbnail applies to the recent list and the review shot, which
   were showing 1280 px canvases at 34 and 88 px. Those are not what killed
   the tab - ten rows and one shot - but they are the same mistake and the
   helper is right there. */
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));
const doc = kit.load(path.join(__dirname, '..', 'index.html'));
const L = doc.lines;

const shelfRange = kit.inFunction(L, 'async function renderShelf(){');

/* ---- the helpers, inserted above renderShelf --------------------- */
const HELPERS = [
  '/* WHAT A SHELF TILE IS ACTUALLY SHOWN AT, which until now was "whatever the',
  '   trait happens to be".',
  '',
  '   A tile is about 150 CSS pixels wide, a recent row is 34 and the review',
  '   shot is 88. The traits in a real collection here are 1280x1280. Giving',
  '   each tile a canvas at the trait size cost 6.5 MB of backing store per',
  '   tile and 2,053 MB across 318 of them - measured on this collection - for',
  '   a picture the compositor immediately threw 98% of away. That is what was',
  '   killing the tab on a phone.',
  '',
  '   192 is the cap on the LONG EDGE, and only downward: a trait already',
  '   smaller than that keeps its own size, so nothing about a 16 or 80 pixel',
  '   sprite changes. Above it, a WHOLE DIVISION is preferred over an',
  '   arbitrary scale, because dividing by a whole number keeps every art',
  '   pixel square and the same size as its neighbours. 1280 divides by 8 to',
  '   160, which for this collection is not a reduction at all - the traits',
  '   are drawn on a 160-cell grid at 8 pixels a cell, so 160 is one canvas',
  '   pixel per art pixel. The search is bounded at 0.6 of the cap so a size',
  '   with no useful divisor - 1279 - falls through to a plain scale rather',
  '   than dividing by 1279 and arriving at one pixel. */',
  'const SHELF_THUMB=192;',
  'function thumbSize(w,h){',
  '  w=Math.max(1,Math.round(w)||1); h=Math.max(1,Math.round(h)||1);',
  '  const long=Math.max(w,h);',
  '  if(long<=SHELF_THUMB) return {w:w,h:h};',
  '  const lo=Math.ceil(long/SHELF_THUMB), hi=Math.floor(long/Math.round(SHELF_THUMB*0.6));',
  '  for(let n=lo;n<=hi;n++) if(w%n===0&&h%n===0) return {w:w/n,h:h/n};',
  '  const k=SHELF_THUMB/long;',
  '  return {w:Math.max(1,Math.round(w*k)),h:Math.max(1,Math.round(h*k))};',
  '}',
  '/* Decode, draw at the thumbnail size, and CLOSE the bitmap.',
  '',
  '   The close is not tidiness. A decoded 1280x1280 bitmap is 6.5 MB, every',
  '   tile opened one, and not one of them was ever released - so a shelf that',
  '   survived its own canvases still had a second copy of the collection',
  '   sitting in the decoder. A failed decode leaves an empty box, as before,',
  '   rather than throwing the whole list away. */',
  'function thumbPaint(cv,blob){',
  '  if(!blob) return;',
  '  createImageBitmap(blob).then(function(bm){',
  '    const g=cv.getContext("2d");',
  '    g.imageSmoothingEnabled=false;',
  '    g.clearRect(0,0,cv.width,cv.height);',
  '    g.drawImage(bm,0,0,cv.width,cv.height);',
  '    if(bm.close) bm.close();',
  '  }).catch(function(){});',
  '}',
  'function thumbCanvas(rec){',
  '  const s=thumbSize(rec&&rec.w,rec&&rec.h);',
  '  const cv=document.createElement("canvas");',
  '  cv.width=s.w; cv.height=s.h;',
  '  return cv;',
  '}',
  '/* WHICH TILES HAVE ACTUALLY BEEN DECODED, which should be the ones you can',
  '   see and was every one of them.',
  '',
  '   renderShelf runs again on every status change, every pick, every hide and',
  '   every rarity edit, and each run decoded the entire collection from',
  '   scratch. Six tiles fit on a phone screen.',
  '',
  '   REBUILT WITH THE SHELF, not kept. An observer holds its targets, so one',
  '   that outlived a rebuild would be holding 318 detached canvases per',
  '   render - which is the leak this exists to avoid, one level up.',
  '   shelfWatchReset is called where the shelf body is emptied, so the old one',
  '   goes with the DOM it was watching.',
  '',
  '   400px of margin so a tile is decoded before it is scrolled to rather than',
  '   after. With no IntersectionObserver at all the tile paints immediately,',
  '   which is what every browser did before this. */',
  'let shelfWatch=null;',
  'function shelfWatchReset(){',
  '  if(shelfWatch){ shelfWatch.disconnect(); shelfWatch=null; }',
  '  if(typeof IntersectionObserver!=="function") return;',
  '  shelfWatch=new IntersectionObserver(function(entries,obs){',
  '    for(const e of entries){',
  '      if(!e.isIntersecting) continue;',
  '      obs.unobserve(e.target);',
  '      const paint=e.target.pbPaint;',
  '      if(paint){ e.target.pbPaint=null; paint(); }',
  '    }',
  '  },{rootMargin:"400px 0px"});',
  '}',
  'function shelfTile(rec){',
  '  const cv=thumbCanvas(rec);',
  '  if(shelfWatch){ cv.pbPaint=function(){ thumbPaint(cv,rec&&rec.blob); }; shelfWatch.observe(cv); }',
  '  else thumbPaint(cv,rec&&rec.blob);',
  '  return cv;',
  '}',
];

/* ---- the two tile sites in renderShelf --------------------------- */
const TILE = "      const cv=document.createElement('canvas'); cv.width=t.w; cv.height=t.h;";
const refCv = kit.near(L, TILE, -1, "el.className='item'; el.title=t.name;",
  'the references tile canvas');
if (L[refCv + 1].indexOf('createImageBitmap(t.blob)') < 0)
  throw new Error('the references tile does not decode on the line after its canvas');

const trCv = kit.near(L, TILE, -1, 'el.dataset.shelfCardKey=key;', 'the trait tile canvas');
if (L[trCv + 1].indexOf('createImageBitmap(t.blob).then(bm=>{') < 0
  || L[trCv + 3].indexOf('}).catch(()=>{});') < 0)
  throw new Error('the trait tile decode is not the three lines this expects');

const bodyClear = kit.only(L, l => l === "  const body=$('projbody'); body.innerHTML='';",
  'where the shelf body is emptied', shelfRange);
if (!(bodyClear < refCv && bodyClear < trCv))
  throw new Error('the shelf body is emptied after the tiles are built, so a reset there is too late');

/* Bottom up, so the earlier indices stay valid. */
kit.replace(L, { start: trCv, end: trCv + 3 }, ['      const cv=shelfTile(t);']);
kit.replace(L, { start: refCv, end: refCv + 1 }, ['      const cv=shelfTile(t);']);
kit.replace(L, { start: bodyClear, end: bodyClear },
  ["  const body=$('projbody'); body.innerHTML='';",
    '  /* With the DOM the old observer was watching. See shelfWatchReset. */',
    '  shelfWatchReset();']);

/* ---- the recent list --------------------------------------------- */
{
  const r = kit.inFunction(L, 'function renderRecent(items){');
  const cv = kit.only(L, l => l === '    const cv=document.createElement("canvas");',
    'the recent row canvas', r);
  if (L[cv + 1] !== '    cv.width=Math.max(1,t.w||1); cv.height=Math.max(1,t.h||1);')
    throw new Error('the recent row does not size its canvas where this expects');
  const end = kit.only(L, l => l === '    }).catch(()=>{});', 'the recent row decode', r);
  kit.replace(L, { start: cv, end: end },
    ['    /* A 34px row was being handed a 1280px canvas. thumbCanvas caps it and',
      '       thumbPaint closes the bitmap, which this never did. */',
      '    const cv=thumbCanvas(t);',
      '    thumbPaint(cv,t.blob);']);
}

/* ---- the review shot --------------------------------------------- */
{
  const r = kit.inFunction(L, 'async function renderReview(){');
  const sz = kit.only(L, l => l === '  cv.width=t?Math.max(1,t.w||1):8; cv.height=t?Math.max(1,t.h||1):8;',
    'the review shot size', r);
  const end = kit.only(L, l => l === '  }).catch(()=>{});', 'the review shot decode', r);
  kit.replace(L, { start: sz, end: end },
    ['  /* 88px on screen, and it was sized to the trait. */',
      '  const shot=t?thumbSize(t.w,t.h):{w:8,h:8};',
      '  cv.width=shot.w; cv.height=shot.h;',
      '  cv.getContext("2d").clearRect(0,0,cv.width,cv.height);',
      '  if(t&&t.blob) thumbPaint(cv,t.blob);']);
}

/* ---- the helpers go in last, so every index above stayed valid ---- */
{
  const at = kit.only(L, l => l === 'async function renderShelf(){', 'renderShelf');
  L.splice(at, 0, ...HELPERS);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ code, codeLines }) => {
  const shelf = kit.inFunction(codeLines, 'async function renderShelf(){');
  const body = codeLines.slice(shelf.start, shelf.end + 1).join('\n');

  const tiles = (body.match(/shelfTile\(t\)/g) || []).length;
  if (tiles !== 2) throw new Error('renderShelf builds ' + tiles + ' tiles through shelfTile, need 2');
  if (/createImageBitmap/.test(body))
    throw new Error('renderShelf still decodes a full-size bitmap itself');
  if (/createElement\('canvas'\)/.test(body))
    throw new Error('renderShelf still makes a canvas of its own');
  if ((body.match(/shelfWatchReset\(\)/g) || []).length !== 1)
    throw new Error('the shelf observer is not reset exactly once per render');

  /* Stated over the code with comments stripped, so the prose above cannot
     satisfy any of it. */
  const pr = kit.inFunction(codeLines, 'function thumbPaint(cv,blob){');
  if (!/bm\.close\(\)/.test(codeLines.slice(pr.start, pr.end + 1).join('\n')))
    throw new Error('thumbPaint does not close its bitmap');
  for (const fn of ['function renderRecent(items){', 'async function renderReview(){']) {
    const r = kit.inFunction(codeLines, fn);
    if (/createImageBitmap/.test(codeLines.slice(r.start, r.end + 1).join('\n')))
      throw new Error(fn + ' still decodes at full size');
  }

  /* THE ARITHMETIC, RUN - not read. Sliced out of the text that was just
     written, so what is checked is what ships. */
  const from = code.indexOf('const SHELF_THUMB=192;');
  const to = code.indexOf('function thumbCanvas(rec){');
  if (from < 0 || to < 0 || to < from) throw new Error('cannot find the size helper to exercise it');
  // eslint-disable-next-line no-new-func
  const thumbSize = new Function(code.slice(from, to) + '\nreturn thumbSize;')();
  const cases = [
    [1280, 1280, 160, 160, 'this collection, one canvas pixel per art pixel'],
    [2048, 2048, 128, 128, 'the one oversized trait'],
    [160, 160, 160, 160, 'a trait already at the grid is untouched'],
    [80, 80, 80, 80, 'and so is a small one'],
    [16, 16, 16, 16, 'and a sprite'],
    [192, 192, 192, 192, 'exactly the cap is not reduced'],
    [1279, 1279, 192, 192, 'a size with no divisor falls back to a plain scale'],
    [640, 320, 160, 80, 'a rectangle keeps its shape'],
  ];
  for (const [w, h, ew, eh, why] of cases) {
    const g = thumbSize(w, h);
    if (g.w !== ew || g.h !== eh)
      throw new Error(w + 'x' + h + ' -> ' + g.w + 'x' + g.h + ', expected ' + ew + 'x' + eh + ' (' + why + ')');
  }
  /* The instrument can say no: a cap that did nothing would fail this. */
  const one = thumbSize(1280, 1280);
  if (one.w * one.h * 4 * 318 > 40 * 1048576)
    throw new Error('318 tiles still ask for more than 40 MB');
});
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
