/* THE DIRTY TEST COUNTED UNDO STEPS AND CALLED THAT "UNCHANGED".

   autosaveNow refused to write a draft when

     if(of && undoStack.length===savedDepth) return Promise.resolve(true);

   and the comment above it justifies exactly one case: a FRESH OPEN, where
   startEditor empties the stack and sets savedDepth=0, so "non-empty" really
   does mean "edited since this was opened". That reasoning is sound and it is
   the only reasoning there. saveTrait then moved savedDepth to
   undoStack.length (5217), which puts the same equality in front of a
   situation it was never argued for - and undoStack.length is not an edit
   counter in either direction:

   IT GOES DOWN. Press undo and the stack shrinks. Draw one replacement stroke
   and snapshot() puts it back. Save at depth d, undo, redraw: depth d again,
   equal to savedDepth, canvas nothing like the record.

   AND IT STOPS GOING UP. snapshot() trims - `if(undoStack.length>60)` and the
   192 MiB budget below it. Past saturation every stroke pushes one and shifts
   one, so the length is a CONSTANT. The comment on HISTORY_BYTES says this is
   30 steps at 1280, and this collection's traits are 1280. Save on a saturated
   stack and every later stroke leaves the length exactly where it was: the
   draft is never written again for the rest of that trait's session.

   Both routes end the same way. The early return skips the dbPut whose
   rejection handler owns "Could not save your work to this browser", so
   nothing is said; saveTrait has already deleted this trait's draft keys
   (5209-5211), so there is no older draft underneath; and the undo stack that
   held the work dies with the page. Measured in Chromium: draw, Save, undo,
   redraw, reopen -> the saved pixels, no draft bar. Draw 60+, Save, keep
   drawing, reload -> no autosave row at all.

   SO THE GUARD ASKS THE QUESTION IT WAS ALWAYS TRYING TO ASK: are the pixels
   different from the ones that were saved? That is answered from the canvas
   rather than from bookkeeping, which is also why the counter is gone rather
   than repaired. A counter is only ever as good as every mutation remembering
   to snapshot; a signature of the pixels is right even when one does not.

   COST: one getImageData and one pass over the words, about 8 ms at 1280,
   against a debounce of 1500 ms - and it runs INSTEAD OF a full PNG encode of
   the same canvas, which is the expensive thing it exists to skip.

   Two hashes, not one. A single 32-bit hash collides about once in four
   billion, and a collision here means a draft silently not written, which is
   the exact defect being fixed. Two independent ones make that 1 in 1.8e19. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. what the canvas looked like when it became the record ---- */
{
  const at = kit.only(L, l => l === 'let savedDepth=0;', 'the saved-depth state');
  if (L[at - 4] !== '/* The undo depth the canvas was last SAVED at. Not "was it edited" - saving')
    throw new Error('the saved-depth note is not where this expects it');
  kit.replace(L, { start: at - 4, end: at }, [
    '/* WHAT THE CANVAS LOOKED LIKE WHEN IT LAST BECAME THE RECORD - on open,',
    '   and on save. Compared against the pixels that are there now, which is',
    '   the question autosaveNow needs answered before it decides a draft is',
    '   not worth writing.',
    '',
    '   SUPERSEDES savedDepth, the undo depth at the last save. The note here',
    '   used to explain that saving does not empty the undo stack, which is',
    '   true, and then the depth was used as a stand-in for "edited", which it',
    '   is not: undo makes it smaller, and snapshot() caps it, so past the cap',
    '   it stops changing at all. Both put the canvas somewhere the record is',
    '   not while the number said otherwise. */',
    'let savedSig="";',
  ]);
}
{
  const anchor = kit.only(L, l => l === 'function snapshot(){', 'the snapshot function');
  kit.replace(L, { start: anchor, end: anchor - 1 }, [
    '/* A cheap, whole-canvas signature. Two FNV-1a states with different',
    '   starting points and different multipliers, so a collision needs both to',
    '   collide at once.',
    '',
    '   THE SIZE RIDES ON THE RETURNED STRING, not in the hash. 16x16 and 256x1',
    '   hold the same words in the same order, so the two states collide -',
    '   measured, both come out avkz45:10p20n - and only the prefix tells them',
    '   apart. A first version also folded w and h into the states; the same',
    '   measurement showed that did nothing the prefix was not already doing, so',
    '   it is gone rather than left in looking load-bearing.',
    '',
    '   Read as words rather than bytes: a quarter of the iterations for the',
    '   same coverage, and the alignment holds because an ImageData buffer is',
    '   always a whole number of four-byte pixels. */',
    'function canvasSig(){',
    '  if(!ctx||!art) return "";',
    '  const w=art.width, h=art.height;',
    '  const d=new Uint32Array(ctx.getImageData(0,0,w,h).data.buffer);',
    '  let a=2166136261>>>0, b=2246822519>>>0;',
    '  for(let i=0;i<d.length;i++){',
    '    const v=d[i];',
    '    a=Math.imul(a^v,16777619)>>>0;',
    '    b=Math.imul(b^v,2654435761)>>>0;',
    '  }',
    '  return w+"x"+h+":"+a.toString(36)+":"+b.toString(36);',
    '}',
    '/* THE CANVAS IS NOW THE RECORD. Both moments that can make that true say',
    '   so through here, so there is one definition of it rather than two. */',
    'function markCanvasSaved(){ savedSig=canvasSig(); }',
    '',
  ]);
}

/* ---- 2. the two moments the canvas becomes the record ---- */
{
  const fn = kit.inFunction(L, 'function startEditor(data,w,h,srcW,srcH,pal,recovered){');
  const at = kit.only(L, l => l === '  savedDepth=0;', 'the fresh-open marker', fn);
  if (L[at - 1] !== '  /* A freshly opened canvas is the record it came from. */')
    throw new Error('the fresh-open marker is not where this expects it');
  kit.replace(L, { start: at, end: at }, [
    '  markCanvasSaved();',
  ]);
}
{
  const at = kit.only(L, l => l === '    savedDepth=undoStack.length;', 'the post-save marker');
  kit.replace(L, { start: at, end: at }, [
    '    markCanvasSaved();',
  ]);
}

/* ---- 3. and the guard reads the pixels ---- */
{
  const at = kit.only(L, l => l === '  if(of && undoStack.length===savedDepth) return Promise.resolve(true);',
    'the autosave dirty test');
  kit.replace(L, { start: at, end: at }, [
    '  /* SUPERSEDED: this was `undoStack.length===savedDepth`. See the note on',
    '     savedSig - the depth goes down on undo and stops going up once the',
    '     stack saturates, so after a save the equality stopped meaning',
    '     "unchanged" and the draft was silently skipped. */',
    '  if(of && canvasSig()===savedSig) return Promise.resolve(true);',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');
  /* THE OLD TEST IS GONE EVERYWHERE, not just at the one line. */
  if (/savedDepth/.test(code))
    throw new Error('the undo-depth dirty test is still somewhere in the file');
  /* AND THE NEW ONE IS SET AT BOTH MOMENTS. Either alone leaves half the
     defect: only-on-open and every save re-arms it; only-on-save and a fresh
     open drafts a copy of the record it just came from. */
  if ((code.match(/markCanvasSaved\(\);/g) || []).length !== 2)
    throw new Error('the canvas-is-the-record marker is not set at both moments');
  const se = kit.inFunction(codeLines, 'function startEditor(data,w,h,srcW,srcH,pal,recovered){');
  if (!/markCanvasSaved\(\);/.test(codeLines.slice(se.start, se.end + 1).join('\n')))
    throw new Error('a freshly opened canvas is not marked as the record');
  const st = kit.inFunction(codeLines, 'async function saveTrait(){');
  if (!/markCanvasSaved\(\);/.test(codeLines.slice(st.start, st.end + 1).join('\n')))
    throw new Error('a saved canvas is not marked as the record');
  /* THE GUARD READS THE PIXELS. */
  const an = kit.inFunction(codeLines, 'function autosaveNow(){');
  const anb = codeLines.slice(an.start, an.end + 1).join('\n');
  if (!/if\(of && canvasSig\(\)===savedSig\) return Promise\.resolve\(true\);/.test(anb))
    throw new Error('the autosave guard does not compare the pixels');
  /* THE SIZE RIDES ON THE RETURNED STRING, and the check has to be on the
     thing that actually separates two canvases. Measured: the two hash states
     collide for 16x16 and 256x1 - both avkz45:10p20n - so folding w and h into
     them as well is refused rather than kept as harmless belt and braces. A
     check on an inert line reads exactly like a check on a live one. */
  const cs = kit.inFunction(codeLines, 'function canvasSig(){');
  const csb = codeLines.slice(cs.start, cs.end + 1).join('\n');
  if (/Math\.imul\(a\^w,/.test(csb) || /Math\.imul\(a\^h,/.test(csb))
    throw new Error('the size is folded into the hash, where it does nothing');
  /* Two independent states, because one 32-bit collision is a draft silently
     not written - the defect being fixed. */
  if (!/let a=2166136261>>>0, b=2246822519>>>0;/.test(csb))
    throw new Error('the signature is a single hash again');
  if (!/return w\+"x"\+h\+":"\+a\.toString\(36\)\+":"\+b\.toString\(36\);/.test(csb))
    throw new Error('the signature does not carry both states');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
