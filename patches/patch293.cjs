/* HOW OFTEN A LAYER IS LEFT EMPTY WAS FORGOTTEN ON EVERY RELOAD.

   `let emptyChance=0.35` is a plain variable. There is no settings record for
   it, it is absent from the project export, and the markup's value="35" is
   what a page load gets. Every "of characters" figure in the app is scaled by
   it - traitChance multiplies by 1-emptyChance for any layer that is not
   always present - so it decides every percentage on every tile, in the sheet,
   in the zip message, and in the whole rarity plan.

   MEASURED, four eyes traits, set to 10% the way a person does:

     emptyChance 0.35   one trait reads 16.3% of characters
     set to 10%         the same trait reads 22.5%
     reload             back to 0.35, and 16.3% again

   The traits survived the reload; only the decision did not. So a plan made
   against 10% is read back against 35% the next morning, and nothing says the
   number moved. It is a settings record now, beside the six that already
   exist, and it travels in the project file with the grid and the rules.

   SAVED ON change, NOT ON input. The existing input handler re-renders the
   whole shelf on every keystroke of a number field, which is already more
   than it should do; adding a database write to that would be one per
   keystroke. The same split the rarity slider uses - live while you move it,
   written when you let go.

   NOT SHARED WITH TEAMMATES, and that is a gap rather than a decision. It
   would need a column on collections, which is DDL; until then two people on
   one project can read different percentages for the same trait, and the
   comment in applyEmptyChance says so where somebody will find it. */
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
const block = a => a.join(NL);

/* ---- 1. the record ------------------------------------------------- */
swap("const GRID_ID='settings.grid';", block([
  "const GRID_ID='settings.grid';",
  '/* THE EIGHTH SETTINGS RECORD. How often a layer is left empty was the one',
  '   project decision kept in nothing but a variable and a markup default, so',
  '   it reset to 35% on every page load - and every "of characters" figure in',
  '   the app is scaled by it. */',
  "const EMPTY_ID='settings.emptychance';",
]));

/* ---- 2. read it, write it ------------------------------------------- */
swap(block([
  'function applyGrid(items){',
  '  const rec=items.find(i=>i.id===GRID_ID);',
  '  const v=rec&&parseInt(rec.cells,10);',
  '  if(v&&v>=4&&v<=1024) projectGrid=v;',
  '  const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '  buildResizePresets();',
  '}',
]), block([
  'function applyGrid(items){',
  '  const rec=items.find(i=>i.id===GRID_ID);',
  '  const v=rec&&parseInt(rec.cells,10);',
  '  if(v&&v>=4&&v<=1024) projectGrid=v;',
  '  const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '  buildResizePresets();',
  '}',
  '',
  '/* How often a layer is left empty, which every percentage depends on.',
  '',
  '   Clamped on the way OUT of the store as well as on the way in. The box',
  '   guards what is typed, and a record can also arrive from a project file',
  '   somebody edited by hand - a chance of 1 would empty every layer that can',
  '   be empty and leave the shelf reading 0% for hundreds of traits.',
  '',
  '   NOT SHARED WITH TEAMMATES YET, and this is where somebody will look for',
  '   that. cloudPush sends traits and refs only, and collections has no column',
  '   for this, so two people on one project can read different percentages for',
  '   the same trait until one is added. It does travel in the project file. */',
  'function applyEmptyChance(items){',
  '  const rec=(items||[]).find(i=>i.id===EMPTY_ID);',
  '  const v=rec&&Number(rec.chance);',
  '  if(isFinite(v)&&v>=0&&v<=0.9) emptyChance=v;',
  '  const box=$("cempty"); if(box) box.value=String(Math.round(emptyChance*100));',
  '}',
  'async function saveEmptyChance(){',
  '  await dbPut({id:EMPTY_ID, kind:"settings", chance:emptyChance, at:Date.now()});',
  '}',
]));

/* ---- 3. applied where the grid is ----------------------------------- */
swap('  applyGrid(items);', '  applyGrid(items);' + NL + '  applyEmptyChance(items);');

/* ---- 4. written when the control is let go -------------------------- */
swap(block([
  "$('cempty').addEventListener('input',()=>{",
]), block([
  '/* WRITTEN ON change, not on input. The handler below re-renders the whole',
  '   shelf on every keystroke already; a database write per keystroke would be',
  '   worse. Live while you move it, saved when you let go - the same split the',
  '   rarity sliders use. */',
  "$('cempty').addEventListener('change',()=>{ saveEmptyChance(); });",
  "$('cempty').addEventListener('input',()=>{",
]));

/* ---- 5. it travels with the project --------------------------------- */
swap('const PROJECT_VERSION=3;', block([
  '/* 4: the empty chance joins the file. Older files import exactly as before -',
  '   the field is simply absent and the project keeps whatever it had - and a',
  '   NEWER file is still refused, which is the check that has to keep working',
  '   when this number moves. */',
  'const PROJECT_VERSION=4;',
]));

swap('    grid:projectGrid,', '    grid:projectGrid,' + NL + '    emptyChance:emptyChance,');

swap(block([
  '  if(wasEmpty && typeof doc.grid==="number" && doc.grid>=4 && doc.grid<=1024){',
  '    projectGrid=doc.grid;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '    await saveGrid();',
  '    restored.push("the "+projectGrid+" cell grid");',
  '  }',
]), block([
  '  if(wasEmpty && typeof doc.grid==="number" && doc.grid>=4 && doc.grid<=1024){',
  '    projectGrid=doc.grid;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '    await saveGrid();',
  '    restored.push("the "+projectGrid+" cell grid");',
  '  }',
  '  /* Same guard as the grid: only into a project that had nothing of its own',
  '     to overwrite. A file from before version 4 has no such field and leaves',
  '     this alone, which is the right answer for it. */',
  '  if(wasEmpty && typeof doc.emptyChance==="number"',
  '     && doc.emptyChance>=0 && doc.emptyChance<=0.9){',
  '    emptyChance=doc.emptyChance;',
  '    const box=$("cempty"); if(box) box.value=String(Math.round(emptyChance*100));',
  '    await saveEmptyChance();',
  '    restored.push("the "+Math.round(emptyChance*100)+"% empty chance");',
  '  }',
]));

/* ---- 6. and Clear takes it with the rest ---------------------------- */
swap('    for(const id of [RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID]){',
  '    for(const id of [RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID,EMPTY_ID]){');

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ["const EMPTY_ID='settings.emptychance';", 'function applyEmptyChance(items){',
  'async function saveEmptyChance(){', '  applyEmptyChance(items);',
  '    emptyChance:emptyChance,', 'const PROJECT_VERSION=4;',
  'doc.emptyChance>=0 && doc.emptyChance<=0.9'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* Clamped in BOTH directions on the way out of the store: a hand-edited file
   with chance 1 would empty every optional layer and read 0% everywhere. */
if (code.indexOf('if(isFinite(v)&&v>=0&&v<=0.9) emptyChance=v;') < 0)
  throw new Error('the value is not clamped when it is read back');

/* Saved on change, and the input handler still only renders. */
if (code.indexOf("$('cempty').addEventListener('change',()=>{ saveEmptyChance(); });") < 0)
  throw new Error('nothing saves the choice');
const inputHandler = code.slice(code.indexOf("$('cempty').addEventListener('input'"));
if (inputHandler.slice(0, 400).indexOf('saveEmptyChance') >= 0)
  throw new Error('the input handler writes to the database on every keystroke');

/* Clear must take it, or a cleared project keeps the old chance. */
if (code.indexOf('GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID,EMPTY_ID]') < 0)
  throw new Error('Clear does not remove the empty chance');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
