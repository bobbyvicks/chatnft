/* ALL 256 COLOURS AT ONCE, INSTEAD OF A WINDOW INSIDE A WINDOW.

   "at the moment we cant see all the colours on the pallete without having to
   annoyingly use a scroll bar to see stuff. I want to be able to see all of
   the colours. when you open that colour button"

   The colour button is #clbtn and it opens a pop-out card. Inside it the
   project palette had its OWN scroller - max-height:38dvh, overflow-y:auto -
   inside a card that is itself a scroller. Two nested scrollbars: you scroll
   the card, reach the palette, and it takes the wheel off you.

   THE ARITHMETIC, because it decides the shape of the fix. The palette is 16
   columns - that is the grid it is published on, its rows are ramps, and any
   other width cuts the families in half, so the column count is not available
   to change. The swatches are floored at 22px because paneldensity holds
   every target to that. 256 in 16 columns is 16 rows: 16*22 + 15*3 + 6 = 403
   pixels, and 38dvh is 380 on a 1000-tall window. It was thirty pixels short
   of never needing to scroll at all.

   WIDENING THE CARD WOULD HAVE MADE IT WORSE, which is worth writing down
   because it was the obvious move. repeat(16,1fr) with aspect-ratio:1 means
   the width sets the swatch size: a 980px card gives 58px swatches and a
   976px-tall palette. The palette wants to stay narrow. What has to give is
   the HEIGHT it is allowed.

   So: the inner scroller goes entirely, and the Colours card alone is allowed
   to be tall enough to hold the whole palette with the picture's colours
   above it. The card can still scroll - the palette file rows and the
   recolour stack below are further down than any window - but the COLOURS are
   one block you see at once, which is what was asked for.

   SCOPED TO THIS PANEL. .scrim.pop>.card is every rail pop-out; giving all of
   them 92dvh would make the small ones tall and empty. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the window inside the window goes ---------------------------- */
{
  const at = kit.only(L, l => l === '#projpal{display:grid; grid-template-columns:repeat(16,1fr); gap:3px;',
    'the project palette grid');
  if (L[at + 1] !== '  max-height:38dvh; overflow-y:auto; padding:2px 2px 4px;}')
    throw new Error('the project palette is not capped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '/* NO CAP AND NO SCROLLER OF ITS OWN. This was capped so 256 swatches could',
    '   not push the rest of the panel off the screen, and the cost was a',
    '   scrollbar inside a scrollbar: the card scrolls, then the palette takes',
    '   the wheel when you reach it. 16 rows of 22 plus the gaps is 403px, and',
    '   38dvh is 380 on a 1000-tall window - it was thirty pixels short of not',
    '   needing this at all. The card below is allowed the height instead. */',
    '#projpal{display:grid; grid-template-columns:repeat(16,1fr); gap:3px;',
    '  padding:2px 2px 4px;}',
  ]);
}

/* ---- 2. and the Colours card is allowed to hold it ------------------- */
{
  const at = kit.only(L, l => l === '.scrim.pop>.card{width:min(340px,92vw); max-height:min(78dvh,640px);',
    'the pop-out card');
  if (L[at + 1] !== '  pointer-events:auto; box-shadow:0 22px 54px #000000a8;}')
    throw new Error('the pop-out card is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '.scrim.pop>.card{width:min(340px,92vw); max-height:min(78dvh,640px);',
    '  pointer-events:auto; box-shadow:0 22px 54px #000000a8;}',
    '/* THE COLOURS PANEL ALONE. 640px cannot hold the project palette (403) on',
    '   top of the picture\'s own colours and the header, so the one panel whose',
    '   job is to show you every colour gets the height to do it. The others',
    '   keep 640: a tall empty card is its own problem.',
    '',
    '   It still scrolls. The palette file rows and the recolour stack are below',
    '   the palette and further down than any window - what changed is that the',
    '   COLOURS are one block you see at once rather than a 380px porthole. */',
    '#clscrim>.card{max-height:min(92dvh,940px);}',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  /* THE NESTED SCROLLER IS GONE. */
  if (/#projpal\{[^}]*overflow-y:auto/.test(text))
    throw new Error('the palette still scrolls inside the card');
  if (/#projpal\{[^}]*max-height/.test(text))
    throw new Error('the palette is still capped');
  /* AND THE THINGS THAT MAKE THE ARITHMETIC WORK ARE UNTOUCHED. Sixteen
     columns is the grid the palette is published on - its rows are ramps -
     and 22px is the floor paneldensity holds every target to. Either one
     moving changes whether 256 fit, so both are pinned here. */
  if (!/#projpal\{display:grid; grid-template-columns:repeat\(16,1fr\); gap:3px;/.test(text))
    throw new Error('the palette is no longer the 16-wide grid it is published on');
  if (!/\.sw\{aspect-ratio:1; min-height:22px;/.test(text))
    throw new Error('the 22px swatch floor moved, so the height this needs changed');

  /* THE CARD CAN HOLD IT, and only this card. */
  if (!/#clscrim>\.card\{max-height:min\(92dvh,940px\);\}/.test(text))
    throw new Error('the colours panel is still too short for its own palette');
  if (!/\.scrim\.pop>\.card\{width:min\(340px,92vw\); max-height:min\(78dvh,640px\);/.test(text))
    throw new Error('every pop-out was made tall, not just the colours one');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
