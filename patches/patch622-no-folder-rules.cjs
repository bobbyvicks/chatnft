/* patch622: NO FOLDER RULES IN FIX PIXELS.

   The owner, 2026-10-01: "i dont want specific rules for certain traits, i
   just want it to funnction so that those rules dont need to be in place".
   Three switches decided by the folder a file came from. They are gone, and
   what each one protected is now decided from the picture:

   1. LINE REPAIR AT SIZE 8 (patch614) ran only on mouths, eyes and chains
      (FIX_REPAIR8_LAYERS). It now runs on every picture fixed at size 8.
   2. LINE REPAIR AT SIZE 16, new: a line thinner than a 16 px cell stays a
      line (Circuit Board Skin's gold traces, Dogecoin Polo's collar, Noun
      Glasses' black outline, Mouth 06 and Mouth 08, Eight Lines Specs'
      rims). It runs on every picture fixed at size 16.
      Both are pixelfixer/src/pf-42-repair8.js (version pf-42-repair8/6).
      They are refused where they would:
        - switch the outline pass on or off for a shape. The pass's gate
          numbers now live in one place, OUTLINE_GATE, which the page sends
          to the worker, so the rules cannot test a stale copy;
        - move the palette's shade choice for many cells they did not touch
          (the palette guard: Walnut Chessboard's grain, Anfield Tunnel's
          wall, Yellow Hazmat's zipper);
        - read shading as a line (STEP, at 8: Red Mushroom Cap's black edge,
          the 5 px letter shadow on Wake Me Up and WAGMI Cap);
        - leave a stray (MOVE, GAP, CUT, SOLID: Ankh Earring's stem, the
          Sharingan dot, Mouth 05's stub, Black and White Rays).
   3. THE OUTLINE PASS skipped backgrounds, chains, eyes, mouths and ears
      (OUTLINE_SKIP_LAYERS). It now runs on every picture, and every picture
      gets its source. A SMALL DRAWING IS NOT THINNED: a part covering less
      than MIN_THIN_PX = 32,000 source px keeps all its black (no peel, no
      whisker cut) and still has its outline closed. Without that, the pass
      removed black that is the drawing: Smoking Pipe's rim and the dark row
      under it, Pill on Tongue's lip edge, the eyes' 2-cell lines at size 4.
      This is a size threshold chosen on the 311 saved traits, with about a
      2% margin either side. No test on the source pixels told those apart
      from what the pass thins on hats and hair. The page header says so.

   Measured on the 311 saved traits, palette on, against the live page
   65ecad7 (scratchpad/fix8/round6 and round7, each part checked by an agent
   that did not build it): size 8, 148 files and 8,461 cells change; size 16,
   245 files and 4,962 cells. Combining the parts adds no interaction: the
   result is the line-repair page's cells plus the outline change on 4 files
   at 8 (Smoking Pipe, Pill on Tongue, Golden Swarm, Bonk Impact), and none at
   16. Known costs: at 8, Bridge's lane stripes come out a darker grey,
   Casino Crown's orange inner edge goes yellow, and a few letter-edge
   highlights go on Uniswap, Hyperliquid and Coinbase. Smoking Pipe's stem
   edge is made black, as the ring rule does on every outlined shape. Bonk
   Impact's big mark keeps its stair outline at 8, as its smaller marks do.

   The engine is rebuilt from pixelfixer/src with pixelfixer/tools/build.cjs,
   as patch614 did, and the new inline must equal the new bundle.
   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const ROOT = s0.REPO;
const SRC = path.join(ROOT, 'pixelfixer', 'src');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');
const README = path.join(ROOT, 'pixelfixer', 'README.md');
const ASSETS = path.join(__dirname, 'assets');

/* ---- CHECK FIRST ------------------------------------------------------ */
const page0 = fs.readFileSync(s0.FILE, 'utf8');
if (page0.indexOf('FIX_REPAIR8_LAYERS') < 0) throw new Error('patch622 is already applied (no FIX_REPAIR8_LAYERS)');
if (page0.indexOf('edition:"Edition 03, 32 colours swapped"') < 0) throw new Error('patch621 is not applied');
const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const OPEN = '<script id="pfcore" type="text/plain">';
function inlineOf(text) {
  const a = text.indexOf(OPEN); if (a < 0 || text.indexOf(OPEN, a + 1) >= 0) throw new Error('expected exactly one engine tag');
  const s = a + OPEN.length, e = text.indexOf('</script>', s);
  return { s, e, body: text.slice(s, e) };
}
if (inlineOf(page0).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== oldBundle)
  throw new Error('the inlined engine is not the bundle as built - a drift this patch will not paper over');
const EDITS = JSON.parse(fs.readFileSync(path.join(ASSETS, 'patch622-edits.json'), 'utf8'));
if (EDITS.length !== 13) throw new Error('expected 13 page edits, found ' + EDITS.length);

/* ---- 1. the engine sources, then the bundle ---------------------------- */
function swapOnce(text, needle, replacement, what) {
  const n = text.split(needle).length - 1;
  if (n !== 1) throw new Error(what + ': expected exactly one of\n' + needle + '\nfound ' + n);
  return text.replace(needle, () => replacement);
}
const files = {
  'pf-42-repair8.js': fs.readFileSync(path.join(ASSETS, 'patch622-pf-42-repair8.js'), 'utf8'),
  'pf-99-api.js': fs.readFileSync(path.join(ASSETS, 'patch622-pf-99-api.js'), 'utf8'),
};
if (files['pf-42-repair8.js'].indexOf("'pf-42-repair8/6'") < 0) throw new Error('the module asset is not pf-42-repair8/6');
const keep = {};
for (const f of Object.keys(files)) keep[f] = fs.readFileSync(path.join(SRC, f), 'utf8');
const readme0 = fs.readFileSync(README, 'utf8');
const readmeEol = readme0.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const readme1 = swapOnce(readme0.replace(/\r\n/g, '\n'),
  ['- **At a given step of 8 on a mouth, eyes or chain (`opts.repair8`), four',
   '  rules keep lines whole.** `src/pf-42-repair8.js` is `two_stage_pack` plus',
   '  a straddle rescue, an undouble, a stroke connector and a speck cleanup,',
   '  each explained there with what it was measured on. The page passes it',
   '  its own `labOf` and `deltaE2000`. With every rule off it is',
   '  `two_stage_pack` byte for byte on 283 of 283 files.'].join('\n'),
  ['- **At a given step of 8 (`opts.repair8`) or 16 (`opts.lines16`), rules',
   '  keep lines whole, on every picture (patch622; until then size 8 ran on',
   '  mouths, eyes and chains only).** `src/pf-42-repair8.js` is',
   '  `two_stage_pack` plus a straddle rescue, an undouble, a stroke connector',
   '  and a speck cleanup at 8, and a line keeper at 16, each explained there',
   '  with what it was measured on. Guards refuse a repair that would switch',
   '  the page\'s outline pass on or off for a shape (`gate`, the page\'s',
   '  OUTLINE_GATE) or move the palette\'s shade choice for cells it did not',
   '  touch (`snap`, the page\'s palette step). The page passes its own',
   '  `labOf` and `deltaE2000`. With every rule off it is `two_stage_pack`',
   '  byte for byte.'].join('\n'), 'README.md').replace(/\n/g, readmeEol);
let newBundle;
try {
  for (const f of Object.keys(files)) fs.writeFileSync(path.join(SRC, f), files[f]);
  fs.writeFileSync(README, readme1);
  delete require.cache[require.resolve(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'))];
  require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
  newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
  for (const need of ["'pf-42-repair8/6'", 'PF.lines16_pack = function', 'PF.lines16_pack(rgba, r.cols, r.rows, opts.lines16)'])
    if (newBundle.indexOf(need) < 0) throw new Error('the rebuilt bundle lacks: ' + need);
  new Function(newBundle);
} catch (e) {
  /* put the sources back: nothing is left half-written */
  for (const f of Object.keys(keep)) fs.writeFileSync(path.join(SRC, f), keep[f]);
  fs.writeFileSync(README, readme0);
  fs.writeFileSync(BUNDLE, oldBundle + '\n');
  throw e;
}

/* ---- 2. the page ------------------------------------------------------ */
const doc = s0.start([['function fixOutlineApply(out,rel,srcPic){', 'fixOutlineApply is not patch618\'s'],
  ['function fixRepair8(step,rel){', 'fixRepair8 is not patch614\'s']]);
for (const e of EDITS) doc.swap(e.anchor.replace(/\n/g, NL), e.becomes.replace(/\n/g, NL));
doc.swap(inlineOf(page0).body, NL + newBundle.split('\n').join(NL) + NL);

doc.finish(({ text, code, must }) => {
  for (const gone of ['OUTLINE_SKIP_LAYERS', 'FIX_REPAIR8_LAYERS', 'FIX_LINES16_LAYERS'])
    if (text.indexOf(gone) >= 0) throw new Error('still in the page: ' + gone);
  if (code.indexOf('opts.layer') >= 0) throw new Error('opts.layer is still read');
  must('function fixRepair8(step){', 'fixRepair8 by step only');
  must('function fixLines16(step){', 'fixLines16 by step only');
  must('MIN_THIN_PX = 32000', 'the small-drawing rule');
  must('var OUTLINE_GATE = ', 'the gate numbers in one place');
  if (inlineOf(text).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== newBundle)
    throw new Error('the inline is not the new bundle');
});
