/* pf-21-runlengths.js -- port of pixelfixer/runlengths.py (276 lines).
 *
 * Grid detection from boundary-run statistics + robust soft-GCD lattice fit.
 *
 * Idea: pixel art (even mushy/warped) is made of RUNS. Along each scanline
 * the distances between consecutive color-change boundaries are
 * (approximately) integer multiples of the cell size s. Collect multi-lag
 * boundary distances across all scanlines into a sub-pixel histogram and
 * score candidate steps s by a comb function  S(s) = mean_r cos(2*pi*r/s):
 * every distance that is a multiple of s contributes +1, off-lattice
 * distances cancel out. Completely phase-free, so per-region phase shifts
 * (sprite sheets) and jitter/warp are tolerated.
 *
 * Pipeline:
 *   1. median-filter, gradient along the scan axis, box-smooth PERPENDICULAR
 *      to it (real cell boundaries persist across >= a cell of scanlines;
 *      noise edges don't), non-max suppression, parabolic sub-pixel peaks.
 *   2. multi-lag distance pooling (lag 1..4): a spurious boundary splits a
 *      run into off-lattice halves at lag 1, but lag 2 jumps across it and
 *      lands back on the lattice -- robust to over-segmentation; missing
 *      boundaries just produce higher multiples of s, which the comb also
 *      rewards.
 *   3. comb scoring over s in [2.05, 26); divisor aliases (s/2, s/3 divide
 *      every multiple of s too) resolved by noise asymmetry (residual eps
 *      costs phase 2*pi*eps/s -- smaller s punished harder) plus an explicit
 *      "largest near-tied peak with fundamental support" rule.
 *   4. sub-pixel refinement: fine comb search + k-weighted least squares
 *      (the k=1 run mode is the most bias-prone under mush; long baselines
 *      average boundary noise out).
 *   5. LOCAL-STEP INTEGRATION: AI-generated grids drift in scale, so the
 *      dominant local pitch != W/cols. Re-estimate the step in overlapping
 *      2D tiles (fine comb near the global step) and integrate
 *      cols = W * mean(1/s_tile).  This is what rescues drifting "AI soup".
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES (every one of these was MEASURED with tools/probe-rl-dtypes.py
 * and tools/probe-rl-semantics.py against numpy 2.5.3 / cv2 5.0.0 -- the
 * reference venv -- not inferred):
 *
 *  dtype trail.  _prep gives float32 (H,W,4). The gradient d is float32 and
 *  integer-valued (|diff| of uint8-derived values, summed over 4 channels:
 *  <= 1020, exact). cv2.boxFilter keeps float32 (PF.boxFilter models its
 *  FilterEngine path bit-exact for (1,7)). p95 is a float32 scalar
 *  (PF.percentile dtype 'f4'). ys is int64, pos is FLOAT64: int64 xs plus a
 *  float32 offset promotes to float64. runs are float64 differences cast to
 *  float32 AFTER the [RUN_MIN, RUN_MAX] filter (so the filter compares in
 *  float64).
 *
 *  NEP 50 (numpy >= 2): a Python float next to a float32 array is cast to
 *  float32 FIRST and the op runs in float32. That makes all of these
 *  float32, and the port rounds them with Math.fround at every step:
 *      2*np.pi*centers        THR_FRAC*p95        centers/s
 *      runs - s   runs/s   np.round(runs/s)   k*s   res/(0.30*s)
 *      1.0 - res/(0.30*s)   np.clip(.., 0, 1) * ok * k   w*k*k   w*k*runs
 *      dl - 2*dc + dr   0.5*(dl-dr)/safe   np.abs(denom) > 1e-6 (float32
 *      compare)   np.abs(runs - s) < thr (float32 compare)
 *  Only a float32 array next to a float64 ARRAY (or a numpy float64 scalar)
 *  promotes to float64: (2*pi*centers)/s_grid, hist*wk, and the histogram's
 *  (a / np.float64(64.0)) * nb index computation.
 *
 *  Math.fround(x op y) for float32 x, y IS float32 arithmetic for + - * /
 *  (float64 has >= 2p+2 bits, so the double rounding is innocuous).
 *
 *  np.histogram(runs, bins=nb, range=(0, 64)) with nb = int(64/bin)+1:
 *  NOTE nb is 257 for BIN=0.25 and 1281 for 0.05 -- ONE MORE than 64/bin,
 *  so the bin width is 64/257, not 0.25; that is the reference's behaviour
 *  and it is kept. bin_type = result_type(0.0, 64.0, float32 runs) is
 *  float32, so the edges are linspace(0,64,nb+1) cast to float32 and the
 *  centers are float32. Indices come from the fast equal-bins path with its
 *  two edge fix-ups (numpy/lib/_histograms_impl.py, read in the venv).
 *
 *  Reductions.  ndarray.sum() on a 1-D float array is numpy's pairwise sum
 *  in the array's dtype (PF.sum, measured); an axis-0 sum of a 2-D product
 *  (the comb scores) is a SEQUENTIAL row accumulation in float64
 *  (measured bit-exact against a per-column pairwise alternative, which is
 *  NOT exact). hist.sum() / total are integer counts: exact in any order.
 *
 *  argsort.  runlengths.py:134 uses numpy's default (non-stable) argsort
 *  and reverses it. PF.argsort is stable (see pf-00-base.js for why the
 *  default kind is not reproducible); the permutation is identical
 *  whenever the local-maximum scores are distinct, which
 *  tools/parity-runlengths.py checks and records per fixture.
 *
 *  np.cos.  numpy's float64 cos equals the C runtime's cos on the reference
 *  machine (0 differences in 201,280 arguments); whether Math.cos agrees
 *  is measured by tools/test-runlengths.js from a dumped table.
 *
 *  Python round() and np.round are round-half-to-EVEN: PF.rint.
 * ---------------------------------------------------------------------------
 * API: PF.runlengths.{_prep, _boundaries, _lag_diffs, _hist, _comb_score,
 * _pick_step, _refine, _tile_peak, _integrate_step, detect}, the reference's
 * names, namespaced so the call graph reads the same and other modules'
 * detect() cannot collide. None becomes null.
 *
 * Images are {d, w, h, cn}: a flat typed array plus explicit width/height,
 * pixels interleaved (RGBA). No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  var S_MIN = 2.05, S_MAX = 26.0;
  var RUN_MIN = 2.0, RUN_MAX = 64.0;
  var BIN = 0.25;       // run-length histogram bin width (px), selection stage
  var COHERENCE = 7;    // perpendicular box-smooth of the gradient before NMS
  var THR_FRAC = 0.10;  // edge threshold as a fraction of the p95 gradient
  var MAX_LAG = 4;      // boundary-distance pooling depth
  var TILINGS = [[3, 3], [5, 5], [1, 8]];  // (perp, scan) tile grids to pool

  var TWO_PI_F32 = fr(2 * Math.PI);   // 2*np.pi is cast to float32 before it meets the float32 centers (NEP 50)

  // Negative-control switches for tools/test-runlengths.js. Each one flips a
  // measured numpy semantic to its "obvious" reading so the test can prove
  // it is capable of failing; production leaves them all true.
  var SEM = {
    twoPiFloat32: true,   // 2*np.pi*centers is a float32 product
    sumFloat32: true,     // (w*k*k).sum() is a float32 pairwise sum
    histNbPlusOne: true   // np.histogram gets int(64/bin)+1 bins, not 64/bin
  };

  function check(cond, msg) { if (!cond) throw new Error('PF.runlengths: ' + msg); }

  // ---------------------------------------------------------------- boundaries

  /** Median-filtered float image, alpha folded in as an extra channel.
   *  @param {{d:Uint8Array|Uint8ClampedArray, w, h, cn:4}} rgba
   *  @returns {{d:Float32Array, w, h, cn:4}} */
  function _prep(rgba) {
    check(rgba && rgba.cn === 4 && rgba.d.length === rgba.w * rgba.h * 4, '_prep expects an interleaved RGBA image');
    var w = rgba.w, h = rgba.h, n = w * h, src = rgba.d, i;
    // cv2.medianBlur(rgba[:, :, :3], 3) and cv2.medianBlur(rgba[:, :, 3], 3):
    // two calls in the reference (the RGB slice is copied contiguous by the
    // bindings); medianBlur is per-channel, so the split only mirrors it.
    var rgb = new src.constructor(n * 3), a = new src.constructor(n);
    for (i = 0; i < n; i++) {
      rgb[i * 3] = src[i * 4];
      rgb[i * 3 + 1] = src[i * 4 + 1];
      rgb[i * 3 + 2] = src[i * 4 + 2];
      a[i] = src[i * 4 + 3];
    }
    var mrgb = PF.medianBlur({ d: rgb, w: w, h: h, cn: 3 }, 3).d;
    var ma = PF.medianBlur({ d: a, w: w, h: h, cn: 1 }, 3).d;
    var out = new Float32Array(n * 4);           // .astype(np.float32) + np.dstack
    for (i = 0; i < n; i++) {
      out[i * 4] = mrgb[i * 3];
      out[i * 4 + 1] = mrgb[i * 3 + 1];
      out[i * 4 + 2] = mrgb[i * 3 + 2];
      out[i * 4 + 3] = ma[i];
    }
    return { d: out, w: w, h: h, cn: 4 };
  }

  /** Sub-pixel color-boundary positions along `axis`.
   *
   *  axis=1 -> boundaries along x within each row (for step_x).
   *  axis=0 -> boundaries along y within each column (for step_y).
   *  Returns {ys, pos}: scanline index (Int32Array) and position
   *  (Float64Array), scanline-major order.
   */
  function _boundaries(img4, axis) {
    check(axis === 0 || axis === 1, '_boundaries: axis must be 0 or 1');
    var W = img4.w, H = img4.h, src = img4.d;
    // np.transpose(img4, (1, 0, 2)) for axis 0 is expressed as strides: a
    // scanline is a row (axis 1) or a column (axis 0).
    var nScan = axis === 1 ? H : W;      // number of scanlines
    var L = axis === 1 ? W : H;          // scanline length
    var sStride = axis === 1 ? W * 4 : 4;    // between scanlines
    var pStride = axis === 1 ? 4 : W * 4;    // along a scanline
    var Wd = L - 1;                      // d is (nScan, L-1)
    var empty = { ys: new Int32Array(0), pos: new Float64Array(0) };
    if (Wd <= 0 || nScan <= 0) return empty;   // d.size == 0
    // L1 color+alpha difference between neighbors along the scan axis.
    // Integer-valued (<= 4*255), so the float32 channel sum is exact in any
    // order; accumulated in float64 and stored as float32.
    var d = new Float32Array(nScan * Wd);
    var y, x, base, o, s;
    for (y = 0; y < nScan; y++) {
      base = y * sStride;
      for (x = 0; x < Wd; x++) {
        o = base + x * pStride;
        s = Math.abs(src[o + pStride] - src[o]) +
            Math.abs(src[o + pStride + 1] - src[o + 1]) +
            Math.abs(src[o + pStride + 2] - src[o + 2]) +
            Math.abs(src[o + pStride + 3] - src[o + 3]);
        d[y * Wd + x] = s;
      }
    }
    // coherence: true cell boundaries persist across the perpendicular axis
    // for at least a cell of scanlines; incoherent noise edges do not.
    d = PF.boxFilter({ d: d, w: Wd, h: nScan }, [1, COHERENCE], { borderType: 'replicate' }).d;
    // p95 of the positive gradients -- a float32 percentile of float32 data
    var npos = 0, i;
    for (i = 0; i < d.length; i++) if (d[i] > 0) npos++;
    var p95 = 0.0;
    if (npos > 0) {
      var posv = new Float32Array(npos), k = 0;
      for (i = 0; i < d.length; i++) if (d[i] > 0) posv[k++] = d[i];
      p95 = PF.percentile(posv, 95, 'f4');
    }
    // THR_FRAC * p95 is float32 (Python float x np.float32 scalar); the
    // comparison d > thr then runs in float32 either way.
    var thr = Math.max(20.0, fr(fr(THR_FRAC) * p95));
    // non-max suppression along the scan axis: strict on the left, >= on
    // the right; left/right are zero-padded (left[:,0]=0, right[:,-1]=0)
    var ysA = [], xsA = [], left, right, v;
    for (y = 0; y < nScan; y++) {
      base = y * Wd;
      for (x = 0; x < Wd; x++) {
        v = d[base + x];
        left = x > 0 ? d[base + x - 1] : 0;
        right = x < Wd - 1 ? d[base + x + 1] : 0;
        if (v > thr && v > left && v >= right) { ysA.push(y); xsA.push(x); }
      }
    }
    var n = xsA.length;
    if (n < 4) return empty;
    // parabolic sub-pixel refinement of the gradient peak, float32 throughout
    var ys = new Int32Array(n), pos = new Float64Array(n);
    var eps32 = fr(1e-6);                 // np.abs(denom) > 1e-6 compares in float32
    var dl, dr, dc, denom, safe, off, xi;
    for (i = 0; i < n; i++) {
      y = ysA[i]; xi = xsA[i]; base = y * Wd;
      dl = d[base + (xi - 1 > 0 ? xi - 1 : 0)];            // np.maximum(xs - 1, 0)
      dr = d[base + (xi + 1 < Wd - 1 ? xi + 1 : Wd - 1)];  // np.minimum(xs + 1, W-1)
      dc = d[base + xi];
      denom = fr(fr(dl - fr(2 * dc)) + dr);                // dl - 2*dc + dr, left to right
      if (Math.abs(denom) > eps32) {
        safe = denom;
        off = fr(fr(0.5 * fr(dl - dr)) / safe);            // 0.5 * (dl - dr) / safe
      } else {
        off = 0.0;
      }
      // np.clip(off, -0.5, 0.5) in float32, then int64 + float32 -> float64
      off = PF.clipScalar(off, -0.5, 0.5);
      ys[i] = y;
      pos[i] = xi + off;
    }
    return { ys: ys, pos: pos };
  }

  /** Pooled pos[i+lag]-pos[i], lag=1..max_lag, within each scanline.
   *  The [RUN_MIN, RUN_MAX] filter runs on the float64 differences; the
   *  survivors are cast to float32 (np.concatenate(out).astype(np.float32)).
   *  @returns {Float32Array} */
  function _lag_diffs(ys, pos, maxLag) {
    if (maxLag === undefined || maxLag === null) maxLag = MAX_LAG;
    var n = pos.length, lag, i, dd, out = [];
    for (lag = 1; lag <= maxLag; lag++) {
      if (n <= lag) break;
      for (i = 0; i + lag < n; i++) {
        if (ys[i + lag] !== ys[i]) continue;
        dd = pos[i + lag] - pos[i];
        if (dd >= RUN_MIN && dd <= RUN_MAX) out.push(dd);
      }
    }
    var res = new Float32Array(out.length);
    for (i = 0; i < out.length; i++) res[i] = out[i];    // the store is the float32 cast
    return res;
  }

  // ---------------------------------------------------------------- soft GCD

  /** np.histogram(runs, bins=int(RUN_MAX/bin_w)+1, range=(0, RUN_MAX)),
   *  reduced to the non-empty bins.
   *  @param {Float32Array} runs
   *  @returns {{hist:Float64Array, centers:Float32Array, nb:number}} */
  function _hist(runs, binW) {
    check(runs instanceof Float32Array, '_hist expects float32 runs (the reference casts them)');
    var nb = Math.trunc(RUN_MAX / binW) + (SEM.histNbPlusOne ? 1 : 0);   // 257 for 0.25, 1281 for 0.05 (64/0.05 == 1280.0 in float64, measured)
    // bin_type = result_type(0.0, 64.0, float32) = float32 (NEP 50): edges
    // are linspace(0, 64, nb+1) computed in float64 and cast to float32.
    var e64 = PF.linspace(0, RUN_MAX, nb + 1);
    var edges = new Float32Array(nb + 1), i;
    for (i = 0; i <= nb; i++) edges[i] = e64[i];
    var counts = new Float64Array(nb);
    var r, a, idx;
    for (i = 0; i < runs.length; i++) {
      r = runs[i];
      if (!(r >= 0 && r <= RUN_MAX)) continue;          // keep = (a >= first) & (a <= last); NaN drops out too
      a = fr(r - 0);                                    // _unsigned_subtract(tmp_a, first_edge) in float32
      // f32 array / np.float64(64.0) -> float64 (a numpy scalar is not weak), * nb in float64
      idx = Math.trunc((a / RUN_MAX) * nb);             // .astype(np.intp)
      if (idx === nb) idx -= 1;                         // values exactly on last_edge
      if (a < edges[idx]) idx -= 1;                     // ~1 ULP inconsistencies of the index formula
      if (a >= edges[idx + 1] && idx !== nb - 1) idx += 1;   // last bin includes its right edge
      counts[idx] += 1;
    }
    var keep = 0;
    for (i = 0; i < nb; i++) if (counts[i] > 0) keep++;
    var hist = new Float64Array(keep), centers = new Float32Array(keep), k = 0;
    for (i = 0; i < nb; i++) {
      if (counts[i] > 0) {
        hist[k] = counts[i];
        centers[k] = fr(0.5 * fr(edges[i] + edges[i + 1]));   // 0.5 * (edges[:-1] + edges[1:]) in float32
        k++;
      }
    }
    return { hist: hist, centers: centers, nb: nb };
  }

  // 2*np.pi*centers as numpy evaluates it: float32 product per center.
  function twoPiCenters(centers) {
    var out = new Float64Array(centers.length), i;
    if (SEM.twoPiFloat32) {
      for (i = 0; i < centers.length; i++) out[i] = fr(TWO_PI_F32 * centers[i]);
    } else {
      for (i = 0; i < centers.length; i++) out[i] = 2 * Math.PI * centers[i];   // control: float64 product
    }
    return out;
  }

  // (w[:, None] * cos(c2[:, None] / grid[None, :])).sum(0): numpy reduces
  // axis 0 of a C-contiguous product by adding the rows in order (measured
  // bit-exact; a per-column pairwise sum is NOT).
  function combRows(w, c2, grid) {
    var m = grid.length, n = w.length, S = new Float64Array(m), i, j, wi, ci;
    for (i = 0; i < n; i++) {
      wi = w[i]; ci = c2[i];
      for (j = 0; j < m; j++) S[j] += wi * Math.cos(ci / grid[j]);
    }
    return S;
  }

  /** S(s) = weighted mean over distances of cos(2*pi*r/s).
   *  @param {Float32Array} runs
   *  @param {Float64Array} sGrid
   *  @param {number} [binW=BIN]
   *  @param {function(Float32Array):Float64Array} [weights]  optional per-center weight (unused by the reference)
   *  @returns {{S:Float64Array, total:number}} */
  function _comb_score(runs, sGrid, binW, weights) {
    if (binW === undefined || binW === null) binW = BIN;
    if (runs.length === 0) return { S: new Float64Array(sGrid.length), total: 0.0 };
    var h = _hist(runs, binW);
    var total = PF.sum(h.hist);
    var w = h.hist, i;
    if (weights) {
      var wt = weights(h.centers);
      w = new Float64Array(h.hist.length);
      for (i = 0; i < w.length; i++) w[i] = h.hist[i] * wt[i];
    }
    var S = combRows(w, twoPiCenters(h.centers), sGrid);
    var wsum = PF.sum(w);
    for (i = 0; i < S.length; i++) S[i] = S[i] / wsum;
    return { S: S, total: total };
  }

  /** Best step from the comb score, with largest-near-tie divisor logic.
   *  @returns {{s:number|null, v:number, cands:Array<[number,number]>}} */
  function _pick_step(runs, sGrid) {
    var cs = _comb_score(runs, sGrid), S = cs.S, total = cs.total;
    var none = { s: null, v: 0.0, cands: [] };
    if (total < 50) return none;
    var n = S.length, idxA = [], i;
    for (i = 1; i < n - 1; i++) {
      if (S[i] > S[i - 1] && S[i] >= S[i + 1]) idxA.push(i);   // loc[1:-1]
    }
    if (idxA.length === 0) return none;
    var idx = new Int32Array(idxA);
    // idx[np.argsort(S[idx])[::-1]] -- stable sort reversed; identical to
    // numpy's default whenever the scores are distinct (see header)
    var perm = PF.reversed(PF.argsort(PF.take(S, idx)));
    var order = new Int32Array(perm.length);
    for (i = 0; i < perm.length; i++) order[i] = idx[perm[i]];
    var smax = S[order[0]];
    if (smax <= 0) return none;
    var cands = [];
    for (i = 0; i < order.length && i < 12; i++) cands.push([sGrid[order[i]], S[order[i]]]);

    function fund(s) {  // mass of distances near 1*s (fundamental support)
      // np.abs(runs - s) < max(0.6, 0.18*s): runs is float32, so s and the
      // threshold are cast to float32 and the subtraction is float32
      var sf = fr(s), thr = fr(Math.max(0.6, 0.18 * s)), m = 0, j;
      for (j = 0; j < runs.length; j++) if (Math.abs(fr(runs[j] - sf)) < thr) m++;
      return m / total;
    }

    // among near-tied peaks prefer the LARGEST s with fundamental support --
    // kills the s/2, s/3 divisor aliases on clean lattices. The ratio can be
    // generous because larger FALSE steps are anti-phase for odd multiples
    // of the true step (cos(pi*odd) = -1) and score far below the true peak.
    var tied = [];
    for (i = 0; i < order.length; i++) {
      if (S[order[i]] >= 0.70 * smax) tied.push([sGrid[order[i]], S[order[i]], i]);
    }
    tied.sort(function (p, q) {            // key=lambda t: -t[0], stable
      if (p[0] > q[0]) return -1;
      if (p[0] < q[0]) return 1;
      return p[2] - q[2];
    });
    var bestS = sGrid[order[0]], bestV = smax;
    for (i = 0; i < tied.length; i++) {
      if (fund(tied[i][0]) >= 0.04) { bestS = tied[i][0]; bestV = tied[i][1]; break; }
    }
    return { s: bestS, v: bestV, cands: cands };
  }

  /** Sub-pixel refinement: fine comb (k-weighted) + k-weighted LS polish.
   *  @param {Float32Array} runs
   *  @param {number} s
   *  @returns {number} */
  function _refine(runs, s) {
    if (runs.length === 0) return s;
    var h = _hist(runs, 0.05);
    var fine = PF.arange(0.94 * s, 1.06 * s, 0.002);
    // wk = centers / s  -- float32 / Python float -> float32 (NEP 50);
    // hist * wk         -- float64 * float32 -> float64
    var sf = fr(s), n = h.hist.length, i;
    var hw = new Float64Array(n);
    for (i = 0; i < n; i++) hw[i] = h.hist[i] * fr(h.centers[i] / sf);   // weight by multiple k: favors long baselines
    var Sf = combRows(hw, twoPiCenters(h.centers), fine);
    s = fine[PF.argmax(Sf)];
    var N = runs.length, it, j, k, res, w, den, num;
    var wkk = new Float32Array(N), wkr = new Float32Array(N);
    for (it = 0; it < 2; it++) {
      sf = fr(s);
      var s03 = fr(0.30 * s);                          // (0.30 * s) is a Python float; cast once, as numpy does
      for (j = 0; j < N; j++) {
        k = PF.rint(fr(runs[j] / sf));                 // np.round(runs / s), float32 in, half-to-even
        res = Math.abs(fr(runs[j] - fr(k * sf)));      // np.abs(runs - k * s)
        // np.clip(1.0 - res / (0.30 * s), 0, 1) * ok * k
        w = PF.clipScalar(fr(1.0 - fr(res / s03)), 0, 1);
        w = fr(w * (k >= 1 ? 1 : 0));
        w = fr(w * k);
        wkk[j] = fr(fr(w * k) * k);                    // (w * k) * k
        wkr[j] = fr(fr(w * k) * runs[j]);              // (w * k) * runs
      }
      if (SEM.sumFloat32) {
        den = PF.sum(wkk);                             // float32 pairwise sum
        if (den <= 0) break;
        num = PF.sum(wkr);
        s = fr(num / den);                             // float32 division, then float()
      } else {                                         // control: float64 accumulation
        den = PF.pairwiseSum(new Float64Array(wkk), 0, N, false);
        if (den <= 0) break;
        num = PF.pairwiseSum(new Float64Array(wkr), 0, N, false);
        s = num / den;
      }
    }
    return s;
  }

  // ------------------------------------------------------ local-step integration

  /** Fine comb peak near s0 for one tile; null if unreliable. */
  function _tile_peak(diffs, s0) {
    if (diffs.length < 350) return null;
    var fine = PF.arange(0.87 * s0, 1.13 * s0, 0.005);
    var h = _hist(diffs, 0.05);
    var S = combRows(h.hist, twoPiCenters(h.centers), fine);
    var hsum = PF.sum(h.hist), i;
    for (i = 0; i < S.length; i++) S[i] = S[i] / hsum;
    var pk = PF.argmax(S);
    if (pk === 0 || pk === fine.length - 1 || S[pk] < 0.12) {
      return null;  // peak at window edge or too weak -> distrust
    }
    return fine[pk];
  }

  /** cols = W * mean(1/s_local): pooled over several tile grids.
   *
   *  AI pseudo-grids drift in scale; the global comb finds the DOMINANT local
   *  pitch, which can differ from W/cols by several percent. Estimating the
   *  step per tile and averaging 1/s recovers the global cell count.
   */
  function _integrate_step(ys, pos, nPerp, nScan, s0) {
    var inv = [], t, i, j, q, n = pos.length;
    for (t = 0; t < TILINGS.length; t++) {
      var tp = TILINGS[t][0], tsc = TILINGS[t][1];
      var ye = PF.linspace(0, nPerp, tp + 1);
      var xe = PF.linspace(0, nScan, tsc + 1);
      for (i = 0; i < tp; i++) {
        for (j = 0; j < tsc; j++) {
          var ysA = [], posA = [];
          for (q = 0; q < n; q++) {
            if (ys[q] >= ye[i] && ys[q] < ye[i + 1] && pos[q] >= xe[j] && pos[q] < xe[j + 1]) {
              ysA.push(ys[q]); posA.push(pos[q]);
            }
          }
          var sI = _tile_peak(_lag_diffs(new Int32Array(ysA), new Float64Array(posA)), s0);
          if (sI !== null) inv.push(1.0 / sI);
        }
      }
    }
    if (inv.length === 0) return s0;
    var arr = new Float64Array(inv);
    return 1.0 / (PF.sum(arr) / arr.length);          // np.mean: pairwise sum / n
  }

  // ---------------------------------------------------------------- detect

  /** @param {{d:Uint8Array|Uint8ClampedArray, w, h, cn:4}} rgba
   *  @returns {object} the reference's dict, keys verbatim */
  function detect(rgba) {
    var h = rgba.h, w = rgba.w;
    var img4 = _prep(rgba);
    var sGrid = PF.arange(S_MIN, S_MAX, 0.01);

    var axes = {}, spec = [[1, 'x'], [0, 'y']], a;
    for (a = 0; a < 2; a++) {
      var axis = spec[a][0], name = spec[a][1];
      var b = _boundaries(img4, axis);
      var runs = _lag_diffs(b.ys, b.pos);
      var pk = _pick_step(runs, sGrid);
      var s = pk.s;
      if (s !== null) s = _refine(runs, s);
      axes[name] = { s: s, v: pk.v, cands: pk.cands, nruns: runs.length, runs: runs, ys: b.ys, pos: b.pos };
    }

    var sx = axes.x.s, sy = axes.y.s;
    var vx = axes.x.v, vy = axes.y.v;
    if (sx === null && sy === null) {
      return { step_x: 8.0, step_y: 8.0, cols: PF.rint(w / 8), rows: PF.rint(h / 8),
               phase_x: 0.0, phase_y: 0.0, candidates: [] };
    }
    // cross-axis reconciliation: a weak axis borrows the strong axis's step
    if (sx === null || (sy !== null && vx < 0.5 * vy && Math.abs(sx - sy) > 0.15 * sy)) {
      var sx2 = axes.x.runs.length ? _refine(axes.x.runs, sy) : sy;
      if (Math.abs(sx2 - sy) < 0.15 * sy) sx = sx2;
    }
    if (sy === null || (sx !== null && vy < 0.5 * vx && Math.abs(sy - sx) > 0.15 * sx)) {
      var sy2 = axes.y.runs.length ? _refine(axes.y.runs, sx) : sx;
      if (Math.abs(sy2 - sx) < 0.15 * sx) sy = sy2;
    }
    if (sx === null) sx = sy;
    if (sy === null) sy = sx;

    // local-step integration (drift-aware effective step)
    sx = _integrate_step(axes.x.ys, axes.x.pos, h, w, sx);
    sy = _integrate_step(axes.y.ys, axes.y.pos, w, h, sy);

    // square-cell reconciliation: AI pseudo-pixels are near-square; when the
    // two axes land within ~8.5% of each other the residual disagreement is
    // mostly noise, so pool them (harmonic mean preserves cell counts).
    var rel = Math.abs(sx - sy) / (0.5 * (sx + sy));
    if (rel < 0.085 || (rel < 0.15 && Math.max(vx, vy) < 0.15)) {
      sx = sy = 2.0 / (1.0 / sx + 1.0 / sy);
    }

    // sorted(x + y, key=lambda t: -t[1]) -- Python's sort is stable
    var cands = [], i;
    for (i = 0; i < axes.x.cands.length; i++) cands.push([axes.x.cands[i][0], axes.x.cands[i][1], cands.length]);
    for (i = 0; i < axes.y.cands.length; i++) cands.push([axes.y.cands[i][0], axes.y.cands[i][1], cands.length]);
    cands.sort(function (p, q) {
      if (p[1] > q[1]) return -1;
      if (p[1] < q[1]) return 1;
      return p[2] - q[2];
    });
    for (i = 0; i < cands.length; i++) cands[i] = [cands[i][0], cands[i][1]];

    return {
      step_x: sx, step_y: sy,
      cols: PF.rint(w / sx), rows: PF.rint(h / sy),
      phase_x: 0.0, phase_y: 0.0,
      score_x: vx, score_y: vy,
      nruns_x: axes.x.nruns, nruns_y: axes.y.nruns,
      candidates: cands
    };
  }

  PF.runlengths = {
    S_MIN: S_MIN, S_MAX: S_MAX, RUN_MIN: RUN_MIN, RUN_MAX: RUN_MAX, BIN: BIN,
    COHERENCE: COHERENCE, THR_FRAC: THR_FRAC, MAX_LAG: MAX_LAG, TILINGS: TILINGS,
    _prep: _prep,
    _boundaries: _boundaries,
    _lag_diffs: _lag_diffs,
    _hist: _hist,
    _comb_score: _comb_score,
    _pick_step: _pick_step,
    _refine: _refine,
    _tile_peak: _tile_peak,
    _integrate_step: _integrate_step,
    detect: detect,
    // internals exposed for the parity test's negative controls
    _internals: { twoPiCenters: twoPiCenters, combRows: combRows },
    _semantics: SEM
  };
  PF.versionRunlengths = 'pf-21-runlengths/1';
})();
