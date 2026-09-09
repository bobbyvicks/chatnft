/* PF.process against pixelfixer.api.process, on the same image, in the same
   mode, with each side a fresh process.

   THE FRESHNESS IS THE POINT, and it took a wrong answer to see why. Run
   two_stage_pack twice inside ONE python process and the two results differ
   by 13,837 of 57,408 bytes - the reference's k-means goes through
   cv2.kmeans on OpenCV's process-global RNG, and quantize.py never seeds it,
   so what you get depends on how many random numbers were drawn before you.
   Measured in python, not inferred:

     1st call vs a saved earlier run   9052 bytes (15.77%), max 228, mean 4.07
     1st call vs 2nd call in-process  13837 bytes (24.10%), max 228, mean 3.57
     after a detect() vs 1st          13533 bytes (23.57%), max 228, mean 3.96

   So "byte-identical" is only a question you can ask of two runs that have
   drawn the same random numbers. Ask it that way - one image per process,
   through the same entry point, on both sides - and the answer is exact,
   which also proves the port consumes the RNG in the reference's order. Ask
   it any other way and you measure OpenCV's RNG, not this port.

   Run:  node tools/test-endtoend.js
   Needs: fixtures/fresh/<name>.rgba, written by the python side of this
   comparison (see the header of tools/parity-endtoend.py). */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(0, eval)(fs.readFileSync(path.join(root, 'pixelfixer.bundle.js'), 'utf8'));
const PF = globalThis.PF;

const meta = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/raw/meta.json'), 'utf8'));
const want = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/detect-fast.json'), 'utf8'));
const only = process.argv[2];

/* ONE IMAGE PER PROCESS, and this harness had to learn that the hard way:
   its first version looped over all seven in one node process and reported
   three failures - small, mid and lighthouse - for exactly the reason its
   own header gives. Only the first image in a process has drawn the same
   random numbers as a fresh python run. So without an argument this forks
   itself once per image; with one it does that image and nothing else. */
if (!only) {
  const { spawnSync } = require('child_process');
  let bad = 0;
  for (const name of Object.keys(want)) {
    const r = spawnSync(process.execPath, [__filename, name], { encoding: 'utf8' });
    process.stdout.write(r.stdout.split('\n').filter(l => /^(ok|FAIL)/.test(l)).join('\n') + '\n');
    if (r.status) bad++;
  }
  console.log(bad ? bad + ' image(s) disagree with the reference'
    : 'every image agrees with the reference');
  process.exit(bad ? 1 : 0);
}
const names = [only];

let bad = 0;
for (const name of names) {
  const { w, h } = meta[name];
  const data = new Uint8ClampedArray(fs.readFileSync(path.join(root, 'fixtures/raw', name + '.rgba')));
  const r = PF.process(data, w, h, {});
  const p = want[name];
  const sizeOk = r.cols === p.cols && r.rows === p.rows && r.consensus === p.consensus;

  /* The pixels, only where a same-call reference exists to compare with. */
  let pix = 'no fresh reference';
  const ref = path.join(root, 'fixtures/fresh', name + '.rgba');
  if (fs.existsSync(ref)) {
    const py = new Uint8Array(fs.readFileSync(ref));
    if (py.length !== r.data.length) pix = 'SIZE ' + r.data.length + ' vs ' + py.length;
    else {
      let n = 0, max = 0;
      for (let i = 0; i < py.length; i++) { const e = Math.abs(r.data[i] - py[i]); if (e) { n++; if (e > max) max = e; } }
      pix = n ? ('DIFFER ' + n + ' bytes, max ' + max) : 'identical';
    }
  }
  const ok = sizeOk && (pix === 'identical' || pix === 'no fresh reference');
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(12)
    + (r.cols + 'x' + r.rows).padEnd(10) + r.consensus.padEnd(19) + r.confidence.padEnd(8)
    + 'pixels: ' + pix.padEnd(22)
    + r.detectMs + 'ms detect, ' + r.reconMs + 'ms rebuild');
}
console.log(bad ? '\n' + bad + ' image(s) disagree with the reference' : '\nevery image agrees with the reference');
process.exit(bad ? 1 : 0);
