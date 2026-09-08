/* SNAP THE BRUSH TO THE GRID THE ART WAS DRAWN ON.

   "make a grid snapping button that you can toggle that will jump on the grid
   dots."

   The brush already takes its SIZE from the measured block. Its POSITION did
   not, so a 10x10 brush on 10x10 art landed wherever the pointer happened to
   be and painted a block straddling four real ones. Getting a single cell
   right meant hitting one pixel in a hundred.

   ONE PLACE DOES IT. cellFrom is what the pointer becomes - the hover cell,
   the readout, and the cell every stroke starts and continues from - so
   snapping there moves the cursor and the paint together, and the preview box
   is already drawn from the same cell. rawCell is left alone: the move tool
   measures a drag with it and must keep reading real pixels.

   IT ONLY APPLIES WHERE IT MEANS SOMETHING. Native art has a block size of 1,
   where a cell IS a pixel and snapping is arithmetic that changes nothing; and
   fill, eyedropper and move are not brush strokes. Default on, because when it
   does apply it is what you want, and the toggle is there for when it is not.

   ANCHORED SO THE DAB LANDS ON THE CELL. dab centres a brush of n on the cell
   it is given, offsetting by floor((n-1)/2), so the returned cell is the block
   corner PLUS that offset - which puts a block-sized brush exactly over the
   block. Clamped to the canvas, because the readout does a getImageData at
   this cell and a cell past the edge is not a pixel. */
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

/* ---- 1. the button, beside the size it works with --------------------- */
swap(block([
  '      <div class="olrow"><label for="bslider">Size</label>',
  '        <input id="bslider" type="range" min="1" max="128" step="1" value="1" aria-label="Brush size">',
  '        <span class="mono" id="bslab">1 × 1</span></div>',
]), block([
  '      <div class="olrow"><label for="bslider">Size</label>',
  '        <input id="bslider" type="range" min="1" max="128" step="1" value="1" aria-label="Brush size">',
  '        <span class="mono" id="bslab">1 × 1</span>',
  '        <button class="btn ghost" id="gsnap" aria-pressed="true"',
  '          style="width:auto;padding:6px 12px;font-size:12px;margin-left:4px"',
  '          title="Jump the brush from cell to cell on the grid the art was drawn on, instead of pixel by pixel. Art drawn one pixel at a time has no grid to snap to, so this does nothing there.">Snap</button></div>',
]));

/* ---- 2. the snap itself ------------------------------------------------ */
swap(block([
  'function cellFrom(e){',
  '  const r=art.getBoundingClientRect();',
  '  const x=Math.floor((e.clientX-r.left)/zoom), y=Math.floor((e.clientY-r.top)/zoom);',
  '  return (x<0||y<0||x>=art.width||y>=art.height)?null:{x,y};',
  '}',
]), block([
  '/* The cell a brush stroke should land on, given the cell under the pointer.',
  '',
  '   dab centres a brush of n on the cell it is handed, offsetting by',
  '   floor((n-1)/2) - so to put a block-sized brush exactly over a block, the',
  '   answer is the block CORNER plus that same offset. Returning the bare',
  '   corner would paint half a cell out of place, which looks like snapping',
  '   and is not.',
  '',
  '   Nothing to do when a cell is a pixel, when the tool is not a brush, or',
  '   when the toggle is off. Clamped, because the readout reads a pixel at',
  '   this cell and a cell past the edge is not one. */',
  'function snapCell(c){',
  '  if(!c) return c;',
  '  const g=Math.max(1,Math.round(gridBlock));',
  '  if(g<2||!pressed("gsnap")) return c;',
  '  if(tool!=="pencil"&&tool!=="eraser") return c;',
  '  const off=Math.floor((brush-1)/2);',
  '  return {x:Math.min(art.width-1, Math.floor(c.x/g)*g+off),',
  '          y:Math.min(art.height-1, Math.floor(c.y/g)*g+off)};',
  '}',
  'function cellFrom(e){',
  '  const r=art.getBoundingClientRect();',
  '  const x=Math.floor((e.clientX-r.left)/zoom), y=Math.floor((e.clientY-r.top)/zoom);',
  '  /* Bounds first, on the REAL pointer position: a pointer outside the art',
  '     is off the art whatever a snap would round it to. */',
  '  if(x<0||y<0||x>=art.width||y>=art.height) return null;',
  '  return snapCell({x,y});',
  '}',
]));

/* ---- 3. wired, and the cursor follows immediately --------------------- */
swap("$('bslider').oninput=e=>{ brushAuto=false; setBrush(+e.target.value); };", block([
  "$('bslider').oninput=e=>{ brushAuto=false; setBrush(+e.target.value); };",
  "/* paintCursor straight away, so the preview box jumps to the cell the",
  "   moment it is turned on rather than on the next mouse move. */",
  "$('gsnap').onclick=()=>{ toggle('gsnap'); paintCursor(); };",
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function snapCell(c){', '  return snapCell({x,y});',
  "$('gsnap').onclick=()=>{ toggle('gsnap'); paintCursor(); };"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="gsnap"').length !== 2)
  throw new Error('the button is not in the markup exactly once');

const sStart = code.indexOf('function snapCell(c){');
const sEnd = code.indexOf('function cellFrom(e){', sStart);
if (sStart < 0 || sEnd < 0) throw new Error('could not bound snapCell');
const fn = code.slice(sStart, sEnd);

/* THE OFFSET IS WHAT MAKES IT LAND ON THE CELL. Without it a block-sized brush
   paints half a cell out of place and still looks snapped. */
if (fn.indexOf('Math.floor((brush-1)/2)') < 0)
  throw new Error('the snap does not account for how dab centres the brush');

/* AND IT REFUSES WHERE IT WOULD BE A LIE. A block of 1 is a pixel; fill and
   move are not brush strokes. */
if (fn.indexOf('if(g<2||!pressed("gsnap")) return c;') < 0)
  throw new Error('snapping runs on native art, where a cell is a pixel');
if (fn.indexOf('tool!=="pencil"&&tool!=="eraser"') < 0)
  throw new Error('snapping is applied to tools that are not brush strokes');

/* THE BOUNDS CHECK STILL READS THE REAL POINTER. Snapping first would pull a
   pointer just off the art back onto it and paint from outside the canvas. */
const cStart = code.indexOf('function cellFrom(e){');
const cEnd = code.indexOf('\r\nfunction pixelAt(', cStart);
const cf = code.slice(cStart, cEnd);
if (cf.indexOf('if(x<0||y<0||x>=art.width||y>=art.height) return null;') > cf.indexOf('snapCell('))
  throw new Error('the bounds check happens after the snap');

/* rawCell IS UNTOUCHED - the move tool measures a drag in real pixels. */
const rStart = code.indexOf('function rawCell(');
if (rStart >= 0 && code.slice(rStart, rStart + 400).indexOf('snapCell(') >= 0)
  throw new Error('rawCell now snaps, which would quantise a drag');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
