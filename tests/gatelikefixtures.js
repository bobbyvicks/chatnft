/* Round 9c (gate9c) fixture for gatelike.spec.js: the GATE-LIKE picture. Injected into the page as a script
   (window.__gl); gate9c/fx.cjs evaluates the same text in Node (design and mutant screening only - the spec judges).

   1280 x 1280, cells of 16 at Pixel size 16. A navy field x 216-903, y 640-895; under it a black hem y 896-913 (a
   hood's edge), then transparency. Four yellow letter-like blocks G, A, T, E standing on the hem, each in a 5 px white
   line (GATE's outline is 6-7 px; its mean thickness reads 0.28-0.34 of a cell, these 0.31). Behind the line, per
   16 px run, an anti-alias row of 0-3 px (light 183,192,206 then mid 121,135,159 - GATE's own two AA families) on
   the navy side, and on the yellow side none, a cream pixel (253,237,182) or cream + 2 px dark gold (165,133,26).
   The runs and the field's size are chosen so the line's numbers sit where GATE Hoodie's do (gate9c's PROBE build,
   logs/probe-gate.txt and logs/probe-fixture.txt):
                     thick      side (navy)   side (yellow)   ROUND (letter)   ROUND (navy)   navy side at REACH 3 / 2
     GATE, 4 lines   .284-.337  .227-.361     .394-.435       .824-.902        .213-.298      .169-.332 / .023-.142
     this, 4 lines   .311-.313  .219-.308     .392-.411       .827-.835        .296           .151-.307 / .069-.097
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
   paint(o) takes design overrides (o.m1, o.yb, o.mh, o.pat, o.field, o.nospeck); the spec calls paint() with none. */
export const GL = `
(function () {
  var W = 1280, NL = String.fromCharCode(10);
  var NAVY = [13, 32, 74], YEL = [252, 189, 7], WH = [250, 250, 248], BLACK = [0, 0, 0];
  var AAL = [183, 192, 206], AAM = [121, 135, 159], CREAM = [253, 237, 182], GOLD = [165, 133, 26];
  function paintRects(rects) {
    var d = new Uint8ClampedArray(W * W * 4);
    rects.forEach(function (r) {
      for (var y = r[1]; y < r[1] + r[3]; y++) for (var x = r[0]; x < r[0] + r[2]; x++) {
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        var o = (y * W + x) * 4; d[o] = r[4][0]; d[o + 1] = r[4][1]; d[o + 2] = r[4][2]; d[o + 3] = 255;
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
  }
  function paint(o) {
    o = o || {};
    var m1 = o.m1 === undefined ? 834 : o.m1, yb = o.yb === undefined ? 842 : o.yb, mh = o.mh === undefined ? 12 : o.mh, P = o.pat || {};
    var F = o.field || [216, 640, 904], R = [[F[0], F[1], F[2] - F[0], 896 - F[1], NAVY], [F[0], 896, F[2] - F[0], 18, BLACK]];
    /* G */
    letter(R, 288, 720, 393, 880, P.Ga || { t: '3313031', b: '3131313', l: '3130313133', r: '3131313131' }, P.Gc || { t: '1031301', b: '0030000', l: '1031101310', r: '0003000000' });
    /* the G's counter: a lined slot x 326-337 down to yb-1, a light AA pixel between the lining and the navy, opening
       left through a mouth (rows m1-mh+1..m1) that cuts the lining, the stroke and the outline */
    R.push([320, 755, 24, yb - 755 + 6, WH], [325, 760, 14, yb - 760 + 1, AAL], [326, 760, 12, yb - 760, NAVY]);
    R.push([288, m1 - mh - 4, 37, mh + 10, WH], [276, m1 - mh + 1, 50, mh, NAVY]);
    /* a 2 px speck in the counter's bottom lining (the source's white is not clean) */
    if (!o.nospeck) R.push([329, yb + 3, 2, 1, AAL]);
    /* A, with an enclosed lined hole */
    letter(R, 421, 720, 528, 880, P.Aa || { t: '3130213', b: '3131313', l: '3131313131', r: '3132103130' }, P.Ac || { t: '1310310', b: '0', l: '0', r: '0131031013' });
    R.push([459, 779, 26, 26, WH], [464, 784, 16, 16, NAVY]);
    /* T, its top lower than the A's */
    letter(R, 560, 784, 656, 880, P.Ta || { t: '333031', b: '313131', l: '1', r: '313031' }, P.Tc || { t: '103110', b: '000300', l: '0', r: '010130' });
    /* E */
    letter(R, 720, 720, 816, 880, P.Ea || { t: '323032', b: '3131313', l: '3230323230', r: '3303330313' }, P.Ec || { t: '103110', b: '0', l: '1031101110', r: '0131011013' });
    /* a 2 px speck in the E's top line, in ring cell 47,44: that cell holds 78 px of the line (GATE's ring cells: 78-94) */
    if (!o.nospeck) R.push([760, 716, 2, 1, AAL]);
    return paintRects(R);
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
    want: function (name) { var e = EXPECT.filter(function (x) { return x[0] === name; })[0]; return e[1].map(function () { return e[2]; }).join(''); },
    png: png, set: set, has: has, run: run };
})();`;
