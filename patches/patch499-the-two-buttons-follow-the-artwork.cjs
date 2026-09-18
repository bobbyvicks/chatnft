/* THE TWO BUTTONS THAT DESCRIBE THE ARTWORK STOPPED DESCRIBING IT.

   "Clean up colours (1,284 -> 62)" and "Hide the base colour (#e8e8e8 +
   #d0d0d0, 94%)" are both computed from the canvas - cleanPlan and basePlan
   each walk it. Every route that replaces the pixels leaves them describing
   the artwork that was there before.

   THE POPULATION, ENUMERATED. Eight routes put a new image on the canvas:

     rotateQuarter   rotateHalf   rotateFree
     resizeTo        applyResize
     undo            redo         reset

   NONE of them refreshes either label. The review that started this only
   noticed Reset, which is the one place somebody had thought to look; fixing
   Reset alone would have been the same single-point remedy I made two days ago
   when I gave Reset a palette rebuild that undo and redo already had.

   WHAT IT LOOKS LIKE. Hide the base is disabled when the base is not there,
   and enabled with the pair and a percentage when it is - so a Reset that
   brings the base back leaves a disabled button on artwork that now has one,
   and a resize that removes it leaves an enabled button offering to take out
   colours the picture no longer holds. Clean up colours shows a pair of
   numbers about a picture that has been replaced.

   DEFERRED, AND THAT IS THE WHOLE DESIGN DECISION. Measured on a 1280 trait of
   twelve colours, which is what this collection is made of:

     one undo, today          57ms
     cleanLabel               85ms
     baseLabel                34ms

   Doing them inside undo makes the most-pressed control in the editor three
   times slower for a pair of button captions. So this schedules them for the
   next frame and coalesces: however many times the canvas just changed, the
   labels are computed once, at the end. Holding undo down runs one pass rather
   than one per step - cheaper, and the only answer that is right anyway, since
   what the buttons should say is a fact about where you STOPPED.

   There is precedent for deferring in this file: startEditor already refits
   the zoom inside a double requestAnimationFrame, for the same reason - the
   answer is not wanted until the frame after the change.

   IN restoreImage, WHICH IS THE ONE PLACE ALL EIGHT PASS THROUGH. Its own
   comment already makes that argument for selReset, drawBase, reclampBrush,
   the size ladder and the refit: "this branch is the one place every route
   that changes the canvas size passes through, so nothing added later can
   forget". This goes in the body rather than that branch, because undo, redo
   and reset usually do not change the size and they are the routes that
   started this.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE POPULATION, ASSERTED. Eight callers, and if that ever changes the
   argument for putting this in restoreImage should be re-read rather than
   assumed. */
{
  const calls = L.filter(l => /restoreImage\(/.test(l) && !/^function restoreImage/.test(l));
  if (calls.length !== 8)
    throw new Error('restoreImage has ' + calls.length + ' callers, expected 8:\n  '
      + calls.map(l => l.trim().slice(0, 60)).join('\n  '));
}

/* And both labels exist to be called. */
kit.only(L, l => l === 'function cleanLabel(){', 'cleanLabel');
kit.only(L, l => l === 'function baseLabel(){', 'baseLabel');

/* ---- the deferred, coalesced refresh ---------------------------- */

{
  const at = kit.only(L, l => l === 'function restoreImage(im){', 'restoreImage');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT THE TWO BUTTONS SAY, AFTER THE ARTWORK UNDER THEM CHANGED.',
    '',
    '   Clean up colours and Hide the base colour both describe the canvas, and',
    '   both are computed by walking it. Measured on a 1280 trait of twelve',
    '   colours: cleanLabel 85ms and baseLabel 34ms, against one undo costing',
    '   57ms in total. Calling them inside undo would make the most-pressed',
    '   control in the editor three times slower for two button captions.',
    '',
    '   So: next frame, once. Coalesced, so holding undo down computes them at',
    '   the end rather than per step - which is cheaper and is also the only',
    '   right answer, since what a button should say is a fact about where you',
    '   stopped rather than about each place you passed through.',
    '',
    '   Neither can throw usefully here - they are captions - so neither is',
    '   allowed to take the other down with it. */',
    'let labelsPending=0;',
    'function labelsSoon(){',
    '  if(labelsPending) return;',
    '  labelsPending=requestAnimationFrame(()=>{',
    '    labelsPending=0;',
    '    if(!ctx) return;',
    '    try{ cleanLabel(); }catch(_){ }',
    '    try{ baseLabel(); }catch(_){ }',
    '  });',
    '}',
    'function restoreImage(im){',
  ]);
}

{
  const ri = kit.inFunction(L, 'function restoreImage(im){');
  const at = kit.only(L, l => l === '  ctx.putImageData(im,0,0);', 'the paint', ri);
  if (L[at + 1] !== '  applyZoom();')
    throw new Error('restoreImage does not end the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  ctx.putImageData(im,0,0);',
    '  applyZoom();',
    '  /* AFTER the pixels are down, because both labels read the canvas. Every',
    '     one of the eight routes that replaces an image comes through here, so',
    '     none of them has to remember - the same argument the size branch above',
    '     makes for selReset, drawBase and the size ladder. */',
    '  labelsSoon();',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('function labelsSoon(){');
  need('  labelsSoon();');

  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  };

  /* DEFERRED, not called straight. The whole cost argument rests on it. */
  const ls = bodyOf('function labelsSoon(){');
  if (!ls.some(l => /requestAnimationFrame/.test(l)))
    throw new Error('labelsSoon is not deferred');
  if (!ls.some(l => /if\(labelsPending\) return;/.test(l)))
    throw new Error('labelsSoon does not coalesce, so holding undo down runs it per step');

  /* AND IT IS THE ONLY PLACE restoreImage TOUCHES THEM - a synchronous call
     anywhere in that function is the thing the measurement rules out. */
  const ri = bodyOf('function restoreImage(im){');
  for (const l of ri)
    if (/cleanLabel\(\)|baseLabel\(\)/.test(l))
      throw new Error('restoreImage computes a label synchronously: ' + l.trim());
  const paint = ri.findIndex(l => /ctx\.putImageData\(im,0,0\)/.test(l));
  const soon = ri.findIndex(l => /labelsSoon\(\)/.test(l));
  if (!(paint >= 0 && soon >= 0 && paint < soon))
    throw new Error('the labels are refreshed before the pixels are down');

  /* The routes that ALREADY call the labels directly keep doing so - they are
     the ones where the answer is wanted in the same breath as the message. */
  need('      refreshStats(); repalette(); cleanLabel(); baseLabel();');
});

fs.renameSync(TMP, FILE);
console.log('patch499 written, ' + grew + ' bytes');
