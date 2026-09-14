/* THE SAME INSTRUCTION, TWICE, IN THE SAME PANEL.

   #palhow, directly above the colours, says:
     "Left-click a colour to use it and mark it. Right-click one to set what
      it changes to."
   and eighty pixels below it the project palette's note said:
     "... left-click to paint with one, right-click to change the marked
      colours to it"

   The same sentence about the same gesture, in different words, which is
   worse than saying it once: two wordings of one rule read as two rules.

   It also costs three lines directly above the palette, and that height is
   the thing patch448 was buying - all 256 colours fit in the panel when
   nothing above them is taller than it needs to be. Measured on a trait with
   40 of its own colours, the last row was two pixels below the fold. This is
   where those two pixels were.

   The note keeps what only it can say - which palette this is, and how many
   colours are in it - and #palhow is widened by one word to cover both grids
   rather than only the one it sits under. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  if(n) n.textContent=PALETTE_SOURCE.name+" \\u00b7 "+list.length',
    'what the palette note says');
  if (L[at + 1] !== '    +" colours \\u00b7 left-click to paint with one, right-click to change the"'
    || L[at + 2] !== '    +" marked colours to it";')
    throw new Error('the palette note is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  /* WHICH PALETTE AND HOW BIG - the two things only this line knows. How',
    '     to click a swatch is said once, in #palhow above, which covers both',
    '     grids: the same rule in two wordings reads as two rules, and it cost',
    '     three lines of height directly above the 256 colours this panel',
    '     exists to show. */',
    '  if(n) n.textContent=PALETTE_SOURCE.name+" \\u00b7 "+list.length+" colours";',
  ]);
}

{
  const at = kit.only(L, l => l === '      <p class="note" id="palhow">Left-click a colour to use it and mark it.',
    'the instruction above the colours');
  if (L[at + 1] !== '        Right-click one to set what it changes to.</p>')
    throw new Error('the instruction is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '      <!-- Covers every grid below it, which is why the project palette no',
    '           longer repeats it in different words. -->',
    '      <p class="note" id="palhow">Left-click any colour below to use it and',
    '        mark it. Right-click one to set what it changes to.</p>',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  /* SAID ONCE. */
  if (/left-click to paint with one/.test(code))
    throw new Error('the palette note still repeats the instruction');
  if ((text.match(/Right-click one to set what it changes to/g) || []).length !== 1)
    throw new Error('the instruction is not in exactly one place');
  /* AND THE ONE PLACE COVERS BOTH GRIDS. */
  if (!/Left-click any colour below to use it and/.test(text))
    throw new Error('the instruction does not say it covers the palette too');
  /* WHAT ONLY THE NOTE KNOWS IS STILL THERE - projectpalette.spec.js reads
     the palette name and the count out of this line. */
  if (!/n\.textContent=PALETTE_SOURCE\.name\+" \\u00b7 "\+list\.length\+" colours";/.test(code))
    throw new Error('the note stopped saying which palette this is');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
