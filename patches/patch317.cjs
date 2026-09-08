/* A RENAME MOVED THE RULES AND LEFT THE ANSWERS BEHIND.

   tests/rulesfollow.spec.js exists because moving a trait used to stop
   enforcing every rule that named it. It fixed the rules. It did not fix the
   answers, and the answers ARE rules:

     applyDecision(a,b,false) -> RULES=RULES.concat([ruleGroup([A,B])])

   A "no" answer is not a note about a rule, it mints one on every load, and
   clearRules already says so in as many words. DECISIONS are keyed by exactly
   the same traitKey string as RULES - "layer/name" - and retargetRules rewrites
   RULES only. Nothing in the file has ever rewritten d.a or d.b: the ten writes
   to DECISIONS are init, clear, append, import, load and merge.

   So renaming a layer today does this, silently:

     rules        retargeted to the new keys, correct
     answers      still naming the old keys, unreachable
     next load    every "no" answer re-mints its OLD rule under a dead key
     every "yes"  simply lost - ok:true only REMOVES a rule and is stored
                  nowhere else, so the pair goes back to unanswered

   On the live collection that is 2,603 answers, and the v11 migration renames
   or empties four layers. This is the defect that would have quietly rebuilt a
   dead rule set in the middle of the final review pass.

   ONE CHOKEPOINT COVERS EVERY GESTURE. All five sites that move a trait -
   sortApply, the bulk layer move, saveTrait, the shelf rename and retagLayer -
   already funnel their {from,to} pairs through retargetRules. The answers are
   remapped with the same map, in the same call, saved by the same saveRules.

   AND IT RUNS BEFORE THE EARLY RETURNS, which is the part that is easy to get
   wrong. A pair can have an answer and no rule at all - every "yes" is exactly
   that - so returning early because no RULE changed would leave precisely the
   answers that have nothing else to protect them. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. no rules is not no work ---------------------------------------- */
swap(block([
  'async function retargetRules(pairs){',
  '  if(!RULES.length) return 0;',
  '  const map=new Map();',
]), block([
  'async function retargetRules(pairs){',
  '  /* No early return on an empty RULES. A pair can have an ANSWER and no',
  '     rule - every "yes" is exactly that - and those are the ones with',
  '     nothing else keeping them reachable. The loop below over an empty',
  '     RULES is a no-op, which is all the guard ever bought. */',
  '  const map=new Map();',
]));

/* ---- 2. the answers move with the rules -------------------------------- */
swap(block([
  '  if(!map.size) return 0;',
  '  let touched=0;',
  '  const next=[], seen=new Set();',
]), block([
  '  if(!map.size) return 0;',
  '  /* THE ANSWERS MOVE TOO, and they are not decoration: applyDecision mints',
  '     a rule from every "no" on load, so an answer left naming a dead key',
  '     rebuilds the rule this call just retargeted away. A "yes" is worse -',
  '     ok:true only REMOVES a rule and is recorded nowhere else, so a stranded',
  '     one is simply gone and the pair reads as never reviewed.',
  '',
  '     Same map, same call, same saveRules. Every gesture that moves a trait',
  '     already comes through here with its {from,to} pairs. */',
  '  let answers=0;',
  '  if(DECISIONS.length){',
  '    const moved=[];',
  '    for(const d of DECISIONS){',
  '      const a=map.get(d.a), b=map.get(d.b);',
  '      if(a===undefined&&b===undefined){ moved.push(d); continue; }',
  '      answers++;',
  '      const na=(a===undefined?d.a:a), nb=(b===undefined?d.b:b);',
  '      /* Both ends became the same trait. The pair no longer names two',
  '         things, so the answer has nothing left to be about - the same',
  '         reasoning by which a rule that collapses below two members stops',
  '         saying anything. */',
  '      if(na===nb) continue;',
  '      moved.push({a:na,b:nb,ok:d.ok,at:d.at,by:d.by,src:d.src});',
  '    }',
  '    /* Through mergeDecisions, because two answers can land on one pair once',
  '       their traits merge, and it already holds the policy for that. */',
  '    if(answers) DECISIONS=mergeDecisions(moved,[]);',
  '  }',
  '  let touched=0;',
  '  const next=[], seen=new Set();',
]));

/* ---- 3. saved when either moved ---------------------------------------- */
swap(block([
  '  if(!touched) return 0;',
  '  RULES=next;',
  '  await saveRules();',
  '  return touched;',
]), block([
  '  if(touched) RULES=next;',
  '  /* Either half is reason enough to write. Returning on !touched would drop',
  '     an answer remap that had just happened in memory. */',
  '  if(!touched&&!answers) return 0;',
  '  await saveRules();',
  '  return touched;',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const rStart = code.indexOf('async function retargetRules(pairs){');
const rEnd = code.indexOf('\r\nfunction exportRules', rStart) >= 0
  ? code.indexOf('\r\nfunction exportRules', rStart)
  : code.indexOf('\r\nasync function ', rStart + 10);
if (rStart < 0 || rEnd < 0) throw new Error('could not bound retargetRules');
const fn = code.slice(rStart, rEnd);

for (const s of ['  let answers=0;', '      if(na===nb) continue;',
  '    if(answers) DECISIONS=mergeDecisions(moved,[]);',
  '  if(!touched&&!answers) return 0;'])
  if (fn.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE ANSWERS ARE REMAPPED BEFORE ANY RULE WORK. A pair with an answer and no
   rule is the whole reason this exists, and putting it after the rules loop
   would still be behind the guard that skips when no rule moved. */
const ansAt = fn.indexOf('let answers=0;');
const rulesAt = fn.indexOf('let touched=0;');
if (ansAt < 0 || rulesAt < 0 || ansAt > rulesAt)
  throw new Error('the answers are remapped after the rules, behind the same guard');

/* AND THE EMPTY-RULES EARLY RETURN IS GONE, or a project with answers and no
   rules is untouched - which is every project mid-review. */
if (fn.indexOf('if(!RULES.length) return 0;') >= 0)
  throw new Error('an empty rule list still short-circuits the answer remap');

/* IT STILL WRITES. A remap that only happened in memory is lost on reload. */
if (fn.indexOf('await saveRules();') < 0)
  throw new Error('the remap is never saved');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
