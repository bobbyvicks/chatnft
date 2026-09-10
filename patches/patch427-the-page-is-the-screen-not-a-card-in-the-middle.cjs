/* IT STILL DID NOT FILL THE SCREEN, AND THE BUTTONS WERE STACKED.

   "make the fix pixel page better like i had asked already"

   Fair. Widening the panel was not the same as filling the screen, and
   looking at the page rather than at the numbers says so. Measured on the
   Fix pixels page at 1600x1000, nothing loaded:

     the panel runs from y378 to y744 in a 1000px window
     378px of dead space above it and 256px below - 63% of the screen empty

   .land is a grid with place-content:center, so a short page is a card
   floating in the middle of a tall window. That is right for the home page,
   which is a headline and a dropzone, and wrong for a workbench.

   THREE THINGS, all measured, none of them the width:

   1. THE PANEL IS THE PAGE. On this page .land is a column that starts at the
      top and the panel grows into what is left, so there is no band of ground
      above it and none below.

   2. THE BUTTON ROWS WERE NOT ROWS. .btnrow has one rule - .btnrow .btn
      {flex:1; width:auto} - and no display:flex, so it is inert unless the
      element also carries .savebar, which is where it was first used. Every
      bare .btnrow on the site is a group of peer buttons that reads as a
      column of stunted ones: measured, Download all as a zip and Save all to
      project sat at y782 and y816, 138px and 121px wide, one under the other.
      Four places: the fixer's two, the agent's, and the link prompt.

      Capped at 640px on this page. flex:1 across a 1180px column is a 390px
      button, which is the opposite problem.

   3. THE TILES WERE THUMBNAILS OF THUMBNAILS. A batch is what this page is
      for and its results came out 110x110 in a 1180px column. 190 minimum
      now, which is five or six across at these widths instead of ten.

   And the two paragraphs of explanation were being set to a 1498px line.
   Capped at 100 characters, which is where they were when the panel was
   1180 and is why nobody noticed. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the button rows are rows -------------------------------------- */
{
  const at = kit.only(L, l => l === '.btnrow .btn{flex:1; width:auto;}', 'the button row rule');
  kit.replace(L, { start: at, end: at }, [
    '/* THE ROW ITSELF. This rule has always said flex:1 and there has never',
    '   been a flex container to hear it: .btnrow carried no display, so it',
    '   worked only where the element also carried .savebar, which is where it',
    '   was written. Every bare .btnrow - the fixer twice, the agent, the link',
    '   prompt - was a column of buttons shrunk to their words. */',
    '.btnrow{display:flex; gap:8px; align-items:center; flex-wrap:wrap;}',
    '.btnrow .btn{flex:1; width:auto;}',
    '/* But not stretched across a workbench: flex:1 over a 1180px column is a',
    '   390px button, which is the same mistake the other way up. */',
    '#fixer .btnrow{max-width:640px;}',
  ]);
}

/* ---- the panel is the page ----------------------------------------- */
{
  const at = kit.only(L, l => l === '#land[data-page="fixer"] .panelbox{width:min(2100px,96vw);}',
    'the fixer page width');
  kit.replace(L, { start: at, end: at }, [
    '#land[data-page="fixer"] .panelbox{width:min(2100px,96vw);}',
    '/* AND THE HEIGHT. place-content:center floats a short page in the middle',
    '   of a tall window - measured at 1600x1000, the panel ran y378 to y744',
    '   with 378px of ground above it and 256 below. A column that starts at',
    '   the top, with the panel taking what is left, and no number to keep in',
    '   step with the height of the header. */',
    '#land[data-page="fixer"]{display:flex; flex-direction:column;',
    '  align-items:center; justify-content:flex-start;}',
    '/* #fixer, NOT .panelbox. The page-hiding rules are one id, one attribute',
    '   and one class, and so is #land[data-page=fixer] .panelbox - the same',
    '   specificity, written later, so a display on it BEATS their display:none',
    '   and the Agent panel came back on the Fix pixels page. Measured: its',
    '   computed display read flex and it was 493px tall in the layout, which',
    '   is also why the panel would not grow - a container already past its',
    '   min-height has no free space left to hand out. */',
    '#land[data-page="fixer"] #fixer{flex:1 1 auto; display:flex;',
    '  flex-direction:column;}',
    '/* So the columns take the room the panel just gained. */',
    '#land[data-page="fixer"] .fixcols{flex:1 1 auto;}',
  ]);
}

/* ---- the results are big enough to see ----------------------------- */
{
  const at = kit.only(L, l => l === '.fixgridout{display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr));',
    'the results grid');
  kit.replace(L, { start: at, end: at }, [
    '/* 190, not 104. A folder run is what this page is for and its results',
    '   were coming out 110px square in a 1180px column - ten across, each one',
    '   too small to tell a good answer from a bad one. */',
    '.fixgridout{display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr));',
  ]);
}

/* ---- and the prose is a readable line ------------------------------ */
{
  const at = kit.only(L, l => l === '.fixsay{min-height:35px; margin:2px 0 4px;}', 'the readout line rule');
  kit.replace(L, { start: at, end: at }, [
    '.fixsay{min-height:35px; margin:2px 0 4px;}',
    '/* The two paragraphs at the top were being set to a 1498px line once the',
    '   panel stopped being 1180 wide. This is the width they always had. */',
    '#fixer > .note{max-width:100ch;}',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  /* THE ROW IS A ROW, and the rule that was waiting for one is still there. */
  if (!/\.btnrow\{display:flex; gap:8px; align-items:center; flex-wrap:wrap;\}/.test(text))
    throw new Error('the button row is still not a row');
  if (!/\.btnrow \.btn\{flex:1; width:auto;\}/.test(text))
    throw new Error('the rule that needed a flex parent was removed instead');
  if (!/#fixer \.btnrow\{max-width:640px;\}/.test(text))
    throw new Error('a 390px button is the same mistake the other way up');

  /* THE PANEL FILLS WHAT IS LEFT, with no number to drift. */
  if (!/#land\[data-page="fixer"\]\{display:flex; flex-direction:column;/.test(text))
    throw new Error('the fixer page still centres a card in a tall window');
  if (!/#land\[data-page="fixer"\] #fixer\{flex:1 1 auto;/.test(text))
    throw new Error('the panel does not grow into the room');
  /* AND NOTHING HERE MAY SET display ON .panelbox. The page-hiding rules have
     exactly that specificity and come earlier, so any display declared here
     un-hides every other page's sections on this one. This is the check that
     would have caught it the first time. */
  for (const rule of text.match(/#land\[data-page="fixer"\] \.panelbox\{[^}]*\}/g) || [])
    if (/display:/.test(rule))
      throw new Error('a display on .panelbox here un-hides every other page: ' + rule);
  if (/calc\(100dvh - \d+px\)/.test(text.match(/#land\[data-page="fixer"\][\s\S]{0,400}/)[0]))
    throw new Error('the height is a magic number that will drift from the header');

  /* AND ONLY THIS PAGE. The other four are still centred columns. */
  if (!/\.land\{min-height:100dvh; display:grid; place-content:center;/.test(text))
    throw new Error('every page just stopped being centred');

  if (!/minmax\(190px,1fr\)/.test(text))
    throw new Error('the results are still thumbnails of thumbnails');
  if (/minmax\(104px,1fr\)/.test(text))
    throw new Error('the old tile size is still there and one of them will win');
  if (!/#fixer > \.note\{max-width:100ch;\}/.test(text))
    throw new Error('the prose is still a 1500px line');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
