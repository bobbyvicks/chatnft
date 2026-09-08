/* THE ADOPTION RULE WAS INLINE, SO A TEST COULD ONLY RE-TYPE IT.

   Deciding whether to take the group's empty chance sat as a block inside
   wsSwitch, reachable only by driving a whole workspace switch. The tests I
   wrote for it therefore copied the four lines into themselves and asserted
   against the copy - which proves the copy works and says nothing about the
   app. tests/helpers.js opens with that exact warning, in those words.

   Named, so the test can call the thing that runs. Nothing about the decision
   changes: the group's value wins, a column nobody has written is not an
   answer, and anything the control could not have produced is refused. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

swap(block([
  '  /* THE SAME RULE THE RULES FOLLOW: what the group has wins, but a column',
  '     nobody has written is not an answer. A project that predates this reads',
  '     the default, and taking that would quietly undo a choice made here - so',
  "     the server's value is adopted only when it is not the default, and a",
  '     local value that is not the default is sent instead. */',
  '  {',
  '    const theirs=Number(c.empty_chance);',
  '    const ok=isFinite(theirs)&&theirs>=0&&theirs<=0.9;',
  '    if(ok && theirs!==EMPTY_DEFAULT){',
  '      emptyChance=theirs;',
  '      const box=$("cempty"); if(box) box.value=String(Math.round(emptyChance*100));',
  '      await saveEmptyChance();',
  '    } else if(emptyChance!==EMPTY_DEFAULT){',
  '      /* Nothing up there and something here: send it rather than lose it.',
  "         shareRules is what carries it, and its signature has changed. */",
  '      sharedRuleSig=null;',
  '      shareRules();',
  '    }',
  '  }',
]), '  await takeEmptyChance(c);');

swap(block([
  'async function saveEmptyChance(){',
  '  await dbPut({id:EMPTY_ID, kind:"settings", chance:emptyChance, at:Date.now()});',
  '}',
]), block([
  'async function saveEmptyChance(){',
  '  await dbPut({id:EMPTY_ID, kind:"settings", chance:emptyChance, at:Date.now()});',
  '}',
  '',
  '/* Whether to take the group\'s empty chance, or to send this one instead.',
  '',
  '   THE SAME RULE THE RULES FOLLOW, three lines below where they follow it:',
  '   what the group has wins, because the collection is the shared thing - but',
  '   a column nobody has written is not an answer. A project that predates the',
  '   column reads the default, and adopting that would quietly undo a choice',
  '   made here. So the server\'s value is taken only when it is not the',
  '   default, and a local value that is not the default is sent instead.',
  '',
  '   Clamped, like every other way in. A column check exists too, and a client',
  '   that trusts a column check is trusting a schema it did not read today.',
  '',
  '   NAMED RATHER THAN INLINE so that a test can call the decision instead of',
  '   re-typing it - which is what the first draft of its tests did, and what',
  '   tests/helpers.js opens by warning against. */',
  'async function takeEmptyChance(c){',
  '  const theirs=Number(c&&c.empty_chance);',
  '  const ok=isFinite(theirs)&&theirs>=0&&theirs<=0.9;',
  '  if(ok && theirs!==EMPTY_DEFAULT){',
  '    emptyChance=theirs;',
  '    const box=$("cempty"); if(box) box.value=String(Math.round(emptyChance*100));',
  '    await saveEmptyChance();',
  '    return "took";',
  '  }',
  '  if(emptyChance!==EMPTY_DEFAULT){',
  '    /* Nothing up there and something here: send it rather than lose it.',
  '       shareRules is what carries it, and its signature has changed. */',
  '    sharedRuleSig=null;',
  '    shareRules();',
  '    return "sent";',
  '  }',
  '  return "nothing";',
  '}',
]));

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function takeEmptyChance(c){', '  await takeEmptyChance(c);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE copy of the rule. The whole point of naming it was that the inline one
   goes away rather than gaining a sibling. */
const rules = (code.match(/theirs!==EMPTY_DEFAULT/g) || []).length;
if (rules !== 1) throw new Error('expected one copy of the adoption rule, found ' + rules);

/* And it still reports what it did, so a caller and a test can tell "took"
   from "sent" without inspecting a global afterwards. */
for (const s of ['    return "took";', '    return "sent";', '  return "nothing";'])
  if (code.indexOf(s) < 0) throw new Error('the outcome is not reported: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
