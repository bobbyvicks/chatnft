/* Positive controls for tools/test-colorspace.js: can the test actually
 * FAIL on the stages it reports exact, and does it see the specific
 * semantics the port claims to preserve?
 *
 * Each mutant is a textual edit of src/pf-10-colorspace.js written to
 * tools/_mutants/ (src/ is never touched). The edit is asserted to have
 * changed the text - a replace that silently no-ops would make a mutant
 * that is identical to the original and read as "survived" for the wrong
 * reason. The test is run on the mutant and the targeted stage's total is
 * compared with the baseline run on the real file: a kill is a strictly
 * larger diff count on that stage. Selectivity is checked too: stages the
 * mutant does NOT touch must be unchanged, which is what makes a kill a
 * kill and not a broken harness.
 *
 *   node tools/mutants-colorspace.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src', 'pf-10-colorspace.js');
const TEST = path.join(__dirname, 'test-colorspace.js');
const MUT_DIR = path.join(__dirname, '_mutants');
fs.mkdirSync(MUT_DIR, { recursive: true });

const original = fs.readFileSync(SRC, 'utf8');

const MUTANTS = [
  {
    name: 'cube-as-xxx',
    target: 'lmsCubed',
    why: 'numpy ** 3 is pow(x,3.0), measured != x*x*x in 25.8% of inputs',
    apply: (s) => s.replace(/Math\.pow\(([^;]*), 3\);/g, '(function (x) { return x * x * x; })($1);'),
  },
  {
    name: 'matrix-reassociated',
    target: 'oklabFromLms(matrix)',
    why: 'numpy evaluates (A*l + B*m) - C*s; re-associating changes the rounding',
    apply: (s) => s.replace(
      'out[k]     = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;',
      'out[k]     = 0.2104542553 * l + (0.7936177850 * m - 0.0040720468 * s);'),
  },
  {
    name: 'knee-exclusive',
    target: 'lmsLinear',
    why: 'the sRGB knee is u <= 0.04045 (inclusive); the fixture holds u == 0.04045 exactly',
    apply: (s) => s.replace('if (u <= 0.04045) return u / 12.92;', 'if (u < 0.04045) return u / 12.92;'),
  },
  {
    name: 'inverse-knee-exclusive',
    target: 'unlin3',
    why: 'the inverse knee is u <= 0.0031308 (inclusive); knee_inverse_exact holds 1011 rows landing on it exactly',
    apply: (s) => s.replace('if (u <= 0.0031308) return 12.92 * u;', 'if (u < 0.0031308) return 12.92 * u;'),
  },
  {
    name: 'constant-last-digit',
    target: 'rgbLinear',
    why: 'a one-digit typo in a matrix constant must be visible on an exact stage',
    apply: (s) => s.replace('2.6097574011 * m', '2.6097574012 * m'),
  },
  {
    name: 'inv-gamma-as-literal',
    target: 'unlin3',
    why: 'the exponent must be the float64 quotient 1/2.4 (0.41666666666666669); the mutant is its 1-ulp-lower neighbour',
    apply: (s) => s.replace('var INV_GAMMA = 1 / 2.4;', 'var INV_GAMMA = 0.41666666666666663;'),
  },
  {
    name: 'clip-after-branch',
    target: 'unlin3',
    why: 'np.clip runs BEFORE the branch; clipping after lets u > 1 reach pow and u < 0 reach 12.92*u',
    apply: (s) => s.replace(
      'u = clipScalar(u, 0.0, 1.0);\n    if (u <= 0.0031308) return 12.92 * u;\n    return 1.055 * Math.pow(u, INV_GAMMA) - 0.055;',
      'if (u <= 0.0031308) return clipScalar(12.92 * u, 0.0, 1.0);\n    return clipScalar(1.055 * Math.pow(u, INV_GAMMA) - 0.055, 0.0, 1.0);'),
  },
];

function runTest(srcPath) {
  const r = spawnSync(process.execPath, [TEST, srcPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  const out = r.stdout || '';
  // parse the PER-STAGE TOTALS block: "   <name padded>  <ndiff> / <n> values differ"
  const totals = {};
  const block = out.split('PER-STAGE TOTALS over all cases:')[1] || '';
  for (const line of block.split('\n')) {
    const m = line.match(/^\s{3}(.+?)\s{2,}(\d+) \/\s*(\d+) values differ/);
    if (m) totals[m[1].trim()] = { ndiff: +m[2], n: +m[3] };
  }
  if (!Object.keys(totals).length) throw new Error('could not parse totals from test output:\n' + out.slice(-2000));
  return { totals, exit: r.status, out };
}

console.log('baseline: running the test on the real src/pf-10-colorspace.js');
const base = runTest(SRC);
for (const k of Object.keys(base.totals)) {
  console.log(`   ${k.padEnd(26)} ${base.totals[k].ndiff} / ${base.totals[k].n}`);
}
console.log('');

let killed = 0, survived = 0, broken = 0;
for (const mu of MUTANTS) {
  const text = mu.apply(original);
  if (text === original) {
    console.log(`BROKEN  ${mu.name}: the edit did not change the source (no-op replace)`);
    broken++;
    continue;
  }
  const mp = path.join(MUT_DIR, `colorspace-${mu.name}.js`);
  fs.writeFileSync(mp, text);
  const r = runTest(mp);
  // totals keys carry the parenthesised label ("lmsCubed    (matrix+pow)");
  // resolve the bare stage name by prefix, and insist on exactly one hit
  const hits = Object.keys(base.totals).filter((k) => k.startsWith(mu.target));
  if (hits.length !== 1) { console.log(`BROKEN  ${mu.name}: stage "${mu.target}" matched ${hits.length} totals keys`); broken++; continue; }
  const key = hits[0];
  const b = base.totals[key], g = r.totals[key];
  if (!b || !g) { console.log(`BROKEN  ${mu.name}: stage "${key}" missing from a run`); broken++; continue; }
  // selectivity: every stage the mutant does not target, and that is not
  // downstream of it in an END-TO-END row, must be unchanged
  const untouched = Object.keys(base.totals).filter((k) => k !== key && !/END-TO-END|no n/.test(k));
  const collateral = untouched.filter((k) => base.totals[k].ndiff !== r.totals[k].ndiff);
  const isKill = g.ndiff > b.ndiff;
  if (isKill && collateral.length === 0) {
    killed++;
    console.log(`KILLED  ${mu.name.padEnd(24)} ${mu.target.padEnd(20)} ${b.ndiff} -> ${g.ndiff} differ   (${mu.why})`);
  } else if (isKill) {
    broken++;
    console.log(`KILLED-BUT-UNSELECTIVE ${mu.name}: ${b.ndiff} -> ${g.ndiff}, collateral change in ${collateral.join(', ')}`);
  } else {
    survived++;
    console.log(`SURVIVED ${mu.name.padEnd(23)} ${mu.target.padEnd(20)} ${b.ndiff} -> ${g.ndiff} differ   (${mu.why})`);
  }
}
console.log(`\nmutants: ${MUTANTS.length}  killed: ${killed}  survived: ${survived}  broken: ${broken}`);
process.exit(survived === 0 && broken === 0 ? 0 : 1);
