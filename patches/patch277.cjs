/* AN OFF-GRID TRAIT IS NAMED IN FOUR PLACES AND REPAIRABLE IN NONE.

   The shelf, the sheet, the save and the zip all now say which traits do not
   divide into the collection's cells. Nothing says what to do about it, and
   the two repairs are not the same thing:

     PAD    grow the canvas to the next whole multiple and centre the art.
            No pixel is touched. The art keeps its size, so in a collection
            where everything else is bigger it stays smaller.
     SCALE  stretch the art to fill the new size. Every pixel is resampled,
            which on pixel art smears block edges when the factor is not
            whole - 1254 to 1280 is x1.0207.

   Only the owner knows which is right, because it depends on how the file
   came to be off the grid: a canvas cropped by accident wants padding, and a
   file exported at the wrong scale wants scaling.

   THE APP ALREADY HAS BOTH, and the Change chips already name them - Canvas
   pads, Art scales, and each says so in its own tooltip. What is missing is
   the arithmetic: to repair a 1254 canvas today you have to know that the
   collection grid is 160 cells, work out that the nearest whole multiple is
   1280, switch the mode and type it. The app knows all of that.

   So this is one button that fills in the number, in whichever mode is
   already chosen. No new choice is invented and no new wording explains the
   difference twice - the chips do it.

   AND IT USES THE CENSUS'S RULE, NOT snapToGrid'S. Below one cell snapToGrid
   deliberately offers whole DIVISORS of the grid, so that shrinking is
   expressible at all; sizeCensus does not accept those. A Fit built on
   snapToGrid would leave a 40px trait in a 160-cell collection exactly as
   off-grid as it found it, and report success. This button exists to answer
   that warning, so it answers it in that warning's terms. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 60) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}

/* ---- 1. the button ------------------------------------------------ */
swap('      <button class="btn ghost" id="rsgo">Resize</button>',
  [
    '      <div class="savebar">',
    '        <button class="btn ghost" id="rsgo">Resize</button>',
    '        <button class="btn ghost" id="rsfit"',
    '          title="Resize to the nearest whole multiple of the cell grid - the size'
    + ' a trait has to be to line up. Which repair it is depends on the Change setting'
    + ' above: Canvas pads and keeps every pixel where it is, Art scales the artwork to'
    + ' fill the new size.">Fit to grid</button>',
    '      </div>',
  ].join(NL));

/* ---- 2. the arithmetic and the press ------------------------------ */
swap([
  '  let best=lad[0], bd=Infinity;',
  '  for(const s of lad){ const d=Math.abs(s-v); if(d<bd){ bd=d; best=s; } }',
  '  return best;',
  '  return best;',
  '}',
].join(NL), [
  '  let best=lad[0], bd=Infinity;',
  '  for(const s of lad){ const d=Math.abs(s-v); if(d<bd){ bd=d; best=s; } }',
  '  return best;',
  '  return best;',
  '}',
  '',
  '/* The nearest canvas size that divides into whole cells.',
  '',
  '   DELIBERATELY NOT snapToGrid, which is one line above and looks like the',
  '   same question. Below one cell snapToGrid answers with a whole DIVISOR of',
  '   the grid - 80, 40, 20 - because shrinking has to be expressible and four',
  '   40s tile a 160 cell. sizeCensus does not accept those: it asks for a whole',
  '   MULTIPLE. A Fit built on snapToGrid would take a 40px trait in a 160-cell',
  '   collection, return 40, report success, and leave the shelf still calling it',
  '   off the grid - a repair button that cannot repair the thing it is beside.',
  '',
  '   The floor at one cell is the same fact from the other end: half a cell is',
  '   not a size a trait can be, whatever rounding says. */',
  'function gridFit(v){',
  '  const g=Math.max(1,projectGrid|0);',
  '  v=Math.max(1,Math.round(v||0));',
  '  return Math.max(g,Math.round(v/g)*g);',
  '}',
  '',
  '/* Whether the open canvas is what sizeCensus would call off the grid.',
  '',
  '   Asked in the census\'s own terms rather than by calling it, because the',
  '   census reads SAVED records and this is about the canvas in front of you,',
  '   which may not be saved yet and may not be a record at all. One rule, two',
  '   subjects. */',
  'function offGridNow(){',
  '  if(typeof ctx==="undefined" || !ctx || !art || !art.width) return false;',
  '  const g=Math.max(1,projectGrid|0);',
  '  return (art.width%g)!==0 || (art.height%g)!==0;',
  '}',
  '',
  'function fitToGrid(){',
  '  if(!ctx) return;',
  '  /* Trait mode resizes the artwork INSIDE a canvas it never moves, so there',
  '     is nothing there for a canvas repair to do. Padding is the reading that',
  '     loses nothing, so an unset mode falls that way rather than resampling',
  '     somebody\'s art because they had a chip selected they had forgotten. */',
  '  const mode=chipVal("rsmode")==="art" ? "art" : "canvas";',
  '  const nw=gridFit(art.width), nh=gridFit(art.height);',
  '  if(nw===art.width && nh===art.height){',
  '    toast("Already "+art.width+"\\u00d7"+art.height+", which is on the "',
  '      +Math.max(1,projectGrid|0)+" cell grid");',
  '    return;',
  '  }',
  '  const was=art.width+"\\u00d7"+art.height;',
  '  const r=resizeTo(nw,nh,mode);',
  '  /* null only when nothing moved, which the guard above already covered. */',
  '  if(!r) return;',
  '  toast((mode==="canvas" ? "Padded " : "Scaled ")+was+" to "+nw+"\\u00d7"+nh',
  '    +", on the "+Math.max(1,projectGrid|0)+" cell grid"+cropLine(r.cut));',
  '}',
].join(NL));

/* ---- 3. saying so before the button is pressed -------------------- */
/* The note under Resize is the only thing on this panel that comments on the
   size at all, and it went quiet in exactly the state that needs a comment:
   nothing typed, nothing snapped, a canvas that does not fit the collection. */
swap('  if(!moved && same){ n.textContent=now; n.title=""; return; }',
  [
    '  if(!moved && same){',
    '    /* The one state this note used to have nothing to say in, and the one',
    '       where the panel is open with no plan. The shelf says the same thing',
    '       about the whole collection; this says it about the canvas in front',
    '       of you, where the button that fixes it is. */',
    '    const off=offGridNow();',
    '    n.textContent = off',
    '      ? now+"  \\u00b7 not on the "+Math.max(1,projectGrid|0)+" cell grid"',
    '      : now;',
    '    n.title = off',
    '      ? "A trait has to divide into whole cells to line up. Fit to grid resizes'
    + ' it to the nearest one that does."',
    '      : "";',
    '    return;',
    '  }',
  ].join(NL));

/* ---- 4. wiring ---------------------------------------------------- */
swap("$('rsgo').onclick=applyResize;",
  ["$('rsgo').onclick=applyResize;",
    "$('rsfit').onclick=fitToGrid;"].join(NL));

/* ---- CHECKS, then write ------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function gridFit(v){', 'function offGridNow(){', 'function fitToGrid(){',
  "$('rsfit').onclick=fitToGrid;"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The button must exist in the markup, once, and outside the script. */
const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="rsfit"').length !== 2) throw new Error('the button is not in the markup exactly once');
if (markup.split('id="rsgo"').length !== 2) throw new Error('Resize lost or duplicated');

/* Fit must not be snapToGrid wearing a new name: the two disagree below one
   cell and that disagreement is the reason this function exists. */
if (code.indexOf('function gridFit(v){\r\n  const g=Math.max(1,projectGrid|0);\r\n'
  + '  v=Math.max(1,Math.round(v||0));\r\n  return Math.max(g,Math.round(v/g)*g);') < 0)
  throw new Error('gridFit is not the multiple rule');
if (code.indexOf('function snapToGrid(v){') < 0) throw new Error('snapToGrid went');

/* And the census rule it answers is untouched. */
if (code.indexOf('(t.w|0)%cells!==0 || (t.h|0)%cells!==0') < 0)
  throw new Error('the census rule moved');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
