/* THE EMPTY CHANCE REACHES THE GROUP.

   Making it a saved setting stopped it resetting on every reload, and left the
   half this note promised: cloudPush sends traits and refs only, and
   collections had no column for it, so two people on one project read
   different percentages for the same trait. On a shared mint that is two
   people planning against two different collections.

   collections.empty_chance exists now - real, not null, default 0.35, checked
   0..0.9, so it matches the client's own clamp and a bad value cannot be
   stored by either side. Verified from the live catalog after applying.

   IT RIDES WITH THE RULES, deliberately. shareRules already PATCHes this row
   whenever the rules, the answers or the draw order move, it already knows
   when there is a group and when there is not, and it already carries a
   signature so an unchanged project makes no request. A second sender for one
   more field would be a second set of those decisions to keep in step.

   COMING BACK, IT FOLLOWS THE RULES' OWN RULE: what the server has wins,
   because the collection is the shared thing - but a column that has never
   been written is not an answer. Anyone whose project predates this reads the
   default, and taking that would silently reset a choice they had made
   locally. So the server's value is adopted only when it differs from the
   default, and a local value that differs is pushed instead. That is the same
   shape as "an EMPTY server side is not an answer" three lines above it. */
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

/* ---- 1. asked for on the way in ------------------------------------- */
swap('  let r=await fetch(SB_URL+"/rest/v1/collections?select=id,layers,rules,decisions,decide_order&team_id=eq."+team+"&limit=1",{headers:h});',
  '  let r=await fetch(SB_URL+"/rest/v1/collections?select=id,layers,rules,decisions,decide_order,empty_chance&team_id=eq."+team+"&limit=1",{headers:h});');

/* ---- 2. sent with the rules ----------------------------------------- */
swap('  const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS]);',
  block([
    '  /* The empty chance is in the signature as well as the body, or changing',
    '     it alone would match the last signature and send nothing. */',
    '  const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]);',
  ]));

swap(block([
  '        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,',
  '          decisions:DECISIONS})});',
]), block([
  '        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,',
  '          decisions:DECISIONS, empty_chance:emptyChance})});',
]));

/* ---- 3. taken on the way in ----------------------------------------- */
swap(block([
  '  let pulledRules=0;',
  '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
]), block([
  '  /* THE SAME RULE THE RULES FOLLOW: what the group has wins, but a column',
  '     nobody has written is not an answer. A project that predates this reads',
  '     the default, and taking that would quietly undo a choice made here - so',
  '     the server\'s value is adopted only when it is not the default, and a',
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
  '         shareRules is what carries it, and its signature has changed. */',
  '      sharedRuleSig=null;',
  '      shareRules();',
  '    }',
  '  }',
  '  let pulledRules=0;',
  '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
]));

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['decide_order,empty_chance&team_id=eq.',
  'decisions:DECISIONS, empty_chance:emptyChance})});',
  '    const theirs=Number(c.empty_chance);',
  '  const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The value is clamped on EVERY way in - the box, the settings record, the
   project file, and now the server. A column check exists too, but a client
   that trusts a column check is trusting a schema it did not read today. */
const clamps = (code.match(/>=0&&\s*\w+<=0\.9/g) || []).length;
if (clamps < 2) throw new Error('the server value is not clamped like the others');

/* ONE SENDER FOR THIS FIELD, which is the claim - not one PATCH of the row.
   There are three, and counting those was the wrong question: shareLayers and
   cloudPush both PATCH {layers}, and a PATCH is partial, so neither touches
   what it does not name. What would be a defect is two places deciding when
   this particular value goes up, because they would need the same answers
   about whether there is a group and whether anything changed. */
const senders = (code.match(/empty_chance:/g) || []).length;
if (senders !== 1) throw new Error('expected one sender of empty_chance, found ' + senders);
const rowPatches = code.split('/rest/v1/collections?id=eq.').length - 1;
if (rowPatches !== 3)
  throw new Error('the collection PATCH sites changed - there were 3, now ' + rowPatches);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
