/* PREDICTIONS for the five specs added with the rules import.

   41 tests across decideorder, ruleimport, randomiserules, importlayers and
   rulestate. Most of them assert an ABSENCE - a pair that never appears, a
   layer that never gets created, a request that never carries a rule - and an
   absence is the easiest thing in the world to prove against an empty
   population. Two tests written the same day already did exactly that and had
   to be fixed, so the NOT lists are the point of this file rather than the
   kills.

   === WHAT HAPPENED ON THE FIRST RUN ===

   Six of eleven mutants did not behave as predicted. TWO were real defects in
   the tests; four were my reasoning being wrong about tests that were fine.
   The kills below are the MEASURED result. What I predicted, and why I was
   wrong, is recorded here rather than quietly overwritten - a mutate file that
   always reports BAD stops being run, and a corrected list with no record of
   the correction teaches nobody anything.

   THE TWO REAL ONES:

   - The de-duplication mutant SURVIVED. I had it killed by 'a decide order
     naming a layer that is gone', but that fixture supplies a STALE name, not
     a REPEATED one, so it could not tell. The dedup fix - the bug a design
     panel found in my own code, where a repeated layer put two hats on one
     character - had no coverage at all. A test was added.

   - Removing folder adoption did NOT red 'and unsorted stays last'. That test
     asserted `LAYERS.indexOf('hats') < LAYERS.indexOf('unsorted')`, and
     indexOf returns -1 for a layer that does not exist, so it passed when the
     layer was never created. An ordering assertion is satisfied by absence
     unless something proves the thing is there. It now asserts the layer
     exists first, and the mutant kills it.

   THE FOUR I SIMPLY GOT WRONG, all of which mean the tests are stronger than
   I credited:

   - Randomise ignoring the rules also reds 'while still filling the layers it
     can'. I reasoned "ignoring the rules fills MORE, not less" - but that test
     asserts EXACTLY ONE of the pair is chosen each press, and ignoring the
     rules gives both. It is a tighter assertion than I read it as.

   - Inverting the complement reds the HIDE test, which I predicted would
     survive. For a hide the allowed set is empty, so filtering to what is
     allowed produces nothing to forbid and no rule at all. My reasoning that
     "a hide cannot tell the difference" was backwards.

   - Inverting the hide test, on the other hand, does NOT red the hide test.
     `targetTrait` is empty for a hide, so building the allow set from it or
     skipping it both leave it empty and the group comes out identical. That
     mutant is equivalent on hides and only bites the allow-lists.

   - An action that forbids nothing becoming a rule reds three tests, not one:
     a group of one member changes the counts in the report and the duplicate
     check as well as the group list.
*/
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/decideorder.spec.js tests/ruleimport.spec.js tests/randomiserules.spec.js tests/importlayers.spec.js tests/rulestate.spec.js',
  ntests: 41,
  mutants: [
    {
      /* The whole point of the decide order: put it back to walking the paint
         order and the hat is the side that yields again. */
      name: 'buildCombo decides in paint order again',
      find: `  for(const layer of decideOrder()){`,
      with: `  for(const layer of LAYERS){`,
      kills: [
        'deciding hats before hair is what lets it appear',
        'and the character is still PAINTED hair under hat',
      ],
      /* MUST SURVIVE, and did: 'an unset decide order is exactly the paint
         order' reads decideOrder() directly and never generates; 'in that
         order the bare-head hat can never be chosen' IS the paint-order
         behaviour and would pass more emphatically, not less; 'the rule holds
         under both orders' survives because breaking the order does not break
         the rule, and if it moved the pair would be measuring one thing twice.
         No Randomise test moves either - composeRandom has its own walk. */
    },
    {
      /* The other half. Decide correctly, then hand the records back in decide
         order instead of paint order. */
      name: 'the combo is returned in decide order, not paint order',
      find: `  const combo=out.slice(0,first).concat(out.slice(first)
    .sort((a,b)=>paintAt((a&&a.layer)||"unsorted")-paintAt((b&&b.layer)||"unsorted")));`,
      with: `  const combo=out;`,
      kills: ['and the character is still PAINTED hair under hat'],
      /* And nothing else, which is the result that matters: the rule still
         holds, the hat is still chosen first, the set of traits is identical -
         only the order they are painted in changes. If the "bare-head hat can
         be chosen" test had moved here it would be reading the paint order
         rather than what was chosen. */
    },
    {
      /* The bug a design panel found in my own code, and the mutant that
         proved it had no test until one was written for it. */
      name: 'the decide order stops de-duplicating',
      find: `  const named=[...new Set(DECIDE_ORDER)].filter(l=>LAYERS.indexOf(l)>=0);`,
      with: `  const named=DECIDE_ORDER.filter(l=>LAYERS.indexOf(l)>=0);`,
      kills: ['a layer named twice in the order is still visited once'],
      /* Only that one. Every other fixture supplies a clean permutation and
         cannot tell - including the stale-name test, which is why predicting
         THAT one was wrong. */
    },
    {
      /* Randomise, back to ignoring the rules. */
      name: 'Randomise stops consulting the rules',
      find: `    const ok = RULES.length ? recs.filter(r=>!conflictsWith(r,chosen)) : recs;`,
      with: `    const ok = recs;`,
      kills: [
        'and with a rule, it never does',
        'while still filling the layers it can',
        'and the hat is the one that survives, because hats decide first',
        'reversing the decide order reverses which one yields',
      ],
      /* MUST SURVIVE: 'the fixture really does put both on a character, with
         no rule'. That is the control - it has no rule to ignore, so a version
         that ignores rules must leave it completely unmoved, and if it ever
         reds here the control is not a control. No generator test may move
         either, because composeRandom is not on the generator's path. */
    },
    {
      /* The translation. Forbid what the action ALLOWS instead of what it
         leaves out - the off-by-one that would silently invert 103 rules. */
      name: 'the import forbids the allowed traits instead of the rest',
      find: `        const deny=all.filter(n=>!allow.has(n));`,
      with: `        const deny=all.filter(n=>allow.has(n));`,
      kills: [
        'a hide becomes a rule against every trait on that layer',
        'and an allow-list becomes a rule against what it leaves out',
        'an allow-list naming everything is not a rule at all',
        'choosing the file is what actually adds them',
      ],
      /* MUST SURVIVE: the three tests about the REPORT and about merging. They
         are satisfied by any non-empty set of groups, right or wrong, which is
         correct - they are not about the complement and should not be able to
         tell. The complement is defended by the four above. */
    },
    {
      /* An action that allows everything must not become a rule. */
      name: 'an action that forbids nothing becomes a rule anyway',
      find: `        if(!deny.length){ out.restrictNothing++; continue; }`,
      with: `        if(!deny.length){ out.restrictNothing++; }`,
      kills: [
        'an allow-list naming everything is not a rule at all',
        'and the report says what it could not do, not just what it did',
        'importing the same file twice adds nothing and says so',
      ],
      /* A group of one member. ruleGroup keeps it and applyRules drops it on
         the next load, so it survives one session and vanishes - which is
         exactly the kind of change that looks harmless and silently moves the
         rule count. Three tests notice, not one. */
    },
    {
      /* hide layer must mean "allow nothing". */
      name: 'hide layer is treated as an ordinary allow-list',
      find: `        if(s.action!=="hide layer")`,
      with: `        if(s.action==="hide layer")`,
      kills: [
        'and an allow-list becomes a rule against what it leaves out',
        'an allow-list naming everything is not a rule at all',
        'choosing the file is what actually adds them',
        'and the report says what it could not do, not just what it did',
        'importing the same file twice adds nothing and says so',
        'a rule made by hand is not destroyed by an import',
      ],
      /* EQUIVALENT ON HIDES, which is why the hide test survives it and why
         predicting otherwise was wrong: a hide carries an empty targetTrait,
         so building the allow set from it or skipping it both leave it empty
         and the group is identical. This mutant only bites allow-lists. */
    },
    {
      /* Merging, not replacing. */
      name: 'the import stops noticing a rule it already has',
      find: `    if(have.has(id)){ already++; continue; }`,
      with: `    if(false){ already++; continue; }`,
      kills: ['importing the same file twice adds nothing and says so'],
      /* NOT 'a rule made by hand is not destroyed by an import' - duplicating
         imported rules does not destroy the hand-made one. If it moved here it
         would be measuring duplication rather than survival. */
    },
    {
      /* The panel's own honesty. */
      name: 'the rules note appears even with no rules',
      find: `  if(!RULES.length){ el.hidden=true; el.textContent=""; return; }`,
      with: `  if(false){ el.hidden=true; el.textContent=""; return; }`,
      kills: ['with no rules it says nothing at all'],
    },
    {
      /* A folder that is not a layer yet. */
      name: 'the import stops adopting a folder as a layer',
      find: `    if(i.isRef||i.layer||!i.folder) continue;`,
      with: `    continue;`,
      kills: [
        'a folder named after a layer becomes that layer',
        'and unsorted stays last, so nothing new paints on top of everything',
        'creating a layer is reported, not slipped in',
        'a status folder never becomes a layer',
        'and the whole thirteen-folder collection lands where it should',
      ],
      /* MUST SURVIVE: 'nor does a base folder', which is an absence satisfied
         by adopting nothing, and 'a layer the project already has is used' -
         masks is a default layer and never needed adopting. The base-folder
         claim is defended by the mutant below instead.

         'and unsorted stays last' is in the kill list only because the test
         was fixed after this mutant survived it. */
    },
    {
      /* The other direction: adopt everything, including the folders that mean
         something else. */
      name: 'a status folder is allowed to become a layer',
      find: `    if(STATUSES.indexOf(s)>=0||isBaseSeg(s)) continue;`,
      with: `    if(isBaseSeg(s)) continue;`,
      kills: ['a status folder never becomes a layer'],
      /* NOT the base-folder test, whose half of that condition is still
         standing - the pair is split deliberately so each half is defended on
         its own rather than by the other. */
    },
  ],
});
process.exit(bad ? 1 : 0);
