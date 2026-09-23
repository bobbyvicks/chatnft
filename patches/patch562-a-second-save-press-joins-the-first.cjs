/* A SECOND SAVE PRESS JOINS THE FIRST.

   Found 2026-09-22 by the discovery pass, ranked thirty-sixth of 39.
   Save had no latch - "Save and close" has one - so a double press after a
   rename ran two saves at once. The second reached the name-clash check
   after the first had written the renamed record and before it had moved
   openRec to it, found the person's own new record, and said "There is
   already ... pick another name". The store was always right; the message
   was wrong, for about 50-500 ms here and a network round trip in a group.

   A press while a save is running now gets that save's answer rather than
   starting another, and Save is disabled while it runs, as Save and close
   already is. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const i = kit.only(L, l => l === 'async function saveTrait(){', 'saveTrait');
  kit.replace(L, { start: i, end: i }, [
    '/* ONE SAVE AT A TIME. A second press while one runs gets its answer: two',
    '   at once meant the second found the first\'s renamed record in its',
    '   name-clash check and said "There is already" about the person\'s own',
    '   trait. Every caller - Save, Save and close, the review queue - comes',
    '   through here. */',
    'let saveFlight=null;',
    'function saveTrait(){',
    '  if(saveFlight) return saveFlight;',
    '  const b=$("saveproj"); if(b) b.disabled=true;',
    '  saveFlight=saveTraitNow().finally(()=>{ saveFlight=null; if(b) b.disabled=false; });',
    '  return saveFlight;',
    '}',
    'async function saveTraitNow(){',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  if (code.split('async function saveTraitNow(){').length - 1 !== 1) throw new Error('saveTraitNow');
  if (code.split('saveTraitNow()').length - 1 !== 2) throw new Error('saveTraitNow is called other than through the latch');
});

fs.renameSync(TMP, FILE);
console.log('patch562 written, ' + grew + ' bytes');
