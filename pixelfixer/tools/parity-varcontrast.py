"""Ground-truth fixtures for src/pf-23-varcontrast.js -> fixtures/varcontrast-parity.json.

Runs the PRISTINE reference (pixelfixer.varcontrast, imported from the
reference venv) and dumps inputs and outputs. Floats are lowercase hex of
their raw little-endian float64 bytes so the JSON round trip cannot lose a
bit; image bytes are base64.

WHERE THE CASES COME FROM
  1. The reference's OWN call path, per real image, ONE IMAGE PER PROCESS:
     every CellVarContrast method is wrapped to record (arguments, result)
     while core.detect(rgba, mode="full"), fusion.detect(rgba) and
     channels.fit_grid(rgba) run - the three entry points that build the
     square packer - and z_of is wrapped to record every step the pipeline
     asks it about. The node test replays each recorded call with the same
     arguments. The arguments (candidate steps, pairs) can depend on
     OpenCV's unseeded global RNG upstream (k-means), which is why they are
     RECORDED from a fresh process per image rather than recomputed.
  2. Direct probes on the same images: internals of the constructor, the
     methods no pipeline path reaches (grid_variance, _sample_sat,
     VarContrast), half-integer steps (np.rint ties), non-square pairs,
     early-return arguments, a non-default max_points/tile_px instance that
     forces the subsampling branch.
  3. Synthetic images for the branches real art does not take: flat
     (total_var 0), 5 px tall (block-size fallback), RGB without alpha,
     semi-transparent alpha, noise.

RNG INDEPENDENCE is measured, not asserted: after the three entry points
have run (and cv2.kmeans has been called - counted), and after both global
generators are explicitly advanced, the scorer is rebuilt from the same
image and its curve and candidates must be bit-identical to the first build.

Sections tagged "diag_" are intermediates re-derived here from the
reference's own lines; they LOCATE a mismatch and never pass a case.

Run with the reference interpreter:
  <scratchpad>/pafenv2/Scripts/python.exe tools/parity-varcontrast.py
"""
import base64
import hashlib
import inspect
import json
import os
import platform
import subprocess
import sys
import time

import numpy as np
import cv2
import scipy
import pixelfixer
from pixelfixer import varcontrast as V

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
REF_PKG = os.path.dirname(os.path.abspath(pixelfixer.__file__))
EXAMPLES = os.path.join(os.path.dirname(os.path.dirname(REF_PKG)), "examples")
# the reference must be the pristine clone this job names, not a stale copy
assert REF_PKG.replace("\\", "/").endswith("paf-ref/python/pixelfixer"), REF_PKG
assert os.path.isdir(EXAMPLES), EXAMPLES

REAL = [("tiny", os.path.join(FIX, "tiny.png")),
        ("small", os.path.join(FIX, "small.png")),
        ("mid", os.path.join(FIX, "mid.png")),
        ("dragon", os.path.join(EXAMPLES, "dragon.png")),
        ("frog", os.path.join(EXAMPLES, "frog.png")),
        ("koi-pond", os.path.join(EXAMPLES, "koi-pond.png")),
        ("lighthouse", os.path.join(EXAMPLES, "lighthouse.png"))]


# ------------------------------------------------------------------ encoding
def hx(x):
    return np.asarray([x], np.float64).tobytes().hex()


def hxa(a):
    return np.ascontiguousarray(np.asarray(a, np.float64)).tobytes().hex()


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def enc_arg(v):
    if v is None:
        return None
    if isinstance(v, (bool, np.bool_)):
        raise TypeError("bool argument")
    if isinstance(v, (int, np.integer)):
        return {"i": int(v)}
    if isinstance(v, (float, np.floating)):
        return hx(float(v))
    if isinstance(v, (list, tuple)):
        return [enc_arg(x) for x in v]
    raise TypeError("cannot encode %r" % type(v))


def enc_out(name, out):
    if name in ("contrast", "contrast_local"):
        return [hx(out[0]), hx(out[1]), hx(out[2])]
    if name in ("grid_variance", "pair_q"):
        return hx(out)
    if name == "best_pair":
        return [[hx(a), hx(b), hx(c)] for a, b, c in out]
    if name == "refine":
        return [hx(out[0]), hx(out[1])]
    if name == "scored_curve":
        return [hxa(out[0]), hxa(out[1]), hxa(out[2])]
    if name == "z_channel":
        return [[hx(s), hx(z)] for s, z in out[1]]
    # VarContrast
    if name == "ax_contrast":
        return [hx(out[0]), hx(out[1])]
    if name == "ax_curve":
        return hxa(out)
    if name == "ax_refine":
        return [hx(out[0]), hx(out[1]), hx(out[2])]
    if name == "ax_candidates":
        return [[hx(a), hx(b), hx(c)] for a, b, c in out]
    raise KeyError(name)


# ----------------------------------------------------------------- recording
CELL_METHODS = ("contrast", "contrast_local", "grid_variance", "pair_q",
                "best_pair", "scored_curve", "refine", "z_channel")
AX_METHODS = ("contrast", "curve", "refine", "candidates")
STATE = {"source": "?", "rec": {}, "dups": 0, "dup_mismatch": [], "zq": {},
         "inst": [], "kmeans_calls": 0}


def _record(label, name, args, out_enc):
    book = STATE["rec"].setdefault(label, {})
    key = json.dumps([name, args])
    src = STATE["source"]
    if key in book:
        STATE["dups"] += 1
        if book[key]["out"] != out_enc:
            STATE["dup_mismatch"].append([label, name, src])
        if src not in book[key]["src"]:
            book[key]["src"].append(src)
        return
    book[key] = {"m": name, "args": args, "out": out_enc, "src": [src]}


def install_recorders():
    orig_init = V.CellVarContrast.__init__
    init_sig = inspect.signature(orig_init)

    def init(self, *a, **k):
        b = init_sig.bind(self, *a, **k)
        b.apply_defaults()
        orig_init(self, *a, **k)
        mp, tp = b.arguments["max_points"], b.arguments["tile_px"]
        self._pf_label = "cell_mp%d_t%d" % (mp, tp)
        STATE["inst"].append({"label": self._pf_label, "source": STATE["source"],
                              "SC_sha256": sha(self.SC), "px_sha256": sha(self.px),
                              "py_sha256": sha(self.py), "tile_sha256": sha(self.tile_id.astype(np.int64))})
    V.CellVarContrast.__init__ = init

    for name in CELL_METHODS:
        f = getattr(V.CellVarContrast, name)
        sig = inspect.signature(f)

        def mk(f, name, sig):
            params = list(sig.parameters)[1:]

            def g(self, *a, **k):
                b = sig.bind(self, *a, **k)
                b.apply_defaults()
                args = [enc_arg(b.arguments[p]) for p in params]
                out = f(self, *a, **k)
                _record(self._pf_label, name, args, enc_out(name, out))
                if name == "z_channel":
                    z_of, cands = out
                    # a query belongs to the curve that answered it: key the
                    # book by the instance AND the z_channel arguments
                    label = self._pf_label + "|" + json.dumps(args)

                    def z_rec(step, _z=z_of, _label=label, _zargs=args):
                        r = _z(step)
                        book = STATE["zq"].setdefault(_label, {})
                        kk = hx(float(step))
                        ent = book.setdefault(kk, {"step": kk, "zargs": _zargs, "out": hx(r), "src": []})
                        if ent["out"] != hx(r):
                            STATE["dup_mismatch"].append([_label, "z_of", STATE["source"]])
                        if STATE["source"] not in ent["src"]:
                            ent["src"].append(STATE["source"])
                        return r
                    return z_rec, cands
                return out
            return g
        setattr(V.CellVarContrast, name, mk(f, name, sig))

    for name in AX_METHODS:
        f = getattr(V.VarContrast, name)
        sig = inspect.signature(f)

        def mk2(f, name, sig):
            params = list(sig.parameters)[1:]

            def g(self, *a, **k):
                b = sig.bind(self, *a, **k)
                b.apply_defaults()
                args = []
                for p in params:
                    v = b.arguments[p]
                    args.append(hxa(v) if isinstance(v, np.ndarray) else enc_arg(v))
                out = f(self, *a, **k)
                _record("axis", "ax_" + name, args, enc_out("ax_" + name, out))
                return out
            return g
        setattr(V.VarContrast, name, mk2(f, name, sig))

    real_kmeans = cv2.kmeans

    def kmeans(*a, **k):
        STATE["kmeans_calls"] += 1
        return real_kmeans(*a, **k)
    cv2.kmeans = kmeans


# --------------------------------------------------------------- diag helpers
def diag_bvar(vc):
    """CellVarContrast.__init__ activity-map lines, copied."""
    h, w = vc.H, vc.W
    bs = 8
    by = np.arange(0, h - bs + 1, bs)
    bx = np.arange(0, w - bs + 1, bs)
    if len(by) == 0 or len(bx) == 0:
        by = np.array([0]); bx = np.array([0]); bs = min(h, w)
    s1 = vc._rect_sum(vc.S1, by, bx, bs)
    s2 = vc._rect_sum(vc.S2, by, bx, bs)
    area = float(bs * bs)
    bvar = s2 / area - ((s1 / area) ** 2).sum(axis=-1)
    thresh = max(1e-6, 0.02 * vc.total_var)
    return {"bvar": hxa(bvar), "shape": list(bvar.shape), "thresh": hx(thresh),
            "n_active": int((bvar > thresh).sum())}


def cell_internals(vc, full_sc):
    d = {"H": vc.H, "W": vc.W, "C": vc.C, "total_var": hx(vc.total_var),
         "active_var": hx(vc.active_var), "n_tiles": int(vc.n_tiles),
         "npts": int(len(vc.px)), "px": hxa(vc.px), "py": hxa(vc.py),
         "tile_id": [int(t) for t in vc.tile_id], "SC_sha256": sha(vc.SC),
         "diag_bvar": diag_bvar(vc)}
    if full_sc:
        d["SC"] = hxa(vc.SC)
    else:
        h = vc.H
        d["diag_SC_rows"] = {str(y): hxa(vc.SC[y]) for y in (1, h // 2, h)}
    return d


def axis_internals(ax):
    return {"W": ax.W, "H": ax.H, "cx": int(ax.cx), "cy": int(ax.cy),
            "total_x": hx(ax.total_x), "total_y": hx(ax.total_y),
            "S1x": hxa(ax.S1x), "S2x": hxa(ax.S2x), "S1y": hxa(ax.S1y), "S2y": hxa(ax.S2y),
            "S1_C": int(ax.S1x.shape[1])}


# ------------------------------------------------------------- direct probes
def probe_cell(vc, rng, full_cells):
    """Direct calls on one instance. Every call goes through the recorders,
    so its arguments and result land in the fixture."""
    W, H = vc.W, vc.H
    STATE["source"] = "direct"
    z_of, cands = vc.z_channel()
    steps, z, cs = vc.scored_curve()
    # z_of: every knot, every midpoint, random steps in range, the ends,
    # and points just outside
    q = list(steps) + list((steps[1:] + steps[:-1]) / 2)
    if len(steps):
        q += list(rng.uniform(steps[0], steps[-1], 150))
        q += [steps[0], steps[-1], np.nextafter(steps[0], 0), np.nextafter(steps[-1], 100),
              steps[0] - 0.5, steps[-1] + 3.0]
    for s in q:
        z_of(float(s))
    STATE["source"] = "extra"
    base = [c[0] for c in cands[:3]] or [4.0]
    sq = base + [2.5, 3.5, 4.0, 5.0, 7.5, 1.4, W / 3 + 0.5]
    for s in sq:
        vc.contrast(s, n_phases=12)
        vc.contrast(s)
        vc.contrast_local(s, n_phases=4)
    for sx, sy in [(base[0], base[0] * 1.1), (3.0, 4.5), (2.5, 3.5), (6.25, 5.0),
                   (base[0] * 0.84, base[0] * 1.19), (2.0, H / 3 + 1.0)]:
        vc.contrast(sx, sy)
        vc.contrast(sx, sy, 5)
        vc.contrast_local(sx, sy, 3)
        vc.pair_q(sx, sy)
    for sx, sy, fx, fy in [(base[0], base[0], 0.0, 0.0), (base[0], base[0], base[0] / 3, base[0] / 2),
                           (2.5, 3.5, 1.25, 0.75), (4.0, 4.0, 2.0, 2.0), (5.0, 3.0, 4.999, 0.001)]:
        vc.grid_variance(sx, sy, fx, fy)
    a = round(base[0], 3)
    vc.best_pair([(a, a), (round(2 * a, 3), round(2 * a, 3)), (a, round(1.5 * a, 3)), (2.5, 2.5), (a, a)])
    vc.best_pair([(3.0, 3.0), (3.0, 3.0), (7.0, 7.0)], n_phases=3)
    for s0 in base:
        vc.refine(s0)
        vc.refine(s0, span_ratio=0.2, n_phases=3)
    vc.refine(2.0)
    vc.scored_curve(min_step=3.0, max_step=20.0)
    zz, _c = vc.z_channel(min_step=2.5)
    zz(5.0)
    zz(2.4)
    # _cells_variance / _rect_sum / _sample_sat: no recorder, dumped whole
    cv = []
    for sx, sy, fx, fy in [(base[0], base[0], 0.0, 0.0), (2.5, 2.5, 0.0, 0.0), (3.5, 4.5, 1.75, 0.5)][:full_cells]:
        cv.append({"args": [hx(sx), hx(sy), hx(fx), hx(fy)],
                   "out": hxa(vc._cells_variance(sx, sy, fx, fy))})
    ys = rng.integers(0, max(1, H - 8), 20)
    xs = rng.integers(0, max(1, W - 8), 17)
    size = int(min(8, H, W))
    rs = {"ys": [int(v) for v in ys], "xs": [int(v) for v in xs], "size": size,
          "S1": hxa(vc._rect_sum(vc.S1, ys, xs, size)), "S2": hxa(vc._rect_sum(vc.S2, ys, xs, size))}
    pos_y = np.concatenate([rng.uniform(-3, H + 3, 60), [0.0, H, H + 0.5, -0.0, 2.5]])
    pos_x = np.concatenate([rng.uniform(-3, W + 3, 60), [0.0, W, 1.5, W - 0.25, -1.0]])
    ss = {"pos_y": hxa(pos_y), "pos_x": hxa(pos_x),
          "S1": hxa(vc._sample_sat(vc.S1, pos_y, pos_x)), "S2": hxa(vc._sample_sat(vc.S2, pos_y, pos_x))}
    return {"cells_variance": cv, "rect_sum": rs, "sample_sat": ss}


def probe_axis(rgba, rng):
    STATE["source"] = "axis"
    ax = V.VarContrast(rgba)
    out = {"internals": axis_internals(ax)}
    for axis in (0, 1):
        ax.candidates(axis)
    L = ax.W
    for s in (2.5, 3.0, 4.7, 8.0):
        ax.contrast(0, s)
        ax.contrast(1, s, 12)
    ax.refine(0, 5.0)
    ax.candidates(1, min_step=3.0, max_step=12.0, top=3)
    gc = []
    for step in (2.0, 2.5, 10.0 / 3.0, 4.7, 7.0, 13.9):
        for phase in (0.0, step / 3, step * 5 / 6, 1e-10, step, 2 * step + 0.3):
            cuts = V._grid_cuts(L, step, phase)
            gc.append({"L": int(L), "step": hx(step), "phase": hx(phase), "cuts": hxa(cuts),
                       "var_x": hx(V._strip_variance(ax.S1x, ax.S2x, ax.cx, cuts))})
    odd = np.array([-1.5, 0.0, 3.25, 3.25, 7.0, L + 2.0])
    gc.append({"L": int(L), "cuts_direct": hxa(odd),
               "var_x": hx(V._strip_variance(ax.S1x, ax.S2x, ax.cx, odd))})
    one = np.array([2.0])
    gc.append({"L": int(L), "cuts_direct": hxa(one),
               "var_x": hx(V._strip_variance(ax.S1x, ax.S2x, ax.cx, one))})
    out["grid_cuts"] = gc
    return out


# --------------------------------------------------------------- one image
def run_real(name, path, out_path):
    from pixelfixer import api, core, fusion, channels
    install_recorders()
    t0 = time.time()
    with open(path, "rb") as fh:
        rgba = api._load(fh.read())            # exactly what api.process sees
    h, w = rgba.shape[:2]
    rng = np.random.default_rng(20260927)
    case = {"name": name, "w": int(w), "h": int(h), "cn": int(rgba.shape[2]),
            "rgba_b64": base64.b64encode(np.ascontiguousarray(rgba).tobytes()).decode("ascii"),
            "rgba_sha256": sha(rgba)}
    # 1. the scorer the pipeline builds, built first and dumped
    STATE["source"] = "direct"
    vc = V.CellVarContrast(rgba)
    case["cell"] = cell_internals(vc, full_sc=(h * w <= 250000))
    case["cell_probe"] = probe_cell(vc, rng, full_cells=3)
    # 2. the reference's own call paths
    entry = {}
    for label, fn in (("core", lambda: core.detect(rgba, mode="full")),
                      ("fusion", lambda: fusion.detect(rgba)),
                      ("fit_grid", lambda: channels.fit_grid(rgba))):
        STATE["source"] = label
        t1 = time.time()
        try:
            r = fn()
            if isinstance(r, dict):
                entry[label] = {k: (v if isinstance(v, (str, int, float)) else str(v))
                                for k, v in r.items() if k in ("cols", "rows", "consensus", "step_x", "step_y")}
            else:
                entry[label] = {"type": type(r).__name__}
        except Exception as e:           # recorded, never swallowed silently
            entry[label] = {"error": repr(e)}
        entry[label]["secs"] = round(time.time() - t1, 2)
    case["entry"] = entry
    case["kmeans_calls_during_entry"] = STATE["kmeans_calls"]
    # 3. RNG independence: advance BOTH global generators, rebuild, compare
    dummy = np.zeros((4, 4), np.float32)
    cv2.randu(dummy, 0, 1)
    np.random.random(7)
    STATE["source"] = "rebuild"
    vc2 = V.CellVarContrast(rgba)
    s1, z1, c1 = vc.scored_curve()
    s2, z2, c2 = vc2.scored_curve()
    cand1 = vc.z_channel()[1]
    cand2 = vc2.z_channel()[1]
    case["rng_check"] = {
        "rebuilt_sc_equal": sha(vc.SC) == sha(vc2.SC),
        "rebuilt_curve_equal": bool(np.array_equal(z1, z2) and np.array_equal(c1, c2)),
        "rebuilt_cands_equal": [tuple(map(hx, c)) for c in cand1] == [tuple(map(hx, c)) for c in cand2],
        "kmeans_calls_before_rebuild": STATE["kmeans_calls"]}
    # 4. a non-default instance: forces the linspace subsample (npts > 300)
    STATE["source"] = "direct"
    vcs = V.CellVarContrast(rgba, max_points=300, tile_px=40)
    case["cell_mp300"] = cell_internals(vcs, full_sc=False)
    vcs.z_channel()
    vcs.contrast_local(4.0, 4.0, 4)
    vcs.pair_q(5.0, 5.0)
    # 5. VarContrast (no caller in the package)
    case["axis"] = probe_axis(rgba, rng)
    case["calls"] = {lab: list(book.values()) for lab, book in STATE["rec"].items()}
    case["zq"] = {lab: list(book.values()) for lab, book in STATE["zq"].items()}
    case["instances"] = STATE["inst"]
    case["dups"] = STATE["dups"]
    case["dup_mismatch"] = STATE["dup_mismatch"]
    case["secs"] = round(time.time() - t0, 2)
    with open(out_path, "w") as fh:
        json.dump(case, fh)


# --------------------------------------------------------------- synthetic
def upscale_nn(img, f):
    h, w = img.shape[:2]
    H, W = int(round(h * f)), int(round(w * f))
    ys = np.minimum((np.arange(H) / f).astype(int), h - 1)
    xs = np.minimum((np.arange(W) / f).astype(int), w - 1)
    return np.ascontiguousarray(img[ys][:, xs])


def synth_images():
    rng = np.random.default_rng(777)
    out = {}
    pal = rng.integers(0, 256, (6, 3))
    art = pal[rng.integers(0, 6, (9, 12))]
    rgba = np.dstack([art, np.full((9, 12), 255)]).astype(np.uint8)
    out["synth_grid5"] = upscale_nn(rgba, 5.0)
    out["synth_grid47"] = upscale_nn(rgba, 4.7)
    big = upscale_nn(rgba, 6.38)
    jit = big.copy()
    for r in range(jit.shape[0]):
        jit[r] = np.roll(big[r], int(rng.integers(-1, 2)), axis=0)
    out["synth_grid638_jitter"] = jit
    # semi-transparent: alpha varies per cell, premultiply matters
    a = rng.integers(0, 256, (9, 12))
    out["synth_alpha"] = upscale_nn(np.dstack([art, a]).astype(np.uint8), 4.0)
    out["synth_rgb3"] = upscale_nn(art.astype(np.uint8), 5.0)          # C = 3, no premultiply
    out["synth_flat"] = np.tile(np.array([100, 150, 200, 255], np.uint8), (40, 40, 1))
    out["synth_short5"] = rng.integers(0, 256, (5, 60, 4)).astype(np.uint8)   # h < 8: bs fallback
    out["synth_noise"] = rng.integers(0, 256, (64, 64, 4)).astype(np.uint8)
    art2 = pal[rng.integers(0, 6, (20, 24))]
    out["synth_big6"] = upscale_nn(np.dstack([art2, np.full((20, 24), 255)]).astype(np.uint8), 6.0)
    return out


def run_synth(name, rgba):
    STATE["rec"] = {}
    STATE["zq"] = {}
    STATE["inst"] = []
    rng = np.random.default_rng(99)
    h, w = rgba.shape[:2]
    case = {"name": name, "w": int(w), "h": int(h), "cn": int(rgba.shape[2]),
            "rgba_b64": base64.b64encode(np.ascontiguousarray(rgba).tobytes()).decode("ascii"),
            "rgba_sha256": sha(rgba), "entry": {}}
    STATE["source"] = "direct"
    try:
        vc = V.CellVarContrast(rgba)
    except Exception as e:
        case["cell_error"] = repr(e)
        vc = None
    if vc is not None:
        case["cell"] = cell_internals(vc, full_sc=True)
        case["cell_probe"] = probe_cell(vc, rng, full_cells=3)
        vcs = V.CellVarContrast(rgba, max_points=40, tile_px=16)
        case["cell_mp40"] = cell_internals(vcs, full_sc=False)
        STATE["source"] = "direct"
        vcs.z_channel()
        vcs.contrast_local(3.0, 4.0, 3)
    case["axis"] = probe_axis(rgba, rng)
    case["calls"] = {lab: list(book.values()) for lab, book in STATE["rec"].items()}
    case["zq"] = {lab: list(book.values()) for lab, book in STATE["zq"].items()}
    case["instances"] = STATE["inst"]
    return case


# ------------------------------------------------------------------ log table
def log_table():
    """np.log on (a) every knot any scored_curve can produce - the steps are
    a prefix of 2.0 * 1.04^k up to 64 - and (b) random steps. The knots are
    finite and fixed, so (a) is exhaustive for the default min_step."""
    steps, s = [], 2.0
    while s <= 64.0:
        steps.append(s)
        s *= 1.04
    rng = np.random.default_rng(4242)
    r = np.concatenate([rng.uniform(1.5, 70.0, 100000), rng.uniform(2.5, 64.0, 20000)])
    return {"knots": hxa(steps), "knots_log": hxa(np.log(np.array(steps))),
            "rand": hxa(r), "rand_log": hxa(np.log(r)),
            "scalar_equals_array": bool(all(np.log(float(x)) == y for x, y in zip(r[:5000], np.log(r[:5000]))))}


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--one":
        name = sys.argv[2]
        path = dict(REAL)[name]
        # the parent started this process in a fresh, empty cwd (see below)
        from pixelfixer import fusion
        work = os.getcwd()
        assert os.path.basename(work) == "varcontrast-cwd-%s.tmp" % name, work
        assert fusion.OUT_DIR.startswith(work), fusion.OUT_DIR
        assert not os.path.exists(fusion.CACHE_DIR), fusion.CACHE_DIR
        run_real(name, path, os.path.abspath(sys.argv[3]))
        n_cache = len(os.listdir(fusion.CACHE_DIR)) if os.path.isdir(fusion.CACHE_DIR) else 0
        with open(sys.argv[3]) as fh:
            c = json.load(fh)
        c["fusion_cache_files_written"] = n_cache
        with open(sys.argv[3], "w") as fh:
            json.dump(c, fh)
        return
    t0 = time.time()
    fx = {"meta": {"numpy": np.__version__, "scipy": scipy.__version__, "cv2": cv2.__version__,
                   "python": platform.python_version(), "machine": platform.machine(),
                   "reference": REF_PKG}}
    images = []
    print("real images (one process each):")
    for name, _p in REAL:
        part = os.path.join(FIX, "varcontrast-part-%s.json.tmp" % name)
        # fusion._cached_matrices keeps an ON-DISK cache of the channel
        # matrices under os.getcwd()/out/progress/methods/fusion/cache
        # (OUT_DIR is frozen from the cwd at IMPORT time), keyed by image
        # content. A cache hit skips every channel call, vc_z_of included -
        # a second run of this script once recorded none of fusion's
        # queries for exactly that reason - and a stale cache carries
        # another process's RNG state. So each child STARTS in a fresh,
        # empty directory inside fixtures/, must write exactly one cache
        # file there (a miss), and the directory is deleted afterwards.
        # Nothing is written outside this repository.
        import shutil
        work = os.path.join(FIX, "varcontrast-cwd-%s.tmp" % name)
        if os.path.exists(work):
            shutil.rmtree(work)
        os.makedirs(work)
        try:
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--one", name, part], cwd=work)
        finally:
            shutil.rmtree(work)
        if r.returncode != 0:
            raise SystemExit("child for %s failed with exit %d" % (name, r.returncode))
        with open(part) as fh:
            c = json.load(fh)
        os.remove(part)
        ncalls = sum(len(v) for v in c["calls"].values())
        nzq = sum(len(v) for v in c["zq"].values())
        srcs = sorted({s for v in c["calls"].values() for rec in v for s in rec["src"]})
        print("  %-11s %4dx%-4d calls=%-5d zq=%-4d dups=%-5d dup_mismatch=%d kmeans=%d rng_check=%s  %.1fs"
              % (name, c["w"], c["h"], ncalls, nzq, c["dups"], len(c["dup_mismatch"]),
                 c["kmeans_calls_during_entry"],
                 {k: v for k, v in c["rng_check"].items() if k.startswith("rebuilt")}, c["secs"]))
        print("              entry: %s" % json.dumps(c["entry"]))
        print("              fusion cache files written in the fresh cwd (1 = computed, not loaded): %d"
              % c["fusion_cache_files_written"])
        if c["fusion_cache_files_written"] != 1:
            raise SystemExit("fusion.detect did not compute its matrices for %s" % name)
        print("              sources: %s" % srcs)
        images.append(c)
    print("synthetic images:")
    install_recorders()
    for name, rgba in synth_images().items():
        c = run_synth(name, rgba)
        ncalls = sum(len(v) for v in c["calls"].values())
        print("  %-22s %3dx%-3d cn=%d calls=%d %s" % (name, c["w"], c["h"], c["cn"], ncalls,
                                                    c.get("cell_error", "")))
        images.append(c)
    fx["images"] = images
    fx["log"] = log_table()
    out = os.path.join(FIX, "varcontrast-parity.json")
    with open(out, "w") as fh:
        json.dump(fx, fh)
    print("wrote %s (%.1f MB) in %.1fs" % (out, os.path.getsize(out) / 1e6, time.time() - t0))


if __name__ == "__main__":
    main()
