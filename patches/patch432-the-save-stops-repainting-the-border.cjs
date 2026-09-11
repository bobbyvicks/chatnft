/* SAVING A FINISHED TRAIT REPAINTED ITS OUTER EDGE BLACK.

   "look at the way it had saved the black border ... do we have a auto border
   option on? if so turn that off"

   There was no option: traitCanvas asserted the collection's black border on
   every save, unconditionally. Measured by opening clothing/Exit Liquidity
   Red Hood Up and saving it straight back with nothing else touched: 1163
   pixels turned black, none of them on the art's own grid - a hairline of
   black laid over an outline the artist had already drawn.

   THE RULE IS ONE CANVAS PIXEL WIDE, and it was written when a trait canvas
   was its own resolution, where one canvas pixel IS one art pixel. The
   comment above it says so: "the border is one pixel wide at whatever size
   the canvas now is". Every trait is 1280 now and drawn in blocks of eight or
   ten, so what it paints is an eighth of an art pixel - a fringe, at a
   resolution the art is not drawn at.

   WHERE THE RULE STAYS. The other caller is the extraction pipeline, which
   cuts a trait out of a rendered character, and the reason it exists lives
   there: an anti-aliased export leaves a pale rim, and asserting black is
   what removes it. That call site carries a decision in as many words - "Not
   a setting. A rule that can be switched off is not a rule, and this one was
   asked for twice - the first time it became a checkbox, which is how a trait
   with a pale fringe still reached a character." That is untouched, and it is
   still not a checkbox.

   What changes is only the SAVE. A trait being saved out of the editor has
   already been through that; re-asserting the rule on art somebody has just
   finished editing is not cleaning a cut edge, it is painting over their
   work every time they press the button.

   The peel is a separate function and is not on this path at all, so nothing
   about fringe removal moves. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'function traitCanvas(out){');
const at = kit.only(L, l => l === '  if(c.width>=projectGrid && c.height>=projectGrid){',
  'the border rule on the save path', fn);
if (L[at + 2] !== '    const ring = blackenEdge(im.data,c.width,c.height);')
  throw new Error('the save is not shaped the way this expects');
let end = at;
while (L[end] !== '  }') end++;
kit.replace(L, { start: at, end: end }, [
  '  /* THE SAVE NO LONGER REPAINTS THE EDGE.',
  '',
  '     This ran on every save and set every opaque pixel touching empty space',
  '     to pure black. Measured on clothing/Exit Liquidity Red Hood Up, opened',
  '     and saved straight back with nothing else touched: 1163 pixels turned',
  '     black, none of them on the art own grid. The rule is one CANVAS pixel',
  '     wide and was written when a trait canvas was its own resolution; at',
  '     1280 with 8px blocks that is an eighth of an art pixel, laid over an',
  '     outline the artist had already drawn.',
  '',
  '     THE RULE ITSELF IS NOT GONE. Its other caller is the extraction',
  '     pipeline, where a trait is cut out of a rendered character and an',
  '     anti-aliased export leaves a pale rim - that is what asserting black',
  '     removes, and the decision there that it must not become a checkbox',
  '     stands. This is the save path only: art that has already been through',
  '     that once and has just been edited by hand.',
  '',
  '     edgeRing and edgeChanged are still set, at zero, because saveTrait',
  '     reads them to decide whether to say anything - and a save that says',
  '     "0 edge pixels set to black" would be worse than one that says',
  '     nothing. */',
  '  if(out){ out.edgeRing=0; out.edgeChanged=0; }',
]);

/* ---- and the reasoning for the gate goes with the gate ------------- */
{
  const fn2 = kit.inFunction(L, 'function traitCanvas(out){');
  const at2 = kit.only(L, l => l === '  /* At the collection grid size and above only.',
    'the gate reasoning', fn2);
  let end2 = at2;
  while (L[end2].indexOf('a separate question. */') < 0) end2++;
  kit.replace(L, { start: at2, end: end2 }, [
    '  /* WAS A GATE, and the reasoning for it: "At the collection grid size',
    '     and above only", because the border rule ate a shrunken trait -',
    '     measured at 4% of the art at 160, 62.5% at 8, and 100% of six',
    '     one-pixel lines shrunk to 40. That gate guarded a rule this path no',
    '     longer applies at all, so it guards nothing. Kept as a note because',
    '     those numbers are the argument against ever putting it back here',
    '     without asking what a pixel is worth at the size being saved. */',
  ]);
}

const bytes = kit.save(doc, ({ text, code, codeLines }) => {
  const tc = kit.inFunction(codeLines, 'function traitCanvas(out){');
  const body = codeLines.slice(tc.start, tc.end + 1).join('\n');
  /* THE SAVE DOES NOT PAINT. */
  if (/blackenEdge/.test(body))
    throw new Error('the save still repaints the outer edge');
  /* AND THE CALLER THAT READS THE COUNT STILL GETS ONE. */
  if (!/if\(out\)\{ out\.edgeRing=0; out\.edgeChanged=0; \}/.test(body))
    throw new Error('saveTrait would read undefined and say something odd');

  /* THE RULE IS STILL THERE, AND STILL RUNS WHERE IT WAS ASKED FOR. That
     call site refused to become a checkbox for a reason, and this is not
     that call site. */
  if (!/function blackenEdge\(t,W,H\)\{/.test(code))
    throw new Error('the border rule was deleted rather than taken off the save');
  if (!/stats\.edgeBlacked=blackenEdge\(t,W,H\);/.test(code))
    throw new Error('the extraction pipeline lost the rule it exists for');
  /* Checked against the file: `code` is comment-stripped, and this one IS a
     comment - a recorded decision, which is the thing being protected. */
  if (!/Not a setting\. A rule that can be switched off is not a rule/.test(text))
    throw new Error('the decision recorded at that call site was removed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
