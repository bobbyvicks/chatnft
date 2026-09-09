"""Dump the reference's core.detect(mode="fast") ground truth for
pf-50-core.js.

Three populations, each with a different question behind it:

  images   the three real fixtures + six synthetic arrays, run through the
           UNPATCHED reference. The three sub-detectors are wrapped (not
           replaced) so their return values are recorded alongside the
           final answer, and the RGBA bytes are dumped so the JS side can
           (a) replay the recorded proposals through its core logic today
           and (b) run end-to-end once the detector ports are on PF.
  logic    canned proposal sets fed through the REAL core.detect with the
           three detect functions monkeypatched. These pin the branches no
           real image reaches (a raising detector, the exact 0.30 score
           boundary, half-to-even on the averaged cell count, NaN scores,
           the asymmetric size tolerance).
  size_close  a table of _size_close over the tolerance's half-even points.

Floats are written as "f:" + 16 hex chars of their float64 bits (a bit-
exact channel: NaN, -0.0 and every last bit survive); ints stay JSON ints.

Run:
  <pafenv>/Scripts/python.exe tools/parity-core.py
Writes fixtures/core.json and prints the per-image branch table. Exits
non-zero if the synthetic set fails to cover every fast-mode branch.
"""
import hashlib
import json
import math
import os
import struct
import sys
import time

import numpy as np
import cv2
import PIL
from PIL import Image

import pixelfixer.core as core
import pixelfixer.autocorr as A
import pixelfixer.runlengths as RL
import pixelfixer.selfsim as SS

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
OUT = os.path.join(FIX, "core.json")


# ---------------------------------------------------------------- encoding
def H(x):
    return "f:" + struct.pack("<d", float(x)).hex()


def enc(v):
    if isinstance(v, bool):
        return v
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
        return [enc(x) for x in v.tolist()]
    raise TypeError("enc: unsupported %r" % type(v))


# ---------------------------------------------------------------- patching
# core.py binds the modules (A, m_rl, m_ss) and looks up .detect at call
# time, so replacing the module attribute is enough - including inside the
# thread pool worker that runs _run_ac.
_REAL = {"ac": A.detect, "rl": RL.detect, "ss": SS.detect}
assert core.A is A and core.m_rl is RL and core.m_ss is SS


def install(fns):
    A.detect, RL.detect, SS.detect = fns["ac"], fns["rl"], fns["ss"]


def restore():
    install(_REAL)


# ---------------------------------------------------------------- images
def rgba_of(rgb):
    rgb = np.clip(np.asarray(rgb), 0, 255)
    a = np.full(rgb.shape[:2] + (1,), 255, np.uint8)
    return np.ascontiguousarray(np.dstack([rgb, a]).astype(np.uint8))


def upscale_nearest(native, sx, sy):
    h, w = native.shape[:2]
    Hh, Ww = int(round(h * sy)), int(round(w * sx))
    ys = np.minimum((np.arange(Hh) / sy).astype(int), h - 1)
    xs = np.minimum((np.arange(Ww) / sx).astype(int), w - 1)
    return native[ys][:, xs]


def synthetic_images():
    """Deterministic; the generator draws are consumed in a fixed order.
    Chosen by tools/probe-core-synth.py + a second probe for the branch each
    one lands on (recorded in `expect`, checked after the run)."""
    out = []
    rng = np.random.default_rng(20260909)
    pal = rng.integers(0, 256, (6, 3))
    nat = pal[rng.integers(0, 6, (20, 24))]
    _lat5 = upscale_nearest(nat, 5.0, 5.0)                      # consumed by the probe; unused here
    out.append(("syn_lattice_x4.7", rgba_of(upscale_nearest(nat, 4.7, 4.7)),
                "fast:ac+rl(S)"))
    im = Image.fromarray(nat.astype(np.uint8))
    _mush = np.array(im.resize((int(24 * 4.7), int(20 * 4.7)), Image.BILINEAR))  # probe order
    out.append(("syn_noise_96", rgba_of(rng.integers(0, 256, (96, 96, 3))),
                "fastmode:lowconf"))
    gx = np.linspace(0, 255, 96)[None, :]
    gy = np.linspace(0, 255, 80)[:, None]
    grad = np.dstack([gx + 0 * gy, 0 * gx + gy, 0.5 * (gx + gy)])
    out.append(("syn_gradient_96x80", rgba_of(grad), "fastmode:ac+ss"))
    out.append(("syn_flat_64", rgba_of(np.full((64, 64, 3), 77)), "fastmode:rl+ss"))
    natA = pal[rng.integers(0, 6, (16, 16))]
    left = upscale_nearest(natA, 4.0, 4.0)
    right = upscale_nearest(natA[:11, :11], 6.0, 6.0)[:64, :64]
    out.append(("syn_split_x4_x6", rgba_of(np.concatenate([left, right[:64, :64]], axis=1)),
                "fastmode:lowconf"))
    # noisy lattice: rl comb score drops below 0.30 while the sizes still
    # agree -> the early exit is refused on SCORE, then ac+rl pair up.
    rng7 = np.random.default_rng(7)
    pal7 = rng7.integers(0, 256, (6, 3))
    nat7 = pal7[rng7.integers(0, 6, (20, 24))]
    base7 = upscale_nearest(nat7, 5.0, 5.0).astype(np.float32)
    _n30 = rng7.normal(0, 30, base7.shape)                     # probe consumed this draw first
    n60 = base7 + rng7.normal(0, 60, base7.shape)
    out.append(("syn_noisy_lattice_x5_n60", rgba_of(n60), "fastmode:ac+rl"))
    return out


def run_real(rgba):
    rec = {"props": {}, "called": []}

    def wrap(name, fn):
        def w(*a, **k):
            rec["called"].append(name)
            r = fn(*a, **k)
            rec["props"][name] = enc(r)
            return r
        return w

    install({n: wrap(n, _REAL[n]) for n in _REAL})
    try:
        t0 = time.time()
        r = core.detect(rgba, mode="fast")
        dt = time.time() - t0
    finally:
        restore()
    return {"called": sorted(rec["called"]), "props": rec["props"],
            "result": enc(r), "detect_s": round(dt, 4)}


# ---------------------------------------------------------------- logic
def P(cols, rows, sx, sy, **kw):
    d = dict(step_x=float(sx), step_y=float(sy), cols=int(cols), rows=int(rows),
             phase_x=0.0, phase_y=0.0)
    d.update(kw)
    return d


NAN = float("nan")
FAR = P(99, 97, 1.5, 1.5)

LOGIC = [
    # id, (w, h), ac, rl, ss, expectation (prose; the recorded result is the check)
    ("early_exit_basic", (150, 100),
     P(32, 24, 4.6, 4.2), P(32, 24, 4.7, 4.1, score_x=0.5, score_y=0.6), FAR,
     "sizes agree, min score 0.5 >= 0.30 -> fast:ac+rl(S); ss must NOT be called"),
    ("early_exit_half_even", (64, 64),
     P(10, 11, 6.4, 5.8), P(11, 12, 5.8, 5.3, score_x=0.9, score_y=0.9), FAR,
     "(10+11)/2 = 10.5 -> 10 and (11+12)/2 = 11.5 -> 12 (round half to even)"),
    ("early_exit_half_even_rows", (120, 100),
     P(24, 12, 5.0, 8.3), P(24, 13, 5.0, 7.7, score_x=0.9, score_y=0.9), FAR,
     "rows (12+13)/2 = 12.5 -> 12 half-to-even, where Math.round says 13 (11.5 -> 12 under BOTH, "
     "which is why the case above cannot discriminate the row axis; found by tools/mutation-core.js)"),
    ("early_exit_score_exactly_030", (120, 90),
     P(24, 18, 5.0, 5.0), P(24, 18, 5.0, 5.0, score_x=0.30, score_y=0.31), FAR,
     "min score == 0.30 satisfies >= 0.30"),
    ("no_exit_score_below_then_ac_rl", (120, 90),
     P(24, 18, 5.01, 4.99), P(24, 18, 5.02, 5.03, score_x=0.2999, score_y=0.9), P(24, 18, 5.0, 5.0),
     "score 0.2999 refuses the exit; ss runs; first pair (ac,rl) agrees -> ac's steps verbatim"),
    ("no_exit_size_then_ac_ss", (120, 90),
     P(32, 24, 3.75, 3.75), P(35, 24, 3.4, 3.75, score_x=0.9, score_y=0.9), P(32, 24, 3.7, 3.8),
     "rl cols 35 vs 32 (tol 1) refuses the exit; (ac,rl) no, (ac,ss) yes"),
    ("rl_ss_agree_returns_rl", (120, 90),
     P(32, 24, 3.75, 3.75), P(40, 30, 3.0, 3.0, score_x=0.9, score_y=0.9), P(40, 30, 3.01, 2.99),
     "only (rl,ss) agree -> rl's step values, not ac's"),
    ("lowconf_ac", (120, 90),
     P(32, 24, 3.75, 3.75), P(40, 30, 3.0, 3.0, score_x=0.9, score_y=0.9), P(50, 50, 2.4, 1.8),
     "no pair agrees -> fastmode:lowconf with ac's values"),
    ("ac_raises_lowconf_rl", (120, 90),
     "RAISE", P(40, 30, 3.0, 3.0, score_x=0.9, score_y=0.9), P(50, 50, 2.4, 1.8),
     "ac swallowed; names = [rl, ss]; no pair -> lowconf with rl (names[0])"),
    ("ac_raises_rl_ss_agree", (120, 90),
     "RAISE", P(40, 30, 3.0, 3.0, score_x=0.9, score_y=0.9), P(40, 31, 3.01, 2.9),
     "ac swallowed; (rl,ss) agree -> fastmode:rl+ss"),
    ("ac_rl_raise_lowconf_ss", (120, 90),
     "RAISE", "RAISE", P(50, 50, 2.4, 1.8),
     "only ss survives -> lowconf with ss's values"),
    ("all_raise", (120, 90),
     "RAISE", "RAISE", "RAISE",
     "RuntimeError: all sub-detectors failed"),
    ("rl_no_score_keys", (120, 90),
     P(24, 18, 5.0, 5.0), P(24, 18, 8.0, 8.0), P(24, 18, 5.0, 5.0),
     "runlengths' no-lattice fallback dict has no score_x/score_y -> .get default 0.0 refuses the exit; then fastmode:ac+rl"),
    ("tol_asym_close_346_vs_350", (700, 700),
     P(346, 346, 2.02, 2.02), P(350, 350, 2.0, 2.0, score_x=0.9, score_y=0.9), FAR,
     "tol from b=350: round(3.5) = 4 (half-even) -> |346-350| <= 4 -> exit, cols = 348"),
    ("tol_asym_not_close_350_vs_346", (700, 700),
     P(350, 350, 2.0, 2.0), P(346, 346, 2.02, 2.02, score_x=0.9, score_y=0.9), FAR,
     "tol from b=346: round(3.46) = 3 -> |350-346| > 3 -> no exit; no pair -> lowconf"),
    ("tol_min_one_close_49_vs_50", (100, 100),
     P(49, 50, 2.04, 2.0), P(50, 50, 2.0, 2.0, score_x=0.9, score_y=0.9), FAR,
     "b=50: round(0.5) = 0 -> max(1, 0) = 1 -> |49-50| <= 1 -> exit; cols = round(49.5) = 50"),
    ("tol_min_one_not_close_48_vs_50", (100, 100),
     P(48, 50, 2.08, 2.0), P(50, 50, 2.0, 2.0, score_x=0.9, score_y=0.9), FAR,
     "|48-50| = 2 > 1 -> no exit; lowconf"),
    ("rows_mismatch_only", (120, 90),
     P(32, 24, 3.75, 3.75), P(32, 27, 3.75, 3.33, score_x=0.9, score_y=0.9), FAR,
     "cols equal, rows 24 vs 27 (tol 1) -> not close on the row axis -> lowconf"),
    ("score_nan_first", (120, 90),
     P(24, 18, 5.0, 5.0), P(24, 18, 5.0, 5.0, score_x=NAN, score_y=0.5), FAR,
     "Python min(nan, 0.5) is nan; nan >= 0.30 is False -> no exit -> fastmode:ac+rl"),
    ("score_nan_second", (120, 90),
     P(24, 18, 5.0, 5.0), P(24, 18, 5.0, 5.0, score_x=0.5, score_y=NAN), FAR,
     "Python min(0.5, nan) is 0.5 -> exit. Math.min would say NaN and refuse."),
]


def dummy_rgba(w, h, seed):
    rng = np.random.default_rng(seed)
    return rgba_of(rng.integers(0, 256, (h, w, 3)))


def run_logic(idx, cid, wh, ac, rl, ss):
    w, h = wh
    rgba = dummy_rgba(w, h, 1000 + idx)
    called = []
    props = {"ac": ac, "rl": rl, "ss": ss}

    def stub(name, val):
        def f(*a, **k):
            called.append(name)
            if isinstance(val, str) and val == "RAISE":
                raise ValueError("stub %s raised" % name)
            return dict(val)
        return f

    install({n: stub(n, props[n]) for n in props})
    try:
        try:
            r = core.detect(rgba, mode="fast")
            out = {"result": enc(r)}
        except Exception as e:  # noqa: BLE001 - the raise IS the expectation
            out = {"raises": "%s: %s" % (type(e).__name__, e)}
    finally:
        restore()
    # the ac stub is reached only after _run_ac's real preamble (to_gray,
    # median_quant, d1/d2_along, axis_estimate) ran on the dummy image; if
    # that preamble ever raised, "ac" would silently be missing and the
    # case would test a different branch than it claims to.
    if not (isinstance(ac, str) and ac == "RAISE"):
        assert "ac" in called, "%s: _run_ac preamble failed on the dummy image" % cid
    out["called"] = sorted(called)
    return out


# ---------------------------------------------------------------- main
def main():
    doc = {
        "meta": {
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "python": sys.version.split()[0],
            "numpy": np.__version__, "cv2": cv2.__version__, "PIL": PIL.__version__,
            "core_py_sha256": hashlib.sha256(open(core.__file__, "rb").read()).hexdigest(),
            "float_encoding": "f:<16 hex chars of little-endian float64 bits>; ints are JSON ints",
        },
        "images": [], "logic": [], "size_close": [],
    }

    # ---- images: real fixtures + synthetic
    inputs = []
    for name in ("tiny", "small", "mid"):
        rgba = np.array(Image.open(os.path.join(FIX, name + ".png")).convert("RGBA"))
        inputs.append((name, np.ascontiguousarray(rgba), None))
    inputs += synthetic_images()

    print("%-28s %9s  %-20s %s" % ("image", "size", "consensus", "cols x rows  step_x, step_y"))
    seen = set()
    for name, rgba, expect in inputs:
        assert rgba.dtype == np.uint8 and rgba.ndim == 3 and rgba.shape[2] == 4 and rgba.flags.c_contiguous
        h, w = rgba.shape[:2]
        rec = run_real(rgba)
        r = json.loads(json.dumps(rec["result"]))
        cons = r["consensus"]
        seen.add(cons)
        # decode for the printout only
        sx = struct.unpack("<d", bytes.fromhex(r["step_x"][2:]))[0]
        sy = struct.unpack("<d", bytes.fromhex(r["step_y"][2:]))[0]
        flag = "" if expect is None or expect == cons else "   <-- EXPECTED %s" % expect
        print("%-28s %4dx%-4d  %-20s %3d x %-3d  %.6f, %.6f  called=%s%s" % (
            name, w, h, cons, r["cols"], r["rows"], sx, sy, "+".join(rec["called"]), flag))
        doc["images"].append({
            "id": name, "w": int(w), "h": int(h), "expect": expect,
            "rgba_hex": rgba.tobytes().hex(),
            "called": rec["called"], "props": rec["props"], "result": rec["result"],
            "detect_s": rec["detect_s"],
        })

    # ---- logic
    for idx, (cid, wh, ac, rl, ss, note) in enumerate(LOGIC):
        rec = run_logic(idx, cid, wh, ac, rl, ss)
        entry = {"id": cid, "w": wh[0], "h": wh[1], "note": note,
                 "props": {"ac": enc(ac), "rl": enc(rl), "ss": enc(ss)}}
        entry.update(rec)
        doc["logic"].append(entry)
        shown = rec.get("raises") or rec["result"]["consensus"]
        print("logic %-34s -> %-40s called=%s" % (cid, shown, "+".join(rec["called"])))

    # ---- _size_close table over the tolerance's half-even points
    for base in (10, 49, 50, 51, 149, 150, 151, 249, 250, 251, 349, 350, 351, 450):
        for d in range(-5, 6):
            for dr in (0, 1, 2):
                a = {"cols": base + d, "rows": base + dr}
                b = {"cols": base, "rows": base}
                doc["size_close"].append([a["cols"], a["rows"], b["cols"], b["rows"],
                                          bool(core._size_close(a, b))])
                doc["size_close"].append([b["cols"], b["rows"], a["cols"], a["rows"],
                                          bool(core._size_close(b, a))])

    with open(OUT, "w") as f:
        json.dump(doc, f)
    print("\nwrote %s (%.1f MB): %d images, %d logic cases, %d size_close rows" % (
        OUT, os.path.getsize(OUT) / 1e6, len(doc["images"]), len(doc["logic"]),
        len(doc["size_close"])))

    need = {"fast:ac+rl(S)", "fastmode:ac+rl", "fastmode:ac+ss", "fastmode:rl+ss", "fastmode:lowconf"}
    missing = need - seen
    bad_expect = [e["id"] for e in doc["images"]
                  if e["expect"] is not None and e["expect"] != json.loads(json.dumps(e["result"]))["consensus"]]
    if missing or bad_expect:
        print("BRANCH COVERAGE FAILURE: missing=%s expectation-miss=%s" % (sorted(missing), bad_expect))
        return 1
    print("branch coverage over the image population: all 5 fast-mode consensus strings reached")
    return 0


if __name__ == "__main__":
    sys.exit(main())
