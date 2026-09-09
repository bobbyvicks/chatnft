"""Dump ground-truth fixtures for the pf-02-scipy.js port.

Every float array is dumped as a lowercase hex string of its little-endian
float64 bytes, so the JSON -> JS round trip cannot lose a single ulp.  Integer
arrays (peak indices, argsort permutations) are dumped as plain JSON ints.

Run with the pafenv interpreter:
  pafenv/Scripts/python.exe tools/parity-scipy.py
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d, maximum_filter1d, median_filter
from scipy.signal import find_peaks
from scipy.signal._peak_finding_utils import _local_maxima_1d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(ROOT)), "pixel-art-fixer", "python"))
from pixelfixer import channels  # noqa: E402


def hexf(a):
    a = np.ascontiguousarray(np.asarray(a, dtype=np.float64))
    return a.tobytes().hex()


CASES = []


def add(**kw):
    CASES.append(kw)


# ------------------------------------------------------------- input signals
rng = np.random.default_rng(20260909)

SIGNALS = {}

SIGNALS["rand_small"] = rng.standard_normal(17)
SIGNALS["rand_mid"] = rng.standard_normal(257)
SIGNALS["rand_big"] = rng.random(1024) * 3.0 - 1.0
SIGNALS["n1"] = np.array([0.5])
SIGNALS["n2"] = np.array([0.5, -2.25])
SIGNALS["n3"] = np.array([1.0, 0.0, -1.0])
SIGNALS["n4"] = np.array([1.0, 0.0, -1.0, 4.0])
SIGNALS["n5"] = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
SIGNALS["n6"] = np.array([1.0, 2.0, 3.0, 4.0, 5.0, -9.0])
SIGNALS["n7"] = np.array([1.0, 2.0, 3.0, 4.0, 5.0, -9.0, 0.25])
SIGNALS["const"] = np.full(23, 0.375)
SIGNALS["ramp"] = np.arange(40, dtype=np.float64) / 7.0
spiky = np.zeros(64)
spiky[::5] = 1.0
spiky[7] = 1.5
SIGNALS["spiky"] = spiky
SIGNALS["subnormal"] = np.array([1e-300, 1e-310, 0.0, -1e-310, 3e-308, 1.0])

# plateau zoo for _local_maxima_1d
SIGNALS["plateaus"] = np.array([
    0., 1., 1., 0.,          # even plateau  -> midpoint 1
    2., 2., 2., 0.,          # odd  plateau  -> midpoint 5
    1., 1., 1., 1., 0.,      # even plateau  -> midpoint 9
    3., 0., 3., 3.,          # rises into a plateau that runs to the last sample
])
SIGNALS["plateau_tail"] = np.array([0., 1., 2., 2., 2.])
SIGNALS["plateau_head"] = np.array([2., 2., 2., 1., 0.])
SIGNALS["monotone"] = np.arange(12, dtype=np.float64)
SIGNALS["allequal"] = np.ones(12)
SIGNALS["empty"] = np.array([])

# ties within `distance` of each other -> exercises argsort tie-breaking
tie = np.zeros(60)
tie[[3, 5, 7, 9, 20, 22, 24, 40, 42, 44, 46]] = 1.5
tie[[12, 30, 50]] = 0.9
SIGNALS["ties"] = tie

# clipped-at-1.5 profile: the shape _normalise() actually produces, where exact
# height ties are not hypothetical
clipped = np.abs(rng.standard_normal(200)) * 0.9
clipped[::6] += 1.4
SIGNALS["clipped"] = np.clip(clipped, 0.0, 1.5)


# ------------------------------------------------- real profiles from images
def real_profiles():
    out = {}
    for name in ("tiny", "small", "mid"):
        path = os.path.join(FIX, name + ".png")
        if not os.path.exists(path):
            print("  MISSING", path)
            continue
        rgba = np.array(Image.open(path).convert("RGBA"))
        prof = channels.axis_profiles(rgba)
        for key in ("e1x", "e1y", "e2x", "e2y"):
            p = prof[key]
            assert p.dtype == np.float64, (name, key, p.dtype)
            out[name + "_" + key] = p
            out[name + "_" + key + "_norm"] = channels._normalise(p)
        # power spectrum + its median-filter background: the real median_filter
        # and the real find_peaks(resid, height=4.0) call site
        gm = channels._grad_maps(rgba, rgba)
        for axis, tag in ((0, "x"), (1, "y")):
            freqs, power = channels._axis_spectrum([gm["dq" + tag]], axis=axis)
            if len(power) < 8:
                continue
            out[name + "_power_" + tag] = power.astype(np.float64)
            bg = channels._spectral_background(power)
            resid = 6.0 * np.log10(np.maximum(power, 1e-12) / (bg + 1e-12))
            out[name + "_resid_" + tag] = resid
    return out


REAL = real_profiles()
SIGNALS.update(REAL)
print("signals: %d (%d derived from the real fixture images)"
      % (len(SIGNALS), len(REAL)))

# ---------------------------------------------------------- gaussian_filter1d
# call sites: sigma=0.6 (channels.py 117, 433, 844, 1036, 1109) and sigma=0.8
# (channels.py 1196).  Everything else default: order=0, mode='reflect',
# truncate=4.0.
for name, sig in SIGNALS.items():
    if sig.size == 0:
        continue
    for sigma in (0.6, 0.8, 1.0, 2.5):
        y = gaussian_filter1d(sig, sigma=sigma)
        assert y.dtype == np.float64
        add(fn="gaussian_filter1d", name="%s/s%s" % (name, sigma),
            sigma=sigma, n=int(sig.size),
            input_hex=hexf(sig), expected_hex=hexf(y))

# ---------------------------------------------------------- maximum_filter1d
# call site: maximum_filter1d(norm, size=p) for p in (3, 5, 7), mode='reflect'
for name, sig in SIGNALS.items():
    if sig.size == 0:
        continue
    for size in (3, 5, 7):
        y = maximum_filter1d(sig, size=size)
        add(fn="maximum_filter1d", name="%s/k%d" % (name, size),
            size=size, n=int(sig.size),
            input_hex=hexf(sig), expected_hex=hexf(y))

# -------------------------------------------------------------- median_filter
# call sites: median_filter(power, size=k, mode='nearest') with k odd >= 5, and
#             median_filter(cs, size=15, mode='nearest')
for name, sig in SIGNALS.items():
    if sig.size == 0:
        continue
    for size in (5, 15, 21):
        y = median_filter(sig, size=size, mode="nearest")
        add(fn="median_filter", name="%s/k%d" % (name, size),
            size=size, mode="nearest", n=int(sig.size),
            input_hex=hexf(sig), expected_hex=hexf(y))

# ----------------------------------------------------------------- find_peaks
# Every (height, distance) shape that appears at a call site:
#   (0.12, max(1, int(s0*0.45)))    channels.py 210
#   (0.15, max(1, int(step*0.4)))   channels.py 250, 987
#   (0.10 / 0.30, 2)                channels.py 304
#   (0.20, 2)                       channels.py 503
#   (4.0, none)                     channels.py 633
#   (0.15, 2)                       channels.py 700
CALLSITE_ARGS = [
    (0.12, 1), (0.12, 2), (0.12, 3), (0.12, 5), (0.12, 9),
    (0.15, 1), (0.15, 2), (0.15, 4), (0.15, 12),
    (0.10, 2), (0.30, 2), (0.20, 2),
    (4.0, None), (0.0, None), (1.5, 3), (1.5, 1),
    (None, 2), (None, None),
    # Fractional distances.  NO call site passes one -- they all pass an int
    # (2, or max(1, int(...))) -- but without these the fixtures cannot tell
    # ceil(distance) from floor(distance), and a mutation test showed the gate
    # passing with floor.  scipy rounds UP; these pin that.
    (0.12, 2.5), (0.15, 3.7), (0.15, 1.0001), (0.10, 4.999),
]


def add_find_peaks(name, sig, height, distance, real, tag=None):
    kw = {}
    if height is not None:
        kw["height"] = height
    if distance is not None:
        kw["distance"] = distance
    pk, props = find_peaks(sig, **kw)
    rec = dict(fn="find_peaks",
               name="%s/h%s/d%s" % (name, height, distance),
               n=int(sig.size), input_hex=hexf(sig),
               real=bool(real),
               peaks=[int(v) for v in pk])
    if tag:
        rec["tag"] = tag
    if height is not None:
        rec["height"] = float(height)
    if distance is not None:
        rec["distance"] = float(distance)
    if "peak_heights" in props:
        rec["peak_heights_hex"] = hexf(props["peak_heights"])
    if distance is not None:
        # scipy's find_peaks calls
        #     _select_by_peak_distance(peaks, x[peaks], distance)
        # on the peaks that survived the height filter, and ranks them with
        # np.argsort.  Dump that exact permutation so the JS can also be driven
        # by numpy's own ranking: if THAT reproduces scipy everywhere, every
        # line of find_peaks other than the sort is proven exact in isolation.
        xf = np.ascontiguousarray(sig, dtype=np.float64)
        allpk, _, _ = _local_maxima_1d(xf)
        kept = allpk if height is None else allpk[height <= xf[allpk]]
        rec["kept_peaks"] = [int(v) for v in kept]
        rec["argsort_order"] = [int(v) for v in np.argsort(xf[kept])]
    add(**rec)


for name, sig in SIGNALS.items():
    for height, distance in CALLSITE_ARGS:
        add_find_peaks(name, sig, height, distance, name in REAL)

# The exact interior slice the call sites use: find_peaks(norm[1:-1], ...)
for name in sorted(REAL):
    if not name.endswith("_norm"):
        continue
    sig = np.ascontiguousarray(REAL[name][1:-1])
    if sig.size < 3:
        continue
    for height, distance in [(0.12, 3), (0.15, 2), (0.10, 2), (0.30, 2)]:
        add_find_peaks(name + "[1:-1]", sig, height, distance, True)

# --------------------------------------------- the tie-ambiguity population
# The one place find_peaks depends on np.argsort's tie order is when two
# EXACTLY equal peak heights sit closer than `distance`.  _normalise() clips at
# 1.5, so saturated profiles produce exactly that.  These synthetic profiles
# manufacture the situation in bulk so the tie class is measured in the
# hundreds, not on three hand-built traps.
TIE_SIGNALS = {}
for k in range(120):
    n = int(rng.integers(30, 400))
    p = np.abs(rng.standard_normal(n)) * 0.9
    step = int(rng.integers(2, 6))
    p[::step] += 1.4
    extra = rng.integers(0, n, size=max(1, n // 10))
    p[extra] += 1.0
    TIE_SIGNALS["tieprof%d" % k] = np.clip(p, 0.0, 1.5)
for k in range(40):
    n = int(rng.integers(30, 400))
    # quantised to quarter steps: ties at every level, not only at the clip
    TIE_SIGNALS["quantprof%d" % k] = np.round(rng.random(n) * 6) / 4.0
for name, sig in TIE_SIGNALS.items():
    for height, distance in [(0.12, 3), (0.12, 5), (0.12, 9), (0.15, 4), (0.15, 12)]:
        add_find_peaks(name, sig, height, distance, False, tag="tie-pop")

# ---------------------------------------------------- np.argsort tie-breaking
# _select_by_peak_distance() ranks peaks with np.argsort(priority).  On this
# machine that is x86-simd-sort's AVX2 argsort (numpy dispatch target X86_V3);
# pf-02-scipy.js emulates that kernel and these permutations measure it.
ARG_CASES = {
    "uniq_small": rng.standard_normal(11),
    "uniq_mid": rng.standard_normal(97),
    "uniq_big": rng.standard_normal(1000),
    "ties_two": np.array([1.5, 0.9, 1.5, 1.5, 0.9, 1.5, 0.3]),
    "ties_all": np.full(40, 1.5),
    "ties_half": np.where(np.arange(64) % 2 == 0, 1.5, 0.75),
    "ties_big": np.round(rng.random(500) * 4) / 4.0,
    "ties_tiny": np.array([1.5, 1.5]),
    "one": np.array([2.0]),
    "zero": np.array([]),
}
for name, a in ARG_CASES.items():
    add(fn="argsort", name=name, n=int(a.size), input_hex=hexf(a),
        order=[int(v) for v in np.argsort(a)],
        order_stable=[int(v) for v in np.argsort(a, kind="stable")],
        order_heapsort=[int(v) for v in np.argsort(a, kind="heapsort")])

ORACLE = []   # (name, array) -- also re-run below with the SIMD dispatch disabled


def oracle(name, a):
    a = np.ascontiguousarray(np.asarray(a, dtype=np.float64))
    ORACLE.append((name, a))
    add(fn="argsort", name=name, n=int(a.size), input_hex=hexf(a),
        order=[int(v) for v in np.argsort(a)])


# every size through the single-vector and two-vector networks, two shapes each
for n in range(0, 41):
    if n == 0:
        oracle("o_empty", np.array([]))
        continue
    oracle("o_two/%d" % n, np.where(rng.random(n) < 0.5, 1.5, 0.75))
    oracle("o_three/%d" % n, rng.choice([0.25, 1.0, 1.5], size=n))
# size sweep across every network bucket (<=256) and the partition path (>256)
SWEEP = [47, 48, 49, 63, 64, 65, 100, 127, 128, 129, 191, 192, 200, 255, 256,
         257, 258, 272, 273, 300, 384, 511, 512, 513, 700, 1000, 1024, 1025,
         1500, 2048, 3000, 4097]
for n in SWEEP:
    oracle("o_const/%d" % n, np.full(n, 1.5))
    oracle("o_two/%d" % n, np.where(rng.random(n) < 0.5, 1.5, 0.75))
    oracle("o_quarter/%d" % n, np.round(rng.random(n) * 8) / 4.0)
    base = rng.standard_normal(max(1, n // 2))
    oracle("o_halfdup/%d" % n, rng.choice(base, size=n))
    pr = np.abs(rng.standard_normal(n)) * 0.9
    pr[::3] += 1.4
    oracle("o_clipped/%d" % n, np.clip(pr, 0.0, 1.5))
    s = np.sort(rng.choice([0.5, 1.0, 1.5], size=n))
    if n >= 2:
        s[0], s[-1] = s[-1], s[0]
    oracle("o_nearsorted/%d" % n, s)
    oracle("o_negzero/%d" % n, rng.choice([0.0, -0.0, 1.0], size=n))
# random tie-heavy arrays in each regime
for k in range(400):
    n = int(rng.integers(2, 41))
    oracle("o_small%d/%d" % (k, n), rng.choice(rng.standard_normal(int(rng.integers(1, 5))), size=n))
for k in range(200):
    n = int(rng.integers(41, 257))
    oracle("o_med%d/%d" % (k, n), rng.choice(rng.standard_normal(int(rng.integers(1, 9))), size=n))
for k in range(80):
    n = int(rng.integers(257, 3001))
    oracle("o_big%d/%d" % (k, n), rng.choice(rng.standard_normal(int(rng.integers(1, 12))), size=n))
# arrays dominated by their minimum: >= 3 of 4 pivot samples equal the minimum,
# the partition makes no progress, and after 2*floor(log2 n) rounds
# x86-simd-sort hands the range to std::sort -- the fallback path.
for k in range(120):
    n = int(rng.integers(257, 3001))
    frac = float(rng.uniform(0.6, 0.97))
    vals = np.sort(rng.standard_normal(int(rng.integers(1, 6))))
    oracle("o_mostlymin%d/%d" % (k, n),
           np.where(rng.random(n) < frac, vals[0], rng.choice(vals, size=n)))
for k in range(40):
    n = int(rng.integers(257, 3001))
    frac = float(rng.uniform(0.6, 0.97))
    vals = np.sort(rng.standard_normal(int(rng.integers(1, 6))))
    oracle("o_mostlymax%d/%d" % (k, n),
           np.where(rng.random(n) < frac, vals[-1], rng.choice(vals, size=n)))

# ---------------------------------- the same arrays with SIMD dispatch OFF
# Positive control for the dispatch claim: with NPY_DISABLE_CPU_FEATURES=X86_V3
# numpy runs its portable introsort (npysort/quicksort.cpp aquicksort_), which
# pf-02-scipy.js keeps as a CONTROL.  Both permutations are recorded so the
# test can show (a) the emulation matches the dispatched kernel and NOT the
# portable one, and (b) the portable port matches numpy-without-dispatch.
NODISPATCH_PICK = [nm for nm, _ in ORACLE
                   if nm.startswith(("o_two/", "o_three/", "o_small", "o_med",
                                     "o_const/", "o_quarter/"))][:260]
NODISPATCH_PICK += list(ARG_CASES)
_nodispatch_script = r"""
import json, sys, numpy as np
arrs = json.load(sys.stdin)
out = {}
for name, hx in arrs.items():
    a = np.frombuffer(bytes.fromhex(hx), dtype="<f8")
    out[name] = [int(v) for v in np.argsort(a)]
out["__dispatch__"] = list(np._core._multiarray_umath.__cpu_dispatch__)
out["__ties_two__"] = [int(v) for v in np.argsort(np.array([1.5,0.9,1.5,1.5,0.9,1.5,0.3]))]
out["__const40_identity__"] = bool((np.argsort(np.full(40, 1.5)) == np.arange(40)).all())
json.dump(out, sys.stdout)
"""
_pick_arrays = {}
for nm, a in ORACLE:
    if nm in NODISPATCH_PICK:
        _pick_arrays[nm] = hexf(a)
for nm, a in ARG_CASES.items():
    _pick_arrays[nm] = hexf(a)
_env = dict(os.environ)
_env["NPY_DISABLE_CPU_FEATURES"] = "X86_V3"
_proc = subprocess.run([sys.executable, "-c", _nodispatch_script],
                       input=json.dumps(_pick_arrays), capture_output=True,
                       text=True, env=_env)
if _proc.returncode != 0:
    raise SystemExit("no-dispatch subprocess failed:\n" + _proc.stderr)
_nod = json.loads(_proc.stdout)
for nm, hx in _pick_arrays.items():
    add(fn="argsort_nodispatch", name=nm, n=len(hx) // 16, input_hex=hx,
        order=_nod[nm])

# --------------------------------------------------------------------- write
cf = np._core._multiarray_umath.__cpu_features__
meta = {
    "numpy": np.__version__,
    "scipy": __import__("scipy").__version__,
    "python": sys.version.split()[0],
    "cpu_dispatch": list(np._core._multiarray_umath.__cpu_dispatch__),
    "cpu_baseline": list(np._core._multiarray_umath.__cpu_baseline__),
    "cpu_has_avx2": bool(cf.get("AVX2", False)),
    "cpu_has_avx512_skx": bool(cf.get("AVX512_SKX", False)),
    "ties_two_default": [int(v) for v in np.argsort(
        np.array([1.5, 0.9, 1.5, 1.5, 0.9, 1.5, 0.3]))],
    "ties_two_x86v3_disabled": _nod["__ties_two__"],
    "const40_identity_default": bool(
        (np.argsort(np.full(40, 1.5)) == np.arange(40)).all()),
    "const40_identity_x86v3_disabled": _nod["__const40_identity__"],
    "nodispatch_reported_dispatch": _nod["__dispatch__"],
}
out_path = os.path.join(FIX, "scipy-parity.json")
with open(out_path, "w") as fh:
    json.dump({"meta": meta, "cases": CASES}, fh)

by_fn = {}
for c in CASES:
    by_fn[c["fn"]] = by_fn.get(c["fn"], 0) + 1
print("meta:", json.dumps(meta))
print("wrote %s  (%.2f MB)" % (out_path, os.path.getsize(out_path) / 1e6))
for k in sorted(by_fn):
    print("  %-20s %4d cases" % (k, by_fn[k]))
print("total %d cases" % len(CASES))
