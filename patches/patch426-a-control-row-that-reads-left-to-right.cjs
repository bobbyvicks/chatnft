/* THE CONTROL ROW READ AS TWO CLUSTERS AND A BAR.

   Looking at the page after widening it: Mode and Pixel size at the far left,
   the two switches jammed against the far right by a margin-left:auto that
   was put there when the row was crowded, a thousand pixels of nothing
   between them, and Fix it wrapped onto its own line as a full-width orange
   bar - 1180px across at a 1600 screen, and wider on a wider one.

   .btn is width:100% because almost every button on this site is in a narrow
   panel where that is right. In a wide row it is not: a primary action the
   width of the screen is not more prominent, it is just large, and it pushed
   itself onto a second line on every screen size measured.

   So the row groups left in the order you use it - Mode, Pixel size, Save at,
   Snap, Fix it - and Fix it is sized to its words. Nothing here changes what
   any control does; this is the same row with the gap taken out.

   Measured at 1600 wide, with a picture loaded:

     before   row 63px - two lines - Fix it 1180px wide on the second,
              the switches at x 955 and 1088
     after    row 34px - one line  - Fix it   68px wide, and the switches
              at x 435 and 568, next to what they belong with

   None of it is measured on the narrow layout, where the row already stacks
   and .btn going back to full width is what should happen - which is why the
   rule is written against this row on this page and not against .btn. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the button is sized to its words ------------------------------ */
{
  const at = kit.only(L, l => l === '.fixsay{min-height:35px; margin:2px 0 4px;}', 'the readout line rule');
  kit.replace(L, { start: at, end: at }, [
    '.fixsay{min-height:35px; margin:2px 0 4px;}',
    '/* A PRIMARY ACTION THE WIDTH OF THE SCREEN IS NOT MORE PROMINENT. .btn is',
    '   width:100% because almost every button here is in a narrow panel, where',
    '   that is right; in this row it wrapped Fix it onto a line of its own and',
    '   made it 1180px across at a 1600 screen. Sized to its words instead,',
    '   and only in this row - the narrow layout stacks and full width is',
    '   correct there. */',
    '@media (min-width:760px){',
    '  #fixer .agjob .btn{width:auto; padding-left:20px; padding-right:20px;}',
    '}',
  ]);
}

/* ---- and the row groups left --------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf('    <label class="olrow" style="gap:6px; margin-left:auto"') === 0,
    'the switch pushed to the far right');
  kit.replace(L, { start: at, end: at }, [
    '    <!-- WAS margin-left:auto, from when the readout shared this row and',
    '         the row was crowded. With the readout on its own line that put a',
    '         thousand pixels of nothing in the middle of five controls. -->',
    '    <label class="olrow" style="gap:6px"',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  if (!/#fixer \.agjob \.btn\{width:auto;/.test(text))
    throw new Error('the button is still the width of the screen');
  /* AND ONLY IN THIS ROW. Every other button on the site is full width on
     purpose, in panels narrow enough for that to be right. */
  if (!/\.btn\{width:100%;/.test(text))
    throw new Error('every button on the site just changed shape');
  const row = (text.match(/<div class="agjob">[\s\S]*?<\/div>/g) || [])
    .find(r => /id="fixrun"/.test(r));
  if (!row) throw new Error('the fixer control row was not found');
  /* COMMENTS STRIPPED FIRST. The comment recording what was removed says the
     words it removed, and a check that reads them fails on its own note. */
  if (/margin-left:auto/.test(row.replace(/<!--[\s\S]*?-->/g, '')))
    throw new Error('the row still splits itself in two');
  /* The switches are still there and still labelled. */
  if (!/id="fixgrid"/.test(row) || !/id="fixsnap"/.test(row))
    throw new Error('the row lost a switch');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
