/* TWO TOOLS THAT LOST THE POINTER'S REAL PATH, IN OPPOSITE DIRECTIONS.

   ONE: A PENCIL STROKE THAT LEAVES THE CANVAS AND COMES BACK PAINTS A STRAIGHT
   LINE ACROSS ARTWORK THE POINTER NEVER CROSSED.

   stroke() takes its cell from cellFrom(e), which returns null outside the
   art, and bails with `if(!c) return;` BEFORE updating lastCell. So every move
   made off the canvas is discarded entirely - not clipped, not recorded.
   `painting` stays true and lastCell keeps the last ON-canvas cell. Come back
   onto the art somewhere else and the interpolation runs from that stale cell
   straight to the new one, dabbing every step of a chord the pointer never
   travelled.

   Measured on a 40x40 canvas: press at cell (39,0), move 200px above and left
   of the art, move back at cell (0,39), release - 40 pixels painted, a clean
   diagonal from corner to corner.

   THE FILE ALREADY HAS THE RULE AND STATES IT. The shade tool's move hook:

     /* Off the art the stroke keeps its path, as Pixelorama's does: each
        pixel is clipped, not the line. *\/
     const p=c||rawCell(e);

   Pencil and eraser were the only stroke tools dropping the path instead of
   clipping the pixels. They take the same line now.

   AND THE DAB IS SKIPPED WHERE IT CANNOT REACH, which is not the same as
   skipping the point: the LINE still runs through the off-canvas cells, so
   what lands on the art is exactly the path. dab() already clips, but the
   pixel-perfect path reads a pixel back per step to decide about corners, and
   a long drag off the canvas would be thousands of getImageData calls to
   discover that nothing can be painted. The margin is the brush radius,
   because a wide brush whose centre is just off the art still paints its
   inside edge - and mirroring maps outside to outside, so a skipped point has
   no mirror that could have landed.

   TWO: GRID SNAP SNAPPED THE START OF A LINE, RECTANGLE OR ELLIPSE AND NOT THE
   END.

   snapCell deliberately covers the shape tools - its guard admits any tool
   registered with brush:true, and the comment says why: "a control that does
   nothing for the tool showing it is a lie". The press arrives through
   cellFrom, so SHP.start is on the grid. The move and up hooks then threw that
   away and called rawCell(e), so SHP.dest never was.

   Measured on 10px block art with Snap on, which is the default: press inside
   the cell at (30,40), release inside the cell at (90,100). SHP.start (34,44),
   the snapped corner plus the brush offset, correct. SHP.dest (97,104), raw.
   Painted box [30,40,102,109] - left and top edges on the grid, right edge
   running 93..102 straight through the boundary at 99/100. Two of the four
   edges land mid-block on the art this editor exists to make.

   RAW ONCE OFF THE CANVAS, which is a recorded decision and not an oversight:
   "The position is the RAW cell, off the canvas included - a rectangle dragged
   past the edge is clipped, not stopped, which is how upstream behaves and how
   a person expects a corner to follow the pointer." snapCell clamps to
   art.width-1, so wrapping rawCell in it would drag the corner back onto the
   canvas and break that. `c||rawCell(e)` keeps both, which is exactly why the
   shade tool is written that way.

   The move hook is HANDED the cell already - T.move(e,c) - so it uses it. The
   up hook is called as T.up(e) with one argument, including from the scripted
   replay at the bottom of the file, so it works it out from the event. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the pencil keeps its path ---- */
{
  const fn0 = kit.inFunction(L, 'function stroke(e){');
  const at = kit.only(L, l => l === '  const c=cellFrom(e); if(!c) return;', 'the stroke cell', fn0);
  if (L[at - 1] !== 'function stroke(e){')
    throw new Error('the stroke is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '  /* OFF THE ART THE STROKE KEEPS ITS PATH, as the shade tool already says',
    '     and does: each pixel is clipped, not the line. This bailed before',
    '     touching lastCell, so a pointer that left the canvas and came back',
    '     somewhere else drew a straight chord across everything in between. */',
    '  const c=cellFrom(e);',
    '  const p=c||rawCell(e);',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(lastCell){ const dx=c.x-lastCell.x, dy=c.y-lastCell.y, n=Math.max(Math.abs(dx),Math.abs(dy));',
    'the stroke interpolation');
  if (L[at + 1] !== '    for(let i=1;i<=n;i++) pts.push({x:lastCell.x+Math.round(dx*i/n),y:lastCell.y+Math.round(dy*i/n)}); }'
    || L[at + 2] !== '  else pts.push(c);')
    throw new Error('the stroke interpolation is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  if(lastCell){ const dx=p.x-lastCell.x, dy=p.y-lastCell.y, n=Math.max(Math.abs(dx),Math.abs(dy));',
    '    for(let i=1;i<=n;i++) pts.push({x:lastCell.x+Math.round(dx*i/n),y:lastCell.y+Math.round(dy*i/n)}); }',
    '  /* The first point of a stroke only counts if it is on the art. After',
    '     that the line carries the position whether it is or not. */',
    '  else if(c) pts.push(c);',
  ]);
}
{
  const at = kit.only(L, l => l === '  const rgb=hx2(color);', 'the stroke colour');
  if (L[at + 1] !== '  for(const p of pts){')
    throw new Error('the stroke paint loop is not where this expects it');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  const rgb=hx2(color);',
    '  /* WHERE THE DAB CANNOT REACH, SKIP IT - not the point, the dab. The line',
    '     still runs through these cells, so what lands on the art is exactly',
    '     the path. dab() clips anyway, but the pixel-perfect path reads a pixel',
    '     back per step to decide about corners, and a long drag off the canvas',
    '     would be thousands of reads to find out nothing can be painted.',
    '',
    '     The margin is the brush radius, because a wide brush whose centre is',
    '     just off the art still paints its inside edge. Mirroring maps outside',
    '     to outside, so a point skipped here has no mirror that would have',
    '     landed either. */',
    '  const reach=Math.floor((brush-1)/2)+1;',
    '  for(const q of pts){',
    '    if(q.x<-reach||q.y<-reach||q.x>=art.width+reach||q.y>=art.height+reach) continue;',
  ]);
}
{
  const at = kit.only(L, l => l === '    if(tool===\'pencil\') dabSym(p.x,p.y,rgb,255);', 'the pencil dab');
  if (L[at + 1] !== '    else if(tool===\'eraser\') dabSym(p.x,p.y,[0,0,0],0);'
    || L[at + 2] !== '  }'
    || L[at + 3] !== '  lastCell=c;')
    throw new Error('the stroke tail is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    '    if(tool===\'pencil\') dabSym(q.x,q.y,rgb,255);',
    '    else if(tool===\'eraser\') dabSym(q.x,q.y,[0,0,0],0);',
    '  }',
    '  /* The position the pointer REACHED, on the art or not - that is what',
    '     makes the next segment follow the path rather than cut across it. */',
    '  lastCell=p;',
  ]);
}

/* ---- 2. and Grid Snap holds both ends of a shape ---- */
{
  const at = kit.only(L, l => l === '  move:e=>{ if(SHP.drawing&&SHP.kind===kind){ const p=rawCell(e); shpMoveTo([p.x,p.y],shpMods(e)); } },',
    'the shape move hook');
  if (L[at + 1] !== '  up:e=>{ const p=rawCell(e); shpFinish([p.x,p.y],shpMods(e),!!(e&&e.type===\'pointercancel\')); },')
    throw new Error('the shape hooks are not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* SNAPPED ON THE ART, RAW OFF IT. snapCell covers these tools on purpose',
    '     - its guard admits anything registered with brush:true - so the press',
    '     landed on the grid and these two threw that away, leaving the far edge',
    '     of every shape running through a block. Measured on 10px blocks with',
    '     Snap on: start (34,44) snapped, dest (97,104) raw, painted box right',
    '     edge 93..102 straddling the boundary at 99/100.',
    '',
    '     Not snapCell(rawCell(e)): snapCell clamps to art.width-1, and a corner',
    '     dragged past the edge is meant to be clipped rather than stopped. The',
    '     cell the dispatcher already computed is snapped when it is on the art',
    '     and null when it is not - the pattern the shade tool uses - and keeps',
    '     both rules. */',
    '  move:(e,c)=>{ if(SHP.drawing&&SHP.kind===kind){ const p=c||rawCell(e); shpMoveTo([p.x,p.y],shpMods(e)); } },',
    '  /* T.up is called with one argument - including by the scripted replay -',
    '     so this works the cell out rather than being handed it. */',
    '  up:e=>{ const p=cellFrom(e)||rawCell(e); shpFinish([p.x,p.y],shpMods(e),!!(e&&e.type===\'pointercancel\')); },',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  /* THE STROKE CARRIES THE POSITION IT REACHED. */
  const st = kit.inFunction(codeLines, 'function stroke(e){');
  const stb = codeLines.slice(st.start, st.end + 1).join('\n');
  if (/const c=cellFrom\(e\); if\(!c\) return;/.test(stb))
    throw new Error('the stroke still throws away every position off the art');
  if (!/const p=c\|\|rawCell\(e\);/.test(stb))
    throw new Error('the stroke does not fall back to the raw position');
  if (!/lastCell=p;/.test(stb) || /lastCell=c;/.test(stb))
    throw new Error('the stroke remembers the clipped position rather than the real one');
  /* The line is interpolated to the REAL position, or the chord comes back. */
  if (!/const dx=p\.x-lastCell\.x, dy=p\.y-lastCell\.y/.test(stb))
    throw new Error('the interpolation still runs to the on-canvas cell only');
  /* And the first point of a stroke is only painted when it is on the art. */
  if (!/else if\(c\) pts\.push\(c\);/.test(stb))
    throw new Error('a stroke could begin by painting a point that is off the art');
  /* The dab is skipped where it cannot reach - the point is not. */
  if (!/const reach=Math\.floor\(\(brush-1\)\/2\)\+1;/.test(stb))
    throw new Error('there is no reach margin, so a wide brush loses its inside edge');
  if (!/if\(q\.x<-reach\|\|q\.y<-reach\|\|q\.x>=art\.width\+reach\|\|q\.y>=art\.height\+reach\) continue;/.test(stb))
    throw new Error('every off-canvas step still reads a pixel back to find out it cannot paint');
  /* The loop paints the interpolated point, not the endpoint. A rename that
     missed one of these would paint the end position once per step. */
  if (!/dabSym\(q\.x,q\.y,rgb,255\)/.test(stb) || !/dabSym\(q\.x,q\.y,\[0,0,0\],0\)/.test(stb))
    throw new Error('the paint loop no longer paints the point it is on');

  /* AND BOTH ENDS OF A SHAPE ARE SNAPPED WHILE THEY ARE ON THE ART. */
  const code = codeLines.join('\n');
  if (/move:e=>\{ if\(SHP\.drawing&&SHP\.kind===kind\)\{ const p=rawCell\(e\);/.test(code))
    throw new Error('a shape still follows the unsnapped pointer while it is drawn');
  if (!/move:\(e,c\)=>\{ if\(SHP\.drawing&&SHP\.kind===kind\)\{ const p=c\|\|rawCell\(e\); shpMoveTo/.test(code))
    throw new Error('the shape move hook does not take the cell it is handed');
  if (!/up:e=>\{ const p=cellFrom\(e\)\|\|rawCell\(e\); shpFinish/.test(code))
    throw new Error('the far corner of a finished shape is still unsnapped');
  /* NOT snapCell(rawCell(e)): that clamps to the canvas and stops a corner
     being dragged past the edge, which a comment records as deliberate. */
  if (/snapCell\(rawCell\(e\)\)/.test(code))
    throw new Error('a corner dragged past the edge would be stopped rather than clipped');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
