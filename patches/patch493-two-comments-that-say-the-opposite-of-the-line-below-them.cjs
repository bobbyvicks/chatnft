/* TWO COMMENTS THAT SAY THE OPPOSITE OF THE LINE BELOW THEM.

   Both turn functions currently read, in this order:

     a comment headed "NO fitZoom", explaining that restoreImage refits
     a comment headed "ONLY WHEN THE SIZE MOVED", correcting the one above
     if(nw!==W||nh!==H) fitZoom();

   The first block is patch486's, superseded by patch488 an hour later. 488
   replaced the CODE and inserted its own comment above it, and left the one it
   was correcting exactly where it was. So the file now states a rule, states
   its correction, and then does the corrected thing - and a reader who stops
   at the first block comes away believing a turn never refits, which is the
   opposite of what happens.

   This is the fifth comment in one day that says something untrue, and the
   third that I introduced while fixing the previous one. The pattern is
   mechanical rather than careless: every patch script here inserts a comment
   above a line it is changing, and none of them looks up to see whether the
   comment already sitting there was the argument for the line being replaced.

   NOTHING IS LOST. Both measurements the old blocks carried - 12 to 36 to 12
   on a turn that moved nothing, and the 1280 trait dropping back to fit - are
   already in the surviving comment, which is why it is safe to take the old
   ones out rather than merge them.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE MEASUREMENTS SURVIVE ELSEWHERE, asserted before the blocks holding them
   are removed. If patch488's comment is ever reworded to drop these, this
   refuses and whoever did it has to decide deliberately. */
const KEEP = [
  '     Measured: 12 to 36 to 12 on a turn that moved nothing. */',
  '     corner: zoom 48 before, 9 after the turn, 48 when refitted with the',
];
for (const k of KEEP) kit.only(L, l => l === k, 'the surviving measurement: ' + k.trim().slice(0, 40));

const STALE = [
  [
    '  /* NO fitZoom. restoreImage refits when the canvas size changes and says',
    '     it is the one place every such route passes through; this was a second',
    '     copy of that rule which ALSO fired when the size had not changed. On a',
    '     square trait - which is what this collection is made of - a quarter',
    '     turn leaves the canvas alone, so every 90 degree turn on a 1280 trait',
    '     dropped the view back to fit and somebody working at 3x lost their',
    '     place. Measured on a 40x60 at 37 degrees: 12 to 36 to 12. */',
  ],
  [
    '  /* NO fitZoom - see rotateQuarter. With Keep size on a turn at any angle',
    '     comes back on the canvas it started on, so this refitted a view that',
    '     had not moved; and when the canvas HAS changed, restoreImage has',
    '     already done it. */',
  ],
];

for (const block of STALE) {
  const start = kit.only(L, l => l === block[0], 'the stale block: ' + block[0].trim().slice(0, 40));
  for (let i = 0; i < block.length; i++)
    if (L[start + i] !== block[i])
      throw new Error('the block is not what this expects, at line ' + (start + i + 1)
        + ':\n  want: ' + block[i] + '\n  got:  ' + L[start + i]);
  /* AND IT REALLY IS ABOVE A LINE THAT REFITS - otherwise it is not stale and
     this is deleting a true comment.

     A BOUNDED LOOK-AHEAD rather than a walk. The first version tried to step
     over the intervening lines and stopped on the continuation lines of the
     SECOND comment block, deciding the first was not stale. The thing being
     asserted is simply "a refit is a few lines below this", so that is what it
     asks, and it refuses if a new function starts first. */
  const LOOK = 20;
  let found = -1;
  for (let j = start + block.length; j < Math.min(L.length, start + block.length + LOOK); j++) {
    if (/^function |^async function /.test(L[j])) break;
    if (/fitZoom\(\)/.test(L[j])) { found = j; break; }
  }
  if (found < 0)
    throw new Error('the block at line ' + (start + 1) + ' has no refit within '
      + LOOK + ' lines, so it is not stale');
  kit.replace(L, { start: start, end: start + block.length - 1 }, []);
}

const grew = kit.save(doc, ({ text, lines, codeLines }) => {
  if (text.indexOf('/* NO fitZoom') >= 0)
    throw new Error('a "NO fitZoom" claim survives, and the code refits');
  for (const k of KEEP)
    if (lines.indexOf(k) < 0) throw new Error('a measurement was lost: ' + k.trim());

  /* BOTH TURNS STILL REFIT, CONDITIONALLY. Deleting a comment must not have
     taken the line it sat above. */
  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  };
  for (const fn of ['function rotateQuarter(cw){', 'function rotateFree(deg){']) {
    const fits = bodyOf(fn).filter(l => /fitZoom\(\)/.test(l));
    if (fits.length !== 1) throw new Error(fn + ' has ' + fits.length + ' refits, expected 1');
    if (!/if\(\w+!==\w+\|\|\w+!==\w+\) fitZoom\(\)/.test(fits[0]))
      throw new Error(fn + ' refits without checking the size moved: ' + fits[0].trim());
  }
  if (bodyOf('function rotateHalf(){').some(l => /fitZoom\(\)/.test(l)))
    throw new Error('rotateHalf refits a canvas that cannot have changed size');
});

fs.renameSync(TMP, FILE);
console.log('patch493 written, ' + grew + ' bytes');
