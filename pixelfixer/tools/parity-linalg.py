"""Ground truth for src/pf-06-linalg.js and the full-mode additions to
src/pf-00-base.js -> fixtures/linalg-parity.json.

Two kinds of case, kept apart:

  REAL   - numpy calls captured while the PRISTINE reference runs its own
           code on the fixtures and example images. reconsearch.np and
           channels.np are replaced by a recording proxy that forwards
           every attribute to numpy and logs eigh / lstsq / add.reduceat /
           cumsum / average calls (inputs and outputs, bit for bit). Nothing
           the reference computes is altered: the proxy returns numpy's own
           result object.
  SYNTH  - populations built to DISCRIMINATE: orders of summation that
           disagree, rank-deficient least squares, degenerate eigenspaces,
           scaling paths, exact ties for Python's round().

Floats are dumped as lowercase hex of their raw little-endian bytes.
Sections named diag_* re-run reference lines copied here; they locate a
miss, they never pass a case.

RNG: reconsearch._quantize seeds OpenCV's RNG itself (cv2.setRNGSeed(12345))
and numpy's (default_rng(0)), so _prep is reproducible within one process;
this script ASSERTS that (two calls, same bytes) instead of assuming it.
kmeans_quantize (channels' E1 profiles) is NOT seeded - its output is only
used here as an input that gets recorded, so its history-dependence cannot
leak into a comparison.

Run: pafenv2/Scripts/python.exe tools/parity-linalg.py
"""
import hashlib
import json
import os
import platform
import sys
import threading
import time

import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
EX = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "examples")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "python"))
from pixelfixer import reconsearch as R        # noqa: E402
from pixelfixer import channels as CH          # noqa: E402
from pixelfixer import fusion as FU            # noqa: E402
from pixelfixer.quantize import kmeans_quantize  # noqa: E402

f32, f64 = np.float32, np.float64
rng = np.random.default_rng(20260927)


def hx(a, dt=None):
    a = np.asarray(a)
    if dt is not None:
        assert a.dtype == dt, (a.dtype, dt)
    return np.ascontiguousarray(a).tobytes().hex()


def tag(a):
    a = np.asarray(a)
    return {"dtype": str(a.dtype), "shape": list(a.shape), "hex": hx(a)}


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def load(path):
    return np.asarray(Image.open(path).convert("RGBA"))


IMAGES = [("tiny", os.path.join(FIX, "tiny.png")), ("small", os.path.join(FIX, "small.png")),
          ("mid", os.path.join(FIX, "mid.png"))]
if "--no-examples" not in sys.argv:
    IMAGES += [(os.path.splitext(f)[0], os.path.join(EX, f)) for f in sorted(os.listdir(EX))]


# ================================================================ recorder
class Recorder:
    def __init__(self):
        self.on = False
        self.calls = []
        self.caps = {}
        self.big = {}

    def want(self, kind, size, cap_n, cap_size, big_n):
        if not self.on:
            return False
        if size <= cap_size:
            n = self.caps.get(kind, 0)
            if n >= cap_n:
                return False
            self.caps[kind] = n + 1
            return True
        n = self.big.get(kind, 0)
        if n >= big_n:
            return False
        self.big[kind] = n + 1
        return True


REC = Recorder()


class _AddProxy:
    def __getattr__(self, k):
        return getattr(np.add, k)

    def reduceat(self, a, indices, axis=0, *args, **kw):
        out = np.add.reduceat(a, indices, axis, *args, **kw)
        a_ = np.asarray(a)
        if REC.want("reduceat", a_.size, 40, 30000, 1):
            REC.calls.append({"fn": "reduceat", "a": tag(np.ascontiguousarray(a_)),
                              "indices": [int(i) for i in np.asarray(indices)], "axis": int(axis),
                              "out": tag(out)})
        return out


class _LinalgProxy:
    def __getattr__(self, k):
        return getattr(np.linalg, k)

    def eigh(self, a, *args, **kw):
        res = np.linalg.eigh(a, *args, **kw)
        if REC.on:
            a_ = np.asarray(a)
            r64 = np.linalg.eigh(a_.astype(f64))
            REC.calls.append({"fn": "eigh", "a": tag(a_), "w": tag(res[0]), "v": tag(res[1]),
                              "w64": tag(r64[0]), "v64": tag(r64[1]),
                              "cast_equal": bool(np.array_equal(r64[0].astype(res[0].dtype), res[0])
                                                 and np.array_equal(r64[1].astype(res[1].dtype), res[1]))})
        return res

    def lstsq(self, a, b, *args, **kw):
        res = np.linalg.lstsq(a, b, *args, **kw)
        if REC.on:
            REC.calls.append({"fn": "lstsq", "a": tag(np.asarray(a)), "b": tag(np.asarray(b)),
                              "x": tag(res[0]), "rank": int(res[2]), "s": tag(res[3])})
        return res


class _NpProxy:
    add = _AddProxy()
    linalg = _LinalgProxy()

    def __getattr__(self, k):
        return getattr(np, k)

    def cumsum(self, a, axis=None, dtype=None, out=None):
        r = np.cumsum(a, axis=axis, dtype=dtype, out=out)
        a_ = np.asarray(a)
        if REC.want("cumsum", a_.size, 20, 400000, 0):
            REC.calls.append({"fn": "cumsum", "a": tag(np.ascontiguousarray(a_)), "axis": axis,
                              "out": tag(np.ascontiguousarray(r))})
        return r

    def average(self, a, axis=None, weights=None, **kw):
        r = np.average(a, axis=axis, weights=weights, **kw)
        if REC.on and axis is None:
            REC.calls.append({"fn": "average", "a": tag(np.asarray(a, f64)), "w": tag(np.asarray(weights, f64)),
                              "out": hx(np.asarray([r], f64))})
        return r


R.np = _NpProxy()
CH.np = _NpProxy()


# ============================================================ REAL: reconsearch
def quantize_diag(rgb, k=R.KMEANS_K, sample=48000, seed=0):
    """reconsearch._quantize lines 53-69, copied, to expose centers + labels."""
    h, w, _ = rgb.shape
    flat = rgb.reshape(-1, 3)
    n = flat.shape[0]
    rg = np.random.default_rng(seed)
    cv2.setRNGSeed(12345 + seed)
    idx = rg.choice(n, min(sample, n), replace=False)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 25, 0.25)
    k = min(k, max(2, len(np.unique(np.round(flat[idx][::7] / 8), axis=0))))
    _, _, centers = cv2.kmeans(flat[idx].astype(np.float32), k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    out = np.empty((n,), np.int32)
    c2 = (centers ** 2).sum(1)
    for i in range(0, n, 262144):
        blk = flat[i:i + 262144]
        out[i:i + 262144] = np.argmax(2.0 * (blk @ centers.T) - c2[None, :], 1)
    return centers[out].reshape(h, w, 3), centers, out, c2, idx


def real_reconsearch(name, rgba):
    t0 = time.time()
    h, w = rgba.shape[:2]
    a = rgba[..., 3].astype(f32)
    rgb = rgba[..., :3].astype(f32) * (a[..., None] / 255.0)
    q_ref = R._quantize(rgb)
    q_ref2 = R._quantize(rgb)
    assert np.array_equal(q_ref, q_ref2), "reconsearch._quantize is not reproducible in-process"
    # and from a worker thread (core.py runs _build_recon on a pool thread;
    # OpenCV's RNG is thread-local and _quantize reseeds it in-thread)
    box = {}
    th = threading.Thread(target=lambda: box.setdefault("q", R._quantize(rgb)))
    th.start(); th.join()
    thread_equal = bool(np.array_equal(q_ref, box["q"]))
    q, centers, labels, c2, sidx = quantize_diag(rgb)
    assert np.array_equal(q, q_ref), "diag copy of _quantize disagrees with the reference"
    # _pca_channels, line by line, with every intermediate kept
    flat = q.reshape(-1, 3)
    mu = flat.mean(0)
    x = flat - mu
    C = x.T @ x
    cov = C / max(x.shape[0], 1)
    REC.on = True
    REC.caps, REC.big = {}, {}
    start = len(REC.calls)
    ch = R._prep(rgba)                      # records the eigh call
    eig_calls = [c for c in REC.calls[start:] if c["fn"] == "eigh"]
    assert len(eig_calls) == 1
    evals, evecs = np.linalg.eigh(cov)
    order = np.argsort(evals)[::-1][:2]
    comps = x @ evecs[:, order]
    # every row with the same label must give the same comps if the
    # matmul result depends only on the row's values (no tail special case)
    first = {}
    same = True
    for lab in np.unique(labels):
        rows = np.nonzero(labels == lab)[0]
        first[int(lab)] = int(rows[0])
        blk = comps[rows]
        if not (blk == blk[0]).all():
            same = False
    alpha_std = a.std()
    alpha_mean = a.mean()
    # the shapes reconsearch._quantize produces at a block boundary: a
    # ONE-row last block goes to sgemv, a few rows to sgemm
    tail1 = flat[-1:] @ centers.T
    tail5 = flat[-5:] @ centers.T
    # AxisData on the real channels (records cumsum / reduceat / average)
    axes = {}
    for axis in (0, 1):
        ad = R.AxisData(ch, axis)
        extent = w if axis == 0 else h
        s_list = R._s_grid(extent)
        ev = []
        for s in list(s_list[::7]) + [float(s_list[-1])]:
            ev.append([float(s)] + [float(v) for v in ad.eval_s(s)])
            ev.append([float(s)] + [float(v) for v in ad.eval_s(s, dense=True)])
            nbc = ad.nbc_for(s)
            if nbc > 1:
                ev.append([float(s)] + [float(v) for v in ad.eval_s(s, dense=True, nbc=nbc)])
        pr = [[float(s), float(ad.phase_regress(s))] for s in (float(s_list[len(s_list) // 3]), float(s_list[len(s_list) // 2]))]
        axes["x" if axis == 0 else "y"] = {"H": ad.H, "W": ad.W, "C": ad.C, "t_sum_hex": hx(np.array([ad.t_sum], f64)),
                                            "S_sha": sha(ad.S), "Q_sha": sha(ad.Q), "eval_s": ev, "phase_regress": pr}
    REC.on = False
    rec = REC.calls[start:]
    case = {"name": name, "w": int(w), "h": int(h), "n": int(h * w),
            "thread_equal": thread_equal,
            "centers": tag(centers), "labels_hex": labels.astype(np.uint8).tobytes().hex(), "k": int(len(centers)),
            "c2": tag(c2), "sample_idx_sha": sha(sidx.astype(np.int64)),
            "mu": tag(mu), "C": tag(C), "cov": tag(cov), "evals": tag(evals), "evecs": tag(evecs),
            "order": [int(o) for o in order], "comps_rows_same_by_label": same,
            "comps_first": {str(k): hx(comps[r]) for k, r in first.items()},
            "alpha_mean": hx(np.array([alpha_mean], f32)), "alpha_std": hx(np.array([alpha_std], f32)),
            "alpha_appended": bool(alpha_std > 2.0),
            "tail1": tag(tail1), "tail5": tag(tail5),
            "ch_shape": list(ch.shape), "ch_sha": sha(ch),
            "axes": axes, "recorded": rec}
    if h * w <= 50000:
        case["ch"] = tag(ch)
    print("  %-11s %5dx%-5d k=%-2d evals=%s order=%s alpha=%s thread_equal=%s rows_same=%s rec=%d %.1fs" % (
        name, w, h, len(centers), np.array2string(evals, precision=4), list(order), bool(alpha_std > 2.0),
        thread_equal, same, len(rec), time.time() - t0))
    return case


# ============================================================ REAL: lstsq
def lattice_loop_diag(peaks, h, s0, n_iters=4):
    """channels._lattice_refine_peaks lines 178-196, copied (the loop both
    _lattice_refine and _lattice_refine_peaks run), so the JS side can
    replay the whole iteration from the same peaks."""
    if len(peaks) < 4:
        return s0
    s = float(s0)
    phi = float(peaks[np.argmax(h)]) % s
    for _ in range(n_iters):
        k = np.round((peaks - phi) / s)
        resid = peaks - (phi + k * s)
        w = h * (np.abs(resid) < 0.35 * s)
        if w.sum() <= 0 or len(np.unique(k[w > 0])) < 3:
            return s0
        A = np.stack([np.ones_like(k), k], axis=1)
        try:
            coef, *_ = np.linalg.lstsq(A * w[:, None], peaks * w, rcond=None)
        except np.linalg.LinAlgError:
            return s0
        phi, s = float(coef[0]), float(coef[1])
        if not np.isfinite(s) or s < 1.2 or abs(s - s0) > 0.6 * s0:
            return s0
    return s


def real_lstsq(name, rgba, loops, max_loops):
    from scipy.signal import find_peaks
    base = cv2.medianBlur(np.ascontiguousarray(rgba), 3)
    quant, _, _ = kmeans_quantize(base, k=16)
    pq = CH.axis_profiles(quant)
    po = CH.axis_profiles(rgba)
    profs = {"e1x": pq["e1x"], "e1y": pq["e1y"], "e2x": po["e2x"], "e2y": po["e2y"]}
    seeds = [float(s) for s in FU.ladder()[::4]]
    REC.on = True
    REC.caps, REC.big = {}, {}
    start = len(REC.calls)
    nloop = 0
    for key, prof in profs.items():
        for s0 in seeds:
            if s0 > (len(prof) - 1) / 3:
                continue
            got = CH._lattice_refine(prof, s0)
            norm = CH._normalise(prof)
            pk, pr = find_peaks(norm[1:-1], height=0.12, distance=max(1, int(s0 * 0.45)))
            peaks = (pk + 1).astype(np.float64)
            REC.on = False
            again = lattice_loop_diag(peaks, pr["peak_heights"], s0) if len(peaks) >= 4 else s0
            REC.on = True
            assert again == got or (again != again and got != got), (name, key, s0, again, got)
            if len(loops) < max_loops and len(peaks) >= 4:
                loops.append({"image": name, "profile": key, "s0": hx(np.array([s0], f64)),
                              "peaks": hx(peaks), "h": hx(np.asarray(pr["peak_heights"], f64)),
                              "out": hx(np.array([got], f64)), "fn": "_lattice_refine"})
            nloop += 1
    # per-tile fits (_AxisEvidence.refine -> _lattice_refine_peaks)
    gm = CH._grad_maps(rgba, quant)
    for key, ax in (("dqx", 0), ("dqy", 1)):
        tiles = CH._tile_peaks(gm[key], axis=ax)
        for (p, hh, _ext) in tiles[:40]:
            if len(p) < 6:
                continue
            for s0 in seeds[:6]:
                got = CH._lattice_refine_peaks(p, hh, s0)
                if len(loops) < max_loops:
                    loops.append({"image": name, "profile": "tile_" + key, "s0": hx(np.array([s0], f64)),
                                  "peaks": hx(np.asarray(p, f64)), "h": hx(np.asarray(hh, f64)),
                                  "out": hx(np.array([got], f64)), "fn": "_lattice_refine_peaks"})
                nloop += 1
    REC.on = False
    calls = [c for c in REC.calls[start:] if c["fn"] == "lstsq"]
    del REC.calls[start:]
    print("  %-11s lattice refines=%d  lstsq calls=%d" % (name, nloop, len(calls)))
    return calls


# ================================================================= SYNTH
def synth_eigh():
    cases = []

    def add(label, A):
        A = np.asarray(A)
        w, v = np.linalg.eigh(A)
        w64, v64 = np.linalg.eigh(A.astype(f64))
        cases.append({"label": label, "a": tag(A), "w": tag(w), "v": tag(v), "w64": tag(w64), "v64": tag(v64)})

    for t in range(400):                                   # random covariances, f32 like the reference
        n = int(rng.integers(20, 400))
        X = rng.standard_normal((n, 3)) * np.exp(rng.uniform(-2, 5, 3))
        if t % 2:
            X = X @ rng.standard_normal((3, 3))
        X = X.astype(f32)
        X = X - X.mean(0)
        add("cov32", (X.T @ X) / f32(n))
    for t in range(100):                                   # float64 symmetric, indefinite too
        B = rng.standard_normal((3, 3)) * np.exp(rng.uniform(-3, 3))
        add("sym64", (B + B.T) / 2)
    for n in (2, 4, 5, 7):                                 # other sizes: QL and QR sweeps, deflation
        for t in range(25):
            B = rng.standard_normal((n, n))
            if t % 3 == 0:
                B = B @ B.T
            add("sym64_n%d" % n, (B + B.T) / 2)
    # degenerate spectra: the cases whose eigenvectors are NOT unique
    for c in (1.0, 37.25, 1234.5, 0.001953125):
        add("rank1_ones*c", np.full((3, 3), c, f32))       # grey image: x has R == G == B
    for t in range(20):
        u = rng.standard_normal(3).astype(f32)
        add("rank1_uuT", np.outer(u, u).astype(f32))
        g = (rng.standard_normal((50, 1)) * 30).astype(f32)
        X = np.hstack([g, g, (rng.standard_normal((50, 1)) * 20).astype(f32)])
        X = X - X.mean(0)
        add("rank2_RG", (X.T @ X) / f32(50))
    add("zeros", np.zeros((3, 3), f32))
    add("identity", np.eye(3, dtype=f32))
    add("diag_tie", np.diag([5.0, 5.0, 1.0]).astype(f32))
    add("diag_distinct", np.diag([3.0, 1.0, 2.0]).astype(f32))
    add("diag_neg", np.diag([-3.0, 0.0, 2.0]).astype(f32))
    add("tiny", (np.array([[2, 1, 0], [1, 3, 1], [0, 1, 4]], f64) * 1e-160))   # dsyevd scaling, low
    add("huge", (np.array([[2, 1, 0], [1, 3, 1], [0, 1, 4]], f64) * 1e160))    # dsyevd scaling, high
    add("tridiag_already", np.array([[4, 1, 0], [1, 3, 1], [0, 1, 2]], f64))
    add("offdiag_zero_col", np.array([[4, 0, 0], [0, 3, 1], [0, 1, 2]], f64))
    return cases


def synth_lstsq():
    cases = []

    def add(label, A, b):
        A = np.asarray(A, f64); b = np.asarray(b, f64)
        x, _res, rank, s = np.linalg.lstsq(A, b, rcond=None)
        cases.append({"label": label, "a": tag(A), "b": tag(b), "x": tag(x), "rank": int(rank), "s": tag(s)})

    for t in range(300):                                   # the call-site shape: [w, k*w]
        m = int(rng.integers(4, 120))
        k = np.round(rng.uniform(-3, 400, m))
        w = rng.uniform(0.12, 1.5, m) * (rng.uniform(size=m) > 0.25)
        A = np.stack([np.ones_like(k), k], 1) * w[:, None]
        add("callsite", A, (k * rng.uniform(1.2, 30) + rng.normal(0, 0.4, m)) * w)
    for m in (2, 3):                                       # around mnthr = int(2 * 1.6) = 3
        for t in range(20):
            add("m%d" % m, rng.standard_normal((m, 2)) * 10, rng.standard_normal(m))
    for t in range(20):                                    # n = 1
        m = int(rng.integers(1, 30))
        add("n1", rng.standard_normal((m, 1)), rng.standard_normal(m))
    # rank-deficient: the minimum-norm branch (unreachable from the call sites)
    for t in range(20):
        m = int(rng.integers(3, 30))
        w = rng.uniform(0.2, 1, m)
        kk = float(rng.integers(1, 50))
        add("rankdef_same_k", np.stack([w, kk * w], 1), rng.standard_normal(m) * w)
    for t in range(10):
        m = int(rng.integers(3, 30))
        c = rng.standard_normal(m)
        add("rankdef_equal_cols", np.stack([c, c], 1), rng.standard_normal(m))
        add("rankdef_zero_col", np.stack([c, np.zeros(m)], 1), rng.standard_normal(m))
    add("zero_matrix", np.zeros((6, 2)), np.arange(6.0))
    add("one_nonzero_row", np.array([[0, 0], [2.0, 5.0], [0, 0], [0, 0]]), np.array([1.0, 3.0, 2.0, 7.0]))
    add("tiny_scale", np.array([[1, 2], [3, 5], [7, 8], [2, 9.0]]) * 1e-300, np.array([1, 2, 3, 4.0]))
    add("huge_scale", np.array([[1, 2], [3, 5], [7, 8], [2, 9.0]]) * 1e300, np.array([1, 2, 3, 4.0]))
    add("b_zero", np.array([[1, 2], [3, 5], [7, 8.0]]), np.zeros(3))
    return cases


def synth_matmul():
    cases = []
    for n in (1, 2, 3, 5, 15, 16, 17, 31, 33, 100, 1000, 4099):
        for p in (1, 2, 3, 14):
            A = (rng.standard_normal((n, 3)) * np.exp(rng.uniform(-4, 6, (n, 1)))).astype(f32)
            B = rng.standard_normal((p, 3)).astype(f32)      # like centers (k, 3); product is A @ B.T
            cases.append({"n": n, "k": 3, "p": p, "a": tag(A), "bT": tag(B), "out": tag(A @ B.T)})
    # vector products: numpy sends (1,3)@(3,p) and (n,3)@(3,1) to sgemv
    gemv = []
    for p in list(range(2, 41)) + [64, 100]:
        B = rng.standard_normal((p, 3)).astype(f32)
        A = (rng.standard_normal((120, 3)) * np.exp(rng.uniform(-4, 6, (120, 1)))).astype(f32)
        outs = np.stack([A[i:i + 1] @ B.T for i in range(120)])[:, 0, :]
        gemv.append({"kind": "vec@mat", "p": p, "rows": tag(A), "bT": tag(B), "out": tag(outs)})
    for n in list(range(2, 70)) + [100, 1001]:
        A = (rng.standard_normal((n, 3)) * np.exp(rng.uniform(-4, 6, (n, 1)))).astype(f32)
        v = rng.standard_normal((3, 1)).astype(f32)
        gemv.append({"kind": "mat@vec", "n": n, "a": tag(A), "v": tag(v), "out": tag((A @ v)[:, 0])})
    cases.extend([])
    syrk = []
    for n in (1, 7, 8, 100, 511, 512, 513, 1023, 1024, 1025, 1537, 3001, 5000, 20000):
        x = (rng.standard_normal((n, 3)) * np.exp(rng.uniform(-3, 3, (n, 1)))).astype(f32)
        syrk.append({"n": n, "x": tag(x), "out": tag(x.T @ x)})
    return cases, syrk, gemv


def synth_reductions():
    out = {"sum": [], "cumsum": [], "reduceat": [], "maxacc": [], "meanstd": [], "average": []}
    import itertools
    # dims straddle numpy's pairwise boundaries (n < 8 sequential, 8..128
    # unrolled, > 128 recursive) so every branch of the order is exercised
    shapes = [(13, 9, 17), (3, 300, 5), (260, 4, 3), (5, 1, 40), (1, 7, 130), (37, 29), (400, 3), (3, 400),
              (8, 9, 16), (3, 128, 2), (2, 129, 3), (136, 2), (2, 136)]
    for dt in (f32, f64):
        for shp in shapes:
            base = (rng.standard_normal(shp) * np.exp(rng.uniform(-6, 6, shp))).astype(dt)
            nd = len(shp)
            for perm in itertools.permutations(range(nd)):
                view = np.transpose(base, perm)
                for r in range(1, nd + 1):
                    for axes in itertools.combinations(range(nd), r):
                        res = view.sum(axis=axes)
                        out["sum"].append({"base": tag(base), "perm": list(perm), "axes": list(axes),
                                           "out": tag(np.ascontiguousarray(res))})
            # (the base array is repeated per case; main() dedupes it by sha)
        a = (rng.standard_normal((6, 50, 4)) * np.exp(rng.uniform(-6, 6, (6, 50, 4)))).astype(dt)
        for axis in (0, 1, 2):
            out["cumsum"].append({"a": tag(a), "axis": axis, "out": tag(np.cumsum(a, axis=axis))})
            out["maxacc"].append({"a": tag(a), "axis": axis, "out": tag(np.maximum.accumulate(a, axis=axis))})
        spec = np.array([1.0, np.nan, 0.5, -0.0, 0.0, -0.0, 2.0, np.nan, 1.0], dt)
        out["maxacc"].append({"a": tag(spec), "axis": 0, "out": tag(np.maximum.accumulate(spec))})
        b = (rng.standard_normal((300, 7)) * np.exp(rng.uniform(-6, 6, (300, 7)))).astype(dt)
        for axis, idxs in ((0, [0, 5, 17, 200, 299]), (0, [0, 48, 96, 144, 192, 240]), (1, [0, 3, 4]),
                           (0, [10, 10, 3, 200]), (1, [6, 0, 2]), (0, [0]), (0, [299]),
                           # segments of 8, 9, 10, 17, 129, 130 elements (rest 7, 8, 9, 16, 128, 129)
                           (0, [0, 8, 17, 27, 44, 173]), (0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 139, 270])):
            out["reduceat"].append({"a": tag(b), "axis": axis, "indices": idxs,
                                    "out": tag(np.add.reduceat(b, idxs, axis=axis))})
        for n in (1, 5, 8, 9, 100, 128, 129, 1000, 4097, 50000):
            v = (rng.standard_normal(n) * np.exp(rng.uniform(-4, 4, n)) + rng.uniform(-50, 50)).astype(dt)
            out["meanstd"].append({"a": tag(v), "mean": hx(np.array([v.mean()], dt)), "std": hx(np.array([v.std()], dt))})
        m2 = (rng.uniform(0, 255, (123, 77))).astype(dt)
        out["meanstd"].append({"a": tag(m2), "mean": hx(np.array([m2.mean()], dt)), "std": hx(np.array([m2.std()], dt))})
        out["meanstd"].append({"a": tag(np.full(1000, 255, dt)), "mean": hx(np.array([np.full(1000, 255, dt).mean()], dt)),
                               "std": hx(np.array([np.full(1000, 255, dt).std()], dt))})
        # mean over axis 0 of (n, 3) - reconsearch.py:76
        for n in (5, 100, 4099, 30000):
            x = (rng.uniform(0, 255, (n, 3))).astype(dt)
            out["meanstd"].append({"axis0": tag(x), "mean": tag(x.mean(0))})
    for n in (3, 4, 5, 8, 9, 17, 40):
        for t in range(20):
            xs = rng.standard_normal(n) * 100
            ws = np.abs(rng.standard_normal(n)) + 1e-12
            out["average"].append({"x": tag(xs), "w": tag(ws), "out": hx(np.array([np.average(xs, weights=ws)], f64))})
    return out


def synth_pyround():
    vals = []
    for e in range(16, 2100, 7):                           # extent / count steps, the reference's candidates
        for c in range(1, 700, 3):
            vals.append(e / c)
    for k in range(1, 4000):                               # exact dyadic ties at 2 and 4 digits
        vals.append(k / 8.0); vals.append(k / 32.0); vals.append(k / 64.0)
    vals += list(rng.uniform(1.2, 64, 3000)) + list(rng.uniform(-100, 100, 1000))
    vals += [0.125, 0.375, 2.675, 1.0005, 1.00005, -0.125, -2.5, 0.0, -0.0, 1e-30, -1e-30, 5e-5, 5e-3, 123456.78905]
    vals = np.array(vals, f64)
    return {"x": hx(vals), "r2": hx(np.array([round(float(v), 2) for v in vals], f64)),
            "r4": hx(np.array([round(float(v), 4) for v in vals], f64)),
            "r0": hx(np.array([round(float(v), 0) for v in vals], f64))}


def synth_generator():
    out = []
    for n in (2304, 12544, 41616, 1572516, 1572516 + 0, 2304 * 3, 48000, 47999, 10000, 10001):
        idx = np.random.default_rng(0).choice(n, min(48000, n), replace=False)
        out.append({"n": n, "size": int(min(48000, n)), "sha": sha(idx.astype(np.int64)), "head": [int(v) for v in idx[:20]]})
    return out


def main():
    t0 = time.time()
    doc = {"meta": {"numpy": np.__version__, "cv2": cv2.__version__, "python": platform.python_version(),
                    "machine": platform.machine(),
                    "cpu": {k: bool(v) for k, v in np._core._multiarray_umath.__cpu_features__.items()
                            if k in ("AVX2", "FMA3", "AVX512F", "AVX512_SKX")}}}
    print("REAL reconsearch (_prep -> eigh, AxisData -> cumsum/reduceat/average):")
    doc["recon"] = [real_reconsearch(nm, load(p)) for nm, p in IMAGES]
    print("REAL lstsq (channels._lattice_refine / _lattice_refine_peaks):")
    loops, calls = [], []
    for nm, p in IMAGES:
        calls += real_lstsq(nm, load(p), loops, 2500)
    doc["lstsq_real"] = calls
    doc["lattice_loops"] = loops
    print("SYNTH ...")
    doc["eigh_synth"] = synth_eigh()
    doc["lstsq_synth"] = synth_lstsq()
    doc["matmul"], doc["syrk"], doc["gemv"] = synth_matmul()
    red = synth_reductions()
    # dedupe the repeated base arrays of the sum population
    bases, sums = {}, []
    for c in red["sum"]:
        if c is None:
            continue
        key = hashlib.sha256(c["base"]["hex"].encode()).hexdigest()[:24]
        bases.setdefault(key, c["base"])
        c = dict(c); c["base"] = key
        sums.append(c)
    red["sum"] = sums
    red["sum_bases"] = bases
    doc["reductions"] = red
    doc["pyround"] = synth_pyround()
    doc["choice"] = synth_generator()
    out = os.path.join(FIX, "linalg-parity.json")
    with open(out, "w") as f:
        json.dump(doc, f)
    print("wrote %s (%.1f MB) in %.1fs" % (out, os.path.getsize(out) / 1e6, time.time() - t0))


if __name__ == "__main__":
    main()
