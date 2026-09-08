/* THE PAINT ORDER WAS BEHIND A RETURN THAT FIRES ALL THE TIME.

   Measured against the real file rather than a fixture: importing
   strict-fit-v11-collection.json into a project whose layers are the v11
   fourteen but whose TRAITS are named something else reported

     "Nothing to import. The file named 0 restrictions and none of them
      applied to a trait in this project."

   and left the layer order exactly as it was. planRuleImport matches rules by
   trait name, so a project that does not hold those traits yet produces no
   groups, and importRuleFile returns before it ever reaches the reorder.

   That return is right about the RULES and wrong about the ORDER. A file
   saying backgrounds paints behind hats is not made untrue by this project not
   having SMB Bandana in it. And the case is not exotic - it is what happens
   when the rules are imported before the trait folders, which is the order the
   existing message tells people to use ("import the trait folders first").

   So the order is applied as soon as it is known, before the groups check, and
   both messages say what happened. applyPaintOrder only ever touches layers
   the project already has, so a genuinely unrelated file still moves nothing.

   The reorder no longer waits for saveRules. Those are two independent
   settings records, a partial outcome here is reported rather than silent, and
   the layer order is exactly as reversible as it was before - the up and down
   buttons. */
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

/* ---- 1. taken out of the late position -------------------------------- */
swap(block([
  '  /* AFTER the rules are saved, never before. This reorders every layer in',
  '     the project, and doing it ahead of a save that might fail would leave',
  '     the collection rearranged by an import that reported keeping nothing. */',
  '  let painted=null;',
  '  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }',
  '  await renderShelf();',
]), block([
  '  await renderShelf();',
]));

/* ---- 2. applied as soon as it is known -------------------------------- */
swap(block([
  '  /* NOTHING MATCHED IS NOT A SUCCESSFUL IMPORT OF NOTHING. The usual cause',
  '     is a project whose layers are not the ones the file names, and saying',
  '     which layers are missing is the fix. */',
  '  if(!plan.groups.length){',
  '    note.textContent="Nothing to import. "+(plan.missingLayers.length',
  '      ? "This project has no layer called "+[...new Set(plan.missingLayers)].slice(0,5).join(", ")',
  '        +" - import the trait folders first."',
  '      : "The file named "+plan.actions+" restrictions and none of them applied to a trait in this project.");',
  '    return;',
  '  }',
]), block([
  '  /* THE ORDER APPLIES EVEN WHEN NO RULE DOES, so it happens before the',
  '     check below rather than after it.',
  '',
  '     planRuleImport matches rules by trait NAME, so a project that has the',
  '     right layers but not yet the right traits produces no groups at all -',
  '     which is exactly the state somebody is in when they follow the message',
  '     below and import the rules before the trait folders. A file saying',
  '     backgrounds paints behind hats is not made untrue by that.',
  '',
  '     Safe because applyPaintOrder only moves layers this project already',
  '     has: a file about a different collection still moves nothing. */',
  '  let painted=null;',
  '  try{ painted=await applyPaintOrder(fileOrder); }catch(_){ painted=null; }',
  '  const paintSaid = painted',
  '    ? " The paint order is now the file\'s ("+painted.moved+" layers, back to front)."',
  '      +(painted.unnamed.length ? " "+painted.unnamed.length+" layer"',
  '        +(painted.unnamed.length===1?"":"s")+" it does not mention "',
  '        +(painted.unnamed.length===1?"is":"are")+" painted last ("',
  '        +painted.unnamed.join(", ")+")." : "")',
  '    : "";',
  '  /* NOTHING MATCHED IS NOT A SUCCESSFUL IMPORT OF NOTHING. The usual cause',
  '     is a project whose layers are not the ones the file names, and saying',
  '     which layers are missing is the fix. */',
  '  if(!plan.groups.length){',
  '    note.textContent="Nothing to import. "+(plan.missingLayers.length',
  '      ? "This project has no layer called "+[...new Set(plan.missingLayers)].slice(0,5).join(", ")',
  '        +" - import the trait folders first."',
  '      : "The file named "+plan.actions+" restrictions and none of them applied to a trait in this project.")',
  '      +paintSaid;',
  '    return;',
  '  }',
]));

/* ---- 3. the full report says it the same way -------------------------- */
swap(block([
  '  /* SAID, because it changes what every character looks like. A layer the',
  '     file did not mention is now painted over the ones it did. */',
  '  if(painted){',
  '    bits.push("the paint order is now the file\'s ("+painted.moved+" layers, back to front)");',
  '    if(painted.unnamed.length)',
  '      bits.push(painted.unnamed.length+" layer"+(painted.unnamed.length===1?"":"s")',
  '        +" the file does not mention "+(painted.unnamed.length===1?"is":"are")',
  '        +" painted last ("+painted.unnamed.join(", ")+")");',
  '  }',
]), block([
  '  /* SAID, because it changes what every character looks like. A layer the',
  '     file did not mention is now painted over the ones it did. One sentence,',
  '     built once above, so the two messages cannot describe it differently. */',
  '  if(paintSaid) bits.push(paintSaid.trim().replace(/\\.$/,"").replace(/^The /,"the "));',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const impStart = code.indexOf('async function importRuleFile(f){');
const impEnd = code.indexOf("\r\n$('csheet')", impStart);
if (impStart < 0 || impEnd < 0) throw new Error('could not bound importRuleFile');
const imp = code.slice(impStart, impEnd);

/* THE ORDER IS APPLIED BEFORE THE RETURN THAT SKIPS EVERYTHING ELSE. This is
   the whole patch: behind that return it never ran for anybody importing rules
   before their traits. */
const paintAt = imp.indexOf('painted=await applyPaintOrder(fileOrder);');
const bailAt = imp.indexOf('if(!plan.groups.length){');
if (paintAt < 0 || bailAt < 0) throw new Error('could not find both points');
if (paintAt > bailAt)
  throw new Error('the paint order is still behind the early return');

/* ONCE. Two calls would reorder, then reorder the reordered list. */
if (imp.split('applyPaintOrder(').length !== 2)
  throw new Error('applyPaintOrder is called more than once');

/* AND BOTH MESSAGES CARRY IT, from one sentence rather than two spellings. */
if (imp.indexOf('+paintSaid;') < 0)
  throw new Error('the nothing-to-import message does not mention the reorder');
if (imp.indexOf('if(paintSaid) bits.push(') < 0)
  throw new Error('the full report does not mention the reorder');
if (imp.split('back to front').length !== 2)
  throw new Error('the sentence is written out twice and can drift');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
