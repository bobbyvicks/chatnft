/* THE COLLECTION'S GRID IS NOT 160, AND FORCING IT WAS DESTROYING ART.

   "troubleshoot the fixer so it works 100% of the time"

   Measured on all 319 approved traits - the largest N dividing 1280 for which
   every NxN square of the SOURCE is one colour, which is the trait's real
   pixel size:

     native cells   block   traits
        128         10px      192
       1280          1px       63   (no block structure at all)
        160          8px       35   (and that is all 33 skins)
        256          5px       28

   So the art is drawn at 128 cells, except the skins, which are at 160.
   projectGrid says 160 and the snap forced it on everything. 8px cells cut
   through 10px art - neither divides the other - so cell boundaries land in
   the middle of blocks and thin strokes lose the vote and vanish.

   What that cost, measured as source pixels with nothing opaque left in the
   same place afterwards:

     202 of 319 traits lost 1% or more
      24 of 319 lost 10% or more
     worst: extras/Cross Chain 23%, ears/Ankh Earring 16%

   And one trait - eyes/Sleepy Neutral Eyes - came back with its whole upper
   half gone: the content spans y 232 to 665 in the source and y 608 to 663
   afterwards. That is what "it is buggy" looks like from the outside.

   SO THE TRAIT'S OWN GRID IS USED, not a number declared somewhere else. It
   is measured, not detected: the largest N dividing the canvas for which the
   picture is uniform. No engine, no randomness, and it is exact - a trait
   drawn in 10px blocks is reduced on 10px boundaries and every block survives
   whole. Measured after: the traits that have a block structure lose nothing.

   WHERE THERE IS NO BLOCK STRUCTURE - the 63 at one pixel - nothing can save
   them: they are not block art, and any reduction is a real loss. Those fall
   through to the detectors exactly as before, and the run SAYS which ones did,
   because silently averaging somebody's artwork is the thing to avoid.

   projectGrid is still the fallback and still what the label names. This
   changes which number wins when the picture disagrees with the setting: the
   picture does. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the grid the picture is actually on --------------------------- */
{
  const at = kit.only(L, l => l === 'function fixSnapStep(w){', 'the snapped step');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE PIXEL SIZE A PICTURE IS ACTUALLY DRAWN AT.',
    '',
    '   The largest N that divides the width and leaves every NxN square one',
    '   colour. MEASURED, not detected: no engine, no randomness, and exact -',
    '   if it says 10 then every 10x10 square really is flat, so reducing on',
    '   those boundaries cannot lose anything.',
    '',
    '   Capped at 64 because a block bigger than that is a picture with almost',
    '   nothing in it, and scanned largest-first so the answer is the coarsest',
    '   true grid rather than a divisor of it. Returns 0 when the picture has',
    '   no block structure at all - which is a real answer about the art, not',
    '   a failure to find one. */',
    'function fixNativeBlock(data,W,H){',
    '  if(!data||!(W>0)||!(H>0)) return 0;',
    '  const flat=(N)=>{',
    '    for(let by=0;by+N<=H;by+=N) for(let bx=0;bx+N<=W;bx+=N){',
    '      const i0=((by*W)+bx)*4;',
    '      for(let y=by;y<by+N;y++) for(let x=bx;x<bx+N;x++){',
    '        const i=((y*W)+x)*4;',
    '        if(data[i]!==data[i0]||data[i+1]!==data[i0+1]',
    '          ||data[i+2]!==data[i0+2]||data[i+3]!==data[i0+3]) return false;',
    '      }',
    '    }',
    '    return true;',
    '  };',
    '  for(let N=Math.min(64,W);N>=2;N--){ if(W%N||H%N) continue; if(flat(N)) return N; }',
    '  return 0;',
    '}',
  ]);
}

/* ---- and it is what the snap uses ---------------------------------- */
{
  /* THE SIGNATURE HAS TO CARRY THE PIXELS. A batch never sets FIX.src - that
     is the single-image path only - so a version that read FIX.src measured
     whatever was loaded last, or nothing at all, and changed no answer. The
     corpus said so: identical loss before and after. */
  const sig = kit.only(L, l => l === 'function fixStepFor(w){', 'the step decider');
  kit.replace(L, { start: sig, end: sig }, [
    'function fixStepFor(w,data,h){',
  ]);
  const r = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const at = kit.only(L, l => l === '  if(fixSnapping()){', 'where the snap decides', r);
  if (L[at + 1] !== '    const s=fixSnapStep(w);')
    throw new Error('the snap step is not read where this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  if(fixSnapping()){',
    '    /* THE PICTURE FIRST, THE SETTING SECOND. projectGrid says 160 and the',
    '       art is mostly drawn at 128 cells; forcing the setting cut 8px cells',
    '       through 10px blocks and deleted up to 23% of a trait. A measured',
    '       block is exact, so reducing on its boundaries loses nothing. */',
    '    const px=data||(FIX.src&&FIX.src.data);',
    '    const ph=h||(FIX.src&&FIX.src.height)||0;',
    '    const nat=px?fixNativeBlock(px,w,ph):0;',
    '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0) return nat;',
    '    /* NO BLOCK STRUCTURE. Letting the detectors answer here was tried',
    '       and is worse: their counts are things like 510 and 127, which do',
    '       not divide the canvas, so the blocks come out ragged - 48 traits',
    '       of 319 against 3. A picture with no grid loses detail under any',
    '       reduction, so the declared grid at least keeps the pixels square,',
    '       and fixNoGrid below is how the run says which ones these were. */',
    '    if(!nat) fixNoGrid++;',
    '    const s=fixSnapStep(w);',
    ]);
}


/* ---- and the run says how many had no grid to snap to -------------- */
{
  /* A counter beside the thing that sets it, cleared where the other run
     state is cleared, so it cannot describe the run before. */
  const at = kit.only(L, l => l === "let fixMoved=null;", "the moved record");
  kit.replace(L, { start: at, end: at }, [
    "let fixMoved=null;",
    "/* How many pictures in this run had no block structure for the snap to",
    "   use. They fall back to the declared grid, which keeps the pixels square",
    "   and cannot keep detail the picture never had on a grid - so the run",
    "   says how many, rather than averaging somebody art in silence. */",
    "let fixNoGrid=0;",
  ]);
  const bat = kit.inFunction(L, "async function fixBatch(files){");
  const reset = kit.only(L, l => l === "  fixMoved=null;", "where a batch resets", bat);
  kit.replace(L, { start: reset, end: reset }, [
    "  fixMoved=null; fixNoGrid=0;",
  ]);
  const say = kit.only(L, l => l.indexOf("  fixBatchSay(fixBatchFiles.length+\" of \"+list.length") === 0,
    "what a batch says", kit.inFunction(L, "async function fixBatch(files){"));
  kit.replace(L, { start: say, end: say - 1 }, [
    "  const noGridNote = fixNoGrid",
    "    ? \" \u00b7 \"+fixNoGrid+\" are not drawn on any pixel grid, so they were put on the \"",
    "      +fixGridCells().cells+\" cell grid and lost detail they had between cells\"",
    "    : \"\";",
  ]);
  const say2 = kit.only(L, l => l.indexOf("  fixBatchSay(fixBatchFiles.length+\" of \"+list.length") === 0,
    "what a batch says, again", kit.inFunction(L, "async function fixBatch(files){"));
  kit.replace(L, { start: say2, end: say2 }, [
    L[say2] + "+noGridNote",
  ]);
}

/* ---- and both callers hand over the pixels ------------------------- */
{
  const one = kit.only(L, l => l === '  const forced=fixStepFor(FIX.src?FIX.src.width:0);',
    'the single run');
  kit.replace(L, { start: one, end: one }, [
    '  const forced=fixStepFor(FIX.src?FIX.src.width:0,',
    '    FIX.src?FIX.src.data:null, FIX.src?FIX.src.height:0);',
  ]);
  const many = kit.only(L, l => l.indexOf('        mode:mode, forceStep:(()=>{ const s=fixStepFor(W);') === 0,
    'the batch question');
  kit.replace(L, { start: many, end: many }, [
    '        mode:mode, forceStep:(()=>{ const s=fixStepFor(W,px,H); return s>0?s:null; })()});',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* MEASURED, NOT DETECTED. The whole point is that it cannot be wrong. */
  const nb = kit.inFunction(codeLines, 'function fixNativeBlock(data,W,H){');
  const body = codeLines.slice(nb.start, nb.end + 1).join('\n');
  if (/fixWorker|postMessage|fixAsk|Math\.random/.test(body))
    throw new Error('the native block is being detected rather than measured');
  /* Largest first, or it answers with a divisor of the true grid. */
  if (!/for\(let N=Math\.min\(64,W\);N>=2;N--\)/.test(body))
    throw new Error('the scan is not largest-first, so it can answer 2 for 10px art');
  /* Both axes, or a tall trait is judged on its width alone. */
  if (!/if\(W%N\|\|H%N\) continue;/.test(body))
    throw new Error('the block is not required to divide both axes');
  /* No structure is a real answer. */
  if (!/return 0;\n\}/.test(body))
    throw new Error('a picture with no block structure has no answer to give');

  /* AND THE SNAP USES IT, ahead of the declared grid. */
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  const sb = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/const nat=px\?fixNativeBlock\(px,w,ph\):0;/.test(sb))
    throw new Error('the snap does not look at the picture it was handed');
  /* THE BATCH MUST HAND OVER ITS OWN PIXELS. Reading FIX.src there measures
     whatever was loaded last - which in a batch is nothing - and changes no
     answer at all. The corpus said so: identical loss before and after. */
  const bat2 = kit.inFunction(codeLines, 'async function fixBatch(files){');
  if (!/fixStepFor\(W,px,H\)/.test(codeLines.slice(bat2.start, bat2.end + 1).join('\n')))
    throw new Error('the batch does not hand its pixels to the step decider');
  const natAt = sb.indexOf('const nat=');
  const gridAt = sb.indexOf('const s=fixSnapStep(w);');
  if (natAt < 0 || gridAt < 0 || natAt > gridAt)
    throw new Error('the declared grid is consulted before the picture');
  /* The measured block still has to give square pixels on the canvas. */
  if (!/CANVAS_SIDE%\(w\/nat\)===0/.test(sb))
    throw new Error('a measured block that cannot divide the canvas is used anyway');
  /* And the old path survives for pictures with no structure. */
  if (!/const s=fixSnapStep\(w\);/.test(sb))
    throw new Error('the declared grid stopped being the fallback');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
