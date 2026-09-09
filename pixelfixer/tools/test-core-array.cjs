/* Node parity test for src/pf-00-base.js against fixtures/core-array.json.
 *
 * Comparison is BITWISE (the fixture stores IEEE-754 bit patterns), not
 * tolerance-based, so "close enough" cannot pass.
 *
 * Run:  node tools/test-core-array.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
// argv[2] lets the mutation harness point the same test at a mutant copy
// without ever touching src/. Default is the real file.
const SRC = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'src', 'pf-00-base.js');
require(SRC);
const PF = globalThis.PF;
if (!PF || !PF.version) throw new Error('pf-00-base.js did not define PF');

const doc = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'fixtures', 'core-array.json'), 'utf8'));

/* ---------------------------------------------------------- bit codec */
const _buf = new ArrayBuffer(8);
const _dv = new DataView(_buf);

function bitsOf(x) {
  _dv.setFloat64(0, x, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += _dv.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function fromBits(h) {
  for (let i = 0; i < 8; i++) _dv.setUint8(i, parseInt(h.substr(i * 2, 2), 16));
  return _dv.getFloat64(0, true);
}
function f64(hexes) {
  const out = new Float64Array(hexes.length);
  for (let i = 0; i < hexes.length; i++) out[i] = fromBits(hexes[i]);
  return out;
}
function f32(hexes) {
  const out = new Float32Array(hexes.length);
  for (let i = 0; i < hexes.length; i++) out[i] = fromBits(hexes[i]);
  return out;
}
function i32(list) { return Int32Array.from(list); }

/* ---------------------------------------------------------- assertions */
let pass = 0, fail = 0, checks = 0;
const failures = [];
let nanBitDrift = 0;

function bitEq(got, want) {
  checks++;
  const gb = bitsOf(got), wb = bitsOf(want);
  if (gb === wb) return true;
  if (Number.isNaN(got) && Number.isNaN(want)) { nanBitDrift++; return true; }
  return false;
}

function cmpFloats(cid, fn, got, wantHex) {
  if (got.length !== wantHex.length) {
    return `length ${got.length} != ${wantHex.length}`;
  }
  for (let i = 0; i < wantHex.length; i++) {
    const want = fromBits(wantHex[i]);
    if (!bitEq(got[i], want)) {
      return `[${i}] got ${got[i]} (${bitsOf(got[i])}) want ${want} (${wantHex[i]})`;
    }
  }
  return null;
}

function cmpInts(cid, fn, got, want) {
  if (got.length !== want.length) return `length ${got.length} != ${want.length}`;
  for (let i = 0; i < want.length; i++) {
    checks++;
    if (got[i] !== want[i]) return `[${i}] got ${got[i]} want ${want[i]}`;
  }
  return null;
}

function record(c, err) {
  if (err) { fail++; failures.push(`${c.fn}/${c.id}: ${err}`); }
  else pass++;
}

/* ---------------------------------------------------------- handlers */
const H = {};

H.arange = (c) => cmpFloats(c.id, 'arange',
  PF.arange(c.in.start, c.in.stop, c.in.step), c.out.vals);

H.linspace = (c) => cmpFloats(c.id, 'linspace',
  PF.linspace(c.in.start, c.in.stop, c.in.num), c.out.vals);

H.astype_int = (c) => cmpInts(c.id, 'astype_int',
  PF.astypeInt(f64(c.in.a)), c.out.vals);

H.clip = (c) => {
  const lo = c.in.lo === null ? null : fromBits(c.in.lo);
  const hi = c.in.hi === null ? null : fromBits(c.in.hi);
  const a = f64(c.in.a);
  const e = cmpFloats(c.id, 'clip', PF.clip(a, lo, hi), c.out.vals);
  if (e) return e;
  // the scalar spelling must agree with the array spelling element by element
  for (let i = 0; i < a.length; i++) {
    checks++;
    const sv = PF.clipScalar(a[i], lo, hi);
    const want = fromBits(c.out.vals[i]);
    if (bitsOf(sv) !== bitsOf(want) && !(Number.isNaN(sv) && Number.isNaN(want))) {
      return `clipScalar[${i}] got ${sv} (${bitsOf(sv)}) want ${want}`;
    }
  }
  return null;
};

H.sort = (c) => {
  const a = f64(c.in.a);
  return cmpFloats(c.id, 'sort', PF.sorted(a), c.out.vals);
};

H.abs = (c) => cmpFloats(c.id, 'abs', PF.abs(f64(c.in.a)), c.out.vals);

H.full = (c) => cmpFloats(c.id, 'full',
  PF.full(c.in.n, fromBits(c.in.value)), c.out.vals);

H.take = (c) => cmpFloats(c.id, 'take',
  PF.take(f64(c.in.a), i32(c.in.idx)), c.out.vals);

H.reversed = (c) => cmpFloats(c.id, 'reversed',
  PF.reversed(f64(c.in.a)), c.out.vals);

function throwsOrErr(fn) {
  try { fn(); } catch (e) { return null; }
  return 'expected a throw, got a value';
}

H.argmax = (c) => {
  if (c.out.throws) return throwsOrErr(() => PF.argmax(new Float64Array(0)));
  checks++;
  const got = PF.argmax(f64(c.in.a));
  return got === c.out.i ? null : `got ${got} want ${c.out.i}`;
};
H.argmin = (c) => {
  if (c.out.throws) return throwsOrErr(() => PF.argmin(new Float64Array(0)));
  checks++;
  const got = PF.argmin(f64(c.in.a));
  return got === c.out.i ? null : `got ${got} want ${c.out.i}`;
};

H.argsort = (c) => {
  const a = f64(c.in.a);
  let e = cmpInts(c.id, 'argsort', PF.argsort(a), i32(c.out.stable));
  if (e) return 'default(stable) ' + e;
  e = cmpInts(c.id, 'argsort', PF.argsort(a, 'stable'), i32(c.out.stable));
  if (e) return "explicit 'stable' " + e;
  e = cmpInts(c.id, 'argsort', PF.reversed(PF.argsort(a)), i32(c.out.stable_rev));
  if (e) return 'reversed(argsort) ' + e;
  e = cmpInts(c.id, 'argsort', PF.argsort(PF.neg(a)), i32(c.out.stable_of_neg));
  if (e) return 'argsort(neg) ' + e;
  // sorted values must match regardless of tie order
  e = cmpFloats(c.id, 'argsort', PF.take(a, PF.argsort(a)), c.out.sorted_vals);
  if (e) return 'sorted values ' + e;
  // the unreproducible mode must refuse, not guess
  e = throwsOrErr(() => PF.argsort(a, 'quicksort'));
  if (e) return "PF.argsort(a,'quicksort') " + e;
  return null;
};

H.median = (c) => {
  if (c.out.throws) return throwsOrErr(() => PF.median(new Float64Array(0), 'f8'));
  const a = c.in.dtype === 'f4' ? f32(c.in.a) : f64(c.in.a);
  const got = PF.median(a, c.in.dtype);
  const want = fromBits(c.out.v);
  return bitEq(got, want) ? null
    : `got ${got} (${bitsOf(got)}) want ${want} (${c.out.v})`;
};

H.bincount = (c) => {
  const list = i32(c.in.list);
  const w = c.in.weights === null ? null : f64(c.in.weights);
  const got = PF.bincount(list, w, c.in.minlength);
  if (got.length !== c.out.n) return `length ${got.length} != ${c.out.n}`;
  return c.out.weighted
    ? cmpFloats(c.id, 'bincount', got, c.out.vals)
    : cmpInts(c.id, 'bincount', got, c.out.vals);
};

H.unique = (c) => {
  const a = f64(c.in.a);
  const r = PF.unique(a, { counts: true, index: true, inverse: true });
  let e = cmpFloats(c.id, 'unique', r.values, c.out.values);
  if (e) return 'values ' + e;
  e = cmpInts(c.id, 'unique', r.index, c.out.index);
  if (e) return 'index ' + e;
  e = cmpInts(c.id, 'unique', r.inverse, c.out.inverse);
  if (e) return 'inverse ' + e;
  e = cmpInts(c.id, 'unique', r.counts, c.out.counts);
  if (e) return 'counts ' + e;
  // the no-options call must still give the values
  e = cmpFloats(c.id, 'unique', PF.unique(a).values, c.out.values);
  return e ? 'values(no opts) ' + e : null;
};

H.diff = (c) => {
  const a = c.in.dtype === 'f4' ? f32(c.in.a) : f64(c.in.a);
  return cmpFloats(c.id, 'diff', PF.diff(a, c.in.n), c.out.vals);
};

H.interp = (c) => {
  const xp = f64(c.in.xp), fp = f64(c.in.fp);
  if (c.in.scalar) {
    const got = PF.interp(fromBits(c.in.x), xp, fp);
    const want = fromBits(c.out.v);
    return bitEq(got, want) ? null
      : `got ${got} (${bitsOf(got)}) want ${want} (${c.out.v})`;
  }
  return cmpFloats(c.id, 'interp', PF.interp(f64(c.in.x), xp, fp), c.out.vals);
};

H.searchsorted = (c) => {
  const a = f64(c.in.a);
  if (c.in.scalar) {
    checks++;
    const got = PF.searchsorted(a, fromBits(c.in.v), c.in.side);
    return got === c.out.i ? null : `got ${got} want ${c.out.i}`;
  }
  return cmpInts(c.id, 'searchsorted',
    PF.searchsorted(a, f64(c.in.v), c.in.side), c.out.vals);
};

H.round = (c) => cmpFloats(c.id, 'round', PF.round(f64(c.in.a)), c.out.vals);

H.percentile = (c) => {
  if (c.out.throws) {
    return throwsOrErr(() => PF.percentile(new Float64Array(0), 95, 'f8'));
  }
  const a = c.in.dtype === 'f4' ? f32(c.in.a) : f64(c.in.a);
  const got = PF.percentile(a, c.in.q, c.in.dtype);
  const want = fromBits(c.out.v);
  return bitEq(got, want) ? null
    : `got ${got} (${bitsOf(got)}) want ${want} (${c.out.v})`;
};

/* ---------------------------------------------------------- run */
const seen = {};
let unhandled = 0;
for (const c of doc.cases) {
  const h = H[c.fn];
  if (!h) {
    // A missing handler is a FAILURE, never a silent skip: an instrument
    // that quietly tests nothing reads exactly like one that passed.
    unhandled++;
    fail++;
    failures.push(`${c.fn}/${c.id}: NO HANDLER in the test - not measured`);
    continue;
  }
  seen[c.fn] = (seen[c.fn] || 0) + 1;
  let err;
  try { err = h(c); } catch (e) { err = 'THREW: ' + e.message; }
  record(c, err);
}

const missing = doc.meta.expected_fns.filter((f) => !seen[f]);
const total = pass + fail;

console.log(`pf-00-base.js parity vs numpy ${doc.meta.numpy} (python ${doc.meta.python})`);
console.log(`float encoding: ${doc.meta.float_encoding}`);
console.log('');
const byFn = {};
for (const c of doc.cases) byFn[c.fn] = (byFn[c.fn] || 0) + 1;
for (const f of Object.keys(byFn).sort()) {
  const bad = failures.filter((s) => s.startsWith(f + '/')).length;
  console.log(`   ${f.padEnd(14)} ${String(byFn[f]).padStart(3)} cases  ${bad ? 'FAIL ' + bad : 'ok'}`);
}
console.log('');
console.log(`cases: ${total}   pass: ${pass}   fail: ${fail}`);
console.log(`individual value comparisons (bitwise): ${checks}`);
if (nanBitDrift) console.log(`NaN payloads differed but both were NaN: ${nanBitDrift}`);
if (unhandled) console.log(`UNHANDLED case types: ${unhandled}`);
if (missing.length) console.log(`EXPECTED-BUT-ABSENT functions: ${missing.join(', ')}`);

console.log('');
console.log("np.argsort default kind='quicksort' vs kind='stable' on this numpy:");
for (const k of Object.keys(doc.argsort_study)) {
  console.log(`   ${k.padEnd(42)} ${doc.argsort_study[k]}`);
}
const fixtureDefaultDiffs = doc.cases
  .filter((c) => c.fn === 'argsort' && c.out.default_eq_stable === false)
  .map((c) => c.id);
console.log(`   fixture argsort cases where default != stable: ` +
  `${fixtureDefaultDiffs.length}/${byFn.argsort} (${fixtureDefaultDiffs.join(', ') || 'none'})`);

const sortBitDiffs = doc.cases
  .filter((c) => c.fn === 'sort' &&
    JSON.stringify(c.out.vals) !== JSON.stringify(c.out.vals_default))
  .map((c) => c.id);
console.log(`   fixture sort cases where np.sort(default) differs BITWISE from ` +
  `np.sort(stable): ${sortBitDiffs.length}/${byFn.sort} ` +
  `(${sortBitDiffs.join(', ') || 'none'}) - all of them +-0 orderings`);

if (failures.length) {
  console.log('');
  console.log('FAILURES:');
  for (const f of failures.slice(0, 40)) console.log('  ' + f);
  if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more`);
}

if (total !== doc.meta.n_cases) {
  console.log(`\nCASE COUNT MISMATCH: ran ${total}, fixture declares ${doc.meta.n_cases}`);
  process.exit(2);
}
process.exit(fail === 0 && missing.length === 0 ? 0 : 1);
