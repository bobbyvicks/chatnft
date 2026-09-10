/* OPENED AT 1280 AND HANDED A ONE-PIXEL BRUSH.

   "when we used to open in editor it used the brush size and there was grid
   snapping. it works 1/10 of the time when im trying to edit a skin"

   This one is mine, from earlier today. patch410 made Open in the editor
   honour the 1280 switch, so the canvas went from the fixer's own 160 to the
   collection's 1280 - and that fixed saving. What it broke is everything the
   editor decides from gridBlock: the grid overlay, the brush size, and
   whether a stroke jumps cell to cell.

   startEditor resets gridBlock to 1 and leaves it to the caller to say what
   the art is really drawn in. At 160 that was right by accident - one art
   pixel WAS one cell - so a brush of 1 painted exactly one collection pixel
   and snapping had nothing to do. At 1280 one art pixel is an eighth of a
   cell, so the same brush paints an eighth of a pixel and every stroke lands
   between cells. Editing a skin that way is exactly as described.

   THE BLOCK SIZE IS NOT MEASURED HERE, IT IS KNOWN. The result came back at a
   cell count and is being written onto CANVAS_SIDE, so the block is
   CANVAS_SIDE over that count - 8 for a 160-cell trait - and 1 when the
   switch is off and the canvas is the fixer's own answer. adoptBlock is what
   the raw-open path already calls with its measurement; this calls it with
   the arithmetic, which cannot be wrong.

   The tiles do the same, for the same reason: a tile decodes the saved bytes,
   which are the same 1280 canvas. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the block a fixed result is drawn in -------------------------- */
{
  const at = kit.only(L, l => l === 'function fixOpen(){', 'the open button');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE BLOCK SIZE OF A RESULT ON THE CANVAS IT IS BEING OPENED AT.',
    '',
    '   Known rather than measured: the engine answered `cells` across, and it',
    '   is being drawn onto `side` - so one of its pixels is side/cells wide.',
    '   With the 1280 switch off the canvas IS the answer and the block is 1,',
    '   which is what it always was before the switch existed. */',
    'function fixBlockFor(cells,side){',
    '  if(!(cells>0)||!(side>0)) return 1;',
    '  const b=side/cells;',
    '  return b>=1.5 ? Math.round(b) : 1;',
    '}',
  ]);
  const r = kit.inFunction(L, 'function fixOpen(){');
  const start = kit.only(L, l => l === '  startEditor(d,W,H,W,H,palette(d,W*H,24,64),false);',
    'where the editor is started', r);
  kit.replace(L, { start: start, end: start }, [
    '  startEditor(d,W,H,W,H,palette(d,W*H,24,64),false);',
    '  /* AFTER startEditor, which resets gridBlock to 1 and leaves the caller',
    '     to say what the art is drawn in. Without this a 1280 canvas gets a',
    '     one-pixel brush and no snapping - an eighth of a collection pixel per',
    '     stroke. See patch415. */',
    '  adoptBlock(fixBlockFor(r.width,W));',
  ]);
}

/* ---- and a tile opens the same way --------------------------------- */
{
  const r = kit.inFunction(L, 'async function fixOpenOne(f){');
  const at = kit.only(L, l => l === '  startEditor(new Uint8ClampedArray(d),W,H,W,H,palette(d,W*H,24,64),false);',
    'where a tile starts the editor', r);
  kit.replace(L, { start: at, end: at }, [
    '  startEditor(new Uint8ClampedArray(d),W,H,W,H,palette(d,W*H,24,64),false);',
    '  /* The saved bytes are the same canvas, so the same arithmetic. The count',
    '     is kept on the result for exactly this. */',
    '  adoptBlock(fixBlockFor(f.cells,W));',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE BLOCK IS DERIVED FROM THE TWO NUMBERS, not measured or guessed. */
  const bf = kit.inFunction(codeLines, 'function fixBlockFor(cells,side){');
  const bb = codeLines.slice(bf.start, bf.end + 1).join('\n');
  if (!/const b=side\/cells;/.test(bb))
    throw new Error('the block is not the canvas over the cell count');
  if (/period|measure|detect/i.test(bb))
    throw new Error('the block is being measured when it is already known');

  /* BOTH DOORS SET IT, and after startEditor - which resets it to 1. */
  for (const fn of ['function fixOpen(){', 'async function fixOpenOne(f){']) {
    const f = kit.inFunction(codeLines, fn);
    const body = codeLines.slice(f.start, f.end + 1).join('\n');
    if (!/adoptBlock\(fixBlockFor\(/.test(body))
      throw new Error(fn + ' opens the editor without saying what the art is drawn in');
    const startAt = body.indexOf('startEditor(');
    const adoptAt = body.indexOf('adoptBlock(');
    if (startAt < 0 || adoptAt < 0 || adoptAt < startAt)
      throw new Error(fn + ' adopts the block before startEditor resets it');
  }
  /* The switch-off case must still be 1, which is what it always was. */
  if (!/return b>=1\.5 \? Math\.round\(b\) : 1;/.test(bb))
    throw new Error('a native-size open no longer reports a block of 1');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
