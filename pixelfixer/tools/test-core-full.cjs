/* PF.core.detect(rgba, "full") against pixelfixer.core.detect(rgba,
 * mode="full"), fixtures/core-full-parity.json (tools/parity-core-full.py).
 *
 * ONE IMAGE PER PROCESS, both sides. Anything that reaches k-means is only
 * comparable between two runs that drew the same random numbers; the
 * python side runs each case in a fresh process, and so does this: without
 * arguments it forks itself once per case (and per variant below).
 *
 * What is compared, per case:
 *   result   cols, rows (ints), step_x, step_y, phase_x, phase_y (float64
 *            BITS, Object.is), consensus, key set - or, for a case the
 *            reference raises on, that JS throws the same message.
 *   trace    the reference's state at fixed program points of detect (see
 *            the python header), compared with what PF.core.detect reports
 *            to opts.trace at the same points. DECISIONS are required exact:
 *            the proposals incl. fu, the stage-1 groups before/after the
 *            aspect filter, the detail caps, every pick_axis candidate list,
 *            recon_at value, rmax, recon_ok, qualified set and returned step,
 *            sx/sy entering each post-pick step, local_count's counts.
 *            SCORES (the fused curves, each pick_axis score and best, each
 *            _both value) are compared bit for bit too, and every inexact
 *            one is COUNTED and its max |diff| printed - they pass through
 *            fusion's channels, which pf-24-fusion.js measures at up to
 *            2.9e-15 off in its fused curves (FFT and C-runtime
 *            transcendental last bits). A score |diff| above 1e-12 fails.
 *            EXCEPTION, measured and printed per case: autocorr's ranked
 *            candidates (ac_cands[:5], part of every pick_axis pool) come
 *            from pf-20-autocorr.js and are not bit-exact there (see
 *            UPSTREAM_REL below); they are counted as upstream-inexact,
 *            allowed to 1e-9 relative, while the step pick_axis RETURNS
 *            stays exact-required.
 *   log      (once per suite) PF.core._npLog against np.log on the ladder
 *            and 20000 arguments: correctly rounded everywhere, equal to
 *            numpy wherever numpy is (it is the UCRT's log, which misrounds
 *            a handful; the dump marks them against a 60-digit Decimal).
 *   rng      PF's k-means generator after detect is exactly where it was
 *            before (the reference's main-thread generator is untouched by
 *            detect(mode="full"): its main_rng_after is a fresh process's
 *            first three draws, checked here on every case).
 * Variants, each its own process:
 *   predraw  PF's generator advanced 7 draws BEFORE detect: the answer must
 *            not move (it does not in the reference: build_evidence's
 *            k-means runs on a fresh worker thread) and the generator must
 *            be left at the advanced state.
 *   lowmem   detect(rgba, "full", true): the same answer.
 *
 * Run:   node tools/test-core-full.cjs                all cases + variants
 *        node tools/test-core-full.cjs <id> [variant] one case, this process
 * Env:   PF_CORE_OVERRIDE=<file> loads that file in place of
 *        src/pf-50-core.js (tools/test-core-full.cjs --mutants uses it to
 *        prove the comparison can fail; src/ is never touched).
 *        --mutants [name]  runs every one-literal mutant of pf-50-core.js
 *        (or those whose name contains [name]) over every case but dragon
 *        and koi-pond, plain variant, and requires each to go RED; the
 *        unmutated file, through the same override path, must be GREEN
 *        first. Exit 1 if any mutant survives.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const FIXP = path.join(ROOT, 'fixtures', 'core-full-parity.json');
const RAW = path.join(ROOT, 'fixtures', 'raw', 'core-full');
const SCORE_TOL = 1e-12;
// autocorr's ranked candidates (ac_cands[:5] join every pick_axis pool) are
// not bit-exact UPSTREAM of core: pf-20-autocorr.js's axis_estimate scores
// differ from numpy's (its baked exp-weight table has wrong entries, and the
// float32 cepstrum differs), and a candidate whose ACF refinement falls back
// to its unrefined position carries that difference (measured: 1.03e-11 on
// syn-arb-blk). Such a value is COUNTED as upstream-inexact and printed;
// above this relative bound it fails. The STEP pick_axis RETURNS and every
// final answer are still required bit-exact.
const UPSTREAM_REL = 1e-9;
// a fresh cv2 process's first three randu(0, 1) doubles (--probe-rng)
const FRESH_DRAWS = [0.5302827933267031, 0.19925920037305117, 0.4010594430561372];

// ------------------------------------------------------------------ codec
function fromHex(h) { return Buffer.from(h, 'hex').readDoubleLE(0); }
function dec(v) {
  if (typeof v === 'string') {
    if (v.startsWith('f:')) return fromHex(v.slice(2));
    if (v.startsWith('F:')) {
      const b = Buffer.from(v.slice(2), 'hex');
      const out = new Float64Array(b.length / 8);
      for (let i = 0; i < out.length; i++) out[i] = b.readDoubleLE(i * 8);
      return out;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = dec(v[k]);
    return o;
  }
  return v;
}
function bits(x) { const b = Buffer.alloc(8); b.writeDoubleLE(x, 0); return b.toString('hex'); }

const doc = JSON.parse(fs.readFileSync(FIXP, 'utf8'));
const CASES = doc.cases;

// ================================================================== parent
// Mutant runs use the plain variant only, and leave out the two large
// stage-1 examples (dragon, koi-pond: 9 s each; their branch is covered by
// the six syn-s1-* cases); frog stays, as the one real arbitrated image.
// Every mutant below is detectable in the plain variant - the RNG mutants
// through the 'PF generator moved by detect' check.
const MUTANT_SKIP = ['dragon', 'koi-pond'];
let PLAIN_ONLY = false;

function runChild(id, variant, env) {
  const r = spawnSync(process.execPath, [__filename, id, variant],
    { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').filter(l => l.startsWith('@@'));
  if (line.length !== 1) {
    return { id, variant, ok: false, fails: ['child produced no result (exit ' + r.status + '): ' +
      ((r.stderr || '') + (r.stdout || '')).slice(-1500)] };
  }
  return JSON.parse(line[0].slice(2));
}

function variantsFor(c) {
  const v = ['plain'];
  if (PLAIN_ONLY) return v;
  // predraw / lowmem on every case that reaches build_evidence's k-means
  if (c.fusion_kmeans && c.fusion_kmeans.length && !c.stub) v.push('predraw', 'lowmem');
  return v;
}

function runAll(env, quiet, only) {
  console.log('fixture: python %s / numpy %s / cv2 %s, core.py sha256 %s..., generated %s',
    doc.meta.python, doc.meta.numpy, doc.meta.cv2, doc.meta.core_py_sha256.slice(0, 12), doc.meta.generated);
  if (env && env.PF_CORE_OVERRIDE) console.log('CORE OVERRIDE: ' + env.PF_CORE_OVERRIDE);
  let bad = 0, runs = 0, inexact = 0, maxd = 0, upInexact = 0, upMax = 0;
  const cov = {};
  const W = [23, 8, 28, 28, 13, 27, 9];
  if (!quiet) console.log('\n%s', ['case', 'variant', 'reference', 'js', 'trace', 'score |diff|', 'time'].map((s, i) =>
    s.padEnd(W[i] + (i === 0 ? 5 : 0))).join(''));
  // np.log as core.py calls it (see log_probe in the python dump): a
  // last-bit log difference moves no answer in the cases below, so it is
  // pinned here directly, once per suite, in its own process like the rest.
  {
    const r = runChild('__log__', 'plain', env);
    runs++;
    if (!r.ok) bad++;
    if (!quiet || !r.ok) {
      console.log('%s np.log probe: %s', r.ok ? 'ok  ' : 'FAIL', r.note || '');
      for (const f of (r.fails || []).slice(0, 6)) console.log('        - ' + f);
    }
  }
  for (const c of CASES) {
    if (only && only.indexOf(c.id) < 0) continue;
    for (const variant of variantsFor(c)) {
      const r = runChild(c.id, variant, env);
      runs++;
      if (!r.ok) bad++;
      inexact += r.inexact || 0;
      if ((r.maxd || 0) > maxd) maxd = r.maxd;
      upInexact += r.upInexact || 0;
      if ((r.upMax || 0) > upMax) upMax = r.upMax;
      for (const h of (c.hit || [])) cov[h] = (cov[h] || 0) + (r.ok ? 1 : 0);
      if (!quiet || !r.ok) {
        console.log([(r.ok ? 'ok   ' : 'FAIL ') + c.id, variant, String(r.want || ''), String(r.got || ''),
          r.traceN === undefined ? '-' : r.traceN + ' checks',
          r.inexact ? r.inexact + ' inexact, max ' + r.maxd.toExponential(1) : (r.traceN ? 'all exact' : '-'),
          r.ms === undefined ? '' : r.ms + ' ms'].map((s, i) => (s + ' ').padEnd(W[i] + (i === 0 ? 5 : 0))).join(''));
        if (r.upInexact) console.log('        upstream (autocorr candidate) inexact: ' + r.upNotes.join('; '));
        for (const f of (r.fails || []).slice(0, 12)) console.log('        - ' + f);
      }
    }
  }
  console.log('\n%d runs, %d failed; %d inexact score values over all traces (max |diff| %s); ' +
    '%d upstream-inexact candidate values (max |diff| %s)',
    runs, bad, inexact, maxd ? maxd.toExponential(2) : '0', upInexact, upMax ? upMax.toExponential(2) : '0');
  if (!quiet) {
    console.log('branches the reference took on cases that passed here:');
    for (const k of Object.keys(cov)) console.log('  %s  %d run(s)', k.padEnd(44), cov[k]);
  }
  if (only === undefined || only === null) {
    if (!quiet) console.log(bad ? 'RESULT: RED' : 'RESULT: every case agrees with the reference');
    if (env === undefined) process.exit(bad ? 1 : 0);
  }
  return bad;
}

// ------------------------------------------------------------------ mutants
/* One-literal mutants of src/pf-50-core.js. Each is written to out/ and
 * loaded IN PLACE of src/pf-50-core.js via PF_CORE_OVERRIDE; src/ is never
 * edited. Each must turn at least one case red; the baseline must be green. */
const MUTANTS = [
  ['SMALLEST_QUALIFIED 0.78 -> 0.80', 'core.SMALLEST_QUALIFIED = 0.78;', 'core.SMALLEST_QUALIFIED = 0.80;'],
  ['AGREE_BONUS 0.25 -> 0.20', 'core.AGREE_BONUS = 0.25;', 'core.AGREE_BONUS = 0.20;'],
  ['VC_W 0.20 -> 0.25', 'core.VC_W = 0.20;', 'core.VC_W = 0.25;'],
  ['AGREE_TOL 0.02 -> 0.03', 'core.AGREE_TOL = 0.02;', 'core.AGREE_TOL = 0.03;'],
  ['recon weight 0.6 -> 0.5', 'if (recon_ok) sc += 0.6 * (rn[q] / rmax);', 'if (recon_ok) sc += 0.5 * (rn[q] / rmax);'],
  ['recon_ok floor 0.005 -> 0.05', 'var recon_ok = rmax > 0.005;', 'var recon_ok = rmax > 0.05;'],
  ['cap penalty 0.35 -> 0.5', 'if (sq > cap) sc *= 0.35;', 'if (sq > cap) sc *= 0.5;'],
  ['detail cap 8.0 -> 6.0 (x)', 'var detail_cap_x = 8.0 * _acf_width(ac_x);', 'var detail_cap_x = 6.0 * _acf_width(ac_x);'],
  ['acf width 0.30 -> 0.25', 'if (ac[lag] - base < 0.30 * c0) return lag;', 'if (ac[lag] - base < 0.25 * c0) return lag;'],
  ['aspect guard 0.45 -> 0.55 (first)', 'if (trace) trace(\'aspect1\', { sx: sx, sy: sy });\n    if (Math.abs(npLog(sx / sy)) > 0.45) {',
    'if (trace) trace(\'aspect1\', { sx: sx, sy: sy });\n    if (Math.abs(npLog(sx / sy)) > 0.55) {'],
  ['fine-step support 0.35 -> 0.45', 'if (fused_at(ax_fine, s_fine) >= 0.35) {', 'if (fused_at(ax_fine, s_fine) >= 0.45) {'],
  ['harmonic window 0.08 -> 0.01', 'if (Math.abs(npLog(sx / sy)) < 0.08 && Math.abs(sx - sy) > 1e-6) {',
    'if (Math.abs(npLog(sx / sy)) < 0.01 && Math.abs(sx - sy) > 1e-6) {'],
  ['stage-1 supermajority 3 -> 2', 'if (groups.length && groups[0][0] >= 3) {', 'if (groups.length && groups[0][0] >= 2) {'],
  ['stage-1 aspect 0.35 -> 0.5', 'return Math.abs(npLog(r)) < 0.35;', 'return Math.abs(npLog(r)) < 0.5;'],
  ['3-way path off', 'if (agree.length >= 3 && Math.abs(npLog(r0)) < 0.35) {', 'if (agree.length >= 4 && Math.abs(npLog(r0)) < 0.35) {'],
  ['candidate floor 1.2 -> 2.1', 'if (s <= 1.2 || s > extent / 3) continue;', 'if (s <= 2.1 || s > extent / 3) continue;'],
  ['ac candidates 5 -> 3', 'for (q = 0; q < Math.min(5, ac_cands.length); q++)', 'for (q = 0; q < Math.min(3, ac_cands.length); q++)'],
  ['dedup 0.01 -> 0.03', 'if (Math.abs(npLog(s / seen[z])) < 0.01) { dup = true; break; }', 'if (Math.abs(npLog(s / seen[z])) < 0.03) { dup = true; break; }'],
  ['no fresh-thread RNG for fusion (draw from the caller\'s generator)',
    'return core_onFreshThread(function () { return F.build_evidence(rgba, true); });',
    'return F.build_evidence(rgba, true);'],
  ['recon on the global generator', 'var ch = R._prep(rgba, { rng: new PF.RNG() });', 'var ch = R._prep(rgba);'],
  ['fu cols Math.round', 'fu_prop.cols = pyMax(1, PF.rint(w / fu_prop.step_x));', 'fu_prop.cols = pyMax(1, Math.round(w / fu_prop.step_x));'],
  ['fu rows Math.round', 'fu_prop.rows = pyMax(1, PF.rint(h / fu_prop.step_y));', 'fu_prop.rows = pyMax(1, Math.round(h / fu_prop.step_y));'],
  ['np.log -> Math.log', 'function npLog(x) { return PF.varcontrast.vc_log(x); }', 'function npLog(x) { return Math.log(x); }'],
];

function runMutants(only) {
  PLAIN_ONLY = true;
  const ids = CASES.map(c => c.id).filter(id => MUTANT_SKIP.indexOf(id) < 0);
  const OUT = path.join(ROOT, 'out', 'core-full-mutants');
  fs.mkdirSync(OUT, { recursive: true });
  const srcText = fs.readFileSync(path.join(SRC, 'pf-50-core.js'), 'utf8');
  console.log('== baseline (unmutated copy through the same override path)');
  const basePath = path.join(OUT, 'baseline.js');
  fs.writeFileSync(basePath, srcText);
  const b0 = runAll({ PF_CORE_OVERRIDE: basePath }, true, ids);
  if (b0) { console.log('BASELINE IS RED - mutants would prove nothing'); process.exit(1); }
  console.log('baseline GREEN\n');
  let survived = 0, n = 0;
  for (const [name, from, to] of MUTANTS) {
    if (only && name.indexOf(only) < 0) continue;
    n++;
    const cnt = srcText.split(from).length - 1;
    if (cnt !== 1) { console.log('MUTANT %s: pattern found %d times (must be 1)', name, cnt); survived++; continue; }
    const p = path.join(OUT, 'mutant-' + n + '.js');
    fs.writeFileSync(p, srcText.replace(from, to));
    console.log('== mutant: ' + name);
    const bad = runAll({ PF_CORE_OVERRIDE: p }, true, ids);
    console.log(bad ? '   KILLED (%d red run(s))\n' : '   SURVIVED\n', bad);
    if (!bad) survived++;
  }
  console.log('%d mutant(s), %d survived', n, survived);
  process.exit(survived ? 1 : 0);
}

// ================================================================== child
function childMain(id, variant) {
  const override = process.env.PF_CORE_OVERRIDE ? path.resolve(process.env.PF_CORE_OVERRIDE) : null;
  const files = fs.readdirSync(SRC).filter(f => /^pf-\d+-.*\.js$/.test(f)).sort();
  for (const f of files) {
    if (override && f === 'pf-50-core.js') continue;
    (0, eval)(fs.readFileSync(path.join(SRC, f), 'utf8'));
  }
  if (override) (0, eval)(fs.readFileSync(override, 'utf8'));
  const PF = globalThis.PF;

  if (id === '__log__') {
    // numpy's log here is the UCRT's, which misrounds a few arguments (the
    // dump marks them against a 60-digit Decimal log); no JS log can copy a
    // closed-source libm's misroundings. Required: the port's log is
    // CORRECTLY ROUNDED on every argument, EQUALS numpy on every argument
    // numpy rounds correctly (incl. all of the ladder core logs), and so
    // differs from numpy exactly on the recorded misroundings.
    const LP = doc.log_probe;
    const xs = dec(LP.x), want = dec(LP.log), cr = dec(LP.cr);
    const mis = new Set(LP.numpy_misrounded);
    const lfails = [];
    let nd = 0, ncr = 0, nm = 0, nLad = 0;
    for (let i = 0; i < xs.length; i++) {
      const v = PF.core._npLog(xs[i]);
      if (!Object.is(v, cr[i])) { ncr++; if (lfails.length < 3) lfails.push('not correctly rounded at ' + xs[i] + ': ' + v + ' vs ' + cr[i]); }
      if (!Object.is(v, want[i])) {
        nd++;
        if (i < LP.n_ladder) nLad++;
        if (!mis.has(i) && lfails.length < 6) lfails.push('differs from numpy where numpy is correctly rounded, at ' + xs[i] + ': ' + v + ' vs ' + want[i]);
      } else if (mis.has(i) && lfails.length < 6) {
        lfails.push('equals numpy where numpy MISrounds, at ' + xs[i]);
      }
      if (!Object.is(Math.log(xs[i]), want[i])) nm++;
    }
    const good = ncr === 0 && nd === mis.size && lfails.length === 0 && nLad === 0;
    const note = 'core log vs numpy: ' + nd + ' of ' + xs.length + ' differ, all ' + mis.size +
      ' of them numpy (UCRT) misroundings; correctly rounded on ' + (xs.length - ncr) + '/' + xs.length +
      '; ladder (' + LP.n_ladder + ' knots) exact; V8 Math.log would differ from numpy on ' + nm;
    console.log('@@' + JSON.stringify({ id, variant, ok: good, note, fails: lfails }));
    return;
  }

  const c = CASES.find(x => x.id === id);
  if (!c) throw new Error('no case ' + id);
  const w = c.w, h = c.h;
  const d = new Uint8Array(fs.readFileSync(path.join(RAW, c.base + '.rgba')));
  if (d.length !== w * h * 4) throw new Error('raw size mismatch for ' + c.base);
  const rgba = { d, w, h, cn: 4 };

  const fails = [];
  let checks = 0, inexact = 0, maxd = 0, maxAt = '', upInexact = 0, upMax = 0;
  const upNotes = [];
  function ok(cond, label) { checks++; if (!cond) fails.push(label); return cond; }
  function exact(got, want, label) {
    if (typeof want === 'number') {
      return ok(typeof got === 'number' && Object.is(got, want),
        label + ': got ' + got + (typeof got === 'number' ? ' (' + bits(got) + ')' : '') + ' want ' + want + ' (' + bits(want) + ')');
    }
    return ok(JSON.stringify(got) === JSON.stringify(want), label + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
  }
  function score(got, want, label) {
    checks++;
    if (Object.is(got, want)) return true;
    const dd = Math.abs(got - want);
    inexact++;
    if (dd > maxd || dd !== dd) { maxd = dd !== dd ? Infinity : dd; maxAt = label; }
    if (!(dd <= SCORE_TOL)) { fails.push(label + ': got ' + got + ' want ' + want + ' |diff| ' + dd); return false; }
    return true;
  }
  function upstream(got, want, label) {
    checks++;
    if (Object.is(got, want)) return true;
    const dd = Math.abs(got - want);
    upInexact++;
    if (dd > upMax || dd !== dd) upMax = dd !== dd ? Infinity : dd;
    upNotes.push(label + ' ' + got + ' vs ' + want);
    if (!(dd <= UPSTREAM_REL * Math.abs(want))) { fails.push(label + ': got ' + got + ' want ' + want + ' |diff| ' + dd); return false; }
    return true;
  }
  function arr(got, want, label, how) {
    if (!ok(got && got.length === want.length, label + ' length ' + (got && got.length) + ' vs ' + want.length)) return;
    const f = how === 'upstream' ? upstream : (how === 'score' ? score : exact);
    for (let i = 0; i < want.length; i++) f(got[i], want[i], label + '[' + i + ']');
  }

  // ---- stubs: the same replacements tools/parity-core-full.py installs
  const restore = [];
  function swap(obj, key, val) { const old = obj[key]; obj[key] = val; restore.push(() => { obj[key] = old; }); }
  if (c.stub === 'to_gray_raises_once') {
    const real = PF.autocorr.to_gray; let n = 0;
    swap(PF.autocorr, 'to_gray', function (x) { n++; if (n === 1) throw new Error('stub to_gray raised'); return real(x); });
  } else if (c.stub === 'to_gray_raises_always') {
    swap(PF.autocorr, 'to_gray', function () { throw new Error('stub to_gray raised'); });
  } else if (c.stub === 'ac_detect_raises') {
    swap(PF.autocorr, 'detect', function () { throw new Error('stub ac detect raised'); });
  } else if (c.stub === 'nocand') {
    const realAE = PF.autocorr.axis_estimate;
    swap(PF.autocorr, 'detect', () => ({ step_x: 50.0, step_y: 50.0, cols: 3, rows: 3, phase_x: 0.0, phase_y: 0.0 }));
    swap(PF.runlengths, 'detect', () => ({ step_x: 55.0, step_y: 55.0, cols: 7, rows: 7, phase_x: 0.0, phase_y: 0.0, score_x: 0.0, score_y: 0.0 }));
    swap(PF.selfsim, 'detect', () => ({ step_x: 60.0, step_y: 60.0, cols: 11, rows: 11, phase_x: 0.0, phase_y: 0.0 }));
    swap(PF.autocorr, 'axis_estimate', function (maps, axis, extent) {
      const r = realAE(maps, axis, extent); return [r[0], [[50.0, 1.0]], r[2]];
    });
    swap(PF.fusion, 'fused_curve', function (mat) { const o = new Float64Array(mat.h); for (let i = 0; i < mat.h; i++) o[i] = i; return o; });
  } else if (c.stub) {
    throw new Error('unknown stub ' + c.stub);
  }

  // ---- the generator before
  const g = PF.theRNG();
  if (variant === 'predraw') for (let i = 0; i < 7; i++) g.next();
  const before = [g.lo, g.hi];
  if (variant === 'plain' || variant === 'lowmem') {
    ok(before[0] === 0xffffffff && before[1] === 0, 'generator is fresh before detect');
  }

  // ---- run
  const tr = [];
  const opts = { trace: (tag, data) => tr.push({ tag, data }) };
  let got = null, err = null;
  const t0 = Date.now();
  try { got = PF.core.detect(rgba, 'full', variant === 'lowmem', opts); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  for (const f of restore.reverse()) f();

  // ---- the answer
  let wantStr, gotStr;
  if (c.raises) {
    const msg = c.raises.replace(/^\w+: /, '');
    wantStr = 'RAISES ' + msg;
    gotStr = err ? 'RAISES ' + err.message : (got ? got.consensus : '?');
    ok(err !== null && err.message === msg, 'raises: got ' + (err ? '"' + err.message + '"' : 'no throw') + ' want "' + msg + '"');
  } else {
    const want = dec(c.result);
    wantStr = want.consensus + ' ' + want.cols + 'x' + want.rows;
    if (err) {
      gotStr = 'THROW';
      ok(false, 'threw: ' + (err.stack || err.message).split('\n').slice(0, 4).join(' | '));
    } else {
      gotStr = got.consensus + ' ' + got.cols + 'x' + got.rows;
      for (const k of ['step_x', 'step_y', 'phase_x', 'phase_y']) exact(got[k], want[k], 'result.' + k);
      for (const k of ['cols', 'rows']) ok(got[k] === want[k] && Number.isInteger(got[k]), 'result.' + k + ': got ' + got[k] + ' want ' + want[k]);
      exact(got.consensus, want.consensus, 'result.consensus');
      const gk = Object.keys(got).filter(k => k !== '_errors').sort().join(',');
      exact(gk, Object.keys(want).sort().join(','), 'result key set');
    }
  }

  // ---- the generator after
  const after = [g.lo, g.hi];
  ok(after[0] === before[0] && after[1] === before[1],
    'PF generator moved by detect: before ' + before + ' after ' + after);
  const pyAfter = dec(c.main_rng_after);
  for (let i = 0; i < 3; i++) {
    ok(Object.is(pyAfter[i], FRESH_DRAWS[i]),
      'reference main thread generator after detect is not fresh: ' + Array.from(pyAfter));
  }
  // the reference's fusion k-means ran on a worker thread, as the port models
  for (const k of (c.fusion_kmeans || [])) ok(k.is_main === false, 'reference k-means ran on the main thread: ' + k.thread);

  // ---- the trace (plain variant; the others are about the answer and the RNG)
  let traceN;
  if (variant === 'plain' && !err) {
    const before0 = checks;
    const want = c.trace.filter(s => s.tag !== 'lc').map(s => ({ tag: s.tag, data: dec(s.data) }));
    const byTag = (list, tag) => list.filter(s => s.tag === tag).map(s => s.data);
    // sequence of tags, with pick events compared per axis (the reference
    // runs the two axes on two threads, so their record order can swap)
    const seq = l => l.filter(s => s.tag !== 'pick').map(s => s.tag).join(',');
    exact(seq(tr), seq(want), 'trace tag sequence');
    const S1 = byTag(want, 'stage1')[0], s1 = byTag(tr, 'stage1')[0];
    if (S1 && s1) {
      exact(s1.names, S1.names, 'stage1 names');
      for (const n of S1.names) {
        const P = S1.props[n], p = s1.props[n] || {};
        exact(Object.keys(p).sort(), Object.keys(P).sort(), 'prop ' + n + ' keys');
        for (const k of Object.keys(P)) exact(p[k], P[k], 'prop ' + n + '.' + k);
      }
      arr(s1.curve_x, S1.curve_x, 'curve_x', 'score');
      arr(s1.curve_y, S1.curve_y, 'curve_y', 'score');
    }
    for (const tag of ['groups_pre', 'groups_post']) {
      const W = byTag(want, tag), G = byTag(tr, tag);
      if (W.length) exact(G[0], W[0], tag);
    }
    const C = byTag(want, 'caps')[0], cc = byTag(tr, 'caps')[0];
    if (C && cc) { exact(cc.x, C.x, 'detail_cap_x'); exact(cc.y, C.y, 'detail_cap_y'); }
    for (const axis of ['x', 'y']) {
      const P = byTag(want, 'pick').filter(p => p.axis === axis), p = byTag(tr, 'pick').filter(q => q.axis === axis);
      if (!P.length) continue;
      if (!ok(p.length === 1, 'pick ' + axis + ' count ' + p.length)) continue;
      const W = P[0], G = p[0];
      arr(G.cands, W.cands, 'pick ' + axis + ' cands', 'upstream');
      exact(G.ret, W.ret, 'pick ' + axis + ' returned step');
      if ('rn' in W) {
        arr(G.rn, W.rn, 'pick ' + axis + ' recon_at', 'exact');
        exact(G.rmax, W.rmax, 'pick ' + axis + ' rmax');
        exact(G.recon_ok, W.recon_ok, 'pick ' + axis + ' recon_ok');
        if (ok(G.scored && G.scored.length === W.scored.length, 'pick ' + axis + ' scored length')) {
          for (let i = 0; i < W.scored.length; i++) {
            upstream(G.scored[i][0], W.scored[i][0], 'pick ' + axis + ' scored[' + i + '].s');
            score(G.scored[i][1], W.scored[i][1], 'pick ' + axis + ' scored[' + i + '].score');
          }
        }
        score(G.best, W.best, 'pick ' + axis + ' best');
        arr(G.qualified, W.qualified, 'pick ' + axis + ' qualified', 'upstream');
      } else {
        ok(!('rn' in G), 'pick ' + axis + ': reference returned before scoring, JS did not');
      }
    }
    for (const tag of ['aspect1', 'aspect2', 'refine', 'harm', 'count']) {
      const W = byTag(want, tag)[0], G = byTag(tr, tag)[0];
      if (W && G) { exact(G.sx, W.sx, tag + ' sx'); exact(G.sy, W.sy, tag + ' sy'); }
    }
    const WB = byTag(want, 'both'), GB = byTag(tr, 'both');
    if (ok(WB.length === GB.length, '_both calls ' + GB.length + ' vs ' + WB.length)) {
      for (let i = 0; i < WB.length; i++) { exact(GB[i].s, WB[i].s, '_both[' + i + '].s'); score(GB[i].ret, WB[i].ret, '_both[' + i + ']'); }
    }
    const WF = byTag(want, 'final')[0], GF = byTag(tr, 'final')[0];
    if (WF && GF) { exact(GF.n_cols, WF.n_cols, 'local_count n_cols'); exact(GF.n_rows, WF.n_rows, 'local_count n_rows'); }
    traceN = checks - before0;
  }

  console.log('@@' + JSON.stringify({ id, variant, ok: fails.length === 0, fails, want: wantStr, got: gotStr,
    traceN, inexact, maxd, maxAt, upInexact, upMax, upNotes, ms, checks }));
}

// ================================================================== dispatch
// (last, so every const above is initialised before it runs)
if (process.argv[2] === '--mutants') runMutants(process.argv[3]);
else if (!process.argv[2]) runAll();
else childMain(process.argv[2], process.argv[3] || 'plain');
