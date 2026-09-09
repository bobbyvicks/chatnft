"""Ground-truth fixtures for src/pf-21-runlengths.js -> fixtures/runlengths-parity.json.

Runs the PRISTINE reference (pixelfixer.runlengths, imported from the venv)
on the three image fixtures plus synthetic images and synthetic run arrays,
and dumps every function's inputs and outputs. Floats are dumped as
lowercase hex of their raw little-endian bytes (float32 or float64 as
tagged) so the JSON round trip cannot lose a bit.

Sections tagged "diag_" are intermediates obtained by re-running the
reference's own lines here (copied, not re-derived); they exist to LOCATE a
mismatch, never to certify one -- the authoritative comparisons are the
return values of the reference functions themselves.

Run with the pafenv interpreter:
  pafenv/Scripts/python.exe tools/parity-runlengths.py
"""
import json
import os
import platform
import struct
import sys
import time

import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(ROOT)), "pixel-art-fixer", "python"))
from pixelfixer import runlengths as RL   # noqa: E402

f32, f64 = np.float32, np.float64


def hexf64(a):
    return np.ascontiguousarray(np.asarray(a, f64)).tobytes().hex()


def hexf32(a):
    a = np.asarray(a)
    assert a.dtype == f32, a.dtype
    return np.ascontiguousarray(a).tobytes().hex()


def hexu8(a):
    a = np.asarray(a)
    assert a.dtype == np.uint8, a.dtype
    return np.ascontiguousarray(a).tobytes().hex()


def opt(x):
    return None if x is None else float(x)


def opthex(x):
    return None if x is None else hexf64([x])


def load(name):
    return np.asarray(Image.open(os.path.join(FIX, name + ".png")).convert("RGBA"))


rng = np.random.default_rng(12345)
S_GRID = np.arange(RL.S_MIN, RL.S_MAX, 0.01)


# ------------------------------------------------------------ synthetic images
def upscale_nn(img, f):
    h, w = img.shape[:2]
    H, W = int(round(h * f)), int(round(w * f))
    ys = np.minimum((np.arange(H) / f).astype(int), h - 1)
    xs = np.minimum((np.arange(W) / f).astype(int), w - 1)
    return np.ascontiguousarray(img[ys][:, xs])


def synth_images():
    out = {}
    pal = rng.integers(0, 256, (6, 3))
    art = pal[rng.integers(0, 6, (9, 12))]
    rgba = np.dstack([art, np.full((9, 12), 255)]).astype(np.uint8)
    out["synth_grid5"] = upscale_nn(rgba, 5.0)
    out["synth_grid47"] = upscale_nn(rgba, 4.7)
    out["synth_grid238"] = upscale_nn(rgba, 2.38)   # below-3px cells, near S_MIN
    # jittered non-integer grid with per-row phase wobble (mushy AI-style)
    big = upscale_nn(rgba, 6.38)
    jit = big.copy()
    for r in range(jit.shape[0]):
        sh = int(rng.integers(-1, 2))
        jit[r] = np.roll(big[r], sh, axis=0)
    out["synth_grid638_jitter"] = jit
    # stripes: boundaries along one axis only -> the other axis is None
    cols = pal[(np.arange(50) // 4) % 6]
    v = np.repeat(cols[None, :, :], 40, axis=0)
    out["synth_vstripes"] = np.dstack([v, np.full((40, 50), 255)]).astype(np.uint8)
    rows = pal[(np.arange(44) // 4) % 6]
    hh = np.repeat(rows[:, None, :], 36, axis=1)
    out["synth_hstripes"] = np.dstack([hh, np.full((44, 36), 255)]).astype(np.uint8)
    out["synth_flat"] = np.tile(np.array([100, 150, 200, 255], np.uint8), (30, 30, 1))
    out["synth_w1"] = rng.integers(0, 256, (20, 1, 4)).astype(np.uint8)
    out["synth_h1"] = rng.integers(0, 256, (1, 20, 4)).astype(np.uint8)
    out["synth_noise"] = rng.integers(0, 256, (40, 40, 4)).astype(np.uint8)
    # alpha-only structure: RGB constant, alpha steps every 6 px both ways
    a = ((np.arange(48)[:, None] // 6 + np.arange(54)[None, :] // 6) % 2 * 200 + 30).astype(np.uint8)
    out["synth_alpha_only"] = np.dstack([np.full((48, 54), 77, np.uint8), np.full((48, 54), 12, np.uint8),
                                         np.full((48, 54), 200, np.uint8), a])
    # rectangular cells: 4 wide, 7 tall -> non-square, defeats the pooling
    art2 = pal[rng.integers(0, 6, (8, 14))]
    r2 = np.dstack([art2, np.full((8, 14), 255)]).astype(np.uint8)
    out["synth_rect4x7"] = np.ascontiguousarray(np.repeat(np.repeat(r2, 7, axis=0), 4, axis=1))
    return out


# --------------------------------------------------------------- diag helpers
def diag_boundaries(img4, axis):
    """runlengths._boundaries lines 61-74, copied, to expose d / p95 / thr."""
    if axis == 0:
        img4 = np.transpose(img4, (1, 0, 2))
    d = np.abs(np.diff(img4, axis=1)).sum(axis=2)
    if d.size == 0:
        return None
    d = cv2.boxFilter(d, -1, (1, RL.COHERENCE), borderType=cv2.BORDER_REPLICATE)
    p95 = np.percentile(d[d > 0], 95) if (d > 0).any() else 0.0
    thr = max(20.0, RL.THR_FRAC * p95)
    left = np.empty_like(d); left[:, 0] = 0; left[:, 1:] = d[:, :-1]
    right = np.empty_like(d); right[:, -1] = 0; right[:, :-1] = d[:, 1:]
    mask = (d > thr) & (d > left) & (d >= right)
    return {"d_f32": hexf32(d), "d_shape": list(d.shape), "p95_f64": hexf64([float(p95)]),
            "p95_is_f32": isinstance(p95, np.float32), "thr": float(thr), "n_mask": int(mask.sum())}


def diag_refine(runs, s):
    """runlengths._refine lines 161-177, copied, to expose the stages."""
    if runs.size == 0:
        return None
    hist, centers = RL._hist(runs, 0.05)
    fine = np.arange(0.94 * s, 1.06 * s, 0.002)
    wk = centers / s
    Sf = ((hist * wk)[:, None] * np.cos(2 * np.pi * centers[:, None] / fine[None, :])).sum(0)
    am = int(np.argmax(Sf))
    s1 = float(fine[am])
    stages = [s1]
    s = s1
    for _ in range(2):
        k = np.round(runs / s)
        ok = k >= 1
        res = np.abs(runs - k * s)
        w = np.clip(1.0 - res / (0.30 * s), 0, 1) * ok * k
        den = (w * k * k).sum()
        if den <= 0:
            stages.append(None)
            break
        s = float((w * k * runs).sum() / den)
        stages.append(s)
    return {"fine_len": int(len(fine)), "fine_f64": hexf64(fine), "Sf_f64": hexf64(Sf),
            "argmax": am, "stages_f64": [opthex(x) for x in stages]}


def diag_pick(runs, s_grid):
    """runlengths._pick_step lines 126-138, copied: the argsort tie question."""
    S, total = RL._comb_score(runs, s_grid)
    if total < 50:
        return {"total": float(total), "reason": "total<50"}
    loc = np.zeros(S.shape, bool)
    loc[1:-1] = (S[1:-1] > S[:-2]) & (S[1:-1] >= S[2:])
    idx = np.nonzero(loc)[0]
    if idx.size == 0:
        return {"total": float(total), "reason": "no local maxima"}
    vals = S[idx]
    default = np.argsort(vals)[::-1]
    stable = np.argsort(vals, kind="stable")[::-1]
    return {"total": float(total), "n_locmax": int(idx.size),
            "locmax_scores_distinct": bool(len(np.unique(vals)) == len(vals)),
            "default_argsort_equals_stable": bool(np.array_equal(default, stable)),
            "order_default": [int(i) for i in idx[default]],
            "S_idx_f64": hexf64(vals)}


def diag_integrate(ys, pos, n_perp, n_scan, s0):
    """runlengths._integrate_step lines 204-217, copied: per-tile peaks."""
    tiles = []
    for tp, tsc in RL.TILINGS:
        ye = np.linspace(0, n_perp, tp + 1)
        xe = np.linspace(0, n_scan, tsc + 1)
        for i in range(tp):
            rows_m = (ys >= ye[i]) & (ys < ye[i + 1])
            for j in range(tsc):
                m = rows_m & (pos >= xe[j]) & (pos < xe[j + 1])
                dd = RL._lag_diffs(ys[m], pos[m])
                s_i = RL._tile_peak(dd, s0)
                tiles.append({"tiling": [tp, tsc], "i": i, "j": j, "ndiffs": int(dd.size),
                              "peak": opt(s_i), "peak_f64": opthex(s_i)})
    return tiles


# ------------------------------------------------------------------ per image
def run_image(name, rgba):
    t0 = time.time()
    h, w = rgba.shape[:2]
    case = {"name": name, "w": int(w), "h": int(h), "rgba_u8": hexu8(rgba)}
    img4 = RL._prep(rgba)
    assert img4.dtype == f32 and img4.shape == (h, w, 4)
    case["img4_f32"] = hexf32(img4)
    axes = {}
    for axis, an in ((1, "x"), (0, "y")):
        ys, pos = RL._boundaries(img4, axis)
        assert pos.dtype == f64
        runs = RL._lag_diffs(ys, pos)
        assert runs.dtype == f32
        S, total = RL._comb_score(runs, S_GRID)
        s, v, cands = RL._pick_step(runs, S_GRID)
        refined = RL._refine(runs, s) if s is not None else None
        ax = {"axis": axis, "ys": [int(y) for y in ys], "pos_f64": hexf64(pos), "runs_f32": hexf32(runs),
              "nruns": int(runs.size), "comb_S_f64": hexf64(S), "comb_total": float(total),
              "pick": {"s": opt(s), "s_f64": opthex(s), "v": float(v), "v_f64": hexf64([v]),
                       "cands": [[float(a), float(b)] for a, b in cands],
                       "cands_f64": [[hexf64([a]), hexf64([b])] for a, b in cands]},
              "refine_f64": opthex(refined), "refine": opt(refined),
              "diag_boundaries": diag_boundaries(img4, axis),
              "diag_pick": diag_pick(runs, S_GRID),
              "diag_refine": diag_refine(runs, s) if s is not None else None}
        for bw in (0.25, 0.05):
            hist, centers = RL._hist(runs, bw)
            ax["hist_%s" % bw] = {"hist": [int(x) for x in hist], "centers_f32": hexf32(centers)}
        # _integrate_step with the axis's own refined step (if any) and a fixed one
        n_perp, n_scan = (h, w) if axis == 1 else (w, h)
        ax["integrate"] = []
        for s0 in ([refined] if refined is not None else []) + [5.0]:
            si = RL._integrate_step(ys, pos, n_perp, n_scan, s0)
            ax["integrate"].append({"s0_f64": hexf64([s0]), "n_perp": n_perp, "n_scan": n_scan,
                                    "out_f64": hexf64([si]), "out": float(si),
                                    "diag_tiles": diag_integrate(ys, pos, n_perp, n_scan, s0)})
        axes[an] = ax
    case["axes"] = axes
    det = RL.detect(rgba)
    case["detect"] = {k: (v if not isinstance(v, (np.floating, np.integer)) else v.item()) for k, v in det.items()}
    case["detect"]["candidates"] = [[float(a), float(b)] for a, b in det["candidates"]]
    case["detect_hex"] = {k: hexf64([det[k]]) for k in ("step_x", "step_y", "phase_x", "phase_y", "score_x", "score_y") if k in det}
    case["detect_hex"]["candidates"] = [[hexf64([a]), hexf64([b])] for a, b in det["candidates"]]
    case["detect_keys"] = sorted(det.keys())
    case["secs"] = round(time.time() - t0, 3)
    print("  %-22s %4dx%-4d  det step=(%s, %s) cols/rows=(%s, %s) nruns=(%s, %s)  %.2fs" % (
        name, w, h, det["step_x"], det["step_y"], det["cols"], det["rows"],
        det.get("nruns_x"), det.get("nruns_y"), case["secs"]))
    return case


# ------------------------------------------------------------- direct arrays
def synth_runs():
    out = {}
    k = rng.choice([1, 2, 3, 4, 5, 6], 3000, p=[0.45, 0.25, 0.15, 0.08, 0.05, 0.02])
    r = k * 4.7 + rng.normal(0, 0.15, 3000)
    out["runs_lattice47"] = np.clip(r, 2.0, 64.0).astype(f32)
    out["runs_small30"] = (rng.choice([1, 2, 3], 30) * 5.0 + rng.normal(0, 0.1, 30)).astype(f32)
    out["runs_empty"] = np.empty(0, f32)
    out["runs_int3"] = (rng.choice([1, 2, 3, 4], 900) * 3.0).astype(f32)      # perfect lattice, integer runs
    out["runs_alias6"] = (rng.choice([1, 2, 3], 700) * 6.0 + rng.normal(0, 0.05, 700)).astype(f32)
    # values sitting exactly on float32 bin edges (both bin counts) and one ulp either side
    e257 = np.linspace(0, 64, 258, dtype=f32)
    e1281 = np.linspace(0, 64, 1282, dtype=f32)
    pick = np.concatenate([e257[9:258:7], e1281[41:1282:37]])
    pick = pick[(pick >= 2) & (pick <= 64)]
    out["runs_on_edges"] = np.concatenate([pick, np.nextafter(pick, f32(0)), np.nextafter(pick, f32(100))]).astype(f32)
    out["runs_349"] = (rng.choice([1, 2], 349) * 4.0 + rng.normal(0, 0.1, 349)).astype(f32)
    out["runs_350"] = (rng.choice([1, 2], 350) * 4.0 + rng.normal(0, 0.1, 350)).astype(f32)
    out["runs_big_step"] = np.clip(rng.choice([1, 2], 2000) * 24.0 + rng.normal(0, 0.3, 2000), 2, 64).astype(f32)
    out["runs_uniform"] = rng.uniform(2, 64, 2500).astype(f32)                  # no lattice at all
    return out


def run_arrays():
    cases = []
    for name, runs in synth_runs().items():
        c = {"name": name, "runs_f32": hexf32(runs), "n": int(runs.size)}
        for bw in (0.25, 0.05):
            hist, centers = RL._hist(runs, bw)
            c["hist_%s" % bw] = {"hist": [int(x) for x in hist], "centers_f32": hexf32(centers)}
        S, total = RL._comb_score(runs, S_GRID)
        c["comb"] = {"S_f64": hexf64(S), "total": float(total)}
        s, v, cands = RL._pick_step(runs, S_GRID)
        c["pick"] = {"s": opt(s), "s_f64": opthex(s), "v": float(v), "v_f64": hexf64([v]),
                     "cands_f64": [[hexf64([a]), hexf64([b])] for a, b in cands]}
        c["diag_pick"] = diag_pick(runs, S_GRID)
        c["refine"] = []
        for s0 in [4.7, 4.5, 9.4, 2.35, 3.0, 6.0, 24.0] + ([s] if s is not None else []):
            rr = RL._refine(runs, s0)
            c["refine"].append({"s0_f64": hexf64([s0]), "out_f64": hexf64([rr]), "out": float(rr),
                                "diag": diag_refine(runs, s0)})
        c["tile_peak"] = []
        for s0 in [4.7, 4.0, 5.6, 9.4, 3.0, 6.0, 24.0, 2.2]:
            tp = RL._tile_peak(runs, s0)
            c["tile_peak"].append({"s0_f64": hexf64([s0]), "out": opt(tp), "out_f64": opthex(tp)})
        cases.append(c)
        print("  %-18s n=%-5d pick s=%s v=%.4f" % (name, runs.size, s, v))
    # _lag_diffs on a hand-built (ys, pos) with a max_lag override
    ys = np.array([0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 5, 5, 5, 7], np.int64)
    pos = np.array([1.0, 3.5, 4.25, 9.0, 80.0, 0.5, 66.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 100.0, 3.0], f64)
    lag = []
    for ml in (None, 1, 2, 6):
        d = RL._lag_diffs(ys, pos) if ml is None else RL._lag_diffs(ys, pos, ml)
        lag.append({"max_lag": ml, "out_f32": hexf32(d), "n": int(d.size)})
    return cases, {"ys": [int(y) for y in ys], "pos_f64": hexf64(pos), "cases": lag}


# ------------------------------------------------------------------- np.cos
def cos_table(tiny_case):
    """np.cos on (a) 50k random arguments in the comb's range and (b) the
    actual arguments of the tiny fixture's axis-x selection comb."""
    a = rng.uniform(0, 210, 50000)
    runs = np.frombuffer(bytes.fromhex(tiny_case["axes"]["x"]["runs_f32"]), f32)
    hist, centers = RL._hist(runs, RL.BIN)
    args = (2 * np.pi * centers[:, None] / S_GRID[None, :]).ravel()
    allargs = np.concatenate([a, args])
    return {"n_random": int(a.size), "n_comb": int(args.size),
            "args_f64": hexf64(allargs), "cos_f64": hexf64(np.cos(allargs))}


def main():
    t0 = time.time()
    fx = {"meta": {"numpy": np.__version__, "cv2": cv2.__version__, "python": platform.python_version(),
                   "machine": platform.machine(), "s_grid_len": int(S_GRID.size), "s_grid_f64": hexf64(S_GRID),
                   "constants": {"S_MIN": RL.S_MIN, "S_MAX": RL.S_MAX, "RUN_MIN": RL.RUN_MIN, "RUN_MAX": RL.RUN_MAX,
                                 "BIN": RL.BIN, "COHERENCE": RL.COHERENCE, "THR_FRAC": RL.THR_FRAC,
                                 "MAX_LAG": RL.MAX_LAG, "TILINGS": [list(t) for t in RL.TILINGS]},
                   "nb_025": int(RL.RUN_MAX / 0.25) + 1, "nb_005": int(RL.RUN_MAX / 0.05) + 1}}
    print("images:")
    images = []
    for name in ("tiny", "small", "mid"):
        images.append(run_image(name, load(name)))
    for name, rgba in synth_images().items():
        images.append(run_image(name, rgba))
    fx["images"] = images
    print("arrays:")
    fx["arrays"], fx["lag_diffs"] = run_arrays()
    fx["cos"] = cos_table(images[0])
    out = os.path.join(FIX, "runlengths-parity.json")
    with open(out, "w") as f:
        json.dump(fx, f)
    print("wrote %s (%.1f MB) in %.1fs" % (out, os.path.getsize(out) / 1e6, time.time() - t0))


if __name__ == "__main__":
    main()
