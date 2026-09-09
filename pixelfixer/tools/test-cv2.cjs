/* Node parity test for src/pf-03-cv2.js against fixtures/cv2-parity.json.
 *
 * Comparison is BIT-EXACT on the raw bytes of every output array. Where a
 * case fails, the count of differing elements, the max absolute difference
 * and the max ulp distance (float32 ulps for float32 data) are printed so
 * the size of the miss is visible, not just its existence.
 *
 * kmeans cases are replayed IN ORDER from a fresh RNG state, applying each
 * recorded seed only where the reference applied one, so unseeded /
 * chained calls are tested against cv2's process-global RNG behaviour.
 *
 *   node tools/test-cv2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src', 'pf-03-cv2.js');
const FIX = path.join(ROOT, 'fixtures', 'cv2-parity.json');

// load the IIFE exactly as a browser <script> would
(0, eval)(fs.readFileSync(SRC, 'utf8'));
const PF = globalThis.PF;

const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const m = data.meta;
console.log('fixtures: cv2 %s / numpy %s / python %s / IPP %s (useIPP=%s, useOptimized=%s)',
  m.cv2, m.numpy, m.python, m.ipp, m.useIPP, m.useOptimized);
console.log('cpu features: %s', m.cpu_features);
console.log('port: %s\n', PF.versionCv2);

// ------------------------------------------------------------------ helpers
function unhexU8(hex) { return new Uint8Array(Buffer.from(hex, 'hex')); }
function unhexF32(hex) {
  const buf = Buffer.from(hex, 'hex');
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}
function unhexF64(hex) {
  const buf = Buffer.from(hex, 'hex');
  const out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
  return out;
}
const i32 = new Int32Array(1), f32v = new Float32Array(i32.buffer);
function ulp32(x) { f32v[0] = x; const b = i32[0]; return b < 0 ? -2147483648 - b : b; }
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
function ulp64(x) { f64v[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }

function compare(got, want, kind) {
  if (got.length !== want.length) return { ok: false, lenMismatch: true, ndiff: -1 };
  let ndiff = 0, maxAbs = 0, maxUlp = 0n, first = -1;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    ndiff++;
    if (first < 0) first = i;
    const d = Math.abs(got[i] - want[i]);
    if (d > maxAbs) maxAbs = d;
    let u;
    if (kind === 'f32') u = BigInt(Math.abs(ulp32(got[i]) - ulp32(want[i])));
    else if (kind === 'f64') { u = ulp64(got[i]) - ulp64(want[i]); if (u < 0n) u = -u; }
    else u = BigInt(Math.abs(got[i] - want[i]));
    if (u > maxUlp) maxUlp = u;
  }
  return { ok: ndiff === 0, ndiff, maxAbs, maxUlp, first, n: want.length };
}

const tally = {};
function record(section, name, res, extra) {
  const t = tally[section] || (tally[section] = { pass: 0, fail: 0, worst: null });
  if (res.ok) { t.pass++; return; }
  t.fail++;
  const msg = res.lenMismatch ? 'LENGTH MISMATCH'
    : `${res.ndiff}/${res.n} differ, maxAbs=${res.maxAbs.toExponential(3)}, maxUlp=${res.maxUlp}, first@${res.first}`;
  console.log(`  FAIL ${section} ${name}: ${msg}${extra ? ' ' + extra : ''}`);
  if (!t.worst || (res.maxUlp > t.worst.maxUlp)) t.worst = { name, maxUlp: res.maxUlp, maxAbs: res.maxAbs };
}
function tryRun(section, name, fn) {
  try { return fn(); } catch (e) {
    record(section, name, { ok: false, lenMismatch: false, ndiff: -1, n: 0, maxAbs: NaN, maxUlp: -1n, first: -1 }, 'THREW: ' + e.message);
    return null;
  }
}
const OK = { ok: true, ndiff: 0, n: 0, maxAbs: 0, maxUlp: 0n, first: -1 };
const BAD = { ok: false, ndiff: 0, n: 0, maxAbs: 0, maxUlp: 0n, first: -1 };

// --------------------------------------------------------------- RNG.randu64
// cv2.randu(CV_64F, 0, 1): v = int64((temp >> 32) | (temp << 32)); arr = v*2^-64 + 0.5.
// Reads BOTH state words, which kmeans never does.
for (const c of data.randu64) {
  PF.setRNGSeed(c.seed);
  const r = PF.theRNG();
  const got = new Float64Array(c.n);
  for (let i = 0; i < c.n; i++) {
    r.next();
    const lo = r.lo, hi = r.hi;
    const v = (lo >= 2147483648 ? lo - 4294967296 : lo) * 4294967296 + hi;
    got[i] = v * 5.421010862427522e-20 + 0.5;
  }
  record('RNG.randu64', `seed ${c.seed}`, compare(got, unhexF64(c.out), 'f64'));
}

// ---------------------------------------------------------------- medianBlur
for (const c of data.medianBlur) {
  const src = { d: unhexU8(c.src), w: c.w, h: c.h, cn: c.cn };
  const out = tryRun('medianBlur', c.name, () => PF.medianBlur(src, 3));
  if (out) record('medianBlur', c.name, compare(out.d, unhexU8(c.out), 'u8'));
}

// ----------------------------------------------------------------- boxFilter
// Two cv2 5.x paths (see the fixture's "path" tag). filterEngine-path cases
// must be bit-exact. blockSum-path cases (ksize <= 5x5) must THROW, and the
// unguarded engine model must agree with the parity script's independent
// numpy engine model about whether it matches cv2 there -- so the guard is
// shown to fence off cases the model actually gets wrong.
let bsTotal = 0, bsEngineMiss = 0, feTotal = 0;
for (const c of data.boxFilter) {
  const src = { d: unhexF32(c.src), w: c.w, h: c.h };
  const want = unhexF32(c.out);
  if (c.path === 'blockSum') {
    bsTotal++;
    let threw = false;
    try { PF.boxFilter(src, [c.kw, c.kh]); } catch (e) { threw = true; }
    record('boxFilter.blockSum-path.throws', c.name, threw ? OK : BAD, threw ? '' : '(did not throw)');
    const eng = tryRun('boxFilter.blockSum-path.engine-attribution', c.name, () => PF._boxFilterEngine(src, c.kw, c.kh));
    if (!eng) continue;
    const res = compare(eng.d, want, 'f32');
    if (!res.ok) {
      bsEngineMiss++;
      console.log(`  info blockSum-path ${c.name} (k${c.kw}x${c.kh}): unguarded engine model would miss cv2 by ` +
        `${res.ndiff}/${res.n} elements, maxAbs=${res.maxAbs.toExponential(3)}, maxUlp=${res.maxUlp} -- PF.boxFilter throws here instead`);
    }
    record('boxFilter.blockSum-path.engine-attribution', c.name, res.ok === c.engine_model_matches ? OK : BAD,
      `(js engine model ${res.ok ? 'matches' : `misses ${res.ndiff}/${res.n}, maxUlp=${res.maxUlp}`}; numpy engine model matches=${c.engine_model_matches})`);
  } else {
    feTotal++;
    const out = tryRun('boxFilter', c.name, () => PF.boxFilter(src, [c.kw, c.kh]));
    if (out) record('boxFilter', c.name, compare(out.d, want, 'f32'));
  }
}
record('negative-control', `blockSum guard fences off REAL misses: engine model wrong on ${bsEngineMiss}/${bsTotal} blockSum-path cases (filterEngine-path cases: ${feTotal})`,
  bsEngineMiss > 0 ? OK : BAD);

// ------------------------------------------------------------ gaussianKernel
for (const c of data.gaussianKernel) {
  const k = tryRun('getGaussianKernel', `n=${c.n} sigma=${c.sigma}`, () => PF.getGaussianKernel(c.n, c.sigma));
  if (k) record('getGaussianKernel', `n=${c.n} sigma=${c.sigma}`, compare(k, unhexF32(c.k), 'f32'));
}

// -------------------------------------------------------------- GaussianBlur
for (const c of data.gaussianBlur) {
  const src = { d: unhexF32(c.src), w: c.w, h: c.h };
  const ks = (c.ksize[0] === 0 && c.ksize[1] === 0) ? 0 : c.ksize;
  const out = tryRun('GaussianBlur', c.name, () => PF.GaussianBlur(src, ks, c.sigmaX, c.sigmaY));
  if (out) record('GaussianBlur', c.name, compare(out.d, unhexF32(c.out), 'f32'));
}

// ----------------------------------------------------------------- Laplacian
for (const c of data.laplacian) {
  const src = { d: unhexF32(c.src), w: c.w, h: c.h };
  const out = tryRun('Laplacian', c.name, () => PF.Laplacian(src));
  if (out) record('Laplacian', c.name, compare(out.d, unhexF32(c.out), 'f32'));
}

// -------------------------------------------------------------------- kmeans
function replayKmeans(sectionLabels, sectionCenters, sectionComp, opts) {
  PF.setRNGSeed(0xffffffff);                       // cv::theRNG() fresh state
  PF._cv2.ppUnrolled = opts.ppUnrolled;
  let secs = 0;
  for (const c of data.kmeans) {
    if (c.seed !== null && c.seed !== undefined) PF.setRNGSeed(c.seed);
    const X = { d: unhexF32(c.data), w: c.dims, h: c.N };
    const t0 = Date.now();
    const r = tryRun(sectionLabels, c.name, () =>
      PF.kmeans(X, c.K, { maxCount: c.maxCount, epsilon: c.epsilon }, c.attempts));
    secs += (Date.now() - t0) / 1000;
    if (!r) continue;
    record(sectionLabels, c.name, compare(r.labels, Int32Array.from(c.labels), 'i32'));
    record(sectionCenters, c.name, compare(r.centers.d, unhexF32(c.centers), 'f32'));
    record(sectionComp, c.name, compare(new Float64Array([r.compactness]), unhexF64(c.compactness_hex), 'f64'),
      `(js ${r.compactness} vs cv2 ${c.compactness})`);
  }
  return secs;
}
const kmSecs = replayKmeans('kmeans.labels', 'kmeans.centers', 'kmeans.compactness', { ppUnrolled: true });

// If anything missed, attribute it: replay with the float-unrolled partial
// sums switched off so the report can say which model the miss belongs to.
const kmMissed = (tally['kmeans.labels'] || {}).fail || (tally['kmeans.centers'] || {}).fail;
if (kmMissed) {
  console.log('\n  kmeans missed under ppUnrolled=true; replaying with ppUnrolled=false for attribution:');
  replayKmeans('kmeans.labels[ppUnrolled=false]', 'kmeans.centers[ppUnrolled=false]',
    'kmeans.compactness[ppUnrolled=false]', { ppUnrolled: false });
}
PF._cv2.ppUnrolled = true;

// Negative controls: prove the comparisons CAN fail.
{
  // wrong seed -> labels must differ; RNG must advance
  const c = data.kmeans.find(x => x.seed !== null && x.seed !== undefined && x.K > 1);
  const X = { d: unhexF32(c.data), w: c.dims, h: c.N };
  PF.setRNGSeed(c.seed + 1);
  const r = PF.kmeans(X, c.K, { maxCount: c.maxCount, epsilon: c.epsilon }, c.attempts);
  record('negative-control', `wrong seed (${c.seed + 1}) on ${c.name} must NOT match`,
    compare(r.labels, Int32Array.from(c.labels), 'i32').ok ? BAD : OK);
  const a = PF.theRNG().next(), b = PF.theRNG().next();
  record('negative-control', 'RNG advances', a !== b ? OK : BAD);
  // a private RNG must give the same answer as the global one from the same seed
  const g = new PF.RNG(c.seed);
  const r2 = PF.kmeans(X, c.K, { maxCount: c.maxCount, epsilon: c.epsilon }, c.attempts, g);
  record('negative-control', 'private PF.RNG(seed) reproduces the recorded run',
    compare(r2.labels, Int32Array.from(c.labels), 'i32'));
  // The exact-FMA emulation must differ from naive fr(a*b+c) on a constructed
  // double-rounding case and agree with an independent BigInt oracle:
  //   a = 2^-12 (1 + 2^-23), b = 2^-12 (1 - 2^-23), c = 1 + 2^-23  (all float32)
  //   a*b = 2^-24 - 2^-70 exactly; a*b + c = 1 + 2^-23 + 2^-24 - 2^-70, which
  //   is just BELOW the float32 midpoint 1 + 2^-23 + 2^-24, so the correct
  //   float32 result is 1 + 2^-23. float64 rounds the sum ONTO the midpoint
  //   (2^-70 is far below half an ulp of 1), and fround then ties-to-even to
  //   1 + 2^-22: the wrong neighbour.
  const av0 = Math.pow(2, -12) * (1 + Math.pow(2, -23));
  const bv0 = Math.pow(2, -12) * (1 - Math.pow(2, -23));
  const cv0 = 1 + Math.pow(2, -23);
  record('negative-control', 'constructed operands are float32', (Math.fround(av0) === av0 && Math.fround(bv0) === bv0 && Math.fround(cv0) === cv0) ? OK : BAD);
  const naive0 = Math.fround(av0 * bv0 + cv0), fma0 = PF._fmaf(av0, bv0, cv0);
  record('negative-control', `naive fr(a*b+c) double-rounds to ${naive0} (1+2^-22) on the constructed case`, naive0 === 1 + Math.pow(2, -22) ? OK : BAD);
  record('negative-control', `fmaf gives ${fma0} (1+2^-23) on the constructed case`, fma0 === 1 + Math.pow(2, -23) ? OK : BAD);
  // Independent oracle: exact integer arithmetic. Every float32 x is m*2^-149
  // with integer m, so x*2^149 is an exact integer-valued double; products are
  // carried at scale 2^298.
  function toBig(x) { return BigInt(x * Math.pow(2, 149)); }
  function evenMantissa(q) { f32v[0] = q; return (i32[0] & 1) === 0; }
  function fmaOracle(a, b, c) {
    const S = toBig(a) * toBig(b) + toBig(c) * (1n << 149n);   // exact a*b + c, scaled by 2^298
    const approx = Math.fround(Number(S) * Math.pow(2, -298));
    const cand = [approx];
    f32v[0] = approx; i32[0] += 1; cand.push(f32v[0]);
    f32v[0] = approx; i32[0] -= 1; cand.push(f32v[0]);
    let best = null, bestErr = null;
    for (const q of cand) {
      const Q = toBig(q) * (1n << 149n);
      const err = S > Q ? S - Q : Q - S;
      if (best === null || err < bestErr || (err === bestErr && evenMantissa(q) && !evenMantissa(best))) { best = q; bestErr = err; }
    }
    return best;
  }
  record('negative-control', 'BigInt oracle agrees with fmaf on the constructed case', fmaOracle(av0, bv0, cv0) === fma0 ? OK : BAD);
  let agree = 0, total = 0, naiveDiffers = 0;
  let seed = 12345;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  for (let i = 0; i < 20000; i++) {
    const a1 = Math.fround((rnd() * 2 - 1) * Math.pow(2, Math.floor(rnd() * 20) - 10));
    const b1 = Math.fround((rnd() * 2 - 1) * Math.pow(2, Math.floor(rnd() * 20) - 10));
    const c1 = Math.fround((rnd() * 2 - 1) * Math.pow(2, Math.floor(rnd() * 40) - 20));
    total++;
    const o = fmaOracle(a1, b1, c1);
    if (PF._fmaf(a1, b1, c1) === o) agree++;
    if (Math.fround(a1 * b1 + c1) !== o) naiveDiffers++;
  }
  record('negative-control', `fmaf agrees with the BigInt oracle on ${agree}/${total} random float32 triples (naive fr(a*b+c) wrong on ${naiveDiffers})`, agree === total ? OK : BAD);
}

// Guard rails: unsupported modes must THROW, never approximate.
const guards = [
  ['medianBlur ksize 5', () => PF.medianBlur({ d: new Uint8Array(9), w: 3, h: 3 }, 5)],
  ['medianBlur float input', () => PF.medianBlur({ d: new Float32Array(9), w: 3, h: 3 }, 3)],
  ['boxFilter float64 input', () => PF.boxFilter({ d: new Float64Array(9), w: 3, h: 3 }, [1, 7])],
  ['boxFilter constant border', () => PF.boxFilter({ d: new Float32Array(9), w: 3, h: 3 }, [1, 7], { borderType: 'constant' })],
  ['boxFilter 5x5 (blockSum path)', () => PF.boxFilter({ d: new Float32Array(64), w: 8, h: 8 }, [5, 5])],
  ['boxFilter 1x5 (blockSum path)', () => PF.boxFilter({ d: new Float32Array(64), w: 8, h: 8 }, [1, 5])],
  ['GaussianBlur ksize 5 (sigma .5)', () => PF.GaussianBlur({ d: new Float32Array(64), w: 8, h: 8 }, 0, 0.5)],
  ['GaussianBlur short buffer', () => PF.GaussianBlur({ d: new Float32Array(63), w: 8, h: 8 }, 0, 1.0)],
  ['kmeans dims 4', () => PF.kmeans({ d: new Float32Array(40), w: 4, h: 10 }, 2, { maxCount: 10, epsilon: 1 }, 1)],
  ['kmeans N < K', () => PF.kmeans({ d: new Float32Array(6), w: 3, h: 2 }, 3, { maxCount: 10, epsilon: 1 }, 1)],
  ['kmeans rng not a PF.RNG', () => PF.kmeans({ d: new Float32Array(30), w: 3, h: 10 }, 2, { maxCount: 10, epsilon: 1 }, 1, {})],
];
for (const [name, fn] of guards) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  record('guards-throw', name, threw ? OK : BAD);
}

// ------------------------------------------------------------------ summary
console.log('\n==== summary ====');
let totalFail = 0, totalPass = 0;
for (const s of Object.keys(tally)) {
  const t = tally[s];
  totalFail += t.fail; totalPass += t.pass;
  console.log(`${s.padEnd(40)} pass ${String(t.pass).padStart(4)}   fail ${String(t.fail).padStart(4)}` +
    (t.worst ? `   worst: ${t.worst.name} maxUlp=${t.worst.maxUlp} maxAbs=${t.worst.maxAbs}` : ''));
}
console.log(`\nTOTAL pass ${totalPass}, fail ${totalFail}   (kmeans replay ${kmSecs.toFixed(1)}s)`);
console.log('reference detect() on fixtures:', JSON.stringify(m.detect));
process.exitCode = totalFail ? 1 : 0;
