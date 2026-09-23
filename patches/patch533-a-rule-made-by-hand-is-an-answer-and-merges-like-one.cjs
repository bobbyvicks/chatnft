/* A RULE MADE BY HAND IS AN ANSWER, AND MERGES LIKE ONE.

   Found 2026-09-22 by the discovery pass, ranked third of 39, reproduced
   by two routes. Answers (DECISIONS) merge pair by pair; the rule list does
   not. A pull replaces RULES with the server's list and then replays every
   answer over it, so a rule survives a pull only if an answer stands behind
   it. Rules from review answers have one, and so do rules from a rules file
   (planRuleImport records a file answer for every pair it forbids). Rules
   made with Add, widened with a row's picker, or taken away with a row's
   remove button had none. So:

   (a) add a rule while the send fails, open the project again, and the
       rule is gone - replaced by the server's list, and that list pushed
       back with a fresh stamp;
   (b) a teammate whose copy predates your rule answers any pair, and their
       send writes their whole list of answers over the server's - yours
       with it - and everybody's next load adopts the loss.

   Measured on both routes by a finder and a verifier: the rule absent on
   both devices and the server, 0 messages.

   Two changes. The three hand controls now record what they mean as
   answers, the way a review does: Add is a No on that pair; widening a
   rule is a No between the new member and each member on another layer;
   remove is a Yes on every pair of the rule that spans two layers. A
   person's answer outranks a file's in mergeDecisions, so a later file
   cannot quietly put back a rule somebody took away. And the send reads
   the server's answers first and merges them in before it writes, so a
   send can no longer overwrite answers it has never seen; merged answers
   are applied to the rules here and kept here too. A read that fails sends
   nothing, as a failed send already did - the next change retries.

   applyDecision's Yes also drops a rule left holding only traits on one
   layer: one layer draws one trait, so such a rule forbids nothing, and a
   remove replayed on another device would otherwise leave that remnant in
   the list. Rules made before this change by hand have no answers behind
   them; the first time anyone touches one through these controls it gets
   them. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const expect = (i, want, label) => { for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error(label + ' moved at +' + k + ': ' + L[i + k]); };

/* ---- 1. the helper that turns a hand change into answers --------------- */
{
  const fn = kit.inFunction(L, 'function applyDecision(a,b,ok){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* A HAND CHANGE TO THE RULES, AS ANSWERS. Every pair of traits on two',
    '   different layers, answered ok (allowed) or not. Pairs on one layer need',
    '   no answer - one layer draws one trait. Recorded as a person\'s answers,',
    '   so they merge pair by pair with everybody else\'s and outrank a file\'s. */',
    'function answerPairs(pairs,ok){',
    '  const layerOf=k=>String(k).slice(0,String(k).indexOf("/"));',
    '  const now=Date.now(), add=[];',
    '  for(const [a,b] of pairs) if(a&&b&&a!==b&&layerOf(a)!==layerOf(b))',
    '    add.push({a:a,b:b,ok:!!ok,at:now,src:"you"});',
    '  if(add.length) DECISIONS=mergeDecisions(DECISIONS,add);',
    '  return add.length;',
    '}',
    'function pairsIn(g){',
    '  const out=[];',
    '  for(let i=0;i<g.length;i++) for(let j=i+1;j<g.length;j++) out.push([g[i],g[j]]);',
    '  return out;',
    '}',
    'function applyDecision(a,b,ok){',
  ]);
}
{
  const fn = kit.inFunction(L, 'function applyDecision(a,b,ok){');
  const i = at('    return g.filter(x=>x!==drop);', 'the yes drop', fn);
  expect(i, ['    return g.filter(x=>x!==drop);', '  }).filter(g=>g.length>=2);'], 'the yes drop');
  kit.replace(L, { start: i, end: i }, [
    '    const left=g.filter(x=>x!==drop);',
    '    /* A rule left holding one layer forbids nothing - one layer draws one',
    '       trait - and a remove replayed on another device would leave exactly',
    '       that remnant in the list. */',
    '    return new Set(left.map(layerOf)).size>=2 ? left : [];',
  ]);
}

/* ---- 2. Add, widen and remove record what they mean ------------------- */
swap('  RULES.push(p);', [
  '  RULES.push(p);',
  '  /* AND AS AN ANSWER, or the next pull replaces the rule list and nothing',
  '     rebuilds this one (measured: gone from both devices and the server). */',
  '  answerPairs([[a,b]],false);',
], 'the add button');
{
  const i = at('      RULES=RULES.map(q=>ruleId(q)===gid?wider:q);', 'the widen');
  kit.replace(L, { start: i, end: i }, [
    '      RULES=RULES.map(q=>ruleId(q)===gid?wider:q);',
    '      /* The new member against each one already there, as answers. */',
    '      answerPairs(g.map(m=>[m,v]),false);',
  ]);
}
{
  const i = at('      RULES=RULES.filter(q=>ruleId(q)!==gid);', 'the remove');
  kit.replace(L, { start: i, end: i }, [
    '      /* Taken away as answers too - every pair it forbade across two',
    '         layers is now allowed - or the next pull puts it back. */',
    '      answerPairs(pairsIn(g),true);',
    '      RULES=RULES.filter(q=>ruleId(q)!==gid);',
  ]);
}

/* ---- 3. the send reads and merges before it writes -------------------- */
{
  const fn = kit.inFunction(L, 'async function saveRules(){');
  const a = at('  await dbPut({id:RULES_ID, kind:"settings", at:Date.now(),', 'the local write', fn);
  const b = at('  return await shareRules();', 'the share call', fn);
  const block = L.slice(a, b);
  const end = block.findIndex(l => l.indexOf('decisions:DECISIONS.map(') >= 0);
  if (end < 0) throw new Error('the decisions write is not where expected');
  const writes = block.slice(0, end + 1);
  kit.replace(L, { start: a, end: a + end }, ['  await saveRulesHere();']);
  const f2 = kit.inFunction(L, 'async function saveRules(){');
  kit.replace(L, { start: f2.start, end: f2.start }, [
    '/* The rules and the answers, written to this browser\'s store. Lifted out of',
    '   saveRules so a send that merges the server\'s answers in can keep them. */',
    'async function saveRulesHere(){',
    ...writes,
    '}',
    'async function saveRules(){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function shareRules(){');
  const i = at('    if(c&&h){', 'the send', fn);
  expect(i + 1, ['      const r=await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",'], 'the patch');
  kit.replace(L, { start: i, end: i }, [
    '    if(c&&h){',
    '      /* READ, MERGE, THEN WRITE. The PATCH below writes the whole list of',
    '         answers, and it used to write it blind: a teammate whose copy',
    '         predated your answer sent theirs over yours, and everybody\'s next',
    '         load adopted the loss. The server\'s answers are merged in first',
    '         and applied here, so a send carries every answer it could see. A',
    '         read that fails sends nothing - the next change retries. */',
    '      const g=await fetch(SB_URL+"/rest/v1/collections?select=decisions&id=eq."+c.id,{headers:h});',
    '      if(!g.ok) throw new Error("read");',
    '      const got=await g.json();',
    '      const theirs=(Array.isArray(got)&&got[0]&&Array.isArray(got[0].decisions))?got[0].decisions:[];',
    '      const before=JSON.stringify(DECISIONS);',
    '      const merged=mergeDecisions(DECISIONS,theirs);',
    '      if(JSON.stringify(merged)!==before){',
    '        DECISIONS=merged;',
    '        for(const d of DECISIONS) applyDecision(d.a,d.b,d.ok);',
    '        await saveRulesHere();',
    '      }',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function shareRules(){');
  swap('  sharedRuleSig = shared ? sig : null;', [
    '  /* Taken again after the merge: what was sent is what is remembered. */',
    '  sharedRuleSig = shared ? JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]) : null;',
  ], 'the sig', fn);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('function answerPairs(pairs,ok){');
  once('answerPairs(', 4);
  once('async function saveRulesHere(){');
  once('await saveRulesHere();', 2);
  once('collections?select=decisions&id=eq.');
  once('return new Set(left.map(layerOf)).size>=2 ? left : [];');
  /* saveRules still stamps, writes here, then shares - in that order. */
  const s = code.indexOf('async function saveRules(){'), se = code.indexOf('\n}', s);
  const body = code.slice(s, se);
  const st = body.indexOf('rulesAt=Date.now();'), w = body.indexOf('await saveRulesHere();'), sh = body.indexOf('return await shareRules();');
  if (!(st >= 0 && w > st && sh > w)) throw new Error('saveRules lost its order');
  /* The read comes before the PATCH. */
  const r = code.indexOf('async function shareRules(){'), re = code.indexOf('\n}', r);
  const sb = code.slice(r, re);
  if (!(sb.indexOf('select=decisions') >= 0 && sb.indexOf('select=decisions') < sb.indexOf('method:"PATCH"'))) throw new Error('the read is not before the write');
});

fs.renameSync(TMP, FILE);
console.log('patch533 written, ' + grew + ' bytes');
