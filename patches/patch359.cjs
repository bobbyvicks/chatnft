/* EXTENSION POINTS, SO SEVERAL HANDS CAN ADD TOOLS AT ONCE.

   The next job is bringing Pixelorama's tools into this editor - shapes,
   selections, shading, gradients, a dozen image effects - and it is too much
   for one pair of hands in sequence. Several agents will each write a patch
   in parallel. Today every patch that adds a panel edits the same four
   strings: the rail's button list, the loop that wires panel openers, the
   Escape handler's list of panels, and the shortcut table. The first patch
   to land changes those strings and every patch after it fails to find them.

   So this lands FIRST, alone, and turns those shared strings into places to
   register:

   - RAIL_PANELS is the one list of pop-out panels. The wiring loop, the
     click-away closer and Escape all read it; a patch pushes its id and is
     wired everywhere at once.
   - TOOL_HOOKS is a registry for drawing tools. beginStroke, the drag handler
     and endPointer consult it BEFORE their own branches, so a tool adds
     itself with registerTool(name, {down, move, up}) and never edits the
     pointer code.
   - EFFECTS is a registry behind one Adjust panel. An effect is a pure
     function from pixels to pixels plus a list of parameters; the panel
     draws the controls, previews on the art, and applies through snapshot()
     so one undo takes it back. Ten effects would otherwise be ten rail
     buttons.
   - selMask is a selection mask that dab() honours from today. It is null
     until a selection tool exists, which makes the branch dead for now and
     documented as the place a selection plugs in.
   - Four markers in the markup and script - rail:tools, rail:more,
     panels:more, shortcuts:more - are the lines patches insert BEFORE.
     Inserting before a comment nobody else changes is what makes the patches
     composable in any order.

   Nothing a person can see changes here except one new rail button, Adjust,
   which opens an empty panel until the first effect registers. That is
   deliberate: this patch has to be boring, because everything after it
   stands on it.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

/* PB_INDEX lets this run against a copy - the live file is being served to a
   test run more often than not, and a patch that lands mid-run contaminates
   every test after it. */
const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
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

/* ---- 1. one list of panels ---------------------------------------------- */
swap('function railPanel(id,on){', block([
  '/* THE ONE LIST OF POP-OUT PANELS. The wiring loop below, the click-away',
  '   closer and Escape all read it, so a panel added later is wired everywhere',
  '   by pushing its id here - which a patch does on the line after this one.',
  '   The outline panel is not in it: it predates the others and has its own',
  '   opener, and the closers add it themselves. */',
  'const RAIL_PANELS=["cl","tx","eh","qa","ag","tf","bl","sv"];',
  '/* panels:register */',
  'function railPanel(id,on){',
]));
swap('for(const id of ["cl","tx","eh","qa","ag","tf","bl","sv"]){', 'for(const id of RAIL_PANELS){');
swap('  for(const id of ["ol","cl","tx","eh","qa","ag","tf","bl","sv"]){', '  for(const id of ["ol"].concat(RAIL_PANELS)){');
swap(block([
  "    match:e=>e.key==='Escape'&&['cl','tx','eh','qa','ag','tf','bl','sv'].some(i=>!$(i+'scrim').hidden),",
  "    run:()=>['cl','tx','eh','qa','ag','tf','bl','sv'].forEach(i=>railPanel(i,false))},",
]), block([
  "    match:e=>e.key==='Escape'&&RAIL_PANELS.some(i=>!$(i+'scrim').hidden),",
  "    run:()=>RAIL_PANELS.forEach(i=>railPanel(i,false))},",
]));

/* ---- 2. the markers ----------------------------------------------------- */
/* New drawing tools go before the eyedropper, so the outline button stays
   directly after it - which is where it was asked to be, and what
   colourtools.spec.js pins. */
swap('    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)">', block([
  '    <!-- rail:tools -->',
  '    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)">',
]));
/* New panel buttons go after Save, before the first divider. */
{
  const a = text.indexOf('    <button class="tool" id="svbtn"');
  if (a < 0) throw new Error('no save button');
  const b = text.indexOf(NL + '    <div class="rule"></div>', a);
  if (b < 0 || b - a > 600) throw new Error('the divider after the save button moved');
  text = text.slice(0, b) + NL + '    <!-- rail:more -->' + text.slice(b);
}
swap('<div class="scrim pop" id="tfscrim" hidden>', block([
  '<!-- panels:more -->',
  '<div class="scrim pop" id="tfscrim" hidden>',
]));
swap("  {show:'Esc', desc:'Close a panel', prevent:true,", block([
  '  /* shortcuts:more */',
  "  {show:'Esc', desc:'Close a panel', prevent:true,",
]));

/* ---- 3. tool hooks ------------------------------------------------------ */
swap('function beginStroke(e){', block([
  '/* A DRAWING TOOL REGISTERS ITSELF rather than editing the pointer code.',
  '   {down(e,cell), move(e,cell), up(e), select(), deselect(), brush} - brush',
  '   true keeps the size slider and the square cursor for it. The three pointer',
  '   handlers consult this BEFORE their own branches, so a registered tool',
  '   owns the whole stroke and nothing below it runs. */',
  'const TOOL_HOOKS={};',
  'let hookTool=null;',
  'function registerTool(name,hooks){ TOOL_HOOKS[name]=hooks; }',
  'function beginStroke(e){',
]));
swap(block([
  '  if(textSprite){',
  '    const tc=rawCell(e);',
  '    if(textHit(tc.x,tc.y)){ textDrag={fx:tc.x,fy:tc.y,x:textX,y:textY}; return; }',
  '  }',
]), block([
  '  if(textSprite){',
  '    const tc=rawCell(e);',
  '    if(textHit(tc.x,tc.y)){ textDrag={fx:tc.x,fy:tc.y,x:textX,y:textY}; return; }',
  '  }',
  '  /* A registered tool owns the stroke from here. Pending text still comes',
  '     first, above, because it can be dragged whatever the tool is. */',
  '  { const T=TOOL_HOOKS[tool]; if(T){ hookTool=tool; if(T.down) T.down(e,c); return; } }',
]));
swap(block([
  '  if(textDrag){',
  '    const rc=rawCell(e);',
]), block([
  '  if(hookTool){ const T=TOOL_HOOKS[hookTool]; if(T&&T.move) T.move(e,c); return; }',
  '  if(textDrag){',
  '    const rc=rawCell(e);',
]));
swap('  if(textDrag&&pts.size===0) textDrag=null;', block([
  '  if(textDrag&&pts.size===0) textDrag=null;',
  '  if(hookTool&&pts.size===0){ const T=TOOL_HOOKS[hookTool]; hookTool=null; if(T&&T.up) T.up(e); }',
]));

/* selectTool tells the tool it is leaving and the one it is arriving at, and
   lets a registered tool keep the brush rows. */
swap(block([
  '  if(t===\'move\') t=\'transform\';',
  '  tool=t; panMode=(t===\'pan\');',
]), block([
  '  if(t===\'move\') t=\'transform\';',
  '  { const was=TOOL_HOOKS[tool]; if(was&&was.deselect&&tool!==t){ try{ was.deselect(); }catch(_){ } } }',
  '  tool=t; panMode=(t===\'pan\');',
]));
swap("  $('brushrows').hidden=!(t==='pencil'||t==='eraser');", block([
  "  $('brushrows').hidden=!(t==='pencil'||t==='eraser'||(TOOL_HOOKS[t]&&TOOL_HOOKS[t].brush));",
]));
swap(block([
  '  tboxShow();',
  '  paintCursor();',
  '}',
  "function toast(m){",
]), block([
  '  tboxShow();',
  '  paintCursor();',
  '  { const T=TOOL_HOOKS[t]; if(T&&T.select){ try{ T.select(); }catch(_){ } } }',
  '}',
  "function toast(m){",
]));
swap("  const n=(tool==='pencil'||tool==='eraser')?brush:1;",
  "  const n=(tool==='pencil'||tool==='eraser'||(TOOL_HOOKS[tool]&&TOOL_HOOKS[tool].brush))?brush:1;");

/* ---- 4. the selection mask, honoured by dab from today ------------------ */
swap('function dab(x0,y0,rgb,a){', block([
  '/* WHERE A SELECTION PLUGS IN. Null means everything; a Uint8Array of',
  '   art.width*art.height with 1 where painting is allowed means only there.',
  '   dab honours it below and the Adjust panel confines effects to it, so a',
  '   selection tool has one thing to set and every writer already listens. */',
  'let selMask=null;',
  'function selAllows(x,y){ return !selMask||selMask[y*art.width+x]===1; }',
  'function dab(x0,y0,rgb,a){',
]));
swap(block([
  '  const w=x2-x1+1, h=y2-y1+1;',
  '  const img=ctx.createImageData(w,h), t=img.data;',
]), block([
  '  const w=x2-x1+1, h=y2-y1+1;',
  '  /* Inside a selection the block is no longer uniform, so it is read,',
  '     written where allowed and put back - the slow path, taken only when',
  '     there is a mask to honour. */',
  '  if(selMask){',
  '    const img=ctx.getImageData(x1,y1,w,h), t=img.data, W2=art.width;',
  '    for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){',
  '      if(selMask[(y1+yy)*W2+x1+xx]!==1) continue;',
  '      const p=(yy*w+xx)*4; t[p]=rgb[0]; t[p+1]=rgb[1]; t[p+2]=rgb[2]; t[p+3]=a;',
  '    }',
  '    ctx.putImageData(img,x1,y1); return;',
  '  }',
  '  const img=ctx.createImageData(w,h), t=img.data;',
]));

/* ---- 5. the Adjust panel and the effect registry ------------------------ */
swap('    <!-- rail:more -->', block([
  '    <button class="tool" id="fxbtn" aria-expanded="false" title="Adjust (F)"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="7" cy="17" r="2" fill="var(--panel)"/></svg><span class="k">F</span></button>',
  '    <!-- rail:more -->',
]));
swap('<!-- panels:more -->', block([
  '<!-- Whole-image adjustments, each a registered function. One panel for all',
  '     of them, because ten effects as ten rail buttons is a rail nobody can',
  '     read. Previewed on the art before anything lands. -->',
  '<div class="scrim pop" id="fxscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="fxtitle">',
  '    <h2 id="fxtitle">Adjust</h2>',
  '    <p class="sub">Whole-image changes, shown on the art before they land. Inside a selection, only there.</p>',
  '    <div class="olrow"><label for="fxsel">Effect</label>',
  '      <select id="fxsel" style="margin-left:auto; max-width:210px"></select></div>',
  '    <div id="fxparams"></div>',
  '    <p class="note" id="fxnote"></p>',
  '    <div class="savebar" style="margin-top:14px">',
  '      <button class="btn" id="fxapply" style="flex:1" disabled>Apply</button>',
  '      <button class="btn ghost" id="fxclose">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<!-- panels:more -->',
]));
swap('<canvas id="txpv"></canvas>', '<canvas id="fxpv"></canvas><canvas id="txpv"></canvas>');
swap(block([
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
]), block([
  '/* The effect preview sits over the art and under pending text, which is',
  '   still placed against everything else on screen. */',
  '#fxpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
  '  image-rendering:pixelated;}',
]));
swap('const RAIL_PANELS=["cl","tx","eh","qa","ag","tf","bl","sv"];',
  'const RAIL_PANELS=["cl","tx","eh","qa","ag","tf","bl","sv","fx"];');
swap("  {show:'A', desc:'Text', keys:['a'], run:()=>railPanel('tx',$('txscrim').hidden)},", block([
  "  {show:'A', desc:'Text', keys:['a'], run:()=>railPanel('tx',$('txscrim').hidden)},",
  "  {show:'F', desc:'Adjust', keys:['f'], run:()=>railPanel('fx',$('fxscrim').hidden)},",
]));

swap('/* panels:register */', block([
  '/* panels:register */',
  '',
  '/* ---- the Adjust panel -----------------------------------------------------',
  '',
  '   An effect is {id, name, params:[{id,label,type,min,max,step,value,',
  '   options}], run(src,W,H,values) -> Uint8ClampedArray, note(values)}.',
  '   type is "range" (default), "number", "color", "check" or "select".',
  '   run is PURE: it gets a copy of the pixels and returns new ones, and it',
  '   never touches ctx - the panel previews on its own layer and applies',
  '   through snapshot(), so one undo takes any effect back. */',
  'const EFFECTS=[];',
  'let fxTimer=null;',
  'function registerEffect(fx){',
  '  if(!fx||!fx.id||typeof fx.run!=="function") throw new Error("an effect needs an id and a run()");',
  '  if(EFFECTS.some(e=>e.id===fx.id)) throw new Error("effect registered twice: "+fx.id);',
  '  EFFECTS.push(fx); fxRebuild();',
  '}',
  'function fxCurrent(){ const s=$("fxsel"); return EFFECTS.find(e=>e.id===(s&&s.value))||null; }',
  'function fxValues(){',
  '  const fx=fxCurrent(), out={}; if(!fx) return out;',
  '  for(const p of fx.params||[]){',
  '    const el=$("fxp_"+p.id); if(!el){ out[p.id]=p.value; continue; }',
  '    out[p.id]= p.type==="check" ? el.checked : p.type==="color"||p.type==="select" ? el.value : +el.value;',
  '  }',
  '  return out;',
  '}',
  'function fxRebuild(){',
  '  const s=$("fxsel"); if(!s) return;',
  '  const had=s.value; s.replaceChildren();',
  '  for(const fx of EFFECTS){ const o=document.createElement("option"); o.value=fx.id; o.textContent=fx.name||fx.id; s.appendChild(o); }',
  '  if(EFFECTS.some(e=>e.id===had)) s.value=had;',
  '  fxParams();',
  '}',
  'function fxParams(){',
  '  const box=$("fxparams"), fx=fxCurrent(); if(!box) return;',
  '  box.replaceChildren();',
  '  const apply=$("fxapply"); if(apply) apply.disabled=!fx;',
  '  if(!fx){ const n=$("fxnote"); if(n) n.textContent="Nothing registered yet."; fxPreview(); return; }',
  '  for(const p of fx.params||[]){',
  '    const row=document.createElement("div"); row.className="olrow";',
  '    const lab=document.createElement("label"); lab.textContent=p.label||p.id; lab.htmlFor="fxp_"+p.id;',
  '    let el;',
  '    if(p.type==="select"){ el=document.createElement("select");',
  '      for(const o of p.options||[]){ const op=document.createElement("option"); op.value=String(o.value!==undefined?o.value:o); op.textContent=String(o.label!==undefined?o.label:o); el.appendChild(op); }',
  '      el.value=String(p.value); el.style.marginLeft="auto"; }',
  '    else if(p.type==="check"){ el=document.createElement("input"); el.type="checkbox"; el.checked=!!p.value; el.style.marginLeft="auto"; }',
  '    else if(p.type==="color"){ el=document.createElement("input"); el.type="color"; el.value=p.value||"#000000"; el.style.marginLeft="auto"; }',
  '    else { el=document.createElement("input"); el.type=p.type==="number"?"number":"range";',
  '      el.min=p.min; el.max=p.max; el.step=p.step||1; el.value=p.value;',
  '      if(p.type!=="number"){ el.style.flex="1"; el.style.minWidth="90px"; } else el.style.marginLeft="auto"; }',
  '    el.id="fxp_"+p.id;',
  '    el.oninput=el.onchange=()=>{ fxPreview(); };',
  '    row.appendChild(lab); row.appendChild(el);',
  '    if(el.type==="range"){ const v=document.createElement("span"); v.className="mono"; v.id="fxv_"+p.id; v.textContent=el.value; el.addEventListener("input",()=>{ v.textContent=el.value; }); row.appendChild(v); }',
  '    box.appendChild(row);',
  '  }',
  '  fxPreview();',
  '}',
  '/* The effect runs on a COPY and draws to its own layer, so nothing here is',
  '   an edit. Debounced, because a slider fires on every pixel of travel and',
  '   an effect over a 1280 canvas is not free. Inside a selection the result',
  '   is blended in only where the mask allows, so effect authors never have',
  '   to know a selection exists. */',
  'function fxPreview(){',
  '  clearTimeout(fxTimer);',
  '  const pv=$("fxpv"); if(!pv) return;',
  '  const fx=fxCurrent();',
  '  if(!fx||!ctx||$("fxscrim").hidden||$("app").hidden){ pv.style.display="none"; return; }',
  '  fxTimer=setTimeout(()=>{',
  '    const W=art.width, H=art.height, vals=fxValues();',
  '    let out;',
  '    try{ out=fx.run(new Uint8ClampedArray(ctx.getImageData(0,0,W,H).data),W,H,vals); }',
  '    catch(err){ const n=$("fxnote"); if(n) n.textContent=String(err.message||err); pv.style.display="none"; return; }',
  '    if(!out||out.length!==W*H*4){ const n=$("fxnote"); if(n) n.textContent="The effect returned the wrong number of pixels."; pv.style.display="none"; return; }',
  '    if(selMask){ const src=ctx.getImageData(0,0,W,H).data; for(let i=0;i<W*H;i++) if(selMask[i]!==1){ const p=i*4; out[p]=src[p]; out[p+1]=src[p+1]; out[p+2]=src[p+2]; out[p+3]=src[p+3]; } }',
  '    pv.width=W; pv.height=H;',
  '    const g=pv.getContext("2d"), im=g.createImageData(W,H); im.data.set(out); g.putImageData(im,0,0);',
  '    pv.style.width=(W*zoom)+"px"; pv.style.height=(H*zoom)+"px"; pv.style.display="block";',
  '    const n=$("fxnote"); if(n) n.textContent= fx.note ? (fx.note(vals)||"") : "";',
  '  },60);',
  '}',
  'function fxApply(){',
  '  const fx=fxCurrent(); if(!fx||!ctx){ toast("Nothing to apply"); return; }',
  '  const W=art.width, H=art.height, vals=fxValues();',
  '  const src=ctx.getImageData(0,0,W,H);',
  '  let out;',
  '  try{ out=fx.run(new Uint8ClampedArray(src.data),W,H,vals); }',
  '  catch(err){ toast(String(err.message||err)); return; }',
  '  if(!out||out.length!==W*H*4){ toast("The effect returned the wrong number of pixels"); return; }',
  '  if(selMask){ for(let i=0;i<W*H;i++) if(selMask[i]!==1){ const p=i*4; out[p]=src.data[p]; out[p+1]=src.data[p+1]; out[p+2]=src.data[p+2]; out[p+3]=src.data[p+3]; } }',
  '  /* Nothing changed is not an edit, and must not cost an undo step. */',
  '  let same=true; for(let i=0;i<out.length;i++){ if(out[i]!==src.data[i]){ same=false; break; } }',
  '  if(same){ toast("That changes nothing at these settings"); return; }',
  '  snapshot();',
  '  src.data.set(out); ctx.putImageData(src,0,0);',
  '  $("fxpv").style.display="none";',
  '  refreshStats(); repalette();',
  '  toast((fx.name||fx.id)+" applied");',
  '  fxPreview();',
  '}',
  '(function(){',
  '  const s=$("fxsel"); if(!s) return;',
  '  s.onchange=fxParams;',
  '  const a=$("fxapply"); if(a) a.onclick=fxApply;',
  '})();',
]));
/* The preview has to go away when the panel does, or it stays over the art
   as a picture of an edit that never happened. */
swap(block([
  '  if(on&&id==="qa"){ try{ qaInvalidate(); }catch(_){ } }',
]), block([
  '  if(on&&id==="qa"){ try{ qaInvalidate(); }catch(_){ } }',
  '  if(id==="fx"){ try{ if(on) fxRebuild(); else { clearTimeout(fxTimer); const pv=$("fxpv"); if(pv) pv.style.display="none"; } }catch(_){ } }',
]));

/* ---- 6. the agent surface --------------------------------------------- */
swap('PB.text=function(o){', block([
  '/* What is registered, for something that cannot see the rail. */',
  'PB.tools=function(){ return Object.keys(TOOL_HOOKS); };',
  'PB.effects=function(){ return EFFECTS.map(e=>({id:e.id, name:e.name||e.id, params:(e.params||[]).map(p=>({id:p.id,label:p.label,type:p.type||"range",min:p.min,max:p.max,step:p.step,value:p.value}))})); };',
  '/* Run an effect by id with values, and apply it - the same path the',
  '   panel takes, so what an agent applies is what a person would have seen. */',
  'PB.adjust=function(id,values,apply){',
  '  railPanel("fx",true);',
  '  const s=$("fxsel"); if(!EFFECTS.some(e=>e.id===id)) return {ok:false, why:"no effect called "+id};',
  '  s.value=id; fxParams();',
  '  for(const k in (values||{})){ const el=$("fxp_"+k); if(!el) continue; if(el.type==="checkbox") el.checked=!!values[k]; else el.value=values[k]; }',
  '  if(apply) fxApply(); else fxPreview();',
  '  return {ok:true, id, values:fxValues(), applied:!!apply};',
  '};',
  'PB.text=function(o){',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* THE MARKERS EXIST, ONCE EACH, IN THE PLACE A PATCH WILL LOOK. */
for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
  if (markup.split(m).length !== 2) throw new Error('marker not exactly once in markup: ' + m);
for (const m of ['/* panels:register */', '/* shortcuts:more */'])
  if (script.split(m).length !== 2) throw new Error('marker not exactly once in script: ' + m);
/* rail:tools sits right before the eyedropper, so a tool inserted before it
   lands after Transform and before Pick - and Outline stays after Pick. */
{
  const a = markup.indexOf('<!-- rail:tools -->'), b = markup.indexOf('data-tool="pick"');
  if (!(a < b && b - a < 120)) throw new Error('rail:tools is not directly before the eyedropper');
}

/* NO LITERAL PANEL LIST SURVIVES. One left behind is a list a patch cannot
   register into, which is the defect this exists to end. */
for (const lit of ['["cl","tx","eh","qa","ag","tf","bl","sv"]', "['cl','tx','eh','qa','ag','tf','bl','sv']"])
  if (code.indexOf(lit) >= 0) throw new Error('a literal panel list survives: ' + lit);
if (code.indexOf('for(const id of RAIL_PANELS){') < 0) throw new Error('the wiring loop does not read RAIL_PANELS');
if (code.indexOf('["ol"].concat(RAIL_PANELS)') < 0) throw new Error('click-away does not read RAIL_PANELS');
if (code.indexOf('RAIL_PANELS.some(i=>!$(i+\'scrim\').hidden)') < 0) throw new Error('Escape does not read RAIL_PANELS');

/* THE HOOKS ARE CONSULTED FIRST, in all three handlers. */
if (code.indexOf('{ const T=TOOL_HOOKS[tool]; if(T){ hookTool=tool; if(T.down) T.down(e,c); return; } }') < 0)
  throw new Error('beginStroke does not consult the registry');
if (code.indexOf('if(hookTool){ const T=TOOL_HOOKS[hookTool]; if(T&&T.move) T.move(e,c); return; }') < 0)
  throw new Error('the drag handler does not consult the registry');
if (code.indexOf('if(hookTool&&pts.size===0){ const T=TOOL_HOOKS[hookTool]; hookTool=null; if(T&&T.up) T.up(e); }') < 0)
  throw new Error('endPointer does not consult the registry');
/* And before the transform branch, or a registered tool never gets a press
   while Transform is selected... which it never is at the same time, but a
   registered tool must not depend on that. */
{
  const bs = code.slice(code.indexOf('function beginStroke(e){'));
  if (bs.indexOf('TOOL_HOOKS[tool]') > bs.indexOf('if(tool==="transform"){'))
    throw new Error('the registry is consulted after the transform branch');
}

/* THE MASK IS HONOURED where pixels are written. */
if (code.indexOf('if(selMask){\r\n    const img=ctx.getImageData(x1,y1,w,h)') < 0)
  throw new Error('dab does not honour the selection mask');

/* THE ADJUST PANEL IS WIRED LIKE EVERY OTHER. */
if (code.indexOf('const RAIL_PANELS=["cl","tx","eh","qa","ag","tf","bl","sv","fx"];') < 0)
  throw new Error('fx is not in the panel list');
for (const id of ['fxbtn', 'fxscrim', 'fxsel', 'fxparams', 'fxnote', 'fxapply', 'fxclose', 'fxpv'])
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
if (code.indexOf('function registerEffect(fx){') < 0) throw new Error('registerEffect is missing');
/* Apply goes through snapshot, and a no-op is refused before it. */
{
  const ap = code.slice(code.indexOf('function fxApply(){'), code.indexOf('(function(){\r\n  const s=$("fxsel")'));
  if (ap.indexOf('snapshot();') < 0) throw new Error('fxApply does not take an undo step');
  if (ap.indexOf('snapshot();') < ap.indexOf('if(same){')) throw new Error('fxApply snapshots before refusing a no-op');
}
/* Text stays the top layer. */
if (text.indexOf('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;') < 0)
  throw new Error('the text layer is no longer above the effect preview');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
