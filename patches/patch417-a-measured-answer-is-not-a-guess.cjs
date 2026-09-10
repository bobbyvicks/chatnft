/* A MEASURED PIXEL SIZE CAME BACK LABELLED LESS CERTAIN THAN A GUESSED ONE.

   patch416 measures the picture's own block size and hands it to the engine as
   a forced step. The engine reports "forced", which the readout turns into
   medium confidence - so a 3x fake that used to come back "high confidence"
   now says medium, and the advice that fires on anything below high starts
   offering to try other sizes on an answer that is exact.

   That is backwards. fixNativeBlock does not guess: it returns N only when
   every NxN square of the source really is one colour, so the answer is not
   confident, it is CERTAIN - there is nothing left to be unsure about.

   So a result whose step came from the measurement is stamped as measured, and
   the readout says which of the two happened. The engine's own confidence is
   untouched everywhere it still decides. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- remember that the step was measured --------------------------- */
{
  const at = kit.only(L, l => l === 'let fixNoGrid=0;', 'the gridless counter');
  kit.replace(L, { start: at, end: at }, [
    'let fixNoGrid=0;',
    '/* The block size the last step decision measured off the picture, or 0 if',
    '   it did not measure one. Read by the run that follows, so an exact answer',
    '   is not reported as a guess. */',
    'let fixMeasuredBlock=0;',
  ]);
  const r = kit.inFunction(L, 'function fixStepFor(w,data,h){');
  const nat = kit.only(L, l => l === '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0) return nat;',
    'where the measured block wins', r);
  kit.replace(L, { start: nat, end: nat }, [
    '    if(nat>1&&w>0&&CANVAS_SIDE%(w/nat)===0){ fixMeasuredBlock=nat; return nat; }',
  ]);
}

/* ---- and stamp the result it produced ------------------------------ */
{
  const at = kit.only(L, l => l === 'function fixShow(r){', 'where a result is shown');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* AN EXACT ANSWER SAYS SO. The engine reports "forced" for any step it was',
    '   given, which the readout reads as less certain - and a measured block is',
    '   the one answer that cannot be wrong. Stamped on the result rather than',
    '   worked out again at each place that reads it. */',
    'function fixStampMeasured(r){',
    '  if(!r||!fixMeasuredBlock) return r;',
    '  r.confidence="high"; r.consensus="measured"; r.measuredBlock=fixMeasuredBlock;',
    '  return r;',
    '}',
  ]);
  const r = kit.inFunction(L, 'function fixRun(){');
  const done = kit.only(L, l => l === '        const r=m.done; fixShow(r);', 'where the run takes its result', r);
  kit.replace(L, { start: done, end: done }, [
    '        const r=fixStampMeasured(m.done); fixShow(r);',
  ]);
}

/* ---- and the readout names which of the two it was ----------------- */
{
  const r = kit.inFunction(L, 'function fixRun(){');
  const say = kit.only(L, l => l.indexOf('        fixSay((r.confidence||"")+" confidence ("+(r.consensus||"?")+")') === 0,
    'what the run says', r);
  kit.replace(L, { start: say, end: say }, [
    '        fixSay((r.consensus==="measured"',
    '          ? "measured "+r.measuredBlock+"px blocks off the picture"',
    '          : (r.confidence||"")+" confidence ("+(r.consensus||"?")+")")+" \\u00b7 "+secs+"s"',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE FLAG IS SET WHERE THE MEASUREMENT WINS, and nowhere else. */
  const sf = kit.inFunction(codeLines, 'function fixStepFor(w,data,h){');
  const sb = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/\{ fixMeasuredBlock=nat; return nat; \}/.test(sb))
    throw new Error('a measured step is not recorded as measured');
  if ((sb.match(/fixMeasuredBlock=/g) || []).length !== 1)
    throw new Error('the measured flag is set in more than one place');

  /* AND A STAMPED RESULT IS CERTAIN, not merely forced. */
  const st = kit.inFunction(codeLines, 'function fixStampMeasured(r){');
  const stb = codeLines.slice(st.start, st.end + 1).join('\n');
  if (!/if\(!r\|\|!fixMeasuredBlock\) return r;/.test(stb))
    throw new Error('a result is stamped even when nothing was measured');
  if (!/r\.confidence="high"; r\.consensus="measured";/.test(stb))
    throw new Error('a measured answer is still reported as a guess');

  /* The run uses it. */
  const rn = kit.inFunction(codeLines, 'function fixRun(){');
  const rb = codeLines.slice(rn.start, rn.end + 1).join('\n');
  if (!/const r=fixStampMeasured\(m\.done\); fixShow\(r\);/.test(rb))
    throw new Error('the run does not stamp its result');
  if (!/measured "\+r\.measuredBlock\+"px blocks off the picture"/.test(rb))
    throw new Error('the readout does not say the answer was measured');
  /* And the engine's own words survive where it still decides. */
  if (!/\(r\.confidence\|\|""\)\+" confidence \("\+\(r\.consensus\|\|"\?"\)\+"\)"/.test(rb))
    throw new Error('a detected answer lost its confidence');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
