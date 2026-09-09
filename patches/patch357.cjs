/* PIXEL INSPECTION LEAVES THE COLUMN TOO.

   Next step in clearing the side panel. Same move as the five before it, and
   the same reason it qualifies: scanning is something you run, read and then
   stop doing. It is twenty-one controls of workflow - a grid choice, a scan,
   a findings list you page through, a protected-region editor and a report
   download - none of which you want in front of you while you draw.

   Lifted whole, by bytes. Not one control is rewritten, added or dropped,
   and every handler keeps its element because the elements are the same
   elements.

   AFTER THIS THE COLUMN HOLDS ONE VISIBLE SECTION - the brush size, the snap
   toggle and the fill spread. Those are the opposite kind of control: you
   look at them while you draw, so they are not panel material and they are
   deliberately not moved here. Where they end up is the next question, and
   it is a layout question rather than another lift.
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

function lift(startMark, endMark) {
  const a = text.indexOf(startMark);
  if (a < 0) throw new Error('start not found: ' + startMark.slice(0, 40));
  const b = text.indexOf(endMark, a);
  if (b < 0) throw new Error('end not found: ' + endMark.slice(0, 40));
  const inner = text.slice(a, b + endMark.length);
  text = text.slice(0, a) + text.slice(b + endMark.length);
  return inner;
}

const SECTION = lift('    <section>' + NL + '      <h2>Pixel inspection</h2>',
  '    </section>');
const inner = SECTION
  .replace('    <section>' + NL + '      <h2>Pixel inspection</h2>' + NL, '')
  .replace(new RegExp('\\r\\n    </section>$'), '');

/* ---- 1. the button ------------------------------------------------------ */
swap('    <button class="tool" id="ehbtn" aria-expanded="false" title="Edges and holes (D)">',
  block([
    '    <button class="tool" id="qabtn" aria-expanded="false" title="Pixel inspection (Q)"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/><path d="M8.5 10.5h4M10.5 8.5v4"/></svg><span class="k">Q</span></button>',
    '    <button class="tool" id="ehbtn" aria-expanded="false" title="Edges and holes (D)">',
  ]));

/* ---- 2. the panel ------------------------------------------------------- */
swap('<div class="scrim pop" id="ehscrim" hidden>', block([
  '<!-- The same controls, in the panel the rail button opens. Lifted whole:',
  '     nothing about what any of them does is changed. -->',
  '<div class="scrim pop" id="qascrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="qatitle">',
  '    <h2 id="qatitle">Pixel inspection</h2>',
  '    <p class="sub">Measure the canvas, walk the findings, repair what you choose to.</p>',
  inner,
  '    <div class="savebar" style="margin-top:16px">',
  '      <button class="btn ghost" id="qaclose" style="flex:1">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="scrim pop" id="ehscrim" hidden>',
]));

/* ---- 3. wired like every other panel ------------------------------------ */
swap('for(const id of ["cl","tx","eh","tf","bl","sv"]){', 'for(const id of ["cl","tx","eh","qa","tf","bl","sv"]){');
swap('  for(const id of ["ol","cl","tx","eh","tf","bl","sv"]){', '  for(const id of ["ol","cl","tx","eh","qa","tf","bl","sv"]){');
swap(block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','qa','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','qa','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));
swap("  {show:'D', desc:'Edges and holes', keys:['d'], run:()=>railPanel('eh',$('ehscrim').hidden)},",
  block([
    "  {show:'D', desc:'Edges and holes', keys:['d'], run:()=>railPanel('eh',$('ehscrim').hidden)},",
    "  {show:'Q', desc:'Pixel inspection', keys:['q'], run:()=>railPanel('qa',$('qascrim').hidden)},",
  ]));

/* The scan reads the canvas, which can have changed while the panel was shut,
   and the overlay it draws has to agree with what is on screen. */
swap(block([
  '  if(on&&id==="tx"){ try{ textBuild(); }catch(_){ } }',
]), block([
  '  if(on&&id==="tx"){ try{ textBuild(); }catch(_){ } }',
  '  if(on&&id==="qa"){ try{ qaInvalidate(); }catch(_){ } }',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

const IDS = ['qacell', 'qamark', 'qascan', 'qastatus', 'qafilter', 'qahi', 'qaprev',
  'qanext', 'qadetail', 'qalist', 'qapick', 'qaclear', 'qaapply', 'qarx', 'qary',
  'qarw', 'qarh', 'qaadd', 'qarects', 'qareport'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error(id + ' is not in the markup exactly once');

const at = markup.indexOf('<div class="scrim pop" id="qascrim"');
const end = markup.indexOf('<div class="scrim pop" id="ehscrim"');
if (at < 0 || end < 0 || end < at) throw new Error('could not bound the inspection card');
const card = markup.slice(at, end);
for (const id of IDS)
  if (card.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the panel');

/* AND THE COLUMN IS DOWN TO THE CONTROLS YOU LOOK AT WHILE YOU DRAW. */
const side = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));
for (const id of IDS)
  if (side.indexOf('id="' + id + '"') >= 0)
    throw new Error(id + ' is still in the side column');
if (side.indexOf('Pixel inspection') >= 0)
  throw new Error('the section heading is still in the column');
/* Two sections left, and one of them is the agent block that stays hidden
   unless a trait was opened through the agent route. */
const sections = side.split('<section').length - 1;
if (sections !== 2)
  throw new Error('expected 2 sections left in the column, found ' + sections);
for (const id of ['bslider', 'gsnap', 'filltol'])
  if (side.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' should still be in the column - it is looked at while drawing');

/* AND SOMETHING OPENS IT. */
if (code.indexOf('for(const id of ["cl","tx","eh","qa","tf","bl","sv"]){') < 0)
  throw new Error('the panel is not in the loop that wires openers');
if (markup.split('id="qabtn"').length !== 2)
  throw new Error('the rail has no button for it');
if (code.indexOf("keys:['q'], run:()=>railPanel('qa'") < 0)
  throw new Error('the panel has no key');
if (code.indexOf("['cl','tx','eh','qa','tf','bl','sv'].forEach(i=>railPanel(i,false))") < 0)
  throw new Error('Escape does not close it');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
