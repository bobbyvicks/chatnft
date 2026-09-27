"""Which summation ORDER does numpy use at each reduction/scan shape the
full-mode modules call? Answers, by measurement, the question a port has to
get right before it can be bit-exact: np.add.reduceat, np.cumsum, sums along
an axis (the order depends on MEMORY LAYOUT, not the logical axis), mean,
std and np.average.

Each hypothesis is a Python emulation written from numpy's C source; the
probe counts how many outputs it reproduces BIT FOR BIT on random data
where the orders are distinguishable. A model is accepted only at 100% on
data where the rival model is measurably below 100% - otherwise the data
cannot tell them apart and the probe says so.

Run: pafenv2/Scripts/python.exe tools/probe-linalg-reductions.py
Prints only; writes nothing.
"""
import numpy as np

f32, f64 = np.float32, np.float64
rng = np.random.default_rng(20260927)


def pairwise(a, R):
    """numpy's pairwise_sum (loops_utils.h.src), identity start, rounding R."""
    n = len(a)
    if n < 8:
        res = R(0.0)
        for v in a:
            res = R(res + v)
        return res
    if n <= 128:
        r = [R(a[i]) for i in range(8)]
        end = n - (n % 8)
        for i in range(8, end, 8):
            for j in range(8):
                r[j] = R(r[j] + a[i + j])
        res = R(R(R(r[0] + r[1]) + R(r[2] + r[3])) + R(R(r[4] + r[5]) + R(r[6] + r[7])))
        for i in range(end, n):
            res = R(res + a[i])
        return res
    n2 = n // 2
    n2 -= n2 % 8
    return R(pairwise(a[:n2], R) + pairwise(a[n2:], R))


def seq(a, R, start=None):
    res = R(0.0) if start is None else start
    for v in a:
        res = R(res + v)
    return res


def Rof(dt):
    return (lambda x: f32(x)) if dt == f32 else (lambda x: f64(x))


def data(shape, dt):
    # wide dynamic range so every order rounds differently
    x = rng.standard_normal(shape) * np.exp(rng.uniform(-6, 6, shape))
    return x.astype(dt)


def score(name, got, want):
    got = np.asarray(got); want = np.asarray(want)
    same = (got.view(np.uint64 if got.dtype == f64 else np.uint32)
            == want.view(np.uint64 if want.dtype == f64 else np.uint32))
    return "%-44s %6d/%-6d bit-exact" % (name, int(same.sum()), same.size), bool(same.all())


def section(t):
    print("\n== " + t)


# ------------------------------------------------------------ add.reduceat
section("np.add.reduceat (reconsearch.py:130,136,171,179,180)")
for dt in (f64, f32):
    R = Rof(dt)
    for axis in (0, 1):
        for trial in range(3):
            H, W = (400, 5) if axis == 0 else (5, 400)
            a = data((H, W), dt)
            L = a.shape[axis]
            edges = np.unique(np.concatenate([[0], rng.integers(1, L, 12)])).astype(np.int64)
            ref = np.add.reduceat(a, edges, axis=axis)
            m_seq, m_first_pw, m_pw = [], [], []
            for k in range(len(edges)):
                s0, s1 = edges[k], (edges[k + 1] if k + 1 < len(edges) else L)
                row = []
                for o in range(a.shape[1 - axis]):
                    v = a[s0:s1, o] if axis == 0 else a[o, s0:s1]
                    row.append((seq(v, R), R(v[0] + pairwise(v[1:], R)), pairwise(v, R)))
                m_seq.append([r[0] for r in row]); m_first_pw.append([r[1] for r in row]); m_pw.append([r[2] for r in row])
            T = (lambda m: np.array(m, dt)) if axis == 1 else (lambda m: np.array(m, dt))
            want = ref if axis == 1 else ref.T   # model rows are per segment
            want = ref.T if axis == 1 else ref
            # model arrays are [segment][other]; bring ref to the same layout
            refm = ref if axis == 0 else ref.T
            for nm, m in (("sequential", m_seq), ("first + pairwise(rest)", m_first_pw), ("pairwise(all)", m_pw)):
                line, ok = score("%s axis=%d %s" % (dt.__name__, axis, nm), np.array(m, dt), refm)
                if trial == 0:
                    print("   " + line)
                elif not ok and nm == "first + pairwise(rest)":
                    print("   (trial %d) " % trial + line)
# 1-D, the en1/qcol-length shape
a = data(1000, f64)
edges = np.array([0, 3, 17, 200, 999], np.int64)
ref = np.add.reduceat(a, edges)
m = [f64(a[s] + pairwise(a[s + 1:e], Rof(f64))) for s, e in zip(edges, list(edges[1:]) + [1000])]
print("   " + score("f64 1-D first + pairwise(rest)", np.array(m), ref)[0])

# ----------------------------------------------------------------- cumsum
section("np.cumsum (varcontrast.py:51,53,204,207; reconsearch.py:113,115)")
for dt in (f64, f32):
    R = Rof(dt)
    a = data((7, 300, 3), dt)
    for axis in (0, 1, 2):
        ref = np.cumsum(a, axis=axis)
        mov = np.moveaxis(a, axis, -1)
        out = np.empty_like(mov)
        for idx in np.ndindex(mov.shape[:-1]):
            acc = None
            for j in range(mov.shape[-1]):
                acc = mov[idx + (j,)] if acc is None else R(acc + mov[idx + (j,)])
                out[idx + (j,)] = acc
        print("   " + score("%s 3-D axis=%d sequential" % (dt.__name__, axis), np.moveaxis(out, -1, axis), ref)[0])
# reconsearch's exact form: float32 into a float32 out= slice
img = data((20, 300, 3), f32)
S = np.zeros((20, 301, 3), f32)
np.cumsum(img, 1, out=S[:, 1:])
seqS = np.zeros_like(S)
for y in range(20):
    for c in range(3):
        acc = f32(0)
        for x in range(300):
            acc = img[y, x, c] if x == 0 else f32(acc + img[y, x, c])
            seqS[y, x + 1, c] = acc
print("   " + score("f32 cumsum(img, 1, out=S[:,1:]) sequential f32", seqS, S)[0])
# float64 cumsum of float32 would differ: show the rival is distinguishable
S64 = np.cumsum(img.astype(f64), 1).astype(f32)
print("   " + score("  rival: cumsum in f64 then cast (must NOT match)", S64, S[:, 1:])[0])

# ------------------------------------------------------------- axis sums
section("ndarray.sum(axis) - order follows memory layout")
for dt in (f64, f32):
    R = Rof(dt)
    a = data((300, 200), dt)
    # axis=0 of a C-contiguous 2-D: reduced axis is the SLOW one
    ref = a.sum(axis=0)
    m_seq = np.array([seq(a[:, j], R) for j in range(a.shape[1])], dt)
    m_pw = np.array([pairwise(a[:, j], R) for j in range(a.shape[1])], dt)
    print("   " + score("%s C 2-D sum(axis=0) sequential" % dt.__name__, m_seq, ref)[0])
    print("   " + score("%s C 2-D sum(axis=0) pairwise (rival)" % dt.__name__, m_pw, ref)[0])
    ref = a.sum(axis=1)
    m_pw = np.array([pairwise(a[i, :], R) for i in range(a.shape[0])], dt)
    m_seq = np.array([seq(a[i, :], R) for i in range(a.shape[0])], dt)
    print("   " + score("%s C 2-D sum(axis=1) pairwise" % dt.__name__, m_pw, ref)[0])
    print("   " + score("%s C 2-D sum(axis=1) sequential (rival)" % dt.__name__, m_seq, ref)[0])
    # transposed view, reduce logical axis 0 == memory-fast axis
    t = a.T
    ref = t.sum(axis=0)
    m_pw = np.array([pairwise(t[:, j], R) for j in range(t.shape[1])], dt)
    print("   " + score("%s a.T.sum(axis=0) pairwise (fast axis)" % dt.__name__, m_pw, ref)[0])
    # a slice of a transposed view (channels._tile_peaks axis=1)
    seg = t[10:150, 20:90]
    ref = seg.sum(axis=0)
    m_pw = np.array([pairwise(seg[:, j], R) for j in range(seg.shape[1])], dt)
    print("   " + score("%s a.T[10:150,20:90].sum(axis=0) pairwise" % dt.__name__, m_pw, ref)[0])
    seg = a[10:150, 20:90]
    ref = seg.sum(axis=0)
    m_seq = np.array([seq(seg[:, j], R) for j in range(seg.shape[1])], dt)
    print("   " + score("%s a[10:150,20:90].sum(axis=0) sequential" % dt.__name__, m_seq, ref)[0])
    # 3-D, reduce the short last axis (C=3/4) - pairwise of n<8 == sequential from 0
    b = data((50, 60, 4), dt)
    ref = b.sum(axis=2)
    m = np.array([[seq(b[i, j], R) for j in range(60)] for i in range(50)], dt)
    print("   " + score("%s 3-D sum(axis=2), C=4" % dt.__name__, m, ref)[0])
    # (img ** 2).sum(axis=(0, 2)) both layouts (varcontrast._axis_moments)
    b = data((40, 70, 4), dt)
    ref = b.sum(axis=(0, 2))
    m = np.array([seq([pairwise(b[o, l], R) for o in range(40)], R) for l in range(70)], dt)
    print("   " + score("%s C 3-D sum(axis=(0,2)): seq over o of pw(C)" % dt.__name__, m, ref)[0])
    bt = np.transpose(b, (1, 0, 2))           # (70, 40, 4) view
    ref = bt.sum(axis=(0, 2))
    m_coal = np.array([pairwise(b[o].reshape(-1), R) for o in range(40)], dt)
    m_rowwise = np.array([seq([pairwise(bt[l, o], R) for l in range(70)], R) for o in range(40)], dt)
    print("   " + score("%s transposed sum(axis=(0,2)): pw over L*C coalesced" % dt.__name__, m_coal, ref)[0])
    print("   " + score("%s transposed sum(axis=(0,2)): rival seq-of-pw" % dt.__name__, m_rowwise, ref)[0])
    # img.sum(axis=0) of the transposed (other, L, C) view in _axis_moments
    ref = bt.sum(axis=0)                      # (40, 4)
    m = np.array([[pairwise(b[o, :, c], R) for c in range(4)] for o in range(40)], dt)
    print("   " + score("%s transposed .sum(axis=0) -> (L,C): pw per (o,c)" % dt.__name__, m, ref)[0])
    ref = b.sum(axis=0)                       # C-contig reduce slow axis
    m = np.array([[seq(b[:, l, c], R) for c in range(4)] for l in range(70)], dt)
    print("   " + score("%s C 3-D sum(axis=0) sequential" % dt.__name__, m, ref)[0])

# -------------------------------------------------------------- mean/std
section("mean / std (float32 stays float32; axis=0 of (n,3) is the slow axis)")
x = data((5000, 3), f32)
ref = x.mean(0)
m_seq = np.array([f32(seq(x[:, c], Rof(f32)) / f32(5000)) for c in range(3)], f32)
m_pw = np.array([f32(pairwise(x[:, c], Rof(f32)) / f32(5000)) for c in range(3)], f32)
print("   " + score("f32 (n,3).mean(0) = seq sum / n in f32", m_seq, ref)[0])
print("   " + score("f32 (n,3).mean(0) rival pairwise", m_pw, ref)[0])
al = data((123, 77), f32)
ref = al.mean()
m = f32(pairwise(al.reshape(-1), Rof(f32)) / f32(al.size))
print("   " + score("f32 2-D .mean() = pairwise(all)/n in f32", np.array([m]), np.array([ref]))[0])
ref = al.std()
mu = f32(pairwise(al.reshape(-1), Rof(f32)) / f32(al.size))
d = (al.reshape(-1) - mu).astype(f32)
sq = (d * d).astype(f32)
m = f32(np.sqrt(f32(pairwise(sq, Rof(f32)) / f32(al.size))))
print("   " + score("f32 2-D .std() two-pass pairwise in f32", np.array([m]), np.array([ref]))[0])
v = data(3001, f64)
ref = v.std()
mu = pairwise(v, Rof(f64)) / 3001
m = np.sqrt(pairwise((v - mu) * (v - mu), Rof(f64)) / 3001)
print("   " + score("f64 1-D .std() two-pass pairwise", np.array([m]), np.array([ref]))[0])
ref = v.mean()
print("   " + score("f64 1-D .mean() pairwise/n", np.array([pairwise(v, Rof(f64)) / 3001]), np.array([ref]))[0])

# --------------------------------------------------------------- average
section("np.average(x, weights=w) (reconsearch.py:234-239)")
ok = 0
tot = 0
for n in (3, 5, 8, 9, 17):
    for t in range(40):
        xs = data(n, f64); w = np.abs(data(n, f64))
        ref = np.average(xs, weights=w)
        # _function_base_impl.average: scl = wgt.sum(axis); avg = np.multiply(a, wgt).sum(axis) / scl
        m = pairwise(xs * w, Rof(f64)) / pairwise(w, Rof(f64))
        tot += 1; ok += int(np.float64(m).view(np.uint64) == np.float64(ref).view(np.uint64))
print("   np.average == pairwise(x*w)/pairwise(w)       %d/%d bit-exact" % (ok, tot))
