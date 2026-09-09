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
