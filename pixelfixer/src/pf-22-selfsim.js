/* pf-22-selfsim.js -- port of pixelfixer/selfsim.py (402 lines).
 *
 * Shift self-similarity grid detection.
 *
 * Core signal: for a pixel grid with cell size s, the dissimilarity curve
 *     d(t) = mean |F(x) - F(x+t)|      (per axis)
 * has local minima at t = k*s (the grid re-aligns with itself) and maxima
 * near half offsets. d(t) is phase-free, so sprite sheets with per-region
 * phase shifts still give a clean curve.
 *
 * Empirical findings driving the design (see the reference's FINDINGS.md):
 * - raw RGB d(t) is a featureless monotone trend; gradient-family features
 *   (|grad|, blurred |grad|, |Laplacian|) carry the periodicity: cell
 *   boundaries form a spike train with period s that re-aligns under shift
 *   k*s regardless of cell colors.
 * - Content periodicity (sprite spacing, star fields) produces the
 *   *strongest* minima; the pixel grid is the *finest* consistent period.
 *   Selection must therefore prefer the smallest period whose evidence is
 *   consistent across many harmonics, not the largest score.
 * - Score = t-statistic of the comb contrasts c_k = d(half offsets) - d(k p)
 *   over k: true fundamentals are consistent over many k (high t), content
 *   periods have few harmonics, noise is inconsistent.
 * - Mush/drift destroy the global curve; per-tile curves (normalized, then
 *   score-aggregated across tiles) recover local structure.
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES. Every numpy/cv2 semantic below was MEASURED on the reference
 * venv (python 3.12.10, numpy 2.5.3, cv2 5.0.0, X86_V3 dispatch) by
 * tools/parity-selfsim.py + tools/test-selfsim.js, not inferred. Where the
 * reference is float32 the port rounds with Math.fround at every operation;
 * for float32 operands + - * / computed in float64 and rounded once to
 * float32 IS the float32 operation (53 >= 2*24+2 bits), measured 0/100000
 * mismatches on float32 adds of mixed magnitude.
 *
 *  dtype trail.  rgb/alpha/luma/blur/gradients/Laplacian are float32 (NEP 50:
 *  a Python float next to a float32 array is cast to float32 first, so
 *  luma = fr(fr(fr(r*fr(.299)) + fr(g*fr(.587))) + fr(b*fr(.114))) and
 *  alpha = fr(a/255)). The tile accumulators num/den are np.zeros -> float64,
 *  but everything that FEEDS them (|A-B|, wt*wt, their product, both
 *  add.reduceat passes and the degenerate nu.sum()/(ny*nx)) is float32 and
 *  is rounded as such; the float32 value is then widened exactly. From
 *  _group onward everything is float64.
 *
 *  np.sum / .mean / .std reductions are numpy's PAIRWISE sum seeded with the
 *  identity 0 (PF.sum; "a0 + pairwise(rest)" is measured wrong ~50-75% of
 *  the time at n >= 9).  np.add.reduceat is different: it copies the FIRST
 *  element of each segment and reduces the REST pairwise into it (ufunc
 *  PyUFunc_Reduceat; measured 15/15 on strided float32 segments) -- see
 *  reduceat2 below, whose row pass is the same tree vectorised across
 *  columns so each column sees exactly numpy's summation order. Multi-axis
 *  .sum(axis=(0,1)) on the (ny,nx,T) tile grid is a SEQUENTIAL elementwise
 *  accumulation over tiles in row-major order (the iterator puts the
 *  contiguous T axis innermost, so no pairwise tree applies); the fixtures
 *  pin this through _group.
 *
 *  np.argsort (two sites: _local_maxima's ranking and the weighted median)
 *  is numpy's DEFAULT kind, which on this machine is the x86-simd-sort AVX2
 *  kernel; its tie order is reproduced by PF._scipyInternals.argsortNumpy
 *  (pf-02-scipy.js, measured 1155/1155 permutations). A stable sort would
 *  differ on ties, and _local_maxima ranks peaks whose scores CAN tie.
 *
 *  np.convolve(pad, ones(9)/9, 'valid') goes through numpy's small_correlate
 *  (kernel length <= 11): a plain `s = 0; s += d[i+j]*k[j]` in float64, no
 *  BLAS, no FMA (the multiarray module is compiled for the X86_V2 baseline,
 *  which has no FMA).  np.interp is PF.interp (bit-exact port).  np.arange
 *  with a fractional step is PF.arange (numpy's start + i*(out[1]-out[0])
 *  fill, NOT start + i*step).  Python round() / np.round are half-to-even:
 *  PF.rint.  kdecay ** (k-1) is Math.pow, measured bit-exact against
 *  Python's float pow for k = 0..23 (a repeated multiply is NOT: 19/24 miss).
 *
 *  _quant_labels (PIL median-cut quantize) is NOT ported. FEAT_WEIGHTS
 *  ablates "quant" to 0.0 -- the reference computes it in build_features and
 *  then skips it in _detect_axis, so it never touches the result. Here
 *  build_features only builds it when FEAT_WEIGHTS.quant > 0, and
 *  _quant_labels then THROWS rather than returning a plausible label map:
 *  re-enabling the feature needs PIL's Quant.c ported and measured first.
 *
 * API: PF.selfsim.{_luma, _quant_labels, _gradmag, build_features,
 * _dcurves_tiled, _group, _comb_tstat, _local_maxima, _parabolic,
 * _refine_step, _phase, _residual_curve, _score_curves, _detect_axis,
 * detect} -- the reference's names, namespaced so the call graph reads the
 * same and other modules' detect() cannot collide. Internal calls go through
 * the namespace object (like Python's module-global lookup) so a test can
 * wrap any of them. Module constants live on the namespace too and are read
 * at call time (PIX_BUDGET is overridden by the stride fixture).
 *
 * Shapes: an image is {d, w, h} (+ cn for interleaved channels), flat typed
 * array, never arrays of arrays. A tile grid is {d: Float64Array, ny, nx, T}
 * (row-major (ny, nx, T)); a curve set is {d, n, T}; a score set {d, n, P}.
 * Tuples become arrays, dicts become plain objects, None becomes null.
 *
 * No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  var SS = {};                      // the namespace; filled in at the bottom
  PF.selfsim = SS;

  SS.TMAX = 72;
  SS.PMIN = 1.7; SS.PMAX = 24.0;
  SS.PSTEP = 0.02;
  SS.KCAP = 24;
  SS.PIX_BUDGET = 1200000;   // stride the non-shift axis above this many pixels
  SS.TILE_TARGET = 144;      // approximate tile size in px
  SS.QUALIFY_FRAC = 0.40;    // peak must reach this fraction of the max score
  SS.QUALIFY_ABS = 4.0;      // ... and this absolute t-statistic
  SS.VOTE_WIN = 0.15;        // tile-vote search window, fraction of p*
  SS.VOTE_MIN = 1.5;         // minimum tile score to cast a vote
  SS.DISP_UNIFORM = 0.015;   // vote dispersion below which grid is uniform

  function check(cond, msg) { if (!cond) throw new Error('PF.selfsim: ' + msg); }

  function argsortNumpy(v) {
    var si = PF._scipyInternals;
    check(si && typeof si.argsortNumpy === 'function',
      'PF._scipyInternals.argsortNumpy (pf-02-scipy.js) must be loaded: it is ' +
      'the reproduction of numpy\'s default argsort kernel on the reference machine');
    return si.argsortNumpy(v);
  }

  function checkF32Img(m, what, cn) {
    check(m && m.d instanceof Float32Array, what + ': expected {d: Float32Array, w, h}');
    var c = (m.cn === undefined || m.cn === null) ? 1 : (m.cn | 0);
    if (cn !== undefined) check(c === cn, what + ': expected cn=' + cn + ', got ' + c);
    check(m.d.length === m.w * m.h * c, what + ': d.length ' + m.d.length + ' != w*h*cn ' + (m.w * m.h * c));
    return c;
  }

  // ---------------------------------------------------------------- features

  // The three luma weights meet a float32 array, so NEP 50 casts them to
  // float32 BEFORE the multiply; fr(0.299) != 0.299.
  var L0 = fr(0.299), L1 = fr(0.587), L2 = fr(0.114);

  /** rgb[...,0]*0.299 + rgb[...,1]*0.587 + rgb[...,2]*0.114 on a float32 (h,w,3). */
  function _luma(rgb) {
    checkF32Img(rgb, 'PF.selfsim._luma', 3);
    var n = rgb.w * rgb.h, d = rgb.d, out = new Float32Array(n), i, o;
    for (i = 0; i < n; i++) {
      o = i * 3;
      out[i] = fr(fr(fr(d[o] * L0) + fr(d[o + 1] * L1)) + fr(d[o + 2] * L2));
    }
    return { d: out, w: rgb.w, h: rgb.h };
  }

  /** PIL Image.quantize(colors=16, method=MEDIANCUT, dither=NONE) -> int16 labels.
   * NOT PORTED (see header): the feature is ablated to weight 0.0 in the
   * reference and never consumed. Throws so re-enabling it cannot silently
   * run on a made-up label map. */
  function _quant_labels(rgba, colors) {
    throw new Error('PF.selfsim._quant_labels: PIL median-cut quantization is not ported. ' +
      'FEAT_WEIGHTS.quant is 0.0 in the reference (ablated: identical benchmark accuracy, ' +
      '~10% faster), so its output never reaches the result. Port libImaging/Quant.c and ' +
      'measure it before setting FEAT_WEIGHTS.quant > 0. (colors=' + (colors === undefined ? 16 : colors) + ')');
  }

  /** |diff along x, prepend first column| + |diff along y, prepend first row|, float32. */
  function _gradmag(y) {
    checkF32Img(y, 'PF.selfsim._gradmag', 1);
    var w = y.w, h = y.h, d = y.d, out = new Float32Array(w * h), i, j, o, gx, gy;
    for (i = 0; i < h; i++) {
      o = i * w;
      for (j = 0; j < w; j++) {
        // np.diff(prepend=y[:, :1]) makes column 0 exactly y - y = +0.0
        gx = j > 0 ? Math.abs(fr(d[o + j] - d[o + j - 1])) : 0;
        gy = i > 0 ? Math.abs(fr(d[o + j] - d[o - w + j])) : 0;
        out[o + j] = fr(gx + gy);
      }
    }
    return { d: out, w: w, h: h };
  }

  /**
   * build_features(rgba) -> {feats, alpha, grad}
   *   feats: {grad0: [map, false], gradb: [map, false], lapb: [map, false]}
   *          (+ quant: [labels, true] only when FEAT_WEIGHTS.quant > 0, which throws)
   *   alpha: float32 {d, w, h} = rgba[...,3]/255
   *   grad:  the grad0 map (the reference returns a view of the same data)
   * Each map is {d: Float32Array, w, h, cn: 1} mirroring the (h, w, 1) arrays.
   * @param {{d: Uint8Array|Uint8ClampedArray, w, h}} rgba  interleaved RGBA
   */
  function build_features(rgba) {
    check(rgba && (rgba.d instanceof Uint8Array || rgba.d instanceof Uint8ClampedArray),
      'PF.selfsim.build_features: rgba must be {d: Uint8Array(w*h*4), w, h}');
    var w = rgba.w | 0, h = rgba.h | 0, n = w * h, src = rgba.d;
    check(src.length === n * 4, 'PF.selfsim.build_features: d.length ' + src.length + ' != w*h*4 ' + (n * 4));
    var rgb = new Float32Array(n * 3), alpha = new Float32Array(n), i;
    for (i = 0; i < n; i++) {
      rgb[i * 3] = src[i * 4];
      rgb[i * 3 + 1] = src[i * 4 + 1];
      rgb[i * 3 + 2] = src[i * 4 + 2];
      alpha[i] = fr(src[i * 4 + 3] / 255);     // float32 / float32(255.0): one correctly rounded division
    }
    var y = SS._luma({ d: rgb, w: w, h: h, cn: 3 });
    var yb = PF.GaussianBlur(y, [0, 0], 1.0);   // cv2.GaussianBlur(y, (0, 0), 1.0)
    var lap = PF.Laplacian(yb);                 // cv2.Laplacian(yb, cv2.CV_32F), ksize=1
    var lapAbs = new Float32Array(n);
    for (i = 0; i < n; i++) lapAbs[i] = Math.abs(lap.d[i]);
    var g0 = SS._gradmag(y), gb = SS._gradmag(yb);
    var feats = {};
    feats.grad0 = [{ d: g0.d, w: w, h: h, cn: 1 }, false];
    feats.gradb = [{ d: gb.d, w: w, h: h, cn: 1 }, false];
    feats.lapb = [{ d: lapAbs, w: w, h: h, cn: 1 }, false];
    if (SS.FEAT_WEIGHTS.quant > 0.0) feats.quant = [SS._quant_labels(rgba), true];
    return { feats: feats, alpha: { d: alpha, w: w, h: h }, grad: feats.grad0[0] };
  }

  // ------------------------------------------------------------ tiled d(t)

  // np.unique(np.linspace(0, n, k + 1)[:-1].astype(int)) -> sorted Int32Array
  function tileStarts(n, k) {
    var ls = PF.linspace(0, n, k + 1);
    var head = PF.astypeInt(ls.subarray(0, k));
    return PF.unique(head).values;
  }

  function countUnique(a) {
    return PF.unique(a).values.length;
  }

  /* numpy FLOAT_pairwise_sum over ROWS start..start+n-1 of a (H, W) float32
   * block, vectorised across the W columns: returns a Float32Array(W) whose
   * element j is exactly the pairwise sum a[start..start+n)[j] would give
   * with stride W. Same tree as PF.pairwiseSum (< 8 sequential from 0, eight
   * interleaved accumulators to 128, recursive halving on a multiple-of-8
   * split); only the loop nesting differs. */
  function pwRows(a, W, start, n) {
    var res, i, j, k, o;
    if (n < 8) {
      res = new Float32Array(W);
      for (i = 0; i < n; i++) {
        o = (start + i) * W;
        for (j = 0; j < W; j++) res[j] = fr(res[j] + a[o + j]);
      }
      return res;
    }
    if (n <= 128) {
      var r = new Array(8);
      for (k = 0; k < 8; k++) r[k] = a.slice((start + k) * W, (start + k + 1) * W);
      var end = n - (n % 8);
      for (i = 8; i < end; i += 8) {
        for (k = 0; k < 8; k++) {
          var rk = r[k];
          o = (start + i + k) * W;
          for (j = 0; j < W; j++) rk[j] = fr(rk[j] + a[o + j]);
        }
      }
      res = new Float32Array(W);
      var r0 = r[0], r1 = r[1], r2 = r[2], r3 = r[3], r4 = r[4], r5 = r[5], r6 = r[6], r7 = r[7];
      for (j = 0; j < W; j++) {
        res[j] = fr(fr(fr(r0[j] + r1[j]) + fr(r2[j] + r3[j])) + fr(fr(r4[j] + r5[j]) + fr(r6[j] + r7[j])));
      }
      for (; i < n; i++) {
        o = (start + i) * W;
        for (j = 0; j < W; j++) res[j] = fr(res[j] + a[o + j]);
      }
      return res;
    }
    var n2 = (n / 2) | 0;
    n2 -= n2 % 8;
    var A = pwRows(a, W, start, n2), B = pwRows(a, W, start + n2, n - n2);
    for (j = 0; j < W; j++) A[j] = fr(A[j] + B[j]);
    return A;
  }

  /* np.add.reduceat(np.add.reduceat(a, rs, axis=0), cs, axis=1) for a float32
   * (H, W) block held flat in `a`. Each segment is numpy's reduceat: out =
   * a[start]; if the segment has more than one element, out += pairwise(rest)
   * in float32. rs / cs are strictly increasing and < H / < W (the caller
   * guarantees that, so the "start >= end" copy case never arises). */
  function reduceat2(a, H, W, rs, cs) {
    var ny = rs.length, nx = cs.length, s, b, j;
    var tmp = new Float32Array(ny * W);
    for (s = 0; s < ny; s++) {
      var start = rs[s], end = (s + 1 < ny) ? rs[s + 1] : H;
      var count = end - start, o = s * W, base = start * W;
      check(count >= 1, 'reduceat2: empty row segment');
      if (count === 1) {
        for (j = 0; j < W; j++) tmp[o + j] = a[base + j];
      } else {
        var rest = pwRows(a, W, start + 1, count - 1);
        for (j = 0; j < W; j++) tmp[o + j] = fr(a[base + j] + rest[j]);
      }
    }
    var out = new Float32Array(ny * nx);
    for (s = 0; s < ny; s++) {
      var ro = s * W;
      for (b = 0; b < nx; b++) {
        var st = cs[b], en = (b + 1 < nx) ? cs[b + 1] : W;
        var cnt = en - st;
        check(cnt >= 1, 'reduceat2: empty column segment');
        var v = tmp[ro + st];
        if (cnt > 1) v = fr(v + PF.pairwiseSum(tmp, ro + st + 1, cnt - 1, true));
        out[s * nx + b] = v;
      }
    }
    return out;
  }

  /**
   * Per-tile numerator/denominator curves.
   *
   * Returns {num, den}, each {d: Float64Array (ny, nx, T), ny, nx, T};
   * d = num/den. Keeping both lets callers regroup tiles exactly (coarse
   * tiles, global) for free.
   *
   * @param {[{d,w,h,cn?}, boolean]} F   (array, is_label); float32 maps, or
   *        an integer label map when is_label
   * @param {{d: Float32Array, w, h}} wt  per-pixel weight
   * @param {number} axis  1 = shift along x, 0 = shift along y
   */
  function _dcurves_tiled(F, wt, axis, tmax, ny, nx) {
    var arr = F[0], isLabel = !!F[1];
    check(arr && arr.d && arr.d.length !== undefined, 'PF.selfsim._dcurves_tiled: F[0] must be {d, w, h}');
    var cn = (arr.cn === undefined || arr.cn === null) ? 1 : (arr.cn | 0);
    var h = arr.h | 0, w = arr.w | 0, d = arr.d, wd = wt.d;
    check(d.length === w * h * cn, 'PF.selfsim._dcurves_tiled: F[0].d.length != w*h*cn');
    check(wt.w === w && wt.h === h && wd.length === w * h, 'PF.selfsim._dcurves_tiled: wt shape != F shape');
    check(wd instanceof Float32Array, 'PF.selfsim._dcurves_tiled: wt must be float32 (the reference casts it)');
    check(axis === 0 || axis === 1, 'PF.selfsim._dcurves_tiled: axis must be 0 or 1');
    var i, j, c, t, a, b, k;
    if (axis === 0) {
      // np.swapaxes(arr, 0, 1) and wt.T: rows become the original columns
      var d2 = new d.constructor(w * h * cn), wd2 = new Float32Array(w * h);
      for (i = 0; i < h; i++) {
        for (j = 0; j < w; j++) {
          wd2[j * h + i] = wd[i * w + j];
          for (c = 0; c < cn; c++) d2[(j * h + i) * cn + c] = d[(i * w + j) * cn + c];
        }
      }
      d = d2; wd = wd2;
      var tmpDim = h; h = w; w = tmpDim;
    }
    var stride = Math.max(1, Math.ceil(h * w / SS.PIX_BUDGET));
    var hs = Math.floor((h - 1) / stride) + 1;          // rows 0, stride, 2*stride, ...
    var T = Math.max(Math.min(tmax, Math.floor(w / 3)), 1);
    var rs = tileStarts(hs, ny);
    var cs0 = tileStarts(w, nx);
    ny = rs.length; nx = cs0.length;
    var num = new Float64Array(ny * nx * T), den = new Float64Array(ny * nx * T);
    var single = cn === 1;
    var cap = hs * Math.max(w - 1, 0);
    var diffw = new Float32Array(cap), wp = new Float32Array(cap);
    var chan = single ? null : new Float32Array(cn);
    for (t = 1; t <= T; t++) {
      var Wp = w - t;
      // A = arr[:, t:], B = arr[:, :-t]; wp = wt[:, t:] * wt[:, :-t]; all float32
      for (i = 0; i < hs; i++) {
        var ro = (i * stride) * w, oo = i * Wp;
        for (j = 0; j < Wp; j++) {
          var wpv = fr(wd[ro + j + t] * wd[ro + j]);
          var df;
          if (isLabel) {
            df = (d[(ro + j + t) * cn] !== d[(ro + j) * cn]) ? 1 : 0;
          } else if (single) {
            df = Math.abs(fr(d[ro + j + t] - d[ro + j]));
          } else {
            // np.abs(A - B).mean(-1): float32 pairwise sum over channels / cn
            for (c = 0; c < cn; c++) chan[c] = Math.abs(fr(d[(ro + j + t) * cn + c] - d[(ro + j) * cn + c]));
            df = fr(PF.pairwiseSum(chan, 0, cn, true) / cn);
          }
          wp[oo + j] = wpv;
          diffw[oo + j] = fr(df * wpv);
        }
      }
      var capC = Math.max(w - t - 1, 0);
      var cs = new Int32Array(nx);
      for (k = 0; k < nx; k++) cs[k] = Math.min(cs0[k], capC);
      if (countUnique(cs) !== nx) cs = new Int32Array([0]);   // degenerate; collapse columns
      var nu = reduceat2(diffw, hs, Wp, rs, cs);
      var de = reduceat2(wp, hs, Wp, rs, cs);
      if (cs.length !== nx) {
        // nu.shape != (ny, nx): spread the float32 mean of the collapsed grid
        var vn = fr(PF.sum(nu) / (ny * nx));
        var vd = fr(PF.sum(de) / (ny * nx));
        for (a = 0; a < ny; a++) {
          for (b = 0; b < nx; b++) {
            num[(a * nx + b) * T + t - 1] += vn;
            den[(a * nx + b) * T + t - 1] += vd;
          }
        }
      } else {
        for (a = 0; a < ny; a++) {
          for (b = 0; b < nx; b++) {
            num[(a * nx + b) * T + t - 1] = nu[a * nx + b];
            den[(a * nx + b) * T + t - 1] = de[a * nx + b];
          }
        }
      }
    }
    return {
      num: { d: num, ny: ny, nx: nx, T: T },
      den: { d: den, ny: ny, nx: nx, T: T }
    };
  }

  /** Regroup tile num/den grids into a gy x gx grid of d(t) curves -> {d, n, T}. */
  function _group(num, den, gy, gx) {
    var ny = num.ny, nx = num.nx, T = num.T;
    check(den.ny === ny && den.nx === nx && den.T === T, 'PF.selfsim._group: num/den shapes differ');
    var ys = PF.astypeInt(PF.linspace(0, ny, gy + 1));
    var xs = PF.astypeInt(PF.linspace(0, nx, gx + 1));
    var out = new Float64Array(gy * gx * T);
    var n = new Float64Array(T), dd = new Float64Array(T);
    var a, b, i, j, t, o, oo;
    for (a = 0; a < gy; a++) {
      for (b = 0; b < gx; b++) {
        // .sum(axis=(0, 1)): elementwise over tiles, row-major, from 0
        n.fill(0); dd.fill(0);
        for (i = ys[a]; i < ys[a + 1]; i++) {
          for (j = xs[b]; j < xs[b + 1]; j++) {
            o = (i * nx + j) * T;
            for (t = 0; t < T; t++) {
              n[t] = n[t] + num.d[o + t];
              dd[t] = dd[t] + den.d[o + t];
            }
          }
        }
        oo = (a * gx + b) * T;
        for (t = 0; t < T; t++) out[oo + t] = n[t] / PF.npMaximum(dd[t], 1e-9);
      }
    }
    return { d: out, n: gy * gx, T: T };
  }

  // ---------------------------------------------------------------- scoring

  /**
   * t-statistic comb score for one normalized curve dm(t), t=1..T.
   *
   * c_k = mean(halves) - d(k p), detrended by a box mean of width p; the
   * score is mean(c)*sqrt(K) / (std(c) + noise floor): consistency over
   * many harmonics wins over one deep content-period minimum.
   * @returns {Float64Array} one score per p_grid entry (-1e9 where K < 2)
   */
  function _comb_tstat(dm, p_grid, kcap) {
    if (kcap === undefined || kcap === null) kcap = SS.KCAP;
    var T = dm.length, P = p_grid.length;
    var S = PF.full(P, -1e9);
    if (T < 8) return S;
    var ts = PF.arange(1, T + 1);
    // F = concatenate([[0], cumsum((dm[1:] + dm[:-1]) * 0.5)])  (cumsum is sequential)
    var F = new Float64Array(T), i;
    F[0] = 0.0;
    if (T > 1) {
      F[1] = (dm[1] + dm[0]) * 0.5;
      for (i = 2; i < T; i++) F[i] = F[i - 1] + (dm[i] + dm[i - 1]) * 0.5;
    }
    var noise = PF.median(PF.abs(PF.diff(dm, 2)), 'f8') + 1e-9;
    var Tf = T;   // float(T)

    function interp(q) { return PF.interp(q, ts, dm); }

    function box(q, p) {
      var lo = PF.npMaximum(q - p / 2, 1.0);
      var hi = PF.npMinimum(q + p / 2, Tf);
      return (PF.interp(hi, ts, F) - PF.interp(lo, ts, F)) / PF.npMaximum(hi - lo, 1e-9);
    }

    // Ks = minimum(floor(T / p_grid - 0.5).astype(int), kcap); the reference
    // loops over unique(Ks) and vectorises within each group, but every
    // element of that batch is computed independently, so a per-p loop gives
    // the same numbers (writes to disjoint index sets).
    var c = new Float64Array(Math.max(kcap, 1)), x = new Float64Array(Math.max(kcap, 1));
    for (i = 0; i < P; i++) {
      var K = Math.min(Math.floor(T / p_grid[i] - 0.5), kcap);
      if (K < 2) continue;
      var p = p_grid[i], ph = p / 2, k;
      for (k = 1; k <= K; k++) {
        var qm = p * k;
        var rm = interp(qm) - box(qm, p);
        var qa = qm - ph;
        var rh1 = interp(qa) - box(qa, p);
        var qb = qm + ph;
        var rh2 = interp(qb) - box(qb, p);
        c[k - 1] = 0.5 * (rh1 + rh2) - rm;
      }
      var cK = c.subarray(0, K), xK = x.subarray(0, K);
      var mean_c = PF.sum(cK) / K;
      // np.std: mean, squared deviations, mean, sqrt (ddof=0)
      for (k = 0; k < K; k++) { var dv = cK[k] - mean_c; xK[k] = dv * dv; }
      var std_c = Math.sqrt(PF.sum(xK) / K);
      // penalize few-harmonic (large p) scores: content periods live there
      var kpen = Math.min(1.0, (K - 1) / 3.0);
      S[i] = kpen * mean_c * Math.sqrt(K) / (std_c + 0.5 * noise + 1e-9);
    }
    return S;
  }

  /** Indices of strict-right / weak-left local maxima of z, highest first
   * (np.argsort(z[idx])[::-1] with numpy's default argsort kernel). */
  function _local_maxima(z) {
    var n = z.length, idx = [], i;
    for (i = 1; i < n - 1; i++) if (z[i] >= z[i - 1] && z[i] > z[i + 1]) idx.push(i);
    var m = idx.length, vals = new Float64Array(m);
    for (i = 0; i < m; i++) vals[i] = z[idx[i]];
    var perm = argsortNumpy(vals);
    var out = new Int32Array(m);
    for (i = 0; i < m; i++) out[i] = idx[perm[m - 1 - i]];
    return out;
  }

  /** Parabolic sub-sample refinement of an extremum at index i of (x, y). */
  function _parabolic(x, y, i) {
    if (0 < i && i < x.length - 1) {
      var denom = y[i - 1] - 2 * y[i] + y[i + 1];
      if (Math.abs(denom) > 1e-12) {
        var off = PF.clipScalar(0.5 * (y[i - 1] - y[i + 1]) / denom, -1, 1);
        return x[i] + off * (x[1] - x[0]);
      }
    }
    return x[i];
  }

  // ------------------------------------------------------- harmonic refine

  /** Sub-pixel step: positions of minima of R(t) near k*s0, LS fit. */
  function _refine_step(R, s0, kdecay) {
    if (kdecay === undefined || kdecay === null) kdecay = 0.85;
    var T = R.length;
    var ts = PF.arange(1, T + 1);
    var pairs = [];
    var K = Math.trunc(Math.min(SS.KCAP, (T - 1) / s0));   // int(min(KCAP, (T - 1) / s0))
    var k, r;
    for (k = 1; k <= K; k++) {
      var t0 = k * s0;
      var half = Math.max(1.5, 0.3 * s0);
      var lo = Math.max(Math.floor(t0 - half), 1);
      var hi = Math.min(Math.ceil(t0 + half), T);
      if (hi - lo < 2) continue;
      var seg = R.subarray(lo - 1, hi);
      var j = PF.argmin(seg);
      var tk = SS._parabolic(ts.subarray(lo - 1, hi), seg, j);
      pairs.push([k, tk, Math.pow(kdecay, k - 1)]);
    }
    if (pairs.length === 0) return s0;
    var s = s0;
    for (var it = 0; it < 2; it++) {
      var n = pairs.length, wkt = new Float64Array(n), wkk = new Float64Array(n);
      for (r = 0; r < n; r++) {
        var ks = pairs[r][0], tkv = pairs[r][1], wv = pairs[r][2];
        wkt[r] = wv * ks * tkv;       // (w * ks * tk), left to right
        wkk[r] = wv * ks * ks;
      }
      s = PF.sum(wkt) / PF.sum(wkk);
      var thr = Math.max(0.2 * s0, 1.0), keep = new Array(n), nk = 0;
      for (r = 0; r < n; r++) {
        keep[r] = Math.abs(pairs[r][1] - pairs[r][0] * s) <= thr;
        if (keep[r]) nk++;
      }
      if (nk === n || nk < 1) break;
      var kept = [];
      for (r = 0; r < n; r++) if (keep[r]) kept.push(pairs[r]);
      pairs = kept;
    }
    return (0.6 * s0 < s && s < 1.4 * s0) ? s : s0;
  }

  // ---------------------------------------------------------------- phase

  /** Grid phase along one axis: the offset phi in [0, step) whose comb of
   * samples of the summed gradient profile is highest. */
  function _phase(grad, step, axis) {
    checkF32Img(grad, 'PF.selfsim._phase', 1);
    var w = grad.w, h = grad.h, d = grad.d, prof, i, j, k;
    if (axis === 1) {
      // grad.sum(axis=0): float32, sequential over rows from 0 (the
      // iterator keeps the contiguous axis innermost, so no pairwise tree)
      prof = new Float32Array(w);
      for (i = 0; i < h; i++) {
        var o = i * w;
        for (j = 0; j < w; j++) prof[j] = fr(prof[j] + d[o + j]);
      }
    } else {
      // grad.sum(axis=1): float32 pairwise along each contiguous row
      prof = new Float32Array(h);
      for (i = 0; i < h; i++) prof[i] = PF.sum(d.subarray(i * w, (i + 1) * w));
    }
    var n = prof.length;
    var xs = PF.arange(n);
    var fp = new Float64Array(prof);        // np.interp widens fp to float64
    var best = -1.0, bphi = 0.0;
    var phis = PF.arange(0.0, step, 0.1);
    for (k = 0; k < phis.length; k++) {
      var phi = phis[k];
      var qs = PF.arange(phi, n - 1, step);
      if (qs.length < 2) continue;
      var v = PF.sum(PF.interp(qs, xs, fp)) / qs.length;
      if (v > best) { best = v; bphi = phi; }
    }
    return bphi;
  }

  // ---------------------------------------------------------------- detect

  // quant ablated to 0: identical accuracy on the bench, ~10% faster without
  // it (kept in the code for future JPEG-heavy sets; set > 0 to re-enable --
  // which in this port throws until PIL's quantizer is ported)
  SS.FEAT_WEIGHTS = { grad0: 1.0, gradb: 1.0, lapb: 1.0, quant: 0.0 };

  /** Mean-normalized, box(9)-detrended residual for refinement. */
  function _residual_curve(d) {
    var T = d.length, i, j;
    var m = PF.sum(d) / T;
    if (m < 1e-9) return new Float64Array(T);
    var dm = new Float64Array(T);
    for (i = 0; i < T; i++) dm[i] = d[i] / m;
    var k = 1.0 / 9.0;                       // np.ones(9) / 9.0
    var pad = new Float64Array(T + 8);       // np.pad(dm, 4, mode="edge")
    for (i = 0; i < T + 8; i++) {
      var src = i - 4;
      if (src < 0) src = 0; else if (src > T - 1) src = T - 1;
      pad[i] = dm[src];
    }
    var out = new Float64Array(T);
    for (i = 0; i < T; i++) {
      // np.convolve(pad, k, 'valid') via small_correlate: s = 0; s += d[i+j]*k[j]
      var s = 0;
      for (j = 0; j < 9; j++) s += pad[i + j] * k;
      out[i] = dm[i] - s;
    }
    return out;
  }

  /** Clipped comb t-stat score for each curve, scaled by feature weight -> {d, n, P}. */
  function _score_curves(d_curves, p_grid, fw, kcap) {
    if (kcap === undefined || kcap === null) kcap = SS.KCAP;
    var n = d_curves.n, T = d_curves.T, P = p_grid.length;
    var out = new Float64Array(n * P), i, t, p;
    for (i = 0; i < n; i++) {
      var d = d_curves.d.subarray(i * T, (i + 1) * T);
      var m = PF.sum(d) / T;
      if (m > 1e-9) {
        var dm = new Float64Array(T);
        for (t = 0; t < T; t++) dm[t] = d[t] / m;
        var Sc = PF.clip(SS._comb_tstat(dm, p_grid, kcap), -10.0, 30.0);
        for (p = 0; p < P; p++) out[i * P + p] = fw * Sc[p];
      }
    }
    return { d: out, n: n, P: P };
  }

  function rowMeans(curves) {
    var n = curves.n, T = curves.T, out = new Float64Array(n), i;
    for (i = 0; i < n; i++) out[i] = PF.sum(curves.d.subarray(i * T, (i + 1) * T)) / T;
    return out;
  }

  function fallback() { return { s0: 8.0, cands: [[8.0, 0.0]], conf: 0.0 }; }

  /**
   * One axis of detection -> {s0, cands: [[step, score], ...], conf}
   * (the reference's (s0, cands, conf) tuple).
   */
  function _detect_axis(feats, wt, axis, size) {
    var p_grid = PF.arange(SS.PMIN, Math.min(SS.PMAX, size / 4), SS.PSTEP);
    var P = p_grid.length;
    var h = wt.h, w = wt.w;
    var other = axis === 1 ? h : w, shift = axis === 1 ? w : h;
    var ny = PF.clipScalar(PF.rint(other / 128.0), 1, 8);          // non-shift axis
    var nx = PF.clipScalar(PF.rint(shift / SS.TILE_TARGET), 1, 6);  // shift axis
    // selection bands: full width along the shift axis (best SNR for
    // locating the right period region), a few bands across
    var gy = Math.min(ny, 4), gx = 1;
    var S_fine = null, S_coarse = null, S_glob = null;
    var w_fine = null, w_coarse = null;
    var agg_res = null;
    var nFine = 0, nCoarse = 0, T = 0;
    var names = Object.keys(feats), fi, i, p, t;
    for (fi = 0; fi < names.length; fi++) {
      var name = names[fi];
      var fw = Object.prototype.hasOwnProperty.call(SS.FEAT_WEIGHTS, name) ? SS.FEAT_WEIGHTS[name] : 0.0;
      if (fw <= 0.0) continue;
      var cur = SS._dcurves_tiled(feats[name], wt, axis, SS.TMAX, ny, nx);
      var num = cur.num, den = cur.den;
      var d_fine = SS._group(num, den, num.ny, num.nx);
      var d_coarse = SS._group(num, den, gy, gx);
      var d_glob = SS._group(num, den, 1, 1);
      if (S_fine === null) {
        nFine = d_fine.n; nCoarse = d_coarse.n; T = d_glob.T;
        S_fine = new Float64Array(nFine * P);
        S_coarse = new Float64Array(nCoarse * P);
        S_glob = new Float64Array(P);
        agg_res = new Float64Array(T);
      }
      var sf = SS._score_curves(d_fine, p_grid, fw, 6).d;
      for (i = 0; i < sf.length; i++) S_fine[i] += sf[i];
      var sc = SS._score_curves(d_coarse, p_grid, fw).d;
      for (i = 0; i < sc.length; i++) S_coarse[i] += sc[i];
      var sg = SS._score_curves(d_glob, p_grid, fw).d;
      for (p = 0; p < P; p++) S_glob[p] += sg[p];
      var res = SS._residual_curve(d_glob.d.subarray(0, T));
      for (t = 0; t < T; t++) agg_res[t] += fw * res[t];
      if (name === 'grad0') {
        w_fine = rowMeans(d_fine);
        w_coarse = rowMeans(d_coarse);
      }
    }
    if (S_fine === null || w_coarse === null || PF.sum(w_coarse) <= 1e-9) return fallback();
    var wsum = PF.sum(w_coarse);
    var wc = new Float64Array(nCoarse);
    for (i = 0; i < nCoarse; i++) wc[i] = w_coarse[i] / wsum;
    // Stot = ((wc[:, None] * S_coarse).sum(axis=0) + 0.5 * S_glob) / 1.5
    var Stot = new Float64Array(P);
    for (p = 0; p < P; p++) {
      var acc = 0.0;
      for (i = 0; i < nCoarse; i++) acc = acc + wc[i] * S_coarse[i * P + p];
      Stot[p] = (acc + 0.5 * S_glob[p]) / 1.5;
    }
    var peaks = SS._local_maxima(Stot);
    if (peaks.length === 0 || Stot[peaks[0]] <= 0) return fallback();
    var smax = Stot[peaks[0]];
    var floor = Math.max(SS.QUALIFY_FRAC * smax, SS.QUALIFY_ABS);
    // qual = [i for i in peaks if Stot[i] >= floor]; best = min(qual, key=p_grid[i])
    var best_i = -1, k;
    for (k = 0; k < peaks.length; k++) {
      i = peaks[k];
      if (Stot[i] >= floor && (best_i < 0 || p_grid[i] < p_grid[best_i])) best_i = i;
    }
    if (best_i < 0) best_i = peaks[0];
    // explicit divisor walk (peak list can miss a shallow fundamental)
    var changed = true;
    var divisors = [6, 5, 4, 3, 2];
    while (changed) {
      changed = false;
      for (var mi = 0; mi < divisors.length; mi++) {
        var m = divisors[mi];
        var pf = p_grid[best_i] / m;
        if (pf < p_grid[0]) continue;
        var j0 = PF.rint((pf - p_grid[0]) / SS.PSTEP);
        var rad = Math.max(PF.rint(0.05 * pf / SS.PSTEP), 4);
        var lo = Math.max(j0 - rad, 0), hi = Math.min(j0 + rad + 1, P);
        if (hi > lo) {
          var j = lo + PF.argmax(Stot.subarray(lo, hi));
          if (Stot[j] >= Math.max(0.45 * Stot[best_i], 0.8 * SS.QUALIFY_ABS)) {
            best_i = j;
            changed = true;
            break;
          }
        }
      }
    }
    var p_star = p_grid[best_i];

    // per-fine-tile vote around p_star (handles drift: local periods vary;
    // cols = sum(width_i / s_i), so 1/s averages linearly -> harmonic mean)
    function tile_votes(center) {
      var win = Math.max(SS.VOTE_WIN * center, 6 * SS.PSTEP);
      var lo = Math.max(PF.rint((center - win - p_grid[0]) / SS.PSTEP), 0);
      var hi = Math.min(PF.rint((center + win - p_grid[0]) / SS.PSTEP) + 1, P);
      // A negative hi would make the reference's S_fine[i, lo:hi] wrap from
      // the end; it cannot happen (center >= p_grid[0] - PSTEP), so refuse
      // rather than emulate Python's negative slicing silently.
      check(hi >= 0, '_detect_axis.tile_votes: negative slice end');
      var vs = [], ws = [], ti;
      for (ti = 0; ti < nFine; ti++) {
        if (w_fine[ti] <= 1e-9) continue;
        if (hi - lo < 3) continue;
        var seg = S_fine.subarray(ti * P + lo, ti * P + hi);
        var jj = PF.argmax(seg);
        if (seg[jj] < SS.VOTE_MIN) continue;
        vs.push(SS._parabolic(p_grid.subarray(lo, hi), seg, jj));
        ws.push(Math.min(seg[jj], 8.0));
      }
      return { vs: Float64Array.from(vs), ws: Float64Array.from(ws) };
    }

    function wmedian(v, wgt) {
      var o = argsortNumpy(v);
      var n = v.length, cw = new Float64Array(n), q;
      cw[0] = wgt[o[0]];                       // np.cumsum: sequential
      for (q = 1; q < n; q++) cw[q] = cw[q - 1] + wgt[o[q]];
      var at = PF.searchsorted(cw, 0.5 * cw[n - 1], 'left');
      check(at < n, '_detect_axis.wmedian: searchsorted past the end');
      return v[o[at]];
    }

    var s0, s_ls, med;
    var tv = tile_votes(p_star), votes = tv.vs, vw = tv.ws;
    if (votes.length) {
      med = wmedian(votes, vw);
      tv = tile_votes(med);                    // re-center once
      votes = tv.vs; vw = tv.ws;
    }
    if (votes.length) {
      med = wmedian(votes, vw);
      var dev = new Float64Array(votes.length);
      for (i = 0; i < votes.length; i++) dev[i] = Math.abs(votes[i] - med);
      var disp = wmedian(dev, vw) / Math.max(med, 1e-9);
      if (disp < SS.DISP_UNIFORM) {
        // uniform grid: median vote + sub-pixel harmonic LS
        s0 = med;
        s_ls = SS._refine_step(agg_res, s0);
        if (Math.abs(s_ls - s0) <= Math.max(0.03 * s0, 0.04)) s0 = s_ls;
      } else {
        // drifting grid: harmonic mean of local periods
        var inv = new Float64Array(votes.length);
        for (i = 0; i < votes.length; i++) inv[i] = vw[i] / votes[i];
        s0 = PF.sum(vw) / PF.sum(inv);
      }
    } else {
      s0 = SS._parabolic(p_grid, Stot, best_i);
      s_ls = SS._refine_step(agg_res, s0);
      if (Math.abs(s_ls - s0) <= Math.max(0.03 * s0, 0.04)) s0 = s_ls;
    }
    var cands = [];
    var npk = Math.min(8, peaks.length);
    for (k = 0; k < npk; k++) {
      cands.push([SS._parabolic(p_grid, Stot, peaks[k]), Stot[peaks[k]]]);
    }
    cands.unshift([s0, Stot[best_i]]);
    return { s0: s0, cands: cands, conf: Stot[best_i] };
  }

  var A05 = fr(0.05);   // np.maximum(alpha, 0.05) casts the Python float to float32 (NEP 50)

  /**
   * detect(rgba) -> {step_x, step_y, cols, rows, phase_x, phase_y, conf,
   *                  candidates: [[step, score], ...] sorted by score desc}
   * @param {{d: Uint8Array|Uint8ClampedArray, w, h}} rgba
   */
  function detect(rgba) {
    var h = rgba.h | 0, w = rgba.w | 0;
    var bf = SS.build_features(rgba);
    var feats = bf.feats, alpha = bf.alpha, grad = bf.grad;
    var n = w * h, wtd = new Float32Array(n), i;
    for (i = 0; i < n; i++) wtd[i] = PF.npMaximum(alpha.d[i], A05);
    var wt = { d: wtd, w: w, h: h };
    var rx = SS._detect_axis(feats, wt, 1, w);
    var ry = SS._detect_axis(feats, wt, 0, h);
    var sx = rx.s0, sy = ry.s0;
    var cols = Math.max(1, PF.rint(w / sx));
    var rows = Math.max(1, PF.rint(h / sy));
    var px = SS._phase(grad, sx, 1);
    var py = SS._phase(grad, sy, 0);
    // sorted(cand_x + cand_y, key=lambda c: -c[1]): stable, descending score
    var all = rx.cands.concat(ry.cands);
    var keys = new Float64Array(all.length);
    for (i = 0; i < all.length; i++) keys[i] = -all[i][1];
    var order = PF.argsort(keys, 'stable');
    var cands = [];
    for (i = 0; i < all.length; i++) cands.push([all[order[i]][0], all[order[i]][1]]);
    return {
      step_x: sx, step_y: sy, cols: cols, rows: rows,
      phase_x: px, phase_y: py,
      conf: Math.min(rx.conf, ry.conf), candidates: cands
    };
  }

  SS._luma = _luma;
  SS._quant_labels = _quant_labels;
  SS._gradmag = _gradmag;
  SS.build_features = build_features;
  SS._dcurves_tiled = _dcurves_tiled;
  SS._group = _group;
  SS._comb_tstat = _comb_tstat;
  SS._local_maxima = _local_maxima;
  SS._parabolic = _parabolic;
  SS._refine_step = _refine_step;
  SS._phase = _phase;
  SS._residual_curve = _residual_curve;
  SS._score_curves = _score_curves;
  SS._detect_axis = _detect_axis;
  SS.detect = detect;
  // internals exposed for the parity test
  SS._internals = { reduceat2: reduceat2, pwRows: pwRows, tileStarts: tileStarts };
  PF.versionSelfsim = 'pf-22-selfsim/1';
})();
