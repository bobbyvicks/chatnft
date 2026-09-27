"""Are numpy's cos / sin / log10 / abs(complex) / arctan2 CORRECTLY ROUNDED
on this machine? If they are, a correctly rounded JS implementation is
bit-exact against them; if not, only numpy's own algorithm would be.

Reference values are computed with Python's decimal module at 60 digits
(exact conversion of each double in; float(str(d)) out, which is a
correctly rounded parse), from fixtures/linalg-trans-parity.json's scalar
population (tools/parity-linalg-trans.py).

Prints only. Run: pafenv2/Scripts/python.exe tools/probe-linalg-cr.py
"""
import json
import os
import struct
from decimal import Decimal, getcontext

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(os.path.dirname(HERE), "fixtures", "linalg-trans-parity.json")
getcontext().prec = 70
PI = Decimal("3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798")
TWO_PI = 2 * PI


def F(h):
    b = bytes.fromhex(h)
    return np.frombuffer(b, np.float64)


def cos_sin(x):
    d = Decimal(float(x))
    k = (d / TWO_PI).to_integral_value()
    r = d - k * TWO_PI                     # |r| <= pi, 70-digit pi
    r2 = r * r
    c = Decimal(1); s = r; tc = Decimal(1); ts = r; n = 0
    while True:
        n += 2
        tc = -tc * r2 / (n * (n - 1)); ts = -ts * r2 / ((n + 1) * n)
        if abs(tc) < Decimal("1e-65") and abs(ts) < Decimal("1e-65"):
            break
        c += tc; s += ts
    return c, s


def atan(t):                               # |t| arbitrary
    if t < 0:
        return -atan(-t)
    if t > 1:
        return PI / 2 - atan(1 / t)
    k = 0
    while t > Decimal("0.1"):              # halve the angle
        t = t / (1 + (1 + t * t).sqrt())
        k += 1
    s = t; term = t; t2 = t * t; n = 1
    while True:
        term = -term * t2
        n += 2
        dt = term / n
        if abs(dt) < Decimal("1e-65"):
            break
        s += dt
    return s * (2 ** k)


def atan2(y, x):
    X, Y = Decimal(float(x)), Decimal(float(y))
    if X > 0:
        return atan(Y / X)
    if X < 0:
        return atan(Y / X) + (PI if Y >= 0 else -PI)
    return PI / 2 if Y > 0 else -PI / 2


def rn(d):
    return float(str(d))


def main():
    d = json.load(open(FIX))
    sc = d["scalar"]
    th, c, s = F(sc["theta"]), F(sc["cos"]), F(sc["sin"])
    N = 6000
    cr_c = cr_s = 0
    for i in range(N):
        cc, ss = cos_sin(th[i])
        cr_c += rn(cc) == c[i]
        cr_s += rn(ss) == s[i]
    print("np.cos  correctly rounded on %d/%d" % (cr_c, N))
    print("np.sin  correctly rounded on %d/%d" % (cr_s, N))
    xy, ab, an = F(sc["xy"]).reshape(-1, 2), F(sc["abs"]), F(sc["angle"])
    cr_a = cr_n = 0
    for i in range(N):
        x, y = Decimal(float(xy[i, 0])), Decimal(float(xy[i, 1]))
        cr_a += rn((x * x + y * y).sqrt()) == ab[i]
        cr_n += rn(atan2(xy[i, 1], xy[i, 0])) == an[i]
    print("np.abs(complex) correctly rounded on %d/%d" % (cr_a, N))
    print("np.angle (arctan2) correctly rounded on %d/%d" % (cr_n, N))
    rt, lg = F(sc["ratio"]), F(sc["log10"])
    cr_l = sum(rn(Decimal(float(rt[i])).log10()) == lg[i] for i in range(N))
    print("np.log10 correctly rounded on %d/%d" % (cr_l, N))
    # and V8's (Math.*) are measured on the JS side against the same values


if __name__ == "__main__":
    main()
