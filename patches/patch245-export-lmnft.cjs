/* Hand the rules back in the format the collection actually launches with.

   "im going to be using LMNFT to launch so were gunna be using their
   peramiters". That settles what this app is in the loop: not the authority,
   a stop on the way. LaunchMyNFT's file goes in, gets edited by people looking
   at pictures, and has to come back OUT in the same format or the editing was
   for nothing - there was no way to get it out at all, so every answer given
   in the review sheet was a dead end for launching.

   THE DIRECTION IS THE HARD PART, and it is why this could not be written
   before the decide order existed.

   A rule here is symmetric: "at most one of these". A LaunchMyNFT rule is not
   - it names a CONDITION trait and a TARGET layer, and the target is the side
   that gets re-picked when both are drawn. So exporting {hats/cap, hair/bob}
   as "hats is cap -> hair only pick from [everything but bob]" and as "hair is
   bob -> hats only pick from [everything but cap]" forbid the same pair but
   produce different collections: one drops the hair, the other drops the hat.

   DECIDE_ORDER already holds that answer. The layer decided EARLIER is the one
   that wins an argument here, and LaunchMyNFT re-picks the target - so the
   earlier layer is the condition and the later one is the target. A file
   exported this way generates the same shape there as here, which is the whole
   point of being able to check it here first.

   MULTI-LAYER GROUPS decompose. A group spanning three layers cannot be one
   condition and one target, so every PAIR inside it is placed on its own and
   the pairs are gathered by (condition trait, target layer). The import only
   ever builds two-layer groups; a hand-made one can be wider, and this handles
   it rather than refusing or guessing.

   AN ACTION THAT FORBIDS EVERYTHING becomes "hide layer" rather than an empty
   allow-list, because that is what LaunchMyNFT's own engine reads - an empty
   "only pick from" is a rule that can never be satisfied, and their validator
   rejects it.

   THE EXTENSION. Traits here are named without one; the file names files. The
   import strips .png, this puts it back, and the READ ME for the real export
   says exact filenames must match the upload folders. A collection of .jpg
   would round-trip wrong, and the upload folder is entirely PNG - said here
   rather than discovered later.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('exportRules') >= 0) throw new Error('already patched');
if (doc.original.indexOf('function decideOrder(){') < 0)
  throw new Error('the decide order has to exist - it is what gives a rule its direction');

/* ---- 1. the button, beside the one that reads them in ---- */
{
  const at = kit.only(doc.lines,
    l => l.indexOf('id="ruleimport"') >= 0, 'the import button');
  /* The row holds one button; make it two. */
  const row = kit.run(doc.lines,
    l => l === '    <div class="olrow" style="margin-top:6px">',
    l => l === '    </div>',
    'the import row',
    { start: at - 2, end: at + 4 });
  const body = doc.lines.slice(row.start, row.end + 1).join('\n');
  if (body.indexOf('Import rules from a file') < 0)
    throw new Error('the import row is not the one this expects');
  kit.replace(doc.lines, { start: row.end, end: row.end }, [
    '      <button class="mini" id="ruleexport"',
    '        title="Write the rules back out as a LaunchMyNFT rules file, including everything answered here. Import it there with Rules > Import Rules.">Download for LaunchMyNFT</button>',
    '    </div>',
  ]);
  console.log('ok  a button beside the one that reads them in');
}

/* ---- 2. turning symmetric groups back into directional rules ---- */
{
  /* Anchored on the FIRST line of the comment above ruleImportName, not on an
     offset from the function. The first attempt used `at - 5` on a guess at the
     comment's length, landed in the middle of it, and turned prose into code -
     kit.save's parse refused the file before it was written, which is what that
     check is for. Never count lines you have not read. */
  const at = kit.only(doc.lines,
    l => l === '/* A trait name as the rules file writes it, reduced to something that can be',
    'the comment above the name reducer');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* THE RULES, AS LAUNCHMYNFT READS THEM.',
    '',
    '   The inverse of planRuleImport, and the direction is the whole difficulty.',
    '   A group here says "at most one of these" and says nothing about which one',
    '   gives way; a LaunchMyNFT rule names a condition and a target, and the',
    '   TARGET is what gets re-picked. DECIDE_ORDER holds that answer already -',
    '   the layer decided earlier wins here, so it is the condition there.',
    '',
    '   Every PAIR is placed separately and then gathered by (condition, target',
    '   layer), so a group spanning three layers - which the import never builds',
    '   but a hand-made rule can - comes out as several correct rules rather than',
    '   one wrong one. */',
    'function exportRules(traits){',
    '  const byLayer=new Map();',
    '  for(const t of (traits||[])){',
    '    if(!t||t.kind!=="trait") continue;',
    '    const l=t.layer||"unsorted";',
    '    if(!byLayer.has(l)) byLayer.set(l,[]);',
    '    if(byLayer.get(l).indexOf(t.name)<0) byLayer.get(l).push(t.name);',
    '  }',
    '  for(const [,v] of byLayer) v.sort();',
    '  const order=decideOrder();',
    '  const rank=l=>{ const i=order.indexOf(l); return i<0?order.length:i; };',
    '  const split=k=>({layer:k.slice(0,k.indexOf("/")), name:k.slice(k.indexOf("/")+1)});',
    '  /* condition trait -> target layer -> the traits it forbids there. */',
    '  const forbid=new Map();',
    '  let crossed=0;',
    '  for(const g of RULES){',
    '    for(let i=0;i<g.length;i++) for(let j=i+1;j<g.length;j++){',
    '      const A=split(g[i]), B=split(g[j]);',
    '      /* Two traits on ONE layer can never both be drawn, so a rule about',
    '         them is not a rule LaunchMyNFT needs - and expressing it would make',
    '         a layer forbid itself. */',
    '      if(A.layer===B.layer) continue;',
    '      const cond = rank(A.layer)<=rank(B.layer) ? A : B;',
    '      const targ = cond===A ? B : A;',
    '      crossed++;',
    '      const ck=cond.layer+"/"+cond.name;',
    '      if(!forbid.has(ck)) forbid.set(ck,new Map());',
    '      const m=forbid.get(ck);',
    '      if(!m.has(targ.layer)) m.set(targ.layer,new Set());',
    '      m.get(targ.layer).add(targ.name);',
    '    }',
    '  }',
    '  const out=[], missing=[];',
    '  for(const [ck,m] of [...forbid.entries()].sort((a,b)=>a[0]<b[0]?-1:1)){',
    '    const c=split(ck);',
    '    if(!byLayer.has(c.layer)||byLayer.get(c.layer).indexOf(c.name)<0){ missing.push(ck); continue; }',
    '    const then=[];',
    '    for(const [tl,set] of [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1)){',
    '      const all=byLayer.get(tl)||[];',
    '      const allowed=all.filter(n=>!set.has(n));',
    '      /* An empty allow-list is a rule that can never be satisfied, and their',
    '         validator says so. "hide layer" is how that is written there. */',
    '      then.push(allowed.length',
    '        ? {action:"only pick from", targetLayer:tl, targetTrait:allowed.map(n=>n+".png")}',
    '        : {action:"hide layer", targetLayer:tl, targetTrait:[]});',
    '    }',
    '    if(then.length) out.push({layer:c.layer, operation:"is", trait:[c.name+".png"], thenStatements:then});',
    '  }',
    '  return {rules:out, pairs:crossed, missing:missing};',
    '}',
    '/* A trait name as the rules file writes it, reduced to something that can be',
  ]);
  console.log('ok  and symmetric groups become directional rules, by decide order');
}

/* ---- 3. wired, and it says what it wrote ---- */
{
  const at = kit.only(doc.lines, l => l === "$('revopen').onclick=()=>revOpen(true);", 'the review wiring');
  kit.replace(doc.lines, { start: at, end: at }, [
    "$('ruleexport').onclick=async()=>{",
    '  const note=$("ruleimportnote"); note.hidden=false;',
    '  let items=[]; try{ items=await dbAll(); }catch(_){ }',
    '  const r=exportRules(items.filter(i=>i.kind==="trait"));',
    '  if(!r.rules.length){',
    '    note.textContent=RULES.length',
    '      ? "Nothing to write out - every rule names a trait this project no longer has."',
    '      : "No rules yet. Import a file or answer some pairs first.";',
    '    return;',
    '  }',
    '  const b=new Blob([JSON.stringify(r.rules,null,2)],{type:"application/json"});',
    '  const u=URL.createObjectURL(b), a=document.createElement("a");',
    '  a.href=u; a.download="trait-rules-from-chatnft.json";',
    '  document.body.appendChild(a); a.click(); a.remove();',
    '  setTimeout(()=>URL.revokeObjectURL(u),1000);',
    '  /* What it wrote, in the terms of the thing it wrote it for. A conditions',
    '     count is what LaunchMyNFT shows on import, so it is what to compare. */',
    '  const bits=[r.rules.length+" condition"+(r.rules.length===1?"":"s")+" written from "+RULES.length+" rule"+(RULES.length===1?"":"s")];',
    '  bits.push("import it with Rules > Import Rules, which REPLACES the rule list there");',
    '  if(r.missing.length) bits.push(r.missing.length+" rule"+(r.missing.length===1?"":"s")+" named a trait this project no longer has and "+(r.missing.length===1?"was":"were")+" left out");',
    '  note.textContent=bits.join(". ")+".";',
    '  toast("Wrote "+r.rules.length+" conditions");',
    '};',
    "$('revopen').onclick=()=>revOpen(true);",
  ]);
  console.log('ok  wired, and it says what it wrote in their terms');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines, text }) => {
  if (text.indexOf('id="ruleexport"') < 0) throw new Error('there is no way to ask for it');
  const ex = kit.inFunction(codeLines, 'function exportRules(traits){');
  const e = codeLines.slice(ex.start, ex.end + 1).join('\n');
  /* The direction comes from the decide order, not from the group's shape. */
  if (e.indexOf('const order=decideOrder();') < 0)
    throw new Error('the export invents a direction instead of reading the one in force');
  if (e.indexOf('rank(A.layer)<=rank(B.layer) ? A : B') < 0)
    throw new Error('the condition is not the layer that decides first');
  /* Same-layer pairs are not rules there. */
  if (e.indexOf('if(A.layer===B.layer) continue;') < 0)
    throw new Error('a layer could be made to forbid itself');
  /* An empty allow-list must be written as a hide. */
  if (e.indexOf('{action:"hide layer", targetLayer:tl, targetTrait:[]}') < 0)
    throw new Error('an unsatisfiable empty allow-list would be written');
  /* Filenames, not names. */
  if (e.indexOf('n+".png"') < 0 || e.indexOf('c.name+".png"') < 0)
    throw new Error('the export writes names where the format wants filenames');
  /* It must not write anything. */
  for (const bad of ['RULES.push', 'RULES=', 'dbPut', 'saveRules'])
    if (e.indexOf(bad) >= 0) throw new Error('exportRules changes state: ' + bad);
  /* A rule naming a trait that is gone is reported, not written. */
  if (e.indexOf('missing.push(ck)') < 0)
    throw new Error('a rule about a missing trait would be written out silently');
  /* And the button says what importing it will do THERE. */
  if (code.indexOf('REPLACES the rule list there') < 0)
    throw new Error('nothing warns that importing there replaces the list');
});

/* RUN the round trip: rules -> file -> the same forbidden pairs. */
{
  const LAYERS = ['skins', 'costumes', 'hats', 'hair', 'glasses'];
  const decide = ['skins', 'costumes', 'hats', 'hair', 'glasses'];
  const traits = [];
  const add = (l, ns) => ns.forEach(n => traits.push({ kind: 'trait', layer: l, name: n }));
  add('hats', ['cap', 'beret']);
  add('hair', ['bob', 'curls', 'mop']);
  add('glasses', ['specs']);
  add('costumes', ['onesie']);
  /* A two-layer group the import would build, a hide, and a hand-made
     three-layer one that has to decompose. */
  const RULES = [
    ['hats/cap', 'hair/curls', 'hair/mop'],
    ['hair/bob', 'hair/curls', 'hair/mop', 'hats/beret'],
    ['costumes/onesie', 'hats/cap', 'glasses/specs'],
  ];
  const byLayer = new Map();
  for (const t of traits) {
    if (!byLayer.has(t.layer)) byLayer.set(t.layer, []);
    byLayer.get(t.layer).push(t.name);
  }
  for (const [, v] of byLayer) v.sort();
  const rank = l => { const i = decide.indexOf(l); return i < 0 ? decide.length : i; };
  const split = k => ({ layer: k.slice(0, k.indexOf('/')), name: k.slice(k.indexOf('/') + 1) });
  const forbid = new Map();
  for (const g of RULES) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const A = split(g[i]), B = split(g[j]);
      if (A.layer === B.layer) continue;
      const cond = rank(A.layer) <= rank(B.layer) ? A : B;
      const targ = cond === A ? B : A;
      const ck = cond.layer + '/' + cond.name;
      if (!forbid.has(ck)) forbid.set(ck, new Map());
      const m = forbid.get(ck);
      if (!m.has(targ.layer)) m.set(targ.layer, new Set());
      m.get(targ.layer).add(targ.name);
    }
  }
  const out = [];
  for (const [ck, m] of forbid) {
    const c = split(ck), then = [];
    for (const [tl, set] of m) {
      const all = byLayer.get(tl) || [];
      const allowed = all.filter(n => !set.has(n));
      then.push(allowed.length
        ? { action: 'only pick from', targetLayer: tl, targetTrait: allowed.map(n => n + '.png') }
        : { action: 'hide layer', targetLayer: tl, targetTrait: [] });
    }
    out.push({ layer: c.layer, operation: 'is', trait: [c.name + '.png'], thenStatements: then });
  }
  /* Read it back the way the import does, and compare the forbidden pairs. */
  const back = new Set();
  for (const r of out) for (const s of r.thenStatements) {
    const all = byLayer.get(s.targetLayer) || [];
    const allow = new Set((s.targetTrait || []).map(n => n.replace(/\.png$/, '')));
    const deny = s.action === 'hide layer' ? all : all.filter(n => !allow.has(n));
    for (const n of deny) {
      const a = r.layer + '/' + r.trait[0].replace(/\.png$/, ''), b = s.targetLayer + '/' + n;
      back.add(a < b ? a + '|' + b : b + '|' + a);
    }
  }
  const want = new Set();
  for (const g of RULES) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const A = split(g[i]), B = split(g[j]);
    if (A.layer === B.layer) continue;
    const a = g[i], b = g[j];
    want.add(a < b ? a + '|' + b : b + '|' + a);
  }
  const lost = [...want].filter(p => !back.has(p));
  const gained = [...back].filter(p => !want.has(p));
  if (lost.length) throw new Error('the round trip lost: ' + lost.join(', '));
  if (gained.length) throw new Error('the round trip invented: ' + gained.join(', '));
  /* The hide really is a hide, not an empty list. */
  const beret = out.find(r => r.trait[0] === 'beret.png');
  if (!beret || beret.thenStatements[0].action !== 'hide layer')
    throw new Error('a rule forbidding a whole layer was not written as hide layer');
  /* And the direction follows the decide order: the hat is the condition. */
  const cap = out.find(r => r.trait[0] === 'cap.png');
  if (!cap || cap.layer !== 'hats')
    throw new Error('the condition is not the layer that decides first');
  if (!out.find(r => r.layer === 'costumes'))
    throw new Error('the costume, which decides before both, is not the condition of its rule');
  console.log('    ' + out.length + ' conditions from ' + RULES.length + ' rules, '
    + want.size + ' forbidden pairs in and ' + back.size + ' back out, none lost or invented');
  console.log('    the whole-layer rule is written as hide layer, and hats condition hair');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
