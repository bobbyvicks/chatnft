/* PREDICTIONS for the four specs that came with the sorter and the export.

   Declared here, BEFORE the run.

   36 tests across rulesync, reviewpairs, ruleexport and sortunsorted. They lean
   hard on absence: no rule was made, nothing was sent, none lost or invented,
   nothing moved just by looking. An absence is the easiest thing in the world
   to prove against an empty population, and three tests written today already
   did exactly that and had to be fixed - so the NOT lists below are the point
   of this file rather than the kills.

   The claims worth defending, in order of what they cost if wrong:

   1. The sorter REFUSES rather than guesses. Four of the five traits it cannot
      place on the real collection were deliberately deleted, and a guesser
      would put them back into the drawing set.
   2. A move carries its rules. 71 of 111 real moves are also renames, and a
      rename that leaves the rules behind kills every rule about the trait.
   3. A move never overwrites. dbPut overwrites, so a collision would destroy
      the trait already at the destination and the count would still look right.
   4. The export's direction comes from the decide order, not from the shape of
      the group. Written the other way it forbids the same pair and produces a
      different collection.
   5. A person's answer outranks the file's.

   === WHAT HAPPENED ===

   Five of nine did not behave as predicted. The kills below are the MEASURED
   result; what was predicted and why it was wrong is here, because a mutate
   file that always reports BAD stops being run and a corrected list with no
   record of the correction teaches nobody anything.

   ONE REAL GAP, and it was the most important claim in the file. Removing the
   "you beats file" branch SURVIVED: every merge test used fixtures with no
   src, which default to "you", so neither branch of the precedence was ever
   reached. The rule that stops a regenerated import silently reverting the
   team's review was proven only in patch244's own RUN block and by nothing in
   the suite. Three tests were added - a person's answer beating a far newer
   file, a newer file still superseding an older file, and an answer with no
   source counting as a person - and the mutant now kills the first.

   AND ONE THING THE ROUND TRIP CANNOT SEE, which corrects a claim I made about
   it. Making the export always take side A as the condition did NOT red "the
   real curated file survives a round trip". It cannot: that test compares the
   SET OF FORBIDDEN PAIRS, which is direction-free by construction. So the
   round trip proves the pairs and says nothing at all about direction, and
   direction rests entirely on the two small fixtures. Same for writing a
   whole-layer rule as an empty allow-list - the pairs read back identically,
   and only LaunchMyNFT's own validator would object. A round trip is a strong
   check of what it covers and silent about everything else.

   The other three were ordinary wrong predictions, each meaning a test is
   stronger than credited: dropping previousName also reds the missing-layers
   test (an unfound trait wants no layer), dropping out.unknown also reds the
   collision test (both report through the same list), and allowing same-layer
   pairs also reds the hide-layer test (its fixture has three hair traits,
   which become hair-to-hair rules).
*/
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/rulesync.spec.js tests/reviewpairs.spec.js tests/ruleexport.spec.js tests/sortunsorted.spec.js',
  ntests: 36,
  mutants: [
    {
      /* The rename half of the lookup. 212 of 251 traits were renamed, so a
         project that has not been re-imported carries the old names and only
         previousName can find them. */
      name: 'the sorter stops indexing the previous name',
      find: `    for(const n of [r.trait, r.previousName]){`,
      with: `    for(const n of [r.trait]){`,
      kills: [
        'a renamed trait is moved and renamed as one thing',
        'it names the layers that would have to be created',
        'applying it moves the trait and takes its rules with it',
        'and it refuses to overwrite a trait already at the destination',
      ],
      /* MUST SURVIVE: 'a trait that only needs a layer is just moved' - Dark
         Fringe was not renamed, so its current name still finds it. And the
         unknown test, which is about a trait in neither index. That asymmetry
         is why both fixtures exist. */
    },
    {
      /* The refusal. This is the one that protects deleted artwork. */
      name: 'a trait the inventory never mentions is guessed into a layer',
      find: `    if(!want){ out.unknown.push({id:t.id, name:here.name, layer:here.layer}); continue; }`,
      with: `    if(!want){ continue; }`,
      kills: [
        'and one the inventory never mentions is not guessed at',
        'two inventory rows pointing one name at two layers are refused',
      ],
      /* Two, because the collision test also reads out.unknown - a name the
         inventory points at two layers is reported the same way as one it has
         never heard of, both being "nothing can place this". Dropping the row
         silently rather than reporting it is invisible to every OTHER test,
         which is exactly what makes a quiet guess dangerous. */
    },
    {
      /* The collision guard. */
      name: 'a move is allowed to overwrite what is already there',
      find: `    if(taken.has(id)){ refused.push(r.name+" - "+r.toLayer+" already has one"); continue; }`,
      with: `    if(false){ refused.push(r.name+" - "+r.toLayer+" already has one"); continue; }`,
      kills: ['and it refuses to overwrite a trait already at the destination'],
    },
    {
      /* The rules following the trait. */
      name: 'a moved trait leaves its rules pointing at the old key',
      find: `      await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);`,
      with: `      ;`,
      kills: ['applying it moves the trait and takes its rules with it'],
      /* NOT the plan tests - planSort does not touch rules at all - and NOT the
         collision test, which moves nothing and so has no rule to carry. */
    },
    {
      /* The export's direction. */
      name: 'the export picks the condition by name order instead of decide order',
      find: `      const cond = rank(A.layer)<=rank(B.layer) ? A : B;`,
      with: `      const cond = A;`,
      kills: ['and reversing the decide order reverses the condition'],
      /* NOT 'the condition is the layer that decides first': with A always the
         condition and the group sorted, hats/cap sorts before hair/bob, so it
         happens to give the same answer. That is precisely why the reversing
         test exists - one fixture alone cannot tell a rule from a coincidence.
         NOT the hide-layer or three-layer tests either, which are about what is
         written rather than which side writes it. */
    },
    {
      /* Two traits on one layer can never co-occur, so a rule about them is not
         a rule LaunchMyNFT needs - and expressing it makes a layer forbid
         itself, which their validator rejects. */
      name: 'the export writes a rule for two traits on one layer',
      find: `      if(A.layer===B.layer) continue;`,
      with: `      if(false) continue;`,
      kills: [
        'a rule against a whole layer is written as hide layer',
        'two traits on one layer make no rule, because they can never co-occur',
      ],
    },
    {
      /* An empty allow-list can never be satisfied. */
      name: 'a whole-layer rule is written as an empty allow-list',
      find: `        : {action:"hide layer", targetLayer:tl, targetTrait:[]});`,
      with: `        : {action:"only pick from", targetLayer:tl, targetTrait:[]});`,
      kills: ['a rule against a whole layer is written as hide layer'],
      /* NOT the round trip: reading an empty "only pick from" back gives the
         same forbidden set, so the pairs survive. The file would be rejected by
         LaunchMyNFT's own validator rather than by us, which is exactly the
         kind of thing a round-trip check cannot see and a named test can. */
    },
    {
      /* Source outranks time. */
      name: 'a regenerated file can overrule a person by being newer',
      find: `    const wins = (one.src==="you"&&prev.src!=="you") ? true`,
      with: `    const wins = false ? true`,
      kills: ['a person answer beats the file, even when the file is newer'],
      /* NOT 'two people answering different pairs keep both answers', which is
         about the merge covering both pairs and does not care which won. */
    },
    {
      /* A bulk answer must not trample considered ones. */
      name: 'the bulk answer overwrites pairs somebody already decided',
      find: `  const list=revCandidates().filter(t=>pairState(revCond,traitKey(t))==="unseen");`,
      with: `  const list=revCandidates();`,
      kills: ['"the rest" leaves the ones you thought about alone'],
    },
  ],
});
process.exit(bad ? 1 : 0);
