"""Python round(x, 4) on the steps this job sees (2..64) plus every exact
4-dp tie k/32 in that range, for tools/oracle/check-round4.cjs to compare
pyRound4 against. Floats are dumped as float.hex so nothing is lost."""
import json, random
random.seed(1)
xs = [random.uniform(1.5, 70.0) for _ in range(50000)]
xs += [k / 32 for k in range(48, 70 * 32)]          # includes every .xxxx5 tie
xs += [round(random.uniform(2, 64), 4) + d for d in (5e-5, -5e-5, 4.9999e-5) for _ in range(2000)]
json.dump([[x.hex(), round(x, 4).hex()] for x in xs], open(__file__.replace('.py', '.json'), 'w'))
print(len(xs))
