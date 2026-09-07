/* THE PHONE LOST ITS SECOND COLUMN, AND THE COMMENT THAT SAID IT WOULD NOT
   WAS WRONG.

   patch250 claimed: "On a 375px phone the panel is 92vw = 345px, 309px inside
   its padding, and the column count is floor((309 + 9) / (150 + 9)) = 2."

   Measured at 375x812 after it landed: ONE column, 307px wide, a 293px canvas
   for a 160x160 trait. The content box is 307px, not 309 - 345 less 36px of
   padding AND 2px of border - and two 150px columns with a 9px gap need 309.
   It missed by two pixels, which is the width of the border I forgot.

   The number was derived by hand and written as though it had been measured.
   It is now measured, at five widths, in tests/shelfwidth.spec.js.

   min(150px,47%) rather than a media query: two columns at 47% plus the 9px
   gap come to 94% of the row and always fit, at any width, so the shelf keeps
   two columns down to the narrowest phone instead of down to a threshold that
   has to be picked and then drifts. Above ~330px of content box the 150px is
   the smaller of the two and nothing on a desktop moves - verified at 620,
   820, 1024 and 1280, where the column counts are unchanged at 3, 4, 5 and 7.

   The risk this carries is that min() inside minmax() inside repeat() is one
   expression: if any browser rejects it the whole declaration is dropped and
   .items falls back to a single column - the very thing being fixed, wearing
   the shape of a fix. The spec asserts the column COUNT, so a browser that
   drops it reds rather than looking tidy. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const OLD = '.items{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:9px;}';
const NEW = '.items{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(150px,47%),1fr)); gap:9px;}';

/* CHECK - patch250's rule is there, exactly once, and its wrong comment with
   it. Both are replaced together; a corrected rule under a comment that still
   states the false arithmetic is worse than either alone. */
const at = kit.only(L, l => l === OLD, 'the .items grid rule from patch250');
const wrong = kit.only(L, l => l.indexOf('   and floor(318/117) is 2 - so the narrow end does not move. */') === 0,
  'the close of patch250 comment');
if (wrong !== at - 1) throw new Error('the comment does not sit directly above the rule');
const openAt = kit.only(L, l => l.indexOf('/* 150 rather than 108.') === 0, 'the open of patch250 comment');
if (openAt !== wrong - 3) throw new Error('the comment is not the four lines assumed');

kit.replace(L, { start: openAt, end: at }, [
  '/* 150 rather than 108. At 108 a 160x160 trait was drawn into a 99px canvas',
  '   in a 760px panel, six to a row; at 150 in the wider panel it is seven to a',
  '   row at 141px.',
  '   The min() is what keeps the phone. A flat 150px minimum needs 309px of',
  '   content box for two columns and a 375px phone has 307 - so it gave ONE',
  /* "first written", not "first shipped" - it never left this machine. The
     wording was corrected in index.html after this ran, so this line no
     longer matches the file it wrote; it is kept as the reasoning, not as
     something to re-execute. */
  '   column and a 293px tile, which is how this was first written. Two columns',
  '   at 47% plus the 9px gap are 94% of the row and fit at every width, and',
  '   above ~330px of content box the 150px is the smaller of the pair, so no',
  '   desktop width moves. Measured in tests/shelfwidth.spec.js, because the',
  '   arithmetic here was wrong the first time it was written down. */',
  NEW,
]);

const grew = kit.save(doc, ({ lines }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has(NEW) !== 1) throw new Error('the corrected .items rule did not land');
  if (has(OLD) !== 0) throw new Error('the flat 150px rule is still there');
  /* The false sentence must be gone from the file, not merely superseded
     further down. A retraction that reaches the person and not the artefact
     has not landed. */
  if (lines.some(l => l.indexOf('floor(318/159)') >= 0 || l.indexOf('floor(318/117)') >= 0))
    throw new Error('the wrong arithmetic is still in the file');
  if (has('#proj{width:min(1180px,92vw);}') !== 1) throw new Error('patch250 width was disturbed');
});

console.log('index.html grew by ' + grew + ' bytes');
