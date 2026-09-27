"""How does numpy's float32 matmul round, at reconsearch's three shapes?

  reconsearch.py:68  blk @ centers.T        (n,3) @ (3,k)   sgemm, K = 3
  reconsearch.py:78  x.T @ x                (3,n) @ (n,3)   A^T A: numpy calls ssyrk
  reconsearch.py:81  x @ evecs[:, order]    (n,3) @ (3,2)   sgemm, K = 3

All three go to OpenBLAS (scipy-openblas 0.3.34, DYNAMIC_ARCH) - so the
answer is a property of the kernel this CPU dispatches to, not of numpy.
Candidate models are emulated here and scored bit-for-bit on REAL x from
reconsearch._prep (the inputs the reference actually sees) and on random data.

float32 FMA is emulated as f32(f64(a)*f64(b) + f64(c)): the product is exact
in float64; the float64 add can double-round on ~2^-29 of operations, which
would show up as an isolated miss, not a pattern.

Run: pafenv2/Scripts/python.exe tools/probe-linalg-matmul.py
Prints only; writes nothing.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EX = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "paf-ref", "examples")
from pixelfixer import reconsearch as R   # noqa: E402

f32, f64 = np.float32, np.float64
rng = np.random.default_rng(7)


def bits_eq(a, b):
    a = np.ascontiguousarray(a, f32); b = np.ascontiguousarray(b, f32)
    return a.view(np.uint32) == b.view(np.uint32)


def fma32(a, b, c):
    return (a.astype(f64) * b.astype(f64) + c.astype(f64)).astype(f32)


# ---------------------------------------------------------------- K = 3 gemm
def gemm_models(A, B):
    """A (n,3) f32, B (3,k) f32 -> dict of model outputs (n,k)."""
    a0, a1, a2 = (A[:, i:i + 1] for i in range(3))
    b0, b1, b2 = (B[i:i + 1, :] for i in range(3))
    p0 = (a0 * b0).astype(f32)
    out = {}
    out["fma chain k=0,1,2"] = fma32(a2, b2, fma32(a1, b1, p0))
    out["plain ((p0+p1)+p2)"] = ((p0 + (a1 * b1).astype(f32)).astype(f32) + (a2 * b2).astype(f32)).astype(f32)
    out["fma chain k=2,1,0"] = fma32(a0, b0, fma32(a1, b1, (a2 * b2).astype(f32)))
    out["exact in f64, round once"] = (a0.astype(f64) * b0 + a1.astype(f64) * b1 + a2.astype(f64) * b2).astype(f32)
    return out


def report_gemm(tag, A, B):
    ref = A @ B
    for name, m in gemm_models(A, B).items():
        eq = bits_eq(m, ref)
        print("   %-34s %-26s %9d/%-9d" % (tag, name, int(eq.sum()), eq.size))


# ----------------------------------------------------------------- A^T A
def syrk_blocked(x, Q, unroll=16, split=True):
    """OpenBLAS level3_syrk.c K-blocking: blocks of Q, the last two split
    evenly (rounded up to the unroll); each block accumulated from zero with
    an FMA chain in k order, then ADDED into C in float32."""
    n = x.shape[0]
    C = np.zeros((3, 3), f32)
    ls = 0
    blocks = 0
    while ls < n:
        min_l = n - ls
        if split:
            if min_l >= 2 * Q:
                min_l = Q
            elif min_l > Q:
                min_l = ((min_l // 2 + unroll - 1) // unroll) * unroll
        else:
            min_l = min(min_l, Q)
        acc = np.zeros((3, 3), f32)
        blk = x[ls:ls + min_l]
        for r in blk:
            acc = fma32(r[:, None], r[None, :], acc)
        C = (C + acc).astype(f32)
        ls += min_l
        blocks += 1
    return C


def syrk_models(x, Qs):
    out = {}
    out["exact f64, round once"] = (x.astype(f64).T @ x.astype(f64)).astype(f32)
    acc = np.zeros((3, 3), f32)
    for r in x:
        acc = fma32(r[:, None], r[None, :], acc)
    out["fma chain, one block"] = acc
    for Q in Qs:
        out["blocked Q=%d (syrk split)" % Q] = syrk_blocked(x, Q)
    return out


def real_x(name):
    rgba = np.asarray(Image.open(name).convert("RGBA"))
    a = rgba[..., 3].astype(f32)
    rgb = rgba[..., :3].astype(f32) * (a[..., None] / 255.0)
    q = R._quantize(rgb)
    flat = q.reshape(-1, 3)
    mu = flat.mean(0)
    return flat, (flat - mu)


def main():
    print("== K=3 sgemm, random data")
    A = (rng.standard_normal((20000, 3)) * 100).astype(f32)
    B = rng.standard_normal((3, 14)).astype(f32)
    report_gemm("random (20000,3)@(3,14)", A, B)
    B2 = rng.standard_normal((3, 2)).astype(f32)
    report_gemm("random (20000,3)@(3,2)", A, B2)
    # the reference's exact operand form: centers.T is a transposed view,
    # evecs[:, order] a fancy-indexed copy
    C = rng.standard_normal((14, 3)).astype(f32)
    ref = A @ C.T
    for name, m in gemm_models(A, np.ascontiguousarray(C.T)).items():
        eq = bits_eq(m, ref)
        print("   %-34s %-26s %9d/%-9d" % ("A @ centers.T (view)", name, int(eq.sum()), eq.size))

    print("\n== A^T A (ssyrk), random data, small n (finds the in-block order)")
    for n in (5, 37, 300):
        x = (rng.standard_normal((n, 3)) * np.exp(rng.uniform(-3, 3, (n, 1)))).astype(f32)
        ref = x.T @ x
        for name, m in syrk_models(x, []).items():
            eq = bits_eq(m, ref)
            print("   n=%-6d %-30s %d/9" % (n, name, int(eq.sum())))

    print("\n== A^T A, random data, large n (finds the K blocking)")
    n = 5000
    x = (rng.standard_normal((n, 3)) * np.exp(rng.uniform(-3, 3, (n, 1)))).astype(f32)
    ref = x.T @ x
    Qs = [64, 128, 192, 256, 320, 384, 448, 512, 640, 768, 1024]
    for name, m in syrk_models(x, Qs).items():
        eq = bits_eq(m, ref)
        print("   n=%-6d %-30s %d/9" % (n, name, int(eq.sum())))

    print("\n== REAL inputs: reconsearch._pca_channels on the fixtures/examples")
    names = [os.path.join(ROOT, "fixtures", f + ".png") for f in ("tiny", "small", "mid")]
    if "--examples" in sys.argv:
        names += [os.path.join(EX, f) for f in sorted(os.listdir(EX))]
    for path in names:
        flat, x = real_x(path)
        n = x.shape[0]
        ref = x.T @ x
        best = []
        for name, m in syrk_models(x, [256, 384, 448, 512]).items():
            eq = bits_eq(m, ref)
            best.append("%s=%d/9" % (name, int(eq.sum())))
        print("   %-14s n=%-8d %s" % (os.path.basename(path), n, "  ".join(best)))


if __name__ == "__main__":
    main()
