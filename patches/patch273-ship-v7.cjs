/* SHIP v7.

   "now import my new rules". The rules cannot be imported from here - they go
   into a browser's IndexedDB and this is not that browser - but the button
   that loads them ships WITH the page, and it still shipped v6: 249 names, 13
   layers, revision strict-fit-v6, against a collection that is now 271 names
   over 14. Pressing it would have refused, correctly, and said the traits did
   not match.

   VERIFIED BEFORE SHIPPING, through the page's own planRuleImport with the
   bundle's own names seeded as traits:

     rule groups it would add                     176
     actions read                                 446
     forbidden pairs                            6,849
     answers carried                            2,603
     traits the rules name and the project lacks     0
     layers the rules name and the project lacks     0
     operations not understood                       0
     names matching more than one trait               0

   Clean. The 270 "restrict nothing" actions are allow-lists covering a whole
   layer, which forbid nothing by definition - the importer folds them away and
   the report already says so.

   AND THE ID STOPS CARRYING A VERSION. It was rulev6, and this is the second
   time a version in a name has had to be chased through four files. The bundle
   knows which revision it is and the label says so; the element does not need
   to. rulesload will still be right at v8. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const REPO = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo';
const SRC = 'E:/X content/pixel art_/trait-records/strict-fit-v7-20260907';

/* ---- CHECKS: the bundle is what it claims, before anything is copied ---- */
const bundle = JSON.parse(fs.readFileSync(SRC + '/strict-fit-v7-collection.json', 'utf8'));
if (bundle.revision !== 'strict-fit-v7') throw new Error('the bundle is not strict-fit-v7');
const names = Object.values(bundle.names).reduce((a, v) => a + v.length, 0);
if (names !== 271) throw new Error('expected 271 names, the bundle has ' + names);
if (!Array.isArray(bundle.rules) || bundle.rules.length !== 148)
  throw new Error('expected 148 rules, the bundle has ' + (bundle.rules || []).length);
if (bundle.order.indexOf('back-extras') < 0) throw new Error('the v7 order has no back-extras');
const canonical = JSON.parse(fs.readFileSync(SRC + '/trait-rules-strict-fit-v7.json', 'utf8'));
if (!Array.isArray(canonical)) throw new Error('the LaunchMyNFT file is not a list');

/* ---- the assets ---- */
fs.copyFileSync(SRC + '/strict-fit-v7-collection.json', REPO + '/rules/strict-fit-v7-collection.json');
fs.copyFileSync(SRC + '/trait-rules-strict-fit-v7.json', REPO + '/rules/trait-rules-strict-fit-v7.json');

/* ---- the loader ---- */
let js = fs.readFileSync(REPO + '/curated-rules-v6.js', 'utf8');
const before = js;
js = js.split('strict-fit-v6').join('strict-fit-v7')
       .split("getElementById('rulev6')").join("getElementById('rulesload')")
       .split('the v6 collection').join('the v7 collection')
       .split('Load v6 again').join('Load the rules again')
       .split('The v6 rules').join('The v7 rules')
       .split('the v6 rules').join('the v7 rules')
       .split('V6 draw order saved').join('V7 draw order saved')
       .split('No v6 rules were loaded').join('No rules were loaded');
if (js === before) throw new Error('nothing in the loader changed');
if (js.indexOf('v6') >= 0 && js.indexOf('after v6 removes') < 0)
  throw new Error('a v6 reference survived the loader rewrite: '
    + js.split('\n').filter(l => l.indexOf('v6') >= 0).join(' | '));
/* The comment at the top explains why the file exists and mentions v6 as
   history - that one is true and stays, so it is named rather than swept. */
js = js.replace('after v6 removes that restriction.',
  'after v6 removed that restriction. Now v7: 271 traits over 14 layers,\n   including back-extras, which v6 did not have.');
fs.writeFileSync(REPO + '/curated-rules-v7.js', js);
fs.unlinkSync(REPO + '/curated-rules-v6.js');

/* ---- the page ---- */
const doc = kit.load(REPO + '/index.html');
const L = doc.lines;
const btn = kit.only(L, l => l === '      <button class="mini" id="rulev6">Load reviewed v6 collection rules</button>',
  'the load button');
const dl = kit.only(L, l => l === '      <a class="mini" href="rules/trait-rules-strict-fit-v6.json" download>Download v6 for LaunchMyNFT</a>',
  'the download link');
const tag = kit.only(L, l => l === '<script src="curated-rules-v6.js"></script>', 'the loader tag');

kit.replace(L, { start: tag, end: tag }, ['<script src="curated-rules-v7.js"></script>']);
kit.replace(L, { start: dl, end: dl },
  ['      <a class="mini" href="rules/trait-rules-strict-fit-v7.json" download>Download v7 for LaunchMyNFT</a>']);
kit.replace(L, { start: btn, end: btn }, [
  '      <!-- The id carries no version. It was rulev6, and chasing that through',
  '           four files twice is what a version in a name costs; the bundle',
  '           knows its own revision and the label says it. -->',
  '      <button class="mini" id="rulesload">Load reviewed v7 collection rules</button>',
]);

const grew = kit.save(doc, ({ lines, text }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('<script src="curated-rules-v7.js"></script>') !== 1) throw new Error('the tag did not land');
  if (text.indexOf('curated-rules-v6.js') >= 0) throw new Error('the page still loads the old file');
  if ((text.match(/id="rulesload"/g) || []).length !== 1) throw new Error('the button is not there once');
  if (text.indexOf('id="rulev6"') >= 0) throw new Error('the old id survived');
  if (text.indexOf('trait-rules-strict-fit-v6.json') >= 0) throw new Error('the download still points at v6');
});

console.log('index.html grew by ' + grew + ' bytes');
console.log('rules/strict-fit-v7-collection.json  ' + names + ' names, ' + bundle.rules.length + ' rules');
console.log('rules/trait-rules-strict-fit-v7.json ' + canonical.length + ' conditions');
console.log('curated-rules-v7.js written, curated-rules-v6.js removed');
