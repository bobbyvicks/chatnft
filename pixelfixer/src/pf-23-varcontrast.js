/* pf-23-varcontrast.js - port of pixelfixer/varcontrast.py (ef376e5):
 * variance-contrast grid scoring, the "square packer" channel.
 *
 * Reference module docstring, kept verbatim because it records WHY the
 * measure is shaped this way:
 *
 *   Idea (from Kopf et al.'s content-adaptive kernels, turned into a
 *   detector): a pixel grid is correct when the image decomposes into cells
 *   that are each internally color-homogeneous. Measure, for a candidate
 *   cell size s, the mean within-cell color variance at the BEST grid phase
 *   versus the WORST phase:
 *
 *     contrast(s) = (var_worst_phase(s) - var_best_phase(s)) / total_variance
 *
 *   * true cell size: best phase aligns cells with pseudo-pixels (low
 *     variance), worst phase makes every cell straddle boundaries (high
 *     variance) -> large contrast
 *   * half the true size (sub-harmonic): every phase nests inside
 *     pseudo-pixels -> contrast ~ 0
 *   * multiples / junk sizes: phase barely matters -> contrast small
 *
 *   So the contrast curve peaks at the FUNDAMENTAL, needs no edges (works on
 *   mushy, lumpy AI art where gradient profiles fail), and yields the grid
 *   phase for free. Summed-area tables make each evaluation O(number of
 *   cells).
 *
 *   The measure must use true 2D cells: full-height strips dilute the signal
 *   below noise (a strip's variance is dominated by content along the other
 *   axis). 2D summed-area tables give O(1) per-cell moments, so one grid
 *   evaluation costs O(number of cells).
 *
 * WHO CALLS WHAT (grepped in the reference, not assumed):
 *   CellVarContrast(rgba).z_channel()   core.py:148 (stage-2 build),
 *                                       fusion.py:109 (build_evidence, not
 *                                       lean), channels.py:1356 (fit_grid)
 *   z_of(step)                          core.py:248 vc_at, fusion.py:165
 *   vc.contrast(s, n_phases=12)         channels.py:1502
 *   vc.best_pair(sorted(pairs))         channels.py:1517 -> pair_q ->
 *                                       contrast_local
 *   VarContrast (axis-separable)        NO caller anywhere in the package.
 *                                       Ported for the call graph and tested
 *                                       directly; nothing downstream reads it.
 *   grid_variance, _sample_sat          no caller; ported and tested.
 *
 * RNG: this module does NOT reach k-means or any random generator.
 * varcontrast.py imports only numpy and scipy.ndimage.median_filter; nothing
 * in it draws a random number, so its output is a pure function of (rgba,
 * arguments). tools/parity-varcontrast.py MEASURES that as well as reading
 * it: in each image's process it rebuilds the scorer after core.detect /
 * fusion.detect / fit_grid (which do draw from OpenCV's global RNG) and
 * requires the rebuilt curve and candidates to be bit-identical to the ones
 * built first. The ARGUMENTS the pipeline passes in (candidate steps, pairs)
 * can depend on the RNG upstream, which is why the fixture records them from
 * one image per process and the test replays them, rather than recomputing
 * them.
 *
 * FLOAT POLICY. Everything is float64, as in the reference (rgba.astype(
 * np.float64), np.zeros() SATs, Python floats). What had to be matched
 * beyond "float64":
 *   - cumsum is sequential; the SAT is cumsum(axis=0) THEN cumsum(axis=1),
 *     in that order, for the channel sums and for the squared sums alike.
 *   - (x ** 2).sum(axis=-1) over C <= 4 channels is numpy's pairwise_sum
 *     below its 8-element block, i.e. a left-to-right sum starting from 0.0
 *     (the reduction's identity), then added to the identity again. All
 *     terms are squares (>= +0), so that is the plain sequential sum; for
 *     C >= 8 the general pairwise order is used (PF.pairwiseSum).
 *   - np.rint is round-half-to-EVEN (PF.rint). Cell corners x0 + step land
 *     on exact .5 whenever step is a half-integer and the phase is 0.
 *   - ndarray.mean / .sum of 1-D float64 are pairwise (PF.mean, PF.sum).
 *   - np.bincount(weights) is a sequential float64 loop (PF.bincount).
 *   - float64 // int and float64 % float are numpy's npy_divmod, not
 *     Math.floor(a / b) and not Python's float_rem (vc_floor_divide,
 *     vc_remainder below).
 *   - VarContrast's axis sums follow numpy's memory-order reduction model
 *     (PF.sumAxes, with the transpose passed as a perm - varcontrast.py:45
 *     transposes BEFORE summing, and that changes the summation order).
 *   - Python's builtin max/min/sort are first-wins / stable; mirrored by
 *     py_max, py_min and a stable key sort, not Math.max / Array.sort.
 *   - np.log in z_channel: V8's Math.log differs from numpy's (the UCRT) in
 *     the last bit on 5 of the 89 possible curve knots and on 3.5% of steps
 *     in [1.5, 70] (measured, 200000 samples). vc_log below is a correctly
 *     rounded double-double log; tools/test-varcontrast.cjs measures its
 *     agreement with numpy on every knot and on a random sample, and says
 *     what is left.
 *
 * Images are {d, w, h, cn}: a flat interleaved typed array (Uint8Array in
 * the pipeline, cn = 4 RGBA) plus explicit width / height. cn = 3 (RGB) is
 * accepted because the reference accepts it (the premultiply only runs when
 * the array has 4 channels); the pipeline always passes RGBA.
 *
 * Python tuples come back as JS arrays in the same order; Python None is
 * null (or undefined) on the way in.
 *
 * No imports, no build step: browser + node, ES2017. Reads PF.check,
 * PF.arange, PF.linspace, PF.rint, PF.argmax, PF.argmin, PF.argsort,
 * PF.unique, PF.bincount, PF.interp, PF.median, PF.mean, PF.sum,
 * PF.pairwiseSum, PF.sumAxes, PF.npMaximum, PF.npMinimum (pf-00-base.js)
 * and PF.median_filter (pf-02-scipy.js), all at call time.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var V = {};
  PF.varcontrast = V;

  function check(cond, msg) {
    if (!cond) throw new Error('PF.varcontrast: ' + msg);
  }

  /* Switches for the test's negative controls ONLY. Each flips one measured
   * numpy semantic to its "obvious" JS reading; tools/test-varcontrast.cjs
   * sets one to false, requires the parity to go RED, and restores it.
   * Nothing else may touch these. */
  V._semantics = {
    rintHalfEven: true,     // np.rint (half to even) vs Math.round
    correctLog: true,       // vc_log vs Math.log in z_channel
    premultiply: true       // rgb * (alpha / 255.0) before any moment
  };
  var SEM = V._semantics;

  /* ------------------------------------------------------------------ *
   * Python / numpy scalar semantics this module needs and pf-00 does not
   * carry. Prefixed vc_ because they live here, not in the shared shims.
   * ------------------------------------------------------------------ */

  /* Python builtin max(a, b) / min(a, b): the FIRST argument wins unless
   * the second compares strictly greater (less). Not Math.max: that
   * propagates NaN and orders -0 < +0, and the builtin does neither. */
  function py_max(a, b) { return (b > a) ? b : a; }
  function py_min(a, b) { return (b < a) ? b : a; }

  /* numpy npy_divmod (npy_math_internal.h.src), the kernel behind
   * np.floor_divide and np.remainder on float64. C truthiness is kept
   * literally: `if (mod)` is true for NaN, so the tests are `!== 0`. */
  function vc_divmod(a, b) {
    var mod = a % b;                       // npy_fmod: IEEE fmod, exact
    if (b === 0) return [a / b, mod];
    var div = (a - mod) / b;
    if (mod !== 0) {
      if ((b < 0) !== (mod < 0)) { mod += b; div -= 1.0; }
    } else {
      mod = (b < 0) ? -0 : 0;              // copysign(0, b)
    }
    var floordiv;
    if (div !== 0) {
      floordiv = Math.floor(div);
      if (div - floordiv > 0.5) floordiv += 1.0;
    } else {
      var q = a / b;
      floordiv = (q < 0 || Object.is(q, -0)) ? -0 : 0;   // copysign(0, a/b)
    }
    return [floordiv, mod];
  }
  function vc_floor_divide(a, b) { return vc_divmod(a, b)[0]; }
  function vc_remainder(a, b) { return vc_divmod(a, b)[1]; }
  V.vc_floor_divide = vc_floor_divide;
  V.vc_remainder = vc_remainder;

  /* np.clip(x, lo, hi) two-sided (a fused ufunc: keeps the LEFT operand on
   * a tie, a NaN bound propagates) - the same rule as pf-00's clip2, which
   * is private there. */
  function vc_clip(x, lo, hi) {
    var t = (lo !== lo) ? lo : ((x < lo) ? lo : x);
    return (hi !== hi) ? hi : ((hi < t) ? hi : t);
  }

  function vc_rint(x) {
    return SEM.rintHalfEven ? PF.rint(x) : Math.round(x);
  }

  /* Stable sort of indices by key ascending, index as the tie-break -
   * Python's list.sort(key=...) on keys that are never NaN (every sort in
   * this module filters with a strict `>` first, which drops NaN). */
  function vc_stable_order(keys) {
    var n = keys.length, idx = new Array(n), i;
    for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (i, j) {
      var a = keys[i], b = keys[j];
      if (a < b) return -1;
      if (b < a) return 1;
      return i - j;
    });
    return idx;
  }

  /* ------------------------------------------------------------------ *
   * vc_log - np.log on a float64 scalar, correctly rounded.
   *
   * numpy's float64 log is the Microsoft UCRT's (np.log == math.log on
   * 200000/200000 arguments and on all 89 curve knots, array and scalar
   * paths alike - measured in the reference venv). V8's Math.log is not the
   * UCRT; it differs in the last bit on 5 of those 89 knots. The UCRT log
   * is not open, but it is correctly rounded almost everywhere, so a
   * correctly rounded log is the closest reproducible function.
   *
   * Method: x = 2^e * m with m in [sqrt(1/2), sqrt(2)); log m =
   * 2 atanh(t), t = (m - 1) / (m + 1), |t| <= 0.1716; the series
   * sum t^(2k) / (2k+1) is run to k = 24 (t^48/49 < 2^-124) entirely in
   * double-double; e * ln2 is added with ln2 as a double-double. The result
   * carries ~104 good bits, so rounding it to 53 is correct except within
   * 2^-104 of a rounding midpoint.
   * ------------------------------------------------------------------ */
  var DD_SPLIT = 134217729;              // 2^27 + 1 (Dekker)
  function dd_two_prod(a, b, out) {
    var p = a * b;
    var t = DD_SPLIT * a, ah = t - (t - a), al = a - ah;
    t = DD_SPLIT * b;
    var bh = t - (t - b), bl = b - bh;
    out[0] = p;
    out[1] = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  }
  function dd_add(ah, al, bh, bl, out) {
    var s = ah + bh, bb = s - ah, e = (ah - (s - bb)) + (bh - bb);
    var t = al + bl, cc = t - al, f = (al - (t - cc)) + (bl - cc);
    e += t;
    var s2 = s + e; e = e - (s2 - s); s = s2;
    e += f;
    s2 = s + e; e = e - (s2 - s);
    out[0] = s2; out[1] = e;
  }
  var ddT = [0, 0];
  function dd_mul(ah, al, bh, bl, out) {
    dd_two_prod(ah, bh, ddT);
    var p = ddT[0], e = ddT[1] + (ah * bl + al * bh);
    var s = p + e;
    out[0] = s; out[1] = e - (s - p);
  }
  function dd_div(ah, al, bh, bl, out) {
    var q1 = ah / bh, r = [0, 0], t = [0, 0];
    dd_mul(q1, 0, bh, bl, t); dd_add(ah, al, -t[0], -t[1], r);
    var q2 = r[0] / bh;
    dd_mul(q2, 0, bh, bl, t); dd_add(r[0], r[1], -t[0], -t[1], r);
    var q3 = r[0] / bh;
    var s = q1 + q2, e = q2 - (s - q1);
    dd_add(s, e, q3, 0, out);
  }
  var LN2_HI = 0.6931471805599453, LN2_LO = 2.3190468138462996e-17;
  var LOG_K = 24, LOG_C = [];
  (function () {
    for (var k = 0; k <= LOG_K; k++) { var c = [0, 0]; dd_div(1, 0, 2 * k + 1, 0, c); LOG_C.push(c); }
  })();
  var f64b = new Float64Array(1), u32b = new Uint32Array(f64b.buffer);
  var LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, HI = LE ? 1 : 0;
  function vc_log(x) {
    if (!SEM.correctLog) return Math.log(x);
    if (!(x > 0) || x === Infinity) return Math.log(x);   // NaN, <=0, inf: exact specials
    var e = 0;
    if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; }   // subnormal: * 2^54
    f64b[0] = x;
    e += ((u32b[HI] >>> 20) & 0x7ff) - 1023;
    u32b[HI] = (u32b[HI] & 0x800fffff) | 0x3ff00000;   // m in [1, 2)
    var m = f64b[0];
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    var num = m - 1;                                   // exact (Sterbenz)
    var dh = m + 1, bv = dh - m;                       // two_sum(m, 1): m may be < 1,
    var dl = (m - (dh - bv)) + (1 - bv);               // so not the fast variant
    var t = [0, 0], t2 = [0, 0], S = [LOG_C[LOG_K][0], LOG_C[LOG_K][1]], r = [0, 0];
    dd_div(num, 0, dh, dl, t);
    dd_mul(t[0], t[1], t[0], t[1], t2);
    for (var k = LOG_K - 1; k >= 0; k--) {
      dd_mul(S[0], S[1], t2[0], t2[1], S);
      dd_add(S[0], S[1], LOG_C[k][0], LOG_C[k][1], S);
    }
    dd_mul(S[0], S[1], t[0], t[1], r);                  // atanh(t)
    r[0] *= 2; r[1] *= 2;                               // log m
    if (e !== 0) {
      var el = [0, 0];
      dd_two_prod(e, LN2_HI, el);
      el[1] += e * LN2_LO;
      dd_add(el[0], el[1], r[0], r[1], r);
    }
    return r[0] + r[1];
  }
  V.vc_log = vc_log;

  /* ------------------------------------------------------------------ *
   * rgba.astype(np.float64), premultiplied when there are 4 channels:
   *   a = img[:, :, 3:4] / 255.0
   *   img = np.concatenate([img[:, :, :3] * a, img[:, :, 3:4]], axis=2)
   * i.e. rgb * (A / 255.0) - the quotient first, then the product - and
   * the alpha channel itself stays A.
   * ------------------------------------------------------------------ */
  function checkImage(rgba, who) {
    check(rgba && rgba.d && rgba.w > 0 && rgba.h > 0 && rgba.cn >= 1 &&
      rgba.d.length === rgba.w * rgba.h * rgba.cn,
      who + ': rgba must be {d: typedArray(w*h*cn), w, h, cn}');
  }
  function premultiplied(rgba) {
    var n = rgba.w * rgba.h, C = rgba.cn, src = rgba.d;
    var img = new Float64Array(n * C), p, c, a, o;
    if (C === 4 && SEM.premultiply) {
      for (p = 0; p < n; p++) {
        o = p * 4;
        a = src[o + 3] / 255.0;
        img[o] = src[o] * a;
        img[o + 1] = src[o + 1] * a;
        img[o + 2] = src[o + 2] * a;
        img[o + 3] = src[o + 3];
      }
    } else {
      for (c = 0; c < n * C; c++) img[c] = src[c];
    }
    return img;
  }
  V._premultiplied = premultiplied;

  /* ================================================================== *
   * Axis-separable scorer (VarContrast). No caller in the reference.
   * ================================================================== */

  /* _axis_moments(rgba, axis) -> [S1, S2, count]
   *   "Per-scanline color moments collapsed along the other axis.
   *    S1: (L+1, C) prefix sums of per-line channel sums
   *    S2: (L+1,)   prefix sums of per-line total squared values
   *    where L is the length of `axis`."
   * S1 comes back as {d, w: C, h: L+1}; S2 as a Float64Array(L+1).
   * The sums are PF.sumAxes over the BASE (H, W, C) array with the
   * reference's transpose as a perm: for axis=1 line_sq is ONE pairwise run
   * of W*C per line, for axis=0 it is a sequential sum over rows of
   * per-pixel channel sums - different floats for the same numbers. */
  function _axis_moments(rgba, axis) {
    checkImage(rgba, '_axis_moments');
    check(axis === 0 || axis === 1, '_axis_moments: axis must be 0 or 1');
    var H = rgba.h, W = rgba.w, C = rgba.cn;
    var img = premultiplied(rgba);
    var shape = [H, W, C], perm = (axis === 1) ? [1, 0, 2] : null;
    var line_sum = PF.sumAxes(img, shape, [0], perm);          // (L, C)
    var sq = new Float64Array(img.length), i;
    for (i = 0; i < img.length; i++) sq[i] = img[i] * img[i];  // img ** 2
    var line_sq = PF.sumAxes(sq, shape, [0, 2], perm);         // (L,)
    var count = (axis === 1) ? W : H;                          // pixels per line
    var L = (axis === 1) ? H : W;
    check(line_sum.d.length === L * C && line_sq.d.length === L, '_axis_moments: shape');
    var S1 = new Float64Array((L + 1) * C), S2 = new Float64Array(L + 1), c, k;
    for (c = 0; c < C; c++) {                                  // np.cumsum(line_sum, axis=0)
      if (L > 0) S1[C + c] = line_sum.d[c];
      for (k = 1; k < L; k++) S1[(k + 1) * C + c] = S1[k * C + c] + line_sum.d[k * C + c];
    }
    if (L > 0) S2[1] = line_sq.d[0];                           // np.cumsum(line_sq)
    for (k = 1; k < L; k++) S2[k + 1] = S2[k] + line_sq.d[k];
    return [{ d: S1, w: C, h: L + 1 }, S2, count];
  }
  V._axis_moments = _axis_moments;

  /* "Mean within-strip variance (weighted by strip size) for strips
   *  bounded by fractional cut positions. Linear interpolation of the
   *  prefix sums handles fractional cuts." */
  function _strip_variance(S1, S2, count, cuts) {
    var L = S2.length - 1, C = S1.w, K1 = cuts.length, k, c;
    check(S1.h === L + 1, '_strip_variance: S1 / S2 lengths disagree');
    var idx = new Float64Array(K1), frac = new Float64Array(K1);
    var i0 = new Int32Array(K1), i0c = new Int32Array(K1);
    var s1 = new Float64Array(K1 * C), s2 = new Float64Array(K1);
    for (k = 0; k < K1; k++) {
      idx[k] = vc_clip(cuts[k], 0.0, L);
      i0[k] = Math.floor(idx[k]) | 0;                 // np.floor(idx).astype(int)
      frac[k] = idx[k] - i0[k];
      i0c[k] = Math.min(i0[k] + 1, L);                // np.minimum(i0 + 1, L), ints
      var f = frac[k], g = 1 - f;
      for (c = 0; c < C; c++) s1[k * C + c] = S1.d[i0[k] * C + c] * g + S1.d[i0c[k] * C + c] * f;
      s2[k] = S2[i0[k]] * g + S2[i0c[k]] * f;
    }
    var K = K1 - 1;
    if (K < 1) return 0.0;                            // no strips: ok.any() is False
    var vn = [], nn = [], n, d2, ms, dd, j = 0;
    for (k = 0; k < K; k++) {
      n = (idx[k + 1] - idx[k]) * count;              // widths * count
      if (!(n > 1e-9)) continue;                      // ok = n > 1e-9
      ms = 0.0;                                       // (d1 ** 2).sum(axis=1)
      if (C < 8) {
        for (c = 0; c < C; c++) { dd = s1[(k + 1) * C + c] - s1[k * C + c]; ms = ms + dd * dd; }
      } else {
        var row = new Float64Array(C);
        for (c = 0; c < C; c++) { dd = s1[(k + 1) * C + c] - s1[k * C + c]; row[c] = dd * dd; }
        ms = PF.pairwiseSum(row, 0, C, false);
      }
      ms = ms / (n * n);
      d2 = s2[k + 1] - s2[k];
      var v = d2 / n - ms;
      vn.push(v * n); nn.push(n); j++;
    }
    if (j === 0) return 0.0;
    return PF.sum(Float64Array.from(vn)) / PF.sum(Float64Array.from(nn));
  }
  V._strip_variance = _strip_variance;

  function _grid_cuts(length, step, phase) {
    var first = vc_remainder(phase, step);            // numpy float64 %: npy_divmod
    var body, cuts, i;
    if (first > 1e-9) {
      body = PF.arange(first, length, step);
      cuts = new Float64Array(body.length + 2);
      cuts[0] = 0.0;
      for (i = 0; i < body.length; i++) cuts[i + 1] = body[i];
      cuts[body.length + 1] = length;
    } else {
      body = PF.arange(0.0, length, step);
      cuts = new Float64Array(body.length + 1);
      for (i = 0; i < body.length; i++) cuts[i] = body[i];
      cuts[body.length] = length;
    }
    for (i = 0; i < cuts.length; i++) cuts[i] = vc_clip(cuts[i], 0, length);
    return PF.unique(cuts).values;
  }
  V._grid_cuts = _grid_cuts;

  /** Axis-separable variance-contrast scorer for one image. */
  function VarContrast(rgba) {
    var mx = _axis_moments(rgba, 0), my = _axis_moments(rgba, 1);
    this.S1x = mx[0]; this.S2x = mx[1]; this.cx = mx[2];
    this.S1y = my[0]; this.S2y = my[1]; this.cy = my[2];
    this.W = this.S2x.length - 1;
    this.H = this.S2y.length - 1;
    // total variance per axis for normalisation
    this.total_x = this._var_x(new Float64Array([0.0, this.W]));
    this.total_y = this._var_y(new Float64Array([0.0, this.H]));
  }
  VarContrast.prototype._var_x = function (cuts) {
    return _strip_variance(this.S1x, this.S2x, this.cx, cuts);
  };
  VarContrast.prototype._var_y = function (cuts) {
    return _strip_variance(this.S1y, this.S2y, this.cy, cuts);
  };

  /** (contrast, best_phase) at a candidate step for one axis. */
  VarContrast.prototype.contrast = function (axis, step, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 6;
    var L = (axis === 0) ? this.W : this.H;
    var total = (axis === 0) ? this.total_x : this.total_y;
    if (step < 1.5 || step > L / 3 || total <= 1e-9) return [0.0, 0.0];
    var q = step / n_phases, phases = new Float64Array(n_phases), vs = new Float64Array(n_phases), i;
    for (i = 0; i < n_phases; i++) phases[i] = i * q;
    for (i = 0; i < n_phases; i++) {
      var cuts = _grid_cuts(L, step, phases[i]);
      vs[i] = (axis === 0) ? this._var_x(cuts) : this._var_y(cuts);
    }
    var best = PF.argmin(vs);
    var mx = vs[0], mn = vs[0];                       // vs.max() / vs.min()
    for (i = 1; i < n_phases; i++) { mx = PF.npMaximum(mx, vs[i]); mn = PF.npMinimum(mn, vs[i]); }
    return [(mx - mn) / total, phases[best]];
  };

  VarContrast.prototype.curve = function (axis, steps, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 6;
    var out = new Float64Array(steps.length), i;
    for (i = 0; i < steps.length; i++) out[i] = this.contrast(axis, steps[i], n_phases)[0];
    return out;
  };

  /** Parabolic-ish local refinement -> (step, contrast, phase). */
  VarContrast.prototype.refine = function (axis, step, span, n_phases) {
    if (span === undefined || span === null) span = 0.6;
    if (n_phases === undefined || n_phases === null) n_phases = 8;
    var candidates = PF.linspace(py_max(1.6, step - span), step + span, 13);
    var cs = this.curve(axis, candidates, n_phases);
    var i = PF.argmax(cs);
    // second, finer pass
    var lo = candidates[Math.max(0, i - 1)];
    var hi = candidates[Math.min(candidates.length - 1, i + 1)];
    var fine = PF.linspace(lo, hi, 9);
    var cf = this.curve(axis, fine, n_phases);
    var j = PF.argmax(cf);
    var r = this.contrast(axis, fine[j], 12);
    return [fine[j], r[0], r[1]];
  };

  /** Scan the contrast curve, return refined (step, contrast, phase) for
   *  its local maxima. */
  VarContrast.prototype.candidates = function (axis, min_step, max_step, top) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    if (top === undefined || top === null) top = 5;
    var L = (axis === 0) ? this.W : this.H;
    if (max_step === undefined || max_step === null) max_step = py_min(py_max(4.0, L / 8.0), 64.0);
    var list = [], s = min_step, i;
    while (s <= max_step) { list.push(s); s *= 1.04; }
    var steps = Float64Array.from(list);
    var cs = this.curve(axis, steps, 5);
    // local maxima of the coarse curve
    var cand_idx = [], n = steps.length;
    for (i = 0; i < n; i++) {
      if (cs[i] > 0.01 &&
          cs[i] >= (i > 0 ? cs[i - 1] : -1) &&
          cs[i] >= (i < n - 1 ? cs[i + 1] : -1)) cand_idx.push(i);
    }
    var ord = vc_stable_order(cand_idx.map(function (k) { return -cs[k]; }));
    cand_idx = ord.map(function (k) { return cand_idx[k]; });
    var out = [], seen = [], lim = Math.min(cand_idx.length, top * 2), k, s0;
    for (k = 0; k < lim; k++) {
      s0 = steps[cand_idx[k]];
      if (seen.some(function (s1) { return Math.abs(s0 - s1) / s1 < 0.08; })) continue;
      seen.push(s0);
      out.push(this.refine(axis, s0));
      if (out.length >= top) break;
    }
    var o2 = vc_stable_order(out.map(function (r) { return -r[1]; }));
    return o2.map(function (k) { return out[k]; });
  };
  V.VarContrast = VarContrast;

  /* ================================================================== *
   * 2D cells (CellVarContrast) - the one the pipeline uses.
   * ================================================================== */

  /* Reference class docstring, verbatim:
   *
   * 2D within-cell variance contrast scorer (local-phase, activity-aware).
   *
   * Two properties make this work on real AI sheets:
   * * activity weighting - only cells covering "active" image regions vote,
   *   so flat backgrounds cannot dilute the signal;
   * * local phase - active cells are grouped into coarse tiles and each tile
   *   picks its own best/worst grid phase (same step), so sprite sheets and
   *   warped grids, whose pseudo-pixel phase drifts between regions, still
   *   produce a sharp contrast at the true cell size.
   *
   * contrast(s) = (worst - best) / (best + 0.05 * total) where best/worst are
   * activity-weighted means of per-tile extreme within-cell variances. The
   * flatness normalisation suppresses content-scale periodicity (big cells
   * are never flat inside).
   *
   * STORAGE. The reference keeps S1 (h+1, w+1, C), S2 (h+1, w+1) and their
   * concatenation SC (h+1, w+1, C+1), whose values are copies of the first
   * two. Only SC is stored here (one 1449x1087x5 float64 table is 63 MB);
   * this.S1 / this.S2 are VIEWS into it ({d, off, st, nch, W1}), so every
   * value read is the same float the reference reads. The SAT is built
   * directly in SC's layout with the reference's order of operations:
   * per-pixel values, cumsum over y, then cumsum over x.
   */
  function CellVarContrast(rgba, max_points, tile_px) {
    checkImage(rgba, 'CellVarContrast');
    if (max_points === undefined || max_points === null) max_points = 2600;
    if (tile_px === undefined || tile_px === null) tile_px = 112;
    var h = rgba.h, w = rgba.w, C = rgba.cn, src = rgba.d;
    this.H = h; this.W = w;
    var W1 = w + 1, C1 = C + 1;
    var SC = new Float64Array((h + 1) * W1 * C1);
    var pre = (C === 4 && SEM.premultiply);
    var v = new Float64Array(C), x, y, c, o, a, dst, prev, s;
    // img, sq = (img ** 2).sum(axis=2), then .cumsum(axis=0)
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        o = (y * w + x) * C;
        if (pre) {
          a = src[o + 3] / 255.0;
          v[0] = src[o] * a; v[1] = src[o + 1] * a; v[2] = src[o + 2] * a; v[3] = src[o + 3];
        } else {
          for (c = 0; c < C; c++) v[c] = src[o + c];
        }
        if (C < 8) {
          s = 0.0;
          for (c = 0; c < C; c++) s = s + v[c] * v[c];
        } else {
          var sqv = new Float64Array(C);
          for (c = 0; c < C; c++) sqv[c] = v[c] * v[c];
          s = PF.pairwiseSum(sqv, 0, C, false);
        }
        s = 0.0 + s;                                   // the reduction's identity
        dst = ((y + 1) * W1 + (x + 1)) * C1;
        if (y === 0) {
          for (c = 0; c < C; c++) SC[dst + c] = v[c];
          SC[dst + C] = s;
        } else {
          prev = (y * W1 + (x + 1)) * C1;
          for (c = 0; c < C; c++) SC[dst + c] = SC[prev + c] + v[c];
          SC[dst + C] = SC[prev + C] + s;
        }
      }
    }
    // .cumsum(axis=1) of the y-cumsum, every channel and the squared sum
    for (y = 1; y <= h; y++) {
      for (x = 2; x <= w; x++) {
        dst = (y * W1 + x) * C1; prev = dst - C1;
        for (c = 0; c <= C; c++) SC[dst + c] = SC[prev + c] + SC[dst + c];
      }
    }
    this.SC = SC;
    this.SCflat = SC;          // SC.reshape(-1, C + 1): the same memory
    this.C = C;
    this.S1 = { d: SC, off: 0, st: C1, nch: C, W1: W1 };
    this.S2 = { d: SC, off: C, st: C1, nch: 1, W1: W1 };

    var n = h * w;
    var last = (h * W1 + w) * C1;
    var tm2 = new Float64Array(C);
    for (c = 0; c < C; c++) { var tmean = SC[last + c] / n; tm2[c] = tmean * tmean; }
    this.total_var = SC[last + C] / n - PF.sum(tm2);

    // --- activity map: variance of 8x8 blocks
    var bs = 8;
    var by = PF.arange(0, h - bs + 1, bs);
    var bx = PF.arange(0, w - bs + 1, bs);
    if (by.length === 0 || bx.length === 0) {
      by = new Float64Array([0]); bx = new Float64Array([0]); bs = Math.min(h, w);
    }
    var s1 = CellVarContrast._rect_sum(this.S1, by, bx, bs);
    var s2 = CellVarContrast._rect_sum(this.S2, by, bx, bs);
    var area = bs * bs;
    var nby = by.length, nbx = bx.length, nb = nby * nbx, i, t;
    var bvar = new Float64Array(nb);
    for (i = 0; i < nb; i++) {
      s = 0.0;                                         // ((s1 / area) ** 2).sum(axis=-1)
      if (C < 8) {
        for (c = 0; c < C; c++) { t = s1.d[i * C + c] / area; s = s + t * t; }
      } else {
        var rw = new Float64Array(C);
        for (c = 0; c < C; c++) { t = s1.d[i * C + c] / area; rw[c] = t * t; }
        s = PF.pairwiseSum(rw, 0, C, false);
      }
      bvar[i] = s2.d[i] / area - (0.0 + s);
    }
    this._bvar = bvar;         // not kept by the reference; exposed for the test
    var thresh = py_max(1e-6, 0.02 * this.total_var);
    var sel = [];
    for (i = 0; i < nb; i++) if (bvar[i] > thresh) sel.push(i);
    if (sel.length < 8) {      // fallback: everything is active
      sel = [];
      for (i = 0; i < nb; i++) if (bvar[i] >= 0) sel.push(i);
    }
    var half = bs / 2.0, N = sel.length;
    var px = new Float64Array(N), py = new Float64Array(N);
    for (i = 0; i < N; i++) {
      px[i] = bx[sel[i] % nbx] + half;
      py[i] = by[(sel[i] / nbx) | 0] + half;
    }
    if (N > max_points) {
      var lsp = PF.linspace(0, N - 1, max_points), keys = new Float64Array(max_points);
      var ii = new Int32Array(max_points);
      for (i = 0; i < max_points; i++) { ii[i] = lsp[i] | 0; keys[i] = py[ii[i]] * w + px[ii[i]]; }
      // keys are unique by construction (distinct blocks), so numpy's
      // unstable default argsort and this stable one agree
      var order = PF.argsort(keys);
      var npx = new Float64Array(max_points), npy = new Float64Array(max_points);
      for (i = 0; i < max_points; i++) { npx[i] = px[ii[order[i]]]; npy[i] = py[ii[order[i]]]; }
      px = npx; py = npy;
    }
    this.px = px; this.py = py;

    // tile grouping for local phase
    var tid = new Float64Array(px.length);
    for (i = 0; i < px.length; i++) {
      tid[i] = Math.trunc(vc_floor_divide(py[i], tile_px)) * 64 + Math.trunc(vc_floor_divide(px[i], tile_px));
    }
    var u = PF.unique(tid, { inverse: true });
    this.tile_id = u.inverse;
    var mxid = -1;
    for (i = 0; i < this.tile_id.length; i++) if (this.tile_id[i] > mxid) mxid = this.tile_id[i];
    check(this.tile_id.length > 0, 'CellVarContrast: no active points (the reference raises on .max() of an empty array too)');
    this.n_tiles = mxid + 1;
    // activity-region variance for normalisation: mean block var of
    // active blocks
    var act = [];
    for (i = 0; i < nb; i++) if (bvar[i] > thresh) act.push(bvar[i]);
    this.active_var = act.length ? PF.mean(Float64Array.from(act)) : this.total_var;
  }

  /** Block sums of `size` starting at integer offsets ys, xs.
   *  S is a SAT view ({d, off, st, nch, W1}); returns {d, shape} with shape
   *  (len(ys), len(xs), nch) or (len(ys), len(xs)) for a 1-channel view. */
  CellVarContrast._rect_sum = function (S, ys, xs, size) {
    var ny = ys.length, nx = xs.length, nch = S.nch, W1 = S.W1, st = S.st, off = S.off;
    var out = new Float64Array(ny * nx * nch), i, j, c, y0, y1, x0, x1, pa, pb, pc, pd;
    for (i = 0; i < ny; i++) {
      y0 = ys[i]; y1 = ys[i] + size;
      for (j = 0; j < nx; j++) {
        x0 = xs[j]; x1 = xs[j] + size;
        pa = (y0 * W1 + x0) * st + off; pb = (y0 * W1 + x1) * st + off;
        pc = (y1 * W1 + x0) * st + off; pd = (y1 * W1 + x1) * st + off;
        for (c = 0; c < nch; c++) {
          out[(i * nx + j) * nch + c] = ((S.d[pd + c] - S.d[pb + c]) - S.d[pc + c]) + S.d[pa + c];
        }
      }
    }
    return { d: out, shape: nch === 1 ? [ny, nx] : [ny, nx, nch] };
  };

  /** Bilinear SAT sample at fractional (pos_y, pos_x) 1D arrays.
   *  No caller in the reference ("~6x" slower than the integer-corner path
   *  _cells_variance uses); ported for the call graph. */
  CellVarContrast.prototype._sample_sat = function (S, pos_y, pos_x) {
    var n = pos_y.length, nch = S.nch, W1 = S.W1, st = S.st, off = S.off;
    var out = new Float64Array(n * nch), k, c, iy, fy, iy1, ix, fx, ix1;
    for (k = 0; k < n; k++) {
      iy = vc_clip(Math.floor(pos_y[k]), 0, this.H);
      fy = vc_clip(pos_y[k] - iy, 0, 1);
      iy1 = Math.min(iy + 1, this.H);
      ix = vc_clip(Math.floor(pos_x[k]), 0, this.W);
      fx = vc_clip(pos_x[k] - ix, 0, 1);
      ix1 = Math.min(ix + 1, this.W);
      for (c = 0; c < nch; c++) {
        var v00 = S.d[(iy * W1 + ix) * st + off + c], v01 = S.d[(iy * W1 + ix1) * st + off + c];
        var v10 = S.d[(iy1 * W1 + ix) * st + off + c], v11 = S.d[(iy1 * W1 + ix1) * st + off + c];
        out[k * nch + c] = v00 * (1 - fy) * (1 - fx) + v01 * (1 - fy) * fx +
                           v10 * fy * (1 - fx) + v11 * fy * fx;
      }
    }
    return out;
  };

  /* Within-cell variance of the cell covering each active point.
   *
   * "Cell corners are snapped to integers so each corner needs a single
   *  fused-SAT gather (4 gathers per cell total) - ~6x faster than the
   *  bilinear path with negligible effect on the score curves." */
  CellVarContrast.prototype._cells_variance = function (step_x, step_y, phase_x, phase_y) {
    var px = this.px, py = this.py, N = px.length, W = this.W, H = this.H;
    var W1 = W + 1, C = this.C, C1 = C + 1, f = this.SCflat;
    var out = new Float64Array(N), k, c, x0, y0, ix0, iy0, ix1, iy1, pa, pb, pc, pd, area, s, t, m;
    var rw = (C >= 8) ? new Float64Array(C) : null;
    for (k = 0; k < N; k++) {
      x0 = phase_x + Math.floor((px[k] - phase_x) / step_x) * step_x;
      y0 = phase_y + Math.floor((py[k] - phase_y) / step_y) * step_y;
      ix0 = Math.trunc(vc_clip(vc_rint(x0), 0, W - 1));
      iy0 = Math.trunc(vc_clip(vc_rint(y0), 0, H - 1));
      ix1 = Math.trunc(vc_clip(vc_rint(x0 + step_x), ix0 + 1, W));
      iy1 = Math.trunc(vc_clip(vc_rint(y0 + step_y), iy0 + 1, H));
      pa = (iy1 * W1 + ix1) * C1; pb = (iy1 * W1 + ix0) * C1;
      pc = (iy0 * W1 + ix1) * C1; pd = (iy0 * W1 + ix0) * C1;
      area = (ix1 - ix0) * (iy1 - iy0);
      s = 0.0;                                        // ((s1 / area[:, None]) ** 2).sum(axis=1)
      for (c = 0; c < C; c++) {
        m = ((f[pa + c] - f[pb + c]) - f[pc + c]) + f[pd + c];
        t = m / area;
        if (rw) rw[c] = t * t; else s = s + t * t;
      }
      if (rw) s = PF.pairwiseSum(rw, 0, C, false);
      m = ((f[pa + C] - f[pb + C]) - f[pc + C]) + f[pd + C];
      out[k] = PF.npMaximum(m / area - (0.0 + s), 0.0);
    }
    return out;
  };

  function stepsInvalid(self, step_x, step_y) {
    return (step_x < 1.5 || step_y < 1.5 || step_x > self.W / 3 ||
            step_y > self.H / 3 || self.total_var <= 1e-9 || self.px.length === 0);
  }

  /** (contrast, best_phase_x, best_phase_y) with per-tile local phase.
   *
   *  "Phases are searched per tile; the returned best phase is the global
   *   activity-weighted winner (used only as a hint downstream). Used for
   *   pair arbitration among vetted candidates - per-tile phase freedom
   *   overfits small steps, so this must not drive the open scan." */
  CellVarContrast.prototype.contrast_local = function (step_x, step_y, n_phases) {
    if (step_y === undefined || step_y === null) step_y = step_x;
    if (n_phases === undefined || n_phases === null) n_phases = 3;
    if (stepsInvalid(this, step_x, step_y)) return [0.0, 0.0, 0.0];
    var qx = step_x / n_phases, qy = step_y / n_phases;
    var nt = this.n_tiles, i;
    var cnt = PF.bincount(this.tile_id, null, nt);
    var counts = new Float64Array(nt);
    for (i = 0; i < nt; i++) counts[i] = PF.npMaximum(cnt[i], 1);
    var tile_best = new Float64Array(nt).fill(Infinity);
    var tile_worst = new Float64Array(nt).fill(-Infinity);
    var gbest = Infinity, gphx = 0.0, gphy = 0.0, a, b, px_, py_;
    for (a = 0; a < n_phases; a++) {
      py_ = a * qy;
      for (b = 0; b < n_phases; b++) {
        px_ = b * qx;
        var v = this._cells_variance(step_x, step_y, px_, py_);
        var tv = PF.bincount(this.tile_id, v, nt);
        for (i = 0; i < nt; i++) {
          tv[i] = tv[i] / counts[i];
          tile_best[i] = PF.npMinimum(tile_best[i], tv[i]);
          tile_worst[i] = PF.npMaximum(tile_worst[i], tv[i]);
        }
        var g = PF.mean(tv);
        if (g < gbest) { gbest = g; gphx = px_; gphy = py_; }
      }
    }
    var csum = PF.sum(counts), wb = new Float64Array(nt), ww = new Float64Array(nt);
    for (i = 0; i < nt; i++) { var wi = counts[i] / csum; wb[i] = tile_best[i] * wi; ww[i] = tile_worst[i] * wi; }
    var best = PF.sum(wb), worst = PF.sum(ww);
    var q = (worst - best) / (best + 0.05 * this.active_var);
    return [q, gphx, gphy];
  };

  /** (contrast, best_phase_x, best_phase_y) with a single global phase -
   *  the stable form used for the candidate scan. */
  CellVarContrast.prototype.contrast = function (step_x, step_y, n_phases) {
    if (step_y === undefined || step_y === null) step_y = step_x;
    if (n_phases === undefined || n_phases === null) n_phases = 3;
    if (stepsInvalid(this, step_x, step_y)) return [0.0, 0.0, 0.0];
    var qx = step_x / n_phases, qy = step_y / n_phases;
    var best = Infinity, worst = -Infinity, bx = 0.0, by = 0.0, a, b, px_, py_, v;
    for (a = 0; a < n_phases; a++) {
      py_ = a * qy;
      for (b = 0; b < n_phases; b++) {
        px_ = b * qx;
        v = PF.mean(this._cells_variance(step_x, step_y, px_, py_));
        if (v < best) { best = v; bx = px_; by = py_; }
        if (v > worst) worst = v;
      }
    }
    var q = (worst - best) / (best + 0.05 * this.active_var);
    return [q, bx, by];
  };

  /** Mean within-cell variance over active cells (single phase). */
  CellVarContrast.prototype.grid_variance = function (step_x, step_y, phase_x, phase_y) {
    return PF.mean(this._cells_variance(step_x, step_y, phase_x, phase_y));
  };

  /** Null-corrected local-phase contrast for an (x, y) pair.
   *
   *  "Per-tile phase freedom inflates q for any step (overfit bias), but
   *   only a true lattice loses its q when the step is pushed ~19% off.
   *   Subtracting the off-lattice q cancels the overfit bias." */
  CellVarContrast.prototype.pair_q = function (step_x, step_y, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var q = this.contrast_local(step_x, step_y, n_phases)[0];
    var null1 = this.contrast_local(step_x * 1.19, step_y * 1.19, n_phases)[0];
    var null2 = this.contrast_local(step_x * 0.84, step_y * 0.84, n_phases)[0];
    return q - py_max(py_max(null1, null2), 0.0);      // builtin max(null1, null2, 0.0)
  };

  /** Evaluate candidate (step_x, step_y) pairs, return them scored,
   *  best first (a stable sort: equal scores keep the input order). */
  CellVarContrast.prototype.best_pair = function (pairs, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var out = [], i;
    for (i = 0; i < pairs.length; i++) {
      var sx = pairs[i][0], sy = pairs[i][1];
      out.push([sx, sy, this.pair_q(sx, sy, n_phases)]);
    }
    var ord = vc_stable_order(out.map(function (r) { return -r[2]; }));
    return ord.map(function (k) { return out[k]; });
  };

  /** Detrended-prominence z curve over square cell sizes -> [steps, z, cs]. */
  CellVarContrast.prototype.scored_curve = function (min_step, max_step) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    var L = Math.min(this.W, this.H);
    if (max_step === undefined || max_step === null) max_step = py_min(py_max(4.0, L / 8.0), 64.0);
    var list = [], s = min_step, i;
    while (s <= max_step) { list.push(s); s *= 1.04; }
    var steps = Float64Array.from(list), n = steps.length;
    var cs = new Float64Array(n);
    for (i = 0; i < n; i++) cs[i] = this.contrast(steps[i], null, 3)[0];
    var base = PF.median_filter(cs, 15, { mode: 'nearest' });
    var resid = new Float64Array(n), ar = new Float64Array(n);
    for (i = 0; i < n; i++) { resid[i] = cs[i] - base[i]; ar[i] = Math.abs(resid[i]); }
    // np.median of an empty array is nan (with a warning), not an error
    var sigma = (n ? PF.median(ar) : NaN) * 1.4826 + 1e-9;
    var z = new Float64Array(n);
    for (i = 0; i < n; i++) z[i] = resid[i] / sigma;
    return [steps, z, cs];
  };

  /** Local refinement of a square-cell candidate -> (step, contrast). */
  CellVarContrast.prototype.refine = function (step, span_ratio, n_phases) {
    if (span_ratio === undefined || span_ratio === null) span_ratio = 0.1;
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var span = py_max(0.4, step * span_ratio);
    var coarse = PF.linspace(py_max(1.6, step - span), step + span, 9);
    var cs = new Float64Array(coarse.length), k;
    for (k = 0; k < coarse.length; k++) cs[k] = this.contrast(coarse[k], null, n_phases)[0];
    var i = PF.argmax(cs);
    var lo = coarse[Math.max(0, i - 1)];
    var hi = coarse[Math.min(coarse.length - 1, i + 1)];
    var fine = PF.linspace(lo, hi, 7);
    var cf = new Float64Array(fine.length);
    for (k = 0; k < fine.length; k++) cf[k] = this.contrast(fine[k], null, n_phases)[0];
    var j = PF.argmax(cf);
    return [fine[j], cf[j]];
  };

  /** (z_of_step callable, [(step, z)] candidates from curve maxima). */
  CellVarContrast.prototype.z_channel = function (min_step, max_step) {
    var sc = this.scored_curve(min_step, max_step);
    var steps = sc[0], z = sc[1], n = steps.length, i;
    var logs = new Float64Array(n);
    for (i = 0; i < n; i++) logs[i] = vc_log(steps[i]);

    function z_of(step) {
      if (step < steps[0] || step > steps[n - 1]) return 0.0;
      return PF.interp(vc_log(step), logs, z);
    }

    var idx = [];
    for (i = 0; i < n; i++) {
      if (z[i] > 2.0 &&
          z[i] >= (i > 0 ? z[i - 1] : -1e9) &&
          z[i] >= (i < n - 1 ? z[i + 1] : -1e9)) idx.push(i);
    }
    var ord = vc_stable_order(idx.map(function (k) { return -z[k]; }));
    idx = ord.map(function (k) { return idx[k]; });
    var cands = [], seen = [], lim = Math.min(idx.length, 8), k, s0;
    for (k = 0; k < lim; k++) {
      i = idx[k];
      s0 = steps[i];
      if (seen.some(function (s1) { return Math.abs(s0 - s1) / s1 < 0.06; })) continue;
      seen.push(s0);
      var r = this.refine(s0);
      cands.push([r[0], z[i]]);
    }
    return [z_of, cands];
  };
  V.CellVarContrast = CellVarContrast;

  PF.versionVarcontrast = 'pf-23-varcontrast/1';
})();
