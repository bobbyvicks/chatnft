/* PIXELS COMPARED AGAINST A COUNT OF CELLS, IN THREE PLACES.

   projectGrid is how many CELLS across a trait is - 160 by default. w, h and
   art.width are PIXELS. At one pixel per cell those are the same number, which
   is every fixture in tests/, and at eight they are not - and this collection
   is 160 cells of 8 pixels = 1280. Three checks compare them directly:

     sizeCensus   const want=key(projectGrid,projectGrid)
     saveTrait    art.width!==projectGrid
     download     art.width!==projectGrid

   Measured on the real 272-trait collection, grid 160, traits 1280:

     the shelf said       "272 traits  -  272 not 160x160"
     every save said      "saved at 1280x1280, not the collection's 160x160"
     every download said  "not the collection's 160x160"
     Download all said    "A mint needs one size"

   All four are false. A warning that fires on everything is one people learn
   to skip, and that costs the true warnings standing beside it.

   THE RIGHT QUESTION IS THE ONE snapToGrid ALREADY ASKS. It returns
   Math.round(v/g)*g - a whole multiple of projectGrid - because that is what
   divides the canvas into projectGrid whole cells. 1280 is 8 pixels per cell;
   40 in a 160-cell collection is a quarter of a cell and cannot be drawn. So
   the check is w % projectGrid, and it keeps the case collection-size.spec
   records in writing: two traits that agree with each other at 40x40 and with
   nothing else are BOTH still wrong.

   THE WORDING FOLLOWS THE RULE. "one size" and "one canvas size" were the old
   premise stated as fact, and autoCanvas has since made two sizes merely two
   sizes; what is true now is the grid. One phrase for it everywhere - "on the
   160 cell grid" - so the same fact is not read as three problems.

   The character preview's own note (composeDraw) compares picked traits
   against each other rather than against the grid, which is a different and
   still-honest question; only its closing claim moves, because that claim was
   the old rule. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

/* Every anchor is matched as text and required to appear exactly once, so
   nothing here can be aimed by a line number that an earlier write moved. */
function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 60) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}

/* ---- 1. the census, and the one phrase the rule is said in --------- */
swap('  const want="a whole number of "+cells+" cells";',
  '  const want="on the "+cells+" cell grid";');

/* ---- 2. the shelf tooltip ----------------------------------------- */
/* "everything drawn into a character" stays word for word: it is what makes
   the sentence true of the base as well as the traits, and basesize.spec
   pins it for exactly that reason. Only the rule at the end of it moves. */
swap('    ? census.detail+"  \\u2014 everything drawn into a character has to share one canvas size."',
  '    ? census.detail+"  \\u2014 everything drawn into a character has to sit "+census.want+"."');

/* ---- 3. Download all ---------------------------------------------- */
swap('    ? " \\u2014 "+zcen.oddCount+" not "+zcen.want+" ("+zcen.detail+"). Every trait has to be a whole number of cells."',
  '    ? " \\u2014 "+zcen.oddCount+" not "+zcen.want+" ("+zcen.detail+"). A trait has to divide into whole cells to line up."');

/* ---- 4. the twelve-character sheet -------------------------------- */
swap([
  '    (scen.oddCount ? "  Not all the same size: "+scen.detail',
  '      +". Everything drawn into a character has to share one canvas size." : "");',
].join(NL), [
  '    (scen.oddCount ? "  Not on the grid: "+scen.detail',
  '      +". Each of these has to divide into whole cells to line up." : "");',
].join(NL));

/* ---- 5. the character preview ------------------------------------- */
/* This one really is asking "do these agree with each other" - a local map of
   the picked traits, not the census - so the observation stands. Its closing
   sentence was the old rule, and autoCanvas has made it untrue: the preview
   scales every one of them to fill a canvas it picks. */
swap('    ? "Not all the same size: "+odd.join(" and ")+". Everything drawn into a character has to share one canvas size."',
  '    ? "Not all the same size: "+odd.join(" and ")+". They are scaled to fit one canvas when a character is drawn."');

/* ---- 6. saveTrait -------------------------------------------------- */
swap([
  '    const offGrid = (art.width!==projectGrid || art.height!==projectGrid)',
  '      ? " \\u2014 saved at "+art.width+"\\u00d7"+art.height+", not the collection\'s "',
  '        +projectGrid+"\\u00d7"+projectGrid',
  '      : "";',
].join(NL), [
  '    /* A WHOLE NUMBER OF CELLS, not an equality. projectGrid counts CELLS',
  '       and art.width is PIXELS; at one pixel per cell they are the same',
  '       number and at eight they are not, so this read 1280 against 160 and',
  '       told the owner every save in a fine collection was off-grid. The',
  '       multiple is the same rule snapToGrid enforces on the way in. */',
  '    const gcells=Math.max(1,projectGrid|0);',
  '    const offGrid = (art.width%gcells || art.height%gcells)',
  '      ? " \\u2014 saved at "+art.width+"\\u00d7"+art.height+", which is not on the"',
  '        +" collection\'s "+gcells+" cell grid"',
  '      : "";',
].join(NL));

/* ---- 7. the single-trait download --------------------------------- */
swap([
  '    const off = (art.width!==projectGrid || art.height!==projectGrid)',
  '      ? " \\u2014 not the collection\'s "+projectGrid+"\\u00d7"+projectGrid',
  '        +". Every trait has to be a whole number of cells." : "";',
].join(NL), [
  '    /* The same whole-cells question saveTrait asks, in the same words. */',
  '    const dcells=Math.max(1,projectGrid|0);',
  '    const off = (art.width%dcells || art.height%dcells)',
  '      ? " \\u2014 not on the collection\'s "+dcells+" cell grid"',
  '        +". A trait has to divide into whole cells to line up." : "";',
].join(NL));

/* ---- 8. keep the quotation greppable ------------------------------ */
/* The comment recording this fix quotes the sentence it replaced, so that
   somebody grepping for the old claim lands on the reason it went. It was
   wrapped mid-quote, which means the grep finds nothing - the note is only
   worth having if it can be found. Unbroken. */
swap([
  '     reported all 272 traits as wrong and the download said "A mint needs one',
  '     size" about a collection that was fine.',
].join(NL), [
  '     reported all 272 traits as wrong, and the download said',
  '     "A mint needs one size" about a collection that was fine.',
].join(NL));

/* ---- CHECKS, then write ------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const gone = [
  'art.width!==projectGrid',
  'has to share one canvas size',
  'A mint needs one size',
  'const want="a whole number of "+cells+" cells"',
];
for (const s of gone)
  if (code.indexOf(s) >= 0) throw new Error('still in the code: ' + s);

const landed = [
  'const want="on the "+cells+" cell grid";',
  'const offGrid = (art.width%gcells || art.height%gcells)',
  'const off = (art.width%dcells || art.height%dcells)',
  '(t.w|0)%cells!==0 || (t.h|0)%cells!==0',
];
for (const s of landed)
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* projectGrid is right for what it IS - the resize ladder, the presets, the
   cell field - and only wrong when read as a pixel size. It must survive. */
if (code.split('let projectGrid=160;').length !== 2) throw new Error('projectGrid went');
if (code.indexOf('return { want, sizes:by, odd, oddCount:') < 0)
  throw new Error('the shape the four callers read has changed');
/* And the comment explaining the fix still quotes the sentence it replaced,
   which is the point of writing it down. */
if (text.split('A mint needs one size').length !== 2)
  throw new Error('the explanation should quote the old claim exactly once');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
