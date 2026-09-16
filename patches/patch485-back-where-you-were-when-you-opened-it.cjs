/* BACK WHERE YOU WERE WHEN YOU OPENED THE TRAIT.

   "when i click into a trait and close out i want to be back where i was when
   i clicked into the trait insead of always back at the top of the screen"

   MEASURED. 60 traits on the project page, scrolled to 1400 of 3846:

     scrolled to        1400   looking at s3
     opened a trait     scrollY 0
     closed it          scrollY 0, nothing under the middle of the screen
     page height        3846, the same as before

   The position is not lost, it is thrown away. #land is hidden with the
   hidden attribute, which collapses the document to the viewport and takes
   the scroll offset with it; nothing writes it down and nothing puts it back.
   On a shelf of 318 traits that is the whole shelf to scroll through again,
   once per trait.

   IT DOES NOT NEED TO WAIT FOR THE SHELF TO REDRAW. Hiding an element with
   the hidden attribute keeps its content, so the page is its full height the
   instant it comes back - measured at 3,846 at the moment of unhide, the same
   number it had before the editor opened, and a restore right there lands on
   1400 rather than being clamped. Restoring after the render would be a
   visible jump: the page arrives at the top and then moves.

   AND IT IS THE WINDOW ONLY. I wrote a loop to remember every scrolled
   element inside #land, for the Trait Factory columns that scroll inside
   themselves, and then measured whether it was needed:

     a column    81 -> hidden reports 0 -> shown again 81
     the window  900 -> 0 -> 0

   The browser puts an inner element's scrollTop back by itself; only the
   document scroll goes, because collapsing the document is what clamps it.
   The loop was dead code with a confident comment on it, which is the shape
   that survives review. It is gone, and the test that would have defended it
   records the measurement instead, so the next person does not add it back.

   ONE PLACE EACH WAY. startEditor is the only thing that hides #land and
   closeEditor is the only thing that shows it, so every route into the editor
   is covered - a tile, the Last edited list, a fixer result, the plan - and
   none of them has to know about this.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE TWO LINES, asserted to be the only ones. If a third place ever hides or
   shows #land this refuses rather than covering two routes out of three. */
const hides = L.filter(l => /\$\("land"\)\.hidden|\$\('land'\)\.hidden/.test(l));
if (hides.length !== 2)
  throw new Error('#land is hidden or shown in ' + hides.length + ' places, expected 2');

/* ---- remember, on the way in ------------------------------------ */

const OPEN = "  $('scrim').hidden=true; $('land').hidden=true; $('app').hidden=false;";
{
  const at = kit.only(L, l => l === OPEN, 'the line that hides the page');
  kit.replace(L, { start: at, end: at }, [
    '  landScrollKeep();',
    OPEN,
  ]);
}

/* ---- put it back, on the way out -------------------------------- */

{
  const ce = kit.inFunction(L, 'async function closeEditor(){');
  const at = kit.only(L, l => l === '  $("app").hidden=true; $("land").hidden=false;',
    'the line that shows the page', ce);
  kit.replace(L, { start: at, end: at }, [
    '  $("app").hidden=true; $("land").hidden=false;',
    '  /* HERE, not after renderShelf. Hiding an element with the hidden',
    '     attribute keeps its content, so the page is already its full height -',
    '     measured at 3,846px with 60 traits, the same number it had before the',
    '     editor opened. Behind an awaited redraw it would be a visible jump:',
    '     the page arrives at the top and then moves. */',
    '  landScrollBack();',
  ]);
}

/* ---- the pair itself, above closeEditor ------------------------- */

{
  const at = kit.only(L, l => l === 'async function closeEditor(){', 'closeEditor');
  kit.replace(L, { start: at, end: at }, [
    '/* WHERE THE PAGE WAS WHEN THE EDITOR TOOK IT OVER.',
    '',
    '   #land is hidden with the hidden attribute, which collapses the document',
    '   to the viewport and takes the scroll offset with it. Measured: 60 traits,',
    '   scrolled to 1400 of 3846, open a trait and close it and the answer is 0 -',
    '   the whole shelf to scroll through again, once per trait.',
    '',
    '   THE WINDOW ONLY. The Trait Factory columns scroll inside themselves, so',
    '   this had a loop remembering every scrolled element in #land - and then',
    '   the measurement: a column goes 81, hidden, 81 again, while the window',
    '   goes 900, hidden, 0. The browser restores an inner scrollTop by itself;',
    '   only the document scroll is lost, because collapsing the document is',
    '   what clamps it. The loop did nothing and is not here.',
    '',
    '   THE PAGE IS RECORDED WITH THE OFFSET. A hashchange while the editor is',
    '   up - a Back press - can land the close on a different page, and 1400',
    '   belonging to the shelf is a jump to nowhere there rather than a',
    '   restore. */',
    'let landScroll=null;',
    'function landScrollKeep(){',
    '  const land=$("land");',
    '  /* ALREADY IN THE EDITOR, which is opening a second trait from inside it.',
    '     The page is hidden, so window.scrollY is 0, and writing that down',
    '     would throw away the real position on the way past. */',
    '  if(!land||land.hidden) return;',
    '  landScroll={page:land.getAttribute("data-page"), y:window.scrollY||0};',
    '}',
    'function landScrollBack(){',
    '  const s=landScroll; landScroll=null;',
    '  if(!s) return;',
    '  const land=$("land");',
    '  if(!land||land.getAttribute("data-page")!==s.page) return;',
    '  window.scrollTo(0,s.y);',
    '}',
    'async function closeEditor(){',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('function landScrollKeep(){');
  need('function landScrollBack(){');
  need('  if(!land||land.hidden) return;');
  need('  if(!land||land.getAttribute("data-page")!==s.page) return;');
  /* The loop the measurement removed must not creep back. */
  if (/inner\.push/.test(code))
    throw new Error('the inner-scroller loop is back; a column restores itself');

  /* THE ORDER IS THE WHOLE POINT. Recorded before the page is hidden, and put
     back before the shelf is redrawn; either one the other way round reads as
     working and is not. */
  const keepAt = code.indexOf('  landScrollKeep();');
  const hideAt = code.indexOf("  $('scrim').hidden=true; $('land').hidden=true;");
  if (keepAt < 0 || hideAt < 0 || keepAt > hideAt)
    throw new Error('the position is not recorded before the page is hidden');

  const showAt = code.indexOf('  $("app").hidden=true; $("land").hidden=false;');
  const backAt = code.indexOf('  landScrollBack();');
  const paintAt = code.indexOf('  renderShelf();', showAt);
  if (showAt < 0 || backAt < 0 || paintAt < 0)
    throw new Error('closeEditor does not have the three lines this needs');
  if (!(showAt < backAt && backAt < paintAt))
    throw new Error('the restore is not between showing the page and redrawing the shelf');
});

fs.renameSync(TMP, FILE);
console.log('patch485 written, ' + grew + ' bytes');
