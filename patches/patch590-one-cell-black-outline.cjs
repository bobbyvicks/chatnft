/* FIX PIXELS MAKES THE BLACK OUTLINE ONE CELL THICK.

   Asked for 2026-09-24, about a spiky hair trait: "can you see how im not
   super happy with the way the fix pixels is doing the borders?, i want them
   always to onnly be 1 black square thick and its missing a bunch/ bhnched
   up a bunch to llook like a blob". On that trait, after the fixer, the
   outline was one cell in places and two in others, spike tips were solid
   black clumps, single black cells stuck out as whiskers, and dark teal
   cells sat in the line and broke it.

   THE RULE, patch590-outline-rule.js beside this file, pasted into the page
   as fixOutlineOnce. It works on the fixer's CELL grid after the palette,
   never on canvas pixels (the save-time border rule was removed for working
   on canvas pixels, an eighth of a cell). Per 8-connected part of the
   trait: a part is outlined if it has 200+ cells and at least half of its
   edge against empty space is already black (or 60% black and near-black);
   the canvas edge is not an edge of the drawing. For such a part every edge
   cell becomes pure black, the old second layer of black is peeled back to
   the part's own fill, spikes keep their full length (a spike too thin for
   fill is a one-cell black line), whiskers of 2 cells or fewer go, and
   black line art inside the shape is kept - including a short line that
   divides two different colours. Layers drawn without an outline by design
   are left alone: backgrounds, chains, eyes, mouth, ears. No colour is
   invented; black is on the palette.

   HOW IT WAS CHOSEN. Three designs were built and run on the user's 311
   working traits as the live fixer leaves them (plus their hair); three
   judges chose one; four rounds of fixes and independent verification
   followed (spikes kept, interior line art kept, black always, coloured
   shading kept, dividing lines kept, fringe specks cleaned per clump). On
   all 312: doubled outline cells 35,354 -> 12,012, silhouette changes 37
   cells in total (every one a whisker of 2 cells or fewer), no new colour,
   the skipped layers byte-identical; about 1-2 ms a trait, 24 ms at worst.
   Known and left: Orange Winter Parka's toggle loses its top corner row to
   the jacket's orange (joining its three greys into one clump brought the
   fringe specks back everywhere else), and a few kept dividers are 2-3
   cells thick where the drawing has them so.

   A switch, "One-cell black outline", on by default, beside Colours to
   palette. Not in scale mode (that takes the picture as it is), and not on
   a grid over 512 cells a side, where a cell is not the art's square. Each
   run says how many cells it changed. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
const RULE = fs.readFileSync(path.join(__dirname, 'patch590-outline-rule.js'), 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* The rule and its caller, before the palette step's. */
swap('function fixPalApply(out,rel){', [
  ...RULE,
  '/* THE OUTLINE PASS, on the cell grid, after the palette. Counted for the',
  '   folder note the way the palette is. */',
  'let fixOutlined=0, fixOutlineCells=0;',
  'function fixOutlineWanted(){ const b=$("fixline"); return !!(b&&b.checked)&&fixMode()!=="scale"; }',
  'function fixOutlineApply(out,rel){',
  '  if(!out||!out.data||!fixOutlineWanted()) return null;',
  '  /* A grid this big has one-pixel cells: a cell is not the art\'s square. */',
  '  if(Math.max(out.width,out.height)>512) return null;',
  '  const res=fixOutlineOnce({W:out.width,H:out.height,data:out.data},{layer:fixLayerOf(rel)});',
  '  let n=0; const a=out.data, b=res.data;',
  '  for(let i=0;i<a.length;i+=4) if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3]) n++;',
  '  if(n){ out.data=b; fixOutlined++; fixOutlineCells+=n; }',
  '  return {cells:n};',
  '}',
  'function fixPalApply(out,rel){',
], 'the palette step');

/* The switch, after Colours to palette. */
{
  const i = at('      <input type="checkbox" id="fixpal" checked>', 'the palette switch');
  if (L[i + 1] !== '      <span>Colours to palette</span></label>') throw new Error('the palette label moved');
  kit.replace(L, { start: i + 1, end: i + 1 }, [
    '      <span>Colours to palette</span></label>',
    '    <label class="olrow" style="gap:6px"',
    '      title="Make the black outline exactly one cell thick: close its gaps, thin the doubled parts back to the fill, keep every spike and the line art inside. Only on shapes that are drawn with a black outline; backgrounds, chains, eyes, mouths and ears are left alone.">',
    '      <input type="checkbox" id="fixline" checked>',
    '      <span>One-cell black outline</span></label>',
  ]);
}

/* A single run. */
swap('        const pal=fixPalApply(r,FIX.rel);', [
  '        const pal=fixPalApply(r,FIX.rel);',
  '        const oln=fixOutlineApply(r,FIX.rel);',
], 'the single run palette');
swap('          +palNote', [
  '          +palNote',
  '          +(oln&&oln.cells ? " \\u00b7 outline made one cell thick ("+oln.cells.toLocaleString()+" cell"+(oln.cells===1?"":"s")+" changed)" : "")',
], 'the single run note');

/* A folder. */
swap('      fixPalApply(out,rel);', [
  '      fixPalApply(out,rel);',
  '      fixOutlineApply(out,rel);',
], 'the batch palette');
swap('  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile="";', [
  '  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalWorstFile="";',
  '  fixOutlined=0; fixOutlineCells=0;',
], 'the batch reset');
{
  const i = kit.only(L, l => l.indexOf('fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+') === 0 || l.indexOf('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+') === 0, 'the batch note');
  if (L[i].indexOf('+palNote+') < 0) throw new Error('the batch note has no palNote');
  L[i] = L[i].replace('+palNote+', '+palNote+(fixOutlined?" \\u00b7 "+fixOutlined+" outline"+(fixOutlined===1?"":"s")+" made one cell thick":"")+');
}

kit.save(doc, ({ code }) => {
  if (code.split('fixOutlineApply(').length - 1 !== 3) throw new Error('the definition and two callers');
});
fs.renameSync(TMP, FILE);
console.log('patch590 written');
