/* TWO THINGS ON SCREEN THAT DID NOT LINE UP WITH THE ARTWORK UNDER THEM.

   ONE: THE RESTORED-DRAFT BAR HAS NO grid-area, SO IT LANDS UNDER THE FOOTER
   AND TAKES A THIRD OF THE CANVAS WITH IT.

   .app is a named-area grid:

     grid-template-areas:"head head" "opts opts" "cols stage" "tools stage" "foot foot"

   and every other child of #app names its area - header:head, .colbox:cols,
   nav.tools:tools, .stage:stage, .opts:opts, footer:foot. .draftbar names
   none, so it auto-places; all ten cells are taken, so it is pushed into an
   implicit SIXTH row in column one.

   Two consequences, and the second is the expensive one. The bar paints below
   the footer instead of under the header where the markup puts it - the markup
   even says so, "Said inside the editor, because that is where the draft was
   restored", and the rule gives it a border-BOTTOM, which is the border of a
   bar that sits under something. And column one is an `auto` track, so it is
   now sized by the bar's max-content width: the tool rail inflates and the
   canvas loses exactly that much.

   Measured at 1280x900, through the real path - edit Alpha, open Beta, reopen
   Alpha: stage 1105px -> 710px, nav.tools 175px -> 570px, footer at y 807-850
   and #draftbar at y 850-900. On a phone the bar lands over the home
   indicator.

   THE EXACT NUMBER MOVES WITH THE CLOCK, which is worth recording because it
   looks like a flaky measurement and is not: the inflated column is sized by
   the bar's max-content, and the bar's text carries a wall-clock time
   ("Unsaved changes from 9:05 AM..."). A different hour gives a different
   width. The mechanism is the same at any hour, so the test asserts the row it
   sits in and that the canvas does not shrink, not a pixel count.

   AND THIS GOT MORE IMPORTANT TWO COMMITS AGO. 462 and 463 fixed the two ways
   a draft was silently lost, so this bar now appears when it always should
   have. Making a thing work correctly is what makes its layout matter.

   TWO: ZOOMING LEAVES THE TEXT, ADJUST AND PIXEL-QA PREVIEWS AT THE OLD SCALE.

   Every overlay in #frame is drawn at the art's pixel resolution and stretched
   to art.width*zoom by whoever draws it. applyZoom re-stretches #olpv, #base,
   the grid variables, the cursor, #symgd and the selection layers - and not
   #txpv, #fxpv or #qapv. They are all position:absolute at the frame's
   top-left, so after a zoom each one is anchored correctly and drawn at the
   wrong scale: every pixel in it displaced by (oldZoom/newZoom - 1) times its
   distance from that corner.

   Measured: type into the Text panel at zoom 9 (#txpv 720px wide), zoom in one
   step - art.style.width 1440px, #txpv still 720px. The lettering renders at
   half scale and half its distance from the corner.

   THE COMMITTED PIXELS ARE FINE. textApply composites in ART-PIXEL coordinates,
   so Add puts the text exactly where textX/textY say. What is wrong is that
   between the zoom and the Add, the preview - the only thing that says where
   the lettering will land - shows somewhere else. The same desync moves the
   drag handle: textHit works from the live rect, so pressing the visible
   letters does not grab them and pressing apparently empty canvas does.

   THE OTHER FOUR overlays in that frame - #shpv, #gdpv, #sdpv, #cmppv - are
   not in the list, and that is a decision rather than an omission: each exists
   only while a pointer is down, and the zoom cannot change during a drag. They
   are named here so the next person does not have to work out which ones were
   considered. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the draft bar gets a row of its own ---- */
{
  const at = kit.only(L, l => l === '.app{display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto auto 1fr auto;',
    'the editor grid rows');
  kit.replace(L, { start: at, end: at }, [
    '.app{display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto auto auto 1fr auto;',
  ]);
  const ar = kit.only(L, l => l === '  grid-template-areas:"head head" "opts opts" "cols stage" "tools stage" "foot foot"; height:100dvh;}',
    'the editor grid areas');
  kit.replace(L, { start: ar, end: ar }, [
    '  /* THE DRAFT BAR HAS A ROW. It named no area, so it auto-placed into an',
    '     implicit sixth row below the footer - and column one is an auto track,',
    '     so it was ALSO sized by the bar and the canvas lost that width.',
    '     Measured at 1280x900: stage 1105 -> 710, rail 175 -> 570. An auto row',
    '     collapses to nothing while the bar is hidden, which it is until a',
    '     draft is actually restored. */',
    '  grid-template-areas:"head head" "draft draft" "opts opts" "cols stage" "tools stage" "foot foot"; height:100dvh;}',
  ]);
}
{
  const at = kit.only(L, l => l === '    grid-template-areas:"head" "tools" "opts" "stage" "foot";}',
    'the phone grid areas');
  if (L[at - 1] !== '  .app{grid-template-columns:1fr; grid-template-rows:auto auto auto minmax(0,1fr) auto;')
    throw new Error('the phone grid is not shaped the way this expects');
  kit.replace(L, { start: at - 1, end: at }, [
    '  .app{grid-template-columns:1fr; grid-template-rows:auto auto auto auto minmax(0,1fr) auto;',
    '    /* Under the header here too - on a phone the implicit row put it over',
    '       the home indicator. */',
    '    grid-template-areas:"head" "draft" "tools" "opts" "stage" "foot";}',
  ]);
}
{
  const at = kit.only(L, l => l === '.draftbar{display:flex; gap:10px; align-items:center; flex-wrap:wrap;',
    'the draft bar rule');
  kit.replace(L, { start: at, end: at }, [
    '.draftbar{grid-area:draft; display:flex; gap:10px; align-items:center; flex-wrap:wrap;',
  ]);
}

/* ---- 2. and every overlay follows the zoom ---- */
{
  const fnz = kit.inFunction(L, 'function applyZoom(){');
  const at = kit.only(L, l => l === '  paintCursor();', 'the zoom cursor repaint', fnz);
  if (L[at + 1] !== '  symDraw();' || L[at + 2] !== '  selDraw(true); if(seLift) seLiftDraw();')
    throw new Error('the zoom tail is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '  /* THE OVERLAYS THAT ARE SHOWING. Each is drawn at the pixel',
    '     resolution of the art and stretched to art.width*zoom by whoever',
    '     draws it, and each is absolutely positioned at the top-left - so one',
    '     left at the old size is anchored right and scaled wrong, with every',
    '     pixel in it displaced by its own distance from that corner.',
    '',
    '     The text preview is the one that costs something: it is the only',
    '     thing that says where the lettering will land, and the drag handle',
    '     stays where the sprite really is while the letters are drawn',
    '     somewhere else, so pressing the visible letters does not grab them.',
    '',
    '     NOT #shpv, #gdpv, #sdpv or #cmppv, which were considered: each of',
    '     those exists only while a pointer is down, and the zoom cannot change',
    '     during a drag. Named so the next person does not have to work that',
    '     out again. */',
    '  for(const id of ["txpv","fxpv","qapv"]){',
    '    const el=$(id);',
    '    if(el && el.style.display!=="none" && el.width){',
    '      el.style.width=(art.width*zoom)+\'px\'; el.style.height=(art.height*zoom)+\'px\';',
    '    }',
    '  }',
    '  paintCursor();',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE BAR HAS A ROW, AND SOMETHING TO PUT IN IT. Either half alone leaves it
     auto-placed: an area nothing claims is an unused name, and a grid-area
     naming a row that does not exist places it implicitly all over again. */
  if (!/grid-template-areas:"head head" "draft draft" "opts opts" "cols stage" "tools stage" "foot foot";/.test(text))
    throw new Error('the editor grid has no row for the draft bar');
  if (!/grid-template-rows:auto auto auto auto 1fr auto;/.test(text))
    throw new Error('the editor grid has six areas rows and five tracks');
  if (!/grid-template-areas:"head" "draft" "tools" "opts" "stage" "foot";/.test(text))
    throw new Error('the phone grid has no row for the draft bar');
  if (!/grid-template-rows:auto auto auto auto minmax\(0,1fr\) auto;/.test(text))
    throw new Error('the phone grid has six areas rows and five tracks');
  if (!/\.draftbar\{grid-area:draft;/.test(text))
    throw new Error('the bar still claims no area, so it auto-places as before');

  /* AND THE OVERLAYS FOLLOW THE ZOOM. */
  const az = kit.inFunction(codeLines, 'function applyZoom(){');
  const azb = codeLines.slice(az.start, az.end + 1).join('\n');
  if (!/for\(const id of \["txpv","fxpv","qapv"\]\)\{/.test(azb))
    throw new Error('the three reachable overlays are not re-stretched on a zoom');
  if (!/el\.style\.width=\(art\.width\*zoom\)\+'px'; el\.style\.height=\(art\.height\*zoom\)\+'px';/.test(azb))
    throw new Error('the overlays are stretched to something other than the art');
  /* Only the ones that are up. Sizing a hidden canvas is harmless but sizing
     one that was never drawn gives it a size it never had. */
  if (!/if\(el && el\.style\.display!=="none" && el\.width\)\{/.test(azb))
    throw new Error('an overlay that has never been drawn would be given a size');
  /* Before paintCursor, so one pass does the lot rather than two. */
  if (azb.indexOf('for(const id of ["txpv","fxpv","qapv"])') > azb.indexOf('paintCursor();'))
    throw new Error('the overlays are re-stretched after the cursor, which reads as a separate pass');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
