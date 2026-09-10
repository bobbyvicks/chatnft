/* THE SNAP WAS ON, SAID SO, AND DID NOTHING.

   "its the snap button" / "make it work all the time its buggy"

   Measured, snap ticked, across source widths - "applied" is whether the snap
   actually decided the answer:

     source   applied   cells you get
       128      NO           16
       160      NO           20
       256      NO           32
       320      NO           40
       512      NO           64
       640      yes         160
       768      yes         160
      1024      yes         160
      1254      yes         160
      1280      yes         160

   Under 640 the switch is ticked, the label reads "Snap to the 160 cell
   grid", and the detectors decide instead. Silently: no message, nothing in
   the readout, the box still ticked. That is the bug, and the floor that
   causes it is mine.

   SNAP_MIN_STEP=4 was the wrong rule. It was written as "four real pixels a
   cell before snapping means anything", and the reasoning quoted a 48-pixel
   image where 160 cells is a step of 0.3. That case is real; the rule drawn
   from it was too wide, and it caught 160, 320 and 512 - which are the sizes
   that snap PERFECTLY. A 160px source at 160 cells is a step of exactly 1,
   which is the identity, and 320 is exactly 2.

   THE REAL LIMIT IS UPSAMPLING. A source narrower than the grid cannot be
   snapped to it without inventing cells that were never drawn - 128 pixels
   cannot answer 160 cells. Everything from the grid width upwards is a
   reduction, which is what this tool does. So the test is w >= cells, and
   nothing else.

   AND WHEN IT CANNOT, IT SAYS SO. Falling through to the detectors while the
   box says otherwise is worse than refusing: a run that ignored the setting
   looked exactly like a run that honoured it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the floor that was wrong -------------------------------------- */
{
  const at = kit.only(L, l => l === '/* HOW MUCH SOURCE ONE CELL NEEDS BEFORE SNAPPING MEANS ANYTHING.',
    'the floor note');
  let end = -1;
  for (let i = at; i < at + 24; i++) if (L[i] === 'const SNAP_MIN_STEP=4;') { end = i; break; }
  if (end < 0) throw new Error('the floor is not where its note says it is');
  kit.replace(L, { start: at, end: end }, [
    '/* WHEN CAN A PICTURE BE SNAPPED TO THE GRID AT ALL?',
    '',
    '   SUPERSEDES "four real pixels a cell", which refused 160, 320 and 512 -',
    '   and 160 at 160 cells is a step of exactly 1, the identity, which is as',
    '   snapped as anything can be. Measured with that floor in place: a 160px',
    '   source came back at 20 cells, not 160, with the switch ticked and',
    '   nothing said. The rule was drawn from a real case - 160 cells out of a',
    '   48-pixel image is a step of 0.3 - and drawn far too wide.',
    '',
    '   The limit is UPSAMPLING. A source narrower than the grid cannot answer',
    '   it without inventing cells nobody drew. From the grid width up it is a',
    '   reduction, which is the whole job. So: w >= cells, and nothing else. */',
  ]);
  const step = kit.only(L, l => l === '  const s=w/g.cells;', 'the snapped step');
  if (L[step + 1] !== '  return s>=SNAP_MIN_STEP ? s : 0;')
    throw new Error('the floor is not applied where this expects');
  kit.replace(L, { start: step, end: step + 1 }, [
    '  /* Narrower than the grid would mean inventing detail; from the grid',
    '     width up it is a reduction, which is what this tool does. */',
    '  if(w<g.cells) return 0;',
    '  return w/g.cells;',
  ]);
}

/* ---- and a snap that cannot apply says so -------------------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  if(FIX.src&&wantSnap&&!g.exact){', 'the impossible grid warning', r);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* ASKED FOR AND NOT POSSIBLE ON THIS PICTURE. Falling through to the',
    '     detectors while the box says "Snap to the 160 cell grid" is worse',
    '     than refusing - a run that ignored the setting looked exactly like a',
    '     run that honoured it.',
    '',
    '     A NOTE, NOT A REPLACEMENT. A first version returned here and wrote',
    '     only this sentence, which hid the one thing the readout is for: what',
    '     the size actually in force is about to give. The snap not applying',
    '     does not stop a typed size working - it IS what works then. */',
    '  const snapBlocked = !!(FIX.src&&wantSnap&&g.exact&&FIX.src.width<g.cells);',
    '  const snapNote = snapBlocked',
    '    ? " \\u00b7 "+FIX.src.width+" across cannot be snapped to "+g.cells',
    '      +" cells without inventing detail, so the pixel size is used instead"',
    '    : "";',
    '  /* WITH NOTHING TYPED THERE IS NO SIZE TO DESCRIBE, and the line below',
    '     would return an empty readout - which is the silence this whole patch',
    '     is about. So the note stands on its own there.',
    '',
    '     The field is read here rather than through `step`, which is declared',
    '     further down: reaching it from above is a ReferenceError that takes',
    '     the whole readout with it, and took thirteen tests with it once. */',
    '  if(snapBlocked&&!scale&&(+$("fixforce").value||0)<=0){',
    '    el.textContent="\\u2192 "+FIX.src.width+" across cannot be snapped to "+g.cells',
    '      +" cells without inventing detail - the pixel size is being worked out instead";',
    '    return;',
    '  }',
  ]);
}
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l.indexOf('  const gridOn=$("fixgrid")&&$("fixgrid").checked;') === 0,
    'where the batch reports', r);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* AND THE SAME IN A BATCH, counted off what actually happened. A folder',
    '     of already-fixed traits is the ordinary way to hit this. */',
    '  const wantedSnap=fixSnapping();',
    '  const tooSmall=wantedSnap',
    '    ? list.filter(f=>f&&f.__w&&f.__w<fixGridCells().cells).length : 0;',
    '  const smallNote = tooSmall',
    '    ? " \\u00b7 "+tooSmall+" narrower than the "+fixGridCells().cells',
    '      +" cell grid, so the snap could not be used on them"',
    '    : "";',
  ]);
  /* The width has to be remembered as each file is read, or there is nothing
     to count. */
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const wh = kit.only(L, l => l === '    const W=bm.width, H=bm.height;', 'where a file is measured', r2);
  kit.replace(L, { start: wh, end: wh }, [
    '    const W=bm.width, H=bm.height;',
    '    /* Kept on the input so the report can count what the snap could not',
    '       be used on - by then the bitmap is closed and W is out of scope. */',
    '    try{ file.__w=W; }catch(_){ }',
  ]);
  const r3 = kit.inFunction(L, 'async function fixBatch(files){');
  const say = kit.only(L, l => l === '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+raggedNote',
    'what a batch says', r3);
  kit.replace(L, { start: say, end: say }, [
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+raggedNote+smallNote',
  ]);
}

/* ---- and the note is appended, not substituted --------------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note',
    'where the readout is written', r);
  kit.replace(L, { start: at, end: at }, [
    '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note+snapNote',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE FLOOR IS GONE and the real limit is in its place. */
  if (/SNAP_MIN_STEP/.test(code))
    throw new Error('the four-pixel floor is still there');
  const ss = kit.inFunction(codeLines, 'function fixSnapStep(w){');
  const sb = codeLines.slice(ss.start, ss.end + 1).join('\n');
  if (!/if\(w<g\.cells\) return 0;/.test(sb))
    throw new Error('the snap will upsample a picture narrower than the grid');
  if (!/return w\/g\.cells;/.test(sb))
    throw new Error('the snapped step is no longer the width over the cell count');
  /* A grid that cannot divide the canvas is still refused. */
  if (!/if\(!g\.exact\) return 0;/.test(sb))
    throw new Error('a grid that cannot divide the canvas now snaps');

  /* AND A SNAP THAT CANNOT APPLY IS SAID, in both places. */
  const hint = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb = codeLines.slice(hint.start, hint.end + 1).join('\n');
  if (!/FIX\.src\.width<g\.cells/.test(hb))
    throw new Error('the readout does not say when the snap cannot be used');
  if (!/cannot be snapped to "\+g\.cells/.test(hb))
    throw new Error('the readout does not say why');
  /* A NOTE, NOT A REPLACEMENT. Returning early hid what the size in force was
     about to give, which is the one thing the readout is for. */
  if (!/\+note\+snapNote/.test(hb))
    throw new Error('the snap note replaces the readout instead of joining it');
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/const tooSmall=wantedSnap/.test(bb))
    throw new Error('a batch does not count what the snap could not be used on');
  if (!/\+smallNote/.test(bb))
    throw new Error('a batch does not say it');
  if (!/try\{ file\.__w=W; \}catch/.test(bb))
    throw new Error('the width is not kept, so there is nothing to count');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
