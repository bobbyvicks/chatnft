/* null FROM THE SERVER WOULD HAVE MEANT 0% EMPTY.

   Found by the test written for the clamp, which is the only reason it was
   found: `Number(null)` is 0, and 0 is a PERFECTLY LEGAL empty chance - it
   means every optional layer appears on every character. So the range check
   waved it through and the "not the default" test agreed it was a real
   choice, and a null would have been adopted, saved, and pushed back up as
   somebody's deliberate 0%.

   Every optional layer on every character is not a small mistake: on this
   collection it would put a hat, a mask, glasses, chains, ears and extras on
   all of them at once.

   The range check cannot catch it, because the value it produces is inside the
   range. The type can: PostgREST returns a JSON number for a real column, so
   anything that is not already a number is not an answer - null, undefined, a
   string, a missing field. That refuses the whole class rather than the one
   value the test happened to try. */
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
  'async function takeEmptyChance(c){',
  '  const theirs=Number(c&&c.empty_chance);',
  '  const ok=isFinite(theirs)&&theirs>=0&&theirs<=0.9;',
]), block([
  'async function takeEmptyChance(c){',
  '  /* A NUMBER, not something that can be coerced into one. Number(null) is 0',
  '     and 0 is a legal empty chance - every optional layer on every character',
  '     - so a null would have passed the range check, read as a deliberate',
  '     choice, been saved, and been pushed back up as somebody\'s 0%. The range',
  '     cannot catch that because the value it produces is inside the range.',
  '     PostgREST sends a JSON number for a real column, so anything else -',
  '     null, undefined, a string, a missing field - is not an answer. */',
  '  const raw=c?c.empty_chance:null;',
  '  const theirs=typeof raw==="number"?raw:NaN;',
  '  const ok=isFinite(theirs)&&theirs>=0&&theirs<=0.9;',
]));

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

if (code.indexOf('  const theirs=typeof raw==="number"?raw:NaN;') < 0)
  throw new Error('did not land');
if (code.indexOf('const theirs=Number(c&&c.empty_chance);') >= 0)
  throw new Error('the coercing read survived');

/* THE RANGE CHECK STAYS. It is what refuses a number that is real and wrong -
   a 1 written by hand into a project file - and the type check does not
   replace it. Both, or the two classes are not both covered. */
if (code.indexOf('  const ok=isFinite(theirs)&&theirs>=0&&theirs<=0.9;') < 0)
  throw new Error('the range check went with it');

/* And 0 is still reachable: it is a real setting, not a rejected one. The
   guard is about where the value CAME from, never about its size. */
if (code.indexOf('theirs>0') >= 0)
  throw new Error('zero was excluded, and zero is a legitimate empty chance');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
