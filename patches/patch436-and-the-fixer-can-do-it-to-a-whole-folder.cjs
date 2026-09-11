/* AND THE SAME THING ON A WHOLE FOLDER.

   "in fix pixels ^ and png edit"

   patch435 put "Change colours to palette" in the editor, where it is one
   trait at a time. The fixer is where a folder of three hundred goes
   through, and putting every one of them on the palette by opening each in
   the editor and pressing a button is not the same offer.

   So the fixer gets it as a switch on the run: the result is put on the
   palette after the grid is worked out and before it is written, for every
   file in a batch and for a single image alike. Off by default - it rewrites
   every colour in the picture, which is not something to do to somebody's
   art because they pressed Fix it.

   THE SAME FUNCTION, not a second one. snapToPalette takes pixels and gives
   back what it changed, so this is the same arithmetic the editor button
   runs, and the run reports the totals the same way it reports everything
   else it did. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const MID = String.fromCharCode(92) + 'u00b7';

/* ---- the switch ---------------------------------------------------- */
{
  const at = kit.only(L, l => l === '      <span id="fixsnaplab">Snap to the grid</span></label>',
    'the snap label');
  kit.replace(L, { start: at, end: at }, [
    '      <span id="fixsnaplab">Snap to the grid</span></label>',
    '    <!-- OFF BY DEFAULT. It rewrites every colour in the picture, which is',
    '         not a thing to do to somebody art because they pressed Fix it. -->',
    '    <label class="olrow" style="gap:6px"',
    '      title="Change every colour in the result to the nearest one in the project palette. A green becomes a different shade of green. Colours already in the palette are left alone and nothing transparent is touched.">',
    '      <input type="checkbox" id="fixpal">',
    '      <span>Colours to palette</span></label>',
  ]);
}

/* ---- applied to a result, in one place ----------------------------- */
{
  const at = kit.only(L, l => l === 'function fixGridCells(){', 'the grid cells helper');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE RESULT, ON THE PALETTE, if the switch asks for it.',
    '',
    '   The same snapToPalette the editor button runs - one arithmetic, and the',
    '   counts come back the same shape so a run can add them up. Applied to',
    '   the engine answer before anything is written, so the file, the preview',
    '   and the thing that opens in the editor are all the same picture. */',
    'let fixPalMoved=0, fixPalPixels=0, fixPalFiles=0;',
    'function fixPalWanted(){ const b=$("fixpal"); return !!(b&&b.checked); }',
    'function fixPalApply(out){',
    '  if(!out||!out.data||!fixPalWanted()) return null;',
    '  const r=snapToPalette(out.data,out.width*out.height);',
    '  if(r.colours){ fixPalMoved+=r.colours; fixPalPixels+=r.pixels; fixPalFiles++; }',
    '  return r;',
    '}',
  ]);
}

/* ---- the batch, per file, and the run says so ---------------------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '    const out=r.ok;', 'where a batch takes its answer', bat);
  kit.replace(L, { start: at, end: at }, [
    '    const out=r.ok;',
    '    /* Before the canvas is made from it, so the file and the tile agree. */',
    '    fixPalApply(out);',
  ]);
  const reset = kit.only(L, l => l === '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];',
    'where a batch resets', kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: reset, end: reset }, [
    '  fixMoved=null; fixNoGrid=0; fixGridlessAt=[];',
    '  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0;',
  ]);
  const note = kit.only(L, l => l === '  const shrunkNote = shrunk.length', 'the reduced note',
    kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: note, end: note - 1 }, [
    '  const palNote = fixPalFiles',
    '    ? " ' + MID + ' "+fixPalFiles+" put on the palette, "+fixPalMoved',
    '      +" colour"+(fixPalMoved===1?"":"s")+" moved across "',
    '      +fixPalPixels.toLocaleString()+" pixels"',
    '    : "";',
  ]);
  const say = kit.only(L, l => l.indexOf('  fixBatchSay(fixBatchFiles.length+" of "+list.length') === 0,
    'what a batch says', kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: say, end: say }, [L[say] + '+palNote']);
}

/* ---- and a single run ---------------------------------------------- */
{
  const run = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l === '        const r=fixStampMeasured(m.done); fixShow(r);',
    'where the run takes its result', run);
  kit.replace(L, { start: at, end: at }, [
    '        const r=fixStampMeasured(m.done);',
    '        /* Before it is shown, so the preview is the picture that saves. */',
    '        const pal=fixPalApply(r);',
    '        fixShow(r);',
    '        /* Read back off the line rather than through a helper: there is',
    '           no fixSayText - fixSay WRITES - and what is wanted here is the',
    '           sentence the run has just put there. */',
    '        if(pal&&pal.colours) fixSay(($("fixout").textContent||"")+" \\u00b7 "+pal.colours',
    '          +" colour"+(pal.colours===1?"":"s")+" moved to the palette");',
  ]);
}

/* ---- and scale only gets it too, since it writes a file ------------ */
{
  const run = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l.indexOf('    const r={data:new Uint8ClampedArray(src.data), width:src.width, height:src.height,') === 0,
    'the scale-only result', run);
  if (L[at + 1] !== '      stepX:1, stepY:1, confidence:"none", consensus:"scaled"};')
    throw new Error('the scale-only result is not shaped the way this expects');
  kit.replace(L, { start: at + 1, end: at + 1 }, [
    '      stepX:1, stepY:1, confidence:"none", consensus:"scaled"};',
    '    /* Scale only writes a file like any other run, so the switch applies. */',
    '    fixPalApply(r);',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  if (!/id="fixpal"/.test(text))
    throw new Error('there is no switch');
  /* OFF BY DEFAULT. Rewriting every colour is not a thing to do unasked. */
  if (/<input type="checkbox" id="fixpal" checked>/.test(text))
    throw new Error('the run would recolour every picture without being asked');

  /* ONE ARITHMETIC, shared with the editor button. */
  const ap = kit.inFunction(codeLines, 'function fixPalApply(out){');
  const body = codeLines.slice(ap.start, ap.end + 1).join('\n');
  if (!/const r=snapToPalette\(out\.data,out\.width\*out\.height\);/.test(body))
    throw new Error('the fixer has its own copy of the nearest-colour rule');
  if (!/if\(!out\|\|!out\.data\|\|!fixPalWanted\(\)\) return null;/.test(body))
    throw new Error('it runs whether or not the switch is on');

  /* AND EVERY NAME IT CALLS IS REAL. A patch only has to PARSE to be written,
     so an invented helper inside a callback survives the write and throws the
     first time somebody presses the button. fixSayText was exactly that. */
  const all = codeLines.join('\n');
  for (const name of ['snapToPalette', 'fixSay', 'fixPalWanted'])
    if (!new RegExp('function ' + name + '\\(').test(all))
      throw new Error('it calls ' + name + ', which does not exist');
  if (/fixSayText/.test(all))
    throw new Error('fixSayText is not a function on this page');

  /* BOTH PATHS, or it is missing for half the people using the tab. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/fixPalApply\(out\);/.test(bb))
    throw new Error('a folder run does not reach it');
  if (!/fixPalMoved=0; fixPalPixels=0; fixPalFiles=0;/.test(bb))
    throw new Error('a run would report the run before it');
  if (!/\+palNote/.test(bb))
    throw new Error('a batch recolours every file and says nothing');
  const one = kit.inFunction(codeLines, 'function fixRun(){');
  const ob = codeLines.slice(one.start, one.end + 1).join('\n');
  if ((ob.match(/fixPalApply\(/g) || []).length !== 2)
    throw new Error('the single run misses one of its two ways out');
  /* AND IT LANDS BEFORE THE PICTURE IS SHOWN, or the preview is a different
     picture from the file. */
  if (ob.indexOf('fixPalApply(r);') > ob.indexOf('fixShow(r);'))
    throw new Error('the preview is shown before the colours are changed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
