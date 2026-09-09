/* THE SIDE PANEL GOES, AND THE CANVAS TAKES ITS 244 PIXELS.

   Asked for plainly: "Im trying to get rid of the panel thats to the right of
   all the buttons so we have more editing room." Six sections have already
   left it for pop-outs beside the rail. What is left is the current colour,
   the brush size with its snap toggle, and the fill spread - three controls
   you look at WHILE you draw, which is why they were never panel material and
   why a 244px column to hold them is the wrong shape.

   They become a strip under the header instead. A strip costs the artwork
   about 34px of height; the column cost it 244px of width, and width is what
   a 1280 trait is short of.

   THE CSS IS RENAMED, NOT REWRITTEN. Forty rules are scoped to .side, and the
   first draft of this patch converted fifteen of them by hand and declared
   itself done - the check for a surviving .side rule is what caught that. So
   the stylesheet is renamed wholesale, .side to .opts, and then the rules that
   were about a COLUMN rather than about the controls in it are deleted
   explicitly: the grid area and widths, the section headings and their fold
   chevrons, the wide-screen multi-column widths, and the phone bottom sheet
   with its drag handle. What is left is control sizing, which is what those
   rules were always for.

   WHAT GOES WITH IT, because it existed only to manage a column:

   - fitPanel and PANEL_COL/GAP/MAX_COLS. It widened the panel to two, three
     or four 250px columns on big screens so the space beside a square stage
     was not wasted. There is no panel to widen; the stage has the space.
   - foldDefaults and setupFolds. Folding existed because the column buried
     its own tail - 2,780px of panel in a 1,185px window. A strip cannot.
   - sideDown, its drag handle and SIDE_KEY. The phone bottom sheet, and the
     stored preference for whether it was down.

   None of that is left dead. A guard that can never run reads to the next
   person as a guard that might, and every one of these would have gone on
   looking load-bearing.

   THE AGENT SECTION MOVES RATHER THAN GOES. It is hidden until a trait is
   opened through the agent route, and it stays that way - as a rail panel
   whose button appears with it. That also finishes "Remove agent from the
   regular png edit landing page": nothing about it is on screen unless an
   agent pass is what you are doing.
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
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* Cut a bounded region out. Both markers are asserted and the size is capped,
   because the cheapest way for a marker to be wrong is to match somewhere far
   later and take half the file with it. */
function drop(startMark, endMark, what, cap) {
  const a = text.indexOf(startMark);
  if (a < 0) throw new Error('could not find the start of ' + what);
  const b = text.indexOf(endMark, a);
  if (b < 0) throw new Error('could not find the end of ' + what);
  const stop = b + endMark.length;
  const gone = stop - a;
  if (gone < 20) throw new Error(what + ': the markers met too soon (' + gone + ' bytes)');
  if (gone > (cap || 4200)) throw new Error(what + ' slice is ' + gone + ' bytes - too much');
  text = text.slice(0, a) + text.slice(stop);
  return gone;
}

function cut(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error('start not found: ' + startMark.slice(0, 46));
  const b = src.indexOf(endMark, a);
  if (b < 0) throw new Error('end not found: ' + endMark.slice(0, 46));
  return src.slice(a, b + endMark.length);
}

/* ---- 0. take the column apart ------------------------------------------- */
const A = text.indexOf('  <aside class="side" id="sidepanel">');
const B = text.indexOf('  </aside>');
if (A < 0 || B < 0 || B < A) throw new Error('could not bound the side panel');
const ASIDE = text.slice(A, B + '  </aside>'.length);

const CUR = cut(ASIDE, '<div class="cur">', '#000000</span>' + NL + '    </div>');
const BRUSH = cut(ASIDE, '<div id="brushrows">', '>Snap</button></div>' + NL + '      </div>');
const FILL = cut(ASIDE, '<div id="fillrows" hidden>', 'style="width:72px"></div>' + NL + '      </div>');
const AGENT = cut(ASIDE, '<section id="agentsec" hidden>', '</section>');

/* Every id the column held is either carried across or deliberately deleted
   with it, and that is decided here rather than discovered later. */
const CARRIED = ['clbtn', 'curhex', 'brushrows', 'bslider', 'bslab', 'gsnap',
  'fillrows', 'filltol', 'agentsec', 'agwork', 'agspec', 'agplace', 'agplaceout',
  'agspecout', 'agbefore', 'aglog'];
for (const id of CARRIED)
  if ((CUR + BRUSH + FILL + AGENT).indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' was in the column and is in none of the pieces taken out of it');

/* ---- 1. the strip, where the column was --------------------------------- */
text = text.slice(0, A) + [
  '  <!-- THE CONTROLS YOU LOOK AT WHILE YOU DRAW, in a strip rather than a',
  '       column. Everything you go and USE is a pop-out on the rail now; what',
  '       is left here has to be in front of you the whole time, and three',
  '       controls do not need 244 pixels of width taken off the artwork. -->',
  '  <div class="opts" id="optsbar">',
  '    ' + CUR,
  '    ' + BRUSH,
  '    ' + FILL,
  '  </div>',
].join(NL) + text.slice(B + '  </aside>'.length);

/* ---- 2. the agent panel ------------------------------------------------- */
swap('    <button class="tool" id="qabtn" aria-expanded="false" title="Pixel inspection (Q)">',
  block([
    '    <!-- Appears with the section it opens, which is to say only once a',
    '         trait has been opened through the agent route. -->',
    '    <button class="tool" id="agbtn" aria-expanded="false" title="Agent pass" hidden><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4"/><circle cx="9" cy="13" r="1.4"/><circle cx="15" cy="13" r="1.4"/></svg></button>',
    '    <button class="tool" id="qabtn" aria-expanded="false" title="Pixel inspection (Q)">',
  ]));

swap('<div class="scrim pop" id="qascrim" hidden>', block([
  '<!-- The agent pass, in a panel rather than a section nobody outside an',
  '     agent pass ever wanted on screen. -->',
  '<div class="scrim pop" id="agscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="agtitle">',
  '    <h2 id="agtitle">Agent pass</h2>',
  '    <p class="sub">What is open, what the rules say about it, and every step that changed pixels.</p>',
  AGENT.replace('<section id="agentsec" hidden>', '<div id="agentsec">')
    .replace(/<\/section>$/, '</div>'),
  '    <div class="savebar" style="margin-top:16px">',
  '      <button class="btn ghost" id="agclose" style="flex:1">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="scrim pop" id="qascrim" hidden>',
]));

swap('for(const id of ["cl","tx","eh","qa","tf","bl","sv"]){', 'for(const id of ["cl","tx","eh","qa","ag","tf","bl","sv"]){');
swap('  for(const id of ["ol","cl","tx","eh","qa","tf","bl","sv"]){', '  for(const id of ["ol","cl","tx","eh","qa","ag","tf","bl","sv"]){');
swap(block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','qa','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','qa','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','qa','ag','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','qa','ag','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));

swap(block([
  'function agentMode(on){',
  '  AGENT_ON=!!on;',
  '  const s=$("agentsec"); if(s) s.hidden=!AGENT_ON;',
  '}',
]), block([
  'function agentMode(on){',
  '  AGENT_ON=!!on;',
  '  /* The BUTTON now, because the section moved into the panel it opens.',
  '     Hiding the button while leaving the panel open would strand a card',
  '     with no way back to it, so the panel closes with the pass. */',
  '  const b=$("agbtn"); if(b) b.hidden=!AGENT_ON;',
  '  if(!AGENT_ON){ try{ railPanel("ag",false); }catch(_){ } }',
  '}',
]));

/* ---- 3. the layout ------------------------------------------------------ */
swap(block([
  '.app{display:grid; grid-template-columns:auto auto 1fr; grid-template-rows:auto 1fr auto;',
  '  /* tools, then the panel, then the canvas. The panel used to be on the far',
  '     side with the canvas between them, which put the controls in two places',
  '     with the artwork in the middle. */',
  '  grid-template-areas:"head head head" "tools side stage" "foot foot foot"; height:100dvh;}',
]), block([
  '.app{display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto 1fr auto;',
  '  /* The rail, then the canvas, and nothing across from it. The 244px column',
  '     that used to sit between them is a strip under the header now, because',
  '     what it still held is looked at rather than gone to. */',
  '  grid-template-areas:"head head" "opts opts" "tools stage" "foot foot"; height:100dvh;}',
]));

swap(block([
  '  .app{grid-template-columns:1fr; grid-template-rows:auto auto minmax(0,1fr) auto auto;',
  '    grid-template-areas:"head" "tools" "stage" "foot" "side";}',
]), block([
  '  .app{grid-template-columns:1fr; grid-template-rows:auto auto auto minmax(0,1fr) auto;',
  '    grid-template-areas:"head" "tools" "opts" "stage" "foot";}',
]));

/* ---- 4. the stylesheet, renamed then pruned ----------------------------- */
/* THE RENAME FIRST. Every one of these rules exists to size a control, and
   the controls moved together; converting them one at a time is how fifteen
   of forty got done and the other twenty-five fell through to the browser's
   own sizes. */
const styleEnd = text.indexOf('</style>');
if (styleEnd < 0) throw new Error('no stylesheet');
const cssWas = text.slice(0, styleEnd);
const renamed = cssWas.split('.side').join('.opts');
if (renamed === cssWas) throw new Error('nothing was renamed - has .side already gone?');
text = renamed + text.slice(styleEnd);

/* THEN THE PRUNE. What is left of the column: its box, its headings and their
   folding, the wide-screen widths, and the phone sheet with its handle. None
   of it means anything for a strip. */
swap(block([
  '.opts{grid-area:side; width:244px; padding:10px; border-right:1px solid var(--line); overflow-x:hidden;',
  '  background:var(--panel); overflow-y:auto; display:flex; flex-direction:column; gap:8px;}',
]), block([
  '/* One line of controls, wrapping to a second if it must. Height rather than',
  '   width, because a 1280 trait is short of width and has height to spare. */',
  '.opts{grid-area:opts; display:flex; align-items:center; flex-wrap:wrap; gap:8px 18px;',
  '  padding:5px 12px; background:var(--panel); border-bottom:1px solid var(--line);}',
  '.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}',
  '.opts .olrow{margin:0; gap:6px; line-height:1.3;}',
  '/* Wide enough to aim with. In the column it filled whatever was left over,',
  '   and in a row that would push everything after it off the end. */',
  '.opts .olrow input[type=range]{flex:none; width:150px; margin:0;}',
  '.opts .olrow input[type=range]+.mono{flex:none; min-width:44px; text-align:right;}',
]));

drop('/* The handle is a phone thing. On a wide screen the panel is a column beside',
  '.opts h2:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:4px;}' + NL,
  'the headings, their folding and the desktop grip', 1400);

drop('/* 252px held about half of the panel at a time - 2,318px of content in a',
  '@media (min-width:1100px){ .opts{width:286px;} }' + NL,
  'the wide-screen width', 700);

drop('  .opts{width:500px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr));',
  'align-content:start;}' + NL, 'the two-column width', 900);

drop('  .opts{width:auto; max-height:44dvh; border-right:none; border-top:1px solid var(--line);',
  '  .opts{padding-bottom:calc(14px + env(safe-area-inset-bottom,0px));}' + NL,
  'the phone sheet and its handle', 1600);

swap('  .opts h2{line-height:1.5;}' + NL, '');

/* ---- 5. and the machinery that only existed for a column ---------------- */
drop('/* The collapse is a phone thing and the CSS for it lives in the phone media',
  'sideDown(w,false);' + NL + '  });' + NL + '})();' + NL, 'the side sheet');
drop('/* Drag the handle down and the tools get out of the way; drag it up, or just',
  'const SIDE_KEY="chatnft.sidedown";' + NL, 'SIDE_KEY');
/* fitPanel's comment is 1,690 bytes and every paragraph of it is about
   fitPanel - it READS fitZoom to justify itself rather than explaining
   fitZoom - so the whole thing goes with the function. */
drop('/* Give the panel the width the artwork cannot use.',
  '  return cols;' + NL + '}' + NL, 'fitPanel');
/* And its call site inside fitZoom, with the two lines of comment that
   exist only to say why the call is where it is. */
drop('  /* BEFORE measuring the stage. The panel is about to change width, and a zoom',
  '  fitPanel();' + NL, 'the fitPanel call');
/* Folding, both halves in one region: setupFolds follows foldDefaults with
   nothing between them. The end marker CONSUMES the closing braces rather
   than keeping them - they look like they belong to what follows and they are
   setupFolds's own, so keeping them left two orphaned closers and the file
   stopped parsing. new Function() caught that before anything was written,
   which is the whole reason the write comes last. */
drop('/* Fold all but the first two, when the panel does not fit and the user has',
  '  });' + NL + '}' + NL, 'folding', 5700);
drop('  /* Here, not at boot: the panel has to be laid out before its height means',
  '  foldDefaults();' + NL, 'the foldDefaults call');
/* A swap, not a drop: the same string cannot be both markers, and handing
   drop() a zero-width region is how a cut silently removes nothing. */
swap("$('rctol').disabled=true;" + NL + 'setupFolds();' + NL,
  "$('rctol').disabled=true;" + NL);

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));
const css = text.slice(0, text.indexOf('</style>'));

/* THE COLUMN IS GONE, AND SO IS EVERY NAME THAT REACHED FOR IT. A survivor is
   not untidiness: sideDown called setAttribute on the grip with no null
   guard, so one of these left behind throws on load. */
if (markup.indexOf('<aside') >= 0) throw new Error('the side panel is still in the markup');
for (const gone of ['sidepanel', 'sidegrip', 'brushsec'])
  if (text.indexOf(gone) >= 0) throw new Error(gone + ' survives somewhere in the file');
for (const gone of ['sideDown', 'SIDE_KEY', 'phoneLayout', 'fitPanel', 'PANEL_COL',
  'PANEL_GAP', 'PANEL_MAX_COLS', 'foldDefaults', 'setupFolds'])
  if (code.indexOf(gone) >= 0) throw new Error(gone + ' is still referenced in the script');
if (css.indexOf('.side') >= 0) throw new Error('a .side rule survives and can never match');
if (css.indexOf('.grip') >= 0) throw new Error('the drag handle still has styling and no element');
for (const gone of ['grid-area:side', 'section.folded', '.opts h2'])
  if (css.indexOf(gone) >= 0) throw new Error('a column-only rule survives: ' + gone);

/* AND EVERY CONTROL IT HELD IS SOMEWHERE, EXACTLY ONCE. */
for (const id of CARRIED)
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error(id + ' is not in the markup exactly once');
const bar = markup.slice(markup.indexOf('<div class="opts" id="optsbar">'),
  markup.indexOf('id="filltol"') + 400);
for (const id of ['clbtn', 'curhex', 'bslider', 'bslab', 'gsnap', 'filltol'])
  if (bar.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the strip');
const card = markup.slice(markup.indexOf('<div class="scrim pop" id="agscrim"'),
  markup.indexOf('<div class="scrim pop" id="qascrim"'));
for (const id of ['agentsec', 'agwork', 'agspec', 'agplace', 'agbefore', 'aglog'])
  if (card.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the agent panel');

/* THE STAGE HAS THE WIDTH NOW. */
if (css.indexOf('grid-template-areas:"head head" "opts opts" "tools stage" "foot foot"') < 0)
  throw new Error('the everyday layout still has a column for the panel');
if (css.indexOf('grid-template-areas:"head" "tools" "opts" "stage" "foot"') < 0)
  throw new Error('the phone layout still has a row for the panel');
/* AND THE CONTROL SIZING CAME WITH THE CONTROLS. If the rename had missed
   these, every field in the strip and in every panel would be at the
   browser's own size - the defect patch351 already fixed once. */
for (const kept of ['.opts .btn,.card .btn{padding:4px 10px',
  '.opts select,.opts input[type=number]', '.opts .olrow input[type=range]{flex:none'])
  if (css.indexOf(kept) < 0) throw new Error('the rename lost: ' + kept);

/* AND THE AGENT PANEL ONLY EXISTS DURING A PASS. */
if (code.indexOf('const b=$("agbtn"); if(b) b.hidden=!AGENT_ON;') < 0)
  throw new Error('the agent button does not follow the pass');
if (code.indexOf('if(!AGENT_ON){ try{ railPanel("ag",false); }catch(_){ } }') < 0)
  throw new Error('ending a pass would strand the panel open');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length
  + ' (' + (text.length - before.length) + ')');
