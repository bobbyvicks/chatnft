/* Parity test for src/pf-24-fusion.js (fusion.py) against
 * fixtures/fusion-<image>-<mode>-parity.json (tools/parity-fusion.py).
 *
 *   node tools/test-fusion.cjs                 every (image, mode) + synth, one process each
 *   node tools/test-fusion.cjs <image> <mode>  one process (mode: full | lean)
 *   node tools/test-fusion.cjs synth           the pure functions on constructed inputs
 *   node tools/test-fusion.cjs --mutants [image ...]
 *                                              one-literal mutants of pf-24, each image in
 *                                              its own process; every mutant must go RED
 *
 * ONE (image, mode) PER PROCESS, AND THE PRODUCTION SUITE FIRST. fusion
 * reaches k-means (build_evidence -> PF.kmeans_quantize -> PF.kmeans on the
 * process-global OpenCV RNG), so only the first k-means of a fresh process
 * has drawn the same random numbers as the reference's (whose script also
 * makes exactly one per process). Suite E below is that first call.
 *
 *   E [math]  production: JS from the rgba bytes all the way - real
 *             medianBlur + k-means, PF.rfft / PF.hanning spectra, Math.*
 *             transcendentals. Values that pass through a C-runtime
 *             transcendental (cos/sin/atan2/log10/pow in channels.py, the
 *             FFT) are MEASURED: count, max |diff|, max ulp, and each must
 *             sit inside a relative bound. Everything else - the quantized
 *             image, profiles, bands, tiles, every chosen step, count, rescore
 *             key and candidate order - is compared EXACTLY.
 *   R [numpy] replay: the same entry point, with the reference's quantized
 *             image and its (freqs, power) spectra replayed in place of
 *             PF.kmeans_quantize / PF.channels._axis_spectrum, and
 *             PF.channels._libm swapped for a table of numpy's own outputs
 *             for exactly the arguments the port asks for (answered by
 *             parity-fusion.py --libm, rounds until nothing is missing).
 *             Every value must be BIT-EXACT: whatever differs in E is then
 *             the C runtime's / FFT's last bit, not this port's logic. A
 *             table miss is a failure here, never a fallback.
 *
 * Both suites record the same things the Python side records, the same way
 * (by wrapping names the code looks up at call time): build_evidence's
 * evidence, _cached_matrices' two matrices, each _axis_detect result, every
 * rescore (channel_scores with `only`), every _lattice_refine and
 * _exclusive_slot_occupancy call - and detect's return value.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const FIX = path.join(ROOT, 'fixtures');
const PY = process.env.PAF_PY || path.join(ROOT, '..', '..', 'pafenv2', 'Scripts', 'python.exe');
const PARITY_PY = path.join(__dirname, 'parity-fusion.py');
const IMAGES = ['tiny', 'small', 'mid', 'dragon', 'frog', 'koi-pond', 'lighthouse',
  'syn-nn5', 'syn-nn47', 'syn-rect46', 'syn-jpeg', 'syn-bilin', 'syn-flat',
  'syn-nn8', 'syn-blk2', 'syn-blk3', 'syn-cub8', 'syn-vstripes', 'syn-hstripes',
  'syn-sjpg', 'syn-moved', 'syn-square', 'syn-square2', 'syn-tie'];
const MODES = ['full', 'lean'];
const MATH_REL_BOUND = 1e-9;     // E values: relative bound (a flipped decision far exceeds it)
const MUTANT_ENV = 'PF_FUSION_MUTANT';

/* One-literal mutants of src/pf-24-fusion.js. Each [label, find, replace]:
 * `find` must occur EXACTLY once in the source (checked), so a mutant can
 * never silently be a no-op. */
const MUTANTS = [
  ['ladder ratio 1.03 -> 1.031', "ratio = 1.03;", "ratio = 1.031;"],
  ['pool cut 0.45 -> 0.55', 'curve[i] < 0.45 * best_val', 'curve[i] < 0.55 * best_val'],
  ['fundamental keep 0.88 -> 0.98', 'sc_sub >= 0.88 * score', 'sc_sub >= 0.98 * score'],
  ['exclusive occupancy 0.30 -> 0.60 (fundamental)', 'excl_occ(s_sub, step) >= 0.30', 'excl_occ(s_sub, step) >= 0.60'],
  ['anti-harmonic pool-mate 0.60 -> 0.20', 'sc_big >= 0.60 * score', 'sc_big >= 0.20 * score'],
  ['refine convergence 5e-4 -> 5e-2', 'Math.abs(s2 - s) < 5e-4', 'Math.abs(s2 - s) < 5e-2'],
  ['fine scan 19 -> 17 points', 'linspace\')(0.955, 1.045, 19)', 'linspace\')(0.955, 1.045, 17)'],
  ['snap floor 1.9 -> 2.9', 'extent / c >= 1.9', 'extent / c >= 2.9'],
  ['rescore band_e2 weight 1.0 -> 0.5', 'RESCORE_WEIGHTS.band_e2 = 1.0', 'RESCORE_WEIGHTS.band_e2 = 0.5'],
  ['fused weight tile_e2 1.0 -> 0.9', 'WEIGHTS.tile_e2 = 1.0', 'WEIGHTS.tile_e2 = 0.9'],
  ['numpy round -> python round (s0 * m)', 'add(fu_npRound4(s0 * ms[mi]))', 'add(pyRound(s0 * ms[mi], 4))'],
  ['stable order -> reversed ties', 'return a - b;\n    });', 'return b - a;\n    });'],
  // Not listed, because no input can observe them: the clip's signed zero
  // (np.clip(-0.0, 0.0, None) is +0.0, a two-sided clip keeps -0.0, but the
  // fused accumulator starts at +0.0 and +0.0 + -0.0 is +0.0), and moving the
  // 4-band threshold from 200 to 190 (no fixture height or width is in
  // [190, 200)).
  ['clip lower bound 0.0 -> -1.0', 'clip(mat.d[i * nc + j], 0.0, null)', 'clip(mat.d[i * nc + j], -1.0, null)'],
  ['2-band threshold 96 -> 150', "h >= 96 ? 2", "h >= 150 ? 2"],
  ['jpeg threshold 5.0 -> 50.0 (evidence)', 'if (jpeg_z > 5.0) {\n      note', 'if (jpeg_z > 50.0) {\n      note'],
  ['band rows not notched', 'if (r !== row) bands.d.set(r, i * bands.w);', 'if (false) bands.d.set(r, i * bands.w);'],
  ['square reconciliation 1.05 -> 1.08', 'keepSc * 1.05', 'keepSc * 1.08'],
  ['pick_count frac 0.2 -> 0.4', 'frac < 0.2 ||', 'frac < 0.4 ||'],
  ['candidates top 8 -> 7', '.slice(0, 8)', '.slice(0, 7)'],
  ['max_step extent/8 -> extent/7', 'extent / 8.0', 'extent / 7.0'],
  ['k-means k 16 -> 15', "kmeans_quantize')(base, 16)", "kmeans_quantize')(base, 15)"],
  ['fundamental divisors (2,3,4) -> (2,4)', 'divs = [2, 3, 4]', 'divs = [2, 4]'],
  ['anti-harmonic exclusivity 0.30 -> 0.0', 'excl_occ(step, s_big) < 0.30', 'excl_occ(step, s_big) < 0.0'],
  ['both-None fallback /128 -> /64', 'Math.max(w, h) / 128.0', 'Math.max(w, h) / 64.0'],
  ['rescore key python round -> numpy round', 'var key = pyRound(+s, 4);', 'var key = fu_npRound4(+s);']
];

// ------------------------------------------------------------------ loading
function loadModules() {
  const dir = path.join(ROOT, 'src');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const mi = process.env[MUTANT_ENV];
  for (const f of files) {
    let src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f === 'pf-24-fusion.js' && mi !== undefined) {
      const [, find, repl] = MUTANTS[+mi];
      const n = src.split(find).length - 1;
      if (n !== 1) throw new Error(`mutant ${mi}: "${find}" occurs ${n} times in pf-24-fusion.js (must be exactly 1)`);
      src = src.replace(find, repl);
    }
    (0, eval)(src);   // as a browser <script> would, and as tools/load.cjs does
  }
  return files;
}

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
function shaU8(u8) { return crypto.createHash('sha256').update(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)).digest('hex'); }
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
    this.fail++; this.fails.push(label + ': ' + msg);
    if (!this.quiet) console.log('   FAIL ' + label + ': ' + msg);
  }
  exact(label, got, want) {
    if (got === null || want === null || got === undefined || want === undefined || typeof got !== 'object') {
      this.values++;
      if (Object.is(got, want) || (got === undefined && want === null)) { this.pass++; return true; }
      this._fail(label, `got ${got} want ${want}` + (typeof got === 'number' && typeof want === 'number' ? ` (${ulp(got, want)} ulp)` : ''));
      return false;
    }
    if (got.length !== want.length) { this._fail(label, `length ${got.length} != ${want.length}`); return false; }
    let nd = 0, first = -1, maxAbs = 0, maxU = 0n;
    for (let i = 0; i < want.length; i++) {
      if (Object.is(got[i], want[i])) continue;
      nd++; if (first < 0) first = i;
      if (typeof got[i] === 'number' && typeof want[i] === 'number') {
        const d = Math.abs(got[i] - want[i]); if (d > maxAbs) maxAbs = d;
        const u = ulp(got[i], want[i]); if (u > maxU) maxU = u;
      }
    }
    this.values += want.length;
    if (!nd) { this.pass++; return true; }
    this._fail(label, `${nd}/${want.length} differ, first@${first} (got ${got[first]} want ${want[first]}), maxAbs=${maxAbs.toExponential(3)}, maxUlp=${maxU}`);
    return false;
  }
  // transcendental-dependent: exact under [numpy], measured under [math]
  lib(label, group, got, want) {
    if (this.mode === 'numpy') return this.exact(label, got, want);
    const g = this.groups.get(group) || { n: 0, nd: 0, maxAbs: 0, maxRel: 0, maxU: 0n, worst: '' };
    this.groups.set(group, g);
    const G = (got !== null && typeof got === 'object') ? got : [got], W = (want !== null && typeof want === 'object') ? want : [want];
    if (G.length !== W.length) { this._fail(`[math] ${label}`, `length ${G.length} != ${W.length}`); return false; }
    let ok = true;
    for (let i = 0; i < W.length; i++) {
      g.n++; this.values++;
      const a = G[i], b = W[i];
      if (Object.is(a, b)) continue;
      g.nd++;
      if (typeof a !== 'number' || typeof b !== 'number' || a !== a || b !== b) { ok = false; this._fail(`[math] ${label}[${i}]`, `got ${a} want ${b}`); continue; }
      const d = Math.abs(a - b), rel = d / Math.max(Math.abs(b), 1e-300), u = ulp(a, b);
      if (d > g.maxAbs) g.maxAbs = d;
      if (u > g.maxU) g.maxU = u;
      if (rel > g.maxRel) { g.maxRel = rel; g.worst = `${label}[${i}] got ${a} want ${b}`; }
      if (rel > MATH_REL_BOUND && d > 1e-12) { ok = false; this._fail(`[math] ${label}[${i}]`, `rel ${rel.toExponential(2)} > bound: got ${a} want ${b}`); }
    }
    if (ok) this.pass++;
    return ok;
  }
  printGroups() {
    for (const [k, g] of this.groups) {
      console.log(`   ${k.padEnd(30)} ${String(g.nd).padStart(7)}/${String(g.n).padEnd(7)} differ  maxAbs=${g.maxAbs.toExponential(2)}  maxRel=${g.maxRel.toExponential(2)}  maxUlp=${g.maxU}`);
    }
  }
}

// ------------------------------------------------------------------ libm table
let C = null;   // PF.channels, after loading
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
      let maxP = 0;
      for (let i = 0; i < n; i++) {
        if (p[i] !== Math.floor(p[i]) || p[i] < 0) throw new Error('phasors: non-integer position - the table cannot answer it');
        if (p[i] > maxP) maxP = p[i];
      }
      if (!e || e.maxP < maxP) {
        st.misses++;
        if (missing) { const k = hexOf(step); missing.phasors[k] = Math.max(missing.phasors[k] || 0, maxP, e ? e.maxP : 0); }
        return M.phasors(p, step);
      }
      const c = new Float64Array(n), s = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const k = p[i];
        c[i] = e.re[k]; s[i] = e.im[k]; st.lookups++;
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

function closeLibm(name, suite) {
  const TBL = path.join(FIX, `fusion-${name}-libm-parity.json`);
  const QRY = path.join(FIX, `fusion-${name}-libmq-parity.json`);
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

// ------------------------------------------------------------------ recording
/* Wrap the names fusion looks up at call time; each wrapper calls the
 * original with the same arguments and returns its result unchanged. */
function record(PF, run) {
  const F = PF.fusion, CH = PF.channels;
  const cap = { ev: null, mats: null, axis: {}, rescore: [], lattice: [], excl: [], kq: [], ids: new Map(), tags: [] };
  const o = { be: F.build_evidence, cm: F._cached_matrices, ad: F._axis_detect, cs: F.channel_scores,
    lr: CH._lattice_refine, eo: CH._exclusive_slot_occupancy, kq: PF.kmeans_quantize, hook: F._hook };
  F.build_evidence = function (rgba, lean) {
    const ev = o.be(rgba, lean);
    cap.ev = ev;
    for (const ax of ['x', 'y']) { cap.ids.set(ev[ax].e1, ax + '.e1'); cap.ids.set(ev[ax].e2, ax + '.e2'); }
    return ev;
  };
  F._cached_matrices = function (rgba, ev, steps) { const r = o.cm(rgba, ev, steps); cap.mats = r; return r; };
  F._axis_detect = function (ev, axis, steps, mat) { const r = o.ad(ev, axis, steps, mat); cap.axis[axis] = r; return r; };
  F.channel_scores = function (ev, axis, step, only) {
    const r = o.cs(ev, axis, step, only);
    if (only !== undefined && only !== null) cap.rescore.push([axis, step, r]);
    return r;
  };
  CH._lattice_refine = function (profile, s0, n) { const r = o.lr(profile, s0, n); cap.lattice.push([cap.ids.get(profile) || '?', s0, r]); return r; };
  CH._exclusive_slot_occupancy = function (profile, a, b, c) { const r = o.eo(profile, a, b, c); cap.excl.push([cap.ids.get(profile) || '?', a, b, c, r]); return r; };
  PF.kmeans_quantize = function (img, k, sm, seed) { const r = o.kq(img, k, sm, seed); cap.kq.push([shaU8(img.d), r.quantized]); return r; };
  F._hook = (t) => cap.tags.push(t);
  let out, err = null;
  try { out = run(); } catch (e) { err = e; }
  finally {
    F.build_evidence = o.be; F._cached_matrices = o.cm; F._axis_detect = o.ad; F.channel_scores = o.cs;
    CH._lattice_refine = o.lr; CH._exclusive_slot_occupancy = o.eo; PF.kmeans_quantize = o.kq; F._hook = o.hook;
  }
  cap.out = out; cap.err = err;
  return cap;
}

// ------------------------------------------------------------------ one image
function ppIn(v) { if (v === null) return null; const o = {}; for (const [p, [a, m, s]] of Object.entries(v)) o[p] = [unhex(a), s64(m), s64(s)]; return o; }
function tilesIn(t) { return t.map(([p, h, e]) => [unhex(p), unhex(h), e]); }

function imageRun(PF, d) {
  const F = PF.fusion;
  const w = d.w, h = d.h;
  const rgba = { d: unz(d.rgba_z), w, h, cn: 4 };
  const ladder = unhex(d.ladder);
  const qRef = d.q_z ? unz(d.q_z) : null;

  function run(mode) {
    if (mode === 'lean') {
      const ev = F.build_evidence(rgba, true);
      const steps = F.ladder(), out = {};
      const curves = {};
      for (const axis of ['x', 'y']) {
        const mat = F.channel_matrix(ev, axis, steps, F.ACTIVE_CHANNELS);
        const c = F.fused_curve(mat);
        // core.py:179-182, as core will call it
        let m = -Infinity; for (const v of c) { if (v !== v) { m = v; break; } if (v > m) m = v; }
        curves[axis] = m > 0 ? c.map(v => v / m) : c;
        out[axis] = { mat, fused: c, curve: curves[axis] };
      }
      const sx = steps[PF.argmax(curves.x)], sy = steps[PF.argmax(curves.y)];
      out.fu = { step_x: sx, step_y: sy, cols: Math.max(1, PF.rint(w / sx)), rows: Math.max(1, PF.rint(h / sy)) };
      return out;
    }
    return F.detect(rgba);
  }

  function compare(rep, cap, mode) {
    const pre = mode === 'numpy' ? 'R' : 'E';
    const L = (lbl) => `${pre}.${lbl}`;
    // ---- k-means input / output
    rep.exact(L('k-means calls'), cap.kq.length, d.n_kmeans);
    if (cap.kq.length && d.n_kmeans) {
      rep.exact(L('k-means input (medianBlur(rgba)) sha'), cap.kq[0][0], d.base_sha);
      rep.exact(L('quantized image sha'), shaU8(cap.kq[0][1].d), d.q_sha);
    }
    if (d.raises !== undefined && d.raises !== null) {
      rep.exact(L('detect raises'), cap.err !== null, true);
      console.log(`   reference raised ${d.raises}; JS raised ${cap.err && cap.err.message}`);
      return;
    }
    if (cap.err) { rep.exact(L('detect did not throw'), String(cap.err && cap.err.stack), null); return; }
    rep.exact(L('ladder()'), F.ladder(), Array.from(ladder));
    rep.exact(L('np.linspace(0.955, 1.045, 19)'), PF.linspace(0.955, 1.045, 19), unhex(d.linspace));
    // ---- evidence
    const E = cap.ev, R = d.ev;
    rep.exact(L('ev.jpeg_z'), E.jpeg_z, s64(R.jpeg_z));
    rep.exact(L('ev.vc is null'), E.vc === null, R.vc_is_none);
    rep.exact(L('ev.vc_cands count'), E.vc_cands.length, R.vc_cands.length);
    rep.exact(L('ev.vc_cands'), E.vc_cands.flat(), R.vc_cands.flat().map(s64));
    for (const ax of ['x', 'y']) {
      const A = E[ax], B = R[ax];
      rep.exact(L(`ev.${ax}.extent`), A.extent, B.extent);
      rep.exact(L(`ev.${ax}.e1`), A.e1, unhex(B.e1));
      rep.exact(L(`ev.${ax}.e2`), A.e2, unhex(B.e2));
      for (const k of ['pp1', 'pp2']) {
        const g = A[k], wv = ppIn(B[k]);
        rep.exact(L(`ev.${ax}.${k} is null`), g === null, wv === null);
        if (g && wv) for (const p of Object.keys(wv)) {
          rep.exact(L(`ev.${ax}.${k}[${p}] v`), g.variants[p][0], wv[p][0]);
          rep.exact(L(`ev.${ax}.${k}[${p}] mean,std`), [g.variants[p][1], g.variants[p][2]], [wv[p][1], wv[p][2]]);
        }
      }
      for (const k of ['bands1', 'bands2']) {
        const g = A[k], wb = B[k];
        rep.exact(L(`ev.${ax}.${k} is null`), g === null, wb === null);
        if (g && wb) { rep.exact(L(`ev.${ax}.${k} shape`), [g.h, g.w], [wb.h, wb.w]); rep.exact(L(`ev.${ax}.${k}`), g.d, unhex(wb.d)); }
      }
      for (const k of ['bpp1', 'bpp2']) {
        rep.exact(L(`ev.${ax}.${k} count`), A[k].length, B[k].length);
        for (let b = 0; b < Math.min(A[k].length, B[k].length); b++) {
          const wv = ppIn(B[k][b]);
          for (const p of Object.keys(wv)) {
            rep.exact(L(`ev.${ax}.${k}[${b}][${p}]`), [...A[k][b].variants[p][0], A[k][b].variants[p][1], A[k][b].variants[p][2]],
              [...wv[p][0], wv[p][1], wv[p][2]]);
          }
        }
      }
      for (const k of ['tiles1', 'tiles2']) {
        const g = A[k], wt = tilesIn(B[k]);
        rep.exact(L(`ev.${ax}.${k} count`), g.length, wt.length);
        const gp = [], wp = [], gh = [], wh = [], ge = [], we = [];
        for (let t = 0; t < Math.min(g.length, wt.length); t++) {
          gp.push(...g[t][0]); wp.push(...wt[t][0]); gh.push(...g[t][1]); wh.push(...wt[t][1]); ge.push(g[t][2]); we.push(wt[t][2]);
        }
        rep.exact(L(`ev.${ax}.${k} positions`), gp, wp);
        rep.exact(L(`ev.${ax}.${k} heights`), gh, wh);
        rep.exact(L(`ev.${ax}.${k} extents`), ge, we);
      }
      for (const k of ['spec1', 'spec2']) {
        const g = A[k], ws = B[k].map(unhex);
        rep.exact(L(`ev.${ax}.${k} freqs`), g[0], ws[0]);
        rep.lib(L(`ev.${ax}.${k} power`), 'spectrum power (PF.rfft)', Array.from(g[1]), Array.from(ws[1]));
        rep.lib(L(`ev.${ax}.${k} background`), 'spectral background', Array.from(g[2]), Array.from(ws[2]));
      }
    }
    if (d.mode === 'lean') {
      for (const ax of ['x', 'y']) {
        const o = cap.out[ax], Rl = d.lean[ax];
        rep.exact(L(`lean.${ax} matrix shape`), [o.mat.h, o.mat.w], Rl.shape);
        rep.lib(L(`lean.${ax} channel_matrix(only=ACTIVE)`), 'channel values', Array.from(o.mat.d), Array.from(unhex(Rl.mat)));
        rep.lib(L(`lean.${ax} fused_curve`), 'fused curve', Array.from(o.fused), Array.from(unhex(Rl.fused)));
        rep.lib(L(`lean.${ax} normalised curve`), 'fused curve', Array.from(o.curve), Array.from(unhex(Rl.curve)));
      }
      const fu = cap.out.fu, fr = d.fu_prop;
      rep.exact(L('lean core "fu" proposal step_x, step_y'), [fu.step_x, fu.step_y], [s64(fr.step_x), s64(fr.step_y)]);
      rep.exact(L('lean core "fu" proposal cols, rows'), [fu.cols, fu.rows], [fr.cols, fr.rows]);
      return;
    }
    // ---- full: the matrices
    const [mx, my] = cap.mats;
    rep.exact(L('matrix shapes'), [mx.h, mx.w, my.h, my.w], [...d.mats.shape_x, ...d.mats.shape_y]);
    const CHN = F.CHANNELS;
    for (const [ax, m, hex] of [['x', mx, d.mats.x], ['y', my, d.mats.y]]) {
      const want = unhex(hex), nc = m.w;
      for (let j = 0; j < nc; j++) {
        const g = [], wv = [];
        for (let i = 0; i < m.h; i++) { g.push(m.d[i * nc + j]); wv.push(want[i * nc + j]); }
        const grp = CHN[j] === 'vc' ? 'vc channel (no libm swap)' : 'channel values';
        if (CHN[j] === 'vc') rep.exact(L(`matrix.${ax}.vc`), g, wv);    // pf-23 is not behind C._libm: exact or nothing
        else rep.lib(L(`matrix.${ax}.${CHN[j]}`), grp, g, wv);
      }
    }
    // ---- per axis
    for (const ax of ['x', 'y']) {
      const g = cap.axis[ax], wa = d.axis[ax];
      rep.exact(L(`_axis_detect.${ax}.steps`), g.steps, unhex(wa.steps));
      rep.lib(L(`_axis_detect.${ax}.curve`), 'fused curve', Array.from(g.curve), Array.from(unhex(wa.curve)));
      rep.exact(L(`_axis_detect.${ax}.step (decision)`), g.step, s64(wa.step));
      rep.lib(L(`_axis_detect.${ax}.score`), 'axis score', g.score, s64(wa.score));
    }
    // ---- traces
    const tr = d.trace;
    rep.exact(L('rescore count'), cap.rescore.length, tr.rescore.length);
    const n = Math.min(cap.rescore.length, tr.rescore.length);
    const kg = [], kw = [], vg = [], vw = [];
    for (let i = 0; i < n; i++) {
      const [ax, st, sc] = cap.rescore[i], [wax, wst, only, wsc] = tr.rescore[i];
      kg.push(ax + ':' + st + ':' + Object.keys(sc).sort().join(',')); kw.push(wax + ':' + s64(wst) + ':' + only.join(','));
      for (const c of only) { vg.push(sc[c]); vw.push(s64(wsc[c])); }
    }
    rep.exact(L('rescore keys, in call order (axis:step:channels)'), kg, kw);
    rep.lib(L('rescore channel values'), 'rescore channel values', vg, vw);
    rep.exact(L('_lattice_refine calls (profile, s0, result)'),
      cap.lattice.map(t => `${t[0]}:${t[1]}:${t[2]}`), tr.lattice.map(t => `${t[0]}:${s64(t[1])}:${s64(t[2])}`));
    rep.exact(L('_exclusive_slot_occupancy calls (profile, s_small, s_big, result)'),
      cap.excl.map(t => `${t[0]}:${t[1]}:${t[3]}:${t[4]}`), tr.excl.map(t => `${t[0]}:${s64(t[1])}:${s64(t[3])}:${s64(t[4])}`));
    rep.lib(L('_exclusive_slot_occupancy phase_small'), 'excl phase (atan2)', cap.excl.map(t => t[2]), tr.excl.map(t => s64(t[2])));
    // ---- detect's return
    const res = cap.out, wr = d.detect;
    rep.exact(L('detect step_x, step_y'), [res.step_x, res.step_y], [s64(wr.step_x), s64(wr.step_y)]);
    rep.exact(L('detect cols, rows'), [res.cols, res.rows], [wr.cols, wr.rows]);
    rep.exact(L('detect phase_x, phase_y'), [res.phase_x, res.phase_y], [s64(wr.phase_x), s64(wr.phase_y)]);
    rep.exact(L('detect candidates: steps, in order'), res.candidates.map(t => t[0]), wr.candidates.map(t => s64(t[0])));
    rep.lib(L('detect candidates: curve values'), 'fused curve', res.candidates.map(t => t[1]), wr.candidates.map(t => s64(t[1])));
    rep.exact(L('detect keys'), Object.keys(res).join(','), 'step_x,step_y,cols,rows,phase_x,phase_y,candidates');
  }

  /* The replay suite: reference quantized image + reference spectra. */
  function replay(rep) {
    const CH = PF.channels;
    const oK = PF.kmeans_quantize, oS = CH._axis_spectrum;
    const specs = [['x', 'spec1', 0], ['x', 'spec2', 0], ['y', 'spec1', 1], ['y', 'spec2', 1]];
    let si = 0, badReplay = [];
    PF.kmeans_quantize = function (img) {
      if (shaU8(img.d) !== d.base_sha) badReplay.push('k-means input differs from the reference\'s');
      return { quantized: { d: new Uint8Array(qRef), w, h, cn: 4 } };
    };
    CH._axis_spectrum = function (dmaps, axis) {
      const [ax, k, a] = specs[si++] || [];
      if (a !== axis) badReplay.push(`_axis_spectrum call ${si}: axis ${axis}, expected ${a}`);
      const s = d.ev[ax][k];
      return [unhex(s[0]), unhex(s[1])];
    };
    let cap;
    try { cap = record(PF, () => run(d.mode)); } finally { PF.kmeans_quantize = oK; CH._axis_spectrum = oS; }
    // the recorder saw the replayed k-means; its input sha is still the real medianBlur output
    rep.exact('R.replay consistency', badReplay, []);
    rep.exact('R.spectra replayed (4 calls)', si, d.raises ? si : 4);
    compare(rep, cap, 'numpy');
    return cap;
  }

  return { rgba, run, compare, replay };
}

// ------------------------------------------------------------------ synth
function synthRun(PF, S, rep) {
  const F = PF.fusion;
  for (const [lo, hi, r, want] of S.ladders) rep.exact(`S.ladder(${s64(lo)}, ${s64(hi)}, ${s64(r)})`, F.ladder(s64(lo), s64(hi), s64(r)), Array.from(unhex(want)));
  for (const [label, m, shape, want] of S.fused) {
    rep.exact(`S.fused_curve ${label}`, F.fused_curve({ d: unhex(m), w: shape[1], h: shape[0] }), unhex(want));
  }
  for (const [label, c, want] of S.maxima) {
    const cv = unhex(c);
    rep.exact(`S._local_maxima ${label}`, F._local_maxima(F.ladder().slice(0, cv.length), cv), want);
  }
  rep.exact('S._band_stouffer(no bands)', F._band_stouffer([], null, 5.0), s64(S.stouffer_none));
  rep.exact('S.CHANNELS', F.CHANNELS, S.channels);
  rep.exact('S.ACTIVE_CHANNELS', F.ACTIVE_CHANNELS, S.active);
  rep.exact('S.WEIGHTS', F.CHANNELS.map(c => F.WEIGHTS[c]), S.channels.map(c => s64(S.weights[c])));
  rep.exact('S.RESCORE_WEIGHTS', F.CHANNELS.map(c => F.RESCORE_WEIGHTS[c]), S.channels.map(c => s64(S.rescore_weights[c])));
}

// ------------------------------------------------------------------ drivers
function runOne(name, mode) {
  const t0 = Date.now();
  loadModules();
  const PF = globalThis.PF;
  C = PF.channels;
  const mut = process.env[MUTANT_ENV];
  if (mut !== undefined) console.log(`MUTANT ${mut}: ${MUTANTS[+mut][0]}`);
  if (name === 'synth') {
    const S = JSON.parse(fs.readFileSync(path.join(FIX, 'fusion-synth-parity.json'), 'utf8')).synth;
    const rep = new Rep('numpy', false);
    synthRun(PF, S, rep);
    console.log(`RESULT synth       pass ${rep.pass}  fail ${rep.fail}  (${rep.values} values)`);
    process.exitCode = rep.fail ? 1 : 0;
    return;
  }
  const d = JSON.parse(fs.readFileSync(path.join(FIX, `fusion-${name}-${mode}-parity.json`), 'utf8'));
  console.log(`== ${name} ${mode} ${d.w}x${d.h}  (reference: numpy ${d.meta.numpy}, cv2 ${d.meta.cv2}, ${d.secs}s)`);
  const I = imageRun(PF, d);

  // E FIRST: the only k-means in this process that can match the reference's
  const tE = Date.now();
  const capE = record(PF, () => I.run(mode));
  const repE = new Rep('math', false);
  console.log(`E [math] production path, first k-means of this process  (${((Date.now() - tE) / 1000).toFixed(1)}s)`);
  I.compare(repE, capE, 'math');
  repE.printGroups();
  console.log(`   ${repE.pass} comparisons pass, ${repE.fail} fail  (${repE.values} values)`);

  // R: replayed quantized + spectra, numpy's libm; bit-exact
  let repR = new Rep('numpy', false), lib = null;
  if (mut !== undefined) {
    // a mutant asks the table questions the reference never answered; a miss
    // falls back to Math and is COUNTED, so a kill can be told from a miss
    const TBL = path.join(FIX, `fusion-${name}-libm-parity.json`);
    const table = fs.existsSync(TBL) ? JSON.parse(fs.readFileSync(TBL, 'utf8')) : emptyTable();
    lib = makeTableLibm(table, null);
  } else {
    console.log('R [numpy] replayed quantized image + spectra, numpy\'s own cos/sin/atan2/log10/pow: must be bit-exact');
    const table = closeLibm(name, (rep) => I.replay(rep));
    lib = makeTableLibm(table, null);
  }
  const capR = withLibm(lib, () => I.replay(repR));
  console.log(`   ${repR.pass} comparisons pass, ${repR.fail} fail  (${repR.values} values; ${lib.stats.lookups} phasor lookups, ${lib.stats.misses} table misses, ${lib.stats.thetaMismatch} theta mismatches)`);
  if (mut === undefined) {
    if (lib.stats.misses) { repR.fail++; repR.fails.push(`numpy libm table: ${lib.stats.misses} misses`); }
    if (lib.stats.thetaMismatch) { repR.fail++; repR.fails.push(`theta disagrees with numpy's on ${lib.stats.thetaMismatch} values`); }
  }
  const tags = {};
  for (const t of capE.tags.concat(capR.tags)) tags[t] = (tags[t] || 0) + 1;
  console.log('   branches taken (E+R): ' + (Object.keys(tags).sort().map(t => `${t}x${tags[t]}`).join(' ') || '-'));
  const fails = repE.fails.concat(repR.fails);
  if (fails.length) { console.log('FAILURES (first 25):'); for (const f of fails.slice(0, 25)) console.log('   ' + f); }
  const pass = repE.pass + repR.pass, fail = repE.fail + repR.fail;
  console.log(`RESULT ${(name + ' ' + mode).padEnd(16)} pass ${pass}  fail ${fail}  E-fail ${repE.fail} R-fail ${repR.fail} R-misses ${lib.stats.misses}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('TAGS ' + JSON.stringify(tags));
  process.exitCode = fail ? 1 : 0;
}

function child(args, env) {
  return spawnSync(process.execPath, [__filename, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, env: Object.assign({}, process.env, env || {}) });
}

function runAll(names) {
  let bad = 0;
  const summary = [], tags = {};
  for (const name of names) {
    for (const mode of MODES) {
      const r = child([name, mode]);
      process.stdout.write(r.stdout);
      if (r.stderr) process.stdout.write(r.stderr);
      const last = r.stdout.split('\n').filter(l => l.startsWith('RESULT')).pop() || `RESULT ${name} ${mode} CRASHED`;
      summary.push(last);
      if (r.status !== 0) bad++;
      const tl = r.stdout.split('\n').filter(l => l.startsWith('TAGS ')).pop();
      if (tl) for (const [k, v] of Object.entries(JSON.parse(tl.slice(5)))) (tags[k] = tags[k] || []).push(name + '/' + mode);
    }
  }
  const r = child(['synth']);
  process.stdout.write(r.stdout);
  summary.push(r.stdout.split('\n').filter(l => l.startsWith('RESULT')).pop() || 'RESULT synth CRASHED');
  if (r.status !== 0) bad++;
  console.log('\n==== summary ====');
  for (const s of summary) console.log(s);
  console.log('branch coverage (which processes took each arbitration branch):');
  for (const k of Object.keys(tags).sort()) console.log(`   ${k.padEnd(20)} ${[...new Set(tags[k])].join(' ')}`);
  console.log(bad ? `${bad} process(es) FAILED` : 'every process passed');
  process.exit(bad ? 1 : 0);
}

function runMutants(names) {
  // A mutant is KILLED when a comparison goes red that is not a table miss:
  // E red (an exact decision or the bound), or R red with zero table misses.
  // A crash is reported as a crash, never counted as a kill. First the
  // unmutated source must be green on every image, or a "kill" could be a
  // pre-existing red. Children run 6 at a time, one (mutant, image) each.
  const { spawn } = require('child_process');
  const jobs = [];
  for (const name of names) jobs.push([-1, name]);
  for (let m = 0; m < MUTANTS.length; m++) for (const name of names) jobs.push([m, name]);
  const res = new Map();
  let next = 0, live = 0;
  return new Promise((done) => {
    function pump() {
      while (live < 6 && next < jobs.length) {
        const [m, name] = jobs[next++];
        live++;
        const env = Object.assign({}, process.env);
        if (m >= 0) env[MUTANT_ENV] = String(m); else delete env[MUTANT_ENV];
        const p = spawn(process.execPath, [__filename, name, 'full'], { env });
        let so = '', se = '';
        p.stdout.on('data', (b) => { so += b; });
        p.stderr.on('data', (b) => { se += b; });
        p.on('close', () => {
          const line = so.split('\n').filter(l => l.startsWith('RESULT')).pop();
          let r;
          if (!line) r = { crash: (se.split('\n').filter(Boolean).pop() || 'no RESULT line') };
          else r = { e: +line.match(/E-fail (\d+)/)[1], r: +line.match(/R-fail (\d+)/)[1], mi: +line.match(/R-misses (\d+)/)[1] };
          res.set(m + '|' + name, r);
          live--;
          if (next < jobs.length) pump(); else if (!live) done();
        });
      }
    }
    pump();
  }).then(() => {
    let baseBad = 0;
    for (const name of names) {
      const r = res.get('-1|' + name);
      if (!r || r.crash || r.e || r.r) { baseBad++; console.log(`BASELINE NOT GREEN on ${name}: ${JSON.stringify(r)}`); }
    }
    console.log(`baseline (unmutated): ${names.length - baseBad}/${names.length} images green`);
    let survivors = 0;
    for (let m = 0; m < MUTANTS.length; m++) {
      const kills = [], soft = [], crashes = [];
      for (const name of names) {
        const r = res.get(m + '|' + name);
        if (r.crash) crashes.push(`${name}:CRASH(${r.crash})`);
        else if (r.e > 0 || (r.r > 0 && r.mi === 0)) kills.push(`${name}(E${r.e}/R${r.r})`);
        else if (r.r > 0) soft.push(`${name}(R${r.r}, ${r.mi} misses)`);
      }
      const ok = kills.length > 0;
      if (!ok) survivors++;
      console.log(`${ok ? 'RED     ' : 'SURVIVES'} ${String(m).padStart(2)} ${MUTANTS[m][0].padEnd(44)} red on ${kills.length}/${names.length}: ${kills.join(' ') || '-'}` +
        (soft.length ? `  [red only with table misses: ${soft.join(' ')}]` : '') + (crashes.length ? `  [crashed: ${crashes.join(' ')}]` : ''));
    }
    console.log(`${MUTANTS.length - survivors}/${MUTANTS.length} mutants red`);
    process.exit(survivors || baseBad ? 1 : 0);
  });
}

const argv = process.argv.slice(2);
if (argv[0] === '--mutants') runMutants(argv.length > 1 ? argv.slice(1) : IMAGES);
else if (argv.length === 0) runAll(IMAGES);
else runOne(argv[0], argv[1]);
