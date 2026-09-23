/* PULLING A TRAIT OFF A CHARACTER RUNS THE PIPELINE ONCE PER CHANGE.

   Found 2026-09-22 by the discovery pass, ranked twenty-third of 39.
   extractTrait runs the full-resolution pipeline on the main thread: 0.8 to
   0.9 s a run on a desktop and 2.4 to 3.4 s at phone speed on ordinary art,
   up to 11 s on large submissions. The preview ran it 40 ms after every
   pause in a Sensitivity or Speck slider drag, so the thumb stopped
   following the finger at each pause; it ran it on every pointer move of an
   area drag, although the area handed to the pipeline does not change until
   the pointer is lifted, so each run repeated identical work to redraw the
   marked box; and Extract ran it once more, on inputs the preview had just
   used, to get a result byte-identical to the one on screen (5-8 s at phone
   speed).

   The preview's result is kept with the exact inputs it was made from - the
   two pictures and every option, the area included - and anything asking
   for the same inputs gets it back: Extract, a redraw during an area drag,
   the result/overlay switch. Any change to an input runs the pipeline again.
   startEditor copies what it is given, so an edit cannot reach it.

   The sliders run the preview when they are let go (change), and only move
   their number while they are dragged (input). A slider moved from the
   keyboard fires change on every step, so arrows still preview each value. */
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

{
  const fnR = () => kit.inFunction(L, 'function renderPreview(){');
  swap('      const r=extractTrait(subData,refData,currentOpts());', ['      const r=extractFor();'], 'the preview run', fnR());
  swap('      lastResult=r;', [], 'the preview keep', fnR());
  const f = fnR();
  kit.replace(L, { start: f.start, end: f.start }, [
    '/* THE PIPELINE ONCE PER SET OF INPUTS. extractTrait is 0.8 s a run on a',
    '   desktop and 2.4-3.4 s at phone speed, and the preview, an area drag and',
    '   Extract all asked it again for inputs it had just answered. Kept with',
    '   the two pictures (by identity - a new file is a new ImageData) and',
    '   every option, the area included; any change runs it again. */',
    'let lastResultSub=null, lastResultRef=null, lastResultKey="";',
    'function extractFor(){',
    '  const o=currentOpts(), key=JSON.stringify(o);',
    '  if(lastResult && lastResultSub===subData && lastResultRef===refData && lastResultKey===key) return lastResult;',
    '  const r=extractTrait(subData,refData,o);',
    '  lastResult=r; lastResultSub=subData; lastResultRef=refData; lastResultKey=key;',
    '  return r;',
    '}',
    'function renderPreview(){',
  ]);
}
swap("$('sens').addEventListener('input',()=>{ $('sensv').textContent=$('sens').value; renderPreview(); });", [
  '/* The number follows the thumb; the preview runs when it is let go. It ran',
  '   40 ms after every pause in a drag, 2.4-3.4 s each at phone speed, and the',
  '   thumb stopped following the finger for that long. */',
  "$('sens').addEventListener('input',()=>{ $('sensv').textContent=$('sens').value; });",
  "$('sens').addEventListener('change',()=>{ $('sensv').textContent=$('sens').value; renderPreview(); });",
], 'the sensitivity slider');
swap("$('minblob').addEventListener('input',()=>{ $('minblobv').textContent=$('minblob').value; renderPreview(); });", [
  "$('minblob').addEventListener('input',()=>{ $('minblobv').textContent=$('minblob').value; });",
  "$('minblob').addEventListener('change',()=>{ $('minblobv').textContent=$('minblob').value; renderPreview(); });",
], 'the speck slider');
{
  const fn = kit.inFunction(L, "$('doextract').onclick=async()=>{");
  swap('  // the pipeline the preview just showed, run once more so the result matches', [
    '  /* What the preview showed, when it was made from these inputs - it used',
    '     to be run again to get the same bytes. */',
  ], 'the extract comment', fn);
  swap('  const r=extractTrait(subData,refData,currentOpts());', ['  const r=extractFor();'], 'the extract run', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('extractTrait(subData,refData,') !== 1) throw new Error('extractTrait is called other than through extractFor: ' + times('extractTrait(subData,refData,'));
  if (times('extractFor()') !== 3) throw new Error('extractFor calls: ' + times('extractFor()'));
});

fs.renameSync(TMP, FILE);
console.log('patch552 written, ' + grew + ' bytes');
