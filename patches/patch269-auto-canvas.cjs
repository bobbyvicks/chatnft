/* THE CANVAS IS WORKED OUT FROM THE COLLECTION, NOT TYPED IN.

   "can we make it auto fit though? i feel like we can (LMNFT can)".

   We can, and it is better than the constant for a reason beyond convenience:
   1280 is the right answer for THIS collection, and I arrived at it by running
   a script over the files and reading a table. Nothing in the page knew how I
   got there, so the number would have stayed at 1280 after the artwork moved
   on - and 8 more mouths and a v7 bundle arrived while I was measuring it.

   THE RULE IS THE ONE THE TABLE WAS SCORING. A trait of side s drawn on blocks
   of b lands whole on a canvas of side C exactly when C/s reduces to p/q and q
   divides b. Count how many traits land whole for each candidate, and take the
   winner. Ties go to the one that shrinks fewest, then to the larger, because
   shrinking is the only operation here that can lose detail.

   Candidates are the sizes actually present. A size no trait has is a size
   every trait has to be scaled to, and there is no reason to invent one.

   Run over the real 272 it picks 1280, which is what the hand-made table said:

     1024   234 land whole    38 shrink
     1254    12 land whole     6 shrink
     1280   248 land whole     1 shrink   <- chosen
     2048   235 land whole     0 shrink

   Note what it did NOT choose. 2048 shrinks nothing at all, and loses on
   whole-block count - which is the trade this is supposed to make, since a
   trait scaled by a ratio that splits its blocks is damaged in every image
   while one shrunk cleanly is not.

   THE BLOCK IS MEASURED, ONCE, AND KEPT. pixelBlock decodes a bitmap, so doing
   it for 272 traits on every preview would be absurd. It is cached by record
   id, and the whole answer is cached against the set of traits it was computed
   from - so it is recomputed when the collection changes and not otherwise.

   CANVAS_SIDE stays as the answer when there is nothing to measure: an empty
   project, or a set whose bitmaps will not decode. A fallback that is a real
   measured number is better than one that is a round guess. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const konst = kit.only(L, l => l === 'const CANVAS_SIDE=1280;', 'the fallback size');
kit.only(L, l => l === 'function gcdOf(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ const t=a%b; a=b; b=t; } return a||1; }', 'gcdOf');
kit.only(L, l => l === 'function pixelBlock(bm){', 'pixelBlock');
kit.only(L, l => l.indexOf('async function cBitmap(') === 0 || l.indexOf('function cBitmap(') === 0, 'cBitmap');

const spots = L.map((l, i) => l === '  W=CANVAS_SIDE; H=CANVAS_SIDE;' ? i : -1).filter(i => i >= 0);
if (spots.length !== 4) throw new Error('expected four fixed canvases, saw ' + spots.length);
/* Each one is inside an async function, or awaiting the size here would be a
   syntax error rather than a slow render. */
for (const at of spots) {
  let ok = false;
  for (let i = at; i >= 0 && i > at - 400; i--)
    if (/^(async )?function /.test(L[i])) { ok = L[i].indexOf('async function') === 0; break; }
  if (!ok) throw new Error('the canvas at line ' + (at + 1) + ' is not inside an async function');
}
/* What each one should measure. The review sheet and compose paint a few
   traits but must size from the WHOLE collection, or the canvas changes with
   the picks again - which is the defect the constant was brought in to fix. */
kit.only(L, l => l === 'let cItems=[];' || l.indexOf('let cItems=') === 0, 'the collection list');

/* ---- WRITE, bottom upward ---------------------------------------- */
for (const at of spots.slice().sort((a, b) => b - a)) {
  kit.replace(L, { start: at, end: at }, [
    '  /* From the collection, not from this draw - see autoCanvas. Sizing to',
    '     the picks is what made the preview change size between draws. */',
    '  { const S=await autoCanvas(cItems); W=S; H=S; }',
  ]);
}

/* RE-FOUND, not reused. konst was located before the four canvases were
   rewritten, and two of those sit ABOVE it - so by now its line number is four
   short and writing there lands inside the comment above it. patchkit refused
   that write on its parse check, which is the third time this session an index
   captured before a write has been used after one. The remedy is not to be
   more careful about ordering; it is to look the line up again. */
const konstNow = kit.only(L, l => l === 'const CANVAS_SIDE=1280;', 'the fallback size, after');
kit.replace(L, { start: konstNow, end: konstNow }, [
  'const CANVAS_SIDE=1280;',
  '/* THE CANVAS THE COLLECTION WANTS, worked out rather than typed in.',
  '',
  '   A trait of side s on blocks of b lands whole on a canvas of side C',
  '   exactly when C/s reduces to p/q and q divides b. That is the rule the',
  '   1024/1254/1280/2048 table above was scoring by hand; this scores it from',
  '   the traits that are actually here, so the answer follows the artwork',
  '   instead of staying at whatever was true the day it was measured.',
  '',
  '   Candidates are the sizes present. A size no trait has is one every trait',
  '   must be scaled to, and there is no reason to invent one.',
  '',
  '   Ties go to fewest shrunk and then to the larger, because shrinking is the',
  '   only thing here that can lose detail - which is also why 2048 does not win',
  '   on the real collection despite shrinking nothing: it splits more blocks',
  '   than it saves. */',
  'const blockOf=new Map();',
  'let autoSide=null, autoKey="";',
  'async function autoCanvas(recs){',
  '  const list=(recs||[]).filter(r=>r&&r.kind!=="ref"&&(r.w||r.h));',
  '  if(!list.length) return CANVAS_SIDE;',
  '  /* Keyed on the traits AND their sizes, so adding one or replacing one with',
  '     a different size recomputes and nothing else does. */',
  '  const key=list.map(r=>r.id+":"+(r.w|0)+"x"+(r.h|0)).sort().join("|");',
  '  if(autoKey===key && autoSide) return autoSide;',
  '  const seen=[];',
  '  for(const r of list){',
  '    const s=Math.max(r.w||0,r.h||0);',
  '    if(!s) continue;',
  '    let blk=blockOf.get(r.id);',
  '    if(blk===undefined){',
  '      /* Decoding is the expensive part, so it happens once per record and is',
  '         kept. A bitmap that will not decode counts as block 1, which is the',
  '         cautious answer - it lands whole on nothing and cannot make a',
  '         candidate look better than it is. */',
  '      try{ blk=pixelBlock(await cBitmap(r)); }catch(_){ blk=1; }',
  '      blockOf.set(r.id,blk);',
  '    }',
  '    seen.push({s:s,blk:blk});',
  '  }',
  '  if(!seen.length) return CANVAS_SIDE;',
  '  let best=null;',
  '  for(const C of [...new Set(seen.map(x=>x.s))]){',
  '    let whole=0, shrunk=0;',
  '    for(const it of seen){',
  '      const q=it.s/gcdOf(C,it.s);',
  '      if(q===1 || it.blk%q===0) whole++;',
  '      if(it.s>C) shrunk++;',
  '    }',
  '    if(!best || whole>best.whole',
  '       || (whole===best.whole && shrunk<best.shrunk)',
  '       || (whole===best.whole && shrunk===best.shrunk && C>best.C))',
  '      best={C:C,whole:whole,shrunk:shrunk};',
  '  }',
  '  autoKey=key; autoSide=best.C;',
  '  return best.C;',
  '}',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('async function autoCanvas(recs){') !== 1) throw new Error('autoCanvas did not land');
  if (has('  { const S=await autoCanvas(cItems); W=S; H=S; }') !== 4)
    throw new Error('expected all four canvases to ask autoCanvas');
  if (has('  W=CANVAS_SIDE; H=CANVAS_SIDE;') !== 0) throw new Error('a hard-coded canvas survived');
  /* The rule is CODE. A comment describing q dividing the block is not one. */
  if (code.indexOf('if(q===1 || it.blk%q===0) whole++;') < 0)
    throw new Error('nothing scores whether a trait lands whole');
  /* The fallback still exists and is still reachable. */
  if (has('const CANVAS_SIDE=1280;') !== 1) throw new Error('the fallback went');
  if ((code.match(/return CANVAS_SIDE;/g) || []).length !== 2)
    throw new Error('expected the fallback on both empty paths');
  /* Cached by record, or this decodes 272 bitmaps per preview. */
  if (code.indexOf('blockOf.set(r.id,blk);') < 0) throw new Error('the block is not cached');
});

console.log('index.html grew by ' + grew + ' bytes');
