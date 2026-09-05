/* Proves every anchor in a mutate file matches the tree EXACTLY ONCE, before
   any of them costs a playwright run.

   Written because one anchor took four attempts on 09-05: the file writes an
   em dash as the escape sequence —, and each attempt to type it went
   through a shell heredoc that ate a level of backslashes. The runner only
   discovers that after the baseline and the first mutants have run, which is
   several minutes per attempt.

   It imports nothing from the mutate file - it reads it as text and pulls the
   `find:` strings out by evaluating them in place, so what is checked is the
   same expression the runner will use rather than a retyping of it.
*/
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) throw new Error('usage: node checkanchors.cjs mutateNNN.cjs');

/* Capture the mutants array by stubbing the runner. */
const runnerPath = require.resolve('./mutrun.cjs');
let captured = null;
require.cache[runnerPath] = {
  id: runnerPath, filename: runnerPath, loaded: true,
  exports: { runMutants: (cfg) => { captured = cfg; return 0; } },
};
/* process.exit at the end of a mutate file would stop this dead. */
const realExit = process.exit;
process.exit = () => {};
try { require(path.resolve(file)); } finally { process.exit = realExit; }
if (!captured) throw new Error('that file never called runMutants');

const repo = captured.repo || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repo, captured.file), 'utf8');

/* THE SAME LINE-ENDING CONVERSION THE RUNNER DOES. Anchors are written with
   plain newlines and mutrun converts them to the file's own ending before
   looking. Without this every multi-line anchor is reported as missing - which
   is what the first version of this file did, on two perfectly good anchors.
   An instrument that invents failures is worse than no instrument, because the
   response to it is to go and change something that was right. */
const EOL = html.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const eol = (s) => s.split('\n').join(EOL);

let bad = 0;
for (const m of captured.mutants) {
  const n = html.split(eol(m.find)).length - 1;
  const ok = n === 1;
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : 'BAD ') + n + '  ' + m.name);
  if (!ok) console.log('      ' + JSON.stringify(m.find).slice(0, 160));
}
console.log(bad ? bad + ' anchor(s) would not match' : 'every anchor matches exactly once');
process.exit(bad ? 1 : 0);
