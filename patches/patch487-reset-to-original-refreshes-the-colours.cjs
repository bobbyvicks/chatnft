/* RESET TO ORIGINAL LEFT COLOURS THE ARTWORK NO LONGER HAS.

   MEASURED. A 40x60 trait of two colours, one block painted in a third, then
   Reset to original:

     before the edit   #204080 #e0c040
     after the edit    #204080 #20c060 #e0c040
     after Reset       #204080 #20c060 #e0c040
     #20c060 pixels on the canvas afterwards   0

   The palette offers a colour that exists nowhere in the picture. Picking it
   paints with it, and Replace matches nothing - a control that answers a
   question about artwork that is gone.

   THE POPULATION, ENUMERATED RATHER THAN SAMPLED. Eight call sites put an
   ImageData back on the canvas:

     rotateQuarter    no rebuild, and says why: a permutation, so the set of
     rotateHalf       colours out is exactly the set in
     rotateFree       repalette()
     resizeTo         builds the palette inline
     applyResize      builds the palette inline
     undo             repalette()
     redo             repalette()
     reset            nothing at all

   Seven handle it; two of those deliberately do not and give their reason.
   Reset is the only one with no reason attached, and it sits on the line
   directly under undo and redo, which both call repalette.

   AT THE CALL SITE, NOT IN restoreImage. restoreImage is where selReset,
   drawBase and the brush ceiling live, and its own comment calls it the one
   place every size change passes through - but the palette deliberately is
   not there: putting it in would rebuild it on the two turn paths that state
   they do not need it, on a 1280x1280 canvas, for a list that cannot change.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const OLD = "$('reset').onclick=()=>{ if(!original) return; snapshot(); restoreImage(original); refreshStats(); resizeBoxes(); toast('Reset to original'); };";

/* THE NEIGHBOURS, asserted. If undo and redo ever stop rebuilding the palette
   this refuses, because then the thing being copied is not what it claims. */
const undoLine = kit.only(L, l => /\$\('undo'\)\.onclick=/.test(l), 'the undo handler');
const redoLine = kit.only(L, l => /\$\('redo'\)\.onclick=/.test(l), 'the redo handler');
for (const [n, what] of [[undoLine, 'undo'], [redoLine, 'redo']])
  if (L[n].indexOf('repalette();') < 0)
    throw new Error(what + ' does not rebuild the palette, so reset copying it proves nothing');

{
  const at = kit.only(L, l => l === OLD, 'the reset handler');
  kit.replace(L, { start: at, end: at }, [
    '/* AND THE COLOURS. Reset was the one route that put pixels back without',
    '   rebuilding the list - undo and redo directly above both do, and the two',
    '   turn paths that skip it say why. Measured: paint a third colour, press',
    '   Reset, and the swatch is still offered with zero pixels of it left on',
    '   the canvas. Picking it paints with a colour the artwork never had, and',
    '   Replace matches nothing. */',
    "$('reset').onclick=()=>{ if(!original) return; snapshot(); restoreImage(original); refreshStats(); resizeBoxes(); repalette(); toast('Reset to original'); };",
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  if (code.indexOf(OLD) >= 0) throw new Error('the reset handler is unchanged');
  const at = kit.only(codeLines, l => /\$\('reset'\)\.onclick=/.test(l), 'the reset handler');
  const line = codeLines[at];
  if (line.indexOf('repalette();') < 0)
    throw new Error('reset still does not rebuild the palette');
  /* BEFORE the toast, so a throw in the rebuild cannot report success first. */
  if (line.indexOf('repalette();') > line.indexOf("toast('Reset to original')"))
    throw new Error('the palette is rebuilt after the message that says it worked');
  /* The rest of the line is untouched: snapshot before restore is what makes
     Reset undoable, and resizeBoxes is what moves the handles. */
  for (const bit of ['if(!original) return;', 'snapshot();', 'restoreImage(original);',
    'refreshStats();', 'resizeBoxes();', "toast('Reset to original')"])
    if (line.indexOf(bit) < 0) throw new Error('reset lost: ' + bit);
});

fs.renameSync(TMP, FILE);
console.log('patch487 written, ' + grew + ' bytes');
