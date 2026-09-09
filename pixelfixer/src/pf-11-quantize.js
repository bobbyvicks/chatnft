/* pf-11-quantize.js -- port of pixelfixer/quantize.py (69 lines).
 *
 * Fast color quantization helpers.
 *
 * k-means quantization (cv2) is used as a *pre-processing* step exactly like
 * spritefusion-pixel-snapper does: reducing to ~16 colors before computing
 * edge profiles turns anti-aliased / bilinear ramps into hard steps located at
 * the true cell boundaries and suppresses jpeg noise, which makes the grid
 * detector's job dramatically easier. The same labels are reused later for
 * per-cell color voting during downscale.
 *
 * Needs, in load order: pf-00-base.js (PF.rint), pf-03-cv2.js (PF.kmeans,
 * PF.theRNG), pf-04-nprandom.js (PF.default_rng).
 *
 * Arithmetic model, each item MEASURED against numpy 2.5.3 / cv2 5.0.0 in
 * the reference venv (tools/parity-quantize.py, tools/test-quantize.js):
 *   rgb          rgba[:, :, :3].astype(np.float32): exact for uint8 input.
 *   sampling     np.random.default_rng(seed).choice(n, sample_max,
 *                replace=False) -- PCG64 + Generator.choice, ported in
 *                pf-04-nprandom.js; the ORDER of the sample matters because
 *                k-means++ picks seeds by position.
 *   np.unique    (sample, axis=0): rows sorted ascending lexicographically;
 *                equal rows merged by float equality (-0.0 == 0.0 merge, NaN
 *                rows never merge -- measured; neither is reachable from
 *                uint8 input). Only len() is used unless k_eff <= 1, where
 *                the WHOLE sorted unique array becomes `centers`.
 *   cv2.kmeans   PF.kmeans on the process-global RNG (PF.theRNG()), which
 *                quantize.py never seeds: the answer depends on how many
 *                kmeans calls preceded this one, exactly as in cv2.
 *   labels       d = ((block - centers) ** 2).sum(axis=2) in FLOAT32:
 *                t = f32(p - c), sq = f32(t*t), d = f32(f32(sq0 + sq1) + sq2)
 *                -- the (d0+d1)+d2 order, i.e. numpy starts the reduction
 *                from the identity and adds left to right. MEASURED:
 *                251114/251114 elements match this order; the alternative
 *                d0+(d1+d2) (copy-first-then-pairwise) matches 193094, so the
 *                data does discriminate. np.argmin: FIRST minimum wins.
 *   out          np.clip(np.rint(centers[labels]), 0, 255).astype(np.uint8):
 *                rint is half-to-even (PF.rint) on float32 values, clip in
 *                float32, then a C float->uint8 cast (exact on 0..255).
 *
 * Conventions: an image is {d, w, h, cn} with an interleaved flat typed
 * array (cn >= 3; channel 3 and up are copied through untouched, which is
 * what rgba.copy() + out[:, :, :3] = ... does). labels is {d: Int32Array,
 * w, h}; centers is {d: Float32Array, w: 3, h: k}.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  function need(name) {
    if (typeof PF[name] !== 'function') {
      throw new Error('PF.kmeans_quantize: PF.' + name + ' is missing -- load pf-00-base.js, pf-03-cv2.js and pf-04-nprandom.js first');
    }
  }

  // Attribution switch for the test's negative control: 'left' is numpy's
  // measured (d0+d1)+d2; 'right' is the d0+(d1+d2) model that a copy-first
  // pairwise reduction would give. Not a tunable.
  PF._quantize = { sumOrder: 'left' };

  // One element of d = ((block[:, None, :] - centers[None, :, :]) ** 2)
  // .sum(axis=2) in float32. Shared by the label loop below and by
  // PF._sqdist3, so the test pins the same arithmetic the port runs.
  function sqdist3(r, g, b, C, base, left) {
    var t0 = fr(r - C[base]), t1 = fr(g - C[base + 1]), t2 = fr(b - C[base + 2]);
    var s0 = fr(t0 * t0), s1 = fr(t1 * t1), s2 = fr(t2 * t2);
    return left ? fr(fr(s0 + s1) + s2) : fr(s0 + fr(s1 + s2));
  }

  /* The reference's distance matrix for an N x 3 float32 block against
   * K x 3 float32 centres: Float32Array(N*K), row-major. For testing the
   * float32 model; kmeans_quantize itself never materialises it. */
  PF._sqdist3 = function (block, N, C, K) {
    if (!(block instanceof Float32Array) || !(C instanceof Float32Array)) throw new Error('PF._sqdist3: float32 inputs');
    if (block.length !== N * 3 || C.length !== K * 3) throw new Error('PF._sqdist3: shape mismatch');
    var left = PF._quantize.sumOrder !== 'right';
    var out = new Float32Array(N * K), i, kk;
    for (i = 0; i < N; i++) {
      for (kk = 0; kk < K; kk++) {
        out[i * K + kk] = sqdist3(block[i * 3], block[i * 3 + 1], block[i * 3 + 2], C, kk * 3, left);
      }
    }
    return out;
  };

  /* np.argmin(d, axis=1) on such a matrix: FIRST minimum wins; the C loop
   * condition is !(v >= min), which is also how a NaN wins. */
  PF._argminRows = function (d, N, K) {
    var out = new Int32Array(N), i, kk, best, bestK, v;
    for (i = 0; i < N; i++) {
      best = d[i * K]; bestK = 0;
      if (best === best) {
        for (kk = 1; kk < K; kk++) {
          v = d[i * K + kk];
          if (!(v >= best)) { best = v; bestK = kk; if (best !== best) break; }
        }
      }
      out[i] = bestK;
    }
    return out;
  };

  /* np.unique(sample, axis=0) for an N x 3 float32 row-major array.
   * Returns {d: Float32Array(n*3), n}. Sorting is lexicographic on the three
   * fields with numpy's float ordering (NaN sorts last within a field; -0.0
   * and 0.0 tie and then merge). */
  function uniqueRows3(a, N) {
    var idx = new Array(N), i;
    for (i = 0; i < N; i++) idx[i] = i;
    idx.sort(function (p, q) {
      var c, x, y, xn, yn;
      for (c = 0; c < 3; c++) {
        x = a[p * 3 + c]; y = a[q * 3 + c];
        xn = x !== x; yn = y !== y;
        if (xn || yn) {
          if (xn && yn) continue;            // NaN vs NaN: tie in this field
          return xn ? 1 : -1;                // NaN last
        }
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return p - q;                          // stable
    });
    var out = new Float32Array(N * 3), n = 0, p, prev = -1, same, c;
    for (i = 0; i < N; i++) {
      p = idx[i];
      same = prev >= 0;
      if (same) {
        for (c = 0; c < 3; c++) {
          if (a[p * 3 + c] !== a[prev * 3 + c]) { same = false; break; }   // NaN !== NaN: distinct rows
        }
      }
      if (!same) {
        out[n * 3] = a[p * 3]; out[n * 3 + 1] = a[p * 3 + 1]; out[n * 3 + 2] = a[p * 3 + 2];
        n++;
      }
      prev = p;
    }
    return { d: n === N ? out : out.slice(0, n * 3), n: n };
  }
  PF._uniqueRows3 = uniqueRows3;

  /**
   * kmeans_quantize(rgba, k=16, sample_max=60_000, seed=42)
   *
   * Quantize an image with k-means in RGB.
   *
   * Returns {quantized: uint8 image (same constructor and cn as the input),
   *          labels: {d: Int32Array, w, h}, centers: {d: Float32Array, w: 3, h: k}}.
   * Fully transparent pixels keep their color but get label of their nearest
   * center anyway (harmless: alpha handling is done downstream).
   *
   * `seed` seeds ONLY the numpy sampler; cv2's RNG is the process-global one
   * and is deliberately left alone, as in the reference.
   *
   * @param {{d:Uint8Array|Uint8ClampedArray, w:number, h:number, cn?:number}} rgba
   * @param {number} [k=16]
   * @param {number} [sample_max=60000]
   * @param {number} [seed=42]
   */
  PF.kmeans_quantize = function (rgba, k, sample_max, seed) {
    need('rint'); need('kmeans'); need('theRNG'); need('default_rng');
    if (k === undefined || k === null) k = 16;
    if (sample_max === undefined || sample_max === null) sample_max = 60000;
    if (seed === undefined || seed === null) seed = 42;
    if (!rgba || typeof rgba !== 'object') throw new Error('PF.kmeans_quantize: expected a {d, w, h, cn} image');
    var d = rgba.d;
    if (!(d instanceof Uint8Array || d instanceof Uint8ClampedArray)) {
      throw new Error('PF.kmeans_quantize: d must be a Uint8Array or Uint8ClampedArray (every reference call site passes uint8 RGBA)');
    }
    var h = rgba.h | 0, w = rgba.w | 0;
    var cn = (rgba.cn === undefined || rgba.cn === null) ? 4 : (rgba.cn | 0);
    if (h < 0 || w < 0) throw new Error('PF.kmeans_quantize: negative dimensions');
    if (cn < 3) throw new Error('PF.kmeans_quantize: rgba[:, :, :3] needs cn >= 3, got ' + cn);
    if (d.length !== w * h * cn) throw new Error('PF.kmeans_quantize: d.length ' + d.length + ' != w*h*cn ' + (w * h * cn));
    var n = w * h, i, c, base;

    // rgb = rgba[:, :, :3].reshape(-1, 3).astype(np.float32)
    var rgb = new Float32Array(n * 3);
    for (i = 0; i < n; i++) {
      base = i * cn;
      rgb[i * 3] = d[base]; rgb[i * 3 + 1] = d[base + 1]; rgb[i * 3 + 2] = d[base + 2];
    }

    var rng = PF.default_rng(seed);
    var sample, sampleN, idx = null;
    if (n > sample_max) {
      idx = rng.choice(n, sample_max, { replace: false });
      sampleN = sample_max;
      sample = new Float32Array(sampleN * 3);
      for (i = 0; i < sampleN; i++) {
        base = idx[i] * 3;
        sample[i * 3] = rgb[base]; sample[i * 3 + 1] = rgb[base + 1]; sample[i * 3 + 2] = rgb[base + 2];
      }
    } else {
      sample = rgb;
      sampleN = n;
    }

    var uniq = uniqueRows3(sample, sampleN);
    var k_eff = Math.trunc(Math.min(k, uniq.n));       // int(min(k, len(uniq)))
    var out, labels, centers;
    if (k_eff <= 1) {
      // centers = uniq if len(uniq) else np.zeros((1, 3), np.float32)
      centers = uniq.n ? { d: uniq.d, w: 3, h: uniq.n } : { d: new Float32Array(3), w: 3, h: 1 };
      labels = { d: new Int32Array(n), w: w, h: h };
      return { quantized: { d: new d.constructor(d), w: w, h: h, cn: cn }, labels: labels, centers: centers,
        k_eff: k_eff, sample_idx: idx, uniq_n: uniq.n };
    }

    // criteria = (EPS + MAX_ITER, 12, 0.5); 2 attempts; KMEANS_PP_CENTERS.
    // 12 iterations at eps 0.5 is far from converged on purpose: it is a
    // pre-processing palette, and the grid detector only needs the steps to
    // land on cell boundaries, not the centres to be optimal.
    var km = PF.kmeans({ d: sample, w: 3, h: sampleN }, k_eff, { maxCount: 12, epsilon: 0.5 }, 2);
    var C = km.centers.d;                              // float32, k_eff x 3

    // assign every pixel to nearest center (the reference chunks this by
    // 1 << 20 rows to bound memory; per-pixel results do not depend on the
    // chunking, so the loop here is flat)
    var left = PF._quantize.sumOrder !== 'right';
    var labelsFlat = new Int32Array(n);
    var r, g, b, kk, dd, best, bestK;
    for (i = 0; i < n; i++) {
      r = rgb[i * 3]; g = rgb[i * 3 + 1]; b = rgb[i * 3 + 2];
      best = sqdist3(r, g, b, C, 0, left); bestK = 0;
      // np.argmin: first minimum wins; the C loop condition is !(v >= min).
      // (NaN cannot occur here: centres are means of finite uint8 values.)
      for (kk = 1; kk < k_eff; kk++) {
        dd = sqdist3(r, g, b, C, kk * 3, left);
        if (!(dd >= best)) { best = dd; bestK = kk; }
      }
      labelsFlat[i] = bestK;
    }

    // out[:, :, :3] = np.clip(np.rint(centers[labels_flat]), 0, 255).astype(np.uint8)
    out = new d.constructor(d);                        // rgba.copy(): alpha (and any extra channel) untouched
    var v;
    for (i = 0; i < n; i++) {
      base = labelsFlat[i] * 3;
      for (c = 0; c < 3; c++) {
        v = PF.rint(C[base + c]);                      // rint of a float32 is a float32 (integer-valued)
        v = v < 0 ? 0 : (v > 255 ? 255 : v);           // np.clip(x, 0, 255): NaN cannot occur (centres are means of finite pixels)
        out[i * cn + c] = v;                           // .astype(np.uint8): exact for integers in 0..255
      }
    }
    labels = { d: labelsFlat, w: w, h: h };
    centers = { d: new Float32Array(C), w: 3, h: k_eff };   // centers.astype(np.float32): a copy
    return { quantized: { d: out, w: w, h: h, cn: cn }, labels: labels, centers: centers,
      k_eff: k_eff, sample_idx: idx, uniq_n: uniq.n };
  };

  PF.versionQuantize = 'pf-11-quantize/1';
})();
