/* PREDICTIONS for tests/teammateedit.spec.js.

   Declared here, BEFORE the run.

   Seven tests over a sync that was wrong in a way no count could see. Before
   the fix the row count was right, the names were right, the layers were
   right, and the picture was somebody else's work thrown away - so the whole
   suite turns on comparing ONE BYTE of the stored blob, and these mutants are
   the check that it really does.

   The claims worth defending, in order of what they cost if wrong:

   1. Their newer edit replaces yours. This is the defect and the reason the
      feature was asked for.
   2. It never costs you unsaved work. The fix makes the pull destructive for
      the first time, so this is the risk the fix introduces rather than one
      it removes.
   3. An older server copy does not overwrite a newer local one. Without it,
      "always take the server's" passes claim 1 while making every pull undo
      whatever this device last sent.

   `newer` is mutated in both directions for that reason: it is one comparison
   choosing between two destructive outcomes, and a suite that only covered one
   would pass with it stuck in the position that suits it. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/teammateedit.spec.js',
  ntests: 7,
  mutants: [
    {
      /* The defect itself, restored: nothing is ever considered newer, so a
         teammate's edit is never taken. */
      name: 'a teammate edit is never treated as newer',
      find: `      const newer=!!theirs && (!ours || theirs>ours);`,
      with: `      const newer=false;`,
      kills: [
        'their version replaces yours, rather than being thrown away',
        'and it never overwrites work you have not saved yet',
        'the mailbox says what changed, and stays until it is read',
        'and survives a reload, because that is what a mailbox is for',
      ],
      /* Four. The unsaved-work test is in there for a reason worth stating: it
         checks the BYTE stays 7, which this mutant satisfies, and also that
         the disagreement was REPORTED - and with nothing ever newer there is
         no disagreement to report. Without that second assertion the test
         would pass against a build that had simply stopped working.

         NOT 'and is not added a second time under another name', which counts
         one trait either way, NOT the older-copy control, which wants the
         local byte kept and gets it, and NOT 'Mark as read', which empties a
         mailbox that this mutant leaves empty to begin with. */
    },
    {
      /* And stuck the other way: anything the server timestamps wins. */
      name: 'the server copy is always treated as newer',
      find: `      const newer=!!theirs && (!ours || theirs>ours);`,
      with: `      const newer=!!theirs;`,
      kills: ['but an older copy on the server does not overwrite a newer one here'],
      /* ONE, and it is the only test that can see it. Every other fixture has
         the server ahead of the local copy, so they all pass while every pull
         quietly undoes the last thing this device saved. That is what a
         control is for. */
    },
    {
      /* The guard over unsaved work removed. */
      name: 'a newer server copy overwrites unsaved local work',
      find: `      if(newer && cur.synced){`,
      with: `      if(newer){`,
      kills: ['and it never overwrites work you have not saved yet'],
      /* ONE. Nothing else in the file has an unsynced record, so this is
         invisible everywhere else - and it is the single most destructive
         thing the change could do, because the work it deletes exists on no
         server and in no other copy. */
    },
    {
      /* The mailbox stops recording arrivals. */
      name: 'an arriving edit is applied but not recorded',
      find: `        if(w.incoming) incoming.push({name:w.name, layer:w.layer, at:w.row.updated_at||null});`,
      with: `        ;`,
      kills: [
        'the mailbox says what changed, and stays until it is read',
        'and survives a reload, because that is what a mailbox is for',
      ],
      /* Two, and NOT 'their version replaces yours'. The edit still arrives
         and the byte still changes - the person just never finds out it
         happened, which is precisely the state this feature was asked to end
         and is completely invisible to the tests about correctness. */
    },
    {
      /* Recorded, shown, and never written down. */
      name: 'the mailbox is kept in memory and never saved',
      find: `  await mailSave();`,
      with: `  ;`,
      kills: [
        'the mailbox says what changed, and stays until it is read',
        'and survives a reload, because that is what a mailbox is for',
      ],
      /* PREDICTED THE WRONG TWO, and the correction is worth more than the
         kill. I expected this to survive 'the mailbox says what changed',
         reasoning that it reads MAIL in memory and MAIL is still set. It does
         not survive, and the reason is a design fact I had not written down:
         applyMail RE-READS the store on every renderShelf, so the store is
         authoritative and an unsaved mailbox is erased by the very next render
         - which that test triggers itself, when it redraws the shelf to check
         the note is still there.

         And I expected 'Mark as read' to red. It survives, because mailClear
         has a mailSave call of its own that this mutation does not touch: it
         writes an empty list over a record that was never written, and the
         test's store assertion is satisfied. So that test cannot see this
         mutant at all, and the pair that can are the two that render again. */
    },
  ],
});
process.exit(bad ? 1 : 0);
