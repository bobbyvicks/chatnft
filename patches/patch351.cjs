/* THE CONTROLS THAT MOVED TOOK THEIR SIZING WITH THEM - AND DID NOT.

   Transform, Base layer and Save moved out of the side column into cards the
   tool rail opens. Every sizing rule for those controls is scoped to .side,
   both the desktop density pass and the phone restore that undoes it, so a
   control in a card matched neither and fell through to the browser default.

   I reasoned that would be fine: the shrink is .side-scoped too, so a control
   in a card should land at its ORIGINAL size. Measured on a 380px viewport, a
   select in a panel is 19px - under the 27px a thumb needs, and smaller than
   either of the two rules it was supposed to be between. The reasoning was
   wrong and the test said so.

   So the selectors carry .card as well. Both blocks, together, for the reason
   the phone block already gives in its own words: "each selector carries .side
   because the rules it is undoing do, and a bare one would lose on
   specificity". A pair that stops matching the same elements is a pair that
   stops undoing each other.
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
/* PINNED TO A LINE START. The phone block repeats each desktop selector with
   two spaces in front of it, so a bare substring matches both and the swap
   cannot tell which one it is about. */
const line = s => NL + s;
const swapLine = (from, to) => swap(line(from), line(to));

/* ---- 1. the everyday sizing reaches a panel ----------------------------- */
swap(NL + block([
  '.side select,.side input[type=number],.side input[type=text]{',
]), NL + block([
  '/* .card as well: three sections moved into panels the tool rail opens, and',
  '   a control that matches neither this nor the phone restore below falls',
  '   through to the browser default - measured at 19px on a phone, under the',
  '   27 a thumb needs and smaller than either rule intended. */',
  '.side select,.side input[type=number],.side input[type=text],',
  '.card select,.card input[type=number],.card input[type=text]{',
]));

swapLine('.side select{padding-right:22px;',
  '.side select,.card select{padding-right:22px;');

swapLine('.side .btn{padding:4px 10px; line-height:1.3;}',
  '.side .btn,.card .btn{padding:4px 10px; line-height:1.3;}');

swapLine('.side .mini{padding:4px 10px; font-size:12px; line-height:1.3;}',
  '.side .mini,.card .mini{padding:4px 10px; font-size:12px; line-height:1.3;}');

swapLine('.side .tool{width:38px; height:38px;}',
  '.side .tool,.card .tool{width:38px; height:38px;}');

/* ---- 2. and so does the phone restore ----------------------------------- */
swap(block([
  '  .side .btn{padding:8px 11px; line-height:1.5;}',
  '  .side .mini{padding:7px 12px; font-size:12.5px; line-height:1.5;}',
  '  .side .tool{width:42px; height:42px;}',
]), block([
  '  /* THE PAIR HAS TO MATCH THE SAME ELEMENTS. Every selector above gained',
  '     .card when three sections moved into panels; if these had not, the',
  '     restore would undo a shrink that never applied and leave the moved',
  '     controls at the browser default on a phone. */',
  '  .side .btn,.card .btn{padding:8px 11px; line-height:1.5;}',
  '  .side .mini,.card .mini{padding:7px 12px; font-size:12.5px; line-height:1.5;}',
  '  .side .tool,.card .tool{width:42px; height:42px;}',
]));

swap(block([
  '  .side select,.side input[type=number],.side input[type=text]{',
  '    padding:6px 7px; line-height:1.5; min-height:30px;}',
  '  .side select{padding-right:22px;}',
]), block([
  '  .side select,.side input[type=number],.side input[type=text],',
  '  .card select,.card input[type=number],.card input[type=text]{',
  '    padding:6px 7px; line-height:1.5; min-height:30px;}',
  '  .side select,.card select{padding-right:22px;}',
]));

swap(block([
  '  .side .savebar input,.side .savebar select{',
  '    padding-block:6px; padding-left:9px; font-size:12.5px; line-height:1.5;}',
  '  .side .savebar input{padding-right:9px;}',
  '  .side .chips button{padding:7px 6px;}',
]), block([
  '  .side .savebar input,.side .savebar select,',
  '  .card .savebar input,.card .savebar select{',
  '    padding-block:6px; padding-left:9px; font-size:12.5px; line-height:1.5;}',
  '  .side .savebar input,.card .savebar input{padding-right:9px;}',
  '  .side .chips button,.card .chips button{padding:7px 6px;}',
]));

swapLine('  .side input[type=color]{height:30px;}',
  '  .side input[type=color],.card input[type=color]{height:30px;}');

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
// eslint-disable-next-line no-new-func
new Function(script);

const css = text.slice(0, text.indexOf('</style>'));

/* THE TWO BLOCKS STAY IN STEP. A restore that matches fewer elements than the
   shrink it undoes leaves the difference at the browser default, which is the
   defect this fixes and the one a later edit would reintroduce. */
const pairs = [
  ['.side .btn,.card .btn{padding:4px 10px', '.side .btn,.card .btn{padding:8px 11px'],
  ['.side .mini,.card .mini{padding:4px 10px', '.side .mini,.card .mini{padding:7px 12px'],
  ['.side .tool,.card .tool{width:38px', '.side .tool,.card .tool{width:42px'],
];
for (const [day, phone] of pairs) {
  if (css.indexOf(day) < 0) throw new Error('the everyday rule lost .card: ' + day);
  if (css.indexOf(phone) < 0) throw new Error('the phone rule lost .card: ' + phone);
}
if (css.indexOf('.card select,.card input[type=number],.card input[type=text]') < 0)
  throw new Error('panel fields are back to the browser default');

/* AND NOTHING SCOPED ONLY TO .side IS LEFT SIZING A CONTROL THAT MOVED. */
for (const s of ['.side .btn{', '.side .mini{', '.side .tool{'])
  if (css.indexOf(s) >= 0) throw new Error('a rule still reaches only the column: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
