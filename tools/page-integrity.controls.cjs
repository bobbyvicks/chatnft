/* Positive controls for page-integrity.cjs.
 *
 * page-integrity reports CLEAN on index.html. That is worth nothing on its own:
 * a check that cannot fail proves nothing, and a clean result from a broken
 * checker looks exactly like a clean result from a healthy one.
 *
 * So this takes the real index.html, injects one known defect at a time, and
 * requires that
 *   - the check that owns that defect FIRES, naming the right thing, and
 *   - the checks that do NOT own it stay SILENT.
 *
 * The second half is the part that matters. A tool that shouted on every
 * mutation would pass a naive "can it fail?" test while proving nothing about
 * what it actually detects. Selectivity is what makes a firing mean something.
 *
 * It also checks the two ways the tool is supposed to refuse rather than guess:
 * a desynced lexer must report NOTHING (not CLEAN), and the lexer self-test
 * must itself be able to fail, so the "self-test passed" line on every run is
 * not decorative.
 *
 * Usage:  node tools/page-integrity.controls.cjs
 * Exit 0 = every control behaved, 1 = at least one did not.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'index.html');
const TOOL = path.join(__dirname, 'page-integrity.cjs');
const TMP = path.join(os.tmpdir(), 'page-integrity-control.html');

const original = fs.readFileSync(SRC, 'utf8');

function run(file) {
  try {
    return { code: 0, out: execFileSync('node', [TOOL, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function kinds(out) {
  const found = new Set();
  for (const k of ['IDS', 'DUPIDS', 'CALLS', 'CSS']) {
    if (new RegExp('^' + k + ' \\(', 'm').test(out)) found.add(k.toLowerCase());
  }
  return found;
}

/* Apply a replacement and REFUSE to continue if the anchor did not match.
   A mutation that silently did nothing produces a "the check did not fire"
   that is indistinguishable from a broken check. This guard has already earned
   its keep: index.html is overwhelmingly CRLF (5637 CRLF against 13 bare LF),
   so a multi-line anchor written with \n matches nothing at all. */
function mutate(text, from, to, label) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(label + ': anchor NOT FOUND -> ' + JSON.stringify(from.slice(0, 60)));
  if (text.indexOf(from, i + 1) >= 0) throw new Error(label + ': anchor AMBIGUOUS, matches more than once');
  return text.slice(0, i) + to + text.slice(i + from.length);
}

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  -- ' + detail : ''));
}

console.log('page-integrity positive controls\n');

/* --------------------------------------------- 0. negative control (base) */
{
  fs.writeFileSync(TMP, original);
  const r = run(TMP);
  expect('negative control: the untouched file is clean, exit 0',
    r.code === 0 && /CLEAN/.test(r.out), 'exit ' + r.code);
}

/* ------------------------------------------------------- 1. calls fires */
{
  fs.writeFileSync(TMP, mutate(original, 'function fitZoom(){', 'function fitZoomRENAMED(){', 'calls'));
  const r = run(TMP); const k = kinds(r.out);
  expect('calls: renaming a declaration leaves its call sites unresolved',
    r.code === 1 && k.has('calls') && /`fitZoom\(\)`/.test(r.out),
    'exit ' + r.code + ', fired=' + ([...k].join(',') || 'none'));
  expect('calls: selective - ids/dupids/css stay silent',
    !k.has('ids') && !k.has('dupids') && !k.has('css'),
    'fired=' + ([...k].join(',') || 'none'));
}

/* --------------------------------------------------------- 2. ids fires */
{
  fs.writeFileSync(TMP, mutate(original,
    "addEventListener('resize',()=>{ if(!$('app').hidden",
    "addEventListener('resize',()=>{ if(!$('appZZZ').hidden", 'ids'));
  const r = run(TMP); const k = kinds(r.out);
  expect('ids: a lookup of an element that does not exist is caught',
    r.code === 1 && k.has('ids') && /`appZZZ`/.test(r.out),
    'exit ' + r.code + ', fired=' + ([...k].join(',') || 'none'));
  expect('ids: selective - calls/dupids/css stay silent',
    !k.has('calls') && !k.has('dupids') && !k.has('css'),
    'fired=' + ([...k].join(',') || 'none'));
}

/* ------------------------------------------------------ 3. dupids fires */
{
  fs.writeFileSync(TMP, mutate(original, '<div class="toast" id="toast"></div>',
    '<div class="toast" id="toast"></div>\r\n<span id="toast"></span>', 'dupids'));
  const r = run(TMP); const k = kinds(r.out);
  expect('dupids: a second element carrying an existing id is caught',
    r.code === 1 && k.has('dupids') && /id `toast` appears 2 times/.test(r.out),
    'exit ' + r.code + ', fired=' + ([...k].join(',') || 'none'));
  expect('dupids: selective - ids/calls/css stay silent',
    !k.has('ids') && !k.has('calls') && !k.has('css'),
    'fired=' + ([...k].join(',') || 'none'));
}

/* --------------------------------------------------------- 4. css fires */
{
  /* drop the closing brace of the last media query - the exact shape that
     silently killed 180 rules once and reported nothing */
  fs.writeFileSync(TMP, mutate(original,
    '  .facts{grid-template-columns:1fr;}\r\n}\r\n</style>',
    '  .facts{grid-template-columns:1fr;}\r\n</style>', 'css'));
  const r = run(TMP); const k = kinds(r.out);
  expect('css: an unclosed rule is caught',
    r.code === 1 && k.has('css') && /unclosed/.test(r.out),
    'exit ' + r.code + ', fired=' + ([...k].join(',') || 'none'));
  expect('css: selective - ids/calls/dupids stay silent',
    !k.has('ids') && !k.has('calls') && !k.has('dupids'),
    'fired=' + ([...k].join(',') || 'none'));
}

/* ------------------------------- 5. the tool refuses rather than guessing */
{
  /* an unterminated string desyncs any lexer; everything after it is garbage.
     The tool must NOT report a clean page - it must exit 2 and say so. */
  fs.writeFileSync(TMP, mutate(original, 'const MAXZ=48;', "const MAXZ=48; const broken='oops;", 'refuse'));
  const r = run(TMP);
  expect('refusal: a desynced lexer reports nothing rather than CLEAN',
    r.code === 2 && !/CLEAN/.test(r.out),
    'exit ' + r.code + ' :: ' + r.out.trim().split('\n')[0]);
}

/* -------------------------- 6. the lexer self-test must be able to fail */
{
  const brokenTool = path.join(os.tmpdir(), 'page-integrity-broken.cjs');
  fs.writeFileSync(brokenTool, mutate(fs.readFileSync(TOOL, 'utf8'),
    "if (c === '/' && src[i + 1] === '/') {",
    "if (false && c === '/' && src[i + 1] === '/') {", 'selftest'));
  let r;
  try { r = { code: 0, out: execFileSync('node', [brokenTool, SRC], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { r = { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
  expect('self-test: a lexer that stops handling comments is caught by the self-test',
    r.code === 2 && /SELF-TEST FAILED/.test(r.out), 'exit ' + r.code);
  fs.unlinkSync(brokenTool);
}

/* ------------------------------------------------------------- teardown */
if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
expect('index.html untouched by the controls',
  fs.readFileSync(SRC, 'utf8') === original, '');

const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' controls passed');
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log('  ' + f.name + '  ' + f.detail);
  process.exit(1);
}
console.log('Every check fired on its own defect and stayed silent on the others.');
