/* PF.core.detect in BOTH modes against the Python reference's answer on 360
   real trait images - the oracle in modes/modes.jsonl.

   THE ORACLE. Each line of modes.jsonl was produced by modes/one.py in its
   OWN python process: decode with PIL (convert("RGBA")), then
   detect(mode="fast"), then detect(mode="full"), in that order, in that one
   process, and record cols, rows, round(step, 4) and the consensus label.

   ONE NODE PROCESS PER IMAGE, and the SAME ORDER inside it. The reference's
   k-means runs on OpenCV's process-global RNG and nothing seeds it, so an
   answer that reaches k-means depends on every draw made earlier in the
   process: two calls in one python process differ by 24% of bytes (README).
   So the worker below does exactly what one.py does - one image, fast then
   full - and the driver forks one worker per image, a pool of 6 at a time.
   (Full mode does reach k-means: fusion's build_evidence quantises. The
   reference runs that build on a fresh worker thread, which pf-50-core.js
   reproduces with core_onFreshThread; mirroring one.py's order anyway means
   this comparison does not depend on that claim being right.)

   THE INPUT. tools/oracle/decode-png.cjs is a minimal zlib-only decoder (no
   pngjs: nothing is installed here and nothing is vendored). `--decode`
   proves it hands the detector PIL's exact bytes: sha256 of our RGBA against
   tools/oracle/py-decode-hash.jsonl (tools/oracle/py-decode-hash.py) for
   every image. Run it first - a decoder difference would otherwise present
   as a detector mismatch.

   WHAT IS COMPARED, per image and mode: cols, rows (exact), step_x and
   step_y rounded the way the oracle rounded them (Python round(x, 4)) and
   compared exactly, and the consensus label (exact). The unrounded |diff|
   against the oracle's 4-dp value is also kept, so a step that agrees only
   because of rounding is visible (it can be at most 5e-5).

   Run:
     node tools/test-oracle-full.cjs --decode        decoder vs PIL, all images
     node tools/test-oracle-full.cjs                 all images, pool of 6
     node tools/test-oracle-full.cjs --limit N       the first N only
     node tools/test-oracle-full.cjs --one <png>     one image, THIS process
   Env: PF_ORACLE=<modes.jsonl>  PF_POOL=<n>
        PF_MUTATE="<from>=><to>"  worker loads the bundle with that ONE exact
                                  substring replaced (must occur exactly once,
                                  else the worker refuses) - the file on disk
                                  is never touched.
   Writes tools/oracle/results.jsonl (one line per image, ours + oracle) and
   exits 1 if anything differs or errors.

   PROOF IT CAN FAIL (run 2026-09-27, logs in tools/oracle/):
     PF_ORACLE=tools/oracle/arbitrated.jsonl      PF_MUTATE="sc += 0.6 * (rn[q] / rmax)=>sc += 0.5 * (rn[q] / rmax)"
       one weight in full-mode pick_axis: full 76 exact / 2 differ of the 78
       arbitrated images (Mouth 03 128x128 -> 256x256; Straight Mouth
       213x256 -> 256x256), fast 78 of 78 still exact - as it must be, fast
       never reaches pick_axis. mutant-arb.log.
     PF_MUTATE="...PF.rint(0.01 * b.cols)...=>...0.05..." (_size_close), first
       120 images: fast 3 differ (one on the consensus label alone), full 3
       differ. mutant-fast.log.
   The decoder and the 4-dp rounding have their own controls:
   tools/oracle/decode-mutants.cjs and tools/oracle/check-round4.cjs. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { decodePNG } = require('./oracle/decode-png.cjs');

const ROOT = path.dirname(__dirname);
const SCRATCH = path.resolve(ROOT, '..', '..');
const ORACLE = process.env.PF_ORACLE || path.join(SCRATCH, 'modes', 'modes.jsonl');
const OUT = path.join(__dirname, 'oracle');
const argv = process.argv.slice(2);

function readJsonl(f) {
  return fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

/* Python round(x, 4): correctly rounded on the exact binary value, ties to
   even. toFixed also rounds the exact binary value, but ties away from zero.
   So the only case to fix is an EXACT tie: x * 20000 an odd integer, taken
   on x's exact binary value. The float product x * 10000 cannot decide
   that - it rounds, and its first version called 47.43245 a tie (1551 of
   58192 values wrong, tools/oracle/check-round4.cjs) - so it is decided in
   BigInt from x's mantissa and exponent. */
function pyRound4(x) {
  if (!Number.isFinite(x) || x === 0) return Number(x.toFixed(4));
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const bits = dv.getBigUint64(0);
  const bexp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn, e = bexp - 1075;
  if (bexp) mant |= 1n << 52n; else e = -1074;
  if (e < 0) {                                      // |x| = mant / 2^-e exactly
    const num = mant * 20000n, den = 1n << BigInt(-e);
    if (num % den === 0n && (num / den) % 2n === 1n) {   // exact tie at 4 dp
      const f = (num / den - 1n) / 2n;              // floor(|x| * 1e4)
      const even = f % 2n === 0n ? f : f + 1n;
      return (x < 0 ? -1 : 1) * Number(even) / 10000;
    }
  }
  return Number(x.toFixed(4));
}

/* ------------------------------------------------------------ the worker */
function worker(png) {
  let src = fs.readFileSync(path.join(ROOT, 'pixelfixer.bundle.js'), 'utf8');
  if (process.env.PF_MUTATE) {
    const k = process.env.PF_MUTATE.indexOf('=>');
    const from = process.env.PF_MUTATE.slice(0, k), to = process.env.PF_MUTATE.slice(k + 2);
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('PF_MUTATE: "' + from + '" occurs ' + n + ' times in the bundle, need exactly 1');
    src = src.replace(from, to);
  }
  (0, eval)(src);
  const PF = globalThis.PF;
  const img = decodePNG(fs.readFileSync(png));
  const out = { path: png, w: img.w, h: img.h };
  // modes/one.py's limit, verbatim: h * w > 4_000_000 or min(h, w) < 16
  if (img.h * img.w > 4000000 || Math.min(img.h, img.w) < 16) {
    out.skip = "outside the reference's input limits";
    return out;
  }
  const rgba = { d: img.d, w: img.w, h: img.h, cn: 4 };
  for (const mode of ['fast', 'full']) {           // one.py's order
    const t0 = process.hrtime.bigint();
    try {
      const r = PF.core.detect(rgba, mode);
      const s = Number(process.hrtime.bigint() - t0) / 1e9;
      out[mode] = { cols: r.cols, rows: r.rows, sx: pyRound4(r.step_x), sy: pyRound4(r.step_y),
                    sx_raw: r.step_x, sy_raw: r.step_y, why: String(r.consensus), s };
      if (r._errors) out[mode]._errors = r._errors;
    } catch (e) {
      out[mode] = { error: String(e && e.stack || e).slice(0, 400), s: Number(process.hrtime.bigint() - t0) / 1e9 };
    }
  }
  return out;
}

/* ------------------------------------------------------------ the driver */
function runPool(items, n, extraEnv) {
  return new Promise(resolve => {
    const res = new Array(items.length);
    let next = 0, done = 0;
    if (!items.length) return resolve(res);
    const start = () => {
      if (next >= items.length) return;
      const i = next++, it = items[i];
      const ch = spawn(process.execPath, ['--max-old-space-size=4096', __filename, '--one', it.path],
                       { env: Object.assign({}, process.env, extraEnv || {}) });
      let so = '', se = '';
      const timer = setTimeout(() => ch.kill(), 900000);
      ch.stdout.on('data', d => { so += d; });
      ch.stderr.on('data', d => { se += d; });
      ch.on('close', code => {
        clearTimeout(timer);
        const line = so.trim().split('\n').pop() || '';
        try { res[i] = JSON.parse(line); }
        catch (e) { res[i] = { path: it.path, crash: 'exit ' + code + ': ' + (se || so).slice(-400) }; }
        done++;
        if (done % 40 === 0) process.stderr.write(done + '/' + items.length + '\n');
        if (done === items.length) resolve(res); else start();
      });
    };
    for (let k = 0; k < Math.min(n, items.length); k++) start();
  });
}

function cmpMode(o, j) {
  if (!o || !j) return { status: 'error', why: 'missing' };
  if (o.error || j.error) {
    if (o.error && j.error) return { status: 'both-raise' };
    return { status: 'error', why: j.error ? 'ours raised: ' + j.error.split('\n')[0] : 'oracle raised: ' + o.error };
  }
  const bad = [];
  if (j.cols !== o.cols || j.rows !== o.rows) bad.push('size');
  if (j.sx !== o.sx || j.sy !== o.sy) bad.push('step');
  if (j.why !== o.why) bad.push('consensus');
  const drift = Math.max(Math.abs(j.sx_raw - o.sx), Math.abs(j.sy_raw - o.sy));
  return { status: bad.length ? 'differs' : 'exact', bad, drift };
}

function fmt(m) {
  if (!m) return '-';
  if (m.error) return 'RAISED ' + m.error.split('\n')[0].slice(0, 80);
  return m.cols + 'x' + m.rows + ' step ' + m.sx + '/' + m.sy + ' ' + m.why;
}

function summarise(oracle, ours, label) {
  const tally = { fast: { exact: 0, differs: 0, 'both-raise': 0 }, full: { exact: 0, differs: 0, 'both-raise': 0 } };
  const errors = [], diffs = [], skips = [];
  const secs = { fast: [], full: [] };
  let maxDrift = { fast: 0, full: 0 };
  for (let i = 0; i < oracle.length; i++) {
    const o = oracle[i], j = ours[i];
    if (j.crash) { errors.push([o.path, 'worker: ' + j.crash]); continue; }
    if (o.skip || j.skip) {
      if (o.skip && j.skip) skips.push(o.path);
      else errors.push([o.path, 'skip mismatch: oracle ' + (o.skip || 'ran') + ', ours ' + (j.skip || 'ran')]);
      continue;
    }
    if (j.w !== o.w || j.h !== o.h) { errors.push([o.path, 'decoded size ' + j.w + 'x' + j.h + ' vs ' + o.w + 'x' + o.h]); continue; }
    for (const mode of ['fast', 'full']) {
      const c = cmpMode(o[mode], j[mode]);
      if (c.status === 'error') { errors.push([o.path, mode + ': ' + c.why]); continue; }
      tally[mode][c.status]++;
      if (c.status === 'differs') diffs.push({ path: o.path, mode, bad: c.bad, oracle: fmt(o[mode]), ours: fmt(j[mode]) });
      if (c.drift > maxDrift[mode]) maxDrift[mode] = c.drift;
      if (j[mode] && typeof j[mode].s === 'number' && !j[mode].error) secs[mode].push(j[mode].s);
    }
  }
  const n = oracle.length;
  console.log('\n' + label + ' - ' + n + ' oracle lines (' + skips.length + ' skipped on both sides by the input limit)\n');
  console.log('| row | images |');
  console.log('|---|---|');
  console.log('| fast exact | ' + tally.fast.exact + ' |');
  console.log('| fast differs | ' + tally.fast.differs + ' |');
  console.log('| full exact | ' + tally.full.exact + ' |');
  console.log('| full differs | ' + tally.full.differs + ' |');
  console.log('| errors | ' + errors.length + ' |');
  if (tally.fast['both-raise'] + tally.full['both-raise'])
    console.log('| both sides raised | fast ' + tally.fast['both-raise'] + ', full ' + tally.full['both-raise'] + ' |');
  console.log('\nmax |unrounded step - oracle 4dp|: fast ' + maxDrift.fast.toExponential(2) + ', full ' + maxDrift.full.toExponential(2));
  for (const mode of ['fast', 'full']) {
    const a = secs[mode];
    if (!a.length) continue;
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    console.log('node seconds per image, ' + mode + ': mean ' + mean.toFixed(2) + ', max ' + Math.max.apply(null, a).toFixed(2) + ' (n=' + a.length + ')');
  }
  const py = { fast: [], full: [] };
  for (const o of oracle) for (const mode of ['fast', 'full']) if (o[mode] && typeof o[mode].s === 'number') py[mode].push(o[mode].s);
  for (const mode of ['fast', 'full']) {
    const a = py[mode];
    if (!a.length) continue;
    console.log('python seconds per image (oracle, 6 in parallel), ' + mode + ': mean '
      + (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) + ', max ' + Math.max.apply(null, a).toFixed(2));
  }
  if (diffs.length) {
    console.log('\nDIFFERING');
    for (const d of diffs) console.log(d.mode + ' [' + d.bad.join(',') + '] ' + d.path + '\n    oracle: ' + d.oracle + '\n    ours:   ' + d.ours);
  }
  if (errors.length) {
    console.log('\nERRORS');
    for (const [p, e] of errors) console.log(p + '\n    ' + e);
  }
  return { tally, diffs, errors };
}

async function main() {
  if (argv[0] === '--one') {
    process.stdout.write(JSON.stringify(worker(argv[1])) + '\n');
    return;
  }

  const oracle = readJsonl(ORACLE);

  if (argv[0] === '--decode') {
    const want = new Map(readJsonl(path.join(OUT, 'py-decode-hash.jsonl')).map(r => [r.path, r]));
    let same = 0, bad = 0;
    for (const o of oracle) {
      const p = want.get(o.path);
      if (!p) { console.log('NO PYTHON HASH ' + o.path); bad++; continue; }
      let img;
      try { img = decodePNG(fs.readFileSync(o.path)); }
      catch (e) { console.log('DECODER REFUSED ' + o.path + ': ' + e.message); bad++; continue; }
      const h = crypto.createHash('sha256').update(img.d).digest('hex');
      if (h === p.sha256 && img.w === p.w && img.h === p.h) same++;
      else { bad++; console.log('DIFFERS ' + o.path + ' ours ' + img.w + 'x' + img.h + ' ' + h.slice(0, 12) + ' PIL ' + p.w + 'x' + p.h + ' ' + p.sha256.slice(0, 12)); }
    }
    console.log(same + ' of ' + oracle.length + ' images decode to PIL\'s exact RGBA bytes, ' + bad + ' do not');
    process.exit(bad ? 1 : 0);
  }

  const lim = argv.indexOf('--limit');
  const items = lim >= 0 ? oracle.slice(0, +argv[lim + 1]) : oracle;
  const pool = +(process.env.PF_POOL || 6);
  const t0 = Date.now();
  const ours = await runPool(items, pool);
  fs.writeFileSync(path.join(OUT, process.env.PF_MUTATE ? 'results-mutant.jsonl' : 'results.jsonl'),
    items.map((o, i) => JSON.stringify({ oracle: o, ours: ours[i] })).join('\n') + '\n');
  const s = summarise(items, ours, 'PF.core.detect vs pixelfixer.core.detect' + (process.env.PF_MUTATE ? ' [MUTANT ' + process.env.PF_MUTATE + ']' : ''));
  console.log('\nwall ' + ((Date.now() - t0) / 1000).toFixed(0) + 's, pool ' + pool);
  process.exit(s.diffs.length || s.errors.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
