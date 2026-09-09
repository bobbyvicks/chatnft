/* THE PIXEL SIZE STEPPED BY A HUNDREDTH.

   "make it so that when i go up and down on the pixels its never by .00 its
   only whole numbers too"

   The field was step="0.01" with inputmode="decimal", so one press of the up
   arrow went 0 to 0.01 and getting from 8 to 12 was four hundred presses. It
   is 1 now, and typing a fraction is rounded on the way out rather than left
   to be found later.

   WHAT THIS GIVES UP, said plainly rather than left quiet. The engine takes a
   float and a real grid can genuinely be 15.06 - that is what the readout
   warns about when 1280 does not divide the pixel count. So a fractional
   FORCED size is no longer expressible by hand.

   It costs nothing for what this is for. A forced pixel size is a statement
   about the SOURCE - "this picture was drawn at 12 real pixels per art pixel"
   - and a picture drawn at 12.37 does not exist; the number is whole because
   the drawing was. The fractional figures in this tool are all OUTPUTS: the
   step the detectors measured, and 1280 divided by the pixel count. Neither
   is typed. And the sizes the readout offers when the division is uneven are
   already whole by construction, so the field can now take every suggestion
   it is given, which it could not reliably do while a stray .01 could ride
   along in it.

   ROUNDED ON change, NOT ON input. Rounding every keystroke makes "12"
   unreachable if you pause after the 1 - it would snap and fight the typing.
   change fires when the field is left or the spinner is used, which is when
   the value is meant. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the field ---------------------------------------------------- */
{
  const at = kit.only(L, l => l === '    <input type="number" id="fixforce" min="0" step="0.01" value="0" style="width:84px"',
    'the pixel size field');
  if (L[at + 1] !== '      inputmode="decimal"')
    throw new Error('the field does not declare its keyboard where this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    <input type="number" id="fixforce" min="0" step="1" value="0" style="width:84px"',
    '      inputmode="numeric"',
  ]);
  const t = kit.near(L, '      title="How many pixels of the picture make one pixel of the artwork. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">',
    -1, 'inputmode="numeric"', 'the field title');
  kit.replace(L, { start: t, end: t }, [
    '      title="How many pixels of the picture make one pixel of the artwork, in whole numbers. 0 works it out. If the result still looks soft, the guess was too small - try 8, 12 or 16.">',
  ]);
}

/* ---- and a typed fraction is rounded when the value is meant ------ */
{
  const at = kit.only(L, l => l === '  $("fixforce").addEventListener("input",fixSizeHint);', 'the readout wiring');
  kit.replace(L, { start: at, end: at }, [
    '  $("fixforce").addEventListener("input",fixSizeHint);',
    '  /* WHOLE NUMBERS. The arrows step by one now; this is for a fraction',
    '     typed or pasted in. On change rather than on input, because rounding',
    '     every keystroke makes 12 unreachable if you pause after the 1 - it',
    '     would snap to 1 and fight the typing. change fires when the field is',
    '     left or the spinner is used, which is when the value is meant. */',
    '  $("fixforce").addEventListener("change",()=>{',
    '    const f=$("fixforce"), v=+f.value;',
    '    if(!f.value) return;',
    '    const w=Math.max(0,Math.round(v||0));',
    '    if(String(w)!==f.value){ f.value=String(w); fixSizeHint(); }',
    '  });',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  if (!/id="fixforce" min="0" step="1" value="0"/.test(text))
    throw new Error('the arrows do not step by one');
  if (/id="fixforce"[^>]*step="0\.01"/.test(text))
    throw new Error('the hundredth step is still there');
  if (!/inputmode="numeric"/.test(text))
    throw new Error('the field still asks for a decimal keyboard');
  if (!/Math\.max\(0,Math\.round\(v\|\|0\)\)/.test(code))
    throw new Error('a typed fraction is not rounded');
  /* ON change, NOT ON input - the difference is whether 12 can be typed. */
  if (!/\$\("fixforce"\)\.addEventListener\("change"/.test(code))
    throw new Error('the rounding is not on change');
  const inputLine = code.split('\n').find(l => /addEventListener\("input",fixSizeHint\)/.test(l));
  if (!inputLine) throw new Error('the readout no longer follows the field');
  if (/Math\.round/.test(inputLine))
    throw new Error('the rounding is on input, which would fight the typing');

  /* THE OUTPUTS STAY FRACTIONAL. 1280/85 is 15.06 and the readout has to be
     able to say so - this change is about what is TYPED, not what is shown,
     and rounding the warning away would hide the thing it exists to warn
     about. */
  if (!/Math\.round\(k\*100\)\/100/.test(code))
    throw new Error('the uneven-division warning lost its decimals');
  if (!/\(\+r\.stepX\)\.toFixed\(2\)/.test(code))
    throw new Error('the measured step lost its decimals');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
