/* A POP-OUT MAY NOT COVER THE TOOL RAIL.

   Found by a test that could not press Undo: "<label for="picker">Any colour</label>
   from <div id="clscrim"> subtree intercepts pointer events". The Colours card
   was sitting on top of the rail.

   popAt places a card beside the button that opened it, which is right while
   every button is in the rail - the card lands over the canvas, and the canvas
   is the thing you want to keep seeing. The colour button is not in the rail
   any more. It moved into the strip along the top when the side column went,
   so a card placed only relative to it drops straight down the left edge and
   over the tool column.

   The rail is how you close a panel and how you change tool. It is the one
   piece of chrome a floating card must never land on - a panel covering it can
   only be dismissed by Escape or by clicking through to the canvas, and
   neither is what somebody reaches for. The strip is the same argument one row
   up: it carries the colour, the brush and the fill spread, and a card over it
   hides the controls you are adjusting while you adjust them.

   So the position is clamped to the far side of both. For a button that IS in
   the rail this changes nothing, because the rail's right edge is exactly
   where those cards were already going.
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
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

swap(block([
  '  if(innerWidth<=820){ s.style.left=""; s.style.top=""; return; }',
  '  const r=b.getBoundingClientRect(), c=s.firstElementChild;',
  '  s.style.left=Math.round(r.right+12)+"px";',
  '  s.style.top="8px";',
  '  const h=c?c.getBoundingClientRect().height:0;',
  '  s.style.top=Math.round(Math.max(8,Math.min(r.top,innerHeight-h-8)))+"px";',
]), block([
  '  if(innerWidth<=820){ s.style.left=""; s.style.top=""; return; }',
  '  const r=b.getBoundingClientRect(), c=s.firstElementChild;',
  '  /* CLEAR OF THE RAIL AND THE STRIP. Beside the button is right while the',
  '     button is in the rail, and the colours button is in the strip along the',
  '     top - so placing its card only relative to itself dropped it down the',
  '     left edge and onto the tool column. Measured by a test that could not',
  '     press Undo, because the card was over it.',
  '',
  '     The rail is how a panel gets closed and how the tool gets changed, and',
  '     the strip holds the very controls a card like Colours is adjusting.',
  '     Neither may be covered. For a button already in the rail these two',
  '     bounds are where the card was going anyway. */',
  '  const rail=document.querySelector("nav.tools"), bar=document.querySelector(".opts");',
  '  const leftMin=rail?rail.getBoundingClientRect().right+12:0;',
  '  const topMin=bar?bar.getBoundingClientRect().bottom+8:8;',
  '  s.style.left=Math.round(Math.max(r.right+12,leftMin))+"px";',
  '  s.style.top=Math.round(topMin)+"px";',
  '  const h=c?c.getBoundingClientRect().height:0;',
  '  s.style.top=Math.round(Math.max(topMin,Math.min(r.top,innerHeight-h-8)))+"px";',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

if (code.indexOf('const leftMin=rail?rail.getBoundingClientRect().right+12:0;') < 0)
  throw new Error('the rail bound is missing');
if (code.indexOf('const topMin=bar?bar.getBoundingClientRect().bottom+8:8;') < 0)
  throw new Error('the strip bound is missing');
/* BOTH BOUNDS APPLIED, not just computed. A clamp that is worked out and then
   not used is the shape this file has been caught by before. */
if (code.indexOf('s.style.left=Math.round(Math.max(r.right+12,leftMin))+"px";') < 0)
  throw new Error('the left is not clamped to the rail');
if (code.indexOf('Math.max(topMin,Math.min(r.top,innerHeight-h-8))') < 0)
  throw new Error('the top is not clamped to the strip');
/* AND THE OLD UNCLAMPED LINES ARE GONE, or the last write wins and the clamp
   is decoration. */
if (code.indexOf('s.style.left=Math.round(r.right+12)+"px";') >= 0)
  throw new Error('the unclamped left assignment survives');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
