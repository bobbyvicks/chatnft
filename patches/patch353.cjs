/* A PANEL THAT COVERS THE ARTWORK IS NOT A PANEL, IT IS A DOOR.

   Transform, Base layer, Save and Outline were built on .scrim, which is the
   analysis dialog's shape: fixed, inset 0, a blurred black sheet over the
   whole window. That is right for "answer this and come back" and wrong for
   all four of these, because every one of them is something you do TO the art
   while looking at it. Resizing behind a sheet is typing a number, pressing a
   button, closing the panel, and only then finding out.

   The reason it was built that way was reuse, and the reuse was the mistake:
   they were given the shape of the nearest existing thing rather than the
   shape of what they do.

   So they become pop-outs beside the button that opens them, with the canvas
   still on screen. Below 820 - the width where the side column already gives
   up and the phone rules take over - there is no room beside a rail, so they
   go back to being a sheet. The gate and the analysis dialog keep the sheet
   at every width; those really are "answer this first".
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

/* ---- 1. the four panels say what they are ------------------------------- */
const POPS = ['ol', 'cl', 'tf', 'bl', 'sv'];
for (const id of POPS)
  swap('<div class="scrim" id="' + id + 'scrim" hidden>',
    '<div class="scrim pop" id="' + id + 'scrim" hidden>');

/* ---- 2. and look like it -------------------------------------------------
   Only the tokens change. Everything inside the card - the density rules, the
   phone restore, the field sizing - is untouched and keeps working, because
   it is scoped to .card and .card is still there. */
swap(block([
  '.card h2{font-size:17px; margin-bottom:3px;}',
]), block([
  '/* A POP-OUT, NOT A SHEET. It sits beside the button that opened it with',
  '   the artwork still visible; popAt() writes the left and top. The wrapper',
  '   takes no pointer events at all, so a click meant for the canvas reaches',
  '   the canvas - the card takes them back for itself. */',
  '.scrim.pop{inset:auto; background:none; backdrop-filter:none; padding:0;',
  '  display:block; pointer-events:none;}',
  '.scrim.pop>.card{width:min(340px,92vw); max-height:min(78dvh,640px);',
  '  pointer-events:auto; box-shadow:0 22px 54px #000000a8;}',
  '.card h2{font-size:17px; margin-bottom:3px;}',
]));

/* The phone block. Anchored on the rule it opens with rather than on the
   comment further down it, which is in the same block but not at its top -
   the first draft of this patch assumed adjacency and found zero. */
swap(block([
  '@media (max-width:820px){',
  '  .app{grid-template-columns:1fr; grid-template-rows:auto auto minmax(0,1fr) auto auto;',
]), block([
  '@media (max-width:820px){',
  '  /* No room beside a rail that is most of the width, so a pop-out goes',
  '     back to being a sheet. !important because popAt writes left and top',
  '     inline, and an inline value outranks a stylesheet one. */',
  '  .scrim.pop{inset:0!important; left:0!important; top:0!important;',
  '    right:0; bottom:0; background:#0b0910e0; backdrop-filter:blur(3px);',
  '    display:grid; place-items:center; padding:16px; pointer-events:auto;}',
  '  .scrim.pop>.card{width:min(560px,94vw); max-height:90dvh;}',
  '  .app{grid-template-columns:1fr; grid-template-rows:auto auto minmax(0,1fr) auto auto;',
]));

/* ---- 3. placed beside the button --------------------------------------- */
swap(block([
  'function outlinePanel(on){',
]), block([
  '/* Beside the button, and inside the window. The height is measured after',
  '   the panel is shown, because a hidden element has none - which is why',
  '   every caller sets hidden BEFORE calling this. */',
  'function popAt(id){',
  '  const s=$(id+"scrim"), b=$(id+"btn");',
  '  if(!s||!b) return;',
  '  if(innerWidth<=820){ s.style.left=""; s.style.top=""; return; }',
  '  const r=b.getBoundingClientRect(), c=s.firstElementChild;',
  '  s.style.left=Math.round(r.right+12)+"px";',
  '  s.style.top="8px";',
  '  const h=c?c.getBoundingClientRect().height:0;',
  '  s.style.top=Math.round(Math.max(8,Math.min(r.top,innerHeight-h-8)))+"px";',
  '}',
  '/* Clicking away closes it. The dark surround used to be the thing you',
  '   clicked, and a pop-out has no surround, so the document does it instead.',
  '   Capture, so a control that stops the event on its way up cannot strand',
  '   a panel open. */',
  'addEventListener("pointerdown",e=>{',
  '  for(const id of ["ol","cl","tf","bl","sv"]){',
  '    const s=$(id+"scrim"); if(!s||s.hidden) continue;',
  '    const b=$(id+"btn");',
  '    if(s.contains(e.target)||(b&&b.contains(e.target))) continue;',
  '    if(id==="ol") outlinePanel(false); else railPanel(id,false);',
  '  }',
  '},true);',
  'function outlinePanel(on){',
]));

swap("  if(on){ try{ outlinePreview(); }catch(_){ } $('oladd').focus(); }",
  "  if(on){ popAt('ol'); try{ outlinePreview(); }catch(_){ } $('oladd').focus(); }");

swap('  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
  block([
    '  if(on) popAt(id);',
    '  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
  ]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));
const css = text.slice(0, text.indexOf('</style>'));

/* EVERY PANEL, AND ONLY THE PANELS. The gate and the analysis dialog are
   still sheets on purpose; if one of them picked up .pop it would stop being
   the thing you have to answer. */
for (const id of POPS)
  if (markup.indexOf('<div class="scrim pop" id="' + id + 'scrim" hidden>') < 0)
    throw new Error(id + ' is not a pop-out');
for (const id of ['signin', 'pxscrim', 'ksscrim'])
  if (markup.indexOf('class="scrim pop" id="' + id + '"') >= 0)
    throw new Error(id + ' must stay a sheet');

/* AND IT IS PLACED. A pop-out with inset:auto and no left or top sits
   wherever static layout drops it, which on this page is off the bottom. */
if (code.indexOf('function popAt(id)') < 0) throw new Error('popAt is gone');
for (const call of ["popAt('ol')", 'popAt(id)'])
  if (code.indexOf(call) < 0) throw new Error('nothing calls ' + call);

/* AND IT CLOSES. Without the surround there is no other way out but Escape
   and the button, and a panel you cannot dismiss by looking away is worse
   than the sheet it replaced. */
if (code.indexOf('addEventListener("pointerdown"') < 0)
  throw new Error('clicking away no longer closes a panel');

/* THE CANVAS IS REACHABLE THROUGH THE GAP. This is the whole point: the
   wrapper still covers the window, so if it took pointer events the art
   would be untouchable while any panel was open. */
if (css.indexOf('.scrim.pop{inset:auto') < 0 || css.indexOf('pointer-events:none;}') < 0)
  throw new Error('the pop-out wrapper still swallows clicks');
if (css.indexOf('.scrim.pop>.card{width:min(340px,92vw)') < 0)
  throw new Error('the card is still sized like a dialog');
if (css.indexOf('.scrim.pop{inset:0!important') < 0)
  throw new Error('a phone has no room beside the rail and lost its sheet');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
