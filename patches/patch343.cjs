/* THE RULE WAS BEING READ BEFORE THE LAYER WAS SET.

   Found by opening a real trait rather than by reading the code. A hat on the
   hats layer showed "unsorted" in the Agent panel, and the pixel size still
   arrived at 8 - which looked like the rule working and was not.

   openTraitRecord calls startEditor, then adoptBlock, and only afterwards sets
   the name, layer and status fields. adoptBlock is where the collection rule
   is looked up, so it was asking about whatever layer the select happened to
   hold - which buildLayerSelect had just defaulted to "unsorted". Asking about
   unsorted returns the body grid, so the answer was 8 by accident.

   THAT IS THE FAILURE THE EXEMPTION EXISTS TO PREVENT. A trait on chains or
   eyes would have been read as unsorted too, and forced onto the 8px grid that
   the standing decision says to leave those layers off. The right answer would
   have been "no grid rule", and nothing on screen would have said otherwise.

   So the identity is set before the rule is read. startEditor resets those
   fields by design, so they cannot move earlier than it - they move to
   immediately after it, which is the first moment they can hold the truth.
*/
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

swap(block([
  '  /* AFTER startEditor, which resets gridBlock to 1 and the brush to 1 by',
  '     design - its comment says callers that measured a block set it here. */',
  '  adoptBlock(measuredBlock(d.data,src.w,src.h));',
  '  $("tname").value=t.name; $("tlayer").value=t.layer;',
]), block([
  '  /* THE IDENTITY FIRST, because the block that follows reads it.',
  '',
  '     adoptBlock looks up the collection rule for this trait\'s LAYER, and',
  '     these three lines used to come after it - so the lookup asked about',
  '     whatever buildLayerSelect had just defaulted the select to, which is',
  '     "unsorted". Unsorted has no exemption, so it returned the body grid and',
  '     the answer looked right. It would have forced a chains or eyes trait',
  '     onto the 8px grid the standing decision keeps them off, and the panel',
  '     would have said so in the wrong layer\'s name.',
  '',
  '     They cannot move any earlier: startEditor resets these fields by',
  '     design. This is the first moment they can hold the truth. */',
  '  $("tname").value=t.name; $("tlayer").value=t.layer;',
  '  /* AFTER startEditor, which resets gridBlock to 1 and the brush to 1 by',
  '     design - its comment says callers that measured a block set it here. */',
  '  adoptBlock(measuredBlock(d.data,src.w,src.h));',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* THE ORDER IS THE FIX. Anything that checks the two lines exist but not which
   comes first would pass on exactly the code this replaces. */
const oStart = code.indexOf('async function openTraitRecord(');
if (oStart < 0) throw new Error('could not find openTraitRecord');
const body = code.slice(oStart, oStart + 4000);
const layerAt = body.indexOf('$("tlayer").value=t.layer;');
const adoptAt = body.indexOf('adoptBlock(measuredBlock(');
if (layerAt < 0) throw new Error('the layer is no longer set here');
if (adoptAt < 0) throw new Error('the block is no longer measured here');
if (layerAt > adoptAt)
  throw new Error('the rule is still read before the layer is known');

/* And exactly once each, so a stray copy cannot restore the old order. */
if (body.split('$("tlayer").value=t.layer;').length !== 2)
  throw new Error('the layer is set more than once in this path');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
