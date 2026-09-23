/* AN IMPORTED PROJECT KEEPS ITS EDIT TIMES.

   Found 2026-09-22 by the discovery pass, ranked thirty-fifth of 39. Export
   project writes each trait's edit time; Import built every record with
   at:Date.now() and never read it. Measured by the verifier: 311 of 311
   edit times in the file, 0 of 311 kept after importing it, so every
   "last edited" strip on the final page read "just now" and the Last edited
   list became ten arbitrary traits. The cloud pull already keeps the
   server's time, and says why: a download is not an edit. Nor is a restore.

   The file's time is used when it is a number; a file without one - older
   than the field - gets the moment of import, as before. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const fn = kit.inFunction(L, 'async function importProject(file){');
  const i = kit.only(L, l => l === '      w:it.w||0, h:it.h||0, blob:blob, at:Date.now()};', 'the record', fn);
  kit.replace(L, { start: i, end: i }, [
    '      /* The time it was last edited, from the file. A restore is not an',
    '         edit, any more than a download is. */',
    '      w:it.w||0, h:it.h||0, blob:blob, at:(typeof it.at==="number" && isFinite(it.at)) ? it.at : Date.now()};',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  if (code.split('typeof it.at==="number"').length - 1 !== 1) throw new Error('the kept time is not there');
});

fs.renameSync(TMP, FILE);
console.log('patch561 written, ' + grew + ' bytes');
