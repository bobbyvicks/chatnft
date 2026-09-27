/* Negative control for --decode: each one-token mutant of decode-png.cjs must
   make at least one image's sha256 differ from PIL's; the unmutated source,
   through the same path, must match all of them. Loads the source text with
   the substitution applied in memory; the file is never touched.
   node tools/oracle/decode-mutants.cjs [N images, default 60] */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), Module = require('module');
const srcPath = path.join(__dirname, 'decode-png.cjs');
const SRC = fs.readFileSync(srcPath, 'utf8');
const want = fs.readFileSync(path.join(__dirname, 'py-decode-hash.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const N = +(process.argv[2] || 60);
const imgs = want.slice(0, N).map(w => ({ w, buf: fs.readFileSync(w.path) }));
const mutants = [
  ['(unmutated)', null, null],
  ['average filter rounds up', '((a + b) >> 1)', '((a + b + 1) >> 1)'],
  ['paeth picks a over b', 'pb <= pc ? b : c', 'pb <= pc ? a : c'],
  ['RGB alpha 254', 'd[4 * p + 2] = px[q + 2]; d[4 * p + 3] = 255;', 'd[4 * p + 2] = px[q + 2]; d[4 * p + 3] = 254;'],
  /* Recorded, not required: 'pa <= pb' -> 'pa < pb' (a Paeth tie between a
     and b broken towards b) changed 0 of 360 images when tried - a tie with
     a != b never occurs in this population, so that mutant cannot be killed
     here. It is left out rather than kept as a survivor that always fails. */
];
let bad = 0;
for (const [name, from, to] of mutants) {
  let src = SRC;
  if (from) { if (src.split(from).length !== 2) throw new Error('mutant site not unique: ' + from); src = src.replace(from, to); }
  const m = new Module(srcPath); m.filename = srcPath; m.paths = module.paths; m._compile(src, srcPath);
  let differ = 0;
  for (const { w, buf } of imgs) {
    const d = m.exports.decodePNG(buf);
    if (crypto.createHash('sha256').update(d.d).digest('hex') !== w.sha256) differ++;
  }
  const ok = from ? differ > 0 : differ === 0;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(28) + differ + ' of ' + imgs.length + ' images differ from PIL' + (from ? ' (must be > 0)' : ' (must be 0)'));
}
process.exit(bad ? 1 : 0);
