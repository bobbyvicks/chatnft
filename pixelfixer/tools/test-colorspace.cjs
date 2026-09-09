/* Node parity test for src/pf-10-colorspace.js against
 * fixtures/colorspace-parity.json.
 *
 * Comparison is BITWISE on raw float64 bytes. For every case and every
 * stage the count of differing elements, the max |diff| and the max ulp
 * distance are printed, so a miss has a size, not just an existence.
 *
 * Stages are tested INDEPENDENTLY, each fed the reference's own output of
 * the previous stage, so a miss lands on exactly one operation:
 *   forward:  lmsLinear (pow+matrix) | cbrt3 (cbrt) | oklabFromLms (matrix)
 *   inverse:  lmsCubed (matrix+pow)  | rgbLinear (matrix) | unlin3 (pow)
 * and then end-to-end: srgb_to_oklab(rgb) and oklab_to_srgb(lab).
 *
 * Exit 0 only if EVERYTHING is bit-exact; exit 1 otherwise (the expected
 * outcome here, see the header of pf-10-colorspace.js - the point of this
 * test is to print the real numbers, not to be green).
 *
 *   node tools/test-colorspace.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const FIX = path.join(ROOT, 'fixtures', 'colorspace-parity.json');
// argv[2] lets tools/mutants-colorspace.js point this same test at a mutant
// copy without touching src/. Default is the real file.
const CS_SRC = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'src', 'pf-10-colorspace.js');

// load the IIFEs exactly as a browser <script> would, base first
(0, eval)(fs.readFileSync(path.join(ROOT, 'src', 'pf-00-base.js'), 'utf8'));
(0, eval)(fs.readFileSync(CS_SRC, 'utf8'));
const PF = globalThis.PF;
if (!PF || !PF.versionColorspace) throw new Error('pf-10-colorspace.js did not define PF.versionColorspace');
const CS = PF._colorspace;

const doc = JSON.parse(fs.readFileSync(FIX, 'utf8'));
console.log('pf-10-colorspace.js parity vs numpy %s / python %s / %s   node %s',
  doc.meta.numpy, doc.meta.python, doc.meta.platform, process.version);
console.log('float encoding: %s', doc.meta.float_encoding);
console.log('port: %s\n', PF.versionColorspace);

// ------------------------------------------------------------ helpers
function unhexF64(hex) {
  const buf = Buffer.from(hex, 'hex');
  const out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
  return out;
}
const u64 = new BigInt64Array(1), f64v = new Float64Array(u64.buffer);
function ord(x) { f64v[0] = x; const b = u64[0]; return b < 0n ? -0x8000000000000000n - b : b; }
function same(a, b) { return Object.is(a, b) || (a !== a && b !== b); }

let totalChecks = 0;

function compare(got, want) {
  if (got.length !== want.length) return { ndiff: -1, len: true };
  let ndiff = 0, maxAbs = 0, maxUlp = 0n, first = -1, nanMismatch = 0;
  for (let i = 0; i < want.length; i++) {
    totalChecks++;
    if (same(got[i], want[i])) continue;
    ndiff++;
    if (first < 0) first = i;
    if (isFinite(got[i]) && isFinite(want[i])) {
      const d = Math.abs(got[i] - want[i]);
      if (d > maxAbs) maxAbs = d;
      const u = ord(got[i]) - ord(want[i]);
      const au = u < 0n ? -u : u;
      if (au > maxUlp) maxUlp = au;
    } else {
      nanMismatch++;
    }
  }
  return { ndiff, maxAbs, maxUlp, first, nanMismatch, n: want.length };
}

function fmt(r) {
  if (r.len) return 'LENGTH MISMATCH';
  if (r.ndiff === 0) return `exact (${r.n} values)`;
  return `${r.ndiff}/${r.n} differ (${(100 * r.ndiff / r.n).toFixed(3)}%)  max|diff|=${r.maxAbs.toExponential(3)}  max ulp=${r.maxUlp}` +
    (r.nanMismatch ? `  non-finite mismatches=${r.nanMismatch}` : '');
}

// ------------------------------------------------------------ run
const stageTotals = {};
function tally(stage, r) {
  const t = stageTotals[stage] || (stageTotals[stage] = { n: 0, ndiff: 0, maxUlp: 0n, maxAbs: 0, cases: 0, badCases: 0 });
  t.n += r.n; t.ndiff += r.ndiff; t.cases++;
  if (r.ndiff) t.badCases++;
  if (r.maxUlp > t.maxUlp) t.maxUlp = r.maxUlp;
  if (r.maxAbs > t.maxAbs) t.maxAbs = r.maxAbs;
}

let allExact = true;
const casesById = {};

for (const c of doc.cases) {
  casesById[c.id] = c;
  const n = c.n;
  console.log(`== ${c.id}  (n=${n}${c.note ? ', ' + c.note : ''})`);
  const rows = [];
  if (!c.inverse_only) {
    const rgb = unhexF64(c.rgb);
    const lmsLin = unhexF64(c.lms_lin), lmsCbrt = unhexF64(c.lms_cbrt), lab = unhexF64(c.lab);
    rows.push(['lmsLinear   (pow+matrix)', compare(CS.lmsLinear(rgb, n), lmsLin)]);
    rows.push(['cbrt3       (cbrt)      ', compare(CS.cbrt3(lmsLin, n), lmsCbrt)]);
    rows.push(['oklabFromLms(matrix)    ', compare(CS.oklabFromLms(lmsCbrt, n), lab)]);
    rows.push(['srgb_to_oklab END-TO-END', compare(PF.srgb_to_oklab(rgb, n), lab)]);
    // the no-count spelling must agree with the explicit one
    rows.push(['srgb_to_oklab(rgb) no n ', compare(PF.srgb_to_oklab(rgb), lab)]);
  }
  const lab = unhexF64(c.lab);
  const lmsCubed = unhexF64(c.lms_cubed), rgbLin = unhexF64(c.rgb_lin), back = unhexF64(c.back);
  rows.push(['lmsCubed    (matrix+pow)', compare(CS.lmsCubed(lab, n), lmsCubed)]);
  rows.push(['rgbLinear   (matrix)    ', compare(CS.rgbLinear(lmsCubed, n), rgbLin)]);
  rows.push(['unlin3      (clip+pow)  ', compare(CS.unlin3(rgbLin, n), back)]);
  rows.push(['oklab_to_srgb END-TO-END', compare(PF.oklab_to_srgb(lab, n), back)]);
  for (const [name, r] of rows) {
    console.log(`   ${name}  ${fmt(r)}`);
    tally(name.trim(), r);
    if (r.ndiff !== 0) allExact = false;
  }
}

// ------------------------------------------------------------ scalar helpers
// lin/unlin at the knee, against the reference's grey-axis case, element by
// element (the same values the array path saw - a positive control that the
// exposed scalar helpers are the ones the array path uses)
{
  const c = casesById['synthetic/knee_forward_grey'];
  const rgb = unhexF64(c.rgb), lmsLin = unhexF64(c.lms_lin);
  let bad = 0;
  for (let i = 0; i < c.n; i++) {
    const r = CS.lin(rgb[3 * i]);
    const l = 0.4122214708 * r + 0.5363325363 * r + 0.0514459929 * r;
    totalChecks++;
    if (!same(l, lmsLin[3 * i])) bad++;
  }
  console.log(`\nscalar lin() through the grey knee case: ${bad === 0 ? 'exact' : bad + ' differ'} (${c.n} values)`);
  if (bad) allExact = false;
}

// ------------------------------------------------------------ throws
function throws(f) { try { f(); } catch (e) { return true; } return false; }
{
  const bad = [];
  if (!throws(() => PF.srgb_to_oklab(new Float64Array(7)))) bad.push('srgb_to_oklab length 7 did not throw');
  if (!throws(() => PF.srgb_to_oklab(new Float64Array(6), 3))) bad.push('srgb_to_oklab n=3 on 6 values did not throw');
  if (!throws(() => PF.oklab_to_srgb(new Float64Array(4)))) bad.push('oklab_to_srgb length 4 did not throw');
  console.log(`shape guards: ${bad.length ? bad.join('; ') : 'all three malformed inputs threw'}`);
  if (bad.length) allExact = false;
}

// ------------------------------------------------------------ downstream
console.log('\nDOWNSTREAM: does a last-bit Oklab miss change the caller\'s answer?');
console.log('(reconstruct.py:521-522: labels = argmin over squared Oklab distance cell->center)');
let labelFlips = 0, labelTotal = 0;
for (const name of Object.keys(doc.downstream)) {
  const dsp = doc.downstream[name];
  const cells = casesById[dsp.cells], cents = casesById[dsp.centers];
  const lab = PF.srgb_to_oklab(unhexF64(cells.rgb), cells.n);   // the JS answer, misses included
  const clab = PF.srgb_to_oklab(unhexF64(cents.rgb), cents.n);
  const labels = new Int32Array(cells.n);
  for (let i = 0; i < cells.n; i++) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < cents.n; j++) {
      const d0 = lab[3 * i] - clab[3 * j], d1 = lab[3 * i + 1] - clab[3 * j + 1], d2 = lab[3 * i + 2] - clab[3 * j + 2];
      const d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < bd) { bd = d; best = j; }   // np.argmin: first minimum
    }
    labels[i] = best;
  }
  let flips = 0;
  for (let i = 0; i < cells.n; i++) if (labels[i] !== dsp.labels[i]) flips++;
  labelFlips += flips; labelTotal += cells.n;
  console.log(`   ${name.padEnd(6)} cells=${String(cells.n).padStart(5)} centers=${String(cents.n).padStart(3)}  ` +
    `labels differing from numpy: ${flips}   (reference min gap best->runner-up ${dsp.min_gap.toExponential(2)}, exact ties ${dsp.n_exact_ties})`);
}
console.log(`   total: ${labelFlips} / ${labelTotal} labels differ`);

// ------------------------------------------------------------ summary
console.log('\nPER-STAGE TOTALS over all cases:');
for (const k of Object.keys(stageTotals)) {
  const t = stageTotals[k];
  console.log(`   ${k.padEnd(26)} ${String(t.ndiff).padStart(7)} / ${String(t.n).padStart(7)} values differ` +
    ` (${(100 * t.ndiff / t.n).toFixed(3)}%)  cases with a miss ${t.badCases}/${t.cases}` +
    `  max ulp ${t.maxUlp}  max|diff| ${t.maxAbs.toExponential(3)}`);
}
console.log('   (END-TO-END "max ulp" is dominated by near-zero outputs - Oklab a/b on the grey axis are ~1e-17,');
console.log('    where a 1e-16 absolute miss is billions of ulps; read max|diff| for the size of the miss)');
console.log(`\nindividual value comparisons (bitwise): ${totalChecks}`);
console.log(`cases: ${doc.cases.length} (fixture declares ${doc.meta.n_cases})`);
console.log(allExact ? '\nRESULT: bit-exact on every case' : '\nRESULT: NOT bit-exact - see the per-stage rows above for where and by how much');
if (doc.cases.length !== doc.meta.n_cases) { console.log('CASE COUNT MISMATCH'); process.exit(2); }
process.exit(allExact ? 0 : 1);
