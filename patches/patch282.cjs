/* THE CROP COUNT WAS THE WRONG INSTRUMENT FOR A TRAIT RESIZE.

   patch281 pointed croppedAway at Trait mode. croppedAway compares the number
   of opaque pixels BEFORE against the number AFTER, which is exact for a
   canvas crop - the art is not touched, so any drop is art that fell off - and
   meaningless when the art is scaled at the same time.

   MEASURED. The 300-wide block at x0=0 grown to a 600-wide trait: 90,000
   opaque before, 270,000 after, so croppedAway returns max(0, 90000-270000) =
   0 while 90,000 pixels of the scaled artwork really did run off the left
   edge. The message went back to saying nothing, and the test written for it
   went red - which is the only reason this was caught rather than shipped as
   a green count of zero.

   THE COMPARISON HAS TO BE AGAINST THE SCALED ARTWORK, not the original.
   scaleInside is the only place holding both: the full scaled buffer before it
   is placed on the canvas, and the canvas afterwards. Same artwork at the same
   scale, so the difference is exactly what did not fit - and croppedAway,
   pointed at those two, is right again without changing a line of it.

   So scaleInside returns what it lost rather than the caller guessing, which
   is the same shape resizeOp already has for "the pixels AND the canvas size
   they belong on": the operation reports its own consequences. */
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

/* ---- scaleInside reports what did not fit -------------------------- */
swap([
  'function scaleInside(src,W,H,nw,nh){',
  '  const box=contentBox();',
  '  if(!box||!box.w||!box.h) return recanvas(scaleArt(src,W,H,nw,nh),nw,nh,W,H);',
].join(NL), [
  '/* Returns {data,lost}: the pixels, and how much scaled artwork ran off the',
  '   canvas placing them.',
  '',
  '   LOST IS MEASURED HERE BECAUSE HERE IS THE ONLY PLACE IT CAN BE. A caller',
  '   comparing the canvas before and after is comparing two different scales,',
  '   and croppedAway - which counts opaque pixels - then answers 0 for a grow',
  '   that destroyed a third of the trait, because scaling up added more pixels',
  '   than the edge took away. Measured: a 300-wide block at x0=0 grown to 600',
  '   went 90,000 opaque to 270,000, and the loss of 90,000 read as zero.',
  '',
  '   The two buffers below are the SAME artwork at the SAME scale, one placed',
  '   on the canvas and one not, so their difference is exactly what did not',
  '   fit. */',
  'function scaleInside(src,W,H,nw,nh){',
  '  const box=contentBox();',
  '  if(!box||!box.w||!box.h)',
  '    return {data:recanvas(scaleArt(src,W,H,nw,nh),nw,nh,W,H), lost:0};',
].join(NL));

swap([
  '  const cx=box.x0+box.w/2, cy=box.y0+box.h/2;',
  '  return recanvasAt(scaleArt(src,W,H,cw,ch),cw,ch,W,H,',
  '    cx-cx*(cw/W), cy-cy*(ch/H));',
  '}',
].join(NL), [
  '  const cx=box.x0+box.w/2, cy=box.y0+box.h/2;',
  '  const big=scaleArt(src,W,H,cw,ch);',
  '  const out=recanvasAt(big,cw,ch,W,H,cx-cx*(cw/W), cy-cy*(ch/H));',
  '  return {data:out, lost:croppedAway(big,out)};',
  '}',
].join(NL));

/* ---- resizeOp passes it through ------------------------------------ */
swap([
  '  if(mode==="canvas") return {data:recanvas(src,W,H,nw,nh), w:nw, h:nh};',
  '  if(mode==="inside") return {data:scaleInside(src,W,H,nw,nh), w:W, h:H};',
  '  return {data:scaleArt(src,W,H,nw,nh), w:nw, h:nh};',
].join(NL), [
  '  if(mode==="canvas") return {data:recanvas(src,W,H,nw,nh), w:nw, h:nh, lost:null};',
  '  /* lost comes from the operation rather than from a comparison the caller',
  '     makes afterwards - see scaleInside. null elsewhere means "ask the',
  '     caller\'s own count", which for Canvas mode is exact. */',
  '  if(mode==="inside"){ const s=scaleInside(src,W,H,nw,nh);',
  '    return {data:s.data, w:W, h:H, lost:s.lost}; }',
  '  return {data:scaleArt(src,W,H,nw,nh), w:nw, h:nh, lost:0};',
].join(NL));

/* ---- both callers read it ------------------------------------------ */
swap('  const cut = mode==="art" ? 0 : croppedAway(src,out);',
  ['  /* From the operation when it measured its own loss, and from the canvas',
    '     comparison when it did not. Canvas mode does not scale, so before and',
    '     after are the same artwork and the count is exact there. */',
    '  const cut = r.lost===null ? croppedAway(src,out) : r.lost;'].join(NL));

swap([
  '  /* Trait mode too - see applyResize. A drag that grows an edge trait past',
  '     the canvas destroys the overflow exactly as the button does, and the two',
  '     are deliberately one sentence. */',
  '  return { cut: mode==="art" ? 0 : croppedAway(src,r.data) };',
].join(NL), [
  '  /* Trait mode too - see applyResize. A drag that grows an edge trait past',
  '     the canvas destroys the overflow exactly as the button does, and the two',
  '     are deliberately one sentence. */',
  '  return { cut: r.lost===null ? croppedAway(src,r.data) : r.lost };',
].join(NL));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  return {data:out, lost:croppedAway(big,out)};',
  '  const cut = r.lost===null ? croppedAway(src,out) : r.lost;',
  '  return { cut: r.lost===null ? croppedAway(src,r.data) : r.lost };',
  'w:nw, h:nh, lost:null};'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The wrong comparison must be gone from both callers. */
if (code.indexOf('mode==="art" ? 0 : croppedAway') >= 0)
  throw new Error('a caller still compares across two scales');

/* scaleInside now returns an object everywhere, or resizeOp reads .data off a
   typed array and lands a blank canvas without throwing. */
const bare = code.split('return recanvas(scaleArt(src,W,H,nw,nh),nw,nh,W,H);').length - 1;
if (bare !== 0) throw new Error('a scaleInside path still returns bare pixels');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
