/* Pixel Art Fixer - the detector and reconstructor from
 * https://github.com/Retro-Diffusion/pixel-art-fixer (commit ef376e5),
 * ported from Python to dependency-free JavaScript.
 *
 * FAST MODE ONLY. core.detect refuses mode:"full" - the arbitration stage
 * is not ported. Fast mode recovers the exact native size on every fixture
 * and example image measured. Under {reference:true} the reconstruction
 * is byte-identical to the reference; the default departs from it in two
 * measured ways (README, "Where it departs on purpose"). tools/test-detect
 * and tools/test-endtoend are where that is measured rather than claimed.
 *
 * Built by tools/build.js from 21 modules. Do not edit here -
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

  /* ================================================================== *
   * FULL-MODE ADDITIONS (added with pf-06-linalg.js)
   *
   * The scans and reductions fusion / varcontrast / channels / reconsearch
   * call. Every summation ORDER here was measured, not assumed:
   * tools/probe-linalg-reductions.py scores each candidate order bit for
   * bit against numpy 2.5.3 on data where the rival orders disagree, and
   * tools/test-linalg.cjs re-checks the ported code against
   * fixtures/linalg-parity.json. A reduction that "adds the same numbers"
   * in another order is a different float, so the order IS the port.
   * ================================================================== */

  function floatKind(a, what) {
    if (a instanceof Float64Array) return false;
    if (a instanceof Float32Array) return true;
    throw new Error('PF.' + what + ': float32 or float64 data only (got ' +
      (a && a.constructor ? a.constructor.name : typeof a) + ')');
  }
  function prod(shape, from, to) {
    var p = 1, i;
    for (i = from; i < to; i++) p *= shape[i];
    return p;
  }
  function normAxis(axis, nd, what) {
    if (axis < 0) axis += nd;
    check(axis >= 0 && axis < nd && axis === Math.floor(axis), what + ': axis out of range');
    return axis;
  }

  /* numpy's pairwise_sum over a STRIDED run (the same algorithm as
   * pairwise() above; numpy indexes a + i*stride and the block structure
   * depends only on n). */
  function pairwiseS(a, off, n, st, R) {
    var i, res;
    if (n < 8) {
      res = 0.0;
      for (i = 0; i < n; i++) res = R(res + a[off + i * st]);
      return res;
    }
    if (n <= 128) {
      var r0 = a[off], r1 = a[off + st], r2 = a[off + 2 * st], r3 = a[off + 3 * st];
      var r4 = a[off + 4 * st], r5 = a[off + 5 * st], r6 = a[off + 6 * st], r7 = a[off + 7 * st];
      var end = n - (n % 8), p;
      for (i = 8; i < end; i += 8) {
        p = off + i * st;
        r0 = R(r0 + a[p]); r1 = R(r1 + a[p + st]);
        r2 = R(r2 + a[p + 2 * st]); r3 = R(r3 + a[p + 3 * st]);
        r4 = R(r4 + a[p + 4 * st]); r5 = R(r5 + a[p + 5 * st]);
        r6 = R(r6 + a[p + 6 * st]); r7 = R(r7 + a[p + 7 * st]);
      }
      res = R(R(R(r0 + r1) + R(r2 + r3)) + R(R(r4 + r5) + R(r6 + r7)));
      for (; i < n; i++) res = R(res + a[off + i * st]);
      return res;
    }
    var n2 = (n / 2) | 0;
    n2 -= n2 % 8;
    return R(pairwiseS(a, off, n2, st, R) + pairwiseS(a, off + n2 * st, n - n2, st, R));
  }
  PF.pairwiseSumStrided = function (a, off, n, stride, f32) {
    return pairwiseS(a, off, n, stride, f32 ? Math.fround : ident);
  };

  /* ------------------------------------------------------------------ *
   * np.cumsum(a, axis) for a C-contiguous array {d, shape}.
   *
   * add.accumulate is a plain sequential loop IN THE ARRAY'S DTYPE:
   * out[0] = a[0], out[k] = out[k-1] + a[k]. MEASURED 6300/6300 on every
   * axis of float32 and float64 3-D data, and 18060/18060 on reconsearch's
   * own form np.cumsum(img, 1, out=S[:, 1:]) (float32 into float32). The
   * float64-then-cast rival matches 2936/18000 - so float32 input must NOT
   * be widened: reconsearch.py:111's comment ("float32 cumsums stay
   * accurate") is a claim about magnitude, not about bits.
   *   varcontrast.py:51,53,204,207  float64    reconsearch.py:113,115  float32
   * Returns a new array of the input's type.
   * ------------------------------------------------------------------ */
  PF.cumsum = function (d, shape, axis) {
    var f32 = floatKind(d, 'cumsum');
    var R = f32 ? Math.fround : ident;
    if (shape === undefined || shape === null) shape = [d.length];
    var nd = shape.length;
    axis = normAxis(axis === undefined || axis === null ? 0 : axis, nd, 'cumsum');
    checkLen(d, prod(shape, 0, nd), 'cumsum data');
    var n = shape[axis], inner = prod(shape, axis + 1, nd), outer = prod(shape, 0, axis);
    var out = new d.constructor(d.length), o, j, k, p, acc;
    for (o = 0; o < outer; o++) {
      for (j = 0; j < inner; j++) {
        p = o * n * inner + j;
        if (n === 0) continue;
        acc = d[p]; out[p] = acc;
        for (k = 1; k < n; k++) {
          p += inner;
          acc = R(acc + d[p]);
          out[p] = acc;
        }
      }
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.maximum.accumulate(a, axis): out[k] = np.maximum(out[k-1], a[k]),
   * with np.maximum's NaN propagation (channels.py:1221, 1263). Max is
   * exact, so the only semantics to keep are NaN and the +-0 tie rule of
   * PF.npMaximum.
   * ------------------------------------------------------------------ */
  PF.maximum_accumulate = function (d, shape, axis) {
    if (shape === undefined || shape === null) shape = [d.length];
    var nd = shape.length;
    axis = normAxis(axis === undefined || axis === null ? 0 : axis, nd, 'maximum_accumulate');
    checkLen(d, prod(shape, 0, nd), 'maximum_accumulate data');
    var n = shape[axis], inner = prod(shape, axis + 1, nd), outer = prod(shape, 0, axis);
    var out = new d.constructor(d.length), o, j, k, p, acc;
    for (o = 0; o < outer; o++) {
      for (j = 0; j < inner; j++) {
        p = o * n * inner + j;
        if (n === 0) continue;
        acc = d[p]; out[p] = acc;
        for (k = 1; k < n; k++) {
          p += inner;
          acc = npMaximum(acc, d[p]);
          out[p] = acc;
        }
      }
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * np.add.reduceat(a, indices, axis)
   *
   * MEASURED: each segment is a[start] + pairwise_sum(a[start+1:end]) -
   * the first element is COPIED and the rest handed to the pairwise inner
   * loop (ufunc_object.c PyUFunc_Reduceat: memmove of the first item, then
   * the loop in IS_BINARY_REDUCE form). 65/65 on every (dtype, axis) cell;
   * plain sequential scores 19-27/65, pairwise-over-all 21-29/65.
   * numpy's other rules, kept verbatim: the last segment runs to the end
   * of the axis; if indices[i] >= indices[i+1] the i-th output is just
   * a[indices[i]]; an index outside [0, n) raises.
   *   reconsearch.py:130,136,171,180  float64 axis 0
   *   reconsearch.py:179              float32 axis 1 (nbc > 1 only)
   * ------------------------------------------------------------------ */
  PF.add_reduceat = function (d, shape, indices, axis) {
    var f32 = floatKind(d, 'add_reduceat');
    var R = f32 ? Math.fround : ident;
    if (shape === undefined || shape === null) shape = [d.length];
    var nd = shape.length;
    axis = normAxis(axis === undefined || axis === null ? 0 : axis, nd, 'add_reduceat');
    checkLen(d, prod(shape, 0, nd), 'add_reduceat data');
    var n = shape[axis], inner = prod(shape, axis + 1, nd), outer = prod(shape, 0, axis);
    var ni = indices.length, i, o, j, s0, s1, base, oshape = shape.slice();
    for (i = 0; i < ni; i++) {
      check(indices[i] === Math.floor(indices[i]) && indices[i] >= 0 && indices[i] < n,
        'add_reduceat: index ' + indices[i] + ' out-of-bounds for axis of size ' + n);
    }
    oshape[axis] = ni;
    var out = new d.constructor(outer * ni * inner);
    for (o = 0; o < outer; o++) {
      for (i = 0; i < ni; i++) {
        s0 = indices[i];
        s1 = (i + 1 < ni) ? indices[i + 1] : n;
        for (j = 0; j < inner; j++) {
          base = o * n * inner + s0 * inner + j;
          if (s1 <= s0) { out[(o * ni + i) * inner + j] = d[base]; continue; }
          out[(o * ni + i) * inner + j] = R(d[base] + pairwiseS(d, base + inner, s1 - s0 - 1, inner, R));
        }
      }
    }
    return { d: out, shape: oshape };
  };

  /* ------------------------------------------------------------------ *
   * ndarray.sum(axis=...) - the ORDER follows MEMORY LAYOUT, not the
   * logical axis (numpy docs: pairwise summation "is only used when
   * summing along the fast axis in memory").
   *
   * Model (numpy's nditer walks the operand in memory order and coalesces
   * adjacent axes; for a reduction the inner loop is either a BINARY_REDUCE
   * over the innermost reduced run, or an elementwise add over a kept
   * axis):
   *   1. Walk the base array in memory order (C order of the BASE).
   *   2. The innermost block of consecutive base axes that are all reduced
   *      (size-1 axes do not break it) is one "chunk"; if the innermost
   *      axis of size > 1 is KEPT, every chunk is a single element.
   *   3. out = 0 (the identity), then out[k] += pairwise(chunk) for every
   *      chunk in memory order.
   * MEASURED (probe): C 2-D sum(axis=0) sequential 200/200 vs pairwise
   * 16/200; sum(axis=1) pairwise 300/300 vs sequential 30/300; a.T.sum(0)
   * pairwise; a transposed (L, other, C) view summed over (0, 2) is ONE
   * pairwise run of L*C per output (40/40; the per-row rival 5/40) while
   * the same axes of the C-contiguous array are a sequential sum of
   * per-pixel channel sums (70/70). tools/test-linalg.cjs checks this
   * model against numpy on every permutation x axis subset of random 2-D
   * and 3-D arrays.
   *
   * @param d      C-contiguous data of the BASE array (float32/float64)
   * @param shape  the BASE array's shape
   * @param axes   reduced axes, in VIEW coordinates (int or array)
   * @param perm   optional: the view is base.transpose(perm); omitted =
   *               identity. varcontrast.py:45 transposes before summing.
   * @returns {d, shape} C-contiguous result in VIEW axis order, same dtype
   * ------------------------------------------------------------------ */
  PF.sumAxes = function (d, shape, axes, perm) {
    var f32 = floatKind(d, 'sumAxes');
    var R = f32 ? Math.fround : ident;
    var nd = shape.length, v, b, i;
    checkLen(d, prod(shape, 0, nd), 'sumAxes data');
    if (perm === undefined || perm === null) { perm = []; for (i = 0; i < nd; i++) perm.push(i); }
    check(perm.length === nd, 'sumAxes: perm length');
    if (typeof axes === 'number') axes = [axes];
    var redView = new Array(nd), redBase = new Array(nd);
    for (i = 0; i < nd; i++) { redView[i] = false; redBase[i] = false; }
    for (i = 0; i < axes.length; i++) {
      v = normAxis(axes[i], nd, 'sumAxes');
      check(!redView[v], 'sumAxes: duplicate axis');
      redView[v] = true;
      redBase[perm[v]] = true;
    }
    // output: kept view axes in view order, C-contiguous
    var oshape = [], keptView = [];
    for (v = 0; v < nd; v++) if (!redView[v]) { keptView.push(v); oshape.push(shape[perm[v]]); }
    var ostrBase = new Array(nd), s = 1;
    for (b = 0; b < nd; b++) ostrBase[b] = 0;
    for (i = keptView.length - 1; i >= 0; i--) { ostrBase[perm[keptView[i]]] = s; s *= shape[perm[keptView[i]]]; }
    var out = new d.constructor(s);
    // innermost reduced run (size-1 axes coalesce with anything)
    var run = 1, nb = nd, anyRed = false;
    for (b = nd - 1; b >= 0; b--) {
      if (shape[b] === 1) { nb = b; continue; }
      if (!redBase[b]) break;
      run *= shape[b]; nb = b; anyRed = true;
    }
    if (!anyRed) { run = 1; nb = nd; }
    var total = d.length;
    if (total === 0) return { d: out, shape: oshape };
    // odometer over base axes 0..nb-1 (the chunk covers nb..nd-1)
    var idx = new Array(nb), oo = 0, p = 0, k;
    for (b = 0; b < nb; b++) idx[b] = 0;
    for (;;) {
      if (run === 1) out[oo] = R(out[oo] + d[p]);
      else out[oo] = R(out[oo] + pairwiseS(d, p, run, 1, R));
      p += run;
      // advance
      for (k = nb - 1; k >= 0; k--) {
        idx[k]++;
        oo += ostrBase[k];
        if (idx[k] < shape[k]) break;
        oo -= ostrBase[k] * shape[k];
        idx[k] = 0;
      }
      if (k < 0) break;
    }
    return { d: out, shape: oshape };
  };

  /* ndarray.mean(axis=...) = sum / count in the array's dtype (float32
   * stays float32: MEASURED (n,3).mean(0) = sequential float32 sum / n,
   * 3/3, the pairwise rival 0/3; reconsearch.py:76). */
  PF.meanAxes = function (d, shape, axes, perm) {
    var r = PF.sumAxes(d, shape, axes, perm);
    var cnt = d.length / Math.max(r.d.length, 1), i;
    if (d instanceof Float32Array) { var c32 = Math.fround(cnt); for (i = 0; i < r.d.length; i++) r.d[i] = Math.fround(r.d[i] / c32); }
    else for (i = 0; i < r.d.length; i++) r.d[i] = r.d[i] / cnt;
    return r;
  };

  /* Full-array mean / std of a C-contiguous array (any number of dims:
   * numpy coalesces them into one run, so this is pairwise over all).
   *   std = sqrt(pairwise((x - mean)^2) / n), two-pass, in the dtype;
   *   ddof = 0 only (every reference call uses the default).
   * float32 call sites: reconsearch.py:82,83 alpha.std()/.mean(),
   * channels.py:585 prof.mean(); float64: channels.py:119,440,441,1127,
   * varcontrast.py:246,323,348. */
  PF.mean = function (a) {
    var f32 = floatKind(a, 'mean'), n = a.length;
    check(n > 0, 'mean of an empty array');
    return f32 ? Math.fround(pairwise(a, 0, n, Math.fround) / Math.fround(n)) : pairwise(a, 0, n, ident) / n;
  };
  PF.std = function (a) {
    var f32 = floatKind(a, 'std'), n = a.length, i, t;
    check(n > 0, 'std of an empty array');
    var R = f32 ? Math.fround : ident;
    var mu = PF.mean(a);
    var sq = new a.constructor(n);
    for (i = 0; i < n; i++) { t = R(a[i] - mu); sq[i] = R(t * t); }
    var v = f32 ? Math.fround(pairwise(sq, 0, n, Math.fround) / Math.fround(n)) : pairwise(sq, 0, n, ident) / n;
    return R(Math.sqrt(v));
  };

  /* np.average(x, weights=w), 1-D (reconsearch.py:234-239):
   * np.multiply(x, w).sum() / w.sum(), both pairwise. MEASURED 200/200.
   * The result dtype is np.result_type(x, w, 'f8'), so float32 input is
   * WIDENED to float64 before anything is multiplied or summed - there is
   * no float32 path. numpy raises ZeroDivisionError when the weights sum
   * to zero; so does this. */
  PF.average = function (x, w) {
    var n = x.length, i;
    checkLen(w, n, 'average weights');
    var ww = new Float64Array(n), xw = new Float64Array(n);
    for (i = 0; i < n; i++) { ww[i] = w[i]; xw[i] = x[i] * ww[i]; }
    var scl = pairwise(ww, 0, n, ident);
    if (scl === 0) throw new Error('PF.average: Weights sum to zero, can\'t be normalized');
    return pairwise(xw, 0, n, ident) / scl;
  };

  /* ------------------------------------------------------------------ *
   * Python's round(x, ndigits) on a float - NOT numpy's.
   *
   * fusion.py, reconsearch.py and channels.py use round(s, 4) and
   * round(s, 2) as dictionary keys and for de-duplication, so a different
   * last digit is a different candidate. CPython (floatobject.c
   * double_round) rounds the EXACT binary value to ndigits decimals with
   * _Py_dg_dtoa mode 3 - ties to EVEN - and parses the result back with a
   * correctly rounded strtod. Number.prototype.toFixed also works on the
   * exact value, but breaks ties AWAY from zero: round(0.125, 2) is 0.12 in
   * Python and (0.125).toFixed(2) is "0.13". A tie needs x to be a dyadic
   * rational with at most ndigits+1 fractional bits (e.g. 1254/64 =
   * 19.59375 at 4 digits), which extent/count steps can be.
   * ndigits 0..20 only (the reference uses 2 and 4).
   * ------------------------------------------------------------------ */
  PF.pyRound = function (x, nd) {
    check(nd === Math.floor(nd) && nd >= 0 && nd <= 20, 'pyRound: ndigits must be an integer in [0, 20]');
    if (x !== x || x === Infinity || x === -Infinity || x === 0) return x;
    var ax = Math.abs(x);
    if (ax >= 1e21) return x;                       // already an integer; toFixed would go exponential
    var ex = ax.toFixed(100);                       // exact for every double that can tie at <= 20 digits
    var dot = ex.indexOf('.');
    var tail = ex.slice(dot + 1 + nd);
    var r;
    if (tail.charAt(0) === '5' && /^50*$/.test(tail)) {
      var kept = nd > 0 ? ex.slice(0, dot + 1 + nd) : ex.slice(0, dot);
      var last = kept.charCodeAt(kept.length - 1) - 48;
      r = (last % 2 === 0) ? kept : ax.toFixed(nd);  // even: truncate; odd: toFixed rounds the tie up
    } else {
      r = ax.toFixed(nd);
    }
    var v = parseFloat(r);
    return x < 0 ? -v : v;
  };

  PF.version = 'pf-00-base/3';
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

/* ==== pf-06-linalg.js ============================================= */
/* pf-06-linalg.js - np.linalg.eigh, np.linalg.lstsq, the float32 matmul and
 * the complex pieces that full mode's arbitration stage calls, ported from
 * the LAPACK/OpenBLAS/UCRT code numpy actually runs.
 *
 *   PF.eigh(a, n, opts)          np.linalg.eigh           reconsearch.py:79
 *   PF.lstsq(a, m, n, b)         np.linalg.lstsq          channels.py:190, 227
 *   PF.matmulF32(a, n, k, b, p)  float32 (n,k)@(k,p)      reconsearch.py:68, 81
 *   PF.syrkF32(x, n, k)          float32 x.T @ x          reconsearch.py:78
 *   PF.fma64(a, b, c)            exact float64 fma (JS has none)
 *   PF.complexSum / PF.cabs / PF.complexDivReal / PF.hanning
 *                                channels.py:257-269, 524-534, 581, 756-765
 *
 * WHAT NUMPY RUNS (measured in the reference venv: numpy 2.5.3 linked to
 * scipy-openblas 0.3.34, DYNAMIC_ARCH, on an AMD Ryzen 7 7800X3D - Zen 4,
 * AVX-512 incl. BF16, 1 MB L2/core, 96 MB L3):
 *   eigh   -> LAPACK dsyevd (jobz='V', uplo='L') in FLOAT64 even for a
 *             float32 input (numpy's _commonType computes in double and
 *             casts the result back to float32).
 *   lstsq  -> LAPACK dgelsd, rcond = eps * max(m, n).
 *   @      -> OpenBLAS sgemm; ssyrk when both operands are the same buffer
 *             transposed (x.T @ x); sgemv when one side is a vector.
 * The LAPACK routines are Reference-LAPACK Fortran bundled in OpenBLAS
 * 0.3.34 (lapack-netlib; its code was diffed against Reference-LAPACK
 * master for every routine ported here and differs only in formatting and
 * IMPLICIT NONE). Each routine below is a line-for-line port of that
 * source, named after it, so the call graph reads the same as LAPACK's.
 * LAPACK's calls into BLAS go to OpenBLAS kernels, which are FMA-compiled C
 * and SSE2/AVX assembly with their own accumulation orders; those are
 * ported too (see "The OpenBLAS level-1/2 kernels" below), with an exact
 * float64 fma.
 *
 * WHERE THIS IS EXACT AND WHERE IT IS NOT - measured by tools/test-linalg.cjs
 * against fixtures/linalg-parity.json (tools/parity-linalg.py) and
 * fixtures/linalg-trans-parity.json (tools/parity-linalg-trans.py):
 *   - eigh, n <= 5: bit-exact in FLOAT64 (eigenvalues, eigenvectors, signs)
 *     on all 7 real covariances and on 553 synthetic 3x3 cases including
 *     the degenerate ones (a greyscale image gives cov = c * ones(3,3),
 *     whose null-space basis is chosen by rounding noise - and that choice
 *     DOES reach reconsearch's output, tools/probe-linalg-eigh-signs.py),
 *     and on 75 cases at n = 2, 4, 5. n > 5 falls back to Reference-BLAS
 *     order: not exact, bounded, and never asked for by the reference.
 *     SUPERSEDED (same day): the first version of this header said eigh's
 *     float64 internals "can differ in the last bits" because the kernels
 *     were not ported; that was true of Reference-BLAS order (11/560 cases
 *     bit-exact in float64) and stopped being true when the OpenBLAS kernel
 *     order was ported (560/560).
 *   - lstsq (n <= 2): bit-exact, x and s, on all 11728 calls the reference
 *     makes from the fixtures and examples and 405 synthetic cases
 *     (Reference-BLAS order: 27/11728).
 *   - matmulF32 / syrkF32: bit-exact models of the kernels THIS CPU is
 *     dispatched to (tools/probe-linalg-matmul.py: 280000/280000 and 72/72
 *     against rivals at 57-69% and 20-39 of 72). They are a property of the
 *     OpenBLAS build + CPU, NOT of numpy: the measured ssyrk K-block is 512,
 *     which OpenBLAS's param.h gives its COOPERLAKE target (x86_64, under
 *     an L2 = 1 MB / L3 = 32 MB-multiple condition this CPU meets), while
 *     its SKYLAKEX target uses 448 - so the reference on another CPU would
 *     itself produce other bits. (Which target the dispatcher chose was
 *     inferred from that match, not read from the running library.)
 *   - cos, sin, arctan2, log10 (UCRT, not correctly rounded): NOT exact;
 *     see the complex/transcendental section.
 *
 * Storage: matrices are flat Float64Array / Float32Array, ROW-MAJOR like
 * numpy, with explicit dimensions. Internally LAPACK works column-major;
 * the conversion is explicit at each entry point.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  function err(msg) { throw new Error('PF.linalg: ' + msg); }

  /* ------------------------------------------------------------------ *
   * DLAMCH and la_constants - the machine parameters LAPACK reads.
   * 'E' (epsilon) is the unit roundoff 2^-53 because LAPACK assumes
   * rounding; 'P' = eps*base = 2^-52; 'S' is the smallest normal 2^-1022
   * (1/huge is smaller, so LAPACK keeps tiny()). dlartg.f90 reads
   * la_constants, whose dsafmin is also 2^-1022.
   * ------------------------------------------------------------------ */
  var EPS = Math.pow(2, -53);          // DLAMCH('E')
  var PREC = Math.pow(2, -52);         // DLAMCH('P')
  var SAFMIN = Math.pow(2, -1022);     // DLAMCH('S')
  var SAFMAX = 1 / SAFMIN;             // 2^1022
  var HUGEV = Number.MAX_VALUE;        // DLAMCH('O')
  var RTMIN = Math.sqrt(SAFMIN);       // dlartg.f90
  var RTMAX = Math.sqrt(SAFMAX / 2);

  /* Fortran SIGN(A, B): |A| with the sign of B. gfortran implements it as
   * copysign, so B = -0.0 gives -|A|. */
  function fsign(a, b) {
    var aa = Math.abs(a);
    return (b < 0 || (b === 0 && 1 / b < 0)) ? -aa : aa;
  }

  /* DLAPY2: sqrt(x**2 + y**2) avoiding unnecessary overflow. */
  function dlapy2(x, y) {
    var xnan = x !== x, ynan = y !== y, r = 0;
    if (xnan) r = x;
    if (ynan) r = y;
    if (!(xnan || ynan)) {
      var xa = Math.abs(x), ya = Math.abs(y);
      var w = xa > ya ? xa : ya, z = xa < ya ? xa : ya;
      if (z === 0 || w > HUGEV) r = w;
      else { var q = z / w; r = w * Math.sqrt(1 + q * q); }
    }
    return r;
  }

  /* DLARTG (LAPACK 3.10+ dlartg.f90): plane rotation with r carrying the
   * sign of f and c >= 0. The pre-3.10 routine chose signs differently
   * (it forced c >= 0 only when |f| > |g|), which flips eigenvector signs;
   * OpenBLAS 0.3.34 bundles this version. */
  var rot = { c: 0, s: 0, r: 0 };
  function dlartg(f, g) {
    var f1 = Math.abs(f), g1 = Math.abs(g), d;
    if (g === 0) { rot.c = 1; rot.s = 0; rot.r = f; }
    else if (f === 0) { rot.c = 0; rot.s = fsign(1, g); rot.r = g1; }
    else if (f1 > RTMIN && f1 < RTMAX && g1 > RTMIN && g1 < RTMAX) {
      d = Math.sqrt(f * f + g * g);
      rot.c = f1 / d;
      rot.r = fsign(d, f);
      rot.s = g / rot.r;
    } else {
      var u = Math.min(SAFMAX, Math.max(SAFMIN, f1, g1));
      var fs = f / u, gs = g / u;
      d = Math.sqrt(fs * fs + gs * gs);
      rot.c = Math.abs(fs) / d;
      rot.r = fsign(d, f);
      rot.s = gs / rot.r;
      rot.r = rot.r * u;
    }
    return rot;
  }

  /* DLAEV2: eigendecomposition of [[a, b], [b, c]]. */
  var ev2 = { rt1: 0, rt2: 0, cs1: 0, sn1: 0 };
  function dlaev2(a, b, c) {
    var sm = a + c, df = a - c, adf = Math.abs(df), tb = b + b, ab = Math.abs(tb);
    var acmx, acmn, rt, rt1, rt2, sgn1, sgn2, cs, acs, ct, tn, cs1, sn1, q;
    if (Math.abs(a) > Math.abs(c)) { acmx = a; acmn = c; } else { acmx = c; acmn = a; }
    if (adf > ab) { q = ab / adf; rt = adf * Math.sqrt(1 + q * q); }
    else if (adf < ab) { q = adf / ab; rt = ab * Math.sqrt(1 + q * q); }
    else rt = ab * Math.sqrt(2);
    if (sm < 0) { rt1 = 0.5 * (sm - rt); sgn1 = -1; rt2 = (acmx / rt1) * acmn - (b / rt1) * b; }
    else if (sm > 0) { rt1 = 0.5 * (sm + rt); sgn1 = 1; rt2 = (acmx / rt1) * acmn - (b / rt1) * b; }
    else { rt1 = 0.5 * rt; rt2 = -0.5 * rt; sgn1 = 1; }
    if (df >= 0) { cs = df + rt; sgn2 = 1; } else { cs = df - rt; sgn2 = -1; }
    acs = Math.abs(cs);
    if (acs > ab) { ct = -tb / cs; sn1 = 1 / Math.sqrt(1 + ct * ct); cs1 = ct * sn1; }
    else if (ab === 0) { cs1 = 1; sn1 = 0; }
    else { tn = -cs / tb; cs1 = 1 / Math.sqrt(1 + tn * tn); sn1 = tn * cs1; }
    if (sgn1 === sgn2) { tn = cs1; cs1 = -sn1; sn1 = tn; }
    ev2.rt1 = rt1; ev2.rt2 = rt2; ev2.cs1 = cs1; ev2.sn1 = sn1;
    return ev2;
  }

  /* DNRM2 as OpenBLAS runs it on x86_64: kernel/x86_64/nrm2.S, x87 code
   * with four interleaved accumulators (A: x0,x4,..,+tail; B: x1,x5,..;
   * C: x2,..; D: x3,..) combined as ((C + A) + B) + D, then fsqrt. Windows
   * x64 runs the x87 unit at 53-bit precision control, so every operation
   * rounds like a double (only the exponent range is wider; no scaling is
   * needed or done). Reference-LAPACK's own dnrm2.f90 (Blue's scaled sums)
   * is NOT what runs. For n = 1 every implementation returns |x|. */
  function dnrm2(n, x, off, inc) {
    if (n <= 0 || inc === 0) return 0;
    var A = 0, B = 0, C = 0, D = 0, i = 0, p = off, v;
    var blocks = n >> 3, k;
    /* The x87 unit squares and sums with a 15-bit exponent: nothing
     * overflows or underflows there that would in a double. Scaling by a
     * power of two changes no 53-bit mantissa rounding, so it reproduces
     * that range exactly; it is applied only when a square could leave the
     * double range, so ordinary inputs take the plain path. */
    var amax = 0;
    for (i = 0, p = off; i < n; i++, p += inc) { v = Math.abs(x[p]); if (v > amax) amax = v; }
    var sc = 1, unsc = 1;
    if (amax > 0 && (amax > 1e150 || amax < 1e-150)) {
      var e = Math.floor(Math.log2(amax));
      sc = Math.pow(2, -e); unsc = Math.pow(2, e);
    }
    p = off;
    for (k = 0; k < blocks; k++) {
      v = x[p] * sc; A = A + v * v; p += inc;
      v = x[p] * sc; B = B + v * v; p += inc;
      v = x[p] * sc; C = C + v * v; p += inc;
      v = x[p] * sc; D = D + v * v; p += inc;
      v = x[p] * sc; A = A + v * v; p += inc;
      v = x[p] * sc; B = B + v * v; p += inc;
      v = x[p] * sc; C = C + v * v; p += inc;
      v = x[p] * sc; D = D + v * v; p += inc;
    }
    for (i = blocks * 8; i < n; i++) { v = x[p] * sc; A = A + v * v; p += inc; }
    return Math.sqrt(((C + A) + B) + D) * unsc;
  }

  /* DLARFG: elementary reflector H with H * (alpha; x) = (beta; 0).
   * x is modified in place (becomes v(2:n)); returns {beta, tau} via out. */
  var rfg = { beta: 0, tau: 0 };
  function dlarfg(n, alpha, x, off, inc) {
    var i, j, xnorm, beta, knt, tau, safmn, rsafmn, sc;
    if (n <= 1) { rfg.beta = alpha; rfg.tau = 0; return rfg; }
    xnorm = dnrm2(n - 1, x, off, inc);
    if (xnorm === 0) { rfg.beta = alpha; rfg.tau = 0; return rfg; }
    beta = -fsign(dlapy2(alpha, xnorm), alpha);
    safmn = SAFMIN / EPS;
    knt = 0;
    if (Math.abs(beta) < safmn) {
      rsafmn = 1 / safmn;
      do {
        knt++;
        for (i = 0; i < n - 1; i++) x[off + i * inc] = rsafmn * x[off + i * inc];
        beta = beta * rsafmn;
        alpha = alpha * rsafmn;
      } while (Math.abs(beta) < safmn && knt < 20);
      xnorm = dnrm2(n - 1, x, off, inc);
      beta = -fsign(dlapy2(alpha, xnorm), alpha);
    }
    tau = (beta - alpha) / beta;
    sc = 1 / (alpha - beta);
    for (i = 0; i < n - 1; i++) x[off + i * inc] = sc * x[off + i * inc];
    for (j = 1; j <= knt; j++) beta = beta * safmn;
    rfg.beta = beta; rfg.tau = tau;
    return rfg;
  }

  /* DLASCL('G'): multiply by cto/cfrom without over/underflow, in the
   * multi-step way LAPACK does it (the steps change the rounding). Applies
   * to x[off .. off+len-1] with stride inc. */
  function dlascl(cfrom, cto, x, off, len, inc) {
    var smlnum = SAFMIN, bignum = 1 / smlnum;
    var cfromc = cfrom, ctoc = cto, cfrom1, cto1, mul, done, i;
    if (inc === undefined) inc = 1;
    do {
      cfrom1 = cfromc * smlnum;
      if (cfrom1 === cfromc) { mul = ctoc / cfromc; done = true; cto1 = ctoc; }
      else {
        cto1 = ctoc / bignum;
        if (cto1 === ctoc) { mul = ctoc; done = true; cfromc = 1; }
        else if (Math.abs(cfrom1) > Math.abs(ctoc) && ctoc !== 0) { mul = smlnum; done = false; cfromc = cfrom1; }
        else if (Math.abs(cto1) > Math.abs(cfromc)) { mul = bignum; done = false; ctoc = cto1; }
        else { mul = ctoc / cfromc; done = true; if (mul === 1) return; }
      }
      for (i = 0; i < len; i++) x[off + i * inc] = x[off + i * inc] * mul;
    } while (!done);
  }

  /* DLANST('M') on D(l..l+n-1), E(l..l+n-2) (1-based arrays). */
  function dlanstM(n, D, dOff, E, eOff) {
    if (n <= 0) return 0;
    var anorm = Math.abs(D[dOff + n - 1]), s, i;
    for (i = 0; i < n - 1; i++) {
      s = Math.abs(D[dOff + i]); if (anorm < s || s !== s) anorm = s;
      s = Math.abs(E[eOff + i]); if (anorm < s || s !== s) anorm = s;
    }
    return anorm;
  }

  /* DLASR('R', 'V', direct): apply the plane rotations P(j) from the
   * right to columns col..col+nn-1 of Z (column-major, 0-based storage,
   * Fortran column index col is 1-based), c(j) = W[cOff+j-1],
   * s(j) = W[sOff+j-1], j = 1..nn-1. */
  function dlasrRV(forward, m, nn, W, cOff, sOff, Z, ldz, col) {
    var j, i, ct, st, temp, a0, a1, j0, j1;
    if (m <= 0 || nn <= 1) return;
    var jFrom = forward ? 1 : nn - 1, jTo = forward ? nn - 1 : 1, dj = forward ? 1 : -1;
    for (j = jFrom; forward ? j <= jTo : j >= jTo; j += dj) {
      ct = W[cOff + j - 1]; st = W[sOff + j - 1];
      if (ct !== 1 || st !== 0) {
        j0 = (col + j - 2) * ldz; j1 = (col + j - 1) * ldz;
        for (i = 0; i < m; i++) {
          temp = Z[j1 + i];
          a0 = Z[j0 + i];
          Z[j1 + i] = ct * temp - st * a0;
          Z[j0 + i] = st * temp + ct * a0;
        }
      }
    }
  }

  /* ================================================================== *
   * np.linalg.eigh
   * ================================================================== */

  /* DSTEQR(compz='I') on a symmetric tridiagonal (D, E 1-based, length n
   * and n-1). Z is n x n column-major, set to I, then accumulates the
   * rotations. Returns info (0 = converged). Implicit QL/QR with
   * Wilkinson shifts; the final selection sort orders eigenvalues
   * ascending and swaps whole columns of Z - this is where LAPACK's
   * eigenvector sign convention comes from, so it is ported verbatim. */
  function dsteqr(n, D, E, Z, ldz) {
    var MAXIT = 30, info = 0, i, j, k, ii;
    if (n === 0) return 0;
    if (n === 1) { Z[0] = 1; return 0; }
    var eps2 = EPS * EPS;
    var ssfmax = Math.sqrt(SAFMAX) / 3, ssfmin = Math.sqrt(SAFMIN) / eps2;
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) Z[i + j * ldz] = (i === j) ? 1 : 0;
    var W = new Float64Array(2 * n);          // WORK(1..2n-2), index 0 unused
    var nmaxit = n * MAXIT, jtot = 0, l1 = 1, nm1 = n - 1;
    var m, l, lsv, lend, lendsv, anorm, iscale, p, g, r, c, s, f, b, tst, mm;
    for (;;) {                                 // label 10
      if (l1 > n) break;                       // -> 160
      if (l1 > 1) E[l1 - 1] = 0;
      m = n;
      if (l1 <= nm1) {
        for (m = l1; m <= nm1; m++) {
          tst = Math.abs(E[m]);
          if (tst === 0) break;
          if (tst <= (Math.sqrt(Math.abs(D[m])) * Math.sqrt(Math.abs(D[m + 1]))) * EPS) { E[m] = 0; break; }
        }
        if (m > nm1) m = n;
      }
      l = l1; lsv = l; lend = m; lendsv = lend; l1 = m + 1;
      if (lend === l) continue;
      anorm = dlanstM(lend - l + 1, D, l, E, l);
      iscale = 0;
      if (anorm === 0) continue;
      if (anorm > ssfmax) {
        iscale = 1;
        dlascl(anorm, ssfmax, D, l, lend - l + 1, 1);
        dlascl(anorm, ssfmax, E, l, lend - l, 1);
      } else if (anorm < ssfmin) {
        iscale = 2;
        dlascl(anorm, ssfmin, D, l, lend - l + 1, 1);
        dlascl(anorm, ssfmin, E, l, lend - l, 1);
      }
      if (Math.abs(D[lend]) < Math.abs(D[l])) { lend = lsv; l = lendsv; }
      if (lend > l) {
        // QL iteration: look for a small subdiagonal element (label 40)
        for (;;) {
          if (l !== lend) {
            for (m = l; m <= lend - 1; m++) {
              tst = Math.abs(E[m]); tst = tst * tst;
              if (tst <= (eps2 * Math.abs(D[m])) * Math.abs(D[m + 1]) + SAFMIN) break;
            }
            if (m > lend - 1) m = lend;
          } else m = lend;
          if (m < lend) E[m] = 0;
          p = D[l];
          if (m === l) {                                   // label 80
            D[l] = p; l = l + 1;
            if (l <= lend) continue;
            break;
          }
          if (m === l + 1) {                               // 2x2 block
            dlaev2(D[l], E[l], D[l + 1]);
            W[l] = ev2.cs1; W[n - 1 + l] = ev2.sn1;
            dlasrRV(false, n, 2, W, l, n - 1 + l, Z, ldz, l);
            D[l] = ev2.rt1; D[l + 1] = ev2.rt2; E[l] = 0; l = l + 2;
            if (l <= lend) continue;
            break;
          }
          if (jtot === nmaxit) break;
          jtot++;
          g = (D[l + 1] - p) / (2 * E[l]);
          r = dlapy2(g, 1);
          g = D[m] - p + (E[l] / (g + fsign(r, g)));
          s = 1; c = 1; p = 0;
          for (i = m - 1; i >= l; i--) {
            f = s * E[i]; b = c * E[i];
            dlartg(g, f); c = rot.c; s = rot.s; r = rot.r;
            if (i !== m - 1) E[i + 1] = r;
            g = D[i + 1] - p;
            r = (D[i] - g) * s + 2 * c * b;
            p = s * r;
            D[i + 1] = g + p;
            g = c * r - b;
            W[i] = c; W[n - 1 + i] = -s;
          }
          mm = m - l + 1;
          dlasrRV(false, n, mm, W, l, n - 1 + l, Z, ldz, l);
          D[l] = D[l] - p;
          E[l] = g;
        }
      } else {
        // QR iteration (label 90)
        for (;;) {
          if (l !== lend) {
            for (m = l; m >= lend + 1; m--) {
              tst = Math.abs(E[m - 1]); tst = tst * tst;
              if (tst <= (eps2 * Math.abs(D[m])) * Math.abs(D[m - 1]) + SAFMIN) break;
            }
            if (m < lend + 1) m = lend;
          } else m = lend;
          if (m > lend) E[m - 1] = 0;
          p = D[l];
          if (m === l) {                                   // label 130
            D[l] = p; l = l - 1;
            if (l >= lend) continue;
            break;
          }
          if (m === l - 1) {
            dlaev2(D[l - 1], E[l - 1], D[l]);
            W[m] = ev2.cs1; W[n - 1 + m] = ev2.sn1;
            dlasrRV(true, n, 2, W, m, n - 1 + m, Z, ldz, l - 1);
            D[l - 1] = ev2.rt1; D[l] = ev2.rt2; E[l - 1] = 0; l = l - 2;
            if (l >= lend) continue;
            break;
          }
          if (jtot === nmaxit) break;
          jtot++;
          g = (D[l - 1] - p) / (2 * E[l - 1]);
          r = dlapy2(g, 1);
          g = D[m] - p + (E[l - 1] / (g + fsign(r, g)));
          s = 1; c = 1; p = 0;
          for (i = m; i <= l - 1; i++) {
            f = s * E[i]; b = c * E[i];
            dlartg(g, f); c = rot.c; s = rot.s; r = rot.r;
            if (i !== m) E[i - 1] = r;
            g = D[i] - p;
            r = (D[i + 1] - g) * s + 2 * c * b;
            p = s * r;
            D[i] = g + p;
            g = c * r - b;
            W[i] = c; W[n - 1 + i] = s;
          }
          mm = l - m + 1;
          dlasrRV(true, n, mm, W, m, n - 1 + m, Z, ldz, m);
          D[l] = D[l] - p;
          E[l - 1] = g;
        }
      }
      // label 140: undo scaling
      if (iscale === 1) {
        dlascl(ssfmax, anorm, D, lsv, lendsv - lsv + 1, 1);
        dlascl(ssfmax, anorm, E, lsv, lendsv - lsv, 1);
      } else if (iscale === 2) {
        dlascl(ssfmin, anorm, D, lsv, lendsv - lsv + 1, 1);
        dlascl(ssfmin, anorm, E, lsv, lendsv - lsv, 1);
      }
      if (jtot < nmaxit) continue;
      for (i = 1; i <= n - 1; i++) if (E[i] !== 0) info++;
      return info;                                         // no sort (label 190)
    }
    // label 160: selection sort, ascending, swapping whole columns of Z
    for (ii = 2; ii <= n; ii++) {
      i = ii - 1; k = i; p = D[i];
      for (j = ii; j <= n; j++) if (D[j] < p) { k = j; p = D[j]; }
      if (k !== i) {
        D[k] = D[i]; D[i] = p;
        var ci = (i - 1) * ldz, ck = (k - 1) * ldz, t;
        for (j = 0; j < n; j++) { t = Z[ci + j]; Z[ci + j] = Z[ck + j]; Z[ck + j] = t; }
      }
    }
    return info;
  }

  /* ------------------------------------------------------------------ *
   * float64 fused multiply-add, EXACT. JS has no fma; OpenBLAS's C
   * kernels are compiled with FMA contraction, so a port that multiplies
   * then adds rounds twice where the reference rounds once.
   * Boldo & Melquiond, "Emulation of FMA and correctly rounded sums:
   * proved algorithms using rounding to odd" (IEEE TC 57(4), 2008):
   *   (uh, ul) = a*b exactly (Dekker/Veltkamp); (th, tl) = c + uh exactly
   *   (TwoSum); v = RO(tl + ul) (round to odd); fma = RN(th + v).
   * Proven for binary64 away from underflow/overflow (|a|, |b| < 2^996,
   * no subnormal intermediates) - far outside what a covariance of pixel
   * values reaches. tools/test-linalg.cjs checks it against exact BigInt
   * arithmetic on 200000 random and cancellation-heavy triples.
   * ------------------------------------------------------------------ */
  var SPLITTER = 134217729;                 // 2^27 + 1
  var fb = new Float64Array(1), ub = new Uint32Array(fb.buffer);
  var LO = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0 : 1, HI = 1 - LO;
  function nextToward(v, up) {              // adjacent double in direction up (+) / down (-)
    if (v === 0) return up ? 5e-324 : -5e-324;
    fb[0] = v;
    var lo = ub[LO], hi = ub[HI];
    if ((v > 0) === up) { lo = (lo + 1) >>> 0; if (lo === 0) hi = (hi + 1) >>> 0; }
    else { if (lo === 0) hi = (hi - 1) >>> 0; lo = (lo - 1) >>> 0; }
    ub[LO] = lo; ub[HI] = hi;
    return fb[0];
  }
  function fma64(a, b, c) {
    var p = a * b;
    if (p === 0 || p - p !== 0 || c - c !== 0) return p + c;   // exact zero product, inf, nan
    var t = SPLITTER * a, ah = t - (t - a), al = a - ah;
    t = SPLITTER * b;
    var bh = t - (t - b), bl = b - bh;
    var pl = ((ah * bh - p) + ah * bl + al * bh) + al * bl;    // a*b = p + pl exactly
    var th = c + p, bb = th - c, tl = (c - (th - bb)) + (p - bb);   // c + p = th + tl exactly
    var v = tl + pl;
    bb = v - tl;
    var e = (tl - (v - bb)) + (pl - bb);                       // tl + pl = v + e exactly
    if (e !== 0) {
      fb[0] = v;
      if ((ub[LO] & 1) === 0) v = nextToward(v, e > 0);        // round to odd
    }
    return th + v;
  }
  PF.fma64 = fma64;

  /* ------------------------------------------------------------------ *
   * The OpenBLAS level-1/2 kernels LAPACK calls here, in the order and
   * with the fused operations of the code this CPU runs (OpenBLAS 0.3.34,
   * DYNAMIC_ARCH -> SKYLAKEX, whose KERNEL file includes KERNEL.HASWELL):
   *   DSYMV  kernel/x86_64/dsymv_L.c     scalar paths
   *   DDOT   kernel/x86_64/ddot.c        dot += y[i]*x[i]      (n < 16)
   *   DAXPY  kernel/x86_64/daxpy.c       y[i] += da*x[i]       (n < 16)
   *   DSYR2  interface/syr2.c n < 100:   per column TWO axpys, x-term first
   *   DGEMVT kernel/x86_64/dgemv_t_4.c   the m <= 3 row tails
   *   DGER   kernel/generic/ger.c        per column axpy(alpha*y[j], x)
   * Every "a += b*c" in those C loops is compiled to one FMA (gcc's
   * default -ffp-contract=fast on an FMA3 target) - including across
   * statements: the strided daxpy's "m = da*x; y += m" is fused too
   * (MEASURED: eigh at n = 4, 5 is 25/25 bit-exact fused, 0/25 unfused).
   * daxpy's AVX2 microkernel (n >= 16) is one vfmadd231pd per element, so
   * it is modelled by the same elementwise fma; dgemv_t's SSE2 4x1 / 4x2
   * kernels (no FMA) are modelled below. Paths through the hand-written
   * AVX2 microkernels whose ORDER is not modelled - ddot with n >= 16,
   * dgemv_t with >= 4 rows AND >= 4 columns, dsymv with >= 13 rows - throw,
   * so a caller can never get a silently different order.
   * PF._linalg.blas = 'reference' switches eigh and lstsq back to
   * Reference-BLAS order (one rounding per * and +); the test's negative
   * controls use it.
   * ------------------------------------------------------------------ */
  function ddotOB(n, X, xo, Y, yo) {
    if (n >= 16) err('ddot: n >= 16 takes the AVX2 microkernel, which is not modelled');
    var dot = 0, i;
    for (i = 0; i < n; i++) dot = fma64(Y[yo + i], X[xo + i], dot);
    return dot;
  }
  function daxpyOB(n, da, X, xo, incx, Y, yo, incy) {
    var i, q, ix, iy;
    if (n <= 0 || da === 0) return;                           // interface/axpy.c: alpha == 0 returns
    if (incx === 1 && incy === 1) {
      // n >= 16 goes through daxpy_microk_haswell-2.c: one vfmadd231pd per
      // element, i.e. the same fma(da, x, y) - elementwise, so order-free
      for (i = 0; i < n; i++) Y[yo + i] = fma64(da, X[xo + i], Y[yo + i]);
      return;
    }
    var n1 = n & -4, fused = PF._linalg.axpyStridedFused;
    ix = xo; iy = yo;
    for (i = 0; i < n1; i += 4) {                             // m_k = da*x; y += m_k
      for (q = 0; q < 4; q++) {
        Y[iy + q * incy] = fused ? fma64(da, X[ix + q * incx], Y[iy + q * incy]) : Y[iy + q * incy] + da * X[ix + q * incx];
      }
      ix += 4 * incx; iy += 4 * incy;
    }
    for (; i < n; i++) { Y[iy] = fma64(da, X[ix], Y[iy]); ix += incx; iy += incy; }
  }
  // y := alpha * A * x (A symmetric, lower triangle, m x m column-major); beta = 0
  function dsymvLOB(m, alpha, A, ao, lda, X, xo, Y, yo) {
    var i, j, k, t1, t2, off1 = (m >> 2) << 2;
    for (i = 0; i < m; i++) Y[yo + i] = 0;                     // SCAL_K(beta = 0)
    if (alpha === 0) return;
    for (j = 0; j < off1; j += 4) {
      if (m - (j + 1) >= 12) err('dsymv: m >= 13 takes dsymv_kernel_4x4 (AVX2), which is not modelled');
      var tm = [alpha * X[xo + j], alpha * X[xo + j + 1], alpha * X[xo + j + 2], alpha * X[xo + j + 3]];
      var t2a = [0, 0, 0, 0], ap = [ao + j * lda, ao + (j + 1) * lda, ao + (j + 2) * lda, ao + (j + 3) * lda];
      for (k = 0; k < 4; k++) Y[yo + j + k] = fma64(tm[k], A[ap[k] + j + k], Y[yo + j + k]);
      for (k = 0; k < 3; k++) {
        for (i = j + k + 1; i < j + 4; i++) {
          Y[yo + i] = fma64(tm[k], A[ap[k] + i], Y[yo + i]);
          t2a[k] = fma64(A[ap[k] + i], X[xo + i], t2a[k]);
        }
      }
      for (i = j + 4; i < m; i++) {
        for (k = 0; k < 4; k++) {
          Y[yo + i] = fma64(tm[k], A[ap[k] + i], Y[yo + i]);
          t2a[k] = fma64(A[ap[k] + i], X[xo + i], t2a[k]);
        }
      }
      for (k = 0; k < 4; k++) Y[yo + j + k] = fma64(alpha, t2a[k], Y[yo + j + k]);
    }
    for (j = off1; j < m; j++) {
      t1 = alpha * X[xo + j]; t2 = 0;
      Y[yo + j] = fma64(t1, A[ao + j * lda + j], Y[yo + j]);
      for (i = j + 1; i < m; i++) {
        Y[yo + i] = fma64(t1, A[ao + j * lda + i], Y[yo + i]);
        t2 = fma64(A[ao + j * lda + i], X[xo + i], t2);
      }
      Y[yo + j] = fma64(alpha, t2, Y[yo + j]);
    }
  }
  // A := alpha*x*y' + alpha*y*x' + A, lower, n < 100, unit strides
  function dsyr2LOB(n, alpha, X, xo, Y, yo, A, ao, lda) {
    if (n === 0 || alpha === 0) return;
    for (var i = 0; i < n; i++) {
      daxpyOB(n - i, alpha * X[xo + i], Y, yo + i, 1, A, ao + i * (1 + lda), 1);
      daxpyOB(n - i, alpha * Y[yo + i], X, xo + i, 1, A, ao + i * (1 + lda), 1);
    }
  }
  /* dgemv_t_4.c's SSE2 kernels (no FMA): dgemv_kernel_4x1 keeps two
   * 2-lane accumulators, lanes (i, i+1) and (i+2, i+3), adds them lane-wise
   * and then across (haddpd); dgemv_kernel_4x2 keeps one 2-lane
   * accumulator per column. Both start with a lone pair when n % 4 == 2. */
  function dgemvK4x1(nb, A, ao, X, xo) {
    var a0 = 0, a1 = 0, b0 = 0, b1 = 0, i = 0, nn = nb;
    if (nn & 2) { a0 = a0 + A[ao] * X[xo]; a1 = a1 + A[ao + 1] * X[xo + 1]; i = 2; nn -= 2; }
    for (; nn > 0; nn -= 4, i += 4) {
      a0 = a0 + A[ao + i] * X[xo + i]; a1 = a1 + A[ao + i + 1] * X[xo + i + 1];
      b0 = b0 + A[ao + i + 2] * X[xo + i + 2]; b1 = b1 + A[ao + i + 3] * X[xo + i + 3];
    }
    return (a0 + b0) + (a1 + b1);
  }
  function dgemvK4x2(nb, A, ao0, ao1, X, xo, out) {
    var p0 = 0, p1 = 0, q0 = 0, q1 = 0, i = 0, nn = nb;
    if (nn & 2) {
      p0 = p0 + A[ao0] * X[xo]; p1 = p1 + A[ao0 + 1] * X[xo + 1];
      q0 = q0 + A[ao1] * X[xo]; q1 = q1 + A[ao1 + 1] * X[xo + 1];
      i = 2; nn -= 2;
    }
    for (; nn > 0; nn -= 4, i += 4) {
      p0 = p0 + A[ao0 + i] * X[xo + i]; p1 = p1 + A[ao0 + i + 1] * X[xo + i + 1];
      q0 = q0 + A[ao1 + i] * X[xo + i]; q1 = q1 + A[ao1 + i + 1] * X[xo + i + 1];
      p0 = p0 + A[ao0 + i + 2] * X[xo + i + 2]; p1 = p1 + A[ao0 + i + 3] * X[xo + i + 3];
      q0 = q0 + A[ao1 + i + 2] * X[xo + i + 2]; q1 = q1 + A[ao1 + i + 3] * X[xo + i + 3];
    }
    out[0] = p0 + p1; out[1] = q0 + q1;
  }
  var gemvBuf = [0, 0];
  var NBMAX_DGEMVT = 2048;
  /* y := alpha * A^T x (dgemv_t_4.c): A is m x n column-major; y is
   * zeroed first (beta = 0). Row blocks of NBMAX go through the SSE2
   * kernels for n <= 3 columns (4-column groups use the AVX2 FMA
   * microkernel dgemv_kernel_4x4, which is not modelled and throws); the
   * last m % 4 rows are the scalar tail, whose "y += a0*x0 + a1*x1 +
   * a2*x2" gcc compiles to fma(a2,x2, fma(a0,x0, a1*x1)). */
  function dgemvTOB(m, n, alpha, A, ao, lda, X, xo, incx, Y, yo) {
    var j, x0, x1, x2, p, i;
    for (j = 0; j < n; j++) Y[yo + j] = 0;
    if (m < 1 || n < 1 || alpha === 0) return;
    var m3 = m & 3, m1 = m & -4, m2 = (m & (NBMAX_DGEMVT - 1)) - m3, NB = NBMAX_DGEMVT;
    var aP = ao, xP = xo, Xb, xb;
    while (NB === NBMAX_DGEMVT) {
      m1 -= NB;
      if (m1 < 0) { if (m2 === 0) break; NB = m2; }
      if (n >= 4) err('dgemv_t: >= 4 columns with >= 4 rows takes dgemv_kernel_4x4 (AVX2 FMA), which is not modelled');
      if (incx === 1) { Xb = X; xb = xP; }
      else { Xb = new Float64Array(NB); for (i = 0; i < NB; i++) Xb[i] = X[xP + i * incx]; xb = 0; }
      var col = aP, yp = yo;
      if (n & 2) {
        dgemvK4x2(NB, A, col, col + lda, Xb, xb, gemvBuf);
        Y[yp] = fma64(gemvBuf[0], alpha, Y[yp]); Y[yp + 1] = fma64(gemvBuf[1], alpha, Y[yp + 1]);
        col += 2 * lda; yp += 2;
      }
      if (n & 1) {
        Y[yp] = fma64(dgemvK4x1(NB, A, col, Xb, xb), alpha, Y[yp]);
      }
      aP += NB; xP += NB * incx;
    }
    if (m3 === 0) return;
    if (m3 === 3) {
      x0 = X[xP] * alpha; x1 = X[xP + incx] * alpha; x2 = X[xP + 2 * incx] * alpha;
      for (j = 0; j < n; j++) {
        p = aP + j * lda;
        // y += a0*x0 + a1*x1 + a2*x2  ->  gcc fuses the FIRST product into the
        // first add and the third into the second: fma(a2,x2, fma(a0,x0, a1*x1))
        Y[yo + j] = Y[yo + j] + fma64(A[p + 2], x2, fma64(A[p], x0, A[p + 1] * x1));
      }
    } else if (m3 === 2) {
      x0 = X[xP] * alpha; x1 = X[xP + incx] * alpha;
      for (j = 0; j < n; j++) { p = aP + j * lda; Y[yo + j] = Y[yo + j] + fma64(A[p], x0, A[p + 1] * x1); }
    } else {
      x0 = X[xP] * alpha;
      for (j = 0; j < n; j++) Y[yo + j] = fma64(A[aP + j * lda], x0, Y[yo + j]);
    }
  }
  // A := alpha * x * y^T + A (generic/ger.c: one axpy per column)
  function dgerOB(m, n, alpha, X, xo, incx, Y, yo, incy, A, ao, lda) {
    if (m === 0 || n === 0 || alpha === 0) return;
    var Xc = X, xc = xo, i;
    if (incx !== 1) { Xc = new Float64Array(m); for (i = 0; i < m; i++) Xc[i] = X[xo + i * incx]; xc = 0; }
    for (var j = 0; j < n; j++) daxpyOB(m, alpha * Y[yo + j * incy], Xc, xc, 1, A, ao + j * lda, 1);
  }

  /* DSYTD2(uplo='L'): reduce a symmetric matrix (column-major A, lda = n,
   * lower triangle read) to tridiagonal form Q^T A Q = T. D (1-based,
   * length n), E and TAU (1-based, length n-1) receive the result; the
   * reflectors stay below the subdiagonal of A. OB selects the OpenBLAS
   * kernels above; otherwise Reference-BLAS order. */
  function dsytd2L(n, A, lda, D, E, TAU, OB) {
    var i, j, k, taui, alpha, nn, t1, t2, dot, a0;
    var at = function (r, c) { return (r - 1) + (c - 1) * lda; };   // 1-based (r, c)
    for (i = 1; i <= n - 1; i++) {
      // DLARFG(N-I, A(I+1,I), A(MIN(I+2,N),I), 1, TAUI)
      var xo = at(Math.min(i + 2, n), i);
      dlarfg(n - i, A[at(i + 1, i)], A, xo, 1);
      A[at(i + 1, i)] = rfg.beta;
      taui = rfg.tau;
      E[i] = A[at(i + 1, i)];
      if (taui !== 0 && OB) {
        A[at(i + 1, i)] = 1;
        nn = n - i;
        var aS = at(i + 1, i + 1), vS = at(i + 1, i);
        dsymvLOB(nn, taui, A, aS, lda, A, vS, TAU, i);          // TAU(i:) := taui * A v
        dot = ddotOB(nn, TAU, i, A, vS);                         // DDOT(nn, TAU(i), 1, v, 1)
        alpha = -0.5 * taui * dot;
        daxpyOB(nn, alpha, A, vS, 1, TAU, i, 1);
        dsyr2LOB(nn, -1, A, vS, TAU, i, A, aS, lda);
        A[at(i + 1, i)] = E[i];
      } else if (taui !== 0) {
        A[at(i + 1, i)] = 1;
        nn = n - i;
        // DSYMV(L, nn, taui, A(i+1,i+1), v = A(i+1:n, i), 0, TAU(i:n-1))
        for (k = 0; k < nn; k++) TAU[i + k] = 0;
        for (j = 1; j <= nn; j++) {
          t1 = taui * A[at(i + j, i)];
          t2 = 0;
          TAU[i + j - 1] = TAU[i + j - 1] + t1 * A[at(i + j, i + j)];
          for (k = j + 1; k <= nn; k++) {
            a0 = A[at(i + k, i + j)];
            TAU[i + k - 1] = TAU[i + k - 1] + t1 * a0;
            t2 = t2 + a0 * A[at(i + k, i)];
          }
          TAU[i + j - 1] = TAU[i + j - 1] + taui * t2;
        }
        // ALPHA = -HALF*TAUI*DDOT(nn, TAU(i), 1, A(i+1,i), 1)
        dot = 0;
        for (k = 0; k < nn; k++) dot = dot + TAU[i + k] * A[at(i + 1 + k, i)];
        alpha = -0.5 * taui * dot;
        // DAXPY(nn, alpha, A(i+1,i), 1, TAU(i), 1)
        if (alpha !== 0) for (k = 0; k < nn; k++) TAU[i + k] = TAU[i + k] + alpha * A[at(i + 1 + k, i)];
        // DSYR2(L, nn, -1, v, 1, w = TAU(i), 1, A(i+1,i+1))
        for (j = 1; j <= nn; j++) {
          var xj = A[at(i + j, i)], yj = TAU[i + j - 1];
          if (xj !== 0 || yj !== 0) {
            t1 = -1 * yj; t2 = -1 * xj;
            for (k = j; k <= nn; k++) {
              A[at(i + k, i + j)] = A[at(i + k, i + j)] + A[at(i + k, i)] * t1 + TAU[i + k - 1] * t2;
            }
          }
        }
        A[at(i + 1, i)] = E[i];
      }
      D[i] = A[at(i, i)];
      TAU[i] = taui;
    }
    D[n] = A[at(n, n)];
  }

  /* DLARF1F(side='L'): C := H * C with H = I - tau v v^T, v(1) = 1 NOT
   * stored (LAPACK 3.12.1, which is what dorm2r/dgeqr2/dgebd2 call in
   * OpenBLAS 0.3.34). C is m x ncol column-major at C[cOff], ldc. v(2..m)
   * are V[vOff + (i-1)*incv], i = 2..m. */
  function dlarf1fL(m, ncol, V, vOff, incv, tau, C, cOff, ldc, work, OB) {
    var lastv = 1, lastc = 0, i, j, t, ip;
    if (tau !== 0) {
      lastv = m;
      ip = vOff + (lastv - 2) * incv;       // vOff is v(2); v(lastv) sits lastv-2 strides on
      while (lastv > 1 && V[ip] === 0) { lastv--; ip -= incv; }
      // ILADLC(lastv, ncol, C): last non-zero column of C(1:lastv, :)
      lastc = 0;
      for (j = ncol; j >= 1; j--) {
        var nz = false;
        for (i = 1; i <= lastv; i++) if (C[cOff + (i - 1) + (j - 1) * ldc] !== 0) { nz = true; break; }
        if (nz) { lastc = j; break; }
      }
    }
    if (lastc === 0) return;
    if (lastv === 1) {                       // C := (1 - tau) C(1, 1:lastc)
      t = 1 - tau;
      for (j = 0; j < lastc; j++) C[cOff + j * ldc] = t * C[cOff + j * ldc];
      return;
    }
    if (OB) {
      dgemvTOB(lastv - 1, lastc, 1, C, cOff + 1, ldc, V, vOff, incv, work, 0);   // w := C(2:lastv,:)^T v(2:)
      daxpyOB(lastc, 1, C, cOff, ldc, work, 0, 1);                               // w += C(1,:)^T
      daxpyOB(lastc, -tau, work, 0, 1, C, cOff, ldc);                            // C(1,:) -= tau w
      dgerOB(lastv - 1, lastc, -tau, V, vOff, incv, work, 0, 1, C, cOff + 1, ldc); // C(2:,:) -= tau v w^T
      return;
    }
    // w(1:lastc) := C(2:lastv, 1:lastc)^T v(2:lastv)   (DGEMV 'T', beta 0)
    for (j = 0; j < lastc; j++) {
      t = 0;
      for (i = 2; i <= lastv; i++) t = t + C[cOff + (i - 1) + j * ldc] * V[vOff + (i - 2) * incv];
      work[j] = t;
    }
    // w += C(1, 1:lastc)^T                                  (DAXPY, 1.0)
    for (j = 0; j < lastc; j++) work[j] = work[j] + 1 * C[cOff + j * ldc];
    // C(1, 1:lastc) -= tau * w                              (DAXPY, -tau)
    for (j = 0; j < lastc; j++) C[cOff + j * ldc] = C[cOff + j * ldc] + (-tau) * work[j];
    // C(2:lastv, 1:lastc) -= tau * v(2:lastv) w^T           (DGER)
    for (j = 0; j < lastc; j++) {
      if (work[j] !== 0) {
        t = (-tau) * work[j];
        for (i = 2; i <= lastv; i++) C[cOff + (i - 1) + j * ldc] = C[cOff + (i - 1) + j * ldc] + V[vOff + (i - 2) * incv] * t;
      }
    }
  }

  /* DLARF1F(side='R'): C := C * H, v stored along a ROW of A with stride
   * incv (dgebd2's row reflectors). C is m x n column-major. */
  function dlarf1fR(m, ncol, V, vOff, incv, tau, C, cOff, ldc, work) {
    var lastv = 1, lastc = 0, i, j, t, ip;
    if (tau !== 0) {
      lastv = ncol;
      ip = vOff + (lastv - 2) * incv;       // vOff is v(2); v(lastv) sits lastv-2 strides on
      while (lastv > 1 && V[ip] === 0) { lastv--; ip -= incv; }
      // ILADLR(m, lastv, C): last non-zero row of C(:, 1:lastv)
      lastc = 0;
      for (i = m; i >= 1; i--) {
        var nz = false;
        for (j = 1; j <= lastv; j++) if (C[cOff + (i - 1) + (j - 1) * ldc] !== 0) { nz = true; break; }
        if (nz) { lastc = i; break; }
      }
    }
    if (lastc === 0) return;
    if (lastv === 1) {
      t = 1 - tau;
      for (i = 0; i < lastc; i++) C[cOff + i] = t * C[cOff + i];
      return;
    }
    // w(1:lastc) := C(1:lastc, 2:lastv) v(2:lastv)   (DGEMV 'N', beta 0)
    for (i = 0; i < lastc; i++) work[i] = 0;
    for (j = 2; j <= lastv; j++) {
      t = 1 * V[vOff + (j - 2) * incv];
      if (t !== 0) for (i = 0; i < lastc; i++) work[i] = work[i] + t * C[cOff + i + (j - 1) * ldc];
    }
    for (i = 0; i < lastc; i++) work[i] = work[i] + 1 * C[cOff + i];
    for (i = 0; i < lastc; i++) C[cOff + i] = C[cOff + i] + (-tau) * work[i];
    for (j = 2; j <= lastv; j++) {
      var yj = V[vOff + (j - 2) * incv];
      if (yj !== 0) {
        t = (-tau) * yj;
        for (i = 0; i < lastc; i++) C[cOff + i + (j - 1) * ldc] = C[cOff + i + (j - 1) * ldc] + work[i] * t;
      }
    }
  }

  /* DORM2R(side='L'): C := Q C (trans='N') or Q^T C (trans='T') with
   * Q = H(1) H(2) ... H(k), reflector i in column i of A below A(i,i). */
  function dorm2rL(trans, m, ncol, k, A, aOff, lda, TAU, tauOff, C, cOff, ldc, OB) {
    var work = new Float64Array(Math.max(1, ncol));
    var i, i1, i2, i3;
    if (m === 0 || ncol === 0 || k === 0) return;
    if (trans) { i1 = 1; i2 = k; i3 = 1; } else { i1 = k; i2 = 1; i3 = -1; }
    for (i = i1; i3 > 0 ? i <= i2 : i >= i2; i += i3) {
      var mi = m - i + 1, ic = i;
      dlarf1fL(mi, ncol, A, aOff + (i - 1) + (i - 1) * lda + 1, 1, TAU[tauOff + i - 1],
        C, cOff + (ic - 1), ldc, work, OB);
    }
  }

  /**
   * np.linalg.eigh(a) for a real symmetric n x n matrix, UPLO='L'.
   *
   * @param {Float64Array|Float32Array|number[]} a  row-major n*n, symmetric
   * @param {number} n
   * @param {object} [opts] {dtype: 'f32' | 'f64'} result dtype; defaults to
   *   the input's (Float32Array in -> float32 out, exactly as numpy casts a
   *   float64 computation back to float32 for a float32 input).
   * @returns {{w: Float64Array|Float32Array, v: Float64Array|Float32Array, info: number}}
   *   w ascending; v row-major n x n with the EIGENVECTORS IN COLUMNS
   *   (v[i*n + j] = component i of eigenvector j), like numpy.
   *
   * The computation is always float64 (dsyevd). Only the lower triangle
   * a[i*n + j], i >= j, is read - for symmetric input this is numpy's
   * UPLO='L'. info > 0 means dsteqr did not converge; numpy raises
   * LinAlgError there, and so does this.
   */
  PF.eigh = function (a, n, opts) {
    opts = opts || {};
    n = n | 0;
    if (!(n >= 0)) err('eigh: n must be >= 0');
    if (!a || a.length !== n * n) err('eigh: a must have n*n = ' + (n * n) + ' elements, got ' + (a ? a.length : a));
    var out32 = opts.dtype === 'f32' || opts.dtype === 'f4' ||
      ((opts.dtype === undefined || opts.dtype === null) && a instanceof Float32Array);
    var i, j;
    // column-major working copy: A(i,j) = a[i][j]; only i >= j is read
    var A = new Float64Array(n * n);
    for (j = 0; j < n; j++) for (i = j; i < n; i++) {
      A[i + j * n] = a[i * n + j];
    }
    var D = new Float64Array(n + 1), E = new Float64Array(Math.max(n, 1)), TAU = new Float64Array(Math.max(n, 1));
    var Z = new Float64Array(n * n), info = 0;
    if (n === 1) { D[1] = A[0]; Z[0] = 1; }
    else if (n > 1) {
      // dsyevd: scale the matrix if its max-abs is outside [rmin, rmax]
      var smlnum = SAFMIN / PREC, bignum = 1 / smlnum;
      var rmin = Math.sqrt(smlnum), rmax = Math.sqrt(bignum);
      var anrm = 0, v;
      for (j = 0; j < n; j++) for (i = j; i < n; i++) {        // DLANSY('M', 'L')
        v = Math.abs(A[i + j * n]);
        if (anrm < v || v !== v) anrm = v;
      }
      var iscale = 0, sigma = 1;
      if (anrm > 0 && anrm < rmin) { iscale = 1; sigma = rmin / anrm; }
      else if (anrm > rmax) { iscale = 1; sigma = rmax / anrm; }
      if (iscale === 1) {                                       // DLASCL('L', ...) on the lower triangle
        for (j = 0; j < n; j++) dlascl(1, sigma, A, j + j * n, n - j, 1);
      }
      if (n > 25) err('eigh: n > 25 takes dstedc\'s divide-and-conquer path, which is not ported');
      // OpenBLAS kernel order where every kernel call stays on a modelled
      // scalar path (n <= 5: dorm2r's dgemv then has <= 3 rows); larger n
      // falls back to Reference-BLAS order - float32 results still match,
      // float64 bits need not (the reference only ever asks for n = 3).
      var OB = PF._linalg.blas !== 'reference' && n <= 5;
      dsytd2L(n, A, n, D, E, TAU, OB);
      info = dsteqr(n, D, E, Z, n);                              // dstedc -> dsteqr for n <= SMLSIZ = 25
      // DORMTR('L', 'L', 'N'): Z := Q Z, Q from dsytd2's reflectors
      dorm2rL(false, n - 1, n, n - 1, A, 1, n, TAU, 1, Z, 1, n, OB);
      if (iscale === 1) for (i = 1; i <= n; i++) D[i] = D[i] * (1 / sigma);
    }
    if (info > 0) err('eigh: Eigenvalues did not converge (dsteqr info=' + info + ')');
    var C = out32 ? Float32Array : Float64Array;
    var w = new C(n), vv = new C(n * n);
    for (i = 0; i < n; i++) w[i] = D[i + 1];
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) vv[i * n + j] = Z[i + j * n];
    return { w: w, v: vv, info: info };
  };

  /* ================================================================== *
   * np.linalg.lstsq(a, b, rcond=None)
   *
   * numpy -> dgelsd. For m >= mnthr = int(min(m,n) * 1.6) the path is:
   * DGEQRF (QR) -> DORMQR (b := Q^T b) -> DGEBRD on the n x n R ->
   * DORMBR -> DLALSD (SVD of the bidiagonal, singular values below
   * rcond * s_max dropped: this is what makes the answer the MINIMUM-NORM
   * solution when A is rank-deficient) -> DORMBR.
   *
   * THE CALL SITES CANNOT BE RANK-DEFICIENT. channels.py:186/223 return
   * early unless >= 3 DISTINCT lattice indices k carry positive weight;
   * A = [w, k*w] then has two linearly independent columns, and with
   * |k| <= extent/1.2 and weights >= 0.12 the smaller singular value is
   * nowhere near rcond (= m * 2.2e-16) times the larger. So on every
   * reachable input the solution is the unique least-squares one; the
   * rank-deficient branch below is ported for fidelity and tested on
   * synthetic inputs, not because the reference can reach it.
   *
   * n <= 2 only. That is every call site (the two columns [1, k]); the
   * bidiagonal SVD of a 2 x 2 is dbdsqr's dlasv2 branch, and the general
   * implicit-shift sweep that larger n would need is not ported: asking
   * for it throws.
   * ================================================================== */

  /* DLASV2: SVD of the 2x2 upper triangular [[f, g], [0, h]]. */
  var sv2 = { ssmin: 0, ssmax: 0, snr: 0, csr: 0, snl: 0, csl: 0 };
  function dlasv2(f, g, h) {
    var ft = f, fa = Math.abs(ft), ht = h, ha = Math.abs(h), pmax = 1, swap = ha > fa, temp;
    var gt, ga, gasmal, clt, crt, slt, srt, ssmin, ssmax, d, l, m, t, mm, tt, s, r, a, tsign;
    if (swap) { pmax = 3; temp = ft; ft = ht; ht = temp; temp = fa; fa = ha; ha = temp; }
    gt = g; ga = Math.abs(gt);
    if (ga === 0) { ssmin = ha; ssmax = fa; clt = 1; crt = 1; slt = 0; srt = 0; }
    else {
      gasmal = true;
      if (ga > fa) {
        pmax = 2;
        if ((fa / ga) < EPS) {
          gasmal = false;
          ssmax = ga;
          if (ha > 1) ssmin = fa / (ga / ha); else ssmin = (fa / ga) * ha;
          clt = 1; slt = ht / gt; srt = 1; crt = ft / gt;
        }
      }
      if (gasmal) {
        d = fa - ha;
        if (d === fa) l = 1; else l = d / fa;
        m = gt / ft;
        t = 2 - l;
        mm = m * m; tt = t * t;
        s = Math.sqrt(tt + mm);
        if (l === 0) r = Math.abs(m); else r = Math.sqrt(l * l + mm);
        a = 0.5 * (s + r);
        ssmin = ha / a;
        ssmax = fa * a;
        if (mm === 0) {
          if (l === 0) t = fsign(2, ft) * fsign(1, gt);
          else t = gt / fsign(d, ft) + m / t;
        } else {
          t = (m / (s + t) + m / (r + l)) * (1 + a);
        }
        l = Math.sqrt(t * t + 4);
        crt = 2 / l;
        srt = t / l;
        clt = (crt + srt * m) / a;
        slt = (ht / ft) * srt / a;
      }
    }
    var csl, snl, csr, snr;
    if (swap) { csl = srt; snl = crt; csr = slt; snr = clt; }
    else { csl = clt; snl = slt; csr = crt; snr = srt; }
    if (pmax === 1) tsign = fsign(1, csr) * fsign(1, csl) * fsign(1, f);
    if (pmax === 2) tsign = fsign(1, snr) * fsign(1, csl) * fsign(1, g);
    if (pmax === 3) tsign = fsign(1, snr) * fsign(1, snl) * fsign(1, h);
    sv2.ssmax = fsign(ssmax, tsign);
    sv2.ssmin = fsign(ssmin, tsign * fsign(1, f) * fsign(1, h));
    sv2.snr = snr; sv2.csr = csr; sv2.snl = snl; sv2.csl = csl;
    return sv2;
  }

  /* DROT on two elements x, y: x := c x + s y, y := c y - s x. OpenBLAS
   * (kernel/x86_64/drot.c, strided path - every call here is strided)
   * compiles "temp = c*x + s*y" to fma(c, x, s*y) and "y = c*y - s*x" to
   * fma(c, y, -(s*x)); OB selects that, otherwise Reference-BLAS order. */
  function drot1(X, xi, Y, yi, c, s, OB) {
    var tx = X[xi], ty = Y[yi];
    if (OB) { X[xi] = fma64(c, tx, s * ty); Y[yi] = fma64(c, ty, -(s * tx)); return; }
    X[xi] = c * tx + s * ty;
    Y[yi] = c * ty - s * tx;
  }

  /* DBDSQR('U', n <= 2, ncvt = n, nru = 0, ncc = 1) as DLASDQ calls it from
   * DLALSD: singular values of the upper bidiagonal (d, e), VT (n x n,
   * column-major) and C (the right-hand side, length n) rotated to match.
   * D, E 1-based. */
  function dbdsqr2(n, D, E, VT, C, OB) {
    var i, j, isub, smin, t;
    if (n > 1) {
      var eps = EPS, unfl = SAFMIN;
      var tolmul = Math.max(10, Math.min(100, Math.pow(eps, -0.125)));
      var tol = tolmul * eps, sminoa, mu, thresh;
      sminoa = Math.abs(D[1]);
      if (sminoa !== 0) {
        mu = sminoa;
        for (i = 2; i <= n; i++) {
          mu = Math.abs(D[i]) * (mu / (mu + Math.abs(E[i - 1])));
          sminoa = Math.min(sminoa, mu);
          if (sminoa === 0) break;
        }
      }
      sminoa = sminoa / Math.sqrt(n);
      thresh = Math.max(tol * sminoa, 6 * (n * (n * unfl)));
      // n == 2: one pass of the main loop either deflates or takes dlasv2
      var m = n;
      if (Math.abs(E[m - 1]) <= thresh) {
        E[m - 1] = 0;
      } else {
        dlasv2(D[m - 1], E[m - 1], D[m]);
        D[m - 1] = sv2.ssmax; E[m - 1] = 0; D[m] = sv2.ssmin;
        // DROT on rows m-1, m of VT (ncvt = n columns): cosr, sinr
        for (j = 0; j < n; j++) drot1(VT, (m - 2) + j * n, VT, (m - 1) + j * n, sv2.csr, sv2.snr, OB);
        // DROT on rows m-1, m of C: cosl, sinl
        drot1(C, m - 2, C, m - 1, sv2.csl, sv2.snl, OB);
      }
    }
    // label 160: make singular values non-negative, flipping VT rows
    for (i = 1; i <= n; i++) {
      if (D[i] === 0) D[i] = 0;
      if (D[i] < 0) {
        D[i] = -D[i];
        for (j = 0; j < n; j++) VT[(i - 1) + j * n] = -1 * VT[(i - 1) + j * n];
      }
    }
    // sort decreasing (selection of the minimum into the last free slot)
    for (i = 1; i <= n - 1; i++) {
      isub = 1; smin = D[1];
      for (j = 2; j <= n + 1 - i; j++) if (D[j] <= smin) { isub = j; smin = D[j]; }
      if (isub !== n + 1 - i) {
        var k2 = n + 1 - i;
        D[isub] = D[k2]; D[k2] = smin;
        for (j = 0; j < n; j++) { t = VT[(isub - 1) + j * n]; VT[(isub - 1) + j * n] = VT[(k2 - 1) + j * n]; VT[(k2 - 1) + j * n] = t; }
        t = C[isub - 1]; C[isub - 1] = C[k2 - 1]; C[k2 - 1] = t;
      }
    }
  }

  /* DLALSD('U', n <= 2, nrhs = 1): minimum-norm solve with the bidiagonal
   * (D, E 1-based). B (length n) is overwritten with the solution. Returns
   * the rank. */
  function dlalsd2(n, D, E, B, rcond, OB) {
    var i, j, rank = 0;
    var rcnd = (rcond <= 0 || rcond >= 1) ? EPS : rcond;
    if (n === 0) return 0;
    if (n === 1) {
      if (D[1] === 0) { B[0] = 0; }
      else { rank = 1; dlascl(D[1], 1, B, 0, 1, 1); D[1] = Math.abs(D[1]); }
      return rank;
    }
    var orgnrm = dlanstM(n, D, 1, E, 1);
    if (orgnrm === 0) { for (i = 0; i < n; i++) B[i] = 0; return 0; }
    dlascl(orgnrm, 1, D, 1, n, 1);
    dlascl(orgnrm, 1, E, 1, n - 1, 1);
    var VT = new Float64Array(n * n);                 // DLASET: VT := I
    for (i = 0; i < n; i++) VT[i + i * n] = 1;
    // DLASDQ('U', sqre=0, n, ncvt=n, nru=0, ncc=1): upper, no pre-rotation
    dbdsqr2(n, D, E, VT, B, OB);
    // DLASDQ's own sort (ascending selection; one transposition per value)
    var isub, smin, t;
    for (i = 1; i <= n; i++) {
      isub = i; smin = D[i];
      for (j = i + 1; j <= n; j++) if (D[j] < smin) { isub = j; smin = D[j]; }
      if (isub !== i) {
        D[isub] = D[i]; D[i] = smin;
        for (j = 0; j < n; j++) { t = VT[(isub - 1) + j * n]; VT[(isub - 1) + j * n] = VT[(i - 1) + j * n]; VT[(i - 1) + j * n] = t; }
        t = B[isub - 1]; B[isub - 1] = B[i - 1]; B[i - 1] = t;
      }
    }
    // TOL = RCND * |D(IDAMAX)|; drop singular values <= TOL
    var imax = 1, dmax = Math.abs(D[1]);
    for (i = 2; i <= n; i++) if (Math.abs(D[i]) > dmax) { dmax = Math.abs(D[i]); imax = i; }
    var tolv = rcnd * Math.abs(D[imax]);
    for (i = 1; i <= n; i++) {
      if (D[i] <= tolv) B[i - 1] = 0;
      else { dlascl(D[i], 1, B, i - 1, 1, 1); rank++; }
    }
    // DGEMM('T', 'N', n, 1, n, 1, VT, n, B, n, 0, work, n): x = VT^T b
    var X = new Float64Array(n), acc;
    for (i = 0; i < n; i++) {
      if (OB && n === 2 && PF._linalg.dgemmForm === 'gemv') {
        // OpenBLAS forwarding an n x 1 GEMM to dgemv_t: 2-row scalar tail
        acc = fma64(VT[0 + i * n], B[0], VT[1 + i * n] * B[1]);
      } else if (OB) {
        // GEMM kernel: FMA chain in k order from a ZEROED register, so a
        // -0 product becomes +0 (MEASURED: the b_zero case)
        acc = 0;
        for (j = 0; j < n; j++) acc = fma64(VT[j + i * n], B[j], acc);
      } else {
        acc = 0;
        for (j = 0; j < n; j++) acc = acc + VT[j + i * n] * B[j];
      }
      X[i] = 1 * acc;
    }
    for (i = 0; i < n; i++) B[i] = X[i];
    dlascl(1, orgnrm, D, 1, n, 1);
    dlascl(orgnrm, 1, B, 0, n, 1);
    return rank;
  }

  /**
   * np.linalg.lstsq(a, b, rcond=None)[0] for a (m x n) float64 and a
   * 1-D b of length m, n <= 2 and m >= n.
   *
   * @param {Float64Array|number[]} a  row-major m*n
   * @returns {{x: Float64Array, rank: number, s: Float64Array}}
   *   x: the solution (length n); rank and singular values s (descending)
   *   as numpy returns them.
   */
  PF.lstsq = function (a, m, n, b, rcond) {
    m = m | 0; n = n | 0;
    if (!a || a.length !== m * n) err('lstsq: a must have m*n elements');
    if (!b || b.length !== m) err('lstsq: b must have m elements (1-D b only)');
    if (n > 2) err('lstsq: n = ' + n + ' > 2 needs dbdsqr\'s implicit-shift sweep, which is not ported (every reference call site has n = 2)');
    if (m < n) err('lstsq: m < n (dgelsd\'s LQ path) is not ported; every reference call site has m >= 4');
    if (rcond === undefined || rcond === null) rcond = PREC * Math.max(m, n);   // numpy: finfo(float64).eps * max(m, n)
    var i, j;
    var A = new Float64Array(m * n);                    // column-major copy
    for (i = 0; i < m; i++) for (j = 0; j < n; j++) A[i + j * m] = a[i * n + j];
    var B = new Float64Array(Math.max(m, n));
    for (i = 0; i < m; i++) B[i] = b[i];
    var S = new Float64Array(n), rank = 0;
    if (m === 0 || n === 0) return { x: new Float64Array(n), rank: 0, s: S };
    // scale A and B into range
    var smlnum = SAFMIN / PREC, bignum = 1 / smlnum, anrm = 0, bnrm = 0, v;
    for (i = 0; i < m * n; i++) { v = Math.abs(A[i]); if (anrm < v || v !== v) anrm = v; }
    var iascl = 0, ibscl = 0;
    if (anrm > 0 && anrm < smlnum) { dlascl(anrm, smlnum, A, 0, m * n, 1); iascl = 1; }
    else if (anrm > bignum) { dlascl(anrm, bignum, A, 0, m * n, 1); iascl = 2; }
    else if (anrm === 0) {
      return { x: new Float64Array(n), rank: 0, s: S };
    }
    for (i = 0; i < m; i++) { v = Math.abs(B[i]); if (bnrm < v || v !== v) bnrm = v; }
    if (bnrm > 0 && bnrm < smlnum) { dlascl(bnrm, smlnum, B, 0, m, 1); ibscl = 1; }
    else if (bnrm > bignum) { dlascl(bnrm, bignum, B, 0, m, 1); ibscl = 2; }
    var mnthr = Math.trunc(Math.min(m, n) * 1.6);    // ILAENV(6, 'DGELSD'): INT(REAL(MIN(M,N))*1.6E0)
    var OB = PF._linalg.blas !== 'reference';
    var mm = m, work = new Float64Array(Math.max(m, n) + 1);
    var TAU = new Float64Array(n), TAUQ = new Float64Array(n), TAUP = new Float64Array(n);
    if (m >= mnthr) {
      mm = n;
      // DGEQR2
      for (i = 1; i <= Math.min(m, n); i++) {
        var aii = (i - 1) + (i - 1) * m;
        dlarfg(m - i + 1, A[aii], A, (Math.min(i + 1, m) - 1) + (i - 1) * m, 1);
        A[aii] = rfg.beta; TAU[i - 1] = rfg.tau;
        if (i < n) dlarf1fL(m - i + 1, n - i, A, aii + 1, 1, TAU[i - 1], A, (i - 1) + i * m, m, work, OB);
      }
      // DORMQR('L', 'T'): B := Q^T B
      dorm2rL(true, m, 1, n, A, 0, m, TAU, 0, B, 0, m, OB);
      // zero the strict lower triangle of R
      for (j = 1; j <= n - 1; j++) for (i = j + 1; i <= n; i++) A[(i - 1) + (j - 1) * m] = 0;
    }
    // DGEBD2 (mm x n, mm >= n): upper bidiagonal
    var Dd = new Float64Array(n + 1), Ee = new Float64Array(Math.max(n, 1));
    for (i = 1; i <= n; i++) {
      var ai = (i - 1) + (i - 1) * m;
      dlarfg(mm - i + 1, A[ai], A, (Math.min(i + 1, mm) - 1) + (i - 1) * m, 1);
      A[ai] = rfg.beta; TAUQ[i - 1] = rfg.tau;
      Dd[i] = A[ai];
      if (i < n) dlarf1fL(mm - i + 1, n - i, A, ai + 1, 1, TAUQ[i - 1], A, (i - 1) + i * m, m, work, OB);
      if (i < n) {
        var aip = (i - 1) + i * m;
        dlarfg(n - i, A[aip], A, (i - 1) + (Math.min(i + 2, n) - 1) * m, m);
        A[aip] = rfg.beta; TAUP[i - 1] = rfg.tau;
        Ee[i] = A[aip];
        dlarf1fR(mm - i, n - i, A, aip + m, m, TAUP[i - 1], A, i + i * m, m, work);
      } else {
        TAUP[i - 1] = 0;
      }
    }
    // DORMBR('Q', 'L', 'T', mm, 1, n): B := Q_bd^T B   (nq = mm >= k = n)
    dorm2rL(true, mm, 1, n, A, 0, m, TAUQ, 0, B, 0, m, OB);
    rank = dlalsd2(n, Dd, Ee, B, rcond, OB);
    // DORMBR('P', 'L', 'N', n, 1, n): B := P B; nq = n = k, so DORMLQ on
    // rows 2..n with the n-1 row reflectors. For n <= 2 there is at most
    // one reflector of length 1, whose tau dgebd2 set to zero: a no-op.
    if (n > 1) {
      for (i = 1; i <= n - 1; i++) if (TAUP[i - 1] !== 0) err('lstsq: internal - non-trivial P reflector for n <= 2');
    }
    for (i = 1; i <= n; i++) S[i - 1] = Dd[i];
    // DLASRT('D') of s already done inside dlalsd2 via dbdsqr's sort; undo scaling
    if (iascl === 1) { dlascl(anrm, smlnum, B, 0, n, 1); dlascl(smlnum, anrm, S, 0, n, 1); }
    else if (iascl === 2) { dlascl(anrm, bignum, B, 0, n, 1); dlascl(bignum, anrm, S, 0, n, 1); }
    if (ibscl === 1) dlascl(smlnum, bnrm, B, 0, n, 1);
    else if (ibscl === 2) dlascl(bignum, bnrm, B, 0, n, 1);
    var x = new Float64Array(n);
    for (i = 0; i < n; i++) x[i] = B[i];
    // dlalsd sorted D descending before returning; S mirrors numpy's s
    var sd = Array.prototype.slice.call(S).sort(function (p, q) { return q - p; });
    for (i = 0; i < n; i++) S[i] = sd[i];
    return { x: x, rank: rank, s: S };
  };

  /* ================================================================== *
   * float32 matmul - OpenBLAS sgemm / ssyrk on this CPU
   * ================================================================== */

  /* Exact float32 fused multiply-add. Shared with pf-03-cv2.js's PF._fmaf
   * (the same double-rounding repair); read from PF at call time so a
   * negative control that swaps it is seen here too. */
  function fmaf(a, b, c) { return PF._fmaf(a, b, c); }

  /* sgemv_t's SkylakeX small-m kernel for a 3-long dot
   * (kernel/x86_64/sgemv_t_microk_skylakex_template.c, sgemv_kernel_t_3):
   * outputs are produced in blocks of 16 and 8 as fma(x2,c3, fma(x1,c2,
   * c1*x0)); a remaining block of 4 as fma(c3,x2, fma(c1,x0, c2*x1)); a
   * pair through hadd as (p0 + p1) + p2; a last single output as the
   * scalar "a0*x0 + a1*x1 + a2*x2", which gcc compiles to fma(a2,x2,
   * fma(a0,x0, a1*x1)). Every result is then added to y, which the
   * interface zeroed (beta = 0), so a -0 comes out +0. */
  function sgemvT3(M, rowC, x0, x1, x2, out) {
    var t16 = M & ~15, t8 = M & ~7, t4 = M & ~3, t2 = M & ~1, j, c, v;
    for (j = 0; j < M; j++) {
      c = rowC(j);
      if (j < t8) v = fmaf(x2, c[2], fmaf(x1, c[1], fr(c[0] * x0)));
      else if (j < t4) v = fmaf(c[2], x2, fmaf(c[0], x0, fr(c[1] * x1)));
      else if (j < t2) v = fr(fr(fr(c[0] * x0) + fr(c[1] * x1)) + fr(fr(c[2] * x2) + 0));   // hadd: lane 3 is a masked +0
      else v = fmaf(c[2], x2, fmaf(c[0], x0, fr(c[1] * x1)));
      out(j, fr(v + 0));
    }
    return t16;   // (t16 only documents the block split; all blocks share the formula)
  }

  /**
   * float32 (n x k) @ (k x p) as numpy -> OpenBLAS computes it on this CPU.
   *   n > 1 and p > 1: sgemm. Each output is an FMA chain in k order from a
   *     zeroed accumulator: fma(a[i,k-1], b[k-1,j], ... fma(a[i,0], b[0,j], 0)).
   *     MEASURED (tools/probe-linalg-matmul.py) at K = 3: 280000/280000 on
   *     (20000,3)@(3,14) and on A @ centers.T; plain ((p0+p1)+p2) scores
   *     190623, the reversed chain 161041.
   *   n == 1 or p == 1 (k == 3): numpy calls sgemv instead, a different
   *     kernel with different rounding (sgemvT3 above). REACHABLE:
   *     reconsearch._quantize multiplies 262144-row blocks, and an image of
   *     e.g. 481x545 = 262145 px leaves a last block of ONE row.
   *   n == 1 and p == 1 is np.dot -> sdot: not modelled, throws.
   * k must be < 512 (one GEMM_Q block): beyond that the kernel K-blocks
   * and adds block partials, which reconsearch never needs from sgemm.
   *
   * @param {Float32Array} a  row-major n*k
   * @param {Float32Array} b  row-major k*p (pass centers.T as its
   *                          transpose, i.e. a row-major k*p copy)
   */
  PF.matmulF32 = function (a, n, k, b, p) {
    if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) err('matmulF32: float32 inputs');
    if (a.length !== n * k || b.length !== k * p) err('matmulF32: shape mismatch');
    if (k >= 512) err('matmulF32: k >= 512 would be K-blocked by the kernel; not modelled');
    var out = new Float32Array(n * p), i, j, t, acc;
    if (n === 1 && p === 1) err('matmulF32: (1,k)@(k,1) is np.dot -> sdot, not modelled');
    if (n === 1 || p === 1) {
      if (k !== 3) err('matmulF32: a vector product with k != 3 takes another sgemv kernel; only k = 3 is modelled');
      if (n === 1) {        // (1,3) @ (3,p): outputs j over the columns of b
        sgemvT3(p, function (jj) { return [b[jj], b[p + jj], b[2 * p + jj]]; }, a[0], a[1], a[2],
          function (jj, v) { out[jj] = v; });
      } else {              // (n,3) @ (3,1): outputs over the rows of a
        sgemvT3(n, function (ii) { return [a[ii * 3], a[ii * 3 + 1], a[ii * 3 + 2]]; }, b[0], b[1], b[2],
          function (ii, v) { out[ii] = v; });
      }
      return out;
    }
    for (i = 0; i < n; i++) {
      for (j = 0; j < p; j++) {
        acc = 0;
        for (t = 0; t < k; t++) acc = fmaf(a[i * k + t], b[t * p + j], acc);
        out[i * p + j] = acc;
      }
    }
    return out;
  };

  /* OpenBLAS level3_syrk.c K-blocking for this CPU's sgemm kernel:
   * GEMM_Q = 512 here (measured, see below); a remainder between Q and 2Q
   * is split in two, the first half ceil(m/2). */
  PF._linalg = { syrkQ: 512, blas: 'openblas', axpyStridedFused: true, dgemmForm: 'chain' };

  /**
   * float32 x.T @ x for x (n x k), k small - numpy calls cblas_ssyrk for
   * A^T A. Per K-block (rows ls..ls+min_l-1 of x) every output is an FMA
   * chain from zero in row order; each block's result is then ADDED into
   * C in float32. MEASURED: 72/72 over n in {601..3001} of random data and
   * 9/9 on the three real fixture covariances, against 20-39/72 for Q in
   * {448, 576} or a floor split, and 0-5/9 for an unblocked chain or an
   * exact float64 sum. Returns a row-major k*k Float32Array (symmetric).
   */
  PF.syrkF32 = function (x, n, k) {
    if (!(x instanceof Float32Array)) err('syrkF32: float32 input');
    if (x.length !== n * k) err('syrkF32: shape mismatch');
    var Q = PF._linalg.syrkQ;
    var C = new Float32Array(k * k), acc = new Float32Array(k * k);
    var ls = 0, minl, r, i, j, base;
    while (ls < n) {
      minl = n - ls;
      if (minl >= 2 * Q) minl = Q;
      else if (minl > Q) minl = (minl + 1) >> 1;
      acc.fill(0);
      for (r = ls; r < ls + minl; r++) {
        base = r * k;
        for (i = 0; i < k; i++) for (j = 0; j < k; j++) {
          acc[i * k + j] = fmaf(x[base + i], x[base + j], acc[i * k + j]);
        }
      }
      for (i = 0; i < k * k; i++) C[i] = fr(C[i] + acc[i]);
      ls += minl;
    }
    return C;
  };

  /* ================================================================== *
   * Complex and transcendental pieces the full-mode channels call
   * (channels._rayleigh_score, _tiles_ray_z, _ray_quick feed ray_e1,
   * tile_e1, tile_e2 - three of the four channels core.py fuses; np.hanning
   * and np.log10 feed spec_e1). MEASURED on the reference's own peak lists
   * at every fusion ladder step (tools/parity-linalg-trans.py):
   *
   *   theta = imag(2j * np.pi * p / step) is (2*pi*p) * (1/step), NOT
   *     (2*pi*p) / step: numpy divides a complex by a real by multiplying
   *     with the reciprocal (PF.complexDivReal). 64620/64620; the division
   *     rounds differently on 15309 of them.
   *   (h * ph).sum()   complex pairwise sum, PF.complexSum: exact.
   *   np.abs(z)        the UCRT hypot, max * sqrt(fma(r, r, 1)) with
   *     r = min/max: PF.cabs, 20000/20000 (Math.hypot 19249, plain
   *     sqrt(x*x+y*y) 12462). numpy's hypot is NOT correctly rounded
   *     (65% of 6000 against a 60-digit reference), so only its own
   *     formula can match it.
   *   cos / sin (inside np.exp of an imaginary array), np.arctan2 behind
   *     np.angle, np.log10: numpy calls the Microsoft UCRT (np.cos ==
   *     math.cos on 25000/25000, unchanged with SIMD dispatch disabled),
   *     which is closed and NOT correctly rounded (cos 97.0%, sin 96.9%,
   *     arctan2 99.87%, log10 99.98% of 6000). They cannot be reproduced
   *     bit for bit here; V8's Math.* agrees on 97.7% (cos) / 97.6% (sin)
   *     of the real Rayleigh angles, 82% (atan2), 93.7% (log10), always
   *     within the bound tools/test-linalg.cjs prints.
   * ================================================================== */

  /* numpy CDOUBLE_pairwise_sum (loops_utils.h.src) over m complex
   * elements: n = 2m scalars; < 8 scalars sequential; <= 128 scalars four
   * accumulators per component (elements i%4), combined (0+1)+(2+3), then
   * the remainder; larger halves at a multiple of 8 scalars. */
  function cpw(re, im, off, m, out) {
    var n = 2 * m, i, k;
    if (n < 8) {
      var rr = 0, ri = 0;
      for (i = 0; i < m; i++) { rr = rr + re[off + i]; ri = ri + im[off + i]; }
      out[0] = rr; out[1] = ri; return;
    }
    if (n <= 128) {
      var r0 = re[off], r1 = re[off + 1], r2 = re[off + 2], r3 = re[off + 3];
      var i0 = im[off], i1 = im[off + 1], i2 = im[off + 2], i3 = im[off + 3];
      var end = (n - (n % 8)) / 2;
      for (k = 4; k < end; k += 4) {
        r0 = r0 + re[off + k]; i0 = i0 + im[off + k];
        r1 = r1 + re[off + k + 1]; i1 = i1 + im[off + k + 1];
        r2 = r2 + re[off + k + 2]; i2 = i2 + im[off + k + 2];
        r3 = r3 + re[off + k + 3]; i3 = i3 + im[off + k + 3];
      }
      var sr = (r0 + r1) + (r2 + r3), si = (i0 + i1) + (i2 + i3);
      for (; k < m; k++) { sr = sr + re[off + k]; si = si + im[off + k]; }
      out[0] = sr; out[1] = si; return;
    }
    var n2 = (n / 2) | 0;
    n2 -= n2 % 8;
    var a = [0, 0], b = [0, 0];
    cpw(re, im, off, n2 / 2, a);
    cpw(re, im, off + n2 / 2, m - n2 / 2, b);
    out[0] = a[0] + b[0]; out[1] = a[1] + b[1];
  }
  /** ndarray.sum() of a 1-D complex128 array given as (re, im) float64
   *  arrays. Returns {re, im}. The reduction starts from the identity 0. */
  PF.complexSum = function (re, im) {
    if (!re || !im || re.length !== im.length) err('complexSum: re and im must have one length');
    var o = [0, 0];
    cpw(re, im, 0, re.length, o);
    return { re: 0 + o[0], im: 0 + o[1] };
  };

  /** np.abs of a complex128 scalar (the UCRT hypot). */
  PF.cabs = function (re, im) {
    var a = Math.abs(re), b = Math.abs(im);
    if (a === Infinity || b === Infinity) return Infinity;
    if (a !== a || b !== b) return NaN;
    var mx = a > b ? a : b, mn = a > b ? b : a;
    if (mx === 0) return 0;
    var r = mn / mx;
    return mx * Math.sqrt(fma64(r, r, 1));
  };

  /** complex128 array (re, im) divided by a real scalar d, as numpy's
   *  CDOUBLE_divide does it for d + 0j (Smith's branch with rat = 0):
   *  scl = 1/d; out = ((re + im*rat) * scl, (im - re*rat) * scl).
   *  A reciprocal multiply - not re/d, im/d. Returns {re, im} arrays. */
  PF.complexDivReal = function (re, im, d) {
    var n = re.length, ore = new Float64Array(n), oim = new Float64Array(n), i;
    if (d === 0) {                           // divide by zero: numpy's in1/|in2r| branch
      for (i = 0; i < n; i++) { ore[i] = re[i] / 0; oim[i] = im[i] / 0; }
      return { re: ore, im: oim };
    }
    var rat = 0 / d, scl = 1.0 / (d + 0 * rat);
    for (i = 0; i < n; i++) {
      ore[i] = (re[i] + im[i] * rat) * scl;
      oim[i] = (im[i] - re[i] * rat) * scl;
    }
    return { re: ore, im: oim };
  };

  /** np.hanning(M) = 0.5 + 0.5*cos(pi*n/(M-1)), n = arange(1-M, M, 2).
   *  The structure is numpy's exactly (9375/9375 when np.cos is used);
   *  the cos is the platform's - see the section header. */
  PF.hanning = function (M) {
    M = +M;
    if (M < 1) return new Float64Array(0);
    if (M === 1) return new Float64Array([1]);
    var len = Math.ceil((M - (1 - M)) / 2), out = new Float64Array(len), i, nn;
    for (i = 0; i < len; i++) {
      nn = (1 - M) + i * 2;                  // arange(1-M, M, 2): integer-valued, exact
      out[i] = 0.5 + 0.5 * Math.cos(Math.PI * nn / (M - 1));
    }
    return out;
  };

  // exposed for the tests' negative controls and for a reader
  PF._linalgInternals = {
    dlartg: dlartg, dlaev2: dlaev2, dlasv2: dlasv2, dnrm2: dnrm2, dlapy2: dlapy2,
    dsteqr: dsteqr, dsytd2L: dsytd2L, fsign: fsign
  };

  PF.versionLinalg = 'pf-06-linalg/1';
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
    // SUPERSEDED (2026-09-18): this used to say "12 iterations at eps 0.5
    // is far from converged on purpose: it is a pre-processing palette".
    // Measured on 13 real traits with each attempt reporting where it
    // stopped: 24 of 26 stopped by eps within 2 to 11 iterations, one file
    // in 26 hit the cap. At this budget the k-means IS converged on real
    // traits. The budget stays for the reason that is true: raising
    // attempts or iterations leaves the seed sensitivity in the same band
    // (176 to 198 post-palette cells per file and seed across six settings,
    // 195 at 2x12) and moves the shipped result on 2 to 12 of 20 files for
    // nothing; and it is the reference's own budget (quantize.py).
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

/* ==== pf-23-varcontrast.js ======================================== */
/* pf-23-varcontrast.js - port of pixelfixer/varcontrast.py (ef376e5):
 * variance-contrast grid scoring, the "square packer" channel.
 *
 * Reference module docstring, kept verbatim because it records WHY the
 * measure is shaped this way:
 *
 *   Idea (from Kopf et al.'s content-adaptive kernels, turned into a
 *   detector): a pixel grid is correct when the image decomposes into cells
 *   that are each internally color-homogeneous. Measure, for a candidate
 *   cell size s, the mean within-cell color variance at the BEST grid phase
 *   versus the WORST phase:
 *
 *     contrast(s) = (var_worst_phase(s) - var_best_phase(s)) / total_variance
 *
 *   * true cell size: best phase aligns cells with pseudo-pixels (low
 *     variance), worst phase makes every cell straddle boundaries (high
 *     variance) -> large contrast
 *   * half the true size (sub-harmonic): every phase nests inside
 *     pseudo-pixels -> contrast ~ 0
 *   * multiples / junk sizes: phase barely matters -> contrast small
 *
 *   So the contrast curve peaks at the FUNDAMENTAL, needs no edges (works on
 *   mushy, lumpy AI art where gradient profiles fail), and yields the grid
 *   phase for free. Summed-area tables make each evaluation O(number of
 *   cells).
 *
 *   The measure must use true 2D cells: full-height strips dilute the signal
 *   below noise (a strip's variance is dominated by content along the other
 *   axis). 2D summed-area tables give O(1) per-cell moments, so one grid
 *   evaluation costs O(number of cells).
 *
 * WHO CALLS WHAT (grepped in the reference, not assumed):
 *   CellVarContrast(rgba).z_channel()   core.py:148 (stage-2 build),
 *                                       fusion.py:109 (build_evidence, not
 *                                       lean), channels.py:1356 (fit_grid)
 *   z_of(step)                          core.py:248 vc_at, fusion.py:165
 *   vc.contrast(s, n_phases=12)         channels.py:1502
 *   vc.best_pair(sorted(pairs))         channels.py:1517 -> pair_q ->
 *                                       contrast_local
 *   VarContrast (axis-separable)        NO caller anywhere in the package.
 *                                       Ported for the call graph and tested
 *                                       directly; nothing downstream reads it.
 *   grid_variance, _sample_sat          no caller; ported and tested.
 *
 * RNG: this module does NOT reach k-means or any random generator.
 * varcontrast.py imports only numpy and scipy.ndimage.median_filter; nothing
 * in it draws a random number, so its output is a pure function of (rgba,
 * arguments). tools/parity-varcontrast.py MEASURES that as well as reading
 * it: in each image's process it rebuilds the scorer after core.detect /
 * fusion.detect / fit_grid (which do draw from OpenCV's global RNG) and
 * requires the rebuilt curve and candidates to be bit-identical to the ones
 * built first. The ARGUMENTS the pipeline passes in (candidate steps, pairs)
 * can depend on the RNG upstream, which is why the fixture records them from
 * one image per process and the test replays them, rather than recomputing
 * them.
 *
 * FLOAT POLICY. Everything is float64, as in the reference (rgba.astype(
 * np.float64), np.zeros() SATs, Python floats). What had to be matched
 * beyond "float64":
 *   - cumsum is sequential; the SAT is cumsum(axis=0) THEN cumsum(axis=1),
 *     in that order, for the channel sums and for the squared sums alike.
 *   - (x ** 2).sum(axis=-1) over C <= 4 channels is numpy's pairwise_sum
 *     below its 8-element block, i.e. a left-to-right sum starting from 0.0
 *     (the reduction's identity), then added to the identity again. All
 *     terms are squares (>= +0), so that is the plain sequential sum; for
 *     C >= 8 the general pairwise order is used (PF.pairwiseSum).
 *   - np.rint is round-half-to-EVEN (PF.rint). Cell corners x0 + step land
 *     on exact .5 whenever step is a half-integer and the phase is 0.
 *   - ndarray.mean / .sum of 1-D float64 are pairwise (PF.mean, PF.sum).
 *   - np.bincount(weights) is a sequential float64 loop (PF.bincount).
 *   - float64 // int and float64 % float are numpy's npy_divmod, not
 *     Math.floor(a / b) and not Python's float_rem (vc_floor_divide,
 *     vc_remainder below).
 *   - VarContrast's axis sums follow numpy's memory-order reduction model
 *     (PF.sumAxes, with the transpose passed as a perm - varcontrast.py:45
 *     transposes BEFORE summing, and that changes the summation order).
 *   - Python's builtin max/min/sort are first-wins / stable; mirrored by
 *     py_max, py_min and a stable key sort, not Math.max / Array.sort.
 *   - np.log in z_channel: V8's Math.log differs from numpy's (the UCRT) in
 *     the last bit on 5 of the 89 possible curve knots and on 3.5% of steps
 *     in [1.5, 70] (measured, 200000 samples). vc_log below is a correctly
 *     rounded double-double log; tools/test-varcontrast.cjs measures its
 *     agreement with numpy on every knot and on a random sample, and says
 *     what is left.
 *
 * Images are {d, w, h, cn}: a flat interleaved typed array (Uint8Array in
 * the pipeline, cn = 4 RGBA) plus explicit width / height. cn = 3 (RGB) is
 * accepted because the reference accepts it (the premultiply only runs when
 * the array has 4 channels); the pipeline always passes RGBA.
 *
 * Python tuples come back as JS arrays in the same order; Python None is
 * null (or undefined) on the way in.
 *
 * No imports, no build step: browser + node, ES2017. Reads PF.check,
 * PF.arange, PF.linspace, PF.rint, PF.argmax, PF.argmin, PF.argsort,
 * PF.unique, PF.bincount, PF.interp, PF.median, PF.mean, PF.sum,
 * PF.pairwiseSum, PF.sumAxes, PF.npMaximum, PF.npMinimum (pf-00-base.js)
 * and PF.median_filter (pf-02-scipy.js), all at call time.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var V = {};
  PF.varcontrast = V;

  function check(cond, msg) {
    if (!cond) throw new Error('PF.varcontrast: ' + msg);
  }

  /* Switches for the test's negative controls ONLY. Each flips one measured
   * numpy semantic to its "obvious" JS reading; tools/test-varcontrast.cjs
   * sets one to false, requires the parity to go RED, and restores it.
   * Nothing else may touch these. */
  V._semantics = {
    rintHalfEven: true,     // np.rint (half to even) vs Math.round
    correctLog: true,       // vc_log vs Math.log in z_channel
    premultiply: true       // rgb * (alpha / 255.0) before any moment
  };
  var SEM = V._semantics;

  /* ------------------------------------------------------------------ *
   * Python / numpy scalar semantics this module needs and pf-00 does not
   * carry. Prefixed vc_ because they live here, not in the shared shims.
   * ------------------------------------------------------------------ */

  /* Python builtin max(a, b) / min(a, b): the FIRST argument wins unless
   * the second compares strictly greater (less). Not Math.max: that
   * propagates NaN and orders -0 < +0, and the builtin does neither. */
  function py_max(a, b) { return (b > a) ? b : a; }
  function py_min(a, b) { return (b < a) ? b : a; }

  /* numpy npy_divmod (npy_math_internal.h.src), the kernel behind
   * np.floor_divide and np.remainder on float64. C truthiness is kept
   * literally: `if (mod)` is true for NaN, so the tests are `!== 0`. */
  function vc_divmod(a, b) {
    var mod = a % b;                       // npy_fmod: IEEE fmod, exact
    if (b === 0) return [a / b, mod];
    var div = (a - mod) / b;
    if (mod !== 0) {
      if ((b < 0) !== (mod < 0)) { mod += b; div -= 1.0; }
    } else {
      mod = (b < 0) ? -0 : 0;              // copysign(0, b)
    }
    var floordiv;
    if (div !== 0) {
      floordiv = Math.floor(div);
      if (div - floordiv > 0.5) floordiv += 1.0;
    } else {
      var q = a / b;
      floordiv = (q < 0 || Object.is(q, -0)) ? -0 : 0;   // copysign(0, a/b)
    }
    return [floordiv, mod];
  }
  function vc_floor_divide(a, b) { return vc_divmod(a, b)[0]; }
  function vc_remainder(a, b) { return vc_divmod(a, b)[1]; }
  V.vc_floor_divide = vc_floor_divide;
  V.vc_remainder = vc_remainder;

  /* np.clip(x, lo, hi) two-sided (a fused ufunc: keeps the LEFT operand on
   * a tie, a NaN bound propagates) - the same rule as pf-00's clip2, which
   * is private there. */
  function vc_clip(x, lo, hi) {
    var t = (lo !== lo) ? lo : ((x < lo) ? lo : x);
    return (hi !== hi) ? hi : ((hi < t) ? hi : t);
  }

  function vc_rint(x) {
    return SEM.rintHalfEven ? PF.rint(x) : Math.round(x);
  }

  /* Stable sort of indices by key ascending, index as the tie-break -
   * Python's list.sort(key=...) on keys that are never NaN (every sort in
   * this module filters with a strict `>` first, which drops NaN). */
  function vc_stable_order(keys) {
    var n = keys.length, idx = new Array(n), i;
    for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (i, j) {
      var a = keys[i], b = keys[j];
      if (a < b) return -1;
      if (b < a) return 1;
      return i - j;
    });
    return idx;
  }

  /* ------------------------------------------------------------------ *
   * vc_log - np.log on a float64 scalar, correctly rounded.
   *
   * numpy's float64 log is the Microsoft UCRT's (np.log == math.log on
   * 200000/200000 arguments and on all 89 curve knots, array and scalar
   * paths alike - measured in the reference venv). V8's Math.log is not the
   * UCRT; it differs in the last bit on 5 of those 89 knots. The UCRT log
   * is not open, but it is correctly rounded almost everywhere, so a
   * correctly rounded log is the closest reproducible function.
   *
   * Method: x = 2^e * m with m in [sqrt(1/2), sqrt(2)); log m =
   * 2 atanh(t), t = (m - 1) / (m + 1), |t| <= 0.1716; the series
   * sum t^(2k) / (2k+1) is run to k = 24 (t^48/49 < 2^-124) entirely in
   * double-double; e * ln2 is added with ln2 as a double-double. The result
   * carries ~104 good bits, so rounding it to 53 is correct except within
   * 2^-104 of a rounding midpoint.
   * ------------------------------------------------------------------ */
  var DD_SPLIT = 134217729;              // 2^27 + 1 (Dekker)
  function dd_two_prod(a, b, out) {
    var p = a * b;
    var t = DD_SPLIT * a, ah = t - (t - a), al = a - ah;
    t = DD_SPLIT * b;
    var bh = t - (t - b), bl = b - bh;
    out[0] = p;
    out[1] = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  }
  function dd_add(ah, al, bh, bl, out) {
    var s = ah + bh, bb = s - ah, e = (ah - (s - bb)) + (bh - bb);
    var t = al + bl, cc = t - al, f = (al - (t - cc)) + (bl - cc);
    e += t;
    var s2 = s + e; e = e - (s2 - s); s = s2;
    e += f;
    s2 = s + e; e = e - (s2 - s);
    out[0] = s2; out[1] = e;
  }
  var ddT = [0, 0];
  function dd_mul(ah, al, bh, bl, out) {
    dd_two_prod(ah, bh, ddT);
    var p = ddT[0], e = ddT[1] + (ah * bl + al * bh);
    var s = p + e;
    out[0] = s; out[1] = e - (s - p);
  }
  function dd_div(ah, al, bh, bl, out) {
    var q1 = ah / bh, r = [0, 0], t = [0, 0];
    dd_mul(q1, 0, bh, bl, t); dd_add(ah, al, -t[0], -t[1], r);
    var q2 = r[0] / bh;
    dd_mul(q2, 0, bh, bl, t); dd_add(r[0], r[1], -t[0], -t[1], r);
    var q3 = r[0] / bh;
    var s = q1 + q2, e = q2 - (s - q1);
    dd_add(s, e, q3, 0, out);
  }
  var LN2_HI = 0.6931471805599453, LN2_LO = 2.3190468138462996e-17;
  var LOG_K = 24, LOG_C = [];
  (function () {
    for (var k = 0; k <= LOG_K; k++) { var c = [0, 0]; dd_div(1, 0, 2 * k + 1, 0, c); LOG_C.push(c); }
  })();
  var f64b = new Float64Array(1), u32b = new Uint32Array(f64b.buffer);
  var LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, HI = LE ? 1 : 0;
  function vc_log(x) {
    if (!SEM.correctLog) return Math.log(x);
    if (!(x > 0) || x === Infinity) return Math.log(x);   // NaN, <=0, inf: exact specials
    var e = 0;
    if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; }   // subnormal: * 2^54
    f64b[0] = x;
    e += ((u32b[HI] >>> 20) & 0x7ff) - 1023;
    u32b[HI] = (u32b[HI] & 0x800fffff) | 0x3ff00000;   // m in [1, 2)
    var m = f64b[0];
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    var num = m - 1;                                   // exact (Sterbenz)
    var dh = m + 1, bv = dh - m;                       // two_sum(m, 1): m may be < 1,
    var dl = (m - (dh - bv)) + (1 - bv);               // so not the fast variant
    var t = [0, 0], t2 = [0, 0], S = [LOG_C[LOG_K][0], LOG_C[LOG_K][1]], r = [0, 0];
    dd_div(num, 0, dh, dl, t);
    dd_mul(t[0], t[1], t[0], t[1], t2);
    for (var k = LOG_K - 1; k >= 0; k--) {
      dd_mul(S[0], S[1], t2[0], t2[1], S);
      dd_add(S[0], S[1], LOG_C[k][0], LOG_C[k][1], S);
    }
    dd_mul(S[0], S[1], t[0], t[1], r);                  // atanh(t)
    r[0] *= 2; r[1] *= 2;                               // log m
    if (e !== 0) {
      var el = [0, 0];
      dd_two_prod(e, LN2_HI, el);
      el[1] += e * LN2_LO;
      dd_add(el[0], el[1], r[0], r[1], r);
    }
    return r[0] + r[1];
  }
  V.vc_log = vc_log;

  /* ------------------------------------------------------------------ *
   * rgba.astype(np.float64), premultiplied when there are 4 channels:
   *   a = img[:, :, 3:4] / 255.0
   *   img = np.concatenate([img[:, :, :3] * a, img[:, :, 3:4]], axis=2)
   * i.e. rgb * (A / 255.0) - the quotient first, then the product - and
   * the alpha channel itself stays A.
   * ------------------------------------------------------------------ */
  function checkImage(rgba, who) {
    check(rgba && rgba.d && rgba.w > 0 && rgba.h > 0 && rgba.cn >= 1 &&
      rgba.d.length === rgba.w * rgba.h * rgba.cn,
      who + ': rgba must be {d: typedArray(w*h*cn), w, h, cn}');
  }
  function premultiplied(rgba) {
    var n = rgba.w * rgba.h, C = rgba.cn, src = rgba.d;
    var img = new Float64Array(n * C), p, c, a, o;
    if (C === 4 && SEM.premultiply) {
      for (p = 0; p < n; p++) {
        o = p * 4;
        a = src[o + 3] / 255.0;
        img[o] = src[o] * a;
        img[o + 1] = src[o + 1] * a;
        img[o + 2] = src[o + 2] * a;
        img[o + 3] = src[o + 3];
      }
    } else {
      for (c = 0; c < n * C; c++) img[c] = src[c];
    }
    return img;
  }
  V._premultiplied = premultiplied;

  /* ================================================================== *
   * Axis-separable scorer (VarContrast). No caller in the reference.
   * ================================================================== */

  /* _axis_moments(rgba, axis) -> [S1, S2, count]
   *   "Per-scanline color moments collapsed along the other axis.
   *    S1: (L+1, C) prefix sums of per-line channel sums
   *    S2: (L+1,)   prefix sums of per-line total squared values
   *    where L is the length of `axis`."
   * S1 comes back as {d, w: C, h: L+1}; S2 as a Float64Array(L+1).
   * The sums are PF.sumAxes over the BASE (H, W, C) array with the
   * reference's transpose as a perm: for axis=1 line_sq is ONE pairwise run
   * of W*C per line, for axis=0 it is a sequential sum over rows of
   * per-pixel channel sums - different floats for the same numbers. */
  function _axis_moments(rgba, axis) {
    checkImage(rgba, '_axis_moments');
    check(axis === 0 || axis === 1, '_axis_moments: axis must be 0 or 1');
    var H = rgba.h, W = rgba.w, C = rgba.cn;
    var img = premultiplied(rgba);
    var shape = [H, W, C], perm = (axis === 1) ? [1, 0, 2] : null;
    var line_sum = PF.sumAxes(img, shape, [0], perm);          // (L, C)
    var sq = new Float64Array(img.length), i;
    for (i = 0; i < img.length; i++) sq[i] = img[i] * img[i];  // img ** 2
    var line_sq = PF.sumAxes(sq, shape, [0, 2], perm);         // (L,)
    var count = (axis === 1) ? W : H;                          // pixels per line
    var L = (axis === 1) ? H : W;
    check(line_sum.d.length === L * C && line_sq.d.length === L, '_axis_moments: shape');
    var S1 = new Float64Array((L + 1) * C), S2 = new Float64Array(L + 1), c, k;
    for (c = 0; c < C; c++) {                                  // np.cumsum(line_sum, axis=0)
      if (L > 0) S1[C + c] = line_sum.d[c];
      for (k = 1; k < L; k++) S1[(k + 1) * C + c] = S1[k * C + c] + line_sum.d[k * C + c];
    }
    if (L > 0) S2[1] = line_sq.d[0];                           // np.cumsum(line_sq)
    for (k = 1; k < L; k++) S2[k + 1] = S2[k] + line_sq.d[k];
    return [{ d: S1, w: C, h: L + 1 }, S2, count];
  }
  V._axis_moments = _axis_moments;

  /* "Mean within-strip variance (weighted by strip size) for strips
   *  bounded by fractional cut positions. Linear interpolation of the
   *  prefix sums handles fractional cuts." */
  function _strip_variance(S1, S2, count, cuts) {
    var L = S2.length - 1, C = S1.w, K1 = cuts.length, k, c;
    check(S1.h === L + 1, '_strip_variance: S1 / S2 lengths disagree');
    var idx = new Float64Array(K1), frac = new Float64Array(K1);
    var i0 = new Int32Array(K1), i0c = new Int32Array(K1);
    var s1 = new Float64Array(K1 * C), s2 = new Float64Array(K1);
    for (k = 0; k < K1; k++) {
      idx[k] = vc_clip(cuts[k], 0.0, L);
      i0[k] = Math.floor(idx[k]) | 0;                 // np.floor(idx).astype(int)
      frac[k] = idx[k] - i0[k];
      i0c[k] = Math.min(i0[k] + 1, L);                // np.minimum(i0 + 1, L), ints
      var f = frac[k], g = 1 - f;
      for (c = 0; c < C; c++) s1[k * C + c] = S1.d[i0[k] * C + c] * g + S1.d[i0c[k] * C + c] * f;
      s2[k] = S2[i0[k]] * g + S2[i0c[k]] * f;
    }
    var K = K1 - 1;
    if (K < 1) return 0.0;                            // no strips: ok.any() is False
    var vn = [], nn = [], n, d2, ms, dd, j = 0;
    for (k = 0; k < K; k++) {
      n = (idx[k + 1] - idx[k]) * count;              // widths * count
      if (!(n > 1e-9)) continue;                      // ok = n > 1e-9
      ms = 0.0;                                       // (d1 ** 2).sum(axis=1)
      if (C < 8) {
        for (c = 0; c < C; c++) { dd = s1[(k + 1) * C + c] - s1[k * C + c]; ms = ms + dd * dd; }
      } else {
        var row = new Float64Array(C);
        for (c = 0; c < C; c++) { dd = s1[(k + 1) * C + c] - s1[k * C + c]; row[c] = dd * dd; }
        ms = PF.pairwiseSum(row, 0, C, false);
      }
      ms = ms / (n * n);
      d2 = s2[k + 1] - s2[k];
      var v = d2 / n - ms;
      vn.push(v * n); nn.push(n); j++;
    }
    if (j === 0) return 0.0;
    return PF.sum(Float64Array.from(vn)) / PF.sum(Float64Array.from(nn));
  }
  V._strip_variance = _strip_variance;

  function _grid_cuts(length, step, phase) {
    var first = vc_remainder(phase, step);            // numpy float64 %: npy_divmod
    var body, cuts, i;
    if (first > 1e-9) {
      body = PF.arange(first, length, step);
      cuts = new Float64Array(body.length + 2);
      cuts[0] = 0.0;
      for (i = 0; i < body.length; i++) cuts[i + 1] = body[i];
      cuts[body.length + 1] = length;
    } else {
      body = PF.arange(0.0, length, step);
      cuts = new Float64Array(body.length + 1);
      for (i = 0; i < body.length; i++) cuts[i] = body[i];
      cuts[body.length] = length;
    }
    for (i = 0; i < cuts.length; i++) cuts[i] = vc_clip(cuts[i], 0, length);
    return PF.unique(cuts).values;
  }
  V._grid_cuts = _grid_cuts;

  /** Axis-separable variance-contrast scorer for one image. */
  function VarContrast(rgba) {
    var mx = _axis_moments(rgba, 0), my = _axis_moments(rgba, 1);
    this.S1x = mx[0]; this.S2x = mx[1]; this.cx = mx[2];
    this.S1y = my[0]; this.S2y = my[1]; this.cy = my[2];
    this.W = this.S2x.length - 1;
    this.H = this.S2y.length - 1;
    // total variance per axis for normalisation
    this.total_x = this._var_x(new Float64Array([0.0, this.W]));
    this.total_y = this._var_y(new Float64Array([0.0, this.H]));
  }
  VarContrast.prototype._var_x = function (cuts) {
    return _strip_variance(this.S1x, this.S2x, this.cx, cuts);
  };
  VarContrast.prototype._var_y = function (cuts) {
    return _strip_variance(this.S1y, this.S2y, this.cy, cuts);
  };

  /** (contrast, best_phase) at a candidate step for one axis. */
  VarContrast.prototype.contrast = function (axis, step, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 6;
    var L = (axis === 0) ? this.W : this.H;
    var total = (axis === 0) ? this.total_x : this.total_y;
    if (step < 1.5 || step > L / 3 || total <= 1e-9) return [0.0, 0.0];
    var q = step / n_phases, phases = new Float64Array(n_phases), vs = new Float64Array(n_phases), i;
    for (i = 0; i < n_phases; i++) phases[i] = i * q;
    for (i = 0; i < n_phases; i++) {
      var cuts = _grid_cuts(L, step, phases[i]);
      vs[i] = (axis === 0) ? this._var_x(cuts) : this._var_y(cuts);
    }
    var best = PF.argmin(vs);
    var mx = vs[0], mn = vs[0];                       // vs.max() / vs.min()
    for (i = 1; i < n_phases; i++) { mx = PF.npMaximum(mx, vs[i]); mn = PF.npMinimum(mn, vs[i]); }
    return [(mx - mn) / total, phases[best]];
  };

  VarContrast.prototype.curve = function (axis, steps, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 6;
    var out = new Float64Array(steps.length), i;
    for (i = 0; i < steps.length; i++) out[i] = this.contrast(axis, steps[i], n_phases)[0];
    return out;
  };

  /** Parabolic-ish local refinement -> (step, contrast, phase). */
  VarContrast.prototype.refine = function (axis, step, span, n_phases) {
    if (span === undefined || span === null) span = 0.6;
    if (n_phases === undefined || n_phases === null) n_phases = 8;
    var candidates = PF.linspace(py_max(1.6, step - span), step + span, 13);
    var cs = this.curve(axis, candidates, n_phases);
    var i = PF.argmax(cs);
    // second, finer pass
    var lo = candidates[Math.max(0, i - 1)];
    var hi = candidates[Math.min(candidates.length - 1, i + 1)];
    var fine = PF.linspace(lo, hi, 9);
    var cf = this.curve(axis, fine, n_phases);
    var j = PF.argmax(cf);
    var r = this.contrast(axis, fine[j], 12);
    return [fine[j], r[0], r[1]];
  };

  /** Scan the contrast curve, return refined (step, contrast, phase) for
   *  its local maxima. */
  VarContrast.prototype.candidates = function (axis, min_step, max_step, top) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    if (top === undefined || top === null) top = 5;
    var L = (axis === 0) ? this.W : this.H;
    if (max_step === undefined || max_step === null) max_step = py_min(py_max(4.0, L / 8.0), 64.0);
    var list = [], s = min_step, i;
    while (s <= max_step) { list.push(s); s *= 1.04; }
    var steps = Float64Array.from(list);
    var cs = this.curve(axis, steps, 5);
    // local maxima of the coarse curve
    var cand_idx = [], n = steps.length;
    for (i = 0; i < n; i++) {
      if (cs[i] > 0.01 &&
          cs[i] >= (i > 0 ? cs[i - 1] : -1) &&
          cs[i] >= (i < n - 1 ? cs[i + 1] : -1)) cand_idx.push(i);
    }
    var ord = vc_stable_order(cand_idx.map(function (k) { return -cs[k]; }));
    cand_idx = ord.map(function (k) { return cand_idx[k]; });
    var out = [], seen = [], lim = Math.min(cand_idx.length, top * 2), k, s0;
    for (k = 0; k < lim; k++) {
      s0 = steps[cand_idx[k]];
      if (seen.some(function (s1) { return Math.abs(s0 - s1) / s1 < 0.08; })) continue;
      seen.push(s0);
      out.push(this.refine(axis, s0));
      if (out.length >= top) break;
    }
    var o2 = vc_stable_order(out.map(function (r) { return -r[1]; }));
    return o2.map(function (k) { return out[k]; });
  };
  V.VarContrast = VarContrast;

  /* ================================================================== *
   * 2D cells (CellVarContrast) - the one the pipeline uses.
   * ================================================================== */

  /* Reference class docstring, verbatim:
   *
   * 2D within-cell variance contrast scorer (local-phase, activity-aware).
   *
   * Two properties make this work on real AI sheets:
   * * activity weighting - only cells covering "active" image regions vote,
   *   so flat backgrounds cannot dilute the signal;
   * * local phase - active cells are grouped into coarse tiles and each tile
   *   picks its own best/worst grid phase (same step), so sprite sheets and
   *   warped grids, whose pseudo-pixel phase drifts between regions, still
   *   produce a sharp contrast at the true cell size.
   *
   * contrast(s) = (worst - best) / (best + 0.05 * total) where best/worst are
   * activity-weighted means of per-tile extreme within-cell variances. The
   * flatness normalisation suppresses content-scale periodicity (big cells
   * are never flat inside).
   *
   * STORAGE. The reference keeps S1 (h+1, w+1, C), S2 (h+1, w+1) and their
   * concatenation SC (h+1, w+1, C+1), whose values are copies of the first
   * two. Only SC is stored here (one 1449x1087x5 float64 table is 63 MB);
   * this.S1 / this.S2 are VIEWS into it ({d, off, st, nch, W1}), so every
   * value read is the same float the reference reads. The SAT is built
   * directly in SC's layout with the reference's order of operations:
   * per-pixel values, cumsum over y, then cumsum over x.
   */
  function CellVarContrast(rgba, max_points, tile_px) {
    checkImage(rgba, 'CellVarContrast');
    if (max_points === undefined || max_points === null) max_points = 2600;
    if (tile_px === undefined || tile_px === null) tile_px = 112;
    var h = rgba.h, w = rgba.w, C = rgba.cn, src = rgba.d;
    this.H = h; this.W = w;
    var W1 = w + 1, C1 = C + 1;
    var SC = new Float64Array((h + 1) * W1 * C1);
    var pre = (C === 4 && SEM.premultiply);
    var v = new Float64Array(C), x, y, c, o, a, dst, prev, s;
    // img, sq = (img ** 2).sum(axis=2), then .cumsum(axis=0)
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        o = (y * w + x) * C;
        if (pre) {
          a = src[o + 3] / 255.0;
          v[0] = src[o] * a; v[1] = src[o + 1] * a; v[2] = src[o + 2] * a; v[3] = src[o + 3];
        } else {
          for (c = 0; c < C; c++) v[c] = src[o + c];
        }
        if (C < 8) {
          s = 0.0;
          for (c = 0; c < C; c++) s = s + v[c] * v[c];
        } else {
          var sqv = new Float64Array(C);
          for (c = 0; c < C; c++) sqv[c] = v[c] * v[c];
          s = PF.pairwiseSum(sqv, 0, C, false);
        }
        s = 0.0 + s;                                   // the reduction's identity
        dst = ((y + 1) * W1 + (x + 1)) * C1;
        if (y === 0) {
          for (c = 0; c < C; c++) SC[dst + c] = v[c];
          SC[dst + C] = s;
        } else {
          prev = (y * W1 + (x + 1)) * C1;
          for (c = 0; c < C; c++) SC[dst + c] = SC[prev + c] + v[c];
          SC[dst + C] = SC[prev + C] + s;
        }
      }
    }
    // .cumsum(axis=1) of the y-cumsum, every channel and the squared sum
    for (y = 1; y <= h; y++) {
      for (x = 2; x <= w; x++) {
        dst = (y * W1 + x) * C1; prev = dst - C1;
        for (c = 0; c <= C; c++) SC[dst + c] = SC[prev + c] + SC[dst + c];
      }
    }
    this.SC = SC;
    this.SCflat = SC;          // SC.reshape(-1, C + 1): the same memory
    this.C = C;
    this.S1 = { d: SC, off: 0, st: C1, nch: C, W1: W1 };
    this.S2 = { d: SC, off: C, st: C1, nch: 1, W1: W1 };

    var n = h * w;
    var last = (h * W1 + w) * C1;
    var tm2 = new Float64Array(C);
    for (c = 0; c < C; c++) { var tmean = SC[last + c] / n; tm2[c] = tmean * tmean; }
    this.total_var = SC[last + C] / n - PF.sum(tm2);

    // --- activity map: variance of 8x8 blocks
    var bs = 8;
    var by = PF.arange(0, h - bs + 1, bs);
    var bx = PF.arange(0, w - bs + 1, bs);
    if (by.length === 0 || bx.length === 0) {
      by = new Float64Array([0]); bx = new Float64Array([0]); bs = Math.min(h, w);
    }
    var s1 = CellVarContrast._rect_sum(this.S1, by, bx, bs);
    var s2 = CellVarContrast._rect_sum(this.S2, by, bx, bs);
    var area = bs * bs;
    var nby = by.length, nbx = bx.length, nb = nby * nbx, i, t;
    var bvar = new Float64Array(nb);
    for (i = 0; i < nb; i++) {
      s = 0.0;                                         // ((s1 / area) ** 2).sum(axis=-1)
      if (C < 8) {
        for (c = 0; c < C; c++) { t = s1.d[i * C + c] / area; s = s + t * t; }
      } else {
        var rw = new Float64Array(C);
        for (c = 0; c < C; c++) { t = s1.d[i * C + c] / area; rw[c] = t * t; }
        s = PF.pairwiseSum(rw, 0, C, false);
      }
      bvar[i] = s2.d[i] / area - (0.0 + s);
    }
    this._bvar = bvar;         // not kept by the reference; exposed for the test
    var thresh = py_max(1e-6, 0.02 * this.total_var);
    var sel = [];
    for (i = 0; i < nb; i++) if (bvar[i] > thresh) sel.push(i);
    if (sel.length < 8) {      // fallback: everything is active
      sel = [];
      for (i = 0; i < nb; i++) if (bvar[i] >= 0) sel.push(i);
    }
    var half = bs / 2.0, N = sel.length;
    var px = new Float64Array(N), py = new Float64Array(N);
    for (i = 0; i < N; i++) {
      px[i] = bx[sel[i] % nbx] + half;
      py[i] = by[(sel[i] / nbx) | 0] + half;
    }
    if (N > max_points) {
      var lsp = PF.linspace(0, N - 1, max_points), keys = new Float64Array(max_points);
      var ii = new Int32Array(max_points);
      for (i = 0; i < max_points; i++) { ii[i] = lsp[i] | 0; keys[i] = py[ii[i]] * w + px[ii[i]]; }
      // keys are unique by construction (distinct blocks), so numpy's
      // unstable default argsort and this stable one agree
      var order = PF.argsort(keys);
      var npx = new Float64Array(max_points), npy = new Float64Array(max_points);
      for (i = 0; i < max_points; i++) { npx[i] = px[ii[order[i]]]; npy[i] = py[ii[order[i]]]; }
      px = npx; py = npy;
    }
    this.px = px; this.py = py;

    // tile grouping for local phase
    var tid = new Float64Array(px.length);
    for (i = 0; i < px.length; i++) {
      tid[i] = Math.trunc(vc_floor_divide(py[i], tile_px)) * 64 + Math.trunc(vc_floor_divide(px[i], tile_px));
    }
    var u = PF.unique(tid, { inverse: true });
    this.tile_id = u.inverse;
    var mxid = -1;
    for (i = 0; i < this.tile_id.length; i++) if (this.tile_id[i] > mxid) mxid = this.tile_id[i];
    check(this.tile_id.length > 0, 'CellVarContrast: no active points (the reference raises on .max() of an empty array too)');
    this.n_tiles = mxid + 1;
    // activity-region variance for normalisation: mean block var of
    // active blocks
    var act = [];
    for (i = 0; i < nb; i++) if (bvar[i] > thresh) act.push(bvar[i]);
    this.active_var = act.length ? PF.mean(Float64Array.from(act)) : this.total_var;
  }

  /** Block sums of `size` starting at integer offsets ys, xs.
   *  S is a SAT view ({d, off, st, nch, W1}); returns {d, shape} with shape
   *  (len(ys), len(xs), nch) or (len(ys), len(xs)) for a 1-channel view. */
  CellVarContrast._rect_sum = function (S, ys, xs, size) {
    var ny = ys.length, nx = xs.length, nch = S.nch, W1 = S.W1, st = S.st, off = S.off;
    var out = new Float64Array(ny * nx * nch), i, j, c, y0, y1, x0, x1, pa, pb, pc, pd;
    for (i = 0; i < ny; i++) {
      y0 = ys[i]; y1 = ys[i] + size;
      for (j = 0; j < nx; j++) {
        x0 = xs[j]; x1 = xs[j] + size;
        pa = (y0 * W1 + x0) * st + off; pb = (y0 * W1 + x1) * st + off;
        pc = (y1 * W1 + x0) * st + off; pd = (y1 * W1 + x1) * st + off;
        for (c = 0; c < nch; c++) {
          out[(i * nx + j) * nch + c] = ((S.d[pd + c] - S.d[pb + c]) - S.d[pc + c]) + S.d[pa + c];
        }
      }
    }
    return { d: out, shape: nch === 1 ? [ny, nx] : [ny, nx, nch] };
  };

  /** Bilinear SAT sample at fractional (pos_y, pos_x) 1D arrays.
   *  No caller in the reference ("~6x" slower than the integer-corner path
   *  _cells_variance uses); ported for the call graph. */
  CellVarContrast.prototype._sample_sat = function (S, pos_y, pos_x) {
    var n = pos_y.length, nch = S.nch, W1 = S.W1, st = S.st, off = S.off;
    var out = new Float64Array(n * nch), k, c, iy, fy, iy1, ix, fx, ix1;
    for (k = 0; k < n; k++) {
      iy = vc_clip(Math.floor(pos_y[k]), 0, this.H);
      fy = vc_clip(pos_y[k] - iy, 0, 1);
      iy1 = Math.min(iy + 1, this.H);
      ix = vc_clip(Math.floor(pos_x[k]), 0, this.W);
      fx = vc_clip(pos_x[k] - ix, 0, 1);
      ix1 = Math.min(ix + 1, this.W);
      for (c = 0; c < nch; c++) {
        var v00 = S.d[(iy * W1 + ix) * st + off + c], v01 = S.d[(iy * W1 + ix1) * st + off + c];
        var v10 = S.d[(iy1 * W1 + ix) * st + off + c], v11 = S.d[(iy1 * W1 + ix1) * st + off + c];
        out[k * nch + c] = v00 * (1 - fy) * (1 - fx) + v01 * (1 - fy) * fx +
                           v10 * fy * (1 - fx) + v11 * fy * fx;
      }
    }
    return out;
  };

  /* Within-cell variance of the cell covering each active point.
   *
   * "Cell corners are snapped to integers so each corner needs a single
   *  fused-SAT gather (4 gathers per cell total) - ~6x faster than the
   *  bilinear path with negligible effect on the score curves." */
  CellVarContrast.prototype._cells_variance = function (step_x, step_y, phase_x, phase_y) {
    var px = this.px, py = this.py, N = px.length, W = this.W, H = this.H;
    var W1 = W + 1, C = this.C, C1 = C + 1, f = this.SCflat;
    var out = new Float64Array(N), k, c, x0, y0, ix0, iy0, ix1, iy1, pa, pb, pc, pd, area, s, t, m;
    var rw = (C >= 8) ? new Float64Array(C) : null;
    for (k = 0; k < N; k++) {
      x0 = phase_x + Math.floor((px[k] - phase_x) / step_x) * step_x;
      y0 = phase_y + Math.floor((py[k] - phase_y) / step_y) * step_y;
      ix0 = Math.trunc(vc_clip(vc_rint(x0), 0, W - 1));
      iy0 = Math.trunc(vc_clip(vc_rint(y0), 0, H - 1));
      ix1 = Math.trunc(vc_clip(vc_rint(x0 + step_x), ix0 + 1, W));
      iy1 = Math.trunc(vc_clip(vc_rint(y0 + step_y), iy0 + 1, H));
      pa = (iy1 * W1 + ix1) * C1; pb = (iy1 * W1 + ix0) * C1;
      pc = (iy0 * W1 + ix1) * C1; pd = (iy0 * W1 + ix0) * C1;
      area = (ix1 - ix0) * (iy1 - iy0);
      s = 0.0;                                        // ((s1 / area[:, None]) ** 2).sum(axis=1)
      for (c = 0; c < C; c++) {
        m = ((f[pa + c] - f[pb + c]) - f[pc + c]) + f[pd + c];
        t = m / area;
        if (rw) rw[c] = t * t; else s = s + t * t;
      }
      if (rw) s = PF.pairwiseSum(rw, 0, C, false);
      m = ((f[pa + C] - f[pb + C]) - f[pc + C]) + f[pd + C];
      out[k] = PF.npMaximum(m / area - (0.0 + s), 0.0);
    }
    return out;
  };

  function stepsInvalid(self, step_x, step_y) {
    return (step_x < 1.5 || step_y < 1.5 || step_x > self.W / 3 ||
            step_y > self.H / 3 || self.total_var <= 1e-9 || self.px.length === 0);
  }

  /** (contrast, best_phase_x, best_phase_y) with per-tile local phase.
   *
   *  "Phases are searched per tile; the returned best phase is the global
   *   activity-weighted winner (used only as a hint downstream). Used for
   *   pair arbitration among vetted candidates - per-tile phase freedom
   *   overfits small steps, so this must not drive the open scan." */
  CellVarContrast.prototype.contrast_local = function (step_x, step_y, n_phases) {
    if (step_y === undefined || step_y === null) step_y = step_x;
    if (n_phases === undefined || n_phases === null) n_phases = 3;
    if (stepsInvalid(this, step_x, step_y)) return [0.0, 0.0, 0.0];
    var qx = step_x / n_phases, qy = step_y / n_phases;
    var nt = this.n_tiles, i;
    var cnt = PF.bincount(this.tile_id, null, nt);
    var counts = new Float64Array(nt);
    for (i = 0; i < nt; i++) counts[i] = PF.npMaximum(cnt[i], 1);
    var tile_best = new Float64Array(nt).fill(Infinity);
    var tile_worst = new Float64Array(nt).fill(-Infinity);
    var gbest = Infinity, gphx = 0.0, gphy = 0.0, a, b, px_, py_;
    for (a = 0; a < n_phases; a++) {
      py_ = a * qy;
      for (b = 0; b < n_phases; b++) {
        px_ = b * qx;
        var v = this._cells_variance(step_x, step_y, px_, py_);
        var tv = PF.bincount(this.tile_id, v, nt);
        for (i = 0; i < nt; i++) {
          tv[i] = tv[i] / counts[i];
          tile_best[i] = PF.npMinimum(tile_best[i], tv[i]);
          tile_worst[i] = PF.npMaximum(tile_worst[i], tv[i]);
        }
        var g = PF.mean(tv);
        if (g < gbest) { gbest = g; gphx = px_; gphy = py_; }
      }
    }
    var csum = PF.sum(counts), wb = new Float64Array(nt), ww = new Float64Array(nt);
    for (i = 0; i < nt; i++) { var wi = counts[i] / csum; wb[i] = tile_best[i] * wi; ww[i] = tile_worst[i] * wi; }
    var best = PF.sum(wb), worst = PF.sum(ww);
    var q = (worst - best) / (best + 0.05 * this.active_var);
    return [q, gphx, gphy];
  };

  /** (contrast, best_phase_x, best_phase_y) with a single global phase -
   *  the stable form used for the candidate scan. */
  CellVarContrast.prototype.contrast = function (step_x, step_y, n_phases) {
    if (step_y === undefined || step_y === null) step_y = step_x;
    if (n_phases === undefined || n_phases === null) n_phases = 3;
    if (stepsInvalid(this, step_x, step_y)) return [0.0, 0.0, 0.0];
    var qx = step_x / n_phases, qy = step_y / n_phases;
    var best = Infinity, worst = -Infinity, bx = 0.0, by = 0.0, a, b, px_, py_, v;
    for (a = 0; a < n_phases; a++) {
      py_ = a * qy;
      for (b = 0; b < n_phases; b++) {
        px_ = b * qx;
        v = PF.mean(this._cells_variance(step_x, step_y, px_, py_));
        if (v < best) { best = v; bx = px_; by = py_; }
        if (v > worst) worst = v;
      }
    }
    var q = (worst - best) / (best + 0.05 * this.active_var);
    return [q, bx, by];
  };

  /** Mean within-cell variance over active cells (single phase). */
  CellVarContrast.prototype.grid_variance = function (step_x, step_y, phase_x, phase_y) {
    return PF.mean(this._cells_variance(step_x, step_y, phase_x, phase_y));
  };

  /** Null-corrected local-phase contrast for an (x, y) pair.
   *
   *  "Per-tile phase freedom inflates q for any step (overfit bias), but
   *   only a true lattice loses its q when the step is pushed ~19% off.
   *   Subtracting the off-lattice q cancels the overfit bias." */
  CellVarContrast.prototype.pair_q = function (step_x, step_y, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var q = this.contrast_local(step_x, step_y, n_phases)[0];
    var null1 = this.contrast_local(step_x * 1.19, step_y * 1.19, n_phases)[0];
    var null2 = this.contrast_local(step_x * 0.84, step_y * 0.84, n_phases)[0];
    return q - py_max(py_max(null1, null2), 0.0);      // builtin max(null1, null2, 0.0)
  };

  /** Evaluate candidate (step_x, step_y) pairs, return them scored,
   *  best first (a stable sort: equal scores keep the input order). */
  CellVarContrast.prototype.best_pair = function (pairs, n_phases) {
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var out = [], i;
    for (i = 0; i < pairs.length; i++) {
      var sx = pairs[i][0], sy = pairs[i][1];
      out.push([sx, sy, this.pair_q(sx, sy, n_phases)]);
    }
    var ord = vc_stable_order(out.map(function (r) { return -r[2]; }));
    return ord.map(function (k) { return out[k]; });
  };

  /** Detrended-prominence z curve over square cell sizes -> [steps, z, cs]. */
  CellVarContrast.prototype.scored_curve = function (min_step, max_step) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    var L = Math.min(this.W, this.H);
    if (max_step === undefined || max_step === null) max_step = py_min(py_max(4.0, L / 8.0), 64.0);
    var list = [], s = min_step, i;
    while (s <= max_step) { list.push(s); s *= 1.04; }
    var steps = Float64Array.from(list), n = steps.length;
    var cs = new Float64Array(n);
    for (i = 0; i < n; i++) cs[i] = this.contrast(steps[i], null, 3)[0];
    var base = PF.median_filter(cs, 15, { mode: 'nearest' });
    var resid = new Float64Array(n), ar = new Float64Array(n);
    for (i = 0; i < n; i++) { resid[i] = cs[i] - base[i]; ar[i] = Math.abs(resid[i]); }
    // np.median of an empty array is nan (with a warning), not an error
    var sigma = (n ? PF.median(ar) : NaN) * 1.4826 + 1e-9;
    var z = new Float64Array(n);
    for (i = 0; i < n; i++) z[i] = resid[i] / sigma;
    return [steps, z, cs];
  };

  /** Local refinement of a square-cell candidate -> (step, contrast). */
  CellVarContrast.prototype.refine = function (step, span_ratio, n_phases) {
    if (span_ratio === undefined || span_ratio === null) span_ratio = 0.1;
    if (n_phases === undefined || n_phases === null) n_phases = 4;
    var span = py_max(0.4, step * span_ratio);
    var coarse = PF.linspace(py_max(1.6, step - span), step + span, 9);
    var cs = new Float64Array(coarse.length), k;
    for (k = 0; k < coarse.length; k++) cs[k] = this.contrast(coarse[k], null, n_phases)[0];
    var i = PF.argmax(cs);
    var lo = coarse[Math.max(0, i - 1)];
    var hi = coarse[Math.min(coarse.length - 1, i + 1)];
    var fine = PF.linspace(lo, hi, 7);
    var cf = new Float64Array(fine.length);
    for (k = 0; k < fine.length; k++) cf[k] = this.contrast(fine[k], null, n_phases)[0];
    var j = PF.argmax(cf);
    return [fine[j], cf[j]];
  };

  /** (z_of_step callable, [(step, z)] candidates from curve maxima). */
  CellVarContrast.prototype.z_channel = function (min_step, max_step) {
    var sc = this.scored_curve(min_step, max_step);
    var steps = sc[0], z = sc[1], n = steps.length, i;
    var logs = new Float64Array(n);
    for (i = 0; i < n; i++) logs[i] = vc_log(steps[i]);

    function z_of(step) {
      if (step < steps[0] || step > steps[n - 1]) return 0.0;
      return PF.interp(vc_log(step), logs, z);
    }

    var idx = [];
    for (i = 0; i < n; i++) {
      if (z[i] > 2.0 &&
          z[i] >= (i > 0 ? z[i - 1] : -1e9) &&
          z[i] >= (i < n - 1 ? z[i + 1] : -1e9)) idx.push(i);
    }
    var ord = vc_stable_order(idx.map(function (k) { return -z[k]; }));
    idx = ord.map(function (k) { return idx[k]; });
    var cands = [], seen = [], lim = Math.min(idx.length, 8), k, s0;
    for (k = 0; k < lim; k++) {
      i = idx[k];
      s0 = steps[i];
      if (seen.some(function (s1) { return Math.abs(s0 - s1) / s1 < 0.06; })) continue;
      seen.push(s0);
      var r = this.refine(s0);
      cands.push([r[0], z[i]]);
    }
    return [z_of, cands];
  };
  V.CellVarContrast = CellVarContrast;

  PF.versionVarcontrast = 'pf-23-varcontrast/1';
})();

/* ==== pf-24-fusion.js ============================================= */
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

/* ==== pf-30-channels-a.js ========================================= */
/* pf-30-channels-a.js -- port of pixelfixer/channels.py, FIRST HALF:
 * reference lines 1-825 (the module docstring down to the end of
 * _evidence_refine_step). The second half (_chain_energy_z at line 829
 * onwards: estimate_period_ev, estimate_axis_ev, _exclusive_slot_occupancy,
 * estimate_axis, lattice_dp, _axis_chain, chain_to_cuts, band_profiles,
 * refine_positions_per_band, GridFit, _rasterise_cuts,
 * _index_map_from_cuts, _knot_cuts_per_band, fit_grid,
 * render_grid_overlay) lives in pf-31-channels-b.js.
 *
 * The reference's module docstring, kept because it says what every piece
 * below is for:
 *
 *   Flexible pixel-grid detection.
 *
 *   Fits a (possibly warped, non-uniform, non-square) grid to an image that
 *   is supposed to be pixel art rendered at a larger-than-native resolution.
 *
 *   1. Two edge signals per axis:
 *        E1 (edge profile)      - sum of |first difference|. Sharp (nearest
 *                                 neighbour) upscales put peaks exactly on
 *                                 the cut lines between pseudo-pixels.
 *        E2 (curvature profile) - sum of |second difference|. Smooth
 *                                 (bilinear / bicubic) upscales have *no* E1
 *                                 peaks (the ramp spreads gradient evenly
 *                                 across a cell) but the piecewise-linear
 *                                 knots at cell centres put sharp peaks in E2.
 *      Each axis independently picks whichever signal is more periodic and
 *      remembers whether it locates cuts ("cut" mode) or centres ("knot").
 *   2. Comb scoring with bias-corrected z-scores: for every candidate cell
 *      size we lay a regular comb over the profile (best phase wins) and
 *      measure how many standard errors its mean energy sits above chance,
 *      minus the inflation expected from trying many phases. This makes
 *      small and large steps statistically comparable and gives a
 *      scale-free confidence value. Profiles are max-pooled proportionally
 *      to the candidate step so wobbly (jittered) grids still register.
 *   3. Cut placement by an elastic-chain dynamic program (second half).
 *   4. Warp refinement (second half).
 *
 * WHO CALLS WHAT (read, not assumed):
 *   core.detect(mode="full") -> fusion.build_evidence(rgba, lean=True) uses
 *     axis_profiles, _jpeg_lattice_strength, _notch_jpeg, _grad_maps,
 *     _tile_peaks, _axis_spectrum, _spectral_background; its channel_matrix
 *     with ACTIVE_CHANNELS then calls _rayleigh_score (ray_e1),
 *     _tiles_ray_z (tile_e1, tile_e2) and _spectral_z (spec_e1).
 *   fusion (non-lean, and fusion.detect) also uses _PooledProfile,
 *     _comb_score, _lattice_refine, is_jpeg_suspect, is_jpeg_lattice.
 *   channels.fit_grid (second half; not called by core or api) uses
 *     _AxisEvidence and everything it reaches.
 *   estimate_period / _refine_step / _spacing_candidates are reached only
 *     through estimate_axis, which nothing in the reference calls; ported
 *     because they are in this half and pf-31 may port estimate_axis.
 *
 * DOES THIS MODULE REACH KMEANS? NO. Nothing here calls cv2.kmeans or
 * PF.kmeans. The `quantized` argument of _grad_maps / axis_profiles is made
 * by the CALLER (fusion.build_evidence and fit_grid call kmeans_quantize);
 * this module only consumes it. So its results depend on OpenCV's
 * process-global RNG only through that argument.
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES - each one MEASURED against numpy 2.5.3 / scipy 1.18.1 /
 * python 3.12.10 in the reference venv (tools/parity-channels-a.py +
 * tools/test-channels-a.cjs), not inferred:
 *
 *  dtypes. _flatten_channels is float32 (rgba.astype(np.float32); alpha
 *  premultiply a/255.0 and v*a are float32 ops under NEP 50), and so is
 *  every gradient/curvature map built from it: (a-b)**2 summed over the
 *  channel axis left to right from 0, np.sqrt in float32. The PROFILES are
 *  float64 only because axis_profiles assigns those float32 sums into
 *  np.zeros(...) arrays. _tile_peaks' prof and _axis_spectrum's prof stay
 *  float32 (np.percentile / .mean() in float32); seg = prof * np.hanning()
 *  is float64.
 *
 *  Reduction ORDER follows memory layout (PF.sumAxes' model): dx.sum(axis=0)
 *  on a C array is a SEQUENTIAL row accumulation, dy.sum(axis=1) is
 *  numpy's PAIRWISE sum per row; in _tile_peaks / _axis_spectrum the
 *  axis=1 case sums a TRANSPOSED view, so there the reduced axis is the
 *  contiguous one and the sum is pairwise.
 *
 *  Python round(x, 4) depends on the TYPE of x. On a Python float it is
 *  CPython's correctly rounded decimal round (PF.pyRound); on an np.float64
 *  it is numpy's rint(x * 1e4) / 1e4. They differ on 6603 of 180000
 *  measured values - and systematically on step/2 of a 4-decimal step,
 *  which is exactly what estimate_period's divisor loop feeds back in. The
 *  reference hands _refine_step both kinds (np.float64 from steps[idx],
 *  Python floats from _spacing_candidates, step/div inheriting its
 *  numerator's type), so the step's type travels with it here as an
 *  explicit `isNp` flag: _refine_step and _evidence_refine_step take it as
 *  a last argument and return it as element [3] of the tuple.
 *
 *  Python set iteration order. `{round(step, 4), round(refined, 4)}` is
 *  iterated and the FIRST strictly-best score wins, so on a score tie the
 *  set's hash-table order picks the step. pySetIter reproduces CPython
 *  3.12's float hash (_Py_HashDouble) and set_add_entry probing for the
 *  8-slot table a small set lives in.
 *
 *  np.log(len(phases)) in _comb_score's multiple-phase penalty: numpy calls
 *  the UCRT log, which differs from Math.log on k = 3, 48, 74, 185, 196, 299
 *  of 2..300 (11 of 2..512: also 308, 334, 343, 346, 362 - re-measured by
 *  the verifier, which found the earlier "5 of 2..300" list missed 299).
 *  The comb's phase count is ceil(step/0.25), so the reference's
 *  own values for k = 2..512 (steps up to 128 px) are baked below.
 *
 *  Transcendentals that cannot be exact: np.exp of an imaginary array
 *  (UCRT cos/sin), np.angle (UCRT atan2), np.log10 (UCRT log10) and the
 *  numpy scalar h.sum() ** 2 (UCRT pow, which differs from x*x on 100 of
 *  200000 measured values). They all go through C._libm, whose default is
 *  Math.*; tools/test-channels-a.cjs swaps in numpy's own outputs for the
 *  exact arguments this code asks for, and with that swap every channel
 *  value is bit-exact - so the remaining difference is the C runtime's
 *  last bit, measured and printed by that test, not the port's logic.
 *  np.hanning (Math.cos in PF.hanning) and np.fft.rfft (PF.rfft,
 *  radix-2/Bluestein vs pocketfft) make _axis_spectrum approximate for the
 *  same kind of reason; see the test's printed bound.
 *
 *  theta = imag(2j*np.pi*p/step) is (2*pi*p) * (1/step): numpy divides a
 *  complex array by a real with a reciprocal multiply (pf-06-linalg.js,
 *  PF.complexDivReal). h * ph is the full complex product h*c - 0*s,
 *  h*s + 0*c, and the sums/abs are PF.complexSum / PF.cabs.
 *
 *  Python float % float and numpy float64 % are floor-mod (sign of the
 *  divisor): pyMod, never JS %.
 *
 *  np.argsort(-x) at estimate_period / _spectral_candidates /
 *  sweep_candidates is numpy's DEFAULT kind, which on the reference machine
 *  runs x86-simd-sort's AVX2 argsort (pf-02-scipy.js argsortNumpy, measured
 *  there permutation-for-permutation); the test compares it with numpy's
 *  permutation at every one of these call sites.
 *
 * ---------------------------------------------------------------------------
 * MEASURED PARITY (tools/test-channels-a.cjs, 2026-09-27; the test is the
 * authority, this is a copy of its run so a reader sees its shape). Inputs
 * come from the reference's own call paths on tiny/small/mid + the four
 * examples (one process per image) plus a synthetic set:
 *   - no transcendental involved (profiles, maps, tiles, normalise, notch,
 *     jpeg z, pooled profiles, comb scores, lattice fits, refine, argsort
 *     permutations, hash / set order / round): BIT-EXACT, 3853 comparisons
 *     over 406492 values.
 *   - transcendental-dependent (Rayleigh, tile, spectral channels, the
 *     channel matrix core.detect reads, _AxisEvidence.score / _ray_quick /
 *     candidate lists, _evidence_refine_step on fit_grid's own calls,
 *     estimate_period, _refine_step): BIT-EXACT, 699 comparisons over 31312
 *     values, once numpy's own cos/sin/atan2/log10/pow outputs are
 *     injected; with the production Math.* the same values differ by at
 *     most 83 ulp (max |diff| 1.4e-14), and every candidate list is
 *     identical.
 *   - the full JS chain from rgba + quantized (PF.rfft and PF.hanning in
 *     the spectrum): power spectra within 4.3e-15 relative, channel values
 *     within 3.6e-15 absolute, and core's fused "fu" step identical on 7/7.
 *   - negative controls: every switch in C._semantics goes red somewhere;
 *     npRoundOnNpScalars only on the synthetic set. The set order is not
 *     academic: of the 422 _evidence_refine_step calls fit_grid makes on
 *     the 7 images, 41 have the two set members scoring EXACTLY alike - all
 *     41 via _spectral_z, which is piecewise constant in the step (nearest
 *     bin) - and in 21 of them the hash order visits the refined step first.
 *
 * ---------------------------------------------------------------------------
 * API - PF.channels.<name>, the reference's names (shared with
 * pf-31-channels-b.js, which adds the second half to the same object):
 *
 *   _flatten_channels(rgba) -> {d: Float32Array, w, h, cn}
 *   axis_profiles(rgba) -> {e1x, e1y, e2x, e2y} (Float64Array)
 *   _normalise(profile) -> Float64Array
 *   _PooledProfile (class): new _PooledProfile(profile); .variants[p] =
 *       [v, mean, std] for p in POOLS; .for_step(step) -> [[v, mean, std]...]
 *   _comb_score(pp, step, phase_res=0.25) -> [score, phase]
 *   _lattice_refine_peaks(peaks, h, s0, n_iters=4) -> number
 *   _lattice_refine(profile, s0, n_iters=4) -> number
 *   _rayleigh_score(profile, step) -> [z, phase]
 *   _refine_step(pp, profile, step, stepIsNp) -> [step, score, phase, isNp]
 *   _spacing_candidates(profile, min_step, max_step) -> number[]
 *   estimate_period(profile, min_step=2, max_step=null, harmonic_tol=0.88)
 *       -> [step|null, score, phase, stepIsNp]
 *   is_jpeg_suspect(step) -> bool;  is_jpeg_lattice(step, phase) -> bool
 *   _jpeg_lattice_strength(profile) -> number
 *   _notch_jpeg(profile, width=1.0) -> Float64Array (the SAME object when
 *       nothing is notched, like the reference)
 *   _grad_maps(rgba, quantized) -> {dqx, dqy, cox, coy}, each
 *       {d: Float32Array, w, h}
 *   _tile_peaks(dmap, axis, offset=1, max_tiles=360)
 *       -> [[positions Float64Array, heights Float64Array, extent], ...]
 *   _tiles_ray_z(tiles, step) -> number
 *   _tile_spacing_modes(tiles, min_step, max_step, top=3) -> number[]
 *   _axis_spectrum(dmaps, axis, row_group=4, max_win=1024) -> [freqs, power]
 *   _spectral_background(power) -> Float64Array
 *   _spectral_z(freqs, power, bg, step) -> number
 *   _spectral_candidates(freqs, power, bg, min_step, max_step, top=4)
 *   _AxisEvidence (class): new _AxisEvidence(profile, bands, tiles,
 *       spectrum, extra_z, extra_candidates); bands is null, a {d, w, h}
 *       matrix (row b = band b, as band_profiles returns) or an array of
 *       Float64Array rows; spectrum is [freqs, power] or null. Methods
 *       score(step) -> [score, phase], candidate_steps(min, max),
 *       _ray_quick(step), sweep_candidates(min, max, top=6), refine(step).
 *       Every candidate_steps() entry is a Python float in the reference.
 *   _evidence_refine_step(ev, step, stepIsNp) -> [step, score, phase, isNp]
 *   Helpers for pf-31 and the tests: pyMod, pyMax, pyMin, round4(x, isNp),
 *   pySetIter, pyHashBits, npLogInt, argsortNeg, _libm, _LIBM_MATH,
 *   _semantics, _latticeRefineEx.
 *
 * Python tuples are JS arrays, None is null, an image is {d, w, h, cn}
 * (interleaved), 2-D float data is {d, w, h}. No imports, no exports,
 * ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var C = PF.channels || (PF.channels = {});
  var fr = Math.fround;

  var TWO_PI = 2 * Math.PI;          // 2 * np.pi: doubling is exact
  var JPEG_BASES = [8.0, 4.0, 8.0 / 3.0, 16.0, 24.0];

  function check(cond, msg) { if (!cond) throw new Error('PF.channels: ' + msg); }

  // Negative-control switches for tools/test-channels-a.cjs. Each flips a
  // measured semantic to its "obvious" reading so the test can prove it is
  // able to fail; production leaves every one true.
  var SEM = {
    npRoundOnNpScalars: true,   // round(np.float64, 4) = rint(x*1e4)/1e4
    pySetOrder: true,           // iterate {a, b} in CPython hash order
    logTable: true,             // np.log(k) from the baked numpy table
    thetaReciprocal: true,      // theta = (2*pi*p) * (1/step)
    layoutSumOrder: true        // axis-0 sum of a C array is sequential
  };
  C._semantics = SEM;

  /* ------------------------------------------------------------------ *
   * libm: every transcendental call goes through C._libm so a test can
   * substitute numpy's own outputs (see the header). The default is the
   * platform's Math, which is what runs in production.
   * ------------------------------------------------------------------ */
  function thetaOf(p, inv, step) {
    return SEM.thetaReciprocal ? (TWO_PI * p) * inv : (TWO_PI * p) / step;
  }
  C._theta = function (p, step) { return thetaOf(p, 1.0 / step, step); };

  var LIBM_MATH = {
    name: 'math',
    // np.exp(2j * np.pi * p / step) for a float64 array p -> {c, s}
    phasors: function (p, step) {
      var n = p.length, c = new Float64Array(n), s = new Float64Array(n);
      var inv = 1.0 / step, i, t;
      for (i = 0; i < n; i++) {
        t = thetaOf(p[i], inv, step);
        c[i] = Math.cos(t);
        s[i] = Math.sin(t);
      }
      return { c: c, s: s };
    },
    atan2: function (y, x) { return Math.atan2(y, x); },   // np.angle(z)
    log10: function (x) { return Math.log10(x); },
    pow2: function (x) { return x * x; }                    // np.float64 ** 2
  };
  C._LIBM_MATH = LIBM_MATH;
  C._libm = LIBM_MATH;

  /* np.log(k) for k = 2..512, the reference's own values (numpy 2.5.3 ->
   * UCRT log), little-endian float64 hex. Math.log differs on 11 of them
   * (3, 48, 74, 185, 196, 299, 308, 334, 343, 346, 362). */
  var NP_LOG_HEX =
  'ef39fafe422ee63f0b03ad7aea93f13fef39fafe422ef63f338dedf741c0f93f02202afa0babfc3f575a32ae7222ff3f' +
  '73ab3b3fb2a200400b03ad7aea9301401655b5bbb16b02404c377fb7e32e03407d9ed3bc16e10340518c312b04850440' +
  'a7bbd716ca1c05401f484d3916aa0540ef39fafe422e06407a7ffac16baa064086916b3a7b1f07402cb30406368e0740' +
  '91e3737b42f70740b1ae6f942e5b0840c8c53d7774ba0840f0b3d1fd7d150940f92c927ca76c0940338dedf741c00940' +
  'cd1af0ea94100a40908403b8df5d0a40234a96d65aa80a401ffecdcb38f00a409bd60bf9a6350b405a2b9148ce780b40' +
  '6bc8b8bed3b90b40d1b8d5f4d8f80b40f60db981fc350c40c5f30f535a710c4002202afa0bab0c40bdc73aee28e30c40' +
  'a841c3c5c6190d40d60d8868f94e0d400d72323bd3820d404eac8e4565b50d402d3d2e54bfe60d4011ec1416f0160e40' +
  '4354fc3605460e40a4c9a3760b740e406c4290bd0ea10e40b6f0902f1acd0e4075bb503c38f80e40575a32ae72220f40' +
  'af1bacb7d24b0f40ff0051ff60740f4049a9aeaa259c0f40ab3c226828c30f400c13c27770e90f40f3feba5982071040' +
  '506c2acbf5191040599aada1152c10404d46c6c5e43d10407929c7f9654f10408b3265dc9b6010400d6c12eb88711040' +
  'ebdc27842f8210401b18e3e89192104073ab3b3fb2a210407529949392b21040a6234ada34c210402d1128f19ad11040' +
  '39cebba0c6e01040bb1a949db9ef10402141678975fe1040c9d624f4fb0c11403f57f45c4e1b1140e62f22336e291140' +
  '1dabfcd65c3711405c07a29a1b45114012e8c0c2ab5211403c324c870e601140294e2314456d114073b1af89507a1140' +
  '448078fd318711400b03ad7aea931140659da6027ba0114082e4628de4ac1140d465f60928b911400aa3f85e46c51140' +
  '46bde96a40d11140d23f920417dd114060715dfbcae81140f68aae175df41140102c311bceff1140be5c25c11e0b1240' +
  '7468a7be4f16124070d6f3c26121124099bfa777552c1240e3bcfd802b371240f8a4077ee4411240f84be508814c1240' +
  '6a74f8b6015712402b1d1619676112401655b5bbb16b124031ba1b27e2751240bdc787dff87f1240ec135965f6891240' +
  'e29b3635db931240a53a33c8a79d12409365f0935ca712405b47bf0afab01240c450c09b80ba1240065501b3f0c31240' +
  '31469ab94acd1240a1a4c8158fd612408db3092bbedf12405c83335ad8e8124097e18c01def11240453de47ccffa1240' +
  '8b8da525ad031340ae47ef52770c1340b770a6592e15134053d6898cd21d1340c979443c642613404c377fb7e32e1340' +
  '4bb3f14a51371340e9967241ad3f1340292407e4f7471340e729f27931501340595fc2485a581340422e609472601340' +
  'b1f21a9f7a681340cbb6b5a972701340b37073f35a78134062c822ba33801340e46a293afd8713402cf08eaeb78f1340' +
  '6b580751639713409525fd59009f134077159b008fa613409d80d57a0fae1340f96173fd81b51340120b17bce6bc1340' +
  '5e8846e93dc413401eb973b687cb1340071e0454c4d21340ce6158f1f3d913407d9ed3bc16e113405c62e2e32ce81340' +
  '2477019336ef1340ee6dc4f533f613405af2db3625fd13402de71b800a0414409a4e81fae30a1440530038ceb1111440' +
  '502fa0227418144042c1531e2b1f14407a792be7d6251440faf843a2772c1440679502740d3314405c081a8098391440' +
  'b1f88ee918401440185fbcd28e46144082c7575dfa4c14408e7075aa5b531440484a8cdab25914407bd5790d00601440' +
  'a3e4856243661440b53f66f87c6c1440c02b42edac7214405fd7b55ed378144012add569f07e1440518c312b04851440' +
  '48ead7be0e8b14401cdb5840109114408404c9ca08971440877ac478f89c144010877164dfa21440305d83a7bda81440' +
  '9db83c5b93ae14403b6a729860b4144034d28d7725ba144058488f10e2bf14404e73107b96c514402b8f46ce42cb1440' +
  'fca30421e7d01440d0acbd8983d61440b2af861e18dc14402bc718f5a4e11440ae1dd3222ae7144063dbbcbca7ec1440' +
  'd70687d71df21440de588e878cf714402104dde0f3fc1440ba702cf75302154036ece6ddac071540624e29a8fe0c1540' +
  '3693c46849121540386a3f328d171540a7bbd716ca1c1540c1238428002215406964f5782f27154086cd9719582c1540' +
  '539c941b7a311540f051d38f953615406f01fb86aa3b1540a5957311b9401540fb0e673fc145154074b9c220c34a1540' +
  '2a5b38c5be4f15407d5b3f3cb454154020e31595a35915403cf5c1de8c5e1540e381122870631540fb71a07f4d681540' +
  'd1accff3246d15408c17d092f6711540998e9e6ac276154055d90589887b154002989ffb48801540432cd5cf03851540' +
  '449ce012b9891540a970cdd1688e15406f8d791913931540e50596f6b7971540dfeba775579c1540361a09a3f1a01540' +
  'cbfae88a86a515401f484d3916aa15409aca12baa0ae1540ab11ee1826b31540d5286c61a6b71540c348f39e21bc1540' +
  '8384c3dc97c01540fe72f72509c51540c9d4848575c915405f363d06ddcd1540ec8eceb23fd21540a8dbc3959dd61540' +
  'f5b785b9f6da154036f25a284bdf1540911d69ec9ae315409a20b50fe6e7154007c1239c2cec15407e2c7a9b6ef01540' +
  '8a7e5e17acf41540cd435819e5f8154089fad0aa19fd1540799014d54901164027de51a175051640bf1f9b189d091640' +
  '676be643c00d164044250e2cdf1116402471d1d9f9151640e2a1d455101a164097a6a1a8221e16409e75a8da30221640' +
  '80753ff43a261640cce3a3fd402a1640ef39fafe422e164011904e004132164009fe94093b36164074faa922313a1640' +
  'f1b75253233e164095803da311421640a00f021afc45164081e921bfe249164022b2089ac54d1640a2810cb2a4511640' +
  '6a376e0e80551640b9cb59b657591640a99fe6b02b5d1640b7cb1705fc601640d36cdcb9c864164006f00fd691681640' +
  'b55c7a60576c1640819dd05f19701640dbc7b4dad77316404062b6d79277164036a9525d4a7b16400bd3f471fe7e1640' +
  '5052f61baf82164032179f615c8616409ccf2549068a16403a26b0d8ac8d16405c00531650911640beba1208f0941640' +
  '4565e3b38c981640a6fda81f269c16400ca93751bc9f1640bdec534e4fa31640bbe5b21cdfa616407a7ffac16baa1640' +
  '9aa9c143f5ad1640bb8c90a77bb1164062bee0f2feb4164005741d2b7fb816402cb5a355fcbb1640c68cc27776bf1640' +
  '9839bb96edc21640ee5dc1b761c616406b2efbdfd2c9164021a0811441cd1640d895605aacd016409e0c97b614d41640' +
  '9147172e7ad71640f3fac6c5dcda16408e767f823cde16405acf0d6999e116408008337ef3e41640ac3ba4c64ae81640' +
  'b7c00a479feb1640af540404f1ee16403840230240f21640597dee458cf51640a5dce1d3d5f81640cb296eb01cfc1640' +
  '9a4ff9df60ff1640687bde66a2021740ef3f6e49e10517409cb7ee8b1d09174056a69b32570c1740b59aa6418e0f1740' +
  'c00e37bdc21217401e886aa9f4151740ccb7540a241917405399ffe3501c174086916b3a7b1f1740c28c8f11a3221740' +
  'b91c596dc8251740c995ac51eb281740e12b65c20b2c1740f10e55c3292f1740f386455845321740800ff7845e351740' +
  'fd72214d7538174064e573b4893b17409d1e95be9b3e17407a74236fab41174050f4b4c9b8441740267cd7d1c3471740' +
  '8fd3108bcc4a17401ec4def8d24d17408631b71ed750174053310800d9531740592238a0d8561740c1c3a502d6591740' +
  'c24ba82ad15c1740087e8f1bca5f1740c5c1a3d8c062174075372665b56517404ece50c4a7681740605956f9976b1740' +
  '6da46207866e174070889af171711740dbff1bbb5b7417408c3afe664377174079b151f8287a1740163a20720c7d1740' +
  '72196dd7ed7f17401517352bcd821740968f6e70aa851740ed8609aa858817408cbaefda5e8b17402cb30406368e1740' +
  '69d6252e0b9117400e782a56de9317403aebe380af96174033931db17e9917400df49ce94b9c174013c3212d179f1740' +
  'f0f6657ee0a11740acd71de0a7a41740690ef8546da71740ebb49ddf30aa1740eb64b282f2ac17403947d440b2af1740' +
  'a1229c1c70b21740a96a9d182cb51740154e6637e6b7174038c57f7b9eba17401ca06de754bd17407394ae7d09c01740' +
  '5f4bbc40bcc21740056f0b336dc51740f8b70b571cc8174075fa27afc9ca17407433c63d75cd1740899547051fd01740' +
  'a0950808c7d217408ef760486dd5174074daa3c811d81740fdc41f8bb4da174076b11e9255dd1740b519e6dff4df1740' +
  'e502b77692e217402509ce582ee51740ff6a6388c8e71740c014ab0761ea1740a7abd4d8f7ec1740f2980bfe8cef1740' +
  'c414777920f21740ef303a4db2f4174091e3737b42f717409c113f06d1f917402e99b2ef5dfc1740d55be139e9fe1740' +
  'ad48dae6720118405766a8f8fa031840e3dc52718106184084ffdc52060918403956469f890b18404ba78a580b0e1840' +
  'b200a2808b1018405fc180190a13184068a21725871518400fc053a502181840bba21e9c7c1a1840ce475e0bf51c1840' +
  '5e2af5f46b1f1840d54bc25ae12118407a3ca13e55241840db236aa2c726184021c9f18738291840469b09f1a72b1840' +
  '39b97fdf152e1840e0f91e55823018400ff4ae53ed3218405706f4dc56351840ca5eaff2be371840a3029f96253a1840' +
  'd7d57dca8a3c184091a20390ee3e18409320e5e85041184089fcd3d6b143184040df7e5b11461840c67491786f481840' +
  '8173b42fcc4a18401fa38d82274d184082e3bf72814f18408e33eb01da511840e7b7ac313154184098c19e0387561840' +
  'acd45879db581840b1ae6f942e5b1840234d7556805d1840d0f3f8c0d05f18401d3387d51f62184043eea9956d641840' +
  '7461e802ba661840f027c71e056918400942c8ea4e6b1840191b6b68976d18405d8f2c99de6f1840cdf1867e24721840' +
  'd811f219697418401641e36cac761840e958cd78ee7818400bc0203f2f7b184013704bc16e7d1840e0fab800ad7f1840' +
  '0190d2fee98118400502ffbc25841840c1cba23c608618408315207f998818403cbad685d18a1840984c2452088d1840' +
  '071c64e53d8f1840bc39ef40729118409d7d1c66a5931840228b4056d79518402ad6ad1208981840c3a7b49c379a1840' +
  'e622a3f5659c18401f49c51e939e184032ff6419bfa01840ae11cae6e9a2184074393a8813a518403020f9fe3ba71840' +
  'cf64484c63a91840db9f677189ab1840d867946faead18408c550a48d2af1840450803fcf4b11840072ab68c16b41840' +
  'bc7359fb36b6184050b1204956b81840c8c53d7774ba184045afe08691bc18400b8b3779adbe184070996e4fc8c01840' +
  'c741b00ae2c218403e1625acfac41840b6d7f33412c718408f7941a628c91840652531013ecb1840cc3ee44652cd1840' +
  'fd667a7865cf18407880119777d11840a5b2c5a388d318405f6db19f98d51840826ced8ba7d7184069bb9069b5d91840' +
  '62b8b039c2db1840211861fdcddd184020e9b3b5d8df1840ff96b963e2e11840d5ed8008ebe318407e1d17a5f2e51840' +
  'dcbc873af9e7184014cddcc9fee91840bebc1e5403ec1840126b54da06ee18400a2b835d09f018407cc6aede0af21840' +
  '2d81d95e0bf41840';
  var NP_LOG = (function () {
    var n = NP_LOG_HEX.length / 16, out = new Float64Array(n), dv = new DataView(new ArrayBuffer(8)), i, b;
    for (i = 0; i < n; i++) {
      for (b = 0; b < 8; b++) dv.setUint8(b, parseInt(NP_LOG_HEX.substr(i * 16 + b * 2, 2), 16));
      out[i] = dv.getFloat64(0, true);
    }
    return out;
  })();
  function npLogInt(k) {
    // k >= 2 always (max(len(phases), 2)); beyond 512 (steps > 128 px, which
    // no reference call site asks for) the platform log is the best available
    if (SEM.logTable && k >= 2 && k - 2 < NP_LOG.length) return NP_LOG[k - 2];
    return Math.log(k);
  }
  C.npLogInt = npLogInt;

  /* ------------------------------------------------------------------ *
   * Python scalar semantics
   * ------------------------------------------------------------------ */

  // float % float (CPython float_rem == numpy npy_divmod's mod): fmod, then
  // moved to the divisor's sign; a zero remainder takes the divisor's sign.
  function pyMod(x, y) {
    var m = x % y;
    if (m) {
      if ((y < 0) !== (m < 0)) m += y;
    } else {
      m = (y < 0) ? -0 : 0;
    }
    return m;
  }
  C.pyMod = pyMod;

  // Python's max(a, b) / min(a, b): the FIRST argument is kept unless the
  // second compares strictly greater (less) - which also fixes which signed
  // zero comes back.
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }
  C.pyMax = pyMax;
  C.pyMin = pyMin;

  function round4(x, isNp) {
    if (isNp && SEM.npRoundOnNpScalars) return PF.rint(x * 10000.0) / 10000.0;
    return PF.pyRound(x, 4);
  }
  C.round4 = round4;

  /* CPython 3.12 hash(float) as the 64 bits (least significant first) of
   * the size_t that set_add_entry masks. _Py_HashDouble reduces |v| modulo
   * the Mersenne prime P = 2^61 - 1; with |v| = M * 2^E (M the integer
   * mantissa, < 2^53) and 2^61 == 1 (mod P), that is M rotated left by
   * (E mod 61) inside 61 bits (M < 2^53 can never rotate to all-ones == P).
   * A negative v negates the hash (two's complement in 64 bits) and a hash
   * of -1 becomes -2. Bits, not BigInt: this file targets ES2017. */
  var hdv = new DataView(new ArrayBuffer(8));
  function pyHashBits(v) {
    var out = new Uint8Array(64), m = new Uint8Array(61), i;
    check(v === v, 'pyHashBits: NaN hashes by identity in CPython; not modelled');
    check(isFinite(v), 'pyHashBits: hash of an infinite float is not modelled');
    if (v === 0) return out;
    hdv.setFloat64(0, Math.abs(v));
    var hi = hdv.getUint32(0), lo = hdv.getUint32(4);
    var be = (hi >>> 20) & 0x7ff, E;
    for (i = 0; i < 32; i++) m[i] = (lo >>> i) & 1;
    for (i = 0; i < 20; i++) m[32 + i] = (hi >>> i) & 1;
    if (be === 0) E = -1074;
    else { m[52] = 1; E = be - 1075; }
    var r = ((E % 61) + 61) % 61;
    for (i = 0; i < 61; i++) out[(i + r) % 61] = m[i];
    if (v < 0) {
      var carry = 1, allOnes = true, b;
      for (i = 0; i < 64; i++) {                      // -x = ~x + 1 in 64 bits
        b = (out[i] ^ 1) + carry;
        out[i] = b & 1;
        carry = b >> 1;
        if (!out[i]) allOnes = false;
      }
      if (allOnes) out[0] = 0;                         // -1 -> -2
    }
    return out;
  }
  C.pyHashBits = pyHashBits;

  /* Iteration order of a Python set built by inserting vals[0], vals[1], ...
   * (a set display or .add() calls). Returns the indices of the entries the
   * set KEEPS (the first of equal values) in the order `for s in set` visits
   * them. CPython setobject.c: an 8-slot table (PySet_MINSIZE), start at
   * hash & 7, and - because i + LINEAR_PROBES(9) > mask - no linear probes:
   * perturb >>= 5; i = (i*5 + 1 + perturb) & mask. Iteration walks the
   * slots in index order. Up to 4 entries (the 5th resizes the table). */
  function pySetIter(vals) {
    var table = [-1, -1, -1, -1, -1, -1, -1, -1], used = 0, i, j, dup;
    for (i = 0; i < vals.length; i++) {
      dup = false;
      for (j = 0; j < 8; j++) if (table[j] >= 0 && vals[table[j]] === vals[i]) { dup = true; break; }
      if (dup) continue;
      check(used < 4, 'pySetIter: more than 4 entries would resize the table; not modelled');
      var hb = pyHashBits(vals[i]);
      var idx = hb[0] | (hb[1] << 1) | (hb[2] << 2), shift = 0;
      while (table[idx] >= 0) {
        shift += 5;                                    // perturb >>= PERTURB_SHIFT
        var pl = 0;                                    // only its low 3 bits survive & 7
        for (var t = 0; t < 3; t++) if (shift + t < 64) pl |= hb[shift + t] << t;
        idx = (idx * 5 + 1 + pl) & 7;
      }
      table[idx] = i;
      used++;
    }
    var out = [];
    for (j = 0; j < 8; j++) if (table[j] >= 0) out.push(table[j]);
    if (!SEM.pySetOrder) out.sort(function (a, b) { return a - b; });   // control: insertion order
    return out;
  }
  C.pySetIter = pySetIter;

  // np.argsort(-x), numpy's default kind (see the header).
  function argsortNeg(x) {
    var n = x.length, neg = new Float64Array(n), i;
    for (i = 0; i < n; i++) neg[i] = -x[i];
    return PF._scipyInternals.argsortNumpy(neg);
  }
  C.argsortNeg = argsortNeg;

  function meanOrNaN(a) { return a.length ? PF.mean(a) : NaN; }
  function stdOrNaN(a) { return a.length ? PF.std(a) : NaN; }

  function sumSq(h) {
    var n = h.length, sq = new Float64Array(n), i;
    for (i = 0; i < n; i++) sq[i] = h[i] * h[i];      // (h ** 2): np.square
    return PF.sum(sq);
  }

  function uniqueCount(vals) {
    if (!vals.length) return 0;
    return PF.unique(Float64Array.from(vals)).values.length;
  }

  // ---------------------------------------------------------------- profiles

  /* float32 (H, W, C) with alpha premultiplied and kept as a channel. */
  function _flatten_channels(rgba) {
    var w = rgba.w | 0, h = rgba.h | 0, cn = rgba.cn || 1, n = w * h, src = rgba.d, i, c;
    check(src && src.length === n * cn, '_flatten_channels: data length ' + (src ? src.length : src) + ' != w*h*cn');
    var out = new Float32Array(n * cn);
    if (cn === 4) {
      for (i = 0; i < n; i++) {
        var a = fr(src[i * 4 + 3] / 255.0);              // img[:, :, 3:4] / 255.0 (float32)
        out[i * 4] = fr(src[i * 4] * a);
        out[i * 4 + 1] = fr(src[i * 4 + 1] * a);
        out[i * 4 + 2] = fr(src[i * 4 + 2] * a);
        out[i * 4 + 3] = src[i * 4 + 3];
      }
    } else {
      for (c = 0; c < n * cn; c++) out[c] = src[c];
    }
    return { d: out, w: w, h: h, cn: cn };
  }

  // sqrt(sum_c (a_c - b_c)^2) in float32, channels summed left to right from 0
  function d1mag(d, p, q, cn) {
    var acc = 0, t, c;
    for (c = 0; c < cn; c++) { t = fr(d[p + c] - d[q + c]); acc = fr(acc + fr(t * t)); }
    return fr(Math.sqrt(acc));
  }
  // sqrt(sum_c (a_c - 2*b_c + c_c)^2) in float32: (a - 2*b) + c
  function d2mag(d, pa, pb, pc, cn) {
    var acc = 0, t, c;
    for (c = 0; c < cn; c++) {
      t = fr(fr(d[pa + c] - fr(2 * d[pb + c])) + d[pc + c]);
      acc = fr(acc + fr(t * t));
    }
    return fr(Math.sqrt(acc));
  }

  /* sum over axis 0 of a C-contiguous (rows, cols) float32 map held as a
   * function of (r, c): numpy accumulates row by row (SEQUENTIAL). The
   * control switch replaces it with a per-column pairwise sum. */
  function colSumsF32(rows, cols, at) {
    var out = new Float64Array(cols), r, c;
    if (SEM.layoutSumOrder) {
      var acc = new Float32Array(cols);
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) acc[c] = fr(acc[c] + at(r, c));
      for (c = 0; c < cols; c++) out[c] = acc[c];
    } else {
      var col = new Float32Array(rows);
      for (c = 0; c < cols; c++) {
        for (r = 0; r < rows; r++) col[r] = at(r, c);
        out[c] = PF.pairwiseSum(col, 0, rows, true);
      }
    }
    return out;
  }

  /* Compute E1 (edge) and E2 (curvature) profiles for both axes.
   *   e1x: (W+1,) energy of a vertical cut at x  (cut positions 0..W)
   *   e1y: (H+1,)
   *   e2x: (W,)   curvature energy at column x   (pixel positions)
   *   e2y: (H,) */
  function axis_profiles(rgba) {
    var img = _flatten_channels(rgba), h = img.h, w = img.w, cn = img.cn, d = img.d;
    var e1x = new Float64Array(w + 1), e1y = new Float64Array(h + 1);
    var e2x = new Float64Array(w), e2y = new Float64Array(h);
    var x, y, i, row;
    if (w > 1) {
      // dx.sum(axis=0)
      var sx = colSumsF32(h, w - 1, function (r, c) { return d1mag(d, (r * w + c + 1) * cn, (r * w + c) * cn, cn); });
      for (x = 0; x < w - 1; x++) e1x[x + 1] = sx[x];
    }
    if (h > 1) {
      // dy.sum(axis=1): pairwise over each row of dy
      row = new Float32Array(w);
      for (y = 0; y < h - 1; y++) {
        for (x = 0; x < w; x++) row[x] = d1mag(d, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
        e1y[y + 1] = PF.pairwiseSum(row, 0, w, true);
      }
    }
    var top = 1.0, mx;
    if (w > 1) { mx = -Infinity; for (i = 1; i < w; i++) if (e1x[i] > mx) mx = e1x[i]; } else mx = 0.0;
    var my;
    if (h > 1) { my = -Infinity; for (i = 1; i < h; i++) if (e1y[i] > my) my = e1y[i]; } else my = 0.0;
    top = Math.max(mx, my, 1.0);
    e1x[0] = e1x[w] = top;   // image borders are always cuts
    e1y[0] = e1y[h] = top;

    if (w > 2) {
      var s2x = colSumsF32(h, w - 2, function (r, c) {
        return d2mag(d, (r * w + c + 2) * cn, (r * w + c + 1) * cn, (r * w + c) * cn, cn);
      });
      for (x = 0; x < w - 2; x++) e2x[x + 1] = s2x[x];
    }
    if (h > 2) {
      row = new Float32Array(w);
      for (y = 0; y < h - 2; y++) {
        for (x = 0; x < w; x++) row[x] = d2mag(d, ((y + 2) * w + x) * cn, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
        e2y[y + 1] = PF.pairwiseSum(row, 0, w, true);
      }
    }
    return { e1x: e1x, e1y: e1y, e2x: e2x, e2y: e2y };
  }

  function _normalise(profile) {
    var n = profile.length;
    if (n - 2 <= 0) return Float64Array.from(profile);           // interior.size == 0
    var interior = (profile instanceof Float64Array ? profile : Float64Array.from(profile)).subarray(1, n - 1);
    var scale = PF.percentile(interior, 95, 'f8');
    if (scale <= 0) {
      var mx = -Infinity, i;
      for (i = 0; i < interior.length; i++) if (interior[i] > mx) mx = interior[i];
      scale = mx > 0 ? mx : 1.0;
    }
    var den = scale + 1e-9, out = new Float64Array(n), j;
    for (j = 0; j < n; j++) out[j] = PF.clipScalar(profile[j] / den, 0.0, 1.5);
    return out;
  }

  // ------------------------------------------------------- period estimation

  /* Pre-pooled/blurred variants of a profile for jitter-tolerant combs. */
  var POOLS = [1, 3, 5, 7];
  function _PooledProfile(profile) {
    var norm = _normalise(profile);
    this.variants = {};
    for (var k = 0; k < POOLS.length; k++) {
      var p = POOLS[k];
      var v = p > 1 ? PF.maximum_filter1d(norm, p) : norm;
      v = PF.gaussian_filter1d(v, 0.6);
      var interior = v.subarray(1, Math.max(1, v.length - 1));
      this.variants[p] = [v, meanOrNaN(interior), stdOrNaN(interior) + 1e-9];
    }
  }
  _PooledProfile.POOLS = POOLS;
  /* All variants applicable to this step (pool must stay < step). */
  _PooledProfile.prototype.for_step = function (step) {
    var limit = step >= 3.5 ? 3 : 1;
    if (step >= 8) limit = 5;
    if (step >= 12) limit = 7;
    var out = [];
    for (var k = 0; k < POOLS.length; k++) if (POOLS[k] <= limit) out.push(this.variants[POOLS[k]]);
    return out;
  };

  /* Best (score, phase) of a regular comb of spacing `step`.
   *
   * Score is a bias-corrected z-score (see module docstring), maximised over
   * the jitter-tolerance pools narrow enough for this step. */
  function _comb_score(pp, step, phase_res) {
    if (phase_res === undefined || phase_res === null) phase_res = 0.25;
    var variants = pp.for_step(step);
    if (!variants.length) return [0.0, 0.0];
    var n = variants[0][0].length - 1;
    if (step < 1.25 || step > n / 4) return [0.0, 0.0];

    var n_cuts = PF.rint(n / step);                  // int(round(n / step))
    var K = n_cuts - 1;                               // len(np.arange(1, n_cuts))
    if (!(K >= 4)) return [0.0, 0.0];

    var phases = PF.arange(0.0, step, phase_res);
    var P = phases.length, lim = n - 0.51, i, j, pos;
    var i0 = new Int32Array(P * K), frac = new Float64Array(P * K), valid = new Uint8Array(P * K);
    var counts = new Int32Array(P), anyOk = false;
    for (i = 0; i < P; i++) {
      var cnt = 0;
      for (j = 0; j < K; j++) {
        pos = phases[i] + (j + 1) * step;               // phases[:, None] + ks[None, :] * step
        var ok = pos < lim;
        if (!ok) pos = 0.0;                              // np.where(valid, pos, 0.0)
        var ip = Math.trunc(pos);                        // pos.astype(np.int64)
        i0[i * K + j] = ip;
        frac[i * K + j] = pos - ip;
        valid[i * K + j] = ok ? 1 : 0;
        if (ok) cnt++;
      }
      counts[i] = cnt;
      if (cnt >= 4) anyOk = true;
    }
    if (!anyOk) return [0.0, 0.0];
    var penalty = Math.sqrt(2.0 * npLogInt(Math.max(P, 2)));

    var best_score = -1e18, best_phase = 0.0;
    var vals = new Float64Array(K), z = new Float64Array(P);
    for (var vi = 0; vi < variants.length; vi++) {
      var blur = variants[vi][0], base_mean = variants[vi][1], base_std = variants[vi][2];
      for (i = 0; i < P; i++) {
        for (j = 0; j < K; j++) {
          var q = i * K + j, f = frac[q], a = i0[q];
          var v = blur[a] * (1 - f) + blur[a + 1] * f;   // blur[i0]*(1-frac) + blur[i0+1]*frac
          vals[j] = v * valid[q];                        // (vals * valid)
        }
        var c1 = Math.max(counts[i], 1);
        var means = counts[i] >= 4 ? PF.pairwiseSum(vals, 0, K, false) / c1 : -Infinity;
        z[i] = (means - base_mean) / (base_std / Math.sqrt(c1) + 1e-9);
      }
      var b = PF.argmax(z);
      var sc = z[b] - penalty;
      if (sc > best_score) { best_score = sc; best_phase = phases[b]; }
    }
    return [best_score, best_phase];
  }

  /* The lattice LSQ loop shared by _lattice_refine and
   * _lattice_refine_peaks. Returns {s, early}: early is true when the
   * reference returns its s0 argument itself (whose Python type then
   * carries through), false when it returns float(coef[1]). */
  function latticeFit(peaks, h, s0, n_iters) {
    if (peaks.length < 4) return { s: s0, early: true };
    var s = s0, m = peaks.length, it, i;
    var phi = pyMod(peaks[PF.argmax(h)], s);
    var k = new Float64Array(m), w = new Float64Array(m);
    var A = new Float64Array(m * 2), bb = new Float64Array(m);
    for (it = 0; it < n_iters; it++) {
      var kk = [];
      for (i = 0; i < m; i++) {
        k[i] = PF.rint((peaks[i] - phi) / s);
        var resid = peaks[i] - (phi + k[i] * s);
        w[i] = h[i] * (Math.abs(resid) < 0.35 * s ? 1 : 0);
        if (w[i] > 0) kk.push(k[i]);
      }
      if (PF.sum(w) <= 0 || uniqueCount(kk) < 3) return { s: s0, early: true };
      for (i = 0; i < m; i++) {
        A[i * 2] = 1.0 * w[i];                           // np.ones_like(k) * w
        A[i * 2 + 1] = k[i] * w[i];
        bb[i] = peaks[i] * w[i];
      }
      var coef = PF.lstsq(A, m, 2, bb).x;
      phi = coef[0];
      s = coef[1];
      if (!isFinite(s) || s < 1.2 || Math.abs(s - s0) > 0.6 * s0) return { s: s0, early: true };
    }
    return { s: s, early: false };
  }

  /* Lattice LSQ fit (see _lattice_refine) on a raw peak list. */
  function _lattice_refine_peaks(peaks, h, s0, n_iters) {
    if (n_iters === undefined || n_iters === null) n_iters = 4;
    return latticeFit(peaks, h, s0, n_iters).s;
  }

  function latticeRefineEx(profile, s0, n_iters) {
    if (n_iters === undefined || n_iters === null) n_iters = 4;
    var norm = _normalise(profile);
    var fp = PF.find_peaks(norm.subarray(1, norm.length - 1),
      { height: 0.12, distance: Math.max(1, Math.trunc(s0 * 0.45)) });
    var peaks = new Float64Array(fp.peaks.length), i;
    for (i = 0; i < peaks.length; i++) peaks[i] = fp.peaks[i] + 1;
    if (peaks.length < 4) return { s: s0, early: true };
    return latticeFit(peaks, fp.properties.peak_heights, s0, n_iters);
  }

  /* Sub-pixel period refinement by lattice fitting.
   *
   * Comb scores are razor-thin in step-space (a 0.02 px error accumulates to
   * a full misalignment across a hundred cuts), so searching the comb score
   * directly is hopeless. Instead: detect profile peaks, assign each to its
   * nearest lattice index k = round((p - phase)/s), and solve p ~ phase + k*s
   * by height-weighted least squares over the inliers. Converges to the true
   * fractional step from a rough integer seed. */
  function _lattice_refine(profile, s0, n_iters) {
    return latticeRefineEx(profile, s0, n_iters).s;
  }

  /* Rayleigh core shared by _rayleigh_score / _tiles_ray_z / _ray_quick:
   * resultant = (h * np.exp(2j*np.pi*p/step)).sum() as {re, im}. */
  function resultantOf(p, h, step) {
    var ph = C._libm.phasors(p, step), n = p.length, i;
    var re = new Float64Array(n), im = new Float64Array(n);
    for (i = 0; i < n; i++) {
      re[i] = h[i] * ph.c[i] - 0 * ph.s[i];              // (h + 0j) * (c + s j)
      im[i] = h[i] * ph.s[i] + 0 * ph.c[i];
    }
    return PF.complexSum(re, im);
  }
  // (np.angle(resultant) / (2 * np.pi) * step) % step
  function phaseOf(res, step) {
    return pyMod(C._libm.atan2(res.im, res.re) / TWO_PI * step, step);
  }
  // len(np.unique(slots[hits]))
  function occupiedSlots(p, phase, step) {
    var hitSlots = [], i, slot;
    for (i = 0; i < p.length; i++) {
      slot = PF.rint((p[i] - phase) / step);
      if (Math.abs(p[i] - (phase + slot * step)) < 0.35 * step) hitSlots.push(slot);
    }
    return uniqueCount(hitSlots);
  }

  /* Phase-coherence score of profile peaks against a lattice of `step`.
   *
   * A Rayleigh-style test: project every peak onto the unit circle at angle
   * 2*pi*position/step. Independent per-boundary jitter only attenuates the
   * resultant vector (a 30% jitter still leaves |R| ~ 0.3) whereas comb
   * sampling collapses entirely, so this channel rescues wobbly grids.
   * Scaled by lattice occupancy so half-period harmonics (every second slot
   * empty) don't tie with the fundamental. Returns (z_like, phase). */
  function _rayleigh_score(profile, step) {
    var norm = _normalise(profile);
    var n = norm.length - 1;
    if (step < 2.0 || step > n / 4) return [0.0, 0.0];
    var fp = PF.find_peaks(norm.subarray(1, norm.length - 1),
      { height: 0.15, distance: Math.max(1, Math.trunc(step * 0.4)) });
    if (fp.peaks.length < 5) return [0.0, 0.0];
    var p = new Float64Array(fp.peaks.length), i;
    for (i = 0; i < p.length; i++) p[i] = fp.peaks[i] + 1;
    var h = fp.properties.peak_heights;

    var res = resultantOf(p, h, step);
    var hs = PF.sum(h);
    var R = PF.cabs(res.re, res.im) / hs;
    var n_eff = C._libm.pow2(hs) / sumSq(h);

    // fraction of lattice slots that actually contain a peak
    var phase = phaseOf(res, step);
    var n_slots = Math.max(1, Math.trunc(n / step) - 1);
    var occupancy = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);

    var z = Math.sqrt(2.0 * n_eff) * R * occupancy;
    return [z, phase];
  }

  /* Refine a candidate step and rescore it -> (step, score, phase).
   *
   * Tries the raw seed and its lattice-fitted refinement; scores each by the
   * better of comb z (regular grids) and Rayleigh coherence (wobbly grids).
   * stepIsNp: step is an np.float64 in the reference (see the header). */
  function _refine_step(pp, profile, step, stepIsNp) {
    stepIsNp = !!stepIsNp;
    var vals = [round4(step, stepIsNp)], nps = [stepIsNp];
    var lr = latticeRefineEx(profile, step);
    var rNp = lr.early ? stepIsNp : false;
    vals.push(round4(lr.s, rNp));
    nps.push(rNp);
    var best = [step, -1e18, 0.0, stepIsNp];
    var order = pySetIter(vals);
    for (var k = 0; k < order.length; k++) {
      var s = vals[order[k]];
      var cs = _comb_score(pp, s), score = cs[0], phase = cs[1];
      var rr = _rayleigh_score(profile, s);
      if (rr[0] > score) { score = rr[0]; phase = rr[1]; }
      if (score > best[1]) best = [s, score, phase, nps[order[k]]];
    }
    return best;
  }

  /* Candidate periods from spacings between adjacent profile peaks.
   *
   * This is pixeldetector's core idea (median of np.diff(find_peaks(...)))
   * - phase-free and immune to harmonics, so it makes an excellent seed for
   * comb refinement even when the blind scan struggles. */
  function _spacing_candidates(profile, min_step, max_step) {
    var norm = _normalise(profile), cands = [], hts = [0.10, 0.30], t, i;
    var inner = norm.subarray(1, norm.length - 1);
    var lo = pyMax(1.5, min_step * 0.6), hi = max_step * 1.5;
    for (t = 0; t < hts.length; t++) {
      var pk = PF.find_peaks(inner, { height: hts[t], distance: 2 }).peaks;
      if (pk.length < 4) continue;
      var sp = [];
      for (i = 1; i < pk.length; i++) {
        var dd = pk[i] - pk[i - 1];                   // np.diff(peaks).astype(np.float64)
        if (dd >= lo && dd <= hi) sp.push(dd);
      }
      if (sp.length < 3) continue;
      var spa = Float64Array.from(sp);
      cands.push(PF.median(spa, 'f8'));
      var u = PF.unique(spa, { counts: true });
      cands.push(u.values[PF.argmax(u.counts)]);
    }
    return cands;
  }

  function sortStableBy(arr, key) {       // Python list.sort(key=...): stable, '<' on keys
    return arr.map(function (r, i) { return [key(r), i, r]; })
      .sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : a[1] - b[1]); })
      .map(function (t) { return t[2]; });
  }

  /* Estimate the dominant cell size along one axis of one profile.
   *
   * Returns (step, score, phase); step None if nothing periodic. Element [3]
   * says whether the returned step is an np.float64 in the reference. */
  function estimate_period(profile, min_step, max_step, harmonic_tol) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    if (harmonic_tol === undefined || harmonic_tol === null) harmonic_tol = 0.88;
    var n = profile.length - 1;
    if (max_step === undefined || max_step === null) max_step = pyMin(pyMax(4.0, n / 8.0), 64.0);

    var pp = new _PooledProfile(profile);

    var steps = [], s = min_step;
    while (s <= max_step) {
      steps.push(s);
      s += s < 16 ? 0.5 : 1.0;
    }
    if (!steps.length) return [null, 0.0, 0.0, false];
    var scores = new Float64Array(steps.length), i;
    for (i = 0; i < steps.length; i++) scores[i] = _comb_score(pp, steps[i])[0];
    var order = argsortNeg(scores);

    var refined = [], seen = [];
    function near(s0) { for (var q = 0; q < seen.length; q++) if (Math.abs(s0 - seen[q]) < 0.6) return true; return false; }

    // peak-spacing candidates first: strong, harmonic-free priors
    var sc = _spacing_candidates(profile, min_step, max_step);
    for (i = 0; i < sc.length; i++) {
      var s0 = sc[i];
      if (s0 < min_step || s0 > max_step) continue;
      if (near(s0)) continue;
      seen.push(s0);
      refined.push(_refine_step(pp, profile, s0, false));
    }

    for (i = 0; i < Math.min(6, order.length); i++) {
      var idx = order[i];
      if (scores[idx] <= 0) break;
      var s1 = steps[idx];                             // np.float64 (steps = np.array(...))
      if (near(s1)) continue;
      seen.push(s1);
      refined.push(_refine_step(pp, profile, s1, true));
    }

    if (!refined.length) return [null, 0.0, 0.0, false];
    var best_score = -Infinity;
    for (i = 0; i < refined.length; i++) if (refined[i][1] > best_score) best_score = refined[i][1];
    if (best_score <= 0) return [null, 0.0, 0.0, false];

    // prefer the smallest step among near-best (multiples of the true step
    // also score well; divisors score clearly lower)
    var good = sortStableBy(refined.filter(function (r) { return r[1] >= harmonic_tol * best_score; }),
      function (r) { return r[0]; });
    var step = good[0][0], score = good[0][1], phase = good[0][2], isNp = good[0][3];

    // test integer divisors of the winner - catches a missed fundamental
    // (content structure often repeats at small multiples of the pixel size).
    // The absolute floor keeps this from swapping harmonics of pure noise.
    var improved = true, divs = [2, 3, 4, 5];
    while (improved) {
      improved = false;
      for (var di = 0; di < divs.length; di++) {
        var div = divs[di], sub = step / div;
        if (sub < min_step) continue;
        var r = _refine_step(pp, profile, sub, isNp);
        if (r[1] >= pyMax(harmonic_tol * score, 3.0) && Math.abs(r[0] * div - step) < 0.6 * div) {
          step = r[0]; score = r[1]; phase = r[2]; isNp = r[3];
          improved = true;
          break;
        }
      }
    }

    // jpeg trap: quantization amplifies the 8x8 block lattice (and its 4.0 /
    // 2.67 harmonics), always at phase 0 relative to the image origin. If the
    // winner looks exactly like the jpeg grid but a credible non-jpeg
    // candidate exists, prefer that candidate.
    if (is_jpeg_suspect(step)) {
      var sc0 = score;
      var alts = refined.filter(function (r) { return !is_jpeg_suspect(r[0]) && r[1] >= 0.55 * sc0; });
      if (alts.length) {
        alts = sortStableBy(alts, function (r) { return -r[1]; });
        step = alts[0][0]; score = alts[0][1]; phase = alts[0][2]; isNp = alts[0][3];
      } else {
        // still on the jpeg family: deflate so the sibling channel /
        // axis with a real grid wins downstream comparisons
        score *= 0.5;
      }
    }
    return [step, score, phase, isNp];
  }

  /* True when a step sits exactly on the jpeg block lattice family,
   * regardless of phase (band/Rayleigh channels report drifted phases). */
  function is_jpeg_suspect(step) {
    for (var i = 0; i < JPEG_BASES.length; i++) if (Math.abs(step - JPEG_BASES[i]) < 0.09) return true;
    return false;
  }

  /* True when (step, phase) matches the 8x8 jpeg block grid or one of its
   * integer subdivisions, aligned to the image origin. */
  function is_jpeg_lattice(step, phase) {
    for (var i = 0; i < JPEG_BASES.length; i++) {
      var base = JPEG_BASES[i];
      if (Math.abs(step - base) < 0.09) {
        var m = pyMod(phase, base);
        if (m < 0.6 || m > base - 0.6) return true;
      }
    }
    return false;
  }

  /* Differential z-score of the phase-0 8px lattice (jpeg block edges).
   *
   * A real 4px art grid puts energy on 8k AND 8k+4; jpeg blocks only on 8k.
   * Scoring the difference keeps true 4/8px grids from being mistaken for
   * compression artifacts. */
  function _jpeg_lattice_strength(profile) {
    var norm = PF.gaussian_filter1d(_normalise(profile), 0.6);
    var n = norm.length - 1, on = [], off = [], i;
    for (i = 8; i < n - 7; i += 8) on.push(norm[i]);        // np.arange(8, n - 7, 8)
    for (i = 4; i < n - 3; i += 8) off.push(norm[i]);       // np.arange(4, n - 3, 8)
    if (on.length < 4 || off.length < 4) return 0.0;
    var interior = norm.subarray(1, n);
    var base_mean = PF.mean(interior);
    var base_std = PF.std(interior) + 1e-9;
    var z_on = (PF.mean(Float64Array.from(on)) - base_mean) / (base_std / Math.sqrt(on.length));
    var z_off = (PF.mean(Float64Array.from(off)) - base_mean) / (base_std / Math.sqrt(off.length));
    return z_on - pyMax(z_off, 0.0);
  }

  /* Remove the 8px block lattice: values within `width` of a multiple of 8
   * are replaced by interpolation from unaffected neighbours. */
  function _notch_jpeg(profile, width) {
    if (width === undefined || width === null) width = 1.0;
    var len = profile.length, n = len - 1, i;
    var mask = new Uint8Array(len), nMask = 0;
    for (i = 0; i < len; i++) {
      var r = i % 8;
      mask[i] = Math.min(r, 8 - r) <= width ? 1 : 0;
    }
    if (len > 0) { mask[0] = 0; mask[n] = 0; }
    for (i = 0; i < len; i++) nMask += mask[i];
    if (nMask === 0 || nMask === len) return profile;
    var out = Float64Array.from(profile);
    var xs = [], xp = [], fp = [];
    for (i = 0; i < len; i++) {
      if (mask[i]) xs.push(i); else { xp.push(i); fp.push(out[i]); }
    }
    var v = PF.interp(Float64Array.from(xs), Float64Array.from(xp), Float64Array.from(fp));
    for (i = 0; i < xs.length; i++) out[xs[i]] = v[i];
    return out;
  }

  /* 2D gradient/curvature magnitude maps used for tile evidence.
   *
   * dqx: (H, W-1) first-diff magnitude of the quantized image along x
   * dqy: (H-1, W) along y;  cox/coy: curvature magnitudes of the original. */
  function _grad_maps(rgba, quantized) {
    var q = _flatten_channels(quantized), o = _flatten_channels(rgba);
    var w = q.w, h = q.h, cn = q.cn, x, y;
    check(o.w === w && o.h === h && o.cn === cn, '_grad_maps: rgba and quantized differ in shape');
    var W1 = Math.max(w - 1, 0), H1 = Math.max(h - 1, 0), W2 = Math.max(w - 2, 0), H2 = Math.max(h - 2, 0);
    var dqx = new Float32Array(h * W1), dqy = new Float32Array(H1 * w);
    var cox = new Float32Array(h * W2), coy = new Float32Array(H2 * w);
    for (y = 0; y < h; y++) for (x = 0; x < W1; x++) dqx[y * W1 + x] = d1mag(q.d, (y * w + x + 1) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < H1; y++) for (x = 0; x < w; x++) dqy[y * w + x] = d1mag(q.d, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < h; y++) for (x = 0; x < W2; x++) cox[y * W2 + x] = d2mag(o.d, (y * w + x + 2) * cn, (y * w + x + 1) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < H2; y++) for (x = 0; x < w; x++) coy[y * w + x] = d2mag(o.d, ((y + 2) * w + x) * cn, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
    return {
      dqx: { d: dqx, w: W1, h: h }, dqy: { d: dqy, w: w, h: H1 },
      cox: { d: cox, w: W2, h: h }, coy: { d: coy, w: w, h: H2 }
    };
  }

  /* seg.sum(axis=0) of the (rows y0..y1, cols x0..x1) block of `dmap`
   * (axis=0) or of dmap.T (axis=1), float32. The first is a sequential row
   * accumulation over a C array; the second sums the transposed view's
   * axis 0, which is the base's contiguous axis, so it is pairwise. */
  function segColSums(dmap, axis, y0, y1, x0, x1) {
    var cols = x1 - x0, rows = y1 - y0, out = new Float32Array(cols), c, r;
    if (axis === 1) {
      var bw = dmap.w;
      for (c = 0; c < cols; c++) {
        if (SEM.layoutSumOrder) {
          out[c] = PF.pairwiseSum(dmap.d, (x0 + c) * bw + y0, rows, true);
        } else {
          var acc = 0;
          for (r = 0; r < rows; r++) acc = fr(acc + dmap.d[(x0 + c) * bw + y0 + r]);
          out[c] = acc;
        }
      }
    } else {
      var w = dmap.w;
      var sums = colSumsF32(rows, cols, function (rr, cc) { return dmap.d[(y0 + rr) * w + x0 + cc]; });
      for (c = 0; c < cols; c++) out[c] = sums[c];
    }
    return out;
  }

  /* Peak lists for 2D tiles of a gradient map.
   *
   * axis=0: peaks along x within each tile (dmap rows summed).
   * Returns [(positions, heights, tile_extent), ...] with positions in
   * absolute axis coordinates. Local tiles keep their own grid phase, which
   * is what sprite sheets and heavily warped images need. */
  function _tile_peaks(dmap, axis, offset, max_tiles) {
    if (offset === undefined || offset === null) offset = 1;
    if (max_tiles === undefined || max_tiles === null) max_tiles = 360;
    var H = axis === 1 ? dmap.w : dmap.h, W = axis === 1 ? dmap.h : dmap.w;
    var tw = PF.clipScalar(Math.floor(W / 6), 48, 192), th = PF.clipScalar(Math.floor(H / 6), 48, 192);
    var tiles = [], y0, x0, i;
    var yEnd = Math.max(H - Math.floor(th / 2), 1), xEnd = Math.max(W - Math.floor(tw / 2), 1);
    for (y0 = 0; y0 < yEnd; y0 += th) {
      for (x0 = 0; x0 < xEnd; x0 += tw) {
        var y1 = Math.min(y0 + th, H), x1 = Math.min(x0 + tw, W);
        if (y1 <= y0 || x1 <= x0) continue;                 // seg.size == 0
        var prof = segColSums(dmap, axis, y0, y1, x0, x1);
        var scale = PF.percentile(prof, 95, 'f4');
        if (scale <= 0) continue;
        var norm = new Float32Array(prof.length);
        for (i = 0; i < prof.length; i++) norm[i] = PF.clipScalar(fr(prof[i] / scale), 0, 1.5);
        var fp = PF.find_peaks(norm, { height: 0.2, distance: 2 });
        if (fp.peaks.length < 4) continue;
        var pos = new Float64Array(fp.peaks.length);
        for (i = 0; i < pos.length; i++) pos[i] = fp.peaks[i] + x0 + offset;
        tiles.push([pos, fp.properties.peak_heights, prof.length]);
      }
    }
    if (tiles.length > max_tiles) {
      var li = PF.linspace(0, tiles.length - 1, max_tiles), sel = [];
      for (i = 0; i < li.length; i++) sel.push(tiles[Math.trunc(li[i])]);
      tiles = sel;
    }
    return tiles;
  }

  /* Stouffer-combined per-tile Rayleigh coherence at `step`.
   *
   * Every tile gets its own phase; only tiles with enough peaks vote. */
  function _tiles_ray_z(tiles, step) {
    if (!tiles || !tiles.length || step < 2.0) return 0.0;
    var zs = [];
    for (var t = 0; t < tiles.length; t++) {
      var p = tiles[t][0], h = tiles[t][1], ext = tiles[t][2];
      if (step > ext / 3 || p.length < 4) continue;
      var res = resultantOf(p, h, step);
      var hs = PF.sum(h);
      var R = PF.cabs(res.re, res.im) / (hs + 1e-9);
      var n_eff = C._libm.pow2(hs) / (sumSq(h) + 1e-9);
      var phase = phaseOf(res, step);
      var n_slots = Math.max(1, Math.trunc(ext / step));
      var occ = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);
      // centre so that noise tiles average to ~0 instead of diluting
      zs.push(Math.sqrt(2.0 * n_eff) * R * occ - 1.0);
    }
    if (zs.length < 2) return 0.0;
    return PF.sum(Float64Array.from(zs)) / Math.sqrt(zs.length);
  }

  /* Candidate steps from the distribution of per-tile peak spacings. */
  function _tile_spacing_modes(tiles, min_step, max_step, top) {
    if (top === undefined || top === null) top = 3;
    var votes = [], t, i;
    for (t = 0; t < (tiles || []).length; t++) {
      var p = tiles[t][0];
      if (p.length < 5) continue;
      var sp = [];
      for (i = 1; i < p.length; i++) {
        var d = p[i] - p[i - 1];
        if (d >= min_step * 0.7 && d <= max_step * 1.4) sp.push(d);
      }
      if (sp.length >= 3) votes.push(PF.median(Float64Array.from(sp), 'f8'));
    }
    if (votes.length < 4) return [];
    var out = [], hist_vals = votes.slice();
    for (var k = 0; k < top; k++) {
      if (hist_vals.length < 3) break;
      var med = PF.median(Float64Array.from(hist_vals), 'f8');
      out.push(med);
      hist_vals = hist_vals.filter(function (v) { return Math.abs(v - med) > 0.75; });
    }
    return out;
  }

  /* Welch-averaged power spectrum of gradient scanline groups.
   *
   * Magnitude spectra are phase-free, so mushy, warped, per-sprite-shifted
   * grids all contribute power at the same frequency comb k/step. Rows are
   * summed in small groups (local phase is coherent over a few rows even
   * under warp), Hann-windowed, and averaged. Returns (freqs, power). */
  function _axis_spectrum(dmaps, axis, row_group, max_win) {
    if (row_group === undefined || row_group === null) row_group = 4;
    if (max_win === undefined || max_win === null) max_win = 1024;
    var specs = null, count = 0, win = 0, i;
    for (var m = 0; m < dmaps.length; m++) {
      var dmap = dmaps[m];
      var H = axis === 1 ? dmap.w : dmap.h, W = axis === 1 ? dmap.h : dmap.w;
      win = Math.trunc(Math.min(W, max_win));
      if (win < 32) continue;
      var window = PF.hanning(win);
      var hop = Math.max(Math.floor(win / 2), 1);
      var seg = new Float64Array(win);
      for (var y0 = 0; y0 < H - row_group + 1; y0 += row_group) {
        var prof = segColSums(dmap, axis, y0, y0 + row_group, 0, W);
        var mu = PF.mean(prof);                            // float32 mean
        for (i = 0; i < prof.length; i++) prof[i] = fr(prof[i] - mu);
        for (var x0 = 0; x0 < W - win + 1; x0 += hop) {
          for (i = 0; i < win; i++) seg[i] = prof[x0 + i] * window[i];
          var F = PF.rfft(seg);
          var sp = new Float64Array(F.length), a;
          for (i = 0; i < F.length; i++) { a = PF.cabs(F.re[i], F.im[i]); sp[i] = a * a; }
          if (specs === null) specs = sp;
          else for (i = 0; i < sp.length; i++) specs[i] = specs[i] + sp[i];   // specs + sp
          count++;
        }
      }
    }
    if (specs === null || count === 0) return [new Float64Array([0.0]), new Float64Array([0.0])];
    var freqs = PF.rfftfreq(win);
    var power = new Float64Array(specs.length);
    for (i = 0; i < specs.length; i++) power[i] = specs[i] / count;
    return [freqs, power];
  }

  /* Smooth local background of a power spectrum (median filter). */
  function _spectral_background(power) {
    var k = Math.max(5, Math.floor(power.length / 24));
    if (k % 2 === 0) k += 1;
    return PF.median_filter(power, k, { mode: 'nearest' });
  }

  /* Prominence (z-like) of the spectral peak at frequency 1/step. */
  function _spectral_z(freqs, power, bg, step) {
    if (step < 2.0 || freqs.length < 8) return 0.0;
    var f = 1.0 / step;
    if (f <= freqs[1] || f >= freqs[freqs.length - 1]) return 0.0;
    // sample peak power with +-1 bin tolerance; log-ratio scale so the
    // score is commensurate with the comb/Rayleigh z channels
    var idx = PF.searchsorted(freqs, f);
    var lo = Math.max(1, idx - 1), hi = Math.min(power.length - 1, idx + 1), i;
    var p = power[lo];
    for (i = lo + 1; i <= hi; i++) if (power[i] > p || power[i] !== power[i]) p = power[i];
    var b = bg[idx] + 1e-12;
    var ratio = pyMax(p / b, 1e-6);
    return 6.0 * C._libm.log10(ratio);
  }

  /* Fundamental-period candidates: strong spectral peaks, preferring the
   * lowest-frequency member of each harmonic comb. */
  function _spectral_candidates(freqs, power, bg, min_step, max_step, top) {
    if (top === undefined || top === null) top = 4;
    if (freqs.length < 8) return [];
    var n = power.length, resid = new Float64Array(n), i;
    for (i = 0; i < n; i++) resid[i] = 6.0 * C._libm.log10(PF.npMaximum(power[i], 1e-12) / (bg[i] + 1e-12));
    var fp = PF.find_peaks(resid, { height: 4.0 });
    if (fp.peaks.length === 0) return [];
    var heights = [], periods = [];
    for (i = 0; i < fp.peaks.length; i++) {
      var fq = freqs[fp.peaks[i]];
      var per = fq > 0 ? 1.0 / PF.npMaximum(fq, 1e-9) : 0.0;
      if (per >= min_step && per <= max_step) { heights.push(fp.properties.peak_heights[i]); periods.push(per); }
    }
    if (!periods.length) return [];
    var order = argsortNeg(Float64Array.from(heights));
    var cands = [];
    for (var oi = 0; oi < order.length; oi++) {
      var s = periods[order[oi]];
      // skip if s is a harmonic (integer divisor) of an already-kept step
      var is_harm = false;
      for (var c = 0; c < cands.length; c++) {
        var ratio = cands[c] / s, rr = PF.rint(ratio);
        if (Math.abs(ratio - rr) < 0.06 && rr >= 2) { is_harm = true; break; }
      }
      if (!is_harm) cands.push(s);
      if (cands.length >= top) break;
    }
    // also offer the *longest* period whose comb members appear: for each
    // kept candidate, check small multiples with spectral support
    var extra = [], mults = [2, 3, 4, 5];
    for (var k = 0; k < cands.length; k++) {
      for (var mi = 0; mi < mults.length; mi++) {
        var sm = cands[k] * mults[mi];
        if (sm > max_step) break;
        if (_spectral_z(freqs, power, bg, sm) > 3.0) extra.push(sm);
      }
    }
    return cands.concat(extra);
  }

  function bandRows(bands) {
    if (bands === null || bands === undefined) return [];
    if (Array.isArray(bands)) return bands.slice();
    check(bands.d && bands.d.length === bands.w * bands.h, '_AxisEvidence: bands must be {d, w, h}, an array of rows, or null');
    var rows = [], b;
    for (b = 0; b < bands.h; b++) rows.push(bands.d.subarray(b * bands.w, (b + 1) * bands.w));
    return rows;
  }

  /* All periodicity evidence for one axis of one signal type.
   *
   * Holds the global profile plus B band-restricted profiles. Scoring a
   * candidate step combines per-band scores (each band free to choose its own
   * phase, via comb or Rayleigh) with a Stouffer sum: warped images stay
   * phase-coherent *within* a band even when global coherence is gone, so
   * this dominates a global comb whenever warp exists, while equalling it on
   * rigid grids. */
  function _AxisEvidence(profile, bands, tiles, spectrum, extra_z, extra_candidates) {
    this.extra_z = (extra_z === undefined) ? null : extra_z;
    this.extra_candidates = (extra_candidates && extra_candidates.length) ? extra_candidates : [];
    this.profile = profile;
    this.pp_global = new _PooledProfile(profile);
    this.bands = bandRows(bands);
    this.pps = this.bands.map(function (b) { return new _PooledProfile(b); });
    this.tiles = (tiles && tiles.length) ? tiles : [];
    if (spectrum !== null && spectrum !== undefined) {
      this.freqs = spectrum[0];
      this.power = spectrum[1];
      this.bg = _spectral_background(this.power);
    } else {
      this.freqs = this.power = this.bg = null;
    }
    // cached peak lists for the cheap fractional sweep
    this._peaks = [];
    var profs = [profile].concat(this.bands);
    for (var i = 0; i < profs.length; i++) {
      var norm = _normalise(profs[i]);
      var fp = PF.find_peaks(norm.subarray(1, norm.length - 1), { height: 0.15, distance: 2 });
      var p = new Float64Array(fp.peaks.length);
      for (var j = 0; j < p.length; j++) p[j] = fp.peaks[j] + 1;
      this._peaks.push([p, fp.properties.peak_heights, norm.length - 1]);
    }
  }

  /* (score, phase) for a candidate step. */
  _AxisEvidence.prototype.score = function (step) {
    var g = _comb_score(this.pp_global, step), gz = g[0], gp = g[1];
    var gr = _rayleigh_score(this.profile, step);
    if (gr[0] > gz) { gz = gr[0]; gp = gr[1]; }

    if (this.pps.length >= 2) {
      var zs = new Float64Array(this.pps.length), phs = [];
      for (var i = 0; i < this.pps.length; i++) {
        var c = _comb_score(this.pps[i], step), cz = c[0], cp = c[1];
        var r = _rayleigh_score(this.bands[i], step);
        if (r[0] > cz) { cz = r[0]; cp = r[1]; }
        zs[i] = cz;
        phs.push(cp);
      }
      var zb = PF.sum(zs) / Math.sqrt(zs.length);
      if (zb > gz) { gz = zb; gp = phs[PF.argmax(zs)]; }
    }
    var tz = _tiles_ray_z(this.tiles, step);
    if (tz > gz) gz = tz;  // tile phases are local; keep the best global phase
    if (this.freqs !== null) {
      var sz = _spectral_z(this.freqs, this.power, this.bg, step);
      if (sz > gz) gz = sz;
    }
    if (this.extra_z !== null) {
      var xz = this.extra_z(step);
      if (xz > gz) gz = xz;
    }
    return [gz, gp];
  };

  _AxisEvidence.prototype.candidate_steps = function (min_step, max_step) {
    var cands = _spacing_candidates(this.profile, min_step, max_step), i;
    for (i = 0; i < this.bands.length; i++) cands = cands.concat(_spacing_candidates(this.bands[i], min_step, max_step));
    cands = cands.concat(_tile_spacing_modes(this.tiles, min_step, max_step));
    if (this.freqs !== null) cands = cands.concat(_spectral_candidates(this.freqs, this.power, this.bg, min_step, max_step));
    cands = cands.concat(this.extra_candidates.filter(function (s) { return min_step <= s && s <= max_step; }));
    cands = cands.concat(this.sweep_candidates(min_step, max_step));
    return cands;
  };

  /* Cheap Rayleigh coherence from cached peaks, Stouffer over bands. */
  _AxisEvidence.prototype._ray_quick = function (step) {
    var zs = [];
    for (var i = 0; i < this._peaks.length; i++) {
      var p = this._peaks[i][0], h = this._peaks[i][1], n = this._peaks[i][2];
      if (p.length < 5 || step > n / 4) { zs.push(0.0); continue; }
      var res = resultantOf(p, h, step);
      var hs = PF.sum(h);
      var R = PF.cabs(res.re, res.im) / (hs + 1e-9);
      var n_eff = C._libm.pow2(hs) / (sumSq(h) + 1e-9);
      var phase = phaseOf(res, step);
      var n_slots = Math.max(1, Math.trunc(n / step) - 1);
      var occ = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);
      zs.push(Math.sqrt(2.0 * n_eff) * R * occ);
    }
    var band_z = zs.length > 2 ? PF.sum(Float64Array.from(zs.slice(1))) / Math.sqrt(zs.length - 1)
      : (zs.length ? zs[0] : 0.0);
    var tile_z = _tiles_ray_z(this.tiles, step);
    return pyMax(band_z, tile_z);
  };

  /* Dense fractional sweep: integer seeds can't reach steps like 5.6 on
   * heavily degraded grids, so scan a geometric grid with the cheap
   * coherence metric and seed the full scorer from its local maxima. */
  _AxisEvidence.prototype.sweep_candidates = function (min_step, max_step, top) {
    if (top === undefined || top === null) top = 6;
    var steps = [], s = min_step, i;
    while (s <= max_step) {
      steps.push(s);
      s *= 1.02;
    }
    if (steps.length < 5) return [];
    var zs = new Float64Array(steps.length);
    for (i = 0; i < steps.length; i++) zs[i] = this._ray_quick(steps[i]);
    var order = argsortNeg(zs), out = [];
    for (var k = 0; k < order.length; k++) {
      var ix = order[k];
      if (zs[ix] <= 0) break;
      var s0 = steps[ix], dup = false;
      for (var q = 0; q < out.length; q++) if (Math.abs(s0 - out[q]) < pyMax(0.12, 0.04 * s0)) { dup = true; break; }
      if (dup) continue;
      out.push(s0);
      if (out.length >= top) break;
    }
    return out;
  };

  /* Lattice-fit refinement: global + band fits + per-tile fits.
   *
   * Tiles matter most: on sprite sheets and warped art only the local
   * phase is coherent, so per-tile fits (median-combined) recover the
   * fractional step when the global fit cannot move at all. */
  _AxisEvidence.prototype.refine = function (step) {
    var fits = [_lattice_refine(this.profile, step)], i;
    for (i = 0; i < this.bands.length; i++) fits.push(_lattice_refine(this.bands[i], step));
    var tile_fits = [];
    for (i = 0; i < this.tiles.length; i++) {
      var p = this.tiles[i][0], h = this.tiles[i][1];
      if (p.length >= 6) {
        var f = _lattice_refine_peaks(p, h, step);
        if (Math.abs(f - step) > 1e-9) tile_fits.push(f);
      }
    }
    if (tile_fits.length >= 4) fits = tile_fits;          // tiles outvote global when plentiful
    return PF.median(Float64Array.from(fits), 'f8');
  };

  /* (step, score, phase): try seed and lattice refinement, keep better.
   * stepIsNp: step is an np.float64 in the reference (steps[idx], or a
   * divisor of one); ev.refine() always returns a Python float. */
  function _evidence_refine_step(ev, step, stepIsNp) {
    stepIsNp = !!stepIsNp;
    var vals = [round4(step, stepIsNp), round4(ev.refine(step), false)], nps = [stepIsNp, false];
    var best = [step, -1e18, 0.0, stepIsNp];
    var order = pySetIter(vals);
    for (var k = 0; k < order.length; k++) {
      var s = vals[order[k]];
      var r = ev.score(s);
      if (r[0] > best[1]) best = [s, r[0], r[1], nps[order[k]]];
    }
    return best;
  }

  // ----------------------------------------------------------------- export
  C._flatten_channels = _flatten_channels;
  C.axis_profiles = axis_profiles;
  C._normalise = _normalise;
  C._PooledProfile = _PooledProfile;
  C._comb_score = _comb_score;
  C._lattice_refine_peaks = _lattice_refine_peaks;
  C._lattice_refine = _lattice_refine;
  C._rayleigh_score = _rayleigh_score;
  C._refine_step = _refine_step;
  C._spacing_candidates = _spacing_candidates;
  C.estimate_period = estimate_period;
  C.is_jpeg_suspect = is_jpeg_suspect;
  C.is_jpeg_lattice = is_jpeg_lattice;
  C._jpeg_lattice_strength = _jpeg_lattice_strength;
  C._notch_jpeg = _notch_jpeg;
  C._grad_maps = _grad_maps;
  C._tile_peaks = _tile_peaks;
  C._tiles_ray_z = _tiles_ray_z;
  C._tile_spacing_modes = _tile_spacing_modes;
  C._axis_spectrum = _axis_spectrum;
  C._spectral_background = _spectral_background;
  C._spectral_z = _spectral_z;
  C._spectral_candidates = _spectral_candidates;
  C._AxisEvidence = _AxisEvidence;
  C._evidence_refine_step = _evidence_refine_step;
  C._latticeRefineEx = latticeRefineEx;

  PF.versionChannelsA = 'pf-30-channels-a/1';
})();

/* ==== pf-31-channels-b.js ========================================= */
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
  PF.two_stage_pack = function (rgba, cols, rows, k_colors, opts) {
    need('kmeans_quantize', 'pf-11-quantize.js');
    var s = imgShape(rgba, 'PF.two_stage_pack'), w = s.w, h = s.h, cn = s.cn, d = s.d, N = w * h;
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.two_stage_pack: cols and rows must be >= 1');
    if (k_colors === undefined || k_colors === null) k_colors = 0;
    opts = opts || {};
    /* WHERE THIS PORT DEPARTS FROM THE REFERENCE, ON PURPOSE (2026-09-18).
       The reference lets every pixel vote for a cell and averages the
       winning pixels into its colour. Measured on 311 real traits at 8px:
       transparent pixels (black by the time a browser canvas has decoded
       them) won the vote in half-covered edge cells and painted them
       black on 116 files (chains/Cross Chain: 8 of 106 opaque cells), and
       the mean invented colours nobody drew on 141 files (94,926 colours;
       Club Penguin Iceberg went in with 115 colours and came out with
       952). So by default alpha-0 pixels neither vote nor colour, and the
       cell takes the weighted MODE of the exact visible colours carrying
       the winning label - which invents nothing, keeps the silhouette
       identical (311 of 311) and leaves art already on the grid
       byte-identical (42 of 42). opts.reference restores the reference
       rule exactly; tools/test-endtoend.cjs runs that way, so parity with
       the Python stays a measured fact rather than a memory. */
    var visibleOnly = !opts.reference;
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
        wgt[i] = (visibleOnly && cn === 4 && !d[i * 4 + 3]) ? 0 : (wy[y] * wx[x] + 1e-4);
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

    /* THE COLOUR THAT WAS ACTUALLY THERE. Per cell, the weighted mode of
       the exact RGB among the visible pixels carrying the winning label
       (weight > 0 is what "visible" means after the vote above). A tie
       goes to whichever colour reached that weight first in pixel order,
       so the answer is a function of the picture and nothing else. A cell
       with no visible winning pixel - which is a cell with no visible
       pixel at all, since the winner has positive weight - keeps the mean
       and is transparent anyway. Kept off in reference mode. */
    var modeKey = null;
    if (visibleOnly) {
      modeKey = new Int32Array(n).fill(-1);
      var tally = new Map(), bestW, bestKey, key, cw;
      for (c = 0; c < n; c++) {
        tally.clear(); bestW = -1; bestKey = -1;
        for (p = offs[c]; p < offs[c + 1]; p++) {
          q = order[p];
          if (lab[q] !== win[c] || !(wgt[q] > 0)) continue;
          b = q * cn;
          key = (d[b] << 16) | (d[b + 1] << 8) | d[b + 2];
          cw = (tally.get(key) || 0) + wgt[q];
          tally.set(key, cw);
          if (cw > bestW) { bestW = cw; bestKey = key; }
        }
        modeKey[c] = bestKey;
      }
    }

    var low = new d.constructor(n * cn), v;
    for (c = 0; c < n; c++) {
      if (modeKey && modeKey[c] >= 0) {
        low[c * cn] = (modeKey[c] >> 16) & 255;
        low[c * cn + 1] = (modeKey[c] >> 8) & 255;
        low[c * cn + 2] = modeKey[c] & 255;
        continue;
      }
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

/* ==== pf-41-reconsearch.js ======================================== */
/* pf-41-reconsearch.js - port of pixelfixer/reconsearch.py (436 lines).
 *
 * Reference docstring, kept verbatim because it is the design record:
 *
 *   Grid detection by reconstruction search ("distillability").
 *
 *   The native resolution is the smallest grid whose box-downscale -> nearest-
 *   upscale reconstruction still explains the image.  Key identity: the L2 error
 *   of that round trip equals the total *within-cell variance* under the
 *   (step, phase) grid, computable from cumulative sums of I and I^2 without
 *   ever resizing:
 *
 *       E(s, p) = sum(I^2) - sum_cells (sum_cell I)^2 / n_cell
 *
 *   Search runs per axis (cells = 1 row x band along the axis), so E_x measures
 *   only horizontal information destruction.  The image is k-means quantized
 *   first so AA/mush ramps snap to flat colors (otherwise their residual
 *   variance swamps the curve).
 *
 *   Signals:
 *     * phase contrast  c(s) = (E(s, anti-phase) - E(s, best-phase)) / (sum):
 *       ~0 below the true step (any phase subdivides cells), peaked where the
 *       grid locks on.  Contrast also peaks at DIVISORS of the true step;
 *     * reconstruction error E(s): flat-ish below the true step, jumps above.
 *
 *   Final answer: error-gated harmonic promotion over refined candidates -
 *   the largest step whose aligned reconstruction error stays near the small-
 *   step floor and whose contrast remains significant.
 *
 *   Alignment matters: a 1% step error de-phases the grid across a wide image
 *   and erases both signals.  Hence (a) tiles (row-blocks x column-segments)
 *   each pick their own phase (absorbs sprite-sheet phase shifts + slow drift),
 *   and (b) coarse peaks are refined on a dense local (s, phase) grid.
 *
 * ---------------------------------------------------------------------------
 * WHO CALLS THIS. core.py's full mode does NOT call reconsearch.detect. Its
 * _build_recon runs  ch = _prep(rgba);  ad = AxisData(ch, 0|1);
 * s_list = _s_grid(extent)[::3];  eb, er = _coarse_curves(ad, s_list);
 * trend = _trend_fn(s_list, eb)  and recon_at() then asks ad.eval_s(s) and
 * _score(eb, er, trend(s)). Measured on the example images (core.detect
 * mode="full", instrumented): dragon, frog and koi-pond reach that path (one
 * _prep, 74 coarse eval_s; frog also 13 arbitration calls); tiny, small, mid
 * and lighthouse exit at the fast consensus and never call this module.
 * detect() below is the module's own entry point and is ported and measured
 * too.
 *
 * THE RNG. _quantize reaches cv2.kmeans, but unlike quantize.py it SEEDS
 * OpenCV's generator first (cv2.setRNGSeed(12345 + seed)) and draws its
 * sample from np.random.default_rng(seed), so its result does not depend on
 * what ran earlier in the process: the parity dump runs _prep again after
 * core.detect and R.detect have drawn from every generator in the process,
 * and got the same bytes back on 13 of 13 cases (it records that; both
 * sides still run one case per process). What it DOES do is move the generator it
 * seeded, and which generator that is matters to the NEXT unseeded kmeans:
 * OpenCV's theRNG() is THREAD-LOCAL. Measured (cv2 5.0.0): a setRNGSeed on
 * a worker thread leaves the main thread's stream untouched, and
 * reconsearch._prep on a worker leaves it untouched while _prep on the same
 * thread moves it. core.py's default path (low_memory=False) runs
 * _build_recon on a ThreadPoolExecutor worker, so there reconsearch never
 * touches the generator that api.process's reconstruction later draws from;
 * with low_memory=True it runs on the main thread and does. JS has one
 * generator (PF.theRNG), so the choice is the caller's:
 *   _prep(rgba)                     seeds PF's global generator, as a call
 *                                   on the reference's main thread does
 *                                   (reconsearch.detect, low_memory=True).
 *   _prep(rgba, {rng: new PF.RNG()}) seeds and draws from a private one, as
 *                                   core's default worker-thread call does -
 *                                   the global is left exactly where it was.
 *
 * NUMERIC MODEL. Every item below was measured against numpy 2.5.3 /
 * cv2 5.0.0 in the reference venv (tools/parity-reconsearch.py records the
 * probes in the fixture's meta), not inferred:
 *   - NEP 50: a Python float next to a float32 array is cast to float32 and
 *     the op runs in float32: a/255.0, 2.0*(blk@C.T), np.maximum(wds, 1e-3)
 *     (the floor is fround(1e-3)), cov / n. Math.fround(x op y) of two
 *     float32 values IS the float32 op for + - * / (double rounding is
 *     innocuous at 53 >= 2*24+2 bits).
 *   - float32 matmuls are OpenBLAS kernels on the reference CPU and come
 *     from pf-06-linalg.js: blk @ centers.T and x @ evecs are sgemm (an FMA
 *     chain; sgemv when the last 262144-row block has ONE row, reachable at
 *     e.g. 481x545 px), x.T @ x is ssyrk (K-blocked at 512). eigh of the
 *     float32 3x3 covariance runs dsyevd in float64 and is cast back.
 *   - reductions follow memory layout (PF.sumAxes / PF.meanAxes /
 *     PF.add_reduceat / PF.sum, each measured by the shims): flat.mean(0) is
 *     a sequential float32 sum; a last-axis .sum() is pairwise; reduceat
 *     copies each segment's first element and pairwise-sums the rest;
 *     np.cumsum is sequential IN float32 (a float64 cumsum cast back is a
 *     different array - see _semantics.cumsumF32). The trap this module
 *     adds: in energy_tiles_multi the LAST axis of en is NOT the fast one -
 *     S[:, idx, :] is a fancy index on the middle axis and numpy returns it
 *     H-fastest, a layout every later op inherits - so en.sum(2) is a
 *     sequential float32 sum, not the pairwise one its shape suggests. That
 *     was the first mismatch this port had (every coarse eb/er off by
 *     ~1e-7 relative); see the loop for the measurement.
 *   - `for s0 in {a, b}` iterates in CPython's hash order, reproduced by
 *     pySetOrder2 (it orders two _align calls; it cannot change a result).
 *   - np.log is the UCRT's log (array and scalar paths identical: the probe
 *     in tools/parity-reconsearch.py finds 0 of 25116 differ, and 0 differ
 *     from math.log), which is correctly rounded on 25112 of those 25116
 *     arguments. V8's Math.log differs from it on 1011 of 25116 (an earlier
 *     40111-argument probe: 1462, including 10 of the 111 values _s_grid can
 *     produce), so this file carries its own correctly rounded log (npLog,
 *     double-double; see below), which the test checks against an exact
 *     60-digit log on all 25116. Math.pow
 *     (1.025, i) equals numpy's power (UCRT pow) for every i in 0..110,
 *     which is every exponent _s_grid can reach.
 *   - round(x, d) on a numpy float64 is numpy's rint(x*10^d)/10^d (0 of
 *     200000 differ); on a Python float it is CPython's correctly rounded
 *     round (PF.pyRound). Which one runs depends on the TYPE, so each call
 *     site below says which it has: the table keys and round(s_ax, 4) are
 *     np.float64; round(s_reg, 4) is a Python float (phase_regress returns
 *     float()).
 *   - Python int // float and float % float are fmod-based (pyFloorDiv,
 *     pyMod), not floor(a/b): W // (15*s) can differ from Math.floor(W/(15*s))
 *     when the quotient rounds up onto an integer.
 *   - Python's builtin max(a, b) keeps a unless b > a; np.maximum keeps the
 *     RIGHT operand on a tie (PF.npMaximum). Both spellings are used here.
 *   - np.argsort of the three eigenvalues: numpy's default kind is an
 *     AVX-512 network whose tie order is not portable in general, but on
 *     THREE float32 values it returned the stable order on all 27 tie
 *     patterns and on signed zeros, so PF.argsort (stable) is exact here.
 *   - argmax takes the FIRST maximum; sorted()/list.sort are stable.
 *
 * WHERE THIS IS EXACT, AND WHERE IT IS NOT. Measured by
 * tools/test-reconsearch.cjs against tools/parity-reconsearch.py, one case
 * per process on both sides, on 13 cases: the 3 fixtures and 4 example
 * images, plus 6 synthetic ones built to reach paths the examples do not
 * (an alpha channel, a greyscale covariance, 481x545 px whose last k-means
 * block is one row, a 90x20 strip, 2 colours, an axis with no signal).
 *   - _prep: the channel stack is bit-exact on 13/13, and so are its
 *     intermediates (sample indices, k, centres, labels, mean, covariance,
 *     eigen-decomposition, component order).
 *   - AxisData, core.py's _build_recon sequence, and a replay of every call
 *     core.detect(mode="full") made into this module (dragon 74, frog 113,
 *     koi-pond 74, synth_hbands 113 calls): bit-exact.
 *   - detect(): every internal call, compared one by one in order (all
 *     eval_s, trend and _score calls, every _refine, the table,
 *     phase_regress, _align, _detect_axis) and the result: bit-exact on
 *     12/13. On synth_alpha 4 intermediate values are not: trend(s) at
 *     s = 16.453892223009507 on each axis and the 2 scores built from it
 *     differ by one ulp (max |diff| 5.6e-17). The reason is on the
 *     reference's side: np.log(s) there is the UCRT's 2.800562058525305,
 *     a misrounding of the exact 2.80056205852530459834..., whose correctly
 *     rounded value 2.8005620585253044 is what this port computes. The
 *     UCRT's log is closed source, so its misroundings (4 of 25116 probe
 *     arguments) cannot be reproduced, only counted; the test proves each
 *     such difference at the call - substituting the reference's own log
 *     reproduces the reference's value bit for bit - rather than excusing
 *     it. No step, count, phase, confidence, candidate, table entry or
 *     refinement moved.
 *
 * API: PF.reconsearch.{_quantize, _pca_channels, _prep, AxisData, _s_grid,
 * _coarse_curves, _trend_fn, _score, _peaks, _refine, _build_table, _align,
 * _detect_axis, detect} - the reference's names. Internal calls go through
 * the namespace object (like Python's module-global lookup) so a test can
 * wrap any of them, and AxisData's methods call each other through `this`.
 * Tuples become arrays in the reference's order (eval_s -> [eb, er],
 * _refine -> [sc, s, eb, er], _align -> [s, e], _detect_axis -> [s, sc, eb,
 * cands, trend]); the table dict becomes an insertion-ordered array of
 * {key, val}. An image is {d, w, h, cn: 4} RGBA (the pf-50-core contract);
 * a channel stack is {d: Float32Array(h*w*c), h, w, c}, flat.
 *
 * No imports, no exports, ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var fr = Math.fround;

  var R = {};                        // the namespace; filled in at the bottom
  PF.reconsearch = R;

  function check(cond, msg) { if (!cond) throw new Error('PF.reconsearch: ' + msg); }
  function need(name) {
    if (typeof PF[name] !== 'function') {
      throw new Error('PF.reconsearch needs PF.' + name + ' (load pf-00 .. pf-06 before pf-41)');
    }
  }

  /* Negative-control switches. Each names a MEASURED semantic and its
   * "obvious" rival; tools/test-reconsearch.cjs flips them one at a time
   * and requires the parity test to go red. Never set outside a test. */
  var SEM = {
    log: 'cr',            // 'cr' = correctly rounded (== UCRT), 'platform' = Math.log
    cumsumF32: true,      // np.cumsum of float32 accumulates in float32
    alphaScaleF32: true,  // a / 255.0 runs in float32 (NEP 50)
    enRowSequential: true // en.sum(2) is sequential (en's layout), not pairwise
  };

  /* ================================================================== *
   * Scalar semantics the reference gets from Python and numpy
   * ================================================================== */

  /* Python's builtin max(a, b) / min(a, b): the first argument unless the
   * second compares strictly greater / smaller. */
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }

  /* Python float // and numpy floor_divide for float64 (CPython
   * float_floor_div == numpy npy_divmod): fmod-based, then snapped. JS `%`
   * on doubles is exactly C fmod. */
  function pyFloorDiv(a, b) {
    var mod = a % b, div;
    if (b === 0) return a / b;
    div = (a - mod) / b;
    if (mod) {
      if ((b < 0) !== (mod < 0)) { mod += b; div -= 1.0; }
    }
    if (div) {
      var fd = Math.floor(div);
      if (div - fd > 0.5) fd += 1.0;
      return fd;
    }
    var q = a / b;
    return (q < 0 || Object.is(q, -0)) ? -0 : 0;
  }

  /* Python float % and numpy remainder for float64 (same npy_divmod). */
  function pyMod(a, b) {
    var mod = a % b;
    if (b === 0) return mod;
    if (mod) {
      if ((b < 0) !== (mod < 0)) mod += b;
    } else {
      mod = (b < 0) ? -0 : 0;           // copysign(0, b)
    }
    return mod;
  }

  /* round(x, d) of a numpy float64: np.round -> multiply by 10^d, rint
   * (half to even), divide. NOT CPython's round, which works on the exact
   * decimal expansion (PF.pyRound). */
  function npRound(x, d) {
    var f = Math.pow(10, d);            // numpy's power_of_ten table: exact
    return PF.rint(x * f) / f;
  }

  /* ------------------------------------------------------------------ *
   * np.log (numpy -> UCRT log) as a CORRECTLY ROUNDED natural log.
   *
   * Why not Math.log: V8's log differs from the UCRT's on 3.6% of
   * arguments, and _trend_fn is built from logs - ls = np.log(s_list)
   * decides which coarse errors share a median window, and trend(s) =
   * np.interp(np.log(s), ls, trend) scales every score the table ranks.
   * The UCRT's log is not documented as correctly rounded but measured as
   * such on 40103 of 40111 arguments, so a correctly rounded log is the
   * closest reproducible model of it; where the UCRT itself misrounds
   * (0.02%) this cannot match it, and the parity test counts every
   * log call it replays so any such hit is visible rather than silent.
   *
   * Method: x = m * 2^k with m in (sqrt(1/2), sqrt(2)]; log(m) =
   * 2*atanh(u), u = (m-1)/(m+1) (|u| <= 0.1716), summed in double-double
   * (~106 bits) to u^49, then k*ln2 in double-double; the rounding to a
   * double happens once, at the end. m - 1 is exact (Sterbenz); m + 1 is
   * carried as a double-double. The truncated tail is below 2^-110 of the
   * result, so only a true value within ~2^-100 of a rounding midpoint
   * could be misrounded.
   * ------------------------------------------------------------------ */
  var SPLITTER = 134217729;             // 2^27 + 1 (Veltkamp split)
  function twoSum(a, b) { var s = a + b, bb = s - a; return [s, (a - (s - bb)) + (b - bb)]; }
  function quickTwoSum(a, b) { var s = a + b; return [s, b - (s - a)]; }
  function twoProd(a, b) {
    var p = a * b, t, ah, al, bh, bl;
    t = SPLITTER * a; ah = t - (t - a); al = a - ah;
    t = SPLITTER * b; bh = t - (t - b); bl = b - bh;
    return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
  }
  function ddAdd(a, b) {
    var s = twoSum(a[0], b[0]), t = twoSum(a[1], b[1]);
    s = quickTwoSum(s[0], s[1] + t[0]);
    return quickTwoSum(s[0], s[1] + t[1]);
  }
  function ddMul(a, b) {
    var p = twoProd(a[0], b[0]);
    return quickTwoSum(p[0], p[1] + (a[0] * b[1] + a[1] * b[0]));
  }
  function ddMulD(a, d) {
    var p = twoProd(a[0], d);
    return quickTwoSum(p[0], p[1] + a[1] * d);
  }
  function ddDiv(a, b) {
    var q1 = a[0] / b[0];
    var r = ddAdd(a, ddMulD(b, -q1));
    var q2 = r[0] / b[0];
    r = ddAdd(r, ddMulD(b, -q2));
    var q3 = r[0] / b[0];
    return ddAdd(quickTwoSum(q1, q2), [q3, 0]);
  }
  var LN2_DD = [0.6931471805599453, 2.3190468138462996e-17];
  var ATANH_N = 24, INV_ODD = [];
  (function () { for (var j = 0; j <= ATANH_N; j++) INV_ODD.push(ddDiv([1, 0], [2 * j + 1, 0])); })();

  function crLog(x) {
    if (!(x > 0) || x === Infinity) return Math.log(x);   // NaN, <= 0, +inf: exact answers
    var k = 0, m = x, e;
    if (m < 2.2250738585072014e-308) { m *= 18014398509481984; k = -54; }  // lift subnormals by 2^54
    e = Math.floor(Math.log2(m));
    m = m / Math.pow(2, e); k += e;                        // exact: a power-of-two scaling
    while (m >= 2) { m /= 2; k++; }                        // Math.log2 may be off by one at 2^e
    while (m < 1) { m *= 2; k--; }
    if (m > Math.SQRT2) { m /= 2; k++; }
    var u = ddDiv([m - 1, 0], twoSum(m, 1));
    var u2 = ddMul(u, u), s = INV_ODD[ATANH_N], j;
    for (j = ATANH_N - 1; j >= 0; j--) s = ddAdd(ddMul(s, u2), INV_ODD[j]);
    var r = ddMul(u, s);
    r = [2 * r[0], 2 * r[1]];
    if (k !== 0) r = ddAdd(ddAdd(twoProd(k, LN2_DD[0]), [k * LN2_DD[1], 0]), r);
    return r[0] + r[1];
  }

  function npLog(x) { return SEM.log === 'platform' ? Math.log(x) : crLog(x); }

  /* ------------------------------------------------------------------ *
   * Iteration order of the Python set {a, b} of two positive floats.
   *
   * _detect_axis loops `for s0 in {round(s_ax, 4), round(s_reg, 4)}`. Which
   * start is aligned first cannot change its answer - min() over (e, s)
   * tuples depends on order only when two tuples are identical, and then
   * either is the same value - but it decides the ORDER of the 18 eval_s
   * calls _align makes, and the parity test compares the reference's calls
   * one by one. Measured: dragon and koi-pond iterate the second-inserted
   * value first. So this reproduces CPython 3.12: _Py_HashDouble (28 bits
   * at a time into a 61-bit Mersenne residue, then rotated by the exponent)
   * and set_add_entry on the 8-slot small table (slot = hash & 7; on a
   * collision perturb >>= 5, slot = (5*slot + 1 + perturb) & 7), iterated
   * in slot order. Model checked against CPython on 400000 pairs (hash and
   * order), and by the probe in tools/test-reconsearch.cjs.
   * The 61-bit residue is held as two exact limbs, xh (33 bits) and xl
   * (28 bits): no BigInt (ES2017).
   * ------------------------------------------------------------------ */
  var T28 = 268435456, T33 = 8589934592;
  function pyFloatHashBits(v) {                 // v finite and > 0; returns bits 0..63, LSB first
    var e = Math.floor(Math.log2(v)) + 1, m = v / Math.pow(2, e), xh = 0, xl = 0, y, nh;
    while (m >= 1) { m /= 2; e++; }              // frexp: v = m * 2^e, m in [0.5, 1)
    while (m < 0.5) { m *= 2; e--; }
    while (m) {
      nh = (xh % 32) * T28 + xl;                 // x = ((x << 28) & M) | (x >> 33)
      xl = Math.floor(xh / 32); xh = nh;
      m *= T28; e -= 28;
      y = Math.floor(m); m -= y;
      xl += y;                                   // x += y
      if (xl >= T28) { xl -= T28; xh += 1; }
      if (xh > T33 - 1 || (xh === T33 - 1 && xl === T28 - 1)) {   // if x >= M: x -= M
        xl -= T28 - 1; xh -= T33 - 1;
        if (xl < 0) { xl += T28; xh -= 1; }
      }
    }
    e = e >= 0 ? e % 61 : 60 - ((-1 - e) % 61);
    var bits = new Array(64), i, rot = new Array(64);
    for (i = 0; i < 28; i++) { bits[i] = xl % 2; xl = Math.floor(xl / 2); }
    for (i = 28; i < 61; i++) { bits[i] = xh % 2; xh = Math.floor(xh / 2); }
    for (i = 0; i < 64; i++) rot[i] = 0;
    for (i = 0; i < 61; i++) rot[(i + e) % 61] = bits[i];   // ((x << e) & M) | (x >> (61 - e))
    return rot;
  }
  function pySetOrder2(a, b) {
    if (a === b) return [a];
    var ha = pyFloatHashBits(a), hb = pyFloatHashBits(b);
    var low3 = function (h, k) { return (k < 64 ? h[k] : 0) + 2 * (k + 1 < 64 ? h[k + 1] : 0) + 4 * (k + 2 < 64 ? h[k + 2] : 0); };
    var ia = low3(ha, 0), i = low3(hb, 0), sh = 0;
    while (i === ia) { sh += 5; i = (i * 5 + 1 + low3(hb, sh)) & 7; }
    return ia < i ? [a, b] : [b, a];
  }

  /* ================================================================== *
   * preprocess
   * ================================================================== */

  var CRIT_TYPE = 3;                    // cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER

  /**
   * _quantize(rgb, k=KMEANS_K, sample=48000, seed=0)
   * "k-means quantize premultiplied RGB; return centroid-color image."
   *
   * @param {Float32Array} rgb  h*w*3, row-major (the reference's HxWx3)
   * @param {object} [opts]  {rng: PF.RNG} seed and use a private generator
   *   instead of PF's global one (see THE RNG in the header); {diag: {}}
   *   receives idx, count, k, centers, labels for a parity test.
   * @returns {Float32Array} h*w*3, each pixel its centroid's colour
   */
  function _quantize(rgb, h, w, k, sample, seed, opts) {
    need('default_rng'); need('kmeans'); need('matmulF32'); need('sumAxes');
    if (k === undefined || k === null) k = R.KMEANS_K;
    if (sample === undefined || sample === null) sample = 48000;
    if (seed === undefined || seed === null) seed = 0;
    opts = opts || {};
    var n = h * w;
    check(rgb instanceof Float32Array && rgb.length === n * 3, '_quantize: rgb must be Float32Array(h*w*3)');
    var rng = PF.default_rng(seed);
    // cv2.kmeans uses OpenCV's global RNG;
    // without this, results depend on how many images ran earlier
    var cvrng;
    if (opts.rng) { check(opts.rng instanceof PF.RNG, '_quantize: opts.rng must be a PF.RNG'); opts.rng.setState(12345 + seed); cvrng = opts.rng; }
    else { PF.setRNGSeed(12345 + seed); cvrng = PF.theRNG(); }
    var m = Math.min(sample, n);
    var idx = rng.choice(n, m, { replace: false });
    // k = min(k, max(2, len(np.unique(np.round(flat[idx][::7] / 8), axis=0))))
    // float32 / 8 is exact and np.round of it lands on integers 0..32, so a
    // row is identified exactly by one integer key.
    var seen = new Set(), t, p;
    for (t = 0; t < m; t += 7) {
      p = idx[t] * 3;
      seen.add(PF.rint(fr(rgb[p] / 8)) * 1089 + PF.rint(fr(rgb[p + 1] / 8)) * 33 + PF.rint(fr(rgb[p + 2] / 8)));
    }
    k = Math.min(k, Math.max(2, seen.size));
    var data = new Float32Array(m * 3);
    for (t = 0; t < m; t++) { p = idx[t] * 3; data[t * 3] = rgb[p]; data[t * 3 + 1] = rgb[p + 1]; data[t * 3 + 2] = rgb[p + 2]; }
    var km = PF.kmeans({ d: data, w: 3, h: m }, k, { type: CRIT_TYPE, maxCount: 25, epsilon: 0.25 }, 3, cvrng);
    var centers = km.centers.d;
    // c2 = (centers ** 2).sum(1): float32 squares, a last-axis (pairwise) sum
    var sq = new Float32Array(k * 3), cT = new Float32Array(3 * k), j;
    for (j = 0; j < k * 3; j++) sq[j] = fr(centers[j] * centers[j]);
    var c2 = PF.sumAxes(sq, [k, 3], 1).d;
    for (j = 0; j < k; j++) { cT[j] = centers[j * 3]; cT[k + j] = centers[j * 3 + 1]; cT[2 * k + j] = centers[j * 3 + 2]; }
    var out = new Int32Array(n), i0, mb, M, r, best, bv, v;
    for (i0 = 0; i0 < n; i0 += 262144) {
      mb = Math.min(262144, n - i0);
      // 2.0 * (blk @ centers.T) - c2[None, :]  -> float32 throughout (NEP 50)
      M = PF.matmulF32(rgb.subarray(i0 * 3, (i0 + mb) * 3), mb, 3, cT, k);
      for (r = 0; r < mb; r++) {
        best = 0; bv = fr(fr(2 * M[r * k]) - c2[0]);
        for (j = 1; j < k; j++) {
          v = fr(fr(2 * M[r * k + j]) - c2[j]);
          if (!(v <= bv)) { bv = v; best = j; }            // np.argmax: first maximum
        }
        out[i0 + r] = best;
      }
    }
    var q = new Float32Array(n * 3), c;
    for (i0 = 0; i0 < n; i0++) { c = out[i0] * 3; q[i0 * 3] = centers[c]; q[i0 * 3 + 1] = centers[c + 1]; q[i0 * 3 + 2] = centers[c + 2]; }
    if (opts.diag) {
      opts.diag.idx = idx; opts.diag.count = seen.size; opts.diag.k = k;
      opts.diag.centers = centers; opts.diag.labels = out;
    }
    return q;
  }

  /**
   * _pca_channels(img3, alpha, n_comp=2)
   * "Project HxWx3 onto its top PCA axes; append alpha if it varies."
   *
   * @param {Float32Array} img3   h*w*3
   * @param {Float32Array|null} alpha  h*w, or null
   * @returns {{d: Float32Array, h, w, c}} c = n_comp (+1 with alpha)
   */
  function _pca_channels(img3, h, w, alpha, n_comp, diag) {
    need('meanAxes'); need('syrkF32'); need('eigh'); need('argsort'); need('std');
    if (n_comp === undefined || n_comp === null) n_comp = 2;
    var n = h * w, i, j, t;
    check(img3 instanceof Float32Array && img3.length === n * 3, '_pca_channels: img3 must be Float32Array(h*w*3)');
    var mu = PF.meanAxes(img3, [n, 3], 0).d;                // float32 sequential sum / n
    var x = new Float32Array(n * 3);
    for (i = 0; i < n; i++) for (j = 0; j < 3; j++) x[i * 3 + j] = fr(img3[i * 3 + j] - mu[j]);
    var xtx = PF.syrkF32(x, n, 3);                           // x.T @ x -> ssyrk
    var nf = fr(Math.max(n, 1)), cov = new Float32Array(9);
    for (i = 0; i < 9; i++) cov[i] = fr(xtx[i] / nf);       // float32 / int -> float32
    var eg = PF.eigh(cov, 3);                                // float32 in -> dsyevd -> float32 out
    var order = PF.reversed(PF.argsort(eg.w)).subarray(0, n_comp);
    var E = new Float32Array(3 * n_comp);                    // evecs[:, order], row-major (3, n_comp)
    for (t = 0; t < 3; t++) for (j = 0; j < n_comp; j++) E[t * n_comp + j] = eg.v[t * 3 + order[j]];
    var comps = PF.matmulF32(x, n, 3, E, n_comp);            // (x @ evecs[:, order]) -> sgemm
    var C = n_comp, outd = comps;
    if (alpha !== null && alpha !== undefined && PF.std(alpha) > 2.0) {
      var am = PF.mean(alpha);
      C = n_comp + 1;
      outd = new Float32Array(n * C);
      for (i = 0; i < n; i++) {
        for (j = 0; j < n_comp; j++) outd[i * C + j] = comps[i * n_comp + j];
        outd[i * C + n_comp] = fr(alpha[i] - am);
      }
    }
    if (diag) { diag.mu = mu; diag.cov = cov; diag.evals = eg.w; diag.evecs = eg.v; diag.order = order; }
    return { d: outd, h: h, w: w, c: C };
  }

  /**
   * _prep(rgba) -> channel stack.
   * @param {{d: Uint8Array|Uint8ClampedArray, w, h, cn: 4}} rgba
   * @param {object} [opts] {rng, diag} - see _quantize
   */
  function _prep(rgba, opts) {
    check(rgba && rgba.d && rgba.cn === 4 && rgba.d.length === rgba.w * rgba.h * 4,
      '_prep: rgba must be {d, w, h, cn: 4} with d.length = w*h*4');
    opts = opts || {};
    var h = rgba.h, w = rgba.w, n = h * w, src = rgba.d, i, sc;
    var a = new Float32Array(n), rgb = new Float32Array(n * 3);
    for (i = 0; i < n; i++) a[i] = src[i * 4 + 3];
    for (i = 0; i < n; i++) {
      // rgba[..., :3].astype(np.float32) * (a[..., None] / 255.0): float32
      sc = SEM.alphaScaleF32 ? fr(a[i] / 255) : a[i] / 255;
      rgb[i * 3] = fr(src[i * 4] * sc);
      rgb[i * 3 + 1] = fr(src[i * 4 + 1] * sc);
      rgb[i * 3 + 2] = fr(src[i * 4 + 2] * sc);
    }
    var qd = opts.diag ? (opts.diag.quantize = {}) : null;
    var q = R._quantize(rgb, h, w, R.KMEANS_K, 48000, 0, { rng: opts.rng, diag: qd });
    var pd = opts.diag ? (opts.diag.pca = {}) : null;
    return R._pca_channels(q, h, w, a, 2, pd);
  }

  /* ================================================================== *
   * per-axis energy machinery
   * ================================================================== */

  /**
   * AxisData(ch, axis)
   * "Cumsum tables for one axis of a channel stack (rows subsampled).
   *  axis=0: analyze along the width (x); axis=1: transpose first (y)."
   */
  function AxisData(ch, axis) {
    need('linspace'); need('astypeInt'); need('cumsum'); need('add_reduceat'); need('sum');
    check(ch && ch.d instanceof Float32Array && ch.d.length === ch.h * ch.w * ch.c,
      'AxisData: ch must be {d: Float32Array(h*w*c), h, w, c}');
    check(axis === 0 || axis === 1, 'AxisData: axis must be 0 or 1');
    var C = ch.c, Hs = axis === 0 ? ch.h : ch.w, W = axis === 0 ? ch.w : ch.h;
    var rows, H, i, j, c, o, sp, v;
    if (Hs > R.MAX_ROWS) {
      rows = PF.astypeInt(PF.linspace(0, Hs - 1, R.MAX_ROWS));   // np.linspace(...).astype(int)
      H = R.MAX_ROWS;
    } else {
      rows = new Int32Array(Hs);
      for (i = 0; i < Hs; i++) rows[i] = i;
      H = Hs;
    }
    this.H = H; this.W = W; this.C = C;
    // img = ch or ch.transpose(1, 0, 2), then img[rows]
    var img = new Float32Array(H * W * C), sq = new Float32Array(H * W * C);
    for (i = 0, o = 0; i < H; i++) {
      for (j = 0; j < W; j++) {
        sp = (axis === 0 ? (rows[i] * ch.w + j) : (j * ch.w + rows[i])) * C;
        for (c = 0; c < C; c++, o++) { v = ch.d[sp + c]; img[o] = v; sq[o] = fr(v * v); }
      }
    }
    // channels are zero-mean (PCA), so float32 cumsums stay accurate
    var cs, cq;
    if (SEM.cumsumF32) {
      cs = PF.cumsum(img, [H, W, C], 1);
      cq = PF.cumsum(sq, [H, W, C], 1);
    } else {                                   // negative control: float64 accumulation, cast back
      cs = new Float32Array(PF.cumsum(new Float64Array(img), [H, W, C], 1));
      cq = new Float32Array(PF.cumsum(new Float64Array(sq), [H, W, C], 1));
    }
    var W1 = W + 1;
    this.S = new Float32Array(H * W1 * C);
    this.Q = new Float32Array(H * W1 * C);
    for (i = 0; i < H; i++) {
      this.S.set(cs.subarray(i * W * C, (i + 1) * W * C), (i * W1 + 1) * C);
      this.Q.set(cq.subarray(i * W * C, (i + 1) * W * C), (i * W1 + 1) * C);
    }
    // row blocks: phase freedom PERPENDICULAR to the analysis axis
    // (handles sprite rows at different offsets) is always safe.
    // Phase freedom ALONG the axis (column segments) absorbs step error
    // and biases the error minimum, so it is used only to LOCATE peaks
    // on wide images (where genuine drift prevents a global lock) and
    // is followed by phase-drift regression to de-bias the step.
    this.nbr = Math.max(1, Math.min(R.N_ROWBLOCKS, Math.floor(H / 48)));
    this.r_edges = PF.astypeInt(PF.linspace(0, H, this.nbr + 1));
    this._r_starts = this.r_edges.slice(0, this.nbr);           // r_edges[:-1]
    this.max_nbc = Math.max(1, Math.min(R.N_COLSEGS, Math.floor(W / 96)));
    this.seg = {};
    var Q = this.Q, S = this.S, nbc, c_edges, qcol, acc, a0, a1;
    for (nbc = 1; nbc <= this.max_nbc; nbc++) {
      c_edges = PF.astypeInt(PF.linspace(0, W, nbc + 1));
      // qcol = np.diff(Q[:, c_edges, :].astype(f64), axis=1).sum(2): the
      // float32 table values are exact in float64; the channel sum is a
      // last-axis pairwise (sequential below 8) sum from 0.
      qcol = new Float64Array(H * nbc);
      for (i = 0; i < H; i++) {
        for (j = 0; j < nbc; j++) {
          a0 = (i * W1 + c_edges[j]) * C; a1 = (i * W1 + c_edges[j + 1]) * C;
          acc = 0.0;
          for (c = 0; c < C; c++) acc = acc + (Q[a1 + c] - Q[a0 + c]);
          qcol[i * nbc + j] = acc;
        }
      }
      this.seg[nbc] = { c_edges: c_edges, q_t: PF.add_reduceat(qcol, [H, nbc], this._r_starts, 0).d };
    }
    // normalizer: total variance about per-rowblock means
    var q1 = this.seg[1].q_t, ce = this.seg[1].c_edges, en1 = new Float64Array(H), d;
    for (i = 0; i < H; i++) {
      a0 = (i * W1 + ce[0]) * C; a1 = (i * W1 + ce[1]) * C;
      acc = 0.0;
      for (c = 0; c < C; c++) { d = S[a1 + c] - S[a0 + c]; acc = acc + d * d; }
      en1[i] = acc / W;                                         // / float(W)
    }
    var red = PF.add_reduceat(en1, [H, 1], this._r_starts, 0).d;
    var tt = new Float64Array(this.nbr);
    for (i = 0; i < this.nbr; i++) tt[i] = PF.npMaximum(q1[i] - red[i], 1e-9);
    this.t_sum = PF.sum(tt);
  }

  /** "Segments hold >= min_cells cells so phase freedom can't overfit." */
  AxisData.prototype.nbc_for = function (s, min_cells) {
    if (min_cells === undefined || min_cells === null) min_cells = 15.0;
    return Math.trunc(PF.clipScalar(pyFloorDiv(this.W, min_cells * s), 1, this.max_nbc));
  };

  /**
   * energy_tiles_multi(s, phases, nbc) -> Float64Array (P, nbr, nbc) row-major
   * "Per-tile cell energies for several phases: (P, nbr, nbc).
   *
   *  Cell boundaries are FRACTIONAL: band sums come from linearly
   *  interpolated cumsums (an exact fractional box-downscale under a
   *  piecewise-constant image model).  Integer-rounded boundaries would
   *  systematically mismatch the unknown rasterization of the original
   *  upscale and shift the error minimum away from the true step."
   *
   * The reference materialises g (H x P(J+1) x C) and bs; this computes the
   * same float32 values per (row, phase) in the same order:
   *   B    = clip(phase + s*k, 0, W)                        float64
   *   wds  = float32(diff(B)); wds_safe = maximum(wds, fround(1e-3))
   *   i0   = int(clip(floor(B), 0, W-1)); f = float32(B - i0)
   *   g    = g0 + (g1 - g0) * f                             float32, 3 roundings
   *   en   = (sum_c float32(bs*bs)) / wds_safe              float32
   *   nbc == 1: en.sum(2) is a SEQUENTIAL float32 sum over J (en's memory
   *             layout decides that - see the loop), then a float64
   *             reduceat over row blocks;
   *   nbc  > 1: float32 reduceat over the column segments (cells whose
   *             centre falls past a segment edge go to the next segment;
   *             each segment is its first element + a pairwise sum of the
   *             rest, 360/360 rows measured on this layout), then the
   *             float64 reduceat over row blocks.
   */
  AxisData.prototype.energy_tiles_multi = function (s, phases, nbc) {
    var W = this.W, H = this.H, C = this.C, S = this.S, W1 = W + 1, nbr = this.nbr;
    check(this.seg[nbc], 'energy_tiles_multi: nbc ' + nbc + ' outside 1..' + this.max_nbc);
    var c_edges = this.seg[nbc].c_edges;
    var J = Math.ceil(W / s) + 2, P = phases.length, NB = J + 1;
    var B = new Float64Array(NB), wds = new Float32Array(J), i0 = new Int32Array(NB), f = new Float32Array(NB);
    var FLOOR = fr(1e-3);                                     // np.maximum(float32, 1e-3): the floor is float32
    var g = new Float32Array(NB * C), en = new Float32Array(J);
    var out = new Float64Array(P * nbr * nbc);
    var enRow = nbc === 1 ? new Float64Array(H * P) : null;
    var enSeg = nbc > 1 ? new Float64Array(H * nbc) : null;
    var idx = nbc > 1 ? new Int32Array(nbc) : null;
    var p, j, h, c, rowb, b0, g0, g1, e, bs, t, red, k;
    for (p = 0; p < P; p++) {
      for (j = 0; j < NB; j++) {
        // B = phases[:, None] + s * k[None, :], k = arange(-1, J); clip to [0, W]
        B[j] = PF.clipScalar(phases[p] + s * (j - 1), 0.0, W);
      }
      for (j = 0; j < J; j++) wds[j] = PF.npMaximum(fr(B[j + 1] - B[j]), FLOOR);
      for (j = 0; j < NB; j++) {
        i0[j] = Math.trunc(PF.clipScalar(Math.floor(B[j]), 0, W - 1));
        f[j] = fr(B[j] - i0[j]);
      }
      if (nbc > 1) {
        // centers = 0.5*(B[1:] + B[:-1]); splits = searchsorted(centers, c_edges[1:-1])
        var centers = new Float64Array(J);
        for (j = 0; j < J; j++) centers[j] = 0.5 * (B[j + 1] + B[j]);
        idx[0] = 0;
        for (k = 1; k < nbc; k++) idx[k] = PF.searchsorted(centers, c_edges[k]);
      }
      for (h = 0; h < H; h++) {
        rowb = h * W1;
        for (j = 0; j < NB; j++) {
          b0 = (rowb + i0[j]) * C;
          for (c = 0; c < C; c++) {
            g0 = S[b0 + c]; g1 = S[b0 + C + c];
            g[j * C + c] = fr(g0 + fr(fr(g1 - g0) * f[j]));
          }
        }
        for (j = 0; j < J; j++) {
          e = 0.0;
          for (c = 0; c < C; c++) { bs = fr(g[(j + 1) * C + c] - g[j * C + c]); e = fr(e + fr(bs * bs)); }
          en[j] = fr(e / wds[j]);
        }
        if (nbc === 1) {
          // en.sum(2) is a SEQUENTIAL float32 sum over J, not a pairwise one.
          // MEASURED: self.S[:, idx, :] (a fancy index on the middle axis)
          // comes back with H as its fastest memory axis (strides (8, 2880,
          // 4) on frog), numpy's K order carries that layout through g, bs
          // and en (strides (4, 178560, 1440)), so the reduced axis J is not
          // the fast one and the iterator adds whole H-runs elementwise, one
          // j at a time. Sequential matched 1632/1632 .. 4488/4488 (row,
          // phase) sums at four steps; the pairwise sum of the same row,
          // which a C-contiguous en would get, matched 246/1632.
          if (SEM.enRowSequential) {
            t = 0.0;
            for (j = 0; j < J; j++) t = fr(t + en[j]);
          } else {
            t = PF.pairwiseSum(en, 0, J, true);                // negative control only
          }
          enRow[h * P + p] = t;
        } else {
          for (k = 0; k < nbc; k++) {                            // np.add.reduceat(en[:, i, :], idx, axis=1)
            var st = idx[k], en2 = (k + 1 < nbc) ? idx[k + 1] : J;
            if (en2 <= st) t = en[st];
            else t = fr(en[st] + PF.pairwiseSum(en, st + 1, en2 - st - 1, true));
            enSeg[h * nbc + k] = t;
          }
        }
      }
      if (nbc > 1) {
        red = PF.add_reduceat(enSeg, [H, nbc], this._r_starts, 0).d;   // (nbr, nbc) float64
        out.set(red, p * nbr * nbc);
      }
    }
    if (nbc === 1) {
      red = PF.add_reduceat(enRow, [H, P], this._r_starts, 0).d;       // (nbr, P); .T -> (P, nbr, 1)
      for (p = 0; p < P; p++) for (t = 0; t < nbr; t++) out[p * nbr + t] = red[t * P + p];
    }
    return out;
  };

  /** "Phase samples ~0.5px apart (0.25px when dense), even count." */
  AxisData.prototype._n_phase = function (s, dense) {
    var n = Math.trunc(PF.clipScalar((dense ? 4.0 : 2.0) * s, 8, 40));
    return n & ~1;
  };

  function phaseGrid(s, n) {                 // np.arange(n) * (s / n)
    var ph = new Float64Array(n), step = s / n, i;
    for (i = 0; i < n; i++) ph[i] = i * step;
    return ph;
  }

  /**
   * eval_s(s, dense=False, nbc=1) -> [e_best, e_anti]
   * "(e_best, e_anti) at step s; per-(rowblock x segment) best phase.
   *  e_anti evaluates each tile at the anti-phase (best + s/2), the
   *  maximally-wrong phase.  Both normalized by total variance."
   */
  AxisData.prototype.eval_s = function (s, dense, nbc) {
    dense = !!dense;
    if (nbc === undefined || nbc === null) nbc = 1;
    var n = this._n_phase(s, dense);
    var phases = phaseGrid(s, n);
    var q_t = this.seg[nbc].q_t;
    var ens = this.energy_tiles_multi(s, phases, nbc);      // n x nbr x nbc
    var T = this.nbr * nbc, half = n >> 1, eB = new Float64Array(T), eR = new Float64Array(T);
    var t, p, ib, mp, v;
    for (t = 0; t < T; t++) {
      ib = 0; mp = ens[t];                                    // ens.argmax(0): first maximum
      for (p = 1; p < n; p++) { v = ens[p * T + t]; if (!(v <= mp)) { mp = v; ib = p; } }
      eB[t] = PF.npMaximum(q_t[t] - ens[ib * T + t], 0.0);
      eR[t] = PF.npMaximum(q_t[t] - ens[((ib + half) % n) * T + t], 0.0);
    }
    return [PF.sum(eB) / this.t_sum, PF.sum(eR) / this.t_sum];
  };

  /**
   * phase_regress(s0, n_iter=2)
   * "De-bias a step estimate from per-segment phase drift.
   *
   *  If the step is off by d, each segment's best phase advances
   *  linearly with position at slope d/s (clock recovery).  Fit the
   *  slope over unwrapped per-segment phases and correct s."
   * Returns a Python float in the reference (s = float(s0)), which is why
   * _detect_axis rounds its result with CPython's round, not numpy's.
   */
  AxisData.prototype.phase_regress = function (s0, n_iter) {
    need('sumAxes'); need('meanAxes'); need('average');
    if (n_iter === undefined || n_iter === null) n_iter = 2;
    var s = +s0, it, j, p;
    for (it = 0; it < n_iter; it++) {
      var nbc = this.nbc_for(s);
      if (nbc < 3) return s;
      var n = Math.trunc(PF.clipScalar(4.0 * s, 16, 48)) & ~1;
      var phases = phaseGrid(s, n);
      var ens = this.energy_tiles_multi(s, phases, nbc);    // n x nbr x nbc
      var seg = PF.sumAxes(ens, [n, this.nbr, nbc], 1).d;   // n x nbc
      var phi = new Float64Array(nbc), w = new Float64Array(nbc);
      var mean = PF.meanAxes(seg, [n, nbc], 0).d;
      for (j = 0; j < nbc; j++) {
        var ip = 0, mp = seg[j], mx = seg[j], v;
        for (p = 1; p < n; p++) {
          v = seg[p * nbc + j];
          if (!(v <= mp)) { mp = v; ip = p; }                 // seg.argmax(0)
          mx = PF.npMaximum(mx, v);                           // seg.max(0)
        }
        phi[j] = phases[ip];
        w[j] = PF.npMaximum(mx - mean[j], 1e-12);             // segment contrast
      }
      // unwrap (mod s) across segments
      var un = new Float64Array(nbc);
      un[0] = phi[0];
      for (j = 1; j < nbc; j++) {
        var d = pyMod(phi[j] - phi[j - 1] + 0.5 * s, s) - 0.5 * s;
        un[j] = un[j - 1] + d;
      }
      var c_edges = this.seg[nbc].c_edges, xs = new Float64Array(nbc);
      for (j = 0; j < nbc; j++) xs[j] = 0.5 * (c_edges[j + 1] + c_edges[j]);
      var xm = PF.average(xs, w);
      var pm = PF.average(un, w);
      var dx2 = new Float64Array(nbc), prod = new Float64Array(nbc), dx;
      for (j = 0; j < nbc; j++) { dx = xs[j] - xm; dx2[j] = dx * dx; }
      var denom = PF.average(dx2, w);
      if (denom <= 0) return s;
      for (j = 0; j < nbc; j++) prod[j] = (xs[j] - xm) * (un[j] - pm);
      var slope = PF.average(prod, w) / denom;
      slope = PF.clipScalar(slope, -0.02, 0.02);
      s = s * (1.0 + slope);
    }
    return s;
  };

  AxisData.prototype.best_global_phase = function (s) {
    var n = this._n_phase(s, true);
    var phases = phaseGrid(s, n);
    var ens = this.energy_tiles_multi(s, phases, 1);       // n x nbr x 1
    var nbr = this.nbr, tot = new Float64Array(n), p, r, acc;
    // .sum((1, 2)) over nbr <= 5 values: pairwise below 8 is sequential from 0
    for (p = 0; p < n; p++) { acc = 0.0; for (r = 0; r < nbr; r++) acc = acc + ens[p * nbr + r]; tot[p] = acc; }
    return phases[PF.argmax(tot)];
  };

  /* ================================================================== *
   * search logic
   * ================================================================== */

  function _s_grid(w) {
    var smax = pyMin(R.S_MAX, w / 8.0);
    var n = Math.trunc(Math.ceil(npLog(smax / R.S_MIN) / npLog(R.S_RATIO)));
    var out = new Float64Array(Math.max(0, n + 1)), i;
    // S_RATIO ** np.arange(n+1) is the UCRT pow; Math.pow(1.025, i) equals it
    // for every i in 0..110 (measured), and n <= 110 because smax <= 24.
    for (i = 0; i <= n; i++) out[i] = R.S_MIN * Math.pow(R.S_RATIO, i);
    return out;
  }

  function _coarse_curves(ad, s_list) {
    var n = s_list.length, eb = new Float64Array(n), er = new Float64Array(n), i, e;
    for (i = 0; i < n; i++) { e = ad.eval_s(s_list[i]); eb[i] = e[0]; er[i] = e[1]; }
    return [eb, er];
  }

  /** "Running median of coarse error vs s = misaligned-baseline error." */
  function _trend_fn(s_list, eb) {
    need('median'); need('interp');
    var n = s_list.length, ls = new Float64Array(n), trend = new Float64Array(n), i, j, sel;
    for (i = 0; i < n; i++) ls[i] = npLog(s_list[i]);
    for (i = 0; i < n; i++) {
      sel = [];
      for (j = 0; j < n; j++) if (Math.abs(ls[j] - ls[i]) <= 0.14) sel.push(eb[j]);
      trend[i] = PF.median(new Float64Array(sel), 'f8');
    }
    for (i = 0; i < n; i++) trend[i] = PF.npMaximum(trend[i], 1e-6);
    var fn = function (s) { return PF.interp(npLog(s), ls, trend); };
    fn.ls = ls; fn.trend = trend;                            // for the parity test
    return fn;
  }

  /**
   * "Distillability score: anti-phase penalty x alignment advantage.
   *
   *  (er - eb) is how much reconstruction degrades when the grid phase is
   *  maximally wrong (zero below the true step, large at it).  The trend
   *  factor measures how far the aligned error drops below the misaligned
   *  baseline; multiples of the true step have eb ~ trend and die here."
   */
  function _score(eb, er, trend_e) {
    return pyMax(er - eb, 0.0) * pyMax(1.0 - eb / trend_e, 0.0);
  }

  /* list.sort(reverse=True) of (score, s) tuples: descending by score, then
   * by s; stable for equal tuples. */
  function _peaks(s_list, score, k) {
    if (k === undefined || k === null) k = 6;
    var cand = [], n = s_list.length, i;
    for (i = 0; i < n; i++) {
      if (score[i] >= score[Math.max(0, i - 1)] && score[i] >= score[Math.min(n - 1, i + 1)]) {
        cand.push([score[i], s_list[i], cand.length]);
      }
    }
    cand.sort(function (a, b) {
      if (a[0] > b[0]) return -1;
      if (a[0] < b[0]) return 1;
      if (a[1] > b[1]) return -1;
      if (a[1] < b[1]) return 1;
      return a[2] - b[2];
    });
    var out = [];
    for (i = 0; i < Math.min(k, cand.length); i++) out.push(cand[i][1]);
    return out;
  }

  /** "Dense local search maximizing the score (locks grid alignment)."
   *  -> [score, s, eb, er] */
  function _refine(ad, s0, smax, trend, span, seg) {
    if (span === undefined || span === null) span = 0.035;
    seg = !!seg;
    var best = [-1.0, s0, 1.0, 1.0];
    var rounds = [[span, 9], [0.008, 7]], rnd, i, s, nbc, e, sc;
    for (rnd = 0; rnd < 2; rnd++) {
      var sp = rounds[rnd][0], npts = rounds[rnd][1];
      var center = rnd ? best[1] : s0;
      var lin = PF.linspace(1 - sp, 1 + sp, npts);
      for (i = 0; i < npts; i++) {
        s = center * lin[i];
        if (s < 1.2 || s > smax * 1.02) continue;
        nbc = seg ? ad.nbc_for(s) : 1;
        e = ad.eval_s(s, rnd === 1, nbc);
        sc = R._score(e[0], e[1], trend(s));
        if (sc > best[0]) best = [sc, s, e[0], e[1]];
      }
    }
    return best;  // score, s, eb, er
  }

  /* sorted(values, key=lambda t: -t[0]): stable, descending score. */
  function sortByNegScore(vals) {
    var tagged = vals.map(function (v, i) { return [v, i]; });
    tagged.sort(function (a, b) {
      var ka = -a[0][0], kb = -b[0][0];
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a[1] - b[1];
    });
    return tagged.map(function (t) { return t[0]; });
  }

  /** "Coarse scan + refined candidates incl. harmonics of the leaders."
   *  -> [table, trend]; table is the dict as [{key, val: [sc, s, b, r]}] in
   *  insertion order. */
  function _build_table(ad, size) {
    var s_list = R._s_grid(size);
    var ce = R._coarse_curves(ad, s_list), eb = ce[0], er = ce[1];
    var trend = R._trend_fn(s_list, eb);
    var n = s_list.length, score = new Float64Array(n), i;
    for (i = 0; i < n; i++) score[i] = R._score(eb[i], er[i], trend(s_list[i]));
    var smax = s_list[n - 1];
    var table = [];

    function add(s0, span) {
      if (span === undefined) span = 0.035;
      var i2;
      for (i2 = 0; i2 < table.length; i2++) {
        if (Math.abs(table[i2].key - s0) / s0 < 0.03) return table[i2].val;
      }
      var r = R._refine(ad, s0, smax, trend, span);
      var s = r[1];
      for (i2 = 0; i2 < table.length; i2++) {
        if (Math.abs(table[i2].key - s) / s < 0.02) {
          if (r[0] > table[i2].val[0]) table[i2].val = r;
          return table[i2].val;
        }
      }
      // table[round(s, 2)] = ...: s is an np.float64 here (a linspace
      // product, or s0 which is one), so this is numpy's round. Assigning
      // an existing key keeps its dict slot.
      var key = npRound(s, 2);
      for (i2 = 0; i2 < table.length; i2++) if (table[i2].key === key) { table[i2].val = r; return r; }
      table.push({ key: key, val: r });
      return r;
    }

    var pk = R._peaks(s_list, score, 5);
    var smx = score[0];
    for (i = 1; i < n; i++) smx = PF.npMaximum(smx, score[i]);     // score.max()
    var sc_gate = 0.2 * pyMax(smx, 1e-9);
    for (i = 0; i < pk.length; i++) {
      if (i === 0 || PF.interp(pk[i], s_list, score) >= sc_gate) add(pk[i]);
    }
    var leaders = sortByNegScore(table.map(function (e) { return e.val; })).slice(0, 2);
    var li, mi, ms, st;
    for (li = 0; li < leaders.length; li++) {
      ms = li === 0 ? [2.0, 0.5, 3.0] : [2.0, 0.5];
      for (mi = 0; mi < ms.length; mi++) {
        st = leaders[li][1] * ms[mi];
        if (R.S_MIN * 0.9 <= st && st <= smax) add(st, 0.05);
      }
    }
    return [table, trend];
  }

  /** "Global-phase micro-refine: minimize aligned error, tight window."
   *  -> [s, e] */
  function _align(ad, s, smax) {
    var best = [Infinity, s], lin = PF.linspace(0.992, 1.008, 9), i, s2, e;
    for (i = 0; i < 9; i++) {
      s2 = s * lin[i];
      if (s2 < 1.2 || s2 > smax * 1.02) continue;
      e = ad.eval_s(s2, true);
      if (e[0] < best[0]) best = [e[0], s2];
    }
    return [best[1], best[0]];
  }

  /** -> [s_ax, sc_ax, eb_ax, cands, trend] */
  function _detect_axis(ad, size) {
    var bt = R._build_table(ad, size), table = bt[0], trend = bt[1];
    var items = sortByNegScore(table.map(function (e) { return e.val; }));
    var sc_ax = items[0][0], s_ax = items[0][1], eb_ax = items[0][2];
    // candidate final steps: table winner, drift-regressed, micro-locked;
    // decided by global-phase reconstruction error
    var s_reg = ad.phase_regress(s_ax);
    // {round(s_ax, 4), round(s_reg, 4)}: s_ax is np.float64 (numpy round),
    // s_reg a Python float (CPython round). A set: equal values collapse,
    // and it is iterated in CPython's hash order (pySetOrder2) - which
    // orders the _align calls but cannot change min() over the tuples.
    var starts = pySetOrder2(npRound(s_ax, 4), PF.pyRound(s_reg, 4));
    var fin = null, i, a;
    for (i = 0; i < starts.length; i++) {
      a = R._align(ad, starts[i], size / 8.0);
      var cand = [a[1], a[0]];                              // (e_gl, s_gl)
      if (fin === null || cand[0] < fin[0] || (cand[0] === fin[0] && cand[1] < fin[1])) fin = cand;
    }
    s_ax = fin[1];
    var cands = [];
    for (i = 0; i < Math.min(8, items.length); i++) cands.push([items[i][1], items[i][0]]);
    return [s_ax, sc_ax, eb_ax, cands, trend];
  }

  /* ================================================================== *
   * detect
   * ================================================================== */

  /**
   * detect(rgba[, opts]) -> {step_x, step_y, cols, rows, phase_x, phase_y,
   *   conf_x, conf_y, candidates: [[s, score], ...]}
   * opts.rng: see THE RNG in the header.
   */
  function detect(rgba, opts) {
    var ch = R._prep(rgba, opts);
    var H = rgba.h, W = rgba.w;
    var adx = new R.AxisData(ch, 0);
    var ady = new R.AxisData(ch, 1);
    var X = R._detect_axis(adx, W), Y = R._detect_axis(ady, H);
    var sx = X[0], cx = X[1], candx = X[3], trend_x = X[4];
    var sy = Y[0], cy = Y[1], candy = Y[3], trend_y = Y[4];

    // cross-axis rescue: a weak axis borrows the strong axis' step and
    // re-fits it locally (segment-phase freedom + drift regression); the
    // replacement must beat the axis' own step under the GLOBAL score,
    // which protects genuinely non-square grids from false adoption.
    function _gscore(ad, s, trend) {
      var e = ad.eval_s(s, true);
      return R._score(e[0], e[1], trend(s));
    }
    function _rescue(ad, s_strong, smax, trend) {
      var r = R._refine(ad, s_strong, smax, trend, 0.05, true);
      return ad.phase_regress(r[1]);
    }

    var smax_x = pyMin(R.S_MAX, W / 8.0);
    var smax_y = pyMin(R.S_MAX, H / 8.0);
    var s2;
    if (cx < 0.01 && cy > 2 * cx && Math.abs(sx - sy) / pyMax(sx, sy) > 0.04) {
      s2 = _rescue(adx, sy, smax_x, trend_x);
      if (_gscore(adx, s2, trend_x) > _gscore(adx, sx, trend_x)) sx = s2;
    } else if (cy < 0.01 && cx > 2 * cy && Math.abs(sy - sx) / pyMax(sx, sy) > 0.04) {
      s2 = _rescue(ady, sx, smax_y, trend_y);
      if (_gscore(ady, s2, trend_y) > _gscore(ady, sy, trend_y)) sy = s2;
    }

    var all = candx.concat(candy).map(function (t, i) { return [t, i]; });
    all.sort(function (a, b) {                              // sorted(key=lambda t: -t[1]), stable
      var ka = -a[0][1], kb = -b[0][1];
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a[1] - b[1];
    });
    return {
      step_x: sx, step_y: sy,
      cols: PF.rint(W / sx), rows: PF.rint(H / sy),
      phase_x: adx.best_global_phase(sx),
      phase_y: ady.best_global_phase(sy),
      conf_x: cx, conf_y: cy,
      candidates: all.slice(0, 8).map(function (t) { return t[0]; })
    };
  }

  R.S_MIN = 1.6;
  R.S_MAX = 24.0;
  R.S_RATIO = 1.025;          // coarse geometric s grid spacing
  R.MAX_ROWS = 360;           // row subsampling cap
  R.N_ROWBLOCKS = 5;          // per-tile phase freedom (rows)
  R.N_COLSEGS = 8;            // max column segments (peak-locating tier only)
  R.KMEANS_K = 14;
  R.C_FLOOR = 0.012;          // contrast below this = "no grid signal" (defined, never read, in the reference too)
  R._quantize = _quantize;
  R._pca_channels = _pca_channels;
  R._prep = _prep;
  R.AxisData = AxisData;
  R._s_grid = _s_grid;
  R._coarse_curves = _coarse_curves;
  R._trend_fn = _trend_fn;
  R._score = _score;
  R._peaks = _peaks;
  R._refine = _refine;
  R._build_table = _build_table;
  R._align = _align;
  R._detect_axis = _detect_axis;
  R.detect = detect;
  // scalar semantics, exposed for the parity test and for a reader
  R._log = crLog;
  R._npLog = npLog;
  R._npRound = npRound;
  R._pyFloorDiv = pyFloorDiv;
  R._pyMod = pyMod;
  R._pySetOrder2 = pySetOrder2;
  R._semantics = SEM;
  PF.versionReconsearch = 'pf-41-reconsearch/1';
})();

/* ==== pf-42-repair8.js ============================================ */
/* pf-42-repair8.js - the cell step for Pixel size 8: two_stage_pack's vote,
 * then four repairs, each a failure measured on real traits at size 8.
 *
 * WHY THIS EXISTS. At 8 px cells (a 160 x 160 grid on a 1280 canvas) the
 * plain vote of PF.two_stage_pack (pf-40) loses what a pixel artist keeps:
 * a black bar 5-7 px thick that falls across two cells wins neither and
 * vanishes (Mouth 05: the left teeth bar gone, the bottom bar broken), a
 * thin stroke on transparency breaks into dots, and a textured fill leaves
 * single cells of a stray shade (Mouth 05's pale-yellow teeth cells).
 * PF.repair8_pack runs the same vote and then repairs those three things.
 * Every rule below was switched off on its own and the pictures that changed
 * back were looked at; the rules left out were measured and dropped (see the
 * end of this header).
 *
 *   PF.repair8_pack(rgba, cols, rows, colour) -> {d, w: cols, h: rows, cn: 4}
 *
 *   rgba    {d, w, h, cn: 4}, straight RGBA; alpha-0 pixels read (0,0,0,0)
 *           as the page's canvas decodes them. RGBA only: every rule reads
 *           alpha.
 *   colour  {labOf, deltaE2000}: the page's own CIELAB and CIEDE2000, passed
 *           in by the worker so there is ONE definition of "how different do
 *           these two colours look" (the palette step uses the same pair).
 *
 * It resets nothing: PF.process resets the RNG before the k-means, exactly as
 * it does before two_stage_pack. With every repair skipped the result is
 * two_stage_pack(rgba, cols, rows, 0, {}) byte for byte (stage 1 and stage 2
 * below are its code); art already on the 8 px grid comes out byte-identical
 * with the repairs on (every cell is one colour, so no rule fires).
 *
 * THE REPAIRS (in the order they run; the numbers are the named consts):
 *
 *  1. RESCUE (a line about one cell thick that straddles two cells).
 *     Each pair of neighbouring cells is read as 16 pixel lines across the
 *     pair. A colour family (labels within LINE_FAM_DE of the family's
 *     biggest label) is a LINE there when it fills FULL of the width on
 *     RESCUE_LEN..RESCUE_MAXLEN consecutive pixel lines that cross the shared
 *     edge and do not touch the pair's outer edge (so it does not run on into
 *     the next cell: a line, not the edge of a thick shape). The line belongs
 *     to the cell holding its centre.
 *       vanish - it won neither cell: the centre cell takes it (and becomes
 *                opaque), taking the label that draws that line. Mouth 05's
 *                left teeth bar and its bottom bar come back.
 *       double - it won both cells (or it is being moved into the centre
 *                cell): the other cell gives it up, but only when the line
 *                CONTINUES past the pair along its direction (a line does, a
 *                block does not: Crooked Smiley's X eyes are 9 px blocks
 *                stepping diagonally, and treating each block as a doubled
 *                line cut an arm off the X), the other cell holds almost
 *                nothing else of it, the cells along the line give it up too
 *                (no notch: Argentina 10 Shirt's "0" came out 2 cells wide
 *                with a 1-cell notch), and the line's cells stay connected.
 *     A hanging guard drops an added cell that only touches one piece of the
 *     line already shown: that is a bump on a line, not a line.
 *
 *  2. CONNECT (a thin stroke on transparency stays one piece).
 *     If one 8-connected piece of source paint comes out as two or more
 *     8-connected pieces of cells, the gap is bridged through the empty cells
 *     that hold most of that same stroke (at most CONNECT_MAXLEN cells). It
 *     only joins pieces of the SAME source stroke, so it cannot hang a cell
 *     off a clean outline: a clean outline is already one piece. A bridge
 *     cell takes the colour its stroke has around it.
 *
 *  3. SPECKS (a textured fill comes out as flat as drawn, shading kept).
 *     Labels are one TONE when they are close (TONE_DE), finely interleaved
 *     INSIDE cells (art already on the grid has no such contacts), their
 *     specks are smaller than a cell, and most of the joining label's
 *     contacts are with the tone (an anti-alias edge sits between two
 *     regions and is not texture). Inside a region of one tone only SPECKS
 *     change: 1-2 cells of a close shade, in a field of the region's colour,
 *     each won on a split vote (the winning label holds under SPECK_COVER of
 *     the cell: noise, not a drawn block). A speck takes the colour its
 *     neighbours already have. Everything else keeps its colour exactly:
 *     Impossible Fold Skin's shaded maze faces and Divine Ponytail's drawn
 *     olive highlights stay. A walled-in piece of a tone of at most
 *     SMALLREG_MAX cells (a tooth between bars) takes the tone's colour from
 *     elsewhere in the picture; a speck test cannot see it.
 *
 * MEASURED AND LEFT OUT: equal (box) pixel weights in the vote bent Crooked
 * Smiley's X, Argentina's "0" and Bitcoin Cap's stem, so the vote keeps
 * two_stage_pack's centre weight; a texture tone voting as one widened
 * Bitcoin Cap's stem; recolouring whole shade patches merged Impossible Fold
 * Skin's shading; recolouring to a colour no cell had moved Walnut Chessboard
 * Skin's cells across palette colours (the palette groups colours by count).
 *
 * PIXEL SIZE 16 (round 3: PF.lines16_pack, or repair8_pack's `rules`).
 * At 16 px cells (80 x 80 on 1280) a drawn line thinner than a cell loses the
 * vote to the fill on either side and comes out as dots or not at all:
 * Dogecoin Polo's collar, GATE Hoodie's white letter outline, Circuit Board
 * Skin's gold traces, Noun Glasses' black frame outline (gone entirely).
 *   PF.repair8_pack(rgba, cols, rows, colour, rules)
 *     rules  absent: size 8's set (rescue, connect, specks), byte for byte as
 *            before. Given {stroke, rescue, connect, specks, keep}: stroke
 *            and keep run only when true; rescue, connect and specks run
 *            unless false. {rescue:false, connect:false, specks:false} is
 *            two_stage_pack byte for byte (measured 311/311 at 16).
 *   PF.lines16_pack(rgba, cols, rows, colour) = repair8_pack with RULES16.
 * Two rules exist only at 16:
 *  4. STROKE: a line drawn ON a fill (CONNECT sees only paint on
 *     transparency) is joined across its gaps. See its comment.
 *  5. KEEP: what RESCUE and STROKE may not replace. A line takes a painted
 *     cell only when that cell's colour is the line's OUTSIDE (the biggest
 *     shape the line touches) and is not itself a line there; an empty cell
 *     only when it is the outside's transparency, not a hole in the art; and
 *     a rescued cell touching no cell of its line (a dot) is dropped.
 *     Measured without it: GATE Hoodie's white outline turned 5 yellow letter
 *     cells white and STROKE turned 2 white outline cells yellow; Ancient Oak
 *     Skin's eye slit was filled and the outline pass then wiped the eye;
 *     Cyclops Ruby Visor's ruby rows turned black when a refused line was
 *     moved to the other cell instead (so a refused line now stays as today).
 * Round 5 (versionRepair8 'pf-42-repair8/4'), measured on the live page path
 * (palette patch617 + outline patch618), four guards, all inside KEEP (size
 * 16 only; size 8 is byte for byte as before):
 *  RIM      RESCUE may not take the only cell of the colour the line lies
 *           against (the cell beyond it, away from the line, is another
 *           colour) when that colour contrasts with the line (RIM_DE). Eight
 *           Lines Specs lost the cream top rim of both lenses to the black
 *           outline. OUTWARD: the line then goes to the other cell when that
 *           is empty and the outside (not a hole), holds OUTWARD_MIN of the
 *           line and the line is not shown one cell further out - the outline
 *           sits outside the rim, as drawn. Otherwise the cell stays as today.
 *  PAINT_LEN a line replaces a PAINTED cell only when at least 6 px thick at
 *           16 (5 px is a letter's shadow: Wake Me Up put grey cells in the W).
 *  EDGE     STROKE may not take a cell of the shape a silhouette outline goes
 *           round (the outline touches the outside transparency near it):
 *           AirPod and Small White Figure got black inside the white body.
 *  THICK    STROKE joins a LINE: at both ends of a gap the stroke is at most
 *           about a cell thick (Diagonal Reflection Glasses: the black lens was
 *           'joined' across its own white highlight).
 * The GATE guard's palette snap now gets the row width (colour.snap(d, n, w)),
 * as the page's own palette call does.
 * Round 6 (versionRepair8 'pf-42-repair8/5'): the page runs these rules on
 * EVERY picture - size 8's set at a step of 8, size 16's at 16 - not on a list
 * of layers (the owner: "i dont want specific rules for certain traits").
 * Measured on all 311 traits at both sizes against base-620. Two changes:
 *  GATE     takes the outline pass's numbers from the page (colour.gate = the
 *           page's OUTLINE_GATE, the object fixOutlineOnce reads) instead of a
 *           private copy, and counts near-black as the pass's nearG does
 *           (patch620's dark grey). Size 8's rules get it too, now that they
 *           run on outlined pictures (on the 311 it never had to refuse at 8).
 *  PALETTE  both sizes (colour.snap): a repair may not move the page's palette
 *           answer for cells it did not change beyond PALETTE_SHARE of what it
 *           repaired. On pictures the rules had never run on, a few repaired
 *           cells moved the palette's shade assignment for hundreds of others:
 *           Walnut Chessboard Skin at 8 lost its dark grain (4 cells repaired,
 *           201 moved), Anfield Tunnel at 16 its wall shading, Yellow Hazmat
 *           Suit at 16 its zipper teeth. See paletteKnock.
 * Size 8 on mouths, eyes and chains (where it always ran) is unchanged on all
 * 49 of them; without the palette (colour.snap absent) and the outline pass
 * (colour.gate absent) both guards are off and the rules are as round 5's.
 * Round 7 (versionRepair8 'pf-42-repair8/6'): what round 6 left worse that
 * RESCUE made, each told from the picture (no list, no layer, no name);
 * measured on all 311 at 4, 8, 10 and 16 against round 6:
 *  STEP     RESCUE does not draw a band whose CIE L* lies between the colours
 *           on its two sides (STEP_DL from each, both sides painted) when the
 *           band is a SHADE - a grey, or within STEP_HUE of a coloured side's
 *           hue. That is shading, not a line: Red Mushroom Cap at 8 gave its
 *           black outline row to the 4 px dark-red band above it (dark red
 *           between red and black); Wake Me Up Sleep Mask and WAGMI Cap at 8
 *           drew their letters' 5 px grey drop shadow as grey cells. A band of
 *           its own hue between them is a drawn line and is still rescued
 *           (Casino Crown's red trim, Dogecoin Polo's teal edge). Size 8's
 *           set only (no KEEP): at 16 KEEP's PAINT_LEN already refuses the
 *           shadow, and STEP there only took back round 6's restored shading
 *           rows (Green Hill Loop's cloud underside) - measured, then left out.
 *  MOVE     a cell gives its line up to another only when that one takes it:
 *           when the add a move was made for is dropped (the hanging guard,
 *           KEEP's dot rule, RUN, SOLID) the move is dropped too. Ankh Earring
 *           at 16: the stem's black bottom cell gave its line to an empty cell
 *           that was then refused, so the line was drawn nowhere (yellow).
 *  RUN      (16, OUTWARD) a run of cells moved outside its rim that stops
 *           while the source line goes on, shown nowhere next to it, is a
 *           fragment: Mouth 05's 2-cell stub under the teeth. GAP: a rim cell
 *           with the line shown on both sides in its own row is a gap in that
 *           line, not a rim: moving the line out drew a dot above Sharingan
 *           Eyes' eye white (and a spike on Sleepy Neutral Eyes' lid). Eight
 *           Lines Specs' lens tops (the rim's whole length) stay.
 *  SOLID    an added cell that completes a 2 x 2 block of its line's colour
 *           (SOLID_ADDED of the 4 added) where the source fills under
 *           SOLID_SHARE of it draws an area, not a line (Black and White Rays
 *           at 8: rays finer than a cell merged into black blobs; partly
 *           fixed). Size 8's set only: at 16 two separate thin lines a cell
 *           apart (Trainer Cap with Hair's brim) make such a block too, and
 *           SOLID broke the brim's outline - measured, then left out there.
 *  Measured and left out: HELD (a cell whose own colour is a line centred in
 *  it at least as thick keeps it) fixed Red Mushroom Cap but broke Make Solana
 *  Great Again Hat's letters and Secretlab Gaming Chair's red stitching at 8
 *  (the gaps between strokes read as lines too); FINE (no rescue in a pair
 *  holding two lines) did not touch Black and White Rays and took 12 black
 *  cells off Dogecoin Polo at 8. White Couch Group's 'stray diagonal' at 16
 *  is STROKE drawing the shoulder's black outline the source draws: kept.
 *  On the 311 (lines7's rows): at 8 no mouth or eye cell changes; 5 chains
 *  change 1-2 cells each (6 in all). At 16 the changes on mouths, eyes and
 *  ears are the strays above. Sizes 4 and 10: none (the rules run at 8, 16).
 *
 * Needs, resolved AT CALL TIME on PF (a missing port throws by name):
 *   PF.adaptive_k                              pf-40-reconstruct.js
 *   PF.kmeans_quantize                         pf-11-quantize.js
 *   PF.clipScalar PF.argmax PF.npMaximum PF.rint  pf-00-base.js
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  function need(name, file) {
    if (typeof PF[name] !== 'function') {
      throw new Error('pf-42-repair8.js: PF.' + name + ' is missing -- load ' + file + ' first');
    }
  }

  // ------------------------------------------------------------ constants
  // RESCUE
  var FULL = 0.75;           // a pixel line across the pair belongs to the line when the family fills this much of it
  var RESCUE_LEN = 4;        // a straddling line is at least this many px thick (thinner is anti-alias, not a line)
  var RESCUE_MAXLEN = 12;    // ... and at most this many (thicker wins a cell on its own)
  var UNDOUBLE_MAXLEN = 9;   // a line shown in both cells is doubled only when at most this thick (about one cell)
  var RESCUE_REST = 0.15;    // ... and the other cell holds less than this share of the family beyond the line
  var RESCUE_MIN = 0.2;      // the cell that takes a line must hold at least this share of it itself
  var RESCUE_TIE = 0.06;     // a line centre this close (x cell) to the shared edge is a tie: continuation decides
  var LINE_FAM_DE = 15;      // labels this close (CIEDE2000) are one line colour (black bar + its dark anti-alias)
  var LINE_CON_DE = 12;      // a rescued line must differ this much from what it replaces (lines contrast)
  // SPECKS
  var TONE_DE = 15;          // texture shades are at most this far from the tone's centre ...
  var TONE_MIX = 0.2;        // ... interleaved inside cells: contacts / smaller area at least this ...
  var TONE_INSIDE = 0.6;     // ... with at least this share of their in-cell contacts with the centre (not an edge) ...
  var TONE_BLOB = 1;         // ... and specks averaging under this many cells in area (a 10 px-grid drawing is detail)
  var FLAT_SHARE = 0.05;     // region colour candidates: exact colours holding at least this share of the region
  var PATCH_DE = 3;          // one shade: cell colours this close (the page's own same-shade is 2.3)
  var SPECK_MAX = 2;         // a speck is at most this many cells ...
  var SPECK_COVER = 0.65;    // ... each won by a label holding under this share of its cell (Mouth 05: 0.3-0.6; drawn blocks 0.7-1.0) ...
  var SPECK_DE = 15;         // ... of a shade at most this far from the region colour ...
  var NEIGH_DE = 12;         // ... in a field whose cells are all this close to the region colour
  var SMALLREG_MAX = 3;      // a walled-in piece of a tone this small takes the tone's colour from elsewhere
  // CONNECT
  var CONNECT_MINPX = 24;    // an output piece counts when it holds at least this many px of the stroke
  var CONNECT_MAXLEN = 4;    // longest bridge, in empty cells, per join
  var CONNECT_MINCOV = 0.1;  // a bridge cell must hold at least this share of the stroke
  // STROKE (Pixel size 16 only: rules.stroke)
  var STROKE_MINPX = 1.5;    // a piece of cells counts when it holds this many cell-widths of px of the stroke
  var STROKE_MAXLEN = 3;     // longest bridge, in cells, per join
  var STROKE_MINCOV = 0.1;   // a bridge cell must hold at least this share of the stroke
  var STROKE_BEND = 1.5;     // the source path across a gap is at most this x the straight distance (+ a cell)
  var STROKE_HELD = 0.5;     // a bridge prefers cells whose own colour holds less of them
  // KEEP (Pixel size 16 only: rules.keep) - what a line may NOT replace
  var KEEP_THIN = 0.75;      // a colour no thicker than this x a cell where it wins a cell is itself a line there
  var EDGE_OUT = 0.5;        // a line is the SILHOUETTE's outline at a cell when, in the 3 x 3 cells round it, its pixels touch the
                             // outside transparency at least this x as often as they touch the cell's own colour (round 5)
  var EDGE_MINPX = 4;        // ... and at least this many px of it (a corner speck of transparency is not a silhouette)
  var STROKE_THICK = 1.1;    // STROKE joins a line: at both ends of a gap the stroke is at most about a cell thick (twice its depth)
  var RIM_DE = 30;           // a rim the line may not erase contrasts with it this much (cream on black; a near-black frame row does not)
  var PAINT_LEN = 0.375;     // at 16 a line replaces a PAINTED cell only when at least this x a cell thick (6 px; 5 px is a shadow)
  var OUTWARD_MIN = 0.1;     // a line refused a RIM cell goes to the empty cell outside when that holds this share of it
  // round 7 (see the header): four rules, each with its switch; all four false = round 6's pf-42-repair8/5 exactly
  // (the seam, measured on the 311 at 8 and 16)
  var STEP_ON = true;       // STEP: a band whose lightness lies between its two sides, and is a shade, is not a line
  var STEP_DL = 3;          // ... by at least this much CIE L* from each side
  var STEP_SIDE = 0.5;      // ... a side counts when at least this share of its pixels is painted
  var STEP_GREY = 10;       // ... a colour with CIE chroma under this is a grey
  var STEP_HUE = 30;        // ... a band within this many degrees of hue of a coloured side is a shade of it
  var MOVE_ON = true;       // MOVE: a move is dropped with the add it was made for
  var RUN_ON = true;        // RUN (and GAP): OUTWARD moves a line as a whole run, never a fragment or a bump
  var SOLID_ON = true;      // SOLID: RESCUE may not make a 2 x 2 block of a colour the source does not fill there
  var SOLID_SHARE = 0.5;    // ... a block of cells is filled in the source when its family holds this share of the block
  var SOLID_ADDED = 3;      // ... and the rescue made the block: at least this many of its 4 cells were added

  /* the 8 cells around a cell, clockwise from top-left; ringPieces counts the
     8-connected pieces among the marked ones (king-move neighbours join) */
  var RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  function ringPieces(ring) {
    var seen = [false, false, false, false, false, false, false, false], k = 0, s, t, a, q;
    for (s = 0; s < 8; s++) {
      if (!ring[s] || seen[s]) continue;
      k++; q = [s]; seen[s] = true;
      while (q.length) {
        a = q.pop();
        for (t = 0; t < 8; t++) {
          if (ring[t] && !seen[t] && Math.max(Math.abs(RING[a][0] - RING[t][0]), Math.abs(RING[a][1] - RING[t][1])) === 1) { seen[t] = true; q.push(t); }
        }
      }
    }
    return k;
  }

  // CSR grouping of pixel indices by cell (pf-40's, in pixel order within a cell)
  function csrByCell(cell, N, n) {
    var offs = new Int32Array(n + 1), order = new Int32Array(N), i, c, fill;
    for (i = 0; i < N; i++) offs[cell[i] + 1]++;
    for (c = 0; c < n; c++) offs[c + 1] += offs[c];
    fill = new Int32Array(offs.subarray(0, n));
    for (i = 0; i < N; i++) { c = cell[i]; order[fill[c]++] = i; }
    return { offs: offs, order: order };
  }

  function mapEntries(m) { var a = []; m.forEach(function (v, k) { a.push([k, v]); }); return a; }

  /* ---------------------------------------------------------- shared facts
     Per label: mean colour of its paint pixels (alpha > 127) in Lab, and the
     CIEDE2000 between every two labels. Per cell: paint share per LINE family.
     Families are built around a centre (the biggest label starts one, a
     smaller label joins the nearest centre within reach), never chained:
     chaining joined black - dark grey - grey - white on XRP Chain. */
  function facts(d, w, h, N, lab, K, cell, n, cols, rows, colour) {
    var sum = new Float64Array(K * 3), cnt = new Float64Array(K), paint = new Uint8Array(N), i, l, a, b, x, y;
    for (i = 0; i < N; i++) {
      if (d[i * 4 + 3] > 127) { paint[i] = 1; l = lab[i]; cnt[l]++; sum[l * 3] += d[i * 4]; sum[l * 3 + 1] += d[i * 4 + 1]; sum[l * 3 + 2] += d[i * 4 + 2]; }
    }
    var L = [];
    for (l = 0; l < K; l++) L.push(cnt[l] ? colour.labOf(sum[l * 3] / cnt[l], sum[l * 3 + 1] / cnt[l], sum[l * 3 + 2] / cnt[l]) : null);
    var dE = new Float64Array(K * K);
    for (a = 0; a < K; a++) for (b = 0; b < K; b++) {
      dE[a * K + b] = (L[a] && L[b]) ? colour.deltaE2000(L[a][0], L[a][1], L[a][2], L[b][0], L[b][1], L[b][2]) : 999;
    }
    // 4-contacts between labels INSIDE one cell: a mix finer than the cell
    var con = new Float64Array(K * K);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!paint[i]) continue;
      if (x + 1 < w && paint[i + 1] && lab[i + 1] !== lab[i] && cell[i + 1] === cell[i]) { con[lab[i] * K + lab[i + 1]]++; con[lab[i + 1] * K + lab[i]]++; }
      if (y + 1 < h && paint[i + w] && lab[i + w] !== lab[i] && cell[i + w] === cell[i]) { con[lab[i] * K + lab[i + w]]++; con[lab[i + w] * K + lab[i]]++; }
    }
    var byCnt = []; for (l = 0; l < K; l++) if (cnt[l]) byCnt.push(l);
    byCnt.sort(function (p, q) { return cnt[q] - cnt[p] || p - q; });
    function star(ok) {
      var f = new Int32Array(K), centres = [], j, k, c, e, best, be;
      for (k = 0; k < K; k++) f[k] = k;
      for (j = 0; j < byCnt.length; j++) {
        k = byCnt[j]; best = -1; be = Infinity;
        for (var ci = 0; ci < centres.length; ci++) { c = centres[ci]; e = dE[k * K + c]; if (ok(k, c, e) && e < be) { be = e; best = c; } }
        if (best >= 0) f[k] = best; else centres.push(k);
      }
      return f;
    }
    // mean blob size per label (4-connected pixels of one label)
    var blobs = new Float64Array(K), seen = new Uint8Array(N), stk = new Int32Array(N), s0, sp, j;
    for (s0 = 0; s0 < N; s0++) {
      if (!paint[s0] || seen[s0]) continue;
      l = lab[s0]; blobs[l]++; sp = 0; stk[sp++] = s0; seen[s0] = 1;
      while (sp) {
        j = stk[--sp]; x = j % w;
        if (x > 0 && !seen[j - 1] && paint[j - 1] && lab[j - 1] === l) { seen[j - 1] = 1; stk[sp++] = j - 1; }
        if (x + 1 < w && !seen[j + 1] && paint[j + 1] && lab[j + 1] === l) { seen[j + 1] = 1; stk[sp++] = j + 1; }
        if (j >= w && !seen[j - w] && paint[j - w] && lab[j - w] === l) { seen[j - w] = 1; stk[sp++] = j - w; }
        if (j + w < N && !seen[j + w] && paint[j + w] && lab[j + w] === l) { seen[j + w] = 1; stk[sp++] = j + w; }
      }
    }
    var cellArea = (w / cols) * (h / rows);
    var blobMean = new Float64Array(K); for (l = 0; l < K; l++) blobMean[l] = blobs[l] ? cnt[l] / blobs[l] : 0;
    var line = star(function (k, c, e) { return e < LINE_FAM_DE; });
    var conTot = new Float64Array(K); for (a = 0; a < K; a++) for (b = 0; b < K; b++) conTot[a] += con[a * K + b];
    var tone = star(function (k, c, e) {
      return e < TONE_DE && con[k * K + c] / Math.min(cnt[k], cnt[c]) >= TONE_MIX && blobMean[k] < TONE_BLOB * cellArea &&
        conTot[k] > 0 && con[k * K + c] / conTot[k] >= TONE_INSIDE;
    });
    var toneSize = new Int32Array(K); for (l = 0; l < K; l++) if (cnt[l]) toneSize[tone[l]]++;
    // per-cell share of each LINE family (Float32, as measured)
    var cov = new Float32Array(n * K), paintCnt = new Float32Array(n), cellN = new Float32Array(n), c2, sc, f2;
    for (i = 0; i < N; i++) { c2 = cell[i]; cellN[c2]++; if (paint[i]) { cov[c2 * K + line[lab[i]]]++; paintCnt[c2]++; } }
    for (c2 = 0; c2 < n; c2++) { sc = cellN[c2] || 1; for (f2 = 0; f2 < K; f2++) cov[c2 * K + f2] /= sc; paintCnt[c2] /= sc; }
    return { d: d, paint: paint, cnt: cnt, dE: dE, line: line, tone: tone, toneSize: toneSize, cov: cov, paintCnt: paintCnt, cellN: cellN, cell: cell, w: w, h: h, lab: lab, labOf: colour.labOf };
  }

  /* ---------------------------------------------------------- 1. RESCUE */
  function rescue(win, opaque, I, cols, rows, K, ACC, G) {
    var n = cols * rows, fam = I.line, cov = I.cov, W = I.w;
    var cellW = W / cols;
    if (cellW !== Math.floor(cellW) || I.h / rows !== cellW) return;   // whole square cells only (size 8 on 1280)
    var S = cellW, S2 = 2 * S, c, i;
    var winF = new Int32Array(n);
    for (c = 0; c < n; c++) winF[c] = opaque[c] ? fam[win[c]] : -1;
    function isF(k, f) { return k >= 0 && k < n && winF[k] === f; }
    var famPix = new Int32Array(I.w * I.h);
    for (i = 0; i < famPix.length; i++) famPix[i] = I.paint[i] ? fam[I.lab[i]] : -1;
    var add = new Map(), drop = new Map(), prof = new Map();

    function pair(a, b, horiz) {
      // horiz: a left of b, the line runs vertically; the profile is over pixel COLUMNS
      if (I.paintCnt[a] + I.paintCnt[b] === 0) return;
      prof.clear();
      var ax = (a % cols) * S, ay = ((a / cols) | 0) * S, u, v, x, y, f, p;
      for (u = 0; u < S2; u++) {            // across the pair
        for (v = 0; v < S; v++) {           // along the line
          x = horiz ? ax + u : ax + v; y = horiz ? ay + v : ay + u;
          f = famPix[y * W + x]; if (f < 0) continue;
          p = prof.get(f); if (!p) { p = new Int32Array(S2); prof.set(f, p); }
          p[u]++;
        }
      }
      // share of cell o held by f beyond the line's pixel lines [lo..hi], not
      // counting lines of f crossing o the other way (a junction's own pair)
      function restOf(o, f, lo, hi) {
        var ox = (o % cols) * S, oy = ((o / cols) | 0) * S, u0 = o === a ? 0 : S, restPx = 0, vv, uu, k, kin, xx, yy;
        for (vv = 0; vv < S; vv++) {
          k = 0; kin = 0;
          for (uu = 0; uu < S; uu++) {
            xx = horiz ? ox + uu : ox + vv; yy = horiz ? oy + vv : oy + uu;
            if (famPix[yy * W + xx] !== f) continue;
            k++; if (u0 + uu >= lo && u0 + uu <= hi) kin++;
          }
          if (k >= FULL * S) continue;
          restPx += k - kin;
        }
        return restPx / (S * S);
      }
      // STEP (round 7): across the pair, the band's own pixels (family f) and, on each side of it, the pixels of
      // that side's most common label; each as its mean colour, compared by CIE L*. The band is a step of shading
      // when its L* lies between the two sides' by STEP_DL from each (both sides mostly painted).
      function stepOf(f, lo, hi) {
        var bs = [0, 0, 0, 0], side = [new Map(), new Map()], tot = [0, 0], uu, vv, xx, yy, ii, k, sd, m, p;
        for (uu = 0; uu < S2; uu++) for (vv = 0; vv < S; vv++) {
          xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * W + xx;
          if (uu >= lo && uu <= hi) { if (famPix[ii] === f) { bs[0] += I.d[ii * 4]; bs[1] += I.d[ii * 4 + 1]; bs[2] += I.d[ii * 4 + 2]; bs[3]++; } continue; }
          sd = uu < lo ? 0 : 1; tot[sd]++;
          if (!I.paint[ii]) continue;
          m = side[sd]; p = m.get(I.lab[ii]); if (!p) { p = [0, 0, 0, 0]; m.set(I.lab[ii], p); }
          p[0] += I.d[ii * 4]; p[1] += I.d[ii * 4 + 1]; p[2] += I.d[ii * 4 + 2]; p[3]++;
        }
        if (!bs[3]) return false;
        var Ls = [];
        for (sd = 0; sd < 2; sd++) {
          var best = null, bk = -1, painted = 0;
          side[sd].forEach(function (v2, k2) { painted += v2[3]; if (!best || v2[3] > best[3] || (v2[3] === best[3] && k2 < bk)) { best = v2; bk = k2; } });
          if (!best || painted < STEP_SIDE * tot[sd]) return false;
          Ls.push(I.labOf(best[0] / best[3], best[1] / best[3], best[2] / best[3]));
        }
        var Bl = I.labOf(bs[0] / bs[3], bs[1] / bs[3], bs[2] / bs[3]), Lb = Bl[0];
        if (!(Lb >= Math.min(Ls[0][0], Ls[1][0]) + STEP_DL && Lb <= Math.max(Ls[0][0], Ls[1][0]) - STEP_DL)) return false;
        // ... and it is a SHADE: a grey (a drop shadow), or the hue of a coloured side (a darker red between a red cap
        // and its outline). A coloured band of its own hue between them is a drawn line (Casino Crown's red trim
        // between the black outline and the gold, Dogecoin Polo's teal edge between black and grey): rescued.
        var Cb = Math.sqrt(Bl[1] * Bl[1] + Bl[2] * Bl[2]);
        if (Cb < STEP_GREY) return true;
        return Ls.some(function (q) {
          var Cq = Math.sqrt(q[1] * q[1] + q[2] * q[2]); if (Cq < STEP_GREY) return false;
          var dh = Math.abs(Math.atan2(Bl[2], Bl[1]) - Math.atan2(q[2], q[1])) * 180 / Math.PI; if (dh > 180) dh = 360 - dh;
          return dh <= STEP_HUE;
        });
      }
      // does the band [lo..hi] continue past the pair along the line?
      function continues(f, lo, hi) {
        var offsets = [-1, S], oi, off, k, uu, xx, yy;
        for (oi = 0; oi < 2; oi++) {
          off = offsets[oi]; k = 0;
          for (uu = lo; uu <= hi; uu++) {
            xx = horiz ? ax + uu : ax + off; yy = horiz ? ay + off : ay + uu;
            if (xx < 0 || yy < 0 || xx >= W || yy >= I.h) continue;
            if (famPix[yy * W + xx] === f) k++;
          }
          if (k >= FULL * (hi - lo + 1)) return true;
        }
        return false;
      }
      prof.forEach(function (p, f) {
        var lo = -1, hi = -1, L = 0, sum = 0, u2;
        for (u2 = 0; u2 < S2; u2++) if (p[u2] >= FULL * S) { if (lo < 0) lo = u2; hi = u2; L++; sum += u2; }
        if (L < RESCUE_LEN || L > RESCUE_MAXLEN) return;
        if (hi - lo + 1 !== L) return;                        // one band
        if (lo === 0 || hi === S2 - 1) return;                // runs on into the next cell
        if (lo >= S || hi < S) return;                        // inside one cell: no straddle
        var ca = cov[a * K + f], cb = cov[b * K + f];
        var mid = sum / L + 0.5, t;
        if (Math.abs(mid - S) > RESCUE_TIE * S) t = mid < S ? a : b;
        else {
          // a tie: the cell whose neighbours along the line show it, then the one holding more
          var ya = (a / cols) | 0, xa = a % cols, yb = (b / cols) | 0, xb = b % cols;
          var nb = function (x1, y1) { return (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) ? -1 : y1 * cols + x1; };
          var al = horiz ? [nb(xa, ya - 1), nb(xa, ya + 1), nb(xb, yb - 1), nb(xb, yb + 1)] : [nb(xa - 1, ya), nb(xa + 1, ya), nb(xb - 1, yb), nb(xb + 1, yb)];
          var ka = (isF(al[0], f) ? 1 : 0) + (isF(al[1], f) ? 1 : 0), kb = (isF(al[2], f) ? 1 : 0) + (isF(al[3], f) ? 1 : 0);
          t = ka !== kb ? (ka > kb ? a : b) : (ca >= cb ? a : b);
        }
        var o = t === a ? b : a, rest, prev, outw = null;
        if (winF[t] !== f) {
          if ((t === a ? ca : cb) < RESCUE_MIN) return;
          // STEP is size 8's rule (no KEEP): at 16 KEEP already refuses a painted cell to a line under PAINT_LEN
          // (the 5 px shadow) and to a line that is not its outside colour; measured at 16 STEP only took back
          // round 6's restored shading rows (Green Hill Loop's cloud underside), so it does not run there.
          if (STEP_ON && !G && stepOf(f, lo, hi)) return;
          if (G && winF[t] >= 0 && L < PAINT_LEN * S) return;
          if (winF[t] >= 0 && I.dE[fam[win[t]] * K + f] < LINE_CON_DE) return;
          if (G) {
            // KEEP (size 16): an empty cell takes the line only on the outside, never in a hole
            // (Ancient Oak Skin's eye slit filled, and the outline pass then wiped the eye);
            // a painted cell only when it is the line's outside colour and not itself a line
            // (GATE Hoodie's yellow letter cells turned white). Refused = today's cell.
            var bp = G.bandPiece(f, ax, ay, lo, hi, horiz);
            if (winF[t] < 0 ? G.inHole(t) : !G.mayTake(t, winF[t], bp)) return;
            // RIM (round 5): a line may not take the only cell of the colour it lies against. Eight Lines Specs:
            // across each lens top the source draws a black line (9 px), a cream rim (13 px), then the black lens;
            // at 16 the cream holds one cell row, and the black line's centre falls in it, so the line took the
            // rim's only cell and the frame read as a black block. When the cell beyond t (away from o) does not
            // show t's colour, t is that colour's only cell across the line here: refused, and
            // OUTWARD: when o is empty and the outside (not a hole), holds some of the line, and the line is not
            // shown one cell further out, the line goes to o - outside the rim, where a pixel artist puts it.
            if (winF[t] >= 0) {
              var ox = o % cols, oy = (o / cols) | 0, tx = t % cols, ty = (t / cols) | 0;
              var fx2 = 2 * tx - ox, fy2 = 2 * ty - oy, bx = 2 * ox - tx, by = 2 * oy - ty;
              var rim = I.dE[fam[win[t]] * K + f] >= RIM_DE && !(fx2 >= 0 && fy2 >= 0 && fx2 < cols && fy2 < rows && winF[fy2 * cols + fx2] === winF[t]);
              if (rim) {
                var beyond = bx >= 0 && by >= 0 && bx < cols && by < rows && isF(by * cols + bx, f);
                if (!(winF[o] < 0 && !G.inHole(o) && (t === a ? cb : ca) >= OUTWARD_MIN && !beyond)) return;
                // GAP (round 7, with RUN): when the line is shown in the rim cell's own row on both sides along the
                // line, the rim cell is a gap in a line drawn in that row, not a rim the line goes round: moving the
                // line out would draw a bump (Sharingan Eyes at 16: a black dot above the eye white). Stays as today.
                if (RUN_ON && (horiz ? isF(t - cols, f) && isF(t + cols, f) : (tx > 0 && tx + 1 < cols && isF(t - 1, f) && isF(t + 1, f)))) return;
                var t0 = t; t = o; o = t0;
                outw = [(t % cols) - (o % cols), ((t / cols) | 0) - ((o / cols) | 0)];
              }
            }
          }
          // the label that draws THIS line: most common label of f on its own pixel lines
          var lc = new Map(), uu, vv, xx, yy, ii, lineLab = -1, lcn = -1;
          for (uu = lo; uu <= hi; uu++) for (vv = 0; vv < S; vv++) {
            xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * W + xx;
            if (famPix[ii] === f) lc.set(I.lab[ii], (lc.get(I.lab[ii]) || 0) + 1);
          }
          lc.forEach(function (k2, l2) { if (k2 > lcn || (k2 === lcn && l2 < lineLab)) { lcn = k2; lineLab = l2; } });
          prev = add.get(t); if (!prev || L > prev.L) add.set(t, { f: f, L: L, lab: lineLab, outw: outw, horiz: horiz });
          // move, not copy: the other cell gives the line up when it holds nothing else of it
          if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
            rest = restOf(o, f, lo, hi);
            if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz, via: t }); }
          }
        } else if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
          rest = restOf(o, f, lo, hi);
          if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz }); }
        }
      });
    }
    var x, y;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      c = y * cols + x;
      if (x + 1 < cols) pair(c, c + 1, true);
      if (y + 1 < rows) pair(c, c + cols, false);
    }

    // MOVE (round 7): an add that is dropped takes the moves made for it along; that cell keeps its line
    // (Ankh Earring at 16: the stem's black bottom cell gave its line to an empty cell the dot rule then refused,
    // so the line was drawn nowhere and the cell went yellow)
    function unAdd(k) {
      var v = add.get(k); if (!v) return;
      add.delete(k);
      if (MOVE_ON) mapEntries(drop).forEach(function (d2) { if (d2[1].via === k && d2[1].f === v.f) drop.delete(d2[0]); });
    }
    // hanging guard: an added cell touching only one shown piece of its line, and no other added cell
    var resF = new Int32Array(n).fill(-1);
    add.forEach(function (v, k) { resF[k] = v.f; });
    function ringOf(k, f, withAdded, without) {
      var x0 = k % cols, y0 = (k / cols) | 0, ring = [], orig = 0, res = 0, r, xx, yy, kk, o2, r2;
      for (r = 0; r < 8; r++) {
        xx = x0 + RING[r][0]; yy = y0 + RING[r][1];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) { ring.push(0); continue; }
        kk = yy * cols + xx;
        o2 = winF[kk] === f && !(without && without.has(kk));
        r2 = withAdded && resF[kk] === f;
        if (o2) orig++; if (r2) res++;
        ring.push(o2 || r2 ? 1 : 0);
      }
      return { pieces: ringPieces(ring), orig: orig, res: res };
    }
    mapEntries(add).forEach(function (e) {
      var R = ringOf(e[0], e[1].f, true, null);
      if (R.res === 0 && R.orig > 0 && R.pieces <= 1) unAdd(e[0]);
      // KEEP (size 16): nor a cell alone, touching no cell of its line (a dot, not a line)
      else if (G && R.res === 0 && R.orig === 0) unAdd(e[0]);
    });
    // RUN (round 7, OUTWARD only): walk each run of cells moved outward, along the line. At each end look at the
    // next column along the line: the rim's row, the run's row, one further out. When none of them shows the line
    // but the source still draws it there (its family holds at least RESCUE_LEN px per cell-width across the rim's
    // and the run's cells), the run stops while the line goes on: a fragment of the line, not the line moved
    // outside its rim (Mouth 05 at 16: a 2-cell stub under the teeth of a bottom outline drawn nowhere else).
    // It is dropped and those cells stay as today. Eight Lines Specs' lens tops (the whole rim's length, ending
    // on the frame's corners) stay.
    if (RUN_ON) {
      var runSeen = new Set();
      mapEntries(add).forEach(function (e) {
        var k0 = e[0], v0 = e[1]; if (!v0.outw || runSeen.has(k0) || !add.has(k0)) return;
        var dx = v0.horiz ? 0 : 1, dy = v0.horiz ? 1 : 0, ox = v0.outw[0], oy = v0.outw[1], run = [k0], ends = [], sgn, kx, ky, nx, ny, nk, nv;
        runSeen.add(k0);
        for (sgn = -1; sgn <= 1; sgn += 2) {
          kx = k0 % cols; ky = (k0 / cols) | 0;
          for (;;) {
            nx = kx + sgn * dx; ny = ky + sgn * dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break;
            nk = ny * cols + nx; nv = add.get(nk);
            if (!nv || !nv.outw || nv.f !== v0.f || nv.outw[0] !== ox || nv.outw[1] !== oy) break;
            run.push(nk); runSeen.add(nk); kx = nx; ky = ny;
          }
          ends.push([kx, ky, sgn]);
        }
        var shows = function (x1, y1) { if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) return false; var k1 = y1 * cols + x1, a1 = add.get(k1); return winF[k1] === v0.f || !!(a1 && a1.f === v0.f); };
        var cut = ends.some(function (en) {
          var x1 = en[0] + en[2] * dx, y1 = en[1] + en[2] * dy, xr = x1 - ox, yr = y1 - oy;
          if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows || xr < 0 || yr < 0 || xr >= cols || yr >= rows) return false;
          if (shows(x1, y1) || shows(xr, yr) || shows(x1 + ox, y1 + oy)) return false;
          return (cov[(y1 * cols + x1) * K + v0.f] + cov[(yr * cols + xr) * K + v0.f]) * S >= RESCUE_LEN;
        });
        if (cut) run.forEach(unAdd);
      });
    }
    // SOLID (round 7): a rescued line is about one cell thick. An added cell that completes a 2 x 2 block of its
    // line's colour (shown or added) where the source does not fill that block (the family holds under SOLID_SHARE
    // of it) draws an area, not a line (Black and White Rays at 8: rays finer than a cell merged into a black blob).
    // Size 8's set only (no KEEP): at 16 two separate thin lines a cell apart (Trainer Cap with Hair: the brim's
    // black outline and the dark line under it) make such a block too, and SOLID broke the outline - measured.
    if (SOLID_ON && !G) {
      var showF = function (k1, f1) { var a1 = add.get(k1); return winF[k1] === f1 || !!(a1 && a1.f === f1); };
      var addKeys = mapEntries(add).map(function (e) { return e[0]; }).sort(function (p1, q1) { return p1 - q1; });
      addKeys.forEach(function (k1) {
        var v1 = add.get(k1); if (!v1) return;
        var x1 = k1 % cols, y1 = (k1 / cols) | 0, sx, sy, q, ok, share, cc, nadd, solid = false;
        for (sy = y1 - 1; sy <= y1 && !solid; sy++) for (sx = x1 - 1; sx <= x1 && !solid; sx++) {
          if (sx < 0 || sy < 0 || sx + 1 >= cols || sy + 1 >= rows) continue;
          ok = true; share = 0; nadd = 0;
          for (q = 0; q < 4; q++) { cc = (sy + (q >> 1)) * cols + sx + (q & 1); if (!showF(cc, v1.f)) { ok = false; break; } share += cov[cc * K + v1.f]; if (winF[cc] !== v1.f) nadd++; }
          if (ok && nadd >= SOLID_ADDED && share < SOLID_SHARE * 4) solid = true;
        }
        if (solid) unAdd(k1);
      });
    }
    add.forEach(function (v, k) {
      var bl = -1, bw = 0, big = -1, l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > 0 && (big < 0 || I.cnt[l] > I.cnt[big])) big = l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      if (v.lab >= 0) bl = v.lab; else if (big >= 0) bl = big;
      if (bl < 0) return;
      win[k] = bl; opaque[k] = 1;
    });

    // no notches: a cell gives a line up only when its neighbours along the line do too (or do not show it)
    function showsF(k, f) { return k >= 0 && opaque[k] && fam[win[k]] === f; }
    var changed = true;
    while (changed) {
      changed = false;
      mapEntries(drop).forEach(function (e) {
        var k = e[0], v = e[1];
        if (add.has(k)) return;
        var x1 = k % cols, y1 = (k / cols) | 0;
        var al = v.horiz ? [y1 > 0 ? k - cols : -1, y1 + 1 < rows ? k + cols : -1] : [x1 > 0 ? k - 1 : -1, x1 + 1 < cols ? k + 1 : -1];
        var bad = al.some(function (q) { return showsF(q, v.f) && !(drop.has(q) && drop.get(q).f === v.f && !add.has(q)); });
        if (bad) { drop.delete(k); changed = true; }
      });
    }
    // give the line up: best other label, or empty when more of the cell is empty
    // than any other colour family; never when that cuts the line's cells apart
    var gone = new Set();
    drop.forEach(function (v, k) {
      if (add.has(k)) return;
      var R = ringOf(k, v.f, true, gone);
      if (R.pieces > 1) return;
      var bl = -1, bw = 0, l, g, bestOther = 0;
      for (l = 0; l < K; l++) if (fam[l] !== v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      for (g = 0; g < K; g++) if (fam[g] === g && g !== v.f) bestOther = Math.max(bestOther, cov[k * K + g]);
      var empty = 1 - I.paintCnt[k];
      if (bl < 0 || empty >= bestOther) opaque[k] = 0; else win[k] = bl;
      gone.add(k);
    });
  }

  /* ---------------------------------------------------------- 2. CONNECT */
  function connect(win, opaque, I, cols, rows, K, ACC, bridges) {
    var w = I.w, h = I.h, paint = I.paint, cell = I.cell, N = w * h, n = cols * rows;
    // source pieces: 8-connected paint pixels
    var comp = new Int32Array(N).fill(-1), nc = 0, stack = new Int32Array(N), s, sp, i, x, y, dx, dy, xx, yy, j;
    for (s = 0; s < N; s++) {
      if (!paint[s] || comp[s] >= 0) continue;
      sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp) {
        i = stack[--sp]; x = i % w; y = (i / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; xx = x + dx; yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          j = yy * w + xx; if (paint[j] && comp[j] < 0) { comp[j] = nc; stack[sp++] = j; }
        }
      }
      nc++;
    }
    // per cell: pixels of each source piece
    var cellPieces = new Array(n), c, m;
    for (i = 0; i < N; i++) {
      if (comp[i] < 0) continue; c = cell[i];
      m = cellPieces[c]; if (!m) { m = new Map(); cellPieces[c] = m; }
      m.set(comp[i], (m.get(comp[i]) || 0) + 1);
    }
    var cellPx = I.cellN;
    // output pieces: 8-connected opaque cells
    var ocomp = new Int32Array(n).fill(-1);
    function labelOut() {
      ocomp.fill(-1);
      var k = 0, st2 = [], c0, e, x0, y0, ddx, ddy, x1, y1, f;
      for (c0 = 0; c0 < n; c0++) {
        if (!opaque[c0] || ocomp[c0] >= 0) continue;
        st2.push(c0); ocomp[c0] = k;
        while (st2.length) {
          e = st2.pop(); x0 = e % cols; y0 = (e / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            x1 = x0 + ddx; y1 = y0 + ddy; if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) continue;
            f = y1 * cols + x1; if (opaque[f] && ocomp[f] < 0) { ocomp[f] = k; st2.push(f); }
          }
        }
        k++;
      }
      return k;
    }
    labelOut();
    // source pieces split over two or more output pieces (each holding >= CONNECT_MINPX of it)
    var holders = new Map();
    for (c = 0; c < n; c++) {
      if (!opaque[c] || !cellPieces[c]) continue;
      cellPieces[c].forEach(function (px, pc) {
        var hm = holders.get(pc); if (!hm) { hm = new Map(); holders.set(pc, hm); }
        hm.set(ocomp[c], (hm.get(ocomp[c]) || 0) + px);
      });
    }
    var pieces = []; holders.forEach(function (v, k) { pieces.push(k); });
    pieces.sort(function (p1, p2) { return p1 - p2; });
    pieces.forEach(function (pc) {
      var sig = 0;
      holders.get(pc).forEach(function (px) { if (px >= CONNECT_MINPX) sig++; });
      if (sig < 2) return;
      var guard = 0;
      while (guard++ < 200) {
        labelOut();
        var hm = new Map(), c1, px1;
        for (c1 = 0; c1 < n; c1++) {
          if (!opaque[c1] || !cellPieces[c1]) continue; px1 = cellPieces[c1].get(pc); if (!px1) continue;
          hm.set(ocomp[c1], (hm.get(ocomp[c1]) || 0) + px1);
        }
        var sg = mapEntries(hm).filter(function (e) { return e[1] >= CONNECT_MINPX; }).sort(function (p1, p2) { return p2[1] - p1[1] || p1[0] - p2[0]; });
        if (sg.length < 2) break;
        var main = sg[0][0], targets = new Set(), ti;
        for (ti = 1; ti < sg.length; ti++) targets.add(sg[ti][0]);
        // cheapest path through empty cells holding the stroke (cost 1.05 - its share)
        var dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), steps = new Int32Array(n), heap = [];
        var push = function (cc, dv) {
          heap.push([dv, cc]); var k = heap.length - 1, pa, tmp;
          while (k > 0) { pa = (k - 1) >> 1; if (heap[pa][0] <= heap[k][0]) break; tmp = heap[pa]; heap[pa] = heap[k]; heap[k] = tmp; k = pa; }
        };
        var pop = function () {
          var top = heap[0], last = heap.pop(), k, l2, r2, m2, tmp;
          if (heap.length) {
            heap[0] = last; k = 0;
            for (;;) {
              l2 = 2 * k + 1; r2 = l2 + 1; m2 = k;
              if (l2 < heap.length && heap[l2][0] < heap[m2][0]) m2 = l2;
              if (r2 < heap.length && heap[r2][0] < heap[m2][0]) m2 = r2;
              if (m2 === k) break;
              tmp = heap[m2]; heap[m2] = heap[k]; heap[k] = tmp; k = m2;
            }
          }
          return top;
        };
        for (c1 = 0; c1 < n; c1++) if (opaque[c1] && ocomp[c1] === main) { dist[c1] = 0; push(c1, 0); }
        var hit = -1, top, dv, cc, x2, y2, ddx, ddy, xx2, yy2, f, nd, ns, pxf, cv;
        while (heap.length) {
          top = pop(); dv = top[0]; cc = top[1]; if (dv > dist[cc]) continue;
          if (opaque[cc] && targets.has(ocomp[cc])) { hit = cc; break; }
          x2 = cc % cols; y2 = (cc / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; xx2 = x2 + ddx; yy2 = y2 + ddy; if (xx2 < 0 || yy2 < 0 || xx2 >= cols || yy2 >= rows) continue;
            f = yy2 * cols + xx2;
            if (opaque[f]) { if (!targets.has(ocomp[f])) continue; nd = dv; ns = steps[cc]; }
            else {
              pxf = cellPieces[f] ? (cellPieces[f].get(pc) || 0) : 0;
              cv = pxf / (cellPx[f] || 1);
              if (cv < CONNECT_MINCOV) continue;
              ns = steps[cc] + 1; if (ns > CONNECT_MAXLEN) continue;
              nd = dv + 1.05 - cv;
            }
            if (nd < dist[f]) { dist[f] = nd; prev[f] = cc; steps[f] = ns; push(f, nd); }
          }
        }
        if (hit < 0) break;
        // the bridge cells become opaque with their best visible label (recoloured after stage 2)
        var cb = prev[hit], made = 0, bl, bw, l;
        while (cb >= 0 && !(opaque[cb] && ocomp[cb] === main)) {
          if (!opaque[cb]) {
            bl = -1; bw = -1; for (l = 0; l < K; l++) { if (ACC[cb * K + l] > bw) { bw = ACC[cb * K + l]; bl = l; } }
            win[cb] = bl; opaque[cb] = 1; made++; bridges.push(cb);
          }
          cb = prev[cb];
        }
        if (!made) break;
      }
    });
  }

  /* ---------------------------------------------------------- 3. SPECKS */
  function specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour) {
    var n = cols * rows, tone = I.tone;
    var reg = new Int32Array(n).fill(-1), nr = 0, labCache = new Map(), stack = [], regions = [];
    function winShare(c) {
      var k = 0, np = 0, p, q;
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; if (!I.paint[q]) continue; np++; if (lab[q] === win[c]) k++; }
      return np ? k / np : 1;
    }
    // region colour: the exact colour (>= FLAT_SHARE of the tone's pixels) nearest the region's mean
    function medoid(cellsR, t) {
      var tally = new Map(), tot = 0, mr = 0, mg = 0, mb = 0, ei, e, p, q, key, bestK = -1;
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        for (p = offs[e]; p < offs[e + 1]; p++) {
          q = order[p]; if (!I.paint[q] || tone[lab[q]] !== t) continue;
          key = (d[q * 4] << 16) | (d[q * 4 + 1] << 8) | d[q * 4 + 2];
          tally.set(key, (tally.get(key) || 0) + 1); tot++; mr += d[q * 4]; mg += d[q * 4 + 1]; mb += d[q * 4 + 2];
        }
      }
      if (tot) {
        var m = colour.labOf(mr / tot, mg / tot, mb / tot), be = Infinity;
        tally.forEach(function (v, k) {
          if (v < FLAT_SHARE * tot) return;
          var lb = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255);
          var e2 = colour.deltaE2000(m[0], m[1], m[2], lb[0], lb[1], lb[2]);
          if (e2 < be || (e2 === be && k < bestK)) { be = e2; bestK = k; }
        });
      }
      return bestK;
    }
    function labK(k) { var v = labCache.get(k); if (!v) { v = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255); labCache.set(k, v); } return v; }
    function dEk(p, q) { if (p === q) return 0; var a = labK(p), b = labK(q); return colour.deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]); }
    var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var c, t, cellsR, e, x, y, k4, xx, yy, f;
    for (c = 0; c < n; c++) {
      if (!opaque[c] || reg[c] >= 0 || I.toneSize[tone[win[c]]] < 2) continue;
      t = tone[win[c]]; cellsR = [];
      stack.push(c); reg[c] = nr;
      while (stack.length) {
        e = stack.pop(); cellsR.push(e); x = e % cols; y = (e / cols) | 0;
        for (k4 = 0; k4 < 4; k4++) {
          xx = x + N4[k4][0]; yy = y + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          f = yy * cols + xx; if (opaque[f] && reg[f] < 0 && tone[win[f]] === t) { reg[f] = nr; stack.push(f); }
        }
      }
      var bestK = medoid(cellsR, t);
      if (bestK < 0) { nr++; continue; }
      regions.push({ t: t, cells: cellsR, R: bestK });
      // patches of one shade; only a speck changes, to the colour its neighbours already have
      var orig = new Map(), seen = new Set(), ei;
      for (ei = 0; ei < cellsR.length; ei++) orig.set(cellsR[ei], modeKey[cellsR[ei]]);
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        if (seen.has(e)) continue;
        var k0 = orig.get(e), patch = [e], jj, g, gx, gy, to = -1;
        seen.add(e);
        for (jj = 0; jj < patch.length; jj++) {
          g = patch[jj]; gx = g % cols; gy = (g / cols) | 0;
          for (k4 = 0; k4 < 4; k4++) {
            xx = gx + N4[k4][0]; yy = gy + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            f = yy * cols + xx; if (reg[f] === nr && !seen.has(f) && dEk(orig.get(f), k0) < PATCH_DE) { seen.add(f); patch.push(f); }
          }
        }
        var dk = dEk(k0, bestK);
        if (dk < PATCH_DE) continue;                 // the region's own shade keeps its exact colour
        var noise = patch.every(function (q) { return winShare(q) < SPECK_COVER; });
        if (noise && patch.length <= SPECK_MAX && dk <= SPECK_DE) {
          var inP = new Set(patch), ok = true, nIn = 0, ntal = new Map(), pi, ddy, ddx, dn;
          for (pi = 0; pi < patch.length && ok; pi++) {
            g = patch[pi]; gx = g % cols; gy = (g / cols) | 0;
            for (ddy = -1; ddy <= 1 && ok; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
              if (!ddx && !ddy) continue; xx = gx + ddx; yy = gy + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              f = yy * cols + xx; if (inP.has(f) || reg[f] !== nr) continue;
              nIn++; dn = dEk(orig.get(f), bestK);
              if (dn > NEIGH_DE) { ok = false; break; }
              ntal.set(orig.get(f), (ntal.get(orig.get(f)) || 0) + 1);
            }
          }
          if (ok && nIn > 0) {
            var bk = -1, bn = -1;
            ntal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
            to = bk;
          }
        }
        if (to < 0) continue;
        for (pi = 0; pi < patch.length; pi++) modeKey[patch[pi]] = to;
      }
      nr++;
    }
    // walled-in pieces of a tone take the tone's colour from elsewhere in the picture
    var byTone = new Map();
    regions.forEach(function (r) { var a = byTone.get(r.t); if (!a) { a = []; byTone.set(r.t, a); } a.push(r); });
    byTone.forEach(function (rs, t2) {
      if (rs.length < 2) return;
      var all = [];
      rs.forEach(function (r) { for (var i2 = 0; i2 < r.cells.length; i2++) all.push(r.cells[i2]); });
      var G = medoid(all, t2); if (G < 0) return;
      rs.forEach(function (r) {
        if (r.cells.length > SMALLREG_MAX) return;
        if (!r.cells.every(function (q) { return winShare(q) < SPECK_COVER; })) return;
        var k0 = modeKey[r.cells[0]];
        if (!r.cells.every(function (q) { return dEk(modeKey[q], k0) < PATCH_DE; })) return;
        var dg = dEk(k0, G);
        if (dg < PATCH_DE || dg > SPECK_DE) return;
        var tal = new Map(), tk = G, tn = -1;
        rs.forEach(function (r2) { if (r2 === r) return; for (var i3 = 0; i3 < r2.cells.length; i3++) { var kk = modeKey[r2.cells[i3]]; if (dEk(kk, G) < PATCH_DE) tal.set(kk, (tal.get(kk) || 0) + 1); } });
        tal.forEach(function (v, k) { if (v > tn || (v === tn && k < tk)) { tn = v; tk = k; } });
        for (var i4 = 0; i4 < r.cells.length; i4++) modeKey[r.cells[i4]] = tk;
      });
    });
  }

  /* ---------------------------------------------------------- PIECES (size 16)
     A piece is one LINE family's own 8-connected pixels (I.line): a collar
     line inside a grey shirt is one piece, the shirt another. Shared by
     STROKE and by KEEP. Built once per picture, and only when a size-16 rule
     is on, so size 8 never pays for it. */
  function pieces(I) {
    var w = I.w, h = I.h, N = w * h, fam = I.line, famPix = new Int32Array(N), i, x, y, dx, dy, xx, yy, j, s, sp;
    for (i = 0; i < N; i++) famPix[i] = I.paint[i] ? fam[I.lab[i]] : -1;
    var comp = new Int32Array(N).fill(-1), nc = 0, stack = new Int32Array(N), compFam = [], compPx = [];
    for (s = 0; s < N; s++) {
      if (famPix[s] < 0 || comp[s] >= 0) continue;
      var f0 = famPix[s], cntc = 0;
      sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp) {
        i = stack[--sp]; cntc++; x = i % w; y = (i / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; xx = x + dx; yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          j = yy * w + xx; if (famPix[j] === f0 && comp[j] < 0) { comp[j] = nc; stack[sp++] = j; }
        }
      }
      compFam.push(f0); compPx.push(cntc); nc++;
    }
    /* the colour OUTSIDE a piece: the family of the biggest other piece its pixels touch. An
       outline goes round the smaller shape: a white outline between a yellow letter and a navy
       hoodie has navy outside, so the letter is the shape it outlines. */
    var outBest = null;
    function outsideOf(pc) {
      if (pc < 0) return -1;
      if (!outBest) {
        outBest = new Int32Array(nc).fill(-1);
        var u, v, k2, dx2, dy2, o2, p2;
        for (k2 = 0; k2 < N; k2++) {
          p2 = comp[k2]; if (p2 < 0) continue; u = k2 % w; v = (k2 / w) | 0;
          for (dy2 = -1; dy2 <= 1; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) {
            if (u + dx2 < 0 || v + dy2 < 0 || u + dx2 >= w || v + dy2 >= h) continue;
            o2 = comp[k2 + dy2 * w + dx2];
            if (o2 >= 0 && o2 !== p2 && (outBest[p2] < 0 || compPx[o2] > compPx[outBest[p2]] || (compPx[o2] === compPx[outBest[p2]] && o2 < outBest[p2]))) outBest[p2] = o2;
          }
        }
      }
      return outBest[pc] >= 0 ? compFam[outBest[pc]] : -1;
    }
    /* how deep each pixel sits inside its own family (chessboard px to the nearest pixel of
       another family or of transparency; the picture's edge is not a boundary) */
    var depth = null;
    function depthMap() {
      if (depth) return depth;
      depth = new Int32Array(N); var BIG = 1 << 20, f;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; f = famPix[i]; if (f < 0) { depth[i] = 0; continue; }
        var edge = false;
        for (dy = -1; dy <= 1 && !edge; dy++) for (dx = -1; dx <= 1; dx++) {
          xx = x + dx; yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (famPix[yy * w + xx] !== f) { edge = true; break; }
        }
        depth[i] = edge ? 1 : BIG;
      }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; if (depth[i] <= 1) continue;
        if (x > 0) depth[i] = Math.min(depth[i], depth[i - 1] + 1);
        if (y > 0) { depth[i] = Math.min(depth[i], depth[i - w] + 1); if (x > 0) depth[i] = Math.min(depth[i], depth[i - w - 1] + 1); if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i - w + 1] + 1); }
      }
      for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
        i = y * w + x; if (depth[i] <= 1) continue;
        if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i + 1] + 1);
        if (y + 1 < h) { depth[i] = Math.min(depth[i], depth[i + w] + 1); if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i + w + 1] + 1); if (x > 0) depth[i] = Math.min(depth[i], depth[i + w - 1] + 1); }
      }
      return depth;
    }
    /* transparency that is a HOLE: empty pixels not 4-connected to the picture's edge */
    var holes = null;
    function holeMap() {
      if (holes) return holes;
      holes = new Uint8Array(N); var reach = new Uint8Array(N), st = new Int32Array(N), n2 = 0, k, kx;
      for (k = 0; k < N; k++) { kx = k % w; if (famPix[k] < 0 && (kx === 0 || kx === w - 1 || k < w || k >= N - w)) { reach[k] = 1; st[n2++] = k; } }
      while (n2) {
        k = st[--n2]; kx = k % w;
        if (kx > 0 && !reach[k - 1] && famPix[k - 1] < 0) { reach[k - 1] = 1; st[n2++] = k - 1; }
        if (kx + 1 < w && !reach[k + 1] && famPix[k + 1] < 0) { reach[k + 1] = 1; st[n2++] = k + 1; }
        if (k >= w && !reach[k - w] && famPix[k - w] < 0) { reach[k - w] = 1; st[n2++] = k - w; }
        if (k + w < N && !reach[k + w] && famPix[k + w] < 0) { reach[k + w] = 1; st[n2++] = k + w; }
      }
      for (k = 0; k < N; k++) if (famPix[k] < 0 && !reach[k]) holes[k] = 1;
      return holes;
    }
    return { famPix: famPix, comp: comp, nc: nc, compFam: compFam, compPx: compPx, outsideOf: outsideOf, depthMap: depthMap, holeMap: holeMap };
  }

  /* KEEP (size 16): what a line rule may not replace. A cell whose colour is
     the shape a line outlines (the piece's outside is another colour) keeps
     its colour: GATE Hoodie's white outline must not turn the yellow letter
     cells white. A cell whose colour is itself a line there (no thicker than
     KEEP_THIN of a cell inside that cell) keeps it: one line is not drawn by
     cutting another (STROKE turned GATE's thin white outline yellow). */
  function keeper(P, I, cols, rows, S) {
    var fam = I.line, cell = I.cell, w = I.w, thin = new Map();
    /* SILHOUETTE (round 5): the line pc is the shape's outline against the OUTSIDE transparency here, so the
       cell's colour gf is what it outlines, never its outside. outsideOf counts painted pieces only, so for an
       outline on transparency the one colour it touches - the shape it goes round - read as its outside, and
       the line took that shape's cells: Eight Lines Specs lost the cream rim of both lenses (its only cell
       across) to the black outline, AirPod and Small White Figure got black inside the white body. Local, in
       the 3 x 3 cells round g: an inner line that meets the silhouette somewhere else (Dogecoin Polo's
       placket) keeps today's KEEP rule. */
    /* MEMO KEYS (round 6 judge): pc * NCELL + g, one number per (piece, cell) pair. The round-5 key
       g * 65536 + pc collided once a picture had more than 65,536 pixel pieces, which a background now
       reaching these rules has (R Place Mosaic: 115,129 at 16); g < NCELL makes this key exact. */
    var NCELL = cols * rows;
    var edgeMemo = new Map();
    function edgeAt(g, gf, pc) {
      var key = pc * NCELL + g; if (edgeMemo.has(key)) return edgeMemo.get(key);
      var H2 = P.holeMap(), hh = I.h, gx = g % cols, gy = (g / cols) | 0;
      var x0 = Math.max(0, (gx - 1) * S), y0 = Math.max(0, (gy - 1) * S), x1 = Math.min(w, (gx + 2) * S), y1 = Math.min(hh, (gy + 2) * S);
      var tc = 0, oc = 0, u, v, k, dd, j, xx2, yy2, DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
      for (v = y0; v < y1; v++) for (u = x0; u < x1; u++) {
        k = v * w + u; if (P.comp[k] !== pc) continue;
        for (dd = 0; dd < 4; dd++) {
          xx2 = u + DX[dd]; yy2 = v + DY[dd]; if (xx2 < 0 || yy2 < 0 || xx2 >= w || yy2 >= hh) continue;
          j = yy2 * w + xx2;
          if (P.famPix[j] < 0) { if (!H2[j]) tc++; }
          else if (P.famPix[j] === gf) oc++;
        }
      }
      var r = tc >= EDGE_MINPX && tc >= EDGE_OUT * oc; edgeMemo.set(key, r); return r;
    }
    /* is the piece pc a line where it crosses cell g (no thicker than KEEP_THIN of a cell there)? */
    var thinP = new Map();
    function thinPiece(g, pc) {
      var key = pc * NCELL + g; if (thinP.has(key)) return thinP.get(key);
      var D = P.depthMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, mx = 0, u, v, k;
      for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.comp[k] === pc && D[k] > mx) mx = D[k]; }
      var r = 2 * mx <= STROKE_THICK * S; thinP.set(key, r); return r;
    }
    function thinAt(g, gf) {
      var key = g * 4096 + gf; if (thin.has(key)) return thin.get(key);
      var D = P.depthMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, mx = 0, u, v, k;
      for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.famPix[k] === gf && D[k] > mx) mx = D[k]; }
      var r = 2 * mx <= KEEP_THIN * S; thin.set(key, r); return r;
    }
    return {
      bandPiece: function (f, ax, ay, lo, hi, horiz) {
        var cnt = new Map(), best = -1, bn = 0, uu, vv, xx, yy, ii, pc;
        for (uu = lo; uu <= hi; uu++) for (vv = 0; vv < S; vv++) {
          xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * w + xx;
          if (P.famPix[ii] !== f) continue; pc = P.comp[ii]; cnt.set(pc, (cnt.get(pc) || 0) + 1);
        }
        cnt.forEach(function (v2, k2) { if (v2 > bn || (v2 === bn && k2 < best)) { bn = v2; best = k2; } });
        return best;
      },
      inHole: function (g) {
        // an empty cell whose transparency is mostly a HOLE in the art (an eye slit, a lens), not the outside
        var H2 = P.holeMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, hole = 0, out = 0, u, v, k;
        for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.famPix[k] >= 0) continue; if (H2[k]) hole++; else out++; }
        return hole > out;
      },
      mayTake: function (g, gf, pc, stroke) {
        var out = P.outsideOf(pc);
        if (out >= 0 && gf !== out) return false;
        if (stroke && edgeAt(g, gf, pc)) return false;
        return !thinAt(g, gf);
      },
      edgeAt: edgeAt,
      thinPiece: thinPiece
    };
  }

  /* ---------------------------------------------------------- 4. STROKE (size 16)
     A drawn line thinner than a cell, drawn ON a fill (a collar line on the
     shirt, a white outline round a letter): CONNECT only sees paint on
     transparency, so on a fill the line has no piece of its own and comes out
     as dots. A stroke is one piece (see PIECES).
     A GAP is two cells showing the stroke's family, each holding at least
     STROKE_MINPX cell-widths of its pixels, 2..STROKE_MAXLEN+1 cells apart, that
       - are not joined by cells of that family inside the box around them
         (one cell of margin): a gap, not two ends of one shown line; and
       - ARE joined by the stroke's own pixels inside that box, by a path no
         longer than STROKE_BEND x the distance between the cell centres plus
         a cell: the source runs straight across the gap (two parallel lines
         that meet far away are not a gap).
     The gap is filled by the fewest cells that hold the stroke (each at least
     STROKE_MINCOV of the cell; the cheapest holds most of it), and only cells
       - already opaque: an added cell on the silhouette was outlined into a
         bump by the outline pass (Sorcerer Hunter, Cannabis Trucker);
       - whose winner differs from the family by LINE_CON_DE (a line contrasts);
       - whose own colour is not a one-cell line there (the ring test) and that
         KEEP lets it take (the outside colour, and not itself a line);
       - preferring cells whose own colour holds less of them (STROKE_HELD).
     Every added cell joins two shown pieces, so it cannot hang a cell off a
     clean outline: a clean outline has no gap. */
  function stroke(win, opaque, I, cols, rows, K, S, P, G) {
    var w = I.w, n = cols * rows, fam = I.line, cell = I.cell, N = I.w * I.h, i, dx, dy, xx, yy, j;
    var comp = P.comp, nc = P.nc, compFam = P.compFam, compPx = P.compPx, made = new Uint8Array(n);
    var minPx = STROKE_MINPX * S;
    var cellPieces = new Array(n), c, m;
    for (i = 0; i < N; i++) {
      if (comp[i] < 0 || compPx[comp[i]] < 2 * minPx) continue; c = cell[i];
      m = cellPieces[c]; if (!m) { m = new Map(); cellPieces[c] = m; }
      m.set(comp[i], (m.get(comp[i]) || 0) + 1);
    }
    function pxOf(c1, pc) { return cellPieces[c1] ? (cellPieces[c1].get(pc) || 0) : 0; }
    function shows(c1, f) { return opaque[c1] && fam[win[c1]] === f; }
    var dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
    // are cells a and b joined by pixels of piece pc inside box [bx0..bx1] x [by0..by1] (cells), within maxSteps?
    function srcJoined(pc, a, b, bx0, by0, bx1, by1, maxSteps) {
      var px0 = bx0 * S, py0 = by0 * S, px1 = (bx1 + 1) * S, py1 = (by1 + 1) * S, qh = 0, qt = 0, touched = [], ok = false, u, v, k, ax = (a % cols) * S, ay = ((a / cols) | 0) * S;
      for (v = ay; v < ay + S; v++) for (u = ax; u < ax + S; u++) { k = v * w + u; if (comp[k] === pc) { dist[k] = 0; q[qt++] = k; touched.push(k); } }
      while (qh < qt && !ok) {
        k = q[qh++]; if (cell[k] === b) { ok = true; break; }
        if (dist[k] >= maxSteps) continue;
        u = k % w; v = (k / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          xx = u + dx; yy = v + dy; if (xx < px0 || yy < py0 || xx >= px1 || yy >= py1) continue;
          j = yy * w + xx; if (comp[j] !== pc || dist[j] >= 0) continue;
          dist[j] = dist[k] + 1; q[qt++] = j; touched.push(j);
        }
      }
      for (k = 0; k < touched.length; k++) dist[touched[k]] = -1;
      return ok;
    }
    // are a and b joined by cells showing f inside the box?
    function outJoined(f, a, b, bx0, by0, bx1, by1) {
      var seen = new Set([a]), st = [a], e, ex, ey, ddx, ddy, gx, gy, g;
      while (st.length) {
        e = st.pop(); if (e === b) return true; ex = e % cols; ey = (e / cols) | 0;
        for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
          gx = ex + ddx; gy = ey + ddy; if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) continue;
          g = gy * cols + gx; if (!seen.has(g) && shows(g, f)) { seen.add(g); st.push(g); }
        }
      }
      return false;
    }
    var R = STROKE_MAXLEN + 1, pcs = [];
    for (var pc0 = 0; pc0 < nc; pc0++) if (compPx[pc0] >= 2 * minPx) pcs.push(pc0);
    pcs.sort(function (p, q2) { return compPx[q2] - compPx[p] || p - q2; });
    pcs.forEach(function (pc) {
      var f = compFam[pc], ends = [], c1, a, b, ka, kb;
      for (c1 = 0; c1 < n; c1++) if (shows(c1, f) && pxOf(c1, pc) >= minPx) ends.push(c1);
      var pairs = [];
      for (ka = 0; ka < ends.length; ka++) for (kb = ka + 1; kb < ends.length; kb++) {
        a = ends[ka]; b = ends[kb];
        var ddx0 = Math.abs(a % cols - b % cols), ddy0 = Math.abs(((a / cols) | 0) - ((b / cols) | 0)), ch = Math.max(ddx0, ddy0);
        if (ch < 2 || ch > R) continue;
        pairs.push([ch, Math.hypot(ddx0, ddy0), a, b]);
      }
      pairs.sort(function (p, q2) { return p[0] - q2[0] || p[1] - q2[1] || p[2] - q2[2] || p[3] - q2[3]; });
      pairs.forEach(function (pr) {
        var a2 = pr[2], b2 = pr[3], ax = a2 % cols, ay = (a2 / cols) | 0, bx = b2 % cols, by = (b2 / cols) | 0;
        var bx0 = Math.max(0, Math.min(ax, bx) - 1), by0 = Math.max(0, Math.min(ay, by) - 1), bx1 = Math.min(cols - 1, Math.max(ax, bx) + 1), by1 = Math.min(rows - 1, Math.max(ay, by) + 1);
        if (outJoined(f, a2, b2, bx0, by0, bx1, by1)) return;
        // round 5: STROKE joins a LINE; a piece as thick as a cell at either end is a fill (Diagonal Reflection
        // Glasses: the black lens was 'joined' across its own white highlight, which broke the highlight)
        if (G && (!G.thinPiece(a2, pc) || !G.thinPiece(b2, pc))) return;
        if (!srcJoined(pc, a2, b2, bx0, by0, bx1, by1, Math.round(STROKE_BEND * pr[1] * S + S))) return;
        // fewest cells holding the stroke, inside the box (cells change only after a path is found)
        var best = new Map(), heap = [[0, 0, a2, -1]], prev = new Map(), top, e, ex, ey, ddx, ddy, gx, gy, g, cv, cost, hit = false;
        best.set(a2, 0);
        while (heap.length) {
          heap.sort(function (p, q2) { return p[0] - q2[0] || p[2] - q2[2]; });
          top = heap.shift(); e = top[2];
          if (top[0] > best.get(e)) continue;
          if (e === b2) { hit = true; break; }
          ex = e % cols; ey = (e / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; gx = ex + ddx; gy = ey + ddy; if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) continue;
            g = gy * cols + gx;
            if (g === b2) cost = top[0];
            else {
              if (shows(g, f)) continue;                                   // through the gap only
              cv = pxOf(g, pc) / (I.cellN[g] || 1);
              if (cv < STROKE_MINCOV || made[g]) continue;
              if (!opaque[g]) continue;                                    // on transparency CONNECT does it
              if (I.dE[fam[win[g]] * K + f] < LINE_CON_DE) continue;
              if (top[1] + 1 > STROKE_MAXLEN) continue;
              // never through a cell whose own colour is a line one cell wide there (it would be cut)
              var gf = fam[win[g]], rg = [], r8, rx, ry;
              for (r8 = 0; r8 < 8; r8++) { rx = gx + RING[r8][0]; ry = gy + RING[r8][1]; rg.push(rx >= 0 && ry >= 0 && rx < cols && ry < rows && shows(ry * cols + rx, gf) ? 1 : 0); }
              if (ringPieces(rg) > 1) continue;
              // an outline goes round the smaller shape: only the outside colour gives way
              if (G) { if (!G.mayTake(g, gf, pc, true)) continue; }
              else if (gf !== P.outsideOf(pc)) continue;
              cost = top[0] + 1.05 - cv + STROKE_HELD * I.cov[g * K + gf];
            }
            if (!best.has(g) || cost < best.get(g)) { best.set(g, cost); prev.set(g, e); heap.push([cost, g === b2 ? top[1] : top[1] + 1, g]); }
          }
        }
        if (!hit) return;
        var cb = prev.get(b2), path = [];
        while (cb !== undefined && cb !== a2) { path.push(cb); cb = prev.get(cb); }
        path.forEach(function (pcell) {
          // the label drawing the stroke here: most of the stroke's own pixels in this cell
          var cnt = new Map(), bl = -1, bw = 0, u, v, k2, px0 = (pcell % cols) * S, py0 = ((pcell / cols) | 0) * S;
          for (v = py0; v < py0 + S; v++) for (u = px0; u < px0 + S; u++) { k2 = v * w + u; if (comp[k2] === pc) cnt.set(I.lab[k2], (cnt.get(I.lab[k2]) || 0) + 1); }
          cnt.forEach(function (vv, l2) { if (vv > bw || (vv === bw && l2 < bl)) { bw = vv; bl = l2; } });
          if (bl < 0) return;
          win[pcell] = bl; opaque[pcell] = 1; made[pcell] = 1;
        });
      });
    });
  }


  /* GATE (Pixel size 16 only: rules.gate; round 4). The page's outline pass (fixOutlineOnce in index.html)
     picks the shapes it works on from the CELLS: an 8-connected shape of at least 200 cells with at least 6
     cells touching empty space, whose edge cells are at least half pure black (or 60% near-black, luminance
     <= 16). A shape it picks gets every dark edge cell painted black and its doubled border peeled; a shape
     it skips is left alone (or, with the source picture, gets only its drawn line back). So when a rule
     adds a few black cells to an edge, the pass can switch on for the whole shape and repaint far more
     than the rule did: Desert Jedi Robes - 2 black cells added to the right outline, then the pass painted
     the dark-brown sleeve's left column black where the source draws a hairline and peeled its dark
     shading strip to peach (round 3: 175 cells changed for 42 the rules made). Cyclops Ruby Visor - a
     black edge added along the temple arm, then the pass peeled the visor's black left frame to grey.
     The guard paints today's vote and the repaired vote the same way (stage 2, before the palette),
     applies the pass's test to both, and wherever a shape's answer differs it puts back today's cells
     for every cell the rules changed in that shape (and in the shape it overlaps most on the other side);
     repeated, as an undo can join or split shapes, at most GATE_ROUNDS times.
     THE PASS'S NUMBERS COME FROM THE PAGE (round 6): colour.gate is the page's OUTLINE_GATE, the object
     fixOutlineOnce itself reads, sent with the message (fixLines16Gate). Superseded (rounds 4-5): a private
     copy here (GATE_FRAC 0.5, GATE_NEAR_FRAC 0.6, GATE_MIN_AREA 200, GATE_MIN_RING 6, GATE_NEAR_LUM 16) that
     had to "follow" the pass by hand; patch620 then gave the pass's gate a dark-grey near-black (nearG:
     luminance <= NEAR_GATE_LUM 22.5, channels within NEAR_GATE_SPREAD 6) and the copy did not follow - a
     copy drifts silently. A missing number throws by name: a guard asking a different question from the
     pass would look like a guard. Near-black here is the pass's nearG exactly (luminance <= NEAR_BLACK_LUM,
     or a grey within NEAR_GATE_SPREAD up to NEAR_GATE_LUM), and a shape is picked by the pass's own
     comparisons (pure >= OUTLINED_FRAC x ring, or near >= OUTLINED_NEAR_FRAC x ring).
     Still a difference from the pass, by place not by number: the guard tests the cells after the
     page's palette step (colour.snap) but before the pass's source gate [S1], which can pick a shape the
     cell test skips; the guard does not ask that question. */
  var GATE_ROUNDS = 4, GATE_DECISIVE = 1.5;
  var GATE_KEYS = ['OUTLINED_FRAC', 'OUTLINED_NEAR_FRAC', 'MIN_AREA', 'MIN_RING', 'NEAR_BLACK_LUM', 'NEAR_GATE_LUM', 'NEAR_GATE_SPREAD'];
  function gateNumbers(g) {
    if (!g || typeof g !== 'object') throw new Error('pf-42-repair8.js: colour.gate must be the page\'s outline gate (OUTLINE_GATE), got ' + typeof g);
    GATE_KEYS.forEach(function (k) {
      if (typeof g[k] !== 'number' || !isFinite(g[k])) throw new Error('pf-42-repair8.js: colour.gate.' + k + ' is missing -- the page sends OUTLINE_GATE');
    });
    return g;
  }
  function gateParts(c, cols, rows, GT) {
    var n = cols * rows, part = new Int32Array(n).fill(-1), q = new Int32Array(n), np = 0, i, a, x, y, dx, dy, j, qh, qt, p;
    var area = [], ring = [], pure = [], near = [];
    function op(k) { return c[k * 4 + 3] >= 128; }
    for (i = 0; i < n; i++) {
      if (!op(i) || part[i] >= 0) continue;
      p = np++; area.push(0); ring.push(0); pure.push(0); near.push(0);
      qh = 0; qt = 0; q[qt++] = i; part[i] = p;
      while (qh < qt) {
        a = q[qh++]; x = a % cols; y = (a / cols) | 0; area[p]++;
        if ((x > 0 && !op(a - 1)) || (x < cols - 1 && !op(a + 1)) || (y > 0 && !op(a - cols)) || (y < rows - 1 && !op(a + cols))) {
          ring[p]++;
          var r0 = c[a * 4], g0 = c[a * 4 + 1], b0 = c[a * 4 + 2];
          if (!r0 && !g0 && !b0) pure[p]++;
          var lum0 = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;   // the pass's nearG
          if (lum0 <= GT.NEAR_BLACK_LUM || (lum0 <= GT.NEAR_GATE_LUM && Math.max(r0, g0, b0) - Math.min(r0, g0, b0) <= GT.NEAR_GATE_SPREAD)) near[p]++;
        }
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          j = ny * cols + nx; if (op(j) && part[j] < 0) { part[j] = p; q[qt++] = j; }
        }
      }
    }
    var sel = new Uint8Array(np), score = new Float64Array(np);
    for (p = 0; p < np; p++) {
      score[p] = ring[p] ? Math.max(pure[p] / (GT.OUTLINED_FRAC * ring[p]), near[p] / (GT.OUTLINED_NEAR_FRAC * ring[p])) : 0;
      sel[p] = (area[p] >= GT.MIN_AREA && ring[p] >= GT.MIN_RING &&
        (pure[p] >= GT.OUTLINED_FRAC * ring[p] || near[p] >= GT.OUTLINED_NEAR_FRAC * ring[p])) ? 1 : 0;
    }
    return { part: part, n: np, sel: sel, area: area, score: score };
  }
  /* shapes whose answer differs between today's cells (lowT) and the repaired ones (low); undo = the
     rule-changed cells to put back */
  function gateFlips(lowT, low, winT, opaqueT, win, opaque, cols, rows, GT) {
    var n = cols * rows, A = gateParts(lowT, cols, rows, GT), B = gateParts(low, cols, rows, GT), i, p, q;
    var bad = new Uint8Array(B.n), badA = new Uint8Array(A.n), k = 0;
    function match(X, Y, from) {   // for each part of X, the part of Y it overlaps most
      var best = new Int32Array(X.n).fill(-1), cnt = new Map(), key;
      for (i = 0; i < n; i++) { p = X.part[i]; q = Y.part[i]; if (p < 0 || q < 0) continue; key = p * 65536 + q; cnt.set(key, (cnt.get(key) || 0) + 1); }
      var bn = new Float64Array(X.n);
      cnt.forEach(function (v, kk) { var pp = Math.floor(kk / 65536), qq = kk % 65536; if (v > bn[pp] || (v === bn[pp] && qq < best[pp])) { bn[pp] = v; best[pp] = qq; } });
      return best;
    }
    var bToA = match(B, A), aToB = match(A, B);
    // a shape the rules switch ON decisively (its edge is now plainly a black outline: score >= GATE_DECISIVE,
    // e.g. Noun Glasses Original, whose missing frame the rules restore: pure-black edge share 0.46 -> 1.00) is
    // left switched on; any other change of answer is undone
    for (p = 0; p < B.n; p++) { q = bToA[p]; var sa = q >= 0 ? A.sel[q] : 0; if (sa !== B.sel[p] && !(B.sel[p] && B.score[p] >= GATE_DECISIVE)) { bad[p] = 1; if (q >= 0) badA[q] = 1; k++; } }
    for (q = 0; q < A.n; q++) { p = aToB[q]; var sb = p >= 0 ? B.sel[p] : 0; if (sb !== A.sel[q] && !(sb && B.score[p] >= GATE_DECISIVE)) { badA[q] = 1; if (p >= 0) bad[p] = 1; k++; } }
    var undo = new Uint8Array(n), m = 0;
    if (k) for (i = 0; i < n; i++) {
      if (win[i] === winT[i] && opaque[i] === opaqueT[i]) continue;
      if ((B.part[i] >= 0 && bad[B.part[i]]) || (A.part[i] >= 0 && badA[A.part[i]])) { undo[i] = 1; m++; }
    }
    return { n: m, undo: undo };
  }

  /* PALETTE (round 6, every size; colour.snap = the page's own palette step, given when it is on).
     The page's palette step does not map each colour on its own: it groups the cells' colours by count
     and gives the groups palette colours together, keeping drawn shades apart where it can (snapToPalette,
     patch617/620). So a repair that changes a handful of cells can change the counts enough to move the
     palette's answer for hundreds it never touched: Walnut Chessboard Skin at 8 - the specks rule
     recoloured 4 cells, and the palette then put all 201 dark-grain cells (#613105) on the dark square's
     brown (#954209): the grain was gone. Measured over the 311 traits at 8 with the repairs on every
     picture: 8,139 such cells in 45 files (backgrounds, skins, a few costumes and clothing), none of them
     a line. The guard paints the vote with no rule at all and the repaired vote, snaps copies of both
     with the page's palette step, and finds the cells the rules did not change whose palette colour
     changed anyway. Up to PALETTE_SHARE of the cells the rules changed is let through: restoring a line
     adds cells of its colour, and the palette may answer that colour's shades a little differently
     (Circuit Board Skin at 16: 145 trace cells restored, 6 gold cells moved between two golds; refusing
     that took back every trace). Beyond it (Walnut: 192 moved for 4 repaired; Anfield Tunnel at 16: the
     left wall's dark-red shading merged into the red, 198 for 32), the rule-changed cells that sit on a palette colour involved in
     that move (the knocked cells' colour before or after) go back to the vote's own cell, and it is
     asked again, at most GUARD_ROUNDS times; if the palette still moves, the picture keeps the cells the
     vote made (no rule). A rule-changed cell on any other palette colour stays repaired. */
  var GUARD_ROUNDS = 6, PALETTE_SHARE = 0.25;
  function paletteKnock(lowP, low, seenP, seenX, n) {
    var changed = new Uint8Array(n), inv = new Set(), c, o, k = 0, m = 0, undo = new Uint8Array(n);
    function key(a, o2) { return a[o2 + 3] < 128 ? -1 : (a[o2] << 16) | (a[o2 + 1] << 8) | a[o2 + 2]; }
    for (c = 0, o = 0; c < n; c++, o += 4) {
      if (low[o] !== lowP[o] || low[o + 1] !== lowP[o + 1] || low[o + 2] !== lowP[o + 2] || low[o + 3] !== lowP[o + 3]) { changed[c] = 1; continue; }
      if (key(seenP, o) !== key(seenX, o)) { k++; inv.add(key(seenP, o)); inv.add(key(seenX, o)); }
    }
    var nch = 0; for (c = 0; c < n; c++) nch += changed[c];
    if (k <= PALETTE_SHARE * nch) return { n: 0, knocked: k, undo: undo };   // in proportion to what was repaired
    inv.delete(-1);
    for (c = 0, o = 0; c < n; c++, o += 4) if (changed[c] && (inv.has(key(seenP, o)) || inv.has(key(seenX, o)))) { undo[c] = 1; m++; }
    if (!m) for (c = 0; c < n; c++) if (changed[c]) { undo[c] = 1; m++; }   // the cause is not on those colours: all of it
    return { n: m, knocked: k, undo: undo };
  }

  /* ---------------------------------------------------------- the pack */
  PF.repair8_pack = function (rgba, cols, rows, colour, rules) {
    need('adaptive_k', 'pf-40-reconstruct.js'); need('kmeans_quantize', 'pf-11-quantize.js');
    ['clipScalar', 'argmax', 'npMaximum', 'rint'].forEach(function (nm) { need(nm, 'pf-00-base.js'); });
    if (!colour || typeof colour.labOf !== 'function') throw new Error('pf-42-repair8.js: colour.labOf is missing -- pass the page\'s labOf');
    if (typeof colour.deltaE2000 !== 'function') throw new Error('pf-42-repair8.js: colour.deltaE2000 is missing -- pass the page\'s deltaE2000');
    if (!rgba || typeof rgba !== 'object') throw new Error('PF.repair8_pack: expected a {d, w, h, cn} image');
    var d = rgba.d, w = rgba.w | 0, h = rgba.h | 0, cn = (rgba.cn === undefined || rgba.cn === null) ? 4 : (rgba.cn | 0);
    if (!(d instanceof Uint8Array || d instanceof Uint8ClampedArray)) throw new Error('PF.repair8_pack: d must be a Uint8Array or Uint8ClampedArray');
    if (w <= 0 || h <= 0) throw new Error('PF.repair8_pack: empty image (' + w + 'x' + h + ')');
    if (cn !== 4) throw new Error('PF.repair8_pack: RGBA only (cn 4), got cn ' + cn);
    if (d.length !== w * h * 4) throw new Error('PF.repair8_pack: d.length ' + d.length + ' != w*h*4 ' + (w * h * 4));
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.repair8_pack: cols and rows must be >= 1');
    var N = w * h, n = cols * rows, i, c, ch, x, y, b, p, q;

    // stage 1, two_stage_pack's: k-means labels, centre-weighted vote; alpha-0 pixels do not vote
    var K = PF.adaptive_k(rgba);
    var lab = PF.kmeans_quantize(rgba, K).labels.d;
    var maxLab = 0;
    for (i = 0; i < N; i++) if (lab[i] > maxLab) maxLab = lab[i];
    K = maxLab + 1;
    var rgb = new Float64Array(3 * N);
    for (i = 0, b = 0; i < N; i++, b += 4) { rgb[3 * i] = d[b] / 255.0; rgb[3 * i + 1] = d[b + 1] / 255.0; rgb[3 * i + 2] = d[b + 2] / 255.0; }
    var ix = new Int32Array(w), iy = new Int32Array(h);
    for (x = 0; x < w; x++) ix[x] = PF.clipScalar(Math.floor((x * cols) / w), 0, cols - 1);
    for (y = 0; y < h; y++) iy[y] = PF.clipScalar(Math.floor((y * rows) / h), 0, rows - 1);
    var wc = w / cols, hr = h / rows, wx = new Float64Array(w), wy = new Float64Array(h), fx, fy;
    for (x = 0; x < w; x++) { fx = ((x + 0.5) - ix[x] * wc) / wc; wx[x] = 1.0 - 2.0 * Math.abs(fx - 0.5); }
    for (y = 0; y < h; y++) { fy = ((y + 0.5) - iy[y] * hr) / hr; wy[y] = 1.0 - 2.0 * Math.abs(fy - 0.5); }
    var cell = new Int32Array(N), wgt = new Float64Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; cell[i] = iy[y] * cols + ix[x];
      wgt[i] = !d[i * 4 + 3] ? 0 : (wy[y] * wx[x] + 1e-4);
    }
    var csr = csrByCell(cell, N, n), offs = csr.offs, order = csr.order;
    var acc = new Float64Array(K), win = new Int32Array(n), ACC = new Float64Array(n * K);
    for (c = 0; c < n; c++) {
      acc.fill(0);
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; acc[lab[q]] += wgt[q]; }
      win[c] = PF.argmax(acc);
      ACC.set(acc, c * K);
    }
    var cntf = new Float64Array(n);
    for (c = 0; c < n; c++) cntf[c] = Math.max(offs[c + 1] - offs[c], 1);
    // opaque when more than half the cell's pixels have alpha > 127 (two_stage_pack's rule)
    var opaque = new Uint8Array(n), asum = new Float64Array(n);
    for (i = 0; i < N; i++) asum[cell[i]] += (d[i * 4 + 3] > 127) ? 1.0 : 0.0;
    for (c = 0; c < n; c++) opaque[c] = (asum[c] / cntf[c] > 0.5) ? 1 : 0;

    // repairs 1 and 2 decide which label wins and which cells are opaque
    var I = facts(d, w, h, N, lab, K, cell, n, cols, rows, colour);
    // rules (size 16): which repairs run, and STROKE and KEEP; none given = size 8's set exactly
    var R = rules || null, on = function (k) { return !R || R[k] !== false; };
    var S16 = w / cols, square = S16 === h / rows && S16 === Math.floor(S16);
    var winT = new Int32Array(win), opaqueT = new Uint8Array(opaque);   // today's vote, for the guards
    var P = (R && square && (R.stroke || R.keep)) ? pieces(I) : null;
    var G = (P && R.keep) ? keeper(P, I, cols, rows, S16) : null;
    if (P && R.stroke) stroke(win, opaque, I, cols, rows, K, S16, P, G);
    if (on('rescue')) rescue(win, opaque, I, cols, rows, K, ACC, G);
    var bridges = [];
    if (on('connect')) connect(win, opaque, I, cols, rows, K, ACC, bridges);

    // stage 2 as a function of the vote (win, opaque), so the GATE guard can paint today's vote too;
    // the code inside is the round-3 text unchanged (seam: rules absent == live repair8_pack)
    function paint(win, opaque, bridges, doSpecks, veto) {
      // stage 2, two_stage_pack's: the weighted MODE of the exact colours carrying the
      // winning label (invents nothing); the weighted mean only for a cell with none
      var denom = new Float64Array(n), sums = new Float64Array(3 * n), selcnt = new Float64Array(n), sel, ws;
      for (i = 0; i < N; i++) {
        c = cell[i]; sel = lab[i] === win[c]; ws = sel ? wgt[i] : 0.0;
        denom[c] += ws; sums[3 * c] += rgb[3 * i] * ws; sums[3 * c + 1] += rgb[3 * i + 1] * ws; sums[3 * c + 2] += rgb[3 * i + 2] * ws;
        selcnt[c] += sel ? 1.0 : 0.0;
      }
      var out = new Float64Array(3 * n), dn, anyBad = false;
      for (c = 0; c < n; c++) {
        dn = PF.npMaximum(denom[c], 1e-9);
        out[3 * c] = sums[3 * c] / dn; out[3 * c + 1] = sums[3 * c + 1] / dn; out[3 * c + 2] = sums[3 * c + 2] / dn;
        if (selcnt[c] < 0.5) anyBad = true;
      }
      if (anyBad) {
        var msum = new Float64Array(3 * n);
        for (i = 0; i < N; i++) { c = cell[i]; msum[3 * c] += rgb[3 * i]; msum[3 * c + 1] += rgb[3 * i + 1]; msum[3 * c + 2] += rgb[3 * i + 2]; }
        for (c = 0; c < n; c++) if (selcnt[c] < 0.5) for (ch = 0; ch < 3; ch++) out[3 * c + ch] = msum[3 * c + ch] / cntf[c];
      }
      var modeKey = new Int32Array(n).fill(-1), tally = new Map(), bestW, bestKey, key, cw;
      for (c = 0; c < n; c++) {
        tally.clear(); bestW = -1; bestKey = -1;
        for (p = offs[c]; p < offs[c + 1]; p++) {
          q = order[p];
          if (lab[q] !== win[c] || !(wgt[q] > 0)) continue;
          b = q * 4; key = (d[b] << 16) | (d[b + 1] << 8) | d[b + 2];
          cw = (tally.get(key) || 0) + wgt[q]; tally.set(key, cw);
          if (cw > bestW) { bestW = cw; bestKey = key; }
        }
        modeKey[c] = bestKey;
      }

      // repair 3 recolours specks; then each bridge cell takes its stroke's colour around it
      if (doSpecks) {
        var pre = veto ? new Int32Array(modeKey) : null;
        specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour);
        if (veto) for (c = 0; c < n; c++) if (veto[c]) modeKey[c] = pre[c];   // a guard took this cell back
      }
      if (bridges.length) {
        var isB = new Set(bridges);
        bridges.forEach(function (bc) {
          var bx = bc % cols, by = (bc / cols) | 0, tal = new Map(), ddx, ddy, xx, yy, f, bk = -1, bn = -1;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; xx = bx + ddx; yy = by + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            f = yy * cols + xx; if (!opaque[f] || isB.has(f) || modeKey[f] < 0) continue;
            tal.set(modeKey[f], (tal.get(modeKey[f]) || 0) + 1);
          }
          tal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
          if (bk >= 0) modeKey[bc] = bk;
        });
      }

      var low = new d.constructor(n * 4), v;
      for (c = 0; c < n; c++) {
        if (modeKey[c] >= 0) {
          low[c * 4] = (modeKey[c] >> 16) & 255; low[c * 4 + 1] = (modeKey[c] >> 8) & 255; low[c * 4 + 2] = modeKey[c] & 255;
        } else {
          for (ch = 0; ch < 3; ch++) { v = PF.rint(out[3 * c + ch] * 255); low[c * 4 + ch] = PF.clipScalar(v, 0, 255); }
        }
        low[c * 4 + 3] = opaque[c] ? 255 : 0;
      }
      return low;
    }
    // THE GUARDS: what the page does next with these cells may not be changed beyond the cells repaired.
    // GATE (size 16's rules.gate since round 4; size 8's rules too since round 6, when they began to run on
    // outlined pictures) - the rules may not change which shapes the page's outline pass works on (see
    // gateFlips). colour.gate = the page's outline gate (OUTLINE_GATE) when its outline pass will run on this
    // picture, null when it will not (switch off; fixOutlineRuns says).
    // PALETTE (round 6, every size: colour.snap) - see paletteKnock.
    var GT = ((!R || R.gate) && colour.gate) ? gateNumbers(colour.gate) : null;
    var SN = typeof colour.snap === 'function' ? colour.snap : null;
    if (!GT && !SN) return { d: paint(win, opaque, bridges, on('specks')), w: cols, h: rows, cn: 4 };
    // the page's passes see the cells AFTER its palette step: snap a copy with that step (it is on when snap is given)
    var seen = function (lw) { if (!SN) return lw; var cp = new lw.constructor(lw); SN(cp, n, cols); return cp; };
    var lowT = GT ? paint(winT, opaqueT, [], on('specks')) : null, seenT = GT ? seen(lowT) : null;
    var lowP = SN ? paint(winT, opaqueT, [], false) : null, seenP = SN ? seen(lowP) : null;   // no rule at all
    var veto = new Uint8Array(n), low = null, it, und, flip, knock = null;
    for (it = 0; it < GUARD_ROUNDS; it++) {
      low = paint(win, opaque, bridges, on('specks'), veto);
      und = null; knock = null;
      if (GT) { flip = gateFlips(seenT, seen(low), winT, opaqueT, win, opaque, cols, rows, GT); if (flip.n) und = flip.undo; }
      if (!und && SN) { knock = paletteKnock(lowP, low, seenP, seen(low), n); if (knock.n) und = knock.undo; }
      if (!und) break;
      for (c = 0; c < n; c++) if (und[c]) { win[c] = winT[c]; opaque[c] = opaqueT[c]; veto[c] = 1; }
      bridges = bridges.filter(function (bc) { return !und[bc]; });
      low = null;
    }
    if (!low) {
      low = paint(win, opaque, bridges, on('specks'), veto);
      // still moving the palette after GUARD_ROUNDS: the cells the rules would not have made at all
      // (round 6 judge, LATENT, not reached on the 311 at 8 or 16: this fallback is the vote with NO rule,
      // specks included, so on a picture that lands here size 8 also drops the specks rule it ran before
      // round 6; and the gate is not asked again after this last repaint. Kept as written: a picture whose
      // palette still moves after six rounds keeps the cells the vote made.)
      if (SN && paletteKnock(lowP, low, seenP, seen(low), n).n) low = lowP;
    }
    return { d: low, w: cols, h: rows, cn: 4 };
  };

  /* PIXEL SIZE 16 (round 3). The rule set for a step of 16 - measured first on
     skins, clothing, costumes, hats, masks, hair, glasses, extras and ears, and
     since round 6 run on every picture (backgrounds, chains, mouths and eyes
     measured then): STROKE first, then RESCUE and CONNECT, with KEEP guarding
     what they may replace.
     SPECKS is off at 16: on Balaclava Suit it flattened a drawn grey stripe
     into the fill, and elsewhere it only swapped texture shades. */
  var RULES16 = { stroke: true, rescue: true, connect: true, specks: false, keep: true, gate: true };
  PF.lines16_pack = function (rgba, cols, rows, colour) {
    return PF.repair8_pack(rgba, cols, rows, colour, RULES16);
  };

  PF.versionRepair8 = 'pf-42-repair8/6';
})();

/* ==== pf-50-core.js =============================================== */
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
   * @param {{mode?:string, forceStep?:number, kColors?:number, reference?:boolean,
   *          repair8?:{labOf:function, deltaE2000:function},
   *          lines16?:{labOf:function, deltaE2000:function, gate?:object|null, snap?:function(data,n,width)},
   *          onProgress?:function(number,string)}} [opts]
   * @returns {{cols,rows,stepX,stepY,consensus,confidence,width,height,
   *            data:Uint8ClampedArray, detectMs, reconMs}}
   */
  PF.process = function process(data, width, height, opts) {
    opts = opts || {};
    /* ONE IMAGE PER PROCESS, BY CONSTRUCTION. The k-means draws from a
       process-global generator the reference never seeds, so in a Worker
       that outlives one image the answer depended on what ran before it:
       measured in the page, 8 of 9 real traits differed between two
       folder orders (up to 1,662 of 25,600 cells) and 7 of 9 differed
       from their own single-image run. 0xffffffff is the state a fresh
       engine starts in (cv::theRNG, pf-03-cv2.js), so a single run is
       unchanged by this and a folder run now equals it. The reset is here
       and not inside kmeans: tools/test-quantize.cjs tests the carry-over
       between chained calls on purpose. Not fixable by more attempts or
       iterations, measured across six settings. */
    PF.setRNGSeed(0xffffffff);
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
        /* round(), not Math.round: api.py rounds half to even, so 324 at
           8 is 40 cells there and was 41 here, 1254 at 12 is 104 not 105. */
        cols: Math.max(1, PF.rint(width / fs)),
        rows: Math.max(1, PF.rint(height / fs)),
        consensus: 'forced' };
      onProgress(0.7, 'using the pixel size you gave');
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
    /* opts.reference: the reference's own vote and mean, for the parity
       harness. The default is this port's measured departure - see the
       comment in two_stage_pack. */
    /* opts.repair8: two_stage_pack with the size-8 rules (pf-42-repair8.js),
       for a step the caller gave. It carries the page's own colour
       functions, which the rules compare colours with. */
    /* opts.lines16: the size-16 rules (PF.lines16_pack, pf-42-repair8.js), for
       a step the caller gave, with the same colour functions. The page asks
       for it at a step of 16 on every picture (fixLines16). gate: the page's
       outline gate (OUTLINE_GATE) when its outline pass will run on the
       result, else null (the rules may not switch the pass on or off for a
       shape); snap: the palette step it will run first. */
    var low = (opts.lines16 && opts.forceStep > 0)
      ? PF.lines16_pack(rgba, r.cols, r.rows, opts.lines16)
      : (opts.repair8 && opts.forceStep > 0)
      ? PF.repair8_pack(rgba, r.cols, r.rows, opts.repair8)
      : PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0,
        { reference: !!opts.reference });
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
