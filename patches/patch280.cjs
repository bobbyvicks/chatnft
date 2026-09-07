/* SHRINKING A TRAIT DRAGGED IT INTO THE MIDDLE OF THE CANVAS.

   Trait mode is the one that keeps the collection canvas and resizes only the
   artwork on it, which is what an edge trait needs - a back piece, a lightsaber,
   anything drawn hard against the frame. It scaled the whole canvas and then
   recanvassed back to the original size, and recanvas CENTRES. So the artwork
   was pulled toward the middle by however much it had been shrunk.

   MEASURED. A back trait on a 1280 canvas: a block 300 wide sitting hard
   against the left edge at x0=0, y 500-799. Shrunk to a 150-wide trait:

     mode     canvas          artwork
     art      1280 -> 640     x0 0, and the 1280 grid is gone
     canvas   1280 -> 640     GONE - a centred crop took the middle and
                              destroyed all 90,000 pixels of it
     inside   1280 -> 1280    x0 0 -> 320

   So the only mode that keeps the full grid also moves the art 320px away
   from the edge it was drawn against, and putting it back means dragging it
   out again - past the edge, where what leaves is destroyed.

   THE ANCHOR IS THE ARTWORK'S OWN CENTRE. Shrinking a trait means making that
   thing smaller where it is, which is what every editor does with a scaled
   selection: a piece over the left shoulder stays over the left shoulder. The
   same block now lands at x0=75 with its centre unmoved at 149.5, and the
   remaining 75px is a lossless drag rather than a destructive one.

   Centring stays the rule for a CANVAS resize, where there is no artwork
   anchor to speak of and the pinned base and the quarter turns both centre -
   recanvas keeps that, and the offset simply moves out of it so that a caller
   with a better anchor can say so. */
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

/* ---- 1. the offset moves out of recanvas --------------------------- */
swap([
  '  const ox=Math.floor(nw/2)-Math.floor(W/2), oy=Math.floor(nh/2)-Math.floor(H/2);',
  '  for(let y=0;y<nh;y++){',
  '    const sy=y-oy; if(sy<0||sy>=H) continue;',
  '    for(let x=0;x<nw;x++){',
  '      const sx=x-ox; if(sx<0||sx>=W) continue;',
  '      const s=(sy*W+sx)*4, d=(y*nw+x)*4;',
  '      out[d]=src[s]; out[d+1]=src[s+1]; out[d+2]=src[s+2]; out[d+3]=src[s+3];',
  '    }',
  '  }',
  '  return out;',
  '}',
].join(NL), [
  '  return recanvasAt(src,W,H,nw,nh,',
  '    Math.floor(nw/2)-Math.floor(W/2), Math.floor(nh/2)-Math.floor(H/2));',
  '}',
  '',
  '/* The same copy at an offset the CALLER chooses.',
  '',
  '   Split out of recanvas rather than duplicated, because the two guards below',
  '   - the ones that turn a negative offset into a crop without a second branch',
  '   - are the whole of why this is right, and a second copy of them is a second',
  '   chance to get one wrong. recanvas is now this with the centring offsets,',
  '   and its comment above records why centring is the right default there.',
  '',
  '   Anything landing outside the new canvas is dropped, exactly as before;',
  '   croppedAway is what counts it and cropLine is what says so. */',
  'function recanvasAt(src,W,H,nw,nh,ox,oy){',
  '  const out=new Uint8ClampedArray(nw*nh*4);',
  '  ox=Math.round(ox)|0; oy=Math.round(oy)|0;',
  '  for(let y=0;y<nh;y++){',
  '    const sy=y-oy; if(sy<0||sy>=H) continue;',
  '    for(let x=0;x<nw;x++){',
  '      const sx=x-ox; if(sx<0||sx>=W) continue;',
  '      const s=(sy*W+sx)*4, d=(y*nw+x)*4;',
  '      out[d]=src[s]; out[d+1]=src[s+1]; out[d+2]=src[s+2]; out[d+3]=src[s+3];',
  '    }',
  '  }',
  '  return out;',
  '}',
].join(NL));

/* recanvas allocated `out` and then never used it once the body moved. */
swap([
  'function recanvas(src,W,H,nw,nh){',
  '  const out=new Uint8ClampedArray(nw*nh*4);',
].join(NL), [
  'function recanvas(src,W,H,nw,nh){',
].join(NL));

/* ---- 2. Trait mode anchors on the artwork -------------------------- */
swap([
  '  const cw=Math.max(1,Math.min(4096,Math.round(W*(nw/box.w))));',
  '  const ch=Math.max(1,Math.min(4096,Math.round(H*(nh/box.h))));',
  '  return recanvas(scaleArt(src,W,H,cw,ch),cw,ch,W,H);',
].join(NL), [
  '  const cw=Math.max(1,Math.min(4096,Math.round(W*(nw/box.w))));',
  '  const ch=Math.max(1,Math.min(4096,Math.round(H*(nh/box.h))));',
  '  /* WHERE THE ARTWORK WAS, not the middle of the canvas.',
  '',
  '     This used to hand the scaled canvas to recanvas, which centres - so a',
  '     back trait drawn hard against the left edge came back 320px in from it',
  '     on a 1280 canvas, and getting it home again meant dragging it out past',
  '     the edge where what leaves is destroyed. Trait mode is the only mode',
  '     that keeps the collection canvas, so it is the only one an edge trait',
  '     can use, and it was the one that would not leave art at an edge.',
  '',
  '     The artwork centre is the anchor: a piece over the left shoulder stays',
  '     over the left shoulder and gets smaller, which is what scaling a',
  '     selection does everywhere else. A point p on the old canvas lands at',
  '     p*k on the scaled one, so putting the centre back where it was is an',
  '     offset of c - c*k, and k is read from the ROUNDED cw rather than from',
  '     the requested ratio - they differ by up to half a pixel and the offset',
  '     has to agree with the pixels actually produced. */',
  '  const cx=box.x0+box.w/2, cy=box.y0+box.h/2;',
  '  return recanvasAt(scaleArt(src,W,H,cw,ch),cw,ch,W,H,',
  '    cx-cx*(cw/W), cy-cy*(ch/H));',
].join(NL));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function recanvasAt(src,W,H,nw,nh,ox,oy){',
  '  const cx=box.x0+box.w/2, cy=box.y0+box.h/2;',
  '  return recanvasAt(scaleArt(src,W,H,cw,ch),cw,ch,W,H,'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE copy of the copy loop. Two would be two chances to get the crop guards
   wrong, which is the reason this was split rather than duplicated. */
const loops = code.split('const sx=x-ox; if(sx<0||sx>=W) continue;').length - 1;
if (loops !== 1) throw new Error('expected one copy loop, found ' + loops);

/* Trait mode must no longer reach the centring path at all. */
if (code.indexOf('return recanvas(scaleArt(src,W,H,cw,ch),cw,ch,W,H);') >= 0)
  throw new Error('Trait mode still centres');

/* Canvas mode still does, and so does the empty-artwork fallback: with no
   artwork there is no anchor to keep. */
if (code.indexOf('if(mode==="canvas") return {data:recanvas(src,W,H,nw,nh), w:nw, h:nh};') < 0)
  throw new Error('Canvas mode changed');
if (code.indexOf('if(!box||!box.w||!box.h) return recanvas(scaleArt(src,W,H,nw,nh),nw,nh,W,H);') < 0)
  throw new Error('the empty-artwork fallback changed');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
