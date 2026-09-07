/* The Randomise button ignored every rule.

   MEASURED by reading it: composeRandom walked the compose rows and called
   weightedPick on each one independently. It never mentioned RULES and never
   called conflictsWith. Sheet of 12 and Generate set both go through
   buildCombo and are enforced, so the Never-together list was honoured
   everywhere EXCEPT the one button a person presses while they are deciding
   whether the rules are right - and the character it drew is on the canvas and
   downloadable through #cdl.

   That is the worst possible place for it to be missing. The tooltip on the
   Add button promises "These two will not appear on the same character", and
   the fastest way to check that promise showed you the opposite.

   It also chose in the WRONG ORDER, for the same reason buildCombo did: the
   compose rows sit in paint order, so choosing down the rows chose hair before
   hats. Both fixes are the same two lines, so they are one patch: filter each
   row against what is already chosen, and walk the rows in decide order.

   WHAT IS DELIBERATELY NOT COPIED FROM buildCombo: the retry. randomCombo
   throws away a cornered draw and rolls again up to 64 times, because a
   collection of ten thousand must not contain a character that breaks a rule.
   Randomise is one character a person asked to see, and silently rolling it
   again would mean the button sometimes ignores the press. A cornered layer is
   left empty here, which is what buildCombo does for any layer that may be
   empty, and the person can press it again.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('conflictsWith(r,chosen)') >= 0) throw new Error('already patched');
if (doc.original.indexOf('function decideOrder(){') < 0)
  throw new Error('patch234 has to land first - this walks the decide order');

{
  const r = kit.run(doc.lines,
    l => l === 'function composeRandom(){',
    l => l === '}',
    'composeRandom',
    kit.inFunction(doc.lines, 'function composeRandom(){'));
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  /* The two things this is fixing must actually be absent first, or the patch
     is being applied to a function that is not the one described above. */
  if (body.indexOf('conflictsWith') >= 0)
    throw new Error('composeRandom already consults the rules');
  if (body.indexOf('const hit=recs.length?weightedPick(recs):null;') < 0)
    throw new Error('composeRandom is not the shape this expects');

  kit.replace(doc.lines, r, [
    'function composeRandom(){',
    '  const sels=[...$("crows").querySelectorAll("select")].filter(s=>!s.disabled);',
    '  /* IN DECIDE ORDER, NOT ROW ORDER. The rows are built in paint order, so',
    '     walking them top to bottom chose the hair before the hat and left the',
    '     hat to yield - the same inversion buildCombo carried until DECIDE_ORDER',
    '     existed. The base has no layer and is not in the order; it is what the',
    '     layers are painted onto, so it goes first. */',
    '  const order=decideOrder();',
    '  const rank=s=>s.dataset.layer==="__base" ? -1',
    '    : (order.indexOf(s.dataset.layer)<0 ? order.length : order.indexOf(s.dataset.layer));',
    '  const walk=sels.slice().sort((a,b)=>rank(a)-rank(b));',
    '  /* What the character is carrying so far, in the same shape conflictsWith',
    '     reads - records, not ids. */',
    '  const chosen=[];',
    '  for(const s of walk){',
    '    const opts=[...s.options].filter(o=>o.value);',
    '    if(!opts.length){ s.value=""; continue; }',
    '    /* The base always gets one; a trait layer may legitimately be empty, which',
    '       is what makes generated characters differ at all. */',
    '    const skip = s.dataset.layer!=="__base"',
    '      && ALWAYS_PRESENT.indexOf(s.dataset.layer)<0',
    '      && Math.random()<emptyChance;',
    '    /* The dropdown holds ids; the weights live on the records, so the options',
    '       are resolved back to records before picking. */',
    '    const recs=opts.map(o=>cItems.find(i=>i.id===o.value)).filter(Boolean);',
    '    /* THE RULES. This is the line that was missing: without it the one',
    '       button people press to check a rule was the one place the rule was',
    '       not applied, and the character it drew could be downloaded. */',
    '    const ok = RULES.length ? recs.filter(r=>!conflictsWith(r,chosen)) : recs;',
    '    const hit = (skip||!ok.length) ? null : weightedPick(ok);',
    '    s.value = hit ? hit.id : "";',
    '    /* Only a trait that was actually taken constrains the next layer. A',
    '       skipped layer and a cornered one both leave the row empty and neither',
    '       may narrow anything. */',
    '    if(hit) chosen.push(hit);',
    '  }',
    '  drawCompose();',
    '}',
  ]);
  console.log('ok  Randomise honours the rules, and chooses in decide order');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const cr = kit.inFunction(codeLines, 'function composeRandom(){');
  const b = codeLines.slice(cr.start, cr.end + 1).join('\n');
  if (b.indexOf('conflictsWith(r,chosen)') < 0)
    throw new Error('Randomise still ignores the rules');
  if (b.indexOf('decideOrder()') < 0)
    throw new Error('Randomise still chooses in row order');
  /* The accumulator must only take traits that were really used. */
  if (b.indexOf('if(hit) chosen.push(hit);') < 0)
    throw new Error('a skipped layer would constrain the next one');
  /* The base must be first or it is filtered against nothing and, worse,
     sorted into the middle of the layers. */
  if (b.indexOf('s.dataset.layer==="__base" ? -1') < 0)
    throw new Error('the base is not held at the front of the walk');
  /* And the row must still be cleared when nothing is picked, or a previous
     press leaves a trait on screen that this one did not choose. */
  if (b.indexOf('s.value = hit ? hit.id : "";') < 0)
    throw new Error('a row is not cleared when nothing is chosen');
  /* The no-rules path must stay free - this button is pressed repeatedly. */
  if (b.indexOf('RULES.length ? recs.filter') < 0)
    throw new Error('the filter runs even with no rules to apply');
  /* buildCombo must be untouched by this patch. */
  if (code.indexOf('for(const layer of decideOrder()){') < 0)
    throw new Error('buildCombo lost its decide-order walk');
});

/* RUN the walk order and the filtering, because both are the claim. */
{
  const order = ['costumes', 'masks', 'hats', 'hair', 'glasses', 'skins', 'unsorted'];
  const rank = s => s === '__base' ? -1
    : (order.indexOf(s) < 0 ? order.length : order.indexOf(s));
  /* Rows arrive in PAINT order, which is where the inversion came from. */
  const rows = ['__base', 'skins', 'hair', 'hats', 'glasses'];
  const walked = rows.slice().sort((a, b) => rank(a) - rank(b));
  if (walked[0] !== '__base') throw new Error('the base must be chosen first');
  if (walked.indexOf('hats') > walked.indexOf('hair'))
    throw new Error('the hat must be chosen before the hair: ' + walked.join());
  if (walked.length !== rows.length) throw new Error('a row was lost in the sort');
  /* A layer the order has never heard of goes last rather than first, so it
     yields to everything instead of silently overruling it. */
  const withNew = ['__base', 'trousers', 'hats', 'hair'].slice()
    .sort((a, b) => rank(a) - rank(b));
  if (withNew[withNew.length - 1] !== 'trousers')
    throw new Error('an unknown layer must decide last: ' + withNew.join());
  /* And the filter: one rule, hat A never with hair B. */
  const RULES = [['hats/A', 'hair/B']];
  const key = r => r.layer + '/' + r.name;
  const clash = (rec, chosen) => RULES.some(g =>
    g.indexOf(key(rec)) >= 0 && chosen.some(o => key(o) !== key(rec) && g.indexOf(key(o)) >= 0));
  const hair = [{ layer: 'hair', name: 'B' }, { layer: 'hair', name: 'C' }];
  const chosen = [{ layer: 'hats', name: 'A' }];
  const left = hair.filter(r => !clash(r, chosen));
  if (left.length !== 1 || left[0].name !== 'C')
    throw new Error('the hair that clashes was not filtered out');
  /* The control: with no hat chosen, nothing is filtered. */
  if (hair.filter(r => !clash(r, [])).length !== 2)
    throw new Error('hair was filtered against an empty character');
  console.log('    walked ' + walked.join(', '));
  console.log('    and with hats/A taken, hair/B is gone and hair/C remains');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
