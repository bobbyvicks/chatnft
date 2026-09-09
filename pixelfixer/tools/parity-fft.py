"""Dump numpy.fft ground truth for the pf-01-fft.js port.

Run with the project venv:
  pafenv/Scripts/python.exe pixelfixer-js/tools/parity-fft.py

Writes pixelfixer-js/fixtures/fft.json.  Every case is deterministic
(np.random.default_rng with a fixed seed, or a real fixture image).

Cases cover, in order:
  A. rfft, 1-D float64, no n=            -> the channels._axis_spectrum form
  B. rfft, 1-D float64, with n= (pad AND truncate)
  C. rfft, 2-D float64, axis=1, with n=  -> the autocorr band_acf form
  D. irfft, 1-D, real input, with n=     -> the band_cepstrum form
  E. irfft, 1-D, complex input (general, incl. DC/Nyquist imag handling)
  F. irfft, 2-D, real input, axis=1      -> the band_acf form
  G. rfftfreq
  H. REAL CALL SITES on the three fixture images, including the float32
     (complex64) chain that band_acf / band_cepstrum actually run.

Sizes deliberately include primes (47, 101, 103) and awkward composites
(203 = 7*29, 202 = 2*101, 110 = 2*5*11) because channels._axis_spectrum
transforms min(W, 1024) samples and W is a raw image dimension - it does NOT
pad to a power of two.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(ROOT)),
                                "pixel-art-fixer", "python"))

import pixelfixer.autocorr as A          # noqa: E402
import pixelfixer.channels as C          # noqa: E402

RNG = np.random.default_rng(20260909)


def L(a):
    """float64 list that JSON round-trips bit-exactly."""
    return [float(v) for v in np.asarray(a).ravel()]


def cplx(a):
    a = np.asarray(a).ravel()
    return L(a.real), L(a.imag)


out = {
    "meta": {
        "numpy": np.__version__,
        "python": sys.version.split()[0],
        "note": "all values are exact float64 JSON round-trips",
    },
    "rfft_1d": [],
    "rfft_rows": [],
    "irfft_1d": [],
    "irfft_rows": [],
    "rfftfreq": [],
    "callsites_autocorr": [],
    "callsites_channels": [],
}

# ---------------------------------------------------------------- A + B
SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 33,
         46, 47, 48, 63, 64, 65, 101, 103, 110, 111, 128,
         202, 203, 204, 255, 256, 257, 384, 512, 1000, 1023, 1024, 2048]

for n in SIZES:
    x = RNG.standard_normal(n)
    f = np.fft.rfft(x)
    re, im = cplx(f)
    out["rfft_1d"].append({"name": "plain_n%d" % n, "x": L(x), "n": None,
                           "re": re, "im": im, "dtype": str(f.dtype)})

# explicit n=, both zero-padding and truncation, including odd/prime targets
for xlen, n in [(48, 128), (112, 256), (204, 512), (203, 512), (50, 47),
                (100, 33), (7, 16), (16, 7), (1, 8), (8, 1), (5, 5),
                (300, 202), (60, 101), (1000, 1024), (1024, 1000)]:
    x = RNG.standard_normal(xlen)
    f = np.fft.rfft(x, n)
    re, im = cplx(f)
    out["rfft_1d"].append({"name": "len%d_n%d" % (xlen, n), "x": L(x), "n": n,
                           "re": re, "im": im, "dtype": str(f.dtype)})

# ---------------------------------------------------------------- C
for rows, cols, n in [(2, 48, 128), (4, 112, 256), (8, 204, 512),
                      (3, 100, 100), (5, 33, 47), (2, 64, 32)]:
    x = RNG.standard_normal((rows, cols))
    f = np.fft.rfft(x, n, axis=1)
    re, im = cplx(f)
    out["rfft_rows"].append({"name": "rows%dx%d_n%d" % (rows, cols, n),
                             "rows": rows, "cols": cols, "n": n,
                             "x": L(x), "outCols": f.shape[1],
                             "re": re, "im": im})

# ---------------------------------------------------------------- D + E
for m, n in [(65, 128), (129, 256), (257, 512), (52, 102), (51, 101),
             (24, 47), (5, 8), (2, 3), (1, 1), (2, 2), (9, 16), (3, 8),
             (5, 4), (513, 1024)]:
    p = RNG.standard_normal(m)                      # REAL input, as at both
    y = np.fft.irfft(p, n)                          # pixelfixer call sites
    out["irfft_1d"].append({"name": "real_m%d_n%d" % (m, n), "re": L(p),
                            "im": None, "n": n, "out": L(y),
                            "dtype": str(y.dtype)})

for m, n in [(65, 128), (52, 102), (51, 101), (5, 8), (3, 5), (9, 16),
             (4, 8), (6, 8)]:
    z = RNG.standard_normal(m) + 1j * RNG.standard_normal(m)
    y = np.fft.irfft(z, n)
    out["irfft_1d"].append({"name": "cplx_m%d_n%d" % (m, n), "re": L(z.real),
                            "im": L(z.imag), "n": n, "out": L(y),
                            "dtype": str(y.dtype)})

# irfft with no n= at all (numpy default n = 2*(m-1))
for m in [5, 65, 129, 52]:
    z = RNG.standard_normal(m) + 1j * RNG.standard_normal(m)
    y = np.fft.irfft(z)
    out["irfft_1d"].append({"name": "defaultn_m%d" % m, "re": L(z.real),
                            "im": L(z.imag), "n": None, "out": L(y),
                            "dtype": str(y.dtype)})

# ---------------------------------------------------------------- F
for rows, m, n in [(2, 65, 128), (4, 129, 256), (8, 257, 512), (3, 51, 101)]:
    p = RNG.standard_normal((rows, m))
    y = np.fft.irfft(p, n, axis=1)
    out["irfft_rows"].append({"name": "irows%dx%d_n%d" % (rows, m, n),
                              "rows": rows, "cols": m, "n": n,
                              "re": L(p), "im": None,
                              "out": L(y), "outCols": y.shape[1]})

# ---------------------------------------------------------------- G
for n in [1, 2, 3, 8, 46, 47, 110, 111, 202, 203, 204, 1024, 4096]:
    for d in [1.0, 0.5, 2.0, 1.0 / 3.0]:
        out["rfftfreq"].append({"n": n, "d": d,
                                "out": L(np.fft.rfftfreq(n, d))})

# ------------------------------------------------------ H1: autocorr sites
# Reproduces autocorr.band_acf / band_cepstrum lines 70-95 exactly, on the
# real fixtures.  These run in float32 -> complex64 (numpy 2.5 does not
# upcast), so the "*_f32" fields are what the JS must reproduce AFTER
# rounding its float64 result down to float32.
for name in ("tiny", "small", "mid"):
    rgba = np.array(Image.open(os.path.join(FIX, name + ".png")).convert("RGBA"))
    g = A.to_gray(rgba)
    for axis in (0, 1):
        feat = A.d2_along(g, axis)
        prof = A.band_profiles(feat, axis, A.BAND)
        x = prof - prof.mean(axis=1, keepdims=True)
        n = x.shape[1]
        nfft = 1 << int(np.ceil(np.log2(2 * n)))
        F = np.fft.rfft(x, nfft, axis=1)
        p_raw = (F * np.conj(F)).real            # complex64 multiply -> float32
        p_sum = p_raw.sum(axis=1, keepdims=True)  # numpy PAIRWISE float32 sum
        p = p_raw / np.clip(p_sum, 1e-12, None)
        ac2 = np.fft.irfft(p, nfft, axis=1)
        # cepstrum path (1-D irfft of a real vector)
        logp = np.log((F * np.conj(F)).real.mean(0) + 1e-6)
        logp = logp - logp.mean()
        cep = np.fft.irfft(logp, nfft)
        re, im = cplx(F)
        out["callsites_autocorr"].append({
            "name": "%s_axis%d" % (name, axis),
            "rows": int(x.shape[0]), "cols": int(n), "nfft": int(nfft),
            "x": L(x.astype(np.float64)), "x_dtype": str(x.dtype),
            "F_dtype": str(F.dtype), "F_re": re, "F_im": im,
            "p_raw": L(p_raw.astype(np.float64)),
            "p_sum": L(p_sum.astype(np.float64)),
            "p": L(p.astype(np.float64)), "p_dtype": str(p.dtype),
            "acf_rows": L(ac2.astype(np.float64)),
            "acf_dtype": str(ac2.dtype), "acf_cols": int(ac2.shape[1]),
            "logp": L(logp.astype(np.float64)),
            "cep": L(cep.astype(np.float64)), "cep_dtype": str(cep.dtype),
        })

# ------------------------------------------------------ H2: channels sites
# Reproduces channels._axis_spectrum lines 580-596.  quantized := rgba keeps
# this fixture deterministic (cv2 k-means is not); the FFT lengths and the
# float32->float64 promotion through np.hanning are unaffected, which is the
# only thing under test here.
for name in ("tiny", "small", "mid"):
    rgba = np.array(Image.open(os.path.join(FIX, name + ".png")).convert("RGBA"))
    gm = C._grad_maps(rgba, rgba)
    for key, axis in (("dqx", 0), ("cox", 0), ("dqy", 1), ("coy", 1)):
        dmap = gm[key]
        d = dmap.T if axis == 1 else dmap
        H, W = d.shape
        win = int(min(W, 1024))
        if win < 32:
            continue
        window = np.hanning(win)
        hop = max(win // 2, 1)
        segs, spec = [], []
        for y0 in range(0, H - 4 + 1, 4):
            prof = d[y0:y0 + 4].sum(axis=0)
            prof = prof - prof.mean()
            for x0 in range(0, W - win + 1, hop):
                seg = prof[x0:x0 + win] * window
                sp = np.abs(np.fft.rfft(seg)) ** 2
                segs.append(seg)
                spec.append(sp)
        if not segs:
            continue
        segs_a = np.array(segs)
        spec_a = np.array(spec)
        f0 = np.fft.rfft(segs_a[0])
        re, im = cplx(f0)
        out["callsites_channels"].append({
            "name": "%s_%s_axis%d" % (name, key, axis),
            "win": win, "nseg": int(segs_a.shape[0]),
            "seg_dtype": str(segs_a.dtype), "spec_dtype": str(spec_a.dtype),
            "segs": L(segs_a), "power": L(spec_a),
            "first_re": re, "first_im": im,
            "freqs": L(np.fft.rfftfreq(win)),
        })

# ---------------------------------------------------------------- I
# float32 irfft at a NON-power-of-two n.  No pixelfixer call site does this
# (both irfft sites use nfft = 1 << ceil(log2(2n)), always a power of two),
# but PF.irfft carries a scaleF32 flag for exactly this case, and a flag that
# nobody has measured against numpy is a claim, not a port.  These cases are
# the measurement: the JS must reproduce numpy float32 output bit-for-bit as
#     fround(unscaled_f64_inverse * fround(1/n))
# The (65,128) row is the power-of-two control, where fround(1/n) == 1/n and
# the flag must be a no-op.
out["irfft_f32_nonpow2"] = []
for m, n in [(24, 47), (51, 101), (102, 203), (9, 17), (56, 111), (52, 102),
             (65, 128)]:
    p32 = RNG.standard_normal(m).astype(np.float32)
    y32 = np.fft.irfft(p32, n)
    assert y32.dtype == np.float32, y32.dtype
    out["irfft_f32_nonpow2"].append({
        "name": "f32_m%d_n%d" % (m, n), "re": L(p32.astype(np.float64)),
        "n": n, "pow2": (n & (n - 1)) == 0,
        "out": L(y32.astype(np.float64)), "dtype": str(y32.dtype)})

path = os.path.join(FIX, "fft.json")
with open(path, "w") as fh:
    json.dump(out, fh)

print("wrote", path, "%.2f MB" % (os.path.getsize(path) / 1e6))
print("numpy", np.__version__)
print("rfft_1d cases          :", len(out["rfft_1d"]))
print("rfft_rows cases        :", len(out["rfft_rows"]))
print("irfft_1d cases         :", len(out["irfft_1d"]))
print("irfft_rows cases       :", len(out["irfft_rows"]))
print("rfftfreq cases         :", len(out["rfftfreq"]))
print("autocorr call sites    :", len(out["callsites_autocorr"]))
print("channels call sites    :", len(out["callsites_channels"]))
print("irfft f32 non-pow2     :", len(out["irfft_f32_nonpow2"]))
print()
print("channels rfft lengths  :",
      sorted({c["win"] for c in out["callsites_channels"]}),
      "-> power of two?",
      {c["win"]: (c["win"] & (c["win"] - 1)) == 0
       for c in out["callsites_channels"]})
print("autocorr nfft lengths  :",
      sorted({c["nfft"] for c in out["callsites_autocorr"]}),
      "-> power of two?",
      {c["nfft"]: (c["nfft"] & (c["nfft"] - 1)) == 0
       for c in out["callsites_autocorr"]})
print("autocorr F dtype       :",
      sorted({c["F_dtype"] for c in out["callsites_autocorr"]}))
print("channels seg dtype     :",
      sorted({c["seg_dtype"] for c in out["callsites_channels"]}))

# ---- the load-bearing dtype claim, measured rather than assumed ----------
# The JS is float64.  A float32 call site (autocorr) is emulated by rounding
# the float64 result down.  That is only legitimate if numpy itself does the
# arithmetic in double and narrows at the end.  Measure it, do not assume it.
NS = [8, 16, 17, 32, 47, 64, 101, 128, 203, 256, 512, 1024, 2048, 4096]
TRIALS = 20
print()
print("CLAIM 1: np.fft.rfft(float32) == np.fft.rfft(float64).astype(complex64)")
bad = tot = 0
for n in NS:
    for _ in range(TRIALS):
        x = RNG.standard_normal(n).astype(np.float32)
        a = np.fft.rfft(x)
        b = np.fft.rfft(x.astype(np.float64)).astype(np.complex64)
        tot += a.size
        bad += int(np.count_nonzero(a != b))
print("  differing values: %d / %d   -> %s" % (bad, tot, "HOLDS" if not bad else "FAILS"))

print()
print("CLAIM 2: np.fft.irfft(float32) == np.fft.irfft(float64).astype(float32)")
for label, sel in (("power-of-two n    ", lambda n: n & (n - 1) == 0),
                   ("non-power-of-two n", lambda n: n & (n - 1) != 0)):
    bad = tot = 0
    worst = 0.0
    for n in NS:
        if not sel(n):
            continue
        for _ in range(TRIALS):
            m = RNG.standard_normal(n // 2 + 1).astype(np.float32)
            ya = np.fft.irfft(m, n)
            yb = np.fft.irfft(m.astype(np.float64), n).astype(np.float32)
            tot += ya.size
            bad += int(np.count_nonzero(ya != yb))
            worst = max(worst, float(np.abs(ya.astype(np.float64)
                                            - yb.astype(np.float64)).max()))
    print("  %s: %d / %d differ (max |d| = %.3g)" % (label, bad, tot, worst))

print()
print("CLAIM 3: the non-pow2 gap is the 1/n scale, applied as float32(1/n).")
print("         irfft(f32) == float32(unscaled_f64 * float64(float32(1/n)))")
bad = tot = 0
for n in NS:
    if n & (n - 1) == 0:
        continue
    for _ in range(TRIALS + 10):
        m = RNG.standard_normal(n // 2 + 1).astype(np.float32)
        ya = np.fft.irfft(m, n)
        d = np.fft.irfft(m.astype(np.float64), n)          # already /n in f64
        alt = (d * n * np.float64(np.float32(1.0 / n))).astype(np.float32)
        tot += ya.size
        bad += int(np.count_nonzero(ya != alt))
print("  differing values: %d / %d   -> %s" % (bad, tot, "HOLDS" if not bad else "FAILS"))
