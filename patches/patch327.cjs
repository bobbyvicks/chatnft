/* THE ENTRY WAS A STALE REFERENCE BY THE TIME THE FLAG WAS SET.

   Accepting a changed name renames the trait through saveTrait, which ends in
   renderShelf, which calls applyReview - and applyReview REPLACES REVIEW with
   fresh objects read back from the store. The entry captured before the rename
   is detached from the queue by the time the rename returns, so

     e.nameAccepted=true; await saveReview();

   set a flag on an orphan and then wrote the queue without it. The rename
   itself worked perfectly: the record was re-keyed, the id came across, the
   panel found the artwork again. Only the answer was lost, which is the half
   somebody would have had to notice by re-reviewing a trait they had just
   finished.

   Caught by its own test rather than by reading. The fix is to hold the ID,
   not the object, and look the entry up again on the other side. */
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

swap(block([
  "$('revnamed').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  const e=REVIEW.entries[reviewIndex()];',
  "  const want=String($('revname').value||'').trim();",
  "  if(!want){ toast('Give it a name first'); return; }",
  '  const t=await traitForEntry(e);',
  '  if(t && want!==t.name){',
  '    const opened=await openTraitRecord(t);',
  "    if(!opened){ toast('Could not open '+t.name); return; }",
  "    $('tname').value=want;",
  '    const ok=await saveTrait();',
  '    if(ok===false) return;   /* saveTrait already said why */',
  '    closeEditor();',
  '  }',
  "  e.finalName=want; e.currentName=want+'.png'; e.nameAccepted=true;",
  '  await saveReview();',
  '  await renderShelf();',
  '  await renderReview();',
  '};',
]), block([
  "$('revnamed').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  /* THE ID, NOT THE OBJECT. saveTrait ends in renderShelf, which calls',
  '     applyReview, which replaces REVIEW with fresh objects read back from the',
  '     store - so an entry captured before a rename is an orphan afterwards,',
  '     and the flag set on it is written nowhere. */',
  '  const id=REVIEW.entries[reviewIndex()].id;',
  "  const want=String($('revname').value||'').trim();",
  "  if(!want){ toast('Give it a name first'); return; }",
  '  const t=await traitForEntry(REVIEW.entries[reviewIndex()]);',
  '  if(t && want!==t.name){',
  '    const opened=await openTraitRecord(t);',
  "    if(!opened){ toast('Could not open '+t.name); return; }",
  "    $('tname').value=want;",
  '    const ok=await saveTrait();',
  '    if(ok===false) return;   /* saveTrait already said why */',
  '    closeEditor();',
  '  }',
  '  /* Looked up again on the other side of everything that may have reloaded',
  '     the queue. */',
  '  const cur=REVIEW&&REVIEW.entries.find(x=>x.id===id);',
  '  if(!cur) return;',
  "  cur.finalName=want; cur.currentName=want+'.png'; cur.nameAccepted=true;",
  '  await saveReview();',
  '  await renderShelf();',
  '  await renderReview();',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const nStart = code.indexOf("$('revnamed').onclick=async()=>{");
const nEnd = code.indexOf('\r\n};', nStart);
if (nStart < 0 || nEnd < 0) throw new Error('could not bound the handler');
const fn = code.slice(nStart, nEnd);

/* THE ENTRY IS RE-FOUND AFTER THE RENAME, not carried across it. */
if (fn.indexOf('REVIEW.entries.find(x=>x.id===id)') < 0)
  throw new Error('the entry is still the object captured before the rename');
if (fn.indexOf('const cur=') > fn.indexOf('await saveTrait();'))
  { /* correct order: cur is looked up after the save */ }
else throw new Error('the entry is looked up before the thing that reloads it');

/* AND THE FLAGS ARE SET ON WHAT WAS RE-FOUND. */
if (fn.indexOf('cur.nameAccepted=true;') < 0)
  throw new Error('the answer is recorded on the wrong object');
if (/\be\.nameAccepted\b/.test(fn))
  throw new Error('the stale reference is still being written to');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
