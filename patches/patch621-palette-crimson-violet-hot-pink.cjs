/* patch621: FOUR COLOURS THE COLLECTION DRAWS AND THE PALETTE LACKED - CRIMSON, TWO VIOLETS, HOT PINK.

   The all-traits audit (scratchpad/fix8/audit/REPORT.txt, class K1 / K2): crimson came out brick (Red Bandit
   Turban, Red Mouse Helmet, Exit Liquidity Red Hood Up, nine hats drawing #7c0012 / #f4002e), violet came out
   royal blue (Skeletor Costume, Bloodshot and Enderman Eyes, Wake Me Up Sleep Mask, Flip-Up Welding Shades,
   Twitch pet, Nether Portal, Mad Lads and Retro skins), hot pink came out salmon or lavender (Bubblegum,
   Exposed Brain, Nyan Cat, Copium). patch617 could not fit them: under the 2.3 dE twin limit every removal
   that would make room was forbidden. The owner (2026-10-01): "Yes, allow up to 3" - the colours removed
   HERE keep a colour within 3.0 dE in the final palette; the 28 removed before keep theirs within 2.3, as
   paletteswaps.spec.js pins. Then, told that the dark violet reaches Wake Me Up and Flip-Up but not Enderman,
   Twitch or Bloodshot: "Yes, add the bright violet" - a fourth swap under the same rules.

   THE FOUR ADDED, chosen by the round-4 objective (scratchpad/fix8/round6/palette6b/choose6a.log, choose6c.log: per file,
   cells normalised, all 311 traits at size 8 AND size 16 weighted equally, the page's own snapToPalette with
   its shade guards on) over the audit's nine candidates, one per family:
     crimson  #b60020  (the collection's most-drawn missing colour, 22,930 cells; beat #f4002e and #7c0012)
     violet   #5f0084  (dark, L24: beat #6a1ff0 and #8d00c1 by nearly 2 to 1; Wake Me Up and Flip-Up draw it exactly)
     hot pink #fd66ad  (beat #f674d1 and magenta #ec007d)
     violet   #6f01d5  (bright, L34 C108: Enderman Eyes' own colour; serves Twitch, Bloodshot, Rainbow Skin and Road,
                        and gives Wake Me Up's rim shade a colour again; beat #6700f1 by Enderman's weight, #6311f5,
                        #8360ff - the LIGHT violet Skeletor and Solana Hue draw, which stays unserved - #9945ff, #6a1ff0)
   The first three gain what they gain alone (no interaction); the fourth was scored on top of them.
   THE FOUR REMOVED, by removal cost over the same objective, among every triple the twin rule allows on the
   FINAL palette (4,174 triples of 35 near-copies; choose6b.log) and then every fourth the rule still allows with
   the three fixed (25 of 32; choose6d.log), none an original Resurrect 64 slot, a brand colour or a patch615 /
   patch617 addition. The objective's own cheapest triple (#939842 #20825d #f36a7d, cost
   -698) was NOT taken: its negative cost is one file's light/dark-order term (Rainbow Skin, two greens 2.7 dE
   apart) bought with Castle Crossroads, center, Golf Game and Green Camo Shark Hoodie getting worse. The
   triple taken costs +9.2 in all: #3c2d3b and #4a2d3d are plums (their twins #372535 / #4c2938 take their
   place) and #f36a7d a coral pink hot pink makes redundant. The fourth, #974768, is a mauve (twin #a24b6f
   2.65; cost +9.0; #fb9e8c was its equal at +4.5 with a looser twin). The independent check (fix8/round6/
   verify621) found these ARE drawn: #4a2d3d by New York Twin Towers Skyline (7,547 source pixels, 124 cells
   at 8) and Golf Game, #974768 by Question Mark Burst, #f36a7d by center, #3c2d3b by a few; each lands on its
   twin, 1.6 -> 2.3 dE from what was drawn, within the rule and not visible on the sheets. Each added colour sits in the slot of a
   removed one. 93 / 84 files change at 8 / 16.
   NOT reached by these four (measured, scratchpad/fix8/round6/palette6b/notes.txt): Red Bandit Turban draws
   the DARK crimson #7c0012 (6.7 dE from everything, still brick), Noun Glasses the BRIGHT red #f4002e (still
   #e83b3b), Skeletor and Solana Hue the LIGHT bright violet #8360ff / #9945ff (10-12 dE from everything, still
   lavender-blue), and Mad Lads an indigo no violet reaches: each would need its own colour.

   Measured through the page's own path (scratchpad/fix8/round6/palette6b/notes.txt): see there for the rows,
   the files that get worse, and the sheets.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const SRC = path.join(__dirname, 'assets');

const NEW_SWAPS = [ // [removed, added], this patch, in slot order (scratchpad/fix8/round6/palette6b/swaps-4.json)
  ['#3c2d3b', '#5f0084'],   // slot 67:  a dark plum (twin #372535, 2.79 dE)                  -> violet (dark)
  ['#4a2d3d', '#b60020'],   // slot 224: a dusky plum, drawn by NY Twin Towers (twin #4c2938, 2.32) -> crimson
  ['#974768', '#6f01d5'],   // slot 228: a mauve (twin #a24b6f, 2.65 dE)                      -> violet (bright)
  ['#f36a7d', '#fd66ad'],   // slot 249: a coral pink (twin #f25d7a, 2.85 dE)                 -> hot pink
];
const P615_SWAPS = [
  ['#7f2b2a', '#009f20'], ['#98322e', '#00e3f4'], ['#aa3630', '#ff0000'], ['#ed5b3b', '#1c27a3'],
  ['#d23239', '#5b5b5c'], ['#a4493a', '#1a4c07'], ['#196752', '#613105'], ['#3e5a51', '#050c30'],
  ['#18bba2', '#8c8b8a'], ['#68edcd', '#2536f6'], ['#3d3e65', '#401402'], ['#3e273a', '#c4c2c2'],
  ['#b089f3', '#954209'], ['#a84e71', '#537521'], ['#b35575', '#f9e7c4'], ['#b85877', '#c4a503'],
  ['#c45e7b', '#121061'], ['#c9627d', '#604438'], ['#d66c85', '#9a8201'], ['#e57992', '#0e6491'],
];
const P617_SWAPS = [
  ['#762928', '#0d204a'], ['#90302c', '#4c2a18'], ['#ed4936', '#845500'], ['#1c7458', '#036902'],
  ['#21c8aa', '#aeaeae'], ['#7df2d8', '#dbdbdb'], ['#37395c', '#161616'], ['#55a2e9', '#ecc900'],
];
const OLD_SWAPS = P615_SWAPS.concat(P617_SWAPS);
const BRAND = ['#000000', '#ffffff', '#3e3546', '#c7dcd0', '#fdcbb0', '#b33831', '#484a77', '#239063', '#f9c22b', '#6b3e75'];
const OLD_LIMIT = 2.3, NEW_LIMIT = 3.0;
const hashOf = list => crypto.createHash('sha256').update(list.map(x => x.toUpperCase()).join(',')).digest('hex');

const page = fs.readFileSync(s0.FILE, 'utf8');
const doc = s0.start([['  edition:"Edition 03, 28 colours swapped",', 'the palette is not patch617\'s (28 swaps)']]);
if (NEW_SWAPS.length !== 4) throw new Error('four swaps expected');

/* 1. the palette */
const m = page.match(/const PALETTE_HEX=\r\n((?:  [^\r\n]*\r\n){16})/);
if (!m) throw new Error('PALETTE_HEX is not the 16 lines it was');
const oldList = []; { const s = m[1].replace(/[\s"+;]/g, ''); for (let i = 0; i < s.length; i += 6) oldList.push('#' + s.slice(i, i + 6)); }
if (oldList.length !== 256) throw new Error('live palette is not 256');
const pasted = fs.readFileSync(SRC + '/patch621-PALETTE_HEX.js', 'utf8').replace(/\r\n/g, '\n');
const pm = pasted.match(/^const PALETTE_HEX=\n((?:  [^\n]*\n?){16})/);
if (!pm) throw new Error('patch621-PALETTE_HEX.js is not 16 lines');
const newBlock = pm[1].replace(/\n?$/, '\n').replace(/\n/g, NL);
const next = []; { const s = pm[1].replace(/[\s"+;]/g, ''); for (let i = 0; i < s.length; i += 6) next.push('#' + s.slice(i, i + 6)); }
/* the paste must be exactly the live palette with NEW_SWAPS applied in their slots */
{
  const want = oldList.slice();
  for (const [out, inn] of NEW_SWAPS) { const at = want.indexOf(out); if (at < 0) throw new Error('not in live palette: ' + out); if (want.indexOf(inn) >= 0) throw new Error('already in the palette: ' + inn); want[at] = inn; }
  if (want.join() !== next.join()) throw new Error('patch621-PALETTE_HEX.js is not the live palette with the 4 swaps');
}
if (next.length !== 256 || new Set(next).size !== 256) throw new Error('not 256 distinct');
for (let i = 0; i < 64; i++) if (next[i] !== oldList[i]) throw new Error('slot ' + i + ' (an original Resurrect 64) changed');
for (const b of BRAND) if (next.indexOf(b) < 0) throw new Error('brand colour removed: ' + b);
for (const [, inn] of OLD_SWAPS) if (next.indexOf(inn) < 0) throw new Error('a patch615 / patch617 addition was removed: ' + inn);
for (const [out, inn] of NEW_SWAPS) { if (next.indexOf(inn) < 0) throw new Error('not added: ' + inn); if (next.indexOf(out) >= 0) throw new Error('not removed: ' + out); }
doc.swap(m[1], newBlock);

/* 2. the record */
const allSwaps = OLD_SWAPS.concat(NEW_SWAPS).map(s => s.join('>'));
doc.swap('  edition:"Edition 03, 28 colours swapped",', '  edition:"Edition 03, 32 colours swapped",');
{
  const a = page.indexOf('  swapped:['), e = page.indexOf('],', a);
  if (a < 0 || e < 0) throw new Error('no swapped list');
  const liveSwapped = JSON.parse(page.slice(a + '  swapped:'.length, e + 1));
  if (liveSwapped.join() !== OLD_SWAPS.map(s => s.join('>')).join()) throw new Error('the live swapped list is not the 28 this patch expects');
  doc.swap(page.slice(a, e + 2), '  swapped:' + JSON.stringify(allSwaps) + ',');
  const h = page.match(/  colours:"([0-9a-f]{64})"\};/);
  if (!h || h[1] !== hashOf(oldList)) throw new Error('the recorded hash is not the live palette\'s');
  doc.swap(h[0], '  colours:"' + hashOf(next) + '"};');
}

doc.finish(({ code, must }) => {
  must('edition:"Edition 03, 32 colours swapped"', 'the edition');
  must('colours:"' + hashOf(next) + '"', 'the hash of the new palette');
  for (const [out, inn] of NEW_SWAPS) must('"' + out + '>' + inn + '"', 'the record names the swap ' + out + '>' + inn);
  /* the twin rule, on the final palette, with the page's own colour code: the 28 old removals within 2.3, the 4 new
     within 3.0 - STRICTLY, against colours of the OLD palette still kept (an added colour never stands in), and then
     as paletteswaps.spec.js TEST 3 reads it (nearest colour of the whole palette), which can only be looser */
  const grab = name => { const a = code.indexOf('function ' + name + '('); const e = code.indexOf('\n}', a); return code.slice(a, e + 2); };
  const C = new Function(grab('labOf') + '\n' + grab('deltaE2000') + '\nreturn {labOf:labOf, deltaE2000:deltaE2000};')();
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const dE = (a, b) => { const x = C.labOf(...rgb(a)), y = C.labOf(...rgb(b)); return C.deltaE2000(x[0], x[1], x[2], y[0], y[1], y[2]); };
  const kept = next.filter(h => oldList.indexOf(h) >= 0);
  let worstOld = 0, worstNew = 0;
  for (const [out] of OLD_SWAPS) { let bd = Infinity; for (const h of kept) bd = Math.min(bd, dE(out, h)); if (!(bd < OLD_LIMIT)) throw new Error(out + ' (removed before) is left ' + bd.toFixed(2) + ' dE from every kept colour (limit ' + OLD_LIMIT + ')'); worstOld = Math.max(worstOld, bd); }
  for (const [out] of NEW_SWAPS) { let bd = Infinity; for (const h of kept) bd = Math.min(bd, dE(out, h)); if (!(bd < NEW_LIMIT)) throw new Error(out + ' (removed here) is left ' + bd.toFixed(2) + ' dE from every kept colour (limit ' + NEW_LIMIT + ')'); worstNew = Math.max(worstNew, bd); }
  console.log('palette: 32 swapped in all, 256 colours; the 28 earlier removals within ' + worstOld.toFixed(2) + ' dE of a kept colour (limit 2.3), the 4 new within ' + worstNew.toFixed(2) + ' (limit 3.0); hash ' + hashOf(next).slice(0, 16));
});
