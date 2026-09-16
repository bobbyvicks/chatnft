/* SELECT THE SHAPE OF ANOTHER TRAIT.

   "you know how we have the square selection for a area we dont want to change
   or we do? it would be useful to have a option be the siluette of the skins so
   that you can literally remove everything but the skin without 'cropping'
   making the editing process is best"

   and then: "do the same for all the other layers (eyes glasses shirt etc)"

   THE SELECTION WAS NEVER RECTANGULAR. Rect and Ellipse are two of five shapes;
   Lasso, Wand and Colour already produce arbitrary per-pixel regions, and all
   five hand a plain Uint8Array to seCombine. So this is a sixth source rather
   than a new kind of selection, and it inherits Replace, Add, Subtract and
   Intersect the day it lands - "the skin's shape minus the glasses" works
   without a line being written for it.

   THE SHAPE IS TAKEN THE WAY THE CHARACTER IS ASSEMBLED. The source trait is
   painted into a scratch canvas the size of the one being edited, through
   paintTrait - the same function the generator, the sheet and the preview use -
   and the alpha that comes back is the mask. That matters because traits are
   not all one size: paintTrait scales by a whole number and centres what is
   left over, so a 1024 skin on a 1280 canvas lands exactly where it will land
   in the finished character. A mask built by scaling the bitmap some other way
   would line up with nothing.

   ANY INK AT ALL, not a threshold. A pixel is in the shape if its alpha is
   above zero. The tempting alternative is the >=128 rule floodFill uses for
   "is this pixel on", and it is wrong here: a soft or anti-aliased edge would
   fall outside the shape, so clearing everything outside would shave off
   exactly the edge somebody is trying to keep. Ink is ink.

   NOTHING TO TAKE A SHAPE FROM IS REFUSED. selSet normalises an empty mask to
   null, and null means "no selection", which every reader treats as EVERYTHING
   allowed - the exact opposite of what picking a blank trait meant. So a source
   with no ink says so and changes nothing.

   HOW IT DOES WHAT WAS ASKED FOR. Take the skin's shape, press Invert, press
   Delete: everything outside the skin is gone and nothing was cropped. Both of
   those buttons are already in this panel, so the sentence at the top of it
   now says that rather than leaving it to be worked out.

   THE BASES ARE IN THE LIST TOO. A base character is a record like any other,
   it is the thing the trait is being drawn against, and its silhouette is the
   one most often wanted - it would have been a strange list that left it out.

   AND A WORD ABOUT WHAT A SELECTION STILL DOES NOT REACH. Eleven tools honour
   selMask - the pencil, the eraser, the bucket, the shading brush, the shape
   tools, the gradient, Delete, Fill and the effects panel. Several do not:
   Outline, Recolour, Flip, the Move tool, Text, nudge and fill-holes all write
   the whole canvas. That is true today and is not made true by this, but this
   makes it far easier to reach - somebody who has just selected a silhouette is
   exactly the person about to press Outline. It is written down here so the
   next patch knows where to start, and the panel's own note does not pretend
   otherwise. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the row ---------------------------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf('<div class="olrow"><label for="setol"') >= 0,
    'the tolerance row');
  kit.replace(L, { start: at, end: at }, [
    '    <!-- THE SHAPE OF SOMETHING ELSE. Two selects rather than one long list:',
    '         a project runs to hundreds of traits and "skins, then tan" is how',
    '         somebody already thinks about where a trait is. -->',
    '    <div class="olrow"><label for="seshapelayer">Shape of</label>',
    '      <select id="seshapelayer" style="flex:1; min-width:0"',
    '        title="Which layer to take a shape from"></select>',
    '      <select id="seshapetrait" style="flex:1; min-width:0"',
    '        title="The trait whose shape becomes the selection - its last saved artwork"></select>',
    '      <button class="btn ghost" id="seshapego"',
    '        title="Select everything that trait covers, laid out the way it is when a character is built">Use</button></div>',
    L[at],
  ]);
}
{
  const at = kit.only(L, l => l.indexOf('Pick a shape, then drag on the art with the Select tool (W).') >= 0,
    'the panel sub-line');
  kit.replace(L, { start: at, end: at }, [
    '    <p class="sub">Pick a shape, then drag on the art with the Select tool (W). Shift adds, Ctrl takes away, both together keep the overlap. Drag inside a selection to move it. Or take the shape of another trait below - then Invert and Delete to clear everything outside it.</p>',
  ]);
}

/* ---- 2. the pickers ------------------------------------------------------ */
{
  const at = kit.only(L, l => l === 'function seNote(){', 'the selection note');
  kit.replace(L, { start: at, end: at }, [
    '/* THE SAVED RECORDS THE SHAPE PICKER OFFERS. Read when the panel opens',
    '   rather than held: traits are saved, renamed and moved while the editor is',
    '   open, and a list gathered once goes stale silently. */',
    'let seShapeItems=[];',
    '/* Bases first under their own name, then the layers in paint order. A base',
    '   has no layer of its own - it is what the layers are painted onto - and it',
    '   is the silhouette most often wanted, so leaving it out would be strange. */',
    'function seShapeGroups(){',
    '  const by=new Map();',
    '  for(const r of seShapeItems){',
    '    if(!r) continue;',
    '    const g = r.kind==="ref" ? "base" : (r.kind==="trait" ? (r.layer||"unsorted") : null);',
    '    if(!g) continue;',
    '    if(!by.has(g)) by.set(g,[]);',
    '    by.get(g).push(r);',
    '  }',
    '  const order=[];',
    '  if(by.has("base")) order.push("base");',
    '  for(const l of LAYERS) if(by.has(l)) order.push(l);',
    '  /* A layer nobody declared still has traits in it, and this is the picker',
    '     somebody would use to find them. */',
    '  for(const g of by.keys()) if(order.indexOf(g)<0) order.push(g);',
    '  return {by,order};',
    '}',
    'function seShapeFillTraits(){',
    '  const ls=$("seshapelayer"), ts=$("seshapetrait");',
    '  if(!ls||!ts) return;',
    '  const {by}=seShapeGroups();',
    '  const keep=ts.value;',
    '  ts.innerHTML="";',
    '  const mine=(by.get(ls.value)||[]).slice()',
    '    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));',
    '  for(const r of mine){',
    '    const o=document.createElement("option");',
    '    o.value=r.id; o.textContent=r.name||r.id;',
    '    ts.appendChild(o);',
    '  }',
    '  if(mine.some(r=>r.id===keep)) ts.value=keep;',
    '  ts.disabled=!mine.length;',
    '  const go=$("seshapego"); if(go) go.disabled=!mine.length;',
    '}',
    '/* REFRESHED ON OPEN, and the choice kept when it survives - the panel is',
    '   opened between strokes and losing the pick every time would make this a',
    '   control you fight rather than use. */',
    'async function seShapeFill(){',
    '  const ls=$("seshapelayer"); if(!ls) return;',
    '  try{ seShapeItems=await dbAll(); }catch(_){ seShapeItems=[]; }',
    '  const {by,order}=seShapeGroups();',
    '  const keep=ls.value;',
    '  ls.innerHTML="";',
    '  for(const g of order){',
    '    const o=document.createElement("option");',
    '    o.value=g; o.textContent=g+" ("+by.get(g).length+")";',
    '    ls.appendChild(o);',
    '  }',
    '  if(order.indexOf(keep)>=0) ls.value=keep;',
    '  ls.disabled=!order.length;',
    '  seShapeFillTraits();',
    '}',
    '/* THE SILHOUETTE, LAID OUT THE WAY THE CHARACTER IS BUILT.',
    '',
    '   Painted through paintTrait into a scratch canvas the size of the one being',
    '   edited, so a trait of another size is scaled by a whole number and centred',
    '   exactly as it will be in the finished character. A mask built by stretching',
    '   the bitmap to fit would line up with nothing.',
    '',
    '   ANY INK AT ALL. A threshold - floodFill uses 128 for "is this pixel on" -',
    '   would leave a soft or anti-aliased edge outside the shape, so clearing',
    '   everything outside it would shave off the edge somebody is keeping. */',
    'async function seShapeRegion(rec){',
    '  const W=art.width, H=art.height;',
    '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '  const g=c.getContext("2d",{willReadFrequently:true});',
    '  g.imageSmoothingEnabled=false;',
    '  const bm=await cBitmap(rec);',
    '  paintTrait(g,bm,0,0,W,H);',
    '  const d=g.getImageData(0,0,W,H).data;',
    '  const region=new Uint8Array(W*H);',
    '  let n=0;',
    '  for(let i=0;i<W*H;i++) if(d[i*4+3]>0){ region[i]=1; n++; }',
    '  /* Handed back rather than left at the canvas size. */',
    '  c.width=1; c.height=1;',
    '  return {region,n};',
    '}',
    'async function seShapeUse(){',
    '  if(!ctx){ toast("Open a trait first"); return false; }',
    '  const ts=$("seshapetrait"); if(!ts||!ts.value){ toast("Pick a trait to take the shape from"); return false; }',
    '  const rec=seShapeItems.find(r=>r&&r.id===ts.value);',
    '  if(!rec){ toast("That trait is no longer saved"); await seShapeFill(); return false; }',
    '  let out=null;',
    '  try{ out=await seShapeRegion(rec); }',
    '  catch(_){ toast("That picture could not be read"); return false; }',
    '  /* REFUSED RATHER THAN CLEARED. selSet turns an empty mask into null, and',
    '     null means no selection - which every tool reads as EVERYTHING allowed,',
    '     the exact opposite of what picking a blank trait meant. */',
    '  if(!out.n){ toast((rec.name||"That trait")+" has nothing in it to take a shape from"); return false; }',
    '  seCombine(out.region,chipVal("semode")||"replace");',
    '  toast("Selected the shape of "+(rec.name||"that trait")',
    '    +" - "+out.n.toLocaleString()+" pixels");',
    '  return true;',
    '}',
    'function seNote(){',
  ]);
}

/* ---- 3. wired up --------------------------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf("on('seall',selAll); on('senone',selNone);") >= 0,
    'the panel buttons');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '  /* The trait list follows the layer, and neither does anything until the',
    '     press - a select that acted on change would take a shape on the way',
    '     past every layer a keyboard walks through. */',
    '  const sl=$("seshapelayer"); if(sl) sl.onchange=seShapeFillTraits;',
    '  const sg=$("seshapego"); if(sg) sg.onclick=()=>{ seShapeUse(); };',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(on&&id==="se"){ try{ seNote(); }catch(_){ } }',
    'the selection panel opening');
  kit.replace(L, { start: at, end: at }, [
    '  /* AND THE SHAPE LIST, because traits are saved, renamed and moved while',
    '     the editor is open - a list gathered once goes stale without saying so. */',
    '  if(on&&id==="se"){ try{ seNote(); }catch(_){ } try{ seShapeFill(); }catch(_){ } }',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* IT IS A SOURCE OF REGIONS, NOT A SECOND SELECTION SYSTEM. Everything that
     makes Add, Subtract and Intersect work is seCombine, and going anywhere
     else would be a mask that cannot be combined with the others. */
  const su = kit.inFunction(codeLines, 'async function seShapeUse(){');
  const sub = codeLines.slice(su.start, su.end + 1).join('\n');
  if (!/seCombine\(out\.region,chipVal\("semode"\)\|\|"replace"\);/.test(sub))
    throw new Error('the shape does not go through the one combine, so the modes do not apply to it');
  if (sub.indexOf('selSet(') >= 0)
    throw new Error('the shape sets the mask directly, which skips add, subtract and intersect');
  /* AND AN EMPTY SHAPE IS REFUSED, because selSet would turn it into no
     selection at all - which reads as everything allowed. */
  if (!/if\(!out\.n\)\{ toast\(/.test(sub))
    throw new Error('a trait with no ink in it would clear the selection instead of being refused');

  /* THE MASK IS LAID OUT THE WAY THE CHARACTER IS BUILT. */
  const sr = kit.inFunction(codeLines, 'async function seShapeRegion(rec){');
  const srb = codeLines.slice(sr.start, sr.end + 1).join('\n');
  if (!/paintTrait\(g,bm,0,0,W,H\);/.test(srb))
    throw new Error('the shape is placed by some rule other than the one the character uses');
  if (!/const bm=await cBitmap\(rec\);/.test(srb))
    throw new Error('the picture is decoded again rather than through the cache');
  if (!/if\(d\[i\*4\+3\]>0\)\{ region\[i\]=1; n\+\+; \}/.test(srb))
    throw new Error('the shape uses a threshold, which shaves the soft edge off it');
  if (/128|>=\s*1/.test(srb.split('\n').filter(l => l.indexOf('d[i*4+3]') >= 0).join('')))
    throw new Error('a threshold crept into what counts as part of the shape');
  /* CANVAS-SIZED, which selSet requires and seCombine assumes. */
  if (!/const c=document\.createElement\("canvas"\); c\.width=W; c\.height=H;/.test(srb))
    throw new Error('the mask is not built at the size of the canvas it has to fit');
  if (!/c\.width=1; c\.height=1;/.test(srb))
    throw new Error('the scratch canvas is left at the size of the art');

  /* THE LIST IS READ WHEN THE PANEL OPENS. */
  if (!/if\(on&&id==="se"\)\{ try\{ seNote\(\); \}catch\(_\)\{ \} try\{ seShapeFill\(\); \}catch\(_\)\{ \} \}/.test(code))
    throw new Error('the shape list is never refreshed, so it goes stale without saying so');
  const sf = kit.inFunction(codeLines, 'async function seShapeFill(){');
  const sfb = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/seShapeItems=await dbAll\(\);/.test(sfb))
    throw new Error('the list does not come from what is actually saved');
  if (!/if\(order\.indexOf\(keep\)>=0\) ls\.value=keep;/.test(sfb))
    throw new Error('opening the panel loses the layer that was chosen');

  /* EVERY LAYER, WHICH IS HALF THE REQUEST. */
  const sg = kit.inFunction(codeLines, 'function seShapeGroups(){');
  const sgb = codeLines.slice(sg.start, sg.end + 1).join('\n');
  if (!/for\(const l of LAYERS\) if\(by\.has\(l\)\) order\.push\(l\);/.test(sgb))
    throw new Error('the layers are not offered in paint order');
  if (!/if\(by\.has\("base"\)\) order\.push\("base"\);/.test(sgb))
    throw new Error('the base character cannot be used as a shape');
  if (!/for\(const g of by\.keys\(\)\) if\(order\.indexOf\(g\)<0\) order\.push\(g\);/.test(sgb))
    throw new Error('a layer the project never declared would hide its traits from the picker');

  /* AND THE PRESS IS THE PRESS. A select that acted on change would take a
     shape on the way past every layer a keyboard walks through. */
  if (!/sl\.onchange=seShapeFillTraits;/.test(code))
    throw new Error('the trait list does not follow the layer');
  if (!/sg\.onclick=\(\)=>\{ seShapeUse\(\); \};/.test(code))
    throw new Error('nothing takes the shape');
  if (/seshapetrait"\)\.onchange|ts\.onchange/.test(code))
    throw new Error('choosing a trait takes its shape, so walking the list changes the selection');

  /* THE CONTROLS EXIST AND THE PANEL SAYS WHAT THEY ARE FOR. */
  for (const id of ['seshapelayer', 'seshapetrait', 'seshapego'])
    if (text.indexOf('id="' + id + '"') < 0)
      throw new Error('the panel is missing its ' + id);
  if (text.indexOf('then Invert and Delete to clear everything outside it') < 0)
    throw new Error('the panel does not say how to keep only the shape, which is what was asked for');
  /* AND THE FIVE SHAPES IT ALREADY HAD ARE UNTOUCHED - this is a sixth source,
     not a replacement. */
  for (const v of ['rect', 'ellipse', 'lasso', 'wand', 'colour'])
    if (text.indexOf('data-v="' + v + '"') < 0)
      throw new Error('the ' + v + ' selection shape went missing');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
