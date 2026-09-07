/* Importing a REGENERATED file over an earlier one.

   The workflow, in the user's words: "im going to have it done automatically
   on codex and import it over. i just want it to be editable on our site after
   its been sent over... im also working on tightening the parameters to make
   the auto detect better". So the loop is generate, import, edit here,
   regenerate tighter, import again - and that last step had never been
   designed.

   MEASURED, on a fixture standing in for exactly that sequence. v1 says the
   cap allows only bob, so the cap excludes curls and mop. A person then
   answers "yes, the cap works with mop" in the review sheet. v2 is regenerated
   tighter: the cap now allows bob AND curls, and a new beret hides hair
   entirely. Importing v2 gave:

     cap excludes curls   <- STALE. v2 explicitly allows curls; the rule came
                             from v1 and nothing removes it.
     cap excludes mop     <- the person's answer, silently reverted.
     beret excludes hair  <- correct.

   and DECISIONS still held "cap + mop = yes", so the app's two records
   CONTRADICTED each other: the review sheet would show that pair excluded
   while the decision log said the person allowed it. Three faults, none
   reported, and they compound every time the generator is re-run.

   WHY IT HAPPENED. The import only ever ADDS: for each group in the file, add
   it unless an identical one is already there. That was deliberate - importing
   must not destroy rules made by hand, and there is a test saying so - but it
   means a file can never take back what a previous version of itself said.

   THE FIX IS TO GIVE THE FILE A VOICE ON PAIRS IT ALLOWS, not just on pairs it
   forbids. An import now records a decision for every pair it settles:

     a NO for every pair the file excludes, and
     a YES only where the file allows a pair that some rule currently forbids

   The second is the whole trick, and it is deliberately narrow. Recording a
   yes for every allowed pair would be tens of thousands of entries on this
   collection; recording one only where it CHANGES something is a handful -
   exactly the stale rules a previous generation left behind.

   AND A PERSON'S ANSWER BEATS THE FILE'S, whatever the dates. mergeDecisions
   took the newest per pair, which would let a regenerated file quietly revert
   an answer somebody gave in the sheet after looking at the picture. Source
   now outranks time: 'you' beats 'file', and among the same source the newest
   still wins. The report says how many of their answers overrode the file, so
   nobody has to guess whether the import did what they meant.

   Run against the measured sequence, the same three steps now give: after v1
   the cap excludes curls and mop; after the answer, only curls; after v2, the
   cap excludes NOTHING - curls freed by the file, mop kept by the person - and
   the beret excludes hair.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf("src:'file'") >= 0 || doc.original.indexOf('src:"file"') >= 0)
  throw new Error('already patched');
if (doc.original.indexOf('function planRuleImport(docIn, traits){') < 0)
  throw new Error('the import has to exist first');

/* ---- 1. a person's answer outranks the file's ---- */
{
  const r = kit.run(doc.lines,
    l => l === 'function mergeDecisions(a,b){',
    l => l === '}',
    'mergeDecisions',
    kit.inFunction(doc.lines, 'function mergeDecisions(a,b){'));
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('(d.at||0)>=(prev.at||0)') < 0)
    throw new Error('mergeDecisions is not the newest-wins shape this expects');
  kit.replace(doc.lines, r, [
    'function mergeDecisions(a,b){',
    '  const by=new Map();',
    '  for(const d of (a||[]).concat(b||[])){',
    '    if(!d||!d.a||!d.b) continue;',
    '    const k=pairId(d.a,d.b), prev=by.get(k);',
    '    const one={a:pairOf(d.a,d.b)[0],b:pairOf(d.a,d.b)[1],ok:!!d.ok,at:d.at||0,',
    '      by:d.by||null,src:d.src==="file"?"file":"you"};',
    '    if(!prev){ by.set(k,one); continue; }',
    '    /* SOURCE OUTRANKS TIME. Newest-wins alone let a regenerated file revert',
    '       an answer somebody gave in the sheet after looking at the picture -',
    '       measured: a yes on cap+mop came back as an exclusion on the next',
    '       import, while the decision log still said yes. A person looked at it;',
    '       the generator guessed. Among the SAME source the newest still wins, so',
    '       two reviewers still merge by time and a re-run still supersedes the',
    '       run before it. */',
    '    const wins = (one.src==="you"&&prev.src!=="you") ? true',
    '               : (prev.src==="you"&&one.src!=="you") ? false',
    '               : (one.at>=prev.at);',
    '    if(wins) by.set(k,one);',
    '  }',
    '  return [...by.values()];',
    '}',
  ]);
  console.log('ok  a person\'s answer outranks the file\'s');
}

/* ---- 2. the file gets a voice on what it ALLOWS ---- */
{
  const at = kit.only(doc.lines, l => l === '  out.order=decideOrderFor(out.edges);', 'the plan tail');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  /* WHAT THIS FILE SETTLES, as answers rather than only as rules.',
    '',
    '     A rule can only say "these two never together", so a file that has',
    '     STOPPED forbidding a pair has no way to say so and the old rule lives',
    '     forever. Recording the allow side fixes that - but only where it',
    '     changes something. A yes for every allowed pair would be tens of',
    '     thousands of entries on a real collection; a yes only where a rule',
    '     currently forbids it is exactly the leftovers of the previous run.',
    '',
    '     Read from RULES as they stand, before anything is added, so "currently',
    '     forbidden" means by the OLD set rather than by this import. */',
    '  const now=Date.now();',
    '  for(const d of out.pairs){',
    '    if(!d.ok){ out.decisions.push({a:d.a,b:d.b,ok:false,src:"file",at:now}); continue; }',
    '    if(RULES.some(g=>g.indexOf(d.a)>=0&&g.indexOf(d.b)>=0))',
    '      out.decisions.push({a:d.a,b:d.b,ok:true,src:"file",at:now});',
    '  }',
    '  out.order=decideOrderFor(out.edges);',
  ]);
  /* Every pair the file settles, gathered where the groups are built. */
  const r = kit.run(doc.lines,
    l => l === '        const deny=all.filter(n=>!allow.has(n));',
    l => l === '        out.groups.push(ruleGroup([ck].concat(deny.map(n=>tl+"/"+n))));',
    'the group build');
  kit.replace(doc.lines, r, [
    '        const deny=all.filter(n=>!allow.has(n));',
    '        /* Both sides, for the decision record: what it forbids and what it',
    '           lets through. The groups below still carry only the forbidden',
    '           side, so the rule list stays as compact as it was. */',
    '        for(const n of all) out.pairs.push({a:ck,b:tl+"/"+n,ok:deny.indexOf(n)<0});',
    '        /* An action that forbids nothing is not a rule. Counted, so the',
    '           report can say why 121 actions became fewer groups. */',
    '        if(!deny.length){ out.restrictNothing++; continue; }',
    '        out.groups.push(ruleGroup([ck].concat(deny.map(n=>tl+"/"+n))));',
  ]);
  /* The two new collections on the plan. */
  const decl = kit.only(doc.lines,
    l => l === "  const out={groups:[], order:[], actions:0, restrictNothing:0,", 'the plan shape');
  doc.lines[decl] = "  const out={groups:[], order:[], actions:0, restrictNothing:0, pairs:[], decisions:[],";
  console.log('ok  and the file now says what it allows, where that changes something');
}

/* ---- 3. the import applies them, and says what it did ---- */
{
  const r = kit.run(doc.lines,
    l => l === '  const before=RULES.length;',
    l => l === "  let ordered=false;",
    'the apply block');
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('if(have.has(id)){ already++; continue; }') < 0)
    throw new Error('the merge block is not the shape this expects');
  kit.replace(doc.lines, r, [
    '  const before=RULES.length;',
    '  /* What was in force before, so the report can say what this file took',
    '     back as well as what it added. */',
    '  const was=new Set(RULES.map(ruleId));',
    '  const have=new Set(RULES.map(ruleId));',
    '  let added=0, already=0;',
    '  for(const g of plan.groups){',
    '    const id=ruleId(g);',
    '    if(have.has(id)){ already++; continue; }',
    '    have.add(id); RULES.push(g); added++;',
    '  }',
    '  /* THEN the answers, over the top. The file\'s own yes entries undo rules a',
    '     previous version of it left behind; a person\'s answers survive both,',
    '     because mergeDecisions ranks source above time. Applied after the groups',
    '     are added so a human yes can take back a pair this very import added. */',
    '  const mine=DECISIONS.filter(d=>d.src!=="file").length;',
    '  DECISIONS=mergeDecisions(DECISIONS,plan.decisions);',
    '  for(const d of DECISIONS) applyDecision(d.a,d.b,d.ok);',
    '  const kept=DECISIONS.filter(d=>d.src!=="file").length;',
    '  const removed=[...was].filter(id=>!RULES.some(g=>ruleId(g)===id)).length;',
    '  let ordered=false;',
  ]);
  /* And the report line. */
  const rep = kit.only(doc.lines,
    l => l.indexOf('if(already) bits.push(already+" already here");') >= 0, 'the report');
  kit.replace(doc.lines, { start: rep, end: rep },
    ['  if(already) bits.push(already+" already here");',
     '  /* NAMED, because a re-import that quietly dropped rules or quietly',
     '     reverted somebody\'s answers is the thing this was fixed for. */',
     '  if(removed) bits.push(removed+" no longer wanted by this file "+(removed===1?"was":"were")+" removed");',
     '  if(kept) bits.push(kept+" of your own answer"+(kept===1?"":"s")+" kept over the file");']);
  console.log('ok  and the import applies them and reports both directions');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const md = kit.inFunction(codeLines, 'function mergeDecisions(a,b){');
  const m = codeLines.slice(md.start, md.end + 1).join('\n');
  if (m.indexOf('(one.src==="you"&&prev.src!=="you") ? true') < 0)
    throw new Error('a regenerated file could still revert a person\'s answer');
  if (m.indexOf('(one.at>=prev.at)') < 0)
    throw new Error('two reviewers no longer merge by time');
  /* Anything without a source is a person's - the answers written before this
     existed were all made by hand. */
  if (m.indexOf('src:d.src==="file"?"file":"you"') < 0)
    throw new Error('an answer with no source would be treated as the file\'s');

  const pl = kit.inFunction(codeLines, 'function planRuleImport(docIn, traits){');
  const p = codeLines.slice(pl.start, pl.end + 1).join('\n');
  if (p.indexOf('out.pairs.push') < 0) throw new Error('the file does not record what it allows');
  if (p.indexOf('src:"file"') < 0) throw new Error('the file\'s answers are not marked as its own');
  /* The yes side must stay narrow, or a real collection writes tens of
     thousands of entries on every import. */
  if (p.indexOf('if(RULES.some(g=>g.indexOf(d.a)>=0&&g.indexOf(d.b)>=0))') < 0)
    throw new Error('a yes is recorded for every allowed pair, not only the stale ones');
  /* planRuleImport must STILL write nothing. */
  for (const bad of ['RULES.push', 'saveRules', 'dbPut', 'DECISIONS='])
    if (p.indexOf(bad) >= 0) throw new Error('planRuleImport changes state: ' + bad);

  /* The handler applies the answers after adding the groups.

     Searched FROM the group-add, not from the start of the file: cloudPull has
     its own `for(const d of DECISIONS) applyDecision(...)` and it appears
     earlier, so a bare indexOf finds the wrong one and this check failed
     against perfectly good code. A position check needs the position it means. */
  const add = code.indexOf('have.add(id); RULES.push(g); added++;');
  if (add < 0) throw new Error('the group-add is not where this expects');
  const app = code.indexOf('for(const d of DECISIONS) applyDecision(d.a,d.b,d.ok);', add);
  if (app < 0)
    throw new Error('the answers are applied before the groups, so a yes cannot take one back');
  /* And both directions are reported. */
  if (code.indexOf('no longer wanted by this file') < 0)
    throw new Error('a rule the file took back is removed silently');
  if (code.indexOf('of your own answer') < 0)
    throw new Error('nothing says whose answers survived');
});

/* RUN the whole sequence that was measured broken. */
{
  const pid = (a, b) => (a < b ? [a, b] : [b, a]).join(' ');
  const merge = (x, y) => {
    const by = new Map();
    for (const d of x.concat(y)) {
      const k = pid(d.a, d.b), prev = by.get(k);
      const one = Object.assign({}, d, { src: d.src === 'file' ? 'file' : 'you' });
      if (!prev) { by.set(k, one); continue; }
      const wins = (one.src === 'you' && prev.src !== 'you') ? true
        : (prev.src === 'you' && one.src !== 'you') ? false
          : (one.at >= prev.at);
      if (wins) by.set(k, one);
    }
    return [...by.values()];
  };
  const ruleGroup = l => [...new Set(l)].sort();
  let RULES = [];
  const apply = (a, b, ok) => {
    const A = a < b ? a : b, B = a < b ? b : a;
    const holds = g => g.indexOf(A) >= 0 && g.indexOf(B) >= 0;
    if (!ok) { if (RULES.some(holds)) return; RULES = RULES.concat([ruleGroup([A, B])]); return; }
    RULES = RULES.map(g => {
      if (!holds(g)) return g;
      const L = k => k.slice(0, k.indexOf('/')), n = k => g.filter(x => L(x) === L(k)).length;
      return g.filter(x => x !== (n(B) >= n(A) ? B : A));
    }).filter(g => g.length >= 2);
  };
  const hair = ['hair/bob', 'hair/curls', 'hair/mop'];
  const fileDecisions = (actions, at) => {
    const out = [];
    for (const [cond, allowed] of actions) for (const t of hair) {
      if (allowed.indexOf(t) < 0) out.push({ a: cond, b: t, ok: false, src: 'file', at });
      else if (RULES.some(g => g.indexOf(cond) >= 0 && g.indexOf(t) >= 0))
        out.push({ a: cond, b: t, ok: true, src: 'file', at });
    }
    return out;
  };
  let D = [];
  /* v1: the cap allows only bob. */
  D = merge(D, fileDecisions([['hats/cap', ['hair/bob']]], 100));
  for (const d of D) apply(d.a, d.b, d.ok);
  const v1 = RULES.map(g => g.join('|')).sort().join('  ');
  if (v1.indexOf('hair/curls|hats/cap') < 0 || v1.indexOf('hair/mop|hats/cap') < 0)
    throw new Error('v1 did not forbid what it said: ' + v1);
  /* A person answers, in the sheet, after looking at it. */
  D = merge(D, [{ a: 'hats/cap', b: 'hair/mop', ok: true, src: 'you', at: 200 }]);
  RULES = []; for (const d of D) apply(d.a, d.b, d.ok);
  if (RULES.some(g => g.indexOf('hair/mop') >= 0 && g.indexOf('hats/cap') >= 0))
    throw new Error('the answer did not take');
  /* v2, tighter: the cap now allows curls too, and a beret hides hair. */
  D = merge(D, fileDecisions([['hats/cap', ['hair/bob', 'hair/curls']], ['hats/beret', []]], 300));
  RULES = []; for (const d of D) apply(d.a, d.b, d.ok);
  const after = RULES.map(g => g.join('|')).sort();
  /* The stale rule is gone, because v2 said it allows curls. */
  if (after.some(g => g.indexOf('hats/cap') >= 0 && g.indexOf('hair/curls') >= 0))
    throw new Error('the stale rule from v1 survived: ' + after.join('  '));
  /* The person's answer survived a regenerated file. */
  if (after.some(g => g.indexOf('hats/cap') >= 0 && g.indexOf('hair/mop') >= 0))
    throw new Error('a regenerated file reverted the person\'s answer');
  /* And what v2 newly forbids is in force. */
  for (const h of hair)
    if (!after.some(g => g.indexOf('hats/beret') >= 0 && g.indexOf(h) >= 0))
      throw new Error('v2 did not forbid ' + h + ' with the beret');
  /* The records agree: nothing DECISIONS calls allowed is forbidden by RULES. */
  for (const d of D) {
    const held = RULES.some(g => g.indexOf(d.a) >= 0 && g.indexOf(d.b) >= 0);
    if (d.ok && held) throw new Error('the two records contradict on ' + d.a + '+' + d.b);
    if (!d.ok && !held) throw new Error('a forbidden pair is not forbidden: ' + d.a + '+' + d.b);
  }
  console.log('    v1 -> cap excludes curls and mop');
  console.log('    your answer -> cap excludes curls only');
  console.log('    v2 -> ' + after.join('  ') + '   (cap excludes nothing)');
  console.log('    and every decision agrees with every rule');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
