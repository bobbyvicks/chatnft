/* THE PALETTE STEP RUNS IN THE WORKER, BESIDE THE ENGINE.

   Found 2026-09-22 by the discovery pass, ranked twenty-second of 39. The
   fixer's engine runs in a Worker, but Change colours to palette ran on
   the page after it, per file, in one synchronous task. A folder run over
   the collection froze the page 14 times for 1.5-8 s, all on photographic
   backgrounds, and a Stop pressed during one was not even registered until
   it ended (7.6 s measured). Patch553 made the step itself far cheaper -
   88 s over the 50 past the old cap, down from 394 - but its worst case is
   still 14 s on R Place Mosaic, which is a frozen page.

   The worker now runs snapToPalette on the engine's result before it hands
   it back, from the page's own text of snapToPalette, labOf and deltaE2000
   - one implementation, not a copy - with the palette the page would have
   used sent in the message. The page only tallies the answer. Scale-only
   runs, which ask no worker, still snap on the page as before. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- the worker ---------------------------------------------------------- */
{
  const fnR = () => kit.inFunction(L, 'function fixWorker(){');
  swap('    "    postMessage({done:{cols:r.cols,rows:r.rows,stepX:r.stepX,stepY:r.stepY,consensus:r.consensus,",', [
    '    /* The palette step, in the worker rather than on the page - see',
    '       patch567. m.palette is the page\'s palette, or null when it is off. */',
    '    "    let pal=null;",',
    '    "    if(m.palette){ paletteRGB=function(){ return m.palette; }; pal=snapToPalette(r.data,r.width*r.height); }",',
    '    "    postMessage({done:{cols:r.cols,rows:r.rows,stepX:r.stepX,stepY:r.stepY,consensus:r.consensus,pal:pal,",',
  ], 'the done message', fnR());
  swap('  const url=URL.createObjectURL(new Blob([el.textContent,"\\n",glue],{type:"text/javascript"}));', [
    '  /* THE PAGE\'S OWN PALETTE STEP, carried as its text, so the worker runs',
    '     exactly what the page would. paletteRGB is the one thing it reads',
    '     from the page\'s state; the message carries its answer. */',
    '  const snap=["let paletteRGB=function(){ return []; };",',
    '    "const SNAP_GROUP_DE="+SNAP_GROUP_DE+";",',
    '    labOf.toString(), deltaE2000.toString(), snapToPalette.toString()].join("\\n");',
    '  const url=URL.createObjectURL(new Blob([el.textContent,"\\n",snap,"\\n",glue],{type:"text/javascript"}));',
  ], 'the worker source', fnR());
}

/* ---- the tally, for an answer the worker already worked out ------------- */
{
  const fn = kit.inFunction(L, 'function fixPalApply(out,rel){');
  swap('  const r=snapToPalette(out.data,out.width*out.height);', [
    '  /* Worked out in the worker, beside the engine, when it was asked there. */',
    '  const r=(out.pal!==undefined && out.pal!==null) ? out.pal : snapToPalette(out.data,out.width*out.height);',
  ], 'the snap', fn);
}
/* ---- asking for it: the single run and the folder run --------------------- */
swap('    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null},[copy.buffer]);', [
  '    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null,',
  '      palette:fixPalWanted()?paletteRGB():null},[copy.buffer]);',
], 'the single ask');
swap('      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:sw, height:sh,', [
  '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:sw, height:sh,',
  '        palette:fixPalWanted()?paletteRGB():null,',
], 'the folder ask');

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('palette:fixPalWanted()?paletteRGB():null') !== 2) throw new Error('both runs ask');
  if (times('snapToPalette.toString()') !== 1) throw new Error('the worker carries the step');
});

fs.renameSync(TMP, FILE);
console.log('patch567 written, ' + grew + ' bytes');
