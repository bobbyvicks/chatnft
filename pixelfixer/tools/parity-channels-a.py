"""Ground truth for src/pf-30-channels-a.js (channels.py lines 1-825).

Writes fixtures/channels-a-<name>-parity.json, ONE IMAGE PER PROCESS: with no
argument this script re-runs itself once per image. The reference's k-means
runs on OpenCV's process-global, never-seeded RNG, so only the first
kmeans_quantize of a fresh process is reproducible; this module does not
call k-means itself, but its inputs (the quantized image) come from it.

Inputs are taken through the reference's OWN call paths, not re-derived:
  * core.detect(mode="full")'s path: fusion.build_evidence(rgba, lean=True)
    then fusion.channel_matrix(ev, axis, ladder, only=ACTIVE_CHANNELS).
  * channels.fit_grid(rgba): the four _AxisEvidence objects it builds are
    captured by wrapping channels.estimate_axis_ev (it is looked up as a
    module global), and every _evidence_refine_step call it makes is
    logged with its argument's Python TYPE (np.float64 vs float), which
    decides how round(x, 4) behaves.
kmeans_quantize is wrapped (in both modules that bind it) only to RECORD
the quantized image it returns; it draws the same random numbers.

Sections named diag_* re-run the reference's own lines here (copied) to
expose an internal value such as an argsort permutation; they LOCATE a
mismatch, the authoritative values are the reference functions' returns.

Floats are dumped as little-endian hex (float64 unless tagged) so the JSON
round trip cannot lose a bit; big byte blobs as zlib+base64.

Also:  --libm <queries.json> <table.json>   answers the JS test's requests
for numpy's transcendental outputs (np.exp of an imaginary array,
np.angle, np.log10, np.float64 ** 2) and merges them into <table.json>.
       --synth                               writes fixtures/channels-a-synth-parity.json

Run with the reference venv:
  <scratchpad>/pafenv2/Scripts/python.exe tools/parity-channels-a.py
"""
import base64
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
import zlib

import numpy as np
import cv2
import scipy
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
SCR = os.path.dirname(os.path.dirname(ROOT))          # .../scratchpad
REF = os.path.join(SCR, "paf-ref", "python")
EXAMPLES = os.path.join(SCR, "paf-ref", "examples")
sys.path.insert(0, REF)
import pixelfixer                                      # noqa: E402
assert os.path.normcase(os.path.abspath(pixelfixer.__file__)).startswith(
    os.path.normcase(os.path.abspath(REF))), pixelfixer.__file__
from pixelfixer import channels as CH                  # noqa: E402
from pixelfixer import fusion as FU                    # noqa: E402
from pixelfixer import quantize as Q                   # noqa: E402

IMAGES = {
    "tiny": os.path.join(FIX, "tiny.png"),
    "small": os.path.join(FIX, "small.png"),
    "mid": os.path.join(FIX, "mid.png"),
    "dragon": os.path.join(EXAMPLES, "dragon.png"),
    "frog": os.path.join(EXAMPLES, "frog.png"),
    "koi-pond": os.path.join(EXAMPLES, "koi-pond.png"),
    "lighthouse": os.path.join(EXAMPLES, "lighthouse.png"),
}


# ------------------------------------------------------------------ encoding
def h64(a):
    return np.ascontiguousarray(np.asarray(a, np.float64)).astype("<f8").tobytes().hex()


def s64(x):
    return None if x is None else h64([float(x)])


def b64z(b):
    return base64.b64encode(zlib.compress(b, 6)).decode("ascii")


def sha32(a):
    a = np.ascontiguousarray(a)
    assert a.dtype == np.float32, a.dtype
    return hashlib.sha256(a.astype("<f4").tobytes()).hexdigest()


def is_np(x):
    return bool(isinstance(x, np.floating))


def tiles_out(tiles):
    return [[h64(p), h64(h), int(ext)] for p, h, ext in tiles]


def pair(t):
    return [s64(t[0]), s64(t[1])]


# ------------------------------------------------------------------ per image
def run_image(name):
    t0 = time.time()
    rgba = np.array(Image.open(IMAGES[name]).convert("RGBA"))   # api._load's PNG path
    h, w = rgba.shape[:2]
    out = {"name": name, "w": int(w), "h": int(h), "rgba_z": b64z(rgba.tobytes())}

    rec = []
    orig_kq = Q.kmeans_quantize

    def rec_kq(img, *a, **k):
        r = orig_kq(img, *a, **k)
        rec.append(np.ascontiguousarray(r[0]).copy())
        return r
    Q.kmeans_quantize = rec_kq
    FU.kmeans_quantize = rec_kq

    # ================= core.detect(mode="full")'s evidence: FIRST k-means
    ev = FU.build_evidence(rgba, lean=True)
    q = rec[0]
    out["q_lean_z"] = b64z(q.tobytes())
    out["flat_sha"] = {"rgba": sha32(CH._flatten_channels(rgba)), "q": sha32(CH._flatten_channels(q))}
    prof_q = CH.axis_profiles(q)
    prof_o = CH.axis_profiles(rgba)
    out["prof_q"] = {k: h64(v) for k, v in prof_q.items()}
    out["prof_o"] = {k: h64(v) for k, v in prof_o.items()}
    raw = {"e1x": prof_q["e1x"], "e1y": prof_q["e1y"], "e2x": prof_o["e2x"], "e2y": prof_o["e2y"]}
    out["normalise"] = {k: h64(CH._normalise(v)) for k, v in raw.items()}
    out["jpeg_strength"] = {k: s64(CH._jpeg_lattice_strength(v)) for k, v in raw.items()}
    out["jpeg_z"] = s64(ev["jpeg_z"])
    nj = {}
    for k, v in raw.items():
        r = CH._notch_jpeg(v)
        nj[k] = {"same": r is v, "out": h64(r)}
        r2 = CH._notch_jpeg(v, width=2.5)
        nj[k + "_w25"] = {"same": r2 is v, "out": h64(r2)}
    out["notch"] = nj
    gm = CH._grad_maps(rgba, q)
    out["grad_sha"] = {k: {"sha": sha32(v), "shape": list(v.shape)} for k, v in gm.items()}
    tiles_extra = {
        "dqx_a0_mt7_off0": tiles_out(CH._tile_peaks(gm["dqx"], axis=0, offset=0, max_tiles=7)),
        "dqy_a1_mt5": tiles_out(CH._tile_peaks(gm["dqy"], axis=1, max_tiles=5)),
    }
    out["tiles_extra"] = tiles_extra
    spec_extra = {}
    for key, dm, ax in (("dqx", gm["dqx"], 0), ("dqy", gm["dqy"], 1), ("coy", gm["coy"], 1)):
        f, p = CH._axis_spectrum([dm], axis=ax, row_group=8, max_win=64)
        spec_extra[key + "_rg8_w64"] = {"freqs": h64(f), "power": h64(p)}
    out["spec_extra"] = spec_extra

    steps = FU.ladder()
    out["ladder"] = h64(steps)
    lean = {}
    for ax in ("x", "y"):
        A = ev[ax]
        pp1, pp2 = CH._PooledProfile(A["e1"]), CH._PooledProfile(A["e2"])
        mat = FU.channel_matrix(ev, ax, steps, only=FU.ACTIVE_CHANNELS)
        c = FU.fused_curve(mat)
        m = float(np.max(c))
        curve = c / m if m > 0 else c
        per = {"ray1": [], "ray2": [], "tile1": [], "tile2": [], "spec1": [], "spec2": [],
               "comb1": [], "comb2": [], "lat1": [], "jpeg": []}
        for s in steps:
            r1 = CH._rayleigh_score(A["e1"], s)
            per["ray1"].append(pair(r1))
            per["ray2"].append(pair(CH._rayleigh_score(A["e2"], s)))
            per["tile1"].append(s64(CH._tiles_ray_z(A["tiles1"], s)))
            per["tile2"].append(s64(CH._tiles_ray_z(A["tiles2"], s)))
            per["spec1"].append(s64(CH._spectral_z(*A["spec1"], s)))
            per["spec2"].append(s64(CH._spectral_z(*A["spec2"], s)))
            per["comb1"].append(pair(CH._comb_score(pp1, s)))
            per["comb2"].append(pair(CH._comb_score(pp2, s)))
            s0 = float(s)
            lr = CH._lattice_refine(A["e1"], s0)
            per["lat1"].append([s64(lr), lr is s0])
            per["jpeg"].append([bool(CH.is_jpeg_suspect(s)), bool(CH.is_jpeg_lattice(s, r1[1])),
                                bool(CH.is_jpeg_lattice(s, 0.3)), bool(CH.is_jpeg_lattice(s, s - 0.2))])
        lean[ax] = {
            "e1": h64(A["e1"]), "e2": h64(A["e2"]),
            "tiles1": tiles_out(A["tiles1"]), "tiles2": tiles_out(A["tiles2"]),
            "spec1": [h64(x) for x in A["spec1"]], "spec2": [h64(x) for x in A["spec2"]],
            "mat": h64(mat), "mat_shape": list(mat.shape), "curve": h64(curve),
            "fu_step": s64(steps[int(np.argmax(curve))]),
            "pp1": {str(p): [h64(v[0]), s64(v[1]), s64(v[2])] for p, v in pp1.variants.items()},
            "per_step": per,
        }
    out["lean"] = lean
    out["channels"] = FU.CHANNELS
    out["active"] = FU.ACTIVE_CHANNELS

    # ================= channels.fit_grid: SECOND k-means (own quantized, recorded)
    evs, ers_calls, rs_calls = [], [], []
    orig_eae, orig_ers = CH.estimate_axis_ev, CH._evidence_refine_step

    def rec_eae(ev1, ev2, min_step=2.0):
        evs.append(ev1)
        evs.append(ev2)
        return orig_eae(ev1, ev2, min_step=min_step)

    def rec_ers(evx, step):
        r = orig_ers(evx, step)
        ers_calls.append((id(evx), float(step), is_np(step), r))
        return r
    CH.estimate_axis_ev = rec_eae
    CH._evidence_refine_step = rec_ers
    try:
        g = CH.fit_grid(rgba)
    finally:
        CH.estimate_axis_ev = orig_eae
        CH._evidence_refine_step = orig_ers
    out["q_fit_z"] = b64z(rec[1].tobytes())
    out["n_kmeans"] = len(rec)
    out["fit_grid"] = {"step_x": g.step_x, "step_y": g.step_y, "mode_x": g.mode_x, "mode_y": g.mode_y}

    fit = []
    for k, e in enumerate(evs):
        n = len(e.profile) - 1
        max_step = min(max(4.0, n / 8.0), 64.0)
        coarse = []
        s = 2.0
        while s <= max_step:
            coarse.append(float(s))
            s += 0.5 if s < 16 else 1.0
        sweep = []
        s = 2.0
        while s <= max_step:
            sweep.append(s)
            s *= 1.02
        zs = np.array([e._ray_quick(s) for s in sweep])
        order = np.argsort(-zs)
        cand = e.candidate_steps(2.0, max_step)
        comp = {"spacing_global": CH._spacing_candidates(e.profile, 2.0, max_step),
                "spacing_bands": [CH._spacing_candidates(b, 2.0, max_step) for b in e.bands],
                "tile_modes": CH._tile_spacing_modes(e.tiles, 2.0, max_step),
                "spectral": (CH._spectral_candidates(e.freqs, e.power, e.bg, 2.0, max_step)
                             if e.freqs is not None else None),
                "sweep": e.sweep_candidates(2.0, max_step)}
        # diag: _spectral_candidates' argsort (lines 632-642, copied)
        diag_spec = None
        if e.freqs is not None and len(e.freqs) >= 8:
            from scipy.signal import find_peaks
            resid = 6.0 * np.log10(np.maximum(e.power, 1e-12) / (e.bg + 1e-12))
            pk, props = find_peaks(resid, height=4.0)
            if len(pk):
                hts = props["peak_heights"]
                per = np.where(e.freqs[pk] > 0, 1.0 / np.maximum(e.freqs[pk], 1e-9), 0.0)
                ok = (per >= 2.0) & (per <= max_step)
                hts = hts[ok]
                diag_spec = {"heights": h64(hts), "order": [int(i) for i in np.argsort(-hts)],
                             "stable": [int(i) for i in np.argsort(-hts, kind="stable")]}
        refine_at = sorted(set(coarse[::3] + [float(c) for c in cand]))
        mine = [c for c in ers_calls if c[0] == id(e)]
        fit.append({
            "profile": h64(e.profile),
            "bands": None if e.bands.shape[0] == 0 else {"d": h64(e.bands), "h": int(e.bands.shape[0]),
                                                        "w": int(e.bands.shape[1])},
            "tiles": tiles_out(e.tiles),
            "spectrum": None if e.freqs is None else [h64(e.freqs), h64(e.power)],
            "extra_candidates": [s64(x) for x in e.extra_candidates],
            "extra_is_np": [is_np(x) for x in e.extra_candidates],
            "extra_z_is_none": e.extra_z is None,
            "max_step": max_step,
            "pp_global": {str(p): [h64(v[0]), s64(v[1]), s64(v[2])] for p, v in e.pp_global.variants.items()},
            "bg": None if e.bg is None else h64(e.bg),
            "peaks": [[h64(p), h64(hh), int(nn)] for p, hh, nn in e._peaks],
            "coarse": h64(coarse),
            "score_coarse": [pair(e.score(s)) for s in coarse],
            "sweep_steps": h64(sweep), "ray_quick": h64(zs),
            "diag_sweep_order": [int(i) for i in order],
            "diag_sweep_stable": [int(i) for i in np.argsort(-zs, kind="stable")],
            "candidate_steps": [s64(x) for x in cand],
            "candidate_is_np": [is_np(x) for x in cand],
            "components": {k2: (None if v is None else
                                ([[s64(x) for x in vv] for vv in v] if k2 == "spacing_bands"
                                 else [s64(x) for x in v])) for k2, v in comp.items()},
            "diag_spectral_order": diag_spec,
            "refine_at": h64(refine_at),
            "refine": [s64(e.refine(s)) for s in refine_at],
            "ers_calls": [[s64(st), isn, s64(r[0]), s64(r[1]), s64(r[2]), is_np(r[0])]
                          for _id, st, isn, r in mine],
        })
    out["fit_evs"] = fit

    # ================= estimate_period (dead in the reference, ported) + _refine_step log
    rs_log = []
    orig_rs = CH._refine_step

    def rec_rs(pp, profile, step):
        r = orig_rs(pp, profile, step)
        rs_log.append([s64(step), is_np(step), s64(r[0]), s64(r[1]), s64(r[2]), is_np(r[0])])
        return r
    CH._refine_step = rec_rs
    ep = []
    try:
        for k, e in enumerate(evs):
            rs_log.clear()
            r = CH.estimate_period(e.profile)
            pp = CH._PooledProfile(e.profile)
            n = len(e.profile) - 1
            max_step = min(max(4.0, n / 8.0), 64.0)
            st = []
            s = 2.0
            while s <= max_step:
                st.append(float(s))
                s += 0.5 if s < 16 else 1.0
            sc = np.array([CH._comb_score(pp, s)[0] for s in st])
            ep.append({"which": k, "result": [s64(r[0]), s64(r[1]), s64(r[2]), is_np(r[0])],
                       "refine_calls": list(rs_log),
                       "diag_scores": h64(sc), "diag_order": [int(i) for i in np.argsort(-sc)],
                       "diag_stable": [int(i) for i in np.argsort(-sc, kind="stable")]})
            # the same with a different harmonic_tol and an explicit max_step
            r2 = CH.estimate_period(e.profile, min_step=3.0, max_step=20.0, harmonic_tol=0.7)
            ep[-1]["result_alt"] = [s64(r2[0]), s64(r2[1]), s64(r2[2]), is_np(r2[0])]
    finally:
        CH._refine_step = orig_rs
    out["estimate_period"] = ep
    out["secs"] = round(time.time() - t0, 2)
    return out


# ------------------------------------------------------------------ synthetic
def run_synth():
    rng = np.random.default_rng(20260927)
    out = {}
    # Python float hash + set iteration order, and round(x, 4) by type
    vals = list(rng.uniform(1.9, 70, 400)) + [round(v, 4) / d for v in rng.uniform(2, 64, 200) for d in (2, 3, 4)]
    vals += [2.0, 2.5, 8.0, 1e-300, 5e-324, 123456789.123, 0.1, 1.0 / 3.0]
    vals = [float(v) for v in vals] + [-float(v) for v in vals[:50]]
    out["hash"] = [[s64(v), str(hash(v))] for v in vals]
    pairs = []
    for i in range(0, 600, 2):
        a, b = float(vals[i]), float(vals[i + 1])
        if i % 10 == 0:
            b = a                                  # duplicates
        pairs.append([s64(a), s64(b), [s64(x) for x in {a, b}]])
    # force slot collisions: pick b with hash(b) & 7 == hash(a) & 7
    pool = [float(v) for v in rng.uniform(2, 64, 4000)]
    for a in pool[:60]:
        for b in pool[60:]:
            if (hash(b) & 7) == (hash(a) & 7) and a != b:
                pairs.append([s64(a), s64(b), [s64(x) for x in {a, b}]])
                break
    trip = []
    for i in range(0, 90, 3):
        a, b, c = pool[i], pool[i + 1], pool[i + 2]
        s = {a}
        s.add(b)
        s.add(c)
        trip.append([s64(a), s64(b), s64(c), [s64(x) for x in s]])
    out["set_pairs"] = pairs
    out["set_triples"] = trip
    rv = [float(v) for v in vals if v > 0]
    out["round4"] = [[s64(v), s64(round(v, 4)), s64(float(round(np.float64(v), 4)))] for v in rv]

    # _normalise / _notch_jpeg / _jpeg_lattice_strength edge cases
    profs = {
        "zeros": np.zeros(40), "len1": np.array([3.0]), "len2": np.array([1.0, 2.0]),
        "len3": np.array([0.0, 5.0, 1.0]), "len9": rng.uniform(0, 5, 9),
        "neg_interior": np.concatenate([[1.0], -rng.uniform(0, 1, 30), [1.0]]),
        "spiky": np.where(np.arange(120) % 6 == 0, 9.0, 0.5) + rng.uniform(0, 0.2, 120),
        "jpeg8": np.where(np.arange(161) % 8 == 0, 10.0, 1.0) + rng.uniform(0, 0.5, 161),
        "rand200": rng.uniform(0, 100, 201),
    }
    pe = {}
    for k, v in profs.items():
        v = np.asarray(v, np.float64)
        e = {"in": h64(v), "norm": h64(CH._normalise(v)),
             "notch": h64(CH._notch_jpeg(v)), "notch_same": CH._notch_jpeg(v) is v,
             "jls": s64(CH._jpeg_lattice_strength(v))}
        if len(v) >= 3:
            pp = CH._PooledProfile(v)
            e["comb"] = [[s64(s)] + pair(CH._comb_score(pp, s)) for s in
                         [1.0, 1.25, 1.3, 2.0, 2.37, 3.5, 4.0, 5.5, 6.0, 8.0, 11.9, 12.0, 17.3, 18.4, 30.0, 46.1, 50.0]]
            e["comb_res"] = [[s64(s)] + pair(CH._comb_score(pp, s, phase_res=0.1)) for s in [3.0, 6.0]]
            e["ray"] = [[s64(s)] + pair(CH._rayleigh_score(v, s)) for s in [2.0, 3.0, 6.0, 7.7, 12.0]]
            e["lat"] = [[s64(s), s64(CH._lattice_refine(v, s)), s64(CH._lattice_refine(v, s, n_iters=1))]
                        for s in [3.0, 5.8, 6.0, 8.0]]
            e["spacing"] = [s64(x) for x in CH._spacing_candidates(v, 2.0, 30.0)]
            r = CH.estimate_period(v)
            e["est"] = [s64(r[0]), s64(r[1]), s64(r[2]), is_np(r[0])]
        pe[k] = e
    out["profiles"] = pe

    # _lattice_refine_peaks on raw peak lists
    lrp = []
    for t in range(40):
        s = float(rng.uniform(2.5, 20))
        m = int(rng.integers(3, 40))
        pk = np.sort(rng.uniform(0, 400, m)) if t % 4 == 0 else \
            (np.arange(m) * s + rng.normal(0, 0.12 * s, m) + rng.uniform(0, s))
        hh = rng.uniform(0.2, 1.5, m)
        s0 = s * float(rng.uniform(0.9, 1.1))
        lrp.append([h64(pk), h64(hh), s64(s0), s64(CH._lattice_refine_peaks(pk, hh, s0)),
                    s64(CH._lattice_refine_peaks(pk, hh, s0, n_iters=2))])
    out["lattice_peaks"] = lrp

    # jpeg predicates
    jp = []
    for s in [2.58, 2.6, 2.66, 2.7667, 3.9, 3.91, 4.0, 4.09, 4.1, 7.9, 7.92, 8.0, 8.08, 15.95, 16.0, 23.9, 24.08, 24.1, 5.0]:
        for ph in [0.0, 0.3, 0.59, 0.6, 1.0, 2.0, 7.39, 7.41, 15.5, -0.3, -7.5]:
            jp.append([s64(s), s64(ph), bool(CH.is_jpeg_suspect(s)), bool(CH.is_jpeg_lattice(s, ph))])
    out["jpeg_pred"] = jp

    # axis_profiles / _flatten_channels on odd shapes and channel counts
    ap = []
    for shape in [(7, 9, 4), (1, 12, 4), (12, 1, 4), (2, 2, 4), (5, 6, 3), (6, 5)]:
        img = rng.integers(0, 256, shape).astype(np.uint8)
        pr = CH.axis_profiles(img)
        ap.append({"shape": list(shape), "img": h64(img.astype(np.float64).ravel()),
                   "flat": h64(CH._flatten_channels(img).astype(np.float64).ravel()),
                   "prof": {k: h64(v) for k, v in pr.items()}})
    out["axis_profiles"] = ap

    # spectral pieces on synthetic spectra
    sp = []
    for t in range(6):
        nb = [40, 60, 257, 513, 7, 100][t]
        freqs = np.fft.rfftfreq(2 * (nb - 1)) if nb > 1 else np.array([0.0])
        power = rng.uniform(0, 1, nb) ** 4 * 1e3
        power[:: [5, 7, 9, 11, 3, 6][t]] *= 50
        bg = CH._spectral_background(power)
        steps = [2.0, 2.2, 3.0, 4.5, 5.0, 7.3, 9.0, 12.0, 30.0, 100.0]
        sp.append({"freqs": h64(freqs), "power": h64(power), "bg": h64(bg),
                   "z": [[s64(s), s64(CH._spectral_z(freqs, power, bg, s))] for s in steps],
                   "cands": [s64(x) for x in CH._spectral_candidates(freqs, power, bg, 2.0, 40.0)],
                   "cands_top2": [s64(x) for x in CH._spectral_candidates(freqs, power, bg, 2.5, 20.0, top=2)]})
    out["spectral"] = sp

    # tiles_ray_z / tile_spacing_modes on synthetic tile lists
    tl = []
    for t in range(5):
        tiles = []
        for _ in range(int(rng.integers(0, 12))):
            s = float(rng.uniform(3, 12))
            m = int(rng.integers(3, 25))
            p = np.round(np.arange(m) * s + rng.uniform(0, s) + rng.normal(0, 0.6, m)) + 1
            tiles.append((p.astype(np.float64), rng.uniform(0.2, 1.5, m), int(rng.integers(48, 193))))
        tl.append({"tiles": tiles_out(tiles),
                   "z": [[s64(s), s64(CH._tiles_ray_z(tiles, s))] for s in [1.5, 2.0, 3.3, 5.0, 8.0, 17.0, 70.0]],
                   "modes": [s64(x) for x in CH._tile_spacing_modes(tiles, 2.0, 30.0)],
                   "modes_top1": [s64(x) for x in CH._tile_spacing_modes(tiles, 3.0, 10.0, top=1)]})
    out["tiles"] = tl
    return out


# ------------------------------------------------------------------ libm oracle
def answer_libm(qpath, tpath):
    with open(qpath) as f:
        qs = json.load(f)
    table = {"phasors": {}, "atan2": {}, "log10": {}, "pow2": {}}
    if os.path.exists(tpath):
        with open(tpath) as f:
            table = json.load(f)
    unhex = lambda s: np.frombuffer(bytes.fromhex(s), "<f8")[0]   # noqa: E731
    n_new = 0
    for sh, maxp in qs.get("phasors", {}).items():
        have = table["phasors"].get(sh)
        if have is not None and have["maxP"] >= maxp:
            continue
        step = float(unhex(sh))
        p = np.arange(int(maxp) + 1, dtype=np.float64)
        th = 2j * np.pi * p / step          # the reference's own expression
        ph = np.exp(th)
        assert not np.any(th.real != 0.0)
        table["phasors"][sh] = {"maxP": int(maxp), "theta": h64(th.imag), "re": h64(ph.real), "im": h64(ph.imag)}
        n_new += 1
    for key in qs.get("atan2", []):
        if key in table["atan2"]:
            continue
        y, x = unhex(key[:16]), unhex(key[16:])
        z = np.empty(1, np.complex128)
        z.real = x
        z.imag = y
        table["atan2"][key] = s64(np.angle(z[0]))
        n_new += 1
    for key in qs.get("log10", []):
        if key not in table["log10"]:
            table["log10"][key] = s64(np.log10(np.float64(unhex(key))))
            n_new += 1
    for key in qs.get("pow2", []):
        if key not in table["pow2"]:
            table["pow2"][key] = s64(np.float64(unhex(key)) ** 2)
            n_new += 1
    with open(tpath, "w") as f:
        json.dump(table, f)
    print("libm: %d new answers -> %s" % (n_new, tpath))


def meta():
    return {"numpy": np.__version__, "scipy": scipy.__version__, "cv2": cv2.__version__,
            "python": platform.python_version(), "machine": platform.machine(),
            "cpu_dispatch": list(np._core._multiarray_umath.__cpu_dispatch__),
            "reference": os.path.abspath(pixelfixer.__file__)}


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--libm":
        answer_libm(sys.argv[2], sys.argv[3])
        return
    if len(sys.argv) >= 2 and sys.argv[1] == "--synth":
        t0 = time.time()
        d = {"meta": meta(), "synth": run_synth()}
        path = os.path.join(FIX, "channels-a-synth-parity.json")
        with open(path, "w") as f:
            json.dump(d, f)
        print("  synth  %.1fs -> %s (%.1f MB)" % (time.time() - t0, path, os.path.getsize(path) / 1e6))
        return
    if len(sys.argv) >= 2:
        name = sys.argv[1]
        d = run_image(name)
        d["meta"] = meta()
        path = os.path.join(FIX, "channels-a-%s-parity.json" % name)
        with open(path, "w") as f:
            json.dump(d, f)
        print("  %-11s %4dx%-4d kmeans calls=%d fit_grid step=(%.4f, %.4f) fu=(%s)  %.1fs -> %.1f MB" % (
            name, d["w"], d["h"], d["n_kmeans"], d["fit_grid"]["step_x"], d["fit_grid"]["step_y"],
            ", ".join("%.4f" % np.frombuffer(bytes.fromhex(d["lean"][a]["fu_step"]), "<f8")[0] for a in ("x", "y")),
            d["secs"], os.path.getsize(path) / 1e6))
        return
    # no argument: one fresh process per image (the RNG trap), then the synthetic set
    bad = 0
    for name in list(IMAGES) + ["--synth"]:
        r = subprocess.run([sys.executable, os.path.abspath(__file__), name])
        bad += r.returncode != 0
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
