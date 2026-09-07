/* ONE CANVAS SIZE, AND EVERY TRAIT FILLS IT.

   "the trait preview also didnt shrink everything to 1048 like i asked", then
   "idk you tell me what is best".

   === WHY 1280 AND NOT 1048 ===

   1048 is 8 x 131 and 131 is prime, so nothing in the collection divides into
   it: all 272 traits would land on a split grid. Measured over the real files,
   with "broken" meaning the scale does not keep a pixel block whole:

     canvas   broken grids   shrunk
      1048    272 of 272       38
      1024     38              38
      1280     24               1

   1024 is the one that looks reasonable and is not. The 31 skins are 1280 on
   8px blocks; taking them to 1024 is a scale of 4/5, so 8px cells become 6.4
   and come out alternately 6 and 7. Skins are the base layer of every single
   character, so that is the most visible artwork in the collection and it is
   the artwork 1024 damages. It is the same measurement that stopped the skins
   being resized when that was asked for directly.

   1280 is what the skins already are, and 1024 art grows into it at 5/4 - 8px
   cells become exactly 10, 4px become exactly 5.

   === AND A FIXED SIZE IS RIGHT FOR ITS OWN SAKE ===

   The canvas was the largest trait IN THIS DRAW. So the preview changed size
   depending on which traits were picked, and two runs of Generate could
   produce collections at two different resolutions with nothing said. A
   constant is not just the answer to the question asked; it removes that.

   === WHAT CHANGES IN paintTrait ===

   It could only ever grow, and only by a whole number unless the ratio kept
   every block whole. Measured through the shipped function over all 272:

     216 grew 1024 -> 1280 at x1.25          already right
      24 stayed at native size, so 80% or 98% of the canvas
       1 at 2048 was drawn at 2048 into the box and CROPPED
       0 ever shrank

   The whole-number rule went in for a real reason, kept in
   tests/pixels.spec.js: a 48px source striped every pixel, stretched into a
   160 box, comes out with stripes 3 and 4 wide. That is still true and this
   does not touch it.

   What it could not see is that the rule DOES NOTHING when the whole number
   is 1. At 1024 into 1280 the honest choice is between x1.25 and no scaling at
   all - and "no scaling at all" is a trait sitting at 80% of everything around
   it, in every image minted. The striped fixture is a different case: its
   whole number is 3, so the rule really is choosing between 3 and 3.33 and
   the 10% it gives up buys uniform stripes.

   So the rule now applies where it earns its keep. When the whole number is 2
   or more it stands. When it is 1 - when the alternative is not scaling at all
   - the fractional fit is taken. And a trait bigger than the canvas is scaled
   DOWN rather than cropped, which was never a trade-off, just a gap.

   Every one of the 24 that this newly scales has 1px or 2px blocks. The chunky
   8px art all lands whole. So the traits that take a fractional scale are
   exactly the ones with almost no block structure to damage. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const fitLine = kit.only(L, l => l === '  const fit=Math.min(W/w,H/h);', 'the fit in paintTrait');
const useLine = kit.only(L, l => l === '  let use=k;', 'the chosen scale');
const branch = kit.only(L, l => l === '  if(fit>k){', 'the fractional branch');
const qLine = kit.only(L, l => l === '    if(q>1 && pixelBlock(bm)%q===0) use=fit;', 'the block test');
if (!(fitLine + 1 === useLine && useLine + 1 === branch)) throw new Error('paintTrait is not shaped as assumed');
if (L[qLine + 1] !== '  }') throw new Error('the fractional branch does not close where expected');

/* The three places a composite canvas is sized. */
const cw = L.map((l, i) => l === '  cv.width=W; cv.height=H;' ? i : -1).filter(i => i >= 0);
if (cw.length !== 2) throw new Error('expected two preview canvases, saw ' + cw.length);
const build = kit.only(L, l => l === '  const cv=document.createElement("canvas"); cv.width=W; cv.height=H;',
  'the generate canvas');
const maxA = kit.only(L, l => l === '  for(const p of pieces){ if(p.w>W) W=p.w; if(p.h>H) H=p.h; }', 'the review max');
const maxB = kit.only(L, l => l === '  for(const p of picked){ if(p.rec.w>W) W=p.rec.w; if(p.rec.h>H) H=p.rec.h; }', 'the compose max');
/* FOUR surfaces, not three. drawSheet - the Sheet of 12 - sizes its tiles the
   same way, and the anchor check found it by refusing a match that hit two
   lines. Both are scoped to their own function rather than told apart by
   their text, which is identical. */
const genFn = kit.inFunction(L, 'async function buildCollection(n,onProgress){');
const shtFn = kit.inFunction(L, 'async function drawSheet(count){');
const maxC = kit.only(L, l => l === '  for(const c of combos) for(const r of c){ if(r.w>W) W=r.w; if(r.h>H) H=r.h; }', 'the generate max', genFn);
const maxD = kit.only(L, l => l === '  for(const c of combos) for(const r of c){ if(r.w>W) W=r.w; if(r.h>H) H=r.h; }', 'the sheet max', shtFn);

/* ---- WRITE, strictly descending by line ------------------------- */
const writes = [
  [maxD, ['  /* Fixed, so every tile on the sheet is the same size whatever',
    '     was picked for it. */',
    '  W=CANVAS_SIDE; H=CANVAS_SIDE;']],
  [maxC, ['  /* THE FIXED CANVAS, not the biggest trait in this draw - see CANVAS_SIDE.',
    '     Sizing to the draw meant two runs of Generate could produce collections',
    '     at two different resolutions and say nothing about it. */',
    '  W=CANVAS_SIDE; H=CANVAS_SIDE;']],
  [maxB, ['  /* Fixed, so the preview does not change size with the picks. */',
    '  W=CANVAS_SIDE; H=CANVAS_SIDE;']],
  [maxA, ['  /* Fixed, so two pairs are compared at the same size. */',
    '  W=CANVAS_SIDE; H=CANVAS_SIDE;']],
  [qLine, ['    if(q>1 && pixelBlock(bm)%q===0) use=fit;',
    '    /* AND WHEN THE WHOLE NUMBER IS 1, take the fit anyway. The rule above',
    '       protects blocks by giving up size, and at k=1 there is no size to',
    '       give up - the choice is between the fit and not scaling at all, and',
    '       not scaling leaves a 1024 trait at 80% of everything beside it in',
    '       every image. The striped fixture in tests/pixels.spec.js is the other',
    '       case and is untouched: its whole number is 3, so the rule is choosing',
    '       between 3 and 3.33 and the 10% it gives up buys uniform stripes.',
    '',
    '       Measured over the 272 real traits: every one this newly scales has',
    '       1px or 2px blocks. The chunky 8px art all lands whole through the',
    '       test above, so the fractional scale only ever reaches artwork with',
    '       almost no block structure to damage. */',
    '    else if(k===1) use=fit;']],
  [useLine, ['  let use=k;',
    '  /* SMALLER THAN THE CANVAS: scale down. k is floored at 1, so a trait',
    '     bigger than the box used to be drawn at its own size and cropped by',
    '     it - one 2048 file in this collection, losing 38% of itself. That was',
    '     never a trade-off between size and blocks, just a gap. */',
    '  if(fit<1){ use=fit; }']],
];
for (const [at, lines] of writes.sort((a, b) => b[0] - a[0])) kit.replace(L, { start: at, end: at }, lines);

/* The constant, beside the fit it governs. */
const fitNow = kit.only(L, l => l === '  const fit=Math.min(W/w,H/h);', 'the fit, after');
const fnTop = kit.only(L, l => l === 'function paintTrait(g,bm,ox,oy,W,H){', 'paintTrait');
kit.replace(L, { start: fnTop, end: fnTop }, [
  '/* ONE SIZE FOR EVERY COMPOSITE, chosen by measuring the collection rather',
  '   than picked. 1048 was asked for and is the worst available number - it is',
  '   8 x 131 with 131 prime, so all 272 traits land on a split grid. 1024 looks',
  '   reasonable and is not: the 31 skins are 1280 on 8px blocks, so 1024 makes',
  '   their cells 6.4px and they come out alternately 6 and 7 - and skins are',
  '   the base layer of every character. 1280 is what the skins already are, and',
  '   1024 art grows into it at 5/4, which turns 8px cells into exactly 10.',
  '',
  '     canvas   broken grids   shrunk',
  '      1048    272 of 272       38',
  '      1024     38              38',
  '      1280     24               1   */',
  'const CANVAS_SIDE=1280;',
  'function paintTrait(g,bm,ox,oy,W,H){',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const CANVAS_SIDE=1280;') !== 1) throw new Error('the constant did not land');
  if (has('  W=CANVAS_SIDE; H=CANVAS_SIDE;') !== 4) throw new Error('expected four canvases to be fixed');
  /* Every "biggest trait in this draw" loop is gone, not merely followed by
     an assignment that overrides it. */
  for (const l of ['  for(const p of pieces){ if(p.w>W) W=p.w; if(p.h>H) H=p.h; }',
    '  for(const p of picked){ if(p.rec.w>W) W=p.rec.w; if(p.rec.h>H) H=p.rec.h; }',
    '  for(const c of combos) for(const r of c){ if(r.w>W) W=r.w; if(r.h>H) H=r.h; }'])
    if (has(l) !== 0) throw new Error('a draw-sized canvas survived: ' + l.trim().slice(0, 40));
  if (code.indexOf('if(fit<1){ use=fit; }') < 0) throw new Error('nothing shrinks an oversized trait');
  if (code.indexOf('else if(k===1) use=fit;') < 0) throw new Error('the k=1 case did not land');
  /* The block-preserving test still comes FIRST - it is the preferred answer
     and the k=1 case is the fallback, not a replacement. */
  const a = code.indexOf('if(q>1 && pixelBlock(bm)%q===0) use=fit;');
  const b = code.indexOf('else if(k===1) use=fit;');
  if (!(a >= 0 && b > a)) throw new Error('the fallback does not follow the block test');
});

console.log('index.html grew by ' + grew + ' bytes');
