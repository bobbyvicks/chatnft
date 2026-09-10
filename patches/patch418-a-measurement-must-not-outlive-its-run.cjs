/* A MEASUREMENT FROM THE LAST RUN WAS STILL LABELLING THE NEXT ONE.

   patch417 sets fixMeasuredBlock where the measured block wins, and nothing
   ever clears it. So: run a picture with a grid (measured, flag set to 3),
   then turn the snap off and type a size - the second run never touches the
   flag, and fixStampMeasured reads the 3 left behind and reports the typed
   answer as "measured 3px blocks off the picture".

   Found by a test that types a size after a measured run, which is the exact
   order somebody uses when the measured answer was not what they wanted.

   The flag describes ONE decision, so it is cleared at the top of the function
   that makes that decision - not at the start of a run, which is a different
   place that would have to remember to do it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = kit.only(L, l => l === 'function fixStepFor(w,data,h){', 'the step decider');
kit.replace(L, { start: at, end: at }, [
  'function fixStepFor(w,data,h){',
  '  /* THIS DECISION, NOT THE LAST ONE. The flag says the step about to be',
  '     returned was measured off the picture; left over from a previous run it',
  '     puts that label on an answer that was typed. */',
  '  fixMeasuredBlock=0;',
]);

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* codeLines is comment-stripped, so the reason is checked against the file
     and the order against the code. */
  if (text.indexOf('THIS DECISION, NOT THE LAST ONE') < 0)
    throw new Error('the clear went in without saying why');
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  const body = codeLines.slice(sf.start, sf.end + 1);
  const clear = body.findIndex(l => l.trim() === 'fixMeasuredBlock=0;');
  const snap = body.findIndex(l => l.indexOf('if(fixSnapping()){') >= 0);
  const set = body.findIndex(l => l.indexOf('fixMeasuredBlock=nat;') >= 0);
  if (clear < 0) throw new Error('the flag is not cleared at all');
  /* BEFORE ANYTHING CAN SET IT, or the clear wipes the answer it just made. */
  if (!(clear < snap && clear < set))
    throw new Error('the flag is cleared after the decision that sets it');
  /* And it is still SET where the measurement wins, or clearing is all this does. */
  if (set < 0) throw new Error('the measured step stopped being recorded');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
