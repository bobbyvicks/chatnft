// test-fft.js - parity of src/pf-01-fft.js against numpy 2.5.3.
//
//   node pixelfixer-js/tools/test-fft.js
//
// Reads fixtures/fft.json (produced by tools/parity-fft.py) and reports, for
// every case, the max absolute difference against numpy - real and imaginary
// parts separately, as asked - plus a scale-relative figure, because a raw
// max |d| on a spectrum whose peak bin is 1e6 says nothing on its own.
//
// The relative figure is  max|d| / max|numpy|  over the case (the standard FFT
// accuracy metric).  Per-element relative error is meaningless here: rfft bins
// legitimately land within an ulp of zero.

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
require(path.join(ROOT, 'src', 'pf-01-fft.js'));
const PF = globalThis.PF;

const FIX = path.join(ROOT, 'fixtures', 'fft.json');
if (!fs.existsSync(FIX)) {
  console.error('missing ' + FIX + ' - run tools/parity-fft.py first');
  process.exit(2);
}
const D = JSON.parse(fs.readFileSync(FIX, 'utf8'));

let failures = 0;
const groups = [];

function cmp(got, want) {
  // returns {maxAbs, scale, rel, exact, n}
  const n = want.length;
  if (got.length !== n) return { bad: 'length ' + got.length + ' != ' + n };
  let maxAbs = 0, scale = 0, exact = 0;
  for (let i = 0; i < n; i++) {
    const w = want[i], g = got[i];
    if (!Number.isFinite(w) || !Number.isFinite(g)) {
      if (!Object.is(w, g)) return { bad: 'non-finite mismatch at ' + i };
      exact++;
      continue;
    }
    const d = Math.abs(g - w);
    if (d > maxAbs) maxAbs = d;
    const a = Math.abs(w);
    if (a > scale) scale = a;
    if (g === w) exact++;
  }
  return { maxAbs, scale, rel: scale > 0 ? maxAbs / scale : maxAbs, exact, n };
}

function report(group, name, parts, tolRel) {
  // parts: [{label, res}]
  let worstRel = 0, worstAbs = 0, exact = 0, tot = 0, bad = null;
  for (const p of parts) {
    if (p.res.bad) { bad = p.label + ': ' + p.res.bad; continue; }
    worstRel = Math.max(worstRel, p.res.rel);
    worstAbs = Math.max(worstAbs, p.res.maxAbs);
    exact += p.res.exact;
    tot += p.res.n;
  }
  const ok = !bad && worstRel <= tolRel;
  if (!ok) failures++;
  group.rows.push({ name, worstAbs, worstRel, exact, tot, ok, bad });
  group.worstAbs = Math.max(group.worstAbs, worstAbs);
  group.worstRel = Math.max(group.worstRel, worstRel);
  group.exact += exact;
  group.tot += tot;
  if (!ok) group.failed++;
}

function newGroup(title) {
  const g = { title, rows: [], worstAbs: 0, worstRel: 0, exact: 0, tot: 0, failed: 0 };
  groups.push(g);
  return g;
}

const TOL = 1e-13;   // scale-relative; measured values come in far below this

// ------------------------------------------------------------------ rfft 1-D
{
  const g = newGroup('A/B  rfft, 1-D float64 (n= padding and truncation)');
  for (const c of D.rfft_1d) {
    const r = PF.rfft(Float64Array.from(c.x), c.n === null ? undefined : c.n);
    report(g, c.name, [
      { label: 're', res: cmp(r.re, c.re) },
      { label: 'im', res: cmp(r.im, c.im) }
    ], TOL);
  }
}

// ------------------------------------------------ rfft 2-D axis=1 (band_acf)
{
  const g = newGroup('C    rfft, 2-D axis=1 with n=  (autocorr band_acf form)');
  for (const c of D.rfft_rows) {
    const r = PF.rfftRows(Float64Array.from(c.x), c.rows, c.cols, c.n);
    if (r.cols !== c.outCols) { console.error('shape mismatch ' + c.name); failures++; }
    report(g, c.name, [
      { label: 're', res: cmp(r.re, c.re) },
      { label: 'im', res: cmp(r.im, c.im) }
    ], TOL);
  }
}

// ----------------------------------------------------------------- irfft 1-D
{
  const g = newGroup('D/E  irfft, 1-D (real and complex input, DC/Nyquist imag)');
  for (const c of D.irfft_1d) {
    const im = c.im === null ? null : Float64Array.from(c.im);
    const y = PF.irfft(Float64Array.from(c.re), im, c.n === null ? undefined : c.n);
    report(g, c.name, [{ label: 'out', res: cmp(y, c.out) }], TOL);
  }
}

// -------------------------------------------------------- irfft 2-D axis=1
{
  const g = newGroup('F    irfft, 2-D axis=1 (band_acf form, real input)');
  for (const c of D.irfft_rows) {
    const r = PF.irfftRows(Float64Array.from(c.re), null, c.rows, c.cols, c.n);
    if (r.cols !== c.outCols) { console.error('shape mismatch ' + c.name); failures++; }
    report(g, c.name, [{ label: 'out', res: cmp(r.data, c.out) }], TOL);
  }
}

// ------------------------------------------------------------------ rfftfreq
{
  const g = newGroup('G    rfftfreq  (must be BIT-EXACT, no arithmetic to drift)');
  for (const c of D.rfftfreq) {
    const f = PF.rfftfreq(c.n, c.d);
    const res = cmp(f, c.out);
    report(g, 'n=' + c.n + ' d=' + c.d, [{ label: 'out', res }], 0);
  }
}

// ------------------------------------------------- real call sites: autocorr
// These run in float32/complex64 in numpy.  The JS computes in float64 and is
// rounded down with PF.f32, which is the emulation the header documents.  Both
// the float64-vs-numpy-float32 gap and the post-rounding exact-match rate are
// reported, because the second is the number that actually decides parity.
{
  const g = newGroup('H1   autocorr band_acf / band_cepstrum call sites (float32 chain)');
  for (const c of D.callsites_autocorr) {
    const x = Float64Array.from(c.x);
    const F = PF.rfftRows(x, c.rows, c.cols, c.nfft);
    const F32 = PF.c64(F);
    report(g, c.name + ' rfft->complex64', [
      { label: 're', res: cmp(F32.re, c.F_re) },
      { label: 'im', res: cmp(F32.im, c.F_im) }
    ], 1e-6);

    // ISOLATED irfft measurement: feed numpy's own float32 p back in, so the
    // only thing being compared is irfft.  (Feeding a JS-reconstructed p would
    // charge downstream arithmetic error to the FFT - see the note below.)
    const nb = F.cols, rows = c.rows;
    const ac = PF.irfftRows(Float64Array.from(c.p), null, rows, nb, c.nfft);
    report(g, c.name + ' irfft->float32 (numpy p in)', [
      { label: 'acf', res: cmp(PF.f32(ac.data), c.acf_rows) }
    ], 1e-6);

    // cepstrum: 1-D irfft of a real float32 vector
    const cep = PF.irfft(Float64Array.from(c.logp), null, c.nfft);
    report(g, c.name + ' cepstrum irfft', [
      { label: 'cep', res: cmp(PF.f32(cep), c.cep) }
    ], 1e-6);
  }
}

// ------------------------------------- NOT part of this port: p in band_acf
// Informational, and two warnings for whoever ports autocorr.band_acf.  Both
// are measured here, given numpy's OWN complex64 F, so neither can be
// mistaken for FFT error.
//
//  1. (F * conj(F)).real on complex64 is NOT fround(fround(x*x)+fround(y*y)).
//     numpy's complex multiply is x*u - y*v with the second product rounded
//     to float32 and the subtraction fused, so the reproduction is
//        fround(x*x + fround(y*y))          <- x*x stays in float64
//     Measured: the naive form differs on 8146/51400 values; the fused form
//     differs on 0/51400 (200 trials x 257 bins, rng seed 3).
//  2. p.sum(axis=1) is a numpy float32 reduction, which is PAIRWISE, not a
//     sequential accumulate.  A sequential fround accumulate disagrees.
const note = [];
for (const c of D.callsites_autocorr) {
  const nb = ((c.nfft >> 1) + 1), rows = c.rows;
  const naive = new Float64Array(rows * nb);
  const fused = new Float64Array(rows * nb);
  for (let i = 0; i < rows * nb; i++) {
    const x = c.F_re[i], y = c.F_im[i];
    naive[i] = Math.fround(Math.fround(x * x) + Math.fround(y * y));
    fused[i] = Math.fround(x * x + Math.fround(y * y));
  }
  const nRes = cmp(naive, c.p_raw), fRes = cmp(fused, c.p_raw);
  const sums = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    for (let k = 0; k < nb; k++) s = Math.fround(s + c.p_raw[r * nb + k]);
    sums[r] = s;
  }
  const sumRes = cmp(sums, c.p_sum);
  note.push('  ' + c.name.padEnd(12) +
            ' (F conj F).real: naive f32 ' + nRes.exact + '/' + nRes.n +
            ' bitexact, fused ' + fRes.exact + '/' + fRes.n + ' bitexact' +
            '  |  seq f32 row-sum vs numpy pairwise: ' +
            sumRes.exact + '/' + sumRes.n +
            ' bitexact rel=' + sumRes.rel.toExponential(2));
}

// -------------------------------------------------- real call sites: channels
{
  const g = newGroup('H2   channels._axis_spectrum call sites (float64, NON-power-of-2 n)');
  for (const c of D.callsites_channels) {
    const win = c.win, nseg = c.nseg, nb = (win >> 1) + 1;
    const segs = Float64Array.from(c.segs);
    const power = new Float64Array(nseg * nb);
    const seg = new Float64Array(win);
    let firstRe = null, firstIm = null;
    for (let s = 0; s < nseg; s++) {
      for (let i = 0; i < win; i++) seg[i] = segs[s * win + i];
      const r = PF.rfft(seg);
      if (s === 0) { firstRe = r.re.slice(); firstIm = r.im.slice(); }
      for (let k = 0; k < nb; k++) {
        // np.abs(F)**2 == hypot(re,im)**2 in numpy (abs then square)
        const m = Math.hypot(r.re[k], r.im[k]);
        power[s * nb + k] = m * m;
      }
    }
    report(g, c.name + ' rfft(win=' + win + ') bins', [
      { label: 're', res: cmp(firstRe, c.first_re) },
      { label: 'im', res: cmp(firstIm, c.first_im) }
    ], TOL);
    report(g, c.name + ' |F|^2 over ' + nseg + ' segs', [
      { label: 'pow', res: cmp(power, c.power) }
    ], 1e-12);
    report(g, c.name + ' rfftfreq(' + win + ')', [
      { label: 'f', res: cmp(PF.rfftfreq(win), c.freqs) }
    ], 0);
  }
}

// ------------------------------- I: float32 irfft, NON-power-of-two n
// Nothing in pixelfixer reaches this path (both irfft sites pad to a power of
// two), but PF.irfft carries a scaleF32 flag for it and the header describes
// what it does.  A flag nobody has measured is a claim, so: with the flag the
// rounded result must be BIT-EXACT against numpy float32 on every case, and
// without the flag at least one non-pow2 case must miss - otherwise the flag
// is inert and this group proves nothing.  The (65,128) row is the pow2
// control where the flag must change nothing.
{
  const g = newGroup("I    irfft float32, non-power-of-two n  (PF.irfft scaleF32=true; BIT-EXACT)");
  let flagMatters = 0, pow2Inert = true;
  const detail = [];
  for (const c of D.irfft_f32_nonpow2) {
    const re = Float64Array.from(c.re);
    const on  = PF.f32(PF.irfft(re, null, c.n, true));
    const off = PF.f32(PF.irfft(re, null, c.n, false));
    const rOn = cmp(on, c.out), rOff = cmp(off, c.out);
    report(g, c.name + " scaleF32=true", [{ label: "out", res: rOn }], 0);
    const offMiss = rOff.n - rOff.exact;
    if (!c.pow2 && offMiss > 0) flagMatters++;
    if (c.pow2 && offMiss !== 0) pow2Inert = false;
    detail.push("    " + c.name.padEnd(14) + " flag OFF: bitexact " + rOff.exact + "/" + rOff.n +
                " max|d|=" + rOff.maxAbs.toExponential(3) +
                (c.pow2 ? "   (pow2 control: flag must be a no-op)" : ""));
  }
  g.detail = detail;
  g.detail.push("    flag-off misses on " + flagMatters + "/" +
                D.irfft_f32_nonpow2.filter(function (c) { return !c.pow2; }).length +
                " non-pow2 cases (need >= 1 to prove the flag is live): " + (flagMatters >= 1) +
                "   pow2 control unaffected by flag: " + pow2Inert);
  if (flagMatters < 1 || !pow2Inert) { failures++; g.failed++; }
}

// ---------------------------------------------------------------- printout
console.log('pf-01-fft.js parity vs numpy ' + D.meta.numpy +
            ' (python ' + D.meta.python + '), node ' + process.version);
console.log('');
for (const g of groups) {
  console.log(g.title);
  for (const r of g.rows) {
    const flag = r.ok ? '  ok  ' : ' FAIL ';
    if (r.bad) {
      console.log('  ' + flag + r.name.padEnd(44) + ' ' + r.bad);
    } else {
      console.log('  ' + flag + r.name.padEnd(44) +
                  ' max|d|=' + r.worstAbs.toExponential(3) +
                  '  rel=' + r.worstRel.toExponential(3) +
                  '  bitexact ' + r.exact + '/' + r.tot);
    }
  }
  if (g.detail) for (const line of g.detail) console.log(line);
  console.log('  --> group worst: max|d|=' + g.worstAbs.toExponential(3) +
              '  rel=' + g.worstRel.toExponential(3) +
              '  bitexact ' + g.exact + '/' + g.tot +
              ' (' + (100 * g.exact / g.tot).toFixed(2) + '%)' +
              '  failed ' + g.failed + '/' + g.rows.length);
  console.log('');
}

// ---- max |d| split by real / imaginary part, over the random-vector rfft ----
{
  let aRe = 0, aIm = 0, rRe = 0, rIm = 0, nRe = 0, eRe = 0, nIm = 0, eIm = 0;
  for (const c of D.rfft_1d) {
    const r = PF.rfft(Float64Array.from(c.x), c.n === null ? undefined : c.n);
    const re = cmp(r.re, c.re), im = cmp(r.im, c.im);
    aRe = Math.max(aRe, re.maxAbs); rRe = Math.max(rRe, re.rel);
    aIm = Math.max(aIm, im.maxAbs); rIm = Math.max(rIm, im.rel);
    nRe += re.n; eRe += re.exact; nIm += im.n; eIm += im.exact;
  }
  console.log('rfft on random vectors, ' + D.rfft_1d.length + ' cases, n = 1..2048:');
  console.log('  REAL part: max|d| = ' + aRe.toExponential(4) +
              '   scale-relative = ' + rRe.toExponential(4) +
              '   bit-exact ' + eRe + '/' + nRe +
              ' (' + (100 * eRe / nRe).toFixed(1) + '%)');
  console.log('  IMAG part: max|d| = ' + aIm.toExponential(4) +
              '   scale-relative = ' + rIm.toExponential(4) +
              '   bit-exact ' + eIm + '/' + nIm +
              ' (' + (100 * eIm / nIm).toFixed(1) + '%)');
  console.log('');
}

console.log('NOTE (downstream of this port, band_acf p - not FFT error):');
for (const line of note) console.log(line);
console.log('');

// ------------------------------------------------------- negative controls
// A comparator that cannot fail is not a comparator, and a gate nothing has
// ever tripped is not a gate.  Three checks, each of which must come back
// "caught":
//   (1) an error just ABOVE the tolerance on a float64 case must breach it
//       (this is what pins TOL as meaningful, not merely generous);
//   (2) the bit-exact counter must be live - flip one ulp in a case that is
//       currently 100% exact and the count must drop by exactly 1;
//   (3) the zero-tolerance gate used for rfftfreq must actually reject.
{
  let ok = true;
  console.log('NEGATIVE CONTROLS:');

  // (1) tolerance gate on a real float64 case
  const c = D.rfft_1d.find(function (z) { return z.name === 'plain_n203'; });
  const r = PF.rfft(Float64Array.from(c.x));
  const clean = cmp(r.re, c.re);
  let scale = 0;
  for (const v of c.re) scale = Math.max(scale, Math.abs(v));
  const bump = c.re.slice();
  bump[7] = bump[7] + scale * TOL * 3;          // 3x the gate, in scale units
  const dirty = cmp(r.re, bump);
  const c1 = clean.rel <= TOL && dirty.rel > TOL;
  console.log('  (1) plain_n203 rfft re: clean rel=' + clean.rel.toExponential(3) +
              ' <= TOL=' + TOL.toExponential(0) +
              ', +3*TOL -> rel=' + dirty.rel.toExponential(3) +
              '  caught: ' + c1);
  ok = ok && c1;

  // (2) bit-exact counter, on a case that is currently 100% exact
  const a = D.callsites_autocorr[0];
  const F = PF.c64(PF.rfftRows(Float64Array.from(a.x), a.rows, a.cols, a.nfft));
  const base = cmp(F.re, a.F_re);
  const flip = a.F_re.slice();
  const i0 = flip.findIndex(function (v) { return v !== 0; });
  flip[i0] = flip[i0] + Math.abs(flip[i0]) * 1.2e-7;      // ~1 float32 ulp
  const flipped = cmp(F.re, flip);
  const c2 = base.exact === base.n && flipped.exact === base.n - 1;
  console.log('  (2) ' + a.name + ' complex64 re: bitexact ' +
              base.exact + '/' + base.n + ', after 1-ulp flip at [' + i0 +
              '] -> ' + flipped.exact + '/' + flipped.n + '  caught: ' + c2);
  ok = ok && c2;

  // (3) the zero-tolerance path (used by every rfftfreq case)
  const ff = D.rfftfreq.find(function (z) { return z.n === 203 && z.d === 1.0; });
  const gotF = PF.rfftfreq(203, 1.0);
  const exactRes = cmp(gotF, ff.out);
  const tweak = ff.out.slice();
  tweak[5] = tweak[5] * (1 + 2.3e-16);                    // 1 float64 ulp
  const tweakRes = cmp(gotF, tweak);
  const c3 = exactRes.maxAbs === 0 && tweakRes.maxAbs > 0;
  console.log('  (3) rfftfreq(203) zero-tol gate: clean max|d|=' +
              exactRes.maxAbs + ', after 1-ulp flip max|d|=' +
              tweakRes.maxAbs.toExponential(3) + '  caught: ' + c3);
  ok = ok && c3;

  // shape guard
  const c4 = cmp(r.re.slice(0, 3), c.re).bad !== undefined;
  console.log('  (4) length mismatch rejected: ' + c4);
  ok = ok && c4;

  if (!ok) { console.log('  NEGATIVE CONTROL FAILED - the comparator is blind'); failures++; }
  console.log('');
}

let allAbs = 0, allRel = 0, allEx = 0, allTot = 0;
for (const g of groups) {
  allAbs = Math.max(allAbs, g.worstAbs);
  allRel = Math.max(allRel, g.worstRel);
  allEx += g.exact; allTot += g.tot;
}
console.log('OVERALL  max|d| = ' + allAbs.toExponential(4) +
            '   max scale-relative = ' + allRel.toExponential(4) +
            '   bit-exact = ' + allEx + '/' + allTot +
            ' (' + (100 * allEx / allTot).toFixed(3) + '%)');
console.log(failures === 0 ? 'ALL GROUPS PASS' : (failures + ' CASE(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
