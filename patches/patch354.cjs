/* THE TEXT TOOL CODEX BUILT, WHICH NEVER REACHED THIS EDITOR.

   Codex wrote a pixel-lettering renderer on the branch
   feat/trait-shelf-organization - commit 7724c06, "feat: refine trait
   generation and text editing". It has five fonts, whole-pixel scaling in
   each axis independently, letter and line spacing, alignment, weight,
   outline, drop shadow, lean, slope and wrap, and a compositor that leaves
   every byte outside the letters identical to the artwork underneath. It
   never landed on main. Its own audit of the newer editor says so plainly:
   "Text tools were omitted from the updated integration, not lost from
   disk."

   THE RENDERER IS THAT FILE, VERBATIM. Not rewritten, not tidied, not
   "adapted" - the bytes of text-overlay-core.js as Codex wrote them, so its
   own 27 tests still describe this code. tools/text-core-check.cjs slices
   the block back out of this page and runs those tests against it, which is
   the only way to claim a port is faithful rather than merely similar.

   What is new is the half the audit said was missing: a panel, a sprite you
   can see over the artwork and drag before anything is committed, and an
   apply that goes through snapshot() so it undoes like any other stroke.
*/
const fs = require('fs');
const { execFileSync } = require('child_process');
const kit = require('./pb-repo/tools/patchkit.cjs');

const REPO = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo';
const FILE = REPO + '/index.html';
const SOURCE = '7724c06:text-overlay-core.js';

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

/* ---- 0. Codex's renderer, out of the commit it was written in ----------- */
const core = execFileSync('git', ['show', SOURCE], { cwd: REPO, encoding: 'utf8' });
if (core.indexOf('globalThis.ChatNftTextOverlay') < 0)
  throw new Error('that is not the text core');
const coreCRLF = core.replace(/\r?\n/g, NL).replace(/\s+$/, '');

/* ---- 1. the renderer goes in whole --------------------------------------
   Before popAt, which is a function declaration and hoisted, so nothing here
   depends on the order. */
swap(block([
  '/* Beside the button, and inside the window. The height is measured after',
]), block([
  '/* CODEX\'S PIXEL TEXT RENDERER, VERBATIM from ' + SOURCE + '.',
  '',
  '   Do not tidy this block. tools/text-core-check.cjs slices from the first',
  '   line below to the globalThis assignment that ends it and runs Codex\'s',
  '   own test file against the slice; the moment it stops being that file,',
  '   those tests stop describing this code and the port becomes a rewrite',
  '   nobody has checked. Everything this page adds is BELOW the assignment. */',
  coreCRLF,
  '',
  '/* Beside the button, and inside the window. The height is measured after',
]));

/* ---- 2. the tool that uses it ------------------------------------------- */
swap(block([
  'function popAt(id){',
]), block([
  '/* ---- the text tool ------------------------------------------------------',
  '',
  '   One pending sprite at a time. It is drawn on its own layer over the art',
  '   and is not in the artwork until Add is pressed, which is what makes the',
  '   position adjustable at all - there is nothing to undo while you move it. */',
  'let textSprite=null, textX=0, textY=0, textDrag=null, textPlaced=false;',
  '',
  'function textOpts(){',
  '  const pw=Math.max(1,+$("txpw").value||1);',
  '  /* Square by default. Independent axes are the interesting half of this',
  '     renderer - a 1x3 pixel makes tall narrow lettering - but a person who',
  '     never touches the second box should not have to keep it in step. */',
  '  const ph=$("txlock").getAttribute("aria-pressed")==="true"?pw:Math.max(1,+$("txph").value||1);',
  '  return {',
  '    pixelWidth:pw, pixelHeight:ph,',
  '    letterSpacing:Math.max(0,+$("txls").value||0),',
  '    lineSpacing:Math.max(0,+$("txlsp").value||0),',
  '    align:chipVal("txalign")||"left",',
  '    bold:Math.max(0,Math.round(+$("txbold").value||0)),',
  '    outlineSize:Math.max(0,Math.round(+$("txol").value||0)),',
  '    outlineColor:hx2($("txolc").value).concat(255),',
  '    shadowEnabled:$("txsh").getAttribute("aria-pressed")==="true",',
  '    shadowOffsetX:Math.round(+$("txshx").value||0),',
  '    shadowOffsetY:Math.round(+$("txshy").value||0),',
  '    shadowColor:hx2($("txshc").value).concat(255),',
  '    lean:+$("txlean").value||0, slope:+$("txslope").value||0,',
  '    wrapX:+$("txwx").value||0, wrapY:+$("txwy").value||0,',
  '    font:$("txfont").value||"classic",',
  '  };',
  '}',
  '/* The renderer throws on anything it will not draw, and those messages are',
  '   better than anything this page would invent - so they are shown rather',
  '   than swallowed, and the sprite goes away so the preview cannot keep',
  '   showing the last thing that worked. */',
  'function textBuild(){',
  '  if(!$("txtext")) return;',
  '  const words=$("txtext").value;',
  '  if(!ctx||!words.replace(/\\s/g,"").length){ textSprite=null; textPlaced=false; textDraw(); textNote(); return; }',
  '  try{ textSprite=renderPixelText(words,hx2(color).concat(255),textOpts()); }',
  '  catch(err){ textSprite=null; textDraw(); $("txnote").textContent=String(err.message||err); return; }',
  '  /* Centred on the FIRST build only. Re-centring on every keystroke would',
  '     take the position back from whoever just dragged it. */',
  '  if(!textPlaced){ textCentre(true); textPlaced=true; }',
  '  textClamp(); textDraw(); textNote();',
  '}',
  'function textClamp(){',
  '  if(!textSprite||!art) return;',
  '  /* One pixel of it has to stay on the canvas, or it is gone with no way',
  '     back to it. */',
  '  textX=Math.max(1-textSprite.width,Math.min(art.width-1,Math.round(textX)));',
  '  textY=Math.max(1-textSprite.height,Math.min(art.height-1,Math.round(textY)));',
  '  $("txx").value=textX; $("txy").value=textY;',
  '}',
  'function textCentre(quiet){',
  '  if(!textSprite||!art) return;',
  '  textX=Math.round((art.width-textSprite.width)/2);',
  '  textY=Math.round((art.height-textSprite.height)/2);',
  '  $("txx").value=textX; $("txy").value=textY;',
  '  if(!quiet){ textDraw(); textNote(); }',
  '}',
  '/* Composited onto an EMPTY buffer, not over a copy of the artwork: the',
  '   canvas underneath is showing the art, so a preview that carried its own',
  '   copy would double every pixel and hide the thing being lettered. */',
  'function textDraw(){',
  '  const pv=$("txpv"); if(!pv) return;',
  '  if(!textSprite||!ctx||$("app").hidden){ pv.style.display="none"; return; }',
  '  const W=art.width, H=art.height;',
  '  pv.width=W; pv.height=H;',
  '  const g=pv.getContext("2d"); g.clearRect(0,0,W,H);',
  '  const im=g.createImageData(W,H);',
  '  im.data.set(applyTextOverlay(new Uint8ClampedArray(W*H*4),W,H,',
  '    textSprite.data,textSprite.width,textSprite.height,textX,textY));',
  '  g.putImageData(im,0,0);',
  '  pv.style.width=(W*zoom)+"px"; pv.style.height=(H*zoom)+"px";',
  '  pv.style.display="block";',
  '}',
  'function textNote(){',
  '  const n=$("txnote"); if(!n) return;',
  '  if(!textSprite){ n.textContent=""; return; }',
  '  let ink=0; const d=textSprite.data;',
  '  for(let i=3;i<d.length;i+=4) if(d[i]) ink++;',
  '  n.textContent=textSprite.width+"\\u00d7"+textSprite.height+", "+ink.toLocaleString()+" pixels of ink";',
  '}',
  '/* The whole box, not just the letters. Grabbing a sprite by its ink means',
  '   missing it in every gap, which reads as a drag that does not work. */',
  'function textHit(x,y){',
  '  return !!textSprite && x>=textX && y>=textY &&',
  '    x<textX+textSprite.width && y<textY+textSprite.height;',
  '}',
  'function textApply(){',
  '  if(!textSprite){ toast("Type something first"); return; }',
  '  snapshot();',
  '  const W=art.width, H=art.height, img=ctx.getImageData(0,0,W,H);',
  '  img.data.set(applyTextOverlay(img.data,W,H,',
  '    textSprite.data,textSprite.width,textSprite.height,textX,textY));',
  '  ctx.putImageData(img,0,0);',
  '  textSprite=null; textPlaced=false; textDraw();',
  '  refreshStats(); repalette();',
  '  toast("Text added");',
  '}',
  'function textClear(){',
  '  textSprite=null; textPlaced=false;',
  '  if($("txtext")) $("txtext").value="";',
  '  textDraw(); textNote();',
  '}',
  '(function(){',
  '  const f=$("txfont"); if(!f) return;',
  '  /* The list comes from the renderer rather than from the markup, so a font',
  '     added there appears here and one removed cannot leave a dead option. */',
  '  for(const it of listPixelFonts()){',
  '    const o=document.createElement("option");',
  '    o.value=it.id; o.textContent=it.name; f.appendChild(o);',
  '  }',
  '  for(const id of ["txtext","txfont","txpw","txph","txls","txlsp","txbold","txol",',
  '                   "txolc","txshx","txshy","txshc","txlean","txslope","txwx","txwy"]){',
  '    const e=$(id); if(e){ e.oninput=textBuild; e.onchange=textBuild; }',
  '  }',
  '  for(const id of ["txlock","txsh"]){',
  '    const b=$(id); if(!b) continue;',
  '    b.onclick=()=>{ b.setAttribute("aria-pressed",',
  '      b.getAttribute("aria-pressed")==="true"?"false":"true"); textBuild(); };',
  '  }',
  '  for(const id of ["txx","txy"]){',
  '    const e=$(id); if(!e) continue;',
  '    e.oninput=()=>{ textX=Math.round(+$("txx").value||0);',
  '      textY=Math.round(+$("txy").value||0); textClamp(); textDraw(); };',
  '  }',
  '  const c=$("txcentre"); if(c) c.onclick=()=>textCentre();',
  '  const a=$("txadd"); if(a) a.onclick=textApply;',
  '  const k=$("txclear"); if(k) k.onclick=textClear;',
  '})();',
  '',
  'function popAt(id){',
]));

/* ---- 3. its own layer over the artwork ---------------------------------- */
swap('<canvas id="cmppv"></canvas>',
  '<canvas id="cmppv"></canvas><canvas id="txpv"></canvas>');

swap(block([
  '#cmppv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:4;',
  '  image-rendering:pixelated;}',
]), block([
  '#cmppv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:4;',
  '  image-rendering:pixelated;}',
  '/* Above the others: text is placed against everything else on screen, so',
  '   nothing may sit on top of it while it is being positioned. */',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
]));

/* ---- 4. the button and the panel ---------------------------------------- */
swap('    <button class="tool" id="tfbtn" aria-expanded="false" title="Transform (T)">',
  block([
    '    <button class="tool" id="txbtn" aria-expanded="false" title="Text (A)"><svg viewBox="0 0 24 24"><path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/></svg><span class="k">A</span></button>',
    '    <button class="tool" id="tfbtn" aria-expanded="false" title="Transform (T)">',
  ]));

swap('<div class="scrim pop" id="tfscrim" hidden>', block([
  '<!-- Lettering. Everything here shapes one sprite that floats over the art',
  '     until Add puts it in, because text you cannot see against the artwork',
  '     is text you place twice. -->',
  '<div class="scrim pop" id="txscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="txtitle">',
  '    <h2 id="txtitle">Text</h2>',
  '    <p class="sub">Pixel lettering in the colour you are painting with. Drag it on the canvas to place it.</p>',
  '    <textarea id="txtext" rows="2" placeholder="Type here" aria-label="The words to draw"></textarea>',
  '    <div class="olrow"><label for="txfont">Font</label>',
  '      <select id="txfont" style="margin-left:auto; max-width:170px"></select></div>',
  '    <div class="olrow"><label for="txpw">Pixel size</label>',
  '      <input type="number" id="txpw" value="2" min="1" max="64" step="1" style="margin-left:auto; width:56px">',
  '      <input type="number" id="txph" value="2" min="1" max="64" step="1" style="width:56px" aria-label="Pixel height">',
  '      <button class="btn" id="txlock" aria-pressed="true" title="Keep the height the same as the width">Square</button></div>',
  '    <div class="olrow"><label for="txls">Gaps</label>',
  '      <input type="number" id="txls" value="1" min="0" max="64" step="1" style="margin-left:auto; width:56px" aria-label="Between letters">',
  '      <input type="number" id="txlsp" value="2" min="0" max="64" step="1" style="width:56px" aria-label="Between lines"></div>',
  '    <div class="olrow"><label>Lines</label>',
  '      <div class="chips" id="txalign" role="group" aria-label="Alignment">',
  '        <button data-v="left" aria-pressed="true">Left</button>',
  '        <button data-v="center" aria-pressed="false">Centre</button>',
  '        <button data-v="right" aria-pressed="false">Right</button></div></div>',
  '    <div class="olrow"><label for="txbold">Weight</label>',
  '      <input type="number" id="txbold" value="0" min="0" max="8" step="1" style="margin-left:auto; width:56px">',
  '      <label for="txol">Outline</label>',
  '      <input type="number" id="txol" value="0" min="0" max="8" step="1" style="width:56px">',
  '      <input type="color" id="txolc" value="#000000" aria-label="Outline colour"></div>',
  '    <div class="olrow"><button class="btn" id="txsh" aria-pressed="false" title="A copy of the letters behind them">Shadow</button>',
  '      <input type="number" id="txshx" value="1" min="-64" max="64" step="1" style="margin-left:auto; width:52px" aria-label="Shadow across">',
  '      <input type="number" id="txshy" value="1" min="-64" max="64" step="1" style="width:52px" aria-label="Shadow down">',
  '      <input type="color" id="txshc" value="#000000" aria-label="Shadow colour"></div>',
  '    <div class="olrow"><label for="txlean">Slant</label>',
  '      <input type="number" id="txlean" value="0" min="-64" max="64" step="1" style="margin-left:auto; width:52px" title="Lean the letters sideways">',
  '      <input type="number" id="txslope" value="0" min="-64" max="64" step="1" style="width:52px" aria-label="Slope down the line">',
  '      <label for="txwx">Bend</label>',
  '      <input type="number" id="txwx" value="0" min="-64" max="64" step="1" style="width:52px">',
  '      <input type="number" id="txwy" value="0" min="-64" max="64" step="1" style="width:52px" aria-label="Bend down"></div>',
  '    <div class="olrow"><label for="txx">Place</label>',
  '      <input type="number" id="txx" value="0" step="1" style="margin-left:auto; width:56px">',
  '      <input type="number" id="txy" value="0" step="1" style="width:56px" aria-label="Down">',
  '      <button class="btn" id="txcentre">Centre it</button></div>',
  '    <p class="note" id="txnote"></p>',
  '    <div class="savebar" style="margin-top:14px">',
  '      <button class="btn" id="txadd" style="flex:1">Add the text</button>',
  '      <button class="btn ghost" id="txclear">Clear</button>',
  '      <button class="btn ghost" id="txclose">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<div class="scrim pop" id="tfscrim" hidden>',
]));

/* A textarea is a field like any other and had no rule at all, so it arrived
   with the browser's own font and border in the middle of a styled card. */
swap(block([
  '.side select,.side input[type=number],.side input[type=text],',
  '.card select,.card input[type=number],.card input[type=text]{',
]), block([
  '.side select,.side input[type=number],.side input[type=text],',
  '.card select,.card input[type=number],.card input[type=text],.card textarea{',
]));

swap(block([
  '.side input[type=color]{appearance:none; -webkit-appearance:none; width:38px; height:24px;',
]), block([
  '/* .card as well, for the same reason the fields below carry it: the colour',
  '   wells in the text and colour panels are not in the side column. */',
  '.side input[type=color],.card input[type=color]{appearance:none; -webkit-appearance:none; width:38px; height:24px;',
]));

swap(block([
  '.card h2{font-size:17px; margin-bottom:3px;}',
]), block([
  '.card textarea{width:100%; resize:vertical; min-height:46px; margin-bottom:9px;',
  '  line-height:1.45; font-size:12.5px;}',
  '.card h2{font-size:17px; margin-bottom:3px;}',
]));

/* ---- 5. wired like every other panel ------------------------------------ */
swap('for(const id of ["cl","tf","bl","sv"]){', 'for(const id of ["cl","tx","tf","bl","sv"]){');
swap('  for(const id of ["ol","cl","tf","bl","sv"]){', '  for(const id of ["ol","cl","tx","tf","bl","sv"]){');
swap(block([
  "    match:e=>e.key==='Escape'&&['cl','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&['cl','tx','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]));
swap("  {show:'T', desc:'Transform', keys:['t'], run:()=>railPanel('tf',$('tfscrim').hidden)},",
  block([
    "  {show:'A', desc:'Text', keys:['a'], run:()=>railPanel('tx',$('txscrim').hidden)},",
    "  {show:'T', desc:'Transform', keys:['t'], run:()=>railPanel('tf',$('tfscrim').hidden)},",
  ]));

swap(block([
  '  if(on) popAt(id);',
  '  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
]), block([
  '  if(on) popAt(id);',
  '  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
  '  /* The sprite follows the paint colour and the canvas size, both of which',
  '     can have changed while the panel was shut. */',
  '  if(on&&id==="tx"){ try{ textBuild(); }catch(_){ } }',
]));

/* The alignment chips join the two groups that already existed, rather than
   growing a third way for a segmented control to behave. */
swap('for(const id of ["rsmode","tstatus"]){',
  'for(const id of ["rsmode","tstatus","txalign"]){');
swap('if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); } };',
  'if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); if(id==="txalign") textBuild(); } };');

/* ---- 5b. and reachable without a mouse ---------------------------------- */
swap(block([
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
]), block([
  '/* Lettering for something with no pointer. It drives the same controls a',
  "   person drives, rather than calling the renderer behind the panel's back:",
  '   an agent that placed text by a private path would leave the panel showing',
  '   something else, and the next human edit would fight it. */',
  'PB.text=function(o){',
  '  o=o||{};',
  '  railPanel("tx",true);',
  '  if(typeof o.text==="string") $("txtext").value=o.text;',
  '  if(o.font) $("txfont").value=o.font;',
  '  if(o.size){ $("txpw").value=o.size; $("txph").value=o.size; }',
  '  if(o.colour) setColor(o.colour);',
  '  if(typeof o.outline==="number") $("txol").value=o.outline;',
  '  if(o.align) setChip("txalign",o.align);',
  '  textBuild();',
  '  if(!textSprite) return {ok:false, why:$("txnote").textContent||"nothing to draw"};',
  '  if(typeof o.x==="number") textX=Math.round(o.x);',
  '  if(typeof o.y==="number") textY=Math.round(o.y);',
  '  textClamp(); textDraw();',
  '  const where={ok:true, x:textX, y:textY, w:textSprite.width, h:textSprite.height};',
  '  /* Placed but not committed unless asked. Seeing it before it lands is',
  '     the point of the sprite, and an agent gets the same choice. */',
  '  if(o.apply) textApply();',
  '  where.applied=!!o.apply;',
  '  return where;',
  '};',
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
]));

/* ---- 6. the colour it is drawn in --------------------------------------- */
swap(block([
  "  const cb=$('clbtn'); if(cb) cb.style.background=h;",
]), block([
  "  const cb=$('clbtn'); if(cb) cb.style.background=h;",
  '  /* Pending lettering is drawn in the paint colour, so changing the colour',
  '     has to redraw it - otherwise the preview shows one colour and Add puts',
  '     down another. */',
  '  try{ if(textSprite) textBuild(); }catch(_){ }',
]));

/* ---- 7. dragged where it belongs ---------------------------------------- */
swap(block([
  'function beginStroke(e){',
  '  const c=cellFrom(e); if(!c) return;',
]), block([
  'function beginStroke(e){',
  '  const c=cellFrom(e); if(!c) return;',
  '  /* PENDING TEXT CATCHES THE PRESS FIRST, whatever the tool is. Nothing is',
  '     committed until Add, so a drag here moves letters and cannot mark the',
  '     artwork - which is why it does not need the tool to be anything, and',
  '     why it takes no snapshot. */',
  '  if(textSprite){',
  '    const tc=rawCell(e);',
  '    if(textHit(tc.x,tc.y)){ textDrag={fx:tc.x,fy:tc.y,x:textX,y:textY}; return; }',
  '  }',
]));

swap(block([
  '  if(moveBuf){',
  '    const rc=rawCell(e);',
]), block([
  '  if(textDrag){',
  '    const rc=rawCell(e);',
  '    textX=textDrag.x+(rc.x-textDrag.fx); textY=textDrag.y+(rc.y-textDrag.fy);',
  '    textClamp(); textDraw();',
  "    $('pos').textContent=textX+', '+textY;",
  '    return;',
  '  }',
  '  if(moveBuf){',
  '    const rc=rawCell(e);',
]));

swap(block([
  '  if(moveBuf&&pts.size===0){',
  '    moveBuf=null;',
]), block([
  '  if(textDrag&&pts.size===0) textDrag=null;',
  '  if(moveBuf&&pts.size===0){',
  '    moveBuf=null;',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));

/* THE RENDERER IS STILL CODEX'S FILE. Not a claim in a comment: the bytes
   between the first function and the export are compared with the commit. */
const a = script.indexOf('function applyTextOverlay(');
const b = script.indexOf('globalThis.ChatNftTextOverlay');
const zEnd = script.indexOf('};', b);
if (a < 0 || b < 0 || zEnd < 0 || b < a) throw new Error('could not bound the ported renderer');
const ported = script.slice(a, zEnd + 2).replace(/\r\n/g, '\n');
const wanted = core.slice(core.indexOf('function applyTextOverlay(')).replace(/\r?\n/g, '\n').replace(/\s+$/, '');
if (ported !== wanted)
  throw new Error('the ported renderer is not byte-identical to ' + SOURCE);

/* EVERY CONTROL EXISTS ONCE, and the panel holds them. A control that never
   made it in is a silent no-op: textOpts reads $("txbold") and an absent one
   gives NaN, which the ||0 turns into a plausible zero. */
const IDS = ['txtext', 'txfont', 'txpw', 'txph', 'txls', 'txlsp', 'txalign', 'txbold',
  'txol', 'txolc', 'txsh', 'txshx', 'txshy', 'txshc', 'txlean', 'txslope', 'txwx',
  'txwy', 'txx', 'txy', 'txcentre', 'txnote', 'txadd', 'txclear', 'txclose', 'txbtn', 'txpv'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error(id + ' is not in the markup exactly once');
const at = markup.indexOf('<div class="scrim pop" id="txscrim"');
const end = markup.indexOf('<div class="scrim pop" id="tfscrim"');
if (at < 0 || end < 0 || end < at) throw new Error('could not bound the text card');
const card = markup.slice(at, end);
for (const id of IDS)
  if (id !== 'txbtn' && id !== 'txpv' && card.indexOf('id="' + id + '"') < 0)
    throw new Error(id + ' did not make it into the text card');

/* AND SOMETHING OPENS IT - the same lookup every other panel goes through. */
if (code.indexOf('for(const id of ["cl","tx","tf","bl","sv"]){') < 0)
  throw new Error('the text panel is not in the loop that wires openers');
if (code.indexOf("keys:['a'], run:()=>railPanel('tx'") < 0)
  throw new Error('the text panel has no key');
if (code.indexOf("['cl','tx','tf','bl','sv'].forEach(i=>railPanel(i,false))") < 0)
  throw new Error('Escape does not close the text panel');

/* THE SPRITE IS NEVER IN THE ARTWORK UNTIL ADD. The preview draws to txpv
   and only textApply touches ctx, so a stray putImageData in the draw path
   would make every keystroke an edit. */
const drawFn = code.slice(code.indexOf('function textDraw(){'), code.indexOf('function textNote(){'));
if (drawFn.indexOf('ctx.') >= 0)
  throw new Error('the preview writes to the artwork');
if (code.indexOf('function textApply(){\r\n  if(!textSprite){ toast("Type something first"); return; }\r\n  snapshot();') < 0)
  throw new Error('applying text does not take an undo step first');

/* THE AGENT SURFACE DRIVES THE PANEL. If PB.text called renderPixelText
   itself, the panel and the sprite would disagree the moment either moved. */
const pbText = code.slice(code.indexOf('PB.text=function(o){'),
  code.indexOf('PB.linked=function()'));
if (!pbText) throw new Error('PB.text is missing');
if (pbText.indexOf('railPanel("tx",true);') < 0)
  throw new Error('PB.text does not open the panel it is driving');
if (pbText.indexOf('textBuild();') < 0)
  throw new Error('PB.text renders without going through the panel');

/* AND IT CAN BE MOVED. A drag that never reaches the sprite leaves the
   number fields as the only way to place it. */
if (code.indexOf('textDrag={fx:tc.x,fy:tc.y,x:textX,y:textY}; return;') < 0)
  throw new Error('a press on the sprite does not start a drag');
if (code.indexOf('textX=textDrag.x+(rc.x-textDrag.fx);') < 0)
  throw new Error('dragging does not move the sprite');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
