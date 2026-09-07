/* PREDICTIONS for Fit to grid.

   Declared here, BEFORE the run.

   Two claims carry this feature and both are easy to appear to keep:

   1. IT USES THE CENSUS'S RULE, not snapToGrid's. The two agree above one
      cell and disagree below it, so every test written with a 1254 canvas -
      which is the real case and the obvious one to write - passes either way.
      Only a size under one cell can tell them apart, and M1 is the check that
      the test which does is really the reason it stays right.

   2. PAD AND SCALE ARE DIFFERENT OPERATIONS. Both leave the canvas at 1280,
      which is what every size assertion reads, so a Fit that scaled in both
      modes would look correct on the outside. M2 does exactly that.

   Seven spec files, 76 tests, because the note this touches is on screen
   throughout the Transform panel and four other files assert on it.
*/
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/fitgrid.spec.js tests/paneldensity.spec.js tests/resize-preview.spec.js '
    + 'tests/resize.spec.js tests/resizetool.spec.js tests/sizecensus.spec.js '
    + 'tests/tooltips.spec.js',
  ntests: 76,
  mutants: [
    {
      /* THE ONE THAT LOOKS RIGHT. snapToGrid is one line above gridFit and
         answers 1280 for 1254 exactly as gridFit does; the two only part
         below one cell, where snapToGrid returns a whole DIVISOR because
         shrinking has to stay expressible. */
      name: 'Fit uses snapToGrid, which agrees with it everywhere except where it matters',
      find: `  return Math.max(g,Math.round(v/g)*g);\n}`,
      with: `  return snapToGrid(v);\n}`,
      kills: [
        'below one cell it goes UP to a whole cell, not to a divisor',
        'and the same trait through snapToGrid really does stay at 40',
      ],
      /* TWO, and every 1254 test survives - which is the point being made.
         The real collection is 1254, so a suite written only around the case
         that prompted the feature would have called this mutant clean. */
    },
    {
      /* THE OTHER ONE THAT LOOKS RIGHT. The canvas still ends at 1280. */
      name: 'Fit always scales, whatever the Change chip says',
      find: `  const mode=chipVal("rsmode")==="art" ? "art" : "canvas";`,
      with: `  const mode="art";`,
      kills: [
        'padding keeps every pixel exactly, which is the whole point',
        'padding never crops, so a canvas just over a cell grows to the next',
        'and says so when a crop really would lose artwork',
        'Trait mode pads rather than resampling art nobody asked it to touch',
      ],
      /* FOUR. 'and scaling does not' survives - it asked for a scale and got
         one - and so does 'the real case', which reads only the size and the
         census, both of which a scale satisfies. That test is not weak; it is
         about the arithmetic rather than the operation, and naming what it
         cannot see is what stops it being read as covering this. */
    },
    {
      /* And the other direction. */
      name: 'Fit always pads, so the Art chip stops meaning anything',
      find: `  const mode=chipVal("rsmode")==="art" ? "art" : "canvas";`,
      with: `  const mode="canvas";`,
      kills: ['and scaling does not, which is why it is a separate choice'],
    },
    {
      /* The floor at one cell. Without it a 40px canvas asks for round(0.25)
         * 160 = 0, which resizeTo clamps to 1, and the repair destroys the
         trait it was pressed to fix. */
      name: 'gridFit is not floored at one whole cell',
      find: `  return Math.max(g,Math.round(v/g)*g);`,
      with: `  return Math.round(v/g)*g;`,
      kills: [
        'below one cell it goes UP to a whole cell, not to a divisor',
        'and the same trait through snapToGrid really does stay at 40',
      ],
    },
    {
      /* A press on a canvas that is already right must not resize it. */
      name: 'the already-fits guard goes',
      find: `  if(nw===art.width && nh===art.height){`,
      with: `  if(false){`,
      kills: ['a canvas already on the grid is told so and left alone'],
      /* ONE, and the interesting part is what does NOT move: resizeTo returns
         null when nothing changes, so the canvas is untouched either way and
         every pixel assertion in that test still passes. What is lost is only
         the sentence - which is the whole of what the guard was for. */
    },
    {
      /* The note that makes the button findable. */
      name: 'the note stops saying the canvas is off the grid',
      find: `    const off=offGridNow();`,
      with: `    const off=false;`,
      kills: ['and with Snap off it still says the canvas does not fit'],
      /* ONE. 'with Snap on the note already points at the size it should be'
         must SURVIVE: that state was already handled before this change and
         a mutant that killed both would mean the new branch had taken over
         work the old one was doing. */
    },
    {
      /* offGridNow must ask the census's question, not snapToGrid's. */
      name: 'offGridNow accepts a divisor of the grid as on-grid',
      find: `  return (art.width%g)!==0 || (art.height%g)!==0;`,
      with: `  return snapToGrid(art.width)!==art.width || snapToGrid(art.height)!==art.height;`,
      kills: [],
      /* PREDICTED TO SURVIVE, and declared as such rather than left out.
         Every canvas the note tests use is 1254 or 1280, where the two rules
         agree - so nothing here can see the difference. It is named so that
         the gap is on the record: the note is not covered below one cell, and
         a later change that relies on it being covered will find this note
         instead of finding out the hard way. */
    },
  ],
});
process.exit(bad ? 1 : 0);
