/* THE THUMB STOPS BEFORE THE TRACK DOES, AND NOTHING SAID WHY.

   The track runs from "this trait at the ceiling and every sibling at the
   floor" to the reverse, so it covers everything the SET could ever express.
   What a trait can reach right now depends on where its siblings actually are,
   which is less. Measured on eyes after seeding: dragging hard to the rare end
   leaves the thumb at 14054 of 20000, because 2 against twenty 14s is as rare
   as the store goes from there.

   That is the honest limit - integer weights 1..99 is the database's column,
   not a preference - and the thumb refusing to follow is right. Being silent
   about it is not: it reads as a broken control, and the thing the owner needs
   to know is that the way to go further is to make a sibling commoner.

   Said in the words column, where the trait's own sentence already lives, and
   only at the end of travel. */
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

/* The repaint learns about the ends. It already has the live weights, which is
   the only place that knows a trait is sitting on the floor or the ceiling. */
swap(block([
  '  function repaint(){',
  '    let sum=0; for(const v of live.values()) sum+=v;',
  '    for(const [id,cell] of cells){',
  '      const share=live.get(id)/sum;',
  '      cell.share.textContent=pctLabel(share);',
  '      cell.say.textContent = cell.unset ? cell.unsetWords : multWords(n*share);',
  '    }',
  '  }',
]), block([
  '  function repaint(){',
  '    let sum=0; for(const v of live.values()) sum+=v;',
  '    for(const [id,cell] of cells){',
  '      const w=live.get(id), share=w/sum;',
  '      cell.share.textContent=pctLabel(share);',
  '      /* AT THE END OF TRAVEL, say which end and what to do about it. The',
  '         limit is the database\'s column - integers 1 to 99 - reached against',
  '         wherever the siblings happen to be, so the way further is to move',
  '         one of them rather than to keep pulling at this one. A thumb that',
  '         stops with no explanation reads as a broken control. */',
  '      cell.say.textContent = cell.unset ? cell.unsetWords',
  '        : w<=RAR_MIN ? "as rare as it goes here - make another one commoner to go further"',
  '        : w>=RAR_MAX ? "as common as it goes here - make another one rarer to go further"',
  '        : multWords(n*share);',
  '    }',
  '  }',
]));

if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['        : w<=RAR_MIN ? "as rare as it goes here',
  '        : w>=RAR_MAX ? "as common as it goes here',
  '      const w=live.get(id), share=w/sum;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);
/* The ordinary words must still be reachable, or every row reads as an end. */
if (code.indexOf('        : multWords(n*share);') < 0)
  throw new Error('the ordinary sentence is unreachable');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
