/* THE BLOCK patch391 OPENED IS FLAT, WHICH READS AS A BUG.

   patch391 wrapped the eleven apply passes in `if(!viewOnly){ ... }` and left
   their indentation where it was, so twenty-three lines sit at the same two
   spaces as the code outside the brace. It runs correctly and it looks like a
   missing brace, in a file where every other block is indented and where a
   reader's first move on seeing this would be to go looking for a defect that
   is not there.

   Nothing else changes: the same lines, the same order, two more spaces each.
   The check below proves that by comparing the text with its indentation
   stripped against what it was before. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const open = kit.only(L, l => l === '  if(!viewOnly){', 'the view-only guard');
let close = -1;
for (let i = open + 1; i < L.length && i < open + 60; i++) {
  if (L[i] === '  }') { close = i; break; }
}
if (close < 0) throw new Error('the view-only block does not close within sixty lines');
if (L[open + 1] !== '  shelfItems=items;')
  throw new Error('the block does not open on the line this expects');
if (L[close - 1] !== '  applyAgentRules(items);')
  throw new Error('the block does not end on the line this expects');

/* What is inside, with its indentation taken off, so the check afterwards can
   prove nothing but indentation moved. */
const before = L.slice(open + 1, close).map(l => l.replace(/^\s+/, '')).join('\n');
const moved = L.slice(open + 1, close).map(l => (l.trim() === '' ? l : '  ' + l));
kit.replace(L, { start: open + 1, end: close - 1 }, moved);

const bytes = kit.save(doc, ({ lines }) => {
  const o = lines.findIndex(l => l === '  if(!viewOnly){');
  if (o < 0) throw new Error('the guard is gone');
  let c = -1;
  for (let i = o + 1; i < lines.length && i < o + 60; i++) if (lines[i] === '  }') { c = i; break; }
  if (c < 0) throw new Error('the block no longer closes');
  const after = lines.slice(o + 1, c).map(l => l.replace(/^\s+/, '')).join('\n');
  if (after !== before)
    throw new Error('something other than indentation changed inside the block');
  /* And it really is indented now, or this did nothing and said it did. */
  const flat = lines.slice(o + 1, c).filter(l => l.trim() !== '' && l.indexOf('    ') !== 0);
  if (flat.length)
    throw new Error(flat.length + ' line(s) inside the block are still flat, first: '
      + flat[0].trim().slice(0, 50));
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
