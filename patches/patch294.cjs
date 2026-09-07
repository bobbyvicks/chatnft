/* CLEAR DOES NOT OFFER TO REMOVE THE EMPTY CHANCE, AND ITS DEFAULT IS TYPED
   IN THREE PLACES.

   Making the empty chance a saved setting left a hole in Clear that its own
   test found. Clear only asks "also remove these?" when it has something to
   name, and it builds that list from the rules, the answers, the draw order,
   the base colour and a grid that is not 160. The empty chance is a project
   decision now and is not in it - so on a project where it is the ONLY thing
   changed, Clear never asks, never removes it, and a re-import lands on
   somebody else's number.

   AND 0.35 WAS WRITTEN OUT THREE TIMES over the two changes: the variable, the
   "is it still default" test being added here, and the reset. Three copies of
   one default drift, and the way they drift is silent - Clear stops offering
   to remove a setting that IS changed, or offers to remove one that is not.
   One constant, named, and the markup's value="35" is the fourth copy that
   cannot be a constant, so the check below asserts they agree. */
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

/* ---- one default ---------------------------------------------------- */
swap('let emptyChance=0.35;', block([
  '/* Named because three places ask "is this still the default": the variable',
  '   below, the list Clear offers to remove, and the reset Clear performs. The',
  '   markup carries a fourth copy as value="35" that cannot be a constant, so',
  '   applyEmptyChance writes the control from the variable rather than trusting',
  '   the two to agree. */',
  'const EMPTY_DEFAULT=0.35;',
  'let emptyChance=EMPTY_DEFAULT;',
]));

/* ---- Clear offers it ------------------------------------------------ */
swap('    if(projectGrid!==160) have.push("the "+projectGrid+" cell grid");',
  block([
    '    if(projectGrid!==160) have.push("the "+projectGrid+" cell grid");',
    '    /* A project where this is the only thing changed used to get no',
    '       question at all, so Clear kept it and the next import read its',
    '       percentages against somebody else\'s number. */',
    '    if(emptyChance!==EMPTY_DEFAULT)',
    '      have.push("the "+Math.round(emptyChance*100)+"% empty chance");',
  ]));

/* ---- and puts it back ----------------------------------------------- */
swap(block([
  '    projectGrid=160;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
]), block([
  '    projectGrid=160;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '    emptyChance=EMPTY_DEFAULT;',
  '    { const e=$("cempty"); if(e) e.value=String(Math.round(emptyChance*100)); }',
]));

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['const EMPTY_DEFAULT=0.35;', 'let emptyChance=EMPTY_DEFAULT;',
  '    if(emptyChance!==EMPTY_DEFAULT)', '    emptyChance=EMPTY_DEFAULT;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE literal. Two would be the drift this exists to stop. */
const lits = (code.match(/0\.35/g) || []).length;
if (lits !== 1) throw new Error('expected one 0.35 in the code, found ' + lits);

/* AND THE MARKUP AGREES. value="35" is the copy that cannot be a constant, so
   it is asserted against the one that can - a page that opens showing 35 while
   the code means something else is a lie nobody would think to check. */
const markup = text.slice(0, text.indexOf('<script'));
const m = markup.match(/id="cempty"[^>]*value="(\d+)"/) || markup.match(/value="(\d+)"[^>]*id="cempty"/);
if (!m) throw new Error('could not read the empty chance out of the markup');
if (Number(m[1]) !== 35)
  throw new Error('the markup says ' + m[1] + '% and the code says 35%');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
