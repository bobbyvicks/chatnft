/* PREDICTIONS for tests/cleanpalette.spec.js - "the swatch row describes the
   artwork".

   Declared here, BEFORE the run.

   Twelve tests, and the reason they need this is that eleven of them assert
   the same shape - a set difference between the colours in the canvas and the
   hexes on the row - against EIGHT different operations. A suite like that
   passes just as happily if one repalette() call covers all eight by accident
   of ordering, or if the assertion is reading an empty set on both sides. The
   only way to know each test is bound to its own operation is to remove one
   call at a time and demand that exactly the right tests move.

   So the valuable half of this file is the NOT list on each mutant, not the
   kills. Four separate call sites, four separate expected reds, and three
   tests that must survive every one of them.
*/
/* WHAT HAPPENED, added after the run. The predictions above are left exactly
   as they were declared, because a prediction rewritten to match its result is
   not a prediction.

   Four of five behaved as predicted, NOT lists included. The fifth - the one
   that turns the rebuild's keep flag off - SURVIVED, and the caveat written
   into it before the run turned out to be the right reading: `if
   (kept.survives)` had been carrying the whole surviving-pick test, which had
   never once run its own assertion. The test now has its own four-block
   fixture and asserts the precondition instead of branching on it, and the
   mutant kills it. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/cleanpalette.spec.js',
  ntests: 12,
  mutants: [
    {
      /* The reported defect itself. 59 of 64 swatches were ghosts after a
         clean-up and Replace/Erase answered "No cells matched". */
      name: 'Clean up colours stops rebuilding the row',
      find: `  repalette();
  toast(pl.before.toLocaleString()+" colours down to "+pl.after);`,
      with: `  toast(pl.before.toLocaleString()+" colours down to "+pl.after);`,
      kills: [
        'no swatch names a colour the image no longer has',
        'the row is rebuilt rather than left as it was',
        'so a swatch clicked afterwards actually matches something',
        'and one the clean-up merged away is dropped from the selection',
      ],
      /* MUST SURVIVE, and this is the point of the file:

         'it really does reduce the artwork' reads the CANVAS, so a row left
         untouched cannot move it - that test is the positive control proving
         the ghost test is not satisfied by a button that does nothing.

         'a colour picked before the clean-up and still present stays picked'
         also survives, which is the sharp one: with no rebuild at all the
         pick trivially stays. That test is defended by mutant 5 instead, and
         if it red HERE it would mean it is really just another ghost test.

         The pencil, fill, eraser, nudge, Clear background and Add outline
         tests survive because each has its own call site. If any of them reds
         here, six tests are all reading one operation. */
    },
    {
      name: 'Clear background stops rebuilding the row',
      find: `  repalette();
  toast('Cleared '+n.toLocaleString()+' background pixels');`,
      with: `  toast('Cleared '+n.toLocaleString()+' background pixels');`,
      kills: ['Clear background stops offering the colour it removed'],
      /* Exactly one test. If the clean-up tests move too, the fixture is not
         isolated and one operation is being credited for another's fix. */
    },
    {
      name: 'Add outline stops rebuilding the row',
      find: `  repalette();
  toast("Outlined "+plan.n.toLocaleString()+" cells"+(plan.hn?", patched "+plan.hn:""));`,
      with: `  toast("Outlined "+plan.n.toLocaleString()+" cells"+(plan.hn?", patched "+plan.hn:""));`,
      kills: ['Add outline offers the colour it just drew with'],
    },
    {
      /* The drawing paths share ONE call, at the end of a stroke. */
      name: 'the end of a stroke stops rebuilding the row',
      find: `    if(painting){ refreshStats(); repalette(); }`,
      with: `    if(painting){ refreshStats(); }`,
      kills: [
        'the pencil puts the colour it drew with on the row',
        'the eraser stops offering a colour it wiped out',
      ],
      /* NOT the fill test, and NOT the arrow-key test. The fill branch returns
         from beginStroke before `painting` is ever set, so it never reaches
         this line and carries its own call; the arrow keys are nudge(), which
         is not a pointer stroke at all. Predicting those two as survivors is
         what distinguishes "three drawing tests" from "one drawing test
         written three times". */
    },
    {
      /* The pick-preservation control, defended on its own. keep=false is
         rcPick.clear() - the exact defect undo and redo were fixed for. */
      name: 'the rebuild throws the selection away instead of keeping survivors',
      find: `  buildPalette(p.list); buildRecolour(p.list, true);`,
      with: `  buildPalette(p.list); buildRecolour(p.list, false);`,
      kills: ['a colour picked before the clean-up and still present stays picked'],
      /* And NOT 'one the clean-up merged away is dropped from the selection':
         clearing every pick satisfies that assertion perfectly. The two tests
         look like a pair about the same thing and are not - each is killed by
         a different mutant and by neither of the other's. That is the whole
         reason both exist.

         A caveat recorded before the run: the surviving-pick assertion is
         guarded by `if (kept.survives)`. If this mutant does NOT red, the
         honest reading is that the guard made the test vacuous on this
         fixture, not that the behaviour is untested - and the fixture is what
         would need fixing. */
    },
  ],
});
process.exit(bad ? 1 : 0);
