/* THE PALETTE NOTE COUNTS; IT DOES NOT SEARCH.

   Found 2026-09-22 by the discovery pass, ranked fourth of 39, measured by
   four probes. After every change to the colours - opening a trait, every
   stroke, undo, redo, fill, recolour, outline - buildPalette ends in
   palOffNote, which runs specCheck over the whole canvas, and specCheck ran
   a CIEDE2000 nearest-palette search (256 distances, and the palette's Lab
   triples rebuilt each time) for EVERY distinct colour not in the palette.
   The note prints two counts. The nearest colours were thrown away.
   Measured: New York Twin Towers Skyline (77,427 colours) took 12.3 s to
   open, center.png (1,014,063 colours) 147 s; a stroke on Purple Camo Shark
   Hoodie froze the page 9.3 s, 40 s at phone speed. 54 of the 311 traits
   carry over 5,000 colours. About 135 us per colour, and 97% of the freeze.

   specCheck now finds the nearest palette colour only for the colours that
   cover the most pixels - SPEC_NEAREST of them, sorted by pixel count - with
   the palette's Lab triples built once. That is every colour anybody reads
   a nearest for: the agent panel names the single worst offender, and a
   person repairs from the top of the list. The rest carry nearest:null and
   distance:null, and the result says how many were searched (nearestFor),
   so an agent reading PB.spec() can tell a colour with no suggestion from a
   colour with no answer. The counts the note prints are unchanged. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const fnR = () => kit.inFunction(L, 'function specCheck(data,W,H,layer){');

{
  const fn = fnR();
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* HOW MANY OFF-PALETTE COLOURS GET A NEAREST SUGGESTION: the ones covering',
    '   the most pixels. The search is 256 CIEDE2000 distances a colour, and run',
    '   for every colour it froze the editor for 12 s on a 77,427-colour trait',
    '   and 147 s on a 1,014,063-colour one - on every open and every stroke,',
    '   for a note that prints two counts. Nobody reads past the top of the list. */',
    'const SPEC_NEAREST=12;',
    'function specCheck(data,W,H,layer){',
  ]);
}
{
  const fn = fnR();
  const i = at('    const r=(k>>16)&255, g=(k>>8)&255, b=k&255;', 'the search', fn);
  const want = [
    '    const r=(k>>16)&255, g=(k>>8)&255, b=k&255;',
    '    const near=nearestPaletteColour(r,g,b);',
    '    off.push({hex:h, pixels:n, nearest:near.hex, distance:Math.round(near.dE)});',
    '  }',
    '  off.sort((a,b)=>b.pixels-a.pixels);',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the search moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '    /* Counted here; searched below, for the top of the list only. */',
    '    off.push({hex:h, key:k, pixels:n, nearest:null, distance:null});',
    '  }',
    '  off.sort((a,b)=>b.pixels-a.pixels);',
    '  const nearestFor=Math.min(SPEC_NEAREST,off.length);',
    '  if(nearestFor){',
    '    const pal=paletteRGB(), palLab=pal.map(p=>labOf(p.r,p.g,p.b));',
    '    for(let j=0;j<nearestFor;j++){',
    '      const k=off[j].key;',
    '      const near=nearestPaletteColour((k>>16)&255,(k>>8)&255,k&255,pal,palLab);',
    '      off[j].nearest=near.hex; off[j].distance=Math.round(near.dE);',
    '    }',
    '  }',
    '  for(const o of off) delete o.key;',
  ]);
}
swap('    offPalette:off, offPaletteColours:off.length,', ['    offPalette:off, offPaletteColours:off.length, nearestFor:nearestFor,'], 'the result', fnR());

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('const SPEC_NEAREST=12;');
  once('nearestFor:nearestFor');
  const a = code.indexOf('function specCheck(data,W,H,layer){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  if ((body.match(/nearestPaletteColour\(/g) || []).length !== 1) throw new Error('specCheck searches in more than one place');
  const loop = body.indexOf('for(const [k,n] of used){'), sort = body.indexOf('off.sort(');
  if (body.indexOf('nearestPaletteColour(') < sort) throw new Error('the search is still inside the per-colour loop');
  if (loop < 0) throw new Error('the colour loop moved');
});

fs.renameSync(TMP, FILE);
console.log('patch534 written, ' + grew + ' bytes');
