/* ONE DRAFT SLOT FOR THE WHOLE PROJECT, AND A TRAIT-BY-TRAIT PASS AHEAD.

   Browser autosave wrote a single record, autosave.working. Opening a second
   trait replaced it, so the first trait's unsaved work was gone with nothing
   said - which is fine while the app is "open a picture, edit it, save it" and
   fatal for a 317-trait review where the whole gesture is moving between
   traits.

   THE KEY IS THE TRAIT. A saved trait drafts to "autosave."+its id; a canvas
   that is not a saved trait yet - an imported PNG, an extraction - keeps
   autosave.working exactly as before, so nothing needs migrating and the boot
   restore bar still finds what it always found.

   TWO RACES HAD TO BE DESIGNED OUT, and neither is theoretical.

   The debounce fires 1.5s after a stroke. Open the next trait inside that
   window and the timer lands with the NEW trait open and the OLD pixels still
   on the canvas, filing one trait's work under another's name. So opening
   flushes first, and the destination key is captured before toBlob rather than
   read after it - toBlob is asynchronous too.

   And the discard button re-opens the saved version. Re-entering the open path
   would flush first, writing the draft being discarded straight back under the
   key just deleted. So that one path opens without flushing, and says why.

   A TRAIT OPENED AND CLOSED WITHOUT A STROKE HAS NO DRAFT. undoStack is
   emptied by startEditor, so a non-empty one is exactly "edited since opened".
   Without that check every open would leave a draft identical to the record and
   the next open would announce unsaved changes that do not exist. The
   unattached canvas keeps its old unconditional behaviour: it is the only copy
   of a PNG that has never been saved anywhere. */
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

/* ---- 1. the bar, inside the editor ------------------------------------ */
swap(block([
  '  </header>',
  '',
  '  <nav class="tools" aria-label="Tools">',
]), block([
  '  </header>',
  '',
  '  <!-- Said inside the editor, because that is where the draft was restored.',
  '       The main page keeps its own bar for the unattached canvas. -->',
  '  <div class="draftbar" id="draftbar" hidden>',
  '    <span id="drafttext"></span>',
  '    <button class="mini" id="draftdiscard">Use the saved version</button>',
  '  </div>',
  '',
  '  <nav class="tools" aria-label="Tools">',
]));

swap('.urow{display:flex; gap:8px; align-items:baseline; padding:4px 0;', block([
  '.draftbar{display:flex; gap:10px; align-items:center; flex-wrap:wrap;',
  '  padding:7px 12px; background:var(--panel); border-bottom:1px solid var(--line);',
  '  font-size:12.5px; color:var(--muted);}',
  '.urow{display:flex; gap:8px; align-items:baseline; padding:4px 0;',
]));

/* ---- 2. the draft key -------------------------------------------------- */
swap('const AUTO_ID="autosave.working";', block([
  'const AUTO_ID="autosave.working";',
  '/* WHICH DRAFT THIS CANVAS BELONGS TO. A saved trait drafts under its own id;',
  '   anything else - an imported PNG, an extraction - keeps the single working',
  '   key it has always used, so nothing needs migrating and the boot restore',
  '   bar still finds exactly what it used to. */',
  'const draftKey=id=>"autosave."+id;',
  'function draftId(){ return openRec&&openRec.id ? draftKey(openRec.id) : AUTO_ID; }',
]));

/* ---- 3. the write goes to that key, captured up front ----------------- */
swap(block([
  'function autosaveNow(){',
  '  clearTimeout(autoPending); autoPending=null;',
  '  if(!ctx) return Promise.resolve();',
  '  return new Promise(done=>{',
  '    art.toBlob(b=>{',
  '      if(!b){ done(); return; }',
  '      dbPut({id:AUTO_ID, kind:"autosave", name:fileName||"untitled.png",',
  '             w:art.width, h:art.height, blob:b, at:Date.now()})',
  '        .then(done, done);',
  '    },"image/png");',
  '  });',
  '}',
]), block([
  'function autosaveNow(){',
  '  clearTimeout(autoPending); autoPending=null;',
  '  if(!ctx) return Promise.resolve();',
  '  /* CAPTURED BEFORE THE ENCODE, not read after it. toBlob is asynchronous',
  '     and openRec can change while it runs, which would file this canvas',
  '     under whichever trait was opened in the meantime. */',
  '  const key=draftId(), of=openRec&&openRec.id?openRec.id:null;',
  '  /* A saved trait opened and closed without a stroke has nothing to keep -',
  '     the record already says it. startEditor empties undoStack, so a',
  '     non-empty one is exactly "edited since this was opened", and without',
  '     this every open would leave a draft identical to the record and the',
  '     next open would announce unsaved changes that do not exist.',
  '',
  '     The unattached canvas is unconditional as before: it is the only copy',
  '     of a picture that has never been saved anywhere. */',
  '  if(of && !undoStack.length) return Promise.resolve();',
  '  return new Promise(done=>{',
  '    art.toBlob(b=>{',
  '      if(!b){ done(); return; }',
  '      dbPut({id:key, kind:"autosave", traitId:of, name:fileName||"untitled.png",',
  '             w:art.width, h:art.height, blob:b, at:Date.now()})',
  '        .then(done, done);',
  '    },"image/png");',
  '  });',
  '}',
]));

/* ---- 4. opening a trait keeps, and offers, its own draft -------------- */
swap(block([
  'async function openTraitRecord(t){',
  '  if(!t||!t.blob||!t.w||!t.h) return false;',
  '  let d;',
  '  try{',
  '    const bm=await createImageBitmap(t.blob);',
  '    const c=document.createElement("canvas"); c.width=t.w; c.height=t.h;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '    d=g.getImageData(0,0,t.w,t.h);',
  '  }catch(_){ return false; }',
]), block([
  'async function openTraitRecord(t,opts){',
  '  if(!t||!t.blob||!t.w||!t.h) return false;',
  '  opts=opts||{};',
  '  /* THE TRAIT ON SCREEN IS WRITTEN DOWN BEFORE THE NEXT ONE REPLACES IT.',
  '     The autosave debounce is 1.5s; without this, opening the next trait',
  '     inside that window lands the timer with the new trait open and the old',
  '     pixels still on the canvas.',
  '',
  '     Skipped only by the discard button, where the canvas IS the draft being',
  '     thrown away and flushing would write it back under the key just',
  '     deleted. */',
  '  if(!opts.ignoreDraft){ try{ await autosaveNow(); }catch(_){} }',
  '  /* A draft for THIS trait, newer than the record it belongs to. Older is',
  '     not a draft, it is a leftover from before the last save. */',
  '  let draft=null;',
  '  if(!opts.ignoreDraft){',
  '    try{',
  '      const got=(await dbAll()).find(i=>i.id===draftKey(t.id));',
  '      if(got&&got.blob&&got.w&&got.h&&(got.at||0)>(t.at||0)) draft=got;',
  '    }catch(_){}',
  '  }',
  '  /* Opened FROM the draft rather than opened and then replaced: two',
  '     startEditor calls would clear openRec twice and flash the saved pixels',
  '     on the way past. */',
  '  const src=draft||t;',
  '  let d;',
  '  try{',
  '    const bm=await createImageBitmap(src.blob);',
  '    const c=document.createElement("canvas"); c.width=src.w; c.height=src.h;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '    d=g.getImageData(0,0,src.w,src.h);',
  '  }catch(_){ return false; }',
]));

swap(block([
  '  startEditor(d.data,t.w,t.h,t.w,t.h,palette(d.data,t.w*t.h,24,64),false);',
]), block([
  '  startEditor(d.data,src.w,src.h,src.w,src.h,palette(d.data,src.w*src.h,24,64),false);',
]));

swap(block([
  '  adoptBlock(measuredBlock(d.data,t.w,t.h));',
]), block([
  '  adoptBlock(measuredBlock(d.data,src.w,src.h));',
]));

swap(block([
  '  openRec=t;',
  '  return true;',
  '}',
]), block([
  '  openRec=t;',
  '  showDraftBar(draft?t:null,draft);',
  '  return true;',
  '}',
  '/* What the editor says when it opened a draft instead of the saved record.',
  '',
  '   Restoring silently would be the worse half of honest: the canvas would not',
  '   be what the shelf shows and nothing would explain why. */',
  'function showDraftBar(t,draft){',
  '  const bar=$("draftbar"); if(!bar) return;',
  '  if(!t||!draft){ bar.hidden=true; return; }',
  '  const when=new Date(draft.at);',
  '  $("drafttext").textContent="Unsaved changes from "',
  '    +when.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})',
  '    +" were restored. They are not saved yet.";',
  '  bar.hidden=false;',
  '  $("draftdiscard").onclick=async()=>{',
  '    bar.hidden=true;',
  '    /* The pending timer first: it holds the draft being discarded and would',
  '       write it back after the delete. */',
  '    clearTimeout(autoPending); autoPending=null;',
  '    try{ await dbDel(draftKey(t.id)); }catch(_){}',
  '    await openTraitRecord(t,{ignoreDraft:true});',
  '    toast("Back to the saved "+t.name);',
  '  };',
  '}',
]));

/* ---- 5. saving clears the draft it just made permanent ---------------- */
swap(block([
  '    cBitmaps.delete(id);',
  '    openRec=rec;',
]), block([
  '    cBitmaps.delete(id);',
  '    /* THE DRAFT IS NOW THE RECORD, so it stops being a draft. Left behind,',
  '       the next open would offer unsaved changes that were saved. Three keys',
  '       because a rename changes the id, and a canvas that had no record',
  '       drafted under the working key. */',
  '    for(const k of [draftKey(id), openWas?draftKey(openWas.id):null,',
  '                    openWas?null:AUTO_ID]){',
  '      if(k){ try{ await dbDel(k); }catch(_){} }',
  '    }',
  '    showDraftBar(null,null);',
  '    openRec=rec;',
]));

/* ---- 6. clearing the project takes the drafts with the traits --------- */
swap(block([
  '      if(rec.kind==="trait"||rec.kind==="ref"){ await dbDel(rec.id); removed++; }',
  '      else kept++;',
]), block([
  '      if(rec.kind==="trait"||rec.kind==="ref"){ await dbDel(rec.id); removed++; }',
  '      /* A draft belongs to the trait it names. With the traits gone it can',
  '         never be opened again, and it would still be offered. The unattached',
  '         working draft has no trait and is left to the settings question. */',
  '      else if(rec.kind==="autosave"&&rec.traitId){ await dbDel(rec.id); }',
  '      else kept++;',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function draftId(){', 'const draftKey=id=>"autosave."+id;',
  '  const key=draftId(), of=openRec&&openRec.id?openRec.id:null;',
  '  if(of && !undoStack.length) return Promise.resolve();',
  'async function openTraitRecord(t,opts){', 'function showDraftBar(t,draft){',
  '  if(!opts.ignoreDraft){ try{ await autosaveNow(); }catch(_){} }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['draftbar', 'drafttext', 'draftdiscard'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* THE KEY IS CAPTURED BEFORE THE ENCODE. Reading openRec inside the toBlob
   callback is the race this exists to remove. */
const aStart = code.indexOf('function autosaveNow(){');
const aEnd = code.indexOf('\r\nfunction autosave(){', aStart);
if (aStart < 0 || aEnd < 0) throw new Error('could not bound autosaveNow');
const auto = code.slice(aStart, aEnd);
if (auto.indexOf('const key=draftId()') > auto.indexOf('art.toBlob'))
  throw new Error('the destination is decided inside the encode callback');
if (auto.indexOf('id:key,') < 0)
  throw new Error('the write still goes to a fixed key');

/* OPENING FLUSHES FIRST, or the trait being left loses its last strokes. */
const oStart = code.indexOf('async function openTraitRecord(t,opts){');
const oEnd = code.indexOf('\r\nfunction showDraftBar(', oStart);
if (oStart < 0 || oEnd < 0) throw new Error('could not bound openTraitRecord');
const open = code.slice(oStart, oEnd);
if (open.indexOf('await autosaveNow();') > open.indexOf('createImageBitmap'))
  throw new Error('the previous trait is not written down before the next is decoded');

/* AND THE DISCARD PATH DOES NOT FLUSH, or it writes back what it deletes. */
const sStart = code.indexOf('function showDraftBar(t,draft){');
const sEnd = code.indexOf('\r\nfunction ', sStart + 10);
const show = code.slice(sStart, sEnd < 0 ? undefined : sEnd);
if (show.indexOf('{ignoreDraft:true}') < 0)
  throw new Error('discarding re-opens through the flushing path');
if (show.indexOf('clearTimeout(autoPending)') > show.indexOf('dbDel(draftKey('))
  throw new Error('the pending write is not cancelled before the delete');

/* A SAVE CLEARS THE DRAFT. Otherwise the next open offers changes that are
   already saved, every time. */
if (code.indexOf('for(const k of [draftKey(id), openWas?draftKey(openWas.id):null,') < 0)
  throw new Error('saving does not clear the draft it just made permanent');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
