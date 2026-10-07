/* patch634: A SCALE ONLY PICTURE IS COUNTED IN THE BLOCKS IT IS DRAWN IN.

   A folder run keeps each file's cell count - `cells`, "the count the engine landed on ... 1280 is 1280 whether its
   pixels are eight across or one" - and reads it four ways: the off-grid clause ("N not on the 160 cell grid (k at
   Kpx)", 86e88ea), the uneven-pixels clause, the block a tile opens at in the editor (fixOpenOne), and the recent
   rail, which opens the same way. In Scale only there is no engine and `cells` was out.width, the picture's width in
   pixels. So a finished 1280 trait drawn in 8px blocks read "1 not on the 160 cell grid (1 at 1px)" while the same
   line called it ready for the collection (fixGateOf asks of the saved picture, since ab044bc, for exactly this
   reason), and its tile opened in the editor on a one-pixel grid with a one-pixel brush. 420da15 kept the clause in
   Scale only because nothing is typed there ("its counts are the pictures' own"); the count it kept was pixels, not
   cells. The single run's result opens at block 1 too (fixOpen: fixBlockFor(r.width, W)).

   Measured at df3a344 (session 95a77113, scratchpad/map634: a read-only map by five agents - three on this
   question - and a critic, every number with its rows). The owner's 311 saved traits, all 1280x1280: fixNativeBlock
   measures 8px in 42 (one of them, Beige MM Hoodie, with a stray pixel in 61 blocks), 10px in 89, 5px in 12, 2px in 1
   and no block in 167. A Scale only
   folder of them said "311 not on the 160 cell grid (311 at 1px)"; it now says "269 not on the 160 cell grid (167 at
   1px, 89 at 10px, 12 at 5px, 1 at 2px)". The critic checked the block sizes by its own code (0 mismatches on 311)
   and that the 167 really have none, but for 6 that are near-blocks no measure here takes (Black Yankees Cap at 5px,
   two at 4px, three at 2px): those still read "at 1px". The owner, told that a Scale only folder says a finished 1280
   trait is "not on the 160 cell grid" while calling it ready, and that this would be fixed next: "ok keep going on
   that stuff it was gunna do".

   WHAT CHANGES:
   - fixScaleBlock(data,w,h): the block fixNativeBlockFor measures, and whether it was found by tolerating a stray
     pixel in some blocks; fixScaleCells(data,w,h): the picture's width over that block, or its width when there is
     none. fixNativeBlock writes the page's one noisy-block count, fixNativeNoisy; its readers read it straight after
     their own measure (fixRun's sentence, the engine path's folder tally, the two cache writes beside each measure,
     and fixScaleBlock itself, for the count it returns), so nothing else reads this one, but it is put back as it was
     found, so this new caller leaves no trace.
   - finish() records the count in blocks in Scale only (its own division of fixScaleBlock's block), so all four
     readers get it, and the rows too (fixRecentAdd copies them), so a Scale only tile asks the single run's shape
     question (below), and whether blocks hold stray pixels on a square picture whose pixels do not land on the
     canvas (strays), and how many: such a file, when its blocks land on 1280 (one whose blocks do not land either is
     the uneven clause's) and Save at 1280 is on, gets a clause of its own, "1 has 812 stray pixels in blocks that land
     on 1280; the strays can come out uneven" (narrower than 1280, where a stray comes out one size or another by
     where in its block it sits) or "... can be lost" (wider, where a stray is kept at one pixel or dropped), and "1
     has a stray pixel in a block that lands on 1280; it can ..." for one. A picture that is not square is stretched
     at 1280 and gets no stray clause; the gate names it "not square".
   - In Scale only a file is off the grid when its blocks do not land on the grid's cells - the grid's count is not a
     whole multiple of its own (grid % cells) - rather than when its count differs from the grid's. Nothing is cut
     there, so the question is whether the picture sits on the grid, which is the question the gate asks of it: 16px
     art (80 cells) and a flat one-colour 1280 picture (64px blocks, 20 cells) are on the 160 grid, as the gate says,
     and no longer read "not on the 160 cell grid" beside "ready". The engine path keeps its count test, where the
     clause informs the default size (86e88ea) and is followed by "type 8 to force it".
   - fixOpen opens a Scale only result at the same block, and asks whether the saved picture keeps the result's
     shape (W*h === H*w) instead of whether it is square: with Save at 1280 off a picture that is not square is not
     stretched, and opens on its blocks. On the engine path this changes nothing (a result that is not square opened
     at 1 either way). fixOpenOne asks the same of a Scale only file, from its recorded rows: a picture that is not
     square, saved at 1280, is stretched, and its tile opens at 1, as its single run does - so a Scale only file
     opens at one block from a tile, the recent rail or a single run, whatever its shape. Engine-path files record no
     rows and their tiles open by their width, as they always have.
   - A single Scale only run's two sentences - fixSaveSize ("It will save at 1280x1280 (...)") and the readout - say
     "its 8px blocks come out 10px" where the picture's pixels do not land on 1280 but its exact blocks do (1024 in
     8px blocks), instead of "pixels come out uneven", which the folder no longer says of the same file. Where some
     blocks hold a stray pixel (fixNativeBlock's tolerance), it says so: "(its 8px blocks come out 10px each, but stray
     pixels in N of them can come out uneven)" - "can be lost" for a picture wider than 1280, "the stray pixel in 1
     of them" for one - and the readout "..., stray pixels in N can be uneven" likewise, as the folder's stray clause
     says of the same file. (Square pictures: one that is not square is stretched at 1280, and its single run says
     "pixels come out uneven", as it always has; the folder gives it no stray clause, and the gate names "not
     square".)
   - tests/pixelsizestartsat16.spec.js pinned the off-grid label of a 96px picture drawn in 4px blocks as "1 at
     13.33px", its pixels on the canvas; it reads "1 at 53.33px" now, its blocks - superseded there with a note.
     tests/scaleonly.spec.js test 6 used a 32px picture for an off-grid clause; 32 cells land on 160 (40px blocks),
     so it is on the grid now, and the test uses a 128px picture (10px blocks) - superseded there with a note.
   A picture in blocks with a stray pixel in some, or in every one (fixNativeBlock's "one stray pixel a block", with
   no limit on how many blocks), is counted in its blocks, as the engine path counts it; the gate, which asks whether
   every 8px block is one colour, still holds it back for the strays, so the two clauses answer two questions. (The
   gate reads the source pixels each saved block is drawn from; above 1280 they include pixels the save drops, so it
   can name a stray the saved file does not hold - older than this patch, and left.) A picture with a sparse 1px pattern on a flat ground - a starfield - measures that way as the
   largest block, from 64 down, that divides its sides and holds at most one mark in every square: a 1280 starfield
   is on the 160 grid when that block is 16, 32, 40 or 64, and with marks 20 to 31px apart it measures 20px and reads
   "at 20px". Either way it opens on that grid, and only the gate names its marks. The count looks at the width
   only, as before.

   NOT CHANGED: the editor's Fix button in Scale only (24231-24238) keeps its own rule (the block it had, scaled, or
   measuredBlock); reopening a saved trait from the project uses measuredBlock, whose detector answers for pictures
   with no exact block. An engine-path tile of a result that is not square, saved at 1280, still opens by its width.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');

const doc = s0.start([
  ['function fixAlphaKeptWords(files,browser){', 'patch632 is not applied'],
  ['SUPERSEDED IN PART (patch633): "one other colour" above.', 'patch633 is not applied'],
]);
{
  const t = require('fs').readFileSync(s0.FILE, 'utf8');
  if (t.indexOf('function fixScaleCells(') >= 0) throw new Error('patch634 is already applied');
}

/* ---- the helper, beside the cached block measure it uses ---- */
doc.swap(
  [
    '  return fixNativeBlock(data,w,h);',
    '}',
  ],
  [
    '  return fixNativeBlock(data,w,h);',
    '}',
    '/* THE BLOCK A SCALE ONLY PICTURE IS DRAWN IN, AND ITS CELLS (patch634): its width over the',
    '   block it is drawn in, or its width when it has none. Scale only has no',
    '   engine to land on a count, and the width alone read a finished 1280 trait',
    '   in 8px blocks as 1280 cells - "not on the 160 cell grid (1 at 1px)" - and',
    '   opened it on a one-pixel grid. fixNativeBlock writes the page\'s one',
    '   noisy-block count; its readers read it straight after their own measure,',
    '   as this does (for the count it returns), so nothing else reads this one,',
    '   but it is put back as it was found, so this caller leaves no trace. */',
    'function fixScaleBlock(data,w,h){',
    '  const was=fixNativeNoisy;',
    '  const b=fixNativeBlockFor(data,w,h);',
    '  const noisy=fixNativeNoisy;',
    '  fixNativeNoisy=was;',
    '  return b>1 ? {block:b, noisy:noisy} : {block:1, noisy:0};',
    '}',
    '/* And noisy: how many of those blocks hold one stray pixel - a block found',
    '   only by that tolerance holds 1px marks. The sentences about whole blocks',
    '   (fixSaveSize, the readout) and the folder\'s stray clause name them: below',
    '   1280 a stray comes out one size or another by where in its block it sits,',
    '   above 1280 it is kept at one pixel or lost, by the same rule. */',
    'function fixScaleCells(data,w,h){ return w/fixScaleBlock(data,w,h).block; }',
  ]);

/* ---- the folder's record ---- */
doc.swap(
  [
    '      fixBatchFiles.push({name:fixZipName(rel,name),',
    '        rel:rel, sized:!!job.sized,',
    '        /* The count the engine landed on, kept so the run can say whether it',
    '           divides the canvas. w and h are the SAVED size and cannot answer',
    '           that: 1280 is 1280 whether its pixels are eight across or one. */',
    '        cells:out.width,',
  ],
  [
    '      /* patch634: in Scale only, the blocks the picture is drawn in. */',
    '      const scaleBlock=scale ? fixScaleBlock(out.data,out.width,out.height) : null;',
    '      const scaleCells=scaleBlock ? out.width/scaleBlock.block : 0;',
    '      fixBatchFiles.push({name:fixZipName(rel,name),',
    '        rel:rel, sized:!!job.sized,',
    '        /* The count the engine landed on, kept so the run can say whether it',
    '           divides the canvas. w and h are the SAVED size and cannot answer',
    '           that: 1280 is 1280 whether its pixels are eight across or one. */',
    '        /* patch634: and in Scale only, where no engine landed on one, the',
    '           blocks the picture is drawn in (fixScaleBlock) - not its width,',
    '           which counted pixels. The off-grid and uneven clauses, the tile',
    '           and the recent rail all read it. */',
    '        cells:scale ? scaleCells : out.width,',
    '        /* patch634: and its rows, in Scale only, so the tile can ask whether',
    '           the save kept its shape, as the single run\'s open does (fixOpenOne). */',
    '        rows:scale ? scaleCells*out.height/out.width : 0,',
    '        /* patch634: and whether, in Scale only, some blocks hold a stray',
    '           pixel on a square picture whose pixels do not land on the canvas:',
    '           narrower, the strays can come out uneven though the blocks land',
    '           ("uneven"); wider, they can be lost ("lost"). A clause of their',
    '           own says so, with how many, as the single run does (fixSaveSize,',
    '           square pictures too: one that is not square is stretched, and the',
    '           gate names it "not square"). */',
    '        strays:(scaleBlock&&scaleBlock.noisy>0&&out.width===out.height&&CANVAS_SIDE%out.width!==0) ? (out.width>CANVAS_SIDE?"lost":"uneven") : "",',
    '        strayCount:scaleBlock ? scaleBlock.noisy : 0,',
  ]);

/* ---- the recent rail carries the rows; a Scale only tile asks the shape question ---- */
doc.swap(
  [
    '  fixRecent.unshift({name:f.name, data:f.data, cells:f.cells,',
  ],
  [
    '  /* patch634: rows too, for fixOpenOne\'s shape question. */',
    '  fixRecent.unshift({name:f.name, data:f.data, cells:f.cells, rows:f.rows,',
  ]);
doc.swap(
  [
    '  adoptBlock(fixBlockFor(f.cells,W));',
  ],
  [
    '  /* patch634: a Scale only file records its rows, and opens at its block only',
    '     when the save kept its shape, as the single run\'s open asks (fixOpen): a',
    '     picture that is not square, saved at 1280, is stretched, and opens at 1.',
    '     Engine-path files record no rows and open by their width, as before. */',
    '  adoptBlock(f.rows>0&&W*f.rows!==H*f.cells ? 1 : fixBlockFor(f.cells,W));',
  ]);

/* ---- the single run's open ---- */
doc.swap(
  [
    '  adoptBlock(r.width===r.height ? fixBlockFor(r.width,W) : 1);',
    '}',
  ],
  [
    '  /* patch634: a Scale only result is the picture, one "cell" a pixel, so its',
    '     width gave block 1 - a finished 1280 trait in 8px blocks opened on a',
    '     one-pixel grid. Counted in its blocks, as a folder tile now is. And',
    '     asked whether the save keeps the result\'s shape rather than whether it',
    '     is square: with Save at 1280 off nothing is stretched, so a picture that',
    '     is not square has whole blocks too. (On the engine path the same answer',
    '     as before: 1 for a result that is not square.) */',
    '  adoptBlock(W*r.height===H*r.width ? fixBlockFor(r.consensus==="scaled" ? fixScaleCells(r.data,r.width,r.height) : r.width,W) : 1);',
    '}',
  ]);

/* ---- the comment the fix makes stale ---- */
doc.swap(
  [
    '     the "narrower than the N cells" clause. Scale only keeps it: nothing is',
    '     typed there, and its counts are the pictures\' own. */',
  ],
  [
    '     the "narrower than the N cells" clause. Scale only keeps it: nothing is',
    '     typed there, and its counts are the pictures\' own. */',
    '  /* SUPERSEDED IN PART (patch634): "its counts are the pictures\' own" counted',
    '     the pictures\' pixels, so every finished 1280 trait in Scale only was "not',
    '     on the 160 cell grid (1 at 1px)". It counts their blocks now',
    '     (fixScaleBlock). */',
  ]);

/* ---- a Scale only file whose blocks land but whose stray pixels may not: a clause of its own ---- */
doc.swap(
  [
    '  const movedNote = fixMovedLast',
  ],
  [
    '  /* patch634: A SCALE ONLY FILE WHOSE BLOCKS LAND BUT WHOSE STRAYS MAY NOT',
    '     (strays): its width in pixels does not land on the canvas, its blocks',
    '     do, and some blocks hold a stray pixel. Narrower than the canvas a stray',
    '     comes out one size or another by where in its block it sits; wider, it',
    '     is kept at one pixel or lost. Said as such, not as the uneven clause\'s',
    '     "pixel count", which its count in blocks is not; as the single run says',
    '     it (fixSaveSize). A file whose blocks do not land either is the uneven',
    '     clause\'s alone. */',
    '  const strayOf = k => gridOn ? fixBatchFiles.filter(f=>f.strays===k&&!(f.cells&&CANVAS_SIDE%f.cells!==0)) : [];',
    '  const strayWords = (fs,what) => { if(!fs.length) return "";',
    '    const s=fs.reduce((a,f)=>a+(f.strayCount||0),0);',
    '    return " \\u00b7 "+fs.length+(fs.length===1?" has ":" have ")+(s===1',
    '      ? "a stray pixel in a block that lands on "+CANVAS_SIDE+"; it can "',
    '      : s.toLocaleString()+" stray pixels in blocks that land on "+CANVAS_SIDE+"; the strays can ")+what; };',
    '  const strayNote = strayWords(strayOf("uneven"),"come out uneven")+strayWords(strayOf("lost"),"be lost");',
    '  const movedNote = fixMovedLast',
  ]);
doc.swap('+raggedNote+smallNote+', '+raggedNote+strayNote+smallNote+');

/* ---- in Scale only, off the grid means its blocks do not land on the grid's cells ---- */
doc.swap(
  [
    '  const offGrid = gridOn ? fixBatchFiles.filter(f=>!f.sized&&f.cells&&f.cells!==fixGridCells().cells) : [];',
  ],
  [
    '  /* patch634: IN SCALE ONLY, WHETHER ITS BLOCKS LAND ON THE GRID\'S CELLS. Nothing',
    '     is cut there, so a picture counted in its blocks (fixScaleBlock) is on the',
    '     grid when the grid\'s count is a whole multiple of its own - 16px art, 80',
    '     cells, sits on the 160 grid, as the gate says - not only when the two',
    '     counts are equal. The engine path keeps the count test: there the clause',
    '     informs the default size, and says "type 8 to force it". */',
    '  const offGrid = gridOn ? fixBatchFiles.filter(f=>!f.sized&&f.cells&&(scale ? fixGridCells().cells%f.cells!==0 : f.cells!==fixGridCells().cells)) : [];',
  ]);

/* ---- a single Scale only run: its blocks, where its pixels do not land but they do ---- */
doc.swap(
  [
    '  const k=CANVAS_SIDE/r.width;',
    '  return "It will save at "+CANVAS_SIDE+"\\u00d7"+CANVAS_SIDE',
    '    +(r.width===r.height&&Number.isInteger(k)',
    '      ? " ("+"\\u00d7"+k+", every pixel the same size)."',
    '      : " (pixels come out uneven at this size).");',
  ],
  [
    '  const k=CANVAS_SIDE/r.width;',
    '  /* patch634: a Scale only picture whose pixels do not land on the canvas but',
    '     whose blocks do - 1024 in 8px blocks, 10px each - says so, as the folder',
    '     (which counts its blocks) no longer calls it uneven. Where some blocks hold',
    '     a stray pixel (a block found by tolerating one), that is said too: below',
    '     1280 a stray comes out one size or another by where in its block it',
    '     sits, above it a stray is kept at one pixel or lost - as the folder\'s',
    '     stray clause says of the same file. */',
    '  const sb=(r.consensus==="scaled"&&r.width===r.height&&!Number.isInteger(k))',
    '    ? (m=>({block:m.block, noisy:m.noisy, k:CANVAS_SIDE*m.block/r.width}))(fixScaleBlock(r.data,r.width,r.height)) : null;',
    '  return "It will save at "+CANVAS_SIDE+"\\u00d7"+CANVAS_SIDE',
    '    +(r.width===r.height&&Number.isInteger(k)',
    '      ? " ("+"\\u00d7"+k+", every pixel the same size)."',
    '      : sb&&sb.block>1&&Number.isInteger(sb.k)',
    '      ? " (its "+sb.block+"px blocks come out "+sb.k+"px each"',
    '        +(sb.noisy ? ", but "+(sb.noisy===1?"the stray pixel in 1 of them":"stray pixels in "+sb.noisy.toLocaleString()+" of them")+" can "+(r.width>CANVAS_SIDE?"be lost":"come out uneven") : "")+")."',
    '      : " (pixels come out uneven at this size).");',
  ]);
doc.swap(
  [
    '    const k=CANVAS_SIDE/cols;',
    '    note = (cols===rows && Number.isInteger(k))',
    '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
  ],
  [
    '    const k=CANVAS_SIDE/cols;',
    '    /* patch634: and in Scale only, its blocks where they land and its pixels do',
    '       not, as fixSaveSize says, with its stray pixels where some blocks hold',
    '       one (uneven below 1280, lost above). nat is the block measured above,',
    '       FIX.nativeNoisy its count of blocks holding a stray pixel. */',
    '    const kb=(scale&&cols===rows&&!Number.isInteger(k)&&nat>1) ? CANVAS_SIDE*nat/W : 0;',
    '    note = (cols===rows && Number.isInteger(k))',
    '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
    '      : Number.isInteger(kb)&&kb>0',
    '      ? " \\u00b7 its "+nat+"px blocks come out "+kb+"px on "+CANVAS_SIDE',
    '        +(FIX.nativeNoisy>0 ? ", "+(FIX.nativeNoisy===1?"the stray pixel in 1":"stray pixels in "+FIX.nativeNoisy.toLocaleString())+" can "+(W>CANVAS_SIDE?"be lost":"be uneven") : "")',
  ]);

doc.finish(({ text, must }) => {
  must('function fixScaleBlock(data,w,h){', 'the block helper');
  must('function fixScaleCells(data,w,h){ return w/fixScaleBlock(data,w,h).block; }', 'the cells helper');
  must('        rows:scale ? scaleCells*out.height/out.width : 0,', 'the rows');
  must('        strays:(scaleBlock&&scaleBlock.noisy>0&&out.width===out.height&&CANVAS_SIDE%out.width!==0) ? (out.width>CANVAS_SIDE?"lost":"uneven") : "",', 'the strays');
  must('        strayCount:scaleBlock ? scaleBlock.noisy : 0,', 'the stray count');
  must('  const strayOf = k => gridOn ? fixBatchFiles.filter(f=>f.strays===k&&!(f.cells&&CANVAS_SIDE%f.cells!==0)) : [];', 'the stray files');
  must('    const s=fs.reduce((a,f)=>a+(f.strayCount||0),0);', 'the strays counted');
  must('  const strayNote = strayWords(strayOf("uneven"),"come out uneven")+strayWords(strayOf("lost"),"be lost");', 'the stray clause');
  must('+raggedNote+strayNote+smallNote+', 'the stray clause said');
  must('  const ragged = gridOn ? fixBatchFiles.filter(f=>f.cells&&CANVAS_SIDE%f.cells!==0).length : 0;', 'the uneven clause as it was');
  must('  fixRecent.unshift({name:f.name, data:f.data, cells:f.cells, rows:f.rows,', 'the rail carries rows');
  must('  adoptBlock(f.rows>0&&W*f.rows!==H*f.cells ? 1 : fixBlockFor(f.cells,W));', 'the tile shape question');
  must('" can "+(W>CANVAS_SIDE?"be lost":"be uneven") : "")', 'the readout names strays');
  must('" can "+(r.width>CANVAS_SIDE?"be lost":"come out uneven") : "")+")."', 'the save sentence names strays');
  must('  fixNativeNoisy=was;', 'the noisy count put back');
  must('        cells:scale ? scaleCells : out.width,', 'the folder record');
  must('adoptBlock(W*r.height===H*r.width ? fixBlockFor(r.consensus==="scaled" ? fixScaleCells(r.data,r.width,r.height) : r.width,W) : 1);', 'the single run open');
  must('  const offGrid = gridOn ? fixBatchFiles.filter(f=>!f.sized&&f.cells&&(scale ? fixGridCells().cells%f.cells!==0 : f.cells!==fixGridCells().cells)) : [];', 'the off-grid test');
  must('" (its "+sb.block+"px blocks come out "+sb.k+"px each"', 'the save sentence');
  must('" \\u00b7 its "+nat+"px blocks come out "+kb+"px on "+CANVAS_SIDE', 'the readout');
  if (text.split('SUPERSEDED IN PART (patch634): "its counts are the pictures\' own" counted').length !== 2) throw new Error('the supersede note is not in the page exactly once');
  if (text.split('cells:out.width,').length !== 1) throw new Error('an unpatched cells:out.width is left');
});
