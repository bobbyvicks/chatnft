/* PREDICTIONS for tests/clearproject.spec.js.

   Declared here, BEFORE the run.

   Six tests over a destructive button that now does two different things
   depending on an answer. The risk is not that it fails to delete - that is
   loud and immediate. It is that it deletes MORE than it asked about, or that
   it appears to and does not.

   The claims worth defending, in order of what they cost if wrong:

   1. Cancel keeps the rules. That is the decision this file already recorded
      and gave a reason for, and this change must not quietly reverse it. A
      hundred rules exist nowhere else once they are gone.
   2. Yes really removes them - from the STORE, not just from the variables.
      Clearing memory looks identical to clearing the records until the page is
      opened again, and the version this replaces failed in exactly that way:
      the layer list came back to the defaults after a reload because the
      record had never gone.
   3. The second question is asked. A build that stopped asking and defaulted
      to keeping would pass every assertion about keeping. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/clearproject.spec.js',
  ntests: 6,
  mutants: [
    {
      /* Never asks, always takes. The worst of the four: it destroys the thing
         the original comment protected, and it does it without a dialog. */
      name: 'the second question is not asked and the answer is taken as yes',
      find: `      alsoSettings=confirm("Also remove "+have.join(", ")`,
      with: `      alsoSettings=true||confirm("Also remove "+have.join(", ")`,
      kills: [
        'and asks a second time before touching the rules',
        'says no, and the rules stay - which is the recorded decision',
      ],
      /* Two. NOT 'says yes, and there is genuinely nothing left' - that test
         answers yes anyway, so a build that never asks satisfies it perfectly,
         and NOT the reload test for the same reason. That is exactly why the
         cancel path has its own test: the destructive path cannot see this. */
    },
    {
      /* Asks, and then ignores the answer in the other direction. */
      name: 'the answer is asked for and nothing acts on it',
      find: `  if(alsoSettings){`,
      with: `  if(false){`,
      kills: [
        'says yes, and there is genuinely nothing left',
        'and it survives a reload, rather than coming back',
      ],
      /* Two, and NOT the cancel test, which wants exactly this behaviour, nor
         the question test, which only cares that it was asked. */
    },
    {
      /* THE ONE THE RELOAD TEST EXISTS FOR. The variables are cleared and the
         records are not, so everything on screen says it worked. */
      name: 'the settings are cleared in memory but left in the store',
      find: `      try{ await dbDel(id); kept--; }catch(_){}`,
      with: `      ;`,
      kills: [
        'says yes, and there is genuinely nothing left',
        'and it survives a reload, rather than coming back',
      ],
      /* Two, but they are not the same assertion twice. The first catches it
         only because it counts the settings rows still in the store; every
         other assertion in that test - no rules, no answers, no draw order,
         the grid back to 160 - passes, because all of those read the
         variables. Drop that one count and this mutant survives until a
         reload, which is how the version being replaced shipped. */
    },
    {
      /* The question stops naming what it would take. */
      name: 'the second question does not count the rules it would remove',
      find: `    if(RULES.length) have.push(RULES.length+" rule"+(RULES.length===1?"":"s"));`,
      with: `    if(false) have.push(RULES.length+" rule"+(RULES.length===1?"":"s"));`,
      kills: ['and asks a second time before touching the rules'],
      /* ONE. The question is still asked - the answers, the draw order, the
         base colour and the grid are all still counted, so `have` is not empty
         and the dialog still appears. It just no longer says the thing that
         matters most, which nothing but a test reading the message can see. */
    },
  ],
});
process.exit(bad ? 1 : 0);
