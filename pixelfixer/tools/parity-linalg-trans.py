"""Ground truth for the transcendental / complex part of the full-mode
surface -> fixtures/linalg-trans-parity.json.

channels._rayleigh_score / _tiles_ray_z / _ray_quick (ray_e1, tile_e1,
tile_e2: three of the four channels core.py's fused curve reads) compute

    ph = np.exp(2j * np.pi * p / step)          complex128, p float64 peaks
    resultant = (h * ph).sum()                   complex pairwise sum
    R = np.abs(resultant) / h.sum()              hypot
    phase = (np.angle(resultant) / (2*np.pi) * step) % step    atan2

_spectral_z (spec_e1) uses np.log10, _axis_spectrum uses np.hanning(win).
Every intermediate is recorded on the REAL arguments: the peaks and
heights the reference finds on the fixtures' and examples' E1 profiles
and tiles, at every fusion ladder step. The JS side decides which model of
each intermediate numpy follows and how often the platform's Math.*
differs from numpy's in the last bit.

Run: pafenv2/Scripts/python.exe tools/parity-linalg-trans.py
"""
import json
import os
import sys

import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
EX = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "examples")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "python"))
from pixelfixer import channels as CH                   # noqa: E402
from pixelfixer import fusion as FU                     # noqa: E402
from pixelfixer.quantize import kmeans_quantize        # noqa: E402
from scipy.signal import find_peaks                     # noqa: E402

f64 = np.float64


def hx(a):
    return np.ascontiguousarray(np.asarray(a, f64)).tobytes().hex()


def main():
    rng = np.random.default_rng(5)
    imgs = [(n, os.path.join(FIX, n + ".png")) for n in ("tiny", "small", "mid")]
    if "--no-examples" not in sys.argv:
        imgs += [(os.path.splitext(f)[0], os.path.join(EX, f)) for f in sorted(os.listdir(EX))]
    steps = [float(s) for s in FU.ladder()]
    ray = []          # one record per (peak list, step)
    for name, path in imgs:
        rgba = np.asarray(Image.open(path).convert("RGBA"))
        quant, _, _ = kmeans_quantize(cv2.medianBlur(np.ascontiguousarray(rgba), 3), k=16)
        pq = CH.axis_profiles(quant)
        lists = []
        for key in ("e1x", "e1y"):
            norm = CH._normalise(pq[key])
            pk, pr = find_peaks(norm[1:-1], height=0.15, distance=2)
            lists.append(((pk + 1).astype(f64), pr["peak_heights"], name + "/" + key))
        gm = CH._grad_maps(rgba, quant)
        for key, ax in (("dqx", 0), ("dqy", 1)):
            for t, (p, h, _e) in enumerate(CH._tile_peaks(gm[key], axis=ax)[:6]):
                lists.append((p, h, "%s/tile_%s%d" % (name, key, t)))
        for p, h, lab in lists:
            if len(p) < 5:
                continue
            for s in steps[::6]:
                z = 2j * np.pi * p / s
                ph = np.exp(z)
                res = (h * ph).sum()
                ray.append({"label": lab, "step": s, "p": hx(p), "h": hx(h),
                            "zre": hx(z.real), "zim": hx(z.imag),
                            "phre": hx(ph.real), "phim": hx(ph.imag),
                            "resre": hx([res.real]), "resim": hx([res.imag]),
                            "abs": hx([np.abs(res)]), "angle": hx([np.angle(res)]),
                            "hsum": hx([h.sum()])})
    # a flat population for the scalar functions
    th = np.concatenate([rng.uniform(0, 7000, 20000), rng.uniform(-10, 10, 5000)])
    xy = rng.standard_normal((20000, 2)) * np.exp(rng.uniform(-5, 8, (20000, 1)))
    rat = np.exp(rng.uniform(np.log(1e-6), np.log(1e6), 20000))
    wins = sorted(set([47, 46, 111, 110, 203, 202, 1024, 1085, 1084, 1253, 1252, 1447, 1446, 32, 33]))
    doc = {"ray": ray,
           "scalar": {"theta": hx(th), "cos": hx(np.cos(th)), "sin": hx(np.sin(th)),
                      "exp_i_re": hx(np.exp(1j * th).real), "exp_i_im": hx(np.exp(1j * th).imag),
                      "xy": hx(xy), "abs": hx(np.abs(xy[:, 0] + 1j * xy[:, 1])),
                      "hypot": hx(np.hypot(xy[:, 0], xy[:, 1])),
                      "angle": hx(np.angle(xy[:, 0] + 1j * xy[:, 1])),
                      "arctan2": hx(np.arctan2(xy[:, 1], xy[:, 0])),
                      "ratio": hx(rat), "log10": hx(np.log10(rat)),
                      "log10_scalar": hx([np.log10(float(r)) for r in rat[:2000]])},
           "hanning": [{"M": M, "w": hx(np.hanning(M))} for M in wins]}
    out = os.path.join(FIX, "linalg-trans-parity.json")
    with open(out, "w") as f:
        json.dump(doc, f)
    print("ray records: %d  -> wrote %s (%.1f MB)" % (len(ray), out, os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    main()
