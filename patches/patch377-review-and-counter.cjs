/* THE REVIEW PANEL DOES WHAT THE SHELF USED TO, AND MY OWN COUNTER DRIFTS.

   Both found by pointing a fresh reader at the file after patch374 landed, and
   the second one is a defect in patch374 itself.

   1. EVERY REVIEW TILE GETS THE COLLECTION CANVAS. revPaint sizes the tile's
      backing store with `{ const S=await autoCanvas(cItems); W=S; H=S; }` and
      then `cv.width=W`, which on this collection is 1280x1280 - 6.25 MB - for a
      tile the CSS lays out at 108 to 140 px. revBuild fires one revPaint per
      candidate WITHOUT awaiting, so a layer with twenty candidates asks for
      125 MB and twenty concurrent full-size decodes in a single frame. It is
      the shelf's defect in the panel next door, and worse per tile, because the
      shelf at least decoded lazily.

   2. AND THAT UN-AWAITED FAN-OUT IS WHAT BREAKS THE BUDGET I ADDED. cBitmap
      credits cBitmapBytes on every decode and only ever debits it for entries
      it removes from the Map. Two calls for one record in flight together both
      miss the lookup, both decode, and the second set() replaces the first in
      the Map - so the total is credited twice and can only ever be debited
      once. The counter climbs, the 96 MB budget is permanently exceeded, and
      the cache evicts itself down to a single entry and stays there. The first
      bitmap is also orphaned without being closed, which is the exact leak the
      budget was added to stop.

      THE FILE ALREADY SAYS NOT TO DO THIS. historyBytes rescans both stacks
      rather than keeping a total, and its comment is "a counter that drifts is
      worse than no counter". I wrote the drifting counter anyway, in the same
      file, four hundred lines away. cBitmapBytes becomes a function that sums
      the Map - a dozen entries, so it is cheaper than being wrong - and the
      race is handled where it happens: if a decode comes back to find its
      record already stored, it keeps the stored one and closes its own, so
      nothing that has been handed out is ever closed underneath its user.

   3. AND THREE LOOPS OVER THE WHOLE COLLECTION STILL NEVER CLOSE ANYTHING.
      pbEach, collectionPalette and traitFingerprint each decode a trait at full
      size and drop it on the floor. pbEach's own comment explains that it
      reuses one canvas for exactly this reason and then leaks the bitmaps
      beside it. collectionPalette makes a fresh full-size canvas per trait as
      well, forty of them at 6.25 MB.

   WHY THE SHARED SCRATCH IS SAFE, STATED SO IT CAN BE CHECKED. revPaint now
   composites at full size into one reused canvas and copies it down to the
   tile - the same shape drawSheet uses - which is only sound while no two
   revPaints overlap. So revBuild awaits each one, and the check at the bottom
   asserts that it does. That is a dependency this patch creates, so it is this
   patch's job to pin it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 2: the counter that drifts --------------------------------- */
{
  const decl = kit.only(L, l => l === 'let cBitmapBytes=0;', 'the running total');
  kit.replace(L, { start: decl, end: decl }, [
    '/* RESCANNED, NEVER KEPT AS A RUNNING TOTAL, which is what historyBytes says',
    '   a few hundred lines up and what this was written as anyway. A total here',
    '   drifts for a reason worth naming: revBuild fires a paint per tile without',
    '   awaiting, so two calls for one record can be in flight together, both miss',
    '   the lookup, both decode, and the second set() replaces the first - one',
    '   credit per decode, one debit per eviction, and the difference never comes',
    '   back. The budget was then permanently exceeded and the cache evicted',
    '   itself to one entry. The Map holds about a dozen bitmaps, so summing it is',
    '   cheaper than being wrong about it. */',
    'function cBitmapBytes(){',
    '  let t=0;',
    '  for(const bm of cBitmaps.values()) t+=bm.width*bm.height*4;',
    '  if(!Number.isFinite(t)) throw new Error("the bitmap cache accounting is not a number");',
    '  return t;',
    '}',
  ]);

  const r = kit.inFunction(L, 'async function cBitmap(rec){');
  kit.replace(L, r, [
    'async function cBitmap(rec){',
    '  const had=cBitmaps.get(rec.id);',
    '  if(had){ cBitmaps.delete(rec.id); cBitmaps.set(rec.id,had); return had; }',
    '  const bm=await createImageBitmap(rec.blob);',
    '  /* A RACE ARRIVES HERE, and it is the ordinary case rather than the exotic',
    '     one: revBuild starts a paint per tile and they all reach this line for',
    '     the same base trait. Whoever stored first wins, so no bitmap already',
    '     handed to a caller is closed underneath it, and this one goes. */',
    '  const now=cBitmaps.get(rec.id);',
    '  if(now){ if(bm.close) bm.close(); return now; }',
    '  cBitmaps.set(rec.id,bm);',
    '  while(cBitmapBytes()>CBITMAP_BUDGET && cBitmaps.size>1){',
    '    const oldest=cBitmaps.keys().next().value;',
    '    const gone=cBitmaps.get(oldest);',
    '    cBitmaps.delete(oldest);',
    '    if(gone.close) gone.close();',
    '  }',
    '  return bm;',
    '}',
  ]);

  const d = kit.inFunction(L, 'function cBitmapDrop(id){');
  kit.replace(L, d, [
    'function cBitmapDrop(id){',
    '  const bm=cBitmaps.get(id);',
    '  if(bm){',
    '    cBitmaps.delete(id);',
    '    if(bm.close) bm.close();',
    '  }',
    '  try{ blockOf.delete(id); autoKey=""; autoSide=null; }catch(_){}',
    '}',
  ]);
}

/* ---- 1: the review tiles ---------------------------------------- */
{
  const r = kit.inFunction(L, 'async function revPaint(cv,cond,cand){');
  const sz = kit.only(L, l => l === '  cv.width=W; cv.height=H;', 'the review tile size', r);
  if (L[sz + 1] !== '  const g=cv.getContext("2d");')
    throw new Error('the review tile context is not taken where this expects');
  if (L[sz + 2] !== '  g.imageSmoothingEnabled=false;')
    throw new Error('the review tile smoothing is not set where this expects');
  if (L[sz + 3] !== '  g.clearRect(0,0,W,H);')
    throw new Error('the review tile is not cleared where this expects');
  kit.replace(L, { start: sz, end: sz + 3 }, [
    '  /* THE TILE IS 108 TO 140 PIXELS AND WAS GIVEN THE COLLECTION CANVAS.',
    '     1280x1280 is 6.25 MB of backing store per tile, and revBuild builds one',
    '     per candidate - so a layer with twenty of them asked for 125 MB at once.',
    '     Same answer as the shelf and the sheet: composite at the full size into',
    '     one reused scratch, so paintTrait is handed exactly the canvas it always',
    '     was, and copy that down to the tile.',
    '',
    '     The scratch is shared, which is only sound because revBuild awaits each',
    '     of these in turn. It did not before this patch, and the check in',
    '     patches/patch377-review-and-counter.cjs pins that it does now. */',
    '  const cell=fitSize(W,H,SHELF_THUMB);',
    '  cv.width=cell.w; cv.height=cell.h;',
    '  const g=cv.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  g.clearRect(0,0,cv.width,cv.height);',
    '  if(!revScratch) revScratch=document.createElement("canvas");',
    '  if(revScratch.width!==W||revScratch.height!==H){ revScratch.width=W; revScratch.height=H; }',
    '  const sg=revScratch.getContext("2d");',
    '  sg.imageSmoothingEnabled=false;',
    '  sg.clearRect(0,0,W,H);',
  ]);

  /* The three pieces are painted into the scratch, then copied down. */
  const r2 = kit.inFunction(L, 'async function revPaint(cv,cond,cand){');
  const paint = kit.only(L, l => l === '    try{ paintTrait(g,await cBitmap(p),0,0,W,H); }catch(_){ }',
    'the review tile painting', r2);
  if (L[paint + 1] !== '  }') throw new Error('the review paint loop does not close where this expects');
  kit.replace(L, { start: paint, end: paint + 1 }, [
    '    try{ paintTrait(sg,await cBitmap(p),0,0,W,H); }catch(_){ }',
    '  }',
    '  g.drawImage(revScratch,0,0,cv.width,cv.height);',
  ]);

  /* The scratch itself, declared beside the cache it sits next to. */
  const anchor = kit.only(L, l => l === 'const CBITMAP_BUDGET=96*1048576;', 'the cache budget');
  kit.replace(L, { start: anchor, end: anchor }, [
    'const CBITMAP_BUDGET=96*1048576;',
    '/* One full-size canvas the review tiles composite into, shared because they',
    '   are painted one at a time, and given back by revBuild when the grid is',
    '   built. */',
    'let revScratch=null;',
  ]);
}

/* ---- and revBuild waits for each one ----------------------------- */
{
  const r = kit.inFunction(L, 'async function revBuild(){');
  const at = kit.only(L, l => l === '    if(cond) revPaint(cv,cond,t);', 'where revBuild paints a tile', r);
  if (L[at + 1] !== '  }') throw new Error('the revBuild loop does not close where this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    /* AWAITED. It was not, which is what let twenty full-size decodes start',
    '       in one frame, and the shared scratch above depends on it. The grid is',
    '       also genuinely finished when this function resolves now, which it was',
    '       not before - the paints were still in flight. */',
    '    if(cond) await revPaint(cv,cond,t);',
    '  }',
    '  /* Handed back rather than left at the collection size. */',
    '  if(revScratch){ revScratch.width=1; revScratch.height=1; }',
  ]);
}

/* ---- 3: the three loops that never close ------------------------ */
{
  /* traitFingerprint */
  const a = kit.near(L, '    const bm=await createImageBitmap(t.blob);', 1,
    'const c=document.createElement("canvas"); c.width=t.w||bm.width;', 'the fingerprint decode');
  const ret = kit.only(L, l => l === '    return {hash:artFingerprint(d.data), w:c.width, h:c.height};',
    'what the fingerprint returns');
  if (ret <= a) throw new Error('the fingerprint returns before it decodes');
  kit.replace(L, { start: ret, end: ret }, [
    '    /* Closed before the answer leaves, or one call per trait in a sweep',
    '       leaves the whole collection decoded behind it. */',
    '    const out={hash:artFingerprint(d.data), w:c.width, h:c.height};',
    '    if(bm.close) bm.close();',
    '    return out;',
  ]);

  /* collectionPalette */
  const b = kit.only(L, l => l === '    let bm; try{ bm=await createImageBitmap(t.blob); }catch(_){ continue; }',
    'the palette decode');
  const bEnd = kit.only(L, (l, i) => i > b && i < b + 22 && l === '    }',
    'the end of the palette body', { start: b, end: b + 22 });
  void bEnd;
  const bDraw = kit.only(L, l => l === '    const d=g.getImageData(0,0,bm.width,bm.height).data;',
    'where the palette reads its pixels');
  kit.replace(L, { start: bDraw, end: bDraw }, [
    '    const d=g.getImageData(0,0,bm.width,bm.height).data;',
    '    /* The pixels are out; the bitmap is not wanted for the rest of the loop',
    '       and forty of them at the collection size is 250 MB. */',
    '    const bw=bm.width, bh=bm.height;',
    '    if(bm.close) bm.close();',
  ]);
  /* Everything after that read used bm.width/bm.height, which a closed bitmap
     still answers - but saying it once is clearer than relying on that. */
  for (let i = bDraw; i < bDraw + 24 && i < L.length; i++) {
    if (i <= bDraw + 3) continue;
    L[i] = L[i].replace(/bm\.width\*bm\.height/g, 'bw*bh')
      .replace(/bm\.width/g, 'bw').replace(/bm\.height/g, 'bh');
  }

  /* pbEach */
  const c = kit.only(L, l => l === '        const bm=await createImageBitmap(t.blob);', 'the sweep decode');
  const cUse = kit.only(L, l => l === '        await fn(t,g.getImageData(0,0,c.width,c.height));',
    'where the sweep hands a trait over');
  if (cUse <= c) throw new Error('the sweep uses a trait before it decodes it');
  kit.replace(L, { start: cUse, end: cUse }, [
    '        /* Closed BEFORE fn runs, not after: the pixels are already out in',
    '           the ImageData, fn can be slow, and the catch below would skip a',
    '           close placed after it. The comment above this loop already says',
    '           one canvas is reused for this reason; the bitmaps were not. */',
    '        const px=g.getImageData(0,0,c.width,c.height);',
    '        if(bm.close) bm.close();',
    '        await fn(t,px);',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  /* No running total survives anywhere. */
  const running = codeLines.filter(l => /cBitmapBytes\s*[+-]=/.test(l));
  if (running.length) throw new Error('the cache still keeps a running total');
  const fn = kit.inFunction(codeLines, 'function cBitmapBytes(){');
  if (!/for\(const bm of cBitmaps\.values\(\)\)/.test(codeLines.slice(fn.start, fn.end + 1).join('\n')))
    throw new Error('the cache total is not rescanned');

  /* The race is handled, and handled by keeping the stored one. */
  const cb = kit.inFunction(codeLines, 'async function cBitmap(rec){');
  const cbBody = codeLines.slice(cb.start, cb.end + 1).join('\n');
  if (!/const now=cBitmaps\.get\(rec\.id\);/.test(cbBody))
    throw new Error('cBitmap does not look for a racing decode');
  if (!/if\(now\)\{ if\(bm\.close\) bm\.close\(\); return now; \}/.test(cbBody))
    throw new Error('cBitmap does not close the loser of a race');

  /* The review tile is a thumbnail, AND the sharing it now relies on is real. */
  const rp = kit.inFunction(codeLines, 'async function revPaint(cv,cond,cand){');
  const rpBody = codeLines.slice(rp.start, rp.end + 1).join('\n');
  if (!/fitSize\(W,H,SHELF_THUMB\)/.test(rpBody))
    throw new Error('the review tile is still sized to the collection canvas');
  if (/cv\.width=W; cv\.height=H;/.test(rpBody))
    throw new Error('the review tile still takes the full canvas size');
  if (!/paintTrait\(sg,await cBitmap\(p\),0,0,W,H\)/.test(rpBody))
    throw new Error('the review tile no longer composites at the full size');
  const rb = kit.inFunction(codeLines, 'async function revBuild(){');
  const rbBody = codeLines.slice(rb.start, rb.end + 1).join('\n');
  if (!/await revPaint\(cv,cond,t\)/.test(rbBody))
    throw new Error('revBuild does not await its paints, so the shared scratch is unsafe');
  /* And nobody else calls revPaint, or the awaiting above is not enough. */
  const callers = codeLines.filter(l => /revPaint\(/.test(l) && !/async function revPaint/.test(l));
  if (callers.length !== 1)
    throw new Error('revPaint has ' + callers.length + ' call sites; the shared scratch assumes exactly 1');

  /* All three sweeps close what they decode. */
  for (const [sig, why] of [
    ['async function traitFingerprint(t){', 'the fingerprint'],
    ['async function collectionPalette(cap){', 'the palette'],
    ['async function pbEach(job,fn){', 'the sweep'],
  ]) {
    const r = kit.inFunction(codeLines, sig);
    const b = codeLines.slice(r.start, r.end + 1).join('\n');
    if (!/createImageBitmap/.test(b)) throw new Error(why + ' no longer decodes at all');
    if (!/bm\.close\(\)/.test(b)) throw new Error(why + ' still never closes its bitmaps');
  }
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
