/* pf-31-channels-b.js -- port of pixelfixer/channels.py, SECOND HALF:
 * lines 817..1631, from _evidence_refine_step to the end of the file.
 * The first half (lines 1..816: profiles, _PooledProfile, the comb /
 * Rayleigh / tile / spectral channels and _AxisEvidence) is ported by
 * pf-30-channels-a.js; this file reads those names at CALL time, so the
 * two halves can be written and loaded independently.
 *
 *   _evidence_refine_step  estimate_period_ev  estimate_axis_ev
 *   _chain_energy_z        _exclusive_slot_occupancy   estimate_axis
 *   lattice_dp   _axis_chain   chain_to_cuts             (cut placement)
 *   band_profiles   refine_positions_per_band           (warp refinement)
 *   GridFit  _rasterise_cuts  _index_map_from_cuts  _knot_cuts_per_band
 *   fit_grid   render_grid_overlay
 *
 * WHERE THE REFERENCE REACHES THIS CODE (grepped, commit ef376e5):
 *   core.detect(mode="full") reaches NONE of it. core builds its evidence
 *   with fusion.build_evidence(lean=True), which sets n_bands to 0 and so
 *   never calls band_profiles, and core never calls fusion.detect or
 *   fit_grid. The other callers are:
 *     fusion.build_evidence(lean=False)   band_profiles
 *     fusion._axis_detect (fusion.detect) _exclusive_slot_occupancy
 *     fit_grid                            the library entry of channels.py
 *   fit_grid(quantized=None) DOES reach k-means (kmeans_quantize ->
 *   cv2.kmeans on OpenCV's process-global, never-seeded RNG), so its
 *   parity is measured one image per process on both sides. Nothing else
 *   in this file touches an RNG.
 *
 * DEPENDENCIES, looked up by name when called (PF.channels.<name> first,
 * then PF.<name>), so a missing one throws naming the file to load:
 *   pf-30-channels-a.js  _normalise  _flatten_channels  axis_profiles
 *                        _comb_score  _tiles_ray_z  estimate_period
 *                        is_jpeg_suspect  is_jpeg_lattice
 *                        _jpeg_lattice_strength  _notch_jpeg  _grad_maps
 *                        _tile_peaks  _axis_spectrum  _AxisEvidence
 *                        (an instance's .profile .pp_global .tiles
 *                         .score(s) .refine(s) .candidate_steps(lo, hi))
 *   pf-23-varcontrast.js CellVarContrast (.z_channel() .contrast(s, sy, n)
 *                        .best_pair(pairs, n)), fit_grid only
 *   pf-00 / pf-02 / pf-03 / pf-11 (loaded before this file): PF.rint
 *     PF.pyRound PF.mean PF.std PF.percentile PF.linspace PF.interp
 *     PF.searchsorted PF.sumAxes PF.maximum_accumulate PF.clipScalar
 *     PF.argmax PF.gaussian_filter1d PF.find_peaks PF.medianBlur
 *     PF.kmeans_quantize PF._scipyInternals.argsortNumpy
 *   Tuples come back as JS arrays in the reference's order, None as null.
 *
 * DATA: 1-D profiles are Float64Array. 2-D arrays are {d, w, h}, flat and
 * row-major, h = numpy's shape[0]: band_profiles -> {d: Float64Array,
 * w: m, h: n_bands}; xcuts {d: Float32Array, w: H, h: cols+1}; ycuts
 * {w: W, h: rows+1}; col_index / row_index {d: Int32Array, w: W, h: H}.
 * Images are {d: Uint8Array, w, h, cn}. Chains are Int32Array.
 *
 * WHAT HAD TO BE MEASURED, not read off the Python:
 *
 *  1. round(x, 4) / round(x, 3) depend on the TYPE of x. On a Python float
 *     it is CPython's correctly rounded decimal round (PF.pyRound); on a
 *     numpy.float64 it is numpy's rint(x * 10**n) / 10**n. MEASURED in the
 *     reference venv: round(np.float64(2.675), 2) == 2.68, round(2.675, 2)
 *     == 2.67. estimate_period_ev seeds _evidence_refine_step with BOTH
 *     kinds: ev.candidate_steps() returns Python floats, while
 *     `s0 = steps[idx]` indexes an np.array and is a numpy.float64 - and
 *     step / div keeps whichever kind it had. So every step here carries
 *     its kind as a trailing tuple element (1 = numpy.float64): the
 *     reference's (step, score, phase) is [step, score, phase, isNp].
 *     MEASURED, and narrower than it sounds: on the steps fit_grid can
 *     produce the two kinds NEVER disagree. A numpy-kind step is a coarse
 *     multiple of 0.5 or its division by 2..5, and those never sit near a
 *     decimal tie; the kind only reaches round() on such values. A mutant
 *     that rounds every step the Python way survives all 42 fixture cases.
 *     The kind is still carried, because the reference carries it, and
 *     roundNd's numpy branch is checked directly on 6255 values (394 where
 *     the kinds disagree, e.g. half of a 4-decimal step).
 *
 *  2. _evidence_refine_step iterates a Python SET of two floats, and a
 *     tie in score keeps the first one iterated. Set order is the hash
 *     table's slot order: hash(float) is x mod 2^61-1 (a 61-bit rotation
 *     of the mantissa, pyFloatHashBits below) and CPython 3.12's
 *     set_add_entry probes slot hash & 7, then (5i + 1 + perturb) & 7.
 *     numpy.float64 hashes like the equal Python float, and the set keeps
 *     the FIRST of two equal keys (so its kind).
 *
 *  3. np.argsort(-coarse) in estimate_period_ev is numpy's DEFAULT
 *     (unstable) kind; on this machine that is x86-simd-sort's AVX2
 *     float64 argsort, which pf-02-scipy.js emulates lane by lane
 *     (PF._scipyInternals.argsortNumpy) and measured 1155/1155 on
 *     tie-heavy input. Ties here are not hypothetical: _spectral_z is
 *     piecewise constant in the step (nearest spectrum bin), so two
 *     coarse steps can score EXACTLY alike on small images.
 *
 *  4. band_profiles runs in float32 (_flatten_channels is float32):
 *     every difference, square, the channel sum (sequential from 0, < 8
 *     terms) and the sqrt are rounded to float32; the band sum over rows
 *     (axis 0) is a SEQUENTIAL float32 accumulation and over columns
 *     (axis 1) a per-row float32 pairwise sum - the measured memory-order
 *     model of PF.sumAxes, which is what this calls. The result is
 *     widened into a float64 array, as the reference's np.zeros() is.
 *
 *  5. np.log(2D + 1) in _chain_energy_z is the C runtime's log, and V8's
 *     Math.log differs from it in the last bit on 7 of the first 399 odd
 *     integers (measured). The values for D = 1..128 are baked below
 *     from the reference venv; beyond that PF.log is used and may differ
 *     in the last bit. _chain_energy_z has no caller in the reference.
 *
 *  6. _index_map_from_cuts searches cut columns that are non-decreasing
 *     by construction (np.maximum.accumulate, then 0 first and extent
 *     last, and every cut lies in [0, extent]), and for a sorted array
 *     numpy's incremental binsearch and PF.searchsorted return the same
 *     index. On an UNSORTED column they could differ; none reaches it.
 *
 * MEASURED PARITY (tools/parity-channels-b.py -> tools/test-channels-b.cjs,
 * numpy 2.5.3 / scipy 1.18.1 / cv2 5.0.0, 2026-09-27). The test is the
 * authority; this is the shape of its last run, 44 cases x 4 fit_grid
 * calls each, every value compared on its bits:
 *   replay       this half alone, pf-30 / pf-23 answers replayed from the
 *                reference: EXACT on every function and every GridFit
 *                field, and every question the reference asked of the
 *                first half was asked, none extra.
 *   integration  with the real pf-30 + pf-23: every step, cut, index map
 *                and cell index EXACT; 40 reported scores differ by 1-2 ulp
 *                and each is traced to a pf-30 ev.score answer carrying
 *                those bits (its documented C-runtime last-bit gap).
 *   e2e          fit_grid(rgba), real k-means, one case per process: the
 *                same, on the 29 non-transformed cases.
 *   99888 checks, 0 failed, 330702712 values. 39/42 one-literal mutants
 *   turn it red; the 3 that survive are argued or measured unobservable
 *   (see MUTANTS in the test). The 4 examples, 3 fixtures and 22 branch-
 *   targeted images are real call-path inputs; 15 "xf_" cases pass the
 *   first half's answers through a fixed transform to reach arbitration
 *   branches no image reached (traced) and are replay-only.
 *
 * EXPORTS: PF.channels.<name> only - the same object pf-30 fills, so a
 * consumer (fusion needs band_profiles and _exclusive_slot_occupancy)
 * reaches both halves one way. Deliberately NOT aliased flat on PF: pf-30
 * is not either, and PF.band_profiles would be ambiguous with
 * PF.autocorr.band_profiles and silently replaceable by a later module.
 *
 * No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var C = PF.channels || (PF.channels = {});
  var fr = Math.fround;
  function def(name, fn) {
    C[name] = fn;
  }

  // A name from pf-30-channels-a.js (or another leaf module), looked up when
  // it is called: the half that defines it may load in any order relative to
  // this file's definitions, and a test can install a replay in its place.
  function dep(name) {
    var f = C[name];
    if (f === undefined || f === null) f = PF[name];
    if (f === undefined || f === null) {
      throw new Error('pf-31-channels-b: needs PF.channels.' + name +
        ' (channels.py first half) - load pf-30-channels-a.js first');
    }
    return f;
  }

  function depVC() {
    var f = (PF.varcontrast && PF.varcontrast.CellVarContrast) || PF.CellVarContrast;
    if (!f) {
      throw new Error('pf-31-channels-b: fit_grid needs CellVarContrast ' +
        '(varcontrast.py) - load pf-23-varcontrast.js first');
    }
    return f;
  }

  function need(name) {
    if (typeof PF[name] !== 'function') {
      throw new Error('pf-31-channels-b: PF.' + name + ' is missing - load pf-00..pf-11 first');
    }
    return PF[name];
  }

  var rint = function (x) { return need('rint')(x); };

  // Python's max(a, b) / min(a, b) on two floats: the FIRST argument is
  // kept unless the second compares strictly greater (less).
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }

  // round(x, nd) on a numpy.float64 (np.around: multiply, rint, divide by
  // an exact power of ten) or on a Python float (CPython's double_round).
  // See header note 1. Values must be finite.
  var P10 = [1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
  function roundNd(x, nd, isNp) {
    if (isNp) return rint(x * P10[nd]) / P10[nd];
    return PF.pyRound(x, nd);
  }

  /* ---------------------------------------------------------------- *
   * Python set iteration order for a few floats (header note 2).
   * ---------------------------------------------------------------- */
  var HDV = new DataView(new ArrayBuffer(8));

  /* hash(v) for a finite float, as the 64 bits (LSB first) of the
   * Py_uhash_t that set_add_entry masks. CPython's _Py_HashDouble
   * computes |v| mod P, P = 2^61 - 1, with the sign applied after; with
   * |v| = M * 2^E (M the 53-bit integer mantissa) and 2^61 == 1 (mod P)
   * that is M rotated left by (E mod 61) inside 61 bits - M < 2^53 can
   * never rotate to all-ones (== P). tools/test-channels-b.cjs checks this
   * against Python's own hash() on 4000 floats, including the steps
   * _evidence_refine_step actually saw. */
  function pyFloatHashBits(v) {
    var out = new Uint8Array(64), i;
    if (v === 0) return out;
    if (!isFinite(v)) throw new Error('pf-31-channels-b: hash of a non-finite float is not modelled');
    HDV.setFloat64(0, Math.abs(v));
    var hi = HDV.getUint32(0), lo = HDV.getUint32(4);
    var ex = (hi >>> 20) & 0x7ff, E;
    var m = new Uint8Array(61);
    for (i = 0; i < 32; i++) m[i] = (lo >>> i) & 1;
    for (i = 0; i < 20; i++) m[32 + i] = (hi >>> i) & 1;
    if (ex === 0) E = -1074;
    else { m[52] = 1; E = ex - 1075; }
    var r = ((E % 61) + 61) % 61;
    var x = new Uint8Array(61);
    for (i = 0; i < 61; i++) x[(i + r) % 61] = m[i];
    if (v > 0) {
      for (i = 0; i < 61; i++) out[i] = x[i];
      return out;
    }
    // x * (size_t)-1: two's complement in 64 bits; (size_t)-1 becomes -2
    var carry = 1, allOnes = true;
    for (i = 0; i < 64; i++) {
      var b = (i < 61 ? x[i] : 0) ^ 1;
      var s = b + carry;
      out[i] = s & 1;
      carry = s >> 1;
      if (!out[i]) allOnes = false;
    }
    if (allOnes) out[0] = 0;
    return out;
  }

  /* Indices of `keys` in the order `for k in {keys[0], keys[1], ...}`
   * yields them (duplicates dropped, first one kept). CPython 3.12
   * set_add_entry on the 8-slot table: probes = 0 because i + 9 > mask,
   * so a collision perturbs at once. Up to 4 keys (a 5th would resize). */
  function pySetOrder(keys) {
    if (keys.length > 4) throw new Error('pf-31-channels-b: pySetOrder models the 8-slot table only');
    var slots = [null, null, null, null, null, null, null, null];
    for (var ki = 0; ki < keys.length; ki++) {
      var hb = pyFloatHashBits(keys[ki]);
      var i = hb[0] | (hb[1] << 1) | (hb[2] << 2), shift = 0;
      for (;;) {
        var e = slots[i];
        if (e === null) { slots[i] = { k: ki, hb: hb }; break; }
        var same = true;
        for (var q = 0; q < 64; q++) if (e.hb[q] !== hb[q]) { same = false; break; }
        if (same && keys[e.k] === keys[ki]) break;          // already present: keep the first
        shift += 5;                                           // perturb >>= PERTURB_SHIFT
        var p = 0;
        for (var t = 0; t < 3; t++) if (shift + t < 64) p |= hb[shift + t] << t;
        i = (i * 5 + 1 + p) & 7;
      }
    }
    var order = [];
    for (var j = 0; j < 8; j++) if (slots[j] !== null) order.push(slots[j].k);
    return order;
  }
  C._pyFloatHashBits = pyFloatHashBits;   // exposed for tools/test-channels-b.cjs
  C._pySetOrder = pySetOrder;
  C._roundNd = roundNd;

  // Python's list.sort(key=...) is stable; so is this (index tiebreak),
  // whatever the engine's Array.prototype.sort does.
  function stableSortBy(arr, key) {
    var dec = arr.map(function (r, i) { return { r: r, i: i, k: key(r) }; });
    dec.sort(function (a, b) {
      if (a.k < b.k) return -1;
      if (a.k > b.k) return 1;
      return a.i - b.i;
    });
    return dec.map(function (x) { return x.r; });
  }

  function gatherMean(norm, idx) {
    var g = new Float64Array(idx.length);
    for (var i = 0; i < idx.length; i++) g[i] = norm[idx[i]];
    return PF.mean(g);
  }

  /* ================================================================ *
   * period estimation on _AxisEvidence
   * ================================================================ */

  /* _evidence_refine_step(ev, step) -> [step, score, phase, isNp]:
   * try seed and lattice refinement, keep better.
   * `stepIsNp`: the seed is a numpy.float64 (header note 1).
   *
   * OWNERSHIP OVERLAP: channels.py:817-825 was assigned to BOTH halves
   * (this file was given "from the first function boundary at or after
   * line 800", pf-30-channels-a.js ported "down to the end of
   * _evidence_refine_step"). Both implementations take and return the same
   * shapes. So this one is registered as PF.channels._evidence_refine_step
   * ONLY IF pf-30 did not already define it - it never replaces the other
   * half's function - and it stays reachable as _b_evidence_refine_step so
   * tools/test-channels-b.cjs can check both against the reference. The
   * callers below go through PF.channels._evidence_refine_step, as the
   * reference's late-bound module global does. */
  function _b_evidence_refine_step(ev, step, stepIsNp) {
    stepIsNp = !!stepIsNp;
    // candidates = {round(step, 4), round(ev.refine(step), 4)}; ev.refine
    // returns float(np.median(fits)), a Python float
    var keys = [roundNd(step, 4, stepIsNp), PF.pyRound(ev.refine(step), 4)];
    var kinds = [stepIsNp, false];
    var order = pySetOrder(keys);
    var best = [step, -1e18, 0.0, stepIsNp];
    for (var oi = 0; oi < order.length; oi++) {
      var s = keys[order[oi]];
      var r = ev.score(s);
      if (r[0] > best[1]) best = [s, r[0], r[1], kinds[order[oi]]];
    }
    return best;
  }
  C._b_evidence_refine_step = _b_evidence_refine_step;
  if (typeof C._evidence_refine_step !== 'function') def('_evidence_refine_step', _b_evidence_refine_step);

  // np.log(2*D + 1) for D = 1..128, from the reference venv (header note 5)
  var NPLOG_2D1 = [
    1.0986122886681098, 1.6094379124341003, 1.9459101490553132, 2.1972245773362196,
    2.3978952727983707, 2.5649493574615367, 2.70805020110221, 2.833213344056216,
    2.9444389791664403, 3.044522437723423, 3.1354942159291497, 3.2188758248682006,
    3.295836866004329, 3.367295829986474, 3.4339872044851463, 3.4965075614664802,
    3.5553480614894135, 3.6109179126442243, 3.6635616461296463, 3.713572066704308,
    3.7612001156935624, 3.8066624897703196, 3.8501476017100584, 3.8918202981106265,
    3.9318256327243257, 3.970291913552122, 4.007333185232471, 4.04305126783455,
    4.07753744390572, 4.110873864173311, 4.143134726391533, 4.174387269895637,
    4.204692619390966, 4.23410650459726, 4.2626798770413155, 4.290459441148391,
    4.31748811353631, 4.343805421853684, 4.3694478524670215, 4.394449154672439,
    4.418840607796598, 4.442651256490317, 4.465908118654584, 4.48863636973214,
    4.51085950651685, 4.532599493153256, 4.553876891600541, 4.574710978503383,
    4.59511985013459, 4.61512051684126, 4.634728988229636, 4.653960350157523,
    4.672828834461906, 4.6913478822291435, 4.709530201312334, 4.727387818712341,
    4.74493212836325, 4.762173934797756, 4.77912349311153, 4.795790545596741,
    4.812184355372417, 4.8283137373023015, 4.844187086458591, 4.859812404361672,
    4.875197323201151, 4.890349128221754, 4.90527477843843, 4.919980925828125,
    4.9344739331306915, 4.948759890378168, 4.962844630259907, 4.976733742420574,
    4.990432586778736, 5.003946305945459, 5.017279836814924, 5.030437921392435,
    5.043425116919247, 5.056245805348308, 5.0689042022202315, 5.081404364984463,
    5.093750200806762, 5.10594547390058, 5.117993812416755, 5.1298987149230735,
    5.14166355650266, 5.153291594497779, 5.1647859739235145, 5.176149732573829,
    5.187385805840755, 5.198497031265826, 5.209486152841421, 5.220355825078324,
    5.231108616854587, 5.241747015059643, 5.25227342804663, 5.262690188904886,
    5.272999558563747, 5.2832037287379885, 5.293304824724492, 5.303304908059076,
    5.313205979041787, 5.3230099791384085, 5.332718793265369, 5.342334251964811,
    5.351858133476067, 5.3612921657094255, 5.3706380281276624, 5.37989735354046,
    5.389071729816501, 5.3981627015177525, 5.407171771460119, 5.41610040220442,
    5.424950017481403, 5.43372200355424, 5.442417710521793, 5.4510384535657,
    5.459585514144159, 5.4680601411351315, 5.476463551931511, 5.484796933490655,
    5.493061443340548, 5.501258210544727, 5.5093883366279774, 5.517452896464707,
    5.5254529391317835, 5.53338948872752, 5.541263545158426, 5.54907608489522];
  C._NPLOG_2D1 = NPLOG_2D1;

  /* How well a full elastic chain at `step` explains the profile.
   *
   * Runs the lattice DP and z-scores the mean edge energy under the chosen
   * cuts, corrected for the expected max-of-window inflation, so candidates
   * with different window sizes compare fairly. The decisive test under
   * heavy jitter: a true step snaps every cut onto a peak, a wrong step
   * cannot. */
  def('_chain_energy_z', function _chain_energy_z(profile, step, phase) {
    var n = profile.length - 1;
    if (step < 1.5 || step > n / 3) return -1e9;
    var chain = C.lattice_dp(profile, step, phase, Math.max(1, rint(n / step) - 1));
    if (chain.length < 3) return -1e9;
    var norm = PF.gaussian_filter1d(dep('_normalise')(profile), 0.6);
    var interior = norm.subarray(1, norm.length - 1);
    var base_mean = PF.mean(interior);
    var base_std = PF.std(interior) + 1e-9;
    var D = Math.max(1, rint(step * 0.45));
    var lg = (D <= NPLOG_2D1.length) ? NPLOG_2D1[D - 1] : PF.log(2 * D + 1);
    var inflation = Math.sqrt(2.0 * lg);
    var K = chain.length;
    return (gatherMean(norm, chain) - base_mean - base_std * inflation) / (base_std / Math.sqrt(K));
  });

  /* estimate_period_ev(ev, min_step=2.0, max_step=None, harmonic_tol=0.88)
   * Estimate the dominant cell size from an axis's evidence.
   * Returns [step, score, phase, isNp]; step null if nothing periodic. */
  def('estimate_period_ev', function estimate_period_ev(ev, min_step, max_step, harmonic_tol) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    if (harmonic_tol === undefined || harmonic_tol === null) harmonic_tol = 0.88;
    var n = ev.profile.length - 1;
    if (max_step === undefined || max_step === null) max_step = pyMin(pyMax(4.0, n / 8.0), 64.0);

    var steps_list = [], s = min_step, i;
    while (s <= max_step) {
      steps_list.push(s);
      s += (s < 16) ? 0.5 : 1.0;
    }
    if (!steps_list.length) return [null, 0.0, 0.0, false];
    var coarse = new Float64Array(steps_list.length);
    for (i = 0; i < steps_list.length; i++) coarse[i] = ev.score(steps_list[i])[0];
    var steps = Float64Array.from(steps_list);
    var negc = new Float64Array(coarse.length);
    for (i = 0; i < coarse.length; i++) negc[i] = -coarse[i];
    var order = PF._scipyInternals.argsortNumpy(negc);    // np.argsort(-coarse), numpy's default kind

    var refined = [], seen = [];
    function _dedupe_r(s1) { return pyMax(0.16, 0.05 * s1); }
    function isSeen(s0) {
      for (var j = 0; j < seen.length; j++) if (Math.abs(s0 - seen[j]) < _dedupe_r(s0)) return true;
      return false;
    }

    var cands = ev.candidate_steps(min_step, max_step), s0;
    for (i = 0; i < cands.length; i++) {
      s0 = cands[i];
      if (s0 < min_step || s0 > max_step) continue;
      if (isSeen(s0)) continue;
      seen.push(s0);
      refined.push(C._evidence_refine_step(ev, s0, false));   // candidate_steps are Python floats
    }

    for (i = 0; i < Math.min(6, order.length); i++) {
      var idx = order[i];
      if (coarse[idx] <= 0) break;
      s0 = steps[idx];                                          // numpy.float64
      if (isSeen(s0)) continue;
      seen.push(s0);
      refined.push(C._evidence_refine_step(ev, s0, true));
    }

    if (!refined.length) return [null, 0.0, 0.0, false];

    // smoothed noise has quasi-periodic local maxima at the blur scale
    // (2-3 px) that stay coherent within short bands; a genuinely small grid
    // step must also be visible to the *global* comb
    var gated = [];
    for (i = 0; i < refined.length; i++) {
      var r = refined[i];
      if (r[0] < 4.0) {
        var gz = dep('_comb_score')(ev.pp_global, r[0])[0];
        var tz = dep('_tiles_ray_z')(ev.tiles, r[0]);
        if (gz < 1.8 && tz < 3.0) continue;
      }
      gated.push(r);
    }
    refined = gated;
    if (!refined.length) return [null, 0.0, 0.0, false];
    var best_score = refined[0][1], top = refined[0];
    for (i = 1; i < refined.length; i++) {
      if (refined[i][1] > best_score) best_score = refined[i][1];   // max(r[1] for r in refined)
      if (refined[i][1] > top[1]) top = refined[i];                 // max(refined, key=...): first max
    }
    if (best_score <= 0) return [null, 0.0, 0.0, false];

    var good = [];
    for (i = 0; i < refined.length; i++) if (refined[i][1] >= harmonic_tol * best_score) good.push(refined[i]);
    good = stableSortBy(good, function (x) { return x[0]; });
    var step = good[0][0], score = good[0][1], phase = good[0][2], stepNp = good[0][3];
    // structural guard: a smaller near-best step must actually populate the
    // lattice slots the top-scoring step doesn't share
    if (step < top[0] - 0.6) {
      var ratio = top[0] / step;
      if (Math.abs(ratio - rint(ratio)) < 0.15 && rint(ratio) >= 2) {
        var occ = C._exclusive_slot_occupancy(ev.profile, step, phase, top[0]);
        if (occ < 0.30) {
          step = top[0]; score = top[1]; phase = top[2]; stepNp = top[3];
        }
      }
    }

    var improved = true, DIVS = [2, 3, 4, 5];
    while (improved) {
      improved = false;
      for (var di = 0; di < DIVS.length; di++) {
        var div = DIVS[di];
        var sub = step / div;                                    // keeps step's kind
        if (sub < min_step) continue;
        var rs = C._evidence_refine_step(ev, sub, stepNp);
        var s_sub = rs[0], sc_sub = rs[1], ph_sub = rs[2];
        if (s_sub < 4.0 && dep('_comb_score')(ev.pp_global, s_sub)[0] < 1.8 &&
            dep('_tiles_ray_z')(ev.tiles, s_sub) < 3.0) {
          continue;
        }
        if (sc_sub >= pyMax(harmonic_tol * score, 3.0) &&
            Math.abs(s_sub * div - step) < 0.6 * div &&
            C._exclusive_slot_occupancy(ev.profile, s_sub, ph_sub, step) >= 0.30) {
          step = s_sub; score = sc_sub; phase = ph_sub; stepNp = rs[3];
          improved = true;
          break;
        }
      }
    }

    var jpegSuspect = dep('is_jpeg_suspect');
    if (jpegSuspect(step)) {
      var alts = [];
      for (i = 0; i < refined.length; i++) {
        if (!jpegSuspect(refined[i][0]) && refined[i][1] >= 0.55 * score) alts.push(refined[i]);
      }
      if (alts.length) {
        alts = stableSortBy(alts, function (x) { return -x[1]; });
        step = alts[0][0]; score = alts[0][1]; phase = alts[0][2]; stepNp = alts[0][3];
      } else {
        // still on the jpeg family: deflate so the sibling channel /
        // axis with a real grid wins downstream comparisons
        score *= 0.5;
      }
    }

    return [step, score, phase, stepNp];
  });

  /* Pick the better of edge (cut) / curvature (knot) evidence for one axis.
   * -> [step, score, mode, phase, isNp] */
  def('estimate_axis_ev', function estimate_axis_ev(ev1, ev2, min_step) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    var a = C.estimate_period_ev(ev1, min_step);
    var b = C.estimate_period_ev(ev2, min_step);
    if (a[0] === null && b[0] === null) return [null, 0.0, 'cut', 0.0, false];
    if (b[0] === null || (a[0] !== null && a[1] >= b[1])) return [a[0], a[1], 'cut', a[2], a[3]];
    return [b[0], b[1], 'knot', b[2], b[3]];
  });

  /* Occupancy of s_small's lattice slots that do NOT coincide with the
   * s_big lattice. Near zero when s_small is a spurious subdivision. */
  def('_exclusive_slot_occupancy', function _exclusive_slot_occupancy(profile, s_small, phase_small, s_big) {
    var norm = dep('_normalise')(profile);
    var n = norm.length - 1, i, j;
    var pk = PF.find_peaks(norm.subarray(1, norm.length - 1),
      { height: 0.15, distance: Math.max(1, Math.trunc(s_small * 0.4)) }).peaks;
    if (pk.length === 0) return 0.0;
    var p = new Float64Array(pk.length);
    for (i = 0; i < pk.length; i++) p[i] = pk[i] + 1;
    var kmax = Math.trunc(n / s_small), pos = [];
    for (var k = 1; k < kmax; k++) {
      var v = phase_small + k * s_small;
      if (v > 1 && v < n - 1) pos.push(v);
    }
    // exclusive = not within 0.3*s_small of a multiple of s_big
    var excl = [];
    for (i = 0; i < pos.length; i++) {
      var q = pos[i] / s_big;
      var m = Math.abs(q - rint(q)) * s_big;
      if (m > 0.3 * s_small) excl.push(pos[i]);
    }
    if (excl.length < 3) return 1.0;  // nothing to test
    var thr = 0.3 * s_small, hits = 0;
    for (i = 0; i < excl.length; i++) {
      var dmin = Infinity;
      for (j = 0; j < p.length; j++) {
        var dd = Math.abs(excl[i] - p[j]);
        if (dd < dmin) dmin = dd;
      }
      if (dmin < thr) hits++;
    }
    return hits / excl.length;
  });

  /* Pick the better of edge/curvature periodicity for one axis.
   * Returns [step, score, mode, phase] with mode in {"cut", "knot"}. */
  def('estimate_axis', function estimate_axis(e1, e2, min_step) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    var ep = dep('estimate_period');
    var a = ep(e1, min_step), b = ep(e2, min_step);
    if (a[0] === null && b[0] === null) return [null, 0.0, 'cut', 0.0];
    if (b[0] === null || (a[0] !== null && a[1] >= b[1])) return [a[0], a[1], 'cut', a[2]];
    return [b[0], b[1], 'knot', b[2]];
  });

  /* ================================================================ *
   * cut placement
   * ================================================================ */

  /* Fixed-count lattice-anchored elastic dynamic program.
   *
   * The period estimate is sub-pixel accurate, so the number of boundaries is
   * *known*: one per lattice target phase + k*step. Each is allowed to deviate
   * within +-dev_ratio*step to land on real edge energy, paying quadratic
   * penalties on spacing irregularity (stiffness) and on distance from its
   * target (anchor). Fixing the count removes the stretch/squeeze bias a free
   * chain has in flat image regions, and the DP is globally optimal.
   *
   * Returns integer positions of the interior chain elements (cuts or knots).
   * lattice_dp(profile, step, phase, n_targets=None, dev_ratio=0.45,
   *            stiffness=4.0, anchor=0.5, margin=0.35) -> Int32Array */
  def('lattice_dp', function lattice_dp(profile, step, phase, n_targets, dev_ratio, stiffness, anchor, margin) {
    if (dev_ratio === undefined || dev_ratio === null) dev_ratio = 0.45;
    if (stiffness === undefined || stiffness === null) stiffness = 4.0;
    if (anchor === undefined || anchor === null) anchor = 0.5;
    if (margin === undefined || margin === null) margin = 0.35;
    var norm = PF.gaussian_filter1d(dep('_normalise')(profile), 0.6);
    var n = norm.length - 1, i, j, k;
    var D = Math.max(1, rint(step * dev_ratio));

    var lo_t = step * margin, hi_t = n - step * margin;
    var k0 = Math.ceil((lo_t - phase) / step) + 0;     // + 0: int() has no -0
    var k1 = Math.floor((hi_t - phase) / step) + 0;
    if (k1 < k0) return new Int32Array(0);
    var targets = [];
    for (k = k0; k <= k1; k++) targets.push(phase + k * step);

    // the period estimate is accurate, so the boundary count is known;
    // phase noise must not add or drop a cell
    if (n_targets !== undefined && n_targets !== null && n_targets >= 1) {
      while (targets.length > n_targets) {
        if (targets[0] < n - targets[targets.length - 1]) targets.shift();
        else targets.pop();
      }
      while (targets.length < n_targets) {
        var lo_gap = targets[0];
        var hi_gap = n - targets[targets.length - 1];
        if (lo_gap >= hi_gap) targets.unshift(targets[0] - step);
        else targets.push(targets[targets.length - 1] + step);
      }
      for (k = 0; k < targets.length; k++) targets[k] = PF.clipScalar(targets[k], 1.0, n - 1.0);
    }
    var K = targets.length;

    var wins = [];
    for (k = 0; k < K; k++) {
      var c = rint(targets[k]);
      var a = Math.max(1, c - D), b = Math.min(n - 1, c + D);
      var win = new Int32Array(b >= a ? b - a + 1 : 0);
      for (i = 0; i < win.length; i++) win[i] = a + i;
      wins.push(win);
    }

    var NEG = -1e18;
    var prev_score = null, parents = [];
    for (k = 0; k < K; k++) {
      var w = wins[k], L = w.length, t = targets[k];
      var gain = new Float64Array(L);
      for (i = 0; i < L; i++) {
        var z = (w[i] - t) / step;
        gain[i] = norm[w[i]] - anchor * (z * z);
      }
      var score;
      if (k === 0) {
        score = gain;
        parents.push(null);
      } else {
        var pw = wins[k - 1], P = pw.length;
        // np.argmax(trans, axis=1) refuses a zero-length axis
        if (P === 0) throw new Error('attempt to get argmax of an empty sequence');
        var bi = new Int32Array(L);
        score = new Float64Array(L);
        for (i = 0; i < L; i++) {
          var mp = 0, mj = 0;
          for (j = 0; j < P; j++) {
            var d = ((w[i] - pw[j]) - step) / step;
            var tr = (w[i] > pw[j]) ? prev_score[j] - stiffness * (d * d) : NEG;
            if (j === 0 || !(tr <= mp)) { mp = tr; mj = j; }   // first maximum
          }
          bi[i] = mj;
          score[i] = mp + gain[i];
        }
        parents.push(bi);
      }
      prev_score = score;
    }

    var out = new Int32Array(K);
    var jj = PF.argmax(prev_score);
    for (k = K - 1; k >= 0; k--) {
      out[k] = wins[k][jj];
      if (parents[k] !== null) jj = parents[k][jj];
    }
    return out;
  });

  /* DP chain for one axis, resolving ambiguous cell counts.
   *
   * When extent/step falls near a half cell, both candidate counts are tried
   * and the chain whose cuts capture more edge energy wins. */
  def('_axis_chain', function _axis_chain(profile, step, phase, extent, mode) {
    var r = extent / step;
    var base = rint(r) + 0;
    var raw = [base, base - 1, base + 1];
    if (Math.abs(r - base) > 0.15) raw.push(base - 2, base + 2);
    var counts = [], i;
    for (i = 0; i < raw.length; i++) if (raw[i] >= 1 && counts.indexOf(raw[i]) < 0) counts.push(raw[i]);
    counts.sort(function (x, y) { return x - y; });

    var norm = PF.gaussian_filter1d(dep('_normalise')(profile), 0.6);
    var best_chain = null, best_e = -1e18;
    for (i = 0; i < counts.length; i++) {
      var c = counts[i];
      var nt = (mode === 'cut') ? (c - 1) : c;
      var chain, e;
      if (nt < 1) {
        chain = new Int32Array(0);
        e = 0.0;
      } else {
        var s = extent / c;
        chain = C.lattice_dp(profile, s, phase, nt);
        e = chain.length ? gatherMean(norm, chain) : -1e18;
        e -= 0.08 * Math.abs(c - r);   // stay close to the step-implied count
        var q = extent / c;
        var frac_int = Math.abs(q - rint(q));
        e += 0.06 * pyMax(0.0, 1.0 - 4.0 * frac_int);  // integer steps common
        if (chain.length > 3) {
          // true grids have regular spacing even when they drift;
          // wrong counts force irregular squeezes
          var sp = new Float64Array(chain.length - 1);
          for (var j = 0; j < sp.length; j++) sp[j] = chain[j + 1] - chain[j];
          e -= 0.30 * PF.std(sp) / pyMax(PF.mean(sp), 1e-9);
        }
      }
      if (e > best_e) { best_e = e; best_chain = chain; }
    }
    return best_chain !== null ? best_chain : new Int32Array(0);
  });

  /* Interior chain positions -> full cut array [0 .. extent].
   * Integer typed input stays integer (the reference's int64); float input
   * follows numpy's float floor_divide. */
  def('chain_to_cuts', function chain_to_cuts(positions, extent, mode) {
    var isInt = (positions instanceof Int32Array) || (positions instanceof Int16Array) ||
      (positions instanceof Uint8Array) || (positions instanceof Uint16Array) ||
      (positions instanceof Uint32Array) || (positions instanceof Int8Array);
    var cuts = [0], i;
    if (mode === 'knot') {
      if (positions.length < 2) return Int32Array.of(0, extent);
      for (i = 0; i + 1 < positions.length; i++) {
        var sum = positions[i] + positions[i + 1] + 1;
        cuts.push(Math.floor(sum / 2) + 0);
      }
    } else {
      for (i = 0; i < positions.length; i++) cuts.push(positions[i]);
    }
    cuts.push(extent);
    for (i = 0; i < cuts.length; i++) cuts[i] = PF.clipScalar(cuts[i], 0, extent);
    var arr = isInt ? Int32Array.from(cuts) : Float64Array.from(cuts);
    return PF.unique(arr).values;
  });

  /* ================================================================ *
   * warp refinement
   * ================================================================ */

  /* Edge/curvature profiles restricted to bands.
   *
   * axis=0 -> vertical cuts scored within horizontal row-bands: (n_bands, W+1)
   * kind: "cut" uses first differences, "knot" second differences.
   * -> {d: Float64Array, w: m, h: n_bands} (header note 4) */
  def('band_profiles', function band_profiles(rgba, n_bands, axis, kind) {
    var img = dep('_flatten_channels')(rgba);
    var h = img.h, w = img.w, cn = img.cn, X = img.d;
    var cut = (kind === 'cut');
    var dw, dh, m, off = 1, x, y, c, t, acc, p;
    if (axis === 0) {
      dw = cut ? Math.max(0, w - 1) : Math.max(0, w - 2);
      dh = h;
      m = cut ? w + 1 : w;
    } else {
      dw = w;
      dh = cut ? Math.max(0, h - 1) : Math.max(0, h - 2);
      m = cut ? h + 1 : h;
    }
    // d = np.sqrt(((diff) ** 2).sum(axis=2)), float32 throughout
    var d = new Float32Array(dh * dw);
    var sx = (axis === 0) ? cn : w * cn;       // step to the next pixel along the scored axis
    for (y = 0; y < dh; y++) {
      for (x = 0; x < dw; x++) {
        p = (y * w + x) * cn;                  // the pixel at [y, x] of the unshifted image
        acc = 0;
        for (c = 0; c < cn; c++) {
          if (cut) {
            t = fr(X[p + sx + c] - X[p + c]);
          } else {
            t = fr(fr(X[p + 2 * sx + c] - fr(2 * X[p + sx + c])) + X[p + c]);
          }
          acc = fr(acc + fr(t * t));
        }
        d[y * dw + x] = fr(Math.sqrt(acc));
      }
    }
    var ext = (axis === 0) ? h : w;
    var bounds = PF.linspace(0, ext, n_bands + 1);
    var out = new Float64Array(n_bands * m), b, k, seg;
    for (b = 0; b < n_bands; b++) {
      var b0 = Math.trunc(bounds[b]), b1 = Math.trunc(bounds[b + 1]);
      if (axis === 0) {
        // seg = d[b0:b1] (contiguous rows); seg.sum(axis=0)
        var rows = Math.max(0, b1 - b0);
        seg = PF.sumAxes(d.subarray(b0 * dw, (b0 + rows) * dw), [rows, dw], 0).d;
        for (k = 0; k < dw; k++) out[b * m + off + k] = seg[k];
      } else {
        // seg = d[:, b0:b1] (a strided view); seg.sum(axis=1)
        var cols = Math.max(0, b1 - b0);
        var tmp = new Float32Array(dh * cols);
        for (y = 0; y < dh; y++) for (x = 0; x < cols; x++) tmp[y * cols + x] = d[y * dw + b0 + x];
        seg = PF.sumAxes(tmp, [dh, cols], 1).d;
        for (k = 0; k < dh; k++) out[b * m + off + k] = seg[k];
      }
    }
    return { d: out, w: m, h: n_bands };
  });

  /* Let each position drift per band to follow warped boundaries.
   *
   * bands: (B, L) profiles; positions: (K,) global positions.
   * Returns (B, K) float positions.
   * refine_positions_per_band(bands, positions, step, dev_ratio=0.4,
   *                           prior=3.0, smooth=4.0, n_iters=3) */
  def('refine_positions_per_band', function refine_positions_per_band(bands, positions, step, dev_ratio, prior, smooth, n_iters) {
    if (dev_ratio === undefined || dev_ratio === null) dev_ratio = 0.4;
    if (prior === undefined || prior === null) prior = 3.0;
    if (smooth === undefined || smooth === null) smooth = 4.0;
    if (n_iters === undefined || n_iters === null) n_iters = 3;
    var B = bands.h, L = bands.w, K = positions.length, b, k, cc;
    var norm = new Float64Array(B * L);
    for (b = 0; b < B; b++) {
      norm.set(PF.gaussian_filter1d(dep('_normalise')(bands.d.subarray(b * L, (b + 1) * L)), 0.8), b * L);
    }
    var pos = new Float64Array(B * K);
    for (b = 0; b < B; b++) for (k = 0; k < K; k++) pos[b * K + k] = positions[k];
    var dev = Math.max(1, rint(step * dev_ratio));

    for (var it = 0; it < n_iters; it++) {
      for (b = 0; b < B; b++) {
        for (k = 0; k < K; k++) {
          var c = Math.trunc(positions[k]);
          var lo = Math.max(0, c - dev);
          var hi = Math.min(L - 1, c + dev);
          if (hi <= lo) continue;
          var hasN = false, mval = 0;
          if (b > 0 && b < B - 1) { hasN = true; mval = (pos[(b - 1) * K + k] + pos[(b + 1) * K + k]) / 2; }
          else if (b > 0) { hasN = true; mval = pos[(b - 1) * K + k]; }
          else if (b < B - 1) { hasN = true; mval = pos[(b + 1) * K + k]; }
          var mp = 0, mi = 0;
          for (cc = lo; cc <= hi; cc++) {
            var z = (cc - c) / step;
            var sc = norm[b * L + cc] - prior * (z * z);
            if (hasN) {
              var z2 = (cc - mval) / step;
              sc = sc - smooth * (z2 * z2);
            }
            if (cc === lo || !(sc <= mp)) { mp = sc; mi = cc; }   // np.argmax: first maximum
          }
          pos[b * K + k] = mi;
        }
      }
      pos = PF.maximum_accumulate(pos, [B, K], 1);
    }
    return { d: pos, w: K, h: B };
  });

  /* ================================================================ *
   * grid fit
   * ================================================================ */

  /* @dataclass GridFit. xcuts (cols+1, H) float32, ycuts (rows+1, W)
   * float32, col_index / row_index (H, W) int32; cell_index is the
   * reference's property: row_index * cols + col_index in int32. */
  function GridFit(width, height, cols, rows, step_x, step_y, score_x, score_y,
                   mode_x, mode_y, is_periodic, xcuts, ycuts, col_index, row_index) {
    if (!(this instanceof GridFit)) {
      return new GridFit(width, height, cols, rows, step_x, step_y, score_x, score_y,
        mode_x, mode_y, is_periodic, xcuts, ycuts, col_index, row_index);
    }
    this.width = width; this.height = height; this.cols = cols; this.rows = rows;
    this.step_x = step_x; this.step_y = step_y; this.score_x = score_x; this.score_y = score_y;
    this.mode_x = mode_x; this.mode_y = mode_y; this.is_periodic = is_periodic;
    this.xcuts = xcuts; this.ycuts = ycuts; this.col_index = col_index; this.row_index = row_index;
  }
  Object.defineProperty(GridFit.prototype, 'cell_index', {
    get: function () {
      var r = this.row_index.d, c = this.col_index.d, n = r.length, out = new Int32Array(n);
      for (var i = 0; i < n; i++) out[i] = (Math.imul(r[i], this.cols) + c[i]) | 0;
      return { d: out, w: this.row_index.w, h: this.row_index.h };
    }
  });
  def('GridFit', GridFit);

  /* (n_bands, n_cuts) control points -> (n_cuts, length) scanline positions. */
  def('_rasterise_cuts', function _rasterise_cuts(band_pos, extent, length) {
    var nb = band_pos.h, nc = band_pos.w, k, y, i;
    var out = new Float32Array(nc * length);
    if (nb === 1) {
      for (k = 0; k < nc; k++) {
        var v = fr(band_pos.d[k]);
        for (y = 0; y < length; y++) out[k * length + y] = v;
      }
    } else {
      var edges = PF.linspace(0, length, nb + 1);
      var centers = new Float64Array(nb);
      for (i = 0; i < nb; i++) centers[i] = (edges[i] + edges[i + 1]) / 2.0;
      var ys = new Float64Array(length);
      for (y = 0; y < length; y++) ys[y] = y;
      var fp = new Float64Array(nb);
      for (k = 0; k < nc; k++) {
        for (i = 0; i < nb; i++) fp[i] = band_pos.d[i * nc + k];
        var iv = PF.interp(ys, centers, fp);
        for (y = 0; y < length; y++) out[k * length + y] = iv[y];   // float64 -> float32
      }
    }
    out = PF.maximum_accumulate(out, [nc, length], 0);
    if (nc < 1) throw new Error('index 0 is out of bounds for axis 0 with size 0');
    for (y = 0; y < length; y++) out[y] = 0.0;
    for (y = 0; y < length; y++) out[(nc - 1) * length + y] = extent;
    return { d: out, w: length, h: nc };
  });

  /* (n_cuts, L) cut positions -> (L, extent) int32 cell indices. */
  def('_index_map_from_cuts', function _index_map_from_cuts(cuts_per_line, extent) {
    var nc = cuts_per_line.h, L = cuts_per_line.w, i, k, x;
    var coords = new Float32Array(extent);
    for (x = 0; x < extent; x++) coords[x] = x + 0.5;
    var out = new Int32Array(L * extent);
    var col = new Float32Array(nc);
    for (i = 0; i < L; i++) {
      for (k = 0; k < nc; k++) col[k] = cuts_per_line.d[k * L + i];
      var idx = PF.searchsorted(col, coords, 'right');
      for (x = 0; x < extent; x++) out[i * extent + x] = PF.clipScalar(idx[x] - 1, 0, nc - 2);
    }
    return { d: out, w: extent, h: L };
  });

  /* (B, K) knot positions -> (B, K+1) cut positions (midpoints + borders). */
  def('_knot_cuts_per_band', function _knot_cuts_per_band(band_knots, extent) {
    var B = band_knots.h, K = band_knots.w, b, j, W = K + 1;
    var cuts = new Float64Array(B * W);
    for (b = 0; b < B; b++) cuts[b * W] = 0.0;
    for (b = 0; b < B; b++) cuts[b * W + W - 1] = extent;
    if (K > 1) {
      for (b = 0; b < B; b++) {
        for (j = 0; j < K - 1; j++) {
          cuts[b * W + 1 + j] = (band_knots.d[b * K + j] + band_knots.d[b * K + j + 1]) / 2.0 + 0.5;
        }
      }
    }
    return { d: cuts, w: W, h: B };
  });

  // np.concatenate([zeros((B,1)), band_chain, full((B,1), extent)], axis=1)
  function cutBandCuts(band_chain, extent) {
    var B = band_chain.h, K = band_chain.w, W = K + 2, out = new Float64Array(B * W);
    for (var b = 0; b < B; b++) {
      out[b * W] = 0;
      for (var k = 0; k < K; k++) out[b * W + 1 + k] = band_chain.d[b * K + k];
      out[b * W + W - 1] = extent;
    }
    return { d: out, w: W, h: B };
  }

  /* fit_grid(rgba, target_cells=None, force_step=None, allow_warp=True,
   *          min_score=2.2, max_output=512, quantized=None,
   *          quantize_colors=16) -> GridFit
   * Also callable as fit_grid(rgba, {force_step: ..., quantized: ...}) for
   * the reference's keyword spelling.
   *
   * Fit a pixel grid to an image. rgba: uint8 (H, W, 3|4).
   *
   * Edge (E1) profiles are computed on a color-quantized copy - like
   * pixel-snapper, this turns anti-aliased ramps into hard steps at the true
   * boundaries. Curvature (E2) profiles use the original image, whose
   * interpolation knots sit at cell centres. */
  def('fit_grid', function fit_grid(rgba, target_cells, force_step, allow_warp, min_score,
                                    max_output, quantized, quantize_colors) {
    if (target_cells !== null && typeof target_cells === 'object') {
      var o = target_cells;
      target_cells = o.target_cells; force_step = o.force_step; allow_warp = o.allow_warp;
      min_score = o.min_score; max_output = o.max_output; quantized = o.quantized;
      quantize_colors = o.quantize_colors;
    }
    if (allow_warp === undefined || allow_warp === null) allow_warp = true;
    if (min_score === undefined || min_score === null) min_score = 2.2;
    if (max_output === undefined || max_output === null) max_output = 512;
    if (quantize_colors === undefined || quantize_colors === null) quantize_colors = 16;
    var h = rgba.h, w = rgba.w;

    if (quantized === undefined || quantized === null) {
      // median denoise before quantizing: kills jpeg/gaussian noise while
      // keeping the step edges the profiles depend on
      //
      // The reference wraps this in try/except and falls back to the raw
      // image; that branch exists for a missing cv2 (or a dtype cv2 refuses,
      // and the contract here is uint8). It is deliberately NOT ported as a
      // catch: MEASURED, cv2.medianBlur(k=3) accepts a 5-channel uint8 image
      // while PF.medianBlur refuses cn > 4, so catching the shim's refusal
      // would quietly skip a filter the reference applies. Unsupported input
      // throws instead.
      var base = PF.medianBlur(rgba, 3);
      quantized = need('kmeans_quantize')(base, quantize_colors).quantized;
    }

    var axis_profiles = dep('axis_profiles');
    var prof_q = axis_profiles(quantized);   // E1 source
    var prof_o = axis_profiles(rgba);        // E2 source
    var prof = { e1x: prof_q.e1x, e1y: prof_q.e1y, e2x: prof_o.e2x, e2y: prof_o.e2y };

    var mode_x = 'cut', mode_y = 'cut', phase_x = 0.0, phase_y = 0.0;
    var step_x, step_y, score_x, score_y, sxNp = false, syNp = false, r, i;
    if (force_step !== undefined && force_step !== null) {
      step_x = step_y = +force_step;
      score_x = score_y = Infinity;
    } else {
      // jpeg contamination: if the phase-0 8px block lattice is present,
      // notch it out of every profile before any scoring (a true 4/8 px art
      // grid survives via the lattice slots jpeg doesn't own)
      var jls = dep('_jpeg_lattice_strength');
      var jpeg_z = pyMax(jls(prof.e1x), jls(prof.e1y));
      var notch = dep('_notch_jpeg');
      var KEYS = ['e1x', 'e1y', 'e2x', 'e2y'];
      if (jpeg_z > 5.0) {
        for (i = 0; i < KEYS.length; i++) prof[KEYS[i]] = notch(prof[KEYS[i]]);
      }

      // multi-band evidence: warped images stay phase-coherent within a
      // band even when global coherence is gone
      var n_bands_est_y = h >= 200 ? 4 : (h >= 96 ? 2 : 0);
      var n_bands_est_x = w >= 200 ? 4 : (w >= 96 ? 2 : 0);
      var bx1 = n_bands_est_y ? C.band_profiles(quantized, n_bands_est_y, 0, 'cut') : null;
      var bx2 = n_bands_est_y ? C.band_profiles(rgba, n_bands_est_y, 0, 'knot') : null;
      var by1 = n_bands_est_x ? C.band_profiles(quantized, n_bands_est_x, 1, 'cut') : null;
      var by2 = n_bands_est_x ? C.band_profiles(rgba, n_bands_est_x, 1, 'knot') : null;
      if (jpeg_z > 5.0) {
        var all = [bx1, bx2, by1, by2];
        for (var bi = 0; bi < all.length; bi++) {
          var bands = all[bi];
          if (bands === null) continue;
          for (var br = 0; br < bands.h; br++) {
            var row = bands.d.subarray(br * bands.w, (br + 1) * bands.w);
            row.set(notch(row));
          }
        }
      }

      // square-packer channel: within-cell variance contrast (see
      // varcontrast.py) - carries mushy/lumpy art where edges fail
      var VC = depVC();
      var vc = new VC(rgba);
      var zc = vc.z_channel();
      var vc_cands = zc[1];
      var vc_steps = [];
      for (i = 0; i < vc_cands.length; i++) vc_steps.push(vc_cands[i][0]);

      var gm = dep('_grad_maps')(rgba, quantized);
      var tile_peaks = dep('_tile_peaks'), axis_spectrum = dep('_axis_spectrum');
      var tiles_x1 = tile_peaks(gm.dqx, 0);
      var tiles_x2 = tile_peaks(gm.cox, 0);
      var tiles_y1 = tile_peaks(gm.dqy, 1);
      var tiles_y2 = tile_peaks(gm.coy, 1);

      var spec_x1 = axis_spectrum([gm.dqx], 0);
      var spec_x2 = axis_spectrum([gm.cox], 0);
      var spec_y1 = axis_spectrum([gm.dqy], 1);
      var spec_y2 = axis_spectrum([gm.coy], 1);

      // vc feeds candidates only: its square assumption must not poison
      // per-axis scoring of genuinely non-square grids
      var AE = dep('_AxisEvidence');
      var ev_x1 = new AE(prof.e1x, bx1, tiles_x1, spec_x1, null, vc_steps);
      var ev_x2 = new AE(prof.e2x, bx2, tiles_x2, spec_x2, null, vc_steps);
      var ev_y1 = new AE(prof.e1y, by1, tiles_y1, spec_y1, null, vc_steps);
      var ev_y2 = new AE(prof.e2y, by2, tiles_y2, spec_y2, null, vc_steps);

      r = C.estimate_axis_ev(ev_x1, ev_x2);
      step_x = r[0]; score_x = r[1]; mode_x = r[2]; phase_x = r[3]; sxNp = r[4];
      r = C.estimate_axis_ev(ev_y1, ev_y2);
      step_y = r[0]; score_y = r[1]; mode_y = r[2]; phase_y = r[3]; syNp = r[4];

      if (step_x !== null && score_x < min_score) step_x = null;
      if (step_y !== null && score_y < min_score) step_y = null;

      var ev, sc, ph;
      // borrow the sibling axis when one fails, but re-derive the phase on
      // this axis's own profile
      if (step_x === null && step_y !== null) {
        step_x = step_y; mode_x = mode_y; sxNp = syNp;
        score_x = score_y;
        ev = mode_x === 'cut' ? ev_x1 : ev_x2;
        phase_x = ev.score(step_x)[1];
      } else if (step_y === null && step_x !== null) {
        step_y = step_x; mode_y = mode_x; syNp = sxNp;
        score_y = score_x;
        ev = mode_y === 'cut' ? ev_y1 : ev_y2;
        phase_y = ev.score(step_y)[1];
      }

      // harmonic reconciliation across axes: if one axis locked onto ~2x or
      // ~3x the other's step, test the smaller step on the larger axis
      if (step_x !== null && step_y !== null) {
        var PAIRS = [[0, 1], [1, 0]];
        for (var pi = 0; pi < 2; pi++) {
          var a = PAIRS[pi][0], b = PAIRS[pi][1];
          var st = [step_x, step_y], stNp = [sxNp, syNp];
          var s_small = st[a], s_large = st[b];
          if (s_large > s_small * 1.5) {
            var mult = s_large / s_small;
            var rm = rint(mult);
            if (Math.abs(mult - rm) < 0.12 * mult && (rm === 2 || rm === 3)) {
              if (b === 0) ev = mode_x === 'cut' ? ev_x1 : ev_x2;
              else ev = mode_y === 'cut' ? ev_y1 : ev_y2;
              r = ev.score(s_small); sc = r[0]; ph = r[1];
              if (sc >= 0.55 * [score_x, score_y][b]) {
                if (b === 0) { step_x = s_small; phase_x = ph; sxNp = stNp[a]; }
                else { step_y = s_small; phase_y = ph; syNp = stNp[a]; }
              }
            }
          }
        }
      }

      var ratio, s, sNp, evs, best, m;
      var MODES = ['cut', 'knot'];
      // square-pixel prior (mild disagreement): adopt the stronger axis's
      // step on the weaker axis when it holds up there
      if (step_x !== null && step_y !== null) {
        ratio = pyMax(step_x, step_y) / pyMin(step_x, step_y);
        if (1.04 < ratio && ratio <= 1.35) {
          if (score_x >= score_y) { s = step_x; sNp = sxNp; evs = [ev_y1, ev_y2]; }
          else { s = step_y; sNp = syNp; evs = [ev_x1, ev_x2]; }
          best = [-1e18, 0.0, 'cut'];
          for (m = 0; m < 2; m++) {
            r = evs[m].score(s);
            if (r[0] > best[0]) best = [r[0], r[1], MODES[m]];
          }
          if (score_x >= score_y && best[0] >= 0.45 * score_y) {
            step_y = s; score_y = best[0]; phase_y = best[1]; mode_y = best[2]; syNp = sNp;
          } else if (score_y > score_x && best[0] >= 0.45 * score_x) {
            step_x = s; score_x = best[0]; phase_x = best[1]; mode_x = best[2]; sxNp = sNp;
          }
        }
      }

      // square-pixel prior: pixels are almost always square, so when the
      // axes wildly disagree (and are not integer multiples), test each
      // axis's step on the other and keep the consistent pair
      if (step_x !== null && step_y !== null) {
        ratio = pyMax(step_x, step_y) / pyMin(step_x, step_y);
        var near_int = Math.abs(ratio - rint(ratio)) < 0.12 * ratio;
        if (ratio > 1.35 && !near_int) {
          var _best_on = function (evs2, s2) {
            var out = [-1e18, 0.0, 'cut'];
            for (var mm = 0; mm < 2; mm++) {
              var rr = evs2[mm].score(s2);
              if (rr[0] > out[0]) out = [rr[0], rr[1], MODES[mm]];
            }
            return out;
          };
          var x_on_y = _best_on([ev_y1, ev_y2], step_x);
          var y_on_x = _best_on([ev_x1, ev_x2], step_y);
          var keep = score_x + score_y;
          var use_x = score_x + x_on_y[0];
          var use_y = score_y + y_on_x[0];
          var bestv = pyMax(pyMax(keep, use_x), use_y);
          if (bestv === use_x && use_x > keep * 1.1) {
            step_y = step_x; syNp = sxNp;
            score_y = x_on_y[0]; phase_y = x_on_y[1]; mode_y = x_on_y[2];
          } else if (bestv === use_y && use_y > keep * 1.1) {
            step_x = step_y; sxNp = syNp;
            score_x = y_on_x[0]; phase_x = y_on_x[1]; mode_x = y_on_x[2];
          }
        }
      }

      // cross-axis jpeg arbitration: if exactly one axis sits on the jpeg
      // block lattice, try the other axis's step on it
      if (step_x !== null && step_y !== null) {
        var jl = dep('is_jpeg_lattice');
        var jx = !!jl(step_x, phase_x);
        var jy = !!jl(step_y, phase_y);
        if (jx !== jy) {
          var own_score, s_alt, s_altNp;
          if (jx) { evs = [ev_x1, ev_x2]; own_score = score_x; s_alt = step_y; s_altNp = syNp; }
          else { evs = [ev_y1, ev_y2]; own_score = score_y; s_alt = step_x; s_altNp = sxNp; }
          best = [null, -1e18, 0.0, 'cut'];
          for (m = 0; m < 2; m++) {
            r = evs[m].score(s_alt);
            if (r[0] > best[1]) best = [s_alt, r[0], r[1], MODES[m]];
          }
          if (best[1] >= 0.45 * own_score) {
            if (jx) {
              step_x = best[0]; score_x = best[1]; phase_x = best[2]; mode_x = best[3];
              sxNp = best[0] === null ? false : s_altNp;
            } else {
              step_y = best[0]; score_y = best[1]; phase_y = best[2]; mode_y = best[3];
              syNp = best[0] === null ? false : s_altNp;
            }
          }
        }
      }

      // square-packer fallback: when profile channels see nothing but the
      // cell-variance channel has a confident square candidate, take it
      var vc_best = vc_cands.length ? vc_cands[0] : null;
      if (vc_best !== null && vc_best[1] >= 5.0) {
        if (step_x === null || score_x < min_score) {
          if (step_y === null || score_y < min_score) {
            step_x = step_y = vc_best[0]; sxNp = syNp = false;
            score_x = score_y = vc_best[1];
            r = vc.contrast(vc_best[0], undefined, 12);
            phase_x = r[1]; phase_y = r[2];
            mode_x = mode_y = 'cut';
          }
        }
      }

      // pair arbitration: the 2D cell-variance contrast picks between the
      // per-axis winners, square vc candidates, and swaps
      if (step_x !== null && step_y !== null) {
        var rx = roundNd(step_x, 3, sxNp), ry = roundNd(step_y, 3, syNp);
        var pairs = [];
        var addPair = function (p0, p1) {
          for (var q = 0; q < pairs.length; q++) if (pairs[q][0] === p0 && pairs[q][1] === p1) return;
          pairs.push([p0, p1]);
        };
        addPair(rx, ry);
        addPair(rx, rx);
        addPair(ry, ry);
        var axis_weak = pyMax(score_x, score_y) < 6.0;
        for (i = 0; i < Math.min(2, vc_cands.length); i++) {
          var sv = vc_cands[i][0], zv = vc_cands[i][1];
          if (zv >= (axis_weak ? 3.0 : 6.0)) {
            var rv = PF.pyRound(sv, 3);
            addPair(rv, rv);
          }
        }
        if (pairs.length > 1) {
          pairs.sort(function (p, q) { return (p[0] - q[0]) || (p[1] - q[1]); });   // sorted(set of tuples)
          var ranked = vc.best_pair(pairs);
          // tiny steps only when the profile channels saw nothing
          if (!axis_weak) {
            ranked = ranked.filter(function (q) {
              return pyMin(q[0], q[1]) >= 3.0 || (q[0] === rx && q[1] === ry);
            });
          }
          var bx_ = ranked[0][0], by_ = ranked[0][1], bq = ranked[0][2];
          var cur_q;
          for (i = 0; i < ranked.length; i++) {
            if (ranked[i][0] === rx && ranked[i][1] === ry) { cur_q = ranked[i][2]; break; }
          }
          if (cur_q === undefined) throw new Error('StopIteration');   // next() on an exhausted generator
          // switch only on clear dominance to avoid churn on noise
          if (bq > pyMax(cur_q * 2.0, cur_q + 0.05) && bq > 0.05) {
            if (Math.abs(bx_ - step_x) > 1e-6) {
              ev = mode_x === 'cut' ? ev_x1 : ev_x2;
              r = ev.score(bx_);
              step_x = bx_; phase_x = r[1]; sxNp = false;
              score_x = pyMax(r[0], score_x * 0.8);
            }
            if (Math.abs(by_ - step_y) > 1e-6) {
              ev = mode_y === 'cut' ? ev_y1 : ev_y2;
              r = ev.score(by_);
              step_y = by_; phase_y = r[1]; syNp = false;
              score_y = pyMax(r[0], score_y * 0.8);
            }
          }
        }
      }
    }

    var is_periodic = (step_x !== null && step_x !== undefined);

    if (!is_periodic) {
      var target = target_cells || 128;
      var step0 = pyMax(1.0, pyMax(w, h) / target);
      step_x = step_y = step0;
      phase_x = phase_y = 0.0;
    }

    var xcuts, ycuts, col_index, row_index, x, y, k;
    if (step_x <= 1.05 && step_y <= 1.05) {
      xcuts = { d: new Float32Array((w + 1) * h), w: h, h: w + 1 };
      for (k = 0; k <= w; k++) for (y = 0; y < h; y++) xcuts.d[k * h + y] = k;
      ycuts = { d: new Float32Array((h + 1) * w), w: w, h: h + 1 };
      for (k = 0; k <= h; k++) for (x = 0; x < w; x++) ycuts.d[k * w + x] = k;
      col_index = { d: new Int32Array(w * h), w: w, h: h };
      row_index = { d: new Int32Array(w * h), w: w, h: h };
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { col_index.d[y * w + x] = x; row_index.d[y * w + x] = y; }
      return new GridFit(w, h, w, h, 1.0, 1.0, score_x, score_y, mode_x, mode_y, is_periodic,
        xcuts, ycuts, col_index, row_index);
    }

    step_x = pyMax(step_x, w / max_output);
    step_y = pyMax(step_y, h / max_output);

    // global chains on the mode-appropriate profiles
    var px = mode_x === 'cut' ? prof.e1x : prof.e2x;
    var py = mode_y === 'cut' ? prof.e1y : prof.e2y;

    var col_chain = C._axis_chain(px, step_x, phase_x, w, mode_x);
    var row_chain = C._axis_chain(py, step_y, phase_y, h, mode_y);

    var n_bands_y = (allow_warp && is_periodic) ? Math.trunc(PF.clipScalar(h / (step_y * 8), 1, 12)) : 1;
    var n_bands_x = (allow_warp && is_periodic) ? Math.trunc(PF.clipScalar(w / (step_x * 8), 1, 12)) : 1;

    var bp, band_chain, band_cuts;
    // columns (vertical cuts)
    if (n_bands_y > 1 && col_chain.length) {
      bp = C.band_profiles(mode_x === 'cut' ? quantized : rgba, n_bands_y, 0, mode_x);
      band_chain = C.refine_positions_per_band(bp, col_chain, step_x);
    } else {
      band_chain = { d: Float64Array.from(col_chain), w: col_chain.length, h: 1 };
    }
    band_cuts = mode_x === 'cut' ? cutBandCuts(band_chain, w) : C._knot_cuts_per_band(band_chain, w);
    xcuts = C._rasterise_cuts(band_cuts, w, h);

    // rows (horizontal cuts)
    if (n_bands_x > 1 && row_chain.length) {
      bp = C.band_profiles(mode_y === 'cut' ? quantized : rgba, n_bands_x, 1, mode_y);
      band_chain = C.refine_positions_per_band(bp, row_chain, step_y);
    } else {
      band_chain = { d: Float64Array.from(row_chain), w: row_chain.length, h: 1 };
    }
    band_cuts = mode_y === 'cut' ? cutBandCuts(band_chain, h) : C._knot_cuts_per_band(band_chain, h);
    ycuts = C._rasterise_cuts(band_cuts, h, w);

    col_index = C._index_map_from_cuts(xcuts, w);            // (H, W)
    var rT = C._index_map_from_cuts(ycuts, h);               // (W, H), transposed below
    row_index = { d: new Int32Array(w * h), w: w, h: h };
    for (x = 0; x < w; x++) for (y = 0; y < h; y++) row_index.d[y * w + x] = rT.d[x * h + y];

    var cols = xcuts.h - 1;
    var rows = ycuts.h - 1;

    return new GridFit(w, h, cols, rows, +step_x, +step_y, +score_x, +score_y, mode_x, mode_y,
      is_periodic, xcuts, ycuts, col_index, row_index);
  });

  /* ================================================================ *
   * overlay
   * ================================================================ */

  /* Draw the fitted cut polylines onto a copy of the image.
   * render_grid_overlay(rgba, grid, color=(255, 40, 220), alpha=0.85)
   * -> {d: Uint8Array, w, h, cn: 4} (alpha 255). float32 arithmetic:
   * (1 - alpha) and alpha are Python floats next to float32 arrays, so
   * NEP 50 casts them to float32 first. */
  def('render_grid_overlay', function render_grid_overlay(rgba, grid, color, alpha) {
    if (color === undefined || color === null) color = [255, 40, 220];
    if (alpha === undefined || alpha === null) alpha = 0.85;
    var h = rgba.h, w = rgba.w, cn = rgba.cn === undefined ? 4 : rgba.cn, i, c, k, x, y;
    var out = new Float32Array(h * w * 3);
    for (i = 0; i < h * w; i++) for (c = 0; c < 3; c++) out[i * 3 + c] = rgba.d[i * cn + c];
    var col = [fr(color[0]), fr(color[1]), fr(color[2])];
    var A = fr(1 - alpha), Al = fr(alpha);
    var ac = [fr(Al * col[0]), fr(Al * col[1]), fr(Al * col[2])];
    var p;
    for (k = 0; k < grid.xcuts.h; k++) {
      for (y = 0; y < h; y++) {
        x = PF.clipScalar(rint(grid.xcuts.d[k * grid.xcuts.w + y]), 0, w - 1);
        p = (y * w + x) * 3;
        for (c = 0; c < 3; c++) out[p + c] = fr(fr(A * out[p + c]) + ac[c]);
      }
    }
    for (k = 0; k < grid.ycuts.h; k++) {
      for (x = 0; x < w; x++) {
        y = PF.clipScalar(rint(grid.ycuts.d[k * grid.ycuts.w + x]), 0, h - 1);
        p = (y * w + x) * 3;
        for (c = 0; c < 3; c++) out[p + c] = fr(fr(A * out[p + c]) + ac[c]);
      }
    }
    var res = new Uint8Array(h * w * 4);
    for (i = 0; i < h * w; i++) {
      for (c = 0; c < 3; c++) res[i * 4 + c] = Math.trunc(PF.clipScalar(out[i * 3 + c], 0, 255));
      res[i * 4 + 3] = 255;
    }
    return { d: res, w: w, h: h, cn: 4 };
  });

  PF.versionChannelsB = 'pf-31-channels-b/1';
})();
