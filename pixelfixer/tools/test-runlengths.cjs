/* Node parity test for src/pf-21-runlengths.js against fixtures/runlengths-parity.json.
 *
 * Every comparison is BIT-EXACT on the raw bytes (float32 or float64 as the
 * reference produced them). A miss prints the element count, max abs
 * difference and max ulp distance so its size is visible, not just its
 * existence. The "diag_" sections of the fixture are used only to locate a
 * miss, never to pass a case.
 *
 * Ends with negative controls: three measured numpy semantics are flipped to
 * their "obvious" reading through PF.runlengths._semantics and the test must
 * go RED on each, which is what makes its green mean something.
 *
 *   node tools/test-runlengths.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
for (const f of ['pf-00-base.js', 'pf-01-fft.js', 'pf-02-scipy.js', 'pf-03-cv2.js', 'pf-21-runlengths.js']) {
  (0, eval)(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));   // as a browser <script> would
}
const PF = globalThis.PF;
const RL = PF.runlengths;

const FIX = path.join(ROOT, 'fixtures', 'runlengths-parity.json');
const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('fixtures: numpy %s / cv2 %s / python %s (%s)', data.meta.numpy, data.meta.cv2, data.meta.python, data.meta.machine);
console.log('port: %s / %s / %s\n', PF.version, PF.versionCv2, PF.versionRunlengths);

// ------------------------------------------------------------------ helpers
function unhexU8(hex) { return new Uint8Array(Buffer.from(hex, 'hex')); }
function unhexF32(hex) {
  const buf = Buffer.from(hex, 'hex'), out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}
function unhexF64(hex) {
  const buf = Buffer.from(hex, 'hex'), out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
  return out;
}
function scalar64(hex) { return hex === null ? null : unhexF64(hex)[0]; }
const i32 = new Int32Array(1), f32v = new Float32Array(i32.buffer);
function ulp32(x) { f32v[0] = x; const b = i32[0]; return b < 0 ? -2147483648 - b : b; }
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
function ulp64(x) { f64v[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }

function compare(got, want, kind) {
  if (got.length !== want.length) return { ok: false, lenMismatch: true, ndiff: -1, got: got.length, want: want.length };
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

let pass = 0, fail = 0, values = 0;
const failures = [];
function report(label, r, extra) {
  values += r.n || 0;
  if (r.ok) { pass++; return true; }
  fail++;
  let msg;
  if (r.lenMismatch) msg = `length ${r.got} != ${r.want}`;
  else msg = `${r.ndiff}/${r.n} differ, first@${r.first}, maxAbs=${r.maxAbs.toExponential(3)}, maxUlp=${r.maxUlp}`;
  failures.push(label + ': ' + msg + (extra ? ' ' + extra : ''));
  console.log('   FAIL ' + label + ': ' + msg + (extra ? ' ' + extra : ''));
  return false;
}
function cmpScalar(label, got, want, kind) {
  if (got === null || want === null) {
    const ok = got === want;
    return report(label, { ok, ndiff: ok ? 0 : 1, n: 1, first: 0, maxAbs: NaN, maxUlp: 0n }, ok ? '' : `got ${got} want ${want}`);
  }
  return report(label, compare([got], [want], kind), `got ${got} want ${want}`);
}
function cmpInt(label, got, want) {
  const ok = got === want;
  return report(label, { ok, ndiff: ok ? 0 : 1, n: 1, first: 0, maxAbs: Math.abs(got - want), maxUlp: 0n }, ok ? '' : `got ${got} want ${want}`);
}
function cmpIntArray(label, got, want) {
  return report(label, compare(Array.from(got), want, 'int'));
}
function cmpCands(label, got, wantHex) {
  let ok = got.length === wantHex.length;
  const gs = [], gv = [], ws = [], wv = [];
  for (let i = 0; i < Math.min(got.length, wantHex.length); i++) {
    gs.push(got[i][0]); gv.push(got[i][1]);
    ws.push(scalar64(wantHex[i][0])); wv.push(scalar64(wantHex[i][1]));
  }
  if (!ok) return report(label, { ok: false, lenMismatch: true, got: got.length, want: wantHex.length, n: 0 });
  const a = report(label + '.s', compare(gs, ws, 'f64'));
  const b = report(label + '.S', compare(gv, wv, 'f64'));
  return a && b;
}

const S_GRID = PF.arange(RL.S_MIN, RL.S_MAX, 0.01);
report('meta.s_grid (np.arange(2.05, 26, 0.01))', compare(S_GRID, unhexF64(data.meta.s_grid_f64), 'f64'));
cmpInt('meta.nb(0.25)', RL._hist(new Float32Array([3]), 0.25).nb, data.meta.nb_025);
cmpInt('meta.nb(0.05)', RL._hist(new Float32Array([3]), 0.05).nb, data.meta.nb_005);

// ------------------------------------------------------------------ images
function histCheck(label, runs, bw, want) {
  const h = RL._hist(runs, bw);
  const a = cmpIntArray(label + '.hist', h.hist, want.hist);
  const b = report(label + '.centers', compare(h.centers, unhexF32(want.centers_f32), 'f32'));
  return a && b;
}

console.log('images:');
const tieNotes = [];
for (const c of data.images) {
  const t0 = Date.now();
  const rgba = { d: unhexU8(c.rgba_u8), w: c.w, h: c.h, cn: 4 };
  const img4 = RL._prep(rgba);
  report(`${c.name}._prep`, compare(img4.d, unhexF32(c.img4_f32), 'f32'));
  for (const an of ['x', 'y']) {
    const ax = c.axes[an], L = `${c.name}.${an}`;
    const b = RL._boundaries(img4, ax.axis);
    const okYs = cmpIntArray(`${L}._boundaries.ys`, b.ys, ax.ys);
    const okPos = report(`${L}._boundaries.pos`, compare(b.pos, unhexF64(ax.pos_f64), 'f64'));
    if (!(okYs && okPos) && ax.diag_boundaries) {
      // locate: the boxFiltered gradient and the threshold
      const dg = ax.diag_boundaries;
      console.log(`      diag: reference thr=${dg.thr} p95=${scalar64(dg.p95_f64)} n_mask=${dg.n_mask}`);
    }
    // downstream functions take the REFERENCE's upstream output, so a miss
    // upstream cannot hide a second, independent miss downstream
    const ys = new Int32Array(ax.ys), pos = unhexF64(ax.pos_f64);
    const runs = RL._lag_diffs(ys, pos);
    report(`${L}._lag_diffs`, compare(runs, unhexF32(ax.runs_f32), 'f32'));
    const runsRef = unhexF32(ax.runs_f32);
    histCheck(`${L}._hist(0.25)`, runsRef, 0.25, ax['hist_0.25']);
    histCheck(`${L}._hist(0.05)`, runsRef, 0.05, ax['hist_0.05']);
    const cs = RL._comb_score(runsRef, S_GRID);
    report(`${L}._comb_score.S`, compare(cs.S, unhexF64(ax.comb_S_f64), 'f64'));
    cmpScalar(`${L}._comb_score.total`, cs.total, ax.comb_total, 'f64');
    const pk = RL._pick_step(runsRef, S_GRID);
    cmpScalar(`${L}._pick_step.s`, pk.s, scalar64(ax.pick.s_f64), 'f64');
    cmpScalar(`${L}._pick_step.v`, pk.v, scalar64(ax.pick.v_f64), 'f64');
    cmpCands(`${L}._pick_step.cands`, pk.cands, ax.pick.cands_f64);
    const dp = ax.diag_pick;
    if (dp && dp.n_locmax !== undefined) {
      tieNotes.push(`${L}: ${dp.n_locmax} local maxima, scores distinct=${dp.locmax_scores_distinct}, numpy default argsort == stable: ${dp.default_argsort_equals_stable}`);
    }
    if (ax.pick.s_f64 !== null) {
      const sRef = scalar64(ax.pick.s_f64);
      const r = RL._refine(runsRef, sRef);
      if (!cmpScalar(`${L}._refine`, r, scalar64(ax.refine_f64), 'f64') && ax.diag_refine) {
        const d = ax.diag_refine;
        console.log(`      diag: reference fine_len=${d.fine_len} argmax=${d.argmax} stages=${d.stages_f64.map(scalar64)}`);
      }
    }
    for (const it of ax.integrate) {
      const s0 = scalar64(it.s0_f64);
      const got = RL._integrate_step(ys, pos, it.n_perp, it.n_scan, s0);
      if (!cmpScalar(`${L}._integrate_step(s0=${s0})`, got, scalar64(it.out_f64), 'f64')) {
        // locate the tile: re-run the tiling with the port's pieces
        let k = 0;
        for (const [tp, tsc] of RL.TILINGS) {
          const ye = PF.linspace(0, it.n_perp, tp + 1), xe = PF.linspace(0, it.n_scan, tsc + 1);
          for (let i = 0; i < tp; i++) for (let j = 0; j < tsc; j++) {
            const ysA = [], posA = [];
            for (let q = 0; q < pos.length; q++) {
              if (ys[q] >= ye[i] && ys[q] < ye[i + 1] && pos[q] >= xe[j] && pos[q] < xe[j + 1]) { ysA.push(ys[q]); posA.push(pos[q]); }
            }
            const dd = RL._lag_diffs(new Int32Array(ysA), new Float64Array(posA));
            const p = RL._tile_peak(dd, s0);
            const ref = it.diag_tiles[k++];
            if (dd.length !== ref.ndiffs || !Object.is(p, ref.peak === null ? null : scalar64(ref.peak_f64))) {
              console.log(`      diag tile ${tp}x${tsc} (${i},${j}): port ndiffs=${dd.length} peak=${p}  ref ndiffs=${ref.ndiffs} peak=${ref.peak}`);
            }
          }
        }
      }
    }
  }
  // detect: end to end from the raw image
  const det = RL.detect(rgba);
  const want = c.detect, wh = c.detect_hex;
  cmpIntArray(`${c.name}.detect.keys`, Object.keys(det).sort().map(k => c.detect_keys.indexOf(k)), c.detect_keys.map((_, i) => i));
  for (const k of ['step_x', 'step_y', 'phase_x', 'phase_y', 'score_x', 'score_y']) {
    if (k in want) cmpScalar(`${c.name}.detect.${k}`, det[k], scalar64(wh[k]), 'f64');
  }
  for (const k of ['cols', 'rows', 'nruns_x', 'nruns_y']) {
    if (k in want) cmpInt(`${c.name}.detect.${k}`, det[k], want[k]);
  }
  cmpCands(`${c.name}.detect.candidates`, det.candidates, wh.candidates);
  console.log(`   ${c.name.padEnd(22)} ${String(c.w).padStart(4)}x${String(c.h).padEnd(4)} step=(${det.step_x}, ${det.step_y}) cols/rows=(${det.cols}, ${det.rows})  ${((Date.now() - t0) / 1000).toFixed(2)}s`);
}

// ------------------------------------------------------------------ arrays
console.log('arrays:');
for (const c of data.arrays) {
  const runs = unhexF32(c.runs_f32), L = c.name;
  histCheck(`${L}._hist(0.25)`, runs, 0.25, c['hist_0.25']);
  histCheck(`${L}._hist(0.05)`, runs, 0.05, c['hist_0.05']);
  const cs = RL._comb_score(runs, S_GRID);
  report(`${L}._comb_score.S`, compare(cs.S, unhexF64(c.comb.S_f64), 'f64'));
  cmpScalar(`${L}._comb_score.total`, cs.total, c.comb.total, 'f64');
  const pk = RL._pick_step(runs, S_GRID);
  cmpScalar(`${L}._pick_step.s`, pk.s, scalar64(c.pick.s_f64), 'f64');
  cmpScalar(`${L}._pick_step.v`, pk.v, scalar64(c.pick.v_f64), 'f64');
  cmpCands(`${L}._pick_step.cands`, pk.cands, c.pick.cands_f64);
  const dp = c.diag_pick;
  if (dp && dp.n_locmax !== undefined) {
    tieNotes.push(`${L}: ${dp.n_locmax} local maxima, scores distinct=${dp.locmax_scores_distinct}, numpy default argsort == stable: ${dp.default_argsort_equals_stable}`);
  }
  for (const r of c.refine) {
    const s0 = scalar64(r.s0_f64);
    if (!cmpScalar(`${L}._refine(s0=${s0})`, RL._refine(runs, s0), scalar64(r.out_f64), 'f64') && r.diag) {
      console.log(`      diag: reference fine_len=${r.diag.fine_len} argmax=${r.diag.argmax} stages=${r.diag.stages_f64.map(scalar64)}`);
    }
  }
  for (const t of c.tile_peak) {
    const s0 = scalar64(t.s0_f64);
    cmpScalar(`${L}._tile_peak(s0=${s0})`, RL._tile_peak(runs, s0), scalar64(t.out_f64), 'f64');
  }
  console.log(`   ${L.padEnd(18)} n=${String(c.n).padEnd(5)} pick s=${pk.s} v=${pk.v.toFixed(4)}`);
}
{
  const ld = data.lag_diffs, ys = new Int32Array(ld.ys), pos = unhexF64(ld.pos_f64);
  for (const c of ld.cases) {
    const got = c.max_lag === null ? RL._lag_diffs(ys, pos) : RL._lag_diffs(ys, pos, c.max_lag);
    report(`_lag_diffs(max_lag=${c.max_lag})`, compare(got, unhexF32(c.out_f32), 'f32'));
  }
}

// ------------------------------------------------------------------ np.cos
console.log('np.cos vs Math.cos:');
{
  const args = unhexF64(data.cos.args_f64), want = unhexF64(data.cos.cos_f64);
  const got = new Float64Array(args.length);
  for (let i = 0; i < args.length; i++) got[i] = Math.cos(args[i]);
  const r = compare(got, want, 'f64');
  const rr = compare(got.subarray(0, data.cos.n_random), want.subarray(0, data.cos.n_random), 'f64');
  const rc = compare(got.subarray(data.cos.n_random), want.subarray(data.cos.n_random), 'f64');
  report('np.cos == Math.cos', r);
  console.log(`   random args: ${rr.ndiff}/${rr.n} differ (maxUlp ${rr.maxUlp});  tiny comb args: ${rc.ndiff}/${rc.n} differ (maxUlp ${rc.maxUlp})`);
}

// --------------------------------------------------------- negative controls
console.log('\nnegative controls (each must go RED):');
const SEM = RL._semantics;
function control(name, flag, fn) {
  const before = fail;
  SEM[flag] = false;
  let red = 0, total = 0;
  try {
    const out = fn();
    red = out.red; total = out.total;
  } finally {
    SEM[flag] = true;
  }
  fail = before;   // the control's own reds are not port failures
  failures.length = failures.length;   // (kept as printed above)
  const ok = red > 0;
  if (!ok) { fail++; failures.push(`negative control ${name} did NOT go red`); }
  else pass++;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${name}: ${red}/${total} comparisons went red with ${flag}=false`);
}
function overImages(f) {
  let red = 0, total = 0;
  for (const c of data.images) for (const an of ['x', 'y']) {
    const ax = c.axes[an];
    const runs = unhexF32(ax.runs_f32);
    if (runs.length === 0) continue;
    total++;
    if (!f(ax, runs)) red++;
  }
  return { red, total };
}
// silence the FAIL lines while a control runs
const realLog = console.log;
function quiet(fn) { console.log = () => {}; try { return fn(); } finally { console.log = realLog; } }
control('2*pi*centers in float64 -> comb S', 'twoPiFloat32', () => quiet(() => overImages((ax, runs) => {
  const cs = RL._comb_score(runs, S_GRID);
  return compare(cs.S, unhexF64(ax.comb_S_f64), 'f64').ok;
})));
control('float64 accumulation in _refine LS', 'sumFloat32', () => quiet(() => overImages((ax, runs) => {
  if (ax.pick.s_f64 === null) return true;
  return Object.is(RL._refine(runs, scalar64(ax.pick.s_f64)), scalar64(ax.refine_f64));
})));
control('64/bin bins instead of int(64/bin)+1 -> hist', 'histNbPlusOne', () => quiet(() => overImages((ax, runs) => {
  const h = RL._hist(runs, 0.25);
  return compare(h.hist, ax['hist_0.25'].hist, 'int').ok && compare(h.centers, unhexF32(ax['hist_0.25'].centers_f32), 'f32').ok;
})));

// ------------------------------------------------------------------ summary
console.log('\nargsort tie audit (numpy default kind vs stable, per _pick_step call):');
for (const n of tieNotes) console.log('   ' + n);
console.log(`\ncomparisons: ${pass + fail}   pass: ${pass}   fail: ${fail}`);
console.log(`individual value comparisons (bitwise): ${values}`);
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log('   ' + f); }
process.exitCode = fail ? 1 : 0;
