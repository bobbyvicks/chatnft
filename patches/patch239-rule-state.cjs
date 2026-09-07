/* Two things about the rules that nothing on screen said.

   Found by asking the WORKLOG's own question of the work just landed - what
   does this now KNOW and never SAY - and by its lens 4, grep for the same
   SHAPE rather than the same name.

   ONE. THE RULES NEVER LEAVE THIS BROWSER, AND IN A GROUP NOBODY IS TOLD.

   Measured by reading it: cloudPush uploads `(await dbAll()).filter(i =>
   i.kind==="trait"||i.kind==="ref")`. Settings are not in that filter, and
   RULES appears in no request body anywhere in the file - the only place the
   word occurs near JSON.stringify is the distribution cache key. The one
   setting that does reach the server is the layer list, PATCHed as
   {layers:LAYERS}, and collections is only ever selected as id, layers,
   updated_at, so there is nowhere for rules to go without a column.

   So in a group project one person can import 103 curated fit decisions and
   every teammate generates without them - hats stacked on hair, in a
   collection built to prevent exactly that - and nothing says so.

   THE APP ALREADY KNOWS HOW TO SAY THIS. LAYERS_NOT_SHARED is
   " - the group has not got the layer list yet, press Save to cloud", used at
   five call sites, and the trait banner says "N of these are only on this
   device and nobody else in <group> can see them". The layer ORDER gets that
   care. The rules, which are far more work to recreate, got nothing. That is
   the shape lens 4 describes: a fix landed at one call site and its sibling
   kept the old behaviour.

   NOT FIXED BY SYNCING THEM. That needs a rules column on collections, which
   is a migration on somebody else's database and their decision, not a thing
   to do uninvited. And the rules are already portable in the form the user
   has: the file. So the note says what is true and points at the thing that
   travels.

   TWO. THE DECIDE ORDER IS COMPUTED AND NEVER SURFACED.

   The import works out which layer must be decided first and stores it, and
   that decision changes which of two clashing traits survives - the whole
   point of it. After a reload nothing on screen says a decide order exists,
   what it is, or that it is not the order in the Layers panel. Somebody
   wondering why their hats come out rarer than their hairstyles has nothing
   to read.

   Both go in one line under the rule list, because they are one question:
   what do these rules actually do, and who has them.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('function ruleState(') >= 0) throw new Error('already patched');
if (doc.original.indexOf('let DECIDE_ORDER=[];') < 0)
  throw new Error('the decide order has to exist before it can be explained');

/* ---- 1. somewhere to say it ---- */
{
  const at = kit.only(doc.lines, l => l === '    <div id="rulelist"></div>', 'the rule list');
  kit.replace(doc.lines, { start: at, end: at }, [
    '    <div id="rulelist"></div>',
    '    <p class="note" id="rulestate" hidden></p>',
  ]);
  console.log('ok  there is a line for it, under the rules it describes');
}

/* ---- 2. what it says ---- */
{
  const at = kit.only(doc.lines, l => l === 'function buildRules(traits){', 'buildRules');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* WHAT THESE RULES ACTUALLY DO, AND WHO HAS THEM.',
    '',
    '   Two facts the app knew and never said. The decide order changes which of',
    '   two clashing traits survives and was invisible after a reload; and the',
    '   rules live in this browser only - cloudPush filters to kind trait and ref,',
    '   and no request body in this file mentions RULES - so in a group project',
    '   everybody else generates without them.',
    '',
    '   Named layers rather than the whole order: a person cares which of the',
    '   layers they wrote rules about gives way, and listing all sixteen would',
    '   bury that. */',
    'function ruleState(){',
    '  const el=$("rulestate"); if(!el) return;',
    '  if(!RULES.length){ el.hidden=true; el.textContent=""; return; }',
    '  const bits=[];',
    '  /* Only the layers a rule actually names, in the order they are decided. */',
    '  const named=new Set();',
    '  for(const g of RULES) for(const k of g){',
    '    const i=k.indexOf("/"); if(i>0) named.add(k.slice(0,i));',
    '  }',
    '  const order=decideOrder().filter(l=>named.has(l));',
    '  if(DECIDE_ORDER.length && order.length>1)',
    '    bits.push("When two of these clash the later one gives way, and they are decided "',
    '      +order.join(", then ")+" - not the order they paint in");',
    '  /* The sharing half. The group name the same way the trait banner reads it,',
    '     so the two lines cannot disagree about what the project is called. */',
    '  const sel=$("wssel");',
    '  const where=activeWs ? ((sel&&sel.selectedOptions[0]&&sel.selectedOptions[0].textContent)||"this group") : null;',
    '  if(activeWs)',
    '    bits.push("These "+RULES.length+" rules are on this device only - Save to cloud does not send them, so nobody else in "',
    '      +where+" has them. Share the rules file and let them import it");',
    '  else',
    '    bits.push("They live in this browser only, so keep the file you imported them from");',
    '  el.hidden=false;',
    '  el.textContent=bits.join(". ")+".";',
    '}',
    'function buildRules(traits){',
  ]);
  console.log('ok  and it says which layer gives way, and who has the rules');
}

/* ---- 3. said on every render, like everything else in that panel ---- */
{
  const at = kit.only(doc.lines, l => l === '  buildRules(traits);', 'the buildRules call');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  buildRules(traits);',
    '  /* After buildRules, because it counts the rules that were just drawn. */',
    '  ruleState();',
  ]);
  console.log('ok  and it is written on every render');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines, text }) => {
  if (text.indexOf('<p class="note" id="rulestate" hidden></p>') < 0)
    throw new Error('there is nowhere to say it');
  const rs = kit.inFunction(codeLines, 'function ruleState(){');
  const b = codeLines.slice(rs.start, rs.end + 1).join('\n');
  /* Nothing at all with no rules - a note about rules nobody has is noise. */
  if (b.indexOf('if(!RULES.length){ el.hidden=true;') < 0)
    throw new Error('it would talk about rules that do not exist');
  /* The decide order is only mentioned when one is actually set. */
  if (b.indexOf('if(DECIDE_ORDER.length && order.length>1)') < 0)
    throw new Error('it would describe a decide order nobody set');
  /* And the sharing truth must be told in a group. */
  if (b.indexOf('Save to cloud does not send them') < 0)
    throw new Error('it does not say the rules stay here');
  if (b.indexOf('activeWs') < 0)
    throw new Error('it says the same thing in a group and on your own page');
  /* It must not claim to be able to send them. */
  for (const bad of ['cloudPush', 'Send to '])
    if (b.indexOf(bad) >= 0)
      throw new Error('it offers a way to share them that does not exist: ' + bad);
  /* Called after the rules are drawn. */
  const bi = code.indexOf('buildRules(traits);');
  const ri = code.indexOf('ruleState();');
  if (!(bi >= 0 && ri > bi)) throw new Error('the note is written before the rules it counts');

  /* AND THE CLAIM ITSELF, re-checked here so this patch fails if somebody
     starts syncing rules and forgets to delete the sentence. */
  const push = kit.inFunction(codeLines, 'async function cloudPush(){');
  const p = codeLines.slice(push.start, push.end + 1).join('\n');
  if (p.indexOf('i.kind==="trait"||i.kind==="ref"') < 0)
    throw new Error('cloudPush no longer filters the way this note describes');
  if (p.indexOf('RULES') >= 0)
    throw new Error('cloudPush now mentions RULES, so the note may be a lie');
});

/* RUN the wording, because a sentence is the deliverable here. */
{
  const decide = ['skins', 'costumes', 'masks', 'hats', 'glasses', 'hair', 'unsorted'];
  const RULES = [['hats/cap', 'hair/bob'], ['costumes/onesie', 'hats/cap'], ['skins/tan', 'skins/pale']];
  const named = new Set();
  for (const g of RULES) for (const k of g) named.add(k.slice(0, k.indexOf('/')));
  const order = decide.filter(l => named.has(l));
  if (order.join() !== 'skins,costumes,hats,hair')
    throw new Error('the named layers came out wrong: ' + order.join());
  /* The layers nobody wrote a rule about stay out of the sentence. */
  for (const l of ['glasses', 'unsorted'])
    if (order.indexOf(l) >= 0) throw new Error(l + ' has no rule and should not be named');
  /* And the order really is the decide order, not the paint order. */
  if (order.indexOf('hats') > order.indexOf('hair'))
    throw new Error('the sentence would tell somebody the hair wins');
  const line = 'When two of these clash the later one gives way, and they are decided '
    + order.join(', then ') + ' - not the order they paint in';
  if (line.indexOf('hats, then hair') < 0)
    throw new Error('the sentence does not read as an order: ' + line);
  console.log('    ' + line);
  console.log('    and with no decide order set, that half is not said at all');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
