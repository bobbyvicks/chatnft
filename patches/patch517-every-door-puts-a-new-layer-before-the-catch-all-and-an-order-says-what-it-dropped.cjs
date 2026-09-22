/* EVERY DOOR PUTS A NEW LAYER BEFORE THE CATCH-ALL, AND A PAINT ORDER SAYS
   WHAT IT DROPPED.

   TWO DOORS APPENDED. Four places adopt a layer name this project has not
   got. bulkImport, applyLayers and sortApply splice it in before "unsorted",
   which the file says stays last in four places and enforces with a disabled
   delete button - last in LAYERS is the FRONT of the paint order. importProject
   (a project file) and cloudPull (the team's collection) did LAYERS.push(l),
   after it. So a layer arriving through either of those was painted over
   every other layer, including the catch-all, and nothing said so. Measured
   by tests/layerdoors.spec.js run against d25c6a8 before this patch: the
   project-file and cloud-pull cases red on the ordering assertion, the other
   two green.

   AND AN ORDER DROPPED NAMES IN SILENCE. applyPaintOrder only orders layers
   the project already has, which is right - a paint order must not invent a
   layer - and it never said which names it had dropped. Handed the file that
   ships with the collection, a fresh page on the old default list printed
   "The paint order is now the file's (10 layers, back to front). 3 layers it
   does not mention are painted last (accessories, hair-headwear, unsorted)."
   The paint order was not the file's: glasses, hair and hats had been thrown
   away, and the sentence reporting the OTHER direction of the same mismatch
   made the silence look like precision. The JSON rules path already reports
   its missingLayers; this door did not.

   AND "NOTHING MOVED" HID THEM TOO. When the names the file and the project
   share were already in the file's order, applyPaintOrder returned null before
   it looked at the names it had dropped, so the note read "Nothing moved: that
   is the order this project already has" about a file naming layers the
   project has not got. Found by this patch's own spec against the first draft.

   applyPaintOrder now returns what it could not place, in every case, and one
   function words the report for all four places that printed it - two of
   which said less than the other two. The import note also names the layers
   it left holding nothing, the way the sort path already does, restricted to
   layers that are not defaults: a fresh project's empty default layers are
   empty by design, and the ones worth naming are the ones a vocabulary left
   behind. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const inPaint = () => kit.inFunction(L, 'async function applyPaintOrder(order){');

/* ---- 1. applyPaintOrder says what it could not place, every time --------- */
swap('  const want=[...new Set((order||[]).map(String))].filter(l=>have.indexOf(l)>=0);', [
  '  const asked=[...new Set((order||[]).map(String))];',
  '  const want=asked.filter(l=>have.indexOf(l)>=0);',
  '  /* THE NAMES IT WAS GIVEN AND CANNOT PLACE. The refusal to invent a layer',
  '     is stated above and stays; what was missing is that it was never SAID -',
  '     a thirteen-layer order applied to a ten-layer project reported "10',
  '     layers, back to front" and nothing about the other three. And NOTHING',
  '     TO MOVE IS STILL AN ANSWER: "nothing moved" on its own reads as "the',
  '     file agrees with the project", which a file naming layers the project',
  '     has not got does not. So the dropped names come back through every',
  '     early return, not only the one that moved something. */',
  '  const unplaced=asked.filter(l=>have.indexOf(l)<0);',
  '  const still=()=>unplaced.length ? {moved:0, unnamed:[], unplaced:unplaced} : null;',
], 'the want line', inPaint());
swap('  if(!want.length) return null;', ['  if(!want.length) return still();'], 'the nothing-named return', inPaint());
swap('  if(next.join("\\u0000")===LAYERS.join("\\u0000")) return null;',
  ['  if(next.join("\\u0000")===LAYERS.join("\\u0000")) return still();'], 'the nothing-moved return', inPaint());
swap('  return {moved:want.length, unnamed:rest};',
  ['  return {moved:want.length, unnamed:rest, unplaced:unplaced};'], 'the return', inPaint());
{
  const fn = inPaint();
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* WHAT THE PAINT ORDER DID, IN ONE PLACE. Four call sites reported this and',
    '   two of them said less than the other two; none said what the file named',
    '   and this project does not have. Clauses, not a sentence, because two of',
    '   the callers join a bits[] with ". " and two build prose. */',
    'function paintOrderSaid(p){',
    '  if(!p) return [];',
    '  const out=[p.moved',
    '    ? "the paint order is now the file\'s ("+p.moved+" layers, back to front)"',
    '    : "the paint order was not changed"];',
    '  if(p.moved&&p.unnamed.length) out.push(p.unnamed.length+" layer"+(p.unnamed.length===1?"":"s")',
    '    +" it does not mention "+(p.unnamed.length===1?"is":"are")+" painted last ("',
    '    +p.unnamed.join(", ")+")");',
    '  if(p.unplaced.length) out.push(p.unplaced.length+" name"+(p.unplaced.length===1?"":"s")',
    '    +" the file gives "+(p.unplaced.length===1?"is":"are")+" not a layer of this project, so "',
    '    +(p.unplaced.length===1?"it was":"they were")+" not created ("+p.unplaced.join(", ")',
    '    +") - import the trait folders first");',
    '  return out;',
    '}',
  ]);
}

/* ---- 2. the four places that said it, now saying the same thing --------- */
{
  /* (a) the sort report */
  const a = at('  if(painted) bits.push("the paint order is now the file\'s ("+painted.moved', 'the sort report clause');
  if (L[a + 1] !== '    +" layers, back to front)");') throw new Error('the sort report clause is not two lines');
  kit.replace(L, { start: a, end: a + 1 }, ['  bits.push(...paintOrderSaid(painted));']);
  /* (b) the queue import */
  swap('  if(painted) bits.push("the paint order is now the file\'s");', ['  bits.push(...paintOrderSaid(painted));'], 'the queue import clause');
  /* (c) the plain-text order file */
  const c = kit.run(L,
    l => l === '      note.textContent="Read "+f.name+" as a layer order. "+(painted',
    l => l === '        : "Nothing moved: that is the order this project already has.");',
    'the text-order note');
  kit.replace(L, { start: c.start, end: c.end }, [
    '      note.textContent="Read "+f.name+" as a layer order. "+(painted',
    '        ? paintOrderSaid(painted).map(s=>s.charAt(0).toUpperCase()+s.slice(1)+".").join(" ")',
    '        : "Nothing moved: that is the order this project already has.");',
  ]);
  /* (d) the collection file */
  const d = kit.run(L,
    l => l === '  const paintSaid = painted',
    l => l === '    : "";',
    'the collection-file paintSaid');
  if (d.end - d.start !== 6) throw new Error('paintSaid is not seven lines: ' + (d.end - d.start + 1));
  kit.replace(L, { start: d.start, end: d.end }, [
    '  const paintSaid = painted',
    '    ? paintOrderSaid(painted).map(s=>" "+s.charAt(0).toUpperCase()+s.slice(1)+".").join("")',
    '    : "";',
  ]);
}

/* ---- 3. the two doors ---------------------------------------------------- */
for (const [who, arg, v] of [['importProject', 'file', 'doc'], ['cloudPull', 'opts', 'c']]) {
  const fn = kit.inFunction(L, 'async function ' + who + '(' + arg + '){');
  swap('    for(const l of ' + v + '.layers) if(LAYERS.indexOf(l)<0){ LAYERS.push(l); newLayers++; }', [
    '    /* BEFORE "unsorted", the rule the import, applyLayers and the sort all',
    '       use. push() put a new layer AFTER the catch-all, which is the front of',
    '       the paint order, so a layer arriving this way was drawn over',
    '       everything - including unsorted, which three comments and a disabled',
    '       delete button say stays last. patch517. */',
    '    for(const l of ' + v + '.layers) if(LAYERS.indexOf(l)<0){',
    '      const u=LAYERS.indexOf("unsorted");',
    '      if(u>=0) LAYERS.splice(u,0,l); else LAYERS.push(l);',
    '      newLayers++;',
    '    }',
  ], 'the ' + who + ' door', fn);
}

/* ---- 4. the import names the layers it left holding nothing ------------- */
{
  const i = at('    +" from the folder names ("+adopted.join(", ")+") - check the draw order in Layers");', 'the adopted clause');
  kit.replace(L, { start: i, end: i }, [
    '    +" from the folder names ("+adopted.join(", ")+") - check the draw order in Layers");',
    '  /* THE OTHER HALF OF A VOCABULARY CHANGE. The sort path names the layers',
    '     it left empty; the import did not, so somebody importing the collection',
    '     into a project on the old list was left with accessories and',
    '     hair-headwear holding nothing and no mention of them. Restricted to',
    '     layers that are NOT defaults: a fresh project\'s thirteen are empty by',
    '     design until something lands on each, and naming those on every partial',
    '     import would be noise. The ones worth naming are the ones a vocabulary',
    '     left behind. */',
    '  { let after=[]; try{ after=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){}',
    '    const used=new Set(after.map(t=>t.layer||"unsorted"));',
    '    const stranded=LAYERS.filter(l=>l!=="unsorted"&&DEFAULT_LAYERS.indexOf(l)<0&&!used.has(l));',
    '    if(stranded.length) bits.push(stranded.length+" layer"+(stranded.length===1?"":"s")',
    '      +" now hold nothing ("+stranded.join(", ")+") and can be removed in Layers"); }',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  never('LAYERS.push(l); newLayers++;');
  need('function paintOrderSaid(p){');
  need('return {moved:want.length, unnamed:rest, unplaced:unplaced};');
  need('if(!want.length) return still();');
  /* ONE WORDING: the phrases live in paintOrderSaid and nowhere else. */
  const times = (re) => (code.match(re) || []).length;
  if (times(/the paint order is now the file/g) !== 1)
    throw new Error('the paint-order sentence is worded in ' + times(/the paint order is now the file/g) + ' places');
  if (times(/it does not mention/g) !== 1)
    throw new Error('the unnamed clause is worded in ' + times(/it does not mention/g) + ' places');
  if (times(/paintOrderSaid\(/g) !== 5)
    throw new Error('paintOrderSaid: 1 definition + 4 callers expected, found ' + times(/paintOrderSaid\(/g));
  /* THE TWO DOORS SPLICE NOW, and the ones that already did are untouched:
     exactly two more instances of the idiom than the file had before. Counted
     against the original rather than against a number I typed - the first
     draft said three and the file already held three (bulkImport, applyLayers,
     sortApply) before this patch added its two. */
  const splice = /const u=LAYERS\.indexOf\("unsorted"\);\s*\r?\n\s*if\(u>=0\) LAYERS\.splice\(u,0,l\); else LAYERS\.push\(l\);/g;
  const before = (kit.code(kit.scriptOf(doc.original)).match(splice) || []).length;
  if (times(splice) !== before + 2)
    throw new Error('expected ' + (before + 2) + ' splice-before-unsorted adoptions (' + before + ' already there plus the two doors), found ' + times(splice));
  need('DEFAULT_LAYERS.indexOf(l)<0&&!used.has(l)');
  /* THE HELPER, EXERCISED. */
  const a = code.indexOf('function paintOrderSaid(p){');
  const b = code.indexOf('\n}', a);
  const said = new Function(code.slice(a, b + 2) + '\nreturn paintOrderSaid;')();
  const is = (got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error('said: got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
  is(said(null), []);
  is(said({ moved: 3, unnamed: [], unplaced: [] }), ["the paint order is now the file's (3 layers, back to front)"]);
  is(said({ moved: 3, unnamed: ['unsorted'], unplaced: ['glasses', 'hats'] }), [
    "the paint order is now the file's (3 layers, back to front)",
    '1 layer it does not mention is painted last (unsorted)',
    '2 names the file gives are not a layer of this project, so they were not created (glasses, hats) - import the trait folders first',
  ]);
  is(said({ moved: 2, unnamed: ['a', 'b'], unplaced: ['visors'] }), [
    "the paint order is now the file's (2 layers, back to front)",
    '2 layers it does not mention are painted last (a, b)',
    '1 name the file gives is not a layer of this project, so it was not created (visors) - import the trait folders first',
  ]);
  is(said({ moved: 0, unnamed: [], unplaced: ['visors'] }), [
    'the paint order was not changed',
    '1 name the file gives is not a layer of this project, so it was not created (visors) - import the trait folders first',
  ]);
});

fs.renameSync(TMP, FILE);
console.log('patch517 written, ' + grew + ' bytes');
