/* THE AUTO-CLEAR HAS TO USE WHAT WAS REMEMBERED, OR IT MISSES THE CASE.

   patch252's auto-clear fires only when the base pair covers BASE_COVER of
   the picture - a whole render. patch254 added the memory but nothing taught
   the auto-clear to use it, so a cropped trait with a green and pink fringe
   still opens dirty and still has to be cleaned by hand. That is the exact
   thing that was asked for, and it was one condition away from working.

   So it now fires on either footing, and the two are gated differently
   because they are known differently:

     render     - unmistakable, 94.5% against 79.1% over 280 real files, and
                  it also WRITES the colours down so every later crop is easy.
     remembered - the colours are certain, the amount is not. A trait that
                  genuinely uses the base colour would lose real artwork, and
                  backgrounds/Casino Floor.png is a real example: #EC007D, on
                  1984 pixels, 6.8 from the base pink. So a remembered clear
                  runs by itself only while it stays small enough to be a
                  fringe; past that it waits for the button, which now says
                  what it would take.

   BASE_AUTO_MAX is the fringe/artwork line and it is a judgement, not a
   measurement - there is no population of cropped-but-dirty traits on disk to
   derive it from, because the person cleans them by hand before saving. 40%
   is set where the sixteen renders' leftovers cannot reach it and a trait
   made largely OF the base colour cannot pass it. Said plainly rather than
   dressed up as measured. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* CHECK - the block as patch252 left it, all ten lines of it. */
const at = kit.only(L, l => l === '  const bp=basePlan();', 'the auto-clear in startEditor');
const want = [
  '  const bp=basePlan();',
  '  if(bp && bp.list.length>=2 && bp.cover>=BASE_COVER){',
  '    snapshot();',
  '    const r=hideBase();',
  '    if(r && (r.gone+r.peeled)){',
  '      ctx.putImageData(r.plan.im,0,0);',
  '      refreshStats(); repalette(); cleanLabel(); baseLabel();',
  '      toast("Hid the base - "+(r.gone+r.peeled).toLocaleString()+" pixels. Undo brings it back.");',
  '    } else undoStack.pop();',
  '  }',
];
for (let i = 0; i < want.length; i++)
  if (L[at + i] !== want[i]) throw new Error('line ' + (i + 1) + ' of the block is not what patch252 wrote:\n  want ' + want[i] + '\n  got  ' + L[at + i]);

/* CHECK - the constant is not already taken. */
if (L.some(l => l.indexOf('BASE_AUTO_MAX') >= 0)) throw new Error('BASE_AUTO_MAX already exists');

kit.replace(L, { start: at, end: at + want.length - 1 }, [
  '  const bp=basePlan();',
  '  /* A render clears itself and teaches this browser its colours. A picture',
  '     that merely CONTAINS them - the ordinary case, a crop that took some',
  '     base with it - clears itself too, but only while what it would take is',
  '     small enough to be a fringe rather than the trait. */',
  '  if(bp && bp.source!=="guess"',
  '     && (bp.source==="render" || bp.cover<=BASE_AUTO_MAX)){',
  '    snapshot();',
  '    const r=hideBase();',
  '    if(r && (r.gone+r.peeled)){',
  '      ctx.putImageData(r.plan.im,0,0);',
  '      if(r.plan.source==="render") saveBaseColours(r.plan.list);',
  '      refreshStats(); repalette(); cleanLabel(); baseLabel();',
  '      toast("Hid the base - "+(r.gone+r.peeled).toLocaleString()+" pixels. Undo brings it back.");',
  '    } else undoStack.pop();',
  '  }',
]);

/* The constant, beside the others it belongs with. */
const cover = kit.only(L, l => l === 'const BASE_COVER=88;   /* percent of the picture a real base pair covers */',
  'the BASE_COVER constant');
kit.replace(L, { start: cover, end: cover }, [
  'const BASE_COVER=88;   /* percent of the picture a real base pair covers */',
  '/* How much a REMEMBERED base may take before it stops doing it unasked. A',
  '   judgement rather than a measurement: there is no population of cropped-',
  '   but-dirty traits on disk to derive it from, because they get cleaned by',
  '   hand before they are saved. Set where a crop leftover cannot reach it and',
  '   a trait made largely of the base colour cannot pass it. */',
  'const BASE_AUTO_MAX=40;',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const BASE_AUTO_MAX=40;') !== 1) throw new Error('the constant did not land');
  if (code.indexOf('BASE_AUTO_MAX') < 0) throw new Error('the constant is only in a comment');
  /* The gate really reads the source, rather than the old cover-only test. */
  if (code.indexOf('bp.source!=="guess"') < 0) throw new Error('the auto-clear does not gate on source');
  if (lines.some(l => l === '  if(bp && bp.list.length>=2 && bp.cover>=BASE_COVER){'))
    throw new Error('the old cover-only gate is still there');
  /* A render still writes the colours down - twice now, from the button and
     from the open, plus the definition. */
  const writes = (code.match(/saveBaseColours\(/g) || []).length;
  if (writes !== 3) throw new Error('expected one definition and two calls, saw ' + writes);
});

console.log('index.html grew by ' + grew + ' bytes');
