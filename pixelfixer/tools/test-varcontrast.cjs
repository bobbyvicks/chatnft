/* Node parity test for src/pf-23-varcontrast.js against
 * fixtures/varcontrast-parity.json (tools/parity-varcontrast.py).
 *
 * Every comparison is BIT-EXACT on float64 bytes (Object.is per value, so
 * -0 vs +0 and NaN are caught too). A miss prints the value count, max abs
 * difference and max ulp distance, so its size is visible, not only its
 * existence.
 *
 * What is replayed:
 *   - the scorer's internals (SAT digest, active points, tiles, variances)
 *     for the pipeline's own instance and a subsampling instance;
 *   - EVERY CellVarContrast method call the reference made while
 *     core.detect(mode="full"), fusion.detect and channels.fit_grid ran on
 *     each real image (one image per process on the python side), with the
 *     recorded arguments, and every z_of query the pipeline made;
 *   - the direct probes (half-integer steps, non-square pairs, early
 *     returns, VarContrast, _grid_cuts, _strip_variance, _cells_variance,
 *     _rect_sum, _sample_sat) on real and synthetic images;
 *   - np.log on every curve knot (exhaustive for the default min_step) and
 *     on 120000 random steps, against vc_log.
 * The "diag_" sections of the fixture are used only to LOCATE a miss.
 *
 * Ends with negative controls: three measured semantics are flipped through
 * PF.varcontrast._semantics and the test must go RED on each.
 *
 *   node tools/test-varcontrast.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
// the shims this module reads, then the module; no other leaf module is
// loaded, so a half-written neighbour cannot break (or fix) this test
for (const f of ['pf-00-base.js', 'pf-01-fft.js', 'pf-02-scipy.js', 'pf-03-cv2.js', 'pf-04-nprandom.js',
                 'pf-05-mathshim.js', 'pf-06-linalg.js', 'pf-23-varcontrast.js']) {
  (0, eval)(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));   // as a browser <script> would
}
const PF = globalThis.PF;
const V = PF.varcontrast;
const SRC_SHA = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'src', 'pf-23-varcontrast.js'))).digest('hex');

const FIX = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'fixtures', 'varcontrast-parity.json');
const t00 = Date.now();
const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('fixtures: numpy %s / scipy %s / cv2 %s / python %s (%s)', data.meta.numpy, data.meta.scipy,
  data.meta.cv2, data.meta.python, data.meta.machine);
console.log('reference: %s', data.meta.reference);
console.log('port: %s  (src sha256 %s)\n', PF.versionVarcontrast, SRC_SHA.slice(0, 16));

// ------------------------------------------------------------------ helpers
function unhexF64(hex) {
  const buf = Buffer.from(hex, 'hex'), out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
  return out;
}
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
function ulp64(x) { f64v[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }
function sha256(ta) { return crypto.createHash('sha256').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex'); }
function flatWant(x, out) {
  if (x === null) out.push(null);
  else if (typeof x === 'string') { for (const v of unhexF64(x)) out.push(v); }
  else if (Array.isArray(x)) for (const e of x) flatWant(e, out);
  else throw new Error('bad fixture value ' + JSON.stringify(x));
  return out;
}
function flatGot(x, out) {
  if (typeof x === 'number') out.push(x);
  else if (ArrayBuffer.isView(x)) { for (const v of x) out.push(v); }
  else if (Array.isArray(x)) for (const e of x) flatGot(e, out);
  else throw new Error('bad port value ' + String(x));
  return out;
}
function compare(got, want) {
  if (got.length !== want.length) return { ok: false, lenMismatch: true, got: got.length, want: want.length, n: 0 };
  let ndiff = 0, maxAbs = 0, maxUlp = 0n, first = -1;
  for (let i = 0; i < want.length; i++) {
    if (Object.is(got[i], want[i])) continue;
    ndiff++;
    if (first < 0) first = i;
    const d = Math.abs(got[i] - want[i]);
    if (d > maxAbs || d !== d) maxAbs = d;
    let u = ulp64(got[i]) - ulp64(want[i]); if (u < 0n) u = -u;
    if (u > maxUlp) maxUlp = u;
  }
  return { ok: ndiff === 0, ndiff, maxAbs, maxUlp, first, n: want.length };
}

let pass = 0, fail = 0, values = 0;
const failures = [];
let QUIET = false;
function report(label, r, extra) {
  values += r.n || 0;
  if (r.ok) { pass++; return true; }
  fail++;
  const msg = r.lenMismatch ? `length ${r.got} != ${r.want}`
    : `${r.ndiff}/${r.n} differ, first@${r.first}, maxAbs=${r.maxAbs.toExponential(3)}, maxUlp=${r.maxUlp}`;
  failures.push(label + ': ' + msg + (extra ? ' ' + extra : ''));
  if (!QUIET) console.log('   FAIL ' + label + ': ' + msg + (extra ? ' ' + extra : ''));
  return false;
}
function cmpVal(label, got, want) { return report(label, compare(flatGot(got, []), flatWant(want, []))); }
function cmpEq(label, got, want) {
  const ok = got === want;
  return report(label, { ok, ndiff: ok ? 0 : 1, n: 1, first: 0, maxAbs: NaN, maxUlp: 0n }, ok ? '' : `got ${got} want ${want}`);
}

function decodeArg(a) {
  if (a === null) return null;
  if (typeof a === 'string') { const v = unhexF64(a); return v.length === 1 ? v[0] : v; }
  if (Array.isArray(a)) return a.map(decodeArg);
  if (a && typeof a === 'object' && 'i' in a) return a.i;
  throw new Error('bad arg ' + JSON.stringify(a));
}
function argText(args) {
  return args.map(a => {
    const v = decodeArg(a);
    if (ArrayBuffer.isView(v)) return `[${v.length} values]`;
    return JSON.stringify(v);
  }).join(', ');
}
function imageOf(c) {
  const d = new Uint8Array(Buffer.from(c.rgba_b64, 'base64'));
  const h = crypto.createHash('sha256').update(d).digest('hex');
  if (h !== c.rgba_sha256) throw new Error(c.name + ': decoded image bytes do not match the fixture digest');
  return { d, w: c.w, h: c.h, cn: c.cn };
}

// ----------------------------------------------------------- replay a call
function replay(obj, m, args) {
  const a = args.map(decodeArg);
  switch (m) {
    case 'contrast': return obj.contrast(a[0], a[1], a[2]);
    case 'contrast_local': return obj.contrast_local(a[0], a[1], a[2]);
    case 'grid_variance': return obj.grid_variance(a[0], a[1], a[2], a[3]);
    case 'pair_q': return obj.pair_q(a[0], a[1], a[2]);
    case 'best_pair': return obj.best_pair(a[0], a[1]);
    case 'scored_curve': return obj.scored_curve(a[0], a[1]);
    case 'refine': return obj.refine(a[0], a[1], a[2]);
    case 'z_channel': return obj.z_channel(a[0], a[1])[1];
    case 'ax_contrast': return obj.contrast(a[0], a[1], a[2]);
    case 'ax_curve': return obj.curve(a[0], ArrayBuffer.isView(a[1]) ? a[1] : new Float64Array([a[1]]), a[2]);
    case 'ax_refine': return obj.refine(a[0], a[1], a[2], a[3]);
    case 'ax_candidates': return obj.candidates(a[0], a[1], a[2], a[3]);
    default: throw new Error('unknown method ' + m);
  }
}

function instanceFor(img, label, cache) {
  if (cache[label]) return cache[label];
  let o;
  if (label === 'axis') o = new V.VarContrast(img);
  else {
    const m = /^cell_mp(\d+)_t(\d+)$/.exec(label);
    if (!m) throw new Error('unknown instance label ' + label);
    o = new V.CellVarContrast(img, +m[1], +m[2]);
  }
  cache[label] = o;
  return o;
}

function checkCellInternals(L, vc, want) {
  let ok = true;
  ok = cmpEq(`${L}.H`, vc.H, want.H) && ok;
  ok = cmpEq(`${L}.W`, vc.W, want.W) && ok;
  ok = cmpEq(`${L}.C`, vc.C, want.C) && ok;
  const shaOk = vc.SC ? sha256(vc.SC) === want.SC_sha256 : false;
  ok = cmpEq(`${L}.SC sha256`, shaOk, true) && ok;
  if (!shaOk && want.diag_SC_rows) {
    const W1 = vc.W + 1, C1 = vc.C + 1;
    for (const y of Object.keys(want.diag_SC_rows)) {
      const r = compare(Array.from(vc.SC.subarray(+y * W1 * C1, (+y + 1) * W1 * C1)), unhexF64(want.diag_SC_rows[y]));
      console.log(`      diag: SC row ${y}: ${r.ok ? 'equal' : r.ndiff + '/' + r.n + ' differ, maxUlp ' + r.maxUlp}`);
    }
  }
  if (want.SC) ok = report(`${L}.SC`, compare(vc.SC, unhexF64(want.SC))) && ok;
  ok = cmpVal(`${L}.total_var`, vc.total_var, want.total_var) && ok;
  ok = cmpVal(`${L}.active_var`, vc.active_var, want.active_var) && ok;
  if (!ok) {
    const db = want.diag_bvar, r = compare(Array.from(vc._bvar), unhexF64(db.bvar));
    console.log(`      diag: bvar ${r.ok ? 'equal' : r.ndiff + '/' + r.n + ' differ, maxUlp ' + r.maxUlp}; reference thresh ${unhexF64(db.thresh)[0]} n_active ${db.n_active}`);
  }
  ok = cmpEq(`${L}.npts`, vc.px.length, want.npts) && ok;
  ok = cmpVal(`${L}.px`, vc.px, want.px) && ok;
  ok = cmpVal(`${L}.py`, vc.py, want.py) && ok;
  ok = cmpEq(`${L}.n_tiles`, vc.n_tiles, want.n_tiles) && ok;
  ok = report(`${L}.tile_id`, compare(Array.from(vc.tile_id), want.tile_id)) && ok;
  return ok;
}

// ------------------------------------------------------------------ images
const perMethod = {}, perSource = {};
function tally(book, key, ok) { const t = book[key] || (book[key] = { pass: 0, fail: 0 }); ok ? t.pass++ : t.fail++; }
const pipelineInstanceChecks = [];
let zqPass = 0, zqFail = 0, zqPipeline = 0;

console.log('images:');
for (const c of data.images) {
  const t0 = Date.now();
  const img = imageOf(c);
  const cache = {};
  const L0 = c.name;
  const failBefore = fail;
  if (c.cell_error) {
    let threw = false;
    try { new V.CellVarContrast(img); } catch (e) { threw = true; }
    cmpEq(`${L0}.CellVarContrast throws like the reference (${c.cell_error})`, threw, true);
  }
  if (c.cell) {
    const vc = instanceFor(img, 'cell_mp2600_t112', cache);
    checkCellInternals(`${L0}.cell`, vc, c.cell);
    for (const k of ['cell_mp300', 'cell_mp40']) {
      if (!c[k]) continue;
      const lab = k === 'cell_mp300' ? 'cell_mp300_t40' : 'cell_mp40_t16';
      checkCellInternals(`${L0}.${k}`, instanceFor(img, lab, cache), c[k]);
    }
    // every instance the python side built (pipeline, rebuild, direct) must
    // be the same object state as the one dumped - else a replay would
    // apply recorded arguments to a different scorer
    const wantByLabel = { cell_mp2600_t112: c.cell, cell_mp300_t40: c.cell_mp300, cell_mp40_t16: c.cell_mp40 };
    for (const inst of c.instances) {
      const vcj = instanceFor(img, inst.label, cache);
      const ti = new BigInt64Array(vcj.tile_id.length);
      for (let i = 0; i < ti.length; i++) ti[i] = BigInt(vcj.tile_id[i]);
      const same = inst.SC_sha256 === sha256(vcj.SC) && inst.px_sha256 === sha256(vcj.px) &&
        inst.py_sha256 === sha256(vcj.py) && inst.tile_sha256 === sha256(ti) &&
        inst.SC_sha256 === wantByLabel[inst.label].SC_sha256;
      pipelineInstanceChecks.push(same);
      cmpEq(`${L0}.instance(${inst.label}, built by ${inst.source}) digests`, same, true);
    }
    // direct dumps
    const pr = c.cell_probe;
    for (const cv of pr.cells_variance) {
      const a = cv.args.map(decodeArg);
      cmpVal(`${L0}._cells_variance(${a.join(', ')})`, vc._cells_variance(a[0], a[1], a[2], a[3]), cv.out);
    }
    const rs = pr.rect_sum;
    cmpVal(`${L0}._rect_sum(S1)`, V.CellVarContrast._rect_sum(vc.S1, rs.ys, rs.xs, rs.size).d, rs.S1);
    cmpVal(`${L0}._rect_sum(S2)`, V.CellVarContrast._rect_sum(vc.S2, rs.ys, rs.xs, rs.size).d, rs.S2);
    const ss = pr.sample_sat, pyv = unhexF64(ss.pos_y), pxv = unhexF64(ss.pos_x);
    cmpVal(`${L0}._sample_sat(S1)`, vc._sample_sat(vc.S1, pyv, pxv), ss.S1);
    cmpVal(`${L0}._sample_sat(S2)`, vc._sample_sat(vc.S2, pyv, pxv), ss.S2);
  }
  // axis internals and cuts
  {
    const ax = instanceFor(img, 'axis', cache), ai = c.axis.internals;
    cmpEq(`${L0}.axis.W`, ax.W, ai.W); cmpEq(`${L0}.axis.H`, ax.H, ai.H);
    cmpEq(`${L0}.axis.cx`, ax.cx, ai.cx); cmpEq(`${L0}.axis.cy`, ax.cy, ai.cy);
    cmpVal(`${L0}.axis.S1x`, ax.S1x.d, ai.S1x); cmpVal(`${L0}.axis.S2x`, ax.S2x, ai.S2x);
    cmpVal(`${L0}.axis.S1y`, ax.S1y.d, ai.S1y); cmpVal(`${L0}.axis.S2y`, ax.S2y, ai.S2y);
    cmpVal(`${L0}.axis.total_x`, ax.total_x, ai.total_x); cmpVal(`${L0}.axis.total_y`, ax.total_y, ai.total_y);
    for (const g of c.axis.grid_cuts) {
      let cuts;
      if (g.cuts_direct) cuts = unhexF64(g.cuts_direct);
      else {
        const st = unhexF64(g.step)[0], ph = unhexF64(g.phase)[0];
        cuts = V._grid_cuts(g.L, st, ph);
        cmpVal(`${L0}._grid_cuts(${g.L}, ${st}, ${ph})`, cuts, g.cuts);
        cuts = unhexF64(g.cuts);        // downstream takes the REFERENCE's cuts
      }
      cmpVal(`${L0}._strip_variance(${cuts.length} cuts)`, V._strip_variance(ax.S1x, ax.S2x, ax.cx, cuts), g.var_x);
    }
  }
  // recorded method calls (pipeline + direct)
  let nrec = 0, nrecFail = 0;
  for (const label of Object.keys(c.calls)) {
    const obj = instanceFor(img, label, cache);
    for (const rec of c.calls[label]) {
      nrec++;
      let ok;
      try {
        ok = cmpVal(`${L0}.${label}.${rec.m}(${argText(rec.args)}) [${rec.src.join(',')}]`, replay(obj, rec.m, rec.args), rec.out);
      } catch (e) {
        ok = false; fail++; failures.push(`${L0}.${label}.${rec.m}: threw ${e.message}`);
        console.log(`   FAIL ${L0}.${label}.${rec.m}: threw ${e.message}`);
      }
      if (!ok) nrecFail++;
      tally(perMethod, rec.m, ok);
      for (const s of rec.src) tally(perSource, s, ok);
    }
  }
  // z_of queries: one z_channel per (instance, arguments), as recorded
  let nzq = 0;
  for (const key of Object.keys(c.zq)) {
    const label = key.split('|')[0];
    const obj = instanceFor(img, label, cache);
    const ents = c.zq[key];
    const za = ents[0].zargs.map(decodeArg);
    const z_of = obj.z_channel(za[0], za[1])[0];
    for (const e of ents) {
      nzq++;
      const st = unhexF64(e.step)[0];
      const ok = cmpVal(`${L0}.${key}.z_of(${st}) [${e.src.join(',')}]`, z_of(st), e.out);
      ok ? zqPass++ : zqFail++;
      if (e.src.some(s => s === 'core' || s === 'fusion' || s === 'fit_grid')) zqPipeline++;
      for (const s of e.src) tally(perSource, 'z_of@' + s, ok);
    }
  }
  if (c.rng_check) {
    for (const k of ['rebuilt_sc_equal', 'rebuilt_curve_equal', 'rebuilt_cands_equal']) cmpEq(`${L0}.python rng_check.${k}`, c.rng_check[k], true);
    cmpEq(`${L0}.python dup_mismatch (a recorded call answered two ways)`, c.dup_mismatch.length, 0);
    // fusion.detect caches its channel matrices on disk; a hit would have
    // skipped every z_of query it makes, silently shrinking this fixture
    cmpEq(`${L0}.python fusion cache was a miss (matrices computed)`, c.fusion_cache_files_written, 1);
  }
  const srcs = [...new Set(Object.values(c.calls).flat().flatMap(r => r.src))].sort();
  console.log(`   ${L0.padEnd(21)} ${String(c.w).padStart(4)}x${String(c.h).padEnd(4)} cn=${c.cn} calls ${nrec - nrecFail}/${nrec} zq ${nzq}` +
    ` ${c.rng_check ? 'kmeans-before-rebuild=' + c.rng_check.kmeans_calls_before_rebuild : ''} srcs=${srcs.join(',')}` +
    `  ${fail === failBefore ? 'ok' : 'FAIL'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------------ np.log
console.log('\nnp.log vs vc_log / Math.log:');
{
  const kn = unhexF64(data.log.knots), kl = unhexF64(data.log.knots_log);
  const rn = unhexF64(data.log.rand), rl = unhexF64(data.log.rand_log);
  const g1 = Array.from(kn, V.vc_log), g2 = Array.from(rn, V.vc_log);
  const r1 = compare(g1, kl);
  report(`vc_log on all ${kn.length} curve knots (exhaustive for min_step=2.0)`, r1);
  const r2 = compare(g2, rl);
  const m1 = compare(Array.from(kn, Math.log), kl), m2 = compare(Array.from(rn, Math.log), rl);
  console.log(`   knots : vc_log ${r1.ndiff}/${r1.n} differ   Math.log ${m1.ndiff}/${m1.n} differ`);
  console.log(`   random: vc_log ${r2.ndiff}/${r2.n} differ (maxUlp ${r2.maxUlp})   Math.log ${m2.ndiff}/${m2.n} differ (maxUlp ${m2.maxUlp})`);
  console.log(`   python: np.log scalar path == array path on 5000: ${data.log.scalar_equals_array}`);
  var LOG_RANDOM_MISSES = r2.ndiff;   // reported, not failed: see the summary
}

// --------------------------------------------------------- negative controls
console.log('\nnegative controls (each must go RED):');
const SEM = V._semantics;
function control(name, flag, fn) {
  const saved = { pass, fail, values, nf: failures.length };
  SEM[flag] = false;
  QUIET = true;
  let red = 0, total = 0;
  try { const o = fn(); red = o.red; total = o.total; }
  finally { SEM[flag] = true; QUIET = false; pass = saved.pass; fail = saved.fail; values = saved.values; failures.length = saved.nf; }
  const ok = red > 0;
  if (!ok) { fail++; failures.push(`negative control ${name} did NOT go red`); } else pass++;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${name}: ${red}/${total} comparisons went red with ${flag}=false`);
}
function overRecords(filter) {
  let red = 0, total = 0;
  for (const c of data.images) {
    const img = imageOf(c), cache = {};
    for (const label of Object.keys(c.calls)) {
      for (const rec of c.calls[label]) {
        if (!filter(rec, label)) continue;
        total++;
        let ok;
        try { ok = compare(flatGot(replay(instanceFor(img, label, cache), rec.m, rec.args), []), flatWant(rec.out, [])).ok; }
        catch (e) { ok = false; }
        if (!ok) red++;
      }
    }
  }
  return { red, total };
}
control('np.rint half-to-even -> Math.round (contrast)', 'rintHalfEven',
  () => overRecords((r, l) => r.m === 'contrast' && l !== 'axis' && r.src.indexOf('extra') >= 0));
control('premultiplied alpha -> raw rgb (contrast)', 'premultiply',
  () => overRecords((r, l) => r.m === 'contrast' && l === 'cell_mp2600_t112' && r.src.indexOf('extra') >= 0));
control('vc_log -> Math.log (z_of queries)', 'correctLog', () => {
  let red = 0, total = 0;
  for (const c of data.images) {
    if (!c.cell) continue;
    const img = imageOf(c), cache = {};
    for (const key of Object.keys(c.zq)) {
      const ents = c.zq[key], za = ents[0].zargs.map(decodeArg);
      const z_of = instanceFor(img, key.split('|')[0], cache).z_channel(za[0], za[1])[0];
      for (const e of ents) { total++; if (!Object.is(z_of(unhexF64(e.step)[0]), unhexF64(e.out)[0])) red++; }
    }
  }
  return { red, total };
});

// ------------------------------------------------------------------ summary
console.log('\nper method (recorded calls replayed):');
for (const k of Object.keys(perMethod).sort()) console.log(`   ${k.padEnd(16)} ${perMethod[k].pass} pass  ${perMethod[k].fail} fail`);
console.log('per source (a call recorded from several sources counts once in each):');
for (const k of Object.keys(perSource).sort()) console.log(`   ${k.padEnd(16)} ${perSource[k].pass} pass  ${perSource[k].fail} fail`);
console.log(`z_of queries: ${zqPass} pass, ${zqFail} fail (${zqPipeline} of them asked by core/fusion/fit_grid)`);
console.log(`pipeline/rebuild instances with the dumped state: ${pipelineInstanceChecks.filter(Boolean).length}/${pipelineInstanceChecks.length}`);
console.log(`\ncomparisons: ${pass + fail}   pass: ${pass}   fail: ${fail}`);
console.log(`individual value comparisons (bitwise): ${values}`);
console.log(`time: ${((Date.now() - t00) / 1000).toFixed(1)}s`);
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures.slice(0, 60)) console.log('   ' + f); if (failures.length > 60) console.log(`   ... ${failures.length - 60} more`); }
process.exitCode = fail ? 1 : 0;
