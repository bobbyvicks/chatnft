/* THE COLOUR BOX: ONE PALETTE, TWO BUTTONS ON THE MOUSE.

   Four things, and the first one is not the button that was reported.

   SEVEN TOGGLES LIGHT UP NOTHING. "Include near shades" was called glitchy,
   and it is - but not on its own. Every .btn with aria-pressed in this editor
   has no pressed style at all: gsnap, rcnear, oltidy, olpatch, rslock, rssnap,
   baseoutline. Seven controls you press with no way to tell whether they are
   on. .tool, .chips and .mini all have the rule; .btn was simply missed, and
   whoever reported one of them had found all seven.

   THE MODE GOES AWAY. Draw and Replace were two chips deciding what a click on
   a swatch meant, which is a mode to remember for a thing the mouse can say
   by itself: LEFT picks the colours you are changing, RIGHT picks the colour
   you are changing them to. There is already a pencil button for drawing, so
   a mode saying "clicks draw now" was carrying its weight twice.

   Left click still sets the drawing colour, because "this colour" is one
   thought and splitting it into two gestures would be the mode again wearing
   a different hat. Clicking a colour marks it AND paints with it; clicking it
   again unmarks it, which is the only way to fix a misclick.

   NEAR SHADES GETS ITS NUMBER BACK. The button was full width with the
   tolerance on a labelled row of its own below it - two rows and a label for
   one idea. One row now: the toggle, then the number it governs.
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

/* ---- 1. every toggle lights up ------------------------------------------ */
swap(block([
  '.sw[aria-pressed="true"]{outline:2px solid var(--accent); outline-offset:1px;}',
]), block([
  '.sw[aria-pressed="true"]{outline:2px solid var(--accent); outline-offset:1px;}',
  '/* SEVEN CONTROLS THAT LIT UP NOTHING. .tool, .chips and .mini all had a',
  '   pressed rule; .btn never did, so gsnap, rcnear, oltidy, olpatch, rslock,',
  '   rssnap and baseoutline all toggled an attribute and changed nothing you',
  '   could see. One of them was reported as glitchy; it was all of them.',
  '',
  '   BOTH SELECTORS, and the second is the one that works. .btn[aria-pressed]',
  '   is one class and one attribute; .btn.ghost is two classes. They tie on',
  '   specificity and .ghost is declared later, so it won and every ghost',
  '   toggle still lit up nothing - the fix looked done and was not. */',
  '.btn[aria-pressed="true"],',
  '.btn.ghost[aria-pressed="true"]{background:var(--accent-soft);',
  '  border-color:var(--accent); color:var(--accent);}',
  '/* The colour everything picked is being changed TO. Its own attribute, like',
  '   the source mark, so nothing can sweep it off. */',
  '.sw[data-to="1"]{box-shadow:0 0 0 2px var(--good) inset, 0 0 0 1px #0008;}',
  '.rcrow{display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:4px 0;}',
  '.rcrow input[type=number]{width:64px;}',
]));

/* ---- 2. the mode chips go ----------------------------------------------- */
swap(block([
  '      <!-- What a click on a swatch DOES. The palette used to be drawn twice,',
  '           once here and once in Recolour, because the two interactions differ:',
  '           drawing takes one colour, replacing takes several. One grid and a',
  '           labelled mode costs one click in the recolour flow and gives back',
  '           about 243px of sidebar. Both states stay visible in both modes. -->',
  '      <div class="chips" id="palmode" role="group" aria-label="What clicking a colour does">',
  '        <button type="button" data-v="draw" aria-pressed="true"',
  '          title="Click a colour to draw with it">Draw</button>',
  '        <button type="button" data-v="replace" aria-pressed="false"',
  '          title="Click colours to mark them for replacing - pick as many as you like">Replace</button>',
  '      </div>',
  '      <div class="swatches" id="pal"></div>',
]), block([
  '      <!-- One palette, and the mouse says what a click means. The Draw and',
  '           Replace chips were a mode to remember for something two buttons',
  '           already distinguish, and the pencil tool was saying "draw" as',
  '           well. LEFT picks the colours you are changing - and paints with',
  '           the last one, because "this colour" is one thought. RIGHT picks',
  '           the colour you are changing them to. -->',
  '      <p class="note" id="palhow">Left-click a colour to use it and mark it.',
  '        Right-click one to set what it changes to.</p>',
  '      <div class="swatches" id="pal"></div>',
]));

/* ---- 3. near shades, with its number beside it -------------------------- */
swap(block([
  '        <p class="note" id="rcfrom">Set the palette to Replace, then pick colours.</p>',
  '        <button class="btn ghost" id="rcnear" aria-pressed="false"',
  '          style="width:auto;padding:6px 10px;font-size:12px"',
  '          title="Also replace shades within the distance below">Include near shades</button>',
  '        <div class="olrow"><label for="rctol">How close</label>',
  '          <input id="rctol" type="number" min="1" max="120" value="24" style="width:72px"></div>',
]), block([
  '        <p class="note" id="rcfrom">Left-click colours to change, right-click what to change them to.</p>',
  '        <!-- One row for one idea. The toggle was full width with its own',
  '             labelled row underneath holding the number it governs, which is',
  '             two rows and a label to say "near shades, this close". -->',
  '        <div class="rcrow">',
  '          <button class="btn ghost" id="rcnear" aria-pressed="false"',
  '            style="width:auto;padding:6px 10px;font-size:12px"',
  '            title="Also replace shades within this distance of the ones you picked">Near shades</button>',
  '          <input id="rctol" type="number" min="1" max="120" value="24"',
  '            aria-label="How close a shade has to be to count as near"',
  '            title="How close a shade has to be to count as near">',
  '        </div>',
]));

/* ---- 4. left picks, right targets --------------------------------------- */
swap(block([
  '    if(rcPick.has(h)) b.dataset.rc="1";',
  '    b.onclick=()=>{',
  '      if(chipVal("palmode")==="replace"){',
  '        /* Toggle. Clicking a chosen swatch again takes it out, which is the only',
  '           way to correct a misclick without starting the selection over. */',
  '        if(rcPick.has(h)) rcPick.delete(h); else rcPick.add(h);',
  '        rcSummary();',
  '      } else { setColor(h); selectTool("pencil"); }',
  '    };',
]), block([
  '    if(rcPick.has(h)) b.dataset.rc="1";',
  '    if(rcTo===h) b.dataset.to="1";',
  '    /* LEFT: this colour. It becomes the one you paint with AND one of the',
  '       ones being changed, because those are the same thought and splitting',
  '       them was the mode this replaces. Clicking it again takes it out,',
  '       which is the only way to fix a misclick without starting over. */',
  '    b.onclick=()=>{',
  '      if(rcPick.has(h)) rcPick.delete(h); else rcPick.add(h);',
  '      setColor(h);',
  '      rcSummary();',
  '    };',
  '    /* RIGHT: what they become. The browser menu is suppressed here and only',
  '       here, so right-clicking anywhere else in the editor is untouched. */',
  '    b.oncontextmenu=(e)=>{',
  '      e.preventDefault();',
  '      rcTo = (rcTo===h) ? null : h;',
  '      rcSummary();',
  '      return false;',
  '    };',
]));

/* ---- 5. the target, and what the line says ------------------------------ */
swap(block([
  'const rcPick=new Set();',
]), block([
  'const rcPick=new Set();',
  '/* The colour the picked ones become, chosen with the right button. Null',
  '   means nobody has said, and the colour being painted with is the sensible',
  '   answer - which is what this did before there was a way to say. */',
  'let rcTo=null;',
]));

swap(block([
  '  const to=hx2(color);',
]), block([
  '  const to=hx2(rcTo||color);',
]));

swap(block([
  '  document.querySelectorAll("#pal .sw").forEach(s=>{',
  '    if(rcPick.has(s.dataset.hex)) s.dataset.rc="1"; else delete s.dataset.rc;',
  '  });',
]), block([
  '  document.querySelectorAll("#pal .sw").forEach(s=>{',
  '    if(rcPick.has(s.dataset.hex)) s.dataset.rc="1"; else delete s.dataset.rc;',
  '    if(rcTo&&s.dataset.hex===rcTo) s.dataset.to="1"; else delete s.dataset.to;',
  '  });',
]));

swap(block([
  '  if(!n){ $("rcfrom").textContent = chipVal("palmode")==="replace"',
  '    ? "Pick colours in the palette to replace"',
  '    : "Set the palette to Replace, then pick colours"; return; }',
]), block([
  '  if(!n){ $("rcfrom").textContent =',
  '    "Left-click colours to change, right-click what to change them to."; return; }',
]));

swap(block([
  '  $("rcfrom").textContent=what+" picked";',
]), block([
  '  /* AND WHAT THEY BECOME, when somebody has said. Naming the target is the',
  '     half the old line could not say, because there was no way to choose one',
  '     - it silently used whatever was being painted with. */',
  '  $("rcfrom").textContent=what+" \\u2192 "+(rcTo||color)',
  '    +(rcTo?"":" (the colour you are painting with)");',
]));

/* ---- 6. the chip loop stops naming a group that is gone ----------------- */
swap(block([
  'for(const id of ["rsmode","tstatus","palmode"]){',
]), block([
  'for(const id of ["rsmode","tstatus"]){',
]));

swap(block([
  '  if(g) g.onclick=e=>{ const b=e.target.closest("button[data-v]"); if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); if(id==="palmode") rcSummary(); } };',
]), block([
  '  if(g) g.onclick=e=>{ const b=e.target.closest("button[data-v]"); if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); } };',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* THE MODE IS GONE, EVERYWHERE. A leftover chipVal("palmode") returns
   undefined and quietly takes the else branch, which is the old behaviour
   wearing the new code's clothes. */
if (code.indexOf('palmode') >= 0)
  throw new Error('something still asks for the palette mode');
const markup = text.slice(0, text.indexOf('<script'));
if (markup.indexOf('palmode') >= 0)
  throw new Error('the mode chips are still in the markup');

/* BOTH BUTTONS DO SOMETHING, AND THE RIGHT ONE ONLY HERE. Suppressing the
   context menu across the editor would take away a browser affordance nobody
   asked to lose. */
const bStart = code.indexOf('function buildPalette(list){');
const bEnd = code.indexOf(NL + 'function setColor(h){', bStart);
if (bStart < 0 || bEnd < 0) throw new Error('could not bound buildPalette');
const build = code.slice(bStart, bEnd);
if (build.indexOf('b.onclick=()=>{') < 0) throw new Error('left click does nothing');
if (build.indexOf('b.oncontextmenu=(e)=>{') < 0) throw new Error('right click does nothing');
if (code.split('oncontextmenu').length !== 2)
  throw new Error('the context menu is suppressed somewhere other than a swatch');

/* THE TARGET IS USED. Setting it and then recolouring to the painting colour
   would look right on screen and be wrong in the pixels. */
if (code.indexOf('const to=hx2(rcTo||color);') < 0)
  throw new Error('the replacement no longer uses the chosen target');

/* AND SEVEN TOGGLES LIGHT UP. */
const css = text.slice(0, text.indexOf('</style>'));
if (css.indexOf('.btn.ghost[aria-pressed="true"]{background:var(--accent-soft);') < 0)
  throw new Error('the pressed style for .btn is gone again');

/* NEAR SHADES KEEPS ITS NUMBER, and they are in one row. */
if (markup.indexOf('<div class="rcrow">') < 0)
  throw new Error('the near-shades row is gone');
const row = markup.slice(markup.indexOf('<div class="rcrow">'),
  markup.indexOf('</div>', markup.indexOf('<div class="rcrow">')));
if (row.indexOf('id="rcnear"') < 0 || row.indexOf('id="rctol"') < 0)
  throw new Error('the toggle and its number are not in the same row');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
