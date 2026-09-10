/* THE TRAITS THAT STILL CAME BACK WRECKED WERE THE ONES WITH NO GRID.

   "troubleshoot the fixer so it works 100% of the time"

   patch416 made a picture with its own pixel grid keep it, and those are now
   exact. 68 of the 323 approved traits have no grid to measure - they are
   photos, gradients, soft edges - and those fell to the declared 160, which
   is the collection's number, not theirs. Measured on all 68, reduced and
   compared with the source:

     onto 160    26 lost 1% or more, 4 lost 10% or more, worst 27.5%
                 2 had their bounding box move by more than 2% of the canvas,
                 worst 29.4%

   That last row is what "half the trait is missing" looks like as a number.
   eyes/Sleepy Neutral Eyes moved 29.4% - its eyelashes are one soft pixel
   wide, they lose the vote in every 8px cell they touch, and the top of the
   art simply stops existing. hats/Blue Patterned Yarmulke moved 21.3%.

   The same 68 onto finer counts, all of which still divide 1280:

     onto 256    18 / 2, worst 17.3%, 2 moved, worst 29.1%
     onto 320    20 / 2, worst 14.1%, NONE moved, worst 1.7%
     onto 640    20 / 1, worst 11.4%, none moved, worst 1.9%

   So there is a grid where these survive, and it is not the same one for
   every picture. Rather than swap one constant for another, the fallback
   MEASURES: coarsest first, take the first count that keeps the picture's
   shape - its bounding box within a cell - and keeps 95% of its opaque
   pixels. If none does, take the finest tried, because at that point the
   choice is how much to lose and less is better.

   A picture that has a grid never reaches this. A picture with no grid gets
   the coarsest grid that does not damage it, and the run says so.

   The declared grid is still where the search starts and still what the label
   names. What changed is that it stopped being the end of the search. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the search ---------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixSnapStep(w){', 'the snapped step');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE GRID FOR A PICTURE THAT HAS NONE.',
    '',
    '   Only reached when fixNativeBlock found no block structure, so there is',
    '   no true answer here and every candidate is invented. What can still be',
    '   asked is which invented one does the least harm, and that is measured',
    '   per picture rather than declared once:',
    '',
    '     coarsest first, take the first count that keeps the shape - the',
    '     opaque bounding box within one cell of where it was - and keeps 95%',
    '     of the opaque pixels.',
    '',
    '   Coarsest first because a coarser grid is more pixel-art, which is the',
    '   point of the tool; the conditions are what stop it going too far. If',
    '   nothing passes, the finest tried is returned - by then the question is',
    '   only how much to lose.',
    '',
    '   Candidates are divisors of the canvas from the declared grid up, so the',
    '   blocks are square whichever wins, and 640 is the floor because 2px',
    '   blocks on a 1280 canvas is about as fine as reduction still means',
    '   anything. Returns 0 if the declared grid cannot be used at all. */',
    'const FIX_GRIDLESS_KEEP=0.95;',
    'function fixGridlessCells(data,W,H){',
    '  const g=fixGridCells();',
    '  if(!g.exact) return 0;',
    '  const cand=[];',
    '  for(const n of [g.cells,256,320,640]){',
    '    if(n<g.cells||n>640||CANVAS_SIDE%n||cand.indexOf(n)>=0) continue;',
    '    if(n<=W&&n<=H) cand.push(n);',
    '  }',
    '  if(!cand.length) return 0;',
    '  cand.sort((a,b)=>a-b);',
    '  /* The source shape, once. */',
    '  let sx0=W,sy0=H,sx1=-1,sy1=-1,srcN=0;',
    '  for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
    '    if(data[((y*W)+x)*4+3]<=8) continue;',
    '    srcN++;',
    '    if(x<sx0) sx0=x; if(x>sx1) sx1=x;',
    '    if(y<sy0) sy0=y; if(y>sy1) sy1=y;',
    '  }',
    '  if(sx1<0) return cand[0];',
    '  let last=cand[0];',
    '  for(const cells of cand){',
    '    last=cells;',
    '    const sw=W/cells, sh=H/cells;',
    '    let x0=cells,y0=cells,x1=-1,y1=-1,kept=0;',
    '    for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){',
    '      let op=0,tot=0;',
    '      const yA=Math.floor(cy*sh), yB=Math.min(H,Math.ceil((cy+1)*sh));',
    '      const xA=Math.floor(cx*sw), xB=Math.min(W,Math.ceil((cx+1)*sw));',
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
    '    if(near && kept>=srcN*FIX_GRIDLESS_KEEP) return cells;',
    '  }',
    '  return last;',
    '}',
  ]);
}

/* ---- and the fallback uses it -------------------------------------- */
{
  const r = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const at = kit.only(L, l => l === '    if(!nat) fixNoGrid++;', 'the gridless counter', r);
  kit.replace(L, { start: at, end: at }, [
    '    if(!nat){',
    '      fixNoGrid++;',
    '      /* NO GRID TO KEEP, so keep the shape instead. Forcing the declared',
    '         count on these moved two traits by a fifth of the canvas and cost',
    '         one of them 27.5% of its pixels. */',
    '      const cells=px?fixGridlessCells(px,w,ph||w):0;',
    '      if(cells>0&&w>0){ fixGridlessPick=cells; return w/cells; }',
    '    }',
  ]);
  const flag = kit.only(L, l => l === 'let fixMeasuredBlock=0;', 'the measured flag');
  kit.replace(L, { start: flag, end: flag }, [
    'let fixMeasuredBlock=0;',
    '/* The count the gridless search settled on, or 0 when it was not used.',
    '   Read by the run that follows, so a picture put on a grid nobody asked',
    '   for is not put there quietly. */',
    'let fixGridlessPick=0;',
  ]);
  const clear = kit.only(L, l => l === '  fixMeasuredBlock=0;', 'where the decision clears');
  kit.replace(L, { start: clear, end: clear }, [
    '  fixMeasuredBlock=0; fixGridlessPick=0;',
  ]);
}

/* ---- and the batch says which grid it landed on -------------------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '  fixMoved=null; fixNoGrid=0;', 'where a batch resets', bat);
  kit.replace(L, { start: at, end: at }, [
    '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];',
  ]);
  const flag = kit.only(L, l => l === 'let fixNoGrid=0;', 'the gridless counter');
  kit.replace(L, { start: flag, end: flag }, [
    'let fixNoGrid=0;',
    '/* The counts the gridless search settled on across a batch, so the note',
    '   can say what happened rather than only that something did. */',
    'let fixGridlessAt=[];',
  ]);
  const note = kit.only(L, l => l === '  const noGridNote = fixNoGrid', 'the gridless note',
    kit.inFunction(L, 'async function fixBatch(files){'));
  let end = note;
  while (L[end] !== '    : "";') end++;
  kit.replace(L, { start: note, end: end }, [
    '  const noGridNote = fixNoGrid',
    '    ? " \\u00b7 "+fixNoGrid+" are not drawn on any pixel grid, so each was put on the"',
    '      +" coarsest grid that kept its shape ("',
    '      +[...new Set(fixGridlessAt)].sort((a,b)=>a-b).join(", ")+" cells)"',
    '      +" and lost detail it had between cells"',
    '    : "";',
  ]);
}

/* ---- and the record is kept where the picture is measured ---------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const step = kit.only(L, l => l.indexOf('        mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);') === 0,
    'the batch step question', bat);
  kit.replace(L, { start: step, end: step }, [
    '        mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);',
    '          if(fixGridlessPick) fixGridlessAt.push(fixGridlessPick);',
    '          return s>0?s:null; })()});',
  ]);
}

const bytes = kit.save(doc, ({ code, codeLines }) => {
  /* MEASURED PER PICTURE, not a second constant. */
  const gc = kit.inFunction(codeLines, 'function fixGridlessCells(data,W,H){');
  const body = codeLines.slice(gc.start, gc.end + 1).join('\n');
  if (!/for\(const cells of cand\)/.test(body))
    throw new Error('it is not searching, it is picking one number');
  if (!/cand\.sort\(\(a,b\)=>a-b\);/.test(body))
    throw new Error('the search is not coarsest-first, so it never prefers pixel art');
  if (!/kept>=srcN\*FIX_GRIDLESS_KEEP/.test(body))
    throw new Error('a candidate that deletes the picture is accepted');
  if (!/const near=/.test(body))
    throw new Error('a candidate that moves the picture is accepted');
  /* EVERY CANDIDATE DIVIDES THE CANVAS, or the blocks come out ragged - which
     is the whole reason the detectors were not used here. */
  if (!/CANVAS_SIDE%n\|\|/.test(body))
    throw new Error('a candidate that cannot give square pixels is allowed in');
  /* And it is only reached when there is no grid to keep. */
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  const sb = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/if\(!nat\)\{/.test(sb))
    throw new Error('the gridless search runs on pictures that have a grid');
  if (sb.indexOf('fixGridlessCells') < sb.indexOf('const nat='))
    throw new Error('the gridless search is consulted before the picture is measured');
  /* The old fallback is still there for when the search cannot answer. */
  if (!/const s=fixSnapStep\(w\);/.test(sb))
    throw new Error('the declared grid stopped being the last resort');
  /* And the note says which grids, not just that something happened. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/fixGridlessAt\.push\(fixGridlessPick\)/.test(bb))
    throw new Error('the batch does not record what the search chose');
  if (!/fixGridlessAt=\[\]/.test(bb))
    throw new Error('a run would describe the run before it');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
