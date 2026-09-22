/* GLASSES PAINT OVER HAIR.

   Decided 2026-09-22 by the owner, shown one character both ways and asked
   the one question the measurement left: with hair on top, 46 of 464
   hair/glasses pairs in the collection bury 40% or more of the glasses
   under a fringe, and none do the other way round. "we can change that but
   sure for the sake of the question yes."

   The default paint order moves glasses from between eyes and clothing to
   between hair and hats: over the fringe, under a hat, which is where the
   2026-09-06 record had them. Nothing else in the sequence moves. The set
   is the collection's thirteen and PLACEMENT_REF's keys, as patch516 left
   it, and the API's copy of the list is kept identical because its comment
   says it has to be.

   This is now the one pair on which the default differs from
   LAYER-ORDER-v14-311-traits.txt. Importing that file puts hair back on
   top; the file is the owner's to change. A project with a stored
   settings.layers is untouched, as the recorded comment already says. */
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

const OLD1 = "const DEFAULT_LAYERS=['backgrounds','skins','mouth','eyes','glasses','clothing','chains',";
const OLD2 = "  'hair','hats','ears','costumes','masks','extras','unsorted'];";
const NEW1 = "const DEFAULT_LAYERS=['backgrounds','skins','mouth','eyes','clothing','chains','hair',";
const NEW2 = "  'glasses','hats','ears','costumes','masks','extras','unsorted'];";

/* ---- 1. the sequence, with the decision recorded above it ---------------- */
{
  const i = at(OLD1, 'the default list');
  if (L[i + 1] !== OLD2) throw new Error('the default list is not the two lines expected');
  kit.replace(L, { start: i, end: i + 1 }, [
    '/* GLASSES OVER HAIR. Decided 2026-09-22 by the owner, shown one character',
    '   both ways, with the measurement above as the question: 46 of 464',
    '   hair/glasses pairs bury 40% or more of the glasses under a fringe with',
    '   hair on top, none the other way. Glasses sit between hair and hats now -',
    '   over the fringe, under a hat - which is where the 2026-09-06 record had',
    '   them. This is the one pair on which the default differs from',
    '   LAYER-ORDER-v14-311-traits.txt; importing that file puts hair back on',
    '   top, and the file is the owner\'s to change. A project with a stored',
    '   settings.layers is untouched, as above. */',
    NEW1,
    NEW2,
  ]);
}

/* ---- 2. the API\'s copy stays identical ---------------------------------- */
const API = path.join(__dirname, '..', 'api', 'identify.ts');
{
  const src = fs.readFileSync(API, 'utf8');
  const eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = src.split(eol);
  const a = '  "backgrounds", "skins", "mouth", "eyes", "glasses", "clothing", "chains",';
  const b = '  "hair", "hats", "ears", "costumes", "masks", "extras", "unsorted",';
  const i = lines.indexOf(a);
  if (i < 0 || lines.indexOf(a, i + 1) >= 0 || lines[i + 1] !== b) throw new Error('identify.ts LAYERS is not the two lines expected');
  lines[i] = '  "backgrounds", "skins", "mouth", "eyes", "clothing", "chains", "hair",';
  lines[i + 1] = '  "glasses", "hats", "ears", "costumes", "masks", "extras", "unsorted",';
  fs.writeFileSync(API + '.new', lines.join(eol));
}

/* ---- what has to be true afterwards ------------------------------------ */
const names = (src, re, q) => {
  const m = src.match(re);
  if (!m) throw new Error('list not found: ' + re);
  return (m[1].match(q) || []).map(s => s.slice(1, -1));
};
const grew = kit.save(doc, ({ code }) => {
  const was = kit.code(kit.scriptOf(doc.original));
  const before = names(was, /const DEFAULT_LAYERS=\[([^\]]*)\];/, /'[^']+'/g);
  const now = names(code, /const DEFAULT_LAYERS=\[([^\]]*)\];/, /'[^']+'/g);
  if (now.length !== 14 || before.length !== 14) throw new Error('fourteen expected');
  if (now.slice().sort().join() !== before.slice().sort().join()) throw new Error('the set changed');
  const ix = (l) => now.indexOf(l);
  if (!(ix('hair') < ix('glasses') && ix('glasses') < ix('hats'))) throw new Error('glasses are not between hair and hats');
  if (ix('glasses') !== ix('hair') + 1 || ix('hats') !== ix('glasses') + 1) throw new Error('more than glasses moved');
  /* Everything but glasses keeps its relative order. */
  const rest = (a) => a.filter(l => l !== 'glasses').join();
  if (rest(now) !== rest(before)) throw new Error('something other than glasses moved');
  if (now[now.length - 1] !== 'unsorted') throw new Error('unsorted is not last');
  /* The API's list is the same sequence. */
  const api = names(fs.readFileSync(API + '.new', 'utf8'), /const LAYERS = \[([^\]]*)\] as const;/, /"[^"]+"/g);
  if (api.join() !== now.join()) throw new Error('identify.ts LAYERS differs from DEFAULT_LAYERS: ' + api.join());
});

fs.renameSync(TMP, FILE);
fs.renameSync(API + '.new', API);
console.log('patch524 written, ' + grew + ' bytes');
