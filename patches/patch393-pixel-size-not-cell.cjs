/* THE CONTROL IS CALLED "CELL SIZE" AND WHAT IT SETS IS THE SIZE OF A PIXEL.

   "i'd rather it be pixel size instead of cell and have it actually be pixels."

   WHAT WAS ACTUALLY WRONG, checked before changing anything, because the
   complaint was that the output "still has blurred lines" and that could have
   meant three different things:

     the preview            already carries image-rendering:pixelated, so it is
                            not being smoothed on the way to the screen
     the output data        two_stage_pack writes ONE colour per cell and the
                            result is cols x rows, so it already is real pixels
                            at their own size - the caption says so
     the detected grid      this is the one. On an image whose edges are soft
                            to begin with, the detectors find a small step, and
                            a small step preserves the softness faithfully.

   So the tool was working and finding the wrong answer, and the only way out
   was a control called "Cell size" whose tooltip said "for when you already
   know it" - which tells somebody who does NOT already know it nothing at all.
   Setting it to 12 produced exactly the picture that was wanted.

   THREE CHANGES, none to the engine's arithmetic.

   1. It is called Pixel size, and its tooltip says what the number means in
      those terms: how many pixels of the picture become one pixel of the
      artwork.

   2. It says what you will get, live. "12" on a 1024 image now reads
      "-> 85 x 85 pixels" beside the box, before the run. That is the engine's
      own arithmetic, not an approximation of it: api's force_step branch is
      cols = max(1, round(width / step)), which is what the readout computes.

   3. A result that is not high confidence says what to do about it, naming the
      step it found so there is a number to start from. It stays quiet when the
      size was forced, because then the person has already answered.

   AND THE ENGINE'S OWN PROGRESS LINE said "using the cell size you gave". The
   same string lives in three places - the module, the built bundle and the
   copy inlined in this page - and all three move together, with a check that
   the inlined copy still matches the bundle byte for byte. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'index.html');
const TMP = LIVE + '.new';
const SRC = path.join(ROOT, 'pixelfixer', 'src', 'pf-99-api.js');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');

const OLD_LABEL = 'using the cell size you gave';
const NEW_LABEL = 'using the pixel size you gave';

/* The two files beside the page, first, so a failure there leaves index.html
   untouched rather than half-renamed. */
const srcWas = fs.readFileSync(SRC, 'utf8');
const bundleWas = fs.readFileSync(BUNDLE, 'utf8');
for (const [name, text] of [['pf-99-api.js', srcWas], ['pixelfixer.bundle.js', bundleWas]]) {
  const n = text.split(OLD_LABEL).length - 1;
  if (n !== 1) throw new Error(name + ' says "' + OLD_LABEL + '" ' + n + ' times, need exactly 1');
}

fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1 and 2: the control ---------------------------------------- */
{
  const at = kit.only(L, l => l === '    <label for="fixforce">Cell size</label>', 'the control label');
  if (L[at + 1] !== '    <input type="number" id="fixforce" min="0" step="0.01" value="0" style="width:84px"')
    throw new Error('the control is not the input this expects');
  if (L[at + 2] !== '      title="0 finds the cell size. A number skips detection and uses that size - for when you already know it">')
    throw new Error('the control does not carry the title this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '    <label for="fixforce">Pixel size</label>',
    '    <input type="number" id="fixforce" min="0" step="0.01" value="0" style="width:84px"',
    '      inputmode="decimal"',
    '      title="How many pixels of the picture make one pixel of the artwork. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">',
    '    <span class="note mono" id="fixsize"></span>',
  ]);
}

/* ---- the readout, and where it is kept up to date ---------------- */
{
  const at = kit.only(L, l => l === 'function fixRun(){', 'the run function');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT THAT PIXEL SIZE WILL GIVE YOU, before the run rather than after it.',
    '',
    '   The engine\'s own arithmetic, not a restatement of it: api\'s force_step',
    '   branch is cols = max(1, round(width / step)) and rows the same over the',
    '   height, which is what this computes. If that ever stops being true the',
    '   readout is wrong rather than merely stale, so patches/patch393 checks the',
    '   two agree.',
    '',
    '   Quiet with no image, because there is nothing to divide. */',
    'function fixSizeHint(){',
    '  const el=$("fixsize"); if(!el) return;',
    '  const step=+$("fixforce").value||0;',
    '  if(!FIX.src||step<=0){ el.textContent=""; return; }',
    '  const cols=Math.max(1,Math.round(FIX.src.width/step));',
    '  const rows=Math.max(1,Math.round(FIX.src.height/step));',
    '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels";',
    '}',
    'function fixRun(){',
  ]);

  const load = kit.only(L, l => l === '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");', 'the loaded message');
  kit.replace(L, { start: load, end: load }, [
    '  fixSizeHint();',
    '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");',
  ]);

  const wire = kit.only(L, l => l === '  $("fixrun").onclick=()=>{ fixRun(); };', 'the run button');
  kit.replace(L, { start: wire, end: wire }, [
    '  $("fixrun").onclick=()=>{ fixRun(); };',
    '  $("fixforce").addEventListener("input",fixSizeHint);',
  ]);
}

/* ---- 3: the caption, and what to do about a soft result ---------- */
{
  const cap = kit.only(L, l => l.indexOf('        $("fixaftercap").textContent=r.width+"\\u00d7"+r.height+" real pixels \\u00b7 cell "') === 0,
    'the after caption');
  kit.replace(L, { start: cap, end: cap }, [
    '        $("fixaftercap").textContent=r.width+"\\u00d7"+r.height+" real pixels \\u00b7 pixel size "+(+r.stepX).toFixed(2)+(Math.abs(r.stepX-r.stepY)>0.01?"\\u00d7"+(+r.stepY).toFixed(2):"")+" px";',
  ]);

  const say = kit.only(L, l => l === '        fixSay((r.confidence||"")+" confidence ("+(r.consensus||"?")+") \\u00b7 "+secs+"s");',
    'the result message');
  kit.replace(L, { start: say, end: say }, [
    '        /* A SOFT RESULT SAYS WHAT TO DO ABOUT IT. An image whose edges were',
    '           soft to begin with makes the detectors find a small step, and a',
    '           small step keeps the softness faithfully - which is the tool',
    '           working and finding the wrong answer, and looks exactly like the',
    '           tool not working. Quiet when the size was forced: then the',
    '           question has already been answered by hand. */',
    '        const soft = r.confidence!=="high" && r.consensus!=="forced";',
    '        fixSay((r.confidence||"")+" confidence ("+(r.consensus||"?")+") \\u00b7 "+secs+"s"',
    '          +(soft ? " \\u2014 if the edges still look soft, the grid it found ("',
    '            +(+r.stepX).toFixed(2)+" px) was too small. Put a whole number near it"',
    '            +" into Pixel size and run it again." : ""));',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  if (/Cell size/.test(text)) throw new Error('the control still calls it a cell');
  if (text.indexOf('<label for="fixforce">Pixel size</label>') < 0)
    throw new Error('the control is not called Pixel size');
  if (text.indexOf('id="fixsize"') < 0) throw new Error('there is nowhere to say what you will get');

  const fn = kit.inFunction(codeLines, 'function fixSizeHint(){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');
  /* THE READOUT MUST USE THE ENGINE'S ARITHMETIC. Read the engine's own line
     out of the inlined copy and compare the shape, rather than trusting that
     I remembered it. */
  if (!/Math\.max\(1,Math\.round\(FIX\.src\.width\/step\)\)/.test(body))
    throw new Error('the readout does not compute the columns the way the engine does');
  const engine = text.indexOf('cols: Math.max(1, Math.round(width / fs))');
  if (engine < 0)
    throw new Error('the engine no longer derives the columns that way, so the readout is wrong');

  if (!/addEventListener\("input",fixSizeHint\)/.test(codeLines.join('\n')))
    throw new Error('the readout never updates');
  const fl = kit.inFunction(codeLines, 'async function fixLoad(file){');
  if (!/fixSizeHint\(\)/.test(codeLines.slice(fl.start, fl.end + 1).join('\n')))
    throw new Error('the readout is not filled in when an image is loaded');

  const fr = kit.inFunction(codeLines, 'function fixRun(){');
  const run = codeLines.slice(fr.start, fr.end + 1).join('\n');
  if (!/pixel size /.test(run)) throw new Error('the caption still calls it a cell');
  if (!/r\.confidence!=="high" && r\.consensus!=="forced"/.test(run))
    throw new Error('a soft result says nothing about what to do');
  /* AND IT MUST BE ABLE TO STAY QUIET, or every good result carries advice
     nobody needs. */
  if (!/soft \? /.test(run)) throw new Error('the advice is unconditional');
});

/* ---- and the engine's own progress line, in all three copies ----- */
fs.writeFileSync(SRC, srcWas.split(OLD_LABEL).join(NEW_LABEL));
fs.writeFileSync(BUNDLE, bundleWas.split(OLD_LABEL).join(NEW_LABEL));
{
  const page = fs.readFileSync(TMP, 'utf8');
  const n = page.split(OLD_LABEL).length - 1;
  if (n !== 1) throw new Error('the inlined engine says the old label ' + n + ' times, need 1');
  fs.writeFileSync(TMP, page.split(OLD_LABEL).join(NEW_LABEL));
}

/* THE INLINED COPY STILL IS THE BUNDLE. If these ever part, the tab runs an
   engine nobody has the source of. */
{
  const page = fs.readFileSync(TMP, 'utf8');
  const m = page.match(/<script id="pfcore" type="text\/plain">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('the inlined engine is gone');
  const norm = s => s.replace(/\r\n/g, '\n').trim();
  if (norm(m[1]) !== norm(fs.readFileSync(BUNDLE, 'utf8')))
    throw new Error('the inlined engine and the bundle have parted');
  for (const [name, p] of [['the page', TMP], ['the bundle', BUNDLE], ['the module', SRC]]) {
    const t = fs.readFileSync(p, 'utf8');
    if (t.indexOf(OLD_LABEL) >= 0) throw new Error(name + ' still says the old label');
    if (t.indexOf(NEW_LABEL) < 0) throw new Error(name + ' does not say the new one');
  }
}

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes, and the engine label in all three copies');
