/* A DRAFT DOES NOT REDRAW THE OTHER TABS, AND A REDRAW WAITS FOR A FIELD.

   Every store write goes through touch, which tells the project's other
   tabs to redraw. The editor's autosave writes a draft about 1.5 s after
   each pause in drawing, so every other open tab read the whole store and
   rebuilt the shelf - and the final page too, when it was showing - after
   every pause, for a record kind neither of them shows. A draft is only
   ever read by the tab that restores it.

   And a redraw from another tab rebuilt the shelf under whatever was being
   typed there: a weight half typed into a tile was gone with the tile. A
   redraw asked for while a field on the project page has focus now waits
   until it loses focus - by then its own change has been made, and it
   draws once with both. */
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

swap('function touch(id){ if(id!=null) touchedAt.set(String(id),++touchSeq); tabsTell(); }', [
  '/* A draft is not told: no other tab shows one, and the editor writes one',
  '   after every pause in drawing - each a whole-store read and a shelf',
  '   rebuild in every other tab. "autosave." is draftKey\'s prefix and',
  '   AUTO_ID\'s, declared further down. */',
  'function touch(id){',
  '  if(id!=null) touchedAt.set(String(id),++touchSeq);',
  '  if(id==null || String(id).indexOf("autosave.")!==0) tabsTell();',
  '}',
], 'touch');

{
  const i = at('  tabRedrawTimer=setTimeout(async()=>{', 'the tab redraw');
  if (L[i + 1] !== '    tabRedrawTimer=null;') throw new Error('the tab redraw moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '  tabRedrawTimer=setTimeout(async()=>{',
    '    tabRedrawTimer=null;',
    '    /* NOT UNDER A FIELD BEING TYPED IN. The rebuild took the tile, and a',
    '       weight half typed into it went too. Asked again when it loses',
    '       focus, which is after its own change has been made. */',
    '    const f=document.activeElement, proj=$("proj");',
    '    if(f&&proj&&proj.contains(f)&&/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)){',
    '      f.addEventListener("blur",()=>{ tabChan.onmessage({data:{db:wsDbName()}}); },{once:true});',
    '      return;',
    '    }',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch575 written');
