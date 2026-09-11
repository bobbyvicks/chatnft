/* THE PROJECT'S 256 COLOURS, BESIDE THE ONES THE TRAIT ALREADY HAS.

   "make this the default colour pallete on the site" ... "i need it to show
   both tho"

   The palette itself was already here: PALETTE_HEX holds all 256 of Mrkt Mkrs
   256 - the Resurrect 64 expansion - baked in with its source and a hash of
   those colours in that order. What it was not was reachable while drawing.
   The swatch panel is filled by buildPalette from the colours found IN THE
   PICTURE, so the only way to paint a colour the trait did not already
   contain was the colour picker, one colour at a time, by eye.

   So the project palette gets its own block under the trait's own, and both
   are there at once.

   NOT CLASSED .swatches, deliberately, and the comment on the imported
   palette block says why: recolour.spec.js counts that class and pins
   exactly one, the property being that the trait's colours are never drawn
   twice. This is a different set under its own id, the same way #piopal is.

   WHAT A CLICK MEANS, kept from the swatches above it. Left-click paints
   with the colour. Right-click sets it as what the marked colours change TO,
   which is the same gesture as on a trait swatch and is the useful one here:
   marking a colour in the art and right-clicking a palette colour is
   "change this to that". What is NOT carried over is left-click also marking
   the colour for replacement - a palette colour is not in the picture, so
   there is nothing of it to replace. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the block ----------------------------------------------------- */
{
  const at = kit.only(L, l => l === '      <div class="swatches" id="pal"></div>',
    'the trait swatch grid');
  kit.replace(L, { start: at, end: at }, [
    '      <div class="swatches" id="pal"></div>',
    '      <!-- THE PROJECT PALETTE, always here, under the colours the trait has.',
    '           Not classed .swatches for the same reason #piopal is not:',
    '           recolour.spec.js counts that class and pins exactly one, so that',
    '           the trait colours are never drawn twice. -->',
    '      <p class="note" id="projpalnote" style="margin-top:8px"></p>',
    '      <div id="projpal" role="group" aria-label="Project palette"></div>',
  ]);
}

/* ---- its styling, the same shape as the imported one ---------------- */
{
  const at = kit.only(L, l => l === '#piopal{display:grid; gap:4px; overflow-x:auto; margin-top:6px; padding-bottom:2px;}',
    'the imported palette grid');
  kit.replace(L, { start: at, end: at }, [
    '#piopal{display:grid; gap:4px; overflow-x:auto; margin-top:6px; padding-bottom:2px;}',
    '/* THE PROJECT PALETTE. Sixteen across, which is the grid the palette is',
    '   published on - its own rows are ramps, so any other width cuts them in',
    '   half and the colours stop reading as families. Capped in height so 256',
    '   swatches cannot push the rest of the panel off the screen. */',
    '#projpal{display:grid; grid-template-columns:repeat(16,1fr); gap:3px;',
    '  max-height:38dvh; overflow-y:auto; padding:2px 2px 4px;}',
    '/* NO min-height OVERRIDE HERE. .sw carries a 22px floor and',
    '   paneldensity.spec.js enforces it - a target under that is hard to hit,',
    '   and 256 swatches shrank to 15. Sixteen columns in this panel is about',
    '   18px across, so they come out 18 wide and 22 tall: not square, and',
    '   hittable, which is the right way round of that trade. */',
  ]);
}

/* ---- and it is filled ---------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function setColor(h){', 'the colour setter');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE PROJECT PALETTE, DRAWN ONCE. It does not change with the picture -',
    '   it is the collection palette, not this picture - so it is built when the',
    '   editor opens and left alone. setColor sweeps every .sw, so the swatch',
    '   for the colour being painted with lights up here too, wherever it is.',
    '',
    '   16 to a row, because the palette is published on a 16 wide grid and its',
    '   rows are ramps. */',
    'function buildProjectPalette(){',
    '  const w=$("projpal"); if(!w) return;',
    '  const list=paletteList();',
    '  w.innerHTML="";',
    '  for(const h of list){',
    '    const b=document.createElement("button");',
    '    b.className="sw"; b.dataset.hex=h; b.style.background=h;',
    '    b.title=h+" \\u00b7 "+PALETTE_SOURCE.name;',
    '    b.setAttribute("aria-pressed",String(h===color));',
    '    b.setAttribute("aria-label","Palette colour "+h);',
    '    /* LEFT: paint with it. Not also marked for replacing, the way a trait',
    '       swatch is - a palette colour is not in the picture, so there is',
    '       nothing of it to replace. */',
    '    b.onclick=()=>{ setColor(h); };',
    '    /* RIGHT: what the marked colours become. The same gesture as on a',
    '       trait swatch, and the useful one here. */',
    '    b.oncontextmenu=(e)=>{',
    '      e.preventDefault();',
    '      rcTo=(rcTo===h)?null:h;',
    '      rcSummary();',
    '      return false;',
    '    };',
    '    w.appendChild(b);',
    '  }',
    '  const n=$("projpalnote");',
    '  if(n) n.textContent=PALETTE_SOURCE.name+" \\u00b7 "+list.length',
    '    +" colours \\u00b7 left-click to paint with one, right-click to change the"',
    '    +" marked colours to it";',
    '}',
  ]);
  /* Built where the trait's own palette is. */
  const bp = kit.only(L, l => l === 'function buildPalette(list){', 'the trait palette builder');
  const fn = kit.inFunction(L, 'function buildPalette(list){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '  /* AND THE PROJECT PALETTE, beside it. Here rather than at startEditor so',
    '     there is one place that fills the colour panel, and no way to rebuild',
    '     half of it. */',
    '  buildProjectPalette();',
    '}',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* BOTH SETS ARE ON THE PAGE. */
  if (!/<div class="swatches" id="pal"><\/div>/.test(text))
    throw new Error('the trait swatches are gone');
  if (!/<div id="projpal" role="group" aria-label="Project palette"><\/div>/.test(text))
    throw new Error('the project palette has nowhere to go');
  /* AND THE NEW ONE IS NOT CLASSED .swatches - recolour.spec.js counts that
     class and pins exactly one, so that the trait colours are never drawn
     twice. The imported palette block carries the same note. */
  if (/id="projpal"[^>]*class="[^"]*swatches/.test(text)
    || /class="[^"]*swatches[^"]*"[^>]*id="projpal"/.test(text))
    throw new Error('the project palette counts as a second trait grid');

  const bp = kit.inFunction(codeLines, 'function buildProjectPalette(){');
  const body = codeLines.slice(bp.start, bp.end + 1).join('\n');
  /* IT IS THE PROJECT PALETTE, not a copy of it that can drift. */
  if (!/const list=paletteList\(\);/.test(body))
    throw new Error('the block has its own idea of what the palette is');
  /* A left click paints and does NOT mark for replacing. */
  if (!/b\.onclick=\(\)=>\{ setColor\(h\); \};/.test(body))
    throw new Error('a palette swatch does something other than paint');
  if (/rcPick/.test(body))
    throw new Error('a palette colour is being marked for replacement, and it is not in the picture');
  /* Right click still sets what the marked colours become. */
  if (!/rcTo=\(rcTo===h\)\?null:h;/.test(body))
    throw new Error('right-click stopped meaning what it means on the swatches above');

  /* AND THE SWATCHES ARE STILL BIG ENOUGH TO HIT. 256 of them is exactly the
     shape that invites a min-height override, and paneldensity.spec.js is
     what caught it at 15px. */
  if (/#projpal .sw{[^}]*min-height:s*0/.test(text))
    throw new Error('the palette swatches are exempted from the 22px floor');

  /* AND IT IS ACTUALLY BUILT. */
  const pb = kit.inFunction(codeLines, 'function buildPalette(list){');
  if (!/buildProjectPalette\(\);/.test(codeLines.slice(pb.start, pb.end + 1).join('\n')))
    throw new Error('nothing fills it, so the panel shows one set again');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
