/* BUILD A CHARACTER AND LAYERS COME UP, AND COME UP TO FULL WIDTH.

   "make the build a character and layers also as big as the other bubbles on
   the page and put them above the traits".

   This supersedes a decision I made earlier today and wrote a test to defend.
   When the shelf was widened I deliberately left these two at 760px, on the
   grounds that they are forms rather than grids and their controls would hug
   the left of a very wide box. That reasoning was mine, it was never asked
   for, and it is now overruled by the person whose page it is - which is the
   right way round. The test that pinned 760 is updated rather than deleted, so
   the file still records that the width was a choice and says who made it.

   ABOVE THE TRAITS, and that order is worth stating because it is not
   arbitrary. Build a character is where you find out whether the collection
   works; the shelf is where you go to fix what it tells you. Putting the shelf
   first meant scrolling past 259 tiles to reach the thing that decides whether
   any of them are right - and the shelf is the tallest thing on the page by an
   order of magnitude, so "past" is a long way. Layers sits with it because the
   draw order is the other half of that same question. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const projOpen = kit.only(L, l => l === '  <section class="proj" id="proj" hidden>', 'the shelf');
const projEnd = kit.only(L, l => l === '    <div id="projbody"></div>', 'the shelf body');
if (L[projEnd + 1] !== '  </section>') throw new Error('the shelf does not close where expected');
const compOpen = kit.only(L, l => l === '  <section class="proj" id="compose" hidden>', 'the compose panel');
const layOpen = kit.only(L, l => l === '  <section class="proj" id="layers" hidden>', 'the layers panel');
if (!(projOpen < projEnd && projEnd + 1 < compOpen && compOpen < layOpen))
  throw new Error('the three panels are not in the order assumed');
/* The layers panel closes at the first </section> after it. */
let layEnd = -1;
for (let i = layOpen + 1; i < L.length && i < layOpen + 60; i++)
  if (L[i] === '  </section>') { layEnd = i; break; }
if (layEnd < 0) throw new Error('the layers panel does not close within 60 lines');
/* And compose closes at the first one after IT, which must be before layOpen. */
let compEnd = -1;
for (let i = compOpen + 1; i < layOpen; i++) if (L[i] === '  </section>') { compEnd = i; break; }
if (compEnd < 0) throw new Error('the compose panel does not close before layers opens');
if (compEnd + 1 !== layOpen) throw new Error('something sits between compose and layers');

const widthRule = kit.only(L, l => l === '#proj{width:min(1180px,92vw);}', 'the shelf width');

/* ---- WRITE ------------------------------------------------------- */

/* The two panels, lifted out and put back above the shelf. Taken as whole
   line ranges rather than rebuilt, so nothing inside them can be lost or
   reordered by this. */
const compose = L.slice(compOpen, compEnd + 1);
const layers = L.slice(layOpen, layEnd + 1);
if (!compose.length || !layers.length) throw new Error('one of the panels came out empty');

/* Bottom upward: remove them from below first, so the shelf's own line numbers
   are still good when they are put back above it. */
kit.replace(L, { start: compOpen, end: layEnd }, []);
kit.replace(L, { start: projOpen, end: projOpen - 1 },
  ['  <!-- Above the shelf, by request. Build a character is where you find out',
   '       whether the collection works and the shelf is where you go to fix what',
   '       it says - and the shelf is 259 tiles tall, so having it first meant',
   '       scrolling past all of them to reach the thing that judges them. -->']
    .concat(compose).concat(layers));

/* And the width. */
kit.replace(L, { start: widthRule, end: widthRule }, [
  '/* All three, not just the shelf. These two were deliberately left at 760 when',
  '   the shelf was widened - my reasoning was that a form stretched wide leaves',
  '   its controls hugging the left - and the person whose page it is asked for',
  '   them to match. Their reason is better than mine was: three panels on one',
  '   page at two different widths is a ragged edge, and the one that is narrower',
  '   reads as unfinished rather than as considered. */',
  '#proj,#compose,#layers{width:min(1180px,92vw);}',
]);

const grew = kit.save(doc, ({ lines, text }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('#proj,#compose,#layers{width:min(1180px,92vw);}') !== 1)
    throw new Error('the width rule did not land');
  if (has('#proj{width:min(1180px,92vw);}') !== 0) throw new Error('the old width rule is still there');
  /* Each panel appears exactly once - a slice-and-reinsert that duplicated one
     would leave two of it in the page and both would work. */
  for (const id of ['id="proj"', 'id="compose"', 'id="layers"'])
    if ((text.match(new RegExp(id, 'g')) || []).length !== 1)
      throw new Error(id + ' does not appear exactly once');
  /* And in the new order. */
  const iC = text.indexOf('id="compose"'), iL = text.indexOf('id="layers"'), iP = text.indexOf('id="proj"');
  if (!(iC < iL && iL < iP)) throw new Error('the panels are not in the order asked for');
  /* The shelf still has its body - proof the slice took whole sections. */
  if (has('    <div id="projbody"></div>') !== 1) throw new Error('the shelf lost its body');
});

console.log('index.html grew by ' + grew + ' bytes');
