/* THE BRUSH NOW MATCHES THE SIZE THE ART WAS DRAWN AT.

   "if the art is done with 10x10 pixels mostly make the brush that size."

   Everything needed for this already existed and was not connected.

   transitions() + period() measure the block size of an image - the analyse
   screen prints it as "Block size 8.000 px" - and gridBlock holds it. But
   gridBlock is set in exactly ONE place, the analyse screen's "open raw"
   button, and startEditor resets it to 1 on every open with a comment saying
   callers that measured it set it afterwards. Opening a saved trait from the
   shelf measures nothing, so gridBlock stayed 1 and every stroke was one pixel
   on art drawn in tens.

   startEditor also calls setBrush(1) unconditionally, so even where the block
   WAS measured the brush ignored it. The only thing that ever read gridBlock
   for a tool was the outline's "snap: auto".

   SO: the measurement moves into a function both paths call, and the brush
   follows it.

   IT STOPS FOLLOWING THE MOMENT YOU CHOOSE A SIZE. brushAuto starts true and
   the slider and the [ ] keys turn it off, so a deliberate 1px brush survives
   moving to the next trait. That is the difference between a default and
   something that keeps overruling you, and in a 317-trait review pass it is
   the difference that matters.

   The existing >=1.5 rule is reused verbatim rather than re-derived: below
   that the honest answer is native art, where one cell is one pixel and a
   bigger brush would be a guess. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the brush follows the art until you say otherwise ------------- */
swap(block([
  'let brushWanted=1;',
]), block([
  'let brushWanted=1;',
  '/* Whether the brush still follows the art. True until the slider or the',
  '   bracket keys are used, because a size somebody chose on purpose must',
  '   survive moving to the next trait - otherwise every open would overrule',
  '   them, which in a 317-trait pass is 317 times. */',
  'let brushAuto=true;',
]));

/* ---- 2. one measurement, one adoption --------------------------------- */
swap(block([
  'function period(p,q,span){',
]), block([
  '/* The block size of an image, in pixels, or 1 for native art.',
  '',
  '   The same two steps the analyse screen runs, in a function, because a',
  '   saved trait opened from the shelf needs the answer just as much and had',
  '   no way to ask. Wrapped, because this now runs on every open and a throw',
  '   in a measurement must not stop a trait opening. */',
  'function measuredBlock(d,W,H){',
  '  try{',
  '    const t=transitions(d,W,H);',
  '    const px=period(t.x.p,t.x.q,W), py=period(t.y.p,t.y.q,H);',
  '    const B=px?px.B:(py?py.B:null);',
  '    /* The same threshold the analyse screen uses. Below it the honest',
  '       answer is native art: one cell is one pixel. */',
  '    return (B&&B>=1.5)?Math.round(B):1;',
  '  }catch(_){ return 1; }',
  '}',
  '/* Adopting a measured block: the grid the overlay draws, and the brush.',
  '',
  '   Both in one place so they cannot disagree about what the art is drawn in.',
  '   setBrush records it as brushWanted, so the existing ceiling logic pulls it',
  '   down on a small canvas and lets it back up on a big one, exactly as it',
  '   does for a size chosen by hand. */',
  'function adoptBlock(b){',
  '  gridBlock=(b&&b>=1.5)?Math.round(b):1;',
  '  if(brushAuto) setBrush(gridBlock);',
  '  return gridBlock;',
  '}',
  'function period(p,q,span){',
]));

/* ---- 3. opening a saved trait measures it ----------------------------- */
swap(block([
  '  startEditor(d.data,t.w,t.h,t.w,t.h,palette(d.data,t.w*t.h,24,64),false);',
]), block([
  '  startEditor(d.data,t.w,t.h,t.w,t.h,palette(d.data,t.w*t.h,24,64),false);',
  '  /* AFTER startEditor, which resets gridBlock to 1 and the brush to 1 by',
  '     design - its comment says callers that measured a block set it here. */',
  '  adoptBlock(measuredBlock(d.data,t.w,t.h));',
]));

/* ---- 4. the analyse path adopts through the same door ----------------- */
swap(block([
  "    const editRaw=()=>{ startEditor(d,w,h,w,h,pal,false);",
  '      gridBlock=(B&&B>=1.5)?Math.round(B):1; outlinePreview(); };',
]), block([
  "    const editRaw=()=>{ startEditor(d,w,h,w,h,pal,false);",
  '      /* Through adoptBlock rather than assigning gridBlock, so the brush',
  '         follows the measurement here too - this screen has the number and',
  '         used to keep it to itself. */',
  '      adoptBlock(B); outlinePreview(); };',
]));

/* ---- 5. choosing a size turns the following off ----------------------- */
swap("$('bslider').oninput=e=>setBrush(+e.target.value);",
  "$('bslider').oninput=e=>{ brushAuto=false; setBrush(+e.target.value); };");

swap('function stepBrush(d){ setBrush(brush+d); }',
  'function stepBrush(d){ brushAuto=false; setBrush(brush+d); }');

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['let brushAuto=true;', 'function measuredBlock(d,W,H){',
  'function adoptBlock(b){', '  adoptBlock(measuredBlock(d.data,t.w,t.h));',
  '      adoptBlock(B); outlinePreview(); };',
  "$('bslider').oninput=e=>{ brushAuto=false; setBrush(+e.target.value); };",
  'function stepBrush(d){ brushAuto=false; setBrush(brush+d); }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE PLACE DECIDES WHAT THE BLOCK IS. Two spellings of the >=1.5 rule is two
   chances for the grid overlay and the brush to disagree about the art. */
if (code.split('>=1.5)?Math.round(B):1').length !== 2)
  throw new Error('the block rule is written out more than once');
if (code.indexOf('gridBlock=(B&&B>=1.5)?Math.round(B):1; outlinePreview();') >= 0)
  throw new Error('the analyse path still assigns gridBlock directly');

/* THE MEASUREMENT CANNOT STOP A TRAIT OPENING. It now runs on every open. */
const mStart = code.indexOf('function measuredBlock(d,W,H){');
const mEnd = code.indexOf('function adoptBlock(b){', mStart);
if (mStart < 0 || mEnd < 0) throw new Error('could not bound measuredBlock');
if (code.slice(mStart, mEnd).indexOf('catch(_){ return 1; }') < 0)
  throw new Error('a failed measurement would throw out of the open path');

/* AND IT IS MEASURED AFTER startEditor, which resets both values it sets. */
const oStart = code.indexOf('async function openTraitRecord(t){');
const oEnd = code.indexOf('\r\nfunction startEditor(', oStart);
const open = code.slice(oStart, oEnd);
if (open.indexOf('adoptBlock(') < open.indexOf('startEditor(d.data'))
  throw new Error('the block is adopted before startEditor resets it');

/* A CHOSEN SIZE STICKS. Without both of these the brush overrules the artist
   on every single trait. */
if (code.split('brushAuto=false;').length !== 3)
  throw new Error('expected exactly the slider and the keys to turn following off');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
