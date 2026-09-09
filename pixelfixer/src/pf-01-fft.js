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
