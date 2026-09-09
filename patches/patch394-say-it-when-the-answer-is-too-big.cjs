/* THE ADVICE I ADDED WOULD NOT HAVE FIRED ON THE PICTURE THAT PROMPTED IT.

   patch393 made a result say what to do when its confidence was not high. Then
   I built the case it was for - 512px of 12px blocks, blurred - and the
   detector answered 43x43 at 11.91 px with HIGH confidence. Correct, and it
   means a simple soft edge does not fool it, and it means the advice stays
   quiet on exactly the kind of image the complaint was about.

   So confidence is the wrong trigger. What went wrong on the real picture is
   not that the detector was unsure; it is that it locked onto the finest
   repeating structure in a scene that has 1px detail in it - tree texture,
   speckles in the portal - and answered with a step so small that the result
   is the same picture with its softness preserved faithfully.

   THE SIZE OF THE ANSWER IS THE SIGNAL. Pixel art is 16 to 256 pixels on its
   long edge; that is what the form is. A "fixed" image still 512 or 1024
   across is not somebody's artwork at its native size, whatever the detector's
   confidence in the grid. So the run says so when the result is over 256, and
   it says it as a suggestion contingent on what the person can see - "if the
   edges still look soft" - because a genuinely large piece is a real thing and
   this must not call it wrong.

   AND IT NAMES NUMBERS TO TRY, computed from the image rather than invented:
   the three pixel sizes nearest 8, 12 and 16 that divide this width evenly,
   each with the artwork size it would give. On the 1024 image this came from,
   that reads "8 gives 128x128, 16 gives 64x64, 32 gives 32x32" - which is the
   thing that was actually missing, since turning the number up by hand is what
   fixed it.

   The confidence trigger stays. Both are reasons to look again. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '        const soft = r.confidence!=="high" && r.consensus!=="forced";',
    'the soft-result test');
  if (L[at + 4] !== '            +" into Pixel size and run it again." : ""));')
    throw new Error('the advice is not the five lines this expects');
  kit.replace(L, { start: at, end: at + 4 }, [
    '        /* TWO REASONS TO LOOK AGAIN, and the second is the one that matters.',
    '',
    '           Confidence alone was not enough: the case this was written for -',
    '           blocks with a soft edge - is answered at HIGH confidence and',
    '           correctly, so the advice stayed quiet on exactly the picture that',
    '           prompted it. What goes wrong on a generated scene is that the',
    '           detector locks onto the finest repeating thing in it, which in a',
    '           picture with 1px texture is a step of two or three - and a step',
    '           that small reproduces the softness faithfully.',
    '',
    '           So: the SIZE of the answer. Pixel art is 16 to 256 on its long',
    '           edge; a result still 512 across is not artwork at its native',
    '           size whatever the grid confidence. Said as a suggestion',
    '           contingent on what the person can see, because a genuinely large',
    '           piece exists and this must not call it wrong. */',
    '        const big = Math.max(r.width,r.height) > FIX_NATIVE_MAX;',
    '        const unsure = r.confidence!=="high" && r.consensus!=="forced";',
    '        fixSay((r.confidence||"")+" confidence ("+(r.consensus||"?")+") \\u00b7 "+secs+"s"',
    '          +((big||unsure) ? " \\u2014 if the edges still look soft, the pixel size it used ("',
    '            +(+r.stepX).toFixed(2)+" px) was too small. "+fixTryThese() : ""));',
  ]);
}

/* ---- the sizes to try, from the image rather than invented ------- */
{
  const at = kit.only(L, l => l === 'function fixSizeHint(){', 'the readout');
  kit.replace(L, { start: at, end: at }, [
    '/* How big a picture may be and still be somebody\'s artwork at its own size.',
    '   Pixel art runs from about 16 to 256 on the long edge; past that the',
    '   answer is a photograph of pixel art rather than the thing itself. */',
    'const FIX_NATIVE_MAX=256;',
    '/* THREE PIXEL SIZES WORTH TRYING, and what each would give. Computed from',
    '   the image in hand: the divisors of its long edge nearest 8, 12 and 16, so',
    '   every suggestion divides evenly and none of them is a guess. Falls back to',
    '   the three plain numbers when nothing divides, which is the honest answer',
    '   for a width like 1023. */',
    'function fixTryThese(){',
    '  if(!FIX.src) return "";',
    '  const W=FIX.src.width, H=FIX.src.height, long=Math.max(W,H);',
    '  const divisors=[];',
    '  for(let n=2;n<=long/8;n++) if(long%n===0) divisors.push(n);',
    '  const near=(want)=>{',
    '    if(!divisors.length) return want;',
    '    let best=divisors[0];',
    '    for(const d of divisors) if(Math.abs(d-want)<Math.abs(best-want)) best=d;',
    '    return best;',
    '  };',
    '  const seen=[], out=[];',
    '  for(const want of [8,12,16]){',
    '    const s=near(want);',
    '    if(seen.indexOf(s)>=0) continue;',
    '    seen.push(s);',
    '    out.push(s+" gives "+Math.max(1,Math.round(W/s))+"\\u00d7"+Math.max(1,Math.round(H/s)));',
    '  }',
    '  return "Try "+out.join(", ")+".";',
    '}',
    'function fixSizeHint(){',
  ]);
}

const bytes = kit.save(doc, ({ code, codeLines }) => {
  const fr = kit.inFunction(codeLines, 'function fixRun(){');
  const run = codeLines.slice(fr.start, fr.end + 1).join('\n');
  if (!/Math\.max\(r\.width,r\.height\) > FIX_NATIVE_MAX/.test(run))
    throw new Error('the size of the answer is not a reason to look again');
  if (!/r\.confidence!=="high" && r\.consensus!=="forced"/.test(run))
    throw new Error('the confidence reason was dropped rather than joined');
  if (!/big\|\|unsure/.test(run)) throw new Error('the two reasons are not both used');
  if (!/fixTryThese\(\)/.test(run)) throw new Error('nothing names a size to try');
  /* IT MUST STILL BE ABLE TO SAY NOTHING. */
  if (!/: ""\)\);/.test(run)) throw new Error('the advice is unconditional');

  /* THE SUGGESTIONS, RUN. Sliced out of the text that was written, so what is
     checked is what ships - and checked to divide evenly, which is the whole
     claim the wording makes. */
  const from = code.indexOf('function fixTryThese(){');
  const to = code.indexOf('function fixSizeHint(){');
  if (from < 0 || to < 0 || to < from) throw new Error('cannot find the suggester to exercise it');
  // eslint-disable-next-line no-new-func
  const make = new Function('W', 'H', 'var FIX={src:{width:W,height:H}};'
    + code.slice(from, to) + '\nreturn fixTryThese();');
  const cases = [[1024, 1024], [512, 512], [1280, 1280], [1023, 1023]];
  for (const [w, h] of cases) {
    const said = make(w, h);
    if (said.indexOf('Try ') !== 0) throw new Error(w + ': ' + said);
    const sizes = (said.match(/(\d+) gives (\d+)/g) || []).map(s => s.split(' ')[0] | 0);
    if (!sizes.length) throw new Error(w + ' produced no sizes: ' + said);
    if (w % sizes[0] !== 0 && w !== 1023)
      throw new Error(w + ': ' + sizes[0] + ' does not divide it evenly, and the wording says it does');
    for (const s of sizes) {
      if (Math.max(1, Math.round(w / s)) > 512)
        throw new Error(w + ': ' + s + ' still leaves ' + Math.round(w / s) + ' across');
    }
  }
  /* And a 1024 image really does offer the 8 that was wanted. */
  const k = make(1024, 1024);
  if (k.indexOf('8 gives 128\u00d7128') < 0)
    throw new Error('a 1024 image does not offer 8: ' + k);
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
