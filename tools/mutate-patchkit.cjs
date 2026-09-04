/* Proof that tests/patchkit.spec.js can fail.

   A passing suite says nothing on its own: a test that cannot fail looks
   exactly like a test that passes. This breaks each guarantee patchkit makes,
   one at a time, and checks the suite goes red in EXACTLY the places predicted
   here in the table below - which is the part that makes it a kill rather than
   a bang. A mutation that reds everything has usually broken the harness.

   That happened on the first run of this file. The line reporter prints a
   progress line per test, a regex over its output matched those instead of the
   failures, and all four mutants read as killing all seven tests. An impossible
   result indicts the instrument. It now reads status from the JSON reporter and
   treats a run that reports other than seven tests as an error.

   The restore is checked by hashing against a baseline copy, never by
   git diff --quiet - which answers unconditionally when the tree has other
   uncommitted work, so a mutation that never applied reads as a survivor.

   Run it from the repo root:  node tools/mutate-patchkit.cjs
*/
const fs = require('fs'), cp = require('child_process');
const KIT = 'tools/patchkit.cjs';
const BASELINE = require('path').join(require('os').tmpdir(), 'patchkit.baseline.cjs');
fs.copyFileSync(KIT, BASELINE);
const BASE = fs.readFileSync(BASELINE, 'utf8');
const baseHash = cp.execSync('git hash-object ' + JSON.stringify(BASELINE)).toString().trim();

const MUTANTS = [
  { name: 'only accepts the first of several matches',
    from: "  if (hits.length !== 1)\n    throw new Error(label + ': found '",
    to:   "  if (hits.length === 0)\n    throw new Error(label + ': found '",
    predict: [1] },
  { name: 'comments stripped by LINE SHAPE instead of delimiter',
    from: "  let out = '', i = 0;\n  while (i < text.length) {",
    to:   "  return text.split(NL).filter(l=>{const t=l.trim();return !(t.startsWith('/'+'*')||t.startsWith('*')||t.startsWith('//'));}).join(NL);\n  let out = '', i = 0;\n  while (i < text.length) {",
    predict: [5] },
  { name: 'split on LF only, leaving carriage returns on every line',
    from: "lines: text.split(new RegExp(CR + '?' + NL))",
    to:   "lines: text.split(NL)",
    predict: [1,2,3,6,7] },
  { name: 'inFunction accepts the first of two identical signatures',
    from: "  if (starts.length !== 1)",
    to:   "  if (starts.length === 0)",
    predict: [4] },
];

const restore = () => {
  fs.writeFileSync(KIT, BASE);
  const h = cp.execSync('git hash-object ' + KIT, { cwd: '.' }).toString().trim();
  if (h !== baseHash) throw new Error('RESTORE FAILED: ' + h + ' != ' + baseHash);
};

const run = () => {
  /* JSON, not the line reporter. The line reporter prints a progress line for
     EVERY test, and a regex over its output matched those rather than the
     failures - so all four mutants read as killing all seven tests. An
     impossible result indicts the instrument, not the code. */
  let out;
  try { out = cp.execSync("npx playwright test tests/patchkit.spec.js --reporter=json 2>nul",
    { cwd: ".", encoding: "utf8", maxBuffer: 64*1024*1024 }); }
  catch (e) { out = e.stdout || ""; }
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const red = [];
  const walk = (suites) => { for (const s of suites||[]) {
    for (const sp of s.specs||[]) if (!sp.ok) {
      const t = sp.title;
      if (/refused, not guessed/.test(t)) red.push(1);
      else if (/scoping to a function/.test(t)) red.push(2);
      else if (/neighbour anchor and a function scope/.test(t)) red.push(3);
      else if (/signature that appears twice/.test(t)) red.push(4);
      else if (/stripped by delimiter/.test(t)) red.push(5);
      else if (/CRLF and splitting/.test(t)) red.push(6);
      else if (/run is found by its two ends/.test(t)) red.push(7);
      else if (/splits without carrying carriage returns/.test(t)) red.push(8);
      else throw new Error("unrecognised failing test: " + t);
    }
    walk(s.suites); } };
  walk(j.suites);
  /* A run that reported no tests at all is an instrument failure, not a pass. */
  let total = 0; const count = (su) => { for (const s of su||[]) { total += (s.specs||[]).length; count(s.suites); } };
  count(j.suites);
  if (total !== 8) throw new Error("expected 8 tests, the run reported " + total);
  return [...new Set(red)].sort((a,b)=>a-b);
};

let bad = 0;
for (const m of MUTANTS) {
  restore();
  const src = fs.readFileSync(KIT, 'utf8');
  if (src.indexOf(m.from) < 0) { console.log('SKIP (anchor absent) ' + m.name); bad++; continue; }
  const mutated = src.replace(m.from, m.to);
  if (mutated === src) { console.log('SKIP (no-op) ' + m.name); bad++; continue; }
  fs.writeFileSync(KIT, mutated);
  const after = cp.execSync('git hash-object ' + KIT).toString().trim();
  if (after === baseHash) { console.log('SKIP (unchanged on disk) ' + m.name); bad++; continue; }
  const got = run();
  const ok = JSON.stringify(got) === JSON.stringify(m.predict);
  if (!ok) bad++;
  console.log((ok ? 'KILLED  ' : 'MISMATCH') + '  ' + m.name);
  console.log('          predicted red ' + JSON.stringify(m.predict) + ', got ' + JSON.stringify(got));
}
restore();
console.log('\nrestored, hash matches baseline');
process.exitCode = bad ? 1 : 0;
