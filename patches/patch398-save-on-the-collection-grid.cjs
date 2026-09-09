/* THE FIXER'S ANSWER IS 85 PIXELS ACROSS AND THE COLLECTION IS 1280.

   "I'm going to be doing 320 edits to the Traits on the sites fix pixels
   editor. I want a button that saves the trait so it will be 1280x1280 and i
   want it to stay in position (if its less or more X i want it to be sized to
   fit 1280x1280 while keeping exact positioning bc i will be moving traits to
   their final position."

   POSITION IS EXACT BY CONSTRUCTION, and it is worth saying why rather than
   claiming it. The fixer's output is the whole input picture at one pixel per
   cell - it covers the same extent, not a crop of it - so scaling the whole
   thing to 1280x1280 puts whatever was three tenths of the way across at three
   tenths of the way across. Nothing is centred, nothing is padded, and there is
   no offset to get wrong.

   WHAT IS NOT AUTOMATIC IS SQUARE PIXELS. 1280 / 85 is 15.06, so at that size
   some pixels come out 15 wide and some 16. That is not a rounding detail in
   this project - it is the thing the whole collection is built around, "a whole
   multiple of the cell count or a whole division of it". So the readout beside
   Pixel size now says which of the two you are about to get:

     an output of 128   ->  "x10 to 1280", every pixel identical
     an output of 85    ->  "1280 / 85 = 15.06, so pixels come out uneven"

   Somebody doing this 320 times should be told before the first one, not find
   out after the last. The suggestion is computed from the image in hand, so it
   is a divisor that actually exists rather than a rule of thumb.

   ONE SWITCH, NOT TWO BUTTONS. A separate "save at 1280" button beside
   "Download the PNG" would leave two paths and a question about which one a
   batch takes. This is a checkbox that both of them read, defaulting ON because
   that is the stated workflow - and the caption says the size either way, so
   what came out is never a guess.

   NEAREST NEIGHBOUR, always: imageSmoothingEnabled=false, which is what makes
   this a resize of pixel art rather than a photograph of it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the switch -------------------------------------------------- */
{
  const at = kit.only(L, l => l === '    <span class="note mono" id="fixsize"></span>', 'the size readout');
  kit.replace(L, { start: at, end: at }, [
    '    <span class="note mono" id="fixsize"></span>',
    '    <label class="olrow" style="gap:6px; margin-left:auto"',
    '      title="Write the result onto the collection\'s own 1280x1280 canvas instead of at its native size. The whole picture is scaled, so nothing moves relative to anything else.">',
    '      <input type="checkbox" id="fixgrid" checked>',
    '      <span>Save at 1280\\u00d71280</span></label>',
  ]);
}

/* ---- the canvas a save is written onto --------------------------- */
{
  const at = kit.only(L, l => l === 'function fixDownload(){', 'the single download');
  kit.replace(L, { start: at, end: at }, [
    '/* THE PICTURE, ON THE CANVAS THE COLLECTION USES.',
    '',
    '   The fixer\'s output covers the same extent as what went in, so scaling all',
    '   of it to CANVAS_SIDE keeps every position exactly where it was as a',
    '   fraction of the picture - which is what "stay in position" means when the',
    '   trait is going to be moved into place afterwards. Nothing is centred and',
    '   nothing is padded, so there is no offset to get wrong.',
    '',
    '   Nearest neighbour, because this is a resize of pixel art. Where the side',
    '   divides evenly every pixel comes out the same width; where it does not',
    '   they differ by one, which is what the readout warns about before the run',
    '   rather than after 320 of them. */',
    'function fixGridCanvas(r){',
    '  const c=document.createElement("canvas");',
    '  const on=$("fixgrid")&&$("fixgrid").checked;',
    '  const side=on?CANVAS_SIDE:r.width;',
    '  c.width=on?CANVAS_SIDE:r.width; c.height=on?CANVAS_SIDE:r.height;',
    '  const g=c.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  const src=document.createElement("canvas"); src.width=r.width; src.height=r.height;',
    '  const im=src.getContext("2d").createImageData(r.width,r.height);',
    '  im.data.set(r.data);',
    '  src.getContext("2d").putImageData(im,0,0);',
    '  g.drawImage(src,0,0,c.width,c.height);',
    '  src.width=1; src.height=1;',
    '  void side;',
    '  return c;',
    '}',
    'function fixDownload(){',
  ]);

  const r = kit.inFunction(L, 'function fixDownload(){');
  const body = kit.only(L, l => l === '  $("fixafter").toBlob(b=>{', 'the single download body', r);
  if (L[body + 3] !== '  },"image/png");')
    throw new Error('the single download is not the four lines this expects');
  kit.replace(L, { start: body, end: body + 3 }, [
    '  /* Through the same canvas the batch writes, so one switch decides both',
    '     and there is no second answer to what a save is. */',
    '  const c=fixGridCanvas(r);',
    '  c.toBlob(b=>{',
    '    const a=document.createElement("a"); a.href=URL.createObjectURL(b);',
    '    a.download=FIX.name+"-fixed.png"; a.click();',
    '    setTimeout(()=>URL.revokeObjectURL(a.href),1000);',
    '    c.width=1; c.height=1;',
    '  },"image/png");',
  ]);
}

/* ---- and the batch writes the same thing ------------------------- */
{
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const at = kit.only(L, l => l === '    const oc=document.createElement("canvas"); oc.width=out.width; oc.height=out.height;',
    'where the batch builds its output canvas', r);
  if (L[at + 4] !== '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));')
    throw new Error('the batch does not encode where this expects');
  kit.replace(L, { start: at, end: at + 4 }, [
    '    /* The same canvas the single save uses, so the switch means one thing. */',
    '    const oc=fixGridCanvas(out);',
    '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));',
  ]);
  const r2 = kit.inFunction(L, 'async function fixBatch(files){');
  const keep = kit.only(L, l => l === '      w:out.width, h:out.height});', 'what the batch records', r2);
  kit.replace(L, { start: keep, end: keep }, ['      w:oc.width, h:oc.height});']);
}

/* ---- the readout says which kind of scale-up you get ------------- */
{
  const r = kit.inFunction(L, 'function fixSizeHint(){');
  const at = kit.only(L, l => l === '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels";',
    'the readout text', r);
  kit.replace(L, { start: at, end: at }, [
    '  /* AND WHETHER IT LANDS ON THE COLLECTION GRID. 1280/128 is 10 and every',
    '     pixel comes out identical; 1280/85 is 15.06 and they differ by one.',
    '     That is the difference between a trait that sits on the grid and one',
    '     that does not, and it is worth knowing before 320 of them rather than',
    '     after. Only said when the switch is on, because it is only true then. */',
    '  let note="";',
    '  if($("fixgrid")&&$("fixgrid").checked){',
    '    const k=CANVAS_SIDE/cols;',
    '    note = (cols===rows && Number.isInteger(k))',
    '      ? " \\u00b7 \\u00d7"+k+" to "+CANVAS_SIDE',
    '      : " \\u00b7 "+CANVAS_SIDE+"/"+cols+" is "+(Math.round(k*100)/100)',
    '        +", so pixels come out uneven"+fixEvenSizes();',
    '  }',
    '  el.textContent="\\u2192 "+cols+"\\u00d7"+rows+" pixels"+note;',
  ]);

  const fn = kit.only(L, l => l === 'function fixSizeHint(){', 'the readout function');
  kit.replace(L, { start: fn, end: fn }, [
    '/* A PIXEL SIZE THAT WOULD LAND ON THE GRID, if one exists for this image.',
    '',
    '   Computed rather than suggested from a rule of thumb: the divisors of the',
    '   image\'s width that also divide CANVAS_SIDE, nearest the one being asked',
    '   about. If nothing does - a 1023px image has no such size - it says so',
    '   instead of naming a number that would not work. */',
    'function fixEvenSizes(){',
    '  if(!FIX.src) return "";',
    '  const W=FIX.src.width, H=FIX.src.height;',
    '  const out=[];',
    '  for(let s=2;s<=W/8;s++){',
    '    if(W%s||H%s) continue;',
    '    const cols=W/s;',
    '    if(cols>CANVAS_SIDE||CANVAS_SIDE%cols) continue;',
    '    out.push({s:s,cols:cols});',
    '  }',
    '  if(!out.length) return ". Nothing divides this image onto that grid.";',
    '  const want=+($("fixforce")&&$("fixforce").value)||8;',
    '  out.sort((a,b)=>Math.abs(a.s-want)-Math.abs(b.s-want));',
    '  const pick=out.slice(0,3).sort((a,b)=>a.s-b.s);',
    '  return ". "+pick.map(p=>p.s+" gives "+p.cols+"\\u00d7"+p.cols).join(", ")',
    '    +" and divide"+(pick.length===1?"s":"")+" evenly.";',
    '}',
    'function fixSizeHint(){',
  ]);

  /* The switch changes the answer, so it redraws the readout. */
  const wire = kit.only(L, l => l === '  $("fixforce").addEventListener("input",fixSizeHint);',
    'the readout wiring');
  kit.replace(L, { start: wire, end: wire }, [
    '  $("fixforce").addEventListener("input",fixSizeHint);',
    '  $("fixgrid").addEventListener("change",fixSizeHint);',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, code, codeLines }) => {
  if (text.indexOf('id="fixgrid"') < 0) throw new Error('there is no switch');
  const fg = kit.inFunction(codeLines, 'function fixGridCanvas(r){');
  const body = codeLines.slice(fg.start, fg.end + 1).join('\n');
  if (!/imageSmoothingEnabled=false/.test(body))
    throw new Error('the resize smooths, which makes it a photograph of pixel art');
  if (!/drawImage\(src,0,0,c\.width,c\.height\)/.test(body))
    throw new Error('the whole picture is not scaled to the whole canvas, so position moves');
  if (!/CANVAS_SIDE/.test(body)) throw new Error('the save does not use the collection canvas');
  /* IT MUST BE ABLE TO NOT DO IT. A version that always wrote 1280 would pass
     every line above and take the native size away. */
  if (!/const on=\$\("fixgrid"\)&&\$\("fixgrid"\)\.checked;/.test(body))
    throw new Error('the switch is not read, so the native size is gone');

  /* ONE SWITCH, BOTH PATHS. */
  const fd = kit.inFunction(codeLines, 'function fixDownload(){');
  if (!/fixGridCanvas\(r\)/.test(codeLines.slice(fd.start, fd.end + 1).join('\n')))
    throw new Error('the single download does not go through it');
  const fb = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const batch = codeLines.slice(fb.start, fb.end + 1).join('\n');
  if (!/fixGridCanvas\(out\)/.test(batch))
    throw new Error('the batch does not go through it');
  if (!/w:oc\.width, h:oc\.height/.test(batch))
    throw new Error('the batch records the size before the scale, so its report would be wrong');

  /* THE ARITHMETIC OF THE SUGGESTION, RUN. Every size it names has to divide
     BOTH the image and the collection canvas, which is the whole claim. */
  const from = code.indexOf('function fixEvenSizes(){');
  const to = code.indexOf('function fixSizeHint(){');
  if (from < 0 || to < 0 || to < from) throw new Error('cannot find the suggester to exercise it');
  const make = (W, H, want) => {
    // eslint-disable-next-line no-new-func
    const f = new Function('W', 'H', 'want',
      'var CANVAS_SIDE=1280;'
      + 'var FIX={src:{width:W,height:H}};'
      + 'var $=function(id){ return id==="fixforce" ? {value:String(want)} : null; };'
      + code.slice(from, to) + '\nreturn fixEvenSizes();');
    return f(W, H, want);
  };
  for (const [W, H] of [[1024, 1024], [512, 512], [2048, 2048]]) {
    const said = make(W, H, 8);
    const named = (said.match(/(\d+) gives (\d+)/g) || []);
    if (!named.length) throw new Error(W + ': nothing suggested - ' + said);
    for (const n of named) {
      const s = +n.split(' ')[0], cols = +n.split(' ')[2];
      if (W % s) throw new Error(W + ': ' + s + ' does not divide the image');
      if (W / s !== cols) throw new Error(W + ': ' + s + ' does not give ' + cols);
      if (1280 % cols) throw new Error(W + ': ' + cols + ' does not divide 1280, which is the claim');
    }
  }
  /* And an image nothing divides says so rather than naming a size. */
  const odd = make(1023, 1023, 8);
  if (odd.indexOf('Nothing divides') < 0)
    throw new Error('an image with no clean size still gets a suggestion: ' + odd);
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
