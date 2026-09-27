/* Parity test for src/pf-30-channels-a.js (channels.py lines 1-825) against
 * fixtures/channels-a-<name>-parity.json (tools/parity-channels-a.py).
 *
 *   node tools/test-channels-a.cjs            every image + synth, one process each
 *   node tools/test-channels-a.cjs <name>     one image ("synth" for the synthetic set)
 *
 * ONE IMAGE PER PROCESS. This module never calls k-means, but part F below
 * re-derives the reference's quantized image with PF.kmeans_quantize, which
 * runs on the process-global RNG: only the first call in a fresh process
 * has drawn the same random numbers as the reference's first call.
 *
 * Every value that involves a transcendental is compared TWICE:
 *   [math]   the production path, C._libm = Math.*. numpy calls the C
 *            runtime (UCRT) cos/sin/atan2/log10/pow, which are not correctly
 *            rounded and cannot be reproduced; the diff is MEASURED and
 *            printed (count, max |diff|, max ulp) and must stay inside a
 *            relative bound, and every DECISION (a chosen step, a candidate
 *            list, a fused-curve argmax) is compared exactly.
 *   [numpy]  C._libm = a table of numpy's own outputs for exactly the
 *            arguments this code asks for (answered by the reference venv:
 *            parity-channels-a.py --libm, run automatically until no
 *            argument is missing). Here every value must be BIT-EXACT - so
 *            whatever differs in [math] is the C runtime's last bit, not the
 *            port's logic. A table miss is a failure, never a fallback.
 * Values without a transcendental are compared bit-exact, once.
 *
 * Ends with negative controls: each measured semantic in C._semantics is
 * flipped to its "obvious" reading and the comparisons that depend on it
 * must go RED.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const FIX = path.join(ROOT, 'fixtures');
const PY = process.env.PAF_PY || path.join(ROOT, '..', '..', 'pafenv2', 'Scripts', 'python.exe');
const PARITY_PY = path.join(__dirname, 'parity-channels-a.py');
const IMAGES = ['tiny', 'small', 'mid', 'dragon', 'frog', 'koi-pond', 'lighthouse'];
const MATH_REL_BOUND = 1e-9;      // [math] values: relative diff bound (a flipped decision exceeds it)

const only = process.argv[2];
if (!only) {
  let bad = 0;
  const summary = [], redIn = {};
  for (const name of IMAGES.concat(['synth'])) {
    const r = spawnSync(process.execPath, [__filename, name], { encoding: 'utf8', maxBuffer: 1 << 28 });
    process.stdout.write(r.stdout);
    if (r.stderr) process.stdout.write(r.stderr);
    const last = r.stdout.trim().split('\n').filter(l => l.startsWith('RESULT')).pop() || ('RESULT ' + name + ' CRASHED');
    summary.push(last);
    if (r.status !== 0) bad++;
    for (const m of r.stdout.matchAll(/^ {3}(red |GREEN) (\w+)/gm)) {
      if (!(m[2] in redIn)) redIn[m[2]] = [];
      if (m[1] === 'red ') redIn[m[2]].push(name);
    }
  }
  console.log('\n==== summary ====');
  // a negative control proves something only where its semantic is exercised;
  // each must go red in at least one process, or the tests cannot see it
  for (const [f, where] of Object.entries(redIn)) {
    console.log(`negative control ${f.padEnd(20)} red in ${where.length}/${IMAGES.length + 1}: ${where.join(' ') || '-'}`);
    if (!where.length) { bad++; console.log(`   FAIL: ${f} never went red - no test can see that semantic`); }
  }
  for (const s of summary) console.log(s);
  console.log(bad ? `${bad} process(es) FAILED` : 'every process passed');
  process.exit(bad ? 1 : 0);
}

for (const f of ['pf-00-base.js', 'pf-01-fft.js', 'pf-02-scipy.js', 'pf-03-cv2.js', 'pf-04-nprandom.js',
  'pf-05-mathshim.js', 'pf-06-linalg.js', 'pf-11-quantize.js', 'pf-30-channels-a.js']) {
  (0, eval)(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));   // as a browser <script> would
}
const PF = globalThis.PF;
const C = PF.channels;
const SEM = C._semantics;

// ------------------------------------------------------------------ decoding
function unhex(hex) {
  const b = Buffer.from(hex, 'hex'), out = new Float64Array(b.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = b.readDoubleLE(i * 8);
  return out;
}
function s64(hex) { return hex === null || hex === undefined ? null : unhex(hex)[0]; }
const HB = Buffer.alloc(8);
function hexOf(x) { HB.writeDoubleLE(x, 0); return HB.toString('hex'); }
function unz(b64) { return new Uint8Array(zlib.inflateSync(Buffer.from(b64, 'base64'))); }
function sha32(f32) { return crypto.createHash('sha256').update(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)).digest('hex'); }
function tilesIn(t) { return t.map(([p, h, e]) => [unhex(p), unhex(h), e]); }
function listIn(l) { return l.map(s64); }
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
function ulp(a, b) {
  f64v[0] = a; let x = u64[0]; if (x < 0n) x = -0x8000000000000000n - x;
  f64v[0] = b; let y = u64[0]; if (y < 0n) y = -0x8000000000000000n - y;
  const d = x - y; return d < 0n ? -d : d;
}

// ------------------------------------------------------------------ reporter
class Rep {
  constructor(mode, quiet) { this.mode = mode; this.quiet = quiet; this.pass = 0; this.fail = 0; this.fails = []; this.groups = new Map(); this.values = 0; }
  _fail(label, msg) {
    this.fail++;
    this.fails.push(label + ': ' + msg);
    if (!this.quiet) console.log('   FAIL ' + label + ': ' + msg);
  }
  // bit-exact, always
  exact(label, got, want) {
    if (got === null || want === null || typeof got !== 'object') {
      const ok = (got === null || want === null) ? got === want : Object.is(got, want);
      this.values++;
      if (ok) { this.pass++; return true; }
      this._fail(label, `got ${got} want ${want}` + (typeof got === 'number' && typeof want === 'number' ? ` (${ulp(got, want)} ulp)` : ''));
      return false;
    }
    if (got.length !== want.length) { this._fail(label, `length ${got.length} != ${want.length}`); return false; }
    let nd = 0, first = -1, maxAbs = 0, maxU = 0n;
    for (let i = 0; i < want.length; i++) {
      if (Object.is(got[i], want[i])) continue;
      nd++; if (first < 0) first = i;
      const d = Math.abs(got[i] - want[i]); if (d > maxAbs) maxAbs = d;
      if (typeof got[i] === 'number' && typeof want[i] === 'number') { const u = ulp(got[i], want[i]); if (u > maxU) maxU = u; }
    }
    this.values += want.length;
    if (!nd) { this.pass++; return true; }
    this._fail(label, `${nd}/${want.length} differ, first@${first} (got ${got[first]} want ${want[first]}), maxAbs=${maxAbs.toExponential(3)}, maxUlp=${maxU}`);
    return false;
  }
  // transcendental-dependent: exact in [numpy] mode, measured in [math] mode
  lib(label, group, got, want) {
    if (this.mode === 'numpy') return this.exact(label, got, want);
    const g = this.groups.get(group) || { n: 0, nd: 0, maxAbs: 0, maxRel: 0, maxU: 0n, worst: '', lenMiss: 0 };
    this.groups.set(group, g);
    const G = (got !== null && typeof got === 'object') ? got : [got], W = (want !== null && typeof want === 'object') ? want : [want];
    if (G.length !== W.length) { g.lenMiss++; g.n++; g.nd++; g.worst = `${label}: length ${G.length} != ${W.length}`; this.fail++; this.fails.push(`[math] ${label}: list length ${G.length} != ${W.length}`); if (!this.quiet) console.log(`   FAIL [math] ${label}: list length ${G.length} != ${W.length}`); return false; }
    let ok = true;
    for (let i = 0; i < W.length; i++) {
      g.n++;
      const a = G[i], b = W[i];
      if (Object.is(a, b)) continue;
      if (a === null || b === null || typeof a !== 'number' || typeof b !== 'number') {
        g.nd++; ok = false; g.worst = `${label}[${i}] got ${a} want ${b}`;
        this.fail++; this.fails.push(`[math] ${label}[${i}] got ${a} want ${b}`); if (!this.quiet) console.log(`   FAIL [math] ${label}[${i}] got ${a} want ${b}`);
        continue;
      }
      g.nd++;
      const d = Math.abs(a - b), rel = d / Math.max(Math.abs(b), 1e-300), u = ulp(a, b);
      if (d > g.maxAbs) g.maxAbs = d;
      if (u > g.maxU) g.maxU = u;
      if (rel > g.maxRel) { g.maxRel = rel; g.worst = `${label}[${i}] got ${a} want ${b}`; }
      if (rel > MATH_REL_BOUND && d > 1e-12) {
        ok = false; this.fail++; this.fails.push(`[math] ${label}[${i}] rel ${rel.toExponential(2)} > bound: got ${a} want ${b}`);
        if (!this.quiet) console.log(`   FAIL [math] ${label}[${i}] rel ${rel.toExponential(2)}: got ${a} want ${b}`);
      }
    }
    if (ok) this.pass++;
    return ok;
  }
  printGroups() {
    for (const [k, g] of this.groups) {
      console.log(`   ${k.padEnd(34)} ${String(g.nd).padStart(6)}/${String(g.n).padEnd(6)} differ  maxAbs=${g.maxAbs.toExponential(2)}  maxRel=${g.maxRel.toExponential(2)}  maxUlp=${g.maxU}` + (g.lenMiss ? `  LIST-LENGTH MISSES ${g.lenMiss}` : ''));
    }
  }
}

// ------------------------------------------------------------------ libm table
function emptyTable() { return { phasors: {}, atan2: {}, log10: {}, pow2: {} }; }
function makeTableLibm(table, missing) {
  const ph = new Map();
  for (const [sh, e] of Object.entries(table.phasors)) ph.set(s64(sh), { maxP: e.maxP, theta: unhex(e.theta), re: unhex(e.re), im: unhex(e.im) });
  const at = new Map(Object.entries(table.atan2).map(([k, v]) => [k, s64(v)]));
  const lg = new Map(Object.entries(table.log10).map(([k, v]) => [k, s64(v)]));
  const pw = new Map(Object.entries(table.pow2).map(([k, v]) => [k, s64(v)]));
  const st = { misses: 0, thetaMismatch: 0, lookups: 0 };
  const M = C._LIBM_MATH;
  return {
    name: 'numpy-table', stats: st,
    phasors(p, step) {
      const e = ph.get(step), n = p.length;
      let maxP = 0, ints = true;
      for (let i = 0; i < n; i++) { if (p[i] > maxP) maxP = p[i]; if (p[i] !== Math.floor(p[i]) || p[i] < 0) ints = false; }
      if (!ints) throw new Error('phasors: non-integer position - the table cannot answer it');
      if (!e || e.maxP < maxP) {
        st.misses++;
        if (missing) { const k = hexOf(step); missing.phasors[k] = Math.max(missing.phasors[k] || 0, maxP, e ? e.maxP : 0); }
        return M.phasors(p, step);
      }
      const c = new Float64Array(n), s = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const k = p[i];
        c[i] = e.re[k]; s[i] = e.im[k];
        st.lookups++;
        if (!Object.is(C._theta(k, step), e.theta[k])) st.thetaMismatch++;
      }
      return { c, s };
    },
    atan2(y, x) { const k = hexOf(y) + hexOf(x), v = at.get(k); if (v === undefined) { st.misses++; if (missing) missing.atan2.add(k); return M.atan2(y, x); } return v; },
    log10(x) { const k = hexOf(x), v = lg.get(k); if (v === undefined) { st.misses++; if (missing) missing.log10.add(k); return M.log10(x); } return v; },
    pow2(x) { const k = hexOf(x), v = pw.get(k); if (v === undefined) { st.misses++; if (missing) missing.pow2.add(k); return M.pow2(x); } return v; }
  };
}
function withLibm(libm, fn) { const prev = C._libm; C._libm = libm; try { return fn(); } finally { C._libm = prev; } }
function quiet(fn) { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } }

/* Run `suite` with numpy's outputs, asking the reference for every argument
 * it has not answered yet, until nothing is missing. Returns the table. */
function closeLibm(name, suite) {
  const TBL = path.join(FIX, `channels-a-${name}-libm-parity.json`);
  const QRY = path.join(FIX, `channels-a-${name}-libmq-parity.json`);
  for (let round = 0; round < 10; round++) {
    const table = fs.existsSync(TBL) ? JSON.parse(fs.readFileSync(TBL, 'utf8')) : emptyTable();
    const missing = { phasors: {}, atan2: new Set(), log10: new Set(), pow2: new Set() };
    const lib = makeTableLibm(table, missing);
    quiet(() => withLibm(lib, () => suite(new Rep('numpy', true))));
    const nq = Object.keys(missing.phasors).length + missing.atan2.size + missing.log10.size + missing.pow2.size;
    if (!nq) { if (fs.existsSync(QRY)) fs.unlinkSync(QRY); return table; }
    console.log(`   libm round ${round + 1}: asking the reference for ${nq} argument group(s)`);
    fs.writeFileSync(QRY, JSON.stringify({ phasors: missing.phasors, atan2: [...missing.atan2], log10: [...missing.log10], pow2: [...missing.pow2] }));
    const r = spawnSync(PY, [PARITY_PY, '--libm', QRY, TBL], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('libm oracle failed: ' + r.stderr + r.stdout);
  }
  throw new Error('libm table did not close in 10 rounds');
}

function arrEq(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

// ================================================================== images
function imageSuites(d) {
  const w = d.w, h = d.h;
  const rgba = { d: unz(d.rgba_z), w, h, cn: 4 };
  const q = { d: unz(d.q_lean_z), w, h, cn: 4 };
  const steps = unhex(d.ladder);
  const lean = {};
  for (const ax of ['x', 'y']) {
    const L = d.lean[ax];
    lean[ax] = {
      e1: unhex(L.e1), e2: unhex(L.e2), tiles1: tilesIn(L.tiles1), tiles2: tilesIn(L.tiles2),
      spec1: L.spec1.map(unhex), spec2: L.spec2.map(unhex), per: L.per_step
    };
  }
  const fits = d.fit_evs.map(F => {
    const bands = F.bands === null ? null : { d: unhex(F.bands.d), w: F.bands.w, h: F.bands.h };
    return {
      F, profile: unhex(F.profile), bands, tiles: tilesIn(F.tiles),
      spectrum: F.spectrum === null ? null : F.spectrum.map(unhex), extra: listIn(F.extra_candidates)
    };
  });
  function mkEv(f) { return new C._AxisEvidence(f.profile, f.bands, f.tiles, f.spectrum, null, f.extra); }

  // ---- A: everything without a transcendental, bit-exact, from rgba + the reference's quantized
  function suiteA(rep) {
    rep.exact('A._flatten_channels(rgba) sha', sha32(C._flatten_channels(rgba).d), d.flat_sha.rgba);
    rep.exact('A._flatten_channels(q) sha', sha32(C._flatten_channels(q).d), d.flat_sha.q);
    const pq = C.axis_profiles(q), po = C.axis_profiles(rgba);
    for (const k of ['e1x', 'e1y', 'e2x', 'e2y']) {
      rep.exact(`A.axis_profiles(q).${k}`, pq[k], unhex(d.prof_q[k]));
      rep.exact(`A.axis_profiles(rgba).${k}`, po[k], unhex(d.prof_o[k]));
    }
    const raw = { e1x: unhex(d.prof_q.e1x), e1y: unhex(d.prof_q.e1y), e2x: unhex(d.prof_o.e2x), e2y: unhex(d.prof_o.e2y) };
    for (const k of Object.keys(raw)) {
      rep.exact(`A._normalise(${k})`, C._normalise(raw[k]), unhex(d.normalise[k]));
      rep.exact(`A._jpeg_lattice_strength(${k})`, C._jpeg_lattice_strength(raw[k]), s64(d.jpeg_strength[k]));
      const n1 = C._notch_jpeg(raw[k]), n2 = C._notch_jpeg(raw[k], 2.5);
      rep.exact(`A._notch_jpeg(${k}) same-object`, n1 === raw[k], d.notch[k].same);
      rep.exact(`A._notch_jpeg(${k})`, n1, unhex(d.notch[k].out));
      rep.exact(`A._notch_jpeg(${k}, 2.5) same-object`, n2 === raw[k], d.notch[k + '_w25'].same);
      rep.exact(`A._notch_jpeg(${k}, 2.5)`, n2, unhex(d.notch[k + '_w25'].out));
    }
    // fusion.build_evidence's own profile step: notch everything when jpeg_z > 5
    const jz = Math.max(C._jpeg_lattice_strength(raw.e1x), C._jpeg_lattice_strength(raw.e1y));
    rep.exact('A.jpeg_z', jz, s64(d.jpeg_z));
    const prof = {};
    for (const k of Object.keys(raw)) prof[k] = jz > 5.0 ? C._notch_jpeg(raw[k]) : raw[k];
    rep.exact('A.ev.x.e1', prof.e1x, lean.x.e1); rep.exact('A.ev.x.e2', prof.e2x, lean.x.e2);
    rep.exact('A.ev.y.e1', prof.e1y, lean.y.e1); rep.exact('A.ev.y.e2', prof.e2y, lean.y.e2);
    const gm = C._grad_maps(rgba, q);
    for (const k of ['dqx', 'dqy', 'cox', 'coy']) {
      rep.exact(`A._grad_maps.${k} shape`, [gm[k].h, gm[k].w], d.grad_sha[k].shape);
      rep.exact(`A._grad_maps.${k} sha`, sha32(gm[k].d), d.grad_sha[k].sha);
    }
    const tl = { x: [C._tile_peaks(gm.dqx, 0), C._tile_peaks(gm.cox, 0)], y: [C._tile_peaks(gm.dqy, 1), C._tile_peaks(gm.coy, 1)] };
    for (const ax of ['x', 'y']) for (const t of [0, 1]) {
      const got = tl[ax][t], want = lean[ax]['tiles' + (t + 1)];
      rep.exact(`A._tile_peaks ${ax}${t + 1} count`, got.length, want.length);
      for (let i = 0; i < Math.min(got.length, want.length); i++) {
        rep.exact(`A._tile_peaks ${ax}${t + 1}[${i}].pos`, got[i][0], want[i][0]);
        rep.exact(`A._tile_peaks ${ax}${t + 1}[${i}].h`, got[i][1], want[i][1]);
        rep.exact(`A._tile_peaks ${ax}${t + 1}[${i}].ext`, got[i][2], want[i][2]);
      }
    }
    const te = { dqx_a0_mt7_off0: C._tile_peaks(gm.dqx, 0, 0, 7), dqy_a1_mt5: C._tile_peaks(gm.dqy, 1, 1, 5) };
    for (const k of Object.keys(te)) {
      const want = tilesIn(d.tiles_extra[k]);
      rep.exact(`A._tile_peaks(${k}) count`, te[k].length, want.length);
      for (let i = 0; i < Math.min(te[k].length, want.length); i++) {
        rep.exact(`A._tile_peaks(${k})[${i}].pos`, te[k][i][0], want[i][0]);
        rep.exact(`A._tile_peaks(${k})[${i}].h`, te[k][i][1], want[i][1]);
      }
    }
    // background from the REFERENCE power: median filter, exact
    for (const ax of ['x', 'y']) for (const s of ['spec1', 'spec2']) {
      rep.exact(`A._spectral_background(${ax}.${s})`, C._spectral_background(lean[ax][s][1]), lean[ax][s][2]);
    }
    // pooled profiles, lattice refine, jpeg predicates on the reference's profiles
    for (const ax of ['x', 'y']) {
      const pp = new C._PooledProfile(lean[ax].e1), want = d.lean[ax].pp1;
      for (const p of ['1', '3', '5', '7']) {
        rep.exact(`A._PooledProfile(${ax}.e1)[${p}].v`, pp.variants[p][0], unhex(want[p][0]));
        rep.exact(`A._PooledProfile(${ax}.e1)[${p}].mean`, pp.variants[p][1], s64(want[p][1]));
        rep.exact(`A._PooledProfile(${ax}.e1)[${p}].std`, pp.variants[p][2], s64(want[p][2]));
      }
      const per = lean[ax].per;
      const lv = [], le = [], wv = [], we = [], jg = [], jw = [];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i], r = C._latticeRefineEx(lean[ax].e1, s);
        lv.push(r.s); le.push(r.early); wv.push(s64(per.lat1[i][0])); we.push(per.lat1[i][1]);
        const ph = s64(per.ray1[i][1]);
        jg.push(C.is_jpeg_suspect(s), C.is_jpeg_lattice(s, ph), C.is_jpeg_lattice(s, 0.3), C.is_jpeg_lattice(s, s - 0.2));
        jw.push(...per.jpeg[i]);
      }
      rep.exact(`A._lattice_refine(${ax}.e1) over ladder`, lv, wv);
      rep.exact(`A._lattice_refine(${ax}.e1) returned-s0 flags`, le, we);
      rep.exact(`A.is_jpeg_suspect/lattice ${ax} over ladder`, jg, jw);
      // comb scores: no transcendental except np.log(len(phases)), baked
      const pp2 = new C._PooledProfile(lean[ax].e2), cg = [], cw = [];
      for (let i = 0; i < steps.length; i++) {
        cg.push(...C._comb_score(pp, steps[i]), ...C._comb_score(pp2, steps[i]));
        cw.push(...listIn(per.comb1[i]), ...listIn(per.comb2[i]));
      }
      rep.exact(`A._comb_score(${ax}.e1, ${ax}.e2) over ladder`, cg, cw);
    }
    // fit_grid evidence: construction and the libm-free methods
    fits.forEach((f, k) => {
      const ev = mkEv(f), F = f.F;
      for (const p of ['1', '3', '5', '7']) {
        rep.exact(`A.fit[${k}].pp_global[${p}]`, [...ev.pp_global.variants[p][0], ev.pp_global.variants[p][1], ev.pp_global.variants[p][2]],
          [...unhex(F.pp_global[p][0]), s64(F.pp_global[p][1]), s64(F.pp_global[p][2])]);
      }
      if (F.bg !== null) rep.exact(`A.fit[${k}].bg`, ev.bg, unhex(F.bg));
      rep.exact(`A.fit[${k}]._peaks count`, ev._peaks.length, F.peaks.length);
      F.peaks.forEach((pk, i) => {
        rep.exact(`A.fit[${k}]._peaks[${i}]`, [...ev._peaks[i][0], ...ev._peaks[i][1], ev._peaks[i][2]], [...unhex(pk[0]), ...unhex(pk[1]), pk[2]]);
      });
      const ra = unhex(F.refine_at), rg = [];
      for (const s of ra) rg.push(ev.refine(s));
      rep.exact(`A.fit[${k}].refine(s) x${ra.length}`, rg, listIn(F.refine));
      // the sweep grid and the numpy argsort permutations at this module's call sites
      const sw = [];
      for (let s = 2.0; s <= F.max_step; s *= 1.02) sw.push(s);
      rep.exact(`A.fit[${k}].sweep steps`, sw, unhex(F.sweep_steps));
      rep.exact(`A.fit[${k}] argsort(-ray_quick) == numpy`, Array.from(C.argsortNeg(unhex(F.ray_quick))), F.diag_sweep_order);
      if (F.diag_spectral_order) rep.exact(`A.fit[${k}] argsort(-spectral heights) == numpy`, Array.from(C.argsortNeg(unhex(F.diag_spectral_order.heights))), F.diag_spectral_order.order);
    });
    for (const E of d.estimate_period) {
      rep.exact(`A.estimate_period[${E.which}] argsort(-comb scores) == numpy`, Array.from(C.argsortNeg(unhex(E.diag_scores))), E.diag_order);
    }
  }

  // ---- B/D/E: transcendental-dependent, on the REFERENCE's inputs
  function suiteLib(rep) {
    for (const ax of ['x', 'y']) {
      const Lx = lean[ax], per = Lx.per;
      const g = { ray1: [], ray2: [], tile1: [], tile2: [], spec1: [], spec2: [] }, w = { ray1: [], ray2: [], tile1: [], tile2: [], spec1: [], spec2: [] };
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        g.ray1.push(...C._rayleigh_score(Lx.e1, s)); w.ray1.push(...listIn(per.ray1[i]));
        g.ray2.push(...C._rayleigh_score(Lx.e2, s)); w.ray2.push(...listIn(per.ray2[i]));
        g.tile1.push(C._tiles_ray_z(Lx.tiles1, s)); w.tile1.push(s64(per.tile1[i]));
        g.tile2.push(C._tiles_ray_z(Lx.tiles2, s)); w.tile2.push(s64(per.tile2[i]));
        g.spec1.push(C._spectral_z(Lx.spec1[0], Lx.spec1[1], Lx.spec1[2], s)); w.spec1.push(s64(per.spec1[i]));
        g.spec2.push(C._spectral_z(Lx.spec2[0], Lx.spec2[1], Lx.spec2[2], s)); w.spec2.push(s64(per.spec2[i]));
      }
      for (const k of Object.keys(g)) rep.lib(`B.${ax}.${k} over ladder (z,phase)`, `B ${k}`, g[k], w[k]);
      // the channel matrix core.detect reads: columns ray_e1, tile_e1, tile_e2, spec_e1
      const mat = unhex(d.lean[ax].mat), nc = d.lean[ax].mat_shape[1], CH = d.channels;
      const col = (name) => { const j = CH.indexOf(name), o = []; for (let i = 0; i < steps.length; i++) o.push(mat[i * nc + j]); return o; };
      rep.lib(`B.${ax} channel_matrix ray_e1`, 'B channel_matrix', g.ray1.filter((_, i) => i % 2 === 0), col('ray_e1'));
      rep.lib(`B.${ax} channel_matrix tile_e1`, 'B channel_matrix', g.tile1, col('tile_e1'));
      rep.lib(`B.${ax} channel_matrix tile_e2`, 'B channel_matrix', g.tile2, col('tile_e2'));
      rep.lib(`B.${ax} channel_matrix spec_e1`, 'B channel_matrix', g.spec1, col('spec_e1'));
    }
    fits.forEach((f, k) => {
      const ev = mkEv(f), F = f.F;
      const co = unhex(F.coarse), sg = [], sw = [];
      for (let i = 0; i < co.length; i++) { sg.push(...ev.score(co[i])); sw.push(...listIn(F.score_coarse[i])); }
      rep.lib(`D.fit[${k}].score over coarse grid`, 'D score', sg, sw);
      const ss = unhex(F.sweep_steps), rq = [];
      for (const s of ss) rq.push(ev._ray_quick(s));
      rep.lib(`D.fit[${k}]._ray_quick over sweep`, 'D _ray_quick', rq, Array.from(unhex(F.ray_quick)));
      const mx = F.max_step, comp = F.components;
      rep.lib(`D.fit[${k}] spacing(global)`, 'D candidate lists', C._spacing_candidates(f.profile, 2.0, mx), listIn(comp.spacing_global));
      const rows = f.bands === null ? [] : Array.from({ length: f.bands.h }, (_, b) => f.bands.d.subarray(b * f.bands.w, (b + 1) * f.bands.w));
      rows.forEach((b, i) => rep.lib(`D.fit[${k}] spacing(band ${i})`, 'D candidate lists', C._spacing_candidates(b, 2.0, mx), listIn(comp.spacing_bands[i])));
      rep.lib(`D.fit[${k}] tile_modes`, 'D candidate lists', C._tile_spacing_modes(f.tiles, 2.0, mx), listIn(comp.tile_modes));
      if (comp.spectral !== null) rep.lib(`D.fit[${k}] spectral_candidates`, 'D candidate lists', C._spectral_candidates(ev.freqs, ev.power, ev.bg, 2.0, mx), listIn(comp.spectral));
      rep.lib(`D.fit[${k}] sweep_candidates`, 'D candidate lists', ev.sweep_candidates(2.0, mx), listIn(comp.sweep));
      rep.lib(`D.fit[${k}] candidate_steps`, 'D candidate lists', ev.candidate_steps(2.0, mx), listIn(F.candidate_steps));
      rep.exact(`D.fit[${k}] candidate_steps are all Python floats`, F.candidate_is_np.every(x => !x), true);
      const eg = [], ew = [], tg = [], tw = [];
      for (const c of F.ers_calls) {
        const r = C._evidence_refine_step(ev, s64(c[0]), c[1]);
        eg.push(r[0], r[1], r[2]); ew.push(s64(c[2]), s64(c[3]), s64(c[4]));
        tg.push(r[3]); tw.push(c[5]);
      }
      rep.lib(`D.fit[${k}]._evidence_refine_step x${F.ers_calls.length} (fit_grid's own calls)`, 'D _evidence_refine_step', eg, ew);
      rep.exact(`D.fit[${k}]._evidence_refine_step returned-type (np.float64?) x${F.ers_calls.length}`, tg, tw);
    });
    d.estimate_period.forEach(E => {
      const f = fits[E.which], pp = new C._PooledProfile(f.profile);
      const r = C.estimate_period(f.profile), r2 = C.estimate_period(f.profile, 3.0, 20.0, 0.7);
      rep.lib(`E.estimate_period[${E.which}]`, 'E estimate_period', r.slice(0, 3), listIn(E.result.slice(0, 3)));
      rep.lib(`E.estimate_period[${E.which}](3, 20, 0.7)`, 'E estimate_period', r2.slice(0, 3), listIn(E.result_alt.slice(0, 3)));
      rep.exact(`E.estimate_period[${E.which}] step type`, [r[3], r2[3]], [E.result[3], E.result_alt[3]]);
      const cg = [], cw = [], tg = [], tw = [];
      for (const c of E.refine_calls) {
        const x = C._refine_step(pp, f.profile, s64(c[0]), c[1]);
        cg.push(x[0], x[1], x[2]); cw.push(s64(c[2]), s64(c[3]), s64(c[4]));
        tg.push(x[3]); tw.push(c[5]);
      }
      rep.lib(`E._refine_step x${E.refine_calls.length} (estimate_period's own calls)`, 'E _refine_step', cg, cw);
      rep.exact(`E._refine_step returned-type x${E.refine_calls.length}`, tg, tw);
    });
  }

  // ---- C: the production chain, JS all the way from rgba + quantized (Math libm)
  function suiteChain(rep) {
    const pq = C.axis_profiles(q), po = C.axis_profiles(rgba);
    const raw = { e1x: pq.e1x, e1y: pq.e1y, e2x: po.e2x, e2y: po.e2y };
    const jz = Math.max(C._jpeg_lattice_strength(raw.e1x), C._jpeg_lattice_strength(raw.e1y));
    const prof = {};
    for (const k of Object.keys(raw)) prof[k] = jz > 5.0 ? C._notch_jpeg(raw[k]) : raw[k];
    const gm = C._grad_maps(rgba, q);
    const t0 = Date.now();
    const spec = { x: C._axis_spectrum([gm.dqx], 0), y: C._axis_spectrum([gm.dqy], 1) };
    const spec2 = { x: C._axis_spectrum([gm.cox], 0), y: C._axis_spectrum([gm.coy], 1) };
    const specMs = Date.now() - t0;
    const tiles = { x: [C._tile_peaks(gm.dqx, 0), C._tile_peaks(gm.cox, 0)], y: [C._tile_peaks(gm.dqy, 1), C._tile_peaks(gm.coy, 1)] };
    const out = {};
    for (const ax of ['x', 'y']) {
      const [f1, p1] = spec[ax], b1 = C._spectral_background(p1), [f2, p2] = spec2[ax];
      rep.exact(`C.${ax} rfftfreq`, f1, lean[ax].spec1[0]);
      rep.lib(`C.${ax} _axis_spectrum(E1 map) power`, 'C _axis_spectrum power', Array.from(p1), Array.from(lean[ax].spec1[1]));
      rep.lib(`C.${ax} _axis_spectrum(E2 map) power`, 'C _axis_spectrum power', Array.from(p2), Array.from(lean[ax].spec2[1]));
      rep.lib(`C.${ax} _spectral_background`, 'C _spectral_background', Array.from(b1), Array.from(lean[ax].spec1[2]));
      const e1 = ax === 'x' ? prof.e1x : prof.e1y;
      const ray = [], t1 = [], t2 = [], sp = [];
      for (const s of steps) {
        ray.push(C._rayleigh_score(e1, s)[0]); t1.push(C._tiles_ray_z(tiles[ax][0], s));
        t2.push(C._tiles_ray_z(tiles[ax][1], s)); sp.push(C._spectral_z(f1, p1, b1, s));
      }
      const mat = unhex(d.lean[ax].mat), nc = d.lean[ax].mat_shape[1], CHN = d.channels;
      const col = (name) => { const j = CHN.indexOf(name), o = []; for (let i = 0; i < steps.length; i++) o.push(mat[i * nc + j]); return o; };
      rep.lib(`C.${ax} ray_e1 (JS chain)`, 'C channel values', ray, col('ray_e1'));
      rep.lib(`C.${ax} tile_e1 (JS chain)`, 'C channel values', t1, col('tile_e1'));
      rep.lib(`C.${ax} tile_e2 (JS chain)`, 'C channel values', t2, col('tile_e2'));
      rep.lib(`C.${ax} spec_e1 (JS chain)`, 'C channel values', sp, col('spec_e1'));
      // fusion.fused_curve + core's normalisation and argmax (test-side replica of fusion.py:382-393, core.py:179-186)
      let fused = new Float64Array(steps.length);
      for (const c of [ray, t1, t2, sp]) {
        const cc = c.map(v => PF.clipScalar(v, 0.0, null));
        let m = -Infinity; for (const v of cc) if (v > m) m = v;
        if (m <= 1e-9) continue;
        for (let i = 0; i < cc.length; i++) fused[i] = fused[i] + 1.0 * (cc[i] / m);
      }
      let mx = -Infinity; for (const v of fused) if (v > mx) mx = v;
      const curve = mx > 0 ? fused.map(v => v / mx) : fused;
      rep.lib(`C.${ax} fused curve`, 'C fused curve', Array.from(curve), Array.from(unhex(d.lean[ax].curve)));
      out[ax] = steps[PF.argmax(curve)];
      rep.exact(`C.${ax} fused argmax step (core's "fu" proposal)`, out[ax], s64(d.lean[ax].fu_step));
    }
    return { fu: out, specMs };
  }

  return { suiteA, suiteLib, suiteChain, rgba, q };
}

// ================================================================== synth
function synthSuites(S) {
  function suiteA(rep) {
    // CPython hash(float), set iteration order, round(x, 4) by type
    const hg = [], hw = [];
    for (const [hx, hs] of S.hash) {
      const bits = C.pyHashBits(s64(hx));
      let v = 0n; for (let i = 63; i >= 0; i--) v = (v << 1n) | BigInt(bits[i]);
      hg.push(BigInt.asIntN(64, v).toString()); hw.push(hs);
    }
    rep.exact(`S.hash(float) x${hg.length}`, hg, hw);
    const og = [], ow = [];
    for (const [a, b, order] of S.set_pairs) {
      const vals = [s64(a), s64(b)];
      og.push(C.pySetIter(vals).map(i => vals[i]).join(',')); ow.push(listIn(order).join(','));
    }
    for (const [a, b, c, order] of S.set_triples) {
      const vals = [s64(a), s64(b), s64(c)];
      og.push(C.pySetIter(vals).map(i => vals[i]).join(',')); ow.push(listIn(order).join(','));
    }
    rep.exact(`S.set iteration order x${og.length}`, og, ow);
    const rg = [], rw = [];
    for (const [v, py, npv] of S.round4) { rg.push(C.round4(s64(v), false), C.round4(s64(v), true)); rw.push(s64(py), s64(npv)); }
    rep.exact(`S.round(x, 4) python/numpy x${S.round4.length}`, rg, rw);
    for (const [k, e] of Object.entries(S.profiles)) {
      const v = unhex(e.in);
      rep.exact(`S.${k}._normalise`, C._normalise(v), unhex(e.norm));
      const n = C._notch_jpeg(v);
      rep.exact(`S.${k}._notch_jpeg`, n, unhex(e.notch));
      rep.exact(`S.${k}._notch_jpeg same-object`, n === v, e.notch_same);
      rep.exact(`S.${k}._jpeg_lattice_strength`, C._jpeg_lattice_strength(v), s64(e.jls));
      if (e.comb) {
        const pp = new C._PooledProfile(v), g = [], w = [];
        for (const [s, z, p] of e.comb) { g.push(...C._comb_score(pp, s64(s))); w.push(s64(z), s64(p)); }
        for (const [s, z, p] of e.comb_res) { g.push(...C._comb_score(pp, s64(s), 0.1)); w.push(s64(z), s64(p)); }
        rep.exact(`S.${k}._comb_score`, g, w);
        const lg = [], lw = [];
        for (const [s, a, b] of e.lat) { lg.push(C._lattice_refine(v, s64(s)), C._lattice_refine(v, s64(s), 1)); lw.push(s64(a), s64(b)); }
        rep.exact(`S.${k}._lattice_refine`, lg, lw);
      }
    }
    const lg = [], lw = [];
    for (const [pk, hh, s0, a, b] of S.lattice_peaks) {
      lg.push(C._lattice_refine_peaks(unhex(pk), unhex(hh), s64(s0)), C._lattice_refine_peaks(unhex(pk), unhex(hh), s64(s0), 2));
      lw.push(s64(a), s64(b));
    }
    rep.exact(`S._lattice_refine_peaks x${S.lattice_peaks.length}`, lg, lw);
    const jg = [], jw = [];
    for (const [s, ph, sus, lat] of S.jpeg_pred) { jg.push(C.is_jpeg_suspect(s64(s)), C.is_jpeg_lattice(s64(s), s64(ph))); jw.push(sus, lat); }
    rep.exact(`S.is_jpeg_suspect / is_jpeg_lattice x${S.jpeg_pred.length}`, jg, jw);
    for (const a of S.axis_profiles) {
      const sh = a.shape, cn = sh.length === 3 ? sh[2] : 1;
      const img = { d: Uint8Array.from(unhex(a.img)), w: sh[1], h: sh[0], cn };
      rep.exact(`S._flatten_channels ${sh}`, Array.from(C._flatten_channels(img).d), Array.from(unhex(a.flat)));
      const p = C.axis_profiles(img);
      for (const k of ['e1x', 'e1y', 'e2x', 'e2y']) rep.exact(`S.axis_profiles ${sh} ${k}`, p[k], unhex(a.prof[k]));
    }
    S.spectral.forEach((e, i) => rep.exact(`S.spectral[${i}] background`, C._spectral_background(unhex(e.power)), unhex(e.bg)));
    S.tiles.forEach((e, i) => {
      const t = tilesIn(e.tiles);
      rep.exact(`S.tiles[${i}] _tile_spacing_modes`, C._tile_spacing_modes(t, 2.0, 30.0), listIn(e.modes));
      rep.exact(`S.tiles[${i}] _tile_spacing_modes(top=1)`, C._tile_spacing_modes(t, 3.0, 10.0, 1), listIn(e.modes_top1));
    });
  }
  function suiteLib(rep) {
    for (const [k, e] of Object.entries(S.profiles)) {
      const v = unhex(e.in);
      if (!e.ray) continue;
      const g = [], w = [];
      for (const [s, z, p] of e.ray) { g.push(...C._rayleigh_score(v, s64(s))); w.push(s64(z), s64(p)); }
      rep.lib(`S.${k}._rayleigh_score`, 'S rayleigh', g, w);
      rep.lib(`S.${k}._spacing_candidates`, 'S lists', C._spacing_candidates(v, 2.0, 30.0), listIn(e.spacing));
      const r = C.estimate_period(v);
      rep.lib(`S.${k}.estimate_period`, 'S estimate_period', r.slice(0, 3), listIn(e.est.slice(0, 3)));
      rep.exact(`S.${k}.estimate_period type`, r[3], e.est[3]);
    }
    S.spectral.forEach((e, i) => {
      const f = unhex(e.freqs), p = unhex(e.power), b = unhex(e.bg), g = [], w = [];
      for (const [s, z] of e.z) { g.push(C._spectral_z(f, p, b, s64(s))); w.push(s64(z)); }
      rep.lib(`S.spectral[${i}] _spectral_z`, 'S spectral_z', g, w);
      rep.lib(`S.spectral[${i}] _spectral_candidates`, 'S lists', C._spectral_candidates(f, p, b, 2.0, 40.0), listIn(e.cands));
      rep.lib(`S.spectral[${i}] _spectral_candidates(top=2)`, 'S lists', C._spectral_candidates(f, p, b, 2.5, 20.0, 2), listIn(e.cands_top2));
    });
    S.tiles.forEach((e, i) => {
      const t = tilesIn(e.tiles), g = [], w = [];
      for (const [s, z] of e.z) { g.push(C._tiles_ray_z(t, s64(s))); w.push(s64(z)); }
      rep.lib(`S.tiles[${i}] _tiles_ray_z`, 'S tiles_ray_z', g, w);
    });
  }
  return { suiteA, suiteLib };
}

// ================================================================== run one
function runControls(name, suites, table) {
  // each flag flipped; the listed suites must go red somewhere
  const flags = Object.keys(SEM);
  const res = {};
  for (const f of flags) {
    SEM[f] = false;
    let red = 0, total = 0;
    try {
      const repA = new Rep('numpy', true);
      quiet(() => suites.suiteA(repA));
      const lib = makeTableLibm(table, null);
      const repL = new Rep('numpy', true);
      quiet(() => withLibm(lib, () => suites.suiteLib(repL)));
      red = repA.fail + repL.fail + (lib.stats.thetaMismatch ? 1 : 0);
      total = repA.pass + repA.fail + repL.pass + repL.fail;
      res[f] = { red, total, theta: lib.stats.thetaMismatch };
    } finally { SEM[f] = true; }
  }
  return res;
}

function main(name) {
  const t0 = Date.now();
  console.log(`\n=== ${name} ===`);
  const file = path.join(FIX, `channels-a-${name}-parity.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = data.meta;
  console.log(`fixture: numpy ${m.numpy} / scipy ${m.scipy} / cv2 ${m.cv2} / python ${m.python} (${m.machine}, dispatch ${m.cpu_dispatch})`);
  let pass = 0, fail = 0;
  const fails = [];
  let suites;
  if (name === 'synth') {
    suites = synthSuites(data.synth);
  } else {
    // F first: the reference's quantized image, re-derived here in a fresh process
    const tq = Date.now();
    const rgba0 = { d: unz(data.rgba_z), w: data.w, h: data.h, cn: 4 };
    const qjs = PF.kmeans_quantize(PF.medianBlur(rgba0, 3), 16).quantized.d;
    const qref = unz(data.q_lean_z);
    let nd = 0; for (let i = 0; i < qref.length; i++) if (qjs[i] !== qref[i]) nd++;
    console.log(`F  quantize chain (PF.medianBlur + PF.kmeans_quantize, first k-means of this process) vs the reference's: ${nd}/${qref.length} bytes differ  (${Date.now() - tq} ms)`);
    if (nd) { fail++; fails.push(`F quantize chain: ${nd} bytes differ`); } else pass++;
    console.log(`   (reference made ${data.n_kmeans} k-means calls in its process; fit_grid's was the 2nd and is NOT reproducible here, so its quantized image is taken from the fixture)`);
    suites = imageSuites(data);
  }

  const repA = new Rep('numpy', false);
  console.log('A  no transcendental: bit-exact');
  suites.suiteA(repA);
  console.log(`   ${repA.pass} comparisons pass, ${repA.fail} fail  (${repA.values} values)`);

  console.log('   numpy libm table: closing over every argument the port asks for ...');
  const table = closeLibm(name, suites.suiteLib);
  const lib = makeTableLibm(table, null);
  const repN = new Rep('numpy', false);
  console.log('B/D/E [numpy]  numpy\'s own cos/sin/atan2/log10/pow injected: must be bit-exact');
  withLibm(lib, () => suites.suiteLib(repN));
  console.log(`   ${repN.pass} comparisons pass, ${repN.fail} fail  (${repN.values} values; ${lib.stats.lookups} phasor lookups, ${lib.stats.misses} table misses, ${lib.stats.thetaMismatch} theta mismatches)`);
  if (lib.stats.misses) { repN.fail++; repN.fails.push(`numpy libm table: ${lib.stats.misses} misses`); }
  if (lib.stats.thetaMismatch) { repN.fail++; repN.fails.push(`theta = (2*pi*p)*(1/step) disagrees with numpy's on ${lib.stats.thetaMismatch} values`); }

  const repM = new Rep('math', false);
  console.log('B/D/E [math]   production Math.* libm: measured (bound rel ' + MATH_REL_BOUND + ')');
  suites.suiteLib(repM);
  repM.printGroups();
  console.log(`   ${repM.pass} comparisons pass, ${repM.fail} fail`);

  let repC = null;
  if (suites.suiteChain) {
    repC = new Rep('math', false);
    console.log('C  [math] the JS chain from rgba + quantized to core\'s fused "fu" step');
    const r = suites.suiteChain(repC);
    repC.printGroups();
    console.log(`   fu step x=${r.fu.x} y=${r.fu.y}; ${repC.pass} comparisons pass, ${repC.fail} fail  (spectra ${r.specMs} ms)`);
  }

  console.log('negative controls (each flips one measured semantic; must go RED where exercised):');
  const ctl = runControls(name, suites, table);
  for (const [f, r] of Object.entries(ctl)) {
    console.log(`   ${r.red > 0 ? 'red ' : 'GREEN'} ${f.padEnd(20)} ${r.red}/${r.total} comparisons went red${r.theta ? ` (+${r.theta} theta mismatches)` : ''}`);
  }

  for (const R of [repA, repN, repM].concat(repC ? [repC] : [])) { pass += R.pass; fail += R.fail; fails.push(...R.fails); }
  if (fails.length) { console.log('FAILURES (first 30):'); for (const f of fails.slice(0, 30)) console.log('   ' + f); }
  console.log(`RESULT ${name.padEnd(10)} pass ${pass}  fail ${fail}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exitCode = fail ? 1 : 0;
}

main(only);
