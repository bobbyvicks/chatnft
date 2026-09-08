/* PIXEL SIZE: what this art is drawn at, and putting it back on that grid.

   The ask was "resize everything to 4x4 or 8x8 so the collection lines up on
   one grid". Measuring all 317 traits first says that cannot be done:

     151 traits are drawn at 10px blocks, plus 31 at 40, 15 at 20 and 31 at 5
      34 at 8px - which is every skin in the collection
      42 with no block structure at all, mostly backgrounds

   4 and 8 do not divide 10. Moving those 151 onto an 8 grid means rescaling
   128 blocks across to 160, so each drawn pixel becomes one and a quarter
   pixels - the smear that pixel art exists to avoid. A tool that offered only
   4 and 8 would quietly mangle half the collection.

   So the tool measures first and says what it found, and the operation it
   offers is the one that is actually needed: TIDY THE ART ONTO THE GRID IT IS
   ALREADY ON. 31 of the 317 are between 90% and 98% flat at their own block
   size - drawn on the grid, with strays from hand edits breaking it. Those are
   the files that stop a collection lining up, and flattening each block to its
   own dominant colour is a repair rather than a resample.

   4 and 8 are in the list, as asked. Choosing one for art that is not on it
   says so before anything is touched, with the number of pixels it would
   change, rather than refusing or pretending.

   MODE, not median. A block is nearly all one colour with a few strays, so the
   most common colour IS the cell. The median of a block split between two
   colours can land on whichever the sort puts in the middle; the mode picks
   the one more of the block agrees with. Alpha is part of the identity, so a
   half-transparent block resolves the same way rather than by a second rule.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the row ---------------------------------------------------------- */
swap(block([
  '      <div class="savebar btnrow">',
  '        <button class="btn ghost" id="rsgo">Resize</button>',
]), block([
  '      <div class="olrow"><label for="blksize">Pixel size</label>',
  '        <select id="blksize" style="flex:1"',
  '          title="How big one drawn pixel is, in canvas pixels. The art is measured when it opens and the size it is drawn at is marked."></select>',
  '        <button class="btn ghost" id="blktidy"',
  '          style="width:auto;padding:6px 12px;font-size:12px;margin-left:4px"',
  '          title="Make every block one colour - the colour most of the block already is. This repairs art that is drawn on a grid but has stray pixels off it; it does not rescale anything, and the canvas does not change.">Tidy</button></div>',
  '      <div class="savebar btnrow">',
  '        <button class="btn ghost" id="rsgo">Resize</button>',
]));

swap(block([
  '      <p class="note"><span class="mono" id="rsnow">-</span></p>',
]), block([
  '      <p class="note"><span class="mono" id="rsnow">-</span></p>',
  '      <p class="note"><span class="mono" id="blknow">-</span></p>',
]));

/* ---- 2. the measurement and the repair ---------------------------------- */
swap(block([
  '/* Rounded to the nearest whole multiple, never to zero. */',
]), block([
  '/* WHAT THIS ART IS DRAWN AT, block by block.',
  '',
  '   measuredBlock already estimates the period from the transitions, which is',
  '   the right instrument for "what size is this" and says nothing about how',
  '   well the art keeps to it. This is the second question: of the blocks at',
  '   that size, how many are actually ONE colour, and how many pixels would',
  '   change if the rest were made to be.',
  '',
  '   Measured across the real 317: 151 traits keep a 10px grid, 34 keep an 8px',
  '   one, and 31 sit between 90% and 98% - drawn on a grid with hand edits',
  '   breaking it. That middle group is what this is for.',
  '',
  '   MODE, not median. A block is nearly all one colour with a few strays, so',
  '   the colour most of the block already is IS the cell. Alpha is part of the',
  '   key, so a mostly-transparent block resolves by the same rule as any',
  '   other rather than needing a second one. */',
  'const pxKey=(d,i)=>(d[i]<<24>>>0)+(d[i+1]<<16)+(d[i+2]<<8)+d[i+3];',
  '/* THE FLAT CASE PAYS NOTHING. Nearly every block already is one colour -',
  '   98% of them on the real collection - so the common path compares against',
  '   the first pixel and allocates no counter at all. Without this a report',
  '   that runs whenever a trait opens costs a Map operation per pixel, 1.6',
  '   million of them on a 1280 canvas, and would be felt on every open. */',
  'function blockTop(d,W,n,bx,by){',
  '  const first=pxKey(d,(by*W+bx)*4);',
  '  let same=true;',
  '  for(let y=by;y<by+n&&same;y++) for(let x=bx;x<bx+n;x++)',
  '    if(pxKey(d,(y*W+x)*4)!==first){ same=false; break; }',
  '  if(same) return {flat:true, top:first, n:n*n};',
  '  const count=new Map();',
  '  let top=first, topN=0;',
  '  for(let y=by;y<by+n;y++) for(let x=bx;x<bx+n;x++){',
  '    const k=pxKey(d,(y*W+x)*4);',
  '    const c=(count.get(k)||0)+1;',
  '    count.set(k,c);',
  '    if(c>topN){ topN=c; top=k; }',
  '  }',
  '  /* THE SAME QUESTION, ANSWERED THE SAME WAY ON BOTH PATHS. A flat block',
  '     only ever reached the fast path, so this used to hard-code flat:false -',
  '     true in practice and false as a statement, which left the whole report',
  '     resting on the fast path being unreachable-if-wrong. A mutation that',
  '     turned the fast path off, predicted to change nothing, reddened three',
  '     tests and said so. */',
  '  return {flat:count.size===1, top:top, n:topN};',
  '}',
  'function blockPlan(d,W,H,n){',
  '  n=Math.max(1,Math.round(n||1));',
  '  if(n<2) return {n:1, blocks:0, flat:0, pixels:0, share:1};',
  '  let blocks=0, flat=0, pixels=0;',
  '  for(let by=0;by+n<=H;by+=n) for(let bx=0;bx+n<=W;bx+=n){',
  '    blocks++;',
  '    const b=blockTop(d,W,n,bx,by);',
  '    if(b.flat){ flat++; continue; }',
  '    pixels+=n*n-b.n;',
  '  }',
  '  return {n:n, blocks:blocks, flat:flat, pixels:pixels,',
  '    share:blocks?flat/blocks:1};',
  '}',
  '/* The repair itself: every block becomes the colour most of it already is.',
  '   Same canvas, same size, same block positions - only the strays move. */',
  'function tidyBlocks(d,W,H,n){',
  '  n=Math.max(1,Math.round(n||1));',
  '  if(n<2) return {blocks:0, pixels:0};',
  '  let touched=0, pixels=0;',
  '  for(let by=0;by+n<=H;by+=n) for(let bx=0;bx+n<=W;bx+=n){',
  '    const win=blockTop(d,W,n,bx,by);',
  '    if(win.flat) continue;',
  '    touched++;',
  '    const top=win.top;',
  '    const r=(top>>>24)&255, g=(top>>>16)&255, b=(top>>>8)&255, a=top&255;',
  '    for(let y=by;y<by+n;y++) for(let x=bx;x<bx+n;x++){',
  '      const i=(y*W+x)*4;',
  '      if(d[i]===r&&d[i+1]===g&&d[i+2]===b&&d[i+3]===a) continue;',
  '      d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=a; pixels++;',
  '    }',
  '  }',
  '  return {blocks:touched, pixels:pixels};',
  '}',
  '/* The sizes worth offering: whatever the art is drawn at, the two the',
  '   collection work asked for, and the rest of the ladder. Only sizes that',
  '   divide the canvas, because a block that runs off the edge is not a block',
  '   this can reason about. */',
  'function pixelSizes(measured,W,H){',
  '  const want=[2,4,5,8,10,16,20,32,40];',
  '  if(measured>1) want.push(Math.round(measured));',
  '  return [...new Set(want)].filter(n=>n>=2&&W%n===0&&H%n===0)',
  '    .sort((a,b)=>a-b);',
  '}',
  'function buildPixelSizes(prefer){',
  '  const sel=$("blksize"); if(!sel||!art||!art.width) return;',
  '  const keep=sel.value;',
  '  const m=Math.max(1,gridBlock|0);',
  '  sel.innerHTML="";',
  '  for(const n of pixelSizes(m,art.width,art.height)){',
  '    const o=document.createElement("option");',
  '    o.value=String(n);',
  '    /* The one the art is on is named, not left to be worked out from a',
  '       number in another panel. */',
  '    o.textContent=n+"px"+(n===m?" (this art)":"");',
  '    sel.appendChild(o);',
  '  }',
  '  /* A PREFERENCE BEATS WHAT IS SITTING THERE. The row is built once inside',
  '     startEditor, when gridBlock is still 1 and the measurement has not',
  '     arrived, so the box falls back to the smallest size on the list. On the',
  '     rebuild that follows the measurement that fallback looks exactly like a',
  '     size somebody chose - so 10px art was reported at 2px, correctly and',
  '     uselessly, until a test asked what the box said. */',
  '  const has=v=>[...sel.options].some(o=>o.value===String(v));',
  '  sel.value = (prefer&&has(prefer)) ? String(prefer)',
  '    : (has(keep) ? keep',
  '      : (has(m) ? String(m)',
  '        : (sel.options[0]?sel.options[0].value:"")));',
  '}',
  '/* SAID BEFORE ANYTHING IS TOUCHED. How much of the art already keeps the',
  '   chosen grid, and how many pixels the repair would move.',
  '',
  '   And whether the chosen size lines up with the one the art is drawn at at',
  '   all: 8 into 10 is not a tidy, it is a different picture, and the panel',
  '   says so rather than doing it quietly. */',
  'function pixelSizeReport(){',
  '  const el=$("blknow"); if(!el) return;',
  '  if(!art||!art.width||!ctx){ el.textContent="-"; el.title=""; return; }',
  '  const sel=$("blksize");',
  '  const n=Math.max(0,parseInt(sel&&sel.value,10)||0);',
  '  const m=Math.max(1,gridBlock|0);',
  '  const drawn = m>1 ? "Drawn at "+m+"px" : "No block grid found: this art is one pixel per pixel";',
  '  if(!n){ el.textContent=drawn; el.title=""; return; }',
  '  let plan=null;',
  '  try{ plan=blockPlan(ctx.getImageData(0,0,art.width,art.height).data,',
  '    art.width,art.height,n); }catch(_){ }',
  '  if(!plan){ el.textContent=drawn; el.title=""; return; }',
  '  const pc=(plan.share*100).toFixed(plan.share>0.999?0:1);',
  '  const bits=[drawn];',
  '  bits.push(pc+"% of "+n+"px blocks are one colour");',
  '  if(plan.pixels) bits.push("Tidy would change "+plan.pixels+" pixel"',
  '    +(plan.pixels===1?"":"s")+" in "+(plan.blocks-plan.flat)+" block"',
  '    +((plan.blocks-plan.flat)===1?"":"s"));',
  '  else bits.push("nothing to tidy");',
  '  el.textContent=bits.join("  \\u00b7  ");',
  '  /* THE ONE THING A PERCENTAGE CANNOT SAY: what this size would do to art',
  '     that is not on it. Three cases, and the first version of this only',
  '     covered one of them - found by opening a real trait rather than a',
  '     fixture, drawn at 5px, where choosing 10 warned about nothing and',
  '     offered to change 38,739 pixels.',
  '',
  '       FINER  (5 into 10px art) - safe. A finer grid holds the art exactly,',
  '              so the tidy can only take strays out.',
  '       COARSER (10 on 5px art)  - merges four cells into one and throws the',
  '              detail away. Silence here reads as approval.',
  '       NEITHER (8 on 10px art)  - not a tidy at all, a different picture. */',
  '  el.title = (m<2||n===m) ? ""',
  '    : ((n%m && m%n)',
  '      ? n+" does not divide the "+m+"px this art is drawn at, so tidying at "',
  '        +n+" would redraw the art rather than clean it."',
  '      : (n>m',
  '        ? n+" is coarser than the "+m+"px this art is drawn at: tidying at "',
  '          +n+" merges "+((n/m)*(n/m))+" cells into one and loses that detail."',
  '        : ""));',
  '}',
  '/* Rounded to the nearest whole multiple, never to zero. */',
]));

/* ---- 3. the panel keeps up ---------------------------------------------- */
swap(block([
  '  const n=$("rsnow"); if(n) n.textContent=art.width+" \\u00d7 "+art.height;',
  '  resizePreview();',
  '}',
]), block([
  '  const n=$("rsnow"); if(n) n.textContent=art.width+" \\u00d7 "+art.height;',
  '  resizePreview();',
  '  /* Here rather than in the render loop: this runs when a trait opens, when',
  '     the mode changes and after an undo, and NOT on every stroke - a pass',
  '     over 1.6 million pixels on each one would be felt. */',
  '  try{ buildPixelSizes(); pixelSizeReport(); }catch(_){ }',
  '}',
]));

/* ---- 3b. AND WHEN THE MEASUREMENT ARRIVES -------------------------------
   startEditor resets gridBlock to 1 by design and the caller sets it after,
   so the report that runs inside startEditor's own resizeBoxes reads 1 and
   says "no block grid found" about art that has one. adoptBlock is the single
   place that knows the measurement landed, which is why it is where the two
   are kept in step. */
swap(block([
  'function adoptBlock(b){',
  '  gridBlock=(b&&b>=1.5)?Math.round(b):1;',
  '  if(brushAuto) setBrush(gridBlock);',
  '  return gridBlock;',
  '}',
]), block([
  'function adoptBlock(b){',
  '  gridBlock=(b&&b>=1.5)?Math.round(b):1;',
  '  if(brushAuto) setBrush(gridBlock);',
  '  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }',
  '  return gridBlock;',
  '}',
]));

/* ---- 4. wired ------------------------------------------------------------ */
swap(block([
  "$('rssnap').onclick=()=>{ toggle('rssnap'); resizePreview(); };",
]), block([
  "$('rssnap').onclick=()=>{ toggle('rssnap'); resizePreview(); };",
  "if($('blksize')) $('blksize').onchange=()=>pixelSizeReport();",
  '/* Snapshot first, like every other operation that rewrites the canvas, so',
  '   one press of undo puts the strays back. */',
  "if($('blktidy')) $('blktidy').onclick=()=>{",
  '  if(!art||!art.width||!ctx) return;',
  "  const n=Math.max(0,parseInt($('blksize').value,10)||0);",
  '  if(n<2){ toast("Choose a pixel size first"); return; }',
  '  const im=ctx.getImageData(0,0,art.width,art.height);',
  '  const r=tidyBlocks(im.data,art.width,art.height,n);',
  '  if(!r.pixels){ toast("Every "+n+"px block was already one colour"); return; }',
  '  snapshot();',
  '  ctx.putImageData(im,0,0);',
  '  refreshStats(); repalette(); resizeBoxes();',
  '  toast("Tidied "+r.blocks+" block"+(r.blocks===1?"":"s")+" to the "+n',
  '    +"px grid: "+r.pixels+" pixel"+(r.pixels===1?"":"s")+" changed");',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* THE REPORT HEARS ABOUT THE MEASUREMENT. Without this it runs inside
   startEditor with gridBlock still 1 and calls every trait native art. */
if (code.indexOf('  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }') < 0)
  throw new Error('adoptBlock does not refresh the pixel size row');
for (const s of ['function blockPlan(d,W,H,n){', 'function tidyBlocks(d,W,H,n){',
  'function pixelSizes(measured,W,H){', 'function pixelSizeReport(){',
  "if($('blksize')) $('blksize').onchange=()=>pixelSizeReport();"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['blksize', 'blktidy', 'blknow'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* IT SAYS BEFORE IT DOES. A repair that reports only afterwards is one you
   agree to without knowing its size. */
const rStart = code.indexOf('function pixelSizeReport(){');
if (rStart < 0) throw new Error('could not find pixelSizeReport');
/* A FIXED WINDOW, not a comment marker. kit.code() strips comments, so
   bounding a slice on one finds nothing and silently slices to the end of the
   file - which makes every check below pass against the whole script. Third
   time this file has paid for that. */
const report = code.slice(rStart, rStart + 1600);
if (report.indexOf('function pixelSizeReport(){') !== 0)
  throw new Error('the window does not start at the function');
if (report.indexOf('Tidy would change ') < 0)
  throw new Error('the report does not say what the repair would cost');
if (report.indexOf('does not divide the ') < 0)
  throw new Error('the report does not say when the size does not fit the art');
if (report.indexOf('is coarser than the ') < 0)
  throw new Error('the report is silent about a size that merges cells away');

/* UNDOABLE, and the snapshot is taken BEFORE the pixels move. */
const tStart = code.indexOf("if($('blktidy')) $('blktidy').onclick=()=>{");
const tidy = code.slice(tStart, tStart + 1200);
if (tStart < 0) throw new Error('could not find the Tidy handler');
if (tidy.indexOf('snapshot();') < 0) throw new Error('Tidy is not undoable');
if (tidy.indexOf('snapshot();') > tidy.indexOf('ctx.putImageData'))
  throw new Error('the snapshot is taken after the pixels have already moved');
/* AND IT DOES NOT PUSH AN EMPTY UNDO STEP for a no-op. */
if (tidy.indexOf('if(!r.pixels){') < 0 || tidy.indexOf('if(!r.pixels){') > tidy.indexOf('snapshot();'))
  throw new Error('a tidy that changes nothing still lands in the history');

/* The two the collection work asked for are actually offered. */
const sStart = code.indexOf('function pixelSizes(measured,W,H){');
const sizes = code.slice(sStart, sStart + 400);
if (!/const want=\[2,4,5,8,10,16,20,32,40\];/.test(sizes))
  throw new Error('4 and 8 are not both in the offered sizes');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
