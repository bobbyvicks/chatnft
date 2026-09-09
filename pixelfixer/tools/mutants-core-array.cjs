/* Negative control for tools/test-core-array.js.
 *
 * A green suite proves nothing until it has been shown it can go red. Each
 * mutant below is a mistake a real port actually makes; the harness writes
 * a mutated COPY into tools/_mutants/ (src/ is never touched), runs the
 * same test against it, and reports which mutants the suite catches.
 *
 * Run:  node tools/mutants-core-array.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src', 'pf-00-base.js');
const TEST = path.join(ROOT, 'tools', 'test-core-array.js');
const MUT = path.join(ROOT, 'tools', '_mutants');

const original = fs.readFileSync(SRC, 'utf8');
const beforeHash = crypto.createHash('sha256').update(original).digest('hex');

const MUTANTS = [
  ['round_half_up',
    'the classic: JS Math.round instead of numpy round-half-to-EVEN',
    'if (d < 0.5) r = f;\n    else if (d > 0.5) r = f + 1;\n    else r = (f % 2 === 0) ? f : f + 1;',
    'r = Math.round(x);'],

  ['argmax_last_max',
    'argmax breaking ties on the LAST maximum instead of the first',
    'if (!(v <= mp)) { mp = v; mi = i; if (mp !== mp) break; }',
    'if (!(v < mp)) { mp = v; mi = i; if (mp !== mp) break; }'],

  ['arange_start_plus_i_step',
    'arange filling start + i*step instead of numpy\'s recomputed delta',
    'var delta = out[1] - out[0];',
    'var delta = step;'],

  ['linspace_computed_endpoint',
    'linspace computing the last element instead of assigning stop',
    'if (endpoint && num > 1) out[num - 1] = stop;',
    ';'],

  ['percentile_symmetric_lerp',
    'percentile using a + (b-a)*g for every gamma (numpy switches at 0.5)',
    'if (gamma >= 0.5) return R(bv - R(d * R(1 - gamma)));',
    'if (false) return R(bv - R(d * R(1 - gamma)));'],

  ['percentile_f32_in_f64',
    'percentile doing the float32 lerp in float64',
    "var R = f32 ? Math.fround : function (x) { return x; };",
    'var R = function (x) { return x; };'],

  ['median_even_f32_in_f64',
    'median averaging the two middle float32 values in float64',
    'return Math.fround(Math.fround(Math.fround(s[h - 1]) + Math.fround(s[h])) / 2);',
    'return (s[h - 1] + s[h]) / 2;'],

  ['interp_no_knot_shortcut',
    'interp always using the slope formula (no exact-knot shortcut)',
    'if (dx[j] === x) return dy[j];',
    ';'],

  ['interp_no_clamp',
    'interp extrapolating past the ends instead of clamping',
    'if (j === -1) return lval;',
    'if (j === -1) { j = 0; }'],

  ['searchsorted_right_is_left',
    'searchsorted side="right" behaving like "left"',
    'if (a[mid] <= v) lo = mid + 1; else hi = mid;',
    'if (a[mid] < v) lo = mid + 1; else hi = mid;'],

  ['argsort_reversed_ties',
    'argsort breaking ties on DESCENDING index (proves ties are pinned)',
    '      return i - j;\n    });',
    '      return j - i;\n    });'],

  ['bincount_reverse_accumulation',
    'bincount summing weights back-to-front (numpy sums in input order)',
    'for (i = 0; i < n; i++) out[list[i]] += weights[i];',
    'for (i = n - 1; i >= 0; i--) out[list[i]] += weights[i];'],

  ['clip_tie_takes_bound',
    'clip taking the bound rather than x when they compare equal',
    'var t = (lo !== lo) ? lo : ((x < lo) ? lo : x);   // _NPY_MAX(x, lo)',
    'var t = (lo !== lo) ? lo : ((x > lo) ? x : lo);'],

  ['bincount_no_minlength',
    'bincount ignoring minlength',
    "var len = (minlength === undefined || minlength === null) ? 0 : (minlength | 0);",
    'var len = 0;'],

  ['unique_index_last',
    'unique returning the LAST occurrence index instead of the first',
    'if (p < firstIdx[k]) firstIdx[k] = p;',
    'firstIdx[k] = p;'],

  ['diff_n_ignored',
    'diff ignoring n and always doing a single difference',
    'for (k = 0; k < n; k++) {',
    'for (k = 0; k < Math.min(n, 1); k++) {'],

  ['astype_int_floor',
    'astype(int) using floor instead of truncation toward zero',
    'out[i] = Math.trunc(a[i]);',
    'out[i] = Math.floor(a[i]);'],

  ['sorted_no_zero_repair',
    'sorted leaving TypedArray.sort\'s -0-before-+0 ordering in place',
    'var w = lo;\n    for (k = 0; k < n; k++) if (a[k] === 0) out[w++] = a[k];',
    'var w = hi;'],

  ['median_nan_ignored',
    'median sorting NaN to the end and answering from the finite values',
    'for (i = 0; i < n; i++) if (src[i] !== src[i]) return src[i];   // NaN in -> NaN out (median)',
    ';'],

  ['percentile_nan_ignored',
    'percentile sorting NaN to the end and answering from the finite values',
    'for (i = 0; i < n; i++) if (src[i] !== src[i]) return src[i];   // NaN in -> NaN out (percentile)',
    ';'],

  ['unique_nan_split',
    'unique treating every NaN as a distinct value (numpy collapses them)',
    'if (i === 0 || !(v === prev || (v !== v && prev !== prev))) {',
    'if (i === 0 || v !== prev) {'],
];

/* Deliberately EXCLUDED, with the reason, because each is provably
 * equivalent rather than untested:
 *
 *   argsort tiebreak -> `return 0`
 *     Array.prototype.sort has been REQUIRED to be stable since ES2019, so
 *     dropping the explicit `i - j` is semantically equivalent on every
 *     conforming engine. The tiebreak stays because it makes the guarantee
 *     local to this file rather than a property of the host; the mutant
 *     escaping is the correct result, not a hole. (Verified: it escapes.)
 */

fs.rmSync(MUT, { recursive: true, force: true });
fs.mkdirSync(MUT, { recursive: true });

let caught = 0, escaped = 0, broken = 0;
const rows = [];

for (const [name, why, find, repl] of MUTANTS) {
  if (!original.includes(find)) {
    // A mutant that does not apply is an instrument failure, not a pass.
    rows.push([name, 'MUTANT DID NOT APPLY', why]);
    broken++;
    continue;
  }
  const mutated = original.replace(find, repl);
  if (mutated === original) { rows.push([name, 'NO-OP EDIT', why]); broken++; continue; }
  const file = path.join(MUT, name + '.js');
  fs.writeFileSync(file, mutated);
  let code, out = '';
  try {
    out = execFileSync(process.execPath, [TEST, file], { encoding: 'utf8' });
    code = 0;
  } catch (e) {
    code = e.status === undefined ? 'crash' : e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const m = /cases: \d+ +pass: \d+ +fail: (\d+)/.exec(out);
  const nfail = m ? Number(m[1]) : 'n/a';
  if (code !== 0) { caught++; rows.push([name, `CAUGHT (exit ${code}, ${nfail} case failures)`, why]); }
  else { escaped++; rows.push([name, 'ESCAPED - the suite is blind to this', why]); }
}

console.log(`source sha256 before: ${beforeHash}`);
console.log(`mutants: ${MUTANTS.length}   caught: ${caught}   escaped: ${escaped}   inapplicable: ${broken}`);
console.log('');
for (const [n, verdict, why] of rows) {
  console.log(`  ${n.padEnd(28)} ${verdict}`);
  console.log(`  ${''.padEnd(28)}   ${why}`);
}
const afterHash = crypto.createHash('sha256')
  .update(fs.readFileSync(SRC, 'utf8')).digest('hex');
console.log('');
console.log(`source sha256 after:  ${afterHash}`);
console.log(`src/pf-00-base.js unmodified: ${beforeHash === afterHash}`);
process.exit(escaped === 0 && broken === 0 && beforeHash === afterHash ? 0 : 1);
