/* Node parity test for src/pf-41-reconsearch.js against the dumps written by
 * tools/parity-reconsearch.py (fixtures/reconsearch-parity.json and
 * fixtures/raw/reconsearch/<case>.*).
 *
 * Every comparison is BIT-EXACT (Object.is on each value). A miss prints how
 * many values differ, the first index, the max |diff| and the max ulp
 * distance, so its size is visible and not just its existence.
 *
 * ONE CASE PER PROCESS, on this side as on the python side: without an
 * argument this file runs the numpy-semantics probes and then forks itself
 * once per case. reconsearch seeds its own k-means generator, so it should
 * not care what ran before - the fork makes that a non-question rather than
 * an assumption.
 *
 * Per case, through the reference's own entry points:
 *   pixels  JS _prep(rgba) against R._prep: the channel stack, plus the
 *           diag intermediates (sample indices, k, centers, labels, mean,
 *           covariance, eigen-decomposition, order) that locate a miss;
 *           and the generator scope: _prep(rgba, {rng}) must leave PF's
 *           global generator untouched and consume exactly what the global
 *           path consumes.
 *   axis    AxisData fields for x and y (S/Q by sha256 + a strided sample,
 *           seg c_edges/q_t, t_sum).
 *   core    core.py's _build_recon sequence (_s_grid(extent)[::3],
 *           _coarse_curves, _trend_fn) and a replay of EVERY call
 *           pixelfixer.core.detect(mode="full") made into this module
 *           (eval_s, trend, _score) on the images where it reached it.
 *   detect  R.detect(rgba) run end to end with the same wrappers the python
 *           side used, compared call by call (eval_s, trend, _score,
 *           _refine, _build_table, _peaks, phase_regress, _align,
 *           _detect_axis, energy_tiles_multi samples) and on its result.
 * If the channel stack differs, axis/core/detect are re-run on the
 * REFERENCE's channel stack so the miss is attributed to _prep or to the
 * search, not smeared over both.
 *
 *   node tools/test-reconsearch.cjs              probes + every case
 *   node tools/test-reconsearch.cjs frog         one case
 *   node tools/test-reconsearch.cjs --controls   negative controls
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = ['pf-00-base.js', 'pf-03-cv2.js', 'pf-04-nprandom.js', 'pf-06-linalg.js', 'pf-41-reconsearch.js'];
for (const f of SRC) (0, eval)(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));   // as a <script> would
const PF = globalThis.PF;
const R = PF.reconsearch;
const pureScore = R._score;     // unwrapped: attribution must not add calls to the trace it is checking
const OUT = path.join(ROOT, 'fixtures', 'raw', 'reconsearch');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'reconsearch-parity.json'), 'utf8'));

/* A negative control arrives as an environment variable so that the forked
 * case process applies it before doing anything. */
const CONTROLS = {
  'log-platform': () => { R._semantics.log = 'platform'; },
  'cumsum-f64': () => { R._semantics.cumsumF32 = false; },
  'alpha-scale-f64': () => { R._semantics.alphaScaleF32 = false; },
  'enrow-pairwise': () => { R._semantics.enRowSequential = false; },
};
if (process.env.PF_RS_CONTROL) {
  const c = CONTROLS[process.env.PF_RS_CONTROL];
  if (!c) throw new Error('unknown control ' + process.env.PF_RS_CONTROL);
  c();
}

// ------------------------------------------------------------------ helpers
function unhex64(h) { const b = Buffer.from(h, 'hex'), o = new Float64Array(b.length / 8); for (let i = 0; i < o.length; i++) o[i] = b.readDoubleLE(i * 8); return o; }
function unhex32(h) { const b = Buffer.from(h, 'hex'), o = new Float32Array(b.length / 4); for (let i = 0; i < o.length; i++) o[i] = b.readFloatLE(i * 4); return o; }
function sha(ta) { return crypto.createHash('sha256').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex'); }
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
const i32 = new Int32Array(1), f32v = new Float32Array(i32.buffer);
function ord64(x) { f64v[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }
function ord32(x) { f32v[0] = x; const b = i32[0]; return b < 0 ? -2147483648 - b : b; }

let pass = 0, fail = 0, values = 0;
const failures = [];
function diff(got, want, kind) {
  if (!got || got.length !== want.length) return { ok: false, len: true, got: got ? got.length : null, want: want.length, n: want.length };
  let nd = 0, first = -1, maxAbs = 0, maxUlp = 0n;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    nd++; if (first < 0) first = i;
    const d = Math.abs(got[i] - want[i]); if (d > maxAbs || d !== d) maxAbs = d;
    let u = 0n;
    if (kind === 'f32') u = BigInt(Math.abs(ord32(got[i]) - ord32(want[i])));
    else if (kind === 'f64') { u = ord64(got[i]) - ord64(want[i]); if (u < 0n) u = -u; }
    if (u > maxUlp) maxUlp = u;
  }
  return { ok: nd === 0, nd, first, maxAbs, maxUlp, n: want.length, got, want };
}
function report(label, r, extra) {
  values += r.n || 0;
  if (r.ok) { pass++; return true; }
  fail++;
  let msg = r.len ? `length ${r.got} != ${r.want}`
    : `${r.nd}/${r.n} differ, first@${r.first} (got ${r.got[r.first]} want ${r.want[r.first]}), maxAbs=${r.maxAbs.toExponential(3)}, maxUlp=${r.maxUlp}`;
  if (extra) msg += ' ' + extra;
  failures.push(label + ': ' + msg);
  console.log('   FAIL ' + label + ': ' + msg);
  return false;
}
function cmp(label, got, want, kind) { return report(label, diff(Array.from(got), Array.from(want), kind || 'f64')); }
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  return report(label, { ok, n: 1, nd: ok ? 0 : 1, first: 0, maxAbs: NaN, maxUlp: 0n, got: [JSON.stringify(got)], want: [JSON.stringify(want)] });
}

// ------------------------------------------------------------------ probes
function probes() {
  const P = META.probes;
  console.log('reference: numpy %s / cv2 %s / python %s', META.numpy, META.cv2, META.python);
  console.log('port: %s / %s / %s / %s\n', PF.version, PF.versionCv2, PF.versionLinalg, PF.versionReconsearch);
  console.log('numpy semantics this module depends on:');
  // log
  const x = unhex64(P.log.x), np = unhex64(P.log.np), cr = unhex64(P.log.cr);
  let crVsCr = 0, crVsNp = 0, mathVsNp = 0, npMis = 0, crVsNpOutsideNpMis = 0;
  for (let i = 0; i < x.length; i++) {
    const c = R._log(x[i]);
    if (!Object.is(c, cr[i])) crVsCr++;
    if (!Object.is(np[i], cr[i])) npMis++;
    if (!Object.is(c, np[i])) { crVsNp++; if (Object.is(np[i], cr[i])) crVsNpOutsideNpMis++; }
    if (!Object.is(Math.log(x[i]), np[i])) mathVsNp++;
  }
  console.log(`  log  ${x.length} args: correctly-rounded port vs exact ${crVsCr} differ; vs np.log ${crVsNp} differ ` +
    `(np.log itself misrounds ${npMis}; port differs elsewhere ${crVsNpOutsideNpMis}); V8 Math.log vs np.log ${mathVsNp} differ`);
  report('probe.log correctly rounded', { ok: crVsCr === 0, n: x.length, nd: crVsCr, first: 0, maxAbs: NaN, maxUlp: 0n, got: [], want: [] });
  report('probe.log == np.log wherever np.log is correctly rounded', { ok: crVsNpOutsideNpMis === 0, n: x.length, nd: crVsNpOutsideNpMis, first: 0, maxAbs: NaN, maxUlp: 0n, got: [], want: [] });
  // pow
  const pw = unhex64(P.pow.np), gp = new Float64Array(pw.length);
  for (let i = 0; i < pw.length; i++) gp[i] = Math.pow(1.025, i);
  cmp('probe.pow 1.025**arange(111)', gp, pw);
  // rounds
  const rx = unhex64(P.round.x);
  cmp('probe.round(np.float64, 2)', Array.from(rx, v => R._npRound(v, 2)), unhex64(P.round.np2));
  cmp('probe.round(np.float64, 4)', Array.from(rx, v => R._npRound(v, 4)), unhex64(P.round.np4));
  cmp('probe.round(float, 4)', Array.from(rx, v => PF.pyRound(v, 4)), unhex64(P.round.py4));
  // floor-div / mod
  const fa = unhex64(P.floordiv.a), fb = unhex64(P.floordiv.b);
  cmp('probe.int // float', Array.from(fa, (v, i) => R._pyFloorDiv(v, fb[i])), unhex64(P.floordiv.q));
  const ma = unhex64(P.mod.a), mb = unhex64(P.mod.b);
  cmp('probe.float % float', Array.from(ma, (v, i) => R._pyMod(v, mb[i])), unhex64(P.mod.r));
  // argsort of 3 float32
  let aok = 0;
  for (const p of P.argsort3) if (JSON.stringify(Array.from(PF.argsort(unhex32(p.v)))) === JSON.stringify(p.np)) aok++;
  report('probe.argsort(3 x float32) stable == numpy', { ok: aok === P.argsort3.length, n: P.argsort3.length, nd: P.argsort3.length - aok, first: 0, maxAbs: NaN, maxUlp: 0n, got: [], want: [] });
  // iteration order of a two-float Python set
  const sa = unhex64(P.set2.a), sb = unhex64(P.set2.b);
  let sok = 0, nflip = 0;
  for (let i = 0; i < sa.length; i++) {
    const o = R._pySetOrder2(sa[i], sb[i]);
    if (JSON.stringify(o) === JSON.stringify(P.set2.order[i])) sok++;
    if (P.set2.order[i].length === 2 && P.set2.order[i][0] !== sa[i]) nflip++;
  }
  console.log(`  set  {a, b} iteration order: ${sok}/${sa.length} match CPython (${nflip} of them iterate b first)`);
  report('probe.set {a, b} iteration order', { ok: sok === sa.length, n: sa.length, nd: sa.length - sok, first: 0, maxAbs: NaN, maxUlp: 0n, got: [], want: [] });
  console.log('  cv2 RNG (reference, recorded): ' + JSON.stringify(P.cv2_rng));
  console.log(`  probes: ${pass} pass, ${fail} fail\n`);
}

// ------------------------------------------------------------------ recorder
function installRecorder() {
  const rec = { axisOf: new WeakMap(), cur: null };
  rec.clear = () => {
    rec.eval_s = { 0: [], 1: [] }; rec.trend = { 0: [], 1: [] }; rec.score = [];
    rec.refine = { 0: [], 1: [] }; rec.build_table = {}; rec.peaks = { 0: [], 1: [] };
    rec.regress = { 0: [], 1: [] }; rec.align = { 0: [], 1: [] }; rec.detect_axis = {};
    rec.etm = { 0: [], 1: [] }; rec.prep = []; rec.trendFn = {};
  };
  rec.clear();
  const O = {
    AxisData: R.AxisData, eval_s: R.AxisData.prototype.eval_s, etm: R.AxisData.prototype.energy_tiles_multi,
    regress: R.AxisData.prototype.phase_regress, coarse: R._coarse_curves, trend_fn: R._trend_fn,
    score: R._score, refine: R._refine, build_table: R._build_table, peaks: R._peaks,
    align: R._align, detect_axis: R._detect_axis, prep: R._prep,
  };
  function AD(ch, axis) { O.AxisData.call(this, ch, axis); rec.axisOf.set(this, axis); }
  AD.prototype = O.AxisData.prototype;
  R.AxisData = AD;
  AD.prototype.eval_s = function (s, dense, nbc) {
    const r = O.eval_s.call(this, s, dense, nbc);
    rec.eval_s[rec.axisOf.get(this)].push([s, !!dense, nbc === undefined ? 1 : nbc, r[0], r[1]]);
    return r;
  };
  AD.prototype.energy_tiles_multi = function (s, phases, nbc) {
    const r = O.etm.call(this, s, phases, nbc), ax = rec.axisOf.get(this);
    if (rec.etm[ax].filter(e => (e.nbc > 1) === (nbc > 1)).length < 3) rec.etm[ax].push({ s, nbc, out: Float64Array.from(r) });
    return r;
  };
  AD.prototype.phase_regress = function (s0, n) {
    const r = O.regress.call(this, s0, n);
    rec.regress[rec.axisOf.get(this)].push([s0, r]);
    return r;
  };
  R._coarse_curves = function (ad, s_list) { rec.cur = ad; return O.coarse(ad, s_list); };
  R._trend_fn = function (s_list, eb) {
    const fn = O.trend_fn(s_list, eb), ax = rec.axisOf.get(rec.cur);
    const g = function (s) { const v = fn(s); rec.trend[ax].push([s, v]); return v; };
    g.inner = fn;
    rec.trendFn[ax] = fn;
    return g;
  };
  R._score = function (eb, er, t) { const r = O.score(eb, er, t); if (rec.score.length < 4000) rec.score.push([eb, er, t, r]); return r; };
  R._refine = function (ad, s0, smax, trend, span, seg) {
    const r = O.refine(ad, s0, smax, trend, span, seg);
    rec.refine[rec.axisOf.get(ad)].push({ in: [s0, smax, span === undefined ? 0.035 : span, !!seg], out: r.slice() });
    return r;
  };
  R._build_table = function (ad, size) {
    const r = O.build_table(ad, size);
    rec.build_table[rec.axisOf.get(ad)] = r[0].map(e => ({ key: e.key, val: e.val.slice() }));
    return r;
  };
  R._peaks = function (s_list, sc, k) { const r = O.peaks(s_list, sc, k); rec.peaks[rec.axisOf.get(rec.cur)].push(r.slice()); return r; };
  R._align = function (ad, s, smax) { const r = O.align(ad, s, smax); rec.align[rec.axisOf.get(ad)].push({ in: [s, smax], out: r.slice() }); return r; };
  R._detect_axis = function (ad, size) {
    const r = O.detect_axis(ad, size);
    rec.detect_axis[rec.axisOf.get(ad)] = { s_ax: r[0], sc_ax: r[1], eb_ax: r[2], cands: r[3] };
    return r;
  };
  rec.orig = O;
  return rec;
}

// ------------------------------------------------------------------ one case
function loadCase(name) {
  const J = JSON.parse(fs.readFileSync(path.join(OUT, name + '.json'), 'utf8'));
  let raw = path.join(ROOT, 'fixtures', 'raw', name + '.rgba');
  if (!fs.existsSync(raw)) raw = path.join(OUT, name + '.rgba');
  const rgba = { d: new Uint8Array(fs.readFileSync(raw)), w: J.w, h: J.h, cn: 4 };
  if (sha(rgba.d) !== J.rgba_sha) throw new Error(name + ': rgba bytes differ from the ones the reference ran on');
  const b = fs.readFileSync(path.join(OUT, name + '.ch.f32'));
  const chRef = { d: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), h: J.ch.shape[0], w: J.ch.shape[1], c: J.ch.shape[2] };
  return { J, rgba, chRef };
}

function checkAxis(tag, ad, A) {
  let ok = true;
  ok = same(tag + '.H W C nbr max_nbc', [ad.H, ad.W, ad.C, ad.nbr, ad.max_nbc], [A.H, A.W, A.C, A.nbr, A.max_nbc]) && ok;
  ok = same(tag + '.r_edges', Array.from(ad.r_edges), A.r_edges) && ok;
  const step = A.sample_step;
  const sampS = Float32Array.from({ length: Math.ceil(ad.S.length / step) }, (_, i) => ad.S[i * step]);
  const sampQ = Float32Array.from({ length: Math.ceil(ad.Q.length / step) }, (_, i) => ad.Q[i * step]);
  ok = report(tag + '.S (sha256 of ' + ad.S.length + ')', diff([sha(ad.S)], [A.S_sha], 'str')) && ok;
  ok = report(tag + '.Q (sha256 of ' + ad.Q.length + ')', diff([sha(ad.Q)], [A.Q_sha], 'str')) && ok;
  ok = cmp(tag + '.S sample', sampS, unhex32(A.S_sample), 'f32') && ok;
  ok = cmp(tag + '.Q sample', sampQ, unhex32(A.Q_sample), 'f32') && ok;
  for (const k of Object.keys(A.seg)) {
    ok = same(tag + '.seg[' + k + '].c_edges', Array.from(ad.seg[k] ? ad.seg[k].c_edges : []), A.seg[k].c_edges) && ok;
    ok = cmp(tag + '.seg[' + k + '].q_t', ad.seg[k] ? ad.seg[k].q_t : [], unhex64(A.seg[k].q_t)) && ok;
  }
  ok = same(tag + '.seg keys', Object.keys(ad.seg), Object.keys(A.seg)) && ok;
  ok = cmp(tag + '.t_sum', [ad.t_sum], unhex64(A.t_sum)) && ok;
  return ok;
}

function evalCalls(C) {
  if (!C) return [];
  const a = unhex64(C.s_eb_er), out = [];
  for (let i = 0; i < C.n; i++) out.push([a[3 * i], C.dense[i], C.nbc[i], a[3 * i + 1], a[3 * i + 2]]);
  return out;
}
/* trend calls: [s, value] to compare, and the reference's np.log(s) at
 * that call kept aside for attribution */
function trendsOf(C) {
  if (!C) return { calls: [], logs: [] };
  const a = unhex64(C.s_v_log), calls = [], logs = [];
  for (let i = 0; i < C.n; i++) { calls.push([a[3 * i], a[3 * i + 1]]); logs.push(a[3 * i + 2]); }
  return { calls, logs };
}
function rowsOf(C, k) { if (!C) return []; const a = unhex64(C.rows), o = []; for (let i = 0; i < C.n; i++) o.push(Array.from(a.subarray(k * i, k * i + k))); return o; }

/* ATTRIBUTION. np.log is the UCRT's log, which is not correctly rounded on
 * about 0.02% of arguments (the probe counts them); the port's log is
 * correctly rounded, so where the UCRT misrounds, a trend value can differ
 * by the log's last bit. That - and only that - is attributed rather than
 * failed, and only when it is PROVEN at the call:
 *   (a) the port used its correctly rounded log (R._npLog(s) === R._log(s):
 *       the log-platform negative control breaks this on purpose),
 *   (b) the reference's recorded np.log(s) differs from that correctly
 *       rounded value - the reference misrounded, not the port,
 *   (c) interpolating with the reference's log instead reproduces the
 *       reference's trend value bit for bit - so nothing else differs.
 * A value computed FROM an attributed value (a _score from that trend, a
 * table entry carrying that score) is attributed only if every differing
 * field is a known (reference -> port) pair and, for _score, the port's
 * _score on the reference's own inputs reproduces the reference.
 * Anything else that differs is a failure. */
const known = [];                 // attributed differences, for the summary
function knownAdd(label, g, w) { known.push({ label, got: g, want: w, abs: Math.abs(g - w) }); }

/* Compare two recorded call sequences element by element: same length, every
 * field bit-identical, unless `attr(i, g, w)` proves the difference is an
 * attributed one (see above). */
function cmpSeq(label, got, want, attr) {
  const n = Math.max(got.length, want.length);
  let nd = 0, first = -1, na = 0;
  for (let i = 0; i < n; i++) {
    const g = got[i], w = want[i];
    let eq = !!g && !!w && g.length === w.length;
    if (eq) for (let j = 0; j < w.length; j++) if (!Object.is(g[j], w[j])) { eq = false; break; }
    if (!eq && attr && g && w && g.length === w.length && attr(i, g, w)) { na++; continue; }
    if (!eq) { nd++; if (first < 0) first = i; }
  }
  const ok = nd === 0 && got.length === want.length;
  values += want.length;
  if (na) console.log(`   note ${label}: ${na} of ${n} calls differ only by an attributed np.log misrounding`);
  if (ok) { pass++; return true; }
  fail++;
  const msg = `${label}: ${nd} of ${n} calls differ (got ${got.length} calls, want ${want.length}); first@${first}: got ${JSON.stringify(got[first])} want ${JSON.stringify(want[first])}`;
  failures.push(msg);
  console.log('   FAIL ' + msg);
  return false;
}
function trendAttr(label, fn, logs, carry) {
  return function (i, g, w) {
    const s = w[0];
    if (!Object.is(g[0], s)) return false;
    const mine = R._log(s);
    if (!Object.is(R._npLog(s), mine)) return false;                 // (a)
    if (Object.is(mine, logs[i])) return false;                      // (b)
    const inner = fn.inner || fn;
    if (!Object.is(PF.interp(logs[i], inner.ls, inner.trend), w[1])) return false;   // (c)
    carry.set(w[1], g[1]);
    knownAdd(label + '[' + i + '] trend(' + s + ')', g[1], w[1]);
    return true;
  };
}
function carriedAttr(label, carry) {       // every differing field is a known pair
  return function (i, g, w) {
    for (let j = 0; j < w.length; j++) {
      if (Object.is(g[j], w[j])) continue;
      if (!carry.has(w[j]) || !Object.is(carry.get(w[j]), g[j])) return false;
    }
    return true;
  };
}
function scoreAttr(label, carry) {         // [eb, er, t, r]: only t (and so r) may differ
  return function (i, g, w) {
    if (!Object.is(g[0], w[0]) || !Object.is(g[1], w[1])) return false;
    if (!carry.has(w[2]) || !Object.is(carry.get(w[2]), g[2])) return false;
    if (!Object.is(pureScore(w[0], w[1], w[2]), w[3])) return false;
    carry.set(w[3], g[3]);
    knownAdd(label + '[' + i + '] score', g[3], w[3]);
    return true;
  };
}

function checkDetect(tag, rec, D, res) {
  const C = D.calls, carry = new Map();
  let ok = true;
  // trend first: it is the only place an attributed difference can start
  for (const a of [0, 1]) {
    const t = tag + '.' + 'xy'[a], tw = trendsOf(C.trend[a]);
    ok = cmpSeq(t + '.trend', rec.trend[a], tw.calls, trendAttr(t + '.trend', rec.trendFn[a], tw.logs, carry)) && ok;
  }
  ok = cmpSeq(tag + '._score', rec.score, rowsOf(C.score, 4), scoreAttr(tag + '._score', carry)) && ok;
  const car = carriedAttr(tag, carry);
  for (const a of [0, 1]) {
    const t = tag + '.' + 'xy'[a];
    ok = cmpSeq(t + '.eval_s', rec.eval_s[a], evalCalls(C.eval_s[a]), car) && ok;
    ok = cmpSeq(t + '._refine', rec.refine[a].map(r => r.in.concat(r.out)), C.refine[a].map(r => r.in.concat(r.out)), car) && ok;
    const bt = C.build_table[a] || [];
    ok = cmpSeq(t + '._build_table', (rec.build_table[a] || []).map(e => [e.key].concat(e.val)), bt.map(e => [e.key].concat(e.val)), car) && ok;
    ok = cmpSeq(t + '._peaks', rec.peaks[a], C.peaks[a], car) && ok;
    ok = cmpSeq(t + '.phase_regress', rec.regress[a], C.regress[a].map(r => [r[0], r[1]]), car) && ok;
    ok = cmpSeq(t + '._align', rec.align[a].map(r => r.in.concat(r.out)), C.align[a].map(r => [r.in[0], r.in[1]].concat(r.out)), car) && ok;
    const da = C.detect_axis[a], ga = rec.detect_axis[a];
    if (da || ga) {
      ok = cmpSeq(t + '._detect_axis', ga ? [[ga.s_ax, ga.sc_ax, ga.eb_ax]].concat(ga.cands) : [],
        da ? [[da.s_ax, da.sc_ax, da.eb_ax]].concat(da.cands) : [], car) && ok;
    }
    const we = C.etm[a] || [], ge = rec.etm[a];
    for (let i = 0; i < Math.max(we.length, ge.length); i++) {
      ok = cmp(t + '.energy_tiles_multi[' + i + '] nbc=' + (we[i] ? we[i].nbc : '?'), ge[i] ? ge[i].out : [], we[i] ? unhex64(we[i].out) : []) && ok;
    }
  }
  if (res) {
    const W = D.result, wc = unhex64(W.candidates), wcs = [];
    for (let i = 0; i < wc.length; i += 2) wcs.push([wc[i], wc[i + 1]]);
    ok = cmpSeq(tag + '.result step_x step_y phase_x phase_y conf_x conf_y',
      [[res.step_x, res.step_y, res.phase_x, res.phase_y, res.conf_x, res.conf_y]],
      [[W.step_x, W.step_y, W.phase_x, W.phase_y, W.conf_x, W.conf_y].map(h => unhex64(h)[0])], car) && ok;
    ok = same(tag + '.result cols rows', [res.cols, res.rows], [W.cols, W.rows]) && ok;
    ok = cmpSeq(tag + '.result candidates', res.candidates, wcs, car) && ok;
  }
  return ok;
}

function runCase(name) {
  const { J, rgba, chRef } = loadCase(name);
  const t0 = Date.now();
  const notes = [];

  // ---- pixels: _prep and its intermediates
  const diag = {};
  const g0 = PF.theRNG(), s0 = [g0.lo, g0.hi];
  const ch = R._prep(rgba, { diag });
  const g1 = [PF.theRNG().lo, PF.theRNG().hi];
  const Q = J.quantize, D = diag.quantize, Pc = J.pca, Dp = diag.pca;
  same('quantize.n_idx / count / k', [D.idx.length, D.count, D.k], [Q.n_idx, Q.count, Q.k]);
  report('quantize.idx (sha256 as int64)', diff([sha(BigInt64Array.from(D.idx, v => BigInt(v)))], [Q.idx_sha], 'str'));
  same('quantize.idx[:64]', Array.from(D.idx.subarray(0, 64)), Q.idx_head);
  cmp('quantize.centers', D.centers, unhex32(Q.centers), 'f32');
  const lab = Uint8Array.from(D.labels);
  if (!report('quantize.labels (sha256)', diff([sha(lab)], [Q.labels_sha], 'str'))) {
    const wl = new Uint8Array(fs.readFileSync(path.join(OUT, name + '.labels.u8')));
    cmp('quantize.labels', lab, wl, 'int');
  }
  cmp('pca.mu', Dp.mu, unhex32(Pc.mu), 'f32');
  cmp('pca.cov', Dp.cov, unhex32(Pc.cov), 'f32');
  cmp('pca.evals', Dp.evals, unhex32(Pc.evals), 'f32');
  cmp('pca.evecs', Dp.evecs, unhex32(Pc.evecs), 'f32');
  same('pca.order', Array.from(Dp.order), Pc.order);
  same('ch shape', [ch.h, ch.w, ch.c], J.ch.shape);
  const chOk = cmp('ch (' + chRef.d.length + ' float32)', ch.d, chRef.d, 'f32');

  // generator scope: a private generator must leave the global one alone
  // and consume exactly what the global path consumed
  PF.setRNGSeed(987654321);
  const before = [PF.theRNG().lo, PF.theRNG().hi];
  const priv = new PF.RNG(1);
  const chP = R._prep(rgba, { rng: priv });
  const after = [PF.theRNG().lo, PF.theRNG().hi];
  same('rng: _prep(rgba, {rng}) leaves PF.theRNG() untouched', after, before);
  same('rng: private and global paths end in the same generator state', [priv.lo, priv.hi], g1);
  report('rng: private-generator _prep returns the same bytes', diff([sha(chP.d)], [sha(ch.d)], 'str'));
  notes.push(`global generator moved by _prep: ${JSON.stringify(s0) !== JSON.stringify(g1)}`);

  // ---- axis / core / detect: on OUR channel stack when it matched,
  // otherwise on the reference's (and say so)
  const chUse = chOk ? ch : chRef;
  const tier = chOk ? '' : '[on reference ch] ';
  if (!chOk) notes.push('ch differs: axis/core/detect below run on the REFERENCE channel stack');
  const ads = [new R.AxisData(chUse, 0), new R.AxisData(chUse, 1)];
  for (const a of [0, 1]) checkAxis(tier + 'axis.' + 'xy'[a], ads[a], J.axis[a]);
  cmp(tier + '_s_grid(W)', R._s_grid(J.w), unhex64(J.s_grid.W));
  cmp(tier + '_s_grid(H)', R._s_grid(J.h), unhex64(J.s_grid.H));

  // core.py _build_recon, then every call core.detect made
  const coreTrend = {};
  for (const [a, extent] of [[0, J.w], [1, J.h]]) {
    const CB = J.core_build[a], t = tier + 'core_build.' + 'xy'[a];
    const sl = R._s_grid(extent).filter((_, i) => i % 3 === 0);
    cmp(t + '.s_list', sl, unhex64(CB.s_list));
    const ce = R._coarse_curves(ads[a], sl);
    cmp(t + '.eb', ce[0], unhex64(CB.eb));
    cmp(t + '.er', ce[1], unhex64(CB.er));
    const tf = R._trend_fn(sl, ce[0]);
    cmp(t + '.ls', tf.ls, unhex64(CB.ls));
    cmp(t + '.trend', tf.trend, unhex64(CB.trend));
    coreTrend[a] = tf;
  }
  const CC = J.core.calls, coreCarry = new Map();
  let coreCalls = 0;
  for (const a of [0, 1]) {
    const want = evalCalls(CC.eval_s[a]);
    const got = want.map(c => { const r = ads[a].eval_s(c[0], c[1], c[2]); return [c[0], c[1], c[2], r[0], r[1]]; });
    coreCalls += want.length;
    if (want.length) cmpSeq(tier + 'core.' + 'xy'[a] + '.eval_s replay', got, want);
    const tw = trendsOf(CC.trend[a]);
    coreCalls += tw.calls.length;
    if (tw.calls.length) {
      const lbl = tier + 'core.' + 'xy'[a] + '.trend replay';
      cmpSeq(lbl, tw.calls.map(p => [p[0], coreTrend[a](p[0])]), tw.calls, trendAttr(lbl, coreTrend[a], tw.logs, coreCarry));
    }
  }
  const sw = rowsOf(CC.score, 4);
  coreCalls += sw.length;
  if (sw.length) cmpSeq('core._score replay', sw.map(r => [r[0], r[1], r[2], R._score(r[0], r[1], r[2])]), sw);
  notes.push(`core.detect(full) -> ${J.core.consensus}: ${coreCalls} calls into reconsearch replayed`);

  // ---- R.detect end to end, every internal call recorded
  const rec = installRecorder();
  if (!chOk) R._prep = function () { return chRef; };
  const t1 = Date.now();
  const res = R.detect(rgba);
  const dt = Date.now() - t1;
  checkDetect(tier + 'detect', rec, J.detect, res);
  const nEval = rec.eval_s[0].length + rec.eval_s[1].length;
  notes.push(`detect: ${nEval} eval_s, ${rec.trend[0].length + rec.trend[1].length} trend, ${rec.refine[0].length + rec.refine[1].length} _refine, ` +
    `${rec.regress[0].length + rec.regress[1].length} phase_regress calls; ${res.cols}x${res.rows} step (${res.step_x}, ${res.step_y}); ` +
    `${dt} ms (python ${J.detect.seconds} s)`);
  // the reference's own in-process repeat
  same('python: _prep repeated after core+detect is identical', [J.prep_repeat_identical], [true]);

  const ok = fail === 0;
  if (known.length) {
    let mx = 0, mr = 0;
    for (const k of known) { mx = Math.max(mx, k.abs); mr = Math.max(mr, k.abs / Math.abs(k.want)); }
    notes.push(`NOT BIT-EXACT: ${known.length} value(s) differ, each traced to np.log(s) misrounding in the ` +
      `reference's UCRT (max |diff| ${mx.toExponential(3)}, max rel ${mr.toExponential(3)}): ` + known.map(k => k.label).join('; '));
  }
  console.log((!ok ? 'FAIL ' : known.length ? 'ok*  ' : 'ok   ') + name.padEnd(16) + `${J.w}x${J.h} C=${J.ch.shape[2]} ` +
    `${pass} checks pass, ${fail} fail, ${values} values compared, ${Date.now() - t0} ms`);
  for (const n of notes) console.log('       ' + n);
  return ok;
}

// ------------------------------------------------------------------ main
function forkAll(names, env) {
  const results = {};
  for (const n of names) {
    const r = spawnSync(process.execPath, [__filename, n], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), maxBuffer: 64 << 20 });
    const lines = (r.stdout || '').split('\n').filter(l => /^(ok|FAIL)|^ {7}|^ {3}(FAIL|note)/.test(l));
    results[n] = { status: r.status, lines, stderr: r.stderr, exact: lines.some(l => l.startsWith('ok   ')) };
  }
  return results;
}

const arg = process.argv[2];
if (arg && arg !== '--controls') {
  process.exit(runCase(arg) ? 0 : 1);
} else if (arg === '--controls') {
  /* Each control flips ONE measured semantic to its obvious rival. It must
   * turn at least one case red, and the header says which cases it cannot
   * reach (those should SURVIVE - a control that reddens everything proves
   * less than one that reddens exactly what it touches). */
  const plan = [
    ['enrow-pairwise', 'every case (the coarse scan runs nbc=1 energies everywhere)'],
    ['cumsum-f64', 'every case but synth_2color, whose channels are +-78.2576 / +-1.8e-7 in a checkerboard: ' +
      'its float32 and float64 cumsums agree on 8192/8192 entries (measured), so nothing can differ there'],
    ['alpha-scale-f64', 'only synth_alpha: a/255 is exact in either dtype at a = 0 and 255'],
    ['log-platform', 'wherever a V8-misrounded log reaches an output'],
  ];
  const names = META.cases;
  let bad = 0;
  for (const [c, expect] of plan) {
    const res = forkAll(names, { PF_RS_CONTROL: c });
    const red = names.filter(n => res[n].status !== 0), green = names.filter(n => res[n].status === 0);
    console.log(`control ${c.padEnd(16)} red on ${red.length}/${names.length}: ${red.join(' ') || '-'}`);
    console.log(`  ${''.padEnd(22)} green: ${green.join(' ') || '-'}   (expected: ${expect})`);
    if (!red.length) { console.log('  -> NOT DISCRIMINATED by these fixtures'); }
    if (c !== 'log-platform' && !red.length) bad++;
  }
  process.exit(bad ? 1 : 0);
} else {
  probes();
  const probeFail = fail;
  const res = forkAll(META.cases);
  let bad = 0;
  for (const n of META.cases) {
    process.stdout.write(res[n].lines.join('\n') + '\n');
    if (res[n].status !== 0) { bad++; if (!res[n].lines.length) process.stdout.write(res[n].stderr); }
  }
  const exact = META.cases.filter(n => res[n].exact);
  const traced = META.cases.filter(n => res[n].status === 0 && !res[n].exact);
  console.log(`\n${exact.length}/${META.cases.length} cases bit-exact on every recorded call and result; ` +
    `${traced.length} exact except values traced to np.log misrounding (${traced.join(' ') || '-'}); ` +
    `${bad} failed; probes ${probeFail ? probeFail + ' FAILED' : 'all pass'}`);
  process.exit(bad || probeFail ? 1 : 0);
}
