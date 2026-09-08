/* Can these nine tests fail? PREDICTIONS, written before the run.

   The interesting half is the guard, which is three tests in a row, and the
   question for each is whether any test actually depends on it. One of them
   nearly did not: "at least two known names" is implied by the share tests in
   every project big enough for them to bite, and only starts mattering when
   the project has so few layers that one name is most of it. That case now has
   a test, written for exactly this reason - a guard nothing can kill is either
   dead weight or an untested claim, and I would rather find out which.

   Naming what must NOT move is the half that makes a kill mean something: the
   two refusal tests must stay green when the reading is broken, and the five
   reading tests must stay green when the refusals are.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/layerordertext.spec.js',
  ntests: 9,
  mutants: [
    /* The whole feature off. Everything that reads a file reds; the two tests
       that expect a refusal do not, because a refusal is what they want. */
    { name: 'the text file is not read at all',
      find: '    const order=parseLayerOrderText(raw);',
      with: '    const order=null;',
      kills: ['THE REAL v12 FILE ORDERS A v11 PROJECT',
        'back-extras, which v12 drops',
        'SHELF IS SHOWING THE NEW ORDER',
        'same file twice says nothing moved',
        'A PROJECT WITH ONLY SOME OF THE LAYERS'] },

    /* Accept whatever names most of itself - which is any list of words. */
    { name: 'most of the file need not be layers this project has',
      find: '  if(known.length*2>=names.length) return names;',
      with: '  if(true) return names;',
      kills: ['mostly names this project does not have',
        'two layer words in a long file'] },

    /* The half that was added because a test failed: without it a project
       part-way through an import is refused its own order. */
    { name: 'most of the project is not evidence enough',
      find: '  if(known.length*2>=have.size) return names;',
      with: '  if(false) return names;',
      kills: ['A PROJECT WITH ONLY SOME OF THE LAYERS'] },

    /* One name is never an order. Only bites in a project small enough that
       one name is also most of the project. */
    { name: 'a single known name counts as an order',
      find: '  if(known.length<2) return null;',
      with: '  if(false) return null;',
      kills: ['one layer name among strangers'] },
  ],
}));
