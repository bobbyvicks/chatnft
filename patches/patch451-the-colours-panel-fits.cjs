/* NO SCROLLBAR ON THE COLOURS PANEL AT ALL.

   "There is still an outer scroll bar in the menu so now its just a scroll
   bar in a different spot, i want to be able to eliminate that scroll bar
   completely."

   Fair. patch448 removed the scroller INSIDE the panel, which is why the 256
   colours became one block instead of a 380px porthole - but the card itself
   still scrolled, so the scrollbar moved rather than left.

   IT IS A COLUMN PROBLEM, NOT A HEIGHT PROBLEM. Measured at 1600x1000 on a
   trait with 24 of its own colours, the panel holds about 1,046px of content
   in a card that can be 940: the header 105, the trait's colours 122, the
   just-used row 50, the project palette 429, and then 340 of palette-file
   rows, recolour tools and the close bar. Nothing in that list is padding to
   be trimmed - it is all controls - and there is no height that fits it in
   one column on a 1000-tall screen.

   In two columns it fits with room to spare: the trait's colours beside the
   project palette is max(277, 429) rather than 277 + 429, and 429 + 340 + the
   header is about 790. The two things side by side are also the two things
   this panel is for, and the tools that act on them sit under both.

   FOUR CHILDREN, so the placement cannot drift. Pinning by grid-row would
   have worked today and broken the moment anybody added a paragraph to the
   header; wrapping means the browser places head, the pair, and the rest in
   that order with nothing to keep in sync.

   ONE COLUMN WHEN THERE IS NOT ROOM. Below 1080px the card goes back to a
   single 340px column and scrolls, which is what a phone has always done -
   the media query at 820 already turns this pop-out into a full sheet.
   Nothing about the narrow case is claimed to be scroll-free. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the four groups ------------------------------------------------ */
{
  const head = kit.only(L, l => l === '    <h2 id="cltitle">Colours</h2>', 'the panel title');
  const pickerRow = kit.only(L, l => l === '    <div class="olrow"><label for="picker">Any colour</label>',
    'the any-colour row');
  const recentEnd = kit.only(L, l => l === '        aria-label="Colours you have just used"></div>',
    'the end of the just-used strip');
  const projEnd = kit.only(L, l => l === '      <div id="projpal" role="group" aria-label="Project palette"></div>',
    'the project palette');
  const close = kit.only(L, l => l === '      <button class="btn ghost" id="clclose" style="flex:1">Close</button>',
    'the close button');
  if (!(head < pickerRow && pickerRow < recentEnd && recentEnd < projEnd && projEnd < close))
    throw new Error('the panel is not in the order this expects');
  if (L[close + 1] !== '    </div>' || L[close + 2] !== '  </div>')
    throw new Error('the panel does not end the way this expects');

  /* Bottom up, so the earlier line numbers stay valid. */
  kit.replace(L, { start: close + 1, end: close + 1 }, [
    '    </div>',
    '    </div>',
  ]);
  kit.replace(L, { start: projEnd, end: projEnd }, [
    L[projEnd],
    '      </div>',
    '      <!-- Everything that ACTS on the two sets above, under both of them.',
    '           Spans the full width, so the column split is only where it buys',
    '           something. -->',
    '      <div class="clrest">',
  ]);
  kit.replace(L, { start: recentEnd, end: recentEnd }, [
    L[recentEnd],
    '      </div>',
    '      <!-- The project palette, beside the trait\'s own rather than under',
    '           it. 256 swatches is 429px and the trait\'s colours are 122 - one',
    '           above the other is what made the card scroll. -->',
    '      <div class="clright">',
  ]);
  kit.replace(L, { start: pickerRow, end: pickerRow }, [
    '      <!-- The colours in THIS picture, and the ones just used. -->',
    '      <div class="clleft">',
    L[pickerRow],
  ]);
  kit.replace(L, { start: head, end: head }, [
    '    <div class="clhead">',
    L[head],
  ]);
  const sub = kit.only(L, l => l === '    <p class="sub">The colours in this trait, and any colour you like.</p>',
    'the panel subtitle');
  kit.replace(L, { start: sub, end: sub }, [
    L[sub],
    '    </div>',
  ]);
}

/* ---- and the two columns -------------------------------------------- */
{
  const at = kit.only(L, l => l === '#clscrim>.card{max-height:min(92dvh,940px);}',
    'the colours card height');
  kit.replace(L, { start: at, end: at }, [
    '#clscrim>.card{max-height:min(92dvh,940px);}',
    '/* TWO COLUMNS, WHICH IS WHAT MAKES THE SCROLLBAR GO AWAY.',
    '',
    '   The panel holds about 1,046px of controls and the card can be 940, so',
    '   in one column it scrolls whatever height it is given - there is nothing',
    '   in that 1,046 that is padding rather than a control. Side by side the',
    '   trait colours and the project palette cost max(277,429) instead of',
    '   their sum, and the whole panel comes to about 790.',
    '',
    '   Placement comes from the four wrappers rather than from grid-row',
    '   numbers: pinning rows would work today and break the moment a line was',
    '   added to the header.',
    '',
    '   1080px because the card needs 760 and popAt puts it past the tool rail',
    '   - below that it stays one column and scrolls, which is what the narrow',
    '   case has always done. */',
    '@media (min-width:1080px){',
    '  #clscrim>.card{width:min(760px,94vw); display:grid;',
    '    grid-template-columns:1fr 1fr; gap:0 18px; align-content:start;}',
    '  #clscrim .clhead,#clscrim .clrest{grid-column:1/-1;}',
    '  #clscrim .clleft{grid-column:1;}',
    '  #clscrim .clright{grid-column:2;}',
    '}',
  ]);
}

/* ---- and it stays on the screen it is placed on --------------------- */
{
  const at = kit.only(L, l => l === '  s.style.left=Math.round(Math.max(r.right,clear)+12)+"px";',
    'where a pop-out is placed');
  if (L[at + 1] !== '  s.style.top="8px";')
    throw new Error('popAt is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '  /* CLAMPED TO THE RIGHT EDGE. This only ever pushed the card away from',
    '     the rail and never asked whether it still fitted, which was fine',
    '     while every pop-out was 340 wide. The colours panel is 760 on a wide',
    '     window, and on a narrower one that would have run off the screen. */',
    '  const cw=(c?c.getBoundingClientRect().width:0)||0;',
    '  const want=Math.max(r.right,clear)+12;',
    '  s.style.left=Math.round(Math.max(8,Math.min(want,innerWidth-cw-8)))+"px";',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE FOUR GROUPS EXIST, once each. */
  for (const cls of ['clhead', 'clleft', 'clright', 'clrest']) {
    const n = (text.match(new RegExp('class="' + cls + '"', 'g')) || []).length;
    if (n !== 1) throw new Error('the ' + cls + ' group appears ' + n + ' times, not once');
  }
  /* AND THE TWO SETS ARE IN DIFFERENT ONES, which is the whole point. */
  const left = text.indexOf('class="clleft"'), right = text.indexOf('class="clright"');
  const pal = text.indexOf('id="pal"'), proj = text.indexOf('id="projpal"');
  const rest = text.indexOf('class="clrest"');
  if (!(left < pal && pal < right)) throw new Error('the trait colours are not in the left group');
  if (!(right < proj && proj < rest)) throw new Error('the palette is not in the right group');
  /* The just-used strip stays with the picture's colours, not with the
     palette - it is about what you have been painting with. */
  const rec = text.indexOf('id="palrecent"');
  if (!(left < rec && rec < right))
    throw new Error('the just-used strip drifted out of the left column');

  /* THE COLUMNS ARE PLACED BY THE WRAPPERS, not by row numbers that go stale
     the moment a line is added to the header. */
  if (!/#clscrim \.clleft\{grid-column:1;\}/.test(text)
    || !/#clscrim \.clright\{grid-column:2;\}/.test(text))
    throw new Error('the two columns are not placed');
  if (/#clscrim [^{]*\{[^}]*grid-row:/.test(text))
    throw new Error('something is pinned to a row number');
  if (!/#clscrim>\.card\{width:min\(760px,94vw\); display:grid;/.test(text))
    throw new Error('the card is not wide enough for two columns');

  /* AND ONLY THIS PANEL. .scrim.pop>.card is every rail pop-out. */
  if (!/\.scrim\.pop>\.card\{width:min\(340px,92vw\); max-height:min\(78dvh,640px\);/.test(text))
    throw new Error('every pop-out was widened, not just the colours one');

  /* A POP-OUT CANNOT RUN OFF THE SCREEN NOW. */
  const pa = kit.inFunction(codeLines, 'function popAt(id){');
  const pab = codeLines.slice(pa.start, pa.end + 1).join('\n');
  if (!/Math\.min\(want,innerWidth-cw-8\)/.test(pab))
    throw new Error('a wide pop-out can still be placed off the right edge');
  /* The narrow case is untouched: below 820 this returns before placing
     anything and the sheet rules take over. */
  if (!/if\(innerWidth<=820\)\{ s\.style\.left=""; s\.style\.top=""; return; \}/.test(pab))
    throw new Error('the phone path through popAt changed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
