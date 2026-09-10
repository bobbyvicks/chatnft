/* AN EMPTY FIX PIXELS PAGE WAS TWO THIRDS NOTHING.

   patch427 made the panel fill the window, which moved the dead space from
   outside the panel to inside it. Measured at 1600x1000 with nothing loaded:
   the drop zone and the control row end at y505, and the panel runs to y968 -
   463px of empty panel, plus a 300px column on the right holding nothing
   because the Last fixed rail is hidden until something is in it.

   Both of those are the same mistake: a layout that reserves room for things
   that are not there.

   THE DROP ZONE TAKES THE ROOM WHILE THERE IS NOTHING ELSE. It is the only
   thing on the page at that moment and it is what you are meant to hit, so
   it is the whole panel rather than a 150px box with a field of nothing under
   it. The moment a picture or a batch is in, it goes back to its own size and
   the previews get the space instead.

   AND THE RAIL'S COLUMN IS NOT THERE UNTIL THE RAIL IS. grid-template-columns
   keeps a track whether or not anything sits in it, so a hidden aside was
   still costing 300px of width.

   Both written with :has(), which reads the hidden attribute the page already
   sets - so there is no second piece of state to keep in step with the first,
   and no class for a future caller to forget. CSS.supports reports it
   available in the browser this runs in; where it is not, the page falls back
   to exactly what it does today. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = kit.only(L, l => l === '#land[data-page="fixer"] .fixcols{flex:1 1 auto;}',
  'the columns rule');
kit.replace(L, { start: at, end: at }, [
  '#land[data-page="fixer"] .fixcols{flex:1 1 auto;}',
  '/* NO COLUMN FOR A RAIL THAT IS NOT THERE. A grid track exists whether or',
  '   not anything is placed in it, so the hidden aside was costing 300px of',
  '   width on an empty page. */',
  '@media (min-width:1100px){',
  '  .fixcols:has(> .fixrail[hidden]){grid-template-columns:minmax(0,1fr);}',
  '}',
  '/* AND THE DROP ZONE TAKES THE ROOM WHILE THERE IS NOTHING ELSE ON THE',
  '   PAGE. It is the only thing there and the thing you are meant to hit; a',
  '   150px box with 463px of empty panel under it is a layout holding space',
  '   for something that has not happened yet. It goes back to its own size',
  '   the moment a picture or a batch arrives, which is what the two hidden',
  '   attributes below already say - so this reads them rather than adding a',
  '   third piece of state to keep in step. */',
  '.fixwork{display:flex; flex-direction:column; align-self:stretch;}',
  '/* ORDER IS RESET INSIDE THIS COLUMN. The landing page sets .drop{order:3}',
  '   to arrange ITS grid, and that declaration lands on any .drop in any flex',
  '   or grid parent - so the moment this became a flex column the dropzone',
  '   jumped below the controls. Document order is what is wanted here. */',
  '.fixwork > *{order:0;}',
  '/* align-self:stretch above, or the column is only as tall as its content',
  '   and there is no height for the dropzone to grow into. */',
  '.fixwork:has(> #fixpair[hidden]):has(> #fixbatch[hidden]) #fixdrop{',
  '  flex:1 1 auto; display:flex; flex-direction:column; justify-content:center;',
  '  /* CENTRED, both ways. Left-aligned text floating in the middle of a',
  '     700px dashed box reads as a layout accident; centred it reads as a',
  '     target. align-items rather than a width, or the folder button',
  '     stretches the whole width of the panel. */',
  '  align-items:center; text-align:center; gap:8px;}',
]);

const bytes = kit.save(doc, ({ text }) => {
  if (!/\.fixcols:has\(> \.fixrail\[hidden\]\)\{grid-template-columns:minmax\(0,1fr\);\}/.test(text))
    throw new Error('a hidden rail still costs a column of width');
  if (!/\.fixwork:has\(> #fixpair\[hidden\]\):has\(> #fixbatch\[hidden\]\) #fixdrop\{/.test(text))
    throw new Error('the drop zone does not take the empty room');
  /* THE LANDING PAGE'S order: RULES DO NOT REACH INTO THIS COLUMN. .drop
     carries order:3 from the landing grid and it applies in any flex parent,
     which put the dropzone below the controls the moment this became one. */
  if (!/\.fixwork > \*\{order:0;\}/.test(text))
    throw new Error('the landing page ordering still reaches into this column');
  if (!/\.fixwork\{display:flex; flex-direction:column; align-self:stretch;\}/.test(text))
    throw new Error('the column has no height for the dropzone to grow into');
  /* IT READS THE PAGE'S OWN STATE. A class set from script is a second copy
     of the same fact and the two drift the first time somebody adds a path
     that shows the previews without going through the one that sets it. */
  if (/classList\.(add|toggle)\("haswork"|classList\.(add|toggle)\('haswork'/.test(text))
    throw new Error('the layout grew a second piece of state to keep in step');
  /* And the columns are still two when the rail IS there. */
  if (!/@media \(min-width:1100px\)\{ \.fixcols\{grid-template-columns:minmax\(0,1fr\) 300px;\} \}/.test(text))
    throw new Error('the two-column layout was lost');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
