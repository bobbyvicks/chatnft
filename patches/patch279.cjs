/* THE SHARE OF A SET, WHICH IS THE NUMBER A RARITY PLAN IS MADE OF.

   traitChance answers "what fraction of CHARACTERS carry this trait". For a
   layer that can be left empty - every layer but skins, at emptyChance 0.35 -
   that is 65% at most, and the traits in the layer add up to 65 rather than
   100. That is the right number for a tile, and it is the wrong number for a
   plan: one trait per layer is drawn, so what a person is choosing between is
   the shares WITHIN the set, and those total 100 by construction.

   Both are true. They are not the same number, so they are not the same
   function - but they must be built on ONE sum, because "which traits count"
   is the part that has already gone wrong here once. traitChance's own comment
   records it: a share computed over a population the generator would not draw
   from is a confident wrong answer, wrong by exactly the traits somebody is
   most likely to be looking at.

   So the sum moves out, traitChance is rewritten in terms of it, and its
   result is unchanged by construction: plain was traitWeight(rec)/total*present
   and is now share*present with share = traitWeight(rec)/total. Identical
   arithmetic, one owner. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}

/* ---- the extraction ------------------------------------------------ */
swap([
  'function traitChance(rec,items,wipIncluded){',
].join(NL), [
  '/* How often a layer is drawn at all: every character for skins, and',
  '   1 - emptyChance for anything that can be left empty. Named because three',
  '   places ask it and a fourth is about to. */',
  'function layerPresence(layer){',
  '  return ALWAYS_PRESENT.indexOf(layer)>=0 ? 1 : Math.max(0,1-emptyChance);',
  '}',
  '',
  '/* The share of ITS OWN SET a trait takes: its weight against the weights of',
  '   every trait the generator would draw from the same layer.',
  '',
  '   NOT the same number as traitChance, and deliberately so. One trait per',
  '   layer is drawn, so the shares within a set always total 100% - which is',
  '   what somebody planning rarity is choosing between. traitChance multiplies',
  '   that by how often the layer appears at all, so ITS numbers total 65% for a',
  '   layer that can be empty. Both are true; a plan that showed the second and',
  '   claimed the set totalled 100 would not be.',
  '',
  '   ONE SUM THOUGH. traitChance is built on this rather than keeping its own',
  '   copy of the loop, because "which traits count" is the part that has',
  '   already gone wrong here once - a share computed over a population the',
  '   generator would not draw from is a confident wrong answer, and it is wrong',
  '   by exactly the traits somebody is most likely to be staring at.',
  '',
  '   Returns null rather than 0 when there is nothing to divide by, so a caller',
  '   can tell "no answer" from "never drawn". */',
  'function layerShare(rec,items,wipIncluded){',
  '  if(!traitEligible(rec,wipIncluded)) return null;',
  '  const layer=(rec&&rec.layer)||"unsorted";',
  '  let total=0;',
  '  for(const t of (items||[]))',
  '    if(traitEligible(t,wipIncluded) && (t.layer||"unsorted")===layer) total+=traitWeight(t);',
  '  /* rec is eligible and in this layer, so the total includes it and cannot',
  '     be zero - but a caller passing a list rec is not in would divide by it. */',
  '  if(!(total>0)) return null;',
  '  return traitWeight(rec)/total;',
  '}',
  '',
  'function traitChance(rec,items,wipIncluded){',
].join(NL));

/* ---- traitChance rewritten in terms of it -------------------------- */
swap([
  '  let total=0;',
  '  for(const t of (items||[]))',
  '    if(traitEligible(t,wipIncluded) && (t.layer||"unsorted")===layer) total+=traitWeight(t);',
  '  /* rec is eligible and in this layer, so the total includes it and cannot be',
  '     zero - but a caller passing a list rec is not in would divide by it. */',
  '  if(!(total>0)) return { pct:null, why:"" };',
].join(NL), [
  '  /* The sum lives in layerShare now. Same population, same arithmetic - this',
  '     used to keep its own copy of the loop. */',
  '  const share=layerShare(rec,items,wipIncluded);',
  '  if(share===null) return { pct:null, why:"" };',
].join(NL));

swap([
  '  const present = ALWAYS_PRESENT.indexOf(layer)>=0 ? 1 : Math.max(0,1-emptyChance);',
  '  const plain = traitWeight(rec)/total*present;',
].join(NL), [
  '  const present = layerPresence(layer);',
  '  const plain = share*present;',
].join(NL));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function layerShare(rec,items,wipIncluded){', 'function layerPresence(layer){',
  '  const share=layerShare(rec,items,wipIncluded);', '  const plain = share*present;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The old inline sum must be GONE, not merely joined by a new one - two copies
   of "which traits count" is the whole defect this avoids. */
if (code.indexOf('const plain = traitWeight(rec)/total*present;') >= 0)
  throw new Error('the old arithmetic survived');
const sums = code.split('if(traitEligible(t,wipIncluded) && (t.layer||"unsorted")===layer) total+=traitWeight(t);').length - 1;
if (sums !== 1) throw new Error('expected exactly one weight sum, found ' + sums);

/* And the presence rule likewise has one owner now. */
const pres = code.split('ALWAYS_PRESENT.indexOf(layer)>=0 ? 1 : Math.max(0,1-emptyChance)').length - 1;
if (pres !== 1) throw new Error('expected one presence rule, found ' + pres);

/* traitChance still returns the shape its callers read. */
for (const s of ['return { pct: seen/DIST_DRAWS, why:"", estimated:true, plain:plain };',
  'return { pct: plain, why:"", estimated:false, plain:plain };'])
  if (code.indexOf(s) < 0) throw new Error('traitChance changed shape: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
