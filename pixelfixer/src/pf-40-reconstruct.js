/* pf-40-reconstruct.js -- port of pixelfixer/reconstruct.py (538 lines).
 *
 * Reconstruction: detected grid -> native-resolution pixel art.
 *
 * Reference docstring, kept verbatim because it records WHY each stage
 * exists (every one of these was a measured loss before it was added):
 *
 *   Lessons folded in from the ML branch's ColorNet (ml/dataset.py
 *   pool_cells) and from pixel-snapper:
 *
 *     1. PHASE matters: pooling on a phase-0 uniform grid lets cells straddle
 *        pseudo-pixel boundaries and mixes colors. Estimate the grid phase per
 *        axis (min within-cell variance over a phase sweep).
 *     2. Snap every cut to the local gradient maximum within +-30% of a cell
 *        (pixel-snapper's walker, done vectorized) so wobbly boundaries land
 *        where the image says they are.
 *     3. Pool per cell with center weighting (triangular in each axis): mush,
 *        anti-aliasing and jpeg bleed live at cell borders.
 *     4. Keep the CENTER PIXEL as a crisp sample; where the cell is busy
 *        (high std - a detail/outline cell) prefer it over the mean, which
 *        preserves 1px outlines that averaging washes out.
 *     5. Optional global palette snap (k-means in Oklab) to de-mix the rest.
 *
 * What ships: two_stage_pack (api.py default, two_stage=True). reconstruct()
 * with color="mode" is the two_stage=False fallback the API still offers;
 * both are ported, plus every helper, under the reference's names so the
 * call graph reads the same:
 *
 *   PF._axis_profile  PF._Sat  PF._best_phase  PF._comb_phase
 *   PF._snapped_cuts  PF._banded_cuts  PF._warped_cell_index
 *   PF.adaptive_k     PF.two_stage_pack  PF.reconstruct
 *
 * Needs pf-00-base.js at load. Resolved AT CALL TIME on PF (so load order
 * among the ports does not matter and a missing port throws by name):
 *   PF.kmeans_quantize   pf-11-quantize.js   (two_stage_pack stage 1)
 *   PF.kmeans, PF.theRNG pf-03-cv2.js        (reconstruct palette_snap)
 *   PF.srgb_to_oklab     pf-10-colorspace.js (reconstruct palette_snap)
 *
 * Conventions: an image is {d, w, h, cn} -- one flat interleaved
 * Uint8Array/Uint8ClampedArray, cn 3 or 4 (cn omitted = 4), `rgba.shape[:2]`
 * is (h, w). Straight cut lists are Int32Array (the reference's int64);
 * banded cuts are {d: Float64Array, w: n_cuts, h: n_bands}; an (n, 3)
 * float array is a flat Float64Array of length 3n.
 *
 * ---------------------------------------------------------------------
 * ARITHMETIC MODEL. Every item below was MEASURED against numpy 2.5.3 in
 * the reference venv, not inferred (tools/probe-sum-semantics.py + .js:
 * each model is tested bit-exact AND a plausible alternative is shown to
 * fail on the same data, so the probe can discriminate):
 *
 *  luminance  0.299*r + 0.587*g + 0.114*b on rgba[...,c].astype(float32):
 *             under NEP 50 the Python floats are cast to float32 FIRST, so
 *             g = f32(f32(f32(C_R*r) + f32(C_G*g)) + f32(C_B*b)) with
 *             C_R = f32(0.299) etc.; alpha: g = f32(g * f32(a/255)). Each
 *             fround here is exact emulation: the products (24x8 bits) and
 *             sums of these magnitudes fit a double before rounding.
 *  np.diff    float32 in, float32 out: f32(b - a).
 *  .sum(axis) on a float32 2-D array:
 *             axis=1 (the contiguous axis): numpy's pairwise_sum PER ROW,
 *               in float32 (8 accumulators up to 128 elements, recursive
 *               halving above) -- probe cases C and E (column slices too).
 *             axis=0: a plain SEQUENTIAL accumulation down each column, in
 *               float32 -- probe cases D and F. "Pairwise down the column"
 *               fails 9/14 there, "sequential per row" fails 10/14 on C.
 *  concatenate([[0], f32]) is FLOAT64 (int64 + float32 promotes to f64), so
 *             every profile downstream of _axis_profile is float64 holding
 *             float32 values; profile.mean() is pairwise f64 / n.
 *  .sum() of a contiguous 2-D float64 array is ONE pairwise_sum over the
 *             flat row-major data (probe B; "sum of per-row pairwise" fails
 *             10/14). (v*area).sum()/area.sum() in _Sat.cell_var uses this.
 *  (n,3).sum(-1) / .mean(1): ((a + b) + c), then / 3 (probe G).
 *  (h,w).sum(1) / .mean(1): pairwise per row, then / w (probe H).
 *  np.bincount(weights=): sequential out[i] += w[i] in input order (base
 *             shim, arr_bincount); every "bincount" here is a plain loop in
 *             pixel order, or a CSR walk that visits each bin's pixels in
 *             the same increasing order (identical additions, same bits).
 *  _Sat integral images are sums of uint8 values / squares (< 2^40): exact
 *             integers in float64, so their accumulation order cannot
 *             matter; the box sums are exact too. Only cell_var's final
 *             divisions and the pairwise total round.
 *  round():   Python round / np.round / np.rint are half-to-even (PF.rint);
 *             .astype(int) truncates toward zero; Python `%` on floats
 *             takes the divisor's sign (npMod below).
 *  argmax / argmin: FIRST extremum (PF.argmax; the C loop's !(v <= max)).
 *  lexsort tie order: np.lexsort is a stable sort, so
 *             - the "center pixel" (order[::-1] then unique(return_index))
 *               is the max-weight pixel of each cell, ties -> LARGEST
 *               original index;
 *             - _binned_mode's winner is the max-weight bin, ties -> LARGEST
 *               5-bit key (uniq is sorted, lexsort keeps that order among
 *               equal weights, and `last` takes the final one).
 *
 * PARITY LIMIT (palette_snap only): srgb_to_oklab calls pow/cbrt. The
 * reference's UCRT libm and V8's fdlibm disagree in the last bit (measured
 * in pf-10-colorspace.js and tools/probe-oklab-rounding.py: UCRT pow is not
 * correctly rounded in ~0.07% of inputs, UCRT cbrt in ~31%, and neither is
 * reproducible from JS). That only feeds a nearest-centre argmin, so it can
 * flip a cell only on a near-exact tie between two Oklab distances;
 * tools/test-reconstruct.js measures the actual cell-flip count on every
 * palette_snap fixture instead of assuming zero. Everything outside that
 * argmin is bit-exact.
 *
 * ES2017, no imports, no exports, no build step. Browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  function need(name, file) {
    if (typeof PF[name] !== 'function') {
      throw new Error('pf-40-reconstruct.js: PF.' + name + ' is missing -- load ' + file + ' first');
    }
  }
  ['arange', 'linspace', 'rint', 'round', 'clip', 'clipScalar', 'argmax', 'unique', 'interp',
    'searchsorted', 'pairwiseSum', 'npMaximum', 'npMinimum'].forEach(function (n) { need(n, 'pf-00-base.js'); });

  // ------------------------------------------------------------ helpers

  function imgShape(rgba, what) {
    if (!rgba || typeof rgba !== 'object') throw new Error(what + ': expected a {d, w, h, cn} image');
    var d = rgba.d;
    if (!(d instanceof Uint8Array || d instanceof Uint8ClampedArray)) {
      throw new Error(what + ': d must be a Uint8Array or Uint8ClampedArray (uint8 RGB / RGBA)');
    }
    var w = rgba.w | 0, h = rgba.h | 0;
    var cn = (rgba.cn === undefined || rgba.cn === null) ? 4 : (rgba.cn | 0);
    if (w <= 0 || h <= 0) throw new Error(what + ': empty image (' + w + 'x' + h + ')');
    if (cn !== 3 && cn !== 4) throw new Error(what + ': cn must be 3 or 4, got ' + cn);
    if (d.length !== w * h * cn) throw new Error(what + ': d.length ' + d.length + ' != w*h*cn ' + (w * h * cn));
    return { d: d, w: w, h: h, cn: cn };
  }

  // Python float `%` / np.remainder: fmod, then fold the remainder onto the
  // divisor's sign; an exactly-zero remainder takes the divisor's sign
  // (JS `%` alone keeps the dividend's sign, and -0.0 % 5 stays -0.0).
  function npMod(a, b) {
    var m = a % b;
    if (m !== 0) { if ((b < 0) !== (m < 0)) m += b; }
    else m = (b < 0) ? -0 : 0;
    return m;
  }

  var L_R = fr(0.299), L_G = fr(0.587), L_B = fr(0.114);

  // g = (0.299*R + 0.587*G + 0.114*B) in float32, times alpha/255 for RGBA.
  // Shared by _axis_profile and _banded_cuts, which spell it identically.
  function lumaF32(s) {
    var d = s.d, cn = s.cn, N = s.w * s.h, g = new Float32Array(N), i, b, v;
    for (i = 0, b = 0; i < N; i++, b += cn) {
      v = fr(fr(fr(L_R * d[b]) + fr(L_G * d[b + 1])) + fr(L_B * d[b + 2]));
      if (cn === 4) v = fr(v * fr(d[b + 3] / 255));
      g[i] = v;
    }
    return g;
  }

  // |d1| of g along x (axis 0 -> shape (h, w-1)) or y (axis 1 -> (h-1, w)),
  // float32, then summed across the perpendicular axis with numpy's order
  // for that axis (see the header: axis=0 sequential, axis=1 pairwise).
  function profileF32(g, w, h, axis) {
    var out, row, x, y, r0;
    if (axis === 0) {
      out = new Float32Array(w - 1);
      for (y = 0; y < h; y++) {
        r0 = y * w;
        for (x = 0; x < w - 1; x++) out[x] = fr(out[x] + Math.abs(fr(g[r0 + x + 1] - g[r0 + x])));
      }
      return out;
    }
    out = new Float32Array(h - 1);
    row = new Float32Array(w);
    for (y = 0; y < h - 1; y++) {
      r0 = y * w;
      for (x = 0; x < w; x++) row[x] = Math.abs(fr(g[r0 + w + x] - g[r0 + x]));
      out[y] = PF.pairwiseSum(row, 0, w, true);
    }
    return out;
  }

  /** |d1| of luminance summed across the perpendicular axis. Float32Array. */
  PF._axis_profile = function (rgba, axis) {
    var s = imgShape(rgba, 'PF._axis_profile');
    if (axis !== 0 && axis !== 1) throw new Error('PF._axis_profile: axis must be 0 or 1');
    return profileF32(lumaF32(s), s.w, s.h, axis);
  };

  // ------------------------------------------------------------- _Sat

  /** Integral images for within-cell variance of arbitrary cut sets. */
  function Sat(rgba) {
    if (!(this instanceof Sat)) return new Sat(rgba);
    var s = imgShape(rgba, 'PF._Sat'), w = s.w, h = s.h, cn = s.cn, d = s.d;
    var W1 = w + 1, H1 = h + 1;
    this.h = h; this.w = w; this._stride = W1;
    // S1[y+1][x+1] = img.cumsum(0).cumsum(1); S2 the same for (img**2).sum(-1).
    // Column running sums first (cumsum(0)), then a row prefix (cumsum(1)).
    var R = new Float64Array(W1 * H1), G = new Float64Array(W1 * H1), B = new Float64Array(W1 * H1);
    var Q = new Float64Array(W1 * H1);
    var cR = new Float64Array(w), cG = new Float64Array(w), cB = new Float64Array(w), cQ = new Float64Array(w);
    var x, y, p, r, g, b, aR, aG, aB, aQ, o;
    for (y = 0; y < h; y++) {
      aR = 0; aG = 0; aB = 0; aQ = 0;
      o = (y + 1) * W1 + 1;
      for (x = 0; x < w; x++) {
        p = (y * w + x) * cn;
        r = d[p]; g = d[p + 1]; b = d[p + 2];
        cR[x] += r; cG[x] += g; cB[x] += b; cQ[x] += (r * r + g * g) + b * b;
        aR += cR[x]; aG += cG[x]; aB += cB[x]; aQ += cQ[x];
        R[o + x] = aR; G[o + x] = aG; B[o + x] = aB; Q[o + x] = aQ;
      }
    }
    this.S1 = [R, G, B];
    this.S2 = Q;
  }

  /** Mean within-cell variance (area-weighted) of the grid xs x ys. */
  Sat.prototype.cell_var = function (xs, ys) {
    var nx = xs.length - 1, ny = ys.length - 1, W1 = this._stride;
    var R = this.S1[0], G = this.S1[1], B = this.S1[2], Q = this.S2;
    var m = (nx > 0 && ny > 0) ? nx * ny : 0;
    var va = new Float64Array(m), ar = new Float64Array(m), k = 0;
    var yi, xi, y0, y1, x0, x1, r0, r1, s1r, s1g, s1b, s2, area, t0, t1, t2, v;
    for (yi = 0; yi < ny; yi++) {
      y0 = ys[yi]; y1 = ys[yi + 1]; r0 = y0 * W1; r1 = y1 * W1;
      for (xi = 0; xi < nx; xi++) {
        x0 = xs[xi]; x1 = xs[xi + 1];
        // a1[1:,1:] - a1[:-1,1:] - a1[1:,:-1] + a1[:-1,:-1], left to right (exact integers)
        s1r = ((R[r1 + x1] - R[r0 + x1]) - R[r1 + x0]) + R[r0 + x0];
        s1g = ((G[r1 + x1] - G[r0 + x1]) - G[r1 + x0]) + G[r0 + x0];
        s1b = ((B[r1 + x1] - B[r0 + x1]) - B[r1 + x0]) + B[r0 + x0];
        s2 = ((Q[r1 + x1] - Q[r0 + x1]) - Q[r1 + x0]) + Q[r0 + x0];
        area = (y1 - y0) * (x1 - x0);
        area = (area > 1) ? area : 1;                       // np.maximum(area, 1)
        t0 = s1r / area; t1 = s1g / area; t2 = s1b / area;
        v = s2 / area - ((t0 * t0 + t1 * t1) + t2 * t2);    // ((s1/area)**2).sum(-1)
        va[k] = v * area; ar[k] = area; k++;
      }
    }
    // float((v * area).sum() / area.sum()): one pairwise sum over the flat (ny, nx) array
    return PF.pairwiseSum(va, 0, m, false) / PF.pairwiseSum(ar, 0, m, false);
  };
  PF._Sat = Sat;

  // -------------------------------------------------------- _best_phase

  /** Grid phase minimizing within-cell variance (SAT, coarse sweep). [px, py] */
  PF._best_phase = function (rgba, step_x, step_y, sat) {
    sat = sat || new Sat(rgba);
    var h = sat.h, w = sat.w;

    // np.unique(np.clip(np.round(np.arange(p, extent + step, step)).astype(int), 0, extent)),
    // with a leading 0 if the first cut is not already 0
    function cutsAt(p, extent, step) {
      var a = PF.round(PF.arange(p, extent + step, step)), i;
      for (i = 0; i < a.length; i++) a[i] = Math.trunc(a[i]);     // .astype(int)
      var u = PF.unique(PF.clip(a, 0, extent)).values;
      if (u.length === 0 || u[0] !== 0) {
        var v = new Float64Array(u.length + 1);
        v[0] = 0; v.set(u, 1);
        u = v;
      }
      return u;
    }

    var n = 5, bestPx = 0.0, bestPy = 0.0, bestV = Infinity, ky, kx, py, px, v;
    for (ky = 0; ky < n; ky++) {
      py = ky * (step_y / n);                                   // np.arange(n) * (step_y / n)
      for (kx = 0; kx < n; kx++) {
        px = kx * (step_x / n);
        v = sat.cell_var(cutsAt(px, w, step_x), cutsAt(py, h, step_y));
        if (v < bestV) { bestPx = px; bestPy = py; bestV = v; }  // strict: first minimum
      }
    }
    return [bestPx, bestPy];
  };

  // -------------------------------------------------------- _comb_phase

  /**
   * (phase, strength): sub-pixel comb phase of the cut-energy profile.
   *
   * Synthetic upscales have phase ~0 and razor-sharp combs; real images
   * wobble. Strength (peak/mean of the phase response) gates whether the
   * comb is trusted over the variance sweep.
   */
  PF._comb_phase = function (profile, step) {
    var n = profile.length;
    if (step < 1.5 || n < 3 * step) return [0.0, 0.0];
    var n_ph = Math.max(8, Math.trunc(PF.rint(step * 4)));       // int(round(step * 4))
    var nk = Math.trunc((n - 2) / step) + 1;                      // ks = arange(0, int((n-2)/step) + 1)
    var resp = new Float64Array(n_ph), vals = new Float64Array(nk);
    var p, k, ph, pos, valid, i0, f, cnt;
    for (p = 0; p < n_ph; p++) {
      ph = p * (step / n_ph);                                     // phases = arange(n_ph) * (step / n_ph)
      cnt = 0;
      for (k = 0; k < nk; k++) {
        pos = ph + k * step;
        valid = pos <= n - 2;
        i0 = PF.clipScalar(Math.trunc(pos), 0, n - 2);            // np.clip(pos.astype(int), 0, n-2)
        f = pos - i0;
        // (vals * valid): a bool multiply, so the invalid entries are v * 0.0
        vals[k] = (profile[i0] * (1 - f) + profile[i0 + 1] * f) * (valid ? 1 : 0);
        if (valid) cnt++;
      }
      resp[p] = PF.pairwiseSum(vals, 0, nk, false) / Math.max(cnt, 1);
    }
    var b = PF.argmax(resp);
    var mean = PF.pairwiseSum(resp, 0, n_ph, false) / n_ph;
    var strength = resp[b] / (mean + 1e-9);
    // parabolic sub-bin refinement (cyclic)
    var lo = resp[((b - 1) % n_ph + n_ph) % n_ph], hi = resp[(b + 1) % n_ph];
    var denom = (lo - 2 * resp[b]) + hi;
    var d = Math.abs(denom) > 1e-12 ? (0.5 * (lo - hi)) / denom : 0.0;
    ph = npMod(b * (step / n_ph) + PF.clipScalar(d, -1, 1) * (step / n_ph), step);
    return [ph, strength];
  };

  // ------------------------------------------------------- _snapped_cuts

  /**
   * Exactly n_cells+1 cut positions: lattice targets phase+k*step, each
   * interior cut snapped to the local |d1| max (profile[c] = energy of a
   * cut between columns c-1 and c). Count is exact by construction.
   * @returns {Int32Array}
   */
  PF._snapped_cuts = function (profile, step, phase, extent, n_cells, snap_ratio) {
    if (snap_ratio === undefined || snap_ratio === null) snap_ratio = 0.30;
    var cuts = new Int32Array(n_cells + 1);
    cuts[0] = 0;
    cuts[n_cells] = extent;
    var rad = Math.max(1, Math.trunc(PF.rint(step * snap_ratio)));
    var prof_mean = profile.length ? PF.pairwiseSum(profile, 0, profile.length, false) / profile.length : 0.0;
    // never create slivers: a cell may not shrink below ~55% of the step,
    // or its mode becomes the boundary color (reads as dark tear lines)
    var min_gap = Math.max(1, Math.floor(0.55 * step));
    var first = npMod(phase, step);
    // interior lattice targets: when the phase offset is small the first
    // interior cut sits one full step in; when it is large (> half a cell)
    // the phase line itself is the first interior cut
    var base = (first >= 0.5 * step) ? first : first + step;
    var prev = 0, j, t, c, lo, hi, i, segMax, segArg;
    for (j = 1; j < n_cells; j++) {
      t = base + (j - 1) * step;
      c = Math.trunc(PF.rint(Math.min(Math.max(t, 1), extent - 1)));
      lo = Math.max(prev + min_gap, c - rad);
      hi = Math.min(extent - 1, c + rad, extent - (n_cells - j) * min_gap);
      if (hi < lo) {
        c = Math.min(prev + min_gap, extent - (n_cells - j));
      } else {
        // seg = profile[lo:hi+1]; snap only onto real edge energy (>= 0.5x
        // profile mean); flat regions stay on the lattice instead of chasing noise
        segMax = -Infinity; segArg = 0;
        for (i = lo; i <= hi; i++) {
          if (!(profile[i] <= segMax)) { segMax = profile[i]; segArg = i - lo; }   // np.argmax: first max
        }
        if (hi + 1 > lo && segMax >= 0.5 * prof_mean && segMax > 1e-9) c = lo + segArg;
        else c = Math.min(Math.max(c, lo), hi);
      }
      c = Math.max(Math.min(c, extent - (n_cells - j)), prev + 1);
      cuts[j] = c;
      prev = c;
    }
    return cuts;
  };

  // -------------------------------------------------------- _banded_cuts

  /**
   * Bend global cut lines into per-band polylines ("drag pixels back
   * into shape"): each band re-snaps every cut to its own local |d1|
   * profile within +-rad of the global position, with one smoothing pass
   * across bands. Returns {edges: Int32Array(n_bands+1),
   * cuts: {d: Float64Array, w: n_cuts, h: n_bands}}.
   */
  PF._banded_cuts = function (rgba, base_cuts, step, axis, rad_ratio) {
    if (rad_ratio === undefined || rad_ratio === null) rad_ratio = 0.3;
    var s = imgShape(rgba, 'PF._banded_cuts'), w = s.w, h = s.h;
    if (axis !== 0 && axis !== 1) throw new Error('PF._banded_cuts: axis must be 0 or 1');
    var perp = axis === 0 ? h : w;
    var extent = axis === 0 ? w : h;
    var n_bands = Math.trunc(PF.clipScalar(perp / (step * 7), 1, 12));
    var lin = PF.linspace(0, perp, n_bands + 1), edges = new Int32Array(n_bands + 1), i;
    for (i = 0; i <= n_bands; i++) edges[i] = Math.trunc(lin[i]);   // .astype(int)
    var n_cuts = base_cuts.length;
    var cuts = new Float64Array(n_bands * n_cuts), b, j;
    for (b = 0; b < n_bands; b++) for (j = 0; j < n_cuts; j++) cuts[b * n_cuts + j] = base_cuts[j];
    if (n_bands <= 1) return { edges: edges, cuts: { d: cuts, w: n_cuts, h: 1 } };

    var g = lumaF32(s);
    var rad = Math.max(1, Math.trunc(PF.rint(step * rad_ratio)));
    var min_gap = Math.max(1, Math.floor(0.55 * step));
    var prof = new Float64Array(extent), row = new Float32Array(extent), x, y, r0, e0, e1;
    var c, lo, hi, slMax, slArg, pmean, base;
    for (b = 0; b < n_bands; b++) {
      e0 = edges[b]; e1 = edges[b + 1];
      // prof = concatenate([[0], seg.sum(axis=axis)]) -- float64 of float32 sums
      prof.fill(0);
      if (axis === 0) {
        // seg = d[e0:e1] of |diff(g, axis=1)| (h, w-1): sequential float32 down the band's rows
        row.fill(0);
        for (y = e0; y < e1; y++) {
          r0 = y * w;
          for (x = 0; x < w - 1; x++) row[x] = fr(row[x] + Math.abs(fr(g[r0 + x + 1] - g[r0 + x])));
        }
        for (x = 0; x < w - 1; x++) prof[x + 1] = row[x];
      } else {
        // seg = d[:, e0:e1] of |diff(g, axis=0)| (h-1, w): pairwise float32 per row over the band's columns
        for (y = 0; y < h - 1; y++) {
          r0 = y * w;
          for (x = e0; x < e1; x++) row[x - e0] = Math.abs(fr(g[r0 + w + x] - g[r0 + x]));
          prof[y + 1] = PF.pairwiseSum(row, 0, e1 - e0, true);
        }
      }
      pmean = PF.pairwiseSum(prof, 0, extent, false) / extent;
      base = b * n_cuts;
      for (j = 1; j < n_cuts - 1; j++) {
        c = base_cuts[j];
        lo = Math.max(Math.trunc(cuts[base + j - 1]) + min_gap, c - rad);
        hi = Math.min(extent - 1, c + rad, base_cuts[j + 1] - 1);
        if (hi <= lo) {
          cuts[base + j] = Math.max(cuts[base + j - 1] + min_gap, Math.min(c, extent - 1.0));
          continue;
        }
        slMax = -Infinity; slArg = 0;
        for (i = lo; i <= hi; i++) {
          if (!(prof[i] <= slMax)) { slMax = prof[i]; slArg = i - lo; }
        }
        if (hi + 1 > lo && slMax >= 0.5 * pmean && slMax > 1e-9) cuts[base + j] = lo + slArg;
        else cuts[base + j] = Math.min(Math.max(c, lo), hi);
      }
    }
    if (n_bands >= 3) {   // cut lines bend smoothly, they don't teleport
      var sm = new Float64Array(cuts);
      for (b = 1; b < n_bands - 1; b++) {
        for (j = 0; j < n_cuts; j++) {
          sm[b * n_cuts + j] = 0.5 * cuts[b * n_cuts + j] +
            0.25 * (cuts[(b - 1) * n_cuts + j] + cuts[(b + 1) * n_cuts + j]);
        }
      }
      cuts = sm;
    }
    for (b = 0; b < n_bands; b++) {                       // np.maximum.accumulate(cuts, axis=1); float, interpolated later
      base = b * n_cuts;
      for (j = 1; j < n_cuts; j++) cuts[base + j] = PF.npMaximum(cuts[base + j - 1], cuts[base + j]);
      cuts[base] = 0.0;
      cuts[base + n_cuts - 1] = extent;
    }
    return { edges: edges, cuts: { d: cuts, w: n_cuts, h: n_bands } };
  };

  // -------------------------------------------------- _warped_cell_index

  // Per-scanline cell index from one axis' banded cuts: out[r*extent + i]
  // for r in [0, perp_len), i in [0, extent).
  function warpIndex(bands, edges, perp_len, extent) {
    var n_b = bands.h, n_cuts = bands.w, bd = bands.d;
    var out = new Int32Array(perp_len * extent), i, r, j;
    var coords = new Float64Array(extent);
    for (i = 0; i < extent; i++) coords[i] = i + 0.5;
    if (n_b === 1) {
      var row = PF.searchsorted(bd.subarray(0, n_cuts), coords, 'right');
      for (r = 0; r < perp_len; r++) for (i = 0; i < extent; i++) out[r * extent + i] = row[i] - 1;
      return out;
    }
    var centers = new Float64Array(n_b);
    for (j = 0; j < n_b; j++) centers[j] = (edges[j] + edges[j + 1]) / 2.0;
    var t = new Float64Array(perp_len);
    for (r = 0; r < perp_len; r++) t[r] = r;
    // (n_cuts, perp_len) continuous polylines: control points at band centres
    var lines = new Float64Array(n_cuts * perp_len), col = new Float64Array(n_b);
    for (j = 0; j < n_cuts; j++) {
      for (r = 0; r < n_b; r++) col[r] = bd[r * n_cuts + j];
      lines.set(PF.interp(t, centers, col), j * perp_len);
    }
    for (j = 1; j < n_cuts; j++) {                          // np.maximum.accumulate(lines, axis=0)
      for (r = 0; r < perp_len; r++) {
        lines[j * perp_len + r] = PF.npMaximum(lines[(j - 1) * perp_len + r], lines[j * perp_len + r]);
      }
    }
    var lc = new Float64Array(n_cuts), ss;
    for (r = 0; r < perp_len; r++) {
      for (j = 0; j < n_cuts; j++) lc[j] = lines[j * perp_len + r];
      ss = PF.searchsorted(lc, coords, 'right');
      for (i = 0; i < extent; i++) out[r * extent + i] = ss[i] - 1;
    }
    return out;
  }

  /**
   * Per-pixel (ix, iy) from banded cut polylines.
   *
   * Cut positions are INTERPOLATED continuously across scanlines (control
   * points at band centres) - per-band constant cuts shear entire bands at
   * their boundaries, which reads as tearing in the reconstruction.
   * @returns {{ix: Int32Array, iy: Int32Array}} both h*w, row-major
   */
  PF._warped_cell_index = function (w, h, xs_bands, x_edges, ys_bands, y_edges, ncx, ncy) {
    var ix = warpIndex(xs_bands, x_edges, h, w);              // (h, w)
    var iyT = warpIndex(ys_bands, y_edges, w, h);             // (w, h), transposed below
    var iy = new Int32Array(h * w), x, y, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) iy[y * w + x] = iyT[x * h + y];
    for (i = 0; i < h * w; i++) {
      ix[i] = PF.clipScalar(ix[i], 0, ncx - 1);
      iy[i] = PF.clipScalar(iy[i], 0, ncy - 1);
    }
    return { ix: ix, iy: iy };
  };

  // ------------------------------------------------------ two-stage packing

  /**
   * Structure-only colour count from the image's complexity.
   *
   * The quantisation in two-stage packing only has to SEPARATE regions for the
   * placement vote (the final colour comes from the original pixels), so K
   * should be generous. Count coarse (4-bit) colour bins holding >= `share` of
   * the opaque pixels - roughly how many meaningful regions the art has - and
   * clamp to [lo, hi].
   */
  PF.adaptive_k = function (rgba, lo, hi, share) {
    if (lo === undefined || lo === null) lo = 16;
    if (hi === undefined || hi === null) hi = 48;
    if (share === undefined || share === null) share = 0.003;
    var s = imgShape(rgba, 'PF.adaptive_k'), d = s.d, cn = s.cn, N = s.w * s.h;
    var cnt = new Int32Array(4096), total = 0, i, b, key, k = 0;
    for (i = 0, b = 0; i < N; i++, b += cn) {
      if (cn === 4 && !(d[b + 3] > 0)) continue;
      key = ((d[b] >> 4) << 8) | ((d[b + 1] >> 4) << 4) | (d[b + 2] >> 4);
      cnt[key]++;
      total++;
    }
    if (total === 0) return lo;
    for (i = 0; i < 4096; i++) if (cnt[i] / total >= share) k++;
    return PF.clipScalar(k, lo, hi);
  };

  // CSR grouping of pixel indices by cell, in increasing pixel order within
  // each cell (a stable counting sort), so a per-cell walk performs the
  // same additions in the same order as np.bincount over all pixels.
  function csrByCell(cell, N, n) {
    var offs = new Int32Array(n + 1), order = new Int32Array(N), i, c, fill;
    for (i = 0; i < N; i++) offs[cell[i] + 1]++;
    for (c = 0; c < n; c++) offs[c + 1] += offs[c];
    fill = new Int32Array(offs.subarray(0, n));
    for (i = 0; i < N; i++) { c = cell[i]; order[fill[c]++] = i; }
    return { offs: offs, order: order };
  }

  /**
   * Two-stage reconstruction on a regular even grid.
   *
   * Stage 1 (STRUCTURE): quantise the image to a small palette and let each
   * cell vote among the clean quantised LABELS - a crisp placement decision
   * (which region a cell belongs to), the source of pixel-snapper's clean
   * lines, but used only to decide placement.
   *
   * Stage 2 (COLOUR): colour each cell from the ORIGINAL pixels carrying the
   * winning label (a centre-weighted mean of just those pixels). So a boundary
   * cell picks 'outline' cleanly, then gets the TRUE outline colour - crisp
   * lines AND accurate, un-clamped colours (rare colours survive).
   *
   * @returns {{d, w: cols, h: rows, cn}} uint8, same channel count as the input
   */
  PF.two_stage_pack = function (rgba, cols, rows, k_colors) {
    need('kmeans_quantize', 'pf-11-quantize.js');
    var s = imgShape(rgba, 'PF.two_stage_pack'), w = s.w, h = s.h, cn = s.cn, d = s.d, N = w * h;
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.two_stage_pack: cols and rows must be >= 1');
    if (k_colors === undefined || k_colors === null) k_colors = 0;
    var K = k_colors > 0 ? k_colors : PF.adaptive_k(rgba);
    var lab = PF.kmeans_quantize(rgba, K).labels.d;
    var i, c, ch, x, y, b;
    var maxLab = 0;
    for (i = 0; i < N; i++) if (lab[i] > maxLab) maxLab = lab[i];
    K = maxLab + 1;
    var n = cols * rows;

    var rgb = new Float64Array(3 * N);
    for (i = 0, b = 0; i < N; i++, b += cn) {
      rgb[3 * i] = d[b] / 255.0; rgb[3 * i + 1] = d[b + 1] / 255.0; rgb[3 * i + 2] = d[b + 2] / 255.0;
    }
    var ix = new Int32Array(w), iy = new Int32Array(h);
    for (x = 0; x < w; x++) ix[x] = PF.clipScalar(Math.floor((x * cols) / w), 0, cols - 1);
    for (y = 0; y < h; y++) iy[y] = PF.clipScalar(Math.floor((y * rows) / h), 0, rows - 1);

    // triangular centre weight within each even cell
    var wc = w / cols, hr = h / rows;
    var wx = new Float64Array(w), wy = new Float64Array(h), fx, fy;
    for (x = 0; x < w; x++) { fx = ((x + 0.5) - ix[x] * wc) / wc; wx[x] = 1.0 - 2.0 * Math.abs(fx - 0.5); }
    for (y = 0; y < h; y++) { fy = ((y + 0.5) - iy[y] * hr) / hr; wy[y] = 1.0 - 2.0 * Math.abs(fy - 0.5); }
    var cell = new Int32Array(N), wgt = new Float64Array(N);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        cell[i] = iy[y] * cols + ix[x];
        wgt[i] = wy[y] * wx[x] + 1e-4;
      }
    }

    // stage 1: winning label per cell (argmax of the per-(cell, label)
    // weight sums; np.bincount order == pixel order == this CSR walk)
    var csr = csrByCell(cell, N, n), offs = csr.offs, order = csr.order;
    var acc = new Float64Array(K), win = new Int32Array(n), p, q;
    for (c = 0; c < n; c++) {
      acc.fill(0);
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; acc[lab[q]] += wgt[q]; }
      win[c] = PF.argmax(acc);
    }

    // stage 2: colour from original pixels carrying the winning label
    var denom = new Float64Array(n), sums = new Float64Array(3 * n), selcnt = new Float64Array(n);
    var sel = new Uint8Array(N), ws;
    for (i = 0; i < N; i++) {
      c = cell[i];
      sel[i] = (lab[i] === win[c]) ? 1 : 0;
      ws = sel[i] ? wgt[i] : 0.0;                         // wsel = wgt * sel
      denom[c] += ws;
      sums[3 * c] += rgb[3 * i] * ws;
      sums[3 * c + 1] += rgb[3 * i + 1] * ws;
      sums[3 * c + 2] += rgb[3 * i + 2] * ws;
      selcnt[c] += sel[i] ? 1.0 : 0.0;
    }
    var out = new Float64Array(3 * n), dn, anyBad = false;
    for (c = 0; c < n; c++) {
      dn = PF.npMaximum(denom[c], 1e-9);
      out[3 * c] = sums[3 * c] / dn; out[3 * c + 1] = sums[3 * c + 1] / dn; out[3 * c + 2] = sums[3 * c + 2] / dn;
      if (selcnt[c] < 0.5) anyBad = true;
    }
    var cntf = new Float64Array(n);
    for (c = 0; c < n; c++) cntf[c] = Math.max(offs[c + 1] - offs[c], 1);   // np.maximum(np.bincount(cell), 1)
    if (anyBad) {
      var msum = new Float64Array(3 * n);
      for (i = 0; i < N; i++) {
        c = cell[i];
        msum[3 * c] += rgb[3 * i]; msum[3 * c + 1] += rgb[3 * i + 1]; msum[3 * c + 2] += rgb[3 * i + 2];
      }
      for (c = 0; c < n; c++) {
        if (selcnt[c] < 0.5) {
          for (ch = 0; ch < 3; ch++) out[3 * c + ch] = msum[3 * c + ch] / cntf[c];
        }
      }
    }

    var low = new d.constructor(n * cn), v;
    for (c = 0; c < n; c++) {
      for (ch = 0; ch < 3; ch++) {
        v = PF.rint(out[3 * c + ch] * 255);
        low[c * cn + ch] = PF.clipScalar(v, 0, 255);
      }
    }
    if (cn === 4) {
      var asum = new Float64Array(n);
      for (i = 0; i < N; i++) asum[cell[i]] += (d[i * 4 + 3] > 127) ? 1.0 : 0.0;
      for (c = 0; c < n; c++) low[c * 4 + 3] = (asum[c] / cntf[c] > 0.5) ? 255 : 0;
    }
    return { d: low, w: cols, h: rows, cn: cn };
  };

  // ------------------------------------------------------------ reconstruct

  /**
   * Legacy grid-cut reconstructor (superseded by two_stage_pack).
   *
   * Kept as the two_stage=False fallback: snaps per-axis cut lines to the
   * |d1| lattice, refines them into per-band warp polylines, then colours each
   * cell by a center-weighted 5-bit local mode. two_stage_pack is the default
   * server path; this remains for A/B and for the phase-locked synthetic case.
   *
   * opts (reference keyword defaults):
   *   palette_snap: true, use_phase: true, use_snap: true, color: "auto",
   *   dark_stroke: false, std_thresh: 0.085
   * color: "mode" (5-bit binned local mode, center-weighted, global bin means)
   * | "cw" center-weighted mean | "auto" cw with center-pixel for busy cells.
   * Any other string behaves as "cw", exactly as the reference's if/else does.
   * dark_stroke: opt-in 1px-outline re-vote (helps AI mixels, hurts exact-GT
   * on jittered synthetics).
   *
   * @returns {{d, w, h, cn: 4}} uint8 RGBA (rows x cols); if the palette snap's
   *   k-means threw, the message is kept on `_palette_snap_error` (the
   *   reference swallows it silently; here the swallow is visible).
   */
  PF.reconstruct = function (rgba, step_x, step_y, cols, rows, opts) {
    opts = opts || {};
    var palette_snap = (opts.palette_snap === undefined) ? true : !!opts.palette_snap;
    var use_phase = (opts.use_phase === undefined) ? true : !!opts.use_phase;
    var use_snap = (opts.use_snap === undefined) ? true : !!opts.use_snap;
    var color = (opts.color === undefined || opts.color === null) ? 'auto' : String(opts.color);
    var dark_stroke = !!opts.dark_stroke;
    var std_thresh = (opts.std_thresh === undefined || opts.std_thresh === null) ? 0.085 : +opts.std_thresh;

    var s = imgShape(rgba, 'PF.reconstruct'), w = s.w, h = s.h, cn = s.cn, d = s.d, N = w * h;
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.reconstruct: cols and rows must be >= 1');
    var sat = new Sat(rgba);
    var i, c, ch, x, y, b, k;

    // profile[c] = |d1| energy of a cut between columns c-1 and c
    var g = lumaF32(s);
    var prof_x = new Float64Array(w), prof_y = new Float64Array(h);
    prof_x.set(profileF32(g, w, h, 0), 1);
    prof_y.set(profileF32(g, w, h, 1), 1);

    var px, py, cx, cy;
    if (use_phase) {
      cx = PF._comb_phase(prof_x, step_x);
      cy = PF._comb_phase(prof_y, step_y);
      px = cx[0]; py = cy[0];
      if (Math.min(cx[1], cy[1]) < 1.35) {   // mushy: comb unreliable
        var bp = PF._best_phase(rgba, step_x, step_y, sat);
        px = bp[0]; py = bp[1];
      }
    } else {
      px = 0.0; py = 0.0;
    }
    if (!use_snap) {
      prof_x = new Float64Array(w);
      prof_y = new Float64Array(h);
    }

    // candidate cut sets per axis: snapped / phase-lattice / phase-0
    // lattice (the legacy extractor). The within-cell variance objective
    // picks per axis, so this can only match or beat the legacy grid.
    var flat_x = new Float64Array(w), flat_y = new Float64Array(h);
    var cand_x = [PF._snapped_cuts(prof_x, step_x, px, w, cols),
                  PF._snapped_cuts(flat_x, step_x, px, w, cols),
                  PF._snapped_cuts(flat_x, step_x, 0.0, w, cols)];
    var cand_y = [PF._snapped_cuts(prof_y, step_y, py, h, rows),
                  PF._snapped_cuts(flat_y, step_y, py, h, rows),
                  PF._snapped_cuts(flat_y, step_y, 0.0, h, rows)];
    // Python min(list, key=f): the FIRST candidate with the smallest key
    function pickMin(cands, keyFn) {
      var best = cands[0], bestKey = keyFn(cands[0]), j, kv;
      for (j = 1; j < cands.length; j++) { kv = keyFn(cands[j]); if (kv < bestKey) { best = cands[j]; bestKey = kv; } }
      return best;
    }
    var xs = pickMin(cand_x, function (cc) { return sat.cell_var(cc, cand_y[2]); });
    var ys = pickMin(cand_y, function (cc) { return sat.cell_var(xs, cc); });

    // per-pixel cell index from the straight cut lists
    var ncx = xs.length - 1, ncy = ys.length - 1;
    var ix = new Int32Array(w), iy = new Int32Array(h);
    for (x = 0; x < w; x++) ix[x] = PF.clipScalar(PF.searchsorted(xs, x, 'right') - 1, 0, ncx - 1);
    for (y = 0; y < h; y++) iy[y] = PF.clipScalar(PF.searchsorted(ys, y, 'right') - 1, 0, ncy - 1);
    var cell = new Int32Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) cell[y * w + x] = iy[y] * ncx + ix[x];
    var n = ncx * ncy;

    var rgb = new Float64Array(3 * N);
    for (i = 0, b = 0; i < N; i++, b += cn) {
      rgb[3 * i] = d[b] / 255.0; rgb[3 * i + 1] = d[b + 1] / 255.0; rgb[3 * i + 2] = d[b + 2] / 255.0;
    }

    function pooledVar(cellIdx) {
      var c1 = new Float64Array(n), m = new Float64Array(3 * n), q = new Float64Array(3 * n), r;
      for (i = 0; i < N; i++) {
        c = cellIdx[i]; c1[c] += 1;
        for (ch = 0; ch < 3; ch++) { r = rgb[3 * i + ch]; m[3 * c + ch] += r; q[3 * c + ch] += r * r; }
      }
      var v = new Float64Array(n), t0, t1, t2, mm;
      for (c = 0; c < n; c++) {
        if (!(c1[c] > 1)) c1[c] = 1;                          // np.maximum(bincount, 1)
        mm = m[3 * c] / c1[c]; t0 = PF.npMaximum(q[3 * c] / c1[c] - mm * mm, 0);
        mm = m[3 * c + 1] / c1[c]; t1 = PF.npMaximum(q[3 * c + 1] / c1[c] - mm * mm, 0);
        mm = m[3 * c + 2] / c1[c]; t2 = PF.npMaximum(q[3 * c + 2] / c1[c] - mm * mm, 0);
        v[c] = ((t0 + t1) + t2) * c1[c];
      }
      return PF.pairwiseSum(v, 0, n, false) / PF.pairwiseSum(c1, 0, n, false);
    }

    // banded (warped) refinement: adopt only when it measurably reduces
    // within-cell variance (blocks/warp cases; straight grids unaffected)
    if (use_snap) {
      var xb = PF._banded_cuts(rgba, xs, step_x, 0);
      var yb = PF._banded_cuts(rgba, ys, step_y, 1);
      if (xb.cuts.h > 1 || yb.cuts.h > 1) {
        var wi = PF._warped_cell_index(w, h, xb.cuts, xb.edges, yb.cuts, yb.edges, ncx, ncy);
        var cell_w = new Int32Array(N);
        for (i = 0; i < N; i++) cell_w[i] = wi.iy[i] * ncx + wi.ix[i];
        if (pooledVar(cell_w) < 0.995 * pooledVar(cell)) cell = cell_w;
      }
    }

    // center weights: triangular within each cell span (from the STRAIGHT cuts)
    var wx = new Float64Array(w), wy = new Float64Array(h), lo, hi, f;
    for (x = 0; x < w; x++) {
      lo = xs[ix[x]]; hi = xs[ix[x] + 1];
      f = ((x + 0.5) - lo) / Math.max(hi - lo, 1);
      wx[x] = 1.0 - 2.0 * Math.abs(f - 0.5);
    }
    for (y = 0; y < h; y++) {
      lo = ys[iy[y]]; hi = ys[iy[y] + 1];
      f = ((y + 0.5) - lo) / Math.max(hi - lo, 1);
      wy[y] = 1.0 - 2.0 * Math.abs(f - 0.5);
    }
    var wgt = new Float64Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) wgt[y * w + x] = wy[y] * wx[x] + 1e-4;

    var cnt = new Float64Array(n), wsum = new Float64Array(n);
    var cwS = new Float64Array(3 * n), mS = new Float64Array(3 * n), sqS = new Float64Array(3 * n), r;
    for (i = 0; i < N; i++) {
      c = cell[i]; cnt[c] += 1; wsum[c] += wgt[i];
      for (ch = 0; ch < 3; ch++) {
        r = rgb[3 * i + ch];
        cwS[3 * c + ch] += r * wgt[i];
        mS[3 * c + ch] += r;
        sqS[3 * c + ch] += r * r;
      }
    }
    var cw = new Float64Array(3 * n), mean = new Float64Array(3 * n), std = new Float64Array(n), s0, s1, s2, mm;
    for (c = 0; c < n; c++) {
      if (!(cnt[c] > 1)) cnt[c] = 1;                           // np.maximum(bincount, 1)
      if (!(wsum[c] > 1e-6)) wsum[c] = 1e-6;                   // np.maximum(wsum, 1e-6)
      for (ch = 0; ch < 3; ch++) {
        cw[3 * c + ch] = cwS[3 * c + ch] / wsum[c];
        mean[3 * c + ch] = mS[3 * c + ch] / cnt[c];
      }
      mm = mean[3 * c];     s0 = Math.sqrt(PF.npMaximum(sqS[3 * c] / cnt[c] - mm * mm, 0));
      mm = mean[3 * c + 1]; s1 = Math.sqrt(PF.npMaximum(sqS[3 * c + 1] / cnt[c] - mm * mm, 0));
      mm = mean[3 * c + 2]; s2 = Math.sqrt(PF.npMaximum(sqS[3 * c + 2] / cnt[c] - mm * mm, 0));
      std[c] = ((s0 + s1) + s2) / 3;
    }

    var out;
    if (color === 'mode') {
      // 5-bit-binned LOCAL mode with center-weighted votes (pixel-art-lab):
      // near-duplicate AA colors merge into one bin instead of splitting
      // the vote, and rare local colors can win their own cell - a global
      // k-means codebook cannot represent them.
      var key = new Int32Array(N);
      for (i = 0, b = 0; i < N; i++, b += cn) key[i] = ((d[b] >> 3) << 10) | ((d[b + 1] >> 3) << 5) | (d[b + 2] >> 3);

      // global per-bin mean colors: denoises like k-means centers but
      // every rare local bin keeps its own representative
      var gcnt = new Float64Array(32768), gmean = new Float64Array(3 * 32768);
      for (i = 0; i < N; i++) {
        k = key[i]; gcnt[k] += 1;
        gmean[3 * k] += rgb[3 * i]; gmean[3 * k + 1] += rgb[3 * i + 1]; gmean[3 * k + 2] += rgb[3 * i + 2];
      }
      for (k = 0; k < 32768; k++) {
        var gc = PF.npMaximum(gcnt[k], 1);
        gmean[3 * k] /= gc; gmean[3 * k + 1] /= gc; gmean[3 * k + 2] /= gc;
      }

      var csr = csrByCell(cell, N, n), offs = csr.offs, order = csr.order;
      var binW = new Float64Array(32768), touched = new Int32Array(32768);

      // Per-cell winning bin (weighted votes); color = the bin's image-wide
      // mean. NaN marks a cell with no (selected) pixels. Weights per
      // (cell, key) bin accumulate in pixel order like np.bincount(inv, ...);
      // the winner is the max weight, ties -> the largest key (lexsort order).
      function binnedMode(selMask) {
        var colr = new Float64Array(3 * n), p, q, kk, nt, bestW, bestK, j;
        colr.fill(NaN);
        for (c = 0; c < n; c++) {
          nt = 0;
          for (p = offs[c]; p < offs[c + 1]; p++) {
            q = order[p];
            if (selMask && !selMask[q]) continue;
            kk = key[q];
            if (binW[kk] === 0 && !(nt > 0 && hasTouched(kk, nt))) touched[nt++] = kk;
            binW[kk] += wgt[q];
          }
          if (nt === 0) continue;
          bestW = -Infinity; bestK = -1;
          for (j = 0; j < nt; j++) {
            kk = touched[j];
            if (binW[kk] > bestW || (binW[kk] === bestW && kk > bestK)) { bestW = binW[kk]; bestK = kk; }
          }
          for (j = 0; j < nt; j++) binW[touched[j]] = 0;
          colr[3 * c] = gmean[3 * bestK]; colr[3 * c + 1] = gmean[3 * bestK + 1]; colr[3 * c + 2] = gmean[3 * bestK + 2];
        }
        return colr;
      }
      // A bin whose running weight is exactly 0 after being touched cannot
      // happen (wgt >= 1e-4 > 0), but the guard keeps `touched` duplicate-free
      // even if it did, rather than relying on that fact silently.
      function hasTouched(kk, nt) {
        for (var j = 0; j < nt; j++) if (touched[j] === kk) return true;
        return false;
      }

      out = binnedMode(null);
      for (c = 0; c < n; c++) {
        if (out[3 * c] !== out[3 * c]) {                          // bad = isnan(out[:, 0])
          out[3 * c] = mean[3 * c]; out[3 * c + 1] = mean[3 * c + 1]; out[3 * c + 2] = mean[3 * c + 2];
        }
      }

      // dark-stroke minority re-vote (pixel-art-lab): when a cell's chosen
      // color is much brighter than its darkest pixels AND those dark
      // pixels are a minority (a 1px outline clipping the cell), re-vote
      // among the dark pixels only. Preserves outlines mode voting drops.
      // (The reference computes the vote unconditionally and only gates the
      // assignment on dark_stroke; the result is identical, so the work is
      // skipped here when dark_stroke is off.)
      if (dark_stroke) {
        var T = 38.0 / 255.0;
        var luma_px = new Float64Array(N), min_luma = new Float64Array(n), out_luma = new Float64Array(n);
        min_luma.fill(2.0);
        for (i = 0; i < N; i++) {
          luma_px[i] = (0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1]) + 0.114 * rgb[3 * i + 2];
          min_luma[cell[i]] = PF.npMinimum(min_luma[cell[i]], luma_px[i]);   // np.minimum.at
        }
        var darkAdd = PF.npMaximum(8.0 / 255.0, 0.35 * T);
        var dark_px = new Uint8Array(N), dark_cnt = new Float64Array(n), need_ = new Uint8Array(n);
        for (i = 0; i < N; i++) {
          dark_px[i] = (luma_px[i] <= min_luma[cell[i]] + darkAdd) ? 1 : 0;   // dark_cut = min_luma + max(8/255, 0.35*T)
          dark_cnt[cell[i]] += dark_px[i] ? 1.0 : 0.0;
        }
        for (c = 0; c < n; c++) {
          out_luma[c] = (0.299 * out[3 * c] + 0.587 * out[3 * c + 1]) + 0.114 * out[3 * c + 2];
          need_[c] = ((out_luma[c] - min_luma[c] >= T) &&
                      (dark_cnt[c] >= PF.npMaximum(2, 0.08 * cnt[c])) &&    // not lone noise
                      (dark_cnt[c] <= Math.ceil(0.42 * cnt[c]))) ? 1 : 0;
        }
        var selD = new Uint8Array(N), anySel = false;
        for (i = 0; i < N; i++) { selD[i] = (need_[cell[i]] && dark_px[i]) ? 1 : 0; if (selD[i]) anySel = true; }
        if (anySel) {
          var dark_col = binnedMode(selD);
          for (c = 0; c < n; c++) {
            if (need_[c] && dark_col[3 * c] === dark_col[3 * c]) {    // ok = need & ~isnan(dark_col[:, 0])
              out[3 * c] = dark_col[3 * c]; out[3 * c + 1] = dark_col[3 * c + 1]; out[3 * c + 2] = dark_col[3 * c + 2];
            }
          }
        }
      }
    } else {
      out = new Float64Array(cw);
      if (color === 'auto') {
        // center pixel per cell (max weight): np.lexsort((wgt, cell))[::-1] then
        // np.unique(return_index) -> the max-weight pixel, ties -> LARGEST index
        var bestW = new Float64Array(n), bestI = new Int32Array(n);
        bestW.fill(-Infinity); bestI.fill(-1);
        for (i = 0; i < N; i++) {
          c = cell[i];
          if (wgt[i] >= bestW[c]) { bestW[c] = wgt[i]; bestI[c] = i; }
        }
        for (c = 0; c < n; c++) {
          if (std[c] > std_thresh) {                                // busy cells take the crisp centre sample
            i = bestI[c];
            if (i >= 0) { out[3 * c] = rgb[3 * i]; out[3 * c + 1] = rgb[3 * i + 1]; out[3 * c + 2] = rgb[3 * i + 2]; }
            else { out[3 * c] = 0; out[3 * c + 1] = 0; out[3 * c + 2] = 0; }   // cpx = np.zeros((n, 3))
          }
        }
      }
    }

    var snapError = null;
    if (palette_snap) {
      // global palette from cell colors; snap in Oklab
      need('kmeans', 'pf-03-cv2.js'); need('srgb_to_oklab', 'pf-10-colorspace.js');
      // k = int(min(48, max(8, n ** 0.5 // 2))). Math.sqrt for n ** 0.5: both
      // are exact on perfect squares and floor(x/2) cannot straddle an
      // integer for a non-square n, so the two spellings agree.
      var kk = Math.trunc(Math.min(48, Math.max(8, Math.floor(Math.sqrt(n) / 2))));
      var data = new Float32Array(3 * n);
      for (i = 0; i < 3 * n; i++) data[i] = fr(out[i]);
      var km = null;
      try {
        km = PF.kmeans({ d: data, w: 3, h: n }, kk, { maxCount: 12, epsilon: 0.5 }, 2);
      } catch (e) {
        // reference: `except Exception: pass` (cv2 raises when n < k, e.g. a
        // 2x2 output); the miss is recorded on the result instead of vanishing
        snapError = String(e && e.message ? e.message : e);
      }
      if (km) {
        var centers = new Float64Array(km.centers.d);            // centers.astype(np.float64)
        var lab = PF.srgb_to_oklab(out, n), clab = PF.srgb_to_oklab(centers, kk);
        var snapped = new Float64Array(3 * n), dl, da, db, dist, bestD, bestJ, j;
        for (c = 0; c < n; c++) {
          bestD = Infinity; bestJ = 0;
          for (j = 0; j < kk; j++) {
            dl = lab[3 * c] - clab[3 * j]; da = lab[3 * c + 1] - clab[3 * j + 1]; db = lab[3 * c + 2] - clab[3 * j + 2];
            dist = (dl * dl + da * da) + db * db;
            if (j === 0 || !(dist >= bestD)) { bestD = dist; bestJ = j; }   // np.argmin: first minimum
          }
          snapped[3 * c] = centers[3 * bestJ]; snapped[3 * c + 1] = centers[3 * bestJ + 1]; snapped[3 * c + 2] = centers[3 * bestJ + 2];
        }
        out = snapped;
      }
    }

    var low = new d.constructor(n * 4), v;
    for (c = 0; c < n; c++) {
      for (ch = 0; ch < 3; ch++) {
        v = PF.rint(out[3 * c + ch] * 255);
        low[c * 4 + ch] = PF.clipScalar(v, 0, 255);
      }
    }
    if (cn === 4) {
      var asum = new Float64Array(n);
      for (i = 0; i < N; i++) asum[cell[i]] += (d[i * 4 + 3] > 127) ? 1.0 : 0.0;
      for (c = 0; c < n; c++) low[c * 4 + 3] = (asum[c] / cnt[c] > 0.5) ? 255 : 0;
    } else {
      for (c = 0; c < n; c++) low[c * 4 + 3] = 255;
    }
    var res = { d: low, w: ncx, h: ncy, cn: 4 };
    if (snapError !== null) res._palette_snap_error = snapError;
    return res;
  };

  // internals for tools/test-reconstruct.js
  PF._reconstructInternals = { imgShape: imgShape, npMod: npMod, lumaF32: lumaF32, profileF32: profileF32, csrByCell: csrByCell };

  PF.versionReconstruct = 'pf-40-reconstruct/1';
})();
