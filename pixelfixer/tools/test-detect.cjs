/* Does the JavaScript detector answer what the Python one answers?

   The detected GRID is the whole of what this tab does: cols and rows are
   the size the art is rebuilt at, and a wrong grid is the one failure a
   person would see. So this compares those, on every fixture and every
   example image, against the reference run in the same mode - not a
   tolerance on some intermediate array, the answer itself.

   It exists in particular to answer the question pf-05-mathshim.js leaves
   open: PF.exp and PF.log are the platform's rather than numpy's, and this
   is where "does that move any answer" is measured rather than argued. */
const fs = require('fs'), path = require('path');
const { PF } = require('./load.cjs');
const dir = path.join(__dirname, '..', 'fixtures');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'raw', 'meta.json'), 'utf8'));
const want = JSON.parse(fs.readFileSync(path.join(dir, 'detect-fast.json'), 'utf8'));

let pass = 0, fail = 0;
console.log('image        js grid    py grid    js consensus       py consensus       step drift   secs');
for (const name of Object.keys(want)) {
  const { w, h } = meta[name];
  const d = new Uint8Array(fs.readFileSync(path.join(dir, 'raw', name + '.rgba')));
  const t0 = Date.now();
  let r;
  try { r = PF.core.detect({ d, w, h, cn: 4 }, 'fast'); }
  catch (e) { console.log(name.padEnd(12) + 'THREW ' + String(e.message).slice(0, 90)); fail++; continue; }
  const secs = (Date.now() - t0) / 1000;
  const p = want[name];
  const sizeOk = r.cols === p.cols && r.rows === p.rows;
  const consOk = r.consensus === p.consensus;
  const drift = Math.max(Math.abs(r.step_x - p.step_x), Math.abs(r.step_y - p.step_y));
  console.log(name.padEnd(12)
    + (r.cols + 'x' + r.rows).padEnd(11) + (p.cols + 'x' + p.rows).padEnd(11)
    + String(r.consensus).padEnd(19) + String(p.consensus).padEnd(19)
    + drift.toExponential(2).padEnd(13) + secs.toFixed(2)
    + (sizeOk && consOk ? '' : '   <-- ' + (sizeOk ? '' : 'SIZE ') + (consOk ? '' : 'CONSENSUS')));
  if (sizeOk && consOk) pass++; else fail++;
}
console.log('\n' + pass + ' of ' + (pass + fail) + ' images agree with the Python reference on size and decision path');
process.exit(fail ? 1 : 0);
