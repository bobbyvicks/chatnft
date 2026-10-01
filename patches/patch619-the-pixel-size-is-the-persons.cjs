/* patch619: THE PIXEL SIZE BOX IS THE PERSON'S - NO START SIZE BY LAYER.

   patch616 (earlier the same day) made the box show 8 when a background,
   chain, mouth or eyes picture was opened and gave each file of a folder run
   its own layer's start size. The owner, 2026-10-01: "i dont want specific
   rules for certain traits, i just want it to function so that those rules
   dont need to be in place"; asked how the size should be chosen, "the user
   gets to chose always". So the box starts at 16, as it did from 2026-09-27
   ("id rather default be 16 now pls"), and only the person changes it; a
   folder run uses the box for every file. patch616's code comes out; its
   reasoning stays, superseded, where the code was.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const page = fs.readFileSync(s0.FILE, 'utf8');
if (page.indexOf('function fixStartSize(') < 0) throw new Error('patch616 is not applied (or patch619 already is)');
const doc = s0.start([['function fixSizeSet(){', 'fixSizeSet is not in this page']]);

/* 1. the start-size block -> its reasoning, superseded */
{
  const a = page.indexOf('/* THE START SIZE FOLLOWS THE LAYER (patch616).');
  const e = page.indexOf('function fixSnapping(){', a);
  if (a < 0 || e < 0) throw new Error('the patch616 block is not where it was');
  doc.swap(page.slice(a, e), ['/* SUPERSEDED (patch619, 2026-10-01). patch616 made the box start at 8 for',
    '   backgrounds, chains, mouths and eyes and at 16 for the rest, and gave each',
    '   file of a folder run its own layer\'s start size - chosen by the owner after',
    '   the all-traits audit found 79 of 311 traits lose detail at 16. The same',
    '   day: "i dont want specific rules for certain traits" and, asked how the',
    '   size should be chosen, "the user gets to chose always". The box starts at',
    '   16 and only the person changes it; a folder run uses it for every file. */',
    ''].join(NL));
}
/* 2. fixStepFor reads the box again */
doc.swap('function fixStepFor(w,data,h,rel){', 'function fixStepFor(w,data,h){');
doc.swap(['  /* A folder run passes each file\'s path, and that file\'s start size is the',
  '     size unless one was chosen (patch616); a single picture\'s start size is',
  '     already in the box, put there when it was opened. */',
  '  const asked=rel!=null ? fixSizeForFile(rel) : (+$("fixforce").value||0);'],
  '  const asked=+$("fixforce").value||0;');
/* 3. opening a picture leaves the box alone */
doc.swap('  fixSizeStart(FIX.rel);' + NL, '');
/* 4. typing and PB.fix as they were */
doc.swap('  $("fixforce").addEventListener("input",()=>{ fixSizeTyped=true; fixModeUI(); fixSizeHint(); });',
  '  $("fixforce").addEventListener("input",()=>{ fixModeUI(); fixSizeHint(); });');
doc.swap('  if(o.forceStep!=null){ $("fixforce").value=o.forceStep; fixSizeTyped=true; }',
  '  if(o.forceStep!=null) $("fixforce").value=o.forceStep;');
/* 5. the folder run */
doc.swap('          mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh,rel);',
  '          mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);');
doc.swap('  fixStartAt8=0; fixStartAt16=0;' + NL, '');
{
  const a = page.indexOf('    /* WHICH START SIZE EACH FILE GOT, when nobody chose one (patch616). */');
  const e = page.indexOf('(backgrounds, chains, mouths, eyes)" : "")', a);
  if (a < 0 || e < 0) throw new Error('the folder note is not where it was');
  doc.swap(page.slice(a - NL.length, e + '(backgrounds, chains, mouths, eyes)" : "")'.length), '');
}
/* 6. the box's words */
doc.swap('title="The pixel size of the result, in whole numbers. It starts at 8 for backgrounds, chains, mouths and eyes and at 16 for everything else; a number you type is used for every picture until you reload.',
  'title="The pixel size of the result, in whole numbers. It starts at 16 and only you change it; the number is used for every picture.');

doc.finish(({ code }) => {
  for (const gone of ['fixStartSize', 'fixSizeStart', 'fixSizeForFile', 'fixSizeChosen', 'fixSizeTyped', 'fixStartAt8', 'FIX_START_AT_8'])
    if (new RegExp('\\b' + gone + '\\b').test(code)) throw new Error('still referenced: ' + gone);
});
