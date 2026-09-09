"""Ground-truth fixtures for src/pf-04-nprandom.js and src/pf-11-quantize.js
-> fixtures/quantize-parity.json.

Arrays are dumped as lowercase hex of their raw little-endian bytes (uint8,
int32, float32), so the JSON round trip cannot lose a bit.

kmeans_quantize is called on the PRISTINE reference (nothing is wrapped or
re-implemented): the three fixture images as loaded (no medianBlur, so the
JS test does not depend on the cv2 shim's medianBlur) plus synthetic arrays
that reach the branches the fixtures cannot:
  - n > sample_max: the numpy sampler (tail-shuffle branch at the default
    sample_max, and Floyd's branch via a small sample_max)
  - k_eff <= 1: one colour, k=1 on a many-colour image (centers = the whole
    sorted unique array), an empty image
  - fewer unique colours than k, alpha < 255, a 3-channel input, 1x1, non-
    square, a different numpy seed on the same image

cv2's RNG: quantize.py never seeds it. The first case runs UNSEEDED in this
fresh process, the second UNSEEDED again (state carried over), every later
case is preceded by cv2.setRNGSeed(s) and records s. The JS test replays the
cases in this order from the fresh state 0xffffffff, so the unseeded cases
test PF.theRNG()'s carry-over exactly as the pipeline will rely on it.

Attribution aids stored per case (labelled as such, not used as truth):
  sample_idx  = np.random.default_rng(seed).choice(n, sample_max, replace=False)
                recomputed here with the same call the reference makes
  uniq_n      = len(np.unique(sample, axis=0)), k_eff
The numpy.random section pins SeedSequence / PCG64 / choice directly.

Run with the pafenv interpreter:
  pafenv/Scripts/python.exe tools/parity-quantize.py
"""
import json
import os
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

from pixelfixer.quantize import kmeans_quantize  # noqa: E402

f32, i32, u8 = np.float32, np.int32, np.uint8


def hexb(a):
    return np.ascontiguousarray(a).tobytes().hex()


# ------------------------------------------------------------ numpy.random
NPR = {"seedseq": [], "pcg64": [], "choice": []}
for seed in (42, 0, 1, 2026, 123456789, 2 ** 40 + 3, 2 ** 32):
    ss = np.random.SeedSequence(seed)
    NPR["seedseq"].append({"seed": seed, "pool": [int(x) for x in ss.pool],
                           "state8": [int(x) for x in ss.generate_state(8, np.uint32)]})
    bg = np.random.PCG64(seed)
    st = bg.state["state"]
    NPR["pcg64"].append({"seed": seed, "state": "%032x" % int(st["state"]), "inc": "%032x" % int(st["inc"]),
                         "raw": ["%016x" % int(x) for x in bg.random_raw(12)]})
for pop, size in [(20000, 1000), (75000, 60000), (10001, 201), (10001, 200), (10000, 9000),
                  (8000, 100), (300, 300), (7, 3), (1, 1), (65536, 60000), (65537, 5),
                  (3000100, 60000), (2999999, 60000), (0, 0), (5, 0)]:
    for shuffle in (True, False):
        for seed in (42, 7):
            g = np.random.default_rng(seed)
            out = g.choice(pop, size, replace=False, shuffle=shuffle)
            st = g.bit_generator.state
            NPR["choice"].append({"pop": pop, "size": size, "seed": seed, "shuffle": shuffle,
                                  "branch": "tail" if (pop > 10000 and size > pop // (50 if shuffle else 20)) else "floyd",
                                  "out": hexb(out.astype(i32)),
                                  "state_after": "%032x" % int(st["state"]["state"]),
                                  "has_uint32": int(st["has_uint32"]), "uinteger": int(st["uinteger"])})
# after-state of a rng that was created but never drawn from (quantize.py
# creates one on every call whether or not it samples)
g = np.random.default_rng(42)
NPR["fresh_state"] = {"seed": 42, "state": "%032x" % int(g.bit_generator.state["state"]["state"]),
                      "has_uint32": int(g.bit_generator.state["has_uint32"])}

# ------------------------------------------------------------ images
IMGS = {}
for _n in ("tiny", "small", "mid"):
    IMGS[_n] = np.ascontiguousarray(np.asarray(Image.open(os.path.join(FIX, _n + ".png")).convert("RGBA")))

srng = np.random.default_rng(20260909)


def palette_image(h, w, ncol, jitter, alpha=None):
    pal = srng.integers(0, 256, (ncol, 3))
    lab = srng.integers(0, ncol, (h, w))
    img = pal[lab].astype(np.int32)
    if jitter:
        img += srng.integers(-jitter, jitter + 1, img.shape)
    img = np.clip(img, 0, 255).astype(u8)
    a = np.full((h, w, 1), 255, u8) if alpha is None else alpha
    return np.ascontiguousarray(np.concatenate([img, a], axis=2))


def noise_image(h, w):
    rgb = srng.integers(0, 256, (h, w, 3)).astype(u8)
    a = np.full((h, w, 1), 255, u8)
    return np.ascontiguousarray(np.concatenate([rgb, a], axis=2))


CASES = []


def case(name, rgba, k=16, sample_max=60000, seed=42, cv2_seed=None):
    if cv2_seed is not None:
        cv2.setRNGSeed(cv2_seed)
    h, w = rgba.shape[:2]
    cn = rgba.shape[2]
    n = h * w
    t0 = time.time()
    q, labels, centers = kmeans_quantize(rgba, k=k, sample_max=sample_max, seed=seed)
    secs = time.time() - t0
    assert q.dtype == u8 and q.shape == rgba.shape, (q.dtype, q.shape)
    assert labels.dtype == i32 and labels.shape == (h, w), (labels.dtype, labels.shape)
    assert centers.dtype == f32 and centers.ndim == 2 and centers.shape[1] == 3, (centers.dtype, centers.shape)
    # attribution aids (same calls the reference makes internally)
    rgb = rgba[:, :, :3].reshape(-1, 3).astype(f32)
    if n > sample_max:
        idx = np.random.default_rng(seed).choice(n, sample_max, replace=False)
        sample = rgb[idx]
    else:
        idx = None
        sample = rgb
    uniq_n = int(len(np.unique(sample, axis=0)))
    k_eff = int(min(k, uniq_n))
    rec = {
        "name": name, "w": int(w), "h": int(h), "cn": int(cn), "k": k, "sample_max": int(sample_max),
        "seed": int(seed), "cv2_seed": cv2_seed, "n": int(n),
        "rgba": hexb(rgba), "quantized": hexb(q), "labels": hexb(labels),
        "centers": hexb(centers), "centers_n": int(centers.shape[0]),
        "sample_idx": None if idx is None else hexb(idx.astype(i32)),
        "uniq_n": uniq_n, "k_eff": k_eff, "secs": round(secs, 3),
    }
    CASES.append(rec)
    print("%-44s %4dx%-4d cn=%d k=%-3d smax=%-6d seed=%-3d cv2=%-8s uniq=%-6d k_eff=%-3d centers=%-4d %.2fs" % (
        name, w, h, cn, k, sample_max, seed, cv2_seed, uniq_n, k_eff, centers.shape[0], secs))
    sys.stdout.flush()


# 1. fresh process, unseeded cv2 RNG (the pipeline's first call is exactly this)
case("fresh_unseeded:tiny", IMGS["tiny"])
# 2. chained, still unseeded: the RNG state carried over from case 1
case("chained_unseeded:small", IMGS["small"])
# 3. the three fixtures, seeded
for _n in ("tiny", "small", "mid"):
    for _s in (0, 7):
        case("%s:cv2seed%d" % (_n, _s), IMGS[_n], cv2_seed=_s)
# k=24 as cli.py uses, k=8
case("mid:k24", IMGS["mid"], k=24, cv2_seed=3)
case("small:k8", IMGS["small"], k=8, cv2_seed=4)
# 4. sampling: n > sample_max
big_pal = palette_image(250, 300, 12, 3)                     # 75000 px, tail-shuffle branch
big_noise = noise_image(260, 300)                            # 78000 px, ~78000 unique colours
case("sample_tail:palette_75000", big_pal, cv2_seed=10)
case("sample_tail:palette_75000:seed7", big_pal, seed=7, cv2_seed=10)   # numpy seed must flow through
case("sample_tail:noise_78000", big_noise, cv2_seed=11)
case("sample_floyd:pal_12000_smax200", palette_image(100, 120, 10, 2), sample_max=200, cv2_seed=12)   # pop>10000, size<=pop//50
case("sample_floyd:noise_4800_smax1000", noise_image(60, 80), sample_max=1000, cv2_seed=13)           # pop<=10000
case("sample_floyd:pal_4800_smax7", palette_image(60, 80, 5, 0), sample_max=7, cv2_seed=14)           # tiny sample, k_eff<=7
case("sample_boundary:n_eq_smax", noise_image(50, 40), sample_max=2000, cv2_seed=15)                  # n == sample_max: NO sampling (strict >)
case("sample_boundary:n_eq_smax_plus1", noise_image(50, 40), sample_max=1999, cv2_seed=16)            # n == sample_max+1: sampling
# 5. k_eff <= 1 and small-k branches (no cv2 call: RNG untouched; the next
#    seeded case proves nothing was drawn... it re-seeds anyway, so instead a
#    chained unseeded case follows the k_eff<=1 block)
case("one_colour_k16", palette_image(10, 10, 1, 0))
case("k1_many_colours", IMGS["tiny"], k=1)                   # centers = every unique colour, sorted
case("k0", IMGS["tiny"], k=0)
case("empty_0x0", np.zeros((0, 0, 4), u8))
case("empty_0x5", np.zeros((0, 5, 4), u8))
case("two_colours_k16", palette_image(20, 20, 2, 0), cv2_seed=17)
case("five_colours_k16", palette_image(50, 50, 5, 0), cv2_seed=18)
case("chained_after_k_eff_le_1:tiny", IMGS["tiny"])          # unseeded again: state must have carried from five_colours_k16
# 6. shapes / channels
alpha = srng.integers(0, 256, (40, 30, 1)).astype(u8)
case("alpha_lt_255", palette_image(40, 30, 6, 2, alpha=alpha), cv2_seed=19)
case("cn3_input", np.ascontiguousarray(palette_image(30, 40, 7, 1)[:, :, :3]), cv2_seed=20)
case("one_pixel", noise_image(1, 1))
case("one_pixel_k1", noise_image(1, 1), k=1)
case("non_square_37x23", palette_image(23, 37, 9, 2), cv2_seed=21)
case("row_1x50", noise_image(1, 50), cv2_seed=22)
case("col_50x1", noise_image(50, 1), cv2_seed=23)
case("k_float_3.7", IMGS["tiny"], k=3.7, cv2_seed=24)        # int(min(3.7, n)) == 3

# ------------------------------------------------------------ label distances
# d = ((block[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2) in float32,
# then np.argmin(d, axis=1) -- the reference's label assignment, on its own.
# This pins the float32 summation ORDER, which the quantize cases above cannot
# see: the argmin never flips on them (measured in tools/test-quantize.js),
# but d itself differs on a large fraction of elements under the other order.
# alt_ndiff is how many elements of d the d0+(d1+d2) order would change, so
# the JS negative control can be checked for the SAME count, not just "some".
SQ = []


def sq_case(name, block, centers):
    block = np.ascontiguousarray(block, f32)
    centers = np.ascontiguousarray(centers, f32)
    d = ((block[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    assert d.dtype == f32 and d.shape == (block.shape[0], centers.shape[0])
    lab = np.argmin(d, axis=1).astype(i32)
    t = (block[:, None, :] - centers[None, :, :]).astype(f32)
    sq = (t * t).astype(f32)
    alt = (sq[:, :, 0] + (sq[:, :, 1] + sq[:, :, 2]).astype(f32)).astype(f32)
    left = ((sq[:, :, 0] + sq[:, :, 1]).astype(f32) + sq[:, :, 2]).astype(f32)
    assert np.array_equal(left, d), name        # the measured model, re-asserted on this data
    SQ.append({"name": name, "N": int(block.shape[0]), "K": int(centers.shape[0]),
               "block": hexb(block), "centers": hexb(centers), "d": hexb(d), "argmin": hexb(lab),
               "alt_ndiff": int((alt != d).sum()), "alt_argmin_ndiff": int((np.argmin(alt, axis=1) != lab).sum())})
    print("sqdist %-28s N=%-5d K=%-3d alt order changes d in %d/%d elements, argmin in %d rows" % (
        name, block.shape[0], centers.shape[0], SQ[-1]["alt_ndiff"], d.size, SQ[-1]["alt_argmin_ndiff"]))


sq_case("intpix_fraccen_3000x16", np.floor(srng.random((3000, 3)) * 256), srng.random((16, 3)) * 255)
sq_case("intpix_fraccen_2000x24", np.floor(srng.random((2000, 3)) * 256), srng.random((24, 3)) * 255)
sq_case("fracpix_fraccen_1500x8", srng.random((1500, 3)) * 255, srng.random((8, 3)) * 255)
sq_case("intpix_intcen_1000x5", np.floor(srng.random((1000, 3)) * 256), np.floor(srng.random((5, 3)) * 256))
_c = srng.random((6, 3)) * 255
sq_case("dup_centers_first_wins", np.floor(srng.random((800, 3)) * 256), np.concatenate([_c, _c[::-1]]))
_p = np.floor(srng.random((300, 3)) * 256)
sq_case("pixels_are_centers_zero_dist", _p, _p[::37])
sq_case("single_center", np.floor(srng.random((100, 3)) * 256), srng.random((1, 3)) * 255)
sq_case("big_values_lose_bits", srng.random((1200, 3)) * 255, srng.random((12, 3)) * 1e-3)   # tiny centres: squares of ~255 swamp squares of ~0

# ------------------------------------------------------------ write
out = {
    "sqdist": SQ,
    "meta": {"numpy": np.__version__, "cv2": cv2.__version__, "python": sys.version.split()[0],
             "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
             "note": "cases are ORDERED; cv2_seed null means the cv2 RNG state carried over from the previous case"},
    "np_random": NPR,
    "cases": CASES,
}
path = os.path.join(FIX, "quantize-parity.json")
with open(path, "w") as f:
    json.dump(out, f)
print("cases: quantize %d, seedseq %d, pcg64 %d, choice %d" % (
    len(CASES), len(NPR["seedseq"]), len(NPR["pcg64"]), len(NPR["choice"])))
print("WROTE", path, os.path.getsize(path), "bytes")
