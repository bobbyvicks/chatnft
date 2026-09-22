/* THE DEFAULT LAYERS ARE THE COLLECTION'S THIRTEEN.

   index.html:3950 shipped
     backgrounds, skins, clothing, costumes, chains, accessories, extras, ears,
     mouth, eyes, hair-headwear, masks, unsorted
   and the collection on disk has thirteen folders that are not those:
     backgrounds, skins, mouth, eyes, glasses, clothing, chains, hair, hats,
     ears, costumes, masks, extras.
   Two names the collection never had, three it has had since 2026-09-06
   missing. The page already knew the right thirteen - PLACEMENT_REF is keyed
   by exactly them - so one file held one vocabulary in one table and
   contradicted it in another.

   MEASURED on a fresh page over the 311 working traits, 2026-09-21: 84
   printed a colour count with no guideline (glasses 16, hair 29, hats 39),
   12 of them past it; 3 of 13 categories had no placement reference reachable
   from the layer select; 13 of the 26 rule edges in a shipped rules file were
   dropped by decideOrderFor because a rule cannot name a layer the page has
   not got; and whichever recorded order file was applied, accessories and
   hair-headwear finished painted in FRONT of all 311 traits, because
   applyPaintOrder puts what the file does not name last.

   THE SET IS SETTLED. THE SEQUENCE IS THE LAST RECORDED ONE, AND SAYS SO.
   The order is v12/v13/v14's, byte-identical across three inventory
   revisions and filed under "Approved decisions" on 2026-09-10. It is not
   the only recorded order: a 2026-09-06 record, the one a human is recorded
   as specifying with a reason, puts eyes and glasses ABOVE hair, and this one
   puts hair above both. Measured over the real collection that is 46 of 464
   hair/glasses pairs burying 40% or more of the glasses, against 0 the other
   way. That is a taste call the file cannot make and the comment does not
   pretend to; with the SET right it is one file drop to reverse, which it was
   not before - with the old set, applying either recorded order left two dead
   layers in front of everything.

   A PROJECT THAT ALREADY HAS settings.layers SEES NO CHANGE. applyLayers
   replaces LAYERS wholesale from the record, and the complete migration -
   Sort by inventory, then the paint order, then "N layers now hold nothing"
   - already exists and is pinned by tests/layermigration.spec.js on exactly
   these two retired names. An automatic rewrite would also be pushed to the
   whole team by cloudCollection. So: nothing automatic, on purpose.

   api/identify.ts carried a second hardcoded copy of the old list and fed it
   to z.enum, so the identify endpoint could never answer hats, hair or
   glasses and could answer the two retired names, which the save path would
   then have adopted back. Same fourteen, same commit. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const API = path.join(__dirname, '..', 'api', 'identify.ts');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);

const NEW = ['backgrounds', 'skins', 'mouth', 'eyes', 'glasses', 'clothing', 'chains',
  'hair', 'hats', 'ears', 'costumes', 'masks', 'extras'];

/* ---- 1. the list, with the reason ------------------------------------- */
{
  const a = at("const DEFAULT_LAYERS=['backgrounds','skins','clothing','costumes','chains','accessories',", 'the old list, line 1');
  const b = at("  'extras','ears','mouth','eyes','hair-headwear','masks','unsorted'];", 'the old list, line 2');
  if (b !== a + 1) throw new Error('the list is not two lines');
  kit.replace(L, { start: a, end: b }, [
    "/* THE COLLECTION'S OWN THIRTEEN FOLDERS, in its last recorded back-to-front",
    '   order, then the catch-all.',
    '',
    "   SUPERSEDES ['backgrounds','skins','clothing','costumes','chains','accessories',",
    "   'extras','ears','mouth','eyes','hair-headwear','masks','unsorted'], which held",
    '   two names the collection never had and lacked glasses, hair and hats, which',
    '   it has had since 2026-09-06. PLACEMENT_REF below is keyed by exactly these',
    '   thirteen, so the page held one vocabulary in one table and contradicted it',
    '   in this one. Measured on a fresh page over the 311 working traits',
    '   (2026-09-21): 84 printed a colour count with no guideline, 3 of 13',
    '   categories had no placement reference reachable from the layer select, 13',
    '   of the 26 rule edges in a shipped rules file were dropped for naming a',
    '   layer the page had not got, and applying EITHER recorded order file left',
    '   accessories and hair-headwear painted in front of all 311 traits.',
    '',
    '   THE SEQUENCE IS THE PAINT ORDER, index 0 at the back, and it is the order',
    '   LAYER-ORDER-v14-311-traits.txt states (2026-09-10; byte-identical to v12',
    '   and v13; filed under "Approved decisions" the same day). The set is',
    '   settled. The sequence is the last one recorded, not one shown to be',
    '   right: the 2026-09-06 record puts eyes and glasses above hair and this one',
    '   puts hair above both, and measured over the real collection that is 46 of',
    '   464 hair/glasses pairs burying 40% or more of the glasses under a fringe,',
    '   against 0 the other way. With the set right, reversing that is one drop',
    '   of a LAYER-ORDER file; with the old set it was not possible at all.',
    '',
    '   A project with a stored settings.layers is untouched - applyLayers',
    '   replaces this wholesale - and the migration onto these names is Sort by',
    '   inventory, which already names the layers it leaves empty. */',
    "const DEFAULT_LAYERS=['backgrounds','skins','mouth','eyes','glasses','clothing','chains',",
    "  'hair','hats','ears','costumes','masks','extras','unsorted'];",
  ]);
}

/* ---- 2. the readPath comment that reads as live and is not --------------- */
{
  const i = at('     because those three are not in DEFAULT_LAYERS.', 'the 63-of-233 sentence');
  if (L[i - 1].indexOf('put 63 of its 233 files in unsorted') < 0) throw new Error('the sentence above moved');
  kit.replace(L, { start: i, end: i }, [
    '     because those three are not in DEFAULT_LAYERS.',
    '',
    '     THAT WAS TRUE WHEN IT WAS WRITTEN AND IS NOT NOW, twice over: the block',
    '     at the top of bulkImport adopts an unknown folder before anything is',
    '     written, and DEFAULT_LAYERS is the collection\'s own thirteen since',
    '     patch516. Measured 2026-09-21 over the 311 live files: 0 land in',
    '     unsorted and 0 folders are adopted, because every one of them is',
    '     already a layer. `folder` stays for the collection that is not this',
    '     one - a fourteenth folder nobody predicted still has to be readable.',
  ]);
}

/* ---- 3. a count that matches one copy of the collection and not the other */
{
  const i = at('    /* No exact grid - 167 of the 311 measured. The detector is what has', 'the no-grid count');
  kit.replace(L, { start: i, end: i }, [
    '    /* No exact grid - 166 of the 311 in the TRAIT MASTER LIBRARY copy, 167',
    '       in the OneDrive/Desktop copy that replaces 32 skins as unapproved',
    '       rework input (measured 2026-09-21, both). The detector is what has',
  ]);
}

/* ---- 4. the shipping pair is v14 now ------------------------------------ */
{
  const i = at('       order at all; it ships beside LAYER-ORDER-v12-318-traits.txt. */', 'the v12 filename');
  kit.replace(L, { start: i, end: i }, [
    '       order at all; it ships beside LAYER-ORDER-v14-311-traits.txt (v12 and',
    '       v13 state the same order, byte for byte). */',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code, text }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need("const DEFAULT_LAYERS=['backgrounds','skins','mouth','eyes','glasses','clothing','chains',");
  need("  'hair','hats','ears','costumes','masks','extras','unsorted'];");
  /* THE RETIRED NAMES ARE GONE FROM THE CODE, and appear in the prose only
     where the prose is about their retirement. */
  if ((code.match(/accessories|hair-headwear/g) || []).length !== 0)
    throw new Error('a retired layer name survives in the code');
  /* THE TWO TABLES AGREE. PLACEMENT_REF's keys, read out of the code, are the
     new list minus the catch-all - which is what tests/defaultlayers.spec.js
     pins at runtime; here it is pinned at write time too. */
  const a = code.indexOf('const PLACEMENT_REF={'), b = code.indexOf('};', a);
  const keys = (code.slice(a, b).match(/"([a-z-]+)":\[/g) || []).map(m => m.slice(1, m.indexOf('"', 1))).sort();
  if (keys.join(',') !== NEW.slice().sort().join(','))
    throw new Error('PLACEMENT_REF keys are ' + keys.join(',') + ' and the list is ' + NEW.slice().sort().join(','));
  /* NOTHING ELSE ABOUT LAYERS MOVED. */
  for (const s of ['const ALWAYS_PRESENT=["skins"];', 'let LAYERS=DEFAULT_LAYERS.slice();',
    'if(LAYERS.indexOf(s)>=0) layer=s;', 'if(!l||l==="unsorted") return 0;',
    'if(LAYERS.indexOf("unsorted")<0) LAYERS.push("unsorted");']) need(s);
});

/* ---- 5. the API's copy of the list ------------------------------------- */
{
  const src = fs.readFileSync(API, 'utf8');
  const old = 'const LAYERS = [\n  "backgrounds", "skins", "clothing", "costumes", "chains", "accessories",\n  "extras", "ears", "mouth", "eyes", "hair-headwear", "masks", "unsorted",\n] as const;';
  const oldCrlf = old.split('\n').join('\r\n');
  const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const needle = EOL === '\r\n' ? oldCrlf : old;
  if (src.split(needle).length !== 2) throw new Error('api/identify.ts: the old list is not there exactly once');
  const repl = [
    "/* THE SAME FOURTEEN AS index.html's DEFAULT_LAYERS, and it has to be: this is",
    '   a z.enum, so a name missing here is a layer the model can never answer,',
    '   and a retired name present here is a layer the save path would adopt',
    '   back. patch516. */',
    'const LAYERS = [',
    '  "backgrounds", "skins", "mouth", "eyes", "glasses", "clothing", "chains",',
    '  "hair", "hats", "ears", "costumes", "masks", "extras", "unsorted",',
    '] as const;',
  ].join(EOL);
  const out = src.split(needle).join(repl);
  if (/accessories|hair-headwear/.test(out)) throw new Error('api/identify.ts still names a retired layer');
  if (out.indexOf('layer: z.enum(LAYERS)') < 0) throw new Error('api/identify.ts lost its enum');
  fs.writeFileSync(API, out);
}

fs.renameSync(TMP, FILE);
console.log('patch516 written, ' + grew + ' bytes');
