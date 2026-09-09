/* A POP-OUT NEVER SITS ON THE RAIL.

   popAt places a panel at its button's right edge plus twelve pixels, which
   was right while every button was IN the rail: the card landed beside it.
   Then the Colours button moved into the strip under the header, at the far
   left of the page, and its card landed at x=46 - squarely over the rail
   column, covering Undo, Redo and the grid toggle for as long as the panel
   was open.

   Measured, not guessed: recolour.spec.js "survives an undo of something
   unrelated" opens the colours panel and then presses #undo, and the click
   was intercepted by <label for="picker"> inside #clscrim. It had passed on
   the run before, which is the shape of a geometry defect: whether the card
   happened to reach that button depended on the card's height that day.

   So the left edge is the button's right edge OR the rail's right edge,
   whichever is further along. For a rail button that is the same number it
   always was; for a strip button it is the first free column beside the
   rail. The rule is stated where the panels are placed and asserted from the
   rail's side, where the damage was.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
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
  '  const r=b.getBoundingClientRect(), c=s.firstElementChild;',
  '  s.style.left=Math.round(r.right+12)+"px";',
]), block([
  '  const r=b.getBoundingClientRect(), c=s.firstElementChild;',
  '  /* Beside the RAIL, not merely beside the button. The Colours button lives',
  '     in the strip at the far left, and a card placed at its right edge sat',
  '     on top of the rail and swallowed Undo - the click landed on a label in',
  '     the card instead. The rail is where every other opener is, so its edge',
  '     is the least a pop-out may start at. */',
  '  const rail=document.querySelector("nav.tools");',
  '  const clear=rail?rail.getBoundingClientRect().right:0;',
  '  s.style.left=Math.round(Math.max(r.right,clear)+12)+"px";',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
if (code.indexOf('s.style.left=Math.round(Math.max(r.right,clear)+12)+"px";') < 0)
  throw new Error('the placement does not clear the rail');
/* The one call site of popAt is inside railPanel and outlinePanel; the rule
   lives in popAt itself so both get it. */
if (code.split('function popAt(id){').length !== 2) throw new Error('popAt is not defined exactly once');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
