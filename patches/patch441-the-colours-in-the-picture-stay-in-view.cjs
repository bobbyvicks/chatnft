/* THE TRAIT'S OWN COLOURS SCROLLED AWAY UNDER THE PALETTE.

   "can you make the colours that are in the current artwork always visible"

   patch434 put the project's 256 colours under the trait's own, which is what
   was asked for - and made the colour panel 420px taller than it can show at
   once. The trait's swatches are at the top of that, so reaching the palette
   scrolls them off. Measured at 1600x1000, scrolling the panel to the bottom:
   the swatch grid goes from 171px below the top of the card to 249px ABOVE
   it, entirely out of view.

   They are the colours you are working with. Everything on that panel - mark
   for replacing, right-click a palette colour to say what they become - is
   about them, and doing any of it while they are off screen means scrolling
   back to check what is marked.

   So they stay. Sticky to the top of the panel, with the panel's own
   background under them so the palette passes behind rather than through.

   THE LEFT COLUMN ALREADY DID THIS, and this does not replace it: the strip
   is a second view of the same set, always open, built by buildPalette with
   the same handlers - recolour.spec.js pins that the views agree. That strip
   is not on a phone, where there is no column; this is in the panel itself,
   which is where the palette it has to survive lives. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = kit.only(L, l => l === '.swatches{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
  'the trait swatch grid rule');
kit.replace(L, { start: at, end: at }, [
  '.swatches{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
  '/* THE COLOURS IN THE PICTURE STAY IN VIEW.',
  '',
  '   #pal only, not .swatches: the strip in the left column is the same set',
  '   under a different id and is already always open, and making the shared',
  '   class sticky would pin it inside a column it does not scroll in.',
  '',
  '   The panel grew 420px past what it can show when the project palette went',
  '   in under this, and scrolling to reach that took these off the top -',
  '   measured from 171px inside the card to 249px above it. Everything else',
  '   on the panel acts on them, so they have to be there while it does.',
  '',
  '   An opaque background, or the palette scrolls THROUGH them rather than',
  '   behind. Padding underneath for the same reason: without it a row of',
  '   swatches sits flush against the ones passing under it.',
  '',
  '   AND IT IS PINNED 22px HIGHER THAN IT SITS, with 22px of its own padding',
  '   putting the swatches back where they were. A scroll box clips at its',
  '   BORDER box while sticky pins to its PADDING box, so .card{padding:22px}',
  '   leaves a 22px band above the pinned row that the palette scrolls',
  '   through - measured, a visible sliver of swatches over the top of them.',
  '',
  '   A NEGATIVE MARGIN DOES NOT DO THIS, which was the first attempt: the',
  '   sticky constraint pins the MARGIN box to top, so -22px is absorbed by it',
  '   and the element only grows downward. Measured after that change - the',
  '   painted top was still 23px in and elementFromPoint at the top of the',
  '   card still answered projpal. top:-22px moves what sticky pins to.',
  '',
  '   The number is the card padding. If that changes, this is the other half',
  '   of that change, and the check below fails until it is made. */',
  '#pal{position:sticky; top:-22px; z-index:2; background:var(--panel);',
  '  padding:22px 0 6px;}',
]);

const bytes = kit.save(doc, ({ text }) => {
  if (!/#pal\{position:sticky; top:-22px; z-index:2; background:var\(--panel\);/.test(text))
    throw new Error('the colours in the picture still scroll away');
  /* NOT THE SHARED CLASS. The left-column strip is the same set under another
     id and does not scroll in the same box; pinning it there would stick it
     to the top of a column it sits still in. */
  if (/\.swatches\{[^}]*position:sticky/.test(text))
    throw new Error('the left column strip was pinned too');
  /* AND IT IS OPAQUE, or what scrolls under shows through it. */
  if (!/#pal\{[^}]*background:var\(--panel\)/.test(text))
    throw new Error('the palette will scroll through the swatches');
  /* AND ITS BACKGROUND REACHES THE TOP OF THE SCROLL BOX. A scroll box clips
     at the border box while sticky pins to the padding box, so without this
     the card 22px padding is a band the palette scrolls through above the
     pinned row. */
  if (!/#pal{[^}]*padding:22px 0 6px;/.test(text))
    throw new Error('the palette scrolls past above the pinned row');
  if (!/.card{[^}]*padding:22px;/.test(text))
    throw new Error('the card padding moved, so the 22px above is now wrong');

  /* The project palette is still below it and still its own scroll box. */
  if (!/#projpal\{display:grid; grid-template-columns:repeat\(16,1fr\)/.test(text))
    throw new Error('the project palette block was disturbed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
