/* THE OUTLINE MOVES TO THE TOOL RAIL.

   It was six controls and a note living in the middle of "Edges and holes",
   which is where you looked for Clear background and Fill holes and then had
   to scroll past a thickness slider, a colour well, a snap menu and two
   toggles to reach anything else. Outlining is a thing you DO, like the
   pencil and the eyedropper, and it now sits with them: a button under the
   eyedropper that opens the panel it always had.

   NOTHING ABOUT WHAT IT DOES CHANGES. The same thickness, the same colour and
   match-brush, the same snap, the same Tidy edge and Close gaps first, the
   same Add outline, and the same note that warns when a coloured outline one
   cell thick will come out black because the collection's border rule owns
   that ring. All of it moves; none of it is rewritten.

   AND THERE IS NO AUTOMATIC OUTLINE ON THE ARTWORK. outlinePreview draws the
   overlay canvas and writes the note; it does not touch a pixel. The only
   thing that outlines by itself is blackenEdge, the collection's black border
   on save and export, which is a deliberate rule with its own reasoning and is
   left exactly as it is.
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

/* The block as it stands, lifted whole so nothing is retyped. */
const OUTLINE = block([
  '      <div class="stack">',
  '        <div class="olrow"><label for="olthick">Thickness</label>',
  '          <input id="olthick" type="range" min="0" max="6" step="1" value="1" aria-label="Outline thickness">',
  '          <span class="mono" id="olthicklab">1 cell</span></div>',
  '        <div class="olrow"><label for="olcol">Colour</label>',
  '          <input type="color" id="olcol" value="#000000" aria-label="Outline colour"',
  '            style="margin-left:auto; width:54px">',
  '          <button class="mini" id="olcurrent" title="Use the colour you are painting with">match brush</button></div>',
  '        <div class="olrow"><label for="olsnap">Snap to</label>',
  '          <select id="olsnap" aria-label="Snap grid">',
  '            <option value="auto">auto</option><option value="1" selected>1 cell</option>',
  '            <option value="2">2 cells</option><option value="3">3 cells</option>',
  '            <option value="4">4 cells</option><option value="6">6 cells</option>',
  '            <option value="8">8 cells</option></select></div>',
  '        <div class="olrow">',
  '          <button class="btn ghost" id="oltidy" aria-pressed="true"',
  '            style="width:auto;padding:6px 10px;font-size:12px"',
  '            title="Square off the silhouette before outlining">Tidy edge</button>',
  '          <button class="btn ghost" id="olpatch" aria-pressed="false"',
  '            style="width:auto;padding:6px 10px;font-size:12px"',
  '            title="Close gaps inside the art before drawing the outline round it">Close gaps first</button></div>',
  '        <button class="btn" id="oladd">Add outline</button>',
  '      </div>',
  '      <p class="note" id="olnote"></p>',
]);

if (text.split(OUTLINE).length !== 2)
  throw new Error('the outline block is not in the sidebar in the shape expected');

/* ---- 1. out of the sidebar ---------------------------------------------- */
swap(block([
  '      <div class="rule"></div>',
  OUTLINE,
  '    </section>',
]), block([
  '      <!-- The outline moved to the tool rail: it is a thing you DO, like the',
  '           pencil and the eyedropper, and it was six controls and a note in the',
  '           middle of the section you came to for Clear background. -->',
  '    </section>',
]));

/* ---- 2. into a panel of its own ----------------------------------------- */
swap(block([
  '<div class="app" id="app" hidden>',
]), block([
  '<!-- The same controls, in the panel the rail button opens. Lifted whole:',
  '     nothing about what any of them does is changed. -->',
  '<div class="scrim" id="olscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="oltitle">',
  '    <h2 id="oltitle">Outline</h2>',
  '    <p class="sub">Draws a border around the artwork. The collection\'s own',
  '      black border is applied on save and export whatever you set here.</p>',
  OUTLINE,
  '    <div class="savebar" style="margin-top:18px">',
  '      <button class="btn ghost" id="olclose" style="flex:1">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="app" id="app" hidden>',
]));

/* ---- 3. a button under the eyedropper ----------------------------------- */
swap(block([
  '    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)"><svg viewBox="0 0 24 24"><path d="m4 20 1-4 9-9 3 3-9 9-4 1Z"/><path d="m15 5 2-2a2 2 0 0 1 3 3l-2 2"/></svg><span class="k">I</span></button>',
]), block([
  '    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)"><svg viewBox="0 0 24 24"><path d="m4 20 1-4 9-9 3 3-9 9-4 1Z"/><path d="m15 5 2-2a2 2 0 0 1 3 3l-2 2"/></svg><span class="k">I</span></button>',
  '    <!-- Not a data-tool: it opens a panel rather than changing what a drag',
  '         does, and putting it in the tool set would make the pencil appear to',
  '         turn off when you opened it. -->',
  '    <button class="tool" id="olbtn" aria-expanded="false" title="Outline (O)"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M8.5 8.5h7v7h-7z"/></svg><span class="k">O</span></button>',
]));

/* ---- 4. opened, closed, and on a key ------------------------------------ */
swap(block([
  "$('keysbtn').onclick=()=>keysPanel($('ksscrim').hidden);",
]), block([
  "$('keysbtn').onclick=()=>keysPanel($('ksscrim').hidden);",
  '/* The same shape as the shortcuts panel: a scrim, a card, Escape, and a',
  '   click on the surround. Following it rather than inventing a second way',
  '   for a panel to behave. */',
  'function outlinePanel(on){',
  "  $('olscrim').hidden=!on;",
  "  $('olbtn').setAttribute('aria-expanded',String(!!on));",
  '  /* The preview is what the panel is for: it has to be current the moment',
  '     it opens, not after the first slider move. */',
  '  if(on){ try{ outlinePreview(); }catch(_){ } $(\'oladd\').focus(); }',
  '}',
  "$('olbtn').onclick=()=>outlinePanel($('olscrim').hidden);",
  "$('olclose').onclick=()=>outlinePanel(false);",
  "$('olscrim').onclick=e=>{ if(e.target===$('olscrim')) outlinePanel(false); };",
]));

swap(block([
  "  {show:'I', desc:'Eyedropper', keys:['i'], run:()=>selectTool('pick')},",
]), block([
  "  {show:'I', desc:'Eyedropper', keys:['i'], run:()=>selectTool('pick')},",
  "  {show:'O', desc:'Outline', keys:['o'], run:()=>outlinePanel($('olscrim').hidden)},",
  "  {show:'Esc', desc:'Close the outline panel', prevent:true,",
  "    match:e=>e.key==='Escape'&&!$('olscrim').hidden, run:()=>outlinePanel(false)},",
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* EVERY CONTROL MOVED, AND EXACTLY ONCE. A block that ended up in both places
   would give two elements the same id, and getElementById would answer with
   whichever came first while the other sat there doing nothing. */
for (const id of ['olthick', 'olthicklab', 'olcol', 'olcurrent', 'olsnap',
  'oltidy', 'olpatch', 'oladd', 'olnote'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('outline control not in the markup exactly once: ' + id);

/* AND THEY ARE IN THE PANEL, not left behind in the sidebar. */
const panelAt = markup.indexOf('<div class="scrim" id="olscrim"');
const panelEnd = markup.indexOf('<div class="app" id="app"', panelAt);
if (panelAt < 0 || panelEnd < 0) throw new Error('could not bound the outline panel');
const panel = markup.slice(panelAt, panelEnd);
for (const id of ['olthick', 'olcol', 'olsnap', 'oltidy', 'olpatch', 'oladd', 'olnote'])
  if (panel.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the panel');

/* THE BUTTON IS UNDER THE EYEDROPPER, and is not a drawing tool - making it
   one would turn the pencil off every time somebody opened the panel. */
const rail = markup.slice(markup.indexOf('data-tool="pencil"'), markup.indexOf('id="undo"'));
if (rail.indexOf('id="olbtn"') < rail.indexOf('data-tool="pick"'))
  throw new Error('the outline button is not below the eyedropper');
if (/id="olbtn"[^>]*data-tool/.test(markup))
  throw new Error('the outline button became a drawing tool');

/* IT OPENS, CLOSES AND HAS A KEY. */
for (const s of ['function outlinePanel(on){', "$('olbtn').onclick=",
  "$('olclose').onclick=", "keys:['o']"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* AND NOTHING OUTLINES BY ITSELF. outlinePreview draws the overlay and the
   note; if it ever writes to the artwork it stops being a preview. */
const pStart = code.indexOf('function outlinePreview(){');
const pEnd = code.indexOf(NL + 'function ', pStart + 10);
const preview = code.slice(pStart, pEnd > 0 ? pEnd : pStart + 2000);
if (preview.indexOf('ctx.putImageData') >= 0)
  throw new Error('the outline preview is writing to the artwork');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
