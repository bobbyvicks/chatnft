/* PREDICTIONS for the whole-cells size check.

   Declared here, BEFORE the run.

   The defect was a unit error: projectGrid counts CELLS, w/h/art.width are
   PIXELS, and three checks compared them as one number. It survived because
   every fixture in tests/ is at ONE pixel per cell, where the two numbers are
   identical - so the whole existing suite is blind to it, and the collection
   the app is actually for is at eight.

   That makes the selectivity claim the interesting one here. M2, M3 and M5
   each put the original defect back, one site at a time. If the four specs
   below could already see it, the fix needed no new tests; the prediction is
   that 26 of the 30 cannot see M2 at all, and that M3 and M5 are each visible
   to exactly ONE test - the one written for them.

   Four spec files together, because the census feeds the shelf, the sheet and
   the zip while saveTrait and download ask the same question separately, and a
   mutation run scoped to one file would call a cross-file kill a survivor.
*/
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/sizecensus.spec.js tests/basesize.spec.js '
    + 'tests/collection-size.spec.js tests/gridbutton.spec.js',
  ntests: 30,
  mutants: [
    {
      /* The census stops asking. Everything is on the grid, nothing is ever
         named, and the feature is gone rather than wrong - which is the shape
         a "fix" that only silences a false warning would take. */
      name: 'the census never calls anything off the grid',
      find: `    if((t.w|0)%cells!==0 || (t.h|0)%cells!==0) bad.add(k);`,
      with: `    ;`,
      kills: [
        'and one that does not divide into cells is still named',
        /* TWICE, and not a typo: this title belongs to two tests, one in
           sizecensus.spec and one in collection-size.spec, and both red. Named
           once the run reported 13 reds against 12 predicted, which is the
           count quietly disagreeing with the claim. */
        'a collection that agrees with itself but not with the grid is still wrong',
        'a collection that agrees with itself but not with the grid is still wrong',
        'a width that divides and a height that does not is still caught',
        'and a small collection still works the way it always did',
        'an off-size base is counted on the shelf and named',
        'a settings record is never counted',
        'an off-size trait is still named, with the base agreeing',
        'Download all says it too',
        'and so does the sheet, which is the last look before a mint',
        'no message calls the base a trait',
        'the shelf names which traits are the wrong size',
        'the download names them, because it is the last moment before a mint',
      ],
      /* The controls that
         must NOT move are the silent ones: every test that asserts nothing is
         warned about passes trivially when nothing is ever warned about, which
         is why they are worthless on their own and the list above is what
         makes them mean something.

         'no message calls the base a trait' reds for a reason worth naming:
         it asserts the tooltip CONTAINS 'everything drawn into a character',
         and with nothing odd there is no tooltip at all. */
    },
    {
      /* THE DEFECT ITSELF, put back in the census. */
      name: 'the census compares pixels against the cell count again',
      find: `    if((t.w|0)%cells!==0 || (t.h|0)%cells!==0) bad.add(k);`,
      with: `    if((t.w|0)!==cells || (t.h|0)!==cells) bad.add(k);`,
      kills: [
        'a collection at eight pixels per cell is not warned about',
        'and one that does not divide into cells is still named',
        'two sizes that both sit on the grid are both fine',
        'a grid of zero cannot divide by zero',
      ],
      /* FOUR, and all four are in the file written for this fix. The other 26
         tests cannot see the original defect, because every fixture they use
         is at one pixel per cell where an equality and a modulo agree. That is
         the whole reason it shipped.

         Three sizecensus tests survive it too and are named here so the claim
         is exact: 'a collection that agrees with itself but not with the grid'
         (both 40s are wrong under either rule), 'a width that divides and a
         height that does not' (1280x1000 is odd under either), and 'and a
         small collection still works the way it always did' (160 and 200 at
         one pixel per cell). Each is a real assertion about behaviour; none is
         a check on the units. */
    },
    {
      /* The divide-by-zero floor. projectGrid arrives from a settings record
         and from a text field, and % 0 is NaN - which is falsy, so every trait
         would silently be called correct. */
      name: 'the cell count is not floored at one',
      find: `  const cells=Math.max(1,projectGrid|0);`,
      with: `  const cells=(projectGrid|0);`,
      kills: ['a grid of zero cannot divide by zero'],
    },
    {
      /* saveTrait, the second site. */
      name: 'the save compares pixels against the cell count again',
      find: `    const offGrid = (art.width%gcells || art.height%gcells)`,
      with: `    const offGrid = (art.width!==gcells || art.height!==gcells)`,
      kills: ['a save at eight pixels per cell is silent'],
      /* ONE. Written for this, and nothing else in 30 tests can see it - the
         measurement that says the new test earns its place. */
    },
    {
      /* And the other direction: the save stops warning at all. */
      name: 'the save never mentions the grid',
      find: `    const offGrid = (art.width%gcells || art.height%gcells)`,
      with: `    const offGrid = (false)`,
      kills: ['an off-size trait is named when it is saved'],
    },
    {
      /* download, the third site. */
      name: 'the download compares pixels against the cell count again',
      find: `    const off = (art.width%dcells || art.height%dcells)`,
      with: `    const off = (art.width!==dcells || art.height!==dcells)`,
      kills: ['and a trait at eight pixels per cell is silent'],
    },
  ],
});
process.exit(bad ? 1 : 0);
