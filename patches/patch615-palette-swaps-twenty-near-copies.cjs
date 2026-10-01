/* patch615: THE PALETTE SWAPS 20 NEAR-COPIES FOR 20 COLOURS THE COLLECTION DRAWS.

   The owner, after patch613: the palette has no bright green, cyan or pure
   red ("thats a bad number" to growing it to 259; then "any other colours we
   should have that we could replace some stuff w?"; then "20 swaps").

   MEASURED over the 232 saved working traits at Pixel size 8 (scratchpad/
   fix8/judge: missing.cjs, swapplan.cjs, newpalette.cjs): 39.7% of painted
   cells sat in colour groups more than 8 dE from every palette colour - no
   neutral grey (every grey leans purple), no strong blue or navy, few
   browns and greens, no cream. The palette also held about 35 pairs under
   2.3 dE apart (the page's own "same shade"). Greedy, 20 times: add the
   colour that brings the most cells closest, remove the least-used colour
   whose nearest remaining colour is under 2.3 dE. The removals were then
   re-picked twice (repick.cjs): a removed colour must keep a colour under
   2.3 dE in the palette that RESULTS (the greedy pass had removed a colour
   and later its twin), and it is never one of the original Resurrect 64
   (indices 0-63, which the library's palette file preserves and credits to
   Kerrie Lake) nor a brand colour (brandCore, brandAccents) - a first list
   took four originals, one of them the brand's Deep Blue #484a77. Combined:
   cells over 8 dE 39.7% -> 15.1%; 528,209 cells in 208 traits closer; 7,916
   cells in 58 traits further, none by more than 1.52 dE; every removed
   colour within 2.28 dE of one kept. The first three added are the ones the
   owner agreed by name.

   STILL 256, each new colour in the slot of the one it replaces, so every
   other colour keeps its place. PALETTE_SOURCE says what it now is: Edition
   03 with these 20 swapped, and the hash of THESE colours made the way the
   old one was (sha256 of the upper-case "#RRGGBB" list joined by ",", which
   reproduces 1ddf5cbd... for the old palette).

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const crypto = require('crypto');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;

const SWAPS = [ // [removed, added]
  ['#7f2b2a', '#009f20'], ['#98322e', '#00e3f4'], ['#aa3630', '#ff0000'], ['#ed5b3b', '#1c27a3'],
  ['#d23239', '#5b5b5c'], ['#a4493a', '#1a4c07'], ['#196752', '#613105'], ['#3e5a51', '#050c30'],
  ['#18bba2', '#8c8b8a'], ['#68edcd', '#2536f6'], ['#3d3e65', '#401402'], ['#3e273a', '#c4c2c2'],
  ['#b089f3', '#954209'], ['#a84e71', '#537521'], ['#b35575', '#f9e7c4'], ['#b85877', '#c4a503'],
  ['#c45e7b', '#121061'], ['#c9627d', '#604438'], ['#d66c85', '#9a8201'], ['#e57992', '#0e6491'],
];
/* EVERY REMOVED COLOUR KEEPS ONE UNDER 2.3 dE in the palette that results -
   checked below before anything is written, not just when it was chosen. */
const TWIN_DE = 2.3;
/* NEVER REMOVED: the original Resurrect 64 (the first 64 slots) and the brand's
   colours, as TRAIT MASTER LIBRARY/palette/mrkt-mkrs-resurrect-256.json lists
   them (brandCore, brandAccents). */
const KEEP_FIRST = 64;
const BRAND = ['#000000', '#ffffff', '#3e3546', '#c7dcd0', '#fdcbb0', '#b33831', '#484a77', '#239063', '#f9c22b', '#6b3e75'];
const OLD_HASH = '1ddf5cbdf68f8eb9aa345d79b1c4b3103ee36f3bf718f80edd1eaf02e77ff089';
const hashOf = list => crypto.createHash('sha256').update(list.map(x => x.toUpperCase()).join(',')).digest('hex');

const doc = s0.start([['const PALETTE_HEX=', 'PALETTE_HEX is not in this page'],
  ['  edition:"Edition 03",', 'the palette is not Edition 03 as it was']]);
const page = require('fs').readFileSync(s0.FILE, 'utf8');
const m = page.match(/const PALETTE_HEX=\r\n((?:  [^\r\n]*\r\n){16})/);
if (!m) throw new Error('PALETTE_HEX is not the 16 lines it was');
const oldBlock = m[1];
const oldStr = oldBlock.replace(/[\s"+;]/g, '');
if (oldStr.length !== 1536) throw new Error('PALETTE_HEX is not 256 colours: ' + oldStr.length / 6);
const oldList = []; for (let i = 0; i < oldStr.length; i += 6) oldList.push('#' + oldStr.slice(i, i + 6));
if (hashOf(oldList) !== OLD_HASH) throw new Error('the palette in the page is not the one PALETTE_SOURCE recorded');
const next = oldList.slice();
for (const [out, inn] of SWAPS) {
  const at = next.indexOf(out); if (at < 0) throw new Error('not in the palette: ' + out);
  if (at < KEEP_FIRST) throw new Error(out + ' is one of the original Resurrect 64 (slot ' + at + ')');
  if (BRAND.indexOf(out) >= 0) throw new Error(out + ' is a brand colour');
  if (next.indexOf(inn) >= 0) throw new Error('already in the palette: ' + inn);
  next[at] = inn;
}
if (new Set(next).size !== 256) throw new Error('the new palette has a duplicate');
const newStr = next.map(h => h.slice(1)).join('');
const rows = []; for (let i = 0; i < newStr.length; i += 96) rows.push(newStr.slice(i, i + 96));
const newBlock = rows.map((r, i) => '  ' + (i ? '+' : '') + '"' + r + '"' + (i === rows.length - 1 ? ';' : '') + NL).join('');
const NEW_HASH = hashOf(next);

doc.swap(oldBlock, newBlock);
doc.swap('/* Mrkt Mkrs 256, Resurrect expansion, every colour, in order.',
  ['/* Mrkt Mkrs 256, Resurrect expansion, every colour, in order - WITH 20',
   '   SWAPPED (patch615, 2026-09-30). The collection draws colours this palette',
   '   did not have: 39.7% of the 232 saved traits\' painted cells at size 8 sat',
   '   more than 8 dE from every colour in it (no neutral grey - every grey',
   '   leans purple - no strong blue or navy, few browns and greens, no cream),',
   '   while it held about 35 pairs under 2.3 dE apart. The owner chose to stay',
   '   at 256 and swap 20 near-copies for 20 drawn colours; each new colour sits',
   '   in the slot of the one it replaced. Measured: 39.7% -> 15.1%. The swaps',
   '   are listed in PALETTE_SOURCE.swapped, removed first.']);
doc.swap('  edition:"Edition 03",',
  ['  edition:"Edition 03, 20 colours swapped",',
   '  swapped:' + JSON.stringify(SWAPS.map(s => s.join('>'))) + ',']);
doc.swap('  colours:"' + OLD_HASH + '"};',
  ['  /* sha256 of these colours, upper-case "#RRGGBB" joined by ",", the way the',
   '     Edition 03 hash ' + OLD_HASH.slice(0, 12) + '... was made. */',
   '  colours:"' + NEW_HASH + '"};']);

/* the decision comment above SNAP_GROUP_DE quotes palettescope's fixture, which
   the swap moved (#585858 now has #5b5b5c, 1 dE away, and no longer splits) */
doc.swap(['   colour, on a fixture that is shown first to be able to tell the two apart:',
  '   #585858 alone lands on #625565, and pooled with #585856 - 1.28 dE away,',
  '   inside SNAP_GROUP_DE - both land on #344241, 20.4 dE from where it was.'],
 ['   colour, on a fixture that is shown first to be able to tell the two apart:',
  '   #585858 alone landed on #625565, and pooled with #585856 - 1.28 dE away,',
  '   inside SNAP_GROUP_DE - both landed on #344241, 20.4 dE from where it was.',
  '   (SUPERSEDED as a fixture by patch615, whose swap put #5b5b5c 1 dE from',
  '   both: the spec now uses #182000 / #182200, alone #000000 / #1a4c07,',
  '   pooled both #1a4c07, 29.6 dE. The decision and its measurements stand.)']);

doc.finish(({ code, must }) => {
  must('edition:"Edition 03, 20 colours swapped",', 'the edition');
  must('colours:"' + NEW_HASH + '"};', 'the new hash');
  for (const [out, inn] of SWAPS) {
    if (next.indexOf(out) >= 0) throw new Error('still in the palette: ' + out);
    if (next.indexOf(inn) < 0) throw new Error('missing from the palette: ' + inn);
  }
  /* the twin rule, measured on the palette that results, with the page's own colour code */
  const grab = name => { const a = code.indexOf('function ' + name + '('); const e = code.indexOf('\n}', a); return code.slice(a, e + 2); };
  const C = new Function(grab('labOf') + '\n' + grab('deltaE2000') + '\nreturn {labOf:labOf, deltaE2000:deltaE2000};')();
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let worst = 0;
  for (const [out] of SWAPS) {
    const a = C.labOf(...rgb(out)); let bd = Infinity;
    for (const h of next) { const q = C.labOf(...rgb(h)); bd = Math.min(bd, C.deltaE2000(a[0], a[1], a[2], q[0], q[1], q[2])); }
    if (bd >= TWIN_DE) throw new Error(out + ' is left ' + bd.toFixed(2) + ' dE from every colour in the new palette');
    worst = Math.max(worst, bd);
  }
  console.log('palette: 20 swapped, still ' + newStr.length / 6 + ' colours, hash ' + NEW_HASH.slice(0, 16) + ', every removed colour within ' + worst.toFixed(2) + ' dE of one kept');
});
