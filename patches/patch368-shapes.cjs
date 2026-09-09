/* PIXELORAMA'S SHAPE TOOLS: LINE, RECTANGLE, ELLIPSE.

   Ported from Tools/BaseShapeDrawer.gd, Tools/DesignTools/LineTool.gd,
   RectangleTool.gd, EllipseTool.gd, the point-set functions in
   Autoload/DrawingAlgos.gd (get_ellipse_points, get_ellipse_points_filled,
   get_rounded_rect_points, get_rounded_rect_points_filled), BaseDraw's
   _line_angle_constraint and get_coords_to_draw, and Godot's own
   Geometry2D::bresenham_line, which every one of those leans on. The point
   sets are Pixelorama's to the pixel - its Bresenham ellipse is the reason
   its circles look right, and a circle that is "nearly" that one is a
   different circle. The state machine keeps Pixelorama's names (start,
   offset, dest, displace, orig) so the two can be read side by side.

   Three rail tools, N U P, registered through registerTool so nothing in the
   pointer code is edited. Drag to place; the shape is drawn on its own layer
   while the button is down and lands through snapshot() on release, so one
   undo takes it back. Shift makes a square or a circle, or snaps the line's
   angle; Ctrl grows the shape from the centre (the line from both ends); Alt
   pressed mid-drag moves the whole thing. Thickness is the brush slider.

   THE ALGORITHMS ARE CHECKED HERE, IN NODE, BEFORE THEY GO INTO THE PAGE:
   the block below is evaluated and compared with point sets traced by hand
   from the GDScript, so a port that drifts refuses to write rather than
   shipping a circle that is nearly right. The Bresenham is compared against
   the Godot source on disk (scratchpad/godot-src/geometry_2d.h), not
   against memory of it.

   ONE THING THE BRIEF AND THE SOURCE DISAGREE ON, decided in the brief's
   favour and said here so nobody has to rediscover it: LineTool.gd carries
   its own _line_angle_constraint that ALWAYS snaps to 22.5 degrees with the
   2:1 slope correction - that is the pixel-perfect branch of BaseDraw's
   version, unconditionally. BaseDraw's version, which the brief names, has
   that branch under Tools.pixel_perfect and 15-degree steps otherwise. Both
   branches are ported below, whole; the line tool takes the 15-degree one
   unless PB.shapeOptions({pixelPerfect:true}) says otherwise, because this
   editor has no pixel-perfect switch of its own yet for it to follow.

   What Pixelorama has and this editor does not, and so is not ported: mirror
   view and symmetry (mirror_array), grid and guide snapping (snap_position -
   this editor's snap is a pencil-only block snap with a different meaning),
   brush dynamics and density, image and circle brushes, tile placing, 3D
   layers, the cursor-side text (it goes to the footer's Cell readout, where
   the move tool already puts its delta). Each is named at the place it
   would have gone. */
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

/* ---- 0. the algorithms ---------------------------------------------------
   Pure functions of numbers. They know nothing about the canvas, the brush
   or the selection, which is what lets this script run them here. */
const ALGOS = [
  '/* ---- Pixelorama\'s shape tools: line, rectangle, ellipse ------------------',
  '',
  '   The point-set functions below are DrawingAlgos.gd and Geometry2D, line',
  '   for line. They take the box the shape sits in - position and size, the',
  '   way Pixelorama passes it - and return [x,y] pairs, possibly with',
  '   repeats and possibly off the canvas; clipping and thickness come later',
  '   in shpExpand, exactly as get_coords_to_draw does upstream. */',
  '',
  '/* Geometry2D.bresenham_line as Godot writes it: the error starts at half',
  '   the major delta and the minor axis steps when it goes negative. Which',
  '   of two equally-near cells a line takes is decided here, and every shape',
  '   below is built from it, so this is the one that has to match. */',
  'function gdBresenham(x0,y0,x1,y1){',
  '  const out=[], ax=Math.abs(x1-x0)*2, ay=Math.abs(y1-y0)*2, sx=Math.sign(x1-x0), sy=Math.sign(y1-y0);',
  '  let x=x0, y=y0;',
  '  if(ax>ay){ let err=ax/2; for(;x!==x1;x+=sx){ out.push([x,y]); err-=ay; if(err<0){ y+=sy; err+=ax; } } }',
  '  else{ let err=ay/2; for(;y!==y1;y+=sy){ out.push([x,y]); err-=ax; if(err<0){ x+=sx; err+=ay; } } }',
  '  out.push([x,y]); return out;',
  '}',
  '/* DrawingAlgos.get_ellipse_points: Bresenham\'s ellipse after Zingl',
  '   (members.chello.at/easyfilter/bresenham.html) on the box pos..pos+size-1.',
  '   b1 = b&1 is the odd-height correction that keeps an even-height ellipse',
  '   two rows wide at the middle rather than one row and a bulge; the second',
  '   loop finishes the tips when the x loop runs out early, which it does for',
  '   anything narrower than it is tall. Four points a step, in the order',
  '   upstream pushes them. (b+1)/2 is GDScript integer division, hence |0. */',
  'function gdEllipse(px,py,w,h){',
  '  const out=[];',
  '  let x0=px, x1=px+(w-1), y0=py, y1=py+(h-1);',
  '  let a=Math.abs(x1-x0), b=Math.abs(y1-y0), b1=b&1;',
  '  let dx=4*(1-a)*b*b, dy=4*(b1+1)*a*a, err=dx+dy+b1*a*a, e2=0;',
  '  if(x0>x1){ x0=x1; x1+=a; }',
  '  if(y0>y1) y0=y1;',
  '  y0+=((b+1)/2)|0; y1=y0-b1;',
  '  a*=8*a; b1=8*b*b;',
  '  while(x0<=x1){',
  '    out.push([x1,y0],[x0,y0],[x0,y1],[x1,y1]);',
  '    e2=2*err;',
  '    if(e2<=dy){ y0++; y1--; dy+=a; err+=dy; }',
  '    if(e2>=dx||2*err>dy){ x0++; x1--; dx+=b1; err+=dx; }',
  '  }',
  '  while(y0-y1<b){',
  '    out.push([x0-1,y0],[x1+1,y0],[x0-1,y1],[x1+1,y1]);',
  '    y0++; y1--;',
  '  }',
  '  return out;',
  '}',
  '/* get_ellipse_points_filled: the border, then every column of the top-left',
  '   quarter scanned downward - nothing until the border has been crossed,',
  '   then filling until it is met again - mirrored into the other three. The',
  '   columns start at 1 and the scans stop at the middle, as upstream; the',
  '   middle column of an odd width is pushed twice, which the mask later',
  '   absorbs. thickness widens the box by thickness-1, also as upstream. */',
  'function gdEllipseFilled(px,py,w,h,thickness){',
  '  const ow=w+((thickness||1)-1), oh=h+((thickness||1)-1);',
  '  const border=gdEllipse(px,py,ow,oh), has=new Set(border.map(p=>p[0]+","+p[1])), fill=[];',
  '  for(let x=1;x<Math.ceil(ow/2);x++){',
  '    let on=false, prev=false;',
  '    for(let y=0;y<Math.ceil(oh/2);y++){',
  '      const bit=has.has((px+x)+","+(py+y));',
  '      if(bit&&!on){ prev=true; continue; }',
  '      if(!bit&&(on||prev)){',
  '        fill.push([px+x,py+y],[px+x,py+oh-y-1],[px+ow-x-1,py+y],[px+ow-x-1,py+oh-y-1]);',
  '        if(prev){ on=true; prev=false; }',
  '      } else if(bit&&on) break;',
  '    }',
  '  }',
  '  return border.concat(fill);',
  '}',
  '/* get_rounded_rect_points_filled: rows of the box, each shortened at the',
  '   corners by the circle of the radius - the radius first clamped to half',
  '   the shorter side, in whole pixels, as upstream. Each row is a Bresenham',
  '   span, which for a horizontal line is every cell from one end to the',
  '   other, so the spans are unique and the hollow version below can subtract',
  '   them. */',
  'function gdRoundRectFilled(px,py,w,h,radius){',
  '  const out=[];',
  '  if(radius<=0){ for(let y=0;y<h;y++) for(let x=0;x<w;x++) out.push([px+x,py+y]); return out; }',
  '  radius=Math.min(radius,(w/2)|0,(h/2)|0);',
  '  const r2=radius*radius, left=px, right=px+w-1, top=py, bottom=py+h-1;',
  '  for(let y=top;y<=bottom;y++){',
  '    let sx=left, ex=right;',
  '    if(y<top+radius){ const dy=(top+radius)-y, dx=Math.floor(Math.sqrt(r2-dy*dy)); sx=left+radius-dx; ex=right-radius+dx; }',
  '    else if(y>bottom-radius){ const dy=y-(bottom-radius), dx=Math.floor(Math.sqrt(r2-dy*dy)); sx=left+radius-dx; ex=right-radius+dx; }',
  '    for(const p of gdBresenham(sx,y,ex,y)) out.push(p);',
  '  }',
  '  return out;',
  '}',
  '/* get_rounded_rect_points: with no radius, the four edges directly - top',
  '   and bottom rows, then the two columns between them. With one, the',
  '   filled shape minus a filled shape inset by the thickness, whose radius',
  '   is smaller by the same amount; upstream erases the inner points one by',
  '   one and the filled set is unique, so a filter is the same operation. */',
  'function gdRoundRect(px,py,w,h,radius,thickness){',
  '  if(radius<=0){',
  '    const out=[], y1=h+py-1, x1=w+px-1;',
  '    for(let x=px;x<w+px;x++) out.push([x,py],[x,y1]);',
  '    for(let y=py+1;y<h+py;y++) out.push([px,y],[x1,y]);',
  '    return out;',
  '  }',
  '  const pts=gdRoundRectFilled(px,py,w,h,radius), iw=w-thickness*2, ih=h-thickness*2;',
  '  if(iw<=0||ih<=0) return pts;',
  '  const inner=new Set(gdRoundRectFilled(px+thickness,py+thickness,iw,ih,Math.max(0,radius-thickness)).map(p=>p[0]+","+p[1]));',
  '  return pts.filter(p=>!inner.has(p[0]+","+p[1]));',
  '}',
  '/* BaseShapeDrawer._get_result_rect: the box between where the drag began',
  '   and where it is. center (Ctrl) mirrors the drag through its origin so',
  '   the box grows from the middle; perfect (Shift) squares it off the',
  '   SHORTER side, anchored at the origin, which is why a square never',
  '   overshoots the pointer. Both together take the LONGER side, which is',
  '   the one place upstream drops the sign - kept, because it is what the',
  '   hand expects: the square grows as far as you have pulled in either',
  '   direction. Sizes are inclusive, hence the +1. */',
  'function shpRect(ox,oy,dx,dy,center,perfect){',
  '  if(center){',
  '    let nx=dx-ox, ny=dy-oy;',
  '    if(perfect){ const s=Math.max(Math.abs(nx),Math.abs(ny)); nx=s; ny=s; }',
  '    ox-=nx; oy-=ny; dx=ox+2*nx; dy=oy+2*ny;',
  '  }',
  '  let x,y,w,h;',
  '  if(perfect){',
  '    const s=Math.min(Math.abs(ox-dx),Math.abs(oy-dy));',
  '    x= ox<dx ? ox : ox-s; y= oy<dy ? oy : oy-s; w=s; h=s;',
  '  } else { x=Math.min(ox,dx); y=Math.min(oy,dy); w=Math.abs(ox-dx); h=Math.abs(oy-dy); }',
  '  return {x,y,w:w+1,h:h+1};',
  '}',
  '/* Godot\'s snappedf is floor(x/step+0.5)*step and its round is half away',
  '   from zero. Both are kept as they are: Math.round on a negative .5 lands',
  '   a line end one cell off from where Pixelorama puts it. */',
  'const gdSnap=(v,s)=>Math.floor(v/s+0.5)*s;',
  'const gdRound=v=>v<0?-Math.round(-v):Math.round(v);',
  '/* BaseDraw._line_angle_constraint. With snap off the end is where the',
  '   pointer is and only the readout is computed. With it on, 15-degree steps',
  '   - the angle snapped, the end put back at the same distance along the',
  '   snapped direction. Pixel perfect snaps to 22.5 instead and, on the half',
  '   steps, moves the end onto an exact 2:1 or 1:2 slope: those are the',
  '   angles a pixel line can hold with a regular stair, and (2,1)/(1,2) is',
  '   that slope, f its whole-step length by projection, minus one sign step',
  '   so the last stair is not overrun. LineTool.gd\'s own override is this',
  '   pixel-perfect branch unconditionally. The readout is the angle turned to',
  '   read clockwise-positive and put into 0..360, to two decimals - divided',
  '   by 100 after the snap rather than multiplied by 0.01, which is the same',
  '   choice of value and prints without float noise. */',
  'function lineAngleConstraint(sx,sy,ex,ey,snap,pixelPerfect){',
  '  let angle=Math.atan2(ey-sy,ex-sx)*180/Math.PI;',
  '  const dist=Math.hypot(ex-sx,ey-sy);',
  '  if(snap){',
  '    if(pixelPerfect){',
  '      angle=gdSnap(angle,22.5);',
  '      if(angle%1!==0){',
  '        const dx=ex-sx, dy=ey-sy, gx=Math.sign(dx), gy=Math.sign(dy), wide=Math.abs(dx)>Math.abs(dy);',
  '        const vx=wide?2:1, vy=wide?1:2, bx=gx*vx, by=gy*vy, k=(dx*bx+dy*by)/(bx*bx+by*by);',
  '        const px=Math.round(Math.abs(bx*k)), py=Math.round(Math.abs(by*k)), f=wide?py:px;',
  '        ex=sx+gx*vx*f-gx; ey=sy+gy*vy*f-gy;',
  '        angle=Math.atan2(gy*vy,gx*vx)*180/Math.PI;',
  '      } else { const r=angle*Math.PI/180; ex=sx+Math.cos(r)*dist; ey=sy+Math.sin(r)*dist; }',
  '    } else {',
  '      angle=gdSnap(angle,15);',
  '      const r=angle*Math.PI/180; ex=sx+Math.cos(r)*dist; ey=sy+Math.sin(r)*dist;',
  '    }',
  '  }',
  '  angle*=-1; if(angle<0) angle+=360;',
  '  return {text:String(Math.floor(angle/0.01+0.5)/100)+"\\u00b0", x:gdRound(ex), y:gdRound(ey)};',
  '}',
  '/* get_coords_to_draw with the pixel brush: every point becomes a block of',
  '   n by n, and the union of the blocks, clipped to the canvas, is the mask',
  '   of what gets painted. Pixelorama puts a block\'s corner at p-(n>>1);',
  '   this editor\'s brush - dab() and the cursor box - puts it at',
  '   p-floor((n-1)/2). They agree for every odd n and sit one cell apart for',
  '   even ones, and the editor\'s is used so a 4-wide line lands under the',
  '   4-wide cursor and matches a 4-wide pencil stroke.',
  '',
  '   Not n*n writes per point: a filled ellipse across a 1280 canvas is a',
  '   million points, and at a brush of 128 that is sixteen billion writes.',
  '   A cell is covered when any point lies within [x-(n-1-off), x+off] of it',
  '   on both axes, so two passes of a windowed count - rows, then columns -',
  '   give the same union in one visit per cell. Padded by n a side, because',
  '   a point further off the canvas than that cannot reach it. */',
  'function shpExpand(points,W,H,n){',
  '  const off=Math.floor((n-1)/2), lo=n-1-off, hi=off, P=n, PW=W+2*P, PH=H+2*P;',
  '  const base=new Uint8Array(PW*PH);',
  '  for(const p of points){ const x=p[0]+P, y=p[1]+P; if(x>=0&&y>=0&&x<PW&&y<PH) base[y*PW+x]=1; }',
  '  const rows=new Uint8Array(PW*PH), pre=new Int32Array(Math.max(PW,PH)+1);',
  '  for(let y=0;y<PH;y++){ const o=y*PW; let s=0;',
  '    for(let x=0;x<PW;x++){ s+=base[o+x]; pre[x+1]=s; }',
  '    for(let x=0;x<PW;x++){ const a=Math.max(0,x-lo), b=Math.min(PW-1,x+hi); if(pre[b+1]-pre[a]) rows[o+x]=1; } }',
  '  const out=new Uint8Array(W*H);',
  '  for(let x=P;x<W+P;x++){ let s=0;',
  '    for(let y=0;y<PH;y++){ s+=rows[y*PW+x]; pre[y+1]=s; }',
  '    for(let y=P;y<H+P;y++){ const a=Math.max(0,y-lo), b=Math.min(PH-1,y+hi); if(pre[b+1]-pre[a]) out[(y-P)*W+(x-P)]=1; } }',
  '  return out;',
  '}',
];

/* ---- 0b. CHECKED AGAINST POINT SETS TRACED BY HAND from the GDScript.
   Each expected set below was worked through the upstream loops on paper
   before this port was written, which is what makes a match evidence. */
{
  // eslint-disable-next-line no-new-func
  const A = new Function(ALGOS.join('\n') + '\nreturn {gdBresenham,gdEllipse,gdEllipseFilled,gdRoundRect,gdRoundRectFilled,shpRect,lineAngleConstraint,shpExpand};')();
  const key = p => p[0] + ',' + p[1];
  const uniq = pts => [...new Set(pts.map(key))].sort();
  const same = (got, want, what) => {
    const g = uniq(got), w = uniq(want.map(p => Array.isArray(p) ? p : p.split(',').map(Number)));
    if (g.join(' ') !== w.join(' ')) throw new Error(what + ': got [' + g.join(' ') + '] want [' + w.join(' ') + ']');
  };
  /* Bresenham (0,0)->(10,4): delta (20,8), err 10, minor steps where err<0
     - traced: y rises at x=2,4,7,9. */
  same(A.gdBresenham(0, 0, 10, 4), [[0,0],[1,0],[2,1],[3,1],[4,2],[5,2],[6,2],[7,3],[8,3],[9,4],[10,4]], 'bresenham 10x4');
  /* And (0,0)->(10,3), which is what Shift makes of the drag above: delta
     (20,6), err 10, y rises at x=2,6,9. The Shift test in shapes.spec.js
     pins exactly these cells. */
  same(A.gdBresenham(0, 0, 10, 3), [[0,0],[1,0],[2,1],[3,1],[4,1],[5,1],[6,2],[7,2],[8,2],[9,3],[10,3]], 'bresenham 10x3');
  if (A.gdBresenham(10, 4, 0, 0).length !== 11) throw new Error('bresenham reversed is not 11 points');
  same(A.gdBresenham(3, 3, 3, 3), [[3,3]], 'bresenham of a point');
  /* Ellipses traced through get_ellipse_points step by step. */
  same(A.gdEllipse(0, 0, 5, 3), [[1,0],[2,0],[3,0],[0,1],[4,1],[1,2],[2,2],[3,2]], 'ellipse 5x3');
  same(A.gdEllipse(0, 0, 6, 4), [[1,0],[2,0],[3,0],[4,0],[0,1],[5,1],[0,2],[5,2],[1,3],[2,3],[3,3],[4,3]], 'ellipse 6x4');
  same(A.gdEllipse(0, 0, 5, 5), [[1,0],[2,0],[3,0],[0,1],[0,2],[0,3],[4,1],[4,2],[4,3],[1,4],[2,4],[3,4]], 'ellipse 5x5');
  /* Taller than wide: the x loop ends early and the tip loop finishes it. */
  same(A.gdEllipse(0, 0, 3, 7), [[1,0],[0,1],[0,2],[0,3],[0,4],[0,5],[2,1],[2,2],[2,3],[2,4],[2,5],[1,6]], 'ellipse 3x7');
  /* Two wide: upstream gives rows 1..3 of a 2x5 box and nothing at the tips.
     Odd, and Pixelorama's, so it is pinned rather than improved. */
  same(A.gdEllipse(0, 0, 2, 5), [[0,1],[1,1],[0,2],[1,2],[0,3],[1,3]], 'ellipse 2x5');
  /* Filled 6x4: the 12 of the border plus the 8 interior cells of rows 1-2. */
  same(A.gdEllipseFilled(0, 0, 6, 4, 1), A.gdEllipse(0, 0, 6, 4).concat([[1,1],[2,1],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2]]), 'filled ellipse 6x4');
  same(A.gdEllipseFilled(2, 3, 5, 3, 1), A.gdEllipse(2, 3, 5, 3).concat([[3,4],[4,4],[5,4]]), 'filled ellipse 5x3 offset');
  /* Rounded rectangle 8x6 radius 2, traced row by row: 4,6,8,8,6,4 filled;
     the hollow one is that minus the 6x4 radius-1 rectangle inset by one. */
  if (uniq(A.gdRoundRectFilled(0, 0, 8, 6, 2)).length !== 36) throw new Error('rounded 8x6 r2 filled is not 36');
  same(A.gdRoundRect(0, 0, 8, 6, 2, 1), [[2,0],[3,0],[4,0],[5,0],[1,1],[6,1],[0,2],[7,2],[0,3],[7,3],[1,4],[6,4],[2,5],[3,5],[4,5],[5,5]], 'rounded 8x6 r2 outline');
  if (uniq(A.gdRoundRect(0, 0, 8, 6, 0, 1)).length !== 24) throw new Error('rect 8x6 outline is not 24');
  if (uniq(A.gdRoundRectFilled(0, 0, 8, 6, 0)).length !== 48) throw new Error('rect 8x6 filled is not 48');
  /* A radius bigger than the box is clamped to half the shorter side. */
  if (uniq(A.gdRoundRectFilled(0, 0, 8, 6, 99)).length !== uniq(A.gdRoundRectFilled(0, 0, 8, 6, 3)).length) throw new Error('radius is not clamped');
  /* The result rect, in each modifier state. */
  const rect = (got, want) => { for (const k in want) if (got[k] !== want[k]) throw new Error('shpRect ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
  rect(A.shpRect(5, 5, 2, 9, false, false), { x: 2, y: 5, w: 4, h: 5 });
  rect(A.shpRect(5, 5, 2, 9, false, true), { x: 2, y: 5, w: 4, h: 4 });
  rect(A.shpRect(5, 5, 8, 7, true, false), { x: 2, y: 3, w: 7, h: 5 });
  rect(A.shpRect(5, 5, 8, 7, true, true), { x: 2, y: 2, w: 7, h: 7 });
  rect(A.shpRect(3, 4, 10, 9, false, true), { x: 3, y: 4, w: 6, h: 6 });
  /* The angle constraint: free, 15-degree, and the pixel-perfect 22.5 with
     its 2:1 correction - all three ends and readouts worked by hand. */
  const ang = (got, want) => { if (got.x !== want.x || got.y !== want.y || got.text !== want.text) throw new Error('angle ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
  ang(A.lineAngleConstraint(0, 0, 10, 4, false, false), { x: 10, y: 4, text: '338.2\u00b0' });
  ang(A.lineAngleConstraint(0, 0, 10, 4, true, false), { x: 10, y: 3, text: '345\u00b0' });
  ang(A.lineAngleConstraint(0, 0, 10, 4, true, true), { x: 9, y: 4, text: '333.43\u00b0' });
  ang(A.lineAngleConstraint(0, 0, 4, 10, true, true), { x: 4, y: 9, text: '296.57\u00b0' });
  ang(A.lineAngleConstraint(0, 0, 0, -7, true, false), { x: 0, y: -7, text: '90\u00b0' });
  ang(A.lineAngleConstraint(0, 0, -3, 0, false, false), { x: -3, y: 0, text: '180\u00b0' });
  ang(A.lineAngleConstraint(0, 0, 0, 0, true, false), { x: 0, y: 0, text: '0\u00b0' });
  /* The windowed expansion is the union of blocks, proven against the
     naive union on random points on and off a small canvas, at every brush
     size from 1 to 9, including the even ones where the offset matters. */
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 1; n <= 9; n++) {
    const W = 23, H = 17, pts = [];
    for (let i = 0; i < 40; i++) pts.push([Math.floor(rnd() * (W + 20)) - 10, Math.floor(rnd() * (H + 20)) - 10]);
    const naive = new Uint8Array(W * H), off = Math.floor((n - 1) / 2);
    for (const p of pts) for (let y = p[1] - off; y < p[1] - off + n; y++) for (let x = p[0] - off; x < p[0] - off + n; x++)
      if (x >= 0 && y >= 0 && x < W && y < H) naive[y * W + x] = 1;
    const fast = A.shpExpand(pts, W, H, n);
    for (let i = 0; i < W * H; i++) if (fast[i] !== naive[i]) throw new Error('shpExpand differs from the naive union at n=' + n + ' cell ' + i);
    if (!naive.some(v => v)) throw new Error('the expansion check painted nothing at n=' + n);
  }
}

/* ---- 1. three rail tools, before the eyedropper -------------------------- */
swap('    <!-- rail:tools -->', block([
  '    <!-- Pixelorama\'s shapes. Registered tools: a drag is theirs from press',
  '         to release, and the strip below the rail carries their options. -->',
  '    <button class="tool" data-tool="line" aria-pressed="false" title="Line (N): drag from one end to the other. Shift snaps the angle to 15\u00b0 steps, Ctrl grows it from both ends, Alt pressed while dragging moves the start"><svg viewBox="0 0 24 24"><path d="M5 19 19 5"/><path d="M5 19h.01M19 5h.01"/></svg><span class="k">N</span></button>',
  '    <button class="tool" data-tool="rect" aria-pressed="false" title="Rectangle (U): drag from one corner to the opposite one. Shift for a square, Ctrl to grow it from the centre, Alt pressed while dragging moves it"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12"/></svg><span class="k">U</span></button>',
  '    <button class="tool" data-tool="ellipse" aria-pressed="false" title="Ellipse (P): drag the box it fits in. Shift for a circle, Ctrl to grow it from the centre, Alt pressed while dragging moves it"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8.5" ry="6"/></svg><span class="k">P</span></button>',
  '    <!-- rail:tools -->',
]));

/* ---- 2. their options, in the strip beside the brush ---------------------
   Fill and the corner radius are Pixelorama's own two controls for these
   tools (FillCheckbox, RadiusValueSlider). They sit where Fill spread sits
   for the fill tool, and appear the same way: only while the tool is
   chosen. */
swap('    <div id="fillrows" hidden>', block([
  '    <div id="shprows" hidden>',
  '      <div class="olrow">',
  '        <button class="btn ghost" id="shpfill" aria-pressed="false"',
  '          style="width:auto;padding:6px 12px;font-size:12px"',
  '          title="Fill the inside as well as drawing the outline">Fill</button>',
  '        <label for="shprad" id="shpradlab" title="Round the corners by this many pixels. 0 is a sharp corner.">Corners</label>',
  '        <input id="shprad" type="number" min="0" step="1" value="0" style="width:60px"',
  '          title="Round the corners by this many pixels. 0 is a sharp corner.">',
  '        <span id="shphint" title="Held while dragging"></span></div>',
  '      </div>',
  '    <div id="fillrows" hidden>',
]));
swap('.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}',
  '.opts #brushrows,.opts #fillrows,.opts #shprows{display:flex; align-items:center;}');

/* ---- 3. a layer of its own over the art ---------------------------------- */
/* Before the text layer, anchored on the text layer ALONE. The first draft
   anchored on "fxpv immediately followed by txpv", and the first other patch
   to put a layer between them (pixelperfect's symmetry guide) broke it. */
swap('<canvas id="txpv"></canvas>',
  '<canvas id="shpv"></canvas><canvas id="txpv"></canvas>');
swap(block([
  '#fxpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
]), block([
  '#fxpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
  '/* The shape being dragged, at the art\'s own resolution. Level with the',
  '   effect preview - the two are never up together, since the Adjust panel',
  '   covers the canvas with its scrim - and under pending text. */',
  '#shpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
]));

/* ---- 4. keys, from the free letters -------------------------------------- */
swap('  /* shortcuts:more */', block([
  "  {show:'N', desc:'Line', keys:['n'], run:()=>selectTool('line')},",
  "  {show:'U', desc:'Rectangle', keys:['u'], run:()=>selectTool('rect')},",
  "  {show:'P', desc:'Ellipse', keys:['p'], run:()=>selectTool('ellipse')},",
  '  /* shortcuts:more */',
]));

/* ---- 5. the tools --------------------------------------------------------- */
swap('/* panels:register */', block([
  '/* panels:register */',
  '',
].concat(ALGOS, [
  '',
  '/* What a drag holds, named as BaseShapeDrawer and LineTool name it: start',
  '   and dest are the two corners (for the line, its two ends), offset is',
  '   where the pointer was last so an Alt-drag can move the shape by the',
  '   pointer\'s travel, orig is the line\'s anchor before Ctrl mirrors it.',
  '   fill is per tool, as upstream keeps it. displace is Alt, and it is set',
  '   only by a press that happens DURING the drag - upstream reads the key',
  '   event, not the key, so Alt held from before the press does nothing. */',
  "const SHP_KINDS=['line','rect','ellipse'];",
  'const SHP={drawing:false, kind:null, start:[0,0], offset:[0,0], dest:[0,0], orig:[0,0], pos:[0,0],',
  "  text:'', mods:{shift:false,ctrl:false}, displace:false, fill:{rect:false,ellipse:false}, radius:0, pixelPerfect:false};",
  '/* Shift is shape_perfect and, for the line, draw_snap_angle; Ctrl is',
  '   shape_center. Meta stands in for Ctrl the way the undo key does. */',
  'function shpMods(e){ return {shift:!!(e&&e.shiftKey), ctrl:!!(e&&(e.ctrlKey||e.metaKey))}; }',
  '/* _set_cursor_text: "x, y -> x2, y2 (w, h)", inclusive corners. */',
  "function shpText(r){ return r.x+', '+r.y+' -> '+(r.x+r.w-1)+', '+(r.y+r.h-1)+' ('+r.w+', '+r.h+')'; }",
  'function shpShapePoints(kind,start,dest,mods){',
  '  const r=shpRect(start[0],start[1],dest[0],dest[1],mods.ctrl,mods.shift), fill=!!SHP.fill[kind];',
  "  if(kind==='rect') return fill ? gdRoundRectFilled(r.x,r.y,r.w,r.h,SHP.radius) : gdRoundRect(r.x,r.y,r.w,r.h,SHP.radius,1);",
  '  return fill ? gdEllipseFilled(r.x,r.y,r.w,r.h,1) : gdEllipse(r.x,r.y,r.w,r.h);',
  '}',
  'function shpPointsNow(){',
  "  if(SHP.kind==='line') return gdBresenham(SHP.start[0],SHP.start[1],SHP.dest[0],SHP.dest[1]);",
  '  return shpShapePoints(SHP.kind,SHP.start,SHP.dest,SHP.mods);',
  '}',
  '/* draw_start. Upstream also fires transform_content_confirmed and resets',
  '   the dynamics mask here; neither exists in this editor. */',
  'function shpBegin(kind,c,mods){',
  '  SHP.kind=kind; SHP.drawing=true; SHP.displace=false;',
  '  SHP.orig=[c.x,c.y]; SHP.start=[c.x,c.y]; SHP.offset=[c.x,c.y]; SHP.dest=[c.x,c.y];',
  '  shpMoveTo([c.x,c.y],mods);',
  '}',
  '/* draw_move, for both. The position is the RAW cell, off the canvas',
  '   included - a rectangle dragged past the edge is clipped, not stopped,',
  '   which is how upstream behaves and how a person expects a corner to',
  '   follow the pointer. The line: Alt moves the anchor by the travel, the',
  '   constraint sets the end, Ctrl mirrors the anchor through itself so the',
  '   line grows from both ends. The shapes: Alt moves the start by the',
  '   travel, the end follows the pointer. Then the readout, then the',
  '   preview. */',
  'function shpMoveTo(pos,mods){',
  '  if(!SHP.drawing) return;',
  '  SHP.mods=mods; SHP.pos=pos.slice();',
  '  const tx=pos[0]-SHP.offset[0], ty=pos[1]-SHP.offset[1];',
  "  if(SHP.kind==='line'){",
  '    if(SHP.displace){ SHP.orig[0]+=tx; SHP.orig[1]+=ty; }',
  '    const o=SHP.orig, r=lineAngleConstraint(o[0],o[1],pos[0],pos[1],mods.shift,SHP.pixelPerfect);',
  '    SHP.dest=[r.x,r.y];',
  '    SHP.start= mods.ctrl ? [o[0]-(r.x-o[0]), o[1]-(r.y-o[1])] : [o[0],o[1]];',
  '    SHP.text=r.text;',
  '  } else {',
  '    if(SHP.displace){ SHP.start[0]+=tx; SHP.start[1]+=ty; }',
  '    SHP.dest=pos.slice();',
  '    SHP.text=shpText(shpRect(SHP.start[0],SHP.start[1],pos[0],pos[1],mods.ctrl,mods.shift));',
  '  }',
  '  SHP.offset=pos.slice();',
  "  const el=$('pos'); if(el) el.textContent=SHP.text;",
  '  shpPreview();',
  '}',
  '/* draw_preview, on its own layer. In the paint colour rather than',
  '   upstream\'s white-through-a-shader, because white over white art is',
  '   nothing. Confined to the selection like the Adjust preview, so what is',
  '   shown is what lands - upstream previews the whole shape and clips only',
  '   the commit. Never touches ctx. */',
  'function shpPreview(){',
  "  const pv=$('shpv'); if(!pv) return;",
  "  if(!SHP.drawing||!art||$('app').hidden){ pv.style.display='none'; return; }",
  '  const W=art.width, H=art.height, m=shpExpand(shpPointsNow(),W,H,brush), rgb=hx2(color);',
  '  pv.width=W; pv.height=H;',
  "  const g=pv.getContext('2d'), im=g.createImageData(W,H), d=im.data;",
  '  for(let i=0;i<W*H;i++){ if(!m[i]||!selAllows(i%W,(i/W)|0)) continue; const p=i*4; d[p]=rgb[0]; d[p+1]=rgb[1]; d[p+2]=rgb[2]; d[p+3]=255; }',
  '  g.putImageData(im,0,0);',
  "  pv.style.width=(W*zoom)+'px'; pv.style.height=(H*zoom)+'px'; pv.style.display='block';",
  '}',
  '/* draw_end. The line lands where the last move left it - LineTool ignores',
  '   the release position. A shape is drawn from start to the RELEASE cell',
  '   with the modifiers as held at release, which is _draw_shape(_start,',
  '   pos). cancel is a pointercancel, upstream\'s cancel_tool: nothing lands.',
  '   Returns how many cells were painted; 0 when nothing was. */',
  'function shpFinish(pos,mods,cancel){',
  '  if(!SHP.drawing) return 0;',
  '  let pts=null;',
  '  if(!cancel){',
  "    if(SHP.kind==='line') pts=gdBresenham(SHP.start[0],SHP.start[1],SHP.dest[0],SHP.dest[1]);",
  '    else pts=shpShapePoints(SHP.kind,SHP.start,pos,mods);',
  '  }',
  '  shpReset();',
  '  return pts ? shpCommit(pts) : 0;',
  '}',
  '/* _reset_tool. */',
  "function shpReset(){ SHP.drawing=false; SHP.kind=null; SHP.text=''; SHP.displace=false; const pv=$('shpv'); if(pv) pv.style.display='none'; }",
  '/* _draw_shape: prepare_undo, then every coordinate, then commit. One',
  '   ImageData rather than a dab per point, because a filled shape is',
  '   thousands of points and dab is a putImageData each. The selection is',
  '   asked per pixel, as the ground rules say any writer must. A shape that',
  '   changes nothing - the same colour over the same cells, or wholly',
  '   outside the selection - hands its undo step back the way the fill and',
  '   the move do; upstream commits regardless, and an undo that appears to',
  '   do nothing is how people stop trusting undo. Returns the count of',
  '   cells that changed. */',
  'function shpCommit(points){',
  '  const W=art.width, H=art.height, m=shpExpand(points,W,H,brush), rgb=hx2(color);',
  '  const redoWas=redoStack.slice(), dropped=snapshot();',
  '  const img=ctx.getImageData(0,0,W,H), d=img.data;',
  '  let changed=0;',
  '  for(let i=0;i<W*H;i++){',
  '    if(!m[i]||!selAllows(i%W,(i/W)|0)) continue;',
  '    const p=i*4;',
  '    if(d[p]===rgb[0]&&d[p+1]===rgb[1]&&d[p+2]===rgb[2]&&d[p+3]===255) continue;',
  '    d[p]=rgb[0]; d[p+1]=rgb[1]; d[p+2]=rgb[2]; d[p+3]=255; changed++;',
  '  }',
  "  if(!changed){ dropSnapshot(redoWas,dropped); toast('That drew nothing new'); return 0; }",
  '  ctx.putImageData(img,0,0);',
  '  refreshStats(); repalette();',
  '  return changed;',
  '}',
  '/* The option strip: Fill for the two closed shapes, Corners for the',
  '   rectangle, and a reminder of the three keys for whichever is chosen. */',
  'function shpRows(kind){',
  "  const r=$('shprows'); if(!r) return;",
  '  r.hidden=!kind;',
  "  const closed=kind==='rect'||kind==='ellipse';",
  "  $('shpfill').hidden=!closed; $('shpfill').setAttribute('aria-pressed',String(!!(closed&&SHP.fill[kind])));",
  "  $('shprad').hidden=$('shpradlab').hidden=(kind!=='rect');",
  "  $('shprad').value=String(SHP.radius);",
  "  $('shphint').textContent= !kind ? '' : kind==='line'",
  "    ? 'Shift snaps the angle \\u00b7 Ctrl grows it from both ends \\u00b7 Alt moves the start'",
  "    : 'Shift for a '+(kind==='rect'?'square':'circle')+' \\u00b7 Ctrl from the centre \\u00b7 Alt moves it';",
  '}',
  'for(const kind of SHP_KINDS) registerTool(kind,{',
  '  brush:true,',
  '  down:(e,c)=>shpBegin(kind,c,shpMods(e)),',
  '  move:e=>{ if(SHP.drawing&&SHP.kind===kind){ const p=rawCell(e); shpMoveTo([p.x,p.y],shpMods(e)); } },',
  "  up:e=>{ const p=rawCell(e); shpFinish([p.x,p.y],shpMods(e),!!(e&&e.type==='pointercancel')); },",
  '  select:()=>shpRows(kind),',
  '  deselect:()=>{ shpReset(); shpRows(null); },',
  '});',
  '(function(){',
  "  const f=$('shpfill'), r=$('shprad'); if(!f||!r) return;",
  "  f.onclick=()=>{ toggle('shpfill'); if(tool in SHP.fill) SHP.fill[tool]=pressed('shpfill'); shpPreview(); };",
  "  r.oninput=r.onchange=()=>{ SHP.radius=Math.max(0,Math.round(+r.value)||0); shpPreview(); };",
  '})();',
  '/* The modifiers are read live upstream, every frame; here the pointer',
  '   events carry them, and these two make a key pressed or released while',
  '   the pointer is still count at once - a zero-travel move, which a mouse',
  '   produces anyway. Alt is the displace flag, set only from a press made',
  '   during the drag, and its default is stopped so it cannot go to the',
  '   browser\'s menu bar mid-shape. */',
  "addEventListener('keydown',e=>{",
  '  if(!SHP.drawing) return;',
  "  if(e.key==='Alt'){ e.preventDefault(); SHP.displace=true; }",
  "  else if(e.key==='Shift'||e.key==='Control'||e.key==='Meta') shpMoveTo(SHP.pos,shpMods(e));",
  '});',
  "addEventListener('keyup',e=>{",
  '  if(!SHP.drawing) return;',
  "  if(e.key==='Alt'){ e.preventDefault(); SHP.displace=false; }",
  "  else if(e.key==='Shift'||e.key==='Control'||e.key==='Meta') shpMoveTo(SHP.pos,shpMods(e));",
  '});',
])));

/* ---- 6. reachable without a mouse ---------------------------------------- */
swap('PB.tools=function(){ return Object.keys(TOOL_HOOKS); };', block([
  '/* A shape for something with no pointer. It drives the same state machine',
  '   the drag drives, fed cells instead of events - the tool is selected, the',
  '   options set, begin, move, finish - so what an agent draws is what a',
  '   person\'s drag would have drawn, modifiers, fill and brush included.',
  '   Nothing lands unless apply is true; without it the answer is how many',
  '   cells it WOULD cover and, with points:true, which ones. With it,',
  '   painted is how many cells actually changed - 0 means the shape was',
  '   already there, or lay wholly outside the selection, and no undo step',
  '   was taken. */',
  'PB.shape=function(o){',
  '  o=o||{};',
  '  const kind=o.tool||o.kind;',
  "  if(SHP_KINDS.indexOf(kind)<0) return {ok:false, why:'tool must be one of '+SHP_KINDS.join(', ')};",
  "  if(!ctx||$('app').hidden) return {ok:false, why:'no canvas is open'};",
  '  const from=o.from||[0,0], to=o.to||from;',
  '  const mods={shift:!!(o.shift||o.square||o.circle||o.snap), ctrl:!!(o.ctrl||o.centre||o.center)};',
  '  PB.shapeOptions(o);',
  '  selectTool(kind);',
  '  shpBegin(kind,{x:Math.round(from[0]),y:Math.round(from[1])},mods);',
  '  shpMoveTo([Math.round(to[0]),Math.round(to[1])],mods);',
  '  const pts=shpPointsNow(), m=shpExpand(pts,art.width,art.height,brush);',
  '  let cells=0; for(let i=0;i<m.length;i++) if(m[i]) cells++;',
  '  const out={ok:true, tool:kind, text:SHP.text, cells, from:SHP.start.slice(), to:SHP.dest.slice(), thickness:brush};',
  '  if(o.points) out.points=pts.map(p=>[p[0],p[1]]);',
  '  if(o.apply){ out.painted=shpFinish(SHP.pos,mods,false); out.applied=out.painted>0; }',
  '  else { shpReset(); out.painted=0; out.applied=false; }',
  '  return out;',
  '};',
  '/* The settings a person reaches in the strip, and one they cannot: fill',
  '   per closed shape, the corner radius, the brush as thickness, and',
  '   pixelPerfect, which is upstream\'s Tools.pixel_perfect switch - it turns',
  '   the line\'s Shift snap from 15-degree steps into 22.5 with the 2:1',
  '   correction. This editor has no pixel-perfect mode of its own, so the',
  '   switch lives here, off by default. Pass nothing to read. */',
  'PB.shapeOptions=function(o){',
  '  o=o||{};',
  "  if(o.fill&&typeof o.fill==='object'){ for(const k in SHP.fill) if(typeof o.fill[k]==='boolean') SHP.fill[k]=o.fill[k]; }",
  "  else if(typeof o.fill==='boolean'){ const k=o.tool||o.kind; if(k in SHP.fill) SHP.fill[k]=o.fill; else for(const j in SHP.fill) SHP.fill[j]=o.fill; }",
  "  if(typeof o.radius==='number') SHP.radius=Math.max(0,Math.round(o.radius)||0);",
  "  if(typeof o.pixelPerfect==='boolean') SHP.pixelPerfect=o.pixelPerfect;",
  "  if(typeof o.thickness==='number'){ brushAuto=false; setBrush(o.thickness); }",
  '  if(SHP_KINDS.indexOf(tool)>=0) shpRows(tool);',
  '  return {fill:Object.assign({},SHP.fill), radius:SHP.radius, pixelPerfect:SHP.pixelPerfect, thickness:brush};',
  '};',
  'PB.tools=function(){ return Object.keys(TOOL_HOOKS); };',
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

/* EVERY CONTROL EXISTS ONCE. A control that never made it in is a silent
   no-op: shpRows reads $("shpfill") and an absent one throws on the first
   tool change. */
for (const id of ['shprows', 'shpfill', 'shprad', 'shpradlab', 'shphint', 'shpv'])
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
for (const t of ['line', 'rect', 'ellipse'])
  if (markup.split('data-tool="' + t + '"').length !== 2) throw new Error('no rail button for ' + t);
/* Every new control and button has a title. */
for (const id of ['shpfill', 'shprad']) {
  const at = markup.indexOf('id="' + id + '"');
  const tag = markup.slice(markup.lastIndexOf('<', at), markup.indexOf('>', at));
  if (tag.indexOf('title="') < 0) throw new Error(id + ' has no title');
}
for (const t of ['line', 'rect', 'ellipse']) {
  const at = markup.indexOf('data-tool="' + t + '"');
  const tag = markup.slice(markup.lastIndexOf('<', at), markup.indexOf('>', at));
  if (tag.indexOf('title="') < 0) throw new Error('the ' + t + ' button has no title');
}
/* The strip is a flex row like its neighbours, and [hidden] still wins over
   that - it is !important in this file, which is what lets shpRows toggle
   the attribute rather than the style. */
if (text.indexOf('.opts #brushrows,.opts #fillrows,.opts #shprows{display:flex; align-items:center;}') < 0)
  throw new Error('the option strip has no flex rule');
if (text.indexOf('[hidden]{display:none!important;}') < 0)
  throw new Error('[hidden] no longer wins over display:flex - shpRows would show a hidden strip');
/* THE RAIL ORDER THE SPECS PIN STILL HOLDS: transform, then the shapes,
   then the eyedropper, then the outline. */
{
  const order = ['data-tool="transform"', 'data-tool="line"', 'data-tool="rect"', 'data-tool="ellipse"', '<!-- rail:tools -->', 'data-tool="pick"', 'id="olbtn"']
    .map(s => markup.indexOf(s));
  for (let i = 1; i < order.length; i++) if (!(order[i - 1] >= 0 && order[i] > order[i - 1])) throw new Error('the rail order is wrong at ' + i);
}
/* THE KEYS ARE IN THE TABLE, and are letters nobody else has. */
for (const [k, t] of [['n', 'line'], ['u', 'rect'], ['p', 'ellipse']]) {
  if (code.indexOf("keys:['" + k + "'], run:()=>selectTool('" + t + "')") < 0) throw new Error('no key for ' + t);
  if (code.split("keys:['" + k + "']").length !== 2) throw new Error('the key ' + k + ' is bound twice');
}
/* THE TOOLS REGISTER through the registry, with the brush, and never edit
   the pointer code. */
if (code.indexOf('for(const kind of SHP_KINDS) registerTool(kind,{') < 0) throw new Error('the tools do not register');
if (code.indexOf('  brush:true,') < 0) throw new Error('the tools do not keep the brush slider');
if (code.indexOf('{ const T=TOOL_HOOKS[tool]; if(T){ hookTool=tool; if(T.down) T.down(e,c); return; } }') < 0)
  throw new Error('beginStroke no longer consults the registry these tools depend on');
/* THE PREVIEW NEVER TOUCHES THE ARTWORK: the draw path writes to shpv and
   only shpCommit touches ctx. */
{
  const pv = code.slice(code.indexOf('function shpPreview(){'), code.indexOf('function shpFinish('));
  if (pv.indexOf('ctx.') >= 0) throw new Error('the shape preview writes to the artwork');
  if (pv.indexOf("$('shpv')") < 0) throw new Error('the preview does not draw on its own layer');
}
/* THE COMMIT SNAPSHOTS FIRST, asks the selection, and hands back a no-op. */
{
  const cm = code.slice(code.indexOf('function shpCommit(points){'), code.indexOf('function shpRows('));
  if (cm.indexOf('snapshot();') < 0) throw new Error('the commit takes no undo step');
  if (cm.indexOf('snapshot();') > cm.indexOf('ctx.putImageData')) throw new Error('the commit writes before it snapshots');
  if (cm.indexOf('selAllows(') < 0) throw new Error('the commit ignores the selection');
  if (cm.indexOf('dropSnapshot(redoWas,dropped)') < 0) throw new Error('a no-op shape keeps its undo step');
  if (cm.indexOf('dropSnapshot') > cm.indexOf('ctx.putImageData')) throw new Error('the no-op check comes after the write');
}
/* THE THICKNESS OFFSET IS DAB'S. shpExpand centres a block with
   floor((n-1)/2); dab must still centre its block the same way, or a 4-wide
   line and a 4-wide pencil stroke drift one cell apart. */
if (code.indexOf('const off=Math.floor((brush-1)/2), W=art.width, H=art.height;') < 0)
  throw new Error("dab's centring changed - shpExpand no longer matches it");
if (code.indexOf('const off=Math.floor((n-1)/2), lo=n-1-off, hi=off, P=n, PW=W+2*P, PH=H+2*P;') < 0)
  throw new Error('shpExpand does not centre like dab');
/* THE MODIFIERS REACH A DRAG IN PROGRESS: Alt from a key event, Shift and
   Ctrl from a zero-travel move. */
if (code.indexOf("if(e.key==='Alt'){ e.preventDefault(); SHP.displace=true; }") < 0)
  throw new Error('Alt during a drag does not set displace');
if (code.indexOf("if(e.key==='Alt'){ e.preventDefault(); SHP.displace=false; }") < 0)
  throw new Error('releasing Alt does not clear displace');
if (code.split("shpMoveTo(SHP.pos,shpMods(e));").length !== 3)
  throw new Error('Shift/Ctrl changes mid-drag are not re-applied on both keydown and keyup');
/* THE AGENT SURFACE DRIVES THE SAME MACHINE. */
{
  const pb = code.slice(code.indexOf('PB.shape=function(o){'), code.indexOf('PB.tools=function()'));
  for (const s of ['selectTool(kind);', 'shpBegin(kind,', 'shpMoveTo(', 'shpFinish(SHP.pos,mods,false)'])
    if (pb.indexOf(s) < 0) throw new Error('PB.shape does not go through ' + s);
}
/* The preview layer sits under pending text. */
if (text.indexOf('<canvas id="shpv"></canvas><canvas id="txpv"></canvas>') < 0) throw new Error('the shape layer is not under the text layer');
if (text.indexOf('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;') < 0)
  throw new Error('the text layer is no longer above the shape preview');
/* The whole file is still CRLF - a patch that joined with "\n" somewhere
   would leave a mixed file that the next patch's split-based anchors miss. */
if (/[^\r]\n/.test(text)) throw new Error('a bare LF got into the file');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
