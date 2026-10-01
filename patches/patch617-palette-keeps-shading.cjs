/* patch617: THE PALETTE STEP KEEPS DRAWN SHADES APART, AND 8 MORE SWAPS.

   The owner, on patch615's swap at size 16: "the shading on the gate is bad".
   Measured since (scratchpad/fix8/round2..round4): the swap had added colours
   that sit between two drawn shades, so both shades landed on one palette
   colour - Dark Skin went flat, Circuit Board lost its two greens, GATE's
   mid navy fell onto its shadow colour; files with merged shades at 16 went
   123 -> 150. The figure that chose the swap (cells far from every palette
   colour) never asked whether distinct shades stay distinct. Then, after an
   all-traits audit, the owner chose "swap about 12 more ... with a check that
   no shading merges".

   THE RULE (scratchpad/fix8/round4/palette, verified by an independent
   agent each round). Each colour group still goes to its nearest palette
   colour through palettePick. Where one palette colour has taken groups 5+ dE
   apart (the page's own "merged" test), those shades are given colours again
   together, at least cost (cells x distance, plus a charge for any merge
   left), within guards: a colourful shade stays within 20 degrees of its
   drawn hue and 12 in a*b*; any shade within 8 L* of its drawn lightness;
   no move reverses light/dark order where two drawn colours touch in the
   picture (the new third argument, the row width, says which cells touch);
   no move onto pure white or black unless drawn that way. Where nothing
   passes, the shades stay merged, as before. A picture with no merge is not
   touched.

   THE PALETTE. 8 more swaps, still 256. Every colour removed here or by
   patch615 keeps a colour under 2.3 dE in the final palette; no original
   Resurrect 64 slot (0-63), no brand colour and no patch615 addition is
   removed. The twin rule allows at most 8 more removals from live (an
   exhaustive count), so "about 12" became 8: mid navy #0d204a and mid green
   #036902 (needed with the rule for GATE and Circuit Board), dark skin-shadow
   brown #4c2a18 (Dark Skin's shadow), ochre #845500, lemon #ecc900, and the
   neutral greys #161616 #aeaeae #dbdbdb. Crimson, violet and hot pink did not
   fit: each would need a removal the twin rule forbids.

   Measured over the 311 traits at each layer's start size, live -> this:
   files with merged shades 215 -> 168, erased drawn boundaries 56,766 ->
   41,403, light/dark inversions 17,472 -> 14,756, file-mean dE 3.737 ->
   3.255. Worse on some: Dark Hooded Cloak's folds (lostE 1 -> 113), a pale
   band in Future City's sky, Burning Room's yellows deeper; hue damage +602
   cells over 20 files (yellows to lemon).

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs'), crypto = require('crypto');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const path = require('path');
/* the function and the palette, as built and measured in scratchpad/fix8/round4/palette */
const SRC = path.join(__dirname, 'assets');

const NEW_SWAPS = [ // [removed, added], this patch
  ['#762928', '#0d204a'], ['#90302c', '#4c2a18'], ['#ed4936', '#845500'], ['#1c7458', '#036902'],
  ['#21c8aa', '#aeaeae'], ['#7df2d8', '#dbdbdb'], ['#37395c', '#161616'], ['#55a2e9', '#ecc900'],
];
const P615_SWAPS = [
  ['#7f2b2a', '#009f20'], ['#98322e', '#00e3f4'], ['#aa3630', '#ff0000'], ['#ed5b3b', '#1c27a3'],
  ['#d23239', '#5b5b5c'], ['#a4493a', '#1a4c07'], ['#196752', '#613105'], ['#3e5a51', '#050c30'],
  ['#18bba2', '#8c8b8a'], ['#68edcd', '#2536f6'], ['#3d3e65', '#401402'], ['#3e273a', '#c4c2c2'],
  ['#b089f3', '#954209'], ['#a84e71', '#537521'], ['#b35575', '#f9e7c4'], ['#b85877', '#c4a503'],
  ['#c45e7b', '#121061'], ['#c9627d', '#604438'], ['#d66c85', '#9a8201'], ['#e57992', '#0e6491'],
];
const BRAND = ['#000000', '#ffffff', '#3e3546', '#c7dcd0', '#fdcbb0', '#b33831', '#484a77', '#239063', '#f9c22b', '#6b3e75'];
const hashOf = list => crypto.createHash('sha256').update(list.map(x => x.toUpperCase()).join(',')).digest('hex');
const crlf = t => t.replace(/\r\n/g, '\n').replace(/\n/g, NL);

const page = fs.readFileSync(s0.FILE, 'utf8');
const doc = s0.start([['  edition:"Edition 03, 20 colours swapped",', 'the palette is not patch615\'s']]);
if (page.indexOf('function snapToPalette(d,n,w,opts){') >= 0) throw new Error('patch617 is already applied');

/* 1. the palette */
const m = page.match(/const PALETTE_HEX=\r\n((?:  [^\r\n]*\r\n){16})/);
if (!m) throw new Error('PALETTE_HEX is not the 16 lines it was');
const oldList = []; { const s = m[1].replace(/[\s"+;]/g, ''); for (let i = 0; i < s.length; i += 6) oldList.push('#' + s.slice(i, i + 6)); }
const pasted = fs.readFileSync(SRC + '/patch617-PALETTE_HEX.js', 'utf8').replace(/\r\n/g, '\n');
const pm = pasted.match(/^const PALETTE_HEX=\n((?:  [^\n]*\n?){16})/);
if (!pm) throw new Error('PALETTE_HEX-paste.js is not 16 lines');
const newBlock = pm[1].replace(/\n?$/, '\n').replace(/\n/g, NL);
const next = []; { const s = pm[1].replace(/[\s"+;]/g, ''); for (let i = 0; i < s.length; i += 6) next.push('#' + s.slice(i, i + 6)); }
/* the paste must be exactly the live palette with NEW_SWAPS applied in their slots */
{
  const want = oldList.slice();
  for (const [out, inn] of NEW_SWAPS) { const at = want.indexOf(out); if (at < 0) throw new Error('not in live palette: ' + out); want[at] = inn; }
  if (want.join() !== next.join()) throw new Error('PALETTE_HEX-paste.js is not the live palette with the 8 swaps');
}
if (new Set(next).size !== 256) throw new Error('not 256 distinct');
for (let i = 0; i < 64; i++) if (next[i] !== oldList[i]) throw new Error('slot ' + i + ' (an original Resurrect 64) changed');
for (const b of BRAND) if (next.indexOf(b) < 0) throw new Error('brand colour removed: ' + b);
for (const [, inn] of P615_SWAPS) if (next.indexOf(inn) < 0) throw new Error('a patch615 addition was removed: ' + inn);
doc.swap(m[1], newBlock);

/* 2. the record */
const allSwaps = P615_SWAPS.concat(NEW_SWAPS).map(s => s.join('>'));
doc.swap('  edition:"Edition 03, 20 colours swapped",', '  edition:"Edition 03, 28 colours swapped",');
{
  const a = page.indexOf('  swapped:['), e = page.indexOf('],', a);
  if (a < 0 || e < 0) throw new Error('no swapped list');
  doc.swap(page.slice(a, e + 2), '  swapped:' + JSON.stringify(allSwaps) + ',');
  const h = page.match(/  colours:"([0-9a-f]{64})"\};/);
  if (!h || h[1] !== hashOf(oldList)) throw new Error('the recorded hash is not live palette\'s');
  doc.swap(h[0], '  colours:"' + hashOf(next) + '"};');
}

/* 3. snapToPalette, whole */
{
  const a = page.indexOf('function snapToPalette(d,n){');
  let e = page.indexOf(NL + '}' + NL, a); if (a < 0 || e < 0) throw new Error('snapToPalette not found');
  const oldFn = page.slice(a, e + NL.length + 1);
  const newFn = crlf(fs.readFileSync(SRC + '/patch617-snapToPalette.js', 'utf8').replace(/\s*$/, ''));
  if (!newFn.startsWith('function snapToPalette(d,n,w,opts){') || !newFn.endsWith('}')) throw new Error('snapToPalette-patch617.js is not one function');
  doc.swap(oldFn, ['/* SHADES KEPT APART (patch617): see the comment inside, and patches/patch617.',
    '   w, the row width, says which cells touch, for the light/dark order guard;',
    '   a caller without it skips only that guard; opts.shades===false skips the', '   re-assignment (the grouping test uses it). */', newFn].join(NL));
}

/* 4. the three callers pass the row width */
doc.swap('  const r=snapToPalette(im.data,W*H);', '  const r=snapToPalette(im.data,W*H,W);');
doc.swap('pal=snapToPalette(r.data,r.width*r.height); }",', 'pal=snapToPalette(r.data,r.width*r.height,r.width); }",');
doc.swap(': snapToPalette(out.data,out.width*out.height);', ': snapToPalette(out.data,out.width*out.height,out.width);');

doc.finish(({ code, must }) => {
  must('function snapToPalette(d,n,w,opts){', 'the new snapToPalette');
  must('snapToPalette(r.data,r.width*r.height,r.width)', 'the worker passes the width');
  if (/snapToPalette\([^)]*\*[^),]*\)/.test(code.replace(/snapToPalette\(d,n,w\)/g, ''))) throw new Error('a snapToPalette call without the width is left');
  /* the twin rule, on the final palette, with the page's own colour code */
  const grab = name => { const a = code.indexOf('function ' + name + '('); const e = code.indexOf('\n}', a); return code.slice(a, e + 2); };
  const C = new Function(grab('labOf') + '\n' + grab('deltaE2000') + '\nreturn {labOf:labOf, deltaE2000:deltaE2000};')();
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let worst = 0;
  for (const [out] of P615_SWAPS.concat(NEW_SWAPS)) {
    const a = C.labOf(...rgb(out)); let bd = Infinity;
    for (const h of next) { const q = C.labOf(...rgb(h)); bd = Math.min(bd, C.deltaE2000(a[0], a[1], a[2], q[0], q[1], q[2])); }
    if (bd >= 2.3) throw new Error(out + ' is left ' + bd.toFixed(2) + ' dE from every colour of the final palette');
    worst = Math.max(worst, bd);
  }
  console.log('palette: 28 swapped in all, 256 colours, every removed colour within ' + worst.toFixed(2) + ' dE of one kept; hash ' + hashOf(next).slice(0, 16));
});
