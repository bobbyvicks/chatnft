/* Node parity test for src/pf-04-nprandom.js + src/pf-11-quantize.js against
 * fixtures/quantize-parity.json (written by tools/parity-quantize.py from the
 * pristine reference).
 *
 * Comparison is BIT-EXACT on the raw bytes of every output array (uint8
 * quantized image, int32 labels, float32 centers). Where a case fails, the
 * count of differing elements, the max absolute difference and the first
 * differing index are printed so the size of the miss is visible, not just
 * its existence. Attribution aids (sample_idx, uniq_n, k_eff) are compared
 * separately so a miss names its stage.
 *
 * kmeans_quantize cases are replayed IN ORDER from the fresh cv2 RNG state
 * (0xffffffff), applying cv2_seed only where the reference applied one, so
 * the unseeded / chained cases test PF.theRNG()'s carry-over.
 *
 * Negative controls prove the comparisons CAN fail: wrong numpy seed, wrong
 * cv2 seed, and the float32 sum-order flip (d0+(d1+d2)) replayed over every
 * case, whose discrimination count is reported as measured.
 *
 *   node tools/test-quantize.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const FIX = path.join(ROOT, 'fixtures', 'quantize-parity.json');

// load the IIFEs exactly as a browser <script> sequence would
for (const f of ['pf-00-base.js', 'pf-03-cv2.js', 'pf-04-nprandom.js', 'pf-11-quantize.js']) {
  (0, eval)(fs.readFileSync(path.join(SRC, f), 'utf8'));
}
const PF = globalThis.PF;
for (const sym of ['rint', 'kmeans', 'theRNG', 'setRNGSeed', 'default_rng', 'PCG64', 'SeedSequence', 'kmeans_quantize']) {
  if (typeof PF[sym] !== 'function') { console.log('MISSING PF.' + sym); process.exit(2); }
}

const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('fixtures: numpy %s / cv2 %s / python %s / generated %s', data.meta.numpy, data.meta.cv2, data.meta.python, data.meta.generated);
console.log('ports: %s, %s, %s, %s\n', PF.version, PF.versionCv2, PF.versionNpRandom, PF.versionQuantize);

// ------------------------------------------------------------------ helpers
function unhexU8(hex) { return new Uint8Array(Buffer.from(hex, 'hex')); }
function unhexI32(hex) {
  const buf = Buffer.from(hex, 'hex');
  const out = new Int32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt32LE(i * 4);
  return out;
}
function unhexF32(hex) {
  const buf = Buffer.from(hex, 'hex');
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

function compare(got, want) {
  if (got.length !== want.length) return { ok: false, lenMismatch: true, ndiff: -1, n: want.length, gotLen: got.length };
  let ndiff = 0, maxAbs = 0, first = -1;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    ndiff++;
    if (first < 0) first = i;
    const d = Math.abs(got[i] - want[i]);
    if (d > maxAbs) maxAbs = d;
  }
  return { ok: ndiff === 0, ndiff, maxAbs, first, n: want.length };
}
function scalar(got, want) { return Object.is(got, want) ? OK : { ok: false, ndiff: 1, n: 1, maxAbs: NaN, first: 0, msg: `got ${String(got)} want ${String(want)}` }; }
const OK = { ok: true, ndiff: 0, n: 0, maxAbs: 0, first: -1 };
const BAD = { ok: false, ndiff: 0, n: 0, maxAbs: 0, first: -1 };

const tally = {};
let totalPass = 0, totalFail = 0;
function record(section, name, res, extra) {
  const t = tally[section] || (tally[section] = { pass: 0, fail: 0 });
  if (res.ok) { t.pass++; totalPass++; return; }
  t.fail++; totalFail++;
  const msg = res.lenMismatch ? `LENGTH MISMATCH got ${res.gotLen} want ${res.n}`
    : res.msg ? res.msg
      : `${res.ndiff}/${res.n} differ, maxAbs=${res.maxAbs}, first@${res.first}`;
  console.log(`  FAIL ${section} ${name}: ${msg}${extra ? ' ' + extra : ''}`);
}
function tryRun(section, name, fn) {
  try { return fn(); } catch (e) {
    record(section, name, { ok: false, ndiff: -1, n: 0, maxAbs: NaN, first: -1, msg: 'THREW: ' + e.message });
    return null;
  }
}

// ------------------------------------------------------------ numpy.random
for (const c of data.np_random.seedseq) {
  const ss = tryRun('SeedSequence', `seed ${c.seed}`, () => new PF.SeedSequence(c.seed));
  if (!ss) continue;
  record('SeedSequence', `seed ${c.seed} pool`, compare(ss.pool, c.pool));
  record('SeedSequence', `seed ${c.seed} generate_state(8)`, compare(ss.generate_state(8), c.state8));
}
for (const c of data.np_random.pcg64) {
  const bg = tryRun('PCG64', `seed ${c.seed}`, () => new PF.PCG64(c.seed));
  if (!bg) continue;
  const st = bg.state_hex();
  record('PCG64', `seed ${c.seed} state`, scalar(st.state, c.state));
  record('PCG64', `seed ${c.seed} inc`, scalar(st.inc, c.inc));
  const raw = bg.random_raw_hex(c.raw.length);
  let bad = -1;
  for (let i = 0; i < raw.length; i++) if (raw[i] !== c.raw[i]) { bad = i; break; }
  record('PCG64', `seed ${c.seed} random_raw x${c.raw.length}`, bad < 0 ? OK : { ok: false, msg: `word ${bad}: got ${raw[bad]} want ${c.raw[bad]}` });
}
for (const c of data.np_random.choice) {
  const label = `choice(${c.pop}, ${c.size}) seed ${c.seed} shuffle=${c.shuffle} [${c.branch}]`;
  const g = PF.default_rng(c.seed);
  const out = tryRun('choice', label, () => g.choice(c.pop, c.size, { replace: false, shuffle: c.shuffle }));
  if (!out) continue;
  record('choice', label, compare(out, unhexI32(c.out)));
  const st = g.bit_generator.state_hex();
  record('choice.state_after', label, scalar(st.state, c.state_after));
  record('choice.state_after', label + ' has_uint32/uinteger',
    (st.has_uint32 === c.has_uint32 && st.uinteger === c.uinteger) ? OK
      : { ok: false, msg: `got ${st.has_uint32}/${st.uinteger} want ${c.has_uint32}/${c.uinteger}` });
}
{
  const g = PF.default_rng(data.np_random.fresh_state.seed);
  record('PCG64', 'fresh default_rng state (never drawn)', scalar(g.bit_generator.state_hex().state, data.np_random.fresh_state.state));
}

// ---------------------------------------------------------- kmeans_quantize
function runCase(c) {
  const rgba = { d: unhexU8(c.rgba), w: c.w, h: c.h, cn: c.cn };
  return PF.kmeans_quantize(rgba, c.k, c.sample_max, c.seed);
}
function replayAll(section, opts) {
  PF.setRNGSeed(0xffffffff);                       // cv::theRNG() fresh state
  PF._quantize.sumOrder = opts.sumOrder;
  let secs = 0;
  const results = [];
  for (const c of data.cases) {
    if (c.cv2_seed !== null && c.cv2_seed !== undefined) PF.setRNGSeed(c.cv2_seed);
    const t0 = Date.now();
    const r = tryRun(section + '.quantized', c.name, () => runCase(c));
    secs += (Date.now() - t0) / 1000;
    results.push(r);
    if (!r) continue;
    record(section + '.quantized', c.name, compare(r.quantized.d, unhexU8(c.quantized)));
    record(section + '.labels', c.name, compare(r.labels.d, unhexI32(c.labels)));
    record(section + '.centers', c.name, compare(r.centers.d, unhexF32(c.centers)), `(centers_n js ${r.centers.h} vs py ${c.centers_n})`);
    record(section + '.attribution', c.name + ' uniq_n', scalar(r.uniq_n, c.uniq_n));
    record(section + '.attribution', c.name + ' k_eff', scalar(r.k_eff, c.k_eff));
    if (c.sample_idx !== null) {
      record(section + '.attribution', c.name + ' sample_idx', r.sample_idx ? compare(r.sample_idx, unhexI32(c.sample_idx)) : { ok: false, msg: 'js did not sample' });
    } else {
      record(section + '.attribution', c.name + ' no sampling', r.sample_idx === null ? OK : { ok: false, msg: 'js sampled where numpy did not' });
    }
    record(section + '.shape', c.name, (r.quantized.w === c.w && r.quantized.h === c.h && r.quantized.cn === c.cn
      && r.labels.w === c.w && r.labels.h === c.h && r.centers.w === 3 && r.centers.h === c.centers_n) ? OK : { ok: false, msg: 'shape mismatch' });
  }
  return { secs, results };
}
const main = replayAll('kmeans_quantize', { sumOrder: 'left' });
console.log(`kmeans_quantize replay: ${data.cases.length} cases in ${main.secs.toFixed(1)}s`);
for (const c of data.cases) {
  const r = main.results[data.cases.indexOf(c)];
  console.log(`  ${(r ? 'ok  ' : 'ERR ')} ${c.name.padEnd(40)} ${String(c.w).padStart(4)}x${String(c.h).padEnd(4)} k=${String(c.k).padEnd(4)} smax=${String(c.sample_max).padEnd(6)} cv2=${String(c.cv2_seed).padEnd(5)} uniq=${String(c.uniq_n).padEnd(6)} k_eff=${String(c.k_eff).padEnd(3)} py ${c.secs}s`);
}

// ------------------------------------------------- label distances (sqdist)
// The reference's float32 distance matrix and argmin on their own. This is
// where the summation order is pinned: the quantize cases cannot see it.
for (const c of data.sqdist) {
  const block = unhexF32(c.block), C = unhexF32(c.centers);
  PF._quantize.sumOrder = 'left';
  const d = tryRun('sqdist.d', c.name, () => PF._sqdist3(block, c.N, C, c.K));
  if (!d) continue;
  record('sqdist.d', c.name, compare(d, unhexF32(c.d)));
  record('sqdist.argmin', c.name, compare(PF._argminRows(d, c.N, c.K), unhexI32(c.argmin)));
  // negative control: the other order must miss EXACTLY the number of
  // elements numpy predicts for it (alt_ndiff), and its argmin exactly
  // alt_argmin_ndiff rows -- a count match, not just "differs".
  PF._quantize.sumOrder = 'right';
  const alt = PF._sqdist3(block, c.N, C, c.K);
  const res = compare(alt, unhexF32(c.d));
  record('negative-control', `sqdist ${c.name}: d0+(d1+d2) order misses ${c.alt_ndiff}/${c.N * c.K} elements`,
    res.ndiff === c.alt_ndiff ? OK : { ok: false, msg: `js flip missed ${res.ndiff}, numpy predicts ${c.alt_ndiff}` });
  const altArg = compare(PF._argminRows(alt, c.N, c.K), unhexI32(c.argmin));
  record('negative-control', `sqdist ${c.name}: argmin under the flip differs in ${c.alt_argmin_ndiff} rows`,
    altArg.ndiff === c.alt_argmin_ndiff ? OK : { ok: false, msg: `js flip changed ${altArg.ndiff} rows, numpy predicts ${c.alt_argmin_ndiff}` });
  PF._quantize.sumOrder = 'left';
}
{
  let tot = 0, totAlt = 0, rows = 0, rowsAlt = 0;
  for (const c of data.sqdist) { tot += c.N * c.K; totAlt += c.alt_ndiff; rows += c.N; rowsAlt += c.alt_argmin_ndiff; }
  console.log(`\nsqdist: ${data.sqdist.length} matrices, ${tot} elements; the d0+(d1+d2) order would change ${totAlt} of them and ${rowsAlt}/${rows} argmin rows`);
  record('negative-control', 'sum-order flip is discriminated by the sqdist fixtures', totAlt > 0 ? OK : BAD);
}

// ------------------------------------------------------- negative controls
{
  // 1. the float32 sum-order flip, replayed over EVERY quantize case: how
  //    many label arrays change? Reported as measured (it is expected to be
  //    rare: the argmin flips only when two centres tie within one float32
  //    rounding of a pixel). The order itself is pinned by the sqdist section.
  const before = totalPass, beforeF = totalFail;
  const alt = replayAll('sumOrder=right(attribution)', { sumOrder: 'right' });
  const altFails = totalFail - beforeF;
  totalPass = before; totalFail = beforeF;          // attribution replay does not count
  for (const k of Object.keys(tally)) if (k.startsWith('sumOrder=right')) delete tally[k];
  let changed = 0, cmpCases = 0;
  for (let i = 0; i < data.cases.length; i++) {
    const a = main.results[i], b = alt.results[i];
    if (!a || !b) continue;
    cmpCases++;
    if (!compare(a.labels.d, b.labels.d).ok) changed++;
  }
  console.log(`sum-order flip d0+(d1+d2) over the quantize cases: labels changed in ${changed}/${cmpCases} cases (${altFails} comparisons failed under it) -- measurement, not a pass/fail`);
  PF._quantize.sumOrder = 'left';

  // 2. wrong numpy seed on a sampling case: sample_idx AND quantized must differ
  const sc = data.cases.find(c => c.sample_idx !== null && c.k_eff > 1);
  PF.setRNGSeed(sc.cv2_seed);
  const r = PF.kmeans_quantize({ d: unhexU8(sc.rgba), w: sc.w, h: sc.h, cn: sc.cn }, sc.k, sc.sample_max, sc.seed + 1);
  record('negative-control', `wrong numpy seed on ${sc.name}: sample_idx differs`, compare(r.sample_idx, unhexI32(sc.sample_idx)).ok ? BAD : OK);
  record('negative-control', `wrong numpy seed on ${sc.name}: quantized differs`, compare(r.quantized.d, unhexU8(sc.quantized)).ok ? BAD : OK);

  // 3. wrong cv2 seed on a fixture case: quantized must differ
  const fc = data.cases.find(c => c.name === 'mid:cv2seed0');
  PF.setRNGSeed(fc.cv2_seed + 1);
  const r2 = PF.kmeans_quantize({ d: unhexU8(fc.rgba), w: fc.w, h: fc.h, cn: fc.cn }, fc.k, fc.sample_max, fc.seed);
  record('negative-control', `wrong cv2 seed on ${fc.name}: quantized differs`, compare(r2.quantized.d, unhexU8(fc.quantized)).ok ? BAD : OK);

  // 4. the comparator itself can fail: one flipped byte
  const q = unhexU8(fc.quantized); q[5] ^= 1;
  record('negative-control', 'one flipped byte is detected', compare(q, unhexU8(fc.quantized)).ok ? BAD : OK);

  // 5. Uint8ClampedArray input (browser ImageData) returns the same bytes and constructor
  PF.setRNGSeed(fc.cv2_seed);
  const r3 = PF.kmeans_quantize({ d: new Uint8ClampedArray(unhexU8(fc.rgba)), w: fc.w, h: fc.h, cn: fc.cn }, fc.k, fc.sample_max, fc.seed);
  record('negative-control', 'Uint8ClampedArray input: same bytes', compare(r3.quantized.d, unhexU8(fc.quantized)));
  record('negative-control', 'Uint8ClampedArray input: same constructor', r3.quantized.d instanceof Uint8ClampedArray ? OK : BAD);
}

// ---------------------------------------------------------- error paths
const throwers = [
  ['choice replace=true', () => PF.default_rng(1).choice(10, 3, { replace: true })],
  ['choice replace omitted', () => PF.default_rng(1).choice(10, 3)],
  ['choice size > pop', () => PF.default_rng(1).choice(3, 10, { replace: false })],
  ['choice with p', () => PF.default_rng(1).choice(3, 2, { replace: false, p: [0.5, 0.5, 0] })],
  ['default_rng() unseeded', () => PF.default_rng()],
  ['SeedSequence negative', () => new PF.SeedSequence(-1)],
  ['kmeans_quantize float input', () => PF.kmeans_quantize({ d: new Float32Array(16), w: 2, h: 2, cn: 4 })],
  ['kmeans_quantize cn=2', () => PF.kmeans_quantize({ d: new Uint8Array(8), w: 2, h: 2, cn: 2 })],
  ['kmeans_quantize bad length', () => PF.kmeans_quantize({ d: new Uint8Array(15), w: 2, h: 2, cn: 4 })],
];
for (const [name, fn] of throwers) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  record('throws', name, threw ? OK : BAD);
}

// ------------------------------------------------------------------ report
console.log('\nsection                                   pass  fail');
for (const k of Object.keys(tally)) {
  console.log(`${k.padEnd(40)} ${String(tally[k].pass).padStart(5)} ${String(tally[k].fail).padStart(5)}`);
}
console.log(`\nTOTAL pass ${totalPass}, fail ${totalFail}   (kmeans_quantize replay ${main.secs.toFixed(1)}s)`);
process.exit(totalFail === 0 ? 0 : 1);
