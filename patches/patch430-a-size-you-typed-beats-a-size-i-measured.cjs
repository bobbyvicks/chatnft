/* ASKING FOR 4 PIXELS GOT 5, EVERY TIME.

   "were trying to make glasses 4 pixels and we have it set to that but its
   rendering to 5 pixels no matter what"

   Reproduced on all sixteen glasses, asking each of them for 4:

     Snap on    Dark Lens Sunglasses  -> 5   (it measures 5)
                Wake Me Up Sleep Mask -> 5   (it measures 5)
                the other fourteen    -> 10 or 8, never 4
     Snap off   all sixteen           -> 4

   patch416 made the measured block beat the declared grid, which was right:
   projectGrid said 160 and the art is drawn at 128 cells, and forcing the
   setting was deleting up to 23% of a trait. But it beat EVERYTHING in that
   branch, including a number somebody had typed into the box - and the box is
   greyed out while the snap is on, so there was no way to say 4 at all
   without also turning off the snap you wanted.

   That is the wrong end of the rule. A measurement should beat a SETTING; it
   should not beat an INSTRUCTION. So the box decides whenever it holds a
   number, snap or no snap, and the snap decides when it holds 0 - which is
   what 0 has always meant on it: work it out.

   The box is live again while the snap is on, because it now changes the
   answer. It was disabled for the honest reason that "a live box that changes
   no answer is a control that lies"; the fix for that is to make it decide
   something, not to keep it switched off.

   Nothing else moves. With 0 in the box the snapped answer is exactly what it
   was: the picture's own measured block, the gridless search when there is
   none, the declared grid last. A typed size still goes through fixWholeStep
   while the result is going onto the collection canvas, so asking for a size
   that cannot give square pixels still lands on one that can, and still says
   it moved. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the box decides when it holds a number ------------------------ */
{
  const r = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const at = kit.only(L, l => l === '  if(fixSnapping()){', 'where the snap decides', r);
  kit.replace(L, { start: at, end: at }, [
    '  /* A NUMBER IN THE BOX IS AN INSTRUCTION, AND IT WINS.',
    '',
    '     This used to sit below the snap, so while the snap was on the',
    '     measured block answered and the box was ignored - asking sixteen',
    '     glasses for 4 gave 5, 8 and 10 and never 4. The measurement is there',
    '     to beat the declared grid, which is a setting nobody chose for this',
    '     picture; it has no business beating a size somebody typed for it.',
    '',
    '     0 still means work it out, which is what the box has always said. */',
    '  const asked=+$("fixforce").value||0;',
    '  const onGrid=$("fixgrid")&&$("fixgrid").checked;',
    '  if(asked>0){',
    '    /* Moved to a size that can give square pixels, if it cannot - the',
    '       same rule and the same note as the unsnapped path below. */',
    '    if(onGrid){',
    '      const fix=fixWholeStep(w,asked);',
    '      if(fix){ fixMoved={from:asked, to:fix.step, cols:fix.cols, was:fix.was};',
    '        return fix.step; }',
    '    }',
    '    return asked;',
    '  }',
    '  if(fixSnapping()){',
  ]);
}

/* ---- and it is live again, because it decides something ------------ */
{
  const r = kit.inFunction(L, 'function fixModeUI(){');
  const at = kit.only(L, l => l === '  const snap=fixSnapping()&&fixSnapStep(FIX.src?FIX.src.width:0)>0;',
    'the snapped-out flag', r);
  kit.replace(L, { start: at - 3, end: at }, [
    '  /* WAS ALSO GREYED OUT WHILE THE SNAP WAS ON, for the honest reason that',
    '     a live box changing no answer is a control that lies. It changes the',
    '     answer now - a typed size beats the measurement - so the fix for that',
    '     sentence is to let it decide, not to keep it switched off. Scale only',
    '     still turns it off, because there the picture really is already one',
    '     pixel per cell and there is nothing for a size to do. */',
  ]);
  const fld = kit.only(L, l => l === '  const f=$("fixforce"); if(f){ f.disabled=scale||snap; f.title=scale',
    'the field state', kit.inFunction(L, 'function fixModeUI(){'));
  if (L[fld + 1] !== '    ? "Not used in scale only - the picture is already one pixel per cell."'
    || L[fld + 2] !== '    : snap'
    || L[fld + 3] !== '    ? "Not used while Snap is on - the pixel size comes from the "+g.cells+" cell grid."'
    || L[fld + 4] !== '    : f.title; }')
    throw new Error('the field title is not shaped the way this expects');
  kit.replace(L, { start: fld, end: fld + 4 }, [
    '  const f=$("fixforce"); if(f){ f.disabled=scale; f.title=scale',
    '    ? "Not used in scale only - the picture is already one pixel per cell."',
    '    : "How many pixels of the picture make one pixel of the artwork."',
    '      +" A number here decides, even with Snap on. 0 works it out:"',
    '      +" the grid the picture is actually drawn on, or the "+g.cells',
    '      +" cell grid when it is not drawn on one."; }',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  const body = codeLines.slice(sf.start, sf.end + 1).join('\n');
  /* THE BOX IS READ BEFORE THE SNAP, which is the whole change. */
  if (body.indexOf('const asked=+$("fixforce").value||0;') < 0)
    throw new Error('the typed size is not read at all');
  if (body.indexOf('const asked=') > body.indexOf('if(fixSnapping()){'))
    throw new Error('the snap still answers before the box does');
  /* AND ONLY WHEN IT HOLDS A NUMBER. 0 has always meant work it out, and a
     box that decided at 0 would force a 0px step on everything. */
  if (!/if\(asked>0\)\{/.test(body))
    throw new Error('an empty box would decide');
  /* THE MEASUREMENT IS UNTOUCHED for the 0 case - that is the part that
     stopped 202 traits losing pixels and it is not what was wrong. */
  if (!/if\(nat>1&&w>0&&CANVAS_SIDE%\(w\/nat\)===0\)\{ fixMeasuredBlock=nat; return nat; \}/.test(body))
    throw new Error('the measured block stopped answering when nothing is typed');
  if (!/const cells=px\?fixGridlessCells\(px,w,ph\|\|w\):0;/.test(body))
    throw new Error('the gridless search stopped running');
  /* A typed size still lands somewhere square. */
  if (!/const fix=fixWholeStep\(w,asked\);/.test(body))
    throw new Error('a typed size that cannot give square pixels is used anyway');

  /* AND THE BOX IS LIVE AGAIN, except in scale only. */
  const mu = kit.inFunction(codeLines, 'function fixModeUI(){');
  const mb = codeLines.slice(mu.start, mu.end + 1).join('\n');
  if (!/f\.disabled=scale;/.test(mb))
    throw new Error('the box is still switched off while it decides the answer');
  if (/f\.disabled=scale\|\|snap;/.test(mb))
    throw new Error('the snap still greys out the control that now decides');
  /* And it no longer claims the snap decides instead. */
  if (/Not used while Snap is on/.test(text))
    throw new Error('the box still says it is not used while the snap is on');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
