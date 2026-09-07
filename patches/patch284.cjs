/* PLAN RARITY, part two: the section, and getting a weight change to the group.

   A WEIGHT CHANGE NEVER REACHED ANYBODY, AND THE APP SAID IT HAD. cloudPath is
   team/collection/kind-name-layer-status.png and carries no weight, so after
   `dbPut({...t, rarity:v})` - which spreads `synced` and `path` through - the
   record still satisfies cloudPush's skip test:

     if(it.synced && it.rowId && it.path===p){ unchangedSkipped++; ... }

   and the push reported it "already up to date". That is a live defect in the
   number box on the shelf tile today, and a planning section that moves many
   weights at once would have made it much worse.

   THE FIX IS A METADATA PATCH, NOT AN UNSYNC. cloudSyncOne re-uploads the PNG
   and then DELETEs and re-POSTs the row, so clearing `synced` on a weight
   change would re-upload the whole collection - about a gigabyte here - to
   change 271 integers. The live policy on traits is `traits_team` for ALL
   commands, so PATCH /rest/v1/traits?id=eq.<rowId> with {rarity} is allowed,
   touches no storage, and the traits_touch trigger bumps updated_at so
   teammates see it. Verified against the live database, not the migration
   history, which does not describe it.

   `synced` is KEPT when the PATCH succeeds - the server has the right bytes
   and the right number, which is what synced means - and cleared only when it
   fails, where the expensive re-upload is the honest price of a row that
   really is out of date. */
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

swap('function planRows(items,layer,wip){' + NL
  + '  return (items||[]).filter(t=>t.kind==="trait" && (t.layer||"unsorted")===layer' + NL
  + '    && traitEligible(t,wip));' + NL + '}', block([
  'function planRows(items,layer,wip){',
  '  return (items||[]).filter(t=>t.kind==="trait" && (t.layer||"unsorted")===layer',
  '    && traitEligible(t,wip));',
  '}',
  '',
  '/* Send one weight to the group without re-sending the picture.',
  '',
  '   cloudSyncOne uploads the PNG and then DELETEs and re-POSTs the row, which',
  '   is right when the artwork changed and absurd for an integer: planning a',
  '   whole collection would re-upload about a gigabyte to change 271 numbers.',
  '   The live policy on traits covers ALL commands, so a PATCH by row id is',
  '   allowed and touches no storage.',
  '',
  '   Returns false when there is nobody to tell - no group, or a record that',
  '   has never been pushed and therefore has no row to patch. The caller reads',
  '   that as "still local", not as a failure. */',
  'async function cloudRarity(rec){',
  '  if(!activeWs || !rec || !rec.rowId) return false;',
  '  try{',
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(!h) return false;',
  '    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
  '      {method:"PATCH", headers:h, body:JSON.stringify({rarity:rec.rarity})});',
  '    return !!(r&&r.ok);',
  '  }catch(_){ return false; }',
  '}',
  '',
  '/* Write one weight, locally and to the group.',
  '',
  '   `synced` is kept when the patch lands, because it is still true: the',
  '   server has this record\'s bytes and now its number. It is cleared only',
  '   when the patch could not be made, where the next push re-sending the',
  '   picture is the honest cost of a row that really is behind - and where',
  '   leaving it set would be the app saying the group had something it does',
  '   not, which is the defect this whole function exists to end. */',
  'async function setRarity(rec,w){',
  '  if(!rec) return false;',
  '  /* RAR_UNSET passes through rather than clamping up to RAR_MIN. Typing 1',
  '     into the box on a tile is how a trait is put back to "nobody has',
  '     chosen", and a clamp would silently answer 2 - a weight, and a claim',
  '     that somebody had decided. The sliders never ask for it: weightForShare',
  '     cannot return below RAR_MIN. */',
  '  const v = Math.round(w)===RAR_UNSET ? RAR_UNSET',
  '    : Math.max(RAR_MIN,Math.min(RAR_MAX,Math.round(w)||RAR_NORMAL));',
  '  /* Against the EFFECTIVE stored value, so a record with no rarity field at',
  '     all is already 1 and setting it to 1 writes nothing. Comparing',
  '     traitWeight alone would have called every no-op a change. */',
  '  const cur = typeof rec.rarity==="number" ? rec.rarity : RAR_UNSET;',
  '  if(cur===v) return false;',
  '  const next={...rec, rarity:v};',
  '  await dbPut(next);',
  '  const sent=await cloudRarity(next);',
  '  if(!sent && activeWs && next.rowId && next.synced) await dbPut({...next, synced:false});',
  '  return true;',
  '}',
  '',
  '/* ---- the section ------------------------------------------------- */',
  '/* Rebuilt from the records every time, like every other panel here. It',
  '   decodes no images and runs no generator, so it is cheap enough to redraw',
  '   on a commit - which is why the numbers cannot go stale against the store',
  '   the way a hand-patched DOM would. */',
  'function renderPlan(items){',
  '  const sec=$("plan"); if(!sec) return;',
  '  const wip=!!($("cwip")&&$("cwip").checked);',
  '  const body=$("planbody"); if(!body) return;',
  '  const groups=[];',
  '  let planned=0, unplanned=0;',
  '  /* Front of the drawing first, the same order the Layers panel shows. */',
  '  for(let i=LAYERS.length-1;i>=0;i--){',
  '    const layer=LAYERS[i];',
  '    const rows=planRows(items,layer,wip);',
  '    if(!rows.length) continue;',
  '    const off=HIDDEN_LAYERS.has(layer);',
  '    /* A set that is turned off is not drawn, so nothing in it can be',
  '       missing from the plan - the same population rule the shares use. It',
  '       is still shown, because planning a set before turning it on is a',
  '       reasonable thing to do and hiding it would look like data loss. */',
  '    if(!off) for(const t of rows){ if(rarityPlanned(t)) planned++; else unplanned++; }',
  '    groups.push({layer:layer, rows:rows, off:off});',
  '  }',
  '  if(!groups.length){ sec.hidden=true; return; }',
  '  sec.hidden=false;',
  '',
  '  const total=planned+unplanned;',
  '  $("plancount").textContent = unplanned',
  '    ? planned+" of "+total+" set. "+unplanned+" to go before this is finished."',
  '    : "Every trait has a rarity.";',
  '  const all=$("planseedall");',
  '  if(all){ all.hidden=!unplanned;',
  '    all.title="Give every trait that has no rarity the normal weight. Nothing about"',
  '      +" the collection changes - traits that are all equal were already equally likely."; }',
  '',
  '  body.innerHTML="";',
  '  for(const g of groups) body.appendChild(planGroup(g,items,wip));',
  '}',
  '',
  '/* One layer. The heading says how often the set appears at all, so the 100%',
  '   below it is plainly a share OF THE SET and not of every character - the',
  '   tile on the shelf shows that other number, and two figures for one trait',
  '   differing by a factor of 1/0.65 with nothing explaining the gap is how a',
  '   screen starts lying without a word of it being false. */',
  'function planGroup(g,items,wip){',
  '  const wrap=document.createElement("div");',
  '  wrap.className="plangrp";',
  '  const n=g.rows.length;',
  '  const head=document.createElement("div");',
  '  head.className="planhead";',
  '  const nm=document.createElement("b"); nm.textContent=g.layer;',
  '  const cnt=document.createElement("span");',
  '  cnt.textContent=n+(n===1?" trait":" traits");',
  '  const when=document.createElement("span");',
  '  const pres=layerPresence(g.layer);',
  '  when.textContent = g.off ? "turned off - nothing here is drawn"',
  '    : pres>=1 ? "on every character"',
  '    : "on "+Math.round(pres*100)+"% of characters";',
  '  head.appendChild(nm); head.appendChild(cnt); head.appendChild(when);',
  '  wrap.appendChild(head);',
  '',
  '  /* Sorted with the unplanned at the top, because they are the reason the',
  '     project is not finished, and then commonest first so the shape of the',
  '     set reads down the column. */',
  '  const tot=g.rows.reduce((a,t)=>a+traitWeight(t),0);',
  '  const sorted=g.rows.slice().sort((a,b)=>',
  '    (rarityPlanned(a)?1:0)-(rarityPlanned(b)?1:0)',
  '    || traitWeight(b)-traitWeight(a)',
  '    || String(a.name||"").localeCompare(String(b.name||"")));',
  '  const live=new Map(g.rows.map(t=>[t.id,traitWeight(t)]));',
  '  const cells=new Map();',
  '',
  '  /* Redraw every share in this set from the live weights. Pure arithmetic',
  '     over one layer - measured at 1ms against 2,025ms for the rule-aware',
  '     figure - which is what makes a slider that updates as it moves possible',
  '     at all. */',
  '  function repaint(){',
  '    let sum=0; for(const v of live.values()) sum+=v;',
  '    for(const [id,cell] of cells){',
  '      const share=live.get(id)/sum;',
  '      cell.share.textContent=pctLabel(share);',
  '      cell.say.textContent = cell.unset ? cell.unsetWords : multWords(n*share);',
  '    }',
  '  }',
  '',
  '  for(const t of sorted){',
  '    const row=document.createElement("div");',
  '    const isSet=rarityPlanned(t);',
  '    row.className="prow"+(isSet?"":" unset");',
  '    const name=document.createElement("div");',
  '    name.className="pname"; name.textContent=t.name||t.id; name.title=t.name||t.id;',
  '    const sl=document.createElement("input");',
  '    sl.type="range"; sl.min="0"; sl.max=String(POS_MAX); sl.step="1";',
  '    sl.setAttribute("aria-label","How rare "+(t.name||"this trait")+" should be");',
  '    const w0=traitWeight(t), O=tot-w0;',
  '    sl.value=String(posOfMult(n*(w0/tot),n));',
  '    /* One trait in a set is drawn every time the set appears, whatever any',
  '       slider says, and multHi equals multLo there so the track has no',
  '       length to drag along. Said rather than left looking broken. */',
  '    sl.disabled = n<2;',
  '    sl.title = n<2',
  '      ? "The only trait in this set, so it is drawn every time the set appears."',
  '      : "Drag right to make it rarer. The number beside it is this trait\'s share of "+g.layer+".";',
  '    const share=document.createElement("div"); share.className="pshare";',
  '    const say=document.createElement("div"); say.className="psay";',
  '    const unsetWords = n<2 ? "the only one in this set"',
  '      : "not set - give it a rarity to finish";',
  '    cells.set(t.id,{share:share, say:say, unset:!isSet, unsetWords:unsetWords});',
  '',
  '    if(n>1){',
  '      /* WHILE DRAGGING: nothing is written and nothing is re-rendered. A',
  '         dbPut and a renderShelf per tick would cost seconds a pixel. */',
  '      sl.oninput=()=>{',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        /* THE THUMB SNAPS TO THE WEIGHT THAT WILL ACTUALLY BE STORED. The',
  '           store holds 98 integers and the track has 20,000 positions, so',
  '           most positions round to a weight some neighbour also reaches -',
  '           without this the thumb rests somewhere the collection cannot be,',
  '           and lets go onto a different number than it showed. */',
  '        sl.value=String(posOfMult(n*(nw/(nw+O)),n));',
  '        live.set(t.id,nw);',
  '        /* The row stops being unset the moment it is dragged, so the words',
  '           beside it stop saying it needs one. */',
  '        const c=cells.get(t.id); if(c) c.unset=false;',
  '        row.classList.remove("unset");',
  '        repaint();',
  '      };',
  '      /* ON RELEASE: one record, one PATCH, then the panels that show this',
  '         number redraw so nothing on screen disagrees with the store. */',
  '      sl.onchange=async()=>{',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        if(await setRarity(t,nw)) await afterRarity();',
  '      };',
  '    }',
  '',
  '    row.appendChild(name); row.appendChild(sl);',
  '    row.appendChild(share); row.appendChild(say);',
  '    wrap.appendChild(row);',
  '  }',
  '  repaint();',
  '',
  '  const foot=document.createElement("p");',
  '  foot.className="plantot";',
  '  /* ASSERTED, not printed from the rounded numbers. Shares are w/Sum(w) so',
  '     they sum to one by construction - but a column of rounded percentages',
  '     does not, and printing their total would show 99% or 101% over a set',
  '     that is perfectly correct. So the exact sum is checked and the sentence',
  '     states the identity; if the identity ever fails, that is worth knowing',
  '     and is what the second sentence is for. */',
  '  let exact=0; for(const t of g.rows) exact+=traitWeight(t)/tot;',
  '  foot.textContent = Math.abs(exact-1)<1e-9',
  '    ? "These are all the outcomes for "+g.layer+", so they add up to 100%."',
  '    : "These shares add up to "+Math.round(exact*100)+"%, which cannot be right."',
  '      +" Do not trust this set until it is fixed.";',
  '  wrap.appendChild(foot);',
  '',
  '  const missing=g.rows.filter(t=>!rarityPlanned(t)).length;',
  '  if(missing && n>1){',
  '    const b=document.createElement("button");',
  '    b.className="mini";',
  '    b.textContent="Set the "+missing+" unplanned in "+g.layer+" to normal";',
  '    b.title="Gives them the normal weight. Nothing about the collection changes:"',
  '      +" traits that are all equal were already equally likely.";',
  '    b.onclick=async()=>{ await seedRarity(g.rows); };',
  '    wrap.appendChild(b);',
  '  }',
  '  return wrap;',
  '}',
  '',
  '/* Give every unplanned trait in a list the normal weight.',
  '',
  '   This is the one press that turns "257 to go" into a finished project when',
  '   the owner is happy for a set to be even, and it really does change',
  '   nothing: a set whose weights are all equal draws exactly as it did when',
  '   they were all the default. The toast says so, because a button that',
  '   rewrites 271 records ought to say what it did not do as well. */',
  'async function seedRarity(list){',
  '  const want=(list||[]).filter(t=>!rarityPlanned(t));',
  '  if(!want.length) return 0;',
  '  let done=0;',
  '  for(const t of want){ if(await setRarity(t,RAR_NORMAL)) done++; }',
  '  await afterRarity();',
  '  toast("Set "+done+" trait"+(done===1?"":"s")+" to normal."',
  '    +" Nothing about the collection changed.");',
  '  return done;',
  '}',
  '',
  '/* What has to catch up after a weight moves. The plan redraws itself, and',
  '   the shelf is asked to as well because its tiles carry the same number in',
  '   two other forms - the weight box and the share - and a panel that',
  '   disagrees with the one above it is worse than either being wrong alone. */',
  'async function afterRarity(){',
  '  await renderShelf();',
  '}',
]));

/* ---- render it, and wire the fold --------------------------------- */
swap('  buildLayerPanel(items);',
  '  buildLayerPanel(items);' + NL + '  renderPlan(items);');

swap(block([
  '(function(){',
  '  const h=$("projfold"); if(!h) return;',
  '  h.onclick=()=>projFold(!$("proj").classList.contains("folded"));',
  '  let want=false; try{ want=localStorage.getItem(PROJ_KEY)==="1"; }catch(_){}',
  '  projFold(want,false);',
  '})();',
]), block([
  '(function(){',
  '  const h=$("projfold"); if(!h) return;',
  '  h.onclick=()=>projFold(!$("proj").classList.contains("folded"));',
  '  let want=false; try{ want=localStorage.getItem(PROJ_KEY)==="1"; }catch(_){}',
  '  projFold(want,false);',
  '})();',
  '/* The same fold, for the plan. Its own storage key, because "I closed the',
  '   traits" and "I closed the plan" are two different choices. */',
  'const PLAN_KEY="chatnft.planfold";',
  'function planFold(on,remember){',
  '  const sec=$("plan"), h=$("planfold");',
  '  if(!sec) return;',
  '  sec.classList.toggle("folded",!!on);',
  '  if(h){',
  '    h.setAttribute("aria-expanded", on?"false":"true");',
  '    h.title = on ? "Show the rarity plan" : "Hide the rarity plan";',
  '  }',
  '  if(remember!==false){ try{ localStorage.setItem(PLAN_KEY, on?"1":"0"); }catch(_){} }',
  '}',
  '(function(){',
  '  const h=$("planfold"); if(!h) return;',
  '  h.onclick=()=>planFold(!$("plan").classList.contains("folded"));',
  '  const seed=$("planseedall");',
  '  if(seed) seed.onclick=async()=>{',
  '    const items=await dbAll();',
  '    const wip=!!($("cwip")&&$("cwip").checked);',
  '    const all=[];',
  '    for(const l of LAYERS){ if(HIDDEN_LAYERS.has(l)) continue;',
  '      for(const t of planRows(items,l,wip)) all.push(t); }',
  '    await seedRarity(all);',
  '  };',
  '  /* FOLDED BY DEFAULT, unlike the traits. A section of 271 sliders opening',
  '     itself over the shelf on every load is the panel burying its own tail,',
  '     which this file has already paid for once. */',
  '  let want=true; try{ const s=localStorage.getItem(PLAN_KEY); if(s!==null) want=s==="1"; }catch(_){}',
  '  planFold(want,false);',
  '})();',
]));

/* ---- the tile's number box tells the truth about 1 ----------------- */
swap("      rar.title='How often this is picked by Randomise and the sheet. 1 is normal, 5 is five times as likely.';",
  block([
  '      /* SUPERSEDES "1 is normal, 5 is five times as likely". 1 is not',
  '         normal, it is the database default and now means nobody has chosen -',
  '         which is what Plan rarity counts. Two controls over one field must',
  '         not say different things about it. */',
  "      rar.title='How often this is picked by Randomise and the sheet. '+RAR_NORMAL+' is normal,'",
  "        +' higher turns up more often, lower is rarer. 1 means nobody has set it yet.'",
  "        +' Plan rarity has a slider for this.';",
]));

/* ---- the tile's box goes through the same door --------------------- */
/* THE DEFECT THIS CHECK CAUGHT. The box wrote dbPut directly, so a weight
   typed on a tile never reached the group either - the same skip, the same
   "already up to date". One writer or the patch is bypassable by whichever
   control somebody happens to use. */
swap(block([
  '        /* rarity is not part of the id, so this updates in place rather than',
  '           creating a second record for the same trait. */',
  '        await dbPut({...t, rarity:v});',
  '        renderShelf();',
]), block([
  '        /* THROUGH setRarity, the same door the plan\'s sliders use. Writing',
  '           dbPut here directly is what kept a weight change out of the group:',
  '           the spread carries `synced` through, cloudPath does not depend on',
  '           the weight, so cloudPush skipped the row and said it was already',
  '           up to date. rarity is still not part of the id, so this updates in',
  '           place rather than creating a second record for the same trait. */',
  '        if(await setRarity(t,v)) await afterRarity();',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function cloudRarity(rec){', 'async function setRarity(rec,w){',
  'function renderPlan(items){', 'function planGroup(g,items,wip){',
  'async function seedRarity(list){', 'async function afterRarity(){',
  'function planFold(on,remember){', '  renderPlan(items);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The old tooltip claim must be gone - it is the one a new control contradicts. */
if (code.indexOf('1 is normal, 5 is five times as likely') >= 0)
  throw new Error('the stale weight tooltip survived');

/* The write path must go through setRarity, so the cloud patch cannot be
   bypassed by a second copy of dbPut-with-rarity. */
const writes = code.split('rarity:v}').length - 1;
/* setRarity is the only one now: the tile box calls it too. */
if (writes > 1) throw new Error('more than one place writes rarity directly: ' + writes);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
