/* PREDICTIONS for tests/shelfwidth.spec.js.

   Declared here, BEFORE the run.

   Six tests over a CSS change, which is the kind of change a suite is worst
   at: nothing throws, nothing logs, and a layout that is wrong at one width
   looks perfect at the width you happened to check. The first version of this
   change WAS wrong - a flat minmax(150px,1fr) left a 375px phone with one
   293px tile - and the whole suite stayed green, because nothing measured the
   phone. It was caught by hand before it was pushed, which is luck, not a
   method; these tests are the method.

   The claims worth defending, in order of what they cost if wrong:

   1. The width went on #proj and not on .proj. The class is shared with three
      panels that hold controls rather than grids; a shared 1180px stretches
      them and their contents hug the left of a very wide box. This is the
      mistake most likely to be made by someone tidying the rule later.
   2. The phone keeps two columns. This is the defect that already happened.
   3. The tile is meaningfully bigger. The whole point of the change, and the
      one thing a reader would assume is covered without checking.

   The NOT lists matter more than the kills here. Four of these six tests
   should not move for most of these mutants, and a mutant that reds all six
   would mean the tests are measuring the page rather than the rule.

   === WHAT HAPPENED ===

   All four behaved as predicted. Recorded rather than trimmed, because a
   mutate file with nothing but confirmations is worth as little as one that
   always reports BAD - the value is in having written the NOT lists first. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/shelfwidth.spec.js',
  ntests: 6,
  mutants: [
    {
      /* The change itself, undone. */
      name: 'the shelf goes back to the width of a form panel',
      find: `#proj{width:min(1180px,92vw);}`,
      with: `#proj{width:min(760px,92vw);}`,
      kills: [
        'takes the width the page already gives a panel you judge work in',
        'shows a trait far bigger than the 99px it used to get',
      ],
      /* Two, because the column count follows the panel: 722px of content box
         fits four 150px columns, not seven. NOT the forms test, which is
         about compose and layers and is happy either way - that asymmetry is
         the point of having both. NOT the phone tests either: min(1180,92vw)
         and min(760,92vw) are the same 345px at 375, so nothing below the
         desktop breakpoints can see this mutation at all. */
    },
    {
      /* The width put on the shared class instead of the id. Every assertion
         about the shelf still passes - this is the one a reader would not
         catch, and the only test that can is the one about the OTHER panels. */
      name: 'the width goes on the shared class, stretching the form panels',
      find: `#proj{width:min(1180px,92vw);}`,
      with: `.proj{width:min(1180px,92vw);}`,
      kills: ['and the panels that are forms are left alone'],
      /* NOT the width test: #proj is still 1178 and still equals .extract, so
         a suite without the control would call this a pass. NOT the tile
         test, NOT the phone, NOT either overflow test - at 92vw the shared
         rule and the id rule agree on every narrow width. */
    },
    {
      /* The tile minimum, back to what it was. */
      name: 'the tiles go back to a 108px minimum',
      find: `repeat(auto-fill,minmax(min(150px,47%),1fr))`,
      with: `repeat(auto-fill,minmax(min(108px,47%),1fr))`,
      kills: ['shows a trait far bigger than the 99px it used to get'],
      /* One test, and both of its assertions - nine columns rather than seven,
         and a 105px canvas rather than 141. NOT the phone: at 375 the
         percentage is 144px and 108 is still the smaller, so two columns
         either way. NOT the width tests, which never look at the grid. */
    },
    {
      /* THE DEFECT THAT ACTUALLY HAPPENED. A flat minimum reads as simpler and
         is correct at every width but the one nobody measured. */
      name: 'the tile minimum is flat, as it was first written',
      find: `minmax(min(150px,47%),1fr)`,
      with: `minmax(150px,1fr)`,
      kills: ['keeps two columns on a phone, which the first attempt did not'],
      /* NOT the desktop tests: at 620 and above the 150px is the smaller of
         the pair already, so every desktop number is identical and this
         mutant is invisible to four of the six tests. NOT the sideways test
         either - one wide column does not overflow anything, which is exactly
         why an overflow check could not have caught the original defect and a
         column COUNT can. */
    },
  ],
});
process.exit(bad ? 1 : 0);
