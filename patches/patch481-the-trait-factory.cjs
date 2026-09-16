/* THE TRAIT FACTORY: ONE PAGE, THE WHOLE SCREEN.

   "make the main page and Fix Pixels one page and have it be titled 'Trait
   Factory'. Remove the 'Edit pixel art on the grid it was actually drawn on.
   Nothing leaves your device.' Make everything fit so that i dont have to
   scroll the page at all. Last edited right side, make pull a trait the main
   feature aso make it a bit bigger and have that be in the middle with fix
   pixels below, have the entire screen filled but dont make it busy and have
   boxes be touching"

     Drop a PNG   |  PULL A TRAIT OFF A CHARACTER  |  LAST EDITED
     Import       |                                |
     Sort         |--------------------------------|
                  |  FIX PIXELS                    |

   NOTHING MOVES TO MERGE THE TWO PAGES. Every section already sits inside
   #land in document order, carrying the page it belongs to as a class, and
   #land carries the page being shown - so joining Fix pixels to the main page
   is one class changed from pg-fixer to pg-home. The layout is grid placement,
   which ignores document order, so the fixer section stays where it is in the
   file and lands under the extractor on screen.

   THE ONE THING THAT DID MOVE is a wrapper around the file controls, because a
   named column cannot hold four separate children without them overlapping.

   THE BRACE. The page-hiding rules are one declaration of thirty selectors and
   the {display:none;} hangs off the LAST of them, which was a pg-fixer line.
   Deleting the fixer lines the obvious way takes the brace with it and leaves
   twenty-nine dangling selectors and NO page hiding anywhere in the app: every
   page's markup renders at once, on every page. The brace moves up with the
   last line that survives, and the check at the bottom counts the selectors and
   asserts the block still ends in one.

   A BOOKMARK AT #/fixer STILL WORKS, and it took reading the router to see why
   it would not have. pageFromHash returns "home" for a hash it does not
   recognise, so the page would be right - and the address bar would still read
   #/fixer, because showPage only writes the hash when a PRESS moved the page.
   Worse, pressing the tab could not clear it: showPage returns early when the
   page asked for is the one already shown. So the hash is normalised once, on
   the way in, with replaceState - no history entry, no hashchange, nothing to
   re-enter the router.

   WHAT WENT, to make it fit. The tagline, as asked. And the two paragraphs at
   the top of Fix pixels explaining what it does - 892px of panel and most of it
   prose. The title says what it is; the tooltip on the drop zone says the rest.

   THE PANELS SCROLL, THE PAGE DOES NOT. That is the only way an 892px panel and
   a list that grows share one viewport, and it is what was asked for: the PAGE
   not scrolling. Each column is its own scroll container with its own border,
   and the gap is zero so the boxes touch. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the fifth page stops being one -------------------------------- */
{
  const from = kit.only(L, l => l === '/* The fifth page, same shape. */', 'the fifth page group');
  /* To the LAST of the ten, not to the last of the first four. A first run of
     this stopped at the agent line and left the four #land[data-page="fixer"]
     rules behind - which the count check caught as 24 where 20 was expected. */
  const to = kit.only(L, l => l === '#land[data-page="fixer"] .pg-agent,', 'the last of its rules');
  kit.replace(L, { start: from, end: to }, [
    '/* THE FIFTH PAGE IS PART OF THE FIRST ONE NOW. Fix pixels was its own page',
    '   and is a column of the Trait Factory, so .pg-fixer is .pg-home and the ten',
    '   rules that hid it from four pages and hid four pages from it are gone with',
    '   it. Superseding rather than deleting the comment they carried: the block is',
    '   still pairwise and still for the same reason. */',
  ]);
}
{
  /* And the two remaining mentions, one of which carries the brace. */
  const at = kit.only(L, l => l === '#land[data-page="fixer"] .pg-final,', 'the fixer-to-final rule');
  kit.replace(L, { start: at, end: at }, []);
}
{
  const at = kit.only(L, l => l === '#land[data-page="final"] .pg-agent,', 'the last surviving rule');
  kit.replace(L, { start: at, end: at + 1 }, [
    '/* THE BRACE LIVES ON THE LAST LINE. It used to hang off a pg-fixer rule, and',
    '   taking that line out the obvious way would have left every selector above',
    '   it dangling and nothing in the app hidden on any page. */',
    '#land[data-page="final"] .pg-agent{display:none;}',
  ]);
}

/* ---- 2. the page is the whole screen ----------------------------------- */
{
  const at = kit.only(L, l => l === '.brand{display:flex; align-items:center; gap:11px;}', 'the brand rule');
  kit.replace(L, { start: at, end: at }, [
    '.brand{display:flex; align-items:center; gap:11px;}',
    '/* ================= the Trait Factory =================================',
    '',
    '   One page, the whole viewport, three columns that touch.',
    '',
    '     getting a file in | PULL A TRAIT | what you last edited',
    '                       | FIX PIXELS   |',
    '',
    '   PLACED, NOT MOVED. Grid placement ignores document order, so the fixer',
    '   section stays where it has always been in the file and lands under the',
    '   extractor on screen. Only the file controls needed a wrapper, because one',
    '   named column cannot hold four children without stacking them on top of',
    '   each other.',
    '',
    '   THE PAGE DOES NOT SCROLL AND THE COLUMNS DO. An 892px panel and a list',
    '   that grows cannot share a viewport any other way, and it is the page not',
    '   scrolling that was asked for. minmax(0,1fr) on the rows rather than 1fr:',
    '   a grid row is auto-sized to its content by default and refuses to shrink',
    '   below it, which is what makes a nested scroll container overflow its',
    '   track instead of scrolling.',
    '',
    '   Only on this page. Every other one keeps the centred column it has. */',
    '#land[data-page="home"]{',
    '  height:100dvh; min-height:0; overflow:hidden;',
    '  grid-template-columns:minmax(200px,0.85fr) minmax(380px,2.4fr) minmax(220px,1fr);',
    '  grid-template-rows:auto auto minmax(0,1.15fr) minmax(0,1fr);',
    '  gap:0; padding:10px 12px 0; align-content:stretch; justify-items:stretch;',
    '  align-items:stretch;}',
    '#land[data-page="home"]>.brand{grid-column:1/-1; grid-row:1; justify-content:center;',
    '  margin-bottom:2px;}',
    '#land[data-page="home"]>.pagenav{grid-column:1/-1; grid-row:2; justify-self:center;',
    '  margin-bottom:8px;}',
    '/* THE BOXES TOUCH. No gap, and every panel drops the radius on the edges it',
    '   shares so two borders read as one line rather than two rounded corners with',
    '   a sliver between them. */',
    '#land[data-page="home"]>.fopen{grid-column:1; grid-row:3/span 2;}',
    '#land[data-page="home"]>.extract{grid-column:2; grid-row:3;}',
    '#land[data-page="home"]>#fixer{grid-column:2; grid-row:4;}',
    '#land[data-page="home"]>#recent{grid-column:3; grid-row:3/span 2;}',
    '#land[data-page="home"]>.fopen,',
    '#land[data-page="home"]>.extract,',
    '#land[data-page="home"]>#fixer,',
    '#land[data-page="home"]>#recent{',
    '  width:auto; max-width:none; min-width:0; min-height:0; margin:0;',
    '  border-radius:0; overflow:auto; overscroll-behavior:contain;}',
    '/* The four outside corners, so the page is a panel rather than a slab. */',
    '#land[data-page="home"]>.fopen{border-radius:12px 0 0 12px;}',
    '#land[data-page="home"]>.extract{border-radius:0 12px 0 0;}',
    '#land[data-page="home"]>#fixer{border-radius:0 0 12px 0;}',
    '#land[data-page="home"]>#recent{border-radius:0 12px 12px 0;}',
    '/* THE LEFT COLUMN. The three ways a file gets in, stacked, with the drop',
    '   zone taking whatever is left so the column is filled rather than a short',
    '   stack against a tall empty box. */',
    '.fopen{display:flex; flex-direction:column; gap:10px; padding:14px;',
    '  text-align:left; background:var(--panel); border:1px solid var(--line);}',
    '/* THE ORDER AND THE WIDTH ARE ALREADY SPOKEN FOR. This page used to be one',
    '   flex column sequenced by `order` - .drop is 3, .bulkrow is 4, .err is 5 -',
    '   and .bulkrow is sized for a page-wide row. Inside a box of their own, both',
    '   numbers are wrong: measured, Sort by inventory has no order at all so it',
    '   sorted to the top above the drop zone (y105 against y150), and the import',
    '   row came out 560px wide in a 200px column - 360px of sideways scrolling in',
    '   a box that should not scroll sideways at all. */',
    '.fopen>*{order:0; width:auto; max-width:100%; min-width:0;}',
    '.fopen>#drop{flex:1; min-height:120px; margin:0; width:auto;}',
    '.fopen>.bulkrow{margin:0;}',
    '.fopen .mini{width:100%;}',
    '/* PULL A TRAIT IS THE MAIN FEATURE, so it gets the bigger share of the',
    '   middle and its heading stops being a 13px label. */',
    '#land[data-page="home"]>.extract>h2{font-size:15px;}',
    '/* AND ITS DROP ZONE WAS SIZED FOR A PAGE OF ITS OWN: 44px of padding top',
    '   and bottom, measured at 193px for a box that says two lines. It shares a',
    '   column now, and that padding is 52px of the 94px the panel was short by. */',
    '#land[data-page="home"]>#fixer .drop{padding:18px 16px;}',
    '#land[data-page="home"]>#fixer>h2{font-size:13px; text-transform:uppercase;',
    '  letter-spacing:.1em; color:var(--muted);}',
    '/* Down to one column when there is no room for three. The page is allowed to',
    '   scroll here, because three columns of controls on a phone is not a screen',
    '   anybody can use without it. */',
    '@media (max-width:900px){',
    '  #land[data-page="home"]{height:auto; min-height:100dvh; overflow:visible;',
    '    grid-template-columns:1fr; grid-template-rows:auto; gap:12px; padding:16px 12px;}',
    '  #land[data-page="home"]>.fopen,',
    '  #land[data-page="home"]>.extract,',
    '  #land[data-page="home"]>#fixer,',
    '  #land[data-page="home"]>#recent{grid-column:1; grid-row:auto; overflow:visible;',
    '    border-radius:12px;}',
    '}',
  ]);
}

/* ---- 2b. the rules written for a page that is gone ---------------------- */
{
  /* Four rules scoped to #land[data-page="fixer"] that can never match again.
     Two of them said something worth keeping and they are said again below,
     against the panel rather than against a page that no longer exists. */
  const from = kit.only(L, l => l === '/* THE ONE PAGE THAT IS LOOKING AT PICTURES, not reading prose. 1180 is a',
    'the wide-panel rule');
  const to = kit.only(L, l => l === '#land[data-page="fixer"] .fixcols{flex:1 1 auto;}',
    'the last of them');
  kit.replace(L, { start: from, end: to }, [
    '/* SUPERSEDED, because the page they were written for is gone. Fix pixels is',
    '   a column of the Trait Factory now, and its width comes from that grid',
    '   rather than from a rule of its own - the measurement those rules carried',
    '   was that 1180 is a readable line length and a wasteful picture frame, and',
    '   the grid gives the middle column 2.4 of 4.25 parts for the same reason.',
    '',
    '   The two that still do work are kept, against the panel: the section is a',
    '   column so its own scroll area can grow, and the picture columns inside it',
    '   take the room that gains them. */',
    '#fixer{display:flex; flex-direction:column;}',
    '#fixer .fixcols{flex:1 1 auto;}',
  ]);
}
/* ---- 2c. a result tile is its own size --------------------------------- */
{
  /* .fixtile img was width:100%, which was harmless while the panel was 2100px
     wide and a track was about 190. In a column it is not: measured, a batch of
     three came back with each 160px thumbnail RENDERED at 347 - a 2.2x upscale
     of pixel art, on the page whose whole job is pixel art.

     Its own size, capped by the cell. The bytes were already small and the
     point of the thumbnail was always that they are; this stops the screen
     pretending they are bigger. */
  const at = kit.only(L, l => l === '.fixtile img{width:100%; height:auto; aspect-ratio:1; object-fit:contain;',
    'the result tile picture');
  kit.replace(L, { start: at, end: at }, [
    '.fixtile img{max-width:100%; align-self:center; height:auto;',
    '  aspect-ratio:1; object-fit:contain;',
  ]);
}
/* ---- 3. the tab, and the tagline --------------------------------------- */
{
  const at = kit.only(L, l => l === '    <button type="button" class="pgtab" data-page="home">Main</button>',
    'the main tab');
  kit.replace(L, { start: at, end: at }, [
    '    <button type="button" class="pgtab" data-page="home"',
    '      title="Pull a trait off a character, fix pixel art, and pick up what you last edited">Trait Factory</button>',
  ]);
}
{
  const at = kit.only(L, l => l === '    <button type="button" class="pgtab" data-page="fixer"',
    'the fix pixels tab');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    <!-- Fix pixels has no tab of its own: it is the lower half of the Trait',
    '         Factory now. -->',
  ]);
}
{
  const at = kit.only(L, l => l.indexOf('<p class="tag pg-home">Edit pixel art on the grid it was') >= 0,
    'the tagline');
  kit.replace(L, { start: at, end: at }, []);
}

/* ---- 4. Fix pixels joins the page -------------------------------------- */
{
  const at = kit.only(L, l => l === '<section class="panelbox pg-fixer" id="fixer">', 'the fixer section');
  kit.replace(L, { start: at, end: at }, [
    '<section class="panelbox pg-home" id="fixer">',
  ]);
}
{
  /* The prose goes. 892px of panel, most of it explaining what the title says. */
  const fromAt = kit.only(L, l => l === '  <h2>Fix pixels</h2>', 'the fixer heading');
  let end = fromAt;
  while (end + 1 < L.length && L[end + 1].indexOf('<div class="fixcols">') < 0) end++;
  kit.replace(L, { start: fromAt, end: end }, [
    '  <!-- THE PROSE WENT. Two paragraphs explaining what this does, on a panel',
    '       that has to share a screen now - and the drop zone below says the same',
    '       thing in its own title. The measurement that sent them: 892px of panel',
    '       at a 1078px viewport. -->',
    '  <h2 title="Turns fake pixel art - an upscale, an AI render, a blurred or off-grid sprite - into real pixel art at the size it was drawn at. Four independent detectors find the grid; each cell becomes one true pixel. the Retro Diffusion Pixel Art Fixer, running here. Nothing leaves your device.">Fix pixels</h2>',
  ]);
}

/* ---- 5. the left column exists ----------------------------------------- */
{
  const from = kit.only(L, l => l === '  <div class="restore pg-home" id="restore" hidden>',
    'the restore bar');
  const to = kit.only(L, l => l === '  <p class="err" id="err" role="status"></p>',
    'the error line');
  kit.replace(L, { start: from, end: from }, [
    '  <!-- GETTING A FILE IN, in one box. A named grid column cannot hold four',
    '       children without stacking them on top of one another, so this is the',
    '       one thing the layout needed moved. -->',
    '  <div class="fopen pg-home">',
    L[from],
  ]);
  const end = kit.only(L, l => l === '  <p class="err" id="err" role="status"></p>',
    'the error line, again');
  kit.replace(L, { start: end, end: end }, [
    L[end],
    '  </div>',
  ]);
  void to;
}

/* ---- 5b. and the router stops believing in it -------------------------- */
{
  /* THE ONE THAT MATTERS. Leaving "fixer" in PAGES leaves showPage willing to
     set data-page="fixer" - and the ten rules that hid the other pages FROM
     that page are gone, so every section in the app renders at once on it.
     Measured on exactly that build: data-page came back "fixer" and the Agent
     panel was display:block beside the extractor. Taking it out of the list is
     what makes showPage fall through to home, which is where Fix pixels is. */
  const at = kit.only(L, l => l === 'const PAGES=["home","project","settings","agent","fixer","final"];',
    'the page list');
  kit.replace(L, { start: at, end: at }, [
    'const PAGES=["home","project","settings","agent","final"];',
  ]);
}
/* ---- 6. an old bookmark still lands somewhere -------------------------- */
{
  const at = kit.only(L, l => l === '  return PAGES.indexOf(h)>=0 ? h : "home";', 'the hash lookup');
  kit.replace(L, { start: at, end: at }, [
    '  /* THE PAGE THAT BECAME PART OF ANOTHER ONE. Fix pixels is the lower half of',
    '     the Trait Factory now, and a link saved before that has to land on it',
    '     rather than falling through to the same place by accident. */',
    '  if(h==="fixer") return "home";',
    '  return PAGES.indexOf(h)>=0 ? h : "home";',
  ]);
}
{
  const at = kit.only(L, l => l === '  showPage(pageFromHash(),false);', 'the first render');
  kit.replace(L, { start: at, end: at }, [
    '  /* AND THE ADDRESS BAR IS PUT RIGHT ONCE, on the way in. Without this the',
    '     page would be correct and the URL would still read #/fixer - and pressing',
    '     the tab could not clear it, because showPage returns early when the page',
    '     asked for is the one already shown. replaceState rather than assigning to',
    '     location.hash: no history entry to press Back through, and no hashchange',
    '     to re-enter the router with. */',
    '  try{',
    '    if(String(location.hash||"").replace(/^#\\/?/,"")==="fixer")',
    '      history.replaceState(null,"","#/home");',
    '  }catch(_){ }',
    '  showPage(pageFromHash(),false);',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE BRACE. This is the one that would have broken every page in the app.
     Scoped to the hiding block by its own bounds rather than to every line that
     starts with #land - the layout rules added below start that way too, and a
     check that swept them reported the block broken when it was not. */
  /* kit.lines, not a split on the newline: the file is CRLF, so splitting on
     the newline alone leaves a carriage return on the end of every line and
     every exact-match below silently fails. */
  const all = kit.lines(text);
  const head = all.findIndex(l => l === '#land[data-page="home"] .pg-project,');
  if (head < 0) throw new Error('the page hiding block is gone entirely');
  let tail = head;
  while (tail < all.length && all[tail].indexOf('{display:none;}') < 0) tail++;
  if (tail >= all.length)
    throw new Error('the page hiding block no longer ends in a declaration, so nothing is hidden anywhere');
  const rules = all.slice(head, tail + 1).filter(l => /^#land\[data-page=/.test(l));
  for (const r of rules.slice(0, -1))
    if (!/,$/.test(r.trim()))
      throw new Error('a page hiding selector does not end in a comma: ' + r.trim());
  /* TWENTY, not thirty: four pages left, four times three. */
  if (rules.length !== 20)
    throw new Error('there are ' + rules.length + ' page hiding rules, not the 20 that four pages need');
  if (/#land\[data-page="fixer"\]/.test(text))
    throw new Error('a rule still hides things from a page that no longer exists');

  /* FIX PIXELS IS ON THE PAGE. */
  if (text.indexOf('<section class="panelbox pg-home" id="fixer">') < 0)
    throw new Error('Fix pixels is not part of the main page');
  if (/class="[^"]*pg-fixer/.test(text))
    throw new Error('something is still labelled as belonging to the fixer page');
  if (text.indexOf('data-page="fixer"') >= 0)
    throw new Error('the Fix pixels tab is still there');
  if (text.indexOf('>Trait Factory</button>') < 0)
    throw new Error('the page is not called the Trait Factory');

  /* THE TAGLINE WENT, as asked. */
  if (text.indexOf('Edit pixel art on the grid it was') >= 0)
    throw new Error('the tagline is still on the page');
  /* AND SO DID THE PROSE THAT MADE THE PANEL 892px. */
  if (text.indexOf('This is their quick pass: three detectors') >= 0)
    throw new Error('the Fix pixels explanation is still taking the height it needs to fit');

  /* THE FOUR BOXES ARE PLACED, AND THEY TOUCH. */
  for (const [sel, area] of [
    ['>.fopen{grid-column:1; grid-row:3/span 2;}', 'the file controls'],
    ['>.extract{grid-column:2; grid-row:3;}', 'pull a trait'],
    ['>#fixer{grid-column:2; grid-row:4;}', 'fix pixels'],
    ['>#recent{grid-column:3; grid-row:3/span 2;}', 'last edited'],
  ]) {
    if (text.indexOf('#land[data-page="home"]' + sel) < 0)
      throw new Error(area + ' is not placed on the page');
  }
  if (!/#land\[data-page="home"\]\{[^}]*gap:0;/.test(text))
    throw new Error('there is a gap between the boxes');
  if (!/#land\[data-page="home"\]\{[^}]*height:100dvh;[^}]*overflow:hidden;/.test(text))
    throw new Error('the page is not the height of the screen, or it can still scroll');
  /* minmax(0,...) ON THE ROWS. A grid row auto-sizes to its content and refuses
     to shrink below it, so a scroll container in a plain 1fr row overflows its
     track instead of scrolling - which is the whole page scrolling again. */
  if (!/grid-template-rows:auto auto minmax\(0,1\.15fr\) minmax\(0,1fr\);/.test(text))
    throw new Error('the rows can grow past the screen, so the page scrolls after all');
  /* AND THE LEFT COLUMN DOES NOT SCROLL SIDEWAYS. Its children were sized and
     sequenced for a page-wide flex column, and both survive into a 200px box. */
  if (text.indexOf('.fopen>*{order:0; width:auto; max-width:100%; min-width:0;}') < 0)
    throw new Error('the file controls keep the order and the width they had as a page-wide column');
  if (!/overflow:auto; overscroll-behavior:contain;/.test(text))
    throw new Error('the columns do not scroll, so their content is simply cut off');

  /* THE LEFT COLUMN IS ONE BOX, and the things in it are still in it. */
  const open = text.indexOf('<div class="fopen pg-home">');
  const shut = text.indexOf('  </div>', text.indexOf('<p class="err" id="err" role="status"></p>'));
  if (open < 0 || shut < 0) throw new Error('the file controls are not wrapped');
  const inside = text.slice(open, shut);
  for (const id of ['drop', 'bulkbtn', 'sortopen', 'restore', 'linkbar', 'bulknote', 'err'])
    if (inside.indexOf('id="' + id + '"') < 0)
      throw new Error(id + ' fell out of the left column');

  /* THE ROUTER NO LONGER BELIEVES IN THE PAGE. This is the one that matters:
     with "fixer" still in PAGES, showPage will set data-page="fixer" - and the
     rules that hid every other section from that page are gone, so all of them
     render at once. Measured on exactly that build: data-page came back
     "fixer" and the Agent panel was display:block beside the extractor. */
  if (code.indexOf('const PAGES=["home","project","settings","agent","final"];') < 0)
    throw new Error('the router still has a page whose hiding rules are gone');
  /* AN OLD LINK STILL LANDS, and the address bar is put right. */
  if (!/if\(h==="fixer"\) return "home";/.test(code))
    throw new Error('a bookmark at the old Fix pixels page goes nowhere in particular');
  if (!/history\.replaceState\(null,"","#\/home"\);/.test(code))
    throw new Error('the address bar is left reading a page that does not exist');
  /* replaceState, NOT an assignment: an assignment makes a history entry and
     fires hashchange, which re-enters the router on the way in. */
  if (/location\.hash="#\/home"/.test(code))
    throw new Error('the hash is assigned rather than replaced, which adds a history entry');

  /* AND THE PHONE GETS ITS SCROLL BACK, because three columns of controls at
     375px is not a screen anybody can use. */
  if (!/@media \(max-width:900px\)\{\s*\n\s*#land\[data-page="home"\]\{height:auto;/.test(text))
    throw new Error('the three columns are forced onto a phone');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
