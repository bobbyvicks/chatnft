/* CLEARING THE RULE SET, AND MAKING THE CLEAR STICK.

   Importing rules only ever ADDS. A rule already present is counted as
   "already here" and skipped, and nothing is ever removed - right for adding a
   second file, wrong for the case this is for: traits renamed, the rule file
   regenerated, and 176 rules on the live collection still naming traits that
   no longer exist. Short of clearing the whole project there was no way back.

   THE ANSWERS GO WITH THE RULES, AND THEY HAVE TO. A "no" answer is not a note
   about a rule, it IS one - applyDecision pushes a group into RULES for every
   no, and the pull replays every answer it holds. Clearing 176 rules while
   keeping 2,603 answers would rebuild them on the next load. The button would
   not be wrong so much as pointless, and pointless in a way nobody could see.

   AND A CLEAR HAS TO SURVIVE A TEAMMATE. The pull merges rather than adopts,
   deliberately, so that a teammate mid-review does not lose their answers - and
   one line carries it:

     } else if(RULES.length){
       /* Nothing up there and something here: send it rather than lose it.

   which is right for a browser whose rules predate the column and wrong for
   one whose rules were just cleared by somebody else. Both look identical from
   there: empty server, full browser. So the server now records WHEN the rules
   were last written, and empty-and-newer is a clear rather than a gap. Empty
   and older still gets filled in from here, exactly as before. */
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

/* ---- 1. the button --------------------------------------------------- */
swap(block([
  '        title="Write the rules back out as a LaunchMyNFT rules file, including everything answered here. Import it there with Rules > Import Rules.">Download for LaunchMyNFT</button>',
  '    </div>',
]), block([
  '        title="Write the rules back out as a LaunchMyNFT rules file, including everything answered here. Import it there with Rules > Import Rules.">Download for LaunchMyNFT</button>',
  '      <button class="mini" id="ruleclear"',
  '        title="Remove every Never-together rule and every reviewed answer, so a new rules file can be imported over a clean project. Importing only ever adds, so without this a regenerated file lands on top of rules naming traits that have been renamed away. Your traits, layers and draw order are not touched.">Clear all rules</button>',
  '    </div>',
]));

/* ---- 2. when the rules were last written here ------------------------ */
swap("const RULES_ID='settings.rules';", block([
  "const RULES_ID='settings.rules';",
  '/* WHEN THIS BROWSER LAST WROTE THE RULES, in milliseconds.',
  '',
  '   Only ever compared against the same number on the server, to tell a',
  '   collection whose rules were deliberately CLEARED from one that has never',
  '   had any. Those are the same shape - an empty list - and opposite',
  '   instructions: adopt the first, fill in the second. 0 means this browser',
  '   has never written them, which is the safe end of that comparison. */',
  'let rulesAt=0;',
]));

swap(block([
  '  RULES = raw.filter(g=>Array.isArray(g)).map(g=>ruleGroup(g)).filter(g=>g.length>=2);',
]), block([
  '  RULES = raw.filter(g=>Array.isArray(g)).map(g=>ruleGroup(g)).filter(g=>g.length>=2);',
  '  /* A record written before the stamp existed reads as 0, which says this',
  '     browser has never written the rules - so a server that has them wins,',
  '     which is what happened before there was a stamp at all. */',
  '  rulesAt = (rec&&typeof rec.rulesAt==="number") ? rec.rulesAt : 0;',
]));

/* ---- 3. saved and sent with the stamp -------------------------------- */
swap(block([
  'async function saveRules(){',
]), block([
  'async function saveRules(){',
  '  /* Stamped here rather than in shareRules, so the copy in this browser and',
  '     the copy on the server carry the SAME number. Every caller of this',
  '     function is a change to the rules made on this device, which is exactly',
  '     what the stamp records. */',
  '  rulesAt=Date.now();',
]));

swap(block([
  '    groups:RULES.map(g=>g.slice()),',
]), block([
  '    groups:RULES.map(g=>g.slice()), rulesAt:rulesAt,',
]));

swap(block([
  "        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,",
  '          decisions:DECISIONS, empty_chance:emptyChance})});',
]), block([
  "        headers:h, body:JSON.stringify({rules:RULES, decide_order:DECIDE_ORDER,",
  '          decisions:DECISIONS, empty_chance:emptyChance, rules_at:rulesAt})});',
]));

swap('const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]);',
  'const sig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]);');

/* ---- 4. read the stamp back ------------------------------------------ */
swap('select=id,layers,rules,decisions,decide_order,empty_chance',
  'select=id,layers,rules,decisions,decide_order,empty_chance,rules_at');

/* ---- 5. an empty that is NEWER is a clear ---------------------------- */
swap(block([
  '  let pulledRules=0;',
  '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
]), block([
  '  let pulledRules=0;',
  '  /* A CLEAR IS AN EVENT, NOT AN ABSENCE.',
  '',
  '     Empty up there and full down here has two causes and they want opposite',
  '     things: rules that predate the column, which must be sent rather than',
  '     lost, and rules somebody deliberately cleared, which must be adopted.',
  '     The branch below reads both as the first, so any teammate pressing Load',
  '     used to push a cleared collection straight back to what it was.',
  '',
  '     The stamp is what separates them. Newer than anything this browser has',
  '     written AND empty is a clear; anything else falls through to the merge,',
  '     which is unchanged. Written straight to the store rather than through',
  '     saveRules, because adopting somebody else\'s clear is not a new one -',
  '     stamping it again here would make two browsers take turns re-clearing. */',
  '  {',
  '    const theirsAt=(c&&typeof c.rules_at==="number")?c.rules_at:0;',
  '    const nothingThere=!(Array.isArray(c.rules)&&c.rules.length)',
  '                     &&!(Array.isArray(c.decisions)&&c.decisions.length);',
  '    if(theirsAt>rulesAt && nothingThere && (RULES.length||DECISIONS.length)){',
  '      RULES=[]; DECISIONS=[];',
  '      rulesAt=theirsAt;',
  '      await dbPut({id:RULES_ID, kind:"settings", at:Date.now(),',
  '        groups:[], pairs:[], rulesAt:rulesAt});',
  '      await dbPut({id:DECISIONS_ID, kind:"settings", at:Date.now(), decisions:[]});',
  '      toast("The group cleared the trait rules");',
  '    }',
  '  }',
  '  if(Array.isArray(c.rules)||Array.isArray(c.decisions)){',
]));

/* ---- 6. the clear itself --------------------------------------------- */
swap('/* One answer, recorded and applied. */', block([
  '/* CLEARING THE LOT, so a regenerated rules file can land on a clean project.',
  '',
  '   Import only ever adds - a rule already present is counted and skipped, and',
  '   nothing is ever removed. That is right for adding a second file and wrong',
  '   after a rename, which is when the rules stop naming traits that exist.',
  '',
  '   THE ANSWERS GO TOO. Not tidiness: applyDecision pushes a group into RULES',
  '   for every "no", and the pull replays every answer it holds, so rules',
  '   cleared without their answers rebuild themselves on the next load.',
  '',
  '   The traits, the layers and the draw order are not touched. The draw order',
  '   in particular is a property of the LAYERS rather than of any rule, and the',
  '   next import sets it again anyway. */',
  'async function clearRules(){',
  '  const note=$("ruleimportnote");',
  '  const say=m=>{ if(note){ note.hidden=false; note.textContent=m; } };',
  '  const nR=RULES.length, nD=DECISIONS.length;',
  '  if(!nR&&!nD){ say("There are no rules to clear."); return; }',
  '  const what=[];',
  '  if(nR) what.push(nR+" never-together rule"+(nR===1?"":"s"));',
  '  if(nD) what.push(nD+" reviewed answer"+(nD===1?"":"s"));',
  '  /* Counted and named before anything goes. "2,603 answers" is a number',
  '     somebody can weigh; "the rules" is not. */',
  '  if(!confirm("Remove "+what.join(" and ")+"?"',
  '    +"\\n\\nThe answers go with the rules because a No answer rebuilds its rule"',
  '    +" every time the project loads, so keeping them would undo this."',
  '    +(activeWs?"\\n\\nThis is a group project, so it clears them for everyone.":"")',
  '    +"\\n\\nYour traits, layers and draw order are not touched.")) return;',
  '  RULES=[]; DECISIONS=[];',
  '  let sent=false;',
  '  try{ sent=await saveRules(); }',
  '  catch(_){ say("Could not clear them - nothing was changed on the server."); return; }',
  '  await renderShelf();',
  '  /* WHETHER IT REACHED THE GROUP, said plainly. A clear that stayed in this',
  '     browser comes back on the next load, and finding that out by watching it',
  '     happen is the worst way to learn it. */',
  '  say("Cleared "+what.join(" and ")+". "+(activeWs',
  '    ? (sent ? "The group has them cleared too - import a rules file to start again."',
  '            : "This browser is clear, but the group could not be reached, so they"',
  '              +" will come back on the next load. Try again when you are back online.")',
  '    : "Import a rules file to start again."));',
  '}',
  '',
  '/* One answer, recorded and applied. */',
]));

swap("$('ruleimport').onclick=()=>$('rulefile').click();", block([
  "$('ruleimport').onclick=()=>$('rulefile').click();",
  "$('ruleclear').onclick=clearRules;",
]));

/* ---- 7. a comment that stopped being true --------------------------- */
swap(block([
  '   NOT SHARED WITH TEAMMATES YET, and this is where somebody will look for',
  '   that. cloudPush sends traits and refs only, and collections has no column',
  '   for this, so two people on one project can read different percentages for',
  '   the same trait until one is added. It does travel in the project file. */',
]), block([
  '   SHARED WITH TEAMMATES, and this is where somebody will look for that.',
  '   collections.empty_chance holds it, shareRules sends it and takeEmptyChance',
  '   reads it back. This paragraph said the opposite for as long as that was',
  '   true, and kept saying it afterwards. It also travels in the project file. */',
]));

/* ---- CHECKS, then write ---------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function clearRules(){', 'let rulesAt=0;',
  '  rulesAt=Date.now();', 'rules_at:rulesAt', 'rulesAt:rulesAt,',
  '  rulesAt = (rec&&typeof rec.rulesAt==="number") ? rec.rulesAt : 0;',
  "$('ruleclear').onclick=clearRules;",
  'empty_chance,rules_at'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="ruleclear"').length !== 2)
  throw new Error('the button is not in the markup exactly once');

/* THE ANSWERS GO WITH THE RULES. The whole feature turns on this: rules
   cleared alone rebuild themselves from the answers on the next load. */
const cStart = code.indexOf('async function clearRules(){');
const cEnd = code.indexOf('\r\nasync function decidePair(', cStart);
if (cStart < 0 || cEnd < 0) throw new Error('could not bound clearRules');
const fn = code.slice(cStart, cEnd);
if (fn.length > 2600) throw new Error('the slice is too big to be one function: ' + fn.length);
if (fn.indexOf('RULES=[]; DECISIONS=[];') < 0)
  throw new Error('the clear leaves the answers, which rebuild the rules it just removed');
if (fn.indexOf('confirm(') < 0)
  throw new Error('a destructive action with no confirmation');
/* And it must not touch what it promises not to touch. */
for (const forbidden of ['dbDel', 'LAYERS=', 'DECIDE_ORDER=', 'dbClear'])
  if (fn.indexOf(forbidden) >= 0)
    throw new Error('the clear reaches past the rules: ' + forbidden);

/* THE ADOPT-A-CLEAR BRANCH MUST BE ABLE TO NOT FIRE. An unguarded version
   would empty the rules of any browser that pulls before it has ever sent
   any - which is every browser, once. */
const adoptAt = code.indexOf('if(theirsAt>rulesAt && nothingThere');
if (adoptAt < 0) throw new Error('the clear is not adopted from the group');
const adopt = code.slice(adoptAt, adoptAt + 200);
if (adopt.indexOf('(RULES.length||DECISIONS.length)') < 0)
  throw new Error('the adopt branch fires when there is nothing to clear');

/* The stamp is written in exactly one place, or the local copy and the server
   copy carry different numbers and the comparison means nothing. */
if (code.split('rulesAt=Date.now();').length !== 2)
  throw new Error('the stamp is set in more than one place');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
