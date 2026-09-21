/* A TYPED RUN SAYS WHAT THE PICTURE WAS DRAWN AT.

   THE THING THAT IS NOT SAID. The documented workflow types 8, and
   fixStepFor's typed branch works the count out on the canvas and returns
   the step without ever asking what the picture is drawn in. Measured over
   the 311 working traits: 43 are drawn at 8px blocks, 166 are on no grid at
   all, and 101 are drawn at a size the 160 cell grid CUTS ACROSS - 89 at
   10px, 12 at 5px. On those 101 every cell boundary lands inside a drawn
   block, and the run says "medium confidence (forced)" about it.

   IT MATTERS AND THE COLLECTION KNOWS IT. hats/Make Solana Great Again Hat
   is drawn at 5px. Through the workflow it reports 10 colours in and 8 out,
   0.97% of its paint lost, IoU 0.98, every gate fact passed - and the words
   MAKE SOLANA GREAT AGAIN come out as glyph rubble, because 8px cells cut
   across 5px letters. Per-trait numbers cannot see that and neither can the
   gate; the one fact that predicts it is the block size the picture was
   drawn at, which this page measures already (fixNativeBlockFor) and throws
   away on the typed path.

   ONLY WHEN THE TWO DO NOT DIVIDE. 8px art typed at 4 is two cells per
   block and loses nothing; 2px art typed at 8 is four blocks a cell, which
   the marks-dropped clause already covers. The damage is when neither
   divides the other, and that is the only case this says anything about -
   one of the 311 is a clean merge and it stays quiet.

   WHAT THIS ADDS. The measurement, on the typed path, and two sentences:
   the single run says "drawn at 5px blocks (256 cells), which the 160 cell
   grid cuts across" instead of "medium confidence (forced)", and a folder
   run adds "101 were drawn at a block size the 160 cell grid cuts across
   (5px, 10px)". It changes no pixel and no verdict.

   The readout keeps its own clause ("10px blocks (128 cells) become 1.25
   cells each", typedoncanvas.spec.js:186). That one answers what is about
   to happen to the blocks, before the run; these answer what happened to
   this file. Same measurement, two moments.

   WHAT IT COSTS. One fixNativeBlockFor per file on the typed path. The
   readout already calls it on every keystroke for the loaded picture, and
   for the loaded picture it is cached on the array identity (FIX.native),
   so the only new work is one scan per file in a folder run. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the flag, beside the one patch511 added ------------------------ */
swap('let fixBlockRecut=null;', [
  'let fixBlockRecut=null;',
  '/* AND THE SAME FACT ON THE TYPED PATH: what the picture is drawn at, when',
  '   that is not what the typed size is about to cut it to. fixBlockRecut is',
  '   the default path\'s version of this and carries an instruction with it',
  '   ("type 10 to keep them"); this one carries none, because a size was',
  '   typed on purpose and the answer is not that it was wrong. */',
  'let fixTypedRecut=null;',
], 'the recut flag');

/* ---- 2. measured on the typed path, where it was never asked ----------- */
{
  const fn = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const reset = at('  fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null; fixBlockRecut=null;',
    'the flag reset', fn);
  kit.replace(L, { start: reset, end: reset }, [
    '  fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null; fixBlockRecut=null; fixTypedRecut=null;',
  ]);
  const ret = at('    return w/cells;', 'the typed branch return', kit.inFunction(L, 'function fixStepFor(w,data,h){'));
  kit.replace(L, { start: ret, end: ret }, [
    '    /* WHAT IT WAS DRAWN AT, AGAINST WHAT IT IS ABOUT TO BE CUT TO. The',
    '       typed size wins - that decision is above and it stands - but the run',
    '       was saying nothing at all about a picture whose blocks it was about',
    '       to slice. 102 of the 311 working traits are in this case.',
    '',
    '       ONLY WHEN NEITHER DIVIDES THE OTHER. 8px art typed at 4 is two',
    '       whole cells per block and loses nothing; 2px art typed at 8 is four',
    '       whole blocks a cell, which is a merge the marks-dropped clause',
    '       already covers. What breaks lettering is 10px or 5px art on 8px',
    '       cells, where every boundary lands inside a block - 101 of the 311,',
    '       against one clean merge and 43 already at 8.',
    '',
    '       Measured here rather than at the call sites because this is where',
    '       the step is known; recorded in a flag rather than returned because',
    '       every caller of this function wants the step and one of them wants',
    '       the reason. */',
    '    const step=w/cells;',
    '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
    '    const whole=x=>Math.abs(x-Math.round(x))<1e-9;',
    '    if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn))',
    '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step};',
    '    return step;',
  ]);
}

/* ---- 3. the single run says it instead of a confidence level ----------- */
swap('        const recutBy=fixBlockRecut;', [
  '        const recutBy=fixBlockRecut;',
  '        /* AND THE TYPED PATH\'S VERSION. Without this a forced run falls',
  '           through to "medium confidence (forced)", which is the engine',
  '           describing the instruction it was given - not a word about the',
  '           picture it was given it for. */',
  '        const typedBy=fixTypedRecut;',
], 'the run recut flag');
at('        const how = recutBy', 'the how chain head');
{
  const i = at('            +fixGridCells().cells+" cell grid - type "+recutBy.canvasBlock+" to keep them"', 'the recut how clause');
  kit.replace(L, { start: i, end: i }, [
    '            +fixGridCells().cells+" cell grid - type "+recutBy.canvasBlock+" to keep them"',
    '          : typedBy',
    '          ? "drawn at "+typedBy.block+"px blocks ("+typedBy.cells+" cells), which the "',
    '            +fixGridCells().cells+" cell grid cuts across"',
  ]);
}

/* ---- 4. the folder run counts them ------------------------------------- */
swap('let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[];',
  ['let fixMovedLast=null, fixMovedCount=0, fixUnhonouredAt=[], fixNativeKept=0, fixOwnBlocks=0, fixUnfitAt=[], fixTypedRecutAt=[];'],
  'the folder counters');
swap('  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[];',
  ['  fixMovedLast=null; fixMovedCount=0; fixUnhonouredAt=[]; fixNativeKept=0; fixOwnBlocks=0; fixUnfitAt=[]; fixTypedRecutAt=[];'],
  'the folder reset');
swap('          if(fixBlockRecut) fixRecutAt.push(fixBlockRecut.canvasBlock);',
  [
    '          if(fixBlockRecut) fixRecutAt.push(fixBlockRecut.canvasBlock);',
    '          if(fixTypedRecut) fixTypedRecutAt.push(fixTypedRecut.block);',
  ], 'the folder recut counter');

/* ---- 5. and says it, with the sizes it saw ----------------------------- */
{
  const i = at('  const recutNote = fixRecutAt.length', 'the folder recut note');
  const end = at('    : "";', 'the folder recut note end', { start: i, end: i + 5 });
  kit.replace(L, { start: end, end: end }, [
    '    : "";',
    '  /* THE SAME FACT ON THE TYPED PATH, where nothing said it. No advice',
    '     attached: the size was typed on purpose, the collection wants 8, and',
    '     "type 10 to keep them" would be telling somebody to leave the grid the',
    '     gate is about. It is here so that a folder of traits whose lettering',
    '     comes out broken says which files to go and look at. */',
    '  const typedRecutNote = fixTypedRecutAt.length',
    '    ? " \\u00b7 "+fixTypedRecutAt.length+" were drawn at a block size the "',
    '      +fixGridCells().cells+" cell grid cuts across ("',
    '      +[...new Set(fixTypedRecutAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+")"',
    '    : "";',
  ]);
}
swap('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+recutNote+unfitNote+offNote+alphaNote+readNote+shrunkNote+palNote+gateNote+pastNote',
  ['  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+recutNote+typedRecutNote+unfitNote+offNote+alphaNote+readNote+shrunkNote+palNote+gateNote+pastNote'],
  'the folder sentence');

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  for (const s of ['let fixTypedRecut=null;',
    'fixBlockRecut=null; fixTypedRecut=null;',
    '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
    '      fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step};',
    '        const typedBy=fixTypedRecut;',
    '          : typedBy',
    'if(fixTypedRecut) fixTypedRecutAt.push(fixTypedRecut.block);',
    '  const typedRecutNote = fixTypedRecutAt.length',
    '+recutNote+typedRecutNote+unfitNote']) need(s);

  /* THE TYPED DECISION IS UNTOUCHED. This patch adds a measurement beside the
     step; if it moved the step it would be a different patch. fixStepFor is
     compared line for line against the version this started from, with the
     lines this patch adds taken back out and the two it edited mapped back -
     so the check is on what the function DECIDES, not on a list of lines I
     remembered to look at. */
  const bound = (t) => {
    const c = kit.code(kit.scriptOf(t));
    const a = c.indexOf('function fixStepFor(w,data,h){'), b = c.indexOf('function fixMode(', a);
    if (a < 0 || b < 0) throw new Error('could not bound fixStepFor');
    return kit.lines(c.slice(a, b)).map(l => l.trim()).filter(Boolean);
  };
  const ADDED = ['const step=w/cells;',
    'const drawn=px?fixNativeBlockFor(px,w,ph):0;',
    'const whole=x=>Math.abs(x-Math.round(x))<1e-9;',
    'if(drawn>1&&step>0&&!whole(drawn/step)&&!whole(step/drawn))',
    'fixTypedRecut={block:drawn, cells:Math.max(1,fixRint(w/drawn)), to:step};'];
  const RESET_OLD = 'fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null; fixBlockRecut=null;';
  const was = bound(doc.original);
  const now = bound(doc.lines.join(doc.EOL))
    .filter(l => ADDED.indexOf(l) < 0)
    .map(l => l === RESET_OLD + ' fixTypedRecut=null;' ? RESET_OLD : l)
    .map(l => l === 'return step;' ? 'return w/cells;' : l);
  if (was.length !== now.length)
    throw new Error('fixStepFor: ' + was.length + ' decision lines became ' + now.length);
  for (let i = 0; i < was.length; i++)
    if (was[i] !== now[i]) throw new Error('fixStepFor changed at line ' + (i + 1) + ': ' + now[i]);

  /* AND THE READOUT STILL SAYS ITS OWN CLAUSE, which is a different sentence
     answering a different moment and is pinned by typedoncanvas.spec.js. */
  need('recutBlocks=" \\u00b7 "+nat+"px blocks ("+fixRint(W/nat)+" cells) become "');
});

fs.renameSync(TMP, FILE);
console.log('patch515 written, ' + grew + ' bytes');
