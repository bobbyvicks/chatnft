/* THE TOOLS GO UNDER THE COLOURS THEY ACT ON, AND THE SCROLLBAR GOES.

   "i want to be able to eliminate that scroll bar completely"

   patch451 put the trait's colours beside the project palette and that took
   the panel from 1,046px of content to 853 - measured, no scrollbar at
   1600x1000. On a 900-tall window the cap is 828 and it was still 25px over,
   so the bar was gone on one screen and not on the next.

   TWO COLUMNS THAT SHARE A ROW DO NOT HELP THE SECOND ROW. With the tools in
   a full-width block underneath, the panel is head + max(colours) + tools:
   105 + 429 + 340. The two columns only ever saved on their own row.

   So the tools move INTO the columns, and the saving compounds: the left
   column becomes the trait's colours with the recolour tools under them, the
   right becomes the project palette with the palette-file rows under it, and
   the panel is head + max(507, 513) + the close bar. About 660 against 853.

   IT IS ALSO WHERE THEY BELONG, which is why this is a move and not a
   squeeze. Replace, Erase and Clean up act on the colours IN THE TRAIT -
   they are the buttons for the swatches directly above them now. Import and
   Export are about the palette, and they sit under the palette. Reading
   order follows: what you are painting with, then what you may paint with.

   Nothing inside either block changes - they are lifted whole, so every id,
   handler and title goes with them. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const REST_OPEN = '      <div class="clrest">';
const FILE_END = '      <input type="file" id="piofile" accept=".gpl,.pal,.hex,image/*" hidden>';
const FOOT = '    <div class="savebar" style="margin-top:18px">';
const LEFT_OPEN = '      <div class="clleft">';
const RIGHT_OPEN = '      <div class="clright">';

/* ---- take the two blocks out, bottom first ------------------------- */
const restOpen = kit.only(L, l => l === REST_OPEN, 'the tools block');
const fileEnd = kit.only(L, l => l === FILE_END, 'the end of the palette-file rows');
/* Eight elements carry this exact savebar line; the one that matters is the
   one holding the Colours panel's Close button. */
const foot = kit.near(L, FOOT, 1, 'id="clclose"', 'the close bar');
if (!(restOpen < fileEnd && fileEnd < foot))
  throw new Error('the panel is not in the order this expects');

const fileBlock = L.slice(restOpen + 1, fileEnd + 1);
const ruleStart = fileEnd + 1;
if (L[ruleStart] !== '      <div class="rule"></div>')
  throw new Error('the recolour block does not start where this expects');
if (L[foot - 1] !== '      </div>')
  throw new Error('the recolour block does not end where this expects');
const toolBlock = L.slice(ruleStart, foot);
if (!toolBlock.some(l => l.indexOf('id="rcclean"') >= 0))
  throw new Error('the recolour block is not the recolour block');
if (!fileBlock.some(l => l.indexOf('id="pioimport"') >= 0))
  throw new Error('the palette-file block is not the palette-file block');

/* Bottom up: removing the later one leaves the earlier indexes alone. */
kit.replace(L, { start: ruleStart, end: foot - 1 }, []);
kit.replace(L, { start: restOpen + 1, end: fileEnd }, []);

/* ---- and put them where they belong -------------------------------- */
{
  /* The right column first, because it is the later of the two - inserting
     there cannot move the left column's closing tag. */
  const rightOpen = kit.only(L, l => l === RIGHT_OPEN, 'the palette column');
  let end = -1;
  for (let i = rightOpen + 1; i < L.length; i++) if (L[i] === '      </div>') { end = i; break; }
  if (end < 0) throw new Error('the palette column does not close');
  kit.replace(L, { start: end, end: end - 1 }, [
    '      <!-- UNDER THE PALETTE, because loading and writing a palette file',
    '           is about the palette. It was in a full-width block below both',
    '           columns, which is what kept the panel 25px too tall on a',
    '           900-high window. -->',
  ].concat(fileBlock));
}
{
  const leftOpen = kit.only(L, l => l === LEFT_OPEN, 'the trait colours column');
  let end = -1;
  for (let i = leftOpen + 1; i < L.length; i++) if (L[i] === '      </div>') { end = i; break; }
  if (end < 0) throw new Error('the trait colours column does not close');
  kit.replace(L, { start: end, end: end - 1 }, [
    '      <!-- UNDER THE TRAIT\'S OWN COLOURS, because that is what Replace,',
    '           Erase and Clean up act on - these are the buttons for the',
    '           swatches directly above them. -->',
  ].concat(toolBlock));
}

const bytes = kit.save(doc, ({ text }) => {
  /* EACH TOOL IS INSIDE THE COLUMN IT ACTS ON. */
  const left = text.indexOf('class="clleft"');
  const right = text.indexOf('class="clright"');
  const rest = text.indexOf('class="clrest"');
  const pal = text.indexOf('id="pal"');
  const proj = text.indexOf('id="projpal"');
  const clean = text.indexOf('id="rcclean"');
  const imp = text.indexOf('id="pioimport"');
  const close = text.indexOf('id="clclose"');
  for (const [n, v] of [['clleft', left], ['clright', right], ['clrest', rest],
    ['pal', pal], ['projpal', proj], ['rcclean', clean], ['pioimport', imp], ['clclose', close]])
    if (v < 0) throw new Error('lost track of ' + n);
  if (!(left < pal && pal < clean && clean < right))
    throw new Error('the recolour tools are not under the trait colours');
  if (!(right < proj && proj < imp && imp < rest))
    throw new Error('the palette file rows are not under the palette');
  if (!(rest < close))
    throw new Error('the close bar is not last');

  /* AND EACH ONE ONLY ONCE - a move that copied instead of moving would leave
     two Import buttons wired to one handler. */
  for (const id of ['rcclean', 'pioimport', 'pioexport', 'palsnap', 'rcgo',
    'piofile', 'piopal', 'pionote', 'rctol', 'rcnear', 'rcerase', 'rcnone'])
    if ((text.match(new RegExp('id="' + id + '"', 'g')) || []).length !== 1)
      throw new Error('id ' + id + ' is not in exactly one place any more');

  /* THE BLOCKS CAME OVER WHOLE. */
  if (text.indexOf('Clean up colours') < 0) throw new Error('the clean-up button is gone');
  if (text.indexOf('id="palsnapnote"') < 0) throw new Error('the snap note is gone');
  if ((text.match(/<div class="rule"><\/div>/g) || []).length < 1)
    throw new Error('the divider went missing');

  /* AND THE COLUMNS ARE STILL THE COLUMNS. */
  if (!/#clscrim \.clleft\{grid-column:1;\}/.test(text)
    || !/#clscrim \.clright\{grid-column:2;\}/.test(text))
    throw new Error('the two columns stopped being placed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
