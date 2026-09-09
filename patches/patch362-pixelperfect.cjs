/* PIXEL PERFECT AND SYMMETRY FOR THE PENCIL AND THE ERASER, from Pixelorama.

   Two options of the stroke rather than two tools, which is why they sit in
   the strip next to Snap and why stroke() is the one function this edits.

   PIXEL PERFECT is Pixelorama's PixelPerfectDrawer (src/Classes/Drawers.gd),
   carried across rule for rule. Every dab is remembered with what was under
   it; when a dab is diagonal to the one two back and orthogonal to the one
   between, the one between is the elbow of an L and is put back to what it
   was. The history then keeps the CORNER in the elbow's place - Pixelorama's
   `last_pixels[0] = corner` - so the next dab is judged against the pixel
   that survived rather than the one that went; that is what keeps a 2:1 line
   from losing two elbows in a row and thinning to nothing. Only while the
   brush is 1: BaseDraw.gd's _prepare_tool sets `_drawer.pixel_perfect` only
   when `_brush_size == 1`, because an elbow on a 3-wide stroke is not a
   corner. The history is reset at the start of every stroke (Pencil.gd and
   Eraser.gd draw_start both call _drawer.reset()) and never between the
   dabs of one.

   SYMMETRY is Tools.gd's get_mirrored_positions with the axes fixed on the
   canvas centre: Project.gd sets x_symmetry_point to width-1, so the mirror
   of x is (width-1)-x, and the same for y. The mirrored dabs are streams of
   their own - Drawer.set_pixel hands the i-th mirror to drawers[i+1], each
   a PixelPerfectDrawer with its own history - and they are refused where a
   selection refuses them, exactly as _set_pixel_no_cache refuses the whole
   dab when the pixel under the pointer is outside the selection and
   Drawer.set_pixel refuses each mirror when it is. The axes are drawn as
   guides on a layer of their own, the way SymmetryGuide.gd draws them, and
   never touch a pixel of art.

   None of the three has a key. Pixelorama's project.godot ships
   horizontal_mirror, vertical_mirror and pixel_perfect with "events": [],
   so none is bound here either - and the taken keys stay free for the tools.

   Not ported, and said so: the two diagonal mirrors, the draggable axis and
   the "mirror about the view centre" option (GlobalToolOptions.gd
   _on_mirror_options_id_pressed), alpha lock, brush density and the size
   dynamics, mirror VIEW (Global.mirror_view - a flip of the picture, not
   symmetry), the 22.5-degree snap pixel_perfect adds to Shift-lines, and
   the global Show Guides switch. Symmetry here applies to pencil and eraser
   strokes; Pixelorama applies it to every drawing tool through one Drawer,
   and dabSym below is what another tool calls to get the same. stroke()'s
   own rasteriser - a rounded DDA - is kept, not replaced by Godot's
   Geometry2D.bresenham_line: it walks the same cells for a pointer that
   moves one cell at a time, which is the case the corner rule is for, and
   can differ from Godot on a tie when the pointer jumps several cells. */
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

/* PB_INDEX lets this run against a copy - the live file is being served to a
   test run more often than not. */
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

/* ---- 1. the toggles, in the strip ------------------------------------ */
/* Beside the colour, on the line above Snap, and not on Snap's own line.
   Measured at the 1280-1519 layout, where .opts is a 274px column: Snap's
   row is Size + slider + readout + Snap = 250 of its 250px, so anything
   added there wraps the strip from 79px to 113px, over the 90px ceiling
   panel.spec.js pins. The colour's line has 250 - 90 - 18 = 142px free, and
   Perfect plus two glyph buttons at 6px 8px come to about 130. Shown and
   hidden with #brushrows, as Snap is, because they are options of the same
   two tools; Pixelorama keeps its mirrors global, but here a mirror toggle
   showing beside the fill tool would promise something fill does not do. */
swap(block([
  '      <span class="mono" id="curhex" title="The colour you are painting with">#000000</span>',
  '    </div>',
  '    <div id="brushrows">',
]), block([
  '      <span class="mono" id="curhex" title="The colour you are painting with">#000000</span>',
  '    </div>',
  '    <div id="strokeopts">',
  '      <button class="btn ghost" id="ppbtn" aria-pressed="false" style="width:auto;padding:6px 8px;font-size:12px"',
  '        title="Pixel perfect: while the brush is 1, a stroke drops the corner pixel of every L-shaped step so a diagonal stays one pixel wide. Bigger brushes are left alone - an elbow on a 3-wide stroke is not a corner.">Perfect</button>',
  '      <button class="btn ghost" id="symh" aria-pressed="false" aria-label="Horizontal mirror" style="width:auto;padding:6px 8px;font-size:12px"',
  '        title="Horizontal mirror: every dab is repeated on the other side of the vertical centre line of the canvas. The line is shown while this is on.">&#x2194;</button>',
  '      <button class="btn ghost" id="symv" aria-pressed="false" aria-label="Vertical mirror" style="width:auto;padding:6px 8px;font-size:12px"',
  '        title="Vertical mirror: every dab is repeated across the horizontal centre line of the canvas. With both mirrors on a dab lands in all four quarters.">&#x2195;</button>',
  '    </div>',
  '    <div id="brushrows">',
]));
swap('.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}', block([
  '.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}',
  '/* The stroke options: one flex child of the strip, so at the column width',
  '   it shares the colour\'s line rather than starting one of its own. */',
  '.opts #strokeopts{display:flex; align-items:center; gap:4px;}',
]));
swap("  $('brushrows').hidden=!(t==='pencil'||t==='eraser'||(TOOL_HOOKS[t]&&TOOL_HOOKS[t].brush));", block([
  "  $('brushrows').hidden=!(t==='pencil'||t==='eraser'||(TOOL_HOOKS[t]&&TOOL_HOOKS[t].brush));",
  "  $('strokeopts').hidden=$('brushrows').hidden;",
]));

/* ---- 2. the guide layer ----------------------------------------------- */
/* Before txpv, the way fxpv went in: text is placed against everything on
   screen, so the guides sit under it and over the effect preview. */
swap('<canvas id="txpv"></canvas>', '<canvas id="symgd"></canvas><canvas id="txpv"></canvas>');
swap('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;', block([
  '/* The symmetry guides: the centre lines of the canvas, on a layer of their',
  '   own so they never touch a pixel of art. Same level as the effect preview',
  '   and after it in the markup, so they show over it; under pending text.',
  '   No image-rendering rule: it is drawn at screen resolution, not scaled. */',
  '#symgd{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;}',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
]));

/* ---- 3. the rule, the mirrors, and the guides -------------------------- */
swap('function stroke(e){', block([
  '/* ---- pixel perfect and symmetry --------------------------------------------',
  '',
  '   Ported from Pixelorama: PixelPerfectDrawer in Classes/Drawers.gd, the',
  '   drawer choice in BaseDraw.gd _prepare_tool, the mirror positions in',
  '   Tools.gd get_mirrored_positions and the axes in Project.gd. Options of',
  '   the stroke rather than tools, so they live next to Snap and stroke()',
  '   calls dabSym in place of dab. No key for any of them: project.godot',
  '   ships all three actions with an empty event list. */',
  'function pixelPerfectOn(){ return pressed("ppbtn"); }',
  'function mirrorH(){ return pressed("symh"); }',
  'function mirrorV(){ return pressed("symv"); }',
  '',
  '/* PixelPerfectDrawer, as a two-slot history per stream. A dab records',
  '   where it went and what was there, is painted, and then looks two dabs',
  '   back: when that one is diagonal to this one (a CORNER) and the one',
  '   between is orthogonal to this one (a NEIGHBOUR), the one between is the',
  '   elbow of an L and is put back to what it was - so on a stroke over paint',
  '   it comes back as that paint, and for the eraser it comes back as the',
  '   pixel that was erased. The history then keeps the corner in the elbow\'s',
  '   place - Pixelorama\'s `last_pixels[0] = corner` - so the next dab is',
  '   judged against the pixel that survived; without that a 2:1 line loses',
  '   two elbows in a row and thins to nothing. The four vectors are',
  '   Drawers.gd\'s NEIGHBOURS and CORNERS in its order. "What was there" is',
  '   read at the moment of THIS stream\'s dab, as color_old is: on the axis',
  '   column of an odd canvas a mirror lands on its own source and reads the',
  '   paint the source stream just laid, so its restore puts paint back -',
  '   Pixelorama does the same, and it is carried, not corrected. */',
  'const PP_NEIGHBOURS=[[0,1],[1,0],[-1,0],[0,-1]], PP_CORNERS=[[1,1],[-1,-1],[-1,1],[1,-1]];',
  'let ppHist=[];   /* one [a,b] pair per stream: 0 the dab itself, 1.. its mirrors */',
  'function ppReset(){ ppHist=[]; }',
  'function putPx(x,y,r,g,b,a){',
  '  const im=ctx.createImageData(1,1); im.data[0]=r; im.data[1]=g; im.data[2]=b; im.data[3]=a;',
  '  ctx.putImageData(im,x,y);',
  '}',
  'function ppDab(i,x,y,rgb,a){',
  '  const h=ppHist[i]||(ppHist[i]=[null,null]);',
  '  const was=ctx.getImageData(x,y,1,1).data;',
  '  h.push([x,y,was[0],was[1],was[2],was[3]]);',
  '  dab(x,y,rgb,a);',
  '  const corner=h.shift(), nb=h[0];',
  '  if(!corner||!nb) return;',
  '  const cx=x-corner[0], cy=y-corner[1], nx=x-nb[0], ny=y-nb[1];',
  '  if(PP_CORNERS.some(c=>c[0]===cx&&c[1]===cy)&&PP_NEIGHBOURS.some(n=>n[0]===nx&&n[1]===ny)){',
  '    putPx(nb[0],nb[1],nb[2],nb[3],nb[4],nb[5]);',
  '    h[0]=corner;',
  '  }',
  '}',
  '',
  '/* get_mirrored_positions for one layer with the axes on the canvas centre:',
  '   x_symmetry_point defaults to width-1, so the mirror of x is (W-1)-x, and',
  '   the same for y. Pixelorama\'s order - h, then both, then v - because each',
  '   entry is a pixel-perfect stream and the index has to mean one thing for',
  '   the whole stroke. Pixelorama mirrors PIXEL BY PIXEL: _compute_draw_tool',
  '   _pixel lays the brush out first and Drawer.set_pixel reflects each',
  '   coordinate. dab paints a block instead, hanging an even brush one cell',
  '   right and down of its cell (off = floor((brush-1)/2)), so the block',
  '   x0..x0+1 reflects to (W-2-x0)..(W-1-x0) - the block dab paints at',
  '   W-2-x0. `ev` is that one cell, and is 0 for an odd brush, which is',
  '   centred and reflects onto itself. Every mirror of a cell on the canvas',
  '   is on the canvas, so nothing is clipped that was not clipped before. */',
  'function mirrorCells(x0,y0,ev){',
  '  const W=art.width, H=art.height, h=mirrorH(), v=mirrorV();',
  '  const out=[[x0,y0]];',
  '  if(h){ out.push([W-1-x0-ev,y0]); if(v) out.push([W-1-x0-ev,H-1-y0-ev]); }',
  '  if(v) out.push([x0,H-1-y0-ev]);',
  '  return out;',
  '}',
  '/* What stroke() calls in place of dab: the dab, its mirrors, and pixel',
  '   perfect on each. A selection refuses the whole dab, mirrors included,',
  '   when the pixel under the pointer is outside it (_set_pixel_no_cache),',
  '   and refuses each mirror on its own when that one is (Drawer.set_pixel). */',
  'function dabSym(x0,y0,rgb,a){',
  '  if(pixelPerfectOn()&&brush===1){',
  '    if(!selAllows(x0,y0)) return;',
  '    mirrorCells(x0,y0,0).forEach((c,i)=>{ if(i===0||selAllows(c[0],c[1])) ppDab(i,c[0],c[1],rgb,a); });',
  '    return;',
  '  }',
  '  const cells=mirrorCells(x0,y0,1-brush%2);',
  '  if(selMask&&cells.length>1){',
  '    /* Pixel by pixel, because a source pixel outside the selection must',
  '       not reach the other side even when its mirror is inside - the rule',
  '       above, one pixel at a time. Slow, and taken only with a mask AND a',
  '       mirror. */',
  '    const W=art.width, H=art.height, off=Math.floor((brush-1)/2);',
  '    for(let y=y0-off;y<y0-off+brush;y++) for(let x=x0-off;x<x0-off+brush;x++){',
  '      if(x<0||y<0||x>=W||y>=H||!selAllows(x,y)) continue;',
  '      for(const c of mirrorCells(x,y,0)) if(selAllows(c[0],c[1])) putPx(c[0],c[1],rgb[0],rgb[1],rgb[2],a);',
  '    }',
  '    return;',
  '  }',
  '  for(const c of cells) dab(c[0],c[1],rgb,a);',
  '}',
  '',
  '/* THE GUIDES. Pixelorama draws each axis as a dotted Line2D in',
  '   Global.guide_color (PURPLE) lerped 0.6 toward (.2,.2,.65) - #5f2bc3 -',
  '   two screen pixels wide: SymmetryGuide._ready starts it at 4/zoom, and',
  '   CanvasCamera.gd _zoom_changed sets every guide to 2/zoom on the first',
  '   zoom change, so two is what is ever seen. Each sits on the canvas',
  '   centre line - x_symmetry_point/2 + 0.5 with the point at W-1 is W/2, the',
  '   seam between the two middle columns of an even canvas and the middle of',
  '   the centre column of an odd one. The horizontal mirror shows the',
  '   VERTICAL line (Pixelorama\'s y_symmetry_axis, which _on_Horizontal',
  '   _toggled shows) because that is the line it mirrors across. Drawn at',
  '   screen resolution on its own layer so it is crisp at any zoom and is',
  '   never a pixel of art. */',
  'function symDraw(){',
  '  const g=$("symgd"); if(!g) return;',
  '  const h=mirrorH(), v=mirrorV();',
  '  if(!ctx||!art.width||$("app").hidden||(!h&&!v)){ g.style.display="none"; return; }',
  '  const pw=Math.max(1,Math.round(art.width*zoom)), ph=Math.max(1,Math.round(art.height*zoom));',
  '  g.width=pw; g.height=ph; g.style.width=pw+"px"; g.style.height=ph+"px";',
  '  const c=g.getContext("2d"); c.clearRect(0,0,pw,ph);',
  '  c.strokeStyle="#5f2bc3"; c.lineWidth=2; c.setLineDash([6,6]);',
  '  c.beginPath();',
  '  if(h){ const x=art.width/2*zoom; c.moveTo(x,0); c.lineTo(x,ph); }',
  '  if(v){ const y=art.height/2*zoom; c.moveTo(0,y); c.lineTo(pw,y); }',
  '  c.stroke();',
  '  g.style.display="block";',
  '}',
  'function stroke(e){',
]));

/* The one edit to stroke(): dab becomes dabSym, for both tools. */
swap("    if(tool==='pencil') dab(p.x,p.y,rgb,255);", "    if(tool==='pencil') dabSym(p.x,p.y,rgb,255);");
swap("    else if(tool==='eraser') dab(p.x,p.y,[0,0,0],0);", "    else if(tool==='eraser') dabSym(p.x,p.y,[0,0,0],0);");

/* A stroke starts with an empty history - draw_start's _drawer.reset() in
   Pencil.gd and Eraser.gd - and never resets between its dabs. */
swap('  painting=true; lastCell=null;' + NL + '  stroke(e);', block([
  '  painting=true; lastCell=null; ppReset();',
  '  stroke(e);',
]));

/* The guides follow the zoom, and applyZoom is where every path that changes
   the art's size on screen ends up - open, wheel, fit, resize, the transform
   drag. */
swap('  paintCursor();' + NL + '}' + NL + 'function setZoom(z,anchor,fine){', block([
  '  paintCursor();',
  '  symDraw();',
  '}',
  'function setZoom(z,anchor,fine){',
]));

/* ---- 4. wired, and remembered ------------------------------------------- */
/* Pixelorama keeps the three in config_cache and reads them back at startup
   (Tools.gd 429-431); localStorage is this page's config_cache, under the
   pb. prefix the rest of it uses. */
swap("$('gsnap').onclick=()=>{ toggle('gsnap'); paintCursor(); };", block([
  "$('gsnap').onclick=()=>{ toggle('gsnap'); paintCursor(); };",
  "function strokeOptsSave(){",
  "  try{ localStorage.setItem('pb.strokeopts', JSON.stringify({pp:pixelPerfectOn(), h:mirrorH(), v:mirrorV()})); }catch(_){ }",
  "}",
  "$('ppbtn').onclick=()=>{ toggle('ppbtn'); strokeOptsSave(); };",
  "for(const id of ['symh','symv']) $(id).onclick=()=>{ toggle(id); symDraw(); strokeOptsSave(); };",
  "(function(){",
  "  let o=null; try{ o=JSON.parse(localStorage.getItem('pb.strokeopts')||'null'); }catch(_){ }",
  "  if(!o) return;",
  "  for(const [id,k] of [['ppbtn','pp'],['symh','h'],['symv','v']]) $(id).setAttribute('aria-pressed', o[k]?'true':'false');",
  "})();",
]));

/* ---- 5. the agent surface ------------------------------------------------ */
swap('PB.text=function(o){', block([
  '/* The stroke options for something without a mouse. Set through the same',
  '   buttons a person presses, so the strip shows what the next stroke will',
  '   do; returns the state either way. */',
  'PB.strokeOpts=function(o){',
  '  o=o||{};',
  '  const set=(id,v)=>{ if(typeof v==="boolean"&&pressed(id)!==v) $(id).click(); };',
  '  set("ppbtn",o.pixelPerfect); set("symh",o.mirrorH); set("symv",o.mirrorV);',
  '  return {pixelPerfect:pixelPerfectOn(), mirrorH:mirrorH(), mirrorV:mirrorV()};',
  '};',
  '/* A stroke from cell to cell, as the pointer events a drag is made of - so',
  '   pixel perfect, the mirrors, snap and the selection all apply, and one',
  '   undo takes it back. points is [[x,y],...] in art pixels. The tool is the',
  '   current one unless given, and only the pencil and the eraser stroke. */',
  'PB.stroke=function(points,opts){',
  '  opts=opts||{};',
  '  if(!ctx||$("app").hidden) return {ok:false, why:"no art open"};',
  '  if(opts.tool) selectTool(opts.tool);',
  '  if(tool!=="pencil"&&tool!=="eraser") return {ok:false, why:"the "+tool+" tool does not stroke"};',
  '  const pts=(points||[]).filter(p=>Array.isArray(p)&&p.length>=2);',
  '  if(!pts.length) return {ok:false, why:"no points"};',
  '  const r=art.getBoundingClientRect();',
  '  const ev=(type,p)=>new PointerEvent(type,{clientX:r.left+(p[0]+0.5)*zoom, clientY:r.top+(p[1]+0.5)*zoom,',
  '    pointerId:1, pointerType:"mouse", button:0, buttons:type==="pointerup"?0:1, isPrimary:true, bubbles:true});',
  '  art.dispatchEvent(ev("pointerdown",pts[0]));',
  '  for(const p of pts.slice(1)) stage.dispatchEvent(ev("pointermove",p));',
  '  stage.dispatchEvent(ev("pointerup",pts[pts.length-1]));',
  '  return {ok:true, points:pts.length, tool};',
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
const codeLines = kit.lines(code);

/* THE CONTROLS EXIST ONCE, IN THE STRIP, BETWEEN THE COLOUR AND THE BRUSH
   ROWS, WITH A TITLE EACH - and the two glyph buttons carry a name. */
for (const id of ['ppbtn', 'symh', 'symv', 'symgd', 'strokeopts'])
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const bar = markup.indexOf('<div class="opts" id="optsbar">'), end = markup.indexOf('<div id="fillrows"', bar);
  if (bar < 0 || end < 0) throw new Error('could not bound #optsbar');
  const strip = markup.slice(bar, end);
  const cur = strip.indexOf('id="curhex"'), grp = strip.indexOf('<div id="strokeopts">'), rows = strip.indexOf('<div id="brushrows">');
  if (!(cur < grp && grp < rows)) throw new Error('the stroke options are not between the colour and the brush rows');
  for (const id of ['ppbtn', 'symh', 'symv']) {
    const at = strip.indexOf('id="' + id + '"');
    if (at < grp || at > rows) throw new Error(id + ' is not inside #strokeopts');
    const tag = strip.slice(at, strip.indexOf('>', at));
    if (tag.indexOf('title="') < 0) throw new Error(id + ' has no title');
    if (tag.indexOf('aria-pressed="false"') < 0) throw new Error(id + ' does not start off');
    if (id !== 'ppbtn' && tag.indexOf('aria-label="') < 0) throw new Error(id + ' is a glyph with no name');
  }
}
if (code.indexOf("  $('strokeopts').hidden=$('brushrows').hidden;") < 0)
  throw new Error('the stroke options do not hide with the brush rows');
if (text.indexOf('.opts #strokeopts{display:flex; align-items:center; gap:4px;}') < 0)
  throw new Error('the stroke options have no layout rule');
/* The guide layer is under pending text and over the effect preview. */
if (text.indexOf('#symgd{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;}') < 0)
  throw new Error('the guide layer has no rule');
if (text.indexOf('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;') < 0)
  throw new Error('the text layer is no longer above the guides');
if (markup.indexOf('<canvas id="fxpv"></canvas><canvas id="symgd"></canvas><canvas id="txpv"></canvas>') < 0)
  throw new Error('the guide canvas is not between the effect preview and the text layer');

/* STROKE CALLS dabSym FOR BOTH TOOLS AND dab FOR NEITHER. */
{
  const r = kit.inFunction(codeLines, 'function stroke(e){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf("if(tool==='pencil') dabSym(p.x,p.y,rgb,255);") < 0) throw new Error('the pencil does not go through dabSym');
  if (body.indexOf("else if(tool==='eraser') dabSym(p.x,p.y,[0,0,0],0);") < 0) throw new Error('the eraser does not go through dabSym');
  if (/[^A-Za-z]dab\(/.test(body)) throw new Error('stroke still calls dab directly');
  /* Small: the rasteriser and everything else in stroke() is as it was. */
  if (r.end - r.start !== 12) throw new Error('stroke() is ' + (r.end - r.start + 1) + ' lines; the edit was meant to be two');
}
/* THE RULE IS PIXELORAMA'S: its vectors, its order, only at brush 1, the
   restore before the history swap, and a stream per mirror. */
if (code.indexOf('const PP_NEIGHBOURS=[[0,1],[1,0],[-1,0],[0,-1]], PP_CORNERS=[[1,1],[-1,-1],[-1,1],[1,-1]];') < 0)
  throw new Error('the neighbour and corner vectors are not Drawers.gd\'s');
{
  const r = kit.inFunction(codeLines, 'function ppDab(i,x,y,rgb,a){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');
  const restore = body.indexOf('putPx(nb[0],nb[1],nb[2],nb[3],nb[4],nb[5]);'), keep = body.indexOf('h[0]=corner;');
  if (restore < 0 || keep < 0 || keep < restore) throw new Error('the elbow is not put back before the corner takes its slot');
  if (body.indexOf('const was=ctx.getImageData(x,y,1,1).data;') > body.indexOf('dab(x,y,rgb,a);'))
    throw new Error('what was under the pixel is read after it is painted');
  /* push, paint, THEN pop_front - Drawers.gd's order. */
  if (body.indexOf('const corner=h.shift(), nb=h[0];') < body.indexOf('dab(x,y,rgb,a);'))
    throw new Error('the history is consulted before the pixel is painted');
}
{
  const r = kit.inFunction(codeLines, 'function dabSym(x0,y0,rgb,a){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('if(pixelPerfectOn()&&brush===1){') < 0) throw new Error('pixel perfect is not confined to a brush of 1');
  if (body.indexOf('if(!selAllows(x0,y0)) return;') < 0) throw new Error('a dab outside the selection is not refused whole');
  if (body.indexOf('ppDab(i,c[0],c[1],rgb,a)') < 0) throw new Error('the mirrors do not get their own streams');
}
{
  const r = kit.inFunction(codeLines, 'function mirrorCells(x0,y0,ev){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('if(h){ out.push([W-1-x0-ev,y0]); if(v) out.push([W-1-x0-ev,H-1-y0-ev]); }') < 0
    || body.indexOf('if(v) out.push([x0,H-1-y0-ev]);') < 0)
    throw new Error('the mirror order is not get_mirrored_positions\'s');
}
/* THE HISTORY IS EMPTIED WHERE A STROKE BEGINS, and only there. */
{
  const r = kit.inFunction(codeLines, 'function beginStroke(e){');
  kit.only(codeLines, l => l === '  painting=true; lastCell=null; ppReset();', 'the reset at the start of a stroke', r);
  /* Once as a call. The definition is `ppReset(){`, which this does not match. */
  if (code.split('ppReset();').length !== 2) throw new Error('ppReset is called somewhere other than the start of a stroke');
}
/* THE GUIDES ARE NEVER ART: symDraw touches its own canvas and reads ctx only
   to know whether anything is open. And they follow the zoom. */
{
  const r = kit.inFunction(codeLines, 'function symDraw(){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');
  if (/ctx\./.test(body)) throw new Error('the guide draws on the artwork');
  if (body.indexOf('c.strokeStyle="#5f2bc3"; c.lineWidth=2;') < 0) throw new Error('the guide is not Pixelorama\'s colour and width');
  const z = kit.inFunction(codeLines, 'function applyZoom(){');
  kit.only(codeLines, l => l === '  symDraw();', 'symDraw in applyZoom', z);
}
/* WIRED, AND REACHABLE WITHOUT A MOUSE. */
if (code.indexOf("$('ppbtn').onclick=()=>{ toggle('ppbtn'); strokeOptsSave(); };") < 0) throw new Error('Perfect is not wired');
if (code.indexOf("for(const id of ['symh','symv']) $(id).onclick=()=>{ toggle(id); symDraw(); strokeOptsSave(); };") < 0)
  throw new Error('the mirrors are not wired');
if (code.indexOf('PB.strokeOpts=function(o){') < 0) throw new Error('PB.strokeOpts is missing');
if (code.indexOf('PB.stroke=function(points,opts){') < 0) throw new Error('PB.stroke is missing');
{
  const s = code.slice(code.indexOf('PB.stroke=function(points,opts){'), code.indexOf('PB.text=function(o){'));
  if (s.indexOf('art.dispatchEvent(ev("pointerdown",pts[0]));') < 0) throw new Error('PB.stroke does not press where a mouse presses');
  if (/[^A-Za-z]dab\(|dabSym\(/.test(s)) throw new Error('PB.stroke paints by a private path');
}
/* NO KEY WAS TAKEN. */
{
  const a = code.indexOf('const SHORTCUTS=['); if (a < 0) throw new Error('no shortcut table');
  const t = code.slice(a, code.indexOf('];', a) + 2);
  if (/ppbtn|symh|symv|strokeOpts/.test(t)) throw new Error('a key was bound; Pixelorama binds none');
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
