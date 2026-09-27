/* pf-24-fusion.js - port of pixelfixer/fusion.py (ef376e5): every
 * periodicity channel of channels.py sampled on one geometric step ladder,
 * summed into a fused curve, and (in fusion.detect) arbitrated per axis.
 *
 * The reference's module docstring, kept because it names the channels:
 *
 *   Fusion prototype: instrument every periodicity channel in
 *   pixelfixer.grid on a common candidate-step ladder, dump the
 *   per-(image, axis, step) score table, learn/derive an interpretable
 *   fusion rule, and run the bench with it.
 *
 *   Channels recorded per (axis, step)
 *       comb_e1  comb z on pooled E1 (quantized-image edge profile)
 *       comb_e2  comb z on pooled E2 (original-image curvature profile)
 *       ray_e1   Rayleigh peak coherence on E1
 *       ray_e2   Rayleigh peak coherence on E2
 *       band_e1  Stouffer combo of per-band max(comb, rayleigh), E1 bands
 *       band_e2  same for E2 bands
 *       tile_e1  2D-tile Rayleigh (quantized gradient map)
 *       tile_e2  2D-tile Rayleigh (original curvature map)
 *       spec_e1  Welch spectral z (quantized gradient map)
 *       spec_e2  Welch spectral z (original curvature map)
 *       vc       CellVarContrast detrended z (square cells; same for both axes)
 *
 * WHO CALLS WHAT (grepped in the reference, not assumed):
 *   core.detect(mode="full"), stage 2 (core.py:145-189):
 *       build_evidence(rgba, lean=True), ladder(), ACTIVE_CHANNELS,
 *       channel_matrix(ev, axis, steps, only=ACTIVE_CHANNELS), fused_curve
 *   fusion.detect(rgba): nothing in the package calls it (core never does;
 *       api/cli do not import fusion). Ported because it is the module's own
 *       entry point and the only caller of _axis_detect, _local_maxima,
 *       _band_stouffer, _cached_matrices and the non-lean evidence.
 *   NOT ported: extract_table / analyze / _image_class (offline bench
 *       tooling: pandas, sklearn and tools.bench_common, none of which a
 *       browser has; extract_table also reads a ROOT that fusion.py never
 *       defines) and the OUT_DIR / TABLE_CSV / CACHE_DIR paths.
 *   _cached_matrices keeps its name and call site but not its disk cache:
 *       the reference stores the two matrices as .npz keyed by the image's
 *       md5 and reads them back losslessly, so a cache hit returns the same
 *       float64 values a miss computes (given the same code). A browser has
 *       no such disk; this always computes.
 *
 * DOES THIS MODULE REACH KMEANS? YES. build_evidence calls
 * PF.kmeans_quantize(medianBlur(rgba), 16), whose cv2.kmeans draws from
 * OpenCV's process-global, never-seeded RNG (pf-03 PF.theRNG). Every result
 * downstream of the quantized image (E1 profiles, bands, the dq* gradient
 * maps, hence ray_e1 / band_e1 / tile_e1 / spec_e1 and every decision) is
 * therefore reproducible only as the FIRST k-means of a fresh process, on
 * both sides. tools/test-fusion.cjs and tools/parity-fusion.py run one
 * (image, mode) per process for that reason, and the Python side asserts
 * exactly one k-means per process. Nothing else here draws a random number.
 *
 * DEPENDENCIES, looked up by name WHEN CALLED (this file loads before the
 * channels halves, and a test can install a recorder in their place):
 *   PF.channels (pf-30-channels-a.js): axis_profiles _jpeg_lattice_strength
 *     _notch_jpeg _grad_maps _tile_peaks _axis_spectrum _spectral_background
 *     _PooledProfile _comb_score _rayleigh_score _lattice_refine
 *     _tiles_ray_z _spectral_z
 *   PF.channels (pf-31-channels-b.js): band_profiles _exclusive_slot_occupancy
 *   PF.varcontrast.CellVarContrast (pf-23-varcontrast.js): .z_channel()
 *   PF.kmeans_quantize (pf-11)  PF.medianBlur (pf-03)
 *   PF.pyRound PF.rint PF.linspace PF.sum PF.clipScalar PF.npMaximum (pf-00)
 *   Every name fusion.py imports from channels exists in the channels port
 *   under the reference's name. is_jpeg_suspect / is_jpeg_lattice /
 *   _spectral_background are imported by fusion.py; only the last is used.
 *
 * Intra-module calls also go through PF.fusion.<name> at call time, as the
 * reference's go through module globals. That is what lets the parity
 * harness record build_evidence / _cached_matrices / _axis_detect /
 * channel_scores on BOTH sides without changing what runs.
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES - each MEASURED in the reference venv (numpy 2.5.3, python
 * 3.12.10), not read off the Python:
 *
 *  round(x, 4) depends on the type of x. refine() rounds three kinds of
 *  value: round(float(s0), 4) and round(s, 4) on Python floats (CPython's
 *  correctly rounded decimal round: PF.pyRound) and round(s0 * m, 4) with
 *  m from np.linspace - an np.float64 whatever s0 is (measured:
 *  type(2.5 * np.float64(1.0)) is numpy.float64, because np.float64
 *  subclasses float and its __rmul__ is tried first), so numpy's
 *  rint(x * 1e4) / 1e4 (fu_npRound4). snaps() rounds extent / c, a Python
 *  float. rescore's memo key is round(float(s), 4): Python. So the step's
 *  numpy-ness never has to travel with it here, unlike channels.py.
 *
 *  round(x) with no digits (snaps, the anti-harmonic ratio, pick_count,
 *  the reconciliation ratio) is half-to-even on a Python float and on an
 *  np.float64 alike (measured round(np.float64(2.5)) == 2): PF.rint.
 *
 *  np.clip(col, 0.0, None) is one-sided, i.e. np.maximum(col, 0.0), which
 *  keeps the RIGHT operand on a tie: np.clip(-0.0, 0.0, None) is +0.0
 *  (measured; PF.clipScalar with a null upper bound does exactly that).
 *  col.max() / mat.max(axis=0) propagate NaN (fu_npMax).
 *
 *  Python's builtin max / min keep the FIRST argument unless the second is
 *  strictly greater / less (fu_pyMax / fu_pyMin); list.sort(key=...) and
 *  sorted(key=...) are stable (fu_stableOrder); a strict `>` in a scan
 *  keeps the FIRST best. Python's sum(generator) starts from the int 0.
 *
 *  np.sum(zs) over a list of < 8 floats is numpy's pairwise sum below its
 *  block size - left to right from 0.0 (PF.sum).
 *
 *  Sets of floats: refine() builds a set, but only iterates it through
 *  sorted() (value order) and through list(cands) for a union, whose result
 *  does not depend on the order. So no CPython hash-order model is needed.
 *
 * ---------------------------------------------------------------------------
 * MEASURED PARITY (tools/parity-fusion.py -> tools/test-fusion.cjs,
 * numpy 2.5.3 / cv2 5.0.0, 2026-09-27; the test is the authority, this is
 * the shape of its last run). 24 images - the 3 fixtures, the 4 examples,
 * 17 constructed ones - each in two modes, "full" (fusion.detect) and "lean"
 * (core's build_evidence(lean=True) + channel_matrix(only=ACTIVE) +
 * fused_curve), ONE (image, mode) PER PROCESS on both sides:
 *   R  replay: the reference's quantized image and spectra replayed,
 *      numpy's own cos/sin/atan2/log10/pow outputs injected through
 *      PF.channels._libm: BIT-EXACT, 5948 comparisons over 1165377 values
 *      (evidence, both 11-channel matrices incl. vc, fused curves, every
 *      _axis_detect result, every rescore key and value in call order,
 *      every _lattice_refine and _exclusive_slot_occupancy call, detect's
 *      return), 0 table misses in 12994401 phasor lookups.
 *   E  production, JS from the rgba bytes (real medianBlur + k-means as the
 *      process's first, PF.rfft, Math.*): the quantized image, profiles,
 *      bands, pooled profiles, tiles and every DECISION - each axis step,
 *      each rescore key, cols/rows, step_x/step_y, candidate order - EXACT
 *      on 48/48; 5852 comparisons over 1165329 values. What differs is only
 *      what passes through a C-runtime transcendental or the FFT, measured:
 *      spectra max rel 1.6e-13, channel values max |diff| 4.0e-14 (max rel
 *      3.5e-11, on a value near zero), fused curves max |diff| 2.9e-15, axis
 *      scores max |diff| 1.8e-15. The vc column (pf-23, not behind
 *      C._libm) is exact in both suites.
 *   Every arbitration branch is taken by at least one process (the test
 *   prints which): jpeg notch, fundamental /2 and /3, anti-harmonic climb,
 *   square test and adoption, cell-count arbitration incl. a moved count,
 *   one-axis and both-axes None. 11 of the 17 constructed images exist
 *   because a search found that none of the others reaches those branches
 *   (before them, _exclusive_slot_occupancy was never called at all, so its
 *   trace comparisons passed on empty lists).
 *   25/25 one-literal mutants of this file turn it red (MUTANTS in the
 *   test, each against an unmutated baseline that is green); 9 of the 25
 *   are red ONLY on those 11 branch-targeted images.
 *   core.detect(mode="full") runs build_evidence in a ThreadPoolExecutor
 *   worker after the cheap detectors; on the 2 test images that reach its
 *   stage 2 (syn-blk3, frog) that k-means' quantized image is byte-identical
 *   to a fresh process's first call - so the lean parity above is core's
 *   stage-2 input. Measured on those 2, not argued in general.
 *
 * DATA: an image is {d: Uint8Array, w, h, cn: 4}; 1-D profiles and curves
 * are Float64Array; a channel matrix is {d: Float64Array(n * 11), w: 11,
 * h: n}, row i = steps[i], columns in CHANNELS order; bands are {d, w, h}
 * as band_profiles returns them (row b = band b). Python tuples are JS
 * arrays, None is null. The evidence object keeps the reference's keys.
 *
 * No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var F = PF.fusion || (PF.fusion = {});

  function check(cond, msg) { if (!cond) throw new Error('PF.fusion: ' + msg); }

  // A PF.channels name, resolved at call time (pf-30 / pf-31 load after this file).
  function ch(name) {
    var C = PF.channels, f = C && C[name];
    if (typeof f !== 'function') {
      throw new Error('PF.fusion needs PF.channels.' + name +
        ' - load pf-30-channels-a.js and pf-31-channels-b.js');
    }
    return f;
  }
  function need(name) {
    if (typeof PF[name] !== 'function') throw new Error('PF.fusion needs PF.' + name + ' - load pf-00..pf-11 first');
    return PF[name];
  }

  // Optional branch recorder for tools/test-fusion.cjs (coverage of the
  // arbitration branches); null in production.
  F._hook = null;
  function note(tag) { if (F._hook !== null) F._hook(tag); }

  // ---------------------------------------------------------------- helpers
  function fu_pyMax(a, b) { return (b > a) ? b : a; }
  function fu_pyMin(a, b) { return (b < a) ? b : a; }
  // round(np.float64, 4): numpy's rint(x * 10**4) / 10**4
  function fu_npRound4(x) { return PF.rint(x * 10000.0) / 10000.0; }
  // ndarray.max() of a float64 vector: NaN propagates
  function fu_npMax(a, off, n, stride) {
    var m = a[off], i, v;
    for (i = 1; i < n; i++) {
      v = a[off + i * stride];
      if (v !== v) return v;
      if (v > m) m = v;
    }
    return m;
  }
  // indices of `keys` in the order a stable ascending sort visits them
  function fu_stableOrder(keys) {
    var idx = [], i;
    for (i = 0; i < keys.length; i++) idx.push(i);
    idx.sort(function (a, b) {
      if (keys[a] < keys[b]) return -1;
      if (keys[b] < keys[a]) return 1;
      return a - b;
    });
    return idx;
  }
  F._helpers = { fu_pyMax: fu_pyMax, fu_pyMin: fu_pyMin, fu_npRound4: fu_npRound4, fu_stableOrder: fu_stableOrder };

  // ---------------------------------------------------------------- constants
  var CHANNELS = ['comb_e1', 'comb_e2', 'ray_e1', 'ray_e2',
    'band_e1', 'band_e2', 'tile_e1', 'tile_e2',
    'spec_e1', 'spec_e2', 'vc'];
  F.CHANNELS = CHANNELS;

  /* Fusion rule (from --analyze + fuse_search on the channel table):
   * equal-weight sum of per-scan max-normalized {ray_e1, tile_e1, tile_e2,
   * spec_e1}. This "core4" reaches 36/40 scan-argmax accuracy on knowns vs 32
   * for the best single channel (tile_e1); oracle over all channels is 37.
   * Adding comb, band, ray_e2, spec_e2, vc or reliability floors never helped
   * (ray_e2 pulls half-steps on clean sprites, floors cost 1-2 scans).
   *   - reference comment, fusion.py:345-350 */
  var WEIGHTS = {};
  CHANNELS.forEach(function (c) { WEIGHTS[c] = 0.0; });
  WEIGHTS.ray_e1 = 1.0; WEIGHTS.tile_e1 = 1.0; WEIGHTS.tile_e2 = 1.0; WEIGHTS.spec_e1 = 1.0;
  F.WEIGHTS = WEIGHTS;

  /* Rescoring refined steps additionally uses the per-band Stouffer channels:
   * the fused core4 ranks the right PEAK but is too blunt to pick the exact
   * rational step under warp/mush (tile phases are local, spectral bins are
   * coarse); the band combs collapse hard when the step is 1-2% off, which is
   * exactly the sub-peak discrimination refinement needs.
   *   - reference comment, fusion.py:355-359 */
  var RESCORE_WEIGHTS = {};
  CHANNELS.forEach(function (c) { RESCORE_WEIGHTS[c] = WEIGHTS[c]; });
  RESCORE_WEIGHTS.band_e1 = 1.0; RESCORE_WEIGHTS.band_e2 = 1.0;
  F.RESCORE_WEIGHTS = RESCORE_WEIGHTS;
  // [c for c in CHANNELS if WEIGHTS.get(c, 0.0) > 0.0] - computed from
  // WEIGHTS before band_* joins RESCORE_WEIGHTS, as the reference orders it
  F.ACTIVE_CHANNELS = CHANNELS.filter(function (c) { return WEIGHTS[c] > 0.0; });

  // ---------------------------------------------------------------- ladder
  /* Geometric step ladder: lo, lo*ratio, ... while <= hi (+1e-9), each
   * rounded to 4 decimals the CPython way (the accumulator is a Python
   * float). Default: 2.0 .. 64.0 by 3%. Returns a plain array (a list). */
  F.ladder = function ladder(lo, hi, ratio) {
    if (lo === undefined || lo === null) lo = 2.0;
    if (hi === undefined || hi === null) hi = 64.0;
    if (ratio === undefined || ratio === null) ratio = 1.03;
    var steps = [], s = lo;
    while (s <= hi + 1e-9) {
      steps.push(need('pyRound')(s, 4));
      s *= ratio;
    }
    return steps;
  };

  // ---------------------------------------------------------------- evidence
  /* Construct channel inputs the way fit_grid does (read-only reuse).
   *
   * lean=True builds only what the ACTIVE (weighted) channels read:
   * profiles, tiles and E1 spectra - skipping the duplicate square-packer
   * curve, comb pooled profiles and band stacks roughly halves the cost.
   *   - reference docstring
   *
   * REACHES KMEANS (see the header). */
  F.build_evidence = function build_evidence(rgba, lean) {
    lean = !!lean;
    check(rgba && typeof rgba === 'object' && rgba.d, 'build_evidence: expected a {d, w, h, cn} image');
    var h = rgba.h, w = rgba.w;
    // try: base = cv2.medianBlur(np.ascontiguousarray(rgba), 3)
    // except Exception: base = rgba
    // A MISSING PF.medianBlur is a port that is not loaded, not the
    // reference's cv2 ImportError; that throws instead of falling back.
    var medianBlur = need('medianBlur'), base;
    try { base = medianBlur(rgba, 3); } catch (e) { base = rgba; }
    var quantized = need('kmeans_quantize')(base, 16).quantized;

    var prof_q = ch('axis_profiles')(quantized);   // E1 source
    var prof_o = ch('axis_profiles')(rgba);        // E2 source
    var prof = { e1x: prof_q.e1x, e1y: prof_q.e1y, e2x: prof_o.e2x, e2y: prof_o.e2y };

    var jls = ch('_jpeg_lattice_strength');
    var jpeg_z = fu_pyMax(jls(prof.e1x), jls(prof.e1y));
    var notch = ch('_notch_jpeg'), keys = ['e1x', 'e1y', 'e2x', 'e2y'], k, i;
    if (jpeg_z > 5.0) {
      note('jpeg_notch');
      for (k = 0; k < keys.length; k++) prof[keys[k]] = notch(prof[keys[k]]);
    }

    var n_bands_y = lean ? 0 : (h >= 200 ? 4 : (h >= 96 ? 2 : 0));
    var n_bands_x = lean ? 0 : (w >= 200 ? 4 : (w >= 96 ? 2 : 0));
    var bp = n_bands_y || n_bands_x ? ch('band_profiles') : null;
    var bx1 = n_bands_y ? bp(quantized, n_bands_y, 0, 'cut') : null;
    var bx2 = n_bands_y ? bp(rgba, n_bands_y, 0, 'knot') : null;
    var by1 = n_bands_x ? bp(quantized, n_bands_x, 1, 'cut') : null;
    var by2 = n_bands_x ? bp(rgba, n_bands_x, 1, 'knot') : null;
    if (jpeg_z > 5.0) {
      var all = [bx1, bx2, by1, by2];
      for (k = 0; k < all.length; k++) {
        var bands = all[k];
        if (bands === null) continue;
        for (i = 0; i < bands.h; i++) {
          // bands[i] = _notch_jpeg(bands[i]): a row assignment, in place
          var row = bands.d.subarray(i * bands.w, (i + 1) * bands.w);
          var r = notch(row);
          if (r !== row) bands.d.set(r, i * bands.w);
        }
      }
    }

    var gm = ch('_grad_maps')(rgba, quantized);

    function spec(dmap, axis) {
      var fp = ch('_axis_spectrum')([dmap], axis);
      return [fp[0], fp[1], ch('_spectral_background')(fp[1])];
    }

    var vc, vc_z_of, vc_cands;
    if (lean) {
      vc = null;
      vc_z_of = function () { return 0.0; };
      vc_cands = [];
    } else {
      var CVC = PF.varcontrast && PF.varcontrast.CellVarContrast;
      check(typeof CVC === 'function', 'build_evidence needs PF.varcontrast.CellVarContrast - load pf-23-varcontrast.js');
      vc = new CVC(rgba);
      var zc = vc.z_channel();
      vc_z_of = zc[0];
      vc_cands = zc[1];
    }

    var PP = ch('_PooledProfile');
    function rowsOf(b) {
      var out = [], j;
      for (j = 0; j < b.h; j++) out.push(b.d.subarray(j * b.w, (j + 1) * b.w));
      return out;
    }
    function axis_pack(e1, e2, b1, b2, t1, t2, s1, s2, extent) {
      return {
        e1: e1, e2: e2,
        pp1: lean ? null : new PP(e1),
        pp2: lean ? null : new PP(e2),
        bands1: b1, bands2: b2,
        bpp1: b1 !== null ? rowsOf(b1).map(function (b) { return new PP(b); }) : [],
        bpp2: b2 !== null ? rowsOf(b2).map(function (b) { return new PP(b); }) : [],
        tiles1: t1, tiles2: t2,
        spec1: s1, spec2: s2,
        extent: extent
      };
    }

    var tp = ch('_tile_peaks');
    // argument evaluation order as the reference's dict display: x then y,
    // each: tiles E1, tiles E2, spectrum E1, spectrum E2
    return {
      w: w, h: h, jpeg_z: +jpeg_z,
      vc: vc, vc_z_of: vc_z_of, vc_cands: vc_cands,
      x: axis_pack(prof.e1x, prof.e2x, bx1, bx2,
        tp(gm.dqx, 0), tp(gm.cox, 0),
        spec(gm.dqx, 0), spec(gm.cox, 0), w),
      y: axis_pack(prof.e1y, prof.e2y, by1, by2,
        tp(gm.dqy, 1), tp(gm.coy, 1),
        spec(gm.dqy, 1), spec(gm.coy, 1), h)
    };
  };

  /* Stouffer combo of per-band max(comb, rayleigh), as _AxisEvidence.score. */
  F._band_stouffer = function _band_stouffer(bpps, bands, step) {
    if (bands === null || bands === undefined || bpps.length < 2) return 0.0;
    var n = Math.min(bpps.length, bands.h), zs = new Float64Array(n), i;   // zip()
    var comb = ch('_comb_score'), ray = ch('_rayleigh_score');
    for (i = 0; i < n; i++) {
      var cz = comb(bpps[i], step)[0];
      var rz = ray(bands.d.subarray(i * bands.w, (i + 1) * bands.w), step)[0];
      zs[i] = fu_pyMax(cz, rz);
    }
    return need('sum')(zs) / Math.sqrt(n);          // np.sum(zs) / np.sqrt(len(zs))
  };

  /* {channel: score} for one (axis, step), in CHANNELS order; `only`
   * (array or Set) restricts which channels are computed. */
  F.channel_scores = function channel_scores(ev, axis, step, only) {
    var ax = ev[axis];
    var want = (only === undefined || only === null) ? null : (only instanceof Set ? only : new Set(only));
    var fns = {
      comb_e1: function () { return ch('_comb_score')(ax.pp1, step)[0]; },
      comb_e2: function () { return ch('_comb_score')(ax.pp2, step)[0]; },
      ray_e1: function () { return ch('_rayleigh_score')(ax.e1, step)[0]; },
      ray_e2: function () { return ch('_rayleigh_score')(ax.e2, step)[0]; },
      band_e1: function () { return F._band_stouffer(ax.bpp1, ax.bands1, step); },
      band_e2: function () { return F._band_stouffer(ax.bpp2, ax.bands2, step); },
      tile_e1: function () { return ch('_tiles_ray_z')(ax.tiles1, step); },
      tile_e2: function () { return ch('_tiles_ray_z')(ax.tiles2, step); },
      spec_e1: function () { return ch('_spectral_z')(ax.spec1[0], ax.spec1[1], ax.spec1[2], step); },
      spec_e2: function () { return ch('_spectral_z')(ax.spec2[0], ax.spec2[1], ax.spec2[2], step); },
      vc: function () { return ev.vc_z_of(step); }
    };
    var out = {};
    for (var j = 0; j < CHANNELS.length; j++) {
      var c = CHANNELS[j];
      if (want === null || want.has(c)) out[c] = +fns[c]();
    }
    return out;
  };

  /* (n_steps, n_channels) raw channel scores, {d, w: 11, h: n}.
   *
   * `only`: restrict computation to these channels (others stay 0) - the
   * fused curve weights most channels at zero, so skipping them cuts the
   * evidence build several-fold.   - reference docstring */
  F.channel_matrix = function channel_matrix(ev, axis, steps, only) {
    var n = steps.length, nc = CHANNELS.length, d = new Float64Array(n * nc), i, j;
    for (i = 0; i < n; i++) {
      var sc = F.channel_scores(ev, axis, steps[i], only);
      for (j = 0; j < nc; j++) {
        var v = sc[CHANNELS[j]];
        d[i * nc + j] = (v === undefined) ? 0.0 : v;   // sc.get(c, 0.0)
      }
    }
    return { d: d, w: nc, h: n };
  };

  /* Weighted sum of per-scan max-normalized channels. */
  F.fused_curve = function fused_curve(mat) {
    var n = mat.h, nc = mat.w, fused = new Float64Array(n), col = new Float64Array(n), i, j;
    check(nc === CHANNELS.length, 'fused_curve: matrix has ' + nc + ' columns, CHANNELS has ' + CHANNELS.length);
    var clip = need('clipScalar');
    for (j = 0; j < nc; j++) {
      var c = CHANNELS[j];
      if (F.WEIGHTS[c] === 0.0) continue;
      for (i = 0; i < n; i++) col[i] = clip(mat.d[i * nc + j], 0.0, null);   // np.clip(mat[:, j], 0.0, None)
      var m = fu_npMax(col, 0, n, 1);
      if (m <= 1e-9) continue;
      for (i = 0; i < n; i++) fused[i] = fused[i] + F.WEIGHTS[c] * (col[i] / m);
    }
    return fused;
  };

  /* Indices of the positive local maxima (plateaus included), highest first,
   * ties in index order. */
  F._local_maxima = function _local_maxima(steps, curve) {
    var n = steps.length, idx = [], i;
    for (i = 0; i < n; i++) {
      if (curve[i] > 0 &&
          curve[i] >= (i > 0 ? curve[i - 1] : -1e18) &&
          curve[i] >= (i < n - 1 ? curve[i + 1] : -1e18)) idx.push(i);
    }
    var ord = fu_stableOrder(idx.map(function (k) { return -curve[k]; }));
    return ord.map(function (k) { return idx[k]; });
  };

  /* Channel matrices for both axes. The reference caches them on disk by
   * image content (see the header); this computes them. */
  F._cached_matrices = function _cached_matrices(rgba, ev, steps) {
    var mx = F.channel_matrix(ev, 'x', steps);
    var my = F.channel_matrix(ev, 'y', steps);
    return [mx, my];
  };

  // ---------------------------------------------------------------- detection
  /* Pick + refine the step for one axis.
   *
   * Returns {step, score, steps, curve, rescore} - rescore is reused by the
   * cross-axis reconciliation.   - reference docstring
   * steps: Float64Array; mat: {d, w, h} with one row per step. */
  F._axis_detect = function _axis_detect(ev, axis, steps, mat) {
    var ax = ev[axis];
    var extent = ax.extent;
    var curve = F.fused_curve(mat);
    var nc = mat.w, n = mat.h, j, k;

    // channel normalizers for rescoring refined (off-ladder) steps
    var maxes = new Float64Array(nc);
    for (j = 0; j < nc; j++) maxes[j] = need('npMaximum')(fu_npMax(mat.d, j, n, nc), 1e-9);
    var active = [];
    for (j = 0; j < nc; j++) if (F.RESCORE_WEIGHTS[CHANNELS[j]] !== 0.0) active.push([j, CHANNELS[j]]);
    var activeNames = active.map(function (t) { return t[1]; });
    var memo = new Map();
    var pyRound = need('pyRound'), rint = need('rint');

    function rescore(s) {
      var key = pyRound(+s, 4);                       // round(float(s), 4)
      if (memo.has(key)) return memo.get(key);
      var sc = F.channel_scores(ev, axis, key, activeNames);
      var v = 0;                                      // sum(...) starts at int 0
      for (var a = 0; a < active.length; a++) {
        var jj = active[a][0], c = active[a][1];
        v = v + F.RESCORE_WEIGHTS[c] * fu_pyMax(sc[c], 0.0) / maxes[jj];
      }
      memo.set(key, v);
      return v;
    }

    /* Integer cell-count snaps around the count implied by s. */
    function snaps(s, span) {
      var out = [], c0 = extent / s, r0 = rint(c0);   // int(round(c0)): half-even
      for (var dc = -span; dc <= span; dc++) {
        var c = r0 + dc;
        if (c >= 2 && extent / c >= 1.9) out.push(pyRound(extent / c, 4));
      }
      return out;
    }

    /* Refined candidates near s0 -> (best step, fused score).
     *
     * Seeds: iterated lattice LSQ fits on E1/E2 (single fits crawl by
     * ~0.005/iter and stall - see FINDINGS), a fine geometric scan when
     * `full`, and integer-cell-count snaps of every seed. The fused
     * rescore picks; exact rational steps (extent/c) win by a huge margin
     * whenever the grid truly spans the image.   - reference docstring */
    function refine(s0, full) {
      var cands = new Map();
      function add(v) { if (!cands.has(v)) cands.set(v, true); }
      add(pyRound(+s0, 4));
      var profs = [ax.e1, ax.e2], lr = ch('_lattice_refine');
      for (var p = 0; p < profs.length; p++) {
        var s = +s0;
        for (var it = 0; it < 3; it++) {
          var s2 = +lr(profs[p], s);
          if (Math.abs(s2 - s) < 5e-4) break;
          s = s2;
        }
        add(pyRound(s, 4));
      }
      if (full) {
        var ms = need('linspace')(0.955, 1.045, 19);
        for (var mi = 0; mi < ms.length; mi++) add(fu_npRound4(s0 * ms[mi]));   // np.float64: numpy's round
      }
      var snap = Array.from(cands.keys()), sv;
      for (var q = 0; q < snap.length; q++) {
        sv = snaps(snap[q], full ? 3 : 2);
        for (var t = 0; t < sv.length; t++) add(sv[t]);
      }
      var best = [+s0, -1e18];
      var sorted = Array.from(cands.keys()).sort(function (a, b) { return a - b; });
      for (var u = 0; u < sorted.length; u++) {
        var sc = sorted[u];
        if (sc < 1.9 || sc > extent / 3) continue;
        var v = rescore(sc);
        if (v > best[1]) best = [sc, v];
      }
      return best;
    }

    /* Occupancy of s_small's lattice slots not shared with s_big. */
    function excl_occ(s_small, s_big) {
      var ph = ch('_rayleigh_score')(ax.e1, s_small)[1];
      return ch('_exclusive_slot_occupancy')(ax.e1, s_small, ph, s_big);
    }

    var peaks = F._local_maxima(steps, curve);
    if (!peaks.length) {
      note('axis_no_peaks');
      return { step: null, score: 0.0, steps: steps, curve: curve, rescore: rescore };
    }
    var best_val = curve[peaks[0]];

    // candidate pool: strong fused local maxima, refined (top-2 get the
    // full fine scan, the rest a light refine)
    var pool = [], top = peaks.slice(0, 6);
    for (var rank = 0; rank < top.length; rank++) {
      var i = top[rank];
      if (curve[i] < 0.45 * best_val) { note('pool_cut_045'); break; }
      pool.push(refine(steps[i], rank < 2));
    }
    var pord = fu_stableOrder(pool.map(function (t) { return -t[1]; }));
    pool = pord.map(function (o) { return pool[o]; });
    var step = pool[0][0], score = pool[0][1];

    // fundamental check: an integer divisor that keeps most of the fused
    // score AND populates its own exclusive lattice slots is the real cell
    // size (content repeats at multiples of the pixel size)
    var improved = true, divs = [2, 3, 4];
    while (improved) {
      improved = false;
      for (k = 0; k < divs.length; k++) {
        var div = divs[k];
        var sub = step / div;
        if (sub < 1.9) continue;
        var rs = refine(sub, false), s_sub = rs[0], sc_sub = rs[1];
        if (sc_sub >= 0.88 * score && Math.abs(s_sub * div - step) < 0.6 * div &&
            excl_occ(s_sub, step) >= 0.30) {
          note('fundamental_div' + div);
          step = s_sub; score = sc_sub;
          improved = true;
          break;
        }
      }
    }

    // anti-harmonic: if the winner is an integer subdivision of a decent
    // pool mate but owns no exclusive edge energy, it is a spurious
    // subdivision (blur-scale periodicity, jpeg 8/3 lattice, ...) - climb up
    for (k = 0; k < pool.length; k++) {
      var s_big = pool[k][0], sc_big = pool[k][1];
      var ratio = s_big / step;
      var kk = rint(ratio);                           // int(round(ratio))
      if (2 <= kk && kk <= 5 && Math.abs(ratio - kk) < 0.08 * kk &&
          sc_big >= 0.60 * score && excl_occ(step, s_big) < 0.30) {
        note('anti_harmonic');
        var rb = refine(s_big, true);
        step = rb[0]; score = rb[1];
        break;
      }
    }

    return { step: step, score: score, steps: steps, curve: curve, rescore: rescore };
  };

  /* fusion.detect: per-axis arbitration on the fused channels, square-pixel
   * reconciliation, cell-count arbitration. REACHES KMEANS (build_evidence).
   * -> {step_x, step_y, cols, rows, phase_x, phase_y, candidates} */
  F.detect = function detect(rgba) {
    var h = rgba.h, w = rgba.w, i;
    var ev = F.build_evidence(rgba);
    var all_steps = Float64Array.from(F.ladder());
    var mm = F._cached_matrices(rgba, ev, all_steps);

    var results = {};
    var axes = [['x', w, mm[0]], ['y', h, mm[1]]];
    for (var a = 0; a < axes.length; a++) {
      var axis = axes[a][0], extent = axes[a][1], mat = axes[a][2];
      var max_step = fu_pyMin(fu_pyMax(4.0, extent / 8.0), 64.0);
      var keep = [];
      for (i = 0; i < all_steps.length; i++) if (all_steps[i] <= max_step) keep.push(i);   // mask
      var st = new Float64Array(keep.length), md = new Float64Array(keep.length * mat.w);
      for (i = 0; i < keep.length; i++) {
        st[i] = all_steps[keep[i]];
        md.set(mat.d.subarray(keep[i] * mat.w, (keep[i] + 1) * mat.w), i * mat.w);
      }
      results[axis] = F._axis_detect(ev, axis, st, { d: md, w: mat.w, h: keep.length });
    }

    var rx = results.x, ry = results.y;
    var step_x = rx.step, score_x = rx.score;
    var step_y = ry.step, score_y = ry.score;

    if (step_x === null && step_y === null) {
      note('both_none');
      step_x = step_y = fu_pyMax(1.0, Math.max(w, h) / 128.0);
      score_x = score_y = 0.0;
    } else if (step_x === null) {
      note('x_none');
      step_x = step_y; score_x = score_y;
    } else if (step_y === null) {
      note('y_none');
      step_y = step_x; score_y = score_x;
    }

    // square-pixel reconciliation: when the axes disagree by a non-integer
    // ratio, test each axis's step on the other axis with the fused rescore
    // and adopt the square pair only if it clearly beats keeping both
    var rint = need('rint');
    var ratio = fu_pyMax(step_x, step_y) / fu_pyMin(step_x, step_y);
    var near_int = Math.abs(ratio - rint(ratio)) < 0.10 && rint(ratio) >= 2;
    if (ratio > 1.02 && !near_int) {
      note('square_test');
      var keepSc = score_x + score_y;
      var best = [null, keepSc * 1.05];
      var both = [step_x, step_y];
      for (i = 0; i < both.length; i++) {
        var s = both[i];
        var tot = rx.rescore(s) + ry.rescore(s);
        if (tot > best[1]) best = [s, tot];
      }
      if (best[0] !== null) {
        note('square_adopted');
        step_x = step_y = best[0];
      }
    }

    // cell-count arbitration: when extent/step sits near a half cell the
    // rounded count is a coin flip; let the fused rescore compare the exact
    // rationals for both counts instead (grid.py solves this inside the DP
    // with an integer-step prior; here the channels themselves decide)
    function pick_count(res, extent, step) {
      var c0 = extent / step;
      var frac = Math.abs(c0 - rint(c0));
      if (frac < 0.2 || res.step === null) return [rint(c0), step];
      note('pick_count');
      var lo = Math.floor(c0), hi = Math.ceil(c0);
      var bestc = [rint(c0), step, -1e18], cs = [lo, hi];
      for (var q = 0; q < cs.length; q++) {
        var c = cs[q];
        if (c < 1) continue;
        var sq = extent / c;
        var v = res.rescore(sq);
        if (v > bestc[2]) bestc = [c, sq, v];
      }
      if (bestc[0] !== rint(c0)) note('pick_count_moved');
      return [bestc[0], bestc[1]];
    }

    var pcx = pick_count(rx, w, step_x);
    var cols = pcx[0]; step_x = pcx[1];
    var pcy = pick_count(ry, h, step_y);
    var rows = pcy[0]; step_y = pcy[1];

    // sorted(zip(rx["steps"], rx["curve"]), key=lambda t: -t[1])[:8]
    var negc = [];
    for (i = 0; i < rx.steps.length; i++) negc.push(-rx.curve[i]);
    var ord = fu_stableOrder(negc).slice(0, 8);
    var cands = ord.map(function (o) { return [+rx.steps[o], +rx.curve[o]]; });
    return {
      step_x: +step_x, step_y: +step_y,
      cols: cols, rows: rows,
      phase_x: 0.0, phase_y: 0.0,
      candidates: cands
    };
  };

  PF.versionFusion = 'pf-24-fusion/1';
})();
