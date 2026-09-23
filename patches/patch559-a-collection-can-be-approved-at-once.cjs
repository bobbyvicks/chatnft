/* A COLLECTION CAN BE APPROVED AT ONCE, AND THE WIP RULE IS SAID ONCE.

   Found 2026-09-22 by the discovery pass, ranked thirty-second of 39. The
   real collection folder has layer folders and no status folders, so all
   311 traits import as wip - a recorded decision - and wip is left out of
   the collection unless "include wip" is ticked in another panel, which
   reset on every load. The per-tile "never" and its reason, written for
   the excluded minority, then fired on all 311 tiles, and the only way to
   approve the collection was 311 presses of a status chip.

   THE PICK BAR SETS A STATUS. Pick the traits (Pick all shown), choose a
   status, Set status. Each trait goes through setTraitStatus - the one
   path the chip and the final page use, with its refusals: a trait that
   would land on one already holding that name and status is named and
   left alone, a card changed in another tab is left alone - and the shelf
   is drawn once at the end.

   THE WIP RULE IS SAID ONCE. When the reason a trait is never drawn is only
   that wip is left out, its tile keeps its "never" and loses the sentence;
   one line above the shelf counts them and carries the tick. Every other
   reason - rejected, a layer switched off - still says itself on its tile.

   INCLUDE WIP IS REMEMBERED, per project, on this device. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- the controls ---------------------------------------------------------- */
swap('        <button class="mini go" id="shelfpickmove" disabled>Move</button>', [
  '        <button class="mini go" id="shelfpickmove" disabled>Move</button>',
  '        <!-- A status for all of them: an imported collection arrives as wip,',
  '             and approving it was one chip press a trait. -->',
  '        <label for="shelfpickstatus" class="sr-only">Set the picked traits to</label>',
  '        <select id="shelfpickstatus" aria-label="Set the picked traits to">',
  '          <option value="approved">approved</option><option value="stfp">stfp</option>',
  '          <option value="wip">wip</option><option value="rejected">rejected</option>',
  '        </select>',
  '        <button class="mini go" id="shelfpickstatusgo" disabled>Set status</button>',
], 'the move button');
{
  const i = at('    <div id="projbody"></div>', 'the shelf body');
  kit.replace(L, { start: i, end: i }, [
    '    <!-- Said once, with the tick, when traits are left out only because',
    '         they are wip. -->',
    '    <p class="note" id="wipnote" hidden><span id="wipnotetext"></span>',
    '      <button class="mini" id="wipnoteinclude">Include wip</button></p>',
    '    <div id="projbody"></div>',
  ]);
}
{
  const fn = kit.inFunction(L, 'function shelfPickPaint(){');
  swap('    const mv=$("shelfpickmove"); if(mv) mv.disabled=!n;', [
    '    const mv=$("shelfpickmove"); if(mv) mv.disabled=!n;',
    '    const st=$("shelfpickstatusgo"); if(st) st.disabled=!n;',
  ], 'the paint', fn);
}

/* ---- the bulk status -------------------------------------------------------- */
{
  const i = at('/* The order the states happen in, and the one place that says so. */', 'the cycle');
  kit.replace(L, { start: i, end: i }, [
    '/* EVERY PICKED TRAIT TO ONE STATUS. Through setTraitStatus, one at a time,',
    '   because it is the path the chip and the final page take and it carries',
    '   the record, the draft, the hidden and picked keys and the group with',
    '   it; and it refuses what the chip refuses. Drawn once, at the end. */',
    'async function bulkSetStatus(next){',
    '  if(!next || STATUS_CYCLE.indexOf(next)<0) return;',
    '  if(shelfMoveBusy){ toast("Still moving the last batch"); return; }',
    '  const keys=[...shelfPick];',
    '  if(!keys.length){ toast("Pick some traits first"); return; }',
    '  shelfMoveBusy=true;',
    '  let changed=0, same=0, stale=0, notShared=0;',
    '  const clash=[];',
    '  try{',
    '    let items=[];',
    '    try{ items=await dbAll(); }catch(_){ toast("Could not read the project"); return; }',
    '    let done=0;',
    '    for(const key of keys){',
    '      const t=items.find(i=>i&&i.kind==="trait"&&shelfCore.recordKey(i)===key);',
    '      if(!t) continue;',
    '      const r=await setTraitStatus(t,next);',
    '      if(r.same) same++;',
    '      else if(r.clash) clash.push(t.name);',
    '      else if(r.stale) stale++;',
    '      else if(r.ok){ changed++; if(activeWs && !r.shared) notShared++; }',
    '      done++;',
    '      if(done%10===0){ const c=$("shelfpickcount"); if(c) c.textContent="Setting "+done+" of "+keys.length+"..."; }',
    '    }',
    '    await renderShelf();',
    '    const bits=[changed+" set to "+next];',
    '    if(same) bits.push(same+" already "+next);',
    '    if(clash.length) bits.push(clash.length+" left alone - "+next+" copies already exist: "+clash.slice(0,4).join(", ")',
    '      +(clash.length>4?" and "+(clash.length-4)+" more":""));',
    '    if(stale) bits.push(stale+" changed in another tab and left alone");',
    '    if(notShared) bits.push(notShared+" here only - press Save to cloud");',
    '    toast(bits.join("; "));',
    '  }finally{ shelfMoveBusy=false; shelfPickPaint(); }',
    '}',
    '/* The order the states happen in, and the one place that says so. */',
  ]);
}
swap("$('shelfpickmove').onclick=()=>bulkMoveToLayer($('shelfpicklayer').value);", [
  "$('shelfpickmove').onclick=()=>bulkMoveToLayer($('shelfpicklayer').value);",
  "$('shelfpickstatusgo').onclick=()=>bulkSetStatus($('shelfpickstatus').value);",
], 'the move handler');

/* ---- the wip rule said once, and remembered ---------------------------------- */
{
  const fnR = () => kit.inFunction(L, 'async function renderShelf(viewOnly){');
  swap('  const wipOn=!!($("cwip")&&$("cwip").checked);', [
    '  wipRemembered();',
    '  const wipOn=!!($("cwip")&&$("cwip").checked);',
    '  /* Left out only because they are wip: said once above the shelf. */',
    '  {',
    '    const n=wipOn ? 0 : items.filter(t=>t&&t.kind==="trait"&&(t.status||"wip")==="wip").length;',
    '    const note=$("wipnote");',
    '    if(note){',
    '      note.hidden=!n;',
    '      $("wipnotetext").textContent = n ? n+" trait"+(n===1?" is":"s are")+" wip, and wip is left out of the collection, so "',
    '        +(n===1?"it":"none of them")+" will be drawn. Include wip, or pick them and Set status to approved. " : "";',
    '    }',
    '  }',
  ], 'the wip read', fnR());
  const f = fnR();
  const i = at('          if(ch.why){', 'the reason', f);
  kit.replace(L, { start: i, end: i }, [
    '          /* Not when the only reason is the wip rule: that is said once,',
    '             above the shelf, rather than on every tile of an imported',
    '             collection. */',
    '          if(ch.why && !(!wipOn && (t.status||"wip")==="wip")){',
  ]);
}
{
  const i = at("$('cwip').onchange=()=>{ renderShelf(); };", 'the tick handler');
  kit.replace(L, { start: i, end: i }, [
    '/* INCLUDE WIP, REMEMBERED per project on this device. It reset on every',
    '   load, so a collection worked on as wip had to be re-ticked each visit.',
    '   Read on the first render of each project; written when it is changed. */',
    'let wipRememberedFor=null;',
    'function wipKey(){ return "pb.cwip."+wsDbName(); }',
    'function wipRemembered(){',
    '  const box=$("cwip"); if(!box) return;',
    '  if(wipRememberedFor===wsDbName()) return;',
    '  wipRememberedFor=wsDbName();',
    '  let v=null; try{ v=localStorage.getItem(wipKey()); }catch(_){ v=null; }',
    '  if(v!==null) box.checked = v==="1";',
    '}',
    "$('cwip').onchange=()=>{",
    '  try{ localStorage.setItem(wipKey(), $("cwip").checked?"1":"0"); }catch(_){}',
    '  wipRememberedFor=wsDbName();',
    '  renderShelf();',
    '};',
    "$('wipnoteinclude').onclick=()=>{ const b=$('cwip'); b.checked=true; b.onchange(); };",
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('async function bulkSetStatus(next){') !== 1) throw new Error('bulkSetStatus');
  if (times('wipRemembered()') !== 2) throw new Error('wipRemembered: ' + times('wipRemembered()'));
});

fs.renameSync(TMP, FILE);
console.log('patch559 written, ' + grew + ' bytes');
