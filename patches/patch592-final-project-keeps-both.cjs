/* THE FINAL PROJECT KEEPS BOTH, AND THE ADD TILES HAVE THE FIX BUTTON.

   Asked for 2026-09-25, after two people fixed the same hair traits:
   "allow me to put duplicate nemed things in the STFP so i can compare and
   chose from the 2 traits". And: "i want the fix button to be available to
   press from the "add from" traits so i can work on the traits i want to
   add directly".

   KEEPS BOTH. Two traits cannot share a name, layer and status: the local
   id ("t_"+name+"_"+layer+"_"+status), the picture's file name (cloudTail)
   and the server's identity index are all built from those three. So when a
   trait would land in the final project beside one of the same name and
   layer, the one arriving is named "Name (2)" - or the next number free -
   and both are kept. Everywhere the four gestures that can do it go:
   a status change (the shelf chip, the final page's add, the bulk status),
   a layer move (a drag, the final page's layer select), the bulk layer move,
   and a save from the editor. Only the final project: every other status
   still refuses a clash, as it did, because a copy nobody asked for is the
   thing that refusal prevents. A Fix pixels save over the same trait still
   replaces it, as a re-import always has.

   A layer move is two steps: the trait is renamed where it is, through
   setTraitStatus - the one path that carries a new identity to the record,
   its draft, its hidden and picked keys and the group - and then moved as
   itself. The move goes to the server as a layer change by row id
   (reorder_traits), which carries no name; renaming first means the server
   never holds two of one identity.

   THE RULES GO WITH IT. A never-together rule names a trait by layer/name.
   A copy in the final project is a finished alternative, and a copy with no
   rules could be generated beside something it must never appear with. So
   the renamed trait gets the rules and review answers of the name it had:
   a copy of them when another trait still holds that name, and the rules
   themselves (retargetRules, as any rename) when none does.

   THE FIX BUTTON AND THE DOUBLE-CLICK on every tile of the final page, the
   "add from" folds included. patch587 kept them to traits already in the
   final project ("their tiles stay a picture and an Add button"); that is
   superseded by the request above. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };
const swapRun = (lines, to, label) => {
  const i = at(lines[0], label);
  for (let k = 1; k < lines.length; k++) if (L[i + k] !== lines[k]) throw new Error(label + ': line ' + k + ' is ' + JSON.stringify(L[i + k]));
  kit.replace(L, { start: i, end: i + lines.length - 1 }, to);
};

/* The helpers, beside idHolder. */
swap('async function idHolder(id,exceptId){', [
  '/* THE FINAL PROJECT KEEPS BOTH (patch592). Asked for: "allow me to put',
  '   duplicate nemed things in the STFP so i can compare and chose from the 2',
  '   traits". Name, layer and status are the id, the picture\'s file name and',
  '   the server\'s identity, so two of one name cannot both be "X": the one',
  '   arriving is "X (2)", or the next number free. Only this status - every',
  '   other one still refuses a clash. */',
  'const FINAL_KEEPS_BOTH="stfp";',
  '/* "X (2)" colliding again is "X (3)", not "X (2) (2)". */',
  'function copyNameBase(name){ return String(name||"").replace(/ \\(\\d+\\)$/,""); }',
  '/* Free in the final project in every one of `layers` - a layer move',
  '   renames where the trait is and then moves it, so the name has to be free',
  '   at both ends. exceptId is the record being renamed. */',
  'async function finalFreeName(name,layers,exceptId){',
  '  const base=copyNameBase(name);',
  '  for(let n=2;n<10000;n++){',
  '    const cand=base+" ("+n+")";',
  '    let taken=false;',
  '    for(const l of (layers||[])){',
  '      if(await idHolder("t_"+cand+"_"+l+"_"+FINAL_KEEPS_BOTH,exceptId)){ taken=true; break; }',
  '    }',
  '    if(!taken) return cand;',
  '  }',
  '  return null;',
  '}',
  '/* THE RULES OF THE NAME IT HAD, FOR THE COPY. A copy in the final project is',
  '   a finished alternative; with no rules it could be generated beside a',
  '   trait it must never appear with. Every rule naming the old key gains the',
  '   new one, and every answer about the old key is given again about the new',
  '   one - answers first, because applyDecision rebuilds rules from them. */',
  'function copyRules(fromKey,toKey){',
  '  if(!fromKey||!toKey||fromKey===toKey) return 0;',
  '  let n=0;',
  '  const add=[];',
  '  for(const d of DECISIONS){',
  '    if(d.a!==fromKey&&d.b!==fromKey) continue;',
  '    const na=d.a===fromKey?toKey:d.a, nb=d.b===fromKey?toKey:d.b;',
  '    if(na===nb) continue;',
  '    add.push({a:na,b:nb,ok:d.ok,at:d.at,by:d.by,src:d.src});',
  '  }',
  '  if(add.length){ DECISIONS=mergeDecisions(DECISIONS.concat(add),[]); n+=add.length; }',
  '  const next=[];',
  '  let grew=0;',
  '  for(const g of RULES){',
  '    if(g.indexOf(fromKey)>=0&&g.indexOf(toKey)<0){ next.push(ruleGroup(g.concat([toKey]))); grew++; }',
  '    else next.push(g);',
  '  }',
  '  if(grew){ RULES=next; n+=grew; }',
  '  return n;',
  '}',
  '/* A copy when another trait still answers to the old name, a move when',
  '   none does - which is what a rename has always done (retargetRules). */',
  'async function carryRules(fromKey,toKey){',
  '  if(!fromKey||!toKey||fromKey===toKey) return;',
  '  let still=true;',
  '  try{ still=(await dbAll()).some(i=>i&&i.kind==="trait"&&traitKey(i)===fromKey); }catch(_){ still=true; }',
  '  if(still){ if(copyRules(fromKey,toKey)) await saveRules(); }',
  '  else await retargetRules([{from:fromKey,to:toKey}]);',
  '}',
  '/* What each gesture adds to its own sentence when it kept both. */',
  'function keptBothWords(name){ return name ? " - one of that name was already there, so both are kept and this one is "+name : ""; }',
  'async function idHolder(id,exceptId){',
], 'idHolder');

/* setTraitStatus: a free name in the final project, and a rename in place. */
swap('async function setTraitStatus(t,next){', [
  '/* asName (patch592): the same move under a new name, which is how a layer',
  '   move into a final-project layer that has one of this name renames the',
  '   trait where it is before moving it. */',
  'async function setTraitStatus(t,next,asName){',
], 'setTraitStatus');
swap('  if(String(t.status||"wip")===String(next)) return {ok:true, moved:t, shared:null, same:true};', [
  '  if(String(t.status||"wip")===String(next) && !asName) return {ok:true, moved:t, shared:null, same:true};',
], 'setTraitStatus same');
swap('  const moved={...t, id:"t_"+t.name+"_"+t.layer+"_"+next, status:next};', [
  '  let moved={...t, id:"t_"+(asName||t.name)+"_"+t.layer+"_"+next, status:next, name:asName||t.name};',
  '  let renamed=asName||null;',
], 'setTraitStatus moved');
swap('  if(await idHolder(moved.id,t.id)) return {ok:false, clash:true};', [
  '  /* SUPERSEDED FOR THE FINAL PROJECT (patch592): "gold-2 is not what they',
  '     asked for" held until they asked for it - "allow me to put duplicate',
  '     nemed things in the STFP so i can compare". Arriving in the final',
  '     project beside one of the same name and layer, the trait is kept as',
  '     "Name (2)". Every other status still refuses, for the reason above. */',
  '  if(await idHolder(moved.id,t.id)){',
  '    if(String(next)!==FINAL_KEEPS_BOTH || asName) return {ok:false, clash:true};',
  '    const free=await finalFreeName(t.name,[t.layer],t.id);',
  '    if(!free) return {ok:false, clash:true};',
  '    moved={...t, id:"t_"+free+"_"+t.layer+"_"+next, status:next, name:free};',
  '    renamed=free;',
  '  }',
], 'setTraitStatus clash');
swap('  await draftsFollow([{from:t.id, to:moved.id}]);', [
  '  await draftsFollow([{from:t.id, to:moved.id}]);',
  '  /* A new name is a new layer/name, which is what a rule holds. */',
  '  if(renamed) await carryRules(traitKey(t),traitKey(moved));',
], 'setTraitStatus drafts');
swap('  return {ok:true, moved, shared, why};', [
  '  return {ok:true, moved, shared, why, renamed};',
], 'setTraitStatus return');

/* The shelf chip. */
swapRun([
  "        toast((activeWs && !r.shared",
  "          ? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)",
  "          : t.name+' -> '+next)+cloudAlsoOld(r.why)); };",
], [
  "        toast((activeWs && !r.shared",
  "          ? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)",
  "          : t.name+' -> '+next)+keptBothWords(r.renamed)+cloudAlsoOld(r.why)); };",
], 'the chip');

/* The bulk status. */
swap('      else if(r.ok){ changed++; if(activeWs && !r.shared) notShared++; }', [
  '      else if(r.ok){ changed++; if(r.renamed) kept.push(r.renamed); if(activeWs && !r.shared) notShared++; }',
], 'bulk status count');
swap('    if(notShared) bits.push(notShared+" here only - press Save to cloud");', [
  '    if(kept.length) bits.push(kept.length+" kept beside one of the same name: "+kept.slice(0,4).join(", ")',
  '      +(kept.length>4?" and "+(kept.length-4)+" more":""));',
  '    if(notShared) bits.push(notShared+" here only - press Save to cloud");',
], 'bulk status words');
{
  const i = at('  let changed=0, same=0, stale=0, notShared=0;', 'bulk status vars');
  kit.replace(L, { start: i, end: i }, ['  let changed=0, same=0, stale=0, notShared=0;', '  const kept=[];']);
}

/* The final page's add and take-out. */
swap('  const what=t.name+(next==="stfp"?" is in the final project":" is out of the final project");', [
  '  const what=t.name+(next==="stfp"?" is in the final project":" is out of the final project")+keptBothWords(r.renamed);',
], 'finalMove words');

/* A layer move: rename where it is, then move. */
swap('  const moving=items.find(i=>shelfCore.recordKey(i)===String(spec&&spec.recordKey||""));', [
  '  let moving=items.find(i=>shelfCore.recordKey(i)===String(spec&&spec.recordKey||""));',
], 'commitShelfMove moving');
swap('  const plan=shelfCore.planShelfMove(items,spec);', [
  '  let plan=shelfCore.planShelfMove(items,spec);',
  '  /* IN THE FINAL PROJECT BOTH ARE KEPT (patch592). Renamed where it is',
  '     first, through setTraitStatus, then moved as itself: the move reaches',
  '     the group as a layer change by row id, which carries no name. */',
  '  let keptAs=null;',
  '  if(!plan.ok && plan.reason===\'duplicate\' && moving && String(moving.status||"wip")===FINAL_KEEPS_BOTH){',
  '    const free=await finalFreeName(moving.name,[moving.layer,spec.toLayer],moving.id);',
  '    const rr=free ? await setTraitStatus(moving,moving.status,free) : {ok:false};',
  '    if(rr.ok){',
  '      keptAs=free;',
  '      try{ items=await dbAll(); }catch(_){ toast(\'Could not read the project\'); return false; }',
  '      let now=null; try{ now=await dbGet(rr.moved.id); }catch(_){ now=null; }',
  '      moving=now;',
  '      spec=Object.assign({},spec,{recordKey:now?shelfCore.recordKey(now):""});',
  '      plan=shelfCore.planShelfMove(items,spec);',
  '    }',
  '  }',
], 'commitShelfMove plan');
swapRun([
  "  toast(crossed",
  "    ? 'Moved '+(plan.movedName||'the trait')+' to '+plan.destinationLayer",
  "      +(activeWs?' for the group':'')",
  "    : (activeWs?'Order saved for the group':'Order saved'));",
], [
  "  toast(crossed",
  "    ? 'Moved '+(plan.movedName||'the trait')+' to '+plan.destinationLayer",
  "      +(activeWs?' for the group':'')+keptBothWords(keptAs)",
  "    : (activeWs?'Order saved for the group':'Order saved'));",
], 'commitShelfMove words');

/* The bulk layer move. */
swap('    const refused=[];', [
  '    const refused=[];',
  '    const keptBoth=[];',
], 'bulk move vars');
swap('      const plan=shelfCore.planShelfMove(working,{recordKey:key,toLayer,beforeKey:null});', [
  '      let plan=shelfCore.planShelfMove(working,{recordKey:key,toLayer,beforeKey:null});',
  '      /* The final project keeps both (patch592): renamed where it is, then',
  '         planned as itself. The renamed record replaces the old one in both',
  '         lists, so the diff below neither deletes nor re-creates it. */',
  '      if(!plan.ok && plan.reason==="duplicate" && String(rec.status||"wip")===FINAL_KEEPS_BOTH){',
  '        const free=await finalFreeName(rec.name,[rec.layer,toLayer],rec.id);',
  '        const rr=free ? await setTraitStatus(rec,rec.status,free) : {ok:false};',
  '        let now=null;',
  '        if(rr.ok){ try{ now=await dbGet(rr.moved.id); }catch(_){ now=null; } }',
  '        if(now){',
  '          working=working.filter(i=>i.id!==rec.id).concat([now]);',
  '          items=items.filter(i=>i.id!==rec.id).concat([now]);',
  '          keptBoth.push(free);',
  '          plan=shelfCore.planShelfMove(working,{recordKey:shelfCore.recordKey(now),toLayer,beforeKey:null});',
  '        }',
  '      }',
], 'bulk move plan');
swapRun([
  '    toast("Moved "+moved+" trait"+(moved===1?"":"s")+" to "+toLayer',
  '      +(shared&&shared.ok===false ? " here only - the group did not get it" : "")+tail);',
], [
  '    toast("Moved "+moved+" trait"+(moved===1?"":"s")+" to "+toLayer',
  '      +(shared&&shared.ok===false ? " here only - the group did not get it" : "")',
  '      +(keptBoth.length ? " - "+keptBoth.length+" kept beside one of the same name: "+keptBoth.slice(0,4).join(", ")',
  '        +(keptBoth.length>4?" and "+(keptBoth.length-4)+" more":"") : "")+tail);',
], 'bulk move words');

/* The editor save. */
swap("  const name=($('tname').value.trim()||fileName.replace(/\\.png$/,'')||'trait').slice(0,60);", [
  "  let name=($('tname').value.trim()||fileName.replace(/\\.png$/,'')||'trait').slice(0,60);",
], 'save name');
swap("    const id='t_'+name+'_'+layer+'_'+status;", [
  "    let id='t_'+name+'_'+layer+'_'+status;",
], 'save id');
{
  const i = at('    const moved = openWas && openWas.id!==id;', 'save moved');
  const c = at('    const clash=await idHolder(id, openRec&&openRec.id);', 'save clash');
  if (c <= i || c - i > 8) throw new Error('the save clash moved');
  if (L[c + 1] !== '    if(clash){' || L[c + 4] !== '      return false;' || L[c + 5] !== '    }') throw new Error('the save clash block changed: ' + JSON.stringify(L.slice(c, c + 6)));
  const between = L.slice(i + 1, c);
  kit.replace(L, { start: i, end: c + 5 }, [
    ...between,
    '    const clash=await idHolder(id, openRec&&openRec.id);',
    '    /* The final project keeps both (patch592): saved as "Name (2)", and the',
    '       name field says so. */',
    '    let keptAs=null;',
    '    if(clash && status===FINAL_KEEPS_BOTH){',
    '      const free=await finalFreeName(name,[layer],openRec&&openRec.id);',
    "      if(free){ keptAs=free; name=free; id='t_'+free+'_'+layer+'_'+status; rec.name=free; rec.id=id;",
    "        try{ $('tname').value=free; }catch(_){ } }",
    '    }',
    '    if(clash && !keptAs){',
    L[c + 2],
    L[c + 3],
    '      return false;',
    '    }',
    '    /* After the clash, which can give the trait a new id. */',
    '    const moved = openWas && openWas.id!==id;',
  ]);
}
swap('      await retargetRules([{from:traitKey(openWas), to:traitKey(rec)}]);', [
  '      /* A kept copy takes the rules as a copy while another trait still',
  '         answers to its old name (patch592). */',
  '      if(keptAs) await carryRules(traitKey(openWas), traitKey(rec));',
  '      else await retargetRules([{from:traitKey(openWas), to:traitKey(rec)}]);',
], 'save rules');
swap('      toast((shared ? "Saved "+name+" and shared it with the group"', [
  '      toast((shared ? "Saved "+name+" and shared it with the group"+keptBothWords(keptAs)',
], 'save words group');
swap("      toast('Saved '+name+' to '+layer+'/'+status+offGrid+edged);", [
  "      toast('Saved '+name+' to '+layer+'/'+status+keptBothWords(keptAs)+offGrid+edged);",
], 'save words');

/* The fix button and the double-click on every tile of the final page. */
{
  const i = at('  if(String(t.status||"wip")==="stfp"){', 'final tile gate');
  if (L[i - 2] !== '  /* Only on a trait IN the final project, as asked: the "add from" folds') throw new Error('the gate comment moved: ' + L[i - 2]);
  kit.replace(L, { start: i - 2, end: i }, [
    '  /* SUPERSEDED (patch592): "Only on a trait IN the final project, as asked:',
    '     the "add from" folds hold candidates, and their tiles stay a picture',
    '     and an Add button." Then asked: "i want the fix button to be available',
    '     to press from the "add from" traits so i can work on the traits i want',
    '     to add directly". On every tile now, and the double-click with it. */',
    '  {',
  ]);
}

kit.save(doc, ({ code }) => {
  if (code.split('FINAL_KEEPS_BOTH').length - 1 !== 6) throw new Error('FINAL_KEEPS_BOTH: definition and five uses');
  if (code.indexOf('if(await idHolder(moved.id,t.id)) return {ok:false, clash:true};') >= 0) throw new Error('the old refusal is left');
  if (code.split('keptBothWords(').length - 1 !== 6) throw new Error('keptBothWords: definition and five sentences');
});
fs.renameSync(TMP, FILE);
console.log('patch592 written');
