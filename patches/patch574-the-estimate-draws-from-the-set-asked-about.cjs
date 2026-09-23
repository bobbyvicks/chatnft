/* THE SHARE ESTIMATE DRAWS FROM THE SET IT WAS ASKED ABOUT.

   poolsForDistribution took the project page's rows whenever they existed
   and used the records only to fill the moment before they were built. The
   rows hold every approved trait. So when Generate set asked for each
   final-project trait's share over the final set - rules exist, so it is an
   estimate - the draws came from every approved trait instead, and the
   answer was kept, here and in localStorage, under the key of the final
   set. shareDrift then read it back as the final set's figure: a trait in a
   layer with many approved but not final traits came out too low, which can
   raise a false "on 50% of them though its tile says 12%" or hide a real
   one. Without rules the figure is exact arithmetic over the final set, so
   the two cases disagreed.

   The rows stay the authority for the set they describe - they leave out a
   layer a person has turned off in them. They are used now only when every
   trait in them is one of the records asked about. The final set is smaller
   than the rows, so it is drawn from its own records, which give what
   finalPools gives: final-project traits and the bases, hidden layers out. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'function poolsForDistribution(items,wipIncluded){');
{
  const i = kit.only(L, l => l === '  const fromRows=cPools();', 'the rows', fn);
  if (L[i + 1] !== '  for(const k in fromRows) if(fromRows[k]&&fromRows[k].length) return fromRows;') throw new Error('the rows test moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '  const fromRows=cPools();',
    '  /* ONLY WHEN THEY ARE THE SET ASKED ABOUT. The rows hold every approved',
    '     trait, and the final set was estimated over them and the answer kept',
    '     under the final set\'s key. A row trait that is not among the records',
    '     means the question is about another set. */',
    '  const asked=new Set((items||[]).map(i=>i&&i.id));',
    '  let rows=0, outside=0;',
    '  for(const k in fromRows) for(const r of (fromRows[k]||[])){ rows++; if(!asked.has(r.id)) outside++; }',
    '  if(rows && !outside) return fromRows;',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch574 written');
