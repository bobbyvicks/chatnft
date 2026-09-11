/* THE READOUT WAS DESCRIBING A RUN THAT DOES NOT HAPPEN.

   Measured on glasses/Dark Lens Sunglasses, which is drawn in 5px blocks:

     Snap on, box 0    readout "160x160 pixels, x8 to 1280"   run gives 256
     Snap on, box 4    readout "160x160 pixels, x8 to 1280"   run gives 320
     Snap off, box 4   readout "320x320 pixels, x4 to 1280"   run gives 320

   The first of those has been wrong since patch416: the readout says the
   snapped count is the declared grid "whatever the source measures - that is
   the whole point of it", and measuring the source is exactly what the run
   started doing. The second is wrong because of patch430. Both are the same
   defect - the readout worked the answer out for itself, so it drifted the
   moment the run's rule changed, twice, silently.

   THE READOUT ASKS THE RUN NOW. fixStepFor is the one place that decides a
   step, so the hint calls it and divides. It cannot describe a different
   answer than the one about to be produced, because it is no longer a second
   opinion about anything.

   THAT COSTS A MEASUREMENT, and the hint runs on every keystroke in the box:
   fixNativeBlock is a median of 39ms and 664ms on the worst file in the set,
   which is fine once when a trait opens and is not fine per keystroke. So the
   picture is measured ONCE, when it is loaded, and both the hint and the run
   read that for the picture that is loaded. A batch hands over its own pixels
   and is measured per file exactly as before - the cache is keyed on being
   the very array FIX.src holds, not on being the same size. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- measure the loaded picture once ------------------------------- */
{
  const at = kit.only(L, l => l === '  FIX.src={data:sd, width:sw, height:sh};',
    'where the single tab records its picture');
  kit.replace(L, { start: at, end: at }, [
    '  FIX.src={data:sd, width:sw, height:sh};',
    '  /* MEASURED ONCE, HERE. Both the run and the readout want the block',
    '     size, the readout wants it on every keystroke, and measuring costs a',
    '     median 39ms and 664ms on the worst file in the collection. */',
    '  FIX.native=fixNativeBlock(sd,sw,sh);',
  ]);
}

/* ---- and read it back where it is the same picture ----------------- */
{
  const at = kit.only(L, l => l === 'function fixStepFor(w,data,h){', 'the step decider');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* The measured block, from the cache when this is the picture the single',
    '   tab has loaded and by measuring when it is not.',
    '',
    '   KEYED ON BEING THE VERY ARRAY, not on matching its size: a batch hands',
    '   over its own pixels, and a cache that matched on width would hand a',
    '   1280 file in a folder run the block size of whatever was loaded in the',
    '   other tab. */',
    'function fixNativeBlockFor(data,w,h){',
    '  if(data&&FIX.src&&data===FIX.src.data&&typeof FIX.native==="number")',
    '    return FIX.native;',
    '  return fixNativeBlock(data,w,h);',
    '}',
  ]);
  const r = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const nat = kit.only(L, l => l === '    const nat=px?fixNativeBlock(px,w,ph):0;',
    'where the step measures the picture', r);
  kit.replace(L, { start: nat, end: nat }, [
    '    const nat=px?fixNativeBlockFor(px,w,ph):0;',
  ]);
}

/* ---- the readout asks the run ------------------------------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    'where the readout works the count out', r);
  if (!/const moved=\(!scale&&!snap&&gridOn&&step>0\)\?fixWholeStep/.test(L[at + 1]))
    throw new Error('the readout is not shaped the way this expects');
  if (L[at + 2].indexOf('  const cols=scale?FIX.src.width:(snap?g.cells:(moved?moved.cols') !== 0)
    throw new Error('the count is not worked out where this expects');
  kit.replace(L, { start: at, end: at + 5 }, [
    '  const gridOn=$("fixgrid")&&$("fixgrid").checked;',
    '  /* ASKED, NOT WORKED OUT AGAIN. This used to decide for itself that a',
    '     snapped run lands on the declared grid "whatever the source',
    '     measures", and then the run started measuring the source - so the',
    '     line said 160 on a picture about to come out at 256. A readout that',
    '     describes a different answer than the one about to be produced is',
    '     worse than no readout, and the only way it can be right for good is',
    '     to stop being a second opinion. fixStepFor sets fixMoved as a side',
    '     effect, which is where the moved-size note below comes from. */',
    '  fixMoved=null;',
    '  const decided=scale?0:fixStepFor(FIX.src.width,FIX.src.data,FIX.src.height);',
    '  const moved=fixMoved;',
    '  const cols=scale?FIX.src.width',
    '    :(decided>0?Math.max(1,Math.round(FIX.src.width/decided)):g.cells);',
    '  const rows=scale?FIX.src.height',
    '    :(decided>0?Math.max(1,Math.round(FIX.src.height/decided)):g.cells);',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  /* THE READOUT AND THE RUN COME FROM ONE PLACE. */
  const sh = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const hb = codeLines.slice(sh.start, sh.end + 1).join('\n');
  if (!/const decided=scale\?0:fixStepFor\(FIX\.src\.width,FIX\.src\.data,FIX\.src\.height\);/.test(hb))
    throw new Error('the readout still works the answer out for itself');
  if (/const cols=scale\?FIX\.src\.width:\(snap\?g\.cells/.test(hb))
    throw new Error('the readout still says the snapped count is the declared grid');
  /* AND THE MOVED NOTE STILL HAS SOMETHING TO READ. */
  if (!/const moved=fixMoved;/.test(hb))
    throw new Error('the moved-size note lost its source');

  /* THE MEASUREMENT IS CACHED, AND KEYED ON IDENTITY. Keyed on width, a
     folder run would take the block size of whatever the other tab holds. */
  const nb = kit.inFunction(codeLines, 'function fixNativeBlockFor(data,w,h){');
  const nbb = codeLines.slice(nb.start, nb.end + 1).join('\n');
  if (!/data===FIX\.src\.data/.test(nbb))
    throw new Error('the cache is not keyed on being the same pixels');
  if (/data\.length===|w===FIX\.src\.width/.test(nbb))
    throw new Error('the cache matches on size, so a batch would read the wrong block');
  if (!/return fixNativeBlock\(data,w,h\);/.test(nbb))
    throw new Error('a picture that is not the loaded one is never measured');
  /* And the loaded picture really is measured when it arrives. */
  const fl = kit.inFunction(codeLines, 'async function fixLoad(file){');
  if (!/FIX\.native=fixNativeBlock\(sd,sw,sh\);/
    .test(codeLines.slice(fl.start, fl.end + 1).join('\n')))
    throw new Error('nothing fills the cache, so it is always a miss');
  /* The step decider reads it. */
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  if (!/const nat=px\?fixNativeBlockFor\(px,w,ph\):0;/
    .test(codeLines.slice(sf.start, sf.end + 1).join('\n')))
    throw new Error('the run does not use the cache, so the readout is slow for nothing');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
