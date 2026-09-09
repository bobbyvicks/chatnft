/* Mutation controls for tools/test-cv2.js: prove each parity section CAN
 * fail, and that each arithmetic claim in pf-03-cv2.js is load-bearing.
 *
 * Each mutation is a single exact text substitution on the source (asserted
 * to occur exactly once), loaded into a fresh global, and replayed against
 * the same fixtures. A mutation must KILL its target section and leave the
 * unrelated sections green; a mutation that changes nothing is reported as
 * "not discriminated by these fixtures" -- for those the claim rests on the
 * OpenCV source quoted in the JS, not on a measurement, and the report says so.
 *
 *   node tools/mutation-cv2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'pf-03-cv2.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'cv2-parity.json'), 'utf8'));

function unhexU8(hex) { return new Uint8Array(Buffer.from(hex, 'hex')); }
function unhexF32(hex) {
  const buf = Buffer.from(hex, 'hex'); const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4); return out;
}
function unhexF64(hex) {
  const buf = Buffer.from(hex, 'hex'); const out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8); return out;
}
function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function loadVariant(mutations) {
  let src = SRC;
  for (const [from, to] of mutations) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`mutation text found ${n} times (need exactly 1): ${JSON.stringify(from)}`);
    src = src.replace(from, to);
  }
  const ctx = { console, Math, Number, Float32Array, Float64Array, Int32Array, Uint8Array, Uint8ClampedArray, Error, Object, Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PF;
}

function run(PF, opts) {
  const fails = { randu64: 0, medianBlur: 0, boxFilter: 0, getGaussianKernel: 0, GaussianBlur: 0, Laplacian: 0,
    'kmeans.labels': 0, 'kmeans.centers': 0, 'kmeans.compactness': 0 };
  for (const c of data.randu64) {
    PF.setRNGSeed(c.seed);
    const r = PF.theRNG(); const got = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) {
      r.next(); const lo = r.lo, hi = r.hi;
      got[i] = ((lo >= 2147483648 ? lo - 4294967296 : lo) * 4294967296 + hi) * 5.421010862427522e-20 + 0.5;
    }
    if (!same(got, unhexF64(c.out))) fails.randu64++;
  }
  for (const c of data.medianBlur) {
    const o = PF.medianBlur({ d: unhexU8(c.src), w: c.w, h: c.h, cn: c.cn }, 3);
    if (!same(o.d, unhexU8(c.out))) fails.medianBlur++;
  }
  for (const c of data.boxFilter) {
    // mirrors tools/test-cv2.js: filterEngine-path cases bit-exact; blockSum-path
    // cases must throw AND the unguarded engine model must agree with the numpy
    // engine model's verdict recorded in the fixture
    const src = { d: unhexF32(c.src), w: c.w, h: c.h }, want = unhexF32(c.out);
    if (c.path === 'blockSum') {
      let threw = false;
      try { PF.boxFilter(src, [c.kw, c.kh]); } catch (e) { threw = true; }
      if (!threw) { fails.boxFilter++; continue; }
      try {
        if (same(PF._boxFilterEngine(src, c.kw, c.kh).d, want) !== c.engine_model_matches) fails.boxFilter++;
      } catch (e) { fails.boxFilter++; }
    } else {
      try {
        if (!same(PF.boxFilter(src, [c.kw, c.kh]).d, want)) fails.boxFilter++;
      } catch (e) { fails.boxFilter++; }
    }
  }
  for (const c of data.gaussianKernel) {
    if (!same(PF.getGaussianKernel(c.n, c.sigma), unhexF32(c.k))) fails.getGaussianKernel++;
  }
  for (const c of data.gaussianBlur) {
    const ks = (c.ksize[0] === 0 && c.ksize[1] === 0) ? 0 : c.ksize;
    const o = PF.GaussianBlur({ d: unhexF32(c.src), w: c.w, h: c.h }, ks, c.sigmaX, c.sigmaY);
    if (!same(o.d, unhexF32(c.out))) fails.GaussianBlur++;
  }
  for (const c of data.laplacian) {
    const o = PF.Laplacian({ d: unhexF32(c.src), w: c.w, h: c.h });
    if (!same(o.d, unhexF32(c.out))) fails.Laplacian++;
  }
  PF.setRNGSeed(0xffffffff);
  if (opts && opts.ppUnrolled !== undefined) PF._cv2.ppUnrolled = opts.ppUnrolled;
  for (const c of data.kmeans) {
    if (c.seed !== null && c.seed !== undefined) PF.setRNGSeed(c.seed);
    const r = PF.kmeans({ d: unhexF32(c.data), w: c.dims, h: c.N }, c.K, { maxCount: c.maxCount, epsilon: c.epsilon }, c.attempts);
    if (!same(r.labels, Int32Array.from(c.labels))) fails['kmeans.labels']++;
    if (!same(r.centers.d, unhexF32(c.centers))) fails['kmeans.centers']++;
    if (!same(new Float64Array([r.compactness]), unhexF64(c.compactness_hex))) fails['kmeans.compactness']++;
  }
  return fails;
}

const VARIANTS = [
  { name: 'baseline (no mutation)', mut: [], kills: [] },
  { name: 'ppUnrolled=false (double-accumulate k-means++ trial sums)', mut: [], opts: { ppUnrolled: false }, kills: ['kmeans.labels'], soft: true },
  { name: 'Gaussian: every column FMA (LANES=1)', mut: [['var LANES = 8;', 'var LANES = 1;']], kills: ['GaussianBlur'] },
  { name: 'Gaussian: every column scalar (LANES=1e9)', mut: [['var LANES = 8;', 'var LANES = 1e9;']], kills: ['GaussianBlur'] },
  { name: 'Gaussian: lane split at 16 instead of 8', mut: [['var LANES = 8;', 'var LANES = 16;']], kills: ['GaussianBlur'] },
  { name: 'Gaussian: IPP-style row split (all but the last 8 columns FMA) for w >= 72', mut: [['var w8 = w - (w % LANES);', 'var w8 = w >= 72 ? w - 8 : w - (w % LANES);']], kills: ['GaussianBlur'] },
  { name: 'Gaussian: naive fr(a*b+c) instead of exact fmaf in the row pass', mut: [['s = fmaf(kx[t], src[ro + refl101(j - rx + t, w)], s);', 's = fr(kx[t] * src[ro + refl101(j - rx + t, w)] + s);']], kills: ['GaussianBlur'], soft: true },
  { name: 'Gaussian kernel: float32 exp instead of float64', mut: [['t = Math.exp((x * x) * scale2X);', 't = Math.fround(Math.exp((x * x) * scale2X));']], kills: ['getGaussianKernel', 'GaussianBlur'] },
  { name: 'Gaussian kernel: sum taps one by one instead of 2*half+1', mut: [['sum *= 2;\n      sum += 1;', 'sum = 1; for (i = 0; i < n2; i++) sum += values[i]; for (i = 0; i < n2; i++) sum += values[i];']], kills: ['getGaussianKernel'], soft: true },
  { name: 'Gaussian kernel: no n=9 table for sigma<=0', mut: [['9: [4 / 256, 13 / 256, 30 / 256, 51 / 256, 60 / 256, 51 / 256, 30 / 256, 13 / 256, 4 / 256]', '99: [1]']], kills: ['getGaussianKernel', 'GaussianBlur'] },
  { name: 'boxFilter: blockSum guard removed (engine model served for ksize <= 5x5)', mut: [['if (kw <= 5 && kh <= 5) {', 'if (false) {']], kills: ['boxFilter'] },
  { name: 'boxFilter: blockSum guard too wide (<= 6x6)', mut: [['if (kw <= 5 && kh <= 5) {', 'if (kw <= 6 && kh <= 6) {']], kills: ['boxFilter'] },
  { name: 'boxFilter: blockSum guard on width only (would refuse the real (1,7) call)', mut: [['if (kw <= 5 && kh <= 5) {', 'if (kw <= 5) {']], kills: ['boxFilter'] },
  { name: 'boxFilter: float32 row sums', mut: [['var rows = new Float64Array(w * h);', 'var rows = new Float32Array(w * h);']], kills: ['boxFilter'] },
  { name: 'boxFilter: from-scratch column sums (no running sum)', mut: [['SUM[j] = s0 - rows[sm + j];', 'SUM[j] = 0; for (var q2 = 1; q2 < kh; q2++) SUM[j] += rows[repl(i - ay + q2, h) * w + j];']], kills: ['boxFilter'] },
  { name: 'boxFilter: from-scratch row sums for kw not in {3,5}', mut: [['acc += pad[j + kw] - pad[j];', 'acc = 0; for (var q3 = 0; q3 < kw; q3++) acc += pad[j + 1 + q3];']], kills: ['boxFilter'] },
  { name: 'boxFilter: running sum for kw=3 too', mut: [['if (kw === 3) {', 'if (kw === 3 && false) {']], kills: ['boxFilter'] },
  { name: 'boxFilter: scale applied in float32', mut: [['out[ro + j] = haveScale ? s0 * scale : s0;', 'out[ro + j] = haveScale ? fr(s0) * fr(scale) : s0;']], kills: ['boxFilter'] },
  { name: 'Laplacian: float64 accumulation', mut: [['acc = fr(-4 * d[rMid + j] + acc);', 'acc = -4 * d[rMid + j] + acc;']], kills: ['Laplacian'] },
  { name: 'kmeans: float64 squared distances', mut: [['d = fr(d + fr(t * t));', 'd = d + t * t;']], kills: ['kmeans.compactness'] },
  { name: 'kmeans: float64 centre scale (1/n not rounded to float32)', mut: [['var scale = fr(1 / counters[k]);', 'var scale = 1 / counters[k];']], kills: ['kmeans.centers'] },
  { name: 'kmeans: first max wins in empty-cluster theft', mut: [['if (maxDist <= dd) { maxDist = dd; farthest = i; }', 'if (maxDist < dd) { maxDist = dd; farthest = i; }']], kills: ['kmeans.labels'], soft: true },
  { name: 'RNG: swapped words in operator double', mut: [['return (t * TWO32 + u) * 5.421010862427522e-20;', 'return (u * TWO32 + t) * 5.421010862427522e-20;']], kills: ['kmeans.labels'] },
  { name: 'RNG: double from one 32-bit word (2^-32 perturbation)', mut: [['return (t * TWO32 + u) * 5.421010862427522e-20;', 'return t * 2.3283064365386963e-10;']], kills: ['kmeans.labels'], soft: true },
  { name: 'RNG: wrong multiplier (off by one)', mut: [['var RNG_COEFF = 4164903690;', 'var RNG_COEFF = 4164903691;']], kills: ['randu64', 'kmeans.labels'] },
  { name: 'RNG: carry dropped from the high word', mut: [['high = (high + carry) % TWO32;', 'high = high % TWO32;']], kills: ['randu64', 'kmeans.labels'] },
  { name: 'RNG: seed 0 not mapped to 0xffffffff', mut: [['if (lo === 0 && hi === 0) lo = 0xffffffff;', 'if (lo === 0 && hi === 0) lo = 1;']], kills: ['randu64', 'kmeans.labels'] },
  { name: 'kmeans: plain (non-unrolled) compactness sum', mut: [['for (; i <= n - 4; i += 4) s0 += v[i] + v[i + 1] + v[i + 2] + v[i + 3];', '']], kills: ['kmeans.compactness'], soft: true },
  { name: 'medianBlur: 1-D branch as plain copy', mut: [['out[q] = mx(mn(a0, a1), mn(mx(a0, a1), a2));', 'out[q] = a1;']], kills: ['medianBlur'] },
];

let bad = 0;
for (const v of VARIANTS) {
  const PF = loadVariant(v.mut);
  const f = run(PF, v.opts);
  const killed = Object.keys(f).filter(k => f[k] > 0);
  const expected = v.kills;
  const missingKills = expected.filter(k => !killed.includes(k));
  const collateral = killed.filter(k => !expected.includes(k) && !(k.startsWith('kmeans') && expected.some(e => e.startsWith('kmeans'))));
  let verdict;
  if (v.name.startsWith('baseline')) verdict = killed.length === 0 ? 'OK (all green)' : 'BROKEN BASELINE';
  else if (missingKills.length === 0 && collateral.length === 0) verdict = 'KILLED as expected';
  else if (missingKills.length && v.soft && collateral.length === 0) verdict = 'NOT DISCRIMINATED by these fixtures (claim rests on the source, not on a measurement)';
  else verdict = 'UNEXPECTED: missing kills ' + JSON.stringify(missingKills) + ' collateral ' + JSON.stringify(collateral);
  if (!(verdict.startsWith('OK') || verdict.startsWith('KILLED') || verdict.startsWith('NOT DISCRIMINATED'))) bad++;
  console.log(`${v.name}\n    fails: ${JSON.stringify(f)}\n    -> ${verdict}`);
}
console.log(bad ? `\n${bad} variant(s) behaved unexpectedly` : '\nall mutation controls behaved as expected');
process.exitCode = bad ? 1 : 0;
