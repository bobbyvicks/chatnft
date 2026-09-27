"""Is reconsearch's result invariant to what np.linalg.eigh leaves arbitrary?

Two freedoms LAPACK decides and the port must either match or prove harmless:
  (1) the SIGN of each eigenvector;
  (2) for a repeated eigenvalue, WHICH orthonormal basis of its eigenspace.
      A greyscale image (R == G == B after k-means) has cov = c * ones(3,3):
      eigenvalues {3c, 0, 0}, and reconsearch keeps the top vector plus ONE
      vector of the 2-D null space - chosen by LAPACK's rounding noise.

Method: run the PRISTINE reference with np.linalg.eigh (as reconsearch sees
it) wrapped to return a modified eigenvector matrix, and compare everything
downstream BIT FOR BIT against the unmodified run: the channel stack, the
AxisData cumsum tables, eval_s on the whole coarse grid (plain, dense and
segmented), the full-mode core's recon terms (_s_grid[::3] curves + trend),
and R.detect's answer.

Prints only. Run: pafenv2/Scripts/python.exe tools/probe-linalg-eigh-signs.py
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EX = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "examples")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "python"))
from pixelfixer import reconsearch as R   # noqa: E402

f32, f64 = np.float32, np.float64
MOD = {"fn": None}


class _Linalg:
    def __getattr__(self, k):
        return getattr(np.linalg, k)

    def eigh(self, a, *args, **kw):
        w, v = np.linalg.eigh(a, *args, **kw)
        if MOD["fn"] is not None:
            v = MOD["fn"](w, v.copy())
        return w, v


class _Np:
    linalg = _Linalg()

    def __getattr__(self, k):
        return getattr(np, k)


R.np = _Np()


def fingerprint(rgba, full_detect):
    h, w = rgba.shape[:2]
    ch = R._prep(rgba)
    fp = {"ch_abs": np.abs(ch).tobytes(), "ch_shape": ch.shape}
    for axis, extent in ((0, w), (1, h)):
        ad = R.AxisData(ch, axis)
        fp["Q%d" % axis] = ad.Q.tobytes()
        fp["Sabs%d" % axis] = np.abs(ad.S).tobytes()
        fp["t%d" % axis] = ad.t_sum
        fp["seg%d" % axis] = b"".join(ad.seg[k][1].tobytes() for k in sorted(ad.seg))
        s_list = R._s_grid(extent)
        ev = []
        for s in s_list:
            ev.append(ad.eval_s(s))
            ev.append(ad.eval_s(s, dense=True))
            nbc = ad.nbc_for(s)
            if nbc > 1:
                ev.append(ad.eval_s(s, dense=True, nbc=nbc))
        fp["eval%d" % axis] = np.array(ev, f64).tobytes()
        sl = s_list[::3]                                   # core.py _build_recon
        eb, er = R._coarse_curves(ad, sl)
        tr = R._trend_fn(sl, eb)
        fp["core%d" % axis] = np.array([tr(s) for s in sl] + list(eb) + list(er), f64).tobytes()
    if full_detect:
        fp["detect"] = repr(R.detect(rgba))
    return fp, ch


def diff(a, b):
    return [k for k in a if a[k] != b[k]]


def grey(rgba):
    g = (0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2]).round().astype(np.uint8)
    out = rgba.copy()
    out[..., 0] = out[..., 1] = out[..., 2] = g
    return out


def main():
    imgs = [(n, np.asarray(Image.open(os.path.join(ROOT, "fixtures", n + ".png")).convert("RGBA")))
            for n in ("tiny", "small", "mid")]
    if "--examples" in sys.argv:
        imgs += [(os.path.splitext(f)[0], np.asarray(Image.open(os.path.join(EX, f)).convert("RGBA")))
                 for f in sorted(os.listdir(EX))]
    imgs += [("grey-" + n, grey(a)) for n, a in imgs[:3]]
    rng = np.random.default_rng(3)
    print("%-13s %-44s %s" % ("image", "modification of eigh's eigenvectors", "downstream fields that changed"))
    for name, rgba in imgs:
        small = rgba.shape[0] * rgba.shape[1] <= 50000
        MOD["fn"] = None
        base, ch = fingerprint(rgba, small)
        w, _ = np.linalg.eigh(np.eye(3, dtype=f32))
        # what eigh returned on this image
        a = rgba[..., 3].astype(f32)
        q = R._quantize(rgba[..., :3].astype(f32) * (a[..., None] / 255.0))
        flat = q.reshape(-1, 3)
        x = flat - flat.mean(0)
        ev, V = np.linalg.eigh((x.T @ x) / max(x.shape[0], 1))
        degenerate = ev[0] < 1e-6 * ev[2] and ev[1] < 1e-6 * ev[2]
        mods = [("flip sign of column 2 (top)", lambda w_, v: (v.__setitem__((slice(None), 2), -v[:, 2]), v)[1]),
                ("flip sign of column 1", lambda w_, v: (v.__setitem__((slice(None), 1), -v[:, 1]), v)[1]),
                ("flip sign of all columns", lambda w_, v: -v)]
        if degenerate:
            for th in (0.3, 1.0, 2.2):
                def rot(w_, v, th=th):
                    c, s = np.cos(th), np.sin(th)
                    v0 = v[:, 0].astype(f64); v1 = v[:, 1].astype(f64)
                    v[:, 0] = (c * v0 - s * v1).astype(f32)
                    v[:, 1] = (s * v0 + c * v1).astype(f32)
                    return v
                mods.append(("rotate the null-space basis by %.1f rad" % th, rot))
        print("%-13s evals=%s%s" % (name, np.array2string(ev, precision=3), "   DEGENERATE (null space dim 2)" if degenerate else ""))
        for label, fn in mods:
            MOD["fn"] = fn
            fp, ch2 = fingerprint(rgba, small)
            MOD["fn"] = None
            d = diff(base, fp)
            print("%-13s %-44s %s" % ("", label, "NONE - bit-identical" if not d else ", ".join(d)))
            if d and "detect" in base:
                print("%-13s %-44s detect: %s -> %s" % ("", "", base["detect"][:80], fp["detect"][:80]))


if __name__ == "__main__":
    main()
