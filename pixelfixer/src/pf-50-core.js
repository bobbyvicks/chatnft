/* pf-50-core.js - port of pixelfixer/core.py: the consensus-first ensemble
 * that fronts the detector stack.
 *
 * SCOPE: all of core.detect - mode "fast" and mode "full" (the serial
 * rebuild of `shared`, the cheap 3-way fast path, stage 1 consensus over
 * ac / rl / ss / fu, and stage 2 arbitration). Measured by
 * tools/test-detect.cjs + tools/test-core.cjs (fast) and
 * tools/test-core-full.cjs against tools/parity-core-full.py (full).
 *
 * Reference docstring, kept verbatim because it records WHY the ensemble
 * is shaped this way:
 *
 *   autocorr (banded ACF, 17/26), runlengths (boundary combs, 17/26),
 *   fusion (sum-fused channels, 17/26), selfsim (shift dissimilarity, 16/26)
 *   fail on different images; oracle union 18 exact / 26 near.
 *
 *   Stage 1 - consensus: if >=2 proposals agree on the output size (within
 *   max(1 cell, 1%)), adopt it (autocorr steps preferred for precision,
 *   median counts of the agreeing proposals).
 *
 *   Stage 2 - arbitration (real disagreement): per-axis candidate pool from
 *   all four + autocorr's ranked list, scored by
 *       normalized fused evidence + 0.2 * square-packer z
 *       + 0.25 * (#sources agreeing - 1) ,
 *   with the smallest-qualified-peak rule (>= 0.78 of best score) that three
 *   agents independently converged on for harmonic hygiene. Aspect guard,
 *   ACF peak-train refinement, drift-aware counting.
 *
 * DEPENDENCY CONTRACT. core.py imports its modules (autocorr as A,
 * runlengths as m_rl, fusion as m_fu, selfsim as m_ss; varcontrast and
 * reconsearch inside detect). This port resolves them AT CALL TIME on the
 * PF global, under the reference's module names, so load order does not
 * matter and a later-loaded port is picked up without touching this file:
 *
 *   PF.autocorr    { to_gray, median_quant, d1_along, d2_along,
 *                    axis_estimate, detect(rgba, pre),
 *                    refine_step_acf, local_count }        (full: the last two)
 *   PF.runlengths  { detect(rgba) }
 *   PF.selfsim     { detect(rgba) }
 *   PF.fusion      { build_evidence, ladder, channel_matrix, fused_curve,
 *                    ACTIVE_CHANNELS }                       (full only)
 *   PF.varcontrast { CellVarContrast(rgba).z_channel(),
 *                    vc_log (see np.log below) }             (full only)
 *   PF.reconsearch { _prep, AxisData, _s_grid, _coarse_curves, _trend_fn,
 *                    _score }                                (full only)
 *   PF.RNG / PF.theRNG                                       (full only)
 *
 * Each detect returns a plain object with at least step_x, step_y, cols,
 * rows (runlengths also score_x / score_y, except on its no-lattice
 * fallback where those keys are ABSENT - core reads them with a default of
 * 0.0, which is what makes that fallback refuse the early exit). The
 * feature maps handed to axis_estimate / detect(pre) / local_count are
 * arrays of [featureMap, weight] pairs mirroring the reference's list of
 * tuples; core does not look inside them.
 *
 * A MISSING module throws at entry (a port that is not loaded is an
 * instrument failure and must not read as "that detector failed on this
 * image"). A LOADED detector that throws is swallowed exactly as the
 * reference's `except Exception: pass` swallows it, but the message is kept
 * on the result under `_errors` (a key the reference never emits) so the
 * swallow is visible; pass {strict: true} to rethrow instead. Stage 2 has
 * no such swallow in the reference, and none here: its errors propagate.
 *
 * Image representation: {d: Uint8Array(w*h*4), w, h, cn: 4} RGBA
 * interleaved; `rgba.shape[:2]` is (h, w). The shape is checked at ENTRY
 * so a malformed image fails loudly here instead of failing inside each
 * detector and being swallowed.
 *
 * THREADS AND THE RNG. The reference runs detectors on ThreadPoolExecutors;
 * JS runs them in sequence. What makes that exact, MEASURED in the
 * reference venv (cv2 5.0.0; tools/parity-core-full.py --probe-rng prints
 * it):
 *   - OpenCV's theRNG() is THREAD-LOCAL. A new thread's first draw equals a
 *     fresh process's first draw whatever the main thread drew or seeded
 *     before, and a setRNGSeed on a worker leaves the main thread's stream
 *     where it was.
 *   - Stage 1's pool (ac, rl, ss) and the pick_axis pool draw nothing.
 *   - Stage 2's pool: build_evidence's k-means (fusion -> kmeans_quantize,
 *     UNSEEDED) is always the FIRST task of a brand-new thread (it is
 *     submitted first, and a pool thread only takes a second task after
 *     finishing one), so it always draws from the fresh state 0xffffffff;
 *     reconsearch._prep reseeds its own thread's generator (12345) before
 *     drawing; CellVarContrast draws nothing. So the reference's answer does
 *     NOT depend on which future finishes first, nor on how many numbers the
 *     main thread drew before detect, and detect leaves the main thread's
 *     generator untouched. (Measured: frog's fusion quantized image is
 *     byte-identical with and without a prior main-thread draw; the main
 *     thread's next draws after detect are a fresh process's first draws.)
 *   This port reproduces exactly that: build_evidence runs with PF's
 *   generator set to the fresh state and restored afterwards
 *   (core_onFreshThread), and _prep gets a private PF.RNG. PF's generator
 *   is therefore exactly where it was after detect(mode="full"), as the
 *   reference's main thread's is.
 *
 * low_memory. The reference serializes the three stage-2 builds on the MAIN
 * thread when it is set. MEASURED, that is not only a memory tactic there:
 * fusion's k-means then draws from the main thread's generator in whatever
 * state it is, and reconsearch reseeds the main thread's generator and
 * leaves it moved. In a fresh process the answer is unchanged; after one
 * prior draw on the main thread it is not (frog: 121 x 120 becomes
 * 121 x 118). Here the builds are serial anyway and there is no memory to
 * save, so low_memory is ACCEPTED AND IGNORED: detect(..., true) runs
 * exactly what detect(..., false) runs, and answers what the reference's
 * default (low_memory=False) path answers in every process state - which is
 * also what the reference's low_memory=True answers in a fresh process.
 *
 * np.log. numpy's float64 log on the reference machine is the UCRT's
 * (measured by the reconsearch and varcontrast ports: array and scalar
 * paths identical, correctly rounded on all but 4 of 25116 probe
 * arguments); V8's Math.log differs from it in the last bit on ~4% of
 * arguments. Every np.log here (aspect tests, AGREE_TOL, the candidate
 * de-duplication, log_steps and the interpolation point of fused_at) uses
 * PF.varcontrast.vc_log, the correctly rounded log that port carries. A
 * last-bit log difference can only matter at a threshold tie, but the
 * interpolated fused score is a sum the smallest-qualified rule compares
 * against 0.78 * best, so the closer model is used everywhere.
 *
 * Float policy: every number here is float64, as in the reference: the
 * detectors return Python floats / ints, `w / cols` is Python true
 * division, and round() is round-half-to-even (PF.rint), not Math.round.
 * Python's builtin max / min keep the FIRST argument unless the second is
 * strictly greater / smaller (pyMax / pyMin, which also gives NaN the
 * reference's treatment); max()/min() over an iterable keep the first
 * extreme; list.sort is stable; np.argmax takes the FIRST maximum.
 *
 * TRACE (JS-only, for the parity test): opts.trace, when a function, is
 * called as trace(tag, data) at the program points tools/parity-core-full.py
 * snapshots in the reference. It observes; it changes nothing.
 *
 * No imports, no build step: browser + node, ES2017.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var core = {};
  PF.core = core;

  // Arbitration constants (stage 2), the reference's values and names.
  core.AGREE_TOL = 0.02;           // |log(v/s)| < 0.02: a source "agrees" with step s
  core.AGREE_BONUS = 0.25;         // + 0.25 * (#sources agreeing - 1)
  core.VC_W = 0.20;                // 0.2 * square-packer z
  core.SMALLEST_QUALIFIED = 0.78;  // smallest peak with score >= 0.78 * best wins

  var hasOwn = Object.prototype.hasOwnProperty;

  // Python's min(a, b) / max(a, b): the first argument unless the second is
  // strictly smaller / greater. NOT Math.min / Math.max when a NaN is
  // involved (min(0.5, nan) is 0.5 in Python, NaN in Math.min), and the
  // early exit compares the result with >= 0.30.
  function pyMin(a, b) { return (b < a) ? b : a; }
  function pyMax(a, b) { return (b > a) ? b : a; }
  core._pyMin = pyMin;

  // Python dict truthiness for `props.get("ac") or props[names[0]]`: a dict
  // is falsy only when empty.
  function truthyDict(o) {
    if (o === undefined || o === null) return false;
    for (var k in o) if (hasOwn.call(o, k)) return true;
    return false;
  }

  // dict.get(key, default): the key's value if PRESENT (even if falsy),
  // else the default.
  function getOr(o, key, dflt) {
    return hasOwn.call(o, key) ? o[key] : dflt;
  }

  /* _size_close(a, b): output sizes agree within max(1 cell, 1%).
   *
   * The tolerance is derived from b ONLY, so the relation is asymmetric
   * (a=346,b=350 is close: round(3.5) = 4 half-to-even; a=350,b=346 is not:
   * round(3.46) = 3). Every call site passes a specific order - keep it.
   * round() is Python's round-half-to-even on 0.01 * cols. */
  function _size_close(a, b) {
    var tol_c = Math.max(1, PF.rint(0.01 * b.cols));
    var tol_r = Math.max(1, PF.rint(0.01 * b.rows));
    return (Math.abs(a.cols - b.cols) <= tol_c &&
            Math.abs(a.rows - b.rows) <= tol_r);
  }
  core._size_close = _size_close;

  function dep(name) {
    var m = PF[name];
    if (!m || typeof m.detect !== 'function') {
      throw new Error('PF.core.detect: PF.' + name + '.detect is not defined. ' +
        'The ' + name + '.py port has not been loaded onto PF; load its ' +
        'pf-*.js before pf-50-core.js is called. (This is a missing port, ' +
        'not a detector failure, so it is not swallowed.)');
    }
    return m;
  }

  // Full mode's further needs, checked at entry for the same reason.
  function depFull(A) {
    function miss(what) {
      throw new Error('PF.core.detect(mode="full"): ' + what + ' is not defined. ' +
        'Load the port that provides it before calling full mode. (A missing ' +
        'port, not a detector failure.)');
    }
    if (typeof A.refine_step_acf !== 'function') miss('PF.autocorr.refine_step_acf');
    if (typeof A.local_count !== 'function') miss('PF.autocorr.local_count');
    var F = PF.fusion;
    if (!F || typeof F.build_evidence !== 'function') miss('PF.fusion.build_evidence');
    if (typeof F.ladder !== 'function') miss('PF.fusion.ladder');
    if (typeof F.channel_matrix !== 'function') miss('PF.fusion.channel_matrix');
    if (typeof F.fused_curve !== 'function') miss('PF.fusion.fused_curve');
    if (!F.ACTIVE_CHANNELS) miss('PF.fusion.ACTIVE_CHANNELS');
    var V = PF.varcontrast;
    if (!V || typeof V.CellVarContrast !== 'function') miss('PF.varcontrast.CellVarContrast');
    if (typeof V.vc_log !== 'function') miss('PF.varcontrast.vc_log');
    var R = PF.reconsearch;
    if (!R) miss('PF.reconsearch');
    ['_prep', 'AxisData', '_s_grid', '_coarse_curves', '_trend_fn', '_score'].forEach(function (n) {
      if (typeof R[n] !== 'function') miss('PF.reconsearch.' + n);
    });
    if (typeof PF.RNG !== 'function' || typeof PF.theRNG !== 'function') miss('PF.RNG / PF.theRNG');
    ['interp', 'median', 'argmax', 'rint'].forEach(function (n) {
      if (typeof PF[n] !== 'function') miss('PF.' + n);
    });
    return { F: F, V: V, R: R };
  }

  function result(step_x, step_y, cols, rows, phase_x, phase_y, consensus) {
    return {
      step_x: step_x, step_y: step_y,
      cols: cols, rows: rows,
      phase_x: phase_x, phase_y: phase_y,
      consensus: consensus
    };
  }

  // Python `w / cols` raises ZeroDivisionError; JS would hand back Infinity
  // and let it flow into a result that looks measured.
  function trueDiv(num, den, what) {
    if (den === 0) throw new Error('ZeroDivisionError: ' + what + ' / 0');
    return num / den;
  }

  // np.log on this reference machine: see "np.log" in the header.
  function npLog(x) { return PF.varcontrast.vc_log(x); }
  core._npLog = npLog;

  // float(np.max(c)) of a float64 curve: NaN propagates.
  function core_npMax(a) {
    var m = a[0], i, v;
    if (m !== m) return m;
    for (i = 1; i < a.length; i++) {
      v = a[i];
      if (v !== v) return v;
      if (v > m) m = v;
    }
    return m;
  }

  /* core_onFreshThread(fn): run fn as the reference runs a stage-2 build on
   * a new ThreadPoolExecutor thread - with OpenCV's generator in the state a
   * new thread's theRNG() starts in (0xffffffff, measured), and with the
   * caller's generator exactly where it was afterwards, since the worker's
   * generator was its own. The state is restored even if fn throws. */
  function core_onFreshThread(fn) {
    var g = PF.theRNG();
    var lo = g.lo, hi = g.hi;
    g.setState(0xffffffff);
    try {
      return fn();
    } finally {
      g.lo = lo; g.hi = hi;
    }
  }
  core._onFreshThread = core_onFreshThread;

  // Proposal fields a trace carries (the four core reads, plus phase and
  // score when the detector returned them).
  function traceProps(props, names) {
    var out = {}, i, k, p, d;
    var extra = ['phase_x', 'phase_y', 'score_x', 'score_y'];
    for (i = 0; i < names.length; i++) {
      p = props[names[i]];
      d = { step_x: p.step_x, step_y: p.step_y, cols: p.cols, rows: p.rows };
      for (k = 0; k < extra.length; k++) if (hasOwn.call(p, extra[k])) d[extra[k]] = p[extra[k]];
      out[names[i]] = d;
    }
    return out;
  }

  /**
   * detect(rgba, mode="full", low_memory=False)
   *
   * mode "full": consensus + arbitration (best accuracy).
   * mode "fast": cheap detectors only; on disagreement returns the
   *              autocorr answer flagged low-confidence (bounded latency).
   * low_memory: accepted and ignored - see "low_memory" in the header.
   * opts.strict: rethrow a cheap detector's exception instead of swallowing it.
   * opts.trace:  function(tag, data), the parity test's observer.
   *
   * Returns {step_x, step_y, cols, rows, phase_x, phase_y, consensus}
   * (+ _errors when a detector threw and was swallowed).
   */
  core.detect = function detect(rgba, mode, low_memory, opts) {
    if (mode === undefined || mode === null) mode = 'full';   // reference default
    opts = opts || {};
    var strict = !!opts.strict;
    var trace = (typeof opts.trace === 'function') ? opts.trace : null;
    if (mode !== 'fast' && mode !== 'full') {
      throw new Error('PF.core.detect: unknown mode "' + mode + '" (expected "fast" or "full")');
    }
    if (!rgba || !rgba.d || !(rgba.w > 0) || !(rgba.h > 0) || rgba.cn !== 4 ||
        rgba.d.length !== rgba.w * rgba.h * 4) {
      throw new Error('PF.core.detect: rgba must be {d: Uint8Array(w*h*4), w, h, cn: 4}');
    }
    var A = dep('autocorr');
    var m_rl = dep('runlengths');
    var m_ss = dep('selfsim');
    var FULL = (mode === 'full') ? depFull(A) : null;

    var h = rgba.h, w = rgba.w;

    // ---- run the three cheap detectors (reference: ac and rl concurrently,
    // numpy releases the GIL on the large array ops; here sequentially -
    // nothing they compute is shared except what _run_ac writes to
    // `shared`, none of them draws a random number, and `props` is filled
    // in the reference's fixed order (ac, rl, then ss), which is
    // load-bearing for the fast-mode pair search and the stage-1 groups)
    var shared = {};

    function _run_ac() {
      var g = A.to_gray(rgba);
      var gq = A.median_quant(g);
      var maps_x = [[A.d2_along(g, 1), 1.0], [A.d1_along(gq, 1), 0.7]];
      var maps_y = [[A.d2_along(g, 0), 1.0], [A.d1_along(gq, 0), 0.7]];
      var est_x = A.axis_estimate(maps_x, 1, w);
      var est_y = A.axis_estimate(maps_y, 0, h);
      shared.maps_x = maps_x; shared.maps_y = maps_y;
      shared.est_x = est_x; shared.est_y = est_y;
      return A.detect(rgba, { maps_x: maps_x, maps_y: maps_y,
                              est_x: est_x, est_y: est_y });
    }

    var props = {};
    var names = [];        // insertion order of props: ac, rl, ss (minus failures), then fu
    var errors = {};
    function run(name, fn) {
      var r;
      try {
        r = fn();
      } catch (e) {
        if (strict) throw e;
        errors[name] = String((e && e.message) || e);   // reference: except Exception: pass
        return;
      }
      props[name] = r;
      names.push(name);
    }
    function finish(r) {
      var any = false;
      for (var k in errors) if (hasOwn.call(errors, k)) { any = true; break; }
      if (any) r._errors = errors;
      return r;
    }

    run('ac', _run_ac);
    run('rl', function () { return m_rl.detect(rgba); });

    // calibrated early exit: runlengths' comb peak height S >= 0.3 was
    // always correct on the benchmark; when ac agrees on the size too,
    // selfsim adds nothing - skip it (biggest fast-path cost)
    if (hasOwn.call(props, 'ac') && hasOwn.call(props, 'rl') &&
        _size_close(props.ac, props.rl) &&
        pyMin(getOr(props.rl, 'score_x', 0.0),
              getOr(props.rl, 'score_y', 0.0)) >= 0.30) {
      var ea = props.ac, eb = props.rl;
      var cols = PF.rint((ea.cols + eb.cols) / 2);   // int(round(x)): half-to-even
      var rows = PF.rint((ea.rows + eb.rows) / 2);
      return finish(result(trueDiv(w, cols, 'w'), trueDiv(h, rows, 'h'),
                           cols, rows, 0.0, 0.0, 'fast:ac+rl(S)'));
    }

    run('ss', function () { return m_ss.detect(rgba); });

    if (names.length === 0) {
      throw new Error('all sub-detectors failed');   // RuntimeError in the reference
    }

    if (mode === 'fast') {
      // bounded latency: no arbitration; prefer any 2-way agreement,
      // else autocorr, flagged low-confidence
      for (var i = 0; i < names.length; i++) {
        for (var j = i + 1; j < names.length; j++) {
          var pa = props[names[i]], pb = props[names[j]];
          if (_size_close(pa, pb)) {
            return finish(result(pa.step_x, pa.step_y, pa.cols, pa.rows,
                                 0.0, 0.0,
                                 'fastmode:' + names[i] + '+' + names[j]));
          }
        }
      }
      var fa = truthyDict(props.ac) ? props.ac : props[names[0]];
      return finish(result(fa.step_x, fa.step_y, fa.cols, fa.rows,
                           0.0, 0.0, 'fastmode:lowconf'));
    }

    return finish(detectFull(rgba, w, h, A, FULL, props, names, shared, trace));
  };

  /* ================================================================== *
   * mode "full", after the cheap detectors (core.py from
   * `if "maps_x" not in shared` to the end). Split out of detect() only to
   * keep it readable; the order of every step is the reference's.
   * ================================================================== */
  function detectFull(rgba, w, h, A, FULL, props, names, shared, trace) {
    var F = FULL.F, V = FULL.V, R = FULL.R;
    var i, k;

    if (!hasOwn.call(shared, 'maps_x')) {      // ac thread failed; rebuild serially
      var g = A.to_gray(rgba);
      var gq = A.median_quant(g);
      shared.maps_x = [[A.d2_along(g, 1), 1.0], [A.d1_along(gq, 1), 0.7]];
      shared.maps_y = [[A.d2_along(g, 0), 1.0], [A.d1_along(gq, 0), 0.7]];
      shared.est_x = A.axis_estimate(shared.maps_x, 1, w);
      shared.est_y = A.axis_estimate(shared.maps_y, 0, h);
    }
    var maps_x = shared.maps_x, maps_y = shared.maps_y;
    var est_x = shared.est_x, est_y = shared.est_y;

    // fast path: when the three cheap detectors already agree on the size,
    // skip the expensive fusion/arbitration machinery entirely
    if (names.length >= 3) {
      var fast = names.slice();
      var p0 = props[fast[0]];
      var agree = fast.filter(function (n) { return _size_close(props[n], p0); });
      var r0 = (p0.cols / pyMax(p0.rows, 1)) / (w / h);
      if (agree.length >= 3 && Math.abs(npLog(r0)) < 0.35) {
        var fcols = Math.trunc(PF.median(agree.map(function (n) { return props[n].cols; }), 'f8'));
        var frows = Math.trunc(PF.median(agree.map(function (n) { return props[n].rows; }), 'f8'));
        return result(trueDiv(w, fcols, 'w'), trueDiv(h, frows, 'h'), fcols, frows,
                      0.0, 0.0, 'fast:' + agree.join('+'));
      }
    }

    // slow evidence needed. The three heavy builds (fused evidence,
    // square-packer curve, distillability tables) are independent - the
    // reference builds them concurrently, then derives the fused-argmax
    // fourth voter. Here: in sequence, each with the generator the
    // reference's worker thread would have (see THREADS AND THE RNG).
    function _build_ev() {
      return core_onFreshThread(function () { return F.build_evidence(rgba, true); });
    }
    function _build_vc() {
      var vc = new V.CellVarContrast(rgba);
      var zc = vc.z_channel();
      return [vc, zc[0], zc[1]];
    }
    function _build_recon() {
      // _prep on the reference's worker seeds THAT thread's generator: a
      // private one here, so PF's global is untouched.
      var ch = R._prep(rgba, { rng: new PF.RNG() });
      var recon_ = {};
      var axes = [['x', w], ['y', h]];
      for (var a = 0; a < 2; a++) {
        var axis = axes[a][0], extent = axes[a][1];
        var ad = new R.AxisData(ch, axis === 'x' ? 0 : 1);
        var full = R._s_grid(extent), s_list = [];
        for (var q = 0; q < full.length; q += 3) s_list.push(full[q]);   // [::3]
        s_list = Float64Array.from(s_list);
        var ce = R._coarse_curves(ad, s_list);
        recon_[axis] = [ad, R._trend_fn(s_list, ce[0])];
      }
      return recon_;
    }

    var ev = _build_ev();
    var vcb = _build_vc();
    var vc_z = vcb[1];
    var recon = _build_recon();

    var steps = F.ladder();
    var log_steps = new Float64Array(steps.length);
    for (i = 0; i < steps.length; i++) log_steps[i] = npLog(steps[i]);
    var curves = {};
    ['x', 'y'].forEach(function (axis) {
      var mat = F.channel_matrix(ev, axis, steps, F.ACTIVE_CHANNELS);
      var c = F.fused_curve(mat);
      var m = core_npMax(c);
      if (m > 0) {
        var cn = new Float64Array(c.length);
        for (var t = 0; t < c.length; t++) cn[t] = c[t] / m;
        curves[axis] = cn;
      } else {
        curves[axis] = c;
      }
    });
    var fu_prop = {
      step_x: +steps[PF.argmax(curves.x)],
      step_y: +steps[PF.argmax(curves.y)]
    };
    fu_prop.cols = pyMax(1, PF.rint(w / fu_prop.step_x));
    fu_prop.rows = pyMax(1, PF.rint(h / fu_prop.step_y));
    props.fu = fu_prop;
    names.push('fu');

    // ---- stage 1: consensus on output size
    if (trace) trace('stage1', { props: traceProps(props, names), names: names.slice(),
                                 curve_x: curves.x, curve_y: curves.y });
    var groups = [];
    for (i = 0; i < names.length; i++) {
      var n1 = names[i];
      var grp = names.filter(function (n2) { return _size_close(props[n2], props[n1]); });
      groups.push([grp.length, n1, grp, i]);
    }
    groups.sort(function (a, b) { return (b[0] - a[0]) || (a[3] - b[3]); });   // stable, key -len
    groups = groups.map(function (g) { return [g[0], g[1], g[2]]; });
    if (trace) trace('groups_pre', groups.map(function (g) { return [g[0], g[1], g[2].slice()]; }));
    // correlated failures make 2-of-4 unsafe (methods share texture/content
    // locks); only a supermajority short-circuits arbitration, and it must
    // respect the image's aspect (cols/rows ~ w/h for near-square cells)
    function _aspect_ok(n) {
      var r = (props[n].cols / pyMax(props[n].rows, 1)) / (w / h);
      return Math.abs(npLog(r)) < 0.35;
    }
    groups = groups.filter(function (g) { return _aspect_ok(g[1]); });
    if (trace) trace('groups_post', groups.map(function (g) { return [g[0], g[1], g[2].slice()]; }));
    if (groups.length && groups[0][0] >= 3) {
      var sgrp = groups[0][2];
      var scols = Math.trunc(PF.median(sgrp.map(function (n) { return props[n].cols; }), 'f8'));
      var srows = Math.trunc(PF.median(sgrp.map(function (n) { return props[n].rows; }), 'f8'));
      var base = (sgrp.indexOf('ac') >= 0) ? props.ac : props[sgrp[0]];
      return result(trueDiv(w, scols, 'w'), trueDiv(h, srows, 'h'), scols, srows,
                    getOr(base, 'phase_x', 0.0), getOr(base, 'phase_y', 0.0),
                    sgrp.join('+'));
    }

    // ---- stage 2: arbitration
    var cand_x = est_x[1], ac_x = est_x[2];
    var cand_y = est_y[1], ac_y = est_y[2];

    // detail-scale bound: a cell is flat inside, so the finest feature scale
    // (ACF central peak half-width) caps the plausible step. 60px cells
    // cannot coexist with 3px detail.
    function _acf_width(ac) {
      var n = ac.length;
      var tail = (n > 40) ? ac.subarray(32, Math.min(96, n)) : ac.subarray(n >> 1);
      var base = tail.length ? +PF.median(tail, 'f8') : 0.0;
      var c0 = pyMax(ac[0] - base, 1e-9);
      var lim = Math.min(n, 64);
      for (var lag = 1; lag < lim; lag++) {
        if (ac[lag] - base < 0.30 * c0) return lag;
      }
      return 64.0;
    }
    var detail_cap_x = 8.0 * _acf_width(ac_x);
    var detail_cap_y = 8.0 * _acf_width(ac_y);
    if (trace) trace('caps', { x: detail_cap_x, y: detail_cap_y });

    function recon_at(axis, s) {
      var rc = recon[axis], ad = rc[0], trend = rc[1];
      if (s < 2.0 || s > (axis === 'x' ? w : h) / 8.0) return 0.0;
      var e = ad.eval_s(s);
      return R._score(e[0], e[1], trend(s));
    }

    function fused_at(axis, s) {
      if (s < steps[0] || s > steps[steps.length - 1]) return 0.0;
      return PF.interp(npLog(s), log_steps, curves[axis]);
    }

    function vc_at(s) {
      return pyMax(0.0, pyMin(vc_z(s) / 10.0, 1.0));
    }

    function pick_axis(axis, ac_cands, extent) {
      var key = (axis === 'x') ? 'step_x' : 'step_y';
      var srcNames = names.slice(), srcVals = [], q;
      for (q = 0; q < srcNames.length; q++) srcVals.push(+props[srcNames[q]][key]);
      var pool = srcVals.slice();
      for (q = 0; q < Math.min(5, ac_cands.length); q++) pool.push(ac_cands[q][0]);

      var cands = [];
      var seen = [];
      for (q = 0; q < pool.length; q++) {
        var s = pool[q];
        if (s <= 1.2 || s > extent / 3) continue;
        var dup = false;
        for (var z = 0; z < seen.length; z++) {
          if (Math.abs(npLog(s / seen[z])) < 0.01) { dup = true; break; }
        }
        if (dup) continue;
        seen.push(s);
        cands.push(s);
      }
      if (!cands.length) {
        var acIdx = srcNames.indexOf('ac');
        var ret0 = (acIdx >= 0) ? srcVals[acIdx] : 4.0;     // sources.get("ac", 4.0)
        if (trace) trace('pick', { axis: axis, cands: [], ret: ret0 });
        return ret0;
      }

      var rn = cands.map(function (s) { return recon_at(axis, s); });
      var rmax = rn[0];
      for (q = 1; q < rn.length; q++) if (rn[q] > rmax) rmax = rn[q];   // max(rn.values())
      // a lattice must actually exist for the distillability term to mean
      // anything; below this floor it is pure noise (warped-cell images)
      var recon_ok = rmax > 0.005;

      var cap = (axis === 'x') ? detail_cap_x : detail_cap_y;
      var scored = [];
      for (q = 0; q < cands.length; q++) {
        var sq = cands[q];
        var agreeN = 0;
        for (var v = 0; v < srcVals.length; v++) {
          if (Math.abs(npLog(pyMax(srcVals[v], 1e-9) / sq)) < core.AGREE_TOL) agreeN++;
        }
        var sc = (fused_at(axis, sq) + core.VC_W * vc_at(sq)
                  + core.AGREE_BONUS * Math.max(0, agreeN - 1));
        if (recon_ok) sc += 0.6 * (rn[q] / rmax);
        if (sq > cap) sc *= 0.35;   // step incompatible with the finest detail
        scored.push([sq, sc]);
      }
      var best = scored[0][1];
      for (q = 1; q < scored.length; q++) if (scored[q][1] > best) best = scored[q][1];
      var qualified = [];
      for (q = 0; q < scored.length; q++) {
        if (scored[q][1] >= core.SMALLEST_QUALIFIED * best) qualified.push(scored[q][0]);
      }
      var ret = qualified[0];
      for (q = 1; q < qualified.length; q++) if (qualified[q] < ret) ret = qualified[q];   // min()
      if (trace) trace('pick', { axis: axis, cands: cands.slice(), ret: ret, rn: rn.slice(),
                                 rmax: rmax, recon_ok: recon_ok,
                                 scored: scored.map(function (t) { return [t[0], t[1]]; }),
                                 best: best, qualified: qualified.slice() });
      return ret;
    }

    // the reference runs the two axes on a 2-thread pool; nothing either
    // touches is shared or random
    var sx = pick_axis('x', cand_x, w);
    var sy = pick_axis('y', cand_y, h);

    // aspect guard: pseudo-pixel cells are never wildly non-square (worst
    // confirmed real case is 1.5:1). On wild disagreement, prefer the FINER
    // step when it has real support on its own axis: a too-fine grid loses
    // nothing (pure subdivision) while a too-coarse grid destroys detail.
    if (trace) trace('aspect1', { sx: sx, sy: sy });
    if (Math.abs(npLog(sx / sy)) > 0.45) {
      var fineIsX = sx < sy;
      var s_fine = fineIsX ? sx : sy, ax_fine = fineIsX ? 'x' : 'y';
      if (fused_at(ax_fine, s_fine) >= 0.35) {
        sx = sy = s_fine;
      }
    }
    if (trace) trace('aspect2', { sx: sx, sy: sy });
    if (Math.abs(npLog(sx / sy)) > 0.45) {
      var _both = function (s) {
        var rx = recon_at('x', s), ry = recon_at('y', s);
        var mx = pyMax(rx, ry);
        var r_term = (mx > 0.005) ? 0.5 * (rx + ry) / pyMax(mx, 1e-9) : 0.0;   // max(rx, ry, 1e-9)
        var val = r_term + fused_at('x', s) + fused_at('y', s) + 2 * core.VC_W * vc_at(s);
        if (s > pyMin(detail_cap_x, detail_cap_y)) val *= 0.35;
        if (trace) trace('both', { s: s, ret: val });
        return val;
      };
      if (_both(sx) >= _both(sy)) sy = sx; else sx = sy;
    }

    if (trace) trace('refine', { sx: sx, sy: sy });
    sx = A.refine_step_acf(ac_x, sx);
    sy = A.refine_step_acf(ac_y, sy);

    if (trace) trace('harm', { sx: sx, sy: sy });
    if (Math.abs(npLog(sx / sy)) < 0.08 && Math.abs(sx - sy) > 1e-6) {
      var sh = 2.0 * sx * sy / (sx + sy);
      sx = A.refine_step_acf(ac_x, sh);
      sy = A.refine_step_acf(ac_y, sh);
    }

    if (trace) trace('count', { sx: sx, sy: sy });
    var n_cols = A.local_count(maps_x, 1, w, sx);
    var n_rows = A.local_count(maps_y, 0, h, sy);
    if (trace) trace('final', { n_cols: n_cols, n_rows: n_rows });

    return result(trueDiv(w, n_cols, 'w'), trueDiv(h, n_rows, 'h'),
                  PF.rint(n_cols), PF.rint(n_rows), 0.0, 0.0, 'arbitrated');
  }

  // pixelfixer/__init__.py: `from .core import detect`
  PF.detect = core.detect;

  core.version = 'pf-50-core/2';
})();
