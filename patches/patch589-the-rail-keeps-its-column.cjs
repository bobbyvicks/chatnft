/* THE RAIL KEEPS ITS COLUMN WHEN THE TOP BAR BECOMES ONE ROW.

   patch588 let the options strip run the full width, so at 1280 and wider it
   is one 41 px row where it was a 79 px two-row corner. That gave the stage
   38 px more height - and the tool rail, which wraps to the columns its
   height forces, then fitted in two columns instead of three, so column one
   (an auto track) shrank from 175 px to 123 px. Measured at 1280x900 by the
   full suite: the colour box under it showed 48 of 64 colours where it had
   shown all 64 (whitebg.spec.js), and restoring a draft - which adds a bar
   above the strip - pushed the rail back to three columns and took 52 px
   off the canvas width (linesupwiththeart.spec.js allows 40).

   Column one keeps at least 227 px - four rail columns, which is what it
   was at 1280x900 with a colourful trait open (measured before patch588:
   colour box 227 wide, 64 of 64 swatches in 220 px). A first try at 175
   (three columns, what a trait with few colours gave) still cut the box to
   48 of 64: the swatch grid fits 20 px swatches across, so 175 gives 6 a
   row and 11 rows where 227 gives 9 a row and 8. The canvas is limited by
   height, not width, at these sizes (the comment on the 1520 rule measures
   it), so the width costs the art nothing, and the rail and the colour box
   are laid out as they were. The phone layout sets its own single column
   and is not touched. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const i = kit.only(L, l => l === '.app{display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto auto auto 1fr auto;', 'the editor grid');
kit.replace(L, { start: i, end: i }, [
  '/* Column one at least 227 px - four rail columns, what it was at 1280x900',
  '   before the options strip became one row (patch588). With the extra',
  '   height the rail fitted in fewer columns, the track shrank, the colour',
  '   box fell to 48 of 64 colours and a restored draft took 52 px of canvas',
  '   width. The canvas is limited by height here, so this costs it nothing.',
  '   The phone layout sets its own single column. */',
  '.app{display:grid; grid-template-columns:minmax(227px,auto) 1fr; grid-template-rows:auto auto auto auto 1fr auto;',
]);

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch589 written');
