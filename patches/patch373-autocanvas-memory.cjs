/* A SECOND TWO GIGABYTES, ON THE SAME LOAD, THAT THE SHELF FIX DID NOT TOUCH.

   patch372 stopped the shelf giving every tile a full-size canvas. It did not
   stop this, and this is the same magnitude. Measured on the real collection
   size - 318 traits at 1280x1280 seeded into IndexedDB:

     autoCanvas(items)   3,401 ms, and cBitmaps holds 318 bitmaps = 1,988 MB
     the same, throttled to a sixth of this machine's CPU, extrapolated:
                         about 14,800 ms of frozen main thread

   And it runs on an ordinary render. The chain was read off a wrapped
   createImageBitmap rather than guessed at:

     renderShelf -> buildCompose -> drawCompose -> autoCanvas -> cBitmap

   cBitmaps is a Map from record id to ImageBitmap that is only ever emptied one
   entry at a time, when that record is edited or deleted. So asking the
   collection what canvas size it wants decoded every trait at full size and
   kept every one of them, for the life of the page, to arrive at a set of small
   integers that blockOf already remembers.

   WHAT IS WANTED HERE IS THE NUMBER, NOT THE PICTURE. pixelBlock reads a
   bitmap and returns one of 1, 2, 4, 5, 8, 10, 16, 32, 64. autoCanvas keeps
   that integer in blockOf and never looks at the bitmap again. The comment over
   blockCache already says "a WeakMap so a bitmap that is closed and dropped
   takes its answer with it" - nothing was closing them.

   THREE CHANGES, AND NONE OF THEM CAN CHANGE AN ANSWER:

   1. autoCanvas decodes privately with createImageBitmap and CLOSES the bitmap,
      instead of going through cBitmap and joining the permanent cache. The
      remaining users of cBitmap - drawCompose, drawSheet, buildCollection,
      revPaint - are drawing pictures and still want it.

   2. pixelBlock reuses ONE scratch canvas rather than making a 6.5 MB one per
      trait, and autoCanvas shrinks it back to a pixel when the sweep is over.
      Setting width clears a canvas, so nothing carries between records.

   3. A yield every eight records that actually decode, so the first load on a
      phone is slow rather than frozen. This is the only long synchronous run on
      the path.

   The scanning itself is untouched, and the patch proves it: the text of flat()
   after this must be byte-identical to the text before it. That is what makes
   "cannot change an answer" a check rather than a claim. Making that scan
   cheaper is a separate change with a separate argument.

   WRITTEN THROUGH A RENAME. Seven read-only agents are reading index.html while
   this runs, and a 1.5 MB writeFileSync is not atomic - a torn read would have
   them reporting on a file that never existed. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* The scan, captured BEFORE the edit so the check afterwards has something
   real to compare against. */
const pbRange = kit.inFunction(L, 'function pixelBlock(bm){');
const flatBefore = L.slice(pbRange.start, pbRange.end + 1)
  .join('\n').match(/const flat=\(s\)=>\{[\s\S]*?\n    \};/);
if (!flatBefore) throw new Error('cannot find the flat() scan to pin it');

/* ---- 1 and 3: autoCanvas stops keeping what it decodes ----------- */
{
  const r = kit.inFunction(L, 'async function autoCanvas(recs){');
  const first = kit.only(L, l => l === '    let blk=blockOf.get(r.id);',
    'where autoCanvas looks up a block size', r);
  const last = kit.only(L, l => l === '      try{ blk=pixelBlock(await cBitmap(r)); }catch(_){ blk=1; }',
    'where autoCanvas decodes a trait', r);
  if (!(last === first + 6)) throw new Error('the decode is not six lines below the lookup');
  if (L[last + 1] !== '      blockOf.set(r.id,blk);')
    throw new Error('the block size is not recorded on the line after the decode');
  if (L[last + 2] !== '    }') throw new Error('the cache-miss branch does not close where this expects');

  kit.replace(L, { start: last, end: last + 1 }, [
    '      /* MEASURED, THEN LET GO. This went through cBitmap, whose Map keeps',
    '         every bitmap it decodes for the life of the page and is only ever',
    '         emptied one record at a time. So asking the collection what size it',
    '         is decoded all 318 traits at 1280x1280 and held them - 1,988 MB,',
    '         measured, on every load - to arrive at one small integer each,',
    '         which blockOf already remembers. The number is what is wanted here.',
    '         The bitmap is closed, which is exactly what the WeakMap over',
    '         blockCache was written for. */',
    '      let bm=null;',
    '      try{ bm=await createImageBitmap(r.blob); blk=pixelBlock(bm); }',
    '      catch(_){ blk=1; }',
    '      if(bm&&bm.close) bm.close();',
    '      blockOf.set(r.id,blk);',
    '      /* A BREATH BETWEEN RECORDS. The scan in pixelBlock is the only long',
    '         synchronous run on this path and 318 of them back to back is a',
    '         frozen page: about 15 seconds, measured at a sixth of a desktop',
    '         CPU. This does not make it faster, it makes it interruptible. */',
    '      if((++scanned%8)===0) await new Promise(res=>setTimeout(res,0));',
  ]);

  /* The counter, declared beside the list it counts through. */
  const seenDecl = kit.only(L, l => l === '  const seen=[];', 'the seen list in autoCanvas',
    kit.inFunction(L, 'async function autoCanvas(recs){'));
  kit.replace(L, { start: seenDecl, end: seenDecl }, [
    '  const seen=[];',
    '  let scanned=0;   /* records this call actually had to decode */',
  ]);

  /* And give the scratch canvas back once the sweep is done. */
  const r2 = kit.inFunction(L, 'async function autoCanvas(recs){');
  const after = kit.only(L, l => l === '  if(!seen.length) return CANVAS_SIDE;',
    'the end of the sweep', r2);
  kit.replace(L, { start: after, end: after }, [
    '  /* The 6.5 MB pixelBlock borrows to read a trait is not wanted between',
    '     sweeps, and a collection is swept once. */',
    '  if(blockScratch){ blockScratch.width=1; blockScratch.height=1; }',
    '  if(!seen.length) return CANVAS_SIDE;',
  ]);
}

/* ---- 2: one scratch canvas, not one per trait -------------------- */
{
  const r = kit.inFunction(L, 'function pixelBlock(bm){');
  const mk = kit.only(L, l => l === '    const c=document.createElement("canvas");',
    'the scratch canvas in pixelBlock', r);
  if (L[mk + 1] !== '    c.width=w; c.height=h;')
    throw new Error('the scratch canvas is not sized on the line after it is made');
  kit.replace(L, { start: mk, end: mk }, [
    '    /* ONE scratch canvas for the whole collection, not one per trait. At',
    '       1280x1280 a fresh canvas each time is 6.5 MB and this is called once',
    '       per trait; setting width below clears it, so nothing carries over. */',
    '    const c=blockScratch||(blockScratch=document.createElement("canvas"));',
  ]);
  const decl = kit.only(L, l => l === 'const blockCache=new WeakMap();', 'the block cache');
  kit.replace(L, { start: decl, end: decl }, [
    'const blockCache=new WeakMap();',
    'let blockScratch=null;   /* borrowed by pixelBlock, given back by autoCanvas */',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  const ac = kit.inFunction(codeLines, 'async function autoCanvas(recs){');
  const acBody = codeLines.slice(ac.start, ac.end + 1).join('\n');
  if (/cBitmap\(/.test(acBody))
    throw new Error('autoCanvas still decodes through the permanent cache');
  if (!/bm\.close\(\)/.test(acBody))
    throw new Error('autoCanvas does not close what it decodes');
  if (!/createImageBitmap\(r\.blob\)/.test(acBody))
    throw new Error('autoCanvas no longer decodes at all');
  if (!/setTimeout\(res,0\)/.test(acBody))
    throw new Error('autoCanvas never yields, so the first load still freezes');

  const pb = kit.inFunction(codeLines, 'function pixelBlock(bm){');
  const pbBody = codeLines.slice(pb.start, pb.end + 1).join('\n');
  if ((pbBody.match(/document\.createElement\("canvas"\)/g) || []).length !== 1)
    throw new Error('pixelBlock does not make exactly one canvas');
  if (!/blockScratch\|\|\(blockScratch=/.test(pbBody))
    throw new Error('pixelBlock does not reuse the scratch canvas');

  /* THE SCAN IS UNTOUCHED, STATED AS A CHECK. Everything above is about what
     is kept, never about what is measured, so the text that decides an answer
     has to come out byte for byte the same. If a later change to flat() is
     wanted, it needs its own patch and its own argument. */
  const flatAfter = pbBody.match(/const flat=\(s\)=>\{[\s\S]*?\n    \};/);
  if (!flatAfter) throw new Error('the flat() scan is gone');
  if (flatAfter[0] !== flatBefore[0])
    throw new Error('the flat() scan changed, so this patch can no longer claim it cannot change an answer');
  if (!/for\(const s of \[64,32,16,10,8,5,4,2\]\)/.test(pbBody))
    throw new Error('the candidate block sizes changed');

  /* The other users of cBitmap are drawing pictures and still want it. */
  for (const fn of ['async function drawCompose(){', 'async function drawSheet(count){',
    'async function buildCollection(n,onProgress){']) {
    const r = kit.inFunction(codeLines, fn);
    if (!/cBitmap\(/.test(codeLines.slice(r.start, r.end + 1).join('\n')))
      throw new Error(fn + ' lost its use of the bitmap cache, which was not the point');
  }
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
