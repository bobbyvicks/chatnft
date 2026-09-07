/* WIRE THE BUTTON.

   patch252 defined hideBaseClicked and put a button in the page and connected
   neither to the other. That is the exact shape WORKLOG.md names as its third
   lens - an unwired button leaves a dead feature and a green suite - and it
   was written by the person who wrote that line, in the same hour.

   The handler goes beside Clear background's, which is the neighbouring idea
   and the only other thing in that section that changes the artwork. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* CHECK - the handler it is being put beside, and the function it will call. */
const debgAt = kit.only(L, l => l === "$('debg').onclick=()=>{", 'the Clear background handler');
kit.only(L, l => l === 'function hideBaseClicked(){', 'the click handler function');
kit.only(L, l => l.indexOf('      <button class="btn ghost" id="hidebase" disabled') === 0, 'the button');

/* CHECK - nothing already wires it, or this would be the second handler and
   the first would be silently replaced. */
if (L.some(l => l.indexOf("$('hidebase')") >= 0 || l.indexOf('$("hidebase")') >= 0 && l.indexOf('onclick') >= 0))
  throw new Error('something already refers to the hidebase button');

kit.replace(L, { start: debgAt, end: debgAt }, [
  '/* Beside Clear background because they answer the same complaint from two',
  '   directions: that one floods in from the border and cannot reach base',
  '   showing through a gap in the trait, this one goes by colour and can. */',
  "$('hidebase').onclick=hideBaseClicked;",
  "$('debg').onclick=()=>{",
]);

const grew = kit.save(doc, ({ lines, code, codeLines }) => {
  const wired = codeLines.filter(l => l.indexOf("$('hidebase').onclick=hideBaseClicked;") >= 0);
  if (wired.length !== 1) throw new Error('the button is not wired exactly once');
  /* The check that matters: wired IN CODE, not merely mentioned in a comment
     about wiring it. codeLines is comment-stripped for exactly this. */
  if (code.indexOf("$('hidebase').onclick=hideBaseClicked") < 0)
    throw new Error('the wiring is only in a comment');
  if (lines.filter(l => l === "$('debg').onclick=()=>{").length !== 1)
    throw new Error('the Clear background handler was disturbed');
});

console.log('index.html grew by ' + grew + ' bytes');
