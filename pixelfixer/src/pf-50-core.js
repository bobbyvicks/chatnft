/* pf-50-core.js - port of pixelfixer/core.py: the consensus-first ensemble
 * that fronts the detector stack.
 *
 * SCOPE OF THIS FILE (measured, not planned): mode "fast" is ported and
 * exact; mode "full" THROWS ("full mode is not ported yet"). The full-mode
 * continuation (stage 1 consensus over four proposals, stage 2 arbitration
 * with fusion / varcontrast / reconsearch) is left as a marked hole so it
 * can drop in without restructuring detect().
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
 * DEPENDENCY CONTRACT. core.py imports the three cheap detectors as
 * modules (autocorr as A, runlengths as m_rl, selfsim as m_ss). This port
 * resolves them AT CALL TIME on the PF global, under the reference's module
 * names, so load order does not matter and a later-loaded port is picked up
 * without touching this file:
 *
 *   PF.autocorr   { to_gray, median_quant, d1_along, d2_along,
 *                   axis_estimate, detect(rgba, pre) }
 *   PF.runlengths { detect(rgba) }
 *   PF.selfsim    { detect(rgba) }
 *
 * Each detect returns a plain object with at least step_x, step_y, cols,
 * rows (runlengths also score_x / score_y, except on its no-lattice
 * fallback where those keys are ABSENT - core reads them with a default of
 * 0.0, which is what makes that fallback refuse the early exit). The
 * feature maps handed to axis_estimate / detect(pre) are arrays of
 * [featureMap, weight] pairs mirroring the reference's list of tuples; core
 * does not look inside them, so their inner representation belongs to the
 * autocorr port.
 *
 * A MISSING module throws at entry (a port that is not loaded is an
 * instrument failure and must not read as "that detector failed on this
 * image"). A LOADED detector that throws is swallowed exactly as the
 * reference's `except Exception: pass` swallows it, but the message is kept
 * on the result under `_errors` (a key the reference never emits) so the
 * swallow is visible; pass {strict: true} to rethrow instead.
 *
 * Image representation: {d: Uint8Array(w*h*4), w, h, cn: 4} RGBA
 * interleaved - the shape pf-03-cv2.js's medianBlur takes and the one
 * pf-21-runlengths.js's _prep asserts (cn === 4); `rgba.shape[:2]` is
 * (h, w). The shape is checked at ENTRY so a malformed image fails loudly
 * here instead of failing inside each detector and being swallowed.
 *
 * Threading: the reference runs ac and rl on a thread pool. Nothing they
 * compute is shared (only _run_ac writes `shared`), and `props` is filled
 * in a fixed order (ac, rl, then ss) by the result loop, so a sequential
 * port is observationally identical; the ORDER of `props` is load-bearing
 * for the fast-mode pair search below and is kept explicit in `names`.
 *
 * Float policy: every number here is float64, as in the reference: the
 * detectors return Python floats / ints, `w / cols` is Python true
 * division, and round() is round-half-to-even (PF.rint), not Math.round.
 *
 * No imports, no build step: browser + node, ES2017.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var core = {};
  PF.core = core;

  // Arbitration constants (stage 2). Unused by fast mode; kept with the
  // reference's values and names so the arbitration port reads the same.
  core.AGREE_TOL = 0.02;           // |log(v/s)| < 0.02: a source "agrees" with step s
  core.AGREE_BONUS = 0.25;         // + 0.25 * (#sources agreeing - 1)
  core.VC_W = 0.20;                // 0.2 * square-packer z
  core.SMALLEST_QUALIFIED = 0.78;  // smallest peak with score >= 0.78 * best wins

  var hasOwn = Object.prototype.hasOwnProperty;

  // Python's min(a, b): returns a unless b < a. This is NOT Math.min when a
  // NaN is involved (min(0.5, nan) is 0.5 in Python, NaN in Math.min), and
  // the early exit compares the result with >= 0.30.
  function pyMin(a, b) { return (b < a) ? b : a; }
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
   * round(3.46) = 3). Both call sites pass a specific order - keep it.
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

  /**
   * detect(rgba, mode="full", low_memory=False)
   *
   * mode "full": consensus + arbitration (best accuracy)  - NOT PORTED, throws.
   * mode "fast": cheap detectors only; on disagreement returns the
   *              autocorr answer flagged low-confidence (bounded latency).
   * low_memory: serialize the heavy stage-2 builds (~40% lower peak) -
   *             full-mode only; accepted and ignored here.
   * opts.strict: rethrow a detector's exception instead of swallowing it.
   *
   * Returns {step_x, step_y, cols, rows, phase_x, phase_y, consensus}
   * (+ _errors when a detector threw and was swallowed).
   */
  core.detect = function detect(rgba, mode, low_memory, opts) {
    if (mode === undefined || mode === null) mode = 'full';   // reference default
    opts = opts || {};
    var strict = !!opts.strict;
    if (mode === 'full') {
      throw new Error('full mode is not ported yet');
    }
    if (mode !== 'fast') {
      throw new Error('PF.core.detect: unknown mode "' + mode + '" (expected "fast" or "full")');
    }
    if (!rgba || !rgba.d || !(rgba.w > 0) || !(rgba.h > 0) || rgba.cn !== 4 ||
        rgba.d.length !== rgba.w * rgba.h * 4) {
      throw new Error('PF.core.detect: rgba must be {d: Uint8Array(w*h*4), w, h, cn: 4}');
    }
    var A = dep('autocorr');
    var m_rl = dep('runlengths');
    var m_ss = dep('selfsim');

    var h = rgba.h, w = rgba.w;

    // ---- run the three cheap detectors (reference: ac and rl concurrently,
    // numpy releases the GIL on the large array ops; here sequentially -
    // see the header for why that is observationally identical)
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
    var names = [];        // insertion order of props: ac, rl, ss (minus failures)
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

    // ---- mode "full" continues here in the reference: rebuild `shared`
    // if the ac thread failed, the 3-way cheap-detector fast path, then
    // stage 1 (consensus over ac/rl/ss/fu) and stage 2 (arbitration with
    // fusion.build_evidence, varcontrast.CellVarContrast, reconsearch,
    // refine_step_acf, local_count). Not ported. detect() rejects
    // mode="full" at entry, so this line is unreachable; it is here so the
    // hole has an address.
    throw new Error('full mode is not ported yet');
  };

  // pixelfixer/__init__.py: `from .core import detect`
  PF.detect = core.detect;

  core.version = 'pf-50-core/1';
})();
