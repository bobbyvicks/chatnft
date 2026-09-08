/* THE LAYER MIGRATION: the machinery existed, the adapter did not.

   The live collection carries SEVENTEEN layer names - both the old vocabulary
   (accessories, hair-headwear, unsorted) and v11's (hats, hair, glasses,
   back-extras). v11 wants fourteen, in a stated back-to-front order.

   Almost none of this needed building. "Sort by inventory" already reads a
   per-trait list, dry-runs it, shows what would move, refuses a destination
   that already holds that name, creates missing layers, moves the server copy
   and retargets the rules; applyPaintOrder sets the order; retargetRules now
   carries the reviewed answers across. What was missing was that planSort
   opens with

     if(!Array.isArray(inventory)) throw new Error("That file is not a trait inventory.")

   and NEITHER file the handoff ships is an array. So the one gesture that
   could move 317 traits to their v11 layers refused both of the files that
   say where those traits belong.

   TWO SHAPES, ONE MEANING. The collection object's `names` is {layer: [file
   names]} - a layer for every trait, which is exactly an inventory written the
   other way up. The review queue's entries carry the layer plus BOTH names,
   and originalName maps onto previousName, which is how planSort finds a trait
   that has already been renamed. Anything else is passed through untouched so
   its own error message still names the real problem.

   AND THE ORDER COMES WITH IT. A file that states the paint order applies it
   after the move, through the same applyPaintOrder the rules import uses - so
   one gesture puts every trait on its v11 layer AND puts the layers in v11's
   order, which is the whole migration. */
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

/* ---- 1. the adapter ---------------------------------------------------- */
swap('function planSort(traits, inventory){', block([
  '/* The three shapes that say where a trait belongs, as the one shape planSort',
  '   reads: [{layer, trait, previousName}].',
  '',
  '   A bare array is already it. A review queue carries the layer and both',
  '   names per entry, and originalName IS previousName - which is how a trait',
  '   that has been renamed since the queue was seeded still gets found. A',
  '   collection object carries names as {layer: [file names]}, an inventory',
  '   written the other way up.',
  '',
  '   Anything else is returned untouched, so planSort refuses it with the',
  '   message that names the real problem rather than one invented here. */',
  'function asInventory(doc){',
  '  if(Array.isArray(doc)) return doc;',
  '  if(doc&&Array.isArray(doc.traits))',
  '    return doc.traits.filter(e=>e&&e.layer&&(e.currentName||e.originalName))',
  '      .map(e=>({layer:String(e.layer), trait:String(e.currentName||e.originalName),',
  '                previousName:e.originalName||null}));',
  '  if(doc&&doc.names&&typeof doc.names==="object"&&!Array.isArray(doc.names)){',
  '    const out=[];',
  '    for(const layer of Object.keys(doc.names)){',
  '      const list=doc.names[layer];',
  '      if(!Array.isArray(list)) continue;',
  '      for(const n of list) if(n) out.push({layer:String(layer), trait:String(n)});',
  '    }',
  '    return out;',
  '  }',
  '  return doc;',
  '}',
  'function planSort(traits, inventory){',
]));

/* ---- 2. read through it, and remember the order the file states -------- */
swap(block([
  '  let items=[]; try{ items=await dbAll(); }catch(_){ }',
  '  try{ sortPlan=planSort(items.filter(i=>i.kind==="trait"), JSON.parse(await f.text())); }',
  '  catch(err){ toast("Could not read that file: "+((err&&err.message)||"not valid JSON")); return; }',
]), block([
  '  let items=[]; try{ items=await dbAll(); }catch(_){ }',
  '  try{',
  '    const doc=JSON.parse(await f.text());',
  '    /* Held for after the move: applying it before would order layers that',
  '       do not exist yet, because the ones this file is about to create are',
  '       created by sortApply. */',
  '    sortOrder=(doc&&Array.isArray(doc.order))?doc.order.map(String):null;',
  '    sortPlan=planSort(items.filter(i=>i.kind==="trait"), asInventory(doc));',
  '  }',
  '  catch(err){ sortOrder=null; toast("Could not read that file: "+((err&&err.message)||"not valid JSON")); return; }',
]));

swap(block([
  "$('sortopen').onclick=()=>$('sortfile').click();",
]), block([
  '/* The paint order a sort file stated, applied once the layers it names',
  '   exist. */',
  'let sortOrder=null;',
  "$('sortopen').onclick=()=>$('sortfile').click();",
]));

/* ---- 3. and the order lands after the move ---------------------------- */
swap(block([
  '  const r=await sortApply(sortPlan);',
  '  btn.textContent="Move them";',
  '  $("sortscrim").hidden=true;',
  '  await renderShelf();',
]), block([
  '  const r=await sortApply(sortPlan);',
  '  btn.textContent="Move them";',
  '  $("sortscrim").hidden=true;',
  '  /* AFTER the move, because sortApply is what creates the layers the file',
  '     names - applyPaintOrder only orders layers that already exist, so',
  '     running it first would silently skip every new one. */',
  '  let painted=null;',
  '  try{ painted=await applyPaintOrder(sortOrder); }catch(_){ painted=null; }',
  '  sortOrder=null;',
  '  await renderShelf();',
]));

swap(block([
  '  if(r.failed) bits.push(r.failed+" could not be written");',
]), block([
  '  if(r.failed) bits.push(r.failed+" could not be written");',
  '  if(painted) bits.push("the paint order is now the file\'s ("+painted.moved',
  '    +" layers, back to front)");',
  '  /* NAMED, because an empty layer is the visible half of a migration: these',
  '     are the ones the old vocabulary left behind, and Layers is where they',
  '     are removed. */',
  '  {',
  '    let after=[]; try{ after=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){}',
  '    const used=new Set(after.map(t=>t.layer||"unsorted"));',
  '    const empty=LAYERS.filter(l=>l!=="unsorted"&&!used.has(l));',
  '    if(empty.length) bits.push(empty.length+" layer"+(empty.length===1?"":"s")',
  '      +" now hold nothing ("+empty.join(", ")+") and can be removed in Layers");',
  '  }',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function asInventory(doc){', 'let sortOrder=null;',
  '    sortPlan=planSort(items.filter(i=>i.kind==="trait"), asInventory(doc));',
  '  try{ painted=await applyPaintOrder(sortOrder); }catch(_){ painted=null; }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const aStart = code.indexOf('function asInventory(doc){');
const aEnd = code.indexOf('function planSort(traits, inventory){', aStart);
if (aStart < 0 || aEnd < 0) throw new Error('could not bound asInventory');
const fn = code.slice(aStart, aEnd);

/* AN ARRAY IS ALREADY THE SHAPE. Wrapping it would break every inventory file
   that works today. */
if (fn.indexOf('if(Array.isArray(doc)) return doc;') < 0)
  throw new Error('a plain inventory no longer passes through unchanged');

/* THE OLD NAME IS CARRIED, or a trait renamed since the file was written
   cannot be found and reads as unknown. */
if (fn.indexOf('previousName:e.originalName||null') < 0)
  throw new Error('the queue adapter drops the previous name planSort matches on');

/* AND AN UNRECOGNISED SHAPE IS PASSED THROUGH, so planSort's own message is
   what the reader sees rather than one invented here. */
if (fn.indexOf('  return doc;') < 0)
  throw new Error('an unknown shape is transformed instead of being refused downstream');

/* THE ORDER IS APPLIED AFTER THE MOVE. Before it, the layers the file creates
   do not exist yet and applyPaintOrder skips every one of them. */
const gStart = code.indexOf("$('sortgo').onclick=async()=>{");
const gEnd = code.indexOf('\r\n};', gStart);
const go = code.slice(gStart, gEnd);
if (go.indexOf('applyPaintOrder(sortOrder)') < go.indexOf('await sortApply(sortPlan);'))
  throw new Error('the paint order is applied before the layers exist');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
