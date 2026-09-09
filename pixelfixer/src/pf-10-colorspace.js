/* pf-10-colorspace.js - port of pixelfixer/colorspace.py (39 lines):
 * sRGB <-> Oklab, closed form.
 *
 * No imports, no exports, no build step. Browser + node, ES2017.
 * Reads and writes exactly one global: PF. Needs pf-00-base.js first.
 *
 * Shape convention: an (n, 3) numpy array is a flat Float64Array of length
 * 3n, interleaved r,g,b (row-major, exactly numpy's memory order), plus the
 * explicit count n. Output has the same layout.
 *
 * dtype: float64 throughout, MEASURED at the only two call sites
 * (reconstruct.py:519-520):
 *     lab  = srgb_to_oklab(out)                        out is float64 - built
 *            from rgb = rgba[...,:3].astype(np.float64)/255.0 via float64
 *            bincount weights (cw), np.zeros((n,3)) (cpx) or _binned_mode
 *     clab = srgb_to_oklab(centers.astype(np.float64)) cv2.kmeans float32
 *            centers UPCAST to float64 before the call
 * A float32 input would make numpy compute the whole chain in float32
 * (NEP 50: the Python-float exponents are weak); no caller does that, so
 * this port is float64-only and does not pretend otherwise.
 *
 * oklab_to_srgb is imported at reconstruct.py:511 but never called anywhere
 * in the reference (grep: colorspace.py is its only definition site and
 * reconstruct.py:519/520 the only calls, both forward). Ported anyway so the
 * call graph still reads the same; it is tested to the same standard.
 *
 * --------------------------------------------------------------------
 * PARITY LIMIT - the transcendental calls (MEASURED, tools/probe-colorspace-
 * libm.py + .js, numpy 2.5.3 / python 3.12.10 / win32, node v24.17.0):
 *
 * numpy here dispatches at X86_V3 with no SVML, so np.power and np.cbrt
 * are the Windows UCRT libm's pow() and cbrt() called per element (0 diffs
 * against math.pow / math.cbrt on 340k / 320k inputs). V8 does not call the
 * platform libm: Math.pow and Math.cbrt are its own fdlibm-derived
 * implementations. The two libms disagree in the last bit:
 *
 *   Math.pow(x, 2.4)   vs UCRT:   128 / 340512 differ (0.038%), max 1 ulp
 *   Math.pow(x, 1/2.4) vs UCRT:   107 / 290256 differ (0.037%), max 1 ulp
 *   Math.pow(x, 3)     vs UCRT:   102 / 300000 differ (0.034%), max 1 ulp
 *   Math.cbrt(x)       vs UCRT: 100301 / 320011 differ (31.3%),  max 1 ulp
 *
 * A 60-digit decimal oracle on 4000-sample subsets says UCRT's cbrt is NOT
 * correctly rounded in 30% of cases (symmetric: ~15% above, ~15% below,
 * independent of magnitude - so it is not pow(x,1/3) or exp(log(x)/3);
 * those, exp2/log2 forms, and seven Newton/Halley refinement spellings were
 * tried in tools/probe-cbrt-candidates.py / probe-cbrt-newton.py and none
 * reproduce it). UCRT's pow is not correctly rounded in ~0.1%. Since the
 * reference's error lives in the reference's closed-source libm, NO JS
 * implementation can be bit-exact for cbrt: a correctly-rounded cbrt would
 * disagree with UCRT in exactly the 30% of cases where UCRT is wrong, and
 * Math.cbrt disagrees in 31.3%. Math.pow is the closest available pow
 * (V8 and UCRT even share most of their non-correctly-rounded cases).
 *
 * Therefore this file uses Math.pow / Math.cbrt, does NOT hide the miss,
 * and tools/test-colorspace.js reports the measured element miss count,
 * max |diff| and max ulp distance on every fixture rather than a tolerance
 * pass. Every stage that is NOT a transcendental call is tested bit-exact
 * on its own (see the stage functions below), so a miss can be attributed
 * to exactly one libm call and nothing else. Note that Math.pow/Math.cbrt
 * are engine-specific (SpiderMonkey ships fdlibm too, JavaScriptCore calls
 * the OS libm), so the numbers above are V8's.
 *
 * x ** 3 in numpy is np.power(x, 3.0) -> pow(x, 3.0), NOT x*x*x: the two
 * differ in 77526 / 300000 inputs (25.8%). The port calls Math.pow(x, 3)
 * for the same reason; writing x*x*x here would be a measurable regression.
 *
 * MEASURED PARITY (tools/parity-colorspace.py -> fixtures/colorspace-
 * parity.json, 19 cases, 108752 triples incl. every pixel of tiny/small/
 * mid.png, their float64 cell means and float32 kmeans centers; tools/
 * test-colorspace.js, 2842050 bitwise comparisons):
 *   stage                 values differing      max|diff|   max ulp
 *   lin()+RGB->LMS matrix    372 / 307347 (0.12%)  1.1e-16     2     <- pow
 *   np.cbrt                94592 / 307347 (30.8%)  8.9e-16     2     <- cbrt
 *   LMS'->Oklab matrix         0 / 307347          0           0     EXACT
 *   srgb_to_oklab         135262 / 307347 (44.0%)  3.6e-15 (8.9e-16 on
 *                                                   the real fixtures)
 *   Oklab->LMS' + ** 3       102 / 326256 (0.03%)  2.2e-16     1     <- pow
 *   LMS->RGB matrix            0 / 326256          0           0     EXACT
 *   clip + unlin()           104 / 326256 (0.03%)  2.2e-16     2     <- pow
 *   oklab_to_srgb            270 / 326256 (0.08%)  2.9e-15
 * Downstream (reconstruct.py:521-522, argmin over Oklab distance): 0 of
 * 1856 cell->center labels differ on the three fixtures; the smallest
 * best-vs-runner-up gap is 7.1e-6, ten orders above the miss.
 * tools/mutants-colorspace.js: 7/7 positive controls killed (x*x*x cube,
 * re-associated matrix, exclusive knees, constant typo, wrong 1/2.4,
 * clip after the branch), each on its own stage only.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  // np.clip(u, 0.0, 1.0) elementwise, via the base shim's fused two-sided
  // clip so the measured tie semantics (np.clip(-0.0, 0.0, 1.0) is -0.0, a
  // NaN stays NaN) are inherited rather than re-derived here.
  var clipScalar = PF.clipScalar;
  if (typeof clipScalar !== 'function' || typeof PF.checkLen !== 'function') {
    throw new Error('pf-10-colorspace.js needs pf-00-base.js loaded first');
  }

  // 1 / 2.4 exactly as Python evaluates it: a float64 division, so the
  // exponent handed to pow is 0.41666666666666669, not a rational 5/12.
  var INV_GAMMA = 1 / 2.4;

  function count3(a, n, what) {
    if (n === undefined || n === null) n = (a.length / 3) | 0;
    PF.checkLen(a, 3 * n, what);
    return n;
  }

  /* sRGB transfer function, forward: encoded [0,1] -> linear.
   * np.where evaluates BOTH branches for every element; the pow branch on a
   * negative base yields NaN and is discarded by the mask, so the result is
   * the same as this scalar if/else (a NaN input takes the pow branch in
   * both, since NaN <= 0.04045 is False). */
  function lin(u) {
    if (u <= 0.04045) return u / 12.92;
    return Math.pow((u + 0.055) / 1.055, 2.4);
  }

  /* sRGB transfer function, inverse: linear -> encoded, clipped to [0,1]
   * FIRST (np.clip runs before the branch in the reference). */
  function unlin(u) {
    u = clipScalar(u, 0.0, 1.0);
    if (u <= 0.0031308) return 12.92 * u;
    return 1.055 * Math.pow(u, INV_GAMMA) - 0.055;
  }

  /* ------------------------------------------------------------------ *
   * Forward, as three stages so the tests can pin each one:
   *   lmsLinear : lin() per channel, then the RGB->LMS matrix   (pow + matrix)
   *   cbrt3     : np.cbrt per element                            (cbrt)
   *   oklabFromLms : the LMS'->Oklab matrix                      (matrix only)
   *
   * The linear maps are evaluated left to right exactly as numpy does,
   * one rounding per operation and no FMA: ((A*r + B*g) + C*b). JS has no
   * fused multiply-add and evaluates a + b + c as (a + b) + c, so the
   * association matches without any parenthesising tricks.
   * ------------------------------------------------------------------ */
  function lmsLinear(rgb, n) {
    n = count3(rgb, n, 'lmsLinear input');
    var out = new Float64Array(3 * n), i, k, r, g, b;
    for (i = 0; i < n; i++) {
      k = 3 * i;
      r = lin(rgb[k]);
      g = lin(rgb[k + 1]);
      b = lin(rgb[k + 2]);
      out[k]     = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
      out[k + 1] = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
      out[k + 2] = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    }
    return out;
  }

  function cbrt3(lms, n) {
    n = count3(lms, n, 'cbrt3 input');
    var out = new Float64Array(3 * n), i;
    for (i = 0; i < 3 * n; i++) out[i] = Math.cbrt(lms[i]);
    return out;
  }

  function oklabFromLms(lms, n) {
    n = count3(lms, n, 'oklabFromLms input');
    var out = new Float64Array(3 * n), i, k, l, m, s;
    for (i = 0; i < n; i++) {
      k = 3 * i;
      l = lms[k]; m = lms[k + 1]; s = lms[k + 2];
      out[k]     = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      out[k + 1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
      out[k + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    }
    return out;
  }

  /* rgb float in [0,1], flat length 3n -> Oklab flat length 3n. */
  PF.srgb_to_oklab = function srgb_to_oklab(rgb, n) {
    n = count3(rgb, n, 'srgb_to_oklab input');
    return oklabFromLms(cbrt3(lmsLinear(rgb, n), n), n);
  };

  /* ------------------------------------------------------------------ *
   * Inverse, likewise in stages:
   *   lmsCubed   : the Oklab->LMS' matrix, then ** 3 per element (matrix + pow)
   *   rgbLinear  : the LMS->RGB matrix                            (matrix only)
   *   unlin3     : np.clip + inverse transfer per element         (pow)
   * The cube is pow(x, 3.0), see the header: numpy's ** 3 is not x*x*x.
   * ------------------------------------------------------------------ */
  function lmsCubed(lab, n) {
    n = count3(lab, n, 'lmsCubed input');
    var out = new Float64Array(3 * n), i, k, L, a, bb;
    for (i = 0; i < n; i++) {
      k = 3 * i;
      L = lab[k]; a = lab[k + 1]; bb = lab[k + 2];
      out[k]     = Math.pow(L + 0.3963377774 * a + 0.2158037573 * bb, 3);
      out[k + 1] = Math.pow(L - 0.1055613458 * a - 0.0638541728 * bb, 3);
      out[k + 2] = Math.pow(L - 0.0894841775 * a - 1.2914855480 * bb, 3);
    }
    return out;
  }

  function rgbLinear(lms, n) {
    n = count3(lms, n, 'rgbLinear input');
    var out = new Float64Array(3 * n), i, k, l, m, s;
    for (i = 0; i < n; i++) {
      k = 3 * i;
      l = lms[k]; m = lms[k + 1]; s = lms[k + 2];
      out[k]     = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      out[k + 1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      out[k + 2] = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    }
    return out;
  }

  function unlin3(rgb, n) {
    n = count3(rgb, n, 'unlin3 input');
    var out = new Float64Array(3 * n), i;
    for (i = 0; i < 3 * n; i++) out[i] = unlin(rgb[i]);
    return out;
  }

  /* Oklab flat length 3n -> sRGB encoded [0,1] flat length 3n. */
  PF.oklab_to_srgb = function oklab_to_srgb(lab, n) {
    n = count3(lab, n, 'oklab_to_srgb input');
    return unlin3(rgbLinear(lmsCubed(lab, n), n), n);
  };

  // internals exposed for tools/test-colorspace.js: stage-level parity and
  // the libm attribution of any whole-function miss
  PF._colorspace = {
    lin: lin, unlin: unlin, INV_GAMMA: INV_GAMMA,
    lmsLinear: lmsLinear, cbrt3: cbrt3, oklabFromLms: oklabFromLms,
    lmsCubed: lmsCubed, rgbLinear: rgbLinear, unlin3: unlin3
  };

  PF.versionColorspace = 'pf-10-colorspace/1';
})();
