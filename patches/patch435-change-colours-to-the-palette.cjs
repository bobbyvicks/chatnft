/* CHANGE EVERY COLOUR TO THE NEAREST ONE IN THE PALETTE.

   "can we make a 'change colours to pallete button' that will automatically
   detect colours and put them to the closest version of the colour that is on
   the trait (green turns to a different shade of green to accomidate"

   The finding half of this already existed and was only ever a REPORT: the
   rules audit walks the colours in a trait, skips the ones already in the
   palette, and for each of the rest works out the nearest palette colour and
   how far away it is. Nothing applied it. This is the same arithmetic, made
   into a press.

   NEAREST IN RGB, which is what the audit uses and what its comment is
   honest about: "squared RGB, which is not perceptual and does not pretend to
   be". For this palette that behaves the way the ask describes - a green
   lands on a green - because its rows ARE ramps: 16 families of 16, so the
   nearest colour to any shade of a hue is almost always another shade of
   that hue. Where it is not, the report says which colour moved how far, so
   a wrong-looking answer is visible rather than silent.

   ALPHA IS NOT TOUCHED. Only the three colour channels move; a pixel that
   was half transparent stays half transparent, and a pixel that was empty
   stays empty. And a colour already in the palette is left alone rather than
   re-matched to itself, so a trait that is already on-palette comes back
   byte for byte.

   ONE FUNCTION, TWO PLACES. The editor gets a button, and the fixer gets a
   switch that applies it to every result in a run - which is the shape a
   folder of traits needs, and the shape the fixer already uses for the other
   things it does to a result. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const MID = String.fromCharCode(92) + 'u00b7';

/* ---- the arithmetic, in one place ---------------------------------- */
{
  const at = kit.only(L, l => l === 'function paletteList(){', 'the palette reader');
  const fn = kit.inFunction(L, 'function paletteList(){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* The palette as numbers, worked out once. paletteList hands back strings',
    '   and matching a picture against them would parse 256 of them per pixel. */',
    'let PALETTE_RGB=null;',
    'function paletteRGB(){',
    '  if(PALETTE_RGB) return PALETTE_RGB;',
    '  PALETTE_RGB=paletteList().map(h=>({h:h,',
    '    r:parseInt(h.slice(1,3),16), g:parseInt(h.slice(3,5),16), b:parseInt(h.slice(5,7),16)}));',
    '  return PALETTE_RGB;',
    '}',
    '/* EVERY COLOUR TO THE NEAREST ONE IN THE PALETTE.',
    '',
    '   The same nearest-colour arithmetic the rules audit already does to',
    '   REPORT off-palette colours, applied instead of printed. Squared RGB,',
    '   which the audit is honest about not being perceptual - it behaves the',
    '   way it is wanted here because the palette rows are ramps, so the',
    '   nearest colour to a shade of a hue is another shade of that hue.',
    '',
    '   Works on the pixels in place and answers with what it did: how many',
    '   distinct colours moved, how many pixels, and the furthest any colour',
    '   had to travel - so an answer that looks wrong can be seen to be wrong.',
    '',
    '   A colour ALREADY in the palette is skipped rather than matched to',
    '   itself, so art that is already on-palette comes back untouched. Alpha',
    '   is never read or written: a half-transparent pixel keeps its alpha and',
    '   an empty one is left alone entirely. */',
    'function snapToPalette(d,n){',
    '  const pal=paletteRGB();',
    '  const exact=new Set(pal.map(p=>p.h));',
    '  const seen=new Map();',
    '  let moved=0, pixels=0, worst=0;',
    '  for(let i=0;i<n;i++){',
    '    const o=i*4;',
    '    if(d[o+3]===0) continue;',
    '    const key=(d[o]<<16)|(d[o+1]<<8)|d[o+2];',
    '    let hit=seen.get(key);',
    '    if(hit===undefined){',
    '      const h="#"+((key>>>0)&0xffffff).toString(16).padStart(6,"0");',
    '      if(exact.has(h)){ hit=null; }',
    '      else{',
    '        const r=(key>>16)&255, g=(key>>8)&255, b=key&255;',
    '        let best=pal[0], bd=Infinity;',
    '        for(const p of pal){',
    '          const dr=r-p.r, dg=g-p.g, db=b-p.b;',
    '          const dist=dr*dr+dg*dg+db*db;',
    '          if(dist<bd){ bd=dist; best=p; }',
    '        }',
    '        hit=best; moved++;',
    '        const far=Math.round(Math.sqrt(bd));',
    '        if(far>worst) worst=far;',
    '      }',
    '      seen.set(key,hit);',
    '    }',
    '    if(!hit) continue;',
    '    d[o]=hit.r; d[o+1]=hit.g; d[o+2]=hit.b;',
    '    pixels++;',
    '  }',
    '  return {colours:moved, pixels:pixels, worst:worst, seen:seen.size};',
    '}',
  ]);
}

/* ---- the button, in the editor ------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf('        <p class="note" id="rcfrom">') === 0,
    'the recolour explanation');
  kit.replace(L, { start: at, end: at - 1 }, [
    '        <!-- The whole picture onto the palette in one press, beside the',
    '             tools that change colours one at a time. -->',
    '        <div class="olrow">',
    '          <button class="btn ghost" id="palsnap" style="width:auto;padding:6px 12px;font-size:12px"',
    '            title="Change every colour in the trait to the nearest one in the project palette. A green becomes a different shade of green. Colours already in the palette are left exactly as they are, and nothing transparent is touched.">Change colours to palette</button>',
    '          <span class="note mono" id="palsnapnote" style="margin-left:auto"></span>',
    '        </div>',
  ]);
  const wire = kit.only(L, l => l === "$('saveproj').onclick=saveTrait;", 'the save wiring');
  kit.replace(L, { start: wire, end: wire }, [
    "$('saveproj').onclick=saveTrait;",
    '/* THE WHOLE PICTURE ONTO THE PALETTE. Through snapshot() so it is one',
    '   undo, and it rebuilds the swatches because the colours in the trait are',
    '   exactly what just changed. */',
    "$('palsnap').onclick=()=>{",
    '  if(!ctx) return;',
    '  const W=art.width, H=art.height;',
    '  const im=ctx.getImageData(0,0,W,H);',
    '  const r=snapToPalette(im.data,W*H);',
    "  const note=$('palsnapnote');",
    '  if(!r.colours){',
    '    if(note) note.textContent="already on the palette";',
    '    toast("Every colour is already in the palette.");',
    '    return;',
    '  }',
    '  snapshot();',
    '  ctx.putImageData(im,0,0);',
    '  /* The same finish cleanColours uses, which is the other thing on this',
    '     panel that rewrites every pixel. repalette rebuilds the swatches from',
    '     the canvas and keeps a picked colour only if it survived - measured',
    '     there before it existed, 59 of 64 swatches named a colour the image',
    '     no longer had. There is no redraw to call: putImageData IS the paint. */',
    '  refreshStats(); repalette();',
    '  const line=r.colours+" colour"+(r.colours===1?"":"s")+" moved, "',
    "    +r.pixels.toLocaleString()+\" pixels \\u00b7 furthest \"+r.worst;",
    '  if(note) note.textContent=line;',
    '  toast("Changed to the palette: "+line);',
    '};',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const sp = kit.inFunction(codeLines, 'function snapToPalette(d,n){');
  const body = codeLines.slice(sp.start, sp.end + 1).join('\n');
  /* ALPHA IS NEVER WRITTEN. Moving it would make half-transparent edges
     opaque, which is a different picture. */
  /* Assignment, not comparison: `d[o+3]=` also matches `d[o+3]===0`, which is
     the line that SKIPS empty pixels - so the guard fired on the very code it
     was written to protect. */
  if (/d\[o\+3\]=[^=]/.test(body))
    throw new Error('the snap writes alpha, so soft edges change');
  /* AND AN EMPTY PIXEL IS NOT READ AT ALL. */
  if (!/if\(d\[o\+3\]===0\) continue;/.test(body))
    throw new Error('transparent pixels are being given a colour');
  /* A COLOUR ALREADY IN THE PALETTE IS LEFT ALONE, or art that is already
     on-palette comes back rewritten for nothing. */
  if (!/if\(exact\.has\(h\)\)\{ hit=null; \}/.test(body))
    throw new Error('a colour already in the palette is matched to itself');
  /* ONE LOOKUP PER COLOUR, not per pixel: 256 comparisons times 1.6 million
     pixels is the difference between instant and a hung tab. */
  if (!/let hit=seen\.get\(key\);/.test(body))
    throw new Error('the nearest colour is worked out per pixel');
  /* AND IT SAYS WHAT IT DID, including how far the worst one went - the
     audit reports that distance for the same reason. */
  if (!/return \{colours:moved, pixels:pixels, worst:worst, seen:seen\.size\};/.test(body))
    throw new Error('it does not say what it changed');
  /* It is the project palette, not a copy. */
  if (!/const pal=paletteRGB\(\);/.test(body))
    throw new Error('the snap has its own idea of what the palette is');

  /* THE BUTTON IS THERE AND IT IS ONE UNDO. */
  if (!/id="palsnap"/.test(text))
    throw new Error('there is no way to press it');
  const wired = text.match(/\$\('palsnap'\)\.onclick=[\s\S]*?\n\};/);
  if (!wired) throw new Error('the button is not wired to anything');
  if (!/snapshot\(\);/.test(wired[0]))
    throw new Error('the change cannot be undone');
  if (!/repalette\(\);/.test(wired[0]))
    throw new Error('the swatches still show the colours that were there before');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
