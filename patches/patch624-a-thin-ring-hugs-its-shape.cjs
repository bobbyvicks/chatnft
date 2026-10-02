/* patch624: AT SIZE 16 A THIN RING ROUND A SHAPE COMES OUT WHOLE, AND THE SPACE THE SOURCE DRAWS STAYS.

   The owner, about GATE Hoodie at size 16: "like the white outline for ghate, would there be something that could
   be fxed?" The source draws a 6-7 px white ring round the yellow G A T E letters on navy. At 16 px cells that is
   under half a cell, so it wins no cell's vote; the line keeper (patch622) only reaches a line that straddles two
   cells, and the ring came out as scattered white dots (45 yellow cells touching navy).

   HUG (scratchpad/fix8/round8/gate8, pf-42-repair8/7) reads only the picture: a thin line piece (mean thickness at
   most one cell) that runs round most of a shape's edge (ROUND: at least 75% of the shape's edge, while the
   outside is not ringed) is drawn in the outside cells beside that shape, in the line's own colour. It never takes
   a shape cell or an empty cell, and the gate and palette guards judge it like any other rule.

   GAP (scratchpad/fix8/round9/gate9, pf-42-repair8/8): a cell HUG would paint stays the outside colour when the
   source shows the outside colour there at least as much as the line, closed off on both sides along a row or
   column within 1.75 cells - so the G's hole, the A's notch and the navy between letters stay navy, as drawn.

   Measured on the 311 saved traits against a6d9799, palette on: 8 files / 37 cells at 16, 3 / 10 at 8; 0 at 4
   and 10. GATE Hoodie at 16: a white ring round every letter except at the 12 navy cells the source keeps; all
   120 yellow cells as before; at 8 unchanged. Every trait the owner has seen fixed (Circuit Board, Dogecoin Polo,
   Noun Glasses, Eight Lines Specs, Mouth 06/08, Red Mushroom Cap, Smoking Pipe, Wake Me Up) is unchanged. Known
   costs: Supreme Hoodie 2 red cells above the box at 16; Red Plaid a 1-cell navy notch in the lapel at 16; 5 GATE
   ring cells sit where the source has almost no white (the ring drawn one cell outside the letter: a white row
   under the T's bar, and the G|A gap one cell narrower at rows 73-74); R Place Mosaic's yellow edging comes back
   on one side only at 8. Each part was checked by agents that did not build it.

   The engine is rebuilt from pixelfixer/src with pixelfixer/tools/build.cjs, as patch614 and patch622 did, and
   the new inline must equal the new bundle. Nothing else in the page changes.
   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const ROOT = s0.REPO;
const SRC = path.join(ROOT, 'pixelfixer', 'src');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');
const MODULE = path.join(SRC, 'pf-42-repair8.js');
const ASSET = path.join(__dirname, 'assets', 'patch624-pf-42-repair8.js');

/* ---- CHECK FIRST ------------------------------------------------------ */
const page0 = fs.readFileSync(s0.FILE, 'utf8');
if (page0.indexOf("'pf-42-repair8/6'") < 0) throw new Error('the page does not carry pf-42-repair8/6 (patch622) - or patch624 is already applied');
const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const OPEN = '<script id="pfcore" type="text/plain">';
function inlineOf(text) {
  const a = text.indexOf(OPEN); if (a < 0 || text.indexOf(OPEN, a + 1) >= 0) throw new Error('expected exactly one engine tag');
  const s = a + OPEN.length, e = text.indexOf('</script>', s);
  return { s, e, body: text.slice(s, e) };
}
if (inlineOf(page0).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== oldBundle)
  throw new Error('the inlined engine is not the bundle as built - a drift this patch will not paper over');
const next = fs.readFileSync(ASSET, 'utf8');
if (next.indexOf("'pf-42-repair8/8'") < 0) throw new Error('the module asset is not pf-42-repair8/8');
for (const need of ['HUG_ON', 'HUG_GAP'])
  if (next.indexOf(need) < 0) throw new Error('the module asset lacks ' + need);

/* ---- 1. the engine source, then the bundle ----------------------------- */
const keep = fs.readFileSync(MODULE, 'utf8');
let newBundle;
try {
  fs.writeFileSync(MODULE, next);
  delete require.cache[require.resolve(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'))];
  require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
  newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
  if (newBundle.indexOf("'pf-42-repair8/8'") < 0) throw new Error('the rebuilt bundle lacks pf-42-repair8/8');
  new Function(newBundle);
} catch (e) {
  fs.writeFileSync(MODULE, keep);
  fs.writeFileSync(BUNDLE, oldBundle + '\n');
  throw e;
}

/* ---- 2. the page: only the inline engine ------------------------------- */
const doc = s0.start([['function fixRepair8(step){', 'patch622 is not applied']]);
doc.swap(inlineOf(page0).body, NL + newBundle.split('\n').join(NL) + NL);
doc.finish(({ text }) => {
  if (inlineOf(text).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== newBundle)
    throw new Error('the inline is not the new bundle');
  const outside = t => { const i = inlineOf(t); return t.slice(0, i.s) + t.slice(i.e); };
  if (outside(text) !== outside(page0)) throw new Error('something outside the engine changed');
});
