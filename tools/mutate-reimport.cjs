/* PREDICTIONS for re-importing a folder, written before the run.

   The subject is a feature whose whole job is to DO NOTHING, which is the
   hardest kind to test: a build that did nothing at all would pass most of the
   "it was left alone" assertions. So the predictions below name a replacement
   test for nearly every skip mutant, and the last two mutants are controls
   that predict nothing moves.

   One of these was written because a mutant SURVIVED an earlier round: the
   shelfOrder carry had no cover, because the ordering test re-imports
   identical files and those take the skip. tests/reimport.spec.js now has "and
   the edited one keeps its place on the shelf", which is the only test that
   reaches that line. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/reimport.spec.js tests/import.spec.js',
  ntests: 29,
  mutants: [
    {
      name: 'an unchanged file is written and uploaded anyway',
      find: '          ok++;\n          continue;\n        }',
      with: '          ok++;\n        }',
      kills: ['an unchanged file is not uploaded again',
        'an unchanged file keeps the server row it was already on',
        're-importing the same folder duplicates nothing'],
    },
    {
      name: 'a skipped file is not recorded as supplied',
      find: '          supplied.push({name:info.name, layer:layer, status:status, id:tid});\n          perLayer[layer]=(perLayer[layer]||0)+1;',
      with: '          perLayer[layer]=(perLayer[layer]||0)+1;',
      kills: ['brings in the new one and does not duplicate the old ones',
        'a file the folder no longer has is named, and left alone'],
    },
    {
      name: 'the skip ignores the bytes and keeps whatever is there',
      find: '        if(prev && sig && await recSig(prev)===sig){',
      with: '        if(prev && sig){',
      kills: ['a file that really did change still replaces the trait',
        'but an edited file is marked as needing to go up again',
        'and the edited one keeps its rarity too',
        'and the edited one keeps its place on the shelf'],
    },
    {
      name: 'a replacement drops the rarity again',
      find: '        if(prev&&typeof prev.rarity==="number") trec.rarity=prev.rarity;',
      with: '        if(false) trec.rarity=prev.rarity;',
      kills: ['and the edited one keeps its rarity too'],
    },
    {
      name: 'a replacement moves to the front of its layer again',
      find: '                    shelfOrder:(prev&&typeof prev.shelfOrder==="number")\n                      ? prev.shelfOrder : shelfCore.nextShelfOrder(shelfItems,layer)};',
      with: '                    shelfOrder:shelfCore.nextShelfOrder(shelfItems,layer)};',
      kills: ['and the edited one keeps its place on the shelf'],
    },
    {
      name: 'a replacement forgets which server row it is',
      find: '        if(prev&&prev.rowId) trec.rowId=prev.rowId;',
      with: '        if(false) trec.rowId=prev.rowId;',
      kills: ['but an edited file is marked as needing to go up again'],
    },
    {
      name: 'an auto-named file is numbered by position again',
      find: '          if(known!==null) info.name=known;',
      with: '          if(false) info.name=known;',
      kills: ['AN AUTO-NAMED FILE LANDS ON ITS OWN RECORD WHEN THE FOLDER GROWS'],
    },
    {
      name: 'the number restarts at one and collides',
      find: '              nextNum[lay]=top;',
      with: '              nextNum[lay]=0;',
      kills: ['and a genuinely new one takes a number nothing else holds'],
    },
    {
      name: 'the same-picture check cannot see this run',
      find: '          for(const old of wroteThisRun){',
      with: '          for(const old of beforeTraits){',
      kills: ['two copies of one picture in a single folder are reported'],
    },
    {
      name: 'CONTROL: the three counts are reported in another order',
      find: "    if(fresh) kinds.push(fresh+\" new\");\n    if(replaced) kinds.push(replaced+\" updated\");\n    if(unchanged) kinds.push(unchanged+\" already here\");",
      with: "    if(unchanged) kinds.push(unchanged+\" already here\");\n    if(replaced) kinds.push(replaced+\" updated\");\n    if(fresh) kinds.push(fresh+\" new\");",
      kills: [],
    },
    {
      name: 'CONTROL: a comment changes',
      find: '           was decided here, and re-reading the file is not new information',
      with: '           was chosen here, and re-reading the file is not new information',
      kills: [],
    },
  ],
}));
