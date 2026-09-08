/* THE BLACK FRAME ROUND A BACKGROUND.

   The user objected to a solid black rectangle round a background during the
   final review. The cause is here and it is deliberate: blackenEdge outlines
   every opaque pixel that touches empty space, and counts off-canvas as empty,
   because "a trait running to the edge of the frame still has a border there".

   That is right for a hat cropped at the top of the canvas. It is wrong for a
   background, which covers the whole canvas by definition, so the rule finds
   an art boundary at all four sides and frames the picture.

   THE NARROWEST RULE THAT FIXES IT: an edge of the canvas that the art fills
   COMPLETELY is not an edge of the art. Nothing else changes.

   MEASURED ON THE REAL 317 BEFORE CHANGING A DELIBERATE RULE:

     58 files fill all four edges - and they are exactly the 58 backgrounds,
        every one of them. Those stop being framed: 296,728 perimeter pixels
        that are painted black today.
      0 files fill some edges but not all, so there is no ambiguous middle
        case in this collection at all.
    259 files fill no edge and are untouched - 94 of which DO get perimeter
        black today, where the art runs off the side, and keep it.

   The corner case is the one to get right: a diagonal neighbour off the top
   AND the left is only covered if BOTH of those edges are filled.
*/
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

swap(block([
  'function blackenEdge(t,W,H){',
  '  const m=maskOfImg(t,W*H,127);',
  '  const ring=[];',
]), block([
  'function blackenEdge(t,W,H){',
  '  const m=maskOfImg(t,W*H,127);',
  '  /* AN EDGE THE CANVAS IS FILLED TO IS NOT AN EDGE OF THE ART.',
  '',
  '     Off-canvas counting as empty is deliberate and right for a trait cropped',
  '     at the frame - a hat cut off at the top still wants its outline there.',
  '     It is wrong for a background, which covers the whole canvas by',
  '     definition, so the rule found a boundary on all four sides and drew a',
  '     black rectangle round the picture. That frame is what the user objected',
  '     to in the final review.',
  '',
  '     Measured on the real 317 before changing this: 58 files fill all four',
  '     edges and they are exactly the 58 backgrounds; none fills some edges',
  '     but not all; the other 259 are untouched, 94 of them keeping perimeter',
  '     black where the art genuinely runs off the side. */',
  '  let fullT=true, fullB=true, fullL=true, fullR=true;',
  '  for(let x=0;x<W;x++){ if(!m[x]) fullT=false; if(!m[(H-1)*W+x]) fullB=false; }',
  '  for(let y=0;y<H;y++){ if(!m[y*W]) fullL=false; if(!m[y*W+W-1]) fullR=false; }',
  '  const ring=[];',
]));

swap(block([
  '      const xx=x+dx, yy=y+dy;',
  '      /* Off-canvas counts as empty: a trait running to the edge of the frame',
  '         still has a border there. */',
  '      if(xx<0||yy<0||xx>=W||yy>=H||!m[yy*W+xx]){ empty=true; break; }',
]), block([
  '      const xx=x+dx, yy=y+dy;',
  '      if(xx<0||yy<0||xx>=W||yy>=H){',
  '        /* Off canvas. Empty only where the art does not fill the edge being',
  '           crossed - and a diagonal neighbour off the top AND the left',
  '           crosses two, so both have to be filled for it to count as',
  '           covered. */',
  '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);',
  '        if(covered) continue;',
  '        empty=true; break;',
  '      }',
  '      if(!m[yy*W+xx]){ empty=true; break; }',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const bStart = code.indexOf('function blackenEdge(t,W,H){');
if (bStart < 0) throw new Error('could not find blackenEdge');
/* A FIXED WINDOW, not a comment marker - kit.code() strips comments, and a
   slice bounded on one runs to the end of the file and checks nothing. */
const fn = code.slice(bStart, bStart + 1500);
if (fn.indexOf('function blackenEdge(t,W,H){') !== 0)
  throw new Error('the window does not start at the function');

for (const s of ['let fullT=true, fullB=true, fullL=true, fullR=true;',
  'const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);'])
  if (fn.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE OLD BEHAVIOUR IS STILL THERE FOR EVERY EDGE THE ART DOES NOT FILL.
   Without this the fix could have been "never outline at the canvas edge",
   which would take the outline off 94 traits that should keep it. */
if (fn.indexOf('empty=true; break;') < 0)
  throw new Error('off-canvas no longer counts as empty anywhere');
/* AND THE ON-CANVAS RULE IS UNTOUCHED. */
if (fn.indexOf('if(!m[yy*W+xx]){ empty=true; break; }') < 0)
  throw new Error('an empty neighbour on canvas no longer makes an edge');

/* The four edges are each measured, not inferred from one another. */
for (const s of ['if(!m[x]) fullT=false;', 'if(!m[(H-1)*W+x]) fullB=false;',
  'if(!m[y*W]) fullL=false;', 'if(!m[y*W+W-1]) fullR=false;'])
  if (fn.indexOf(s) < 0) throw new Error('an edge is not measured: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
