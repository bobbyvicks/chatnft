/* PREDICTIONS for the retry half of tests/cloudpull.spec.js.

   Declared here, BEFORE the run.

   These two tests were flaky for a year of commits and the fix made their
   counts exact. Exact counts are only worth having if they are the RIGHT
   counts, and the way to find out is to change the thing they claim to
   measure - the number of tries a download gets - and see whether they
   notice, and which of them notice what.

   PULL_TRIES is the constant. Both directions are mutated on purpose, because
   they fail differently and only one of them is caught by the obvious test:

     fewer tries  files that should recover do not, so the count of loaded
                  traits moves and the loudest assertion fires
     more tries   NOTHING that arrives changes at all. The same 192 traits
                  load, the same eight are missing, the same sentence appears
                  on screen. Only the number of REQUESTS moves, which is why
                  that assertion was added rather than left as "more than 200".

   The second is the one worth having. A pull that never stopped retrying
   would look identical to a correct one in every visible respect. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/cloudpull.spec.js',
  ntests: 9,
  mutants: [
    {
      /* No retry at all. */
      name: 'a dropped download is not retried',
      find: `const PULL_TRIES=3;`,
      with: `const PULL_TRIES=1;`,
      kills: [
        'a file dropped by a flaky connection is retried, not abandoned',
        'a genuinely bad connection still loses some, and still says so',
      ],
      /* Two. The first loses the twenty files that were meant to recover; the
         second still loses its eight but now spends 200 requests instead of
         216. NOT 'but a file that is genuinely gone costs ONE request, not
         three' - a 404 was never retried, so a build that retries nothing
         satisfies it perfectly. That test is about the retry being SCOPED and
         cannot see it being absent, which is why both exist. */
    },
    {
      /* Retrying for ever, near enough. Everything a person could see is
         unchanged; only the request count betrays it. */
      name: 'a download that will never work is retried five times',
      find: `const PULL_TRIES=3;`,
      with: `const PULL_TRIES=5;`,
      kills: ['a genuinely bad connection still loses some, and still says so'],
      /* ONE, and only through its request count: 192 + 8*5 = 232 rather than
         216. NOT 'retried, not abandoned' - its twenty files succeed on their
         third attempt whether the cap is three or five, so its 240 is
         untouched. NOT the 404 test either. This is the mutant that would
         have survived the old assertions entirely, because "more than 200
         requests" is true of 232 and of any number above it. */
    },
  ],
});
process.exit(bad ? 1 : 0);
