/* THE EDITOR FOLLOWS A MOVE MADE IN ANOTHER TAB.

   patch578 made the trait open in the editor follow its record when this
   tab's shelf moves it. A move made in ANOTHER tab of the same project
   could not reach it: that tab's draftsFollow knows where the trait went,
   and all it told the others was "the store changed". So with the trait
   open here and its status set to approved there, Save here wrote the wip
   hat back beside the approved one - the case patch578's commit left open.

   The moves go with the message now. draftsFollow notes every id it
   carries, and the next "the store changed" to the other tabs lists them.
   A tab whose editor holds one of those ids follows it at once, by the
   same editorFollows and the same rule: a field changed in the editor is
   the person's and stays.

   AND ITS OWN DRAFT GOES WITH IT. The other tab carried the draft that
   existed when it moved the trait, but this tab keeps drawing, and an
   autosave landing before the message is filed under the old id, where no
   open would ever ask for it. Once this tab has followed, a draft under the
   old id is carried to the new one - it is this tab's own latest canvas,
   so it is the one to keep. */
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

swap('let tabTellTimer=null;', [
  'let tabTellTimer=null;',
  '/* Ids retired since the last message, as {from,to}: the next one carries',
  '   them, so a tab with one of these open in its editor can follow it. */',
  'let tabMoves=[];',
], 'the tell timer');
swap('  tabTellTimer=setTimeout(()=>{ tabTellTimer=null; try{ tabChan.postMessage({db:wsDbName()}); }catch(_){ } },150);', [
  '  tabTellTimer=setTimeout(()=>{',
  '    tabTellTimer=null;',
  '    const moved=tabMoves; tabMoves=[];',
  '    try{ tabChan.postMessage(moved.length ? {db:wsDbName(), moved:moved} : {db:wsDbName()}); }catch(_){ }',
  '  },150);',
], 'the tell');

{
  const i = at('if(tabChan) tabChan.onmessage=(e)=>{', 'the listener');
  if (L[i + 1] !== '  if(!e||!e.data||e.data.db!==wsDbName()) return;') throw new Error('the listener moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '/* A MOVE ANOTHER TAB MADE, to the trait open in this one\'s editor. At once,',
    '   not with the redraw below: a save pressed in the meantime would write',
    '   the trait back under the id it left. */',
    'async function editorFollowsElsewhere(moved){',
    '  if(!openRec||!openRec.id||!Array.isArray(moved)) return false;',
    '  const next=new Map();',
    '  for(const m of moved) if(m&&m.from&&m.to&&m.from!==m.to) next.set(String(m.from),String(m.to));',
    '  const was=openRec, seen=new Set([was.id]);',
    '  let to=next.get(was.id);',
    '  if(!to) return false;',
    '  /* A chain, as draftsFollow walks one: moved twice before the message. */',
    '  while(next.has(to)&&!seen.has(to)){ seen.add(to); to=next.get(to); }',
    '  if(!await editorFollows(was,to)) return false;',
    '  /* This tab\'s own draft, filed under the old id by an autosave that',
    '     landed before this message did. */',
    '  try{ await draftsFollow([{from:was.id, to:to}]); }catch(_){}',
    '  return true;',
    '}',
    'if(tabChan) tabChan.onmessage=(e)=>{',
    '  if(!e||!e.data||e.data.db!==wsDbName()) return;',
    '  if(e.data.moved) editorFollowsElsewhere(e.data.moved).catch(()=>{});',
  ]);
}

{
  const fn = kit.inFunction(L, 'async function draftsFollow(pairs){');
  const i = kit.only(L, l => l === '  if(!ends.length) return 0;', 'the ends', fn);
  kit.replace(L, { start: i, end: i }, [
    '  if(!ends.length) return 0;',
    '  /* Told to the other tabs, whose editors may hold one of these. */',
    '  for(const m of ends) tabMoves.push({from:m.from, to:m.to});',
    '  tabsTell();',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch579 written');
