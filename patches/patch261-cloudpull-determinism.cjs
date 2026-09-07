/* THE FLAKY TEST WAS FLAKY BY CONSTRUCTION, AND ITS OWN COMMENT SAID SO.

   tests/cloudpull.spec.js:224 fails at random. It failed once in a full-suite
   run this session and passed on every run of its own file afterwards, which
   is the shape that gets a test marked "just a flake" and left alone.

   It is not a flake in the code. The fixture drops every DROPth REQUEST, and
   the comment above that line already explains why the outcome cannot be
   predicted from it:

     "Downloads run concurrently, so which file each request belongs to
      varies, and so does which files exhaust their three tries. The DROP RATE
      is fixed; the outcome is not, and NO ASSERTION MAY DEPEND ON A
      PARTICULAR COUNT."

   And then, thirty lines below, the test asserts loaded === 200 and
   missing === 0. Someone wrote the rule and then broke it in the same file.
   At one drop in ten a file is lost whenever all three of its attempts happen
   to land on a multiple of ten, which is uncommon and not rare.

   THE FIX IS TO MAKE THE FAILURE A PROPERTY OF THE FILE. Which request number
   a download gets is a scheduling accident; which FILE the connection hates
   is the thing being modelled. The path already carries the index, so the
   fixture can fail a chosen file's first N attempts and no others, and both
   tests that use it become exact:

     recoverable   every 10th file fails twice, succeeds on its third try
                   -> 200 arrive, 240 requests, always
     unrecoverable every 25th file fails every time
                   -> 8 lost, 192 arrive, 216 requests, always

   That is a STRONGER test than the one it replaces, not a weaker one. "More
   than 200 requests" becomes exactly 240, and "nearly all of them" becomes
   192 with the eight named in the message - so a retry that silently stopped
   retrying, or one that retried a 404, now has nowhere to hide. */
const kit = require('./pb-repo/tools/patchkit.cjs');
const fs = require('fs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tests/cloudpull.spec.js';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const sig = kit.only(L,
  l => l === 'const pullWithBadFiles = (page, total, dropEvery, mode) => page.evaluate(async ([TOTAL, DROP, MODE]) => {',
  'the fixture signature');
const dropLine = kit.only(L,
  l => l === "      if (attempts % DROP === 0) return Promise.reject(new TypeError('Failed to fetch'));",
  'the request-counter drop');
const argsLine = kit.only(L, l => l === '}, [total, dropEvery, mode]);', 'the fixture arguments');
const call1 = kit.only(L, l => l === "    const r = await pullWithBadFiles(page, 200, 10, 'flaky');", 'the recoverable call');
const call3 = kit.only(L, l => l === "    const r = await pullWithBadFiles(page, 200, 3, 'flaky');", 'the unrecoverable call');
const callMissing = kit.only(L, l => l === "    const r = await pullWithBadFiles(page, 50, 1, 'missing');", 'the 404 call');

/* The page's own retry count, read rather than assumed - a fixture that fails
   "twice" only recovers if the pull really tries three times. */
const PAGE = fs.readFileSync('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html', 'utf8');
const m = PAGE.match(/const PULL_TRIES=(\d+);/);
if (!m) throw new Error('cannot read PULL_TRIES out of index.html');
const TRIES = +m[1];
if (TRIES !== 3) throw new Error('PULL_TRIES is ' + TRIES + ', so the numbers in these tests are wrong');

/* ---- WRITE, bottom upward ---------------------------------------- */

kit.replace(L, { start: call3, end: call3 }, [
  "    const r = await pullWithBadFiles(page, 200, { failEvery: 25, failTimes: 99 });",
]);
kit.replace(L, { start: call1, end: call1 }, [
  "    const r = await pullWithBadFiles(page, 200, { failEvery: 10, failTimes: 2 });",
]);
kit.replace(L, { start: callMissing, end: callMissing }, [
  "    const r = await pullWithBadFiles(page, 50, { mode: 'missing' });",
]);

kit.replace(L, { start: argsLine, end: argsLine }, ['}, [total, opts]);']);

kit.replace(L, { start: dropLine - 8, end: dropLine }, [
  '      // WHICH FILE, NOT WHICH REQUEST. This used to fail every DROPth',
  '      // request, and the comment here said in as many words that the',
  '      // outcome could not be predicted from that and that no assertion may',
  '      // depend on a particular count - while the test below asserted',
  '      // loaded === 200. Which request number a download happens to get is a',
  '      // scheduling accident of eight concurrent fetches; which file the',
  '      // connection hates is the thing worth modelling, and the path carries',
  '      // the index, so it can be modelled exactly.',
  '      const which = +(s.match(/p\\/(\\d+)\\.png/) || [0, -1])[1];',
  '      if (which < 0) return Promise.reject(new TypeError("unrecognised object path"));',
  '      const seen = (tries.get(which) || 0) + 1;',
  '      tries.set(which, seen);',
  '      if (which % EVERY === 0 && seen <= TIMES)',
  "        return Promise.reject(new TypeError('Failed to fetch'));",
]);

kit.replace(L, { start: sig, end: sig }, [
  'const pullWithBadFiles = (page, total, opts) => page.evaluate(async ([TOTAL, O]) => {',
  "  const MODE = O.mode || 'flaky';",
  '  /* failEvery: one file in this many misbehaves. failTimes: how many of ITS',
  '     OWN attempts fail before it succeeds - so 2 against three tries is a',
  '     connection that recovers, and 99 is one that never does. Both outcomes',
  '     are then exact, which is the whole point of the change. */',
  '  const EVERY = O.failEvery || 1, TIMES = O.failTimes || 0;',
  '  const tries = new Map();',
]);

/* The header comment, superseded rather than left describing the old model. */
const hdr = kit.only(L, l => l === '/* Like pullFrom, but the FILE downloads misbehave: every `dropEvery`th one is',
  'the fixture header');
if (L[hdr + 1] !== '   dropped like a flaky connection, or every one 404s if `mode` says so. */')
  throw new Error('the header is not the two lines assumed');
kit.replace(L, { start: hdr, end: hdr + 1 }, [
  '/* Like pullFrom, but the FILE downloads misbehave, and misbehave for a file',
  '   rather than for a request number.',
  '',
  '     { failEvery: 10, failTimes: 2 }   one file in ten drops twice, then works',
  '     { failEvery: 25, failTimes: 99 }  one file in 25 never works at all',
  '     { mode: "missing" }               every file 404s',
  '',
  '   Per FILE is what makes the counts exact. Per request they were not: eight',
  '   downloads run at once, so which file a failing request belonged to varied',
  '   between runs and so did how many files exhausted their three tries. */',
]);

/* kit.save is built for index.html - it carves out the <script> block and
   parses it, and a spec file has no such block. So the same checks run here
   against the joined text and the write is done directly. The parse check is
   the spec run itself: a syntax error in a Playwright file is loud. */
const out = doc.lines.join(doc.EOL);
const grew = ((lines, text) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const pullWithBadFiles = (page, total, opts) => page.evaluate(async ([TOTAL, O]) => {') !== 1)
    throw new Error('the new signature did not land');
  /* The old model is gone entirely - a fixture with both would be worse. */
  if (text.indexOf('attempts % DROP === 0') >= 0) throw new Error('the request-counter drop is still there');
  if (text.indexOf('dropEvery') >= 0) throw new Error('something still passes dropEvery');
  if (has('}, [total, opts]);') !== 1) throw new Error('the arguments did not land');
  /* Every call site moved. A missed one would pass undefined and silently */
  /* never fail a single download, which reads as a passing test. */
  const calls = lines.filter(l => l.indexOf('await pullWithBadFiles(') >= 0);
  if (calls.length !== 3) throw new Error('expected 3 call sites, saw ' + calls.length);
  for (const c of calls) if (c.indexOf('{') < 0) throw new Error('a call site still uses the old shape: ' + c.trim());
  fs.writeFileSync(FILE, text);
  return text.length - doc.original.length;
})(doc.lines, out);

console.log('cloudpull.spec.js grew by ' + grew + ' bytes');
