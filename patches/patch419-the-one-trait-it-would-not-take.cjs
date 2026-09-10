/* ONE OF THE 319 APPROVED TRAITS WOULD NOT GO THROUGH AT ALL.

   "troubleshoot the fixer so it works 100% of the time"

   Measured, whole set, batch path: 318 through, one refused -
   extras/Harambe Ghost, 2048x2048, "outside what this can take".

   2048 square is 4,194,304 pixels and the limit is 4,000,000. That limit is
   not mine to move: PF.MAX_PIXELS is api.py's cap, transcribed, and the
   engine enforces it again itself - raising the page's copy only changed
   which of the two said no, which I tried first and it did nothing but
   reword the refusal.

   So the picture is brought UNDER the limit instead, by the same reduction
   the fixer already does: a whole-number factor, every source pixel in
   exactly one block, the block taking its majority colour. A whole factor
   keeps pixel boundaries where they already were - 2048 halves to 1024, and
   art drawn in 16px blocks becomes 16px blocks at 8, with nothing moved. It
   is not a resample; there is no interpolation anywhere in it.

   The engine then sees a picture it will take, and the answer still saves at
   1280 like everything else. The run says which files were reduced first,
   because a step nobody asked for should not be silent.

   Still refused, deliberately: anything past MAX_SIDE, the ceiling the rest
   of the page draws, and anything whose factor would take a side below the
   smallest a grid can be found in. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const Q = String.fromCharCode(92) + 'u00d7';   /* an escaped multiply sign */
const MID = String.fromCharCode(92) + 'u00b7';

/* ---- the reduction ------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixNativeBlock(data,W,H){', 'the block measure');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* BRINGS A PICTURE UNDER THE ENGINE LIMIT WITHOUT RESAMPLING IT.',
    '',
    '   The smallest whole factor that divides both sides and gets the pixel',
    '   count under the cap. Whole, so every source pixel falls in exactly one',
    '   block and block edges land where pixel edges already were; the block',
    '   takes its majority colour, which is the same reduction the fix itself',
    '   does. Returns null when there is no such factor, which is a refusal,',
    '   not a silent resample. */',
    'function fixShrinkToFit(data,W,H){',
    '  if(!data||!(W>0)||!(H>0)||W*H<=FIX_MAX_PIXELS) return null;',
    '  let k=0;',
    '  for(let n=2;n<=16;n++){',
    '    if(W%n||H%n) continue;',
    '    if(W/n<FIX_MIN_SIDE||H/n<FIX_MIN_SIDE) break;',
    '    if((W/n)*(H/n)<=FIX_MAX_PIXELS){ k=n; break; }',
    '  }',
    '  if(!k) return null;',
    '  const w=W/k, h=H/k, out=new Uint8ClampedArray(w*h*4);',
    '  const seen=new Map();',
    '  for(let cy=0;cy<h;cy++) for(let cx=0;cx<w;cx++){',
    '    seen.clear();',
    '    let best=0, bestN=-1;',
    '    for(let y=cy*k;y<cy*k+k;y++) for(let x=cx*k;x<cx*k+k;x++){',
    '      const i=((y*W)+x)*4;',
    '      /* One key per colour, alpha included - a block that is half',
    '         transparent must not pick a colour nobody can see. */',
    '      const key=data[i]+","+data[i+1]+","+data[i+2]+","+data[i+3];',
    '      const n=(seen.get(key)||0)+1; seen.set(key,n);',
    '      if(n>bestN){ bestN=n; best=i; }',
    '    }',
    '    const o=((cy*w)+cx)*4;',
    '    out[o]=data[best]; out[o+1]=data[best+1];',
    '    out[o+2]=data[best+2]; out[o+3]=data[best+3];',
    '  }',
    '  return {data:out, width:w, height:h, factor:k};',
    '}',
  ]);
}

/* ---- and the batch uses it instead of refusing --------------------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '    if(Math.min(W,H)<FIX_MIN_SIDE||W*H>FIX_MAX_PIXELS){',
    'the batch size guard', bat);
  kit.replace(L, { start: at, end: at }, [
    '    /* PAST THE PAGE OWN CEILING, or too small for any grid to be found in',
    '       - those are refusals. Between that and the engine limit the picture',
    '       is reduced by a whole factor below, not turned away. */',
    '    if(Math.min(W,H)<FIX_MIN_SIDE||W>MAX_SIDE||H>MAX_SIDE){',
  ]);
  const px = kit.only(L, l => l === '    const px=g.getImageData(0,0,W,H).data;',
    'where the batch takes its pixels', kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: px, end: px }, [
    '    /* sw and sh, not w and h - w is the WORKER in this scope and fixAsk' +
    '       takes it as its first argument. */',
    '    let px=g.getImageData(0,0,W,H).data, sw=W, sh=H;',
    '    /* Over the engine limit: reduced by a whole factor first, or refused',
    '       with the number and what to do about it. */',
    '    const small=fixShrinkToFit(px,W,H);',
    '    if(small){ px=small.data; sw=small.width; sh=small.height;',
    '      shrunk.push(name+" ("+W+"' + Q + '"+H+" reduced "+small.factor+"' + Q + '"+" to fit)"); }',
    '    else if(W*H>FIX_MAX_PIXELS){',
    '      c.width=1; c.height=1;',
    '      failed.push(name+" ("+W+"' + Q + '"+H+", and no whole factor brings it under "',
    '        +(FIX_MAX_PIXELS/1e6)+" megapixels - resize it to "+CANVAS_SIDE+" first)");',
    '      continue;',
    '    }',
  ]);
}

/* ---- the rest of the loop works on the reduced picture ------------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const ask = kit.only(L, l => l === '    const r=scale ? {ok:{data:px, width:W, height:H, stepX:1, stepY:1}}',
    'where the batch asks', bat);
  if (L[ask + 1] !== '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:W, height:H,')
    throw new Error('the ask is not shaped the way this expects: ' + JSON.stringify(L[ask + 1]));
  kit.replace(L, { start: ask, end: ask + 1 }, [
    '    const r=scale ? {ok:{data:px, width:sw, height:sh, stepX:1, stepY:1}}',
    '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:sw, height:sh,',
  ]);
  const step = kit.only(L, l => l === '        mode:mode, forceStep:(()=>{ const s=fixStepFor(W,px,H); return s>0?s:null; })()});',
    'the batch step question', kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: step, end: step }, [
    '        mode:mode, forceStep:(()=>{ const s=fixStepFor(sw,px,sh); return s>0?s:null; })()});',
  ]);
}

/* ---- and it is said, because nobody asked for it ------------------- */
{
  const bat = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '  fixMoved=null; fixNoGrid=0;', 'where a batch resets', bat);
  kit.replace(L, { start: at, end: at }, [
    '  fixMoved=null; fixNoGrid=0;',
    '  /* Pictures reduced by a whole factor to get under the engine limit. */',
    '  const shrunk=[];',
  ]);
  const note = kit.only(L, l => l === '  const noGridNote = fixNoGrid', 'the gridless note',
    kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: note, end: note - 1 }, [
    '  const shrunkNote = shrunk.length',
    '    ? " ' + MID + ' "+shrunk.length+" were larger than the engine takes and were reduced"',
    '      +" by a whole factor first: "+shrunk.join(", ")',
    '    : "";',
  ]);
  const say = kit.only(L, l => l.indexOf('  fixBatchSay(fixBatchFiles.length+" of "+list.length') === 0,
    'what a batch says', kit.inFunction(L, 'async function fixBatch(files){'));
  kit.replace(L, { start: say, end: say }, [L[say] + '+shrunkNote']);
}

const bytes = kit.save(doc, ({ text, code, codeLines }) => {
  /* NO RESAMPLING. The whole claim is that pixel edges do not move. */
  const sh = kit.inFunction(codeLines, 'function fixShrinkToFit(data,W,H){');
  const body = codeLines.slice(sh.start, sh.end + 1).join('\n');
  if (/drawImage|createImageBitmap|imageSmoothing/.test(body))
    throw new Error('the reduction is resampling rather than picking a block colour');
  if (!/if\(W%n\|\|H%n\) continue;/.test(body))
    throw new Error('the factor is not required to divide both sides');
  if (!/W\*H<=FIX_MAX_PIXELS\) return null;/.test(body))
    throw new Error('it reduces pictures that did not need reducing');

  /* THE ENGINE LIMIT IS NOT TOUCHED. It is api.py's, transcribed. */
  /* The engine is worker text, so it is not in the page's own script - this
     one is checked against the file. */
  if (!/PF\.MAX_PIXELS = 4000000;/.test(text))
    throw new Error('the engine transcribed limit was changed');
  if (!/const FIX_MAX_PIXELS=4000000, FIX_MIN_SIDE=16;/.test(code))
    throw new Error('the page and the engine no longer draw the same line');

  /* AND THE LOOP RUNS ON THE REDUCED PICTURE, not the original size. Getting
     this half right hands the engine 2048 pixels labelled 1024. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const bb = codeLines.slice(bat.start, bat.end + 1).join('\n');
  if (!/width:sw, height:sh/.test(bb))
    throw new Error('the engine is told the size the picture used to be');
  if (!/fixStepFor\(sw,px,sh\)/.test(bb))
    throw new Error('the step is measured against the size the picture used to be');
  if (/width:W, height:H/.test(bb))
    throw new Error('a caller still passes the original size with reduced pixels');
  if (!/no whole factor brings it under /.test(bb))
    throw new Error('an oversized picture with no factor is silently accepted');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
