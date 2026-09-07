/* TRAIT MODE DESTROYED ARTWORK AND REPORTED ONLY THE NEW SIZE.

   croppedAway was computed for Canvas mode alone. Trait mode scales the art
   inside a canvas it never changes, so anything the art grows past falls off
   the edge and is gone - and the message said "Trait scaled to 600 by 600 on
   a 1280 by 1280 canvas" with nothing about it.

   MEASURED. A block 300 wide at x0=0 on a 1280 canvas, grown to a 600-wide
   trait: the anchor keeps its centre at x=150, so the art wants to span -150
   to 450 and the 150 columns left of zero are destroyed. 22,500 opaque pixels
   of the 90,000 asked for. The toast named neither number.

   This is the same defect this file has already fixed twice, and its own
   comment records the first: "a 32x32 canvas filled with artwork, cropped to
   16x16, kept 256 of 1024 opaque pixels and said Canvas is now 16 by 16 under
   a tooltip promising the art was untouched."

   It matters more now than it did. Anchoring a Trait resize on the artwork
   rather than on the canvas centre is what makes an edge trait usable, and an
   edge is exactly where a grow runs out of canvas.

   ART MODE STAYS AT ZERO, and that is not an oversight. There the canvas grows
   with the artwork, so nothing falls off an edge; what croppedAway would count
   on a downscale is the resampling doing its job, and reporting that as
   artwork lost would be a false alarm on every shrink. */
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

swap([
  '  /* Canvas mode only, to save two passes over the pixels on every Art resize.',
  '     It is NOT what stops Art reporting its own resampling as a loss - the',
  '     message below appends cropLine on the canvas branch alone, so this guard',
  '     is cheapness rather than correctness. Measured: removing it changes',
  '     nothing observable, which is how the first comment here came to claim',
  '     something the line does not do. */',
  '  const cut = mode==="canvas" ? croppedAway(src,out) : 0;',
  '  toast(mode==="canvas" ? "Canvas is now "+nw+" by "+nh+cropLine(cut)',
  '      : mode==="inside" ? "Trait scaled to "+nw+" by "+nh+" on a "+W+" by "+H+" canvas"',
  '      : "Resized to "+nw+" by "+nh);',
].join(NL), [
  '  /* CANVAS AND TRAIT, not Canvas alone.',
  '',
  '     SUPERSEDES "Canvas mode only, to save two passes over the pixels on every',
  '     Art resize... removing it changes nothing observable". That was true of',
  '     the line and false of the app: Trait mode scales the art inside a canvas',
  '     it never changes, so a grow pushes artwork off the edge and destroys it,',
  '     and the message said only the new size. Measured - a 300-wide block at',
  '     x0=0 grown to a 600-wide trait keeps 22,500 of the 90,000 pixels it asked',
  '     for, silently.',
  '',
  '     ART MODE STAYS AT ZERO on purpose. Its canvas grows with the artwork so',
  '     nothing falls off an edge, and what croppedAway counts on a downscale',
  '     there is the resampling doing its job - reporting that as artwork lost',
  '     would be a false alarm on every shrink, which is the way a real warning',
  '     stops being read. */',
  '  const cut = mode==="art" ? 0 : croppedAway(src,out);',
  '  toast(mode==="canvas" ? "Canvas is now "+nw+" by "+nh+cropLine(cut)',
  '      : mode==="inside" ? "Trait scaled to "+nw+" by "+nh+" on a "+W+" by "+H+" canvas"+cropLine(cut)',
  '      : "Resized to "+nw+" by "+nh);',
].join(NL));

/* The drag handles commit through resizeTo, which reports cut for Canvas only
   for the same reason and now has the same hole. */
swap('  return { cut: mode==="canvas" ? croppedAway(src,r.data) : 0 };',
  ['  /* Trait mode too - see applyResize. A drag that grows an edge trait past',
    '     the canvas destroys the overflow exactly as the button does, and the two',
    '     are deliberately one sentence. */',
    '  return { cut: mode==="art" ? 0 : croppedAway(src,r.data) };'].join(NL));

if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  const cut = mode==="art" ? 0 : croppedAway(src,out);',
  '  return { cut: mode==="art" ? 0 : croppedAway(src,r.data) };',
  '+" canvas"+cropLine(cut)'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);
if (code.indexOf('mode==="canvas" ? croppedAway') >= 0)
  throw new Error('a canvas-only count survived');
/* Art must still be excluded, in both places. */
const artZero = code.split('mode==="art" ? 0 : croppedAway').length - 1;
if (artZero !== 2) throw new Error('expected both sites to exclude art, found ' + artZero);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
