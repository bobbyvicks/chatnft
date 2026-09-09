"""Ground-truth fixtures for src/pf-03-cv2.js -> fixtures/cv2-parity.json.

Arrays are dumped as lowercase hex of their raw little-endian bytes (uint8,
float32 or float64 as tagged), so the JSON round trip cannot lose a bit.

kmeans fixtures are RECORDED, not re-implemented: cv2.kmeans and
cv2.setRNGSeed are wrapped before pixelfixer is imported, and the reference's
own callers (quantize.kmeans_quantize, reconsearch._quantize,
reconstruct.two_stage_pack / reconstruct(palette_snap=True)) are run on the
fixture images. Each recorded call carries the seed set since the previous
call (None = RNG state carried over). The very first call is unseeded in a
fresh process, exactly as channels.fit_grid's is.

The RNG itself is pinned through cv2.randu on a CV_64F array, which reads the
full 64-bit state (randf_64f word-swaps it) -- kmeans only ever observes the
low word.

Sections whose only purpose is to be ABLE to fail a specific wrong model are
named for it (blocks_big_then_tiny_rows_k1x7 kills a from-scratch column
sum; alternating_big_tiny_along_row_k1x7 kills a from-scratch row sum for
kw=1; widths 64..257 kill any IPP row-filter split).

Run with the pafenv interpreter:
  pafenv/Scripts/python.exe tools/parity-cv2.py
"""
import json
import os
import platform
import sys
import time

import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(ROOT)), "pixel-art-fixer", "python"))

f32, f64, u8 = np.float32, np.float64, np.uint8


def hexb(a):
    return np.ascontiguousarray(a).tobytes().hex()


# ------------------------------------------------- kmeans recorder (FIRST)
KM = []
CUR = {"name": "?", "calls": 0}
_last_seed = {"v": None}
_real_kmeans, _real_seed = cv2.kmeans, cv2.setRNGSeed


def _seed(s):
    _last_seed["v"] = int(s)
    return _real_seed(s)


def _kmeans(data, K, bestLabels, criteria, attempts, flags, *rest):
    assert bestLabels is None and flags == cv2.KMEANS_PP_CENTERS and not rest, (bestLabels, flags, rest)
    assert data.dtype == np.float32 and data.ndim == 2 and data.flags.c_contiguous, (data.dtype, data.shape)
    ctype, max_count, eps = criteria
    assert ctype == cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, ctype
    t0 = time.time()
    comp, labels, centers = _real_kmeans(data, K, bestLabels, criteria, attempts, flags)
    KM.append({
        "name": "%s#%d" % (CUR["name"], CUR["calls"]), "seed": _last_seed["v"],
        "N": int(data.shape[0]), "dims": int(data.shape[1]), "K": int(K),
        "maxCount": int(max_count), "epsilon": float(eps), "attempts": int(attempts),
        "data": hexb(data), "compactness": float(comp),
        "compactness_hex": hexb(np.array([comp], f64)),
        "labels": labels.ravel().tolist(), "centers": hexb(centers.astype(f32)),
        "secs": round(time.time() - t0, 3)})
    CUR["calls"] += 1
    _last_seed["v"] = None
    return comp, labels, centers


cv2.kmeans = _kmeans
cv2.setRNGSeed = _seed

from pixelfixer.quantize import kmeans_quantize          # noqa: E402
from pixelfixer import reconsearch                       # noqa: E402
from pixelfixer.core import detect                       # noqa: E402
from pixelfixer.reconstruct import reconstruct, two_stage_pack  # noqa: E402

IMGS = {}
for _n in ("tiny", "small", "mid"):
    IMGS[_n] = np.ascontiguousarray(np.asarray(Image.open(os.path.join(FIX, _n + ".png")).convert("RGBA")))


def section(name):
    CUR["name"] = name
    CUR["calls"] = 0


assert not KM, "no kmeans call may precede the fresh-process case"
# 1. fresh process, unseeded (what fit_grid / build_evidence do first)
section("fresh_unseeded:kmeans_quantize:tiny")
kmeans_quantize(cv2.medianBlur(IMGS["tiny"], 3), k=16)
section("chained_unseeded:kmeans_quantize:small")
kmeans_quantize(cv2.medianBlur(IMGS["small"], 3), k=16)
# 2. seeded quantize on every image
for _n in IMGS:
    for _s in (0, 1, 7):
        cv2.setRNGSeed(_s)
        section("kmeans_quantize:%s:seed%d" % (_n, _s))
        kmeans_quantize(cv2.medianBlur(IMGS[_n], 3), k=16)
# 3. reconsearch._quantize (seeds itself to 12345)
for _n in IMGS:
    _a = IMGS[_n][..., 3].astype(f32)
    _rgb = IMGS[_n][..., :3].astype(f32) * (_a[..., None] / 255.0)
    section("reconsearch._quantize:" + _n)
    reconsearch._quantize(_rgb)
# 4. detect -> two_stage_pack (api default) and reconstruct(palette_snap=True)
DET = {}
for _n in IMGS:
    cv2.setRNGSeed(5)
    section("detect:" + _n)
    r = detect(IMGS[_n])
    DET[_n] = {"step_x": r["step_x"], "step_y": r["step_y"], "cols": r["cols"], "rows": r["rows"],
               "consensus": str(r.get("consensus"))}
    cv2.setRNGSeed(5)
    section("two_stage_pack:" + _n)
    two_stage_pack(IMGS[_n], r["cols"], r["rows"])
    cv2.setRNGSeed(6)
    section("reconstruct_palette_snap:" + _n)
    reconstruct(IMGS[_n], r["step_x"], r["step_y"], r["cols"], r["rows"], color="mode", palette_snap=True)
# 5. synthetic edge cases, called through the (wrapped) cv2.kmeans directly
rng = np.random.default_rng(2026)


def direct(name, data, K, max_count, eps, attempts, seed):
    cv2.setRNGSeed(seed)
    section(name)
    cv2.kmeans(np.ascontiguousarray(data, dtype=f32), K, None,
               (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, max_count, eps),
               attempts, cv2.KMEANS_PP_CENTERS)


_pal = (rng.random((5, 3)) * 255).astype(f32)
direct("dup5_K8_empty_clusters", _pal[rng.integers(0, 5, 60)], 8, 12, 0.5, 2, 11)
direct("K1_N100", (rng.random((100, 3)) * 255).astype(f32), 1, 12, 0.5, 1, 3)
direct("N6_K2_no_unrolled_block", (rng.random((6, 3)) * 255).astype(f32), 2, 12, 0.5, 2, 4)
direct("N9_K3", (rng.random((9, 3)) * 255).astype(f32), 3, 12, 0.5, 2, 8)
direct("N2000_K48_unit_range", rng.random((2000, 3)).astype(f32), 48, 12, 0.5, 2, 9)
direct("N5000_K14_recon_crit", (rng.random((5000, 3)) * 255).astype(f32), 14, 25, 0.25, 3, 2)
direct("N48000_K14_recon_crit", (rng.random((48000, 3)) * 255).astype(f32), 14, 25, 0.25, 3, 12345)
direct("N3000_K16_integral", np.floor(rng.random((3000, 3)) * 256).astype(f32), 16, 12, 0.5, 2, 77)
direct("negative_seed", (rng.random((500, 3)) * 255).astype(f32), 6, 12, 0.5, 2, -3)
direct("seed_zero_means_ffffffff", (rng.random((500, 3)) * 255).astype(f32), 6, 12, 0.5, 2, 0)
for _s in range(20):
    direct("seedsweep_%d" % _s, (rng.random((1500, 3)) * 255).astype(f32), 12, 12, 0.5, 2, 1000 + _s)
# restore
cv2.kmeans, cv2.setRNGSeed = _real_kmeans, _real_seed

# ------------------------------------------------------------ RNG (randu)
# cv2.randu on CV_64F: temp = RNG_NEXT(state); v = (int64)((temp>>32)|(temp<<32));
# arr[i] = v * (b-a)/2^64 + (a+b)/2.  Reads the whole 64-bit state.
RU = []
for _seed in (7, 0, 1, 12345, -3, 2 ** 31 - 1, -2 ** 31, 999999937):
    cv2.setRNGSeed(_seed)
    _arr = np.zeros((1, 16), f64)
    cv2.randu(_arr, 0.0, 1.0)
    RU.append({"seed": _seed, "n": 16, "out": hexb(_arr)})

# ------------------------------------------------------------- medianBlur
MB = []


def mb_case(name, arr):
    arr = np.ascontiguousarray(arr)
    out = cv2.medianBlur(arr, 3)
    cn = 1 if arr.ndim == 2 else int(arr.shape[2])
    MB.append({"name": name, "w": int(arr.shape[1]), "h": int(arr.shape[0]), "cn": cn,
               "src": hexb(arr), "out": hexb(out)})


for _n, rgba in IMGS.items():
    mb_case("rgba4:" + _n, rgba)                     # channels:1314 fusion:71
    mb_case("rgb3:" + _n, rgba[:, :, :3])            # runlengths:49
    mb_case("alpha1:" + _n, rgba[:, :, 3])           # runlengths:50
    _rgb = rgba[..., :3].astype(f32)
    _luma = (_rgb[..., 0] * 0.299 + _rgb[..., 1] * 0.587 + _rgb[..., 2] * 0.114)
    mb_case("luma_u8:" + _n, _luma.astype(u8))       # autocorr:53 shape of call
for shape in ((13, 17), (13, 17, 3), (13, 17, 4), (1, 17, 3), (13, 1), (1, 9), (9, 1, 4),
              (2, 2, 4), (1, 1, 4), (1, 2, 4), (2, 1, 3), (3, 3), (7, 5, 3), (2, 9, 2)):
    mb_case("rand%s" % (shape,), rng.integers(0, 256, shape, dtype=u8))

# -------------------------------------------------------------- boxFilter
# cv2 5.x boxFilter() (box_filter.dispatch.cpp) routes float input with
# ksize.width <= 5 && ksize.height <= 5 to BlockSum<double,float>; every
# other size goes through FilterEngine (RowSum<float,double> +
# ColumnSum<double,float>). The JS port models only the FilterEngine path and
# throws on the blockSum path, so each case is tagged with its path. The
# FilterEngine model is ALSO run here, in numpy, and its verdict recorded
# (engine_model_matches), so the node test can show the JS engine model
# agrees with this one on every case and that the guard fences off cases
# where the engine model really is wrong (not merely untested).
BF = []


def _repl(p, n):
    return 0 if p < 0 else (n - 1 if p >= n else p)


def engine_model(src, kw, kh):
    """FilterEngine path: RowSum (3/5 from scratch, else running, double) then
    ColumnSum (running double seeded with kh-1 rows), float32(sum*scale)."""
    h, w = src.shape
    ax, ay = kw >> 1, kh >> 1
    rows = np.zeros((h, w), f64)
    for i in range(h):
        pad = [float(src[i, _repl(t - ax, w)]) for t in range(w + kw - 1)]
        if kw in (3, 5):
            for j in range(w):
                s = 0.0
                for t in range(kw):
                    s = s + pad[j + t]
                rows[i, j] = s
        else:
            acc = 0.0
            for t in range(kw):
                acc = acc + pad[t]
            rows[i, 0] = acc
            for j in range(w - 1):
                acc = acc + (pad[j + kw] - pad[j])
                rows[i, j + 1] = acc
    out = np.zeros((h, w), f32)
    scale = 1.0 / (kw * kh)
    SUM = np.zeros(w, f64)
    for t in range(kh - 1):
        SUM = SUM + rows[_repl(t - ay, h)]
    for i in range(h):
        s0 = SUM + rows[_repl(i - ay + kh - 1, h)]
        out[i] = (s0 * scale).astype(f32) if scale != 1 else s0.astype(f32)
        SUM = s0 - rows[_repl(i - ay, h)]
    return out


def bf_case(name, arr, kw, kh):
    arr = np.ascontiguousarray(arr, dtype=f32)
    out = cv2.boxFilter(arr, -1, (kw, kh), borderType=cv2.BORDER_REPLICATE)
    path = "blockSum" if (kw <= 5 and kh <= 5) else "filterEngine"
    BF.append({"name": name, "w": int(arr.shape[1]), "h": int(arr.shape[0]), "kw": kw, "kh": kh, "path": path,
               "engine_model_matches": bool(np.array_equal(engine_model(arr, kw, kh), out)),
               "src": hexb(arr), "out": hexb(out)})


for _n, rgba in IMGS.items():
    img4 = np.dstack([cv2.medianBlur(np.ascontiguousarray(rgba[:, :, :3]), 3).astype(f32),
                      cv2.medianBlur(rgba[:, :, 3], 3).astype(f32)])   # runlengths._prep
    for axis in (1, 0):
        x = img4 if axis == 1 else np.transpose(img4, (1, 0, 2))
        d = np.abs(np.diff(x, axis=1)).sum(axis=2).astype(f32)        # runlengths._boundaries
        bf_case("runlengths_d_axis%d:%s" % (axis, _n), d, 1, 7)
_r = (rng.random((23, 19)).astype(f32) * 1000).astype(f32)
for kw, kh in ((1, 7), (7, 1), (3, 3), (5, 5), (2, 4), (1, 1), (4, 2), (1, 25), (11, 1), (1, 11), (6, 6)):
    bf_case("rand23x19_k%dx%d" % (kw, kh), _r, kw, kh)
bf_case("rand3x19_k1x7", (rng.random((3, 19)).astype(f32) * 1000).astype(f32), 1, 7)
bf_case("rand1x19_k1x7", (rng.random((1, 19)).astype(f32) * 1000).astype(f32), 1, 7)
bf_case("rand23x1_k1x7", (rng.random((23, 1)).astype(f32) * 1000).astype(f32), 1, 7)
_w = (rng.random((40, 8)).astype(f32) * f32(1e8)).astype(f32)
_w[::3] *= f32(1e-9)
bf_case("wide_dynamic_range_k1x7", _w, 1, 7)
# running-sum discriminators: a block of huge rows/cols followed by tiny ones
_b = (0.5 + rng.random((24, 6)) * 0.5).astype(f32)
_b[:12] *= f32(1e8)
_b[12:] *= f32(1e-2)
bf_case("blocks_big_then_tiny_rows_k1x7", _b, 1, 7)
bf_case("blocks_big_then_tiny_rows_k1x11", _b, 1, 11)
bf_case("blocks_big_then_tiny_rows_k3x3", _b, 3, 3)
bf_case("blocks_big_then_tiny_rows_k2x4", _b, 2, 4)
_bt = np.ascontiguousarray(_b.T)
bf_case("blocks_big_then_tiny_cols_k7x1", _bt, 7, 1)
bf_case("blocks_big_then_tiny_cols_k11x1", _bt, 11, 1)
bf_case("blocks_big_then_tiny_cols_k5x5", _bt, 5, 5)
bf_case("blocks_big_then_tiny_cols_k4x2", _bt, 4, 2)
_alt = (0.5 + rng.random((5, 40)) * 0.5).astype(f32)
_alt[:, ::2] *= f32(1e8)
_alt[:, 1::2] *= f32(1e-2)
bf_case("alternating_big_tiny_along_row_k1x7", _alt, 1, 7)
bf_case("alternating_big_tiny_along_row_k1x1", _alt, 1, 1)
bf_case("alternating_big_tiny_along_row_k7x1", _alt, 7, 1)
# the blockSum / FilterEngine boundary, straddled on cancellation data
# (tools/probe-box-ksweep*.py found it at width <= 5 and height <= 5)
_br = (0.5 + rng.random((5, 40)) * 0.5).astype(f32)
_br[:, :20] *= f32(1e8)
_br[:, 20:] *= f32(1e-2)
for kw, kh in ((1, 5), (1, 6), (1, 7), (2, 5), (2, 6), (2, 7), (4, 5), (4, 6), (4, 7), (3, 5), (3, 6), (3, 7),
               (5, 5), (5, 6), (5, 7), (6, 1), (6, 5), (6, 6), (7, 1), (8, 3), (9, 9), (11, 1), (1, 25)):
    bf_case("boundary_blocks_along_row_k%dx%d" % (kw, kh), _br, kw, kh)
for kw, kh in ((1, 1), (1, 5), (1, 6), (1, 7), (1, 9)):
    bf_case("boundary_alternating_along_row_k%dx%d" % (kw, kh), _alt, kw, kh)
_bc = np.ascontiguousarray(_br.T)
for kw, kh in ((1, 2), (1, 5), (1, 6), (1, 7), (1, 25), (3, 7), (7, 7), (6, 6), (7, 2)):
    bf_case("boundary_blocks_along_col_k%dx%d" % (kw, kh), _bc, kw, kh)
_n_bs = sum(1 for c in BF if c["path"] == "blockSum")
_n_bs_miss = sum(1 for c in BF if c["path"] == "blockSum" and not c["engine_model_matches"])
_n_fe_miss = sum(1 for c in BF if c["path"] == "filterEngine" and not c["engine_model_matches"])
assert _n_bs_miss > 0, "no blockSum-path case discriminates the guard: the boundary claim is unmeasured"
assert _n_fe_miss == 0, "numpy FilterEngine model misses cv2 on %d filterEngine-path cases" % _n_fe_miss

# --------------------------------------------------------- Gaussian kernel
GK = []


def gk_case(n, sigma):
    GK.append({"n": n, "sigma": sigma,
               "k": hexb(cv2.getGaussianKernel(n, sigma, cv2.CV_32F).ravel().astype(f32))})


for sigma in [round(0.55 + 0.05 * i, 2) for i in range(0, 90)]:      # 0.55 .. 5.0
    gk_case(int(round(sigma * 4 * 2 + 1)) | 1, sigma)
for sigma in (1.0, 1.0, 0.7071, 1.4142, 2.3, 3.7):
    for n in (9, 13, 17):
        gk_case(n, sigma)
for n in (1, 3, 5, 7, 9, 11, 13, 15, 21, 4, 6, 8, 10):                # sigma <= 0 -> tables / derived sigma
    gk_case(n, 0.0)
for n, sigma in ((4, 1.0), (6, 1.5), (8, 0.9), (2, 1.0), (10, 2.0)):  # even n
    gk_case(n, sigma)

# ------------------------------------------------------------ GaussianBlur
GB = []


def gb_case(name, y, ksize, sx, sy=0.0):
    y = np.ascontiguousarray(y, dtype=f32)
    out = cv2.GaussianBlur(y, ksize, sx, sigmaY=sy)
    GB.append({"name": name, "w": int(y.shape[1]), "h": int(y.shape[0]), "ksize": list(ksize),
               "sigmaX": sx, "sigmaY": sy, "src": hexb(y), "out": hexb(out)})


LUMA = {}
for _n, rgba in IMGS.items():
    _rgb = rgba[..., :3].astype(f32)
    LUMA[_n] = (_rgb[..., 0] * 0.299 + _rgb[..., 1] * 0.587 + _rgb[..., 2] * 0.114).astype(f32)  # selfsim._luma
    gb_case("selfsim_luma:" + _n, LUMA[_n], (0, 0), 1.0)                                     # selfsim:64
for W in range(1, 41):
    for H in (1, 2, 5, 9):
        gb_case("rand%dx%d_s1" % (H, W), (rng.random((H, W)).astype(f32) * 255).astype(f32), (0, 0), 1.0)
for W in (64, 71, 72, 73, 80, 100, 127, 128, 129, 200, 257):           # straddle the IPP row-filter threshold (72)
    for H in (6, 73):
        gb_case("rand%dx%d_s1" % (H, W), (rng.random((H, W)).astype(f32) * 255).astype(f32), (0, 0), 1.0)
for sigma in (0.8, 1.5, 2.0):
    for W in (7, 16, 21, 30):
        gb_case("rand6x%d_s%g" % (W, sigma), (rng.random((6, W)).astype(f32) * 255).astype(f32), (0, 0), sigma)
_y = (rng.random((14, 20)).astype(f32) * 255).astype(f32)
gb_case("explicit_k9x9_s1", _y, (9, 9), 1.0)
gb_case("explicit_k9x13_s1_s1.5", _y, (9, 13), 1.0, 1.5)
gb_case("explicit_k13x9_s1.5_s1", _y, (13, 9), 1.5, 1.0)
gb_case("explicit_k7x7_s0", _y, (7, 7), 0.0)        # sigma <= 0 -> fixed table
gb_case("explicit_k9x9_s0", _y, (9, 9), 0.0)        # sigma <= 0 -> the n=9 table
gb_case("big_values_s1", (rng.random((9, 21)).astype(f32) * f32(1e6)).astype(f32), (0, 0), 1.0)
gb_case("mid_luma_transposed_s1", np.ascontiguousarray(LUMA["mid"].T), (0, 0), 1.0)
gb_case("small_luma_transposed_s1", np.ascontiguousarray(LUMA["small"].T), (0, 0), 1.0)

# --------------------------------------------------------------- Laplacian
LP = []


def lp_case(name, y):
    y = np.ascontiguousarray(y, dtype=f32)
    out = cv2.Laplacian(y, cv2.CV_32F)
    LP.append({"name": name, "w": int(y.shape[1]), "h": int(y.shape[0]), "src": hexb(y), "out": hexb(out)})


for _n in IMGS:
    lp_case("selfsim_yb:" + _n, cv2.GaussianBlur(LUMA[_n], (0, 0), 1.0))                     # selfsim:68
for shape in ((19, 23), (1, 9), (9, 1), (2, 2), (8, 8), (1, 1), (3, 40), (5, 130)):
    lp_case("rand%s" % (shape,), (rng.random(shape).astype(f32) * 255).astype(f32))

# ------------------------------------------------------------------- write
try:
    cpu = cv2.getCPUFeaturesLine()
except Exception:
    cpu = "?"
out = {
    "meta": {"cv2": cv2.__version__, "numpy": np.__version__, "python": platform.python_version(),
             "ipp": cv2.ipp.getIppVersion(), "useIPP": bool(cv2.ipp.useIPP()),
             "useOptimized": bool(cv2.useOptimized()), "cpu_features": cpu,
             "detect": DET},
    "randu64": RU, "medianBlur": MB, "boxFilter": BF, "gaussianKernel": GK, "gaussianBlur": GB,
    "laplacian": LP, "kmeans": KM,
}
path = os.path.join(FIX, "cv2-parity.json")
with open(path, "w") as f:
    json.dump(out, f)
print("wrote", path, "%.1f MB" % (os.path.getsize(path) / 1e6))
print("cases: randu64 %d, medianBlur %d, boxFilter %d, gaussianKernel %d, gaussianBlur %d, laplacian %d, kmeans %d"
      % (len(RU), len(MB), len(BF), len(GK), len(GB), len(LP), len(KM)))
print("boxFilter paths: filterEngine %d (numpy engine model misses %d of them), blockSum %d (engine model misses %d of them)"
      % (len(BF) - _n_bs, _n_fe_miss, _n_bs, _n_bs_miss))
for c in BF:
    if c["path"] == "blockSum":
        print("  blockSum %-44s k%dx%d engine_model_matches=%s" % (c["name"], c["kw"], c["kh"], c["engine_model_matches"]))
print("detect:", json.dumps(DET))
print("kmeans calls recorded (name, seed, N, K, attempts, maxCount, eps, secs):")
for c in KM:
    print("  %-48s seed=%-6s N=%-6d K=%-3d att=%d it=%-3d eps=%-5g %.3fs" % (
        c["name"], c["seed"], c["N"], c["K"], c["attempts"], c["maxCount"], c["epsilon"], c["secs"]))
