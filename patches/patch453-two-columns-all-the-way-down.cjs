/* TWO COLUMNS ALL THE WAY DOWN TO THE SHEET.

   "can we get rid of the scroll bar on smaller screens too i want to make
   this site as seamless and efficient as possible"

   The two-column panel was gated at 1080px for no measured reason - it was
   the width I checked and stopped at. Measured since, forcing two columns at
   widths the gate refused: the layout holds at 1024x768, 980x800, 900x760 and
   860x740 with no scrollbar, the whole card on screen and nothing overflowing
   sideways. The gate was costing every laptop between 820 and 1080 a
   scrollbar it did not need.

   WIDTH WAS NEVER THE BINDING CONSTRAINT - HEIGHT IS. At 840x720 the card is
   capped at 92dvh, which is 662, against 673 of content: eleven pixels. So
   the cap moves to 96dvh, which is what the panel is anchored for anyway -
   popAt already places it eight pixels down and keeps it on screen.

   THE GATE MEETS THE SHEET EXACTLY. At 820 and below the pop-out already
   becomes a centred sheet with 30px swatches for touch, so 821 is the first
   width where the two-column pop-out is what is on screen. One boundary
   rather than two, and no band between them where neither rule is right.

   BELOW 820 IS NOT FIXED BY THIS AND IS NOT CLAIMED TO BE. On a phone the
   swatches are 30px - the touch floor this project holds to - so the palette
   alone is 531px and the panel is 1,331. That cannot fit in 844 minus the
   browser without either hiding controls behind a tap or shrinking targets
   under their own floor, and both of those are decisions rather than
   layouts. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '#clscrim>.card{max-height:min(92dvh,940px);}',
    'the colours card height');
  kit.replace(L, { start: at, end: at }, [
    '/* 96dvh, NOT 92. At 840x720 the panel is 673px of content against a 662px',
    '   cap - eleven pixels, and the only thing standing between a small laptop',
    '   and no scrollbar at all. popAt anchors this eight pixels down and keeps',
    '   it on screen, so the four percent was never protecting anything. */',
    '#clscrim>.card{max-height:min(96dvh,940px);}',
  ]);
}

{
  const at = kit.only(L, l => l === '@media (min-width:1080px){', 'the two-column gate');
  kit.replace(L, { start: at, end: at }, [
    '/* 821, WHICH IS WHERE THE SHEET ENDS. Two columns were gated at 1080',
    '   because that is the width I measured and stopped at, not because',
    '   anything gave way below it. Measured since at 1024x768, 980x800,',
    '   900x760 and 860x740: no scrollbar, the whole card on screen, no',
    '   sideways overflow, swatches still 22px. At 820 and under the pop-out is',
    '   already a centred sheet with 30px touch targets, so this meets that',
    '   rule exactly and there is no band between them. */',
    '@media (min-width:821px){',
  ]);
}

{
  /* AND SIX PIXELS OFF THE CLOSE BAR, which is the difference between a
     700-tall window scrolling and not: 673 of content against a 672 cap. An
     eighteen-pixel gap above a single Close button was the most generous
     spacing in the panel and the cheapest place to find them. Scoped by id -
     eight elements share this savebar line and the other seven are fine.

     Edited in the markup rather than in a rule, because the gap is an INLINE
     style and no selector beats one - a stylesheet version of this was
     written first and changed nothing at all. */
  const at = kit.near(L, '    <div class="savebar" style="margin-top:18px">', 1,
    'id="clclose"', 'the close bar');
  kit.replace(L, { start: at, end: at }, [
    '    <div class="savebar" style="margin-top:12px">',
  ]);
}

{
  /* AND THE SUBTITLE GOES, for 37 more - which is what takes this down to a
     1366x768 laptop, where the browser leaves about 660 of viewport.

     Said plainly: the reason is the height. But it is also the line with the
     least left to say. "The colours in this trait, and any colour you like"
     was written when this was one column of unlabelled swatches; the panel is
     titled Colours, the left column opens with Any colour, and the right is
     headed by the palette's own name and count. It restates the title. */
  const at = kit.only(L, l => l === '    <p class="sub">The colours in this trait, and any colour you like.</p>',
    'the panel subtitle');
  kit.replace(L, { start: at, end: at }, []);
}

const bytes = kit.save(doc, ({ text }) => {
  if (!/@media \(min-width:821px\)\{/.test(text))
    throw new Error('the two-column layout is still gated above the sheet');
  if (/@media \(min-width:1080px\)\{/.test(text))
    throw new Error('the old gate is still there');
  if (!/#clscrim>\.card\{max-height:min\(96dvh,940px\);\}/.test(text))
    throw new Error('the card is still too short for its own content');
  /* THE SHEET BOUNDARY IS WHAT THIS MEETS, so if that moves these two stop
     lining up and a band opens between them where neither rule fits. */
  if (!/@media \(max-width:820px\)\{/.test(text))
    throw new Error('the sheet boundary moved, so 821 is now the wrong number');
  /* And the sheet still gets the bigger touch targets, which is the reason
     the panel cannot simply use this layout all the way down. */
  if (!/\.swatches,\.swrow\{grid-template-columns:repeat\(10,1fr\);\} \.sw\{min-height:30px;\}/.test(text))
    throw new Error('the touch targets on the sheet changed');
  /* The two columns are still placed by the wrappers. */
  if (!/#clscrim \.clleft\{grid-column:1;\}/.test(text)
    || !/#clscrim \.clright\{grid-column:2;\}/.test(text))
    throw new Error('the two columns stopped being placed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
