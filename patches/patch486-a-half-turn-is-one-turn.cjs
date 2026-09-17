/* A HALF TURN IS ONE TURN, AND A TURN THAT CHANGES NOTHING KEEPS YOUR ZOOM.

   TWO THINGS, MEASURED. A 40x60 trait in the editor:

     rotateFree(180)
       undo depth     0 -> 2
       one undo       60 by 40    <- the art at 90 degrees, on a canvas it
                                     never had, and not what it was before
       two undos      40 by 60
       said           "Turned a quarter right - now 60 by 40"
                      "Turned a quarter right - now 40 by 60"

   Pressing 180 ran rotateQuarter twice, and each of those takes its own
   snapshot and says its own sentence. So a half turn costs two undo steps,
   the first of which lands somewhere that never existed, and the message on
   screen says "a quarter right" for a half turn - twice, the first one
   replaced too fast to read.

   Written out here rather than composed from two quarters, because the
   composition IS what cost the undo step. Still exact: every pixel moves to
   the opposite corner, the canvas does not change, nothing is clipped and the
   set of colours out is the set in - the same reason rotateQuarter gives for
   not rebuilding the palette.

   AND THE ZOOM.

     zoom at fit    12
     zoomed in to   36     somebody working on a detail
     turned 37 degrees, canvas stays 40x60
     zoom now       12

   Both turn paths call fitZoom unconditionally. When the canvas changes size
   that is right - the old zoom was chosen for a different picture. When it
   does not change, there is nothing to refit and it throws away the zoom
   somebody set. It bites hardest on the ordinary case: this collection's
   traits are square, so a quarter turn does not change the size either, and
   every 90 degree turn on a 1280 trait dropped the view back to fit.

   NOT TOUCHED: whether a QUARTER turn should honour Keep size. It does not -
   a 40x60 comes back 60x40 with Keep size pressed, which the chip's own title
   says should not happen ("The canvas stays the size it is, so a turned trait
   still lines up on the character"). But turnkeeps.spec.js records the
   opposite decision with its reasoning - "the swap IS the turn, there is
   nothing to keep" - and it only bites on non-square art, which this
   collection does not have. That is a product call and it is not mine.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. a half turn, written out ------------------------------- */

const HALF = '  if(Math.abs(d-180)<0.05){ rotateQuarter(true); rotateQuarter(true); return true; }';
{
  const at = kit.only(L, l => l === HALF, 'the half-turn line');
  L[at] = '  if(Math.abs(d-180)<0.05){ rotateHalf(); return true; }';
}

/* Above rotateFree, beside the quarter it is a sibling of. */
{
  const at = kit.only(L, l => l === 'function rotateFree(deg){', 'rotateFree');
  kit.replace(L, { start: at, end: at }, [
    '/* A HALF TURN. Every pixel to the opposite corner, on the same canvas.',
    '',
    '   This was two rotateQuarter calls, and each of those takes its own',
    '   snapshot and says its own sentence. Measured on a 40x60: the undo depth',
    '   went from 0 to 2, one undo came back 60 by 40 - the art at 90 degrees on',
    '   a canvas it never had - and the message said "Turned a quarter right"',
    '   twice, the first too fast to read.',
    '',
    '   Written out rather than composed, because the composition is what cost',
    '   the undo step.',
    '',
    '   NO fitZoom AND NO repalette. The canvas does not change, so there is',
    '   nothing to refit; and this is a permutation, so the set of colours out',
    '   is exactly the set in - the same argument rotateQuarter already makes',
    '   for itself. */',
    'function rotateHalf(){',
    '  if(!ctx) return;',
    '  const W=art.width, H=art.height;',
    '  const src=ctx.getImageData(0,0,W,H).data;',
    '  const out=new Uint8ClampedArray(W*H*4);',
    '  for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
    '    const s=(y*W+x)*4, t=((H-1-y)*W+(W-1-x))*4;',
    '    out[t]=src[s]; out[t+1]=src[s+1]; out[t+2]=src[s+2]; out[t+3]=src[s+3];',
    '  }',
    '  snapshot();',
    '  restoreImage(new ImageData(out,W,H));',
    '  refreshStats(); resizeBoxes();',
    '  toast("Turned 180"+String.fromCharCode(176)+" - still "+W+" by "+H);',
    '}',
    'function rotateFree(deg){',
  ]);
}

/* ---- 2. the zoom survives a turn that changes no size ---------- */

/* DELETED, NOT GUARDED. My first version made these conditional on the size
   having changed - and the mutation that removed the call altogether killed
   nothing, which is what sent me to read restoreImage. It already refits,
   inside its own size-change branch, and its comment says why it lives there:
   that branch is the one place every route which changes the canvas size
   passes through, so nothing added later can forget. A guarded copy of a rule
   that already exists elsewhere is two rules that agree today. */
{
  const rq = kit.inFunction(L, 'function rotateQuarter(cw){');
  const at = kit.only(L, l => l === '  fitZoom();', 'fitZoom inside rotateQuarter', rq);
  kit.replace(L, { start: at, end: at }, [
    '  /* NO fitZoom. restoreImage refits when the canvas size changes and says',
    '     it is the one place every such route passes through; this was a second',
    '     copy of that rule which ALSO fired when the size had not changed. On a',
    '     square trait - which is what this collection is made of - a quarter',
    '     turn leaves the canvas alone, so every 90 degree turn on a 1280 trait',
    '     dropped the view back to fit and somebody working at 3x lost their',
    '     place. Measured on a 40x60 at 37 degrees: 12 to 36 to 12. */',
  ]);
}

{
  const rf = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l === '  refreshStats(); fitZoom(); resizeBoxes();',
    'the tail of rotateFree', rf);
  kit.replace(L, { start: at, end: at }, [
    '  /* NO fitZoom - see rotateQuarter. With Keep size on a turn at any angle',
    '     comes back on the canvas it started on, so this refitted a view that',
    '     had not moved; and when the canvas HAS changed, restoreImage has',
    '     already done it. */',
    '  refreshStats(); resizeBoxes();',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };
  need('function rotateHalf(){');
  need('  if(Math.abs(d-180)<0.05){ rotateHalf(); return true; }');
  gone('rotateQuarter(true); rotateQuarter(true);');
  need('  refreshStats(); resizeBoxes();');

  /* ONE SNAPSHOT IN THE HALF TURN. The count IS the defect, so it is the
     check rather than a reading of it. */
  const start = codeLines.findIndex(l => l === 'function rotateHalf(){');
  const end = codeLines.indexOf('}', start);
  const body = codeLines.slice(start, end + 1);
  const snaps = body.filter(l => /snapshot\(\)/.test(l)).length;
  if (snaps !== 1) throw new Error('rotateHalf takes ' + snaps + ' snapshots, expected 1');
  if (body.some(l => /fitZoom\(\)/.test(l)))
    throw new Error('rotateHalf refits a canvas that did not change');
  if (body.some(l => /repalette\(\)/.test(l)))
    throw new Error('rotateHalf rebuilds a palette a permutation cannot change');
  /* And it really does turn the whole thing: the loop has to cover both axes
     and land on the opposite corner. */
  need('    const s=(y*W+x)*4, t=((H-1-y)*W+(W-1-x))*4;');

  /* NO fitZoom AT ALL on any turn path. restoreImage owns that rule and
     applies it only when the size really changed; a copy here is what
     refitted a view that had not moved. */
  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    const b = codeLines.indexOf('}', a);
    return codeLines.slice(a, b + 1);
  };
  for (const fn of ['function rotateQuarter(cw){', 'function rotateHalf(){',
    'function rotateFree(deg){']) {
    for (const line of bodyOf(fn))
      if (/fitZoom\(\)/.test(line)) throw new Error(fn + ' still refits: ' + line.trim());
  }
  /* AND restoreImage STILL DOES, or removing it from the turns leaves a grown
     canvas at a zoom chosen for a smaller one and nothing to catch it. */
  if (!bodyOf('function restoreImage(im){').some(l => /fitZoom\(\)/.test(l)))
    throw new Error('restoreImage no longer refits, so taking it off the turns is wrong');
});

fs.renameSync(TMP, FILE);
console.log('patch486 written, ' + grew + ' bytes');
