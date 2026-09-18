/* TRANSLUCENT PIXELS ARE SAID.

   The collection has no translucency and the engine gives it none: in
   the cell vote a pixel counts as paint when its alpha is over half
   (alpha > 127, pf-40-reconstruct.js) and as clear otherwise, and every
   result cell is written solid or empty. Right by design, and done in
   silence. Measured 2026-09-18 (review finding FI-5, checked here with
   pngjs on the raw archive):

     skins/Solana Hue Skin   1254px   569,572 translucent pixels
                             565,940 over half, 3,632 at or under -
                             a near-opaque hue overlay saved as a solid skin
     extras/Harambe Ghost    2048px   184,109 translucent (174,385 / 9,724)
                             a ghost drawn translucent, saved solid with its
                             faintest tenth gone
     mouth/Handlebar Moustache 1280px  700 (300 / 400)

   and the run said nothing on any of them. Now the picture's translucent
   pixels are counted once when it is loaded and the sentence says how
   many there were and how the engine treated them; the folder note counts
   the pictures. Scale mode keeps them - and says the one thing that is
   true there: the browser's canvas premultiplies alpha on the way in, so
   a translucent pixel's colour can come back rounded (the review measured
   4,230 of Solana Hue Skin's 569,572 changed in headless Chromium), which
   is why "the bytes that came in are the bytes that go out" holds for
   every opaque pixel and only nearly for these. Saying so is the honest
   version of that promise until the page reads PNG bytes itself. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const swap = (from, to, name) => { const at = kit.only(L, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };

/* ---- 1. the count, once ------------------------------------------------- */
{
  const at = kit.only(L, l => l === '/* HOW MANY OF THOSE MARKS THE RESULT DROPPED: a mark with no pixel under an', 'the dropped-marks comment');
  kit.replace(L, { start: at, end: at }, [
    '/* THE TRANSLUCENT PIXELS IN A PICTURE, and how the engine will treat them.',
    '   The collection has no translucency and the engine gives it none: a',
    '   pixel counts as paint in the cell vote when its alpha is over half',
    '   (alpha > 127, pf-40-reconstruct.js) and as clear otherwise, and every',
    '   result cell is solid or empty. That was done in silence: skins/Solana',
    '   Hue Skin, a near-opaque overlay (569,572 of its pixels between alpha 1',
    '   and 254), came out a solid skin and the run said nothing (measured',
    '   2026-09-18). Counted once per picture, and said. */',
    'function fixTranslucent(data,n){',
    '  let count=0, solid=0;',
    '  for(let i=0;i<n;i++){',
    '    const a=data[i*4+3];',
    '    if(a===0||a===255) continue;',
    '    count++; if(a>127) solid++;',
    '  }',
    '  return {count:count, solid:solid, clear:count-solid};',
    '}',
    '/* HOW MANY OF THOSE MARKS THE RESULT DROPPED: a mark with no pixel under an',
  ]);
}

/* ---- 2. counted when the picture is loaded ------------------------------ */
swap('  FIX.src={data:sd, width:sw, height:sh};',
  ['  FIX.src={data:sd, width:sw, height:sh};',
   '  FIX.translucent=fixTranslucent(sd,sw*sh);'], 'fixLoad sets the source');
{
  const at = kit.only(L, l => l.startsWith('    FIX.src={data:new Uint8ClampedArray(o.data), width:o.width, height:o.height}; FIX.name=o.name||"image"; FIX.out=null;'), 'the record path sets the source');
  kit.replace(L, { start: at, end: at }, [L[at] + ' FIX.translucent=fixTranslucent(FIX.src.data,o.width*o.height);']);
}

/* ---- 3. the single run says it ------------------------------------------ */
swap('        const how = r.consensus==="measured"', [
  '        /* TRANSLUCENT PIXELS, SAID. The engine counts a pixel as paint when',
  '           its alpha is over half and as clear otherwise, and writes cells',
  '           that are solid or empty, so a near-opaque overlay comes out a',
  '           solid skin. Right by design - the collection has no translucency',
  '           - and said, so it is not a surprise at the shelf. */',
  '        const tl=FIX.translucent||{count:0,solid:0,clear:0};',
  '        const alphaNote = tl.count',
  '          ? " \\u00b7 "+tl.count.toLocaleString()+" translucent pixel"+(tl.count===1?"":"s")+": "',
  '            +tl.solid.toLocaleString()+" counted as paint, "+tl.clear.toLocaleString()+" as clear - the result has none"',
  '          : "";',
  '        const how = r.consensus==="measured"',
], 'the how sentence');
swap('          +palNote', ['          +palNote', '          +alphaNote'], 'the palette clause in the final sentence');

/* ---- 4. scale mode keeps them, and says what the canvas does ------------ */
swap('    fixSay("Nothing was detected or recoloured. "+fixSaveSize(r));', [
  '    /* AND THE TRANSLUCENT PIXELS ARE KEPT, with the one caveat that is true:',
  '       the browser premultiplies alpha on the way in, so a translucent',
  '       pixel\'s colour can come back rounded by a step (the review measured',
  '       4,230 of Solana Hue Skin\'s 569,572 in headless Chromium). The bytes',
  '       that came in are the bytes that go out for every opaque pixel, and',
  '       only nearly for these; said rather than promised. */',
  '    const tl=FIX.translucent||{count:0};',
  '    fixSay("Nothing was detected or recoloured. "+fixSaveSize(r)',
  '      +(tl.count ? " \\u00b7 "+tl.count.toLocaleString()+" translucent pixel"+(tl.count===1?" is":"s are")',
  '        +" kept translucent; the browser rounds their colour on the way in, so those are not byte-exact" : ""));',
], 'the scale-mode sentence');

/* ---- 5. the folder note counts the pictures ----------------------------- */
swap('let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0;',
     'let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0;', 'the batch counters');
swap('  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0;',
     '  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0;', 'the batch reset');
swap('    /* The same bytes, untouched, when there is nothing to ask. */', [
  '    /* TRANSLUCENT PIXELS, COUNTED PER PICTURE for the note. */',
  '    { const tl=fixTranslucent(px,sw*sh); if(tl.count){ fixAlphaFiles++; fixAlphaPixels+=tl.count; } }',
  '    /* The same bytes, untouched, when there is nothing to ask. */',
], 'the batch pass-through comment');
swap('  const shrunkNote = shrunk.length', [
  '  /* TRANSLUCENT PIXELS. Counted as paint or clear by the engine and every',
  '     result cell solid or empty; in scale mode kept, with the browser\'s',
  '     rounding of their colour. Said, because a near-opaque overlay coming',
  '     out as a solid skin is a surprise otherwise. */',
  '  const alphaNote = fixAlphaFiles',
  '    ? " \\u00b7 "+fixAlphaFiles+" had translucent pixels ("+fixAlphaPixels.toLocaleString()+" in all), "',
  '      +(scale ? "kept translucent - the browser rounds their colour on the way in" : "counted as paint or clear - the results have none")',
  '    : "";',
  '  const shrunkNote = shrunk.length',
], 'the shrunk note');
{
  const at = kit.only(L, l => l.startsWith('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "') && l.endsWith('+offNote+shrunkNote+palNote'), 'the folder sentence');
  kit.replace(L, { start: at, end: at }, [L[at].replace('+offNote+shrunkNote+palNote', '+offNote+alphaNote+shrunkNote+palNote')]);
}

/* ---- 6. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('function fixTranslucent(data,n){');
  need('  FIX.translucent=fixTranslucent(sd,sw*sh);');
  need('FIX.translucent=fixTranslucent(FIX.src.data,o.width*o.height);');
  need('          +alphaNote');
  need('+offNote+alphaNote+shrunkNote+palNote');
  need('kept translucent; the browser rounds their colour on the way in, so those are not byte-exact');
  need('{ const tl=fixTranslucent(px,sw*sh); if(tl.count){ fixAlphaFiles++; fixAlphaPixels+=tl.count; } }');
  /* the count, exercised: 0 and 255 are not translucent, 127 is clear, 128 is paint */
  const a = lines.findIndex(l => l === 'function fixTranslucent(data,n){');
  let b = a; while (lines[b] !== '}') b++;
  const fn = new Function(lines.slice(a, b + 1).join('\n') + '\nreturn fixTranslucent;')();
  const d = new Uint8ClampedArray(8 * 4);
  [0, 255, 127, 128, 1, 254, 60, 200].forEach((al, i) => { d[i * 4 + 3] = al; });
  const r = fn(d, 8);
  if (r.count !== 6 || r.solid !== 3 || r.clear !== 3) throw new Error('fixTranslucent miscounts: ' + JSON.stringify(r));
  if (fn(d, 2).count !== 0) throw new Error('0 and 255 should not count');
});

fs.renameSync(TMP, FILE);
console.log('patch506 written, ' + grew + ' bytes');
