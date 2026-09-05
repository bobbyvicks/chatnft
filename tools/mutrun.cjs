/* A mutation runner, so each fix's file holds only its PREDICTIONS.

   Three near-copies of this had already been written today and the third was
   where the shared parts stopped being worth retyping. The predictions are the
   valuable half and they stay per-fix; the machinery does not.

   Rules it enforces, because each was a way an earlier run lied:

   - Anchors are written with plain \n and converted to the file's own line
     ending. index.html is CRLF; a multi-line search built with \n matches
     nothing, and a runner whose anchors never match reports a perfect score.
   - An anchor must be found EXACTLY once and must actually change something.
   - The run must report the expected NUMBER of tests. A JSON reporter that
     produced a partial run would otherwise read as a clean sweep.
   - The baseline must be green before any mutant runs; a pre-existing red
     wears a kill's shape.
   - Restore is proven by tree-hash identity against a baseline copy, never by
     an empty git diff.
   - A mutant that reds something UNPREDICTED is a failure of the prediction,
     reported as loudly as a survivor. Saying which tests should NOT move is
     what makes the ones that do mean anything.
*/
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

function runMutants(cfg) {
  const { file, spec, ntests, mutants, baselineCopy } = cfg;
  /* Default to the repo this file lives in, so a caller can omit it and a
     mutate script is not tied to where it happens to sit. */
  const repo = cfg.repo || path.join(__dirname, '..');
  const FILE = path.join(repo, file);
  const BASE = baselineCopy || path.join(path.dirname(FILE), '..', 'mut-baseline.html');

  fs.copyFileSync(FILE, BASE);
  const baseline = fs.readFileSync(BASE, 'utf8');
  const EOL = baseline.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const eol = (s) => s.split('\n').join(EOL);

  const run = (label) => {
    const r = cp.spawnSync('npx', ['playwright', 'test', spec, '--reporter=json'],
      { cwd: repo, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
    let j;
    try { j = JSON.parse(r.stdout); }
    catch (_) { throw new Error(label + ': the reporter produced no JSON:\n' + r.stdout.slice(-2000)); }
    const tests = [];
    const walk = (suites) => (suites || []).forEach(s => {
      (s.specs || []).forEach(sp => tests.push({ title: sp.title, ok: sp.ok }));
      walk(s.suites);
    });
    walk(j.suites);
    if (tests.length !== ntests)
      throw new Error(label + ': expected ' + ntests + ' tests, the run reported ' + tests.length);
    return tests;
  };

  console.log('BASELINE');
  const baseRed = run('baseline').filter(t => !t.ok).map(t => t.title);
  if (baseRed.length) throw new Error('the baseline is already red: ' + baseRed.join(', '));
  console.log('  ' + ntests + ' tests, 0 red\n');

  let bad = 0;
  for (const m of mutants) {
    const find = eol(m.find), replace = eol(m.with);
    if (baseline.indexOf(find) < 0) throw new Error('mutant anchor not found: ' + m.name);
    if (baseline.split(find).length !== 2) throw new Error('mutant anchor is not unique: ' + m.name);
    const mutated = baseline.split(find).join(replace);
    if (mutated === baseline) throw new Error('the mutation changed nothing: ' + m.name);
    fs.writeFileSync(FILE, mutated);
    let red;
    try {
      red = run(m.name).filter(t => !t.ok).map(t => t.title);
    } finally {
      fs.writeFileSync(FILE, baseline);
      const now = cp.execSync('git hash-object ' + file, { cwd: repo, encoding: 'utf8' }).trim();
      const want = cp.execSync('git hash-object "' + BASE + '"', { encoding: 'utf8' }).trim();
      if (now !== want) throw new Error('RESTORE FAILED: ' + now + ' != ' + want);
    }
    const killed = m.kills.filter(k => red.some(t => t.indexOf(k) >= 0));
    const extra = red.filter(t => !m.kills.some(k => t.indexOf(k) >= 0));
    const ok = killed.length === m.kills.length && extra.length === 0;
    if (!ok) bad++;
    console.log((ok ? 'ok  ' : 'BAD ') + m.name);
    console.log('    predicted ' + m.kills.length + ' red, got ' + red.length);
    red.forEach(t => console.log('      red  ' + t));
    m.kills.filter(k => !red.some(t => t.indexOf(k) >= 0))
      .forEach(k => console.log('      MISSED (survived) ' + k));
    extra.forEach(t => console.log('      UNPREDICTED red ' + t));
    console.log('');
  }
  try { fs.unlinkSync(BASE); } catch (_) {}
  console.log(bad ? bad + ' mutant(s) did not behave as predicted'
                  : 'every mutant reddened exactly what was predicted');
  return bad;
}

module.exports = { runMutants };
