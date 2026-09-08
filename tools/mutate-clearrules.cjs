/* PREDICTIONS for clearing the trait rules, written before the run.

   Two of these carry the weight. The first is that the ANSWERS go with the
   rules: a "no" answer rebuilds its rule on every load, so a clear that keeps
   them undoes itself - and does so quietly, one page load later, which is
   exactly the kind of failure a test suite exists to catch instead of a user.

   The second is the pair around the timestamp. An empty server and a full
   browser has two causes wanting opposite things: rules that predate the
   column, which must be sent up rather than lost, and rules somebody just
   cleared, which must be adopted. Getting the guard wrong in one direction
   makes the button useless; in the other it deletes 176 rules and 2,603
   answers from every browser that opens the project. Both directions are
   predicted, and a mutant that reddens only one of them is the interesting
   outcome. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/clearrules.spec.js',
  ntests: 10,
  mutants: [
    {
      name: 'the answers are kept, so the rules rebuild themselves',
      find: '  RULES=[]; DECISIONS=[];\n  let sent=false;',
      with: '  RULES=[];\n  let sent=false;',
      kills: ['takes the rules AND the answers behind them'],
    },
    {
      name: 'Cancel clears anyway',
      find: '    +"\\n\\nYour traits, layers and draw order are not touched.")) return;',
      with: '    +"\\n\\nYour traits, layers and draw order are not touched.")) {}',
      kills: ['and Cancel changes nothing'],
    },
    {
      name: 'the clear is not stamped, so the group cannot tell it from a gap',
      find: '          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});',
      with: '          decisions:DECISIONS, empty_chance:emptyChance})});',
      kills: ['in a group it clears them for the group too'],
    },
    {
      name: 'the stamp is not kept in this browser',
      find: '    groups:RULES.map(g=>g.slice()), rulesAt:rulesAt,',
      with: '    groups:RULES.map(g=>g.slice()),',
      kills: ['takes the rules AND the answers behind them'],
    },
    {
      name: 'ANY empty server is treated as a clear',
      find: '    if(theirsAt>rulesAt && nothingThere && (RULES.length||DECISIONS.length)){',
      with: '    if(nothingThere && (RULES.length||DECISIONS.length)){',
      kills: ['but older and empty is a collection that was never told'],
    },
    {
      name: 'no empty server is ever treated as a clear',
      find: '    if(theirsAt>rulesAt && nothingThere && (RULES.length||DECISIONS.length)){',
      with: '    if(false && nothingThere && (RULES.length||DECISIONS.length)){',
      kills: ['newer and empty is a clear, and is adopted'],
    },
    {
      name: 'a failed send still reports success',
      find: '    ? (sent ? "The group has them cleared too - import a rules file to start again."',
      with: '    ? (true ? "The group has them cleared too - import a rules file to start again."',
      kills: ['and a group it cannot reach is told about, not claimed'],
    },
    {
      name: 'an empty rule set is asked about anyway',
      find: '  if(!nR&&!nD){ say("There are no rules to clear."); return; }',
      with: '  if(!nR&&!nD){ say("There are no rules to clear."); }',
      kills: ['an empty rule set says so instead of asking'],
    },
    {
      name: 'CONTROL: the confirmation is worded differently',
      find: '  if(!confirm("Remove "+what.join(" and ")+"?"',
      with: '  if(!confirm("Remove the "+what.join(" and ")+"?"',
      kills: [],
    },
  ],
}));
