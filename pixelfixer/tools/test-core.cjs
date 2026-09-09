/* Node parity test for src/pf-50-core.js against fixtures/core.json.
 *
 * Loads EVERY src/pf-*.js in sorted order, exactly as a browser page would,
 * so detector ports (PF.autocorr / PF.runlengths / PF.selfsim) are picked
 * up automatically when they exist.
 *
 * Four sections:
 *   A  logic      canned proposals -> stubbed detectors -> PF.core.detect,
 *                 compared bit-for-bit with what the reference core.detect
 *                 returned for the same proposals. Also checks WHICH
 *                 detectors were invoked (the early exit must skip selfsim)
 *                 and that _run_ac wires the autocorr preamble into `pre`.
 *   B  replay     the recorded proposals of each real / synthetic image,
 *                 replayed through the JS core logic the same way.
 *   C  end-to-end the real images through the real detector ports. RUNS
 *                 ONLY when all three ports are on PF; otherwise it is
 *                 reported as SKIPPED and the process exits 2 so a skip can
 *                 never read as a pass.
 *   D  guards     JS-only behaviour with no reference counterpart: mode
 *                 "full" / unknown mode / missing port throw; strict rethrows.
 *
 * Floats are compared with Object.is on the decoded float64 (NaN == NaN,
 * -0 != +0), i.e. bit-exact.
 *
 *   node tools/test-core.js
 * exit 0 = every check passed and end-to-end ran; 2 = every check passed
 * but end-to-end was skipped; 1 = a failure.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const FIX = path.join(ROOT, 'fixtures', 'core.json');

// argv[2] lets tools/mutation-core.js point this test at a MUTANT copy of
// pf-50-core.js without touching src/; every other src/pf-*.js still loads.
const CORE_OVERRIDE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const files = fs.readdirSync(SRC).filter(f => /^pf-\d+-.*\.js$/.test(f)).sort();
for (const f of files) {
  if (CORE_OVERRIDE && f === 'pf-50-core.js') continue;
  (0, eval)(fs.readFileSync(path.join(SRC, f), 'utf8'));
}
if (CORE_OVERRIDE) {
  (0, eval)(fs.readFileSync(CORE_OVERRIDE, 'utf8'));
  console.log('CORE OVERRIDE: %s', CORE_OVERRIDE);
}
const PF = globalThis.PF;
if (!PF || !PF.core || !PF.core.detect) throw new Error('pf-50-core.js did not define PF.core.detect');
console.log('loaded: %s', files.join(', '));
console.log('port: %s\n', PF.core.version);

const doc = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('fixtures: python %s / numpy %s / cv2 %s / PIL %s, core.py sha256 %s..., generated %s',
  doc.meta.python, doc.meta.numpy, doc.meta.cv2, doc.meta.PIL,
  doc.meta.core_py_sha256.slice(0, 12), doc.meta.generated);

// ------------------------------------------------------------------ codec
function fromHex(h) { return Buffer.from(h, 'hex').readDoubleLE(0); }
function dec(v) {
  if (typeof v === 'string') return v.startsWith('f:') ? fromHex(v.slice(2)) : v;
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = (k === 'rgba_hex') ? v[k] : dec(v[k]);
    return o;
  }
  return v;
}
function bits(x) { const b = Buffer.alloc(8); b.writeDoubleLE(x, 0); return b.toString('hex'); }

// ------------------------------------------------------------------ tally
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) { pass++; return true; }
  fail++;
  failures.push(label + (detail ? ': ' + detail : ''));
  return false;
}

const FLOAT_KEYS = ['step_x', 'step_y', 'phase_x', 'phase_y'];
const INT_KEYS = ['cols', 'rows'];
function cmpResult(label, got, want) {
  let all = true;
  for (const k of FLOAT_KEYS) {
    all = ok(Object.is(got[k], want[k]), label + ' ' + k,
      `got ${got[k]} (${bits(got[k])}) want ${want[k]} (${bits(want[k])})`) && all;
  }
  for (const k of INT_KEYS) {
    all = ok(got[k] === want[k] && Number.isInteger(got[k]), label + ' ' + k,
      `got ${got[k]} want ${want[k]}`) && all;
  }
  all = ok(got.consensus === want.consensus, label + ' consensus',
    `got "${got.consensus}" want "${want.consensus}"`) && all;
  const gk = Object.keys(got).filter(k => k !== '_errors').sort().join(',');
  const wk = Object.keys(want).sort().join(',');
  all = ok(gk === wk, label + ' key set', `got {${gk}} want {${wk}}`) && all;
  return all;
}

// ------------------------------------------------------------------ stubs
const REAL = { autocorr: PF.autocorr, runlengths: PF.runlengths, selfsim: PF.selfsim };
const haveReal = ['autocorr', 'runlengths', 'selfsim']
  .filter(n => REAL[n] && typeof REAL[n].detect === 'function');

function installStubs(props, called, log) {
  const tok = {};
  function ret(n) {
    const v = props[n];
    if (v === 'RAISE') throw new Error('stub ' + n + ' raised');
    return Object.assign({}, v);
  }
  PF.autocorr = {
    to_gray: (rgba) => (tok.g = { tag: 'g', rgba }),
    median_quant: (g) => (tok.gq = { tag: 'gq', g }),
    d2_along: (g, axis) => ({ tag: 'd2', g, axis }),
    d1_along: (g, axis) => ({ tag: 'd1', g, axis }),
    axis_estimate: (maps, axis, extent) => ({ tag: 'est', maps, axis, extent }),
    detect: (rgba, pre) => { called.push('ac'); log.pre = pre; log.rgba = rgba; log.tok = tok; return ret('ac'); }
  };
  PF.runlengths = { detect: (rgba) => { called.push('rl'); log.rlRgba = rgba; return ret('rl'); } };
  PF.selfsim = { detect: (rgba) => { called.push('ss'); log.ssRgba = rgba; return ret('ss'); } };
}
function restore() {
  PF.autocorr = REAL.autocorr; PF.runlengths = REAL.runlengths; PF.selfsim = REAL.selfsim;
}

function checkWiring(label, log, rgba, w, h) {
  const pre = log.pre;
  if (!ok(!!pre && !!log.tok, label + ' pre present')) return;
  const t = log.tok;
  ok(log.rgba === rgba && t.g.rgba === rgba, label + ' rgba passed through');
  ok(t.gq.g === t.g, label + ' median_quant(to_gray(rgba))');
  const mx = pre.maps_x, my = pre.maps_y;
  ok(Array.isArray(mx) && mx.length === 2 && Array.isArray(my) && my.length === 2, label + ' maps shape');
  ok(mx[0][0].tag === 'd2' && mx[0][0].g === t.g && mx[0][0].axis === 1 && mx[0][1] === 1.0,
    label + ' maps_x[0] = (d2_along(g,1), 1.0)');
  ok(mx[1][0].tag === 'd1' && mx[1][0].g === t.gq && mx[1][0].axis === 1 && mx[1][1] === 0.7,
    label + ' maps_x[1] = (d1_along(gq,1), 0.7)');
  ok(my[0][0].tag === 'd2' && my[0][0].g === t.g && my[0][0].axis === 0 && my[0][1] === 1.0,
    label + ' maps_y[0] = (d2_along(g,0), 1.0)');
  ok(my[1][0].tag === 'd1' && my[1][0].g === t.gq && my[1][0].axis === 0 && my[1][1] === 0.7,
    label + ' maps_y[1] = (d1_along(gq,0), 0.7)');
  ok(pre.est_x.tag === 'est' && pre.est_x.maps === mx && pre.est_x.axis === 1 && pre.est_x.extent === w,
    label + ' est_x = axis_estimate(maps_x, 1, w)');
  ok(pre.est_y.tag === 'est' && pre.est_y.maps === my && pre.est_y.axis === 0 && pre.est_y.extent === h,
    label + ' est_y = axis_estimate(maps_y, 0, h)');
}

function runStubbed(label, props, w, h, want, wantCalled, checkPre) {
  const rgba = { d: new Uint8Array(w * h * 4), w, h, cn: 4 };
  const called = [], log = {};
  installStubs(props, called, log);
  let got, err = null;
  try { got = PF.core.detect(rgba, 'fast'); } catch (e) { err = e; } finally { restore(); }
  ok(called.slice().sort().join('+') === wantCalled.join('+'), label + ' detectors invoked',
    `got ${called.slice().sort().join('+')} want ${wantCalled.join('+')}`);
  if (checkPre && props.ac !== 'RAISE') checkWiring(label, log, rgba, w, h);
  if (want.raises) {
    const msg = want.raises.replace(/^\w+: /, '');
    ok(err !== null && err.message === msg, label + ' raises', err ? `got "${err.message}" want "${msg}"` : 'did not throw');
    return;
  }
  if (!ok(err === null, label + ' no throw', err && err.message)) return;
  cmpResult(label, got, want.result);
  const raised = ['ac', 'rl', 'ss'].filter(n => props[n] === 'RAISE');
  const gotErr = got._errors ? Object.keys(got._errors).sort() : [];
  ok(gotErr.join('+') === raised.join('+'), label + ' _errors names',
    `got [${gotErr}] want [${raised}]`);
}

// ================================================================== A logic
console.log('\n== A. logic: canned proposals through the real core.detect vs PF.core.detect');
for (const c of doc.logic) {
  const cs = dec(c);
  const want = cs.raises ? { raises: cs.raises } : { result: cs.result };
  const before = fail;
  runStubbed('logic/' + c.id, cs.props, cs.w, cs.h, want, cs.called, true);
  const shown = cs.raises || cs.result.consensus;
  console.log('  ' + (fail === before ? 'ok  ' : 'FAIL') + ' ' + c.id.padEnd(34) + ' ' + shown);
}

// ================================================================== B replay
console.log('\n== B. replay: each image\'s recorded proposals through PF.core logic');
for (const im of doc.images) {
  const props = dec(im.props);
  for (const n of ['ac', 'rl', 'ss']) if (!(n in props)) props[n] = 'RAISE';   // never called in the reference either
  // a detector the reference never CALLED must not be confused with one
  // that raised: when the early exit fires, ss is absent from props and
  // from `called`; our stub for it is set to RAISE only so that calling
  // it at all would show up as a wrong _errors set AND a wrong call list.
  const want = { result: dec(im.result) };
  const before = fail;
  const rgba = { d: new Uint8Array(im.w * im.h * 4), w: im.w, h: im.h, cn: 4 };
  const called = [], log = {};
  installStubs(props, called, log);
  let got, err = null;
  try { got = PF.core.detect(rgba, 'fast'); } catch (e) { err = e; } finally { restore(); }
  const label = 'replay/' + im.id;
  ok(called.slice().sort().join('+') === im.called.join('+'), label + ' detectors invoked',
    `got ${called.slice().sort().join('+')} want ${im.called.join('+')}`);
  if (ok(err === null, label + ' no throw', err && err.message)) {
    cmpResult(label, got, want.result);
    ok(got._errors === undefined, label + ' no swallowed errors', JSON.stringify(got._errors));
  }
  const r = want.result;
  console.log('  ' + (fail === before ? 'ok  ' : 'FAIL') + ' ' + im.id.padEnd(26) +
    (im.w + 'x' + im.h).padStart(8) + '  ' + r.consensus.padEnd(20) + ' ' +
    String(r.cols).padStart(3) + ' x ' + String(r.rows).padEnd(3) + '  ' + r.step_x + ', ' + r.step_y);
}

// ================================================================== C' partial end-to-end
// Whichever detector ports already exist are run on the real pixels and
// compared with the proposals the reference's detector returned for the
// same image. This is NOT core's parity (it measures the sibling port) and
// is kept out of the pass/fail tally; it is printed so the reader knows,
// before the full end-to-end can run, whether the ports core will call
// agree with the proposals core was proven against.
console.log('\n== C\'. partial end-to-end: available detector ports vs recorded proposals (not tallied)');
{
  const PORT_KEY = { autocorr: 'ac', runlengths: 'rl', selfsim: 'ss' };
  for (const name of ['autocorr', 'runlengths', 'selfsim']) {
    if (haveReal.indexOf(name) < 0) { console.log('  %s: not loaded', name); continue; }
    const key = PORT_KEY[name];
    let match = 0, total = 0;
    const notes = [];
    for (const im of doc.images) {
      const wantAll = dec(im.props);
      if (!(key in wantAll)) continue;      // the reference never called it on this image
      total++;
      const want = wantAll[key];
      const rgba = { d: new Uint8Array(Buffer.from(im.rgba_hex, 'hex')), w: im.w, h: im.h, cn: 4 };
      let got, err = null;
      try { got = REAL[name].detect(rgba); } catch (e) { err = e; }
      if (err) { notes.push(im.id + ': THROW ' + err.message.split('\n')[0]); continue; }
      const diffs = [];
      for (const k of ['cols', 'rows']) if (got[k] !== want[k]) diffs.push(k + ' ' + got[k] + '!=' + want[k]);
      for (const k of ['step_x', 'step_y', 'score_x', 'score_y']) {
        if (!(k in want)) { if (k in got) diffs.push(k + ' present, absent in reference'); continue; }
        if (!Object.is(got[k], want[k])) diffs.push(k + ' ' + got[k] + '!=' + want[k]);
      }
      if (diffs.length === 0) match++; else notes.push(im.id + ': ' + diffs.join('; '));
    }
    console.log('  %s (PF.%s.detect): %d / %d images bit-exact on cols/rows/step/score', name, name, match, total);
    for (const n of notes) console.log('      ' + n);
  }
}

// ================================================================== C end-to-end
console.log('\n== C. end-to-end: real images through the real detector ports');
let e2e = 'skipped';
if (haveReal.length === 3) {
  e2e = 'ran';
  for (const im of doc.images) {
    const d = new Uint8Array(Buffer.from(im.rgba_hex, 'hex'));
    ok(d.length === im.w * im.h * 4, 'e2e/' + im.id + ' rgba length');
    const rgba = { d, w: im.w, h: im.h, cn: 4 };
    const before = fail;
    let got, err = null;
    const t0 = Date.now();
    try { got = PF.core.detect(rgba, 'fast', false, { strict: true }); } catch (e) { err = e; }
    const dt = Date.now() - t0;
    const label = 'e2e/' + im.id;
    if (ok(err === null, label + ' no throw', err && (err.stack || err.message))) {
      cmpResult(label, got, dec(im.result));
    }
    const r = dec(im.result);
    console.log('  %s %-28s want %-20s %3d x %-3d  got %s %s x %s  %s, %s  (%d ms)',
      fail === before ? 'ok  ' : 'FAIL', im.id, r.consensus, r.cols, r.rows,
      got ? got.consensus : 'THROW', got ? got.cols : '-', got ? got.rows : '-',
      got ? got.step_x : '-', got ? got.step_y : '-', dt);
  }
} else {
  const missing = ['autocorr', 'runlengths', 'selfsim'].filter(n => haveReal.indexOf(n) < 0);
  console.log('  SKIPPED: PF.%s not on PF (no detector port loaded from src/). ' +
    'This section proves nothing until they exist.', missing.join(', PF.'));
}

// ================================================================== D guards
console.log('\n== D. guards (JS-only; the reference has no counterpart)');
{
  const rgba = { d: new Uint8Array(16), w: 2, h: 2, cn: 4 };
  let m;
  try { PF.core.detect(rgba); m = 'no throw'; } catch (e) { m = e.message; }
  ok(m === 'full mode is not ported yet', 'default mode (full) throws', m);
  try { PF.core.detect(rgba, 'full'); m = 'no throw'; } catch (e) { m = e.message; }
  ok(m === 'full mode is not ported yet', 'mode "full" throws', m);
  try { PF.core.detect(rgba, 'medium'); m = 'no throw'; } catch (e) { m = e.message; }
  ok(/unknown mode "medium"/.test(m), 'unknown mode throws', m);
  try { PF.core.detect({ d: new Uint8Array(15), w: 2, h: 2, cn: 4 }, 'fast'); m = 'no throw'; } catch (e) { m = e.message; }
  ok(/rgba must be/.test(m), 'bad rgba length throws', m);
  try { PF.core.detect({ d: new Uint8Array(16), w: 2, h: 2 }, 'fast'); m = 'no throw'; } catch (e) { m = e.message; }
  ok(/rgba must be/.test(m), 'rgba without cn: 4 throws at entry (not swallowed per detector)', m);

  // missing port: with stubs installed for two of three, the third throws by NAME
  const called = [], log = {};
  installStubs({ ac: {}, rl: {}, ss: {} }, called, log);
  const keep = PF.selfsim; PF.selfsim = undefined;
  try { PF.core.detect(rgba, 'fast'); m = 'no throw'; } catch (e) { m = e.message; } finally { PF.selfsim = keep; restore(); }
  ok(/PF\.selfsim\.detect is not defined/.test(m), 'missing PF.selfsim throws by name', m);
  ok(called.length === 0, 'missing port is detected before any detector runs', called.join('+'));

  // strict: a raising detector propagates instead of being swallowed
  installStubs({ ac: 'RAISE', rl: { cols: 4, rows: 4, step_x: 1, step_y: 1 }, ss: { cols: 4, rows: 4, step_x: 1, step_y: 1 } }, [], {});
  try { PF.core.detect(rgba, 'fast', false, { strict: true }); m = 'no throw'; } catch (e) { m = e.message; } finally { restore(); }
  ok(m === 'stub ac raised', 'strict rethrows the detector error', m);

  ok(PF.detect === PF.core.detect, 'PF.detect aliases PF.core.detect');
  ok(PF.core.AGREE_TOL === 0.02 && PF.core.AGREE_BONUS === 0.25 && PF.core.VC_W === 0.20 &&
     PF.core.SMALLEST_QUALIFIED === 0.78, 'arbitration constants carried');
  console.log('  %d guard checks', 10);
}

// ================================================================== E size_close table
console.log('\n== E. _size_close table (%d rows from the reference)', doc.size_close.length);
{
  let bad = 0;
  for (const [ac, ar, bc, br, want] of doc.size_close) {
    const got = PF.core._size_close({ cols: ac, rows: ar }, { cols: bc, rows: br });
    if (!ok(got === want, `_size_close(${ac},${ar} | ${bc},${br})`, `got ${got} want ${want}`)) bad++;
  }
  console.log('  %d / %d agree', doc.size_close.length - bad, doc.size_close.length);
}

// ================================================================== summary
console.log('\n==================================================================');
console.log('checks: %d passed, %d failed; end-to-end: %s', pass, fail, e2e);
if (failures.length) {
  console.log('failures:');
  for (const f of failures.slice(0, 40)) console.log('  - ' + f);
  if (failures.length > 40) console.log('  ... and %d more', failures.length - 40);
}
if (fail > 0) process.exit(1);
if (e2e !== 'ran') {
  console.log('RESULT: logic + replay parity PASSED; end-to-end SKIPPED (no detector ports on PF) -> exit 2');
  process.exit(2);
}
console.log('RESULT: all sections PASSED -> exit 0');
process.exit(0);
