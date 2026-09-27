"""Ground truth for src/pf-24-fusion.js (pixelfixer/fusion.py).

Writes fixtures/fusion-<image>-<mode>-parity.json, ONE (image, mode) PER
PROCESS: with no argument this script re-runs itself once per pair.
fusion.build_evidence calls kmeans_quantize, whose cv2.kmeans runs on
OpenCV's never-seeded RNG, so only the FIRST k-means of a fresh process is
reproducible - and each process here makes exactly one (asserted).

  mode "full"  fusion.detect(rgba) - the module's own entry point: the
               non-lean evidence (bands, pooled profiles, CellVarContrast),
               the 11-channel matrices, _axis_detect per axis, the square-
               pixel reconciliation and the cell-count arbitration.
  mode "lean"  core.detect(mode="full")'s use of this module:
               build_evidence(rgba, lean=True), then channel_matrix(ev,
               axis, ladder(), only=ACTIVE_CHANNELS), fused_curve, and
               core's own normalise + argmax (core.py:175-189, copied).

Everything is taken through the reference's OWN call paths. Module globals
are wrapped only to RECORD (each wrapper calls the original with the same
arguments and returns its result unchanged):
  FU.kmeans_quantize       the image it was given and the image it returned
  FU.build_evidence        the evidence dict detect() built
  FU._axis_detect          each axis's result dict
  FU.channel_scores        every call made with `only` set, i.e. every
                           rescore (the closure's memo makes this the list
                           of DISTINCT rounded keys, in first-use order)
  FU._lattice_refine       every call refine() makes, in order
  CH._exclusive_slot_occupancy  every call excl_occ() makes (fusion imports
                           it lazily inside _axis_detect, so it is looked up
                           on the channels module at call time)

fusion.detect caches its channel matrices on disk under CACHE_DIR, keyed by
the image's md5. A cache HIT would skip the computation, so CACHE_DIR is
pointed at a fresh directory that must not exist beforehand, and exactly
one .npz must exist afterwards (the miss branch ran). The directory is
inside this repo's out/ and is deleted afterwards.

Floats are little-endian hex (float64) so the JSON round trip cannot lose a
bit; images are zlib+base64.

Also:
  --libm <queries.json> <table.json>   answers the JS test's requests for
      numpy's transcendental outputs (np.exp of an imaginary array,
      np.angle, np.log10, np.float64 ** 2), merged into <table.json>. The
      expressions are the reference's own (channels.py _rayleigh_score /
      _tiles_ray_z / _spectral_z).
  --synth   writes fixtures/fusion-synth-parity.json: the pure functions
      (ladder, fused_curve, _local_maxima, _band_stouffer's early exit) on
      constructed inputs that reach branches no image does.

Run with the reference venv:
  <scratchpad>/pafenv2/Scripts/python.exe tools/parity-fusion.py [image mode]
"""
import base64
import glob
import hashlib
import io
import json
import os
import platform
import shutil
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

FILES = {
    "tiny": os.path.join(FIX, "tiny.png"),
    "small": os.path.join(FIX, "small.png"),
    "mid": os.path.join(FIX, "mid.png"),
    "dragon": os.path.join(EXAMPLES, "dragon.png"),
    "frog": os.path.join(EXAMPLES, "frog.png"),
    "koi-pond": os.path.join(EXAMPLES, "koi-pond.png"),
    "lighthouse": os.path.join(EXAMPLES, "lighthouse.png"),
}
SYNTH = ["syn-nn5", "syn-nn47", "syn-rect46", "syn-jpeg", "syn-bilin", "syn-flat",
         # branch-targeted: found by a search over constructed families for
         # the arbitration branches none of the images above reaches (the
         # test prints which process took which branch)
         "syn-nn8", "syn-blk2", "syn-blk3", "syn-cub8", "syn-vstripes", "syn-hstripes",
         "syn-sjpg", "syn-moved", "syn-square", "syn-square2", "syn-tie"]
IMAGES = list(FILES) + SYNTH
MODES = ("full", "lean")


# ------------------------------------------------------------------ encoding
def h64(a):
    return np.ascontiguousarray(np.asarray(a, np.float64)).astype("<f8").tobytes().hex()


def s64(x):
    return None if x is None else h64([float(x)])


def b64z(b):
    return base64.b64encode(zlib.compress(b, 6)).decode("ascii")


def sha_u8(a):
    a = np.ascontiguousarray(a)
    assert a.dtype == np.uint8, a.dtype
    return hashlib.sha256(a.tobytes()).hexdigest()


def tiles_out(tiles):
    return [[h64(p), h64(h), int(ext)] for p, h, ext in tiles]


def pp_out(pp):
    if pp is None:
        return None
    return {str(p): [h64(v[0]), s64(v[1]), s64(v[2])] for p, v in pp.variants.items()}


def bands_out(b):
    if b is None:
        return None
    return {"d": h64(b), "h": int(b.shape[0]), "w": int(b.shape[1])}


# ------------------------------------------------------------------ images
def upscale_nn(img, fy, fx):
    h, w = img.shape[:2]
    H, W = int(round(h * fy)), int(round(w * fx))
    ys = np.minimum((np.arange(H) / fy).astype(int), h - 1)
    xs = np.minimum((np.arange(W) / fx).astype(int), w - 1)
    return np.ascontiguousarray(img[ys][:, xs])


def art_blocks(seed, rows, cols, bx=1, by=1, detail=0.0, ncol=7):
    """Random palette art whose colour changes every bx (by) cells, plus a
    `detail` fraction of single cells recoloured."""
    rng = np.random.default_rng(seed)
    pal = rng.integers(0, 256, (ncol, 3))
    a = pal[rng.integers(0, ncol, ((rows + by - 1) // by, (cols + bx - 1) // bx))]
    a = np.repeat(np.repeat(a, by, 0), bx, 1)[:rows, :cols]
    if detail > 0:
        m = rng.random((rows, cols)) < detail
        a[m] = pal[rng.integers(0, ncol, m.sum())]
    return np.dstack([a, np.full((rows, cols), 255)]).astype(np.uint8)


def jpeg(rgb, q):
    buf = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(rgb[:, :, :3])).save(buf, "JPEG", quality=q)
    return np.array(Image.open(io.BytesIO(buf.getvalue())).convert("RGBA"))


def smooth_field(H, W, fx1, fy1, fd, ph):
    yy, xx = np.mgrid[0:H, 0:W]
    rgb = np.dstack([128 + 100 * np.sin(xx / fx1 + ph[0]), 128 + 100 * np.cos(yy / fy1 + ph[1]),
                     128 + 90 * np.sin((xx + yy) / fd + ph[2])])
    return np.clip(rgb, 0, 255).astype(np.uint8)


def synth_image(name):
    """Constructed images aimed at branches the real ones may not reach.
    The pixels go into the fixture, so the JS side never regenerates them."""
    # ---- branch-targeted (see SYNTH); the branch each was found for:
    if name == "syn-nn8":          # 8 px cells on the jpeg lattice: jpeg_z > 5, notch
        return upscale_nn(art_blocks(1, 24, 30), 8.0, 8.0)
    if name == "syn-blk2":         # colour changes every 2 cells + 15% single cells:
        return upscale_nn(art_blocks(1, 36, 44, 2, 2, 0.15), 3.0, 3.0)   # fundamental check, /2
    if name == "syn-blk3":         # same with 3-cell blocks: fundamental check, /3
        return upscale_nn(art_blocks(1, 36, 44, 3, 3, 0.15), 3.0, 3.0)
    if name == "syn-cub8":         # bicubic x8: notch + fundamental /2 on both axes
        return np.ascontiguousarray(cv2.resize(art_blocks(1, 26, 32), (256, 208), interpolation=cv2.INTER_CUBIC))
    if name in ("syn-vstripes", "syn-hstripes"):   # edges along one axis only: that axis is None
        rng = np.random.default_rng(1)
        pal = rng.integers(0, 256, (6, 3))
        cols = pal[rng.integers(0, 6, 40)]
        v = np.repeat(np.repeat(cols[None, :, :], 50, axis=0), 5, axis=1)
        if name == "syn-hstripes":
            v = np.transpose(v, (1, 0, 2))
        return np.ascontiguousarray(np.dstack([v, np.full(v.shape[:2], 255)]).astype(np.uint8))
    if name == "syn-sjpg":         # smooth field, jpeg q8: the notch empties E1, so the
        return jpeg(smooth_field(240, 256, 37.0, 29.0, 53.0, (0.0, 0.0, 0.0)), 8)   # anti-harmonic climb fires
    if name == "syn-moved":        # 2x1-cell blocks, x4, cropped 2 rows: the cell count
        return np.ascontiguousarray(upscale_nn(art_blocks(312, 30, 36, 2, 1, 0.2), 4.0, 4.0)[2:, 0:])  # moves off round()
    if name == "syn-square":       # the axes disagree by a non-integer ratio and the
        return jpeg(smooth_field(200, 300, 24.70906991040428, 21.833049335334124, 29.6783022681801,
                                 (5.1343876917958795, 3.6025904503418666, 4.537099674996696)), 40)
    if name == "syn-square2":      # square pair is adopted (margins 2.1% / 3.1% over 1.05 x keep)
        return jpeg(smooth_field(160, 300, 33.60269894459454, 40.64728483310231, 54.6375627382712,
                                 (1.6637284165158088, 1.1312322268936275, 2.754825212725842)), 50)
    if name == "syn-tie":          # 481 px wide at 3 px: pick_count rescores 481/160 =
        # 3.00625, where round(float, 4) = 3.0063 and numpy's round = 3.0062 - the
        # one input path that decides which rounding rescore's memo key uses
        return np.ascontiguousarray(upscale_nn(art_blocks(3, 24, 162), 3.0, 3.0)[:, :481])
    rng = np.random.default_rng(20260927)
    pal = rng.integers(0, 256, (7, 3))
    art = pal[rng.integers(0, 7, (28, 36))]
    rgba = np.dstack([art, np.full(art.shape[:2], 255)]).astype(np.uint8)
    if name == "syn-nn5":          # clean integer upscale
        return upscale_nn(rgba, 5.0, 5.0)
    if name == "syn-nn47":         # non-integer step: extent/step off a whole count
        return upscale_nn(rgba, 4.7, 4.7)
    if name == "syn-rect46":       # non-square cells: 4 px wide, 6 px tall
        return upscale_nn(rgba, 6.0, 4.0)
    if name == "syn-jpeg":         # 8 px blocks from the codec: jpeg_z > 5 -> notch
        big = upscale_nn(rgba, 5.0, 5.0)
        buf = io.BytesIO()
        Image.fromarray(big[:, :, :3]).save(buf, "JPEG", quality=40)
        return np.array(Image.open(io.BytesIO(buf.getvalue())).convert("RGBA"))
    if name == "syn-bilin":        # smooth (bilinear) upscale: E2 carries the grid
        return np.ascontiguousarray(cv2.resize(rgba, (int(36 * 6.4), int(28 * 6.4)),
                                               interpolation=cv2.INTER_LINEAR))
    if name == "syn-flat":         # no edges anywhere
        return np.tile(np.array([90, 140, 200, 255], np.uint8), (64, 80, 1))
    raise KeyError(name)


def load(name):
    if name in FILES:
        return np.array(Image.open(FILES[name]).convert("RGBA"))   # api._load's PNG path
    return synth_image(name)


# ------------------------------------------------------------------ dumping
def ev_out(ev):
    out = {"w": int(ev["w"]), "h": int(ev["h"]), "jpeg_z": s64(ev["jpeg_z"]),
           "vc_is_none": ev["vc"] is None,
           "vc_cands": [[s64(s), s64(z)] for s, z in ev["vc_cands"]]}
    for ax in ("x", "y"):
        A = ev[ax]
        out[ax] = {
            "e1": h64(A["e1"]), "e2": h64(A["e2"]), "extent": int(A["extent"]),
            "pp1": pp_out(A["pp1"]), "pp2": pp_out(A["pp2"]),
            "bands1": bands_out(A["bands1"]), "bands2": bands_out(A["bands2"]),
            "bpp1": [pp_out(p) for p in A["bpp1"]], "bpp2": [pp_out(p) for p in A["bpp2"]],
            "tiles1": tiles_out(A["tiles1"]), "tiles2": tiles_out(A["tiles2"]),
            "spec1": [h64(x) for x in A["spec1"]], "spec2": [h64(x) for x in A["spec2"]],
        }
    return out


def run_image(name, mode):
    t0 = time.time()
    rgba = load(name)
    h, w = rgba.shape[:2]
    out = {"name": name, "mode": mode, "w": int(w), "h": int(h), "rgba_z": b64z(rgba.tobytes())}

    rec = {"base": [], "q": []}
    orig_kq = FU.kmeans_quantize

    def rec_kq(img, *a, **k):
        rec["base"].append(np.ascontiguousarray(img).copy())
        r = orig_kq(img, *a, **k)
        rec["q"].append(np.ascontiguousarray(r[0]).copy())
        return r
    FU.kmeans_quantize = rec_kq

    out["ladder"] = h64(FU.ladder())
    out["linspace"] = h64(np.linspace(0.955, 1.045, 19))

    if mode == "lean":
        ev = FU.build_evidence(rgba, lean=True)
        out["ev"] = ev_out(ev)
        # core.py:175-189, copied: the lean evidence as core consumes it
        steps = FU.ladder()
        lean = {}
        curves = {}
        for axis in ("x", "y"):
            mat = FU.channel_matrix(ev, axis, steps, only=FU.ACTIVE_CHANNELS)
            c = FU.fused_curve(mat)
            m = float(np.max(c))
            curves[axis] = c / m if m > 0 else c
            lean[axis] = {"mat": h64(mat), "shape": list(mat.shape), "fused": h64(c),
                          "curve": h64(curves[axis])}
        fu = {"step_x": float(steps[int(np.argmax(curves["x"]))]),
              "step_y": float(steps[int(np.argmax(curves["y"]))])}
        fu["cols"] = max(1, round(w / fu["step_x"]))
        fu["rows"] = max(1, round(h / fu["step_y"]))
        out["lean"] = lean
        out["fu_prop"] = {"step_x": s64(fu["step_x"]), "step_y": s64(fu["step_y"]),
                          "cols": int(fu["cols"]), "rows": int(fu["rows"])}
    else:
        cap = {"ev": None, "axis": {}, "rescore": [], "lattice": [], "excl": [], "ids": {}}
        o_be, o_ad, o_cs = FU.build_evidence, FU._axis_detect, FU.channel_scores
        o_lr, o_eo = FU._lattice_refine, CH._exclusive_slot_occupancy

        def w_be(rgba_, lean=False):
            ev_ = o_be(rgba_, lean=lean)
            cap["ev"] = ev_
            for ax in ("x", "y"):
                cap["ids"][id(ev_[ax]["e1"])] = ax + ".e1"
                cap["ids"][id(ev_[ax]["e2"])] = ax + ".e2"
            return ev_

        def w_ad(ev_, axis, steps, mat):
            r = o_ad(ev_, axis, steps, mat)
            cap["axis"][axis] = r
            return r

        def w_cs(ev_, axis, step, only=None):
            r = o_cs(ev_, axis, step, only=only)
            if only is not None:
                cap["rescore"].append([axis, s64(step), sorted(only),
                                       {c: s64(v) for c, v in r.items()}])
            return r

        def w_lr(profile, s0, n_iters=4):
            r = o_lr(profile, s0, n_iters)
            cap["lattice"].append([cap["ids"].get(id(profile), "?"), s64(s0), s64(r)])
            return r

        def w_eo(profile, s_small, phase_small, s_big):
            r = o_eo(profile, s_small, phase_small, s_big)
            cap["excl"].append([cap["ids"].get(id(profile), "?"), s64(s_small), s64(phase_small),
                                s64(s_big), s64(r)])
            return r

        cache = os.path.join(ROOT, "out", "fusion-parity-cache", "%s-%d" % (name, os.getpid()))
        assert not os.path.exists(cache), cache
        FU.CACHE_DIR = cache
        FU.build_evidence, FU._axis_detect, FU.channel_scores = w_be, w_ad, w_cs
        FU._lattice_refine, CH._exclusive_slot_occupancy = w_lr, w_eo
        try:
            res = FU.detect(rgba)
            err = None
        except Exception as e:                       # noqa: BLE001 - recorded, compared
            res, err = None, "%s: %s" % (type(e).__name__, e)
        finally:
            FU.build_evidence, FU._axis_detect, FU.channel_scores = o_be, o_ad, o_cs
            FU._lattice_refine, CH._exclusive_slot_occupancy = o_lr, o_eo
        out["raises"] = err
        if err is None:
            npz = glob.glob(os.path.join(cache, "*.npz"))
            assert len(npz) == 1, ("the disk cache must MISS exactly once", npz)
            # `with`: an open NpzFile keeps the file locked on Windows, and the
            # rmtree below would then fail (it did, silently, before this was
            # a context manager and before rmtree stopped ignoring errors)
            with np.load(npz[0]) as d:
                mx, my = d["mx"], d["my"]
            out["mats"] = {"x": h64(mx), "y": h64(my), "shape_x": list(mx.shape), "shape_y": list(my.shape)}
        if os.path.exists(cache):
            shutil.rmtree(cache)
        assert not os.path.exists(cache), cache
        try:
            os.rmdir(os.path.dirname(cache))   # only when empty (another run may be using it)
        except OSError:
            pass
        if cap["ev"] is not None:
            out["ev"] = ev_out(cap["ev"])
        out["axis"] = {ax: {"step": s64(r["step"]), "score": s64(r["score"]),
                            "steps": h64(r["steps"]), "curve": h64(r["curve"])}
                       for ax, r in cap["axis"].items()}
        out["trace"] = {"rescore": cap["rescore"], "lattice": cap["lattice"], "excl": cap["excl"]}
        if res is not None:
            out["detect"] = {"step_x": s64(res["step_x"]), "step_y": s64(res["step_y"]),
                             "cols": res["cols"], "rows": res["rows"],
                             "phase_x": s64(res["phase_x"]), "phase_y": s64(res["phase_y"]),
                             "candidates": [[s64(s), s64(c)] for s, c in res["candidates"]]}

    out["n_kmeans"] = len(rec["q"])
    if rec["q"]:
        assert len(rec["q"]) == 1, "one k-means per process, or the RNG state is not the first call's"
        out["base_sha"] = sha_u8(rec["base"][0])
        out["q_z"] = b64z(rec["q"][0].tobytes())
        out["q_sha"] = sha_u8(rec["q"][0])
    out["secs"] = round(time.time() - t0, 2)
    return out


# ------------------------------------------------------------------ synthetic (pure functions)
def run_synth():
    rng = np.random.default_rng(424242)
    out = {"ladders": [], "fused": [], "maxima": []}
    for lo, hi, ratio in ((2.0, 64.0, 1.03), (1.5, 20.0, 1.07), (3.0, 3.0, 1.1), (2.0, 7.3, 1.2)):
        out["ladders"].append([s64(lo), s64(hi), s64(ratio), h64(FU.ladder(lo, hi, ratio))])
    nc = len(FU.CHANNELS)
    mats = []
    m = rng.normal(0, 3, (40, nc)); mats.append(("normal", m))
    m = rng.normal(0, 3, (25, nc)); m[:, 2] = -np.abs(m[:, 2]); mats.append(("ray_e1 all negative", m))
    m = rng.normal(0, 3, (25, nc)); m[:, 6] = 5e-10; mats.append(("tile_e1 below 1e-9", m))
    m = rng.normal(0, 3, (25, nc)); m[3, 8] = -0.0; m[4, 8] = 0.0; mats.append(("signed zeros", m))
    m = np.zeros((12, nc)); mats.append(("all zero", m))
    m = np.round(rng.normal(0, 2, (30, nc)), 1); mats.append(("ties", m))
    for label, m in mats:
        out["fused"].append([label, h64(m), list(m.shape), h64(FU.fused_curve(m))])
    curves = [
        ("plateau", [0.0, 1.0, 1.0, 0.5, 2.0, 2.0, 2.0, 0.1, 0.0]),
        ("edges", [3.0, 1.0, 0.5, 0.5, 4.0]),
        ("ties", [1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]),
        ("negative", [-1.0, -0.5, -2.0, 0.0, -0.0]),
        ("single", [0.7]),
        ("random", list(rng.random(50))),
    ]
    for label, c in curves:
        c = np.asarray(c, np.float64)
        steps = FU.ladder()[:len(c)]
        out["maxima"].append([label, h64(c), [int(i) for i in FU._local_maxima(steps, c)]])
    out["stouffer_none"] = s64(FU._band_stouffer([], None, 5.0))
    out["active"] = FU.ACTIVE_CHANNELS
    out["channels"] = FU.CHANNELS
    out["rescore_weights"] = {k: s64(v) for k, v in FU.RESCORE_WEIGHTS.items()}
    out["weights"] = {k: s64(v) for k, v in FU.WEIGHTS.items()}
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
            "reference": os.path.abspath(pixelfixer.__file__)}


def main():
    a = sys.argv[1:]
    if a and a[0] == "--libm":
        answer_libm(a[1], a[2])
        return
    if a and a[0] == "--synth":
        d = {"meta": meta(), "synth": run_synth()}
        path = os.path.join(FIX, "fusion-synth-parity.json")
        with open(path, "w") as f:
            json.dump(d, f)
        print("  synth -> %s (%.2f MB)" % (path, os.path.getsize(path) / 1e6))
        return
    if len(a) == 2:
        name, mode = a
        d = run_image(name, mode)
        d["meta"] = meta()
        path = os.path.join(FIX, "fusion-%s-%s-parity.json" % (name, mode))
        with open(path, "w") as f:
            json.dump(d, f)
        extra = ""
        if mode == "full" and d.get("detect"):
            r = d["detect"]
            un = lambda s: float(np.frombuffer(bytes.fromhex(s), "<f8")[0])   # noqa: E731
            extra = "detect step=(%.4f, %.4f) cells=%dx%d rescores=%d" % (
                un(r["step_x"]), un(r["step_y"]), r["cols"], r["rows"], len(d["trace"]["rescore"]))
        elif mode == "full":
            extra = "RAISES %s" % d["raises"]
        else:
            extra = "fu cells=%dx%d" % (d["fu_prop"]["cols"], d["fu_prop"]["rows"])
        print("  %-11s %-4s %4dx%-4d kmeans=%d %s  %.1fs -> %.1f MB" % (
            name, mode, d["w"], d["h"], d["n_kmeans"], extra, d["secs"], os.path.getsize(path) / 1e6))
        return
    names = a if a else IMAGES
    bad = 0
    for name in names:
        for mode in MODES:
            r = subprocess.run([sys.executable, __file__, name, mode])
            bad += r.returncode != 0
    r = subprocess.run([sys.executable, __file__, "--synth"])
    bad += r.returncode != 0
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
