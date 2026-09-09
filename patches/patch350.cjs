/* THREE MORE SECTIONS MOVE TO THE TOOL RAIL, AND AGENT LEAVES THE EDITOR.

   Same shape as the outline: a button in the rail, the panel it always had,
   nothing about what any control DOES rewritten. The sections are lifted
   whole rather than retyped, so a control cannot be dropped or altered on the
   way across - the patch finds each section, takes its contents, and puts
   exactly those bytes in the panel.

     TRANSFORM   the four flip and turn buttons at the top, then the sizing
                 controls under them. Moving is the tool now, but Fit to grid,
                 the multiples and Pixel size are all still wanted and losing
                 them to a tidy-up would be a feature removed by accident.
     BASE LAYER  the character underneath, for checking a trait sits right.
     SAVE        name, layer, status, Save to project, the downloads, Reset,
                 Save and close.

   AND THE AGENT SECTION IS NOT PART OF EDITING A PNG. It belongs to an agent
   pass - what is loaded, hold-to-compare, the step log, the spec and placement
   checks - and sitting in the column while somebody edits an ordinary image is
   four controls about a job they are not doing. It shows when a trait was
   opened through the agent route and stays out of the way otherwise.
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

/* Lifts a whole section out and hands back its contents. Bytes, not a retype:
   a control cannot be dropped or altered on the way across. */
function lift(heading) {
  const head = '    <section>' + NL + '      <h2>' + heading + '</h2>' + NL;
  const at = text.indexOf(head);
  if (at < 0) throw new Error('no section headed ' + heading);
  if (text.indexOf(head, at + 1) >= 0) throw new Error('two sections headed ' + heading);
  const close = NL + '    </section>';
  const end = text.indexOf(close, at);
  if (end < 0) throw new Error('the ' + heading + ' section does not close');
  const inner = text.slice(at + head.length, end);
  if (inner.indexOf('<section') >= 0)
    throw new Error(heading + ' holds another section; lifting it would take that too');
  text = text.slice(0, at) + text.slice(end + close.length + NL.length);
  return inner;
}

const PANELS = [
  { h: 'Transform', id: 'tf', key: 'T',
    sub: 'Flip and turn at the top. Below them, sizing - including Fit to grid '
       + 'and the pixel size the art is drawn at. Moving is the tool itself.',
    icon: '<path d="M4 8h16M4 16h16"/><path d="m8 4-4 4 4 4M16 12l4 4-4 4"/>' },
  { h: 'Base layer', id: 'bl', key: 'L',
    sub: 'The character underneath, for checking a trait sits where it should. '
       + 'It is never part of the artwork.',
    icon: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/>' },
  { h: 'Save and export', id: 'sv', key: 'S',
    sub: 'Name it, put it on a layer, save it to the project or download it.',
    icon: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4M8 20v-6h8v6"/>' },
];

/* ---- 1. each section becomes a panel ------------------------------------ */
for (const p of PANELS) {
  const inner = lift(p.h);
  swap(block(['<div class="scrim" id="olscrim" hidden>']), block([
    '<div class="scrim" id="' + p.id + 'scrim" hidden>',
    '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="' + p.id + 'title">',
    '    <h2 id="' + p.id + 'title">' + p.h + '</h2>',
    '    <p class="sub">' + p.sub + '</p>',
    inner,
    '    <div class="savebar" style="margin-top:18px">',
    '      <button class="btn ghost" id="' + p.id + 'close" style="flex:1">Close</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '',
    '<div class="scrim" id="olscrim" hidden>',
  ]));
}

/* ---- 2. buttons in the rail, under the outline -------------------------- */
swap(block([
  '    <button class="tool" id="olbtn" aria-expanded="false" title="Outline (O)"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M8.5 8.5h7v7h-7z"/></svg><span class="k">O</span></button>',
]), block([
  '    <button class="tool" id="olbtn" aria-expanded="false" title="Outline (O)"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M8.5 8.5h7v7h-7z"/></svg><span class="k">O</span></button>',
].concat(PANELS.map(p =>
  '    <button class="tool" id="' + p.id + 'btn" aria-expanded="false" title="'
  + p.h + ' (' + p.key + ')"><svg viewBox="0 0 24 24">' + p.icon
  + '</svg><span class="k">' + p.key + '</span></button>'))));

/* ---- 3. one opener, three panels ---------------------------------------- */
swap(block([
  "$('olbtn').onclick=()=>outlinePanel($('olscrim').hidden);",
]), block([
  "$('olbtn').onclick=()=>outlinePanel($('olscrim').hidden);",
  '/* The same shape again, three times, from one place - a fourth panel that',
  '   behaved slightly differently would be a bug nobody could see coming. */',
  'function railPanel(id,on){',
  '  const s=$(id+"scrim"), b=$(id+"btn");',
  '  if(!s||!b) return;',
  '  s.hidden=!on;',
  '  b.setAttribute("aria-expanded",String(!!on));',
  '  /* The transform panel reads the canvas, so its numbers have to be current',
  '     the moment it opens rather than after the first keystroke. */',
  '  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
  '}',
  'for(const id of ["tf","bl","sv"]){',
  '  const b=$(id+"btn"), c=$(id+"close"), s=$(id+"scrim");',
  '  if(b) b.onclick=()=>railPanel(id,s.hidden);',
  '  if(c) c.onclick=()=>railPanel(id,false);',
  '  if(s) s.onclick=e=>{ if(e.target===s) railPanel(id,false); };',
  '}',
]));

swap(block([
  "  {show:'O', desc:'Outline', keys:['o'], run:()=>outlinePanel($('olscrim').hidden)},",
]), block([
  "  {show:'O', desc:'Outline', keys:['o'], run:()=>outlinePanel($('olscrim').hidden)},",
  "  {show:'T', desc:'Transform', keys:['t'], run:()=>railPanel('tf',$('tfscrim').hidden)},",
  "  {show:'L', desc:'Base layer', keys:['l'], run:()=>railPanel('bl',$('blscrim').hidden)},",
  "  {show:'S', desc:'Save and export', keys:['s'], run:()=>railPanel('sv',$('svscrim').hidden)},",
  "  {show:'Esc', desc:'Close a panel', prevent:true,",
  "    match:e=>e.key==='Escape'&&['tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));

/* ---- 4. Agent is not part of editing a PNG ------------------------------ */
swap(block([
  '    <section>',
  '      <h2>Agent</h2>',
]), block([
  '    <!-- Hidden unless a trait was opened through the agent route. Editing an',
  '         ordinary PNG is not an agent pass, and four controls about a job',
  '         nobody is doing is what a sidebar fills up with. -->',
  '    <section id="agentsec" hidden>',
  '      <h2>Agent</h2>',
]));

swap(block([
  'async function linkOpen(how){',
  '  if(!LINKED||!LINKED.file) throw Error("Nothing is linked.");',
]), block([
  '/* An agent pass has started. Set here rather than guessed at, because the',
  '   panel appearing on its own would be the thing this flag exists to stop. */',
  'function agentMode(on){',
  '  AGENT_ON=!!on;',
  '  const s=$("agentsec"); if(s) s.hidden=!AGENT_ON;',
  '}',
  'async function linkOpen(how){',
  '  if(!LINKED||!LINKED.file) throw Error("Nothing is linked.");',
  '  agentMode(true);',
]));

swap(block([
  'let AGENT_LOG=[];',
]), block([
  'let AGENT_LOG=[];',
  '/* Off until something says otherwise. */',
  'let AGENT_ON=false;',
]));

swap(block([
  'PB.openLinked=function(how){ return linkOpen(how); };',
]), block([
  'PB.openLinked=function(how){ return linkOpen(how); };',
  '/* Anything reaching for the agent surface is an agent pass. */',
  'PB.workspace=function(on){ agentMode(on!==false); return AGENT_ON; };',
]));

swap(block([
  'PB.spec=function(){ return agentSpec(); };',
]), block([
  'PB.spec=function(){ agentMode(true); return agentSpec(); };',
]));

swap(block([
  'PB.placement=function(){ return agentPlacement(); };',
]), block([
  'PB.placement=function(){ agentMode(true); return agentPlacement(); };',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* EVERY CONTROL CAME ACROSS, EXACTLY ONCE. A block that ended up in both
   places would give two elements the same id, and getElementById answers with
   whichever is first while the other sits there doing nothing. */
const MOVED = {
  tf: ['fliph', 'flipv', 'rotl', 'rotr', 'rsw', 'rsh', 'rslock', 'rsmode',
    'rspreset', 'rsgrid', 'rssnap', 'rsgo', 'rsfit', 'rsnow', 'blksize', 'blktidy'],
  bl: ['basepick', 'basedrop', 'baseop', 'baseoplab', 'basefile', 'baseoutline'],
  sv: ['tname', 'tlayer', 'tstatus', 'saveproj', 'dlNative', 'dlBig', 'dlTrim',
    'reset', 'saveclose', 'closeed'],
};
for (const [id, ids] of Object.entries(MOVED)) {
  const at = markup.indexOf('<div class="scrim" id="' + id + 'scrim"');
  if (at < 0) throw new Error('no panel for ' + id);
  const end = markup.indexOf('<div class="scrim"', at + 10);
  const panel = markup.slice(at, end > 0 ? end : markup.length);
  for (const c of ids) {
    if (markup.split('id="' + c + '"').length !== 2)
      throw new Error(c + ' is not in the markup exactly once');
    if (panel.indexOf('id="' + c + '"') < 0)
      throw new Error(c + ' did not make it into the ' + id + ' panel');
  }
}

/* AND THE SIDEBAR NO LONGER CARRIES THEM. */
const side = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));
for (const c of ['fliph', 'rsgo', 'basepick', 'saveproj', 'oladd'])
  if (side.indexOf('id="' + c + '"') >= 0)
    throw new Error(c + ' is still in the sidebar');

/* THE BUTTONS ARE IN THE RAIL, AND NONE OF THEM IS A DRAWING TOOL - making
   one would turn the pencil off every time a panel was opened. */
for (const p of ['tfbtn', 'blbtn', 'svbtn'])
  if (markup.split('id="' + p + '"').length !== 2)
    throw new Error(p + ' is not in the rail exactly once');
if (/id="(tf|bl|sv)btn"[^>]*data-tool/.test(markup))
  throw new Error('a panel button became a drawing tool');

/* AGENT IS OFF UNTIL SOMETHING TURNS IT ON. */
if (markup.indexOf('<section id="agentsec" hidden>') < 0)
  throw new Error('the agent section is not hidden by default');
if (code.indexOf('function agentMode(on){') < 0)
  throw new Error('nothing can turn the agent workspace on');
if (code.indexOf('  agentMode(true);') < 0)
  throw new Error('the agent route no longer turns it on');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
