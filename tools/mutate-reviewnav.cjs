/* Can these five tests fail? PREDICTIONS, written before the run.

   The keyboard guard is the one I most distrust: page.fill() sets a value
   without ever pressing a key, so a test that used fill would pass with the
   guard ripped out. Only the typing test uses real keystrokes, and it is the
   only one predicted to red for that mutant - if any other test moves, the
   prediction was wrong about how the suite exercises the field.

   Naming which tests should NOT move is the half that makes a kill mean
   something: four of these five mutants must red exactly ONE test each. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/reviewqueue.spec.js',
  ntests: 15,
  mutants: [
    { name: 'the shortcuts fire while a field has focus',
      find: '  if(typing) return;',
      with: '  if(false) return;',
      kills: ['stop the moment you are typing a name'] },

    { name: 'the jump stops on entries that are already finished',
      find: '    if(reviewDone(REVIEW.entries[i])) continue;',
      with: '    if(false) continue;',
      /* PREDICTION CORRECTED AFTER THE FIRST RUN, and the first version is
         worth keeping: I predicted ONE red and got two. The only-one-left
         test finishes entries 1 and 2 first, so with the skip-finished check
         gone the jump from entry 3 lands on entry 1 and announces a wrap - a
         second, different lie from the same mutation. The mutant was killed
         either way; what was wrong was my account of which tests defend
         this line, which is the half that makes a kill mean anything. */
      kills: ['COME BACK TO A SKIPPED ONE', 'does not pretend to move'] },

    { name: 'wrapping happens silently',
      find: '    if(wrapped) toast("Wrapped round to the "+(dir>0?"start":"end"));',
      with: '    if(false) toast("Wrapped round to the "+(dir>0?"start":"end"));',
      kills: ['says when it wrapped'] },

    { name: 'landing back on the current entry reads as a move',
      find: '    if(i===from){ toast("This is the only one still unanswered"); return false; }',
      with: '    if(false){ toast("This is the only one still unanswered"); return false; }',
      kills: ['does not pretend to move'] },

    /* This one is predicted to red TWO, because the exact count string is
       pinned by the opening test as well. */
    { name: 'the count hides what is left',
      find: '    +(left?", "+left+" left":"");',
      with: '    +"";',
      kills: ['count says how many are left', 'opens at the first trait'] },
  ],
}));
