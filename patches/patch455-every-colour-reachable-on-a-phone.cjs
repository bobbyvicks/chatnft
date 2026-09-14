/* ON A PHONE, SIX COLUMNS OF EVERY ROW WERE OFF THE SIDE OF THE SCREEN.

   Found while measuring the panel on a 390x844 phone, and confirmed against
   the committed version to be sure it was not something this week's work
   introduced - identical there: #projpal reports a scrollWidth of 527 inside
   a clientWidth of 321. The palette is 16 columns and the touch sheet floors
   every target at 30px, so one row wants 16*30 + 15*3 = 525px in a box that
   is 321. The overflow is not scrollable and not clipped visibly - it simply
   runs off, and the right-hand six columns of all sixteen rows cannot be seen
   or tapped. About 40% of the palette, unreachable, on every phone.

   THE 16-WIDE GRID CANNOT SURVIVE A PHONE. It is the width the palette is
   published at and its rows are ramps, which is why every other screen keeps
   it - but 16 tappable swatches need 525px and a phone has 321. Something has
   to give, and the three candidates were: fewer columns and a taller palette,
   smaller swatches under the touch floor, or a sideways scroll inside the
   panel. Asked, and the answer was fewer columns: every colour reachable at
   full size, the ramps breaking up on phones only.

   auto-fill RATHER THAN A NUMBER. Nine is what fits a 390px phone, but a 414
   phone fits ten and a 600px tablet fifteen, and a hard 9 would waste that
   room and go on wasting it on whatever comes next. minmax(30px,1fr) asks for
   as many 30px columns as the box holds, which is the rule - "as many as fit
   at a size you can hit" - rather than one measurement of one phone.

   IT IS TALLER, AND THAT IS THE TRADE THAT WAS CHOSEN. Nine columns is 29
   rows rather than 16, so the panel scrolls further on a phone than it did.
   It was already scrolling; what changes is that scrolling now reaches every
   colour instead of two thirds of them. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  .swatches,.swrow{grid-template-columns:repeat(10,1fr);} .sw{min-height:30px;}',
    'the touch swatch rule');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '  /* AND THE PROJECT PALETTE COMES DOWN FROM SIXTEEN. Sixteen 30px targets',
    '     need 525px of row and a phone gives the panel 321, so the last six',
    '     columns of every row ran off the side - not clipped, not scrollable,',
    '     just gone, which is 40% of the palette on every phone. Measured on the',
    '     committed version too, so it is old rather than new.',
    '',
    '     auto-fill, not a count: nine fits a 390 phone, ten fits a 414 and',
    '     fifteen fit a 600 tablet, and the rule that means all of those is "as',
    '     many 30px columns as the box holds". The 16-wide ramps are what every',
    '     screen with room still shows - this is the one place that cannot.',
    '',
    '     It is taller: 29 rows instead of 16. That is the trade, chosen over',
    '     swatches too small to hit and over a sideways scroll. */',
    '  #projpal{grid-template-columns:repeat(auto-fill,minmax(30px,1fr));}',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  if (!/#projpal\{grid-template-columns:repeat\(auto-fill,minmax\(30px,1fr\)\);\}/.test(text))
    throw new Error('the palette still asks for 16 columns on a phone');
  /* INSIDE THE TOUCH QUERY, or every screen loses the published 16-wide grid
     whose rows are the ramps. */
  const q = text.indexOf('@media (max-width:820px){');
  const rule = text.indexOf('#projpal{grid-template-columns:repeat(auto-fill');
  if (q < 0 || rule < q)
    throw new Error('the phone rule is outside the touch query');
  /* AND THE WIDE GRID IS UNTOUCHED. */
  if (!/#projpal\{display:grid; grid-template-columns:repeat\(16,1fr\); gap:3px;/.test(text))
    throw new Error('the published 16-wide grid is gone');
  /* The 30px floor is what the column count is derived from, so if it moves
     the minmax above is describing a size nothing else uses. */
  if (!/\.sw\{min-height:30px;\}/.test(text))
    throw new Error('the touch target floor moved, so the column rule is now wrong');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
