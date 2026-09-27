/* Node parity test for src/pf-06-linalg.js and the full-mode additions to
 * src/pf-00-base.js, against fixtures/linalg-parity.json
 * (tools/parity-linalg.py).
 *
 * Every comparison is on raw bytes (Object.is per element: a 1-ulp drift or
 * a -0/+0 swap is a failure). The ONE place the port is not claimed
 * bit-exact - eigh for n > 5, which the reference never asks for - is
 * gated on an explicit bound and its measured distance is printed.
 *
 * Ends with negative controls: each switch the port depends on is flipped
 * to its rival (Reference-BLAS order, an unfused strided axpy, the gemv
 * form of dlalsd's 2x2 product, a different syrk block size) and the
 * affected comparisons must go RED - otherwise this test could not tell.
 *
 *   node tools/test-linalg.cjs [--src pf-06-linalg.js=<path>] [--only a,b]
 *
 * --src swaps one module's source for another file (the mutation harness
 * tools/mutants-linalg.cjs uses it; src/ is never touched).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
const args = process.argv.slice(2);
const override = {};
let only = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src') { const [f, p] = args[++i].split('='); override[f] = path.resolve(p); }
  else if (args[i] === '--only') only = new Set(args[++i].split(','));
}
const SRC = path.join(ROOT, 'src');
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort()) {
  (0, eval)(fs.readFileSync(override[f] || path.join(SRC, f), 'utf8'));
}
const PF = globalThis.PF;
const FIX = path.join(ROOT, 'fixtures', 'linalg-parity.json');
const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('fixtures: numpy %s / cv2 %s / python %s (%s) cpu %j', data.meta.numpy, data.meta.cv2, data.meta.python, data.meta.machine, data.meta.cpu);
console.log('port: %s / %s%s\n', PF.version, PF.versionLinalg, Object.keys(override).length ? '   OVERRIDES ' + JSON.stringify(override) : '');
const DEFAULTS = JSON.stringify(PF._linalg);

// ------------------------------------------------------------------ codec
function unhex(t) {
  const buf = Buffer.from(t.hex, 'hex');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  switch (t.dtype) {
    case 'float32': return new Float32Array(ab);
    case 'float64': return new Float64Array(ab);
    case 'int32': return new Int32Array(ab);
    case 'int64': return Float64Array.from(new BigInt64Array(ab), Number);
    case 'uint8': return new Uint8Array(ab);
    default: throw new Error('dtype ' + t.dtype);
  }
}
function hexF(hex, C) { const b = Buffer.from(hex, 'hex'); return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
const f64of = h => hexF(h, Float64Array);
const f32of = h => hexF(h, Float32Array);
const u64 = new BigInt64Array(1), d64 = new Float64Array(u64.buffer);
function ord64(x) { d64[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }
const i32 = new Int32Array(1), d32 = new Float32Array(i32.buffer);
function ord32(x) { d32[0] = x; const b = i32[0]; return b < 0 ? -2147483648 - b : b; }
function ulp(a, b, is32) {
  if (Object.is(a, b)) return 0n;
  if (is32) return BigInt(Math.abs(ord32(a) - ord32(b)));
  const u = ord64(a) - ord64(b); return u < 0n ? -u : u;
}
function cmp(got, want) {
  const is32 = want instanceof Float32Array;
  if (got.length !== want.length) return { ok: false, n: want.length, ndiff: -1, why: `length ${got.length} != ${want.length}` };
  let ndiff = 0, maxUlp = 0n, maxAbs = 0, first = -1;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    ndiff++; if (first < 0) first = i;
    const u = ulp(got[i], want[i], is32); if (u > maxUlp) maxUlp = u;
    const a = Math.abs(got[i] - want[i]); if (a > maxAbs) maxAbs = a;
  }
  return { ok: ndiff === 0, n: want.length, ndiff, maxUlp, maxAbs, first };
}
function sha(ta) { return crypto.createHash('sha256').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex'); }

// ------------------------------------------------------------------ tally
const sections = {};
const failures = [];
let quiet = false;
function sec(name) { return sections[name] || (sections[name] = { pass: 0, fail: 0, values: 0, notes: [] }); }
function check(section, label, r) {
  const s = sec(section);
  s.values += r.n || 0;
  if (r.ok) { s.pass++; return true; }
  s.fail++;
  const msg = r.why || `${r.ndiff}/${r.n} differ, first@${r.first}, maxUlp=${r.maxUlp}, maxAbs=${r.maxAbs.toExponential(3)}`;
  failures.push(`${section} :: ${label}: ${msg}`);
  if (!quiet && failures.length <= 40) console.log(`   FAIL ${section} :: ${label}: ${msg}`);
  return false;
}
function checkTrue(section, label, ok, why) { return check(section, label, { ok, n: 1, ndiff: ok ? 0 : 1, why }); }
function want(s) { return !only || only.has(s); }

// ================================================================ fma64
function fmaExact(a, b, c) {           // exact a*b + c, rounded once (BigInt)
  const dv = new DataView(new ArrayBuffer(8));
  function decomp(x) {
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4), e = (hi >>> 20) & 0x7ff;
    let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), ex;
    if (e === 0) ex = -1074; else { m |= 1n << 52n; ex = e - 1075; }
    return [hi >>> 31 ? -m : m, ex];
  }
  const [ma, ea] = decomp(a), [mb, eb] = decomp(b), [mc, ec] = decomp(c);
  const ep = ea + eb, E = Math.min(ep, ec);
  const N = ma * mb * (1n << BigInt(ep - E)) + mc * (1n << BigInt(ec - E));
  if (N === 0n) return a * b + c;      // exact zero: IEEE sign rule, same as the hardware
  return Number(N) * Math.pow(2, E);   // Number(BigInt) rounds to nearest-even; 2^E is exact
}
if (want('fma64')) {
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const R = () => (rnd() - 0.5) * Math.pow(2, Math.floor(rnd() * 60 - 30));
  let bad = 0; const N = 200000;
  for (let i = 0; i < N; i++) {
    const a = R(), b = R(), k = i % 4;
    const c = k === 0 ? R() : k === 1 ? -a * b : k === 2 ? -(a * b) * (1 + Math.pow(2, -52) * (rnd() < 0.5 ? 1 : -1)) : -(a * b) + R() * 1e-20;
    if (!Object.is(PF.fma64(a, b, c), fmaExact(a, b, c))) bad++;
  }
  checkTrue('fma64', `PF.fma64 == exact BigInt a*b+c on ${N} triples (1/4 random, 3/4 cancellation)`, bad === 0, `${bad} differ`);
  /* Round-to-odd witnesses. Random or near-random triples never need the
   * RO step (MEASURED: 0 of 2,000,000 random-cancellation triples and 0 of
   * 3,000,000 few-bit-mantissa triples), so a test built from them cannot
   * see it removed. It is needed only when c + RN(a*b) is an exact tie on
   * th's grid AND the product's error term is below ulp(th) * 2^-55: then
   * RN(tl + ul) swallows the term that should break the tie. Built on
   * purpose: a = 1 + 2^-26 + 2^-52, b = 1 - 2^-26 gives a*b = 1 - 2^-78
   * exactly, RN(a*b) = 1, error -2^-78; c = 2^53 + 2(2q+1) puts c + 1 on a
   * tie between neighbours 2 apart. Scaled and signed. */
  const SPL = 134217729;
  const noRO = (a, b, c) => {
    const p = a * b; let t = SPL * a; const ah = t - (t - a), al = a - ah; t = SPL * b;
    const bh = t - (t - b), bl = b - bh, pl = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    const th = c + p, bb = th - c, tl = (c - (th - bb)) + (p - bb); return th + (tl + pl);
  };
  let wit = 0, witBad = 0, roMatters = 0;
  for (let i = 0; i < 4000; i++) {
    const e1 = (i % 41) - 20, e2 = ((i * 7) % 31) - 15, sg = (i & 1) ? 1 : -1;
    const q = 1 + ((i * 2654435761) >>> 0) % 1000000;
    const A = sg * (1 + Math.pow(2, -26) + Math.pow(2, -52)) * Math.pow(2, e1);
    const B = (1 - Math.pow(2, -26)) * Math.pow(2, e2);
    const C = sg * (Math.pow(2, 53) + 2 * (2 * q + 1)) * Math.pow(2, e1 + e2);
    const ex = fmaExact(A, B, C);
    wit++;
    if (!Object.is(PF.fma64(A, B, C), ex)) witBad++;
    if (!Object.is(noRO(A, B, C), ex)) roMatters++;
  }
  sec('fma64').notes.push(`random/cancellation triples: ${N - bad}/${N} exact; tie witnesses: ${wit - witBad}/${wit} exact, of which the RN-only variant (no round-to-odd) gets ${wit - roMatters}/${wit} right`);
  checkTrue('fma64', `precondition: the ${wit} tie witnesses DO need round-to-odd (the RN-only variant misses ${roMatters})`, roMatters > 0, 'witness population cannot discriminate');
  checkTrue('fma64', `PF.fma64 == exact on the ${wit} round-to-odd tie witnesses`, witBad === 0, `${witBad} differ`);
}

// ================================================================ REAL recon
function rawRgba(name, w, h) {
  const p = path.join(ROOT, 'fixtures', 'raw', name + '.rgba');
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length !== w * h * 4) return null;
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

function reconSection() {
  if (!quiet) console.log('REAL reconsearch._prep chain (per image):');
  for (const c of data.recon) {
    const n = c.n, k = c.k, S = 'recon';
    const centers = unhex(c.centers);
    const labels = new Uint8Array(Buffer.from(c.labels_hex, 'hex'));
    const flat = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const b = labels[i] * 3; flat[i * 3] = centers[b]; flat[i * 3 + 1] = centers[b + 1]; flat[i * 3 + 2] = centers[b + 2]; }
    const mu = PF.meanAxes(flat, [n, 3], 0).d;                      // flat.mean(0): the SLOW axis
    check(S, `${c.name} mu = flat.mean(0)`, cmp(mu, unhex(c.mu)));
    const x = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) x[i * 3 + j] = Math.fround(flat[i * 3 + j] - mu[j]);
    const C = PF.syrkF32(x, n, 3);
    check(S, `${c.name} x.T @ x (ssyrk, n=${n})`, cmp(C, unhex(c.C)));
    const cov = new Float32Array(9);
    for (let i = 0; i < 9; i++) cov[i] = Math.fround(C[i] / n);
    check(S, `${c.name} cov`, cmp(cov, unhex(c.cov)));
    const covRef = unhex(c.cov);                                   // eigh on the REFERENCE's cov
    const e = PF.eigh(covRef, 3);
    check(S, `${c.name} eigh evals (float32)`, cmp(e.w, unhex(c.evals)));
    check(S, `${c.name} eigh evecs (float32)`, cmp(e.v, unhex(c.evecs)));
    const rec = c.recorded.find(r => r.fn === 'eigh');
    const e64 = PF.eigh(Float64Array.from(covRef), 3);
    check(S, `${c.name} eigh evals (float64 internals)`, cmp(e64.w, unhex(rec.w64)));
    check(S, `${c.name} eigh evecs (float64 internals)`, cmp(e64.v, unhex(rec.v64)));
    checkTrue(S, `${c.name} numpy's float32 eigh == its float64 eigh cast (python-side)`, rec.cast_equal === true);
    const order = PF.reversed(PF.argsort(e.w)).slice(0, 2);
    checkTrue(S, `${c.name} order = argsort(evals)[::-1][:2]`, order[0] === c.order[0] && order[1] === c.order[1], `got ${Array.from(order)} want ${c.order}`);
    const V = new Float32Array(6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) V[i * 2 + j] = e.v[i * 3 + order[j]];
    checkTrue(S, `${c.name} matmul result depends only on the row (python-side)`, c.comps_rows_same_by_label === true);
    const firstRows = Object.entries(c.comps_first);
    const xr = new Float32Array(firstRows.length * 3), want2 = new Float32Array(firstRows.length * 2);
    firstRows.forEach(([lab, hx], t) => {
      const row = labels.indexOf(Number(lab));
      for (let j = 0; j < 3; j++) xr[t * 3 + j] = x[row * 3 + j];
      want2.set(f32of(hx), t * 2);
    });
    check(S, `${c.name} x @ evecs[:, order] (one row per label)`, cmp(PF.matmulF32(xr, firstRows.length, 3, V, 2), want2));
    const sq = new Float32Array(k * 3);
    for (let i = 0; i < k * 3; i++) sq[i] = Math.fround(centers[i] * centers[i]);
    const c2 = PF.sumAxes(sq, [k, 3], 1).d;
    check(S, `${c.name} c2 = (centers**2).sum(1)`, cmp(c2, unhex(c.c2)));
    const cT = new Float32Array(3 * k);
    for (let i = 0; i < k; i++) for (let j = 0; j < 3; j++) cT[j * k + i] = centers[i * 3 + j];
    check(S, `${c.name} flat[-1:] @ centers.T (ONE-row block: sgemv)`, cmp(PF.matmulF32(flat.slice((n - 1) * 3), 1, 3, cT, k), unhex(c.tail1)));
    check(S, `${c.name} flat[-5:] @ centers.T (sgemm)`, cmp(PF.matmulF32(flat.slice((n - 5) * 3), 5, 3, cT, k), unhex(c.tail5)));
    const raw = rawRgba(c.name, c.w, c.h);
    if (!raw) { sec(S).notes.push(`${c.name}: fixtures/raw/${c.name}.rgba missing or wrong size - labels/alpha not re-derived`); }
    else {
      const rgb = new Float32Array(n * 3), alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = raw[i * 4 + 3], s = Math.fround(a / 255);
        alpha[i] = a;
        for (let j = 0; j < 3; j++) rgb[i * 3 + j] = Math.fround(raw[i * 4 + j] * s);
      }
      const m = PF.matmulF32(rgb, n, 3, cT, k);
      let bad = 0, firstBad = -1;
      for (let i = 0; i < n; i++) {
        let best = -Infinity, bi = 0;
        for (let j = 0; j < k; j++) {
          const v = Math.fround(Math.fround(2 * m[i * k + j]) - c2[j]);
          if (j === 0) { best = v; bi = 0; } else if (!(v <= best)) { best = v; bi = j; }
        }
        if (bi !== labels[i]) { bad++; if (firstBad < 0) firstBad = i; }
      }
      checkTrue(S, `${c.name} quantize labels from raw pixels (${n} px, rgb @ centers.T)`, bad === 0, `${bad}/${n} labels differ, first@${firstBad}`);
      check(S, `${c.name} alpha.mean() (float32)`, cmp(new Float32Array([PF.mean(alpha)]), f32of(c.alpha_mean)));
      check(S, `${c.name} alpha.std() (float32)`, cmp(new Float32Array([PF.std(alpha)]), f32of(c.alpha_std)));
      const H = c.ch_shape[0], W = c.ch_shape[1], CC = c.ch_shape[2];
      const comps = PF.matmulF32(x, n, 3, V, 2);
      const ch = new Float32Array(H * W * CC);
      const am = PF.mean(alpha);
      for (let i = 0; i < n; i++) {
        ch[i * CC] = comps[i * 2]; ch[i * CC + 1] = comps[i * 2 + 1];
        if (CC === 3) ch[i * CC + 2] = Math.fround(alpha[i] - am);
      }
      checkTrue(S, `${c.name} _prep channel stack sha256 (${H}x${W}x${CC})`, sha(ch) === c.ch_sha, 'sha differs');
    }
    for (const [ri, r] of c.recorded.entries()) {
      if (r.fn === 'cumsum') {
        check('cumsum-real', `${c.name}#${ri} axis=${r.axis} ${r.a.dtype}${JSON.stringify(r.a.shape)}`, cmp(PF.cumsum(unhex(r.a), r.a.shape, r.axis), unhex(r.out)));
      } else if (r.fn === 'reduceat') {
        check('reduceat-real', `${c.name}#${ri} axis=${r.axis} ${r.a.dtype}${JSON.stringify(r.a.shape)} idx=${r.indices.length}`,
          cmp(PF.add_reduceat(unhex(r.a), r.a.shape, r.indices, r.axis).d, unhex(r.out)));
      } else if (r.fn === 'average') {
        check('average-real', `${c.name}#${ri}`, cmp(new Float64Array([PF.average(unhex(r.a), unhex(r.w))]), f64of(r.out)));
      }
    }
    if (!quiet) console.log(`   ${c.name.padEnd(11)} n=${String(n).padEnd(8)} evals=${Array.from(e.w).map(v => v.toFixed(3)).join(',')} recorded=${c.recorded.length}`);
  }
}
if (want('recon')) reconSection();

// ================================================================ eigh synth
function eighSection(tagOut) {
  let flips = 0, cols = 0;
  const S = 'eigh';
  for (const [i, c] of data.eigh_synth.entries()) {
    const a = unhex(c.a), n = c.a.shape[0];
    let r32, r64;
    try { r32 = PF.eigh(a, n); r64 = PF.eigh(Float64Array.from(a), n); }
    catch (err) { checkTrue(S, `${c.label}#${i}`, false, String(err)); continue; }
    const V = unhex(c.v);
    for (let j = 0; j < n; j++) {
      let dot = 0; for (let q = 0; q < n; q++) dot += r32.v[q * n + j] * V[q * n + j];
      cols++; if (dot < 0) flips++;
    }
    if (n <= 5) {
      // claimed bit-exact: the numpy-dtype result and the float64 internals
      check(S, `${c.label}#${i} n=${n} w (${c.a.dtype})`, cmp(r32.w, unhex(c.w)));
      check(S, `${c.label}#${i} n=${n} v (${c.a.dtype})`, cmp(r32.v, V));
      check(S, `${c.label}#${i} n=${n} w float64 internals`, cmp(r64.w, unhex(c.w64)));
      check(S, `${c.label}#${i} n=${n} v float64 internals`, cmp(r64.v, unhex(c.v64)));
    } else {
      // n > 5: Reference-BLAS order, NOT claimed exact - gated on a bound
      const rw = cmp(r64.w, unhex(c.w64)), rv = cmp(r64.v, unhex(c.v64));
      const wmax = Math.max(1, ...Array.from(unhex(c.w64), Math.abs));
      check('eigh-n>5', `${c.label}#${i} n=${n} within 1e-12*max|w| / 1e-9`, { ok: rw.maxAbs <= 1e-12 * wmax && rv.maxAbs <= 1e-9, n: rw.n + rv.n, ndiff: rw.ndiff + rv.ndiff, maxUlp: rw.maxUlp > rv.maxUlp ? rw.maxUlp : rv.maxUlp, maxAbs: Math.max(rw.maxAbs, rv.maxAbs), first: 0 });
      sec('eigh-n>5').notes.push(`${c.label}#${i}: ${rw.ndiff + rv.ndiff}/${rw.n + rv.n} float64 values differ, max ${rw.maxUlp > rv.maxUlp ? rw.maxUlp : rv.maxUlp} ulp, max |diff| ${Math.max(rw.maxAbs, rv.maxAbs).toExponential(2)}`);
    }
  }
  if (!tagOut) sec(S).notes.push(`eigenvector sign agreement: ${cols - flips}/${cols} columns`);
}
if (want('eigh')) eighSection();

// ================================================================ lstsq
function lstsqSection(section, list) {
  let minRatio = Infinity, rcondMax = 0;
  for (const [i, c] of list.entries()) {
    const A = unhex(c.a), [m, n] = c.a.shape, b = unhex(c.b), X = unhex(c.x), s = unhex(c.s);
    let r;
    try { r = PF.lstsq(A, m, n, b); } catch (err) { checkTrue(section, `#${i} ${c.label || ''}`, false, String(err)); continue; }
    check(section, `#${i} ${c.label || ''} m=${m} x`, cmp(r.x, X));
    check(section, `#${i} ${c.label || ''} m=${m} s`, cmp(r.s, s));
    checkTrue(section, `#${i} ${c.label || ''} m=${m} rank`, r.rank === c.rank, `rank ${r.rank} want ${c.rank}`);
    if (n === 2 && s[0] > 0) { minRatio = Math.min(minRatio, s[1] / s[0]); rcondMax = Math.max(rcondMax, 2.220446049250313e-16 * Math.max(m, n)); }
  }
  if (minRatio < Infinity) sec(section).notes.push(`smallest s[1]/s[0] over the population: ${minRatio.toExponential(3)} vs rcond <= ${rcondMax.toExponential(3)} (rank deficiency needs ratio <= rcond)`);
}
function latticeLoop(peaks, h, s0) {
  /* channels._lattice_refine_peaks lines 178-196, with PF.lstsq */
  const n = peaks.length;
  if (n < 4) return s0;
  let s = s0;
  let phi = peaks[PF.argmax(h)] % s;
  if (phi !== 0 && (phi < 0) !== (s < 0)) phi += s;         // Python float % takes the divisor's sign
  for (let it = 0; it < 4; it++) {
    const k = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      k[i] = PF.rint((peaks[i] - phi) / s);
      const resid = peaks[i] - (phi + k[i] * s);
      w[i] = h[i] * (Math.abs(resid) < 0.35 * s ? 1 : 0);
    }
    const kk = []; for (let i = 0; i < n; i++) if (w[i] > 0) kk.push(k[i]);
    if (PF.sum(w) <= 0 || PF.unique(Float64Array.from(kk)).values.length < 3) return s0;
    const A = new Float64Array(n * 2), b = new Float64Array(n);
    for (let i = 0; i < n; i++) { A[i * 2] = 1 * w[i]; A[i * 2 + 1] = k[i] * w[i]; b[i] = peaks[i] * w[i]; }
    const r = PF.lstsq(A, n, 2, b);
    phi = r.x[0]; s = r.x[1];
    if (!isFinite(s) || s < 1.2 || Math.abs(s - s0) > 0.6 * s0) return s0;
  }
  return s;
}
function latticeSection() {
  let same = 0, N = 0;
  for (const L of data.lattice_loops) {
    const got = latticeLoop(f64of(L.peaks), f64of(L.h), f64of(L.s0)[0]), wantv = f64of(L.out)[0];
    N++;
    if (Object.is(got, wantv)) same++;
    else if (!quiet && same + 3 > N) console.log(`      lattice miss ${L.image}/${L.profile} s0=${f64of(L.s0)[0]}: got ${got} want ${wantv}`);
  }
  checkTrue('lattice-loop', `${N} replays of _lattice_refine[_peaks] from recorded peaks: final step bit-exact`, same === N, `${N - same}/${N} differ`);
}
if (want('lstsq')) {
  lstsqSection('lstsq-real', data.lstsq_real.map(c => Object.assign({ label: 'real' }, c)));
  lstsqSection('lstsq-synth', data.lstsq_synth);
  latticeSection();
}

// ================================================================ matmul / sgemv / syrk
function matmulSection() {
  for (const c of data.matmul) {
    const A = unhex(c.a), BT = unhex(c.bT);            // product is A @ BT.T
    const B = new Float32Array(c.k * c.p);
    for (let i = 0; i < c.p; i++) for (let j = 0; j < c.k; j++) B[j * c.p + i] = BT[i * c.k + j];
    if (c.n === 1 && c.p === 1) {
      let threw = false; try { PF.matmulF32(A, 1, 3, B, 1); } catch (e) { threw = true; }
      checkTrue('matmul', '(1,3)@(3,1) is np.dot (sdot): must throw, not guess', threw, 'did not throw');
      continue;
    }
    check('matmul', `(${c.n},3)@(3,${c.p})`, cmp(PF.matmulF32(A, c.n, c.k, B, c.p), unhex(c.out)));
  }
  for (const c of data.gemv) {
    if (c.kind === 'vec@mat') {
      const rows = unhex(c.rows), BT = unhex(c.bT), p = c.p, out = unhex(c.out);
      const B = new Float32Array(3 * p);
      for (let i = 0; i < p; i++) for (let j = 0; j < 3; j++) B[j * p + i] = BT[i * 3 + j];
      const got = new Float32Array(out.length);
      for (let r = 0; r < rows.length / 3; r++) got.set(PF.matmulF32(rows.slice(r * 3, r * 3 + 3), 1, 3, B, p), r * p);
      check('sgemv', `120 x (1,3)@(3,${p})`, cmp(got, out));
    } else {
      check('sgemv', `(${c.n},3)@(3,1)`, cmp(PF.matmulF32(unhex(c.a), c.n, 3, unhex(c.v), 1), unhex(c.out)));
    }
  }
  for (const c of data.syrk) check('syrk', `x.T@x n=${c.n}`, cmp(PF.syrkF32(unhex(c.x), c.n, 3), unhex(c.out)));
}
if (want('matmul')) matmulSection();

// ================================================================ reductions
if (want('reductions')) {
  const red = data.reductions;
  const bases = {};
  for (const [kk, t] of Object.entries(red.sum_bases)) bases[kk] = { t, a: unhex(t) };
  for (const c of red.sum) {
    const B = bases[c.base];
    check('sumAxes', `${B.t.dtype}${JSON.stringify(B.t.shape)} perm=${c.perm} axes=${c.axes}`,
      cmp(PF.sumAxes(B.a, B.t.shape, c.axes, c.perm).d, unhex(c.out)));
  }
  for (const c of red.cumsum) check('cumsum', `${c.a.dtype}${JSON.stringify(c.a.shape)} axis=${c.axis}`, cmp(PF.cumsum(unhex(c.a), c.a.shape, c.axis), unhex(c.out)));
  for (const c of red.maxacc) check('maximum.accumulate', `${c.a.dtype}${JSON.stringify(c.a.shape)} axis=${c.axis}`, cmp(PF.maximum_accumulate(unhex(c.a), c.a.shape, c.axis), unhex(c.out)));
  for (const c of red.reduceat) check('reduceat', `${c.a.dtype}${JSON.stringify(c.a.shape)} axis=${c.axis} idx=${c.indices}`, cmp(PF.add_reduceat(unhex(c.a), c.a.shape, c.indices, c.axis).d, unhex(c.out)));
  for (const c of red.meanstd) {
    if (c.axis0) {
      const x = unhex(c.axis0);
      check('mean/std', `${c.axis0.dtype}${JSON.stringify(c.axis0.shape)}.mean(0)`, cmp(PF.meanAxes(x, c.axis0.shape, 0).d, unhex(c.mean)));
      continue;
    }
    const a = unhex(c.a), C = a instanceof Float32Array ? Float32Array : Float64Array;
    check('mean/std', `${c.a.dtype}${JSON.stringify(c.a.shape)}.mean()`, cmp(new C([PF.mean(a)]), hexF(c.mean, C)));
    check('mean/std', `${c.a.dtype}${JSON.stringify(c.a.shape)}.std()`, cmp(new C([PF.std(a)]), hexF(c.std, C)));
  }
  for (const c of red.average) check('average', `n=${c.x.shape[0]}`, cmp(new Float64Array([PF.average(unhex(c.x), unhex(c.w))]), f64of(c.out)));
}

// ================================================================ pyRound
if (want('pyround')) {
  const x = f64of(data.pyround.x);
  for (const nd of [0, 2, 4]) {
    const wantR = f64of(data.pyround['r' + nd]);
    const got = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) got[i] = PF.pyRound(x[i], nd);
    check('pyRound', `round(x, ${nd}) on ${x.length} values`, cmp(got, wantR));
    let rival = 0; for (let i = 0; i < x.length; i++) if (!Object.is(parseFloat(x[i].toFixed(nd)), wantR[i])) rival++;
    sec('pyRound').notes.push(`round(x, ${nd}): Number.toFixed alone would miss ${rival}/${x.length}`);
  }
}

// ================================================================ Generator.choice
if (want('choice')) {
  for (const c of data.choice) {
    const idx = PF.default_rng(0).choice(c.n, c.size, { replace: false });
    const b = Buffer.alloc(idx.length * 8);
    for (let i = 0; i < idx.length; i++) b.writeBigInt64LE(BigInt(idx[i]), i * 8);
    const h = crypto.createHash('sha256').update(b).digest('hex');
    checkTrue('Generator.choice', `default_rng(0).choice(${c.n}, ${c.size}, replace=False)`, h === c.sha, `sha differs; head ${Array.from(idx.slice(0, 5))} want ${c.head.slice(0, 5)}`);
  }
}

// ================================================================ complex / transcendental
const TFIX = path.join(ROOT, 'fixtures', 'linalg-trans-parity.json');
if (want('trans') && fs.existsSync(TFIX)) {
  const T = JSON.parse(fs.readFileSync(TFIX, 'utf8'));
  const S = 'trans', F = f64of;
  let n = 0, cosEq = 0, sinEq = 0, cosU = 0n, sinU = 0n, angEq = 0, angU = 0n, nres = 0;
  const thOK = { n: 0, bad: 0 }, sumOK = { bad: 0 }, absOK = { bad: 0 }, hsOK = { bad: 0 };
  for (const r of T.ray) {
    const p = F(r.p), h = F(r.h), step = r.step, pre = F(r.phre), pim = F(r.phim);
    // theta: (0 + 2pi i) * (p + 0i) then / (step + 0i)
    const nre = new Float64Array(p.length), nim = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) { nre[i] = 0 * p[i] - (2 * Math.PI) * 0; nim[i] = 0 * 0 + (2 * Math.PI) * p[i]; }
    const z = PF.complexDivReal(nre, nim, step);
    const zr = cmp(z.re, F(r.zre)), zi = cmp(z.im, F(r.zim));
    thOK.n += p.length; thOK.bad += zr.ndiff + zi.ndiff;
    for (let i = 0; i < p.length; i++) {
      n++;
      const c = Math.cos(z.im[i]), s = Math.sin(z.im[i]);
      if (Object.is(c, pre[i])) cosEq++; else { const u = ulp(c, pre[i], false); if (u > cosU) cosU = u; }
      if (Object.is(s, pim[i])) sinEq++; else { const u = ulp(s, pim[i], false); if (u > sinU) sinU = u; }
    }
    // resultant from numpy's own cos/sin values: (h + 0i) * ph, summed
    const pr = new Float64Array(p.length), pi = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) { pr[i] = h[i] * pre[i] - 0 * pim[i]; pi[i] = h[i] * pim[i] + 0 * pre[i]; }
    const res = PF.complexSum(pr, pi);
    nres++;
    if (!Object.is(res.re, F(r.resre)[0]) || !Object.is(res.im, F(r.resim)[0])) sumOK.bad++;
    const rr = F(r.resre)[0], ri = F(r.resim)[0];
    if (!Object.is(PF.cabs(rr, ri), F(r.abs)[0])) absOK.bad++;
    const a = Math.atan2(ri, rr), aw = F(r.angle)[0];
    if (Object.is(a, aw)) angEq++; else { const u = ulp(a, aw, false); if (u > angU) angU = u; }
    if (!Object.is(PF.sum(h), F(r.hsum)[0])) hsOK.bad++;
  }
  checkTrue(S, `theta = imag(2j*pi*p/step) via complexDivReal (reciprocal multiply): ${thOK.n} angles`, thOK.bad === 0, `${thOK.bad} differ`);
  checkTrue(S, `(h * ph).sum() by PF.complexSum on ${nres} real peak lists (numpy's own cos/sin in)`, sumOK.bad === 0, `${sumOK.bad} differ`);
  checkTrue(S, `np.abs(resultant) by PF.cabs on ${nres} real resultants`, absOK.bad === 0, `${absOK.bad} differ`);
  checkTrue(S, `h.sum() by PF.sum on ${nres} real height lists`, hsOK.bad === 0, `${hsOK.bad} differ`);
  sec(S).notes.push(`NOT EXACT (numpy calls the UCRT): Math.cos == numpy ${cosEq}/${n} (max ${cosU} ulp), Math.sin ${sinEq}/${n} (max ${sinU} ulp), Math.atan2 == np.angle ${angEq}/${nres} (max ${angU} ulp) on the real Rayleigh angles/resultants`);
  checkTrue(S, 'UCRT-vs-V8 gaps stay within 1 ulp (cos, sin) and 4 ulp (atan2) - the stated bound', cosU <= 1n && sinU <= 1n && angU <= 4n, `cos ${cosU} sin ${sinU} atan2 ${angU} ulp`);
  // scalar population
  const sc = T.scalar, xy = F(sc.xy), ab = F(sc.abs), rt = F(sc.ratio), lg = F(sc.log10);
  let cb = 0; for (let i = 0; i < ab.length; i++) if (!Object.is(PF.cabs(xy[2 * i], xy[2 * i + 1]), ab[i])) cb++;
  checkTrue(S, `PF.cabs == np.abs(complex) on ${ab.length} random complex values`, cb === 0, `${cb} differ`);
  let lq = 0, lU = 0n; for (let i = 0; i < rt.length; i++) { const v = Math.log10(rt[i]); if (Object.is(v, lg[i])) lq++; else { const u = ulp(v, lg[i], false); if (u > lU) lU = u; } }
  let hq = 0, ht = 0, hU = 0n, hA = 0;
  for (const w of T.hanning) { const W = F(w.w), g = PF.hanning(w.M); for (let i = 0; i < w.M; i++) { ht++; if (Object.is(g[i], W[i])) hq++; else { const u = ulp(g[i], W[i], false); if (u > hU) hU = u; hA = Math.max(hA, Math.abs(g[i] - W[i])); } } }
  // hanning is 0.5 + 0.5*cos: near the window ends it cancels to ~0, so one
  // ulp of cos is many ulps of the (tiny) result - bound it absolutely
  sec(S).notes.push(`NOT EXACT (UCRT): Math.log10 == np.log10 ${lq}/${rt.length} (max ${lU} ulp); PF.hanning == np.hanning ${hq}/${ht} (max |diff| ${hA.toExponential(2)} = ${hU} ulp of a near-zero end value) on window sizes ${T.hanning.map(w => w.M).join(',')}`);
  checkTrue(S, 'log10 within 1 ulp, hanning within 2^-52 absolute - the stated bounds', lU <= 1n && hA <= Math.pow(2, -52), `log10 ${lU} ulp, hanning |diff| ${hA}`);
}

// ================================================================ negative controls
const controlRows = [];
if (want('controls')) {
  function control(name, setup, run, sectionsToCount) {
    const saveFail = failures.length, saved = JSON.stringify(PF._linalg);
    const before = {};
    for (const s of sectionsToCount) before[s] = sec(s).fail;
    quiet = true;
    try { setup(); run(); } finally { Object.assign(PF._linalg, JSON.parse(saved)); quiet = false; }
    let red = 0;
    for (const s of sectionsToCount) { red += sec(s).fail - before[s]; sec(s).fail = before[s]; }
    failures.length = saveFail;
    const ok = red > 0;
    controlRows.push(`   ${ok ? 'ok  ' : 'FAIL'} ${name}: ${red} comparison(s) went red`);
    if (!ok) { sec('controls').fail++; failures.push(`negative control "${name}" did NOT go red`); } else sec('controls').pass++;
  }
  // count only the fresh passes/fails of a re-run: reset pass counters too
  function rerun(fn) { return () => { const snap = JSON.stringify(sections); fn(); const after = JSON.parse(JSON.stringify(sections)); for (const [k, v] of Object.entries(JSON.parse(snap))) { sections[k].pass = v.pass; sections[k].values = v.values; sections[k].notes = v.notes; } for (const k of Object.keys(after)) if (!(k in JSON.parse(snap))) { sections[k].pass = 0; sections[k].values = 0; sections[k].notes = []; } }; }
  control('eigh with Reference-BLAS order instead of OpenBLAS\'s FMA kernels',
    () => { PF._linalg.blas = 'reference'; }, rerun(() => { reconSection(); eighSection(true); }), ['recon', 'eigh']);
  control('lstsq with Reference-BLAS order instead of OpenBLAS\'s FMA kernels',
    () => { PF._linalg.blas = 'reference'; }, rerun(() => lstsqSection('lstsq-real', data.lstsq_real)), ['lstsq-real']);
  control('strided daxpy NOT fused (clang-style contraction)',
    () => { PF._linalg.axpyStridedFused = false; }, rerun(() => eighSection(true)), ['eigh']);
  control('dlalsd 2x2 product as dgemv tail instead of GEMM FMA chain',
    () => { PF._linalg.dgemmForm = 'gemv'; }, rerun(() => lstsqSection('lstsq-real', data.lstsq_real)), ['lstsq-real']);
  control('ssyrk K-block 448 instead of 512',
    () => { PF._linalg.syrkQ = 448; }, rerun(() => matmulSection()), ['syrk']);
  checkTrue('controls', 'PF._linalg restored to its defaults', JSON.stringify(PF._linalg) === DEFAULTS, JSON.stringify(PF._linalg));
}

// ================================================================ summary
console.log('\nsections:');
let pass = 0, fail = 0;
for (const [k, s] of Object.entries(sections)) {
  pass += s.pass; fail += s.fail;
  if (s.pass + s.fail) console.log(`   ${k.padEnd(20)} ${String(s.pass).padStart(6)} pass ${String(s.fail).padStart(4)} fail   values ${s.values}`);
  for (const n of s.notes.slice(0, 6)) console.log(`      ${n}`);
  if (s.notes.length > 6) console.log(`      ... ${s.notes.length - 6} more notes`);
}
if (controlRows.length) { console.log('\nnegative controls (each must go RED):'); for (const r of controlRows) console.log(r); }
console.log(`\ncomparisons: ${pass + fail}   pass: ${pass}   fail: ${fail}`);
if (failures.length) { console.log(`\nFAILURES (${failures.length}):`); for (const f of failures.slice(0, 60)) console.log('   ' + f); }
process.exitCode = fail ? 1 : 0;
