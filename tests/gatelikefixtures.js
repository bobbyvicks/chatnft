/* Round 9c (gate9c) fixture for gatelike.spec.js: the GATE-LIKE picture. Injected into the page as a script
   (window.__gl); gate9c/fx.cjs evaluates the same text in Node (design and mutant screening only - the spec judges).

   1280 x 1280, cells of 16 at Pixel size 16. A navy field x 216-887 (round 9c: 216-903), y 640-895; under it a black hem y 896-913 (a
   hood's edge), then transparency. Four yellow letter-like blocks G, A, T, E standing on the hem, each in a 5 px white
   line (GATE's outline is 6-7 px; its mean thickness reads 0.28-0.34 of a cell, these 0.31). Behind the line, per
   16 px run, an anti-alias row of 0-3 px (light 183,192,206 then mid 121,135,159 - GATE's own two AA families) on
   the navy side, and on the yellow side none, a cream pixel (253,237,182) or cream + 2 px dark gold (165,133,26).
   The runs and the field's size are chosen so the line's numbers sit where GATE Hoodie's do (gate9c's PROBE build,
   logs/probe-gate.txt and logs/probe-fixture.txt):
                     thick      side (navy)   side (yellow)   ROUND (letter)   ROUND (navy)   navy side at REACH 3 / 2
     GATE, 4 lines   .284-.337  .227-.361     .394-.435       .824-.902        .213-.298      .169-.332 / .023-.142
     this, 4 lines   .311-.313  .219-.308     .392-.411       .827-.835        .296           .151-.307 / .069-.097
     [round 9c's picture; round 9d's: ROUND (letter) .823-.835, ROUND (navy) .2986, side (yellow) .389-.411, the rest
      unchanged - see ROUND 9d below]
   and a drawn ring cell holds 78-80 px of the line where the line runs straight (GATE's drawn ring cells: 79-177; one
   cell, 47,44 in the E's top ring, has a 2 px AA speck in the line: 78 px). So the line is HUG's at the shipped
   numbers and refused at HUG_REACH 2 or 3, HUG_SIDE above .219, HUG_ROUND above .827 or at or below .296, and its
   ring cells drop at HUG_PX above 78/16 - each where GATE's ring changes too (gate9c's notes give the windows).
     G  yellow x 288-392, y 720-879 (cells 18-24, the right edge inside cell 24), with a COUNTER: a lined slot x 326-337,
        y 760-841 (navy, a light AA pixel each side, a 5 px white lining), opening LEFT through a 12 px MOUTH (y 823-834)
        cut through the lining, the stroke and the outline - the G's counter opens to the outside as GATE's does, so
        its lining is part of the outer line. The cell 20,52 at the counter's foot holds exactly 118 navy and 118 white
        pixels (a 2 px AA speck in the white makes the tie), 20 other; 72% of its navy is closed - like GATE's 31,76
        (109 / 109, 86% closed).
     A  yellow x 421-527 (cells 26-32): ONE navy cell (column 25) between the G's yellow and the A's - the letters are
        a cell apart, as G|A at GATE's rows 75-77; an ENCLOSED HOLE x 464-479, y 784-799 (cell 29,49) lined white.
     T  yellow x 560-655, y 784-879 (cells 35-40, rows 49-54): a channel of 22 px between the A's line and the T's
        (cells 33-34, rows 49-54), and the A's ring cell 33,48 beside the T's top: 5 of its 16 navy rows are closed by
        the T's line (31.3%; GATE's 36,74 has 25.8%).
     E  yellow x 720-815 (cells 45-50), open navy all round.
   Each ring cell under a letter (row 55) holds 5 white rows, 1-3 AA rows, then 8-10 px of navy down to the hem: its
   navy meets the black hem (18 px thick, then transparency) going down, as GATE's row 79 meets the hood's black edge.
   paint(o) takes design overrides (o.m1, o.yb, o.mh, o.pat, o.field, o.nospeck, and round 9d's o.pins, o.shadow,
   o.shades); the spec calls paint() with none.

   ROUND 9d (gate9d). Round 9c's verifier: HUG_CLEAR 0 or 0.03 gives GATE Hoodie's live, ringless output byte for byte
   and passed all 456 specs, as did HUG_CLEAR 0.05 and transparency counted three times (S9); HUG_ROUND 0.825 (GATE 6
   cells) passed; and the ring's colour was not pinned (S4: the brightest exact colour instead of the most common; S5:
   the label read from the shape cell first). Round 9c's picture was opaque above the hem (its lines read clear 0, GATE's
   .037-.073), its lowest ROUND was .827 (GATE's .824), and its line one exact colour. Three additions, each measured
   with gate9c's PROBE build (gate9d/tune9d.cjs, logs/probe-9d.txt); thick, side, REACH 3 / 2, roundO, the ring cells'
   pixels, the tie and the share cells are unchanged from round 9c to the digit:
     PINHOLES (PINS): transparent pixels in the light anti-alias row beside the line, only on '3' runs, where the line's
       contact found no side within 4 px - each turns one 'none' into one 'clear' and moves nothing else; and 3 in the
       A's cream edge, which take the A's ROUND from .827 to .823.
                     clear (exact), A T G E            ROUND (letter, exact), A T G E
       GATE Hoodie   .03672 .04202 .05625 .07298       .82377 .90175 .84707 .83604   (PROBE pieces 6 11 64 68)
       this picture  .03700 .04332 .05638 .07383       .82273 .82921 .83498 .82959
       (which GATE piece is which letter: the cells each one-line mutant moves on GATE at 16, gate9d logs/gate-screen-16.txt
       - HUG_ROUND 0.824 moves 38-41,69 36,73 36,74, the A's; HUG_CLEAR 0.0729 moves 52-53,70 50,75-76 51-53,79, the E's;
       HUG_ROUND 0.2975 moves 30-33,70 30-32,79, round the G - its hole cell is 31,76; the T is the one left)
       (each line's highest is set just ABOVE GATE's, the lowest ROUND just BELOW: a value that moves GATE fails here;
       a value between the two moves only this picture - tighter, never looser)
     FIELD: the navy field ends at x 887 (was 903): the navy's own ROUND (the share of its edge the line lines) rises
       from .29647 to .29858, just ABOVE GATE's highest navy ROUND (.29801, its T's): so a HUG_ROUND lowered far enough
       to refuse GATE's T for being 'round the outside' refuses all four lines here too (round 9c: .296, a looser
       window (.29647, .29801] - its verifier found 0.297 caught only by gapkept).
       So HUG_CLEAR 0 and 0.03 refuse all four lines (no ring, as GATE's live), 0.04 G T E, 0.05 G and E, 0.07 E - the
       same letters as on GATE at each value; counting a transparency contact three times refuses E (.221 > .2; GATE:
       .219, E); HUG_ROUND 0.825 refuses A (GATE: A).
     SHADES and SHADOW: the line is drawn in WH (250,250,248, 77% of its own pixels), X1 (251,250,248, one step brighter)
       and seven near-whites 4-12 apart, each 1/30 of WH's pixels on a fixed pattern; and the two side lines facing the
       G|A gap in a greyer SHADOW (236,238,240). Measured (PROBE9D, logs/labels-9d.txt): 17 exact colours meet k-means'
       16 labels, and X1 is the one merged - into WH's label; every other near-white and SHADOW is a label of its own,
       all one LINE family with WH (so the line is still one piece: nothing above moves). At the four corner ring
       cells (24,44 24,55 26,44 26,55) the letter's cell holds SHADOW line pixels. So the ring cell's colour - the most
       common exact colour of the most common label of the line in the ring cell - is WH; the brightest of the label
       (S4) is X1 at every ring cell, and the label read from the shape cell first (S5) is SHADOW's at the four corners.
       The k-means merge is a measured fact of this picture under the engine's seeded sample, not a property the spec
       derives: gate9d's notes say so. */
export const GL = `
(function () {
  var W = 1280, NL = String.fromCharCode(10);
  var NAVY = [13, 32, 74], YEL = [252, 189, 7], WH = [250, 250, 248], BLACK = [0, 0, 0];
  var AAL = [183, 192, 206], AAM = [121, 135, 159], CREAM = [253, 237, 182], GOLD = [165, 133, 26], CLEAR = [0, 0, 0, 0];
  function paintRects(rects) {
    var d = new Uint8ClampedArray(W * W * 4);
    rects.forEach(function (r) {
      for (var y = r[1]; y < r[1] + r[3]; y++) for (var x = r[0]; x < r[0] + r[2]; x++) {
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        var o = (y * W + x) * 4; d[o] = r[4][0]; d[o + 1] = r[4][1]; d[o + 2] = r[4][2]; d[o + 3] = r[4].length > 3 ? r[4][3] : 255;
      }
    });
    return d;
  }
  /* a letter: yellow x0..x1-1, y0..y1-1, a 5 px white line round it. Outside the line an anti-alias row per 16 px run
     along each side (aa.t/b/l/r, one digit a run, the last digit repeats): 0 none, 1 light, 2 light+mid, 3 light+mid+mid;
     the corners get none. Inside, on the yellow's edge (cr.t/b/l/r): 0 none, 1 a cream pixel, 3 cream then 2 gold. */
  function letter(R, x0, y0, x1, y1, aa, cr) {
    R.push([x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, WH], [x0, y0, x1 - x0, y1 - y0, YEL]);
    function run(p, k) { return p ? +(p[Math.min(k, p.length - 1)]) : 0; }
    function inner(c) { return c === 1 ? [CREAM] : c === 3 ? [CREAM, GOLD, GOLD] : []; }
    var k, a, s, j, n, q;
    for (k = 0, s = x0; s < x1; s += 16, k++) {
      n = Math.min(16, x1 - s);
      a = run(aa.t, k); for (j = 1; j <= a; j++) R.push([s, y0 - 5 - j, n, 1, j === 1 ? AAL : AAM]);
      a = run(aa.b, k); for (j = 1; j <= a; j++) R.push([s, y1 + 4 + j, n, 1, j === 1 ? AAL : AAM]);
      q = inner(run(cr.t, k)); for (j = 0; j < q.length; j++) R.push([s, y0 + j, n, 1, q[j]]);
      q = inner(run(cr.b, k)); for (j = 0; j < q.length; j++) R.push([s, y1 - 1 - j, n, 1, q[j]]);
    }
    for (k = 0, s = y0; s < y1; s += 16, k++) {
      n = Math.min(16, y1 - s);
      a = run(aa.l, k); for (j = 1; j <= a; j++) R.push([x0 - 5 - j, s, 1, n, j === 1 ? AAL : AAM]);
      a = run(aa.r, k); for (j = 1; j <= a; j++) R.push([x1 + 4 + j, s, 1, n, j === 1 ? AAL : AAM]);
      q = inner(run(cr.l, k)); for (j = 0; j < q.length; j++) R.push([x0 + j, s, 1, n, q[j]]);
      q = inner(run(cr.r, k)); for (j = 0; j < q.length; j++) R.push([x1 - 1 - j, s, 1, n, q[j]]);
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, aa: aa, cr: cr };
  }
  /* round 9d: PINHOLES - transparent pixels at offsets 2, 4, .. 2n (step 1: 1, 2, .. n) of run k on a side of a letter. Outside (inner false):
     in the light anti-alias row next to the line, only where that run is '3' (light + mid + mid): there the line's
     contact found no side within HUG_REACH px ('none'), so a pinhole turns one 'none' into one 'clear' and moves no
     side share, no thickness and no ROUND. Inner (inner true): in the cream pixel on the yellow's edge, only where
     that run is '1': the yellow's own contact there reached the line, so the letter's ROUND drops by one contact (and
     the line's contact there turns from the yellow side to 'clear'). Every pinhole stays inside its run. */
  function pins(R, Lt, side, k, n, inner, step) {
    step = step || 2;
    var p = (inner ? Lt.cr : Lt.aa)[side], dg = p ? +(p[Math.min(k, p.length - 1)]) : 0, i, s, end = side === 't' || side === 'b' ? Lt.x1 : Lt.y1;
    if (dg !== (inner ? 1 : 3)) throw new Error('pins: run ' + k + ' of side ' + side + ' is ' + dg);
    for (i = 1; i <= n; i++) {
      s = (side === 't' || side === 'b' ? Lt.x0 : Lt.y0) + 16 * k + step * i; if (s >= end || step * i > 15) throw new Error('pins: outside the run');
      if (side === 't' || side === 'b') R.push([s, inner ? (side === 't' ? Lt.y0 : Lt.y1 - 1) : (side === 't' ? Lt.y0 - 6 : Lt.y1 + 5), 1, 1, CLEAR]);
      else R.push([inner ? (side === 'l' ? Lt.x0 : Lt.x1 - 1) : (side === 'l' ? Lt.x0 - 6 : Lt.x1 + 5), s, 1, 1, CLEAR]);
    }
  }
  /* round 9d defaults (paint() with no options paints these; o.pins / o.shadow / o.shades replace them, [] = none):
     PINS [letter, side, run, n, inner, step]: outer pinholes G 91, A 37, T 35, E 79, and 3 inner (cream) in the A, which
     take A's ROUND from .827 to .823. Each letter's clear share is set just above the GATE letter's own (gate9d
     logs/exact-gate.txt: A .03672, T .04202, G .05625, E .07298). No pinhole in a run facing a kept gap (G right, A
     left, A right beside the T, T left) or the G's mouth. */
  var PINS = [['G', 't', 0, 10, 0, 1], ['G', 't', 1, 7], ['G', 't', 3, 7], ['G', 't', 5, 7], ['G', 'l', 0, 7], ['G', 'l', 2, 7], ['G', 'l', 4, 7], ['G', 'l', 8, 7], ['G', 'l', 9, 7],
    ['G', 'b', 0, 7], ['G', 'b', 2, 7], ['G', 'b', 4, 7], ['G', 'b', 6, 4],
    ['A', 't', 0, 7], ['A', 't', 2, 7], ['A', 'r', 0, 7], ['A', 'r', 2, 7], ['A', 'b', 0, 7], ['A', 'b', 2, 2], ['A', 't', 0, 3, 1],
    ['T', 't', 0, 7], ['T', 't', 1, 7], ['T', 't', 2, 7], ['T', 't', 4, 7], ['T', 'r', 0, 7],
    ['E', 't', 0, 7], ['E', 't', 2, 7], ['E', 't', 4, 7], ['E', 'l', 0, 7], ['E', 'l', 2, 7], ['E', 'l', 4, 7], ['E', 'l', 6, 7], ['E', 'l', 8, 7], ['E', 'r', 0, 7], ['E', 'r', 1, 7], ['E', 'r', 3, 7], ['E', 'r', 4, 2]];
  /* SHADOWS: the side lines facing the G|A gap (G right, A left) in a greyer white, SHADOW. SHADES: on WH's pixels
     (x * 31 + y * 17) mod 30 = q < 8 takes SHADES[q] (each 1/30): X1 = 251,250,248 one step brighter than WH, then
     seven near-whites 4-12 apart (each a k-means label of its own); WH keeps the rest (77% of its pixels). */
  var SHADOW = [236, 238, 240], SHADOWS = [['G', 'r'], ['A', 'l']];
  var SHADES = [[251, 250, 248], [244, 244, 244], [238, 241, 244], [247, 244, 240], [241, 246, 241], [244, 240, 248], [248, 248, 240], [240, 244, 250]];
  function paint(o) {
    o = o || {};
    var m1 = o.m1 === undefined ? 834 : o.m1, yb = o.yb === undefined ? 842 : o.yb, mh = o.mh === undefined ? 12 : o.mh, P = o.pat || {};
    var F = o.field || [216, 640, 888], R = [[F[0], F[1], F[2] - F[0], 896 - F[1], NAVY], [F[0], 896, F[2] - F[0], 18, BLACK]];
    /* G */
    var LG = letter(R, 288, 720, 393, 880, P.Ga || { t: '3313031', b: '3131313', l: '3130313133', r: '3131313131' }, P.Gc || { t: '1031301', b: '0030000', l: '1031101310', r: '0003000000' });
    /* the G's counter: a lined slot x 326-337 down to yb-1, a light AA pixel between the lining and the navy, opening
       left through a mouth (rows m1-mh+1..m1) that cuts the lining, the stroke and the outline */
    R.push([320, 755, 24, yb - 755 + 6, WH], [325, 760, 14, yb - 760 + 1, AAL], [326, 760, 12, yb - 760, NAVY]);
    R.push([288, m1 - mh - 4, 37, mh + 10, WH], [276, m1 - mh + 1, 50, mh, NAVY]);
    /* a 2 px speck in the counter's bottom lining (the source's white is not clean) */
    if (!o.nospeck) R.push([329, yb + 3, 2, 1, AAL]);
    /* A, with an enclosed lined hole */
    var LA = letter(R, 421, 720, 528, 880, P.Aa || { t: '3130213', b: '3131313', l: '3131313131', r: '3132103130' }, P.Ac || { t: '1310310', b: '0', l: '0', r: '0131031013' });
    R.push([459, 779, 26, 26, WH], [464, 784, 16, 16, NAVY]);
    /* T, its top lower than the A's */
    var LT = letter(R, 560, 784, 656, 880, P.Ta || { t: '333031', b: '313131', l: '1', r: '313031' }, P.Tc || { t: '103110', b: '000300', l: '0', r: '010130' });
    /* E */
    var LE = letter(R, 720, 720, 816, 880, P.Ea || { t: '323032', b: '3131313', l: '3230323230', r: '3303330313' }, P.Ec || { t: '103110', b: '0', l: '1031101110', r: '0131011013' });
    /* a 2 px speck in the E's top line, in ring cell 47,44: that cell holds 78 px of the line (GATE's ring cells: 78-94) */
    if (!o.nospeck) R.push([760, 716, 2, 1, AAL]);
    /* round 9d: the pinholes, last (each lands on a light anti-alias or a cream pixel: pins() checks the run) */
    var LL = { G: LG, A: LA, T: LT, E: LE };
    (o.pins || PINS).forEach(function (p) { pins(R, LL[p[0]], p[1], p[2], p[3], !!p[4], p[5]); });
    /* round 9d: SHADOW sides - a side line painted in a second, greyer white (o.shadow: [[letter, side], ..]) */
    var SH = o.shadowCol || SHADOW;
    (o.shadow || SHADOWS).forEach(function (p) { var L2 = LL[p[0]];
      if (p[1] === 'r') R.push([L2.x1, L2.y0, 5, L2.y1 - L2.y0, SH]); else if (p[1] === 'l') R.push([L2.x0 - 5, L2.y0, 5, L2.y1 - L2.y0, SH]); else throw new Error('shadow side ' + p[1]); });
    var d = paintRects(R), sh = o.shades || SHADES, mod = o.shadeMod || 30, i, x, y, q;
    /* round 9d: SHADES - the line's own white (WH) pixels take near-white variants on a fixed pattern */
    if (sh.length) for (i = 0; i < W * W; i++) {
      if (d[i * 4] !== WH[0] || d[i * 4 + 1] !== WH[1] || d[i * 4 + 2] !== WH[2] || d[i * 4 + 3] !== 255) continue;
      x = i % W; y = (i / W) | 0; q = (x * 31 + y * 17) % mod; if (q >= sh.length) continue;
      d[i * 4] = sh[q][0]; d[i * 4 + 1] = sh[q][1]; d[i * 4 + 2] = sh[q][2];
    }
    return d;
  }
  function cls(d, i) {
    if (d[i * 4 + 3] < 128) return '.';
    var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (r > 170 && g > 110 && b < 100) return 'Y';
    if (r > 190 && g > 190 && b > 190) return 'W';
    if (b > r + 20 && r < 80) return 'N';
    if (r < 40 && g < 40 && b < 40) return 'K';
    return '?';
  }
  function at(o, x, y) { return cls(o.data, y * o.w + x); }
  function map(o, x0, y0, w, h) {
    var s = '', x, y;
    for (y = y0; y < y0 + h; y++) { s += String(y).padStart(3) + ' '; for (x = x0; x < x0 + w; x++) s += at(o, x, y); s += NL; }
    return s;
  }
  /* yellow cells; 4-neighbour edges from a yellow cell to a navy cell, listed as the navy cell 'x,y' */
  function count(o) {
    var w = o.w, Y = [], navyAt = [], white = 0, other = 0, i, x, y, c = [];
    for (i = 0; i < w * w; i++) c.push(cls(o.data, i));
    for (i = 0; i < w * w; i++) {
      if (c[i] === 'W') white++; if (c[i] === '?') other++;
      if (c[i] !== 'Y') continue; Y.push(i); x = i % w; y = (i / w) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx >= 0 && yy >= 0 && xx < w && yy < w && c[yy * w + xx] === 'N') navyAt.push(xx + ',' + yy); });
    }
    return { yellow: Y.length, Y: Y.join(','), edges: navyAt.length, navyAt: navyAt, white: white, other: other };
  }
  /* the cells (of size s) whose source pixels are at least half the letters' yellow, from the painted picture itself */
  function yellowCells(rgba, s) {
    var n = W / s, out = [], cx, cy, x, y, k, o;
    for (cy = 0; cy < n; cy++) for (cx = 0; cx < n; cx++) {
      k = 0;
      for (y = cy * s; y < cy * s + s; y++) for (x = cx * s; x < cx * s + s; x++) { o = (y * W + x) * 4; if (rgba[o] === YEL[0] && rgba[o + 1] === YEL[1] && rgba[o + 2] === YEL[2]) k++; }
      if (2 * k >= s * s) out.push(cx + ',' + cy);
    }
    return out;
  }
  /* round 9d: the line's own most common exact colour, from the painted picture (its near-white pixels, 'W'), and the
     exact colour 'r,g,b' of each listed cell of an output */
  function lineColour(rgba) {
    var m = new Map(), i, k, best = '', bn = 0;
    for (i = 0; i < W * W; i++) { if (cls(rgba, i) !== 'W') continue; k = rgba[i * 4] + ',' + rgba[i * 4 + 1] + ',' + rgba[i * 4 + 2]; m.set(k, (m.get(k) || 0) + 1); }
    m.forEach(function (v, c) { if (v > bn) { bn = v; best = c; } });
    return best;
  }
  function exact(o, cells) { return cells.map(function (s) { var p = s.split(','), i = (+p[1] * o.w + +p[0]) * 4; return o.data[i] + ',' + o.data[i + 1] + ',' + o.data[i + 2]; }); }
  function seq(x0, x1, y0, y1) { var r = [], x, y; for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) r.push(x + ',' + y); return r; }
  /* what the spec asserts at size 16, cell by cell: [name, cells, wanted, kept gap?, why] */
  var EXPECT = [
    ['ringTop', seq(18, 24, 44, 44).concat(seq(26, 32, 44, 44), seq(35, 40, 48, 48), seq(45, 50, 44, 44)), 'W', false,
      'the ring over each letter (G, A, T, E) is drawn white'],
    ['ringSides', seq(17, 17, 45, 50).concat(seq(17, 17, 52, 54), seq(33, 33, 45, 47), seq(41, 41, 49, 54), seq(44, 44, 45, 54), seq(51, 51, 45, 54)), 'W', false,
      'the ring down the open sides (G left, A right above the T, T right, E both) is drawn white'],
    ['ringHem', seq(18, 24, 55, 55).concat(seq(26, 32, 55, 55), seq(35, 40, 55, 55), seq(45, 50, 55, 55)), 'W', false,
      'the ring under each letter, 8-10 px of navy above the black hem, is drawn white (the hem is a third colour 18 px thick: it leaves a walk OPEN, it does not close it)'],
    ['shareCell', ['33,48'], 'W', false,
      'the A ring cell beside the top of the T (5 of 16 navy rows closed, 31.3% - under GAP\\'s half) is drawn white'],
    ['tieCell', ['20,52'], 'N', true,
      'the G counter cell with exactly as much navy as white (118 / 118, 20 AA / speck pixels besides, 72% of its navy closed) stays navy: at least as much fill as line'],
    ['counter', seq(20, 20, 48, 51), 'N', true, 'the rest of the G\\'s counter stays navy'],
    ['mouth', seq(18, 19, 51, 51), 'N', true, 'the G\\'s mouth (its counter opening to the outside) stays navy'],
    ['gapGA', seq(25, 25, 45, 54), 'N', true, 'the one navy cell between the G and the A stays navy: the letters are not fused'],
    ['channelAT', seq(33, 34, 49, 54), 'N', true, 'the 22 px channel between the A and the T stays navy'],
    ['hole', ['29,49'], 'N', true, 'the A\\'s enclosed hole stays navy'],
  ];
  function judge(o) {
    var got = {};
    EXPECT.forEach(function (e) { got[e[0]] = e[1].map(function (s) { var p = s.split(','); return at(o, +p[0], +p[1]); }).join(''); });
    return got;
  }
  function kept() { var s = []; EXPECT.forEach(function (e) { if (e[3]) s = s.concat(e[1]); }); return s; }
  function report(o, size) {
    var k = count(o);
    return 'yellow ' + k.yellow + ' white ' + k.white + ' other ' + k.other + ' edges ' + k.edges + ' at ' + k.navyAt.join(' ') + NL +
      (size === 16 ? map(o, 15, 42, 40, 16) : map(o, 30, 84, 80, 32));
  }
  /* the page side (the spec only; gapfixtures.js's helpers, copied so this file stands alone) */
  async function png(rgba) {
    var c = document.createElement('canvas'); c.width = W; c.height = W;
    c.getContext('2d').putImageData(new ImageData(rgba, W, W), 0, 0);
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/png'); });
    c.width = 1; c.height = 1;
    return new Uint8Array(await blob.arrayBuffer());
  }
  function set(step, pal) {
    document.getElementById('fixmode').value = 'fast';
    document.getElementById('fixgrid').checked = true;
    document.getElementById('fixpal').checked = !!pal;
    document.getElementById('fixline').checked = true;
    var f = document.getElementById('fixforce'); f.disabled = false; f.value = String(step);
  }
  /* the engine switches the page has (base-623 has no HUG_ON: it has no HUG, so its control is the page as it is) */
  function has(name) { return (document.getElementById('pfcore').textContent.match(new RegExp('var ' + name + ' = (true|false);', 'g')) || []).length === 1; }
  /* one run; offs = engine switches turned off in the page's own engine text for this run only - each must exist once */
  async function run(bytes, rel, step, offs, pal) {
    set(step, pal);
    var el = document.getElementById('pfcore'), orig = el.textContent, txt = orig;
    (offs || []).forEach(function (off) {
      var re = new RegExp('var ' + off + ' = (true|false);', 'g');
      if ((txt.match(re) || []).length !== 1) throw new Error('the engine has no switch ' + off);
      txt = txt.replace(re, 'var ' + off + ' = false;');
    });
    el.textContent = txt;
    try {
      await fixLoad(fileWithPath(bytes, rel));
      var out = await fixRun();
      return out ? { w: out.width, data: Array.from(out.data) } : null;
    } finally { el.textContent = orig; }
  }
  window.__gl = { paint: paint, cls: cls, at: at, map: map, count: count, yellowCells: yellowCells, EXPECT: EXPECT, judge: judge, kept: kept, report: report,
    lineColour: lineColour, exact: exact,
    want: function (name) { var e = EXPECT.filter(function (x) { return x[0] === name; })[0]; return e[1].map(function () { return e[2]; }).join(''); },
    png: png, set: set, has: has, run: run };
})();`;
