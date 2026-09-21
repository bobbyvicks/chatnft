/* THE DEFAULT REFINES ONTO THE COLLECTION'S GRID, AND NEVER COARSENS.

   DECISION P1, taken 2026-09-21. The report left this open: with Pixel size
   0 the tab follows the picture's own grid, which leaves 133 of the 311
   working traits off the collection's 8px cells - files the tab's own gate
   line now prints "not ready for the collection" against, at the tab's own
   default. The choice was between keeping that and forcing everything onto
   160 cells. It is neither, because the two directions are not the same
   operation, and the pictures say so.

   THE LINE IS THE COLLECTION'S CELL, AND IT IS ARITHMETIC. A saved 1280
   file passes the block clause exactly when its canvas block is a whole
   multiple of 8, so the only canvas blocks a picture's own grid can have
   that are neither legal nor finer than a cell are 10 and 20. Above the
   cell, moving onto it RAISES the cell count: a feature one source cell
   across still covers 1.25 output cells, so it is redrawn. Below the cell,
   every legal target is COARSER: a feature one cell across covers 0.6 of
   an output cell, loses the vote, and disappears.

   THE PICTURES AGREE, and they are the evidence, because the numbers cannot
   see this. Measured 2026-09-21 on eighteen crops of the real traits:
     glasses/Steve Jobs Round Glasses, 10px, the WORST re-cut in the set at
       32.49% of its pixels "lost" - at 8px it is the same drawing, frame
       intact. The number is the thin-line proxy, not damage.
     hats/Make Solana Great Again Hat, 5px, 0.97% "lost", iou 0.9801 - at
       8px the lettering is unreadable gibberish. No number in the tab
       could have told you; the crop takes one second.
   Twelve files coarser than the cell were looked at, picked to break the
   rule (lettering, one-cell strokes): none damaged. The three called
   damaged are all finer than the cell.

   SO: with Save at 1280 on and nothing typed,
     (a) a picture whose blocks land on the collection's cell (8px, 16px...)
         keeps them, as before;
     (b) a picture whose blocks are COARSER and do not land (10px, 20px) is
         re-cut on the 160 cell grid, and the run says so and says which
         size gives its own blocks back;
     (c) a picture whose blocks are FINER than the cell (5px, 4px, 2px)
         keeps them, as before, and the gate clause says it is not ready;
     (d) a picture with no block structure at all is unchanged: the gridless
         search already prefers the collection's grid and takes a finer
         count only where it has MEASURED that 160 loses the shape or the
         paint (31 of 166 traits). Overriding a measurement with a
         preference is the defect this review keeps finding, and
         gridless.spec.js:109-162 is a positive control somebody built for
         exactly that mistake.
     (e) a picture smaller than the grid is unchanged: never upsample.

   MEASURED, on the 311 working traits (defaults today vs this rule, from
   two harness sweeps of the shipped code): gate-ready 178 -> 267, zero
   files that are ready today stop being ready, 89 files change their cell
   count, and those 89 lose a mean 4.38% of their pixels by the thin-line
   proxy. The 44 files still not ready are the 13 drawn finer than a cell
   and the 31 the gridless search measured 160 as failing; both keep their
   artwork and say what they are.

   Typing a size still overrides everything: 10 hands 10px art its 128 cells
   back, 8 forces a 5px trait onto the grid. This rule is what 0 means. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const swap = (from, to, name) => { const at = kit.only(L, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };
const block = (start, want, name) => { for (let i = 0; i < want.length; i++) if (L[start + i] !== want[i]) throw new Error(name + ': line ' + i + ' is not what this expects: ' + JSON.stringify(L[start + i])); };

/* ---- 1. the decision ------------------------------------------------------ */
{
  /* this line also appears in the fixSizeHint readout, so anchor on the
     one whose next line is the measured-block return */
  const at = kit.only(L, (l, i) => l === '    const nat=px?fixNativeBlockFor(px,w,ph):0;'
    && L[i + 1] === '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){ fixMeasuredBlock=nat; return nat; }', 'the measured block in the snap branch');
  block(at - 4, [
    '    /* THE PICTURE FIRST, THE SETTING SECOND. projectGrid says 160 and the',
    '       art is mostly drawn at 128 cells; forcing the setting cut 8px cells',
    '       through 10px blocks and deleted up to 23% of a trait. A measured',
    '       block is exact, so reducing on its boundaries loses nothing. */',
    '    const nat=px?fixNativeBlockFor(px,w,ph):0;',
    '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){ fixMeasuredBlock=nat; return nat; }',
  ], 'the measured branch');
  kit.replace(L, { start: at - 4, end: at + 1 }, [
    '    /* THE PICTURE FIRST, UNLESS THE PICTURE IS COARSER THAN THE COLLECTION.',
    '',
    '       SUPERSEDES "the picture first, the setting second ... a measured',
    '       block is exact, so reducing on its boundaries loses nothing". That',
    '       was written when the alternative was forcing a declared grid nobody',
    '       had measured against the gate, and it is still true of the reducing:',
    '       what it misses is that keeping a 10px block means the file cannot go',
    '       in the collection at all, which is not a smaller loss than re-cutting',
    '       it - it is the whole file.',
    '',
    '       THE LINE IS THE COLLECTION\'S CELL, and which side a picture falls on',
    '       decides which operation this is. A saved 1280 file has flat 8px',
    '       blocks exactly when its canvas block is a whole multiple of 8, so the',
    '       only canvas blocks a picture\'s own grid can have that are neither',
    '       legal nor finer than a cell are 10 and 20. COARSER than the cell,',
    '       moving onto it raises the cell count and a feature one source cell',
    '       across still covers 1.25 output cells - it is redrawn. FINER than the',
    '       cell, every legal target is coarser and a feature one cell across',
    '       covers 0.6 of a cell, loses the vote and disappears.',
    '',
    '       The pictures decided it, because no number here can. Measured',
    '       2026-09-21: glasses/Steve Jobs Round Glasses (10px) is the worst',
    '       re-cut in the set at 32.49% of its pixels "lost" and at 8px it is the',
    '       same drawing; hats/Make Solana Great Again Hat (5px) loses 0.97% with',
    '       iou 0.9801 and at 8px its lettering is unreadable. Twelve coarser',
    '       files picked to break the rule: none damaged. All three damaged files',
    '       are finer than the cell.',
    '',
    '       Over the 311 working traits this takes gate-ready from 178 to 267',
    '       with no file that is ready today becoming unready; 89 files change,',
    '       and typing 10 hands any of them its own blocks back. */',
    '    const nat=px?fixNativeBlockFor(px,w,ph):0;',
    '    let recut=null;',
    '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){',
    '      /* the block this picture would occupy ON THE CANVAS, which is the',
    '         only thing the collection\'s gate can see */',
    '      const cb=CANVAS_SIDE/(w/nat);',
    '      if(cb%8===0||cb<g.per) { fixMeasuredBlock=nat; return nat; }',
    '      recut={block:nat, cells:w/nat, canvasBlock:cb};',
    '    }',
  ]);
}

/* ---- 2. re-cut rather than "the grid cannot hold it" ---------------------- */
{
  const at = kit.only(L, l => l === '    if(nat>1){', 'the unfit branch');
  block(at, [
    '    if(nat>1){',
    '      /* A BLOCK THE CANVAS CANNOT HOLD: 1024 drawn at 2px is 512 cells and',
    '         1280/512 is not whole. The grid re-cuts it, as it always did, and',
    '         now says so. */',
    '      fixBlockUnfit={block:nat, cells:fixRint(w/nat)};',
    '    }else{',
  ], 'the unfit branch');
  kit.replace(L, { start: at, end: at + 5 }, [
    '    if(recut){',
    '      /* COARSER THAN THE COLLECTION\'S CELL, and its own count is legal -',
    '         so this is a choice the run has to own, not a picture the canvas',
    '         cannot hold. The readout names the size that gives its blocks back. */',
    '      fixBlockRecut=recut;',
    '    }else if(nat>1){',
    '      /* A BLOCK THE CANVAS CANNOT HOLD: 1024 drawn at 2px is 512 cells and',
    '         1280/512 is not whole. The grid re-cuts it, as it always did, and',
    '         now says so. */',
    '      fixBlockUnfit={block:nat, cells:fixRint(w/nat)};',
    '    }else{',
  ]);
}

/* ---- 3. the flag, declared and cleared with its neighbours ---------------- */
swap('let fixMoved=null;', [
  'let fixMoved=null;',
  '/* THE BLOCK THIS RUN RE-CUT, because it was coarser than the collection\'s',
  '   cell and could not be a multiple of it: {block, cells, canvasBlock}. Set',
  '   by fixStepFor, read by the readout and by the run\'s own sentence, and',
  '   cleared with its neighbours so it cannot describe the decision before. */',
  'let fixBlockRecut=null;',
], 'the flag declaration');
swap('  fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null;',
     '  fixMeasuredBlock=0; fixGridlessPick=0; fixMoved=null; fixUnhonoured=null; fixBlockUnfit=null; fixBlockRecut=null;', 'the per-decision reset');

/* ---- 4. what the readout says before the run ------------------------------ */
{
  const at = kit.only(L, l => l === '  const moved=fixMoved, unhon=fixUnhonoured, unfit=fixBlockUnfit, meas=fixMeasuredBlock;', 'the readout flags');
  kit.replace(L, { start: at, end: at }, ['  const moved=fixMoved, unhon=fixUnhonoured, unfit=fixBlockUnfit, meas=fixMeasuredBlock, recut=fixBlockRecut;']);
  const un = kit.only(L, l => l === '  const unfitNote = unfit', 'the unfit note');
  kit.replace(L, { start: un, end: un }, [
    '  /* COARSER THAN THE CELL, AND RE-CUT, with the size that keeps its own',
    '     blocks - the whole rule is one keystroke from its opposite. */',
    '  const recutNote = recut',
    '    ? " \\u00b7 "+recut.canvasBlock+"px blocks re-cut on the "+g.cells+" cell grid - type "',
    '      +recut.canvasBlock+" to keep them"',
    '    : "";',
    '  const unfitNote = unfit',
  ]);
  const el = kit.only(L, l => l === '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note+per+recut+snapNote+unhonNote+unfitNote', 'the readout line');
  kit.replace(L, { start: el, end: el }, ['  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note+per+recutBlocks+snapNote+unhonNote+unfitNote+recutNote']);
  /* `recut` was already the name of the re-cut-cost clause in this function */
  const rc = kit.only(L, l => l === '  let recut="";', 'the old recut string');
  kit.replace(L, { start: rc, end: rc }, ['  let recutBlocks="";']);
  const rc2 = kit.only(L, l => l === '    recut=" \\u00b7 "+nat+"px blocks ("+fixRint(W/nat)+" cells) become "', 'the old recut assignment');
  kit.replace(L, { start: rc2, end: rc2 }, ['    recutBlocks=" \\u00b7 "+nat+"px blocks ("+fixRint(W/nat)+" cells) become "']);
}

/* ---- 5. what the run says afterwards -------------------------------------- */
{
  const at = kit.only(L, l => l === '        const how = r.consensus==="measured"', 'the how sentence');
  kit.replace(L, { start: at, end: at }, [
    '        /* RE-CUT, SAID IN THE RUN\'S OWN WORDS. The engine reports "forced"',
    '           for the step it was given, so without this the sentence would',
    '           call a decision the tab took a confidence level. */',
    '        const recutBy=fixBlockRecut;',
    '        const how = recutBy',
    '          ? "measured "+recutBy.canvasBlock+"px blocks off the picture and re-cut them on the "',
    '            +fixGridCells().cells+" cell grid - type "+recutBy.canvasBlock+" to keep them"',
    '          : r.consensus==="measured"',
  ]);
}

/* ---- 5b. a folder run counts them ----------------------------------------- */
{
  /* the per-file record, taken where every other decision is taken */
  swap('          if(fixBlockUnfit) fixUnfitAt.push(fixBlockUnfit.block);', [
    '          if(fixBlockUnfit) fixUnfitAt.push(fixBlockUnfit.block);',
    '          if(fixBlockRecut) fixRecutAt.push(fixBlockRecut.canvasBlock);',
  ], 'the batch decision record');
  const dec = kit.only(L, l => l.startsWith('let fixGridlessFellAt=[], fixGridlessFellKept=1,'), 'the batch counters');
  kit.replace(L, { start: dec, end: dec }, [L[dec].replace(/;$/, ', fixRecutAt=[];')]);
  const res = kit.only(L, l => l.startsWith('  fixGridlessFellAt=[]; fixGridlessFellKept=1;'), 'the batch reset');
  kit.replace(L, { start: res, end: res }, [L[res].replace(/$/, ' fixRecutAt=[];')]);
  /* and the sentence, next to the block clause it is a sibling of */
  const un = kit.only(L, l => l === '  const unfitNote = fixUnfitAt.length', 'the folder unfit note');
  kit.replace(L, { start: un, end: un }, [
    '  /* COARSER THAN THE COLLECTION CELL AND RE-CUT ONTO IT. A sibling of the',
    '     clause below, not the same thing: those are blocks the canvas cannot',
    '     hold at all, these are blocks it could hold and the collection will',
    '     not, so this one names the size that keeps them. */',
    '  const recutNote = fixRecutAt.length',
    '    ? " \\u00b7 "+fixRecutAt.length+" drawn in blocks coarser than the collection cell ("',
    '      +[...new Set(fixRecutAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+") and re-cut on the "',
    '      +fixGridCells().cells+" cell grid - type "+[...new Set(fixRecutAt)].sort((a,b)=>a-b)[0]+" to keep them"',
    '    : "";',
    '  const unfitNote = fixUnfitAt.length',
  ]);
  const say = kit.only(L, l => l.startsWith('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "'), 'the folder sentence');
  if (L[say].indexOf('+unfitNote') < 0) throw new Error('the folder sentence does not carry unfitNote');
  kit.replace(L, { start: say, end: say }, [L[say].replace('+unfitNote', '+recutNote+unfitNote')]);
}

/* ---- 6. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  for (const s of ['      if(cb%8===0||cb<g.per) { fixMeasuredBlock=nat; return nat; }', '      recut={block:nat, cells:w/nat, canvasBlock:cb};',
    '      fixBlockRecut=recut;', 'let fixBlockRecut=null;', '  const recutNote = recut',
    '        const recutBy=fixBlockRecut;', '+recutBlocks+snapNote+unhonNote+unfitNote+recutNote',
    '          if(fixBlockRecut) fixRecutAt.push(fixBlockRecut.canvasBlock);', '  const recutNote = fixRecutAt.length',
    '+recutNote+unfitNote']) need(s);
  never('    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){ fixMeasuredBlock=nat; return nat; }');
  never('  let recut="";');
  /* the gridless branch is untouched: this decision is about a MEASURED block */
  need('      const cells=px?fixGridlessCells(px,w,ph||w):0;');
  need('      if(cells>0&&w>0){ fixNoGrid++; fixGridlessPick=cells; return w/cells; }');

  /* THE RULE, EXERCISED: carve fixStepFor with stand-ins and check every
     canvas block a divisor of 1280 can produce. */
  const fnOf = (n) => { const a = lines.findIndex(l => l.startsWith('function ' + n + '(')); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const src = 'const CANVAS_SIDE=1280;\n'
    + 'let fixMeasuredBlock=0, fixGridlessPick=0, fixMoved=null, fixUnhonoured=null, fixBlockUnfit=null, fixBlockRecut=null, fixNoGrid=0;\n'
    + 'function fixGridCells(){ return {cells:160, exact:true, per:8}; }\n'
    + 'function fixSnapping(){ return true; }\n'
    + 'function fixSnapStep(w){ return w/160; }\n'
    + 'function fixRint(x){ const f=Math.floor(x), d=x-f; return d<0.5?f:d>0.5?f+1:(f%2===0?f:f+1); }\n'
    + 'function fixCanvasCells(a){ return {cells:Math.round(1280/a), moved:null}; }\n'
    + 'function fixGridlessCells(){ return 160; }\n'
    + 'function fixNativeBlockFor(px){ return px.__nat; }\n'
    + fnOf('fixStepFor') + '\n'
    + 'return {fixStepFor, state:()=>({fixMeasuredBlock, fixBlockRecut, fixBlockUnfit, fixGridlessPick}), reset:()=>{fixMeasuredBlock=0;fixBlockRecut=null;fixBlockUnfit=null;fixGridlessPick=0;}};';
  const T = new Function('$', src)((id) => ({ fixforce: { value: '0' }, fixgrid: { checked: true } }[id] || null));
  const run = (nat, w) => { T.reset(); const step = T.fixStepFor(w, { __nat: nat }, w); return { step, ...T.state() }; };
  /* every canvas block a legal cell count can give, on a 1280 source */
  const cases = [[8, 8, 'keep'], [16, 16, 'keep'], [32, 32, 'keep'], [80, 80, 'keep'], [5, 5, 'keep'], [4, 4, 'keep'], [2, 2, 'keep'], [10, 10, 'recut'], [20, 20, 'recut']];
  for (const [nat, cb, want] of cases) {
    const r = run(nat, 1280);
    if (want === 'keep') {
      if (r.step !== nat || r.fixMeasuredBlock !== nat || r.fixBlockRecut) throw new Error(cb + 'px on the canvas should be kept: ' + JSON.stringify(r));
    } else {
      if (r.step !== 1280 / 160 || !r.fixBlockRecut || r.fixBlockRecut.canvasBlock !== cb || r.fixMeasuredBlock) throw new Error(cb + 'px on the canvas should be re-cut: ' + JSON.stringify(r));
    }
  }
  /* a block whose count cannot land is unfit, as before, not re-cut */
  { const r = run(3, 1280); if (!r.fixBlockUnfit || r.fixBlockRecut) throw new Error('an unlandable block must stay unfit: ' + JSON.stringify(r)); }
  /* no block at all: the gridless search still decides */
  { const r = run(0, 1280); if (r.fixGridlessPick !== 160 || r.fixBlockRecut) throw new Error('a gridless picture must still go to the search: ' + JSON.stringify(r)); }
  /* a non-1280 source whose own count lands: 1024 at 8px is 128 cells, canvas block 10 -> re-cut */
  { const r = run(8, 1024); if (!r.fixBlockRecut || r.fixBlockRecut.canvasBlock !== 10) throw new Error('1024 drawn at 8px is 10px on the canvas and must be re-cut: ' + JSON.stringify(r)); }
  /* and 2048 drawn at 16px is also 10px on the canvas */
  { const r = run(16, 2048); if (!r.fixBlockRecut || r.fixBlockRecut.canvasBlock !== 10) throw new Error('2048 drawn at 16px is 10px on the canvas: ' + JSON.stringify(r)); }
});

fs.renameSync(TMP, FILE);
console.log('patch511 written, ' + grew + ' bytes');
