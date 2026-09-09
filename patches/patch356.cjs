/* EDGES AND HOLES LEAVES THE COLUMN.

   Next step in clearing the side panel so the canvas gets the room. Same
   move as Transform, Base layer, Save and Colours before it: the section
   becomes a pop-out beside a rail button, lifted whole - not one control is
   rewritten, added or dropped, and every handler keeps its element because
   the elements are the same elements.

   It earns a rail button on the same test the others passed: it is a thing
   you DO to the artwork, in a burst, and then stop doing. Clear background
   and Fill holes are two presses at the start of a trait and never again.
   That is a panel, not a column you look at while you draw.

   The icon is a filled square with a bite out of one edge and a hole in the
   middle - the two things the panel deals with, which is the only reason to
   draw a picture rather than write a word.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* Lifted by bytes rather than rebuilt, so nothing can be dropped or reworded
   on the way across. */
function lift(startMark, endMark) {
  const a = text.indexOf(startMark);
  if (a < 0) throw new Error('start not found: ' + startMark.slice(0, 40));
  const b = text.indexOf(endMark, a);
  if (b < 0) throw new Error('end not found: ' + endMark.slice(0, 40));
  const inner = text.slice(a, b + endMark.length);
  text = text.slice(0, a) + text.slice(b + endMark.length);
  return inner;
}

const SECTION = lift('    <section>' + NL + '      <h2>Edges and holes</h2>',
  '    </section>');

/* Everything between the heading and the closing tag, which is the section's
   controls and the comments that explain them. */
const inner = SECTION
  .replace('    <section>' + NL + '      <h2>Edges and holes</h2>' + NL, '')
  .replace(new RegExp('\\r\\n    </section>$'), '');

/* ---- 1. the button, beside the outline it belongs with ------------------ */
swap('    <button class="tool" id="txbtn" aria-expanded="false" title="Text (A)">',
  block([
    '    <button class="tool" id="ehbtn" aria-expanded="false" title="Edges and holes (D)"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M4 9h4v6H4z" fill="currentColor" stroke="none" opacity=".01"/><circle cx="14" cy="13" r="2.5"/><path d="M4 9v6"/></svg><span class="k">D</span></button>',
    '    <button class="tool" id="txbtn" aria-expanded="false" title="Text (A)">',
  ]));

/* ---- 2. the panel ------------------------------------------------------- */
swap('<div class="scrim pop" id="txscrim" hidden>', block([
  '<!-- The same controls, in the panel the rail button opens. Lifted whole:',
  '     nothing about what any of them does is changed. -->',
  '<div class="scrim pop" id="ehscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="ehtitle">',
  '    <h2 id="ehtitle">Edges and holes</h2>',
  '    <p class="sub">Take away what surrounds the trait, and close what it surrounds.</p>',
  inner,
  '    <div class="savebar" style="margin-top:16px">',
  '      <button class="btn ghost" id="ehclose" style="flex:1">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="scrim pop" id="txscrim" hidden>',
]));

/* ---- 3. wired like every other panel ------------------------------------ */
swap('for(const id of ["cl","tx","tf","bl","sv"]){', 'for(const id of ["cl","tx","eh","tf","bl","sv"]){');
swap('  for(const id of ["ol","cl","tx","tf","bl","sv"]){', '  for(const id of ["ol","cl","tx","eh","tf","bl","sv"]){');
swap(block([
  "    match:e=>e.key==='Escape'&&['cl','tx','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));
swap("  {show:'A', desc:'Text', keys:['a'], run:()=>railPanel('tx',$('txscrim').hidden)},",
  block([
    "  {show:'A', desc:'Text', keys:['a'], run:()=>railPanel('tx',$('txscrim').hidden)},",
    "  {show:'D', desc:'Edges and holes', keys:['d'], run:()=>railPanel('eh',$('ehscrim').hidden)},",
  ]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* EVERY CONTROL CAME ACROSS, ONCE. A control left behind is a second element
   with the same id, and getElementById answers with whichever comes first
   while the other sits there doing nothing. */
const IDS = ['debg', 'bgtol', 'hidebase', 'fillholes', 'holemax'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error(id + ' is not in the markup exactly once');

const at = markup.indexOf('<div class="scrim pop" id="ehscrim"');
const end = markup.indexOf('<div class="scrim pop" id="txscrim"');
if (at < 0 || end < 0 || end < at) throw new Error('could not bound the edges card');
const card = markup.slice(at, end);
for (const id of IDS)
  if (card.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the panel');

/* AND THE COLUMN NO LONGER HOLDS THEM, NOR THE HEADING THEY SAT UNDER. */
const side = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));
for (const id of IDS)
  if (side.indexOf('id="' + id + '"') >= 0)
    throw new Error(id + ' is still in the side column');
if (side.indexOf('Edges and holes') >= 0)
  throw new Error('the section heading is still in the column');

/* AND SOMETHING OPENS IT - through the same lookup as every other panel. */
if (code.indexOf('for(const id of ["cl","tx","eh","tf","bl","sv"]){') < 0)
  throw new Error('the panel is not in the loop that wires openers');
if (markup.split('id="ehbtn"').length !== 2)
  throw new Error('the rail has no button for it');
if (code.indexOf("keys:['d'], run:()=>railPanel('eh'") < 0)
  throw new Error('the panel has no key');
if (code.indexOf("['cl','tx','eh','tf','bl','sv'].forEach(i=>railPanel(i,false))") < 0)
  throw new Error('Escape does not close it');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
