/* A LAYER LISTED TWICE STAYED LISTED TWICE.

   Found by a migration probe against the real v11 file. The fixture had built
   LAYERS with 'unsorted' in it twice - my mistake, not the app's; applyLayers
   guards against adopting a name it already holds, so the app does not produce
   this state on its own. But applyPaintOrder rebuilt the list and carried the
   duplicate straight through, because `rest` is a plain filter of LAYERS.

   A layer is identified by its NAME. Two entries with the same name are the
   same layer written twice, so collapsing them is not a policy choice, it is
   what the list already meant - and this function is rebuilding the list
   anyway, which makes it the one place that can do it for free.

   THE LENGTH CHECK HAD TO MOVE WITH IT. It exists so a reorder can never lose
   a layer and strand every trait on it, and it compares the result against
   LAYERS - so de-duplicating without changing it would make the function
   refuse to do anything at all on exactly the broken input it now repairs.
   Compared against the de-duplicated list instead, the guarantee is unchanged:
   every distinct layer that went in comes out. */
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
  'async function applyPaintOrder(order){',
  '  const want=[...new Set((order||[]).map(String))].filter(l=>LAYERS.indexOf(l)>=0);',
  '  if(!want.length) return null;',
  '  const named=new Set(want);',
  '  const rest=LAYERS.filter(l=>!named.has(l));',
  '  const next=want.concat(rest);',
  '  if(next.length!==LAYERS.length) return null;',
  '  if(next.join("\\u0000")===LAYERS.join("\\u0000")) return null;',
]), block([
  'async function applyPaintOrder(order){',
  '  /* A LAYER IS ITS NAME, so a list holding one twice is holding it once and',
  '     saying so twice. applyLayers refuses to adopt a name it already has, so',
  '     the app does not make this state - but rebuilding the list is the one',
  '     free chance to stop carrying it, and a migration probe found the old',
  '     code passing a duplicate straight through. */',
  '  const have=[...new Set(LAYERS)];',
  '  const want=[...new Set((order||[]).map(String))].filter(l=>have.indexOf(l)>=0);',
  '  if(!want.length) return null;',
  '  const named=new Set(want);',
  '  const rest=have.filter(l=>!named.has(l));',
  '  const next=want.concat(rest);',
  '  /* Against the DE-DUPLICATED list, not the raw one. The guarantee is the',
  '     same - every distinct layer that went in comes out - and comparing',
  '     against the raw length would make this refuse to run on exactly the',
  '     input it now repairs. */',
  '  if(next.length!==have.length) return null;',
  '  if(next.join("\\u0000")===LAYERS.join("\\u0000")) return null;',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const pStart = code.indexOf('async function applyPaintOrder(order){');
const pEnd = code.indexOf('\r\nasync function saveDecideOrder(', pStart);
if (pStart < 0 || pEnd < 0) throw new Error('could not bound applyPaintOrder');
const fn = code.slice(pStart, pEnd);

for (const s of ['  const have=[...new Set(LAYERS)];',
  '  const rest=have.filter(l=>!named.has(l));',
  '  if(next.length!==have.length) return null;'])
  if (fn.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* NOTHING STILL READS THE RAW LIST for membership or length - that is the
   defect, and half a fix here would keep the duplicate in one of the two. */
if (fn.indexOf('LAYERS.indexOf(l)>=0') >= 0)
  throw new Error('membership is still tested against the list with duplicates in it');
if (fn.indexOf('next.length!==LAYERS.length') >= 0)
  throw new Error('the length guard still compares against the raw list');

/* AND THE NO-OP CHECK STILL COMPARES AGAINST THE REAL LAYERS, or de-duplicating
   a list that is otherwise already in order would report itself as no change
   and never be written. */
if (fn.indexOf('next.join("\\u0000")===LAYERS.join("\\u0000")') < 0)
  throw new Error('the unchanged check no longer compares against what is stored');

/* The loss guard is still there in some form. */
if (fn.indexOf('return null;') < 0)
  throw new Error('the reorder no longer refuses anything');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
