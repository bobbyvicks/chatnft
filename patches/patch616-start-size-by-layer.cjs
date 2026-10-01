/* patch616: THE PIXEL SIZE BOX STARTS AT 8 FOR BACKGROUNDS, CHAINS, MOUTHS AND EYES.

   The owner, 2026-10-01, shown that 79 of the 311 traits lose their detail at
   16 and keep it at 8 (all the chains, chest lettering, faces, small logos and
   whole-scene backgrounds; scratchpad/fix8/audit/REPORT.txt), chose "8 for
   those layers, 16 for the rest". Earlier rulings stand: one visible number
   anybody can change ("i shouldnt need rules tho if i want to chang it to 2x2
   i should be able too"), and 0 still works it out.

   HOW. The box shows the START SIZE of the picture's layer when a picture is
   opened: 8 for backgrounds, chains, mouth and eyes, 16 otherwise (a picture
   with no layer in its path keeps 16). A number somebody CHOSE wins for every
   picture after it: chosen means typed into the box (its input event), set by
   PB.fix, or set by anything else to a value other than the one the page
   itself last put there. A folder run gives each file its own layer's start
   size unless a number was chosen, and says how many started at each.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;

const doc = s0.start([['function fixSizeSet(){', 'fixSizeSet is not in this page'],
  ['function fixStepFor(w,data,h){', 'fixStepFor is not in this page']]);
if (require('fs').readFileSync(s0.FILE, 'utf8').indexOf('function fixStartSize(') >= 0) throw new Error('patch616 is already applied');

/* 1. the start sizes and what counts as chosen, beside fixSizeSet */
doc.swap('function fixSizeSet(){ const f=$("fixforce"); return (+(f&&f.value)||0)>0; }',
  ['function fixSizeSet(){ const f=$("fixforce"); return (+(f&&f.value)||0)>0; }',
   '/* THE START SIZE FOLLOWS THE LAYER (patch616). The owner, shown that 79 of',
   '   311 traits lose their detail at 16 and keep it at 8 - all the chains,',
   '   chest lettering, faces, small logos and whole-scene backgrounds - chose',
   '   "8 for those layers, 16 for the rest". The box shows the start size of',
   '   the picture\'s layer when it is opened; a number somebody CHOSE wins for',
   '   every picture after it. Chosen: typed (the input event), set by PB.fix,',
   '   or set by anything else to a value other than the one the page last put',
   '   there. A picture with no layer in its path starts at 16. */',
   'const FIX_START_SIZE=16;',
   'const FIX_START_AT_8=["backgrounds","chains","mouth","eyes"];',
   'let fixSizeAuto=String(FIX_START_SIZE);',
   'let fixSizeTyped=false;',
   'let fixStartAt8=0, fixStartAt16=0;',
   'function fixStartSize(rel){ return FIX_START_AT_8.indexOf(fixLayerOf(rel))>=0 ? 8 : FIX_START_SIZE; }',
   'function fixSizeChosen(){ const f=$("fixforce"); return fixSizeTyped || !!(f && f.value!==fixSizeAuto); }',
   'function fixSizeStart(rel){',
   '  const f=$("fixforce"); if(!f || fixSizeChosen()) return;',
   '  const v=String(fixStartSize(rel)); f.value=v; fixSizeAuto=v;',
   '}',
   '/* The number a folder run uses for one file: the chosen one, or that file\'s start size. */',
   'function fixSizeForFile(rel){',
   '  if(fixSizeChosen()) return +$("fixforce").value||0;',
   '  const s=fixStartSize(rel); if(s===8) fixStartAt8++; else fixStartAt16++;',
   '  return s;',
   '}']);

/* 2. fixStepFor takes the file's path when a folder run asks */
doc.swap('function fixStepFor(w,data,h){', 'function fixStepFor(w,data,h,rel){');
doc.swap('  const asked=+$("fixforce").value||0;' + NL + '  const onGrid=$("fixgrid")&&$("fixgrid").checked;',
  ['  /* A folder run passes each file\'s path, and that file\'s start size is the',
   '     size unless one was chosen (patch616); a single picture\'s start size is',
   '     already in the box, put there when it was opened. */',
   '  const asked=rel!=null ? fixSizeForFile(rel) : (+$("fixforce").value||0);',
   '  const onGrid=$("fixgrid")&&$("fixgrid").checked;']);

/* 3. opening a picture shows its start size */
doc.swap(['     nothing read it. See patch413. */',
  '  fixModeUI();',
  '  fixSizeHint();',
  '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");'],
 ['     nothing read it. See patch413. */',
  '  fixSizeStart(FIX.rel);',
  '  fixModeUI();',
  '  fixSizeHint();',
  '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");']);

/* 4. typing chooses; PB.fix chooses */
doc.swap('  $("fixforce").addEventListener("input",()=>{ fixModeUI(); fixSizeHint(); });',
  '  $("fixforce").addEventListener("input",()=>{ fixSizeTyped=true; fixModeUI(); fixSizeHint(); });');
doc.swap('  if(o.forceStep!=null) $("fixforce").value=o.forceStep;',
  '  if(o.forceStep!=null){ $("fixforce").value=o.forceStep; fixSizeTyped=true; }');

/* 5. the folder run: each file's path to fixStepFor, the counts reset, and said */
doc.swap('          mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh);',
  '          mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh,rel);');
doc.swap('  fixOutlined=0; fixOutlineCells=0;' + NL + '  /* Pictures reduced by a whole factor to get under the engine limit. */',
  ['  fixOutlined=0; fixOutlineCells=0;',
   '  fixStartAt8=0; fixStartAt16=0;',
   '  /* Pictures reduced by a whole factor to get under the engine limit. */']);
doc.swap('+(fixOutlined?" \\u00b7 "+fixOutlined+" outline"+(fixOutlined===1?"":"s")+" made one cell thick":"")+gateNote+pastNote',
  '+(fixOutlined?" \\u00b7 "+fixOutlined+" outline"+(fixOutlined===1?"":"s")+" made one cell thick":"")+gateNote+pastNote'
  + NL + '    /* WHICH START SIZE EACH FILE GOT, when nobody chose one (patch616). */'
  + NL + '    +(fixStartAt8&&fixStartAt16 ? " \\u00b7 started at 8 for "+fixStartAt8+" (backgrounds, chains, mouths, eyes) and at 16 for "+fixStartAt16'
  + NL + '      : fixStartAt8 ? " \\u00b7 started at 8 (backgrounds, chains, mouths, eyes)" : "")');

/* 6. the box's own words */
doc.swap('title="The pixel size of the result, in whole numbers. It starts at 16.',
  'title="The pixel size of the result, in whole numbers. It starts at 8 for backgrounds, chains, mouths and eyes and at 16 for everything else; a number you type is used for every picture until you reload.');

doc.finish(({ must }) => {
  must('function fixStartSize(rel){', 'fixStartSize');
  must('fixSizeStart(FIX.rel);', 'fixLoad shows the start size');
  must('const s=fixStepFor(sw,px,sh,rel);', 'the folder run passes the path');
  must('fixSizeTyped=true; fixModeUI(); fixSizeHint();', 'typing chooses');
});
