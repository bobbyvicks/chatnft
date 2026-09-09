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
