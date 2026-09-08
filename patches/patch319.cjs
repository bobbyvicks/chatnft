/* THE SAVE CHANGED PIXELS AND DID NOT SAY SO.

   Measured, on a 200x200 trait at the default 160 grid: Save to project stored
   an image differing from the visible canvas in 796 places - exactly 200*4-4,
   the one-pixel outer ring, set to pure black.

   THAT IS NOT A BUG. blackenEdge is a deliberate collection rule with its
   reasoning written beside it - "The collection's outer border is black.
   Always. That is a fact about the art, so it is asserted rather than
   inferred" - and on real art the ring IS the outline, which is already black,
   so it usually changes nothing. My measurement used a solid opaque rectangle,
   where every edge pixel touches off-canvas emptiness, which is not a trait.

   WHAT IS WRONG IS THE SILENCE. blackenEdge returns how many pixels it
   touched. The extraction path records it as stats.edgeBlacked; traitCanvas
   throws it away, so the save path - the one that writes the file - says
   nothing at all.

   That matters now specifically. The final review pass treats the visible
   canvas as authoritative and asks for the exported pixels to equal it, so a
   save that quietly repaints part of the artwork is exactly the divergence
   somebody needs told. The toast already carries an off-grid note for the same
   reason; this rides beside it.

   COUNTED AS "ACTUALLY CHANGED", not as the size of the ring. On a normal
   trait the ring is already black and the honest number is zero - reporting
   the ring size would cry wolf on every save in the collection.

   Computed only when a caller asks. The two download paths pass nothing and
   pay nothing. */
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

/* ---- 1. traitCanvas can report what it repainted ---------------------- */
swap('function traitCanvas(){', block([
  '/* `out`, when given, comes back carrying how many pixels the border rule',
  '   actually CHANGED - not how many are in the ring. On a normal trait the',
  '   ring is already black and the honest answer is zero; reporting the ring',
  '   size would warn about every save in the collection.',
  '',
  '   Optional because the two download paths do not ask, and the compare is a',
  '   full pass over the pixels. */',
  'function traitCanvas(out){',
]));

swap(block([
  '  if(c.width>=projectGrid && c.height>=projectGrid) blackenEdge(im.data,c.width,c.height);',
]), block([
  '  if(c.width>=projectGrid && c.height>=projectGrid){',
  '    const was = out ? im.data.slice() : null;',
  '    const ring = blackenEdge(im.data,c.width,c.height);',
  '    if(out){',
  '      let changed=0;',
  '      for(let i=0;i<was.length;i+=4)',
  '        if(was[i]!==im.data[i]||was[i+1]!==im.data[i+1]',
  '         ||was[i+2]!==im.data[i+2]||was[i+3]!==im.data[i+3]) changed++;',
  '      out.edgeRing=ring; out.edgeChanged=changed;',
  '    }',
  '  }',
]));

/* ---- 2. the save says it, beside the off-grid note --------------------- */
swap(block([
  '  const c=traitCanvas();',
]), block([
  '  const edge={};',
  '  const c=traitCanvas(edge);',
]));

swap(block([
  '    const status=chipVal(\'tstatus\')||\'wip\';',
]), block([
  '    /* SAID, because the file just written is not the canvas on screen.',
  '       The collection\'s border rule repaints the outermost opaque pixels',
  '       black, which on finished art is what they already were - so this is',
  '       silent on a normal save and speaks only when real colour changed. */',
  '    const edged = edge.edgeChanged',
  '      ? " \\u2014 "+edge.edgeChanged+" edge pixel"+(edge.edgeChanged===1?"":"s")',
  '        +" set to black by the collection\'s border rule"',
  '      : "";',
  '    const status=chipVal(\'tstatus\')||\'wip\';',
]));

swap(block([
  '        : "Saved "+name+" here only - could not reach the group. Press Save to cloud when you are back.")+offGrid);',
]), block([
  '        : "Saved "+name+" here only - could not reach the group. Press Save to cloud when you are back.")+offGrid+edged);',
]));

swap(block([
  "      toast('Saved '+name+' to '+layer+'/'+status+offGrid);",
]), block([
  "      toast('Saved '+name+' to '+layer+'/'+status+offGrid+edged);",
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function traitCanvas(out){', '      out.edgeRing=ring; out.edgeChanged=changed;',
  '  const c=traitCanvas(edge);', '    const edged = edge.edgeChanged'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE COUNT IS WHAT CHANGED, NOT THE RING. Reporting ring.length would put a
   warning on every save of every finished trait, which is how a real warning
   becomes noise. */
const tStart = code.indexOf('function traitCanvas(out){');
/* Bounded on the next real declaration, which is saveTrait. The first version
   of this line was a conditional that resolved to -1 and failed loudly, which
   is the only reason the bad bounds never reached a check. */
const tEnd = code.indexOf('\r\nasync function saveTrait(', tStart);
if (tStart < 0 || tEnd < 0) throw new Error('could not bound traitCanvas');
const fn = code.slice(tStart, tEnd);
if (fn.indexOf('out.edgeChanged=changed;') < 0)
  throw new Error('the reported number is not the one that was measured');
if (/edgeChanged\s*=\s*ring/.test(fn))
  throw new Error('the ring size is being reported as the change count');

/* AND IT COSTS NOTHING WHEN NOBODY ASKS. The download paths call traitCanvas()
   with no argument on every export. */
if (fn.indexOf('const was = out ? im.data.slice() : null;') < 0)
  throw new Error('the compare runs even for callers that did not ask for it');

/* BOTH SAVE MESSAGES CARRY IT, or the group path stays silent about a repaint
   the personal path reports. */
if (code.split('+offGrid+edged').length !== 3)
  throw new Error('only one of the two save messages mentions the repaint');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
