/* Import a curated rules file, instead of building it by hand 919 times.

   Asked for: "we built on codex the ability to build peramiters with stuff
   that doesnt let hats stack on certain hair traits. can we use that code to
   add it to our site?"

   WHAT THEY BUILT. A LaunchMyNFT rules export - 54 conditions and 127 actions
   over 92 traits, each one a curated fit decision with a contact sheet behind
   it.

   THAT FILE IS REGENERATED, AND IT MOVED WHILE THIS WAS BEING WRITTEN. An
   earlier reading the same evening had 51 conditions, 121 actions and 82
   traits; the copy on disk at 2026-09-07T00:57Z has 54, 127 and 92, and the
   upload folder grew with it (hats 32 to 35, hair 18 to 25). Every count in
   this file is a snapshot of a file somebody is still working on, which is why
   the checks below assert the PROPERTIES of the translation and print the
   counts rather than asserting them. A patch that hard-codes a number from a
   file its author does not own fails the next time that file is saved.

   The shape is

     { layer:"hats", operation:"is", trait:["SMB Bandana.png"],
       thenStatements:[ {action:"hide layer",     targetLayer:"hair",    targetTrait:[]},
                        {action:"only pick from", targetLayer:"glasses", targetTrait:[...]} ] }

   WHAT IS AND IS NOT REUSED. The DATA is the work - a day of visual review.
   The code around it is a generator for someone else's file format, and its
   validator embeds a verbatim copy of LaunchMyNFT's own minified rule engine
   (site-source/verified-rule-engine.js). None of that engine is copied here.
   It was read to learn the exact semantics, and what is below is this app's
   own rule model doing the same job.

   THE TRANSLATION, AND WHY IT IS EXACT. A rule here is a group meaning "at
   most one of these on a character". For each action, the traits it forbids on
   the target layer are every trait on that layer minus the ones it allows -
   all of them, for "hide layer". The group is [the condition trait] + those.

   That is not an approximation. A group of {one hat, fifteen hairstyles} also
   says no two of those fifteen hairstyles may appear together, which sounds
   like an extra constraint and is not: buildCombo takes at most one trait per
   layer, so two hairstyles could never co-occur anyway. The only pairs the
   group can actually forbid are hat-against-hairstyle, which is exactly what
   the action said.

   MEASURED on the file as it stands: 127 actions become 103 groups and 1,138
   members. 24 actions restrict nothing - an "only pick from" that lists every
   trait on the layer - and produce no group rather than a group of one.

   AND THE DIRECTION, which groups cannot carry. An action names a condition
   layer and a target layer, and the target is the side that yields. A group is
   symmetric, so in this app the side that yields is whichever layer is decided
   LATER. So the import also writes a decide order in which every condition
   layer comes before its targets - costumes and masks before hats, hats before
   hair and glasses. Without it the ten head traits that require no hair could
   only appear on a character that drew no hair anyway, at about a third of
   their intended frequency.

   The order is derived by a stable topological sort seeded with the current
   paint order, so a layer with no rule about it does not move, and the whole
   order is written rather than the five layers the file mentions - a partial
   list would shove every unmentioned layer to the end.

   WHAT IT REFUSES TO DO. It never invents a trait. A condition naming
   something this project does not have is skipped and named; so is a target
   layer that does not exist, an operation other than "is" (the file only uses
   "is", and "is not" would inverted-mean something this cannot express), and a
   layer whose trait names collide once the extension is stripped. If nothing
   matches at all it writes NOTHING and says so, rather than reporting success
   over an empty list.

   IT MERGES, IT DOES NOT REPLACE. LaunchMyNFT's own note says importing
   replaces the rule list. Here that would silently destroy rules made by hand
   in this app, so rules already present are counted and left alone.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('planRuleImport') >= 0) throw new Error('already patched');
if (doc.original.indexOf('let DECIDE_ORDER=[];') < 0)
  throw new Error('patch234 has to land first - the import writes a decide order');

/* ---- 1. the control, under the rule list it fills ---- */
{
  const at = kit.only(doc.lines, l => l === '    <div id="rulelist"></div>', 'the rule list');
  kit.replace(doc.lines, { start: at, end: at }, [
    '    <div id="rulelist"></div>',
    '    <!-- Building the curated set by hand is 99 rules and 919 members, which',
    '         is about 919 trips through a dropdown of every trait in the',
    '         collection. The file is the gesture. -->',
    '    <div class="olrow" style="margin-top:6px">',
    '      <button class="mini" id="ruleimport"',
    '        title="Read a LaunchMyNFT rules file and turn it into Never-together rules. Nothing is replaced - rules already here are left alone - and any trait the file names that this project does not have is reported rather than invented.">Import rules from a file</button>',
    '    </div>',
    '    <p class="note" id="ruleimportnote" hidden></p>',
    '    <input type="file" id="rulefile" accept="application/json,.json" hidden>',
  ]);
  console.log('ok  the button exists, under the rules it writes');
}

/* ---- 2. the translation, as a function that decides nothing else ---- */
{
  const at = kit.only(doc.lines, l => l === 'async function saveRules(){', 'saveRules');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* A trait name as the rules file writes it, reduced to something that can be',
    '   compared with a name in this project. The file carries filenames',
    '   ("BTC Cap.png"); a trait here is named by bulkImport as the filename with',
    '   the extension taken off. Case and surrounding space are ignored because a',
    '   person renaming a trait should not silently break a rule about it. */',
    'function ruleImportName(n){',
    '  return String(n||"").replace(/\\.(png|jpe?g|webp|gif)$/i,"").trim().toLowerCase();',
    '}',
    '/* WORK OUT WHAT A RULES FILE WOULD DO, WITHOUT DOING ANY OF IT.',
    '',
    '   Separated from the button so the translation can be tested on its own,',
    '   and so nothing is written until every problem with the file is known -',
    '   half an import is worse than none, because the half that landed looks',
    '   exactly like a whole one.',
    '',
    '   Returns the groups it would add, the decide order it would set, and',
    '   every reason it skipped something. It never touches RULES. */',
    'function planRuleImport(docIn, traits){',
    '  const out={groups:[], order:[], actions:0, restrictNothing:0,',
    '    missingTraits:[], missingLayers:[], badOps:[], ambiguous:[], edges:[]};',
    '  if(!Array.isArray(docIn)) throw new Error("That file is not a list of rules.");',
    '  /* What this project actually has, per layer, keyed by the reduced name.',
    '     A layer whose names collide once the extension is stripped cannot be',
    '     matched safely, so it is refused by name rather than guessed at. */',
    '  const byLayer=new Map();',
    '  const clash=new Map();',
    '  for(const t of traits){',
    '    if(!t||t.kind!=="trait") continue;',
    '    const l=t.layer||"unsorted", k=ruleImportName(t.name);',
    '    if(!k) continue;',
    '    if(!byLayer.has(l)) byLayer.set(l,new Map());',
    '    const m=byLayer.get(l);',
    '    if(m.has(k)&&m.get(k)!==t.name){ clash.set(l+"/"+k,true); continue; }',
    '    m.set(k,t.name);',
    '  }',
    '  const key=(layer,name)=>{',
    '    const m=byLayer.get(layer); if(!m) return null;',
    '    const k=ruleImportName(name);',
    '    if(clash.has(layer+"/"+k)){ out.ambiguous.push(layer+"/"+name); return null; }',
    '    const real=m.get(k);',
    '    return real===undefined ? null : layer+"/"+real;',
    '  };',
    '  for(const r of docIn){',
    '    if(!r||typeof r!=="object") continue;',
    '    const cl=String(r.layer||"");',
    '    /* Only "is". "is not" would mean the condition holds for every OTHER',
    '       trait on the layer, which is a different and much larger expansion;',
    '       refusing it by name beats importing something that is nearly right. */',
    '    if(r.operation!=="is"){ out.badOps.push(cl+" "+String(r.operation)); continue; }',
    '    if(!byLayer.has(cl)){ out.missingLayers.push(cl); continue; }',
    '    for(const t of (r.trait||[])){',
    '      const ck=key(cl,t);',
    '      if(!ck){ out.missingTraits.push(cl+"/"+t); continue; }',
    '      for(const s of (r.thenStatements||[])){',
    '        out.actions++;',
    '        const tl=String(s.targetLayer||"");',
    '        if(!byLayer.has(tl)){ out.missingLayers.push(tl); continue; }',
    '        const all=[...byLayer.get(tl).values()];',
    '        /* Everything on the target layer, minus what the action allows.',
    '           "hide layer" allows nothing, so it forbids the lot. */',
    '        const allow=new Set();',
    '        if(s.action!=="hide layer")',
    '          for(const a of (s.targetTrait||[])){',
    '            const m=byLayer.get(tl).get(ruleImportName(a));',
    '            if(m!==undefined) allow.add(m); else out.missingTraits.push(tl+"/"+a);',
    '          }',
    '        const deny=all.filter(n=>!allow.has(n));',
    '        /* An action that forbids nothing is not a rule. Counted, so the',
    '           report can say why 121 actions became fewer groups. */',
    '        if(!deny.length){ out.restrictNothing++; continue; }',
    '        out.groups.push(ruleGroup([ck].concat(deny.map(n=>tl+"/"+n))));',
    '        /* The direction a group cannot carry: the target is the side that',
    '           yields, and in this app that is whichever layer decides later. */',
    '        if(cl!==tl) out.edges.push([cl,tl]);',
    '      }',
    '    }',
    '  }',
    '  out.order=decideOrderFor(out.edges);',
    '  return out;',
    '}',
    '/* A decide order satisfying every condition-before-target edge, disturbing',
    '   the paint order as little as possible.',
    '',
    '   Kahn, but always taking the available layer that comes EARLIEST in LAYERS,',
    '   so a layer nothing has a rule about keeps its place. The whole order is',
    '   returned, not just the layers the file mentions: decideOrder() puts every',
    '   layer it was not told about after the ones it was, so a partial list would',
    '   quietly move skins and backgrounds to the end.',
    '',
    '   A cycle - A before B and B before A - cannot be ordered at all. It returns',
    '   nothing rather than a plausible order, and the caller says so; a made-up',
    '   order would be a collection nobody could explain. */',
    'function decideOrderFor(edges){',
    '  const indeg=new Map(LAYERS.map(l=>[l,0]));',
    '  const next=new Map(LAYERS.map(l=>[l,[]]));',
    '  const seen=new Set();',
    '  for(const [a,b] of edges){',
    '    if(!indeg.has(a)||!indeg.has(b)) continue;',
    '    const sig=a+"\\u0000"+b; if(seen.has(sig)) continue; seen.add(sig);',
    '    next.get(a).push(b); indeg.set(b,indeg.get(b)+1);',
    '  }',
    '  const order=[]; const left=LAYERS.slice();',
    '  while(left.length){',
    '    const i=left.findIndex(l=>indeg.get(l)===0);',
    '    if(i<0) return [];',
    '    const l=left.splice(i,1)[0];',
    '    order.push(l);',
    '    for(const m of next.get(l)) indeg.set(m,indeg.get(m)-1);',
    '  }',
    '  return order;',
    '}',
    'async function saveRules(){',
  ]);
  console.log('ok  and the translation is a function that writes nothing');
}

/* ---- 3. the wiring, which is the only part that changes anything ---- */
{
  const at = kit.only(doc.lines, l => l === "$('csheet').onclick=()=>drawSheet(12);", 'the sheet button');
  kit.replace(doc.lines, { start: at, end: at }, [
    "$('ruleimport').onclick=()=>$('rulefile').click();",
    "$('rulefile').onchange=async(e)=>{",
    '  const f=e.target.files&&e.target.files[0];',
    '  /* Cleared straight away so choosing the same file twice fires again -',
    '     which somebody will do after fixing a name. */',
    '  e.target.value="";',
    '  if(!f) return;',
    '  const note=$("ruleimportnote"); note.hidden=false;',
    '  note.textContent="Reading "+f.name+"...";',
    '  let plan;',
    '  try{',
    '    const parsed=JSON.parse(await f.text());',
    '    let items=[]; try{ items=await dbAll(); }catch(_){ }',
    '    plan=planRuleImport(parsed, items.filter(i=>i.kind==="trait"));',
    '  }catch(err){',
    '    note.textContent="Could not read that file: "+(err&&err.message?err.message:"it is not valid JSON")+".";',
    '    return;',
    '  }',
    '  /* NOTHING MATCHED IS NOT A SUCCESSFUL IMPORT OF NOTHING. The usual cause',
    '     is a project whose layers are not the ones the file names, and saying',
    '     which layers are missing is the fix. */',
    '  if(!plan.groups.length){',
    '    note.textContent="Nothing to import. "+(plan.missingLayers.length',
    '      ? "This project has no layer called "+[...new Set(plan.missingLayers)].slice(0,5).join(", ")',
    '        +" - import the trait folders first."',
    '      : "The file named "+plan.actions+" restrictions and none of them applied to a trait in this project.");',
    '    return;',
    '  }',
    '  const before=RULES.length;',
    '  const have=new Set(RULES.map(ruleId));',
    '  let added=0, already=0;',
    '  for(const g of plan.groups){',
    '    const id=ruleId(g);',
    '    if(have.has(id)){ already++; continue; }',
    '    have.add(id); RULES.push(g); added++;',
    '  }',
    '  /* The order the rules need to MEAN what they say. Written only when the',
    '     sort found one - a cycle returns nothing, and an order invented to fill',
    '     the gap would be a collection nobody could account for. */',
    '  let ordered=false;',
    '  if(plan.order.length){ DECIDE_ORDER=plan.order.slice(); ordered=true; }',
    '  try{',
    '    await saveRules();',
    '    if(ordered) await saveDecideOrder();',
    '  }catch(_){',
    '    RULES.length=before;',
    '    note.textContent="Could not save those rules, so none were kept.";',
    '    return;',
    '  }',
    '  await renderShelf();',
    '  /* Every number that matters, including the ones that are somebody\'s',
    '     problem: a trait named by the file and absent here is a rule that will',
    '     never bite, and it is worth more said than counted. */',
    '  const bits=[];',
    '  bits.push("Added "+added+" rule"+(added===1?"":"s")+" from "+plan.actions+" restrictions");',
    '  if(already) bits.push(already+" already here");',
    '  if(plan.restrictNothing) bits.push(plan.restrictNothing+" allowed everything and needed no rule");',
    '  if(ordered) bits.push("layers now decide in the order "+DECIDE_ORDER.filter(l=>',
    '    plan.edges.some(e=>e[0]===l||e[1]===l)).join(", "));',
    '  else bits.push("the rules disagree about which layer decides first, so the decide order was left alone");',
    '  const miss=[...new Set(plan.missingTraits)];',
    '  if(miss.length) bits.push(miss.length+" trait"+(miss.length===1?"":"s")+" named by the file "+(miss.length===1?"is":"are")+" not in this project"',
    '    +(miss.length<=6?" ("+miss.join(", ")+")":"")+", so nothing keeps them apart");',
    '  const ml=[...new Set(plan.missingLayers)];',
    '  if(ml.length) bits.push("no layer called "+ml.join(", "));',
    '  if(plan.badOps.length) bits.push(plan.badOps.length+" condition"+(plan.badOps.length===1?"":"s")+" used a test this cannot read and "+(plan.badOps.length===1?"was":"were")+" skipped");',
    '  if(plan.ambiguous.length) bits.push(plan.ambiguous.length+" name"+(plan.ambiguous.length===1?"":"s")+" matched more than one trait and "+(plan.ambiguous.length===1?"was":"were")+" left out");',
    '  note.textContent=bits.join(". ")+".";',
    '  toast("Added "+added+" rule"+(added===1?"":"s"));',
    '};',
    "$('csheet').onclick=()=>drawSheet(12);",
  ]);
  console.log('ok  and the button says exactly what it did and did not do');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines, text }) => {
  for (const id of ['ruleimport', 'rulefile', 'ruleimportnote'])
    if (text.indexOf('id="' + id + '"') < 0) throw new Error('the markup is missing ' + id);
  /* The file input must be hidden and must accept json. */
  if (text.indexOf('<input type="file" id="rulefile" accept="application/json,.json" hidden>') < 0)
    throw new Error('the file input is not the shape this expects');

  const pl = kit.inFunction(codeLines, 'function planRuleImport(docIn, traits){');
  const p = codeLines.slice(pl.start, pl.end + 1).join('\n');
  /* It must not write anything. This is the property that lets it be tested. */
  for (const bad of ['RULES.push', 'saveRules', 'dbPut', 'DECIDE_ORDER=', 'renderShelf'])
    if (p.indexOf(bad) >= 0) throw new Error('planRuleImport changes state: ' + bad);
  /* hide layer forbids everything; only pick from forbids the complement. */
  if (p.indexOf('if(s.action!=="hide layer")') < 0)
    throw new Error('hide layer is not handled as forbidding the whole layer');
  if (p.indexOf('const deny=all.filter(n=>!allow.has(n));') < 0)
    throw new Error('the forbidden set is not the complement of the allowed set');
  /* An action that forbids nothing must not become a rule. */
  if (p.indexOf('if(!deny.length){ out.restrictNothing++; continue; }') < 0)
    throw new Error('an action that restricts nothing would become a group');
  /* Only "is". */
  if (p.indexOf('if(r.operation!=="is")') < 0)
    throw new Error('an operation this cannot read would be imported anyway');
  /* Nothing is invented: a name that does not resolve is recorded, not used. */
  if (p.indexOf('out.missingTraits.push') < 0)
    throw new Error('a name that does not match is not reported');

  const df = kit.inFunction(codeLines, 'function decideOrderFor(edges){');
  const d = codeLines.slice(df.start, df.end + 1).join('\n');
  if (d.indexOf('if(i<0) return [];') < 0)
    throw new Error('a cycle would produce an invented order');
  if (d.indexOf('left.findIndex(l=>indeg.get(l)===0)') < 0)
    throw new Error('the sort is not seeded with the paint order');

  /* The handler merges rather than replacing, and restores on a failed save. */
  if (code.indexOf('if(have.has(id)){ already++; continue; }') < 0)
    throw new Error('the import does not merge with the rules already there');
  if (code.indexOf('RULES=[]') >= 0 && code.indexOf('RULES=[];') >= 0 &&
      code.indexOf('$(\'rulefile\').onchange') >= 0 &&
      code.slice(code.indexOf("$('rulefile').onchange")).indexOf('RULES=[]') >= 0)
    throw new Error('the import clears the existing rules');
  if (code.indexOf('RULES.length=before;') < 0)
    throw new Error('a failed save would leave rules in memory that were never stored');
  /* Nothing matched must not read as success. */
  if (code.indexOf('if(!plan.groups.length){') < 0)
    throw new Error('an import that matched nothing would report success');
});

/* RUN the translation on the real file, because that is the claim. */
{
  const fs = require('fs');
  const F = 'E:/X content/pixel art_/trait-records/trait-combination-rules-v2-20260906/trait-rules-combinations-v2.json';
  const R = JSON.parse(fs.readFileSync(F, 'utf8'));
  /* Stand in for the project: every trait the file mentions, named the way
     bulkImport would name it - the filename without its extension. */
  const nm = n => String(n).replace(/\.(png|jpe?g|webp|gif)$/i, '').trim();
  const traits = [];
  const seen = new Set();
  const add = (l, n) => { const k = l + '/' + nm(n); if (!seen.has(k)) { seen.add(k); traits.push({ kind: 'trait', layer: l, name: nm(n) }); } };
  for (const r of R) { r.trait.forEach(t => add(r.layer, t)); r.thenStatements.forEach(s => s.targetTrait.forEach(t => add(s.targetLayer, t))); }
  if (!traits.length) throw new Error('the file named no traits at all');

  /* The same translation the patch installs, run here on the real data. */
  const low = n => String(n || '').replace(/\.(png|jpe?g|webp|gif)$/i, '').trim().toLowerCase();
  const byLayer = new Map();
  for (const t of traits) {
    if (!byLayer.has(t.layer)) byLayer.set(t.layer, new Map());
    byLayer.get(t.layer).set(low(t.name), t.name);
  }
  let groups = [], actions = 0, none = 0, missing = 0;
  const edges = [];
  for (const r of R) {
    if (r.operation !== 'is') throw new Error('the file uses an operation this run does not cover');
    for (const t of r.trait) {
      const real = byLayer.get(r.layer) && byLayer.get(r.layer).get(low(t));
      if (!real) { missing++; continue; }
      for (const s of r.thenStatements) {
        actions++;
        const all = [...byLayer.get(s.targetLayer).values()];
        const allow = new Set();
        if (s.action !== 'hide layer') for (const a of s.targetTrait) {
          const m = byLayer.get(s.targetLayer).get(low(a)); if (m !== undefined) allow.add(m); else missing++;
        }
        const deny = all.filter(n => !allow.has(n));
        if (!deny.length) { none++; continue; }
        groups.push([r.layer + '/' + real].concat(deny.map(n => s.targetLayer + '/' + n)));
        if (r.layer !== s.targetLayer) edges.push([r.layer, s.targetLayer]);
      }
    }
  }
  /* PROPERTIES, NOT COUNTS. The file is regenerated by its author - it gained
     three conditions and ten traits between two readings the same evening - so
     asserting 121 actions would make this patch fail on a perfectly good file.
     What must hold whatever the file says is asserted; the counts are printed. */
  if (missing) throw new Error(missing + ' names did not resolve against the file\'s own traits');
  if (!actions) throw new Error('the file declared no actions at all');
  if (groups.length + none !== actions)
    throw new Error('every action must become a group or be counted as restricting nothing: '
      + groups.length + ' + ' + none + ' != ' + actions);
  const members = groups.reduce((a, g) => a + g.length, 0);
  if (members <= groups.length)
    throw new Error('every group must hold a condition and at least one forbidden trait');
  /* No group may name two traits that could not otherwise co-occur anyway -
     that is what makes the expansion exact rather than an over-constraint. */
  for (const g of groups) {
    const layers = g.map(k => k.slice(0, k.indexOf('/')));
    const uniq = [...new Set(layers)];
    if (uniq.length !== 2) throw new Error('a group spans ' + uniq.length + ' layers: ' + uniq.join());
    const condLayer = uniq.find(l => layers.filter(x => x === l).length === 1);
    if (!condLayer) throw new Error('a group has no single-trait side, so its direction is unreadable');
  }
  /* And the order really does put every condition before its target. */
  const LAYERS = ['backgrounds', 'skins', 'clothing', 'costumes', 'chains', 'accessories',
    'extras', 'ears', 'mouth', 'eyes', 'hair-headwear', 'masks', 'glasses', 'hair', 'hats', 'unsorted'];
  const indeg = new Map(LAYERS.map(l => [l, 0])), next = new Map(LAYERS.map(l => [l, []]));
  const sig = new Set();
  for (const [a, b] of edges) {
    const s = a + '\u0000' + b; if (sig.has(s)) continue; sig.add(s);
    next.get(a).push(b); indeg.set(b, indeg.get(b) + 1);
  }
  const order = [], left = LAYERS.slice();
  while (left.length) {
    const i = left.findIndex(l => indeg.get(l) === 0);
    if (i < 0) throw new Error('the rules imply a cycle and cannot be ordered');
    const l = left.splice(i, 1)[0]; order.push(l);
    for (const m of next.get(l)) indeg.set(m, indeg.get(m) - 1);
  }
  for (const [a, b] of edges)
    if (order.indexOf(a) > order.indexOf(b))
      throw new Error(a + ' must decide before ' + b + ', and does not');
  if (order.length !== LAYERS.length) throw new Error('the order lost a layer');
  /* The layers with no rule about them must not have moved. */
  const quiet = LAYERS.filter(l => !edges.some(e => e[0] === l || e[1] === l));
  const before = quiet.map(l => LAYERS.indexOf(l)).join();
  const after = quiet.map(l => order.indexOf(l)).join();
  console.log('    ' + actions + ' actions -> ' + groups.length + ' rules, ' + members
    + ' members, ' + none + ' needed none  (' + traits.length + ' traits)');
  console.log('    decide order: ' + order.filter(l => edges.some(e => e[0] === l || e[1] === l)).join(' then '));
  console.log('    layers with no rule about them: ' + quiet.length + (before === after ? ' (none moved)' : ' (MOVED)'));
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
