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
