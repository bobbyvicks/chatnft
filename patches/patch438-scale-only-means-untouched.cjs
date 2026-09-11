/* SCALE ONLY MEANS UNTOUCHED, AND THE PALETTE SWITCH BROKE THAT.

   patch436 applied the palette to the scale-only result too, reasoning that
   it "writes a file like any other run". patch437 then turned the switch on
   by default, and two tests went red that were right:

     scale only returns the picture byte for byte at native size
       expected 0 bytes different, got 3966
     and at 1280 it is the same picture, larger
       expected no colour invented, got 213

   Scale only is the one mode whose whole promise is that nothing happens to
   the picture. Its own code says so: "Nothing to ask. The picture is already
   one pixel per cell, so there is no worker, no detector and no quantiser
   between it and the save - the bytes that came in are the bytes that go
   out." Recolouring it is exactly the thing it exists not to do, and the
   reason to use it is having a finished picture you do not want touched.

   So the palette is not applied there, and the switch is greyed out in that
   mode with a title saying why - the same treatment the pixel size box gets,
   and for the same reason: a live control that changes no answer is a
   control that lies.

   The fixing modes are unaffected. They already rebuild every pixel. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- not applied there --------------------------------------------- */
{
  const run = kit.inFunction(L, 'function fixRun(){');
  const at = kit.only(L, l => l === '    /* Scale only writes a file like any other run, so the switch applies. */',
    'the scale-only palette note', run);
  if (L[at + 1] !== '    fixPalApply(r);')
    throw new Error('the scale-only palette call is not where this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    /* AND NOT THE PALETTE EITHER. patch436 applied it here, reasoning that',
    '       scale only "writes a file like any other run". It does not: the four',
    '       lines above are the whole mode, and what they promise is the bytes',
    '       that came in. Two tests said so - 3966 bytes different on a picture',
    '       that must not change by one, and 213 colours invented on a mode',
    '       whose name is the opposite of inventing. The switch is greyed out',
    '       here rather than quietly doing nothing. */',
  ]);
}

/* ---- and the switch says so ---------------------------------------- */
{
  const fn = kit.inFunction(L, 'function fixModeUI(){');
  const at = kit.only(L, l => l === '  const f=$("fixforce"); if(f){ f.disabled=scale; f.title=scale',
    'the pixel size field state', fn);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* THE PALETTE SWITCH, THE SAME WAY. Scale only does not recolour, so a',
    '     live switch there would change no answer - which is the thing the',
    '     pixel size box below was disabled for. */',
    '  const p=$("fixpal"); if(p){ p.disabled=scale;',
    '    p.title=scale',
    '      ? "Not used in scale only - that mode passes the picture through untouched."',
    '      : "Change every colour in the result to the nearest one in the project palette."',
    '        +" A green becomes a different shade of green. Colours already in the palette"',
    '        +" are left alone and nothing transparent is touched."; }',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const run = kit.inFunction(codeLines, 'function fixRun(){');
  const body = codeLines.slice(run.start, run.end + 1).join('\n');
  /* ONE CALL LEFT, on the fixing path, not two. */
  if ((body.match(/fixPalApply\(/g) || []).length !== 1)
    throw new Error('scale only still recolours, or the fixing path stopped');
  /* And the one that is left is NOT in the scale-only branch: that branch
     returns before the worker, so the call would have to sit above it. */
  const scaleAt = body.indexOf('consensus:"scaled"');
  const callAt = body.indexOf('fixPalApply(');
  if (scaleAt >= 0 && callAt >= 0 && callAt < scaleAt)
    throw new Error('the palette is applied before the scale-only branch returns');

  /* AND THE SWITCH IS OFF IN THAT MODE, rather than lying. */
  const mu = kit.inFunction(codeLines, 'function fixModeUI(){');
  const mb = codeLines.slice(mu.start, mu.end + 1).join('\n');
  if (!/const p=\$\("fixpal"\); if\(p\)\{ p\.disabled=scale;/.test(mb))
    throw new Error('the switch stays live in a mode where it changes nothing');
  /* It is still live everywhere else. */
  if (/p\.disabled=true;/.test(mb))
    throw new Error('the switch is disabled outright');
  if (!/Not used in scale only/.test(text))
    throw new Error('nothing says why it is off');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
