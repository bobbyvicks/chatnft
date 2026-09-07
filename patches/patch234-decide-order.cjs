/* One layer list was being asked to be two different orders at once.

   Reported by way of a rules file: "we built on codex the ability to build
   peramiters with stuff that doesnt let hats stack on certain hair traits. can
   we use that code to add it to our site?"

   WHAT LAYERS IS. It is the PAINT order - buildCombo returns records in it and
   the paint loop at 7297 draws the array front to back, so a layer later in
   the list is painted on top. The Layers panel shows it reversed for exactly
   that reason (7836: "the front of the drawing is the top of the list").

   WHAT IT WAS ALSO BEING USED FOR. buildCombo walked the same list to CHOOSE,
   committing each pick and filtering the next layer against what was already
   taken. So the earlier layer wins the argument and the later one yields.

   THOSE TWO JOBS DISAGREE, AND THE COLLECTION IS WHAT PAYS. Hair is painted
   UNDER headwear, so hair must sit earlier in LAYERS - which made hair decide
   first and the hat give way. The curated rules mean the opposite: the hat is
   the choice and the hair yields to it.

   MEASURED, on the 51 curated head traits in the file this came from. 41 of
   them allow some hair - a mean of 11.2 of the 18 hairstyles - and for those
   the old order is harmless: hair is drawn, then a hat that fits that hair is
   chosen from what is left. The other 10 require NO hair at all (SMB Bandana,
   Bloodshot Ape Head, Exposed Brain, guy, Trainer Cap and Hair, WIF Hat Messy
   Hair, Yellow Hazmat Costume, Silent Professional, George Droid Mask,
   Mandalorian Faceplate). Under the old order those ten could only appear on a
   character that happened to draw no hair at all, which at the default 35%
   empty chance is about a third of the frequency they were curated for. Ten
   traits quietly rarer than they were designed to be, with nothing on screen
   saying so.

   SO THIS IS THE OTHER ORDER. DECIDE_ORDER is the order layers are chosen in;
   LAYERS stays the order they are painted in. buildCombo walks the decide
   order and sorts what it picked back into paint order before returning, so
   every consumer downstream is untouched - the paint loop, and comboKey, which
   joins ids positionally and would otherwise call one character two.

   IT DEFAULTS TO EMPTY, AND EMPTY MEANS "THE SAME AS THE PAINT ORDER". A
   project that has never set one behaves exactly as it did, down to the random
   numbers: rnd() is consumed per layer in order, so an unchanged order
   consumes it in an unchanged sequence and generates the identical collection.
   That is asserted by a test rather than argued here.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('DECIDE_ORDER') >= 0) throw new Error('already patched');

/* ---- 1. the order itself, beside the layer list it is not ---- */
{
  const at = kit.only(doc.lines, l => l === "const LAYERS_ID='settings.layers';",
    'the layer list id');
  kit.replace(doc.lines, { start: at, end: at }, [
    "const LAYERS_ID='settings.layers';",
    '/* THE ORDER LAYERS ARE DECIDED IN, which is not the order they are painted',
    '   in. LAYERS is the paint order and stays it.',
    '',
    '   buildCombo commits each pick and filters the next layer against what is',
    '   already taken, so whichever layer is reached FIRST wins the argument.',
    '   That made the list do two jobs, and for headwear they disagree: hair is',
    '   painted under a hat, so hair is earlier in LAYERS, so hair decided first',
    '   and the hat was the thing dropped. The rules this was built for mean the',
    '   reverse - the hat is the choice and the hair gives way.',
    '',
    '   EMPTY MEANS "the same as the paint order", which is what every project',
    '   had before this existed and what a set with no rules still wants. */',
    'let DECIDE_ORDER=[];',
    "const DECIDE_ID='settings.decideorder';",
  ]);
  console.log('ok  DECIDE_ORDER exists, and defaults to the paint order');
}

/* ---- 2. reconciled against the layer list as it is NOW ---- */
{
  const at = kit.only(doc.lines, l => l === 'function buildLayerSelect(){',
    'the layer select builder');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* The layers to walk when CHOOSING, reconciled against the layer list as it',
    '   stands. A name that is no longer a layer drops out, and a layer the order',
    '   has never heard of follows the ones it names, in paint order.',
    '',
    '   Reconciled on every read rather than rewritten on every layer change,',
    '   because the alternative is a stored list that a rename or a removal turns',
    '   into a lie - the same reason applyLayers adopts a layer from the records',
    '   it can see rather than trusting what was saved. */',
    'function decideOrder(){',
    '  if(!DECIDE_ORDER.length) return LAYERS.slice();',
    '  const named=DECIDE_ORDER.filter(l=>LAYERS.indexOf(l)>=0);',
    '  const seen=new Set(named);',
    '  return named.concat(LAYERS.filter(l=>!seen.has(l)));',
    '}',
    '/* Written whenever something works out an order - today that is the rules',
    '   import, which knows which layer is the condition and which is the target. */',
    'async function saveDecideOrder(){',
    '  await dbPut({id:DECIDE_ID, kind:"settings", at:Date.now(), order:DECIDE_ORDER.slice()});',
    '}',
    'function applyDecideOrder(items){',
    '  const rec=items.find(i=>i.id===DECIDE_ID);',
    '  DECIDE_ORDER = (rec&&Array.isArray(rec.order)) ? rec.order.map(String).filter(Boolean) : [];',
    '}',
    'function buildLayerSelect(){',
  ]);
  console.log('ok  and is reconciled against the layers that actually exist');
}

/* ---- 3. loaded with everything else, before anything draws ---- */
{
  const at = kit.only(doc.lines, l => l === '  applyRules(items);', 'the rules load');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  applyRules(items);',
    '  /* Beside applyRules and for the same reason: buildCombo reads it, and a',
    '     sheet drawn before it loaded would choose in the wrong order and show a',
    '     collection the rules do not describe. */',
    '  applyDecideOrder(items);',
  ]);
  console.log('ok  and is loaded before anything is drawn');
}

/* ---- 4. buildCombo chooses in decide order, returns in paint order ---- */
{
  const r = kit.run(doc.lines,
    l => l === 'function buildCombo(pools){',
    l => l === '  return { combo:out, violated };',
    'buildCombo');
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('for(const layer of LAYERS){') < 0)
    throw new Error('buildCombo does not walk LAYERS the way this expects');
  if (body.indexOf('conflictsWith(r,out)') < 0)
    throw new Error('buildCombo does not filter against what is chosen');
  /* Only the two lines that matter change; everything between them is the
     existing body and is carried across untouched. */
  const kept = doc.lines.slice(r.start + 1, r.end);
  const walk = kept.indexOf('  for(const layer of LAYERS){');
  if (walk < 0) throw new Error('the layer walk is not on a line of its own');
  kept[walk] = '  for(const layer of decideOrder()){';
  kit.replace(doc.lines, r, ['function buildCombo(pools){'].concat(kept, [
    '  /* BACK INTO PAINT ORDER BEFORE IT LEAVES. Two things downstream assume',
    '     it and neither would say so if it stopped being true: the paint loop',
    '     draws this array front to back, and comboKey joins the ids',
    '     positionally, so the same traits decided in a different order would',
    '     otherwise key as a different character and uniqueCombos would hand back',
    '     duplicates.',
    '',
    '     The base stays where it is. It is not on a layer - it is what the',
    '     layers are painted onto - so it is held out of the sort rather than',
    '     given a position in it. */',
    '  const paintAt=l=>{ const i=LAYERS.indexOf(l); return i<0?LAYERS.length:i; };',
    '  const first=(base&&base.length)?1:0;',
    '  const combo=out.slice(0,first).concat(out.slice(first)',
    '    .sort((a,b)=>paintAt((a&&a.layer)||"unsorted")-paintAt((b&&b.layer)||"unsorted")));',
    '  return { combo:combo, violated };',
  ]));
  console.log('ok  buildCombo decides in one order and paints in the other');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  /* The walk is the decide order, and LAYERS is not walked for choosing. */
  const bc = kit.inFunction(codeLines, 'function buildCombo(pools){');
  const body = codeLines.slice(bc.start, bc.end + 1).join('\n');
  if (body.indexOf('for(const layer of decideOrder()){') < 0)
    throw new Error('buildCombo still chooses in paint order');
  if (body.indexOf('for(const layer of LAYERS){') >= 0)
    throw new Error('buildCombo still has a LAYERS walk in it');
  /* And it still sorts back, or the paint order is now wrong. */
  if (body.indexOf('paintAt') < 0) throw new Error('nothing puts the combo back in paint order');
  if (body.indexOf('return { combo:combo, violated };') < 0)
    throw new Error('buildCombo does not return the sorted combo');
  /* The base is held out of the sort. */
  if (body.indexOf('out.slice(0,first)') < 0)
    throw new Error('the base is being sorted with the traits');

  /* decideOrder falls back to LAYERS, which is what makes this a no-op for
     every project that has not set an order. */
  const dof = kit.inFunction(codeLines, 'function decideOrder(){');
  const d = codeLines.slice(dof.start, dof.end + 1).join('\n');
  if (d.indexOf('if(!DECIDE_ORDER.length) return LAYERS.slice();') < 0)
    throw new Error('an empty decide order no longer means the paint order');
  if (d.indexOf('LAYERS.indexOf(l)>=0') < 0)
    throw new Error('decideOrder does not drop a layer that no longer exists');

  /* Loaded on render, beside the rules. */
  if (code.indexOf('applyDecideOrder(items);') < 0)
    throw new Error('nothing loads the decide order');
  const ar = code.indexOf('applyRules(items);');
  const ad = code.indexOf('applyDecideOrder(items);');
  if (!(ar >= 0 && ad > ar)) throw new Error('the decide order is not loaded with the rules');

  /* One id, one saver, and it must not collide with the others. */
  for (const id of ['settings.layers', 'settings.rules', 'settings.grid'])
    if (code.indexOf("'settings.decideorder'") >= 0 && id === 'settings.decideorder')
      throw new Error('id collision');
  if (code.indexOf("const DECIDE_ID='settings.decideorder';") < 0)
    throw new Error('the decide order has no id of its own');
  if (code.indexOf('async function saveDecideOrder(){') < 0)
    throw new Error('nothing can persist a decide order');
});

/* RUN the reconciliation and the sort, because both are claims. */
{
  const LAYERS = ['backgrounds', 'skins', 'costumes', 'masks', 'hair', 'hats', 'glasses', 'unsorted'];
  const decide = (order) => {
    if (!order.length) return LAYERS.slice();
    const named = order.filter(l => LAYERS.indexOf(l) >= 0);
    const seen = new Set(named);
    return named.concat(LAYERS.filter(l => !seen.has(l)));
  };
  /* Empty is the paint order, exactly. */
  if (decide([]).join() !== LAYERS.join()) throw new Error('empty must mean the paint order');
  /* The order the rules file implies: costumes and masks decide before hats,
     hats before hair and glasses. */
  const wanted = ['costumes', 'masks', 'hats', 'hair', 'glasses'];
  const got = decide(wanted);
  if (got.indexOf('hats') > got.indexOf('hair')) throw new Error('the hat must decide before the hair');
  if (got.indexOf('costumes') > got.indexOf('hats')) throw new Error('a costume must decide before the hat');
  /* Layers it does not name still appear, once each. */
  for (const l of LAYERS) if (got.indexOf(l) < 0) throw new Error('decideOrder dropped ' + l);
  if (got.length !== LAYERS.length) throw new Error('decideOrder changed the layer count: ' + got.length);
  if (new Set(got).size !== got.length) throw new Error('decideOrder named a layer twice');
  /* A name that is no longer a layer simply goes. */
  const stale = decide(['hats', 'trousers', 'hair']);
  if (stale.indexOf('trousers') >= 0) throw new Error('a removed layer came back');
  if (stale.length !== LAYERS.length) throw new Error('a stale name changed the count');
  /* And the sort back into paint order really is the paint order. */
  const paintAt = l => { const i = LAYERS.indexOf(l); return i < 0 ? LAYERS.length : i; };
  const picked = [{ layer: 'hats' }, { layer: 'hair' }, { layer: 'skins' }, { layer: 'glasses' }];
  const painted = picked.slice().sort((a, b) => paintAt(a.layer) - paintAt(b.layer)).map(r => r.layer);
  if (painted.join() !== 'skins,hair,hats,glasses')
    throw new Error('the paint order came out wrong: ' + painted.join());
  console.log('    decided ' + got.join(', '));
  console.log('    painted ' + painted.join(', ') + '  (hair under hats, both over skins)');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
