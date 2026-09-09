/* SELECTIONS, PORTED FROM PIXELORAMA.

   Sources, read in full before a line of this was written:
     src/Tools/BaseSelectionTool.gd            modes, modifiers, the move
     src/Tools/SelectionTools/RectSelect.gd    the drag rect, Shift/Ctrl/Alt
     src/Tools/SelectionTools/EllipseSelect.gd the same rect, filled as an ellipse
     src/Tools/SelectionTools/Lasso.gd         a polyline, then point-in-polygon
     src/Tools/SelectionTools/MagicWand.gd     a flood, 4-connected, with tolerance
     src/Tools/SelectionTools/ColorSelect.gd   every pixel within tolerance
     src/Classes/SelectionMap.gd               the map itself: an LA8 image
     src/Classes/FloodFillObject.gd            the scanline flood the wand uses
     src/Autoload/DrawingAlgos.gd              get_ellipse_points(_filled), similar_colors
     src/UI/Canvas/Selection.gd                select_all, invert, clear, delete, the ants
     src/UI/Canvas/TransformationHandles.gd    begin_transform: what a move lifts

   Pixelorama holds the selection as an image the size of the project, alpha
   1 where selected. Here it is selMask, the Uint8Array patch359 left for
   exactly this: dab() and the Adjust panel already honour it, and floodFill
   learns to below. One rail tool, Select (W), whose shape - rectangle,
   ellipse, lasso, magic wand, by colour - and mode - replace, add, subtract,
   intersect - live in a Selection panel (K), the same shape as the
   Transform tool and its panel. Shift, Ctrl and both together are the
   modifiers Pixelorama binds to add, subtract and intersect, read at the
   press as BaseSelectionTool.draw_start reads them.

   The marching ants are drawn on their own layer at SCREEN resolution, one
   pixel wide inside the boundary, black and white stripes sliding one
   period a second - which is what Pixelorama's MarchingAntsOutline shader
   does with frequency = zoom*10*size/64 and uv -= time/frequency.

   Moving: a press inside the selection with no modifier lifts the selected
   pixels (begin_transform: they are cut out of the layer and carried), the
   drag shows them on a layer over the art, and the release blits them back
   through their own alpha as a mask (transform_content_confirm's
   blit_rect_mask(src, src, ...)), so transparent pixels inside a moved
   selection do not punch holes where they land. One undo step.

   NOT PORTED, and said so rather than substituted: rotation, scaling and
   shearing of the selection (the transformation handles), the Position and
   Size sliders, the resampling algorithm, tile mode, mirroring, grid and
   guide snapping, the stabilizer, the polygon and paint selection tools,
   cut/copy/paste, "new brush from selection", reselect, select cel area,
   expand/shrink/border. Selection changes are not on the undo stack here:
   the stack holds ImageData and nothing else, and teaching it to hold a
   mask is a change to undo, not to selection. A selection that moves off
   the canvas is clipped rather than kept in a negative offset.
*/
const fs = require('fs');
const path = require('path');

/* PB_INDEX lets this run against a copy - the live file is being served to a
   test run more often than not, and a patch that lands mid-run contaminates
   every test after it. */
const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const KIT = ['C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs',
  path.join(path.dirname(FILE), 'tools', 'patchkit.cjs')].find(p => fs.existsSync(p));
if (!KIT) throw new Error('patchkit.cjs not found beside the repo or the target');
const kit = require(KIT);

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
/* A long stretch of script, written once as a template and re-joined on the
   file's own line ending - a "\n" inside a CRLF file is the silent no-op
   patchkit's header describes. */
const src = s => s.replace(/^\n/, '').replace(/\n$/, '').split('\n').join(NL);

/* Archived, not runnable twice. */
if (text.indexOf('id="sescrim"') >= 0) throw new Error('the selection panel is already in this file');

/* ---- 1. two layers over the art ---------------------------------------- */
/* semv carries the pixels a move is dragging, at the art's own resolution,
   pixelated like every other art-resolution layer. sepv is the ants, at
   SCREEN resolution and covering only the visible part of the art, because a
   one-pixel outline drawn into an art-resolution canvas is a zoom-pixels
   thick block, and a screen-resolution canvas the size of the whole art is
   61,440 pixels wide at 48x on a 1280 canvas. Both sit at 5 with the effect
   preview and after it in the document, so they paint over it; text at 6
   stays on top of everything, as text.spec.js pins. */
swap(block([
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
  '  image-rendering:pixelated;}',
]), block([
  '/* The selection\'s two layers. semv is the pixels a move is carrying, at the',
  '   art\'s resolution; sepv is the marching ants at SCREEN resolution over the',
  '   visible part of the art only, because a one-pixel line into an',
  '   art-resolution canvas is a block zoom pixels thick, and a screen-resolution',
  '   canvas over ALL of the art is 61,440 pixels wide at 48x on a 1280 canvas. */',
  '#semv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
  '#sepv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;}',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
  '  image-rendering:pixelated;}',
]));
swap('<canvas id="txpv"></canvas>', '<canvas id="semv"></canvas><canvas id="sepv"></canvas><canvas id="txpv"></canvas>');

/* ---- 2. the rail: a tool and a panel ----------------------------------- */
swap('    <!-- rail:tools -->', block([
  '    <!-- Select: the shape it draws and the mode it combines with are in the',
  '         Selection panel below, the way Move and Transform are one tool and',
  '         one panel. -->',
  '    <button class="tool" data-tool="select" aria-pressed="false" title="Select (W): drag on the art. Shift adds, Ctrl takes away, both together keep the overlap. Drag inside a selection to move it."><svg viewBox="0 0 24 24"><path d="M5 5h4M11 5h4M17 5h2v2M19 9v4M19 15v2h-2M15 19h-4M9 19H7M5 19v-2M5 15v-4M5 9V7"/></svg><span class="k">W</span></button>',
  '    <!-- rail:tools -->',
]));
swap('    <!-- rail:more -->', block([
  '    <button class="tool" id="sebtn" aria-expanded="false" title="Selection (K): shape, mode, tolerance, and what to do with it"><svg viewBox="0 0 24 24"><path d="M4 4h6M14 4h6v6M20 14v6h-6M10 20H4v-6M4 10V4"/><path d="m9 9 6 6M15 9l-6 6"/></svg><span class="k">K</span></button>',
  '    <!-- rail:more -->',
]));

/* ---- 3. the panel ------------------------------------------------------ */
swap('<!-- panels:more -->', block([
  '<!-- The selection: which shape the Select tool draws, how it combines with',
  '     what is already selected, and the things you can do to a selection.',
  '     Pixelorama\'s tool options and its Edit menu, in one card. -->',
  '<div class="scrim pop" id="sescrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="setitle">',
  '    <h2 id="setitle">Selection</h2>',
  '    <p class="sub">Pick a shape, then drag on the art with the Select tool (W). Shift adds, Ctrl takes away, both together keep the overlap. Drag inside a selection to move it.</p>',
  '    <div class="olrow"><label>Shape</label>',
  '      <div class="chips" id="seshape" role="group" aria-label="Selection shape">',
  '        <button data-v="rect" aria-pressed="true" title="Drag a rectangle. Shift while dragging makes it square, Ctrl grows it from the centre, Alt slides it">Rect</button>',
  '        <button data-v="ellipse" aria-pressed="false" title="Drag an ellipse. The same Shift, Ctrl and Alt as the rectangle">Ellipse</button>',
  '        <button data-v="lasso" aria-pressed="false" title="Draw a loop; everything inside it is selected">Lasso</button>',
  '        <button data-v="wand" aria-pressed="false" title="Click a colour to select the patch it belongs to - the pixels touching it, side to side, within the tolerance">Wand</button>',
  '        <button data-v="colour" aria-pressed="false" title="Click a colour to select it everywhere on the canvas, within the tolerance">Colour</button></div></div>',
  '    <div class="olrow"><label>Mode</label>',
  '      <div class="chips" id="semode" role="group" aria-label="How a new selection combines with the old one">',
  '        <button data-v="replace" aria-pressed="true" title="The new selection replaces the old one">Replace</button>',
  '        <button data-v="add" aria-pressed="false" title="Added to the old one (Shift while pressing)">Add</button>',
  '        <button data-v="subtract" aria-pressed="false" title="Taken away from the old one (Ctrl while pressing)">Subtract</button>',
  '        <button data-v="intersect" aria-pressed="false" title="Only where the two overlap (Shift and Ctrl while pressing)">Intersect</button></div></div>',
  '    <div class="olrow"><label for="setol" title="How far a pixel may differ from the one you click, per channel, 0 to 255 - the wand and the colour pick use it. 0 is an exact match, which is where Pixelorama starts">Tolerance</label>',
  '      <input type="number" id="setol" value="0" min="0" max="255" step="1" style="width:72px" title="0 is an exact match; 255 is every colour"></div>',
  '    <p class="note" id="senote">Nothing selected.</p>',
  '    <div class="savebar" style="margin-top:14px; flex-wrap:wrap">',
  '      <button class="btn ghost" id="seall" title="Select every pixel (Ctrl+A)">All</button>',
  '      <button class="btn ghost" id="senone" title="Drop the selection (Ctrl+D, or Escape while Select is the tool)">None</button>',
  '      <button class="btn ghost" id="seinv" title="Select what is not selected (Ctrl+I)">Invert</button>',
  '      <button class="btn ghost" id="sedel" title="Make the selected pixels transparent, and drop the selection (Delete)" disabled>Delete</button>',
  '      <button class="btn ghost" id="sefill" title="Paint every selected pixel the colour you are painting with" disabled>Fill</button>',
  '      <button class="btn ghost" id="seclose">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<!-- panels:more -->',
]));

/* ---- 4. keys ----------------------------------------------------------- */
/* Pixelorama's own: Ctrl+A select all, Ctrl+D clear, Ctrl+I invert, Delete.
   The bare letters are this rail's: W for the tool, K for the panel, both
   free. Escape deselects only when nothing is layered over the editor -
   this row sits ABOVE the panel-closing rows in the table and first match
   wins, so it has to step aside for them itself. */
swap('  /* shortcuts:more */', block([
  "  {show:'W', desc:'Select: drag a rectangle, ellipse or lasso, or click a colour', keys:['w'], run:()=>selectTool('select')},",
  "  {show:'K', desc:'Selection: shape, mode and actions', keys:['k'], run:()=>railPanel('se',$('sescrim').hidden)},",
  "  {show:'Ctrl+A', desc:'Select all', prevent:true,",
  "    match:e=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='a', run:()=>selAll()},",
  "  {show:'Ctrl+D', desc:'Deselect', prevent:true,",
  "    match:e=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='d', run:()=>selNone()},",
  "  {show:'Ctrl+I', desc:'Invert the selection', prevent:true,",
  "    match:e=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='i', run:()=>selInvert()},",
  "  {show:'Delete', desc:'Make the selected pixels transparent', prevent:true,",
  "    match:e=>e.key==='Delete'&&!!selMask, run:()=>selDelete()},",
  "  {show:'Esc', desc:'Deselect, while Select is the tool and no panel is open', prevent:true,",
  "    match:e=>e.key==='Escape'&&tool==='select'&&!!selMask&&!selLayered(), run:()=>selNone()},",
  '  /* shortcuts:more */',
]));

/* ---- 5. the fill honours the selection --------------------------------- */
/* Pixelorama's bucket floods with selection_matters, and the flood cannot
   cross an unselected pixel any more than it can cross a different colour:
   the selection is a wall, not a stencil laid over the result afterwards.
   A seed outside the selection fills nothing, which the caller already
   reports as "Nothing to fill there". */
swap(block([
  '  const joins=function(i){',
  '    const on=d[i+3]>=128;',
]), block([
  '  const joins=function(i){',
  '    /* The selection is a wall the flood cannot cross, which is how',
  '       Pixelorama\'s bucket treats it - not a stencil over the result. */',
  '    if(selMask&&selMask[i>>2]!==1) return false;',
  '    const on=d[i+3]>=128;',
]));

/* ---- 6. a new canvas, or one of a new size, has no selection ------------ */
swap("  const opv=$('olpv'); opv.width=w; opv.height=h; opv.style.display='none';", block([
  "  const opv=$('olpv'); opv.width=w; opv.height=h; opv.style.display='none';",
  '  selReset();  /* a mask is the size of the canvas it was made on */',
]));
swap('    const qpv=$("qapv"); if(qpv){ qpv.width=im.width; qpv.height=im.height; }', block([
  '    const qpv=$("qapv"); if(qpv){ qpv.width=im.width; qpv.height=im.height; }',
  '    /* The mask indexes by width, so a canvas of another size makes every',
  '       selAllows answer wrong - and painting would silently stop. */',
  '    selReset();',
]));
/* Zoom moves both layers: the ants, and a lift in progress, whose CSS size
   is set when it is drawn and would otherwise stay at the old zoom until the
   next pointer move. */
/* Anchored on the CLOSE of the zoom function and the opening of the next,
   not on paintCursor() being its last line: pixelperfect adds a symDraw()
   after paintCursor() there, and any other patch may add its own. The two
   lines go in just before the brace, whatever else is above them. */
swap(block([
  '}',
  'function setZoom(z,anchor,fine){',
]), block([
  '  selDraw(true); if(seLift) seLiftDraw();',
  '}',
  'function setZoom(z,anchor,fine){',
]));

/* ---- 7. the tool ------------------------------------------------------- */
swap('/* panels:register */', block([
  '/* panels:register */',
  'RAIL_PANELS.push("se");',
  '',
  src(`
/* ---- selections, from Pixelorama -------------------------------------------

   Tools/BaseSelectionTool.gd and SelectionTools/{RectSelect,EllipseSelect,
   Lasso,MagicWand,ColorSelect}.gd, with the map from Classes/SelectionMap.gd
   and the operations from UI/Canvas/Selection.gd. The map there is an LA8
   image the size of the project; here it is selMask, and a mask with
   nothing in it is null, which is Pixelorama's has_selection =
   !selection_map.is_invisible() - so a subtraction that empties the
   selection leaves no selection, not an empty one.

   Selection changes are not undoable here. The undo stack holds ImageData
   and nothing else, and every pixel operation below goes through
   snapshot() exactly as the others do. */
let seDrag=null;      /* the stroke in progress: shape, mode, rect or points */
let seLift=null;      /* the pixels a move is carrying */
let seRedoWas=null, seDropped=null;
let selVer=0;         /* bumped on every mask change; the ants path is cached against it */
let selPath=null, selPathKey='', selRaf=0, selDrawKey='';

function seTol(){ return Math.max(0,Math.min(255,Math.round(+$('setol').value||0))); }
function selHas(x,y){ return !!selMask&&x>=0&&y>=0&&x<art.width&&y<art.height&&selMask[y*art.width+x]===1; }
function selCount(m){ let n=0; for(let i=0;i<m.length;i++) if(m[i]===1) n++; return n; }
function selBounds(m){
  const W=art.width,H=art.height; let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ if(m[y*W+x]!==1) continue;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return x1<0?null:{x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1};
}
/* THE ONE WAY THE MASK IS SET. An empty mask becomes null, so every reader
   of selMask can trust that null means "nothing" and a mask means
   "something", which is what Pixelorama's has_selection promises. */
function selSet(m){
  if(m&&m.length!==art.width*art.height) throw new Error('a mask must be the size of the canvas');
  if(m&&selCount(m)===0) m=null;
  selMask=m; selVer++;
  selDraw(true); seNote();
}
function selReset(){ selMask=null; seDrag=null; seLift=null; selVer++; selPath=null; selPathKey='';
  const a=$('semv'), b=$('sepv'); if(a) a.style.display='none'; if(b) b.style.display='none';
  if(selRaf){ cancelAnimationFrame(selRaf); selRaf=0; } seNote(); }
/* Anything over the editor: every overlay here is a .scrim hidden by its
   attribute - the rail panels, the outline and shortcut panels, the sign-in
   wall, the pixel and review scrims - plus the account menu, which is not.
   Escape belongs to whichever of those is up before it belongs to the
   selection. */
function selLayered(){
  return [...document.querySelectorAll('.scrim')].some(s=>!s.hidden) || !$('acctpanel').hidden;
}

/* ---- the shapes, as Pixelorama computes them ------------------------------ */

/* RectSelect._get_result_rect. The +1 is theirs: a press and release on the
   same cell is a 1x1 selection, and the rect runs from origin to dest
   INCLUSIVE. With Shift the rect is the largest square that fits the drag,
   anchored at the origin corner; with Ctrl the origin is the centre and the
   drag is a half-size; with both, a square from the centre whose half-size
   is the LONGER leg - and note it then ignores the drag's direction, which is
   theirs too. */
function seRect(o,d,square,centre){
  let ox=o.x, oy=o.y, dx=d.x, dy=d.y;
  if(centre){
    let nx=dx-ox, ny=dy-oy;
    if(square){ const s=Math.max(Math.abs(nx),Math.abs(ny)); nx=s; ny=s; }
    ox-=nx; oy-=ny; dx=ox+2*nx; dy=oy+2*ny;
  }
  let x,y,w,h;
  if(square){
    const s=Math.min(Math.abs(ox-dx),Math.abs(oy-dy));
    x= ox<dx ? ox : ox-s; y= oy<dy ? oy : oy-s; w=s; h=s;
  } else { x=Math.min(ox,dx); y=Math.min(oy,dy); w=Math.abs(ox-dx); h=Math.abs(oy-dy); }
  return {x, y, w:w+1, h:h+1};
}
/* DrawingAlgos.get_ellipse_points(Vector2i.ZERO, size): Bresenham's ellipse
   by Zingl, four quadrant points a step. The (b+1)/2 is integer division in
   GDScript and stays one here. Every arithmetic line is theirs in order,
   because an ellipse algorithm that is "basically the same" puts its
   corner pixels somewhere else. */
function seEllipsePts(w,h){
  const out=[]; let x0=0, x1=w-1, y0=0, y1=h-1;
  let a=Math.abs(x1-x0), b=Math.abs(y1-y0), b1=b&1;
  let dx=4*(1-a)*b*b, dy=4*(b1+1)*a*a, err=dx+dy+b1*a*a, e2=0;
  if(x0>x1){ x0=x1; x1+=a; }
  if(y0>y1) y0=y1;
  y0+=Math.floor((b+1)/2); y1=y0-b1; a*=8*a; b1=8*b*b;
  while(x0<=x1){
    out.push([x1,y0],[x0,y0],[x0,y1],[x1,y1]);
    e2=2*err;
    if(e2<=dy){ y0+=1; y1-=1; dy+=a; err+=dy; }
    if(e2>=dx||2*err>dy){ x0+=1; x1-=1; dx+=b1; err+=dx; }
  }
  while(y0-y1<b){ out.push([x0-1,y0],[x1+1,y0],[x0-1,y1],[x1+1,y1]); y0+=1; y1-=1; }
  return out;
}
/* DrawingAlgos.get_ellipse_points_filled, thickness 1: scan one quadrant,
   start filling after the first border pixel in a column, stop at the next,
   and mirror each filled cell into the other three. Theirs uses
   Array.has on the border - O(n) a lookup - so this keeps a Set of the same
   keys; same answer, less waiting on a 1280 canvas. */
function seEllipseFilled(w,h){
  const border=seEllipsePts(w,h), has=new Set(border.map(p=>p[0]+','+p[1])), fill=[];
  for(let x=1;x<Math.ceil(w/2);x++){
    let f=false, prev=false;
    for(let y=0;y<Math.ceil(h/2);y++){
      const bit=has.has(x+','+y);
      if(bit&&!f){ prev=true; continue; }
      if(!bit&&(f||prev)){
        fill.push([x,y],[x,h-y-1],[w-x-1,y],[w-x-1,h-y-1]);
        if(prev){ f=true; prev=false; }
      } else if(bit&&f) break;
    }
  }
  return border.concat(fill);
}
/* Godot's Geometry2D.bresenham_line, both ends included. */
function seBresenham(a,b){
  const pts=[]; let cx=a[0], cy=a[1];
  const dx=Math.abs(b[0]-a[0])*2, dy=Math.abs(b[1]-a[1])*2, sx=Math.sign(b[0]-a[0]), sy=Math.sign(b[1]-a[1]);
  if(dx>dy){ let err=dx>>1; for(;cx!==b[0];cx+=sx){ pts.push([cx,cy]); err-=dy; if(err<0){ cy+=sy; err+=dx; } } }
  else { let err=dy>>1; for(;cy!==b[1];cy+=sy){ pts.push([cx,cy]); err-=dx; if(err<0){ cx+=sx; err+=dy; } } }
  pts.push([cx,cy]);
  return pts;
}
/* Lasso.lasso_selection: every point of the polyline, then every cell of
   the bounding box that Geometry2D.is_point_in_polygon says is inside -
   the even-odd rule, cast as a scanline so a loop round a 1280 canvas is
   rows x edges rather than cells x edges. A cell x on row y is inside when
   an odd number of edge crossings lie strictly to its right, which is the
   crossing rule Godot's test applies one point at a time; between sorted
   crossings c0 < c1 that is x in [ceil(c0), ceil(c1)-1]. */
function seFillPoly(region,W,H,pts){
  let bx0=pts[0][0], by0=pts[0][1], bx1=bx0, by1=by0;
  for(const p of pts){
    if(p[0]<bx0)bx0=p[0]; if(p[0]>bx1)bx1=p[0]; if(p[1]<by0)by0=p[1]; if(p[1]>by1)by1=p[1];
    if(p[0]>=0&&p[1]>=0&&p[0]<W&&p[1]<H) region[p[1]*W+p[0]]=1;
  }
  const n=pts.length, xs=[];
  for(let y=Math.max(0,by0);y<=Math.min(H-1,by1);y++){
    xs.length=0;
    for(let i=0,j=n-1;i<n;j=i++){
      const xi=pts[i][0], yi=pts[i][1], xj=pts[j][0], yj=pts[j][1];
      if((yi>y)!==(yj>y)) xs.push((xj-xi)*(y-yi)/(yj-yi)+xi);
    }
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2){
      const a=Math.max(0,Math.ceil(xs[k])), b=Math.min(W-1,Math.ceil(xs[k+1])-1);
      for(let x=a;x<=b;x++) region[y*W+x]=1;
    }
  }
}
/* DrawingAlgos.similar_colors, in bytes: every channel within tol, alpha
   included, so a transparent pixel is not the colour of an opaque one.
   Theirs shortcuts on is_equal_approx and refuses at tol 0, which in bytes
   is exactly |d| <= 0. Pixelorama's slider runs 0..255 and its default
   0.003 is below one byte, so 0 here is where it starts. */
function seSimilar(d,i,seed,tol){
  return Math.abs(d[i]-seed[0])<=tol&&Math.abs(d[i+1]-seed[1])<=tol
      &&Math.abs(d[i+2]-seed[2])<=tol&&Math.abs(d[i+3]-seed[3])<=tol;
}
/* MagicWand._flood_fill: FloodFillObject is Shawn Hargreaves' scanline
   flood from Allegro - segments, then the rows above and below each - which
   is 4-connected: a pixel touching only at a corner is not reached. The set
   it produces is the 4-connected component of "similar to the SEED colour",
   compared to the seed and never to a neighbour, so the region cannot creep
   along a gradient. That set is what is computed here, by a plainer
   scanline. */
function seFlood(d,W,H,sx,sy,tol){
  const region=new Uint8Array(W*H), i0=(sy*W+sx)*4, seed=[d[i0],d[i0+1],d[i0+2],d[i0+3]];
  const sim=p=>seSimilar(d,p*4,seed,tol);
  const st=[sy*W+sx];
  while(st.length){
    const p=st.pop(); if(region[p]||!sim(p)) continue;
    const y=(p/W)|0; let l=p%W, r=l;
    while(l>0&&!region[y*W+l-1]&&sim(y*W+l-1)) l--;
    while(r<W-1&&!region[y*W+r+1]&&sim(y*W+r+1)) r++;
    for(let k=l;k<=r;k++) region[y*W+k]=1;
    for(const yy of [y-1,y+1]){
      if(yy<0||yy>=H) continue;
      for(let k=l;k<=r;k++){ const q=yy*W+k; if(!region[q]&&sim(q)){ st.push(q); while(k<r&&sim(yy*W+k+1)) k++; } }
    }
  }
  return region;
}
/* ColorSelect.gdshader, per pixel: similar to the clicked colour or not. */
function seByColour(d,W,H,sx,sy,tol){
  const region=new Uint8Array(W*H), i0=(sy*W+sx)*4, seed=[d[i0],d[i0+1],d[i0+2],d[i0+3]];
  for(let i=0;i<W*H;i++) if(seSimilar(d,i*4,seed,tol)) region[i]=1;
  return region;
}
/* How a new region meets the old selection. Replace clears first (every
   tool's apply_selection does), add fills 1, subtract fills 0, intersect
   clears and keeps only what both had - SelectionNode.select_rect and
   each tool's own loop, which all reduce to these four. */
function seCombine(region,mode){
  const n=art.width*art.height, prev=selMask, out=new Uint8Array(n);
  if(mode==='add'){ for(let i=0;i<n;i++) out[i]=(region[i]===1||(prev&&prev[i]===1))?1:0; }
  else if(mode==='subtract'){ for(let i=0;i<n;i++) out[i]=(prev&&prev[i]===1&&region[i]!==1)?1:0; }
  else if(mode==='intersect'){ for(let i=0;i<n;i++) out[i]=(prev&&prev[i]===1&&region[i]===1)?1:0; }
  else out.set(region);
  selSet(out);
}
function seRectRegion(r){
  const W=art.width,H=art.height, region=new Uint8Array(W*H);
  const x0=Math.max(0,r.x), y0=Math.max(0,r.y), x1=Math.min(W-1,r.x+r.w-1), y1=Math.min(H-1,r.y+r.h-1);
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) region[y*W+x]=1;
  return region;
}
/* EllipseSelect.set_ellipse: the filled points at the rect's position,
   those off the canvas skipped. */
function seEllipseRegion(r){
  const W=art.width,H=art.height, region=new Uint8Array(W*H);
  for(const p of seEllipseFilled(r.w,r.h)){
    const x=r.x+p[0], y=r.y+p[1];
    if(x<0||y<0||x>=W||y>=H) continue;
    region[y*W+x]=1;
  }
  return region;
}

/* ---- the modifiers, read at the press ------------------------------------- */
/* BaseSelectionTool.draw_start reads the three actions with exact_match, so
   Shift alone is add, Ctrl alone is subtract, both together is intersect,
   and Ctrl+Alt is transform_copy_selection_content - a move that leaves the
   original behind. The panel's mode applies only when no key does
   (apply_selection: "if a shortcut is activated then that will be obeyed
   instead"). The move test uses the KEYS alone: with the panel on Add and
   no key held, a press inside the selection still moves it. */
function seModeAt(e){
  const shift=!!e.shiftKey, ctrl=!!(e.ctrlKey||e.metaKey), alt=!!e.altKey;
  const key = shift&&ctrl&&!alt ? 'intersect' : shift&&!ctrl&&!alt ? 'add' : ctrl&&!shift&&!alt ? 'subtract' : null;
  return {key, mode:key||chipVal('semode')||'replace', quick:ctrl&&alt};
}
function seCursorText(r){
  $('pos').textContent=r.x+', '+r.y+' \\u2192 '+(r.x+r.w-1)+', '+(r.y+r.h-1)+' ('+r.w+', '+r.h+')';
}

/* ---- the stroke ------------------------------------------------------------ */
registerTool('select',{
  down(e,c){
    if(seLift||!ctx) return;
    const m=seModeAt(e), raw=rawCell(e);
    /* Inside the selection with no mode key: a move, not a new selection. */
    if(selMask&&selHas(raw.x,raw.y)&&(!m.key||m.quick)){ seMoveBegin(raw,m.quick); return; }
    const shape=chipVal('seshape')||'rect';
    seDrag={shape, mode:m.mode, start:raw, last:raw, rect:null, square:false, centre:false, displace:false, pts:[], lastPt:null};
    if(shape==='lasso'){ seDrag.pts.push([raw.x,raw.y]); seDrag.lastPt=[raw.x,raw.y]; }
  },
  move(e,c){
    if(seLift){ seMoveDrag(e); return; }
    const D=seDrag; if(!D) return;
    /* The raw cell, off the canvas included: Pixelorama passes the mouse
       position through and lets the map's fill_rect clip it, so a drag that
       leaves the art still selects up to its edge. */
    const raw=rawCell(e);
    if(D.shape==='rect'||D.shape==='ellipse'){
      /* Alt slides the whole rect by however far the pointer moved since
         the last event - RectSelect.draw_move's _start_pos += pos - _offset. */
      if(D.displace){ D.start={x:D.start.x+(raw.x-D.last.x), y:D.start.y+(raw.y-D.last.y)}; }
      D.rect=seRect(D.start,raw,D.square,D.centre);
      seCursorText(D.rect);
      D.last=raw;
    } else if(D.shape==='lasso'){
      const p=[raw.x,raw.y];
      for(const q of seBresenham(D.lastPt,p)) D.pts.push(q);
      D.lastPt=p; D.pts.push(p);
    }
    /* The wand and the colour pick do nothing on the way: they act where
       the button is RELEASED, as their apply_selection(pos) does. */
    selDraw(true);
  },
  up(e){
    if(seLift){ seMoveEnd(e); return; }
    const D=seDrag; seDrag=null; if(!D||!ctx) return;
    if(e&&e.type==='pointercancel'){ selDraw(true); return; }   /* cancel_tool: nothing applied */
    const W=art.width,H=art.height;
    if(D.shape==='rect'||D.shape==='ellipse'){
      /* No movement, no rect: in replace mode that is a click that deselects,
         in the others it is nothing - RectSelect.apply_selection. */
      if(!D.rect){ if(D.mode==='replace') selSet(null); else selDraw(true); return; }
      seCombine(D.shape==='rect'?seRectRegion(D.rect):seEllipseRegion(D.rect), D.mode);
    } else if(D.shape==='lasso'){
      /* Lasso.apply_selection: more than three points makes a loop; three or
         fewer ends with NO selection in every mode, which is theirs - the
         else branch clears if the replace branch did not already. */
      if(D.pts.length>3){ const region=new Uint8Array(W*H); seFillPoly(region,W,H,D.pts); seCombine(region,D.mode); }
      else selSet(null);
    } else {
      const raw=rawCell(e);
      /* Off the canvas: MagicWand and ColorSelect return before touching
         anything, so not even a replace clears. */
      if(raw.x<0||raw.y<0||raw.x>=W||raw.y>=H){ selDraw(true); return; }
      const d=ctx.getImageData(0,0,W,H).data;
      seCombine(D.shape==='wand'?seFlood(d,W,H,raw.x,raw.y,seTol()):seByColour(d,W,H,raw.x,raw.y,seTol()), D.mode);
    }
  },
  select(){ art.style.cursor='crosshair'; seNote(); },
  deselect(){
    /* A tool change mid-drag: the drag is dropped, a lift is put down where
       it is, because carried pixels with no tool to carry them are lost. */
    seDrag=null; if(seLift) seMoveEnd(null);
    art.style.cursor=''; selDraw(true);
  },
});
/* RectSelect._input: Shift, Ctrl and Alt PRESSED during the drag, once the
   rect has area, turn square, centre and displace on; released, off. The
   keys held at the press were already spent on the mode, which is why
   these are transitions and not states. */
addEventListener('keydown',e=>{
  const D=seDrag; if(!D||seLift||e.repeat||!D.rect||!(D.shape==='rect'||D.shape==='ellipse')) return;
  if(e.key==='Shift') D.square=true; else if(e.key==='Control') D.centre=true; else if(e.key==='Alt') D.displace=true; else return;
  e.preventDefault();
});
addEventListener('keyup',e=>{
  const D=seDrag; if(!D) return;
  if(e.key==='Shift') D.square=false; else if(e.key==='Control') D.centre=false; else if(e.key==='Alt') D.displace=false;
});
/* Over the selection the cursor says it can be moved, as Pixelorama's does. */
art.addEventListener('pointermove',e=>{
  if(tool!=='select'||seDrag||seLift) return;
  const c=rawCell(e); art.style.cursor=selHas(c.x,c.y)?'move':'crosshair';
});

/* ---- moving ---------------------------------------------------------------- */
/* TransformationHandles.begin_transform: the selected pixels are copied out
   through the mask and the layer is cleared where that copy is opaque; the
   copy rides on its own layer during the drag; transform_content_confirm
   blits it back with ITSELF as the mask, so a transparent pixel inside the
   selection does not overwrite what it lands on. Quick copy (Ctrl+Alt)
   skips the clearing. The snapshot is taken at the press and given back if
   the drag ends where it began, the same bargain the transform tool makes. */
function seMoveBegin(raw,quick){
  const W=art.width, b=selBounds(selMask); if(!b) return;
  seRedoWas=redoStack.slice(); seDropped=snapshot();
  const img=ctx.getImageData(b.x0,b.y0,b.w,b.h), s=img.data, mask=new Uint8Array(b.w*b.h);
  const cut=quick?null:ctx.getImageData(b.x0,b.y0,b.w,b.h), cd=cut?cut.data:null;
  for(let y=0;y<b.h;y++) for(let x=0;x<b.w;x++){
    const k=y*b.w+x, p=k*4;
    if(selMask[(b.y0+y)*W+b.x0+x]!==1){ s[p]=s[p+1]=s[p+2]=s[p+3]=0; continue; }
    mask[k]=1;
    if(cd&&s[p+3]>0){ cd[p]=cd[p+1]=cd[p+2]=cd[p+3]=0; }
  }
  if(cut) ctx.putImageData(cut,b.x0,b.y0);
  seLift={img, mask, x:b.x0, y:b.y0, w:b.w, h:b.h, from:raw, dx:0, dy:0, quick:!!quick};
  seLiftDraw(); selDraw(true);
}
function seMoveDrag(e){
  const L=seLift, raw=rawCell(e);
  let dx=raw.x-L.from.x, dy=raw.y-L.from.y;
  /* transform_snap_axis, Shift while dragging: whichever axis the drag is
     nearer to, within 45 degrees, is the only one that moves. */
  if(e.shiftKey&&(dx||dy)){
    const ang=Math.abs(Math.atan2(dy,dx));
    if(ang<=Math.PI/4||ang>=3*Math.PI/4) dy=0; else dx=0;
  }
  L.dx=dx; L.dy=dy;
  seLiftDraw(); selDraw(true);
  $('pos').textContent=(dx>=0?'+':'')+dx+', '+(dy>=0?'+':'')+dy;
}
function seMoveEnd(e){
  const L=seLift; seLift=null; if(!L) return;
  const W=art.width,H=art.height;
  $('semv').style.display='none';
  /* Ended where it began: not an edit. The pixels are put back from the
     snapshot rather than re-blitted, so the bytes are what they were. */
  if(!L.dx&&!L.dy){ ctx.putImageData(undoStack[undoStack.length-1],0,0); dropSnapshot(seRedoWas,seDropped); seRedoWas=seDropped=null; selDraw(true); return; }
  const img=ctx.getImageData(0,0,W,H), d=img.data, s=L.img.data, nm=new Uint8Array(W*H);
  for(let y=0;y<L.h;y++) for(let x=0;x<L.w;x++){
    const k=y*L.w+x; if(L.mask[k]!==1) continue;
    const nx=L.x+x+L.dx, ny=L.y+y+L.dy;
    if(nx<0||ny<0||nx>=W||ny>=H) continue;    /* what leaves the canvas is gone */
    nm[ny*W+nx]=1;
    const si=k*4; if(s[si+3]===0) continue;    /* its own alpha is the mask */
    const di=(ny*W+nx)*4; d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=s[si+3];
  }
  ctx.putImageData(img,0,0);
  seRedoWas=seDropped=null;
  selSet(nm);
  refreshStats(); repalette();
  toast((L.quick?'Copied ':'Moved ')+L.dx+', '+L.dy+' cells');
}
/* The carried pixels, on their own layer at the art's resolution. Never on
   ctx: the art keeps the hole until the release, and putting the copy on
   the artwork every frame would make each frame an edit. */
function seLiftDraw(){
  const L=seLift, pv=$('semv'); if(!L||!pv) return;
  const W=art.width,H=art.height;
  pv.width=W; pv.height=H;
  pv.getContext('2d').putImageData(L.img,L.x+L.dx,L.y+L.dy);
  pv.style.width=(W*zoom)+'px'; pv.style.height=(H*zoom)+'px'; pv.style.display='block';
}

/* ---- the operations, UI/Canvas/Selection.gd ---------------------------- */
function selAll(){ if(!ctx) return; const m=new Uint8Array(art.width*art.height); m.fill(1); selSet(m); }
function selNone(){ selSet(null); }
/* invert: every pixel flips, so inverting nothing selects everything. */
function selInvert(){ if(!ctx) return; const n=art.width*art.height, m=new Uint8Array(n); for(let i=0;i<n;i++) m[i]=(selMask&&selMask[i]===1)?0:1; selSet(m); }
/* delete: the selected pixels become clear, and the selection goes with
   them - theirs ends with clear_selection(). With nothing selected
   Pixelorama clears the whole layer; here that is refused, because a bare
   Delete key wiping a trait with no confirmation is not a feature. */
function selDelete(){
  if(!ctx||!selMask){ toast('Nothing selected'); return false; }
  const W=art.width,H=art.height, redoWas=redoStack.slice(), dropped=snapshot();
  const img=ctx.getImageData(0,0,W,H), d=img.data; let changed=false;
  for(let i=0;i<W*H;i++){ if(selMask[i]!==1) continue; const p=i*4;
    if(d[p]|d[p+1]|d[p+2]|d[p+3]){ changed=true; d[p]=d[p+1]=d[p+2]=d[p+3]=0; } }
  if(!changed){ dropSnapshot(redoWas,dropped); selSet(null); toast('Already clear'); return false; }
  ctx.putImageData(img,0,0);
  selSet(null); refreshStats(); repalette(); toast('Selection cleared');
  return true;
}
/* fill: every selected pixel becomes the painting colour, opaque. This one
   has no Pixelorama counterpart; it is here because the brief asked for it,
   and it keeps the selection so the next stroke can go on inside it. */
function selFill(){
  if(!ctx||!selMask){ toast('Nothing selected'); return false; }
  const W=art.width,H=art.height, rgb=hx2(color), redoWas=redoStack.slice(), dropped=snapshot();
  const img=ctx.getImageData(0,0,W,H), d=img.data; let changed=false;
  for(let i=0;i<W*H;i++){ if(selMask[i]!==1) continue; const p=i*4;
    if(d[p]!==rgb[0]||d[p+1]!==rgb[1]||d[p+2]!==rgb[2]||d[p+3]!==255){ changed=true; d[p]=rgb[0]; d[p+1]=rgb[1]; d[p+2]=rgb[2]; d[p+3]=255; } }
  if(!changed){ dropSnapshot(redoWas,dropped); toast('Already that colour'); return false; }
  ctx.putImageData(img,0,0);
  refreshStats(); repalette(); toast('Selection filled');
  return true;
}
function seNote(){
  const n=$('senote'); if(!n) return;
  const b=selMask?selBounds(selMask):null;
  n.textContent = b ? selCount(selMask).toLocaleString()+' pixels selected, '+b.w+'\\u00d7'+b.h+' at '+b.x0+', '+b.y0 : 'Nothing selected.';
  for(const id of ['sedel','sefill']){ const e=$(id); if(e) e.disabled=!selMask; }
}

/* ---- the marching ants ------------------------------------------------- */
/* The boundary as runs of cell edges, merged along their length so a dash
   pattern flows along a side rather than restarting every cell. Each run is
   [x0,y0,x1,y1,side]: side +1 means the selected cell is to the right of a
   vertical run or below a horizontal one, and the line is drawn half a
   screen pixel that way - INSIDE the selection, which is where Pixelorama's
   shader puts it (a selected pixel with a contrary neighbour). */
function selEdges(mask,W,H){
  const runs=[];
  for(let x=0;x<=W;x++){ let run=null;
    for(let y=0;y<H;y++){
      const l=x>0?mask[y*W+x-1]===1:false, r=x<W?mask[y*W+x]===1:false;
      const s=l===r?0:(r?1:-1);
      if(s&&run&&run.s===s) run.y1=y+1;
      else { if(run) runs.push([x,run.y0,x,run.y1,run.s]); run=s?{y0:y,y1:y+1,s}:null; }
    }
    if(run) runs.push([x,run.y0,x,run.y1,run.s]);
  }
  for(let y=0;y<=H;y++){ let run=null;
    for(let x=0;x<W;x++){
      const t=y>0?mask[(y-1)*W+x]===1:false, b=y<H?mask[y*W+x]===1:false;
      const s=t===b?0:(b?1:-1);
      if(s&&run&&run.s===s) run.x1=x+1;
      else { if(run) runs.push([run.x0,y,run.x1,y,run.s]); run=s?{x0:x,x1:x+1,s}:null; }
    }
    if(run) runs.push([run.x0,y,run.x1,y,run.s]);
  }
  return runs;
}
function selBuildPath(runs,z){
  const p=new Path2D();
  for(const r of runs){
    if(r[0]===r[2]){ const x=r[0]*z+0.5*r[4]; p.moveTo(x,r[1]*z); p.lineTo(x,r[3]*z); }
    else { const y=r[1]*z+0.5*r[4]; p.moveTo(r[0]*z,y); p.lineTo(r[2]*z,y); }
  }
  return p;
}
/* Draws the ants and the shape being dragged, over the VISIBLE part of the
   art only, at screen resolution. The dash is 4 on, 4 off, and slides a
   whole period each second: Pixelorama's stripes are 64/10 screen pixels a
   pair and move one pair a second (frequency = zoom*10*size/64, uv -=
   time/frequency), and 8 is the nearest a canvas dash draws crisp. Pending
   shapes are drawn as theirs are: the rectangle as a black outline
   (draw_rect), the ellipse's border cells and the lasso's cells in white.
   Nothing here touches ctx. */
function selDraw(force){
  const pv=$('sepv'); if(!pv) return;
  const show=!!ctx&&!$('app').hidden&&(selMask||(seDrag&&(seDrag.rect||seDrag.pts.length)));
  if(!show){ pv.style.display='none'; selDrawKey=''; if(selRaf){ cancelAnimationFrame(selRaf); selRaf=0; } return; }
  const W=art.width,H=art.height,z=zoom;
  const fr=art.getBoundingClientRect(), sr=$('stage').getBoundingClientRect();
  const vx0=Math.max(0,Math.floor(sr.left-fr.left)), vy0=Math.max(0,Math.floor(sr.top-fr.top));
  const vx1=Math.min(Math.ceil(W*z),Math.ceil(sr.right-fr.left)), vy1=Math.min(Math.ceil(H*z),Math.ceil(sr.bottom-fr.top));
  const vw=Math.max(1,vx1-vx0), vh=Math.max(1,vy1-vy0), dpr=devicePixelRatio||1;
  const phase=Math.floor(performance.now()/125)%8;
  const key=[selVer,z,W,H,vx0,vy0,vw,vh,phase,seLift?seLift.dx+'/'+seLift.dy:'',seDrag?(seDrag.rect?JSON.stringify(seDrag.rect):seDrag.pts.length):''].join('|');
  if(!force&&key===selDrawKey){ selLoop(); return; }
  selDrawKey=key;
  const pw=Math.round(vw*dpr), ph=Math.round(vh*dpr);
  if(pv.width!==pw||pv.height!==ph){ pv.width=pw; pv.height=ph; }
  pv.style.left=vx0+'px'; pv.style.top=vy0+'px'; pv.style.width=vw+'px'; pv.style.height=vh+'px'; pv.style.display='block';
  const g=pv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,vw,vh); g.translate(-vx0,-vy0);
  if(selMask){
    const pk=selVer+':'+z+':'+W+'x'+H;
    if(pk!==selPathKey){ selPath=selBuildPath(selEdges(selMask,W,H),z); selPathKey=pk; }
    g.save();
    if(seLift) g.translate(seLift.dx*z,seLift.dy*z);
    g.lineWidth=1; g.setLineDash([]); g.strokeStyle='#000'; g.stroke(selPath);
    g.setLineDash([4,4]); g.lineDashOffset=-phase; g.strokeStyle='#fff'; g.stroke(selPath);
    g.restore();
  }
  const D=seDrag;
  if(D&&D.rect&&D.shape==='rect'){
    g.lineWidth=1; g.setLineDash([]); g.strokeStyle='#000';
    g.strokeRect(D.rect.x*z+0.5,D.rect.y*z+0.5,D.rect.w*z-1,D.rect.h*z-1);
  } else if(D&&D.rect&&D.shape==='ellipse'){
    g.fillStyle='#fff';
    for(const p of seEllipsePts(D.rect.w,D.rect.h)){ const x=D.rect.x+p[0], y=D.rect.y+p[1];
      if(x<0||y<0||x>=W||y>=H) continue; g.fillRect(x*z,y*z,z,z); }
  } else if(D&&D.shape==='lasso'&&D.pts.length){
    g.fillStyle='#fff';
    for(const p of D.pts){ if(p[0]<0||p[1]<0||p[0]>=W||p[1]>=H) continue; g.fillRect(p[0]*z,p[1]*z,z,z); }
  }
  selLoop();
}
/* One frame loop while there is anything to show. It redraws only when the
   dash phase, the view or the mask has moved, so a still selection costs a
   redraw eight times a second and nothing between. */
function selLoop(){
  if(selRaf) return;
  selRaf=requestAnimationFrame(()=>{ selRaf=0; selDraw(false); });
}

/* ---- the panel ------------------------------------------------------------ */
(function(){
  for(const id of ['seshape','semode']){
    const g=$(id); if(!g) continue;
    g.onclick=e=>{ const b=e.target.closest('button[data-v]'); if(b){ setChip(id,b.dataset.v); } };
  }
  const t=$('setol'); if(t) t.onchange=()=>{ t.value=String(seTol()); };
  const on=(id,fn)=>{ const b=$(id); if(b) b.onclick=fn; };
  on('seall',selAll); on('senone',selNone); on('seinv',selInvert); on('sedel',selDelete); on('sefill',selFill);
})();
`),
]));
/* The note is refreshed when the panel opens, since the selection can have
   changed by any tool while it was shut. */
swap('  if(on&&id==="qa"){ try{ qaInvalidate(); }catch(_){ } }', block([
  '  if(on&&id==="qa"){ try{ qaInvalidate(); }catch(_){ } }',
  '  if(on&&id==="se"){ try{ seNote(); }catch(_){ } }',
]));

/* ---- 8. the agent surface ---------------------------------------------- */
swap('PB.text=function(o){', block([
  '/* The selection, as data: how many, where, and the panel\'s settings.',
  '   {mask:true} adds the whole mask as an array of 0/1, which is large. */',
  'PB.selection=function(o){',
  '  if(!ctx) return {ok:false, why:"no canvas open"};',
  '  const r={ok:true, count:selMask?selCount(selMask):0, bounds:selMask?selBounds(selMask):null,',
  '    width:art.width, height:art.height, shape:chipVal("seshape"), mode:chipVal("semode"), tolerance:seTol()};',
  '  if(o&&o.mask) r.mask=selMask?Array.from(selMask):null;',
  '  return r;',
  '};',
  '/* Make a selection the way the tool would, driving the same chips a',
  '   person clicks so the panel says what the selection is:',
  '     {shape:"rect"|"ellipse", x,y,w,h}   {shape:"lasso", points:[[x,y],...]}',
  '     {shape:"wand"|"colour", x,y, tolerance}   {all:true} {none:true} {invert:true}',
  '   with mode:"replace"|"add"|"subtract"|"intersect", then optionally',
  '   delete:true, fill:true, or move:{dx,dy,copy} on the result. */',
  'PB.select=function(o){',
  '  o=o||{}; if(!ctx) return {ok:false, why:"no canvas open"};',
  '  const W=art.width,H=art.height;',
  '  if(o.shape){ setChip("seshape",o.shape); if(chipVal("seshape")!==o.shape) return {ok:false, why:"no shape called "+o.shape}; }',
  '  if(o.mode){ setChip("semode",o.mode); if(chipVal("semode")!==o.mode) return {ok:false, why:"no mode called "+o.mode}; }',
  '  if(typeof o.tolerance==="number"){ $("setol").value=String(o.tolerance); $("setol").value=String(seTol()); }',
  '  const mode=chipVal("semode")||"replace", num=v=>typeof v==="number"&&isFinite(v);',
  '  if(o.all) selAll(); else if(o.none) selNone(); else if(o.invert) selInvert();',
  '  else if(o.shape==="rect"||o.shape==="ellipse"){',
  '    if(!num(o.x)||!num(o.y)||!num(o.w)||!num(o.h)||o.w<1||o.h<1) return {ok:false, why:"a "+o.shape+" needs x, y, w and h"};',
  '    const r={x:Math.round(o.x), y:Math.round(o.y), w:Math.round(o.w), h:Math.round(o.h)};',
  '    seCombine(o.shape==="rect"?seRectRegion(r):seEllipseRegion(r), mode);',
  '  } else if(o.shape==="lasso"){',
  '    const pts=[]; for(const p of (o.points||[])){ if(!p||!num(p[0])||!num(p[1])) return {ok:false, why:"lasso points are [x,y] pairs"};',
  '      const q=[Math.round(p[0]),Math.round(p[1])]; if(pts.length) for(const b of seBresenham(pts[pts.length-1],q)) pts.push(b); pts.push(q); }',
  '    /* Lasso.apply_selection: more than three points makes a loop, fewer',
  '       leaves nothing selected. */',
  '    if(pts.length>3){ const region=new Uint8Array(W*H); seFillPoly(region,W,H,pts); seCombine(region,mode); } else selSet(null);',
  '  } else if(o.shape==="wand"||o.shape==="colour"){',
  '    if(!num(o.x)||!num(o.y)) return {ok:false, why:"the "+o.shape+" needs x and y"};',
  '    const x=Math.round(o.x), y=Math.round(o.y);',
  '    if(x<0||y<0||x>=W||y>=H) return {ok:false, why:"off the canvas"};',
  '    const d=ctx.getImageData(0,0,W,H).data;',
  '    seCombine(o.shape==="wand"?seFlood(d,W,H,x,y,seTol()):seByColour(d,W,H,x,y,seTol()), mode);',
  '  } else if(o.shape) return {ok:false, why:"no shape called "+o.shape};',
  '  if(o.delete) selDelete();',
  '  if(o.fill) selFill();',
  '  if(o.move){',
  '    /* The refusal goes LAST: PB.selection() carries ok:true and would',
  '       overwrite it the other way round - which it did, once. */',
  '    if(!selMask) return Object.assign(PB.selection(), {ok:false, why:"nothing to move"});',
  '    if(!num(o.move.dx)||!num(o.move.dy)) return {ok:false, why:"move needs dx and dy"};',
  '    seMoveBegin({x:0,y:0},!!o.move.copy); seLift.dx=Math.round(o.move.dx); seLift.dy=Math.round(o.move.dy); seMoveEnd(null);',
  '  }',
  '  return PB.selection();',
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

/* THE MARKERS SURVIVE, once each, so the next patch finds them. */
for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
  if (markup.split(m).length !== 2) throw new Error('marker not exactly once in markup: ' + m);
for (const m of ['/* panels:register */', '/* shortcuts:more */'])
  if (script.split(m).length !== 2) throw new Error('marker not exactly once in script: ' + m);

/* EVERY CONTROL EXISTS ONCE, in the card, and the card has a Close. */
const IDS = ['sescrim', 'setitle', 'seshape', 'semode', 'setol', 'senote', 'seall', 'senone', 'seinv', 'sedel', 'sefill', 'seclose'];
for (const id of IDS.concat(['sebtn', 'semv', 'sepv']))
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const a = markup.indexOf('<div class="scrim pop" id="sescrim"'), b = markup.indexOf('<!-- panels:more -->');
  if (a < 0 || b < a) throw new Error('could not bound the selection card');
  const card = markup.slice(a, b);
  for (const id of IDS) if (card.indexOf('id="' + id + '"') < 0) throw new Error(id + ' did not make it into the card');
  if (card.indexOf('id="seclose">Close<') < 0) throw new Error('the card has no Close button');
  for (const v of ['rect', 'ellipse', 'lasso', 'wand', 'colour'])
    if (card.indexOf('data-v="' + v + '"') < 0) throw new Error('no chip for the ' + v + ' shape');
  for (const v of ['replace', 'add', 'subtract', 'intersect'])
    if (card.indexOf('data-v="' + v + '"') < 0) throw new Error('no chip for the ' + v + ' mode');
}
if (markup.split('data-tool="select"').length !== 2) throw new Error('the Select tool button is not in the rail exactly once');
/* Every new control carries a title. */
{
  const a = markup.indexOf('<div class="scrim pop" id="sescrim"'), card = markup.slice(a, markup.indexOf('<!-- panels:more -->'));
  const buttons = card.match(/<button[^>]*>/g) || [];
  for (const b of buttons) if (b.indexOf('id="seclose"') < 0 && b.indexOf('title="') < 0) throw new Error('a control without a title: ' + b);
  for (const b of ['data-tool="select"', 'id="sebtn"']) {
    const at = markup.indexOf(b); const tag = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('>', at));
    if (tag.indexOf('title="') < 0) throw new Error(b + ' has no title');
  }
}
/* The layers are in the frame, after the effect preview and before text. */
{
  const frame = markup.slice(markup.indexOf('<div class="frame"'), markup.indexOf('<div id="tbox"'));
  const fx = frame.indexOf('id="fxpv"'), mv = frame.indexOf('id="semv"'), an = frame.indexOf('id="sepv"'), tx = frame.indexOf('id="txpv"');
  if (!(fx < mv && mv < an && an < tx)) throw new Error('the selection layers are not between the effect preview and the text');
}
if (text.indexOf('#sepv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;}') < 0) throw new Error('the ants layer has no rule');
if (text.indexOf('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;') < 0) throw new Error('text is no longer the top layer');

/* THE TOOL IS REGISTERED through the extension point and never edits the
   pointer code. */
if (code.indexOf("registerTool('select',{") < 0) throw new Error('the tool is not registered');
if (code.indexOf('RAIL_PANELS.push("se");') < 0) throw new Error('the panel is not registered');
{
  const bs = code.slice(code.indexOf('function beginStroke(e){'), code.indexOf('let pendingTouch=null;'));
  if (bs.indexOf('select') >= 0) throw new Error('beginStroke was edited for the selection tool');
}

/* THE FILL HONOURS THE MASK, as a wall inside the flood. */
{
  const ff = code.slice(code.indexOf('function floodFill(sx,sy,rgb){'), code.indexOf('let lastCell=null;'));
  if (ff.indexOf('if(selMask&&selMask[i>>2]!==1) return false;') < 0) throw new Error('floodFill does not honour the selection');
  if (ff.indexOf('selMask') > ff.indexOf('const on=d[i+3]>=128;')) throw new Error('the selection check comes after the colour check');
}

/* NOTHING WRITES PIXELS WITHOUT A SNAPSHOT FIRST, and the previews never
   touch ctx at all. */
for (const [fn, endAt] of [['function selDelete(){', 'function selFill(){'], ['function selFill(){', 'function seNote(){'], ['function seMoveBegin(raw,quick){', 'function seMoveDrag(e){']]) {
  const f = code.slice(code.indexOf(fn), code.indexOf(endAt));
  if (!f) throw new Error(fn + ' is missing');
  const snap = f.indexOf('snapshot()'), put = f.indexOf('ctx.putImageData');
  if (snap < 0 || put < 0 || snap > put) throw new Error(fn + ' writes before it snapshots');
}
for (const [fn, endAt] of [['function selDraw(force){', 'function selLoop(){'], ['function seLiftDraw(){', '/* ---- the operations']]) {
  const f = text.slice(text.indexOf(fn), text.indexOf(endAt));
  if (!f) throw new Error(fn + ' is missing');
  if (kit.code(f).indexOf('ctx.') >= 0) throw new Error(fn + ' draws on the artwork');
}
/* A move that ends where it began gives the snapshot back. */
if (code.indexOf('if(!L.dx&&!L.dy){ ctx.putImageData(undoStack[undoStack.length-1],0,0); dropSnapshot(seRedoWas,seDropped);') < 0)
  throw new Error('a zero move keeps an undo step');
/* Delete ends the selection, as Pixelorama\'s does. */
{
  const f = code.slice(code.indexOf('function selDelete(){'), code.indexOf('function selFill(){'));
  if (f.indexOf('ctx.putImageData(img,0,0);') > f.indexOf('selSet(null); refreshStats();')) throw new Error('delete does not drop the selection after clearing');
}

/* THE KEYS: the tool, the panel, and Escape that steps aside for panels. */
if (code.indexOf("keys:['w'], run:()=>selectTool('select')") < 0) throw new Error('the tool has no key');
if (code.indexOf("keys:['k'], run:()=>railPanel('se'") < 0) throw new Error('the panel has no key');
{
  const sc = code.slice(code.indexOf('const SHORTCUTS=['), code.indexOf('function renderKeys(){'));
  const mine = sc.indexOf("tool==='select'&&!!selMask&&!selLayered()"), panels = sc.indexOf("RAIL_PANELS.some(i=>!$(i+'scrim').hidden)");
  if (mine < 0) throw new Error('no Escape-deselects row');
  if (mine > panels) throw new Error('the deselect row is below the panel row, so its guard is not what decides');
  for (const k of ["==='a', run:()=>selAll()", "==='d', run:()=>selNone()", "==='i', run:()=>selInvert()", "e.key==='Delete'&&!!selMask, run:()=>selDelete()"])
    if (sc.indexOf(k) < 0) throw new Error('missing key row: ' + k);
}
/* Taken keys stay taken by their owners: no other row answers to w or k. */
{
  const sc = code.slice(code.indexOf('const SHORTCUTS=['), code.indexOf('function renderKeys(){'));
  for (const k of ['w', 'k']) if (sc.split("keys:['" + k + "']").length !== 2) throw new Error('the key ' + k + ' is bound more than once');
}

/* THE MASK DIES WITH ITS CANVAS: a new canvas and a canvas of a new size. */
{
  const se = code.slice(code.indexOf('function startEditor('), code.indexOf('function startEditor(') + 1200);
  if (se.indexOf('selReset();') < 0) throw new Error('startEditor keeps a stale mask');
  const ri = code.slice(code.indexOf('function restoreImage(im){'), code.indexOf('ctx.putImageData(im,0,0);', code.indexOf('function restoreImage(im){')));
  if (ri.indexOf('selReset();') < 0) throw new Error('restoreImage keeps a mask of the wrong size');
  if (ri.indexOf('selReset();') < ri.indexOf('if(art.width!==im.width||art.height!==im.height){')) throw new Error('selReset is outside the size branch');
}

/* THE AGENT SURFACE drives the chips, not a private path. */
{
  const pb = code.slice(code.indexOf('PB.select=function(o){'), code.indexOf('PB.text=function(o){'));
  if (!pb) throw new Error('PB.select is missing');
  if (pb.indexOf('setChip("seshape",o.shape)') < 0 || pb.indexOf('setChip("semode",o.mode)') < 0) throw new Error('PB.select goes round the panel');
  if (pb.indexOf('seCombine(') < 0) throw new Error('PB.select does not take the tool\'s own path');
  if (code.indexOf('PB.selection=function(o){') < 0) throw new Error('PB.selection is missing');
  if (pb.indexOf('Object.assign(PB.selection(), {ok:false, why:"nothing to move"})') < 0)
    throw new Error('the nothing-to-move refusal lets ok:true through');
}

/* The ellipse port agrees with the two cases derived by hand from the
   GDScript: a 3x3 is the plus of five cells, a 4x4 is the square less its
   corners, twelve. Run here, on the extracted functions, before the file is
   believed. */
{
  /* Sliced from the comment-stripped code, so the end marker has to be code
     too: a comment marker is gone by then, indexOf gives -1, and the slice
     runs to the end of the file and pulls registerTool in with it. */
  const body = code.slice(code.indexOf('function seEllipsePts(w,h){'), code.indexOf('function seBresenham(a,b){'));
  // eslint-disable-next-line no-new-func
  const fns = new Function(body + '; return {seEllipsePts, seEllipseFilled};')();
  const set = pts => [...new Set(pts.map(p => p[0] + ',' + p[1]))].sort();
  const three = set(fns.seEllipseFilled(3, 3)), four = set(fns.seEllipseFilled(4, 4));
  if (three.join(' ') !== ['1,0', '0,1', '1,1', '2,1', '1,2'].sort().join(' ')) throw new Error('a 3x3 ellipse is not the plus: ' + three);
  if (four.length !== 12 || four.some(k => ['0,0', '3,0', '0,3', '3,3'].indexOf(k) >= 0)) throw new Error('a 4x4 ellipse is not the square less its corners: ' + four);
  const eleven = set(fns.seEllipseFilled(11, 7));
  /* Symmetric both ways, and never outside its box. */
  for (const k of eleven) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x > 10 || y > 6) throw new Error('an ellipse point outside its rect: ' + k);
    if (eleven.indexOf((10 - x) + ',' + y) < 0 || eleven.indexOf(x + ',' + (6 - y)) < 0) throw new Error('the ellipse is not symmetric at ' + k);
  }
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
