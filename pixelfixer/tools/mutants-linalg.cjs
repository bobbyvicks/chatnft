/* Mutation harness for tools/test-linalg.cjs: prove the test can FAIL.
 *
 * Each mutant is ONE literal change to src/pf-06-linalg.js or
 * src/pf-00-base.js (a constant, a comparison, an operand order). The
 * mutated copy is written under fixtures/raw/linalg-mutants/ (gitignored)
 * and loaded with test-linalg.cjs --src, so src/ is never touched. A mutant
 * the test does not turn red is printed as SURVIVED - that is either a hole
 * in the fixtures or an equivalent mutation, and it is reported, not hidden.
 *
 *   node tools/mutants-linalg.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'fixtures', 'raw', 'linalg-mutants');
fs.mkdirSync(OUT, { recursive: true });

const M = [
  // [file, from, to, test sections, what it breaks]
  ['pf-06-linalg.js', 'syrkQ: 512,', 'syrkQ: 511,', 'matmul,recon', 'ssyrk K-block size'],
  ['pf-06-linalg.js', 'else if (minl > Q) minl = (minl + 1) >> 1;', 'else if (minl > Q) minl = minl >> 1;', 'matmul', 'syrk split rounds down instead of up'],
  ['pf-06-linalg.js', 'dot = ddotOB(nn, TAU, i, A, vS);                         // DDOT(nn, TAU(i), 1, v, 1)\n        alpha = -0.5 * taui * dot;',
    'dot = ddotOB(nn, TAU, i, A, vS);                         // DDOT(nn, TAU(i), 1, v, 1)\n        alpha = -0.5000000001 * taui * dot;', 'eigh,recon', 'dsytd2 -HALF constant (OpenBLAS path)'],
  ['pf-06-linalg.js', 'var MAXIT = 30,', 'var MAXIT = 1,', 'eigh,recon', 'dsteqr iteration cap'],
  ['pf-06-linalg.js', 'return Math.sqrt(((C + A) + B) + D) * unsc;', 'return Math.sqrt(((C + A) + D) + B) * unsc;', 'lstsq', 'x87 nrm2 accumulator combine order'],
  ['pf-06-linalg.js', 'var mnthr = Math.trunc(Math.min(m, n) * 1.6);', 'var mnthr = Math.trunc(Math.min(m, n) * 2.6);', 'lstsq', 'dgelsd QR-first threshold',
    { expect: 'survive', why: 'EQUIVALENT for n = 2: dgebd2 on an m x 2 matrix performs exactly dgeqr2\'s operations (its one row reflector has length 1, so tau = 0), and dormbr(Q) is the same dorm2r - both paths compute the same bits' }],
  ['pf-06-linalg.js', 'if (rcond === undefined || rcond === null) rcond = PREC * Math.max(m, n);', 'if (rcond === undefined || rcond === null) rcond = PREC * Math.max(m, n) * 1e10;', 'lstsq', 'lstsq default rcond (eps * max(m, n))'],
  ['pf-06-linalg.js', 'if (j < t8) v = fmaf(x2, c[2], fmaf(x1, c[1], fr(c[0] * x0)));', 'if (j < t4) v = fmaf(x2, c[2], fmaf(x1, c[1], fr(c[0] * x0)));', 'matmul', 'sgemv 4-block takes the 8-block formula'],
  ['pf-06-linalg.js', 'if ((ub[LO] & 1) === 0) v = nextToward(v, e > 0);        // round to odd', 'if (false) v = nextToward(v, e > 0);        // round to odd', 'fma64', 'fma64 without the round-to-odd step'],
  ['pf-06-linalg.js', 'var pl = ((ah * bh - p) + ah * bl + al * bh) + al * bl;', 'var pl = ((ah * bh - p) + ah * bl + al * bh);', 'fma64,eigh,lstsq', 'fma64 drops the lo*lo term of the exact product'],
  ['pf-06-linalg.js', 'var SPLITTER = 134217729;', 'var SPLITTER = 134217728;', 'fma64,eigh,lstsq', 'Veltkamp splitter 2^27+1 -> 2^27',
    { expect: 'survive', why: 'NOT LOAD-BEARING ON THIS DATA (not proven equivalent): with 2^27 the split still produced exact products on every fma64 triple and every eigh/lstsq call measured; the constant is kept at the textbook 2^27+1, for which exactness is proven' }],
  ['pf-06-linalg.js', 'var tolmul = Math.max(10, Math.min(100, Math.pow(eps, -0.125)));', 'var tolmul = Math.max(10, Math.min(100, Math.pow(eps, -0.25)));', 'lstsq', 'dbdsqr tolerance exponent (deflation threshold)',
    { expect: 'survive', why: 'NOT LOAD-BEARING ON THIS DATA (not equivalent): it moves the deflation threshold by 1.3%, and no fixture has a superdiagonal within that band of it' }],
  ['pf-06-linalg.js', 'if (Math.abs(E[m - 1]) <= thresh) {', 'if (Math.abs(E[m - 1]) <= thresh * 1e300) {', 'lstsq', 'dbdsqr: always deflate instead of taking dlasv2'],
  ['pf-06-linalg.js', 'var RTMAX = Math.sqrt(SAFMAX / 2);', 'var RTMAX = Math.sqrt(SAFMAX / 2) * 1e-300;', 'eigh,lstsq', 'dlartg: always take the scaled branch'],
  ['pf-06-linalg.js', 'oim[i] = (im[i] - re[i] * rat) * scl;', 'oim[i] = (im[i] - re[i] * rat) / d;', 'trans', 'complex / real as a division instead of numpy\'s reciprocal multiply'],
  ['pf-06-linalg.js', 'return mx * Math.sqrt(fma64(r, r, 1));', 'return mx * Math.sqrt(1 + r * r);', 'trans', 'UCRT hypot without its fma'],
  ['pf-06-linalg.js', 'var sr = (r0 + r1) + (r2 + r3), si = (i0 + i1) + (i2 + i3);', 'var sr = ((r0 + r1) + r2) + r3, si = ((i0 + i1) + i2) + i3;', 'trans', 'complex pairwise sum: accumulator combine order'],
  ['pf-00-base.js', '    if (n < 8) {\n      res = 0.0;\n      for (i = 0; i < n; i++) res = R(res + a[off + i * st]);', '    if (n < 9) {\n      res = 0.0;\n      for (i = 0; i < n; i++) res = R(res + a[off + i * st]);', 'reductions,recon', 'strided pairwise block threshold'],
  ['pf-00-base.js', "r = (last % 2 === 0) ? kept : ax.toFixed(nd);", "r = (last % 2 === 1) ? kept : ax.toFixed(nd);", 'pyround', 'Python round: tie to odd'],
  ['pf-00-base.js', 'var v = f32 ? Math.fround(pairwise(sq, 0, n, Math.fround) / Math.fround(n)) : pairwise(sq, 0, n, ident) / n;',
    'var v = f32 ? Math.fround(pairwise(sq, 0, n, Math.fround) / Math.fround(n - 1)) : pairwise(sq, 0, n, ident) / (n - 1);', 'reductions,recon', 'std ddof 0 -> 1'],
  ['pf-00-base.js', '          acc = R(acc + d[p]);\n          out[p] = acc;\n        }\n      }\n    }\n    return out;\n  };\n\n  /* ------------------------------------------------------------------ *\n   * np.maximum.accumulate',
    '          acc = acc + d[p];\n          out[p] = acc;\n        }\n      }\n    }\n    return out;\n  };\n\n  /* ------------------------------------------------------------------ *\n   * np.maximum.accumulate', 'reductions,recon', 'cumsum accumulates float32 in float64'],
  ['pf-00-base.js', "out[(o * ni + i) * inner + j] = R(d[base] + pairwiseS(d, base + inner, s1 - s0 - 1, inner, R));",
    "out[(o * ni + i) * inner + j] = pairwiseS(d, base, s1 - s0, inner, R);", 'reductions,recon', 'reduceat as pairwise over all (the rival order)'],
  ['pf-00-base.js', '      if (shape[b] === 1) { nb = b; continue; }', '      if (shape[b] === 1) { break; }', 'reductions', 'sumAxes: a size-1 axis breaks the reduced run'],
];

const rows = [];
let survived = 0, unexpected = 0;
for (const [i, [file, from, to, only, what, opt]] of M.entries()) {
  const expectSurvive = !!(opt && opt.expect === 'survive');
  const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  // the sources are CRLF; a multi-line pattern written with \n would match
  // nothing, so it is re-joined with the file's own line ending
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const f2 = from.split('\n').join(nl), t2 = to.split('\n').join(nl);
  const count = src.split(f2).length - 1;
  if (count !== 1) { rows.push(`#${i} ${what}: PATTERN MATCHED ${count} TIMES - mutant not built`); console.log(rows[rows.length - 1]); unexpected++; continue; }
  const mpath = path.join(OUT, `m${String(i).padStart(2, '0')}-${file}`);
  const mutated = src.replace(f2, t2);
  if (mutated === src) { rows.push(`#${i} ${what}: replacement produced identical text`); console.log(rows[rows.length - 1]); unexpected++; continue; }
  fs.writeFileSync(mpath, mutated);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--max-old-space-size=6144', path.join(__dirname, 'test-linalg.cjs'), '--src', `${file}=${mpath}`, '--only', only],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const red = [];
  for (const line of (r.stdout || '').split('\n')) {
    const mm = /^\s{3}(\S.*?)\s+(\d+) pass\s+(\d+) fail/.exec(line);
    if (mm && Number(mm[3]) > 0) red.push(`${mm[1].trim()}:${mm[3]}`);
  }
  const threw = r.status !== 0 && red.length === 0 ? ' (exit ' + r.status + (r.stderr ? ': ' + r.stderr.split('\n').find(l => /Error/.test(l)) : '') + ')' : '';
  const ok = r.status !== 0;
  if (!ok) survived++;
  if (ok === expectSurvive) unexpected++;
  const tagS = ok ? (expectSurvive ? 'RED (declared survivor - claim WRONG)' : 'RED     ') : (expectSurvive ? 'SURVIVED as declared' : 'SURVIVED');
  rows.push(`#${String(i).padStart(2)} ${tagS} ${file} | ${what} | ${red.join(', ') || threw || 'no failing section'}  [${((Date.now() - t0) / 1000).toFixed(0)}s]` +
    (expectSurvive ? '\n       declared: ' + opt.why : ''));
  console.log(rows[rows.length - 1]);
}
const declared = M.filter(m => m[5] && m[5].expect === 'survive').length;
console.log(`\n${M.length} mutants: ${M.length - survived} red, ${survived} survived (${declared} declared survivors); unexpected outcomes: ${unexpected}`);
process.exitCode = unexpected ? 1 : 0;
