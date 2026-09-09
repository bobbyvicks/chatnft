/* MAKING A TRAIT BIGGER, AT EVERY MULTIPLE THAT FITS.

   Two things were in the way, and only one of them was the list.

   THE LIST. The Jump-to menu offered nine hand-picked multiples of the cell
   grid - 1, 2, 3, 4, 6, 8, 10, 12, 16 - so 5x, 7x, 9x, 11x, 13x, 14x and 15x
   were not there at all, and the ceiling would have allowed up to 25x on a 160
   cell grid. Nine was a guess about what anyone would want. Every whole
   multiple that fits is not a guess, and the field beside it already accepted
   any number, so the menu was the only thing pretending the choice was small.

   THE THING NOBODY SAID, which matters more. Enlarging stays crisp only at a
   WHOLE multiple of the canvas you are enlarging FROM. 1280 to 2560 duplicates
   every pixel exactly twice and the art is untouched. 1280 to 1600 is 1.25x:
   nearest neighbour duplicates some rows and not others, so a one-pixel line
   becomes one pixel in places and two in others, and a grid that was even
   stops being even. The resampler is right to do that - it is what nearest
   neighbour means - but the panel said nothing, and the difference between
   those two presses is the difference between a trait you can still work on
   and one you cannot.

   So the note says which it is before the press, and names the nearest whole
   multiples either side when it is not. That is the whole feature: the menu
   stops hiding sizes, and the number tells you what it will cost.
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

/* ---- 1. every multiple that fits ---------------------------------------- */
swap(block([
  '  for(const k of [1,2,3,4,6,8,10,12,16]){',
  '    const px=projectGrid*k;',
  '    if(px>4096) continue;',
  '    const o=document.createElement("option");',
  '    o.value=String(px);',
]), block([
  '  /* EVERY WHOLE MULTIPLE THAT FITS, not nine chosen ones. The old list ran',
  '     1,2,3,4,6,8,10,12,16 and simply had no 5, 7, 9, 11, 13, 14 or 15 in it,',
  '     while the ceiling allows 25 of them on a 160 cell grid. The field beside',
  '     this always took any number, so the menu was the only thing making the',
  '     choice look small. */',
  '  for(let k=1;projectGrid*k<=MAX_SIDE;k++){',
  '    const px=projectGrid*k;',
  '    const o=document.createElement("option");',
  '    o.value=String(px);',
]));

/* ---- 2. and what the press will cost ------------------------------------ */
swap(block([
  '  const why = moved',
  '    ? "  \\u00b7 snap moved "+t.askedW+" to "+t.nw+"; turn Snap off for "+t.askedW',
  '    : "";',
  '  n.textContent = now+"  \\u2192  "+target+why;',
]), block([
  '  const why = moved',
  '    ? "  \\u00b7 snap moved "+t.askedW+" to "+t.nw+"; turn Snap off for "+t.askedW',
  '    : "";',
  '  /* CRISP OR NOT, SAID BEFORE THE PRESS. Nearest neighbour duplicates each',
  '     pixel a whole number of times only when the ratio is a whole number; at',
  '     1.25x it doubles some rows and not others, so an even grid stops being',
  '     even and a one-pixel line is one pixel in places and two in others. The',
  '     resampler is right - that is what nearest neighbour is - and the panel',
  '     used to say nothing about which of the two you were about to do. */',
  '  n.textContent = now+"  \\u2192  "+target+why+growNote(t);',
]));

swap(block([
  'function resizeBoxes(){',
]), block([
  '/* Whether this resize multiplies the canvas by a whole number, and what the',
  '   nearest ones are when it does not.',
  '',
  '   Only for GROWING. Shrinking cannot duplicate anything, and its own',
  '   trade-offs are already covered by the resampler and the border rule. */',
  'function growNote(t){',
  '  if(!t||t.mode==="inside") return "";',
  '  const from=Math.max(1,art.width|0), to=t.nw|0;',
  '  if(to<=from) return "";',
  '  const k=to/from;',
  '  if(Number.isInteger(k)) return "  \\u00b7  \\u00d7"+k+" exactly: every pixel becomes "+k+"\\u00d7"+k;',
  '  const lo=Math.floor(k), hi=Math.ceil(k);',
  '  /* Named, not just refused: the two sizes either side are what somebody',
  '     actually wants when the number they typed is not a whole multiple. */',
  '  const near=[lo>=2?from*lo:0, from*hi].filter(v=>v&&v<=MAX_SIDE);',
  '  return "  \\u00b7  \\u00d7"+(Math.round(k*100)/100)+", uneven: some rows double and others do not"',
  '    +(near.length?"  \\u00b7  whole multiples near it: "+near.join(", "):"");',
  '}',
  'function resizeBoxes(){',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function growNote(t){', 'for(let k=1;projectGrid*k<=MAX_SIDE;k++){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE HAND-PICKED LIST IS GONE. Leaving it beside the new loop would keep the
   gaps and hide them behind a change that looks like it fixed them. */
if (code.indexOf('[1,2,3,4,6,8,10,12,16]') >= 0)
  throw new Error('the nine hand-picked multiples are still in the file');

/* IT IS ABOUT GROWING, AND ABOUT THE CANVAS BEING GROWN FROM. Comparing
   against the grid instead of the current canvas would call 1280 to 1600 a
   clean 10x, which is true about the grid and false about the pixels. */
const gStart = code.indexOf('function growNote(t){');
const gEnd = code.indexOf(NL + 'function resizeBoxes(){', gStart);
if (gStart < 0 || gEnd < 0) throw new Error('could not bound growNote');
const grow = code.slice(gStart, gEnd);
if (grow.indexOf('const from=Math.max(1,art.width|0)') < 0)
  throw new Error('the ratio is no longer measured from the current canvas');
if (grow.indexOf('if(to<=from) return "";') < 0)
  throw new Error('the note now speaks about shrinking, which it cannot answer for');
if (grow.indexOf('Number.isInteger(k)') < 0)
  throw new Error('the whole-multiple test is gone');
/* AND IT NAMES A WAY OUT. "Uneven" with no nearby whole multiple is a
   complaint rather than help. */
if (grow.indexOf('whole multiples near it') < 0)
  throw new Error('an uneven ratio no longer names the sizes either side');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
