/* NOTICING IS THE PART THAT WAS MISSING.

   "OKAY so i wanted it to pick up that the colours were sending arent in the
   pallete and i want the site to detect that annd change it to the colour
   thats closest to it from our pallete"

   patch435 and patch436 built the changing. Both of them wait to be asked:
   a button in the colour panel, and a switch on the fixer that I defaulted
   OFF with the reasoning "it rewrites every colour, which is not something
   to do to somebody's art because they pressed Fix it".

   That reasoning is overruled, and it was answering the wrong question. The
   fixer is a CONVERSION - it already rebuilds every pixel of the picture on
   a grid it worked out, and putting those pixels on the collection's palette
   is the same kind of act, not a new liberty. So the switch is on by default.
   It is still a switch, and the run still says what it did to every file.

   AND THE EDITOR SAYS SO WITHOUT BEING ASKED. specCheck has always been able
   to answer "how many colours in this trait are not in the palette, and what
   is the nearest one to each" - it is what the agent panel prints - but you
   had to go to the agent panel and press something to see it. It is now the
   line under the button that fixes it, written every time the swatches are
   rebuilt, which is every time the colours in the trait change.

   THE EDITOR STILL DOES NOT REWRITE ANYTHING ON ITS OWN. A trait opening is
   not somebody asking for their art to be recoloured, and doing it silently
   at that moment is unrecoverable-feeling even with undo. It tells you, and
   the press is beside the sentence. The fixer is where it happens by itself,
   because that is the step that is already producing a new picture. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const MID = String.fromCharCode(92) + 'u00b7';

/* ---- the fixer does it unless told not to -------------------------- */
{
  const at = kit.only(L, l => l === '      <input type="checkbox" id="fixpal">', 'the palette switch');
  kit.replace(L, { start: at - 2, end: at }, [
    '    <!-- ON BY DEFAULT. Was off, reasoned as "it rewrites every colour,',
    '         which is not a thing to do to somebody art because they pressed',
    '         Fix it" - which was answering the wrong question. This tab',
    '         rebuilds every pixel of the picture on a grid it worked out; the',
    '         palette is the same kind of act, not a new liberty. Still a',
    '         switch, and the run still says what it did to each file. -->',
    '    <label class="olrow" style="gap:6px"',
    '      title="Change every colour in the result to the nearest one in the project palette. A green becomes a different shade of green. Colours already in the palette are left alone and nothing transparent is touched.">',
    '      <input type="checkbox" id="fixpal" checked>',
  ]);
}

/* ---- and the editor says what it found ----------------------------- */
{
  const at = kit.only(L, l => l === 'function buildProjectPalette(){', 'the project palette builder');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* HOW MANY OF THIS TRAIT COLOURS ARE NOT IN THE PALETTE, said beside the',
    '   button that fixes them.',
    '',
    '   Through specCheck, which is the one place that decides what off-palette',
    '   MEANS - the agent panel prints the same answer, and two functions',
    '   disagreeing about it is the shape of every drifting-report defect on',
    '   this page. It could already answer this; nothing asked it unless you',
    '   went to that panel and pressed something.',
    '',
    '   Written here rather than at open, so it is right again after anything',
    '   that changes the colours: buildPalette is what runs then. */',
    'function palOffNote(){',
    '  const el=$("palsnapnote"); if(!el) return;',
    '  if(!ctx||!art||!art.width){ el.textContent=""; return; }',
    '  let r=null;',
    '  try{',
    '    const im=ctx.getImageData(0,0,art.width,art.height);',
    '    r=specCheck(im.data,art.width,art.height,$("tlayer")?$("tlayer").value:"");',
    '  }catch(_){ el.textContent=""; return; }',
    '  el.textContent = r.offPaletteColours',
    '    ? r.offPaletteColours+" colour"+(r.offPaletteColours===1?"":"s")',
    '      +" not in the palette '+MID+' "+r.offPalettePixels.toLocaleString()+" pixels"',
    '    : "every colour is in the palette";',
    '}',
  ]);
  const fn = kit.inFunction(L, 'function buildPalette(list){');
  const call = kit.only(L, l => l === '  buildProjectPalette();', 'where the project palette is built', fn);
  kit.replace(L, { start: call, end: call }, [
    '  buildProjectPalette();',
    '  /* AND WHAT IS OFF IT. Here, so it is right again after every change to',
    '     the colours rather than only when the trait opened. */',
    '  palOffNote();',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE FIXER DOES IT UNLESS TOLD NOT TO. */
  if (!/<input type="checkbox" id="fixpal" checked>/.test(text))
    throw new Error('the fixer still waits to be asked');
  /* AND IT IS STILL A SWITCH. On by default is not the same as always. */
  if (!/id="fixpal"/.test(text))
    throw new Error('the switch is gone, so there is no way to turn it off');

  /* THE EDITOR SAYS SO, THROUGH THE ONE AUTHORITY ON WHAT OFF-PALETTE MEANS. */
  const pn = kit.inFunction(codeLines, 'function palOffNote(){');
  const body = codeLines.slice(pn.start, pn.end + 1).join('\n');
  if (!/specCheck\(im\.data,art\.width,art\.height,/.test(body))
    throw new Error('the editor has its own idea of what is off the palette');
  if (!/every colour is in the palette/.test(body))
    throw new Error('it is silent when there is nothing wrong, so nobody learns it ran');
  /* AND IT DOES NOT REWRITE ANYTHING. Telling is not doing, and doing it at
     open is not recoverable-feeling even with undo. */
  if (/putImageData|snapToPalette/.test(body))
    throw new Error('opening a trait would recolour it');

  /* It is called where the colours are rebuilt, so it cannot go stale. */
  const bp = kit.inFunction(codeLines, 'function buildPalette(list){');
  if (!/palOffNote\(\);/.test(codeLines.slice(bp.start, bp.end + 1).join('\n')))
    throw new Error('nothing asks it, so the line is blank until something else does');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
