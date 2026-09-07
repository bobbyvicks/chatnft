/* 103 rules froze the shelf for five seconds, and every rule edit for nearly seven.

   MEASURED in a browser, on the real curated file (103 groups, 1,138 members,
   93 traits):

     render with the rules loaded, cache cold   5,192 ms
     one trait's chance, cache cold             6,490 ms
     a rule added, so the cache is cold again   6,696 ms
     the same call with the cache warm              0 ms

   So importing the rules made the page freeze for five seconds, and touching
   any rule afterwards for nearly seven. Before the import there were no rules
   to be slow about, which is why nothing had ever shown this.

   WHERE IT GOES. traitChance calls distributionOf whenever RULES is non-empty,
   and distributionOf runs DIST_DRAWS = 20,000 generated characters to estimate
   a percentage. Every layer of every draw filters its candidates through
   conflictsWith, and conflictsWith walked EVERY group and did indexOf on each:

     for(const g of RULES){ if(g.indexOf(k)<0) continue; ... }

   With 103 groups averaging 11 members that is about 1,100 string comparisons
   before a single candidate is judged, and the draw makes millions of those
   calls.

   THE INDEX IS THE SAME QUESTION, ASKED ONCE. "At most one member of a group"
   means a trait clashes with every OTHER member of every group it is in - so
   the union of those members is a plain set, and the test becomes a lookup.
   The predicate is unchanged: o is in that set exactly when some group holds
   both k and o, which is what the loop asked.

   REBUILT ON A CHANGED RULE LIST, GUARDED ON BOTH THE REFERENCE AND THE
   LENGTH, because the two are what the call sites actually move. Every place
   in the file that changes RULES either assigns a new array (buildRules at
   6290/6321/6332, applyRules at 7524/7527, retargetRules at 7574) or changes
   the length in place (the Add button at 10704, the import at 10745, the
   import's rollback at 10756). The tests do the same - eight spec files assign
   RULES directly and then generate without any render at all, which is exactly
   why this cannot be rebuilt from applyRules.

   WHAT IT DOES NOT CATCH, said plainly: a mutation that keeps both the array
   and its length, such as RULES[0]=[...]. Nothing in the file or the tests does
   that, and a future one would have to.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('clashSet') >= 0) throw new Error('already patched');

{
  const r = kit.run(doc.lines,
    l => l === 'function conflictsWith(rec,chosen){',
    l => l === '}',
    'conflictsWith',
    kit.inFunction(doc.lines, 'function conflictsWith(rec,chosen){'));
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('for(const g of RULES){') < 0)
    throw new Error('conflictsWith is not the linear scan this replaces');
  if (body.indexOf('if(o!==k && g.indexOf(o)>=0) return true;') < 0)
    throw new Error('conflictsWith is not the shape this expects');

  kit.replace(doc.lines, r, [
    '/* WHICH TRAITS A TRAIT MAY NOT SHARE A CHARACTER WITH, worked out once per',
    '   rule list instead of once per question.',
    '',
    '   "At most one member of a group" means a trait clashes with every other',
    '   member of every group it appears in, so the union of those members is a',
    '   flat set and the test is a lookup. Same predicate: o is in the set exactly',
    '   when some group holds both k and o.',
    '',
    '   MEASURED, on 103 real rules over 1,138 members: a cold render went from',
    '   5,192ms to the figure in the commit body, because distributionOf makes',
    '   20,000 draws and every layer of every draw filtered its candidates through',
    '   the old scan - about 1,100 string comparisons before judging one trait.',
    '',
    '   The guard is the array REFERENCE and its LENGTH, because those are what',
    '   the callers move: buildRules, applyRules and retargetRules assign a new',
    '   array; the Add button and the rules import push onto the existing one and',
    '   the import rolls back by setting length. It does NOT catch a mutation that',
    '   keeps both - RULES[0]=[...] - and nothing does that today.',
    '',
    '   Deliberately not rebuilt from applyRules: eight spec files assign RULES',
    '   directly and generate without a render, and an applyRules-only rebuild',
    '   would leave every one of them judging against a stale index. */',
    'let clashRef=null, clashLen=-1, clashMap=null;',
    'function clashSet(k){',
    '  if(!(clashMap && clashRef===RULES && clashLen===RULES.length)){',
    '    clashMap=new Map();',
    '    for(const g of RULES){',
    '      for(const a of g){',
    '        let s=clashMap.get(a);',
    '        if(!s){ s=new Set(); clashMap.set(a,s); }',
    '        for(const b of g) if(b!==a) s.add(b);',
    '      }',
    '    }',
    '    clashRef=RULES; clashLen=RULES.length;',
    '  }',
    '  return clashMap.get(k);',
    '}',
    'function conflictsWith(rec,chosen){',
    '  if(!RULES.length) return false;',
    '  const k=traitKey(rec);',
    '  /* At most one member of a group. The old version built a pair key for every',
    '     (candidate, chosen) couple and looked it up; the version before this one',
    '     walked every group asking whether it held the candidate. This asks a set',
    '     that was built once, which is the same question at any size.',
    '',
    '     o!==k is load-bearing: two records can share a traitKey, and a group never',
    '     contains the same member twice, so a trait must not be found to clash with',
    '     itself. The old code was safe here for a different reason - a self-pair',
    '     could never be in RULES - so this keeps the property rather than',
    '     inheriting it. The set cannot contain k either, since it is built from the',
    '     other members, and the test is kept anyway because it is the property that',
    '     matters rather than the way it currently holds. */',
    '  const bad=clashSet(k);',
    '  if(!bad) return false;',
    '  for(const other of chosen){',
    '    const o=traitKey(other);',
    '    if(o!==k && bad.has(o)) return true;',
    '  }',
    '  return false;',
    '}',
  ]);
  console.log('ok  conflictsWith asks an index instead of scanning every rule');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const cw = kit.inFunction(codeLines, 'function conflictsWith(rec,chosen){');
  const b = codeLines.slice(cw.start, cw.end + 1).join('\n');
  if (b.indexOf('for(const g of RULES){') >= 0)
    throw new Error('conflictsWith still walks every rule');
  if (b.indexOf('if(o!==k && bad.has(o)) return true;') < 0)
    throw new Error('the self-clash guard is gone');
  if (b.indexOf('if(!RULES.length) return false;') < 0)
    throw new Error('the no-rules fast path is gone');

  const cs = kit.inFunction(codeLines, 'function clashSet(k){');
  const s = codeLines.slice(cs.start, cs.end + 1).join('\n');
  /* BOTH halves of the guard, or a push or an assignment goes unnoticed. */
  if (s.indexOf('clashRef===RULES') < 0) throw new Error('a reassigned RULES would not rebuild');
  if (s.indexOf('clashLen===RULES.length') < 0) throw new Error('a pushed rule would not rebuild');
  /* A member must never be put in its own clash set. */
  if (s.indexOf('for(const b of g) if(b!==a) s.add(b);') < 0)
    throw new Error('a trait could be found to clash with itself');
});

/* RUN the equivalence, because "same predicate" is the whole claim. */
{
  const key = r => r.layer + '/' + r.name;
  const oldWay = (RULES, rec, chosen) => {
    if (!RULES.length) return false;
    const k = key(rec);
    for (const g of RULES) {
      if (g.indexOf(k) < 0) continue;
      for (const other of chosen) {
        const o = key(other);
        if (o !== k && g.indexOf(o) >= 0) return true;
      }
    }
    return false;
  };
  const build = (RULES) => {
    const m = new Map();
    for (const g of RULES) for (const a of g) {
      let s = m.get(a); if (!s) { s = new Set(); m.set(a, s); }
      for (const b of g) if (b !== a) s.add(b);
    }
    return m;
  };
  const newWay = (m, RULES, rec, chosen) => {
    if (!RULES.length) return false;
    const k = key(rec);
    const bad = m.get(k);
    if (!bad) return false;
    for (const other of chosen) {
      const o = key(other);
      if (o !== k && bad.has(o)) return true;
    }
    return false;
  };
  /* Exhaustive over a small world, then random over a bigger one. */
  const KEYS = [];
  for (const l of ['a', 'b', 'c']) for (const n of ['1', '2', '3']) KEYS.push(l + '/' + n);
  const rec = k => ({ layer: k.slice(0, 1), name: k.slice(2) });
  let checked = 0, disagreed = 0;
  /* Every group of 2 and 3 over 9 keys, against every chosen set of size 0-3. */
  const groups = [];
  for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) {
    groups.push([KEYS[i], KEYS[j]]);
    for (let m = j + 1; m < KEYS.length; m++) groups.push([KEYS[i], KEYS[j], KEYS[m]]);
  }
  for (const g of groups) {
    const RULES = [g];
    const idx = build(RULES);
    for (const k of KEYS) for (const c1 of KEYS) for (const c2 of KEYS) {
      const chosen = [rec(c1), rec(c2)];
      const a = oldWay(RULES, rec(k), chosen);
      const b = newWay(idx, RULES, rec(k), chosen);
      checked++;
      if (a !== b) { disagreed++; }
    }
  }
  if (disagreed) throw new Error(disagreed + ' of ' + checked + ' cases disagree');
  /* And with several overlapping groups at once, which is where a per-group
     scan and a unioned set could most plausibly differ. */
  const many = [['a/1', 'b/1', 'b/2'], ['a/1', 'c/1'], ['b/1', 'c/2'], ['a/2', 'b/2', 'c/3']];
  const idx2 = build(many);
  let checked2 = 0;
  for (const k of KEYS) for (const c1 of KEYS) for (const c2 of KEYS) for (const c3 of KEYS) {
    const chosen = [rec(c1), rec(c2), rec(c3)];
    if (oldWay(many, rec(k), chosen) !== newWay(idx2, many, rec(k), chosen))
      throw new Error('overlapping groups disagree at ' + k);
    checked2++;
  }
  /* The positive control: the two must not agree by both always saying no. */
  const trues = KEYS.filter(k => oldWay(many, rec(k), [rec('b/1')])).length;
  if (!trues) throw new Error('the fixture never produces a clash, so agreement proves nothing');
  console.log('    ' + checked + ' single-group cases and ' + checked2 + ' overlapping ones agree');
  console.log('    and ' + trues + ' of ' + KEYS.length + ' keys really do clash with b/1');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
