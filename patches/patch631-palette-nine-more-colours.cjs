/* patch631: NINE MORE COLOURS THE COLLECTION DRAWS - ROYAL BLUE, CRIMSON, GREEN, SAGE, TAN, ORANGE, TWO MAGENTAS AND
   A NEAR-BLACK PURPLE. 41 SWAPPED IN ALL.

   The owner, 2026-10-04, asked which swaps to take from the round-2 options (scratchpad/fix8/swaps33/r2/options.txt):
   "All six (Recommended)", and the add-ons "Two magentas, Orbits near-black". That is run O5 of the measured study
   (r2/runs/O5/variant.html: the live page with only PALETTE_HEX and PALETTE_SOURCE changed), Option A + B + C:
     A  #f37245 -> royal blue #3f78ff, #8b4461 -> crimson #7c0313, #602933 -> green #00cb2b, #f88b85 -> sage #6cb688,
        #fb9e8c -> tan #d1c69a, #18614f -> orange #cf5c00.
        The crimson is #7c0313, NOT the #7c0012 Red Bandit Turban draws (0.25 dE apart): #7c0012 has Rec.601 luma
        39.1, under the page's JUNK_LUM = 40, so the outline pass treats a small patch of it as debris on the line and
        repaints it (Dreadlocks' red shadow went olive, Flame Visor's brim bright red); #7c0313 sits at 41.0 and is
        left alone (verify-report.txt section 5: 76 of 91 crimson cells repainted on Dreadlocks 8 with #7c0012, 8 with
        #7c0313, all at the ring, as live).
     B  #507861 -> dark magenta #d810d3 (the colour Copium draws), #426054 -> light magenta #f956f6 (keeps Copium's
        light and dark magenta shading apart; Pit Vipers' lens fade, Rainbow Road's stripe).
     C  #344241 (a dark grey) -> near-black purple #14021c (Colourful Orbits' background darker than its glow, as
        drawn; found by searching 8,649 dark colours: the earlier #050318 changed SMB Bandana in about 2,200 cells,
        this one changes none).
   Each new colour sits in the slot of the one it replaces (slots 94 96 146 163 167 170 227 251 253).

   THE TWIN RULE, as patch621 set it ("Yes, allow up to 3", 2026-10-01) and the owner's options state it: every
   removed colour, all 41, keeps a palette colour under 3.0 dE (CIEDE2000) in the FINAL palette. Worst of the 41 is
   #f37245 on #f06740 (2.848 on the page's own dE). Slots 0-63 (Resurrect 64 by Kerrie Lake), the 10 brand colours
   and the 32 earlier additions are never removed.
   ONE OF THE 28 EARLIER REMOVALS LEAVES 2.3. patch621 kept the 28 patch615 / patch617 removals under 2.3 and
   paletteswaps.spec.js pinned it. #196752 (removed by patch615, a dark teal) held #18614f at 2.178;
   this patch removes #18614f for the orange, and #196752's nearest is now #1b6e55 at 2.606 - under the 3.0 the owner's
   rule gives every removal, over the 2.3 the earlier 28 had. Measured and reported before the owner chose
   (scratchpad/fix8/swaps33/verify-report.txt 2(a): "27 of the 32 old removals are now under 2.3, not 28"); the
   owner's options sheet (r2/options.txt) states the rule as 3.0 for every removed colour, old and new, and does not
   name #196752. So the 2.3 stays for the other 27, and #196752 is the one named exception, checked below as NEEDED
   (it is at or over 2.3, and its twin before was #18614f) so it cannot quietly widen to cover anything else.

   MEASURED (r2/options.txt, r2/verify-report.txt; an adversarial verifier rebuilt every page by its own text edit and
   ran the page's own fixBatchRun in a real browser on all 311 traits at 8 and 16, browser == rig on 311/311 at both):
   whole collection 0.130 dE closer at size 8, 0.100 at 16. Costs, as the sheets show them: Red Warden's bristle
   stripes merge into one crimson, Pokemon tufts merge, Castle path smudges blend into the tan, Solana Hue's neck
   bands merge into one royal blue, Golf Game's greens collapse to one, Ancient Oak's orange loses a tier at 16,
   Nether Portal's violet swirl turns magenta in 179 cells, Sakura Skin's sunlit slope gets magenta streaks, Red
   Plaid's plum plaid lines go near-black, Civic's rear window glass moves, New York Twin Towers' left tower face goes
   a shade darker plum (1,589 cells at 8). Protected traits: Jason Mask's left face shadow goes tan (677 cells at 8,
   174 at 16) and one speck on Teal Galaxy Skin at 8; Dark Skin, GATE Hoodie, Circuit Board, Water Skin, SMB Bandana
   and Gold Foil are byte-identical to live.

   WHAT THIS CHANGES: PALETTE_HEX (the nine slots) and PALETTE_SOURCE (edition, swapped, colours). Nothing else.
   It checks, after, that the palette and the record are exactly O5's (PB_O5 names that page; PB_O5=skip says out
   loud that it was not compared - it is never skipped silently).

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const SRC = path.join(__dirname, 'assets');
const O5 = process.env.PB_O5
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/fix8/swaps33/r2/runs/O5/variant.html';

const NEW_SWAPS = [ // [removed, added], this patch, in the order the owner's options list them (A, then B, then C)
  ['#f37245', '#3f78ff'],   // slot  94: an orange-coral (twin #f06740, 2.85 dE)         -> royal blue
  ['#8b4461', '#7c0313'],   // slot 227: a mauve, drawn by NY Twin Towers' left tower   -> crimson (luma 41.0, over JUNK_LUM)
  ['#602933', '#00cb2b'],   // slot  96: a dark maroon                                  -> green
  ['#f88b85', '#6cb688'],   // slot 251: a salmon                                       -> sage
  ['#fb9e8c', '#d1c69a'],   // slot 253: a peach                                        -> tan
  ['#18614f', '#cf5c00'],   // slot 146: a dark teal                                    -> orange
  ['#507861', '#d810d3'],   // slot 170: a grey-green (twin #4d725e, 2.36 dE)           -> dark magenta
  ['#426054', '#f956f6'],   // slot 167: a grey-green (twin #456657, 2.40 dE, its only one) -> light magenta
  ['#344241', '#14021c'],   // slot 163: a dark grey (twin #364845, 2.73 dE)            -> near-black purple
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
const P621_SWAPS = [
  ['#3c2d3b', '#5f0084'], ['#4a2d3d', '#b60020'], ['#974768', '#6f01d5'], ['#f36a7d', '#fd66ad'],
];
const OLD_SWAPS = P615_SWAPS.concat(P617_SWAPS, P621_SWAPS);
const BRAND = ['#000000', '#ffffff', '#3e3546', '#c7dcd0', '#fdcbb0', '#b33831', '#484a77', '#239063', '#f9c22b', '#6b3e75'];
const OLD_LIMIT = 2.3, LIMIT = 3.0;
const OVER_23 = { '#196752': '#18614f' }; // an earlier removal this patch takes over 2.3, and the twin it loses here
const hashOf = list => crypto.createHash('sha256').update(list.map(x => x.toUpperCase()).join(',')).digest('hex');
const listOf = block => { const s = block.replace(/[\s"+;]/g, ''), o = []; for (let i = 0; i < s.length; i += 6) o.push('#' + s.slice(i, i + 6)); return o; };

const page = fs.readFileSync(s0.FILE, 'utf8');
const doc = s0.start([['  edition:"Edition 03, 32 colours swapped",', 'the palette is not patch621\'s (32 swaps)']]);
if (NEW_SWAPS.length !== 9) throw new Error('nine swaps expected');
if (OLD_SWAPS.length !== 32) throw new Error('32 earlier swaps expected');

/* 1. the palette */
const m = page.match(/const PALETTE_HEX=\r\n((?:  [^\r\n]*\r\n){16})/);
if (!m) throw new Error('PALETTE_HEX is not the 16 lines it was');
const oldList = listOf(m[1]);
if (oldList.length !== 256) throw new Error('live palette is not 256');
const pasted = fs.readFileSync(SRC + '/patch631-PALETTE_HEX.js', 'utf8').replace(/\r\n/g, '\n');
const pm = pasted.match(/^const PALETTE_HEX=\n((?:  [^\n]*\n?){16})/);
if (!pm) throw new Error('patch631-PALETTE_HEX.js is not 16 lines');
const newBlock = pm[1].replace(/\n?$/, '\n').replace(/\n/g, NL);
const next = listOf(pm[1]);
/* the paste must be exactly the live palette with NEW_SWAPS applied in their slots */
{
  const want = oldList.slice();
  for (const [out, inn] of NEW_SWAPS) { const at = want.indexOf(out); if (at < 0) throw new Error('not in live palette: ' + out); if (want.indexOf(inn) >= 0) throw new Error('already in the palette: ' + inn); want[at] = inn; }
  if (want.join() !== next.join()) throw new Error('patch631-PALETTE_HEX.js is not the live palette with the 9 swaps');
}
if (next.length !== 256 || new Set(next).size !== 256) throw new Error('not 256 distinct');
for (let i = 0; i < 64; i++) if (next[i] !== oldList[i]) throw new Error('slot ' + i + ' (an original Resurrect 64) changed');
for (const b of BRAND) if (next.indexOf(b) < 0) throw new Error('brand colour removed: ' + b);
for (const [, inn] of OLD_SWAPS) if (next.indexOf(inn) < 0) throw new Error('a patch615 / patch617 / patch621 addition was removed: ' + inn);
for (const [out, inn] of NEW_SWAPS) { if (next.indexOf(inn) < 0) throw new Error('not added: ' + inn); if (next.indexOf(out) >= 0) throw new Error('not removed: ' + out); }
doc.swap(m[1], newBlock);

/* 2. the record */
const allSwaps = OLD_SWAPS.concat(NEW_SWAPS).map(s => s.join('>'));
doc.swap('  edition:"Edition 03, 32 colours swapped",', '  edition:"Edition 03, 41 colours swapped",');
{
  const a = page.indexOf('  swapped:['), e = page.indexOf('],', a);
  if (a < 0 || e < 0) throw new Error('no swapped list');
  const liveSwapped = JSON.parse(page.slice(a + '  swapped:'.length, e + 1));
  if (liveSwapped.join() !== OLD_SWAPS.map(s => s.join('>')).join()) throw new Error('the live swapped list is not the 32 this patch expects');
  doc.swap(page.slice(a, e + 2), '  swapped:' + JSON.stringify(allSwaps) + ',');
  const h = page.match(/  colours:"([0-9a-f]{64})"\};/);
  if (!h || h[1] !== hashOf(oldList)) throw new Error('the recorded hash is not the live palette\'s');
  doc.swap(h[0], '  colours:"' + hashOf(next) + '"};');
}

doc.finish(({ text, code, must }) => {
  must('edition:"Edition 03, 41 colours swapped"', 'the edition');
  must('colours:"' + hashOf(next) + '"', 'the hash of the new palette');
  for (const [out, inn] of NEW_SWAPS) must('"' + out + '>' + inn + '"', 'the record names the swap ' + out + '>' + inn);

  /* ONLY PALETTE_HEX AND PALETTE_SOURCE: outside the two blocks, the page is the page it was, byte for byte */
  const cut = t => { const a = t.indexOf('const PALETTE_HEX='), b = t.indexOf('function paletteList(){'); if (a < 0 || b < a) throw new Error('cannot find the palette blocks'); return [t.slice(0, a), t.slice(b)]; };
  const [b0, b1] = cut(page), [a0, a1] = cut(text);
  if (b0 !== a0 || b1 !== a1) throw new Error('something outside PALETTE_HEX / PALETTE_SOURCE changed');

  /* the twin rule, on the final palette, with the page's own colour code. STRICTLY first: against colours of the
     live palette that are still kept (none of the nine added ever stands in) - the 28 patch615 / patch617 removals
     within 2.3, the 4 patch621 and 9 new removals within 3.0. Then as paletteswaps.spec.js reads it (nearest colour
     of the whole final palette), which can only be looser. */
  const grab = name => { const a = code.indexOf('function ' + name + '('); const e = code.indexOf('\n}', a); return code.slice(a, e + 2); };
  const C = new Function(grab('labOf') + '\n' + grab('deltaE2000') + '\nreturn {labOf:labOf, deltaE2000:deltaE2000};')();
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const dE = (a, b) => { const x = C.labOf(...rgb(a)), y = C.labOf(...rgb(b)); return C.deltaE2000(x[0], x[1], x[2], y[0], y[1], y[2]); };
  const kept = next.filter(h => oldList.indexOf(h) >= 0);
  if (kept.length !== 256 - 9) throw new Error('kept is not 247');
  const near = (out, pool) => { let bd = Infinity, to = null; for (const h of pool) { const d = dE(out, h); if (d < bd) { bd = d; to = h; } } return { d: bd, to }; };
  const rows = [];
  for (const [out] of OLD_SWAPS.concat(NEW_SWAPS)) {
    const old28 = P615_SWAPS.concat(P617_SWAPS).some(s => s[0] === out), limit = old28 && !OVER_23[out] ? OLD_LIMIT : LIMIT;
    const k = near(out, kept), w = near(out, next);
    if (OVER_23[out]) {
      const was = near(out, oldList);
      if (!(k.d >= OLD_LIMIT)) throw new Error(out + ' is named over 2.3 but sits at ' + k.d.toFixed(3) + ' - drop the exception');
      if (was.to !== OVER_23[out] || !(was.d < OLD_LIMIT)) throw new Error(out + ' did not hold ' + OVER_23[out] + ' under 2.3 before this patch - the stated reason is wrong');
      if (NEW_SWAPS.every(s => s[0] !== OVER_23[out])) throw new Error(OVER_23[out] + ' is not removed by this patch - the stated reason is wrong');
    }
    if (!(k.d < limit)) throw new Error(out + ' is left ' + k.d.toFixed(3) + ' dE from every kept colour (limit ' + limit + ')');
    if (!(w.d <= k.d)) throw new Error('the whole palette is farther than the kept part - impossible, the instrument is wrong');
    rows.push(out + ' -> ' + k.to + ' ' + k.d.toFixed(3) + ' (limit ' + limit + ')' + (w.to !== k.to ? '  [whole palette: ' + w.to + ' ' + w.d.toFixed(3) + ']' : ''));
  }
  if (rows.length !== 41) throw new Error('41 removed colours expected, checked ' + rows.length);
  if (Object.keys(OVER_23).length !== 1) throw new Error('one earlier removal over 2.3 expected');
  console.log('twin rule, every removed colour against the kept colours (' + rows.length + '):\n  ' + rows.join('\n  '));

  /* the result is O5's palette and O5's record */
  if (O5 === 'skip') { console.log('O5 COMPARISON SKIPPED (PB_O5=skip): the palette was NOT compared with the measured page'); return; }
  const o5 = fs.readFileSync(O5, 'utf8').replace(/\r\n/g, '\n');
  const om = o5.match(/const PALETTE_HEX=\n((?:  [^\n]*\n){16})/);
  if (!om) throw new Error('O5 page has no 16-line PALETTE_HEX: ' + O5);
  if (listOf(om[1]).join() !== next.join()) throw new Error('the palette is not O5\'s');
  const rec = t => { const a = t.indexOf('const PALETTE_SOURCE='), b = t.indexOf('function paletteList(){'); return t.slice(a, b); };
  if (rec(o5) !== rec(text.replace(/\r\n/g, '\n'))) throw new Error('PALETTE_SOURCE is not O5\'s');
  console.log('O5: palette (256, slot by slot) and PALETTE_SOURCE equal ' + O5);
  console.log('palette: 41 swapped in all, 256 colours; hash ' + hashOf(next).slice(0, 16));
});
