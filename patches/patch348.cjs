/* MOVE AND RESIZE ON ONE BUTTON.

   They were two tools and the split was arbitrary. Move dragged the whole
   artwork; Resize showed a box with handles on it and did nothing at all if
   you dragged inside the box rather than on a handle. So repositioning a trait
   and sizing it - the two halves of fitting one to a character - meant pressing
   a different button between every adjustment.

   The box was already built for this: #tbox is pointer-events:none with only
   its handles set to auto, so a press inside it has always fallen straight
   through to the canvas. Nothing was catching it there.

   So: one tool. Drag a handle to size or rotate, drag anywhere else to move,
   and the box stays up while you do both.

   BOTH NAMES STILL WORK. selectTool("move") and selectTool("transform") are
   the same mode now rather than one being removed - the M and R keys both
   reach it, and so does anything that already asked for either. Removing a
   name is how a shortcut somebody has in their fingers stops working with no
   message at all.
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

/* ---- 1. one button ------------------------------------------------------ */
swap(block([
  '    <button class="tool" data-tool="move" aria-pressed="false" title="Move the art (M)"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg><span class="k">M</span></button>',
  '    <button class="tool" data-tool="transform" aria-pressed="false" title="Resize and rotate by dragging the box on the art (R)"><svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/></svg><span class="k">R</span></button>',
]), block([
  '    <!-- One tool. Drag a handle to size or rotate, drag anywhere else to',
  '         move. Both keys still reach it. -->',
  '    <button class="tool" data-tool="transform" aria-pressed="false" title="Move, resize and rotate: drag a handle to size it, drag anywhere else to move it (M or R)"><svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/><path d="M12 9v6M9 12h6"/></svg><span class="k">M</span></button>',
]));

/* ---- 2. one mode, under either name ------------------------------------- */
swap(block([
  'function selectTool(t){',
  "  tool=t; panMode=(t==='pan');",
]), block([
  'function selectTool(t){',
  '  /* THE SAME MODE UNDER EITHER NAME. Move and Resize were two tools and one',
  '     button now, but "move" is a name in the shortcut table, in this file and',
  '     in tests - and deleting a name is how a key somebody has in their',
  '     fingers stops working with no message. */',
  "  if(t==='move') t='transform';",
  "  tool=t; panMode=(t==='pan');",
]));

swap("  art.classList.toggle('mv',t==='move');",
  "  art.classList.toggle('mv',t==='transform');");

/* ---- 3. dragging inside the box moves ----------------------------------- */
swap(block([
  '  if(tool==="move"){',
  '    /* Same as the fill branch below: hold the redo stack aside, because',
  '       snapshot() clears it and this drag may end where it started. */',
]), block([
  '  /* A PRESS THAT IS NOT ON A HANDLE. #tbox is pointer-events:none except',
  '     for its handles, so a drag inside the box has always arrived here and',
  '     nothing was catching it - which is why the box could size but not move. */',
  '  if(tool==="transform"){',
  '    /* Same as the fill branch below: hold the redo stack aside, because',
  '       snapshot() clears it and this drag may end where it started. */',
]));

swap("  if(!hoverCell||!N||panMode||tool==='pan'||tool==='move'){ el.style.display='none'; return; }",
  "  if(!hoverCell||!N||panMode||tool==='pan'||tool==='transform'){ el.style.display='none'; return; }");

/* ---- 4. the shortcuts say what they do ---------------------------------- */
swap("  {show:'M', desc:'Move the art', keys:['m'], run:()=>selectTool('move')},",
  "  {show:'M', desc:'Move, resize and rotate', keys:['m'], run:()=>selectTool('transform')},");

swap("  {show:'R', desc:'Resize and rotate', keys:['r'], run:()=>selectTool('transform')},",
  "  {show:'R', desc:'The same tool, by its other name', keys:['r'], run:()=>selectTool('transform')},");

swap(block([
  "  {show:'Arrows', desc:'Nudge the art one pixel, while Move is the tool',",
  "    match:e=>tool==='move'&&e.key.indexOf('Arrow')===0, prevent:true,",
]), block([
  "  {show:'Arrows', desc:'Nudge the art one pixel, while Move is the tool',",
  "    match:e=>tool==='transform'&&e.key.indexOf('Arrow')===0, prevent:true,",
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* ONE BUTTON, and it is the one that shows the box. */
const markup = text.slice(0, text.indexOf('<script'));
if (markup.indexOf('data-tool="move"') >= 0)
  throw new Error('there are still two buttons');
if (markup.split('data-tool="transform"').length !== 2)
  throw new Error('the one button is not there exactly once');

/* BOTH NAMES STILL REACH IT. Anything that asked for "move" - a key, a test,
   another part of this file - must land in the same mode rather than in a
   tool that no longer does anything. */
if (code.indexOf("if(t==='move') t='transform';") < 0)
  throw new Error('selectTool("move") no longer reaches the tool');

/* AND NOTHING IS STILL WAITING FOR THE OLD MODE. A leftover tool==="move"
   is a branch that can never run, which reads as working code. */
if (code.indexOf('tool==="move"') >= 0 || code.indexOf("tool==='move'") >= 0)
  throw new Error('something still tests for the move tool by name');

/* THE MOVE DRAG IS STILL THERE, under the new condition. */
const bStart = code.indexOf('function beginStroke(e){');
const begin = code.slice(bStart, bStart + 700);
if (bStart < 0) throw new Error('could not find beginStroke');
if (begin.indexOf('if(tool==="transform"){') < 0)
  throw new Error('a drag inside the box no longer moves the art');
if (begin.indexOf('moveBuf=ctx.getImageData(0,0,art.width,art.height);') < 0)
  throw new Error('the move drag lost its buffer');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
