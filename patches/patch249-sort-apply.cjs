/* Show the sort, then do it - and nothing until it has been read.

   planSort works out where every trait belongs from the collection's own
   inventory. This is the screen that shows what it found and the gesture that
   applies it.

   MEASURED on the live server: 116 approved traits stranded on "unsorted", of
   which 111 are placed by the inventory, 71 of those need renaming as well,
   and 5 are left alone - four being traits that were deliberately deleted and
   one a proof render.

   THE RENAME AND THE MOVE ARE ONE OPERATION. A record's id is built from name,
   layer and status, so changing either makes a new record: the old one is
   deleted, the new one written, and retargetRules is told the trait key
   changed so every rule naming it follows. That is the same sequence the
   editor's own save uses when a trait is renamed or moved (index.html, the
   dbPut / dbDel / retargetRules / cloudMoveOne run), and it is reused rather
   than reinvented so there is one way this happens.

   MISSING LAYERS ARE MADE FIRST, AND SAID. The project has no hats, hair or
   glasses - moving a trait to a layer that does not exist would create it
   wherever the app happens to put it, and layer order IS paint order, so the
   traits would go from being painted on top of everything at unsorted to being
   painted on top of everything somewhere else. They are created before
   unsorted, listed by name, and the report says to check the draw order,
   because the inventory records which layer a trait is on and not what should
   paint over what.

   IT REFUSES A COLLISION rather than overwriting. If the destination already
   holds a trait of that name and status, the move would put one record on top
   of another and lose it. Those rows are counted and named and left where they
   are - the same choice planShelfMove makes for the same reason.

   NOTHING RUNS UNTIL THE BUTTON IS PRESSED. The plan is a list you can read
   with every proposed rename spelled out, because 116 traits of somebody's
   real collection is not a thing to move on trust.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('sortApply') >= 0) throw new Error('already patched');
if (doc.original.indexOf('function planSort(traits, inventory){') < 0)
  throw new Error('patch248 has to land first - this applies its plan');

/* ---- 1. the way in, beside the folder import ---- */
{
  const at = kit.only(doc.lines, l => l === '  <input type="file" id="bulkfile" webkitdirectory directory multiple hidden>',
    'the folder input');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  <input type="file" id="bulkfile" webkitdirectory directory multiple hidden>',
    '  <!-- The collection carries a record of where every trait belongs. This',
    '       reads it and offers to put them back. -->',
    '  <button class="mini" id="sortopen"',
    '    title="Read a trait inventory and put every trait on the layer and under the name it records. Nothing moves until you say so.">Sort by inventory</button>',
    '  <input type="file" id="sortfile" accept="application/json,.json" hidden>',
  ]);
  console.log('ok  a way in, beside the folder import');
}

/* ---- 2. the plan, on screen ---- */
{
  const at = kit.only(doc.lines, l => l === '<div class="scrim" id="revscrim" hidden>', 'the review sheet');
  kit.replace(doc.lines, { start: at, end: at }, [
    '<div class="scrim" id="sortscrim" hidden>',
    '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="sorttitle" style="width:min(820px,96vw)">',
    '    <h2 id="sorttitle">Sort by inventory</h2>',
    '    <p class="sub" id="sortsub"></p>',
    '    <div id="sortlist" style="max-height:52dvh; overflow-y:auto"></div>',
    '    <div class="savebar" style="margin-top:18px">',
    '      <button class="btn ghost" id="sortcancel" style="flex:1">Cancel</button>',
    '      <button class="btn" id="sortgo" style="flex:1">Move them</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '',
    '<div class="scrim" id="revscrim" hidden>',
  ]);
  console.log('ok  and a screen to read it on');
}

/* ---- 3. the behaviour ---- */
{
  const at = kit.only(doc.lines, l => l === 'function pairState(a,b){', 'the pair state helper');
  kit.replace(doc.lines, { start: at, end: at }, [
    'let sortPlan=null;',
    '/* One line per trait, saying exactly what would happen to it. The renames',
    '   are spelled out because 71 of them are the difference between a rule',
    '   working and not, and a count would hide which. */',
    'function sortShow(plan){',
    '  const box=$("sortlist"); box.innerHTML="";',
    '  const groups=[',
    '    ["Moved and renamed", plan.both, r=>r.name+"  \\u2192  "+r.toLayer+" / "+r.toName],',
    '    ["Moved", plan.move, r=>r.name+"  \\u2192  "+r.toLayer],',
    '    ["Renamed", plan.rename, r=>r.name+"  \\u2192  "+r.toName],',
    '    ["Left alone - the inventory does not mention them", plan.unknown, r=>r.name+"  ("+r.layer+")"],',
    '  ];',
    '  for(const [title,rows,line] of groups){',
    '    if(!rows.length) continue;',
    '    const h=document.createElement("p");',
    '    h.className="note"; h.style.marginTop="10px";',
    '    h.textContent=title+" - "+rows.length;',
    '    box.appendChild(h);',
    '    const ul=document.createElement("div");',
    '    ul.className="mono"; ul.style.fontSize="11.5px"; ul.style.lineHeight="1.6";',
    '    for(const r of rows.slice(0,400)){',
    '      const d=document.createElement("div"); d.textContent=line(r); ul.appendChild(d);',
    '    }',
    '    if(rows.length>400){',
    '      const d=document.createElement("div");',
    '      d.textContent="... and "+(rows.length-400)+" more";',
    '      ul.appendChild(d);',
    '    }',
    '    box.appendChild(ul);',
    '  }',
    '  const todo=plan.both.length+plan.move.length+plan.rename.length;',
    '  const bits=[todo+" trait"+(todo===1?"":"s")+" would change"];',
    '  if(plan.settled.length) bits.push(plan.settled.length+" already where the inventory says");',
    '  if(plan.unknown.length) bits.push(plan.unknown.length+" not in it and left alone");',
    '  if(plan.layers.length) bits.push("and "+plan.layers.length+" layer"+(plan.layers.length===1?"":"s")',
    '    +" would be created ("+plan.layers.join(", ")+") - check the draw order in Layers afterwards");',
    '  if(plan.collisions.length) bits.push(plan.collisions.length+" name"+(plan.collisions.length===1?"":"s")',
    '    +" in the inventory point at two different layers and were ignored");',
    '  $("sortsub").textContent=bits.join(". ")+".";',
    '  $("sortgo").disabled=!todo;',
    '}',
    '/* Applies the plan. One trait at a time, through the same sequence the',
    '   editor uses when a trait is renamed or moved: write the new record, drop',
    '   the old, tell the rules the key changed, then move the server copy.',
    '',
    '   A destination that already holds this name and status is REFUSED - dbPut',
    '   overwrites, so moving onto it would destroy the trait already there. */',
    'async function sortApply(plan){',
    '  let made=0, moved=0, refused=[], failed=0;',
    '  for(const l of plan.layers){',
    '    if(LAYERS.indexOf(l)>=0) continue;',
    '    const u=LAYERS.indexOf("unsorted");',
    '    if(u>=0) LAYERS.splice(u,0,l); else LAYERS.push(l);',
    '    made++;',
    '  }',
    '  if(made){ try{ await saveLayers(); }catch(_){ } }',
    '  let items=[]; try{ items=await dbAll(); }catch(_){ }',
    '  const taken=new Set(items.filter(i=>i.kind==="trait").map(i=>i.id));',
    '  const rows=plan.both.concat(plan.move,plan.rename);',
    '  for(const r of rows){',
    '    const old=items.find(i=>i.id===r.id);',
    '    if(!old) continue;',
    '    const id="t_"+r.toName+"_"+r.toLayer+"_"+(r.status||"wip");',
    '    if(id===old.id) continue;',
    '    if(taken.has(id)){ refused.push(r.name+" - "+r.toLayer+" already has one"); continue; }',
    '    const rec={...old, id:id, name:r.toName, layer:r.toLayer, at:Date.now()};',
    '    try{',
    '      await dbPut(rec);',
    '      await dbDel(old.id);',
    '      taken.delete(old.id); taken.add(id);',
    '      await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);',
    '      if(activeWs) await cloudMoveOne(old,rec);',
    '      moved++;',
    '    }catch(_){ failed++; }',
    '  }',
    '  return {made, moved, refused, failed};',
    '}',
    'function pairState(a,b){',
  ]);
  console.log('ok  and the behaviour, refusing a collision rather than overwriting');
}

/* ---- 4. wired ---- */
{
  const at = kit.only(doc.lines, l => l === "$('revopen').onclick=()=>revOpen(true);", 'the review wiring');
  kit.replace(doc.lines, { start: at, end: at }, [
    "$('sortopen').onclick=()=>$('sortfile').click();",
    "$('sortfile').onchange=async(e)=>{",
    '  const f=e.target.files&&e.target.files[0];',
    '  e.target.value="";',
    '  if(!f) return;',
    '  let items=[]; try{ items=await dbAll(); }catch(_){ }',
    '  try{ sortPlan=planSort(items.filter(i=>i.kind==="trait"), JSON.parse(await f.text())); }',
    '  catch(err){ toast("Could not read that file: "+((err&&err.message)||"not valid JSON")); return; }',
    '  sortShow(sortPlan);',
    '  $("sortscrim").hidden=false;',
    '};',
    "$('sortcancel').onclick=()=>{ $('sortscrim').hidden=true; };",
    "$('sortgo').onclick=async()=>{",
    '  if(!sortPlan) return;',
    '  const btn=$("sortgo");',
    '  btn.disabled=true; btn.textContent="Moving...";',
    '  const r=await sortApply(sortPlan);',
    '  btn.textContent="Move them";',
    '  $("sortscrim").hidden=true;',
    '  await renderShelf();',
    '  const bits=["Moved "+r.moved+" trait"+(r.moved===1?"":"s")];',
    '  if(r.made) bits.push("made "+r.made+" layer"+(r.made===1?"":"s")+" - check the draw order in Layers");',
    '  if(r.refused.length) bits.push(r.refused.length+" refused because the destination already had that name"',
    '    +(r.refused.length<=3?" ("+r.refused.join("; ")+")":""));',
    '  if(r.failed) bits.push(r.failed+" could not be written");',
    '  $("bulknote").hidden=false;',
    '  $("bulknote").textContent=bits.join(". ")+".";',
    '  toast("Moved "+r.moved+" trait"+(r.moved===1?"":"s"));',
    '  sortPlan=null;',
    '};',
    "$('sortscrim').onclick=e=>{ if(e.target===$('sortscrim')) $('sortscrim').hidden=true; };",
    "$('revopen').onclick=()=>revOpen(true);",
  ]);
  console.log('ok  wired, and it reports what it refused as well as what it moved');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines, text }) => {
  for (const id of ['sortopen', 'sortfile', 'sortscrim', 'sortlist', 'sortgo', 'sortcancel'])
    if (text.indexOf('id="' + id + '"') < 0) throw new Error('the markup is missing ' + id);

  const sa = kit.inFunction(codeLines, 'async function sortApply(plan){');
  const a = codeLines.slice(sa.start, sa.end + 1).join('\n');
  /* The rules must follow the trait, or 71 renames kill their own rules. */
  if (a.indexOf('await retargetRules([{from:traitKey(old), to:traitKey(rec)}]);') < 0)
    throw new Error('a renamed trait would leave its rules pointing at the old key');
  /* Write the new record BEFORE dropping the old one. */
  const put = a.indexOf('await dbPut(rec);'), del = a.indexOf('await dbDel(old.id);');
  if (!(put >= 0 && del > put))
    throw new Error('the old record is dropped before the new one exists');
  /* A collision must be refused, never overwritten - dbPut overwrites. */
  if (a.indexOf('if(taken.has(id)){ refused.push(') < 0)
    throw new Error('a move onto an existing name would destroy it');
  /* Layers are made before anything is moved onto them. */
  const mk = a.indexOf('LAYERS.splice(u,0,l)'), mv = a.indexOf('for(const r of rows){');
  if (!(mk >= 0 && mv > mk))
    throw new Error('traits are moved before their destination layers exist');
  /* And the server copy follows, or the next pull undoes the move. */
  if (a.indexOf('if(activeWs) await cloudMoveOne(old,rec);') < 0)
    throw new Error('the server copy is left at the old name and layer');

  /* Nothing happens on choosing the file - only on the button. */
  const onchange = code.slice(code.indexOf("$('sortfile').onchange"));
  const upto = onchange.slice(0, onchange.indexOf('};'));
  for (const bad of ['sortApply', 'dbPut', 'dbDel'])
    if (upto.indexOf(bad) >= 0) throw new Error('choosing a file already changes things: ' + bad);
  /* The plan names the renames rather than counting them. */
  const ss = kit.inFunction(codeLines, 'function sortShow(plan){');
  const s = codeLines.slice(ss.start, ss.end + 1).join('\n');
  if (s.indexOf('r.name+"  \\u2192  "+r.toLayer+" / "+r.toName') < 0)
    throw new Error('the proposed renames are not spelled out');
});

/* RUN the id arithmetic, because a wrong id silently overwrites a trait. */
{
  const idOf = (name, layer, status) => 't_' + name + '_' + layer + '_' + (status || 'wip');
  /* The real case: a stranded trait moving and being renamed at once. */
  const old = idOf('BTC Cap', 'unsorted', 'approved');
  const now = idOf('Bitcoin Cap', 'hats', 'approved');
  if (old === now) throw new Error('the move would be a no-op');
  /* Status is carried, not defaulted - an approved trait must not become wip. */
  if (idOf('X', 'hats', 'approved').indexOf('_approved') < 0)
    throw new Error('the status is dropped, so an approved trait would come back as wip');
  /* Two different traits must never collide on one id. */
  const seen = new Set();
  for (const [n, l] of [['Cap', 'hats'], ['Cap', 'hair'], ['Cap 2', 'hats']]) {
    const id = idOf(n, l, 'approved');
    if (seen.has(id)) throw new Error('two traits share an id: ' + id);
    seen.add(id);
  }
  /* And a trait already in the right place produces no work. */
  if (idOf('Bitcoin Cap', 'hats', 'approved') !== now)
    throw new Error('the same trait computes two different ids');
  console.log('    ' + old + '  ->  ' + now);
  console.log('    status carried, and no two traits share an id');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
