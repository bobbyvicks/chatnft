/* Node parity test for src/pf-31-channels-b.js (channels.py lines 817-1631)
 * against fixtures/channels-b-parity.json + fixtures/raw/channels-b/<case>.json,
 * written by tools/parity-channels-b.py from the REFERENCE'S OWN CALL PATH.
 *
 * Every float is compared on its raw bits (Object.is on typed arrays, or the
 * float64 hex); big integer maps by sha256 of their bytes, with a per-row
 * digest to say WHERE they differ.
 *
 * SECTIONS
 *   pyhash       CPython float hash + set iteration order (the tie rule of
 *                _evidence_refine_step) against Python's own hash()/set.
 *   replay       THIS HALF IN ISOLATION. Everything it calls in the first
 *                half (pf-30) and in varcontrast (pf-23) is replaced by the
 *                reference's recorded answers - _normalise included - so a
 *                red here is this file's fault and nobody else's. Each
 *                function runs on the reference's recorded inputs; fit_grid
 *                runs end to end on the recorded answers, and every stub
 *                checks the QUESTION it is asked (a JS step the reference
 *                never evaluated is a failure, not a lookup miss), and that
 *                every question the reference asked was asked here too.
 *   integration  The same fits with the REAL pf-30 and pf-23 ports (only
 *                k-means is fed the reference's quantized image). A red here
 *                with a green replay is a first-half / varcontrast issue.
 *   e2e          fit_grid(rgba) exactly as a caller makes it - real
 *                medianBlur, real k-means - ONE CASE PER PROCESS, because
 *                k-means runs on OpenCV's process-global RNG (README).
 *
 *   node tools/test-channels-b.cjs [--case NAME] [--sections replay,...]
 *   node tools/test-channels-b.cjs --mutants
 *        re-runs the replay on one-literal mutants of pf-31-channels-b.js,
 *        mutated IN MEMORY (src/ is never written), and requires each to go
 *        red: the proof that the green above can be red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const RAW = path.join(ROOT, 'fixtures', 'raw', 'channels-b');
const INDEX = path.join(ROOT, 'fixtures', 'channels-b-parity.json');

const argv = process.argv.slice(2);
function opt(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
const ONLY = opt('--case');
const E2E_ONE = opt('--e2e-one');
const MUTANT = opt('--mutant');
const QUIET = argv.includes('--quiet');
let SECTIONS = (opt('--sections') || 'pyhash,replay,integration,e2e').split(',');

/* One literal each; every one should turn the replay red. Last run
 * (2026-09-27, 44 cases): 39/42 red. The three that SURVIVE, and why:
 *   #7  refine_positions_per_band last-max: a tie needs two candidates
 *       with bit-equal scores; with equal profile values the penalty's
 *       minimum (3c + 4m) / 7 cannot sit exactly between two integers when
 *       m is a multiple of 0.5. ARGUED, not proven for unequal values.
 *   #15 structural guard 0.30 -> 0.31: no reference occupancy on any case
 *       falls in [0.30, 0.31). Not load-bearing on this data.
 *   #27 overlay (1 - alpha) in float64: moves float32 intermediates only;
 *       the uint8 truncation at the end erases it on every pixel measured. */
const MUTANTS = [
  ['var z = (w[i] - t) / step;\n        gain[i] = norm[w[i]] - anchor * (z * z);', 'var z = (w[i] - t) / step;\n        gain[i] = norm[w[i]] - anchor * 1.01 * (z * z);', 'lattice_dp anchor penalty'],
  ['if (j === 0 || !(tr <= mp)) { mp = tr; mj = j; }   // first maximum', 'if (j === 0 || !(tr < mp)) { mp = tr; mj = j; }   // first maximum', 'lattice_dp argmax takes the LAST maximum'],
  ["if (targets[0] < n - targets[targets.length - 1]) targets.shift();", "if (targets[0] <= n - targets[targets.length - 1]) targets.shift();", 'lattice_dp trim tie goes to the front'],
  ['e -= 0.08 * Math.abs(c - r);', 'e -= 0.09 * Math.abs(c - r);', '_axis_chain count penalty 0.08 -> 0.09'],
  ["e -= 0.30 * PF.std(sp) / pyMax(PF.mean(sp), 1e-9);", "e -= 0.31 * PF.std(sp) / pyMax(PF.mean(sp), 1e-9);", '_axis_chain regularity 0.30 -> 0.31'],
  ['t = fr(X[p + sx + c] - X[p + c]);', 't = X[p + sx + c] - X[p + c];', 'band_profiles: cut difference in float64'],
  ['seg = PF.sumAxes(d.subarray(b0 * dw, (b0 + rows) * dw), [rows, dw], 0).d;', 'seg = PF.sumAxes(Float64Array.from(d.subarray(b0 * dw, (b0 + rows) * dw)), [rows, dw], 0).d;', 'band_profiles: row-band sum accumulated in float64'],
  ['if (cc === lo || !(sc <= mp)) { mp = sc; mi = cc; }', 'if (cc === lo || !(sc < mp)) { mp = sc; mi = cc; }', 'refine_positions_per_band argmax takes the LAST maximum'],
  ['var dev = Math.max(1, rint(step * dev_ratio));', 'var dev = Math.max(1, Math.round(step * dev_ratio));', 'refine_positions_per_band: Math.round instead of half-to-even'],
  ['pos = PF.maximum_accumulate(pos, [B, K], 1);', 'pos = pos;', 'refine_positions_per_band without the monotone pass'],
  ["for (y = 0; y < length; y++) out[k * length + y] = iv[y];   // float64 -> float32", "for (y = 0; y < length; y++) out[k * length + y] = Math.round(iv[y] * 8) / 8;   // float64 -> float32", '_rasterise_cuts quantises the interpolation'],
  ["for (x = 0; x < extent; x++) out[i * extent + x] = PF.clipScalar(idx[x] - 1, 0, nc - 2);", "for (x = 0; x < extent; x++) out[i * extent + x] = PF.clipScalar(idx[x] - 1, 0, nc - 1);", '_index_map_from_cuts clip bound'],
  ["cuts[b * W + 1 + j] = (band_knots.d[b * K + j] + band_knots.d[b * K + j + 1]) / 2.0 + 0.5;", "cuts[b * W + 1 + j] = (band_knots.d[b * K + j] + band_knots.d[b * K + j + 1]) / 2.0;", '_knot_cuts_per_band without the +0.5'],
  ['if (m > 0.3 * s_small) excl.push(pos[i]);', 'if (m > 0.25 * s_small) excl.push(pos[i]);', '_exclusive_slot_occupancy exclusivity 0.3 -> 0.25'],
  ["if (gz < 1.8 && tz < 3.0) continue;", "if (gz < 1.9 && tz < 3.0) continue;", 'estimate_period_ev small-step gate 1.8 -> 1.9'],
  ['if (occ < 0.30) {', 'if (occ < 0.31) {', 'estimate_period_ev structural guard 0.30 -> 0.31'],
  ["refined.push(C._evidence_refine_step(ev, s0, true));", "refined.push(C._evidence_refine_step(ev, s0, false));", 'estimate_period_ev: coarse seeds treated as Python floats (round kind)'],
  ["var order = PF._scipyInternals.argsortNumpy(negc);    // np.argsort(-coarse), numpy's default kind", "var order = PF.argsort(negc);    // np.argsort(-coarse), numpy's default kind", 'estimate_period_ev: stable argsort instead of numpy default'],
  ["good = stableSortBy(good, function (x) { return x[0]; });", "good = stableSortBy(good, function (x) { return -x[1]; });", 'estimate_period_ev: good sorted by score, not step'],
  ['score *= 0.5;', 'score *= 0.51;', 'estimate_period_ev jpeg deflation'],
  ["if (b[0] === null || (a[0] !== null && a[1] >= b[1])) return [a[0], a[1], 'cut', a[2], a[3]];", "if (b[0] === null || (a[0] !== null && a[1] > b[1])) return [a[0], a[1], 'cut', a[2], a[3]];", 'estimate_axis_ev tie goes to knot'],
  ["if (step_x !== null && score_x < min_score) step_x = null;", "if (step_x !== null && score_x < min_score * 1.5) step_x = null;", 'fit_grid min_score gate'],
  ["if (1.04 < ratio && ratio <= 1.35) {", "if (1.0 < ratio && ratio <= 1.35) {", 'fit_grid mild square prior band'],
  ["if (bq > pyMax(cur_q * 2.0, cur_q + 0.05) && bq > 0.05) {", "if (bq > pyMax(cur_q * 1.2, cur_q + 0.05) && bq > 0.05) {", 'fit_grid pair-switch dominance 2.0 -> 1.2'],
  ["var rx = roundNd(step_x, 3, sxNp), ry = roundNd(step_y, 3, syNp);", "var rx = roundNd(step_x, 2, sxNp), ry = roundNd(step_y, 2, syNp);", 'fit_grid pair keys rounded to 2 places'],
  ["var n_bands_y = (allow_warp && is_periodic) ? Math.trunc(PF.clipScalar(h / (step_y * 8), 1, 12)) : 1;", "var n_bands_y = (allow_warp && is_periodic) ? Math.trunc(PF.clipScalar(h / (step_y * 7), 1, 12)) : 1;", 'fit_grid warp band count'],
  ['step_x = pyMax(step_x, w / max_output);', 'step_x = pyMax(step_x, w / (max_output + 1));', 'fit_grid max_output clamp'],
  ['var A = fr(1 - alpha), Al = fr(alpha);', 'var A = 1 - alpha, Al = fr(alpha);', 'render_grid_overlay (1 - alpha) in float64'],
  ['if (isNp) return rint(x * P10[nd]) / P10[nd];', 'if (isNp) return PF.pyRound(x, nd);', 'round(np.float64, n) done as Python round'],
  ['for (i = 0; i < 61; i++) x[(i + r) % 61] = m[i];', 'for (i = 0; i < 61; i++) x[(i + r + 1) % 61] = m[i];', 'float hash rotation off by one'],
  ['var lg = (D <= NPLOG_2D1.length) ? NPLOG_2D1[D - 1] : PF.log(2 * D + 1);', 'var lg = Math.log(2 * D + 1);', '_chain_energy_z with the platform log'],
  // (was: the knot guard `< 2` -> `< 1`. EQUIVALENT - one knot has no
  // midpoints, so both spellings return [0, extent]; replaced by the next.)
  ['var sum = positions[i] + positions[i + 1] + 1;', 'var sum = positions[i] + positions[i + 1];', 'chain_to_cuts knot midpoint rounds down'],
  // the branches only the branch-targeted cases reach
  ['phase_x = ev.score(step_x)[1];', 'phase_x = ev.score(step_x)[0];', 'fit_grid: borrowed x takes a score as its phase'],
  ['if (sc >= 0.55 * [score_x, score_y][b]) {', 'if (sc >= 0.75 * [score_x, score_y][b]) {', 'fit_grid harmonic adoption 0.55 -> 0.75'],
  ['if (best[1] >= 0.45 * own_score) {', 'if (best[1] >= 4.5 * own_score) {', 'fit_grid cross-axis jpeg arbitration never adopts'],
  ['r = vc.contrast(vc_best[0], undefined, 12);', 'r = vc.contrast(vc_best[0], undefined, 3);', 'fit_grid square-packer fallback asks 3 phases, not 12'],
  ['var target = target_cells || 128;', 'var target = 128;', 'fit_grid ignores target_cells'],
  ['if (step_x <= 1.05 && step_y <= 1.05) {', 'if (step_x < 1.0 && step_y < 1.0) {', 'fit_grid identity-grid threshold'],
  ['if (sc_sub >= pyMax(harmonic_tol * score, 3.0) &&', 'if (sc_sub >= pyMax(0.95 * score, 3.0) &&', 'estimate_period_ev divisor tolerance 0.88 -> 0.95'],
  ['if (step < top[0] - 0.6) {', 'if (step < top[0] - 6.0) {', 'estimate_period_ev structural guard margin'],
  ['var near_int = Math.abs(ratio - rint(ratio)) < 0.12 * ratio;', 'var near_int = Math.abs(ratio - rint(ratio)) < 0.2 * ratio;', 'fit_grid wild square prior: near-integer band'],
  ['phase_x = best[1]; mode_x = best[2]; sxNp = sNp;', 'phase_x = 0; mode_x = best[2]; sxNp = sNp;', 'fit_grid mild prior drops the adopted phase (x)'],
];

// ------------------------------------------------------------------ load
/* --srcdir: load the modules from a snapshot instead of src/. The mutant
 * driver snapshots src/ ONCE and hands it to every child, so a whole
 * mutation run measures one tree even while other agents edit their own
 * modules in src/ (pf-30 is loaded here too). */
const SRCDIR = opt('--srcdir') || SRC;
function loadPF(mutant) {
  const files = fs.readdirSync(SRCDIR).filter(f => f.endsWith('.js')).sort();
  for (const f of files) {
    let text = fs.readFileSync(path.join(SRCDIR, f), 'utf8');
    if (f === 'pf-31-channels-b.js' && mutant !== null) {
      const [from, to] = MUTANTS[mutant];
      const n = text.split(from).length - 1;
      if (n !== 1) throw new Error(`mutant ${mutant}: pattern found ${n} times (must be exactly 1): ${from}`);
      text = text.replace(from, () => to);
    }
    // THIS realm, as a browser <script> would (tools/load.cjs explains why
    // not a sandbox); named, so V8 coverage and stack traces can say which
    // file a block belongs to
    new vm.Script(text, { filename: path.join(SRCDIR, f) }).runInThisContext();
  }
  return { PF: globalThis.PF, files };
}

// ------------------------------------------------------------ mutants mode
if (argv.includes('--mutants')) {
  const idxArgs = argv.filter((a, i) => argv[i - 1] === '--case');
  let red = 0, survived = 0, broken = 0;
  const snap = path.join(RAW, 'src-snapshot');
  fs.rmSync(snap, { recursive: true, force: true });
  fs.mkdirSync(snap, { recursive: true });
  const digest = crypto.createHash('sha256');
  for (const f of fs.readdirSync(SRCDIR).filter(n => n.endsWith('.js')).sort()) {
    const b = fs.readFileSync(path.join(SRCDIR, f));
    fs.writeFileSync(path.join(snap, f), b);
    digest.update(f).update(b);
  }
  const SECS = opt('--sections') || 'pyhash,replay';
  const common = ['--srcdir', snap, '--sections', SECS, '--quiet', ...(ONLY ? ['--case', ONLY] : [])];
  console.log(`mutation run: ${MUTANTS.length} one-literal mutants of pf-31-channels-b.js, each against the ${SECS} sections`);
  console.log(`src snapshot ${snap} (sha256 ${digest.digest('hex').slice(0, 16)}) - every child loads this tree\n`);
  // the unmutated baseline first, same scope: a pre-existing red would
  // otherwise wear every mutant's kill
  const base = spawnSync(process.execPath, [__filename, ...common], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const bm = /RESULT pass=(\d+) fail=(\d+)/.exec(base.stdout);
  console.log(`baseline (no mutant): ${bm ? `pass=${bm[1]} fail=${bm[2]}` : 'DID NOT RUN'}`);
  if (!bm || +bm[2] !== 0 || base.status) { console.log('baseline is not green: a mutant kill would mean nothing'); process.exit(1); }
  for (let i = 0; i < MUTANTS.length; i++) {
    const r = spawnSync(process.execPath, [__filename, '--mutant', String(i), ...common],
      { encoding: 'utf8', maxBuffer: 1 << 28 });
    const m = /RESULT pass=(\d+) fail=(\d+)/.exec(r.stdout);
    // a child that never reached its RESULT line (pattern not found, load
    // error) measured nothing: BROKEN, never counted as a kill
    let verdict;
    if (!m) { verdict = 'BROKEN  '; broken++; }
    else if (+m[2] > 0 && r.status) { verdict = 'RED     '; red++; }
    else { verdict = 'SURVIVED'; survived++; }
    const first = (r.stdout.split('\n').find(l => l.startsWith('   FAIL')) || (r.stderr || '').split('\n').find(l => /Error/.test(l)) || '').trim();
    console.log(`${verdict} #${String(i).padStart(2)} ${MUTANTS[i][2].padEnd(64)} ${m ? `pass=${m[1]} fail=${m[2]}` : ''}\n            ${first.slice(0, 150)}`);
  }
  console.log(`\n${red}/${MUTANTS.length} mutants turned the test red, ${survived} survived, ${broken} broken`);
  process.exit(survived || broken ? 1 : 0);
}

const { PF } = loadPF(MUTANT === null ? null : +MUTANT);
const C = PF.channels;
const INDEXDATA = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
if (!QUIET) {
  const m = INDEXDATA.meta;
  console.log('fixtures: numpy %s / scipy %s / cv2 %s / python %s (%s)', m.numpy, m.scipy, m.cv2, m.python, m.machine);
  console.log('port: %s + %s + %s%s\n', PF.versionChannelsB, PF.versionChannelsA, PF.versionVarcontrast,
    MUTANT === null ? '' : `   [MUTANT #${MUTANT}: ${MUTANTS[+MUTANT][2]}]`);
}

// --------------------------------------------------------------- helpers
const dv8 = new DataView(new ArrayBuffer(8));
function hex8(x) {
  dv8.setFloat64(0, x, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += dv8.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function unhex8(h) {
  if (h === null) return null;
  for (let i = 0; i < 8; i++) dv8.setUint8(i, parseInt(h.substr(2 * i, 2), 16));
  return dv8.getFloat64(0, true);
}
const CTOR = { f8: Float64Array, f4: Float32Array, i4: Int32Array, 'i8>i4': Int32Array, u1: Uint8Array };
function reprKey(dt, shape) {
  return "('" + dt + "', (" + shape.join(', ') + (shape.length === 1 ? ',' : '') + '))';
}
function keyOf(ta, shape, dt) {
  const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
  return crypto.createHash('sha256').update(b).update(Buffer.from(reprKey(dt, shape))).digest('hex').slice(0, 24);
}
function sha(ta) {
  return crypto.createHash('sha256').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex');
}

class ReplayMiss extends Error {}

function loadCase(name) {
  const c = JSON.parse(fs.readFileSync(path.join(RAW, name + '.json'), 'utf8'));
  const cache = new Map();
  c.arr = function (key) {
    const d = c.arrays[key];
    if (!d) throw new Error('fixture has no array ' + key);
    let buf = cache.get(key);
    if (!buf) {
      buf = d.hex !== undefined ? Buffer.from(d.hex, 'hex') : fs.readFileSync(path.join(RAW, d.file));
      cache.set(key, buf);
    }
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);   // a fresh, aligned copy
    return { data: new CTOR[d.dtype](ab), shape: d.shape, dtype: d.dtype };
  };
  c.mat = function (key) { const a = c.arr(key); return { d: a.data, w: a.shape[1], h: a.shape[0] }; };
  c.img = function (key) { const a = c.arr(key); return { d: a.data, w: a.shape[1], h: a.shape[0], cn: a.shape[2] }; };
  c.vec = function (key) { return c.arr(key).data; };
  return c;
}

let pass = 0, fail = 0, values = 0;
const failures = [];
const notes = [];
function report(label, ok, msg) {
  if (ok) { pass++; return true; }
  fail++;
  failures.push(label + ': ' + msg);
  if (!QUIET || failures.length <= 3) console.log('   FAIL ' + label + ': ' + msg);
  return false;
}
function cmpArr(label, got, want) {
  if (got.length !== want.length) return report(label, false, `length ${got.length} != ${want.length}`);
  let nd = 0, first = -1, maxAbs = 0;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    nd++;
    if (first < 0) first = i;
    const d = Math.abs(got[i] - want[i]);
    if (d > maxAbs) maxAbs = d;
  }
  values += want.length;
  return report(label, nd === 0, `${nd}/${want.length} differ, first@${first} got ${got[first]} want ${want[first]}, maxAbs=${maxAbs}`);
}
function cmpHex(label, got, wantHex) {
  values++;
  if (wantHex === null || got === null || got === undefined) {
    return report(label, (got === null || got === undefined) && wantHex === null, `got ${got} want ${unhex8(wantHex)}`);
  }
  const g = hex8(got);
  return report(label, g === wantHex, `got ${got} [${g}] want ${unhex8(wantHex)} [${wantHex}]`);
}
function cmpEq(label, got, want) {
  values++;
  return report(label, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
/* An output kept whole ({ref}) or only as a digest (sha256 + per-row). */
function cmpOut(label, c, ta, shape, want) {
  if (want.ref !== undefined) {
    const w = c.arr(want.ref);
    if (JSON.stringify(w.shape) !== JSON.stringify(shape)) return report(label, false, `shape ${JSON.stringify(shape)} != ${JSON.stringify(w.shape)}`);
    return cmpArr(label, ta, w.data);
  }
  values += ta.length;
  if (JSON.stringify(want.shape) !== JSON.stringify(shape)) return report(label, false, `shape ${JSON.stringify(shape)} != ${JSON.stringify(want.shape)}`);
  if (sha(ta) === want.sha256) return report(label, true, '');
  const rowLen = ta.length / shape[0], bad = [];
  for (let r = 0; r < shape[0]; r++) {
    const s = crypto.createHash('sha256').update(Buffer.from(ta.buffer, ta.byteOffset + r * rowLen * ta.BYTES_PER_ELEMENT, rowLen * ta.BYTES_PER_ELEMENT)).digest('hex').slice(0, 16);
    if (s !== want.rows[r]) bad.push(r);
  }
  return report(label, false, `sha256 differs; ${bad.length}/${shape[0]} rows differ, first rows ${bad.slice(0, 8).join(',')}`);
}
function guard(label, fn) {
  try { return fn(); } catch (e) {
    report(label, false, (e instanceof ReplayMiss ? 'REPLAY MISS ' : 'THREW ') + e.message.split('\n')[0]);
    return undefined;
  }
}

// -------------------------------------------------------- stub machinery
function withStubs(stubs, fn) {
  const saved = [];
  for (const [obj, key, val] of stubs) {
    saved.push([obj, key, Object.prototype.hasOwnProperty.call(obj, key), obj[key]]);
    obj[key] = val;
  }
  try { return fn(); } finally {
    for (let i = saved.length - 1; i >= 0; i--) {
      const [obj, key, had, val] = saved[i];
      if (had) obj[key] = val; else delete obj[key];
    }
  }
}

/* _normalise answered by the reference: looked up by the CONTENT of the
 * profile JS passes, so a profile the reference never normalised on this
 * path is itself a failure. */
function refNormalise(c) {
  return function (profile) {
    const k = keyOf(profile, [profile.length], 'f8');
    const nk = c.normalise[k];
    if (!nk) throw new ReplayMiss('_normalise asked about a profile the reference never normalised here');
    return c.vec(nk);
  };
}

function newUsage() { return { score: new Set(), refine: new Set(), cands: new Set(), comb: new Set(), tiles_z: new Set() }; }

/* An _AxisEvidence that answers with the reference's recorded values and
 * refuses any question the reference did not ask. */
function stubEv(fit, idx, profile, usage) {
  const r = fit.ev[idx];
  const u = usage[idx] || (usage[idx] = newUsage());
  return {
    __ev: idx,
    profile: profile,
    pp_global: { __ev: idx },
    tiles: { __ev: idx },
    score(s) {
      const k = hex8(s), v = r.score[k];
      if (!v) throw new ReplayMiss(`ev${idx}.score(${s}) - the reference never asked`);
      u.score.add(k);
      return [unhex8(v[0]), unhex8(v[1])];
    },
    refine(s) {
      const k = hex8(s), v = r.refine[k];
      if (!v) throw new ReplayMiss(`ev${idx}.refine(${s}) - the reference never asked`);
      u.refine.add(k);
      return unhex8(v[0]);
    },
    candidate_steps(lo, hi) {
      const k = hex8(lo) + ':' + hex8(hi), v = r.cands[k];
      if (!v) throw new ReplayMiss(`ev${idx}.candidate_steps(${lo}, ${hi}) - the reference never asked`);
      u.cands.add(k);
      return v.map(x => unhex8(x[0]));
    }
  };
}
function evStubs(fit, usage) {
  return [
    [C, '_comb_score', function (pp, s) {
      const e = fit.ev[pp.__ev], k = hex8(s), v = e && e.comb[k];
      if (!v) throw new ReplayMiss(`_comb_score(ev${pp.__ev}.pp_global, ${s}) - the reference never asked`);
      (usage[pp.__ev] || (usage[pp.__ev] = newUsage())).comb.add(k);
      return [unhex8(v[0]), unhex8(v[1])];
    }],
    [C, '_tiles_ray_z', function (t, s) {
      const e = fit.ev[t.__ev], k = hex8(s), v = e && e.tiles_z[k];
      if (v === undefined) throw new ReplayMiss(`_tiles_ray_z(ev${t.__ev}.tiles, ${s}) - the reference never asked`);
      (usage[t.__ev] || (usage[t.__ev] = newUsage())).tiles_z.add(k);
      return unhex8(v);
    }],
    [C, 'is_jpeg_suspect', function (s) {
      const v = fit.jpeg_suspect[hex8(s)];
      if (v === undefined) throw new ReplayMiss(`is_jpeg_suspect(${s}) - the reference never asked`);
      return v;
    }]
  ];
}
/* Every question the reference asked, asked here too? */
function checkUsage(label, fit, usage, evs) {
  for (const idx of evs) {
    const r = fit.ev[idx], u = usage[idx] || newUsage();
    for (const kind of ['score', 'refine', 'cands', 'comb', 'tiles_z']) {
      const want = Object.keys(r[kind]).length, got = u[kind].size;
      report(`${label}.ev${idx}.${kind} questions`, got === want, `JS asked ${got} distinct, the reference ${want}`);
    }
  }
}

// ---------------------------------------------------------------- pyhash
function sectionPyhash() {
  const t = INDEXDATA.pyhash;
  let bad = 0, n = 0;
  for (const [h, want] of t.hash) {
    const v = unhex8(h), bits = C._pyFloatHashBits(v);
    let u = 0n;
    for (let i = 63; i >= 0; i--) u = (u << 1n) | BigInt(bits[i]);
    const s = BigInt.asIntN(64, u).toString();
    n++;
    if (s !== want && bad++ < 3) console.log(`   hash(${v}) = ${s}, python ${want}`);
  }
  report(`pyhash: hash(float) on ${n} floats`, bad === 0, `${bad}/${n} differ`);
  values += n;
  let badS = 0, badK = 0, nk = 0;
  for (const s of t.sets) {
    const vals = s.vals.map(unhex8), order = C._pySetOrder(vals);
    const got = order.map(i => hex8(vals[i])).join(','), want = s.order.join(',');
    if (got !== want) badS++;
    if (s.kinds) {
      nk++;
      const kinds = order.map(i => (i === 0 ? 'float64' : 'float')).join(',');
      if (kinds !== s.kinds.join(',')) badK++;
    }
  }
  report(`pyhash: set iteration order on ${t.sets.length} sets`, badS === 0, `${badS} differ`);
  report(`pyhash: kind kept by {np.float64, float} on ${nk} sets`, badK === 0, `${badK} differ`);
  values += t.sets.length;
  // round(x, n) of each kind. On the steps fit_grid can actually produce the
  // two kinds never disagree (np-kind steps are multiples of 0.5 and their
  // divisions by 2..5, which never sit near a decimal tie) - so this direct
  // check is the only thing that can see roundNd's numpy branch.
  let badR = 0, differ = 0;
  for (const [h, n, npH, pyH] of t.round) {
    const v = unhex8(h);
    if (npH !== pyH) differ++;
    if (hex8(C._roundNd(v, n, true)) !== npH || hex8(C._roundNd(v, n, false)) !== pyH) badR++;
  }
  report(`round(x, n): numpy.float64 and Python kinds on ${t.round.length} values (${differ} where the kinds disagree)`,
    badR === 0 && differ > 0, `${badR} differ${differ ? '' : '; the table has no disagreeing value, so it cannot tell the kinds apart'}`);
  values += 2 * t.round.length;
}

// ------------------------------------------------------------- replay: units
function replayUnits(c) {
  const N = c.name;
  const recs = (k) => [].concat(...c.fits.map((f, fi) => (f[k] || []).map(r => [fi, r])), (c.extra[k] || []).map(r => ['x', r]));
  const stubs = [[C, '_normalise', refNormalise(c)]];
  withStubs(stubs, () => {
    for (const [fi, r] of recs('lattice_dp')) {
      guard(`${N}.lattice_dp[${fi}]`, () => {
        const nt = r.n_targets === null ? null : r.n_targets;
        const out = C.lattice_dp(c.vec(r.profile), unhex8(r.step), unhex8(r.phase), nt,
          unhex8(r.dev_ratio), unhex8(r.stiffness), unhex8(r.anchor), unhex8(r.margin));
        cmpArr(`${N}.lattice_dp[${fi}] step=${unhex8(r.step).toFixed(4)} nt=${nt} (${r.caller})`, out, c.vec(r.out));
      });
    }
    for (const [fi, r] of recs('axis_chain')) {
      guard(`${N}._axis_chain[${fi}]`, () => {
        const out = C._axis_chain(c.vec(r.profile), unhex8(r.step), unhex8(r.phase), r.extent, r.mode);
        cmpArr(`${N}._axis_chain[${fi}] ${r.mode} extent=${r.extent}`, out, c.vec(r.out));
      });
    }
    for (const [fi, r] of recs('chain_to_cuts')) {
      guard(`${N}.chain_to_cuts`, () => cmpArr(`${N}.chain_to_cuts[${fi}] ${r.mode}`,
        C.chain_to_cuts(c.vec(r.positions), r.extent, r.mode), c.vec(r.out)));
    }
    for (const [fi, r] of recs('band_profiles')) {
      guard(`${N}.band_profiles[${fi}]`, () => {
        const out = C.band_profiles(c.img(r.img), r.n_bands, r.axis, r.kind);
        const w = c.arr(r.out);
        cmpEq(`${N}.band_profiles[${fi}] shape`, JSON.stringify([out.h, out.w]), JSON.stringify(w.shape));
        cmpArr(`${N}.band_profiles[${fi}] ${r.img_is || 'img'} axis=${r.axis} ${r.kind} x${r.n_bands} (${r.caller})`, out.d, w.data);
      });
    }
    for (const [fi, r] of recs('refine_positions_per_band')) {
      guard(`${N}.refine_positions_per_band[${fi}]`, () => {
        const out = C.refine_positions_per_band(c.mat(r.bands), c.vec(r.positions), unhex8(r.step),
          unhex8(r.dev_ratio), unhex8(r.prior), unhex8(r.smooth), r.n_iters);
        cmpArr(`${N}.refine_positions_per_band[${fi}]`, out.d, c.vec(r.out));
      });
    }
    for (const [fi, r] of recs('knot_cuts')) {
      guard(`${N}._knot_cuts_per_band`, () => cmpArr(`${N}._knot_cuts_per_band[${fi}]`,
        C._knot_cuts_per_band(c.mat(r.band_knots), r.extent).d, c.vec(r.out)));
    }
    for (const [fi, r] of recs('rasterise')) {
      guard(`${N}._rasterise_cuts`, () => cmpArr(`${N}._rasterise_cuts[${fi}]`,
        C._rasterise_cuts(c.mat(r.band_pos), r.extent, r.length).d, c.vec(r.out)));
    }
    for (const [fi, r] of recs('index_map')) {
      guard(`${N}._index_map_from_cuts`, () => {
        const out = C._index_map_from_cuts(c.mat(r.cuts), r.extent);
        cmpOut(`${N}._index_map_from_cuts[${fi}]`, c, out.d, [out.h, out.w], r.out);
      });
    }
    for (const [fi, r] of recs('exclusive_slot_occupancy')) {
      guard(`${N}._exclusive_slot_occupancy`, () => cmpHex(
        `${N}._exclusive_slot_occupancy[${fi}] (${r.caller}) s=${unhex8(r.s_small).toFixed(3)}/${unhex8(r.s_big).toFixed(3)}`,
        C._exclusive_slot_occupancy(c.vec(r.profile), unhex8(r.s_small), unhex8(r.phase_small), unhex8(r.s_big)), r.out));
    }
    for (const [fi, r] of recs('chain_energy_z')) {
      guard(`${N}._chain_energy_z`, () => cmpHex(`${N}._chain_energy_z[${fi}] s=${unhex8(r.step).toFixed(3)}`,
        C._chain_energy_z(c.vec(r.profile), unhex8(r.step), unhex8(r.phase)), r.out));
    }
    for (const [fi, r] of recs('estimate_axis')) {
      guard(`${N}.estimate_axis`, () => {
        let k = 0;
        const out = withStubs([[C, 'estimate_period', function (profile, min_step) {
          const call = r.calls[k++];
          if (!call) throw new ReplayMiss('estimate_period called more often than in the reference');
          if (keyOf(profile, [profile.length], 'f8') !== call.profile) throw new ReplayMiss('estimate_period got another profile');
          return [unhex8(call.out[0]), unhex8(call.out[1]), unhex8(call.out[2]), false];
        }]], () => C.estimate_axis(c.vec(r.e1), c.vec(r.e2)));
        cmpEq(`${N}.estimate_axis[${fi}] calls`, k, r.calls.length);
        cmpHex(`${N}.estimate_axis[${fi}].step`, out[0], r.out[0]);
        cmpHex(`${N}.estimate_axis[${fi}].score`, out[1], r.out[1]);
        cmpEq(`${N}.estimate_axis[${fi}].mode`, out[2], r.out[2]);
        cmpHex(`${N}.estimate_axis[${fi}].phase`, out[3], r.out[3]);
      });
    }
  });
}

// ------------------------------------------------- replay: the ev-driven trio
function replayEv(c) {
  const N = c.name;
  c.fits.forEach((fit, fi) => {
    const usage = {};
    const evCache = {};
    const ev = (i) => evCache[i] || (evCache[i] = stubEv(fit, i, c.vec(fit.ev[i].profile), usage));
    withStubs([[C, '_normalise', refNormalise(c)], ...evStubs(fit, usage)], () => {
      for (const impl of ['_b_evidence_refine_step', '_evidence_refine_step']) {
        if (impl === '_evidence_refine_step' && C._evidence_refine_step === C._b_evidence_refine_step) continue;
        let nd = 0, n = 0, first = '';
        for (const r of fit.evidence_refine_step) {
          n++;
          const out = guard(`${N}.fit${fi}.${impl}`, () => C[impl](ev(r.ev), unhex8(r.step), r.step_np));
          if (!out) { nd++; continue; }
          const ok = hex8(out[0]) === r.out[0] && hex8(out[1]) === r.out[1] && hex8(out[2]) === r.out[2] && !!out[3] === r.out_np;
          if (!ok) { nd++; if (!first) first = `step ${unhex8(r.step)} -> got [${out[0]}, ${out[1]}, np=${out[3]}] want [${unhex8(r.out[0])}, ${unhex8(r.out[1])}, np=${r.out_np}]`; }
        }
        values += n;
        report(`${N}.fit${fi}.${impl === '_evidence_refine_step' ? '_evidence_refine_step (pf-30\'s)' : '_evidence_refine_step (pf-31\'s)'} x${n}`, nd === 0, `${nd}/${n} differ; ${first}`);
      }
      // estimate_period_ev / estimate_axis_ev through THIS file's refine step
      withStubs([[C, '_evidence_refine_step', C._b_evidence_refine_step]], () => {
        for (const r of fit.estimate_period_ev) {
          guard(`${N}.fit${fi}.estimate_period_ev`, () => {
            const out = C.estimate_period_ev(ev(r.ev), unhex8(r.min_step), unhex8(r.max_step), unhex8(r.harmonic_tol));
            const L = `${N}.fit${fi}.estimate_period_ev(ev${r.ev})`;
            cmpHex(L + '.step', out[0], r.out[0]);
            cmpHex(L + '.score', out[1], r.out[1]);
            cmpHex(L + '.phase', out[2], r.out[2]);
            cmpEq(L + '.step is np.float64', !!out[3], r.out_np);
          });
        }
        for (const r of fit.estimate_axis_ev) {
          guard(`${N}.fit${fi}.estimate_axis_ev`, () => {
            const out = C.estimate_axis_ev(ev(r.ev1), ev(r.ev2), unhex8(r.min_step));
            const L = `${N}.fit${fi}.estimate_axis_ev(ev${r.ev1}, ev${r.ev2})`;
            cmpHex(L + '.step', out[0], r.out[0]);
            cmpHex(L + '.score', out[1], r.out[1]);
            cmpEq(L + '.mode', out[2], r.out[2]);
            cmpHex(L + '.phase', out[3], r.out[3]);
            cmpEq(L + '.step is np.float64', !!out[4], r.out_np);
          });
        }
      });
    });
  });
}

// ---------------------------------------------- fit_grid on recorded answers
function argsOf(c, fit, quantOverride) {
  const a = fit.args;
  return {
    target_cells: a.target_cells, force_step: unhex8(a.force_step), allow_warp: a.allow_warp,
    min_score: unhex8(a.min_score), max_output: a.max_output,
    quantized: quantOverride !== undefined ? quantOverride : (a.quantized === null ? null : c.img(a.quantized)),
    quantize_colors: a.quantize_colors
  };
}
/* INHERITED, not forgiven. With the real pf-30, ev.score answers carry the
 * C-runtime last-bit differences pf-30 documents (Math.cos/sin/atan2/log10
 * vs the UCRT, and its FFT), and fit_grid reports a winning score as it was
 * answered. A score mismatch is counted as inherited ONLY when this run's
 * pf-30 answered some question with exactly the drifted bits AND the
 * reference answered the SAME question with exactly the wanted bits;
 * anything else is a failure. The count and the worst ulp are printed. */
let inherited = 0, inheritedUlp = 0n;
function ulp64(a, b) {
  const x = new BigInt64Array(new Float64Array([a, b]).buffer);
  const d = x[0] - x[1];
  return d < 0n ? -d : d;
}
function cmpScore(L, got, wantHex, attrib) {
  if (!attrib || got === null || wantHex === null || hex8(got) === wantHex) return cmpHex(L, got, wantHex);
  const src = attrib(wantHex, hex8(got));
  if (!src) return cmpHex(L, got, wantHex);
  values++;
  inherited++;
  const u = ulp64(got, unhex8(wantHex));
  if (u > inheritedUlp) inheritedUlp = u;
  notes.push(`${L}: ${u} ulp INHERITED from pf-30 ${src} (reference answered that question with exactly the wanted bits)`);
  return true;
}
/* Wrap pf-30's _AxisEvidence so every score() answer of a real run is kept,
 * keyed by construction order and step, for cmpScore's attribution. */
function recordingAE(fit, answers) {
  const AE = C._AxisEvidence;
  let n = 0;
  const wrapped = function () {
    const ev = new AE(...arguments), idx = n++, s0 = ev.score.bind(ev);
    ev.score = function (s) { const r = s0(s); answers.push([idx, hex8(s), hex8(r[0])]); return r; };
    return ev;
  };
  /* The only arithmetic this half applies to a score before reporting it:
   * x0.5 (estimate_period_ev's jpeg deflation), x0.8 (fit_grid's
   * max(sc, score * 0.8) after a pair switch), or both. The factor is applied
   * to BOTH answers and each side must then match its bits exactly. */
  const FACTORS = [[1, ''], [0.5, ' x0.5'], [0.8, ' x0.8'], [0.5, ' x0.5 x0.8', 0.8]];
  const attrib = function (wantHex, gotHex) {
    for (const [idx, sh, gh] of answers) {
      const ref = fit.ev[idx] && fit.ev[idx].score[sh];
      if (!ref) continue;
      for (const [f1, name, f2] of FACTORS) {
        const r = unhex8(ref[0]) * f1, g = unhex8(gh) * f1;
        const rr = f2 ? r * f2 : r, gg = f2 ? g * f2 : g;
        if (hex8(rr) === wantHex && hex8(gg) === gotHex) return `ev${idx}.score(${unhex8(sh)})${name}`;
      }
    }
    return null;
  };
  const summary = function (L) {
    let nd = 0, tot = 0, mx = 0n;
    for (const [idx, sh, gh] of answers) {
      const ref = fit.ev[idx] && fit.ev[idx].score[sh];
      if (!ref) continue;
      tot++;
      if (ref[0] !== gh) { nd++; const u = ulp64(unhex8(gh), unhex8(ref[0])); if (u > mx) mx = u; }
    }
    notes.push(`${L}: pf-30 ev.score answered ${tot} of the reference's questions, ${nd} with other bits (max ${mx} ulp)`);
  };
  return { wrapped, attrib, summary };
}

function cmpGrid(L, c, g, want, attrib) {
  cmpEq(L + '.width', g.width, want.width);
  cmpEq(L + '.height', g.height, want.height);
  cmpEq(L + '.cols', g.cols, want.cols);
  cmpEq(L + '.rows', g.rows, want.rows);
  cmpHex(L + '.step_x', g.step_x, want.step_x);
  cmpHex(L + '.step_y', g.step_y, want.step_y);
  cmpScore(L + '.score_x', g.score_x, want.score_x, attrib);
  cmpScore(L + '.score_y', g.score_y, want.score_y, attrib);
  cmpEq(L + '.mode_x', g.mode_x, want.mode_x);
  cmpEq(L + '.mode_y', g.mode_y, want.mode_y);
  cmpEq(L + '.is_periodic', g.is_periodic, want.is_periodic);
  cmpOut(L + '.xcuts', c, g.xcuts.d, [g.xcuts.h, g.xcuts.w], want.xcuts);
  cmpOut(L + '.ycuts', c, g.ycuts.d, [g.ycuts.h, g.ycuts.w], want.ycuts);
  cmpOut(L + '.col_index', c, g.col_index.d, [g.col_index.h, g.col_index.w], want.col_index);
  cmpOut(L + '.row_index', c, g.row_index.d, [g.row_index.h, g.row_index.w], want.row_index);
  const ci = g.cell_index;
  cmpOut(L + '.cell_index', c, ci.d, [ci.h, ci.w], want.cell_index);
}

function replayFit(c) {
  const N = c.name, rgba = c.img(c.rgba);
  c.fits.forEach((fit, fi) => {
    const L = `${N}.fit${fi} ${fit.label}`;
    const usage = {};
    const q = { ap: 0, js: 0, notch: 0, tp: 0, sp: 0, jl: 0, vcc: 0, vcb: 0, ev: 0, gm: 0, km: 0, vcn: 0 };
    const refQ = fit.kmeans ? fit.kmeans.quantized : fit.args.quantized;
    const imgKey = (im) => keyOf(im.d, [im.h, im.w, im.cn], 'u1');
    const miss = (m) => { throw new ReplayMiss(m); };
    const stubs = [
      [C, '_normalise', refNormalise(c)],
      [C, '_evidence_refine_step', C._b_evidence_refine_step],
      ...evStubs(fit, usage),
      [C, 'axis_profiles', function (im) {
        const r = fit.axis_profiles[q.ap++] || miss('axis_profiles called more often than in the reference');
        if (imgKey(im) !== r.img) miss(`axis_profiles #${q.ap - 1} got another image`);
        return { e1x: c.vec(r.out.e1x), e1y: c.vec(r.out.e1y), e2x: c.vec(r.out.e2x), e2y: c.vec(r.out.e2y) };
      }],
      [C, '_jpeg_lattice_strength', function (p) {
        const r = fit.jpeg_strength[q.js++] || miss('_jpeg_lattice_strength called too often');
        if (keyOf(p, [p.length], 'f8') !== r.profile) miss(`_jpeg_lattice_strength #${q.js - 1} got another profile`);
        return unhex8(r.out);
      }],
      [C, '_notch_jpeg', function (p) {
        const r = fit.notch[q.notch++] || miss('_notch_jpeg called too often');
        if (keyOf(p, [p.length], 'f8') !== r.in) miss(`_notch_jpeg #${q.notch - 1} got another profile (a band_profiles row?)`);
        return c.vec(r.out);
      }],
      [C, '_grad_maps', function (im, qz) {
        q.gm++;
        if (imgKey(im) !== c.rgba) miss('_grad_maps got another rgba');
        if (imgKey(qz) !== refQ) miss('_grad_maps got another quantized');
        return { dqx: { tag: 'dqx' }, dqy: { tag: 'dqy' }, cox: { tag: 'cox' }, coy: { tag: 'coy' } };
      }],
      [C, '_tile_peaks', function (dmap, axis) {
        const i = q.tp++, r = fit.tile_peaks[i] || miss('_tile_peaks called too often');
        if (dmap.tag !== r[0] || axis !== r[1]) miss(`_tile_peaks #${i} got (${dmap.tag}, ${axis}), reference (${r[0]}, ${r[1]})`);
        return { __tiles: i };
      }],
      [C, '_axis_spectrum', function (dmaps, axis) {
        const i = q.sp++, r = fit.axis_spectrum[i] || miss('_axis_spectrum called too often');
        if (dmaps.map(d => d.tag).join() !== r[0].join() || axis !== r[1]) miss(`_axis_spectrum #${i} got other maps`);
        return { __spec: i };
      }],
      [C, '_AxisEvidence', function (profile, bands, tiles, spectrum, extra_z, extra_candidates) {
        const i = q.ev++, r = fit.ev[i] || miss('_AxisEvidence constructed too often');
        if (keyOf(profile, [profile.length], 'f8') !== r.profile) miss(`_AxisEvidence #${i} got another profile`);
        if ((bands === null) !== (r.bands === null)) miss(`_AxisEvidence #${i} bands null-ness differs`);
        if (bands !== null && keyOf(bands.d, [bands.h, bands.w], 'f8') !== r.bands) miss(`_AxisEvidence #${i} got other bands (band_profiles / notch)`);
        if ((tiles && tiles.__tiles) !== r.tiles || (spectrum && spectrum.__spec) !== r.spectrum) miss(`_AxisEvidence #${i} got other tiles/spectrum`);
        if (extra_z !== null || !r.extra_z_is_none) miss(`_AxisEvidence #${i} extra_z`);
        if (extra_candidates.map(hex8).join() !== r.extra_candidates.join()) miss(`_AxisEvidence #${i} extra_candidates (vc steps) differ`);
        return stubEv(fit, i, profile, usage);
      }],
      [C, 'is_jpeg_lattice', function (s, ph) {
        const r = fit.jpeg_lattice[q.jl++] || miss('is_jpeg_lattice called too often');
        if (hex8(s) !== r.step || hex8(ph) !== r.phase) miss(`is_jpeg_lattice(${s}, ${ph}) - reference asked (${unhex8(r.step)}, ${unhex8(r.phase)})`);
        return r.out;
      }],
      [PF.varcontrast, 'CellVarContrast', function (im) {
        q.vcn++;
        if (imgKey(im) !== c.rgba) miss('CellVarContrast got another image');
        return {
          z_channel() {
            if (!fit.vc.cands) miss('z_channel was not called by the reference');
            return [function () { miss('fit_grid never calls vc_z'); }, fit.vc.cands.map(p => [unhex8(p[0]), unhex8(p[1])])];
          },
          contrast(sx, sy, n) {
            const r = fit.vc.contrast[q.vcc++] || miss('vc.contrast called too often');
            if (hex8(sx) !== r.step_x || (sy !== undefined && sy !== null) !== (r.step_y !== null) || n !== r.n_phases) miss('vc.contrast asked something else');
            return r.out.map(unhex8);
          },
          best_pair(pairs, n) {
            const r = fit.vc.best_pair[q.vcb++] || miss('vc.best_pair called too often');
            const got = pairs.map(p => hex8(p[0]) + ',' + hex8(p[1])).join(';');
            const want = r.pairs.map(p => p[0] + ',' + p[1]).join(';');
            if (got !== want || (n !== undefined && n !== r.n_phases)) miss(`vc.best_pair got pairs [${pairs.map(p => p.join('x')).join(' ')}], reference [${r.pairs.map(p => p.map(unhex8).join('x')).join(' ')}]`);
            return r.out.map(t => t.map(unhex8));
          }
        };
      }],
      [PF, 'kmeans_quantize', function (base, k) {
        q.km++;
        if (!fit.kmeans) miss('kmeans_quantize was not called by the reference');
        if (imgKey(base) !== fit.kmeans.base) miss('kmeans_quantize got another image (PF.medianBlur?)');
        if (k !== fit.kmeans.k) miss('kmeans_quantize k');
        return { quantized: c.img(fit.kmeans.quantized) };
      }]
    ];
    const g = guard(`${L} replay`, () => withStubs(stubs, () => C.fit_grid(rgba, argsOf(c, fit))));
    if (!g) return;
    cmpGrid(`${L} [replay]`, c, g, fit.grid);
    const consumed = [['axis_profiles', q.ap, fit.axis_profiles.length], ['_jpeg_lattice_strength', q.js, fit.jpeg_strength.length],
      ['_notch_jpeg', q.notch, fit.notch.length], ['_tile_peaks', q.tp, fit.tile_peaks.length],
      ['_axis_spectrum', q.sp, fit.axis_spectrum.length], ['_AxisEvidence', q.ev, fit.ev.length],
      ['is_jpeg_lattice', q.jl, fit.jpeg_lattice.length], ['vc.contrast', q.vcc, fit.vc.contrast.length],
      ['vc.best_pair', q.vcb, fit.vc.best_pair.length], ['_grad_maps', q.gm, fit.grad_maps],
      ['kmeans_quantize', q.km, fit.kmeans ? 1 : 0]];
    const off = consumed.filter(x => x[1] !== x[2]);
    report(`${L} [replay] calls out of this half`, off.length === 0, off.map(x => `${x[0]} ${x[1]} vs ${x[2]}`).join(', '));
    checkUsage(`${L} [replay]`, fit, usage, fit.ev.map((e, i) => i));
  });
  // render_grid_overlay on the REFERENCE's fit 0 grid
  guard(`${N}.render_grid_overlay`, () => {
    const g0 = c.fits[0].grid;
    const xa = c.arr(g0.xcuts.ref), ya = c.arr(g0.ycuts.ref);
    const grid = { xcuts: { d: xa.data, w: xa.shape[1], h: xa.shape[0] }, ycuts: { d: ya.data, w: ya.shape[1], h: ya.shape[0] } };
    const out = C.render_grid_overlay(rgba, grid);
    cmpOut(`${N}.render_grid_overlay(rgba, reference grid)`, c, out.d, [out.h, out.w, 4], c.overlay.out);
  });
}

// ------------------------------------------------------------- integration
function integration(c) {
  const N = c.name, rgba = c.img(c.rgba);
  c.fits.forEach((fit, fi) => {
    const L = `${N}.fit${fi} ${fit.label}`;
    const t0 = Date.now();
    const quant = fit.kmeans ? c.img(fit.kmeans.quantized) : undefined;
    const rec = recordingAE(fit, []);
    const g = guard(`${L} [pf-30 + pf-23]`, () => withStubs([[C, '_AxisEvidence', rec.wrapped]],
      () => C.fit_grid(rgba, argsOf(c, fit, quant))));
    if (g) cmpGrid(`${L} [pf-30 + pf-23]`, c, g, fit.grid, rec.attrib);
    if (!QUIET) rec.summary(`${L} [pf-30 + pf-23]`);
    if (!QUIET) notes.push(`${L} [pf-30 + pf-23] ${Date.now() - t0} ms (reference ${fit.secs}s)`);
  });
}

// --------------------------------------------------------------------- e2e
function e2eOne(name) {
  const c = loadCase(name), fit = c.fits[0], rgba = c.img(c.rgba);
  let qGot = null;
  const real = PF.kmeans_quantize;
  const rec = recordingAE(fit, []);
  const t0 = Date.now();
  const g = guard(`${name}.e2e fit_grid(rgba)`, () => withStubs([[PF, 'kmeans_quantize', function (b, k) {
    const r = real(b, k); qGot = r.quantized; return r;
  }], [C, '_AxisEvidence', rec.wrapped]], () => C.fit_grid(rgba)));
  rec.summary(`${name}.e2e`);
  if (qGot && fit.kmeans) {
    const w = c.arr(fit.kmeans.quantized).data;
    let nd = 0;
    for (let i = 0; i < w.length; i++) if (qGot.d[i] !== w[i]) nd++;
    notes.push(`${name}.e2e k-means quantized image: ${nd}/${w.length} bytes differ from the reference's`);
  }
  if (g) cmpGrid(`${name}.e2e fit_grid(rgba) [fresh process]`, c, g, fit.grid, rec.attrib);
  notes.push(`${name}.e2e ${Date.now() - t0} ms (reference ${fit.secs}s)`);
}

// --------------------------------------------------------------------- run
if (E2E_ONE) {
  e2eOne(E2E_ONE);
} else {
  const cases = ONLY ? [ONLY] : INDEXDATA.cases;
  if (SECTIONS.includes('pyhash')) { if (!QUIET) console.log('pyhash:'); sectionPyhash(); }
  for (const name of cases) {
    const before = fail, t0 = Date.now();
    const c = loadCase(name);
    if (SECTIONS.includes('replay')) { replayUnits(c); replayEv(c); replayFit(c); }
    // an evidence-transformed case recorded answers no real first half gives:
    // only the replay can be compared with it
    if (SECTIONS.includes('integration') && !c.transform) integration(c);
    if (!QUIET) console.log(`  ${(fail === before ? 'ok  ' : 'FAIL')} ${name.padEnd(12)} ${c.w}x${c.h}  fits=${c.fits.length}  ${Date.now() - t0} ms`);
  }
  if (SECTIONS.includes('e2e')) {
    if (!QUIET) console.log('e2e (one case per process: the k-means RNG):');
    for (const name of cases) {
      if ((INDEXDATA.transformed || []).includes(name)) continue;   // replay-only (see above)
      const r = spawnSync(process.execPath, [__filename, '--e2e-one', name], { encoding: 'utf8', maxBuffer: 1 << 28 });
      const m = /RESULT pass=(\d+) fail=(\d+) values=(\d+) inherited=(\d+) inheritedUlp=(\d+)/.exec(r.stdout);
      if (!m) { report(`${name}.e2e`, false, 'child crashed: ' + (r.stderr || '').split('\n').slice(0, 3).join(' | ')); continue; }
      pass += +m[1]; fail += +m[2]; values += +m[3]; inherited += +m[4];
      if (BigInt(m[5]) > inheritedUlp) inheritedUlp = BigInt(m[5]);
      for (const l of r.stdout.split('\n')) {
        if (l.startsWith('   FAIL')) { failures.push(l.trim().slice(5)); console.log(l); }
        if (l.startsWith('NOTE ')) notes.push(l.slice(5));
      }
      if (!QUIET) console.log(`  ${+m[2] ? 'FAIL' : 'ok  '} ${name}`);
    }
  }
}
if (E2E_ONE) {
  for (const n of notes) console.log('NOTE ' + n);
} else if (!QUIET) {
  if (notes.length) console.log('\nnotes:\n  ' + notes.join('\n  '));
  console.log(`\n${pass} checks passed, ${fail} failed (${values} values compared)`);
  if (inherited) console.log(`${inherited} reported score value(s) INHERITED from pf-30's ev.score (neither pass nor fail; worst ${inheritedUlp} ulp) - see notes`);
  if (failures.length) console.log('first failures:\n  ' + failures.slice(0, 12).join('\n  '));
}
console.log(`RESULT pass=${pass} fail=${fail} values=${values} inherited=${inherited} inheritedUlp=${inheritedUlp}`);
process.exit(fail ? 1 : 0);
