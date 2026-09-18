/* THE GRIDLESS SEARCH COUNTS WHAT THE ENGINE COUNTS, KEEPS THE BEST WHEN
   NOTHING PASSES, IGNORES STRAYS WHEN JUDGING THE SHAPE, AND SAYS WHAT IT DID.

   Four defects in fixGridlessCells, the search that picks a cell count for a
   picture with no pixel grid when Pixel size is 0, measured on 2026-09-18
   on the 167 gridless working traits and the 155 gridless raw sources.

   1. IT COUNTED PIXELS TWICE. Cell bounds were [floor(c*s), ceil((c+1)*s)),
      which overlap by a row and a column whenever s is fractional - every
      1254 source at every candidate. `kept` was summed over overlapping
      cells while the total was counted once, so kept/total came to 1.27 at
      160 cells and 2.28 at 640 on those sources, and the "keeps 95% of the
      paint" test could not fail: 16 of the 86 were put on a grid where the
      engine, which maps a pixel to floor(x*cols/w), keeps as little as
      87.7%. On 1280 sources the step is whole and nothing changes: the
      corrected count equals the old one on all 167.

   2. WHEN NOTHING PASSED IT RETURNED THE FINEST. `return last` handed back
      640 cells - 2px pixels, the least pixel-art of the four - on every
      fallthrough, and on 10 of the 15 working traits that fell through a
      coarser count had kept more of the paint (Mouth 06: 98% at 320, 90%
      at 640; the 640 result lost 10% of its pixels and the 320 one 2%). It
      returns the count that kept the most now, coarser on a tie.

   3. THE SHAPE TEST WAS THE RAW BOUNDING BOX. One stray mark or a hairline
      at the edge of the art moved the box by more than a cell at every
      count, so pictures that kept 98 to 99% of their paint at 8px fell to
      2px cells: four hoodies and hats did, and the pendant's two specks
      603px from the pendant decided its grid. Components smaller than one
      cell are left out of the shape decision now, and counted.

   4. NOBODY WAS TOLD. A picture that passed and one that fell through were
      both reported as "put on the coarsest grid that kept its shape"; a
      single run said "medium confidence (forced)" and then advised sizes
      the search had measured as worse. The note says which passed, which
      fell through and what they kept; the single run says what the search
      found; and marks smaller than a cell that the conversion dropped -
      it drops them silently on 36 of 311 working traits, and 215 of the
      221 such marks are detail touching the art, not strays - are counted
      and named in both.

   ALSO: fixNativeBlock was exact equality, so one pixel off by one per
   block read as "no grid": Beige MM Hoodie, 98.9% flat at 8px with 61
   blocks holding one pixel a channel off (encoder noise), measured as
   gridless, and one hand-edited pixel would turn any 10px trait into a
   256-cell pick. When the exact pass finds nothing, a second pass allows
   one stray pixel per block; the answer is labelled with the count of such
   blocks, and a block with two or more odd pixels (a drawn line across a
   boundary) still refuses.

   Tests: gridlesssearch.spec.js, on fixtures shown in node to give the old
   answer under the old rule and the new answer under the new one. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 0. state ---------------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[];', 'the batch tallies');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '/* WHAT THE GRIDLESS SEARCH FOUND for the last decision: whether a count',
    '   passed the 95% rule or was the best of a failed lot, and what it kept. */',
    'let fixGridlessPassed=false, fixGridlessKept=0;',
    '/* THE NOISY BLOCKS behind the last measured block: 0 when the measurement',
    '   was exact, else how many blocks held one stray pixel. */',
    'let fixNativeNoisy=0;',
    '/* MARKS SMALLER THAN A CELL, measured once per picture and cached on the',
    '   very array, the way the block is. */',
    'let fixMarksCache=null;',
    'let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0;',
  ]);
}

/* ---- 1. the block measurement tolerates one stray pixel ---------------- */
{
  const fn = kit.inFunction(L, 'function fixNativeBlock(data,W,H){');
  kit.replace(L, fn, [
    'function fixNativeBlock(data,W,H){',
    '  fixNativeNoisy=0;',
    '  if(!data||!(W>0)||!(H>0)) return 0;',
    '  const flat=(N)=>{',
    '    for(let by=0;by+N<=H;by+=N) for(let bx=0;bx+N<=W;bx+=N){',
    '      const i0=((by*W)+bx)*4;',
    '      for(let y=by;y<by+N;y++) for(let x=bx;x<bx+N;x++){',
    '        const i=((y*W)+x)*4;',
    '        if(data[i]!==data[i0]||data[i+1]!==data[i0+1]',
    '          ||data[i+2]!==data[i0+2]||data[i+3]!==data[i0+3]) return false;',
    '      }',
    '    }',
    '    return true;',
    '  };',
    '  for(let N=Math.min(64,W);N>=2;N--){ if(W%N||H%N) continue; if(flat(N)) return N; }',
    '  /* ONE STRAY PIXEL A BLOCK. Exact equality read Beige MM Hoodie - 98.9%',
    '     flat at 8px, 61 blocks holding one pixel a channel off, encoder',
    '     noise - as no grid at all, and would turn a 10px trait with one',
    '     hand-edited pixel into a 256-cell pick. So when nothing is exactly',
    '     flat, a block may hold one pixel unlike the rest; two or more (a',
    '     drawn line across a boundary) still refuse. Measured against the',
    '     first pixel, and against the second when the first is the odd one.',
    '     The count of such blocks is kept, so the answer is labelled. */',
    '  const same=(i,j)=>data[i]===data[j]&&data[i+1]===data[j+1]&&data[i+2]===data[j+2]&&data[i+3]===data[j+3];',
    '  const nearly=(N)=>{',
    '    let noisy=0;',
    '    for(let by=0;by+N<=H;by+=N) for(let bx=0;bx+N<=W;bx+=N){',
    '      const i0=((by*W)+bx)*4;',
    '      let off=0, odd=-1;',
    '      for(let y=by;y<by+N;y++) for(let x=bx;x<bx+N;x++){',
    '        const i=((y*W)+x)*4;',
    '        if(!same(i,i0)){ off++; if(off===1) odd=i; else if(off>1) break; }',
    '      }',
    '      if(off===0) continue;',
    '      if(off===1){ noisy++; continue; }',
    '      /* the first pixel may be the odd one: then all the others match',
    '         each other and not it */',
    '      let alike=true;',
    '      for(let y=by;y<by+N&&alike;y++) for(let x=bx;x<bx+N;x++){',
    '        const i=((y*W)+x)*4;',
    '        if(i!==i0&&!same(i,odd)){ alike=false; break; }',
    '      }',
    '      if(!alike) return 0;',
    '      noisy++;',
    '    }',
    '    return noisy;',
    '  };',
    '  for(let N=Math.min(64,W);N>=2;N--){',
    '    if(W%N||H%N) continue;',
    '    const noisy=nearly(N);',
    '    if(noisy>0){ fixNativeNoisy=noisy; return N; }',
    '  }',
    '  return 0;',
    '}',
  ]);
  /* the cache carries the count with the block */
  const w1 = kit.only(L, l => l === '  FIX.native=fixNativeBlock(sd,sw,sh);', 'the first native writer');
  kit.replace(L, { start: w1, end: w1 }, ['  FIX.native=fixNativeBlock(sd,sw,sh); FIX.nativeNoisy=fixNativeNoisy;']);
  const w2 = kit.only(L, l => l === '    FIX.native=fixNativeBlock(FIX.src.data,o.width,o.height);', 'the second native writer');
  kit.replace(L, { start: w2, end: w2 }, ['    FIX.native=fixNativeBlock(FIX.src.data,o.width,o.height); FIX.nativeNoisy=fixNativeNoisy;']);
  const fr = kit.inFunction(L, 'function fixNativeBlockFor(data,w,h){');
  kit.replace(L, fr, [
    'function fixNativeBlockFor(data,w,h){',
    '  if(data&&FIX.src&&data===FIX.src.data&&typeof FIX.native==="number"){',
    '    fixNativeNoisy=FIX.nativeNoisy||0;',
    '    return FIX.native;',
    '  }',
    '  return fixNativeBlock(data,w,h);',
    '}',
  ]);
}

/* ---- 2. marks smaller than a cell -------------------------------------- */
{
  const at = kit.only(L, l => l === 'const FIX_GRIDLESS_KEEP=0.95;', 'the keep rule');
  kit.replace(L, { start: at, end: at }, [
    'const FIX_GRIDLESS_KEEP=0.95;',
    '/* MARKS SMALLER THAN A CELL: the 4-connected components of the paint',
    '   (alpha over 8) with fewer pixels than one cell of the declared grid',
    '   holds. Measured across the working traits, 215 of 221 such marks touch',
    '   the art - chain links, fold detail, dots in a visor - and 5 are strays;',
    '   the conversion drops many of both without a word. They are left out',
    '   of the gridless shape decision (one 2x2 speck 600px from a pendant',
    '   used to decide its grid) and counted so the run can say what it',
    '   dropped. Cached on the very array, like the block. Returns',
    '   {count, px, starts, big}: the marks\' pixel indices, where each mark',
    '   starts in px, and a mask of the pixels that belong to bigger',
    '   components (null when there are no marks, so nothing is masked). */',
    'function fixSmallMarks(data,W,H){',
    '  if(fixMarksCache&&fixMarksCache.data===data&&fixMarksCache.W===W&&fixMarksCache.H===H) return fixMarksCache.result;',
    '  const g=fixGridCells();',
    '  const limit=Math.max(4,Math.floor((W/g.cells)*(H/g.cells)));',
    '  const lab=new Int32Array(W*H), stack=new Int32Array(W*H), sizes=[0];',
    '  let next=1;',
    '  for(let s=0;s<W*H;s++){',
    '    if(data[s*4+3]<=8||lab[s]) continue;',
    '    let sp=0, n=0; stack[sp++]=s; lab[s]=next;',
    '    while(sp){',
    '      const i=stack[--sp]; n++;',
    '      const x=i%W, y=(i-x)/W;',
    '      if(x>0&&!lab[i-1]&&data[(i-1)*4+3]>8){ lab[i-1]=next; stack[sp++]=i-1; }',
    '      if(x+1<W&&!lab[i+1]&&data[(i+1)*4+3]>8){ lab[i+1]=next; stack[sp++]=i+1; }',
    '      if(y>0&&!lab[i-W]&&data[(i-W)*4+3]>8){ lab[i-W]=next; stack[sp++]=i-W; }',
    '      if(y+1<H&&!lab[i+W]&&data[(i+W)*4+3]>8){ lab[i+W]=next; stack[sp++]=i+W; }',
    '    }',
    '    sizes.push(n); next++;',
    '  }',
    '  const small=new Uint8Array(sizes.length);',
    '  let count=0, total=0;',
    '  for(let l=1;l<sizes.length;l++) if(sizes[l]<limit){ small[l]=1; count++; total+=sizes[l]; }',
    '  let result;',
    '  if(!count) result={count:0, px:null, starts:null, big:null};',
    '  else{',
    '    const big=new Uint8Array(W*H), px=new Int32Array(total), starts=new Int32Array(count+1);',
    '    const at=new Int32Array(sizes.length); let k=0;',
    '    for(let l=1;l<sizes.length;l++) if(small[l]){ at[l]=k; starts[k]=0; k++; }',
    '    /* offsets: each mark\'s pixels stored together */',
    '    const offs=new Int32Array(count+1);',
    '    k=0; for(let l=1;l<sizes.length;l++) if(small[l]){ offs[k+1]=offs[k]+sizes[l]; k++; }',
    '    const fill=new Int32Array(count);',
    '    for(let i=0;i<W*H;i++){ const l=lab[i]; if(!l) continue; if(!small[l]){ big[i]=1; continue; } const m=at[l]; px[offs[m]+fill[m]++]=i; }',
    '    result={count:count, px:px, starts:offs, big:big};',
    '  }',
    '  fixMarksCache={data:data, W:W, H:H, result:result};',
    '  return result;',
    '}',
    '/* HOW MANY OF THOSE MARKS THE RESULT DROPPED: a mark with no pixel under an',
    '   opaque output cell. The cell a pixel lands in is the engine\'s own rule,',
    '   floor(x*cols/w). */',
    'function fixMarksDropped(marks,out,w,h){',
    '  if(!marks||!marks.count||!out||!out.data) return 0;',
    '  const cols=out.width, rows=out.height;',
    '  let dropped=0;',
    '  for(let m=0;m<marks.count;m++){',
    '    let kept=false;',
    '    for(let p=marks.starts[m];p<marks.starts[m+1]&&!kept;p++){',
    '      const i=marks.px[p], x=i%w, y=(i-x)/w;',
    '      const c=Math.floor(y*rows/h)*cols+Math.floor(x*cols/w);',
    '      if(out.data[c*4+3]>0) kept=true;',
    '    }',
    '    if(!kept) dropped++;',
    '  }',
    '  return dropped;',
    '}',
  ]);
}

/* ---- 3. the search ------------------------------------------------------ */
{
  const fn = kit.inFunction(L, 'function fixGridlessCells(data,W,H){');
  kit.replace(L, fn, [
    'function fixGridlessCells(data,W,H){',
    '  fixGridlessPassed=false; fixGridlessKept=0;',
    '  const g=fixGridCells();',
    '  if(!g.exact) return 0;',
    '  const cand=[];',
    '  for(const n of [g.cells,256,320,640]){',
    '    if(n<g.cells||n>640||CANVAS_SIDE%n||cand.indexOf(n)>=0) continue;',
    '    if(n<=W&&n<=H) cand.push(n);',
    '  }',
    '  if(!cand.length) return 0;',
    '  cand.sort((a,b)=>a-b);',
    '  /* THE SOURCE SHAPE, WITHOUT THE STRAYS. The bounding box of every',
    '     painted pixel let one 2x2 speck 600px from a pendant fail every',
    '     candidate, so components smaller than a cell are left out of it.',
    '     They still count as paint. */',
    '  const marks=fixSmallMarks(data,W,H);',
    '  let sx0=W,sy0=H,sx1=-1,sy1=-1,srcN=0;',
    '  for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
    '    if(data[((y*W)+x)*4+3]<=8) continue;',
    '    srcN++;',
    '    if(marks.big&&!marks.big[y*W+x]) continue;',
    '    if(x<sx0) sx0=x; if(x>sx1) sx1=x;',
    '    if(y<sy0) sy0=y; if(y>sy1) sy1=y;',
    '  }',
    '  if(sx1<0) return cand[0];',
    '  let best={cells:cand[0], kept:-1};',
    '  for(const cells of cand){',
    '    const sw=W/cells, sh=H/cells;',
    '    let x0=cells,y0=cells,x1=-1,y1=-1,kept=0;',
    '    for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){',
    '      let op=0,tot=0;',
    '      /* THE ENGINE\'S OWN CELLS. It maps a pixel to floor(x*cols/w); the',
    '         bounds below are that rule inverted, in whole numbers, so a',
    '         pixel is counted in exactly one cell. The old bounds,',
    '         floor(c*s) to ceil((c+1)*s), overlapped by a row and a column',
    '         whenever s was fractional and counted the overlap twice: on',
    '         1254 sources kept/total came to 1.27 and the 95% rule could',
    '         not fail. */',
    '      const yA=Math.floor((cy*H+cells-1)/cells), yB=Math.min(H,Math.floor(((cy+1)*H+cells-1)/cells));',
    '      const xA=Math.floor((cx*W+cells-1)/cells), xB=Math.min(W,Math.floor(((cx+1)*W+cells-1)/cells));',
    '      for(let y=yA;y<yB;y++) for(let x=xA;x<xB;x++){',
    '        tot++; if(data[((y*W)+x)*4+3]>8) op++;',
    '      }',
    '      if(op*2>tot){',
    '        kept+=op;',
    '        if(cx<x0) x0=cx; if(cx>x1) x1=cx;',
    '        if(cy<y0) y0=cy; if(cy>y1) y1=cy;',
    '      }',
    '    }',
    '    if(x1<0) continue;',
    '    /* Within one cell on every side, and most of the paint still there. */',
    '    const near=Math.abs(x0*sw-sx0)<=sw && Math.abs(y0*sh-sy0)<=sh',
    '      && Math.abs((x1+1)*sw-(sx1+1))<=sw && Math.abs((y1+1)*sh-(sy1+1))<=sh;',
    '    if(near && kept>=srcN*FIX_GRIDLESS_KEEP){ fixGridlessPassed=true; fixGridlessKept=kept/srcN; return cells; }',
    '    if(kept>best.kept) best={cells:cells, kept:kept};',
    '  }',
    '  /* NOTHING PASSED: the count that kept the most, coarser on a tie. This',
    '     returned the finest tried - 2px pixels - and on 10 of the 15 working',
    '     traits that fell through a coarser count had kept more. */',
    '  fixGridlessKept=best.kept>0?best.kept/srcN:0;',
    '  return best.cells;',
    '}',
  ]);
}

/* ---- 4. the single run says what the search found, and what was dropped -- */
{
  const at = kit.only(L, l => l === '  const measured=fixMeasuredBlock;', 'the captured decision');
  kit.replace(L, { start: at, end: at }, [
    '  const measured=fixMeasuredBlock;',
    '  const noisy=fixNativeNoisy;',
    '  const gridless={pick:fixGridlessPick, passed:fixGridlessPassed, kept:fixGridlessKept};',
  ]);
  const s0 = kit.only(L, l => l === '        fixSay((r.consensus==="measured"', 'the run sentence');
  const s1 = kit.only(L, l => l === '            +(+r.stepX).toFixed(2)+" px) was too small. "+fixTryThese() : ""));', 'the run sentence end', { start: s0, end: s0 + 8 });
  kit.replace(L, { start: s0, end: s1 }, [
    '        /* WHAT THE RUN DID, in the words of the decision it took: a',
    '           measurement, with its stray blocks; a gridless pick, with what',
    '           it kept and whether that passed; or the detectors\' confidence.',
    '           A gridless pick measured the offered sizes as worse, so the',
    '           "try 8" advice is not given on top of it. */',
    '        const marks=fixSmallMarks(src.data,src.width,src.height);',
    '        const dropped=marks.count?fixMarksDropped(marks,r,src.width,src.height):0;',
    '        const how = r.consensus==="measured"',
    '          ? (r.measuredBlock===1',
    '            ? "kept at one pixel per cell - the picture is already at its native size"',
    '            : "measured "+r.measuredBlock+"px blocks off the picture"',
    '              +(noisy?" ("+noisy+" block"+(noisy===1?" had":"s had")+" one stray pixel)":""))',
    '          : gridless.pick',
    '            ? "no pixel grid found; put on "+gridless.pick+" cells, "',
    '              +(gridless.passed ? "which kept "+Math.round(gridless.kept*100)+"% of the paint"',
    '                : "the count that kept the most ("+Math.round(gridless.kept*100)+"%) - none kept 95%")',
    '            : (r.confidence||"")+" confidence ("+(r.consensus||"?")+")";',
    '        fixSay(how+" \\u00b7 "+secs+"s"',
    '          +(dropped ? " \\u00b7 "+dropped+" mark"+(dropped===1?"":"s")+" smaller than a cell "+(dropped===1?"was":"were")+" dropped" : "")',
    '          +((big||unsure)&&!gridless.pick ? " \\u2014 if the edges still look soft, the pixel size it used ("',
    '            +(+r.stepX).toFixed(2)+" px) was too small. "+fixTryThese() : ""));',
  ]);
}

/* ---- 5. the folder run --------------------------------------------------- */
{
  const at = kit.only(L, l => l === '  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[];', 'the batch reset');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0;',
  ]);
  const p0 = kit.only(L, l => l === '          if(fixGridlessPick) fixGridlessAt.push(fixGridlessPick);', 'the gridless tally');
  kit.replace(L, { start: p0, end: p0 }, [
    '          if(fixGridlessPick){ fixGridlessAt.push(fixGridlessPick);',
    '            if(!fixGridlessPassed){ fixGridlessFellAt.push(fixGridlessPick); fixGridlessFellKept=Math.min(fixGridlessFellKept,fixGridlessKept); } }',
    '          if(fixMeasuredBlock>1&&fixNativeNoisy>0) fixNoisyFiles++;',
  ]);
  const o0 = kit.only(L, l => l === '    const out=r.ok;', 'the batch result');
  kit.replace(L, { start: o0, end: o0 }, [
    '    const out=r.ok;',
    '    /* MARKS SMALLER THAN A CELL THAT THIS RESULT DROPPED, counted here',
    '       because this is the one moment the source and the result are both',
    '       in hand. */',
    '    { const mk=fixSmallMarks(px,sw,sh);',
    '      const dr=mk.count?fixMarksDropped(mk,out,sw,sh):0;',
    '      if(dr){ fixMarksDroppedTotal+=dr; fixMarksDroppedFiles++; } }',
  ]);
  const n0 = kit.only(L, l => l === '  const noGridNote = fixNoGrid', 'the gridless note');
  if (L[n0 + 5] !== '    : "";') throw new Error('the gridless note does not read the way this expects');
  kit.replace(L, { start: n0, end: n0 + 5 }, [
    '  /* WHICH PASSED AND WHICH FELL THROUGH. One sentence used to cover both,',
    '     and "kept its shape" was false for the ones where no grid did. */',
    '  const fell=fixGridlessFellAt.length, passed=fixNoGrid-fell;',
    '  const cellsOf=(arr)=>[...new Set(arr)].sort((a,b)=>a-b).join(", ")+" cells";',
    '  const passedCells=(()=>{ const left=fixGridlessAt.slice(); for(const c of fixGridlessFellAt){ const i=left.indexOf(c); if(i>=0) left.splice(i,1); } return left; })();',
    '  const noGridNote = fixNoGrid',
    '    ? " \\u00b7 "+fixNoGrid+" are not drawn on any pixel grid: "',
    '      +(passed ? passed+" put on the coarsest grid that kept its shape and 95% of its paint ("+cellsOf(passedCells)+")" : "")',
    '      +(passed&&fell ? ", " : "")',
    '      +(fell ? fell+" kept no more than "+Math.round(fixGridlessFellKept*100)+"% at any grid and were put on the count that kept the most ("+cellsOf(fixGridlessFellAt)+")" : "")',
    '      +", and lost detail they had between cells"',
    '    : "";',
    '  const marksNote = fixMarksDroppedTotal',
    '    ? " \\u00b7 "+fixMarksDroppedTotal+" mark"+(fixMarksDroppedTotal===1?"":"s")+" smaller than a cell "',
    '      +(fixMarksDroppedTotal===1?"was":"were")+" dropped on "+fixMarksDroppedFiles+" picture"+(fixMarksDroppedFiles===1?"":"s")',
    '    : "";',
    '  const noisyNote = fixNoisyFiles',
    '    ? " \\u00b7 "+fixNoisyFiles+" measured with one stray pixel in some blocks and kept on their blocks"',
    '    : "";',
  ]);
  const say = kit.only(L, l => l === '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+unfitNote+offNote+shrunkNote+palNote', 'the note line');
  kit.replace(L, { start: say, end: say }, [
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+unfitNote+offNote+shrunkNote+palNote',
  ]);
}

/* ---- 6. checks ---------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  need('const yA=Math.floor((cy*H+cells-1)/cells)');
  never('const yA=Math.floor(cy*sh), yB=Math.min(H,Math.ceil((cy+1)*sh));');
  /* scoped to the search: another function returns a `last` of its own */
  { const a = lines.findIndex(l => l === 'function fixGridlessCells(data,W,H){');
    let b = a; while (lines[b] !== '}') b++;
    if (lines.slice(a, b + 1).some(l => /return last;/.test(l))) throw new Error('the search still returns the finest tried'); }
  need('return best.cells;');
  need('if(marks.big&&!marks.big[y*W+x]) continue;');
  need('function fixSmallMarks(data,W,H){');
  need('function fixMarksDropped(marks,out,w,h){');
  need('const noisy=nearly(N);');
  need('"no pixel grid found; put on "+gridless.pick+" cells, "');
  need('+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+unfitNote+offNote+shrunkNote+palNote');

  /* THE SEARCH, EXERCISED on the fixtures the tests use, carved from the new text. */
  const carve = (name) => { const a = lines.findIndex(l => l.startsWith('function ' + name + '(')); if (a < 0) throw new Error('cannot carve ' + name); for (let i = a + 1; i < lines.length; i++) if (lines[i] === '}') return lines.slice(a, i + 1).join('\n'); throw new Error('unterminated ' + name); };
  const constOf = (sig) => { const a = lines.findIndex(l => l.startsWith(sig)); if (a < 0) throw new Error('no ' + sig); let i = a; while (!/;\s*$/.test(lines[i])) i++; return lines.slice(a, i + 1).join('\n'); };
  const FNS = ['fixGridCells', 'fixSmallMarks', 'fixMarksDropped', 'fixGridlessCells', 'fixNativeBlock'];
  let src = 'let fixGridlessPassed=false, fixGridlessKept=0, fixNativeNoisy=0, fixMarksCache=null;\n';
  for (const c of ['const CANVAS_SIDE=', 'let projectGrid=', 'const FIX_GRIDLESS_KEEP=']) src += constOf(c) + '\n';
  for (const f of FNS) src += carve(f) + '\n';
  src += 'return {' + FNS.join(',') + ', state:()=>({fixGridlessPassed,fixGridlessKept,fixNativeNoisy})};';
  const T = new Function('$', src)(() => null);
  const paint = (W) => { const d = new Uint8ClampedArray(W * W * 4); return { d, put: (x, y) => { const i = (y * W + x) * 4; d[i] = 200; d[i + 1] = 60; d[i + 2] = 60; d[i + 3] = 255; } }; };
  /* A: 1254, frame + square + 6px lines every 16px: 92% at 160, 96% at 256 */
  { const { d, put } = paint(1254);
    for (let y = 100; y < 1100; y++) for (let x = 100; x < 1100; x++) if (x < 120 || x >= 1080 || y < 120 || y >= 1080) put(x, y);
    for (let y = 400; y < 900; y++) for (let x = 300; x < 900; x++) put(x, y);
    for (let k = 0; k < 13; k++) { const y = 150 + k * 16; for (let x = 300; x < 900; x++) for (let q = 0; q < 6; q++) put(x, y + q); }
    const pick = T.fixGridlessCells(d, 1254, 1254);
    if (pick !== 256 || !T.state().fixGridlessPassed) throw new Error('fixture A: expected 256 passed, got ' + pick + ' ' + JSON.stringify(T.state())); }
  /* B: 1280, 3px stripes with 1px gaps plus a 100px hairline far away: nothing passes, 256 keeps the most */
  { const { d, put } = paint(1280);
    for (let y = 400; y < 800; y++) for (let x = 300; x < 900; x++) if ((x - 300) % 4 !== 3) put(x, y);
    for (let x = 1100; x < 1200; x++) put(x, 100);
    const pick = T.fixGridlessCells(d, 1280, 1280);
    if (pick !== 256 || T.state().fixGridlessPassed) throw new Error('fixture B: expected 256 fallen through, got ' + pick + ' ' + JSON.stringify(T.state())); }
  /* C: 1280, a block plus one 2x2 dot far away: 160, and the dot is a mark the result drops */
  { const { d, put } = paint(1280);
    for (let y = 400; y < 800; y++) for (let x = 300; x < 900; x++) put(x, y);
    put(1200, 100); put(1201, 100); put(1200, 101); put(1201, 101);
    const pick = T.fixGridlessCells(d, 1280, 1280);
    if (pick !== 160 || !T.state().fixGridlessPassed) throw new Error('fixture C: expected 160 passed, got ' + pick);
    const mk = T.fixSmallMarks(d, 1280, 1280);
    if (mk.count !== 1) throw new Error('fixture C: expected one mark, got ' + mk.count);
    const out = { width: 160, height: 160, data: new Uint8ClampedArray(160 * 160 * 4) };
    for (let cy = 50; cy < 100; cy++) for (let cx = 37; cx < 113; cx++) out.data[(cy * 160 + cx) * 4 + 3] = 255;
    if (T.fixMarksDropped(mk, out, 1280, 1280) !== 1) throw new Error('fixture C: the dot should count as dropped');
    out.data[(12 * 160 + 150) * 4 + 3] = 255;
    if (T.fixMarksDropped(mk, out, 1280, 1280) !== 0) throw new Error('fixture C: the dot should count as kept when its cell is opaque'); }
  /* D: 8px art with one pixel off by one in 1 of 100 blocks measures 8; a 2px line across a boundary refuses */
  { const W = 640, d = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const k = ((x >> 3) * 5 + (y >> 3) * 3) % 4; const i = (y * W + x) * 4; d[i] = [46, 139, 242, 232][k]; d[i + 1] = [34, 95, 166, 213][k]; d[i + 2] = [47, 191, 90, 183][k]; d[i + 3] = 255; }
    if (T.fixNativeBlock(d, W, W) !== 8) throw new Error('D: exact art should measure 8');
    let n = 0; for (let by = 0; by < W; by += 8) for (let bx = 0; bx < W; bx += 8) { if (++n % 100) continue; const i = ((by + 3) * W + bx + 4) * 4; d[i + 1] = (d[i + 1] + 1) & 255; }
    const got = T.fixNativeBlock(d, W, W);
    if (got !== 8 || T.state().fixNativeNoisy < 1) throw new Error('D: one stray pixel a block should still measure 8 (got ' + got + ', noisy ' + T.state().fixNativeNoisy + ')');
    for (let x = 100; x < 300; x++) for (let y = 203; y < 205; y++) { const i = (y * W + x) * 4; d[i] = 7; d[i + 1] = 7; d[i + 2] = 7; }
    if (T.fixNativeBlock(d, W, W) !== 0) throw new Error('D: a 2px line across boundaries must refuse'); }
});

fs.renameSync(TMP, FILE);
console.log('patch502 written, ' + grew + ' bytes');
