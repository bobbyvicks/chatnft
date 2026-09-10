/* THE FIX PIXELS PAGE WAS A 1180px COLUMN IN THE MIDDLE OF THE SCREEN.

   "make the whole fit pixels screen better in the sense where we can make
   previews bigger ... make those pages fill the screen"

   Every panel on the site is width:min(1180px,92vw), which is right for a
   page of text and wrong for the one page whose whole job is looking at two
   pictures side by side. On a 1920 screen that is 1180 used and 740 left
   empty, and the before and after were capped at 420px each on top of that -
   so a 1280px trait was shown at a third of its size with room for more than
   twice that going spare.

   Measured, before and after, on the before/after canvases:

     1920 wide    420 -> 720 px each   (the cap)   panel 1180 -> 1843
     1440 wide    420 -> 665 px each               panel 1180 -> 1382
     1180 wide    420 -> 540 px each               panel 1086 -> 1133
      900 wide    388 -> 406 px each               panel  828 ->  864

   And the document is still exactly the viewport wide at all four, so
   nothing gained the sideways scroll that a 96vw panel invites.

   720 is a cap and not the width: past that a trait drawn at 160 cells is
   being shown at more than four screen pixels per art pixel, which is a
   magnifier rather than a preview, and the pair stops fitting side by side
   on anything but the widest screens.

   ONLY THIS PAGE. The rule is written against the fixer page rather than
   .panelbox, because the other four pages are columns of prose and a
   1900px line of text is unreadable. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the page fills the screen ------------------------------------- */
{
  const at = kit.only(L, l => l === '.panelbox{width:min(1180px,92vw); text-align:left; padding:18px;',
    'the panel width');
  if (L[at + 1] !== '  border-radius:13px; background:var(--panel); border:1px solid var(--line);}')
    throw new Error('the panel rule is not shaped the way this expects');
  kit.replace(L, { start: at + 1, end: at + 1 }, [
    '  border-radius:13px; background:var(--panel); border:1px solid var(--line);}',
    '/* THE ONE PAGE THAT IS LOOKING AT PICTURES, not reading prose. 1180 is a',
    '   readable line length and a wasteful picture frame: on a 1920 screen it',
    '   left 740px empty beside two previews capped at 420px each. The other',
    '   four pages keep the column - a 1900px line of text is unreadable. */',
    '#land[data-page="fixer"] .panelbox{width:min(2100px,96vw);}',
  ]);
}

/* ---- and the previews take the room -------------------------------- */
{
  const at = kit.only(L, l => l === '.fixpair canvas{width:100%; max-width:420px; image-rendering:pixelated; background:',
    'the preview cap');
  kit.replace(L, { start: at, end: at }, [
    '/* 720, not 420. Past 720 a 160-cell trait is more than four screen pixels',
    '   to the art pixel, which is a magnifier rather than a preview, and the',
    '   pair stops sitting side by side on anything but the widest screens. */',
    '.fixpair canvas{width:100%; max-width:720px; image-rendering:pixelated; background:',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  if (!/#land\[data-page="fixer"\] \.panelbox\{width:min\(2100px,96vw\);\}/.test(text))
    throw new Error('the fixer page does not fill the screen');
  /* AND ONLY THE FIXER PAGE. The other four are prose. */
  if (!/\.panelbox\{width:min\(1180px,92vw\);/.test(text))
    throw new Error('every page was widened, including the ones made of text');
  if (!/\.fixpair canvas\{width:100%; max-width:720px;/.test(text))
    throw new Error('the previews did not get the room');
  if (/max-width:420px/.test(text))
    throw new Error('the old cap is still somewhere and will win or lose at random');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
