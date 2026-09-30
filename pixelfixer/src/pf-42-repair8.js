/* pf-42-repair8.js - the cell step for Pixel size 8: two_stage_pack's vote,
 * then four repairs, each a failure measured on real traits at size 8.
 *
 * WHY THIS EXISTS. At 8 px cells (a 160 x 160 grid on a 1280 canvas) the
 * plain vote of PF.two_stage_pack (pf-40) loses what a pixel artist keeps:
 * a black bar 5-7 px thick that falls across two cells wins neither and
 * vanishes (Mouth 05: the left teeth bar gone, the bottom bar broken), a
 * thin stroke on transparency breaks into dots, and a textured fill leaves
 * single cells of a stray shade (Mouth 05's pale-yellow teeth cells).
 * PF.repair8_pack runs the same vote and then repairs those three things.
 * Every rule below was switched off on its own and the pictures that changed
 * back were looked at; the rules left out were measured and dropped (see the
 * end of this header).
 *
 *   PF.repair8_pack(rgba, cols, rows, colour) -> {d, w: cols, h: rows, cn: 4}
 *
 *   rgba    {d, w, h, cn: 4}, straight RGBA; alpha-0 pixels read (0,0,0,0)
 *           as the page's canvas decodes them. RGBA only: every rule reads
 *           alpha.
 *   colour  {labOf, deltaE2000}: the page's own CIELAB and CIEDE2000, passed
 *           in by the worker so there is ONE definition of "how different do
 *           these two colours look" (the palette step uses the same pair).
 *
 * It resets nothing: PF.process resets the RNG before the k-means, exactly as
 * it does before two_stage_pack. With every repair skipped the result is
 * two_stage_pack(rgba, cols, rows, 0, {}) byte for byte (stage 1 and stage 2
 * below are its code); art already on the 8 px grid comes out byte-identical
 * with the repairs on (every cell is one colour, so no rule fires).
 *
 * THE REPAIRS (in the order they run; the numbers are the named consts):
 *
 *  1. RESCUE (a line about one cell thick that straddles two cells).
 *     Each pair of neighbouring cells is read as 16 pixel lines across the
 *     pair. A colour family (labels within LINE_FAM_DE of the family's
 *     biggest label) is a LINE there when it fills FULL of the width on
 *     RESCUE_LEN..RESCUE_MAXLEN consecutive pixel lines that cross the shared
 *     edge and do not touch the pair's outer edge (so it does not run on into
 *     the next cell: a line, not the edge of a thick shape). The line belongs
 *     to the cell holding its centre.
 *       vanish - it won neither cell: the centre cell takes it (and becomes
 *                opaque), taking the label that draws that line. Mouth 05's
 *                left teeth bar and its bottom bar come back.
 *       double - it won both cells (or it is being moved into the centre
 *                cell): the other cell gives it up, but only when the line
 *                CONTINUES past the pair along its direction (a line does, a
 *                block does not: Crooked Smiley's X eyes are 9 px blocks
 *                stepping diagonally, and treating each block as a doubled
 *                line cut an arm off the X), the other cell holds almost
 *                nothing else of it, the cells along the line give it up too
 *                (no notch: Argentina 10 Shirt's "0" came out 2 cells wide
 *                with a 1-cell notch), and the line's cells stay connected.
 *     A hanging guard drops an added cell that only touches one piece of the
 *     line already shown: that is a bump on a line, not a line.
 *
 *  2. CONNECT (a thin stroke on transparency stays one piece).
 *     If one 8-connected piece of source paint comes out as two or more
 *     8-connected pieces of cells, the gap is bridged through the empty cells
 *     that hold most of that same stroke (at most CONNECT_MAXLEN cells). It
 *     only joins pieces of the SAME source stroke, so it cannot hang a cell
 *     off a clean outline: a clean outline is already one piece. A bridge
 *     cell takes the colour its stroke has around it.
 *
 *  3. SPECKS (a textured fill comes out as flat as drawn, shading kept).
 *     Labels are one TONE when they are close (TONE_DE), finely interleaved
 *     INSIDE cells (art already on the grid has no such contacts), their
 *     specks are smaller than a cell, and most of the joining label's
 *     contacts are with the tone (an anti-alias edge sits between two
 *     regions and is not texture). Inside a region of one tone only SPECKS
 *     change: 1-2 cells of a close shade, in a field of the region's colour,
 *     each won on a split vote (the winning label holds under SPECK_COVER of
 *     the cell: noise, not a drawn block). A speck takes the colour its
 *     neighbours already have. Everything else keeps its colour exactly:
 *     Impossible Fold Skin's shaded maze faces and Divine Ponytail's drawn
 *     olive highlights stay. A walled-in piece of a tone of at most
 *     SMALLREG_MAX cells (a tooth between bars) takes the tone's colour from
 *     elsewhere in the picture; a speck test cannot see it.
 *
 * MEASURED AND LEFT OUT: equal (box) pixel weights in the vote bent Crooked
 * Smiley's X, Argentina's "0" and Bitcoin Cap's stem, so the vote keeps
 * two_stage_pack's centre weight; a texture tone voting as one widened
 * Bitcoin Cap's stem; recolouring whole shade patches merged Impossible Fold
 * Skin's shading; recolouring to a colour no cell had moved Walnut Chessboard
 * Skin's cells across palette colours (the palette groups colours by count).
 *
 * Needs, resolved AT CALL TIME on PF (a missing port throws by name):
 *   PF.adaptive_k                              pf-40-reconstruct.js
 *   PF.kmeans_quantize                         pf-11-quantize.js
 *   PF.clipScalar PF.argmax PF.npMaximum PF.rint  pf-00-base.js
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  function need(name, file) {
    if (typeof PF[name] !== 'function') {
      throw new Error('pf-42-repair8.js: PF.' + name + ' is missing -- load ' + file + ' first');
    }
  }

  // ------------------------------------------------------------ constants
  // RESCUE
  var FULL = 0.75;           // a pixel line across the pair belongs to the line when the family fills this much of it
  var RESCUE_LEN = 4;        // a straddling line is at least this many px thick (thinner is anti-alias, not a line)
  var RESCUE_MAXLEN = 12;    // ... and at most this many (thicker wins a cell on its own)
  var UNDOUBLE_MAXLEN = 9;   // a line shown in both cells is doubled only when at most this thick (about one cell)
  var RESCUE_REST = 0.15;    // ... and the other cell holds less than this share of the family beyond the line
  var RESCUE_MIN = 0.2;      // the cell that takes a line must hold at least this share of it itself
  var RESCUE_TIE = 0.06;     // a line centre this close (x cell) to the shared edge is a tie: continuation decides
  var LINE_FAM_DE = 15;      // labels this close (CIEDE2000) are one line colour (black bar + its dark anti-alias)
  var LINE_CON_DE = 12;      // a rescued line must differ this much from what it replaces (lines contrast)
  // SPECKS
  var TONE_DE = 15;          // texture shades are at most this far from the tone's centre ...
  var TONE_MIX = 0.2;        // ... interleaved inside cells: contacts / smaller area at least this ...
  var TONE_INSIDE = 0.6;     // ... with at least this share of their in-cell contacts with the centre (not an edge) ...
  var TONE_BLOB = 1;         // ... and specks averaging under this many cells in area (a 10 px-grid drawing is detail)
  var FLAT_SHARE = 0.05;     // region colour candidates: exact colours holding at least this share of the region
  var PATCH_DE = 3;          // one shade: cell colours this close (the page's own same-shade is 2.3)
  var SPECK_MAX = 2;         // a speck is at most this many cells ...
  var SPECK_COVER = 0.65;    // ... each won by a label holding under this share of its cell (Mouth 05: 0.3-0.6; drawn blocks 0.7-1.0) ...
  var SPECK_DE = 15;         // ... of a shade at most this far from the region colour ...
  var NEIGH_DE = 12;         // ... in a field whose cells are all this close to the region colour
  var SMALLREG_MAX = 3;      // a walled-in piece of a tone this small takes the tone's colour from elsewhere
  // CONNECT
  var CONNECT_MINPX = 24;    // an output piece counts when it holds at least this many px of the stroke
  var CONNECT_MAXLEN = 4;    // longest bridge, in empty cells, per join
  var CONNECT_MINCOV = 0.1;  // a bridge cell must hold at least this share of the stroke

  /* the 8 cells around a cell, clockwise from top-left; ringPieces counts the
     8-connected pieces among the marked ones (king-move neighbours join) */
  var RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  function ringPieces(ring) {
    var seen = [false, false, false, false, false, false, false, false], k = 0, s, t, a, q;
    for (s = 0; s < 8; s++) {
      if (!ring[s] || seen[s]) continue;
      k++; q = [s]; seen[s] = true;
      while (q.length) {
        a = q.pop();
        for (t = 0; t < 8; t++) {
          if (ring[t] && !seen[t] && Math.max(Math.abs(RING[a][0] - RING[t][0]), Math.abs(RING[a][1] - RING[t][1])) === 1) { seen[t] = true; q.push(t); }
        }
      }
    }
    return k;
  }

  // CSR grouping of pixel indices by cell (pf-40's, in pixel order within a cell)
  function csrByCell(cell, N, n) {
    var offs = new Int32Array(n + 1), order = new Int32Array(N), i, c, fill;
    for (i = 0; i < N; i++) offs[cell[i] + 1]++;
    for (c = 0; c < n; c++) offs[c + 1] += offs[c];
    fill = new Int32Array(offs.subarray(0, n));
    for (i = 0; i < N; i++) { c = cell[i]; order[fill[c]++] = i; }
    return { offs: offs, order: order };
  }

  function mapEntries(m) { var a = []; m.forEach(function (v, k) { a.push([k, v]); }); return a; }

  /* ---------------------------------------------------------- shared facts
     Per label: mean colour of its paint pixels (alpha > 127) in Lab, and the
     CIEDE2000 between every two labels. Per cell: paint share per LINE family.
     Families are built around a centre (the biggest label starts one, a
     smaller label joins the nearest centre within reach), never chained:
     chaining joined black - dark grey - grey - white on XRP Chain. */
  function facts(d, w, h, N, lab, K, cell, n, cols, rows, colour) {
    var sum = new Float64Array(K * 3), cnt = new Float64Array(K), paint = new Uint8Array(N), i, l, a, b, x, y;
    for (i = 0; i < N; i++) {
      if (d[i * 4 + 3] > 127) { paint[i] = 1; l = lab[i]; cnt[l]++; sum[l * 3] += d[i * 4]; sum[l * 3 + 1] += d[i * 4 + 1]; sum[l * 3 + 2] += d[i * 4 + 2]; }
    }
    var L = [];
    for (l = 0; l < K; l++) L.push(cnt[l] ? colour.labOf(sum[l * 3] / cnt[l], sum[l * 3 + 1] / cnt[l], sum[l * 3 + 2] / cnt[l]) : null);
    var dE = new Float64Array(K * K);
    for (a = 0; a < K; a++) for (b = 0; b < K; b++) {
      dE[a * K + b] = (L[a] && L[b]) ? colour.deltaE2000(L[a][0], L[a][1], L[a][2], L[b][0], L[b][1], L[b][2]) : 999;
    }
    // 4-contacts between labels INSIDE one cell: a mix finer than the cell
    var con = new Float64Array(K * K);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!paint[i]) continue;
      if (x + 1 < w && paint[i + 1] && lab[i + 1] !== lab[i] && cell[i + 1] === cell[i]) { con[lab[i] * K + lab[i + 1]]++; con[lab[i + 1] * K + lab[i]]++; }
      if (y + 1 < h && paint[i + w] && lab[i + w] !== lab[i] && cell[i + w] === cell[i]) { con[lab[i] * K + lab[i + w]]++; con[lab[i + w] * K + lab[i]]++; }
    }
    var byCnt = []; for (l = 0; l < K; l++) if (cnt[l]) byCnt.push(l);
    byCnt.sort(function (p, q) { return cnt[q] - cnt[p] || p - q; });
    function star(ok) {
      var f = new Int32Array(K), centres = [], j, k, c, e, best, be;
      for (k = 0; k < K; k++) f[k] = k;
      for (j = 0; j < byCnt.length; j++) {
        k = byCnt[j]; best = -1; be = Infinity;
        for (var ci = 0; ci < centres.length; ci++) { c = centres[ci]; e = dE[k * K + c]; if (ok(k, c, e) && e < be) { be = e; best = c; } }
        if (best >= 0) f[k] = best; else centres.push(k);
      }
      return f;
    }
    // mean blob size per label (4-connected pixels of one label)
    var blobs = new Float64Array(K), seen = new Uint8Array(N), stk = new Int32Array(N), s0, sp, j;
    for (s0 = 0; s0 < N; s0++) {
      if (!paint[s0] || seen[s0]) continue;
      l = lab[s0]; blobs[l]++; sp = 0; stk[sp++] = s0; seen[s0] = 1;
      while (sp) {
        j = stk[--sp]; x = j % w;
        if (x > 0 && !seen[j - 1] && paint[j - 1] && lab[j - 1] === l) { seen[j - 1] = 1; stk[sp++] = j - 1; }
        if (x + 1 < w && !seen[j + 1] && paint[j + 1] && lab[j + 1] === l) { seen[j + 1] = 1; stk[sp++] = j + 1; }
        if (j >= w && !seen[j - w] && paint[j - w] && lab[j - w] === l) { seen[j - w] = 1; stk[sp++] = j - w; }
        if (j + w < N && !seen[j + w] && paint[j + w] && lab[j + w] === l) { seen[j + w] = 1; stk[sp++] = j + w; }
      }
    }
    var cellArea = (w / cols) * (h / rows);
    var blobMean = new Float64Array(K); for (l = 0; l < K; l++) blobMean[l] = blobs[l] ? cnt[l] / blobs[l] : 0;
    var line = star(function (k, c, e) { return e < LINE_FAM_DE; });
    var conTot = new Float64Array(K); for (a = 0; a < K; a++) for (b = 0; b < K; b++) conTot[a] += con[a * K + b];
    var tone = star(function (k, c, e) {
      return e < TONE_DE && con[k * K + c] / Math.min(cnt[k], cnt[c]) >= TONE_MIX && blobMean[k] < TONE_BLOB * cellArea &&
        conTot[k] > 0 && con[k * K + c] / conTot[k] >= TONE_INSIDE;
    });
    var toneSize = new Int32Array(K); for (l = 0; l < K; l++) if (cnt[l]) toneSize[tone[l]]++;
    // per-cell share of each LINE family (Float32, as measured)
    var cov = new Float32Array(n * K), paintCnt = new Float32Array(n), cellN = new Float32Array(n), c2, sc, f2;
    for (i = 0; i < N; i++) { c2 = cell[i]; cellN[c2]++; if (paint[i]) { cov[c2 * K + line[lab[i]]]++; paintCnt[c2]++; } }
    for (c2 = 0; c2 < n; c2++) { sc = cellN[c2] || 1; for (f2 = 0; f2 < K; f2++) cov[c2 * K + f2] /= sc; paintCnt[c2] /= sc; }
    return { paint: paint, cnt: cnt, dE: dE, line: line, tone: tone, toneSize: toneSize, cov: cov, paintCnt: paintCnt, cellN: cellN, cell: cell, w: w, h: h, lab: lab };
  }

  /* ---------------------------------------------------------- 1. RESCUE */
  function rescue(win, opaque, I, cols, rows, K, ACC) {
    var n = cols * rows, fam = I.line, cov = I.cov, W = I.w;
    var cellW = W / cols;
    if (cellW !== Math.floor(cellW) || I.h / rows !== cellW) return;   // whole square cells only (size 8 on 1280)
    var S = cellW, S2 = 2 * S, c, i;
    var winF = new Int32Array(n);
    for (c = 0; c < n; c++) winF[c] = opaque[c] ? fam[win[c]] : -1;
    function isF(k, f) { return k >= 0 && k < n && winF[k] === f; }
    var famPix = new Int32Array(I.w * I.h);
    for (i = 0; i < famPix.length; i++) famPix[i] = I.paint[i] ? fam[I.lab[i]] : -1;
    var add = new Map(), drop = new Map(), prof = new Map();

    function pair(a, b, horiz) {
      // horiz: a left of b, the line runs vertically; the profile is over pixel COLUMNS
      if (I.paintCnt[a] + I.paintCnt[b] === 0) return;
      prof.clear();
      var ax = (a % cols) * S, ay = ((a / cols) | 0) * S, u, v, x, y, f, p;
      for (u = 0; u < S2; u++) {            // across the pair
        for (v = 0; v < S; v++) {           // along the line
          x = horiz ? ax + u : ax + v; y = horiz ? ay + v : ay + u;
          f = famPix[y * W + x]; if (f < 0) continue;
          p = prof.get(f); if (!p) { p = new Int32Array(S2); prof.set(f, p); }
          p[u]++;
        }
      }
      // share of cell o held by f beyond the line's pixel lines [lo..hi], not
      // counting lines of f crossing o the other way (a junction's own pair)
      function restOf(o, f, lo, hi) {
        var ox = (o % cols) * S, oy = ((o / cols) | 0) * S, u0 = o === a ? 0 : S, restPx = 0, vv, uu, k, kin, xx, yy;
        for (vv = 0; vv < S; vv++) {
          k = 0; kin = 0;
          for (uu = 0; uu < S; uu++) {
            xx = horiz ? ox + uu : ox + vv; yy = horiz ? oy + vv : oy + uu;
            if (famPix[yy * W + xx] !== f) continue;
            k++; if (u0 + uu >= lo && u0 + uu <= hi) kin++;
          }
          if (k >= FULL * S) continue;
          restPx += k - kin;
        }
        return restPx / (S * S);
      }
      // does the band [lo..hi] continue past the pair along the line?
      function continues(f, lo, hi) {
        var offsets = [-1, S], oi, off, k, uu, xx, yy;
        for (oi = 0; oi < 2; oi++) {
          off = offsets[oi]; k = 0;
          for (uu = lo; uu <= hi; uu++) {
            xx = horiz ? ax + uu : ax + off; yy = horiz ? ay + off : ay + uu;
            if (xx < 0 || yy < 0 || xx >= W || yy >= I.h) continue;
            if (famPix[yy * W + xx] === f) k++;
          }
          if (k >= FULL * (hi - lo + 1)) return true;
        }
        return false;
      }
      prof.forEach(function (p, f) {
        var lo = -1, hi = -1, L = 0, sum = 0, u2;
        for (u2 = 0; u2 < S2; u2++) if (p[u2] >= FULL * S) { if (lo < 0) lo = u2; hi = u2; L++; sum += u2; }
        if (L < RESCUE_LEN || L > RESCUE_MAXLEN) return;
        if (hi - lo + 1 !== L) return;                        // one band
        if (lo === 0 || hi === S2 - 1) return;                // runs on into the next cell
        if (lo >= S || hi < S) return;                        // inside one cell: no straddle
        var ca = cov[a * K + f], cb = cov[b * K + f];
        var mid = sum / L + 0.5, t;
        if (Math.abs(mid - S) > RESCUE_TIE * S) t = mid < S ? a : b;
        else {
          // a tie: the cell whose neighbours along the line show it, then the one holding more
          var ya = (a / cols) | 0, xa = a % cols, yb = (b / cols) | 0, xb = b % cols;
          var nb = function (x1, y1) { return (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) ? -1 : y1 * cols + x1; };
          var al = horiz ? [nb(xa, ya - 1), nb(xa, ya + 1), nb(xb, yb - 1), nb(xb, yb + 1)] : [nb(xa - 1, ya), nb(xa + 1, ya), nb(xb - 1, yb), nb(xb + 1, yb)];
          var ka = (isF(al[0], f) ? 1 : 0) + (isF(al[1], f) ? 1 : 0), kb = (isF(al[2], f) ? 1 : 0) + (isF(al[3], f) ? 1 : 0);
          t = ka !== kb ? (ka > kb ? a : b) : (ca >= cb ? a : b);
        }
        var o = t === a ? b : a, rest, prev;
        if (winF[t] !== f) {
          if ((t === a ? ca : cb) < RESCUE_MIN) return;
          if (winF[t] >= 0 && I.dE[fam[win[t]] * K + f] < LINE_CON_DE) return;
          // the label that draws THIS line: most common label of f on its own pixel lines
          var lc = new Map(), uu, vv, xx, yy, ii, lineLab = -1, lcn = -1;
          for (uu = lo; uu <= hi; uu++) for (vv = 0; vv < S; vv++) {
            xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * W + xx;
            if (famPix[ii] === f) lc.set(I.lab[ii], (lc.get(I.lab[ii]) || 0) + 1);
          }
          lc.forEach(function (k2, l2) { if (k2 > lcn || (k2 === lcn && l2 < lineLab)) { lcn = k2; lineLab = l2; } });
          prev = add.get(t); if (!prev || L > prev.L) add.set(t, { f: f, L: L, lab: lineLab });
          // move, not copy: the other cell gives the line up when it holds nothing else of it
          if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
            rest = restOf(o, f, lo, hi);
            if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz }); }
          }
        } else if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
          rest = restOf(o, f, lo, hi);
          if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz }); }
        }
      });
    }
    var x, y;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      c = y * cols + x;
      if (x + 1 < cols) pair(c, c + 1, true);
      if (y + 1 < rows) pair(c, c + cols, false);
    }

    // hanging guard: an added cell touching only one shown piece of its line, and no other added cell
    var resF = new Int32Array(n).fill(-1);
    add.forEach(function (v, k) { resF[k] = v.f; });
    function ringOf(k, f, withAdded, without) {
      var x0 = k % cols, y0 = (k / cols) | 0, ring = [], orig = 0, res = 0, r, xx, yy, kk, o2, r2;
      for (r = 0; r < 8; r++) {
        xx = x0 + RING[r][0]; yy = y0 + RING[r][1];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) { ring.push(0); continue; }
        kk = yy * cols + xx;
        o2 = winF[kk] === f && !(without && without.has(kk));
        r2 = withAdded && resF[kk] === f;
        if (o2) orig++; if (r2) res++;
        ring.push(o2 || r2 ? 1 : 0);
      }
      return { pieces: ringPieces(ring), orig: orig, res: res };
    }
    mapEntries(add).forEach(function (e) {
      var R = ringOf(e[0], e[1].f, true, null);
      if (R.res === 0 && R.orig > 0 && R.pieces <= 1) add.delete(e[0]);
    });
    add.forEach(function (v, k) {
      var bl = -1, bw = 0, big = -1, l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > 0 && (big < 0 || I.cnt[l] > I.cnt[big])) big = l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      if (v.lab >= 0) bl = v.lab; else if (big >= 0) bl = big;
      if (bl < 0) return;
      win[k] = bl; opaque[k] = 1;
    });

    // no notches: a cell gives a line up only when its neighbours along the line do too (or do not show it)
    function showsF(k, f) { return k >= 0 && opaque[k] && fam[win[k]] === f; }
    var changed = true;
    while (changed) {
      changed = false;
      mapEntries(drop).forEach(function (e) {
        var k = e[0], v = e[1];
        if (add.has(k)) return;
        var x1 = k % cols, y1 = (k / cols) | 0;
        var al = v.horiz ? [y1 > 0 ? k - cols : -1, y1 + 1 < rows ? k + cols : -1] : [x1 > 0 ? k - 1 : -1, x1 + 1 < cols ? k + 1 : -1];
        var bad = al.some(function (q) { return showsF(q, v.f) && !(drop.has(q) && drop.get(q).f === v.f && !add.has(q)); });
        if (bad) { drop.delete(k); changed = true; }
      });
    }
    // give the line up: best other label, or empty when more of the cell is empty
    // than any other colour family; never when that cuts the line's cells apart
    var gone = new Set();
    drop.forEach(function (v, k) {
      if (add.has(k)) return;
      var R = ringOf(k, v.f, true, gone);
      if (R.pieces > 1) return;
      var bl = -1, bw = 0, l, g, bestOther = 0;
      for (l = 0; l < K; l++) if (fam[l] !== v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      for (g = 0; g < K; g++) if (fam[g] === g && g !== v.f) bestOther = Math.max(bestOther, cov[k * K + g]);
      var empty = 1 - I.paintCnt[k];
      if (bl < 0 || empty >= bestOther) opaque[k] = 0; else win[k] = bl;
      gone.add(k);
    });
  }

  /* ---------------------------------------------------------- 2. CONNECT */
  function connect(win, opaque, I, cols, rows, K, ACC, bridges) {
    var w = I.w, h = I.h, paint = I.paint, cell = I.cell, N = w * h, n = cols * rows;
    // source pieces: 8-connected paint pixels
    var comp = new Int32Array(N).fill(-1), nc = 0, stack = new Int32Array(N), s, sp, i, x, y, dx, dy, xx, yy, j;
    for (s = 0; s < N; s++) {
      if (!paint[s] || comp[s] >= 0) continue;
      sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp) {
        i = stack[--sp]; x = i % w; y = (i / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; xx = x + dx; yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          j = yy * w + xx; if (paint[j] && comp[j] < 0) { comp[j] = nc; stack[sp++] = j; }
        }
      }
      nc++;
    }
    // per cell: pixels of each source piece
    var cellPieces = new Array(n), c, m;
    for (i = 0; i < N; i++) {
      if (comp[i] < 0) continue; c = cell[i];
      m = cellPieces[c]; if (!m) { m = new Map(); cellPieces[c] = m; }
      m.set(comp[i], (m.get(comp[i]) || 0) + 1);
    }
    var cellPx = I.cellN;
    // output pieces: 8-connected opaque cells
    var ocomp = new Int32Array(n).fill(-1);
    function labelOut() {
      ocomp.fill(-1);
      var k = 0, st2 = [], c0, e, x0, y0, ddx, ddy, x1, y1, f;
      for (c0 = 0; c0 < n; c0++) {
        if (!opaque[c0] || ocomp[c0] >= 0) continue;
        st2.push(c0); ocomp[c0] = k;
        while (st2.length) {
          e = st2.pop(); x0 = e % cols; y0 = (e / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            x1 = x0 + ddx; y1 = y0 + ddy; if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) continue;
            f = y1 * cols + x1; if (opaque[f] && ocomp[f] < 0) { ocomp[f] = k; st2.push(f); }
          }
        }
        k++;
      }
      return k;
    }
    labelOut();
    // source pieces split over two or more output pieces (each holding >= CONNECT_MINPX of it)
    var holders = new Map();
    for (c = 0; c < n; c++) {
      if (!opaque[c] || !cellPieces[c]) continue;
      cellPieces[c].forEach(function (px, pc) {
        var hm = holders.get(pc); if (!hm) { hm = new Map(); holders.set(pc, hm); }
        hm.set(ocomp[c], (hm.get(ocomp[c]) || 0) + px);
      });
    }
    var pieces = []; holders.forEach(function (v, k) { pieces.push(k); });
    pieces.sort(function (p1, p2) { return p1 - p2; });
    pieces.forEach(function (pc) {
      var sig = 0;
      holders.get(pc).forEach(function (px) { if (px >= CONNECT_MINPX) sig++; });
      if (sig < 2) return;
      var guard = 0;
      while (guard++ < 200) {
        labelOut();
        var hm = new Map(), c1, px1;
        for (c1 = 0; c1 < n; c1++) {
          if (!opaque[c1] || !cellPieces[c1]) continue; px1 = cellPieces[c1].get(pc); if (!px1) continue;
          hm.set(ocomp[c1], (hm.get(ocomp[c1]) || 0) + px1);
        }
        var sg = mapEntries(hm).filter(function (e) { return e[1] >= CONNECT_MINPX; }).sort(function (p1, p2) { return p2[1] - p1[1] || p1[0] - p2[0]; });
        if (sg.length < 2) break;
        var main = sg[0][0], targets = new Set(), ti;
        for (ti = 1; ti < sg.length; ti++) targets.add(sg[ti][0]);
        // cheapest path through empty cells holding the stroke (cost 1.05 - its share)
        var dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), steps = new Int32Array(n), heap = [];
        var push = function (cc, dv) {
          heap.push([dv, cc]); var k = heap.length - 1, pa, tmp;
          while (k > 0) { pa = (k - 1) >> 1; if (heap[pa][0] <= heap[k][0]) break; tmp = heap[pa]; heap[pa] = heap[k]; heap[k] = tmp; k = pa; }
        };
        var pop = function () {
          var top = heap[0], last = heap.pop(), k, l2, r2, m2, tmp;
          if (heap.length) {
            heap[0] = last; k = 0;
            for (;;) {
              l2 = 2 * k + 1; r2 = l2 + 1; m2 = k;
              if (l2 < heap.length && heap[l2][0] < heap[m2][0]) m2 = l2;
              if (r2 < heap.length && heap[r2][0] < heap[m2][0]) m2 = r2;
              if (m2 === k) break;
              tmp = heap[m2]; heap[m2] = heap[k]; heap[k] = tmp; k = m2;
            }
          }
          return top;
        };
        for (c1 = 0; c1 < n; c1++) if (opaque[c1] && ocomp[c1] === main) { dist[c1] = 0; push(c1, 0); }
        var hit = -1, top, dv, cc, x2, y2, ddx, ddy, xx2, yy2, f, nd, ns, pxf, cv;
        while (heap.length) {
          top = pop(); dv = top[0]; cc = top[1]; if (dv > dist[cc]) continue;
          if (opaque[cc] && targets.has(ocomp[cc])) { hit = cc; break; }
          x2 = cc % cols; y2 = (cc / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; xx2 = x2 + ddx; yy2 = y2 + ddy; if (xx2 < 0 || yy2 < 0 || xx2 >= cols || yy2 >= rows) continue;
            f = yy2 * cols + xx2;
            if (opaque[f]) { if (!targets.has(ocomp[f])) continue; nd = dv; ns = steps[cc]; }
            else {
              pxf = cellPieces[f] ? (cellPieces[f].get(pc) || 0) : 0;
              cv = pxf / (cellPx[f] || 1);
              if (cv < CONNECT_MINCOV) continue;
              ns = steps[cc] + 1; if (ns > CONNECT_MAXLEN) continue;
              nd = dv + 1.05 - cv;
            }
            if (nd < dist[f]) { dist[f] = nd; prev[f] = cc; steps[f] = ns; push(f, nd); }
          }
        }
        if (hit < 0) break;
        // the bridge cells become opaque with their best visible label (recoloured after stage 2)
        var cb = prev[hit], made = 0, bl, bw, l;
        while (cb >= 0 && !(opaque[cb] && ocomp[cb] === main)) {
          if (!opaque[cb]) {
            bl = -1; bw = -1; for (l = 0; l < K; l++) { if (ACC[cb * K + l] > bw) { bw = ACC[cb * K + l]; bl = l; } }
            win[cb] = bl; opaque[cb] = 1; made++; bridges.push(cb);
          }
          cb = prev[cb];
        }
        if (!made) break;
      }
    });
  }

  /* ---------------------------------------------------------- 3. SPECKS */
  function specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour) {
    var n = cols * rows, tone = I.tone;
    var reg = new Int32Array(n).fill(-1), nr = 0, labCache = new Map(), stack = [], regions = [];
    function winShare(c) {
      var k = 0, np = 0, p, q;
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; if (!I.paint[q]) continue; np++; if (lab[q] === win[c]) k++; }
      return np ? k / np : 1;
    }
    // region colour: the exact colour (>= FLAT_SHARE of the tone's pixels) nearest the region's mean
    function medoid(cellsR, t) {
      var tally = new Map(), tot = 0, mr = 0, mg = 0, mb = 0, ei, e, p, q, key, bestK = -1;
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        for (p = offs[e]; p < offs[e + 1]; p++) {
          q = order[p]; if (!I.paint[q] || tone[lab[q]] !== t) continue;
          key = (d[q * 4] << 16) | (d[q * 4 + 1] << 8) | d[q * 4 + 2];
          tally.set(key, (tally.get(key) || 0) + 1); tot++; mr += d[q * 4]; mg += d[q * 4 + 1]; mb += d[q * 4 + 2];
        }
      }
      if (tot) {
        var m = colour.labOf(mr / tot, mg / tot, mb / tot), be = Infinity;
        tally.forEach(function (v, k) {
          if (v < FLAT_SHARE * tot) return;
          var lb = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255);
          var e2 = colour.deltaE2000(m[0], m[1], m[2], lb[0], lb[1], lb[2]);
          if (e2 < be || (e2 === be && k < bestK)) { be = e2; bestK = k; }
        });
      }
      return bestK;
    }
    function labK(k) { var v = labCache.get(k); if (!v) { v = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255); labCache.set(k, v); } return v; }
    function dEk(p, q) { if (p === q) return 0; var a = labK(p), b = labK(q); return colour.deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]); }
    var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var c, t, cellsR, e, x, y, k4, xx, yy, f;
    for (c = 0; c < n; c++) {
      if (!opaque[c] || reg[c] >= 0 || I.toneSize[tone[win[c]]] < 2) continue;
      t = tone[win[c]]; cellsR = [];
      stack.push(c); reg[c] = nr;
      while (stack.length) {
        e = stack.pop(); cellsR.push(e); x = e % cols; y = (e / cols) | 0;
        for (k4 = 0; k4 < 4; k4++) {
          xx = x + N4[k4][0]; yy = y + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          f = yy * cols + xx; if (opaque[f] && reg[f] < 0 && tone[win[f]] === t) { reg[f] = nr; stack.push(f); }
        }
      }
      var bestK = medoid(cellsR, t);
      if (bestK < 0) { nr++; continue; }
      regions.push({ t: t, cells: cellsR, R: bestK });
      // patches of one shade; only a speck changes, to the colour its neighbours already have
      var orig = new Map(), seen = new Set(), ei;
      for (ei = 0; ei < cellsR.length; ei++) orig.set(cellsR[ei], modeKey[cellsR[ei]]);
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        if (seen.has(e)) continue;
        var k0 = orig.get(e), patch = [e], jj, g, gx, gy, to = -1;
        seen.add(e);
        for (jj = 0; jj < patch.length; jj++) {
          g = patch[jj]; gx = g % cols; gy = (g / cols) | 0;
          for (k4 = 0; k4 < 4; k4++) {
            xx = gx + N4[k4][0]; yy = gy + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            f = yy * cols + xx; if (reg[f] === nr && !seen.has(f) && dEk(orig.get(f), k0) < PATCH_DE) { seen.add(f); patch.push(f); }
          }
        }
        var dk = dEk(k0, bestK);
        if (dk < PATCH_DE) continue;                 // the region's own shade keeps its exact colour
        var noise = patch.every(function (q) { return winShare(q) < SPECK_COVER; });
        if (noise && patch.length <= SPECK_MAX && dk <= SPECK_DE) {
          var inP = new Set(patch), ok = true, nIn = 0, ntal = new Map(), pi, ddy, ddx, dn;
          for (pi = 0; pi < patch.length && ok; pi++) {
            g = patch[pi]; gx = g % cols; gy = (g / cols) | 0;
            for (ddy = -1; ddy <= 1 && ok; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
              if (!ddx && !ddy) continue; xx = gx + ddx; yy = gy + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              f = yy * cols + xx; if (inP.has(f) || reg[f] !== nr) continue;
              nIn++; dn = dEk(orig.get(f), bestK);
              if (dn > NEIGH_DE) { ok = false; break; }
              ntal.set(orig.get(f), (ntal.get(orig.get(f)) || 0) + 1);
            }
          }
          if (ok && nIn > 0) {
            var bk = -1, bn = -1;
            ntal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
            to = bk;
          }
        }
        if (to < 0) continue;
        for (pi = 0; pi < patch.length; pi++) modeKey[patch[pi]] = to;
      }
      nr++;
    }
    // walled-in pieces of a tone take the tone's colour from elsewhere in the picture
    var byTone = new Map();
    regions.forEach(function (r) { var a = byTone.get(r.t); if (!a) { a = []; byTone.set(r.t, a); } a.push(r); });
    byTone.forEach(function (rs, t2) {
      if (rs.length < 2) return;
      var all = [];
      rs.forEach(function (r) { for (var i2 = 0; i2 < r.cells.length; i2++) all.push(r.cells[i2]); });
      var G = medoid(all, t2); if (G < 0) return;
      rs.forEach(function (r) {
        if (r.cells.length > SMALLREG_MAX) return;
        if (!r.cells.every(function (q) { return winShare(q) < SPECK_COVER; })) return;
        var k0 = modeKey[r.cells[0]];
        if (!r.cells.every(function (q) { return dEk(modeKey[q], k0) < PATCH_DE; })) return;
        var dg = dEk(k0, G);
        if (dg < PATCH_DE || dg > SPECK_DE) return;
        var tal = new Map(), tk = G, tn = -1;
        rs.forEach(function (r2) { if (r2 === r) return; for (var i3 = 0; i3 < r2.cells.length; i3++) { var kk = modeKey[r2.cells[i3]]; if (dEk(kk, G) < PATCH_DE) tal.set(kk, (tal.get(kk) || 0) + 1); } });
        tal.forEach(function (v, k) { if (v > tn || (v === tn && k < tk)) { tn = v; tk = k; } });
        for (var i4 = 0; i4 < r.cells.length; i4++) modeKey[r.cells[i4]] = tk;
      });
    });
  }

  /* ---------------------------------------------------------- the pack */
  PF.repair8_pack = function (rgba, cols, rows, colour) {
    need('adaptive_k', 'pf-40-reconstruct.js'); need('kmeans_quantize', 'pf-11-quantize.js');
    ['clipScalar', 'argmax', 'npMaximum', 'rint'].forEach(function (nm) { need(nm, 'pf-00-base.js'); });
    if (!colour || typeof colour.labOf !== 'function') throw new Error('pf-42-repair8.js: colour.labOf is missing -- pass the page\'s labOf');
    if (typeof colour.deltaE2000 !== 'function') throw new Error('pf-42-repair8.js: colour.deltaE2000 is missing -- pass the page\'s deltaE2000');
    if (!rgba || typeof rgba !== 'object') throw new Error('PF.repair8_pack: expected a {d, w, h, cn} image');
    var d = rgba.d, w = rgba.w | 0, h = rgba.h | 0, cn = (rgba.cn === undefined || rgba.cn === null) ? 4 : (rgba.cn | 0);
    if (!(d instanceof Uint8Array || d instanceof Uint8ClampedArray)) throw new Error('PF.repair8_pack: d must be a Uint8Array or Uint8ClampedArray');
    if (w <= 0 || h <= 0) throw new Error('PF.repair8_pack: empty image (' + w + 'x' + h + ')');
    if (cn !== 4) throw new Error('PF.repair8_pack: RGBA only (cn 4), got cn ' + cn);
    if (d.length !== w * h * 4) throw new Error('PF.repair8_pack: d.length ' + d.length + ' != w*h*4 ' + (w * h * 4));
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.repair8_pack: cols and rows must be >= 1');
    var N = w * h, n = cols * rows, i, c, ch, x, y, b, p, q;

    // stage 1, two_stage_pack's: k-means labels, centre-weighted vote; alpha-0 pixels do not vote
    var K = PF.adaptive_k(rgba);
    var lab = PF.kmeans_quantize(rgba, K).labels.d;
    var maxLab = 0;
    for (i = 0; i < N; i++) if (lab[i] > maxLab) maxLab = lab[i];
    K = maxLab + 1;
    var rgb = new Float64Array(3 * N);
    for (i = 0, b = 0; i < N; i++, b += 4) { rgb[3 * i] = d[b] / 255.0; rgb[3 * i + 1] = d[b + 1] / 255.0; rgb[3 * i + 2] = d[b + 2] / 255.0; }
    var ix = new Int32Array(w), iy = new Int32Array(h);
    for (x = 0; x < w; x++) ix[x] = PF.clipScalar(Math.floor((x * cols) / w), 0, cols - 1);
    for (y = 0; y < h; y++) iy[y] = PF.clipScalar(Math.floor((y * rows) / h), 0, rows - 1);
    var wc = w / cols, hr = h / rows, wx = new Float64Array(w), wy = new Float64Array(h), fx, fy;
    for (x = 0; x < w; x++) { fx = ((x + 0.5) - ix[x] * wc) / wc; wx[x] = 1.0 - 2.0 * Math.abs(fx - 0.5); }
    for (y = 0; y < h; y++) { fy = ((y + 0.5) - iy[y] * hr) / hr; wy[y] = 1.0 - 2.0 * Math.abs(fy - 0.5); }
    var cell = new Int32Array(N), wgt = new Float64Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; cell[i] = iy[y] * cols + ix[x];
      wgt[i] = !d[i * 4 + 3] ? 0 : (wy[y] * wx[x] + 1e-4);
    }
    var csr = csrByCell(cell, N, n), offs = csr.offs, order = csr.order;
    var acc = new Float64Array(K), win = new Int32Array(n), ACC = new Float64Array(n * K);
    for (c = 0; c < n; c++) {
      acc.fill(0);
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; acc[lab[q]] += wgt[q]; }
      win[c] = PF.argmax(acc);
      ACC.set(acc, c * K);
    }
    var cntf = new Float64Array(n);
    for (c = 0; c < n; c++) cntf[c] = Math.max(offs[c + 1] - offs[c], 1);
    // opaque when more than half the cell's pixels have alpha > 127 (two_stage_pack's rule)
    var opaque = new Uint8Array(n), asum = new Float64Array(n);
    for (i = 0; i < N; i++) asum[cell[i]] += (d[i * 4 + 3] > 127) ? 1.0 : 0.0;
    for (c = 0; c < n; c++) opaque[c] = (asum[c] / cntf[c] > 0.5) ? 1 : 0;

    // repairs 1 and 2 decide which label wins and which cells are opaque
    var I = facts(d, w, h, N, lab, K, cell, n, cols, rows, colour);
    rescue(win, opaque, I, cols, rows, K, ACC);
    var bridges = [];
    connect(win, opaque, I, cols, rows, K, ACC, bridges);

    // stage 2, two_stage_pack's: the weighted MODE of the exact colours carrying the
    // winning label (invents nothing); the weighted mean only for a cell with none
    var denom = new Float64Array(n), sums = new Float64Array(3 * n), selcnt = new Float64Array(n), sel, ws;
    for (i = 0; i < N; i++) {
      c = cell[i]; sel = lab[i] === win[c]; ws = sel ? wgt[i] : 0.0;
      denom[c] += ws; sums[3 * c] += rgb[3 * i] * ws; sums[3 * c + 1] += rgb[3 * i + 1] * ws; sums[3 * c + 2] += rgb[3 * i + 2] * ws;
      selcnt[c] += sel ? 1.0 : 0.0;
    }
    var out = new Float64Array(3 * n), dn, anyBad = false;
    for (c = 0; c < n; c++) {
      dn = PF.npMaximum(denom[c], 1e-9);
      out[3 * c] = sums[3 * c] / dn; out[3 * c + 1] = sums[3 * c + 1] / dn; out[3 * c + 2] = sums[3 * c + 2] / dn;
      if (selcnt[c] < 0.5) anyBad = true;
    }
    if (anyBad) {
      var msum = new Float64Array(3 * n);
      for (i = 0; i < N; i++) { c = cell[i]; msum[3 * c] += rgb[3 * i]; msum[3 * c + 1] += rgb[3 * i + 1]; msum[3 * c + 2] += rgb[3 * i + 2]; }
      for (c = 0; c < n; c++) if (selcnt[c] < 0.5) for (ch = 0; ch < 3; ch++) out[3 * c + ch] = msum[3 * c + ch] / cntf[c];
    }
    var modeKey = new Int32Array(n).fill(-1), tally = new Map(), bestW, bestKey, key, cw;
    for (c = 0; c < n; c++) {
      tally.clear(); bestW = -1; bestKey = -1;
      for (p = offs[c]; p < offs[c + 1]; p++) {
        q = order[p];
        if (lab[q] !== win[c] || !(wgt[q] > 0)) continue;
        b = q * 4; key = (d[b] << 16) | (d[b + 1] << 8) | d[b + 2];
        cw = (tally.get(key) || 0) + wgt[q]; tally.set(key, cw);
        if (cw > bestW) { bestW = cw; bestKey = key; }
      }
      modeKey[c] = bestKey;
    }

    // repair 3 recolours specks; then each bridge cell takes its stroke's colour around it
    specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour);
    if (bridges.length) {
      var isB = new Set(bridges);
      bridges.forEach(function (bc) {
        var bx = bc % cols, by = (bc / cols) | 0, tal = new Map(), ddx, ddy, xx, yy, f, bk = -1, bn = -1;
        for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
          if (!ddx && !ddy) continue; xx = bx + ddx; yy = by + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          f = yy * cols + xx; if (!opaque[f] || isB.has(f) || modeKey[f] < 0) continue;
          tal.set(modeKey[f], (tal.get(modeKey[f]) || 0) + 1);
        }
        tal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
        if (bk >= 0) modeKey[bc] = bk;
      });
    }

    var low = new d.constructor(n * 4), v;
    for (c = 0; c < n; c++) {
      if (modeKey[c] >= 0) {
        low[c * 4] = (modeKey[c] >> 16) & 255; low[c * 4 + 1] = (modeKey[c] >> 8) & 255; low[c * 4 + 2] = modeKey[c] & 255;
      } else {
        for (ch = 0; ch < 3; ch++) { v = PF.rint(out[3 * c + ch] * 255); low[c * 4 + ch] = PF.clipScalar(v, 0, 255); }
      }
      low[c * 4 + 3] = opaque[c] ? 255 : 0;
    }
    return { d: low, w: cols, h: rows, cn: 4 };
  };

  PF.versionRepair8 = 'pf-42-repair8/1';
})();
