/* THE ORDER THAT SHIPS AS A TEXT FILE.

   The art side's newest upload file - UPLOAD-TO-PIXELBENCH-v12-318-traits.json,
   written today - is a BARE ARRAY of 161 rules. There is no order in it. The
   order ships beside it as LAYER-ORDER-v12-318-traits.txt: a sentence saying
   what the list is, then thirteen layer names, one to a line.

   So the feature that reads a paint order out of a collection file cannot read
   the order for the collection this project is actually moving to, and v12
   moves layers - back-extras is gone, and ears, costumes, masks and extras
   have all shifted. Arranging that by hand is about forty presses of the up
   and down buttons, which is the job that feature existed to remove.

   The safe half is already built and already tested: applyPaintOrder moves
   only layers this project has, keeps the ones the file does not mention and
   paints them last, and refuses to invent one. This only has to turn a text
   file into a list of names, and refuse anything that is not one.

   AND THE SCREEN HAS TO SHOW IT. The rules path applied the order and then
   returned without a re-render whenever no rule matched - the commonest case
   for a file that is only an order - so LAYERS was right while the shelf went
   on grouping by the previous order until something else redrew it. */
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

/* ---- 1. the picker will offer the file ---------------------------------- */
swap('<input type="file" id="rulefile" accept="application/json,.json" hidden>',
  '<input type="file" id="rulefile" accept="application/json,.json,.txt,text/plain" hidden>');

/* ---- 2. reading a plain list of layer names ----------------------------- */
swap(block([
  'async function importRuleFile(f){',
]), block([
  '/* A layer order as a plain list, one name to a line.',
  '',
  '   IT HAS TO BE ABOUT THIS PROJECT. Any text file with a few bare words on',
  '   their own lines has this shape, and silently rearranging somebody\'s',
  '   layers because they opened the wrong file is worse than refusing the',
  '   right one. So: at least two of the names must be layers this project',
  '   actually has, and they must be most of what the file names.',
  '   applyPaintOrder does the rest of the defending - it moves only layers',
  '   that exist, and keeps the ones the file leaves out. */',
  'function parseLayerOrderText(text){',
  '  const lines=String(text||"").split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);',
  '  /* A layer name is one word. The sentence the file opens with ("Pixelbench',
  '     layer order (back to front)") is not, which is why this needs no',
  '     special case for a header. */',
  '  const names=lines.filter(l=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(l));',
  '  if(names.length<2) return null;',
  '  const have=new Set(LAYERS);',
  '  const known=names.filter(n=>have.has(n));',
  '  if(known.length<2) return null;',
  '  /* MOST OF THE FILE, OR MOST OF THE PROJECT - either is evidence enough.',
  '',
  '     The first test alone was wrong, and a test caught it: a project part of',
  '     the way through an import has only four of the thirteen layers the file',
  '     names, so requiring most of the FILE refused the order until the work it',
  '     saves had already been done by hand. The JSON path accepts that project',
  '     without complaint, and the same order in two file formats behaving',
  '     differently is not a rule anybody could hold in their head.',
  '',
  '     A text file that merely happens to contain two layer words passes',
  '     neither test: it names a small share of the file and a small share of',
  '     the project. */',
  '  if(known.length*2>=names.length) return names;',
  '  if(known.length*2>=have.size) return names;',
  '  return null;',
  '}',
  'async function importRuleFile(f){',
]));

/* ---- 3. the text file is tried before the file is refused --------------- */
swap(block([
  '  let plan, fileOrder=null;',
  '  try{',
  '    const parsed=JSON.parse(await f.text());',
]), block([
  '  let plan, fileOrder=null;',
  '  /* Read once, so the parse failure below still has the text to work with. */',
  '  const raw=await f.text();',
  '  try{',
  '    const parsed=JSON.parse(raw);',
]));

swap(block([
  '  }catch(err){',
  '    note.textContent="Could not read that file: "+(err&&err.message?err.message:"it is not valid JSON")+".";',
  '    return;',
  '  }',
]), block([
  '  }catch(err){',
  '    /* NOT JSON MIGHT STILL BE THE ORDER. The v12 upload file carries no',
  '       order at all; it ships beside LAYER-ORDER-v12-318-traits.txt. */',
  '    const order=parseLayerOrderText(raw);',
  '    if(order){',
  '      let painted=null;',
  '      try{ painted=await applyPaintOrder(order); }catch(_){ painted=null; }',
  '      await renderShelf();',
  '      note.textContent="Read "+f.name+" as a layer order. "+(painted',
  '        ? "The paint order is now the file\'s ("+painted.moved',
  '          +" layers, back to front)."',
  '          +(painted.unnamed.length ? " "+painted.unnamed.length+" layer"',
  '            +(painted.unnamed.length===1?"":"s")+" it does not mention "',
  '            +(painted.unnamed.length===1?"is":"are")+" painted last ("',
  '            +painted.unnamed.join(", ")+")." : "")',
  '        : "Nothing moved: that is the order this project already has.");',
  '      return;',
  '    }',
  '    note.textContent="Could not read that file: "+(err&&err.message?err.message:"it is not valid JSON")+".";',
  '    return;',
  '  }',
]));

/* ---- 4. and the shelf is redrawn when only the order changed ------------ */
swap(block([
  '  if(!plan.groups.length){',
  '    note.textContent="Nothing to import. "+(plan.missingLayers.length',
]), block([
  '  if(!plan.groups.length){',
  '    /* THE ORDER APPLIED AND THE SCREEN DID NOT SHOW IT. This return is the',
  '       commonest path for a file that is only an order, and it used to leave',
  '       the shelf grouping by the previous one until something else redrew. */',
  '    if(painted) await renderShelf();',
  '    note.textContent="Nothing to import. "+(plan.missingLayers.length',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function parseLayerOrderText(text){', 'const raw=await f.text();',
  'const order=parseLayerOrderText(raw);', 'if(painted) await renderShelf();'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE FILE IS READ ONCE. A second read of the same stream returns nothing,
   which would make the text path a silent no-op. */
const iStart = code.indexOf('async function importRuleFile(f){');
if (iStart < 0) throw new Error('could not find importRuleFile');
const body = code.slice(iStart, iStart + 7000);
if (body.split('await f.text()').length !== 2)
  throw new Error('the file is not read exactly once');

/* IT REFUSES A FILE THAT IS NOT A LAYER LIST. Without both halves, any text
   file with a few words in it rearranges the project. */
const pStart = code.indexOf('function parseLayerOrderText(text){');
const pEnd = code.indexOf(NL + 'async function importRuleFile(', pStart);
if (pStart < 0 || pEnd < 0) throw new Error('could not bound parseLayerOrderText');
const parse = code.slice(pStart, pEnd);
for (const s of ['if(known.length<2) return null;',
  'if(known.length*2>=names.length) return names;',
  'if(known.length*2>=have.size) return names;',
  '  return null;'])
  if (parse.indexOf(s) < 0) throw new Error('the guard is missing: ' + s);

/* The picker will actually offer it. */
const markup = text.slice(0, text.indexOf('<script'));
if (markup.indexOf('id="rulefile" accept="application/json,.json,.txt,text/plain"') < 0)
  throw new Error('the file picker still filters the text file out');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
