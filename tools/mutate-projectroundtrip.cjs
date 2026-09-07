/* PREDICTIONS for tests/projectroundtrip.spec.js.

   Declared here, BEFORE the run.

   Ten tests over a backup. The failure this feature was built to fix was
   silent by construction - Export project wrote a file, Import project read
   it, said "Imported 3 items", and a hundred combination rules were simply
   not in it. Nothing threw and nothing looked wrong. So the question is
   whether these tests can tell a backup that carries everything from one that
   quietly carries less, and whether they can tell a RESTORE from a MERGE.

   The claims worth defending, in order of what they cost if wrong:

   1. A restore brings the rules and the answers back. This is the defect.
   2. An import into a live project does not overwrite that project's grid or
      draw order. This is the risk the fix introduces, and it is the one a
      test suite full of restore cases would never see.
   3. Rules are added, never swapped. Same rule the importer already keeps for
      traits, applied to the more expensive thing.

   wasEmpty is mutated in BOTH directions on purpose. It is one line deciding
   which of two behaviours happens, so a suite that only covers one of them
   would pass with it stuck in the position that suits it. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/projectroundtrip.spec.js',
  ntests: 10,
  mutants: [
    {
      /* The defect itself, restored: an export that writes no rules. */
      name: 'the export goes back to dropping the rules',
      find: `    rules:RULES.map(g=>g.slice()),`,
      with: `    rules:[],`,
      kills: [
        'brings the combination rules back',
        'their rules are added to mine, not swapped for them',
      ],
      /* Two. The second exports the same filled project before importing it
         into a live one, so an export that carries no rules leaves that test
         with one rule where it wants two. NOT the answers test - decisions
         travel in their own field and are untouched by this. */
    },
    {
      /* The line that decides restore-or-merge, stuck on RESTORE. Every
         restore test still passes; only the live project notices. */
      name: 'every import is treated as a restore',
      find: `  const wasEmpty=!existing.some(i=>i.kind==="trait");`,
      with: `  const wasEmpty=true;`,
      kills: ['but my grid and my draw order are left alone'],
      /* ONE, and it is the whole reason that test exists. Seven restore tests
         and two merge tests stay green while an imported file silently
         redraws the grid of a project somebody is working in. NOT the rules
         and answers tests either way - those merge regardless of wasEmpty,
         which is deliberate and is what makes this mutant so quiet. */
    },
    {
      /* And stuck on MERGE, which breaks the restore instead. */
      name: 'no import is ever treated as a restore',
      find: `  const wasEmpty=!existing.some(i=>i.kind==="trait");`,
      with: `  const wasEmpty=false;`,
      kills: [
        'and the order traits are picked in',
        'and the cell grid the collection is drawn on',
        'and which layers were turned off',
        'and the base colour it learnt',
      ],
      /* Four, and NOT the rules or the answers - they merge unconditionally,
         so the two most valuable things in a backup come back either way.
         That asymmetry is the point of splitting them: what merges is safe to
         merge always, and what cannot be merged waits for a restore. */
    },
    {
      /* The answers, dropped on the way in. */
      name: 'the import reads the answers and does nothing with them',
      find: `    DECISIONS=mergeDecisions(DECISIONS, doc.decisions);`,
      with: `    ;`,
      kills: [
        'and the answers behind them',
        'their rules are added to mine, not swapped for them',
      ],
      /* Two, because the merge test counts answers as well as rules - a file
         can carry rules and lose the review behind them, and one assertion
         each is what tells those two apart. */
    },
    {
      /* Rules REPLACED rather than merged. Invisible to every restore test,
         because a restore starts with nothing to lose. */
      name: 'an imported file replaces the rules already here',
      find: `    const have=new Set(RULES.map(ruleId));`,
      with: `    RULES=[]; const have=new Set();`,
      kills: ['their rules are added to mine, not swapped for them'],
      /* ONE. Seven restore tests cannot see this at all: RULES is empty when
         they run, so replacing an empty list with the file's is exactly what
         merging it would do. The only test that can tell the difference is
         the one with a rule of its own already in the project. */
    },
  ],
});
process.exit(bad ? 1 : 0);
