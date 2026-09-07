/* THE SHELF GETS THE WIDTH THE PAGE ALREADY USES, AND BIGGER TILES.

   Measured on the landing page at 1280x900, with the real collection seeded
   (259 traits over thirteen layers):

     SECTION.extract   1178px
     SECTION#proj       760px    <- 259 traits judged six to a row
     SECTION#compose    760px
     SECTION#layers     760px

   So the page already has a full-width panel. .extract was widened for this
   exact reason and its comment says so - "it was a 760px card floating in a
   1585px page" - and every word of that applies to the shelf, which is the
   other place a trait gets judged. 520px of a 1280px screen was empty either
   side of it.

   #proj rather than .proj: the class is shared by cloud, compose and layers,
   and those are forms, not grids - a form stretched to 1180px leaves its
   controls hugging the left of a very wide box. The page is deliberately a
   centred stack of different widths already (extract 1178, how 760, drop
   560), so a wide shelf reads as part of that rather than as a ragged edge.
   An id beats a class on specificity, so this wins wherever it sits.

   AND THE TILES. 108px minimum gave a 99px canvas for a 160x160 trait - the
   shelf is where you decide whether a trait is right, and it was showing it
   at 62% of its own resolution. 150px gives seven columns of 155px and a
   141px canvas inside the wider panel: 42% bigger, and still one more per
   row than the six the narrow panel managed.

   The narrow end is unchanged by arithmetic rather than by hope. On a 375px
   phone the panel is 92vw = 345px, 309px inside its padding, and the column
   count is floor((309 + 9) / (150 + 9)) = 2 - exactly what minmax(108px)
   gave, because 150 + 9 divides 318 evenly. Nothing about the phone moves. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const PROJ_RULE = '.proj{width:min(760px,92vw); text-align:left; padding:18px; border-radius:13px;';
const PROJ_TAIL = '  background:var(--panel); border:1px solid var(--line);}';
const ITEMS = '.items{display:grid; grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); gap:9px;}';

/* CHECK - each anchor exists exactly once. .proj's second line is the same
   text as .extract's second line, so it is found by its neighbour. */
const projAt = kit.only(L, l => l === PROJ_RULE, 'the .proj width rule');
const projTailAt = kit.near(L, PROJ_TAIL, -1, '.proj{width:min(760px', 'the .proj rule close');
if (projTailAt !== projAt + 1) throw new Error('.proj rule is not two lines as assumed');
const itemsAt = kit.only(L, l => l === ITEMS, 'the .items grid rule');

/* CHECK - the width being copied is really what .extract uses, rather than a
   number remembered from a measurement taken in a different session. */
kit.only(L, l => l.indexOf('.extract{width:min(1180px,92vw);') === 0, 'the .extract width rule');

/* WRITE - the shelf's own width, after the shared rule so it reads in order. */
kit.replace(L, { start: projTailAt, end: projTailAt }, [
  PROJ_TAIL,
  '/* The shelf is the other panel a trait gets judged in, so it takes the same',
  '   width .extract takes and for the same reason. Kept off .proj because the',
  '   cloud, compose and layers panels share that class and are forms, which do',
  '   not improve at 1180px. */',
  '#proj{width:min(1180px,92vw);}',
]);

/* WRITE - bigger tiles. itemsAt moved by the lines just inserted above it. */
const itemsNow = itemsAt + 5;
if (L[itemsNow] !== ITEMS) throw new Error('the .items line is not where the insert left it');
kit.replace(L, { start: itemsNow, end: itemsNow }, [
  '/* 150 rather than 108. At 108 a 160x160 trait was drawn into a 99px canvas',
  '   in a 760px panel, six to a row; at 150 in the wider panel it is seven to a',
  '   row at 141px. On a 375px phone both give two columns - floor(318/159) is 2',
  '   and floor(318/117) is 2 - so the narrow end does not move. */',
  '.items{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:9px;}',
]);

const grew = kit.save(doc, ({ lines }) => {
  /* Assert the RESULTING TEXT, not that a replace was called. A multi-line
     match against this CRLF file is a silent no-op that reads as success. */
  const has = s => lines.filter(l => l === s).length;
  if (has('#proj{width:min(1180px,92vw);}') !== 1) throw new Error('the #proj width did not land');
  if (has('.items{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:9px;}') !== 1)
    throw new Error('the .items width did not land');
  /* And that the old rule is gone AS A RULE. Searching the whole file for
     "minmax(108px" would find the comment written above explaining it. */
  if (has(ITEMS) !== 0) throw new Error('the old .items rule is still there');
  /* The shared rule is untouched - compose and layers must not have moved. */
  if (has(PROJ_RULE) !== 1) throw new Error('the shared .proj rule was disturbed');
});

console.log('index.html grew by ' + grew + ' bytes');
