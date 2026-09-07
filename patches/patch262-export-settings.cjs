/* THE PROJECT EXPORT DROPS FIVE OF THE SIX THINGS A PROJECT KNOWS.

   Export project exists because the plain zip loses things - its own comment
   says "the layer order or the rarities at all, which is exactly what the
   existing Download all loses". It is the only backup this page offers.

   It writes { format, version, savedAt, layers, items }, and it starts with

     const keep=items.filter(i=>i.kind==="trait"||i.kind==="ref");

   which throws away every settings record before it begins. The project keeps
   six of them. Measured by exporting a filled project, wiping the browser and
   importing it back:

     traits, layer, rarity     came back      (the control - this part worked)
     combination rules         1 -> 0
     the answers behind them   1 -> 0
     the decide order          3 -> 0
     the cell grid             128 -> 160     (silently the default again)
     hidden layers             1 -> 0
     the learnt base colour    2 -> 0

   The rules are the largest body of work in a collection - a hundred-odd of
   them here - and the decisions are the record of what a team answered while
   reviewing. Restoring a backup lost both, behind a message that said how
   many items were imported.

   AND THE COMMENT ON projectGrid CLAIMED OTHERWISE: "Stored with the project,
   like the layer order, because it is a fact about the collection and not
   about the device." The layer order is PATCHed to the server by saveLayers
   AND carried in the export; the grid was in neither. The export half is
   fixed here. The server half is not - collections has no column for it,
   adding one is the user's call, and the comment now says which is which
   rather than implying both are handled.

   RESTORE AND MERGE ARE DIFFERENT AND THE CODE SAYS WHICH IT IS DOING. The
   importer already keeps that rule for traits - "Someone importing a friend's
   traits should not lose their own" - so rules and answers MERGE, always, and
   the single-value settings are taken only when there is nothing to lose:
   `wasEmpty`, meaning this browser held no traits at all, which is a restore.
   An import into a live project adds rules and answers and touches nothing
   else. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const ver = kit.only(L, l => l === 'const PROJECT_VERSION=2;', 'the format version');
const docLine = kit.only(L, l => l === '  const doc={format:PROJECT_FORMAT, version:PROJECT_VERSION,',
  'the exported document');
if (L[docLine + 1] !== '    savedAt:new Date().toISOString(), layers:LAYERS.slice(), items:out};')
  throw new Error('the exported document is not the two lines assumed');

/* SCOPED TO importProject. cloudPull holds a layer-merge block of exactly the
   same five lines - the two ways layers arrive - and an unscoped anchor found
   both and refused, which is the refusal working. Only the import one moves
   here; the cloud one is a different question and is left alone. */
const impFn = kit.inFunction(L, 'async function importProject(file){');
const impStart = kit.only(L, l => l === '  let newLayers=0;', 'the import layer merge', impFn);
const want = [
  '  let newLayers=0;',
  '  if(Array.isArray(doc.layers)){',
  '    for(const l of doc.layers) if(LAYERS.indexOf(l)<0){ LAYERS.push(l); newLayers++; }',
  '    if(newLayers) await saveLayers();',
  '  }',
];
for (let i = 0; i < want.length; i++)
  if (L[impStart + i] !== want[i])
    throw new Error('line ' + (i + 1) + ' of the layer merge is not what was expected:\n  want ' + want[i] + '\n  got  ' + L[impStart + i]);

const taken = kit.only(L, l => l === '  const taken=new Set(existing.map(i=>i.id));', 'where existing is read', impFn);
const bits = kit.only(L, l => l === '  const bits=["Imported "+added+" item"+(added===1?"":"s")];', 'the import message', impFn);
const gridClaim = kit.only(L,
  l => l === '   order, because it is a fact about the collection and not about the device. */',
  'the projectGrid comment claim');

/* Everything the new code calls, so a rename elsewhere refuses this rather
   than shipping a call to something that is not there. */
for (const sig of ['function ruleId(g){ return (g||[]).join("\\u0000"); }',
  'async function saveGrid(){', 'async function saveDecideOrder(){',
  'async function saveBaseColours(list){', 'async function saveRules(){',
  'function mergeDecisions(a,b){']) {
  kit.only(L, l => l === sig, 'the helper ' + sig.replace(/^(async )?function /, '').slice(0, 24));
}

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 5. The message says what came back, or a restore that silently dropped the
      rules again would look exactly like one that did not. */
kit.replace(L, { start: bits, end: bits }, [
  '  const bits=["Imported "+added+" item"+(added===1?"":"s")];',
  '  if(restored.length) bits.push("restored "+restored.join(", "));',
]);

/* 4. The settings. */
/* The three-line note above it goes in the same write. Deleting it separately
   meant a second anchor into a range the first write had already moved, which
   refused - correctly. One range, one write. */
if (L[impStart - 3] !== '  /* Layers the file knows about and this browser does not get appended, in the')
  throw new Error('the layer-merge note is not three lines above the block');
kit.replace(L, { start: impStart - 3, end: impStart + want.length - 1 }, [
  '  /* THE SETTINGS. Rules and answers MERGE, always: the importer already',
  '     refuses to let a file cost somebody their traits, and their rules and',
  '     their review are worth the same care. The rest is taken only on a',
  '     RESTORE - wasEmpty, this browser held no traits at all - because a grid',
  '     or a draw order belongs to the collection that is already open, and a',
  '     friend\'s file does not get to redraw it. */',
  '  const restored=[];',
  '  if(Array.isArray(doc.rules)&&doc.rules.length){',
  '    const have=new Set(RULES.map(ruleId));',
  '    let gained=0;',
  '    for(const g of doc.rules){',
  '      if(!Array.isArray(g)||g.length<2) continue;',
  '      const s=g.map(String).slice().sort();',
  '      const k=ruleId(s);',
  '      if(have.has(k)) continue;',
  '      have.add(k); RULES.push(s); gained++;',
  '    }',
  '    if(gained) restored.push(gained+" rule"+(gained===1?"":"s"));',
  '  }',
  '  if(Array.isArray(doc.decisions)&&doc.decisions.length){',
  '    const was=DECISIONS.length;',
  '    DECISIONS=mergeDecisions(DECISIONS, doc.decisions);',
  '    const gain=DECISIONS.length-was;',
  '    if(gain) restored.push(gain+" answer"+(gain===1?"":"s"));',
  '  }',
  '  if(restored.length) await saveRules();',
  '  if(wasEmpty && Array.isArray(doc.decideOrder) && doc.decideOrder.length){',
  '    DECIDE_ORDER=doc.decideOrder.map(String).filter(Boolean);',
  '    await saveDecideOrder();',
  '    restored.push("the draw order");',
  '  }',
  '  if(wasEmpty && Array.isArray(doc.baseColours) && doc.baseColours.length){',
  '    await saveBaseColours(doc.baseColours.filter(c=>c&&typeof c.r==="number"));',
  '    if(BASE_KEEP.length) restored.push("the base colour");',
  '  }',
  '  if(wasEmpty && typeof doc.grid==="number" && doc.grid>=4 && doc.grid<=1024){',
  '    projectGrid=doc.grid;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '    await saveGrid();',
  '    restored.push("the "+projectGrid+" cell grid");',
  '  }',
  '  /* Layers the file knows about and this browser does not get appended, in',
  '     the order the file had them. The local order is not rewritten: it is',
  '     this collection\'s draw order and the imported file does not get to',
  '     reorder it. */',
  '  let newLayers=0;',
  '  if(Array.isArray(doc.layers)){',
  '    for(const l of doc.layers) if(LAYERS.indexOf(l)<0){ LAYERS.push(l); newLayers++; }',
  '  }',
  '  /* After the layers, so a layer the file names has somewhere to be hidden.',
  '     On a restore only: a layer you can see in a project you are already',
  '     working in is one you chose to see. */',
  '  let hid=0;',
  '  if(wasEmpty && Array.isArray(doc.hidden)){',
  '    for(const l of doc.hidden)',
  '      if(LAYERS.indexOf(l)>=0 && !HIDDEN_LAYERS.has(l)){ HIDDEN_LAYERS.add(l); hid++; }',
  '    if(hid) restored.push(hid+" layer"+(hid===1?"":"s")+" turned off");',
  '  }',
  '  if(newLayers||hid) await saveLayers();',
]);

/* 2. wasEmpty, beside where existing is already read. */
kit.replace(L, { start: taken, end: taken }, [
  '  const taken=new Set(existing.map(i=>i.id));',
  '  /* A RESTORE, not a merge. Nothing here to lose, so the settings in the',
  '     file are the only ones there are. With traits already present this is',
  '     somebody adding to a project they are working in, and their grid and',
  '     draw order are the ones that count. */',
  '  const wasEmpty=!existing.some(i=>i.kind==="trait");',
]);

/* 1c. The exported document. */
kit.replace(L, { start: docLine, end: docLine + 1 }, [
  '  /* EVERY SETTING, not just the layer order. This wrote layers and items and',
  '     nothing else, while the store held six settings records - so the grid,',
  '     the rules, the answers behind them, the decide order and the base colour',
  '     were all dropped. Measured by exporting a filled project, wiping the',
  '     browser and importing it back: one rule became none and 128 cells became',
  '     160, and the only thing said about it was how many items were imported. */',
  '  const doc={format:PROJECT_FORMAT, version:PROJECT_VERSION,',
  '    savedAt:new Date().toISOString(),',
  '    layers:LAYERS.slice(), hidden:[...HIDDEN_LAYERS].sort(),',
  '    grid:projectGrid,',
  '    rules:RULES.map(g=>g.slice()),',
  '    decisions:DECISIONS.map(d=>({a:d.a,b:d.b,ok:d.ok,at:d.at,by:d.by||null,src:d.src||"you"})),',
  '    decideOrder:DECIDE_ORDER.slice(),',
  '    baseColours:BASE_KEEP.map(q=>({r:q.r,g:q.g,b:q.b})),',
  '    items:out};',
]);

/* 1b. The version. */
kit.replace(L, { start: ver, end: ver }, [
  '/* 3, not 2: the document gained the settings it had been dropping. A file',
  '   written by 2 still imports - the new fields are simply absent, and every',
  '   read of them is guarded - which is what the version check allows by',
  '   comparing rather than demanding equality. */',
  'const PROJECT_VERSION=3;',
]);

/* 1a. The claim on projectGrid. */
kit.replace(L, { start: gridClaim, end: gridClaim }, [
  '   order, because it is a fact about the collection and not about the device.',
  '   CARRIED IN THE PROJECT EXPORT, AND NOT TO THE SERVER - which is the half',
  '   of that sentence that was untrue. saveLayers PATCHes the layer order to',
  '   collections; there is no column here to PATCH, so a teammate opening the',
  '   same collection gets whatever their own browser last saved. */',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const PROJECT_VERSION=3;') !== 1) throw new Error('the version did not move');
  for (const f of ['rules:RULES.map(g=>g.slice()),', 'grid:projectGrid,',
    'decideOrder:DECIDE_ORDER.slice(),', 'baseColours:BASE_KEEP.map'])
    if (code.indexOf(f) < 0) throw new Error('the export is missing ' + f);
  for (const f of ['doc.rules', 'doc.decisions', 'doc.decideOrder', 'doc.baseColours',
    'doc.hidden', 'doc.grid'])
    if (code.indexOf(f) < 0) throw new Error('the import never reads ' + f);
  if (code.indexOf('const wasEmpty=!existing.some') < 0) throw new Error('wasEmpty is not defined');
  /* saveLayers is called ONCE now, for either reason - two calls would write
     the record twice on a restore that both added a layer and hid one. */
  if (has('  if(newLayers||hid) await saveLayers();') !== 1) throw new Error('the layer save did not land');
  /* ONE left, not none: cloudPull has the same line, for layers arriving from
     the server, and this patch does not touch it. A check demanding zero was
     wrong about the file rather than about the change, and it refused the
     write until it was corrected. */
  if (has('    if(newLayers) await saveLayers();') !== 1)
    throw new Error('expected cloudPull to keep its layer save, and only it');
  /* The corrected claim replaced the false one rather than sitting beside it. */
  if (lines.some(l => l === '   order, because it is a fact about the collection and not about the device. */'))
    throw new Error('the old projectGrid claim is still there');
});

console.log('index.html grew by ' + grew + ' bytes');
