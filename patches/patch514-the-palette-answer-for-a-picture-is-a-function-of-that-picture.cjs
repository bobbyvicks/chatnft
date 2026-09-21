/* THE PALETTE ANSWER FOR A PICTURE IS A FUNCTION OF THAT PICTURE.

   The second of the two colour contradictions. snapToPalette groups each
   FILE's own colours before the lookup, and the collection is 311 files
   stacked into one avatar - so the same drawn colour can land on two palette
   colours in two traits. Measured over the 311: 3,557 colours do.

   The decision is to leave it per file, so this patch changes no code at all
   and it refuses to write if it does: the whole script with comments
   stripped must come out byte for byte identical. What it adds is the
   recorded reason with its numbers, because a decision whose only output is
   a reason is measured on the reason - and a guard, tests/palettescope.spec.js,
   because a rule that is stated and not attached to a check is not a remedy.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = kit.only(L, l => l === 'const SNAP_GROUP_DE=2.3;', 'the grouping threshold');
if (L[at + 1] !== 'const SNAP_GROUP_MAX=8192;') throw new Error('the two grouping constants are not adjacent');
if (L[at + 2] !== 'function snapToPalette(d,n){') throw new Error('snapToPalette does not follow them');
if (L[at - 1] !== '}') throw new Error('the line above is not the end of nearestPaletteColour');

kit.replace(L, { start: at, end: at - 1 }, [
  '/* THE PALETTE ANSWER FOR A PICTURE IS A FUNCTION OF THAT PICTURE.',
  '',
  '   The grouping below folds colours nobody can tell apart - 2.3 dE - before',
  '   the lookup, and it does it over ONE FILE\'s census. The collection is 311',
  '   files that get stacked into one avatar, so the obvious question is whether',
  '   the same drawn colour should be made to land on the same palette colour in',
  '   every trait. Measured 2026-09-21 over the 311 working traits: no.',
  '',
  '   HOW BIG THE DISAGREEMENT IS. 19,377 colours are drawn in two or more',
  '   traits and 3,557 of them - 18.4% - land on more than one palette colour.',
  '   That sounds large and it is a fact about specks: the side that would',
  '   actually move if the collection were forced to agree is 6,292 of 2,161,883',
  '   opaque cells, 0.291%, in 69 of the 311. Require a colour to hold 32 cells',
  '   or more in each of two traits and 0 of 193 such colours disagree at all.',
  '',
  '   WHAT AGREEMENT WOULD COST. A map built over the union of all 311 repaints',
  '   233 traits and 193,084 cells - 31 times the 6,292 it removes, and 68.8% of',
  '   it lands on colours that already agreed. It also stops the answer being a',
  '   property of the picture: a map built from one layer folder and a map built',
  '   from the whole library disagree on 207 of 311 traits and 131,909 cells, so',
  '   there is no "the" collection map, there is one per run. (The shipped code',
  '   would not group a census that size at all - 298,936 colours against',
  '   SNAP_GROUP_MAX - so that option means lifting the cap as well.) Pinning',
  '   just the disputed colours to the collection majority is worse again: it',
  '   creates 67,132 split pairs over 90,721 charged cells while removing',
  '   28,489.',
  '',
  '   WHY, MECHANICALLY. A minority placement is not a mistake; it is the',
  '   grouping putting a colour where the REST OF THAT FILE\'s colours went.',
  '   backgrounds/Portal Test Chamber draws #585858 on 12 cells and sends it to',
  '   #333c3c. Of the 83 colours within 1.66 dE of #585858 in that file, 80 -',
  '   4,407 cells - go to #333c3c with it; 3, carrying 7 cells between them, are',
  '   already on #625565, which is the collection\'s majority for #585858 and',
  '   19.05 dE from #333c3c. Forcing agreement would put those 12 cells 19 dE',
  '   from the 4,407 they sit in. Cross-file agreement and within-file agreement',
  '   are in competition, and the cells that disagree within a file are in ONE',
  '   picture, while the ones that disagree across files are in two pictures at',
  '   different places on a canvas - most of them covered by whatever is stacked',
  '   above. The largest minority region anywhere in the collection at a',
  '   distance a viewer could name is 22 cells of a 25,600-cell canvas.',
  '',
  '   SO IT STAYS PER FILE, and not as a sentence. tests/palettescope.spec.js',
  '   runs one file alone and in a batch and asserts it comes out the same',
  '   colour, on a fixture that is shown first to be able to tell the two apart:',
  '   #585858 alone lands on #625565, and pooled with #585856 - 1.28 dE away,',
  '   inside SNAP_GROUP_DE - both land on #344241, 20.4 dE from where it was.',
  '   orderfree.spec.js:118 already asserts a batch result "equals its own',
  '   single-image run", but its fixture was built for the engine\'s k-means RNG',
  '   and nothing shows it sensitive to this, which is why the new one exists.',
  '   Decided 2026-09-21. */',
]);

const grew = kit.save(doc, ({ code }) => {
  /* NOT ONE CHARACTER OF CODE. This patch is a recorded reason and a test;
     if it moved any behaviour it would be a different patch with a different
     name, and the comment it adds would be describing something it had just
     changed. */
  /* Blank lines only: stripping a comment block that owned whole lines leaves
     the line breaks that surrounded it, so the comparison is line by line over
     the lines that hold something. */
  const bare = (t) => kit.lines(t).map(l => l.trim()).filter(Boolean);
  const was = bare(kit.code(kit.scriptOf(doc.original))), now = bare(code);
  if (was.length !== now.length)
    throw new Error('the code changed - ' + was.length + ' lines became ' + now.length);
  for (let i = 0; i < was.length; i++)
    if (was[i] !== now[i]) throw new Error('the code changed at line ' + (i + 1) + ': ' + now[i]);
  if (code.indexOf('const SNAP_GROUP_DE=2.3;') < 0) throw new Error('the threshold is gone');
  const script = kit.scriptOf(doc.lines.join(doc.EOL));
  for (const s of ['THE PALETTE ANSWER FOR A PICTURE IS A FUNCTION OF THAT PICTURE',
    'tests/palettescope.spec.js', '6,292 of 2,161,883', '80 -'])
    if (script.indexOf(s) < 0) throw new Error('missing: ' + s);
  /* and the reason sits above the thing it is about */
  if (script.indexOf('THE PALETTE ANSWER FOR A PICTURE') > script.indexOf('const SNAP_GROUP_DE=2.3;'))
    throw new Error('the comment is not above the constants');
});

fs.renameSync(TMP, FILE);
console.log('patch514 written, ' + grew + ' bytes');
