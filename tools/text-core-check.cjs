/* IS THE TEXT RENDERER IN THIS PAGE STILL CODEX'S TEXT RENDERER?

   The pixel-lettering renderer came from Codex's branch
   feat/trait-shelf-organization, commit 7724c06, file text-overlay-core.js.
   It was pasted into index.html unchanged, and that is a claim worth being
   able to check rather than assert: a port that has been "tidied" is a
   rewrite, and a rewrite is not covered by the tests written for the
   original.

   So this does two things, in order.

   1. It compares the block in index.html - from the first function to the
      globalThis assignment that ends it - against the file in the commit,
      byte for byte after line endings are normalised. index.html is CRLF
      throughout and the commit is LF, which is the only difference allowed.

   2. It runs Codex's own 27 tests against the block AS IT NOW STANDS IN THE
      PAGE, not against the commit. Running them against the commit would
      prove only that the commit passes its own tests, which nobody doubts.
      The slice is what ships, so the slice is what is tested.

   Both artefacts come out of git at run time. Nothing is vendored, so there
   is no second copy to drift, and if the branch ever goes away this fails
   loudly instead of quietly testing a stale duplicate.

   Run:  node tools/text-core-check.cjs
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SOURCE_COMMIT = '7724c06';
const CORE = SOURCE_COMMIT + ':text-overlay-core.js';
const SPEC = SOURCE_COMMIT + ':test/text-overlay-core.test.mjs';

const fromGit = (what) => {
  try {
    return execFileSync('git', ['show', what], { cwd: REPO, encoding: 'utf8' });
  } catch (e) {
    throw new Error('cannot read ' + what + ' - is the branch '
      + 'feat/trait-shelf-organization still fetched? (' + e.message.trim() + ')');
  }
};

const lf = s => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

/* ---- 1. the page holds the same bytes ----------------------------------- */
/* Through patchkit, which is what every patch in this repo uses to find the
   page's script. Hand-rolling the same slice here is how a checker ends up
   reading a different region than the thing it is checking. */
const page = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const script = require('./patchkit.cjs').scriptOf(page);

const start = script.indexOf('function applyTextOverlay(');
const exportAt = script.indexOf('globalThis.ChatNftTextOverlay');
const finish = script.indexOf('};', exportAt);
if (start < 0 || exportAt < 0 || finish < 0 || exportAt < start)
  throw new Error('the renderer is not in index.html, or no longer ends with its export');

const inPage = lf(script.slice(start, finish + 2));
const inCommit = lf(fromGit(CORE).slice(fromGit(CORE).indexOf('function applyTextOverlay(')));

if (inPage !== inCommit) {
  /* Say WHERE, because "they differ" over 528 lines is not actionable. */
  const a = inPage.split('\n'), b = inCommit.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  throw new Error('index.html has drifted from ' + CORE + ' at line ' + (i + 1)
    + '\n  page:   ' + JSON.stringify(a[i])
    + '\n  commit: ' + JSON.stringify(b[i]));
}
console.log('the renderer in index.html is ' + CORE + ', byte for byte ('
  + inPage.split('\n').length + ' lines)');

/* ---- 2. and Codex's tests still pass against it -------------------------- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-text-core-'));
try {
  /* THE SLICE, not the commit. Testing the commit would test something this
     page does not run. */
  fs.writeFileSync(path.join(dir, 'text-overlay-core.js'), inPage + '\n');
  fs.writeFileSync(path.join(dir, 'core.test.mjs'),
    fromGit(SPEC).replace('../text-overlay-core.js', './text-overlay-core.js'));

  /* The FILE, not the directory. `node --test <dir>` on this version treats
     the path as a module to load rather than a place to search, and the
     failure it gives - MODULE_NOT_FOUND - reads like a broken import in the
     test rather than a wrong argument here. */
  const out = execFileSync(process.execPath, ['--test', path.join(dir, 'core.test.mjs')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  /* Two summary shapes, both from node --test: the TAP-ish "# pass 27" and
     the informational one this version prints with a leading marker. Matching
     only the first turns a clean run into "could not read the test summary",
     which is an instrument failure wearing the clothes of a real one. */
  const count = w => new RegExp('^\\W* ?' + w + ' (\\d+)$', 'm').exec(out);
  const pass = count('pass'), fail = count('fail');
  if (!pass || !fail) { console.log(out); throw new Error('could not read the test summary'); }
  if (fail[1] !== '0') { console.log(out); throw new Error(fail[1] + ' of Codex\'s tests fail against the page'); }
  /* A run that executes nothing exits 0 and prints "# pass 0". That is an
     instrument failure wearing a pass, so it is an error here. */
  if (+pass[1] < 20) { console.log(out); throw new Error('only ' + pass[1] + ' tests ran - the spec did not load'); }
  console.log(pass[1] + " of Codex's own tests pass against the page's copy");
} catch (e) {
  if (e.stdout) console.log(String(e.stdout));
  if (e.stderr) console.error(String(e.stderr));
  throw e;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
