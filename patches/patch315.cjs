/* THE COLLECTION FILE COULD NOT BE IMPORTED, AND ITS PAINT ORDER WAS IGNORED.

   The v11 handoff ships two shapes of the same thing:

     UPLOAD-TO-PIXELBENCH-v11-317-traits.json   a bare array of 158 rules
     strict-fit-v11-collection.json             { revision, order, names, rules }

   planRuleImport opens with `if(!Array.isArray(docIn)) throw`, so the second is
   refused outright with "That file is not a list of rules". The button that
   used to read that shape was curated-rules-v7.js, and removing the v7
   shortcut took the only reader of it with it. This puts it where it belongs -
   in the ordinary import, which is what the person actually has in front of
   them.

   AND THE ORDER IS THE PAINT ORDER. The file states it plainly, and so does
   the sheet beside it:

     Pixelbench layer order (back to front)
     backgrounds / back-extras / skins / mouth / eyes / glasses / ears /
     clothing / chains / costumes / extras / masks / hair / hats

   The import already sets a DECIDE order, which the file it reads does not
   contain: out.order comes from decideOrderFor(edges), worked out from which
   layer conditions which. That is a different question and stays as it is. The
   paint order is LAYERS, nothing has ever set it from a file, and the only way
   to arrange fourteen layers by hand is the up and down buttons - which for
   this collection is about forty presses.

   NO LAYER IS LOST AND NONE IS INVENTED. Only layers this project already has
   are moved; a layer the file does not mention keeps its relative place after
   them and is reported, because it will now be painted last and that is a
   visible change somebody should be told about rather than discover. */
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

/* ---- 1. the paint order, applied ------------------------------------- */
swap(block([
  '/* Written whenever something works out an order - today that is the rules',
]), block([
  '/* THE ORDER LAYERS ARE PAINTED IN, taken from a file that states it.',
  '',
  '   Not the same as the decide order beside it. decideOrder answers "which',
  '   layer picks first" and is worked out from the rules; this is LAYERS, the',
  '   back-to-front paint order, and until now nothing but the up and down',
  '   buttons could change it - fourteen layers being about forty presses.',
  '',
  '   ONLY LAYERS THIS PROJECT HAS. A name the file lists and the project does',
  '   not is left alone rather than created: the rules import already refuses',
  '   rules for a missing layer and tells you to import the trait folders',
  '   first, and inventing an empty layer here would disagree with that.',
  '',
  '   AND NONE IS DROPPED. A layer the file does not mention keeps its relative',
  '   place after the ones it does - which paints it last - and the count comes',
  '   back so the report can say so. The length check is not decoration: losing',
  '   a layer here would strand every trait on it.',
  '',
  '   Returns null when there is nothing to do, so an unchanged order does not',
  '   report itself as a change. */',
  'async function applyPaintOrder(order){',
  '  const want=[...new Set((order||[]).map(String))].filter(l=>LAYERS.indexOf(l)>=0);',
  '  if(!want.length) return null;',
  '  const named=new Set(want);',
  '  const rest=LAYERS.filter(l=>!named.has(l));',
  '  const next=want.concat(rest);',
  '  if(next.length!==LAYERS.length) return null;',
  '  if(next.join("\\u0000")===LAYERS.join("\\u0000")) return null;',
  '  LAYERS=next;',
  '  await saveLayers();',
  '  buildLayerSelect();',
  '  return {moved:want.length, unnamed:rest};',
  '}',
  '/* Written whenever something works out an order - today that is the rules',
]));

/* ---- 2. both file shapes are read ------------------------------------- */
swap(block([
  '  let plan;',
  '  try{',
  '    const parsed=JSON.parse(await f.text());',
  '    let items=[]; try{ items=await dbAll(); }catch(_){ }',
  '    plan=planRuleImport(parsed, items.filter(i=>i.kind==="trait"));',
]), block([
  '  let plan, fileOrder=null;',
  '  try{',
  '    const parsed=JSON.parse(await f.text());',
  '    /* TWO SHAPES OF THE SAME THING. A bare array of rules, or the collection',
  '       object { revision, order, names, rules } that the trait records ship.',
  '       planRuleImport refuses anything that is not an array, so the second',
  '       used to be readable only by the removed v7 button. Anything that is',
  '       neither is passed through unchanged, so its error message is still the',
  '       one that names the real problem. */',
  '    const doc = Array.isArray(parsed) ? parsed',
  '      : (parsed && Array.isArray(parsed.rules) ? parsed.rules : parsed);',
  '    if(parsed && !Array.isArray(parsed) && Array.isArray(parsed.order))',
  '      fileOrder=parsed.order.map(String).filter(Boolean);',
  '    let items=[]; try{ items=await dbAll(); }catch(_){ }',
  '    plan=planRuleImport(doc, items.filter(i=>i.kind==="trait"));',
]));

/* ---- 3. applied after the rules are safely saved ---------------------- */
swap(block([
  '  await renderShelf();',
  '  /* Every number that matters, including the ones that are somebody\'s',
]), block([
  '  /* AFTER the rules are saved, never before. This reorders every layer in',
  '     the project, and doing it ahead of a save that might fail would leave',
  '     the collection rearranged by an import that reported keeping nothing. */',
  '  let painted=null;',
  '  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }',
  '  await renderShelf();',
  '  /* Every number that matters, including the ones that are somebody\'s',
]));

swap(block([
  "  const miss=[...new Set(plan.missingTraits)];",
]), block([
  '  /* SAID, because it changes what every character looks like. A layer the',
  '     file did not mention is now painted over the ones it did. */',
  '  if(painted){',
  '    bits.push("the paint order is now the file\'s ("+painted.moved+" layers, back to front)");',
  '    if(painted.unnamed.length)',
  '      bits.push(painted.unnamed.length+" layer"+(painted.unnamed.length===1?"":"s")',
  '        +" the file does not mention "+(painted.unnamed.length===1?"is":"are")',
  '        +" painted last ("+painted.unnamed.join(", ")+")");',
  '  }',
  '  const miss=[...new Set(plan.missingTraits)];',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function applyPaintOrder(order){',
  '  let plan, fileOrder=null;',
  '      fileOrder=parsed.order.map(String).filter(Boolean);',
  '  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* NO LAYER IS LOST. Without this the reorder could silently drop one and take
   every trait on it out of the paint. */
const pStart = code.indexOf('async function applyPaintOrder(order){');
const pEnd = code.indexOf('\r\nasync function saveDecideOrder(', pStart);
if (pStart < 0 || pEnd < 0) throw new Error('could not bound applyPaintOrder');
const fn = code.slice(pStart, pEnd);
if (fn.indexOf('if(next.length!==LAYERS.length) return null;') < 0)
  throw new Error('the reorder does not check it kept every layer');
/* AND NONE IS INVENTED - only names the project already has may be ordered. */
if (fn.indexOf('.filter(l=>LAYERS.indexOf(l)>=0)') < 0)
  throw new Error('the reorder would create layers the project does not have');
/* An unchanged order must report nothing, or every re-import claims a change. */
if (fn.indexOf('===LAYERS.join("\\u0000")) return null;') < 0)
  throw new Error('re-importing the same file would report a reorder that did not happen');

/* THE ORDER IS APPLIED AFTER THE RULES ARE SAVED. Before it, a failed save
   would leave the layers rearranged by an import that kept nothing. */
const impStart = code.indexOf('async function importRuleFile(f){');
const impEnd = code.indexOf('\r\n$(\'csheet\')', impStart);
const imp = code.slice(impStart, impEnd);
const saveAt = imp.indexOf('await saveRules();');
const paintAt = imp.indexOf('painted=await applyPaintOrder(fileOrder);');
if (saveAt < 0 || paintAt < 0 || paintAt < saveAt)
  throw new Error('the layers are reordered before the rules are known to be saved');

/* The bare-array form still reaches planRuleImport untouched. */
if (imp.indexOf('const doc = Array.isArray(parsed) ? parsed') < 0)
  throw new Error('the array shape is no longer passed straight through');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
