/* patch625: THE PALETTE GUARD SNAPS EACH PICTURE ONCE - SAME OUTPUT, LESS WAITING.

   Measured by another session on the 47 saved backgrounds (2026-10-02): patch622's palette guard ran the page's
   palette step over the whole picture 4 to 8 times per picture at size 8, about half of them on bytes it had
   already snapped, and the worker then snapped the final cells once more. A folder of 47 backgrounds went from
   about 24 s to 55-76 s, a busy single from 1.5-1.9 s to 6.4-13.1 s, and the bar sat at 70% the whole time.
   The owner had asked earlier: "can we make it go quicker".

   Now (scratchpad/fix8/speed625, checked by an agent that did not build it):
   - pf-42-repair8/9: a guard round snaps its cells once and both guards read that answer; the outline-gate guard
     is not asked when the rules changed no cell's label or opacity; no guard at all when, besides, the rules
     changed no cell; round 0 reuses the cells painted for that test.
   - The page's worker memoises its palette step per picture (snapOnce: a hash finds a candidate, the bytes are
     compared in full before an answer is reused), so the final snap of the guard's last cells is the answer the
     guard already had.
   - The bar moves: "cells voted", the rules, then each guard round, labelled by what that round checked (the
     outline gate, the palette, or both).

   NO OUTPUT CHANGES: saved cells, cells after the palette step, the engine's own cells and the palette counts are
   byte-identical to patch624's on all 311 saved traits at sizes 4, 8, 10 and 16, palette on and off. Snaps per
   picture fell to one per distinct input (at 8: 1,623 calls on 571 inputs -> 571). Headless Chromium, medians of
   3: folder of 47 at 8 59.9 s -> 42.3 s, at 16 37.3 s -> 35.6 s; 6 heavy singles at 8 37.5 s -> 25.9 s. Not back
   to 24 s: what remains is the cell vote, the rules and the colour step, not the guard.

   The engine is rebuilt from pixelfixer/src with pixelfixer/tools/build.cjs, as patch614/622/624 did.
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
const ASSETS = path.join(__dirname, 'assets');

/* ---- CHECK FIRST ------------------------------------------------------ */
const page0 = fs.readFileSync(s0.FILE, 'utf8');
if (page0.indexOf("'pf-42-repair8/8'") < 0) throw new Error('the page does not carry pf-42-repair8/8 (patch624) - or patch625 is already applied');
if (page0.indexOf('function snapOnce') >= 0) throw new Error('patch625 is already applied');
const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const OPEN = '<script id="pfcore" type="text/plain">';
function inlineOf(text) {
  const a = text.indexOf(OPEN); if (a < 0 || text.indexOf(OPEN, a + 1) >= 0) throw new Error('expected exactly one engine tag');
  const s = a + OPEN.length, e = text.indexOf('</script>', s);
  return { s, e, body: text.slice(s, e) };
}
if (inlineOf(page0).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== oldBundle)
  throw new Error('the inlined engine is not the bundle as built - a drift this patch will not paper over');
const next = fs.readFileSync(path.join(ASSETS, 'patch625-pf-42-repair8.js'), 'utf8');
if (next.indexOf("'pf-42-repair8/9'") < 0) throw new Error('the module asset is not pf-42-repair8/9');
const EDITS = JSON.parse(fs.readFileSync(path.join(ASSETS, 'patch625-page-edits.json'), 'utf8'));
if (EDITS.length !== 4) throw new Error('expected 4 page edits, found ' + EDITS.length);

/* ---- 1. the engine source, then the bundle ----------------------------- */
const keep = fs.readFileSync(MODULE, 'utf8');
let newBundle;
try {
  fs.writeFileSync(MODULE, next);
  delete require.cache[require.resolve(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'))];
  require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
  newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
  if (newBundle.indexOf("'pf-42-repair8/9'") < 0) throw new Error('the rebuilt bundle lacks pf-42-repair8/9');
  new Function(newBundle);
} catch (e) {
  fs.writeFileSync(MODULE, keep);
  fs.writeFileSync(BUNDLE, oldBundle + '\n');
  throw e;
}

/* ---- 2. the page: the worker glue, then the inline engine --------------- */
const doc = s0.start([['function fixRepair8(step){', 'patch622 is not applied']]);
for (const e of EDITS) doc.swap(e.anchor.replace(/\n/g, NL), e.becomes.replace(/\n/g, NL));
doc.swap(inlineOf(page0).body, NL + newBundle.split('\n').join(NL) + NL);
doc.finish(({ text, must }) => {
  must('function snapOnce', 'the worker memo');
  if (inlineOf(text).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '') !== newBundle)
    throw new Error('the inline is not the new bundle');
});
