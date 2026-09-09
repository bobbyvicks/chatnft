/* THE COLOUR BUTTON OPENS THE PROJECT'S COLOURS, NOT JUST A WHEEL.

   Asked for and not delivered last time: "instead of just having a colour
   wheel when you click the colour button also put the projects pallete in
   that box". I designed it, ran into a test that forbids hiding a control
   behind a reveal, went back and forth and then built neither thing. That was
   a miss rather than a decision.

   The resolution is the one the other four panels already use. The colour well
   becomes a button that opens a card, and the card holds all of it: any colour
   through the native picker, the project's own palette, and the replace
   controls that act on what you pick from it. That also finishes the other
   half of the same request - "make the replace colour function in the colour
   box with the pallete as well" - because the palette and the buttons that
   act on it are now one place instead of two.

   NOTHING IS DUPLICATED. The palette MOVES; there is still exactly one grid.
   Drawing a second copy in the card was the obvious shortcut and it is the
   thing this file already removed once, for the reason recorded there: two
   grids and one selection is a state that can disagree with itself.

   AND THE BASE LAYER BUTTON GETS THE RIGHT PICTURE. It was asked to be "the
   outline of our character" and it got a generic stack of layers - right
   place, right colour, wrong glyph.
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

/* Lift the palette and everything that acts on it, by bytes. */
function lift(startMark, endMark) {
  const a = text.indexOf(startMark);
  if (a < 0) throw new Error('start not found: ' + startMark.slice(0, 40));
  const b = text.indexOf(endMark, a);
  if (b < 0) throw new Error('end not found: ' + endMark.slice(0, 40));
  const inner = text.slice(a, b + endMark.length);
  text = text.slice(0, a) + text.slice(b + endMark.length);
  return inner;
}

const COLOURS = lift('      <p class="note" id="palhow">',
  '        <button class="btn" id="rcclean">Clean up colours</button>' + NL + '      </div>');

/* ---- 1. the well becomes a button --------------------------------------- */
swap(block([
  '    <div class="cur">',
  '      <input type="color" id="picker" value="#000000" aria-label="Current colour - pick any colour">',
  '      <span class="mono" id="curhex" title="The colour you are painting with">#000000</span>',
  '    </div>',
]), block([
  '    <!-- The colour you are painting with, and the way into every colour this',
  '         project has. The wheel alone was the whole answer here and the',
  '         palette was somewhere else. -->',
  '    <div class="cur">',
  '      <button type="button" id="clbtn" aria-expanded="false"',
  '        title="Colours: this project\'s palette, replacing, and any colour you like"',
  '        aria-label="Colours"></button>',
  '      <span class="mono" id="curhex" title="The colour you are painting with">#000000</span>',
  '    </div>',
]));

swap(block([
  '.cur input[type=color]{width:22px; height:22px; padding:0; border:1px solid #ffffff24;',
  '  border-radius:6px; background:none; cursor:pointer; flex:none;}',
]), block([
  '.cur input[type=color]{width:22px; height:22px; padding:0; border:1px solid #ffffff24;',
  '  border-radius:6px; background:none; cursor:pointer; flex:none;}',
  '/* Same shape as the well it replaces, so the row is unchanged to look at. */',
  '#clbtn{width:22px; height:22px; padding:0; border:1px solid #ffffff24;',
  '  border-radius:6px; cursor:pointer; flex:none; background:#000;}',
  '#clbtn[aria-expanded="true"]{outline:2px solid var(--accent); outline-offset:1px;}',
]));

/* ---- 2. the card that holds all of it ----------------------------------- */
swap(block([
  '<div class="scrim" id="tfscrim" hidden>',
]), block([
  '<!-- Everything about colour in one place: any colour, the project\'s own,',
  '     and what to do with the ones you pick. -->',
  '<div class="scrim" id="clscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="cltitle">',
  '    <h2 id="cltitle">Colours</h2>',
  '    <p class="sub">The colours in this trait, and any colour you like.</p>',
  '    <div class="olrow"><label for="picker">Any colour</label>',
  '      <input type="color" id="picker" value="#000000"',
  '        aria-label="Current colour - pick any colour" style="margin-left:auto; width:54px"></div>',
  COLOURS,
  '    <div class="savebar" style="margin-top:18px">',
  '      <button class="btn ghost" id="clclose" style="flex:1">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="scrim" id="tfscrim" hidden>',
]));

/* ---- 3. wired like the others ------------------------------------------- */
swap('for(const id of ["tf","bl","sv"]){', 'for(const id of ["cl","tf","bl","sv"]){');

swap(block([
  "    match:e=>e.key==='Escape'&&['tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&['cl','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));

swap(block([
  "  {show:'T', desc:'Transform', keys:['t'], run:()=>railPanel('tf',$('tfscrim').hidden)},",
]), block([
  "  {show:'C', desc:'Colours', keys:['c'], run:()=>railPanel('cl',$('clscrim').hidden)},",
  "  {show:'T', desc:'Transform', keys:['t'], run:()=>railPanel('tf',$('tfscrim').hidden)},",
]));

/* The button is in the cur row rather than the rail. It is called clbtn and
   not curbtn for exactly one reason: railPanel and the loop that wires the
   panels both look up <id> + "btn", so a button under any other name is a
   panel with no opener. This draft had it as curbtn, and the checks below
   passed it - they asserted the button EXISTED and never that anything
   reached it. */
swap(block([
  'function railPanel(id,on){',
  '  const s=$(id+"scrim"), b=$(id+"btn");',
]), block([
  'function railPanel(id,on){',
  '  const s=$(id+"scrim"), b=$(id+"btn");',
  '  /* The colours button lives in the current-colour row rather than the rail,',
  '     which changes where it is and nothing about how it behaves. */',
]));

/* ---- 4. the swatch shows what you are painting with --------------------- */
swap(block([
  "  color=h; $('picker').value=h; $('curhex').textContent=h;",
]), block([
  "  color=h; $('picker').value=h; $('curhex').textContent=h;",
  '  /* The button IS the well now, so it has to carry the colour. */',
  "  const cb=$('clbtn'); if(cb) cb.style.background=h;",
]));

/* ---- 5. the base layer button gets the right picture -------------------- */
swap(block([
  '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/>',
]), block([
  '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* ONE PALETTE, IN THE CARD. A second grid drawn in the popover is the shortcut
   this file already removed once: two grids and one selection is a state that
   can disagree with itself. */
for (const id of ['pal', 'picker', 'rcfrom', 'rcnear', 'rctol', 'rcgo', 'rcerase',
  'rcnone', 'rcclean', 'palhow'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error(id + ' is not in the markup exactly once');

const at = markup.indexOf('<div class="scrim" id="clscrim"');
const end = markup.indexOf('<div class="scrim" id="tfscrim"');
if (at < 0 || end < 0 || end < at) throw new Error('could not bound the colours card');
const card = markup.slice(at, end);
for (const id of ['picker', 'pal', 'rcgo', 'rcnear', 'rcclean'])
  if (card.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the colours card');

/* AND THE SIDEBAR NO LONGER HOLDS THEM. */
const side = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));
for (const id of ['pal', 'rcgo', 'picker'])
  if (side.indexOf('id="' + id + '"') >= 0)
    throw new Error(id + ' is still in the sidebar');

/* THE BUTTON OPENS IT, AND SHOWS THE COLOUR. A swatch that never changes is
   a button that looks broken every time you pick a colour. */
if (markup.split('id="clbtn"').length !== 2)
  throw new Error('the colour button is not in the row exactly once');
/* AND SOMETHING OPENS IT. The name is load-bearing, so it is asserted from
   the side that consumes it rather than the side that declares it. */
if (code.indexOf('for(const id of ["cl","tf","bl","sv"]){') < 0)
  throw new Error('the colours panel is not in the loop that wires openers');
if (code.indexOf('const s=$(id+"scrim"), b=$(id+"btn");') < 0)
  throw new Error('railPanel stopped looking up <id>btn - clbtn may be misnamed now');
if (code.indexOf("const cb=$('clbtn'); if(cb) cb.style.background=h;") < 0)
  throw new Error('the colour button does not follow the colour');

/* AND THE BASE LAYER ICON IS A FIGURE, not a stack of layers. */
const bl = markup.slice(markup.indexOf('id="blbtn"'), markup.indexOf('id="blbtn"') + 260);
if (bl.indexOf('<circle cx="12" cy="8" r="4"/>') < 0)
  throw new Error('the base layer button is not the character outline');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
