/* STEPPING THE PIXEL SIZE MOVED THE BUTTONS OUT FROM UNDER THE POINTER.

   "when im chosing a pixell size and the text beside it gets to a new point
   it moves the whole area, can you make it so that when the text channges
   nothing changes like that? (causes accidental clicks on import a image
   button"

   The readout lives INSIDE the control row, and the row wraps. So the
   sentence it prints is a flex item of the same row as the switches and the
   Fix it button, and every time that sentence changes length the row relays
   out around it.

   Measured, stepping the size through 0, 4, 8, 12, 16, 24 and 3 with the
   snap off - the row's own height, and where two of the controls ended up:

     1440 wide   row 63 / 90 / 117 px
                 Snap    at 1148,436  and at 153,491 - a line down and
                                           995px to the left
                 Save at at 1015,436  and at 1170,464
                 Fix it  moves down 54px
     1180 wide   row 63 / 117
     900 wide    row 63 / 90 / 135 - a 72px swing

   A control that is under the pointer when you press the up arrow and
   somewhere else by the time you let go is a misclick waiting to happen, and
   the thing it lands on is whatever moved into that spot.

   The readout is a sentence, not a control, so it comes out of the row and
   goes on its own line underneath. The row then holds only things you press,
   and nothing the readout says can move any of them.

   AND THE LINE ITSELF KEEPS ITS HEIGHT. Two lines are reserved - 35px, which
   is what 11.5px text at line-height 1.5 comes to - because the long form of
   the message wraps to two at 900 and to one at 1180, and without the reserve
   the previews below it would move instead of the buttons. It still grows
   past two on a phone, where the row is stacked and there is nothing beside
   it to mis-hit. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- out of the row ------------------------------------------------ */
{
  const at = kit.only(L, l => l === '    <span class="note mono" id="fixsize"></span>',
    'the readout inside the control row');
  kit.replace(L, { start: at, end: at }, []);
  const stop = kit.only(L, l => l === '    <button class="btn ghost" id="fixstop" hidden>Stop</button>',
    'the end of the control row');
  if (L[stop + 1] !== '  </div>')
    throw new Error('the control row does not close where this expects');
  kit.replace(L, { start: stop + 1, end: stop + 1 }, [
    '  </div>',
    '  <!-- ON ITS OWN LINE. In the row above it was a flex item, so every time',
    '       the sentence changed length the row relaid out and the switches and',
    '       the Fix it button moved - measured at up to a line down and 995px',
    '       across. Two lines are reserved so the previews below hold still',
    '       too. -->',
    '  <p class="note mono fixsay" id="fixsize"></p>',
  ]);
}

/* ---- and the line holds its height --------------------------------- */
{
  const at = kit.only(L, l => l === '.agjob{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0;}',
    'the control row rule');
  kit.replace(L, { start: at, end: at }, [
    '.agjob{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0;}',
    '/* THE PIXEL SIZE READOUT. Two lines held open at 11.5px and line-height',
    '   1.5, so the one-line and two-line forms of the message occupy the same',
    '   space and nothing below it moves when it changes. */',
    '.fixsay{min-height:35px; margin:2px 0 4px;}',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  /* THE READOUT IS NOT IN THE ROW. That is the whole fix. */
  const row = text.match(/<div class="agjob">[\s\S]*?<\/div>/g) || [];
  const fixRow = row.find(r => /id="fixrun"/.test(r));
  if (!fixRow) throw new Error('the fixer control row was not found');
  if (/id="fixsize"/.test(fixRow))
    throw new Error('the readout is still a flex item of the row it was moving');
  /* And it still exists, on its own line, with the height held. */
  if (!/<p class="note mono fixsay" id="fixsize"><\/p>/.test(text))
    throw new Error('the readout did not come back on its own line');
  if (!/\.fixsay\{min-height:35px;/.test(text))
    throw new Error('the line does not hold its height');
  /* The row still holds everything that is pressed. */
  for (const id of ['fixmode', 'fixforce', 'fixgrid', 'fixsnap', 'fixrun', 'fixstop']) {
    if (!new RegExp('id="' + id + '"').test(fixRow))
      throw new Error('the row lost ' + id);
  }
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
