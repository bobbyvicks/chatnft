/* TWO THINGS PATCH486 BROKE, FOUND BY A REVIEW I DID NOT DO MYSELF.

   ONE: A SIZE-CHANGING TURN NOW FITS NOTHING.

   patch486 deleted the fitZoom() calls from both turn paths, on the grounds
   that restoreImage already refits inside its size-change branch. It does -
   but it does it TEN LINES BEFORE ctx.putImageData, and fitZoom fits the
   CONTENT, not the canvas ("Fit the ART, not the canvas", its own header).
   contentBox() over a canvas that has just been resized and not yet painted
   returns null, so the refit falls back to the whole canvas.

   Measured, 80x80 with the art in a 12x12 corner:

     before                 zoom 48
     grow-turn 37 degrees   canvas 113x113, zoom 6
     refit with the pixels actually there    45

   and on a quarter turn of an 80x40, which is the common one:

     before        zoom 48
     after         canvas 40x80, zoom 9
     refit         48

   So 486 traded "the zoom survives a turn that changes nothing" for "the zoom
   collapses on a turn that changes something". The calls go back, still
   conditional on the size having moved - which was my first version, and I
   deleted it for a bad reason.

   THE BAD REASON, WRITTEN DOWN. The mutation that removed the call entirely
   killed no test, and I read that as "the call is redundant". It meant "my
   test cannot tell the difference": the control asserted only that the zoom
   CHANGED, which a collapse to 9 satisfies as well as a correct 48. A
   surviving mutation is a fact about the tests before it is a fact about the
   code. The test asserts the VALUE now - it compares against what fitZoom
   answers with the pixels present.

   NOT restoreImage. Moving its fitZoom below putImageData would fix this for
   every caller at once, and it is tempting. It is also a recorded decision
   with a measurement attached - the comment there is about undoing a 160-to-40
   shrink and says "measured, fitZoom at that moment gives 5" - so that call
   has always run on the blank canvas and undo, redo, reset and both resize
   paths have always got fit-the-canvas from it. Changing that changes five
   behaviours to fix one, and it is a separate question with its own measuring
   to do. This puts back what 486 took and leaves that decision where it is.

   TWO: A HALF TURN LEAVES THE SELECTION BEHIND.

   Measured, a 20x20 selection of 400 cells on a 40x60 trait:

     half turn      400 cells still selected, and the artwork moved under them
     quarter turn   selection cleared (the canvas size changes, so
                    restoreImage's selReset fires)

   Before 486 a half turn WAS two quarter turns, so each one changed the canvas
   size and the mask was cleared on the way past. Writing it out as one
   same-size turn kept the mask pointing at pixels that are now in the opposite
   corner - so Delete inside the selection, or a fill, hits artwork nobody
   chose. That is my regression and this carries the mask through the same
   permutation the pixels take, which is better than clearing it: the selection
   follows the thing it was drawn around.

   STILL BROKEN, MEASURED, NOT FIXED HERE: rotateFree at a free angle with Keep
   size on has the same stale mask - 400 cells survived a 37 degree turn - and
   always has, because that path never changed the canvas size either. It needs
   the mask resampled through the same nearest-neighbour map AND the recanvas
   step, which is a different piece of work with its own measuring. It is not
   mine, it is not made worse by this, and it is next rather than smuggled in
   here.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE PREMISE, ASSERTED BEFORE ANYTHING IS WRITTEN. This whole patch rests on
   restoreImage refitting BEFORE it paints. If that is ever reordered, putting
   these calls back becomes wrong again and this must refuse rather than
   quietly double up. */
{
  const ri = kit.inFunction(L, 'function restoreImage(im){');
  const fit = kit.only(L, l => l === '    fitZoom();', 'restoreImage fitZoom', ri);
  const put = kit.only(L, l => l === '  ctx.putImageData(im,0,0);', 'restoreImage putImageData', ri);
  if (!(fit < put))
    throw new Error('restoreImage now paints before it refits, so the turn paths do not need these back');
}

/* ---- 1. the refit comes back, conditional ----------------------- */

{
  const rq = kit.inFunction(L, 'function rotateQuarter(cw){');
  const at = kit.only(L, l => l === '  resizeBoxes();', 'resizeBoxes inside rotateQuarter', rq);
  kit.replace(L, { start: at, end: at }, [
    '  /* ONLY WHEN THE SIZE MOVED, and this is the half patch486 got wrong.',
    '     restoreImage does refit on a size change - but ten lines before',
    '     putImageData, and fitZoom fits the CONTENT, so on a canvas that has',
    '     been resized and not yet painted contentBox returns null and it falls',
    '     back to the whole canvas. Measured on an 80x40 with the art in a',
    '     corner: zoom 48 before, 9 after the turn, 48 when refitted with the',
    '     pixels there. Here, after restoreImage has returned, the pixels are',
    '     on the canvas and this is the answer that fits the artwork.',
    '',
    '     Conditional, because the thing 486 was FOR is still right: a quarter',
    '     turn of a square trait - which is what this collection is made of -',
    '     changes no size, and refitting then throws away the zoom somebody set.',
    '     Measured: 12 to 36 to 12 on a turn that moved nothing. */',
    '  if(nw!==W||nh!==H) fitZoom();',
    '  resizeBoxes();',
  ]);
}

{
  const rf = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l === '  refreshStats(); resizeBoxes();',
    'the tail of rotateFree', rf);
  kit.replace(L, { start: at, end: at }, [
    '  /* ONLY WHEN THE SIZE MOVED - see rotateQuarter for why this is here and',
    '     not left to restoreImage. With Keep size on, ow and oh are W and H and',
    '     nothing is refitted, which is what keeps a zoom somebody set. With',
    '     Grow the canvas really changes and this fits the art on it. */',
    '  refreshStats(); if(ow!==W||oh!==H) fitZoom(); resizeBoxes();',
  ]);
}

/* ---- 2. the selection follows a half turn ----------------------- */

{
  const rh = kit.inFunction(L, 'function rotateHalf(){');
  const at = kit.only(L, l => l === '  refreshStats(); resizeBoxes();',
    'the tail of rotateHalf', rh);
  kit.replace(L, { start: at, end: at }, [
    '  /* AND THE SELECTION COMES WITH IT. The canvas does not change size, so',
    '     restoreImage does not reach selReset - and before this was written out',
    '     as one turn it WAS two quarter turns, each of which changed the size',
    '     and cleared the mask on the way past. Measured after that change: a',
    '     400 cell selection survived a half turn intact while the artwork moved',
    '     to the opposite corner, so Delete or a fill inside it hit pixels',
    '     nobody chose.',
    '',
    '     Carried rather than cleared, through the same permutation the pixels',
    '     took: a selection is drawn around something, and the something moved.',
    '     After restoreImage, because selSet refuses a mask that is not the size',
    '     of the canvas and the canvas is only settled once that has run. */',
    '  if(selMask){',
    '    const sm=new Uint8Array(W*H);',
    '    for(let y=0;y<H;y++) for(let x=0;x<W;x++) sm[(H-1-y)*W+(W-1-x)]=selMask[y*W+x];',
    '    selSet(sm);',
    '  }',
    '  refreshStats(); resizeBoxes();',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('  if(nw!==W||nh!==H) fitZoom();');
  need('  refreshStats(); if(ow!==W||oh!==H) fitZoom(); resizeBoxes();');
  need('    for(let y=0;y<H;y++) for(let x=0;x<W;x++) sm[(H-1-y)*W+(W-1-x)]=selMask[y*W+x];');

  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  };

  /* EVERY refit ON A TURN PATH IS GUARDED. An unconditional one is what threw
     away the zoom; no refit at all is what collapsed it. */
  for (const fn of ['function rotateQuarter(cw){', 'function rotateFree(deg){']) {
    const fits = bodyOf(fn).filter(l => /fitZoom\(\)/.test(l));
    if (fits.length !== 1) throw new Error(fn + ' has ' + fits.length + ' refits, expected 1');
    if (!/if\(\w+!==\w+\|\|\w+!==\w+\) fitZoom\(\)/.test(fits[0]))
      throw new Error(fn + ' refits without checking the size moved: ' + fits[0].trim());
  }
  /* A half turn never changes the size, so it must have none at all. */
  if (bodyOf('function rotateHalf(){').some(l => /fitZoom\(\)/.test(l)))
    throw new Error('rotateHalf refits a canvas that cannot have changed size');

  /* The mask is carried after the pixels are put back, not before - selSet
     measures against the live canvas. */
  const rh = bodyOf('function rotateHalf(){');
  const restore = rh.findIndex(l => /restoreImage\(/.test(l));
  const mask = rh.findIndex(l => /selSet\(sm\)/.test(l));
  if (restore < 0 || mask < 0 || !(restore < mask))
    throw new Error('the mask is carried before the canvas is settled');
});

fs.renameSync(TMP, FILE);
console.log('patch488 written, ' + grew + ' bytes');
