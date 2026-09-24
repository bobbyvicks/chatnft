/* A FINAL-PROJECT TRAIT OPENS ON A DOUBLE-CLICK AND HAS A FIX BUTTON, AND A
   DOUBLE-CLICK ON THE SHELF OPENS ONCE.

   Asked for 2026-09-24: "i want to be able to edit the final project traits
   by double clicking them or with the fix button we have in the rough draft
   traits, also make it so i can edit by double clicking those too".

   The final page's tiles could be picked, taken out and moved to another
   layer, and not edited: to change one it had to be found again on the
   shelf. A double-click on the tile now opens it in the editor, and the
   shelf's "fix" button - the same class, so the same place and the same
   touch size - sends it to Fix pixels. A double-click on a control inside
   the tile is that control's, not an open. Double, not single, on this
   page because a tile here is mostly controls and a stray press opening
   the editor would be a surprise; the shelf keeps its single click.

   On the shelf a single click already opened the editor, so a double-click
   opened it TWICE - two openTraitRecord calls racing, each flushing the
   autosave and loading the canvas. Both pages now go through openFromTile,
   which ignores a second open of the same trait while the first is still
   running. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);

/* One door for a tile opening its trait. */
{
  const i = at('async function openTraitRecord(t,opts){', 'openTraitRecord');
  kit.replace(L, { start: i, end: i }, [
    '/* A TILE OPENING ITS TRAIT. One open at a time per trait: a double-click on',
    '   a shelf tile, whose single click already opens, started two opens that',
    '   raced - each flushing the autosave and loading the canvas. */',
    'let tileOpening=null;',
    'async function openFromTile(t){',
    '  const id=t&&t.id;',
    '  if(!id||tileOpening===id) return;',
    '  tileOpening=id;',
    '  try{ if(!await openTraitRecord(t)) toast("Could not open "+(t.name||"that trait")); }',
    '  finally{ if(tileOpening===id) tileOpening=null; }',
    '}',
    'async function openTraitRecord(t,opts){',
  ]);
}

/* The shelf tile. */
{
  const i = at('      el.onclick=async()=>{', 'the shelf tile click');
  if (L[i + 1] !== '        if(!await openTraitRecord(t)) toast("Could not open "+(t.name||"that trait"));') throw new Error('the shelf open moved');
  if (L[i + 2] !== '      };') throw new Error('the shelf open end moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '      el.onclick=()=>openFromTile(t);',
  ]);
}

/* The final tile: a fix button and a double-click. */
{
  const fn = kit.inFunction(L, 'function finalTile(t,label,note,press){');
  const i = kit.only(L, l => l === '  b.onclick=press;', 'the final tile button', fn);
  if (L[i + 1] !== '  el.appendChild(b);') throw new Error('the final tile button moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '  b.onclick=press;',
    '  el.appendChild(b);',
    '  /* EDITABLE FROM HERE. The shelf\'s own fix button - same class, so the',
    '     same corner and the same touch size - and a double-click on the',
    '     tile to open it in the editor. A double-click on a control in the',
    '     tile belongs to the control. */',
    '  /* Only on a trait IN the final project, as asked: the "add from" folds',
    '     hold candidates, and their tiles stay a picture and an Add button. */',
    '  if(String(t.status||"wip")==="stfp"){',
    '  const fx=document.createElement("button"); fx.className="fx"; fx.type="button";',
    '  fx.textContent="fix";',
    '  fx.title="Send "+t.name+" to Fix pixels";',
    '  fx.setAttribute("aria-label","Send "+t.name+" to Fix pixels");',
    '  fx.onclick=async ev=>{ ev.stopPropagation();',
    '    if(!await fixFromRecords([t])) return;',
    '    toast("Sent "+t.name+" to Fix pixels"); };',
    '  el.appendChild(fx);',
    '  /* The hint on the picture, not the tile: the tile\'s title is its name,',
    '     which is how the page and its tests tell tiles apart. */',
    '  { const pic=el.querySelector(".fsart"); if(pic) pic.title="Double-click to edit "+t.name; }',
    '  el.ondblclick=ev=>{',
    '    if(ev.target.closest&&ev.target.closest("button,select,input,label,summary")) return;',
    '    openFromTile(t);',
    '  };',
    '  }',
  ]);
}

kit.save(doc, ({ code }) => {
  if (code.split('openFromTile(t)').length - 1 !== 3) throw new Error('two tile opens and the definition');
});
fs.renameSync(TMP, FILE);
console.log('patch587 written');
