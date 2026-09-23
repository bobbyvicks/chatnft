/* A TRAIT REOPENED FROM ITS DRAFT KEEPS THE SIZE IT OPENED AT.

   Found 2026-09-22 by the discovery pass, ranked tenth of 39, reproduced
   by a finder and two verifiers. openWide is the floor that keeps a shrink
   a change to the artwork rather than to the file: the recorded 640-for-
   1280 defect is what it prevents. startEditor is its only writer, and it
   is given the dimensions of whatever it opens. When openTraitRecord opens
   a trait through its draft, that is the draft's canvas - after a shrink,
   160 - so the floor became 160, the saved 1280 file was written at
   160x160, and the only thing said was "Saved". Two routes: open another
   trait and come back, or autosave and reload. The off-grid warning
   cannot fire, because 160 on a 160 grid fits.

   The size a trait opened at is the saved record's, whichever pixels the
   canvas shows. After startEditor, a trait opened from its draft takes its
   floor from the record. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const fnR = () => kit.inFunction(L, 'async function openTraitRecord(t,opts){');

swap('  startEditor(d.data,src.w,src.h,src.w,src.h,palette(d.data,src.w*src.h,24,64),false);', [
  '  startEditor(d.data,src.w,src.h,src.w,src.h,palette(d.data,src.w*src.h,24,64),false);',
  '  /* THE SIZE IT OPENED AT IS THE RECORD\'S. startEditor took the draft\'s',
  '     canvas size for it, and after a shrink that removed the floor: a',
  '     1280 trait reopened through its draft was saved at 160x160, said',
  '     only "Saved" (measured, two routes - another trait and back, or an',
  '     autosave and a reload). */',
  '  if(draft) openWide=t.w;',
], 'the draft open', fnR());

const grew = kit.save(doc, ({ code }) => {
  const a = code.indexOf('async function openTraitRecord(t,opts){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  const s = body.indexOf('startEditor('), f = body.indexOf('if(draft) openWide=t.w;');
  if (!(s >= 0 && f > s)) throw new Error('the floor is not set after startEditor');
});

fs.renameSync(TMP, FILE);
console.log('patch538 written, ' + grew + ' bytes');
