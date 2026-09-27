/* THE 16 DEFAULT, FOLLOWED THROUGH. On top of patch596 and patch597.

   A second independent review (two lenses, each finding checked by a separate
   skeptic) confirmed these in patch597's work, and each is fixed here:

   - patch597 took the typed flags with the run's decision, and said typing
     mid-run could no longer rewrite what the run says - but the SNAP path's
     re-cut flag was still read when the worker answered, and is tested
     first. Taken with the others now.
   - Save at 1280 OFF, and a size that lands on no count, returned before any
     flag was set: a merge or a resample there was still "medium confidence
     (forced)". Every return of a typed size now goes through the one block
     of flag code, with the grid it makes - so there is still one copy of it.
   - The editor's Fix button in SCALE ONLY adopted "one pixel per cell" from
     a result that is the picture untouched - an 8px trait's grid and brush
     went to 1. A scaled result keeps the block it had, scaled with the
     canvas.
   - UNDO after the editor's Fix put the 8px art back and left the grid on
     16. The entry the fix pushes carries the block it replaced, and undo and
     redo put a carried block back with the pixels. Entries without one - every
     other edit - behave exactly as before.
   - The folder counted recuts, merges and resamples when a file was SENT to
     the engine, so files sent ahead and dropped on Stop, or that failed,
     were counted; and every note named the whole run's set of grids. Counted
     when a file is done now, each with its own grid.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf(NL) < 0) throw new Error('index.html is not CRLF');
if (text.indexOf('fixTypedResample={grid:cells, w:w};') < 0) throw new Error('patch597 is not applied');

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 80) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. every typed return goes through the flag code ------------------- */
swap('    if(!onGrid) return asked;', block([
  '    /* ONE BLOCK OF FLAG CODE FOR EVERY WAY THIS BRANCH ENDS (patch598). The',
  '       switch-off return and the no-landing return used to leave before the',
  '       flags were set, so a merge or a resample there went unsaid. They break',
  '       out to it now with the step and the grid they make; only the',
  '       never-upsample keep still returns on its own, and says so itself. */',
  '    let step=0, grid=0;',
  '    cut:{',
  '    if(!onGrid){ step=asked; grid=Math.max(1,fixRint(w/asked)); break cut; }',
]));
swap('    if(!cells) return asked;',
  '    if(!cells){ step=asked; grid=Math.max(1,fixRint(w/asked)); break cut; }');
swap(block([
  '    const step=w/cells;',
  '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
]), block([
  '    step=w/cells; grid=cells;',
  '    }',
  '    const drawn=px?fixNativeBlockFor(px,w,ph):0;',
]));
swap('to:step, grid:cells,', 'to:step, grid:grid,');
swap('by:Math.round(step/drawn), grid:cells,', 'by:Math.round(step/drawn), grid:grid,');
swap('fixTypedResample={grid:cells, w:w};', 'fixTypedResample={grid:grid, w:w};');

/* ---- 2. the snap re-cut flag is taken with the decision too -------------- */
swap('  const typedAt=fixTypedRecut, mergedAt=fixTypedMerge, resampledAt=fixTypedResample;',
  '  const typedAt=fixTypedRecut, mergedAt=fixTypedMerge, resampledAt=fixTypedResample, recutAt=fixBlockRecut;');
swap('        const recutBy=fixBlockRecut;', '        const recutBy=recutAt;');

/* ---- 3. the editor's Fix: scale only, and undo -------------------------- */
swap(block([
  '    const out=await pngDecode(await fixResultBytes(r));',
  '    snapshot();',
  '    restoreImage(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height));',
]), block([
  '    const out=await pngDecode(await fixResultBytes(r));',
  '    const widthWas=art.width, blockWas=gridBlock;',
  '    snapshot();',
  '    /* THE BLOCK IT REPLACES, on the entry Undo returns to - so Undo puts back',
  '       the 8px grid with the 8px art, not only the pixels. */',
  '    undoStack[undoStack.length-1].block=blockWas;',
  '    restoreImage(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height));',
]));
swap('    adoptBlock(r.width===r.height ? fixBlockFor(r.width,out.width) : 1);', block([
  '    /* SCALE ONLY is the picture untouched, one "cell" per source pixel, so',
  '       reading a block off the result gave 1. It keeps the block it had,',
  '       scaled with the canvas, or measures one when that is not whole. */',
  '    adoptBlock(r.consensus==="scaled"',
  '      ? (Number.isInteger(out.width/widthWas*blockWas) ? out.width/widthWas*blockWas : measuredBlock(out.data,out.width,out.height))',
  '      : (r.width===r.height ? fixBlockFor(r.width,out.width) : 1));',
]));
swap("$('undo').onclick=()=>{ if(!undoStack.length) return; redoStack.push(ctx.getImageData(0,0,art.width,art.height)); trimHistory(); restoreImage(undoStack.pop()); refreshStats(); resizeBoxes(); repalette(); };",
  block([
    "/* AN ENTRY MAY CARRY THE BLOCK IT WAS DRAWN IN (the editor's Fix pixels sets",
    "   one). Undo and redo put it back with the pixels, and give the entry they",
    "   push the block being left. Entries without one are untouched. */",
    "$('undo').onclick=()=>{ if(!undoStack.length) return; const cur=ctx.getImageData(0,0,art.width,art.height); if(undoStack[undoStack.length-1].block) cur.block=gridBlock; redoStack.push(cur); trimHistory(); const got=undoStack.pop(); restoreImage(got); if(got.block) adoptBlock(got.block); refreshStats(); resizeBoxes(); repalette(); };",
  ]));
swap("$('redo').onclick=()=>{ if(!redoStack.length) return; undoStack.push(ctx.getImageData(0,0,art.width,art.height)); trimHistory(); restoreImage(redoStack.pop()); refreshStats(); resizeBoxes(); repalette(); };",
  "$('redo').onclick=()=>{ if(!redoStack.length) return; const cur=ctx.getImageData(0,0,art.width,art.height); if(redoStack[redoStack.length-1].block) cur.block=gridBlock; undoStack.push(cur); trimHistory(); const got=redoStack.pop(); restoreImage(got); if(got.block) adoptBlock(got.block); refreshStats(); resizeBoxes(); repalette(); };");

/* ---- 4. the folder: counted when done, each with its own grid ------------ */
swap(block([
  '            if(fixTypedRecut){ fixTypedRecutAt.push(fixTypedRecut.block);',
  '              if(fixTypedRecut.strokes) fixTypedStrokesAt.push({name:name, strokes:fixTypedRecut.strokes}); }',
  '            if(fixTypedMerge){ fixTypedMergeAt.push(fixTypedMerge.block);',
  '              if(fixTypedMerge.strokes) fixTypedMergeStrokesAt.push({name:name, strokes:fixTypedMerge.strokes}); }',
  '            if(fixTypedResample) fixTypedResampleAt.push(fixTypedResample.w);',
  '            /* THE GRID THIS FILE WAS CUT TO, from its own decision - the box can',
  '               change between files, and the summary is written at the end. */',
  '            for(const t of [fixTypedRecut,fixTypedMerge,fixTypedResample]) if(t) fixTypedGrids.add(t.grid);',
]), block([
  '            /* WHAT THE SIZE DID TO THIS FILE, taken with its decision and counted',
  '               in finish() once the file is really done - a file sent ahead and',
  '               dropped on Stop, or one the engine failed, is not counted. */',
  '            cut={recut:fixTypedRecut, merge:fixTypedMerge, resample:fixTypedResample};',
]));
swap('      const pending=scale ? Promise.resolve(', block([
  '      let cut=null;',
  '      const pending=scale ? Promise.resolve(',
]));
swap('    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending, sized:!scale&&fixSizeSet()};',
  '    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending, sized:!scale&&fixSizeSet(), cut:cut};');
swap(block([
  '      if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); return; }',
  '      const out=r.ok;',
]), block([
  '      if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); return; }',
  '      const out=r.ok;',
  '      { const c=job.cut||{};',
  '        if(c.recut){ fixTypedRecutAt.push({block:c.recut.block, grid:c.recut.grid});',
  '          if(c.recut.strokes) fixTypedStrokesAt.push({name:name, strokes:c.recut.strokes}); }',
  '        if(c.merge){ fixTypedMergeAt.push({block:c.merge.block, grid:c.merge.grid});',
  '          if(c.merge.strokes) fixTypedMergeStrokesAt.push({name:name, strokes:c.merge.strokes}); }',
  '        if(c.resample) fixTypedResampleAt.push({w:c.resample.w, grid:c.resample.grid}); }',
]));
swap('fixTypedResampleAt=[], fixTypedGrids=new Set();', 'fixTypedResampleAt=[];');
swap('fixTypedResampleAt=[]; fixTypedGrids=new Set();', 'fixTypedResampleAt=[];');
swap(block([
  '  const gridNums=fixTypedGrids.size ? [...fixTypedGrids].sort((a,b)=>a-b).join(" and ") : String(fixGridCells().cells);',
  '  const gridMany=fixTypedGrids.size>1;',
]), block([
  '  /* EACH NOTE NAMES THE GRIDS ITS OWN FILES WENT TO. One is the ordinary case;',
  '     more than one means the box changed during the run. */',
  '  const gridsOf=(a)=>{ const g=[...new Set(a.map(x=>x.grid))].sort((p,q)=>p-q); return {words:g.join(" and "), many:g.length>1}; };',
  '  const blocksOf=(a)=>[...new Set(a.map(x=>x.block))].sort((p,q)=>p-q).map(b=>b+"px").join(", ");',
  '  const gR=gridsOf(fixTypedRecutAt), gM=gridsOf(fixTypedMergeAt), gS=gridsOf(fixTypedResampleAt);',
]));
swap(block([
  '      +gridNums+(gridMany?" cell grids cut across (":" cell grid cuts across (")',
  '      +[...new Set(fixTypedRecutAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+")"',
]), block([
  '      +gR.words+(gR.many?" cell grids cut across (":" cell grid cuts across (")',
  '      +blocksOf(fixTypedRecutAt)+")"',
]));
swap(block([
  '      +[...new Set(fixTypedMergeAt)].sort((a,b)=>a-b).map(b=>b+"px").join(", ")+") were merged onto the "',
  '      +gridNums+(gridMany?" cell grids":" cell grid")',
]), block([
  '      +blocksOf(fixTypedMergeAt)+")"+(fixTypedMergeAt.length===1?" was":" were")+" merged onto the "',
  '      +gM.words+(gM.many?" cell grids":" cell grid")',
]));
swap('      +" resampled onto the "+gridNums+(gridMany?" cell grids":" cell grid")',
  '      +" resampled onto the "+gS.words+(gS.many?" cell grids":" cell grid")');

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
if (/const (recutBy|typedBy|mergedBy|resampledBy)=fix/.test(code)) throw new Error('the single run still reads a live flag');
if (/gridNums|gridMany|fixTypedGrids/.test(code)) throw new Error('a note still names the whole run\'s grids');
if (/return asked;/.test(code.slice(code.indexOf('if(asked>0){'), code.indexOf('if(fixSnapping()){'))))
  throw new Error('a typed return still leaves before the flags are set');
/* The prepare step no longer counts; finish does. */
const prep = code.slice(code.indexOf('const pending=scale ?'), code.indexOf('const finish=async(job)=>{'));
if (/fixTyped(Recut|Merge|Resample)At\.push/.test(prep)) throw new Error('a file is still counted when it is sent, not when it is done');
for (const s of ['cut={recut:fixTypedRecut, merge:fixTypedMerge, resample:fixTypedResample};', 'cut:cut};',
  'undoStack[undoStack.length-1].block=blockWas;', 'if(got.block) adoptBlock(got.block);', 'r.consensus==="scaled"'])
  if (code.indexOf(s) < 0) throw new Error('missing: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' chars');
