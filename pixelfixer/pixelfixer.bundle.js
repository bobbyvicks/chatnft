/* Pixel Art Fixer - the detector and reconstructor from
 * https://github.com/Retro-Diffusion/pixel-art-fixer (commit ef376e5),
 * ported from Python to dependency-free JavaScript.
 *
 * FAST MODE ONLY. core.detect refuses mode:"full" - the arbitration stage
 * is not ported. Fast mode recovers the exact native size on every fixture
 * and example image measured, and the reconstruction is byte-identical to
 * the reference; tools/test-detect.js and tools/test-recon.js are where
 * that is measured rather than claimed.
 *
 * Built by tools/build.js from 14 modules. Do not edit here -
 * edit src/ and rebuild, or the parity harness stops describing this file.
 */

/* ==== pf-00-base.js =============================================== */
/* pf-00-base.js - the array spine and the small numpy verbs.
 *
 * Port target: numpy 2.5.3 semantics (the reference venv). Every function
 * here is a place a naive port silently diverges; the divergence that
 * matters is called out in the comment above each one.
 *
 * No imports, no exports, no build step. Browser + node, ES2017.
 * Reads and writes exactly one global: PF.
 *
 * Conventions
 *   - 1-D data is a typed array (Float64Array unless stated).
 *   - 2-D data is {d, w, h}: one flat typed array plus explicit width and
 *     height. Never arrays of arrays.
 *   - "kind" strings name dtypes: 'f64' 'f32' 'i32' 'i16' 'u8' 'u8c'.
 *   - float64 everywhere unless a call site is measured to be float32; the
 *     float32 paths are opt-in via a dtype argument, never guessed.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  /* ------------------------------------------------------------------ *
   * dtypes and construction
   * ------------------------------------------------------------------ */

  var KINDS = {
    f64: Float64Array,
    f32: Float32Array,
    i32: Int32Array,
    i16: Int16Array,
    u8: Uint8Array,
    u8c: Uint8ClampedArray
  };
  PF.KINDS = KINDS;

  function ctor(kind) {
    if (kind === undefined || kind === null) return Float64Array;
    if (typeof kind === 'function') return kind;
    var C = KINDS[kind];
    if (!C) throw new Error('PF: unknown dtype kind ' + String(kind));
    return C;
  }
  PF.ctor = ctor;

  // An instrument failure must not be able to present as a measurement:
  // every shape mistake throws instead of quietly producing a short array.
  function check(cond, msg) {
    if (!cond) throw new Error('PF: ' + msg);
  }
  PF.check = check;

  function checkLen(a, n, what) {
    check(!!a && a.length === n,
      (what || 'array') + ' length ' + (a ? a.length : 'null') +
      ' != expected ' + n);
    return a;
  }
  PF.checkLen = checkLen;

  PF.zeros = function (n, kind) { return new (ctor(kind))(n | 0); };
  PF.empty = function (n, kind) { return new (ctor(kind))(n | 0); };

  PF.full = function (n, value, kind) {
    var out = new (ctor(kind))(n | 0);
    out.fill(value);
    return out;
  };

  PF.zerosLike = function (a) { return new a.constructor(a.length); };
  PF.copy = function (a) { return new a.constructor(a); };

  // np.asarray(list, dtype)
  PF.asArray = function (a, kind) {
    var C = ctor(kind);
    if (a instanceof C) return a;
    var out = new C(a.length), i;
    for (i = 0; i < a.length; i++) out[i] = a[i];
    return out;
  };

  /* ------------------------------------------------------------------ *
   * 2-D shape helpers: flat typed array + explicit w/h
   * ------------------------------------------------------------------ */

  PF.mat = function (w, h, kind) {
    check(w >= 0 && h >= 0, 'mat dims must be non-negative');
    return { d: new (ctor(kind))(w * h), w: w | 0, h: h | 0 };
  };

  PF.matWrap = function (d, w, h) {
    checkLen(d, w * h, 'matWrap data');
    return { d: d, w: w | 0, h: h | 0 };
  };

  PF.matAt = function (m, y, x) { return m.d[y * m.w + x]; };
  PF.matSet = function (m, y, x, v) { m.d[y * m.w + x] = v; };
  // A row is a view (writes hit the parent); a column must be copied.
  PF.matRow = function (m, y) { return m.d.subarray(y * m.w, (y + 1) * m.w); };
  PF.matCol = function (m, x) {
    var out = new m.d.constructor(m.h), y;
    for (y = 0; y < m.h; y++) out[y] = m.d[y * m.w + x];
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.arange
   *
   * TRAP: numpy does NOT compute out[i] = start + i*step. It writes
   * out[0]=start, out[1]=start+step, then uses delta = out[1]-out[0],
   * which for a fractional step is not bit-identical to step. Length is
   * ceil((stop-start)/step) evaluated in float64.
   * (numpy/_core/src/multiarray/ctors.c PyArray_Arange + the dtype fill)
   * ------------------------------------------------------------------ */
  PF.arange = function (a, b, c, kind) {
    var start, stop, step;
    if (b === undefined) { start = 0; stop = a; step = 1; }
    else if (c === undefined) { start = a; stop = b; step = 1; }
    else { start = a; stop = b; step = c; }
    check(step !== 0, 'arange: step cannot be zero');
    var len = Math.ceil((stop - start) / step);
    if (!(len > 0)) len = 0;
    check(isFinite(len), 'arange: non-finite length');
    var out = new (ctor(kind))(len);
    if (len === 0) return out;
    out[0] = start;
    if (len === 1) return out;
    out[1] = start + step;
    if (len === 2) return out;
    var delta = out[1] - out[0];
    for (var i = 2; i < len; i++) out[i] = start + i * delta;
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.linspace (endpoint=True by default)
   *
   * TRAP: the last element is ASSIGNED stop, it is not computed. And the
   * body is i*(delta/div)+start, not start+i*delta.
   * (numpy/_core/function_base.py linspace)
   * ------------------------------------------------------------------ */
  PF.linspace = function (start, stop, num, endpoint) {
    if (endpoint === undefined) endpoint = true;
    num = num | 0;
    check(num >= 0, 'linspace: num must be non-negative');
    var out = new Float64Array(num);
    if (num === 0) return out;
    var div = endpoint ? num - 1 : num;
    var delta = stop - start;
    var i;
    if (div > 0) {
      var step = delta / div;
      if (step === 0) {
        for (i = 0; i < num; i++) out[i] = (i / div) * delta;
      } else {
        for (i = 0; i < num; i++) out[i] = i * step;
      }
    } else {
      for (i = 0; i < num; i++) out[i] = i * delta;
    }
    for (i = 0; i < num; i++) out[i] = out[i] + start;
    if (endpoint && num > 1) out[num - 1] = stop;
    return out;
  };

  /* ------------------------------------------------------------------ *
   * elementwise
   * ------------------------------------------------------------------ */

  /* np.clip(a, lo, hi); pass null for a one-sided bound, mirroring numpy's
   * np.clip(x, 0, None).
   *
   * MEASURED: the two-sided form is a fused ufunc whose min/max keep the
   * LEFT operand when the two compare equal, so np.clip(-0.0, 0.0, 1.5) is
   * -0.0, not +0.0; a NaN bound propagates. The ONE-sided forms are
   * np.maximum / np.minimum instead, which keep the RIGHT operand on a tie,
   * so np.clip(-0.0, None, 0.0) is +0.0 - the opposite answer for the same
   * pair of values. Both spellings appear in the reference.
   */
  function clip2(x, lo, hi) {
    var t = (lo !== lo) ? lo : ((x < lo) ? lo : x);   // _NPY_MAX(x, lo)
    return (hi !== hi) ? hi : ((hi < t) ? hi : t);    // _NPY_MIN(t, hi)
  }
  function npMaximum(x, y) {
    if (x !== x) return x;
    if (y !== y) return y;
    return (x > y) ? x : y;
  }
  function npMinimum(x, y) {
    if (x !== x) return x;
    if (y !== y) return y;
    return (x < y) ? x : y;
  }
  PF.npMaximum = npMaximum;
  PF.npMinimum = npMinimum;

  PF.clip = function (a, lo, hi) {
    var hasLo = lo !== null && lo !== undefined;
    var hasHi = hi !== null && hi !== undefined;
    var out = new a.constructor(a.length), i;
    if (hasLo && hasHi) {
      for (i = 0; i < a.length; i++) out[i] = clip2(a[i], lo, hi);
    } else if (hasLo) {
      for (i = 0; i < a.length; i++) out[i] = npMaximum(a[i], lo);
    } else if (hasHi) {
      for (i = 0; i < a.length; i++) out[i] = npMinimum(a[i], hi);
    } else {
      out.set(a);
    }
    return out;
  };

  PF.clipScalar = function (v, lo, hi) {
    var hasLo = lo !== null && lo !== undefined;
    var hasHi = hi !== null && hi !== undefined;
    if (hasLo && hasHi) return clip2(v, lo, hi);
    if (hasLo) return npMaximum(v, lo);
    if (hasHi) return npMinimum(v, hi);
    return v;
  };

  PF.abs = function (a) {
    var out = new a.constructor(a.length), i;
    for (i = 0; i < a.length; i++) out[i] = Math.abs(a[i]);
    return out;
  };

  PF.neg = function (a) {
    var out = new a.constructor(a.length), i;
    for (i = 0; i < a.length; i++) out[i] = -a[i];
    return out;
  };

  // a[idx] fancy indexing. Negative indices wrap like numpy.
  PF.take = function (a, idx) {
    var out = new a.constructor(idx.length), i, j;
    for (i = 0; i < idx.length; i++) {
      j = idx[i];
      if (j < 0) j += a.length;
      check(j >= 0 && j < a.length, 'take: index out of range');
      out[i] = a[j];
    }
    return out;
  };

  // a[::-1]
  PF.reversed = function (a) {
    var n = a.length, out = new a.constructor(n), i;
    for (i = 0; i < n; i++) out[i] = a[n - 1 - i];
    return out;
  };

  // .astype(int): C truncation toward zero, NOT floor. Math.floor(-0.7) is
  // -1 where numpy's astype(int) gives 0.
  PF.astypeInt = function (a) {
    var out = new Int32Array(a.length), i;
    for (i = 0; i < a.length; i++) out[i] = Math.trunc(a[i]);
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.argmax / np.argmin
   *
   * numpy tie-break: FIRST maximum. The C loop condition is !(x <= max),
   * which is also how a NaN wins and terminates the scan; replicated
   * verbatim so NaN behaviour matches too.
   * (numpy/_core/src/multiarray/arraytypes.c.src @TYPE@_argmax)
   * ------------------------------------------------------------------ */
  PF.argmax = function (a) {
    var n = a.length;
    check(n > 0, 'argmax of an empty array');
    var mp = a[0], mi = 0, i, v;
    if (mp !== mp) return 0;
    for (i = 1; i < n; i++) {
      v = a[i];
      if (!(v <= mp)) { mp = v; mi = i; if (mp !== mp) break; }
    }
    return mi;
  };

  PF.argmin = function (a) {
    var n = a.length;
    check(n > 0, 'argmin of an empty array');
    var mp = a[0], mi = 0, i, v;
    if (mp !== mp) return 0;
    for (i = 1; i < n; i++) {
      v = a[i];
      if (!(v >= mp)) { mp = v; mi = i; if (mp !== mp) break; }
    }
    return mi;
  };

  /* ------------------------------------------------------------------ *
   * np.argsort
   *
   * MEASURED (numpy 2.5.3, this machine reports AVX512_SKX = True):
   * numpy's DEFAULT kind='quicksort' dispatches to x86-simd-sort, an
   * AVX-512 network, not the classic introsort. Its tie order matches
   * neither a stable sort (393/400 tie-heavy trials differ in the
   * argsort_study of fixtures/core-array.json; 0/200 distinct-valued
   * trials differ; sorted VALUES never differ) nor numpy's own portable
   * introsort (ported and measured in pf-02-scipy.js + test-scipy.js
   * "np.argsort forensics": numpy is stable on some tie inputs and not
   * others, and returns the SAME permutation for kind="quicksort" and
   * kind="heapsort"). It IS deterministic: 25 repeat calls x 10 sizes
   * (8..20000) in each of 2 processes gave one permutation per input,
   * identical across processes, so the fixture's numpy_default column is
   * a stable record of THIS CPU's answer, not noise. But it is a property
   * of the CPU the reference ran on: not reproducible in JS, and not
   * reproduced in Python on a machine without AVX-512 either.
   *
   * Therefore: PF.argsort is STABLE (== numpy kind='stable'), and asking
   * for 'quicksort' THROWS rather than returning a plausible-looking
   * permutation. Sorted VALUES are identical either way; only the index
   * order inside a block of equal values differs.
   *
   * Call sites to review for ties when porting:
   *   runlengths.py:134  idx[argsort(S[idx])[::-1]]  - S is a comb score
   *                      over binned integer run lengths, so exact ties
   *                      are plausible, and order[0] / order[:12] are used
   *                      to pick and rank the step. HIGHEST RISK.
   *   autocorr.py:273    loc[argsort(sel[loc])[::-1]][:8] - feeds the
   *                      candidate list core.pick_axis reads as [:5].
   *   selfsim.py:185     idx[argsort(z[idx])[::-1]]
   *   channels.py:338/642/784/874, fusion.py:268  argsort(-x), ranked use
   *   reconsearch.py:80  argsort(evals) of a 3x3 eigenspectrum
   *   varcontrast.py:235 argsort(py*w+px) - the keys are unique by
   *                      construction, so ties cannot arise: SAFE.
   *   selfsim.py:358     argsort(v) for a weighted median - tie order
   *                      cannot change the returned VALUE (all tied
   *                      entries carry the same v), only the float
   *                      accumulation order of the cumsum: SAFE in value.
   *
   * NOTE the two descending spellings are NOT the same under a stable
   * sort: argsort(x)[::-1] reverses the ties too (tied indices come out
   * DESCENDING), while argsort(-x) leaves tied indices ASCENDING. Mirror
   * whichever spelling the reference used:
   *   np.argsort(x)[::-1]  ->  PF.reversed(PF.argsort(x))
   *   np.argsort(-x)       ->  PF.argsort(PF.neg(x))
   * ------------------------------------------------------------------ */
  PF.argsort = function (a, kind) {
    if (kind === undefined || kind === null) kind = 'stable';
    if (kind !== 'stable' && kind !== 'mergesort') {
      throw new Error(
        'PF.argsort: only "stable" is supported. numpy\'s default ' +
        'kind="quicksort" is an AVX-512 sorting network on the reference ' +
        'machine; its tie order is not portable and is not reproduced here.');
    }
    var n = a.length;
    var idx = new Array(n), i;
    for (i = 0; i < n; i++) idx[i] = i;
    // Stability comes from the explicit index tiebreak, not from trusting
    // the engine's sort to be stable.
    idx.sort(function (i, j) {
      var x = a[i], y = a[j];
      if (x !== x || y !== y) {            // numpy sorts NaN to the end
        if (x !== x && y !== y) return i - j;
        return (x !== x) ? 1 : -1;
      }
      if (x < y) return -1;
      if (x > y) return 1;
      return i - j;
    });
    var out = new Int32Array(n);
    for (i = 0; i < n; i++) out[i] = idx[i];
    return out;
  };

  /* np.sort(a, kind='stable').
   *
   * Equal values are usually bit-identical, so the sort kind is
   * unobservable - EXCEPT for -0.0 vs +0.0, which compare equal but are
   * different bits. numpy's stable sort compares with '<' only, so signed
   * zeros keep their INPUT order; TypedArray.prototype.sort instead
   * SPECIFIES -0 before +0. Sort fast, then rewrite the zero run in input
   * order, which costs one extra O(n) pass only when both signs are
   * present. Result is bitwise equal to np.sort(a, kind='stable').
   */
  PF.sorted = function (a) {
    var out = new a.constructor(a);
    out.sort();
    var n = out.length;
    if (n < 2) return out;
    if (!(out instanceof Float64Array || out instanceof Float32Array)) return out;
    var lo = ssOne(out, 0, false);          // first index with out[i] >= 0
    if (lo >= n || out[lo] !== 0) return out;
    var hi = lo;
    while (hi < n && out[hi] === 0) hi++;
    if (hi - lo < 2) return out;
    var firstNeg = Object.is(out[lo], -0), mixed = false, k;
    for (k = lo + 1; k < hi; k++) {
      if (Object.is(out[k], -0) !== firstNeg) { mixed = true; break; }
    }
    if (!mixed) return out;
    var w = lo;
    for (k = 0; k < n; k++) if (a[k] === 0) out[w++] = a[k];
    check(w === hi, 'sorted: zero-run repair miscounted');
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.median
   *
   * Even n averages the two middle values. dtype matters: numpy computes
   * that average with np.mean IN THE ARRAY'S DTYPE, so a float32 input
   * gives fround(fround(a+b)/2), not the float64 answer. Pass dtype 'f4'
   * at float32 call sites.
   *   autocorr.py:93   'f4' - MEASURED. numpy 2.x FFT preserves float32
   *                    (rfft of a float32 gives complex64, irfft gives
   *                    float32), so the cepstrum c is float32. Do not
   *                    assume the pre-2.0 behaviour of upcasting to f8.
   *   core.py:131/207  'f8' - a Python list of ints becomes an int64
   *                    array and np.median returns float64.
   *   'f8' at every remaining site - MEASURED by reading the producer
   *   of the argument (the code decides, not the feature-map dtype):
   *   selfsim.py:152     dm = d/mean(d); d comes from _group() over the
   *                      num/den = np.zeros(...) float64 accumulators,
   *                      even though the feature maps are float32.
   *   varcontrast.py:397 resid = cs - median_filter(cs); cs is an array
   *                      of Python floats (contrast() returns float()).
   *   reconsearch.py:273 eb = np.empty(len(s_list)), float64.
   *   channels.py:311    sp = np.diff(peaks).astype(np.float64).
   *   channels.py:549    sp = np.diff(p); p = (pk+x0+offset).astype(f64)
   *                      built at channels.py:506.
   *   channels.py:558    hist_vals = np.array(list of Python floats).
   *   channels.py:814    fits are Python floats (float(coef[1]) or s0).
   *   core.py:225        tail of ac_sum = np.zeros(extent), autocorr:249.
   * NaN: numpy returns NaN when any element is NaN (_median_nancheck);
   * a plain sort would push NaN to the end and quietly answer from the
   * finite values, so the scan below comes first.
   * (numpy/lib/_function_base_impl.py _median)
   * ------------------------------------------------------------------ */
  PF.median = function (a, dtype) {
    var n = a.length;
    check(n > 0, 'median of an empty array');
    var f32 = (dtype === 'f4' || dtype === 'f32' || dtype === Float32Array);
    var src = (a instanceof Float64Array || a instanceof Float32Array)
      ? a : PF.asArray(a, f32 ? 'f32' : 'f64');
    var i;
    for (i = 0; i < n; i++) if (src[i] !== src[i]) return src[i];   // NaN in -> NaN out (median)
    var s = PF.sorted(src);
    if (n & 1) {
      var v = s[(n - 1) >> 1];
      return f32 ? Math.fround(v) : v;
    }
    var h = n >> 1;
    if (f32) {
      return Math.fround(Math.fround(Math.fround(s[h - 1]) + Math.fround(s[h])) / 2);
    }
    return (s[h - 1] + s[h]) / 2;
  };

  /* ------------------------------------------------------------------ *
   * np.bincount(list, weights, minlength)
   *
   * Weighted accumulation is a plain sequential float64 loop
   * (out[list[i]] += weights[i]), so the summation ORDER is the input
   * order - there is no pairwise reduction to reproduce. Unweighted
   * returns integer counts (Int32Array here; the reference's int64 counts
   * are bounded by the pixel count, < 4e6).
   * (numpy/_core/src/multiarray/compiled_base.c arr_bincount)
   * ------------------------------------------------------------------ */
  PF.bincount = function (list, weights, minlength) {
    var n = list.length, i, v;
    var len = (minlength === undefined || minlength === null) ? 0 : (minlength | 0);
    check(len >= 0, 'bincount: minlength must be non-negative');
    for (i = 0; i < n; i++) {
      v = list[i];
      check(v >= 0, 'bincount: negative index');
      check(v === Math.floor(v), 'bincount: non-integer index');
      if (v + 1 > len) len = v + 1;
    }
    if (weights === undefined || weights === null) {
      var cnt = new Int32Array(len);
      for (i = 0; i < n; i++) cnt[list[i]] += 1;
      return cnt;
    }
    checkLen(weights, n, 'bincount weights');
    var out = new Float64Array(len);
    for (i = 0; i < n; i++) out[list[i]] += weights[i];
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.unique
   *
   * Sorted unique values. return_index gives the FIRST occurrence (numpy
   * switches to a stable sort exactly for that case); return_inverse and
   * return_counts are tie-order independent, so they are exact regardless.
   * Returns {values, index, inverse, counts}; options not asked for are
   * null, mirroring numpy's tuple.
   * NaN: numpy (equal_nan=True) collapses every NaN into ONE trailing
   * entry - index = the first NaN's position, counts = how many, inverse
   * maps them all to that slot. A plain v !== prev would split them.
   * ------------------------------------------------------------------ */
  PF.unique = function (a, opts) {
    opts = opts || {};
    var n = a.length;
    var perm = PF.argsort(a, 'stable');
    var vals = [], firstIdx = [], counts = [];
    var inverse = opts.inverse ? new Int32Array(n) : null;
    var i, p, v, prev, k = -1;
    for (i = 0; i < n; i++) {
      p = perm[i];
      v = a[p];
      if (i === 0 || !(v === prev || (v !== v && prev !== prev))) {
        vals.push(v); firstIdx.push(p); counts.push(1); k++;
        prev = v;
      } else {
        counts[k] += 1;
        if (p < firstIdx[k]) firstIdx[k] = p;   // stable perm already gives
      }                                          // the min; kept as a guard
      if (inverse) inverse[p] = k;
    }
    var C = a.constructor;
    var out = {
      values: new C(vals.length), index: null, inverse: inverse, counts: null
    };
    for (i = 0; i < vals.length; i++) out.values[i] = vals[i];
    if (opts.index) {
      out.index = new Int32Array(firstIdx.length);
      for (i = 0; i < firstIdx.length; i++) out.index[i] = firstIdx[i];
    }
    if (opts.counts) {
      out.counts = new Int32Array(counts.length);
      for (i = 0; i < counts.length; i++) out.counts[i] = counts[i];
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.diff(a, n) - 1-D. Repeated subtraction, n times, in the input dtype
   * (float32 in, float32 rounding at every stage).
   * ------------------------------------------------------------------ */
  PF.diff = function (a, n) {
    if (n === undefined || n === null) n = 1;
    check(n >= 0 && n === Math.floor(n), 'diff: n must be a non-negative int');
    var cur = a, i, k, m, out;
    for (k = 0; k < n; k++) {
      m = cur.length > 0 ? cur.length - 1 : 0;
      out = new a.constructor(m);
      for (i = 0; i < m; i++) out[i] = cur[i + 1] - cur[i];
      cur = out;
    }
    return (cur === a) ? new a.constructor(a) : cur;
  };

  /* ------------------------------------------------------------------ *
   * np.interp(x, xp, fp)
   *
   * Clamps at both ends (left = fp[0], right = fp[-1]); an exact hit on a
   * knot returns that knot's fp verbatim rather than interpolating, and
   * the last knot has its own branch. Those three shortcuts are what make
   * it bit-exact - a naive slope formula differs in the last bits.
   * (numpy/_core/src/multiarray/compiled_base.c arr_interp)
   * ------------------------------------------------------------------ */
  function interpSearch(key, dx, len) {
    // returns j with dx[j] <= key < dx[j+1]; -1 below the range, len above
    if (key > dx[len - 1]) return len;
    if (key < dx[0]) return -1;
    var imin = 0, imax = len, imid;
    while (imin < imax) {
      imid = imin + ((imax - imin) >> 1);
      if (key >= dx[imid]) imin = imid + 1; else imax = imid;
    }
    return imin - 1;
  }

  function interpOne(x, dx, dy, lenxp, lval, rval) {
    if (x !== x) return x;                       // NaN in, NaN out
    var j = interpSearch(x, dx, lenxp);
    if (j === -1) return lval;
    if (j === lenxp) return rval;
    if (j === lenxp - 1) return dy[j];
    if (dx[j] === x) return dy[j];
    var slope = (dy[j + 1] - dy[j]) / (dx[j + 1] - dx[j]);
    var res = slope * (x - dx[j]) + dy[j];
    if (res !== res) {
      res = slope * (x - dx[j + 1]) + dy[j + 1];
      if (res !== res && dy[j] === dy[j + 1]) res = dy[j];
    }
    return res;
  }

  PF.interp = function (x, xp, fp, left, right) {
    var lenxp = xp.length;
    check(lenxp > 0, 'interp: xp is empty');
    checkLen(fp, lenxp, 'interp fp');
    var lval = (left === undefined || left === null) ? fp[0] : left;
    var rval = (right === undefined || right === null) ? fp[lenxp - 1] : right;
    if (typeof x === 'number') return interpOne(x, xp, fp, lenxp, lval, rval);
    var out = new Float64Array(x.length), i;
    for (i = 0; i < x.length; i++) {
      out[i] = interpOne(x[i], xp, fp, lenxp, lval, rval);
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.searchsorted(a, v, side)
   *   'left'  -> first i with a[i] >= v
   *   'right' -> first i with a[i] >  v
   * ------------------------------------------------------------------ */
  function ssOne(a, v, right) {
    var lo = 0, hi = a.length, mid;
    if (right) {
      while (lo < hi) {
        mid = (lo + hi) >> 1;
        if (a[mid] <= v) lo = mid + 1; else hi = mid;
      }
    } else {
      while (lo < hi) {
        mid = (lo + hi) >> 1;
        if (a[mid] < v) lo = mid + 1; else hi = mid;
      }
    }
    return lo;
  }

  PF.searchsorted = function (a, v, side) {
    check(side === undefined || side === 'left' || side === 'right',
      'searchsorted: side must be "left" or "right"');
    var right = (side === 'right');
    if (typeof v === 'number') return ssOne(a, v, right);
    var out = new Int32Array(v.length), i;
    for (i = 0; i < v.length; i++) out[i] = ssOne(a, v[i], right);
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.round / np.rint - ROUND HALF TO EVEN.
   * Math.round(0.5)=1, Math.round(2.5)=3, Math.round(-0.5)=-0; numpy gives
   * 0, 2 and -0. This changes answers wherever a step or a cut lands on
   * exactly x.5, which on an integer-pixel grid is common.
   * ------------------------------------------------------------------ */
  function rint(x) {
    if (!isFinite(x)) return x;
    var f = Math.floor(x);
    var d = x - f;
    var r;
    if (d < 0.5) r = f;
    else if (d > 0.5) r = f + 1;
    else r = (f % 2 === 0) ? f : f + 1;
    // preserve numpy's signed zero: np.rint(-0.4) is -0.0
    if (r === 0 && (x < 0 || Object.is(x, -0))) return -0;
    return r;
  }
  PF.rint = rint;

  PF.round = function (a) {
    if (typeof a === 'number') return rint(a);
    var out = new a.constructor(a.length), i;
    for (i = 0; i < a.length; i++) out[i] = rint(a[i]);
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.percentile(a, q) with the default method='linear'
   *
   * numpy 2.5: the virtual index is (n-1)*(q/100) computed in FLOAT64
   * regardless of the array dtype (percentile divides q by the Python int
   * 100, so the quantile is always a float64), but the final interpolation
   * runs in the ARRAY's dtype. And the lerp is asymmetric:
   *     gamma <  0.5 -> a + (b-a)*gamma
   *     gamma >= 0.5 -> b - (b-a)*(1-gamma)
   * which is not the same float as the first form.
   * gamma uses the CLAMPED previous index, so at q=100 it is n, not 0 -
   * harmless only because a == b there.
   * Pass dtype 'f4' for float32 inputs. MEASURED on fixtures/tiny.png:
   *   runlengths.py:70   'f4' - cv2.boxFilter of a float32 diff
   *   channels.py:98     'f8' - axis_profiles builds with np.zeros()
   *   channels.py:499    'f4' - MEASURED by reading: dmap comes from
   *                      _grad_maps over _flatten_channels (which does
   *                      rgba.astype(np.float32)) and every op down to
   *                      prof = seg.sum(axis=0) keeps float32.
   * NaN: numpy returns NaN when any element is NaN; so does this.
   * (numpy/lib/_function_base_impl.py _quantile / _get_indexes / _lerp)
   * ------------------------------------------------------------------ */
  PF.percentile = function (a, q, dtype) {
    var n = a.length;
    check(n > 0, 'percentile of an empty array');
    check(q >= 0 && q <= 100, 'percentile: q must be in [0, 100]');
    var f32 = (dtype === 'f4' || dtype === 'f32' || dtype === Float32Array);
    var R = f32 ? Math.fround : function (x) { return x; };
    var src = (a instanceof Float64Array || a instanceof Float32Array)
      ? a : PF.asArray(a, f32 ? 'f32' : 'f64');
    var i;
    for (i = 0; i < n; i++) if (src[i] !== src[i]) return src[i];   // NaN in -> NaN out (percentile)
    var s = PF.sorted(src);

    var q01 = q / 100;                 // float64, always
    var virt = (n - 1) * q01;          // float64, always
    var prev = Math.floor(virt);
    var next = prev + 1;
    if (virt >= n - 1) { prev = -1; next = -1; }
    if (virt < 0) { prev = 0; next = 0; }
    var gamma = virt - prev;           // float64, uses the CLAMPED index
    var av = s[prev < 0 ? n + prev : prev];
    var bv = s[next < 0 ? n + next : next];
    var d = R(bv - av);
    if (gamma >= 0.5) return R(bv - R(d * R(1 - gamma)));
    return R(av + R(d * R(gamma)));
  };

  /* ------------------------------------------------------------------ *
   * ndarray.sum() of a contiguous 1-D float array
   *
   * numpy's add.reduce hands the WHOLE array to one inner-loop call and
   * that loop is pairwise_sum (umath/loops_utils.h.src): straight
   * left-to-right below 8 elements, eight interleaved accumulators up to
   * 128, then recursive halving on a multiple-of-8 split. The accumulator
   * starts at the identity 0, not at a[0] (np.sum([-0.0]) is +0.0), and
   * there is NO chunking at the 8192-element buffer size.
   *   MEASURED (tools/probe-rl-semantics.py, numpy 2.5.3): "all-n pairwise"
   *   is bit-exact 6/6 at every n in {1..20000} tried for BOTH float32 and
   *   float64; "a0 + pairwise(rest)" and "chunk at 8192" are not.
   * float32 input is summed in float32 (every add rounded with fround),
   * because runlengths.py:174-177 does (w*k*k).sum() on float32 data and a
   * float64 accumulation drifts from it. Integer typed arrays are summed
   * exactly. pf-02-scipy.js carries a private float64 copy of the same
   * algorithm (pairwiseSum) that predates this one; they are the same code
   * path minus the rounding hook.
   * ------------------------------------------------------------------ */
  function pairwise(a, off, n, R) {
    var i, res;
    if (n < 8) {
      res = 0.0;
      for (i = 0; i < n; i++) res = R(res + a[off + i]);
      return res;
    }
    if (n <= 128) {
      var r0 = a[off], r1 = a[off + 1], r2 = a[off + 2], r3 = a[off + 3];
      var r4 = a[off + 4], r5 = a[off + 5], r6 = a[off + 6], r7 = a[off + 7];
      var end = n - (n % 8);
      for (i = 8; i < end; i += 8) {
        r0 = R(r0 + a[off + i]);
        r1 = R(r1 + a[off + i + 1]);
        r2 = R(r2 + a[off + i + 2]);
        r3 = R(r3 + a[off + i + 3]);
        r4 = R(r4 + a[off + i + 4]);
        r5 = R(r5 + a[off + i + 5]);
        r6 = R(r6 + a[off + i + 6]);
        r7 = R(r7 + a[off + i + 7]);
      }
      res = R(R(R(r0 + r1) + R(r2 + r3)) + R(R(r4 + r5) + R(r6 + r7)));
      for (; i < n; i++) res = R(res + a[off + i]);
      return res;
    }
    var n2 = (n / 2) | 0;
    n2 -= n2 % 8;
    return R(pairwise(a, off, n2, R) + pairwise(a, off + n2, n - n2, R));
  }
  function ident(x) { return x; }

  PF.sum = function (a) {
    var n = a.length, i, s;
    if (a instanceof Float32Array) return pairwise(a, 0, n, Math.fround);
    if (a instanceof Float64Array) return pairwise(a, 0, n, ident);
    // integer / bool data: numpy sums in int64, exact
    s = 0;
    for (i = 0; i < n; i++) s += a[i];
    return s;
  };
  PF.pairwiseSum = function (a, off, n, f32) {
    return pairwise(a, off, n, f32 ? Math.fround : ident);
  };

  PF.version = 'pf-00-base/2';
})();

/* ==== pf-01-fft.js ================================================ */
// pf-01-fft.js - numpy.fft workalike for real input.
//
// Ports the subset of numpy.fft that pixelfixer actually uses:
//
//   autocorr.band_acf      (lines 68-80)
//       F  = np.fft.rfft (x, nfft, axis=1)     x is 2-D (n_bands, n), float32
//       ac = np.fft.irfft(p, nfft, axis=1)     p is 2-D REAL, float32
//       nfft = 1 << ceil(log2(2n))             -> always a power of two
//
//   autocorr.band_cepstrum (lines 84-94)
//       F = np.fft.rfft (x, nfft, axis=1)      x is 2-D, float32
//       c = np.fft.irfft(logp, nfft)           logp is 1-D REAL, float32
//
//   channels._axis_spectrum (lines 588, 596)
//       sp    = np.abs(np.fft.rfft(seg)) ** 2  seg is 1-D float64, NO n= arg
//       freqs = np.fft.rfftfreq(win)
//       win   = int(min(W, 1024))
//
// >>> THE "EVERY CALL SITE PADS TO A POWER OF TWO" ASSUMPTION IS FALSE. <<<
// autocorr does pad to a power of two.  channels._axis_spectrum does not: its
// transform length is min(W, 1024) where W is a raw image dimension minus 1
// or 2 (dqx is (H, W-1), cox is (H, W-2)).  On the project fixtures that is
// 46, 47, 110, 111, 202 and 203 - 47 is prime, 203 = 7*29, 202 = 2*101.  A
// radix-2-only engine would be wrong for every image narrower than 1024px.
// So: radix-2 Cooley-Tukey for power-of-two lengths, Bluestein (chirp-z) for
// everything else, which is exact for arbitrary N including large primes.
//
// dtype policy: everything here is float64.  numpy 2.5 propagates float32 ->
// complex64 through np.fft (it does NOT upcast the result), so a caller that
// is reproducing a float32 call site must round this module's output with
// PF.f32 / PF.c64.  That rounding is the right emulation because numpy does
// the arithmetic in double and only narrows at the end - measured here:
//   rfft :  float32 result == float64 result cast to complex64, for
//           0 / 85,760 differing values over n in {8,16,17,32,47,64,101,128,
//           203,256,512,1024,2048,4096} x 20 trials.
//   irfft:  the same holds ONLY when n is a power of two.  For n = 17, 47,
//           101, 203 it differs in the last float32 bit, because numpy
//           applies the 1/n normalisation as float32(1/n) rather than
//           float64(1/n): rounding the double result of
//           (unscaled * float64(float32(1/n))) matches for 0 / 11,040 values.
//           Both pixelfixer irfft call sites use a power-of-two nfft, so this
//           only bites a caller that does not; PF.irfft's scaleF32 flag
//           reproduces it, and tools/test-fft.js group I measures the flag
//           against numpy float32 directly: 709 / 709 values bit-exact with
//           the flag on (n in {17,47,101,102,111,203} plus a 128 control),
//           and 6 / 6 non-power-of-two cases miss with it off.
// See tools/parity-fft.py, which prints these counts.
//
// Accuracy against numpy (pocketfft), measured by tools/test-fft.js:
//   float64 paths are NOT bit-exact and cannot be made so without porting
//   pocketfft itself: pocketfft factors n into radix 4/2/3/5/7/11 passes with
//   its own twiddle generation, while this file is radix-2 + Bluestein, so
//   the two round differently at the last bit.  Measured over 93,788 values:
//   max scale-relative error 1.1e-15 on rfft (about 5 ulp), 5.5e-16 on
//   irfft, and 18-27% of float64 values bit-identical.  rfftfreq is
//   bit-exact (12,156 / 12,156).  On the float32 call sites the float32
//   rounding absorbs that last-bit noise: rfft->complex64 and the cepstrum
//   irfft are 100% bit-exact on all six fixture-image cases, and the band_acf
//   irfft is 99.05% (23,131 / 23,352); the misses are bins within 3e-17 of
//   zero, where a float32 ulp is smaller than the float64 disagreement.
//
// No dependencies, no build step, browser + node.
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  var TWO_PI = 6.283185307179586;

  // ------------------------------------------------------------------ trig
  // cos(2*pi*r/M), sin(2*pi*r/M) with exact octant reduction.  r and M are
  // integers; M/2, M/4, M/8 and the differences below are all exactly
  // representable in binary floating point, so the reduction is lossless and
  // Math.cos/Math.sin only ever see an argument in [0, pi/4].  Building
  // twiddle tables straight from Math.cos(2*PI*k/n) instead loses accuracy as
  // k grows, which shows up as a larger delta against pocketfft.
  var _cs = 0.0, _sn = 0.0;
  function cs2pi(r, M) {
    r = r % M;
    if (r < 0) r += M;
    var sc = 1.0, ss = 1.0, swap = false;
    var h = M / 2, q = M / 4, e = M / 8;
    if (r > h) { r = M - r; ss = -ss; }        // cos(2pi-x)= cos x, sin = -sin
    if (r > q) { r = h - r; sc = -sc; }        // cos(pi -x)=-cos x, sin =  sin
    if (r > e) { r = q - r; swap = true; }     // cos(pi/2-x)=sin x, sin = cos
    var a = TWO_PI * r / M;
    var c = Math.cos(a), s = Math.sin(a);
    if (swap) { var t = c; c = s; s = t; }
    _cs = sc * c;
    _sn = ss * s;
  }

  // -------------------------------------------------- power-of-two engine
  var _p2 = new Map();       // n -> {c, s, rev}
  function p2tab(n) {
    var t = _p2.get(n);
    if (t !== undefined) return t;
    var half = n >> 1;
    var c = new Float64Array(half > 0 ? half : 1);
    var s = new Float64Array(half > 0 ? half : 1);
    for (var k = 0; k < half; k++) { cs2pi(k, n); c[k] = _cs; s[k] = _sn; }
    var bits = 0;
    while ((1 << bits) < n) bits++;
    var rev = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      var r = 0, x = i;
      for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    t = { c: c, s: s, rev: rev };
    _p2.set(n, t);
    return t;
  }

  // In-place complex FFT, n a power of two.  inverse=false uses e^{-2i pi jk/n}
  // (numpy forward convention); inverse=true uses e^{+2i pi jk/n} and is
  // UNNORMALISED - the caller divides by n.
  function fftP2(re, im, n, inverse) {
    if (n < 2) return;
    var t = p2tab(n), c = t.c, s = t.s, rev = t.rev;
    for (var i = 0; i < n; i++) {
      var j = rev[i];
      if (j > i) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var half = len >> 1, step = n / len;
      for (var base = 0; base < n; base += len) {
        var idx = 0;
        for (var k = 0; k < half; k++, idx += step) {
          var wr = c[idx], wi = inverse ? s[idx] : -s[idx];
          var a = base + k, bb = a + half;
          var xr0 = re[bb], xi0 = im[bb];
          var xr = xr0 * wr - xi0 * wi;
          var xi = xr0 * wi + xi0 * wr;
          re[bb] = re[a] - xr; im[bb] = im[a] - xi;
          re[a] = re[a] + xr;  im[a] = im[a] + xi;
        }
      }
    }
  }

  // ------------------------------------------------------ Bluestein engine
  // X_k = w_k * (a conv b)_k  with  a_j = x_j w_j,  b_m = conj(w_m),
  //       w_m = exp(sign * i pi m^2 / n),  sign = -1 forward, +1 inverse.
  // The linear convolution is done with a power-of-two cyclic FFT of length
  // M >= 2n-1, so there is no wraparound.  m*m is reduced mod 2n as an exact
  // integer before it reaches cs2pi, which keeps the chirp accurate for large n.
  var _bl = new Map();       // n*2 + (inverse?1:0) -> table
  function blTab(n, inverse) {
    var key = n * 2 + (inverse ? 1 : 0);
    var t = _bl.get(key);
    if (t !== undefined) return t;
    var M = 1;
    while (M < 2 * n - 1) M <<= 1;
    var M2 = 2 * n;
    var wr = new Float64Array(n), wi = new Float64Array(n);
    for (var m = 0; m < n; m++) {
      cs2pi((m * m) % M2, M2);
      wr[m] = _cs;
      wi[m] = inverse ? _sn : -_sn;
    }
    var Br = new Float64Array(M), Bi = new Float64Array(M);
    for (var i = 0; i < n; i++) {
      Br[i] = wr[i]; Bi[i] = -wi[i];                          // b_m = conj(w_m)
      if (i > 0) { Br[M - i] = wr[i]; Bi[M - i] = -wi[i]; }   // b_{-m} = b_m
    }
    fftP2(Br, Bi, M, false);
    t = { M: M, wr: wr, wi: wi, Br: Br, Bi: Bi };
    _bl.set(key, t);
    return t;
  }

  function fftBluestein(re, im, n, inverse) {
    var t = blTab(n, inverse), M = t.M, wr = t.wr, wi = t.wi;
    var ar = new Float64Array(M), ai = new Float64Array(M);
    for (var j = 0; j < n; j++) {
      var xr = re[j], xi = im[j], cr = wr[j], ci = wi[j];
      ar[j] = xr * cr - xi * ci;
      ai[j] = xr * ci + xi * cr;
    }
    fftP2(ar, ai, M, false);
    var Br = t.Br, Bi = t.Bi;
    for (var k = 0; k < M; k++) {
      var pr = ar[k] * Br[k] - ai[k] * Bi[k];
      var pi = ar[k] * Bi[k] + ai[k] * Br[k];
      ar[k] = pr; ai[k] = pi;
    }
    fftP2(ar, ai, M, true);
    var inv = 1.0 / M;
    for (var q = 0; q < n; q++) {
      var vr = ar[q] * inv, vi = ai[q] * inv;
      var gr = wr[q], gi = wi[q];
      re[q] = vr * gr - vi * gi;
      im[q] = vr * gi + vi * gr;
    }
  }

  function fftAny(re, im, n, inverse) {
    if (n < 2) return;
    if ((n & (n - 1)) === 0) fftP2(re, im, n, inverse);
    else fftBluestein(re, im, n, inverse);
  }

  // ------------------------------------------------- real-input half table
  // exp(-2i pi k/n) for k = 0..n/2, cached per n.
  var _htw = new Map();
  function htw(n) {
    var t = _htw.get(n);
    if (t !== undefined) return t;
    var m = (n >> 1) + 1;
    var c = new Float64Array(m), s = new Float64Array(m);
    for (var k = 0; k < m; k++) { cs2pi(k, n); c[k] = _cs; s[k] = -_sn; }
    t = { c: c, s: s };
    _htw.set(n, t);
    return t;
  }

  // ---------------------------------------------------------- core rfft
  // Writes bins 0..n/2 of the length-n DFT of the real sequence src[0..len),
  // zero-padded or truncated to n - exactly the numpy n= semantics.
  function rfftInto(src, len, n, outRe, outIm) {
    var nb = (n >> 1) + 1, k, i;
    if (n === 1) {
      outRe[0] = len > 0 ? src[0] : 0;
      outIm[0] = 0;
      return;
    }
    if ((n & 1) === 1) {
      // odd length: no half-size shortcut, run the full complex transform
      var re = new Float64Array(n), im = new Float64Array(n);
      var lim = len < n ? len : n;
      for (i = 0; i < lim; i++) re[i] = src[i];
      fftAny(re, im, n, false);
      for (k = 0; k < nb; k++) { outRe[k] = re[k]; outIm[k] = im[k]; }
      return;
    }
    // even length: pack into n/2 complex points, one half-size FFT, untangle.
    //   E_k = (Z_k + conj(Z_{m-k})) / 2
    //   O_k = -i (Z_k - conj(Z_{m-k})) / 2
    //   X_k = E_k + exp(-2i pi k/n) O_k       k = 0..m   (Z_m := Z_0)
    var m = n >> 1;
    var zr = new Float64Array(m), zi = new Float64Array(m);
    var lim2 = len < n ? len : n;
    for (var j = 0; j < m; j++) {
      var ei = 2 * j, oi = ei + 1;
      zr[j] = ei < lim2 ? src[ei] : 0;
      zi[j] = oi < lim2 ? src[oi] : 0;
    }
    fftAny(zr, zi, m, false);
    var tw = htw(n), tc = tw.c, ts = tw.s;
    for (k = 0; k <= m; k++) {
      var k1 = k % m, k2 = (m - k) % m;
      var ar = zr[k1], ai = zi[k1];
      var br = zr[k2], bi = zi[k2];
      var sr = ar + br, si = ai - bi;          // Z_k + conj(Z_{m-k})
      var dr = ar - br, di = ai + bi;          // Z_k - conj(Z_{m-k})
      var er = 0.5 * sr, eim = 0.5 * si;
      var orr = 0.5 * di, oim = -0.5 * dr;     // -i/2 * D
      var wr = tc[k], wi = ts[k];
      outRe[k] = er + (orr * wr - oim * wi);
      outIm[k] = eim + (orr * wi + oim * wr);
    }
  }

  // ---------------------------------------------------------- core irfft
  // Rebuilds the Hermitian spectrum and runs one inverse complex transform.
  // Matches numpy: the input is cropped or zero-padded to n/2+1 bins, and the
  // imaginary parts of DC and (for even n) Nyquist are DISCARDED, not used.
  function irfftInto(reIn, imIn, mIn, n, out, scaleF32) {
    var cr = new Float64Array(n), ci = new Float64Array(n);
    var nb = (n >> 1) + 1;
    for (var k = 0; k < nb; k++) {
      var vr = 0.0, vi = 0.0;
      if (k < mIn) {
        vr = reIn[k];
        vi = imIn ? imIn[k] : 0.0;
      }
      if (k === 0 || k + k === n) vi = 0.0;
      cr[k] = vr; ci[k] = vi;
      var j = n - k;
      if (k > 0 && j !== k) { cr[j] = vr; ci[j] = -vi; }
    }
    fftAny(cr, ci, n, true);
    // numpy applies the 1/n normalisation at the OUTPUT dtype's precision:
    // measured, np.fft.irfft(float32) == (float64 unscaled result) *
    // float64(float32(1/n)) rounded to float32, with 0/11040 values differing
    // over n in {17,47,101,203} x 30 trials.  For a power-of-two n (which is
    // what both pixelfixer irfft call sites use) float32(1/n) == 1/n exactly,
    // so this only matters if a float32 caller ever passes a non-power-of-two.
    var inv = scaleF32 ? Math.fround(1.0 / n) : 1.0 / n;
    for (var i = 0; i < n; i++) out[i] = cr[i] * inv;
  }

  function checkN(n) {
    if (!(n >= 1) || (n | 0) !== n) {
      throw new Error('Invalid number of FFT data points (' + n + ') specified.');
    }
  }

  // ------------------------------------------------------------- public
  // PF.rfft(x[, n]) == np.fft.rfft(x, n)   for 1-D real x.
  // Returns {re, im, length, n}: length = n/2+1 output bins, n = transform size.
  PF.rfft = function (x, n) {
    var len = x.length;
    var N = (n === undefined || n === null) ? len : n;
    checkN(N);
    var nb = (N >> 1) + 1;
    var re = new Float64Array(nb), im = new Float64Array(nb);
    rfftInto(x, len, N, re, im);
    return { re: re, im: im, length: nb, n: N };
  };

  // PF.irfft(re, im[, n]) == np.fft.irfft(re + 1j*im, n)  for 1-D input.
  // `im` may be null/undefined for a real spectrum (both pixelfixer call
  // sites pass a real array).  Default n = 2*(len(re) - 1), as in numpy.
  // Pass scaleF32=true only when emulating a float32 call site with a
  // non-power-of-two n (see irfftInto).
  PF.irfft = function (re, im, n, scaleF32) {
    var m = re.length;
    var N = (n === undefined || n === null) ? 2 * (m - 1) : n;
    checkN(N);
    var out = new Float64Array(N);
    irfftInto(re, im, m, N, out, scaleF32);
    return out;
  };

  // PF.rfftfreq(n[, d]) == np.fft.rfftfreq(n, d).
  // numpy computes `arange(n//2+1) * (1/(n*d))`; the multiply-by-reciprocal
  // form is reproduced exactly so the values are bit-identical, which
  // i/(n*d) would not be.
  PF.rfftfreq = function (n, d) {
    if (d === undefined || d === null) d = 1.0;
    checkN(n);
    var nb = (n >> 1) + 1;
    var out = new Float64Array(nb);
    var val = 1.0 / (n * d);
    for (var i = 0; i < nb; i++) out[i] = i * val;
    return out;
  };

  // PF.rfftRows(x, rows, cols[, n]) == np.fft.rfft(X, n, axis=1) where X is
  // the C-contiguous (rows, cols) real array held flat in x.  numpy axis=1 on
  // a C-contiguous 2-D array is exactly the 1-D transform of each row, which
  // the parity fixture checks rather than assumes.
  // Returns {re, im, rows, cols, n} with re/im flat, row-major, (rows, n/2+1).
  PF.rfftRows = function (x, rows, cols, n) {
    var N = (n === undefined || n === null) ? cols : n;
    checkN(N);
    var nb = (N >> 1) + 1;
    var re = new Float64Array(rows * nb), im = new Float64Array(rows * nb);
    var rr = new Float64Array(nb), ri = new Float64Array(nb);
    var row = new Float64Array(cols);
    for (var r = 0; r < rows; r++) {
      var off = r * cols;
      for (var i = 0; i < cols; i++) row[i] = x[off + i];
      rfftInto(row, cols, N, rr, ri);
      re.set(rr, r * nb);
      im.set(ri, r * nb);
    }
    return { re: re, im: im, rows: rows, cols: nb, n: N };
  };

  // PF.irfftRows(re, im, rows, cols[, n]) == np.fft.irfft(A, n, axis=1) for a
  // C-contiguous (rows, cols) complex array.  `im` may be null for real input
  // (this is the band_acf case: p is real).
  // Returns {data, rows, cols} with data flat, row-major, (rows, n).
  PF.irfftRows = function (re, im, rows, cols, n, scaleF32) {
    var N = (n === undefined || n === null) ? 2 * (cols - 1) : n;
    checkN(N);
    var out = new Float64Array(rows * N);
    var rr = new Float64Array(cols), ri = im ? new Float64Array(cols) : null;
    var tmp = new Float64Array(N);
    for (var r = 0; r < rows; r++) {
      var off = r * cols;
      for (var i = 0; i < cols; i++) {
        rr[i] = re[off + i];
        if (ri) ri[i] = im[off + i];
      }
      irfftInto(rr, ri, cols, N, tmp, scaleF32);
      out.set(tmp, r * N);
    }
    return { data: out, rows: rows, cols: N };
  };

  // numpy 2.5 keeps float32 through np.fft (float32 -> complex64).  These
  // round a float64 result down to that precision so a float32 call site can
  // be reproduced; see the header note.
  PF.f32 = function (a) {
    var out = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = Math.fround(a[i]);
    return out;
  };
  PF.c64 = function (spec) {
    return {
      re: PF.f32(spec.re), im: PF.f32(spec.im),
      length: spec.length, n: spec.n, rows: spec.rows, cols: spec.cols
    };
  };
})();

/* ==== pf-02-scipy.js ============================================== */
/* pf-02-scipy.js -- dependency-free ports of the four scipy routines that
 * pixelfixer actually uses.  No imports, no build step: browser + node.
 *
 *   PF.gaussian_filter1d   scipy.ndimage.gaussian_filter1d
 *   PF.maximum_filter1d    scipy.ndimage.maximum_filter1d
 *   PF.median_filter       scipy.ndimage.median_filter   (1-D only)
 *   PF.find_peaks          scipy.signal.find_peaks       (height + distance)
 *
 * SCOPE IS DELIBERATELY NARROW.  Every call site in
 * pixel-art-fixer/python/pixelfixer was grepped; these are all of them:
 *
 *   channels.py:116  maximum_filter1d(norm, size=p)          p in (3, 5, 7)
 *   channels.py:117  gaussian_filter1d(v, sigma=0.6)
 *   channels.py:433  gaussian_filter1d(_normalise(profile), sigma=0.6)
 *   channels.py:844  gaussian_filter1d(_normalise(profile), sigma=0.6)
 *   channels.py:1036 gaussian_filter1d(_normalise(profile), sigma=0.6)
 *   channels.py:1109 gaussian_filter1d(_normalise(profile), sigma=0.6)
 *   channels.py:1196 gaussian_filter1d(_normalise(bp), 0.8)
 *   channels.py:606  median_filter(power, size=k, mode="nearest")   k odd >= 5
 *   varcontrast:395  median_filter(cs, size=15, mode="nearest")
 *   channels.py:210  find_peaks(norm[1:-1], height=0.12, distance=...)
 *   channels.py:250  find_peaks(norm[1:-1], height=0.15, distance=...)
 *   channels.py:304  find_peaks(norm[1:-1], height=h,    distance=2)
 *   channels.py:503  find_peaks(norm,       height=0.2,  distance=2)
 *   channels.py:633  find_peaks(resid,      height=4.0)
 *   channels.py:700  find_peaks(norm[1:-1], height=0.15, distance=2)
 *   channels.py:987  find_peaks(norm[1:-1], height=0.15, distance=...)
 *
 * So: order=0 / mode='reflect' / truncate=4.0 for the gaussian, mode='reflect'
 * + origin=0 for the maximum filter, odd size + mode='nearest' + origin=0 for
 * the median filter, and height + distance ONLY for find_peaks.  scipy's
 * threshold / prominence / width / wlen / rel_height / plateau_size are never
 * used, so they are not implemented -- passing one throws rather than being
 * quietly ignored.
 *
 * FLOAT POLICY -- float64 everywhere, which is what the reference does:
 *   - The profiles are float64: channels.axis_profiles() allocates with
 *     np.zeros(w + 1) (float64) and assigns the float32 gradient sums into it,
 *     which upcasts.  _normalise() preserves that dtype.
 *   - scipy.ndimage's C filters accumulate in `double` regardless of input.
 *   - scipy.signal.find_peaks starts with `x = _arg_x_as_expected(x)`, i.e.
 *     np.asarray(x, dtype=np.float64) -- so even the one float32 caller
 *     (channels._tile_peaks, whose dmaps are float32) is compared in float64.
 *     A Float32Array passed here is widened losslessly, same as numpy.
 * Bit-exact parity is achieved by matching scipy's *summation order*, not just
 * its formula -- see ndCorrelate1d below -- and, for find_peaks, by
 * reproducing the tie order of the exact np.argsort kernel this machine's
 * numpy build dispatches to -- see "numpy argsort" below.
 *
 * MEASURED PARITY vs scipy 1.18.1 / numpy 2.5.3 / python 3.12.10:
 *   tools/parity-scipy.py dumps the fixtures, tools/test-scipy.js checks them
 *   on the raw little-endian float64 BYTES (a 1-ulp drift is a failure) and
 *   prints the counts.  The test is the authority; this is the 2026-09-09
 *   run of it, copied here so a reader of this file sees the shape of it:
 *
 *     gaussian_filter1d                       228/228   bit-exact
 *     maximum_filter1d                        171/171   bit-exact
 *     median_filter                           171/171   bit-exact
 *     find_peaks [peaks]                     2124/2124  bit-exact
 *       of which real-image profiles           840/840
 *       of which manufactured tie traps        800/800  (819 cases have equal
 *                                              heights within `distance`;
 *                                              in 793 of them a different tie
 *                                              rule changes the answer)
 *     find_peaks [peak_heights]              2124/2124  bit-exact
 *     np.argsort (dispatched kernel)         1155/1155  exact permutations
 *     np.argsort with X86_V3 disabled         270/270   exact, vs the portable
 *                                                       introsort kept as control
 *   Controls that MUST fail, and did: gaussian accumulation folded inner->outer
 *   (22/228) and unfolded (10/228); tie rules "stable ascending" (1239/1950),
 *   "stable descending" (1182/1950), portable introsort (1196/1950); the
 *   portable introsort against the dispatched kernel (96/1155).
 *   One-line mutants of the emulation are caught by the gate: swapping index
 *   pairs on tied keys (741 find_peaks cases move), an unstable insertion sort
 *   in the std::sort fallback (19 argsort cases move, all on the fallback
 *   path), and removing the is_sorted early exit (56 argsort cases move).
 *   NOT exercised by any fixture: the heapsort branch inside the std::sort
 *   fallback (its depth budget is never exhausted); that transcription is
 *   unverified and the test says so on every run.
 */
(function () {
    'use strict';
    var PF = globalThis.PF || (globalThis.PF = {});

    var DBL_EPSILON = 2.220446049250313e-16;

    // --------------------------------------------------------------- helpers

    /* np.asarray(x, dtype=np.float64): widen without copying when already f64. */
    function asF64(x, what) {
        if (x instanceof Float64Array) return x;
        if (x instanceof Float32Array || Array.isArray(x) ||
            (x && typeof x.length === 'number')) {
            return Float64Array.from(x);
        }
        throw new TypeError(what + ' must be an array-like of numbers');
    }

    function requireOpts(opts, allowed, fnName) {
        if (opts === undefined || opts === null) return {};
        if (typeof opts !== 'object') {
            throw new TypeError(fnName + ': options must be an object');
        }
        var keys = Object.keys(opts);
        for (var i = 0; i < keys.length; i++) {
            if (allowed.indexOf(keys[i]) < 0) {
                throw new Error(
                    fnName + ': unsupported option "' + keys[i] + '". This is a ' +
                    'deliberately narrow port; only [' + allowed.join(', ') +
                    '] are implemented because those are the only ones any ' +
                    'pixelfixer call site uses. Port the missing behaviour ' +
                    'against scipy rather than assuming a default.');
            }
        }
        return opts;
    }

    /* scipy.ndimage mode='reflect' -- (d c b a | a b c d | d c b a), i.e.
     * symmetric about the outer edge of the first/last sample.  Written for
     * arbitrary |i| so a filter wider than the line still works, exactly as
     * NI_ExtendLine does. */
    function reflectIndex(i, n) {
        if (i >= 0 && i < n) return i;
        var p = 2 * n;
        var m = i % p;
        if (m < 0) m += p;
        return m < n ? m : p - 1 - m;
    }

    /* scipy.ndimage mode='nearest' -- (a a a a | a b c d | d d d d). */
    function nearestIndex(i, n) {
        return i < 0 ? 0 : (i >= n ? n - 1 : i);
    }

    /* numpy's pairwise summation (umath/loops.c.src DOUBLE_pairwise_sum), used
     * by ndarray.sum().  For the kernel sizes we actually see (5 for sigma=0.6,
     * 7 for sigma=0.8) this is the n<8 straight left-to-right branch, but the
     * full algorithm is here so any sigma normalises identically. */
    var PW_BLOCKSIZE = 128;
    function pairwiseSum(a, off, n) {
        var i, res;
        if (n < 8) {
            res = 0.0;
            for (i = 0; i < n; i++) res += a[off + i];
            return res;
        }
        if (n <= PW_BLOCKSIZE) {
            var r0 = a[off], r1 = a[off + 1], r2 = a[off + 2], r3 = a[off + 3];
            var r4 = a[off + 4], r5 = a[off + 5], r6 = a[off + 6], r7 = a[off + 7];
            var end = n - (n % 8);
            for (i = 8; i < end; i += 8) {
                r0 += a[off + i];
                r1 += a[off + i + 1];
                r2 += a[off + i + 2];
                r3 += a[off + i + 3];
                r4 += a[off + i + 4];
                r5 += a[off + i + 5];
                r6 += a[off + i + 6];
                r7 += a[off + i + 7];
            }
            res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
            for (; i < n; i++) res += a[off + i];
            return res;
        }
        var n2 = (n / 2) | 0;
        n2 -= n2 % 8;
        return pairwiseSum(a, off, n2) + pairwiseSum(a, off + n2, n - n2);
    }

    // ------------------------------------------------------- correlate1d

    /* scipy.ndimage.correlate1d, 1-D, restricted to the modes we need.
     *
     * ni_filters.c NI_Correlate1D tests the kernel for symmetry and, when it is
     * symmetric, FOLDS the accumulation onto mirrored pairs:
     *
     *     ss = iline[ll] * fw[0];
     *     for (jj = -size1; jj < 0; jj++)
     *         ss += (iline[ll + jj] + iline[ll - jj]) * fw[-jj];
     *
     * Two things there decide the last two bits of every output sample, and
     * both were MEASURED against scipy 1.18.1 rather than assumed:
     *
     *  1. Folded vs. flat.  (a+b)*w does not round like a*w + b*w.
     *  2. Direction.  jj runs from -size1 up to -1, so fw[-jj] runs from the
     *     OUTERMOST tap inward, not from the centre out.
     *
     * tools/test-scipy.js runs all three candidate orders over every gaussian
     * fixture and prints the counts; the two wrong orders are kept reachable
     * via `accum` precisely so that claim has a live instrument instead of
     * being a sentence in a comment, and the test REQUIRES them to fail.
     *
     * A gaussian kernel of order 0 is symmetric to the bit -- exp(-c*x*x) is
     * even, and both halves are divided by the same sum -- so the folded branch
     * is the only one production ever takes.  The flat branch has NO fixture
     * behind it, so it is reachable only by an explicit `accum` override from
     * the test; an asymmetric kernel arriving here throws instead of quietly
     * taking an unverified path. */
    function ndCorrelate1d(input, weights, mode, origin, accum) {
        var n = input.length;
        var fs = weights.length;
        if (fs < 1) throw new Error('correlate1d: empty weights');
        var size1 = (fs / 2) | 0;
        var size2 = fs - size1 - 1;
        if (origin) throw new Error('correlate1d: only origin=0 is implemented');

        var symmetric = 0;
        if (fs & 1) {
            symmetric = 1;
            for (var ii = 1; ii <= size1; ii++) {
                if (Math.abs(weights[ii + size1] - weights[size1 - ii]) > DBL_EPSILON) {
                    symmetric = 0;
                    break;
                }
            }
        }

        accum = accum || 'auto';
        if (accum === 'auto') {
            if (!symmetric) {
                throw new Error('correlate1d: only symmetric kernels are ' +
                    'implemented. scipy takes a different (flat) accumulation ' +
                    'for asymmetric kernels which no pixelfixer call site ever ' +
                    'reaches, so there is no fixture proving a port of it.');
            }
            accum = 'fold_out_in';
        }

        var ext = mode === 'reflect' ? reflectIndex
            : (mode === 'nearest' ? nearestIndex : null);
        if (!ext) throw new Error('correlate1d: unsupported mode "' + mode + '"');

        var out = new Float64Array(n);
        var ll, jj, ss;
        if (accum === 'fold_out_in') {           // scipy's real order
            for (ll = 0; ll < n; ll++) {
                ss = input[ll] * weights[size1];
                for (jj = size1; jj >= 1; jj--) {
                    ss += (input[ext(ll + jj, n)] + input[ext(ll - jj, n)]) *
                        weights[size1 + jj];
                }
                out[ll] = ss;
            }
        } else if (accum === 'fold_in_out') {    // test-only: the wrong direction
            for (ll = 0; ll < n; ll++) {
                ss = input[ll] * weights[size1];
                for (jj = 1; jj <= size1; jj++) {
                    ss += (input[ext(ll + jj, n)] + input[ext(ll - jj, n)]) *
                        weights[size1 + jj];
                }
                out[ll] = ss;
            }
        } else if (accum === 'flat') {           // test-only: unfolded
            for (ll = 0; ll < n; ll++) {
                ss = 0.0;
                for (jj = -size1; jj <= size2; jj++) {
                    ss += input[ext(ll + jj, n)] * weights[size1 + jj];
                }
                out[ll] = ss;
            }
        } else {
            throw new Error('correlate1d: unknown accum "' + accum + '"');
        }
        return out;
    }

    // -------------------------------------------------- gaussian_filter1d

    /* scipy.ndimage._filters._gaussian_kernel1d for order == 0:
     *     x     = arange(-radius, radius + 1)          (exact integers)
     *     phi_x = exp(-0.5 / sigma**2 * x**2)
     *     phi_x = phi_x / phi_x.sum()
     * The scalar (-0.5 / sigma2) is formed first and then multiplied by the
     * exact integer x*x, so the operation order below matches numpy's.
     * Math.exp vs numpy's exp is a genuine hazard (different libm-class
     * implementations can differ by an ulp); it is covered because every
     * gaussian fixture compares the FILTERED output bit-for-bit, and the
     * five/seven weights feed every sample of it. */
    function gaussianKernel1d(sigma, radius) {
        var size = 2 * radius + 1;
        var w = new Float64Array(size);
        var sigma2 = sigma * sigma;
        var c = -0.5 / sigma2;
        for (var k = 0; k < size; k++) {
            var x = k - radius;
            w[k] = Math.exp(c * (x * x));
        }
        var s = pairwiseSum(w, 0, size);
        for (var j = 0; j < size; j++) w[j] = w[j] / s;
        return w;
    }

    /* gaussian_filter1d(input, sigma, mode='reflect', truncate=4.0, order=0).
     *
     * radius = int(truncate * sigma + 0.5) -- Python int() truncates toward
     * zero, so sigma=0.6 -> int(2.9) = 2 (kernel size 5) and sigma=0.8 ->
     * int(3.7) = 3 (kernel size 7).  Both call-site sigmas land on the "just
     * below the next integer" side of that, which is exactly the kind of thing
     * a re-derived formula gets wrong. */
    PF.gaussian_filter1d = function gaussian_filter1d(input, sigma, opts) {
        opts = requireOpts(opts, ['mode', 'truncate', 'order', 'radius', 'accum'],
            'PF.gaussian_filter1d');
        var mode = opts.mode === undefined ? 'reflect' : opts.mode;
        var truncate = opts.truncate === undefined ? 4.0 : opts.truncate;
        var order = opts.order === undefined ? 0 : opts.order;
        if (mode !== 'reflect') {
            throw new Error('PF.gaussian_filter1d: only mode="reflect" is ' +
                'implemented (scipy\'s default, and the only one any call ' +
                'site uses); got "' + mode + '"');
        }
        if (order !== 0) {
            throw new Error('PF.gaussian_filter1d: only order=0 is implemented; ' +
                'derivative kernels are never used by pixelfixer');
        }
        var x = asF64(input, 'PF.gaussian_filter1d: input');
        var sd = +sigma;
        if (!(sd > 0)) {
            throw new Error('PF.gaussian_filter1d: sigma must be > 0, got ' + sigma);
        }
        var lw = opts.radius === undefined || opts.radius === null
            ? Math.trunc(truncate * sd + 0.5) : opts.radius;
        if (!Number.isInteger(lw) || lw < 0) {
            throw new Error('PF.gaussian_filter1d: radius must be a ' +
                'nonnegative integer, got ' + lw);
        }
        if (x.length === 0) return new Float64Array(0);
        var w = gaussianKernel1d(sd, lw);
        // scipy reverses the kernel because it calls correlate, not convolve.
        // A no-op for order 0, replicated anyway so the code says what scipy says.
        var rw = new Float64Array(w.length);
        for (var i = 0; i < w.length; i++) rw[i] = w[w.length - 1 - i];
        return ndCorrelate1d(x, rw, mode, 0, opts.accum);
    };

    // --------------------------------------------------- maximum_filter1d

    /* maximum_filter1d(input, size, mode='reflect', origin=0).
     * NI_MinOrMaxFilter1D splits the window as size1 = size / 2 (C integer
     * division) and size2 = size - size1 - 1, and scans [i-size1, i+size2].
     * For the sizes actually used (3, 5, 7) that is a symmetric radius of
     * 1, 2, 3.  Max over a set is order-independent, so this is exact. */
    PF.maximum_filter1d = function maximum_filter1d(input, size, opts) {
        opts = requireOpts(opts, ['mode', 'origin'], 'PF.maximum_filter1d');
        var mode = opts.mode === undefined ? 'reflect' : opts.mode;
        var origin = opts.origin === undefined ? 0 : opts.origin;
        if (mode !== 'reflect') {
            throw new Error('PF.maximum_filter1d: only mode="reflect" is ' +
                'implemented; got "' + mode + '"');
        }
        if (origin !== 0) {
            throw new Error('PF.maximum_filter1d: only origin=0 is implemented');
        }
        if (!Number.isInteger(size) || size < 1) {
            throw new Error('PF.maximum_filter1d: size must be a positive ' +
                'integer, got ' + size);
        }
        var x = asF64(input, 'PF.maximum_filter1d: input');
        var n = x.length;
        var out = new Float64Array(n);
        if (n === 0) return out;
        var size1 = (size / 2) | 0;
        var size2 = size - size1 - 1;
        for (var i = 0; i < n; i++) {
            var val = x[i];
            for (var jj = -size1; jj <= size2; jj++) {
                var t = x[reflectIndex(i + jj, n)];
                if (t > val) val = t;
            }
            out[i] = val;
        }
        return out;
    };

    // ------------------------------------------------------- median_filter

    /* median_filter(input, size=k, mode='nearest', origin=0), 1-D, k odd.
     * scipy routes this through _rank_filter with rank = size // 2, which
     * selects an element that is already in the window -- no arithmetic, so
     * the result is bit-exact by construction once the window is right.
     * Both call sites force an odd size, so an even size throws rather than
     * silently picking one of the two plausible centrings. */
    PF.median_filter = function median_filter(input, size, opts) {
        opts = requireOpts(opts, ['mode', 'origin'], 'PF.median_filter');
        if (!opts || opts.mode === undefined) {
            throw new Error('PF.median_filter: mode must be given explicitly. ' +
                'scipy defaults to "reflect" but every pixelfixer call site ' +
                'passes mode="nearest"; requiring it here stops a silent ' +
                'default mismatch.');
        }
        var mode = opts.mode;
        var origin = opts.origin === undefined ? 0 : opts.origin;
        if (mode !== 'nearest') {
            throw new Error('PF.median_filter: only mode="nearest" is ' +
                'implemented (the only mode any call site uses); got "' +
                mode + '"');
        }
        if (origin !== 0) {
            throw new Error('PF.median_filter: only origin=0 is implemented');
        }
        if (!Number.isInteger(size) || size < 1 || (size % 2) === 0) {
            throw new Error('PF.median_filter: size must be a positive ODD ' +
                'integer (both call sites force one), got ' + size);
        }
        var x = asF64(input, 'PF.median_filter: input');
        var n = x.length;
        var out = new Float64Array(n);
        if (n === 0) return out;
        var half = (size / 2) | 0;          // == rank, and == the window radius
        var buf = new Float64Array(size);
        for (var i = 0; i < n; i++) {
            for (var j = 0; j < size; j++) {
                buf[j] = x[nearestIndex(i - half + j, n)];
            }
            // full sort: size is small (5..21) and this is not the hot path
            buf.sort();
            out[i] = buf[half];
        }
        return out;
    };

    // ---------------------------------------------------- numpy argsort
    //
    // find_peaks' distance filter ranks peaks with np.argsort(x[peaks]) and
    // visits them highest-first; when two EXACTLY equal heights sit closer
    // than `distance`, whichever one the sort puts LATER survives.  Equal
    // heights are not exotic here: _normalise() clips the profile at 1.5, so a
    // saturated profile carries many peaks at exactly 1.5.  np.argsort's
    // default kind is unstable, so scipy's own answer on ties is whatever the
    // numpy build's sort kernel does -- a build-specific fact, MEASURED on the
    // reference venv (numpy 2.5.3 win_amd64 wheel, python 3.12.10):
    //
    //   np._core._multiarray_umath.__cpu_dispatch__ == ['X86_V3'],
    //   __cpu_baseline__ == ['X86_V2'].  numpy v2.5.3's
    //   numpy/_core/meson.build builds x86_simd_argsort.dispatch.cpp for
    //   [X86_V4, X86_V3]; only V3 is in this wheel, so a float64 argsort runs
    //   x86simdsortStatic::argsort(arr, arg, n, /*hasnan=*/true) compiled
    //   under __AVX2__, i.e. x86-simd-sort's avx2_argsort<double> (numpy's
    //   vendored submodule, commit fa944efbea1a33426b3f8a9a21e23794ab8aa300).
    //   Fingerprint: np.argsort([1.5,0.9,1.5,1.5,0.9,1.5,0.3]) is
    //   [6,1,4,0,3,2,5] -- unstable at n=7, where numpy's portable introsort
    //   would degenerate to a stable insertion sort -- while every all-equal
    //   array comes back as the identity (that kernel's is_sorted early exit).
    //
    // argsortXssAvx2 is a scalar emulation of exactly that kernel, transcribed
    // from the vendored sources (file:function named at each piece).  It is
    // measured permutation-for-permutation against np.argsort on tie-heavy
    // inputs by tools/test-scipy.js.  numpy's portable introsort -- what runs
    // when no SIMD kernel is dispatched -- is kept below ONLY as a control:
    // it sorts correctly but orders ties differently, and the test asserts
    // that it DOES disagree, which is what proves the tally can say "no".

    /* --- x86-simd-sort AVX2 float64 argsort, emulated lane by lane ---
     *
     * A 256-bit register is a plain 4-element JS array; element i is lane i
     * (Intel's _mm256_set_pd(v1,v2,v3,v4) puts v4 in lane 0, and
     * i64gather(arr, ind) = set(arr[ind[3]], .., arr[ind[0]]) so lane i holds
     * arr[ind[i]]: natural order).  Intrinsic semantics relied on:
     *   _mm256_min_pd(a, b)  = (a < b) ? a : b     (both-zero or NaN -> b)
     *   _mm256_max_pd(a, b)  = (a > b) ? a : b
     *   _mm256_cmp_pd(x, y, _CMP_EQ_OQ) = (x == y), IEEE: -0 == +0
     *   _mm256_cmp_pd(x, y, _CMP_GE_OQ) = (x >= y)
     * NaN never reaches the kernel (hasnan=true makes xss_argsort fall back to
     * std::sort for arrays containing one); this port throws instead. */

    var XSS_PAD = -1;   // stands in for the uint64-max index that fills unused lanes

    // avx2-64bit-qsort.hpp: avx2_64bit_swizzle_ops
    function xssSwap2(v) { return [v[1], v[0], v[3], v[2]]; }   // swap_n<2>: permute4x64 0b10110001
    function xssSwap4(v) { return [v[2], v[3], v[0], v[1]]; }   // swap_n<4>: permute4x64 0b01001110
    function xssRev4(v)  { return [v[3], v[2], v[1], v[0]]; }   // reverse:   permute4x64 SHUFFLE_MASK(0,1,2,3)

    // avx2-emu-funcs.hpp: convert_int_to_avx2_mask_64bit -- bit j -> lane j
    var XSS_MASK_A = [false, true, false, true];   // 0xA
    var XSS_MASK_C = [false, false, true, true];   // 0xC

    /* xss-network-keyvaluesort.hpp: cmp_merge<vtype1, vtype2>(in1, in2, idx1&, idx2, mask)
     *   tmp  = mask ? max(in2, in1) : min(in2, in1)       per lane
     *   idx1 = (tmp == in1) ? idx1 : idx2
     *   in1  = tmp
     * Ties keep their own index (tmp == in1 holds whichever operand min/max
     * picked). k1 and i1 are modified in place. */
    function xssCmpMergeKV(k1, k2, i1, i2, mask) {
        for (var l = 0; l < 4; l++) {
            var a = k2[l], b = k1[l];           // (in2, in1) argument order
            var t = mask[l] ? (a > b ? a : b) : (a < b ? a : b);
            if (!(t === b)) i1[l] = i2[l];
            k1[l] = t;
        }
    }

    /* xss-network-keyvaluesort.hpp: COEX<vtype1, vtype2>(key1&, key2&, idx1&, idx2&)
     *   key_t1 = min(key1, key2); key_t2 = max(key1, key2)
     *   eq     = (key_t1 == key1)
     *   idx1   = eq ? idx1 : idx2;  idx2 = eq ? idx2 : idx1
     * i.e. the pair swaps iff key1 > key2 strictly; ties never move. */
    function xssCoexKV(k1, k2, i1, i2) {
        for (var l = 0; l < 4; l++) {
            var a = k1[l], b = k2[l];
            var t1 = a < b ? a : b;
            var t2 = a > b ? a : b;
            if (!(t1 === a)) { var tmp = i1[l]; i1[l] = i2[l]; i2[l] = tmp; }
            k1[l] = t1;
            k2[l] = t2;
        }
    }

    /* xss-reg-networks.hpp: sort_reg_4lanes<vtype1, vtype2>(key_reg, index_reg&) */
    function xssSortReg4(k, i) {
        xssCmpMergeKV(k, xssSwap2(k), i, xssSwap2(i), XSS_MASK_A);   // reverse_n<2>
        xssCmpMergeKV(k, xssRev4(k), i, xssRev4(i), XSS_MASK_C);     // reverse_n<4>
        xssCmpMergeKV(k, xssSwap2(k), i, xssSwap2(i), XSS_MASK_A);   // swap_n<2>
    }

    /* xss-reg-networks.hpp: bitonic_merge_reg_4lanes<vtype1, vtype2>(key_reg, index_reg&) */
    function xssBitonicMergeReg4(k, i) {
        xssCmpMergeKV(k, xssSwap4(k), i, xssSwap4(i), XSS_MASK_C);   // half_cleaner[4]
        xssCmpMergeKV(k, xssSwap2(k), i, xssSwap2(i), XSS_MASK_A);   // half_cleaner[1]
    }

    /* xss-network-keyvaluesort.hpp: bitonic_merge_n_vec<keyType, valueType, nv>
     * on keys[off .. off+nv) -- reverse-and-COEX the outer pairs, then
     * bitonic_clean_n_vec, then the in-register merge on every vector. */
    function xssBitonicMergeNVec(K, I, off, nv) {
        var i, j;
        if (nv === 2) {
            K[off + 1] = xssRev4(K[off + 1]); I[off + 1] = xssRev4(I[off + 1]);
            xssCoexKV(K[off], K[off + 1], I[off], I[off + 1]);
            K[off + 1] = xssRev4(K[off + 1]); I[off + 1] = xssRev4(I[off + 1]);
        } else if (nv > 2) {
            for (i = 0; i < (nv >> 1); i++) {
                j = off + nv - 1 - i;
                K[j] = xssRev4(K[j]); I[j] = xssRev4(I[j]);
                xssCoexKV(K[off + i], K[j], I[off + i], I[j]);
                K[j] = xssRev4(K[j]); I[j] = xssRev4(I[j]);
            }
        }
        for (var num = nv >> 1; num >= 2; num >>= 1) {          // bitonic_clean_n_vec
            for (j = 0; j < nv; j += num) {
                for (i = 0; i < (num >> 1); i++) {
                    xssCoexKV(K[off + i + j], K[off + i + j + (num >> 1)],
                              I[off + i + j], I[off + i + j + (num >> 1)]);
                }
            }
        }
        for (i = 0; i < nv; i++) xssBitonicMergeReg4(K[off + i], I[off + i]);
    }

    /* Path counters -- the test reads these to prove each branch was actually
     * exercised by the fixtures rather than passing vacuously. */
    var XSS_STATS = {
        earlyExits: 0, networkCalls: 0, networkByNumVecs: {}, partitions: 0,
        stdSortCalls: 0, stdSortMaxRange: 0, stdPartitions: 0, heapSorts: 0
    };

    /* xss-network-keyvaluesort.hpp:
     *   argsort_n<avx2_vector<double>, avx2_vector<uint64_t>, 256>(keys, arg + base, N)
     *   -> argsort_n_vec<.., 64>, which halves numVecs while N*2 <= numVecs*4.
     * The first numVecs/2 vectors load unmasked; the rest load with a lane
     * mask, unused lanes holding (key = +inf, index = uint64 max) so they sort
     * to the end and the masked store never writes them back. */
    function xssArgsortN(keys, arg, base, N) {
        var numVecs = 64;
        while (numVecs > 1 && N * 2 <= numVecs * 4) numVecs >>= 1;
        XSS_STATS.networkCalls++;
        XSS_STATS.networkByNumVecs[numVecs] = (XSS_STATS.networkByNumVecs[numVecs] || 0) + 1;
        var half = numVecs >> 1;
        var K = new Array(numVecs), I = new Array(numVecs);
        var toRead = new Array(numVecs - half);
        var i, j, l, iv, kv;
        for (i = half, j = 0; i < numVecs; i++, j++) {
            toRead[j] = Math.min(Math.max(0, N - i * 4), 4);
        }
        for (i = 0; i < half; i++) {
            iv = [arg[base + 4 * i], arg[base + 4 * i + 1],
                  arg[base + 4 * i + 2], arg[base + 4 * i + 3]];
            I[i] = iv;
            K[i] = [keys[iv[0]], keys[iv[1]], keys[iv[2]], keys[iv[3]]];
        }
        for (i = half, j = 0; i < numVecs; i++, j++) {
            iv = [XSS_PAD, XSS_PAD, XSS_PAD, XSS_PAD];
            kv = [Infinity, Infinity, Infinity, Infinity];
            for (l = 0; l < toRead[j]; l++) {
                iv[l] = arg[base + 4 * i + l];
                kv[l] = keys[iv[l]];
            }
            I[i] = iv;
            K[i] = kv;
        }
        for (i = 0; i < numVecs; i++) xssSortReg4(K[i], I[i]);
        for (var numPer = 2; numPer <= numVecs; numPer *= 2) {   // bitonic_fullmerge_n_vec
            for (i = 0; i < numVecs / numPer; i++) {
                xssBitonicMergeNVec(K, I, i * numPer, numPer);
            }
        }
        for (i = 0; i < half; i++) {
            for (l = 0; l < 4; l++) {
                if (I[i][l] === XSS_PAD) throw new Error('argsort: padding lane reached a stored slot');
                arg[base + 4 * i + l] = I[i][l];
            }
        }
        for (i = half, j = 0; i < numVecs; i++, j++) {
            for (l = 0; l < toRead[j]; l++) {
                if (I[i][l] === XSS_PAD) throw new Error('argsort: padding lane reached a stored slot');
                arg[base + 4 * i + l] = I[i][l];
            }
        }
    }

    /* xss-common-argsort.h: get_pivot_64bit<avx2_vector<double>> (numlanes == 4):
     * sort_vec() of 4 samples at left + k*size, k = 1..4, and take lane 2 --
     * the upper median.  The value is all that is used, so the sample sort's
     * own tie order is irrelevant here. */
    function xssGetPivot(keys, arg, left, right) {
        var size = Math.floor((right - left) / 4);
        var s = [keys[arg[left + size]], keys[arg[left + 2 * size]],
                 keys[arg[left + 3 * size]], keys[arg[left + 4 * size]]];
        s.sort(function (a, b) { return a - b; });
        return s[2];
    }

    /* xss-common-argsort.h: partition_vec_avx2 -> avx2_double_compressstore64
     * (avx2-emu-funcs.hpp).  Lanes >= pivot are packed into the HIGH lanes in
     * REVERSE lane order, lanes < pivot into the LOW lanes in lane order; the
     * whole 4-lane register is then stored at BOTH arg[left..left+3] and
     * arg[right-4..right-1], left store first.  Returns popcount(ge). */
    function xssPartitionVec(arg, left, right, argv, curv, pivot, minv, maxv) {
        var lo = 0, hi = 3, count = 0, l;
        var temp = [0, 0, 0, 0];
        for (l = 0; l < 4; l++) {
            if (curv[l] >= pivot) { temp[hi--] = argv[l]; count++; }
            else { temp[lo++] = argv[l]; }
        }
        for (l = 0; l < 4; l++) arg[left + l] = temp[l];
        for (l = 0; l < 4; l++) arg[right - 4 + l] = temp[l];
        for (l = 0; l < 4; l++) {
            minv[l] = (curv[l] < minv[l]) ? curv[l] : minv[l];
            maxv[l] = (curv[l] > maxv[l]) ? curv[l] : maxv[l];
        }
        return count;
    }

    function xssGather4(keys, arg, at) {
        return [keys[arg[at]], keys[arg[at + 1]], keys[arg[at + 2]], keys[arg[at + 3]]];
    }
    function xssLoad4(arg, at) {
        return [arg[at], arg[at + 1], arg[at + 2], arg[at + 3]];
    }

    /* xss-common-argsort.h: argpartition_unrolled<vtype, argtype, 4> with
     * numlanes == 4, so one unroll is 16 elements.  `right` is exclusive.
     * The scalar prologue trims (right-left) % 16 elements; then 16 are
     * parked from each end, and the loop always loads from whichever end has
     * less already-partitioned room.  Returns {idx, smallest, biggest}. */
    function xssArgpartitionUnrolled(keys, arg, left, right, pivot) {
        var smallest = Infinity, biggest = -Infinity;
        if (right - left <= 8 * 4 * 4) {
            // argsort_ only partitions ranges longer than 256, so the plain
            // argpartition() this would delegate to is unreachable; not ported.
            throw new Error('argsort: non-unrolled argpartition reached (n <= 128)');
        }
        var i, ii, l, t, v;
        for (i = (right - left) % 16; i > 0; --i) {
            v = keys[arg[left]];
            if (v < smallest) smallest = v;
            if (biggest < v) biggest = v;
            if (!(v < pivot)) {
                --right;
                t = arg[left]; arg[left] = arg[right]; arg[right] = t;
            } else {
                ++left;
            }
        }
        if (left === right) return { idx: left, smallest: smallest, biggest: biggest };

        var minv = [smallest, smallest, smallest, smallest];
        var maxv = [biggest, biggest, biggest, biggest];
        var vecLeft = [], argLeft = [], vecRight = [], argRight = [];
        for (ii = 0; ii < 4; ii++) {
            argLeft[ii] = xssLoad4(arg, left + 4 * ii);
            vecLeft[ii] = xssGather4(keys, arg, left + 4 * ii);
            argRight[ii] = xssLoad4(arg, right - 4 * (4 - ii));
            vecRight[ii] = xssGather4(keys, arg, right - 4 * (4 - ii));
        }
        var rStore = right - 4;
        var lStore = left;
        left += 16;
        right -= 16;
        var amount;
        while (right - left !== 0) {
            var argVec = [], curVec = [];
            if ((rStore + 4) - right < left - lStore) {
                right -= 16;
                for (ii = 0; ii < 4; ii++) {
                    argVec[ii] = xssLoad4(arg, right + ii * 4);
                    curVec[ii] = xssGather4(keys, arg, right + ii * 4);
                }
            } else {
                for (ii = 0; ii < 4; ii++) {
                    argVec[ii] = xssLoad4(arg, left + ii * 4);
                    curVec[ii] = xssGather4(keys, arg, left + ii * 4);
                }
                left += 16;
            }
            for (ii = 0; ii < 4; ii++) {
                amount = xssPartitionVec(arg, lStore, rStore + 4, argVec[ii], curVec[ii], pivot, minv, maxv);
                lStore += 4 - amount;
                rStore -= amount;
            }
        }
        for (ii = 0; ii < 4; ii++) {
            amount = xssPartitionVec(arg, lStore, rStore + 4, argLeft[ii], vecLeft[ii], pivot, minv, maxv);
            lStore += 4 - amount;
            rStore -= amount;
        }
        for (ii = 0; ii < 4; ii++) {
            amount = xssPartitionVec(arg, lStore, rStore + 4, argRight[ii], vecRight[ii], pivot, minv, maxv);
            lStore += 4 - amount;
            rStore -= amount;
        }
        for (l = 0; l < 4; l++) {
            if (minv[l] < smallest) smallest = minv[l];
            if (maxv[l] > biggest) biggest = maxv[l];
        }
        return { idx: lStore, smallest: smallest, biggest: biggest };
    }

    /* --- std::sort fallback ---
     * xss-common-argsort.h: std_argsort(arr, arg, left, right) ==
     *   std::sort(arg + left, arg + right, [arr](a, b){ return arr[a] < arr[b]; })
     * reached when the quicksort has spent its 2*floor(log2 n) iterations,
     * which tie-heavy data does routinely (a pivot equal to the range minimum
     * partitions nothing and the whole range recurses).  The numpy wheel links
     * Microsoft's STL, whose std::sort is _Sort_unchecked from <algorithm>:
     * insertion sort for ranges <= 32 (_ISORT_MAX), otherwise a quicksort
     * partitioned around _Guess_median_unchecked (median of 3; Tukey's
     * ninther when the range has more than 40 elements) with the depth budget
     * _Ideal starting at the range length and shrinking to 3/4 per level, and
     * heapsort when that budget is spent.  Transcribed function by function. */
    var STD_ISORT_MAX = 32;

    function stdInsertionSort(keys, arg, first, last) {          // _Insertion_sort_unchecked
        if (first === last) return;
        for (var next = first + 1; next < last; next++) {
            var val = arg[next];
            var kval = keys[val];
            if (kval < keys[arg[first]]) {
                for (var m = next; m > first; m--) arg[m] = arg[m - 1];
                arg[first] = val;
            } else {
                var next1 = next;
                for (var first1 = next1; kval < keys[arg[--first1]]; next1 = first1) {
                    arg[next1] = arg[first1];
                }
                arg[next1] = val;
            }
        }
    }

    function stdIterSwap(arg, a, b) { var t = arg[a]; arg[a] = arg[b]; arg[b] = t; }

    function stdMed3(keys, arg, first, mid, last) {              // _Med3_unchecked
        if (keys[arg[mid]] < keys[arg[first]]) stdIterSwap(arg, mid, first);
        if (keys[arg[last]] < keys[arg[mid]]) {
            stdIterSwap(arg, last, mid);
            if (keys[arg[mid]] < keys[arg[first]]) stdIterSwap(arg, mid, first);
        }
    }

    function stdGuessMedian(keys, arg, first, mid, last) {       // _Guess_median_unchecked
        var count = last - first;
        if (40 < count) {
            var step = (count + 1) >> 3;
            var twoStep = step << 1;
            stdMed3(keys, arg, first, first + step, first + twoStep);
            stdMed3(keys, arg, mid - step, mid, mid + step);
            stdMed3(keys, arg, last - twoStep, last - step, last);
            stdMed3(keys, arg, first + step, mid, last - step);
        } else {
            stdMed3(keys, arg, first, mid, last);
        }
    }

    /* _Partition_by_median_guess_unchecked: returns [pfirst, plast], the run
     * of elements equal to the pivot. */
    function stdPartition(keys, arg, first, last) {
        var mid = first + ((last - first) >> 1);
        stdGuessMedian(keys, arg, first, mid, last - 1);
        var pfirst = mid;
        var plast = pfirst + 1;
        var kp;
        while (first < pfirst &&
               !(keys[arg[pfirst - 1]] < keys[arg[pfirst]]) &&
               !(keys[arg[pfirst]] < keys[arg[pfirst - 1]])) {
            --pfirst;
        }
        while (plast < last &&
               !(keys[arg[plast]] < keys[arg[pfirst]]) &&
               !(keys[arg[pfirst]] < keys[arg[plast]])) {
            ++plast;
        }
        var gfirst = plast;
        var glast = pfirst;
        for (;;) {
            for (; gfirst < last; ++gfirst) {
                kp = keys[arg[pfirst]];
                if (kp < keys[arg[gfirst]]) {
                    continue;
                } else if (keys[arg[gfirst]] < kp) {
                    break;
                } else if (plast !== gfirst) {
                    stdIterSwap(arg, plast, gfirst);
                    ++plast;
                } else {
                    ++plast;
                }
            }
            for (; first < glast; --glast) {
                kp = keys[arg[pfirst]];
                if (keys[arg[glast - 1]] < kp) {
                    continue;
                } else if (kp < keys[arg[glast - 1]]) {
                    break;
                } else if (--pfirst !== glast - 1) {
                    stdIterSwap(arg, pfirst, glast - 1);
                }
            }
            if (glast === first && gfirst === last) {
                return [pfirst, plast];
            }
            if (glast === first) {
                if (plast !== gfirst) stdIterSwap(arg, pfirst, plast);
                ++plast;
                stdIterSwap(arg, pfirst, gfirst);
                ++pfirst;
                ++gfirst;
            } else if (gfirst === last) {
                if (--glast !== --pfirst) stdIterSwap(arg, glast, pfirst);
                stdIterSwap(arg, pfirst, --plast);
            } else {
                stdIterSwap(arg, gfirst, --glast);
                ++gfirst;
            }
        }
    }

    function stdPushHeapByIndex(keys, arg, first, hole, top, val) {        // _Push_heap_by_index
        var kval = keys[val];
        for (var idx = (hole - 1) >> 1; top < hole && keys[arg[first + idx]] < kval; idx = (hole - 1) >> 1) {
            arg[first + hole] = arg[first + idx];
            hole = idx;
        }
        arg[first + hole] = val;
    }

    function stdPopHeapHoleByIndex(keys, arg, first, hole, bottom, val) {  // _Pop_heap_hole_by_index
        var top = hole;
        var idx = hole;
        var maxNonLeaf = (bottom - 1) >> 1;
        while (idx < maxNonLeaf) {
            idx = 2 * idx + 2;
            if (keys[arg[first + idx]] < keys[arg[first + (idx - 1)]]) --idx;
            arg[first + hole] = arg[first + idx];
            hole = idx;
        }
        if (idx === maxNonLeaf && bottom % 2 === 0) {
            arg[first + hole] = arg[first + (bottom - 1)];
            hole = bottom - 1;
        }
        stdPushHeapByIndex(keys, arg, first, hole, top, val);
    }

    function stdMakeHeap(keys, arg, first, last) {                         // _Make_heap_unchecked
        var bottom = last - first;
        for (var hole = bottom >> 1; 0 < hole;) {
            --hole;
            var val = arg[first + hole];
            stdPopHeapHoleByIndex(keys, arg, first, hole, bottom, val);
        }
    }

    function stdSortHeap(keys, arg, first, last) {                         // _Sort_heap_unchecked
        for (; last - first >= 2; --last) {
            var l1 = last - 1;                                             // _Pop_heap_unchecked
            var val = arg[l1];
            arg[l1] = arg[first];
            stdPopHeapHoleByIndex(keys, arg, first, 0, l1 - first, val);
        }
    }

    function stdSortUnchecked(keys, arg, first, last, ideal) {             // _Sort_unchecked
        for (;;) {
            if (last - first <= STD_ISORT_MAX) {
                stdInsertionSort(keys, arg, first, last);
                return;
            }
            if (ideal <= 0) {
                XSS_STATS.heapSorts++;
                stdMakeHeap(keys, arg, first, last);
                stdSortHeap(keys, arg, first, last);
                return;
            }
            var mid = stdPartition(keys, arg, first, last);
            XSS_STATS.stdPartitions++;
            ideal = (ideal >> 1) + (ideal >> 2);
            if (mid[0] - first < last - mid[1]) {
                stdSortUnchecked(keys, arg, first, mid[0], ideal);
                first = mid[1];
            } else {
                stdSortUnchecked(keys, arg, mid[1], last, ideal);
                last = mid[0];
            }
        }
    }

    function stdArgsort(keys, arg, left, right) {       // right exclusive
        XSS_STATS.stdSortCalls++;
        if (right - left > XSS_STATS.stdSortMaxRange) XSS_STATS.stdSortMaxRange = right - left;
        stdSortUnchecked(keys, arg, left, right, right - left);
    }

    /* xss-common-argsort.h: argsort_<vtype, argtype>(arr, arg, left, right, max_iters),
     * right inclusive.  Networks up to 256; otherwise pivot + partition and
     * recurse on whichever side the pivot did not exhaust. */
    function xssArgsortRange(keys, arg, left, right, maxIters) {
        if (maxIters <= 0) {
            stdArgsort(keys, arg, left, right + 1);
            return;
        }
        var n = right + 1 - left;
        if (n <= 256) {
            xssArgsortN(keys, arg, left, n);
            return;
        }
        XSS_STATS.partitions++;
        var pivot = xssGetPivot(keys, arg, left, right);
        var r = xssArgpartitionUnrolled(keys, arg, left, right + 1, pivot);
        if (pivot !== r.smallest) xssArgsortRange(keys, arg, left, r.idx - 1, maxIters - 1);
        if (pivot !== r.biggest) xssArgsortRange(keys, arg, r.idx, right, maxIters - 1);
    }

    /* np.argsort(values) for float64 as executed by this machine's numpy:
     * xss-common-argsort.h xss_argsort<double, avx2_vector, avx2_half_vector>
     * (arr, arg, n, hasnan=true): NaN -> std::sort path (not ported: throws);
     * std::is_sorted(arr, a < b) -> identity; else argsort_ with
     * max_iters = 2 * (size_t)log2(n). */
    function argsortXssAvx2(values) {
        var n = values.length;
        var arg = new Int32Array(n);
        var i;
        for (i = 0; i < n; i++) arg[i] = i;
        if (n > 1) {
            for (i = 0; i < n; i++) {
                if (values[i] !== values[i]) {
                    throw new Error('argsort: NaN input takes numpy\'s std::sort path, which is not ported');
                }
                if (values[i] === Infinity || values[i] === -Infinity) {
                    throw new Error('argsort: infinite keys collide with the +inf lane padding of the ' +
                        'x86-simd-sort network; not ported (no pixelfixer call site can produce one)');
                }
            }
            var sorted = true;
            for (i = 1; i < n; i++) if (values[i] < values[i - 1]) { sorted = false; break; }
            if (sorted) { XSS_STATS.earlyExits++; return arg; }
            xssArgsortRange(values, arg, 0, n - 1, 2 * Math.floor(Math.log2(n)));
        }
        return arg;
    }

    /* --- CONTROL ONLY: numpy's portable introsort ---
     * npysort/quicksort.cpp aquicksort_<double>: median-of-3 quicksort with a
     * 15-element insertion-sort tail and an aheapsort_ fallback at depth
     * 2*floor(log2 n).  This is what a numpy build with NO x86-simd-sort
     * dispatch runs.  It is NOT the reference on this machine and is never
     * used by find_peaks; tools/test-scipy.js runs it as a control and
     * requires it to DISAGREE with np.argsort on tied inputs. */
    function npyLT(a, b) {
        return a < b || (b !== b && a === a);
    }

    function msb(num) {
        var d = 0;
        var u = num;
        while ((u >>>= 1)) d++;
        return d;
    }

    function aheapsortArg(v, tosort, lo, n) {
        var base = lo - 1;              // C offsets the array by one
        var i, j, l, tmp;
        for (l = n >> 1; l > 0; --l) {
            tmp = tosort[base + l];
            for (i = l, j = l << 1; j <= n;) {
                if (j < n && npyLT(v[tosort[base + j]], v[tosort[base + j + 1]])) j += 1;
                if (npyLT(v[tmp], v[tosort[base + j]])) {
                    tosort[base + i] = tosort[base + j];
                    i = j;
                    j += j;
                } else break;
            }
            tosort[base + i] = tmp;
        }
        for (; n > 1;) {
            tmp = tosort[base + n];
            tosort[base + n] = tosort[base + 1];
            n -= 1;
            for (i = 1, j = 2; j <= n;) {
                if (j < n && npyLT(v[tosort[base + j]], v[tosort[base + j + 1]])) j++;
                if (npyLT(v[tmp], v[tosort[base + j]])) {
                    tosort[base + i] = tosort[base + j];
                    i = j;
                    j += j;
                } else break;
            }
            tosort[base + i] = tmp;
        }
    }

    var SMALL_QUICKSORT = 15;
    function aquicksortArg(v, tosort, num) {
        var pl = 0, pr = num - 1;
        var stack = new Int32Array(256);
        var sptr = 0;
        var depth = new Int32Array(128);
        var psdepth = 0;
        var cdepth = msb(num) * 2;
        var pm, pi, pj, pk, vi, vp, t;

        for (;;) {
            if (cdepth < 0) {
                aheapsortArg(v, tosort, pl, pr - pl + 1);
            } else {
                while ((pr - pl) > SMALL_QUICKSORT) {
                    pm = pl + ((pr - pl) >> 1);
                    if (npyLT(v[tosort[pm]], v[tosort[pl]])) {
                        t = tosort[pm]; tosort[pm] = tosort[pl]; tosort[pl] = t;
                    }
                    if (npyLT(v[tosort[pr]], v[tosort[pm]])) {
                        t = tosort[pr]; tosort[pr] = tosort[pm]; tosort[pm] = t;
                    }
                    if (npyLT(v[tosort[pm]], v[tosort[pl]])) {
                        t = tosort[pm]; tosort[pm] = tosort[pl]; tosort[pl] = t;
                    }
                    vp = v[tosort[pm]];
                    pi = pl;
                    pj = pr - 1;
                    t = tosort[pm]; tosort[pm] = tosort[pj]; tosort[pj] = t;
                    for (;;) {
                        do { ++pi; } while (npyLT(v[tosort[pi]], vp));
                        do { --pj; } while (npyLT(vp, v[tosort[pj]]));
                        if (pi >= pj) break;
                        t = tosort[pi]; tosort[pi] = tosort[pj]; tosort[pj] = t;
                    }
                    pk = pr - 1;
                    t = tosort[pi]; tosort[pi] = tosort[pk]; tosort[pk] = t;
                    if (pi - pl < pr - pi) {
                        stack[sptr++] = pi + 1;
                        stack[sptr++] = pr;
                        pr = pi - 1;
                    } else {
                        stack[sptr++] = pl;
                        stack[sptr++] = pi - 1;
                        pl = pi + 1;
                    }
                    depth[psdepth++] = --cdepth;
                }
                for (pi = pl + 1; pi <= pr; ++pi) {
                    vi = tosort[pi];
                    vp = v[vi];
                    pj = pi;
                    pk = pi - 1;
                    while (pj > pl && npyLT(vp, v[tosort[pk]])) {
                        tosort[pj--] = tosort[pk--];
                    }
                    tosort[pj] = vi;
                }
            }
            if (sptr === 0) break;
            pr = stack[--sptr];
            pl = stack[--sptr];
            cdepth = depth[--psdepth];
        }
    }

    function argsortPortableIntrosort(values) {
        var n = values.length;
        var idx = new Int32Array(n);
        for (var i = 0; i < n; i++) idx[i] = i;
        if (n > 1) aquicksortArg(values, idx, n);
        return idx;
    }

    /* The np.argsort find_peaks actually sees. */
    var argsortNumpy = argsortXssAvx2;

    // ----------------------------------------------------- _local_maxima_1d

    /* scipy.signal._peak_finding_utils._local_maxima_1d, transcribed.
     * Returns {midpoints, leftEdges, rightEdges} as Int32Array.
     * The plateau midpoint uses FLOOR division ((l + r) // 2), so an even-width
     * plateau reports its LEFT-of-centre sample. */
    function localMaxima1d(x) {
        var n = x.length;
        var cap = (n / 2) | 0;
        var midpoints = new Int32Array(cap);
        var leftEdges = new Int32Array(cap);
        var rightEdges = new Int32Array(cap);
        var m = 0;
        var i = 1;
        var iMax = n - 1;
        var iAhead;
        while (i < iMax) {
            if (x[i - 1] < x[i]) {
                iAhead = i + 1;
                while (iAhead < iMax && x[iAhead] === x[i]) iAhead++;
                if (x[iAhead] < x[i]) {
                    leftEdges[m] = i;
                    rightEdges[m] = iAhead - 1;
                    midpoints[m] = ((i + (iAhead - 1)) / 2) | 0;
                    m++;
                    i = iAhead;
                }
            }
            i++;
        }
        return {
            midpoints: midpoints.subarray(0, m),
            leftEdges: leftEdges.subarray(0, m),
            rightEdges: rightEdges.subarray(0, m),
            count: m
        };
    }

    // ------------------------------------------------ _select_by_peak_distance

    /* scipy.signal._peak_finding_utils._select_by_peak_distance, transcribed.
     * distance is rounded UP; peaks are visited highest-priority-first and each
     * survivor blackballs every not-yet-removed neighbour closer than that.
     * `orderOverride` is a test hook: passing numpy's own argsort permutation
     * lets tools/test-scipy.js prove that this function -- and therefore every
     * line of find_peaks other than the sort -- is exact, and lets it measure
     * alternative tie rules as controls. */
    function selectByPeakDistance(peaks, priority, distance, orderOverride) {
        var size = peaks.length;
        var distance_ = Math.ceil(distance);
        var keep = new Uint8Array(size);
        keep.fill(1);
        var order = orderOverride || argsortNumpy(priority);
        var i, j, k;
        for (i = size - 1; i >= 0; i--) {
            j = order[i];
            if (keep[j] === 0) continue;
            k = j - 1;
            while (k >= 0 && peaks[j] - peaks[k] < distance_) {
                keep[k] = 0;
                k--;
            }
            k = j + 1;
            while (k < size && peaks[k] - peaks[j] < distance_) {
                keep[k] = 0;
                k++;
            }
        }
        return keep;
    }

    // ----------------------------------------------------------- find_peaks

    var FIND_PEAKS_UNSUPPORTED = [
        'threshold', 'prominence', 'width', 'wlen', 'rel_height', 'plateau_size'
    ];

    /* scipy.signal.find_peaks(x, height=..., distance=...).
     *
     * Returns { peaks: Int32Array, properties: { peak_heights?: Float64Array } }.
     *
     * `height` is a scalar lower bound only (scipy also takes a 2-tuple or an
     * array; no call site does).  `distance` is a scalar >= 1.  Everything else
     * scipy offers throws -- including prominence and width, which were NOT
     * ported: grepping the reference shows they are never passed, and shipping
     * an unexercised prominence implementation would be extra surface with no
     * fixture behind it. */
    PF.find_peaks = function find_peaks(x, opts) {
        opts = opts || {};
        if (typeof opts !== 'object') {
            throw new TypeError('PF.find_peaks: options must be an object');
        }
        var keys = Object.keys(opts);
        for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki];
            if (key === 'height' || key === 'distance') continue;
            if (FIND_PEAKS_UNSUPPORTED.indexOf(key) >= 0) {
                throw new Error('PF.find_peaks: "' + key + '" is NOT ported. ' +
                    'No pixelfixer call site passes it, so there is no fixture ' +
                    'proving an implementation would be right. Port it against ' +
                    'scipy and add parity cases before using it.');
            }
            throw new Error('PF.find_peaks: unknown option "' + key + '"');
        }

        var height = opts.height;
        var distance = opts.distance;

        if (height !== undefined && height !== null) {
            if (typeof height !== 'number' || !isFinite(height)) {
                throw new Error('PF.find_peaks: height must be a finite scalar ' +
                    '(scipy also accepts a 2-tuple or an array; no call site ' +
                    'does, so that form is not ported); got ' + height);
            }
        }
        if (distance !== undefined && distance !== null) {
            if (typeof distance !== 'number' || !isFinite(distance)) {
                throw new Error('PF.find_peaks: distance must be a finite ' +
                    'scalar; got ' + distance);
            }
            if (distance < 1) {
                throw new Error('`distance` must be greater or equal to 1');
            }
        }

        // scipy: x = _arg_x_as_expected(x) -> np.asarray(x, dtype=float64)
        var xf = asF64(x, 'PF.find_peaks: x');

        var lm = localMaxima1d(xf);
        var peaks = lm.midpoints;
        var properties = {};
        var i, m;

        if (height !== undefined && height !== null) {
            var heights = new Float64Array(peaks.length);
            for (i = 0; i < peaks.length; i++) heights[i] = xf[peaks[i]];
            // _select_by_property(peak_heights, hmin=height, hmax=None):
            //     keep &= (pmin <= peak_properties)
            var keepH = new Uint8Array(peaks.length);
            m = 0;
            for (i = 0; i < peaks.length; i++) {
                if (height <= heights[i]) { keepH[i] = 1; m++; }
            }
            var np2 = new Int32Array(m);
            var nh2 = new Float64Array(m);
            var w = 0;
            for (i = 0; i < peaks.length; i++) {
                if (keepH[i]) { np2[w] = peaks[i]; nh2[w] = heights[i]; w++; }
            }
            peaks = np2;
            properties.peak_heights = nh2;
        }

        if (distance !== undefined && distance !== null) {
            var prio = new Float64Array(peaks.length);
            for (i = 0; i < peaks.length; i++) prio[i] = xf[peaks[i]];
            var keepD = selectByPeakDistance(peaks, prio, distance);
            m = 0;
            for (i = 0; i < keepD.length; i++) if (keepD[i]) m++;
            var np3 = new Int32Array(m);
            var w3 = 0;
            for (i = 0; i < peaks.length; i++) if (keepD[i]) np3[w3++] = peaks[i];
            if (properties.peak_heights) {
                var nh3 = new Float64Array(m);
                var w4 = 0;
                for (i = 0; i < peaks.length; i++) {
                    if (keepD[i]) nh3[w4++] = properties.peak_heights[i];
                }
                properties.peak_heights = nh3;
            }
            peaks = np3;
        }

        // localMaxima1d hands back a subarray view over an oversized buffer;
        // never let that escape to the caller
        if (peaks.byteOffset !== 0 || peaks.buffer.byteLength !== peaks.length * 4) {
            peaks = new Int32Array(peaks);
        }
        return { peaks: peaks, properties: properties };
    };

    // -------------------------------------------------- internals for tests
    PF._scipyInternals = {
        reflectIndex: reflectIndex,
        nearestIndex: nearestIndex,
        pairwiseSum: pairwiseSum,
        gaussianKernel1d: gaussianKernel1d,
        ndCorrelate1d: ndCorrelate1d,
        localMaxima1d: localMaxima1d,
        argsortNumpy: argsortNumpy,                        // == argsortXssAvx2
        argsortXssAvx2: argsortXssAvx2,
        argsortPortableIntrosort: argsortPortableIntrosort,  // control only
        argsortXssStats: XSS_STATS,
        selectByPeakDistance: selectByPeakDistance
    };
})();

/* ==== pf-03-cv2.js ================================================ */
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

/* ==== pf-04-nprandom.js =========================================== */
/* pf-04-nprandom.js -- numpy.random, the slice pixelfixer uses.
 *
 * Port target: numpy 2.5.3 (the reference venv), whose default_rng is the
 * plain PCG64 bit generator (NOT PCG64DXSM; measured: default_rng(42)
 * .bit_generator.state['bit_generator'] == 'PCG64').
 *
 * Call sites (grep "default_rng" in pixelfixer/):
 *   quantize.py:33     rng = np.random.default_rng(seed)
 *   quantize.py:35     idx = rng.choice(n, sample_max, replace=False)
 *   reconsearch.py:56  rng = np.random.default_rng(seed)
 *   reconsearch.py:59  idx = rng.choice(n, min(sample, n), replace=False)
 * Only that surface is implemented: SeedSequence -> PCG64 -> Generator
 * .choice(int, size, replace=False[, shuffle]). Anything else throws, so a
 * caller cannot get a plausible-but-different stream by accident.
 *
 * Every stage below was first written as a pure-Python model and checked
 * against numpy's own objects (tools/probe-nprandom.py: SeedSequence.pool,
 * generate_state, PCG64.state / random_raw, choice on 13 (pop,size) shapes
 * covering both branches, and the has_uint32/uinteger carry afterwards --
 * all OK). This file ports that model; tools/test-quantize.js checks it
 * against fixtures/quantize-parity.json.
 *
 * Model (numpy/random/bit_generator.pyx, _pcg64.pyx, src/pcg64/pcg64.h,
 * src/distributions/distributions.c, _generator.pyx):
 *
 *   SeedSequence(entropy): entropy int -> little-endian uint32 words; a
 *     4-word pool mixed with hashmix/mix (INIT_A, MULT_A, MIX_MULT_L/R);
 *     generate_state(n) rehashes the pool cyclically with INIT_B/MULT_B.
 *   PCG64: 128-bit LCG, MULT = 0x2360ED051FC65DA44385DF649FCCF645,
 *     inc = (initseq << 1) | 1; seeding is state = 0; step; state +=
 *     initstate; step. Output is XSL-RR: rotr64(hi64 ^ lo64, state >> 122),
 *     taken AFTER the step. generate_state(4, uint64) supplies
 *     (initstate_hi, initstate_lo, initseq_hi, initseq_lo) as little-endian
 *     uint32 pairs.
 *   next_uint32: the LOW 32 bits of a fresh 64-bit word, then the HIGH 32
 *     on the next call (has_uint32 / uinteger). This carry is part of the
 *     generator's state and is reproduced (and tested) here.
 *   random_bounded_uint64(off=0, rng, mask=0, use_masked=False) for
 *     rng < 2^32: rng == 0 -> 0; rng == 2^32-1 -> next_uint32; otherwise
 *     Lemire's multiply-shift on next_uint32 with rejection while
 *     leftover < (2^32-1 - rng) % (rng+1).
 *   choice(pop, size, replace=False, p=None, shuffle=True):
 *     cutoff = shuffle ? 50 : 20
 *     if pop > 10000 and size > pop // cutoff:   tail shuffle
 *        idx = arange(pop); for i = pop-1 down to max(pop-size, 1):
 *        swap(idx[i], idx[bounded(i)]); return idx[pop-size:]
 *     else:                                       Floyd
 *        open-addressed hash set of 2^ceil(log2(floor(1.2*size))) slots;
 *        for j in [pop-size, pop): v = bounded(j); insert v if absent
 *        else insert j (probing from j & mask); out[j-(pop-size)] = the
 *        inserted value; then, if shuffle, shuffle out from i = size-1
 *        down to 1.
 *
 * Arithmetic: ES2017, no BigInt. The 128-bit state is eight 16-bit limbs
 * (little-endian) in a plain array; a 128x128 -> 128 multiply is schoolbook
 * on those limbs (every column sum < 2^37, exact in a double). The 64-bit
 * Lemire product x * (rng+1) is split into 16-bit halves the same way so
 * its high and low 32-bit words are exact.
 *
 * No imports, no exports, no build step. Browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  var TWO32 = 4294967296;
  var MASK32 = 0xFFFFFFFF;

  function err(msg) { throw new Error('PF.np_random: ' + msg); }

  // ------------------------------------------------------------ SeedSequence

  var INIT_A = 0x43b0d7e5, MULT_A = 0x931e8875;
  var INIT_B = 0x8b51f9dd, MULT_B = 0x58f38ded;
  var MIX_MULT_L = 0xca01f9dd, MIX_MULT_R = 0x4973f715;
  var XSHIFT = 16;
  var DEFAULT_POOL_SIZE = 4;

  function mul32(a, b) { return Math.imul(a, b) >>> 0; }

  // hashmix(value, &hash_const)
  function hashmix(value, hc) {
    value = (value ^ hc[0]) >>> 0;
    hc[0] = mul32(hc[0], MULT_A);
    value = mul32(value, hc[0]);
    value = (value ^ (value >>> XSHIFT)) >>> 0;
    return value;
  }

  // mix(x, y): (MIX_MULT_L*x - MIX_MULT_R*y) mod 2^32, then xorshift.
  // The subtraction of two uint32 products is within +-2^32, exact; >>> 0
  // is ToUint32, i.e. the modulo numpy's uint32 arithmetic applies.
  function mix(x, y) {
    var r = (mul32(MIX_MULT_L, x) - mul32(MIX_MULT_R, y)) >>> 0;
    r = (r ^ (r >>> XSHIFT)) >>> 0;
    return r;
  }

  // _coerce_to_uint32_array for a non-negative Python int: little-endian
  // uint32 words, and [0] for zero. Ints beyond 2^53 are not representable
  // here and throw instead of silently losing bits.
  function entropyWords(entropy) {
    if (typeof entropy !== 'number' || entropy !== Math.floor(entropy) || entropy < 0) {
      err('SeedSequence entropy must be a non-negative integer, got ' + String(entropy));
    }
    if (entropy > 9007199254740992) err('SeedSequence entropy above 2^53 is not representable');
    if (entropy === 0) return [0];
    var words = [], n = entropy;
    while (n > 0) {
      words.push(n % TWO32);
      n = Math.floor(n / TWO32);
    }
    return words;
  }

  /**
   * np.random.SeedSequence(entropy) with the default pool_size=4 and an
   * empty spawn_key.
   * @param {number} entropy  non-negative integer <= 2^53
   */
  function SeedSequence(entropy) {
    if (!(this instanceof SeedSequence)) return new SeedSequence(entropy);
    this.entropy = entropy;
    this.pool_size = DEFAULT_POOL_SIZE;
    var ent = entropyWords(entropy);
    var pool = new Array(DEFAULT_POOL_SIZE);
    var hc = [INIT_A];
    var i, s, d;
    for (i = 0; i < DEFAULT_POOL_SIZE; i++) {
      pool[i] = hashmix(i < ent.length ? ent[i] : 0, hc);
    }
    for (s = 0; s < DEFAULT_POOL_SIZE; s++) {
      for (d = 0; d < DEFAULT_POOL_SIZE; d++) {
        if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s], hc));
      }
    }
    for (s = DEFAULT_POOL_SIZE; s < ent.length; s++) {
      for (d = 0; d < DEFAULT_POOL_SIZE; d++) {
        pool[d] = mix(pool[d], hashmix(ent[s], hc));
      }
    }
    this.pool = pool;
  }

  /** generate_state(n_words, np.uint32) -> Array of n uint32 */
  SeedSequence.prototype.generate_state = function (nWords) {
    var hc = INIT_B;
    var out = new Array(nWords), i, v;
    for (i = 0; i < nWords; i++) {
      v = this.pool[i % this.pool.length];
      v = (v ^ hc) >>> 0;
      hc = mul32(hc, MULT_B);
      v = mul32(v, hc);
      v = (v ^ (v >>> XSHIFT)) >>> 0;
      out[i] = v;
    }
    return out;
  };
  PF.SeedSequence = SeedSequence;

  // ------------------------------------------------------------------ PCG64

  // 0x2360ED051FC65DA44385DF649FCCF645 as little-endian 16-bit limbs
  var PCG_MULT = [0xF645, 0x9FCC, 0xDF64, 0x4385, 0x5DA4, 0x1FC6, 0xED05, 0x2360];

  // limbs <- (limbs * PCG_MULT + inc) mod 2^128
  function pcgStep(s, inc) {
    var carry = 0, acc, k, i;
    var out = [0, 0, 0, 0, 0, 0, 0, 0];
    for (k = 0; k < 8; k++) {
      acc = carry + inc[k];
      for (i = 0; i <= k; i++) acc += s[i] * PCG_MULT[k - i];
      out[k] = acc & 0xFFFF;                  // ToInt32 is exact modulo 2^32, so the low 16 bits survive
      carry = (acc - out[k]) / 65536;         // exact: acc is an integer < 2^37
    }
    // write back in place (s is read while out is being built, so no aliasing)
    s[0] = out[0]; s[1] = out[1]; s[2] = out[2]; s[3] = out[3];
    s[4] = out[4]; s[5] = out[5]; s[6] = out[6]; s[7] = out[7];
  }

  function limbsFromU32(hi, lo) {
    // one 64-bit value (hi, lo) -> four 16-bit limbs, little-endian
    return [lo & 0xFFFF, lo >>> 16, hi & 0xFFFF, hi >>> 16];
  }

  function limbsToHex(limbs) {
    var s = '', i, h;
    for (i = 7; i >= 0; i--) {
      h = limbs[i].toString(16);
      while (h.length < 4) h = '0' + h;
      s += h;
    }
    return s;
  }

  /**
   * np.random.PCG64(seed): seeded through SeedSequence(seed)
   * .generate_state(4, uint64) exactly as numpy does.
   * @param {number} seed  non-negative integer <= 2^53
   */
  function PCG64(seed) {
    if (!(this instanceof PCG64)) return new PCG64(seed);
    var ss = new SeedSequence(seed);
    var w = ss.generate_state(8);            // uint32 words; uint64 pairs are little-endian
    // generate_state(4, uint64) = [u0, u1, u2, u3] with u_i = (w[2i+1] << 32) | w[2i].
    // pcg64_set_seed: initstate = PCG_128BIT_CONSTANT(u0, u1) -- u0 is the HIGH
    // 64 bits -- and initseq = PCG_128BIT_CONSTANT(u2, u3). Limbs are little-
    // endian, so the low half (u1) comes first.
    var initstate = limbsFromU32(w[3], w[2]).concat(limbsFromU32(w[1], w[0]));
    var initseq = limbsFromU32(w[7], w[6]).concat(limbsFromU32(w[5], w[4]));
    // inc = (initseq << 1) | 1  (mod 2^128)
    var inc = [0, 0, 0, 0, 0, 0, 0, 0], i, c = 1, v;
    for (i = 0; i < 8; i++) {
      v = initseq[i] * 2 + c;
      inc[i] = v & 0xFFFF;
      c = v >>> 16;
    }
    var s = [0, 0, 0, 0, 0, 0, 0, 0];
    pcgStep(s, inc);
    // state += initstate (mod 2^128)
    c = 0;
    for (i = 0; i < 8; i++) {
      v = s[i] + initstate[i] + c;
      s[i] = v & 0xFFFF;
      c = v >>> 16;
    }
    pcgStep(s, inc);
    this._state = s;
    this._inc = inc;
    this.has_uint32 = 0;
    this.uinteger = 0;
    this._hi = 0;                            // last 64-bit output, high word
    this._lo = 0;                            // last 64-bit output, low word
  }

  /** pcg64_next64: step, then XSL-RR output. Leaves the word in _hi/_lo. */
  PCG64.prototype.next64 = function () {
    var s = this._state;
    pcgStep(s, this._inc);
    var lo0 = (s[0] | (s[1] << 16)) >>> 0, lo1 = (s[2] | (s[3] << 16)) >>> 0;   // low 64 as (lo1:lo0)
    var hi0 = (s[4] | (s[5] << 16)) >>> 0, hi1 = (s[6] | (s[7] << 16)) >>> 0;   // high 64 as (hi1:hi0)
    var xl = (lo0 ^ hi0) >>> 0, xh = (lo1 ^ hi1) >>> 0;                         // hi64 ^ lo64
    var rot = s[7] >>> 10;                                                        // state >> 122
    var rh, rl;
    if (rot === 0) { rh = xh; rl = xl; }
    else if (rot < 32) {
      rl = ((xl >>> rot) | (xh << (32 - rot))) >>> 0;
      rh = ((xh >>> rot) | (xl << (32 - rot))) >>> 0;
    } else if (rot === 32) { rh = xl; rl = xh; }
    else {
      rot -= 32;
      rl = ((xh >>> rot) | (xl << (32 - rot))) >>> 0;
      rh = ((xl >>> rot) | (xh << (32 - rot))) >>> 0;
    }
    this._hi = rh; this._lo = rl;
    return rl;
  };

  /** next_uint32 with numpy's has_uint32 / uinteger carry */
  PCG64.prototype.next32 = function () {
    if (this.has_uint32) {
      this.has_uint32 = 0;
      return this.uinteger;
    }
    var lo = this.next64();
    this.has_uint32 = 1;
    this.uinteger = this._hi;
    return lo;
  };

  /** random_raw(n): n 64-bit words as 16-hex-digit strings (for testing) */
  PCG64.prototype.random_raw_hex = function (n) {
    var out = new Array(n), i, h, l;
    for (i = 0; i < n; i++) {
      this.next64();
      h = this._hi.toString(16); while (h.length < 8) h = '0' + h;
      l = this._lo.toString(16); while (l.length < 8) l = '0' + l;
      out[i] = h + l;
    }
    return out;
  };

  /** .state, hex-encoded: {state, inc, has_uint32, uinteger} */
  PCG64.prototype.state_hex = function () {
    return {
      state: limbsToHex(this._state), inc: limbsToHex(this._inc),
      has_uint32: this.has_uint32, uinteger: this.uinteger
    };
  };
  PF.PCG64 = PCG64;

  // --------------------------------------------------------------- Generator

  // x * y for two uint32 as an exact 64-bit (hi, lo) pair, via 16-bit halves.
  var mHi = 0, mLo = 0;
  function mul32x32(x, y) {
    var yh = y >>> 16, yl = y & 0xFFFF;
    var p0 = x * yl;                          // < 2^48, exact
    var p1 = x * yh;                          // < 2^48, exact
    var q_lo = p1 % 65536, q_hi = (p1 - q_lo) / 65536;
    var p0lo = p0 % TWO32, p0hi = (p0 - p0lo) / TWO32;
    var sum = p0lo + q_lo * 65536;            // < 2^33, exact
    mLo = sum % TWO32;
    mHi = p0hi + q_hi + (sum - mLo) / TWO32;
  }

  // random_bounded_uint64(bitgen, 0, rng, 0, use_masked=False), rng < 2^32
  function bounded(bg, rng) {
    if (rng === 0) return 0;
    if (rng === MASK32) return bg.next32();
    var rngExcl = rng + 1;
    mul32x32(bg.next32(), rngExcl);
    var leftover = mLo, hi = mHi;
    if (leftover < rngExcl) {
      var threshold = (MASK32 - rng) % rngExcl;
      while (leftover < threshold) {
        mul32x32(bg.next32(), rngExcl);
        leftover = mLo; hi = mHi;
      }
    }
    return hi;
  }

  // Generator._shuffle_int(n, first, data): Fisher-Yates from the top,
  // stopping at `first`.
  function shuffleInt(bg, data, n, first) {
    var i, j, t;
    for (i = n - 1; i >= first; i--) {
      j = bounded(bg, i);
      t = data[j]; data[j] = data[i]; data[i] = t;
    }
  }

  // _gen_mask: smallest 2^k - 1 >= v  (v < 2^32 here)
  function genMask(v) {
    var m = v >>> 0;
    m |= m >>> 1; m |= m >>> 2; m |= m >>> 4; m |= m >>> 8; m |= m >>> 16;
    return m >>> 0;
  }

  function Generator(bitgen) {
    if (!(this instanceof Generator)) return new Generator(bitgen);
    if (!(bitgen instanceof PCG64)) err('Generator needs a PF.PCG64');
    this.bit_generator = bitgen;
  }

  /**
   * Generator.choice(a, size, replace=False, p=None, axis=0, shuffle=True)
   * for an integer population, WITHOUT replacement (the only form
   * pixelfixer uses; replace=True and p= throw).
   *
   * @param {number} pop     population size (a = arange(pop))
   * @param {number} size    number of indices to draw, <= pop
   * @param {object} [opts]  {replace: false (required), shuffle: true}
   * @returns {Int32Array}   indices in numpy's order (order matters: the
   *                         sample feeds k-means++ seeding by position)
   */
  Generator.prototype.choice = function (pop, size, opts) {
    opts = opts || {};
    if (opts.replace !== false) err('choice: only replace=False is ported (pass {replace: false})');
    if (opts.p !== undefined && opts.p !== null) err('choice: p= is not ported');
    var shuffle = (opts.shuffle === undefined || opts.shuffle === null) ? true : !!opts.shuffle;
    if (typeof pop !== 'number' || pop !== Math.floor(pop)) err('choice: a must be an integer population');
    if (typeof size !== 'number' || size !== Math.floor(size) || size < 0) err('choice: size must be a non-negative integer');
    if (pop >= 2147483648) err('choice: population >= 2^31 is beyond the Int32 index range');
    if (size > pop) err('Cannot take a larger sample than population when replace is False');
    if (pop <= 0 && size > 0) err('a must be greater than 0 unless no samples are taken');
    var bg = this.bit_generator;
    var cutoff = shuffle ? 50 : 20;
    var i, j, idx;
    if (pop > 10000 && size > Math.floor(pop / cutoff)) {
      // Tail shuffle size elements
      idx = new Int32Array(pop);
      for (i = 0; i < pop; i++) idx[i] = i;
      shuffleInt(bg, idx, pop, Math.max(pop - size, 1));
      return idx.slice(pop - size);
    }
    // Floyd's algorithm
    var out = new Int32Array(size);
    if (size === 0) return out;
    var setSize = Math.floor(1.2 * size);     // <uint64_t>(1.2 * size_i)
    var mask = genMask(setSize);
    setSize = mask + 1;
    var hashSet = new Int32Array(setSize);
    hashSet.fill(-1);
    var val, loc;
    for (j = pop - size; j < pop; j++) {
      val = bounded(bg, j);
      loc = (val & mask) >>> 0;
      while (hashSet[loc] !== -1 && hashSet[loc] !== val) loc = ((loc + 1) & mask) >>> 0;
      if (hashSet[loc] === -1) {              // val not in hash_set
        hashSet[loc] = val;
        out[j - pop + size] = val;
      } else {                                // we need to insert j instead
        loc = (j & mask) >>> 0;
        while (hashSet[loc] !== -1) loc = ((loc + 1) & mask) >>> 0;
        hashSet[loc] = j;
        out[j - pop + size] = j;
      }
    }
    if (shuffle) shuffleInt(bg, out, size, 1);
    return out;
  };
  PF.Generator = Generator;

  /** np.random.default_rng(seed) -> Generator(PCG64(seed)) */
  PF.default_rng = function (seed) {
    if (seed === undefined || seed === null) err('default_rng: an explicit integer seed is required (OS entropy is not reproducible)');
    return new Generator(new PCG64(seed));
  };

  PF.versionNpRandom = 'pf-04-nprandom/1';
})();

/* ==== pf-05-mathshim.js =========================================== */
/* PF.exp, PF.log, PF.logF32 - the three numpy scalar maths functions the
   autocorr port asks pf-00-base.js for, which pf-00-base.js does not have.
   Two agents wrote the two files without seeing each other and disagreed
   about the contract; this is the missing side of it.

   THESE ARE THE PLATFORM'S, NOT CORRECTLY ROUNDED, AND THAT IS A DECISION
   RATHER THAN AN OVERSIGHT.

   What autocorr wanted, in its own words, is "correctly rounded
   double-double implementations that match the UCRT wherever it is
   correctly rounded (3560/3572 and 4996/5000 of the probe samples)".
   V8's Math.exp and Math.log differ from numpy's in the last bit on about
   9% and 5% of arguments respectively.

   That figure is frightening in the abstract and small where it lands. The
   last-bit-sensitive path was already dealt with by the agent that found
   it: the 72 comb weights exp(-(k-1)/k0) are a TABLE of numpy's exact
   values in pf-20-autocorr.js, precisely because "every comb, anti-comb and
   cepstrum score is a weighted sum with these, so a last-bit change here
   moves every score". What is left calling exp and log at run time is a
   handful of coarse decisions - train_quality's exp(-4*rms), detect's
   log(sx/sy) ratio test, the Hann-like window in the peak scorer, and
   band_cepstrum's per-bin float32 log.

   So the question is not "do these round like numpy" - they do not - but
   "does any ANSWER move". That is measurable, and tools/test-detect.js
   measures it: the detected cols, rows, step and consensus for every
   fixture and every example image, against the Python reference run in the
   same mode. Any drift shows up there as a different grid, which is the
   only difference a person using the Fix pixels tab could ever see.

   If a future image is found where the last bit does decide the grid, the
   fix is to port a correctly rounded exp and log here, and this comment is
   the record of why they were not needed first. */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  /* numpy's np.exp / np.log on a float64 scalar are the C library's, which
     on this machine is the UCRT. V8's are its own. Where they disagree it is
     by one unit in the last place. */
  PF.exp = function exp(x) { return Math.exp(x); };
  PF.log = function log(x) { return Math.log(x); };

  /* numpy's float32 log is a SIMD kernel, NOT float32(log(float64(x))) -
     tools/probe-f32log.py exists because that difference was checked rather
     than assumed. This is the float64 log rounded to float32, which agrees
     with the SIMD kernel on the overwhelming majority of arguments and
     differs by one float32 ulp on the rest. Used per frequency bin inside
     band_cepstrum, whose output is then centred, normalised by its own
     standard deviation and scored - three operations that each wash out a
     last-bit difference in one bin of several hundred. */
  PF.logF32 = function logF32(x) { return Math.fround(Math.log(x)); };

  PF.versionMathShim = 1;
})();

/* ==== pf-10-colorspace.js ========================================= */
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

/* ==== pf-11-quantize.js =========================================== */
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

/* ==== pf-20-autocorr.js =========================================== */
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

/* ==== pf-21-runlengths.js ========================================= */
/* pf-21-runlengths.js -- port of pixelfixer/runlengths.py (276 lines).
 *
 * Grid detection from boundary-run statistics + robust soft-GCD lattice fit.
 *
 * Idea: pixel art (even mushy/warped) is made of RUNS. Along each scanline
 * the distances between consecutive color-change boundaries are
 * (approximately) integer multiples of the cell size s. Collect multi-lag
 * boundary distances across all scanlines into a sub-pixel histogram and
 * score candidate steps s by a comb function  S(s) = mean_r cos(2*pi*r/s):
 * every distance that is a multiple of s contributes +1, off-lattice
 * distances cancel out. Completely phase-free, so per-region phase shifts
 * (sprite sheets) and jitter/warp are tolerated.
 *
 * Pipeline:
 *   1. median-filter, gradient along the scan axis, box-smooth PERPENDICULAR
 *      to it (real cell boundaries persist across >= a cell of scanlines;
 *      noise edges don't), non-max suppression, parabolic sub-pixel peaks.
 *   2. multi-lag distance pooling (lag 1..4): a spurious boundary splits a
 *      run into off-lattice halves at lag 1, but lag 2 jumps across it and
 *      lands back on the lattice -- robust to over-segmentation; missing
 *      boundaries just produce higher multiples of s, which the comb also
 *      rewards.
 *   3. comb scoring over s in [2.05, 26); divisor aliases (s/2, s/3 divide
 *      every multiple of s too) resolved by noise asymmetry (residual eps
 *      costs phase 2*pi*eps/s -- smaller s punished harder) plus an explicit
 *      "largest near-tied peak with fundamental support" rule.
 *   4. sub-pixel refinement: fine comb search + k-weighted least squares
 *      (the k=1 run mode is the most bias-prone under mush; long baselines
 *      average boundary noise out).
 *   5. LOCAL-STEP INTEGRATION: AI-generated grids drift in scale, so the
 *      dominant local pitch != W/cols. Re-estimate the step in overlapping
 *      2D tiles (fine comb near the global step) and integrate
 *      cols = W * mean(1/s_tile).  This is what rescues drifting "AI soup".
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES (every one of these was MEASURED with tools/probe-rl-dtypes.py
 * and tools/probe-rl-semantics.py against numpy 2.5.3 / cv2 5.0.0 -- the
 * reference venv -- not inferred):
 *
 *  dtype trail.  _prep gives float32 (H,W,4). The gradient d is float32 and
 *  integer-valued (|diff| of uint8-derived values, summed over 4 channels:
 *  <= 1020, exact). cv2.boxFilter keeps float32 (PF.boxFilter models its
 *  FilterEngine path bit-exact for (1,7)). p95 is a float32 scalar
 *  (PF.percentile dtype 'f4'). ys is int64, pos is FLOAT64: int64 xs plus a
 *  float32 offset promotes to float64. runs are float64 differences cast to
 *  float32 AFTER the [RUN_MIN, RUN_MAX] filter (so the filter compares in
 *  float64).
 *
 *  NEP 50 (numpy >= 2): a Python float next to a float32 array is cast to
 *  float32 FIRST and the op runs in float32. That makes all of these
 *  float32, and the port rounds them with Math.fround at every step:
 *      2*np.pi*centers        THR_FRAC*p95        centers/s
 *      runs - s   runs/s   np.round(runs/s)   k*s   res/(0.30*s)
 *      1.0 - res/(0.30*s)   np.clip(.., 0, 1) * ok * k   w*k*k   w*k*runs
 *      dl - 2*dc + dr   0.5*(dl-dr)/safe   np.abs(denom) > 1e-6 (float32
 *      compare)   np.abs(runs - s) < thr (float32 compare)
 *  Only a float32 array next to a float64 ARRAY (or a numpy float64 scalar)
 *  promotes to float64: (2*pi*centers)/s_grid, hist*wk, and the histogram's
 *  (a / np.float64(64.0)) * nb index computation.
 *
 *  Math.fround(x op y) for float32 x, y IS float32 arithmetic for + - * /
 *  (float64 has >= 2p+2 bits, so the double rounding is innocuous).
 *
 *  np.histogram(runs, bins=nb, range=(0, 64)) with nb = int(64/bin)+1:
 *  NOTE nb is 257 for BIN=0.25 and 1281 for 0.05 -- ONE MORE than 64/bin,
 *  so the bin width is 64/257, not 0.25; that is the reference's behaviour
 *  and it is kept. bin_type = result_type(0.0, 64.0, float32 runs) is
 *  float32, so the edges are linspace(0,64,nb+1) cast to float32 and the
 *  centers are float32. Indices come from the fast equal-bins path with its
 *  two edge fix-ups (numpy/lib/_histograms_impl.py, read in the venv).
 *
 *  Reductions.  ndarray.sum() on a 1-D float array is numpy's pairwise sum
 *  in the array's dtype (PF.sum, measured); an axis-0 sum of a 2-D product
 *  (the comb scores) is a SEQUENTIAL row accumulation in float64
 *  (measured bit-exact against a per-column pairwise alternative, which is
 *  NOT exact). hist.sum() / total are integer counts: exact in any order.
 *
 *  argsort.  runlengths.py:134 uses numpy's default (non-stable) argsort
 *  and reverses it. PF.argsort is stable (see pf-00-base.js for why the
 *  default kind is not reproducible); the permutation is identical
 *  whenever the local-maximum scores are distinct, which
 *  tools/parity-runlengths.py checks and records per fixture.
 *
 *  np.cos.  numpy's float64 cos equals the C runtime's cos on the reference
 *  machine (0 differences in 201,280 arguments); whether Math.cos agrees
 *  is measured by tools/test-runlengths.js from a dumped table.
 *
 *  Python round() and np.round are round-half-to-EVEN: PF.rint.
 * ---------------------------------------------------------------------------
 * API: PF.runlengths.{_prep, _boundaries, _lag_diffs, _hist, _comb_score,
 * _pick_step, _refine, _tile_peak, _integrate_step, detect}, the reference's
 * names, namespaced so the call graph reads the same and other modules'
 * detect() cannot collide. None becomes null.
 *
 * Images are {d, w, h, cn}: a flat typed array plus explicit width/height,
 * pixels interleaved (RGBA). No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  var S_MIN = 2.05, S_MAX = 26.0;
  var RUN_MIN = 2.0, RUN_MAX = 64.0;
  var BIN = 0.25;       // run-length histogram bin width (px), selection stage
  var COHERENCE = 7;    // perpendicular box-smooth of the gradient before NMS
  var THR_FRAC = 0.10;  // edge threshold as a fraction of the p95 gradient
  var MAX_LAG = 4;      // boundary-distance pooling depth
  var TILINGS = [[3, 3], [5, 5], [1, 8]];  // (perp, scan) tile grids to pool

  var TWO_PI_F32 = fr(2 * Math.PI);   // 2*np.pi is cast to float32 before it meets the float32 centers (NEP 50)

  // Negative-control switches for tools/test-runlengths.js. Each one flips a
  // measured numpy semantic to its "obvious" reading so the test can prove
  // it is capable of failing; production leaves them all true.
  var SEM = {
    twoPiFloat32: true,   // 2*np.pi*centers is a float32 product
    sumFloat32: true,     // (w*k*k).sum() is a float32 pairwise sum
    histNbPlusOne: true   // np.histogram gets int(64/bin)+1 bins, not 64/bin
  };

  function check(cond, msg) { if (!cond) throw new Error('PF.runlengths: ' + msg); }

  // ---------------------------------------------------------------- boundaries

  /** Median-filtered float image, alpha folded in as an extra channel.
   *  @param {{d:Uint8Array|Uint8ClampedArray, w, h, cn:4}} rgba
   *  @returns {{d:Float32Array, w, h, cn:4}} */
  function _prep(rgba) {
    check(rgba && rgba.cn === 4 && rgba.d.length === rgba.w * rgba.h * 4, '_prep expects an interleaved RGBA image');
    var w = rgba.w, h = rgba.h, n = w * h, src = rgba.d, i;
    // cv2.medianBlur(rgba[:, :, :3], 3) and cv2.medianBlur(rgba[:, :, 3], 3):
    // two calls in the reference (the RGB slice is copied contiguous by the
    // bindings); medianBlur is per-channel, so the split only mirrors it.
    var rgb = new src.constructor(n * 3), a = new src.constructor(n);
    for (i = 0; i < n; i++) {
      rgb[i * 3] = src[i * 4];
      rgb[i * 3 + 1] = src[i * 4 + 1];
      rgb[i * 3 + 2] = src[i * 4 + 2];
      a[i] = src[i * 4 + 3];
    }
    var mrgb = PF.medianBlur({ d: rgb, w: w, h: h, cn: 3 }, 3).d;
    var ma = PF.medianBlur({ d: a, w: w, h: h, cn: 1 }, 3).d;
    var out = new Float32Array(n * 4);           // .astype(np.float32) + np.dstack
    for (i = 0; i < n; i++) {
      out[i * 4] = mrgb[i * 3];
      out[i * 4 + 1] = mrgb[i * 3 + 1];
      out[i * 4 + 2] = mrgb[i * 3 + 2];
      out[i * 4 + 3] = ma[i];
    }
    return { d: out, w: w, h: h, cn: 4 };
  }

  /** Sub-pixel color-boundary positions along `axis`.
   *
   *  axis=1 -> boundaries along x within each row (for step_x).
   *  axis=0 -> boundaries along y within each column (for step_y).
   *  Returns {ys, pos}: scanline index (Int32Array) and position
   *  (Float64Array), scanline-major order.
   */
  function _boundaries(img4, axis) {
    check(axis === 0 || axis === 1, '_boundaries: axis must be 0 or 1');
    var W = img4.w, H = img4.h, src = img4.d;
    // np.transpose(img4, (1, 0, 2)) for axis 0 is expressed as strides: a
    // scanline is a row (axis 1) or a column (axis 0).
    var nScan = axis === 1 ? H : W;      // number of scanlines
    var L = axis === 1 ? W : H;          // scanline length
    var sStride = axis === 1 ? W * 4 : 4;    // between scanlines
    var pStride = axis === 1 ? 4 : W * 4;    // along a scanline
    var Wd = L - 1;                      // d is (nScan, L-1)
    var empty = { ys: new Int32Array(0), pos: new Float64Array(0) };
    if (Wd <= 0 || nScan <= 0) return empty;   // d.size == 0
    // L1 color+alpha difference between neighbors along the scan axis.
    // Integer-valued (<= 4*255), so the float32 channel sum is exact in any
    // order; accumulated in float64 and stored as float32.
    var d = new Float32Array(nScan * Wd);
    var y, x, base, o, s;
    for (y = 0; y < nScan; y++) {
      base = y * sStride;
      for (x = 0; x < Wd; x++) {
        o = base + x * pStride;
        s = Math.abs(src[o + pStride] - src[o]) +
            Math.abs(src[o + pStride + 1] - src[o + 1]) +
            Math.abs(src[o + pStride + 2] - src[o + 2]) +
            Math.abs(src[o + pStride + 3] - src[o + 3]);
        d[y * Wd + x] = s;
      }
    }
    // coherence: true cell boundaries persist across the perpendicular axis
    // for at least a cell of scanlines; incoherent noise edges do not.
    d = PF.boxFilter({ d: d, w: Wd, h: nScan }, [1, COHERENCE], { borderType: 'replicate' }).d;
    // p95 of the positive gradients -- a float32 percentile of float32 data
    var npos = 0, i;
    for (i = 0; i < d.length; i++) if (d[i] > 0) npos++;
    var p95 = 0.0;
    if (npos > 0) {
      var posv = new Float32Array(npos), k = 0;
      for (i = 0; i < d.length; i++) if (d[i] > 0) posv[k++] = d[i];
      p95 = PF.percentile(posv, 95, 'f4');
    }
    // THR_FRAC * p95 is float32 (Python float x np.float32 scalar); the
    // comparison d > thr then runs in float32 either way.
    var thr = Math.max(20.0, fr(fr(THR_FRAC) * p95));
    // non-max suppression along the scan axis: strict on the left, >= on
    // the right; left/right are zero-padded (left[:,0]=0, right[:,-1]=0)
    var ysA = [], xsA = [], left, right, v;
    for (y = 0; y < nScan; y++) {
      base = y * Wd;
      for (x = 0; x < Wd; x++) {
        v = d[base + x];
        left = x > 0 ? d[base + x - 1] : 0;
        right = x < Wd - 1 ? d[base + x + 1] : 0;
        if (v > thr && v > left && v >= right) { ysA.push(y); xsA.push(x); }
      }
    }
    var n = xsA.length;
    if (n < 4) return empty;
    // parabolic sub-pixel refinement of the gradient peak, float32 throughout
    var ys = new Int32Array(n), pos = new Float64Array(n);
    var eps32 = fr(1e-6);                 // np.abs(denom) > 1e-6 compares in float32
    var dl, dr, dc, denom, safe, off, xi;
    for (i = 0; i < n; i++) {
      y = ysA[i]; xi = xsA[i]; base = y * Wd;
      dl = d[base + (xi - 1 > 0 ? xi - 1 : 0)];            // np.maximum(xs - 1, 0)
      dr = d[base + (xi + 1 < Wd - 1 ? xi + 1 : Wd - 1)];  // np.minimum(xs + 1, W-1)
      dc = d[base + xi];
      denom = fr(fr(dl - fr(2 * dc)) + dr);                // dl - 2*dc + dr, left to right
      if (Math.abs(denom) > eps32) {
        safe = denom;
        off = fr(fr(0.5 * fr(dl - dr)) / safe);            // 0.5 * (dl - dr) / safe
      } else {
        off = 0.0;
      }
      // np.clip(off, -0.5, 0.5) in float32, then int64 + float32 -> float64
      off = PF.clipScalar(off, -0.5, 0.5);
      ys[i] = y;
      pos[i] = xi + off;
    }
    return { ys: ys, pos: pos };
  }

  /** Pooled pos[i+lag]-pos[i], lag=1..max_lag, within each scanline.
   *  The [RUN_MIN, RUN_MAX] filter runs on the float64 differences; the
   *  survivors are cast to float32 (np.concatenate(out).astype(np.float32)).
   *  @returns {Float32Array} */
  function _lag_diffs(ys, pos, maxLag) {
    if (maxLag === undefined || maxLag === null) maxLag = MAX_LAG;
    var n = pos.length, lag, i, dd, out = [];
    for (lag = 1; lag <= maxLag; lag++) {
      if (n <= lag) break;
      for (i = 0; i + lag < n; i++) {
        if (ys[i + lag] !== ys[i]) continue;
        dd = pos[i + lag] - pos[i];
        if (dd >= RUN_MIN && dd <= RUN_MAX) out.push(dd);
      }
    }
    var res = new Float32Array(out.length);
    for (i = 0; i < out.length; i++) res[i] = out[i];    // the store is the float32 cast
    return res;
  }

  // ---------------------------------------------------------------- soft GCD

  /** np.histogram(runs, bins=int(RUN_MAX/bin_w)+1, range=(0, RUN_MAX)),
   *  reduced to the non-empty bins.
   *  @param {Float32Array} runs
   *  @returns {{hist:Float64Array, centers:Float32Array, nb:number}} */
  function _hist(runs, binW) {
    check(runs instanceof Float32Array, '_hist expects float32 runs (the reference casts them)');
    var nb = Math.trunc(RUN_MAX / binW) + (SEM.histNbPlusOne ? 1 : 0);   // 257 for 0.25, 1281 for 0.05 (64/0.05 == 1280.0 in float64, measured)
    // bin_type = result_type(0.0, 64.0, float32) = float32 (NEP 50): edges
    // are linspace(0, 64, nb+1) computed in float64 and cast to float32.
    var e64 = PF.linspace(0, RUN_MAX, nb + 1);
    var edges = new Float32Array(nb + 1), i;
    for (i = 0; i <= nb; i++) edges[i] = e64[i];
    var counts = new Float64Array(nb);
    var r, a, idx;
    for (i = 0; i < runs.length; i++) {
      r = runs[i];
      if (!(r >= 0 && r <= RUN_MAX)) continue;          // keep = (a >= first) & (a <= last); NaN drops out too
      a = fr(r - 0);                                    // _unsigned_subtract(tmp_a, first_edge) in float32
      // f32 array / np.float64(64.0) -> float64 (a numpy scalar is not weak), * nb in float64
      idx = Math.trunc((a / RUN_MAX) * nb);             // .astype(np.intp)
      if (idx === nb) idx -= 1;                         // values exactly on last_edge
      if (a < edges[idx]) idx -= 1;                     // ~1 ULP inconsistencies of the index formula
      if (a >= edges[idx + 1] && idx !== nb - 1) idx += 1;   // last bin includes its right edge
      counts[idx] += 1;
    }
    var keep = 0;
    for (i = 0; i < nb; i++) if (counts[i] > 0) keep++;
    var hist = new Float64Array(keep), centers = new Float32Array(keep), k = 0;
    for (i = 0; i < nb; i++) {
      if (counts[i] > 0) {
        hist[k] = counts[i];
        centers[k] = fr(0.5 * fr(edges[i] + edges[i + 1]));   // 0.5 * (edges[:-1] + edges[1:]) in float32
        k++;
      }
    }
    return { hist: hist, centers: centers, nb: nb };
  }

  // 2*np.pi*centers as numpy evaluates it: float32 product per center.
  function twoPiCenters(centers) {
    var out = new Float64Array(centers.length), i;
    if (SEM.twoPiFloat32) {
      for (i = 0; i < centers.length; i++) out[i] = fr(TWO_PI_F32 * centers[i]);
    } else {
      for (i = 0; i < centers.length; i++) out[i] = 2 * Math.PI * centers[i];   // control: float64 product
    }
    return out;
  }

  // (w[:, None] * cos(c2[:, None] / grid[None, :])).sum(0): numpy reduces
  // axis 0 of a C-contiguous product by adding the rows in order (measured
  // bit-exact; a per-column pairwise sum is NOT).
  function combRows(w, c2, grid) {
    var m = grid.length, n = w.length, S = new Float64Array(m), i, j, wi, ci;
    for (i = 0; i < n; i++) {
      wi = w[i]; ci = c2[i];
      for (j = 0; j < m; j++) S[j] += wi * Math.cos(ci / grid[j]);
    }
    return S;
  }

  /** S(s) = weighted mean over distances of cos(2*pi*r/s).
   *  @param {Float32Array} runs
   *  @param {Float64Array} sGrid
   *  @param {number} [binW=BIN]
   *  @param {function(Float32Array):Float64Array} [weights]  optional per-center weight (unused by the reference)
   *  @returns {{S:Float64Array, total:number}} */
  function _comb_score(runs, sGrid, binW, weights) {
    if (binW === undefined || binW === null) binW = BIN;
    if (runs.length === 0) return { S: new Float64Array(sGrid.length), total: 0.0 };
    var h = _hist(runs, binW);
    var total = PF.sum(h.hist);
    var w = h.hist, i;
    if (weights) {
      var wt = weights(h.centers);
      w = new Float64Array(h.hist.length);
      for (i = 0; i < w.length; i++) w[i] = h.hist[i] * wt[i];
    }
    var S = combRows(w, twoPiCenters(h.centers), sGrid);
    var wsum = PF.sum(w);
    for (i = 0; i < S.length; i++) S[i] = S[i] / wsum;
    return { S: S, total: total };
  }

  /** Best step from the comb score, with largest-near-tie divisor logic.
   *  @returns {{s:number|null, v:number, cands:Array<[number,number]>}} */
  function _pick_step(runs, sGrid) {
    var cs = _comb_score(runs, sGrid), S = cs.S, total = cs.total;
    var none = { s: null, v: 0.0, cands: [] };
    if (total < 50) return none;
    var n = S.length, idxA = [], i;
    for (i = 1; i < n - 1; i++) {
      if (S[i] > S[i - 1] && S[i] >= S[i + 1]) idxA.push(i);   // loc[1:-1]
    }
    if (idxA.length === 0) return none;
    var idx = new Int32Array(idxA);
    // idx[np.argsort(S[idx])[::-1]] -- stable sort reversed; identical to
    // numpy's default whenever the scores are distinct (see header)
    var perm = PF.reversed(PF.argsort(PF.take(S, idx)));
    var order = new Int32Array(perm.length);
    for (i = 0; i < perm.length; i++) order[i] = idx[perm[i]];
    var smax = S[order[0]];
    if (smax <= 0) return none;
    var cands = [];
    for (i = 0; i < order.length && i < 12; i++) cands.push([sGrid[order[i]], S[order[i]]]);

    function fund(s) {  // mass of distances near 1*s (fundamental support)
      // np.abs(runs - s) < max(0.6, 0.18*s): runs is float32, so s and the
      // threshold are cast to float32 and the subtraction is float32
      var sf = fr(s), thr = fr(Math.max(0.6, 0.18 * s)), m = 0, j;
      for (j = 0; j < runs.length; j++) if (Math.abs(fr(runs[j] - sf)) < thr) m++;
      return m / total;
    }

    // among near-tied peaks prefer the LARGEST s with fundamental support --
    // kills the s/2, s/3 divisor aliases on clean lattices. The ratio can be
    // generous because larger FALSE steps are anti-phase for odd multiples
    // of the true step (cos(pi*odd) = -1) and score far below the true peak.
    var tied = [];
    for (i = 0; i < order.length; i++) {
      if (S[order[i]] >= 0.70 * smax) tied.push([sGrid[order[i]], S[order[i]], i]);
    }
    tied.sort(function (p, q) {            // key=lambda t: -t[0], stable
      if (p[0] > q[0]) return -1;
      if (p[0] < q[0]) return 1;
      return p[2] - q[2];
    });
    var bestS = sGrid[order[0]], bestV = smax;
    for (i = 0; i < tied.length; i++) {
      if (fund(tied[i][0]) >= 0.04) { bestS = tied[i][0]; bestV = tied[i][1]; break; }
    }
    return { s: bestS, v: bestV, cands: cands };
  }

  /** Sub-pixel refinement: fine comb (k-weighted) + k-weighted LS polish.
   *  @param {Float32Array} runs
   *  @param {number} s
   *  @returns {number} */
  function _refine(runs, s) {
    if (runs.length === 0) return s;
    var h = _hist(runs, 0.05);
    var fine = PF.arange(0.94 * s, 1.06 * s, 0.002);
    // wk = centers / s  -- float32 / Python float -> float32 (NEP 50);
    // hist * wk         -- float64 * float32 -> float64
    var sf = fr(s), n = h.hist.length, i;
    var hw = new Float64Array(n);
    for (i = 0; i < n; i++) hw[i] = h.hist[i] * fr(h.centers[i] / sf);   // weight by multiple k: favors long baselines
    var Sf = combRows(hw, twoPiCenters(h.centers), fine);
    s = fine[PF.argmax(Sf)];
    var N = runs.length, it, j, k, res, w, den, num;
    var wkk = new Float32Array(N), wkr = new Float32Array(N);
    for (it = 0; it < 2; it++) {
      sf = fr(s);
      var s03 = fr(0.30 * s);                          // (0.30 * s) is a Python float; cast once, as numpy does
      for (j = 0; j < N; j++) {
        k = PF.rint(fr(runs[j] / sf));                 // np.round(runs / s), float32 in, half-to-even
        res = Math.abs(fr(runs[j] - fr(k * sf)));      // np.abs(runs - k * s)
        // np.clip(1.0 - res / (0.30 * s), 0, 1) * ok * k
        w = PF.clipScalar(fr(1.0 - fr(res / s03)), 0, 1);
        w = fr(w * (k >= 1 ? 1 : 0));
        w = fr(w * k);
        wkk[j] = fr(fr(w * k) * k);                    // (w * k) * k
        wkr[j] = fr(fr(w * k) * runs[j]);              // (w * k) * runs
      }
      if (SEM.sumFloat32) {
        den = PF.sum(wkk);                             // float32 pairwise sum
        if (den <= 0) break;
        num = PF.sum(wkr);
        s = fr(num / den);                             // float32 division, then float()
      } else {                                         // control: float64 accumulation
        den = PF.pairwiseSum(new Float64Array(wkk), 0, N, false);
        if (den <= 0) break;
        num = PF.pairwiseSum(new Float64Array(wkr), 0, N, false);
        s = num / den;
      }
    }
    return s;
  }

  // ------------------------------------------------------ local-step integration

  /** Fine comb peak near s0 for one tile; null if unreliable. */
  function _tile_peak(diffs, s0) {
    if (diffs.length < 350) return null;
    var fine = PF.arange(0.87 * s0, 1.13 * s0, 0.005);
    var h = _hist(diffs, 0.05);
    var S = combRows(h.hist, twoPiCenters(h.centers), fine);
    var hsum = PF.sum(h.hist), i;
    for (i = 0; i < S.length; i++) S[i] = S[i] / hsum;
    var pk = PF.argmax(S);
    if (pk === 0 || pk === fine.length - 1 || S[pk] < 0.12) {
      return null;  // peak at window edge or too weak -> distrust
    }
    return fine[pk];
  }

  /** cols = W * mean(1/s_local): pooled over several tile grids.
   *
   *  AI pseudo-grids drift in scale; the global comb finds the DOMINANT local
   *  pitch, which can differ from W/cols by several percent. Estimating the
   *  step per tile and averaging 1/s recovers the global cell count.
   */
  function _integrate_step(ys, pos, nPerp, nScan, s0) {
    var inv = [], t, i, j, q, n = pos.length;
    for (t = 0; t < TILINGS.length; t++) {
      var tp = TILINGS[t][0], tsc = TILINGS[t][1];
      var ye = PF.linspace(0, nPerp, tp + 1);
      var xe = PF.linspace(0, nScan, tsc + 1);
      for (i = 0; i < tp; i++) {
        for (j = 0; j < tsc; j++) {
          var ysA = [], posA = [];
          for (q = 0; q < n; q++) {
            if (ys[q] >= ye[i] && ys[q] < ye[i + 1] && pos[q] >= xe[j] && pos[q] < xe[j + 1]) {
              ysA.push(ys[q]); posA.push(pos[q]);
            }
          }
          var sI = _tile_peak(_lag_diffs(new Int32Array(ysA), new Float64Array(posA)), s0);
          if (sI !== null) inv.push(1.0 / sI);
        }
      }
    }
    if (inv.length === 0) return s0;
    var arr = new Float64Array(inv);
    return 1.0 / (PF.sum(arr) / arr.length);          // np.mean: pairwise sum / n
  }

  // ---------------------------------------------------------------- detect

  /** @param {{d:Uint8Array|Uint8ClampedArray, w, h, cn:4}} rgba
   *  @returns {object} the reference's dict, keys verbatim */
  function detect(rgba) {
    var h = rgba.h, w = rgba.w;
    var img4 = _prep(rgba);
    var sGrid = PF.arange(S_MIN, S_MAX, 0.01);

    var axes = {}, spec = [[1, 'x'], [0, 'y']], a;
    for (a = 0; a < 2; a++) {
      var axis = spec[a][0], name = spec[a][1];
      var b = _boundaries(img4, axis);
      var runs = _lag_diffs(b.ys, b.pos);
      var pk = _pick_step(runs, sGrid);
      var s = pk.s;
      if (s !== null) s = _refine(runs, s);
      axes[name] = { s: s, v: pk.v, cands: pk.cands, nruns: runs.length, runs: runs, ys: b.ys, pos: b.pos };
    }

    var sx = axes.x.s, sy = axes.y.s;
    var vx = axes.x.v, vy = axes.y.v;
    if (sx === null && sy === null) {
      return { step_x: 8.0, step_y: 8.0, cols: PF.rint(w / 8), rows: PF.rint(h / 8),
               phase_x: 0.0, phase_y: 0.0, candidates: [] };
    }
    // cross-axis reconciliation: a weak axis borrows the strong axis's step
    if (sx === null || (sy !== null && vx < 0.5 * vy && Math.abs(sx - sy) > 0.15 * sy)) {
      var sx2 = axes.x.runs.length ? _refine(axes.x.runs, sy) : sy;
      if (Math.abs(sx2 - sy) < 0.15 * sy) sx = sx2;
    }
    if (sy === null || (sx !== null && vy < 0.5 * vx && Math.abs(sy - sx) > 0.15 * sx)) {
      var sy2 = axes.y.runs.length ? _refine(axes.y.runs, sx) : sx;
      if (Math.abs(sy2 - sx) < 0.15 * sx) sy = sy2;
    }
    if (sx === null) sx = sy;
    if (sy === null) sy = sx;

    // local-step integration (drift-aware effective step)
    sx = _integrate_step(axes.x.ys, axes.x.pos, h, w, sx);
    sy = _integrate_step(axes.y.ys, axes.y.pos, w, h, sy);

    // square-cell reconciliation: AI pseudo-pixels are near-square; when the
    // two axes land within ~8.5% of each other the residual disagreement is
    // mostly noise, so pool them (harmonic mean preserves cell counts).
    var rel = Math.abs(sx - sy) / (0.5 * (sx + sy));
    if (rel < 0.085 || (rel < 0.15 && Math.max(vx, vy) < 0.15)) {
      sx = sy = 2.0 / (1.0 / sx + 1.0 / sy);
    }

    // sorted(x + y, key=lambda t: -t[1]) -- Python's sort is stable
    var cands = [], i;
    for (i = 0; i < axes.x.cands.length; i++) cands.push([axes.x.cands[i][0], axes.x.cands[i][1], cands.length]);
    for (i = 0; i < axes.y.cands.length; i++) cands.push([axes.y.cands[i][0], axes.y.cands[i][1], cands.length]);
    cands.sort(function (p, q) {
      if (p[1] > q[1]) return -1;
      if (p[1] < q[1]) return 1;
      return p[2] - q[2];
    });
    for (i = 0; i < cands.length; i++) cands[i] = [cands[i][0], cands[i][1]];

    return {
      step_x: sx, step_y: sy,
      cols: PF.rint(w / sx), rows: PF.rint(h / sy),
      phase_x: 0.0, phase_y: 0.0,
      score_x: vx, score_y: vy,
      nruns_x: axes.x.nruns, nruns_y: axes.y.nruns,
      candidates: cands
    };
  }

  PF.runlengths = {
    S_MIN: S_MIN, S_MAX: S_MAX, RUN_MIN: RUN_MIN, RUN_MAX: RUN_MAX, BIN: BIN,
    COHERENCE: COHERENCE, THR_FRAC: THR_FRAC, MAX_LAG: MAX_LAG, TILINGS: TILINGS,
    _prep: _prep,
    _boundaries: _boundaries,
    _lag_diffs: _lag_diffs,
    _hist: _hist,
    _comb_score: _comb_score,
    _pick_step: _pick_step,
    _refine: _refine,
    _tile_peak: _tile_peak,
    _integrate_step: _integrate_step,
    detect: detect,
    // internals exposed for the parity test's negative controls
    _internals: { twoPiCenters: twoPiCenters, combRows: combRows },
    _semantics: SEM
  };
  PF.versionRunlengths = 'pf-21-runlengths/1';
})();

/* ==== pf-22-selfsim.js ============================================ */
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

/* ==== pf-40-reconstruct.js ======================================== */
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

/* ==== pf-50-core.js =============================================== */
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

/* ==== pf-99-api.js ================================================ */
/* PF.process - one call, pixels in, pixel art out.

   The port of python/pixelfixer/api.py's process(), minus the parts that are
   the browser's job. api.py takes PNG bytes and decodes them with Pillow;
   here the caller has already decoded, because a canvas has done it and
   re-implementing PNG in JavaScript to arrive at the same array would be
   work with no product. So this takes the RGBA the browser gives and hands
   back RGBA, and the Fix pixels tab draws it.

   FAST MODE. core.detect refuses mode:"full" and says so - the arbitration
   stage (fusion, varcontrast, channels, reconsearch, about 3,300 lines) is
   not ported yet. Fast mode is the three cheap detectors and their
   agreement, which api.py describes as bounded latency, and which recovers
   the exact native size on every fixture and example image measured here.
   Asking for "full" throws rather than quietly answering with something
   else, because a tab that says it did the thorough thing and did not is
   worse than one that says it cannot.

   PROGRESS IS REPORTED BECAUSE IT HAS TO BE. Detection on a 1448x1086 image
   takes about four seconds in node and no less in a browser; a page that
   sits still that long reads as broken. onProgress(fraction, label) is
   called at the stage boundaries the reference has - the two are not a
   guess at a percentage, they are where the work actually is: detection
   dominates, reconstruction is the rest.
*/
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  /* api.py's caps. The pixel limit is what the reference will accept at
     all; the minimum side is below what any grid detector can say anything
     about. */
  PF.MAX_PIXELS = 4000000;
  PF.MIN_SIDE = 16;

  /* api.py's rule, transcribed. "fast:" is the calibrated early exit, where
     runlengths' comb peak was strong AND autocorr agreed on the size - the
     reference's comment says that combination was always correct on its
     benchmark. A two-detector agreement without that strength is medium. A
     lone detector's answer is low, and says so. */
  function confidenceOf(consensus) {
    consensus = String(consensus || '');
    if (consensus.indexOf('fast:') === 0) return 'high';
    if (consensus === 'arbitrated' || consensus === 'forced') return 'medium';
    if (consensus.indexOf('fastmode:') === 0 && consensus.indexOf('+') >= 0) return 'medium';
    return 'low';
  }

  /**
   * @param {Uint8ClampedArray|Uint8Array} data  interleaved RGBA, w*h*4
   * @param {number} width
   * @param {number} height
   * @param {{mode?:string, forceStep?:number, kColors?:number,
   *          onProgress?:function(number,string)}} [opts]
   * @returns {{cols,rows,stepX,stepY,consensus,confidence,width,height,
   *            data:Uint8ClampedArray, detectMs, reconMs}}
   */
  PF.process = function process(data, width, height, opts) {
    opts = opts || {};
    var mode = opts.mode || 'fast';
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    width = width | 0; height = height | 0;

    if (!data || data.length !== width * height * 4)
      throw new Error('process: data must be RGBA of width*height*4 bytes');
    if (Math.min(width, height) < PF.MIN_SIDE)
      throw new Error('image too small (min side ' + PF.MIN_SIDE + 'px)');
    if (width * height > PF.MAX_PIXELS)
      throw new Error('image too large (' + (width * height / 1e6).toFixed(1) + 'MP > '
        + (PF.MAX_PIXELS / 1e6) + 'MP limit)');

    /* The detectors type-check with `instanceof Uint8Array`, and a
       Uint8ClampedArray - which is what getImageData hands over - is not
       one. Same bytes, different constructor; the view is retyped rather
       than copied. */
    var d = (data instanceof Uint8Array) ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.length);
    var rgba = { d: d, w: width, h: height, cn: 4 };

    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var r;
    if (opts.forceStep > 0) {
      /* api.py's force_step branch: no detection at all, the size follows
         from the step the caller already knows. */
      var fs = +opts.forceStep;
      r = { step_x: fs, step_y: fs,
        cols: Math.max(1, Math.round(width / fs)),
        rows: Math.max(1, Math.round(height / fs)),
        consensus: 'forced' };
      onProgress(0.7, 'using the cell size you gave');
    } else {
      onProgress(0.02, 'looking for the grid');
      r = PF.core.detect(rgba, mode);
      onProgress(0.7, 'found a ' + r.cols + ' by ' + r.rows + ' grid');
    }
    var detectMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    /* two_stage_pack is api.py's default (two_stage=True): quantise only to
       decide which label wins each cell, then colour that cell from the
       ORIGINAL pixels carrying the winning label - crisp edges without
       losing a rare highlight to the quantiser. */
    var low = PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0);
    var reconMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t1;
    onProgress(1, 'done');

    var out = low.d || low;
    return {
      cols: r.cols | 0, rows: r.rows | 0,
      stepX: Math.round(r.step_x * 1e4) / 1e4,
      stepY: Math.round(r.step_y * 1e4) / 1e4,
      consensus: String(r.consensus || ''),
      confidence: confidenceOf(r.consensus),
      width: low.w || r.cols, height: low.h || r.rows,
      data: (out instanceof Uint8ClampedArray) ? out : new Uint8ClampedArray(out),
      detectMs: Math.round(detectMs), reconMs: Math.round(reconMs),
    };
  };

  PF.versionApi = 1;
})();
