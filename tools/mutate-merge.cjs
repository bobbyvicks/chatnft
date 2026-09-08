/* PREDICTIONS for merging the same picture, written before the run.

   This feature deletes artwork, and the file it supersedes says why that was
   refused the first time: an inline merge destroyed a trait on its first run.
   So the predictions here are mostly about the guards, and two of them are
   deliberately aimed at making the merge TOO EAGER rather than too shy - a
   merge that never fires loses nothing, and one that fires once too often
   loses a drawing.

   The last is a control: it changes the order of two conditions that cannot
   change the outcome, and predicts nothing moves. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/sameart.spec.js tests/import.spec.js',
  ntests: 23,
  mutants: [
    {
      name: 'the merge absorbs into any name this import supplied',
      find: '    const incoming=existing.filter(r=>r.kind==="trait"&&freshIds.has(r.id));',
      with: '    const incoming=existing.filter(r=>r.kind==="trait"&&here.has(r.id));',
      kills: ['but importing part of a folder does not merge away the rest',
        'a file the folder no longer has is named, and left alone'],
    },
    {
      name: 'the merge may delete a record this import supplied',
      find: '      if(rec.kind!=="trait"||here.has(rec.id)||movedIds.has(rec.id)) continue;',
      with: '      if(rec.kind!=="trait"||movedIds.has(rec.id)) continue;',
      kills: ['re-importing an unchanged folder still replaces rather than deleting'],
    },
    {
      name: 'nothing is ever merged',
      find: '      if(!onto) continue;',
      with: '      if(true) continue;',
      kills: ['the old name is merged away, and the new one kept',
        'and it says so, naming both',
        'and in a group the merged record is dropped from the server too'],
    },
    {
      name: 'the merge crosses layers',
      find: '        if((t.layer||"unsorted")!==(rec.layer||"unsorted")) continue;',
      with: '        if(false) continue;',
      kills: ['and the same picture on a different layer is left alone'],
    },
    {
      name: 'a merged record is also reported as missing',
      find: '      if(here.has(rec.id)||movedIds.has(rec.id)||mergedIds.has(rec.id)) continue;',
      with: '      if(here.has(rec.id)||movedIds.has(rec.id)) continue;',
      kills: ['and it is not reported as missing on top of that'],
    },
    {
      name: 'the group keeps the copy that was merged away here',
      find: '      try{ await cloudDropOne(rec); }catch(_){}\n      mergedAway.push(',
      with: '      mergedAway.push(',
      kills: ['and in a group the merged record is dropped from the server too'],
    },
    {
      name: 'the deletion is silent',
      find: '  if(mergedAway.length) bits.push(mergedAway.length+" merged ("',
      with: '  if(false) bits.push(mergedAway.length+" merged ("',
      kills: ['and it says so, naming both'],
    },
    {
      name: 'a replaced record is compared by the bytes it used to hold',
      find: '        if(sig) sigCache.set(trec.id,sig);',
      with: '        if(false) sigCache.set(trec.id,sig);',
      kills: ['a picture that arrived DURING this import is compared by its new bytes'],
    },
    {
      name: 'CONTROL: two independent conditions swap places',
      find: '      if(rec.kind!=="trait"||here.has(rec.id)||movedIds.has(rec.id)) continue;',
      with: '      if(rec.kind!=="trait"||movedIds.has(rec.id)||here.has(rec.id)) continue;',
      kills: [],
    },
  ],
}));
