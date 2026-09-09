"""Dump numpy ground truth for pf-00-base.js.

Every float is written as the hex of its IEEE-754 bits, so the fixture is a
bit-exact channel: no decimal round-trip to argue about, NaN and +/-0 and
+/-inf survive, and the node side compares bit patterns, not tolerances.

Run:
  <pafenv>/Scripts/python.exe tools/parity-core-array.py
Writes fixtures/core-array.json
"""
import json
import os
import struct
import sys

import warnings

import numpy as np

warnings.simplefilter("ignore", RuntimeWarning)  # NaN median/percentile cases warn by design

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "fixtures", "core-array.json")

CASES = []


def H(x):
    """float -> 16 hex chars of its float64 bits."""
    return struct.pack("<d", float(x)).hex()


def HA(a):
    a = np.asarray(a)
    return [H(v) for v in np.ravel(a)]


def IA(a):
    return [int(v) for v in np.ravel(np.asarray(a))]


def add(fn, cid, inp, out):
    CASES.append({"fn": fn, "id": cid, "in": inp, "out": out})


rng = np.random.default_rng(20260909)


# ---------------------------------------------------------------- arange
# fractional steps are the whole point of this tool (3.0 / 4.7 / 6.38)
for cid, (start, stop, step) in {
    "int_stop_only": (0, 10, 1),
    "int_range": (3, 11, 2),
    "frac_0.3": (0.1, 5.0, 0.3),
    "frac_0.05_ladder": (2.05, 26.0, 0.05),
    "step_4.7": (0.0, 47.0, 4.7),
    "step_6.38": (2.5, 100.0, 6.38),
    "recon_xs": (1.375, 240 + 4.7, 4.7),
    "len_0": (5.0, 5.0, 1.0),
    "len_1": (5.0, 5.5, 1.0),
    "len_2": (5.0, 6.5, 1.0),
    "tenth": (0.0, 1.0, 0.1),
}.items():
    v = np.arange(start, stop, step)
    add("arange", cid, {"start": start, "stop": stop, "step": step},
        {"vals": HA(v), "n": int(v.size)})


# ---------------------------------------------------------------- linspace
for cid, (start, stop, num) in {
    "0_h_ny": (0, 97, 6),
    "0_h_ny_deg": (0, 5, 9),
    "maxpoints": (0, 4095, 800),
    "float_ends": (2.05, 26.0, 33),
    "num_1": (0, 10, 1),
    "num_2": (0, 10, 2),
    "num_0": (0, 10, 0),
    "same_ends": (7.5, 7.5, 5),
    "neg": (-3.25, 4.75, 11),
}.items():
    v = np.linspace(start, stop, num)
    add("linspace", cid, {"start": start, "stop": stop, "num": num},
        {"vals": HA(v), "n": int(v.size)})
    if num > 0:
        vi = np.linspace(start, stop, num)[:-1].astype(int)
        add("astype_int", "linspace_" + cid, {"a": HA(np.linspace(start, stop, num)[:-1])},
            {"vals": IA(vi)})

add("astype_int", "negatives_truncate",
    {"a": HA(np.array([-3.9, -0.7, -0.5, 0.0, 0.5, 0.7, 3.9, -1.0]))},
    {"vals": IA(np.array([-3.9, -0.7, -0.5, 0.0, 0.5, 0.7, 3.9, -1.0]).astype(int))})


# ---------------------------------------------------------------- clip / abs
clip_a = np.concatenate([rng.normal(0, 2, 40),
                         np.array([0.0, -0.0, 1.5, -1.5, np.nan])])
for cid, (lo, hi) in {
    "0_1.5": (0.0, 1.5),
    "lo_only": (0.0, None),
    "hi_only": (None, 1.0),
    "neg1_1": (-1.0, 1.0),
    # signed-zero tie behaviour differs between the fused two-sided clip
    # and the one-sided np.maximum / np.minimum forms
    "negzero_lo": (-0.0, 1.0),
    "negzero_hi": (-1.0, -0.0),
    "negzero_lo_only": (-0.0, None),
    "negzero_hi_only": (None, -0.0),
    "zero_hi_only": (None, 0.0),
    "zero_lo_only": (0.0, None),
    "nan_lo": (np.nan, 1.5),
    "nan_hi": (0.0, np.nan),
    "degenerate": (0.0, 0.0),
}.items():
    add("clip", cid, {"a": HA(clip_a), "lo": (None if lo is None else H(lo)),
                      "hi": (None if hi is None else H(hi))},
        {"vals": HA(np.clip(clip_a, lo, hi))})

add("abs", "mixed", {"a": HA(clip_a)}, {"vals": HA(np.abs(clip_a))})


# ---------------------------------------------------------------- argmax/min
argmax_cases = {
    "distinct": np.array([3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0]),
    "first_max_tie": np.array([1.0, 5.0, 5.0, 5.0, 2.0]),
    "all_equal": np.zeros(7),
    "single": np.array([42.0]),
    "negatives": np.array([-3.0, -1.0, -1.0, -7.0]),
    "leading_nan": np.array([np.nan, 1.0, 9.0]),
    "middle_nan": np.array([1.0, 9.0, np.nan, 20.0]),
    "trailing_tie_after_nanfree": np.array([2.0, 2.0]),
}
for cid, a in argmax_cases.items():
    add("argmax", cid, {"a": HA(a)}, {"i": int(np.argmax(a))})
    add("argmin", cid, {"a": HA(a)}, {"i": int(np.argmin(a))})

add("argmax", "EMPTY_MUST_THROW", {"a": []}, {"throws": True})
add("argmin", "EMPTY_MUST_THROW", {"a": []}, {"throws": True})


# ---------------------------------------------------------------- argsort
# Ground truth is kind='stable'. We ALSO record numpy's default answer so
# the node side can report how far the unreproducible AVX-512 tie order is
# from the stable one, instead of pretending the question does not exist.
argsort_cases = {}
argsort_cases["distinct"] = rng.normal(0, 1, 37)
argsort_cases["heavy_ties"] = rng.integers(0, 5, 60).astype(np.float64)
argsort_cases["all_equal"] = np.full(23, 2.5)
argsort_cases["two_values"] = rng.integers(0, 2, 41).astype(np.float64)
argsort_cases["sorted_asc"] = np.arange(30, dtype=np.float64)
argsort_cases["sorted_desc"] = np.arange(30, 0, -1).astype(np.float64)
argsort_cases["single"] = np.array([1.0])
argsort_cases["empty"] = np.array([], dtype=np.float64)
argsort_cases["big_ties"] = rng.integers(0, 12, 300).astype(np.float64)
argsort_cases["with_negzero"] = np.array([0.0, -0.0, 1.0, -0.0, 0.0])

for cid, a in argsort_cases.items():
    st = np.argsort(a, kind="stable")
    dflt = np.argsort(a)
    add("argsort", cid, {"a": HA(a)},
        {"stable": IA(st),
         "numpy_default": IA(dflt),
         "default_eq_stable": bool(np.array_equal(st, dflt)),
         # ground truth is the STABLE sort; np.sort(a) (default kind) can
         # differ bitwise when -0.0 and +0.0 are both present
         "sorted_vals": HA(np.sort(a, kind="stable")),
         "sorted_vals_default": HA(np.sort(a)),
         # the two descending spellings, which differ under a stable sort
         "stable_rev": IA(st[::-1]),
         "stable_of_neg": IA(np.argsort(-a, kind="stable"))})

# np.sort(kind='stable') on its own, incl. the +-0 orderings that make
# TypedArray.prototype.sort (which specifies -0 before +0) diverge
sort_cases = {
    "plain": np.array([3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0]),
    "negzero_mix": np.array([0.0, -0.0, 1.0, -0.0, 0.0]),
    "negzero_mix2": np.array([-0.0, 0.0, -0.0, 0.0, 5.0, -1.0]),
    "all_negzero": np.array([-0.0, -0.0, -0.0]),
    "all_poszero": np.array([0.0, 0.0, 0.0]),
    "zeros_and_nan": np.array([0.0, -0.0, np.nan, -1.0, 0.0]),
    "empty": np.array([], dtype=np.float64),
    "single_negzero": np.array([-0.0]),
    "random": rng.normal(0, 1, 50),
}
for cid, a in sort_cases.items():
    add("sort", cid, {"a": HA(a)},
        {"vals": HA(np.sort(a, kind="stable")),
         "vals_default": HA(np.sort(a))})

# how often does numpy's default differ from stable on tie-heavy data?
_diff = 0
_tot = 0
_valdiff = 0
for _ in range(400):
    n = int(rng.integers(2, 260))
    a = rng.integers(0, max(2, n // int(rng.integers(1, 8))), size=n).astype(np.float64)
    st = np.argsort(a, kind="stable")
    df = np.argsort(a)
    _tot += 1
    if not np.array_equal(st, df):
        _diff += 1
    if not np.array_equal(a[st], a[df]):
        _valdiff += 1

# and on strictly-distinct data, where the permutation is unique
_ddiff = 0
for _ in range(200):
    n = int(rng.integers(2, 260))
    a = rng.permutation(n).astype(np.float64) + rng.normal(0, 1e-9, n)
    if not np.array_equal(np.argsort(a, kind="stable"), np.argsort(a)):
        _ddiff += 1

ARGSORT_STUDY = {
    "tie_heavy_trials": _tot,
    "tie_heavy_default_differs_from_stable": _diff,
    "tie_heavy_sorted_VALUES_differ": _valdiff,
    "distinct_trials": 200,
    "distinct_default_differs_from_stable": _ddiff,
}


# ---------------------------------------------------------------- median
median_cases = {
    "odd": np.array([3.0, 1.0, 4.0, 1.0, 5.0]),
    "even": np.array([3.0, 1.0, 4.0, 1.0]),
    "even_avg_not_representable": np.array([1.0, 2.0, 3.0000000000000004, 4.0]),
    "n1": np.array([7.25]),
    "n2": np.array([1.0, 2.0]),
    "duplicates": np.array([2.0] * 6 + [9.0] * 4),
    "negatives": rng.normal(0, 3, 50),
    "even_random": rng.normal(0, 3, 64),
    "core_cols_ints": np.array([61.0, 60.0, 61.0]),
    "core_cols_even": np.array([61.0, 60.0, 61.0, 64.0]),
    # numpy: any NaN -> NaN (a sort-and-pick port answers from the finite values)
    "with_nan": np.array([3.0, np.nan, 1.0, 2.0]),
    "with_nan_odd": np.array([3.0, np.nan, 1.0, 2.0, 7.0]),
    "all_nan": np.array([np.nan, np.nan]),
}
for cid, a in median_cases.items():
    add("median", cid + "|f8", {"a": HA(a), "dtype": "f8"},
        {"v": H(np.median(a))})
    a32 = a.astype(np.float32)
    m32 = np.median(a32)
    assert m32.dtype == np.float32, (cid, m32.dtype)
    add("median", cid + "|f4", {"a": HA(a32.astype(np.float64)), "dtype": "f4"},
        {"v": H(float(m32))})

add("median", "EMPTY_MUST_THROW", {"a": [], "dtype": "f8"}, {"throws": True})


# ---------------------------------------------------------------- bincount
bc_cases = {
    "plain": (np.array([0, 1, 1, 3, 3, 3, 7], np.int64), None, 0),
    "minlength": (np.array([0, 1, 1], np.int64), None, 10),
    "minlength_shorter": (np.array([0, 5], np.int64), None, 2),
    "empty": (np.array([], np.int64), None, 0),
    "empty_minlength": (np.array([], np.int64), None, 4),
    "weights_f8": (np.array([0, 0, 1, 2, 2, 2], np.int64),
                   np.array([0.1, 0.2, 1e16, -1e16, 3.0, 1e-16]), 0),
    "weights_order": (np.array([0, 0, 0, 0], np.int64),
                      np.array([1e16, 1.0, -1e16, 1.0]), 0),
    "weights_minlength": (np.array([2, 2, 0], np.int64),
                          np.array([0.5, 0.25, 0.125]), 6),
    "big_random": (rng.integers(0, 40, 500).astype(np.int64),
                   rng.normal(0, 1, 500), 64),
}
for cid, (lst, wts, ml) in bc_cases.items():
    v = np.bincount(lst, weights=wts, minlength=ml)
    add("bincount", cid,
        {"list": IA(lst),
         "weights": (None if wts is None else HA(wts)),
         "minlength": ml},
        {"vals": (IA(v) if wts is None else HA(v)),
         "weighted": wts is not None,
         "n": int(v.size)})


# ---------------------------------------------------------------- unique
uniq_cases = {
    "dups": np.array([3.0, 1.0, 3.0, 2.0, 1.0, 1.0]),
    "sorted": np.array([1.0, 2.0, 3.0]),
    "all_same": np.full(5, 4.0),
    "single": np.array([9.0]),
    "empty": np.array([], dtype=np.float64),
    "negatives": np.array([-1.0, 2.0, -1.0, -5.0, 2.0, 0.0]),
    "ints_like": rng.integers(0, 8, 40).astype(np.float64),
    "clip_round_cuts": np.clip(np.round(np.arange(0.5, 40.0, 4.7)), 0, 32),
    "tile_ids": np.array([5.0, 5.0, 1.0, 64.0, 1.0, 65.0, 64.0]),
    # equal_nan=True: every NaN collapses into one trailing entry
    "with_nans": np.array([np.nan, 2.0, np.nan, 1.0, 2.0, np.nan]),
    "all_nan": np.array([np.nan, np.nan]),
    "one_nan": np.array([1.0, np.nan]),
}
for cid, a in uniq_cases.items():
    vals, idx, inv, cnt = np.unique(a, return_index=True,
                                    return_inverse=True, return_counts=True)
    add("unique", cid, {"a": HA(a)},
        {"values": HA(vals), "index": IA(idx),
         "inverse": IA(inv), "counts": IA(cnt)})


# ---------------------------------------------------------------- diff
diff_cases = {
    "n1": (np.array([1.0, 4.0, 9.0, 16.0, 25.0]), 1),
    "n2": (np.array([1.0, 4.0, 9.0, 16.0, 25.0]), 2),
    "n2_noisy": (rng.normal(0, 1, 30), 2),
    "n1_len1": (np.array([5.0]), 1),
    "n1_len0": (np.array([], dtype=np.float64), 1),
    "n2_len2": (np.array([1.0, 2.0]), 2),
    "n0": (np.array([1.0, 2.0, 3.0]), 0),
    "peaks_spacing": (np.array([3.0, 8.0, 12.0, 17.0, 21.0, 26.0]), 1),
    "cancel": (np.array([1e16, 1.0, 1e16, 1.0]), 1),
}
for cid, (a, n) in diff_cases.items():
    add("diff", cid + "|f8", {"a": HA(a), "n": n, "dtype": "f8"},
        {"vals": HA(np.diff(a, n=n))})
    a32 = a.astype(np.float32)
    add("diff", cid + "|f4", {"a": HA(a32.astype(np.float64)), "n": n, "dtype": "f4"},
        {"vals": HA(np.diff(a32, n=n).astype(np.float64))})


# ---------------------------------------------------------------- interp
ladder = np.exp(np.linspace(np.log(2.0), np.log(64.0), 40))   # log-spaced, like fusion.ladder()
curve = np.abs(rng.normal(0, 1, 40))
curve = curve / curve.max()
log_steps = np.log(ladder)

interp_probe = np.concatenate([
    np.log(np.array([1.0, 2.0, 2.0000001, 3.7, 6.38, 12.0, 63.999, 64.0, 100.0])),
    log_steps,                       # exact knots
    (log_steps[:-1] + log_steps[1:]) / 2,
])
add("interp", "log_ladder_array",
    {"x": HA(interp_probe), "xp": HA(log_steps), "fp": HA(curve)},
    {"vals": HA(np.interp(interp_probe, log_steps, curve))})
for i, xv in enumerate(interp_probe):
    if i % 7 == 0:
        add("interp", "log_ladder_scalar_%d" % i,
            {"x": H(xv), "xp": HA(log_steps), "fp": HA(curve), "scalar": True},
            {"v": H(np.interp(float(xv), log_steps, curve))})

simple_xp = np.array([0.0, 1.0, 2.0, 3.0])
simple_fp = np.array([10.0, 20.0, 40.0, 80.0])
simple_x = np.array([-5.0, 0.0, 0.5, 1.0, 1.25, 2.0, 3.0, 3.5, np.nan])
add("interp", "simple_clamped",
    {"x": HA(simple_x), "xp": HA(simple_xp), "fp": HA(simple_fp)},
    {"vals": HA(np.interp(simple_x, simple_xp, simple_fp))})

dup_xp = np.array([0.0, 1.0, 1.0, 2.0])
dup_fp = np.array([0.0, 5.0, 9.0, 11.0])
dup_x = np.array([0.5, 1.0, 1.5])
add("interp", "duplicate_knots",
    {"x": HA(dup_x), "xp": HA(dup_xp), "fp": HA(dup_fp)},
    {"vals": HA(np.interp(dup_x, dup_xp, dup_fp))})

# The exact-knot shortcut (dx[j]==x -> dy[j]) is unobservable for ordinary
# finite data - slope*0 + dy[j] == dy[j]. It only bites when the slope
# OVERFLOWS, so this case is what makes that branch testable at all.
ovf_xp = np.array([0.0, 1.0, 2.0])
ovf_fp = np.array([0.0, 1e308, -1e308])
ovf_x = np.array([0.5, 1.0, 1.5])
add("interp", "overflowing_slope",
    {"x": HA(ovf_x), "xp": HA(ovf_xp), "fp": HA(ovf_fp)},
    {"vals": HA(np.interp(ovf_x, ovf_xp, ovf_fp))})

two_xp = np.array([2.0, 5.0])
two_fp = np.array([1.0, -1.0])
two_x = np.array([1.0, 2.0, 3.5, 5.0, 6.0])
add("interp", "two_knots",
    {"x": HA(two_x), "xp": HA(two_xp), "fp": HA(two_fp)},
    {"vals": HA(np.interp(two_x, two_xp, two_fp))})


# ---------------------------------------------------------------- searchsorted
ss_a = np.array([0.0, 1.0, 1.0, 2.0, 4.0, 4.0, 4.0, 9.0])
ss_v = np.array([-1.0, 0.0, 0.5, 1.0, 1.5, 4.0, 4.5, 9.0, 10.0])
for side in ("left", "right"):
    add("searchsorted", "dups_" + side,
        {"a": HA(ss_a), "v": HA(ss_v), "side": side},
        {"vals": IA(np.searchsorted(ss_a, ss_v, side=side))})
    add("searchsorted", "scalar_" + side,
        {"a": HA(ss_a), "v": H(4.0), "side": side, "scalar": True},
        {"i": int(np.searchsorted(ss_a, 4.0, side=side))})

# the reconstruct.py:387 shape: cuts vs pixel coordinates
cuts = np.unique(np.clip(np.round(np.arange(0.0, 64.0 + 4.7, 4.7)), 0, 64))
coords = np.arange(64).astype(np.float64)
add("searchsorted", "recon_cuts_right",
    {"a": HA(cuts), "v": HA(coords), "side": "right"},
    {"vals": IA(np.searchsorted(cuts, coords, side="right"))})

# the selfsim.py:360 shape: cumulative weights vs half the total
cw = np.cumsum(np.abs(rng.normal(0, 1, 25)))
add("searchsorted", "wmedian_cumsum",
    {"a": HA(cw), "v": H(0.5 * cw[-1]), "side": "left", "scalar": True},
    {"i": int(np.searchsorted(cw, 0.5 * cw[-1]))})

add("searchsorted", "empty_haystack",
    {"a": [], "v": H(1.0), "side": "left", "scalar": True},
    {"i": int(np.searchsorted(np.array([]), 1.0))})


# ---------------------------------------------------------------- round
round_cases = {
    "halves": np.array([-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5]),
    "near_halves": np.array([0.49999999999999994, 0.5000000000000001,
                             2.4999999999999996, 2.5000000000000004]),
    "signed_zero": np.array([-0.4, -0.0, 0.0, 0.4]),
    "large": np.array([1e15 + 0.5, 4503599627370496.0, 1e300]),
    "acf_over12": np.round(np.arange(0.0, 120.0, 3.5) / 12.0) * 12.0,
    "random": rng.normal(0, 20, 60),
    "grid_cuts": np.arange(0.0, 64.0 + 4.7, 4.7),
    "grid_cuts_638": np.arange(1.5, 96.0, 6.38),
    "negatives": -np.abs(rng.normal(0, 8, 40)),
    # dense: exact halves, halves +-1ulp, tiny, |x| around 2**52 (where the
    # fractional part vanishes), inf/nan, and the two grid ladders
    "dense": np.concatenate([
        rng.uniform(-1e6, 1e6, 1500), rng.uniform(-50, 50, 1500),
        np.arange(-400, 400) + 0.5,
        np.nextafter(np.arange(-400, 400) + 0.5, np.inf),
        np.nextafter(np.arange(-400, 400) + 0.5, -np.inf),
        rng.uniform(-1, 1, 500) * 1e-3,
        2.0 ** 52 + rng.integers(-5, 5, 200) + rng.choice([0.0, 0.5], 200),
        -(2.0 ** 52) + rng.integers(-5, 5, 200) + rng.choice([0.0, 0.5], 200),
        np.array([np.inf, -np.inf, np.nan, 4503599627370495.5,
                  -4503599627370495.5, 9007199254740993.0, -0.0, 0.0]),
        np.arange(0.0, 240.0 + 4.7, 4.7), np.arange(1.5, 96.0, 6.38),
    ]),
}
for cid, a in round_cases.items():
    if cid == "acf_over12":
        src = np.arange(0.0, 120.0, 3.5) / 12.0
        add("round", cid, {"a": HA(src)}, {"vals": HA(np.round(src))})
    else:
        add("round", cid, {"a": HA(a)}, {"vals": HA(np.round(a))})


# ---------------------------------------------------------------- percentile
pct_arrays = {
    "profile": np.abs(rng.normal(0, 1, 101)),
    "small": np.array([1.0, 2.0, 3.0, 4.0]),
    "n1": np.array([3.5]),
    "n2": np.array([1.0, 10.0]),
    "n3": np.array([1.0, 2.0, 100.0]),
    "with_dups": np.array([5.0] * 10 + [1.0] * 10),
    "wide_range": np.array([1e-9, 1.0, 1e9, 3.0, 7.0, 2.0, 1e-3]),
    "grad_like": np.abs(rng.normal(0, 40, 997)) + 1.0,
    "n20": np.abs(rng.normal(0, 1, 20)),
    "n21": np.abs(rng.normal(0, 1, 21)),
    "with_nan": np.array([3.0, np.nan, 1.0, 2.0, 5.0]),
}
for cid, a in pct_arrays.items():
    for q in (0, 25, 50, 95, 99, 100):
        v8 = np.percentile(a, q)
        assert np.asarray(v8).dtype == np.float64, (cid, q)
        add("percentile", "%s|q%d|f8" % (cid, q),
            {"a": HA(a), "q": q, "dtype": "f8"}, {"v": H(v8)})
        a32 = a.astype(np.float32)
        v4 = np.percentile(a32, q)
        assert np.asarray(v4).dtype == np.float32, (cid, q, np.asarray(v4).dtype)
        add("percentile", "%s|q%d|f4" % (cid, q),
            {"a": HA(a32.astype(np.float64)), "q": q, "dtype": "f4"},
            {"v": H(float(v4))})

add("percentile", "EMPTY_MUST_THROW", {"a": [], "q": 95, "dtype": "f8"},
    {"throws": True})


# ---------------------------------------------------------------- take/reversed
t_a = rng.normal(0, 1, 20)
t_i = np.array([0, 19, 5, 5, 12, 1])
add("take", "basic", {"a": HA(t_a), "idx": IA(t_i)}, {"vals": HA(t_a[t_i])})
add("reversed", "basic", {"a": HA(t_a)}, {"vals": HA(t_a[::-1])})
add("full", "basic", {"n": 7, "value": H(2.5)}, {"vals": HA(np.full(7, 2.5))})


# ---------------------------------------------------------------- write
EXPECTED_FNS = {
    "arange", "linspace", "astype_int", "clip", "abs", "argmax", "argmin",
    "argsort", "sort", "median", "bincount", "unique", "diff", "interp",
    "searchsorted", "round", "percentile", "take", "reversed", "full",
}
present = {c["fn"] for c in CASES}
missing = EXPECTED_FNS - present
if missing:
    raise SystemExit("FIXTURE GENERATOR BUG: no cases for %s" % sorted(missing))

doc = {
    "meta": {
        "numpy": np.__version__,
        "python": sys.version.split()[0],
        "n_cases": len(CASES),
        "expected_fns": sorted(EXPECTED_FNS),
        "float_encoding": "hex of little-endian IEEE-754 float64 bits",
    },
    "argsort_study": ARGSORT_STUDY,
    "cases": CASES,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as fh:
    json.dump(doc, fh)

by_fn = {}
for c in CASES:
    by_fn[c["fn"]] = by_fn.get(c["fn"], 0) + 1
print("wrote %s" % OUT)
print("numpy %s  python %s" % (np.__version__, sys.version.split()[0]))
print("cases: %d across %d functions" % (len(CASES), len(by_fn)))
for k in sorted(by_fn):
    print("   %-14s %3d" % (k, by_fn[k]))
print()
print("argsort study (numpy default kind='quicksort' vs kind='stable'):")
for k, v in ARGSORT_STUDY.items():
    print("   %-42s %s" % (k, v))
