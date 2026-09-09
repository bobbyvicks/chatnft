/* pf-03-cv2.js -- the OpenCV surface pixelfixer actually uses.
 *
 * Ported from the cv2 calls in pixelfixer (python), against cv2 5.0.0 as
 * shipped in the reference venv (opencv-python wheel, MSVC 19.44, IPP
 * 2026.0.0 linked, dispatched SSE4_1/AVX/AVX2(+FMA3)/AVX512_SKX code, run
 * on an AVX-512 machine). Only the modes the reference call sites use are
 * implemented; anything else throws rather than silently doing something
 * plausible-but-different.
 *
 * Provenance: two earlier runs were interrupted before reporting, so nothing
 * they wrote counted as verified. This (third) session kept their code,
 * regenerated fixtures/cv2-parity.json from the pristine reference (it is
 * identical to the file the second run left behind, ignoring timings), ran
 * tools/test-cv2.js and tools/mutation-cv2.js, and found the second run's
 * port wrong in exactly one place: cv2 5.x boxFilter has a separate small-
 * kernel path (blockSum, taken for float input with ksize <= 5x5) that the
 * port silently modelled with the wrong arithmetic (2 of 32 fixtures missed,
 * up to 70 float32 ulps). That path is now fenced off with a throw; the
 * reference only ever calls (1,7), which is not on it. The numbers quoted
 * here are from this session's runs: tools/test-cv2.js 634 pass / 0 fail
 * (randu64 8, medianBlur 26, boxFilter 50 exact + 19 blockSum-path throws,
 * getGaussianKernel 126, GaussianBlur 205, Laplacian 11, kmeans 50 x
 * {labels, centers, compactness}); tools/mutation-cv2.js 28 variants, 23
 * killed as expected, 5 not discriminated by the fixtures (named in the
 * source below where each applies).
 *
 * Call sites this covers (grep "cv2\." in pixelfixer/):
 *   medianBlur(uint8 HxW | HxWx3 | HxWx4, 3)   autocorr:53 channels:1314
 *                                              fusion:71 runlengths:49,50
 *   boxFilter(f32 HxW, -1, (1,7), BORDER_REPLICATE)          runlengths:69
 *   GaussianBlur(f32 HxW, (0,0), 1.0)                          selfsim:64
 *   Laplacian(f32 HxW, CV_32F)          [ksize=1 default]      selfsim:68
 *   setRNGSeed(12345 + seed)                                reconsearch:57
 *   kmeans(f32 Nx3, K, None, (EPS+MAX_ITER, n, eps), attempts, PP_CENTERS)
 *                                  quantize:49 reconsearch:62 reconstruct:517
 *   (autocorr:53 casts float32 -> uint8 with numpy .astype BEFORE calling
 *    medianBlur; that truncating cast is the caller's, not this file's.)
 *
 * Arithmetic model, each item measured bit-exact unless stated:
 *   medianBlur  integer; exact by construction. 1-pixel-wide/tall inputs
 *               take OpenCV's median-of-3-along-the-long-axis branch (a
 *               plain copy is killed by the 1-D fixtures).
 *   boxFilter   cv2 5.x boxFilter() has TWO float paths (box_filter.dispatch
 *               .cpp): ksize.width <= 5 && ksize.height <= 5 goes to
 *               BlockSum<double,float> (a ~300-line SIMD block kernel this
 *               port does NOT model -- PF.boxFilter throws there); anything
 *               larger goes through FilterEngine with the generic
 *               RowSum<float,double> / ColumnSum<double,float> templates
 *               (no float specialisations exist in 5.x): row sums are
 *               from-scratch, left to right, for ksize 3 and 5 and a
 *               RUNNING double sum (s += S[i+k] - S[i]) for every other
 *               width; column sums are always a running double sum seeded
 *               with the first kh-1 rows; each output is float32(sum *
 *               (1/(kw*kh))) with the scale in float64. Measured (tools/
 *               probe-box-ksweep*.py, big/tiny cancellation data that makes
 *               running and from-scratch sums differ): the FilterEngine
 *               model is bit-exact for kw 1..11,15,17 x kh 6..25 and kw
 *               6..33 x kh 1..7, and WRONG inside the 5x5 box for widths
 *               1, 2, 4 (blockSum is from-scratch there). On the real call
 *               site (kw=1, kh=7, integer-valued input) every sum is exact
 *               and the only rounding is float32(sum * (1/7)); float32
 *               scaling is killed by those fixtures. IPP on/off/noOpt give
 *               identical boxFilter output on every fixture.
 *   Gaussian    kernel: getGaussianKernelBitExact's structure (exp of the
 *               doubled offset times -0.125/sigma^2, sum = 2*half + 1,
 *               multiply by 1/sum) in float64, then cast to float32.
 *               OpenCV computes it in softdouble whose exp() is not the
 *               same code as Math.exp; both are within an ulp or two in
 *               float64 and the float32 cast absorbs that except at a
 *               rounding boundary (probability ~1e-8 per tap). Measured
 *               bit-exact on every kernel in the fixture sweep.
 *               Passes: plain row pass then symmetry-folded column pass,
 *               float32, RowFilter + SymmColumnFilter for a symmetric
 *               kernel longer than 5 taps. The AVX2 vector loops use fused
 *               multiply-add on columns [0, w - w%8); the scalar tail loop
 *               (multiply, round, add, round) covers the last w%8 columns
 *               of BOTH passes. All-FMA and all-scalar are both killed;
 *               IPP is not on this path (ENABLE_IPP_GAUSSIAN_BLUR is off in
 *               5.x and setUseIPP(False) changes nothing, measured up to
 *               width 257).
 *   Laplacian   default ksize=1 -> filter2D with [[0,1,0],[1,-4,1],[0,1,0]],
 *               five non-zero taps accumulated in row-major order in
 *               float32 (Filter2D / FilterVec_32f). float64 accumulation
 *               is killed. Its taps are powers of two, so fused vs plain
 *               multiply-add cannot differ here.
 *   kmeans      OpenCV 5.x kmeans.cpp, line for line: k-means++ seeding
 *               with SPP_TRIALS=3, float32 distance buffers, scalar
 *               float32 hal::normL2Sqr_ (dims < SIMD width), the
 *               CV_ENABLE_UNROLLED 8-way float partial sums of the trial
 *               distances, float32 centre sums times float32(1/n),
 *               empty-cluster theft of the farthest point (last max wins),
 *               squared-epsilon centre-shift stop, attempts kept by lowest
 *               compactness, and a final scoring pass that does not
 *               reassign labels. Compactness is cv::sum over CV_64F
 *               (4-way unrolled double adds).
 *   RNG         cv::RNG is a 32-bit multiply-with-carry
 *               (state = lo32 * 4164903690 + hi32, 64-bit wrap),
 *               reproduced here (PF.setRNGSeed / PF.theRNG). Verified two
 *               ways: kmeans replays match cv2 bit-exact, and the full
 *               64-bit state matches cv2.randu(CV_64F) for 8 seeds. Like
 *               cv2, kmeans draws from one process-global RNG whose fresh
 *               state is 0xffffffff, so an UNSEEDED call (quantize.py never
 *               seeds) is reproducible only if the pipeline port makes the
 *               same kmeans calls in the same order from a fresh state.
 *
 * Conventions (same spine as pf-00-base.js): a 2-D image is {d, w, h} with a
 * flat typed array, plus cn for interleaved channels. Never arrays of
 * arrays. Float functions take Float32Array and return Float32Array;
 * medianBlur takes/returns Uint8Array or Uint8ClampedArray. kmeans takes an
 * N x dims float32 matrix as {d, w: dims, h: N}.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  // v_float32 lane count of the dispatched AVX2 filter code. The SIMD loops
  // in filter.simd.hpp consume columns in multiples of this and leave the
  // remainder to scalar code (measured: the boundary is w - w%8 for every
  // width 1..40 and 64..257 in the fixtures, four kernel sizes, both passes).
  var LANES = 8;

  var DBL_EPSILON = 2.220446049250313e-16;
  var FLT_EPSILON = 1.1920928955078125e-7;
  var DBL_MAX = Number.MAX_VALUE;

  // ------------------------------------------------------------------ misc

  // cv::borderInterpolate(p, len, BORDER_REPLICATE)
  function repl(p, n) { return p < 0 ? 0 : (p >= n ? n - 1 : p); }

  // cv::borderInterpolate(p, len, BORDER_REFLECT_101)
  function refl101(p, n) {
    if (n === 1) return 0;
    while (p < 0 || p >= n) p = p < 0 ? -p : 2 * n - 2 - p;
    return p;
  }

  // cvRound: round-half-to-EVEN (SSE cvtsd2si under the default rounding
  // mode), not Math.round's half-up. Differs only on exact .5 ties.
  function cvRound(v) {
    var i = Math.floor(v), f = v - i;
    if (f > 0.5) return i + 1;
    if (f < 0.5) return i;
    return (i & 1) ? i + 1 : i;
  }

  function mn(a, b) { return a < b ? a : b; }
  function mx(a, b) { return a < b ? b : a; }

  function isU8(a) { return a instanceof Uint8Array || a instanceof Uint8ClampedArray; }
  function isF32(a) { return a instanceof Float32Array; }

  // Every shape or dtype mistake throws: an instrument failure must not be
  // able to present as a measurement.
  function checkMat(m, what, pred, kindName, maxCn) {
    if (!m || typeof m !== 'object') throw new Error(what + ': expected a {d, w, h} image');
    var w = m.w | 0, h = m.h | 0, cn = (m.cn === undefined || m.cn === null) ? 1 : (m.cn | 0);
    if (w <= 0 || h <= 0) throw new Error(what + ': empty image (' + w + 'x' + h + ')');
    if (cn < 1) throw new Error(what + ': cn must be >= 1');
    if (maxCn && cn > maxCn) throw new Error(what + ': only cn <= ' + maxCn + ' is implemented, got ' + cn);
    if (!pred(m.d)) throw new Error(what + ': d must be a ' + kindName);
    if (m.d.length !== w * h * cn) {
      throw new Error(what + ': d.length ' + m.d.length + ' != w*h*cn ' + (w * h * cn));
    }
    return { w: w, h: h, cn: cn };
  }

  // ------------------------------------------------------- medianBlur (k=3)

  // 9-element median by sorting network (the shape OpenCV's
  // medianBlur_SortNet uses). Exact -- any correct median agrees.
  function median9(p0, p1, p2, p3, p4, p5, p6, p7, p8) {
    var t;
    t = mn(p1, p2); p2 = mx(p1, p2); p1 = t;
    t = mn(p4, p5); p5 = mx(p4, p5); p4 = t;
    t = mn(p7, p8); p8 = mx(p7, p8); p7 = t;
    t = mn(p0, p1); p1 = mx(p0, p1); p0 = t;
    t = mn(p3, p4); p4 = mx(p3, p4); p3 = t;
    t = mn(p6, p7); p7 = mx(p6, p7); p6 = t;
    t = mn(p1, p2); p2 = mx(p1, p2); p1 = t;
    t = mn(p4, p5); p5 = mx(p4, p5); p4 = t;
    t = mn(p7, p8); p8 = mx(p7, p8); p7 = t;
    t = mn(p0, p3); p3 = mx(p0, p3); p0 = t;
    t = mn(p5, p8); p8 = mx(p5, p8); p5 = t;
    t = mn(p4, p7); p7 = mx(p4, p7); p4 = t;
    t = mn(p3, p6); p6 = mx(p3, p6); p3 = t;
    t = mn(p1, p4); p4 = mx(p1, p4); p1 = t;
    t = mn(p2, p5); p5 = mx(p2, p5); p2 = t;
    t = mn(p4, p7); p7 = mx(p4, p7); p4 = t;
    t = mn(p2, p4); p4 = mx(p2, p4); p2 = t;
    t = mn(p4, p6); p6 = mx(p4, p6); p4 = t;
    t = mn(p2, p4); p4 = mx(p2, p4); p2 = t;
    return p4;
  }
  PF.median9 = median9;

  /**
   * cv2.medianBlur(src, 3) for 8-bit data with 1..4 interleaved channels
   * (cv2 5.0.0 accepts cn=2 too; measured).
   * Border is BORDER_REPLICATE (index clamping); channels are independent.
   * A 1-pixel-wide or 1-pixel-tall image takes OpenCV's degenerate branch:
   * a 1-D median-of-3 along the long axis (it is NOT a plain copy).
   *
   * @param {{d:Uint8Array|Uint8ClampedArray, w:number, h:number, cn?:number}} src
   * @param {number} ksize  must be 3 (the only size pixelfixer uses)
   * @returns {{d, w, h, cn}} new buffer of src.d's constructor
   */
  PF.medianBlur = function (src, ksize) {
    if (ksize !== 3) throw new Error('PF.medianBlur: only ksize=3 is implemented, got ' + ksize);
    var s = checkMat(src, 'PF.medianBlur', isU8, 'Uint8Array or Uint8ClampedArray', 4);
    var w = s.w, h = s.h, cn = s.cn, d = src.d;
    var out = new d.constructor(w * h * cn);
    var i, j, c;

    if (w === 1 || h === 1) {
      // OpenCV medianBlur_SortNet, m == 3, degenerate branch: median of 3
      // along the long axis, ends replicated.
      var len = w + h - 1;
      var step = (h === 1) ? cn : w * cn;
      for (i = 0; i < len; i++) {
        for (c = 0; c < cn; c++) {
          var q = i * step + c;
          var a0 = d[i > 0 ? q - step : q];
          var a1 = d[q];
          var a2 = d[i < len - 1 ? q + step : q];
          out[q] = mx(mn(a0, a1), mn(mx(a0, a1), a2));
        }
      }
      return { d: out, w: w, h: h, cn: cn };
    }

    for (i = 0; i < h; i++) {
      var r0 = repl(i - 1, h) * w * cn;
      var r1 = i * w * cn;
      var r2 = repl(i + 1, h) * w * cn;
      for (j = 0; j < w; j++) {
        var c0 = repl(j - 1, w) * cn;
        var c1 = j * cn;
        var c2 = repl(j + 1, w) * cn;
        for (c = 0; c < cn; c++) {
          out[r1 + c1 + c] = median9(
            d[r0 + c0 + c], d[r0 + c1 + c], d[r0 + c2 + c],
            d[r1 + c0 + c], d[r1 + c1 + c], d[r1 + c2 + c],
            d[r2 + c0 + c], d[r2 + c1 + c], d[r2 + c2 + c]);
        }
      }
    }
    return { d: out, w: w, h: h, cn: cn };
  };

  // ---------------------------------------------------------------- boxFilter

  /**
   * cv2.boxFilter(src, -1, (kw, kh), borderType=cv2.BORDER_REPLICATE) for a
   * single-channel float32 image, normalize=true, anchor at the centre
   * (anchor = ksize>>1, OpenCV's meaning of anchor=(-1,-1)). The 1-row /
   * 1-column kernel collapse only happens under BORDER_ISOLATED in OpenCV,
   * which the reference never sets, so it is not applied here (measured on
   * the 1x19 and 23x1 fixtures).
   *
   * cv2 5.x boxFilter() (box_filter.dispatch.cpp) sends float input with
   *     ksize.width <= 5 && ksize.height <= 5
   * to a separate BlockSum<double,float> kernel whose arithmetic this port
   * does not model; PF.boxFilter THROWS for those sizes. Measured: inside
   * that box widths 1, 2 and 4 are from-scratch sums, which the model below
   * gets wrong by up to 70 float32 ulps on cancellation data (fixtures
   * alternating_big_tiny_along_row_k1x1, blocks_big_then_tiny_cols_k4x2).
   * pixelfixer's only call is (1, 7): height 7 is outside the box.
   *
   * Everything else goes through FilterEngine with OpenCV 5.x
   * box_filter.simd.hpp's generic templates (there is no <float,double>
   * specialisation):
   *   RowSum<float,double>:   ksize 3 / 5 sum the taps from scratch
   *                           (left to right); any other width keeps a
   *                           RUNNING double sum, s += S[i+k] - S[i].
   *   ColumnSum<double,float>: RUNNING double sum, seeded with the first
   *                           kh-1 (border-replicated) rows, then per output
   *                           row  s0 = SUM + newest;  D = float32(s0*scale);
   *                           SUM = s0 - oldest.
   * The running sums carry rounding history: with a block of huge rows
   * followed by tiny rows the output over the tiny block is NOT the exact
   * mean (fixture blocks_big_then_tiny_rows_k1x7 pins this). On the real
   * call site (integer-valued input) every sum is exact and the only
   * rounding is float32(sum * (1/7)).
   *
   * @param {{d:Float32Array, w, h}} src
   * @param {number[]} ksize  [kw, kh] in cv2's (width, height) order
   * @param {{borderType?:'replicate', normalize?:true}} [opts]
   * @returns {{d:Float32Array, w, h}}
   */
  PF.boxFilter = function (src, ksize, opts) {
    var s = checkMat(src, 'PF.boxFilter', isF32, 'Float32Array', 1);
    if (!ksize || ksize.length !== 2) throw new Error('PF.boxFilter: ksize must be [kw, kh]');
    var kw = ksize[0] | 0, kh = ksize[1] | 0;
    if (kw < 1 || kh < 1) throw new Error('PF.boxFilter: ksize must be >= 1');
    opts = opts || {};
    if (opts.borderType !== undefined && opts.borderType !== 'replicate') {
      throw new Error('PF.boxFilter: only borderType "replicate" is implemented');
    }
    if (opts.normalize !== undefined && opts.normalize !== true) {
      throw new Error('PF.boxFilter: only normalize=true is implemented');
    }
    if (kw <= 5 && kh <= 5) {
      throw new Error('PF.boxFilter: ksize ' + kw + 'x' + kh + ' takes cv2 5.x\'s blockSum path ' +
        '(float input, width <= 5 and height <= 5), whose arithmetic this port does not model; ' +
        'pixelfixer only calls (1, 7)');
    }
    return boxFilterEngine(src.d, s.w, s.h, kw, kh);
  };

  // The FilterEngine model on its own, no guards. Exposed so tools/test-cv2.js
  // can show the blockSum guard fences off REAL differences: on the
  // blockSum-path fixtures this model must disagree with cv2 exactly where
  // the parity script's independent numpy model does.
  PF._boxFilterEngine = function (src, kw, kh) {
    var s = checkMat(src, 'PF._boxFilterEngine', isF32, 'Float32Array', 1);
    return boxFilterEngine(src.d, s.w, s.h, kw | 0, kh | 0);
  };

  function boxFilterEngine(d, w, h, kw, kh) {
    var ax = kw >> 1, ay = kh >> 1;
    var i, j, t, ro, acc;

    // Row pass: RowSum<float, double> over each border-padded row.
    var padW = w + kw - 1;
    var pad = new Float64Array(padW);
    var rows = new Float64Array(w * h);
    for (i = 0; i < h; i++) {
      ro = i * w;
      for (t = 0; t < padW; t++) pad[t] = d[ro + repl(t - ax, w)];
      if (kw === 3) {
        for (j = 0; j < w; j++) rows[ro + j] = pad[j] + pad[j + 1] + pad[j + 2];
      } else if (kw === 5) {
        for (j = 0; j < w; j++) rows[ro + j] = pad[j] + pad[j + 1] + pad[j + 2] + pad[j + 3] + pad[j + 4];
      } else {
        acc = 0;
        for (t = 0; t < kw; t++) acc += pad[t];
        rows[ro] = acc;
        for (j = 0; j < w - 1; j++) {
          acc += pad[j + kw] - pad[j];          // s += (ST)S[i + ksz] - (ST)S[i]
          rows[ro + j + 1] = acc;
        }
      }
    }

    // Column pass: ColumnSum<double, float>, one running sum per column.
    var out = new Float32Array(w * h);
    var scale = 1.0 / (kw * kh);
    var haveScale = scale !== 1;
    var SUM = new Float64Array(w);
    for (t = 0; t < kh - 1; t++) {
      var rb = repl(t - ay, h) * w;
      for (j = 0; j < w; j++) SUM[j] += rows[rb + j];
    }
    for (i = 0; i < h; i++) {
      ro = i * w;
      var sp = repl(i - ay + kh - 1, h) * w;   // newest row of this window
      var sm = repl(i - ay, h) * w;            // oldest row, dropped for the next
      for (j = 0; j < w; j++) {
        var s0 = SUM[j] + rows[sp + j];
        out[ro + j] = haveScale ? s0 * scale : s0;   // the store is the float32 cast
        SUM[j] = s0 - rows[sm + j];
      }
    }
    return { d: out, w: w, h: h };
  }

  // ------------------------------------------------------------ Gaussian

  // getGaussianKernelBitExact's fixed tables (used only when sigma <= 0).
  var SMALL_GAUSSIAN_TAB = {
    1: [1],
    3: [0.25, 0.5, 0.25],
    5: [0.0625, 0.25, 0.375, 0.25, 0.0625],
    7: [0.03125, 0.109375, 0.21875, 0.28125, 0.21875, 0.109375, 0.03125],
    9: [4 / 256, 13 / 256, 30 / 256, 51 / 256, 60 / 256, 51 / 256, 30 / 256, 13 / 256, 4 / 256]
  };

  /**
   * cv2.getGaussianKernel(n, sigma, cv2.CV_32F), OpenCV 5.x
   * getGaussianKernelBitExact reproduced step for step in float64 and cast
   * to float32 at the end. Even n is accepted like OpenCV (two equal centre
   * taps).
   *
   * Caveat (see header): OpenCV's exp is cv::softdouble's own polynomial,
   * not the platform libm; Math.exp can differ from it by an ulp or two in
   * float64, which the float32 cast absorbs except at a rounding boundary.
   * For sigma <= 0 with n outside the fixed tables, OpenCV derives sigma with
   * a FUSED n*0.15+0.35; JS rounds the product first (one possible ulp of
   * float64 difference in an unused mode; the fixture sweep measures it).
   * @returns {Float32Array}
   */
  PF.getGaussianKernel = function (n, sigma) {
    n = n | 0;
    if (n < 1) throw new Error('PF.getGaussianKernel: n must be >= 1');
    sigma = +sigma;
    if (!(sigma === sigma)) throw new Error('PF.getGaussianKernel: sigma is NaN');
    var res = new Float64Array(n), i, x, t;
    if (sigma <= 0 && SMALL_GAUSSIAN_TAB[n]) {
      var tab = SMALL_GAUSSIAN_TAB[n];
      for (i = 0; i < n; i++) res[i] = tab[i];
    } else {
      var sigmaX = sigma > 0 ? sigma : n * 0.15 + 0.35;   // mulAdd(n, 0.15, 0.35) in OpenCV
      var scale2X = -0.125 / (sigmaX * sigmaX);           // -0.5*0.25 / sigma^2
      var n2 = (n - 1) >> 1;
      var values = new Float64Array(n2 + 1);
      var sum = 0;
      for (i = 0, x = 1 - n; i < n2; i++, x += 2) {
        t = Math.exp((x * x) * scale2X);                   // x is the doubled offset
        values[i] = t;
        sum += t;
      }
      sum *= 2;
      sum += 1;                                            // the centre tap, exp(0)
      if ((n & 1) === 0) sum += 1;
      var mul1 = 1 / sum;
      for (i = 0; i < n2; i++) {
        t = values[i] * mul1;
        res[i] = t;
        res[n - 1 - i] = t;
      }
      res[n2] = 1 * mul1;
      if ((n & 1) === 0) res[n2 + 1] = res[n2];
    }
    var k = new Float32Array(n);
    for (i = 0; i < n; i++) k[i] = res[i];                 // store is the (float) cast
    return k;
  };

  /**
   * cv2.GaussianBlur(src, ksize, sigmaX, sigmaY=0) for a single-channel
   * float32 image with the default BORDER_REFLECT_101.
   *
   * ksize 0 (or [0,0]) is derived the way OpenCV does for a non-CV_8U depth:
   *     ksize = cvRound(sigma * 4 * 2 + 1) | 1
   * (the factor is 3 for CV_8U and 4 otherwise; this port is float32-only).
   * A 1-pixel-tall image collapses ksize.height to 1 BEFORE that derivation
   * (and likewise width), exactly as cv::GaussianBlur does.
   *
   * Separable: plain row pass, then symmetry-folded column pass, the pair
   * OpenCV instantiates for a symmetric kernel longer than 5 taps
   * (RowFilter + SymmColumnFilter). Each pass is float32 with fused
   * multiply-add on columns [0, w - w%8) and plain multiply-then-add on the
   * last w%8 columns -- the split between the AVX2 vector loop and its
   * scalar tail. See the header for the measurements.
   *
   * ksize <= 5 (sigma below ~0.56 with ksize 0) throws: OpenCV switches to
   * SymmRowSmallFilter/SymmColumnSmallFilter there, a different summation
   * order this port does not model. pixelfixer only calls sigma = 1.0.
   *
   * @param {{d:Float32Array, w, h}} src
   * @param {number|number[]} ksize  0 or [kw, kh]
   * @returns {{d:Float32Array, w, h}}
   */
  PF.GaussianBlur = function (src, ksize, sigmaX, sigmaY) {
    var s = checkMat(src, 'PF.GaussianBlur', isF32, 'Float32Array', 1);
    var w = s.w, h = s.h;
    var kw, kh;
    if (ksize === 0 || ksize === undefined || ksize === null) { kw = 0; kh = 0; }
    else if (ksize.length === 2) { kw = ksize[0] | 0; kh = ksize[1] | 0; }
    else throw new Error('PF.GaussianBlur: ksize must be 0 or [kw, kh]');
    sigmaX = +sigmaX;
    sigmaY = (sigmaY === undefined || sigmaY === null) ? 0 : +sigmaY;
    if (!(sigmaX === sigmaX)) throw new Error('PF.GaussianBlur: sigmaX is NaN');

    // cv::GaussianBlur collapses the kernel on a degenerate axis first
    if (h === 1) kh = 1;
    if (w === 1) kw = 1;
    if (kw === 1 && kh === 1) return { d: new Float32Array(src.d), w: w, h: h };

    // cv::createGaussianKernels
    if (sigmaY <= 0) sigmaY = sigmaX;
    if (kw <= 0 && sigmaX > 0) kw = cvRound(sigmaX * 4 * 2 + 1) | 1;
    if (kh <= 0 && sigmaY > 0) kh = cvRound(sigmaY * 4 * 2 + 1) | 1;
    if (kw <= 0 || kw % 2 !== 1 || kh <= 0 || kh % 2 !== 1) {
      throw new Error('PF.GaussianBlur: ksize must be positive and odd, got ' + kw + 'x' + kh);
    }
    if ((kw > 1 && kw <= 5) || (kh > 1 && kh <= 5)) {
      throw new Error('PF.GaussianBlur: ksize ' + kw + 'x' + kh + ' <= 5 takes OpenCV\'s ' +
        'small-kernel filters, which this port does not model (sigma must be >= ~0.57)');
    }
    var sx = Math.max(sigmaX, 0), sy = Math.max(sigmaY, 0);
    var kx = PF.getGaussianKernel(kw, sx);
    var ky = (kh === kw && Math.abs(sx - sy) < DBL_EPSILON) ? kx : PF.getGaussianKernel(kh, sy);
    return { d: sepFilterSymm32(src.d, w, h, kx, ky), w: w, h: h };
  };

  // Exact float32 fused multiply-add for float32 operands, emulated.
  // a*b is exact in float64 (24+24 bits), so the only hazard is the float64
  // add rounding: p + c can need more than 53 bits, and rounding that to 53
  // and then to 24 bits ("double rounding") is wrong exactly when the
  // 53-bit value lands on a float32 midpoint that the exact sum is not on
  // (about 2^-29 of operations). TwoSum recovers the exact residual, so the
  // midpoint case can be broken in the direction of the true sum.
  var f32buf = new Float32Array(1), i32buf = new Int32Array(f32buf.buffer);
  function f32Neighbour(r, up) {           // adjacent float32 towards +inf (up) or -inf
    if (r === 0) return up ? 1.401298464324817e-45 : -1.401298464324817e-45;
    f32buf[0] = r;
    i32buf[0] += ((r > 0) === up) ? 1 : -1;   // away from zero: magnitude bits + 1
    return f32buf[0];
  }
  function fmaf(a, b, c) {
    var p = a * b;                          // exact
    var s = p + c;                          // float64-rounded sum
    var r = fr(s);
    if (r === s) return r;                  // s is a float32: residual < half a float32 ulp
    var bb = s - p;
    var err = (p - (s - bb)) + (c - bb);    // TwoSum: p + c == s + err exactly
    if (err === 0) return r;                // s was exact
    var other = f32Neighbour(r, s > r);     // the float32 on the far side of s
    if ((r - s) !== (s - other)) return r;  // s is not a midpoint: r is correct
    if (err > 0) return r > other ? r : other;
    return r < other ? r : other;
  }
  PF._fmaf = fmaf;                          // exposed for the negative control in tools/test-cv2.js

  // Row pass (plain taps) then column pass (symmetric fold), float32.
  // Columns below w8 follow the vector loop (fma), the rest the scalar tail.
  // Sums of two float32 values and products of two float32 values are exact
  // in float64, so fr(x + y) and fr(k * x) are the correctly rounded float32
  // add and multiply; only the fused step needs fmaf.
  function sepFilterSymm32(src, w, h, kx, ky) {
    var nx = kx.length, rx = nx >> 1;
    var ry = ky.length >> 1;
    var w8 = w - (w % LANES);
    var tmp = new Float32Array(w * h);
    var i, j, t, s, ro, a, b, q;
    for (i = 0; i < h; i++) {
      ro = i * w;
      for (j = 0; j < w8; j++) {
        s = 0;
        for (t = 0; t < nx; t++) s = fmaf(kx[t], src[ro + refl101(j - rx + t, w)], s);
        tmp[ro + j] = s;
      }
      for (j = w8; j < w; j++) {
        s = fr(kx[0] * src[ro + refl101(j - rx, w)]);
        for (t = 1; t < nx; t++) s = fr(s + fr(kx[t] * src[ro + refl101(j - rx + t, w)]));
        tmp[ro + j] = s;
      }
    }
    var out = new Float32Array(w * h);
    var up = new Int32Array(ry + 1), dn = new Int32Array(ry + 1);
    for (i = 0; i < h; i++) {
      ro = i * w;
      for (q = 1; q <= ry; q++) {
        dn[q] = refl101(i + q, h) * w;
        up[q] = refl101(i - q, h) * w;
      }
      for (j = 0; j < w8; j++) {
        s = fr(ky[ry] * tmp[ro + j]);                 // v_muladd(x, k0, delta=0)
        for (q = 1; q <= ry; q++) {
          a = tmp[dn[q] + j];
          b = tmp[up[q] + j];
          s = fmaf(ky[ry + q], fr(a + b), s);         // v_muladd(a+b, k, s)
        }
        out[ro + j] = s;
      }
      for (j = w8; j < w; j++) {
        s = fr(ky[ry] * tmp[ro + j]);                 // ky[0]*src[0][i] + delta
        for (q = 1; q <= ry; q++) {
          a = tmp[dn[q] + j];
          b = tmp[up[q] + j];
          s = fr(s + fr(ky[ry + q] * fr(a + b)));     // s0 += ky[k]*(a + b)
        }
        out[ro + j] = s;
      }
    }
    return out;
  }

  // ------------------------------------------------------------- Laplacian

  /**
   * cv2.Laplacian(src, cv2.CV_32F) with the DEFAULT ksize=1 on a
   * single-channel float32 image: filter2D with
   *     [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
   * scale=1, delta=0, BORDER_DEFAULT (= BORDER_REFLECT_101).
   *
   * (ksize=3 is a DIFFERENT kernel -- [[2,0,2],[0,-8,0],[2,0,2]] -- and is
   * not what the reference calls; measured: default == ksize=1 != ksize=3.)
   *
   * filter2D drops the zero taps and accumulates the 5 survivors in
   * row-major order in float32. Reproduced; measured bit-exact.
   *
   * @param {{d:Float32Array, w, h}} src
   * @returns {{d:Float32Array, w, h}}
   */
  PF.Laplacian = function (src) {
    var s = checkMat(src, 'PF.Laplacian', isF32, 'Float32Array', 1);
    var w = s.w, h = s.h, d = src.d;
    var out = new Float32Array(w * h);
    var i, j, acc;
    for (i = 0; i < h; i++) {
      var rUp = refl101(i - 1, h) * w;
      var rMid = i * w;
      var rDn = refl101(i + 1, h) * w;
      for (j = 0; j < w; j++) {
        var cL = refl101(j - 1, w), cR = refl101(j + 1, w);
        acc = 0;                                  // filter2D's delta
        acc = fr(1 * d[rUp + j] + acc);
        acc = fr(1 * d[rMid + cL] + acc);
        acc = fr(-4 * d[rMid + j] + acc);
        acc = fr(1 * d[rMid + cR] + acc);
        acc = fr(1 * d[rDn + j] + acc);
        out[rMid + j] = acc;
      }
    }
    return { d: out, w: w, h: h };
  };

  // ------------------------------------------------------------------ RNG

  /**
   * cv::RNG -- multiply-with-carry, 64-bit state:
   *     state = (uint64)(unsigned)state * 4164903690 + (unsigned)(state >> 32)
   * Held as two uint32 halves; the 32x32 product is done in 16-bit pieces so
   * every intermediate stays below 2^53 (no BigInt: ES2017 target).
   */
  var RNG_COEFF = 4164903690;              // CV_RNG_COEFF
  var CB1 = Math.floor(RNG_COEFF / 65536), CB0 = RNG_COEFF % 65536;
  var TWO32 = 4294967296;

  function RNG(seed) { this.lo = 0; this.hi = 0; this.setState(seed); }

  // cv::RNG(uint64 state): state ? state : 0xffffffff. A JS number is taken
  // as a 64-bit two's complement integer (cv2.setRNGSeed(int) sign-extends).
  RNG.prototype.setState = function (seed) {
    if (seed === undefined || seed === null) seed = 0xffffffff;
    if (typeof seed !== 'number' || seed !== Math.floor(seed) || Math.abs(seed) > 9007199254740991) {
      throw new Error('PF.RNG: seed must be an integer Number');
    }
    var lo = seed % TWO32; if (lo < 0) lo += TWO32;
    var hi = Math.floor(seed / TWO32) % TWO32; if (hi < 0) hi += TWO32;
    if (lo === 0 && hi === 0) lo = 0xffffffff;
    this.lo = lo; this.hi = hi;
  };

  // RNG::next(): returns (unsigned)state
  RNG.prototype.next = function () {
    var lo = this.lo, hi = this.hi;
    var a0 = lo % 65536, a1 = Math.floor(lo / 65536);
    var p00 = a0 * CB0, p11 = a1 * CB1;
    var mid = a0 * CB1 + a1 * CB0;                       // < 2^33
    var midLo = mid % 65536, midHi = Math.floor(mid / 65536);
    var low = p00 + midLo * 65536;                       // < 2^33
    var carry = Math.floor(low / TWO32);
    low -= carry * TWO32;
    var high = p11 + midHi + carry;                      // exact high word, < 2^32
    low += hi;                                           // + (unsigned)(state >> 32)
    carry = Math.floor(low / TWO32);
    low -= carry * TWO32;
    high = (high + carry) % TWO32;                       // 64-bit wrap
    this.lo = low; this.hi = high;
    return low;
  };

  // RNG::operator double(): (((uint64)t << 32) | next()) * 2^-64, with the
  // uint64 -> double conversion rounding to nearest (one rounding in JS too).
  RNG.prototype.nextDouble = function () {
    var t = this.next();
    var u = this.next();
    return (t * TWO32 + u) * 5.421010862427522e-20;
  };

  PF.RNG = RNG;
  var globalRng = new RNG(0xffffffff);               // cv::theRNG() fresh state
  PF.theRNG = function () { return globalRng; };
  /** cv2.setRNGSeed(seed) */
  PF.setRNGSeed = function (seed) { globalRng.setState(seed); };

  // ---------------------------------------------------------------- kmeans

  PF.TERM_CRITERIA_COUNT = 1;
  PF.TERM_CRITERIA_MAX_ITER = 1;
  PF.TERM_CRITERIA_EPS = 2;
  PF.KMEANS_PP_CENTERS = 2;

  var SPP_TRIALS = 3;

  // Tunable the mutation controls flip to attribute a mismatch. The fixtures
  // cannot discriminate it (two trials would have to tie within float
  // rounding); it follows OpenCV 5.x kmeans.cpp generateCentersPP verbatim:
  //   #if CV_ENABLE_UNROLLED
  //     for (; i + 7 < N; i += 8)
  //         s += tdist2[i + 0] + tdist2[i + 1] + ... + tdist2[i + 7];
  //   #endif
  //   for (; i < N; i++) s += tdist2[i];
  // where tdist2 is float* (so the 8-term chain rounds to float32 at each +)
  // and s is double.
  PF._cv2 = { ppUnrolled: true };

  // hal::normL2Sqr_(const float*, const float*, n) below the SIMD width:
  // scalar float32 `d += t*t` with t = a-b in float32. No FMA (measured by
  // the K=1 fixtures, whose compactness is RNG-independent).
  function normL2Sqr32(a, ao, b, bo, dims) {
    var d = 0, j, t;
    for (j = 0; j < dims; j++) {
      t = fr(a[ao + j] - b[bo + j]);
      d = fr(d + fr(t * t));
    }
    return d;
  }

  // cv::sum() over a CV_64F row: the generic sum_ with 4-way unrolling.
  function sum64(v, n) {
    var s0 = 0, i = 0;
    for (; i <= n - 4; i += 4) s0 += v[i] + v[i + 1] + v[i + 2] + v[i + 3];
    for (; i < n; i++) s0 += v[i];
    return s0;
  }

  // generateCentersPP(data, centers, K, rng, trials): k-means++ seeding.
  function generateCentersPP(X, N, dims, K, rng, trials, outCenters) {
    var dist = new Float32Array(N), tdist = new Float32Array(N), tdist2 = new Float32Array(N);
    var centers = new Int32Array(K);
    var unrolled = PF._cv2.ppUnrolled;
    var sum0 = 0, i, j, k, sw, dd;

    centers[0] = rng.next() % N;                        // (unsigned)rng % N
    for (i = 0; i < N; i++) {
      dist[i] = normL2Sqr32(X, i * dims, X, centers[0] * dims, dims);
      sum0 += dist[i];
    }

    for (k = 1; k < K; k++) {
      var bestSum = DBL_MAX, bestCenter = -1;
      for (j = 0; j < trials; j++) {
        var p = rng.nextDouble() * sum0;
        var ci = 0;
        for (; ci < N - 1; ci++) {
          p -= dist[ci];
          if (p <= 0) break;
        }
        for (i = 0; i < N; i++) {                          // KMeansPPDistanceComputer
          dd = normL2Sqr32(X, i * dims, X, ci * dims, dims);
          tdist2[i] = dist[i] < dd ? dist[i] : dd;         // std::min(dd, dist[i])
        }
        var s = 0;
        i = 0;
        if (unrolled) {
          for (; i + 7 < N; i += 8) {
            s += fr(fr(fr(fr(fr(fr(fr(tdist2[i] + tdist2[i + 1]) + tdist2[i + 2]) + tdist2[i + 3]) +
              tdist2[i + 4]) + tdist2[i + 5]) + tdist2[i + 6]) + tdist2[i + 7]);
          }
        }
        for (; i < N; i++) s += tdist2[i];
        if (s < bestSum) {
          bestSum = s; bestCenter = ci;
          sw = tdist; tdist = tdist2; tdist2 = sw;
        }
      }
      if (bestCenter < 0) {
        throw new Error("PF.kmeans: can't update cluster center (check input for huge or NaN values)");
      }
      centers[k] = bestCenter;
      sum0 = bestSum;
      sw = dist; dist = tdist; tdist = sw;
    }

    for (k = 0; k < K; k++) {
      for (j = 0; j < dims; j++) outCenters[k * dims + j] = X[centers[k] * dims + j];
    }
  }

  /**
   * cv2.kmeans(data, K, None, criteria, attempts, cv2.KMEANS_PP_CENTERS)
   *
   * Draws from PF.theRNG() exactly as cv2 draws from cv::theRNG(): one
   * `unsigned` for the first centre and 2*3*(K-1) more words for the trials,
   * per attempt. Call PF.setRNGSeed(s) first to mirror cv2.setRNGSeed(s);
   * without it the state carries over from the previous call (fresh state
   * 0xffffffff), which is what quantize.py's unseeded calls rely on. A
   * private PF.RNG instance may be passed as `rng` instead of the global.
   *
   * @param {{d:Float32Array, w:number, h:number}} data  N x dims, row-major
   *        (w = dims, h = N)
   * @param {number} K
   * @param {{type?:number, maxCount:number, epsilon:number}} criteria
   *        cv2 TermCriteria; type defaults to EPS+MAX_ITER (all call sites)
   * @param {number} [attempts=1]
   * @param {PF.RNG} [rng=PF.theRNG()]
   * @returns {{compactness:number, labels:Int32Array, centers:{d:Float32Array,w:number,h:number}}}
   */
  PF.kmeans = function (data, K, criteria, attempts, rng) {
    var s = checkMat(data, 'PF.kmeans', isF32, 'Float32Array', 1);
    var N = s.h, dims = s.w, X = data.d;
    K = K | 0;
    if (K <= 0) throw new Error('PF.kmeans: K must be > 0');
    if (N < K) throw new Error("PF.kmeans: There can't be more clusters than elements (N=" + N + ', K=' + K + ')');
    if (dims > 3) {
      throw new Error('PF.kmeans: dims > 3 is outside what was measured against cv2 (hal::normL2Sqr_ ' +
        'has SIMD lanes for wide rows); pixelfixer only clusters RGB');
    }
    criteria = criteria || {};
    var type = (criteria.type === undefined || criteria.type === null)
      ? (PF.TERM_CRITERIA_COUNT | PF.TERM_CRITERIA_EPS) : (criteria.type | 0);
    var epsilon, maxCount;
    if (type & PF.TERM_CRITERIA_EPS) {
      if (typeof criteria.epsilon !== 'number') throw new Error('PF.kmeans: criteria.epsilon must be a number');
      epsilon = Math.max(criteria.epsilon, 0);
    } else epsilon = FLT_EPSILON;
    epsilon *= epsilon;
    if (type & PF.TERM_CRITERIA_COUNT) {
      if (typeof criteria.maxCount !== 'number') throw new Error('PF.kmeans: criteria.maxCount must be a number');
      maxCount = Math.min(Math.max(criteria.maxCount | 0, 2), 100);
    } else maxCount = 100;
    attempts = (attempts === undefined || attempts === null) ? 1 : (attempts | 0);
    attempts = Math.max(attempts, 1);
    if (K === 1) { attempts = 1; maxCount = 2; }
    if (rng === undefined || rng === null) rng = globalRng;
    else if (!(rng instanceof RNG)) throw new Error('PF.kmeans: rng must be a PF.RNG');

    var centers = new Float32Array(K * dims), oldCenters = new Float32Array(K * dims);
    var temp = new Float32Array(dims);
    var counters = new Int32Array(K);
    var dists = new Float64Array(N);
    var labels = new Int32Array(N);
    var bestCompactness = DBL_MAX;
    var bestCenters = new Float32Array(K * dims), bestLabels = new Int32Array(N);
    var a, iter, i, j, k, k1, sw, base, sb, t;

    for (a = 0; a < attempts; a++) {
      var compactness = 0;
      for (iter = 0; ;) {
        var maxShift = iter === 0 ? DBL_MAX : 0;
        sw = centers; centers = oldCenters; oldCenters = sw;

        if (iter === 0) {
          generateCentersPP(X, N, dims, K, rng, SPP_TRIALS, centers);
        } else {
          // compute centers
          centers.fill(0);
          counters.fill(0);
          for (i = 0; i < N; i++) {
            k = labels[i]; base = k * dims; sb = i * dims;
            for (j = 0; j < dims; j++) centers[base + j] = fr(centers[base + j] + X[sb + j]);
            counters[k]++;
          }
          for (k = 0; k < K; k++) {
            if (counters[k] !== 0) continue;
            // empty cluster: take the farthest point out of the largest one
            var maxK = 0;
            for (k1 = 1; k1 < K; k1++) if (counters[maxK] < counters[k1]) maxK = k1;
            var maxDist = 0, farthest = -1;
            var sc = fr(1 / counters[maxK]);
            for (j = 0; j < dims; j++) temp[j] = fr(centers[maxK * dims + j] * sc);
            for (i = 0; i < N; i++) {
              if (labels[i] !== maxK) continue;
              var dd = normL2Sqr32(X, i * dims, temp, 0, dims);
              if (maxDist <= dd) { maxDist = dd; farthest = i; }   // last max wins
            }
            counters[maxK]--; counters[k]++;
            labels[farthest] = k;
            for (j = 0; j < dims; j++) {
              centers[maxK * dims + j] = fr(centers[maxK * dims + j] - X[farthest * dims + j]);
              centers[k * dims + j] = fr(centers[k * dims + j] + X[farthest * dims + j]);
            }
          }
          for (k = 0; k < K; k++) {
            if (counters[k] === 0) throw new Error('PF.kmeans: internal: empty cluster survived reassignment');
            var scale = fr(1 / counters[k]);     // 1.f/counters[k]: exact for n < 2^27 (no double-rounding)
            base = k * dims;
            for (j = 0; j < dims; j++) centers[base + j] = fr(centers[base + j] * scale);
            if (iter > 0) {
              var d2 = 0;
              for (j = 0; j < dims; j++) {
                t = fr(centers[base + j] - oldCenters[base + j]);   // float - float, widened
                d2 += t * t;
              }
              if (maxShift < d2) maxShift = d2;
            }
          }
        }

        var isLast = (++iter === Math.max(maxCount, 2)) || (maxShift <= epsilon);

        if (isLast) {
          // don't re-assign labels to avoid creation of empty clusters
          for (i = 0; i < N; i++) dists[i] = normL2Sqr32(X, i * dims, centers, labels[i] * dims, dims);
          compactness = sum64(dists, N);
          break;
        }
        // assign labels
        for (i = 0; i < N; i++) {
          var kBest = 0, minD = DBL_MAX;
          sb = i * dims;
          for (k = 0; k < K; k++) {
            var dk = normL2Sqr32(X, sb, centers, k * dims, dims);
            if (minD > dk) { minD = dk; kBest = k; }   // strict: first min wins
          }
          dists[i] = minD;
          labels[i] = kBest;
        }
      }

      if (compactness < bestCompactness) {
        bestCompactness = compactness;
        bestCenters.set(centers);
        bestLabels.set(labels);
      }
    }

    return { compactness: bestCompactness, labels: bestLabels, centers: { d: bestCenters, w: dims, h: K } };
  };

  PF.versionCv2 = 'pf-03-cv2/4';
  if (typeof module !== 'undefined' && module.exports) module.exports = PF;
})();
