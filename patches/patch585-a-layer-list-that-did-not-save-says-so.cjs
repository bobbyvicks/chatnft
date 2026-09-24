/* A LAYER LIST THAT DID NOT SAVE SAYS SO.

   saveLayers starts with a store write, and a store write rejects when the
   device is full. Two of its callers - the turn-off toggles - caught that
   and said "Could not save that". Five did not: Add, Rename, Remove, the
   up/down arrows and the drag. Theirs was an unhandled rejection inside a
   click handler, so the press did nothing visible and said nothing. Add
   was worse: the new layer was already in the list in memory, so it sat on
   screen for the rest of the visit and was gone on reload.

   Add, move and drag change only the list, so on a failed save the list
   goes back to what it was and says why. Rename and Remove have already
   moved traits by the time the list is saved, so putting the list back
   would leave those traits in a layer the list does not name; the list is
   left as it is, and the message says the traits moved but the list did
   not save - a reload adopts any layer a trait is in, as applyLayers
   already does. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const inFn = (sig, line, label) => kit.only(L, l => l === line, label, kit.inFunction(L, sig));
const swapIn = (sig, line, to, label) => { const i = inFn(sig, line, label); kit.replace(L, { start: i, end: i }, to); };

/* One place that says it, for all five. */
{
  const i = kit.only(L, l => l === 'async function saveLayers(){', 'saveLayers');
  kit.replace(L, { start: i, end: i }, [
    '/* A LAYER LIST THAT DID NOT SAVE, said. saveLayers rejects when its store',
    '   write does - a full device - and five callers let that go by as an',
    '   unhandled rejection: the press did nothing and said nothing. */',
    'function layersNotSaved(e,what){',
    '  toast((what||"Could not save the layer list")+(storeFull(e)?" - "+STORE_FULL:""));',
    '}',
    'async function saveLayers(){',
  ]);
}

const MOVE = 'async function moveLayer(name,delta){';
swapIn(MOVE, '  LAYERS.splice(i,1);', ['  const was=LAYERS.slice();', '  LAYERS.splice(i,1);'], 'move: before');
swapIn(MOVE, '  if(!await saveLayers()) toast("Order changed here"+LAYERS_NOT_SHARED);', [
  '  let shared;',
  '  try{ shared=await saveLayers(); }',
  '  catch(e){ LAYERS=was; try{ await renderShelf(); }catch(_){} layersNotSaved(e,"Could not save the new order"); return; }',
  '  if(!shared) toast("Order changed here"+LAYERS_NOT_SHARED);',
], 'move: save');

const ADD = 'async function addLayer(){';
swapIn(ADD, '  LAYERS.push(name);', ['  const was=LAYERS.slice();', '  LAYERS.push(name);'], 'add: before');
swapIn(ADD, '  const listShared=await saveLayers();', [
  '  let listShared;',
  '  /* Put back on a failed save: it sat in the list for the rest of the visit',
  '     and was gone on reload. The name goes back in the box to try again. */',
  '  try{ listShared=await saveLayers(); }',
  '  catch(e){ LAYERS=was; $("newlayer").value=raw; try{ await renderShelf(); }catch(_){} layersNotSaved(e,"Could not add "+name); return; }',
], 'add: save');

const REMOVE = 'async function removeLayer(name){';
swapIn(REMOVE, '  const listShared=await saveLayers();', [
  '  let listShared;',
  '  /* The traits have moved already; the list is left as it is. */',
  '  try{ listShared=await saveLayers(); }',
  '  catch(e){ layersNotSaved(e,(r.moved?r.moved+" moved to unsorted, but the":"The")+" layer list could not be saved"); return; }',
], 'remove: save');

const RENAME = 'async function renameLayer(oldName,raw){';
swapIn(RENAME, '  const listShared=await saveLayers();', [
  '  let listShared;',
  '  try{ listShared=await saveLayers(); }',
  '  catch(e){ layersNotSaved(e,(r.moved?r.moved+" trait"+(r.moved===1?"":"s")+" moved to "+nw+", but the":"The")+" layer list could not be saved"); return; }',
], 'rename: save');

const DRAG = 'async function layerDragEnd(e){';
swapIn(DRAG, '  LAYERS=order;', ['  const was=LAYERS.slice();', '  LAYERS=order;'], 'drag: before');
swapIn(DRAG, '  if(!await saveLayers()) toast("Order changed here"+LAYERS_NOT_SHARED);', [
  '  let shared;',
  '  try{ shared=await saveLayers(); }',
  '  catch(err){ LAYERS=was; try{ await renderShelf(); }catch(_){} layersNotSaved(err,"Could not save the new order"); return; }',
  '  if(!shared) toast("Order changed here"+LAYERS_NOT_SHARED);',
], 'drag: save');

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch585 written');
