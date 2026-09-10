/* A TRAIT SHRUNK TO FIT THE CHARACTER WAS SAVED AS A SMALL FILE.

   "i need a save as x size option where it keeps the trait where it should be
   if it was on the base trait (thats what im lining it up to) so i can
   specifically save my traits as 1280x1280 rn when i shrink them it saves
   them as a smaller size"

   The base character is pinned to a footprint when it is attached and holds
   still after that: drawBase draws it at basePin, centred, and the art canvas
   is centred on the same box. That is what makes lining a trait up work - the
   character does not move while the trait is resized.

   So a trait shrunk to fit is a SMALL PICTURE IN THE MIDDLE OF A 1280 SQUARE.
   Every save wrote the shrunken canvas instead, which is the one thing that
   throws away the alignment the shrinking was for: a 640 file says nothing
   about where in the character's 1280 it belongs, and putting it back means
   lining it up again.

   Save to project and Save and close write the FOOTPRINT, not the canvas.
   The trait keeps the size and the place it has on the base; the square
   around it is filled in. That is padding, not resizing - every pixel of the
   art stays the size it was drawn - which is why it is the default and needs
   nothing typed.

   The Save at box is the second half: a width to take that whole composition
   to, for anyone who wants a size the base does not already give. Empty means
   the footprint's own size, and it is remembered.

   WHAT IS NOT CHANGED, deliberately. Grid, 8x and Trimmed still download the
   canvas as it is. Grid's whole job is to report the size rather than change
   it, and the reason is written beside the project zip: "silently resizing
   their art on the way out would be worse than shipping it wrong". This does
   not supersede that - it is the deliberate reason that sentence reserved,
   asked for out loud, with a box saying the number and a line underneath
   saying what the file will be before anything is pressed.

   With no base attached the footprint IS the canvas, so an empty box - or any
   picture already at the size asked for - goes through the same path it always
   did, byte for byte. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const X = String.fromCharCode(92) + 'u00d7';

/* ---- the control -------------------------------------------------- */
{
  const at = kit.only(L, l => l === '        <div class="olrow"><span>Download</span>',
    'the download row');
  kit.replace(L, { start: at, end: at - 1 }, [
    '        <!-- THE SIZE THE FILE IS WRITTEN AT, and where the trait sits on',
    '             it. A trait is lined up against a base character; the base',
    '             holds still at the footprint it was pinned to, so a trait',
    '             shrunk to fit is a small picture in the middle of a full-size',
    '             square. Writing the shrunken canvas throws that away. -->',
    '        <div class="olrow"><label for="savesize">Save at</label>',
    '          <input id="savesize" type="number" min="0" max="4096" step="1"',
    '            style="width:84px" inputmode="numeric" placeholder=""',
    '            title="The width the PNG is written at. The trait keeps the size and the place it has on the base it is lined up against, so a trait shrunk to fit stays small on a full-size canvas instead of being stretched to fill it. Leave it empty to write that composition at its own size, which the box shows in grey.">',
    '          <span class="mono">px</span>',
    '          <button class="btn ghost" id="dlSize" style="width:auto;padding:6px 12px;font-size:12px"',
    '            title="Download the PNG at that size">Download</button></div>',
    '        <p class="note"><span class="mono" id="savesizenote">-</span></p>',
  ]);
}

/* ---- what it writes ------------------------------------------------ */
{
  const at = kit.only(L, l => l === 'async function saveTrait(){', 'the project save');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* WHERE THE TRAIT SITS ON THE THING IT IS LINED UP AGAINST.',
    '',
    '   baseBox is the box the editor already composes in: the base is drawn',
    '   centred in it at its pinned footprint, and the art canvas is centred in',
    '   it too. So this is not a new idea about placement - it is the placement',
    '   already on screen, read back out.',
    '',
    '   With no base attached bw is the canvas width, so the box is the canvas',
    '   and everything below is the identity. */',
    'function saveFootprint(){',
    '  const bb=baseBox();',
    '  return { w:bb.bw, h:bb.bh,',
    '    ax:Math.floor(bb.bw/2)-Math.floor(art.width/2),',
    '    ay:Math.floor(bb.bh/2)-Math.floor(art.height/2) };',
    '}',
    'const SAVE_SIZE_KEY="pb.savesize";',
    '/* 0 means the canvas as it is, which is what every save did before this. */',
    'function saveSide(){',
    '  const el=$("savesize"); if(!el) return 0;',
    '  const v=Math.round(+el.value||0);',
    '  return v>0 ? Math.max(1,Math.min(MAX_SIDE,v)) : 0;',
    '}',
    '/* The trait as a file.',
    '',
    '   THE BORDER RULE RUNS AT THE SIZE IT WAS DRAWN. traitCanvas blackens the',
    '   outermost ring of opaque pixels, one pixel wide; doing that after a',
    '   scale would blacken a ring k pixels thick, which on a 2x save is twice',
    '   the line the collection asks for. So the rule is applied first and the',
    '   result placed, never the other way round. */',
    'function saveCanvas(out){',
    '  const t=traitCanvas(out);',
    '  const f=saveFootprint();',
    '  const side=saveSide();',
    '  const k=side>0 ? side/f.w : 1;',
    '  /* Nothing to do: the file is already the size and shape asked for. */',
    '  if(k===1&&f.w===t.width&&f.h===t.height) return t;',
    '  const W=Math.max(1,Math.round(f.w*k)), H=Math.max(1,Math.round(f.h*k));',
    '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '  const g=c.getContext("2d"); g.imageSmoothingEnabled=false;',
    '  g.drawImage(t, Math.round(f.ax*k), Math.round(f.ay*k),',
    '    Math.max(1,Math.round(t.width*k)), Math.max(1,Math.round(t.height*k)));',
    '  return c;',
    '}',
    '/* WHAT THE NEXT SAVE WILL WRITE, before anything is pressed. A size box',
    '   that only tells you what it did after it did it is the shape of every',
    '   complaint on this tab so far. */',
    'function saveSizeNote(){',
    '  const el=$("savesizenote"); if(!el) return;',
    '  if(!ctx||!art||!art.width){ el.textContent="-"; return; }',
    '  const f=saveFootprint(), side=saveSide();',
    '  const k=side>0 ? side/f.w : 1;',
    '  const W=Math.max(1,Math.round(f.w*k)), H=Math.max(1,Math.round(f.h*k));',
    '  const tw=Math.max(1,Math.round(art.width*k)), th=Math.max(1,Math.round(art.height*k));',
    '  /* THE BOX SHOWS WHAT LEAVING IT EMPTY GIVES, in grey, so the size it',
    '     will use is on screen without being typed. */',
    '  const box=$("savesize"); if(box) box.placeholder=String(f.w);',
    '  el.textContent = (tw===W&&th===H)',
    '    ? "Writes "+W+"' + X + '"+H',
    '    : "Writes "+W+"' + X + '"+H+", the trait "+tw+"' + X + '"+th',
    '      +" where it sits on the base";',
    '}',
  ]);
}

/* ---- and the saves use it ------------------------------------------ */
{
  const st = kit.inFunction(L, 'async function saveTrait(){');
  const at = kit.only(L, l => l === '  const c=traitCanvas(edge);', 'where the save takes its pixels', st);
  kit.replace(L, { start: at, end: at }, [
    '  const c=saveCanvas(edge);',
  ]);
  const off = kit.only(L, l => l === '    const offGrid = !onCellGrid(art.width,art.height,gcells)',
    'the off-grid check', kit.inFunction(L, 'async function saveTrait(){'));
  if (L[off + 1] !== '      ? " \\u2014 saved at "+art.width+"\\u00d7"+art.height+", which is not on the"')
    throw new Error('the off-grid message is not shaped the way this expects');
  kit.replace(L, { start: off, end: off + 1 }, [
    '    /* THE SIZE THAT WAS WRITTEN, not the size on screen. With Save at set',
    '       those differ, and warning about the canvas while the file is fine is',
    '       a false alarm on every save. */',
    '    const offGrid = !onCellGrid(c.width,c.height,gcells)',
    '      ? " \\u2014 saved at "+c.width+"\\u00d7"+c.height+", which is not on the"',
  ]);
  const rec = kit.only(L, l => l === '      w:art.width, h:art.height, at:Date.now(),',
    'the record size', kit.inFunction(L, 'async function saveTrait(){'));
  kit.replace(L, { start: rec, end: rec }, [
    '      w:c.width, h:c.height, at:Date.now(),',
  ]);
}

/* ---- a download at the same size ----------------------------------- */
{
  const at = kit.only(L, l => l === "$('dlNative').onclick=()=>download(1);", 'the download wiring');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE SAME FILE THE PROJECT SAVE WRITES, on disk instead of the shelf.',
    '   Its own function rather than a flag on download(), because download()',
    '   is the button that promises not to rescale anything and that promise is',
    '   worth more than the shared lines. */',
    'function downloadAtSize(){',
    '  if(!ctx) return;',
    '  const c=saveCanvas();',
    '  c.toBlob(b=>{',
    '    const u=URL.createObjectURL(b), a=document.createElement("a");',
    '    a.href=u; a.download=fileName;',
    '    document.body.appendChild(a); a.click(); a.remove();',
    '    setTimeout(()=>URL.revokeObjectURL(u),1000);',
    '    const dcells=Math.max(1,projectGrid|0);',
    '    const off = !onCellGrid(c.width,c.height,dcells)',
    '      ? " \\u2014 not on the collection\\u0027s "+dcells+" cell grid"',
    '        +". A trait has to be a whole multiple of the cell count, or a whole division of it." : "";',
    '    toast("Downloaded "+c.width+"' + X + '"+c.height+off);',
    '  },"image/png");',
    '}',
  ]);
  const wire = kit.only(L, l => l === "$('dlBig').onclick=()=>download(8);", 'the 8x wiring');
  kit.replace(L, { start: wire, end: wire }, [
    "$('dlBig').onclick=()=>download(8);",
    "$('dlSize').onclick=downloadAtSize;",
    '/* Remembered, because a size typed once is a setting and not a gesture. */',
    "$('savesize').addEventListener('input',()=>{",
    '  try{ localStorage.setItem(SAVE_SIZE_KEY,String(saveSide())); }catch(_){ }',
    '  saveSizeNote();',
    '});',
    '(function(){',
    '  let v=null;',
    '  try{ v=localStorage.getItem(SAVE_SIZE_KEY); }catch(_){ }',
    '  /* EMPTY BY DEFAULT, which means the footprint - so nothing is rescaled',
    '     unless somebody types a number. Defaulting to the collection canvas',
    '     was tried and is wrong: it multiplies EVERY canvas up to 1280, so a',
    '     deliberately small trait is silently enlarged eighty times, and every',
    '     off-size trait becomes on-size on the way out - which switches off the',
    '     collection wrong-size warning entirely. Five tests said so and they',
    '     were right: basenotbaked 110, and the four in collection-size. */',
    '  const n=(v===null?0:Math.max(0,Math.round(+v||0)));',
    '  /* EMPTY, not a bare 0. "Save at 0 px" reads as a bug on a screen; the',
    '     grey placeholder saves what it would write instead. */',
    "  $('savesize').value=(n>0?String(n):'');",
    '  saveSizeNote();',
    '})();',
  ]);
}

/* ---- and the note keeps up with the canvas ------------------------- */
{
  /* resizeBoxes runs whenever the canvas changes size, which is exactly when
     what the save would write changes. */
  const fn = kit.inFunction(L, 'function resizeBoxes(){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '  /* The Save at line is a fact about the canvas, so it moves with it. */',
    '  try{ saveSizeNote(); }catch(_){ }',
    '}',
  ]);
}

const bytes = kit.save(doc, ({ text, code, codeLines }) => {
  /* THE PLACEMENT IS THE EDITOR'S OWN, not a second opinion about it. */
  const fp = kit.inFunction(codeLines, 'function saveFootprint(){');
  const fb = codeLines.slice(fp.start, fp.end + 1).join('\n');
  if (!/const bb=baseBox\(\);/.test(fb))
    throw new Error('the save works out its own placement instead of reading the editor');

  /* THE IDENTITY IS PRESERVED. A save that always redraws is a save that
     changes every trait in the collection the day it ships. */
  const sc = kit.inFunction(codeLines, 'function saveCanvas(out){');
  const sb = codeLines.slice(sc.start, sc.end + 1).join('\n');
  if (!/if\(k===1&&f\.w===t\.width&&f\.h===t\.height\) return t;/.test(sb))
    throw new Error('a picture already the right size is redrawn anyway');
  /* AND THE BORDER RULE RUNS FIRST. */
  if (sb.indexOf('traitCanvas(out)') > sb.indexOf('drawImage'))
    throw new Error('the border rule runs after the scale, so the line comes out thick');
  if (!/imageSmoothingEnabled=false/.test(sb))
    throw new Error('the placement is allowed to soften the pixels');

  /* THE SAVE WRITES IT AND REPORTS IT. */
  const stf = kit.inFunction(codeLines, 'async function saveTrait(){');
  const stb = codeLines.slice(stf.start, stf.end + 1).join('\n');
  if (!/const c=saveCanvas\(edge\);/.test(stb))
    throw new Error('the project save still writes the bare canvas');
  if (/w:art\.width, h:art\.height/.test(stb))
    throw new Error('the record says a size the file is not');
  if (!/onCellGrid\(c\.width,c\.height,gcells\)/.test(stb))
    throw new Error('the grid warning is about the canvas rather than the file');

  /* AND THE THREE THAT PROMISED NOT TO RESCALE STILL DO NOT. */
  const dl = kit.inFunction(codeLines, 'function download(scale){');
  const db = codeLines.slice(dl.start, dl.end + 1).join('\n');
  if (/saveCanvas/.test(db))
    throw new Error('the Grid download started rescaling art on the way out');
  if (!/const W=art\.width\*scale, H=art\.height\*scale;/.test(db))
    throw new Error('the Grid download stopped being the canvas as it is');
  if (!/id="dlNative"[\s\S]*?at its own size, unscaled/.test(text))
    throw new Error('the Grid button stopped saying what it does');

  /* The control exists and says what it will write. */
  if (!/id="savesize"/.test(text) || !/id="savesizenote"/.test(text)
    || !/id="dlSize"/.test(text))
    throw new Error('the control is not on the page');
  const nt = kit.inFunction(codeLines, 'function saveSizeNote(){');
  if (!/where it sits on the base/.test(codeLines.slice(nt.start, nt.end + 1).join('\n')))
    throw new Error('the line does not say where the trait lands');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
