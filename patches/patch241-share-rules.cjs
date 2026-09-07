/* Rules reach the group now, and a yes/no answer is a record of its own.

   Asked for: "implement basically this entire page to pixelbench so my team
   can help me say yes/no to certain traits". The team half needs the answers
   to travel, and they did not: cloudPush uploads only kind trait and ref, so
   settings.rules never left the browser that wrote it. A column was added to
   collections with the user's approval - rules, decisions and decide_order,
   all jsonb defaulting to '[]', additive, nothing existing touched. The RLS
   policy on that table is one ALL-command rule keyed on is_team_member, so
   every teammate can already read and write them.

   WHY DECISIONS ARE A SEPARATE RECORD FROM RULES, which is the whole design.

   A rule is what the generator obeys. A decision is what a person answered.
   They are not the same thing in one direction: answering YES to a pair
   produces NO rule at all, so the rule list cannot tell "somebody looked at
   this and allowed it" from "nobody has looked yet". A review page needs that
   difference to show coverage and to stop re-asking.

   AND THEY MERGE DIFFERENTLY, which matters far more. Rules are a set that
   only makes sense whole, so a pull that adopted the server's copy would
   discard whatever the person had answered since their last push. Two people
   reviewing different traits at the same time would take turns destroying
   each other's afternoon, silently, with a green sync message. Decisions are
   per PAIR, so they merge per pair: newest answer for each pair wins, and
   nobody loses an answer they gave to a pair the other person never opened.

   THE RECONCILIATION, in order:
     1. merge the two decision lists per pair, newest by `at`
     2. take the server's rules as the base
     3. apply every merged decision to them
   A hand-made rule that no decision mentions survives, because nothing in
   step 3 touches it. A hand-made rule a decision contradicts loses, which is
   correct: somebody answered that pair more recently than the rule was made.

   AND AN EMPTY SERVER IS NOT AN ANSWER. Anyone whose rules predate this column
   has 103 of them locally and nothing on the server. Adopting an empty list
   would delete the lot. So an empty server side takes the local copy up
   instead of overwriting it.

   WHAT THIS DOES NOT DO: it is last-writer-wins per pair, not a conversation.
   Two people answering the SAME pair differently within one sync leaves the
   later answer, and neither is told the other disagreed.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('DECISIONS') >= 0) throw new Error('already patched');
if (doc.original.indexOf('let DECIDE_ORDER=[];') < 0)
  throw new Error('the decide order has to exist first');

/* ---- 1. the decision record ---- */
{
  const at = kit.only(doc.lines, l => l === "const DECIDE_ID='settings.decideorder';", 'the decide id');
  kit.replace(doc.lines, { start: at, end: at }, [
    "const DECIDE_ID='settings.decideorder';",
    '/* EVERY PAIR SOMEBODY HAS ANSWERED, and when.',
    '',
    '   Separate from RULES because a YES produces no rule, so the rule list',
    '   cannot tell an allowed pair from one nobody has looked at - and a review',
    '   needs that difference to show what is left to do.',
    '',
    '   Per pair, so two people reviewing at once merge instead of overwriting:',
    '   the newest answer to each pair wins and no answer is lost to a pair the',
    '   other person never opened. A whole-list adopt would have made a teammate',
    '   pressing Load lose everything they had answered since their last push. */',
    'let DECISIONS=[];',
    "const DECISIONS_ID='settings.decisions';",
    '/* Sorted, so the same pair answered from either side is one entry. */',
    'function pairOf(a,b){ return a<b ? [a,b] : [b,a]; }',
    'function pairId(a,b){ const p=pairOf(a,b); return p[0]+"\\u0000"+p[1]; }',
  ]);
  console.log('ok  a decision is a record of its own');
}

/* ---- 2. merging, and turning an answer into a rule ---- */
{
  const at = kit.only(doc.lines, l => l === 'async function saveRules(){', 'saveRules');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* Newest answer per pair. Order-independent, so it does not matter which',
    '   side is called "mine" - which is what makes it safe to run on a pull and',
    '   on a push with the same result. */',
    'function mergeDecisions(a,b){',
    '  const by=new Map();',
    '  for(const d of (a||[]).concat(b||[])){',
    '    if(!d||!d.a||!d.b) continue;',
    '    const k=pairId(d.a,d.b), prev=by.get(k);',
    '    if(!prev||(d.at||0)>=(prev.at||0)) by.set(k,{a:pairOf(d.a,d.b)[0],b:pairOf(d.a,d.b)[1],',
    '      ok:!!d.ok, at:d.at||0, by:d.by||null});',
    '  }',
    '  return [...by.values()];',
    '}',
    '/* Make the rules agree with one answer.',
    '',
    '   NO: the two must not share a character, so they need a group holding',
    '   both. If one already does, nothing to do - widening it would be a second',
    '   rule saying the same thing.',
    '',
    '   YES: they must not share a group. WHICH member leaves matters. A group',
    '   the import builds is one condition trait plus every trait it forbids on',
    '   ONE other layer, so removing the member whose layer is crowded changes',
    '   exactly this pair - the others were already unable to co-occur, being on',
    '   one layer. Removing the lone member instead would dissolve the whole',
    '   rule and allow every pair in it.',
    '',
    '   A group spanning three layers has no such lone member, and there taking',
    '   one out does allow its other pairings too. Nothing the import makes has',
    '   that shape; a hand-made one can, and this is the honest limit of doing it',
    '   in one operation rather than splitting the group. */',
    'function applyDecision(a,b,ok){',
    '  const A=pairOf(a,b)[0], B=pairOf(a,b)[1];',
    '  const holds=g=>g.indexOf(A)>=0&&g.indexOf(B)>=0;',
    '  if(!ok){',
    '    if(RULES.some(holds)) return false;',
    '    RULES=RULES.concat([ruleGroup([A,B])]);',
    '    return true;',
    '  }',
    '  let moved=false;',
    '  RULES=RULES.map(g=>{',
    '    if(!holds(g)) return g;',
    '    moved=true;',
    '    const layerOf=k=>k.slice(0,k.indexOf("/"));',
    '    const n=k=>g.filter(x=>layerOf(x)===layerOf(k)).length;',
    '    const drop = n(B)>=n(A) ? B : A;',
    '    return g.filter(x=>x!==drop);',
    '  }).filter(g=>g.length>=2);',
    '  return moved;',
    '}',
    '/* One answer, recorded and applied. */',
    'async function decidePair(a,b,ok){',
    '  DECISIONS=mergeDecisions(DECISIONS,[{a:a,b:b,ok:!!ok,at:Date.now()}]);',
    '  applyDecision(a,b,ok);',
    '  await saveRules();',
    '}',
    'async function saveRules(){',
  ]);
  console.log('ok  answers merge per pair, and turn into rules');
}

/* ---- 3. saved together, and sent to the group ---- */
{
  const r = kit.run(doc.lines,
    l => l === 'async function saveRules(){',
    l => l === '}',
    'saveRules body',
    kit.inFunction(doc.lines, 'async function saveRules(){'));
  const body = doc.lines.slice(r.start, r.end + 1);
  if (body.join('\n').indexOf('id:RULES_ID') < 0)
    throw new Error('saveRules is not the shape this expects');
  /* The dbPut stays exactly as it is; the decisions record and the share are
     added after it. */
  kit.replace(doc.lines, r, body.slice(0, body.length - 1).concat([
    '  await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(),',
    '    decisions:DECISIONS.map(d=>({a:d.a,b:d.b,ok:d.ok,at:d.at,by:d.by||null}))});',
    '  /* AND THE GROUP. Same shape as saveLayers: sent when it changed, and the',
    '     signature is remembered only when the send actually arrived, so a failed',
    '     one is retried by the next change rather than assumed done. */',
    '  return await shareRules();',
    '}',
    '/* Rules, the order they are decided in, and the answers behind them - one',
    '   PATCH, because a reader that got the rules without the decisions could not',
    '   tell which pairs had been reviewed. */',
    'let sharedRuleSig=null;',
    'async function shareRules(){',
    '  if(!activeWs){ sharedRuleSig=null; return false; }',
    '  const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS]);',
    '  if(sig===sharedRuleSig) return true;',
    '  let shared=false;',
    '  try{',
    '    const u=await sbUser();',
    '    const c=u?await cloudCollection(u):null;',
    '    const h=c?await sbHeaders({"Content-Type":"application/json"}):null;',
    '    if(c&&h){',
    '      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",',
    '        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,',
    '          decisions:DECISIONS})});',
    '      shared=r.ok;',
    '    }',
    '  }catch(_){ shared=false; }',
    '  sharedRuleSig = shared ? sig : null;',
    '  return shared;',
    '}',
  ]));
  console.log('ok  and are sent to the group when they change');
}

/* ---- 4. loaded with everything else ---- */
{
  const at = kit.only(doc.lines, l => l === '  applyDecideOrder(items);', 'the decide order load');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  applyDecideOrder(items);',
    '  applyDecisions(items);',
  ]);
  const df = kit.only(doc.lines, l => l === 'function applyDecideOrder(items){', 'applyDecideOrder');
  kit.replace(doc.lines, { start: df, end: df }, [
    'function applyDecisions(items){',
    '  const rec=items.find(i=>i.id===DECISIONS_ID);',
    '  DECISIONS = (rec&&Array.isArray(rec.decisions)) ? mergeDecisions(rec.decisions,[]) : [];',
    '}',
    'function applyDecideOrder(items){',
  ]);
  console.log('ok  and loaded before anything reads them');
}

/* ---- 5. the collection carries them ---- */
{
  const at = kit.only(doc.lines,
    l => l.indexOf('collections?select=id,layers&team_id=eq.') >= 0, 'the collection select');
  doc.lines[at] = doc.lines[at].replace('select=id,layers&', 'select=id,layers,rules,decisions,decide_order&');
  console.log('ok  the collection is read with them');
}

/* ---- 6. and a pull merges rather than overwrites ---- */
{
  /* Scoped: importProject adopts layers with the identical line, and patchkit
     refused the ambiguous anchor rather than taking the first. This belongs to
     the PULL - a pull is where somebody else's answers arrive. */
  const at = kit.only(doc.lines, l => l === '    if(newLayers) await saveLayers();', 'the layer adopt',
    kit.inFunction(doc.lines, 'async function cloudPull(opts){'));
  kit.replace(doc.lines, { start: at, end: at }, [
    '    if(newLayers) await saveLayers();',
    '  }',
    '  /* THE RULES AND THE ANSWERS BEHIND THEM.',
    '',
    '     Merged per pair, not adopted whole: a teammate pressing Load in the',
    '     middle of a review must not lose the answers they have given since',
    '     their last push, and a whole-list adopt would take all of them.',
    '',
    '     An EMPTY server side is not an answer. Anyone whose rules predate the',
    '     column has them locally and nothing up there, and adopting [] would',
    '     delete the lot - so an empty server takes the local copy instead. */',
    '  let pulledRules=0;',
    '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
    '    const theirs=Array.isArray(c.rules)?c.rules.filter(g=>Array.isArray(g)).map(ruleGroup).filter(g=>g.length>=2):[];',
    '    const merged=mergeDecisions(DECISIONS,Array.isArray(c.decisions)?c.decisions:[]);',
    '    if(theirs.length||merged.length){',
    '      if(theirs.length) RULES=theirs;',
    '      DECISIONS=merged;',
    '      /* Every answer applied to the base, so one that contradicts a rule',
    '         somebody made by hand wins - it was given later. */',
    '      for(const d of DECISIONS) applyDecision(d.a,d.b,d.ok);',
    '      if(Array.isArray(c.decide_order)&&c.decide_order.length)',
    '        DECIDE_ORDER=c.decide_order.map(String).filter(Boolean);',
    '      pulledRules=RULES.length;',
    '      await saveRules();',
    '    } else if(RULES.length){',
    '      /* Nothing up there and something here: send it rather than lose it. */',
    '      await saveRules();',
    '    }',
  ]);
  console.log('ok  and a pull merges the answers instead of taking them');
}

/* ---- 7. and the panel stops saying they are not sent ---- */
{
  const r = kit.run(doc.lines,
    l => l === '  if(activeWs)',
    l => l === '    bits.push("They live in this browser only, so keep the file you imported them from");',
    'the sharing half of the rules note');
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('Save to cloud does not send them') < 0)
    throw new Error('the note is not the one that says they are not sent');
  kit.replace(doc.lines, r, [
    '  /* This used to say "Save to cloud does not send them", which was true and',
    '     is not any more. A note that describes an old behaviour confidently is',
    '     worse than no note, so it is replaced rather than left beside the fix.',
    '',
    '     Read from sharedRuleSig, which is set only when a PATCH actually',
    '     arrived - so "shared" means shared, and a send that failed says so and',
    '     is retried by the next answer. */',
    '  if(activeWs)',
    '    bits.push(sharedRuleSig',
    '      ? "These "+RULES.length+" rules are shared with "+where+", so everyone in it generates the same collection"',
    '      : "These "+RULES.length+" rules have not reached "+where+" yet - the next answer or rule change sends them again");',
    '  else',
    '    bits.push("They live in this browser only, so keep the file you imported them from");',
  ]);
  console.log('ok  and the note stops saying they are not sent');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const md = kit.inFunction(codeLines, 'function mergeDecisions(a,b){');
  const m = codeLines.slice(md.start, md.end + 1).join('\n');
  if (m.indexOf('(d.at||0)>=(prev.at||0)') < 0)
    throw new Error('decisions do not merge by when they were given');

  const ad = kit.inFunction(codeLines, 'function applyDecision(a,b,ok){');
  const a = codeLines.slice(ad.start, ad.end + 1).join('\n');
  if (a.indexOf('const drop = n(B)>=n(A) ? B : A;') < 0)
    throw new Error('a yes would dissolve the whole rule rather than the pair');
  if (a.indexOf('if(RULES.some(holds)) return false;') < 0)
    throw new Error('a no would add a second rule saying the same thing');
  if (a.indexOf('.filter(g=>g.length>=2)') < 0)
    throw new Error('a group of one member would be left behind');

  if (code.indexOf('async function shareRules(){') < 0) throw new Error('nothing sends them');
  const sh = kit.inFunction(codeLines, 'async function shareRules(){');
  const s = codeLines.slice(sh.start, sh.end + 1).join('\n');
  if (s.indexOf('if(!activeWs){ sharedRuleSig=null; return false; }') < 0)
    throw new Error('it would try to share on your own page');
  if (s.indexOf('sharedRuleSig = shared ? sig : null;') < 0)
    throw new Error('a failed send would be remembered as done');
  for (const f of ['rules:RULES', 'decide_order:DECIDE_ORDER', 'decisions:DECISIONS'])
    if (s.indexOf(f) < 0) throw new Error('the PATCH does not carry ' + f);

  /* The collection must be read with the new columns or the merge sees nothing. */
  if (code.indexOf('select=id,layers,rules,decisions,decide_order&') < 0)
    throw new Error('the collection is still read without the rules');
  /* An empty server must not wipe a local set. */
  if (code.indexOf('} else if(RULES.length){') < 0)
    throw new Error('an empty server side would delete local rules');
  /* The note must no longer claim they stay here - that sentence is now false,
     and a confident false sentence is worse than none. */
  const rs = kit.inFunction(codeLines, 'function ruleState(){');
  const n = codeLines.slice(rs.start, rs.end + 1).join('\n');
  if (n.indexOf('Save to cloud does not send them') >= 0)
    throw new Error('the note still says the rules are not sent');
  if (n.indexOf('sharedRuleSig') < 0)
    throw new Error('the note claims they are shared without checking that one arrived');

  /* saveRules still writes the local record - the server is a copy, not the store. */
  const sr = kit.inFunction(codeLines, 'async function saveRules(){');
  const r = codeLines.slice(sr.start, sr.end + 1).join('\n');
  if (r.indexOf('id:RULES_ID') < 0 || r.indexOf('id:DECISIONS_ID') < 0)
    throw new Error('saveRules stopped writing locally');
});

/* RUN the merge and the two directions of an answer. */
{
  const pairOf = (a, b) => a < b ? [a, b] : [b, a];
  const pairId = (a, b) => pairOf(a, b).join(' ');
  const merge = (x, y) => {
    const by = new Map();
    for (const d of x.concat(y)) {
      const k = pairId(d.a, d.b), prev = by.get(k);
      if (!prev || (d.at || 0) >= (prev.at || 0)) by.set(k, d);
    }
    return [...by.values()];
  };
  /* Two people, different pairs: both answers survive. */
  const mine = [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 10 }];
  const theirs = [{ a: 'hats/cap', b: 'hair/mop', ok: false, at: 11 }];
  if (merge(mine, theirs).length !== 2) throw new Error('an answer was lost merging two reviewers');
  /* Same pair, newest wins, whichever side it came from. */
  const older = [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 10 }];
  const newer = [{ a: 'hair/bob', b: 'hats/cap', ok: true, at: 20 }];
  const both = merge(older, newer);
  if (both.length !== 1) throw new Error('the same pair from two sides made two entries');
  if (both[0].ok !== true) throw new Error('the older answer won');
  if (merge(newer, older)[0].ok !== true) throw new Error('the merge depends on which side is first');

  /* And an answer applied to the rules. */
  let RULES = [['hats/apehead', 'hair/a', 'hair/b', 'hair/c']];
  const ruleGroup = l => [...new Set(l)].sort();
  const apply = (a, b, ok) => {
    const A = pairOf(a, b)[0], B = pairOf(a, b)[1];
    const holds = g => g.indexOf(A) >= 0 && g.indexOf(B) >= 0;
    if (!ok) { if (RULES.some(holds)) return; RULES = RULES.concat([ruleGroup([A, B])]); return; }
    RULES = RULES.map(g => {
      if (!holds(g)) return g;
      const layerOf = k => k.slice(0, k.indexOf('/'));
      const n = k => g.filter(x => layerOf(x) === layerOf(k)).length;
      const drop = n(B) >= n(A) ? B : A;
      return g.filter(x => x !== drop);
    }).filter(g => g.length >= 2);
  };
  /* YES to one hair takes THAT hair out and leaves the rule standing. */
  apply('hats/apehead', 'hair/b', true);
  if (RULES.length !== 1) throw new Error('the rule was dissolved by allowing one pair');
  if (RULES[0].indexOf('hair/b') >= 0) throw new Error('the pair is still forbidden');
  if (RULES[0].indexOf('hats/apehead') < 0) throw new Error('the condition trait was removed instead');
  if (RULES[0].length !== 3) throw new Error('more than one member left: ' + RULES[0].join());
  /* NO to a fresh pair makes exactly one group, and again makes none. */
  apply('hats/cap', 'glasses/x', false);
  if (RULES.length !== 2) throw new Error('a no did not make a rule');
  apply('hats/cap', 'glasses/x', false);
  if (RULES.length !== 2) throw new Error('the same no made a second rule');
  /* YES on a two-member group removes the group. */
  apply('hats/cap', 'glasses/x', true);
  if (RULES.length !== 1) throw new Error('a two-member group survived being allowed');
  console.log('    two reviewers merge to ' + merge(mine, theirs).length + ' answers, newest wins per pair');
  console.log('    and allowing one hair leaves ' + RULES[0].length + ' members of the ape head rule standing');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
