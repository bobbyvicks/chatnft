/* SNAP PRODUCED SIZES THE SHELF THEN CALLED WRONG.

   Two rules about the same thing disagreed below one cell:

     snapToGrid   at or above a cell, whole MULTIPLES of the cell count;
                  below it, whole DIVISORS - 80, 40, 20, 16, 10... - which is
                  what makes shrinking expressible at all. Deliberate, asked
                  for, and pinned: before it, every request from 1 to 239 came
                  back 160 and a shrink was impossible in Canvas or Art mode.
     the census   whole multiples only.

   So the control that exists to keep a trait on the grid handed back 40, and
   the shelf, the save, the download and Fit to grid all then said 40 was off
   it. I wrote the second of those this session and got it wrong.

   MEASURED, which settles it. Four traits - two at 1280, one at 40, one at
   1254 - with drawImage intercepted to read the scale each is actually drawn
   at onto the canvas autoCanvas picks:

     canvas picked   1280
     1280 traits     x1          whole
     40   trait      x32         whole
     1254 trait      x1.0207     smears

     the census flagged   the 1254 AND the 40

   The 40 lands perfectly. autoCanvas already knows this - its own test is
   s/gcd(C,s)===1, which a divisor satisfies - so the census was disagreeing
   with the thing that actually draws the collection.

   ONE PREDICATE, FIVE CALLERS. A whole multiple of the cell count, or a whole
   division of it: exactly what snapToGrid produces, so the control and the
   warning can no longer contradict each other. The false positive goes and the
   real one - 1254, which is neither - stays. */
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

/* ---- the predicate, beside the thing it has to agree with ----------- */
swap(block([
  'function layerPresence(layer){',
]), block([
  '/* Whether a canvas side sits on a collection of `cells` cells.',
  '',
  '   A WHOLE MULTIPLE OF THE CELL COUNT, OR A WHOLE DIVISION OF IT - which is',
  '   exactly the ladder snapToGrid offers, so the control that keeps you on the',
  '   grid and the warning that says you are off it cannot contradict each',
  '   other. They did: snap handed back 40 on a 160-cell project and four',
  '   separate messages then called 40 wrong.',
  '',
  '   MEASURED rather than reasoned. Two traits at 1280, one at 40 and one at',
  '   1254, with drawImage intercepted to read the scale each is drawn at onto',
  '   the canvas autoCanvas picks: 1280 goes at x1, the 40 at x32 - whole, it',
  '   lands perfectly - and the 1254 at x1.0207, which smears. Only the last is',
  '   a problem, and autoCanvas already knew it: its own wholeness test is',
  '   s/gcd(C,s)===1, which a divisor satisfies.',
  '',
  '   Both directions, because a trait bigger than the cell count and one',
  '   smaller than it are both fine for the same reason - the scale between',
  '   them and any standard canvas is a whole number. */',
  'function onCellGrid(w,h,cells){',
  '  const g=Math.max(1,cells|0);',
  '  const fits=v=>{ v=v|0; return v>0 && (v%g===0 || g%v===0); };',
  '  return fits(w) && fits(h);',
  '}',
  '',
  'function layerPresence(layer){',
]));

/* ---- 1. the census ------------------------------------------------- */
swap(block([
  '    /* Judged HERE, where w and h are still numbers. The first version parsed',
  '       them back out of the display key with a regex, which is two conversions',
  '       and a chance to get one wrong - and it did: the escaping was mangled on',
  '       the way in, so the pattern read a literal "d" instead of a digit, matched',
  '       nothing, and every size was called odd. Numbers that are already numbers',
  '       do not need parsing. */',
  '    if((t.w|0)%cells!==0 || (t.h|0)%cells!==0) bad.add(k);',
]), block([
  '    /* Judged HERE, where w and h are still numbers. The first version parsed',
  '       them back out of the display key with a regex, which is two conversions',
  '       and a chance to get one wrong - and it did: the escaping was mangled on',
  '       the way in, so the pattern read a literal "d" instead of a digit, matched',
  '       nothing, and every size was called odd. Numbers that are already numbers',
  '       do not need parsing. */',
  '    /* SUPERSEDES a multiples-only test, which was a false positive on every',
  '       size snapToGrid offers below one cell - measured, a 40px trait draws at',
  '       x32 onto a 1280 canvas and lands perfectly. See onCellGrid. */',
  '    if(!onCellGrid(t.w,t.h,cells)) bad.add(k);',
]));

/* ---- 2. the open canvas -------------------------------------------- */
swap(block([
  'function offGridNow(){',
  '  if(typeof ctx==="undefined" || !ctx || !art || !art.width) return false;',
  '  const g=Math.max(1,projectGrid|0);',
  '  return (art.width%g)!==0 || (art.height%g)!==0;',
  '}',
]), block([
  'function offGridNow(){',
  '  if(typeof ctx==="undefined" || !ctx || !art || !art.width) return false;',
  '  return !onCellGrid(art.width,art.height,projectGrid);',
  '}',
]));

/* ---- 3. the save ---------------------------------------------------- */
swap(block([
  '    const gcells=Math.max(1,projectGrid|0);',
  '    const offGrid = (art.width%gcells || art.height%gcells)',
]), block([
  '    const gcells=Math.max(1,projectGrid|0);',
  '    const offGrid = !onCellGrid(art.width,art.height,gcells)',
]));

/* ---- 4. the download ------------------------------------------------ */
swap(block([
  '    const dcells=Math.max(1,projectGrid|0);',
  '    const off = (art.width%dcells || art.height%dcells)',
]), block([
  '    const dcells=Math.max(1,projectGrid|0);',
  '    const off = !onCellGrid(art.width,art.height,dcells)',
]));

/* ---- 5. Fit to grid leaves an on-grid canvas alone ------------------ */
swap(block([
  '  const nw=gridFit(art.width), nh=gridFit(art.height);',
  '  if(nw===art.width && nh===art.height){',
]), block([
  '  const nw=gridFit(art.width), nh=gridFit(art.height);',
  '  /* Asked of onCellGrid, not of gridFit\'s own answer. gridFit returns the',
  '     nearest whole MULTIPLE, so on a canvas that is a whole DIVISION it would',
  '     propose a change to something already fine - and this button exists to',
  '     answer the warning, which no longer fires there. */',
  '  if(onCellGrid(art.width,art.height,projectGrid)){',
  '    toast("Already "+art.width+"\\u00d7"+art.height+", which is on the "',
  '      +Math.max(1,projectGrid|0)+" cell grid");',
  '    return;',
  '  }',
  '  if(nw===art.width && nh===art.height){',
]));

/* ---- and the sentences say both halves ------------------------------ */
for (const [a, b] of [
  ['). A trait has to divide into whole cells to line up."',
    '). A trait has to be a whole multiple of the cell count, or a whole division of it."'],
  ['+". A trait has to divide into whole cells to line up." : "";',
    '+". A trait has to be a whole multiple of the cell count, or a whole division of it." : "";'],
  ['      ? "A trait has to divide into whole cells to line up. Fit to grid resizes it to the nearest one that does."',
    '      ? "A trait has to be a whole multiple of the cell count, or a whole division of it. Fit to grid resizes it to the nearest size that works."'],
  ['+". Each of these has to divide into whole cells to line up." : "");',
    '+". Each of these has to be a whole multiple of the cell count, or a whole division of it." : "");'],
]) swap(a, b);

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

if (code.indexOf('function onCellGrid(w,h,cells){') < 0) throw new Error('the predicate did not land');

/* FIVE CALLERS AND ONE RULE. The whole point is that the census, the open
   canvas, the save, the download and Fit cannot answer differently. */
const uses = (code.match(/onCellGrid\(/g) || []).length;
if (uses !== 6) throw new Error('expected the predicate declared once and used five times, found ' + uses);

/* And no caller keeps its own copy of the arithmetic. */
for (const s of ['(art.width%gcells || art.height%gcells)', '(art.width%dcells || art.height%dcells)',
  '(t.w|0)%cells!==0', '(art.width%g)!==0'])
  if (code.indexOf(s) >= 0) throw new Error('a private copy of the rule survived: ' + s);

/* snapToGrid is untouched: it was right, and its ladder is what the predicate
   was made to agree with. */
if (code.indexOf('  if(v>=g) return Math.round(v/g)*g;') < 0)
  throw new Error('snapToGrid changed - it was the correct half');
if (code.indexOf('function gridLadder(cur){') < 0) throw new Error('the divisor ladder went');

/* The old sentence promised only one half of the rule. */
if (code.indexOf('divide into whole cells to line up') >= 0)
  throw new Error('a sentence still states only the multiples half');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
