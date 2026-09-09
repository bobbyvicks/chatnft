"""Dump the reference colorspace.py outputs for tools/test-colorspace.js.

Every array is written as the hex of its raw little-endian float64 bytes,
so the fixture is a bit-exact channel and the node side compares bit
patterns, never tolerances.

Inputs mirror the ONLY two call shapes in the reference (reconstruct.py
:519-520), built the way reconstruct.py builds them:
  pixels          rgba[..., :3].reshape(-1, 3).astype(np.float64) / 255.0
  cell_means      float64 per-cell means over the fixture's grid (the `cw`
                  shape: bincount weights / counts)
  kmeans_centers  cv2.kmeans on cell_means.astype(np.float32) with the
                  reference's criteria and k, then .astype(np.float64)
plus synthetic arrays that hit every branch: the two transfer-function
knees, 0, 1, -0.0, negatives, >1, inf, NaN, a float64 uniform block, and a
float32-grid block.

Stage intermediates: colorspace.py is monolithic, so the intermediates are
produced by a line-for-line COPY of it below (_stages_forward /
_stages_inverse). A private copy drifts, so the copy's final output is
asserted bit-identical to the real function's output for EVERY case
before anything is written; a drift aborts the run.

Downstream consequence: for the three fixtures the reference's snap step
(reconstruct.py:521-522) is also recorded - d = ((lab[:,None,:] -
clab[None,:,:])**2).sum(-1); labels = argmin(d, 1) - so the node side can
measure whether a last-bit Oklab miss ever changes a label. That is the
question the caller actually asks of this module.

Run:  <pafenv>/Scripts/python.exe tools/parity-colorspace.py
Writes fixtures/colorspace-parity.json
"""
import json
import os
import struct
import sys
import warnings

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "pixel-art-fixer", "python"))
from pixelfixer.colorspace import srgb_to_oklab, oklab_to_srgb  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
OUT = os.path.join(FIX, "colorspace-parity.json")

# np.where evaluates the pow branch on negative bases (NaN, discarded) and
# the reference does not silence it; neither do we, we just do not print it.
warnings.simplefilter("ignore", RuntimeWarning)


def HX(a):
    a = np.ascontiguousarray(np.asarray(a, dtype=np.float64))
    return a.tobytes().hex()


def IA(a):
    return [int(v) for v in np.ravel(np.asarray(a))]


# ------------------------------------------------------------ stage copies
def _stages_forward(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    def lin(u):
        return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)

    r, g, b = lin(r), lin(g), lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    lms_lin = np.stack([l, m, s], axis=-1)
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    lms_cbrt = np.stack([l, m, s], axis=-1)
    lab = np.stack([
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ], axis=-1)
    return lms_lin, lms_cbrt, lab


def _stages_inverse(lab):
    L, a, bb = lab[..., 0], lab[..., 1], lab[..., 2]
    l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3
    lms_cubed = np.stack([l, m, s], axis=-1)
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    rgb_lin = np.stack([r, g, b], axis=-1)

    def unlin(u):
        u = np.clip(u, 0.0, 1.0)
        return np.where(u <= 0.0031308, 12.92 * u,
                        1.055 * np.power(u, 1 / 2.4) - 0.055)

    rgb = np.stack([unlin(r), unlin(g), unlin(b)], axis=-1)
    return lms_cubed, rgb_lin, rgb


def bits_equal(a, b):
    a = np.ascontiguousarray(np.asarray(a, dtype=np.float64))
    b = np.ascontiguousarray(np.asarray(b, dtype=np.float64))
    return a.shape == b.shape and a.tobytes() == b.tobytes()


CASES = []


def add_forward(cid, rgb, extra=None):
    rgb = np.ascontiguousarray(np.asarray(rgb, dtype=np.float64))
    assert rgb.ndim == 2 and rgb.shape[1] == 3, rgb.shape
    lab = srgb_to_oklab(rgb)
    assert lab.dtype == np.float64, lab.dtype
    lms_lin, lms_cbrt, lab_copy = _stages_forward(rgb)
    if not bits_equal(lab, lab_copy):
        raise SystemExit("STAGE COPY DRIFTED from colorspace.srgb_to_oklab on case %s" % cid)
    # the inverse is exercised on the reference's OWN lab output, so
    # oklab_to_srgb parity is isolated from any forward miss
    back = oklab_to_srgb(lab)
    assert back.dtype == np.float64, back.dtype
    lms_cubed, rgb_lin, back_copy = _stages_inverse(lab)
    if not bits_equal(back, back_copy):
        raise SystemExit("STAGE COPY DRIFTED from colorspace.oklab_to_srgb on case %s" % cid)
    c = {"id": cid, "n": int(rgb.shape[0]),
         "rgb": HX(rgb),
         "lms_lin": HX(lms_lin), "lms_cbrt": HX(lms_cbrt), "lab": HX(lab),
         "lms_cubed": HX(lms_cubed), "rgb_lin": HX(rgb_lin), "back": HX(back)}
    if extra:
        c.update(extra)
    CASES.append(c)
    return lab


def add_inverse_only(cid, lab):
    """Inverse on inputs that are NOT a forward output (out-of-gamut etc.)."""
    lab = np.ascontiguousarray(np.asarray(lab, dtype=np.float64))
    back = oklab_to_srgb(lab)
    lms_cubed, rgb_lin, back_copy = _stages_inverse(lab)
    if not bits_equal(back, back_copy):
        raise SystemExit("STAGE COPY DRIFTED from colorspace.oklab_to_srgb on case %s" % cid)
    CASES.append({"id": cid, "n": int(lab.shape[0]), "inverse_only": True,
                  "lab": HX(lab), "lms_cubed": HX(lms_cubed),
                  "rgb_lin": HX(rgb_lin), "back": HX(back)})


rng = np.random.default_rng(20260909)

# ------------------------------------------------------------ fixtures
SCALES = {"tiny": 3.0, "small": 4.7, "mid": 6.38}
FIXTURE_LABELS = {}
for name, scale in SCALES.items():
    rgba = np.ascontiguousarray(np.asarray(
        Image.open(os.path.join(FIX, name + ".png")).convert("RGBA")))
    H_, W_ = rgba.shape[:2]
    # reconstruct.py:394 - exactly how the pipeline builds rgb
    rgb = rgba[..., :3].reshape(-1, 3).astype(np.float64) / 255.0
    add_forward("%s/pixels" % name, rgb, {"note": "rgba[...,:3]/255.0, every pixel"})

    # the `cw` shape (reconstruct.py:427-429): float64 bincount means over a
    # cell grid at the fixture's scale
    ys, xs = np.mgrid[0:H_, 0:W_]
    ncy = int(np.ceil(H_ / scale))
    ncx = int(np.ceil(W_ / scale))
    cell = ((ys / scale).astype(int) * ncx + (xs / scale).astype(int)).reshape(-1)
    n = ncy * ncx
    cnt = np.maximum(np.bincount(cell, minlength=n), 1).astype(np.float64)
    cw = np.stack([np.bincount(cell, weights=rgb[:, c], minlength=n)
                   for c in range(3)], 1) / cnt[:, None]
    lab = add_forward("%s/cell_means" % name, cw,
                      {"note": "float64 bincount means over a %dx%d cell grid" % (ncy, ncx)})

    # the `clab` shape (reconstruct.py:514-520): float32 kmeans centers upcast
    import cv2
    k = int(min(48, max(8, n ** 0.5 // 2)))
    data = cw.astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 12, 0.5)
    cv2.setRNGSeed(20260909)
    _, labels, centers = cv2.kmeans(data, k, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    assert centers.dtype == np.float32
    clab = add_forward("%s/kmeans_centers" % name, centers.astype(np.float64),
                       {"note": "cv2.kmeans float32 centers .astype(float64), k=%d" % k})

    # downstream: the snap the caller performs with these two outputs
    d = ((lab[:, None, :] - clab[None, :, :]) ** 2).sum(-1)
    snap = np.argmin(d, 1)
    # how close is the runner-up? a miss can only flip a label where the
    # gap is within the reach of a last-bit perturbation
    ds = np.sort(d, 1)
    gap = ds[:, 1] - ds[:, 0] if ds.shape[1] > 1 else np.full(ds.shape[0], np.inf)
    FIXTURE_LABELS[name] = {
        "cells": "%s/cell_means" % name, "centers": "%s/kmeans_centers" % name,
        "labels": IA(snap), "min_gap": float(gap.min()),
        "n_exact_ties": int(np.sum(gap == 0.0)),
    }

# ------------------------------------------------------------ synthetic
eps = np.finfo(np.float64).eps
knee = 0.04045
grey = lambda v: np.stack([v, v, v], 1)  # noqa: E731

# the forward knee, sampled on both sides at 1-ulp resolution, plus edges
kv = np.concatenate([
    np.array([0.0, -0.0, 1.0, knee]),
    np.nextafter(knee, 1.0) * np.ones(1), np.nextafter(knee, 0.0) * np.ones(1),
    knee + np.arange(-8, 9) * eps * 0.0625,
    np.linspace(0.0, 0.1, 257),
    np.array([-0.5, -1e-3, 1.0 + 1e-9, 1.5, 2.0, 255.0, 1e-300, 5e-324,
              np.inf, -np.inf, np.nan]),
])
add_forward("synthetic/knee_forward_grey", grey(kv),
            {"note": "grey ramp through the 0.04045 knee, edges, out-of-range, inf, nan"})

# each channel alone through the knee so all nine matrix entries see both
# branches
kv2 = np.linspace(0.0, 0.09, 91)
z = np.zeros_like(kv2)
add_forward("synthetic/knee_forward_channels",
            np.concatenate([np.stack([kv2, z, z], 1), np.stack([z, kv2, z], 1),
                            np.stack([z, z, kv2], 1)]),
            {"note": "one channel at a time through the knee"})

# the 8-bit grid: every value a PNG can produce, grey and per-channel
g8 = np.arange(256) / 255.0
add_forward("synthetic/grid8_grey", grey(g8), {"note": "k/255 grey, k=0..255"})
zz = np.zeros(256)
add_forward("synthetic/grid8_channels",
            np.concatenate([np.stack([g8, zz, zz], 1), np.stack([zz, g8, zz], 1),
                            np.stack([zz, zz, g8], 1)]),
            {"note": "k/255 on one channel, the other two 0"})

# random float64 in [0,1]
add_forward("synthetic/uniform_f64", rng.uniform(0.0, 1.0, (20000, 3)),
            {"note": "20000 uniform float64 triples"})
# random float32-grid values upcast (the centers shape, denser)
add_forward("synthetic/uniform_f32grid",
            rng.uniform(0.0, 1.0, (20000, 3)).astype(np.float32).astype(np.float64),
            {"note": "20000 float32 triples upcast to float64"})
# out-of-gamut / odd values
add_forward("synthetic/wild",
            np.concatenate([
                rng.uniform(-0.5, 1.5, (2000, 3)),
                rng.normal(0, 3, (500, 3)),
                np.array([[np.nan, 0.5, 0.5], [0.5, np.inf, 0.5], [0.5, 0.5, -np.inf],
                          [-0.0, -0.0, -0.0], [1e-320, 1e-320, 1e-320]]),
            ]),
            {"note": "outside [0,1], normal(0,3), nan/inf/-0/denormal"})

# inverse-only: the inverse knee (0.0031308 linear) on the grey axis, where
# L = cbrt(v), a = b = 0 gives l = m = s = v and r,g,b ~ v; plus L outside
# [0,1] so np.clip's both ends and the -0.0 tie are exercised
iv = np.concatenate([
    np.array([0.0, -0.0, 1.0, 0.0031308]),
    0.0031308 + np.arange(-8, 9) * eps * 0.00390625,
    np.linspace(0.0, 0.01, 257),
    np.linspace(0.0, 1.0, 1001),
    np.array([-0.5, -1e-9, 1.0 + 1e-9, 1.5, 8.0, np.inf, -np.inf, np.nan]),
])
Lv = np.cbrt(iv)
# L = cbrt(v) does NOT put v itself in front of unlin: cbrt, ** 3 and the
# matrix each round, so the linear r,g,b land a few ulps off v and the
# inclusive knee (u <= 0.0031308) is never exercised on the exact value.
# Hunt, through the reference's own stages, for greys whose linear channel
# lands on 0.0031308 EXACTLY, and refuse to write a fixture that has none:
# a knee test that cannot see the knee is an instrument failure.
#
# On the exact grey axis (a = b = 0) l, m, s are bit-identical, so the
# three products round on one coarse lattice and their sum SKIPS values -
# 8001 greys around the knee produced zero exact hits. Off-axis inputs with
# a, b of order 1e-15 decorrelate l, m, s and let the final add land on any
# double, so the hunt is a random search just off the axis.
knee_i = 0.0031308
hunt = np.random.default_rng(5)
M = 200000
a_s = hunt.uniform(-1e-15, 1e-15, M)
b_s = hunt.uniform(-1e-15, 1e-15, M)
L_s = np.cbrt(knee_i) + hunt.uniform(-1e-15, 1e-15, M)
lab_scan = np.stack([L_s, a_s, b_s], 1)
_, rgb_lin_scan, _ = _stages_inverse(lab_scan)
hit_rows = np.where(np.any(rgb_lin_scan == knee_i, axis=1))[0]
hits_per_channel = [int(np.sum(rgb_lin_scan[:, c] == knee_i)) for c in range(3)]
if hit_rows.size == 0:
    raise SystemExit("FIXTURE GENERATOR BUG: no input lands a linear channel exactly on the inverse knee")
print("inverse knee hunt: %d rows land a channel on 0.0031308 exactly (r,g,b hits %s) out of %d scanned"
      % (hit_rows.size, hits_per_channel, M))
add_inverse_only("synthetic/knee_inverse_grey",
                 np.stack([Lv, np.zeros_like(Lv), np.zeros_like(Lv)], 1))
add_inverse_only("synthetic/knee_inverse_exact", lab_scan[hit_rows])
# random Oklab-ish inputs far outside the gamut so pow's negative bases and
# the clip both fire, and a chroma sweep that pushes single channels < 0 / > 1
add_inverse_only("synthetic/inverse_wild",
                 np.concatenate([
                     np.stack([rng.uniform(-0.2, 1.2, 4000),
                               rng.uniform(-0.6, 0.6, 4000),
                               rng.uniform(-0.6, 0.6, 4000)], 1),
                     np.array([[np.nan, 0.0, 0.0], [0.5, np.nan, 0.0], [0.5, 0.0, np.inf],
                               [-0.0, -0.0, -0.0], [0.0, 0.0, 0.0]]),
                 ]))

# ------------------------------------------------------------ write
doc = {
    "meta": {
        "numpy": np.__version__, "python": sys.version.split()[0],
        "platform": sys.platform,
        "n_cases": len(CASES),
        "float_encoding": "hex of raw little-endian IEEE-754 float64 bytes",
        "stages_forward": ["lms_lin = lin()+matrix", "lms_cbrt = np.cbrt", "lab = matrix"],
        "stages_inverse": ["lms_cubed = matrix+**3", "rgb_lin = matrix", "back = clip+unlin"],
    },
    "downstream": FIXTURE_LABELS,
    "cases": CASES,
}
os.makedirs(FIX, exist_ok=True)
with open(OUT, "w") as fh:
    json.dump(doc, fh)

print("wrote %s" % OUT)
print("numpy %s  python %s  %s" % (np.__version__, sys.version.split()[0], sys.platform))
print("cases: %d" % len(CASES))
tot = 0
for c in CASES:
    tot += c["n"]
    print("   %-36s n=%6d %s" % (c["id"], c["n"], "(inverse only)" if c.get("inverse_only") else ""))
print("total triples: %d" % tot)
print()
print("downstream snap (argmin over Oklab distance), per fixture:")
for name, v in FIXTURE_LABELS.items():
    print("   %-6s cells=%5d  min gap between best and runner-up d: %.3e  exact ties: %d"
          % (name, len(v["labels"]), v["min_gap"], v["n_exact_ties"]))
