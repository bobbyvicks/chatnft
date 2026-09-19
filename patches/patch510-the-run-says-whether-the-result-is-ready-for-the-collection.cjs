/* THE RUN SAYS WHETHER THE RESULT IS READY FOR THE COLLECTION.

   The library states the gate in its own words (CURRENT-REWORK-BRIEF.md):
   1280 square, "ZERO mixed8px cells, ZERO off-palette pixels, ZERO
   partial-alpha pixels". The tab computed all of it and said none of it. It
   said what it DID - the cell count, the colours it moved, the marks it
   dropped - and left the person to work out from those clauses whether the
   file can go in, which is the one thing they opened the tab to find out.

   Now the run answers it. A folder run ends with "N of M are ready for the
   collection", naming what stopped the rest, in the order of how many files
   each reason held back. A single run says "ready for the collection" or
   the reason it is not.

   THE GRID FACT IS ASKED OF THE SAVED PICTURE, NOT OF THE CELL COUNT. A
   first draft asked whether the engine's result was 160 cells, which is the
   same question only for the engine's own path: a finished 1280 trait sent
   through scale only is saved unchanged, is made of whole 8px blocks, and
   would have been called "not on the 160 cell grid" for having 1280 one
   pixel cells. Its own spec test caught that. So the check maps the saved
   canvas's 8px blocks back through the engine's own nearest-neighbour rule
   and asks whether each block is one colour - which is the library's
   sentence, and true for 16px art as well, as the library's own checker
   also has it.

   The other facts are the page's own rules, not a second opinion: colours
   against paletteRGB's exact set (the set snapToPalette calls already
   on-palette and leaves alone) and fixTranslucent for part transparency, so
   the gate line cannot disagree with the clauses beside it.

   The gate says what the FILE is; the clauses beside it say what the RUN
   did. A raw render can pass the gate having lost detail the run reported,
   and a finished trait passes having had nothing done to it. Both lines,
   not either. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const swap = (from, to, name) => { const at = kit.only(L, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };
const rangeOf = (sig) => { const s = kit.only(L, l => l === sig, sig); let e = s + 1; while (L[e] !== '}') e++; return { start: s, end: e }; };
const onlyIn = (sig, pred, name) => kit.only(L, pred, name, rangeOf(sig));
const BATCH = 'async function fixBatchRun(files){';

/* ---- 1. the check, in one place ------------------------------------------ */
{
  const at = kit.only(L, l => l === '/* THE TRANSLUCENT PIXELS IN A PICTURE, and how the engine will treat them.', 'the translucency comment');
  kit.replace(L, { start: at, end: at }, [
    '/* IS THIS RESULT READY FOR THE COLLECTION? The library states the gate:',
    '   1280 square, "ZERO mixed8px cells, ZERO off-palette pixels, ZERO',
    '   partial-alpha pixels" (CURRENT-REWORK-BRIEF.md).',
    '',
    '   THE BLOCK QUESTION IS ASKED OF THE SAVED PICTURE. The saved canvas is',
    '   made from the result by the same nearest-neighbour rule fixGridCanvas',
    '   uses - each destination pixel takes the source pixel under its centre -',
    '   so the pixels feeding one 8px block are a rectangle of the result, and',
    '   the block is flat when that rectangle is one colour. Asking instead',
    '   whether the result is 160 cells would be the same question only for the',
    '   engine\'s own path: a finished 1280 trait through scale only is saved',
    '   unchanged, is whole 8px blocks, and has 1280 one-pixel cells.',
    '',
    '   The palette set is paletteRGB\'s own - the membership snapToPalette uses',
    '   to leave a colour alone - so this cannot disagree with the palette',
    '   clause beside it.',
    '',
    '   A REASON COMES IN TWO FORMS. One run says "4 colours off the palette";',
    '   a folder counts the files each reason held back, and a count in front',
    '   of a reason that carries its own count reads as "1 4 colours off the',
    '   palette" - measured, in this patch\'s first draft. So each reason has a',
    '   `kind` that never carries a number, for counting, and a `text` that',
    '   does, for the one file. */',
    'function fixGateOf(r){',
    '  const on=$("fixgrid")&&$("fixgrid").checked;',
    '  const why=[];',
    '  const no=(kind,text)=>why.push({kind:kind, text:text||kind});',
    '  if(!on) no("it is not saved at "+CANVAS_SIDE);',
    '  else if(r.width!==r.height) no("it is not square");',
    '  else{',
    '    const S=CANVAS_SIDE, w=r.width, at=new Int32Array(S);',
    '    for(let x=0;x<S;x++) at[x]=Math.min(w-1,Math.floor((x+0.5)*w/S));',
    '    let mixed=0;',
    '    for(let by=0;by<S&&!mixed;by+=8) for(let bx=0;bx<S;bx+=8){',
    '      const y0=at[by], y1=at[by+7], x0=at[bx], x1=at[bx+7];',
    '      const i0=(y0*w+x0)*4;',
    '      let flat=true;',
    '      for(let y=y0;y<=y1&&flat;y++) for(let x=x0;x<=x1;x++){',
    '        const i=(y*w+x)*4;',
    '        if(r.data[i]!==r.data[i0]||r.data[i+1]!==r.data[i0+1]||r.data[i+2]!==r.data[i0+2]||r.data[i+3]!==r.data[i0+3]){ flat=false; break; }',
    '      }',
    '      if(!flat){ mixed++; break; }',
    '    }',
    '    if(mixed) no("its 8px blocks are not one colour");',
    '  }',
    '  const n=r.width*r.height;',
    '  const tl=fixTranslucent(r.data,n);',
    '  if(tl.count) no("it has part-transparent pixels",tl.count.toLocaleString()+" part-transparent pixel"+(tl.count===1?"":"s"));',
    '  /* the colours, once, against the palette\'s exact set */',
    '  const pal=paletteRGB(), exact=new Set(pal.map(p=>p.h));',
    '  const seen=new Set();',
    '  let off=0;',
    '  for(let i=0;i<n;i++){',
    '    const o=i*4;',
    '    if(r.data[o+3]===0) continue;',
    '    const key=(r.data[o]<<16)|(r.data[o+1]<<8)|r.data[o+2];',
    '    if(seen.has(key)) continue;',
    '    seen.add(key);',
    '    if(!exact.has("#"+((key>>>0)&0xffffff).toString(16).padStart(6,"0"))) off++;',
    '  }',
    '  if(off) no("it has colours off the palette",off+" colour"+(off===1?"":"s")+" off the palette");',
    '  return {ready:why.length===0, why:why, colours:seen.size, offPalette:off, partial:tl.count};',
    '}',
    '/* THE TRANSLUCENT PIXELS IN A PICTURE, and how the engine will treat them.',
  ]);
}

/* ---- 2. the single run says it ------------------------------------------- */
{
  /* the sentence both paths end with */
  swap('/* THE RESULT, ON SCREEN. Both the detected answer and the scaled-only one', [
    '/* READY, OR THE REASON IT IS NOT, as a clause. Both the engine path and',
    '   scale only end with it, because the question does not depend on which',
    '   one produced the picture. */',
    'function fixGateNote(r){',
    '  const gate=fixGateOf(r);',
    '  return " \\u00b7 "+(gate.ready ? "ready for the collection" : "not ready for the collection: "+gate.why.map(w=>w.text).join(", "));',
    '}',
    '/* THE RESULT, ON SCREEN. Both the detected answer and the scaled-only one',
  ], 'the fixShow comment');
  swap('          +palNote', ['          +palNote', '          +fixGateNote(r)'], 'the palette clause in the final sentence');
  /* scale only returns before that sentence and has its own */
  swap('        +(FIX.decode==="png" ? " kept exactly, byte for byte" : " kept translucent; this file was read by the browser ("+FIX.decodeWhy+"), which rounds their colour") : ""));',
       '        +(FIX.decode==="png" ? " kept exactly, byte for byte" : " kept translucent; this file was read by the browser ("+FIX.decodeWhy+"), which rounds their colour") : "")+fixGateNote(r));', 'the scale-mode sentence');
}

/* ---- 3. the folder run counts them --------------------------------------- */
{
  swap('let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[];',
       'let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[], fixGateReady=0, fixGateWhy=null;', 'the batch counters');
  swap('  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[];',
       '  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[]; fixGateReady=0; fixGateWhy=new Map();', 'the batch reset');
  /* counted where the result is in hand, after the palette is applied */
  const at = onlyIn(BATCH, l => l === '    /* The same canvas the single save uses, so the switch means one thing. */', 'the batch canvas comment');
  kit.replace(L, { start: at, end: at }, [
    '    /* READY FOR THE COLLECTION, counted here: after the palette, which is',
    '       what decides the colour question, and before the canvas, which',
    '       cannot change any of the four facts. */',
    '    { const gt=fixGateOf(out);',
    '      if(gt.ready) fixGateReady++;',
    '      else for(const w of gt.why) fixGateWhy.set(w.kind,(fixGateWhy.get(w.kind)||0)+1); }',
    '    /* The same canvas the single save uses, so the switch means one thing. */',
  ]);
  /* the sentence */
  swap('  const shrunkNote = shrunk.length', [
    '  /* THE ANSWER THE TAB IS OPENED FOR. Every clause above says what the run',
    '     did; this says what the files ARE. The reasons are counted rather than',
    '     listed per file, in the order that holds the most back. */',
    '  const gateNote = fixBatchFiles.length',
    '    ? " \\u00b7 "+fixGateReady+" of "+fixBatchFiles.length+" ready for the collection"',
    '      +(fixGateWhy.size ? " ("+[...fixGateWhy.entries()].sort((a,b)=>b[1]-a[1]).map(([w,n])=>n+" because "+w).join(", ")+")" : "")',
    '    : "";',
    '  const shrunkNote = shrunk.length',
  ], 'the shrunk note');
  const s = kit.only(L, l => l.startsWith('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "') && l.indexOf('+offNote+alphaNote+readNote+shrunkNote+palNote') >= 0, 'the folder sentence');
  kit.replace(L, { start: s, end: s }, [L[s].replace('+offNote+alphaNote+readNote+shrunkNote+palNote', '+offNote+alphaNote+readNote+shrunkNote+palNote+gateNote')]);
}

/* ---- 4. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  for (const s of ['function fixGateOf(r){', 'function fixGateNote(r){', '          +fixGateNote(r)',
    '    { const gt=fixGateOf(out);', '  const gateNote = fixBatchFiles.length', '+shrunkNote+palNote+gateNote']) need(s);
  /* BOTH single paths end with it: the engine path's sentence and scale
     only's, which returns before that sentence and had its own */
  if (code.split('fixGateNote(r)').length !== 4) throw new Error('expected fixGateNote at its definition and both single-run sentences, found ' + (code.split('fixGateNote(r)').length - 1));
  /* the gate is asked of the result, never of the canvas element */
  if (/fixGateOf\(\s*oc/.test(code)) throw new Error('the gate must be asked of the result, not of the canvas');

  /* THE CHECK, EXERCISED: carve it with stand-ins for the page it leans on. */
  const carve = (n) => { const a = lines.findIndex(l => l === 'function ' + n + '(r){' || l === 'function ' + n + '(data,n){'); if (a < 0) throw new Error('cannot carve ' + n); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const constOf = (sig) => { const a = lines.findIndex(l => l.startsWith(sig)); let i = a; while (!/;\s*$/.test(lines[i])) i++; return lines.slice(a, i + 1).join('\n'); };
  const fnOf = (n) => { const a = lines.findIndex(l => l.startsWith('function ' + n + '(')); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const src = 'const CANVAS_SIDE=1280; let PALETTE_RGB=null;\n' + constOf('const PALETTE_HEX=') + '\n'
    + fnOf('paletteList') + '\n' + fnOf('paletteRGB') + '\n'
    + carve('fixTranslucent') + '\n' + carve('fixGateOf') + '\nreturn {fixGateOf, paletteRGB};';
  const T = new Function('$', src)(() => ({ checked: true }));
  const pal = T.paletteRGB();
  /* a result of `cells` square, every pixel a different one of `colours` */
  const make = (cells, colours, alpha) => { const d = new Uint8ClampedArray(cells * cells * 4); for (let i = 0; i < cells * cells; i++) { const c = colours[i % colours.length]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = (alpha && i === 3) ? 128 : 255; } return { data: d, width: cells, height: cells }; };
  const onPal = [pal[3], pal[9], pal[40]].map(p => [p.r, p.g, p.b]);
  let r = T.fixGateOf(make(160, onPal, false));
  if (!r.ready || r.why.length) throw new Error('a 160-cell on-palette result should be ready: ' + JSON.stringify(r));
  /* 80 cells is 16px blocks on the canvas: the library's own checker counts
     zero mixed 8px cells there, and so does this */
  if (!T.fixGateOf(make(80, onPal, false)).ready) throw new Error('16px blocks should pass the 8px block check');
  /* 128 cells is 10px blocks: an 8px block straddles two of them */
  r = T.fixGateOf(make(128, onPal, false));
  if (r.ready || r.why[0].kind !== 'its 8px blocks are not one colour') throw new Error('10px blocks should fail: ' + JSON.stringify(r));
  /* a reason's kind never carries a number, so a folder can count it */
  for (const bad of [T.fixGateOf(make(160, onPal.concat([[1, 2, 3]]), false)), T.fixGateOf(make(160, onPal, true))])
    for (const w of bad.why) if (/\d/.test(w.kind)) throw new Error('a countable reason carries a number: ' + w.kind);
  /* A FINISHED 1280 TRAIT THROUGH SCALE ONLY: whole 8px blocks at 1280,
     which the first draft of this check called "not on the 160 cell grid" */
  const finished = (() => { const S = 1280, d = new Uint8ClampedArray(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = onPal[(((x >> 3) * 5 + (y >> 3) * 3) % onPal.length)], i = (y * S + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } return { data: d, width: S, height: S }; })();
  if (!T.fixGateOf(finished).ready) throw new Error('a finished 1280 trait must pass: ' + JSON.stringify(T.fixGateOf(finished)));
  /* and the same picture drawn in 5px blocks at 1280 must not */
  const five = (() => { const S = 1280, d = new Uint8ClampedArray(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = onPal[(((Math.floor(x / 5)) * 5 + Math.floor(y / 5) * 3) % onPal.length)], i = (y * S + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } return { data: d, width: S, height: S }; })();
  if (T.fixGateOf(five).ready) throw new Error('5px blocks at 1280 must fail the 8px block check');
  r = T.fixGateOf(make(160, onPal.concat([[1, 2, 3]]), false));
  if (r.ready || r.offPalette !== 1) throw new Error('an off-palette colour should fail: ' + JSON.stringify(r));
  r = T.fixGateOf(make(160, onPal, true));
  if (r.ready || r.partial !== 1) throw new Error('a part-transparent pixel should fail: ' + JSON.stringify(r));
  /* a fully transparent pixel is not a colour and not part transparent */
  const clear = make(160, onPal, false); clear.data[7] = 0;
  r = T.fixGateOf(clear);
  if (!r.ready) throw new Error('an empty pixel must not fail the gate: ' + JSON.stringify(r));
});

fs.renameSync(TMP, FILE);
console.log('patch510 written, ' + grew + ' bytes');
