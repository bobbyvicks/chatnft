/* THE BATCH TOOK A PICTURE THE SINGLE TAB REFUSED.

   patch419 gave the folder path a whole-factor reduction so a 2048 trait
   goes through instead of bouncing off the engine's limit. It changed only
   fixBatch. So dropping the same file on the single image tab still said
   "Too big - 4.2 megapixels, and the limit is 4" - the same picture, the
   same page, two answers, and no way to tell which one is the real rule.

   The reduction was already written and already measured; this is the same
   call in the other place, with the same note so the reduction is not silent
   there either. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const X = String.fromCharCode(92) + 'u00d7';

const load = kit.inFunction(L, 'async function fixLoad(file){');
const at = kit.only(L, l => l.indexOf('  if(W*H>FIX_MAX_PIXELS){ fixSay("Too big - "') === 0,
  'the single-image size refusal', load);
kit.replace(L, { start: at, end: at }, [
  '  /* PAST THE PAGE OWN CEILING is a refusal. Between that and the engine',
  '     limit the picture is reduced by a whole factor, the same as a folder',
  '     full of them - one page, one rule. */',
  '  if(W>MAX_SIDE||H>MAX_SIDE){',
  '    fixSay("Too big - "+W+"' + X + '"+H+", and the limit is "+MAX_SIDE+" a side.");',
  '    return false;',
  '  }',
]);

/* The reduction happens where the pixels are taken. */
const src = kit.only(L, l => l === '  FIX.src={data:g.getImageData(0,0,W,H).data, width:W, height:H};',
  'where the single tab takes its pixels', kit.inFunction(L, 'async function fixLoad(file){'));
kit.replace(L, { start: src, end: src }, [
  '  let sd=g.getImageData(0,0,W,H).data, sw=W, sh=H, shrank=null;',
  '  const small=fixShrinkToFit(sd,W,H);',
  '  if(small){ sd=small.data; sw=small.width; sh=small.height; shrank=small.factor; }',
  '  else if(W*H>FIX_MAX_PIXELS){',
  '    c.width=1; c.height=1;',
  '    fixSay("Too big - "+(W*H/1e6).toFixed(1)+" megapixels against a limit of "',
  '      +(FIX_MAX_PIXELS/1e6)+", and no whole factor brings it under. Resize it to "',
  '      +CANVAS_SIDE+" first.");',
  '    return false;',
  '  }',
  '  FIX.src={data:sd, width:sw, height:sh};',
]);

/* And it says so, on the caption that names the size it came in at. */
const cap = kit.only(L, l => l === '  $("fixbeforecap").textContent=FIX.name+" \\u00b7 "+W+"\\u00d7"+H+" as it came in";',
  'the before caption', kit.inFunction(L, 'async function fixLoad(file){'));
kit.replace(L, { start: cap, end: cap }, [
  '  $("fixbeforecap").textContent=FIX.name+" \\u00b7 "+W+"\\u00d7"+H+" as it came in"',
  '    +(shrank?" \\u00b7 reduced "+shrank+"\\u00d7 to "+sw+"\\u00d7"+sh',
  '      +", which is what the engine will take":"");',
]);

const bytes = kit.save(doc, ({ codeLines }) => {
  const fn = kit.inFunction(codeLines, 'async function fixLoad(file){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');
  /* THE SAME REDUCTION, not a second one written slightly differently. */
  if (!/const small=fixShrinkToFit\(sd,W,H\);/.test(body))
    throw new Error('the single tab does not use the reduction the batch uses');
  /* AND THE ENGINE IS TOLD THE REDUCED SIZE. Handing it 2048 pixels labelled
     1024 is the bug this shape invites. */
  if (!/FIX\.src=\{data:sd, width:sw, height:sh\};/.test(body))
    throw new Error('the source is recorded at the size it used to be');
  /* The old blanket refusal is gone and the ceiling one is there. */
  if (/if\(W\*H>FIX_MAX_PIXELS\)\{ fixSay\("Too big - "/.test(body))
    throw new Error('the picture is still refused before it can be reduced');
  if (!/if\(W>MAX_SIDE\|\|H>MAX_SIDE\)\{/.test(body))
    throw new Error('the page ceiling stopped being enforced at all');
  /* And a picture that cannot be reduced is still refused, saying what to do. */
  if (!/no whole factor brings it under/.test(body))
    throw new Error('an oversized picture with no factor is silently accepted');
  /* And the person is told, or a reduction nobody asked for is invisible. */
  if (!/shrank\?" \\u00b7 reduced "/.test(body))
    throw new Error('the reduction is silent on the single tab');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
