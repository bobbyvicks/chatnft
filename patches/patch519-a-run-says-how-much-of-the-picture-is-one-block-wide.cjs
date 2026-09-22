/* A RUN SAYS HOW MUCH OF THE PICTURE IS ONE BLOCK WIDE.

   patch515 says when the collection's cells cut across the blocks a picture
   was drawn in - 101 of the 311 working traits. Harmless for most of them: a
   background of big flat shapes re-cuts with nothing lost. What dies is
   detail that is ONE BLOCK wide - a letter stroke, a wire, an outline -
   because one block of a 5px picture is 0.625 of an 8px cell, and there is
   no such thing as a stroke 0.625 cells wide. hats/Make Solana Great Again
   Hat: every stroke in its lettering is exactly one 5px block, and the words
   come out as rubble while every per-trait number looks fine.

   A STROKE, NOT A COLOUR CHANGE. The first measure tried was "a run of one
   block", which in block art with any dither or gradient is true of nearly
   everything: it fired on 101 of 101 and said nothing. A stroke has a shape
   - one block wide, continuing along its length, the same surround on both
   sides:
     vertical    self == above == below,  left == right != self
     horizontal  self == left == right,   above == below != self
   That excludes a checkerboard (the block above differs) and a gradient (the
   two sides differ from each other). Calibrated on four canvases whose
   answers are known - one-block stems, a checkerboard, a gradient, wide bars
   - and the patch refuses to write unless the carved function counts the
   stems and nothing else. Measured over the 101 cut-across traits: 88 hold
   at least one such stroke, 38 hold twenty or more, 7 hold a hundred or
   more; Backrooms Hallway 615, Utopia 557, the hat 243. Traits whose cells
   DIVIDE their blocks keep their strokes (Party Corner holds 878 at 8px and
   is fine), which is why this is only said when the grid cuts across.

   WHAT THIS ADDS. Counted on the picture's own block grid - one sample per
   block, which is exact for block-drawn art and is only asked of art whose
   block the page itself measured. The single run's sentence gains "- 243
   strokes one block wide will not survive it"; the folder run's clause gains
   "88 of them holding detail one block wide (most in Backrooms Hallway,
   Utopia, Make Solana Great Again Hat)". No pixel and no verdict changes. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the instrument, beside the block measurement it depends on ------ */
{
  const fn = kit.inFunction(L, 'function fixNativeBlock(data,W,H){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* HOW MANY BLOCKS OF THIS PICTURE ARE A STROKE ONE BLOCK WIDE - the thing',
    '   an 8px cell cannot hold when the block is 5px or 10px.',
    '',
    '   On the picture\'s own block grid: one sample per block, at its centre,',
    '   which is exact for art whose block fixNativeBlock measured (every NxN',
    '   square is one colour) and is only ever asked of that art. A stroke is a',
    '   block whose two neighbours along the stroke are its own colour and whose',
    '   two neighbours across it are one other colour - so a letter stem counts,',
    '   a checkerboard does not (the block above differs), a gradient does not',
    '   (the two sides differ from each other), and a bar four blocks wide does',
    '   not. The first measure tried, "a run of one block", fired on 101 of 101',
    '   cut-across traits because dither is a run of one; this one separates',
    '   Backrooms Hallway (615) from Ruins Selfie (75) and counts the hat\'s',
    '   lettering at 243. */',
    'function fixThinStrokes(data,W,H,block){',
    '  block=block|0; if(block<2||!data) return 0;',
    '  const w=Math.floor(W/block), h=Math.floor(H/block), half=Math.floor(block/2);',
    '  if(w<3||h<3) return 0;',
    '  const a=new Int32Array(w*h);',
    '  for(let by=0;by<h;by++) for(let bx=0;bx<w;bx++){',
    '    const i=((by*block+half)*W+bx*block+half)*4;',
    '    a[by*w+bx]=data[i+3]===0 ? -1 : ((data[i]<<16)|(data[i+1]<<8)|data[i+2]);',
    '  }',
    '  const atb=(x,y)=>(x<0||y<0||x>=w||y>=h) ? -2 : a[y*w+x];',
    '  let n=0;',
    '  for(let y=0;y<h;y++) for(let x=0;x<w;x++){',
    '    const me=a[y*w+x]; if(me===-1) continue;',
    '    const Lf=atb(x-1,y), Rt=atb(x+1,y), Up=atb(x,y-1), Dn=atb(x,y+1);',
    '    if(Up===me&&Dn===me&&Lf===Rt&&Lf!==me) n++;',
    '    if(Lf===me&&Rt===me&&Up===Dn&&Up!==me) n++;',
    '  }',
    '  return n;',
    '}',
  ]);
}

/* ---- 2. measured where the cut is decided ------------------------------- */
swap('      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step};',
  ['      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step,',
   '        strokes:fixThinStrokes(px,w,ph,drawn)};'],
  'the typed recut flag');

/* ---- 3. the single run says it ------------------------------------------- */
{
  const i = at('          ? "drawn at "+typedBy.block+"px blocks ("+typedBy.cells+" cells), which the "', 'the typed how clause');
  if (L[i + 1] !== '            +fixGridCells().cells+" cell grid cuts across"') throw new Error('the how clause is not two lines');
  kit.replace(L, { start: i + 1, end: i + 1 }, [
    '            +fixGridCells().cells+" cell grid cuts across"',
    '            /* Only when there is some: a picture of flat shapes re-cuts with',
    '               nothing lost, and a clause on every cut-across run would be',
    '               noise where the count is the finding. */',
    '            +(typedBy.strokes ? " - "+typedBy.strokes.toLocaleString()+" stroke"',
    '              +(typedBy.strokes===1?"":"s")+" one block wide will not survive it" : "")',
  ]);
}

/* ---- 4. the folder run counts the ones holding detail ------------------- */
swap('let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[], fixTypedRecutAt=[];',
  ['let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[], fixTypedRecutAt=[], fixTypedStrokesAt=[];'],
  'the folder counters');
swap('  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[]; fixTypedRecutAt=[];',
  ['  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[]; fixTypedRecutAt=[]; fixTypedStrokesAt=[];'],
  'the folder reset');
swap('          if(fixTypedRecut) fixTypedRecutAt.push(fixTypedRecut.block);',
  ['          if(fixTypedRecut){ fixTypedRecutAt.push(fixTypedRecut.block);',
   '            if(fixTypedRecut.strokes) fixTypedStrokesAt.push({name:name, strokes:fixTypedRecut.strokes}); }'],
  'the folder recut counter');
{
  const i = at('      +[...new Set(fixTypedRecutAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+")"', 'the folder cut-across clause end');
  kit.replace(L, { start: i, end: i }, [
    '      +[...new Set(fixTypedRecutAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+")"',
    '      /* AND HOW MANY OF THOSE WILL LOSE SOMETHING, with the worst named so',
    '         a folder of 311 says which three to open first. */',
    '      +(fixTypedStrokesAt.length',
    '        ? ", "+fixTypedStrokesAt.length+" of them holding detail one block wide (most in "',
    '          +fixTypedStrokesAt.slice().sort((a,b)=>b.strokes-a.strokes).slice(0,3).map(s=>s.name).join(", ")+")"',
    '        : "")',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  for (const s of ['function fixThinStrokes(data,W,H,block){',
    '        strokes:fixThinStrokes(px,w,ph,drawn)};',
    '" one block wide will not survive it" : "")',
    'fixTypedStrokesAt.push({name:name, strokes:fixTypedRecut.strokes}); }',
    '" of them holding detail one block wide (most in "']) need(s);
  const times = (re) => (code.match(re) || []).length;
  if (times(/fixThinStrokes\(/g) !== 2) throw new Error('fixThinStrokes: 1 definition + 1 caller expected, found ' + times(/fixThinStrokes\(/g));

  /* THE INSTRUMENT, CALIBRATED BEFORE IT IS TRUSTED. Four canvases whose
     answers are known; it has to count the stems and nothing else. */
  const a = code.indexOf('function fixThinStrokes(data,W,H,block){');
  const b = code.indexOf('\n}', a);
  const thin = new Function(code.slice(a, b + 2) + '\nreturn fixThinStrokes;')();
  const canvas = (kind, B, N) => {
    const W = B * N, d = new Uint8ClampedArray(W * W * 4);
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      let v = 30;
      if (kind === 'stems') v = (bx % 5 === 2) ? 255 : 30;
      if (kind === 'checker') v = ((bx + by) % 2) ? 255 : 30;
      if (kind === 'gradient') v = 20 + ((bx * 200 / N) | 0);
      if (kind === 'bars') v = (bx % 8 < 4) ? 255 : 30;
      for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
        const i = (((by * B + y) * W) + bx * B + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    return thin(d, W, W, B);
  };
  const N = 40, B = 5, want = 8 * (N - 2);
  const got = { stems: canvas('stems', B, N), checker: canvas('checker', B, N), gradient: canvas('gradient', B, N), bars: canvas('bars', B, N) };
  if (got.stems !== want || got.checker !== 0 || got.gradient !== 0 || got.bars !== 0)
    throw new Error('fixThinStrokes cannot tell a stroke from a dither: ' + JSON.stringify(got) + ', stems want ' + want);
});

fs.renameSync(TMP, FILE);
console.log('patch519 written, ' + grew + ' bytes');
