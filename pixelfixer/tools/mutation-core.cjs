/* Mutation check for tools/test-core.js: can the parity test say NO?
 *
 * Each mutant is src/pf-50-core.js with ONE plausible porting mistake
 * applied by textual substitution. The substitution is asserted to have
 * changed the text (a silent no-op would test the real file and report a
 * kill that never happened). The mutant is written under tools/_mutants/
 * and tools/test-core.js is run against it; a KILL is exit code 1 (a
 * parity failure). Exit 2 (parity passed, end-to-end skipped) or 0 means
 * the fixtures did not discriminate that mutation, and is reported as
 * SURVIVED, which is the finding, not an error.
 *
 *   node tools/mutation-core.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src', 'pf-50-core.js');
const TEST = path.join(__dirname, 'test-core.js');
const MUT_DIR = path.join(__dirname, '_mutants');
fs.mkdirSync(MUT_DIR, { recursive: true });
const original = fs.readFileSync(SRC, 'utf8');

const MUTANTS = [
  ['round_half_up_cols',
   'Math.round instead of round-half-to-even on the averaged cell count',
   'var cols = PF.rint((ea.cols + eb.cols) / 2);',
   'var cols = Math.round((ea.cols + eb.cols) / 2);'],
  ['round_half_up_rows',
   'Math.round on the averaged row count',
   'var rows = PF.rint((ea.rows + eb.rows) / 2);',
   'var rows = Math.round((ea.rows + eb.rows) / 2);'],
  ['score_strict_gt',
   '>= 0.30 becomes > 0.30 on the calibrated early exit',
   "getOr(props.rl, 'score_y', 0.0)) >= 0.30) {",
   "getOr(props.rl, 'score_y', 0.0)) > 0.30) {"],
  ['math_min_scores',
   'Math.min instead of Python min (NaN semantics)',
   'function pyMin(a, b) { return (b < a) ? b : a; }',
   'function pyMin(a, b) { return Math.min(a, b); }'],
  ['tolerance_from_a',
   '_size_close takes its tolerance from a instead of b',
   'var tol_c = Math.max(1, PF.rint(0.01 * b.cols));\n    var tol_r = Math.max(1, PF.rint(0.01 * b.rows));',
   'var tol_c = Math.max(1, PF.rint(0.01 * a.cols));\n    var tol_r = Math.max(1, PF.rint(0.01 * a.rows));'],
  ['tolerance_no_floor',
   'drops the max(1, ...) floor on the tolerance',
   'var tol_c = Math.max(1, PF.rint(0.01 * b.cols));\n    var tol_r = Math.max(1, PF.rint(0.01 * b.rows));',
   'var tol_c = PF.rint(0.01 * b.cols);\n    var tol_r = PF.rint(0.01 * b.rows);'],
  ['tolerance_half_up',
   'Math.round on the 1% tolerance (2.5 -> 3 instead of 2)',
   'var tol_c = Math.max(1, PF.rint(0.01 * b.cols));\n    var tol_r = Math.max(1, PF.rint(0.01 * b.rows));',
   'var tol_c = Math.max(1, Math.round(0.01 * b.cols));\n    var tol_r = Math.max(1, Math.round(0.01 * b.rows));'],
  ['pair_returns_second',
   'the agreeing pair returns the SECOND proposal\'s steps instead of the first\'s',
   'return finish(result(pa.step_x, pa.step_y, pa.cols, pa.rows,',
   'return finish(result(pb.step_x, pb.step_y, pb.cols, pb.rows,'],
  ['missing_score_defaults_to_one',
   'a runlengths dict without score keys is treated as confident',
   "pyMin(getOr(props.rl, 'score_x', 0.0),\n              getOr(props.rl, 'score_y', 0.0)) >= 0.30) {",
   "pyMin(getOr(props.rl, 'score_x', 1.0),\n              getOr(props.rl, 'score_y', 1.0)) >= 0.30) {"],
  ['selfsim_before_early_exit',
   'selfsim runs before the early exit is evaluated',
   "    run('ac', _run_ac);\n    run('rl', function () { return m_rl.detect(rgba); });\n",
   "    run('ac', _run_ac);\n    run('rl', function () { return m_rl.detect(rgba); });\n    run('ss', function () { return m_ss.detect(rgba); });\n"],
  ['pair_order_reversed',
   'the pair search walks proposals in reverse insertion order',
   "      for (var i = 0; i < names.length; i++) {\n        for (var j = i + 1; j < names.length; j++) {",
   "      for (var i = names.length - 1; i >= 0; i--) {\n        for (var j = i - 1; j >= 0; j--) {"],
  ['lowconf_uses_last',
   'the low-confidence fallback uses the last proposal instead of autocorr',
   'var fa = truthyDict(props.ac) ? props.ac : props[names[0]];',
   'var fa = props[names[names.length - 1]];'],
  ['early_exit_uses_ac_cols',
   'the early exit takes autocorr\'s count instead of the rounded mean',
   'var cols = PF.rint((ea.cols + eb.cols) / 2);',
   'var cols = ea.cols;'],
  ['size_close_or',
   '_size_close accepts agreement on EITHER axis',
   'return (Math.abs(a.cols - b.cols) <= tol_c &&\n            Math.abs(a.rows - b.rows) <= tol_r);',
   'return (Math.abs(a.cols - b.cols) <= tol_c ||\n            Math.abs(a.rows - b.rows) <= tol_r);'],
  ['maps_weight_swapped',
   '_run_ac hands axis_estimate the d1 map with weight 1.0 and d2 with 0.7',
   'var maps_x = [[A.d2_along(g, 1), 1.0], [A.d1_along(gq, 1), 0.7]];',
   'var maps_x = [[A.d2_along(g, 1), 0.7], [A.d1_along(gq, 1), 1.0]];'],
  ['est_axis_swapped',
   '_run_ac calls axis_estimate with the axes swapped',
   'var est_x = A.axis_estimate(maps_x, 1, w);\n      var est_y = A.axis_estimate(maps_y, 0, h);',
   'var est_x = A.axis_estimate(maps_x, 0, w);\n      var est_y = A.axis_estimate(maps_y, 1, h);'],
];

let killed = 0, survived = 0, broken = 0;
const rows = [];
for (const [id, why, from, to] of MUTANTS) {
  if (original.indexOf(from) < 0) {
    broken++;
    rows.push(['NO-OP', id, 'pattern not found in src - mutant never built']);
    continue;
  }
  const mutated = original.replace(from, to);
  if (mutated === original) {
    broken++;
    rows.push(['NO-OP', id, 'replace produced identical text']);
    continue;
  }
  const file = path.join(MUT_DIR, 'core-' + id + '.js');
  fs.writeFileSync(file, mutated);
  const r = spawnSync(process.execPath, [TEST, file], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /checks: (\d+) passed, (\d+) failed/.exec(out);
  const tally = m ? `${m[2]} failed of ${Number(m[1]) + Number(m[2])}` : 'no tally line (crash?)';
  const firstFail = (/^  - (.*)$/m.exec(out) || [])[1] || '';
  if (r.status === 1 && m && Number(m[2]) > 0) {
    killed++;
    rows.push(['KILLED', id, tally + '  e.g. ' + firstFail.slice(0, 90), why]);
  } else if (r.status === 1) {
    broken++;
    rows.push(['CRASH', id, out.split('\n').filter(l => /Error/.test(l))[0] || 'exit 1 without a tally', why]);
  } else {
    survived++;
    rows.push(['SURVIVED', id, tally, why]);
  }
}

for (const r of rows) console.log(r[0].padEnd(9) + r[1].padEnd(32) + r[2] + (r[3] ? '\n' + ' '.repeat(41) + r[3] : ''));
console.log('\nmutants: %d killed, %d survived, %d not built/crashed, of %d', killed, survived, broken, MUTANTS.length);
process.exit(broken > 0 ? 1 : 0);
