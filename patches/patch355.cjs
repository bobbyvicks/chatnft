/* THE TOOL RAIL EATS THE PHONE'S CANVAS, ONE BUTTON AT A TIME.

   On a phone the rail is a wrapping row above the stage, and the stage is
   the grid row that gives up whatever the rail takes. Four buttons moved
   into it when Transform, Base layer, Save and Colours became panels; Text
   is a fifth. At 375px seven fit on a line, so the rail is now three lines
   deep and the stage lost about a hundred and fifty pixels of height.

   Measured, not guessed: a 160 trait opened at 1x instead of 2x, which is
   what phoneeditor.spec.js caught - "the art fills the stage instead of
   opening at 1x" went red on the arithmetic, because there was no longer
   room for a whole step up.

   Wrapping was the wrong shape for a list that grows. One row that scrolls
   sideways costs the stage a fixed 58px whatever is in it, and every tool
   stays one flick away. The desktop rail is a column and is not touched.
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
  '  .tools{flex-direction:row; flex-wrap:wrap; justify-content:center; overflow-x:visible;',
  '    padding:8px 10px; border-right:none; border-bottom:1px solid var(--line);}',
]), block([
  '  /* ONE ROW THAT SCROLLS, not a block that wraps. The stage is the grid',
  '     row that pays for whatever this one takes, so a rail that grows a line',
  '     every few tools is a canvas that shrinks every few tools. Scrolling',
  '     costs a fixed height however many tools there are. */',
  '  .tools{flex-direction:row; flex-wrap:nowrap; justify-content:flex-start;',
  '    overflow-x:auto; overflow-y:hidden; scrollbar-width:none;',
  '    padding:8px 10px; border-right:none; border-bottom:1px solid var(--line);}',
  '  .tools::-webkit-scrollbar{display:none;}',
  '  /* A flex item shrinks to fit by default, which would squeeze forty-two',
  '     pixel buttons into twenty rather than let the row scroll. */',
  '  .tools .tool{flex:none;}',
  '  /* The dividers are full-width lines in the column layout; lying down',
  '     they have to become short vertical ones or they push the row out. */',
  '  .tools .rule{width:1px; min-width:1px; height:26px; align-self:center;}',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
// eslint-disable-next-line no-new-func
new Function(script);

const css = text.slice(0, text.indexOf('</style>'));

if (css.indexOf('.tools{flex-direction:row; flex-wrap:nowrap;') < 0)
  throw new Error('the phone rail still wraps');
if (css.indexOf('  .tools .tool{flex:none;}') < 0)
  throw new Error('the buttons will be squeezed instead of scrolled');
/* THE COLUMN IS UNTOUCHED. The everyday rail wraps into a second column when
   it has to, and that is right - there is height to spare and no scrolling
   involved. */
if (css.indexOf('.tools{grid-area:tools; display:flex; flex-direction:column') < 0)
  throw new Error('the desktop rail lost its column');
if (css.indexOf('flex-wrap:wrap; align-content:flex-start; max-height:100%') < 0)
  throw new Error('the desktop rail lost its wrap');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
