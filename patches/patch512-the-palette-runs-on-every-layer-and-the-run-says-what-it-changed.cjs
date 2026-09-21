/* THE PALETTE RUNS ON EVERY LAYER, AND THE RUN SAYS WHAT IT CHANGED.

   DECISION P2, the second the accuracy report left open. "Colours to
   palette" is on by default and rewrites every colour to the nearest in
   the project palette. The page's rules carry cleanupExcluded:
   ["skins","backgrounds"], the snap runs on those layers anyway - all 32
   skins and 45 of 47 backgrounds - and since patch503 the folder note has
   said so, in these words:

     " - including N from layers the agent rules leave out of cleanup
       (skins, backgrounds)"

   THE SNAP KEEPS RUNNING ON EVERY LAYER, and that sentence goes, because
   it is not true of the palette.

   First, what the exclusion is about. ruleCleanupAllowed has exactly one
   caller in the whole page - this counter - and the agent panel line that
   prints the list. Nothing else consults it, so it has never gated any
   pixel operation; it is a note about which layers the agent's own cleanup
   pass has been let loose on. The library's workflow file puts "cleanup"
   beside the modal fill ("Preserve fine text/logos unless targeted for
   cleanup"), and the one line that names the palette in the same breath
   makes them separate operations covered by one protected-area selection.
   The sentence read a note about one pass as a prohibition on another.

   Second, what obeying it would cost. The collection's gate has no layer
   exemption - fixGateOf asks the same four questions of every file - and
   45 of 47 backgrounds and all 32 skins need the snap to pass the colour
   one. A per-layer exemption would ship 79 traits that the tab's own gate
   line prints "not ready for the collection" against forever, by
   configuration. It could not even be applied consistently: fixPalApply is
   called from two places and the layer comes from the file's folder, which
   a loose file dropped on the page does not have, so the same skin would
   be snapped or not depending on how it was opened.

   WHAT REPLACES THE SENTENCE. Not silence: the honest version of what it
   was reaching for. The snap already returns the furthest any colour
   moved, and a folder run prints the furthest across the whole run - but
   not WHICH picture that was, which is the one thing you would act on. And
   `worst` is a maximum over distinct colours regardless of how much of the
   picture each covers, so a run can print a large number for a colour on
   four cells and say nothing about a skin whose whole face moved. So:
     - snapToPalette also counts the opaque pixels it saw, and returns the
       share of the picture it rewrote;
     - a single run says that share;
     - a folder run names the picture that moved furthest, with its number.
   The counter and its clause go with the sentence.

   Nothing about any output file changes. The snap already ran on all 79. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const swap = (from, to, name) => { const at = kit.only(L, l => l === from, name); kit.replace(L, { start: at, end: at }, Array.isArray(to) ? to : [to]); };

/* ---- 1. the snap counts what it saw -------------------------------------- */
{
  /* three functions hold `const count=new Map();`, so anchor inside
     snapToPalette by the comment that precedes this one */
  const fn = kit.inFunction(L, 'function snapToPalette(d,n){');
  const cen = kit.only(L, l => l === '  const count=new Map();', 'the colour census', fn);
  kit.replace(L, { start: cen, end: cen }, [
    '  const count=new Map();',
    '  /* THE OPAQUE PIXELS, so the run can say how much of the picture moved.',
    '     `worst` is a maximum over DISTINCT colours and knows nothing about',
    '     area: a colour on four cells can set it while a skin whose whole face',
    '     moved sets nothing. */',
    '  let opaque=0;',
  ]);
  /* the census skip, not the rewrite loop's: the one inside the range that
     still begins the counting loop */
  const skip = kit.only(L, (l, i) => l === '    if(d[o+3]===0) continue;'
    && L[i + 1] === '    const key=(d[o]<<16)|(d[o+1]<<8)|d[o+2];'
    && L[i + 2] === '    count.set(key,(count.get(key)||0)+1);', 'the census skip');
  kit.replace(L, { start: skip, end: skip }, [
    '    if(d[o+3]===0) continue;',
    '    opaque++;',
  ]);
  swap('  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst};',
       '  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst, opaque:opaque, share:opaque?pixels/opaque:0};',
       'the snap return');
}

/* ---- 2. the counter for a rule that does not say what it was read to say -- */
{
  swap('let fixPalWorst=0, fixPalMerged=0, fixPalExcluded=0;', [
    '/* THE PICTURE THAT MOVED FURTHEST, BY NAME. Replaces a count of files',
    '   "from layers the agent rules leave out of cleanup (skins, backgrounds)",',
    '   which read a note about the agent\'s own cleanup pass as a prohibition on',
    '   the palette. ruleCleanupAllowed had exactly one caller - that counter -',
    '   so it had never gated any pixel operation; the collection\'s gate has no',
    '   layer exemption; and obeying it would have shipped 79 traits the gate',
    '   line calls not ready, forever, by configuration. Decided 2026-09-21.',
    '',
    '   What the sentence was reaching for is here instead: the run prints the',
    '   furthest any colour moved, and now says in WHICH picture, which is the',
    '   one thing anybody would act on. */',
    'let fixPalWorst=0, fixPalMerged=0, fixPalWorstFile="";',
  ], 'the palette tallies');
  const at = kit.only(L, l => l === '    if(r.worst>fixPalWorst) fixPalWorst=r.worst;', 'the worst tally');
  kit.replace(L, { start: at, end: at }, ['    if(r.worst>fixPalWorst){ fixPalWorst=r.worst; fixPalWorstFile=String(rel||""); }']);
  const ex = kit.only(L, l => l === '    const layer=rel?readPath(String(rel)).layer:null;', 'the layer read');
  if (L[ex + 1] !== '    if(layer&&!ruleCleanupAllowed(layer)) fixPalExcluded++;') throw new Error('the excluded counter is not where this expects');
  kit.replace(L, { start: ex, end: ex + 1 }, []);
  swap('  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalExcluded=0;',
       '  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile="";', 'the palette reset');
}

/* ---- 3. what the single run says ----------------------------------------- */
{
  const at = kit.only(L, l => l === '          ? " \\u00b7 "+pal.colours+" colour"+(pal.colours===1?"":"s")+" moved to the palette - the furthest by "', 'the single palette clause');
  kit.replace(L, { start: at, end: at }, [
    '          ? " \\u00b7 "+pal.colours+" colour"+(pal.colours===1?"":"s")+" moved to the palette, "',
    '            +Math.round(pal.share*100)+"% of the picture - the furthest by "',
  ]);
}

/* ---- 4. what the folder run says ----------------------------------------- */
{
  const at = kit.only(L, l => l === '      +(fixPalExcluded?" - including "+fixPalExcluded+" from layers the agent rules leave out of cleanup (skins, backgrounds)":"")', 'the excluded clause');
  kit.replace(L, { start: at, end: at }, [
    '      +(fixPalFiles>1&&fixPalWorstFile?"; furthest in "+fixPalWorstFile:"")',
  ]);
}

/* ---- 5. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  never('fixPalExcluded');
  never('leave out of cleanup (skins, backgrounds)');
  for (const s of ['  let opaque=0;', '    opaque++;', 'opaque:opaque, share:opaque?pixels/opaque:0};',
    'let fixPalWorst=0, fixPalMerged=0, fixPalWorstFile="";', '    if(r.worst>fixPalWorst){ fixPalWorst=r.worst; fixPalWorstFile=String(rel||""); }',
    '            +Math.round(pal.share*100)+"% of the picture - the furthest by "',
    '      +(fixPalFiles>1&&fixPalWorstFile?"; furthest in "+fixPalWorstFile:"")']) need(s);
  /* the snap is NOT gated on the layer anywhere */
  if (/ruleCleanupAllowed\s*\(/.test(code.slice(code.indexOf('function fixPalApply')))) {
    const after = code.slice(code.indexOf('function fixPalApply'), code.indexOf('function fixPalApply') + 900);
    if (after.indexOf('ruleCleanupAllowed') >= 0) throw new Error('the palette is still gated on the layer');
  }
  /* ruleCleanupAllowed survives for the agent panel, which is what it is for */
  need('function ruleCleanupAllowed(layer){');
  need('PB.cleanupAllowed=function(layer){ return ruleCleanupAllowed(layer); };');

  /* THE SHARE, EXERCISED: a picture where a known fraction of the opaque
     pixels hold an off-palette colour must report that fraction. */
  const carve = (n) => { const a = lines.findIndex(l => l.startsWith('function ' + n + '(')); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const constOf = (sig) => { const a = lines.findIndex(l => l.startsWith(sig)); let i = a; while (!/;\s*$/.test(lines[i])) i++; return lines.slice(a, i + 1).join('\n'); };
  const src = 'let PALETTE_RGB=null;\n' + ['const PALETTE_HEX=', 'const SNAP_GROUP_DE=', 'const SNAP_GROUP_MAX='].map(constOf).join('\n') + '\n'
    + ['paletteList', 'paletteRGB', 'labOf', 'deltaE2000', 'deltaWord', 'nearestPaletteColour', 'snapToPalette'].map(carve).join('\n')
    + '\nreturn {snapToPalette, paletteRGB};';
  const T = new Function(src)();
  const pal = T.paletteRGB();
  const n = 1000, d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const off = i < 250;                       /* a quarter off the palette */
    const c = off ? [1, 2, 3] : [pal[7].r, pal[7].g, pal[7].b];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = (i >= 900) ? 0 : 255;       /* a hundred fully transparent */
  }
  const r = T.snapToPalette(d, n);
  if (r.opaque !== 900) throw new Error('opaque should be 900, got ' + r.opaque);
  if (r.pixels !== 250) throw new Error('rewritten should be 250, got ' + r.pixels);
  if (Math.abs(r.share - 250 / 900) > 1e-9) throw new Error('share should be 250/900, got ' + r.share);
  /* on-palette art reports nothing moved and a share of zero */
  const clean = new Uint8ClampedArray(40 * 4);
  for (let i = 0; i < 40; i++) { clean[i * 4] = pal[7].r; clean[i * 4 + 1] = pal[7].g; clean[i * 4 + 2] = pal[7].b; clean[i * 4 + 3] = 255; }
  const r2 = T.snapToPalette(clean, 40);
  if (r2.share !== 0 || r2.colours !== 0) throw new Error('on-palette art must report nothing: ' + JSON.stringify(r2));
});

fs.renameSync(TMP, FILE);
console.log('patch512 written, ' + grew + ' bytes');
