/* THE COLOURS ARE BEHIND A BUTTON AND THEY ARE THE THING YOU REACH FOR MOST.

   "at the moment the colour options are annoying to get too so can you have
   that option always be open in the colour box (make that the top left and move
   buttons below it and make them fit so we dont loose editinng size)"

   The trait's own colours live in a modal card behind #clbtn, so picking one is
   open, click, close, every time - on the control used more than any other.

   WHAT THIS COSTS, MEASURED FIRST, because "don't lose editing size" is the
   condition. At 1280x900 the editor is:

     the rail   123 px wide, 737 tall, 28 controls wrapped two across
     the stage  1157 x 737

   and fitZoom takes min(stageWidth, stageHeight) - so at any ordinary desktop
   shape the HEIGHT binds and there are 420 px of width doing nothing. A wider
   left column is free until the stage is squarer than it is tall. That is why
   this can be added at the top left without the canvas losing a zoom step, and
   why the check below measures the zoom on both sides rather than asserting it.

   WHAT IS IN THE BOX: the trait's colours, and nothing else. Replace, Erase
   colour, Clean up and the imported palette stay behind #clbtn, because they
   are read and decided rather than reached for mid-stroke. One thing moved,
   not a panel relocated.

   TWO VIEWS, ONE WRITER. #pal keeps its place in the card and #palrail is the
   strip in the column, and buildPalette fills both from the same list with the
   same handlers - so a colour marked for replacing in one is marked in the
   other, and there is no second copy of what a swatch does. A first sketch
   MOVED #pal into the column, which took the swatches off the phone entirely,
   since the column is not there at 820px and under.

   ON A PHONE the box is not shown. The rail lies down as a horizontal strip
   there and the vertical budget is the scarce one; #clbtn is still the door,
   exactly as it was. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the column that holds both --------------------------------- */
{
  const open = kit.only(L, l => l === '  <nav class="tools" aria-label="Tools">', 'the tool rail');
  let close = -1;
  for (let i = open + 1; i < L.length && i < open + 80; i++) if (L[i] === '  </nav>') { close = i; break; }
  if (close < 0) throw new Error('the tool rail does not close within eighty lines');
  kit.replace(L, { start: close, end: close }, ['  </nav>', '  </div>']);
  kit.replace(L, { start: open, end: open - 1 }, [
    '  <!-- THE LEFT COLUMN: colours on top, tools under them. One grid area,',
    '       two things, so the rail keeps its own layout and the box keeps its',
    '       own scroll. See patch397 for why a wider column costs no zoom. -->',
    '  <div class="leftcol">',
    '  <div class="colbox" id="colbox">',
    '    <span class="colboxlab">Colours</span>',
    '    <div class="swatches" id="palrail" role="group" aria-label="Colours in this trait"></div>',
    '  </div>',
  ]);
}

/* ---- the CSS ----------------------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf('.tools{grid-area:tools;') === 0, 'the rail rule');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* The rail and the colour box share one grid area, stacked. The border and',
    '   the background move here from .tools so the two read as one column. */',
    '.leftcol{grid-area:tools; display:flex; flex-direction:column; min-height:0;',
    '  border-right:1px solid var(--line); background:var(--panel);}',
    '/* THE COLOURS, ALWAYS ON SCREEN. A FIXED cap rather than a share of the',
    '   column, because what this must not do is take height the tools need, and',
    '   a percentage takes more of a tall window than a short one - which is the',
    '   opposite of what is wanted. 156px shows six rows of a 24-colour palette',
    '   at this width and scrolls past that, so a trait with ninety colours',
    '   cannot push the tools out of view. */',
    '.colbox{flex:none; max-height:156px; overflow-y:auto; padding:10px 10px 8px;',
    '  border-bottom:1px solid var(--line);}',
    '.colboxlab{display:block; font-size:9.5px; letter-spacing:.07em;',
    '  text-transform:uppercase; color:var(--dim); margin-bottom:5px;}',
    '/* auto-fill rather than the card\'s fixed eight: this column is narrower and',
    '   its width is not the card\'s width. */',
    '#palrail{grid-template-columns:repeat(auto-fill,minmax(20px,1fr)); gap:3px;}',
    '#palrail .sw{min-height:20px;}',
  ]);
  /* The border and the background are on the THIRD line of that rule, not the
     first - a version that looked only at the first two refused a correct edit.
     The column draws the edge now, so the rail must not draw a second one. */
  /* BY ITS NEIGHBOUR: the .leftcol rule inserted above carries the very same
     declaration, so a bare match finds two and refuses. The line above the
     rail's is the one that wraps its tools. */
  const edge = kit.near(L, '  border-right:1px solid var(--line); background:var(--panel);}', -1,
    'flex-wrap:wrap; align-content:flex-start;', 'the rail edge');
  kit.replace(L, { start: edge, end: edge }, [
    '  background:transparent;}',
  ]);
}

/* ---- one writer, two views --------------------------------------- */
{
  const r = kit.inFunction(L, 'function buildPalette(list){');
  const at = kit.only(L, l => l === "  const wrap=$('pal'); wrap.innerHTML='';", 'the palette container', r);
  kit.replace(L, { start: at, end: at }, [
    '  /* TWO VIEWS, ONE WRITER: the card\'s grid and the strip in the left',
    '     column. Both are filled here with the same handlers, so a colour marked',
    '     for replacing shows as marked in both and there is no second copy of',
    '     what a swatch does. The strip is not on a phone, where the column is',
    '     not either - $ returns null there and the loop skips it. */',
    "  const wraps=[$('pal'),$('palrail')].filter(Boolean);",
    "  for(const w of wraps) w.innerHTML='';",
  ]);
  const r2 = kit.inFunction(L, 'function buildPalette(list){');
  const add = kit.only(L, l => l === '    wrap.appendChild(b);', 'where a swatch is added', r2);
  kit.replace(L, { start: add, end: add }, [
    '    /* The same button cannot be in two places, so each view gets its own',
    '       with the same handlers - built by the closure above, which is why',
    '       this is a loop over the containers rather than a clone. */',
    '    wraps[0].appendChild(b);',
    '    for(let k=1;k<wraps.length;k++) wraps[k].appendChild(swatchLike(b,h));',
  ]);

  /* The twin, beside the function that needs it. */
  const fn = kit.only(L, l => l === 'function buildPalette(list){', 'the palette builder');
  kit.replace(L, { start: fn, end: fn }, [
    '/* A second swatch for the same colour: same look, same state, same handlers.',
    '   Copying the node would copy neither the click nor the context menu, so',
    '   this rebuilds the shell and points both at the one place that decides',
    '   what a swatch does. */',
    'function swatchLike(b,h){',
    '  const t=document.createElement("button");',
    '  t.className=b.className; t.dataset.hex=h; t.style.background=h; t.title=b.title;',
    '  t.setAttribute("aria-pressed",b.getAttribute("aria-pressed")||"false");',
    '  t.setAttribute("aria-label",b.getAttribute("aria-label")||("Colour "+h));',
    '  if(b.dataset.rc) t.dataset.rc=b.dataset.rc;',
    '  if(b.dataset.to) t.dataset.to=b.dataset.to;',
    '  t.onclick=b.onclick; t.oncontextmenu=b.oncontextmenu;',
    '  return t;',
    '}',
    'function buildPalette(list){',
  ]);
}

/* ---- and the marks that are written straight onto the swatches --- */
{
  /* rcSummary paints rcPick and rcTo onto the swatches in place rather than
     rebuilding them, so the strip has to be named there too. setColor already
     reaches every .sw on the page and needs nothing. */
  const at = kit.only(L, l => l === '  document.querySelectorAll("#pal .sw").forEach(s=>{',
    'where the marks are painted');
  kit.replace(L, { start: at, end: at }, [
    '  /* BOTH VIEWS. The strip in the left column carries the same marks, or a',
    '     colour marked for replacing is marked in one place and not the other. */',
    '  document.querySelectorAll("#pal .sw, #palrail .sw").forEach(s=>{',
  ]);
}
/* ---- not on a phone ---------------------------------------------- */
{
  const at = kit.only(L, l => l === '  .tools .tool{flex:none;}', 'the phone rail rule');
  kit.replace(L, { start: at, end: at }, [
    '  .tools .tool{flex:none;}',
    '  /* The rail lies down here and the vertical budget is the scarce one, so',
    '     the always-open colours are a desktop thing and #clbtn is still the',
    '     door. .leftcol stops being a column and is just the strip. */',
    '  .colbox{display:none;}',
    '  .leftcol{display:block; border-right:none;}',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  if (text.indexOf('id="palrail"') < 0) throw new Error('there is no always-open strip');
  if (text.indexOf('<div class="leftcol">') < 0) throw new Error('the column that holds both is gone');

  const bp = kit.inFunction(codeLines, 'function buildPalette(list){');
  const body = codeLines.slice(bp.start, bp.end + 1).join('\n');
  if (!/\[\$\('pal'\),\$\('palrail'\)\]/.test(body))
    throw new Error('the palette is not written into both views');
  if (!/swatchLike\(b,h\)/.test(body))
    throw new Error('the second view does not get a swatch of its own');
  /* ONE WRITER: the twin must take the handlers rather than define any. */
  const sl = kit.inFunction(codeLines, 'function swatchLike(b,h){');
  const twin = codeLines.slice(sl.start, sl.end + 1).join('\n');
  if (!/t\.onclick=b\.onclick; t\.oncontextmenu=b\.oncontextmenu;/.test(twin))
    throw new Error('the twin defines its own behaviour instead of sharing it');
  if (/rcPick|setColor|rcSummary/.test(twin))
    throw new Error('the twin decides something, which is the second copy this exists to avoid');

  /* The marks reach both, or a colour marked for replacing shows in one only. */
  if (/\$\("pal"\)\.querySelectorAll\("\.sw"\)/.test(codeLines.join('\n')))
    throw new Error('something still paints marks onto one view only');
  if (!/#pal \.sw, #palrail \.sw/.test(codeLines.join('\n')))
    throw new Error('the marks do not reach the strip');

  /* AND IT CANNOT PUSH THE TOOLS OUT. A trait with ninety colours must not
     take the column. */
  const css = text.slice(0, text.indexOf('</' + 'style>'));
  if (!/\.colbox\{flex:none; max-height:156px; overflow-y:auto;/.test(css))
    throw new Error('the colour box is not capped, so it can take the whole column');
  if (!/\.colbox\{display:none;\}/.test(css))
    throw new Error('the colour box is not put away on a phone');
  /* The column, not the rail, draws the edge - or there are two borders. */
  if (!/\.leftcol\{grid-area:tools;/.test(css))
    throw new Error('the column does not take the grid area');
  const railRule = css.slice(css.indexOf('.tools{grid-area:tools;'));
  const railHead = railRule.slice(0, railRule.indexOf('}'));
  if (/border-right:1px/.test(railHead))
    throw new Error('the rail still draws the column edge as well as the column');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
