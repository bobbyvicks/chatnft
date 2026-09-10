/* THE PIXEL SIZE BOX LOOKED LIVE WHILE THE SNAP DECIDED THE ANSWER.

   "no matter what i put into the pixel sizing"

   Measured, driving the page the way a person does - load a real skin, read
   the controls:

     after load   snap true   forceDisabled FALSE   force "0"

   The box is enabled with the snap on. fixModeUI is what disables it, and it
   only runs at load and when a control changes; at load there is no image, so
   the snapped step is 0, so it decides the box is live and leaves it that
   way. Loading an image never asks it again. So the box invites a number,
   accepts it, and nothing reads it.

   That is the same defect the scale mode already had a comment about - "a
   live field that changes nothing is a control that lies" - and the guard
   written for it did not cover the case where the state changes because a
   PICTURE arrived rather than because a control moved.

   AND A DETECTED SIZE CAN STILL LAND OFF THE GRID. patch412 moves a TYPED
   size onto a count that divides the canvas; a count the detectors choose can
   miss just as easily. Measured on three real skins with the snap off and
   nothing typed: pixel size 1, which is no pixel at all. That is not moved
   here, because moving it means detecting and then detecting again, and this
   is not the moment for that - but it IS said, in the same words the moved
   size uses, so the run cannot look like it worked. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the box tells the truth once a picture is in ------------------ */
{
  const r = kit.inFunction(L, 'async function fixLoad(file){');
  const at = kit.only(L, l => l === '  fixSizeHint();', 'where a load refreshes the readout', r);
  kit.replace(L, { start: at, end: at }, [
    '  /* THE CONTROLS TOO, not only the readout. Whether the pixel size box',
    '     decides anything depends on the PICTURE - the snap needs four real',
    '     pixels a cell before it applies - and fixModeUI was only ever called',
    '     when a control moved. So a fresh page decided the box was live, an',
    '     image arrived, and nobody asked again: the box invited a number and',
    '     nothing read it. See patch413. */',
    '  fixModeUI();',
    '  fixSizeHint();',
  ]);
}

/* ---- a detected size that cannot land is said ---------------------- */
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l.indexOf('  const movedNote = fixMoved') === 0,
    'the moved note', r);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* AND A DETECTED COUNT THAT DOES NOT DIVIDE THE CANVAS. Nothing typed,',
    '     no snap: the detectors answer whatever the picture says, and if that',
    '     count does not divide CANVAS_SIDE the blocks come out ragged. Counted',
    '     off the results rather than predicted, because only the engine knows',
    '     what it chose. */',
    '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    '  const ragged = gridOn ? fixBatchFiles.filter(f=>f.cells&&CANVAS_SIDE%f.cells!==0).length : 0;',
    '  const raggedNote = ragged',
    '    ? " \\u00b7 "+ragged+" came back on a pixel count that does not divide "',
    '      +CANVAS_SIDE+", so their pixels are uneven - turn Snap on, or type a size"',
    '    : "";',
  ]);
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const say = kit.only(L, l => l === '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote',
    'what a batch says', r2);
  kit.replace(L, { start: say, end: say }, [
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+raggedNote',
  ]);
  /* The count has to be kept, or there is nothing to check it against. */
  const r3 = kit.inFunction(L, 'async function fixBatch(files){');
  const push = kit.only(L, l => l === '      rel:rel,', 'where a result is kept', r3);
  kit.replace(L, { start: push, end: push }, [
    '      rel:rel,',
    '      /* The count the engine landed on, kept so the run can say whether it',
    '         divides the canvas. w and h are the SAVED size and cannot answer',
    '         that: 1280 is 1280 whether its pixels are eight across or one. */',
    '      cells:out.width,',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE BOX IS ASKED AGAIN WHEN A PICTURE ARRIVES. */
  const ld = kit.inFunction(codeLines, 'async function fixLoad(file){');
  const lb = codeLines.slice(ld.start, ld.end + 1).join('\n');
  if (!/fixModeUI\(\);\n\s*fixSizeHint\(\);/.test(lb))
    throw new Error('loading a picture does not refresh the controls');

  /* THE RAGGED COUNT IS COUNTED OFF THE RESULTS, not guessed from the input. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/cells:out\.width,/.test(bb))
    throw new Error('the batch does not keep the count the engine chose');
  if (!/CANVAS_SIDE%f\.cells!==0/.test(bb))
    throw new Error('nothing checks whether the count divides the canvas');
  if (!/const gridOn=\$\("fixgrid"\)&&\$\("fixgrid"\)\.checked;/.test(bb))
    throw new Error('the ragged check ignores whether the save goes to the canvas');
  if (!/\+movedNote\+raggedNote/.test(bb))
    throw new Error('the batch does not say it');
  /* w and h cannot stand in for the count - that was the whole confusion. */
  if (/CANVAS_SIDE%f\.w!==0/.test(bb))
    throw new Error('the check reads the saved size, which cannot answer this');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
