/* A LINE THAT COMPUTES A NUMBER AND A LINE THAT DISCARDS IT.

   patch398 left this in fixGridCanvas:

     const side=on?CANVAS_SIDE:r.width;
     ...
     void side;

   `side` is never read. The width and the height are worked out again on the
   next line, so the variable is a leftover from a version that used it, and
   `void side` is the thing that stopped a linter complaining about the
   leftover rather than the leftover being removed.

   That matters more than its two lines. Anyone reading fixGridCanvas to check
   what a save does now has to work out whether `side` is load-bearing, decide
   it is not, and wonder what it was for - and the honest answer is nothing.
   Both lines go; the two that do the work are untouched. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const r = kit.inFunction(L, 'function fixGridCanvas(r){');
const decl = kit.only(L, l => l === '  const side=on?CANVAS_SIDE:r.width;', 'the unused width', r);
const use = kit.only(L, l => l === '  void side;', 'the line that discards it', r);
/* NOTHING ELSE MAY READ IT, or removing it is a change and not a tidy. */
for (let i = r.start; i <= r.end; i++) {
  if (i === decl || i === use) continue;
  if (/\bside\b/.test(L[i]))
    throw new Error('side is read at line ' + (i + 1) + ': ' + L[i].trim());
}
kit.replace(L, { start: use, end: use }, []);
kit.replace(L, { start: decl, end: decl }, []);

const bytes = kit.save(doc, ({ codeLines }) => {
  const f = kit.inFunction(codeLines, 'function fixGridCanvas(r){');
  const body = codeLines.slice(f.start, f.end + 1).join('\n');
  if (/\bside\b/.test(body)) throw new Error('the unused width is still there');
  /* AND THE TWO THAT DO THE WORK ARE UNTOUCHED. */
  if (!/c\.width=on\?CANVAS_SIDE:r\.width; c\.height=on\?CANVAS_SIDE:r\.height;/.test(body))
    throw new Error('the canvas is no longer sized by the switch');
  if (!/g\.imageSmoothingEnabled=false;/.test(body))
    throw new Error('the resize is no longer nearest neighbour');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
