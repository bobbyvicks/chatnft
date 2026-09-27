/* pf-41-reconsearch.js - port of pixelfixer/reconsearch.py (436 lines).
 *
 * Reference docstring, kept verbatim because it is the design record:
 *
 *   Grid detection by reconstruction search ("distillability").
 *
 *   The native resolution is the smallest grid whose box-downscale -> nearest-
 *   upscale reconstruction still explains the image.  Key identity: the L2 error
 *   of that round trip equals the total *within-cell variance* under the
 *   (step, phase) grid, computable from cumulative sums of I and I^2 without
 *   ever resizing:
 *
 *       E(s, p) = sum(I^2) - sum_cells (sum_cell I)^2 / n_cell
 *
 *   Search runs per axis (cells = 1 row x band along the axis), so E_x measures
 *   only horizontal information destruction.  The image is k-means quantized
 *   first so AA/mush ramps snap to flat colors (otherwise their residual
 *   variance swamps the curve).
 *
 *   Signals:
 *     * phase contrast  c(s) = (E(s, anti-phase) - E(s, best-phase)) / (sum):
 *       ~0 below the true step (any phase subdivides cells), peaked where the
 *       grid locks on.  Contrast also peaks at DIVISORS of the true step;
 *     * reconstruction error E(s): flat-ish below the true step, jumps above.
 *
 *   Final answer: error-gated harmonic promotion over refined candidates -
 *   the largest step whose aligned reconstruction error stays near the small-
 *   step floor and whose contrast remains significant.
 *
 *   Alignment matters: a 1% step error de-phases the grid across a wide image
 *   and erases both signals.  Hence (a) tiles (row-blocks x column-segments)
 *   each pick their own phase (absorbs sprite-sheet phase shifts + slow drift),
 *   and (b) coarse peaks are refined on a dense local (s, phase) grid.
 *
 * ---------------------------------------------------------------------------
 * WHO CALLS THIS. core.py's full mode does NOT call reconsearch.detect. Its
 * _build_recon runs  ch = _prep(rgba);  ad = AxisData(ch, 0|1);
 * s_list = _s_grid(extent)[::3];  eb, er = _coarse_curves(ad, s_list);
 * trend = _trend_fn(s_list, eb)  and recon_at() then asks ad.eval_s(s) and
 * _score(eb, er, trend(s)). Measured on the example images (core.detect
 * mode="full", instrumented): dragon, frog and koi-pond reach that path (one
 * _prep, 74 coarse eval_s; frog also 13 arbitration calls); tiny, small, mid
 * and lighthouse exit at the fast consensus and never call this module.
 * detect() below is the module's own entry point and is ported and measured
 * too.
 *
 * THE RNG. _quantize reaches cv2.kmeans, but unlike quantize.py it SEEDS
 * OpenCV's generator first (cv2.setRNGSeed(12345 + seed)) and draws its
 * sample from np.random.default_rng(seed), so its result does not depend on
 * what ran earlier in the process: the parity dump runs _prep again after
 * core.detect and R.detect have drawn from every generator in the process,
 * and got the same bytes back on 13 of 13 cases (it records that; both
 * sides still run one case per process). What it DOES do is move the generator it
 * seeded, and which generator that is matters to the NEXT unseeded kmeans:
 * OpenCV's theRNG() is THREAD-LOCAL. Measured (cv2 5.0.0): a setRNGSeed on
 * a worker thread leaves the main thread's stream untouched, and
 * reconsearch._prep on a worker leaves it untouched while _prep on the same
 * thread moves it. core.py's default path (low_memory=False) runs
 * _build_recon on a ThreadPoolExecutor worker, so there reconsearch never
 * touches the generator that api.process's reconstruction later draws from;
 * with low_memory=True it runs on the main thread and does. JS has one
 * generator (PF.theRNG), so the choice is the caller's:
 *   _prep(rgba)                     seeds PF's global generator, as a call
 *                                   on the reference's main thread does
 *                                   (reconsearch.detect, low_memory=True).
 *   _prep(rgba, {rng: new PF.RNG()}) seeds and draws from a private one, as
 *                                   core's default worker-thread call does -
 *                                   the global is left exactly where it was.
 *
 * NUMERIC MODEL. Every item below was measured against numpy 2.5.3 /
 * cv2 5.0.0 in the reference venv (tools/parity-reconsearch.py records the
 * probes in the fixture's meta), not inferred:
 *   - NEP 50: a Python float next to a float32 array is cast to float32 and
 *     the op runs in float32: a/255.0, 2.0*(blk@C.T), np.maximum(wds, 1e-3)
 *     (the floor is fround(1e-3)), cov / n. Math.fround(x op y) of two
 *     float32 values IS the float32 op for + - * / (double rounding is
 *     innocuous at 53 >= 2*24+2 bits).
 *   - float32 matmuls are OpenBLAS kernels on the reference CPU and come
 *     from pf-06-linalg.js: blk @ centers.T and x @ evecs are sgemm (an FMA
 *     chain; sgemv when the last 262144-row block has ONE row, reachable at
 *     e.g. 481x545 px), x.T @ x is ssyrk (K-blocked at 512). eigh of the
 *     float32 3x3 covariance runs dsyevd in float64 and is cast back.
 *   - reductions follow memory layout (PF.sumAxes / PF.meanAxes /
 *     PF.add_reduceat / PF.sum, each measured by the shims): flat.mean(0) is
 *     a sequential float32 sum; a last-axis .sum() is pairwise; reduceat
 *     copies each segment's first element and pairwise-sums the rest;
 *     np.cumsum is sequential IN float32 (a float64 cumsum cast back is a
 *     different array - see _semantics.cumsumF32). The trap this module
 *     adds: in energy_tiles_multi the LAST axis of en is NOT the fast one -
 *     S[:, idx, :] is a fancy index on the middle axis and numpy returns it
 *     H-fastest, a layout every later op inherits - so en.sum(2) is a
 *     sequential float32 sum, not the pairwise one its shape suggests. That
 *     was the first mismatch this port had (every coarse eb/er off by
 *     ~1e-7 relative); see the loop for the measurement.
 *   - `for s0 in {a, b}` iterates in CPython's hash order, reproduced by
 *     pySetOrder2 (it orders two _align calls; it cannot change a result).
 *   - np.log is the UCRT's log (array and scalar paths identical: the probe
 *     in tools/parity-reconsearch.py finds 0 of 25116 differ, and 0 differ
 *     from math.log), which is correctly rounded on 25112 of those 25116
 *     arguments. V8's Math.log differs from it on 1011 of 25116 (an earlier
 *     40111-argument probe: 1462, including 10 of the 111 values _s_grid can
 *     produce), so this file carries its own correctly rounded log (npLog,
 *     double-double; see below), which the test checks against an exact
 *     60-digit log on all 25116. Math.pow
 *     (1.025, i) equals numpy's power (UCRT pow) for every i in 0..110,
 *     which is every exponent _s_grid can reach.
 *   - round(x, d) on a numpy float64 is numpy's rint(x*10^d)/10^d (0 of
 *     200000 differ); on a Python float it is CPython's correctly rounded
 *     round (PF.pyRound). Which one runs depends on the TYPE, so each call
 *     site below says which it has: the table keys and round(s_ax, 4) are
 *     np.float64; round(s_reg, 4) is a Python float (phase_regress returns
 *     float()).
 *   - Python int // float and float % float are fmod-based (pyFloorDiv,
 *     pyMod), not floor(a/b): W // (15*s) can differ from Math.floor(W/(15*s))
 *     when the quotient rounds up onto an integer.
 *   - Python's builtin max(a, b) keeps a unless b > a; np.maximum keeps the
 *     RIGHT operand on a tie (PF.npMaximum). Both spellings are used here.
 *   - np.argsort of the three eigenvalues: numpy's default kind is an
 *     AVX-512 network whose tie order is not portable in general, but on
 *     THREE float32 values it returned the stable order on all 27 tie
 *     patterns and on signed zeros, so PF.argsort (stable) is exact here.
 *   - argmax takes the FIRST maximum; sorted()/list.sort are stable.
 *
 * WHERE THIS IS EXACT, AND WHERE IT IS NOT. Measured by
 * tools/test-reconsearch.cjs against tools/parity-reconsearch.py, one case
 * per process on both sides, on 13 cases: the 3 fixtures and 4 example
 * images, plus 6 synthetic ones built to reach paths the examples do not
 * (an alpha channel, a greyscale covariance, 481x545 px whose last k-means
 * block is one row, a 90x20 strip, 2 colours, an axis with no signal).
 *   - _prep: the channel stack is bit-exact on 13/13, and so are its
 *     intermediates (sample indices, k, centres, labels, mean, covariance,
 *     eigen-decomposition, component order).
 *   - AxisData, core.py's _build_recon sequence, and a replay of every call
 *     core.detect(mode="full") made into this module (dragon 74, frog 113,
 *     koi-pond 74, synth_hbands 113 calls): bit-exact.
 *   - detect(): every internal call, compared one by one in order (all
 *     eval_s, trend and _score calls, every _refine, the table,
 *     phase_regress, _align, _detect_axis) and the result: bit-exact on
 *     12/13. On synth_alpha 4 intermediate values are not: trend(s) at
 *     s = 16.453892223009507 on each axis and the 2 scores built from it
 *     differ by one ulp (max |diff| 5.6e-17). The reason is on the
 *     reference's side: np.log(s) there is the UCRT's 2.800562058525305,
 *     a misrounding of the exact 2.80056205852530459834..., whose correctly
 *     rounded value 2.8005620585253044 is what this port computes. The
 *     UCRT's log is closed source, so its misroundings (4 of 25116 probe
 *     arguments) cannot be reproduced, only counted; the test proves each
 *     such difference at the call - substituting the reference's own log
 *     reproduces the reference's value bit for bit - rather than excusing
 *     it. No step, count, phase, confidence, candidate, table entry or
 *     refinement moved.
 *
 * API: PF.reconsearch.{_quantize, _pca_channels, _prep, AxisData, _s_grid,
 * _coarse_curves, _trend_fn, _score, _peaks, _refine, _build_table, _align,
 * _detect_axis, detect} - the reference's names. Internal calls go through
 * the namespace object (like Python's module-global lookup) so a test can
 * wrap any of them, and AxisData's methods call each other through `this`.
 * Tuples become arrays in the reference's order (eval_s -> [eb, er],
 * _refine -> [sc, s, eb, er], _align -> [s, e], _detect_axis -> [s, sc, eb,
 * cands, trend]); the table dict becomes an insertion-ordered array of
 * {key, val}. An image is {d, w, h, cn: 4} RGBA (the pf-50-core contract);
 * a channel stack is {d: Float32Array(h*w*c), h, w, c}, flat.
 *
 * No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  var R = {};                        // the namespace; filled in at the bottom
  PF.reconsearch = R;

  function check(cond, msg) { if (!cond) throw new Error('PF.reconsearch: ' + msg); }
  function need(name) {
    if (typeof PF[name] !== 'function') {
      throw new Error('PF.reconsearch needs PF.' + name + ' (load pf-00 .. pf-06 before pf-41)');
    }
  }

  /* Negative-control switches. Each names a MEASURED semantic and its
   * "obvious" rival; tools/test-reconsearch.cjs flips them one at a time
   * and requires the parity test to go red. Never set outside a test. */
  var SEM = {
    log: 'cr',            // 'cr' = correctly rounded (== UCRT), 'platform' = Math.log
    cumsumF32: true,      // np.cumsum of float32 accumulates in float32
    alphaScaleF32: true,  // a / 255.0 runs in float32 (NEP 50)
    enRowSequential: true // en.sum(2) is sequential (en's layout), not pairwise
  };

  /* ================================================================== *
   * Scalar semantics the reference gets from Python and numpy
   * ================================================================== */

  /* Python's builtin max(a, b) / min(a, b): the first argument unless the
   * second compares strictly greater / smaller. */
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }

  /* Python float // and numpy floor_divide for float64 (CPython
   * float_floor_div == numpy npy_divmod): fmod-based, then snapped. JS `%`
   * on doubles is exactly C fmod. */
  function pyFloorDiv(a, b) {
    var mod = a % b, div;
    if (b === 0) return a / b;
    div = (a - mod) / b;
    if (mod) {
      if ((b < 0) !== (mod < 0)) { mod += b; div -= 1.0; }
    }
    if (div) {
      var fd = Math.floor(div);
      if (div - fd > 0.5) fd += 1.0;
      return fd;
    }
    var q = a / b;
    return (q < 0 || Object.is(q, -0)) ? -0 : 0;
  }

  /* Python float % and numpy remainder for float64 (same npy_divmod). */
  function pyMod(a, b) {
    var mod = a % b;
    if (b === 0) return mod;
    if (mod) {
      if ((b < 0) !== (mod < 0)) mod += b;
    } else {
      mod = (b < 0) ? -0 : 0;           // copysign(0, b)
    }
    return mod;
  }

  /* round(x, d) of a numpy float64: np.round -> multiply by 10^d, rint
   * (half to even), divide. NOT CPython's round, which works on the exact
   * decimal expansion (PF.pyRound). */
  function npRound(x, d) {
    var f = Math.pow(10, d);            // numpy's power_of_ten table: exact
    return PF.rint(x * f) / f;
  }

  /* ------------------------------------------------------------------ *
   * np.log (numpy -> UCRT log) as a CORRECTLY ROUNDED natural log.
   *
   * Why not Math.log: V8's log differs from the UCRT's on 3.6% of
   * arguments, and _trend_fn is built from logs - ls = np.log(s_list)
   * decides which coarse errors share a median window, and trend(s) =
   * np.interp(np.log(s), ls, trend) scales every score the table ranks.
   * The UCRT's log is not documented as correctly rounded but measured as
   * such on 40103 of 40111 arguments, so a correctly rounded log is the
   * closest reproducible model of it; where the UCRT itself misrounds
   * (0.02%) this cannot match it, and the parity test counts every
   * log call it replays so any such hit is visible rather than silent.
   *
   * Method: x = m * 2^k with m in (sqrt(1/2), sqrt(2)]; log(m) =
   * 2*atanh(u), u = (m-1)/(m+1) (|u| <= 0.1716), summed in double-double
   * (~106 bits) to u^49, then k*ln2 in double-double; the rounding to a
   * double happens once, at the end. m - 1 is exact (Sterbenz); m + 1 is
   * carried as a double-double. The truncated tail is below 2^-110 of the
   * result, so only a true value within ~2^-100 of a rounding midpoint
   * could be misrounded.
   * ------------------------------------------------------------------ */
  var SPLITTER = 134217729;             // 2^27 + 1 (Veltkamp split)
  function twoSum(a, b) { var s = a + b, bb = s - a; return [s, (a - (s - bb)) + (b - bb)]; }
  function quickTwoSum(a, b) { var s = a + b; return [s, b - (s - a)]; }
  function twoProd(a, b) {
    var p = a * b, t, ah, al, bh, bl;
    t = SPLITTER * a; ah = t - (t - a); al = a - ah;
    t = SPLITTER * b; bh = t - (t - b); bl = b - bh;
    return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
  }
  function ddAdd(a, b) {
    var s = twoSum(a[0], b[0]), t = twoSum(a[1], b[1]);
    s = quickTwoSum(s[0], s[1] + t[0]);
    return quickTwoSum(s[0], s[1] + t[1]);
  }
  function ddMul(a, b) {
    var p = twoProd(a[0], b[0]);
    return quickTwoSum(p[0], p[1] + (a[0] * b[1] + a[1] * b[0]));
  }
  function ddMulD(a, d) {
    var p = twoProd(a[0], d);
    return quickTwoSum(p[0], p[1] + a[1] * d);
  }
  function ddDiv(a, b) {
    var q1 = a[0] / b[0];
    var r = ddAdd(a, ddMulD(b, -q1));
    var q2 = r[0] / b[0];
    r = ddAdd(r, ddMulD(b, -q2));
    var q3 = r[0] / b[0];
    return ddAdd(quickTwoSum(q1, q2), [q3, 0]);
  }
  var LN2_DD = [0.6931471805599453, 2.3190468138462996e-17];
  var ATANH_N = 24, INV_ODD = [];
  (function () { for (var j = 0; j <= ATANH_N; j++) INV_ODD.push(ddDiv([1, 0], [2 * j + 1, 0])); })();

  function crLog(x) {
    if (!(x > 0) || x === Infinity) return Math.log(x);   // NaN, <= 0, +inf: exact answers
    var k = 0, m = x, e;
    if (m < 2.2250738585072014e-308) { m *= 18014398509481984; k = -54; }  // lift subnormals by 2^54
    e = Math.floor(Math.log2(m));
    m = m / Math.pow(2, e); k += e;                        // exact: a power-of-two scaling
    while (m >= 2) { m /= 2; k++; }                        // Math.log2 may be off by one at 2^e
    while (m < 1) { m *= 2; k--; }
    if (m > Math.SQRT2) { m /= 2; k++; }
    var u = ddDiv([m - 1, 0], twoSum(m, 1));
    var u2 = ddMul(u, u), s = INV_ODD[ATANH_N], j;
    for (j = ATANH_N - 1; j >= 0; j--) s = ddAdd(ddMul(s, u2), INV_ODD[j]);
    var r = ddMul(u, s);
    r = [2 * r[0], 2 * r[1]];
    if (k !== 0) r = ddAdd(ddAdd(twoProd(k, LN2_DD[0]), [k * LN2_DD[1], 0]), r);
    return r[0] + r[1];
  }

  function npLog(x) { return SEM.log === 'platform' ? Math.log(x) : crLog(x); }

  /* ------------------------------------------------------------------ *
   * Iteration order of the Python set {a, b} of two positive floats.
   *
   * _detect_axis loops `for s0 in {round(s_ax, 4), round(s_reg, 4)}`. Which
   * start is aligned first cannot change its answer - min() over (e, s)
   * tuples depends on order only when two tuples are identical, and then
   * either is the same value - but it decides the ORDER of the 18 eval_s
   * calls _align makes, and the parity test compares the reference's calls
   * one by one. Measured: dragon and koi-pond iterate the second-inserted
   * value first. So this reproduces CPython 3.12: _Py_HashDouble (28 bits
   * at a time into a 61-bit Mersenne residue, then rotated by the exponent)
   * and set_add_entry on the 8-slot small table (slot = hash & 7; on a
   * collision perturb >>= 5, slot = (5*slot + 1 + perturb) & 7), iterated
   * in slot order. Model checked against CPython on 400000 pairs (hash and
   * order), and by the probe in tools/test-reconsearch.cjs.
   * The 61-bit residue is held as two exact limbs, xh (33 bits) and xl
   * (28 bits): no BigInt (ES2017).
   * ------------------------------------------------------------------ */
  var T28 = 268435456, T33 = 8589934592;
  function pyFloatHashBits(v) {                 // v finite and > 0; returns bits 0..63, LSB first
    var e = Math.floor(Math.log2(v)) + 1, m = v / Math.pow(2, e), xh = 0, xl = 0, y, nh;
    while (m >= 1) { m /= 2; e++; }              // frexp: v = m * 2^e, m in [0.5, 1)
    while (m < 0.5) { m *= 2; e--; }
    while (m) {
      nh = (xh % 32) * T28 + xl;                 // x = ((x << 28) & M) | (x >> 33)
      xl = Math.floor(xh / 32); xh = nh;
      m *= T28; e -= 28;
      y = Math.floor(m); m -= y;
      xl += y;                                   // x += y
      if (xl >= T28) { xl -= T28; xh += 1; }
      if (xh > T33 - 1 || (xh === T33 - 1 && xl === T28 - 1)) {   // if x >= M: x -= M
        xl -= T28 - 1; xh -= T33 - 1;
        if (xl < 0) { xl += T28; xh -= 1; }
      }
    }
    e = e >= 0 ? e % 61 : 60 - ((-1 - e) % 61);
    var bits = new Array(64), i, rot = new Array(64);
    for (i = 0; i < 28; i++) { bits[i] = xl % 2; xl = Math.floor(xl / 2); }
    for (i = 28; i < 61; i++) { bits[i] = xh % 2; xh = Math.floor(xh / 2); }
    for (i = 0; i < 64; i++) rot[i] = 0;
    for (i = 0; i < 61; i++) rot[(i + e) % 61] = bits[i];   // ((x << e) & M) | (x >> (61 - e))
    return rot;
  }
  function pySetOrder2(a, b) {
    if (a === b) return [a];
    var ha = pyFloatHashBits(a), hb = pyFloatHashBits(b);
    var low3 = function (h, k) { return (k < 64 ? h[k] : 0) + 2 * (k + 1 < 64 ? h[k + 1] : 0) + 4 * (k + 2 < 64 ? h[k + 2] : 0); };
    var ia = low3(ha, 0), i = low3(hb, 0), sh = 0;
    while (i === ia) { sh += 5; i = (i * 5 + 1 + low3(hb, sh)) & 7; }
    return ia < i ? [a, b] : [b, a];
  }

  /* ================================================================== *
   * preprocess
   * ================================================================== */

  var CRIT_TYPE = 3;                    // cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER

  /**
   * _quantize(rgb, k=KMEANS_K, sample=48000, seed=0)
   * "k-means quantize premultiplied RGB; return centroid-color image."
   *
   * @param {Float32Array} rgb  h*w*3, row-major (the reference's HxWx3)
   * @param {object} [opts]  {rng: PF.RNG} seed and use a private generator
   *   instead of PF's global one (see THE RNG in the header); {diag: {}}
   *   receives idx, count, k, centers, labels for a parity test.
   * @returns {Float32Array} h*w*3, each pixel its centroid's colour
   */
  function _quantize(rgb, h, w, k, sample, seed, opts) {
    need('default_rng'); need('kmeans'); need('matmulF32'); need('sumAxes');
    if (k === undefined || k === null) k = R.KMEANS_K;
    if (sample === undefined || sample === null) sample = 48000;
    if (seed === undefined || seed === null) seed = 0;
    opts = opts || {};
    var n = h * w;
    check(rgb instanceof Float32Array && rgb.length === n * 3, '_quantize: rgb must be Float32Array(h*w*3)');
    var rng = PF.default_rng(seed);
    // cv2.kmeans uses OpenCV's global RNG;
    // without this, results depend on how many images ran earlier
    var cvrng;
    if (opts.rng) { check(opts.rng instanceof PF.RNG, '_quantize: opts.rng must be a PF.RNG'); opts.rng.setState(12345 + seed); cvrng = opts.rng; }
    else { PF.setRNGSeed(12345 + seed); cvrng = PF.theRNG(); }
    var m = Math.min(sample, n);
    var idx = rng.choice(n, m, { replace: false });
    // k = min(k, max(2, len(np.unique(np.round(flat[idx][::7] / 8), axis=0))))
    // float32 / 8 is exact and np.round of it lands on integers 0..32, so a
    // row is identified exactly by one integer key.
    var seen = new Set(), t, p;
    for (t = 0; t < m; t += 7) {
      p = idx[t] * 3;
      seen.add(PF.rint(fr(rgb[p] / 8)) * 1089 + PF.rint(fr(rgb[p + 1] / 8)) * 33 + PF.rint(fr(rgb[p + 2] / 8)));
    }
    k = Math.min(k, Math.max(2, seen.size));
    var data = new Float32Array(m * 3);
    for (t = 0; t < m; t++) { p = idx[t] * 3; data[t * 3] = rgb[p]; data[t * 3 + 1] = rgb[p + 1]; data[t * 3 + 2] = rgb[p + 2]; }
    var km = PF.kmeans({ d: data, w: 3, h: m }, k, { type: CRIT_TYPE, maxCount: 25, epsilon: 0.25 }, 3, cvrng);
    var centers = km.centers.d;
    // c2 = (centers ** 2).sum(1): float32 squares, a last-axis (pairwise) sum
    var sq = new Float32Array(k * 3), cT = new Float32Array(3 * k), j;
    for (j = 0; j < k * 3; j++) sq[j] = fr(centers[j] * centers[j]);
    var c2 = PF.sumAxes(sq, [k, 3], 1).d;
    for (j = 0; j < k; j++) { cT[j] = centers[j * 3]; cT[k + j] = centers[j * 3 + 1]; cT[2 * k + j] = centers[j * 3 + 2]; }
    var out = new Int32Array(n), i0, mb, M, r, best, bv, v;
    for (i0 = 0; i0 < n; i0 += 262144) {
      mb = Math.min(262144, n - i0);
      // 2.0 * (blk @ centers.T) - c2[None, :]  -> float32 throughout (NEP 50)
      M = PF.matmulF32(rgb.subarray(i0 * 3, (i0 + mb) * 3), mb, 3, cT, k);
      for (r = 0; r < mb; r++) {
        best = 0; bv = fr(fr(2 * M[r * k]) - c2[0]);
        for (j = 1; j < k; j++) {
          v = fr(fr(2 * M[r * k + j]) - c2[j]);
          if (!(v <= bv)) { bv = v; best = j; }            // np.argmax: first maximum
        }
        out[i0 + r] = best;
      }
    }
    var q = new Float32Array(n * 3), c;
    for (i0 = 0; i0 < n; i0++) { c = out[i0] * 3; q[i0 * 3] = centers[c]; q[i0 * 3 + 1] = centers[c + 1]; q[i0 * 3 + 2] = centers[c + 2]; }
    if (opts.diag) {
      opts.diag.idx = idx; opts.diag.count = seen.size; opts.diag.k = k;
      opts.diag.centers = centers; opts.diag.labels = out;
    }
    return q;
  }

  /**
   * _pca_channels(img3, alpha, n_comp=2)
   * "Project HxWx3 onto its top PCA axes; append alpha if it varies."
   *
   * @param {Float32Array} img3   h*w*3
   * @param {Float32Array|null} alpha  h*w, or null
   * @returns {{d: Float32Array, h, w, c}} c = n_comp (+1 with alpha)
   */
  function _pca_channels(img3, h, w, alpha, n_comp, diag) {
    need('meanAxes'); need('syrkF32'); need('eigh'); need('argsort'); need('std');
    if (n_comp === undefined || n_comp === null) n_comp = 2;
    var n = h * w, i, j, t;
    check(img3 instanceof Float32Array && img3.length === n * 3, '_pca_channels: img3 must be Float32Array(h*w*3)');
    var mu = PF.meanAxes(img3, [n, 3], 0).d;                // float32 sequential sum / n
    var x = new Float32Array(n * 3);
    for (i = 0; i < n; i++) for (j = 0; j < 3; j++) x[i * 3 + j] = fr(img3[i * 3 + j] - mu[j]);
    var xtx = PF.syrkF32(x, n, 3);                           // x.T @ x -> ssyrk
    var nf = fr(Math.max(n, 1)), cov = new Float32Array(9);
    for (i = 0; i < 9; i++) cov[i] = fr(xtx[i] / nf);       // float32 / int -> float32
    var eg = PF.eigh(cov, 3);                                // float32 in -> dsyevd -> float32 out
    var order = PF.reversed(PF.argsort(eg.w)).subarray(0, n_comp);
    var E = new Float32Array(3 * n_comp);                    // evecs[:, order], row-major (3, n_comp)
    for (t = 0; t < 3; t++) for (j = 0; j < n_comp; j++) E[t * n_comp + j] = eg.v[t * 3 + order[j]];
    var comps = PF.matmulF32(x, n, 3, E, n_comp);            // (x @ evecs[:, order]) -> sgemm
    var C = n_comp, outd = comps;
    if (alpha !== null && alpha !== undefined && PF.std(alpha) > 2.0) {
      var am = PF.mean(alpha);
      C = n_comp + 1;
      outd = new Float32Array(n * C);
      for (i = 0; i < n; i++) {
        for (j = 0; j < n_comp; j++) outd[i * C + j] = comps[i * n_comp + j];
        outd[i * C + n_comp] = fr(alpha[i] - am);
      }
    }
    if (diag) { diag.mu = mu; diag.cov = cov; diag.evals = eg.w; diag.evecs = eg.v; diag.order = order; }
    return { d: outd, h: h, w: w, c: C };
  }

  /**
   * _prep(rgba) -> channel stack.
   * @param {{d: Uint8Array|Uint8ClampedArray, w, h, cn: 4}} rgba
   * @param {object} [opts] {rng, diag} - see _quantize
   */
  function _prep(rgba, opts) {
    check(rgba && rgba.d && rgba.cn === 4 && rgba.d.length === rgba.w * rgba.h * 4,
      '_prep: rgba must be {d, w, h, cn: 4} with d.length = w*h*4');
    opts = opts || {};
    var h = rgba.h, w = rgba.w, n = h * w, src = rgba.d, i, sc;
    var a = new Float32Array(n), rgb = new Float32Array(n * 3);
    for (i = 0; i < n; i++) a[i] = src[i * 4 + 3];
    for (i = 0; i < n; i++) {
      // rgba[..., :3].astype(np.float32) * (a[..., None] / 255.0): float32
      sc = SEM.alphaScaleF32 ? fr(a[i] / 255) : a[i] / 255;
      rgb[i * 3] = fr(src[i * 4] * sc);
      rgb[i * 3 + 1] = fr(src[i * 4 + 1] * sc);
      rgb[i * 3 + 2] = fr(src[i * 4 + 2] * sc);
    }
    var qd = opts.diag ? (opts.diag.quantize = {}) : null;
    var q = R._quantize(rgb, h, w, R.KMEANS_K, 48000, 0, { rng: opts.rng, diag: qd });
    var pd = opts.diag ? (opts.diag.pca = {}) : null;
    return R._pca_channels(q, h, w, a, 2, pd);
  }

  /* ================================================================== *
   * per-axis energy machinery
   * ================================================================== */

  /**
   * AxisData(ch, axis)
   * "Cumsum tables for one axis of a channel stack (rows subsampled).
   *  axis=0: analyze along the width (x); axis=1: transpose first (y)."
   */
  function AxisData(ch, axis) {
    need('linspace'); need('astypeInt'); need('cumsum'); need('add_reduceat'); need('sum');
    check(ch && ch.d instanceof Float32Array && ch.d.length === ch.h * ch.w * ch.c,
      'AxisData: ch must be {d: Float32Array(h*w*c), h, w, c}');
    check(axis === 0 || axis === 1, 'AxisData: axis must be 0 or 1');
    var C = ch.c, Hs = axis === 0 ? ch.h : ch.w, W = axis === 0 ? ch.w : ch.h;
    var rows, H, i, j, c, o, sp, v;
    if (Hs > R.MAX_ROWS) {
      rows = PF.astypeInt(PF.linspace(0, Hs - 1, R.MAX_ROWS));   // np.linspace(...).astype(int)
      H = R.MAX_ROWS;
    } else {
      rows = new Int32Array(Hs);
      for (i = 0; i < Hs; i++) rows[i] = i;
      H = Hs;
    }
    this.H = H; this.W = W; this.C = C;
    // img = ch or ch.transpose(1, 0, 2), then img[rows]
    var img = new Float32Array(H * W * C), sq = new Float32Array(H * W * C);
    for (i = 0, o = 0; i < H; i++) {
      for (j = 0; j < W; j++) {
        sp = (axis === 0 ? (rows[i] * ch.w + j) : (j * ch.w + rows[i])) * C;
        for (c = 0; c < C; c++, o++) { v = ch.d[sp + c]; img[o] = v; sq[o] = fr(v * v); }
      }
    }
    // channels are zero-mean (PCA), so float32 cumsums stay accurate
    var cs, cq;
    if (SEM.cumsumF32) {
      cs = PF.cumsum(img, [H, W, C], 1);
      cq = PF.cumsum(sq, [H, W, C], 1);
    } else {                                   // negative control: float64 accumulation, cast back
      cs = new Float32Array(PF.cumsum(new Float64Array(img), [H, W, C], 1));
      cq = new Float32Array(PF.cumsum(new Float64Array(sq), [H, W, C], 1));
    }
    var W1 = W + 1;
    this.S = new Float32Array(H * W1 * C);
    this.Q = new Float32Array(H * W1 * C);
    for (i = 0; i < H; i++) {
      this.S.set(cs.subarray(i * W * C, (i + 1) * W * C), (i * W1 + 1) * C);
      this.Q.set(cq.subarray(i * W * C, (i + 1) * W * C), (i * W1 + 1) * C);
    }
    // row blocks: phase freedom PERPENDICULAR to the analysis axis
    // (handles sprite rows at different offsets) is always safe.
    // Phase freedom ALONG the axis (column segments) absorbs step error
    // and biases the error minimum, so it is used only to LOCATE peaks
    // on wide images (where genuine drift prevents a global lock) and
    // is followed by phase-drift regression to de-bias the step.
    this.nbr = Math.max(1, Math.min(R.N_ROWBLOCKS, Math.floor(H / 48)));
    this.r_edges = PF.astypeInt(PF.linspace(0, H, this.nbr + 1));
    this._r_starts = this.r_edges.slice(0, this.nbr);           // r_edges[:-1]
    this.max_nbc = Math.max(1, Math.min(R.N_COLSEGS, Math.floor(W / 96)));
    this.seg = {};
    var Q = this.Q, S = this.S, nbc, c_edges, qcol, acc, a0, a1;
    for (nbc = 1; nbc <= this.max_nbc; nbc++) {
      c_edges = PF.astypeInt(PF.linspace(0, W, nbc + 1));
      // qcol = np.diff(Q[:, c_edges, :].astype(f64), axis=1).sum(2): the
      // float32 table values are exact in float64; the channel sum is a
      // last-axis pairwise (sequential below 8) sum from 0.
      qcol = new Float64Array(H * nbc);
      for (i = 0; i < H; i++) {
        for (j = 0; j < nbc; j++) {
          a0 = (i * W1 + c_edges[j]) * C; a1 = (i * W1 + c_edges[j + 1]) * C;
          acc = 0.0;
          for (c = 0; c < C; c++) acc = acc + (Q[a1 + c] - Q[a0 + c]);
          qcol[i * nbc + j] = acc;
        }
      }
      this.seg[nbc] = { c_edges: c_edges, q_t: PF.add_reduceat(qcol, [H, nbc], this._r_starts, 0).d };
    }
    // normalizer: total variance about per-rowblock means
    var q1 = this.seg[1].q_t, ce = this.seg[1].c_edges, en1 = new Float64Array(H), d;
    for (i = 0; i < H; i++) {
      a0 = (i * W1 + ce[0]) * C; a1 = (i * W1 + ce[1]) * C;
      acc = 0.0;
      for (c = 0; c < C; c++) { d = S[a1 + c] - S[a0 + c]; acc = acc + d * d; }
      en1[i] = acc / W;                                         // / float(W)
    }
    var red = PF.add_reduceat(en1, [H, 1], this._r_starts, 0).d;
    var tt = new Float64Array(this.nbr);
    for (i = 0; i < this.nbr; i++) tt[i] = PF.npMaximum(q1[i] - red[i], 1e-9);
    this.t_sum = PF.sum(tt);
  }

  /** "Segments hold >= min_cells cells so phase freedom can't overfit." */
  AxisData.prototype.nbc_for = function (s, min_cells) {
    if (min_cells === undefined || min_cells === null) min_cells = 15.0;
    return Math.trunc(PF.clipScalar(pyFloorDiv(this.W, min_cells * s), 1, this.max_nbc));
  };

  /**
   * energy_tiles_multi(s, phases, nbc) -> Float64Array (P, nbr, nbc) row-major
   * "Per-tile cell energies for several phases: (P, nbr, nbc).
   *
   *  Cell boundaries are FRACTIONAL: band sums come from linearly
   *  interpolated cumsums (an exact fractional box-downscale under a
   *  piecewise-constant image model).  Integer-rounded boundaries would
   *  systematically mismatch the unknown rasterization of the original
   *  upscale and shift the error minimum away from the true step."
   *
   * The reference materialises g (H x P(J+1) x C) and bs; this computes the
   * same float32 values per (row, phase) in the same order:
   *   B    = clip(phase + s*k, 0, W)                        float64
   *   wds  = float32(diff(B)); wds_safe = maximum(wds, fround(1e-3))
   *   i0   = int(clip(floor(B), 0, W-1)); f = float32(B - i0)
   *   g    = g0 + (g1 - g0) * f                             float32, 3 roundings
   *   en   = (sum_c float32(bs*bs)) / wds_safe              float32
   *   nbc == 1: en.sum(2) is a SEQUENTIAL float32 sum over J (en's memory
   *             layout decides that - see the loop), then a float64
   *             reduceat over row blocks;
   *   nbc  > 1: float32 reduceat over the column segments (cells whose
   *             centre falls past a segment edge go to the next segment;
   *             each segment is its first element + a pairwise sum of the
   *             rest, 360/360 rows measured on this layout), then the
   *             float64 reduceat over row blocks.
   */
  AxisData.prototype.energy_tiles_multi = function (s, phases, nbc) {
    var W = this.W, H = this.H, C = this.C, S = this.S, W1 = W + 1, nbr = this.nbr;
    check(this.seg[nbc], 'energy_tiles_multi: nbc ' + nbc + ' outside 1..' + this.max_nbc);
    var c_edges = this.seg[nbc].c_edges;
    var J = Math.ceil(W / s) + 2, P = phases.length, NB = J + 1;
    var B = new Float64Array(NB), wds = new Float32Array(J), i0 = new Int32Array(NB), f = new Float32Array(NB);
    var FLOOR = fr(1e-3);                                     // np.maximum(float32, 1e-3): the floor is float32
    var g = new Float32Array(NB * C), en = new Float32Array(J);
    var out = new Float64Array(P * nbr * nbc);
    var enRow = nbc === 1 ? new Float64Array(H * P) : null;
    var enSeg = nbc > 1 ? new Float64Array(H * nbc) : null;
    var idx = nbc > 1 ? new Int32Array(nbc) : null;
    var p, j, h, c, rowb, b0, g0, g1, e, bs, t, red, k;
    for (p = 0; p < P; p++) {
      for (j = 0; j < NB; j++) {
        // B = phases[:, None] + s * k[None, :], k = arange(-1, J); clip to [0, W]
        B[j] = PF.clipScalar(phases[p] + s * (j - 1), 0.0, W);
      }
      for (j = 0; j < J; j++) wds[j] = PF.npMaximum(fr(B[j + 1] - B[j]), FLOOR);
      for (j = 0; j < NB; j++) {
        i0[j] = Math.trunc(PF.clipScalar(Math.floor(B[j]), 0, W - 1));
        f[j] = fr(B[j] - i0[j]);
      }
      if (nbc > 1) {
        // centers = 0.5*(B[1:] + B[:-1]); splits = searchsorted(centers, c_edges[1:-1])
        var centers = new Float64Array(J);
        for (j = 0; j < J; j++) centers[j] = 0.5 * (B[j + 1] + B[j]);
        idx[0] = 0;
        for (k = 1; k < nbc; k++) idx[k] = PF.searchsorted(centers, c_edges[k]);
      }
      for (h = 0; h < H; h++) {
        rowb = h * W1;
        for (j = 0; j < NB; j++) {
          b0 = (rowb + i0[j]) * C;
          for (c = 0; c < C; c++) {
            g0 = S[b0 + c]; g1 = S[b0 + C + c];
            g[j * C + c] = fr(g0 + fr(fr(g1 - g0) * f[j]));
          }
        }
        for (j = 0; j < J; j++) {
          e = 0.0;
          for (c = 0; c < C; c++) { bs = fr(g[(j + 1) * C + c] - g[j * C + c]); e = fr(e + fr(bs * bs)); }
          en[j] = fr(e / wds[j]);
        }
        if (nbc === 1) {
          // en.sum(2) is a SEQUENTIAL float32 sum over J, not a pairwise one.
          // MEASURED: self.S[:, idx, :] (a fancy index on the middle axis)
          // comes back with H as its fastest memory axis (strides (8, 2880,
          // 4) on frog), numpy's K order carries that layout through g, bs
          // and en (strides (4, 178560, 1440)), so the reduced axis J is not
          // the fast one and the iterator adds whole H-runs elementwise, one
          // j at a time. Sequential matched 1632/1632 .. 4488/4488 (row,
          // phase) sums at four steps; the pairwise sum of the same row,
          // which a C-contiguous en would get, matched 246/1632.
          if (SEM.enRowSequential) {
            t = 0.0;
            for (j = 0; j < J; j++) t = fr(t + en[j]);
          } else {
            t = PF.pairwiseSum(en, 0, J, true);                // negative control only
          }
          enRow[h * P + p] = t;
        } else {
          for (k = 0; k < nbc; k++) {                            // np.add.reduceat(en[:, i, :], idx, axis=1)
            var st = idx[k], en2 = (k + 1 < nbc) ? idx[k + 1] : J;
            if (en2 <= st) t = en[st];
            else t = fr(en[st] + PF.pairwiseSum(en, st + 1, en2 - st - 1, true));
            enSeg[h * nbc + k] = t;
          }
        }
      }
      if (nbc > 1) {
        red = PF.add_reduceat(enSeg, [H, nbc], this._r_starts, 0).d;   // (nbr, nbc) float64
        out.set(red, p * nbr * nbc);
      }
    }
    if (nbc === 1) {
      red = PF.add_reduceat(enRow, [H, P], this._r_starts, 0).d;       // (nbr, P); .T -> (P, nbr, 1)
      for (p = 0; p < P; p++) for (t = 0; t < nbr; t++) out[p * nbr + t] = red[t * P + p];
    }
    return out;
  };

  /** "Phase samples ~0.5px apart (0.25px when dense), even count." */
  AxisData.prototype._n_phase = function (s, dense) {
    var n = Math.trunc(PF.clipScalar((dense ? 4.0 : 2.0) * s, 8, 40));
    return n & ~1;
  };

  function phaseGrid(s, n) {                 // np.arange(n) * (s / n)
    var ph = new Float64Array(n), step = s / n, i;
    for (i = 0; i < n; i++) ph[i] = i * step;
    return ph;
  }

  /**
   * eval_s(s, dense=False, nbc=1) -> [e_best, e_anti]
   * "(e_best, e_anti) at step s; per-(rowblock x segment) best phase.
   *  e_anti evaluates each tile at the anti-phase (best + s/2), the
   *  maximally-wrong phase.  Both normalized by total variance."
   */
  AxisData.prototype.eval_s = function (s, dense, nbc) {
    dense = !!dense;
    if (nbc === undefined || nbc === null) nbc = 1;
    var n = this._n_phase(s, dense);
    var phases = phaseGrid(s, n);
    var q_t = this.seg[nbc].q_t;
    var ens = this.energy_tiles_multi(s, phases, nbc);      // n x nbr x nbc
    var T = this.nbr * nbc, half = n >> 1, eB = new Float64Array(T), eR = new Float64Array(T);
    var t, p, ib, mp, v;
    for (t = 0; t < T; t++) {
      ib = 0; mp = ens[t];                                    // ens.argmax(0): first maximum
      for (p = 1; p < n; p++) { v = ens[p * T + t]; if (!(v <= mp)) { mp = v; ib = p; } }
      eB[t] = PF.npMaximum(q_t[t] - ens[ib * T + t], 0.0);
      eR[t] = PF.npMaximum(q_t[t] - ens[((ib + half) % n) * T + t], 0.0);
    }
    return [PF.sum(eB) / this.t_sum, PF.sum(eR) / this.t_sum];
  };

  /**
   * phase_regress(s0, n_iter=2)
   * "De-bias a step estimate from per-segment phase drift.
   *
   *  If the step is off by d, each segment's best phase advances
   *  linearly with position at slope d/s (clock recovery).  Fit the
   *  slope over unwrapped per-segment phases and correct s."
   * Returns a Python float in the reference (s = float(s0)), which is why
   * _detect_axis rounds its result with CPython's round, not numpy's.
   */
  AxisData.prototype.phase_regress = function (s0, n_iter) {
    need('sumAxes'); need('meanAxes'); need('average');
    if (n_iter === undefined || n_iter === null) n_iter = 2;
    var s = +s0, it, j, p;
    for (it = 0; it < n_iter; it++) {
      var nbc = this.nbc_for(s);
      if (nbc < 3) return s;
      var n = Math.trunc(PF.clipScalar(4.0 * s, 16, 48)) & ~1;
      var phases = phaseGrid(s, n);
      var ens = this.energy_tiles_multi(s, phases, nbc);    // n x nbr x nbc
      var seg = PF.sumAxes(ens, [n, this.nbr, nbc], 1).d;   // n x nbc
      var phi = new Float64Array(nbc), w = new Float64Array(nbc);
      var mean = PF.meanAxes(seg, [n, nbc], 0).d;
      for (j = 0; j < nbc; j++) {
        var ip = 0, mp = seg[j], mx = seg[j], v;
        for (p = 1; p < n; p++) {
          v = seg[p * nbc + j];
          if (!(v <= mp)) { mp = v; ip = p; }                 // seg.argmax(0)
          mx = PF.npMaximum(mx, v);                           // seg.max(0)
        }
        phi[j] = phases[ip];
        w[j] = PF.npMaximum(mx - mean[j], 1e-12);             // segment contrast
      }
      // unwrap (mod s) across segments
      var un = new Float64Array(nbc);
      un[0] = phi[0];
      for (j = 1; j < nbc; j++) {
        var d = pyMod(phi[j] - phi[j - 1] + 0.5 * s, s) - 0.5 * s;
        un[j] = un[j - 1] + d;
      }
      var c_edges = this.seg[nbc].c_edges, xs = new Float64Array(nbc);
      for (j = 0; j < nbc; j++) xs[j] = 0.5 * (c_edges[j + 1] + c_edges[j]);
      var xm = PF.average(xs, w);
      var pm = PF.average(un, w);
      var dx2 = new Float64Array(nbc), prod = new Float64Array(nbc), dx;
      for (j = 0; j < nbc; j++) { dx = xs[j] - xm; dx2[j] = dx * dx; }
      var denom = PF.average(dx2, w);
      if (denom <= 0) return s;
      for (j = 0; j < nbc; j++) prod[j] = (xs[j] - xm) * (un[j] - pm);
      var slope = PF.average(prod, w) / denom;
      slope = PF.clipScalar(slope, -0.02, 0.02);
      s = s * (1.0 + slope);
    }
    return s;
  };

  AxisData.prototype.best_global_phase = function (s) {
    var n = this._n_phase(s, true);
    var phases = phaseGrid(s, n);
    var ens = this.energy_tiles_multi(s, phases, 1);       // n x nbr x 1
    var nbr = this.nbr, tot = new Float64Array(n), p, r, acc;
    // .sum((1, 2)) over nbr <= 5 values: pairwise below 8 is sequential from 0
    for (p = 0; p < n; p++) { acc = 0.0; for (r = 0; r < nbr; r++) acc = acc + ens[p * nbr + r]; tot[p] = acc; }
    return phases[PF.argmax(tot)];
  };

  /* ================================================================== *
   * search logic
   * ================================================================== */

  function _s_grid(w) {
    var smax = pyMin(R.S_MAX, w / 8.0);
    var n = Math.trunc(Math.ceil(npLog(smax / R.S_MIN) / npLog(R.S_RATIO)));
    var out = new Float64Array(Math.max(0, n + 1)), i;
    // S_RATIO ** np.arange(n+1) is the UCRT pow; Math.pow(1.025, i) equals it
    // for every i in 0..110 (measured), and n <= 110 because smax <= 24.
    for (i = 0; i <= n; i++) out[i] = R.S_MIN * Math.pow(R.S_RATIO, i);
    return out;
  }

  function _coarse_curves(ad, s_list) {
    var n = s_list.length, eb = new Float64Array(n), er = new Float64Array(n), i, e;
    for (i = 0; i < n; i++) { e = ad.eval_s(s_list[i]); eb[i] = e[0]; er[i] = e[1]; }
    return [eb, er];
  }

  /** "Running median of coarse error vs s = misaligned-baseline error." */
  function _trend_fn(s_list, eb) {
    need('median'); need('interp');
    var n = s_list.length, ls = new Float64Array(n), trend = new Float64Array(n), i, j, sel;
    for (i = 0; i < n; i++) ls[i] = npLog(s_list[i]);
    for (i = 0; i < n; i++) {
      sel = [];
      for (j = 0; j < n; j++) if (Math.abs(ls[j] - ls[i]) <= 0.14) sel.push(eb[j]);
      trend[i] = PF.median(new Float64Array(sel), 'f8');
    }
    for (i = 0; i < n; i++) trend[i] = PF.npMaximum(trend[i], 1e-6);
    var fn = function (s) { return PF.interp(npLog(s), ls, trend); };
    fn.ls = ls; fn.trend = trend;                            // for the parity test
    return fn;
  }

  /**
   * "Distillability score: anti-phase penalty x alignment advantage.
   *
   *  (er - eb) is how much reconstruction degrades when the grid phase is
   *  maximally wrong (zero below the true step, large at it).  The trend
   *  factor measures how far the aligned error drops below the misaligned
   *  baseline; multiples of the true step have eb ~ trend and die here."
   */
  function _score(eb, er, trend_e) {
    return pyMax(er - eb, 0.0) * pyMax(1.0 - eb / trend_e, 0.0);
  }

  /* list.sort(reverse=True) of (score, s) tuples: descending by score, then
   * by s; stable for equal tuples. */
  function _peaks(s_list, score, k) {
    if (k === undefined || k === null) k = 6;
    var cand = [], n = s_list.length, i;
    for (i = 0; i < n; i++) {
      if (score[i] >= score[Math.max(0, i - 1)] && score[i] >= score[Math.min(n - 1, i + 1)]) {
        cand.push([score[i], s_list[i], cand.length]);
      }
    }
    cand.sort(function (a, b) {
      if (a[0] > b[0]) return -1;
      if (a[0] < b[0]) return 1;
      if (a[1] > b[1]) return -1;
      if (a[1] < b[1]) return 1;
      return a[2] - b[2];
    });
    var out = [];
    for (i = 0; i < Math.min(k, cand.length); i++) out.push(cand[i][1]);
    return out;
  }

  /** "Dense local search maximizing the score (locks grid alignment)."
   *  -> [score, s, eb, er] */
  function _refine(ad, s0, smax, trend, span, seg) {
    if (span === undefined || span === null) span = 0.035;
    seg = !!seg;
    var best = [-1.0, s0, 1.0, 1.0];
    var rounds = [[span, 9], [0.008, 7]], rnd, i, s, nbc, e, sc;
    for (rnd = 0; rnd < 2; rnd++) {
      var sp = rounds[rnd][0], npts = rounds[rnd][1];
      var center = rnd ? best[1] : s0;
      var lin = PF.linspace(1 - sp, 1 + sp, npts);
      for (i = 0; i < npts; i++) {
        s = center * lin[i];
        if (s < 1.2 || s > smax * 1.02) continue;
        nbc = seg ? ad.nbc_for(s) : 1;
        e = ad.eval_s(s, rnd === 1, nbc);
        sc = R._score(e[0], e[1], trend(s));
        if (sc > best[0]) best = [sc, s, e[0], e[1]];
      }
    }
    return best;  // score, s, eb, er
  }

  /* sorted(values, key=lambda t: -t[0]): stable, descending score. */
  function sortByNegScore(vals) {
    var tagged = vals.map(function (v, i) { return [v, i]; });
    tagged.sort(function (a, b) {
      var ka = -a[0][0], kb = -b[0][0];
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a[1] - b[1];
    });
    return tagged.map(function (t) { return t[0]; });
  }

  /** "Coarse scan + refined candidates incl. harmonics of the leaders."
   *  -> [table, trend]; table is the dict as [{key, val: [sc, s, b, r]}] in
   *  insertion order. */
  function _build_table(ad, size) {
    var s_list = R._s_grid(size);
    var ce = R._coarse_curves(ad, s_list), eb = ce[0], er = ce[1];
    var trend = R._trend_fn(s_list, eb);
    var n = s_list.length, score = new Float64Array(n), i;
    for (i = 0; i < n; i++) score[i] = R._score(eb[i], er[i], trend(s_list[i]));
    var smax = s_list[n - 1];
    var table = [];

    function add(s0, span) {
      if (span === undefined) span = 0.035;
      var i2;
      for (i2 = 0; i2 < table.length; i2++) {
        if (Math.abs(table[i2].key - s0) / s0 < 0.03) return table[i2].val;
      }
      var r = R._refine(ad, s0, smax, trend, span);
      var s = r[1];
      for (i2 = 0; i2 < table.length; i2++) {
        if (Math.abs(table[i2].key - s) / s < 0.02) {
          if (r[0] > table[i2].val[0]) table[i2].val = r;
          return table[i2].val;
        }
      }
      // table[round(s, 2)] = ...: s is an np.float64 here (a linspace
      // product, or s0 which is one), so this is numpy's round. Assigning
      // an existing key keeps its dict slot.
      var key = npRound(s, 2);
      for (i2 = 0; i2 < table.length; i2++) if (table[i2].key === key) { table[i2].val = r; return r; }
      table.push({ key: key, val: r });
      return r;
    }

    var pk = R._peaks(s_list, score, 5);
    var smx = score[0];
    for (i = 1; i < n; i++) smx = PF.npMaximum(smx, score[i]);     // score.max()
    var sc_gate = 0.2 * pyMax(smx, 1e-9);
    for (i = 0; i < pk.length; i++) {
      if (i === 0 || PF.interp(pk[i], s_list, score) >= sc_gate) add(pk[i]);
    }
    var leaders = sortByNegScore(table.map(function (e) { return e.val; })).slice(0, 2);
    var li, mi, ms, st;
    for (li = 0; li < leaders.length; li++) {
      ms = li === 0 ? [2.0, 0.5, 3.0] : [2.0, 0.5];
      for (mi = 0; mi < ms.length; mi++) {
        st = leaders[li][1] * ms[mi];
        if (R.S_MIN * 0.9 <= st && st <= smax) add(st, 0.05);
      }
    }
    return [table, trend];
  }

  /** "Global-phase micro-refine: minimize aligned error, tight window."
   *  -> [s, e] */
  function _align(ad, s, smax) {
    var best = [Infinity, s], lin = PF.linspace(0.992, 1.008, 9), i, s2, e;
    for (i = 0; i < 9; i++) {
      s2 = s * lin[i];
      if (s2 < 1.2 || s2 > smax * 1.02) continue;
      e = ad.eval_s(s2, true);
      if (e[0] < best[0]) best = [e[0], s2];
    }
    return [best[1], best[0]];
  }

  /** -> [s_ax, sc_ax, eb_ax, cands, trend] */
  function _detect_axis(ad, size) {
    var bt = R._build_table(ad, size), table = bt[0], trend = bt[1];
    var items = sortByNegScore(table.map(function (e) { return e.val; }));
    var sc_ax = items[0][0], s_ax = items[0][1], eb_ax = items[0][2];
    // candidate final steps: table winner, drift-regressed, micro-locked;
    // decided by global-phase reconstruction error
    var s_reg = ad.phase_regress(s_ax);
    // {round(s_ax, 4), round(s_reg, 4)}: s_ax is np.float64 (numpy round),
    // s_reg a Python float (CPython round). A set: equal values collapse,
    // and it is iterated in CPython's hash order (pySetOrder2) - which
    // orders the _align calls but cannot change min() over the tuples.
    var starts = pySetOrder2(npRound(s_ax, 4), PF.pyRound(s_reg, 4));
    var fin = null, i, a;
    for (i = 0; i < starts.length; i++) {
      a = R._align(ad, starts[i], size / 8.0);
      var cand = [a[1], a[0]];                              // (e_gl, s_gl)
      if (fin === null || cand[0] < fin[0] || (cand[0] === fin[0] && cand[1] < fin[1])) fin = cand;
    }
    s_ax = fin[1];
    var cands = [];
    for (i = 0; i < Math.min(8, items.length); i++) cands.push([items[i][1], items[i][0]]);
    return [s_ax, sc_ax, eb_ax, cands, trend];
  }

  /* ================================================================== *
   * detect
   * ================================================================== */

  /**
   * detect(rgba[, opts]) -> {step_x, step_y, cols, rows, phase_x, phase_y,
   *   conf_x, conf_y, candidates: [[s, score], ...]}
   * opts.rng: see THE RNG in the header.
   */
  function detect(rgba, opts) {
    var ch = R._prep(rgba, opts);
    var H = rgba.h, W = rgba.w;
    var adx = new R.AxisData(ch, 0);
    var ady = new R.AxisData(ch, 1);
    var X = R._detect_axis(adx, W), Y = R._detect_axis(ady, H);
    var sx = X[0], cx = X[1], candx = X[3], trend_x = X[4];
    var sy = Y[0], cy = Y[1], candy = Y[3], trend_y = Y[4];

    // cross-axis rescue: a weak axis borrows the strong axis' step and
    // re-fits it locally (segment-phase freedom + drift regression); the
    // replacement must beat the axis' own step under the GLOBAL score,
    // which protects genuinely non-square grids from false adoption.
    function _gscore(ad, s, trend) {
      var e = ad.eval_s(s, true);
      return R._score(e[0], e[1], trend(s));
    }
    function _rescue(ad, s_strong, smax, trend) {
      var r = R._refine(ad, s_strong, smax, trend, 0.05, true);
      return ad.phase_regress(r[1]);
    }

    var smax_x = pyMin(R.S_MAX, W / 8.0);
    var smax_y = pyMin(R.S_MAX, H / 8.0);
    var s2;
    if (cx < 0.01 && cy > 2 * cx && Math.abs(sx - sy) / pyMax(sx, sy) > 0.04) {
      s2 = _rescue(adx, sy, smax_x, trend_x);
      if (_gscore(adx, s2, trend_x) > _gscore(adx, sx, trend_x)) sx = s2;
    } else if (cy < 0.01 && cx > 2 * cy && Math.abs(sy - sx) / pyMax(sx, sy) > 0.04) {
      s2 = _rescue(ady, sx, smax_y, trend_y);
      if (_gscore(ady, s2, trend_y) > _gscore(ady, sy, trend_y)) sy = s2;
    }

    var all = candx.concat(candy).map(function (t, i) { return [t, i]; });
    all.sort(function (a, b) {                              // sorted(key=lambda t: -t[1]), stable
      var ka = -a[0][1], kb = -b[0][1];
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a[1] - b[1];
    });
    return {
      step_x: sx, step_y: sy,
      cols: PF.rint(W / sx), rows: PF.rint(H / sy),
      phase_x: adx.best_global_phase(sx),
      phase_y: ady.best_global_phase(sy),
      conf_x: cx, conf_y: cy,
      candidates: all.slice(0, 8).map(function (t) { return t[0]; })
    };
  }

  R.S_MIN = 1.6;
  R.S_MAX = 24.0;
  R.S_RATIO = 1.025;          // coarse geometric s grid spacing
  R.MAX_ROWS = 360;           // row subsampling cap
  R.N_ROWBLOCKS = 5;          // per-tile phase freedom (rows)
  R.N_COLSEGS = 8;            // max column segments (peak-locating tier only)
  R.KMEANS_K = 14;
  R.C_FLOOR = 0.012;          // contrast below this = "no grid signal" (defined, never read, in the reference too)
  R._quantize = _quantize;
  R._pca_channels = _pca_channels;
  R._prep = _prep;
  R.AxisData = AxisData;
  R._s_grid = _s_grid;
  R._coarse_curves = _coarse_curves;
  R._trend_fn = _trend_fn;
  R._score = _score;
  R._peaks = _peaks;
  R._refine = _refine;
  R._build_table = _build_table;
  R._align = _align;
  R._detect_axis = _detect_axis;
  R.detect = detect;
  // scalar semantics, exposed for the parity test and for a reader
  R._log = crLog;
  R._npLog = npLog;
  R._npRound = npRound;
  R._pyFloorDiv = pyFloorDiv;
  R._pyMod = pyMod;
  R._pySetOrder2 = pySetOrder2;
  R._semantics = SEM;
  PF.versionReconsearch = 'pf-41-reconsearch/1';
})();
