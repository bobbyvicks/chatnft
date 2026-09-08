/* THE CURRENT COLOUR BOX WAS TWO LINES TALL TO SAY ONE THING.

   Measured in the editor before touching it: the .cur box is 46px tall and
   303px wide, holding a 28px colour well beside a two-line text column - an
   uppercase "CURRENT" caption at 13px stacked over a 17px hex string. The
   caption is the taller half of the column and says what the swatch beside it
   already shows.

   So the caption goes and the two become one row. The well drops 28 to 22 -
   still a comfortable target, and no longer the tallest thing in a panel whose
   tool buttons are 42px - and the padding goes 5 to 3.

   NOT LOST, MOVED: the input's aria-label now names it, so a screen reader
   still hears "current colour" where it used to read the caption, and the hex
   carries a title for a pointer. Deleting the only label a control had would
   be shrinking the wrong thing.

   The .cur small rule goes with the element it styled - a rule matching
   nothing is a thing the next reader has to check. */
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

/* ---- 1. one row, and the label kept where it is still read ------------ */
swap(block([
  '    <div class="cur">',
  '      <input type="color" id="picker" value="#000000" aria-label="Pick any colour">',
  '      <span><small>Current</small><span class="mono" id="curhex">#000000</span></span>',
  '    </div>',
]), block([
  '    <!-- One row. The caption that used to sit above the hex was the taller',
  '         half of a two-line column, saying what the well beside it shows. It',
  '         lives in the aria-label now, so nothing that could only hear it has',
  '         lost anything. -->',
  '    <div class="cur">',
  '      <input type="color" id="picker" value="#000000" aria-label="Current colour - pick any colour">',
  '      <span class="mono" id="curhex" title="The colour you are painting with">#000000</span>',
  '    </div>',
]));

/* ---- 2. and the box shrinks to fit it --------------------------------- */
swap(block([
  '.cur{display:flex; align-items:center; gap:9px; padding:5px; border-radius:8px;',
  '  background:var(--panel-2); border:1px solid var(--line);}',
  '.cur input[type=color]{width:28px; height:28px; padding:0; border:1px solid #ffffff24;',
  '  border-radius:7px; background:none; cursor:pointer; flex:none;}',
  '.cur small{display:block; color:var(--dim); font-size:10px; text-transform:uppercase;',
  '  letter-spacing:.09em; line-height:1.25;}',
  '/* #curhex is otherwise unstyled and takes body\'s 14px/1.5, which is what',
  '   made the text column taller than the colour well it sits beside. */',
  '.cur .mono{font-size:12.5px; line-height:1.25;}',
]), block([
  '/* One row, sized by the well rather than by a stacked caption. Measured',
  '   before: 46px tall for a 28px swatch and a hex string, with the uppercase',
  '   caption the taller half of the text beside it. */',
  '.cur{display:flex; align-items:center; gap:8px; padding:3px 5px; border-radius:8px;',
  '  background:var(--panel-2); border:1px solid var(--line);}',
  '.cur input[type=color]{width:22px; height:22px; padding:0; border:1px solid #ffffff24;',
  '  border-radius:6px; background:none; cursor:pointer; flex:none;}',
  '/* #curhex is otherwise unstyled and takes body\'s 14px/1.5, which is what',
  '   made the text taller than the colour well it sits beside. */',
  '.cur .mono{font-size:12.5px; line-height:1.2;}',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* THE CONTROL AND ITS READOUT ARE BOTH STILL THERE. Shrinking a box by losing
   what is in it is not shrinking it. */
for (const id of ['picker', 'curhex'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('lost the element with id ' + id);

/* AND IT IS STILL LABELLED. The caption was the only text naming this control;
   removing it without moving it would leave a bare swatch. */
const curAt = markup.indexOf('<div class="cur">');
const curEnd = markup.indexOf('</div>', curAt);
const cur = markup.slice(curAt, curEnd);
if (cur.indexOf('aria-label="Current colour') < 0)
  throw new Error('the control lost the only name it had');
if (cur.indexOf('<small>') >= 0)
  throw new Error('the stacked caption is still there, so the box is still two lines');

/* NO RULE LEFT MATCHING NOTHING. */
if (text.indexOf('.cur small{') >= 0)
  throw new Error('a style for an element that no longer exists');

/* The colour setter still writes to the readout it always did. */
if (code.indexOf("$('curhex').textContent=h;") < 0)
  throw new Error('the hex readout is no longer updated');

fs.writeFileSync(FILE, text);
console.log('index.html shrank by ' + (before.length - text.length) + ' bytes');
