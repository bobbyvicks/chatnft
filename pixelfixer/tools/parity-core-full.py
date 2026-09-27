"""Dump the reference's core.detect(rgba, mode="full") for pf-50-core.js.

WHAT IS COMPARED. For every case, ONE IMAGE PER PROCESS (see THE RNG
below), the reference's answer - cols, rows, step_x, step_y, phase_x,
phase_y, consensus, float bits included - and, from a second process
running the same call under a line tracer, the intermediate state of the
arbitration at fixed program points, so the JS test can say WHERE it
parts from the reference and not only THAT it does:

  stage1   every proposal (ac, rl, ss, fu) and the two fused curves
  groups   stage-1 groups before and after the aspect filter
  caps     detail_cap_x / detail_cap_y (the ACF central-peak bound)
  pick     each pick_axis call: the de-duplicated candidates, recon_at at
           each, rmax, recon_ok, every (s, score), best, the qualified
           set, and the step it returned
  aspect1 / aspect2 / refine / harm / count
           sx, sy entering each of the five post-pick steps
  both     each _both(s) of the second aspect guard
  final    n_cols, n_rows (local_count's drift-aware counts)
  lc       every autocorr.local_count call core makes: s0 and the branch
           it took (uniform / integrated), for coverage only

The tracer is sys.settrace + threading.settrace (pick_axis runs on a
thread pool); it READS frame locals and changes nothing. Each case is also
run without it, in its own process, and the parent requires the two
answers to be identical, so a tracer that perturbed the run would show.

THE RNG (measured here, not assumed - run with --probe-rng):
  - OpenCV's theRNG() is THREAD-LOCAL in cv2 5.0.0. A new thread's first
    draw equals a fresh process's first draw, whatever the main thread
    drew or seeded before; a setRNGSeed on a worker leaves the main
    thread's stream where it was.
  - core.detect(mode="full") with low_memory=False runs build_evidence (the
    only UNSEEDED k-means in detect) as the first task of a brand-new
    ThreadPoolExecutor thread, so it always starts from the fresh state,
    and reconsearch._prep seeds its own worker's generator. So the answer
    does not depend on how many numbers the main thread drew before, and
    detect leaves the main thread's generator untouched. It also cannot
    depend on which future finishes first: every draw is on its own
    thread's generator.
  - low_memory=True runs the same builds on the MAIN thread: fusion's
    k-means then draws from whatever state the main thread is in, and
    reconsearch reseeds the main thread's generator (12345) and leaves it
    moved. In a fresh process the answer is the same; after a prior draw
    it is not (frog: 121 x 120 becomes 121 x 118). So low_memory is not
    only a memory tactic in the reference. --probe-rng prints all of this.
  The dump is still one image per process on both sides, as the job
  requires: it is the only comparison that is right whether or not the
  claims above hold.

Cases: the three fixtures, the four example images, and constructed images
that reach the branches the examples do not (see SYNTH; --search is how
they were found, and the last five were added because a mutant of the JS
port survived without them). Plus four STUBBED cases (STUBS) for what no
valid image reaches: the serial rebuild of `shared` (autocorr's preamble
raising on the first call only, and on every call), autocorr.detect raising
after the preamble, and a pick_axis pool with no candidate in range.

log_probe: np.log on the step ladder and 20000 arguments, with the
correctly rounded value beside it (60-digit Decimal) and the indices where
numpy - the UCRT's log here - misrounds. core.py logs ratios and steps at
every threshold test; a last-bit log difference moved no answer in the
cases, so the JS side pins its log against this directly.

Floats are "f:" + 16 hex chars of the little-endian float64 bits; float
arrays are "F:" + hex of the whole float64 buffer; ints stay ints.

Run (the venv's `import pixelfixer` must resolve to the reference):
  <scratchpad>/pafenv2/Scripts/python.exe tools/parity-core-full.py
Writes fixtures/core-full-parity.json and fixtures/raw/core-full/<id>.rgba.
  ... tools/parity-core-full.py --probe-rng   the RNG measurements above
  ... tools/parity-core-full.py --search N     branch search over N seeds
"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import threading
import time

import numpy as np
import cv2
import PIL
from PIL import Image

import pixelfixer
import pixelfixer.core as core
import pixelfixer.autocorr as A
import pixelfixer.fusion as FU

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
RAW = os.path.join(FIX, "raw", "core-full")
OUT = os.path.join(FIX, "core-full-parity.json")
SCRATCH = os.path.dirname(os.path.dirname(ROOT))
EXAMPLES = os.path.join(SCRATCH, "paf-ref", "examples")


# ---------------------------------------------------------------- encoding
def H(x):
    return "f:" + struct.pack("<d", float(x)).hex()


def enc(v):
    if isinstance(v, bool) or isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return H(v)
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, dict):
        return {str(k): enc(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [enc(x) for x in v]
    if isinstance(v, np.ndarray):
        if v.dtype.kind == "f":
            return "F:" + np.ascontiguousarray(v, dtype="<f8").tobytes().hex()
        return [enc(x) for x in v.tolist()]
    raise TypeError("enc: unsupported %r" % type(v))


def enc_props(props):
    # the four keys core reads, plus phase (stage 1 returns base's phase)
    out = {}
    for n, p in props.items():
        d = {k: p[k] for k in ("step_x", "step_y", "cols", "rows") if k in p}
        for k in ("phase_x", "phase_y", "score_x", "score_y"):
            if k in p:
                d[k] = p[k]
        out[n] = enc(d)
    return out


# ---------------------------------------------------------------- tracer
SRC = open(core.__file__, encoding="utf-8").read().splitlines()


def line_of(text, nth=0):
    hits = [i + 1 for i, l in enumerate(SRC) if l == text]
    assert len(hits) > nth, "core.py no longer has line %r (#%d)" % (text, nth)
    return hits[nth]


# program points in detect(): the snapshot is taken on the 'line' event,
# i.e. BEFORE that line runs
POINTS = {
    line_of("    names = list(props)"): "stage1",
    line_of("    groups = [g for g in groups if _aspect_ok(g[1])]"): "groups_pre",
    line_of("    if groups and groups[0][0] >= 3:"): "groups_post",
    line_of("    def recon_at(axis, s):"): "caps",
    line_of("    if abs(np.log(sx / sy)) > 0.45:", 0): "aspect1",
    line_of("    if abs(np.log(sx / sy)) > 0.45:", 1): "aspect2",
    line_of("    sx = A.refine_step_acf(ac_x, sx)"): "refine",
    line_of("    if abs(np.log(sx / sy)) < 0.08 and abs(sx - sy) > 1e-6:"): "harm",
    line_of("    n_cols = A.local_count(maps_x, 1, w, sx)"): "count",
}

# branch lines reported as coverage (function, line text, nth) -> label
BRANCHES = [
    ("detect", "            return dict(step_x=float(w / cols), step_y=float(h / rows),", 0, "early exit fast:ac+rl(S)"),
    ("detect", "        g = A.to_gray(rgba)", 1, "serial rebuild of shared (ac failed)"),   # #0 is _run_ac's
    ("detect", "            return dict(step_x=float(w / cols), step_y=float(h / rows),", 1, "3-way cheap fast path fast:..."),
    ("detect", "        return dict(step_x=float(w / cols), step_y=float(h / rows),", 0, "stage-1 consensus return"),
    ("pick_axis", "            return sources.get(\"ac\", 4.0)", 0, "pick_axis: no candidate survives"),
    ("pick_axis", "                sc += 0.6 * (rn[s] / rmax)", 0, "pick_axis: recon_ok"),
    ("pick_axis", "                sc *= 0.35   # step incompatible with the finest detail", 0, "pick_axis: detail-cap penalty"),
    ("detect", "        s_fine, ax_fine = (sx, \"x\") if sx < sy else (sy, \"y\")", 0, "aspect guard 1 entered"),
    ("detect", "            sx = sy = s_fine", 0, "aspect guard 1 adopts the finer step"),
    ("detect", "        sx, sy = (sx, sx) if _both(sx) >= _both(sy) else (sy, sy)", 0, "aspect guard 2 (_both)"),
    ("_both", "                v *= 0.35", 0, "_both: detail-cap penalty"),
    ("detect", "        s = 2.0 * sx * sy / (sx + sy)", 0, "harmonic-mean re-refinement"),
    ("detect", "    return dict(step_x=float(w / n_cols), step_y=float(h / n_rows),", 0, "arbitrated return"),
]
BRANCH_LINES = [(fn, line_of(t, nth), label) for fn, t, nth, label in BRANCHES]


class Tracer:
    """Reads locals at fixed points of core.detect; never writes."""

    def __init__(self):
        self.snaps = []
        self.lines = set()
        self.pointed = set()
        self.lock = threading.Lock()

    def add(self, tag, data):
        with self.lock:
            self.snaps.append({"tag": tag, "data": data})

    def global_trace(self, frame, event, arg):
        f = frame.f_code.co_filename
        if f == core.__file__:
            return self.local_core
        if (f == A.__file__ and frame.f_code.co_name == "local_count"
                and frame.f_back is not None and frame.f_back.f_code.co_filename == core.__file__):
            return self.local_lc     # core's own call, not autocorr.detect's
        return None

    def local_lc(self, frame, event, arg):
        if event == "return":
            L = frame.f_locals
            branch = "uniform-early" if "total" not in L else (
                "integrated" if (arg is not None and "total" in L and arg is L["total"]) else "uniform")
            self.add("lc", {"s0": enc(L.get("s0")), "extent": enc(L.get("extent")),
                            "branch": branch, "ret": enc(arg)})
        return self.local_lc

    def local_core(self, frame, event, arg):
        name = frame.f_code.co_name
        if event == "line":
            self.lines.add((name, frame.f_lineno))
            if name == "detect" and frame.f_lineno in POINTS:
                # once each: Python 3.12 inlines the list comprehension on
                # the groups_pre line, whose line event then fires once per
                # element (measured: 5 identical snapshots for 4 groups)
                tag = POINTS[frame.f_lineno]
                if tag not in self.pointed:
                    self.pointed.add(tag)
                    self.point(tag, frame.f_locals)
        elif event == "return":
            L = frame.f_locals
            if name == "pick_axis":
                d = {"axis": L["axis"], "cands": enc(L.get("cands")), "ret": enc(arg)}
                if "rn" in L:
                    d["rn"] = enc([L["rn"][s] for s in L["cands"]])
                    d["rmax"] = enc(L["rmax"])
                    d["recon_ok"] = bool(L["recon_ok"])
                    d["scored"] = enc(L["scored"])
                    d["best"] = enc(L["best"])
                    d["qualified"] = enc(L["qualified"])
                self.add("pick", d)
            elif name == "_both":
                self.add("both", {"s": enc(L["s"]), "ret": enc(arg)})
            elif name == "detect" and "n_cols" in L:
                self.add("final", {"n_cols": enc(L["n_cols"]), "n_rows": enc(L["n_rows"])})
        return self.local_core

    def point(self, tag, L):
        if tag == "stage1":
            self.add(tag, {"props": enc_props(L["props"]),
                           "names": list(L["props"]),
                           "curve_x": enc(np.asarray(L["curves"]["x"], np.float64)),
                           "curve_y": enc(np.asarray(L["curves"]["y"], np.float64))})
        elif tag in ("groups_pre", "groups_post"):
            self.add(tag, [[g[0], g[1], list(g[2])] for g in L["groups"]])
        elif tag == "caps":
            self.add(tag, {"x": enc(L["detail_cap_x"]), "y": enc(L["detail_cap_y"])})
        else:
            self.add(tag, {"sx": enc(L["sx"]), "sy": enc(L["sy"])})


def traced_detect(rgba, **kw):
    t = Tracer()
    sys.settrace(t.global_trace)
    threading.settrace(t.global_trace)
    try:
        r = core.detect(rgba, **kw)
    finally:
        sys.settrace(None)
        threading.settrace(None)
    hit = [label for fn, ln, label in BRANCH_LINES if (fn, ln) in t.lines]
    for s in t.snaps:
        if s["tag"] == "lc":
            lab = LC_LABELS[s["data"]["branch"]]
            if lab not in hit:
                hit.append(lab)
    return r, t.snaps, hit


# autocorr.local_count as core's final step calls it (coverage only; the
# JS side sees its return value in "final")
LC_LABELS = {"uniform-early": "local_count: uniform (few periods)",
             "uniform": "local_count: windows scanned, uniform kept",
             "integrated": "local_count: integrated (drift) count adopted"}


# ---------------------------------------------------------------- images
def rgba_of(rgb):
    rgb = np.clip(np.asarray(rgb, np.float64), 0, 255)
    a = np.full(rgb.shape[:2] + (1,), 255, np.uint8)
    return np.ascontiguousarray(np.dstack([np.round(rgb).astype(np.uint8), a]))


def upscale_nn(native, sx, sy, W=None, Hh=None):
    """Nearest upscale by (sx, sy) px per cell; fractional steps allowed."""
    h, w = native.shape[:2]
    Hh = Hh or int(round(h * sy))
    W = W or int(round(w * sx))
    ys = np.minimum((np.arange(Hh) / sy).astype(int), h - 1)
    xs = np.minimum((np.arange(W) / sx).astype(int), w - 1)
    return native[ys][:, xs]


def upscale_drift(native, s0, s1, sy):
    """Columns whose width drifts linearly from s0 to s1 px across the image."""
    h, w = native.shape[:2]
    widths = np.linspace(s0, s1, w)
    edges = np.concatenate([[0.0], np.cumsum(widths)])
    W = int(np.floor(edges[-1]))
    xs = np.minimum(np.searchsorted(edges, np.arange(W) + 0.5, side="right") - 1, w - 1)
    Hh = int(round(h * sy))
    ys = np.minimum((np.arange(Hh) / sy).astype(int), h - 1)
    return native[ys][:, xs]


def art(seed, rows, cols, ncol=7, blk=1):
    rng = np.random.default_rng(seed)
    pal = rng.integers(0, 256, (ncol, 3))
    lab = rng.integers(0, ncol, ((rows + blk - 1) // blk, (cols + blk - 1) // blk))
    lab = np.repeat(np.repeat(lab, blk, 0), blk, 1)[:rows, :cols]
    return pal[lab].astype(np.float64), rng


def jpeg(rgb, q):
    ok, buf = cv2.imencode(".jpg", np.clip(rgb, 0, 255).astype(np.uint8)[:, :, ::-1],
                           [cv2.IMWRITE_JPEG_QUALITY, int(q)])
    assert ok
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float64)


def gen(kind, seed):
    """A constructed image from (kind, seed); deterministic."""
    rng = np.random.default_rng(1000 + seed)
    if kind == "rect":            # non-square cells
        sx = float(rng.choice([3, 4, 5, 6])); sy = sx * float(rng.choice([1.6, 1.8, 2.0, 2.5]))
        if rng.random() < 0.5:
            sx, sy = sy, sx
        nat, _ = art(seed, int(rng.integers(12, 30)), int(rng.integers(12, 30)))
        return rgba_of(upscale_nn(nat, sx, sy)), "rect %.2fx%.2f" % (sx, sy)
    if kind == "rectnoisy":       # mildly non-square cells (1.5-1.8:1) under noise
        sx = float(rng.choice([3.0, 4.0, 5.0])); sy = sx * float(rng.choice([1.5, 1.6, 1.65, 1.7, 1.8]))
        if rng.random() < 0.5:
            sx, sy = sy, sx
        nat, r2 = art(seed, int(rng.integers(14, 30)), int(rng.integers(14, 30)))
        img = upscale_nn(nat, sx, sy)
        n = float(rng.choice([0, 20, 40, 70]))
        return rgba_of(img + r2.normal(0, n, img.shape)), "rectnoisy %.2fx%.2f n=%d" % (sx, sy, n)
    if kind == "noiseodd":        # noise, both sides = 1 mod 4 (fu step 2.0 -> x.5 cells)
        hh = 4 * int(rng.integers(16, 40)) + 1
        ww = 4 * int(rng.integers(16, 40)) + 1
        return rgba_of(rng.integers(0, 256, (hh, ww, 3))), "noiseodd"
    if kind == "noisy":           # a lattice under gaussian noise
        s = float(rng.choice([3.0, 4.0, 4.5, 5.0, 6.0, 7.3]))
        n = float(rng.choice([20, 40, 60, 80, 100]))
        nat, r2 = art(seed, int(rng.integers(16, 40)), int(rng.integers(16, 40)))
        img = upscale_nn(nat, s, s)
        return rgba_of(img + r2.normal(0, n, img.shape)), "noisy s=%.1f n=%d" % (s, n)
    if kind == "jpeg":
        s = float(rng.choice([2.5, 3.0, 4.0, 5.5, 8.0]))
        q = int(rng.choice([10, 20, 35, 50]))
        nat, _ = art(seed, int(rng.integers(20, 50)), int(rng.integers(20, 50)))
        return rgba_of(jpeg(upscale_nn(nat, s, s), q)), "jpeg s=%.1f q=%d" % (s, q)
    if kind == "bilin":           # mushy upscale
        s = float(rng.choice([3.0, 4.0, 6.0, 8.0, 10.0]))
        nat, _ = art(seed, int(rng.integers(12, 30)), int(rng.integers(12, 30)))
        im = Image.fromarray(nat.astype(np.uint8))
        how = Image.BILINEAR if rng.random() < 0.5 else Image.BICUBIC
        big = np.array(im.resize((int(nat.shape[1] * s), int(nat.shape[0] * s)), how)).astype(np.float64)
        return rgba_of(big), "smooth s=%.1f" % s
    if kind == "drift":           # >= 96 cells with a drifting step
        s0 = float(rng.choice([3.0, 3.5, 4.0])); d = float(rng.choice([0.1, 0.2, 0.3, 0.5]))
        nat, _ = art(seed, int(rng.integers(20, 40)), int(rng.integers(100, 130)))
        return rgba_of(upscale_drift(nat, s0 - d, s0 + d, s0)), "drift %.1f+-%.1f" % (s0, d)
    if kind == "blk":             # colour changes every k cells (harmonic bait)
        s = float(rng.choice([3.0, 4.0, 5.0])); k = int(rng.choice([2, 3]))
        nat, r2 = art(seed, int(rng.integers(24, 48)), int(rng.integers(24, 48)), blk=k)
        m = r2.random(nat.shape[:2]) < 0.15
        nat[m] = r2.integers(0, 256, (int(m.sum()), 3))
        return rgba_of(upscale_nn(nat, s, s)), "blk s=%.1f k=%d" % (s, k)
    if kind == "split":           # two grids side by side
        a, _ = art(seed, 16, 16)
        b, _ = art(seed + 1, 16, 16)
        s1 = float(rng.choice([3.0, 4.0])); s2 = float(rng.choice([6.0, 7.0, 9.0]))
        L = upscale_nn(a, s1, s1); Rr = upscale_nn(b, s2, s2)
        hh = min(L.shape[0], Rr.shape[0])
        return rgba_of(np.concatenate([L[:hh], Rr[:hh]], 1)), "split %.0f|%.0f" % (s1, s2)
    if kind == "detail":          # big cells with fine texture inside
        s = float(rng.choice([8.0, 10.0, 12.0])); n = float(rng.choice([10, 25, 45]))
        nat, r2 = art(seed, int(rng.integers(10, 20)), int(rng.integers(10, 20)))
        img = upscale_nn(nat, s, s)
        tex = r2.normal(0, n, (img.shape[0] // 2 + 1, img.shape[1] // 2 + 1, 3))
        tex = np.repeat(np.repeat(tex, 2, 0), 2, 1)[:img.shape[0], :img.shape[1]]
        return rgba_of(img + tex), "detail s=%.0f n=%d" % (s, n)
    if kind == "stripes":         # edges on one axis only
        s = float(rng.choice([3.0, 4.0, 6.0]))
        nat, _ = art(seed, 1, int(rng.integers(20, 40)))
        img = upscale_nn(nat, s, 1.0, Hh=int(rng.integers(60, 140)))
        if rng.random() < 0.5:
            img = img.transpose(1, 0, 2)
        return rgba_of(img), "stripes s=%.0f" % s
    if kind == "stripes_big":     # wide stripes on one axis, fine noise on the other
        s = float(rng.choice([9.0, 11.0, 14.0, 17.0]))
        nat, r2 = art(seed, 1, int(rng.integers(8, 16)))
        img = upscale_nn(nat, s, 1.0, Hh=int(rng.integers(80, 160)))
        img = img + r2.normal(0, float(rng.choice([8, 20, 40])), (img.shape[0], 1, 3))
        if rng.random() < 0.5:
            img = img.transpose(1, 0, 2)
        return rgba_of(img), "stripes_big s=%.0f" % s
    if kind == "stripes_wide":    # clean stripes wider than an 8 px detail cap
        s = float(rng.choice([9.0, 11.0, 14.0]))
        nat, _ = art(seed, 1, int(rng.integers(8, 16)))
        img = upscale_nn(nat, s, 1.0, Hh=int(rng.integers(60, 140)))
        if rng.random() < 0.5:
            img = img.transpose(1, 0, 2)
        return rgba_of(img), "stripes_wide s=%.0f" % s
    if kind == "noise":
        hh, ww = int(rng.integers(64, 160)), int(rng.integers(64, 160))
        return rgba_of(rng.integers(0, 256, (hh, ww, 3))), "noise"
    if kind == "wide":            # image aspect far from square, square cells
        s = float(rng.choice([3.0, 4.0, 5.0]))
        nat, _ = art(seed, int(rng.integers(8, 14)), int(rng.integers(40, 70)))
        return rgba_of(upscale_nn(nat, s, s)), "wide s=%.0f" % s
    raise ValueError(kind)


KINDS = ["rect", "noisy", "jpeg", "bilin", "drift", "blk", "split", "detail", "stripes", "stripes_big", "stripes_wide", "noise", "wide", "rectnoisy", "noiseodd"]

# Chosen by --search (reference branch coverage over constructed images) as
# a small set that, with the examples, reaches every branch in BRANCHES that
# a valid image can reach. Each says what it is there for; the parent
# re-checks coverage after the dump and fails if a branch goes unreached.
SYNTH = [
    # (id, kind, seed, why)
    ("syn-3way", "jpeg", 0, "3-way cheap fast path: ac, rl, ss agree but rl's comb score < 0.30"),
    ("syn-s1-acssfu", "noisy", 4, "stage-1 consensus ac+ss+fu (rl dissents)"),
    ("syn-s1-acrlssfu", "drift", 3, "stage-1 consensus of all four (the 3-way path refused on aspect/closeness)"),
    ("syn-s1-acrlfu", "split", 0, "stage-1 consensus ac+rl+fu"),
    ("syn-s1-rlssfu", "split", 1, "stage-1 consensus rl+ss+fu, no ac: phase from rl"),
    ("syn-s1-acrlss", "drift", 29, "stage-1 consensus ac+rl+ss with fu dissenting"),
    ("syn-aspect1-rect", "rect", 0, "3x6 px cells: aspect guard 1 adopts the finer step"),
    ("syn-aspect1-noise", "noise", 7, "noise: aspect guard 1 adopts the finer step, no lattice"),
    ("syn-aspect2", "stripes", 6, "stripes: guard 1 refuses (fused < 0.35), _both decides"),
    ("syn-both-cap", "stripes_wide", 7, "9 px stripes: _both penalises the step above the 8 px detail cap"),
    ("syn-drift-a", "drift", 13, "drifting step: local_count adopts the integrated count"),
    ("syn-drift-b", "drift", 0, "drifting step: integrated count, a second geometry"),
    ("syn-arb-blk", "blk", 11, "3-cell colour blocks: arbitrated"),
    ("syn-arb-jpeg", "jpeg", 7, "2.5 px cells under q10 jpeg: arbitrated"),
    ("syn-arb-norecon", "noise", 0, "noise: recon_ok False (no lattice for the distillability term)"),
    ("syn-arb-noharm", "stripes", 0, "arbitrated with the axes too far apart for the harmonic step"),
    ("syn-arb-detail", "detail", 1, "12 px cells with 2 px texture: detail cap"),
    ("syn-arb-noisy", "noisy", 1, "7.3 px cells under sigma-80 noise"),
    ("syn-arb-smooth", "bilin", 1, "10 px cells, smooth upscale"),
    # Added after tools/test-core-full.cjs --mutants: with the cases above,
    # 5 of 22 one-literal mutants survived. These four sit INSIDE the band
    # between a constant and its mutant (found by --search's SENS tags and a
    # scan of the fine-step support), so each pins that constant:
    ("syn-guard1-band", "rectnoisy", 6,
     "4 x 6.4 px cells under noise: |log(sx/sy)| = 0.455 after the pick, inside (0.45, 0.55] - pins guard 1's 0.45"),
    ("syn-fine-support", "stripes_wide", 21,
     "fused support of the finer step = 0.408, inside [0.35, 0.45) - pins guard 1's 0.35"),
    ("syn-acf-width", "stripes", 9,
     "y ACF half-width is 1 lag at 0.30 * c0 but 2 at 0.25 * c0 - pins _acf_width's 0.30"),
    ("syn-fu-half", "stripes", 7,
     "h / fu step_y = 117 / 2.0 = 58.5 - pins round-half-to-even in fu rows"),
    ("syn-fu-half-x", "stripes", 4,
     "w / fu step_x = 69 / 2.0 = 34.5 - pins round-half-to-even in fu cols (syn-fu-half only pinned rows:"
     " the cols mutant survived it)"),
]

# Stubbed cases (the reference's module attribute replaced for ONE process;
# the JS test installs the same stub). No valid image makes autocorr's
# preamble raise, so these are the only way to reach the serial rebuild.
STUBS = [
    # (id, base case, stub, why)
    ("stub-rebuild", "syn-arb-blk", "to_gray_raises_once",
     "autocorr's preamble raises on the ac thread, so `shared` is rebuilt serially and ac is not a proposal"),
    ("stub-rebuild-raises", "tiny", "to_gray_raises_always",
     "the serial rebuild raises too: detect propagates it"),
    ("stub-acdetect", "syn-arb-jpeg", "ac_detect_raises",
     "autocorr.detect raises AFTER the preamble: no ac proposal, but shared (maps, estimates) is intact"),
    ("stub-nocand", "tiny", "nocand",
     "every proposal and ac candidate beyond extent/3: pick_axis returns sources['ac'] (no valid image reaches this)"),
]


# ---------------------------------------------------------------- cases
def load_case(cid):
    if cid in ("tiny", "small", "mid"):
        return np.ascontiguousarray(np.array(Image.open(os.path.join(FIX, cid + ".png")).convert("RGBA")))
    if cid in ("dragon", "frog", "koi-pond", "lighthouse"):
        return np.ascontiguousarray(np.array(Image.open(os.path.join(EXAMPLES, cid + ".png")).convert("RGBA")))
    for sid, kind, seed, _why in SYNTH:
        if sid == cid:
            return gen(kind, seed)[0]
    raise KeyError(cid)


def install_stub(stub):
    """Replace one reference module attribute for this process; returns the
    restore function."""
    if stub == "to_gray_raises_once":
        real = A.to_gray
        state = {"n": 0}

        def s(rgba):
            state["n"] += 1
            if state["n"] == 1:
                raise RuntimeError("stub to_gray raised")
            return real(rgba)
        A.to_gray = s
        return lambda: setattr(A, "to_gray", real)
    if stub == "to_gray_raises_always":
        real = A.to_gray

        def s(rgba):
            raise RuntimeError("stub to_gray raised")
        A.to_gray = s
        return lambda: setattr(A, "to_gray", real)
    if stub == "nocand":
        import pixelfixer.runlengths as RL
        import pixelfixer.selfsim as SS
        real = (A.detect, RL.detect, SS.detect, A.axis_estimate, FU.fused_curve)
        A.detect = lambda rgba, pre=None: dict(step_x=50.0, step_y=50.0, cols=3, rows=3, phase_x=0.0, phase_y=0.0)
        RL.detect = lambda rgba: dict(step_x=55.0, step_y=55.0, cols=7, rows=7, phase_x=0.0, phase_y=0.0,
                                      score_x=0.0, score_y=0.0)
        SS.detect = lambda rgba: dict(step_x=60.0, step_y=60.0, cols=11, rows=11, phase_x=0.0, phase_y=0.0)

        def ae(maps, axis, extent):
            best, _cands, ac = real[3](maps, axis, extent)
            return best, [(50.0, 1.0)], ac
        A.axis_estimate = ae
        FU.fused_curve = lambda mat: np.arange(mat.shape[0], dtype=np.float64)

        def undo():
            A.detect, RL.detect, SS.detect, A.axis_estimate, FU.fused_curve = real
        return undo
    if stub == "ac_detect_raises":
        real = A.detect

        def s(rgba, pre=None):
            raise RuntimeError("stub ac detect raised")
        A.detect = s
        return lambda: setattr(A, "detect", real)
    raise ValueError(stub)


def child(cid, how):
    """ONE detect(mode="full") in this process, nothing before it."""
    stub = None
    base = cid
    for sid, b, st, _why in STUBS:
        if sid == cid:
            base, stub = b, st
    rgba = load_case(base)
    assert rgba.dtype == np.uint8 and rgba.ndim == 3 and rgba.shape[2] == 4 and rgba.flags.c_contiguous
    kq = []
    real_kq = FU.kmeans_quantize

    def rec_kq(img, *a, **k):
        q = real_kq(img, *a, **k)
        kq.append({"thread": threading.current_thread().name,
                   "is_main": threading.current_thread() is threading.main_thread(),
                   "md5": hashlib.md5(q[0].tobytes()).hexdigest()})
        return q
    FU.kmeans_quantize = rec_kq
    restore = install_stub(stub) if stub else (lambda: None)
    out = {"id": cid, "base": base, "stub": stub, "w": int(rgba.shape[1]), "h": int(rgba.shape[0])}
    t0 = time.time()
    try:
        if how == "traced":
            r, snaps, hit = traced_detect(rgba, mode="full")
            out["trace"] = snaps
            out["hit"] = hit
        else:
            r = core.detect(rgba, mode="full")
        out["result"] = enc(r)
    except Exception as e:
        out["raises"] = "%s: %s" % (type(e).__name__, e)
    finally:
        restore()
    out["detect_s"] = round(time.time() - t0, 3)
    out["fusion_kmeans"] = kq
    # the main thread's OpenCV generator after detect: a fresh process's
    # first three draws mean detect never touched it
    a = np.zeros(3, np.float64)
    cv2.randu(a, 0, 1)
    out["main_rng_after"] = enc(a)
    if how == "plain":
        os.makedirs(RAW, exist_ok=True)
        rgba.tofile(os.path.join(RAW, base + ".rgba"))
    print("@@" + json.dumps(out))


def run_child(cid, how):
    r = subprocess.run([sys.executable, __file__, "--one", cid, how],
                       capture_output=True, text=True,
                       env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
    if r.returncode:
        raise SystemExit("%s/%s: child FAILED\n%s" % (cid, how, r.stderr[-2000:]))
    line = [l for l in r.stdout.splitlines() if l.startswith("@@")]
    assert len(line) == 1, r.stdout[-2000:]
    return json.loads(line[0][2:])


# ---------------------------------------------------------------- probes
def probe_rng():
    def draw():
        a = np.zeros(3, np.float64)
        cv2.randu(a, 0, 1)
        return [round(float(x), 9) for x in a]
    res = {}

    def on_thread(key, fn):
        t = threading.Thread(target=lambda: res.__setitem__(key, fn()))
        t.start()
        t.join()
    on_thread("worker, first draw (fresh process)", draw)
    res["main, first draw"] = draw()
    res["main, second draw"] = draw()
    on_thread("new worker after main drew twice", draw)
    cv2.setRNGSeed(5)
    on_thread("new worker after main seeded 5", draw)

    def seeded():
        cv2.setRNGSeed(12345)
        return draw()
    on_thread("worker seeds 12345 then draws", seeded)
    res["main after that (continues seed 5)"] = draw()
    cv2.setRNGSeed(5)
    res["main, seed 5 fresh"] = draw()
    for k, v in res.items():
        print("  %-40s %s" % (k, v))
    # detect twice in one process: the default path must not depend on history
    rgba = gen("blk", 11)[0]          # syn-arb-blk: reaches stage 2 and its k-means
    r1 = core.detect(rgba, mode="full")
    draw()
    r2 = core.detect(rgba, mode="full")
    print("  detect(full) twice in one process, a draw between: %s  (%s)" %
          ("IDENTICAL" if enc(r1) == enc(r2) else "DIFFERENT %r vs %r" % (r1, r2), r1["consensus"]))


LOWMEM_CODE = "\n".join([
    "import sys, hashlib, threading, numpy as np, cv2",
    "from PIL import Image",
    "import pixelfixer.fusion as F",
    "from pixelfixer.core import detect",
    "pre, lm = int(sys.argv[2]), bool(int(sys.argv[3]))",
    "rec = []",
    "orig = F.kmeans_quantize",
    "def wrap(*a, **k):",
    "    q = orig(*a, **k)",
    "    rec.append((threading.current_thread().name, hashlib.md5(q[0].tobytes()).hexdigest()[:10]))",
    "    return q",
    "F.kmeans_quantize = wrap",
    "def draw():",
    "    a = np.zeros(3, np.float64); cv2.randu(a, 0, 1); return [round(float(x), 6) for x in a]",
    "a = np.array(Image.open(sys.argv[1]).convert('RGBA'))",
    "if pre: draw()",
    "r = detect(a, mode='full', low_memory=lm)",
    "print('pre_draw=%d low_memory=%d  %dx%d  %r %r  %-11s k-means on %s -> %s  main RNG after: %s'",
    "      % (pre, lm, r['cols'], r['rows'], r['step_x'], r['step_y'], r['consensus'], rec[0][0], rec[0][1], draw()))",
])


def probe_low_memory(path):
    """low_memory x a prior main-thread draw, each in a fresh process."""
    for pre in (0, 1):
        for lm in (0, 1):
            r = subprocess.run([sys.executable, "-c", LOWMEM_CODE, path, str(pre), str(lm)],
                               capture_output=True, text=True,
                               env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
            print("  " + (r.stdout.strip() or r.stderr[-800:]))


def _dec(x):
    return struct.unpack("<d", bytes.fromhex(x[2:]))[0] if isinstance(x, str) and x.startswith("f:") else x


def sensitivity(rgba, snaps):
    """Search-only tags naming which one-literal mutants of the JS port this
    image could tell apart (a case sitting inside the band between the
    constant and its mutant). Recomputed from the trace, post hoc."""
    tags = []
    by = {s["tag"]: s["data"] for s in snaps}
    h, w = rgba.shape[:2]
    if "stage1" in by:
        steps = FU.ladder()
        ls = np.log(steps)
        fu = by["stage1"]["props"]["fu"]
        for ext, key in ((w, "step_x"), (h, "step_y")):
            q = ext / _dec(fu[key])
            if q - np.floor(q) == 0.5 and int(np.floor(q)) % 2 == 0:
                tags.append("SENS fu-round-half")
        if "aspect1" in by:
            sx, sy = _dec(by["aspect1"]["sx"]), _dec(by["aspect1"]["sy"])
            lr = abs(np.log(sx / sy))
            if 0.45 < lr <= 0.55:
                tags.append("SENS guard1-band %.3f" % lr)
            if lr > 0.45:
                s_fine, ax = (sx, "x") if sx < sy else (sy, "y")
                cv = np.frombuffer(bytes.fromhex(by["stage1"]["curve_" + ax][2:]), "<f8")
                fv = float(np.interp(np.log(s_fine), ls, cv)) if steps[0] <= s_fine <= steps[-1] else 0.0
                if 0.35 <= fv < 0.45:
                    tags.append("SENS fine-support-band %.3f" % fv)
        if "caps" in by:
            g = A.to_gray(rgba)
            gq = A.median_quant(g)
            for axis, ext, maps in ((1, w, [(A.d2_along(g, 1), 1.0), (A.d1_along(gq, 1), 0.7)]),
                                    (0, h, [(A.d2_along(g, 0), 1.0), (A.d1_along(gq, 0), 0.7)])):
                ac = A.axis_estimate(maps, axis, ext)[2]

                def width(thr):
                    tail = ac[32:96] if len(ac) > 40 else ac[len(ac) // 2:]
                    base = float(np.median(tail)) if len(tail) else 0.0
                    c0 = max(ac[0] - base, 1e-9)
                    for lag in range(1, min(len(ac), 64)):
                        if ac[lag] - base < thr * c0:
                            return lag
                    return 64
                if width(0.30) != width(0.25):
                    tags.append("SENS acf-width-%s %d/%d" % ("xy"[1 - axis], width(0.30), width(0.25)))
    return tags


def search(n, kinds):
    """Branch coverage of the reference over constructed images, in ONE
    process: legitimate only because probe_rng measured the default full
    path to be independent of process history (the dump itself is still one
    image per process)."""
    table = []
    for kind in kinds:
        for seed in range(n):
            rgba, desc = gen(kind, seed)
            t0 = time.time()
            try:
                r, snaps, hit = traced_detect(rgba, mode="full")
                cons = "%s %dx%d" % (r["consensus"], r["cols"], r["rows"])
                hit = hit + sensitivity(rgba, snaps)
            except Exception as e:
                hit, cons = [], "RAISES " + type(e).__name__
            dt = time.time() - t0
            table.append((kind, seed, hit))
            print("%-8s %3d %-22s %4dx%-4d %-30s %5.2fs  %s" % (
                kind, seed, desc, rgba.shape[1], rgba.shape[0], cons, dt, " | ".join(hit)), flush=True)
    print("\ncoverage:")
    for _fn, _t, _nth, lab in BRANCHES:
        who = [(k, s) for k, s, hit in table if lab in hit]
        print("  %-42s %4d  e.g. %s" % (lab, len(who), who[:8]))


# ---------------------------------------------------------------- main
def meta():
    return {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "python": sys.version.split()[0],
        "numpy": np.__version__, "cv2": cv2.__version__, "PIL": PIL.__version__,
        "pixelfixer": os.path.dirname(pixelfixer.__file__),
        "core_py_sha256": hashlib.sha256(open(core.__file__, "rb").read()).hexdigest(),
        "float_encoding": "f:<16 hex, float64 LE>; F:<hex of a float64 LE buffer>; ints are ints",
    }


def log_probe():
    """np.log as core.py calls it, for the JS port's log (PF.core._npLog).
    A last-bit log difference moves no answer on the cases above (the
    np.log -> Math.log mutant survived them), so it is pinned directly: the
    ladder core takes np.log(steps) of, and 20000 arguments spanning the
    ratios and steps core logs (1e-3 .. 1e3, log-uniform, fixed seed).
    Array and scalar np.log are required identical here, since core uses
    both (np.log(steps) on a list; np.log(s / s2) on a float)."""
    rng = np.random.default_rng(20260927)
    xs = np.concatenate([np.asarray(FU.ladder(), np.float64),
                         np.exp(rng.uniform(np.log(1e-3), np.log(1e3), 20000))])
    arr = np.log(xs)
    scal = np.array([np.log(float(x)) for x in xs])
    n_diff = int(np.sum(arr != scal))
    assert n_diff == 0, "array and scalar np.log differ on %d arguments" % n_diff
    # the correctly rounded log (60-digit Decimal, then one rounding): numpy
    # here is the UCRT's log, which is NOT correctly rounded everywhere, and
    # no JS log can reproduce a closed-source libm's misroundings - so the
    # probe records where numpy misrounds, and the JS side is required to be
    # correctly rounded everywhere and equal to numpy everywhere else
    import decimal
    ctx = decimal.Context(prec=60)
    cr = np.array([float(ctx.ln(decimal.Decimal(float(x)))) for x in xs])
    mis = [int(i) for i in np.nonzero(cr != arr)[0]]
    return {"x": enc(xs), "log": enc(arr), "cr": enc(cr), "n": int(len(xs)),
            "n_ladder": len(FU.ladder()), "numpy_misrounded": mis, "array_vs_scalar_differ": n_diff}


def main():
    if not os.path.isdir(EXAMPLES):
        raise SystemExit("examples not found at " + EXAMPLES)
    cases = ["tiny", "small", "mid", "dragon", "frog", "koi-pond", "lighthouse"]
    cases += [s[0] for s in SYNTH] + [s[0] for s in STUBS]
    doc = {"meta": meta(), "log_probe": log_probe(), "cases": []}
    covered = {}
    print("%-24s %-10s %-22s %-11s %-42s %s" % ("case", "size", "consensus", "cols x rows", "step_x, step_y", "secs"))
    for cid in cases:
        plain = run_child(cid, "plain")
        traced = run_child(cid, "traced")
        # the tracer must not have moved anything
        if (plain.get("result") != traced.get("result") or plain.get("raises") != traced.get("raises")
                or plain["fusion_kmeans"] != traced["fusion_kmeans"]):
            raise SystemExit("%s: traced run differs from plain run:\n%r\n%r" % (
                cid, plain.get("result") or plain.get("raises"), traced.get("result") or traced.get("raises")))
        entry = dict(plain)
        entry["trace"] = traced.get("trace", [])
        entry["hit"] = traced.get("hit", [])
        for why in [s[3] for s in SYNTH if s[0] == cid] + [s[3] for s in STUBS if s[0] == cid]:
            entry["why"] = why
        doc["cases"].append(entry)
        for lab in entry["hit"]:
            covered.setdefault(lab, []).append(cid)
        km = ",".join(("main" if k["is_main"] else "worker") for k in plain["fusion_kmeans"]) or "-"
        if "result" in plain:
            r = plain["result"]
            sx = struct.unpack("<d", bytes.fromhex(r["step_x"][2:]))[0]
            sy = struct.unpack("<d", bytes.fromhex(r["step_y"][2:]))[0]
            print("%-24s %4dx%-5d %-22s %4d x %-4d %-42s %5.1f  k-means:%s" % (
                cid, plain["w"], plain["h"], r["consensus"], r["cols"], r["rows"],
                "%r, %r" % (sx, sy), plain["detect_s"], km))
        else:
            print("%-24s %4dx%-5d RAISES %s  k-means:%s" % (cid, plain["w"], plain["h"], plain["raises"], km))
    with open(OUT, "w") as fh:
        json.dump(doc, fh)
    print("\nbranch coverage over the dump (reference, traced):")
    missing = []
    for lab in LC_LABELS.values():
        print("  %-42s %s" % (lab, ", ".join(covered.get(lab, [])) or "not reached (coverage only)"))
    for _fn, _t, _nth, lab in BRANCHES:
        who = covered.get(lab, [])
        print("  %-42s %s" % (lab, ", ".join(who) if who else "NOT REACHED"))
        if not who:
            missing.append(lab)
    print("\nwrote %s (%.1f MB), %d cases" % (OUT, os.path.getsize(OUT) / 1e6, len(doc["cases"])))
    if missing:
        print("UNREACHED: " + "; ".join(missing))
        raise SystemExit(3)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--one":
        child(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 2 and sys.argv[1] == "--probe-rng":
        probe_rng()
        probe_low_memory(os.path.join(EXAMPLES, "frog.png"))
    elif len(sys.argv) >= 2 and sys.argv[1] == "--search":
        search(int(sys.argv[2]) if len(sys.argv) > 2 else 20,
               sys.argv[3].split(",") if len(sys.argv) > 3 else KINDS)
    else:
        main()
