/* FIX PIXELS FROM THE EDITOR, AND A TOP BAR WITH THE ACTIONS YOU REACH FOR.

   Asked for 2026-09-24: "make it so that i can do the fix pixels to a trait
   when im just editing it normally so i dont have to save then get out to
   make the changes, make it a yellow button on the top bar, also that bar
   only has the colour stuff and thats all ... we should make it filled
   with the most useful tools if were going to have it there".

   FIX PIXELS, HERE. The yellow button runs the same fixer the Fix pixels
   page runs, on the canvas as it is now, with that page's settings (pixel
   size, Save at 1280, colours to the palette), and puts the result back on
   the canvas as ONE undo step - restoreImage resizes the canvas when the
   result is another size, the way undo already does after a resize. The
   picture goes in through fixLoad as the file a save would write
   (layer/status/name.png), so the palette and the collection gate read
   the same path they read for a saved trait. What the fixer said is the
   toast. Nothing is saved; Save is still the person's.

   THE BAR. It was a 274 px box in the top-left corner: `.opts{width:274px}`
   at 1280 and wider, left from when these options were a column. The grid
   has placed them in a full-width strip ("opts opts") since, so the rest of
   the strip was empty ground. The width goes, and the right-hand end gets
   the actions that were either at the bottom of the rail or behind a
   pop-out: Fix pixels, Save (saveTrait - it was two clicks, behind Save and
   export), Undo, Redo, Grid, Flip across, Flip down, Outline and Base. Each
   is the existing control's own action - it presses that control - so
   nothing about what they do changes, and Grid mirrors its pressed state. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* The width, and the actions' look. */
swap('  .opts{width:274px;}', [
  '  /* SUPERSEDED: ".opts{width:274px;}" stood here, from when these options',
  '     were a column. The grid places them in a full-width strip ("opts',
  '     opts"), and 274 px left the rest of it empty; the strip now holds the',
  '     editor actions at its right-hand end. */',
], 'the width rule');
swap('.opts .olrow{margin:0; gap:6px; line-height:1.3;}', [
  '.opts .olrow{margin:0; gap:6px; line-height:1.3;}',
  '/* The actions at the right-hand end of the strip. */',
  '.opts .edacts{margin-left:auto; display:flex; flex-wrap:wrap; align-items:center; gap:6px;}',
  '.opts .edacts .btn{width:auto; padding:6px 10px; font-size:12px;}',
  '.opts .edacts .sep{width:1px; height:22px; background:var(--line); margin:0 2px;}',
  '/* Yellow, as asked: the one action here that changes the whole picture. */',
  '.opts .edacts .edfix{background:var(--accent); color:#241a05; border-color:var(--accent); font-weight:600;}',
  '.opts .edacts .edfix:hover{filter:brightness(1.08);}',
  '.opts .edacts .edfix:disabled{opacity:.6; cursor:progress;}',
  '/* On a phone, one row that scrolls sideways: wrapped, the actions took two',
  '   more rows (about 80 px) off a canvas that has the least room. */',
  '/* min-width 0 on the bar and the row: a row that will not wrap otherwise',
  '   widens its grid track to fit, and the editor then sized the art to that',
  '   wider stage - 480 px on a 375 px phone (phoneeditor.spec.js caught it). */',
  '@media (max-width:820px){',
  '  .opts{min-width:0;}',
  '  .opts .edacts{margin-left:0; width:100%; min-width:0; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none;}',
  '  .opts .edacts .btn{flex:none;}',
  '}',
], 'the opts rows');

/* The buttons, at the end of the bar. */
{
  const s = at('  <div class="opts" id="optsbar">', 'the bar');
  let e = -1;
  for (let i = s + 1; i < L.length; i++) if (L[i] === '  </div>') { e = i; break; }
  if (e < 0 || e - s > 120) throw new Error('the bar has no close where expected');
  kit.replace(L, { start: e, end: e }, [
    '    <!-- THE ACTIONS YOU REACH FOR, one press each. Each presses the control',
    '         it names (on the rail or in its pop-out), so it does what that',
    '         control does. -->',
    '    <div class="edacts" id="edacts">',
    '      <button class="btn edfix" type="button" id="edfix"',
    '        title="Run Fix pixels on this picture as it is now, with the Fix pixels page settings. One undo takes it back. Nothing is saved.">Fix pixels</button>',
    '      <button class="btn ghost" type="button" id="edsave" title="Save to project (S opens Save and export)">Save</button>',
    '      <span class="sep" aria-hidden="true"></span>',
    '      <button class="btn ghost" type="button" id="edundo" title="Undo (Ctrl+Z)">Undo</button>',
    '      <button class="btn ghost" type="button" id="edredo" title="Redo (Ctrl+Shift+Z)">Redo</button>',
    '      <span class="sep" aria-hidden="true"></span>',
    '      <button class="btn ghost" type="button" id="edgrid" aria-pressed="false" title="Grid (3)">Grid</button>',
    '      <button class="btn ghost" type="button" id="edfliph" title="Flip across">Flip ↔</button>',
    '      <button class="btn ghost" type="button" id="edflipv" title="Flip down">Flip ↕</button>',
    '      <button class="btn ghost" type="button" id="edoutline" title="Outline (O)">Outline</button>',
    '      <button class="btn ghost" type="button" id="edbase" title="Base layer (L)">Base</button>',
    '    </div>',
    '  </div>',
  ]);
}

/* The wiring, beside the grid button's own. */
swap("$('gridbtn').onclick=e=>{ const on=$('grid').classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed',String(on)); };", [
  "$('gridbtn').onclick=e=>{ const on=$('grid').classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed',String(on)); };",
  '/* THE TOP BAR\'S ACTIONS: each presses the control it stands for. */',
  '(function(){',
  '  const press=(from,to,after)=>{ const b=$(from); if(b) b.onclick=()=>{ const t=$(to); if(t) t.click(); if(after) after(); }; };',
  '  const gridState=()=>{ const g=$("edgrid"); if(g) g.setAttribute("aria-pressed",String($("grid").classList.contains("on"))); };',
  '  press("edundo","undo"); press("edredo","redo");',
  '  press("edgrid","gridbtn",gridState);',
  '  press("edfliph","fliph"); press("edflipv","flipv");',
  '  press("edoutline","olbtn"); press("edbase","blbtn");',
  '  if($("edsave")) $("edsave").onclick=()=>{ saveTrait(); };',
  '  if($("edfix")) $("edfix").onclick=()=>{ editorFix(); };',
  '  gridState();',
  '})();',
  '/* FIX PIXELS ON THE PICTURE BEING EDITED. The fixer the Fix pixels page',
  '   runs, with that page\'s settings, on the canvas as it is now; the result',
  '   comes back as one undo step. It goes in as the file a save would write',
  '   (layer/status/name.png) so the palette and the gate read the same path.',
  '   Nothing is saved. */',
  'let editorFixing=false;',
  'async function editorFix(){',
  '  if(!ctx||editorFixing) return;',
  '  if(typeof fixBatchRunning!=="undefined"&&fixBatchRunning){ toast(FIX_BATCH_BUSY); return; }',
  '  const btn=$("edfix"), was=btn?btn.textContent:"";',
  '  editorFixing=true; if(btn){ btn.disabled=true; btn.textContent="Fixing…"; }',
  '  try{',
  '    const bytes=new Uint8Array(await (await blobOf(art)).arrayBuffer());',
  '    const name=String(($("tname").value||"").trim()||fileName.replace(/\\.png$/i,"")||"trait").replace(/[\\\\/]/g,"-");',
  '    const layer=$("tlayer").value||"unsorted", status=chipVal("tstatus")||"wip";',
  '    if(!await fixLoad(fileWithPath(bytes,layer+"/"+status+"/"+name+".png"))){',
  '      toast("Fix pixels could not take this picture: "+(($("fixout")||{}).textContent||"")); return; }',
  '    const r=await fixRun();',
  '    if(!r){ toast("Fix pixels did not finish: "+(($("fixout")||{}).textContent||"")); return; }',
  '    const out=await pngDecode(await fixResultBytes(r));',
  '    snapshot();',
  '    restoreImage(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height));',
  '    refreshStats(); resizeBoxes(); repalette();',
  '    try{ autosave(); }catch(_){ }',
  '    const said=(($("fixout")||{}).textContent||"").trim();',
  '    toast("Fixed"+(said?": "+said:"")+" - Undo takes it back");',
  '  }catch(e){',
  '    toast("Fix pixels failed: "+((e&&e.message)||e));',
  '  }finally{',
  '    editorFixing=false; if(btn){ btn.disabled=false; btn.textContent=was; }',
  '  }',
  '}',
], 'the grid button');

kit.save(doc, ({ code }) => {
  if (code.indexOf('.opts{width:274px;}') >= 0) throw new Error('the width rule is still there');
});
fs.renameSync(TMP, FILE);
console.log('patch588 written');
