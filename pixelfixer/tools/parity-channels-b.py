"""Ground truth for src/pf-31-channels-b.js (channels.py lines 817-1631).

Writes fixtures/channels-b-parity.json (an index) and, per case,
fixtures/raw/channels-b/<case>.json plus .bin sidecars for the big arrays
(both paths are gitignored: fixtures/*-parity.json and fixtures/raw/).

WHAT IS RECORDED, AND WHY THIS WAY
  Every case runs the REFERENCE'S OWN CALL PATH - channels.fit_grid(rgba),
  exactly as a caller would - with recorders wrapped around the module's
  functions. A wrapper calls the original and writes down its arguments and
  its answer; nothing is recomputed on a side path. So the fixture holds:
    - the inputs and outputs of every call INTO this half (lattice_dp,
      _axis_chain, band_profiles, refine_positions_per_band, ... and
      estimate_period_ev / _evidence_refine_step with their ev by index);
    - the answers of every call this half makes OUT to the first half and
      to varcontrast (ev.score / ev.refine / ev.candidate_steps, the
      _comb_score / _tiles_ray_z / is_jpeg_suspect calls made BY
      estimate_period_ev - filtered by the caller's frame so the first
      half's own internal calls are not mixed in - axis_profiles,
      _notch_jpeg, is_jpeg_lattice, CellVarContrast.z_channel / contrast /
      best_pair, kmeans_quantize);
    - _normalise(profile) for every profile that reaches this half, so the
      JS test can run this half against the reference's first half exactly
      (replay) as well as against pf-30's port (integration).
  The JS test replays the recorded answers and asks: given exactly what
  the reference's first half answered, does this half ask the same
  questions and reach the same GridFit?

THE RNG (see README): fit_grid(quantized=None) calls kmeans_quantize ->
  cv2.kmeans on OpenCV's process-global, never-seeded RNG. So each case
  runs in its OWN python process (this script re-invokes itself with
  --one), and fit_grid(rgba) is the FIRST k-means call in it. The later
  fits in the same process pass quantized= explicitly, so they draw
  nothing; the fusion calls come last and their k-means draws do not
  matter (only their band_profiles / _exclusive_slot_occupancy arguments
  are kept, whatever they are).

Run with the reference venv (no .pyc is written into the reference tree):
  PYTHONDONTWRITEBYTECODE=1 <scratchpad>/pafenv2/Scripts/python.exe tools/parity-channels-b.py
  ... NAME [NAME..]  only these cases (still one process each)
  ... --index-only   rebuild the index (float-hash / round tables) only
  --one NAME is what the driver runs per process, from a fresh empty cwd
  it creates under fixtures/raw/channels-b/ (the fusion disk cache, see
  run_one); run by hand it refuses any other cwd.
"""
import hashlib
import io
import json
import os
import platform
import subprocess
import sys
import time

sys.dont_write_bytecode = True
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

import numpy as np            # noqa: E402
import cv2                    # noqa: E402
import scipy                  # noqa: E402
from PIL import Image         # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = os.path.dirname(os.path.dirname(ROOT))
REF_PY = os.path.join(SCRATCH, "paf-ref", "python")
EXAMPLES = os.path.join(SCRATCH, "paf-ref", "examples")
FIX = os.path.join(ROOT, "fixtures")
OUT = os.path.join(FIX, "raw", "channels-b")
INDEX = os.path.join(FIX, "channels-b-parity.json")
sys.path.insert(0, REF_PY)

import pixelfixer                             # noqa: E402
from pixelfixer import channels as C          # noqa: E402
from pixelfixer import varcontrast as V       # noqa: E402
from pixelfixer import quantize as Q          # noqa: E402
from pixelfixer import fusion as FU           # noqa: E402

assert os.path.normcase(os.path.abspath(C.__file__)).startswith(os.path.normcase(REF_PY)), C.__file__

CASES = ["tiny", "small", "mid", "dragon", "frog", "koi-pond", "lighthouse",
         "synth_jpeg", "synth_noise", "synth_rect", "synth_warp", "synth_rgb",
         # chosen by tracing the reference's own line execution (sys.settrace)
         # for the arbitration branches the images above never reach:
         "flat_small",       # non-periodic -> identity grid (step <= 1.05)
         "flat_big",         # constant image: mild square prior adopts
         "grad_smooth",      # y has a lattice, x borrows it
         "blur_noise",       # x has one, y borrows; pair arbitration switches
         "stripes_x5",       # harmonic reconciliation tested (2x across axes)
         "rect_4x8",         # wild square prior evaluated; pair switch
         "dup2x",            # mild prior the other way; jpeg deflation
         "art_4x8_ydetail",  # cross-axis jpeg arbitration adopts
         "rect_8x5",         # 8 px cells: the jpeg notch on a real grid
         # EVIDENCE-TRANSFORMED (replay only, see TRANSFORMS)
         "xf_vc_fallback", "xf_struct_adopt", "xf_div_adopt", "xf_harm_adopt",
         "xf_axis_none", "xf_gated", "xf_axis_tie", "xf_weak_x",
         # the same images transposed: every x/y-asymmetric branch the
         # originals reach, reached from the other axis
         "grad_smooth_T", "blur_noise_T", "stripes_x5_T", "rect_4x8_T", "dup2x_T",
         "art_4x8_ydetail_T", "rect_8x5_T",
         "synth_jpeg_small",  # jpeg notch while one axis has no bands (h < 96)
         "xf_axis_none_y", "xf_harm_adopt_x", "xf_mild_x", "xf_wild_y", "xf_wild_x",
         "xf_jpeg_arb_x", "xf_jpeg_arb_y"]
FUSION_DETECT = {"tiny", "small", "mid", "synth_rect", "synth_warp", "frog"}


# ---------------------------------------------------- evidence transforms
# Branches no image reached (traced) are driven by passing the first half's
# _AxisEvidence answers through a FIXED, deterministic transform before the
# reference's own estimate_period_ev / fit_grid logic decides. The fixture
# records the transformed answers, so the JS replay feeds my port exactly
# what the reference's logic saw: a differential test of the DECISIONS on
# evidence no real first half produced. These cases are replay-only - the
# real pf-30 would not produce these answers - and the test says so.
def _bump(s, c, h, w=0.25):
    return h * max(0.0, 1.0 - abs(s - c) / w)


TRANSFORMS = {
    # every score x0.1: both axes fall under min_score -> square-packer fallback
    "xf_vc_fallback": {"image": "art6", "score": lambda i, s, out, orig: (out[0] * 0.1, out[1])},
    # 10 px lattice; a near-best 5.0 on ev_x1: structural guard adopts the top
    "xf_struct_adopt": {"image": "art10", "score": lambda i, s, out, orig:
                        (0.95 * orig(10.0)[0], out[1]) if (i == 0 and abs(s - 5.0) < 0.2) else out},
    # 3 px lattice; ev_x1 landscape 18 > 6 > 3: good[0] = 6, divisor adopts 3
    "xf_div_adopt": {"image": "art3", "score": lambda i, s, out, orig:
                     (_bump(s, 18.0, 20.0) + _bump(s, 6.0, 18.0) + _bump(s, 3.0, 16.0) + 0.01 * out[0], out[1])
                     if i == 0 else out},
    # 5 px lattice; y evidence peaks at 10 (5 scores 0.7 of it): harmonic adopts 5
    "xf_harm_adopt": {"image": "art5", "score": lambda i, s, out, orig:
                      (orig(5.0)[0] / 0.7, out[1]) if (i in (2, 3) and abs(s - 10.0) < 0.3) else out},
    # no x evidence at all: both x estimates None, x borrows y's step
    "xf_axis_none": {"image": "art5", "score": lambda i, s, out, orig: (-1.0, out[1]) if i in (0, 1) else out},
    # identical landscapes on ev_x1 / ev_x2: the cut-vs-knot tie (>=) decides;
    # ev_x1 also offers candidates outside [min_step, max_step]
    "xf_axis_tie": {"image": "art5", "score": lambda i, s, out, orig:
                    (_bump(s, 5.0, 12.0) + _bump(s, 10.0, 6.0), out[1]) if i in (0, 1) else out,
                    "cands": lambda i, lo, hi, out: (list(out) + [1.0, 999.0]) if i == 0 else out},
    # mirrors of xf_axis_none / xf_harm_adopt on the other axis
    "xf_axis_none_y": {"image": "art5", "score": lambda i, s, out, orig: (-1.0, out[1]) if i in (2, 3) else out},
    "xf_harm_adopt_x": {"image": "art5", "score": lambda i, s, out, orig:
                        (orig(5.0)[0] / 0.7, out[1]) if (i in (0, 1) and abs(s - 10.0) < 0.3) else out},
    # 5 wide x 6 tall cells, x evidence halved plus a bump at 6: y is the
    # stronger axis and its step is tried (and adopted) on x
    "xf_mild_x": {"image": "rect_5x6", "score": lambda i, s, out, orig:
                  (0.5 * out[0] + _bump(s, 6.0, 5.0), out[1]) if i in (0, 1) else out},
    # wild square prior ADOPTION, reached through mode mixing: 3 px lattice;
    # ev_y1 peaks at 4.8 (ratio 1.6 to x), ev_y2 scores x's step 3.0 at 50
    # but its own estimate is denied by the small-step gate (comb/tiles 0),
    # so y = 4.8 and x_on_y = 50 > 1.1 * keep
    "xf_wild_y": {"image": "art3",
                  "score": lambda i, s, out, orig: ((_bump(s, 4.8, 10.0, 1.0), out[1]) if i == 2 else
                                                    (_bump(s, 3.0, 50.0), out[1]) if i == 3 else out),
                  "comb": lambda i, s, out: (0.0, 0.0) if i == 3 else out,
                  "tiles": lambda i, s, out: 0.0 if i == 3 else out},
    # cross-axis jpeg arbitration that CHANGES a step. In the natural cases
    # it only re-derives what the mild square prior had just adopted (the
    # same question to the same evidence), so a mutant that never adopts
    # survived them. Here one axis sits on 8.0 at phase 0 (the jpeg lattice,
    # no credible alternative, so estimate_period_ev deflates it) while the
    # other keeps the real 5 px step, ratio 1.6 (outside both square-prior
    # bands): the jpeg axis is re-scored at 5 and adopts it.
    "xf_jpeg_arb_x": {"image": "art5", "score": lambda i, s, out, orig:
                      ((out[0] + _bump(s, 8.0, 40.0), 0.0 if abs(s - 8.0) < 0.25 else out[1])
                       if i in (0, 1) else out)},
    "xf_jpeg_arb_y": {"image": "art5", "score": lambda i, s, out, orig:
                      ((out[0] + _bump(s, 8.0, 40.0), 0.0 if abs(s - 8.0) < 0.25 else out[1])
                       if i in (2, 3) else out)},
    "xf_wild_x": {"image": "art3",
                  "score": lambda i, s, out, orig: ((_bump(s, 4.8, 10.0, 1.0), out[1]) if i == 0 else
                                                    (_bump(s, 3.0, 50.0), out[1]) if i == 1 else out),
                  "comb": lambda i, s, out: (0.0, 0.0) if i == 1 else out,
                  "tiles": lambda i, s, out: 0.0 if i == 1 else out},
    # x evidence peaks at 2.7: between min_score (2.2) and anything larger
    "xf_weak_x": {"image": "art5", "score": lambda i, s, out, orig:
                  (_bump(s, 5.0, 2.7) + 1e-3 * out[0], out[1]) if i in (0, 1) else out},
    # ev_y1 offers only sub-4 steps and the global comb / tiles deny them
    "xf_gated": {"image": "art5",
                 "score": lambda i, s, out, orig: out if (i != 2 or s < 4.0) else (-1.0, out[1]),
                 "cands": lambda i, lo, hi, out: ([s for s in out if s < 4.0] + [2.5]) if i == 2 else out,
                 "comb": lambda i, s, out: (0.0, 0.0) if i == 2 else out,
                 "tiles": lambda i, s, out: 0.0 if i == 2 else out},
}


def f8(x):
    return None if x is None else np.float64(x).tobytes().hex()


def is_np(x):
    return type(x) is np.float64


# ------------------------------------------------------------------ images
def load_png(path):
    return np.ascontiguousarray(np.asarray(Image.open(path).convert("RGBA")))


def synth(name):
    rng = np.random.default_rng(20260927)
    pal = rng.integers(0, 256, (7, 3))
    if name == "synth_jpeg":
        # a smooth gradient saved at jpeg quality 5: the quantized profiles
        # carry the 8px block lattice (jpeg_z = 9.69 measured) -> notch path
        yy, xx = np.mgrid[0:160, 0:200].astype(np.float64)
        v = np.hypot(yy - 80, xx - 100) * 1.6
        rgb = np.stack([v % 256, (v * 0.5 + 60) % 256, (255 - v) % 256], -1).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, "JPEG", quality=5)
        buf.seek(0)
        return np.ascontiguousarray(np.asarray(Image.open(buf).convert("RGBA")))
    if name == "synth_noise":
        # no lattice at all: the non-periodic branch
        return rng.integers(0, 256, (64, 72, 4)).astype(np.uint8)
    if name == "synth_rect":
        # 4 px wide x 7 px tall cells: the square-pixel priors disagree
        art = pal[rng.integers(0, 7, (16, 30))]
        a = np.dstack([art, np.full((16, 30), 255)]).astype(np.uint8)
        return np.ascontiguousarray(np.repeat(np.repeat(a, 7, 0), 4, 1))
    if name == "synth_warp":
        # 6 px cells under a smooth sinusoidal warp: many bands per axis
        art = pal[rng.integers(0, 7, (44, 44))]
        H = W = 256
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
        u = xx + 2.2 * np.sin(yy / 37.0)
        v = yy + 2.2 * np.sin(xx / 41.0)
        iy = np.clip((v / 5.9).astype(int), 0, 43)
        ix = np.clip((u / 5.9).astype(int), 0, 43)
        rgb = art[iy, ix]
        return np.ascontiguousarray(np.dstack([rgb, np.full((H, W), 255)]).astype(np.uint8))
    if name == "synth_rgb":
        # 3-channel input: no premultiply in _flatten_channels
        return np.ascontiguousarray(load_png(os.path.join(FIX, "small.png"))[:, :, :3])
    raise KeyError(name)


def _rgba(rgb):
    return np.ascontiguousarray(np.dstack([rgb, np.full(rgb.shape[:2], 255)]).astype(np.uint8))


def _up(a, fx, fy):
    return np.ascontiguousarray(np.repeat(np.repeat(a, fy, 0), fx, 1))


def probe_image(name):
    """The branch-targeted images. Each has its own seed, so adding one never
    changes another; which branch each reaches is measured by the JS test's
    coverage run, not assumed from this comment."""
    if name.endswith("_T"):
        return np.ascontiguousarray(probe_image(name[:-2]).transpose(1, 0, 2))
    if name == "synth_jpeg_small":
        yy, xx = np.mgrid[0:80, 0:200].astype(np.float64)
        v = np.hypot(yy - 40, xx - 100) * 1.6
        rgb = np.stack([v % 256, (v * 0.5 + 60) % 256, (255 - v) % 256], -1).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, "JPEG", quality=5)
        buf.seek(0)
        return np.ascontiguousarray(np.asarray(Image.open(buf).convert("RGBA")))
    if name == "rect_5x6":
        rng = np.random.default_rng(56)
        pal = rng.integers(0, 256, (9, 3))
        return _rgba(_up(pal[rng.integers(0, 9, (30, 36))], 5, 6))
    seed = {"flat_small": 1, "flat_big": 2, "grad_smooth": 3, "blur_noise": 4, "stripes_x5": 5,
            "rect_4x8": 6, "dup2x": 7, "art_4x8_ydetail": 8, "rect_8x5": 9,
            "art3": 13, "art5": 15, "art6": 16, "art10": 20}[name]
    rng = np.random.default_rng(seed)
    pal = rng.integers(0, 256, (9, 3))
    if name == "flat_small":
        return np.full((64, 64, 4), [90, 140, 30, 255], np.uint8)
    if name == "flat_big":
        return np.full((260, 300, 4), [90, 140, 30, 255], np.uint8)
    if name == "grad_smooth":
        yy, xx = np.mgrid[0:150, 0:180].astype(np.float64)
        return _rgba(np.stack([xx, yy, (xx + yy) / 2], -1).clip(0, 255))
    if name == "blur_noise":
        return _rgba(cv2.GaussianBlur(rng.integers(0, 256, (200, 200, 3)).astype(np.uint8), (0, 0), 3))
    if name == "stripes_x5":
        return _rgba(np.repeat(np.repeat(pal[rng.integers(0, 9, 40)][None], 120, 0), 5, 1))
    if name == "rect_4x8":
        return _rgba(_up(pal[rng.integers(0, 9, (20, 40))], 4, 8))
    if name == "rect_8x5":
        return _rgba(_up(pal[rng.integers(0, 9, (40, 25))], 8, 5))
    if name == "dup2x":
        d = _up(pal[rng.integers(0, 9, (15, 15))], 2, 2)
        m = rng.random(d.shape[:2]) < 0.15
        d[m] = pal[rng.integers(0, 9, int(m.sum()))]
        return _rgba(_up(d, 4, 4))
    if name == "art_4x8_ydetail":
        art = _up(pal[rng.integers(0, 9, (30, 60))], 4, 1)
        return _rgba(_up(np.repeat(art, 2, 0)[:60], 1, 4))
    if name in ("art3", "art5", "art6", "art10"):
        cell = int(name[3:])
        n = 180 // cell if cell != 10 else 20
        return _rgba(_up(pal[rng.integers(0, 9, (n, n))], cell, cell))
    raise KeyError(name)


def load_case(name):
    if name in ("tiny", "small", "mid"):
        return load_png(os.path.join(FIX, name + ".png"))
    if name.startswith("synth_") and name != "synth_jpeg_small":
        return synth(name)
    if name.startswith("xf_"):
        return probe_image(TRANSFORMS[name]["image"])
    if name in ("dragon", "frog", "koi-pond", "lighthouse"):
        return load_png(os.path.join(EXAMPLES, name + ".png"))
    return probe_image(name)


# ------------------------------------------------------------ array store
class Store:
    """Arrays are stored once per case, keyed by content; records refer to
    them by key. Small ones inline as hex, big ones as .bin sidecars, and
    outputs too big to keep (index maps of the big examples) as digests."""

    def __init__(self, case):
        self.case = case
        self.dir = os.path.join(OUT, case)
        os.makedirs(self.dir, exist_ok=True)
        self.arrays = {}

    def put(self, a):
        a = np.ascontiguousarray(a)
        dt = {"float64": "f8", "float32": "f4", "int32": "i4", "uint8": "u1",
              "int64": "i8"}[str(a.dtype)]
        if dt == "i8":
            assert a.size == 0 or (int(a.min()) >= -2**31 and int(a.max()) < 2**31)
            a = a.astype(np.int32)
            dt = "i8>i4"
        b = a.tobytes()
        key = hashlib.sha256(b + repr((dt, a.shape)).encode()).hexdigest()[:24]
        if key not in self.arrays:
            d = {"dtype": dt, "shape": list(a.shape)}
            if len(b) <= 256 * 1024:
                d["hex"] = b.hex()
            else:
                fn = key + ".bin"
                with open(os.path.join(self.dir, fn), "wb") as f:
                    f.write(b)
                d["file"] = self.case + "/" + fn
            self.arrays[key] = d
        return key

    def digest(self, a, keep_limit=1 << 20):
        a = np.ascontiguousarray(a)
        if a.nbytes <= keep_limit:
            return {"ref": self.put(a)}
        rows = [hashlib.sha256(a[i].tobytes()).hexdigest()[:16] for i in range(a.shape[0])]
        return {"dtype": {"int32": "i4", "uint8": "u1", "float32": "f4"}[str(a.dtype)],
                "shape": list(a.shape), "sha256": hashlib.sha256(a.tobytes()).hexdigest(),
                "rows": rows}


# --------------------------------------------------------------- recorders
class Rec:
    def __init__(self, store):
        self.S = store
        self.fit = None          # the record of the fit_grid call in progress
        self.extra = {"lattice_dp": [], "axis_chain": [], "band_profiles": [], "refine_positions_per_band": [],
                      "index_map": [],
                      "exclusive_slot_occupancy": [], "estimate_period": [],
                      "estimate_axis": [], "chain_to_cuts": [], "chain_energy_z": []}
        self.norm = {}           # profile key -> _normalise(profile) key
        self.ev_of = {}          # id(ev) -> index within its fit
        self.keep = []           # keeps ev objects alive so ids are not reused
        self.recording = True
        self.img_names = {}      # array key -> "rgba" / "quantized" / "fusion_quantized"

    def target(self):
        return self.fit if self.fit is not None else self.extra

    def prof(self, p):
        k = self.S.put(np.asarray(p, np.float64) if np.asarray(p).dtype != np.float64 else p)
        if k not in self.norm:
            self.norm[k] = self.S.put(ORIG["_normalise"](p))
        return k

    def ev(self, ev):
        return self.ev_of[id(ev)]


ORIG = {}
R = None


def caller(depth=2):
    return sys._getframe(depth).f_code.co_name


def install():
    for name in ["lattice_dp", "_axis_chain", "band_profiles", "refine_positions_per_band",
                 "_knot_cuts_per_band", "_rasterise_cuts", "_index_map_from_cuts",
                 "_exclusive_slot_occupancy", "estimate_period_ev", "estimate_axis_ev",
                 "_evidence_refine_step", "_normalise", "_comb_score", "_tiles_ray_z",
                 "is_jpeg_suspect", "is_jpeg_lattice", "axis_profiles", "_jpeg_lattice_strength",
                 "_notch_jpeg", "_grad_maps", "_tile_peaks", "_axis_spectrum", "estimate_period",
                 "fit_grid", "chain_to_cuts", "_chain_energy_z"]:
        ORIG[name] = getattr(C, name)
    ORIG["score"] = C._AxisEvidence.score
    ORIG["refine"] = C._AxisEvidence.refine
    ORIG["candidate_steps"] = C._AxisEvidence.candidate_steps
    ORIG["ev_init"] = C._AxisEvidence.__init__
    ORIG["vc_z_channel"] = V.CellVarContrast.z_channel
    ORIG["vc_contrast"] = V.CellVarContrast.contrast
    ORIG["vc_best_pair"] = V.CellVarContrast.best_pair
    ORIG["kmeans_quantize"] = Q.kmeans_quantize

    S = lambda: R.S  # noqa: E731

    # ---- calls INTO this half ------------------------------------------
    def lattice_dp(profile, step, phase, n_targets=None, dev_ratio=0.45, stiffness=4.0,
                   anchor=0.5, margin=0.35):
        out = ORIG["lattice_dp"](profile, step, phase, n_targets, dev_ratio, stiffness, anchor, margin)
        if R.recording:
            R.target()["lattice_dp"].append({
                "profile": R.prof(profile), "step": f8(step), "phase": f8(phase),
                "n_targets": None if n_targets is None else int(n_targets),
                "dev_ratio": f8(dev_ratio), "stiffness": f8(stiffness), "anchor": f8(anchor),
                "margin": f8(margin), "out": S().put(out), "caller": caller()})
        return out
    C.lattice_dp = lattice_dp

    def _axis_chain(profile, step, phase, extent, mode):
        out = ORIG["_axis_chain"](profile, step, phase, extent, mode)
        if R.recording:
            R.target()["axis_chain"].append({
                "profile": R.prof(profile), "step": f8(step), "phase": f8(phase),
                "extent": int(extent), "mode": mode, "out": S().put(out)})
        return out
    C._axis_chain = _axis_chain

    def band_profiles(rgba, n_bands, axis, kind):
        out = ORIG["band_profiles"](rgba, n_bands, axis, kind)
        if R.recording:
            k = S().put(rgba)
            R.target()["band_profiles"].append({
                "img": k, "img_is": R.img_names.get(k), "n_bands": int(n_bands), "axis": int(axis),
                "kind": kind, "out": S().put(out), "caller": caller()})
        return out
    C.band_profiles = band_profiles
    # fusion.py binds band_profiles at IMPORT time (from .channels import
    # ...), so patching the channels module alone would miss its calls;
    # _exclusive_slot_occupancy it imports inside _axis_detect, at call time
    assert FU.band_profiles is ORIG["band_profiles"]
    FU.band_profiles = band_profiles

    def refine_positions_per_band(bands, positions, step, dev_ratio=0.4, prior=3.0,
                                  smooth=4.0, n_iters=3):
        out = ORIG["refine_positions_per_band"](bands, positions, step, dev_ratio, prior,
                                                smooth, n_iters)
        if R.recording:
            for b in bands:
                R.prof(b)
            R.target()["refine_positions_per_band"].append({
                "bands": S().put(bands), "positions": S().put(positions), "step": f8(step),
                "dev_ratio": f8(dev_ratio), "prior": f8(prior), "smooth": f8(smooth),
                "n_iters": int(n_iters), "out": S().put(out)})
        return out
    C.refine_positions_per_band = refine_positions_per_band

    def _knot_cuts_per_band(band_knots, extent):
        out = ORIG["_knot_cuts_per_band"](band_knots, extent)
        if R.recording:
            R.target()["knot_cuts"].append({"band_knots": S().put(band_knots),
                                            "extent": int(extent), "out": S().put(out)})
        return out
    C._knot_cuts_per_band = _knot_cuts_per_band

    def _rasterise_cuts(band_pos, extent, length):
        out = ORIG["_rasterise_cuts"](band_pos, extent, length)
        if R.recording:
            R.target()["rasterise"].append({"band_pos": S().put(band_pos), "extent": int(extent),
                                            "length": int(length), "out": S().put(out)})
        return out
    C._rasterise_cuts = _rasterise_cuts

    def _index_map_from_cuts(cuts_per_line, extent):
        out = ORIG["_index_map_from_cuts"](cuts_per_line, extent)
        if R.recording:
            R.target()["index_map"].append({"cuts": S().put(cuts_per_line), "extent": int(extent),
                                            "out": S().digest(out)})
        return out
    C._index_map_from_cuts = _index_map_from_cuts

    def _exclusive_slot_occupancy(profile, s_small, phase_small, s_big):
        out = ORIG["_exclusive_slot_occupancy"](profile, s_small, phase_small, s_big)
        if R.recording:
            R.target()["exclusive_slot_occupancy"].append({
                "profile": R.prof(profile), "s_small": f8(s_small), "phase_small": f8(phase_small),
                "s_big": f8(s_big), "out": f8(out), "caller": caller()})
        return out
    C._exclusive_slot_occupancy = _exclusive_slot_occupancy

    def estimate_period_ev(ev, min_step=2.0, max_step=None, harmonic_tol=0.88):
        out = ORIG["estimate_period_ev"](ev, min_step, max_step, harmonic_tol)
        if R.recording:
            R.fit["estimate_period_ev"].append({
                "ev": R.ev(ev), "min_step": f8(min_step), "max_step": f8(max_step),
                "harmonic_tol": f8(harmonic_tol),
                "out": [f8(out[0]), f8(out[1]), f8(out[2])], "out_np": is_np(out[0])})
        return out
    C.estimate_period_ev = estimate_period_ev

    def estimate_axis_ev(ev1, ev2, min_step=2.0):
        out = ORIG["estimate_axis_ev"](ev1, ev2, min_step)
        if R.recording:
            R.fit["estimate_axis_ev"].append({
                "ev1": R.ev(ev1), "ev2": R.ev(ev2), "min_step": f8(min_step),
                "out": [f8(out[0]), f8(out[1]), out[2], f8(out[3])], "out_np": is_np(out[0])})
        return out
    C.estimate_axis_ev = estimate_axis_ev

    def _evidence_refine_step(ev, step):
        out = ORIG["_evidence_refine_step"](ev, step)
        if R.recording:
            R.fit["evidence_refine_step"].append({
                "ev": R.ev(ev), "step": f8(step), "step_np": is_np(step),
                "out": [f8(out[0]), f8(out[1]), f8(out[2])], "out_np": is_np(out[0])})
        return out
    C._evidence_refine_step = _evidence_refine_step

    # ---- calls OUT of this half (answers the JS replay hands back) ------
    def _normalise(profile):
        return ORIG["_normalise"](profile)
    C._normalise = _normalise

    def _comb_score(pp, step, phase_res=0.25):
        out = ORIG["_comb_score"](pp, step, phase_res)
        if R.recording and caller() == "estimate_period_ev":
            ev = sys._getframe(1).f_locals["ev"]
            if R.xf and R.xf.get("comb"):
                out = R.xf["comb"](R.ev(ev), step, out)
            R.fit["ev"][R.ev(ev)]["comb"][f8(step)] = [f8(out[0]), f8(out[1])]
        return out
    C._comb_score = _comb_score

    def _tiles_ray_z(tiles, step):
        out = ORIG["_tiles_ray_z"](tiles, step)
        if R.recording and caller() == "estimate_period_ev":
            ev = sys._getframe(1).f_locals["ev"]
            if R.xf and R.xf.get("tiles"):
                out = R.xf["tiles"](R.ev(ev), step, out)
            R.fit["ev"][R.ev(ev)]["tiles_z"][f8(step)] = f8(out)
        return out
    C._tiles_ray_z = _tiles_ray_z

    def is_jpeg_suspect(step):
        out = ORIG["is_jpeg_suspect"](step)
        if R.recording and caller() == "estimate_period_ev":
            R.fit["jpeg_suspect"][f8(step)] = bool(out)
        return out
    C.is_jpeg_suspect = is_jpeg_suspect

    def is_jpeg_lattice(step, phase):
        out = ORIG["is_jpeg_lattice"](step, phase)
        if R.recording and caller() == "fit_grid":
            R.fit["jpeg_lattice"].append({"step": f8(step), "phase": f8(phase), "out": bool(out)})
        return out
    C.is_jpeg_lattice = is_jpeg_lattice

    def axis_profiles(rgba):
        out = ORIG["axis_profiles"](rgba)
        if R.recording and caller() == "fit_grid":
            R.fit["axis_profiles"].append({"img": S().put(rgba),
                                           "out": {k: R.prof(v) for k, v in out.items()}})
        return out
    C.axis_profiles = axis_profiles

    def _jpeg_lattice_strength(profile):
        out = ORIG["_jpeg_lattice_strength"](profile)
        if R.recording and caller() == "fit_grid":
            R.fit["jpeg_strength"].append({"profile": R.prof(profile), "out": f8(out)})
        return out
    C._jpeg_lattice_strength = _jpeg_lattice_strength

    def _notch_jpeg(profile, width=1.0):
        out = ORIG["_notch_jpeg"](profile, width)
        if R.recording and caller() == "fit_grid":
            R.fit["notch"].append({"in": R.prof(profile), "out": R.prof(out)})
        return out
    C._notch_jpeg = _notch_jpeg

    def _grad_maps(rgba, quantized):
        out = ORIG["_grad_maps"](rgba, quantized)
        if R.recording and caller() == "fit_grid":
            R.fit["grad_maps"] += 1
            R.gm_ids = {id(v): k for k, v in out.items()}
        return out
    C._grad_maps = _grad_maps

    def _tile_peaks(dmap, axis, offset=1, max_tiles=360):
        out = ORIG["_tile_peaks"](dmap, axis, offset, max_tiles)
        if R.recording and caller() == "fit_grid":
            R.fit["tile_peaks"].append([R.gm_ids.get(id(dmap)), int(axis), len(out)])
            R.tile_ids[id(out)] = len(R.fit["tile_peaks"]) - 1
            R.keep.append(out)
        return out
    C._tile_peaks = _tile_peaks

    def _axis_spectrum(dmaps, axis, row_group=4, max_win=1024):
        out = ORIG["_axis_spectrum"](dmaps, axis, row_group, max_win)
        if R.recording and caller() == "fit_grid":
            R.fit["axis_spectrum"].append([[R.gm_ids.get(id(d)) for d in dmaps], int(axis)])
            R.spec_ids[id(out)] = len(R.fit["axis_spectrum"]) - 1
            R.keep.append(out)
        return out
    C._axis_spectrum = _axis_spectrum

    def ev_init(self, profile, bands, tiles=None, spectrum=None, extra_z=None,
                extra_candidates=None):
        ORIG["ev_init"](self, profile, bands, tiles, spectrum, extra_z, extra_candidates)
        if R.fit is None:
            return
        idx = len(R.fit["ev"])
        R.ev_of[id(self)] = idx
        R.keep.append(self)
        R.fit["ev"].append({
            "idx": idx, "profile": R.prof(profile),
            "bands": None if bands is None else S().put(bands),
            "tiles": R.tile_ids.get(id(tiles)) if tiles is not None else None,
            "spectrum": R.spec_ids.get(id(spectrum)) if spectrum is not None else None,
            "extra_z_is_none": extra_z is None,
            "extra_candidates": [f8(s) for s in (extra_candidates or [])],
            "score": {}, "refine": {}, "cands": {}, "comb": {}, "tiles_z": {}})
        if bands is not None:
            for b in bands:
                R.prof(b)
    C._AxisEvidence.__init__ = ev_init

    def score(self, step):
        out = ORIG["score"](self, step)
        if R.xf and R.xf.get("score") and id(self) in R.ev_of:
            out = R.xf["score"](R.ev(self), step, out, lambda s2: ORIG["score"](self, s2))
        if R.recording and id(self) in R.ev_of:
            d = R.fit["ev"][R.ev(self)]["score"]
            v = [f8(out[0]), f8(out[1])]
            assert d.get(f8(step), v) == v, "ev.score is not a function of its step"
            d[f8(step)] = v
        return out
    C._AxisEvidence.score = score

    def refine(self, step):
        out = ORIG["refine"](self, step)
        if R.recording and id(self) in R.ev_of:
            R.fit["ev"][R.ev(self)]["refine"][f8(step)] = [f8(out), is_np(out)]
        return out
    C._AxisEvidence.refine = refine

    def candidate_steps(self, min_step, max_step):
        out = ORIG["candidate_steps"](self, min_step, max_step)
        if R.xf and R.xf.get("cands") and id(self) in R.ev_of:
            out = R.xf["cands"](R.ev(self), min_step, max_step, out)
        if R.recording and id(self) in R.ev_of:
            R.fit["ev"][R.ev(self)]["cands"][f8(min_step) + ":" + f8(max_step)] = \
                [[f8(s), is_np(s)] for s in out]
        return out
    C._AxisEvidence.candidate_steps = candidate_steps

    def vc_z_channel(self, *a, **k):
        out = ORIG["vc_z_channel"](self, *a, **k)
        if R.recording and R.fit is not None and caller() == "fit_grid":
            R.fit["vc"]["cands"] = [[f8(s), f8(z)] for s, z in out[1]]
            R.fit["vc"]["cands_np"] = [[is_np(s), is_np(z)] for s, z in out[1]]
        return out
    V.CellVarContrast.z_channel = vc_z_channel

    def vc_contrast(self, step_x, step_y=None, n_phases=3):
        out = ORIG["vc_contrast"](self, step_x, step_y, n_phases)
        if R.recording and R.fit is not None and caller() == "fit_grid":
            R.fit["vc"]["contrast"].append({"step_x": f8(step_x), "step_y": f8(step_y),
                                            "n_phases": n_phases, "out": [f8(v) for v in out]})
        return out
    V.CellVarContrast.contrast = vc_contrast

    def vc_best_pair(self, pairs, n_phases=4):
        out = ORIG["vc_best_pair"](self, pairs, n_phases)
        if R.recording and R.fit is not None and caller() == "fit_grid":
            R.fit["vc"]["best_pair"].append({
                "pairs": [[f8(a), f8(b)] for a, b in pairs], "n_phases": n_phases,
                "out": [[f8(a), f8(b), f8(q)] for a, b, q in out]})
        return out
    V.CellVarContrast.best_pair = vc_best_pair

    def kmeans_quantize(rgba, k=16, sample_max=60_000, seed=42):
        out = ORIG["kmeans_quantize"](rgba, k, sample_max, seed)
        if R.recording and R.fit is not None and caller() == "fit_grid":
            kq = S().put(out[0])
            R.img_names.setdefault(kq, "quantized")
            R.fit["kmeans"] = {"base": S().put(rgba), "k": int(k), "quantized": kq}
        elif R.recording and R.fit is None:
            R.img_names.setdefault(S().put(out[0]), "fusion_quantized")
        return out
    Q.kmeans_quantize = kmeans_quantize

    def fit_grid(rgba, target_cells=None, force_step=None, allow_warp=True, min_score=2.2,
                 max_output=512, quantized=None, quantize_colors=16):
        R.fit = {"args": {"target_cells": target_cells, "force_step": f8(force_step),
                          "allow_warp": bool(allow_warp), "min_score": f8(min_score),
                          "max_output": int(max_output),
                          "quantized": None if quantized is None else R.S.put(quantized),
                          "quantize_colors": int(quantize_colors)},
                 "kmeans": None, "axis_profiles": [], "jpeg_strength": [], "notch": [],
                 "grad_maps": 0, "tile_peaks": [], "axis_spectrum": [], "ev": [],
                 "jpeg_suspect": {}, "jpeg_lattice": [],
                 "vc": {"cands": None, "contrast": [], "best_pair": []},
                 "estimate_axis_ev": [], "estimate_period_ev": [], "evidence_refine_step": [],
                 "exclusive_slot_occupancy": [], "axis_chain": [], "lattice_dp": [],
                 "band_profiles": [], "refine_positions_per_band": [], "knot_cuts": [],
                 "rasterise": [], "index_map": []}
        R.ev_of = {}
        R.tile_ids = {}
        R.spec_ids = {}
        R.gm_ids = {}
        t0 = time.time()
        g = ORIG["fit_grid"](rgba, target_cells, force_step, allow_warp, min_score, max_output,
                             quantized, quantize_colors)
        R.fit["secs"] = round(time.time() - t0, 3)
        R.fit["grid"] = {
            "width": g.width, "height": g.height, "cols": g.cols, "rows": g.rows,
            "step_x": f8(g.step_x), "step_y": f8(g.step_y), "score_x": f8(g.score_x),
            "score_y": f8(g.score_y), "mode_x": g.mode_x, "mode_y": g.mode_y,
            "is_periodic": bool(g.is_periodic),
            "xcuts": R.S.digest(g.xcuts, 4 << 20), "ycuts": R.S.digest(g.ycuts, 4 << 20),
            "col_index": R.S.digest(g.col_index), "row_index": R.S.digest(g.row_index),
            "cell_index": R.S.digest(g.cell_index),
            "xcuts_dtype": str(g.xcuts.dtype), "col_index_dtype": str(g.col_index.dtype),
            "row_index_contiguous": bool(g.row_index.flags["C_CONTIGUOUS"])}
        rec, R.fit = R.fit, None
        R.fits.append(rec)
        return g
    C.fit_grid = fit_grid


def c_extent(fit, r):
    """The extent a band refinement's cuts end at: the band profile length
    minus one for cut mode (W+1 profile), the length for knot mode (W)."""
    d = R.S.arrays[r["bands"]]
    return d["shape"][1] - 1


# ---------------------------------------------------------------- one case
def fusion_cache_files():
    d = os.path.join(os.getcwd(), "out", "progress", "methods", "fusion", "cache")
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def run_one(name):
    global R
    # fusion._cached_matrices keeps an ON-DISK cache of channel matrices
    # under os.getcwd()/out/progress/methods/fusion/cache (OUT_DIR frozen
    # from the cwd at import), keyed by image content only. A hit skips the
    # computation and carries ANOTHER process's k-means RNG state. So this
    # child must start in its own fresh, empty directory (the driver makes
    # it and deletes it) and must leave exactly one computed cache file per
    # fusion.detect - never load one. MEASURED the hard way: the first
    # version of this script ran with the repository as cwd, wrote six
    # cache files there, and its later runs loaded them.
    assert os.path.basename(os.getcwd()) == "cwd-%s.tmp" % name, os.getcwd()
    assert os.path.normcase(os.path.abspath(FU.OUT_DIR)).startswith(os.path.normcase(os.getcwd())), FU.OUT_DIR
    assert fusion_cache_files() == [], fusion_cache_files()
    t0 = time.time()
    rgba = load_case(name)
    h, w = rgba.shape[:2]
    S = Store(name)
    R = Rec(S)
    R.xf = TRANSFORMS.get(name)
    R.fits = []
    R.tile_ids, R.spec_ids, R.gm_ids = {}, {}, {}
    install()
    k_rgba = S.put(rgba)
    R.img_names[k_rgba] = "rgba"

    # 1. the reference call path: fit_grid(rgba) - the first k-means draw
    #    of this process, exactly as a fresh caller makes it
    g = C.fit_grid(rgba)
    q = R.fits[0]["kmeans"]["quantized"] if R.fits[0]["kmeans"] else None
    quant = None
    if q is not None:
        d = S.arrays[q]
        raw = bytes.fromhex(d["hex"]) if "hex" in d else open(os.path.join(OUT, d["file"]), "rb").read()
        quant = np.frombuffer(raw, np.uint8).reshape(d["shape"]).copy()
    overlay = C.render_grid_overlay(rgba, g)
    overlay_rec = {"out": S.digest(overlay)}
    cell = g.cell_index

    # 2. the same image through the other branches, with the SAME quantized
    #    passed in (no further k-means draws in these three)
    R.fits[0]["label"] = "fit_grid(rgba)"
    if quant is not None:
        C.fit_grid(rgba, force_step=float(g.step_x) * 1.0, quantized=quant)
        R.fits[-1]["label"] = "fit_grid(rgba, force_step=step_x, quantized=q)"
        C.fit_grid(rgba, allow_warp=False, quantized=quant)
        R.fits[-1]["label"] = "fit_grid(rgba, allow_warp=False, quantized=q)"
        C.fit_grid(rgba, quantized=quant, max_output=max(8, w // 8), target_cells=40)
        R.fits[-1]["label"] = "fit_grid(rgba, quantized=q, max_output=w//8, target_cells=40)"

    # 3. direct calls on this image's own profiles, off the fit_grid path
    ex = R.extra
    ap = R.fits[0]["axis_profiles"]
    prof_q = {k: v for k, v in ORIG["axis_profiles"](quant if quant is not None else rgba).items()}
    prof_o = ORIG["axis_profiles"](rgba)
    profs = {"e1x": prof_q["e1x"], "e1y": prof_q["e1y"], "e2x": prof_o["e2x"], "e2y": prof_o["e2y"]}
    for key in profs:
        R.prof(profs[key])
    sx, sy = float(g.step_x), float(g.step_y)
    for key, s0 in (("e1x", sx), ("e2x", sx), ("e1y", sy), ("e2y", sy)):
        p = profs[key]
        n = len(p) - 1
        for s in sorted({2.0, 2.5, 3.0, 4.37, s0, s0 * 0.5, s0 * 2.0, 7.1, 11.9, n / 3.0, n / 3.0 + 0.01}):
            for ph in (0.0, 0.37 * s, s - 0.01):
                ex["chain_energy_z"].append({"profile": R.prof(p), "step": f8(s), "phase": f8(ph),
                                             "out": f8(ORIG["_chain_energy_z"](p, s, ph))})
                if 1.2 < s < n / 2:
                    for nt in (None, 1, max(1, int(round(n / s)) - 1), int(round(n / s)) + 2):
                        for kw in ({}, {"dev_ratio": 0.2, "stiffness": 1.0, "anchor": 2.0, "margin": 0.0}):
                            out = ORIG["lattice_dp"](p, s, ph, nt, **kw) if kw else ORIG["lattice_dp"](p, s, ph, nt)
                            d = {"dev_ratio": 0.45, "stiffness": 4.0, "anchor": 0.5, "margin": 0.35}
                            d.update(kw)
                            ex["lattice_dp"].append({
                                "profile": R.prof(p), "step": f8(s), "phase": f8(ph),
                                "n_targets": nt, "dev_ratio": f8(d["dev_ratio"]),
                                "stiffness": f8(d["stiffness"]), "anchor": f8(d["anchor"]),
                                "margin": f8(d["margin"]), "out": S.put(out), "caller": "direct"})
        for s_small, s_big in ((s0, 2 * s0), (s0, 3 * s0), (s0 / 2, s0), (s0 / 3, s0), (2.5, 7.5)):
            for ph in (0.0, 0.3 * s_small):
                ex["exclusive_slot_occupancy"].append({
                    "profile": R.prof(p), "s_small": f8(s_small), "phase_small": f8(ph),
                    "s_big": f8(s_big),
                    "out": f8(ORIG["_exclusive_slot_occupancy"](p, s_small, ph, s_big)),
                    "caller": "direct"})
    # estimate_axis on the (quantized E1, original E2) pairs, recording the
    # first half's estimate_period answers it selects between
    for e1, e2 in (("e1x", "e2x"), ("e1y", "e2y")):
        calls = []

        def ep(profile, min_step=2.0, max_step=None, harmonic_tol=0.88, _calls=calls):
            out = ORIG["estimate_period"](profile, min_step, max_step, harmonic_tol)
            _calls.append({"profile": R.prof(profile), "min_step": f8(min_step),
                           "out": [f8(out[0]), f8(out[1]), f8(out[2])]})
            return out
        C.estimate_period = ep
        out = C.estimate_axis(profs[e1], profs[e2])
        C.estimate_period = ORIG["estimate_period"]
        ex["estimate_axis"].append({"e1": R.prof(profs[e1]), "e2": R.prof(profs[e2]),
                                    "calls": calls,
                                    "out": [f8(out[0]), f8(out[1]), out[2], f8(out[3])]})
    # chain_to_cuts on every chain the fits produced, in both modes
    for fit in R.fits:
        for c in fit["axis_chain"]:
            d = S.arrays[c["out"]]
            pos = np.frombuffer(bytes.fromhex(d["hex"]), np.int32).astype(np.int64) if "hex" in d else None
            if pos is None:
                continue
            for mode in ("cut", "knot"):
                ex["chain_to_cuts"].append({"positions": S.put(pos), "extent": c["extent"],
                                            "mode": mode,
                                            "out": S.put(ORIG["chain_to_cuts"](pos, c["extent"], mode))})
    # edges no fit reached (measured by the JS coverage run): a chain count
    # of 1 (nt < 1), a lattice with no target (k1 < k0), no exclusive slot
    # (s_big ~ s_small), a profile without a single peak
    for key in ("e1x", "e2y"):
        p = profs[key]
        n = len(p) - 1
        extent = n if key.startswith("e1") else n + 1
        for s in (extent / 1.2, extent / 2.6, extent / 1.9, 2.0):
            for mode in ("cut", "knot"):
                ex["axis_chain"].append({"profile": R.prof(p), "step": f8(s), "phase": f8(0.3),
                                         "extent": int(extent), "mode": mode,
                                         "out": S.put(ORIG["_axis_chain"](p, s, 0.3, extent, mode))})
        for s, ph, nt in ((0.9 * n, 0.9 * n, None), (0.9 * n, 0.9 * n, 3), (n / 2.5, 0.1, None)):
            ex["lattice_dp"].append({"profile": R.prof(p), "step": f8(s), "phase": f8(ph), "n_targets": nt,
                                     "dev_ratio": f8(0.45), "stiffness": f8(4.0), "anchor": f8(0.5),
                                     "margin": f8(0.35), "out": S.put(ORIG["lattice_dp"](p, s, ph, nt)),
                                     "caller": "direct"})
        for s_small, s_big in ((sx, sx * 1.05), (sx, sx * 0.97), (4.0, 4.4)):
            ex["exclusive_slot_occupancy"].append({
                "profile": R.prof(p), "s_small": f8(s_small), "phase_small": f8(0.2), "s_big": f8(s_big),
                "out": f8(ORIG["_exclusive_slot_occupancy"](p, s_small, 0.2, s_big)), "caller": "direct"})
    for fit in R.fits[:1]:
        for r in fit["refine_positions_per_band"]:
            bd = S.arrays[r["bands"]]
            braw = bytes.fromhex(bd["hex"]) if "hex" in bd else open(os.path.join(OUT, bd["file"]), "rb").read()
            bands = np.frombuffer(braw, np.float64).reshape(bd["shape"]).copy()
            pd = S.arrays[r["positions"]]
            pos = np.frombuffer(bytes.fromhex(pd["hex"]), np.int32).astype(np.int64)
            st = float(np.frombuffer(bytes.fromhex(r["step"]), np.float64)[0])
            # every third position pushed PAST its right neighbour (1.4
            # steps): only then does np.maximum.accumulate have anything to
            # do (+0.6 steps, the first version, never crossed and a mutant
            # without the monotone pass survived it)
            crossed = pos.copy()
            crossed[1::3] = np.minimum(crossed[1::3] + int(round(1.4 * st)), bands.shape[1] - 1)
            # step*0.4 exactly on .5: round-half-to-even picks the even dev
            for st2, p2 in ((6.25, pos), (16.25, pos), (st, crossed), (st * 1.5, crossed)):
                for b in bands:
                    R.prof(b)
                ex["refine_positions_per_band"].append({
                    "bands": S.put(bands), "positions": S.put(p2), "step": f8(st2), "dev_ratio": f8(0.4),
                    "prior": f8(3.0), "smooth": f8(4.0), "n_iters": 3,
                    "out": S.put(ORIG["refine_positions_per_band"](bands, p2, st2))})
        for r in fit["rasterise"]:
            cd = S.arrays[r["out"]]
            craw = bytes.fromhex(cd["hex"]) if "hex" in cd else open(os.path.join(OUT, cd["file"]), "rb").read()
            cuts = np.frombuffer(craw, np.float32).reshape(cd["shape"]).copy()
            short = (cuts * np.float32(0.9)).astype(np.float32)
            ex["index_map"].append({"cuts": S.put(short), "extent": int(r["extent"]),
                                    "out": S.digest(ORIG["_index_map_from_cuts"](short, int(r["extent"])))})
    # _axis_chain across a sweep of steps: some land near a count boundary
    for key in ("e1x", "e2y"):
        p = profs[key]
        extent = (len(p) - 1) if key.startswith("e1") else len(p)
        for st in np.linspace(max(2.0, extent / 60.0), extent / 2.2, 24):
            for mode in ("cut", "knot"):
                ex["axis_chain"].append({"profile": R.prof(p), "step": f8(st), "phase": f8(0.37 * st),
                                         "extent": int(extent), "mode": mode,
                                         "out": S.put(ORIG["_axis_chain"](p, float(st), 0.37 * float(st),
                                                                          extent, mode))})
    zp = np.zeros(81)
    zcalls = []

    def ep0(profile, min_step=2.0, max_step=None, harmonic_tol=0.88, _calls=zcalls):
        out = ORIG["estimate_period"](profile, min_step, max_step, harmonic_tol)
        _calls.append({"profile": R.prof(profile), "min_step": f8(min_step),
                       "out": [f8(out[0]), f8(out[1]), f8(out[2])]})
        return out
    C.estimate_period = ep0
    zo = C.estimate_axis(zp, zp[:-1])
    C.estimate_period = ORIG["estimate_period"]
    ex["estimate_axis"].append({"e1": R.prof(zp), "e2": R.prof(zp[:-1]), "calls": zcalls,
                                "out": [f8(zo[0]), f8(zo[1]), zo[2], f8(zo[3])]})
    for fit in R.fits[:1]:
        for r in fit["refine_positions_per_band"][:1]:
            od = S.arrays[r["out"]]
            oraw = bytes.fromhex(od["hex"]) if "hex" in od else open(os.path.join(OUT, od["file"]), "rb").read()
            fpos = np.frombuffer(oraw, np.float64).reshape(od["shape"])[0].copy()
            for mode in ("cut", "knot"):
                ex["chain_to_cuts"].append({"positions": S.put(fpos), "extent": int(c_extent(fit, r)),
                                            "mode": mode,
                                            "out": S.put(ORIG["chain_to_cuts"](fpos, int(c_extent(fit, r)), mode))})
            bd = S.arrays[r["bands"]]
            braw = bytes.fromhex(bd["hex"]) if "hex" in bd else open(os.path.join(OUT, bd["file"]), "rb").read()
            bands = np.frombuffer(braw, np.float64).reshape(bd["shape"]).copy()
            pd = S.arrays[r["positions"]]
            pos = np.frombuffer(bytes.fromhex(pd["hex"]), np.int32).astype(np.int64)
            past = np.concatenate([pos, [bands.shape[1] + 7]])
            st = float(np.frombuffer(bytes.fromhex(r["step"]), np.float64)[0])
            ex["refine_positions_per_band"].append({
                "bands": S.put(bands), "positions": S.put(past), "step": f8(st), "dev_ratio": f8(0.4),
                "prior": f8(3.0), "smooth": f8(4.0), "n_iters": 3,
                "out": S.put(ORIG["refine_positions_per_band"](bands, past, st))})
    flat = np.zeros(97)
    ex["exclusive_slot_occupancy"].append({
        "profile": R.prof(flat), "s_small": f8(3.0), "phase_small": f8(0.0), "s_big": f8(6.0),
        "out": f8(ORIG["_exclusive_slot_occupancy"](flat, 3.0, 0.0, 6.0)), "caller": "direct flat"})
    for mode in ("cut", "knot"):
        for pos in (np.array([], np.int64), np.array([5], np.int64), np.array([3, 3, 9], np.int64)):
            ex["chain_to_cuts"].append({"positions": S.put(pos), "extent": 12, "mode": mode,
                                        "out": S.put(ORIG["chain_to_cuts"](pos, 12, mode))})

    # 4. the fusion call sites (their own k-means draws come last and only
    #    their arguments are kept)
    FU.build_evidence(rgba, lean=False)
    if name in FUSION_DETECT:
        FU.detect(rgba)
    n_cache = len(fusion_cache_files())
    assert n_cache == (1 if name in FUSION_DETECT else 0), n_cache

    case = {
        "name": name, "w": int(w), "h": int(h), "cn": int(rgba.shape[2]), "rgba": k_rgba,
        "transform": name if name in TRANSFORMS else None,
        "fits": R.fits, "extra": R.extra, "overlay": overlay_rec,
        "cell_index_fit0": S.digest(cell), "normalise": R.norm, "arrays": S.arrays,
        "fusion_cache_files_written": n_cache,
        "secs": round(time.time() - t0, 2)}
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(case, f)
    f0 = R.fits[0]
    print("  %-11s %4dx%-4d grid %3dx%-3d step (%.4f, %.4f) %s/%s periodic=%s  score(%.3f, %.3f)"
          "  ev.score=%d  fits=%d  %.1fs" % (
              name, w, h, f0["grid"]["cols"], f0["grid"]["rows"], g.step_x, g.step_y,
              g.mode_x, g.mode_y, g.is_periodic, g.score_x, g.score_y,
              sum(len(e["score"]) for e in f0["ev"]), len(R.fits), time.time() - t0))


# ------------------------------------------------- float hash / set order
def hash_table():
    rng = np.random.default_rng(5)
    vals = list(rng.uniform(0.01, 80, 1500)) + list(-rng.uniform(0.01, 80, 300))
    vals += [2.0, 2.5, 3.0, 4.37, 64.0, 0.5, 1e-300, 5e-324, 1e300, 2.0 ** 60, 2.0 ** 61, 2.0 ** 62 + 2.0 ** 10,
             -1.0, -2.0 ** 61, 1.0 / 3.0, 10.3216, 19.59375, 2.12345]
    vals += [round(float(v), 4) for v in rng.uniform(2, 64, 1000)]
    vals += [float(np.round(v, 4)) for v in rng.uniform(2, 64, 1000)]
    out = {"hash": [[f8(v), str(hash(float(v)))] for v in vals], "sets": []}
    for _ in range(600):
        k = int(rng.integers(2, 5))
        vs = [round(float(v), 4) for v in rng.uniform(2, 64, k)]
        if rng.random() < 0.2:
            vs[1] = vs[0]
        if rng.random() < 0.3:   # colliding low bits: same value mod 8 in the hash
            vs[-1] = float(int(vs[0]) + 8 * int(rng.integers(1, 5)))
        s = set()
        for v in vs:
            s.add(v)
        out["sets"].append({"vals": [f8(v) for v in vs], "order": [f8(v) for v in s]})
    # the literal form _evidence_refine_step uses, with an np.float64 first
    for _ in range(300):
        a = np.float64(round(float(rng.uniform(2, 64)), 4))
        b = round(float(rng.uniform(2, 64)), 4) if rng.random() < 0.7 else float(a)
        s = {a, b}
        out["sets"].append({"vals": [f8(a), f8(b)], "order": [f8(v) for v in s],
                            "kinds": [type(v).__name__ for v in s]})
    # round(x, n) on a numpy.float64 vs a Python float, where they differ
    rv = [2.675, 2.12345, 1.0005, 0.285, 1.2345678] + list(rng.uniform(2, 64, 400))
    rv += [k / 2000.0 + d for k in range(4000, 4060) for d in (-1e-13, 0.0, 1e-13)]
    # half of a 4-decimal step: a 5th-decimal 5 whose binary value sits just
    # off the tie - where numpy's x*10**n lands exactly on .5 and CPython's
    # exact decimal does not
    rv += [round(float(v), 4) / 2 for v in rng.uniform(2, 64, 1500)]
    out["round"] = [[f8(v), n, f8(round(np.float64(v), n)), f8(round(float(v), n))]
                    for v in rv for n in (2, 3, 4)]
    return out


def main():
    if "--one" in sys.argv:
        run_one(sys.argv[sys.argv.index("--one") + 1])
        return
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    print("reference: %s  numpy %s  scipy %s  cv2 %s  python %s" % (
        os.path.dirname(C.__file__), np.__version__, scipy.__version__, cv2.__version__,
        platform.python_version()))
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    names = [] if "--index-only" in sys.argv else (only or CASES)
    bad = 0
    for name in names:
        # one process per case (the k-means RNG, module docstring), each
        # STARTED in a fresh empty cwd (the fusion disk cache, run_one)
        import shutil
        work = os.path.join(OUT, "cwd-%s.tmp" % name)
        if os.path.exists(work):
            shutil.rmtree(work)
        os.makedirs(work)
        try:
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--one", name], cwd=work,
                               capture_output=True, text=True, env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
        finally:
            shutil.rmtree(work)
        sys.stdout.write(r.stdout)
        if r.returncode:
            bad += 1
            sys.stdout.write(r.stderr)
    idx = {"meta": {"numpy": np.__version__, "scipy": scipy.__version__, "cv2": cv2.__version__,
                    "python": platform.python_version(), "machine": platform.machine(),
                    "reference": os.path.dirname(C.__file__)},
           "cases": [n for n in CASES if os.path.exists(os.path.join(OUT, n + ".json"))],
           "transformed": sorted(TRANSFORMS),
           "fusion_detect": sorted(FUSION_DETECT),
           "pyhash": hash_table()}
    with open(INDEX, "w") as f:
        json.dump(idx, f)
    print("wrote %s + %s/<case>.json in %.1fs%s" % (INDEX, OUT, time.time() - t0,
                                                     "  (%d case(s) FAILED)" % bad if bad else ""))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
