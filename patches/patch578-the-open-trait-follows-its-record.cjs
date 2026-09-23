/* THE TRAIT OPEN IN THE EDITOR FOLLOWS ITS RECORD WHEN SOMETHING ELSE
   MOVES IT.

   A trait's id carries its name, layer and status, and six paths retire an
   id by writing the record under a new one: the status chip, Sort
   unsorted, retagLayer, commitShelfMove, bulkMoveToLayer and the cloud
   pull's repair pass. Each tells draftsFollow, so the unsaved drawing
   follows the trait. The editor did not. Open a wip hat, go back to the
   shelf, set it to approved, come back and press Save: the editor still
   held the wip record and its status chip still said wip, so the save
   wrote a wip hat back beside the approved one - the trait twice, and the
   approval undone on the copy the person had just drawn on.

   draftsFollow now carries the editor with it. The open record becomes
   the moved one, and each of the name, layer and status fields follows
   the record only if it still holds what the record held when it was
   opened - a value typed or picked in the editor is the person's, and
   stays. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = () => kit.inFunction(L, 'async function draftsFollow(pairs){');
{
  const i = kit.only(L, l => l === 'async function draftsFollow(pairs){', 'the head');
  kit.replace(L, { start: i, end: i }, [
    '/* THE TRAIT OPEN IN THE EDITOR, carried to the id it moved to. Each field',
    '   follows only if it still says what the record said: one the person',
    '   changed in the editor is theirs. Left on the old id, a save wrote the',
    '   trait back under it - two of it, the move undone on one. */',
    'async function editorFollows(was,toId){',
    '  let now=null; try{ now=await dbGet(toId); }catch(_){ now=null; }',
    '  if(!now||now.kind!=="trait"||openRec!==was) return false;',
    '  if($("tname").value.trim()===String(was.name||"")) $("tname").value=now.name;',
    '  if(($("tlayer").value||"unsorted")===(was.layer||"unsorted")){',
    '    buildLayerSelect();',
    '    $("tlayer").value=LAYERS.indexOf(now.layer)>=0 ? now.layer : "unsorted";',
    '  }',
    '  if((chipVal("tstatus")||"wip")===String(was.status||"wip")) setChip("tstatus",now.status||"wip");',
    '  openRec=now;',
    '  return true;',
    '}',
    'async function draftsFollow(pairs){',
  ]);
}
{
  const i = kit.only(L, l => l === '  if(!ends.length) return 0;', 'the ends', fn());
  kit.replace(L, { start: i, end: i }, [
    '  if(!ends.length) return 0;',
    '  /* The editor too, when the trait it holds is one of these. */',
    '  if(openRec&&openRec.id){',
    '    const end=ends.find(m=>m.from===openRec.id);',
    '    if(end){ try{ await editorFollows(openRec,end.to); }catch(_){} }',
    '  }',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch578 written');
