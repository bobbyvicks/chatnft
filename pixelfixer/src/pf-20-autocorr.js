/* pf-20-autocorr.js - port of pixelfixer/autocorr.py (459 lines).
 *
 * Grid detection via banded autocorrelation + cepstrum of derivative
 * profiles.  Family: translation-invariant period estimators (ACF /
 * cepstrum).
 *
 * Pipeline per axis (reference docstring, kept because it says WHY):
 * 1. Feature maps: |2nd difference| of gray (impulses at knots even for
 *    bilinear/bicubic ramps) and |1st difference| of median+quantized gray.
 * 2. Project each map into row-band profiles (sum over `band` lines) - the
 *    lattice boundary positions are shared across lines inside a band, so
 *    projection amplifies them over per-cell random texture.
 * 3. ACF of each band profile (FFT, zero-padded, unbiased), averaged over
 *    bands -> translation-invariant across bands, robust to per-region phase.
 * 4. Comb-minus-anticomb score over a fine fractional step grid, plus an
 *    averaged-cepstrum vote; subharmonic suppression at selection time.
 *
 * No imports, no exports, no build step: browser + node, ES2017.  Reads and
 * writes exactly one global, PF.  Needs, in load order, pf-00-base.js
 * (arange, linspace, clip, argmax, median, rint, pairwiseSum, exp, log,
 * logF32), pf-01-fft.js (rfftRows, irfftRows, irfft), pf-02-scipy.js
 * (_scipyInternals.argsortNumpy - the dispatched np.argsort tie order) and
 * pf-03-cv2.js (medianBlur).  Exposed as the namespace PF.autocorr with the
 * reference's function names, which is the contract pf-50-core.js reads.
 *
 * Representations
 *   rgba image  {d: Uint8Array|Uint8ClampedArray (w*h*4, interleaved), w, h}
 *   float map   {d: Float32Array (w*h, row-major), w, h}      (H, W) in numpy
 *   profile     {d: Float32Array (rows*cols, row-major), rows, cols, forder}
 *   maps        [[map, weight], ...]  mirroring the reference's list of tuples
 *   estimate    [step, cands, acf]    mirroring the (step, candidates, acf)
 *               tuple; cands is [[s, z], ...]
 *
 * ------------------------------------------------------------------------
 * DTYPE POLICY - measured on numpy 2.5.3 (tools/probe-autocorr-dtypes.py),
 * not assumed:
 *
 *   to_gray, d1_along, d2_along, median_quant, band_profiles are float32
 *   end to end (NEP 50: the Python-float constants are weak and cast to
 *   float32).  Every +,-,*,/ on float32 operands is reproduced as
 *   Math.fround(op in float64), which is the correctly rounded float32
 *   result (double rounding is innocuous for those ops because 53 >= 2*24+2).
 *
 *   band_acf runs float32 (complex64 through np.fft - numpy 2.x does not
 *   upcast) until the unbiased-ACF line `ac * (n / clip(n - lags, 1))`, where
 *   the float64 `lags` promote it; the returned ACF is float64.
 *   band_cepstrum is float32 throughout; ceps_score reads it as float32 and
 *   computes in float64 (float32 array * float64 array).
 *   Everything from comb_score on is float64.
 *
 * SUMMATION ORDER - numpy's reduction order follows MEMORY LAYOUT, not the
 * logical axis.  A reduce whose axis is the fastest in memory is numpy's
 * pairwise sum (PF.pairwiseSum: 8 accumulators up to 128, then recursive
 * halving); any other reduce axis is a plain sequential accumulate.  The
 * axis=0 path goes through `feat.T`, so band_profiles' output there is
 * F-ORDERED (numpy allocates reduction outputs in the input's stride order)
 * and every downstream reduction flips order.  Measured (probe, mid.png):
 *   band_profiles  axis=1: sequential 510/510   axis=0: pairwise 510/510
 *   prof.mean(1)   axis=1: pairwise 8/8         axis=0: sequential 8/8
 *   p.sum(1)       axis=1: pairwise (test-fft)  axis=0: sequential (test-fft)
 *   acf.sum(0)     axis=1: sequential 204/204   axis=0: pairwise 204/204
 * A (1, n) profile (band == n_lines) has its unit axis dropped by the
 * iterator, so it behaves as C-order whatever produced it; hence
 * forder = (axis === 0 && rows > 1).  The parity fixture pins all of this
 * per image, axis and band.
 *
 * (F * conj(F)).real on complex64 is x*x - y*(-y) with the second product
 * rounded to float32 and the subtraction FUSED (measured 0/5000 mismatches
 * for fround(x*x + fround(y*y)); the naive form misses 826/5000).
 *
 * np.log on FLOAT32 is NOT the correctly rounded log: on this (MSVC, AVX2+
 * FMA3) build it is numpy's own SIMD rational approximation, up to 3 ULP
 * off, used for every length including scalars (measured 0 disagreements
 * between n=1 and n=200000 paths).  PF.logF32 ports that algorithm.
 *
 * np.exp / np.log on FLOAT64 are the UCRT libm (0/2000 differences vs
 * math.exp/math.log).  V8's Math.exp / Math.log differ from it by 1 ulp on
 * ~9% / ~5% of arguments, so:
 *   - the 72 fixed comb weights exp(-(k-1)/k0), k0 in {12, 8, 3}, are a
 *     TABLE of the reference's values (Math.exp misses 6 of them; even a
 *     correctly rounded exp misses 1, because the UCRT is itself not
 *     correctly rounded there - measured against Decimal);
 *   - arbitrary-argument calls (train_quality's exp(-4*rms), detect's
 *     log(sx/sy)) use PF.exp / PF.log, correctly rounded double-double
 *     implementations that match the UCRT wherever it is correctly rounded
 *     (3560/3572 and 4996/5000 of the probe samples).
 *
 * phase_count is defined but never called (not by detect, not by core.py);
 * ported for the call graph.  Its np.convolve of a complex kernel goes
 * through CDOUBLE_dot -> OpenBLAS zdotu, whose accumulation order is not
 * reproducible, and np.angle / np.abs are the UCRT atan2 / hypot which V8
 * does not match bit for bit; tools/test-autocorr.js measures the gap.
 * ------------------------------------------------------------------------
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var A = {};
  PF.autocorr = A;

  var fr = Math.fround;

  var MIN_STEP = 2.0;
  var MAX_STEP = 24.0;
  var STEP_GRID = 0.02;
  var BAND = 24;
  A.MIN_STEP = MIN_STEP; A.MAX_STEP = MAX_STEP; A.STEP_GRID = STEP_GRID; A.BAND = BAND;

  function need(name, where) {
    if (typeof PF[name] !== 'function') {
      throw new Error('PF.autocorr: PF.' + name + ' is missing - load ' + where + ' before pf-20-autocorr.js');
    }
  }
  // Resolved lazily so load order inside the src/ set does not matter until
  // the first call, but a missing shim is an instrument failure, not a
  // "detector failed on this image".
  function deps() {
    need('pairwiseSum', 'pf-00-base.js (v2+)');
    need('exp', 'pf-00-base.js (v3+)');
    need('log', 'pf-00-base.js (v3+)');
    need('logF32', 'pf-00-base.js (v3+)');
    need('rfftRows', 'pf-01-fft.js');
    need('irfftRows', 'pf-01-fft.js');
    need('irfft', 'pf-01-fft.js');
    need('medianBlur', 'pf-03-cv2.js');
    if (!PF._scipyInternals || typeof PF._scipyInternals.argsortNumpy !== 'function') {
      throw new Error('PF.autocorr: PF._scipyInternals.argsortNumpy is missing - load pf-02-scipy.js');
    }
  }

  // Python's max(a, b) / min(a, b): keep the FIRST argument unless the
  // second is strictly greater / smaller.  Not Math.max: max(nan, 1e-12)
  // is nan in Python and 1e-12... no, NaN in Math.max too, but
  // max(1e-12, nan) is 1e-12 in Python and NaN in Math.max.
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }
  A._pyMax = pyMax; A._pyMin = pyMin;

  // np.clip(x, lo, hi) on a scalar: the fused two-sided ufunc (keeps the
  // LEFT operand on ties, propagates a NaN bound).  PF.clipScalar has the
  // same semantics; a local alias keeps the hot loops free of a lookup.
  function clip2(x, lo, hi) {
    var t = (lo !== lo) ? lo : ((x < lo) ? lo : x);
    return (hi !== hi) ? hi : ((hi < t) ? hi : t);
  }
  // np.clip(x, 0, None) == np.maximum(x, 0): NaN propagates.
  function clip0(x) { return (x !== x) ? x : ((x > 0) ? x : 0); }

  // np.max / ndarray.max(): maximum.reduce - a NaN anywhere wins.
  function npMax(a) {
    var m = a[0];
    if (m !== m) return m;
    for (var i = 1; i < a.length; i++) {
      var v = a[i];
      if (v !== v) return v;
      if (v > m) m = v;
    }
    return m;
  }

  function checkMap(m, what) {
    if (!m || !(m.d instanceof Float32Array) || !(m.w > 0) || !(m.h > 0) || m.d.length !== m.w * m.h) {
      throw new Error(what + ': expected a float32 map {d: Float32Array(w*h), w, h}');
    }
  }

  /* ---------------------------------------------------------------- *
   * exp(-(k-1)/k0) weight tables, k = 1..24.
   *
   * These are the values numpy 2.5.3 on the reference machine returns for
   * np.exp(-(k - 1) / k0) (the UCRT libm).  They are kept as a table, not
   * recomputed, because V8's Math.exp gives a different last bit on 6 of
   * the 72 (measured: k0=12 -> k=3,14,20,22; k0=8 -> k=4,15) and even a
   * correctly rounded exp differs on one (the UCRT is not correctly rounded
   * at k0=12, k=13 - checked against Decimal at 60 digits).  Every comb,
   * anti-comb and cepstrum score is a weighted sum with these, so a last-bit
   * change here moves every score.  tools/test-autocorr.js asserts the
   * table against a fresh numpy dump and prints how many entries Math.exp
   * and PF.exp would get wrong, so the reason for the table stays measured.
   * ---------------------------------------------------------------- */
  var EXP_W = {
    12: [1.0, 0.9200444146293233, 0.8464817248906141, 0.7788007830714049,
         0.7165313105737893, 0.6592406302004438, 0.6065306597126334, 0.5580351369545137,
         0.513417119032592, 0.4723665527410147, 0.4345982085070782, 0.3998496398019452,
         0.3678794411714424, 0.33846616440026467, 0.3114049631818977, 0.2865047968601901,
         0.2635971381157267, 0.24252102316119795, 0.22313016014842982, 0.2052899164818021,
         0.18887560283756186, 0.17377394345044514, 0.15987965473646407, 0.14709628588453375],
    8:  [1.0, 0.8824969025845955, 0.7788007830714049, 0.6872892787909722,
         0.6065306597126334, 0.5352614285189903, 0.4723665527410147, 0.4168620196785084,
         0.36787944117144233, 0.32465246735834974, 0.2865047968601901, 0.25283959580474646,
         0.22313016014842982, 0.19691167520419406, 0.17377394345044514, 0.15335496684492847,
         0.1353352832366127, 0.11943296826671962, 0.10539922456186433, 0.0930144907230698,
         0.0820849986238988, 0.07243975703425146, 0.06392786120670757, 0.05641613950377735],
    3:  [1.0, 0.7165313105737893, 0.513417119032592, 0.36787944117144233,
         0.2635971381157267, 0.18887560283756186, 0.1353352832366127, 0.09697196786440505,
         0.06948345122280154, 0.04978706836786394, 0.03567399334725241, 0.02556130619006133,
         0.01831563888873418, 0.013123954247762985, 0.009404082498478744, 0.006737946999085467,
         0.004827815409245329, 0.0034592129964622137, 0.0024787521766663585, 0.0017760737119298293,
         0.0012726088735225962, 0.0009118819655545162, 0.0006533909105918459, 0.00046819160265879855]
  };
  A._EXP_W = EXP_W;

  // w = np.exp(-(k - 1) / k0) for k = 1..K
  function expWeights(K, k0) {
    var out = new Float64Array(K), i;
    var tab = EXP_W[k0];
    if (tab && K <= 24) {
      for (i = 0; i < K; i++) out[i] = tab[i];
    } else {
      for (i = 0; i < K; i++) out[i] = PF.exp(-i / k0);   // -(k-1)/k0 with k-1 == i, exact
    }
    return out;
  }
  A._expWeights = expWeights;

  /* ================================================================ *
   * features
   * ================================================================ */

  /**
   * to_gray(rgba) -> float32 map.
   *   rgb = rgba[..., :3].astype(float32); a = rgba[..., 3:4].astype(float32) / 255.0
   *   g = 0.299*r + 0.587*g + 0.114*b            (all float32, left to right)
   *   return g * a + 127.5 * (1.0 - a)
   * The Python-float constants are cast to float32 before the multiply
   * (NEP 50), so the coefficients are fround(0.299) etc.  g never exceeds
   * 255.0 (measured over all 2^24 rgb at a=255: max 255.000000000).
   */
  A.to_gray = function to_gray(rgba) {
    if (!rgba || !rgba.d || !(rgba.w > 0) || !(rgba.h > 0) || rgba.d.length !== rgba.w * rgba.h * 4) {
      throw new Error('PF.autocorr.to_gray: rgba must be {d: Uint8Array(w*h*4), w, h}');
    }
    var w = rgba.w, h = rgba.h, d = rgba.d, n = w * h;
    var out = new Float32Array(n);
    var c0 = fr(0.299), c1 = fr(0.587), c2 = fr(0.114);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var r = d[j], gg = d[j + 1], b = d[j + 2];
      var a = fr(d[j + 3] / 255.0);
      var g = fr(fr(fr(c0 * r) + fr(c1 * gg)) + fr(c2 * b));
      out[i] = fr(fr(g * a) + fr(127.5 * fr(1.0 - a)));
    }
    return { d: out, w: w, h: h };
  };

  /**
   * d1_along(g, axis): np.pad(np.abs(np.diff(g, axis=axis)), (0,1) on axis).
   * axis=1 differences along a row (x), axis=0 down a column (y).  float32.
   */
  A.d1_along = function d1_along(g, axis) {
    checkMap(g, 'PF.autocorr.d1_along');
    var w = g.w, h = g.h, s = g.d, out = new Float32Array(w * h), x, y, o;
    if (axis === 1) {
      for (y = 0; y < h; y++) {
        o = y * w;
        for (x = 0; x + 1 < w; x++) out[o + x] = Math.abs(fr(s[o + x + 1] - s[o + x]));
        // last column stays 0 (the pad)
      }
    } else if (axis === 0) {
      for (y = 0; y + 1 < h; y++) {
        o = y * w;
        for (x = 0; x < w; x++) out[o + x] = Math.abs(fr(s[o + w + x] - s[o + x]));
      }
    } else {
      throw new Error('PF.autocorr.d1_along: axis must be 0 or 1');
    }
    return { d: out, w: w, h: h };
  };

  /**
   * d2_along(g, axis): np.pad(np.abs(np.diff(g, n=2, axis=axis)), (1,1)).
   * np.diff(n=2) is two successive float32 first differences, each rounded.
   * Needs at least 3 samples along the axis, or numpy's output shape would
   * not match the input's; that is an instrument failure here, so it throws.
   */
  A.d2_along = function d2_along(g, axis) {
    checkMap(g, 'PF.autocorr.d2_along');
    var w = g.w, h = g.h, s = g.d, out = new Float32Array(w * h), x, y, o, d0, d1;
    if (axis === 1) {
      if (w < 3) throw new Error('PF.autocorr.d2_along: width ' + w + ' < 3');
      for (y = 0; y < h; y++) {
        o = y * w;
        for (x = 0; x + 2 < w; x++) {
          d0 = fr(s[o + x + 1] - s[o + x]);
          d1 = fr(s[o + x + 2] - s[o + x + 1]);
          out[o + x + 1] = Math.abs(fr(d1 - d0));
        }
      }
    } else if (axis === 0) {
      if (h < 3) throw new Error('PF.autocorr.d2_along: height ' + h + ' < 3');
      for (y = 0; y + 2 < h; y++) {
        o = y * w;
        for (x = 0; x < w; x++) {
          d0 = fr(s[o + w + x] - s[o + x]);
          d1 = fr(s[o + 2 * w + x] - s[o + w + x]);
          out[o + w + x] = Math.abs(fr(d1 - d0));
        }
      }
    } else {
      throw new Error('PF.autocorr.d2_along: axis must be 0 or 1');
    }
    return { d: out, w: w, h: h };
  };

  /**
   * median_quant(g): cv2.medianBlur(g.astype(uint8), 3).astype(float32),
   * then np.round(m / 12.0) * 12.0 in float32 (np.round is rint: half to
   * even, and m/12 lands on exact .5 for m = 6, 18, 30, ...).
   * The float32 -> uint8 cast is C truncation toward zero; g is in
   * [0, 255] so it never wraps (measured), but `& 255` keeps the C
   * semantics if it ever did.
   */
  A.median_quant = function median_quant(g) {
    checkMap(g, 'PF.autocorr.median_quant');
    deps();
    var n = g.w * g.h, i;
    var u8 = new Uint8Array(n);
    for (i = 0; i < n; i++) u8[i] = Math.trunc(g.d[i]) & 255;
    var m = PF.medianBlur({ d: u8, w: g.w, h: g.h }, 3).d;
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = fr(PF.rint(fr(m[i] / 12.0)) * 12.0);
    return { d: out, w: g.w, h: g.h };
  };

  /* ================================================================ *
   * ACF / cepstrum
   * ================================================================ */

  /**
   * band_profiles(feat, axis, band=BAND): sum feature over bands of `band`
   * lines -> (n_bands, extent).
   *   x = feat if axis == 1 else feat.T
   *   nb = max(1, x.shape[0] // band); x = x[:nb*band]
   *   return x.reshape(nb, -1, x.shape[1]).sum(1)
   * axis=1: lines are rows, extent is the width; the reduce runs over rows
   *         with the row axis outer -> sequential float32.
   * axis=0: lines are columns, extent is the height; the reduce runs over
   *         `band` CONTIGUOUS pixels of a row -> pairwise float32, and the
   *         output is F-ordered (see the header).
   * When band > lines, nb is forced to 1 and the single band holds only the
   * `lines` that exist (x[:band] is short).
   */
  A.band_profiles = function band_profiles(feat, axis, band) {
    checkMap(feat, 'PF.autocorr.band_profiles');
    if (band === undefined || band === null) band = BAND;
    band = band | 0;
    if (!(band >= 1)) throw new Error('PF.autocorr.band_profiles: band must be >= 1');
    var w = feat.w, h = feat.h, s = feat.d;
    var lines = (axis === 1) ? h : w;
    var extent = (axis === 1) ? w : h;
    var nb = Math.floor(lines / band);
    var per = band;
    if (nb < 1) { nb = 1; per = lines; }
    var out = new Float32Array(nb * extent);
    var b, j, k, o, acc;
    if (axis === 1) {
      for (b = 0; b < nb; b++) {
        o = b * extent;
        for (k = 0; k < extent; k++) {
          acc = 0.0;                                   // reduce starts at the identity
          for (j = 0; j < per; j++) acc = fr(acc + s[(b * band + j) * w + k]);
          out[o + k] = acc;
        }
      }
    } else if (axis === 0) {
      for (b = 0; b < nb; b++) {
        o = b * extent;
        for (k = 0; k < extent; k++) {
          out[o + k] = PF.pairwiseSum(s, k * w + b * band, per, true);
        }
      }
    } else {
      throw new Error('PF.autocorr.band_profiles: axis must be 0 or 1');
    }
    return { d: out, rows: nb, cols: extent, forder: (axis === 0 && nb > 1) };
  };

  // float32 sum of prof row r (contiguous), in the order numpy would use
  // for a reduce over axis 1 of that layout.
  function rowSum32(d, off, n, forder) {
    if (!forder) return PF.pairwiseSum(d, off, n, true);
    var acc = 0.0;
    for (var i = 0; i < n; i++) acc = fr(acc + d[off + i]);
    return acc;
  }
  // float32 sum down column k of a (rows, cols) row-major buffer, in the
  // order numpy would use for a reduce over axis 0 of that layout.
  var colScratch = new Float32Array(0);
  function colSum32(d, rows, cols, k, forder) {
    var r;
    if (!forder) {
      var acc = 0.0;
      for (r = 0; r < rows; r++) acc = fr(acc + d[r * cols + k]);
      return acc;
    }
    if (colScratch.length < rows) colScratch = new Float32Array(rows);
    for (r = 0; r < rows; r++) colScratch[r] = d[r * cols + k];
    return PF.pairwiseSum(colScratch, 0, rows, true);
  }

  // nfft = 1 << int(np.ceil(np.log2(2 * n))): the smallest power of two >= 2n
  function nfftFor(n) {
    var nfft = 1;
    while (nfft < 2 * n) nfft *= 2;
    return nfft;
  }

  // x = prof - prof.mean(axis=1, keepdims=True); F = rfft(x, nfft, axis=1)
  // as complex64; p = (F * conj(F)).real as float32.  Shared by band_acf and
  // band_cepstrum.  Returns {x, re, im, p, nb, nfft}.
  function centredPower(prof) {
    var rows = prof.rows, n = prof.cols, forder = prof.forder, d = prof.d;
    var x = new Float64Array(rows * n);
    var r, k, o;
    for (r = 0; r < rows; r++) {
      o = r * n;
      var mean = fr(rowSum32(d, o, n, forder) / n);
      for (k = 0; k < n; k++) x[o + k] = fr(d[o + k] - mean);
    }
    var nfft = nfftFor(n);
    var F = PF.rfftRows(x, rows, n, nfft);
    var nb = F.cols;
    var re = new Float32Array(rows * nb), im = new Float32Array(rows * nb);
    var p = new Float32Array(rows * nb);
    for (k = 0; k < rows * nb; k++) {
      var a = fr(F.re[k]), b = fr(F.im[k]);
      re[k] = a; im[k] = b;
      p[k] = fr(a * a + fr(b * b));        // complex64 x*conj(x): fused real part
    }
    return { x: x, re: re, im: im, p: p, nb: nb, nfft: nfft, rows: rows, n: n, forder: forder };
  }

  /**
   * band_acf(prof): mean unbiased ACF over band profiles, acf[0] == 1.
   *   x = prof - prof.mean(axis=1, keepdims=True)
   *   nfft = 1 << ceil(log2(2n)); F = rfft(x, nfft, axis=1)
   *   p = (F * conj(F)).real
   *   p /= clip(p.sum(axis=1, keepdims=True), 1e-12, None)   # per-band power
   *   ac = irfft(p, nfft, axis=1)[:, :n].sum(0)
   *   ac = ac * (n / clip(n - lags, 1, None)); ac /= max(ac[0], 1e-12)
   * "normalise each band by its own power so one busy band can't dominate".
   * float32 through the irfft; float64 from the lag correction on.
   */
  A.band_acf = function band_acf(prof) {
    deps();
    var cp = centredPower(prof);
    var rows = cp.rows, n = cp.n, nb = cp.nb, nfft = cp.nfft, forder = cp.forder, p = cp.p;
    var eps = fr(1e-12);
    var r, k, o;
    var pd = new Float64Array(rows * nb);
    for (r = 0; r < rows; r++) {
      o = r * nb;
      var ps = rowSum32(p, o, nb, forder);
      var den = (ps !== ps) ? ps : ((ps > eps) ? ps : eps);       // np.maximum(p_sum, 1e-12)
      for (k = 0; k < nb; k++) pd[o + k] = fr(p[o + k] / den);
    }
    var ac2 = PF.irfftRows(pd, null, rows, nb, nfft).data;   // float64, rounded below
    var a32 = new Float32Array(rows * nfft);
    for (k = 0; k < rows * nfft; k++) a32[k] = fr(ac2[k]);
    var ac = new Float64Array(n);
    for (k = 0; k < n; k++) ac[k] = colSum32(a32, rows, nfft, k, forder);   // float32 sum over bands
    // unbiased: float32 ac * float64 (n / max(n - lag, 1)) -> float64
    for (k = 0; k < n; k++) {
      var lag = n - k;
      var q = n / (lag > 1 ? lag : 1);
      ac[k] = ac[k] * q;
    }
    var a0 = pyMax(ac[0], 1e-12);
    for (k = 0; k < n; k++) ac[k] = ac[k] / a0;
    return ac;
  };

  /**
   * band_cepstrum(prof): cepstrum of the mean log power spectrum over band
   * profiles.
   *   logp = log((F * conj(F)).real.mean(0) + 1e-6); logp -= logp.mean()
   *   c = irfft(logp, nfft)[: n // 2]
   *   c = (c - median(c)) / (c.std() + 1e-12)
   * All float32; the log is numpy's SIMD float32 log (PF.logF32), the
   * median is np.median's float32 average of the middle pair, and std is
   * the population std computed as numpy's _var does it (mean, centre,
   * square, sum, divide, sqrt - each rounded to float32).
   */
  A.band_cepstrum = function band_cepstrum(prof) {
    deps();
    var cp = centredPower(prof);
    var rows = cp.rows, n = cp.n, nb = cp.nb, nfft = cp.nfft, forder = cp.forder, p = cp.p;
    var k;
    var e6 = fr(1e-6);
    var logp = new Float32Array(nb);
    for (k = 0; k < nb; k++) {
      var m = fr(colSum32(p, rows, nb, k, forder) / rows);
      logp[k] = PF.logF32(fr(m + e6));
    }
    var lmean = fr(PF.pairwiseSum(logp, 0, nb, true) / nb);
    var lp64 = new Float64Array(nb);
    for (k = 0; k < nb; k++) lp64[k] = fr(logp[k] - lmean);
    var cfull = PF.irfft(lp64, null, nfft);
    var half = Math.floor(n / 2);
    var c = new Float32Array(half);
    for (k = 0; k < half; k++) c[k] = fr(cfull[k]);
    var med = PF.median(c, 'f4');
    // c.std(): numpy _var in float32
    var cmean = fr(PF.pairwiseSum(c, 0, half, true) / half);
    var sq = new Float32Array(half);
    for (k = 0; k < half; k++) { var dv = fr(c[k] - cmean); sq[k] = fr(dv * dv); }
    var sd = fr(Math.sqrt(fr(PF.pairwiseSum(sq, 0, half, true) / half)));
    var den = fr(sd + fr(1e-12));
    var out = new Float32Array(half);
    for (k = 0; k < half; k++) out[k] = fr(fr(c[k] - med) / den);
    return out;
  };

  /**
   * _interp(arr, pos): linear interpolation at fractional index pos.
   *   i = clip(pos.astype(int), 0, len(arr) - 2); f = pos - i
   *   return arr[i] * (1.0 - f) + arr[i + 1] * f
   * astype(int) truncates toward zero; f is NOT clamped, so a position past
   * the end extrapolates from the last two samples (the comb's K bound keeps
   * k*s <= n-2, but (k + 0.5)*s can run past it).  arr may be float32 (the
   * cepstrum): the arithmetic is float64 either way.
   */
  function interp1(arr, pos) {
    var i = Math.trunc(pos);
    var hi = arr.length - 2;
    if (i < 0) i = 0; else if (i > hi) i = hi;
    var f = pos - i;
    return arr[i] * (1.0 - f) + arr[i + 1] * f;
  }
  A._interp = function _interp(arr, pos) {
    if (typeof pos === 'number') return interp1(arr, pos);
    var out = new Float64Array(pos.length);
    for (var j = 0; j < pos.length; j++) out[j] = interp1(arr, pos[j]);
    return out;
  };

  /**
   * comb_score(ac, s, k_max=24, k0=12.0): comb minus anti-comb on the ACF at
   * multiples of s.  K = int(min((n - 2) / s, k_max)); < 2 -> -1.0.
   * Peaks at k*s, troughs at (k -+ 0.5)*s, weights exp(-(k-1)/k0), the sums
   * are np.sum (pairwise).
   */
  A.comb_score = function comb_score(ac, s, k_max, k0) {
    if (k_max === undefined) k_max = 24;
    if (k0 === undefined) k0 = 12.0;
    var n = ac.length;
    var K = Math.trunc(pyMin((n - 2) / s, k_max));
    if (K < 2) return -1.0;
    var w = expWeights(K, k0);
    var terms = new Float64Array(K);
    for (var j = 0; j < K; j++) {
      var k = j + 1;
      var pk = interp1(ac, k * s);
      var tr = 0.5 * (interp1(ac, (k - 0.5) * s) + interp1(ac, (k + 0.5) * s));
      terms[j] = w[j] * (pk - tr);
    }
    return PF.pairwiseSum(terms, 0, K, false) / PF.pairwiseSum(w, 0, K, false);
  };

  /**
   * comb_score_vec(ac, steps, k_max=24, k0=12.0): vectorized comb_score
   * over an array of steps (identical values).  Reference note: "The
   * per-step python loop was ~27k calls per image; one interp over a
   * (n_steps, K) position matrix replaces it."
   * The arithmetic is NOT identical to comb_score's: the trough positions
   * are pos -+ 0.5*s with pos = s*k (two roundings) where comb_score uses
   * (k -+ 0.5)*s, and every step sums all k_max weights with the invalid
   * ones zeroed (w * valid), so the pairwise sum always runs over k_max
   * terms.  Reproduced as written, since axis_estimate uses this one.
   */
  A.comb_score_vec = function comb_score_vec(ac, steps, k_max, k0) {
    if (k_max === undefined) k_max = 24;
    if (k0 === undefined) k0 = 12.0;
    var n = ac.length;
    var ns = steps.length;
    var out = new Float64Array(ns);
    var w = expWeights(k_max, k0);
    var wv = new Float64Array(k_max), tv = new Float64Array(k_max);
    for (var si = 0; si < ns; si++) {
      var s = steps[si];
      var Ks = Math.trunc((n - 2) / s);
      if (k_max < Ks) Ks = k_max;                    // np.minimum
      for (var j = 0; j < k_max; j++) {
        var kk = j + 1;
        var pos = s * kk;
        var pk = interp1(ac, pos);
        var tr = 0.5 * (interp1(ac, pos - 0.5 * s) + interp1(ac, pos + 0.5 * s));
        var valid = (kk <= Ks) ? 1.0 : 0.0;
        wv[j] = w[j] * valid;
        tv[j] = wv[j] * (pk - tr);
      }
      var wsum = PF.pairwiseSum(wv, 0, k_max, false);
      var den = (wsum !== wsum) ? wsum : ((wsum > 1e-12) ? wsum : 1e-12);   // np.maximum(wsum, 1e-12)
      var val = PF.pairwiseSum(tv, 0, k_max, false) / den;
      out[si] = (Ks >= 2) ? val : -1.0;
    }
    return out;
  };

  /**
   * plain_comb(ac, s, k_max=16, k0=8.0): comb sum only (no anti-comb): "is
   * there ACF mass at multiples of s".  K < 1 -> 0.0.
   */
  A.plain_comb = function plain_comb(ac, s, k_max, k0) {
    if (k_max === undefined) k_max = 16;
    if (k0 === undefined) k0 = 8.0;
    var n = ac.length;
    var K = Math.trunc(pyMin((n - 2) / s, k_max));
    if (K < 1) return 0.0;
    var w = expWeights(K, k0);
    var terms = new Float64Array(K);
    for (var j = 0; j < K; j++) terms[j] = w[j] * interp1(ac, (j + 1) * s);
    return PF.pairwiseSum(terms, 0, K, false) / PF.pairwiseSum(w, 0, K, false);
  };

  // Parabolic sub-sample peak offset shared by train_quality,
  // refine_step_acf and axis_estimate:
  //   d = (a[i-1] - a[i+1]) / (2 * (a[i-1] - 2*a[i] + a[i+1]) + 1e-12)
  function parabolic(a, i) {
    return (a[i - 1] - a[i + 1]) / (2 * (a[i - 1] - 2 * a[i] + a[i + 1]) + 1e-12);
  }

  // np.argmax over a[lo..hi] inclusive, returning the absolute index of the
  // FIRST maximum (numpy's tie rule; NaN wins and stops the scan).
  function argmaxRange(a, lo, hi) {
    var mp = a[lo], mi = lo;
    if (mp !== mp) return lo;
    for (var i = lo + 1; i <= hi; i++) {
      var v = a[i];
      if (!(v <= mp)) { mp = v; mi = i; if (mp !== mp) break; }
    }
    return mi;
  }

  /**
   * train_quality(ac, s0, k_max=20): how well an actual ACF peak train fits
   * multiples of s0.  Returns (coverage-weighted inlier mass) *
   * exp(-4*rms residual / s0).  Reference: "Distinguishes the true
   * fundamental from rational aliases (e.g. 25/9 of the true step under a
   * JPEG 8px lattice) that score similar comb values."
   */
  A.train_quality = function train_quality(ac, s0, k_max) {
    if (k_max === undefined) k_max = 20;
    var n = ac.length;
    var K = Math.trunc(pyMin((n - 3) / s0, k_max));
    if (K < 2) return 0.0;
    var res = [], mass = 0.0, tot = 0;
    for (var k = 1; k <= K; k++) {
      var c0 = k * s0;
      var r = Math.max(2, Math.trunc(0.35 * s0));
      var lo = Math.max(1, Math.trunc(c0 - r));
      var hi = Math.min(n - 2, Math.ceil(c0 + r));
      if (hi <= lo) continue;
      tot += 1;
      var i = argmaxRange(ac, lo, hi);
      if (i <= lo || i >= hi || ac[i] <= 0) continue;
      var d = parabolic(ac, i);
      var p = i + clip2(d, -1, 1);
      res.push((p - c0) / s0);
      mass += ac[i];
    }
    if (res.length === 0 || tot === 0) return 0.0;
    var sq = new Float64Array(res.length);
    for (var j = 0; j < res.length; j++) sq[j] = res[j] * res[j];
    var rms = Math.sqrt(PF.pairwiseSum(sq, 0, sq.length, false) / sq.length);
    return (mass / tot) * PF.exp(-4.0 * rms);
  };

  /**
   * refine_step_acf(ac, s0, k_max=24): refine step by fitting a line through
   * ACF peak-train positions.  Finds the local ACF maximum near each
   * multiple k*s0 (parabolic subpixel), then robust-fits peak_pos ~ k * s
   * through the origin (3 rounds, inliers within max(0.3*s0, 1.5)).
   * Falls back to s0 when fewer than 2 peaks are usable or the fit leaves
   * [0.8*s0, 1.25*s0].
   */
  A.refine_step_acf = function refine_step_acf(ac, s0, k_max) {
    if (k_max === undefined) k_max = 24;
    var n = ac.length;
    var K = Math.trunc(pyMin((n - 3) / s0, k_max));
    if (K < 2) return s0;
    var pos = [], ks = [], wts = [];
    for (var k = 1; k <= K; k++) {
      var c0 = k * s0;
      var r = Math.max(2, Math.trunc(0.3 * s0));
      var lo = Math.max(1, Math.trunc(c0 - r));
      var hi = Math.min(n - 2, Math.ceil(c0 + r));
      if (hi <= lo) continue;
      var i = argmaxRange(ac, lo, hi);
      if (i <= lo || i >= hi) continue;      // peak on window edge: unreliable
      var d = parabolic(ac, i);
      pos.push(i + clip2(d, -1, 1));
      ks.push(k);
      wts.push(pyMax(ac[i], 1e-6));
    }
    if (pos.length < 2) return s0;
    var m = pos.length;
    var s = s0;
    var tol = Math.max(0.3 * s0, 1.5);
    var num = new Float64Array(m), den = new Float64Array(m);
    for (var round = 0; round < 3; round++) {
      var kept = 0;
      for (var j = 0; j < m; j++) {
        if (Math.abs(pos[j] - ks[j] * s) <= tol) {
          num[kept] = wts[j] * pos[j] * ks[j];       // (wts * pos) * ks
          den[kept] = wts[j] * (ks[j] * ks[j]);      // wts * ks ** 2
          kept++;
        }
      }
      if (kept < 2) break;
      s = PF.pairwiseSum(num, 0, kept, false) / PF.pairwiseSum(den, 0, kept, false);
    }
    if (!(0.8 * s0 <= s && s <= 1.25 * s0)) return s0;
    return s;
  };

  /**
   * ceps_score(c, s): cepstrum vote at multiples of s, K = int(min((n-2)/s,
   * 6)), weights exp(-(k-1)/3).  c is float32; the interpolation and sum
   * are float64.
   */
  A.ceps_score = function ceps_score(c, s) {
    var n = c.length;
    var K = Math.trunc(pyMin((n - 2) / s, 6));
    if (K < 1) return 0.0;
    var w = expWeights(K, 3.0);
    var terms = new Float64Array(K);
    for (var j = 0; j < K; j++) terms[j] = w[j] * interp1(c, (j + 1) * s);
    return PF.pairwiseSum(terms, 0, K, false) / PF.pairwiseSum(w, 0, K, false);
  };

  /* ================================================================ *
   * per-axis
   * ================================================================ */

  function checkMaps(maps, what) {
    if (!Array.isArray(maps) || maps.length === 0) throw new Error(what + ': maps must be a non-empty [[map, weight], ...]');
    for (var i = 0; i < maps.length; i++) {
      if (!Array.isArray(maps[i]) || maps[i].length !== 2 || typeof maps[i][1] !== 'number') {
        throw new Error(what + ': maps[' + i + '] must be [map, weight]');
      }
      checkMap(maps[i][0], what + ' maps[' + i + '][0]');
    }
  }

  /**
   * axis_estimate(maps, axis, extent): maps is a list of (feature_map,
   * weight).  Returns [step, candidates, ac_sum].
   *
   * Comb-minus-anticomb over a fine step grid, accumulated over every
   * (map, band) pair with weight wgt*bw; a cepstrum vote on the primary map;
   * subharmonic suppression at selection time ("m*s0 scores like s0 on the
   * comb, so penalise s by the best score among s/2..s/5"); local maxima of
   * the selection score refined parabolically on the raw score; a near-tie
   * disambiguation by train_quality ("rational aliases (e.g. 25/9 of the
   * true step under a JPEG lattice) can match the comb score of the
   * fundamental, but the actual peak-train residuals give them away"); and
   * a final ACF peak-train fit around each candidate.
   */
  A.axis_estimate = function axis_estimate(maps, axis, extent) {
    deps();
    checkMaps(maps, 'PF.autocorr.axis_estimate');
    if (axis !== 0 && axis !== 1) throw new Error('PF.autocorr.axis_estimate: axis must be 0 or 1');
    var steps = PF.arange(MIN_STEP, pyMin(MAX_STEP, extent / 4.0), STEP_GRID);
    var ns = steps.length;
    var raw = new Float64Array(ns);
    var ac_sum = new Float64Array(extent);
    var mi, bi, i, k;
    for (mi = 0; mi < maps.length; mi++) {
      var feat = maps[mi][0], wgt = maps[mi][1];
      var n_lines = (axis === 1) ? feat.h : feat.w;
      var bands = [[12, 0.5], [BAND, 1.0], [n_lines, 1.0]];
      for (bi = 0; bi < 3; bi++) {
        var band = bands[bi][0], bw = bands[bi][1];
        var ac = A.band_acf(A.band_profiles(feat, axis, band));
        if (ac.length !== extent) throw new Error('PF.autocorr.axis_estimate: acf length ' + ac.length + ' != extent ' + extent);
        var wb = wgt * bw;
        for (k = 0; k < extent; k++) ac_sum[k] += wb * ac[k];
        var cs = A.comb_score_vec(ac, steps);
        for (i = 0; i < ns; i++) raw[i] += wb * cs[i];
      }
    }
    // cepstrum vote on the primary feature map
    var c = A.band_cepstrum(A.band_profiles(maps[0][0], axis));
    var cz = new Float64Array(ns);
    for (i = 0; i < ns; i++) cz[i] = A.ceps_score(c, steps[i]);
    var rmax = pyMax(npMax(raw), 1e-9);
    var vote = new Float64Array(ns);
    for (i = 0; i < ns; i++) vote[i] = (0.1 * clip0(cz[i])) * clip0(raw[i]) / rmax;
    for (i = 0; i < ns; i++) raw[i] += vote[i];

    // subharmonic suppression (selection only): m*s0 scores like s0 on the
    // comb, so penalise s by the best score among s/2..s/5.
    var pen = new Float64Array(ns);
    var s0 = steps[0];
    var ms = [2, 3, 4, 5];
    for (var mm = 0; mm < 4; mm++) {
      var m = ms[mm];
      for (i = 0; i < ns; i++) {
        var s_sub = steps[i] / m;
        var valid = s_sub >= s0;
        var pos = clip0((s_sub - s0) / STEP_GRID);
        var val = interp1(raw, pos);
        var cand = valid ? clip0(val) : 0.0;
        // np.maximum(pen, cand): NaN propagates
        pen[i] = (pen[i] !== pen[i]) ? pen[i] : ((cand !== cand) ? cand : (cand > pen[i] ? cand : pen[i]));
      }
    }
    var sel = new Float64Array(ns);
    for (i = 0; i < ns; i++) sel[i] = raw[i] - 0.5 * pen[i];

    // local maxima of the selection score; refine position on the raw score
    var loc = [];
    for (i = 1; i < ns - 1; i++) {
      if (sel[i] > sel[i - 1] && sel[i] >= sel[i + 1]) loc.push(i);
    }
    var cands = [];
    var order = [];
    if (loc.length > 0) {
      var keys = new Float64Array(loc.length);
      for (i = 0; i < loc.length; i++) keys[i] = sel[loc[i]];
      // np.argsort(sel[loc])[::-1][:8] with the tie order of the argsort
      // kernel this machine's numpy dispatches to (see pf-02-scipy.js).
      var perm = PF._scipyInternals.argsortNumpy(keys);
      for (i = perm.length - 1; i >= 0 && order.length < 8; i--) order.push(loc[perm[i]]);
    }
    for (var oi = 0; oi < order.length; oi++) {
      i = order[oi];
      var s;
      if (0 < i && i < ns - 1) {
        var d = parabolic(raw, i);
        s = steps[i] + clip2(d, -1, 1) * STEP_GRID;
      } else {
        s = steps[i];
      }
      cands.push([s, sel[i]]);
    }
    if (cands.length === 0) {
      i = PF.argmax(sel);
      cands = [[steps[i], sel[i]]];
    }
    // near-tie disambiguation: rational aliases (e.g. 25/9 of the true step
    // under a JPEG lattice) can match the comb score of the fundamental, but
    // the actual peak-train residuals give them away.
    if (cands.length >= 2 && cands[1][1] >= 0.85 * cands[0][1]) {
      var thr = 0.85 * cands[0][1];
      var top = [];
      for (i = 0; i < cands.length && top.length < 3; i++) if (cands[i][1] >= thr) top.push(cands[i]);
      var a0 = pyMax(ac_sum[0], 1e-12);
      var acn = new Float64Array(extent);
      for (k = 0; k < extent; k++) acn[k] = ac_sum[k] / a0;
      var scores = new Float64Array(top.length);
      for (i = 0; i < top.length; i++) {
        var q = A.train_quality(acn, top[i][0]);
        scores[i] = top[i][1] * (0.1 + q);
      }
      var j = PF.argmax(scores);
      if (j !== 0) {
        var picked = top[j];
        var rest = [picked];
        for (i = 0; i < cands.length; i++) if (cands[i] !== picked) rest.push(cands[i]);
        cands = rest;
      }
    }
    // precision: fit the ACF peak train around each top candidate
    for (i = 0; i < cands.length; i++) cands[i] = [A.refine_step_acf(ac_sum, cands[i][0]), cands[i][1]];
    var best = cands[0][0];
    return [best, cands, ac_sum];
  };

  // feat[:, a:b] (axis == 1) or feat[a:b, :] (axis == 0), as a fresh map.
  // The reference's view is non-contiguous for axis 1, but band_profiles'
  // reduction order only depends on which axis is fast, which a copy keeps.
  function sliceMap(feat, axis, a, b) {
    var w = feat.w, h = feat.h, s = feat.d, out, x, y, len = b - a;
    if (axis === 1) {
      out = new Float32Array(len * h);
      for (y = 0; y < h; y++) for (x = 0; x < len; x++) out[y * len + x] = s[y * w + a + x];
      return { d: out, w: len, h: h };
    }
    out = new Float32Array(w * len);
    for (y = 0; y < len; y++) for (x = 0; x < w; x++) out[y * w + x] = s[(a + y) * w + x];
    return { d: out, w: w, h: len };
  }

  /**
   * local_count(maps, axis, extent, s0): drift-aware cell count: split the
   * axis into windows, estimate the local step in each from its own banded
   * ACF, integrate width/s_local.
   *   uniform = extent / s0; nw = int(clip(extent / (14*s0), 1, 8))
   *   nw < 2 or uniform < 96 -> uniform   ("too few periods for drift to
   *     matter / for stable local estimates")
   * Per window: local re-scan over s0 * arange(0.85, 1.18, 0.01) ("drift can
   * move the local step well away from s0"), taken only when it beats
   * max(1.6 * max(s_glob, 0), 0.02); s_i clipped to [0.82, 1.2] * s0.
   * "adopt the integrated count only on clear disagreement (real drift);
   * local windows jitter by ~1 cell on clean images."
   */
  A.local_count = function local_count(maps, axis, extent, s0) {
    deps();
    checkMaps(maps, 'PF.autocorr.local_count');
    var uniform = extent / s0;
    var nw = Math.trunc(clip2(extent / (14.0 * s0), 1, 8));
    if (nw < 2 || uniform < 96) return uniform;
    var edges = PF.astypeInt(PF.linspace(0, extent, nw + 1));
    var total = 0.0;
    var scanBase = PF.arange(0.85, 1.18, 0.01);
    for (var wi = 0; wi < nw; wi++) {
      var a = edges[wi], b = edges[wi + 1];
      var ac_loc = new Float64Array(b - a);
      for (var mi = 0; mi < maps.length; mi++) {
        var sl = sliceMap(maps[mi][0], axis, a, b);
        var wgt = maps[mi][1];
        var n_lines = (axis === 1) ? sl.h : sl.w;
        var bands = [[BAND, 1.0], [n_lines, 1.0]];
        for (var bi = 0; bi < 2; bi++) {
          var ac = A.band_acf(A.band_profiles(sl, axis, bands[bi][0]));
          if (ac.length !== b - a) throw new Error('PF.autocorr.local_count: window acf length mismatch');
          var wb = wgt * bands[bi][1];
          for (var k = 0; k < ac.length; k++) ac_loc[k] += wb * ac[k];
        }
      }
      // local re-scan: drift can move the local step well away from s0
      var scan = new Float64Array(scanBase.length);
      var sc = new Float64Array(scanBase.length);
      for (var j = 0; j < scan.length; j++) {
        scan[j] = s0 * scanBase[j];
        sc[j] = A.comb_score(ac_loc, scan[j], 12, 8.0);
      }
      var s_glob = A.comb_score(ac_loc, s0, 12, 8.0);
      var s_i;
      if (npMax(sc) > pyMax(1.6 * pyMax(s_glob, 0.0), 0.02)) {
        s_i = A.refine_step_acf(ac_loc, scan[PF.argmax(sc)], 12);
      } else {
        s_i = A.refine_step_acf(ac_loc, s0, 10);
      }
      s_i = clip2(s_i, 0.82 * s0, 1.2 * s0);
      total += (b - a) / s_i;
    }
    // adopt the integrated count only on clear disagreement (real drift);
    // local windows jitter by ~1 cell on clean images.
    return (Math.abs(total - uniform) >= 2.5) ? total : uniform;
  };

  /* ================================================================ *
   * detect
   * ================================================================ */

  // Python float `%`: the result takes the sign of the divisor.
  function pyMod(a, b) {
    var m = a % b;
    if (m !== 0) { if ((b < 0) !== (m < 0)) m += b; }
    else m = (b < 0) ? -0 : 0;
    return m;
  }
  A._pyMod = pyMod;

  /**
   * np.convolve(a, v, mode="same") for real a and complex v (re, im).
   * numpy: the longer operand is `a`; the output has max(len(a), len(v))
   * samples, being full[j + (min_len >> 1)].  Each output is a plain
   * left-to-right complex accumulation here; numpy hands the dot product to
   * OpenBLAS zdotu whose summation order is not reproducible, so this is
   * the one place the port is honestly approximate (measured in the test).
   */
  function convolveSameComplex(a, vre, vim) {
    var na = a.length, nv = vre.length;
    var nfull = na + nv - 1;
    var nout = Math.max(na, nv);
    var off = Math.min(na, nv) >> 1;
    var ore = new Float64Array(nout), oim = new Float64Array(nout);
    for (var o = 0; o < nout; o++) {
      var k = o + off;                       // index into the full convolution
      var sre = 0.0, sim = 0.0;
      var jlo = Math.max(0, k - (nv - 1)), jhi = Math.min(na - 1, k);
      for (var j = jlo; j <= jhi; j++) {
        var av = a[j];
        sre += av * vre[k - j];
        sim += av * vim[k - j];
      }
      ore[o] = sre; oim[o] = sim;
    }
    if (nfull < nout) throw new Error('convolve: impossible length');
    return { re: ore, im: oim };
  }
  A._convolveSameComplex = convolveSameComplex;

  /**
   * phase_count(maps, axis, extent, step): cell count by unwrapped-phase
   * span (ported from the ML branch).  Reference docstring, kept:
   *
   *   GridNet's key output-size idea, done classically: demodulate the
   *   boundary-energy profile at the detected frequency (Gabor window a few
   *   cells wide) to get a local phase theta(x) and coherence |C(x)|; unwrap
   *   with increment-relative branch selection (low-coherence noise then
   *   averages to the NOMINAL advance - the right fallback); the total span
   *   over [0, extent] divided by 2pi is the exact cell count even when the
   *   grid drifts.  Returns (count, coherence).
   *
   *   phase must come from ONE alignment: the |d2| map peaks at cell
   *   centres and the |d1| map at cell boundaries (half a period apart);
   *   mixing them cancels the very phase we are tracking.  Use the last map
   *   (quantized first-difference, cut-aligned).
   *
   * Not called by detect() nor by core.py.  The profile sums are float32 in
   * numpy's layout order (axis=1 sums down columns of a C-order map:
   * sequential; axis=0 sums along rows: pairwise) then cast to float64.
   */
  A.phase_count = function phase_count(maps, axis, extent, step) {
    checkMaps(maps, 'PF.autocorr.phase_count');
    var dmap = maps[maps.length - 1][0];
    var w = dmap.w, h = dmap.h, d = dmap.d;
    var n = (axis === 1) ? w : h;
    var prof = new Float64Array(n), i, j;
    if (axis === 1) {
      for (i = 0; i < n; i++) prof[i] = colSum32(d, h, w, i, false);
    } else {
      for (i = 0; i < n; i++) prof[i] = PF.pairwiseSum(d, i * w, w, true);
    }
    if (n < 8 || step < 1.5) return [null, 0.0];
    var mean = PF.pairwiseSum(prof, 0, n, false) / n;
    for (i = 0; i < n; i++) prof[i] = prof[i] - mean;

    // gabor demodulation at frequency 1/step
    var sigma = 2.5 * step;
    var half = Math.trunc(pyMin(pyMax(3 * sigma, step * 2), Math.floor(n / 2)));
    var nk = 2 * half + 1;
    var kre = new Float64Array(nk), kim = new Float64Array(nk);
    var TWO_PI = 2.0 * Math.PI;
    for (j = 0; j < nk; j++) {
      var t = -half + j;
      var u = t / sigma;
      var win = PF.exp(-0.5 * (u * u));
      // exp(-2j*pi*t/step): real part exp(+-0) == 1, angle -2*pi*t/step
      var ang = (-2.0 * Math.PI * t) / step;
      kre[j] = win * Math.cos(ang);
      kim[j] = win * Math.sin(ang);
    }
    // np.convolve(prof, kern[::-1], "same") == correlate with the reversed
    // kernel un-reversed: convolve(prof, kern[::-1])
    var rre = new Float64Array(nk), rim = new Float64Array(nk);
    for (j = 0; j < nk; j++) { rre[j] = kre[nk - 1 - j]; rim[j] = kim[nk - 1 - j]; }
    var C = convolveSameComplex(prof, rre, rim);
    var m = C.re.length;
    var theta = new Float64Array(m), mag = new Float64Array(m);
    var magmax = 0.0;
    for (i = 0; i < m; i++) {
      theta[i] = Math.atan2(C.im[i], C.re[i]);
      mag[i] = Math.hypot(C.re[i], C.im[i]);
    }
    magmax = npMax(mag);
    var rel = new Float64Array(m);
    var mden = magmax + 1e-12;
    for (i = 0; i < m; i++) rel[i] = mag[i] / mden;
    var coherence = PF.pairwiseSum(rel, 0, m, false) / m;

    var inc = TWO_PI / step;
    var dd = new Float64Array(m - 1);
    for (i = 0; i < m - 1; i++) {
      var dv = (theta[i + 1] - theta[i]) - inc;
      dv = pyMod(dv + Math.PI, TWO_PI) - Math.PI;
      dd[i] = dv + inc;
    }
    var span = PF.pairwiseSum(dd, 0, m - 1, false) + inc;   // + half-sample extension both ends
    var count = span / TWO_PI;
    return [count, coherence];
  };

  // max(z for _, z in cands): Python max over a generator (first maximum)
  function maxZ(cands) {
    var m = cands[0][1];
    for (var i = 1; i < cands.length; i++) if (cands[i][1] > m) m = cands[i][1];
    return m;
  }

  /**
   * detect(rgba, pre=None): pre is an optional {maps_x, maps_y, est_x,
   * est_y} with est_* = [step, candidates, acf] from axis_estimate - avoids
   * recomputing the profiles/ACFs when the caller already built them.
   *
   * Returns {step_x, step_y, cols, rows, phase_x: 0, phase_y: 0,
   * candidates} with candidates the top 8 of both axes' lists by score
   * (Python's stable sort: ties keep x-before-y order).
   */
  A.detect = function detect(rgba, pre) {
    deps();
    var h, w, maps_x, maps_y, sx, cx, ac_x, sy, cy, ac_y;
    if (pre !== undefined && pre !== null) {
      if (!rgba || !(rgba.w > 0) || !(rgba.h > 0)) throw new Error('PF.autocorr.detect: rgba must carry w and h');
      h = rgba.h; w = rgba.w;
      maps_x = pre.maps_x; maps_y = pre.maps_y;
      sx = pre.est_x[0]; cx = pre.est_x[1]; ac_x = pre.est_x[2];
      sy = pre.est_y[0]; cy = pre.est_y[1]; ac_y = pre.est_y[2];
    } else {
      var g = A.to_gray(rgba);
      h = g.h; w = g.w;
      var gq = A.median_quant(g);
      maps_x = [[A.d2_along(g, 1), 1.0], [A.d1_along(gq, 1), 0.7]];
      maps_y = [[A.d2_along(g, 0), 1.0], [A.d1_along(gq, 0), 0.7]];
      var ex = A.axis_estimate(maps_x, 1, w);
      var ey = A.axis_estimate(maps_y, 0, h);
      sx = ex[0]; cx = ex[1]; ac_x = ex[2];
      sy = ey[0]; cy = ey[1]; ac_y = ey[2];
    }

    // cross-axis harmonic reconciliation: comb-minus-anticomb suppresses the
    // true step s when the image also has s/2 texture (dither), because the
    // anti-comb points land on the s/2 peaks. If the axes disagree by a near
    // exact factor of 2 or 3 and the small axis's ACF also has mass at the
    // big step's multiples, promote the small axis to the big step.
    function reconcile(s_small, s_big, ac_small) {
      var ms = [2, 3];
      for (var mi = 0; mi < 2; mi++) {
        var m = ms[mi];
        if (Math.abs(s_big / s_small - m) <= 0.06 * m) {
          var pc_big = A.plain_comb(ac_small, s_big);
          var pc_small = A.plain_comb(ac_small, s_small);
          if (pc_big >= 0.55 * pc_small && pc_big > 0) {
            return A.refine_step_acf(ac_small, s_big);
          }
        }
      }
      return s_small;
    }
    if (sx < sy) sx = reconcile(sx, sy, ac_x);
    else if (sy < sx) sy = reconcile(sy, sx, ac_y);

    var i, j, s1, z1, s2, z2;
    // joint square-ish pairing: when the axes disagree (>8%) but both hold
    // strong runner-up candidates that agree, prefer the agreeing pair
    // (pseudo pixel cells are usually near square; heavy phase shuffling can
    // push the true step to rank 2 on both axes independently).
    if (Math.abs(PF.log(sx / sy)) > 0.08) {
      var zx0 = maxZ(cx), zy0 = maxZ(cy);
      var best_pair = null, best_sum = 0.0;
      var nx = Math.min(6, cx.length), ny = Math.min(6, cy.length);
      for (i = 0; i < nx; i++) {
        s1 = cx[i][0]; z1 = cx[i][1];
        for (j = 0; j < ny; j++) {
          s2 = cy[j][0]; z2 = cy[j][1];
          if (Math.abs(PF.log(s1 / s2)) <= 0.08 && z1 >= 0.6 * zx0 && z2 >= 0.6 * zy0) {
            if (z1 + z2 > best_sum) { best_sum = z1 + z2; best_pair = [s1, s2]; }
          }
        }
      }
      if (best_pair !== null && (Math.abs(PF.log(best_pair[0] / sx)) > 1e-6 ||
                                 Math.abs(PF.log(best_pair[1] / sy)) > 1e-6)) {
        sx = best_pair[0]; sy = best_pair[1];
        sx = A.refine_step_acf(ac_x, sx);
        sy = A.refine_step_acf(ac_y, sy);
      }
    }

    // looser second pass for mild disagreement (5-13%): pull one axis onto
    // its own candidate that is compatible with the other axis's best.
    var dl = Math.abs(PF.log(sx / sy));
    if (0.05 < dl && dl <= 0.13) {
      var zx1 = maxZ(cx), zy1 = maxZ(cy);
      var _pull = function (cands_a, za0, s_other) {
        var best = null;
        var lim = Math.min(6, cands_a.length);
        for (var q = 0; q < lim; q++) {
          var s = cands_a[q][0], z = cands_a[q][1];
          if (Math.abs(PF.log(s / s_other)) <= 0.08 && z >= 0.3 * za0) {
            if (best === null || z > best[1]) best = [s, z];
          }
        }
        return best;
      };
      var move_y = _pull(cy, zy1, sx);      // keep sx, move sy
      var move_x = _pull(cx, zx1, sy);      // keep sy, move sx
      var score_a = zx1 + (move_y ? move_y[1] : -1e9);
      var score_b = zy1 + (move_x ? move_x[1] : -1e9);
      var s_new;
      if (move_y !== null && score_a >= score_b) {
        s_new = A.refine_step_acf(ac_y, move_y[0]);
        sy = (Math.abs(PF.log(s_new / move_y[0])) < 0.04) ? s_new : move_y[0];
      } else if (move_x !== null) {
        s_new = A.refine_step_acf(ac_x, move_x[0]);
        sx = (Math.abs(PF.log(s_new / move_x[0])) < 0.04) ? s_new : move_x[0];
      }
    }

    // drift-aware counting: integrate local (windowed) ACF step estimates
    var n_cols = A.local_count(maps_x, 1, w, sx);
    var n_rows = A.local_count(maps_y, 0, h, sy);

    // sorted(cx + cy, key=lambda t: -t[1])[:8]: stable, so equal scores
    // keep their x-then-y order.
    var all = cx.concat(cy);
    var idx = new Array(all.length);
    for (i = 0; i < all.length; i++) idx[i] = i;
    idx.sort(function (p, q) {
      var kp = -all[p][1], kq = -all[q][1];
      if (kp < kq) return -1;
      if (kp > kq) return 1;
      return p - q;
    });
    var cands = [];
    for (i = 0; i < idx.length && i < 8; i++) cands.push(all[idx[i]]);

    if (n_cols === 0 || n_rows === 0) throw new Error('ZeroDivisionError: float division by zero');
    return {
      step_x: w / n_cols, step_y: h / n_rows,
      cols: PF.rint(n_cols), rows: PF.rint(n_rows),
      phase_x: 0.0, phase_y: 0.0, candidates: cands
    };
  };

  A.version = 'pf-20-autocorr/1';
})();
