/* A COMMENT THAT RECORDED A GUESS AS A REASON.

   pf-11-quantize.js said the k-means budget "12 iterations at eps 0.5 is
   far from converged on purpose". Measured on 2026-09-18 on 13 working
   traits, instrumented to report where each attempt stopped: 24 of 26
   attempts stopped by eps within 2 to 11 iterations; only one file (Alien
   Hat Forest) hit the cap. At this budget the k-means IS converged on real
   traits, and the recorded reason for keeping the budget was false. The
   budget still stays, for the reason that is true: raising attempts or
   iterations leaves the seed sensitivity in the same band (176 to 198
   post-palette cells per file and seed across six settings, against 195
   at the shipped 2x12) and moves the shipped result on 2 to 12 of 20
   files for nothing. The comment says that now, superseding rather than
   deleting what it replaced.

   Engine text only; behaviour unchanged. Rebuilt and re-inlined the same
   way as patch500, with the same check that the inline was the bundle. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const SRC = path.join(ROOT, 'pixelfixer', 'src', 'pf-11-quantize.js');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');

const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');

{
  const raw = fs.readFileSync(SRC, 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lf = raw.replace(/\r\n/g, '\n');
  const needle = [
    '    // criteria = (EPS + MAX_ITER, 12, 0.5); 2 attempts; KMEANS_PP_CENTERS.',
    '    // 12 iterations at eps 0.5 is far from converged on purpose: it is a',
    '    // pre-processing palette, and the grid detector only needs the steps to',
    '    // land on cell boundaries, not the centres to be optimal.',
    '',
  ].join('\n');
  if (lf.split(needle).length !== 2) throw new Error('the convergence comment is not where this expects');
  const out = lf.replace(needle, [
    '    // criteria = (EPS + MAX_ITER, 12, 0.5); 2 attempts; KMEANS_PP_CENTERS.',
    '    // SUPERSEDED (2026-09-18): this used to say "12 iterations at eps 0.5',
    '    // is far from converged on purpose: it is a pre-processing palette".',
    '    // Measured on 13 real traits with each attempt reporting where it',
    '    // stopped: 24 of 26 stopped by eps within 2 to 11 iterations, one file',
    '    // in 26 hit the cap. At this budget the k-means IS converged on real',
    '    // traits. The budget stays for the reason that is true: raising',
    '    // attempts or iterations leaves the seed sensitivity in the same band',
    '    // (176 to 198 post-palette cells per file and seed across six settings,',
    '    // 195 at 2x12) and moves the shipped result on 2 to 12 of 20 files for',
    '    // nothing; and it is the reference\'s own budget (quantize.py).',
    '',
  ].join('\n'));
  if (out === lf) throw new Error('nothing changed');
  fs.writeFileSync(SRC, out.replace(/\n/g, eol));
}

require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
const newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
if (newBundle.indexOf('SUPERSEDED (2026-09-18): this used to say') < 0) throw new Error('the bundle lacks the new comment');
/* comment-only: the bundle with comments stripped must be identical */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');
if (strip(newBundle) !== strip(oldBundle)) throw new Error('the code changed, and this patch is comment-only');

const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const open = kit.only(L, l => l === '<script id="pfcore" type="text/plain">', 'the engine tag');
let close = -1;
for (let i = open + 1; i < L.length; i++) if (L[i] === '</script>') { close = i; break; }
if (close < 0) throw new Error('no end to the engine tag');
const inlined = L.slice(open + 1, close).join('\n').replace(/\s+$/, '');
if (inlined !== oldBundle) throw new Error('the inlined engine is not the bundle as built');
kit.replace(L, { start: open + 1, end: close - 1 }, newBundle.split('\n'));
const grew = kit.save(doc, ({ text }) => {
  const m = text.match(/<script id="pfcore" type="text\/plain">([\s\S]*?)<\/script>/);
  const inl = m[1].replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '');
  if (inl !== newBundle) throw new Error('the inlined engine is not the rebuilt bundle');
  new Function('globalThis', inl + '\nreturn globalThis.PF;')({});
});
fs.renameSync(TMP, FILE);
console.log('patch504 written, ' + grew + ' bytes');
