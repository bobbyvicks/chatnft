"""Ground truth for src/pf-41-reconsearch.js.

Writes
  fixtures/reconsearch-parity.json         meta + the numpy-semantics probes
  fixtures/raw/reconsearch/<case>.json     one case's reference answers
  fixtures/raw/reconsearch/<case>.ch.f32   R._prep(rgba), raw little-endian
  fixtures/raw/reconsearch/<case>.labels.u8  _quantize's labels (diag)
  fixtures/raw/reconsearch/<case>.rgba     synthetic cases' pixels (the real
                                           ones are fixtures/raw/<name>.rgba)
All of it is under .gitignore (fixtures/raw/, fixtures/*-parity.json).

ONE CASE PER PROCESS. reconsearch._quantize seeds OpenCV's generator itself
(cv2.setRNGSeed(12345 + seed)), so unlike quantize.py its answer should not
depend on what ran earlier - but "should not" is a claim, so each case runs
in a fresh interpreter anyway, and inside it _prep is called again after
core.detect and R.detect have drawn from every generator in the process;
`prep_repeat_identical` records whether the bytes came back the same.

WHAT IS RECORDED, AND FROM WHERE
  * The authoritative values are return values of the reference's own
    functions, called through its own entry points:
      - R._prep(rgba), R.AxisData(ch, axis) fields, and the exact sequence
        core.py's _build_recon runs (_s_grid(extent)[::3], _coarse_curves,
        _trend_fn);
      - every call pixelfixer.core.detect(mode="full") makes into this
        module (observed by wrapping the module's functions; the wrappers
        call the originals and only record);
      - every call R.detect(rgba) makes into its own helpers, and its result.
  * "diag" values are the reference's lines COPIED here to expose
    intermediates (sample indices, centers, covariance, eigenvectors). They
    exist to locate a mismatch, never to certify one, and the script
    asserts the copy reproduces the reference's return value before using it.

Floats are dumped as lowercase hex of their raw little-endian bytes, so the
JSON round trip cannot lose a bit.

  <venv>/Scripts/python.exe tools/parity-reconsearch.py          all cases
  <venv>/Scripts/python.exe tools/parity-reconsearch.py --one frog
The venv is the one README.md describes; `import pixelfixer` must resolve to
the pristine reference checkout (asserted below).
"""
import hashlib
import json
import os
import subprocess
import sys
import threading
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
RAW = os.path.join(FIX, "raw")
OUT = os.path.join(RAW, "reconsearch")
REF = os.path.normpath(os.path.join(ROOT, "..", "..", "paf-ref", "python"))
if os.path.isdir(REF):
    sys.path.insert(0, REF)

import cv2  # noqa: E402
import pixelfixer  # noqa: E402
from pixelfixer import reconsearch as R  # noqa: E402

f32, f64 = np.float32, np.float64
REAL = ["tiny", "small", "mid", "dragon", "frog", "koi-pond", "lighthouse"]
SYNTH = ["synth_alpha", "synth_gray", "synth_sgemv", "synth_tiny_rect", "synth_2color", "synth_hbands"]


def hx64(a):
    return np.ascontiguousarray(np.asarray(a, f64)).astype("<f8").tobytes().hex()


def hx32(a):
    a = np.asarray(a)
    assert a.dtype == f32, a.dtype
    return np.ascontiguousarray(a).astype("<f4").tobytes().hex()


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def ident(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return a.shape == b.shape and a.dtype == b.dtype and a.tobytes() == b.tobytes()


# ------------------------------------------------------------------ inputs
def upscale_to(art, H, W):
    """Nearest-neighbour upscale of a small (h, w, c) array to exactly H x W."""
    h, w = art.shape[:2]
    ys = np.minimum((np.arange(H) * h / H).astype(int), h - 1)
    xs = np.minimum((np.arange(W) * w / W).astype(int), w - 1)
    return np.ascontiguousarray(art[ys][:, xs])


def synth(name):
    rng = np.random.default_rng({"synth_alpha": 1, "synth_gray": 2, "synth_sgemv": 3,
                                 "synth_tiny_rect": 4, "synth_2color": 5, "synth_hbands": 6}[name])
    pal = rng.integers(0, 256, (7, 3))
    if name == "synth_alpha":
        # sprite on a transparent ground with a half-alpha rim: alpha.std() > 2,
        # so _pca_channels appends the alpha channel (C = 3)
        art = pal[rng.integers(0, 7, (24, 30))]
        a = np.full((24, 30), 255)
        a[:4, :] = 0; a[:, :5] = 0; a[4, 5:] = 128; a[4:, 5] = 128
        img = np.dstack([art, a]).astype(np.uint8)
        return upscale_to(img, 132, 165)
    if name == "synth_gray":
        # R == G == B: the covariance is c * ones(3, 3) and its null-space
        # eigenvectors are chosen by rounding noise
        g = rng.integers(0, 256, (32, 40))
        img = np.dstack([g, g, g, np.full_like(g, 255)]).astype(np.uint8)
        return upscale_to(img, 150, 188)
    if name == "synth_sgemv":
        # 481 x 545 = 262145 px: _quantize's last 262144-row block has ONE
        # row, which numpy sends to sgemv instead of sgemm
        art = pal[rng.integers(0, 7, (79, 88))]
        img = np.dstack([art, np.full((79, 88), 255)]).astype(np.uint8)
        return upscale_to(img, 481, 545)
    if name == "synth_tiny_rect":
        # H < 48 (one row block), W < 96 (no column segments), 3 colours
        art = pal[:3][rng.integers(0, 3, (5, 20))]
        img = np.dstack([art, np.full((5, 20), 255)]).astype(np.uint8)
        return upscale_to(img, 20, 90)
    if name == "synth_2color":
        # two colours: np.unique finds 2 rows, so k = 2
        cb = (np.arange(16)[:, None] + np.arange(16)[None, :]) % 2
        art = np.where(cb[..., None] == 1, pal[0], pal[1])
        img = np.dstack([art, np.full((16, 16), 255)]).astype(np.uint8)
        return upscale_to(img, 64, 64)
    if name == "synth_hbands":
        # rows of colour every 7 px and nothing along x: the x axis has no
        # signal at all, every x score is rounding noise
        rows = pal[rng.integers(0, 7, 43)]
        img = np.repeat(rows[:, None, :], 400, axis=1)
        img = np.dstack([img, np.full(img.shape[:2], 255)]).astype(np.uint8)
        return upscale_to(img, 300, 400)
    raise KeyError(name)


def load(name):
    if name in REAL:
        meta = json.load(open(os.path.join(RAW, "meta.json")))[name]
        return np.fromfile(os.path.join(RAW, name + ".rgba"), np.uint8).reshape(meta["h"], meta["w"], 4)
    img = synth(name)
    img.tofile(os.path.join(OUT, name + ".rgba"))
    return img


# ---------------------------------------------------------------- diag copies
def prep_diag(rgba):
    """reconsearch.py lines 88-92, 51-69 and 72-85, COPIED, keeping every
    intermediate. Used to locate a mismatch; certified against R._prep."""
    a = rgba[..., 3].astype(np.float32)
    rgb = rgba[..., :3].astype(np.float32) * (a[..., None] / 255.0)
    h, w, _ = rgb.shape
    flat = rgb.reshape(-1, 3)
    n = flat.shape[0]
    rng = np.random.default_rng(0)
    cv2.setRNGSeed(12345 + 0)
    idx = rng.choice(n, min(48000, n), replace=False)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 25, 0.25)
    count = len(np.unique(np.round(flat[idx][::7] / 8), axis=0))
    k = min(R.KMEANS_K, max(2, count))
    _, _, centers = cv2.kmeans(flat[idx].astype(np.float32), k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    out = np.empty((n,), np.int32)
    c2 = (centers ** 2).sum(1)
    for i in range(0, n, 262144):
        blk = flat[i:i + 262144]
        out[i:i + 262144] = np.argmax(2.0 * (blk @ centers.T) - c2[None, :], 1)
    q = centers[out].reshape(h, w, 3)
    fl = q.reshape(-1, 3)
    mu = fl.mean(0)
    x = fl - mu
    cov = (x.T @ x) / max(x.shape[0], 1)
    evals, evecs = np.linalg.eigh(cov)
    order = np.argsort(evals)[::-1][:2]
    return dict(rgb=rgb, idx=idx, count=count, k=k, centers=centers, labels=out, q=q,
                mu=mu, cov=cov, evals=evals, evecs=evecs, order=order,
                alpha_std=float(a.std()))


# ------------------------------------------------------------ call recorders
class Recorder:
    """Wraps reconsearch's functions so every call is recorded with its
    inputs and outputs. The wrappers call the originals and return their
    results unchanged; nothing about the computation is touched."""

    def __init__(self):
        self.axis_of = {}                  # id(AxisData) -> 0 | 1
        self.local = threading.local()
        self.lock = threading.Lock()
        self.clear()
        self.orig = {}

    def clear(self):
        self.eval_s = {0: [], 1: []}
        self.trend = {0: [], 1: []}
        self.score = []
        self.refine = {0: [], 1: []}
        self.build_table = {}
        self.peaks = {0: [], 1: []}
        self.regress = {0: [], 1: []}
        self.align = {0: [], 1: []}
        self.detect_axis = {}
        self.etm = {0: [], 1: []}          # energy_tiles_multi samples

    def install(self):
        rec = self
        o = self.orig
        o["init"] = R.AxisData.__init__
        o["eval_s"] = R.AxisData.eval_s
        o["etm"] = R.AxisData.energy_tiles_multi
        o["regress"] = R.AxisData.phase_regress
        o["coarse"] = R._coarse_curves
        o["trend_fn"] = R._trend_fn
        o["score"] = R._score
        o["refine"] = R._refine
        o["build_table"] = R._build_table
        o["peaks"] = R._peaks
        o["align"] = R._align
        o["detect_axis"] = R._detect_axis

        def init(self_, ch, axis):
            o["init"](self_, ch, axis)
            rec.axis_of[id(self_)] = axis

        def eval_s(self_, s, dense=False, nbc=1):
            r = o["eval_s"](self_, s, dense=dense, nbc=nbc)
            with rec.lock:
                rec.eval_s[rec.axis_of[id(self_)]].append((float(s), bool(dense), int(nbc), float(r[0]), float(r[1])))
            return r

        def etm(self_, s, phases, nbc):
            r = o["etm"](self_, s, phases, nbc)
            ax = rec.axis_of[id(self_)]
            with rec.lock:
                kinds = [e for e in rec.etm[ax] if (e["nbc"] > 1) == (nbc > 1)]
                if len(kinds) < 3:
                    rec.etm[ax].append({"s": hx64([s]), "phases": hx64(phases), "nbc": int(nbc),
                                        "shape": list(r.shape), "out": hx64(r)})
            return r

        def regress(self_, s0, n_iter=2):
            r = o["regress"](self_, s0, n_iter)
            with rec.lock:
                rec.regress[rec.axis_of[id(self_)]].append((float(s0), float(r), type(r).__name__))
            return r

        def coarse(ad, s_list):
            rec.local.ad = ad
            return o["coarse"](ad, s_list)

        def trend_fn(s_list, eb):
            fn = o["trend_fn"](s_list, eb)
            ax = rec.axis_of[id(rec.local.ad)]

            def g(s):
                v = fn(s)
                with rec.lock:   # np.log(s) too: lets the test attribute a 1-ulp trend miss to the log
                    rec.trend[ax].append((float(s), float(v), float(np.log(s))))
                return v
            g.inner = fn
            return g

        def score(eb, er, t):
            r = o["score"](eb, er, t)
            with rec.lock:
                if len(rec.score) < 4000:
                    rec.score.append((float(eb), float(er), float(t), float(r)))
            return r

        def refine(ad, s0, smax, trend, span=0.035, seg=False):
            r = o["refine"](ad, s0, smax, trend, span, seg)
            with rec.lock:
                rec.refine[rec.axis_of[id(ad)]].append(
                    {"in": [float(s0), float(smax), float(span), bool(seg)], "out": [float(v) for v in r],
                     "s_type": type(r[1]).__name__})
            return r

        def build_table(ad, size):
            table, trend = o["build_table"](ad, size)
            ax = rec.axis_of[id(ad)]
            rec.build_table[ax] = [{"key": float(k), "key_type": type(k).__name__,
                                    "val": [float(v) for v in table[k]]} for k in table]
            return table, trend

        def peaks(s_list, sc, k=6):
            r = o["peaks"](s_list, sc, k)
            rec.peaks[rec.axis_of[id(rec.local.ad)]].append([float(v) for v in r])
            return r

        def align(ad, s, smax):
            r = o["align"](ad, s, smax)
            with rec.lock:
                rec.align[rec.axis_of[id(ad)]].append({"in": [float(s), float(smax), type(s).__name__],
                                                       "out": [float(r[0]), float(r[1])]})
            return r

        def detect_axis(ad, size):
            r = o["detect_axis"](ad, size)
            s_ax, sc_ax, eb_ax, cands, trend = r
            rec.detect_axis[rec.axis_of[id(ad)]] = {"s_ax": float(s_ax), "sc_ax": float(sc_ax),
                                                    "eb_ax": float(eb_ax),
                                                    "cands": [[float(a), float(b)] for a, b in cands]}
            return r

        R.AxisData.__init__ = init
        R.AxisData.eval_s = eval_s
        R.AxisData.energy_tiles_multi = etm
        R.AxisData.phase_regress = regress
        R._coarse_curves = coarse
        R._trend_fn = trend_fn
        R._score = score
        R._refine = refine
        R._build_table = build_table
        R._peaks = peaks
        R._align = align
        R._detect_axis = detect_axis

    def dump(self):
        def calls(lst):
            if not lst:
                return None
            a = np.array([c[:1] + c[3:] for c in lst], f64)       # s, eb, er
            return {"n": len(lst), "s_eb_er": hx64(a), "dense": [c[1] for c in lst], "nbc": [c[2] for c in lst]}

        def pairs(lst):
            return {"n": len(lst), "s_v_log": hx64(np.array(lst, f64))} if lst else None
        return {
            "eval_s": {str(a): calls(self.eval_s[a]) for a in (0, 1)},
            "trend": {str(a): pairs(self.trend[a]) for a in (0, 1)},
            "score": {"n": len(self.score), "rows": hx64(np.array(self.score, f64))} if self.score else None,
            "refine": {str(a): self.refine[a] for a in (0, 1)},
            "build_table": {str(a): self.build_table.get(a) for a in (0, 1)},
            "peaks": {str(a): self.peaks[a] for a in (0, 1)},
            "regress": {str(a): self.regress[a] for a in (0, 1)},
            "align": {str(a): self.align[a] for a in (0, 1)},
            "detect_axis": {str(a): self.detect_axis.get(a) for a in (0, 1)},
            "etm": {str(a): self.etm[a] for a in (0, 1)},
        }


# ------------------------------------------------------------------ one case
def axis_record(ad):
    step = 1009
    return {
        "H": ad.H, "W": ad.W, "C": ad.C, "nbr": ad.nbr, "r_edges": ad.r_edges.tolist(),
        "max_nbc": ad.max_nbc,
        "S_sha": sha(ad.S), "Q_sha": sha(ad.Q), "S_dtype": str(ad.S.dtype),
        "sample_step": step,
        "S_sample": hx32(ad.S.reshape(-1)[::step]), "Q_sample": hx32(ad.Q.reshape(-1)[::step]),
        "seg": {str(k): {"c_edges": v[0].tolist(), "q_t": hx64(v[1]), "shape": list(v[1].shape)}
                for k, v in ad.seg.items()},
        "t_sum": hx64([ad.t_sum]),
    }


def one(name):
    os.makedirs(OUT, exist_ok=True)
    rgba = load(name)
    H, W = rgba.shape[:2]
    rec = {"case": name, "h": H, "w": W, "rgba_sha": sha(rgba)}
    t0 = time.time()

    # ---- _prep: diag copy, then the reference itself
    d = prep_diag(rgba)
    q_ref = R._quantize(d["rgb"])
    assert ident(q_ref, d["q"]), "diag copy of _quantize does not reproduce the reference"
    ch = R._prep(rgba)
    ch_diag = R._pca_channels(d["q"], rgba[..., 3].astype(np.float32))
    assert ident(ch, ch_diag), "diag path does not reproduce R._prep"
    assert ch.dtype == f32 and ch.flags.c_contiguous
    ch.astype("<f4").tofile(os.path.join(OUT, name + ".ch.f32"))
    d["labels"].astype(np.uint8).tofile(os.path.join(OUT, name + ".labels.u8"))
    rec["ch"] = {"shape": list(ch.shape), "sha": sha(ch)}
    rec["quantize"] = {"n_idx": int(d["idx"].size), "idx_sha": sha(d["idx"].astype("<i8")),
                       "idx_head": d["idx"][:64].tolist(), "count": int(d["count"]), "k": int(d["k"]),
                       "centers": hx32(d["centers"]), "labels_sha": sha(d["labels"].astype(np.uint8)),
                       "rgb_sha": sha(d["rgb"]), "q_sha": sha(d["q"])}
    rec["pca"] = {"mu": hx32(d["mu"]), "cov": hx32(d["cov"]), "evals": hx32(d["evals"]),
                  "evecs": hx32(d["evecs"]), "order": d["order"].tolist(), "alpha_std": d["alpha_std"]}

    # ---- AxisData
    ads = {a: R.AxisData(ch, a) for a in (0, 1)}
    rec["axis"] = {str(a): axis_record(ads[a]) for a in (0, 1)}

    # ---- core.py _build_recon, replayed line for line (core.py:152-160)
    rec["core_build"] = {}
    for a, extent in ((0, W), (1, H)):
        s_list = R._s_grid(extent)[::3]
        eb, er = R._coarse_curves(ads[a], s_list)
        fn = R._trend_fn(s_list, eb)
        cells = dict(zip(fn.__code__.co_freevars, (c.cell_contents for c in fn.__closure__)))
        rec["core_build"][str(a)] = {"s_list": hx64(s_list), "eb": hx64(eb), "er": hx64(er),
                                     "ls": hx64(cells["ls"]), "trend": hx64(cells["trend"])}
    rec["s_grid"] = {"W": hx64(R._s_grid(W)), "H": hx64(R._s_grid(H))}

    recd = Recorder()
    recd.install()

    # ---- core.detect(mode="full"): every call it makes into this module
    from pixelfixer import core
    t1 = time.time()
    cres = core.detect(rgba, mode="full")
    rec["core"] = {"consensus": cres["consensus"], "cols": int(cres["cols"]), "rows": int(cres["rows"]),
                   "seconds": round(time.time() - t1, 2), "calls": recd.dump()}

    # ---- R.detect: every internal call, and the answer
    recd.clear()
    t1 = time.time()
    res = R.detect(rgba)
    rec["detect"] = {
        "seconds": round(time.time() - t1, 2),
        "result": {"step_x": hx64([res["step_x"]]), "step_y": hx64([res["step_y"]]),
                   "cols": int(res["cols"]), "rows": int(res["rows"]),
                   "phase_x": hx64([res["phase_x"]]), "phase_y": hx64([res["phase_y"]]),
                   "conf_x": hx64([res["conf_x"]]), "conf_y": hx64([res["conf_y"]]),
                   "candidates": hx64(np.array(res["candidates"], f64))},
        "readable": {k: (v if not isinstance(v, float) else round(v, 6)) for k, v in res.items() if k != "candidates"},
        "calls": recd.dump(),
    }

    # ---- after everything else in this process drew from every generator
    rec["prep_repeat_identical"] = ident(R._prep(rgba), ch)
    rec["seconds"] = round(time.time() - t0, 2)
    with open(os.path.join(OUT, name + ".json"), "w") as fh:
        json.dump(rec, fh)
    print(f"{name:16s} {W}x{H} C={ch.shape[2]} k={d['k']} core={rec['core']['consensus']:22s} "
          f"detect={res['cols']}x{res['rows']} step=({res['step_x']:.4f},{res['step_y']:.4f}) "
          f"repeat_identical={rec['prep_repeat_identical']} {rec['seconds']}s")


# ------------------------------------------------------- semantics probes
def probes():
    import math
    from decimal import Decimal, getcontext
    getcontext().prec = 60
    rng = np.random.default_rng(20260927)
    x = np.concatenate([rng.uniform(1.2, 30, 20000), 1.6 * 1.025 ** np.arange(111),
                        rng.uniform(0.001, 1e6, 5000), [1.025, 15.0, 1.5625, 2.0, 1.0]])
    lg = np.log(x)
    cr = np.array([float(Decimal(v).ln()) for v in x.tolist()])
    out = {"log": {"x": hx64(x), "np": hx64(lg), "cr": hx64(cr),
                   "np_vs_ucrt_math_log_diffs": int((lg != np.array([math.log(v) for v in x.tolist()])).sum()),
                   "np_scalar_vs_array_diffs": int((lg != np.array([np.log(np.float64(v)) for v in x.tolist()])).sum()),
                   "np_not_correctly_rounded": int((lg != cr).sum())}}
    out["pow"] = {"np": hx64(1.025 ** np.arange(111))}
    v = np.concatenate([rng.uniform(1.2, 30, 20000), np.arange(1, 3001) / 200.0 + 0.005,
                        np.arange(1, 3001) / 20000.0 + 1.00005])
    out["round"] = {"x": hx64(v), "np2": hx64([round(np.float64(t), 2) for t in v]),
                    "np4": hx64([round(np.float64(t), 4) for t in v]),
                    "py4": hx64([round(float(t), 4) for t in v])}
    Wv = rng.integers(16, 1500, 4000).astype(f64)
    sv = rng.uniform(1.2, 30, 4000)
    xs = 15.0 * sv
    fd = np.array([int(w) // np.float64(xx) for w, xx in zip(Wv.tolist(), xs.tolist())])
    a = rng.uniform(-40, 40, 4000)
    b = rng.uniform(1.2, 30, 4000)
    md = np.array([np.float64(p) % float(q) for p, q in zip(a.tolist(), b.tolist())])
    out["floordiv"] = {"a": hx64(Wv), "b": hx64(xs), "q": hx64(fd)}
    out["mod"] = {"a": hx64(a), "b": hx64(b), "r": hx64(md)}
    pats = []
    for i in range(3):
        for j in range(3):
            for k in range(3):
                lv = np.sort(rng.normal(size=3)).astype(f32)
                arr = np.array([lv[i], lv[j], lv[k]], f32)
                pats.append({"v": hx32(arr), "np": np.argsort(arr).tolist()})
    for arr in ([-0.0, 0.0, 1.0], [0.0, -0.0, 1.0], [1.0, 0.0, -0.0], [1.0, -0.0, 0.0], [0.0, -0.0, -1.0]):
        a3 = np.array(arr, f32)
        pats.append({"v": hx32(a3), "np": np.argsort(a3).tolist()})
    out["argsort3"] = pats
    # iteration order of {round(s_ax, 4), round(s_reg, 4)}: np.float64 first
    sa, sb, order = [], [], []
    for _ in range(3000):
        a = float(np.round(np.float64(rng.uniform(1.2, 30)), 4))
        b = round(a * float(rng.uniform(0.97, 1.03)), 4)
        sa.append(a); sb.append(b)
        order.append([float(v) for v in {np.float64(a), b}])
    out["set2"] = {"a": hx64(sa), "b": hx64(sb), "order": order}

    # OpenCV's generator is thread-local (documentation for the JS opts.rng)
    def draw():
        z = np.zeros(4, f64)
        cv2.randu(z, 0, 1)
        return z
    cv2.setRNGSeed(5); a1 = draw()
    cv2.setRNGSeed(5)
    t = threading.Thread(target=lambda: cv2.setRNGSeed(999)); t.start(); t.join()
    a2 = draw()
    rgba = synth("synth_2color")
    cv2.setRNGSeed(77); b1 = draw()
    cv2.setRNGSeed(77); R._prep(rgba); b2 = draw()
    cv2.setRNGSeed(77)
    t = threading.Thread(target=lambda: R._prep(rgba)); t.start(); t.join()
    b3 = draw()
    out["cv2_rng"] = {"seed_on_worker_leaves_main": bool((a1 == a2).all()),
                      "prep_on_same_thread_moves_it": bool(not (b1 == b2).all()),
                      "prep_on_worker_leaves_main": bool((b1 == b3).all())}
    return out


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--one":
        one(sys.argv[2])
        return
    os.makedirs(OUT, exist_ok=True)
    ref_file = os.path.normcase(os.path.abspath(pixelfixer.__file__))
    assert ref_file.startswith(os.path.normcase(REF)), f"pixelfixer resolves to {ref_file}, not {REF}"
    names = sys.argv[1:] or (REAL + SYNTH)
    meta = {"numpy": np.__version__, "cv2": cv2.__version__, "python": sys.version.split()[0],
            "pixelfixer": ref_file, "cases": names}
    meta["probes"] = probes()
    print("probes:", {k: v for k, v in meta["probes"]["log"].items() if not isinstance(v, str)},
          meta["probes"]["cv2_rng"])
    bad = 0
    for n in names:
        r = subprocess.run([sys.executable, __file__, "--one", n], capture_output=True, text=True)
        sys.stdout.write(r.stdout)
        if r.returncode:
            bad += 1
            sys.stdout.write(r.stderr)
    with open(os.path.join(FIX, "reconsearch-parity.json"), "w") as fh:
        json.dump(meta, fh)
    print("wrote", os.path.join(FIX, "reconsearch-parity.json"), "and", OUT, "-", bad, "case(s) failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
